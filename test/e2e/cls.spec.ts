import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type LayoutShiftRecord = {
  hadRecentInput: boolean;
  sources: string[];
  startTime: number;
  value: number;
};

type ClsSnapshot = {
  entries: LayoutShiftRecord[];
  value: number;
};

async function installClsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type LayoutShiftEntryWithSources = PerformanceEntry & {
      hadRecentInput?: boolean;
      sources?: Array<{ node?: Element | null }>;
      value?: number;
    };

    function serializeNode(node: Element | null | undefined): string {
      if (!(node instanceof HTMLElement)) {
        return "unknown";
      }

      const dataLayer = node.getAttribute("data-layer");
      const id = node.id ? `#${node.id}` : "";
      const classes = Array.from(node.classList)
        .slice(0, 3)
        .map((className) => `.${className}`)
        .join("");
      const layer = dataLayer ? `[data-layer="${dataLayer}"]` : "";

      return `${node.tagName.toLowerCase()}${id}${classes}${layer}`;
    }

    let cls = 0;
    const entries: LayoutShiftRecord[] = [];

    (
      window as Window & {
        __heroCls?: ClsSnapshot;
      }
    ).__heroCls = { entries: [], value: 0 };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShiftEntryWithSources[]) {
        const record = {
          hadRecentInput: Boolean(entry.hadRecentInput),
          sources: (entry.sources ?? []).map((source) => serializeNode(source.node)),
          startTime: entry.startTime,
          value: entry.value ?? 0,
        };

        entries.push(record);

        if (!record.hadRecentInput) {
          cls += record.value;
        }
      }

      (
        window as Window & {
          __heroCls?: ClsSnapshot;
        }
      ).__heroCls = {
        entries: entries.slice(),
        value: cls,
      };
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function readClsSnapshot(page: Page): Promise<ClsSnapshot> {
  return page.evaluate(() => {
    const fallback = {
      entries: [],
      value: 0,
    } satisfies ClsSnapshot;

    return (
      (
        window as Window & {
          __heroCls?: ClsSnapshot;
        }
      ).__heroCls ?? fallback
    );
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

async function expectZeroCls(
  page: Page,
  logger: ReturnType<typeof createTestLogger>,
  scenario: string,
): Promise<void> {
  const snapshot = await readClsSnapshot(page);

  await logger.step(`${scenario}: CLS snapshot`);
  logger.expect(`${scenario}: cls value`, 0, snapshot.value);

  if (snapshot.entries.length > 0) {
    logger.expect(`${scenario}: layout shift entries`, [], snapshot.entries);
  }

  expect(snapshot.value, `${scenario} produced CLS entries: ${JSON.stringify(snapshot.entries, null, 2)}`).toBe(0);
}

test.describe("Hero CLS invariants", () => {
  test("keeps CLS at zero through initial load and the enhancedReady crossfade", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(60_000);

    await installClsObserver(page);
    await logger.step("Navigate and wait for the hero to settle after enhancedReady");
    await page.goto("/");
    await waitForHeroStableState(page);
    await page.waitForTimeout(750);

    await expectZeroCls(page, logger, "initial-load-and-crossfade");
  });

  test("keeps CLS at zero while scrolling through the full hero", async ({ page }, testInfo) => {
    const logger = createTestLogger(testInfo);

    test.setTimeout(60_000);

    await installClsObserver(page);
    await logger.step("Navigate and wait for the hero to settle before scrolling");
    await page.goto("/");
    await waitForHeroStableState(page);
    await page.waitForTimeout(750);

    for (const progress of [0, 0.12, 0.25, 0.5, 0.78, 0.93, 1]) {
      await logger.step(`Scroll hero to progress ${progress.toFixed(2)}`);
      await scrollToProgress(page, progress);
    }

    await page.waitForTimeout(250);
    await expectZeroCls(page, logger, "full-hero-scroll");
  });
});
