"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import useReducedMotion from "../../hooks/useReducedMotion";
import { PHASES } from "../../lib/hero/constants";
import { mapRangeClamped } from "../../lib/hero/easing";
import { getCelebrationFrameIndex } from "../../lib/hero/frame-utils";
import FilmGrain from "./FilmGrain";
import FrameSequenceCanvas from "./FrameSequenceCanvas";
import GoldenFlash from "./GoldenFlash";
import PortalLayer from "./PortalLayer";
import SparkleOverlay from "./SparkleOverlay";
import TrophyReveal from "./TrophyReveal";

const ENHANCED_HERO_STAGE_MOUNT_THROW_QUERY_PARAM =
  "__hero_test_force_enhanced_stage_mount_throw";

type EnhancedHeroStageProps = {
  className?: string;
  enhancedReady?: boolean;
  runtimeFailed?: boolean;
  scrollProgress?: number;
  visible?: boolean;
};

export function getBackgroundBlackFadeOpacity(scrollProgress: number): number {
  return mapRangeClamped(scrollProgress, PHASES.BG_BLACK_FADE_START, PHASES.BG_BLACK_FADE_END, 0, 1);
}

export function getBlackoutOpacity(scrollProgress: number): number {
  return mapRangeClamped(scrollProgress, PHASES.BLACKOUT_START, PHASES.BLACKOUT_END, 0, 1);
}

export function getVignetteOpacity(scrollProgress: number): number {
  if (scrollProgress <= PHASES.VIGNETTE_PEAK) {
    return mapRangeClamped(
      scrollProgress,
      PHASES.VIGNETTE_START,
      PHASES.VIGNETTE_PEAK,
      0,
      0.08,
    );
  }

  return mapRangeClamped(
    scrollProgress,
    PHASES.VIGNETTE_PEAK,
    PHASES.VIGNETTE_END,
    0.08,
    0,
  );
}

export function shouldShowPosterLayer(scrollProgress: number): boolean {
  return scrollProgress < PHASES.POSTER_HIDE;
}

export function getCelebrationCanvasOpacity(scrollProgress: number): number {
  if (
    scrollProgress < PHASES.CELEBRATION_START ||
    scrollProgress >= PHASES.CELEBRATION_FADE_END
  ) {
    return 0;
  }

  if (scrollProgress <= PHASES.CELEBRATION_FADE_START) {
    return 1;
  }

  return mapRangeClamped(
    scrollProgress,
    PHASES.CELEBRATION_FADE_START,
    PHASES.CELEBRATION_FADE_END,
    1,
    0,
  );
}

export function shouldShowCelebrationCanvas(scrollProgress: number): boolean {
  return (
    scrollProgress >= PHASES.CELEBRATION_START &&
    scrollProgress < PHASES.CELEBRATION_FADE_END
  );
}

export function shouldShowAnticipationParticle(scrollProgress: number): boolean {
  return (
    getBlackoutOpacity(scrollProgress) >= 1 &&
    scrollProgress >= PHASES.ANTICIPATION_START &&
    scrollProgress < PHASES.ANTICIPATION_END &&
    scrollProgress < PHASES.TROPHY_START
  );
}

function shouldForceMountThrow(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return false;
  }

  try {
    return new URLSearchParams(window.location.search).get(
      ENHANCED_HERO_STAGE_MOUNT_THROW_QUERY_PARAM,
    ) === "1";
  } catch {
    return false;
  }
}

function setBranchVisibility(rootElement: HTMLDivElement | null, showStaticBranch: boolean) {
  const heroRoot = rootElement?.closest(".hero-root");

  if (!(heroRoot instanceof HTMLElement)) {
    return;
  }

  const staticBranch = heroRoot.querySelector<HTMLElement>(".hero-static");
  const enhancedShell = heroRoot.querySelector<HTMLElement>(".hero-shell");

  if (staticBranch) {
    staticBranch.hidden = !showStaticBranch;
    staticBranch.toggleAttribute("inert", !showStaticBranch);

    if (showStaticBranch) {
      staticBranch.removeAttribute("aria-hidden");
      staticBranch.style.display = "block";
    } else {
      staticBranch.setAttribute("aria-hidden", "true");
      staticBranch.style.display = "";
    }
  }

  if (enhancedShell) {
    enhancedShell.hidden = showStaticBranch;
    enhancedShell.toggleAttribute("inert", showStaticBranch);

    if (showStaticBranch) {
      enhancedShell.setAttribute("aria-hidden", "true");
      enhancedShell.style.display = "none";
    } else {
      enhancedShell.removeAttribute("aria-hidden");
      enhancedShell.style.display = "";
    }
  }
}

export default function EnhancedHeroStage({
  className,
  enhancedReady = false,
  runtimeFailed = false,
  scrollProgress = 0,
  visible = false,
}: EnhancedHeroStageProps) {
  if (shouldForceMountThrow()) {
    throw new Error("Forced EnhancedHeroStage mount failure for E2E fallback validation.");
  }

  const stageRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    setBranchVisibility(stageRef.current, prefersReducedMotion || runtimeFailed);
  }, [hasMounted, prefersReducedMotion, runtimeFailed]);

  const shouldRenderLayerStack = hasMounted && !prefersReducedMotion && !runtimeFailed;
  const isVisible = shouldRenderLayerStack && visible;
  const backgroundBlackFadeOpacity = getBackgroundBlackFadeOpacity(scrollProgress);
  const blackoutOpacity = getBlackoutOpacity(scrollProgress);
  const vignetteOpacity = getVignetteOpacity(scrollProgress);
  const showPosterLayer = shouldShowPosterLayer(scrollProgress);
  const celebrationCanvasOpacity = getCelebrationCanvasOpacity(scrollProgress);
  const showCelebrationCanvas = shouldShowCelebrationCanvas(scrollProgress);
  const showAnticipationParticle = shouldShowAnticipationParticle(scrollProgress);
  const rootClassName = [
    "hero-enhanced-stage absolute inset-0 overflow-hidden transition-opacity duration-500 ease-out",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={stageRef}
      className={rootClassName}
      data-client-mounted={hasMounted ? "true" : "false"}
      data-enhanced-ready={enhancedReady ? "true" : "false"}
      data-runtime-failed={runtimeFailed ? "true" : "false"}
      aria-hidden={!isVisible}
      inert={!isVisible}
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      {shouldRenderLayerStack ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 pointer-events-none"
            data-layer="background-base"
            style={{ backgroundColor: "var(--hero-color-navy)" }}
          />

          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 pointer-events-none bg-black"
            data-layer="background-black-fade"
            style={{ opacity: backgroundBlackFadeOpacity }}
          />

          {showPosterLayer ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 pointer-events-none"
              data-layer="poster"
            >
              <Image
                alt=""
                className="h-full w-full object-cover object-center"
                decoding="async"
                fill
                loading="lazy"
                sizes="100vw"
                src="/hero/stadium-poster.webp"
                unoptimized
              />
            </div>
          ) : null}

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[11] pointer-events-none"
            data-layer="celebration"
            style={{
              opacity: celebrationCanvasOpacity,
              visibility: showCelebrationCanvas ? "visible" : "hidden",
            }}
          >
            <FrameSequenceCanvas
              clip="celebration"
              getFrameIndex={getCelebrationFrameIndex}
              isVisible={isVisible && showCelebrationCanvas}
              phaseEnd={PHASES.CELEBRATION_FADE_END}
              phaseStart={PHASES.CELEBRATION_START}
              scrollProgress={scrollProgress}
            />
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[15] pointer-events-none"
            data-layer="sparkle"
          >
            <SparkleOverlay
              isVisible={isVisible && scrollProgress >= PHASES.SPARKLE_PRESHOW && scrollProgress < PHASES.SPARKLE_HIDE}
              scrollProgress={scrollProgress}
            />
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[16] pointer-events-none bg-black"
            data-layer="blackout"
            style={{ opacity: blackoutOpacity }}
          />

          {showAnticipationParticle ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-[16] pointer-events-none"
              data-layer="anticipation-particle"
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div
                  className="hero-anticipation-drift h-3 w-3 rounded-full bg-[radial-gradient(circle,var(--hero-color-gold-light)_0%,var(--hero-color-gold)_52%,rgba(201,168,76,0)_80%)] shadow-[0_0_28px_rgba(232,204,110,0.55)] sm:h-4 sm:w-4"
                />
              </div>
            </div>
          ) : null}

          <div className="absolute inset-0 z-[18]" data-layer="trophy">
            <TrophyReveal scrollProgress={scrollProgress} />
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[20] pointer-events-none"
            data-layer="portal"
          >
            <PortalLayer enhancedReady={enhancedReady} scrollProgress={scrollProgress} />
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[25] pointer-events-none"
            data-layer="golden-flash"
          >
            <GoldenFlash scrollProgress={scrollProgress} />
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[28] pointer-events-none bg-[radial-gradient(circle_at_center,transparent_38%,rgba(0,0,0,0.14)_58%,rgba(0,0,0,0.48)_78%,rgba(0,0,0,0.8)_100%)]"
            data-layer="vignette"
            style={{ opacity: vignetteOpacity }}
          />

          <div
            aria-hidden="true"
            className="absolute inset-0 z-[30] pointer-events-none"
            data-layer="film-grain"
          >
            <FilmGrain />
          </div>
        </>
      ) : null}
    </div>
  );
}
