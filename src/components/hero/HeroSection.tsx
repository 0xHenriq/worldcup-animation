"use client";

import type { ReactNode } from "react";
import { Component, useCallback, useEffect, useMemo, useState } from "react";

import useHeroRuntime from "../../hooks/useHeroRuntime";
import useReducedMotion from "../../hooks/useReducedMotion";
import BootStill from "./BootStill";
import EnhancedHeroStage from "./EnhancedHeroStage";
import StaticHeroFallback from "./StaticHeroFallback";

const ENHANCED_READY_TIMEOUT_MS = 10_000;
const BOOTSTILL_CROSSFADE_MS = 500;

type EnhancedHeroErrorBoundaryProps = {
  children: ReactNode;
  onError: () => void;
};

type EnhancedHeroErrorBoundaryState = {
  hasError: boolean;
};

function setBranchVisibility(rootElement: HTMLElement | null, showStaticBranch: boolean) {
  if (!rootElement) {
    return;
  }

  const staticBranch = rootElement.querySelector<HTMLElement>(".hero-static");
  const enhancedShell = rootElement.querySelector<HTMLElement>(".hero-shell");

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

class EnhancedHeroErrorBoundary extends Component<
  EnhancedHeroErrorBoundaryProps,
  EnhancedHeroErrorBoundaryState
> {
  public static getDerivedStateFromError(): EnhancedHeroErrorBoundaryState {
    return { hasError: true };
  }

  public override state: EnhancedHeroErrorBoundaryState = {
    hasError: false,
  };

  public override componentDidCatch(): void {
    this.props.onError();
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export default function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const [boundaryFailed, setBoundaryFailed] = useState(false);
  const [bootStillDismissed, setBootStillDismissed] = useState(false);
  const [enhancedReadyTimedOut, setEnhancedReadyTimedOut] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const shouldDisableEnhancedRuntime = prefersReducedMotion || boundaryFailed || enhancedReadyTimedOut;
  const {
    enhancedReady,
    heroRootRef,
    runtimeFailed,
    setHeroRootRef,
    setScrollShellRef,
    setStageRef,
  } = useHeroRuntime({
    disabled: shouldDisableEnhancedRuntime,
    onAnimationFrame: (frame) => {
      const nextScrollProgress = Number(frame.scrollProgress.toFixed(4));

      setScrollProgress((currentScrollProgress) =>
        currentScrollProgress === nextScrollProgress
          ? currentScrollProgress
          : nextScrollProgress,
      );
    },
  });
  const shouldShowStaticBranch = useMemo(
    () => prefersReducedMotion || boundaryFailed || enhancedReadyTimedOut || runtimeFailed,
    [boundaryFailed, enhancedReadyTimedOut, prefersReducedMotion, runtimeFailed],
  );
  const handleEnhancedStageError = useCallback(() => {
    setBoundaryFailed(true);
  }, []);

  useEffect(() => {
    if (enhancedReady || shouldShowStaticBranch) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEnhancedReadyTimedOut(true);
    }, ENHANCED_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enhancedReady, shouldShowStaticBranch]);

  useEffect(() => {
    if (enhancedReady) {
      setEnhancedReadyTimedOut(false);
    }
  }, [enhancedReady]);

  useEffect(() => {
    setBranchVisibility(heroRootRef.current, shouldShowStaticBranch);
  }, [heroRootRef, shouldShowStaticBranch]);

  useEffect(() => {
    if (!enhancedReady || shouldShowStaticBranch) {
      setBootStillDismissed(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBootStillDismissed(true);
    }, BOOTSTILL_CROSSFADE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enhancedReady, shouldShowStaticBranch]);

  return (
    <section
      ref={setHeroRootRef}
      aria-labelledby="hero-title"
      className="hero-root"
      data-boundary-failed={boundaryFailed ? "true" : "false"}
      data-enhanced-ready-timed-out={enhancedReadyTimedOut ? "true" : "false"}
    >
      <h1 id="hero-title" className="sr-only">
        FIFA World Cup 2026 Tickets
      </h1>

      <StaticHeroFallback className="hero-static" />

      <div aria-hidden="true" className="hero-shell" data-branch="enhanced" inert>
        <div ref={setScrollShellRef} className="hero-scroll">
          <div ref={setStageRef} className="hero-stage">
            {!bootStillDismissed ? (
              <BootStill
                className="transition-opacity duration-500 ease-out"
                style={{ opacity: enhancedReady ? 0 : 1 }}
              />
            ) : null}
            <EnhancedHeroErrorBoundary onError={handleEnhancedStageError}>
              <EnhancedHeroStage
                enhancedReady={enhancedReady}
                runtimeFailed={shouldShowStaticBranch}
                scrollProgress={scrollProgress}
              />
            </EnhancedHeroErrorBoundary>
          </div>
        </div>
      </div>
    </section>
  );
}
