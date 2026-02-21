import type { AdvancedSettings, ActiveConfig, PowerUpType } from "./types.js";

// ============= ARENA =============

export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 800;
export const ARENA_PADDING = 50;

// ============= PLAYER COLORS =============

export const PLAYER_COLORS = [
  { primary: "#00f0ff", glow: "#00f0ff" },
  { primary: "#ff00aa", glow: "#ff00aa" },
  { primary: "#ffee00", glow: "#ffee00" },
  { primary: "#00ff88", glow: "#00ff88" },
] as const;

// ============= SHIP =============

export const SHIP_RADIUS = 18;
export const SHIP_HIT_RADIUS = 25;
export const SHIP_DODGE_COOLDOWN_MS = 270;
export const SHIP_DODGE_ANGLE_DEG = 65;

// ============= FIRE / AMMO =============

export const FIRE_COOLDOWN_MS = 180;
export const FIRE_HOLD_REPEAT_DELAY_MS = 260;
export const MAX_AMMO = 3;
export const RELOAD_MS = 1200;

// ============= PROJECTILE =============

export const PROJECTILE_LIFETIME_MS = 2500;
export const PROJECTILE_SPEED = 14;
export const PROJECTILE_RADIUS = 4;

// ============= GAME FLOW =============

export const COUNTDOWN_SECONDS = 3;
export const ROUND_RESULTS_DURATION_MS = 2500;

// ============= PILOT =============

export const PILOT_SURVIVAL_MS = 5000;
export const PILOT_DASH_COOLDOWN_MS = 250;
export const PILOT_RADIUS = 8;
export const PILOT_FRICTION_AIR = 0.06;
export const PILOT_ANGULAR_DAMPING = 0.08;

// ============= ASTEROIDS =============

export const ASTEROID_INITIAL_MIN = 5;
export const ASTEROID_INITIAL_MAX = 7;
export const ASTEROID_LARGE_MIN = 30;
export const ASTEROID_LARGE_MAX = 38;
export const ASTEROID_SMALL_MIN = 16;
export const ASTEROID_SMALL_MAX = 22;
export const ASTEROID_SPLIT_COUNT = 2;
export const ASTEROID_DRIFT_MIN = 0.6;
export const ASTEROID_DRIFT_MAX = 1.6;
export const ASTEROID_RESTITUTION = 0.6;
export const ASTEROID_FRICTION = 0.02;
export const ASTEROID_DAMAGE_SHIPS = false;
export const ASTEROID_VERTICES_MIN = 6;
export const ASTEROID_VERTICES_MAX = 10;
export const ASTEROID_DROP_CHANCE = 0.3;
export const ASTEROID_COLLIDER_VERTEX_SCALE = 100;
export const ASTEROID_SPAWN_INTERVAL_MIN_MS = 2000;
export const ASTEROID_SPAWN_INTERVAL_MAX_MS = 5000;
export const ASTEROID_SPAWN_BATCH_MIN = 1;
export const ASTEROID_SPAWN_BATCH_MAX = 3;
export const GREY_ASTEROID_MIN = 12;
export const GREY_ASTEROID_MAX = 18;

// ============= POWER-UPS =============

export const POWERUP_DESPAWN_MS = 10000;
export const POWERUP_PICKUP_SIZE = 25;
export const POWERUP_PICKUP_RADIUS = 30;
export const POWERUP_SHIELD_HITS = 2;
export const POWERUP_MAGNETIC_RADIUS = 50;
export const POWERUP_MAGNETIC_SPEED = 120;

export const POWERUP_SPAWN_WEIGHTS: Record<PowerUpType, number> = {
  LASER: 1,
  SHIELD: 1,
  SCATTER: 1,
  MINE: 1,
  REVERSE: 1,
  JOUST: 1,
  HOMING_MISSILE: 1,
};

export const STARTING_POWERUP_TYPES: PowerUpType[] = [
  "LASER",
  "SHIELD",
  "SCATTER",
  "MINE",
];

// ============= LASER =============

export const LASER_CHARGES = 3;
export const LASER_COOLDOWN_MS = 2500;
export const LASER_BEAM_DURATION_MS = 150;
export const LASER_BEAM_LENGTH = 800;

// ============= SCATTER =============

export const SCATTER_CHARGES = 3;
export const SCATTER_COOLDOWN_MS = 180;
export const SCATTER_ANGLE_DEG = 15;
export const SCATTER_PROJECTILE_SPEED = 10;
export const SCATTER_PROJECTILE_LIFETIME_MS = 600;

// ============= MINE =============

export const MINE_SIZE = 12;
export const MINE_DEPLOY_OFFSET = 30;
export const MINE_EXPLOSION_RADIUS = 150;
export const MINE_ARMING_DELAY_MS = 400;
export const MINE_EXPLOSION_DURATION_MS = 500;
export const MINE_POST_EXPIRY_MS = 4500;
export const MINE_DETECTION_RADIUS = MINE_SIZE + 33;

// ============= JOUST =============

export const JOUST_SWORD_LENGTH = 35;
export const JOUST_COLLISION_RADIUS = JOUST_SWORD_LENGTH / 2;
export const JOUST_SPEED_MULTIPLIER = 1.4;

// ============= HOMING MISSILE =============

export const HOMING_MISSILE_SPEED = 9;
export const HOMING_MISSILE_TURN_RATE = 2.5;
export const HOMING_MISSILE_LIFETIME_MS = 4000;
export const HOMING_MISSILE_ACCURACY = 0.85;
export const HOMING_MISSILE_DETECTION_RADIUS = 200;
export const HOMING_MISSILE_RADIUS = 6;

// ============= AI =============

export const AI_CONFIG = {
  AIM_TOLERANCE: 0.6,
  LEAD_FACTOR: 0.05,
  DANGER_RADIUS: 100,
  DANGER_TIME: 0.3,
  WALL_MARGIN: 60,
  FIRE_PROBABILITY: 0.4,
  REACTION_DELAY_MS: 250,
  AIM_ERROR: 0.3,
  ROTATION_OVERSHOOT: 0.2,
} as const;

// ============= MODE CONFIGS =============

export const STANDARD_CONFIG: ActiveConfig = {
  BASE_THRUST: 0,
  ROTATION_SPEED: 5.5,
  SHIP_ROTATION_RESPONSE: 11.5,
  SHIP_ROTATION_RELEASE_RESPONSE: 11.75,
  SHIP_ROTATION_DRIFT_RESPONSE_FACTOR: 0.1,
  ROTATION_THRUST_BONUS: 0,
  RECOIL_FORCE: 0,
  DASH_FORCE: 0,
  SHIP_FRICTION_AIR: 0,
  SHIP_RESTITUTION: 0,
  SHIP_TARGET_SPEED: 3.4,
  SHIP_SPEED_RESPONSE: 7,
  SHIP_DASH_BOOST: 1.4,
  SHIP_DASH_DURATION: 0.13,
  SHIP_RECOIL_SLOWDOWN: 0.7,
  SHIP_RECOIL_DURATION: 0.08,
  PROJECTILE_SPEED,
  PILOT_ROTATION_SPEED: 3.8,
  PILOT_DASH_FORCE: 0.002,
};

export const SANE_CONFIG: ActiveConfig = {
  ...STANDARD_CONFIG,
  BASE_THRUST: 0.00008,
  ROTATION_SPEED: 3.6,
  SHIP_ROTATION_RESPONSE: 12,
  SHIP_ROTATION_RELEASE_RESPONSE: 7,
  SHIP_ROTATION_DRIFT_RESPONSE_FACTOR: 0.16,
  ROTATION_THRUST_BONUS: 0.00004,
  RECOIL_FORCE: 0.00015,
  DASH_FORCE: 0.012,
  SHIP_FRICTION_AIR: 0.003,
  SHIP_RESTITUTION: 0.5,
};

export const CHAOTIC_CONFIG: ActiveConfig = {
  ...STANDARD_CONFIG,
  BASE_THRUST: 0.00015,
  ROTATION_SPEED: 4.5,
  SHIP_ROTATION_RESPONSE: 16,
  SHIP_ROTATION_RELEASE_RESPONSE: 4,
  SHIP_ROTATION_DRIFT_RESPONSE_FACTOR: 0.08,
  ROTATION_THRUST_BONUS: 0.00008,
  RECOIL_FORCE: 0.0003,
  DASH_FORCE: 0.012,
  SHIP_FRICTION_AIR: 0.002,
  SHIP_RESTITUTION: 0.9,
};

// ============= ADVANCED TUNING OVERRIDES =============

export const SHIP_SPEED_PRESET_OVERRIDES: Record<
  AdvancedSettings["shipSpeed"],
  Pick<ActiveConfig, "SHIP_TARGET_SPEED" | "BASE_THRUST"> | null
> = {
  SLOW: {
    SHIP_TARGET_SPEED: 3.6,
    BASE_THRUST: 0.0001,
  },
  NORMAL: null,
  FAST: {
    SHIP_TARGET_SPEED: 5.2,
    BASE_THRUST: 0.0002,
  },
};

export const DASH_POWER_PRESET_OVERRIDES: Record<
  AdvancedSettings["dashPower"],
  Pick<ActiveConfig, "SHIP_DASH_BOOST" | "DASH_FORCE"> | null
> = {
  LOW: {
    SHIP_DASH_BOOST: 1.2,
    DASH_FORCE: 0.007,
  },
  NORMAL: null,
  HIGH: {
    SHIP_DASH_BOOST: 2.8,
    DASH_FORCE: 0.018,
  },
};

// ============= PRESET LOOKUP MAPS =============

export const SHIP_RESTITUTION_BY_PRESET: Record<AdvancedSettings["shipRestitutionPreset"], number> = {
  STANDARD: 0,
  SANE: 0.5,
  CHAOTIC: 0.9,
};

export const SHIP_FRICTION_BY_PRESET: Record<AdvancedSettings["shipFrictionPreset"], number> = {
  STANDARD: 0.02,
  SANE: 0.5,
  CHAOTIC: 0,
};

export const SHIP_FRICTION_AIR_BY_PRESET: Record<AdvancedSettings["shipFrictionAirPreset"], number> = {
  STANDARD: 0,
  SANE: 0.003,
  CHAOTIC: 0.002,
};

export const SHIP_ANGULAR_DAMPING_BY_PRESET: Record<AdvancedSettings["angularDampingPreset"], number> = {
  STANDARD: 0.4,
  SANE: 0.1,
  CHAOTIC: 0,
};

export const WALL_FRICTION_BY_PRESET: Record<AdvancedSettings["wallFrictionPreset"], number> = {
  STANDARD: 0.04,
  SANE: 0.5,
  CHAOTIC: 0,
};

export const WALL_RESTITUTION_BY_PRESET: Record<AdvancedSettings["wallRestitutionPreset"], number> = {
  STANDARD: 0,
  SANE: 0.5,
  CHAOTIC: 1,
};

// ============= DEFAULT SETTINGS =============

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  asteroidDensity: "SOME",
  startPowerups: false,
  roundsToWin: 3,
  shipSpeed: "NORMAL",
  dashPower: "NORMAL",
  rotationPreset: "STANDARD",
  rotationBoostPreset: "STANDARD",
  recoilPreset: "STANDARD",
  shipRestitutionPreset: "STANDARD",
  shipFrictionAirPreset: "STANDARD",
  wallRestitutionPreset: "STANDARD",
  wallFrictionPreset: "STANDARD",
  shipFrictionPreset: "STANDARD",
  angularDampingPreset: "STANDARD",
};
