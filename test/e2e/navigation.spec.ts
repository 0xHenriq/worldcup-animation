import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type HeroNavigationProbe = {
  lastPageShowPersisted: boolean | null;
  pageShowPersistedHistory: boolean[];
};

type HeroNavigationSnapshot = {
  celebrationLayerPresent: boolean;
  ctaInert: boolean;
  ctaOpacity: number;
  enhancedDisplay: string;
  enhancedReady: string | null;
  goldenFlashOpacity: number;
  goldenFlashVisible: boolean;
  heroScrollProgress: number;
  lastPageShowPersisted: boolean | null;
  navigationType: string | null;
  pageShowPersistedHistory: boolean[];
  portalActive: boolean;
  shootingStarVisible: boolean;
  staticDisplay: string;
  trophyLensFlareVisible: boolean;
};

async function installNavigationProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: HeroNavigationProbe = {
      lastPageShowPersisted: null,
      pageShowPersistedHistory: [],
    };

    (
      window as Window & {
        __heroNavigationProbe?: HeroNavigationProbe;
      }
    ).__heroNavigationProbe = probe;

    const handlePageShow = (event: PageTransitionEvent) => {
      const nextProbe = (
        window as Window & {
          __heroNavigationProbe?: HeroNavigationProbe;
        }
      ).__heroNavigationProbe;

      if (!nextProbe) {
        return;
      }

      nextProbe.lastPageShowPersisted = event.persisted;
      nextProbe.pageShowPersistedHistory.push(event.persisted);
      window.addEventListener("pageshow", handlePageShow, { once: true });
    };

    window.addEventListener("pageshow", handlePageShow, { once: true });
  });
}

async function waitForHeroStableState(page: Page): Promise<void> {
  await page.locator(".hero-root").waitFor();
  await page.waitForFunction(() => {
    const staticBranch = document.querySelector<HTMLElement>(".hero-root > .hero-static[data-branch='static']");
    const enhancedShell = document.querySelector<HTMLElement>(".hero-root > .hero-shell[data-branch='enhanced']");
    const enhancedStage = document.querySelector<HTMLElement>(".hero-enhanced-stage");

    const staticVisible = staticBranch ? window.getComputedStyle(staticBranch).display === "block" : false;
    const enhancedHidden = enhancedShell ? window.getComputedStyle(enhancedShell).display === "none" : false;
    const enhancedReady = enhancedStage?.getAttribute("data-enhanced-ready") === "true";

    return enhancedReady || (staticVisible && enhancedHidden);
  });
}

async function readHeroNavigationSnapshot(page: Page): Promise<HeroNavigationSnapshot> {
  return page.evaluate(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const staticBranch = document.querySelector<HTMLElement>(".hero-root > .hero-static[data-branch='static']");
    const enhancedShell = document.querySelector<HTMLElement>(
      ".hero-root > .hero-shell[data-branch='enhanced']",
    );
    const ctaStack = document.querySelector<HTMLElement>("[data-layer='cta-stack']");
    const goldenFlash = document.querySelector<HTMLElement>("[data-layer='golden-flash-overlay']");
    const portalLayer = document.querySelector<HTMLElement>("[data-layer='portal-layer']");
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const probe = (
      window as Window & {
        __heroNavigationProbe?: HeroNavigationProbe;
      }
    ).__heroNavigationProbe;

    return {
      celebrationLayerPresent: Boolean(document.querySelector("[data-layer='celebration']")),
      ctaInert: ctaStack?.hasAttribute("inert") ?? false,
      ctaOpacity: ctaStack ? Number.parseFloat(window.getComputedStyle(ctaStack).opacity) : -1,
      enhancedDisplay: enhancedShell ? window.getComputedStyle(enhancedShell).display : "missing",
      enhancedReady: heroRoot?.dataset.enhancedReady ?? null,
      goldenFlashOpacity: goldenFlash ? Number.parseFloat(window.getComputedStyle(goldenFlash).opacity) : -1,
      goldenFlashVisible:
        goldenFlash !== null && Number.parseFloat(window.getComputedStyle(goldenFlash).opacity) > 0.001,
      heroScrollProgress: Number.parseFloat(heroRoot?.dataset.heroScrollProgress ?? "0"),
      lastPageShowPersisted: probe?.lastPageShowPersisted ?? null,
      navigationType: navigationEntry?.type ?? null,
      pageShowPersistedHistory: probe?.pageShowPersistedHistory ?? [],
      portalActive: portalLayer?.dataset.portalActive === "true",
      shootingStarVisible: Boolean(document.querySelector("[data-layer='shooting-star']")),
      staticDisplay: staticBranch ? window.getComputedStyle(staticBranch).display : "missing",
      trophyLensFlareVisible: Boolean(document.querySelector("[data-layer='trophy-lens-flare']")),
    };
  });
}

async function expectProgressNear(
  page: Page,
  targetProgress: number,
  label: string,
  tolerance = 0.04,
): Promise<HeroNavigationSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readHeroNavigationSnapshot(page);

      return Math.abs(snapshot.heroScrollProgress - targetProgress);
    }, {
      message: `${label}: hero scroll progress should settle near ${targetProgress.toFixed(2)}`,
      timeout: 10_000,
    })
    .toBeLessThanOrEqual(tolerance);

  return readHeroNavigationSnapshot(page);
}

async function logNavigationSnapshot(
  logger: ReturnType<typeof createTestLogger>,
  scenario: string,
  snapshot: HeroNavigationSnapshot,
): Promise<void> {
  await logger.step(`${scenario}: navigation snapshot`);
  logger.expect(`${scenario}: hero scroll progress`, snapshot.heroScrollProgress, snapshot.heroScrollProgress);
  logger.expect(`${scenario}: navigation type`, snapshot.navigationType, snapshot.navigationType);
  logger.expect(
    `${scenario}: pageshow persisted history`,
    snapshot.pageShowPersistedHistory,
    snapshot.pageShowPersistedHistory,
  );
  logger.expect(`${scenario}: last pageshow persisted`, snapshot.lastPageShowPersisted, snapshot.lastPageShowPersisted);
  logger.expect(`${scenario}: static display`, snapshot.staticDisplay, snapshot.staticDisplay);
  logger.expect(`${scenario}: enhanced display`, snapshot.enhancedDisplay, snapshot.enhancedDisplay);
  logger.expect(`${scenario}: enhanced ready`, snapshot.enhancedReady, snapshot.enhancedReady);
  logger.expect(`${scenario}: portal active`, snapshot.portalActive, snapshot.portalActive);
  logger.expect(`${scenario}: celebration present`, snapshot.celebrationLayerPresent, snapshot.celebrationLayerPresent);
  logger.expect(`${scenario}: golden flash visible`, snapshot.goldenFlashVisible, snapshot.goldenFlashVisible);
  logger.expect(`${scenario}: golden flash opacity`, snapshot.goldenFlashOpacity, snapshot.goldenFlashOpacity);
  logger.expect(`${scenario}: shooting star visible`, snapshot.shootingStarVisible, snapshot.shootingStarVisible);
  logger.expect(`${scenario}: trophy lens flare visible`, snapshot.trophyLensFlareVisible, snapshot.trophyLensFlareVisible);
  logger.expect(`${scenario}: CTA inert`, snapshot.ctaInert, snapshot.ctaInert);
  logger.expect(`${scenario}: CTA opacity`, snapshot.ctaOpacity, snapshot.ctaOpacity);
}

test.describe("Hero navigation restoration", () => {
  test("restores mid-hero state from bfcache without replaying one-shot effects", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(90_000);

    await installNavigationProbe(page);
    await logger.step("Navigate to the hero page and wait for the enhanced branch to settle");
    await page.goto("/");
    await waitForHeroStableState(page);

    await logger.step("Scroll to progress 0.50 and verify the mid-celebration state");
    await scrollToProgress(page, 0.5);
    const midCelebrationSnapshot = await expectProgressNear(page, 0.5, "mid-celebration");
    await logNavigationSnapshot(logger, "mid-celebration", midCelebrationSnapshot);

    expect(midCelebrationSnapshot.enhancedReady).toBe("true");
    expect(midCelebrationSnapshot.enhancedDisplay).toBe("block");
    expect(midCelebrationSnapshot.staticDisplay).toBe("none");
    expect(midCelebrationSnapshot.celebrationLayerPresent).toBe(true);
    expect(midCelebrationSnapshot.portalActive).toBe(false);
    expect(midCelebrationSnapshot.goldenFlashVisible).toBe(false);

    await logger.step("Navigate away and return with page.goBack()");
    await page.goto("/__hero-away");
    await page.goBack();
    await waitForHeroStableState(page);

    const restoredMidCelebrationSnapshot = await expectProgressNear(
      page,
      0.5,
      "restored-mid-celebration",
    );
    await logNavigationSnapshot(logger, "restored-mid-celebration", restoredMidCelebrationSnapshot);

    expect(restoredMidCelebrationSnapshot.navigationType).toBe("back_forward");
    expect(restoredMidCelebrationSnapshot.portalActive).toBe(false);
    expect(restoredMidCelebrationSnapshot.goldenFlashVisible).toBe(false);

    await logger.step("Advance past the trophy reveal threshold and wait for the one-shot flare");
    await scrollToProgress(page, 0.97);
    await expectProgressNear(page, 0.97, "trophy-reveal");
    await expect
      .poll(async () => (await readHeroNavigationSnapshot(page)).trophyLensFlareVisible, {
        message: "trophy lens flare should fire on the first forward pass into the CTA zone",
        timeout: 10_000,
      })
      .toBe(true);

    const firstFlareSnapshot = await readHeroNavigationSnapshot(page);
    await logNavigationSnapshot(logger, "first-flare", firstFlareSnapshot);

    await logger.step("Navigate away again and verify the flare does not replay on return");
    await page.goto("/__hero-away-second");
    await page.goBack();
    await waitForHeroStableState(page);
    await expectProgressNear(page, 0.97, "restored-trophy-reveal");
    await page.waitForTimeout(300);

    const restoredTrophySnapshot = await readHeroNavigationSnapshot(page);
    await logNavigationSnapshot(logger, "restored-trophy-reveal", restoredTrophySnapshot);

    expect(restoredTrophySnapshot.navigationType).toBe("back_forward");
    expect(restoredTrophySnapshot.trophyLensFlareVisible).toBe(false);
    expect(restoredTrophySnapshot.goldenFlashVisible).toBe(false);
  });

  test("reloads at progress 0.90 without replaying portal- or trophy-phase one-shots", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(90_000);

    await installNavigationProbe(page);
    await logger.step("Navigate to the hero page and pre-position the scroll near trophy reveal");
    await page.goto("/");
    await waitForHeroStableState(page);

    await scrollToProgress(page, 0.9);
    const preReloadSnapshot = await expectProgressNear(page, 0.9, "pre-reload-mid-page");
    await logNavigationSnapshot(logger, "pre-reload-mid-page", preReloadSnapshot);

    await logger.step("Reload from the current scroll position and verify mount-time gate initialization");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHeroStableState(page);

    const postReloadSnapshot = await expectProgressNear(page, 0.9, "post-reload-mid-page");
    await logNavigationSnapshot(logger, "post-reload-mid-page", postReloadSnapshot);

    expect(postReloadSnapshot.enhancedDisplay).toBe("block");
    expect(postReloadSnapshot.staticDisplay).toBe("none");
    expect(postReloadSnapshot.portalActive).toBe(false);
    expect(postReloadSnapshot.goldenFlashVisible).toBe(false);
    expect(postReloadSnapshot.shootingStarVisible).toBe(false);
    expect(postReloadSnapshot.trophyLensFlareVisible).toBe(false);
    expect(postReloadSnapshot.ctaInert).toBe(true);
  });
});
