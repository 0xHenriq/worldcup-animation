import { PHASES, SLOW_RATE } from "./constants";
import { clamp, mapRangeClamped } from "./easing";

export type FrameTier = "thumb" | "medium" | "large";

const NORMALIZED_CELEBRATION_SLOW_START = mapRangeClamped(
  PHASES.SLOW_ZONE_START,
  PHASES.CELEBRATION_START,
  PHASES.CELEBRATION_END,
  0,
  1,
);
const NORMALIZED_CELEBRATION_SLOW_END = mapRangeClamped(
  PHASES.SLOW_ZONE_END,
  PHASES.CELEBRATION_START,
  PHASES.CELEBRATION_END,
  0,
  1,
);
const NORMALIZED_CELEBRATION_SLOW_SPAN =
  NORMALIZED_CELEBRATION_SLOW_END - NORMALIZED_CELEBRATION_SLOW_START;
const NORMALIZED_CELEBRATION_SLOW_SPAN_AT_REDUCED_RATE =
  NORMALIZED_CELEBRATION_SLOW_SPAN * SLOW_RATE;
const NORMALIZED_CELEBRATION_EFFECTIVE_DISTANCE =
  1 - NORMALIZED_CELEBRATION_SLOW_SPAN + NORMALIZED_CELEBRATION_SLOW_SPAN_AT_REDUCED_RATE;

function getLastFrameIndex(totalFrames: number): number {
  if (!Number.isFinite(totalFrames) || totalFrames <= 1) {
    return 0;
  }

  return Math.max(0, Math.floor(totalFrames) - 1);
}

function getEffectiveCelebrationProgress(scrollProgress: number): number {
  const clampedProgress = clamp(
    scrollProgress,
    PHASES.CELEBRATION_START,
    PHASES.CELEBRATION_END,
  );
  const normalizedProgress = mapRangeClamped(
    clampedProgress,
    PHASES.CELEBRATION_START,
    PHASES.CELEBRATION_END,
    0,
    1,
  );

  // The slow zone compresses the effective scroll distance so the peak lingers.
  if (normalizedProgress < NORMALIZED_CELEBRATION_SLOW_START) {
    return normalizedProgress / NORMALIZED_CELEBRATION_EFFECTIVE_DISTANCE;
  }

  if (normalizedProgress <= NORMALIZED_CELEBRATION_SLOW_END) {
    const slowedDistance =
      NORMALIZED_CELEBRATION_SLOW_START +
      (normalizedProgress - NORMALIZED_CELEBRATION_SLOW_START) * SLOW_RATE;

    return slowedDistance / NORMALIZED_CELEBRATION_EFFECTIVE_DISTANCE;
  }

  const postSlowDistance =
    NORMALIZED_CELEBRATION_SLOW_START +
    NORMALIZED_CELEBRATION_SLOW_SPAN_AT_REDUCED_RATE +
    (normalizedProgress - NORMALIZED_CELEBRATION_SLOW_END);

  return postSlowDistance / NORMALIZED_CELEBRATION_EFFECTIVE_DISTANCE;
}

export function getCelebrationFrameIndex(scrollProgress: number, totalFrames: number): number {
  const lastFrameIndex = getLastFrameIndex(totalFrames);

  if (lastFrameIndex === 0) {
    return 0;
  }

  if (scrollProgress >= PHASES.CELEBRATION_END) {
    return lastFrameIndex;
  }

  const effectiveProgress = clamp(getEffectiveCelebrationProgress(scrollProgress), 0, 1);

  return Math.min(lastFrameIndex, Math.floor(effectiveProgress * lastFrameIndex));
}

export function getSparkleFrameIndex(scrollProgress: number, totalFrames: number): number {
  const lastFrameIndex = getLastFrameIndex(totalFrames);

  if (lastFrameIndex === 0) {
    return 0;
  }

  const frameProgress = mapRangeClamped(
    scrollProgress,
    PHASES.SPARKLE_START,
    PHASES.SPARKLE_END,
    0,
    1,
  );

  return Math.min(lastFrameIndex, Math.floor(frameProgress * lastFrameIndex));
}

export function buildDrawKey(
  frameIndex: number,
  activeTier: FrameTier | null,
  canvasWidth: number,
  canvasHeight: number,
  isVisible: boolean,
): string {
  const normalizedFrameIndex = Number.isFinite(frameIndex) ? Math.trunc(frameIndex) : "none";
  const normalizedWidth = Number.isFinite(canvasWidth) ? Math.max(0, Math.trunc(canvasWidth)) : 0;
  const normalizedHeight = Number.isFinite(canvasHeight) ? Math.max(0, Math.trunc(canvasHeight)) : 0;

  return [
    normalizedFrameIndex,
    activeTier ?? "none",
    normalizedWidth,
    normalizedHeight,
    isVisible ? "visible" : "hidden",
  ].join(":");
}
