// Baseline adaptive zoom target for far-spread combat (not a hard clamp).
// Units: unitless zoom multiplier.
// Constraints: CAMERA_MIN_ZOOM <= CAMERA_DEFAULT_ZOOM <= CAMERA_MAX_ZOOM.
// Practical range: ~0.85 to ~1.10 (current 0.95).
export const CAMERA_DEFAULT_ZOOM = 0.95;

// Absolute renderer-side zoom rails.
// These clamp final zoom after controller output and any viewport compensation.
// Units: unitless zoom multiplier.
// Constraints: 0 < CAMERA_MIN_ZOOM < CAMERA_MAX_ZOOM.
// Keep CAMERA_MAX_ZOOM >= CAMERA_MAX_CLOSE_ZOOM.
// Practical ranges: MIN ~0.75..1.10, MAX ~1.05..1.80.
export const CAMERA_MIN_ZOOM = 0.9;
export const CAMERA_MAX_ZOOM = 1.4;

// Adaptive close-range target when players are tightly clustered.
// This is the upper zoom target used at or below MIN_SPREAD_FOR_MAX_ZOOM.
// Units: unitless zoom multiplier.
// Constraints: CAMERA_DEFAULT_ZOOM <= CAMERA_MAX_CLOSE_ZOOM <= CAMERA_MAX_ZOOM.
// Practical range: ~1.05 to ~1.60 (current 1.35).
export const CAMERA_MAX_CLOSE_ZOOM = 1.35;

// Spread thresholds for mapping player spread -> zoom target.
// "Spread" is the maximum pairwise distance between camera anchors (ships) in world units.
// World units here match arena coordinates (current arena is 1200x800, diagonal ~1442).
// Units: world units (arena-space px).
// <= MIN_SPREAD_FOR_MAX_ZOOM  -> target CAMERA_MAX_CLOSE_ZOOM
// >= MAX_SPREAD_FOR_DEFAULT_ZOOM -> target CAMERA_DEFAULT_ZOOM
// Between thresholds -> smooth interpolation from close zoom to default zoom.
// Constraints: 0 <= MIN_SPREAD < MAX_SPREAD.
// Practical range for this map size: MIN ~150..700, MAX ~300..1200.
export const CAMERA_MIN_SPREAD_FOR_MAX_ZOOM = 280;
export const CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM = 720;

// Critically-damped smoothing times (seconds).
// Higher = slower/smoother camera response. Lower = snappier/more reactive.
// Units: seconds.
// Constraints: > 0.
// Practical range: ~0.06 to ~0.45.
export const CAMERA_ZOOM_SMOOTH_TIME = 0.24;
export const CAMERA_FOCUS_SMOOTH_TIME = 0.2;
export const CAMERA_SPREAD_SMOOTH_TIME = 0.16;

// Deadband for suppressing tiny target zoom deltas (reduces "breathing"/micro-jitter).
// Higher = more stable framing, but less responsive to small spread changes.
// Units: zoom-delta (same unitless zoom scale as zoom values).
// 0.03 means "ignore target zoom changes smaller than 0.03x".
// Constraints: >= 0.
// Practical range: ~0.002 to ~0.03.
export const CAMERA_ZOOM_DEADBAND = 0.03;

// Focus slack beyond arena edges, as a fraction of current half-view size.
// 0.0 = strict edge clamp.
// 1.0 = full half-view overshoot allowed before clamping.
// This affects focus clamping only; it does not change zoom.
// Units: ratio (unitless).
// Practical range: 0.0 to 1.0.
export const CAMERA_EDGE_SLACK_RATIO = 1.0;
