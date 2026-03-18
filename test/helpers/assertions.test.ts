import { describe, expect, it } from "vitest";
import {
  expectCloseToZero,
  expectMonotonicallyIncreasing,
  expectWithinRange,
} from "./assertions";

describe("test helpers", () => {
  it("accepts values close to zero", () => {
    expect(() => expectCloseToZero(1e-10, 1e-9, "close-to-zero smoke")).not.toThrow();
  });

  it("accepts values within a range", () => {
    expect(() => expectWithinRange(5, 1, 10, "range smoke")).not.toThrow();
  });

  it("accepts monotonically increasing functions", () => {
    expect(() =>
      expectMonotonicallyIncreasing((sample) => sample * sample, [0, 1, 2, 3], "square"),
    ).not.toThrow();
  });
});
