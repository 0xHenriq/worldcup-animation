# World Cup 2026 — Hero Section Implementation Specification (v3.1 reviewed)

This review pass fixes the remaining architectural and implementation issues from v3.

## Review-pass fixes in this version

- Added a shared `portal-composite.webp` boot-still asset so the first paint, no-JS fallback, and enhanced handoff all use the same opening frame.
- Removed the remaining layout-shift trap by switching mode selection to a **pre-paint JS flag + CSS**, not a post-mount branch swap.
- Replaced the risky `calc(number * length)` scroll-height rule with an explicit `--hero-scroll-height` CSS variable set by runtime.
- Clarified that the sticky stage is the pinned viewport and **all hero layers are absolutely positioned inside it**. No child layer should be `position: fixed`.
- Added an **enhancement readiness gate** so the enhanced layers do not appear until their critical assets and measurements are ready.
- Fixed the canvas-sizing rule so it uses the **active render tier** (`thumb` / `medium` / `large`), not just the desired full tier.
- Fixed the draw-skip rule so canvases redraw when the current frame upgrades from thumb to medium/large, even if the frame index is unchanged.
- Removed metadata drift by making generated TypeScript modules the runtime source of truth. Do not fetch metadata JSON over the network at runtime.
- Added explicit `inert` / `aria-hidden` rules for whichever branch is inactive.
- Clarified that only the shared boot-still is server-rendered in the enhanced shell; the heavy separated enhanced assets are client-loaded after enhancement is confirmed, so reduced-motion/static users do not pay for hidden image requests.

---

## 1) Product goal

Build a scroll-driven cinematic hero for a FIFA World Cup 2026 ticketing page:

1. The user lands on a full-viewport cosmic portal scene.
2. As they scroll, they fly through the portal into a stadium celebration.
3. Golden sparkler bursts flood the frame.
4. The frame fades to black.
5. The World Cup trophy emerges.
6. A CTA appears: **Take Your Seat**.

Scroll down advances. Scroll up reverses. The experience must feel premium on desktop and mobile, but it must degrade gracefully to a static layout when JavaScript is unavailable or reduced motion is requested.

---

## 2) Rendering modes and first-paint strategy

There are only two modes:

- **Static mode**: no-JS and `prefers-reduced-motion: reduce`
- **Enhanced mode**: JS available and motion allowed

### 2.1 Pre-paint mode selection (prevents CLS)

Do **not** render static first and then replace it with the enhanced scroll shell after mount. That causes a large layout shift.

Instead:

1. Render **both branches** in HTML.
2. Default CSS shows the static branch and hides the enhanced branch.
3. In `app/layout.tsx`, add a tiny inline script with `beforeInteractive` timing that sets `document.documentElement.dataset.js = "true"` before first paint.
4. CSS then selects the enhanced branch **before** the page is painted for JS-enabled users who do not request reduced motion.

Conceptually:

```tsx
<Script id="js-flag" strategy="beforeInteractive">
  {`document.documentElement.dataset.js = 'true';`}
</Script>
```

```css
.hero-static { display: block; }
.hero-shell  { display: none; }

@media (prefers-reduced-motion: no-preference) {
  html[data-js="true"] .hero-static { display: none; }
  html[data-js="true"] .hero-shell  { display: block; }
}
```

That gives:

- no-JS users: static branch only
- reduced-motion users: static branch only
- JS + motion users: enhanced shell from first paint, with no later branch swap and no CLS

### 2.2 Shared opening frame

Both branches should reuse the same asset for the opening visual:

- `portal-composite.webp`

This image is the first frame of the experience and should match the separated enhanced layers exactly at rest.

It is used in three places:

1. the no-JS / reduced-motion static branch
2. the enhanced shell boot-still on first paint
3. the LCP candidate image

### 2.3 Enhancement readiness gate

In enhanced mode, the hero shell is present from first paint, but the separated enhanced layers should **not** appear until they are ready.

`enhancedReady = true` only when:

- `portal-cosmos.webp` has decoded
- `arm-left.webp` has decoded
- `arm-right.webp` has decoded
- `stadium-poster.webp` has decoded
- portal geometry is loaded from generated metadata
- the stage has measured its size and hole transform origin

Until then:

- keep `BootStill` visible
- keep enhanced layer stack opacity at `0`
- do not start decorative one-shot effects

Once ready, crossfade `BootStill` out and fade the enhanced layer stack in. Because both represent the same opening frame, the handoff should be invisible.

---

## 3) Stack

- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS v4
- HTML5 Canvas
- CSS transforms / opacity / gradients
- No GSAP, Framer Motion, Lottie, Three.js, or WebGL

---

## 4) Required assets

### 4.1 Visual assets

- `portal-composite.webp` — shared opening still for LCP, static mode, and enhanced boot-still
- `portal-cosmos.webp` — cosmos + portal ring + transparent hole, no arms
- `arm-left.webp` — transparent WebP
- `arm-right.webp` — transparent WebP
- `stadium-poster.webp` — first frame of the celebration clip
- `trophy.webp`
- `frames/celebration/thumb/*.webp`
- `frames/celebration/medium/*.webp`
- `frames/celebration/large/*.webp`
- `frames/sparkle/thumb/*.webp`
- `frames/sparkle/medium/*.webp`
- `frames/sparkle/large/*.webp`

Use `thumb = 480w`, `medium = 960w`, `large = 1920w`.

Do not name the tiers `mobile` and `desktop`; the selected tier depends on **effective render size**, not input modality.

### 4.2 Metadata source of truth

Do **not** fetch metadata JSON from `/public` at runtime.

The build pipeline should emit generated TypeScript modules:

- `src/lib/hero/generated/portalGeometry.ts`
- `src/lib/hero/generated/frameManifest.ts`

Designers or scripts may start from JSON, but the app runtime imports generated TS directly.

Example runtime shapes:

```ts
export const PORTAL_GEOMETRY = {
  artboardWidth: 1920,
  artboardHeight: 1080,
  hole: { cx: 960, cy: 540, diameter: 520 },
  leftArm:  { x: 0,    y: 150, width: 760, height: 780 },
  rightArm: { x: 1160, y: 140, width: 760, height: 790 }
} as const;
```

```ts
export const FRAME_MANIFEST = {
  celebration: { count: 60, tiers: ["thumb", "medium", "large"] },
  sparkle:     { count: 60, tiers: ["thumb", "medium", "large"] }
} as const;
```

This avoids:

- extra runtime requests
- JSON / TS drift
- guesswork when clip duration changes

---

## 5) Asset pipeline

### 5.1 Images

- `portal-composite`: WebP, 1920px wide, q=80
- `portal-cosmos`: WebP, 1920px wide, q=80
- `arm-left`, `arm-right`: WebP with alpha, 1920px wide, q=80
- `trophy`: WebP, long edge 1200px, q=85
- `stadium-poster`: WebP, 1920px wide, q=80

### 5.2 Video-to-frame extraction

Preferred build approach:

1. normalize each source clip to exactly 4.000 seconds **or** accept the true duration and let the manifest reflect the real extracted count;
2. extract PNGs at 15fps;
3. convert PNGs to WebP in three tiers;
4. emit `frameManifest.ts`.

Do not hand-maintain `TOTAL_FRAMES`.

### 5.3 Sparkle black level

The sparkle source must have a true black background.

If needed, crush blacks during preprocessing so black pixels are `rgb(0,0,0)`. Any raised black level will tint the scene when `mix-blend-mode: screen` is applied.

### 5.4 Caching and CORS

All fingerprinted hero assets should be served with:

```http
Cache-Control: public, max-age=31536000, immutable
```

If frame images are served cross-origin, ensure:

- `Access-Control-Allow-Origin` permits the site origin
- any programmatic image loading uses `crossOrigin = "anonymous"` where applicable

The implementation does not need canvas readback, but cross-origin fetch/decode still needs correct CORS.

---

## 6) DOM structure

Render both branches in HTML, but do **not** server-render the heavy separated enhanced assets as hidden `<img>` tags.

```tsx
<section aria-labelledby="hero-title" className="hero-root">
  <h1 id="hero-title" className="sr-only">FIFA World Cup 2026 Tickets</h1>

  <StaticHeroFallback className="hero-static" />

  <div className="hero-shell">
    <div className="hero-scroll">
      <div className="hero-stage">
        <BootStill />
        <EnhancedHeroStage />
      </div>
    </div>
  </div>
</section>
```

### 6.1 `StaticHeroFallback`

Natural-flow, stacked layout for static mode.

Recommended contents:

1. `portal-composite.webp` full-width opening image
2. `stadium-poster.webp` full-width supporting image
3. trophy block
4. primary CTA link
5. secondary CTA link

Loading guidance for this branch:

- `portal-composite.webp`: eager, high priority
- `stadium-poster.webp`: default priority
- trophy image: lazy

This branch must remain fully usable with no JavaScript.

### 6.2 `BootStill`

Enhanced-mode opening still inside the sticky stage.

Use `portal-composite.webp` and keep it visible until `enhancedReady`.

This is decorative in enhanced mode, so it should be `aria-hidden="true"`.

### 6.3 `EnhancedHeroStage`

Contains the animated layer stack. It may mount immediately as a client component, but on the server it should render only a lightweight mount point.

Do not server-render hidden `<img>` tags for:

- `portal-cosmos.webp`
- `arm-left.webp`
- `arm-right.webp`
- `stadium-poster.webp`

Those assets should be created or requested by the client runtime only after enhanced mode is confirmed. Otherwise reduced-motion/static users still pay for hidden downloads.

### 6.4 Inactive branch rules

Whichever branch is inactive must not remain focusable.

When enhanced mode is active:

- static branch gets `aria-hidden="true"` and `inert`
- enhanced shell is interactive only when its CTA stack becomes usable

When static mode is active:

- enhanced shell is `display: none` and not mounted into the accessibility tree

---

## 7) Layout and scroll architecture

### 7.1 Scroll shell height

Do not compute scroll height with CSS multiplication.

Use an explicit CSS variable:

```css
.hero-scroll {
  height: var(--hero-scroll-height, 450dvh);
  position: relative;
}

@media (pointer: coarse) {
  .hero-scroll {
    height: var(--hero-scroll-height, 350dvh);
  }
}
```

At runtime, set `--hero-scroll-height` in pixels.

### 7.2 Viewport variables

On mount, compute:

- `viewportH = visualViewport?.height ?? window.innerHeight`
- `multiplier = coarsePointer ? 3.5 : 4.5`

Set:

- `--hero-vh: ${viewportH}px`
- `--hero-scroll-height: ${viewportH * multiplier}px`

Update them on:

- `resize`
- `orientationchange`
- `visualViewport.resize`
- `pageshow`

Use rAF or a small debounce for resize-driven recalculation.

### 7.3 Sticky stage

The stage is the pinned viewport.

```css
.hero-stage {
  position: sticky;
  top: 0;
  height: var(--hero-vh, 100dvh);
  overflow: clip;
  isolation: isolate;
}
```

If `overflow: clip` causes browser issues in QA, fall back to `overflow: hidden`.

### 7.4 Layer positioning

Because `.hero-stage` is already sticky, every visual layer inside it should be:

```css
position: absolute;
inset: 0;
```

No child hero layer should use `position: fixed`.

### 7.5 Scroll progress

Compute:

```ts
scrollProgress = clamp(
  (window.scrollY - startY) / (endY - startY),
  0,
  1
)
```

Where:

- `startY = scrollContainerDocumentTop`
- `endY = startY + scrollContainerHeight - viewportHeight`

Recalculate `startY` and `endY` on:

- mount
- `pageshow`
- resize
- any scroll-shell size change

Use a `ResizeObserver` on `.hero-scroll` if available.

### 7.6 One scroll pipeline

The enhanced hero uses exactly:

- one passive scroll listener
- one rAF tick

The rAF tick:

- measures `scrollProgress`
- writes CSS custom properties on the hero root
- updates one-shot gate refs
- schedules frame prefetch/decode work
- redraws each canvas **only if** its draw key changed

### 7.7 One-shot gates

The following are one-shot effects:

- golden flash
- trophy lens flare
- CTA pulse
- shooting star

Store their gate state in refs, not React state.

Initialize those refs from the current `scrollProgress` on mount and `pageshow` so restoring into the middle of the hero does not incorrectly trigger them.

---

## 8) Phase boundaries

Keep all phase constants in one file.

```ts
export const PHASES = {
  PORTAL_START: 0.00,
  PORTAL_END: 0.12,
  PORTAL_HIDE: 0.14,

  VIGNETTE_START: 0.00,
  VIGNETTE_PEAK: 0.08,
  VIGNETTE_END: 0.14,

  FLASH_START: 0.10,
  FLASH_END: 0.13,

  CELEBRATION_START: 0.12,
  SLOW_ZONE_START: 0.20,
  SLOW_ZONE_END: 0.30,
  CELEBRATION_END: 0.55,
  CELEBRATION_FADE_START: 0.52,
  CELEBRATION_FADE_END: 0.57,

  POSTER_HIDE: 0.57,

  SPARKLE_PRESHOW: 0.43,
  SPARKLE_START: 0.45,
  SPARKLE_END: 0.75,
  SPARKLE_HIDE: 0.77,

  BLACKOUT_START: 0.70,
  BLACKOUT_END: 0.78,

  ANTICIPATION_START: 0.78,
  ANTICIPATION_END: 0.85,

  TROPHY_START: 0.85,
  TROPHY_END: 0.93,

  CTA_START: 0.93,
  CTA_END: 1.00
} as const;
```

---

## 9) Loading strategy

### 9.1 Initial request set

Highest priority:

- `portal-composite.webp`

Client-requested after enhanced mode is confirmed, normal eager priority for enhancement readiness:

- `portal-cosmos.webp`
- `arm-left.webp`
- `arm-right.webp`
- `stadium-poster.webp`
- hero client bundle

Later / idle:

- trophy
- frame tiers

Only the LCP candidate image should use `fetchPriority="high"`.

`portal-composite.webp` must be in the initial HTML, not lazy-loaded, and should use `decoding="async"`.

### 9.2 Why this split

The first paint is served by the boot-still or static fallback.

That means the enhanced critical assets do **not** need to block first paint. They only need to arrive before the handoff from `BootStill` to `EnhancedHeroStage`.

Because those assets are client-requested only after enhanced mode is confirmed, reduced-motion and no-JS users do not waste bandwidth on hidden enhancement-only images.

### 9.3 Frame prefetching

Begin celebration thumb prefetch when either condition is true:

- `scrollProgress > 0.02`
- or the hero is visible and idle time is available

Start sparkle thumb prefetch at `scrollProgress > 0.30`.

Use a proximity-based queue, not simple `0001 -> N` order:

1. current target frame
2. nearby frames around target
3. rest of thumb tier outward
4. current-window replacements in selected full tier
5. remaining selected full-tier frames outward

Use `requestIdleCallback` when available; otherwise fall back to a small `setTimeout`.

### 9.4 Trophy

Trophy image can load lazily after `scrollProgress > 0.50` or during idle time. It is not needed for the opening view.

---

## 10) Frame tiers and canvas sizing

### 10.1 Desired tier vs active tier

These are different values.

- **desired tier**: what the viewport can ultimately benefit from (`medium` or `large`)
- **active tier**: what is currently available for the target frame (`thumb`, `medium`, or `large`)

Always start with `thumb`. As better frames arrive, the current frame may upgrade without its index changing.

### 10.2 Tier selection

Choose the desired tier from **effective rendered long edge**, not from “mobile vs desktop”.

```ts
effectiveLongEdge =
  Math.max(viewportWidth, viewportHeight) *
  Math.min(window.devicePixelRatio || 1, 2);

if (effectiveLongEdge <= 1100) desiredTier = "medium";
else desiredTier = "large";
```

Optional hint:

- if `navigator.deviceMemory` exists and is `<= 4`, prefer `medium` on borderline devices

### 10.3 Backing store rule

The canvas backing store must use the **active** tier’s long edge, not the desired tier’s long edge.

```ts
const activeTierLongEdge =
  activeTier === "large"  ? 1920 :
  activeTier === "medium" ?  960 :
                            480;

const scale = Math.min(
  2,
  window.devicePixelRatio || 1,
  activeTierLongEdge / Math.max(viewportWidth, viewportHeight)
);

canvas.width  = Math.round(viewportWidth * scale);
canvas.height = Math.round(viewportHeight * scale);
canvas.style.width = `${viewportWidth}px`;
canvas.style.height = `${viewportHeight}px`;
```

This prevents the canvas buffer from exceeding the currently available frame resolution.

### 10.4 Cover-fit draw helper

Both the poster and the canvases must use the **same** center-anchored cover-fit logic to avoid a visible jump when the poster hands off to the celebration frames.

```ts
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
) {
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (canvasAspect > sourceAspect) {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / sourceAspect;
  } else {
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * sourceAspect;
  }

  const drawX = (canvasWidth - drawWidth) / 2;
  const drawY = (canvasHeight - drawHeight) / 2;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}
```

Set poster `object-position: 50% 50%` to match.

### 10.5 Draw-skip rule

Do not skip redraws based only on frame index.

The canvas draw key must include at least:

- frame index
- active tier or frame revision
- canvas width
- canvas height
- visibility state

If the current frame upgrades from `thumb` to `medium` or `large`, redraw even if the index did not change.

---

## 11) Frame mapping

### 11.1 Celebration slow zone

Use the piecewise mapping, but drive the count from `FRAME_MANIFEST.celebration.count`.

Clamp the scroll value to `[CELEBRATION_START, CELEBRATION_END]` before applying the slow-zone formula. From `0.55` to `0.57`, hold the last frame while fading out.

### 11.2 Sparkle mapping

Sparkle is linear across `[SPARKLE_START, SPARKLE_END]`. No slow zone.

---

## 12) Source cache vs decode cache

These are separate.

### 12.1 Source cache

Use the browser HTTP cache for compressed frame resources.

The loader may prefetch frame URLs, but it must **not** keep every fetched frame as a JS `Blob` in memory.

The runtime only needs to know:

- which frames have at least `thumb`
- which frames have the desired full tier
- which requests are in flight

### 12.2 Decode cache

Maintain a sliding window of decoded `ImageBitmap`s.

Default window sizes:

- **large tier:** 20 decoded frames per active clip
- **medium tier:** 12 decoded frames per active clip

During overlap, both clips may be active. When a clip is inactive, aggressively shrink or clear its bitmap window.

When evicting an `ImageBitmap`, call `.close()` immediately.

### 12.3 Decode method

Preferred:

- `fetch` + `blob` + `createImageBitmap()`

Fallback when unavailable:

- `HTMLImageElement.decode()` + `drawImage`

Any in-flight fetch/decode work should be tied to an `AbortController` and a generation token so late results from an old tier/window are ignored.

### 12.4 Fast-scroll behavior

If the target frame is outside the current decoded window:

1. draw the nearest available decoded frame
2. recenter decode priority around the new target index
3. do **not** walk sequentially from the old index

---

## 13) Portal composition

### 13.1 Portal artboard

Treat the portal as a virtual 1920×1080 artboard defined by generated portal geometry.

The artboard is cover-fit into the viewport. Inside that artboard:

- cosmos fills the artboard
- left and right arms are placed using metadata coordinates

This guarantees alignment at scale `1`.

### 13.2 Shared transform origin

The cosmos wrapper and the arms wrapper must use the same transform origin: the portal hole center from generated portal geometry, converted into rendered artboard coordinates.

### 13.3 Max scale

Do **not** use `imageWidth / holeDiameter` as the scale rule.

Correct rule:

1. compute the rendered hole center and hole radius at scale `1`
2. compute the distance from the hole center to the farthest viewport corner
3. set:

```ts
maxScale = (farthestCornerDistance / holeRadius) * 1.05
```

This ensures the hole clears the full viewport, including off-center compositions.

### 13.4 Portal transforms

Portal phase progress:

```ts
portalProgress = mapRangeClamped(scrollProgress, PHASES.PORTAL_START, PHASES.PORTAL_END, 0, 1)
```

Cosmos:

- `scale = 1 + easeInCubic(portalProgress) * (maxScale - 1)`
- `rotate = easeInCubic(portalProgress) * 1.5deg`

Arms:

- same rotation
- scale multiplier = cosmos scale, but eased to **85%** of cosmos travel

This slower arm expansion is intentional. It is not “wrong parallax”; it keeps the arms acting like the last visible part of the portal frame.

### 13.5 Portal layer lifetime

Keep the portal layers active only through `PORTAL_HIDE = 0.14`. After that:

- stop pulse/shooting-star work
- hide the portal layers
- clear `will-change` if it was set dynamically

---

## 14) Visual layers

All decorative layers must have:

```css
pointer-events: none;
```

Only the CTA stack should accept interaction.

### 14.1 Layer 0 — background

Use two stage-sized layers:

- base navy
- black overlay fading in from `0.30 -> 0.70`

That is cheaper and simpler than recomputing interpolated RGB values every frame.

### 14.2 Layer 1 — poster

Static poster under the portal and under the celebration canvas.

Always present at the start. Hide after `POSTER_HIDE`.

### 14.3 Layer 2 — celebration canvas

Visible from `CELEBRATION_START`.  
Fade opacity from `1 -> 0` during `0.52 -> 0.57`.  
After `0.57`, set hidden and stop drawing.

If no suitable frame is decoded yet, continue showing the poster behind it. Never show a blank canvas.

### 14.4 Layer 3 — sparkle canvas

Visible from `SPARKLE_PRESHOW`.  
Use `mix-blend-mode: screen`.  
Hide after `SPARKLE_HIDE` and stop drawing.

The stage must be isolated so the screen blend does not affect page content outside the hero.

### 14.5 Layer 4 — blackout + anticipation particle

Black overlay opacity:

- `0` at `BLACKOUT_START`
- `1` at `BLACKOUT_END`

During `ANTICIPATION_START -> ANTICIPATION_END`, show one subtle gold particle only if the blackout is fully opaque and the trophy has not started.

### 14.6 Layer 5 — trophy + CTA

#### Trophy entrance

- opacity `0 -> 1` from `0.85 -> 0.93`
- translateY `30px -> 0`
- ease-out

#### Trophy lighting

Do not apply a viewport-wide spotlight overlay.

Instead:

- render a dim base trophy
- render a brighter trophy above it
- mask the bright trophy with a radial spotlight

Desktop: spotlight follows the cursor, updated via rAF-throttled pointer tracking.  
Coarse-pointer devices: use a centered, slowly breathing spotlight.

#### Lens flare

One-shot sweep when trophy opacity first crosses `0.8`.

#### CTA stack

Primary CTA is an `<a>` styled as a button.  
Secondary CTA is a text `<a>` below it.

Use:

```css
padding-bottom: max(24px, env(safe-area-inset-bottom));
```

Do not allow focus or pointer interaction on the CTA stack until its container opacity is `>= 0.8`. Use `inert` until then.

#### CTA pulse

Fire once, 500ms after CTA opacity first reaches `>= 0.8`.

### 14.7 Layer 6 — portal cosmos

Animated only during the portal phase.

### 14.8 Layer 7 — portal arms

Animated only during the portal phase.

### 14.9 Layer 8 — golden flash

Bell-curve opacity from `FLASH_START -> FLASH_END`, but only on the first forward pass.

### 14.10 Layer 9 — vignette

Use a stage-sized radial-gradient overlay, not an animated inset `box-shadow`.

Ramp vignette opacity up from `0.00 -> 0.08` and back down from `0.08 -> 0.14`.

### 14.11 Layer 10 — film grain

Stage-sized decorative overlay, always on, subtle opacity, CSS-stepped jitter.

---

## 15) Motion details

### 15.1 Shooting star

Fire once, 2s after `enhancedReady`, unless the user has already scrolled beyond `0.06`. If so, cancel it.

Tie this timer to the enhancement lifecycle, not just raw component mount, so it does not fire behind the boot-still or before the separated portal layers are visible.

### 15.2 Ring pulse

Portal ring pulse is pure CSS and only needs to exist while the portal is visible.

### 15.3 Draw skipping

If a canvas is hidden, skip its draw call for that tick.

If visible, redraw only when its draw key changed. See section 10.5.

---

## 16) Countdown

Countdown target should be the **opening match kickoff**, not an assumed ceremony timestamp.

Use:

```ts
export const OPENING_MATCH_TARGET_ISO = "2026-06-11T19:00:00Z";
export const COUNTDOWN_LABEL = "Countdown to kickoff";
```

Display format:

- `XX days XX hours XX min XX sec`

When remaining time is `<= 0`, replace with:

- `The World Cup has begun`

### 16.1 Countdown behavior

- use `Date.now()`
- update once per second
- clamp at zero
- clear the interval on unmount

### 16.2 Accessibility for countdown

Do not expose a second-by-second live region to screen readers.

Recommended approach:

- visible timer: `aria-hidden="true"`
- separate visually hidden status text updated at most once per minute, or not live-announced at all

---

## 17) Reduced motion

If `prefers-reduced-motion: reduce`:

- do not activate the enhanced shell
- do not add scroll listeners
- do not preload frame sequences
- do not run decorative motion effects
- show the static fallback only

No portal zoom, no canvas scrubbing, no sparkles, no spotlight motion.

---

## 18) Accessibility and semantics

- `section` has an accessible label or heading
- static fallback trophy image alt: `"FIFA World Cup 2026 Trophy"`
- decorative portal assets, canvases, flash, grain, vignette, sparkles: `aria-hidden="true"`
- primary CTA is a semantic link if it navigates
- secondary CTA is a semantic link
- keyboard focus should not land on invisible CTA controls
- inactive branch must be hidden from the accessibility tree and removed from tab order
- use a visible heading or an `sr-only` heading for document structure

The enhanced canvases do **not** need `role="img"`. They are decorative marketing visuals.

---

## 19) Performance budget

Targets:

- LCP: prioritize `portal-composite.webp`
- no layout shift from hero mode selection or enhancement handoff
- no React re-render loop on scroll
- no blank frame during scrub
- no unbounded bitmap memory growth
- no canvas drawing when hidden
- client bundle target: keep the hero logic lean; do not add animation libraries

Expected bitmap-window budgets:

- **large tier:** ~20 decoded frames per active clip → roughly `~160MB` per clip, `~320MB` worst overlap
- **medium tier:** ~12 decoded frames per active clip → roughly `~24MB` per clip, `~48MB` worst overlap

If QA shows pressure on weaker phones, reduce the medium-tier window further before touching the visual design.

---

## 20) File structure

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css

  components/hero/
    HeroSection.tsx
    StaticHeroFallback.tsx
    BootStill.tsx
    EnhancedHeroStage.tsx
    PortalLayer.tsx
    FrameSequenceCanvas.tsx
    SparkleOverlay.tsx
    TrophyReveal.tsx
    GoldenFlash.tsx
    FilmGrain.tsx

  hooks/
    useReducedMotion.ts
    useFrameLoader.ts
    useHeroRuntime.ts

  lib/hero/
    constants.ts
    easing.ts
    math.ts
    frame-utils.ts
    media.ts
    generated/
      portalGeometry.ts
      frameManifest.ts

public/hero/
  portal-composite.webp
  portal-cosmos.webp
  arm-left.webp
  arm-right.webp
  stadium-poster.webp
  trophy.webp
  frames/
    celebration/
      thumb/
      medium/
      large/
    sparkle/
      thumb/
      medium/
      large/

scripts/
  extract-frames.sh
  optimise-assets.sh
  emit-generated-hero-metadata.mjs
```

---

## 21) Component responsibilities

### 21.0 `EnhancedHeroStage`

Responsibilities:

- render a lightweight mount point on the server
- instantiate enhancement-only asset nodes on the client
- stay visually hidden until `enhancedReady`
- never force reduced-motion/static users to download enhancement-only images

### 21.1 `useHeroRuntime`

Responsibilities:

- set `--hero-vh`
- set `--hero-scroll-height`
- measure `startY/endY`
- own the passive scroll listener
- own the rAF tick
- write CSS vars
- initialize one-shot refs from current progress
- respond to `pageshow`, resize, and scroll-shell size changes
- expose `enhancedReady`

### 21.2 `useFrameLoader`

Responsibilities:

- manage frame availability by tier
- warm HTTP cache in priority order
- manage decoded `ImageBitmap` windows
- evict with `.close()`
- redraw when visible frame revision changes
- cancel stale fetch/decode work with `AbortController`
- ignore late results using generation tokens

### 21.3 `FrameSequenceCanvas`

Responsibilities:

- choose frame index from progress
- request target frame from loader
- draw nearest decoded frame if target missing
- maintain a draw key that includes frame revision and size
- skip draws when hidden or unchanged
- handle resize safely

---

## 22) Edge cases

- **JS enabled but enhanced critical assets are late**: keep `BootStill` visible until `enhancedReady`; never reveal partial separated layers.
- **User lands mid-page or returns from bfcache**: initialize immediately from current scroll position and re-evaluate one-shot gates.
- **Fast scrub**: nearest decoded frame first, recenter decode priority around target.
- **Current frame upgrades tier without index change**: redraw because draw key changed.
- **R2 or CDN failure**: resolver may try a fallback origin, but only if explicit retry logic exists.
- **Hybrid devices**: input modality does not decide frame tier by itself.
- **Canvas/poster handoff**: both must use the same cover-fit anchor.
- **Scroll past hero**: sticky stage releases automatically.
- **Scroll back up**: stage re-engages automatically; one-shot effects do not refire.
- **Slow network**: boot-still and poster remain the fallback while frames warm.
- **Reduced motion toggled before first paint**: CSS keeps the static branch active.
- **Inactive branch focus leak**: enforce `display: none` pre-paint via CSS and `inert` defensively after mount.
- **Hero runtime fails to initialize**: fall back to the static branch rather than leaving the user in a non-animating 450vh shell.
