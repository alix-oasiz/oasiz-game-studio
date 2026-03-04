# Marble Madness Platform Generation Rules

This file is the source of truth for expected behavior.
Use it to validate implementation and discuss changes.

## Platform Generation Rules (Global)

1. Fixed platform type registry
- Only declared `PlatformType` values may be generated.

2. Sequential connected generation flow
- Generation order is: `start` -> middle platforms (one-by-one, each connected to previous) -> `end`.

3. Uncapped platform-count growth
- Target platform count grows with progression and is not hard-capped.
- Current formula target: `4 + loopsCompleted` (includes `start` + `end`).

4. Fixed boundary lengths
- `start` length is fixed at `24`.
- `end` length is fixed at `24`.

5. Per-platform middle length selection
- Middle platform lengths are selected at placement time (type-aware), not pre-split from a global budget.
- Length safety minimums are enforced.

6. Lateral offset continuity + clamp
- Left/right offset carries forward across sections.
- Offset is globally clamped to prevent unbounded drift.

7. Slope continuity
- Slope transitions are smoothed across section boundaries.
- Explicit per-type shaping rules may override smoothing where needed (for example `jump` shaping).

8. Global slope safety clamp
- Final sampled slope is clamped to global uphill/downhill bounds.

## Obstacle Spawning Ruleset (Global)

1. Strict spawn safety filtering
- Obstacle placement must pass section-type and safety checks (spacing, safe distances, etc.).

2. Start exclusion
- Obstacles must not spawn on `start`.

## Platform-Type Notes (Current)

1. `start`
- Flat boundary section at run beginning.
- Fixed length: `24`.
- No obstacle spawning allowed.

2. `end`
- Flat boundary section at run end.
- Fixed length: `24`.

3. `jump`
- Behaves as ramp-up then gap then flat landing within one platform type.
- Jump shape is defined by section progress windows.
- Current shape constants:
  - Ramp window: first `42%` of section.
  - Gap window: next `24%` of section.
  - Landing window: remaining section.
- Gap behavior is represented in sampled floor availability and slope shaping.
- Jump sections use explicit local shaping and do not use boundary slope blending.
- Jump length range is generated in a dedicated jump range.

4. `slope_up_steep`
- Uphill section type used for stronger climbs.
- Steepness is governed by the configured uphill slope angle and global slope clamp.

5. Spiral platforms (`spiral_down_left`, `spiral_down_right`)
- Spiral column/axis is centered in the reserved section space.
- Spiral radius scales down when section length cannot support full target radius.
- Spiral length is derived from:
  - configured radius
  - one-turn circumference
  - entry and exit ramp-out lengths
- Spiral supports are placed at the same computed center axis as the spiral path.

6. Detour platforms (`detour_left_short`, `detour_right_short`)
- Apply lateral offset change in their facing direction.
- Offset contributes to the carry-forward lateral path and remains globally clamped.

7. `bottleneck`
- Narrows playable width relative to baseline track width.
- Used as a neutral/safe fallback section in random selection when needed.

8. `flat`
- Baseline neutral section.
- Used as fallback/normalizer section in random selection.

## Platform Selection Rules (Current)

1. Random selection uses weighted branching with guardrails.
2. Back-to-back spiral-style sections are constrained by selector logic.
3. Type-specific overrides are applied after pick:
- Spiral sections force derived spiral length.
- Jump sections force jump-specific length range.
4. In non-custom random mode, final middle section is normalized to `flat` before `end`.

---

When rules change, update this file first (or in the same change) and then align code.
