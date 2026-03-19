"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { PHASES } from "../../lib/hero/constants";
import { easeInCubic, mapRangeClamped } from "../../lib/hero/easing";
import { PORTAL_GEOMETRY } from "../../lib/hero/generated/portalGeometry";
import { computeMaxScale, computePortalLayout } from "../../lib/hero/math";

type PortalLayerProps = {
  className?: string;
  enhancedReady?: boolean;
  scrollProgress?: number;
};

type StageSize = {
  height: number;
  width: number;
};

const PORTAL_MAX_ROTATION_DEGREES = 1.5;
const ARM_SCALE_TRAVEL_RATIO = 0.85;
const SHOOTING_STAR_DELAY_MS = 2000;
const SHOOTING_STAR_DURATION_MS = 1500;
const SHOOTING_STAR_CANCEL_PROGRESS = 0.06;

function hasMeasuredStage(stageSize: StageSize): boolean {
  return stageSize.width > 0 && stageSize.height > 0;
}

function getSharedTransformOrigin(
  artboardX: number,
  artboardY: number,
  holeCenterX: number,
  holeCenterY: number,
): string {
  return `${holeCenterX - artboardX}px ${holeCenterY - artboardY}px`;
}

export function getPortalProgress(scrollProgress: number): number {
  return mapRangeClamped(scrollProgress, PHASES.PORTAL_START, PHASES.PORTAL_END, 0, 1);
}

function getPortalScaleValues(scrollProgress: number, maxScale: number): {
  armScale: number;
  cosmosScale: number;
  rotationDegrees: number;
} {
  const portalEase = easeInCubic(getPortalProgress(scrollProgress));
  const cosmosScale = 1 + portalEase * (maxScale - 1);

  return {
    armScale: 1 + (cosmosScale - 1) * ARM_SCALE_TRAVEL_RATIO,
    cosmosScale,
    rotationDegrees: portalEase * PORTAL_MAX_ROTATION_DEGREES,
  };
}

export default function PortalLayer({
  className,
  enhancedReady = false,
  scrollProgress = 0,
}: PortalLayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const latestScrollProgressRef = useRef(scrollProgress);
  const shootingStarConsumedRef = useRef(scrollProgress > SHOOTING_STAR_CANCEL_PROGRESS);
  const shootingStarDelayTimeoutRef = useRef<number | null>(null);
  const shootingStarHideTimeoutRef = useRef<number | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [showShootingStar, setShowShootingStar] = useState(false);
  const [stageSize, setStageSize] = useState<StageSize>({
    height: 0,
    width: 0,
  });

  latestScrollProgressRef.current = scrollProgress;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const clearShootingStarTimeouts = useCallback(() => {
    if (shootingStarDelayTimeoutRef.current !== null) {
      window.clearTimeout(shootingStarDelayTimeoutRef.current);
      shootingStarDelayTimeoutRef.current = null;
    }

    if (shootingStarHideTimeoutRef.current !== null) {
      window.clearTimeout(shootingStarHideTimeoutRef.current);
      shootingStarHideTimeoutRef.current = null;
    }
  }, []);

  const cancelShootingStar = useCallback(() => {
    shootingStarConsumedRef.current = true;
    clearShootingStarTimeouts();
    setShowShootingStar(false);
  }, [clearShootingStarTimeouts]);

  const scheduleShootingStar = useCallback(() => {
    if (
      !enhancedReady ||
      shootingStarConsumedRef.current ||
      shootingStarDelayTimeoutRef.current !== null
    ) {
      return;
    }

    if (latestScrollProgressRef.current > SHOOTING_STAR_CANCEL_PROGRESS) {
      cancelShootingStar();
      return;
    }

    shootingStarDelayTimeoutRef.current = window.setTimeout(() => {
      shootingStarDelayTimeoutRef.current = null;

      if (
        shootingStarConsumedRef.current ||
        latestScrollProgressRef.current > SHOOTING_STAR_CANCEL_PROGRESS
      ) {
        cancelShootingStar();
        return;
      }

      shootingStarConsumedRef.current = true;
      setShowShootingStar(true);

      shootingStarHideTimeoutRef.current = window.setTimeout(() => {
        shootingStarHideTimeoutRef.current = null;
        setShowShootingStar(false);
      }, SHOOTING_STAR_DURATION_MS);
    }, SHOOTING_STAR_DELAY_MS);
  }, [cancelShootingStar, enhancedReady]);

  useEffect(() => clearShootingStarTimeouts, [clearShootingStarTimeouts]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    if (scrollProgress > SHOOTING_STAR_CANCEL_PROGRESS && !shootingStarConsumedRef.current) {
      cancelShootingStar();
    }
  }, [cancelShootingStar, hasMounted, scrollProgress]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    if (!enhancedReady) {
      clearShootingStarTimeouts();
      setShowShootingStar(false);
      return;
    }

    scheduleShootingStar();
  }, [clearShootingStarTimeouts, enhancedReady, hasMounted, scheduleShootingStar]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    const handlePageShow = () => {
      if (latestScrollProgressRef.current > SHOOTING_STAR_CANCEL_PROGRESS) {
        cancelShootingStar();
        return;
      }

      scheduleShootingStar();
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [cancelShootingStar, hasMounted, scheduleShootingStar]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    const rootElement = rootRef.current;

    if (!rootElement) {
      return;
    }

    const measureStage = () => {
      const bounds = rootElement.getBoundingClientRect();

      setStageSize((currentSize) => {
        if (currentSize.width === bounds.width && currentSize.height === bounds.height) {
          return currentSize;
        }

        return {
          height: bounds.height,
          width: bounds.width,
        };
      });
    };

    measureStage();

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            measureStage();
          })
        : null;

    resizeObserver?.observe(rootElement);
    window.addEventListener("resize", measureStage);
    window.visualViewport?.addEventListener("resize", measureStage);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureStage);
      window.visualViewport?.removeEventListener("resize", measureStage);
    };
  }, [hasMounted]);

  const portalLayout = hasMounted && hasMeasuredStage(stageSize)
    ? computePortalLayout(stageSize.width, stageSize.height, PORTAL_GEOMETRY)
    : null;
  const isPortalVisible = scrollProgress < PHASES.PORTAL_HIDE;
  const maxScale = portalLayout
    ? computeMaxScale(
        portalLayout.holeCenter,
        portalLayout.holeRadius,
        stageSize.width,
        stageSize.height,
      )
    : 1;
  const { armScale, cosmosScale, rotationDegrees } = getPortalScaleValues(scrollProgress, maxScale);
  const sharedTransformOrigin = portalLayout
    ? getSharedTransformOrigin(
        portalLayout.artboard.x,
        portalLayout.artboard.y,
        portalLayout.holeCenter.x,
        portalLayout.holeCenter.y,
      )
    : undefined;
  const rootClassName = ["absolute inset-0 pointer-events-none", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={rootClassName}
      data-portal-active={isPortalVisible ? "true" : "false"}
      data-layer="portal-layer"
    >
      {portalLayout && isPortalVisible ? (
        <>
          <div
            className="pointer-events-none absolute z-[20]"
            data-layer="portal-cosmos"
            style={{
              height: portalLayout.artboard.height,
              left: portalLayout.artboard.x,
              top: portalLayout.artboard.y,
              transform: `scale(${cosmosScale}) rotate(${rotationDegrees}deg)`,
              transformOrigin: sharedTransformOrigin,
              willChange: "transform",
              width: portalLayout.artboard.width,
            }}
          >
            <Image
              alt=""
              className="h-full w-full object-fill"
              decoding="async"
              fill
              loading="eager"
              sizes={`${Math.ceil(portalLayout.artboard.width)}px`}
              src="/hero/portal-cosmos.webp"
              unoptimized
            />
            <div
              aria-hidden="true"
              className="hero-portal-heartbeat pointer-events-none absolute rounded-full border border-white/35 shadow-[0_0_18px_rgba(255,255,255,0.14),0_0_34px_rgba(20,95,255,0.12)]"
              data-layer="portal-ring-pulse"
              style={{
                height: portalLayout.holeRadius * 2,
                left: portalLayout.holeCenter.x - portalLayout.artboard.x - portalLayout.holeRadius,
                top: portalLayout.holeCenter.y - portalLayout.artboard.y - portalLayout.holeRadius,
                width: portalLayout.holeRadius * 2,
              }}
            />
          </div>

          <div
            className="pointer-events-none absolute z-[21]"
            data-layer="portal-arms"
            style={{
              height: portalLayout.artboard.height,
              left: portalLayout.artboard.x,
              top: portalLayout.artboard.y,
              transform: `scale(${armScale}) rotate(${rotationDegrees}deg)`,
              transformOrigin: sharedTransformOrigin,
              willChange: "transform",
              width: portalLayout.artboard.width,
            }}
          >
            <div
              className="pointer-events-none absolute"
              data-arm="left"
              style={{
                height: portalLayout.leftArm.height,
                left: portalLayout.leftArm.x - portalLayout.artboard.x,
                top: portalLayout.leftArm.y - portalLayout.artboard.y,
                width: portalLayout.leftArm.width,
              }}
            >
              <Image
                alt=""
                className="h-full w-full object-fill"
                decoding="async"
                fill
                loading="eager"
                sizes={`${Math.ceil(portalLayout.leftArm.width)}px`}
                src="/hero/arm-left.webp"
                unoptimized
              />
            </div>

            <div
              className="pointer-events-none absolute"
              data-arm="right"
              style={{
                height: portalLayout.rightArm.height,
                left: portalLayout.rightArm.x - portalLayout.artboard.x,
                top: portalLayout.rightArm.y - portalLayout.artboard.y,
                width: portalLayout.rightArm.width,
              }}
            >
              <Image
                alt=""
                className="h-full w-full object-fill"
                decoding="async"
                fill
                loading="eager"
                sizes={`${Math.ceil(portalLayout.rightArm.width)}px`}
                src="/hero/arm-right.webp"
                unoptimized
              />
            </div>
          </div>

          {showShootingStar ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[22]"
              data-layer="shooting-star"
            >
              <div className="pointer-events-none absolute left-[8%] top-[14%] rotate-[18deg] sm:left-[12%] sm:top-[18%]">
                <div className="hero-shoot h-[2px] w-[22vw] max-w-[220px] rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.94)_22%,rgba(232,204,110,0.88)_56%,rgba(232,204,110,0)_100%)] shadow-[0_0_8px_rgba(255,255,255,0.45),0_0_20px_rgba(232,204,110,0.42)]" />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
