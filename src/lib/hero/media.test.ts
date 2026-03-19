import { afterEach, describe, it, vi } from "vitest";

import {
  computeCanvasScale,
  getActiveTierLongEdge,
  getDesiredTier,
  warmFrameSource,
} from "./media";

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

const originalImage = globalThis.Image;
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalImage === undefined) {
    Reflect.deleteProperty(globalThis, "Image");
  } else {
    globalThis.Image = originalImage;
  }

  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, "fetch");
  } else {
    globalThis.fetch = originalFetch;
  }
});

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

describe("media source warming", () => {
  it("warms frame URLs through Image without routing through fetch/blob", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("warmFrameSource should not call fetch when Image is available");
    });

    let warmedUrl = "";

    class MockImage {
      public decoding = "";
      public onerror: null | (() => void) = null;
      public onload: null | (() => void) = null;
      private currentSrc = "";

      public get src(): string {
        return this.currentSrc;
      }

      public set src(value: string) {
        this.currentSrc = value;

        if (!value) {
          return;
        }

        warmedUrl = value;
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    globalThis.fetch = fetchSpy as typeof fetch;
    globalThis.Image = MockImage as unknown as typeof Image;

    await warmFrameSource("/hero/frames/celebration/thumb/0001.webp");

    if (warmedUrl !== "/hero/frames/celebration/thumb/0001.webp") {
      throw new Error(`warmFrameSource warmed the wrong URL: ${warmedUrl}`);
    }

    if (fetchSpy.mock.calls.length > 0) {
      throw new Error(`warmFrameSource should not fetch when Image exists, got ${fetchSpy.mock.calls.length} fetch call(s)`);
    }
  });

  it("rejects immediately when the warm request is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await warmFrameSource("/hero/frames/celebration/thumb/0001.webp", abortController.signal)
      .then(() => {
        throw new Error("warmFrameSource should reject aborted requests");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          throw error;
        }
      });
  });
});
