import { describe, it } from "vitest";

import { OPENING_MATCH_TARGET_ISO, PHASES, SLOW_RATE } from "./constants";

const EXPECTED_PHASES: Record<keyof typeof PHASES, number> = {
  PORTAL_START: 0,
  PORTAL_END: 0.12,
  PORTAL_HIDE: 0.14,

  VIGNETTE_START: 0,
  VIGNETTE_PEAK: 0.08,
  VIGNETTE_END: 0.14,

  FLASH_START: 0.1,
  FLASH_END: 0.13,

  CELEBRATION_START: 0.12,
  SLOW_ZONE_START: 0.2,
  SLOW_ZONE_END: 0.3,
  CELEBRATION_END: 0.55,
  CELEBRATION_FADE_START: 0.52,
  CELEBRATION_FADE_END: 0.57,

  POSTER_HIDE: 0.57,

  SPARKLE_PRESHOW: 0.43,
  SPARKLE_START: 0.45,
  SPARKLE_END: 0.75,
  SPARKLE_HIDE: 0.77,

  BG_BLACK_FADE_START: 0.3,
  BG_BLACK_FADE_END: 0.7,
  BLACKOUT_START: 0.7,
  BLACKOUT_END: 0.78,

  ANTICIPATION_START: 0.78,
  ANTICIPATION_END: 0.85,

  TROPHY_START: 0.85,
  TROPHY_END: 0.93,

  CTA_START: 0.93,
  CTA_END: 1,
};

function expectPhaseValue(name: keyof typeof PHASES, expected: number): void {
  const actual = PHASES[name];

  if (actual !== expected) {
    throw new Error(`PHASES.${name}: expected ${expected}, got ${actual}`);
  }
}

function expectStrictlyIncreasing(phaseNames: Array<keyof typeof PHASES>): void {
  for (let index = 1; index < phaseNames.length; index += 1) {
    const previousName = phaseNames[index - 1];
    const currentName = phaseNames[index];

    if (!previousName || !currentName) {
      throw new Error("Phase ordering check requires consecutive phase names");
    }

    if (PHASES[previousName] >= PHASES[currentName]) {
      throw new Error(
        `${previousName} (${PHASES[previousName]}) must be < ${currentName} (${PHASES[currentName]})`,
      );
    }
  }
}

describe("constants spec conformance", () => {
  it("matches every PHASES value to the spec exactly", () => {
    for (const [name, expected] of Object.entries(EXPECTED_PHASES) as Array<
      [keyof typeof PHASES, number]
    >) {
      expectPhaseValue(name, expected);
    }
  });

  it("keeps every phase value within the [0, 1] range", () => {
    for (const [name, value] of Object.entries(PHASES) as Array<[keyof typeof PHASES, number]>) {
      if (value < 0 || value > 1) {
        throw new Error(`PHASES.${name} must stay within [0, 1], got ${value}`);
      }
    }
  });

  it("preserves the required phase ordering invariants", () => {
    expectStrictlyIncreasing(["PORTAL_START", "PORTAL_END", "PORTAL_HIDE"]);
    expectStrictlyIncreasing([
      "CELEBRATION_START",
      "SLOW_ZONE_START",
      "SLOW_ZONE_END",
      "CELEBRATION_END",
      "CELEBRATION_FADE_END",
    ]);
    expectStrictlyIncreasing(["SPARKLE_PRESHOW", "SPARKLE_START", "SPARKLE_END", "SPARKLE_HIDE"]);
    expectStrictlyIncreasing(["BLACKOUT_START", "BLACKOUT_END"]);
    expectStrictlyIncreasing(["TROPHY_START", "TROPHY_END"]);
    expectStrictlyIncreasing(["CTA_START", "CTA_END"]);
    expectStrictlyIncreasing(["BG_BLACK_FADE_START", "BG_BLACK_FADE_END"]);

    if (PHASES.BG_BLACK_FADE_END > PHASES.BLACKOUT_START) {
      throw new Error(
        `BG_BLACK_FADE_END (${PHASES.BG_BLACK_FADE_END}) must be <= BLACKOUT_START (${PHASES.BLACKOUT_START})`,
      );
    }
  });

  it("uses a valid ISO countdown target", () => {
    if (!Number.isFinite(Date.parse(OPENING_MATCH_TARGET_ISO))) {
      throw new Error(`OPENING_MATCH_TARGET_ISO must be a valid ISO date, got ${OPENING_MATCH_TARGET_ISO}`);
    }
  });

  it("keeps SLOW_RATE strictly between zero and one", () => {
    if (!(SLOW_RATE > 0 && SLOW_RATE < 1)) {
      throw new Error(`SLOW_RATE must be between 0 and 1 exclusive, got ${SLOW_RATE}`);
    }
  });

  it("keeps the opening match countdown target in the future until kickoff", () => {
    const targetTimestamp = Date.parse(OPENING_MATCH_TARGET_ISO);

    if (!(targetTimestamp > Date.now())) {
      throw new Error(
        `OPENING_MATCH_TARGET_ISO must stay in the future until kickoff, got ${OPENING_MATCH_TARGET_ISO}`,
      );
    }
  });
});
