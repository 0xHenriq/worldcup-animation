import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FRAME_MANIFEST } from "../lib/hero/generated/frameManifest";
import {
  computeCanvasScale,
  decodeFrame,
  getActiveTierLongEdge,
  getDesiredTier,
  makeGenerationToken,
  warmFrameSource,
  type DecodedFrame,
  type DesiredFrameTier,
  type FrameTier,
} from "../lib/hero/media";

const IDLE_TIMEOUT_MS = 200;
const LARGE_WINDOW_SIZE = 20;
const MEDIUM_WINDOW_SIZE = 12;
const THUMB_PREFETCH_START = {
  celebration: 0.02,
  sparkle: 0.3,
} as const;
const FRAME_TIER_RANK: Record<FrameTier, number> = {
  large: 2,
  medium: 1,
  thumb: 0,
};

type HeroFrameClip = keyof typeof FRAME_MANIFEST;

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackHandle = number;
type IdleCallback = (deadline: IdleDeadlineLike) => void;

type IdleCapableWindow = Window & {
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
  requestIdleCallback?: (
    callback: IdleCallback,
    options?: {
      timeout?: number;
    },
  ) => IdleCallbackHandle;
};

type FrameAvailability = Record<FrameTier, Set<number>>;

type DecodedFrameRecord = {
  frame: DecodedFrame;
  frameIndex: number;
  revision: number;
  tier: FrameTier;
  url: string;
};

type ResolvedDecodedFrame = {
  frameIndex: number;
  record: DecodedFrameRecord;
};

type LoaderJob =
  | {
      frameIndex: number;
      kind: "prefetch";
      tier: FrameTier;
    }
  | {
      frameIndex: number;
      kind: "sync-window";
    };

type SnapshotInputs = {
  desiredTier: DesiredFrameTier;
  enabled: boolean;
  frameCount: number;
  isVisible: boolean;
  scrollProgress: number;
  targetFrameIndex: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type LoadedFrame = {
  frame: DecodedFrame;
  frameIndex: number;
  revision: number;
  tier: FrameTier;
  url: string;
};

export type UseFrameLoaderOptions = {
  clip: HeroFrameClip;
  enabled?: boolean;
  isVisible?: boolean;
  scrollProgress?: number;
  targetFrameIndex?: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type UseFrameLoaderResult = {
  activeTier: FrameTier | null;
  activeTierLongEdge: number;
  canvasScale: number;
  desiredTier: DesiredFrameTier;
  frameCount: number;
  resolvedFrame: LoadedFrame | null;
  targetFrameIndex: number;
};

function createFrameAvailability(): FrameAvailability {
  return {
    large: new Set<number>(),
    medium: new Set<number>(),
    thumb: new Set<number>(),
  };
}

function clampFrameIndex(frameIndex: number, frameCount: number): number {
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    return 0;
  }

  if (!Number.isFinite(frameIndex)) {
    return 0;
  }

  return Math.min(frameCount - 1, Math.max(0, Math.trunc(frameIndex)));
}

function getDecodeWindowSize(desiredTier: DesiredFrameTier): number {
  return desiredTier === "large" ? LARGE_WINDOW_SIZE : MEDIUM_WINDOW_SIZE;
}

function getFrameTierRank(tier: FrameTier): number {
  return FRAME_TIER_RANK[tier];
}

function buildFrameUrl(clip: HeroFrameClip, tier: FrameTier, frameIndex: number): string {
  return `/hero/frames/${clip}/${tier}/${String(frameIndex + 1).padStart(4, "0")}.webp`;
}

function getFrameIndicesByDistance(targetFrameIndex: number, frameCount: number): number[] {
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    return [];
  }

  const clampedTargetFrameIndex = clampFrameIndex(targetFrameIndex, frameCount);
  const orderedFrameIndices: number[] = [clampedTargetFrameIndex];

  for (let offset = 1; orderedFrameIndices.length < frameCount; offset += 1) {
    const previousIndex = clampedTargetFrameIndex - offset;

    if (previousIndex >= 0) {
      orderedFrameIndices.push(previousIndex);
    }

    const nextIndex = clampedTargetFrameIndex + offset;

    if (nextIndex < frameCount) {
      orderedFrameIndices.push(nextIndex);
    }
  }

  return orderedFrameIndices;
}

function shouldStartThumbPrefetch(
  clip: HeroFrameClip,
  scrollProgress: number,
  enabled: boolean,
): boolean {
  if (!enabled) {
    return false;
  }

  if (clip === "celebration") {
    return scrollProgress > THUMB_PREFETCH_START.celebration || enabled;
  }

  return scrollProgress > THUMB_PREFETCH_START.sparkle;
}

function releaseDecodedFrame(frame: DecodedFrame): void {
  if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) {
    frame.close();
    return;
  }

  if (typeof HTMLImageElement !== "undefined" && frame instanceof HTMLImageElement) {
    frame.src = "";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function resolveNearestDecodedFrame(
  targetFrameIndex: number,
  frameCount: number,
  decodedFrames: Map<number, DecodedFrameRecord>,
): ResolvedDecodedFrame | null {
  for (const frameIndex of getFrameIndicesByDistance(targetFrameIndex, frameCount)) {
    const record = decodedFrames.get(frameIndex);

    if (record) {
      return {
        frameIndex,
        record,
      };
    }
  }

  return null;
}

function createSnapshot(
  inputs: SnapshotInputs,
  resolvedDecodedFrame: ResolvedDecodedFrame | null,
): UseFrameLoaderResult {
  const activeTier = resolvedDecodedFrame?.record.tier ?? null;
  const activeTierLongEdge = getActiveTierLongEdge(activeTier ?? "thumb");

  return {
    activeTier,
    activeTierLongEdge,
    canvasScale: computeCanvasScale(
      inputs.viewportWidth,
      inputs.viewportHeight,
      activeTierLongEdge,
    ),
    desiredTier: inputs.desiredTier,
    frameCount: inputs.frameCount,
    resolvedFrame: resolvedDecodedFrame
      ? {
          frame: resolvedDecodedFrame.record.frame,
          frameIndex: resolvedDecodedFrame.frameIndex,
          revision: resolvedDecodedFrame.record.revision,
          tier: resolvedDecodedFrame.record.tier,
          url: resolvedDecodedFrame.record.url,
        }
      : null,
    targetFrameIndex: inputs.targetFrameIndex,
  };
}

function snapshotsEqual(
  left: UseFrameLoaderResult,
  right: UseFrameLoaderResult,
): boolean {
  return (
    left.activeTier === right.activeTier &&
    left.activeTierLongEdge === right.activeTierLongEdge &&
    left.canvasScale === right.canvasScale &&
    left.desiredTier === right.desiredTier &&
    left.frameCount === right.frameCount &&
    left.targetFrameIndex === right.targetFrameIndex &&
    left.resolvedFrame?.frameIndex === right.resolvedFrame?.frameIndex &&
    left.resolvedFrame?.tier === right.resolvedFrame?.tier &&
    left.resolvedFrame?.revision === right.resolvedFrame?.revision &&
    left.resolvedFrame?.url === right.resolvedFrame?.url
  );
}

export function useFrameLoader({
  clip,
  enabled = true,
  isVisible = true,
  scrollProgress = 0,
  targetFrameIndex = 0,
  viewportHeight,
  viewportWidth,
}: UseFrameLoaderOptions): UseFrameLoaderResult {
  const frameCount = FRAME_MANIFEST[clip].count;
  const desiredTier = useMemo(
    () => getDesiredTier(viewportWidth, viewportHeight),
    [viewportHeight, viewportWidth],
  );
  const clampedTargetFrameIndex = useMemo(
    () => clampFrameIndex(targetFrameIndex, frameCount),
    [frameCount, targetFrameIndex],
  );
  const availabilityRef = useRef<FrameAvailability>(createFrameAvailability());
  const decodedFramesRef = useRef(new Map<number, DecodedFrameRecord>());
  const decodeControllersRef = useRef(new Map<string, AbortController>());
  const prefetchControllersRef = useRef(new Map<string, AbortController>());
  const currentWindowRef = useRef(new Set<number>());
  const generationRef = useRef(makeGenerationToken());
  const idleHandleRef = useRef<IdleCallbackHandle | null>(null);
  const queueTokenRef = useRef(0);
  const timeoutHandleRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const previousClipRef = useRef<HeroFrameClip>(clip);
  const previousDesiredTierRef = useRef<DesiredFrameTier>(desiredTier);
  const previousEnabledRef = useRef(enabled);
  const revisionCounterRef = useRef(0);
  const snapshotInputsRef = useRef<SnapshotInputs>({
    desiredTier,
    enabled,
    frameCount,
    isVisible,
    scrollProgress,
    targetFrameIndex: clampedTargetFrameIndex,
    viewportHeight,
    viewportWidth,
  });
  const [snapshot, setSnapshot] = useState<UseFrameLoaderResult>(() =>
    createSnapshot(
      {
        desiredTier,
        enabled,
        frameCount,
        isVisible,
        scrollProgress,
        targetFrameIndex: clampedTargetFrameIndex,
        viewportHeight,
        viewportWidth,
      },
      null,
    ),
  );

  snapshotInputsRef.current = {
    desiredTier,
    enabled,
    frameCount,
    isVisible,
    scrollProgress,
    targetFrameIndex: clampedTargetFrameIndex,
    viewportHeight,
    viewportWidth,
  };

  const publishSnapshot = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    const inputs = snapshotInputsRef.current;
    const resolvedDecodedFrame = inputs.isVisible
      ? resolveNearestDecodedFrame(
          inputs.targetFrameIndex,
          inputs.frameCount,
          decodedFramesRef.current,
        )
      : null;
    const nextSnapshot = createSnapshot(inputs, resolvedDecodedFrame);

    setSnapshot((currentSnapshot) =>
      snapshotsEqual(currentSnapshot, nextSnapshot) ? currentSnapshot : nextSnapshot,
    );
  }, []);

  const cancelScheduledWork = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const idleWindow = window as IdleCapableWindow;

    if (idleHandleRef.current !== null) {
      idleWindow.cancelIdleCallback?.(idleHandleRef.current);
      idleHandleRef.current = null;
    }

    if (timeoutHandleRef.current !== null) {
      window.clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
  }, []);

  const abortInFlightControllers = useCallback(
    (controllers: Map<string, AbortController>) => {
      for (const abortController of controllers.values()) {
        abortController.abort();
      }

      controllers.clear();
    },
    [],
  );

  const clearDecodedFrames = useCallback(
    (frameIndices?: Set<number>) => {
      let releasedAnyFrame = false;

      for (const [frameIndex, record] of decodedFramesRef.current) {
        if (frameIndices?.has(frameIndex)) {
          continue;
        }

        releaseDecodedFrame(record.frame);
        decodedFramesRef.current.delete(frameIndex);
        releasedAnyFrame = true;
      }

      if (releasedAnyFrame) {
        publishSnapshot();
      }
    },
    [publishSnapshot],
  );

  const decodeFrameAtTier = useCallback(
    async (frameIndex: number, tier: FrameTier, generation: number): Promise<void> => {
      const key = `${tier}:${frameIndex}`;
      const currentRecord = decodedFramesRef.current.get(frameIndex);

      if (generationRef.current !== generation || !snapshotInputsRef.current.enabled) {
        return;
      }

      if (currentRecord && getFrameTierRank(currentRecord.tier) >= getFrameTierRank(tier)) {
        return;
      }

      if (decodeControllersRef.current.has(key)) {
        return;
      }

      const abortController = new AbortController();
      decodeControllersRef.current.set(key, abortController);
      const frameUrl = buildFrameUrl(clip, tier, frameIndex);

      try {
        const decodedFrame = await decodeFrame(frameUrl, abortController.signal);

        if (
          abortController.signal.aborted ||
          generationRef.current !== generation ||
          !isMountedRef.current ||
          !snapshotInputsRef.current.enabled ||
          !snapshotInputsRef.current.isVisible ||
          !currentWindowRef.current.has(frameIndex)
        ) {
          releaseDecodedFrame(decodedFrame);
          return;
        }

        availabilityRef.current[tier].add(frameIndex);

        const previousRecord = decodedFramesRef.current.get(frameIndex);

        if (previousRecord && getFrameTierRank(previousRecord.tier) >= getFrameTierRank(tier)) {
          releaseDecodedFrame(decodedFrame);
          return;
        }

        if (previousRecord) {
          releaseDecodedFrame(previousRecord.frame);
        }

        revisionCounterRef.current += 1;
        decodedFramesRef.current.set(frameIndex, {
          frame: decodedFrame,
          frameIndex,
          revision: revisionCounterRef.current,
          tier,
          url: frameUrl,
        });
        publishSnapshot();
      } catch (error) {
        if (!isAbortError(error)) {
          availabilityRef.current[tier].delete(frameIndex);
        }
      } finally {
        decodeControllersRef.current.delete(key);
      }
    },
    [clip, publishSnapshot],
  );

  const prefetchFrameSource = useCallback(
    async (frameIndex: number, tier: FrameTier, generation: number): Promise<void> => {
      const key = `${tier}:${frameIndex}`;

      if (
        availabilityRef.current[tier].has(frameIndex) ||
        prefetchControllersRef.current.has(key) ||
        generationRef.current !== generation ||
        !snapshotInputsRef.current.enabled
      ) {
        return;
      }

      const abortController = new AbortController();
      prefetchControllersRef.current.set(key, abortController);

      try {
        await warmFrameSource(buildFrameUrl(clip, tier, frameIndex), abortController.signal);

        if (
          abortController.signal.aborted ||
          generationRef.current !== generation ||
          !isMountedRef.current
        ) {
          return;
        }

        availabilityRef.current[tier].add(frameIndex);

        if (snapshotInputsRef.current.isVisible && currentWindowRef.current.has(frameIndex)) {
          void decodeFrameAtTier(frameIndex, tier, generation);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          availabilityRef.current[tier].delete(frameIndex);
        }
      } finally {
        prefetchControllersRef.current.delete(key);
      }
    },
    [clip, decodeFrameAtTier],
  );

  const syncWindowFrame = useCallback(
    async (frameIndex: number, generation: number): Promise<void> => {
      if (
        generationRef.current !== generation ||
        !snapshotInputsRef.current.enabled ||
        !snapshotInputsRef.current.isVisible ||
        !currentWindowRef.current.has(frameIndex)
      ) {
        return;
      }

      const currentRecord = decodedFramesRef.current.get(frameIndex);

      if (currentRecord?.tier === desiredTier) {
        return;
      }

      if (availabilityRef.current[desiredTier].has(frameIndex)) {
        await decodeFrameAtTier(frameIndex, desiredTier, generation);
        return;
      }

      await decodeFrameAtTier(frameIndex, "thumb", generation);

      if (generationRef.current !== generation || !currentWindowRef.current.has(frameIndex)) {
        return;
      }

      void prefetchFrameSource(frameIndex, desiredTier, generation);
    },
    [decodeFrameAtTier, desiredTier, prefetchFrameSource],
  );

  const scheduleIdleTask = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") {
        return;
      }

      cancelScheduledWork();

      const idleWindow = window as IdleCapableWindow;

      if (typeof idleWindow.requestIdleCallback === "function") {
        idleHandleRef.current = idleWindow.requestIdleCallback(
          () => {
            idleHandleRef.current = null;
            callback();
          },
          { timeout: IDLE_TIMEOUT_MS },
        );
        return;
      }

      timeoutHandleRef.current = window.setTimeout(() => {
        timeoutHandleRef.current = null;
        callback();
      }, 16);
    },
    [cancelScheduledWork],
  );

  const runQueuedJobs = useCallback(
    (
      jobs: readonly LoaderJob[],
      generation: number,
      queueToken: number,
      cursor = 0,
    ): void => {
      if (
        !isMountedRef.current ||
        generationRef.current !== generation ||
        queueTokenRef.current !== queueToken ||
        cursor >= jobs.length ||
        !snapshotInputsRef.current.enabled
      ) {
        return;
      }

      scheduleIdleTask(() => {
        if (
          !isMountedRef.current ||
          generationRef.current !== generation ||
          queueTokenRef.current !== queueToken ||
          cursor >= jobs.length ||
          !snapshotInputsRef.current.enabled
        ) {
          return;
        }

        const currentJob = jobs[cursor];

        if (!currentJob) {
          return;
        }

        const currentTask =
          currentJob.kind === "prefetch"
            ? prefetchFrameSource(currentJob.frameIndex, currentJob.tier, generation)
            : syncWindowFrame(currentJob.frameIndex, generation);

        void currentTask.finally(() => {
          runQueuedJobs(jobs, generation, queueToken, cursor + 1);
        });
      });
    },
    [prefetchFrameSource, scheduleIdleTask, syncWindowFrame],
  );

  useEffect(() => {
    if (previousClipRef.current === clip) {
      return;
    }

    previousClipRef.current = clip;
    availabilityRef.current = createFrameAvailability();
    cancelScheduledWork();
    abortInFlightControllers(decodeControllersRef.current);
    abortInFlightControllers(prefetchControllersRef.current);
    currentWindowRef.current.clear();
    generationRef.current = makeGenerationToken();
    queueTokenRef.current += 1;
    clearDecodedFrames();
  }, [abortInFlightControllers, cancelScheduledWork, clearDecodedFrames, clip]);

  useEffect(() => {
    if (previousDesiredTierRef.current === desiredTier) {
      return;
    }

    previousDesiredTierRef.current = desiredTier;
    cancelScheduledWork();
    abortInFlightControllers(decodeControllersRef.current);
    abortInFlightControllers(prefetchControllersRef.current);
    generationRef.current = makeGenerationToken();
    queueTokenRef.current += 1;
    clearDecodedFrames();
  }, [abortInFlightControllers, cancelScheduledWork, clearDecodedFrames, desiredTier]);

  useEffect(() => {
    if (previousEnabledRef.current === enabled) {
      return;
    }

    previousEnabledRef.current = enabled;
    cancelScheduledWork();
    abortInFlightControllers(decodeControllersRef.current);
    abortInFlightControllers(prefetchControllersRef.current);
    generationRef.current = makeGenerationToken();
    queueTokenRef.current += 1;

    if (!enabled) {
      clearDecodedFrames();
    }
  }, [abortInFlightControllers, cancelScheduledWork, clearDecodedFrames, enabled]);

  useEffect(() => {
    const generation = generationRef.current;
    const queueToken = queueTokenRef.current + 1;
    const orderedFrameIndices = getFrameIndicesByDistance(clampedTargetFrameIndex, frameCount);
    const windowFrameIndices = new Set<number>(
      orderedFrameIndices.slice(0, getDecodeWindowSize(desiredTier)),
    );
    const queuedJobs: LoaderJob[] = [];
    const shouldWarmThumb = shouldStartThumbPrefetch(clip, scrollProgress, enabled);

    cancelScheduledWork();
    queueTokenRef.current = queueToken;
    currentWindowRef.current = windowFrameIndices;

    if (enabled && isVisible) {
      clearDecodedFrames(windowFrameIndices);
    } else {
      clearDecodedFrames();
    }

    if (!enabled || frameCount <= 0) {
      publishSnapshot();
      return;
    }

    if (isVisible && frameCount > 0) {
      const [currentFrameIndex, ...neighborFrameIndices] = orderedFrameIndices.slice(
        0,
        getDecodeWindowSize(desiredTier),
      );

      if (currentFrameIndex !== undefined) {
        void syncWindowFrame(currentFrameIndex, generation);
      }

      for (const frameIndex of neighborFrameIndices) {
        queuedJobs.push({
          frameIndex,
          kind: "sync-window",
        });
      }
    }

    if (shouldWarmThumb) {
      const visibleWindowFrameIndices = isVisible ? windowFrameIndices : new Set<number>();

      for (const frameIndex of orderedFrameIndices) {
        if (visibleWindowFrameIndices.has(frameIndex)) {
          continue;
        }

        queuedJobs.push({
          frameIndex,
          kind: "prefetch",
          tier: "thumb",
        });
      }

      for (const frameIndex of windowFrameIndices) {
        queuedJobs.push({
          frameIndex,
          kind: "prefetch",
          tier: desiredTier,
        });
      }

      for (const frameIndex of orderedFrameIndices) {
        if (windowFrameIndices.has(frameIndex)) {
          continue;
        }

        queuedJobs.push({
          frameIndex,
          kind: "prefetch",
          tier: desiredTier,
        });
      }
    }

    publishSnapshot();
    runQueuedJobs(queuedJobs, generation, queueToken);
  }, [
    cancelScheduledWork,
    clearDecodedFrames,
    clip,
    clampedTargetFrameIndex,
    desiredTier,
    enabled,
    frameCount,
    isVisible,
    publishSnapshot,
    runQueuedJobs,
    scrollProgress,
    syncWindowFrame,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    const decodeControllers = decodeControllersRef.current;
    const prefetchControllers = prefetchControllersRef.current;

    return () => {
      isMountedRef.current = false;
      cancelScheduledWork();
      queueTokenRef.current += 1;
      abortInFlightControllers(decodeControllers);
      abortInFlightControllers(prefetchControllers);
      clearDecodedFrames();
    };
  }, [abortInFlightControllers, cancelScheduledWork, clearDecodedFrames]);

  return snapshot;
}

export default useFrameLoader;
