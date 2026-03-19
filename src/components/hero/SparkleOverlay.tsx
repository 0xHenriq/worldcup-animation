"use client";

import { PHASES } from "../../lib/hero/constants";
import { getSparkleFrameIndex } from "../../lib/hero/frame-utils";
import FrameSequenceCanvas from "./FrameSequenceCanvas";

export type SparkleOverlayProps = {
  className?: string;
  isVisible?: boolean;
  scrollProgress?: number;
};

export default function SparkleOverlay({
  className,
  isVisible,
  scrollProgress = 0,
}: SparkleOverlayProps) {
  const resolvedVisibility =
    isVisible ?? (scrollProgress >= PHASES.SPARKLE_PRESHOW && scrollProgress < PHASES.SPARKLE_HIDE);

  return (
    <div
      aria-hidden="true"
      className={["absolute inset-0 pointer-events-none", className].filter(Boolean).join(" ")}
      style={{
        mixBlendMode: "screen",
        visibility: resolvedVisibility ? "visible" : "hidden",
      }}
    >
      <FrameSequenceCanvas
        clip="sparkle"
        getFrameIndex={getSparkleFrameIndex}
        isVisible={resolvedVisibility}
        phaseEnd={PHASES.SPARKLE_HIDE}
        phaseStart={PHASES.SPARKLE_PRESHOW}
        scrollProgress={scrollProgress}
      />
    </div>
  );
}
