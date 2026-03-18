import type { Page } from "@playwright/test";

export const HERO_SCROLL_SELECTOR = ".hero-scroll";

export type HeroScrollMetrics = {
  containerHeight: number;
  endY: number;
  progress: number;
  scrollDistance: number;
  startY: number;
  targetY: number;
  viewportHeight: number;
};

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}

export async function scrollToProgress(
  page: Page,
  progress: number,
  selector = HERO_SCROLL_SELECTOR,
): Promise<HeroScrollMetrics> {
  const targetProgress = clampProgress(progress);
  const locator = page.locator(selector).first();

  await locator.waitFor({ state: "attached" });

  const metrics = await locator.evaluate((element, requestedProgress) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const startY = window.scrollY + rect.top;
    const containerHeight = rect.height;
    const scrollDistance = Math.max(0, containerHeight - viewportHeight);
    const endY = startY + scrollDistance;
    const targetY = startY + scrollDistance * requestedProgress;

    window.scrollTo(0, targetY);

    return {
      containerHeight,
      endY,
      progress: requestedProgress,
      scrollDistance,
      startY,
      targetY,
      viewportHeight,
    };
  }, targetProgress);

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });

  return metrics;
}
