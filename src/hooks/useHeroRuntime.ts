import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { COARSE_MULTIPLIER, DESKTOP_MULTIPLIER, PHASES } from "../lib/hero/constants";
import { clamp, easeOutCubic, mapRangeClamped } from "../lib/hero/easing";
import { PORTAL_GEOMETRY } from "../lib/hero/generated/portalGeometry";
import { decodeFrame } from "../lib/hero/media";
import { computeMaxScale, computePortalLayout, type PortalLayout } from "../lib/hero/math";

const CRITICAL_ASSET_URLS = [
  "/hero/portal-cosmos.webp",
  "/hero/arm-left.webp",
  "/hero/arm-right.webp",
  "/hero/stadium-poster.webp",
] as const;

const HERO_VH_CSS_VAR = "--hero-vh";
const HERO_SCROLL_HEIGHT_CSS_VAR = "--hero-scroll-height";
const HERO_SCROLL_PROGRESS_CSS_VAR = "--hero-scroll-progress";
const HERO_SCROLL_Y_CSS_VAR = "--hero-scroll-y";
const HERO_START_Y_CSS_VAR = "--hero-start-y";
const HERO_END_Y_CSS_VAR = "--hero-end-y";
const HERO_STAGE_WIDTH_CSS_VAR = "--hero-stage-width";
const HERO_STAGE_HEIGHT_CSS_VAR = "--hero-stage-height";
const HERO_PORTAL_ORIGIN_CSS_VAR = "--hero-portal-origin";
const HERO_PORTAL_ORIGIN_X_CSS_VAR = "--hero-portal-origin-x";
const HERO_PORTAL_ORIGIN_Y_CSS_VAR = "--hero-portal-origin-y";
const HERO_PORTAL_HOLE_RADIUS_CSS_VAR = "--hero-portal-hole-radius";
const HERO_PORTAL_MAX_SCALE_CSS_VAR = "--hero-portal-max-scale";
const SHOOTING_STAR_CANCEL_PROGRESS = 0.06;
const TROPHY_FLARE_TRIGGER_OPACITY = 0.8;
const CTA_INTERACTIVE_OPACITY_THRESHOLD = 0.8;

export type HeroRuntimeDirection = "forward" | "backward" | "none";

export type HeroOneShotRefs = {
  goldenFlashPlayedRef: React.MutableRefObject<boolean>;
  lensFlarePlayedRef: React.MutableRefObject<boolean>;
  ctaPulsePlayedRef: React.MutableRefObject<boolean>;
  shootingStarPlayedRef: React.MutableRefObject<boolean>;
};

export type HeroRuntimeFrame = {
  direction: HeroRuntimeDirection;
  heroRoot: HTMLElement;
  portalLayout: PortalLayout | null;
  scrollProgress: number;
  scrollShell: HTMLDivElement;
  stage: HTMLDivElement;
  viewportHeight: number;
  viewportWidth: number;
};

export type UseHeroRuntimeOptions = {
  disabled?: boolean;
  onAnimationFrame?: (frame: HeroRuntimeFrame) => void;
};

export type UseHeroRuntimeResult = {
  enhancedReady: boolean;
  heroRootRef: React.MutableRefObject<HTMLElement | null>;
  oneShotRefs: HeroOneShotRefs;
  refreshMeasurements: () => void;
  runtimeFailed: boolean;
  scrollProgressRef: React.MutableRefObject<number>;
  scrollShellRef: React.MutableRefObject<HTMLDivElement | null>;
  setHeroRootRef: (node: HTMLElement | null) => void;
  setScrollShellRef: (node: HTMLDivElement | null) => void;
  setStageRef: (node: HTMLDivElement | null) => void;
  stageRef: React.MutableRefObject<HTMLDivElement | null>;
};

type ViewportMetrics = {
  height: number;
  multiplier: number;
  width: number;
};

type RuntimeMeasurements = {
  endY: number;
  portalLayout: PortalLayout | null;
  stageHeight: number;
  stageWidth: number;
  startY: number;
  viewportHeight: number;
  viewportWidth: number;
};

function hasPortalGeometry(): boolean {
  return (
    Number.isFinite(PORTAL_GEOMETRY.artboardWidth) &&
    PORTAL_GEOMETRY.artboardWidth > 0 &&
    Number.isFinite(PORTAL_GEOMETRY.artboardHeight) &&
    PORTAL_GEOMETRY.artboardHeight > 0 &&
    Number.isFinite(PORTAL_GEOMETRY.hole.cx) &&
    Number.isFinite(PORTAL_GEOMETRY.hole.cy) &&
    Number.isFinite(PORTAL_GEOMETRY.hole.diameter) &&
    PORTAL_GEOMETRY.hole.diameter > 0
  );
}

function readViewportMetrics(): ViewportMetrics {
  const visualViewport = window.visualViewport;
  const height = visualViewport?.height ?? window.innerHeight;
  const width = visualViewport?.width ?? window.innerWidth;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  return {
    height,
    multiplier: coarsePointer ? COARSE_MULTIPLIER : DESKTOP_MULTIPLIER,
    width,
  };
}

function clearPortalCssVars(heroRoot: HTMLElement): void {
  heroRoot.style.removeProperty(HERO_PORTAL_ORIGIN_CSS_VAR);
  heroRoot.style.removeProperty(HERO_PORTAL_ORIGIN_X_CSS_VAR);
  heroRoot.style.removeProperty(HERO_PORTAL_ORIGIN_Y_CSS_VAR);
  heroRoot.style.removeProperty(HERO_PORTAL_HOLE_RADIUS_CSS_VAR);
  heroRoot.style.removeProperty(HERO_PORTAL_MAX_SCALE_CSS_VAR);
}

function setPortalCssVars(
  heroRoot: HTMLElement,
  portalLayout: PortalLayout,
  maxScale: number,
): void {
  heroRoot.style.setProperty(HERO_PORTAL_ORIGIN_CSS_VAR, portalLayout.transformOrigin);
  heroRoot.style.setProperty(HERO_PORTAL_ORIGIN_X_CSS_VAR, `${portalLayout.holeCenter.x}px`);
  heroRoot.style.setProperty(HERO_PORTAL_ORIGIN_Y_CSS_VAR, `${portalLayout.holeCenter.y}px`);
  heroRoot.style.setProperty(HERO_PORTAL_HOLE_RADIUS_CSS_VAR, `${portalLayout.holeRadius}px`);
  heroRoot.style.setProperty(HERO_PORTAL_MAX_SCALE_CSS_VAR, `${maxScale}`);
}

function getLensFlarePlayed(progress: number): boolean {
  return (
    easeOutCubic(
      mapRangeClamped(progress, PHASES.TROPHY_START, PHASES.TROPHY_END, 0, 1),
    ) >= TROPHY_FLARE_TRIGGER_OPACITY
  );
}

function getCtaPulsePlayed(progress: number): boolean {
  return (
    mapRangeClamped(progress, PHASES.CTA_START, PHASES.CTA_END, 0, 1) >=
    CTA_INTERACTIVE_OPACITY_THRESHOLD
  );
}

function syncDecodedAsset(decodedAsset: Awaited<ReturnType<typeof decodeFrame>>): void {
  if (typeof ImageBitmap !== "undefined" && decodedAsset instanceof ImageBitmap) {
    decodedAsset.close();
    return;
  }

  if (typeof HTMLImageElement !== "undefined" && decodedAsset instanceof HTMLImageElement) {
    decodedAsset.src = "";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useHeroRuntime({
  disabled = false,
  onAnimationFrame,
}: UseHeroRuntimeOptions = {}): UseHeroRuntimeResult {
  const heroRootRef = useRef<HTMLElement | null>(null);
  const scrollShellRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollProgressRef = useRef(0);
  const latestScrollYRef = useRef(0);
  const previousScrollProgressRef = useRef(0);
  const frameRequestRef = useRef<number | null>(null);
  const measurementDirtyRef = useRef(true);
  const resetOneShotRefsRef = useRef(true);
  const measurementsRef = useRef<RuntimeMeasurements>({
    endY: 1,
    portalLayout: null,
    stageHeight: 0,
    stageWidth: 0,
    startY: 0,
    viewportHeight: 0,
    viewportWidth: 0,
  });
  const goldenFlashPlayedRef = useRef(false);
  const lensFlarePlayedRef = useRef(false);
  const ctaPulsePlayedRef = useRef(false);
  const shootingStarPlayedRef = useRef(false);
  const [heroRootElement, setHeroRootElement] = useState<HTMLElement | null>(null);
  const [scrollShellElement, setScrollShellElement] = useState<HTMLDivElement | null>(null);
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const [criticalAssetsReady, setCriticalAssetsReady] = useState(false);
  const [stageMeasured, setStageMeasured] = useState(false);
  const [runtimeFailed, setRuntimeFailed] = useState(false);
  const geometryReady = useMemo(hasPortalGeometry, []);

  const setHeroRootRef = useCallback((node: HTMLElement | null) => {
    heroRootRef.current = node;
    setHeroRootElement(node);
  }, []);

  const setScrollShellRef = useCallback((node: HTMLDivElement | null) => {
    scrollShellRef.current = node;
    setScrollShellElement(node);
  }, []);

  const setStageRef = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    setStageElement(node);
  }, []);

  const syncOneShotRefs = useCallback((progress: number, reset: boolean) => {
    const goldenFlashPlayed = progress >= PHASES.FLASH_END;
    const lensFlarePlayed = getLensFlarePlayed(progress);
    const ctaPulsePlayed = getCtaPulsePlayed(progress);
    const shootingStarPlayed = progress > SHOOTING_STAR_CANCEL_PROGRESS;

    if (reset) {
      goldenFlashPlayedRef.current = goldenFlashPlayed;
      lensFlarePlayedRef.current = lensFlarePlayed;
      ctaPulsePlayedRef.current = ctaPulsePlayed;
      shootingStarPlayedRef.current = shootingStarPlayed;
      return;
    }

    goldenFlashPlayedRef.current ||= goldenFlashPlayed;
    lensFlarePlayedRef.current ||= lensFlarePlayed;
    ctaPulsePlayedRef.current ||= ctaPulsePlayed;
    shootingStarPlayedRef.current ||= shootingStarPlayed;
  }, []);

  const measureLayout = useCallback((): void => {
    const heroRoot = heroRootRef.current;
    const scrollShell = scrollShellRef.current;
    const stage = stageRef.current;

    if (!heroRoot || !scrollShell || !stage) {
      setStageMeasured(false);
      return;
    }

    const viewport = readViewportMetrics();
    const stageRect = stage.getBoundingClientRect();
    const scrollShellRect = scrollShell.getBoundingClientRect();
    const stageHasSize = stageRect.width > 0 && stageRect.height > 0;
    const scrollHeight = scrollShellRect.height;
    const startY = window.scrollY + scrollShellRect.top;
    const endY = startY + scrollHeight - viewport.height;

    heroRoot.style.setProperty(HERO_VH_CSS_VAR, `${viewport.height}px`);
    heroRoot.style.setProperty(HERO_SCROLL_HEIGHT_CSS_VAR, `${viewport.height * viewport.multiplier}px`);
    heroRoot.style.setProperty(HERO_START_Y_CSS_VAR, `${startY}px`);
    heroRoot.style.setProperty(HERO_END_Y_CSS_VAR, `${endY}px`);
    heroRoot.style.setProperty(HERO_STAGE_WIDTH_CSS_VAR, `${stageRect.width}px`);
    heroRoot.style.setProperty(HERO_STAGE_HEIGHT_CSS_VAR, `${stageRect.height}px`);

    measurementsRef.current.startY = startY;
    measurementsRef.current.endY = endY > startY ? endY : startY + 1;
    measurementsRef.current.viewportHeight = viewport.height;
    measurementsRef.current.viewportWidth = viewport.width;
    measurementsRef.current.stageHeight = stageRect.height;
    measurementsRef.current.stageWidth = stageRect.width;
    measurementsRef.current.portalLayout = null;

    if (geometryReady && stageHasSize) {
      const portalLayout = computePortalLayout(stageRect.width, stageRect.height, PORTAL_GEOMETRY);
      const maxScale = computeMaxScale(
        portalLayout.holeCenter,
        portalLayout.holeRadius,
        stageRect.width,
        stageRect.height,
      );

      measurementsRef.current.portalLayout = portalLayout;
      setPortalCssVars(heroRoot, portalLayout, maxScale);
    } else {
      clearPortalCssVars(heroRoot);
    }

    setStageMeasured(stageHasSize);
  }, [geometryReady]);

  const runFrame = useCallback(() => {
    frameRequestRef.current = null;

    if (disabled || runtimeFailed) {
      return;
    }

    try {
      if (measurementDirtyRef.current) {
        measureLayout();
        measurementDirtyRef.current = false;
      }

      const heroRoot = heroRootRef.current;
      const scrollShell = scrollShellRef.current;
      const stage = stageRef.current;

      if (!heroRoot || !scrollShell || !stage) {
        return;
      }

      latestScrollYRef.current = window.scrollY;

      const { endY, portalLayout, startY, viewportHeight, viewportWidth } = measurementsRef.current;
      const nextScrollProgress = clamp(
        (latestScrollYRef.current - startY) / (endY - startY),
        0,
        1,
      );
      const direction: HeroRuntimeDirection =
        nextScrollProgress === previousScrollProgressRef.current
          ? "none"
          : nextScrollProgress > previousScrollProgressRef.current
            ? "forward"
            : "backward";

      scrollProgressRef.current = nextScrollProgress;
      heroRoot.style.setProperty(HERO_SCROLL_PROGRESS_CSS_VAR, `${nextScrollProgress}`);
      heroRoot.style.setProperty(HERO_SCROLL_Y_CSS_VAR, `${latestScrollYRef.current}px`);
      heroRoot.dataset.heroScrollProgress = nextScrollProgress.toFixed(4);

      syncOneShotRefs(nextScrollProgress, resetOneShotRefsRef.current);
      resetOneShotRefsRef.current = false;
      previousScrollProgressRef.current = nextScrollProgress;

      onAnimationFrame?.({
        direction,
        heroRoot,
        portalLayout,
        scrollProgress: nextScrollProgress,
        scrollShell,
        stage,
        viewportHeight,
        viewportWidth,
      });
    } catch {
      setRuntimeFailed(true);
    }
  }, [disabled, measureLayout, onAnimationFrame, runtimeFailed, syncOneShotRefs]);

  const queueFrame = useCallback(() => {
    if (disabled || runtimeFailed || frameRequestRef.current !== null || typeof window === "undefined") {
      return;
    }

    frameRequestRef.current = window.requestAnimationFrame(runFrame);
  }, [disabled, runFrame, runtimeFailed]);

  const refreshMeasurements = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    latestScrollYRef.current = window.scrollY;
    measurementDirtyRef.current = true;
    queueFrame();
  }, [queueFrame]);

  useEffect(() => {
    if (disabled) {
      setCriticalAssetsReady(false);
      return;
    }

    let active = true;
    const abortController = new AbortController();

    const loadCriticalAssets = async () => {
      try {
        await Promise.all(
          CRITICAL_ASSET_URLS.map(async (assetUrl) => {
            const decodedAsset = await decodeFrame(assetUrl, abortController.signal);
            syncDecodedAsset(decodedAsset);
          }),
        );

        if (active) {
          setCriticalAssetsReady(true);
        }
      } catch (error) {
        if (active && !isAbortError(error)) {
          setRuntimeFailed(true);
        }
      }
    };

    setCriticalAssetsReady(false);
    void loadCriticalAssets();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [disabled]);

  useEffect(() => {
    const heroRoot = heroRootRef.current;

    if (!heroRoot) {
      return;
    }

    heroRoot.dataset.enhancedReady = !runtimeFailed && criticalAssetsReady && geometryReady && stageMeasured
      ? "true"
      : "false";
    heroRoot.dataset.runtimeFailed = runtimeFailed ? "true" : "false";
  }, [criticalAssetsReady, geometryReady, runtimeFailed, stageMeasured]);

  useEffect(() => {
    if (
      disabled ||
      runtimeFailed ||
      !heroRootElement ||
      !scrollShellElement ||
      !stageElement ||
      typeof window === "undefined"
    ) {
      return;
    }

    latestScrollYRef.current = window.scrollY;
    measurementDirtyRef.current = true;
    resetOneShotRefsRef.current = true;
    queueFrame();

    const markLayoutDirty = () => {
      measurementDirtyRef.current = true;
      queueFrame();
    };
    const handleScroll = () => {
      latestScrollYRef.current = window.scrollY;
      queueFrame();
    };
    const handlePageShow = () => {
      latestScrollYRef.current = window.scrollY;
      measurementDirtyRef.current = true;
      resetOneShotRefsRef.current = true;
      queueFrame();
    };

    const visualViewport = window.visualViewport;
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            markLayoutDirty();
          })
        : null;

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", markLayoutDirty);
    window.addEventListener("orientationchange", markLayoutDirty);
    window.addEventListener("pageshow", handlePageShow);
    visualViewport?.addEventListener("resize", markLayoutDirty);
    resizeObserver?.observe(scrollShellElement);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", markLayoutDirty);
      window.removeEventListener("orientationchange", markLayoutDirty);
      window.removeEventListener("pageshow", handlePageShow);
      visualViewport?.removeEventListener("resize", markLayoutDirty);
      resizeObserver?.disconnect();

      if (frameRequestRef.current !== null) {
        window.cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
    };
  }, [disabled, heroRootElement, queueFrame, runtimeFailed, scrollShellElement, stageElement]);

  return {
    enhancedReady: !disabled && !runtimeFailed && criticalAssetsReady && geometryReady && stageMeasured,
    heroRootRef,
    oneShotRefs: {
      ctaPulsePlayedRef,
      goldenFlashPlayedRef,
      lensFlarePlayedRef,
      shootingStarPlayedRef,
    },
    refreshMeasurements,
    runtimeFailed,
    scrollProgressRef,
    scrollShellRef,
    setHeroRootRef,
    setScrollShellRef,
    setStageRef,
    stageRef,
  };
}

export default useHeroRuntime;
