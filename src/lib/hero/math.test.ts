import { describe, expect, it, vi } from "vitest";

import { computeMaxScale, computePortalLayout, drawCover, type PortalGeometry } from "./math";

const TEST_PORTAL_GEOMETRY: PortalGeometry = {
  artboardWidth: 1920,
  artboardHeight: 1080,
  hole: {
    cx: 960,
    cy: 540,
    diameter: 400,
  },
  leftArm: {
    x: 0,
    y: 200,
    width: 700,
    height: 600,
  },
  rightArm: {
    x: 1220,
    y: 150,
    width: 700,
    height: 700,
  },
};

type DrawCall = {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
};

function createMockContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

function getDrawCall(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): DrawCall {
  const ctx = createMockContext();
  const source = {} as CanvasImageSource;

  drawCover(
    ctx as unknown as CanvasRenderingContext2D,
    source,
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
  );

  expect(ctx.drawImage).toHaveBeenCalledTimes(1);

  const firstCall = ctx.drawImage.mock.calls[0];
  if (firstCall === undefined) {
    throw new Error("drawCover did not record a drawImage call.");
  }
  const [, drawX, drawY, drawWidth, drawHeight] = firstCall;

  return {
    drawX: drawX as number,
    drawY: drawY as number,
    drawWidth: drawWidth as number,
    drawHeight: drawHeight as number,
  };
}

function expectCoverGuarantee(drawCall: DrawCall, canvasWidth: number, canvasHeight: number): void {
  expect(
    drawCall.drawX + drawCall.drawWidth >= canvasWidth ||
      drawCall.drawY + drawCall.drawHeight >= canvasHeight,
  ).toBe(true);
}

function expectCentered(drawOffset: number, drawSize: number, canvasSize: number): void {
  expect(Math.abs(drawOffset)).toBeCloseTo(Math.abs(canvasSize - drawSize - drawOffset), 9);
}

describe("drawCover", () => {
  it("draws full-frame with no cropping when the aspect ratios match", () => {
    const drawCall = getDrawCall(1920, 1080, 1600, 900);

    expect(drawCall).toEqual({
      drawX: 0,
      drawY: 0,
      drawWidth: 1600,
      drawHeight: 900,
    });
  });

  it("crops the sides for a wide source on a tall canvas", () => {
    const drawCall = getDrawCall(1920, 1080, 1080, 1920);

    expect(
      `drawCover(src=1920x1080, canvas=1080x1920): drawX=${drawCall.drawX}, drawY=${drawCall.drawY}, drawW=${drawCall.drawWidth}, drawH=${drawCall.drawHeight}`,
    ).toBeTypeOf("string");
    expect(drawCall.drawX).toBeLessThan(0);
    expect(drawCall.drawY).toBeCloseTo(0, 9);
    expectCentered(drawCall.drawX, drawCall.drawWidth, 1080);
    expectCoverGuarantee(drawCall, 1080, 1920);
  });

  it("crops the top and bottom for a tall source on a wide canvas", () => {
    const drawCall = getDrawCall(1080, 1920, 1920, 1080);

    expect(drawCall.drawX).toBeCloseTo(0, 9);
    expect(drawCall.drawY).toBeLessThan(0);
    expectCentered(drawCall.drawY, drawCall.drawHeight, 1080);
    expectCoverGuarantee(drawCall, 1920, 1080);
  });

  it("handles square sources on non-square canvases without stretching", () => {
    const drawCall = getDrawCall(1000, 1000, 1600, 900);

    expect(drawCall.drawWidth).toBe(1600);
    expect(drawCall.drawHeight).toBe(1600);
    expect(drawCall.drawY).toBe(-350);
    expectCentered(drawCall.drawY, drawCall.drawHeight, 900);
    expectCoverGuarantee(drawCall, 1600, 900);
  });

  it("handles zero dimensions gracefully", () => {
    const ctx = createMockContext();

    drawCover(ctx as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, 0, 1080, 1920, 1080);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("keeps very large dimensions finite and cover-fitted", () => {
    const drawCall = getDrawCall(1_000_000_000, 500_000_000, 10_000, 10_000);

    expect(Number.isFinite(drawCall.drawX)).toBe(true);
    expect(Number.isFinite(drawCall.drawY)).toBe(true);
    expect(Number.isFinite(drawCall.drawWidth)).toBe(true);
    expect(Number.isFinite(drawCall.drawHeight)).toBe(true);
    expectCoverGuarantee(drawCall, 10_000, 10_000);
  });
});

describe("computePortalLayout", () => {
  it("returns a 1:1 layout for a matching 1920x1080 viewport", () => {
    const layout = computePortalLayout(1920, 1080, TEST_PORTAL_GEOMETRY);

    expect(layout.scale).toBe(1);
    expect(layout.artboard).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(layout.holeCenter).toEqual({ x: 960, y: 540 });
    expect(layout.holeRadius).toBe(200);
    expect(layout.transformOrigin).toBe("960px 540px");
  });

  it("cover-fits the artboard into a portrait viewport", () => {
    const layout = computePortalLayout(1080, 1920, TEST_PORTAL_GEOMETRY);

    expect(layout.scale).toBeCloseTo(1920 / 1080, 12);
    expect(layout.artboard.x).toBeLessThan(0);
    expect(layout.artboard.y).toBeCloseTo(0, 12);
    expect(layout.artboard.width).toBeGreaterThan(1080);
    expect(layout.artboard.height).toBe(1920);
    expect(layout.holeCenter.x).toBeCloseTo(540, 9);
    expect(layout.holeCenter.y).toBeCloseTo(960, 9);
  });

  it("preserves the full frame for a same-aspect 2560x1440 viewport", () => {
    const layout = computePortalLayout(2560, 1440, TEST_PORTAL_GEOMETRY);

    expect(layout.scale).toBeCloseTo(2560 / 1920, 12);
    expect(layout.artboard).toEqual({
      x: 0,
      y: 0,
      width: 2560,
      height: 1440,
    });
    expect(layout.leftArm.x).toBeCloseTo(0, 9);
    expect(layout.rightArm.x + layout.rightArm.width).toBeCloseTo(2560, 9);
  });
});

describe("computeMaxScale", () => {
  it("matches the farthest-corner formula for a centered hole", () => {
    const centeredScale = computeMaxScale({ x: 960, y: 540 }, 200, 1920, 1080);
    const expected = (Math.hypot(960, 540) / 200) * 1.05;

    expect(centeredScale).toBeCloseTo(expected, 12);
    expect(centeredScale).toBeGreaterThan(1);
  });

  it("produces a larger scale for off-center holes", () => {
    const centeredScale = computeMaxScale({ x: 960, y: 540 }, 200, 1920, 1080);
    const offCenterScale = computeMaxScale({ x: 320, y: 240 }, 200, 1920, 1080);

    expect(offCenterScale).toBeGreaterThan(centeredScale);
  });

  it("grows substantially for very small holes", () => {
    const tinyHoleScale = computeMaxScale({ x: 960, y: 540 }, 10, 1920, 1080);

    expect(tinyHoleScale).toBeGreaterThan(100);
  });
});
