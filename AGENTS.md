# AGENTS.md — World Cup 2026 Hero Section

> Orders for any AI coding agent working on this project. Read the entire document before writing a single line of code.

---

## Rule 0 — The Fundamental Override Prerogative

**I AM IN CHARGE, NOT YOU.**

If the human gives you an explicit instruction that contradicts anything in this document, the human wins. Always. No exceptions. Do not argue, do not "improve" the instruction, do not silently deviate. Execute what you are told.

If an instruction is ambiguous, ask. Do not guess.

---

## Rule Number 1 — No File Deletion

**You have permanently lost any and all rights to delete files in this repository.**

You MUST NOT run any of the following:
- `rm`, `rm -rf`, `rm -r`
- `unlink`
- `fs.unlinkSync`, `fs.rmSync`, `fs.rmdirSync`
- Any shell command or Node API that removes files or directories

If you believe a file should be removed, state your case to the human. The human will delete it. You will not.

---

## Irreversible Git and Filesystem Actions — DO NOT EVER BREAK GLASS

1. **Forbidden commands:** `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, `git rebase` (interactive or otherwise), `rm -rf`, `DROP`, `TRUNCATE`. NEVER run these.
2. **If you are unsure whether an action is irreversible, treat it as irreversible.** Ask first.
3. **Safer alternatives first.** Use `git stash` instead of `git checkout .`. Use `git revert` instead of `git reset`. Use `git branch -d` (lowercase) instead of `-D`.
4. **Before any risky action, write an explicit plan** stating: what you will do, what the rollback is, and what data could be lost. Wait for approval.
5. **Document the confirmation.** After the human approves a risky action, note in your response that approval was given before executing.

---

## Git Branch Policy

- Default branch: `main`
- NEVER push directly to `main` without explicit approval
- Branch naming: `feature/<short-description>`, `fix/<short-description>`
- Commit messages: imperative mood, concise, describe the "what" and "why"

---

## Toolchain: TypeScript + pnpm

### Edition / Version

- **Next.js 15** — App Router, server components by default, client components only where interactivity is needed
- **TypeScript** — strict mode enabled, no `any` types unless absolutely unavoidable (and justified in a comment)
- **Node 22 LTS**
- **pnpm** — the ONLY package manager. NEVER use `npm` or `yarn`

### Key Dependencies

| Package | Purpose |
|---|---|
| next | Framework — App Router, SSR, routing, image optimisation |
| react / react-dom | UI rendering |
| tailwindcss v4 | Styling — CSS-first configuration, theme tokens in globals.css |

### Forbidden Dependencies

| Dependency | Why It Is FORBIDDEN |
|---|---|
| gsap | Animation library. The spec explicitly prohibits ALL animation libraries. The hero runs on vanilla scroll + CSS transforms + canvas. |
| framer-motion | Same. Prohibited by spec. |
| lottie-web / @lottiefiles/* | Same. Prohibited by spec. |
| three / @react-three/* | 3D rendering. Not needed. Prohibited by spec. |
| react-spring | Animation library. Prohibited. |
| animejs / anime.js | Animation library. Prohibited. |
| scrollmagic | Scroll animation library. Prohibited. |
| locomotive-scroll | Scroll library. Prohibited. |
| ANY package whose primary purpose is animation or scroll-driven effects | The entire hero runs on one scroll listener, requestAnimationFrame, CSS custom properties, and canvas frame drawing. No exceptions. |

### Feature Flags

N/A

### Build / Dev Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm lint             # Run ESLint
pnpm typecheck        # Run tsc --noEmit (if configured)
```

---

## Code Editing Discipline

### No Script-Based Changes

NEVER use regex-based bulk transforms (`sed`, `awk`, `perl -pe`) to modify source code. Edit files individually and intentionally.

### No File Proliferation

NEVER create `_v2`, `_backup`, `_old`, `_improved`, `_new`, `_copy`, `_temp` variants of any file. The bar for creating new files is incredibly high. If the spec defines a file, create it. If the spec does not define a file, you almost certainly should not create it.

### File Structure Is Defined by the Spec

The file structure is defined in `world-cup-hero-spec-v3.1-reviewed.md` under section 20 ("File structure"). Follow it EXACTLY. Do NOT invent new directories, new components, new hooks, or new utility files that are not in the spec. If you believe a new file is needed, ask the human first.

---

## Backwards Compatibility

We do not care about backwards compatibility. Patterns are being ESTABLISHED — the agent has more freedom to create files and propose structure, but MUST follow `world-cup-hero-spec-v3.1-reviewed.md` as the single source of truth. If the spec says it, build it. If the spec doesn't say it, don't build it.

---

## Compiler / Linter Checks (CRITICAL)

Run these after EVERY meaningful code change:

```bash
pnpm build            # Must compile with zero errors
pnpm lint             # Must pass with zero warnings
```

If you see errors, carefully understand and resolve each issue. Do NOT suppress warnings with `// eslint-disable` or `@ts-ignore` unless you have an explicit, justified reason AND you explain it in a comment.

---

## Testing

### Testing Policy

This is a visual, scroll-driven experience. Traditional unit tests have limited value. The primary testing approach is:

1. **TypeScript compilation** — the type system catches structural errors
2. **Lighthouse audits** — LCP, FCP, CLS, performance score
3. **Manual visual testing** — physical devices for iOS Safari, Android, desktop
4. **DevTools profiling** — GPU memory, frame rate, no dropped frames

If the human requests unit tests for utility functions (`easing.ts`, `math.ts`, `frame-utils.ts`, `constants.ts`), follow these rules:

- Test pure functions: easing calculations, frame index mapping (including slow zone), clamp, mapRange, mapRangeClamped
- Test edge cases: scrollProgress at exactly 0, exactly 1, boundary values at phase transitions
- NEVER mock the browser scroll API in tests — test the math, not the DOM

Test patterns are being established. Follow the testing policy defined in this document. If no test exists yet for a module, create the first one as the canonical example that all future tests in that module MUST follow.

### Test Commands

```bash
pnpm test             # Run test suite (if configured)
pnpm test -- --watch  # Watch mode
```

### Test Categories

| Area | Focus |
|---|---|
| Easing functions | easeInCubic(0)=0, easeInCubic(1)=1, monotonically increasing |
| Frame index calculation | Slow zone halves frame rate, boundary clamps, all frames used |
| clamp / mapRange / mapRangeClamped | Edge values, out-of-range inputs, NaN handling |
| Countdown | Zero/negative time produces "The World Cup has begun" |
| Scroll progress | Clamp to [0,1], correct formula with startY/endY |
| Cover-fit draw | Aspect ratio preservation, center anchoring, no stretching |
| Draw key | Includes frame index, active tier, canvas size, visibility |

---

## World Cup 2026 Hero Section — This Project

**This is the project you are working on.**

### What It Does

A scroll-driven cinematic hero section for a FIFA World Cup 2026 ticket website. The user lands on a full-viewport cosmic portal scene. As they scroll, they fly through the portal into a stadium celebration. Golden sparkler bursts flood the frame. The frame fades to black. The World Cup trophy emerges with a "Take Your Seat" CTA. The experience runs on a single `scrollProgress` value (0–1) with zero animation libraries.

There are two rendering modes: **static** (no-JS or prefers-reduced-motion) and **enhanced** (JS + motion allowed). Both branches are rendered in HTML; CSS selects the correct branch before first paint to prevent CLS.

### Architecture

```
                         ┌──────────────────────────┐
                         │   HTML (both branches)    │
                         └────────┬─────────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
     ┌────────▼────────┐                    ┌─────────▼─────────┐
     │ StaticHeroFallback│                    │    hero-shell     │
     │ (no-JS / reduced │                    │ (JS + motion)     │
     │  motion only)    │                    └─────────┬─────────┘
     │ portal-composite │                              │
     │ + stadium-poster │                    ┌─────────▼─────────┐
     │ + trophy + CTAs  │                    │   hero-scroll     │
     └──────────────────┘                    │ height: 450dvh    │
                                             └─────────┬─────────┘
                              CSS pre-paint            │
                              selection via      ┌─────▼──────┐
                              data-js="true"     │ hero-stage  │
                                                 │ sticky top:0│
                                                 │ overflow:clip│
                                                 └─────┬──────┘
                                                       │
                               ┌───────────────────────┤
                               │                       │
                      ┌────────▼────────┐    ┌─────────▼──────────┐
                      │   BootStill     │    │ EnhancedHeroStage  │
                      │ portal-composite│    │ (client component)  │
                      │ visible until   │    │ hidden until        │
                      │ enhancedReady   │    │ enhancedReady       │
                      └─────────────────┘    └─────────┬──────────┘
                                                       │
                    ┌─────────┬────────┬───────┬───────┼────────┬────────┐
                    ▼         ▼        ▼       ▼       ▼        ▼        ▼
              ┌──────────┐┌──────┐┌──────┐┌──────┐┌───────┐┌──────┐┌──────┐
              │Background││Poster││Canvas ││Spark ││Black  ││Trophy││Portal│
              │ navy→blk ││      ││Celebr.││Overl.││Overl. ││+CTA  ││Layer │
              │          ││      ││       ││screen││+antic.││+flare││cosmos│
              │          ││      ││       ││blend ││       ││      ││+arms │
              └──────────┘└──────┘└──────┘└──────┘└───────┘└──────┘└──────┘
                  z:0       z:10   z:11    z:15    z:16     z:18    z:20-21
                                                                  ┌──────┐
              + GoldenFlash z:25  + Vignette z:28  + FilmGrain z:30│      │
                                                                  └──────┘

    useHeroRuntime: scroll listener → rAF → scrollProgress → CSS vars
    useFrameLoader: prefetch → HTTP cache → decode → ImageBitmap window
```

### Workspace Structure

```
worldcup-hero/
├── public/hero/                             # All hero media assets
│   ├── portal-composite.webp               # Shared opening still (LCP, boot-still, static)
│   ├── portal-cosmos.webp                  # Cosmos + portal ring + hole, no arms
│   ├── arm-left.webp                       # Left arm, transparent WebP
│   ├── arm-right.webp                      # Right arm, transparent WebP
│   ├── stadium-poster.webp                 # Static fallback / canvas fallback
│   ├── trophy.webp                         # Trophy render
│   └── frames/
│       ├── celebration/
│       │   ├── thumb/0001.webp…0060.webp   # 480px tier
│       │   ├── medium/0001.webp…0060.webp  # 960px tier
│       │   └── large/0001.webp…0060.webp   # 1920px tier
│       └── sparkle/
│           ├── thumb/                       # Same structure
│           ├── medium/
│           └── large/
├── src/
│   ├── app/
│   │   ├── layout.tsx                      # Root layout, font loading, beforeInteractive JS flag
│   │   ├── page.tsx                        # Renders HeroSection
│   │   └── globals.css                     # Tailwind v4 theme + CSS animations + mode selection
│   ├── components/hero/
│   │   ├── HeroSection.tsx                 # Root: <section> with both branches
│   │   ├── StaticHeroFallback.tsx          # No-JS / reduced-motion static layout
│   │   ├── BootStill.tsx                   # Enhanced-mode opening still (portal-composite)
│   │   ├── EnhancedHeroStage.tsx           # Client component: animated layer stack
│   │   ├── PortalLayer.tsx                 # Cosmos + arms + ring pulse + shooting star
│   │   ├── FrameSequenceCanvas.tsx         # Reusable scroll-driven canvas renderer
│   │   ├── SparkleOverlay.tsx              # Thin wrapper: FrameSequenceCanvas + mix-blend-mode: screen
│   │   ├── TrophyReveal.tsx                # Trophy + spotlight + lens flare + CTA + countdown
│   │   ├── GoldenFlash.tsx                 # One-shot gold flash at portal breakthrough
│   │   └── FilmGrain.tsx                   # SVG noise overlay (server component — pure CSS)
│   ├── hooks/
│   │   ├── useHeroRuntime.ts               # Viewport vars, scroll listener, rAF, CSS vars, enhancedReady
│   │   ├── useFrameLoader.ts               # Prefetch + decode + sliding window ImageBitmap management
│   │   └── useReducedMotion.ts             # prefers-reduced-motion detection
│   └── lib/hero/
│       ├── constants.ts                    # ALL phase boundaries, frame counts, scroll heights, countdown target
│       ├── easing.ts                       # easeInCubic, easeOutCubic, bellCurve, clamp, mapRange, mapRangeClamped
│       ├── math.ts                         # Cover-fit, portal geometry, max-scale calculation
│       ├── frame-utils.ts                  # Frame index calculation (slow zone), draw key, canvas helpers
│       ├── media.ts                        # Tier selection, decode helpers, abort/generation management
│       └── generated/
│           ├── portalGeometry.ts            # Generated: artboard dims, hole, arm positions
│           └── frameManifest.ts             # Generated: clip frame counts, available tiers
├── scripts/
│   ├── extract-frames.sh                   # ffmpeg: MP4 → PNG at 15fps
│   ├── optimise-assets.sh                  # cwebp: PNGs → WebPs at three tiers
│   └── emit-generated-hero-metadata.mjs    # Emit portalGeometry.ts and frameManifest.ts
├── world-cup-hero-spec-v3.1-reviewed.md    # THE spec. Single source of truth.
└── package.json
```

### Core Types Quick Reference

| Type / Module | Purpose | Defined In |
|---|---|---|
| HeroSection | Root `<section>` — renders both static and enhanced branches | `src/components/hero/HeroSection.tsx` |
| StaticHeroFallback | No-JS / reduced-motion fallback: portal-composite + stadium-poster + trophy + CTAs | `src/components/hero/StaticHeroFallback.tsx` |
| BootStill | Enhanced-mode opening still using portal-composite, visible until enhancedReady | `src/components/hero/BootStill.tsx` |
| EnhancedHeroStage | Client component: animated layer stack, hidden until enhancedReady | `src/components/hero/EnhancedHeroStage.tsx` |
| PortalLayer | Cosmos + arm images + ring pulse + shooting star, animated during portal phase only | `src/components/hero/PortalLayer.tsx` |
| FrameSequenceCanvas | Reusable scroll-driven canvas renderer with draw-key skip logic | `src/components/hero/FrameSequenceCanvas.tsx` |
| SparkleOverlay | Thin wrapper adding `mix-blend-mode: screen` to FrameSequenceCanvas | `src/components/hero/SparkleOverlay.tsx` |
| TrophyReveal | Trophy (dim + bright + spotlight mask) + lens flare + CTA stack + countdown | `src/components/hero/TrophyReveal.tsx` |
| GoldenFlash | One-shot gold flash at portal breakthrough | `src/components/hero/GoldenFlash.tsx` |
| FilmGrain | SVG noise overlay, always visible, pointer-events: none (server component) | `src/components/hero/FilmGrain.tsx` |
| useHeroRuntime | Hook: viewport measurement, scroll listener, rAF pipeline, CSS var writes, enhancedReady gate | `src/hooks/useHeroRuntime.ts` |
| useFrameLoader | Hook: prefetch queue, HTTP cache warm, ImageBitmap sliding window, `.close()` eviction | `src/hooks/useFrameLoader.ts` |
| useReducedMotion | Hook: prefers-reduced-motion detection | `src/hooks/useReducedMotion.ts` |
| constants | All scroll phase boundaries (PHASES object), countdown target, scroll multipliers | `src/lib/hero/constants.ts` |
| easing | easeInCubic, easeOutCubic, bellCurve, clamp, mapRange, mapRangeClamped | `src/lib/hero/easing.ts` |
| math | Cover-fit draw helper, portal geometry calculations, maxScale computation | `src/lib/hero/math.ts` |
| frame-utils | Frame index calculation (with slow zone), draw key builder, canvas helpers | `src/lib/hero/frame-utils.ts` |
| media | Tier selection by effective render size, decode method (createImageBitmap / fallback), AbortController management | `src/lib/hero/media.ts` |
| portalGeometry | Generated: artboard dimensions, hole center/diameter, arm bounding boxes | `src/lib/hero/generated/portalGeometry.ts` |
| frameManifest | Generated: clip frame counts and available tiers | `src/lib/hero/generated/frameManifest.ts` |

### Key Design Decisions

- **No animation libraries** — The animation is simple enough (scale transforms + frame scrubbing + opacity) that a library would add weight without adding capability. Vanilla scroll + rAF + CSS custom properties + canvas.
- **Single scrollProgress value** — Every visual element derives state from one normalised number. No timelines, no animation players, no parallel state machines.
- **Two rendering modes, pre-paint CSS selection** — Both static and enhanced branches exist in HTML. A `beforeInteractive` inline script sets `data-js="true"` on `<html>`. CSS selects the correct branch before first paint, eliminating CLS from branch swapping.
- **Enhancement readiness gate** — Enhanced layers stay hidden behind BootStill until `enhancedReady = true` (all critical assets decoded + geometry measured). The handoff from BootStill to separated layers MUST be invisible because both show the same portal-composite frame.
- **Sticky stage, not fixed layers** — The `.hero-stage` is `position: sticky; top: 0`. All visual layers inside are `position: absolute; inset: 0`. NEVER use `position: fixed` on any hero layer.
- **Canvas frame scrubbing** — Veo clips are decomposed into WebP frame sequences and drawn to canvas based on scroll position (Apple product page technique). NOT video playback.
- **Three frame tiers: thumb / medium / large** — Selected by effective rendered long edge, NOT by input modality. Do NOT name tiers "mobile" or "desktop" or "full".
- **Screen blend mode for sparkle** — Sparkle burst on black background composites via `mix-blend-mode: screen`. Black becomes invisible, golden sparks layer additively. Stage MUST have `isolation: isolate`.
- **Generated TypeScript metadata** — Portal geometry and frame manifest are generated TS modules imported at build time. Do NOT fetch metadata JSON from `/public` at runtime. Do NOT hand-maintain `TOTAL_FRAMES`.
- **Three-wave loading** — portal-composite is LCP. Enhanced critical assets (cosmos, arms, poster) load after enhanced mode confirmed. Frames and trophy load on scroll/idle. Reduced-motion users NEVER download enhancement-only images.
- **Sliding window memory** — Decoded `ImageBitmap` windows: 20 per clip (large tier), 12 per clip (medium tier). Frames outside the window are `.close()`'d immediately. Prevents unbounded GPU memory growth.
- **15fps frame sequences** — User controls playback via scroll. Cannot perceive difference between 15fps and 24fps. Saves 37% payload.
- **Slow zone** — Celebration frames advance at half rate between scrollProgress 0.20–0.30 to make the emotional peak linger.
- **Arms scale slower than cosmos** — Deliberate compositional choice (NOT parallax). Arms scale at 85% of cosmos travel, lingering as a "doorframe" while cosmos rushes outward. Do NOT invert the scale ratio.
- **One-shot effects gated by refs** — Golden flash, lens flare, CTA pulse, shooting star fire once on first forward pass and NEVER re-trigger on scroll-up. Gates stored in refs, not React state. Initialized from current scrollProgress on mount/pageshow.
- **SparkleOverlay wraps FrameSequenceCanvas** — It is a thin wrapper adding `mix-blend-mode: screen` CSS. It does NOT duplicate canvas logic.
- **Trophy lighting via masked bright layer** — Dim base trophy + bright trophy masked by radial spotlight. Desktop: cursor-following spotlight. Coarse-pointer: centered breathing spotlight. NOT a viewport-wide overlay.
- **Cover-fit draw** — Both poster and canvases use identical center-anchored cover-fit logic. No stretching. Spec provides the exact algorithm.

### Non-Negotiable Invariants

| # | Invariant | Rationale |
|---|---|---|
| 1 | Zero animation libraries in the dependency tree | Spec explicitly prohibits them. The entire value proposition is vanilla performance. |
| 2 | scrollProgress is ALWAYS clamped to [0, 1] | iOS rubber-banding and scrolling past the hero produce out-of-range values. Unclamped values break every layer. |
| 3 | Canvas NEVER shows a blank frame | Use stadium poster as fallback, nearest decoded frame as fallback. A blank canvas looks like a broken page. |
| 4 | One-shot effects (flash, flare, pulse, shooting star) fire exactly once | Re-triggering on scroll-up is distracting and feels broken. Gate with refs, initialize from current progress on mount/pageshow. |
| 5 | SparkleOverlay does NOT duplicate FrameSequenceCanvas logic | It wraps FrameSequenceCanvas. If you find yourself writing `ctx.drawImage` inside SparkleOverlay, you are doing it wrong. |
| 6 | All phase boundaries come from `constants.ts` | NEVER hardcode scroll boundary numbers in components. Every component reads from the single constants file. |
| 7 | Sliding window evicts frames via `.close()` | Dereferencing without `.close()` waits for GC. `.close()` releases GPU memory immediately. |
| 8 | Frame count comes from generated `frameManifest.ts` | Do NOT hand-maintain `TOTAL_FRAMES`. The manifest is the runtime source of truth. |
| 9 | Cover-fit draw on canvas (never stretch) | Naive `drawImage(0,0,w,h)` stretches. MUST implement the cover-fit algorithm from the spec. Poster and canvas MUST use the same anchor. |
| 10 | prefers-reduced-motion shows static fallback only | Not optional. Accessibility requirement. Static branch only. No scroll listeners, no frame preloading, no decorative motion. |
| 11 | No `position: fixed` on hero layers | Stage is `position: sticky; top: 0`. All layers are `position: absolute; inset: 0` inside the stage. Fixed positioning breaks the composition. |
| 12 | Both branches rendered in HTML, CSS selects pre-paint | NEVER render static first then swap to enhanced after mount. The `data-js` flag + CSS media query selects before paint. CLS = 0. |
| 13 | BootStill visible until enhancedReady | Enhanced layers MUST NOT appear until all critical assets are decoded and geometry is measured. Partial reveals look broken. |
| 14 | Inactive branch is inert | Whichever branch is inactive gets `aria-hidden="true"` + `inert` (or `display: none`). Keyboard focus MUST NOT land on invisible controls. |
| 15 | Canvas backing store matches active tier, not desired tier | Canvas must not exceed the resolution of the currently available frame. See spec section 10.3. |
| 16 | Draw key includes frame index + active tier + canvas size + visibility | Redraws MUST fire when a frame upgrades tier even if the index is unchanged. See spec section 10.5. |
| 17 | Frame tiers are named thumb / medium / large | NEVER use "mobile", "desktop", or "full" as tier names. Tier selection is by effective rendered long edge, not input modality. |
| 18 | Hero runtime failure falls back to static branch | If the enhanced runtime fails to initialize or crashes, the user MUST see the static fallback. NEVER leave the user in a non-animating 450dvh empty scroll shell. |
| 19 | All decorative layers have `pointer-events: none` | Only the CTA stack accepts interaction. Every other layer (portal, canvases, flash, vignette, grain, blackout, trophy image) MUST have `pointer-events: none`. Without this, decorative overlays intercept clicks. |
| 20 | CTA stack is `inert` until its container opacity >= 0.8 | Do NOT allow focus or pointer interaction on the CTA until it is visually present. Use `inert` until the opacity threshold is crossed. Prevents keyboard focus landing on invisible CTAs. |
| 21 | Source cache does NOT hoard Blobs in JS memory | The frame loader may prefetch URLs to warm the browser HTTP cache, but it MUST NOT keep every fetched frame as a JS `Blob` in memory. Only track which frames are available, in flight, and decoded. |

### Performance Requirements

- LCP < 1.5s on 4G connection (`portal-composite.webp` is the LCP element with `fetchPriority="high"`)
- FCP < 1.0s
- CLS = 0 (pre-paint CSS mode selection + sticky stage with absolutely positioned layers)
- Hero JS < 15KB gzipped
- Total hero payload: < 2.5MB desktop, < 1.8MB mobile (spread across loading waves)
- 60fps scroll on M1 MacBook Air and mid-range Android
- GPU memory: large tier ~160MB per active clip, ~320MB worst overlap; medium tier ~24MB per clip, ~48MB worst overlap
- Frame decode time < 16ms per frame
- No layout shift from hero mode selection or enhancement handoff
- No React re-render loop on scroll (CSS custom properties, not state)
- No canvas drawing when the canvas is hidden

---

## Session Lifecycle

### Session Protocol

Before starting work:

```bash
# 1. Read the spec
cat world-cup-hero-spec-v3.1-reviewed.md

# 2. Check project state
ls -la src/ public/ 2>/dev/null || echo "Project not yet initialised"

# 3. If project exists, check for uncommitted changes
git status 2>/dev/null

# 4. Install dependencies
pnpm install

# 5. Verify build
pnpm build
```

### Landing the Plane

Before ending any session:

1. **Verify the build compiles:** `pnpm build` must succeed with zero errors
2. **Verify lint passes:** `pnpm lint` must pass
3. **Commit your work** with a descriptive message (if the human approves)
4. **List any follow-up work** that you did not complete — be specific about what remains
5. **State which scroll phases you touched** so the next agent knows what to verify visually

---

## Known LLM Failure Modes

### Failure Mode 1: Adding Animation Libraries

**The bad behavior:** Agent installs GSAP, Framer Motion, react-spring, or any animation library because "it would make the scroll animation easier."

**The correct behavior:** The spec EXPLICITLY PROHIBITS all animation libraries. The hero runs on vanilla scroll + rAF + CSS transforms + canvas. This is a deliberate constraint, not an oversight. If you install an animation library, you have failed the task. NEVER EVER DO THIS.

### Failure Mode 2: Over-Engineering Beyond the Spec

**The bad behavior:** Agent adds configuration systems, plugin architectures, abstract base classes, generic animation engines, or "future-proof" abstractions that the spec never asked for.

**The correct behavior:** Build what the spec says. Nothing more. The spec is exhaustively detailed — covering every edge case. If the spec doesn't mention it, you don't build it. A 10-line utility function is better than a 200-line generic framework.

### Failure Mode 3: Duplicating Canvas Logic in SparkleOverlay

**The bad behavior:** Agent copies the entire FrameSequenceCanvas implementation into SparkleOverlay, then modifies it to add `mix-blend-mode: screen`.

**The correct behavior:** SparkleOverlay is a THIN WRAPPER around FrameSequenceCanvas. It renders FrameSequenceCanvas and adds `mix-blend-mode: screen` via CSS. Zero canvas drawing code inside SparkleOverlay. The spec says this explicitly.

### Failure Mode 4: Getting the Slow Zone Formula Wrong

**The bad behavior:** Agent ignores the piecewise slow zone formula in the spec and writes a simple linear frame mapping, or invents a different easing approach.

**The correct behavior:** The spec provides the piecewise formula for celebration frame mapping with the slow zone. Implement it precisely. The slow zone between scrollProgress 0.20–0.30 advances frames at half rate. The formula has three branches (before slow zone, during slow zone, after slow zone). Test it with boundary values. Drive frame count from `FRAME_MANIFEST.celebration.count`, do NOT hardcode it.

### Failure Mode 5: Inverting the Arm Scale Ratio

**The bad behavior:** Agent makes the arms scale FASTER than the cosmos, reasoning that "closer objects should move faster in parallax."

**The correct behavior:** The spec explicitly explains: arms scale at 85% of cosmos travel. This is NOT a parallax simulation — it's a deliberate compositional choice that creates a "passing through a doorframe" sensation. The spec includes a warning: "Do not invert the scale ratio thinking you're fixing a parallax bug — the effect is intentional."

### Failure Mode 6: Ignoring the Spec and Inventing Architecture

**The bad behavior:** Agent creates its own file structure, invents new components, or reorganises the code because "it would be cleaner."

**The correct behavior:** The spec defines the EXACT file structure, component names, hook names, and utility file names in section 20. Follow them. If you create a file that doesn't appear in the spec, you have almost certainly made a mistake. Ask the human.

### Failure Mode 7: Hardcoding Phase Boundary Values

**The bad behavior:** Agent writes `if (scrollProgress > 0.12)` directly in component code instead of importing from constants.

**The correct behavior:** ALL phase boundaries are defined in `src/lib/hero/constants.ts` as the `PHASES` object. Every component imports from there. To retune the experience, someone changes ONE file. Hardcoded magic numbers scattered across components is a maintenance nightmare.

### Failure Mode 8: Using `drawImage` Without Cover-Fit

**The bad behavior:** Agent writes `ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)` which stretches 16:9 frames to fill any viewport shape.

**The correct behavior:** Implement the cover-fit algorithm from the spec (section 10.4). Calculate source/canvas aspect ratios, fit to the dominant axis, center and crop overflow. On phones (9:19.5), frames are cropped left/right. On ultrawide (21:9), cropped top/bottom. NEVER stretch. Poster `object-position: 50% 50%` MUST match the canvas cover-fit anchor.

### Failure Mode 9: Forgetting to Clamp scrollProgress

**The bad behavior:** Agent computes scrollProgress without clamping, causing negative values during iOS rubber-band or values > 1 when scrolling past the hero.

**The correct behavior:** `scrollProgress = clamp((scrollY - startY) / (endY - startY), 0, 1)` where startY and endY are measured from the scroll container. The clamp is non-negotiable. Without it, every layer computation breaks.

### Failure Mode 10: Creating Sprawling File Structures

**The bad behavior:** Agent creates subdirectories for "types", "utils", "config", "stores", "providers", "contexts", "services" — none of which appear in the spec.

**The correct behavior:** The file structure has `components/hero/`, `hooks/`, and `lib/hero/` (with a `generated/` subfolder). That's it. No extra directories. The project is a single hero section, not a SaaS platform.

### Failure Mode 11: Server-Rendering Hidden Enhanced Assets

**The bad behavior:** Agent server-renders `<img>` tags for portal-cosmos, arm-left, arm-right, stadium-poster inside the enhanced branch, causing reduced-motion/static users to download images they will never see.

**The correct behavior:** The spec (section 6.3) is explicit: do NOT server-render hidden `<img>` tags for enhancement-only assets. Those assets MUST be created or requested by the client runtime only after enhanced mode is confirmed. The server render of EnhancedHeroStage should be a lightweight mount point only.

### Failure Mode 12: Using Wrong Tier Names

**The bad behavior:** Agent uses tier names like "full", "mobile", "desktop", "hd", "sd" instead of the spec-defined names.

**The correct behavior:** The three tiers are `thumb` (480px), `medium` (960px), and `large` (1920px). The spec (section 4.1) says: "Do not name the tiers mobile and desktop; the selected tier depends on effective render size, not input modality." You have proven you cannot be trusted to invent tier names. Use the spec's names EXACTLY.

### Failure Mode 13: Using `position: fixed` on Hero Layers

**The bad behavior:** Agent sets `position: fixed` on portal layers, canvases, or the trophy because "they need to stay in the viewport."

**The correct behavior:** The stage is `position: sticky; top: 0`. Every layer inside is `position: absolute; inset: 0`. The spec (section 7.4) is explicit: "No child hero layer should use `position: fixed`." Fixed positioning breaks scroll containment, creates stacking context issues, and fights with the sticky stage.

### Failure Mode 14: Rendering Static First Then Swapping to Enhanced

**The bad behavior:** Agent renders only the static branch in the initial HTML, then replaces it with the enhanced scroll shell after React mounts, causing a massive layout shift.

**The correct behavior:** BOTH branches are rendered in HTML. A `beforeInteractive` inline script sets `data-js="true"` on `<html>`. CSS selects the correct branch BEFORE first paint. No branch swap, no CLS. The spec (section 2.1) covers this in detail.

### Failure Mode 15: Sizing Canvas to Desired Tier Instead of Active Tier

**The bad behavior:** Agent sets canvas backing store to 1920px wide because the desired tier is "large", even though only thumb frames are decoded so far.

**The correct behavior:** Canvas backing store MUST use the active tier's long edge. If only thumb frames are available, the canvas backing store uses 480px. The spec (section 10.3) provides the exact formula. Oversizing the canvas wastes GPU memory and produces blurry upscaling artifacts.

---

## Appendix A: Scroll Phase Boundaries Quick Reference

All values are `scrollProgress` (0–1). Defined in `src/lib/hero/constants.ts` as `PHASES`.

| Phase | Start | End | Notes |
|---|---|---|---|
| Portal zoom | 0.00 | 0.12 | CSS scale + rotate on cosmos and arms |
| Portal hide | — | 0.14 | Stop pulse/shooting-star, hide portal layers |
| Vignette | 0.00 | 0.14 | Ramp up to 0.08, ramp down to 0.14 |
| Golden flash | 0.10 | 0.13 | One-shot, bell curve peak |
| Celebration canvas | 0.12 | 0.55 | Slow zone 0.20–0.30 |
| Celebration fade-out | 0.52 | 0.57 | Opacity 1→0, then hidden + stop drawing |
| Poster hide | — | 0.57 | Hide poster layer |
| Sparkle preshow | 0.43 | — | Begin sparkle visibility |
| Sparkle burst | 0.45 | 0.75 | Screen blend, linear frame mapping |
| Sparkle hide | — | 0.77 | Hide and stop drawing |
| Blackout overlay | 0.70 | 0.78 | Opacity 0→1 |
| Dark anticipation | 0.78 | 0.85 | One subtle gold particle, only while blackout fully opaque |
| Trophy reveal | 0.85 | 0.93 | Opacity 0→1 + translateY 30px→0, ease-out |
| Lens flare | — | — | One-shot when trophy opacity first crosses 0.8 |
| CTA | 0.93 | 1.00 | Fade in, pulse 500ms after opacity >= 0.8 |

## Appendix B: Z-Index Stack

| z-index | Layer |
|---|---|
| 0 | Background (navy → black gradient) |
| 10 | Stadium poster (static fallback) |
| 11 | Celebration canvas |
| 15 | Sparkle burst canvas (screen blend) |
| 16 | Black overlay + anticipation particle |
| 18 | Trophy + CTA |
| 20 | Portal cosmos |
| 21 | Portal arms |
| 25 | Golden flash |
| 28 | Vignette |
| 30 | Film grain |

## Appendix C: CSS Animations

| Name | Duration | Trigger | Loop? |
|---|---|---|---|
| heartbeat | 0.83s | Always (while portal visible) | Yes |
| shoot | 1.5s | 2s after enhancedReady (cancel if scrollProgress > 0.06) | Once |
| grain-shift | 0.3s (steps) | Always | Yes |
| flare-sweep | 1.5s | Trophy opacity first crosses 0.8 | Once |
| cta-pulse | 0.6s | 500ms after CTA opacity >= 0.8 | Once |
| spotlight-breathe | 3s | Always (coarse-pointer, trophy visible) | Yes |
| anticipation-drift | 4s | Dark zone (0.78–0.85) | Yes |

## Appendix D: Design Tokens

| Token | Value | Usage |
|---|---|---|
| Navy | #1B2A4A | Background top (cosmos phase) |
| Gold | #C9A84C | Portal ring, CTA, sparkle accent |
| Gold Light | #E8D48B | CTA hover gradient endpoint |
| True Black | #000000 | Background bottom (trophy phase) |
| Countdown target | `2026-06-11T19:00:00Z` | Opening match kickoff |
| Countdown label | "Countdown to kickoff" | Displayed with the timer |

## Appendix E: Frame Tier Selection

| Effective Long Edge | Desired Tier | Frame Width |
|---|---|---|
| ≤ 1100px | medium | 960px |
| > 1100px | large | 1920px |

All clips start with `thumb` (480px) as the active tier. The desired tier determines what full-resolution frames to prefetch. Canvas backing store matches the **active** tier, not the desired tier.

Optional hint: if `navigator.deviceMemory <= 4`, prefer `medium` on borderline devices.

## Appendix F: Enhancement Readiness Checklist

`enhancedReady = true` requires ALL of:

| # | Condition |
|---|---|
| 1 | `portal-cosmos.webp` decoded |
| 2 | `arm-left.webp` decoded |
| 3 | `arm-right.webp` decoded |
| 4 | `stadium-poster.webp` decoded |
| 5 | Portal geometry loaded from generated metadata |
| 6 | Stage has measured its size and hole transform origin |

Until ready: BootStill visible, enhanced stack opacity 0, no decorative one-shot effects.

## Appendix G: Quick Reference

| Action | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Extract frames | `bash scripts/extract-frames.sh` |
| Optimise assets | `bash scripts/optimise-assets.sh` |
| Emit generated metadata | `node scripts/emit-generated-hero-metadata.mjs` |
| Add a dependency | `pnpm add <package>` |
| Check what's forbidden | Search this document for "FORBIDDEN" |
