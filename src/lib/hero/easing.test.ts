import { describe, expect, it } from "vitest";

import {
  expectCloseToZero,
  expectMonotonicallyIncreasing,
  expectWithinRange,
} from "../../../test/helpers/assertions";
import { bellCurve, clamp, easeInCubic, easeOutCubic, mapRange, mapRangeClamped } from "./easing";

const UNIT_INTERVAL_SAMPLES = Array.from({ length: 101 }, (_, index) => index / 100);

describe("easeInCubic", () => {
  it("handles boundaries, midpoint, and extrapolated inputs", () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);

    const midpoint = easeInCubic(0.5);
    expect(
      midpoint,
      `FAIL: easeInCubic(0.5) expected 0.125, got ${midpoint}. Input: 0.5`,
    ).toBe(0.125);

    expect(easeInCubic(-0.5)).toBe(-0.125);
    expect(easeInCubic(2)).toBe(8);
  });

  it("is monotonically increasing across the unit interval", () => {
    expectMonotonicallyIncreasing((sample) => easeInCubic(sample), UNIT_INTERVAL_SAMPLES, "easeInCubic");
  });
});

describe("easeOutCubic", () => {
  it("handles boundaries and preserves the cubic complement identity", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBe(0.875);
    expect(easeOutCubic(-0.5)).toBe(-2.375);
    expect(easeOutCubic(2)).toBe(2);

    for (const sample of UNIT_INTERVAL_SAMPLES) {
      expect(easeOutCubic(sample)).toBeCloseTo(1 - easeInCubic(1 - sample), 12);
    }
  });

  it("is monotonically increasing across the unit interval", () => {
    expectMonotonicallyIncreasing(
      (sample) => easeOutCubic(sample),
      UNIT_INTERVAL_SAMPLES,
      "easeOutCubic",
    );
  });
});

describe("bellCurve", () => {
  it("is zero at the boundaries and peaks at the midpoint", () => {
    expectCloseToZero(bellCurve(0), 1e-12, "bellCurve(0)");
    expectCloseToZero(bellCurve(1), 1e-12, "bellCurve(1)");
    expect(bellCurve(0.5)).toBeCloseTo(1, 12);
    expectCloseToZero(bellCurve(-1), 1e-12, "bellCurve(-1)");
    expectCloseToZero(bellCurve(2), 1e-12, "bellCurve(2)");
  });

  it("is symmetric and non-negative across the unit interval", () => {
    expect(bellCurve(0.3)).toBeCloseTo(bellCurve(0.7), 12);

    for (const sample of UNIT_INTERVAL_SAMPLES) {
      expectWithinRange(bellCurve(sample), 0, 1, `bellCurve(${sample})`);
    }
  });
});

describe("clamp", () => {
  it("clamps values into range and normalizes reversed bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-1, 10, 0)).toBe(0);
  });

  it("returns the lower bound for non-finite inputs", () => {
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(0);
  });
});

describe("mapRange", () => {
  it("maps values linearly across normal and inverted ranges", () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(0, 0, 10, 0, 100)).toBe(0);
    expect(mapRange(10, 0, 10, 0, 100)).toBe(100);
    expect(mapRange(2.5, 0, 10, 100, 0)).toBe(75);
    expect(mapRange(2.5, 10, 0, 0, 100)).toBe(75);
  });

  it("returns outMin for zero-width or non-finite inputs", () => {
    expect(mapRange(5, 10, 10, 0, 100)).toBe(0);
    expect(mapRange(Number.NaN, 0, 10, 0, 100)).toBe(0);
  });
});

describe("mapRangeClamped", () => {
  it("maps linearly while keeping the output inside the destination range", () => {
    expect(mapRangeClamped(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRangeClamped(-5, 0, 10, 0, 100)).toBe(0);
    expect(mapRangeClamped(15, 0, 10, 0, 100)).toBe(100);
    expect(mapRangeClamped(-5, 0, 10, 100, 0)).toBe(100);
    expect(mapRangeClamped(15, 0, 10, 100, 0)).toBe(0);
  });

  it("keeps inverted output ranges bounded", () => {
    for (const sample of [-10, 0, 2.5, 5, 10, 20]) {
      expectWithinRange(
        mapRangeClamped(sample, 0, 10, 100, 0),
        0,
        100,
        `mapRangeClamped(${sample}, 0, 10, 100, 0)`,
      );
    }
  });
});
