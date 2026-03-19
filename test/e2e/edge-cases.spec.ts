import { expect, test, type Page, type Route } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type CanvasPatchSample = {
  a: number;
  b: number;
  g: number;
  r: number;
};

type HeroEdgeCaseSnapshot = {
  activeTier: string;
  canvasHeight: number;
  canvasWidth: number;
  centerSample: CanvasPatchSample;
  fillerVisible: boolean;
  frameIndex: number;
  goldenFlashVisible: boolean;
  heroScrollProgress: number;
  leftSample: CanvasPatchSample;
  opaquePatchCount: number;
  portalActive: boolean;
  posterVisible: boolean;
  rightSample: CanvasPatchSample;
  shootingStarVisible: boolean;
  stageBottom: number;
  stageTop: number;
  topSample: CanvasPatchSample;
  trophyLensFlareVisible: boolean;
  viewportHeight: number;
};

async function waitForEnhancedHeroReady(page: Page): Promise<void> {
  await page.locator(".hero-root").waitFor();
  await page.waitForFunction(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const enhancedStage = document.querySelector<HTMLElement>(".hero-enhanced-stage");

    return (
      heroRoot?.dataset.enhancedReady === "true" &&
      enhancedStage?.getAttribute("data-enhanced-ready") === "true"
    );
  });
}

async function readHeroEdgeCaseSnapshot(page: Page): Promise<HeroEdgeCaseSnapshot> {
  return page.evaluate(() => {
    const clampNumber = (value: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, value));
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const heroStage = document.querySelector<HTMLElement>(".hero-stage");
    const celebrationCanvas = document.querySelector<HTMLCanvasElement>(
      "[data-layer='celebration'] canvas[data-clip='celebration']",
    );
    const goldenFlash = document.querySelector<HTMLElement>("[data-layer='golden-flash-overlay']");
    const portalLayer = document.querySelector<HTMLElement>("[data-layer='portal-layer']");
    const posterLayer = document.querySelector<HTMLElement>("[data-layer='poster']");
    const filler = document.querySelector<HTMLElement>("#hero-edge-case-probe");

    const samplePatchAtRatio = (
      horizontalRatio: number,
      verticalRatio: number,
    ): CanvasPatchSample => {
      if (!celebrationCanvas || celebrationCanvas.width <= 0 || celebrationCanvas.height <= 0) {
        return { a: 0, b: 0, g: 0, r: 0 };
      }

      const context = celebrationCanvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return { a: 0, b: 0, g: 0, r: 0 };
      }

      const patchSize = 3;
      const halfPatch = Math.floor(patchSize / 2);
      const patchX = clampNumber(
        Math.round((celebrationCanvas.width - 1) * horizontalRatio) - halfPatch,
        0,
        Math.max(0, celebrationCanvas.width - patchSize),
      );
      const patchY = clampNumber(
        Math.round((celebrationCanvas.height - 1) * verticalRatio) - halfPatch,
        0,
        Math.max(0, celebrationCanvas.height - patchSize),
      );
      const imageData = context.getImageData(
        patchX,
        patchY,
        Math.min(patchSize, celebrationCanvas.width),
        Math.min(patchSize, celebrationCanvas.height),
      );
      const totals = { a: 0, b: 0, g: 0, r: 0 };
      const sampleCount = Math.max(1, imageData.data.length / 4);

      for (let index = 0; index < imageData.data.length; index += 4) {
        totals.r += imageData.data[index] ?? 0;
        totals.g += imageData.data[index + 1] ?? 0;
        totals.b += imageData.data[index + 2] ?? 0;
        totals.a += imageData.data[index + 3] ?? 0;
      }

      return {
        a: Math.round(totals.a / sampleCount),
        b: Math.round(totals.b / sampleCount),
        g: Math.round(totals.g / sampleCount),
        r: Math.round(totals.r / sampleCount),
      };
    };

    const centerSample = samplePatchAtRatio(0.5, 0.5);
    const leftSample = samplePatchAtRatio(0.2, 0.5);
    const rightSample = samplePatchAtRatio(0.8, 0.5);
    const topSample = samplePatchAtRatio(0.5, 0.2);
    const patchSamples = [centerSample, leftSample, rightSample, topSample];
    const stageRect = heroStage?.getBoundingClientRect();
    const fillerRect = filler?.getBoundingClientRect();
    const posterStyle = posterLayer ? window.getComputedStyle(posterLayer) : null;

    return {
      activeTier: celebrationCanvas?.dataset.activeTier ?? "none",
      canvasHeight: celebrationCanvas?.height ?? 0,
      canvasWidth: celebrationCanvas?.width ?? 0,
      centerSample,
      fillerVisible:
        Boolean(fillerRect) &&
        Boolean(fillerRect && fillerRect.bottom > 0 && fillerRect.top < (window.innerHeight || 0)),
      frameIndex: Number.parseInt(celebrationCanvas?.dataset.frameIndex ?? "-1", 10),
      goldenFlashVisible:
        goldenFlash !== null && Number.parseFloat(window.getComputedStyle(goldenFlash).opacity) > 0.001,
      heroScrollProgress: Number.parseFloat(heroRoot?.dataset.heroScrollProgress ?? "0"),
      leftSample,
      opaquePatchCount: patchSamples.filter((sample) => sample.a > 0).length,
      portalActive: portalLayer?.dataset.portalActive === "true",
      posterVisible:
        posterStyle !== null &&
        posterStyle.display !== "none" &&
        posterStyle.visibility !== "hidden" &&
        Number.parseFloat(posterStyle.opacity) > 0.001,
      rightSample,
      shootingStarVisible: Boolean(document.querySelector("[data-layer='shooting-star']")),
      stageBottom: stageRect?.bottom ?? 0,
      stageTop: stageRect?.top ?? 0,
      topSample,
      trophyLensFlareVisible: Boolean(document.querySelector("[data-layer='trophy-lens-flare']")),
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  });
}

async function expectProgressNear(
  page: Page,
  targetProgress: number,
  label: string,
  tolerance = 0.05,
): Promise<HeroEdgeCaseSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readHeroEdgeCaseSnapshot(page);

      return Math.abs(snapshot.heroScrollProgress - targetProgress);
    }, {
      message: `${label}: hero scroll progress should settle near ${targetProgress.toFixed(2)}`,
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(tolerance);

  return readHeroEdgeCaseSnapshot(page);
}

async function waitForSnapshot(
  page: Page,
  predicate: (snapshot: HeroEdgeCaseSnapshot) => boolean,
  message: string,
  timeout: number,
): Promise<HeroEdgeCaseSnapshot> {
  let matchedSnapshot: HeroEdgeCaseSnapshot | null = null;

  await expect
    .poll(async () => {
      const snapshot = await readHeroEdgeCaseSnapshot(page);

      if (predicate(snapshot)) {
        matchedSnapshot = snapshot;
        return true;
      }

      return false;
    }, {
      message,
      timeout,
    })
    .toBe(true);

  if (!matchedSnapshot) {
    throw new Error(message);
  }

  return matchedSnapshot;
}

async function logSnapshot(
  logger: ReturnType<typeof createTestLogger>,
  label: string,
  snapshot: HeroEdgeCaseSnapshot,
): Promise<void> {
  await logger.step(`${label}: edge-case snapshot`);
  logger.expect(`${label}: progress`, snapshot.heroScrollProgress, snapshot.heroScrollProgress);
  logger.expect(`${label}: active tier`, snapshot.activeTier, snapshot.activeTier);
  logger.expect(`${label}: frame index`, snapshot.frameIndex, snapshot.frameIndex);
  logger.expect(
    `${label}: canvas size`,
    `${snapshot.canvasWidth}x${snapshot.canvasHeight}`,
    `${snapshot.canvasWidth}x${snapshot.canvasHeight}`,
  );
  logger.expect(`${label}: center sample`, snapshot.centerSample, snapshot.centerSample);
  logger.expect(`${label}: left sample`, snapshot.leftSample, snapshot.leftSample);
  logger.expect(`${label}: right sample`, snapshot.rightSample, snapshot.rightSample);
  logger.expect(`${label}: top sample`, snapshot.topSample, snapshot.topSample);
  logger.expect(`${label}: opaque patch count`, snapshot.opaquePatchCount, snapshot.opaquePatchCount);
  logger.expect(`${label}: portal active`, snapshot.portalActive, snapshot.portalActive);
  logger.expect(`${label}: poster visible`, snapshot.posterVisible, snapshot.posterVisible);
  logger.expect(`${label}: golden flash visible`, snapshot.goldenFlashVisible, snapshot.goldenFlashVisible);
  logger.expect(`${label}: shooting star visible`, snapshot.shootingStarVisible, snapshot.shootingStarVisible);
  logger.expect(
    `${label}: trophy lens flare visible`,
    snapshot.trophyLensFlareVisible,
    snapshot.trophyLensFlareVisible,
  );
  logger.expect(`${label}: stage top`, snapshot.stageTop, snapshot.stageTop);
  logger.expect(`${label}: stage bottom`, snapshot.stageBottom, snapshot.stageBottom);
  logger.expect(`${label}: filler visible`, snapshot.fillerVisible, snapshot.fillerVisible);
}

async function ensureBelowHeroProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector("main");

    if (!main || document.getElementById("hero-edge-case-probe")) {
      return;
    }

    const probe = document.createElement("section");
    probe.id = "hero-edge-case-probe";
    probe.tabIndex = -1;
    probe.textContent = "Below hero probe content";
    probe.style.minHeight = "200vh";
    probe.style.padding = "32px";
    probe.style.background = "linear-gradient(180deg, #f6edd6 0%, #e8dcc0 100%)";
    main.appendChild(probe);
  });
}

test.describe("Hero edge cases", () => {
  test("rapid scrubbing keeps celebration non-blank and reverse scrubbing does not replay one-shots", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(90_000);

    await page.goto("/");
    await waitForEnhancedHeroReady(page);

    await logger.step("Rapidly scrub into the celebration range and verify the hero stays visually non-blank");
    await scrollToProgress(page, 0.5);
    await expectProgressNear(page, 0.5, "fast-scrub-celebration");
    await expect
      .poll(async () => {
        const snapshot = await readHeroEdgeCaseSnapshot(page);

        return (
          snapshot.posterVisible || snapshot.activeTier !== "none" || snapshot.opaquePatchCount > 0
        );
      }, {
        message: "Expected the celebration phase to remain visually non-blank after a fast scrub",
        timeout: 15_000,
      })
      .toBe(true);

    const celebrationSnapshot = await readHeroEdgeCaseSnapshot(page);
    await logSnapshot(logger, "fast-scrub-celebration", celebrationSnapshot);

    expect(celebrationSnapshot.frameIndex).toBeGreaterThanOrEqual(0);

    await logger.step("Jump to the end of the hero, then scrub back into the flash band");
    await scrollToProgress(page, 0.97);
    await expectProgressNear(page, 0.97, "post-forward-scrub");
    await scrollToProgress(page, 0.11);
    await page.waitForTimeout(300);

    const reverseSnapshot = await expectProgressNear(page, 0.11, "reverse-scrub");
    await logSnapshot(logger, "reverse-scrub", reverseSnapshot);

    expect(reverseSnapshot.portalActive).toBe(true);
    expect(reverseSnapshot.goldenFlashVisible).toBe(false);
    expect(reverseSnapshot.shootingStarVisible).toBe(false);
    expect(reverseSnapshot.trophyLensFlareVisible).toBe(false);
    expect(Math.abs(reverseSnapshot.stageTop)).toBeLessThanOrEqual(1);
  });

  test("upgrading from thumb to higher tiers redraws the celebration canvas without changing the frame index", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);
    let releaseLargeTier!: () => void;
    const largeTierHold = new Promise<void>((resolve) => {
      releaseLargeTier = () => {
        resolve();
      };
    });

    await page.route(/\/hero\/frames\/celebration\/large\/\d{4}\.webp$/, async (route: Route) => {
      await largeTierHold;
      await route.continue();
    });

    await page.goto("/");
    await waitForEnhancedHeroReady(page);

    await logger.step("Scroll to celebration while large-tier requests are held so thumb wins first");
    await scrollToProgress(page, 0.5);

    const thumbSnapshot = await waitForSnapshot(
      page,
      (snapshot) => snapshot.activeTier === "thumb" && snapshot.frameIndex >= 0,
      "Expected celebration canvas to render from the thumb tier before large-tier release",
      20_000,
    );

    await logSnapshot(logger, "thumb-before-upgrade", thumbSnapshot);

    await logger.step("Release large-tier requests and verify the tier upgrade redraw");
    releaseLargeTier();

    const upgradedSnapshot = await waitForSnapshot(
      page,
      (snapshot) =>
        snapshot.activeTier === "large" &&
        snapshot.frameIndex === thumbSnapshot.frameIndex &&
        snapshot.canvasWidth >= thumbSnapshot.canvasWidth &&
        snapshot.canvasHeight >= thumbSnapshot.canvasHeight,
      "Expected celebration canvas to upgrade from thumb to large without changing frame index",
      20_000,
    );

    await logSnapshot(logger, "upgraded-tier", upgradedSnapshot);

    expect(upgradedSnapshot.frameIndex).toBe(thumbSnapshot.frameIndex);
    expect(upgradedSnapshot.activeTier).toBe("large");
    expect(
      upgradedSnapshot.canvasWidth > thumbSnapshot.canvasWidth ||
        upgradedSnapshot.canvasHeight > thumbSnapshot.canvasHeight,
    ).toBe(true);
  });

  test("deep landing initializes correctly and the sticky stage releases when scrolling past the hero", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(90_000);

    await page.goto("/");
    await waitForEnhancedHeroReady(page);

    await logger.step("Scroll near the trophy reveal, reload from that position, and verify mid-page restore");
    await scrollToProgress(page, 0.9);
    const preReloadSnapshot = await expectProgressNear(page, 0.9, "pre-reload-deep-landing");
    await logSnapshot(logger, "pre-reload-deep-landing", preReloadSnapshot);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEnhancedHeroReady(page);

    const deepLandingSnapshot = await expectProgressNear(page, 0.9, "deep-landing");
    await logSnapshot(logger, "deep-landing", deepLandingSnapshot);

    expect(deepLandingSnapshot.portalActive).toBe(false);
    expect(deepLandingSnapshot.goldenFlashVisible).toBe(false);
    expect(deepLandingSnapshot.shootingStarVisible).toBe(false);
    expect(deepLandingSnapshot.trophyLensFlareVisible).toBe(false);

    await logger.step("Scroll beyond the hero into injected below-content and verify stage release");
    await ensureBelowHeroProbe(page);
    await page.getByText("Below hero probe content").scrollIntoViewIfNeeded();

    await expect
      .poll(async () => {
        const snapshot = await readHeroEdgeCaseSnapshot(page);

        return snapshot.fillerVisible && snapshot.stageTop < 0;
      }, {
        message: "Expected sticky stage to release once scrolling past the hero into below-content",
        timeout: 15_000,
      })
      .toBe(true);

    const postHeroSnapshot = await readHeroEdgeCaseSnapshot(page);
    await logSnapshot(logger, "post-hero-release", postHeroSnapshot);

    expect(postHeroSnapshot.fillerVisible).toBe(true);
    expect(postHeroSnapshot.stageTop).toBeLessThan(0);
  });
});
