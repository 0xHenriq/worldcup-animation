"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { COUNTDOWN_LABEL, PHASES } from "../../lib/hero/constants";
import { clamp, easeOutCubic, mapRangeClamped } from "../../lib/hero/easing";
import {
  formatAccessibleCountdownStatus,
  formatCountdown,
  getCountdownRemainingMs,
} from "./TrophyReveal.countdown";

const TROPHY_LAZY_LOAD_START = 0.5;
const TROPHY_TRANSLATE_START_PX = 30;
const TROPHY_WIDTH_DESKTOP_PX = 352;
const TROPHY_IMAGE_WIDTH = 1200;
const TROPHY_IMAGE_HEIGHT = 670;
const TROPHY_ALT_TEXT = "FIFA World Cup 2026 Trophy";
const TROPHY_DIM_BRIGHTNESS = 0.46;
const TROPHY_SPOTLIGHT_DEFAULT_X = 50;
const TROPHY_SPOTLIGHT_DEFAULT_Y = 38;
const TROPHY_SPOTLIGHT_RADIUS_FINE_PX = 120;
const TROPHY_SPOTLIGHT_RADIUS_COARSE_PX = 152;
const CTA_PRIMARY_HREF = "#tickets";
const CTA_SECONDARY_HREF = "#hospitality";
const CTA_INTERACTIVE_OPACITY_THRESHOLD = 0.8;
const LENS_FLARE_TRIGGER_OPACITY_THRESHOLD = 0.8;
const LENS_FLARE_DURATION_MS = 1_500;
const CTA_PULSE_DELAY_MS = 500;

export type TrophyRevealProps = {
  className?: string;
  scrollProgress?: number;
};

export function getTrophyEntranceProgress(scrollProgress: number): number {
  const normalizedProgress = mapRangeClamped(
    scrollProgress,
    PHASES.TROPHY_START,
    PHASES.TROPHY_END,
    0,
    1,
  );

  return easeOutCubic(normalizedProgress);
}

export function getTrophyRevealStyle(scrollProgress: number): CSSProperties {
  const entranceProgress = getTrophyEntranceProgress(scrollProgress);
  const translateY = mapRangeClamped(entranceProgress, 0, 1, TROPHY_TRANSLATE_START_PX, 0);

  return {
    opacity: entranceProgress,
    transform: `translate3d(0, ${translateY}px, 0)`,
  };
}

export function getTrophyCtaOpacity(scrollProgress: number): number {
  return mapRangeClamped(scrollProgress, PHASES.CTA_START, PHASES.CTA_END, 0, 1);
}

export function hasTrophyReachedLensFlareTrigger(scrollProgress: number): boolean {
  return getTrophyEntranceProgress(scrollProgress) >= LENS_FLARE_TRIGGER_OPACITY_THRESHOLD;
}

export function isTrophyCtaInteractive(scrollProgress: number): boolean {
  return getTrophyCtaOpacity(scrollProgress) >= CTA_INTERACTIVE_OPACITY_THRESHOLD;
}

export function getTrophySpotlightMaskStyle(
  centerXPercent: number,
  centerYPercent: number,
  isCoarsePointer: boolean,
): CSSProperties {
  const radius = isCoarsePointer ? TROPHY_SPOTLIGHT_RADIUS_COARSE_PX : TROPHY_SPOTLIGHT_RADIUS_FINE_PX;
  const innerStop = Math.round(radius * 0.48);
  const falloffStop = Math.round(radius * 0.76);
  const gradient = `radial-gradient(circle ${radius}px at ${centerXPercent}% ${centerYPercent}%, rgba(0, 0, 0, 1) 0, rgba(0, 0, 0, 1) ${innerStop}px, rgba(0, 0, 0, 0.82) ${falloffStop}px, rgba(0, 0, 0, 0) ${radius}px)`;

  return {
    WebkitMaskImage: gradient,
    maskImage: gradient,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

function getAccessibleCountdownBucket(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 0;
  }

  return Math.floor(remainingMs / 60_000);
}

function readCurrentHeroScrollProgress(fallbackProgress: number): number {
  if (typeof document === "undefined") {
    return fallbackProgress;
  }

  const heroRoot = document.querySelector<HTMLElement>(".hero-root");
  const nextProgress = Number.parseFloat(heroRoot?.dataset.heroScrollProgress ?? "");

  return Number.isFinite(nextProgress) ? nextProgress : fallbackProgress;
}

export default function TrophyReveal({
  className,
  scrollProgress = 0,
}: TrophyRevealProps) {
  const shouldRenderImage = scrollProgress > TROPHY_LAZY_LOAD_START;
  const trophyStyle = getTrophyRevealStyle(scrollProgress);
  const ctaOpacity = getTrophyCtaOpacity(scrollProgress);
  const ctaInteractive = isTrophyCtaInteractive(scrollProgress);
  const latestScrollProgressRef = useRef(scrollProgress);
  const pendingInitialRestoreSyncRef = useRef(false);
  const hasTriggeredLensFlareRef = useRef(hasTrophyReachedLensFlareTrigger(scrollProgress));
  const hasTriggeredPulseRef = useRef(ctaInteractive);
  const lensFlareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spotlightFrameRef = useRef<number | null>(null);
  const trophyContainerRef = useRef<HTMLDivElement | null>(null);
  const countdownAnnouncementBucketRef = useRef(
    getAccessibleCountdownBucket(getCountdownRemainingMs()),
  );
  const pendingSpotlightRef = useRef({
    x: TROPHY_SPOTLIGHT_DEFAULT_X,
    y: TROPHY_SPOTLIGHT_DEFAULT_Y,
  });
  const [lensFlareActive, setLensFlareActive] = useState(false);
  const [ctaPulseActive, setCtaPulseActive] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [spotlightCenter, setSpotlightCenter] = useState({
    x: TROPHY_SPOTLIGHT_DEFAULT_X,
    y: TROPHY_SPOTLIGHT_DEFAULT_Y,
  });
  const [countdownText, setCountdownText] = useState(() =>
    formatCountdown(getCountdownRemainingMs()),
  );
  const [countdownStatusText, setCountdownStatusText] = useState(() =>
    formatAccessibleCountdownStatus(getCountdownRemainingMs()),
  );
  const trophySpotlightMaskStyle = getTrophySpotlightMaskStyle(
    spotlightCenter.x,
    spotlightCenter.y,
    isCoarsePointer,
  );
  const rootClassName = [
    "absolute inset-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    latestScrollProgressRef.current = scrollProgress;
  }, [scrollProgress]);

  useLayoutEffect(() => {
    pendingInitialRestoreSyncRef.current = window.scrollY > 0;
  }, []);

  useLayoutEffect(() => {
    if (!pendingInitialRestoreSyncRef.current) {
      return;
    }

    const restoredProgress = readCurrentHeroScrollProgress(scrollProgress);

    latestScrollProgressRef.current = restoredProgress;

    if (restoredProgress > 0 || scrollProgress > 0) {
      pendingInitialRestoreSyncRef.current = false;
    }

    if (hasTrophyReachedLensFlareTrigger(restoredProgress)) {
      hasTriggeredLensFlareRef.current = true;
      setLensFlareActive(false);
    }

    if (isTrophyCtaInteractive(restoredProgress)) {
      hasTriggeredPulseRef.current = true;
    }
  }, [scrollProgress]);

  useEffect(() => {
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const syncPointerMode = () => {
      const coarsePointer = coarsePointerQuery.matches;

      setIsCoarsePointer(coarsePointer);

      if (coarsePointer) {
        setSpotlightCenter({
          x: TROPHY_SPOTLIGHT_DEFAULT_X,
          y: TROPHY_SPOTLIGHT_DEFAULT_Y,
        });
      }
    };

    syncPointerMode();
    coarsePointerQuery.addEventListener("change", syncPointerMode);

    return () => {
      coarsePointerQuery.removeEventListener("change", syncPointerMode);
    };
  }, []);

  useEffect(() => {
    const handlePageShow = () => {
      const restoredProgress = readCurrentHeroScrollProgress(latestScrollProgressRef.current);

      latestScrollProgressRef.current = restoredProgress;
      pendingInitialRestoreSyncRef.current = window.scrollY > 0;

      if (hasTrophyReachedLensFlareTrigger(restoredProgress)) {
        hasTriggeredLensFlareRef.current = true;
      }

      if (lensFlareTimeoutRef.current) {
        clearTimeout(lensFlareTimeoutRef.current);
        lensFlareTimeoutRef.current = null;
      }

      setLensFlareActive(false);

      if (isTrophyCtaInteractive(restoredProgress)) {
        hasTriggeredPulseRef.current = true;
      }

      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (lensFlareTimeoutRef.current) {
        clearTimeout(lensFlareTimeoutRef.current);
        lensFlareTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isCoarsePointer || !shouldRenderImage) {
      return;
    }

    const commitSpotlightCenter = () => {
      spotlightFrameRef.current = null;
      setSpotlightCenter(pendingSpotlightRef.current);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      const trophyContainer = trophyContainerRef.current;

      if (!trophyContainer) {
        return;
      }

      const bounds = trophyContainer.getBoundingClientRect();

      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      pendingSpotlightRef.current = {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
      };

      if (spotlightFrameRef.current !== null) {
        return;
      }

      spotlightFrameRef.current = window.requestAnimationFrame(commitSpotlightCenter);
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);

      if (spotlightFrameRef.current !== null) {
        window.cancelAnimationFrame(spotlightFrameRef.current);
        spotlightFrameRef.current = null;
      }
    };
  }, [isCoarsePointer, shouldRenderImage]);

  useEffect(() => {
    if (hasTriggeredLensFlareRef.current || !hasTrophyReachedLensFlareTrigger(scrollProgress)) {
      return;
    }

    hasTriggeredLensFlareRef.current = true;
    setLensFlareActive(true);
    lensFlareTimeoutRef.current = setTimeout(() => {
      setLensFlareActive(false);
      lensFlareTimeoutRef.current = null;
    }, LENS_FLARE_DURATION_MS);
  }, [scrollProgress]);

  useEffect(() => {
    if (!ctaInteractive) {
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }

      return;
    }

    if (hasTriggeredPulseRef.current || pulseTimeoutRef.current) {
      return;
    }

    pulseTimeoutRef.current = setTimeout(() => {
      setCtaPulseActive(true);
      hasTriggeredPulseRef.current = true;
      pulseTimeoutRef.current = null;
    }, CTA_PULSE_DELAY_MS);

    return () => {
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
    };
  }, [ctaInteractive]);

  useEffect(() => {
    const updateCountdown = () => {
      const nextRemainingMs = getCountdownRemainingMs();
      const nextAnnouncementBucket = getAccessibleCountdownBucket(nextRemainingMs);

      setCountdownText(formatCountdown(nextRemainingMs));

      if (nextAnnouncementBucket !== countdownAnnouncementBucketRef.current) {
        countdownAnnouncementBucketRef.current = nextAnnouncementBucket;
        setCountdownStatusText(formatAccessibleCountdownStatus(nextRemainingMs));
      }

      return nextRemainingMs;
    };

    if (updateCountdown() <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      if (updateCountdown() <= 0) {
        clearInterval(intervalId);
      }
    }, 1_000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className={rootClassName} data-layer="trophy-reveal">
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 sm:px-8"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <div
          ref={trophyContainerRef}
          className="pointer-events-none relative mb-8 w-full max-w-[22rem] sm:max-w-[24rem] md:max-w-[22rem]"
          style={trophyStyle}
        >
          {shouldRenderImage ? (
            <>
              <Image
                alt={TROPHY_ALT_TEXT}
                className="h-auto w-full object-contain"
                decoding="async"
                height={TROPHY_IMAGE_HEIGHT}
                loading="lazy"
                sizes={`(min-width: 1024px) ${TROPHY_WIDTH_DESKTOP_PX}px, 70vw`}
                src="/hero/trophy.webp"
                style={{ filter: `brightness(${TROPHY_DIM_BRIGHTNESS}) saturate(0.9)` }}
                unoptimized
                width={TROPHY_IMAGE_WIDTH}
              />
              <div
                aria-hidden="true"
                className={[
                  "absolute inset-0 overflow-hidden pointer-events-none",
                  isCoarsePointer ? "hero-spotlight-breathe" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={trophySpotlightMaskStyle}
              >
                <Image
                  alt=""
                  aria-hidden="true"
                  className="h-auto w-full object-contain"
                  decoding="async"
                  height={TROPHY_IMAGE_HEIGHT}
                  loading="lazy"
                  sizes={`(min-width: 1024px) ${TROPHY_WIDTH_DESKTOP_PX}px, 70vw`}
                  src="/hero/trophy.webp"
                  unoptimized
                  width={TROPHY_IMAGE_WIDTH}
                />
              </div>
              {lensFlareActive ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  data-layer="trophy-lens-flare"
                >
                  <div className="hero-flare-sweep absolute inset-y-[10%] left-[-18%] w-[46%] bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.22)_18%,rgba(255,255,255,0.94)_38%,rgba(232,204,110,0.88)_58%,rgba(255,255,255,0.16)_76%,rgba(255,255,255,0)_100%)] opacity-0 mix-blend-screen blur-[1px]" />
                  <div
                    className="hero-flare-sweep absolute inset-y-[24%] left-[-12%] w-[18%] bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.86)_52%,rgba(255,255,255,0)_100%)] opacity-0 mix-blend-screen blur-[10px]"
                    style={{ animationDelay: "60ms" }}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div
          className="flex w-full max-w-[20rem] flex-col items-center gap-3 text-center transition-opacity duration-300"
          data-layer="cta-stack"
          inert={!ctaInteractive}
          style={{
            opacity: ctaOpacity,
            pointerEvents: ctaInteractive ? "auto" : "none",
          }}
        >
          <div aria-hidden="true" className="mb-2 flex flex-col items-center gap-1 text-white">
            <p className="text-[0.7rem] font-medium tracking-[0.18em] text-white/68 uppercase">
              {COUNTDOWN_LABEL}
            </p>
            <p className="text-sm font-medium text-white/92">{countdownText}</p>
          </div>
          <p className="sr-only">{countdownStatusText}</p>
          <a
            className={[
              "w-full rounded-full border border-transparent bg-[var(--hero-color-gold)] px-6 py-3 text-base font-semibold text-black transition-[background,box-shadow,transform] duration-200 hover:bg-[linear-gradient(135deg,var(--hero-color-gold)_0%,var(--hero-color-gold-light)_100%)] hover:shadow-[0_12px_30px_rgba(201,168,76,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-color-gold-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              ctaPulseActive ? "hero-cta-pulse" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            href={CTA_PRIMARY_HREF}
          >
            Take Your Seat
          </a>
          <a
            className="text-sm font-medium tracking-[0.18em] text-white/84 uppercase transition-colors duration-200 hover:text-[var(--hero-color-gold-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-color-gold-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            href={CTA_SECONDARY_HREF}
          >
            Explore Hospitality
          </a>
        </div>
      </div>
    </div>
  );
}
