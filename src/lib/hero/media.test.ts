import { describe, it } from "vitest";

import { computeCanvasScale, getActiveTierLongEdge, getDesiredTier } from "./media";

function expectDesiredTier(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  expected: "medium" | "large",
  deviceMemory?: number,
): void {
  const actual = getDesiredTier(viewportWidth, viewportHeight, devicePixelRatio, deviceMemory);

  if (actual !== expected) {
    throw new Error(
      `getDesiredTier(viewport=${viewportWidth}x${viewportHeight}, dpr=${devicePixelRatio}): expected ${expected}, got ${actual}`,
    );
  }
}

function expectCanvasScale(
  viewportWidth: number,
  viewportHeight: number,
  activeTierLongEdge: number,
  devicePixelRatio: number,
  expected: number,
): void {
  const actual = computeCanvasScale(
    viewportWidth,
    viewportHeight,
    activeTierLongEdge,
    devicePixelRatio,
  );

  if (actual !== expected) {
    throw new Error(
      `computeCanvasScale(viewport=${viewportWidth}x${viewportHeight}, activeTierLongEdge=${activeTierLongEdge}, dpr=${devicePixelRatio}): expected ${expected}, got ${actual}`,
    );
  }
}

describe("media tier selection", () => {
  it("selects the expected tier across the canonical viewport and DPR cases", () => {
    expectDesiredTier(390, 844, 3, "large");
    expectDesiredTier(390, 844, 1, "medium");
    expectDesiredTier(1920, 1080, 1, "large");
    expectDesiredTier(500, 1000, 1, "medium");
    expectDesiredTier(500, 1100, 1, "medium");
    expectDesiredTier(500, 1101, 1, "large");
    expectDesiredTier(800, 1500, 1, "large");
  });

  it("keeps the low-memory hint on the medium tier until the 1400 long-edge cutoff", () => {
    expectDesiredTier(700, 700, 2, "medium", 4);
    expectDesiredTier(701, 700, 2, "large", 4);
  });
});

describe("media active tier long edges", () => {
  it("maps every tier name to the spec long edge", () => {
    if (getActiveTierLongEdge("thumb") !== 480) {
      throw new Error(`getActiveTierLongEdge(\"thumb\"): expected 480, got ${getActiveTierLongEdge("thumb")}`);
    }

    if (getActiveTierLongEdge("medium") !== 960) {
      throw new Error(
        `getActiveTierLongEdge(\"medium\"): expected 960, got ${getActiveTierLongEdge("medium")}`,
      );
    }

    if (getActiveTierLongEdge("large") !== 1920) {
      throw new Error(
        `getActiveTierLongEdge(\"large\"): expected 1920, got ${getActiveTierLongEdge("large")}`,
      );
    }
  });
});

describe("media canvas scale", () => {
  it("follows the backing-store scale formula and caps DPR at two", () => {
    expectCanvasScale(640, 960, 1920, 3, 2);
    expectCanvasScale(390, 844, 1920, 2, 2);
    expectCanvasScale(390, 844, 1920, 1.5, 1.5);
    expectCanvasScale(1920, 1080, 480, 2, 0.25);
  });

  it("returns the safe fallback scale for invalid inputs", () => {
    expectCanvasScale(0, 844, 1920, 2, 1);
    expectCanvasScale(390, Number.NaN, 1920, 2, 1);
    expectCanvasScale(390, 844, 0, 2, 1);
  });

  it("supports integer backing-store dimensions when the caller applies the spec rounding step", () => {
    const viewportWidth = 393;
    const viewportHeight = 851;
    const scale = computeCanvasScale(viewportWidth, viewportHeight, 960, 2);
    const canvasWidth = Math.round(viewportWidth * scale);
    const canvasHeight = Math.round(viewportHeight * scale);

    if (!Number.isInteger(canvasWidth) || !Number.isInteger(canvasHeight)) {
      throw new Error(
        `Rounded backing-store dimensions must be integers, got ${canvasWidth}x${canvasHeight}`,
      );
    }

    if (canvasWidth !== 443 || canvasHeight !== 960) {
      throw new Error(
        `Rounded backing-store dimensions: expected 443x960, got ${canvasWidth}x${canvasHeight}`,
      );
    }
  });
});
