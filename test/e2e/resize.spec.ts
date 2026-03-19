import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type CanvasPatchSample = {
  a: number;
  b: number;
  g: number;
  r: number;
};

type HeroResizeSnapshot = {
  activeTier: string;
  canvasClientHeight: number;
  canvasClientWidth: number;
  canvasHeight: number;
  canvasWidth: number;
  centerSample: CanvasPatchSample;
  coarsePointer: boolean;
  frameIndex: number;
  heroEndY: number;
  heroScrollHeight: number;
  heroScrollProgress: number;
  heroStartY: number;
  heroVh: number;
  leftSample: CanvasPatchSample;
  opaquePatchCount: number;
  rightSample: CanvasPatchSample;
  scrollY: number;
  topSample: CanvasPatchSample;
  viewportHeight: number;
  viewportWidth: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function colorDistance(left: CanvasPatchSample, right: CanvasPatchSample): number {
  return Math.sqrt(
    (left.r - right.r) ** 2 +
      (left.g - right.g) ** 2 +
      (left.b - right.b) ** 2 +
      (left.a - right.a) ** 2,
  );
}

function getExpectedScrollProgress(snapshot: HeroResizeSnapshot): number {
  const scrollRange = snapshot.heroEndY - snapshot.heroStartY;

  if (!Number.isFinite(scrollRange) || scrollRange <= 0) {
    return 0;
  }

  return clamp((snapshot.scrollY - snapshot.heroStartY) / scrollRange, 0, 1);
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

async function readHeroResizeSnapshot(page: Page): Promise<HeroResizeSnapshot> {
  return page.evaluate(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const celebrationCanvas = document.querySelector<HTMLCanvasElement>(
      "[data-layer='celebration'] canvas[data-clip='celebration']",
    );
    const heroStyle = heroRoot ? window.getComputedStyle(heroRoot) : null;

    const parseCssPx = (value: string | null | undefined): number => {
      if (!value) {
        return 0;
      }

      const parsed = Number.parseFloat(value);

      return Number.isFinite(parsed) ? parsed : 0;
    };

    const clampValue = (value: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, value));

    const samplePatch = (
      canvas: HTMLCanvasElement | null,
      horizontalRatio: number,
      verticalRatio: number,
    ): CanvasPatchSample => {
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        return { a: 0, b: 0, g: 0, r: 0 };
      }

      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return { a: 0, b: 0, g: 0, r: 0 };
      }

      const patchSize = 3;
      const halfPatch = Math.floor(patchSize / 2);
      const patchX = clampValue(
        Math.round((canvas.width - 1) * horizontalRatio) - halfPatch,
        0,
        Math.max(0, canvas.width - patchSize),
      );
      const patchY = clampValue(
        Math.round((canvas.height - 1) * verticalRatio) - halfPatch,
        0,
        Math.max(0, canvas.height - patchSize),
      );
      const imageData = context.getImageData(
        patchX,
        patchY,
        Math.min(patchSize, canvas.width),
        Math.min(patchSize, canvas.height),
      );
      const channelTotals = { a: 0, b: 0, g: 0, r: 0 };
      const sampleCount = Math.max(1, imageData.data.length / 4);

      for (let index = 0; index < imageData.data.length; index += 4) {
        channelTotals.r += imageData.data[index] ?? 0;
        channelTotals.g += imageData.data[index + 1] ?? 0;
        channelTotals.b += imageData.data[index + 2] ?? 0;
        channelTotals.a += imageData.data[index + 3] ?? 0;
      }

      return {
        a: Math.round(channelTotals.a / sampleCount),
        b: Math.round(channelTotals.b / sampleCount),
        g: Math.round(channelTotals.g / sampleCount),
        r: Math.round(channelTotals.r / sampleCount),
      };
    };

    const centerSample = samplePatch(celebrationCanvas, 0.5, 0.5);
    const leftSample = samplePatch(celebrationCanvas, 0.2, 0.5);
    const rightSample = samplePatch(celebrationCanvas, 0.8, 0.5);
    const topSample = samplePatch(celebrationCanvas, 0.5, 0.2);
    const patchSamples = [centerSample, leftSample, rightSample, topSample];

    return {
      activeTier: celebrationCanvas?.dataset.activeTier ?? "none",
      canvasClientHeight: Math.round(celebrationCanvas?.clientHeight ?? 0),
      canvasClientWidth: Math.round(celebrationCanvas?.clientWidth ?? 0),
      canvasHeight: celebrationCanvas?.height ?? 0,
      canvasWidth: celebrationCanvas?.width ?? 0,
      centerSample,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      frameIndex: Number.parseInt(celebrationCanvas?.dataset.frameIndex ?? "-1", 10),
      heroEndY: parseCssPx(heroStyle?.getPropertyValue("--hero-end-y")),
      heroScrollHeight: parseCssPx(heroStyle?.getPropertyValue("--hero-scroll-height")),
      heroScrollProgress: Number.parseFloat(heroRoot?.dataset.heroScrollProgress ?? "0"),
      heroStartY: parseCssPx(heroStyle?.getPropertyValue("--hero-start-y")),
      heroVh: parseCssPx(heroStyle?.getPropertyValue("--hero-vh")),
      leftSample,
      opaquePatchCount: patchSamples.filter((sample) => sample.a > 0).length,
      rightSample,
      scrollY: window.scrollY,
      topSample,
      viewportHeight: Math.round(window.visualViewport?.height ?? window.innerHeight),
      viewportWidth: Math.round(window.visualViewport?.width ?? window.innerWidth),
    };
  });
}

async function waitForViewportResize(
  page: Page,
  expectedViewportWidth: number,
  expectedViewportHeight: number,
): Promise<HeroResizeSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readHeroResizeSnapshot(page);

      return (
        snapshot.viewportWidth === expectedViewportWidth &&
        snapshot.viewportHeight === expectedViewportHeight &&
        snapshot.canvasClientWidth === expectedViewportWidth &&
        snapshot.canvasClientHeight === expectedViewportHeight &&
        Math.abs(snapshot.heroVh - expectedViewportHeight) <= 1 &&
        Math.abs(
          snapshot.heroScrollHeight -
            expectedViewportHeight * (snapshot.coarsePointer ? 3.5 : 4.5),
        ) <= 1 &&
        snapshot.opaquePatchCount === 4
      );
    }, {
      message: `Expected viewport ${expectedViewportWidth}x${expectedViewportHeight} resize state to settle`,
      timeout: 15_000,
    })
    .toBe(true);

  return readHeroResizeSnapshot(page);
}

async function waitForProgress(
  page: Page,
  targetProgress: number,
  label: string,
): Promise<HeroResizeSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readHeroResizeSnapshot(page);

      return Math.abs(snapshot.heroScrollProgress - targetProgress);
    }, {
      message: `${label}: hero scroll progress should settle near ${targetProgress.toFixed(2)}`,
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(0.05);

  await expect
    .poll(async () => (await readHeroResizeSnapshot(page)).opaquePatchCount, {
      message: `${label}: celebration canvas should stay non-blank`,
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  return readHeroResizeSnapshot(page);
}

async function logResizeSnapshot(
  logger: ReturnType<typeof createTestLogger>,
  scenario: string,
  snapshot: HeroResizeSnapshot,
): Promise<void> {
  await logger.step(`${scenario}: resize snapshot`);
  logger.expect(`${scenario}: viewport`, `${snapshot.viewportWidth}x${snapshot.viewportHeight}`, `${snapshot.viewportWidth}x${snapshot.viewportHeight}`);
  logger.expect(`${scenario}: coarse pointer`, snapshot.coarsePointer, snapshot.coarsePointer);
  logger.expect(`${scenario}: --hero-vh`, snapshot.heroVh, snapshot.heroVh);
  logger.expect(`${scenario}: --hero-scroll-height`, snapshot.heroScrollHeight, snapshot.heroScrollHeight);
  logger.expect(`${scenario}: --hero-start-y`, snapshot.heroStartY, snapshot.heroStartY);
  logger.expect(`${scenario}: --hero-end-y`, snapshot.heroEndY, snapshot.heroEndY);
  logger.expect(`${scenario}: scrollY`, snapshot.scrollY, snapshot.scrollY);
  logger.expect(`${scenario}: data heroScrollProgress`, snapshot.heroScrollProgress, snapshot.heroScrollProgress);
  logger.expect(`${scenario}: canvas client size`, `${snapshot.canvasClientWidth}x${snapshot.canvasClientHeight}`, `${snapshot.canvasClientWidth}x${snapshot.canvasClientHeight}`);
  logger.expect(`${scenario}: canvas backing size`, `${snapshot.canvasWidth}x${snapshot.canvasHeight}`, `${snapshot.canvasWidth}x${snapshot.canvasHeight}`);
  logger.expect(`${scenario}: active tier`, snapshot.activeTier, snapshot.activeTier);
  logger.expect(`${scenario}: frame index`, snapshot.frameIndex, snapshot.frameIndex);
  logger.expect(`${scenario}: opaque patch count`, snapshot.opaquePatchCount, snapshot.opaquePatchCount);
  logger.expect(`${scenario}: center sample`, snapshot.centerSample, snapshot.centerSample);
  logger.expect(`${scenario}: left sample`, snapshot.leftSample, snapshot.leftSample);
  logger.expect(`${scenario}: right sample`, snapshot.rightSample, snapshot.rightSample);
  logger.expect(`${scenario}: top sample`, snapshot.topSample, snapshot.topSample);
}

test.describe("Hero viewport resize + orientation", () => {
  test("portrait to landscape updates runtime variables and keeps the celebration canvas drawn", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.slow();
    test.setTimeout(90_000);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ height: 844, width: 390 });

    await logger.step("Navigate with a portrait viewport and wait for the enhanced hero to settle");
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);

    await logger.step("Scroll to celebration progress 0.30 in portrait mode");
    await scrollToProgress(page, 0.3);
    const portraitSnapshot = await waitForProgress(page, 0.3, "portrait-progress-0.30");
    await logResizeSnapshot(logger, "portrait-progress-0.30", portraitSnapshot);

    expect(portraitSnapshot.heroVh).toBe(844);
    expect(portraitSnapshot.heroScrollHeight).toBe(
      844 * (portraitSnapshot.coarsePointer ? 3.5 : 4.5),
    );
    expect(
      Math.abs(portraitSnapshot.heroScrollProgress - getExpectedScrollProgress(portraitSnapshot)),
    ).toBeLessThanOrEqual(0.03);

    const portraitCenterSample = portraitSnapshot.centerSample;
    const portraitScrollY = portraitSnapshot.scrollY;

    await logger.step("Resize the viewport to landscape without changing the current pixel scroll offset");
    await page.setViewportSize({ height: 390, width: 844 });
    let landscapeSnapshot = await waitForViewportResize(page, 844, 390);
    await logResizeSnapshot(logger, "landscape-same-pixel-offset", landscapeSnapshot);

    expect(landscapeSnapshot.heroVh).toBe(390);
    expect(landscapeSnapshot.heroScrollHeight).toBe(
      390 * (landscapeSnapshot.coarsePointer ? 3.5 : 4.5),
    );
    expect(Math.abs(landscapeSnapshot.scrollY - portraitScrollY)).toBeLessThanOrEqual(2);
    expect(landscapeSnapshot.canvasWidth).not.toBe(portraitSnapshot.canvasWidth);
    expect(landscapeSnapshot.canvasHeight).not.toBe(portraitSnapshot.canvasHeight);
    expect(
      Math.abs(landscapeSnapshot.heroScrollProgress - portraitSnapshot.heroScrollProgress),
    ).toBeGreaterThan(0.02);
    expect(
      Math.abs(landscapeSnapshot.heroScrollProgress - getExpectedScrollProgress(landscapeSnapshot)),
    ).toBeLessThanOrEqual(0.03);

    await logger.step("Restore the same logical progress after the orientation change");
    await scrollToProgress(page, 0.3);
    landscapeSnapshot = await waitForProgress(page, 0.3, "landscape-progress-0.30");
    await logResizeSnapshot(logger, "landscape-progress-0.30", landscapeSnapshot);

    expect(colorDistance(portraitCenterSample, landscapeSnapshot.centerSample)).toBeLessThanOrEqual(40);
    await logger.screenshot(page, "orientation-change-progress-0-30");
  });

  test("desktop resize recalculates the hero scroll range and keeps the canvas backing store in sync", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.slow();
    test.setTimeout(90_000);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ height: 1080, width: 1920 });

    await logger.step("Navigate with a 1920x1080 viewport and wait for the enhanced hero to settle");
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);

    await logger.step("Scroll to celebration progress 0.50 on desktop");
    await scrollToProgress(page, 0.5);
    const desktopSnapshot = await waitForProgress(page, 0.5, "desktop-progress-0.50");
    await logResizeSnapshot(logger, "desktop-progress-0.50", desktopSnapshot);

    expect(desktopSnapshot.heroVh).toBe(1080);
    expect(desktopSnapshot.heroScrollHeight).toBe(
      1080 * (desktopSnapshot.coarsePointer ? 3.5 : 4.5),
    );
    expect(
      Math.abs(desktopSnapshot.heroScrollProgress - getExpectedScrollProgress(desktopSnapshot)),
    ).toBeLessThanOrEqual(0.03);

    const desktopCenterSample = desktopSnapshot.centerSample;
    const desktopScrollY = desktopSnapshot.scrollY;

    await logger.step("Resize the desktop viewport to 1280x720 and wait for runtime values to settle");
    await page.setViewportSize({ height: 720, width: 1280 });
    let resizedDesktopSnapshot = await waitForViewportResize(page, 1280, 720);
    await logResizeSnapshot(logger, "desktop-resized-same-pixel-offset", resizedDesktopSnapshot);

    expect(resizedDesktopSnapshot.heroVh).toBe(720);
    expect(resizedDesktopSnapshot.heroScrollHeight).toBe(
      720 * (resizedDesktopSnapshot.coarsePointer ? 3.5 : 4.5),
    );
    expect(Math.abs(resizedDesktopSnapshot.scrollY - desktopScrollY)).toBeLessThanOrEqual(2);
    expect(resizedDesktopSnapshot.canvasWidth).not.toBe(desktopSnapshot.canvasWidth);
    expect(resizedDesktopSnapshot.canvasHeight).not.toBe(desktopSnapshot.canvasHeight);
    expect(
      Math.abs(resizedDesktopSnapshot.heroScrollProgress - desktopSnapshot.heroScrollProgress),
    ).toBeGreaterThan(0.02);
    expect(
      Math.abs(resizedDesktopSnapshot.heroScrollProgress - getExpectedScrollProgress(resizedDesktopSnapshot)),
    ).toBeLessThanOrEqual(0.03);

    await logger.step("Restore desktop progress 0.50 after the resize to validate redraw stability");
    await scrollToProgress(page, 0.5);
    resizedDesktopSnapshot = await waitForProgress(page, 0.5, "desktop-resized-progress-0.50");
    await logResizeSnapshot(logger, "desktop-resized-progress-0.50", resizedDesktopSnapshot);

    expect(colorDistance(desktopCenterSample, resizedDesktopSnapshot.centerSample)).toBeLessThanOrEqual(35);
    await logger.screenshot(page, "desktop-resize-progress-0-50");
  });
});
