import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LogValue[]
  | { [key: string]: LogValue };

function emit(kind: string, payload: Record<string, LogValue>): void {
  console.log(JSON.stringify({ kind, ...payload }));
}

function sanitizeName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "screenshot";
}

export type TestLogger = {
  expect(description: string, expected: LogValue, actual: LogValue): void;
  screenshot(page: Page, name: string): Promise<string>;
  step(name: string): Promise<void>;
};

export function createTestLogger(testInfo?: TestInfo): TestLogger {
  return {
    async step(name) {
      emit("step", { name });
    },
    expect(description, expected, actual) {
      emit("expect", { actual, description, expected });
    },
    async screenshot(page, name) {
      const fileName = `${sanitizeName(name)}.png`;
      const outputPath = testInfo?.outputPath(fileName) ?? join("test-results", "e2e", fileName);

      mkdirSync(dirname(outputPath), { recursive: true });
      await page.screenshot({ fullPage: true, path: outputPath });
      emit("screenshot", { name, path: outputPath });

      return outputPath;
    },
  };
}

export const log = createTestLogger();
