# Starfield Performance Investigation

Date: February 23, 2026
Scope: CSS 3D starfield background (`index.html` + `src/ui/screens.ts`)

## Goal

Track runtime lag + background flicker + HUD disappearing/reappearing while the animated starfield is active.

## Current State (as of this note)

- Star count is fixed at `800`.
- Stars are created once (no per-frame regeneration).
- Star generation uses `SeededRNG` (existing project RNG), not ad-hoc random helpers.
- Stars are appended via `DocumentFragment` (single append at init).
- Active animation is ON:
  - `.stars-layer` is paused by default.
  - `.stars-container.active .stars-layer` runs animation.
- Star node visual style is currently:
  - `width: 2px`
  - `height: 2px`
  - `background: #fff`
  - `border-radius: 0`
  - `backface-visibility: hidden`

## What Was Pulled Out

Removed from star node generation in `src/ui/screens.ts`:

- Per-star color variation.
- Per-star brightness variation.
- Per-star size variation.

Removed from CSS star style in `index.html`:

- Circular stars (`border-radius: 50%`) for current working config.

## Experiment Timeline and Results

1. Baseline simplified config (square stars, fixed style, animation ON)
- Result: lag/flicker significantly improved versus earlier broken state.

2. Toggle: `backface-visibility: visible` only
- Result (user report): no runtime degradation by itself.

3. Re-enable visual complexity (round stars + per-star size/color/brightness), keep backface visible
- Result (user report): broke outright.
- Symptoms: background flickers on/off, HUD disappears/reappears randomly.

4. Keep complexity ON, switch backface back to hidden
- Result (user report): still broken.
- Conclusion: backface handling is not the primary root cause.

5. Keep round stars, remove per-star size/color/brightness again
- Result (user report): still bad lag.
- Conclusion: per-star variation is not the primary root cause either.

6. Toggle only `border-radius` from `50%` to `0` (square), keep other simplified settings
- Result (user report): tearing/flicker appears gone; some lag still observed but laptop was in low-performance mode.
- Working hypothesis: circular anti-aliased stars (border radius) are the main trigger for compositor instability in this setup.

## Root-Cause Status

- Confirmed NOT primary:
  - Backface visibility setting alone.
  - Per-star variation alone.
- Strongly implicated:
  - Round star rasterization (`border-radius: 50%`) under 3D transform animation.

## Files Involved

- `astro-party/index.html`
- `astro-party/src/ui/screens.ts`

## Resume Checklist

1. Re-test current square-star config on normal laptop power profile.
2. A/B test only `border-radius` (`0` vs `50%`) under identical conditions.
3. If round stars are required, try alternatives:
- Keep square DOM stars, fake round look via subtle glow layer on parent.
- Reduce star count only when circle mode is enabled.
- Try a second lightweight twinkle layer instead of round alpha edges.
4. Capture before/after screen recording to validate HUD stability.

