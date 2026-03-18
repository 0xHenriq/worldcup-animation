import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";

type BranchDisplayState = {
  enhancedDisplay: string;
  htmlDataJs: string | null;
  layoutShiftScore: number;
  staticDisplay: string;
};

async function pageEvaluateBranchDisplayState(page: Page): Promise<BranchDisplayState> {
  return page.evaluate(() => {
    const staticBranch = document.querySelector<HTMLElement>(".hero-root > .hero-static[data-branch='static']");
    const enhancedShell = document.querySelector<HTMLElement>(".hero-root > .hero-shell[data-branch='enhanced']");
    const layoutShiftEntries = performance.getEntriesByType("layout-shift") as Array<
      PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      }
    >;
    const observerScore = (
      window as Window & {
        __heroCls?: { value?: number };
      }
    ).__heroCls?.value;
    const bufferedScore = layoutShiftEntries.reduce((total, entry) => {
      if (entry.hadRecentInput) {
        return total;
      }

      return total + (entry.value ?? 0);
    }, 0);

    return {
      enhancedDisplay: enhancedShell ? window.getComputedStyle(enhancedShell).display : "missing",
      htmlDataJs: document.documentElement.getAttribute("data-js"),
      layoutShiftScore: observerScore ?? bufferedScore,
      staticDisplay: staticBranch ? window.getComputedStyle(staticBranch).display : "missing",
    };
  });
}

async function installClsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let cls = 0;

    (
      window as Window & {
        __heroCls?: { value: number };
      }
    ).__heroCls = { value: 0 };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        }
      >) {
        if (entry.hadRecentInput) {
          continue;
        }

        cls += entry.value ?? 0;
      }

      (
        window as Window & {
          __heroCls?: { value: number };
        }
      ).__heroCls = { value: cls };
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function logBranchState(
  logger: ReturnType<typeof createTestLogger>,
  scenario: string,
  state: BranchDisplayState,
): Promise<void> {
  await logger.step(`${scenario}: branch display snapshot`);
  logger.expect(`${scenario}: html[data-js]`, state.htmlDataJs, state.htmlDataJs);
  logger.expect(`${scenario}: static display`, state.staticDisplay, state.staticDisplay);
  logger.expect(`${scenario}: enhanced display`, state.enhancedDisplay, state.enhancedDisplay);
  logger.expect(`${scenario}: CLS`, state.layoutShiftScore, state.layoutShiftScore);
}

test.describe("Hero mode selection", () => {
  test("JS enabled + motion allowed shows the enhanced branch with zero CLS", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    await installClsObserver(page);
    await logger.step("Navigate with JavaScript enabled and reduced motion off");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".hero-root").waitFor();
    await page.locator(".hero-shell [data-layer='background-base']").waitFor();

    const state = await pageEvaluateBranchDisplayState(page);
    await logBranchState(logger, "js-enabled", state);

    await expect(page.locator("html")).toHaveAttribute("data-js", "true");
    await expect(page.locator(".hero-root > .hero-static[data-branch='static']")).toHaveCSS("display", "none");
    await expect(page.locator(".hero-root > .hero-shell[data-branch='enhanced']")).toHaveCSS("display", "block");
    await expect(page.locator(".hero-shell [data-layer='background-base']")).toBeAttached();
    await expect(page.locator(".hero-shell [data-layer='portal']")).toBeAttached();
    expect(state.layoutShiftScore).toBeLessThan(0.001);
  });

  test.describe("JavaScript disabled", () => {
    test.use({ javaScriptEnabled: false });

    test("shows the static branch only and keeps both CTAs usable", async ({ page }, testInfo) => {
      const logger = createTestLogger(testInfo);

      await logger.step("Navigate with JavaScript disabled");
      await page.goto("/");
      await page.locator(".hero-root").waitFor();

      const state = await pageEvaluateBranchDisplayState(page);
      await logBranchState(logger, "js-disabled", state);

      await expect(page.locator("html")).not.toHaveAttribute("data-js", "true");
      await expect(page.locator(".hero-root > .hero-static[data-branch='static']")).toHaveCSS("display", "block");
      await expect(page.locator(".hero-root > .hero-shell[data-branch='enhanced']")).toHaveCSS("display", "none");
      await expect(page.locator(".hero-static img[alt=''][fetchpriority='high']")).toBeVisible();
      await expect(page.locator(".hero-static img[alt=''][loading='lazy']")).toBeVisible();
      await expect(page.getByAltText("FIFA World Cup 2026 Trophy")).toBeVisible();

      const primaryCta = page.getByRole("link", { name: "Take Your Seat" });
      const secondaryCta = page.getByRole("link", { name: "Explore Hospitality" });

      await expect(primaryCta).toBeVisible();
      await primaryCta.click();
      await expect(page).toHaveURL(/#tickets$/);

      await expect(secondaryCta).toBeVisible();
      await secondaryCta.click();
      await expect(page).toHaveURL(/#hospitality$/);

      expect(state.layoutShiftScore).toBeLessThan(0.001);
    });
  });

  test("reduced motion keeps the static branch visible even when data-js=true", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    await installClsObserver(page);
    await logger.step("Navigate with reduced motion enabled");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.locator(".hero-root").waitFor();

    const state = await pageEvaluateBranchDisplayState(page);
    await logBranchState(logger, "reduced-motion", state);

    await expect(page.locator("html")).toHaveAttribute("data-js", "true");
    await expect(page.locator(".hero-root > .hero-static[data-branch='static']")).toHaveCSS("display", "block");
    await expect(page.locator(".hero-root > .hero-shell[data-branch='enhanced']")).toHaveCSS("display", "none");
    expect(state.layoutShiftScore).toBeLessThan(0.001);
  });
});
