import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type PhaseSnapshot = {
  anticipationVisible: boolean;
  backgroundBaseColor: string;
  backgroundBlackFadeOpacity: number;
  blackoutOpacity: number;
  celebrationFrameIndex: number;
  celebrationOpacity: number;
  celebrationVisible: boolean;
  countdownText: string;
  ctaInert: boolean;
  ctaOpacity: number;
  ctaPulseActive: boolean;
  enhancedDisplay: string;
  enhancedReady: string | null;
  enhancedReadyTimedOut: string | null;
  flashOpacity: number;
  heroScrollProgress: number;
  portalActive: boolean;
  portalArmsPresent: boolean;
  portalArmsScale: number;
  portalCosmosPresent: boolean;
  portalCosmosScale: number;
  portalRingAnimationName: string;
  posterVisible: boolean;
  runtimeFailed: string | null;
  shootingStarVisible: boolean;
  sparkleBlendMode: string;
  sparkleVisible: boolean;
  staticDisplay: string;
  trophyLensFlareVisible: boolean;
  trophyOpacity: number;
};

async function waitForEnhancedHeroReady(page: Page): Promise<void> {
  const waitForReady = async (timeout: number) => {
    await page.locator(".hero-root").waitFor();
    await page.waitForFunction(
      () => {
        const heroRoot = document.querySelector<HTMLElement>(".hero-root");
        const enhancedStage = document.querySelector<HTMLElement>(".hero-enhanced-stage");

        return (
          heroRoot?.dataset.enhancedReady === "true" &&
          enhancedStage?.getAttribute("data-enhanced-ready") === "true"
        );
      },
      { timeout },
    );
  };

  try {
    await waitForReady(15_000);
    return;
  } catch (error) {
    const state = await page.evaluate(() => {
      const heroRoot = document.querySelector<HTMLElement>(".hero-root");

      return {
        enhancedReady: heroRoot?.dataset.enhancedReady ?? null,
        enhancedReadyTimedOut: heroRoot?.dataset.enhancedReadyTimedOut ?? null,
        runtimeFailed: heroRoot?.dataset.runtimeFailed ?? null,
      };
    });

    if (
      state.enhancedReady === "true" ||
      (state.enhancedReadyTimedOut !== "true" && state.runtimeFailed !== "true")
    ) {
      throw error;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(15_000);
  }
}

async function readPhaseSnapshot(page: Page): Promise<PhaseSnapshot> {
  return page.evaluate(() => {
    const parseScaleFromTransform = (transform: string): number => {
      if (!transform || transform === "none") {
        return 1;
      }

      const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);

      if (matrix3dMatch) {
        const values = matrix3dMatch[1]?.split(",").map((value) => Number.parseFloat(value.trim()));
        const scale = values?.[0] ?? Number.NaN;

        return Number.isFinite(scale) ? scale : 1;
      }

      const matrixMatch = transform.match(/^matrix\((.+)\)$/);

      if (matrixMatch) {
        const values = matrixMatch[1]?.split(",").map((value) => Number.parseFloat(value.trim()));
        const a = values?.[0] ?? Number.NaN;
        const b = values?.[1] ?? Number.NaN;

        if (Number.isFinite(a) && Number.isFinite(b)) {
          return Math.sqrt(a ** 2 + b ** 2);
        }
      }

      return 1;
    };
    const getStyle = (element: Element | null): CSSStyleDeclaration | null =>
      element instanceof HTMLElement ? window.getComputedStyle(element) : null;
    const readOpacity = (style: CSSStyleDeclaration | null): number =>
      Number.parseFloat(style?.opacity ?? "0");
    const isRendered = (style: CSSStyleDeclaration | null): boolean =>
      style !== null && style.display !== "none" && style.visibility !== "hidden";
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const staticBranch = document.querySelector<HTMLElement>(
      ".hero-root > .hero-static[data-branch='static']",
    );
    const enhancedShell = document.querySelector<HTMLElement>(
      ".hero-root > .hero-shell[data-branch='enhanced']",
    );
    const backgroundBase = document.querySelector<HTMLElement>("[data-layer='background-base']");
    const backgroundBlackFade = document.querySelector<HTMLElement>(
      "[data-layer='background-black-fade']",
    );
    const posterLayer = document.querySelector<HTMLElement>("[data-layer='poster']");
    const celebrationLayer = document.querySelector<HTMLElement>("[data-layer='celebration']");
    const celebrationCanvas = document.querySelector<HTMLCanvasElement>(
      "[data-layer='celebration'] canvas[data-clip='celebration']",
    );
    const sparkleLayer = document.querySelector<HTMLElement>("[data-layer='sparkle']");
    const sparkleWrapper =
      sparkleLayer?.firstElementChild instanceof HTMLElement ? sparkleLayer.firstElementChild : null;
    const blackoutLayer = document.querySelector<HTMLElement>("[data-layer='blackout']");
    const anticipationParticle = document.querySelector<HTMLElement>(
      "[data-layer='anticipation-particle']",
    );
    const trophyRoot = document.querySelector<HTMLElement>("[data-layer='trophy-reveal']");
    const trophyImage = trophyRoot?.querySelector<HTMLImageElement>(
      "img[alt='FIFA World Cup 2026 Trophy']",
    );
    const nearestStyledAncestor = trophyImage?.closest("div[style]") ?? null;
    const trophyContainer = nearestStyledAncestor instanceof HTMLElement ? nearestStyledAncestor : null;
    const ctaStack = document.querySelector<HTMLElement>("[data-layer='cta-stack']");
    const portalLayer = document.querySelector<HTMLElement>("[data-layer='portal-layer']");
    const portalCosmos = document.querySelector<HTMLElement>("[data-layer='portal-cosmos']");
    const portalArms = document.querySelector<HTMLElement>("[data-layer='portal-arms']");
    const portalRingPulse = document.querySelector<HTMLElement>("[data-layer='portal-ring-pulse']");
    const goldenFlash = document.querySelector<HTMLElement>("[data-layer='golden-flash-overlay']");

    const backgroundBaseStyle = getStyle(backgroundBase);
    const backgroundBlackFadeStyle = getStyle(backgroundBlackFade);
    const posterStyle = getStyle(posterLayer);
    const celebrationStyle = getStyle(celebrationLayer);
    const sparkleWrapperStyle = getStyle(sparkleWrapper);
    const blackoutStyle = getStyle(blackoutLayer);
    const trophyContainerStyle = getStyle(trophyContainer);
    const ctaStyle = getStyle(ctaStack);
    const portalCosmosStyle = getStyle(portalCosmos);
    const portalArmsStyle = getStyle(portalArms);
    const portalRingStyle = getStyle(portalRingPulse);
    const staticBranchStyle = getStyle(staticBranch);
    const enhancedShellStyle = getStyle(enhancedShell);
    const goldenFlashStyle = getStyle(goldenFlash);

    const countdownText = ctaStack?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return {
      anticipationVisible: anticipationParticle !== null,
      backgroundBaseColor: backgroundBaseStyle?.backgroundColor ?? "missing",
      backgroundBlackFadeOpacity: readOpacity(backgroundBlackFadeStyle),
      blackoutOpacity: readOpacity(blackoutStyle),
      celebrationFrameIndex: Number.parseInt(celebrationCanvas?.dataset.frameIndex ?? "-1", 10),
      celebrationOpacity: readOpacity(celebrationStyle),
      celebrationVisible: isRendered(celebrationStyle),
      countdownText,
      ctaInert: ctaStack?.hasAttribute("inert") ?? false,
      ctaOpacity: readOpacity(ctaStyle),
      ctaPulseActive: Boolean(ctaStack?.querySelector(".hero-cta-pulse")),
      enhancedDisplay: enhancedShellStyle?.display ?? "missing",
      enhancedReady: heroRoot?.dataset.enhancedReady ?? null,
      enhancedReadyTimedOut: heroRoot?.dataset.enhancedReadyTimedOut ?? null,
      flashOpacity: readOpacity(goldenFlashStyle),
      heroScrollProgress: Number.parseFloat(heroRoot?.dataset.heroScrollProgress ?? "0"),
      portalActive: portalLayer ? portalLayer.dataset.portalActive === "true" : false,
      portalArmsPresent: portalArms !== null,
      portalArmsScale: parseScaleFromTransform(portalArmsStyle?.transform ?? "none"),
      portalCosmosPresent: portalCosmos !== null,
      portalCosmosScale: parseScaleFromTransform(portalCosmosStyle?.transform ?? "none"),
      portalRingAnimationName: portalRingStyle?.animationName ?? "none",
      posterVisible:
        isRendered(posterStyle) && readOpacity(posterStyle) > 0.001,
      runtimeFailed: heroRoot?.dataset.runtimeFailed ?? null,
      shootingStarVisible: Boolean(document.querySelector("[data-layer='shooting-star']")),
      sparkleBlendMode: sparkleWrapperStyle?.mixBlendMode ?? "normal",
      sparkleVisible: isRendered(sparkleWrapperStyle),
      staticDisplay: staticBranchStyle?.display ?? "missing",
      trophyLensFlareVisible: Boolean(document.querySelector("[data-layer='trophy-lens-flare']")),
      trophyOpacity: readOpacity(trophyContainerStyle),
    };
  });
}

async function readScrollMetrics(page: Page) {
  return page.locator(".hero-scroll").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const startY = window.scrollY + rect.top;
    const scrollDistance = Math.max(0, rect.height - viewportHeight);

    return {
      containerHeight: rect.height,
      endY: startY + scrollDistance,
      scrollDistance,
      startY,
      viewportHeight,
      viewportWidth,
    };
  });
}

async function expectProgressNear(
  page: Page,
  targetProgress: number,
  label: string,
  tolerance = 0.04,
): Promise<PhaseSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readPhaseSnapshot(page);

      return Math.abs(snapshot.heroScrollProgress - targetProgress);
    }, {
      message: `${label}: hero scroll progress should settle near ${targetProgress.toFixed(2)}`,
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(tolerance);

  return readPhaseSnapshot(page);
}

async function visitPhase(
  page: Page,
  logger: ReturnType<typeof createTestLogger>,
  label: string,
  progress: number,
): Promise<PhaseSnapshot> {
  await logger.step(`Scroll to ${label} (${progress.toFixed(2)})`);
  await scrollToProgress(page, progress);
  const snapshot = await expectProgressNear(page, progress, label);

  logger.expect(`${label}: enhanced ready`, "true", snapshot.enhancedReady);
  logger.expect(`${label}: static display`, "none", snapshot.staticDisplay);
  logger.expect(`${label}: enhanced display`, "block", snapshot.enhancedDisplay);
  logger.expect(`${label}: runtime failed`, "false", snapshot.runtimeFailed ?? "false");
  logger.expect(`${label}: timed out`, "false", snapshot.enhancedReadyTimedOut ?? "false");
  logger.expect(`${label}: scroll progress`, progress, snapshot.heroScrollProgress);
  logger.expect(`${label}: portal active`, snapshot.portalActive, snapshot.portalActive);
  logger.expect(`${label}: celebration frame index`, snapshot.celebrationFrameIndex, snapshot.celebrationFrameIndex);
  logger.expect(`${label}: blackout opacity`, snapshot.blackoutOpacity, snapshot.blackoutOpacity);
  logger.expect(`${label}: CTA opacity`, snapshot.ctaOpacity, snapshot.ctaOpacity);
  logger.expect(`${label}: countdown text`, snapshot.countdownText, snapshot.countdownText);
  await logger.screenshot(page, label);

  return snapshot;
}

test.describe("Hero scroll phases", () => {
  test("walks every hero phase forward and back without replaying one-shots", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(180_000);

    await logger.step("Navigate to the hero and wait for the enhanced branch to become ready");
    await page.goto("/");
    await waitForEnhancedHeroReady(page);

    const metrics = await readScrollMetrics(page);
    logger.expect("viewport width", metrics.viewportWidth, metrics.viewportWidth);
    logger.expect("viewport height", metrics.viewportHeight, metrics.viewportHeight);
    logger.expect("scroll container height", metrics.containerHeight, metrics.containerHeight);
    logger.expect("scroll range", metrics.scrollDistance, metrics.scrollDistance);
    logger.expect("scroll startY", metrics.startY, metrics.startY);
    logger.expect("scroll endY", metrics.endY, metrics.endY);

    const phase00 = await visitPhase(page, logger, "phase-00", 0.0);
    expect(phase00.portalActive).toBe(true);
    expect(phase00.portalCosmosPresent).toBe(true);
    expect(phase00.portalArmsPresent).toBe(true);
    expect(phase00.backgroundBaseColor).toBe("rgb(27, 42, 74)");
    expect(phase00.backgroundBlackFadeOpacity).toBeLessThanOrEqual(0.01);

    const phase06 = await visitPhase(page, logger, "phase-06", 0.06);
    expect(phase06.portalActive).toBe(true);
    expect(phase06.portalRingAnimationName).toContain("heartbeat");
    expect(phase06.portalCosmosScale).toBeGreaterThan(phase00.portalCosmosScale);
    expect(phase06.portalArmsScale).toBeLessThan(phase06.portalCosmosScale);

    const phase11 = await visitPhase(page, logger, "phase-11", 0.11);
    expect(phase11.portalActive).toBe(true);
    expect(phase11.flashOpacity).toBeGreaterThan(0);
    expect(phase11.portalCosmosScale).toBeGreaterThan(phase06.portalCosmosScale);

    const phase14 = await visitPhase(page, logger, "phase-14", 0.14);
    expect(phase14.portalActive).toBe(false);
    expect(phase14.portalCosmosPresent).toBe(false);
    expect(phase14.portalArmsPresent).toBe(false);

    const phase15 = await visitPhase(page, logger, "phase-15", 0.15);
    expect(phase15.celebrationVisible).toBe(true);
    expect(phase15.posterVisible).toBe(true);

    const phase20 = await visitPhase(page, logger, "phase-20", 0.2);
    const phase25 = await visitPhase(page, logger, "phase-25", 0.25);
    const normalDelta = phase20.celebrationFrameIndex - phase15.celebrationFrameIndex;
    const slowDelta = phase25.celebrationFrameIndex - phase20.celebrationFrameIndex;

    logger.expect("normal delta 0.15->0.20", normalDelta, normalDelta);
    logger.expect("slow-zone delta 0.20->0.25", slowDelta, slowDelta);
    expect(phase20.celebrationFrameIndex).toBeGreaterThan(phase15.celebrationFrameIndex);
    expect(phase25.celebrationFrameIndex).toBeGreaterThanOrEqual(phase20.celebrationFrameIndex);
    expect(slowDelta).toBeLessThan(normalDelta);

    const phase50 = await visitPhase(page, logger, "phase-50", 0.5);
    expect(phase50.sparkleVisible).toBe(true);
    expect(phase50.sparkleBlendMode).toBe("screen");
    expect(phase50.posterVisible).toBe(true);

    const phase55 = await visitPhase(page, logger, "phase-55", 0.55);
    expect(phase55.celebrationOpacity).toBeGreaterThan(0);
    expect(phase55.celebrationOpacity).toBeLessThan(1);

    const phase75 = await visitPhase(page, logger, "phase-75", 0.75);
    expect(phase75.backgroundBlackFadeOpacity).toBeGreaterThanOrEqual(0.99);
    expect(phase75.blackoutOpacity).toBeGreaterThan(0);
    expect(phase75.blackoutOpacity).toBeLessThan(1);

    const phase80 = await visitPhase(page, logger, "phase-80", 0.8);
    expect(phase80.backgroundBlackFadeOpacity).toBeGreaterThanOrEqual(0.99);
    expect(phase80.blackoutOpacity).toBeGreaterThanOrEqual(0.99);
    expect(phase80.anticipationVisible).toBe(true);

    const phase90 = await visitPhase(page, logger, "phase-90", 0.9);
    expect(phase90.trophyOpacity).toBeGreaterThan(0);
    expect(phase90.trophyOpacity).toBeLessThan(1);
    expect(phase90.ctaInert).toBe(true);

    await visitPhase(page, logger, "phase-95", 0.95);
    await expect
      .poll(async () => (await readPhaseSnapshot(page)).ctaOpacity, {
        message: "Expected the CTA stack to be visibly fading in by progress 0.95",
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    const ctaRoot = page.locator("[data-layer='cta-stack']");
    const primaryCta = ctaRoot.getByRole("link", { name: "Take Your Seat" }).first();
    const secondaryCta = ctaRoot.getByRole("link", { name: "Explore Hospitality" }).first();

    await visitPhase(page, logger, "phase-99", 0.99);
    await expect
      .poll(async () => (await readPhaseSnapshot(page)).ctaOpacity, {
        message: "Expected the CTA stack to reach the interactivity threshold by progress 0.99",
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(0.8);
    expect((await readPhaseSnapshot(page)).ctaInert).toBe(false);
    await expect(primaryCta).toBeVisible();
    await expect(secondaryCta).toBeVisible();

    const phase100 = await visitPhase(page, logger, "phase-100", 1.0);
    const countdownBefore = phase100.countdownText;

    expect(phase100.ctaOpacity).toBeGreaterThanOrEqual(0.8);
    expect(phase100.ctaInert).toBe(false);
    expect(countdownBefore).toContain("Countdown to kickoff");

    await logger.step("Verify the countdown text continues ticking at progress 1.00");
    await page.waitForTimeout(1_100);
    const countdownAfter = (await readPhaseSnapshot(page)).countdownText;
    logger.expect("countdown before", countdownBefore, countdownBefore);
    logger.expect("countdown after", countdownAfter, countdownAfter);
    expect(countdownAfter).not.toBe(countdownBefore);

    const phase50Back = await visitPhase(page, logger, "phase-50-back", 0.5);
    expect(phase50Back.flashOpacity).toBe(0);
    expect(phase50Back.trophyLensFlareVisible).toBe(false);
    expect(phase50Back.shootingStarVisible).toBe(false);
    await expect
      .poll(async () => (await readPhaseSnapshot(page)).ctaOpacity, {
        message: "Expected the CTA stack to fade back out after rewinding to progress 0.50",
        timeout: 10_000,
      })
      .toBeLessThan(0.01);
  });
});
