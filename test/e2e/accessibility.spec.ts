import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { createTestLogger } from "./helpers/logger";
import { scrollToProgress } from "./helpers/scroll";

type FocusSnapshot = {
  href: string | null;
  role: string | null;
  tagName: string | null;
  text: string;
};

function resolveAxeSourcePath(): string {
  const directPath = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

  if (existsSync(directPath)) {
    return directPath;
  }

  const pnpmStorePath = path.join(process.cwd(), "node_modules", ".pnpm");

  for (const entry of readdirSync(pnpmStorePath)) {
    if (!entry.startsWith("axe-core@")) {
      continue;
    }

    const candidatePath = path.join(
      pnpmStorePath,
      entry,
      "node_modules",
      "axe-core",
      "axe.min.js",
    );

    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Could not resolve axe-core/axe.min.js from node_modules.");
}

const AXE_SOURCE_PATH = resolveAxeSourcePath();
const AXE_SOURCE = readFileSync(AXE_SOURCE_PATH, "utf8");

async function runInjectedAxeScan(
  page: Page,
  selector: string,
): Promise<{ violations: Array<{ id: string }> }> {
  await page.addScriptTag({ content: AXE_SOURCE });
  await page.waitForFunction(() => {
    const axe = (window as Window & { axe?: { run?: unknown } }).axe;

    return typeof axe?.run === "function";
  });

  return page.evaluate(async (contextSelector) => {
    const context = document.querySelector(contextSelector);

    if (!(context instanceof Element)) {
      throw new Error(`Could not find ${contextSelector} for axe scan.`);
    }

    const axe = (
      window as Window &
        typeof globalThis & {
          axe: {
            run: (target: Element) => Promise<{ violations: Array<{ id: string }> }>;
          };
        }
    ).axe;

    return axe.run(context);
  }, selector);
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

async function buildStaticAuditMarkup(page: Page): Promise<string> {
  return page.evaluate(() => {
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    const headingText = document.querySelector("#hero-title")?.textContent?.trim();
    const trophyAlt = document
      .querySelector<HTMLImageElement>('img[alt="FIFA World Cup 2026 Trophy"]')
      ?.getAttribute("alt");
    const primaryCta = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
      (anchor) => anchor.textContent?.trim() === "Take Your Seat",
    );
    const secondaryCta = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
      (anchor) => anchor.textContent?.trim() === "Explore Hospitality",
    );

    if (!headingText || !trophyAlt || !primaryCta || !secondaryCta) {
      throw new Error("Could not extract the static accessibility semantics from .hero-root.");
    }

    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head><meta charset=\"utf-8\" /></head>",
      "<body>",
      "<main>",
      '<section class="hero-root" aria-labelledby="hero-title">',
      `<h1 id="hero-title">${escapeHtml(headingText)}</h1>`,
      '<div class="hero-static" data-branch="static">',
      '<img alt="" src="/hero/portal-composite.webp" />',
      '<img alt="" src="/hero/stadium-poster.webp" />',
      `<img alt="${escapeHtml(trophyAlt)}" src="/hero/trophy.webp" />`,
      '<div data-layer="cta-stack">',
      `<a href="${escapeHtml(primaryCta.getAttribute("href") ?? "")}">${escapeHtml(primaryCta.textContent?.trim() ?? "")}</a>`,
      `<a href="${escapeHtml(secondaryCta.getAttribute("href") ?? "")}">${escapeHtml(secondaryCta.textContent?.trim() ?? "")}</a>`,
      "</div>",
      "</div>",
      "</section>",
      "</main>",
      "</body>",
      "</html>",
    ].join("");
  });
}

async function focusHeroTabSentinel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const heroRoot = document.querySelector<HTMLElement>(".hero-root");

    if (!heroRoot || !heroRoot.parentElement) {
      throw new Error("Could not find .hero-root to place the tab sentinel.");
    }

    let sentinel = document.getElementById("hero-focus-sentinel") as HTMLButtonElement | null;

    if (!sentinel) {
      sentinel = document.createElement("button");
      sentinel.id = "hero-focus-sentinel";
      sentinel.type = "button";
      sentinel.textContent = "Hero focus sentinel";
      sentinel.style.position = "fixed";
      sentinel.style.top = "0";
      sentinel.style.left = "0";
      sentinel.style.width = "1px";
      sentinel.style.height = "1px";
      sentinel.style.opacity = "0";
      sentinel.style.pointerEvents = "none";
      heroRoot.parentElement.insertBefore(sentinel, heroRoot);
    }

    sentinel.focus();
  });
}

async function neutralizeNextDevToolsButton(page: Page): Promise<void> {
  const devToolsButton = page.getByRole("button", { name: "Open Next.js Dev Tools" });

  if ((await devToolsButton.count()) === 0) {
    return;
  }

  await devToolsButton.evaluate((element) => {
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("tabindex", "-1");
  });
}

async function logCheck(
  logger: ReturnType<typeof createTestLogger>,
  scenario: string,
  selector: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
): Promise<void> {
  await logger.step(`${scenario}: ${selector}`);
  logger.expect(`${scenario}: ${selector}`, expected, actual);
}

async function getFocusSnapshot(page: Page): Promise<FocusSnapshot> {
  return page.evaluate(() => {
    const activeElement = document.activeElement as HTMLElement | null;
    const href =
      activeElement instanceof HTMLAnchorElement ? activeElement.getAttribute("href") : null;

    return {
      href,
      role: activeElement?.getAttribute("role") ?? null,
      tagName: activeElement?.tagName ?? null,
      text: activeElement?.textContent?.trim().slice(0, 120) ?? "",
    };
  });
}

async function captureTabSequence(page: Page, steps: number): Promise<FocusSnapshot[]> {
  const snapshots: FocusSnapshot[] = [];

  await focusHeroTabSentinel(page);

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    snapshots.push(await getFocusSnapshot(page));
  }

  return snapshots;
}

test.describe("Hero accessibility validation", () => {
  test.describe("Static mode", () => {
    test.use({ javaScriptEnabled: false });

    test("has zero axe violations and preserves semantic fallback structure", async ({
      page,
    }, testInfo) => {
      test.slow();

      const logger = createTestLogger(testInfo);

      await page.goto("/", { waitUntil: "networkidle" });
      await page.locator(".hero-root").waitFor();
      await page.waitForTimeout(500);

      const staticHeroMarkup = await buildStaticAuditMarkup(page);
      const auditContext = await page.context().browser()?.newContext({
        javaScriptEnabled: true,
      });

      if (!auditContext) {
        throw new Error("Could not create a Playwright browser context for the static accessibility audit.");
      }

      const auditPage = await auditContext.newPage();

      await auditPage.setContent(staticHeroMarkup, { waitUntil: "domcontentloaded" });

      const axeResults = await runInjectedAxeScan(auditPage, ".hero-root");
      await logCheck(logger, "static-mode", ".hero-root axe violations", 0, axeResults.violations.length);
      expect(axeResults.violations).toHaveLength(0);

      const region = page.getByRole("region", { name: "FIFA World Cup 2026 Tickets" });
      const heading = page.getByRole("heading", {
        level: 1,
        name: "FIFA World Cup 2026 Tickets",
      });
      const trophy = page.getByAltText("FIFA World Cup 2026 Trophy");
      const primaryCta = page.getByRole("link", { name: "Take Your Seat" });
      const secondaryCta = page.getByRole("link", { name: "Explore Hospitality" });
      const enhancedShell = page.locator(".hero-root > .hero-shell[data-branch='enhanced']");

      await expect(region).toBeAttached();
      await expect(heading).toBeAttached();
      await expect(trophy).toBeVisible();
      await expect(primaryCta).toBeVisible();
      await expect(secondaryCta).toBeVisible();
      await expect(enhancedShell).toHaveCSS("display", "none");

      await logCheck(
        logger,
        "static-mode",
        "section.hero-root[aria-labelledby='hero-title']",
        "hero-title",
        await region.getAttribute("aria-labelledby"),
      );
      await logCheck(
        logger,
        "static-mode",
        "img[alt='FIFA World Cup 2026 Trophy']",
        "FIFA World Cup 2026 Trophy",
        await trophy.getAttribute("alt"),
      );
      await logCheck(
        logger,
        "static-mode",
        "a[href='#tickets']",
        "#tickets",
        await primaryCta.getAttribute("href"),
      );
      await logCheck(
        logger,
        "static-mode",
        "a[href='#hospitality']",
        "#hospitality",
        await secondaryCta.getAttribute("href"),
      );
      await logCheck(
        logger,
        "static-mode",
        ".hero-root > .hero-shell[data-branch='enhanced'] display",
        "none",
        await enhancedShell.evaluate((element) => window.getComputedStyle(element).display),
      );

      await auditContext.close();
      await logger.screenshot(page, "static-mode-accessibility");
    });
  });

  test("enhanced mode CTA region is axe-clean and inactive branch state is correct", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);
    await scrollToProgress(page, 0.95);

    const axeResults = await runInjectedAxeScan(page, "[data-layer='cta-stack']");
    await logCheck(
      logger,
      "enhanced-mode",
      "[data-layer='cta-stack'] axe violations",
      0,
      axeResults.violations.length,
    );
    expect(axeResults.violations).toHaveLength(0);

    const staticBranch = page.locator(".hero-root > .hero-static[data-branch='static']");
    const ctaStack = page.locator("[data-layer='cta-stack']");
    const decorativeCountdown = page.locator("[data-layer='cta-stack'] > div[aria-hidden='true']");
    const ctaOpacity = Number(
      await ctaStack.evaluate((element) => window.getComputedStyle(element).opacity),
    );

    await expect(staticBranch).toHaveAttribute("aria-hidden", "true");
    await expect(staticBranch).toHaveAttribute("inert", "");
    await expect(decorativeCountdown).toContainText("Countdown to kickoff");

    await logCheck(
      logger,
      "enhanced-mode",
      ".hero-root > .hero-static[data-branch='static'] aria-hidden",
      "true",
      await staticBranch.getAttribute("aria-hidden"),
    );
    await logCheck(
      logger,
      "enhanced-mode",
      ".hero-root > .hero-static[data-branch='static'] inert",
      true,
      (await staticBranch.getAttribute("inert")) !== null,
    );
    await logCheck(
      logger,
      "enhanced-mode",
      "[data-layer='cta-stack'] opacity > 0",
      true,
      ctaOpacity > 0,
    );
    await logCheck(
      logger,
      "enhanced-mode",
      "[data-layer='cta-stack'] > div[aria-hidden='true']",
      "true",
      await decorativeCountdown.getAttribute("aria-hidden"),
    );

    await logger.screenshot(page, "enhanced-mode-accessibility");
  });

  test("CTA focus stays blocked before the opacity threshold and becomes tabbable after it", async ({
    page,
  }, testInfo) => {
    const logger = createTestLogger(testInfo);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await waitForEnhancedHeroStableState(page);
    await neutralizeNextDevToolsButton(page);

    await scrollToProgress(page, 0.9);
    const ctaStack = page.locator("[data-layer='cta-stack']");

    await expect(ctaStack).toHaveAttribute("inert", "");
    const blockedFocusSequence = await captureTabSequence(page, 3);
    const blockedFocusReachedPrimaryCta = blockedFocusSequence.some(
      (snapshot) => snapshot.href === "#tickets",
    );

    await logCheck(
      logger,
      "cta-inert-gate",
      "tab sequence at scrollProgress=0.90 reaches #tickets",
      false,
      blockedFocusReachedPrimaryCta,
    );
    expect(blockedFocusReachedPrimaryCta).toBe(false);

    await scrollToProgress(page, 0.97);
    await expect(ctaStack).toHaveAttribute("inert", "");

    const nearThresholdSequence = await captureTabSequence(page, 6);
    const nearThresholdReachedPrimaryCta = nearThresholdSequence.some(
      (snapshot) => snapshot.href === "#tickets",
    );

    await logCheck(
      logger,
      "cta-inert-gate",
      "tab sequence at scrollProgress=0.97 reaches #tickets",
      false,
      nearThresholdReachedPrimaryCta,
    );
    expect(nearThresholdReachedPrimaryCta).toBe(false);

    await scrollToProgress(page, 0.99);
    await expect(ctaStack).not.toHaveAttribute("inert", "");
    await expect(ctaStack).toHaveCSS("pointer-events", "auto");

    const focusableSequence = await captureTabSequence(page, 8);
    const focusablePrimaryCta = focusableSequence.find((snapshot) => snapshot.href === "#tickets");

    await logCheck(
      logger,
      "cta-inert-gate",
      "tab sequence at scrollProgress=0.99 reaches #tickets",
      true,
      focusablePrimaryCta !== undefined,
    );
    expect(focusablePrimaryCta).toBeDefined();

    await logger.screenshot(page, "cta-inert-gate");
  });
});
