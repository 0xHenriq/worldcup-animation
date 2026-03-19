"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import useFrameLoader from "../../hooks/useFrameLoader";
import { HERO_RUNTIME_FRAME_EVENT } from "../../hooks/useHeroRuntime";
import { PHASES } from "../../lib/hero/constants";
import { buildDrawKey, getCelebrationFrameIndex, getSparkleFrameIndex } from "../../lib/hero/frame-utils";
import { FRAME_MANIFEST } from "../../lib/hero/generated/frameManifest";
import type { DecodedFrame } from "../../lib/hero/media";
import { drawCover } from "../../lib/hero/math";

type HeroFrameClip = keyof typeof FRAME_MANIFEST;

type FrameIndexResolver = (scrollProgress: number, totalFrames: number) => number;

type ViewportSize = {
  height: number;
  width: number;
};

export type FrameSequenceCanvasProps = {
  className?: string;
  clip?: HeroFrameClip;
  getFrameIndex?: FrameIndexResolver;
  isVisible?: boolean;
  phaseEnd?: number;
  phaseStart?: number;
  scrollProgress?: number;
};

const CLIP_DEFAULTS: Record<
  HeroFrameClip,
  {
    getFrameIndex: FrameIndexResolver;
    phaseEnd: number;
    phaseStart: number;
  }
> = {
  celebration: {
    getFrameIndex: getCelebrationFrameIndex,
    phaseEnd: PHASES.CELEBRATION_FADE_END,
    phaseStart: PHASES.CELEBRATION_START,
  },
  sparkle: {
    getFrameIndex: getSparkleFrameIndex,
    phaseEnd: PHASES.SPARKLE_HIDE,
    phaseStart: PHASES.SPARKLE_START,
  },
};

function getFrameSourceDimensions(frame: DecodedFrame): { height: number; width: number } {
  if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) {
    return {
      height: frame.height,
      width: frame.width,
    };
  }

  const htmlFrame = frame as HTMLImageElement;

  return {
    height: htmlFrame.naturalHeight || htmlFrame.height,
    width: htmlFrame.naturalWidth || htmlFrame.width,
  };
}

function readViewportSize(element: HTMLElement): ViewportSize {
  const rect = element.getBoundingClientRect();
  const nextWidth = Math.max(0, Math.round(rect.width));
  const nextHeight = Math.max(0, Math.round(rect.height));

  return {
    height: nextHeight,
    width: nextWidth,
  };
}

function normalizeScrollProgress(scrollProgress: number): number {
  if (!Number.isFinite(scrollProgress)) {
    return 0;
  }

  return Number(scrollProgress.toFixed(4));
}

export default function FrameSequenceCanvas({
  className,
  clip = "celebration",
  getFrameIndex,
  isVisible,
  phaseEnd,
  phaseStart,
  scrollProgress = 0,
}: FrameSequenceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDrawKeyRef = useRef<string | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });
  const clipDefaults = CLIP_DEFAULTS[clip];
  const totalFrames = FRAME_MANIFEST[clip].count;
  const resolvedPhaseStart = phaseStart ?? clipDefaults.phaseStart;
  const resolvedPhaseEnd = phaseEnd ?? clipDefaults.phaseEnd;
  const frameIndexResolver = getFrameIndex ?? clipDefaults.getFrameIndex;
  const [runtimeScrollProgress, setRuntimeScrollProgress] = useState(() =>
    normalizeScrollProgress(scrollProgress),
  );
  const resolvedVisibility =
    isVisible ??
    (runtimeScrollProgress >= resolvedPhaseStart && runtimeScrollProgress < resolvedPhaseEnd);
  const targetFrameIndex = useMemo(
    () => frameIndexResolver(runtimeScrollProgress, totalFrames),
    [frameIndexResolver, runtimeScrollProgress, totalFrames],
  );
  const { activeTier, canvasScale, resolvedFrame } = useFrameLoader({
    clip,
    enabled: true,
    isVisible: resolvedVisibility,
    scrollProgress: runtimeScrollProgress,
    targetFrameIndex,
    viewportHeight: viewportSize.height,
    viewportWidth: viewportSize.width,
  });

  useEffect(() => {
    const normalizedScrollProgress = normalizeScrollProgress(scrollProgress);

    setRuntimeScrollProgress((currentScrollProgress) =>
      currentScrollProgress === normalizedScrollProgress
        ? currentScrollProgress
        : normalizedScrollProgress,
    );
  }, [scrollProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const measurementTarget = canvas.parentElement ?? canvas;

    const syncViewportSize = () => {
      const nextViewportSize = readViewportSize(measurementTarget);

      setViewportSize((currentViewportSize) =>
        currentViewportSize.width === nextViewportSize.width &&
        currentViewportSize.height === nextViewportSize.height
          ? currentViewportSize
          : nextViewportSize,
      );
    };

    syncViewportSize();

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            syncViewportSize();
          })
        : null;

    resizeObserver?.observe(measurementTarget);
    window.addEventListener("resize", syncViewportSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncViewportSize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const heroRoot = canvas?.closest(".hero-root");

    if (!(heroRoot instanceof HTMLElement)) {
      return;
    }

    const handleRuntimeFrame = (event: Event) => {
      const nextScrollProgress = (event as CustomEvent<{ scrollProgress?: number }>).detail
        ?.scrollProgress;

      if (
        typeof nextScrollProgress !== "number" ||
        !Number.isFinite(nextScrollProgress)
      ) {
        return;
      }

      const normalizedScrollProgress = normalizeScrollProgress(nextScrollProgress);

      setRuntimeScrollProgress((currentScrollProgress) =>
        currentScrollProgress === normalizedScrollProgress
          ? currentScrollProgress
          : normalizedScrollProgress,
      );
    };

    heroRoot.addEventListener(HERO_RUNTIME_FRAME_EVENT, handleRuntimeFrame);

    return () => {
      heroRoot.removeEventListener(HERO_RUNTIME_FRAME_EVENT, handleRuntimeFrame);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const cssWidth = viewportSize.width;
    const cssHeight = viewportSize.height;

    if (cssWidth <= 0 || cssHeight <= 0) {
      return;
    }

    const backingWidth = Math.max(1, Math.round(cssWidth * canvasScale));
    const backingHeight = Math.max(1, Math.round(cssHeight * canvasScale));

    if (canvas.width !== backingWidth) {
      canvas.width = backingWidth;
    }

    if (canvas.height !== backingHeight) {
      canvas.height = backingHeight;
    }

    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const hiddenDrawKey = buildDrawKey(
      resolvedFrame?.frameIndex ?? targetFrameIndex,
      activeTier,
      backingWidth,
      backingHeight,
      false,
    );

    if (!resolvedVisibility) {
      lastDrawKeyRef.current = hiddenDrawKey;
      return;
    }

    if (!resolvedFrame) {
      lastDrawKeyRef.current = hiddenDrawKey;
      return;
    }

    const nextDrawKey = buildDrawKey(
      resolvedFrame.frameIndex,
      activeTier,
      backingWidth,
      backingHeight,
      true,
    );

    if (lastDrawKeyRef.current === nextDrawKey) {
      return;
    }

    const renderingContext = canvas.getContext("2d");

    if (!renderingContext) {
      return;
    }

    const sourceDimensions = getFrameSourceDimensions(resolvedFrame.frame);

    if (sourceDimensions.width <= 0 || sourceDimensions.height <= 0) {
      return;
    }

    drawCover(
      renderingContext,
      resolvedFrame.frame,
      sourceDimensions.width,
      sourceDimensions.height,
      backingWidth,
      backingHeight,
    );
    lastDrawKeyRef.current = nextDrawKey;
  }, [
    activeTier,
    canvasScale,
    resolvedFrame,
    resolvedVisibility,
    targetFrameIndex,
    viewportSize.height,
    viewportSize.width,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={["h-full w-full pointer-events-none", className].filter(Boolean).join(" ")}
      data-active-tier={activeTier ?? "none"}
      data-clip={clip}
      data-frame-index={resolvedFrame?.frameIndex ?? targetFrameIndex}
    />
  );
}
