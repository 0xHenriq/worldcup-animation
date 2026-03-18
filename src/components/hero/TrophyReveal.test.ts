import { describe, it } from "vitest";

import { COUNTDOWN_LABEL } from "../../lib/hero/constants";
import { formatAccessibleCountdownStatus, formatCountdown } from "./TrophyReveal.countdown";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function expectFormatCountdown(inputMs: number, expected: string): void {
  const actual = formatCountdown(inputMs);

  if (actual !== expected) {
    throw new Error(`formatCountdown(${inputMs}): expected ${expected}, got ${actual}`);
  }
}

describe("formatCountdown", () => {
  it("formats a large countdown with days, hours, minutes, and seconds", () => {
    const inputMs = (90 * DAY_MS) + (5 * HOUR_MS) + (30 * MINUTE_MS) + (15 * SECOND_MS);

    expectFormatCountdown(inputMs, "90 days 05 hours 30 min 15 sec");
  });

  it("returns the completed text at zero remaining time", () => {
    expectFormatCountdown(0, "The World Cup has begun");
  });

  it("returns the completed text for negative remaining time", () => {
    expectFormatCountdown(-1, "The World Cup has begun");
  });

  it("formats exactly one second remaining", () => {
    expectFormatCountdown(SECOND_MS, "00 days 00 hours 00 min 01 sec");
  });

  it("clamps sub-second remaining time to the completed text", () => {
    expectFormatCountdown(500, "The World Cup has begun");
  });

  it("formats a full 365-day countdown correctly", () => {
    expectFormatCountdown(365 * DAY_MS, "365 days 00 hours 00 min 00 sec");
  });
});

describe("formatAccessibleCountdownStatus", () => {
  it("returns the completed text at zero remaining time", () => {
    const actual = formatAccessibleCountdownStatus(0);

    if (actual !== "The World Cup has begun") {
      throw new Error(`expected completed text, got ${actual}`);
    }
  });

  it("collapses sub-minute values into a single hidden status message", () => {
    const actual = formatAccessibleCountdownStatus(59 * SECOND_MS);
    const expected = `${COUNTDOWN_LABEL}: less than 1 minute remaining`;

    if (actual !== expected) {
      throw new Error(`expected ${expected}, got ${actual}`);
    }
  });

  it("formats accessible countdown text at minute granularity", () => {
    const actual = formatAccessibleCountdownStatus(
      (90 * DAY_MS) + (5 * HOUR_MS) + (30 * MINUTE_MS) + (15 * SECOND_MS),
    );
    const expected = `${COUNTDOWN_LABEL}: 90 days 5 hours 30 minutes remaining`;

    if (actual !== expected) {
      throw new Error(`expected ${expected}, got ${actual}`);
    }
  });
});
