import { describe, expect, it } from "vitest";

import { expectMonotonicallyIncreasing } from "../../../test/helpers/assertions";
import { PHASES, SLOW_RATE } from "./constants";
import { buildDrawKey, getCelebrationFrameIndex, getSparkleFrameIndex } from "./frame-utils";

const TYPICAL_TOTAL_FRAMES = 60;
const LAST_TYPICAL_FRAME_INDEX = TYPICAL_TOTAL_FRAMES - 1;

function getExpectedFrameAtSlowZoneStart(totalFrames: number): number {
  const lastFrameIndex = Math.max(0, totalFrames - 1);
  const celebrationSpan = PHASES.CELEBRATION_END - PHASES.CELEBRATION_START;
  const slowStartNormalized =
    (PHASES.SLOW_ZONE_START - PHASES.CELEBRATION_START) / celebrationSpan;
  const slowEndNormalized = (PHASES.SLOW_ZONE_END - PHASES.CELEBRATION_START) / celebrationSpan;
  const slowSpanNormalized = slowEndNormalized - slowStartNormalized;
  const effectiveDistance = 1 - slowSpanNormalized + slowSpanNormalized * SLOW_RATE;
  const effectiveProgressAtSlowStart = slowStartNormalized / effectiveDistance;

  return Math.floor(effectiveProgressAtSlowStart * lastFrameIndex);
}

describe("getCelebrationFrameIndex", () => {
  it("maps celebration boundaries and fade-zone hold correctly", () => {
    expect(
      getCelebrationFrameIndex(PHASES.CELEBRATION_START, TYPICAL_TOTAL_FRAMES),
      `slowZone(progress=${PHASES.CELEBRATION_START}, totalFrames=${TYPICAL_TOTAL_FRAMES}): expected frame 0, got ${getCelebrationFrameIndex(PHASES.CELEBRATION_START, TYPICAL_TOTAL_FRAMES)}`,
    ).toBe(0);

    expect(
      getCelebrationFrameIndex(PHASES.CELEBRATION_END, TYPICAL_TOTAL_FRAMES),
      `slowZone(progress=${PHASES.CELEBRATION_END}, totalFrames=${TYPICAL_TOTAL_FRAMES}): expected frame ${LAST_TYPICAL_FRAME_INDEX}, got ${getCelebrationFrameIndex(PHASES.CELEBRATION_END, TYPICAL_TOTAL_FRAMES)}`,
    ).toBe(LAST_TYPICAL_FRAME_INDEX);

    const expectedSlowStartFrame = getExpectedFrameAtSlowZoneStart(TYPICAL_TOTAL_FRAMES);
    const actualSlowStartFrame = getCelebrationFrameIndex(
      PHASES.SLOW_ZONE_START,
      TYPICAL_TOTAL_FRAMES,
    );

    expect(
      actualSlowStartFrame,
      `slowZone(progress=${PHASES.SLOW_ZONE_START}, totalFrames=${TYPICAL_TOTAL_FRAMES}): expected frame ${expectedSlowStartFrame}, got ${actualSlowStartFrame}`,
    ).toBe(expectedSlowStartFrame);

    expect(getCelebrationFrameIndex(0.56, TYPICAL_TOTAL_FRAMES)).toBe(LAST_TYPICAL_FRAME_INDEX);
    expect(getCelebrationFrameIndex(PHASES.CELEBRATION_FADE_END, TYPICAL_TOTAL_FRAMES)).toBe(
      LAST_TYPICAL_FRAME_INDEX,
    );
  });

  it("advances at half speed inside the slow zone", () => {
    const comparisonFrames = 1000;
    const outsideDelta =
      getCelebrationFrameIndex(PHASES.CELEBRATION_START + 0.02, comparisonFrames) -
      getCelebrationFrameIndex(PHASES.CELEBRATION_START, comparisonFrames);
    const insideDelta =
      getCelebrationFrameIndex(PHASES.SLOW_ZONE_START + 0.02, comparisonFrames) -
      getCelebrationFrameIndex(PHASES.SLOW_ZONE_START, comparisonFrames);
    const midpointFrame = getCelebrationFrameIndex(0.25, comparisonFrames);

    expect(midpointFrame).toBeGreaterThan(
      getCelebrationFrameIndex(PHASES.SLOW_ZONE_START, comparisonFrames),
    );
    expect(insideDelta).toBeLessThan(outsideDelta);
    expect(Math.abs(outsideDelta - insideDelta * 2)).toBeLessThanOrEqual(1);
  });

  it("is monotonically non-decreasing and reaches every frame for a typical clip", () => {
    const samples = Array.from({ length: 1001 }, (_, index) => {
      const progressDelta = PHASES.CELEBRATION_END - PHASES.CELEBRATION_START;

      return PHASES.CELEBRATION_START + (progressDelta * index) / 1000;
    });

    expectMonotonicallyIncreasing(
      (progress) => getCelebrationFrameIndex(progress, TYPICAL_TOTAL_FRAMES),
      samples,
      "getCelebrationFrameIndex",
    );

    const visitedFrames = new Set(
      samples.map((progress) => getCelebrationFrameIndex(progress, TYPICAL_TOTAL_FRAMES)),
    );

    expect(visitedFrames.size).toBe(TYPICAL_TOTAL_FRAMES);
    expect(Array.from(visitedFrames).sort((left, right) => left - right)).toEqual(
      Array.from({ length: TYPICAL_TOTAL_FRAMES }, (_, index) => index),
    );
  });

  it("handles the single-frame edge case", () => {
    expect(getCelebrationFrameIndex(PHASES.CELEBRATION_START, 1)).toBe(0);
    expect(getCelebrationFrameIndex(PHASES.CELEBRATION_END, 1)).toBe(0);
    expect(getCelebrationFrameIndex(0.56, 1)).toBe(0);
  });
});

describe("getSparkleFrameIndex", () => {
  it("maps sparkle progress linearly across the active range", () => {
    expect(getSparkleFrameIndex(PHASES.SPARKLE_START, TYPICAL_TOTAL_FRAMES)).toBe(0);
    expect(getSparkleFrameIndex(PHASES.SPARKLE_END, TYPICAL_TOTAL_FRAMES)).toBe(
      LAST_TYPICAL_FRAME_INDEX,
    );
    expect(
      getSparkleFrameIndex((PHASES.SPARKLE_START + PHASES.SPARKLE_END) / 2, TYPICAL_TOTAL_FRAMES),
    ).toBe(29);
  });
});

describe("buildDrawKey", () => {
  it("is stable for identical inputs and changes when invalidation inputs change", () => {
    const baseKey = buildDrawKey(12, "medium", 960, 540, true);

    expect(baseKey).toBe(buildDrawKey(12, "medium", 960, 540, true));
    expect(baseKey).not.toBe(buildDrawKey(13, "medium", 960, 540, true));
    expect(baseKey).not.toBe(buildDrawKey(12, "large", 960, 540, true));
    expect(baseKey).not.toBe(buildDrawKey(12, "medium", 1280, 540, true));
    expect(baseKey).not.toBe(buildDrawKey(12, "medium", 960, 720, true));
    expect(baseKey).not.toBe(buildDrawKey(12, "medium", 960, 540, false));
  });
});
