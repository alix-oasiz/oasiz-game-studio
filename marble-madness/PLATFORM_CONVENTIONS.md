# Platform And Tile Conventions

## Purpose
This file defines the shared language for track generation so prompts map to deterministic geometry.

## Core Terms
- Platform: One authored gameplay unit in the map sequence (not one physics slice).
- Tile: Visual/collider output generated from platform data.
- Slice: Internal subdivision used by code for smoothing/collision. Slices are implementation detail only.
- Segment: Continuous run of slices belonging to one platform.
- Detour: Short lateral offset in `x` while forward flow still primarily moves in `-z`.

## Coordinate Intent
- Forward progression: `-z`
- Left/Right lane movement: `-x` / `+x`
- Up/Down: `+y` / `-y`

## Authoring Rules
- Camera heading stays forward along `-z`; detours are lateral pans, not hard turns.
- A gap platform means no floor collider/mesh for that z-range.
- Smooth transitions are mandatory between adjacent platforms:
  - Slope transitions should be eased, not instant.
  - Lateral transitions should use eased interpolation, not sharp corners.
- Wall geometry should be integrated with floor shape (half-pipe style), not detached rails.
- Endless progression rule:
  - Generated runs increase authored platform count over time (4, then 5, then 6, ...).
- Fixed start sequence rule:
  - Every generated level must begin with `flat -> slope_down_steep -> flat`.
  - Player spawn is on the first flat platform.
  - Enemy pack spawn is on the second flat platform at the bottom of the opening ramp.

## Platform Build Architecture
- Authoring model:
  - Platforms are defined as high-level platform sequences.
  - Slices are internal sampling only for path evaluation and physics placement.
- Visual model:
  - Build one continuous floor mesh per contiguous floor run (not one mesh per slice).
  - Build one continuous left wall mesh and one continuous right wall mesh per run.
  - Walls are straight, box-like, and directly attached to floor edges.
  - Use the platform wood texture on all platform surfaces, including floor and both side walls.
- Physics model:
  - Keep simplified, aligned colliders along sampled slices.
  - Wall colliders must remain directly attached to floor edges.
- UV model:
  - Texture UVs should be based on world-distance along the run, not per-slice UV reset.
  - This prevents over-tiling/stretch artifacts when sampling density changes.

## Platform Types
- `flat`: Neutral slope.
- `slope_down_soft`: Mild negative y gradient.
- `slope_down_steep`: Strong negative y gradient.
- `spiral_down_left`: Full-revolution descending spiral biased to the left.
- `spiral_down_right`: Full-revolution descending spiral biased to the right.
- `detour_left_short`: Short lateral offset left while still moving forward.
- `detour_right_short`: Short lateral offset right while still moving forward.
- `bottleneck`: Reduced track width.
- `gap_short`: Brief jump with no floor.
- `gap_jump_short`: Composite jump platform made of `launch_ramp + gap + landing_segment`.
- `finish_straight`: Final straight with finish line.

## Gap Rules
- Gap precondition:
  - Any `gap_*` platform must be preceded by a jump-prep slope (`slope_down_soft` or `slope_down_steep`) or by an explicit launch-ramp platform.
- Do not place a gap directly after `flat` unless a launch ramp is inserted first.
- Preferred authoring pattern:
  - Use `gap_jump_short` as the default gap tool so launch and landing behavior are built in.
- Validation:
  - If a prompt requests a gap without launch context, auto-insert a jump-prep slope before the gap.
- Runtime generation constraints:
  - `gap_short` must be short/jumpable (target short span, not long chasms).
  - The platform immediately before a generated `gap_short` is force-upgraded to a steep launch section (`slope_down_steep`) when needed.
  - The landing floor after a generated gap must be lower in `y` than the takeoff edge so speed can carry the marble across.

## Texture Rules
- Platform textures are world-density based, not per-slice stretched.
- Keep grain scale visually consistent across the full track.
- The same wood texture should be applied to platform floors and platform walls unless explicitly overridden by a themed level requirement.

## Prompt Contract
When user describes a map in plain English, Codex should:
1. Translate to a platform sequence.
2. Resolve per-platform parameters (length, slope, width, lateral offset).
3. Auto-smooth platform joins.
4. Preserve gameplay intent over literal wording when conflicts appear.
