import * as THREE from "three";

/* ── Game State ── */

/**
 * High-level game flow states used by UI, input handlers, and main update loop.
 * Use case: gate controls and rendering behavior (for example, no collision checks on START).
 */
export type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

/**
 * Platform-supported haptic patterns.
 * Use case: map interaction intensity to a matching vibration style.
 */
export type HapticType = "light" | "medium" | "heavy" | "success" | "error";

/* ── Settings ── */

/**
 * User toggles persisted in local storage and consumed by UI/audio/gameplay systems.
 * Use case: allow players to disable specific feedback channels independently.
 */
export interface Settings {
  /** Enables/disables background music playback. Use case: mute soundtrack while keeping SFX. */
  music: boolean;
  /** Enables/disables one-shot sound effects. Use case: silent gameplay with visual-only feedback. */
  fx: boolean;
  /** Enables/disables vibration calls. Use case: prevent haptics on devices where vibration is distracting. */
  haptics: boolean;
}

/* ── Block Data ── */

/**
 * Runtime data for one obstacle block in the world.
 * Use case: drives rendering, animation, and collision checks without recomputing geometry data each frame.
 */
export interface Block {
  /** Three.js mesh instance displayed in scene. Use case: direct transform/material updates. */
  mesh: THREE.Mesh;
  /** Fixed world Z position for this block. Use case: forward/backward collision culling against plane Z. */
  worldZ: number;
  /** Fixed world X center position. Use case: lateral collision overlap checks. */
  worldX: number;
  /** Authoritative starting height before animation offset. Use case: oscillating height math baseline. */
  baseHeight: number;
  /** Block width (X size). Use case: compute half-width for hitbox overlap tests. */
  width: number;
  /** Block depth (Z size). Use case: compute half-depth for hitbox overlap tests. */
  depth: number;
  /** True when block animates vertically. Use case: skip animation work for static blocks. */
  moving: boolean;
  /** Vertical movement amplitude in world units. Use case: tune how far moving hazards rise/fall. */
  moveAmp: number;
  /** Oscillation speed multiplier. Use case: create mixed rhythm hazards across a row. */
  moveSpeed: number;
  /** Oscillation phase offset. Use case: avoid synchronized movement for all moving blocks. */
  movePhase: number;
  /** Current top Y after animation. Use case: final collision threshold against plane altitude. */
  currentTop: number;
}

/**
 * One generated obstacle row at a specific Z slice.
 * Use case: lifecycle management for spawning ahead and destroying behind the player.
 */
export interface BlockRow {
  /** Row Z coordinate shared by all blocks. Use case: quick row-level broad-phase collision check. */
  z: number;
  /** All block instances in this row. Use case: per-block overlap and animation updates. */
  blocks: Block[];
}

/* ── Collectible Data ── */

export interface Collectible {
  mesh: THREE.Group;
  worldX: number;
  worldZ: number;
  collected: boolean;
  attracting: boolean;
  phase: number;
}

/* ── Particle Data ── */

/**
 * Generic particle entry used for trails and explosion effects.
 * Use case: unified ticking/disposal path for short-lived visual effects.
 */
export interface Particle {
  /** Rendered particle mesh. Use case: move/fade particle over time. */
  mesh: THREE.Mesh;
  /** Remaining lifetime in seconds. Use case: remove particle when it reaches zero. */
  life: number;
  /** Starting lifetime in seconds. Use case: normalize fade ratio for opacity/scale effects. */
  maxLife: number;
  /** World velocity vector. Use case: integrate particle motion each frame. */
  vel: THREE.Vector3;
}

/* ── Window Extensions ── */

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
  }
}

/* ── Constants ── */

/**
 * Tunable gameplay and rendering constants.
 * Use case: central balancing file for obstacle difficulty, camera feel, and FX density.
 */
export const C = {
  /** Fixed plane altitude. Use case: all obstacle safety and collision height logic references this baseline. */
  PLANE_Y: 10.0,
  /** Scale multiplier for the plane model. Use case: resize ship model to fit game proportions. */
  PLANE_SCALE: 0.003,
  /** Plane collision radius used for front/back and vertical checks. Use case: make hits more forgiving/strict. */
  PLANE_HIT_R: 0.60,
  /** Half-width of plane collision body. Use case: lateral overlap checks against block width. */
  PLANE_HIT_HALF_W: 1.0,

  /** Starting forward speed (units/sec). Use case: controls early-run approachability. */
  SPEED_INIT: 32,
  /** Hard speed cap (units/sec). Use case: prevents impossible late-run pacing. */
  SPEED_MAX: 72,
  /** Speed growth factor over distance. Use case: determines how quickly difficulty ramps with progress. */
  SPEED_RAMP: 0.35,

  /** Horizontal steering speed (units/sec). Use case: tuning responsiveness for keyboard and touch drag. */
  LATERAL_SPEED: 10,
  /** Lateral boundary clamp from center. Use case: keep player within designed obstacle field. */
  BOUNDARY_X: 68,

  /** Camera follow offset behind the plane on Z axis. Use case: change how much upcoming path is visible. */
  CAM_BACK: 10,
  /** Camera height above world. Use case: control top-down vs behind-the-plane perspective feel. */
  CAM_UP: 15,
  /** Look-at distance in front of camera target. Use case: stabilize horizon focus ahead of motion. */
  CAM_LOOK_AHEAD: 20,
  /** Camera interpolation strength. Use case: smoother or snappier chase camera movement. */
  CAM_SMOOTH: 5.0,
  /** Horizontal camera follow ratio to plane X. Use case: reduce nausea while preserving lateral awareness. */
  CAM_X_FOLLOW: 0.88,
  /** Horizontal look-at follow ratio. Use case: soften aggressive camera yaw during sharp turns. */
  CAM_LOOK_X_FOLLOW: 0.65,

  /** Length/width of one ground tile. Use case: recycle floor chunks without visible seams. */
  GROUND_SIZE: 600,
  /** Number of ground tiles in circulation. Use case: enough coverage before recycling jumps occur. */
  GROUND_SEGMENTS: 4,

  /** Distance between spawned obstacle rows on Z axis. Use case: denser rows = more city density. */
  ROW_SPACING: 4,
  /** How far ahead rows are generated. Use case: prevent pop-in at high speed. */
  ROW_AHEAD: 250,
  /** How far behind rows are kept before disposal. Use case: balance memory and cleanup churn. */
  ROW_BEHIND: 40,

  /** Horizontal half-span for block generation from center. Use case: world width occupied by city. */
  BLOCK_SPREAD_X: 110,
  /** Grid step between block centers on X axis. Use case: tighter = denser buildings, wider = more gaps. */
  CELL_SIZE_X: 4.5,

  /** Minimum block width. Use case: avoid razor-thin geometry and unfair side clipping. */
  BLOCK_W_MIN: 3.8,
  /** Maximum block width. Use case: vary building silhouette and squeeze pressure. */
  BLOCK_W_MAX: 4.8,
  /** Minimum block depth. Use case: keep buildings readable at speed. */
  BLOCK_D_MIN: 3.8,
  /** Maximum block depth. Use case: add front/back collision variety per row. */
  BLOCK_D_MAX: 4.8,

  /* ── Short blocks (low-rise buildings) ── */

  /** Minimum height for short blocks. Use case: even the shortest blocks cover the ground. */
  SHORT_H_MIN: 3,
  /** Maximum height for short blocks. Use case: caps low-rise buildings below the flight path. */
  SHORT_H_MAX: 8,

  /* ── Tall blocks (skyscrapers) ── */

  /** Minimum height for tall blocks. Use case: ensures tall blocks are meaningfully above the flight path. */
  TALL_H_MIN: 30.0,
  /** Maximum height for tall blocks. Use case: tallest skyscrapers in the city. */
  TALL_H_MAX: 100.0,

  /** Noise threshold that separates short vs tall blocks (0-1). Use case: higher = fewer tall blocks, lower = more tall blocks. */
  TALL_NOISE_CUTOFF: 0.4,

  /* ── Noise-based height generation ── */

  /** Low-frequency noise scale for neighborhood-level height variation. Use case: creates districts of tall/short buildings. */
  NOISE_SCALE_LO: 0.015,
  /** High-frequency noise scale for per-building variation. Use case: individual building height variety within a district. */
  NOISE_SCALE_HI: 0.06,
  /** Weight of low-frequency noise in final height. Use case: increase for broader, smoother height zones. */
  NOISE_WEIGHT_LO: 0.6,
  /** Weight of high-frequency noise in final height. Use case: increase for more chaotic per-building variation. */
  NOISE_WEIGHT_HI: 0.4,
  /** Exponent applied to noise value before mapping to height. Use case: higher = more short blocks with occasional tall spikes. */
  NOISE_HEIGHT_POW: 2.6,

  /* ── Flyable corridor ── */

  /** Half-width of the carved safe corridor in world units. Use case: wider = easier to fly through. */
  CORRIDOR_HALF_W: 9.0,
  /** Maximum height allowed inside the corridor. Use case: blocks under the flight path are clamped to this. */
  CORRIDOR_SAFE_H: 3.0,
  /** Low-frequency noise scale for corridor X wander. Use case: controls how gradually the safe path curves. */
  CORRIDOR_WANDER_SCALE: 0.01,
  /** Maximum X offset the corridor center can wander from world center. Use case: limits how far the path strays. */
  CORRIDOR_WANDER_AMP: 20,
  /** Noise scale for a secondary corridor that weaves independently. Use case: creates alternate escape routes. */
  CORRIDOR2_WANDER_SCALE: 0.016,
  /** Maximum X offset for the secondary corridor. Use case: narrower than primary to add variety without making it trivial. */
  CORRIDOR2_WANDER_AMP: 16,
  /** Half-width of the secondary corridor. Use case: slightly tighter alternate path. */
  CORRIDOR2_HALF_W: 7.0,

  /* ── Tall-block spacing ── */

  /** Height threshold above which a block counts as "tall" for spacing rules. Use case: defines what triggers de-clumping. */
  TALL_THRESHOLD: 8.0,
  /** Minimum number of cells between two tall blocks in the same row. Use case: prevents walls of adjacent skyscrapers. */
  TALL_MIN_GAP_CELLS: 2,

  /* ── Moving blocks ── */

  /** Chance a tall block becomes vertically animated. Use case: controls frequency of dynamic hazards. */
  MOVE_CHANCE: 0.5,
  /** Minimum vertical oscillation range for moving blocks. Use case: subtle movement baseline. */
  MOVE_AMP_MIN: 60.0,
  /** Maximum vertical oscillation range for moving blocks. Use case: create high-variance timing challenges. */
  MOVE_AMP_MAX: 150.0,
  /** Minimum oscillation speed. Use case: include slower readable moving obstacles. */
  MOVE_SPEED_MIN: 0.1,
  /** Maximum oscillation speed. Use case: include faster reaction-based moving obstacles. */
  MOVE_SPEED_MAX: 0.2,

  /** Lifetime of each trail particle (seconds). Use case: longer values produce thicker jet streaks. */
  TRAIL_LIFE: 0.22,
  /** Emission rate (particles/sec) of jet trail. Use case: tune visual density vs performance cost. */
  TRAIL_RATE: 55,

  /* ── Collectibles ── */

  COLLECT_ATTRACT_RANGE: 16,
  COLLECT_PICKUP_RANGE: 2.0,
  COLLECT_ATTRACT_SPEED: 60,
  COLLECT_CHASE_SPEED: 90,
  COLLECT_SPAWN_INTERVAL: 45,
  COLLECT_SPAWN_CHANCE: 0.55,
  COLLECT_SCORE_BONUS: 5,
  COLLECT_OFFSET_MIN: 5,
  COLLECT_OFFSET_MAX: 8,

  /* ── Shield ── */

  /** Radius of the invincibility shield sphere. Use case: tune visual size of the hex force field around the jet. */
  SHIELD_RADIUS: 2,

  /* ── Bloom Post-Processing ── */

  /** Bloom intensity/strength. Use case: higher values create more pronounced glow effect. */
  BLOOM_STRENGTH: 0.5,
  /** Bloom radius/spread. Use case: controls how far the glow extends from bright areas. */
  BLOOM_RADIUS: 0.1,
  /** Bloom luminance threshold. Use case: pixels brighter than this value will bloom. Lower = more bloom. */
  BLOOM_THRESHOLD: 0.9,
} as const;
