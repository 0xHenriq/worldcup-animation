import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type LcpProbeState = {
  elementCurrentSrc: string | null;
  elementSize: number | null;
  elementTagName: string | null;
  renderTime: number | null;
  startTime: number | null;
};

type FpsBucket = {
  endMs: number;
  fps: number;
  frames: number;
  startMs: number;
};

type FpsProbeResult = {
  averageFps: number;
  buckets: FpsBucket[];
  durationMs: number;
  totalFrames: number;
};

type DrawCountSnapshot = {
  celebration: number;
  other: number;
  sparkle: number;
};

type CanvasDrawProbeState = {
  byClip: DrawCountSnapshot;
};

type BitmapProbeState = {
  closeCallCount: number;
  createCallCount: number;
  maxOpenBitmapBytes: number;
  openBitmapBytes: number;
  openBitmapCount: number;
};

type ActiveTierSnapshot = {
  celebration: string;
  sparkle: string;
};

type HeapUsageSnapshot = {
  totalSize: number;
  usedSize: number;
};

type HeroPerformanceWindow = Window & {
  __heroBitmapProbe?: BitmapProbeState;
  __heroCanvasDrawProbe?: CanvasDrawProbeState;
  __heroFpsProbe?: {
    buckets: number[];
    lastTimestamp: number | null;
    rafHandle: number | null;
    running: boolean;
    startTimestamp: number | null;
    totalFrames: number;
  };
  __heroLcpProbe?: LcpProbeState;
  __heroStartFpsProbe?: () => void;
  __heroStopFpsProbe?: () => FpsProbeResult;
};

const PERFORMANCE_TEST_TIMEOUT_MS = 120_000;
const PERFORMANCE_MEMORY_TEST_TIMEOUT_MS = 240_000;
const LCP_ASSERTION_MS = 2_000;
const FPS_ASSERTION = 50;
const FPS_SCROLL_DURATION_MS = 3_000;
const FPS_BUCKET_SIZE_MS = 500;
const LARGE_SINGLE_CLIP_BUDGET_MAX_BYTES = 220 * 1024 * 1024;
const LARGE_OVERLAP_BUDGET_MAX_BYTES = 380 * 1024 * 1024;
const MEDIUM_OVERLAP_BUDGET_MAX_BYTES = 96 * 1024 * 1024;
const HEAP_GROWTH_BUDGET_BYTES = 12 * 1024 * 1024;
const RUN_PRODUCTION_PERF = process.env.PLAYWRIGHT_RUN_PRODUCTION_PERF === "1";
const PRODUCTION_PERF_SKIP_REASON =
  "Performance probes require a production-backed server. Run with PLAYWRIGHT_RUN_PRODUCTION_PERF=1 or use pnpm test:e2e:perf.";

async function installPerformanceProbes(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fpsBucketSizeMs }) => {
      const performanceWindow = window as HeroPerformanceWindow;
      const bitmapMetadata = new WeakMap<ImageBitmap, { bytes: number; closed: boolean }>();

      performanceWindow.__heroLcpProbe = {
        elementCurrentSrc: null,
        elementSize: null,
        elementTagName: null,
        renderTime: null,
        startTime: null,
      };

      performanceWindow.__heroCanvasDrawProbe = {
        byClip: {
          celebration: 0,
          other: 0,
          sparkle: 0,
        },
      };

      performanceWindow.__heroFpsProbe = {
        buckets: [],
        lastTimestamp: null,
        rafHandle: null,
        running: false,
        startTimestamp: null,
        totalFrames: 0,
      };

      performanceWindow.__heroBitmapProbe = {
        closeCallCount: 0,
        createCallCount: 0,
        maxOpenBitmapBytes: 0,
        openBitmapBytes: 0,
        openBitmapCount: 0,
      };

      const portalCompositeLoadHandler = (event: Event) => {
          const probe = performanceWindow.__heroLcpProbe;
          const target = event.target;

          if (!probe || !(target instanceof HTMLImageElement)) {
            return;
          }

          const currentSrc = target.currentSrc || target.src;

          if (!currentSrc.includes("/hero/portal-composite.webp") || probe.startTime !== null) {
            return;
          }

          const rect = target.getBoundingClientRect();
          const area = Math.round(rect.width * rect.height);
          const timestamp = performance.now();

          probe.elementCurrentSrc = currentSrc;
          probe.elementSize = area > 0 ? area : null;
          probe.elementTagName = "img";
          probe.renderTime = timestamp;
          probe.startTime = timestamp;
          document.removeEventListener("load", portalCompositeLoadHandler, true);
      };

      document.addEventListener("load", portalCompositeLoadHandler, true);

      if (typeof PerformanceObserver === "function") {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const latestEntry = entries[entries.length - 1] as
            | (PerformanceEntry & {
                element?: Element | null;
                renderTime?: number;
                size?: number;
                startTime: number;
              })
            | undefined;

          if (!latestEntry) {
            return;
          }

          const element = latestEntry.element;
          const imageElement = element instanceof HTMLImageElement ? element : null;
          const probe = performanceWindow.__heroLcpProbe;

          if (!probe) {
            return;
          }

          probe.elementCurrentSrc = imageElement?.currentSrc ?? imageElement?.src ?? null;
          probe.elementSize = typeof latestEntry.size === "number" ? latestEntry.size : null;
          probe.elementTagName = element?.tagName?.toLowerCase() ?? null;
          probe.renderTime = typeof latestEntry.renderTime === "number" ? latestEntry.renderTime : null;
          probe.startTime = latestEntry.startTime;
        });

        observer.observe({ buffered: true, type: "largest-contentful-paint" });
      }

      const contextPrototype = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & {
        __heroOriginalDrawImage?: CanvasRenderingContext2D["drawImage"];
      };

      if (!contextPrototype.__heroOriginalDrawImage) {
        contextPrototype.__heroOriginalDrawImage = contextPrototype.drawImage;
        const originalDrawImage = contextPrototype.__heroOriginalDrawImage as (
          this: CanvasRenderingContext2D,
          ...drawArgs: unknown[]
        ) => unknown;

        contextPrototype.drawImage = (function patchedDrawImage(this: CanvasRenderingContext2D, ...args: unknown[]) {
          const probe = performanceWindow.__heroCanvasDrawProbe;
          const clip = this.canvas?.dataset?.clip;

          if (probe) {
            if (clip === "celebration" || clip === "sparkle") {
              probe.byClip[clip] += 1;
            } else {
              probe.byClip.other += 1;
            }
          }

          return Reflect.apply(originalDrawImage, this, args);
        }) as CanvasRenderingContext2D["drawImage"];
      }

      if (typeof globalThis.createImageBitmap === "function" && typeof ImageBitmap !== "undefined") {
        const bitmapPrototype = ImageBitmap.prototype as ImageBitmap & {
          __heroOriginalClose?: ImageBitmap["close"];
        };

        if (!bitmapPrototype.__heroOriginalClose) {
          bitmapPrototype.__heroOriginalClose = bitmapPrototype.close;
          const originalClose = bitmapPrototype.__heroOriginalClose;

          bitmapPrototype.close = function patchedClose(this: ImageBitmap): void {
            const probe = performanceWindow.__heroBitmapProbe;
            const metadata = bitmapMetadata.get(this);

            if (probe && metadata && !metadata.closed) {
              metadata.closed = true;
              probe.closeCallCount += 1;
              probe.openBitmapCount = Math.max(0, probe.openBitmapCount - 1);
              probe.openBitmapBytes = Math.max(0, probe.openBitmapBytes - metadata.bytes);
            }

            return Reflect.apply(originalClose, this, []);
          };
        }

        const originalCreateImageBitmap = globalThis.createImageBitmap.bind(globalThis);

        globalThis.createImageBitmap = (async (...args: Parameters<typeof originalCreateImageBitmap>) => {
          const bitmap = await originalCreateImageBitmap(...args);
          const probe = performanceWindow.__heroBitmapProbe;
          const bytes = bitmap.width * bitmap.height * 4;

          bitmapMetadata.set(bitmap, { bytes, closed: false });

          if (probe) {
            probe.createCallCount += 1;
            probe.openBitmapCount += 1;
            probe.openBitmapBytes += bytes;
            probe.maxOpenBitmapBytes = Math.max(probe.maxOpenBitmapBytes, probe.openBitmapBytes);
          }

          return bitmap;
        }) as typeof globalThis.createImageBitmap;
      }

      performanceWindow.__heroStartFpsProbe = () => {
        const probe = performanceWindow.__heroFpsProbe;

        if (!probe || probe.running) {
          return;
        }

        probe.buckets = [];
        probe.lastTimestamp = null;
        probe.rafHandle = null;
        probe.running = true;
        probe.startTimestamp = null;
        probe.totalFrames = 0;

        const tick = (timestamp: number) => {
          if (!probe.running) {
            return;
          }

          if (probe.startTimestamp === null) {
            probe.startTimestamp = timestamp;
          }

          probe.totalFrames += 1;
          probe.lastTimestamp = timestamp;

          const bucketIndex = Math.max(
            0,
            Math.floor((timestamp - probe.startTimestamp) / fpsBucketSizeMs),
          );

          probe.buckets[bucketIndex] = (probe.buckets[bucketIndex] ?? 0) + 1;
          probe.rafHandle = window.requestAnimationFrame(tick);
        };

        probe.rafHandle = window.requestAnimationFrame(tick);
      };

      performanceWindow.__heroStopFpsProbe = () => {
        const probe = performanceWindow.__heroFpsProbe;

        if (!probe) {
          return {
            averageFps: 0,
            buckets: [] as FpsBucket[],
            durationMs: 0,
            totalFrames: 0,
          };
        }

        probe.running = false;

        if (probe.rafHandle !== null) {
          window.cancelAnimationFrame(probe.rafHandle);
          probe.rafHandle = null;
        }

        const durationMs = Math.max(
          0,
          (probe.lastTimestamp ?? probe.startTimestamp ?? 0) - (probe.startTimestamp ?? 0),
        );
        const averageFps = durationMs > 0 ? probe.totalFrames / (durationMs / 1_000) : 0;
        const buckets = probe.buckets.map((frames, index) => ({
          endMs: (index + 1) * fpsBucketSizeMs,
          fps: frames / (fpsBucketSizeMs / 1_000),
          frames,
          startMs: index * fpsBucketSizeMs,
        }));

        return {
          averageFps,
          buckets,
          durationMs,
          totalFrames: probe.totalFrames,
        };
      };
    },
    { fpsBucketSizeMs: FPS_BUCKET_SIZE_MS },
  );
}

async function waitForEnhancedHeroStableState(page: Page): Promise<void> {
  await page.locator(".hero-root").waitFor();
  await page.waitForFunction(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const staticBranch = document.querySelector<HTMLElement>(
      ".hero-root > .hero-static[data-branch='static']",
    );
    const enhancedShell = document.querySelector<HTMLElement>(
      ".hero-root > .hero-shell[data-branch='enhanced']",
    );
    const enhancedStage = document.querySelector<HTMLElement>(".hero-enhanced-stage");

    return (
      heroRoot?.dataset.enhancedReady === "true" &&
      enhancedStage?.getAttribute("data-enhanced-ready") === "true" &&
      staticBranch !== null &&
      enhancedShell !== null &&
      window.getComputedStyle(staticBranch).display === "none" &&
      window.getComputedStyle(enhancedShell).display === "block"
    );
  });
}

async function warmHeroRouteCompilation(page: Page, baseURL: string | undefined): Promise<void> {
  const browser = page.context().browser();

  if (!browser || !baseURL) {
    return;
  }

  const warmupContext = await browser.newContext({ baseURL });
  const warmupPage = await warmupContext.newPage();

  try {
    await warmupPage.goto("/");
    await warmupPage.locator(".hero-root").waitFor();
  } finally {
    await warmupContext.close();
  }
}

async function readLcpProbe(page: Page): Promise<LcpProbeState> {
  return page.evaluate(() => {
    return (
      (window as Window & { __heroLcpProbe?: LcpProbeState }).__heroLcpProbe ?? {
        elementCurrentSrc: null,
        elementSize: null,
        elementTagName: null,
        renderTime: null,
        startTime: null,
      }
    );
  });
}

async function readCanvasDrawProbe(page: Page): Promise<DrawCountSnapshot> {
  return page.evaluate(() => {
    return (
      (window as Window & { __heroCanvasDrawProbe?: CanvasDrawProbeState }).__heroCanvasDrawProbe
        ?.byClip ?? {
        celebration: 0,
        other: 0,
        sparkle: 0,
      }
    );
  });
}

async function readBitmapProbe(page: Page): Promise<BitmapProbeState> {
  return page.evaluate(() => {
    return (
      (window as HeroPerformanceWindow).__heroBitmapProbe ?? {
        closeCallCount: 0,
        createCallCount: 0,
        maxOpenBitmapBytes: 0,
        openBitmapBytes: 0,
        openBitmapCount: 0,
      }
    );
  });
}

async function readActiveTiers(page: Page): Promise<ActiveTierSnapshot> {
  return page.evaluate(() => {
    const readTier = (selector: string) =>
      document.querySelector<HTMLCanvasElement>(selector)?.dataset.activeTier ?? "none";

    return {
      celebration: readTier("[data-layer='celebration'] canvas[data-clip='celebration']"),
      sparkle: readTier("[data-layer='sparkle'] canvas[data-clip='sparkle']"),
    };
  });
}

async function startFpsProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as HeroPerformanceWindow
    ).__heroStartFpsProbe?.();
  });
}

async function stopFpsProbe(page: Page): Promise<FpsProbeResult> {
  return page.evaluate(() => {
    return (
      (window as HeroPerformanceWindow).__heroStopFpsProbe?.() ?? {
        averageFps: 0,
        buckets: [],
        durationMs: 0,
        totalFrames: 0,
      }
    );
  });
}

async function scrollThroughHero(page: Page, durationMs: number): Promise<void> {
  await page.evaluate(async (requestedDurationMs) => {
    const heroScroll = document.querySelector<HTMLElement>(".hero-scroll");

    if (!heroScroll) {
      throw new Error("Could not find .hero-scroll for performance sweep.");
    }

    const rect = heroScroll.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const startY = window.scrollY + rect.top;
    const scrollDistance = Math.max(0, rect.height - viewportHeight);

    await new Promise<void>((resolve) => {
      const animationStart = performance.now();

      const step = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - animationStart) / requestedDurationMs);
        window.scrollTo(0, startY + scrollDistance * progress);

        if (progress >= 1) {
          resolve();
          return;
        }

        window.requestAnimationFrame(step);
      };

      window.requestAnimationFrame(step);
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, durationMs);
}

function hasPortalCompositeLcp(snapshot: LcpProbeState): boolean {
  if (!snapshot.elementCurrentSrc) {
    return false;
  }

  return snapshot.elementCurrentSrc.includes("/hero/portal-composite.webp");
}

async function waitForActiveTiers(
  page: Page,
  expected: Partial<ActiveTierSnapshot>,
): Promise<ActiveTierSnapshot> {
  await expect
    .poll(async () => {
      const tiers = await readActiveTiers(page);

      return Object.entries(expected).every(([clip, tier]) => {
        if (clip === "celebration") {
          return tiers.celebration === tier;
        }

        if (clip === "sparkle") {
          return tiers.sparkle === tier;
        }

        return false;
      });
    }, {
      message: `Expected active tiers ${JSON.stringify(expected)} to settle`,
      timeout: 20_000,
    })
    .toBe(true);

  return readActiveTiers(page);
}

async function collectHeapUsage(page: Page): Promise<HeapUsageSnapshot> {
  const session = await page.context().newCDPSession(page);

  await session.send("HeapProfiler.enable");
  await session.send("HeapProfiler.collectGarbage");

  const snapshot = (await session.send("Runtime.getHeapUsage")) as HeapUsageSnapshot;

  await session.detach();

  return snapshot;
}

test.describe("Hero performance metrics", () => {
  test.skip(!RUN_PRODUCTION_PERF, PRODUCTION_PERF_SKIP_REASON);

  test("captures LCP, frame-rate, and draw-call metrics across the full hero scroll", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(PERFORMANCE_TEST_TIMEOUT_MS);

    await installPerformanceProbes(page);
    await warmHeroRouteCompilation(page, testInfo.project.use.baseURL as string | undefined);

    await logger.step("Navigate to the hero page and wait for the enhanced branch");
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);
    await page.waitForTimeout(1_000);

    const lcpSnapshot = await readLcpProbe(page);

    await logger.step("Log LCP probe snapshot");
    logger.expect("LCP element tag", lcpSnapshot.elementTagName, lcpSnapshot.elementTagName);
    logger.expect("LCP element src", lcpSnapshot.elementCurrentSrc, lcpSnapshot.elementCurrentSrc);
    logger.expect("LCP element size", lcpSnapshot.elementSize, lcpSnapshot.elementSize);
    logger.expect("LCP start time", lcpSnapshot.startTime, lcpSnapshot.startTime);

    expect(lcpSnapshot.startTime).not.toBeNull();
    expect(lcpSnapshot.startTime ?? Number.POSITIVE_INFINITY).toBeLessThan(LCP_ASSERTION_MS);
    expect(lcpSnapshot.elementTagName).toBe("img");
    expect(hasPortalCompositeLcp(lcpSnapshot)).toBe(true);

    await logger.step("Measure frame rate while scrolling through the hero over three seconds");
    await scrollToProgress(page, 0);
    await startFpsProbe(page);
    await scrollThroughHero(page, FPS_SCROLL_DURATION_MS);
    const fpsResult = await stopFpsProbe(page);

    await logger.step("Log FPS metrics");
    logger.expect("FPS duration ms", fpsResult.durationMs, fpsResult.durationMs);
    logger.expect("FPS total frames", fpsResult.totalFrames, fpsResult.totalFrames);
    logger.expect("FPS average", fpsResult.averageFps, fpsResult.averageFps);
    logger.expect("FPS buckets", fpsResult.buckets, fpsResult.buckets);

    expect(fpsResult.durationMs).toBeGreaterThan(2_500);
    expect(fpsResult.averageFps).toBeGreaterThan(FPS_ASSERTION);
    expect(fpsResult.buckets.length).toBeGreaterThanOrEqual(5);

    await logger.step("Verify celebration draw calls stop after the celebration phase fades out");
    await scrollToProgress(page, 0.5);
    await page.waitForTimeout(250);
    const celebrationActiveCounts = await readCanvasDrawProbe(page);

    expect(celebrationActiveCounts.celebration).toBeGreaterThan(0);

    await scrollToProgress(page, 0.62);
    await page.waitForTimeout(400);
    const preCelebrationStopCounts = await readCanvasDrawProbe(page);

    await scrollToProgress(page, 0.72);
    await page.waitForTimeout(250);
    const postCelebrationStopCounts = await readCanvasDrawProbe(page);

    logger.expect(
      "draw counts during celebration",
      celebrationActiveCounts,
      celebrationActiveCounts,
    );
    logger.expect(
      "draw counts immediately after celebration hide",
      preCelebrationStopCounts,
      preCelebrationStopCounts,
    );
    logger.expect(
      "draw counts later after celebration hide",
      postCelebrationStopCounts,
      postCelebrationStopCounts,
    );

    expect(postCelebrationStopCounts.celebration).toBe(preCelebrationStopCounts.celebration);

    await logger.step("Verify sparkle draw calls stop after the sparkle phase hides");
    const sparkleActiveCounts = postCelebrationStopCounts;

    expect(sparkleActiveCounts.sparkle).toBeGreaterThan(0);

    await scrollToProgress(page, 0.82);
    await page.waitForTimeout(400);
    const preSparkleStopCounts = await readCanvasDrawProbe(page);

    await scrollToProgress(page, 0.9);
    await page.waitForTimeout(250);
    const postSparkleStopCounts = await readCanvasDrawProbe(page);

    logger.expect("draw counts during sparkle", sparkleActiveCounts, sparkleActiveCounts);
    logger.expect("draw counts immediately after sparkle hide", preSparkleStopCounts, preSparkleStopCounts);
    logger.expect("draw counts after sparkle stop", postSparkleStopCounts, postSparkleStopCounts);

    expect(postSparkleStopCounts.sparkle).toBe(preSparkleStopCounts.sparkle);
  });

  test("tracks bitmap window memory, close activity, and bounded heap usage", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(PERFORMANCE_MEMORY_TEST_TIMEOUT_MS);

    await installPerformanceProbes(page);

    await logger.step("Profile large-tier bitmap memory with celebration-only and overlap states");
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);

    await scrollToProgress(page, 0.2);
    const largeCelebrationTier = await waitForActiveTiers(page, { celebration: "large" });
    await page.waitForTimeout(500);
    const largeSingleClipProbe = await readBitmapProbe(page);

    logger.expect("large celebration tier", largeCelebrationTier, largeCelebrationTier);
    logger.expect("large single-clip bitmap probe", largeSingleClipProbe, largeSingleClipProbe);

    expect(largeSingleClipProbe.openBitmapBytes).toBeGreaterThan(0);
    expect(largeSingleClipProbe.openBitmapBytes).toBeLessThanOrEqual(
      LARGE_SINGLE_CLIP_BUDGET_MAX_BYTES,
    );

    await scrollToProgress(page, 0.5);
    const largeOverlapTiers = await waitForActiveTiers(page, {
      celebration: "large",
      sparkle: "large",
    });
    await page.waitForTimeout(1_000);
    const largeOverlapProbe = await readBitmapProbe(page);

    logger.expect("large overlap tiers", largeOverlapTiers, largeOverlapTiers);
    logger.expect("large overlap bitmap probe", largeOverlapProbe, largeOverlapProbe);

    expect(largeOverlapProbe.openBitmapBytes).toBeGreaterThan(largeSingleClipProbe.openBitmapBytes);
    expect(largeOverlapProbe.openBitmapBytes).toBeLessThanOrEqual(LARGE_OVERLAP_BUDGET_MAX_BYTES);

    await scrollToProgress(page, 0.9);
    await page.waitForTimeout(1_000);
    const postEvictionProbe = await readBitmapProbe(page);

    logger.expect("post-eviction bitmap probe", postEvictionProbe, postEvictionProbe);

    expect(postEvictionProbe.closeCallCount).toBeGreaterThan(0);
    expect(postEvictionProbe.openBitmapBytes).toBeLessThan(largeOverlapProbe.openBitmapBytes);

    await logger.step("Repeat hero navigations at a medium-tier viewport and check heap stability");
    await page.setViewportSize({ width: 900, height: 600 });

    const heapSamples: number[] = [];

    for (let iteration = 0; iteration < 3; iteration += 1) {
      await page.goto(`/?memory-pass=${iteration + 1}`);
      await waitForEnhancedHeroStableState(page);
      await scrollToProgress(page, 0.5);
      const mediumOverlapTiers = await waitForActiveTiers(page, {
        celebration: "medium",
        sparkle: "medium",
      });
      await page.waitForTimeout(750);
      const mediumOverlapProbe = await readBitmapProbe(page);
      const heapSnapshot = await collectHeapUsage(page);

      logger.expect(
        `medium overlap tiers pass ${iteration + 1}`,
        mediumOverlapTiers,
        mediumOverlapTiers,
      );
      logger.expect(
        `medium overlap bitmap probe pass ${iteration + 1}`,
        mediumOverlapProbe,
        mediumOverlapProbe,
      );
      logger.expect(`heap snapshot pass ${iteration + 1}`, heapSnapshot, heapSnapshot);

      expect(mediumOverlapProbe.openBitmapBytes).toBeGreaterThan(0);
      expect(mediumOverlapProbe.openBitmapBytes).toBeLessThanOrEqual(
        MEDIUM_OVERLAP_BUDGET_MAX_BYTES,
      );

      heapSamples.push(heapSnapshot.usedSize);
    }

    logger.expect("heap samples", heapSamples, heapSamples);

    expect(Math.max(...heapSamples) - Math.min(...heapSamples)).toBeLessThanOrEqual(
      HEAP_GROWTH_BUDGET_BYTES,
    );
  });
});
