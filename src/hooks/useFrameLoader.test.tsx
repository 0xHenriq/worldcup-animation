// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecodedFrame } from "../lib/hero/media";
import useFrameLoader from "./useFrameLoader";
import * as media from "../lib/hero/media";

vi.mock("../lib/hero/media", async () => {
  const actual = await vi.importActual<typeof import("../lib/hero/media")>("../lib/hero/media");

  return {
    ...actual,
    decodeFrame: vi.fn(),
    warmFrameSource: vi.fn(),
  };
});

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  ) => number;
};

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function installIdleCallbackPolyfill(): void {
  const idleWindow = window as IdleWindow;

  idleWindow.requestIdleCallback = (callback) =>
    window.setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      });
    }, 0);
  idleWindow.cancelIdleCallback = (handle) => {
    window.clearTimeout(handle);
  };
}

async function flushLoaderWork(): Promise<void> {
  await act(async () => {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  });
}

function createDecodedFrame(): DecodedFrame {
  return {
    height: 1080,
    naturalHeight: 1080,
    naturalWidth: 1920,
    src: "/hero/frames/celebration/thumb/0001.webp",
    width: 1920,
  } as unknown as DecodedFrame;
}

function createDeferredValue<T>(): DeferredValue<T> {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  if (!resolve) {
    throw new Error("Deferred promise resolver was not initialized.");
  }

  return {
    promise,
    resolve,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  installIdleCallbackPolyfill();
  vi.mocked(media.warmFrameSource).mockResolvedValue(undefined);
  vi.mocked(media.decodeFrame).mockResolvedValue(createDecodedFrame());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(window, "cancelIdleCallback");
});

describe("useFrameLoader", () => {
  it("does not start loader work before the viewport has been measured", async () => {
    renderHook(() =>
      useFrameLoader({
        clip: "celebration",
        enabled: true,
        isVisible: false,
        scrollProgress: 0.03,
        targetFrameIndex: 0,
        viewportHeight: 0,
        viewportWidth: 0,
      }),
    );

    await flushLoaderWork();

    expect(media.warmFrameSource).not.toHaveBeenCalled();
    expect(media.decodeFrame).not.toHaveBeenCalled();
  });

  it("does not start celebration thumb prefetch before the celebration threshold", async () => {
    renderHook(() =>
      useFrameLoader({
        clip: "celebration",
        enabled: true,
        isVisible: false,
        scrollProgress: 0,
        targetFrameIndex: 0,
        viewportHeight: 1080,
        viewportWidth: 1920,
      }),
    );

    await flushLoaderWork();

    expect(media.warmFrameSource).not.toHaveBeenCalled();
    expect(media.decodeFrame).not.toHaveBeenCalled();
  });

  it("starts celebration thumb prefetch once the threshold is crossed", async () => {
    renderHook(() =>
      useFrameLoader({
        clip: "celebration",
        enabled: true,
        isVisible: false,
        scrollProgress: 0.03,
        targetFrameIndex: 0,
        viewportHeight: 1080,
        viewportWidth: 1920,
      }),
    );

    await flushLoaderWork();

    expect(media.warmFrameSource).toHaveBeenCalled();
    expect(media.warmFrameSource).toHaveBeenCalledWith(
      "/hero/frames/celebration/thumb/0001.webp",
      expect.any(AbortSignal),
    );
  });

  it("decodes the hidden sparkle target frame once sparkle prefetch is eligible", async () => {
    renderHook(() =>
      useFrameLoader({
        clip: "sparkle",
        enabled: true,
        isVisible: false,
        scrollProgress: 0.31,
        targetFrameIndex: 0,
        viewportHeight: 1080,
        viewportWidth: 1920,
      }),
    );

    await flushLoaderWork();

    expect(media.decodeFrame).toHaveBeenCalledWith(
      "/hero/frames/sparkle/thumb/0001.webp",
      expect.any(AbortSignal),
    );
  });

  it("decodes the visible target frame once loader work is enabled", async () => {
    const { result } = renderHook(() =>
      useFrameLoader({
        clip: "celebration",
        enabled: true,
        isVisible: true,
        scrollProgress: 0.12,
        targetFrameIndex: 0,
        viewportHeight: 1080,
        viewportWidth: 1920,
      }),
    );

    await flushLoaderWork();

    expect(media.decodeFrame).toHaveBeenCalledWith(
      "/hero/frames/celebration/thumb/0001.webp",
      expect.any(AbortSignal),
    );
    expect(vi.mocked(media.decodeFrame).mock.calls[0]?.[0]).toBe(
      "/hero/frames/celebration/thumb/0001.webp",
    );
    expect(result.current.resolvedFrame?.frameIndex).toBe(0);
    expect(result.current.resolvedFrame).not.toBeNull();
  });

  it("keeps the nearest decoded frame available when the target jumps during a visible decode", async () => {
    const deferredFrames = new Map<string, DeferredValue<DecodedFrame>>();

    vi.mocked(media.decodeFrame).mockImplementation((url: string) => {
      const deferredFrame = createDeferredValue<DecodedFrame>();
      deferredFrames.set(url, deferredFrame);
      return deferredFrame.promise;
    });

    const { result, rerender } = renderHook(
      ({ scrollProgress, targetFrameIndex }) =>
        useFrameLoader({
          clip: "celebration",
          enabled: true,
          isVisible: true,
          scrollProgress,
          targetFrameIndex,
          viewportHeight: 1080,
          viewportWidth: 1920,
        }),
      {
        initialProps: {
          scrollProgress: 0.12,
          targetFrameIndex: 0,
        },
      },
    );

    rerender({
      scrollProgress: 0.22,
      targetFrameIndex: 10,
    });

    const initialFrame = deferredFrames.get("/hero/frames/celebration/thumb/0001.webp");

    if (!initialFrame) {
      throw new Error("Expected the initial visible-frame decode to begin at thumb/0001.webp.");
    }

    await act(async () => {
      initialFrame.resolve(createDecodedFrame());
      await Promise.resolve();
    });

    expect(result.current.resolvedFrame?.frameIndex).toBe(0);
    expect(result.current.resolvedFrame?.tier).toBe("thumb");
  });

  it("retains the current target frame while hidden so reverse-scroll reentry does not force a fresh decode", async () => {
    const { result, rerender } = renderHook(
      ({ isVisible }) =>
        useFrameLoader({
          clip: "sparkle",
          enabled: true,
          isVisible,
          scrollProgress: 0.72,
          targetFrameIndex: 54,
          viewportHeight: 1080,
          viewportWidth: 1920,
        }),
      {
        initialProps: {
          isVisible: true,
        },
      },
    );

    await flushLoaderWork();

    const decodeCallCountAfterVisibleLoad = vi.mocked(media.decodeFrame).mock.calls.length;

    expect(result.current.resolvedFrame?.frameIndex).toBe(54);

    rerender({
      isVisible: false,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.resolvedFrame).toBeNull();

    rerender({
      isVisible: true,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.resolvedFrame?.frameIndex).toBe(54);
    expect(vi.mocked(media.decodeFrame).mock.calls.length).toBe(decodeCallCountAfterVisibleLoad);
  });

  it("retains the nearest decoded fallback when the canvas becomes visible before the new target frame decodes", async () => {
    const pendingVisibleDecode = createDeferredValue<DecodedFrame>();

    vi.mocked(media.decodeFrame).mockImplementation((url: string) => {
      if (url.endsWith("/hero/frames/sparkle/thumb/0001.webp")) {
        return Promise.resolve(createDecodedFrame());
      }

      return pendingVisibleDecode.promise;
    });

    const { result, rerender } = renderHook(
      ({ isVisible, scrollProgress, targetFrameIndex }) =>
        useFrameLoader({
          clip: "sparkle",
          enabled: true,
          isVisible,
          scrollProgress,
          targetFrameIndex,
          viewportHeight: 1080,
          viewportWidth: 1920,
        }),
      {
        initialProps: {
          isVisible: false,
          scrollProgress: 0.31,
          targetFrameIndex: 0,
        },
      },
    );

    await flushLoaderWork();

    expect(result.current.resolvedFrame).toBeNull();

    rerender({
      isVisible: true,
      scrollProgress: 0.5,
      targetFrameIndex: 9,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.resolvedFrame?.frameIndex).toBe(0);
    expect(result.current.resolvedFrame?.tier).toBe("thumb");
  });

  it("aborts stale prefetch work when the target frame changes", async () => {
    const warmSignals: AbortSignal[] = [];

    vi.mocked(media.warmFrameSource).mockImplementation(
      (_url: string, abortSignal?: AbortSignal) => {
        if (abortSignal) {
          warmSignals.push(abortSignal);
        }

        return new Promise<void>(() => {});
      },
    );

    const { rerender } = renderHook(
      ({ scrollProgress, targetFrameIndex }) =>
        useFrameLoader({
          clip: "celebration",
          enabled: true,
          isVisible: false,
          scrollProgress,
          targetFrameIndex,
          viewportHeight: 1080,
          viewportWidth: 1920,
        }),
      {
        initialProps: {
          scrollProgress: 0.03,
          targetFrameIndex: 0,
        },
      },
    );

    await flushLoaderWork();

    const initialPrefetchSignal = warmSignals[0];

    if (!initialPrefetchSignal) {
      throw new Error("Expected an initial prefetch request to start.");
    }

    rerender({
      scrollProgress: 0.22,
      targetFrameIndex: 10,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(initialPrefetchSignal.aborted).toBe(true);
  });

  it("does not abort in-flight prefetch work when scroll progress changes but the target stays the same", async () => {
    const warmSignals: AbortSignal[] = [];

    vi.mocked(media.warmFrameSource).mockImplementation(
      (_url: string, abortSignal?: AbortSignal) => {
        if (abortSignal) {
          warmSignals.push(abortSignal);
        }

        return new Promise<void>(() => {});
      },
    );

    const { rerender } = renderHook(
      ({ scrollProgress }) =>
        useFrameLoader({
          clip: "celebration",
          enabled: true,
          isVisible: false,
          scrollProgress,
          targetFrameIndex: 0,
          viewportHeight: 1080,
          viewportWidth: 1920,
        }),
      {
        initialProps: {
          scrollProgress: 0.03,
        },
      },
    );

    await flushLoaderWork();

    const initialPrefetchSignal = warmSignals[0];

    if (!initialPrefetchSignal) {
      throw new Error("Expected an initial prefetch request to start.");
    }

    rerender({
      scrollProgress: 0.031,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(initialPrefetchSignal.aborted).toBe(false);
  });
});
