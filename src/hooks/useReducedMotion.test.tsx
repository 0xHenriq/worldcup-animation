// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useReducedMotion from "./useReducedMotion";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MatchMediaController = {
  setMatches: (nextMatches: boolean) => void;
};

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatch: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = {
        matches: nextMatches,
        media: REDUCED_MOTION_QUERY,
      } as MediaQueryListEvent;

      for (const listener of listeners) {
        listener(event);
      }
    },
  } as MediaQueryList & { dispatch: (nextMatches: boolean) => void };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      if (query !== REDUCED_MOTION_QUERY) {
        throw new Error(`Unexpected media query: ${query}`);
      }

      return mediaQueryList;
    }),
  });

  return {
    setMatches(nextMatches: boolean) {
      act(() => {
        mediaQueryList.dispatch(nextMatches);
      });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useReducedMotion", () => {
  it("reads the current reduced-motion preference on the first render", () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it("updates when the reduced-motion media query changes", () => {
    const matchMedia = installMatchMedia(false);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    matchMedia.setMatches(true);
    expect(result.current).toBe(true);

    matchMedia.setMatches(false);
    expect(result.current).toBe(false);
  });
});
