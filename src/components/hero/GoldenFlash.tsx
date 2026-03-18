"use client";

import { useEffect, useRef } from "react";

import { PHASES } from "../../lib/hero/constants";
import { bellCurve, mapRangeClamped } from "../../lib/hero/easing";

const FLASH_PEAK_OPACITY = 0.3;

export type GoldenFlashProps = {
  className?: string;
  scrollProgress?: number;
};

export function getGoldenFlashOpacity(scrollProgress: number): number {
  const normalizedProgress = mapRangeClamped(scrollProgress, PHASES.FLASH_START, PHASES.FLASH_END, 0, 1);

  return bellCurve(normalizedProgress) * FLASH_PEAK_OPACITY;
}

export default function GoldenFlash({
  className,
  scrollProgress = 0,
}: GoldenFlashProps) {
  const latestScrollProgressRef = useRef(scrollProgress);
  const previousScrollProgressRef = useRef(scrollProgress);
  const hasFlashPlayedRef = useRef(scrollProgress > PHASES.FLASH_END);

  useEffect(() => {
    latestScrollProgressRef.current = scrollProgress;

    if (scrollProgress >= PHASES.FLASH_END) {
      hasFlashPlayedRef.current = true;
    }

    previousScrollProgressRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    const handlePageShow = () => {
      const currentScrollProgress = latestScrollProgressRef.current;

      if (currentScrollProgress >= PHASES.FLASH_END) {
        hasFlashPlayedRef.current = true;
      }

      previousScrollProgressRef.current = currentScrollProgress;
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const isMovingForward = scrollProgress >= previousScrollProgressRef.current;
  const shouldRenderFlash =
    !hasFlashPlayedRef.current &&
    isMovingForward &&
    scrollProgress >= PHASES.FLASH_START &&
    scrollProgress <= PHASES.FLASH_END;
  const opacity = shouldRenderFlash ? getGoldenFlashOpacity(scrollProgress) : 0;
  const rootClassName = ["absolute inset-0 pointer-events-none", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      aria-hidden="true"
      className={rootClassName}
      data-layer="golden-flash-overlay"
      style={{
        opacity,
        mixBlendMode: "screen",
        background:
          "radial-gradient(circle at center, rgba(232,204,110,0.96) 0%, rgba(201,168,76,0.82) 46%, rgba(73,33,0,0.12) 100%)",
      }}
    />
  );
}
