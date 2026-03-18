import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";

const ENHANCED_HERO_STAGE_MOUNT_THROW_QUERY_PARAM =
  "__hero_test_force_enhanced_stage_mount_throw";

type HeroFallbackState = {
  boundaryFailed: string | null;
  enhancedDisplay: string;
  enhancedReady: string | null;
  enhancedReadyTimedOut: string | null;
  runtimeFailed: string | null;
  staticDisplay: string;
};

type ExpectedFallbackPath = "asset-failure" | "error-boundary" | "timeout";

async function getHeroFallbackState(page: Page): Promise<HeroFallbackState> {
  return page.evaluate(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");
    const staticBranch = document.querySelector<HTMLElement>(
      ".hero-root > .hero-static[data-branch='static']",
    );
    const enhancedShell = document.querySelector<HTMLElement>(
      ".hero-root > .hero-shell[data-branch='enhanced']",
    );

    return {
      boundaryFailed: heroRoot?.dataset.boundaryFailed ?? null,
      enhancedDisplay: enhancedShell ? window.getComputedStyle(enhancedShell).display : "missing",
      enhancedReady: heroRoot?.dataset.enhancedReady ?? null,
      enhancedReadyTimedOut: heroRoot?.dataset.enhancedReadyTimedOut ?? null,
      runtimeFailed: heroRoot?.dataset.runtimeFailed ?? null,
      staticDisplay: staticBranch ? window.getComputedStyle(staticBranch).display : "missing",
    };
  });
}

function inferFallbackPath(state: HeroFallbackState): ExpectedFallbackPath | "pending" {
  if (state.boundaryFailed === "true") {
    return "error-boundary";
  }

  if (state.runtimeFailed === "true") {
    return "asset-failure";
  }

  if (state.enhancedReadyTimedOut === "true") {
    return "timeout";
  }

  return "pending";
}

async function waitForFallbackPath(
  page: Page,
  expectedPath: ExpectedFallbackPath,
): Promise<HeroFallbackState> {
  await expect
    .poll(async () => inferFallbackPath(await getHeroFallbackState(page)), {
      message: `Expected hero fallback path ${expectedPath}`,
      timeout: expectedPath === "timeout" ? 15_000 : 10_000,
    })
    .toBe(expectedPath);

  return getHeroFallbackState(page);
}

async function expectStaticFallbackUsable(page: Page): Promise<void> {
  const primaryCta = page.getByRole("link", { name: "Take Your Seat" });
  const secondaryCta = page.getByRole("link", { name: "Explore Hospitality" });

  await expect(page.locator(".hero-root > .hero-static[data-branch='static']")).toHaveCSS(
    "display",
    "block",
  );
  await expect(page.locator(".hero-root > .hero-shell[data-branch='enhanced']")).toHaveCSS(
    "display",
    "none",
  );
  await expect(page.locator(".hero-static")).toContainText("Take Your Seat");
  await expect(primaryCta).toBeVisible();
  await primaryCta.click();
  await expect(page).toHaveURL(/#tickets$/);

  await expect(secondaryCta).toBeVisible();
  await secondaryCta.click();
  await expect(page).toHaveURL(/#hospitality$/);
}

async function logFallbackState(
  scenario: string,
  page: Page,
  pageErrors: string[],
  logger: ReturnType<typeof createTestLogger>,
  state: HeroFallbackState,
  extra: Record<string, string | number | boolean>,
): Promise<void> {
  await logger.step(`${scenario}: fallback state snapshot`);
  logger.expect(`${scenario}: inferred fallback path`, inferFallbackPath(state), inferFallbackPath(state));
  logger.expect(`${scenario}: root data-boundary-failed`, state.boundaryFailed, state.boundaryFailed);
  logger.expect(`${scenario}: root data-runtime-failed`, state.runtimeFailed, state.runtimeFailed);
  logger.expect(
    `${scenario}: root data-enhanced-ready-timed-out`,
    state.enhancedReadyTimedOut,
    state.enhancedReadyTimedOut,
  );
  logger.expect(`${scenario}: root data-enhanced-ready`, state.enhancedReady, state.enhancedReady);
  logger.expect(`${scenario}: static display`, state.staticDisplay, state.staticDisplay);
  logger.expect(`${scenario}: enhanced display`, state.enhancedDisplay, state.enhancedDisplay);
  logger.expect(`${scenario}: page error count`, pageErrors.length, pageErrors.length);

  for (const [key, value] of Object.entries(extra)) {
    logger.expect(`${scenario}: ${key}`, value, value);
  }

  await logger.screenshot(page, `${scenario}-fallback-state`);
}

test.describe("Hero runtime failure fallback", () => {
  test("critical enhancement asset failure reveals the static branch", async ({ page }, testInfo) => {
    const logger = createTestLogger(testInfo);
    const abortedRequests: string[] = [];

    await page.route("**/hero/portal-cosmos.webp", async (route) => {
      abortedRequests.push(route.request().url());
      await route.abort("failed");
    });

    await logger.step("Navigate with portal-cosmos.webp aborted");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".hero-root").waitFor();

    const state = await waitForFallbackPath(page, "asset-failure");
    await logFallbackState("single-asset-failure", page, [], logger, state, {
      abortedRequestCount: abortedRequests.length,
    });

    expect(abortedRequests.length).toBeGreaterThan(0);
    await expectStaticFallbackUsable(page);
  });

  test("all enhancement-only image failures still reveal a functional static branch", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);
    const abortedRequests: string[] = [];

    await page.route(/\/hero\/(portal-cosmos|arm-left|arm-right)\.webp$/, async (route) => {
      abortedRequests.push(route.request().url());
      await route.abort("failed");
    });

    await logger.step("Navigate with all enhancement-only images aborted");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".hero-root").waitFor();

    const state = await waitForFallbackPath(page, "asset-failure");
    await logFallbackState("all-enhancement-assets-failure", page, [], logger, state, {
      abortedRequestCount: abortedRequests.length,
      abortedUniqueAssetCount: new Set(abortedRequests).size,
    });

    expect(new Set(abortedRequests).size).toBeGreaterThanOrEqual(3);
    await expectStaticFallbackUsable(page);
  });

  test("error boundary reveals the static branch when EnhancedHeroStage throws on mount", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await logger.step("Navigate once so page.evaluate can arm the mount-failure hook");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".hero-root").waitFor();

    await logger.step("Arm the EnhancedHeroStage mount throw via query-param navigation");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.evaluate((queryParamKey) => {
        const url = new URL(window.location.href);
        url.searchParams.set(queryParamKey, "1");
        window.location.assign(url.toString());
      }, ENHANCED_HERO_STAGE_MOUNT_THROW_QUERY_PARAM),
    ]);

    await page.locator(".hero-root").waitFor();

    const state = await waitForFallbackPath(page, "error-boundary");
    await logFallbackState("error-boundary", page, pageErrors, logger, state, {
      observedPageError: pageErrors.some((message) =>
        message.includes("Forced EnhancedHeroStage mount failure for E2E fallback validation."),
      ),
    });

    expect(state.runtimeFailed).toBe("false");
    expect(state.boundaryFailed).toBe("true");
    await expectStaticFallbackUsable(page);
  });
});
