/**
 * PAPER PLANE ASTEROID SURVIVOR
 *
 * A vertical-scrolling roguelike shooter with hand-drawn paper aesthetic.
 * Features event-driven architecture with object pooling for performance.
 */

import { oasiz } from "@oasiz/sdk";
import bgmPixelRushUrl from "../sfx/pixel-rush-protocol.mp3";
import bgmNormal1Url from "../sfx/normal-1.mp3";
import bgmNormal2Url from "../sfx/normal-2.mp3";
import bgmNormal3Url from "../sfx/normal-3.mp3";
import bgmNormal4Url from "../sfx/normal-4.mp3";
import bgmNormal5Url from "../sfx/normal-5.mp3";
import bgmNormal6Url from "../sfx/normal-6.mp3";
import bgmBossUrl from "../sfx/boss.mp3";
import bgmBoss2Url from "../sfx/boss-2.mp3";
import bgmBoss3Url from "../sfx/boss-3.mp3";

// Modular data imports
import { CONFIG } from "./config";
import {
  UpgradeTree,
  UpgradeLevelConfig,
  UpgradePathConfig,
  UPGRADE_CONFIG,
  PRIMARY_UPGRADE_KEYS,
  SECONDARY_UPGRADE_KEYS,
  createEmptyUpgradeTree,
  getSpentUpgradePoints,
  getAvailableUpgradePointsFromProgression,
  getAsteroidsForNextUpgrade as calcAsteroidsForUpgrade,
  getUpgradeLevelDescription,
} from "./upgrades";
import {
  AbilityFamily,
  UltimateLevelMap,
  ABILITY_FAMILIES,
  createEmptyUltimateLevelMap,
  getSpentUltimatePoints,
  getAvailableUltimatePointsFromProgression,
  getUltimateLevelDescription,
  getUltimateValue,
  getUnlockedFamilies,
  ULTIMATE_MAX_LEVEL,
  ULTIMATE_MAX_PER_ROUND,
} from "./abilities";
import {
  PaperPlaneSaveState,
  PaperPlaneSaveBuild,
  RoundData,
  createDefaultSaveState,
  createDefaultSaveBuild,
  getLeaderboardTotalScore,
  loadSaveState,
  persistSaveState,
} from "./persistence";

// ============= TYPES =============
type GameState =
  | "START"
  | "PLAYING"
  | "UPGRADE"
  | "PAUSED"
  | "GAME_OVER"
  | "BOSS"
  | "ABILITY_CHOICE";
type PlaneType = "dart" | "glider" | "bomber";
type AsteroidSize = "large" | "medium" | "small";
type ItemCategory = "stat" | "bullet" | "buddy" | "shield" | "special";
type BulletShape = "line" | "note" | "star" | "bolt" | "rocket" | "bubble";

interface Ability {
  id: string;
  name: string;
  description: string;
  icon: string;
  charges: number;
  tier: number;
  duration?: number; // For timed abilities (seconds)
  power?: number; // Multiplier for effect strength
}

interface StoredAbility extends Ability {
  instanceId: number;
}

// Tiered abilities - each boss tier offers increasingly powerful options
const ABILITY_TIERS: Ability[][] = [
  [
    {
      id: "shield_1",
      name: "Paper Shield",
      description: "Become invincible for 5 seconds.",
      icon: "shield",
      charges: 1,
      tier: 1,
      duration: 5,
    },
    {
      id: "blast_1",
      name: "Eraser Blast",
      description: "Destroy all asteroids on screen.",
      icon: "blast",
      charges: 1,
      tier: 1,
    },
    {
      id: "turbo_1",
      name: "Ink Overdrive",
      description: "2x fire rate and a speed boost for 8 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 1,
      duration: 8,
      power: 2,
    },
  ],
  [
    {
      id: "shield_2",
      name: "Reinforced Paper",
      description: "Become invincible for 8 seconds.",
      icon: "shield",
      charges: 2,
      tier: 2,
      duration: 8,
    },
    {
      id: "blast_2",
      name: "Eraser Storm",
      description: "Destroy all asteroids and deal 20 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 2,
      power: 20,
    },
    {
      id: "turbo_2",
      name: "Pencil Fury",
      description: "3x fire rate and a bigger speed boost for 10 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 2,
      duration: 10,
      power: 3,
    },
  ],
  [
    {
      id: "shield_3",
      name: "Steel Origami",
      description: "Become invincible for 10 seconds.",
      icon: "shield",
      charges: 2,
      tier: 3,
      duration: 10,
    },
    {
      id: "blast_3",
      name: "Nuclear Eraser",
      description: "Destroy all asteroids and deal 40 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 3,
      power: 40,
    },
    {
      id: "turbo_3",
      name: "Graphite Rush",
      description: "4x fire rate and extra bullets for 12 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 3,
      duration: 12,
      power: 4,
    },
  ],
  [
    {
      id: "shield_4",
      name: "Diamond Fold",
      description: "Become invincible for 12 seconds.",
      icon: "shield",
      charges: 2,
      tier: 4,
      duration: 12,
    },
    {
      id: "blast_4",
      name: "Black Hole",
      description: "Destroy all asteroids and deal 60 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 4,
      power: 60,
    },
    {
      id: "turbo_4",
      name: "Ink Explosion",
      description:
        "5x fire rate, extra bullets, and bonus damage for 15 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 4,
      duration: 15,
      power: 5,
    },
  ],
  [
    {
      id: "shield_5",
      name: "Origami Fortress",
      description: "Become invincible for 15 seconds.",
      icon: "shield",
      charges: 3,
      tier: 5,
      duration: 15,
    },
    {
      id: "blast_5",
      name: "Eraser Apocalypse",
      description: "Destroy all asteroids and deal 80 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 5,
      power: 80,
    },
    {
      id: "turbo_5",
      name: "Rainbow Ink",
      description:
        "6x fire rate, extra bullets, and bonus damage for 20 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 5,
      duration: 20,
      power: 6,
    },
  ],
  [
    {
      id: "shield_6",
      name: "Paper God",
      description: "Become invincible for 20 seconds.",
      icon: "shield",
      charges: 3,
      tier: 6,
      duration: 20,
    },
    {
      id: "blast_6",
      name: "Reality Eraser",
      description: "Destroy all asteroids and deal 100 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 6,
      power: 100,
    },
    {
      id: "turbo_6",
      name: "Eternal Ink",
      description: "Permanent +25% stats plus an 8x overdrive for 25 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 6,
      duration: 25,
      power: 8,
    },
  ],
  [
    {
      id: "shield_7",
      name: "Notebook Aegis",
      description: "Become invincible for 22 seconds.",
      icon: "shield",
      charges: 3,
      tier: 7,
      duration: 22,
    },
    {
      id: "blast_7",
      name: "Margin Wipe",
      description: "Destroy all asteroids and deal 120 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 7,
      power: 120,
    },
    {
      id: "turbo_7",
      name: "Lead Surge",
      description: "Permanent +25% stats plus a 9x overdrive for 28 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 7,
      duration: 28,
      power: 9,
    },
  ],
  [
    {
      id: "shield_8",
      name: "Page Guardian",
      description: "Become invincible for 24 seconds.",
      icon: "shield",
      charges: 3,
      tier: 8,
      duration: 24,
    },
    {
      id: "blast_8",
      name: "Desk Clear",
      description: "Destroy all asteroids and deal 140 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 8,
      power: 140,
    },
    {
      id: "turbo_8",
      name: "Ink Hurricane",
      description: "Permanent +25% stats plus a 10x overdrive for 30 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 8,
      duration: 30,
      power: 10,
    },
  ],
  [
    {
      id: "shield_9",
      name: "Binder Guard",
      description: "Become invincible for 26 seconds.",
      icon: "shield",
      charges: 4,
      tier: 9,
      duration: 26,
    },
    {
      id: "blast_9",
      name: "Perforation Wave",
      description: "Destroy all asteroids and deal 160 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 9,
      power: 160,
    },
    {
      id: "turbo_9",
      name: "Graphite Gale",
      description: "Permanent +25% stats plus an 11x overdrive for 32 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 9,
      duration: 32,
      power: 11,
    },
  ],
  [
    {
      id: "shield_10",
      name: "Razor Fold",
      description: "Become invincible for 28 seconds.",
      icon: "shield",
      charges: 4,
      tier: 10,
      duration: 28,
    },
    {
      id: "blast_10",
      name: "Crossout Cataclysm",
      description: "Destroy all asteroids and deal 180 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 10,
      power: 180,
    },
    {
      id: "turbo_10",
      name: "Neon Draft",
      description: "Permanent +25% stats plus a 12x overdrive for 34 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 10,
      duration: 34,
      power: 12,
    },
  ],
  [
    {
      id: "shield_11",
      name: "Archive Halo",
      description: "Become invincible for 30 seconds.",
      icon: "shield",
      charges: 4,
      tier: 11,
      duration: 30,
    },
    {
      id: "blast_11",
      name: "Paper Eclipse",
      description: "Destroy all asteroids and deal 210 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 11,
      power: 210,
    },
    {
      id: "turbo_11",
      name: "Shaving Storm",
      description: "Permanent +25% stats plus a 13x overdrive for 36 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 11,
      duration: 36,
      power: 13,
    },
  ],
  [
    {
      id: "shield_12",
      name: "Final Fold",
      description: "Become invincible for 32 seconds.",
      icon: "shield",
      charges: 5,
      tier: 12,
      duration: 32,
    },
    {
      id: "blast_12",
      name: "Notebook Nova",
      description: "Destroy all asteroids and deal 250 boss damage.",
      icon: "blast",
      charges: 2,
      tier: 12,
      power: 250,
    },
    {
      id: "turbo_12",
      name: "Infinite Draft",
      description: "Permanent +25% stats plus a 14x overdrive for 40 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 12,
      duration: 40,
      power: 14,
    },
  ],
];

// Legacy compatibility - default to tier 1 abilities
const ABILITIES: Ability[] = ABILITY_TIERS[0];

interface Vec2 {
  x: number;
  y: number;
}

interface GameEvent {
  type: string;
  data?: unknown;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierceRemaining: number;
  explosive: boolean;
  chainLightning: boolean;
  active: boolean;
  fromDrone: boolean;
  age: number;
  maxAge: number;
  size: number;
  color: string;
  shape: BulletShape;
  wobblePhase: number;
  bounceRemaining: number;
  loop: boolean;
  homingStrength: number;
  snowball: boolean;
  snowballMax: number;
  sticky: boolean;
  stuckToId: number;
  stuckOffsetX: number;
  stuckOffsetY: number;
  drag: number;
  acceleration: number;
  gravity: number;
  splitOnHit: number;
  trailTimer: number;
  jitterOffset: number;
  prismSplit: boolean;
}

interface Asteroid {
  id: number;
  size: AsteroidSize;
  health: number;
  maxHealth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  active: boolean;
  hitFlash: number;
  isBossAsteroid?: boolean; // Special asteroids thrown by boss
}

type BossType =
  | "eraser"
  | "paperweight"
  | "inkblot"
  | "rubberband"
  | "stapler"
  | "scissors"
  | "pushpin"
  | "highlighter"
  | "ruler"
  | "holepunch"
  | "binderclip"
  | "sharpener"
  | "tape"
  | "gluestick"
  | "stapleremover";

interface BossConfig {
  name: string;
  subtitle: string;
  healthMult: number;
  waveInterval: number; // Time between attack waves (ms)
  attacksPerWave: number; // How many attacks per wave
  attackDelay: number; // Delay between attacks within a wave (ms)
  movePattern:
    | "static"
    | "sway"
    | "chase"
    | "bounce"
    | "zigzag"
    | "circle"
    | "orbit"
    | "sweep"
    | "snap"
    | "stomp"
    | "lunge"
    | "spiral";
  color: string;
  accentColor: string;
  specialDuration: number;
  phaseThresholds: number[];
}

const BOSS_CONFIGS: Record<BossType, BossConfig> = {
  eraser: {
    name: "The Eraser",
    subtitle: "Pink Menace",
    healthMult: 1.0,
    waveInterval: 4000,
    attacksPerWave: 3,
    attackDelay: 400,
    movePattern: "sway",
    color: "#f5b5c8",
    accentColor: "#d4869c",
    specialDuration: 2.8,
    phaseThresholds: [0.77],
  },
  paperweight: {
    name: "Paperweight",
    subtitle: "Heavy Hitter",
    healthMult: 1.4,
    waveInterval: 5000,
    attacksPerWave: 6,
    attackDelay: 200,
    movePattern: "static",
    color: "#8b8b8b",
    accentColor: "#5a5a5a",
    specialDuration: 3.2,
    phaseThresholds: [0.77],
  },
  inkblot: {
    name: "Ink Blot",
    subtitle: "Chaotic Stain",
    healthMult: 1.0,
    waveInterval: 5500,
    attacksPerWave: 2,
    attackDelay: 600,
    movePattern: "chase",
    color: "#2a2a4a",
    accentColor: "#1a1a2a",
    specialDuration: 3.2,
    phaseThresholds: [0.77],
  },
  rubberband: {
    name: "Rubber Band Ball",
    subtitle: "Bouncy Nightmare",
    healthMult: 1.2,
    waveInterval: 4500,
    attacksPerWave: 4,
    attackDelay: 300,
    movePattern: "bounce",
    color: "#c4a574",
    accentColor: "#8b6914",
    specialDuration: 3.4,
    phaseThresholds: [0.77],
  },
  stapler: {
    name: "The Stapler",
    subtitle: "Rapid Fire",
    healthMult: 1.3,
    waveInterval: 3500,
    attacksPerWave: 8,
    attackDelay: 120,
    movePattern: "zigzag",
    color: "#4a4a4a",
    accentColor: "#ff4444",
    specialDuration: 3.4,
    phaseThresholds: [0.77],
  },
  scissors: {
    name: "Scissors",
    subtitle: "Final Cut",
    healthMult: 1.8,
    waveInterval: 4000,
    attacksPerWave: 3,
    attackDelay: 500,
    movePattern: "circle",
    color: "#c0c0c0",
    accentColor: "#ff6600",
    specialDuration: 3.6,
    phaseThresholds: [0.77],
  },
  pushpin: {
    name: "Push Pin",
    subtitle: "Point Storm",
    healthMult: 1.75,
    waveInterval: 3400,
    attacksPerWave: 5,
    attackDelay: 180,
    movePattern: "orbit",
    color: "#d94141",
    accentColor: "#f3d36a",
    specialDuration: 4.0,
    phaseThresholds: [0.77],
  },
  highlighter: {
    name: "Highlighter",
    subtitle: "Neon Flood",
    healthMult: 1.9,
    waveInterval: 3200,
    attacksPerWave: 4,
    attackDelay: 230,
    movePattern: "sweep",
    color: "#f3e85a",
    accentColor: "#8ed641",
    specialDuration: 4.2,
    phaseThresholds: [0.77],
  },
  ruler: {
    name: "Ruler",
    subtitle: "Straight Edge",
    healthMult: 2.1,
    waveInterval: 3100,
    attacksPerWave: 4,
    attackDelay: 220,
    movePattern: "snap",
    color: "#d9c39a",
    accentColor: "#6a4e2d",
    specialDuration: 4.5,
    phaseThresholds: [0.77, 0.33],
  },
  holepunch: {
    name: "Hole Punch",
    subtitle: "Perforator",
    healthMult: 2.3,
    waveInterval: 3000,
    attacksPerWave: 4,
    attackDelay: 240,
    movePattern: "stomp",
    color: "#606873",
    accentColor: "#c7d0da",
    specialDuration: 4.8,
    phaseThresholds: [0.77, 0.33],
  },
  binderclip: {
    name: "Binder Clip",
    subtitle: "Clampdown",
    healthMult: 2.5,
    waveInterval: 2900,
    attacksPerWave: 5,
    attackDelay: 170,
    movePattern: "lunge",
    color: "#2b2b31",
    accentColor: "#76a7ff",
    specialDuration: 5.1,
    phaseThresholds: [0.77, 0.33],
  },
  sharpener: {
    name: "Pencil Sharpener",
    subtitle: "Lead Grinder",
    healthMult: 2.9,
    waveInterval: 2700,
    attacksPerWave: 5,
    attackDelay: 150,
    movePattern: "spiral",
    color: "#cf4f2e",
    accentColor: "#f1d17a",
    specialDuration: 5.5,
    phaseThresholds: [0.77, 0.35],
  },
  tape: {
    name: "Tape Dispenser",
    subtitle: "Sticky Web",
    healthMult: 3.3,
    waveInterval: 2600,
    attacksPerWave: 4,
    attackDelay: 200,
    movePattern: "sweep",
    color: "#c8e6f5",
    accentColor: "#4a9dc8",
    specialDuration: 5.8,
    phaseThresholds: [0.77, 0.38, 0.2],
  },
  gluestick: {
    name: "Glue Stick",
    subtitle: "Adhesive Tempest",
    healthMult: 3.7,
    waveInterval: 2400,
    attacksPerWave: 5,
    attackDelay: 140,
    movePattern: "orbit",
    color: "#e8d5b7",
    accentColor: "#f5a623",
    specialDuration: 6.0,
    phaseThresholds: [0.77, 0.4, 0.2],
  },
  stapleremover: {
    name: "Staple Remover",
    subtitle: "The Final Clamp",
    healthMult: 4.2,
    waveInterval: 2200,
    attacksPerWave: 6,
    attackDelay: 120,
    movePattern: "lunge",
    color: "#1a1a2e",
    accentColor: "#e94560",
    specialDuration: 6.5,
    phaseThresholds: [0.77, 0.42, 0.2],
  },
};

const BOSS_ORDER: BossType[] = [
  "eraser",
  "paperweight",
  "inkblot",
  "rubberband",
  "stapler",
  "scissors",
  "pushpin",
  "highlighter",
  "ruler",
  "holepunch",
  "binderclip",
  "sharpener",
  "tape",
  "gluestick",
  "stapleremover",
];

// Boss projectile types (different from regular asteroids)
interface BossProjectile {
  id: number;
  type:
    | "eraser_chunk"
    | "rock"
    | "ink_blob"
    | "rubber_band"
    | "staple"
    | "blade"
    | "seismic_wave"
    | "push_pin"
    | "marker_bolt"
    | "ruler_chip"
    | "paper_chad"
    | "tape_strip"
    | "glue_blob"
    | "claw_fang"
    | "clip_shard"
    | "shaving";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  damage: number;
  active: boolean;
  age: number;
  color: string;
  // Type-specific properties
  stretchPhase?: number; // For rubber bands
  bladeAngle?: number; // For scissors
  arcAngle?: number; // Travel direction for seismic waves
  arcSpan?: number; // Width of the arc in radians
  length?: number;
}

interface Boss {
  type: BossType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  health: number;
  maxHealth: number;
  rotation: number;
  // Wave-based attack system
  waveTimer: number;
  attacksRemaining: number;
  attackTimer: number;
  totalAttacks: number;
  active: boolean;
  entering: boolean;
  defeated: boolean;
  pulsePhase: number;
  movePhase: number;
  burstCount: number;
  // Special ability states
  specialTimer: number;
  isSpecial: boolean;
  phase: number;
  bossNumber: number;
  specialPhase: number;
  lineTimer?: number; // Used by highlighter for full-map line cooldown
}

interface BossMinion {
  id: number;
  type:
    | "eraser_grunt"
    | "rubber_minion"
    | "ink_spider"
    | "staple_sentry"
    | "blade_drone"
    | "stick_man"
    | "pin_satellite"
    | "marker_helper";
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  maxHealth: number;
  active: boolean;
  timer: number;
  angle: number;
  phase?: number; // For walking animations
}

interface BossAreaEffect {
  id: number;
  type:
    | "ink_puddle"
    | "gravity_well"
    | "paper_cut"
    | "shockwave"
    | "highlight_band"
    | "highlight_stamp"
    | "ruler_beam"
    | "punch_zone"
    | "clamp_wall"
    | "ink_pool"
    | "glue_zone";
  x: number;
  y: number;
  x2?: number; // For line effects
  y2?: number;
  radius: number;
  life: number;
  maxLife: number;
  active: boolean;
  color: string;
  aimAngle?: number; // For directional shockwaves
  arcWidth?: number; // Half-width of damage arc in radians
  hasDamaged?: boolean; // Prevent multi-hit per shockwave
  vx?: number;
  vy?: number;
  warmup?: number;
  label?: string;
  projectileCount?: number;
  projectileAngle?: number;
  splashTimer?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "spark" | "paper" | "coin" | "explosion";
  rotation: number;
  rotationSpeed: number;
}

interface Drone {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  wanderTimer: number;
  fireTimer: number;
  facingAngle: number;
  active: boolean;
}

type OrbitalType = "shield" | "prism" | "rat";

interface Orbital {
  type: OrbitalType;
  angle: number;
  radius: number;
  x: number;
  y: number;
  timer: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface StatModifiers {
  damageFlat: number;
  damageMult: number;
  fireRateMult: number;
  bulletSpeedMult: number;
  moveSpeedFlat: number;
  moveSpeedMult: number;
  pierceFlat: number;
  shotsAdd: number;
  spreadAdd: number;
  maxLivesAdd: number;
  bulletSizeMult: number;
  invincibilityBonus: number;
  coinMult: number;
}

interface PlayerStats {
  damage: number;
  fireRateMs: number;
  bulletSpeed: number;
  moveSpeed: number;
  pierce: number;
  shots: number;
  spread: number;
  maxLives: number;
  bulletSize: number;
  invincibilityBonus: number; // extra seconds of invincibility from Emergency Shielding
}

interface ItemEffects {
  starOnHit: number;
  splitOnHit: number;
  bounceCount: number;
  loopBullets: boolean;
  homingStrength: number;
  snowball: boolean;
  snowballMax: number;
  sticky: boolean;
  fireTrail: boolean;
  lightning: boolean;
  explosive: boolean;
  mirrorShots: boolean;
  teleportShots: boolean;
  waveBullets: boolean;
  dragBullets: boolean;
  accelerateBullets: boolean;
  gravityBullets: boolean;
  voodooOnHit: number;
  creepyGunpowder: boolean;
  detonator: boolean;
  castleCrusher: boolean;
  tidalWave: boolean;
  momentum: boolean;
  carnageEngine: boolean;
  minigun: boolean;
  cyclotron: boolean;
  burstFire: number;
  turretBuddies: number;
  shieldBuddies: number;
  ratBuddies: number;
  prismBuddies: number;
  mirrorBuddies: number;
  shieldCharges: number;
  bulletShape: BulletShape | null;
}

interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  isCursed: boolean;
  stats?: Partial<StatModifiers>;
  effects?: Partial<ItemEffects>;
  bulletShape?: BulletShape;
  bulletColor?: string;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return (
    Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  );
}

// ============= EVENT BUS =============
class EventBus {
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    }
  }

  emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }
}

// ============= OBJECT POOL =============
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 0,
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }

  reset(): void {
    this.pool = [];
  }
}

// ============= AUDIO MANAGER =============
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private initialized = false;
  // Pixel Rush Protocol always plays first (index 0), rest rotate by round
  private readonly normalTrackUrls = [
    bgmPixelRushUrl,
    bgmNormal1Url,
    bgmNormal2Url,
    bgmNormal3Url,
    bgmNormal4Url,
    bgmNormal5Url,
    bgmNormal6Url,
  ];
  private readonly bossTrackUrls = [bgmBossUrl, bgmBoss2Url, bgmBoss3Url];
  private normalTracks: Array<HTMLAudioElement | null> = [];
  private bossTracks: Array<HTMLAudioElement | null> = [];
  private currentNormalIndex = 0;
  private currentBossIndex = 0;
  private normalTracksLoaded = 0;
  private bossTracksLoaded = 0;
  private isBossMusic = false;
  private musicActive = false;
  private backgroundPreloadTimer = 0;
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    console.log("[AudioManager] Created");
  }

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.3;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.masterGain);

      this.initialized = true;
      console.log("[AudioManager.init] Audio context initialized");
      this.normalTracks = new Array(this.normalTrackUrls.length).fill(null);
      this.bossTracks = new Array(this.bossTrackUrls.length).fill(null);
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  private createMusicTrack(
    url: string,
    volume: number,
    preload: "none" | "metadata" | "auto",
    kind: "normal" | "boss",
    index: number,
  ): HTMLAudioElement {
    const track = new Audio(url);
    track.loop = true;
    track.volume = volume;
    track.preload = preload;
    track.addEventListener(
      "canplaythrough",
      () => {
        if (kind === "normal") {
          this.normalTracksLoaded++;
          console.log("[AudioManager] Normal track " + (index + 1) + " loaded");
        } else {
          this.bossTracksLoaded++;
          console.log("[AudioManager] Boss track " + (index + 1) + " loaded");
        }
      },
      { once: true },
    );
    track.addEventListener("error", (e) => {
      console.warn(
        "[AudioManager] Failed to load " + kind + " track " + (index + 1) + ":",
        e,
      );
    });
    return track;
  }

  private ensureTrack(
    kind: "normal" | "boss",
    index: number,
    preload: "none" | "metadata" | "auto" = "metadata",
  ): HTMLAudioElement | null {
    try {
      const tracks = kind === "normal" ? this.normalTracks : this.bossTracks;
      const urls =
        kind === "normal" ? this.normalTrackUrls : this.bossTrackUrls;
      const volume = kind === "normal" ? 0.06 : 0.075;
      const existing = tracks[index];
      if (existing) {
        if (preload === "auto" && existing.preload !== "auto") {
          existing.preload = "auto";
          existing.load();
        } else if (preload === "metadata" && existing.preload === "none") {
          existing.preload = "metadata";
          existing.load();
        }
        return existing;
      }
      const track = this.createMusicTrack(
        urls[index],
        volume,
        preload,
        kind,
        index,
      );
      tracks[index] = track;
      if (preload !== "none") {
        track.load();
      }
      return track;
    } catch (e) {
      console.warn("[AudioManager] Error preparing music track:", e);
      return null;
    }
  }

  private getCurrentNormalTrack(): HTMLAudioElement | null {
    if (this.normalTrackUrls.length === 0) return null;
    return (
      this.ensureTrack(
        "normal",
        this.currentNormalIndex % this.normalTrackUrls.length,
        "auto",
      ) ?? null
    );
  }

  private getCurrentBossTrack(): HTMLAudioElement | null {
    if (this.bossTrackUrls.length === 0) return null;
    return (
      this.ensureTrack(
        "boss",
        this.currentBossIndex % this.bossTrackUrls.length,
        "auto",
      ) ?? null
    );
  }

  private chooseRandomNormalTrack(): void {
    if (this.normalTrackUrls.length === 0) return;
    this.currentNormalIndex = Math.floor(
      Math.random() * this.normalTrackUrls.length,
    );
  }

  private advanceNormalTrack(): void {
    if (this.normalTrackUrls.length <= 1) return;
    this.currentNormalIndex =
      (this.currentNormalIndex + 1) % this.normalTrackUrls.length;
  }

  private scheduleBackgroundPreload(): void {
    if (this.backgroundPreloadTimer) {
      window.clearTimeout(this.backgroundPreloadTimer);
    }
    const preloadTasks: Array<{
      kind: "normal" | "boss";
      index: number;
      preload: "none" | "metadata" | "auto";
    }> = [];

    if (this.normalTrackUrls.length > 1) {
      preloadTasks.push({
        kind: "normal",
        index: (this.currentNormalIndex + 1) % this.normalTrackUrls.length,
        preload: "metadata",
      });
    }
    if (this.bossTrackUrls.length > 0) {
      preloadTasks.push({
        kind: "boss",
        index: this.currentBossIndex % this.bossTrackUrls.length,
        preload: "metadata",
      });
    }
    if (this.normalTrackUrls.length > 2) {
      preloadTasks.push({
        kind: "normal",
        index: (this.currentNormalIndex + 2) % this.normalTrackUrls.length,
        preload: "metadata",
      });
    }

    const runTask = (taskIndex: number) => {
      if (taskIndex >= preloadTasks.length) {
        this.backgroundPreloadTimer = 0;
        return;
      }
      const delay = taskIndex === 0 ? 3500 : 4500;
      this.backgroundPreloadTimer = window.setTimeout(() => {
        this.backgroundPreloadTimer = 0;
        const task = preloadTasks[taskIndex];
        this.ensureTrack(task.kind, task.index, task.preload);
        runTask(taskIndex + 1);
      }, delay);
    };

    runTask(0);
  }

  private pauseAllTracks(resetTime: boolean): void {
    for (const track of this.normalTracks) {
      if (!track) continue;
      track.pause();
      if (resetTime) {
        track.currentTime = 0;
      }
    }

    for (const track of this.bossTracks) {
      if (!track) continue;
      track.pause();
      if (resetTime) {
        track.currentTime = 0;
      }
    }
  }

  /** Pick normal track index for a given round number.
   *  Round 1 always plays track 0 (Pixel Rush Protocol).
   *  Subsequent rounds cycle through the rest. */
  setNormalTrackForRound(roundNumber: number): void {
    if (this.normalTrackUrls.length <= 1) {
      this.currentNormalIndex = 0;
      return;
    }
    if (roundNumber <= 1) {
      this.currentNormalIndex = 0;
    } else {
      // Rounds 2..N cycle through tracks 1..N
      const rotatingCount = this.normalTrackUrls.length - 1;
      this.currentNormalIndex = 1 + ((roundNumber - 2) % rotatingCount);
    }
  }

  startMusic(roundNumber = 1): void {
    this.musicActive = true;
    this.isBossMusic = false;
    this.currentBossIndex = 0;
    this.setNormalTrackForRound(roundNumber);
    this.pauseAllTracks(true);
    if (!this.settings.music) return;
    const track = this.getCurrentNormalTrack();
    if (!track) return;
    track.currentTime = 0;
    track.volume = 0.06;
    track.play().catch((e) => {
      console.warn("[AudioManager.startMusic] Playback failed:", e);
    });
    this.scheduleBackgroundPreload();
    console.log(
      "[AudioManager] Normal music started (round " +
        roundNumber +
        ", track index " +
        this.currentNormalIndex +
        ")",
    );
  }

  stopMusic(): void {
    this.musicActive = false;
    if (this.backgroundPreloadTimer) {
      window.clearTimeout(this.backgroundPreloadTimer);
      this.backgroundPreloadTimer = 0;
    }
    this.pauseAllTracks(true);
    this.isBossMusic = false;
    console.log("[AudioManager] All music stopped");
  }

  switchToBossMusic(): void {
    if (this.isBossMusic) return;
    console.log("[AudioManager] Switching to boss music");
    this.pauseAllTracks(true);
    this.isBossMusic = true;
    const track = this.getCurrentBossTrack();
    if (!track || !this.settings.music) return;
    track.currentTime = 0;
    track.volume = 0.075;
    track.play().catch((e) => {
      console.warn("[AudioManager.switchToBossMusic] Playback failed:", e);
    });
    this.scheduleBackgroundPreload();
    console.log(
      "[AudioManager] Now playing boss track " + (this.currentBossIndex + 1),
    );
  }

  switchToNormalMusic(roundNumber?: number): void {
    if (!this.isBossMusic) return;
    console.log("[AudioManager] Switching back to normal music");
    this.pauseAllTracks(true);
    this.isBossMusic = false;
    if (this.bossTracks.length > 0) {
      this.currentBossIndex =
        (this.currentBossIndex + 1) % this.bossTracks.length;
    }
    if (roundNumber !== undefined) {
      this.setNormalTrackForRound(roundNumber);
    }
    this.advanceNormalTrack();
    if (!this.settings.music) return;
    const track = this.getCurrentNormalTrack();
    if (!track) return;
    track.currentTime = 0;
    track.volume = 0.06;
    track.play().catch((e) => {
      console.warn("[AudioManager.switchToNormalMusic] Playback failed:", e);
    });
    this.scheduleBackgroundPreload();
    console.log(
      "[AudioManager] Now playing normal track " +
        (this.currentNormalIndex + 1),
    );
  }

  updateMusicState(): void {
    if (!this.musicActive) return;
    if (this.settings.music) {
      if (this.isBossMusic) {
        const track = this.getCurrentBossTrack();
        if (track && track.paused && this.bossTracksLoaded > 0) {
          track.play().catch(() => {});
        }
      } else {
        const track = this.getCurrentNormalTrack();
        if (track && track.paused && this.normalTracksLoaded > 0) {
          track.play().catch(() => {});
        }
      }
    } else {
      for (const track of this.normalTracks) {
        if (!track) continue;
        track.pause();
      }
      for (const track of this.bossTracks) {
        if (!track) continue;
        track.pause();
      }
    }
  }

  playShoot(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Even softer, lower-pitched sine wave
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);

    // Slower attack and decay for a "poof" rather than a "blip"
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  playHit(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // Triangle wave is softer than sawtooth
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDestroy(size: AsteroidSize): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const baseFreq = size === "large" ? 80 : size === "medium" ? 120 : 200;

    // Noise burst for paper tearing
    const bufferSize = this.ctx.sampleRate * 0.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = baseFreq * 4;
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  playCoin(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playUpgrade(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  playGameOver(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playExplosion(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.4);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  triggerHaptic(type: string): void {
    if (!this.settings.haptics) return;
    oasiz.triggerHaptic(
      type as "light" | "medium" | "heavy" | "success" | "error",
    );
  }
}

// ============= PARTICLE SYSTEM =============
class ParticleSystem {
  particles: Particle[] = [];
  private pool: ObjectPool<Particle>;

  constructor() {
    this.pool = new ObjectPool<Particle>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 4,
        color: "#fff",
        type: "spark",
        rotation: 0,
        rotationSpeed: 0,
      }),
      (p) => {
        p.life = 0;
      },
      CONFIG.PARTICLE_POOL_SIZE,
    );
  }

  emit(
    x: number,
    y: number,
    color: string,
    count: number,
    type: Particle["type"] = "spark",
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      const angle = Math.random() * Math.PI * 2;
      const speed =
        type === "explosion" ? 3 + Math.random() * 5 : 1 + Math.random() * 3;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1;
      p.maxLife = 1;
      p.size =
        type === "paper"
          ? 8 + Math.random() * 12
          : type === "explosion"
            ? 6 + Math.random() * 8
            : 3 + Math.random() * 4;
      p.color = color;
      p.type = type;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.3;
      this.particles.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.1 * dt * 60;
      p.rotation += p.rotationSpeed * dt * 60;
      p.life -= (p.type === "paper" ? 0.015 : 0.025) * dt * 60;

      if (p.life <= 0) {
        this.pool.release(p);
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.8;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.type === "paper") {
        // Draw torn paper scraps - more detailed
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size * (0.5 + p.life * 0.5);
        ctx.moveTo(-s, -s / 2);
        ctx.lineTo(s, -s / 3);
        ctx.lineTo(s / 2, s);
        ctx.lineTo(-s, s / 2);
        ctx.closePath();
        ctx.fill();

        // Add a "crease" line
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, 0);
        ctx.stroke();
      } else if (p.type === "spark" || p.type === "explosion") {
        // Pencil dust/shavings
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size * p.life;
        // Irregular dust speck
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "coin") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Spark/explosion
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.pool.release(p);
    }
    this.particles = [];
  }
}

// ============= FLOATING TEXT SYSTEM =============
class FloatingTextSystem {
  texts: FloatingText[] = [];

  add(
    x: number,
    y: number,
    text: string,
    color: string = "#fff",
    size: number = 20,
  ): void {
    this.texts.push({ x, y, text, life: 1, color, size });
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 40 * dt;
      t.life -= 0.02 * dt * 60;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const t of this.texts) {
      ctx.save();
      ctx.globalAlpha = t.life;

      // Visual Juice: Scale and Bounce
      const bounce = easeOutBack(Math.min(1, (1 - t.life) * 4));
      const scale = t.life > 0.8 ? bounce : t.life / 0.8;

      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);

      ctx.font = "bold " + t.size + "px 'Caveat', cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Shadow
      ctx.fillStyle = "rgba(45, 45, 45, 0.2)";
      ctx.fillText(t.text, 2, 2);

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);

      ctx.restore();
    }
  }

  clear(): void {
    this.texts = [];
  }
}

// ============= BASE STATS =============
const BASE_STATS: PlayerStats = {
  damage: 1,
  fireRateMs: CONFIG.PLAYER_FIRE_RATE,
  bulletSpeed: CONFIG.BULLET_SPEED,
  moveSpeed: CONFIG.PLAYER_SPEED,
  pierce: 0,
  shots: 1,
  spread: 0,
  maxLives: 3,
  bulletSize: 1,
  invincibilityBonus: 0,
};

// ============= DEMO ANIMATION TYPES =============
interface DemoBullet {
  x: number;
  y: number;
  vy: number;
  active: boolean;
}

interface DemoAsteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  health: number;
  active: boolean;
}

interface DemoParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

// ============= MAIN GAME CLASS =============
class PaperPlaneGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gameContainer: HTMLElement;
  eventBus: EventBus;

  // Systems
  particles: ParticleSystem;
  floatingText: FloatingTextSystem;
  audio: AudioManager;

  // Pools
  bulletPool: ObjectPool<Bullet>;
  asteroidPool: ObjectPool<Asteroid>;

  // Active entities
  bullets: Bullet[] = [];
  asteroids: Asteroid[] = [];
  drones: Drone[] = [];
  orbitals: Orbital[] = [];
  bossProjectiles: BossProjectile[] = [];
  bossProjectileIdCounter: number = 0;
  bossMinions: BossMinion[] = [];
  bossMinionIdCounter: number = 0;
  bossAreaEffects: BossAreaEffect[] = [];
  bossAreaEffectIdCounter: number = 0;

  // Game state
  gameState: GameState = "START";
  selectedPlane: PlaneType = "dart";
  playerX: number = 0;
  playerY: number = 0;
  playerVelocityX: number = 0;
  playerVelocityY: number = 0;
  targetX: number = 0;
  targetY: number = 0;

  // Spin animation (barrel roll)
  spinAngle: number = 0;
  spinDirection: number = 0; // 1 = clockwise, -1 = counter-clockwise
  lastPlayerX: number = 0;

  // Lives and damage
  lives: number = 3;
  maxLives: number = 3;
  damageTimer: number = 0; // Invincibility frames timer
  damageFlashTimer: number = 0; // For blinking effect
  isInvincible: boolean = false;

  // Boss
  boss: Boss | null = null;
  bossesDefeated: number = 0;
  bossAnnouncementTimer: number = 0;
  isBossTestMode: boolean = false;
  currentBossTestType: BossType | null = null;
  isRechallengeMode: boolean = false;
  rechallengeRoundNumber: number = 0;
  rechallengeUpgrades: UpgradeTree = createEmptyUpgradeTree();
  rechallengeUltimateLevels: UltimateLevelMap = createEmptyUltimateLevelMap();

  // Pause state tracking
  prePauseState: GameState = "PLAYING";

  // Stats
  survivalTime: number = 0;
  coins: number = 0;
  score: number = 0;

  // Timers
  fireTimer: number = 0;
  spawnTimer: number = 0;
  destroyedCount: number = 0; // Asteroids destroyed since last upgrade
  totalUpgrades: number = 0; // Total upgrades collected

  // Ability system (legacy active-ability slots, kept for turbo/shield during gameplay)
  activeAbilities: StoredAbility[] = [];
  abilityDuration: number = 0;
  abilityCooldown: number = 0;
  abilityChoices: Ability[] = [];
  permanentStatBoost: number = 0;
  currentlyActiveAbility: StoredAbility | null = null;

  // Ultimate ability system
  ultimateLevels: UltimateLevelMap = createEmptyUltimateLevelMap();
  /** Families used in the current round (each can only be activated once). */
  usedUltimatesThisRound: Set<AbilityFamily> = new Set();

  // Upgrade tree system (6 paths)
  upgrades: UpgradeTree = createEmptyUpgradeTree();
  currentStats: PlayerStats = { ...BASE_STATS };

  // Difficulty
  difficultyLevel: number = 0;
  healthBonus: number = 0;
  speedMultiplier: number = 1;

  // Layout
  w: number = 0;
  h: number = 0;
  isMobile: boolean = false;
  bgOffset: number = 0;

  // Screen shake
  screenShake: { x: number; y: number; intensity: number } = {
    x: 0,
    y: 0,
    intensity: 0,
  };

  // Input
  keysDown: Set<string> = new Set();
  touchX: number | null = null;
  touchY: number | null = null;
  mouseX: number | null = null;
  mouseY: number | null = null;
  isDragging: boolean = false;

  // Settings
  settings: Settings;

  // Timing
  lastTime: number = 0;
  asteroidIdCounter: number = 0;

  // Upgrade selection timer
  upgradeAutoSelectTimer: number = 0;

  // Persistence / progression
  saveState: PaperPlaneSaveState = createDefaultSaveState();
  highestUnlockedRound: number = 0;

  // Round tracking
  currentRound: number = 1;
  roundStartTime: number = 0;
  roundStartScore: number = 0;
  bossRewardPending: boolean = false;

  // Reinforced Hull health regen
  reinforcedHullRegenTimer: number = 0;

  // Back-button handling
  private backButtonBound: boolean = false;

  // Demo animation
  demoCanvas: HTMLCanvasElement | null = null;
  demoCtx: CanvasRenderingContext2D | null = null;
  demoPlaneX: number = 0;
  demoPlaneY: number = 0;
  demoPlaneTargetX: number = 0;
  demoPlaneDirection: number = 1;
  demoBullets: DemoBullet[] = [];
  demoAsteroids: DemoAsteroid[] = [];
  demoParticles: DemoParticle[] = [];
  demoFireTimer: number = 0;
  demoSpawnTimer: number = 0;
  demoBgOffset: number = 0;

  // Visual Juice
  playerTilt: number = 0;
  playerScaleX: number = 1;
  playerScaleY: number = 1;
  juiceTimer: number = 0;
  bgDoodles: {
    x: number;
    y: number;
    text: string;
    scale: number;
    rotation: number;
    speed: number;
  }[] = [];

  constructor() {
    console.log("[PaperPlaneGame] Initializing");

    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.gameContainer = document.getElementById("game-container")!;

    this.eventBus = new EventBus();
    this.particles = new ParticleSystem();
    this.floatingText = new FloatingTextSystem();

    // Load settings
    this.settings = {
      music: localStorage.getItem("paperPlane_music") !== "false",
      fx: localStorage.getItem("paperPlane_fx") !== "false",
      haptics: localStorage.getItem("paperPlane_haptics") !== "false",
    };

    this.audio = new AudioManager(this.settings);

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Initialize demo canvas
    this.demoCanvas = document.getElementById(
      "demoCanvas",
    ) as HTMLCanvasElement;
    if (this.demoCanvas) {
      this.demoCtx = this.demoCanvas.getContext("2d");
      this.initDemoAnimation();
    }

    // Initialize pools
    this.bulletPool = new ObjectPool<Bullet>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        damage: 1,
        pierceRemaining: 0,
        explosive: false,
        chainLightning: false,
        active: false,
        fromDrone: false,
        age: 0,
        maxAge: 3,
        size: 1,
        color: CONFIG.PENCIL_DARK,
        shape: "line",
        wobblePhase: 0,
        bounceRemaining: 0,
        loop: false,
        homingStrength: 0,
        snowball: false,
        snowballMax: 1,
        sticky: false,
        stuckToId: -1,
        stuckOffsetX: 0,
        stuckOffsetY: 0,
        drag: 0,
        acceleration: 0,
        gravity: 0,
        splitOnHit: 0,
        trailTimer: 0,
        jitterOffset: 0,
        prismSplit: false,
      }),
      (b) => {
        b.active = false;
        b.fromDrone = false;
        b.age = 0;
        b.maxAge = 3;
        b.stuckToId = -1;
        b.trailTimer = 0;
        b.prismSplit = false;
      },
      CONFIG.BULLET_POOL_SIZE,
    );

    this.asteroidPool = new ObjectPool<Asteroid>(
      () => ({
        id: 0,
        size: "medium",
        health: 1,
        maxHealth: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rotation: 0,
        rotationSpeed: 0,
        active: false,
        hitFlash: 0,
        isBossAsteroid: false,
      }),
      (a) => {
        a.active = false;
        a.isBossAsteroid = false;
      },
      CONFIG.ASTEROID_POOL_SIZE,
    );

    // SDK: lifecycle hooks for background/foreground
    oasiz.onPause(() => {
      if (this.gameState === "PLAYING" || this.gameState === "BOSS") {
        this.pauseGame();
      }
    });
    oasiz.onResume(() => {
      // Don't auto-resume; player resumes manually from pause screen
    });

    // Setup events
    this.setupEventListeners();
    this.setupGameEvents();
    this.setupBackButtonHandling();

    // Initial resize
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // Start loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  setupEventListeners(): void {
    // Keyboard
    window.addEventListener("keydown", (e) => {
      this.keysDown.add(e.key);
      if (
        e.key === "Escape" &&
        (this.gameState === "PLAYING" || this.gameState === "BOSS")
      ) {
        this.pauseGame();
      } else if (e.key === "Escape" && this.gameState === "PAUSED") {
        this.resumeGame();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.key);
    });

    // Touch (mobile) - plane follows finger with drag
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.gameState === "PLAYING" || this.gameState === "BOSS") {
        if (!this.isDragging) {
          this.audio.triggerHaptic("light");
        }
        this.isDragging = true;
        this.touchX = this.getRelativeX(e.touches[0].clientX);
        this.touchY = this.getRelativeY(e.touches[0].clientY);
      }
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (
        this.isDragging &&
        (this.gameState === "PLAYING" || this.gameState === "BOSS")
      ) {
        this.touchX = this.getRelativeX(e.touches[0].clientX);
        this.touchY = this.getRelativeY(e.touches[0].clientY);
      }
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.isDragging = false;
      // Keep target at current position so plane stays in place
      this.targetX = this.playerX;
      this.targetY = this.playerY;
      this.touchX = null;
      this.touchY = null;
    });

    // Mouse (desktop) - plane follows cursor automatically, no clicking needed
    this.canvas.addEventListener("mousemove", (e) => {
      if (
        (this.gameState === "PLAYING" || this.gameState === "BOSS") &&
        !this.isMobile
      ) {
        this.mouseX = this.getRelativeX(e.clientX);
        this.mouseY = this.getRelativeY(e.clientY);
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      // When mouse leaves, keep plane at current position
      this.mouseX = null;
      this.mouseY = null;
    });

    // UI Buttons
    document.getElementById("startButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.startGame();
    });

    document.getElementById("restartButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      if (this.isBossTestMode && this.currentBossTestType) {
        this.startBossTest(this.currentBossTestType);
      } else {
        this.startGame();
      }
    });

    document.getElementById("menuButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showStartScreen();
    });

    document.getElementById("pauseBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.pauseGame();
    });

    document.getElementById("resumeButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.resumeGame();
    });

    document
      .getElementById("pauseRestartBtn")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        if (this.isBossTestMode && this.currentBossTestType) {
          this.startBossTest(this.currentBossTestType);
        } else {
          this.startGame();
        }
      });

    document.getElementById("pauseMenuBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showStartScreen();
    });

    // Settings
    document.getElementById("settingsBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      document.getElementById("settingsModal")?.classList.remove("hidden");
    });

    document.getElementById("settingsClose")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      document.getElementById("settingsModal")?.classList.add("hidden");
    });

    // Setting toggles
    this.setupSettingToggle("musicToggle", "music");
    this.setupSettingToggle("fxToggle", "fx");
    this.setupSettingToggle("hapticToggle", "haptics");

    // Plane selection screen buttons
    document.getElementById("galleryButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showGalleryScreen();
    });

    document
      .getElementById("testBossesButton")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        this.showBossTestScreen();
      });

    document
      .getElementById("backFromGalleryBtn")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        this.hideGalleryScreen();
      });

    document
      .getElementById("backFromBossTestBtn")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        this.hideBossTestScreen();
      });

    // Plane selection
    document.querySelectorAll(".plane-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        const type = card.getAttribute("data-plane") as PlaneType;
        this.selectPlane(type);
        this.hideGalleryScreen();
      });
    });

    document.querySelectorAll(".boss-test-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.audio.triggerHaptic("medium");
        const bossType = card.getAttribute("data-boss") as BossType | null;
        if (!bossType) return;
        this.startBossTest(bossType);
      });
    });

    // Upgrade cards (upgrade tree selection)
    document
      .querySelectorAll("#upgradeScreen .upgrade-card")
      .forEach((card) => {
        card.addEventListener("click", () => {
          if (this.gameState !== "UPGRADE") return;
          const treeKey = card.getAttribute("data-item-id");
          if (!treeKey) return;
          if (card.classList.contains("maxed")) return; // Can't select maxed upgrades
          this.audio.triggerHaptic("medium");
          this.selectItem(treeKey);
        });
      });

    // Ability cards (ability selection after boss)
    document
      .querySelectorAll("#abilityScreen .ability-card")
      .forEach((card) => {
        card.addEventListener("click", () => {
          if (this.gameState !== "ABILITY_CHOICE") return;
          const abilityId = card.getAttribute("data-ability-id");
          if (!abilityId) return;
          this.audio.triggerHaptic("medium");
          this.selectAbility(abilityId);
        });
      });
  }

  setupSettingToggle(elementId: string, settingKey: keyof Settings): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.toggle("active", this.settings[settingKey]);

    el.addEventListener("click", () => {
      this.settings[settingKey] = !this.settings[settingKey];
      el.classList.toggle("active", this.settings[settingKey]);
      localStorage.setItem(
        "paperPlane_" + settingKey,
        this.settings[settingKey].toString(),
      );
      this.audio.triggerHaptic("light");
      if (settingKey === "music") {
        this.audio.updateMusicState();
      }
    });
  }

  setupGameEvents(): void {
    this.eventBus.on("ASTEROID_DESTROYED", (data) => {
      const { asteroid, coins } = data as { asteroid: Asteroid; coins: number };
      console.log("[Event] ASTEROID_DESTROYED", asteroid.size, "coins:", coins);

      this.coins += coins;
      this.score += coins * 10;
      this.audio.playDestroy(asteroid.size);
      this.audio.playCoin();
      this.audio.triggerHaptic(asteroid.size === "large" ? "heavy" : "medium");

      // Particles
      this.particles.emit(asteroid.x, asteroid.y, CONFIG.PAPER_BG, 12, "paper");
      this.particles.emit(
        asteroid.x,
        asteroid.y,
        CONFIG.PENCIL_DARK,
        8,
        "explosion",
      );

      // Floating text
      this.floatingText.add(
        asteroid.x,
        asteroid.y,
        "+" + coins,
        CONFIG.COIN_GOLD,
        24,
      );

      // Screen shake based on size
      const intensity =
        asteroid.size === "large"
          ? 0.5
          : asteroid.size === "medium"
            ? 0.3
            : 0.15;
      this.triggerScreenShake(intensity);

      // Increment destroyed count and check for upgrade
      if (this.gameState === "BOSS") return;
      this.destroyedCount++;
      this.updateProgressBar();
      if (
        this.destroyedCount >= this.getAsteroidsForNextUpgrade() &&
        this.gameState === "PLAYING"
      ) {
        console.log(
          "[Game] Triggering upgrade after",
          this.destroyedCount,
          "asteroids destroyed",
        );
        this.showUpgradeScreen();
      }
    });

    this.eventBus.on("ASTEROID_HIT", (data) => {
      const { asteroid, damage } = data as {
        asteroid: Asteroid;
        damage: number;
      };
      this.audio.playHit();
      this.audio.triggerHaptic("light");

      // Hit flash
      asteroid.hitFlash = 0.2;

      // Small particles
      this.particles.emit(
        asteroid.x,
        asteroid.y,
        CONFIG.PENCIL_LIGHT,
        4,
        "spark",
      );
    });

    this.eventBus.on("PLAYER_HIT", () => {
      if (this.isInvincible) return; // Ignore hits during invincibility

      this.lives--;
      console.log("[Event] PLAYER_HIT - Lives remaining:", this.lives);

      if (this.lives <= 0) {
        this.gameOver();
      } else {
        // Trigger damage effect
        this.triggerDamageEffect();
      }
    });

    this.eventBus.on("UPGRADE_ROUND_START", () => {
      console.log("[Event] UPGRADE_ROUND_START");
      this.showUpgradeScreen();
    });
  }

  selectPlane(type: PlaneType): void {
    console.log("[selectPlane]", type);
    this.selectedPlane = type;

    document.querySelectorAll(".plane-card").forEach((card) => {
      card.classList.toggle(
        "selected",
        card.getAttribute("data-plane") === type,
      );
    });
  }

  showGalleryScreen(): void {
    console.log("[showGalleryScreen]");
    const savedState = loadSaveState();
    this.saveState = savedState;
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.remove("hidden");
    this.renderGalleryDefeatedBosses(savedState);
    this.renderGalleryBuildEditor(savedState);
    this.setupBackButtonHandling();
  }

  renderGalleryDefeatedBosses(savedState: PaperPlaneSaveState): void {
    const container = document.getElementById("galleryBossSection");
    if (!container) return;

    const defeatedRounds = Object.entries(savedState.rounds)
      .filter(([, r]) => r.defeated)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    if (defeatedRounds.length === 0) {
      container.innerHTML =
        "<p class='gallery-save-note'>No bosses defeated yet. Start a new run to battle bosses!</p>";
      return;
    }

    let html = "";
    for (const [roundKey, roundData] of defeatedRounds) {
      const roundNum = parseInt(roundKey);
      const bossType = (roundData.bossType ||
        BOSS_ORDER[roundNum - 1]) as BossType;
      const bossConfig = BOSS_CONFIGS[bossType];
      const bossName = bossConfig?.name ?? "Boss #" + roundNum;
      const bestScore = roundData.bestScore ?? 0;
      html +=
        "<div class='boss-card boss-card--defeated'>" +
        "<div class='boss-card-header'>" +
        "<span class='boss-card-round'>Round " +
        roundNum +
        "</span>" +
        "<span class='boss-card-name'>" +
        bossName +
        "</span>" +
        "</div>" +
        "<div class='boss-card-score'>Best: " +
        bestScore.toLocaleString() +
        "</div>" +
        "<button class='btn btn-sm boss-rechallenge-btn' data-round='" +
        roundNum +
        "'>Rechallenge</button>" +
        "</div>";
    }
    container.innerHTML = html;

    // Wire rechallenge buttons
    container
      .querySelectorAll<HTMLButtonElement>(".boss-rechallenge-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const roundNum = parseInt(btn.dataset.round ?? "1");
          this.showRechallengeSetupModal(roundNum, savedState);
        });
      });
  }

  hideGalleryScreen(): void {
    console.log("[hideGalleryScreen]");
    document.getElementById("galleryScreen")?.classList.add("hidden");
    document.getElementById("startScreen")?.classList.remove("hidden");
  }

  showRechallengeSetupModal(
    roundNumber: number,
    savedState: PaperPlaneSaveState,
  ): void {
    console.log("[showRechallengeSetupModal] Round:", roundNumber);
    const modal = document.getElementById("rechallengeSetupModal");
    if (!modal) return;

    const bossType = BOSS_ORDER[roundNumber - 1] ?? "eraser";
    const bossName =
      BOSS_CONFIGS[bossType as BossType]?.name ?? "Boss #" + roundNumber;
    const availUpg = (roundNumber - 1) * 2;
    const availUlt = roundNumber - 1;

    // Start with committed build for reference
    const commitBuild = savedState.build;

    const container = modal.querySelector<HTMLElement>(".rc-editor");
    if (!container) return;

    // Build the editor HTML (reusing gallery builder style)
    let html =
      "<div class='rc-title'>Round " +
      roundNumber +
      " — " +
      bossName +
      "</div>" +
      "<div class='gallery-section-title'>Upgrade Build</div>" +
      "<div class='gallery-points-row'>Available: <b id='rcUpgAvail'>" +
      availUpg +
      "</b>  Spent: <b id='rcUpgSpent'>" +
      getSpentUpgradePoints(commitBuild.upgrades) +
      "</b></div>";

    const allUpgradeKeys = [...PRIMARY_UPGRADE_KEYS, ...SECONDARY_UPGRADE_KEYS];
    for (const key of allUpgradeKeys) {
      const cfg = UPGRADE_CONFIG[key];
      const level = commitBuild.upgrades[key];
      html +=
        "<div class='gallery-upgrade-row'>" +
        "<span class='gallery-upg-name'>" +
        cfg.name +
        "</span>" +
        "<input type='range' class='gallery-upg-slider rc-upg-slider' data-key='" +
        key +
        "' min='0' max='5' value='" +
        level +
        "' />" +
        "<span class='gallery-upg-level' id='rc-lvl-" +
        key +
        "'>" +
        level +
        "</span>" +
        "<span class='gallery-upg-desc' id='rc-desc-" +
        key +
        "'>" +
        getUpgradeLevelDescription(key, level) +
        "</span>" +
        "</div>";
    }

    html +=
      "<div class='gallery-section-title gallery-section-title--ult'>Ultimate Abilities</div>" +
      "<div class='gallery-points-row'>Available: <b id='rcUltAvail'>" +
      availUlt +
      "</b>  Spent: <b id='rcUltSpent'>" +
      getSpentUltimatePoints(commitBuild.ultimateLevels) +
      "</b></div>";

    for (const family of ABILITY_FAMILIES) {
      const level = commitBuild.ultimateLevels[family.id];
      html +=
        "<div class='gallery-upgrade-row'>" +
        "<span class='gallery-upg-name'>" +
        family.name +
        "</span>" +
        "<input type='range' class='gallery-ult-slider rc-ult-slider' data-family='" +
        family.id +
        "' min='0' max='5' value='" +
        level +
        "' />" +
        "<span class='gallery-ult-level' id='rc-ult-lvl-" +
        family.id +
        "'>" +
        level +
        "</span>" +
        "<span class='gallery-ult-desc' id='rc-ult-desc-" +
        family.id +
        "'>" +
        getUltimateLevelDescription(family.id, level) +
        "</span>" +
        "</div>";
    }

    container.innerHTML = html;
    modal.classList.remove("hidden");

    // Wire upgrade sliders
    container
      .querySelectorAll<HTMLInputElement>(".rc-upg-slider")
      .forEach((slider) => {
        slider.addEventListener("input", () => {
          const key = slider.dataset.key as keyof UpgradeTree;
          const level = parseInt(slider.value);
          const lvlEl = document.getElementById("rc-lvl-" + key);
          const descEl = document.getElementById("rc-desc-" + key);
          if (lvlEl) lvlEl.textContent = String(level);
          if (descEl)
            descEl.textContent = getUpgradeLevelDescription(key, level);

          const spent = this.readEditorUpgradePoints(
            ".rc-upg-slider",
            container,
          );
          const spentEl = document.getElementById("rcUpgSpent");
          if (spentEl) {
            spentEl.textContent = String(spent);
            spentEl.style.color = spent > availUpg ? "#e63946" : "";
          }
        });
      });

    // Wire ultimate sliders
    container
      .querySelectorAll<HTMLInputElement>(".rc-ult-slider")
      .forEach((slider) => {
        slider.addEventListener("input", () => {
          const family = slider.dataset.family as AbilityFamily;
          const level = parseInt(slider.value);
          const lvlEl = document.getElementById("rc-ult-lvl-" + family);
          const descEl = document.getElementById("rc-ult-desc-" + family);
          if (lvlEl) lvlEl.textContent = String(level);
          if (descEl)
            descEl.textContent = getUltimateLevelDescription(family, level);

          const spent = this.readEditorUltimatePoints(
            ".rc-ult-slider",
            container,
          );
          const spentEl = document.getElementById("rcUltSpent");
          if (spentEl) {
            spentEl.textContent = String(spent);
            spentEl.style.color = spent > availUlt ? "#e63946" : "";
          }
        });
      });

    // Start button
    const startBtn = modal.querySelector<HTMLElement>("#rcStartBtn");
    if (startBtn) {
      // Clone to remove old listeners
      const newStart = startBtn.cloneNode(true) as HTMLElement;
      startBtn.parentNode?.replaceChild(newStart, startBtn);
      newStart.addEventListener("click", () => {
        const upgSpent = this.readEditorUpgradePoints(
          ".rc-upg-slider",
          container,
        );
        const ultSpent = this.readEditorUltimatePoints(
          ".rc-ult-slider",
          container,
        );
        if (upgSpent > availUpg) {
          alert(
            "Too many upgrade points spent (" +
              upgSpent +
              " / " +
              availUpg +
              ").",
          );
          return;
        }
        if (ultSpent > availUlt) {
          alert(
            "Too many ultimate points spent (" +
              ultSpent +
              " / " +
              availUlt +
              ").",
          );
          return;
        }
        const upgrades = this.readEditorBuildUpgrades(container);
        const ultimates = this.readEditorBuildUltimates(container);
        modal.classList.add("hidden");
        this.startGame({
          rechallengeRound: roundNumber,
          rechallengeUpgrades: upgrades,
          rechallengeUltimates: ultimates,
        });
      });
    }

    // Cancel button
    const cancelBtn = modal.querySelector<HTMLElement>("#rcCancelBtn");
    if (cancelBtn) {
      const newCancel = cancelBtn.cloneNode(true) as HTMLElement;
      cancelBtn.parentNode?.replaceChild(newCancel, cancelBtn);
      newCancel.addEventListener("click", () => {
        modal.classList.add("hidden");
      });
    }
  }

  private readEditorUpgradePoints(
    selector: string,
    container: HTMLElement,
  ): number {
    let total = 0;
    container.querySelectorAll<HTMLInputElement>(selector).forEach((s) => {
      total += parseInt(s.value);
    });
    return total;
  }

  private readEditorUltimatePoints(
    selector: string,
    container: HTMLElement,
  ): number {
    let total = 0;
    container.querySelectorAll<HTMLInputElement>(selector).forEach((s) => {
      total += parseInt(s.value);
    });
    return total;
  }

  private readEditorBuildUpgrades(container: HTMLElement): UpgradeTree {
    const upgrades = createEmptyUpgradeTree();
    container
      .querySelectorAll<HTMLInputElement>(".rc-upg-slider")
      .forEach((s) => {
        const key = s.dataset.key as keyof UpgradeTree;
        if (key in upgrades) upgrades[key] = parseInt(s.value);
      });
    return upgrades;
  }

  private readEditorBuildUltimates(container: HTMLElement): UltimateLevelMap {
    const map = createEmptyUltimateLevelMap();
    container
      .querySelectorAll<HTMLInputElement>(".rc-ult-slider")
      .forEach((s) => {
        const family = s.dataset.family as AbilityFamily;
        if (family in map) map[family] = parseInt(s.value);
      });
    return map;
  }

  renderGalleryBuildEditor(savedState: PaperPlaneSaveState): void {
    const container = document.getElementById("galleryBuildEditor");
    if (!container) return;

    const avail = getAvailableUpgradePointsFromProgression(
      savedState.progression.highestDefeatedRound,
    );
    const ultAvail = getAvailableUltimatePointsFromProgression(
      savedState.progression.highestDefeatedRound,
    );
    const build = savedState.build;

    let html =
      "<div class='gallery-section-title'>Upgrade Build</div>" +
      "<div class='gallery-points-row'>Available points: <b id='galleryUpgAvail'>" +
      avail +
      "</b>  Spent: <b id='galleryUpgSpent'>" +
      getSpentUpgradePoints(build.upgrades) +
      "</b></div>";

    const allUpgradeKeys = [...PRIMARY_UPGRADE_KEYS, ...SECONDARY_UPGRADE_KEYS];
    for (const key of allUpgradeKeys) {
      const cfg = UPGRADE_CONFIG[key];
      const level = build.upgrades[key];
      html +=
        "<div class='gallery-upgrade-row'>" +
        "<span class='gallery-upg-name'>" +
        cfg.name +
        "</span>" +
        "<input type='range' class='gallery-upg-slider' data-key='" +
        key +
        "' min='0' max='5' value='" +
        level +
        "' />" +
        "<span class='gallery-upg-level' id='gallery-lvl-" +
        key +
        "'>" +
        level +
        "</span>" +
        "<span class='gallery-upg-desc' id='gallery-desc-" +
        key +
        "'>" +
        getUpgradeLevelDescription(key, level) +
        "</span>" +
        "</div>";
    }

    html +=
      "<div class='gallery-section-title gallery-section-title--ult'>Ultimate Abilities</div>" +
      "<div class='gallery-points-row'>Available points: <b id='galleryUltAvail'>" +
      ultAvail +
      "</b>  Spent: <b id='galleryUltSpent'>" +
      getSpentUltimatePoints(build.ultimateLevels) +
      "</b></div>";

    for (const family of ABILITY_FAMILIES) {
      const level = build.ultimateLevels[family.id];
      html +=
        "<div class='gallery-upgrade-row'>" +
        "<span class='gallery-upg-name'>" +
        family.name +
        "</span>" +
        "<input type='range' class='gallery-ult-slider' data-family='" +
        family.id +
        "' min='0' max='5' value='" +
        level +
        "' />" +
        "<span class='gallery-ult-level' id='gallery-ult-lvl-" +
        family.id +
        "'>" +
        level +
        "</span>" +
        "<span class='gallery-ult-desc' id='gallery-ult-desc-" +
        family.id +
        "'>" +
        getUltimateLevelDescription(family.id, level) +
        "</span>" +
        "</div>";
    }

    html +=
      "<button class='gallery-save-btn' id='galleryBuildSaveBtn'>Save Build</button>" +
      "<p class='gallery-save-note'>Saved builds carry over to new runs. Bosses defeated: <b>" +
      savedState.progression.highestDefeatedRound +
      "</b></p>";

    container.innerHTML = html;

    // Wire upgrade sliders
    container
      .querySelectorAll<HTMLInputElement>(".gallery-upg-slider")
      .forEach((slider) => {
        slider.addEventListener("input", () => {
          const key = slider.dataset.key as keyof UpgradeTree;
          const level = parseInt(slider.value);
          const lvlEl = document.getElementById("gallery-lvl-" + key);
          const descEl = document.getElementById("gallery-desc-" + key);
          if (lvlEl) lvlEl.textContent = String(level);
          if (descEl)
            descEl.textContent = getUpgradeLevelDescription(key, level);

          // Recalculate spent and highlight overspend
          const upgSpent = this.readGalleryUpgradePoints(container);
          const spentEl = document.getElementById("galleryUpgSpent");
          if (spentEl) {
            spentEl.textContent = String(upgSpent);
            spentEl.style.color = upgSpent > avail ? "#e63946" : "";
          }
        });
      });

    // Wire ultimate sliders
    container
      .querySelectorAll<HTMLInputElement>(".gallery-ult-slider")
      .forEach((slider) => {
        slider.addEventListener("input", () => {
          const family = slider.dataset.family as AbilityFamily;
          const level = parseInt(slider.value);
          const lvlEl = document.getElementById("gallery-ult-lvl-" + family);
          const descEl = document.getElementById("gallery-ult-desc-" + family);
          if (lvlEl) lvlEl.textContent = String(level);
          if (descEl)
            descEl.textContent = getUltimateLevelDescription(family, level);

          const ultSpent = this.readGalleryUltimatePoints(container);
          const spentEl = document.getElementById("galleryUltSpent");
          if (spentEl) {
            spentEl.textContent = String(ultSpent);
            spentEl.style.color = ultSpent > ultAvail ? "#e63946" : "";
          }
        });
      });

    // Save button
    document
      .getElementById("galleryBuildSaveBtn")
      ?.addEventListener("click", () => {
        const upgSpent = this.readGalleryUpgradePoints(container);
        const ultSpent = this.readGalleryUltimatePoints(container);
        if (upgSpent > avail) {
          alert(
            "Too many upgrade points spent (" + upgSpent + " / " + avail + ").",
          );
          return;
        }
        if (ultSpent > ultAvail) {
          alert(
            "Too many ultimate points spent (" +
              ultSpent +
              " / " +
              ultAvail +
              ").",
          );
          return;
        }

        const newBuild = this.readGalleryBuildFromEditor(container);
        savedState.build = newBuild;
        persistSaveState(savedState, true);
        this.saveState = savedState;
        this.audio.triggerHaptic("success");

        const saveBtn = document.getElementById("galleryBuildSaveBtn");
        if (saveBtn) {
          saveBtn.textContent = "Saved!";
          setTimeout(() => {
            saveBtn.textContent = "Save Build";
          }, 1500);
        }
      });
  }

  private readGalleryUpgradePoints(container: HTMLElement): number {
    let total = 0;
    container
      .querySelectorAll<HTMLInputElement>(".gallery-upg-slider")
      .forEach((s) => {
        total += parseInt(s.value);
      });
    return total;
  }

  private readGalleryUltimatePoints(container: HTMLElement): number {
    let total = 0;
    container
      .querySelectorAll<HTMLInputElement>(".gallery-ult-slider")
      .forEach((s) => {
        total += parseInt(s.value);
      });
    return total;
  }

  private readGalleryBuildFromEditor(
    container: HTMLElement,
  ): PaperPlaneSaveBuild {
    const upgrades = createEmptyUpgradeTree();
    container
      .querySelectorAll<HTMLInputElement>(".gallery-upg-slider")
      .forEach((s) => {
        const key = s.dataset.key as keyof UpgradeTree;
        if (key) upgrades[key] = Math.min(5, parseInt(s.value));
      });

    const ultimateLevels = createEmptyUltimateLevelMap();
    container
      .querySelectorAll<HTMLInputElement>(".gallery-ult-slider")
      .forEach((s) => {
        const family = s.dataset.family as AbilityFamily;
        if (family)
          ultimateLevels[family] = Math.min(
            ULTIMATE_MAX_LEVEL,
            parseInt(s.value),
          );
      });

    return {
      upgrades,
      pierceBonus: upgrades.piercingRounds,
      maxLivesBonus:
        (upgrades.reinforcedHull >= 1 ? 1 : 0) +
        (upgrades.reinforcedHull >= 3 ? 1 : 0) +
        (upgrades.reinforcedHull >= 5 ? 1 : 0),
      ultimateLevels,
      permanentStatBoost: 0,
      postHitInvincibilityBonus: upgrades.emergencyShielding * 0.4,
    };
  }

  // ── Back button handling ──────────────────────────────────────────────────

  private setupBackButtonHandling(): void {
    if (this.backButtonBound) return;
    this.backButtonBound = true;
    const nav = oasiz as OasizNav;
    if (typeof nav.onBackButton === "function") {
      nav.onBackButton(() => this.handlePlatformBackButton());
    }
  }

  private handlePlatformBackButton(): void {
    // If settings modal is open, close it first
    const settingsModal = document.getElementById("settingsModal");
    if (settingsModal && !settingsModal.classList.contains("hidden")) {
      settingsModal.classList.add("hidden");
      return;
    }

    // If on start screen, exit game
    if (this.gameState === "START") {
      const nav = oasiz as OasizNav;
      if (typeof nav.leaveGame === "function") nav.leaveGame();
      return;
    }

    // If in gallery, close it
    if (
      !document.getElementById("galleryScreen")?.classList.contains("hidden")
    ) {
      this.showBackConfirmModal(() => this.hideGalleryScreen());
      return;
    }

    // In-game or any other state: show confirmation modal
    this.showBackConfirmModal(() => this.showStartScreen());
  }

  private showBackConfirmModal(onLeave: () => void): void {
    const modal = document.getElementById("backConfirmModal");
    if (!modal) {
      onLeave();
      return;
    }
    modal.classList.remove("hidden");

    const leaveBtn = document.getElementById("backConfirmLeave");
    const stayBtn = document.getElementById("backConfirmStay");

    const cleanup = () => {
      modal.classList.add("hidden");
    };

    leaveBtn?.replaceWith(leaveBtn.cloneNode(true));
    stayBtn?.replaceWith(stayBtn.cloneNode(true));

    document.getElementById("backConfirmLeave")?.addEventListener(
      "click",
      () => {
        cleanup();
        onLeave();
      },
      { once: true },
    );
    document.getElementById("backConfirmStay")?.addEventListener(
      "click",
      () => {
        cleanup();
      },
      { once: true },
    );
  }

  showBossTestScreen(): void {
    console.log("[showBossTestScreen]");
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("bossTestScreen")?.classList.remove("hidden");
  }

  hideBossTestScreen(): void {
    console.log("[hideBossTestScreen]");
    document.getElementById("bossTestScreen")?.classList.add("hidden");
    document.getElementById("startScreen")?.classList.remove("hidden");
  }

  resizeCanvas(): void {
    this.w = this.gameContainer.clientWidth;
    this.h = this.gameContainer.clientHeight;
    this.canvas.width = this.w;
    this.canvas.height = this.h;

    if (this.playerX === 0) {
      this.playerX = this.w / 2;
      this.playerY = this.h * CONFIG.PLAYER_Y_RATIO;
      this.targetX = this.w / 2;
      this.targetY = this.h * CONFIG.PLAYER_Y_RATIO;
    }

    console.log("[resizeCanvas]", this.w, "x", this.h);
  }

  // Helper to get position relative to game container
  getRelativeX(clientX: number): number {
    const rect = this.gameContainer.getBoundingClientRect();
    return clientX - rect.left;
  }

  getRelativeY(clientY: number): number {
    const rect = this.gameContainer.getBoundingClientRect();
    return clientY - rect.top;
  }

  startGame(
    options: {
      bossTestType?: BossType;
      rechallengeRound?: number;
      rechallengeUpgrades?: UpgradeTree;
      rechallengeUltimates?: UltimateLevelMap;
    } = {},
  ): void {
    console.log("[startGame] Plane:", this.selectedPlane);

    // Load persisted save state
    this.saveState = loadSaveState();
    this.highestUnlockedRound = this.saveState.progression.highestUnlockedRound;

    this.audio.init();
    this.gameState = "PLAYING";

    // Reset state...
    this.survivalTime = 0;
    this.coins = 0;
    this.score = 0;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.destroyedCount = 0;
    this.totalUpgrades = 0;
    this.difficultyLevel = 0;
    this.healthBonus = 0;
    this.speedMultiplier = 1;
    this.currentRound = 1;
    this.roundStartTime = 0;
    this.roundStartScore = 0;
    this.bossRewardPending = false;
    this.reinforcedHullRegenTimer = 0;
    this.usedUltimatesThisRound = new Set();

    // Generate background doodles for juice
    this.generateDoodles();

    // Restore build from persisted save or start fresh
    const savedBuild = this.saveState.build;
    this.upgrades = { ...savedBuild.upgrades };
    this.ultimateLevels = { ...savedBuild.ultimateLevels };
    this.currentStats = { ...BASE_STATS };

    // Apply reinforced hull max HP from saved upgrades
    this.applyReinorcedHullMaxHP();

    this.maxLives = BASE_STATS.maxLives;
    this.lives = this.maxLives;
    this.damageTimer = 0;
    this.damageFlashTimer = 0;
    this.isInvincible = false;
    this.boss = null;
    this.bossesDefeated = 0;
    this.bossAnnouncementTimer = 0;
    this.isBossTestMode = Boolean(options.bossTestType);
    this.currentBossTestType = options.bossTestType ?? null;
    this.isRechallengeMode = Boolean(options.rechallengeRound);
    this.rechallengeRoundNumber = options.rechallengeRound ?? 0;

    // Reset Abilities
    this.activeAbilities = [];
    this.abilityDuration = 0;
    this.abilityCooldown = 0;
    this.permanentStatBoost = 0;
    this.currentlyActiveAbility = null;
    this.abilityChoices = [];

    this.updateAbilityUI();

    this.updateLivesDisplay();

    this.playerX = this.w / 2;
    this.playerY = this.h * CONFIG.PLAYER_Y_RATIO;
    this.targetX = this.w / 2;
    this.targetY = this.h * CONFIG.PLAYER_Y_RATIO;
    this.playerVelocityX = 0;
    this.playerVelocityY = 0;
    this.spinAngle = 0;
    this.spinDirection = 0;
    this.lastPlayerX = this.w / 2;
    this.mouseX = null;
    this.mouseY = null;
    this.touchX = null;
    this.touchY = null;

    // Clear entities
    for (const b of this.bullets) this.bulletPool.release(b);
    this.bullets = [];
    for (const a of this.asteroids) this.asteroidPool.release(a);
    this.asteroids = [];
    this.drones = [];
    this.orbitals = [];
    this.bossProjectiles = [];
    this.bossMinions = [];
    this.bossAreaEffects = [];
    this.particles.clear();
    this.floatingText.clear();

    // Hide screens
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");
    document.getElementById("abilityScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.add("hidden");
    document.getElementById("bossTestScreen")?.classList.add("hidden");

    // Show HUD
    document.getElementById("hud")?.classList.remove("hidden");
    document.getElementById("pauseBtn")?.classList.remove("hidden");
    document.getElementById("itemInventory")?.classList.remove("hidden");

    this.updateHUD();
    this.recalculateStats();
    this.updateProgressBar();
    this.audio.startMusic(this.currentRound);

    if (options.bossTestType) {
      const bossIndex = BOSS_ORDER.indexOf(options.bossTestType);
      this.applyBossTestLoadout(bossIndex + 1);
      this.bossesDefeated = bossIndex;
      this.totalUpgrades = Math.max(0, (bossIndex + 1) * 2 - 2);
      this.updateProgressBar();
      this.startBossFight(options.bossTestType, bossIndex + 1);
    } else if (options.rechallengeRound) {
      const roundNum = options.rechallengeRound;
      const bossType = BOSS_ORDER[roundNum - 1];
      // Apply rechallenge loadout
      if (options.rechallengeUpgrades) {
        this.upgrades = { ...options.rechallengeUpgrades };
      }
      if (options.rechallengeUltimates) {
        this.ultimateLevels = { ...options.rechallengeUltimates };
      }
      this.bossesDefeated = roundNum - 1;
      this.currentRound = roundNum;
      this.totalUpgrades = (roundNum - 1) * 2;
      this.recalculateStats();
      this.applyReinorcedHullMaxHP();
      this.updateProgressBar();
      this.updateAbilityUI();
      if (bossType) this.startBossFight(bossType, roundNum);
    }
  }

  showStartScreen(): void {
    console.log("[showStartScreen]");
    this.gameState = "START";
    this.audio.stopMusic();

    document.getElementById("startScreen")?.classList.remove("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");
    document.getElementById("abilityScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.add("hidden");
    document.getElementById("bossTestScreen")?.classList.add("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("itemInventory")?.classList.add("hidden");
    this.isBossTestMode = false;
    this.currentBossTestType = null;

    // Re-init demo animation when returning to start screen
    this.initDemoAnimation();
  }

  startBossTest(bossType: BossType): void {
    this.startGame({ bossTestType: bossType });
  }

  applyBossTestLoadout(bossNumber: number): void {
    const lateGameBonus = Math.max(0, bossNumber - 6);
    this.upgrades = {
      fireRate: Math.min(5, 2 + Math.floor(bossNumber / 3)),
      multiShot: Math.min(5, 1 + Math.floor((bossNumber + 1) / 3)),
      turrets: Math.min(5, Math.floor(bossNumber / 4)),
      reinforcedHull: Math.min(5, Math.floor(bossNumber / 5)),
      piercingRounds: Math.min(5, Math.floor(bossNumber / 5)),
      emergencyShielding: Math.min(5, Math.floor(bossNumber / 6)),
    };
    this.maxLives = 4 + Math.floor(bossNumber / 4);
    this.lives = this.maxLives;
    // +0.5 damage per boss round cleared, matching real-game scaling
    this.permanentStatBoost = (bossNumber - 1) * 0.5;
    this.currentStats = { ...BASE_STATS };
    this.recalculateStats();
    this.updateLivesDisplay();
  }

  pauseGame(): void {
    if (this.gameState !== "PLAYING" && this.gameState !== "BOSS") return;
    console.log("[pauseGame] Pausing from state:", this.gameState);
    this.prePauseState = this.gameState;
    this.gameState = "PAUSED";
    document.getElementById("pauseScreen")?.classList.remove("hidden");
  }

  resumeGame(): void {
    if (this.gameState !== "PAUSED") return;
    console.log("[resumeGame] Restoring state:", this.prePauseState);
    this.gameState = this.prePauseState;
    document.getElementById("pauseScreen")?.classList.add("hidden");
  }

  gameOver(): void {
    console.log(
      "[gameOver] Time:",
      (this.survivalTime / 1000).toFixed(1),
      "s, Coins:",
      this.coins,
    );
    this.gameState = "GAME_OVER";

    // In rechallenge mode, just go back to gallery after a brief game over screen
    if (this.isRechallengeMode) {
      this.isRechallengeMode = false;
      this.audio.playGameOver();
      this.audio.stopMusic();
      this.audio.triggerHaptic("error");
      setTimeout(() => {
        this.showStartScreen();
        this.showGalleryScreen();
      }, 2000);
      return;
    }

    this.audio.playGameOver();
    this.audio.stopMusic();
    this.audio.triggerHaptic("error");

    // On death: only update this round's score if it's a new best (never reduce it).
    // Upgrade points / build are NOT changed here — those only update on boss defeat.
    const roundKey = String(this.currentRound);
    const roundScore = this.score - this.roundStartScore;
    const existingOnDeath = this.saveState.rounds[roundKey];
    const prevBestOnDeath = existingOnDeath?.bestScore ?? 0;
    if (roundScore > prevBestOnDeath) {
      // New best for this round — update the entry
      this.saveState.rounds[roundKey] = {
        bossType: BOSS_ORDER[this.currentRound - 1] ?? "",
        defeated: existingOnDeath?.defeated ?? false,
        unlocked: true,
        bestScore: roundScore,
        lastScore: roundScore,
        completedAt: existingOnDeath?.completedAt,
      };
      const totalScore = getLeaderboardTotalScore(this.saveState);
      oasiz.submitScore(totalScore);
      persistSaveState(this.saveState, true);
      console.log(
        "[gameOver] New best for round",
        this.currentRound,
        "→",
        roundScore,
        "| total:",
        totalScore,
      );
    } else if (existingOnDeath) {
      // Not a new best — only update lastScore in memory, do NOT persist
      this.saveState.rounds[roundKey].lastScore = roundScore;
    }

    // Update game over screen
    const mins = Math.floor(this.survivalTime / 60000);
    const secs = Math.floor((this.survivalTime % 60000) / 1000);
    document.getElementById("finalTime")!.textContent =
      mins + ":" + secs.toString().padStart(2, "0");
    document.getElementById("finalCoins")!.textContent = Math.floor(
      this.score,
    ).toString();

    // Update upgrade summary
    const totalLevels =
      this.upgrades.fireRate + this.upgrades.multiShot + this.upgrades.turrets;
    document.getElementById("summaryItems")!.textContent =
      totalLevels.toString();
    document.getElementById("summaryCursed")!.textContent =
      this.bossesDefeated.toString();

    // Show screen
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("itemInventory")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.remove("hidden");
  }

  showUpgradeScreen(): void {
    if (this.gameState === "UPGRADE") return;
    console.log("[showUpgradeScreen] Showing upgrade tree selection");
    this.gameState = "UPGRADE";
    this.audio.triggerHaptic("success");

    // Render upgrade tree cards with new design
    const trees: (keyof UpgradeTree)[] = ["fireRate", "multiShot", "turrets"];
    const cards = document.querySelectorAll("#upgradeScreen .upgrade-card");

    cards.forEach((card, index) => {
      const treeKey = trees[index];
      if (!treeKey) return;

      const config = UPGRADE_CONFIG[treeKey];
      const currentLevel = this.upgrades[treeKey];
      const isMaxed = currentLevel >= 5;

      card.classList.toggle("maxed", isMaxed);
      card.setAttribute("data-item-id", treeKey);

      // Update level dots
      const dots = card.querySelectorAll(".level-dots .dot");
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("filled", dotIndex < currentLevel);
      });

      // Update next upgrade info
      const nextNameEl = card.querySelector(".next-name");
      const nextBonusEl = card.querySelector(".next-bonus");

      if (isMaxed) {
        if (nextNameEl) nextNameEl.textContent = "MAXED!";
        if (nextBonusEl) nextBonusEl.textContent = "";
      } else {
        const nextLevel = config.levels[currentLevel];
        if (nextNameEl) nextNameEl.textContent = nextLevel.name;
        if (nextBonusEl) nextBonusEl.textContent = nextLevel.desc;
      }
    });

    document.getElementById("upgradeScreen")?.classList.remove("hidden");
  }

  selectItem(itemId: string): void {
    if (this.gameState !== "UPGRADE") return;
    // itemId is now a tree key like "fireRate", "multiShot", or "turrets"
    const treeKey = itemId as keyof UpgradeTree;
    if (!UPGRADE_CONFIG[treeKey]) return;
    this.applyUpgrade(treeKey);
  }

  applyUpgrade(tree: keyof UpgradeTree): void {
    if (this.upgrades[tree] >= 5) {
      console.log("[applyUpgrade] Tree already maxed:", tree);
      return;
    }

    this.upgrades[tree]++;
    console.log(
      "[applyUpgrade] Upgraded",
      tree,
      "to level",
      this.upgrades[tree],
    );

    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");

    this.destroyedCount = 0;
    this.totalUpgrades++;

    // Reinforced Hull max-HP upgrade triggers immediate HP update
    if (tree === "reinforcedHull") {
      this.applyReinorcedHullMaxHP();
      if (
        this.upgrades.reinforcedHull === 1 ||
        this.upgrades.reinforcedHull === 3 ||
        this.upgrades.reinforcedHull === 5
      ) {
        // Gained +1 max HP; also heal to new max
        this.lives = this.maxLives;
        this.floatingText.add(
          this.playerX,
          this.playerY - 40,
          "+1 MAX HP",
          "#44cc44",
          1.5,
        );
      }
    }

    this.recalculateStats();

    document.getElementById("upgradeScreen")?.classList.add("hidden");

    // Trigger boss every 2 upgrades (up to 6 bosses total)
    // Boss appears after upgrades: 2, 4, 6, 8, 10, 12
    const shouldSpawnBoss =
      this.totalUpgrades % 2 === 0 && this.bossesDefeated < 12;

    if (shouldSpawnBoss) {
      console.log(
        "[applyUpgrade] Triggering boss fight #" +
          (this.bossesDefeated + 1) +
          " after upgrade " +
          this.totalUpgrades,
      );
      this.startBossFight();
    } else {
      this.gameState = "PLAYING";
      this.updateProgressBar();
    }
  }

  estimateExpectedPlayerPower(bossNumber: number): number {
    const totalUpgrades = Math.max(0, (bossNumber - 1) * 2);
    const fireRateLevel = Math.min(5, Math.floor(totalUpgrades / 3) + 1);
    const multiShotLevel = Math.min(5, Math.floor(totalUpgrades / 2));
    const turretLevel = Math.min(
      5,
      Math.floor(Math.max(0, totalUpgrades - 2) / 3),
    );

    const fireRateMult =
      fireRateLevel > 0
        ? UPGRADE_CONFIG.fireRate.levels[fireRateLevel - 1].value
        : 1;
    const shots =
      multiShotLevel > 0
        ? UPGRADE_CONFIG.multiShot.levels[multiShotLevel - 1].value
        : 1;
    const turrets =
      turretLevel > 0
        ? UPGRADE_CONFIG.turrets.levels[turretLevel - 1].value
        : 0;
    const permanentBoost =
      bossNumber <= 6 ? 0 : Math.min(0.45, (bossNumber - 6) * 0.05);

    return (shots * fireRateMult + turrets * 0.42) * (1 + permanentBoost);
  }

  getBossProgressionMultiplier(bossNumber: number): number {
    const expectedPower = this.estimateExpectedPlayerPower(bossNumber);
    const baseRamp = 1 + (bossNumber - 1) * 0.28;
    const powerRamp = 1 + Math.max(0, expectedPower - 1) * 0.2;
    const midStageSoftener =
      bossNumber <= 3 ? 1 : 1 - Math.min(0.18, (bossNumber - 3) * 0.04);
    const lateStageSoftener =
      bossNumber <= 7 ? 1 : 1 - Math.min(0.28, (bossNumber - 7) * 0.05);
    return baseRamp * powerRamp * midStageSoftener * lateStageSoftener;
  }

  startBossFight(forcedBossType?: BossType, forcedBossNumber?: number): void {
    const bossNumber = forcedBossNumber ?? this.bossesDefeated + 1;
    const bossType =
      forcedBossType ??
      BOSS_ORDER[Math.min(this.bossesDefeated, BOSS_ORDER.length - 1)];
    const bossConfig = BOSS_CONFIGS[bossType];
    console.log(
      "[startBossFight] Boss fight #" +
        bossNumber +
        " (" +
        bossConfig.name +
        ") starting!",
    );

    // Clear existing asteroids and boss projectiles for a clean arena
    for (const asteroid of this.asteroids) {
      asteroid.active = false;
      this.asteroidPool.release(asteroid);
    }
    this.asteroids = [];
    this.bossProjectiles = [];
    this.bossMinions = [];
    this.bossAreaEffects = [];

    // Show announcement with boss name
    this.bossAnnouncementTimer = 2.5;
    const announcement = document.getElementById("bossAnnouncement");
    const bossText = announcement?.querySelector(".boss-text");
    if (bossText) {
      bossText.innerHTML =
        bossConfig.name +
        '<br><span style="font-size: 0.5em; font-weight: 400;">' +
        bossConfig.subtitle +
        "</span>";
    }
    if (announcement) {
      announcement.classList.add("active");
    }

    // Scale boss difficulty - base health * config multiplier * progression
    const progressionMult = this.getBossProgressionMultiplier(bossNumber);
    const bossHealth = Math.floor(
      CONFIG.BOSS_HEALTH * bossConfig.healthMult * progressionMult,
    );

    // Create the boss with wave-based attack system
    this.boss = {
      type: bossType,
      x: this.w / 2,
      y: -CONFIG.BOSS_RADIUS,
      vx: 0,
      vy: 0,
      targetY: CONFIG.BOSS_Y_POSITION,
      health: bossHealth,
      maxHealth: bossHealth,
      rotation: 0,
      waveTimer: 2000, // Initial delay before first wave
      attacksRemaining: 0, // No attacks until first wave triggers
      attackTimer: 0,
      totalAttacks: 0,
      active: true,
      entering: true,
      defeated: false,
      pulsePhase: 0,
      movePhase: 0,
      burstCount: 0,
      specialTimer: 0,
      isSpecial: false,
      phase: 1,
      bossNumber: bossNumber,
      specialPhase: 0,
      lineTimer: 10,
    };

    this.gameState = "BOSS";

    this.audio.switchToBossMusic();

    // Intense entrance sequence: initial heavy impact
    this.audio.triggerHaptic("heavy");

    // Follow-up pulses for "thud-thud-thud" effect
    setTimeout(() => this.audio.triggerHaptic("heavy"), 150);
    setTimeout(() => this.audio.triggerHaptic("heavy"), 300);
    this.triggerScreenShake(8);
  }

  updateUpgradeTimer(): void {
    const timerEl = document.getElementById("upgradeTimer");
    if (timerEl) {
      timerEl.textContent = Math.ceil(
        this.upgradeAutoSelectTimer / 1000,
      ).toString();
    }
  }

  updateHUD(): void {
    const mins = Math.floor(this.survivalTime / 60000);
    const secs = Math.floor((this.survivalTime % 60000) / 1000);
    let timeLabel = mins + ":" + secs.toString().padStart(2, "0");
    if (this.boss && this.boss.active) {
      timeLabel += "  B" + this.boss.bossNumber + " P" + this.boss.phase;
    }
    document.getElementById("timeDisplay")!.textContent = timeLabel;
    document.getElementById("coinDisplay")!.textContent = Math.floor(
      this.score,
    ).toString();
    // NOTE: Don't call updateAbilityUI() here - it runs every frame and restarts CSS animations
  }

  getAsteroidsForNextUpgrade(): number {
    return calcAsteroidsForUpgrade(this.totalUpgrades);
  }

  updateProgressBar(): void {
    const required = this.getAsteroidsForNextUpgrade();
    const progress = Math.min(this.destroyedCount / required, 1);
    const progressFill = document.getElementById("progressFill");
    if (progressFill) {
      progressFill.style.width = progress * 100 + "%";
    }
    const progressText = document.getElementById("progressText");
    if (progressText) {
      progressText.textContent = this.destroyedCount + "/" + required;
    }
  }

  recalculateStats(): void {
    console.log(
      "[recalculateStats] Recalculating from upgrade tree:",
      this.upgrades,
    );

    // Fire rate multiplier from upgrade tree
    const fireRateMult =
      this.upgrades.fireRate > 0
        ? UPGRADE_CONFIG.fireRate.levels[this.upgrades.fireRate - 1].value
        : 1;

    // Shot count from upgrade tree
    const shots =
      this.upgrades.multiShot > 0
        ? UPGRADE_CONFIG.multiShot.levels[this.upgrades.multiShot - 1].value
        : 1;

    // Apply ability buffs (turbo abilities)
    let abilityFireRateMult = 1;
    let abilityMoveSpeedMult = 1;
    let abilityDamageMult = 1;
    let abilityExtraShots = 0;

    // Check if turbo ability is active
    const isTurboActive =
      this.currentlyActiveAbility &&
      (this.currentlyActiveAbility.id.startsWith("turbo") ||
        this.currentlyActiveAbility.id === "turbo") &&
      this.abilityDuration > 0;

    if (isTurboActive && this.currentlyActiveAbility) {
      // Use tiered power: tier 1=2x, tier 2=3x, tier 3=4x, etc.
      const power = this.currentlyActiveAbility.power || 1;
      const tier = this.currentlyActiveAbility.tier;
      abilityFireRateMult = power;
      abilityMoveSpeedMult = 1 + (power - 1) * 0.25; // 1.25x, 1.5x, 1.75x, 2x, 2.25x, 2.75x

      // Tier 3+ adds extra bullets
      if (tier >= 3) {
        abilityExtraShots = Math.floor((tier - 2) / 2); // +0, +0, +1, +1, +2, +2
      }

      // Tier 4+ explosive bullets (damage multiplier)
      if (tier >= 4) {
        abilityDamageMult = 1.5 + (tier - 4) * 0.25;
      }
    }

    // Apply permanent stat boost from Tier 6 Eternal Ink
    const permanentMult = 1 + this.permanentStatBoost;

    // Piercing Rounds: adds pierce count per upgrade level
    const piercingBonus =
      this.upgrades.piercingRounds > 0
        ? UPGRADE_CONFIG.piercingRounds.levels[this.upgrades.piercingRounds - 1]
            .value
        : 0;

    // Emergency Shielding: adds to base invincibility time (applied in takeDamage)
    // Stored on currentStats for convenience
    const shieldingBonus =
      this.upgrades.emergencyShielding > 0
        ? UPGRADE_CONFIG.emergencyShielding.levels[
            this.upgrades.emergencyShielding - 1
          ].value
        : 0;

    this.currentStats = {
      damage: BASE_STATS.damage * abilityDamageMult * permanentMult,
      fireRateMs:
        BASE_STATS.fireRateMs /
        (fireRateMult * abilityFireRateMult * permanentMult),
      bulletSpeed: BASE_STATS.bulletSpeed * permanentMult,
      moveSpeed: BASE_STATS.moveSpeed * abilityMoveSpeedMult * permanentMult,
      pierce: BASE_STATS.pierce + Math.floor(piercingBonus),
      shots: shots + abilityExtraShots,
      spread:
        shots + abilityExtraShots > 1
          ? 8 + (shots + abilityExtraShots - 2) * 4
          : 0,
      maxLives: this.maxLives,
      bulletSize: BASE_STATS.bulletSize,
      invincibilityBonus: shieldingBonus,
    };

    // Rebuild turrets based on upgrade
    this.rebuildTurrets();
  }

  /** Apply +max HP bonuses from Reinforced Hull upgrade (called on init and on upgrade). */
  getMaxLivesBonusFromHull(): number {
    const level = this.upgrades.reinforcedHull;
    return (level >= 1 ? 1 : 0) + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
  }

  applyReinorcedHullMaxHP(): void {
    const level = this.upgrades.reinforcedHull;
    // L1 = +1, L3 = +1, L5 = +1 → total bonus = levels with odd index
    const bonusHP =
      (level >= 1 ? 1 : 0) + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
    this.maxLives = BASE_STATS.maxLives + bonusHP;
    // Clamp current lives too
    if (this.lives > this.maxLives) this.lives = this.maxLives;
    this.updateLivesDisplay();
  }

  getRoundClearTimeBonus(): number {
    const elapsed = this.survivalTime - this.roundStartTime;
    // Cap at 5 minutes; 0 ms = 100% bonus, 5 min = 0% bonus, linear
    const maxMs = 5 * 60 * 1000;
    const ratio = Math.max(0, 1 - elapsed / maxMs);
    // Base bonus: 5000 * round, scaled by speed
    const baseBonus = 5000 * this.currentRound;
    return Math.floor(baseBonus * ratio);
  }

  rebuildTurrets(): void {
    const turretCount =
      this.upgrades.turrets > 0
        ? UPGRADE_CONFIG.turrets.levels[this.upgrades.turrets - 1].value
        : 0;

    console.log("[rebuildTurrets] Building", turretCount, "turrets");

    this.drones = [];
    for (let i = 0; i < turretCount; i++) {
      this.drones.push({
        x: this.playerX,
        y: this.playerY,
        targetX: this.playerX,
        targetY: this.playerY,
        wanderTimer: 0,
        fireTimer: randomRange(200, 800),
        facingAngle: -Math.PI / 2,
        active: true,
      });
    }
  }

  updateUpgradeTreeUI(): void {
    const inventory = document.getElementById("itemInventory");
    if (!inventory) return;

    inventory.innerHTML = "";
    const trees = [...PRIMARY_UPGRADE_KEYS, ...SECONDARY_UPGRADE_KEYS];
    for (const tree of trees) {
      const level = this.upgrades[tree];
      if (level === 0) continue;
      const chip = document.createElement("div");
      chip.className = "item-chip";
      const config = UPGRADE_CONFIG[tree];
      chip.textContent = config.name + " Lv" + level;
      inventory.appendChild(chip);
    }
  }

  updateOrbitals(dt: number): void {
    // Orbitals are not used in the simple upgrade system
    // This function is kept for compatibility
    if (this.orbitals.length === 0) return;
    for (const orbital of this.orbitals) {
      const speed = 1.2;
      orbital.angle += dt * speed;
      orbital.x = this.playerX + Math.cos(orbital.angle) * orbital.radius;
      orbital.y = this.playerY + Math.sin(orbital.angle) * orbital.radius;
    }
  }

  drawOrbitals(): void {
    if (this.orbitals.length === 0) return;
    const ctx = this.ctx;
    for (const orbital of this.orbitals) {
      ctx.save();
      ctx.translate(orbital.x, orbital.y);
      if (orbital.type === "shield") {
        ctx.strokeStyle = "#66aaff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (orbital.type === "prism") {
        ctx.strokeStyle = "#cc88ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 6);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#ffd27d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  getAbilityIconSvg(type: string): string {
    const color = "currentColor";
    const strokeWidth = 2;

    if (type === "shield") {
      return `<svg viewBox="0 0 24 24" class="ability-svg">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    } else if (type === "blast") {
      return `<svg viewBox="0 0 24 24" class="ability-svg">
        <path d="M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    } else if (type === "turbo") {
      return `<svg viewBox="0 0 24 24" class="ability-svg">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    return "";
  }

  showAbilityScreen(bossNumber: number = 1): void {
    console.log("[showAbilityScreen] Boss #" + bossNumber + " ability choice");
    this.gameState = "ABILITY_CHOICE";
    this.audio.triggerHaptic("success");

    const tierNames = [
      "",
      "BOSS DEFEATED!",
      "ELITE BOSS DEFEATED!",
      "CHAMPION DEFEATED!",
      "LEGENDARY BOSS DEFEATED!",
      "MYTHIC BOSS DEFEATED!",
      "FINAL CUT SURVIVED!",
      "POINT STORM BROKEN!",
      "NEON FLOOD SURVIVED!",
      "STRAIGHT EDGE SNAPPED!",
      "PERFORATOR DEFEATED!",
      "CLAMPDOWN SHATTERED!",
      "LEAD GRINDER DEFEATED!",
    ];

    const roundPoints = this.score - this.roundStartScore;
    const totalPoints = getLeaderboardTotalScore(this.saveState);
    const availableUltimatePoints = getAvailableUltimatePointsFromProgression(
      this.saveState.progression.highestDefeatedRound,
    );
    const spentUltimatePoints = getSpentUltimatePoints(this.ultimateLevels);
    const remainingUltPoints = availableUltimatePoints - spentUltimatePoints;

    const titleEl = document.querySelector("#abilityScreen .ability-title");
    const subtitleEl = document.querySelector(
      "#abilityScreen .ability-subtitle",
    );
    const pointsEl = document.getElementById("abilityScreenPoints");

    if (titleEl)
      titleEl.textContent = tierNames[bossNumber] || "BOSS DEFEATED!";
    if (subtitleEl)
      subtitleEl.textContent =
        remainingUltPoints > 0
          ? "Choose an Ultimate Ability to upgrade"
          : "All Ultimate Abilities maxed!";
    if (pointsEl) {
      pointsEl.textContent =
        "Round: " + roundPoints + "  |  Total: " + totalPoints;
    }

    // Render ABILITY_FAMILIES as cards
    const container = document.getElementById("abilityCardsContainer");
    if (container) {
      container.innerHTML = "";
      for (const family of ABILITY_FAMILIES) {
        const currentLevel = this.ultimateLevels[family.id];
        const nextLevel = currentLevel + 1;
        const isMaxed = currentLevel >= ULTIMATE_MAX_LEVEL;
        const canAfford = remainingUltPoints > 0;

        const card = document.createElement("div");
        card.className =
          "ability-card" +
          (isMaxed ? " maxed" : "") +
          (!canAfford && !isMaxed ? " locked" : "");
        card.setAttribute("data-family", family.id);

        const nextDesc = isMaxed
          ? "Maxed out!"
          : getUltimateLevelDescription(family.id, nextLevel);
        const currentDesc =
          currentLevel > 0
            ? "Current: " + getUltimateLevelDescription(family.id, currentLevel)
            : "Not yet unlocked";

        card.innerHTML =
          "<div class='ability-card-icon'>" +
          this.getAbilityIconSvg(family.icon) +
          "</div>" +
          "<div class='ability-card-title'>" +
          family.name +
          " Lv" +
          currentLevel +
          (isMaxed ? " (MAX)" : "") +
          "</div>" +
          "<div class='ability-card-desc'>" +
          (isMaxed ? currentDesc : nextDesc) +
          "</div>" +
          "<div class='ability-card-charges'>LEVEL " +
          currentLevel +
          " → " +
          (isMaxed ? "MAX" : String(nextLevel)) +
          "</div>";

        if (!isMaxed && canAfford) {
          card.addEventListener("click", () => {
            this.selectUltimateAbility(family.id);
          });
        }
        container.appendChild(card);
      }
    }

    document.getElementById("abilityScreen")?.classList.remove("hidden");
  }

  selectUltimateAbility(family: AbilityFamily): void {
    const currentLevel = this.ultimateLevels[family];
    if (currentLevel >= ULTIMATE_MAX_LEVEL) return;

    this.ultimateLevels[family] = currentLevel + 1;
    console.log(
      "[selectUltimateAbility]",
      family,
      "→ level",
      this.ultimateLevels[family],
    );
    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");

    document.getElementById("abilityScreen")?.classList.add("hidden");
    this.bossRewardPending = false;
    this.gameState = "PLAYING";
    this.destroyedCount = 0;
    this.updateProgressBar();
    this.updateAbilityUI();
  }

  selectAbility(abilityId: string): void {
    console.log("[selectAbility]", abilityId);

    // Find ability in the current choices (tiered abilities)
    const ability = this.abilityChoices.find((a) => a.id === abilityId);
    if (!ability) return;

    // Check if we already have this ability ID to stack charges
    const existing = this.activeAbilities.find((a) => a.id === ability.id);

    if (existing) {
      existing.charges += ability.charges;
      console.log(
        "[selectAbility] Added " +
          ability.charges +
          " charges to existing slot, total: " +
          existing.charges,
      );

      this.floatingText.add(
        this.playerX,
        this.playerY - 80,
        "+" + ability.charges + " CHARGES!",
        "#44ff44",
        2,
      );
    } else {
      // Add as a new stackable ability
      const newAbility: StoredAbility = {
        ...ability,
        instanceId: Date.now() + Math.random(),
      };
      this.activeAbilities.push(newAbility);

      this.floatingText.add(
        this.playerX,
        this.playerY - 80,
        ability.name.toUpperCase() + "!",
        "#ff4444",
        2,
      );
    }

    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");

    document.getElementById("abilityScreen")?.classList.add("hidden");

    this.gameState = "PLAYING";
    this.destroyedCount = 0; // Reset for next upgrade round
    this.updateProgressBar();
    this.updateAbilityUI();
  }

  triggerAbility(instanceId?: number): void {
    if (
      this.activeAbilities.length === 0 ||
      (this.gameState !== "PLAYING" && this.gameState !== "BOSS")
    )
      return;

    // Find the ability to trigger
    const index = instanceId
      ? this.activeAbilities.findIndex((a) => a.instanceId === instanceId)
      : 0; // Default to first one if no ID provided

    if (index === -1) return;

    const ability = this.activeAbilities[index];
    if (ability.charges <= 0) return;

    // If a timed ability is already active, don't allow triggering another of same type
    // (Actually, maybe we do allow stacking duration? Let's keep it simple for now)

    console.log("[triggerAbility]", ability.id, "tier:", ability.tier);
    ability.charges--;

    // If charges run out, we'll remove it after duration ends if it's a timed one,
    // or immediately if it's an instant one like blast.

    this.audio.triggerHaptic("heavy");
    this.triggerScreenShake(12 + ability.tier * 2);

    // Determine ability type from ID
    const getAbilityType = (id: string): string => {
      if (id.startsWith("shield") || id === "invincibility") return "shield";
      if (id.startsWith("blast") || id === "destruction") return "blast";
      return "turbo";
    };

    const abilityType = getAbilityType(ability.id);
    const tier = ability.tier;
    const power = ability.power || 1;
    const duration = ability.duration || 5;

    // Get ability name for display
    const abilityNames: Record<string, string> = {
      shield:
        [
          "Paper Shield",
          "Reinforced Paper",
          "Steel Origami",
          "Diamond Fold",
          "Origami Fortress",
          "Paper God",
          "Notebook Aegis",
          "Page Guardian",
          "Binder Guard",
          "Razor Fold",
          "Archive Halo",
          "Final Fold",
        ][tier - 1] || "Shield",
      blast:
        [
          "Eraser Blast",
          "Eraser Storm",
          "Nuclear Eraser",
          "Black Hole",
          "Eraser Apocalypse",
          "Reality Eraser",
          "Margin Wipe",
          "Desk Clear",
          "Perforation Wave",
          "Crossout Cataclysm",
          "Paper Eclipse",
          "Notebook Nova",
        ][tier - 1] || "Blast",
      turbo:
        [
          "Ink Overdrive",
          "Pencil Fury",
          "Graphite Rush",
          "Ink Explosion",
          "Rainbow Ink",
          "Eternal Ink",
          "Lead Surge",
          "Ink Hurricane",
          "Graphite Gale",
          "Neon Draft",
          "Shaving Storm",
          "Infinite Draft",
        ][tier - 1] || "Overdrive",
    };

    this.floatingText.add(
      this.playerX,
      this.playerY - 100,
      abilityNames[abilityType].toUpperCase() + "!",
      "#ff4444",
      2.5,
    );

    if (abilityType === "shield") {
      this.isInvincible = true;
      this.abilityDuration = duration;
      this.damageTimer = duration;
      this.currentlyActiveAbility = ability;

      if (tier >= 3) {
        this.floatingText.add(
          this.playerX,
          this.playerY - 60,
          "SHIELD UP!",
          "#44ff44",
          1.5,
        );
      }
    } else if (abilityType === "blast") {
      let destroyedCount = 0;
      this.asteroids.forEach((a) => {
        if (a.active) {
          this.particles.emit(
            a.x,
            a.y,
            CONFIG.PENCIL_DARK,
            10 + tier * 3,
            "explosion",
          );
          a.active = false;
          this.score += 50 + tier * 25;
          destroyedCount++;
        }
      });

      if (this.boss && this.boss.active && power > 1) {
        const bossDamage = Math.ceil(power);
        this.boss.health -= bossDamage;
        this.boss.health = Math.max(0, this.boss.health);
        this.floatingText.add(
          this.boss.x,
          this.boss.y,
          "-" + bossDamage + " BOSS!",
          "#ff6644",
          2,
        );
        this.particles.emit(
          this.boss.x,
          this.boss.y,
          "#ff4444",
          15 + tier * 5,
          "explosion",
        );

        if (this.boss.health <= 0) {
          this.defeatBoss();
        }
      }

      if (tier >= 6) {
        this.triggerScreenShake(25);
      }

      this.audio.playExplosion();

      // If no charges left, remove it
      if (ability.charges <= 0) {
        this.activeAbilities.splice(index, 1);
      }
    } else if (abilityType === "turbo") {
      this.abilityDuration = duration;
      this.currentlyActiveAbility = ability;

      if (tier >= 6 && this.permanentStatBoost < 0.25) {
        this.permanentStatBoost += 0.25;
        this.floatingText.add(
          this.playerX,
          this.playerY - 60,
          "+25% PERMANENT!",
          "#ffcc00",
          2,
        );
      }

      this.recalculateStats();
    }

    this.updateAbilityUI();
  }

  triggerUltimateAbility(family: AbilityFamily): void {
    if (this.usedUltimatesThisRound.has(family)) return;
    if (this.usedUltimatesThisRound.size >= ULTIMATE_MAX_PER_ROUND) return;
    if (this.gameState !== "PLAYING" && this.gameState !== "BOSS") return;

    const level = this.ultimateLevels[family];
    if (level <= 0) return;

    const value = getUltimateValue(family, level);
    this.usedUltimatesThisRound.add(family);

    console.log(
      "[triggerUltimateAbility]",
      family,
      "level",
      level,
      "value",
      value,
    );
    this.audio.triggerHaptic("heavy");
    this.triggerScreenShake(10);

    if (family === "shield") {
      this.isInvincible = true;
      this.damageTimer = value;
      this.damageFlashTimer = 0;
      this.floatingText.add(
        this.playerX,
        this.playerY - 50,
        "SHIELD " + value + "s!",
        "#00ccff",
        1.5,
      );
      this.currentlyActiveAbility = {
        id: "shield",
        name: "Paper Shield",
        description: "",
        icon: "shield",
        tier: level,
        power: 1,
        duration: value,
        charges: 1,
        instanceId: Date.now(),
      };
      this.abilityDuration = value;
    } else if (family === "blast") {
      // Blast all nearby enemies
      const radius = 150 + level * 50;
      for (const a of this.asteroids) {
        const dx = a.x - this.playerX;
        const dy = a.y - this.playerY;
        if (Math.sqrt(dx * dx + dy * dy) < radius) {
          a.health -= level * 3;
          if (a.health <= 0) a.active = false;
        }
      }
      if (this.boss) {
        const dx = this.boss.x - this.playerX;
        const dy = this.boss.y - this.playerY;
        if (Math.sqrt(dx * dx + dy * dy) < radius * 1.5) {
          this.boss.health -= Math.ceil(level * 5);
          this.boss.health = Math.max(0, this.boss.health);
        }
      }
      this.particles.emit(
        this.playerX,
        this.playerY,
        "#330033",
        30 + level * 10,
        "explosion",
      );
      this.floatingText.add(
        this.playerX,
        this.playerY - 50,
        "INK EXPLOSION!",
        "#9944cc",
        1.5,
      );
    } else if (family === "turbo") {
      // Pull enemies toward player for `value` seconds
      this.floatingText.add(
        this.playerX,
        this.playerY - 50,
        "BLACK HOLE " + value + "s!",
        "#222266",
        1.5,
      );
      this.currentlyActiveAbility = {
        id: "turbo",
        name: "Black Hole",
        description: "",
        icon: "turbo",
        tier: level,
        power: value,
        duration: value,
        charges: 1,
        instanceId: Date.now(),
      };
      this.abilityDuration = value;
    }

    this.updateAbilityUI();
  }

  deactivateAbility(): void {
    if (!this.currentlyActiveAbility) return;

    console.log("[deactivateAbility]", this.currentlyActiveAbility.id);

    const id = this.currentlyActiveAbility.id;
    const abilityType =
      id.startsWith("shield") || id === "invincibility"
        ? "shield"
        : id.startsWith("blast") || id === "destruction"
          ? "blast"
          : "turbo";

    if (abilityType === "shield") {
      this.isInvincible = false;
      this.damageTimer = 0;
    } else if (abilityType === "turbo") {
      this.recalculateStats();
    }

    // If no charges left, remove it from activeAbilities
    if (this.currentlyActiveAbility.charges <= 0) {
      const index = this.activeAbilities.findIndex(
        (a) => a.instanceId === this.currentlyActiveAbility!.instanceId,
      );
      if (index !== -1) {
        this.activeAbilities.splice(index, 1);
      }
    }

    this.currentlyActiveAbility = null;
    this.abilityDuration = 0;
    this.updateAbilityUI();
  }

  updateAbilities(dt: number): void {
    if (this.abilityDuration > 0) {
      this.abilityDuration -= dt;

      // Update timer display without recreating DOM
      const timerEl = document.querySelector(".ability-slot.active .timer");
      if (timerEl) {
        timerEl.textContent = Math.ceil(this.abilityDuration) + "s";
      }

      if (this.abilityDuration <= 0) {
        this.deactivateAbility();
      }
    }
  }

  updateAbilityUI(): void {
    const container = document.getElementById("abilitySlots");
    if (!container) return;

    container.innerHTML = "";

    // Hide slots entirely on start screen
    if (this.gameState === "START") {
      container.style.display = "none";
      return;
    }
    container.style.display = "";

    // Render ultimate ability families that are unlocked
    const unlockedFamilies = getUnlockedFamilies(this.ultimateLevels);
    unlockedFamilies.forEach((familyId) => {
      const def = ABILITY_FAMILIES.find((f) => f.id === familyId);
      if (!def) return;

      const level = this.ultimateLevels[familyId];
      const used = this.usedUltimatesThisRound.has(familyId);

      const slot = document.createElement("div");
      slot.className = "ability-slot" + (used ? " cooldown" : "");

      const isActive =
        this.currentlyActiveAbility?.id === familyId &&
        this.abilityDuration > 0;
      if (isActive) slot.classList.add("active");

      const timerHtml =
        isActive && this.abilityDuration > 0
          ? `<div class="timer">${Math.ceil(this.abilityDuration)}s</div>`
          : "";

      slot.innerHTML = `
        <div class="icon">${this.getAbilityIconSvg(def.icon)}</div>
        <div class="label">${def.name.split(" ")[0]}</div>
        ${!used ? `<div class="ability-indicator">Lv${level}</div>` : ""}
        ${timerHtml}
      `;

      slot.addEventListener("click", () => {
        if (this.gameState === "PLAYING" || this.gameState === "BOSS") {
          this.triggerUltimateAbility(familyId);
        }
      });

      container.appendChild(slot);
    });
  }

  updateLivesDisplay(): void {
    const livesContainer = document.getElementById("livesDisplay");
    if (!livesContainer) return;

    livesContainer.innerHTML = "";
    for (let i = 0; i < this.maxLives; i++) {
      const heart = document.createElement("span");
      heart.className = "life-heart" + (i < this.lives ? " filled" : " empty");
      heart.innerHTML = "&#9829;"; // Heart symbol
      livesContainer.appendChild(heart);
    }
  }

  triggerDamageEffect(): void {
    console.log("[triggerDamageEffect] Starting damage animation");

    // Start invincibility period
    this.isInvincible = true;
    this.damageTimer = 1.5 + (this.currentStats.invincibilityBonus ?? 0);
    this.damageFlashTimer = 0;
    // Reset reinforced hull regen timer on taking damage
    this.reinforcedHullRegenTimer = 0;

    // Show damage overlay
    const overlay = document.getElementById("damageOverlay");
    if (overlay) {
      overlay.classList.add("active");
      setTimeout(() => {
        overlay.classList.remove("active");
      }, 300);
    }

    // Update lives display
    this.updateLivesDisplay();

    // Haptic feedback
    this.audio.triggerHaptic("error");

    // Screen shake
    this.triggerScreenShake(8);

    this.eventBus.emit("ON_DAMAGE", { lives: this.lives });
  }

  updateReinforcedHullRegen(dt: number): void {
    if (this.upgrades.reinforcedHull < 2) return; // L2 or higher needed for regen
    if (this.lives >= this.maxLives) {
      this.reinforcedHullRegenTimer = 0;
      return;
    }
    const regenIntervalSec = this.upgrades.reinforcedHull >= 4 ? 8 : 15;
    this.reinforcedHullRegenTimer += dt;
    if (this.reinforcedHullRegenTimer >= regenIntervalSec) {
      this.reinforcedHullRegenTimer = 0;
      this.lives = Math.min(this.lives + 1, this.maxLives);
      this.updateLivesDisplay();
      this.floatingText.add(
        this.playerX,
        this.playerY - 30,
        "+1 HP",
        "#44cc44",
        1.2,
      );
    }
  }

  updateDamageState(dt: number): void {
    if (!this.isInvincible) return;

    this.damageTimer -= dt;
    this.damageFlashTimer += dt * 12; // Controls blink speed

    if (this.damageTimer <= 0) {
      this.isInvincible = false;
      this.damageTimer = 0;
      this.damageFlashTimer = 0;
    }
  }

  triggerScreenShake(intensity: number): void {
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity,
    );
  }

  // ============= GAME LOGIC =============

  updatePlayer(dt: number): void {
    const marginX = CONFIG.PLAYER_WIDTH / 2 + 10;
    const marginTopY = 100; // Keep plane away from top HUD
    const marginBottomY = 60; // Keep plane away from bottom
    const moveSpeed = this.currentStats.moveSpeed;
    const prevX = this.playerX;
    const prevY = this.playerY;

    // Desktop: plane follows mouse cursor automatically
    if (!this.isMobile && this.mouseX !== null && this.mouseY !== null) {
      // Small offset so plane appears slightly above cursor
      const offsetY = 30;
      this.targetX = this.mouseX;
      this.targetY = this.mouseY - offsetY;
    }
    // Mobile: plane follows finger when dragging
    else if (
      this.isMobile &&
      this.isDragging &&
      this.touchX !== null &&
      this.touchY !== null
    ) {
      // Larger offset for touch so finger doesn't cover plane
      const offsetY = 80;
      this.targetX = this.touchX;
      this.targetY = this.touchY - offsetY;
    }
    // Keyboard fallback (when mouse not available or on mobile without touch)
    else if (!this.isMobile && this.mouseX === null) {
      // Keyboard controls for X movement only
      if (
        this.keysDown.has("ArrowLeft") ||
        this.keysDown.has("a") ||
        this.keysDown.has("A")
      ) {
        this.targetX = this.playerX - moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowRight") ||
        this.keysDown.has("d") ||
        this.keysDown.has("D")
      ) {
        this.targetX = this.playerX + moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowUp") ||
        this.keysDown.has("w") ||
        this.keysDown.has("W")
      ) {
        this.targetY = this.playerY - moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowDown") ||
        this.keysDown.has("s") ||
        this.keysDown.has("S")
      ) {
        this.targetY = this.playerY + moveSpeed * dt * 60;
      }
    }

    // Clamp targets
    this.targetX = clamp(this.targetX, marginX, this.w - marginX);
    this.targetY = clamp(this.targetY, marginTopY, this.h - marginBottomY);

    const prevX_juice = this.playerX;

    // Apply plane quirks for movement
    if (this.selectedPlane === "glider") {
      // Momentum/drift - slow response in both axes
      this.playerVelocityX = lerp(
        this.playerVelocityX,
        this.targetX - this.playerX,
        0.12,
      );
      this.playerVelocityY = lerp(
        this.playerVelocityY,
        this.targetY - this.playerY,
        0.12,
      );
      this.playerX += this.playerVelocityX;
      this.playerY += this.playerVelocityY;
    } else {
      // Dart and Bomber - responsive follow
      const lerpFactor = this.mouseX !== null || this.isDragging ? 0.25 : 0.3;
      this.playerX = lerp(this.playerX, this.targetX, lerpFactor);
      this.playerY = lerp(this.playerY, this.targetY, lerpFactor);
    }

    // Visual Juice: Tilt and scale
    const dx = this.playerX - prevX_juice;
    this.playerTilt = lerp(this.playerTilt, clamp(dx * 0.05, -0.4, 0.4), 0.1);
    this.playerScaleX = lerp(this.playerScaleX, 1, 0.15);
    this.playerScaleY = lerp(this.playerScaleY, 1, 0.15);

    // Clamp final position
    this.playerX = clamp(this.playerX, marginX, this.w - marginX);
    this.playerY = clamp(this.playerY, marginTopY, this.h - marginBottomY);

    // Update velocity based on actual movement
    this.playerVelocityX = this.playerX - prevX;
    this.playerVelocityY = this.playerY - prevY;

    const moveSpeedNow = Math.hypot(this.playerVelocityX, this.playerVelocityY);
    if (moveSpeedNow > 0.5) {
      this.eventBus.emit("ON_MOVE", { speed: moveSpeedNow });
    }

    // Detect large horizontal movement for barrel roll
    const horizontalDelta = this.playerX - this.lastPlayerX;
    const spinThreshold = 8; // Pixels per frame to trigger spin

    if (this.spinDirection === 0 && Math.abs(horizontalDelta) > spinThreshold) {
      // Trigger a spin in the direction of movement
      this.spinDirection = horizontalDelta > 0 ? 1 : -1;
      this.spinAngle = 0;
      this.audio.triggerHaptic("medium");
    }

    // Update spin animation
    if (this.spinDirection !== 0) {
      this.spinAngle += this.spinDirection * 0.35 * dt * 60; // Spin speed

      // Complete the spin (full 360 degrees = 2*PI)
      if (Math.abs(this.spinAngle) >= Math.PI * 2) {
        this.spinAngle = 0;
        this.spinDirection = 0;
      }
    }

    this.lastPlayerX = this.playerX;
  }

  fireBullets(): void {
    // Visual Juice: Firing squish
    this.playerScaleY = 0.85;
    this.playerScaleX = 1.15;

    const stats = this.currentStats;
    const bulletCount = stats.shots;
    const spread = stats.spread;

    const baseAngle = -Math.PI / 2;
    const startAngle = baseAngle - ((spread / 2) * Math.PI) / 180;
    const angleStep =
      bulletCount > 1 ? (spread * Math.PI) / 180 / (bulletCount - 1) : 0;

    for (let i = 0; i < bulletCount; i++) {
      let angle = bulletCount === 1 ? baseAngle : startAngle + angleStep * i;

      // Bomber quirk: slight spread
      if (this.selectedPlane === "bomber") {
        angle += ((Math.random() - 0.5) * 4 * Math.PI) / 180;
      }

      this.spawnBullet(angle, stats);
    }

    this.audio.playShoot();
    this.eventBus.emit("ON_FIRE", { stats: this.currentStats });
  }

  getShotOrigin(): { x: number; y: number } {
    return { x: this.playerX, y: this.playerY - CONFIG.PLAYER_HEIGHT / 2 };
  }

  spawnBullet(
    angle: number,
    stats: PlayerStats,
    fromDrone: boolean = false,
  ): Bullet {
    const origin = this.getShotOrigin();
    const bullet = this.bulletPool.acquire();
    bullet.x = origin.x;
    bullet.y = origin.y;
    bullet.vx = Math.cos(angle) * stats.bulletSpeed;
    bullet.vy = Math.sin(angle) * stats.bulletSpeed;
    bullet.damage = stats.damage;
    bullet.pierceRemaining = stats.pierce;
    bullet.explosive = false;
    bullet.chainLightning = false;
    bullet.active = true;
    bullet.fromDrone = fromDrone;
    bullet.age = 0;
    bullet.maxAge = 3.2;
    bullet.size = stats.bulletSize;
    bullet.color = CONFIG.PENCIL_DARK;
    bullet.shape = "line";
    bullet.wobblePhase = Math.random() * Math.PI * 2;
    bullet.bounceRemaining = 0;
    bullet.loop = false;
    bullet.homingStrength = 0;
    bullet.snowball = false;
    bullet.snowballMax = 1;
    bullet.sticky = false;
    bullet.stuckToId = -1;
    bullet.drag = 0;
    bullet.acceleration = 0;
    bullet.gravity = 0;
    bullet.splitOnHit = 0;
    bullet.trailTimer = 0;
    bullet.jitterOffset = randomRange(-1.5, 1.5);
    bullet.prismSplit = false;

    this.bullets.push(bullet);
    return bullet;
  }

  updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b.active) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
        continue;
      }
      b.age += dt;

      if (b.age > b.maxAge) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
        continue;
      }

      // Sticky bullets latch to a target
      if (b.sticky && b.stuckToId >= 0) {
        const target = this.asteroids.find((a) => a.id === b.stuckToId);
        if (!target) {
          this.bulletPool.release(b);
          this.bullets.splice(i, 1);
          continue;
        }
        b.x = target.x + b.stuckOffsetX;
        b.y = target.y + b.stuckOffsetY;
        b.trailTimer += dt;
        if (b.trailTimer >= 0.35) {
          b.trailTimer = 0;
          target.health -= b.damage * 0.35;
          target.hitFlash = 0.2;
          if (target.health <= 0) {
            this.handleAsteroidDestroyed(target);
          }
        }
        continue;
      }

      if (b.snowball) {
        const grow = 1 + Math.min(1, b.age / 1.2) * (b.snowballMax - 1);
        b.size = this.currentStats.bulletSize * grow;
      }

      if (b.homingStrength > 0 && this.asteroids.length > 0) {
        const target = this.findNearestAsteroid(b.x, b.y, 400);
        if (target) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const steer = b.homingStrength * dt * 60;
          b.vx = lerp(b.vx, (dx / dist) * this.currentStats.bulletSpeed, steer);
          b.vy = lerp(b.vy, (dy / dist) * this.currentStats.bulletSpeed, steer);
        }
      }

      if (b.acceleration > 0) {
        const angle = Math.atan2(b.vy, b.vx);
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const newSpeed = speed * (1 + b.acceleration * dt * 60);
        b.vx = Math.cos(angle) * newSpeed;
        b.vy = Math.sin(angle) * newSpeed;
      }

      if (b.drag > 0) {
        const dragFactor = Math.max(0, 1 - b.drag * dt * 60);
        b.vx *= dragFactor;
        b.vy *= dragFactor;
      }

      if (b.gravity > 0) {
        b.vy += b.gravity * dt * 60;
      }

      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;

      // Wrap or remove
      if (b.loop) {
        if (b.x < -30) b.x = this.w + 30;
        if (b.x > this.w + 30) b.x = -30;
        if (b.y < -30) b.y = this.h + 30;
        if (b.y > this.h + 30) b.y = -30;
      } else if (
        b.y < -80 ||
        b.y > this.h + 80 ||
        b.x < -80 ||
        b.x > this.w + 80
      ) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
      }
    }
  }

  findNearestAsteroid(x: number, y: number, maxDist: number): Asteroid | null {
    let nearest: Asteroid | null = null;
    let nearestDist = maxDist;
    for (const a of this.asteroids) {
      if (!a.active) continue;
      const dist = distance(x, y, a.x, a.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = a;
      }
    }
    return nearest;
  }

  handleAsteroidDestroyed(asteroid: Asteroid, sourceBullet?: Bullet): void {
    if (!asteroid.active) return;
    asteroid.active = false;

    const config = CONFIG.ASTEROID_SIZES[asteroid.size];
    const coins = config.coins;
    this.eventBus.emit("ASTEROID_DESTROYED", { asteroid, coins });
    this.eventBus.emit("ON_KILL", { asteroid, sourceBullet });

    if (!asteroid.isBossAsteroid) {
      this.splitAsteroid(asteroid);
    }

    if (sourceBullet?.explosive) {
      this.handleExplosion(asteroid.x, asteroid.y, 2, 80);
    }

    if (sourceBullet?.chainLightning) {
      this.handleChainLightning(asteroid.x, asteroid.y, 3, 2);
    }

    this.asteroidPool.release(asteroid);
    this.asteroids = this.asteroids.filter((a) => a.id !== asteroid.id);
  }

  spawnAsteroid(
    size?: AsteroidSize,
    x?: number,
    y?: number,
    vx?: number,
    vy?: number,
  ): void {
    // Determine size based on difficulty
    // Early game: mostly small (60%), some medium (30%), few large (10%)
    // Late game (after ~3 min): more large (35%), medium (35%), small (30%)
    if (!size) {
      const timeMinutes = this.survivalTime / 60000;
      // Higher base ratios for larger asteroids, increased slightly after each boss
      const bossBonus = this.bossesDefeated * 0.05;
      const largeRatio = Math.min(0.55, 0.2 + timeMinutes * 0.05 + bossBonus);
      const mediumRatio = Math.min(0.4, 0.35 + timeMinutes * 0.02);
      const roll = Math.random();
      if (roll < largeRatio) size = "large";
      else if (roll < largeRatio + mediumRatio) size = "medium";
      else size = "small";
    }

    const config = CONFIG.ASTEROID_SIZES[size];
    const asteroid = this.asteroidPool.acquire();

    asteroid.id = ++this.asteroidIdCounter;
    asteroid.size = size;
    asteroid.maxHealth = config.health + this.healthBonus;
    asteroid.health = asteroid.maxHealth;
    asteroid.x =
      x ?? randomRange(config.radius * 0.5, this.w - config.radius * 0.5);
    asteroid.y = y ?? -config.radius - 10;
    asteroid.vx = vx ?? randomRange(-1.5, 1.5);
    asteroid.vy = vy ?? config.speed * this.speedMultiplier;
    asteroid.rotation = Math.random() * Math.PI * 2;
    asteroid.rotationSpeed = (Math.random() - 0.5) * 0.03;
    asteroid.active = true;
    asteroid.hitFlash = 0;
    asteroid.isBossAsteroid = false;

    this.asteroids.push(asteroid);
  }

  updateAsteroids(dt: number): void {
    const blackHoleActive =
      this.currentlyActiveAbility?.id === "turbo" && this.abilityDuration > 0;
    const pullStrength = blackHoleActive
      ? (this.currentlyActiveAbility?.power ?? 1) * 60
      : 0;

    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];

      // Black hole pull
      if (pullStrength > 0) {
        const dx = this.playerX - a.x;
        const dy = this.playerY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        a.vx += (dx / dist) * pullStrength * dt;
        a.vy += (dy / dist) * pullStrength * dt;
      }

      a.x += a.vx * dt * 60;
      a.y += a.vy * dt * 60;
      a.rotation += a.rotationSpeed * dt * 60;

      // Apply gentle gravity to pull asteroids back down
      const minSpeed = CONFIG.ASTEROID_SIZES[a.size].speed * 0.5;
      if (a.vy < minSpeed) {
        a.vy += 0.08 * dt * 60; // Gravity pulls them down
      }

      if (a.hitFlash > 0) {
        a.hitFlash -= dt;
      }

      const config = CONFIG.ASTEROID_SIZES[a.size];

      // Bounce off left and right walls (at actual screen edge)
      if (a.x < 0) {
        a.x = 0;
        a.vx = Math.abs(a.vx) * 0.9;
      } else if (a.x > this.w) {
        a.x = this.w;
        a.vx = -Math.abs(a.vx) * 0.9;
      }

      // Remove if off bottom
      if (a.y > this.h + config.radius + 50) {
        this.asteroidPool.release(a);
        this.asteroids.splice(i, 1);
      }
    }
  }

  updateDrones(dt: number): void {
    if (this.drones.length === 0) return;

    const fireInterval = this.currentStats.fireRateMs * 1.6;
    const droneDamage = 1;
    const smartTarget = true;
    const canIntercept = false; // No shield buddies in simple upgrade system
    const dronePierce = this.currentStats.pierce > 0 ? 1 : 0;

    const maxDistFromPlayer = CONFIG.DRONE_ORBIT_RADIUS * 1.5;
    const minDistFromPlayer = 25;

    for (const drone of this.drones) {
      // Autonomous wandering behavior
      drone.wanderTimer -= dt * 1000;
      if (drone.wanderTimer <= 0) {
        // Pick a new target position near the player
        const wanderRadius = CONFIG.DRONE_ORBIT_RADIUS * 0.8;
        const angle = Math.random() * Math.PI * 2;
        drone.targetX =
          this.playerX + Math.cos(angle) * (20 + Math.random() * wanderRadius);
        drone.targetY =
          this.playerY + Math.sin(angle) * (20 + Math.random() * wanderRadius);
        drone.wanderTimer = 400 + Math.random() * 600;
      }

      // Keep target anchored relative to player movement
      const distToPlayer = distance(
        drone.targetX,
        drone.targetY,
        this.playerX,
        this.playerY,
      );
      if (distToPlayer > maxDistFromPlayer) {
        // Pull target back toward player
        const pullAngle = Math.atan2(
          this.playerY - drone.targetY,
          this.playerX - drone.targetX,
        );
        drone.targetX +=
          Math.cos(pullAngle) * (distToPlayer - maxDistFromPlayer);
        drone.targetY +=
          Math.sin(pullAngle) * (distToPlayer - maxDistFromPlayer);
      }

      // Smoothly move toward target
      drone.x = lerp(drone.x, drone.targetX, 0.08);
      drone.y = lerp(drone.y, drone.targetY, 0.08);

      // Ensure drone stays close to player (hard constraint)
      const actualDistToPlayer = distance(
        drone.x,
        drone.y,
        this.playerX,
        this.playerY,
      );
      if (actualDistToPlayer > maxDistFromPlayer) {
        const pullAngle = Math.atan2(
          this.playerY - drone.y,
          this.playerX - drone.x,
        );
        drone.x = this.playerX - Math.cos(pullAngle) * maxDistFromPlayer;
        drone.y = this.playerY - Math.sin(pullAngle) * maxDistFromPlayer;
      } else if (actualDistToPlayer < minDistFromPlayer) {
        const pushAngle = Math.atan2(
          drone.y - this.playerY,
          drone.x - this.playerX,
        );
        drone.x = this.playerX + Math.cos(pushAngle) * minDistFromPlayer;
        drone.y = this.playerY + Math.sin(pushAngle) * minDistFromPlayer;
      }

      // Find target to face (always, not just when firing)
      // Target can be an asteroid OR the boss
      let target: { x: number; y: number; health: number } | null = null;
      let bestScore = -Infinity;

      // Check asteroids
      for (const a of this.asteroids) {
        const dist = distance(drone.x, drone.y, a.x, a.y);
        // Prefer closer targets, but smart targeting prefers high health
        let score = -dist;
        if (smartTarget && a.health >= 4) score += 200;
        if (canIntercept && a.y > this.playerY - 100) score += 300; // Prioritize close threats

        if (score > bestScore) {
          bestScore = score;
          target = a;
        }
      }

      // Check boss - prioritize boss when in boss fight
      if (this.boss && this.boss.active && this.gameState === "BOSS") {
        const dist = distance(drone.x, drone.y, this.boss.x, this.boss.y);
        // Boss gets high priority score
        const bossScore = -dist + 500; // Prioritize boss over asteroids
        if (bossScore > bestScore) {
          bestScore = bossScore;
          target = this.boss;
        }
      }

      // Rotate to face target (or default to facing up)
      if (target) {
        const targetAngle = Math.atan2(target.y - drone.y, target.x - drone.x);
        // Smoothly rotate toward target
        let angleDiff = targetAngle - drone.facingAngle;
        // Normalize angle difference to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        drone.facingAngle += angleDiff * 0.15; // Smooth rotation
      } else {
        // No target, face upward
        let angleDiff = -Math.PI / 2 - drone.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        drone.facingAngle += angleDiff * 0.1;
      }

      // Fire at asteroids
      drone.fireTimer -= dt * 1000;
      if (drone.fireTimer <= 0 && target) {
        const bullet = this.bulletPool.acquire();
        bullet.x = drone.x;
        bullet.y = drone.y;
        bullet.vx =
          Math.cos(drone.facingAngle) * this.currentStats.bulletSpeed * 0.8;
        bullet.vy =
          Math.sin(drone.facingAngle) * this.currentStats.bulletSpeed * 0.8;
        bullet.damage = droneDamage;
        bullet.pierceRemaining = dronePierce;
        bullet.explosive = false;
        bullet.chainLightning = false;
        bullet.active = true;
        bullet.fromDrone = true;
        bullet.age = 0;
        bullet.maxAge = 2.2;
        bullet.size = this.currentStats.bulletSize * 0.8;
        bullet.color = CONFIG.PENCIL_DARK;
        bullet.shape = "line";
        bullet.wobblePhase = Math.random() * Math.PI * 2;
        bullet.bounceRemaining = 0;
        bullet.loop = false;
        bullet.homingStrength = 0;
        bullet.snowball = false;
        bullet.snowballMax = 1;
        bullet.sticky = false;
        bullet.stuckToId = -1;
        bullet.drag = 0;
        bullet.acceleration = 0;
        bullet.gravity = 0;
        bullet.splitOnHit = 0;
        bullet.trailTimer = 0;
        bullet.jitterOffset = randomRange(-1, 1);
        bullet.prismSplit = false;

        this.bullets.push(bullet);
        drone.fireTimer = fireInterval;
      } else if (drone.fireTimer <= 0) {
        // No target, still reset timer
        drone.fireTimer = fireInterval;
      }
    }
  }

  checkCollisions(): void {
    // Bullets vs Asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (!b.active) continue;

      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (!a.active) continue;

        const config = CONFIG.ASTEROID_SIZES[a.size];
        const dist = distance(b.x, b.y, a.x, a.y);

        if (dist < config.radius + 5) {
          const snowballMult = b.snowball
            ? 1 + Math.min(1, b.age / 1.2) * (b.snowballMax - 1)
            : 1;
          const damage = b.damage * snowballMult;

          a.health -= damage;
          a.hitFlash = 0.15;
          this.eventBus.emit("ASTEROID_HIT", { asteroid: a, damage });
          this.eventBus.emit("ON_HIT", { asteroid: a, bullet: b, damage });

          if (a.health <= 0) {
            this.handleAsteroidDestroyed(a, b);
          }

          // Bounce behavior
          if (b.bounceRemaining > 0) {
            const nx = (b.x - a.x) / Math.max(1, dist);
            const ny = (b.y - a.y) / Math.max(1, dist);
            const dot = b.vx * nx + b.vy * ny;
            b.vx = b.vx - 2 * dot * nx;
            b.vy = b.vy - 2 * dot * ny;
            b.bounceRemaining -= 1;
            break;
          }

          // Handle pierce
          if (b.pierceRemaining > 0) {
            b.pierceRemaining--;
          } else if (!b.sticky) {
            this.bulletPool.release(b);
            this.bullets.splice(bi, 1);
            break;
          }
        }
      }
    }

    // Player vs Asteroids
    for (const a of this.asteroids) {
      const config = CONFIG.ASTEROID_SIZES[a.size];
      const dist = distance(this.playerX, this.playerY, a.x, a.y);

      if (dist < config.radius + CONFIG.PLAYER_WIDTH / 3) {
        this.eventBus.emit("PLAYER_HIT", {});
        return;
      }
    }
  }

  splitAsteroid(asteroid: Asteroid): void {
    if (asteroid.size === "small") return;

    const newSize: AsteroidSize =
      asteroid.size === "large" ? "medium" : "small";
    const config = CONFIG.ASTEROID_SIZES[newSize];

    // Spawn 2 children moving upward and outward in opposite directions
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? -1 : 1; // Left or right
      const speed = config.speed * this.speedMultiplier;
      const horizontalSpeed = (2.5 + Math.random() * 1.5) * direction;
      const upwardSpeed = -(1.5 + Math.random() * 2); // Negative = upward

      this.spawnAsteroid(
        newSize,
        asteroid.x + direction * 15,
        asteroid.y,
        horizontalSpeed,
        upwardSpeed,
      );
    }
  }

  handleExplosion(x: number, y: number, damage: number, radius: number): void {
    this.particles.emit(x, y, "#ff6600", 15, "explosion");
    this.triggerScreenShake(0.4);

    // Damage nearby asteroids
    for (const a of this.asteroids) {
      const dist = distance(x, y, a.x, a.y);
      if (dist < radius) {
        a.health -= damage;
        if (a.health <= 0) {
          this.handleAsteroidDestroyed(a);
        }
      }
    }
  }

  handleChainLightning(
    x: number,
    y: number,
    targets: number,
    damage: number,
  ): void {
    const hit: Asteroid[] = [];

    for (let t = 0; t < targets; t++) {
      let nearest: Asteroid | null = null;
      let nearestDist = Infinity;

      for (const a of this.asteroids) {
        if (hit.includes(a)) continue;
        const dist = distance(x, y, a.x, a.y);
        if (dist < 150 && dist < nearestDist) {
          nearestDist = dist;
          nearest = a;
        }
      }

      if (nearest) {
        if (!nearest.active) continue; // Skip if already destroyed by another effect
        hit.push(nearest);
        nearest.health -= damage;
        nearest.hitFlash = 0.15;

        // Draw lightning effect
        this.particles.emit(nearest.x, nearest.y, "#00ffff", 6, "spark");

        if (nearest.health <= 0) {
          this.handleAsteroidDestroyed(nearest);
        }

        x = nearest.x;
        y = nearest.y;
      }
    }
  }

  updateDifficulty(dt: number): void {
    this.survivalTime += dt * 1000;

    // Speed increases every 60 seconds, with a bonus per boss defeated
    const bossDifficultyBonus = this.bossesDefeated;
    const newSpeedMult = Math.min(
      2.0,
      1.0 +
        Math.floor(this.survivalTime / CONFIG.SPEED_INCREASE_INTERVAL) * 0.09 +
        bossDifficultyBonus * 0.055,
    );
    if (newSpeedMult !== this.speedMultiplier) {
      this.speedMultiplier = newSpeedMult;
      console.log("[updateDifficulty] Speed multiplier:", this.speedMultiplier);
    }

    // Health bonus every ~32 seconds, accelerates with bosses defeated
    const newHealthBonus =
      Math.floor(this.survivalTime / 32000) +
      Math.floor((bossDifficultyBonus + 1) / 2);
    if (newHealthBonus !== this.healthBonus) {
      this.healthBonus = newHealthBonus;
      console.log("[updateDifficulty] Health bonus:", this.healthBonus);
    }
  }

  // ============= BOSS FIGHT =============

  updateBossAnnouncement(dt: number): void {
    if (this.bossAnnouncementTimer > 0) {
      this.bossAnnouncementTimer -= dt;
      if (this.bossAnnouncementTimer <= 0) {
        const announcement = document.getElementById("bossAnnouncement");
        if (announcement) {
          announcement.classList.remove("active");
        }
      }
    }
  }

  getBossPhaseTempoMult(): number {
    if (!this.boss) return 1;
    return Math.max(0.62, 1 - (this.boss.phase - 1) * 0.12);
  }

  getBossPhaseProjectileSpeed(base: number): number {
    if (!this.boss) return base;
    return base + (this.boss.phase - 1) * 0.4;
  }

  updateBossPhaseState(): void {
    if (!this.boss) return;

    const config = BOSS_CONFIGS[this.boss.type];
    if (config.phaseThresholds.length === 0) return;

    const healthRatio = this.boss.health / this.boss.maxHealth;
    let nextPhase = 1;
    for (const threshold of config.phaseThresholds) {
      if (healthRatio <= threshold) {
        nextPhase++;
      }
    }

    if (nextPhase <= this.boss.phase) return;

    this.boss.phase = nextPhase;
    this.boss.isSpecial = false;
    this.boss.specialTimer = 0;
    this.boss.waveTimer = 900;
    this.boss.attacksRemaining = 0;
    this.floatingText.add(
      this.boss.x,
      this.boss.y - 110,
      "PHASE " + nextPhase + "!",
      "#ff4444",
      2.5,
    );
    this.triggerScreenShake(10 + nextPhase * 2);
    this.audio.triggerHaptic("heavy");
  }

  updateBoss(dt: number): void {
    if (!this.boss || !this.boss.active) return;

    const config = BOSS_CONFIGS[this.boss.type];

    // Entrance animation
    if (this.boss.entering) {
      this.boss.y = lerp(this.boss.y, this.boss.targetY, 0.03);
      if (Math.abs(this.boss.y - this.boss.targetY) < 2) {
        this.boss.y = this.boss.targetY;
        this.boss.entering = false;
        console.log(
          "[updateBoss] " +
            config.name +
            " finished entering, starting attacks",
        );

        // Final landing "thud" haptics
        this.audio.triggerHaptic("heavy");
        setTimeout(() => this.audio.triggerHaptic("heavy"), 100);
        this.triggerScreenShake(12);
      }
      return;
    }

    this.updateBossPhaseState();

    // Highlighter: full-map highlight line every 10s during phase 2+
    if (this.boss.type === "highlighter" && this.boss.phase >= 2) {
      this.boss.lineTimer = (this.boss.lineTimer ?? 10) - dt;
      if (this.boss.lineTimer <= 0) {
        this.boss.lineTimer = 10;
        const lineY = randomRange(this.h * 0.2, this.h * 0.8);
        this.spawnBossAreaEffect("highlight_band", 0, lineY, {
          x2: this.w,
          y2: lineY,
          radius: 20,
          life: 3.5,
          warmup: 2.0,
          color: "rgba(243,232,90,0.55)",
        });
      }
    }

    // Rotation animation (varies by type)
    const rotationSpeeds: Record<BossType, number> = {
      eraser: 0.3,
      paperweight: 0.1,
      inkblot: 0.8,
      rubberband: 0.5,
      stapler: 0.2,
      scissors: 0.4,
      pushpin: 0.65,
      highlighter: 0.22,
      ruler: 0.14,
      holepunch: 0.3,
      binderclip: 0.24,
      sharpener: 0.85,
      tape: 0.18,
      gluestick: 0.4,
      stapleremover: 0.65,
    };
    this.boss.rotation += dt * rotationSpeeds[this.boss.type];

    // Pulse animation
    this.boss.pulsePhase += dt * 2;
    this.boss.movePhase += dt;

    // Movement patterns
    this.updateBossMovement(dt);

    // Wave-based attack system (attacks indefinitely)
    if (this.boss.isSpecial) {
      this.updateSpecialAbility(dt);
    } else if (this.boss.attacksRemaining > 0) {
      // In the middle of a wave - fire attacks with delay
      this.boss.attackTimer -= dt * 1000;
      if (this.boss.attackTimer <= 0) {
        this.bossFireAttack();
        this.boss.attacksRemaining--;
        this.boss.attackTimer = Math.max(
          70,
          config.attackDelay * this.getBossPhaseTempoMult(),
        );
      }
    } else {
      // Waiting for next wave
      this.boss.waveTimer -= dt * 1000;
      if (this.boss.waveTimer <= 0) {
        // Every 3rd wave is a special move
        if (
          this.boss.totalAttacks > 0 &&
          Math.floor(this.boss.totalAttacks / config.attacksPerWave) % 3 === 0
        ) {
          this.triggerSpecialAbility();
        } else {
          // Start new wave
          this.boss.attacksRemaining =
            config.attacksPerWave + Math.max(0, this.boss.phase - 1);
          this.boss.waveTimer =
            config.waveInterval * this.getBossPhaseTempoMult();
          this.boss.attackTimer = 0;
          console.log("[updateBoss] " + config.name + " starting attack wave");
        }
      }
    }
  }

  triggerSpecialAbility(): void {
    if (!this.boss) return;
    this.boss.isSpecial = true;
    this.boss.specialTimer =
      BOSS_CONFIGS[this.boss.type].specialDuration * 1000;
    this.boss.specialPhase = 0;

    const config = BOSS_CONFIGS[this.boss.type];
    this.floatingText.add(
      this.boss.x,
      this.boss.y - 100,
      "ULTIMATE: " + this.getSpecialName().toUpperCase(),
      "#ff0000",
      3,
    );
    this.audio.triggerHaptic("heavy");
  }

  getSpecialName(): string {
    if (!this.boss) return "";
    switch (this.boss.type) {
      case "eraser":
        return "Doodle Summon";
      case "paperweight":
        return "Seismic Slam";
      case "inkblot":
        return "Ink Teleport";
      case "rubberband":
        return "The Great Snap";
      case "stapler":
        return "Staple Rain";
      case "scissors":
        return "Mega Shred";
      case "pushpin":
        return "Pin Cushion";
      case "highlighter":
        return "Margin Sweep";
      case "ruler":
        return "Measure Twice";
      case "holepunch":
        return "Three-Hole Doom";
      case "binderclip":
        return "Office Crush";
      case "sharpener":
        return "Graphite Tempest";
      case "tape":
        return "Sticky Barrage";
      case "gluestick":
        return "Adhesive Nova";
      case "stapleremover":
        return "Death Clamp";
      default:
        return "Overdrive";
    }
  }

  updateSpecialAbility(dt: number): void {
    if (!this.boss) return;
    this.boss.specialTimer -= dt * 1000;
    this.boss.specialPhase += dt;

    const config = BOSS_CONFIGS[this.boss.type];

    switch (this.boss.type) {
      case "eraser":
        // Spawn stick men that run around
        if (Math.random() < 0.08 + this.boss.specialPhase * 0.02) {
          this.spawnBossMinion("stick_man", this.boss.x, this.boss.y, {
            vx: (Math.random() - 0.5) * 10,
            vy: 2 + Math.random() * 2,
            health: 2,
          });
        }
        break;

      case "paperweight": {
        // Staggered seismic arcs focused toward the player's lane.
        if (
          Math.floor(this.boss.specialPhase * 3.1) >
          Math.floor((this.boss.specialPhase - dt) * 3.1)
        ) {
          this.triggerScreenShake(5);
          const aimAngle = Math.atan2(
            this.playerY - this.boss.y,
            this.playerX - this.boss.x,
          );
          const baseWaveCount =
            4 + this.boss.phase + Math.floor(this.boss.specialPhase * 1.5);
          const waveCount = Math.max(3, Math.floor(baseWaveCount * 0.8));
          const spread = Math.PI * (0.5 + this.boss.phase * 0.04);
          for (let w = 0; w < waveCount; w++) {
            const t = waveCount === 1 ? 0.5 : w / (waveCount - 1);
            const dir =
              aimAngle +
              (t - 0.5) * spread +
              Math.sin(this.boss.specialPhase * 3 + w * 0.8) * 0.04;
            const speed = this.getBossPhaseProjectileSpeed(
              3.1 + Math.random() * 1.35,
            );
            const proj = this.spawnBossProjectile("seismic_wave", {
              vx: Math.cos(dir) * speed,
              vy: Math.sin(dir) * speed,
              size: 34 + this.boss.phase * 3,
              color: "rgba(140,120,100,0.8)",
              rotationSpeed: 0,
            });
            if (proj) {
              proj.arcAngle = dir;
              proj.arcSpan = Math.max(
                0.14,
                Math.PI * (0.22 - this.boss.specialPhase * 0.01),
              );
            }
          }
        }
        break;
      }

      case "inkblot":
        // Ink Storm ultimate: scatter puddles across the arena + 8-dir blob ring + spiders
        if (
          this.boss.specialTimer < 1500 &&
          this.boss.specialTimer + dt * 1000 >= 1500
        ) {
          this.particles.emit(
            this.boss.x,
            this.boss.y,
            BOSS_CONFIGS.inkblot.color,
            25,
            "explosion",
          );

          // Scatter 12 ink puddles spread across the screen
          const pudCount = 12 + this.boss.phase * 2;
          for (let i = 0; i < pudCount; i++) {
            const px = randomRange(40, this.w - 40);
            const py = randomRange(100, this.h - 60);
            this.spawnBossAreaEffect("ink_puddle", px, py, {
              radius: 38 + this.boss.phase * 6,
              life: 4.0 + this.boss.phase * 0.5,
              warmup: 0.3 + (i % 4) * 0.2,
              color: "rgba(42,42,74,0.35)",
            });
          }

          // 8-directional ink blob ring
          const blobSpeed = 3.5 + this.boss.phase * 0.4;
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.spawnBossProjectile("ink_blob", {
              vx: Math.cos(angle) * blobSpeed,
              vy: Math.sin(angle) * blobSpeed,
              size: 16 + this.boss.phase * 2,
              color: BOSS_CONFIGS.inkblot.color,
              rotationSpeed: 0.05,
            });
          }

          // Spider cluster
          for (let i = 0; i < 2 + this.boss.phase; i++) {
            this.spawnBossMinion("ink_spider", this.boss.x, this.boss.y, {
              health: 1,
            });
          }

          this.floatingText.add(
            this.boss.x,
            this.boss.y - 50,
            "INK NOVA!",
            "#2a2a4a",
            2.0,
          );
        }
        break;

      case "rubberband":
        // Spawn bouncing rubber-ball minions in groups of three.
        if (
          Math.floor(this.boss.specialPhase * 1.8) >
          Math.floor((this.boss.specialPhase - dt) * 1.8)
        ) {
          for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 + this.boss.specialPhase * 0.8;
            this.spawnBossMinion("rubber_minion", this.boss.x, this.boss.y, {
              vx: Math.cos(angle) * 3.2,
              vy: Math.sin(angle) * 2.4,
              health: 3 + this.boss.phase,
            });
          }
        }
        break;

      case "stapler":
        // Rain staples from top
        if (Math.random() < 0.26 + this.boss.phase * 0.03) {
          this.spawnBossProjectile("staple", {
            vx: 0,
            vy: this.getBossPhaseProjectileSpeed(6),
            size: 8,
            color: "#c0c0c0",
            rotationSpeed: 0,
          });
          // Place projectile at random top position
          const proj = this.bossProjectiles[this.bossProjectiles.length - 1];
          proj.x = Math.random() * this.w;
          proj.y = -20;
        }
        break;

      case "scissors": {
        const slashCadence = 1.45 + (this.boss.phase - 1) * 0.75;
        if (
          Math.floor(this.boss.specialPhase * slashCadence) >
          Math.floor((this.boss.specialPhase - dt) * slashCadence)
        ) {
          const slashCount = 2;
          const fullLength = Math.hypot(this.w, this.h);
          const targetHorizontalBias = Math.random() > 0.5;
          for (let i = 0; i < slashCount; i++) {
            const isPrimarySlash = i === 0;
            const cx = isPrimarySlash
              ? clamp(this.playerX, this.w * 0.14, this.w * 0.86)
              : randomRange(this.w * 0.15, this.w * 0.85);
            const cy = isPrimarySlash
              ? clamp(this.playerY, this.h * 0.16, this.h * 0.94)
              : randomRange(this.h * 0.16, this.h * 0.96);
            const horizontalBias =
              (isPrimarySlash && targetHorizontalBias) ||
              (!isPrimarySlash && !targetHorizontalBias);
            const angle = horizontalBias
              ? randomRange(-0.28, 0.28)
              : Math.PI * 0.5 + randomRange(-0.28, 0.28);
            const dx = Math.cos(angle) * fullLength * 0.5;
            const dy = Math.sin(angle) * fullLength * 0.5;
            this.spawnBossAreaEffect("paper_cut", cx - dx, cy - dy, {
              x2: cx + dx,
              y2: cy + dy,
              life: 2.4,
              warmup: 1.5,
              radius: 16,
              color: "rgba(255,102,0,0.85)",
            });
          }
          if (this.boss.phase >= 2) {
            this.spawnBossMinion("blade_drone", this.boss.x, this.boss.y, {
              health: 4 + this.boss.phase,
            });
          }
        }
        break;
      }

      case "pushpin": {
        if (
          Math.floor(this.boss.specialPhase * 2.2) >
          Math.floor((this.boss.specialPhase - dt) * 2.2)
        ) {
          const pinCount = 10 + this.boss.phase * 2;
          const safeIndex = Math.floor(
            (this.boss.specialPhase * 2.5) % pinCount,
          );
          for (let i = 0; i < pinCount; i++) {
            if (i === safeIndex || i === (safeIndex + 1) % pinCount) continue;
            const angle =
              (i / pinCount) * Math.PI * 2 + this.boss.specialPhase * 0.35;
            this.spawnBossProjectile("push_pin", {
              vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(3.2),
              vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(3.2),
              size: 12,
              color: BOSS_CONFIGS.pushpin.color,
              rotationSpeed: 0.12,
            });
          }
        }
        break;
      }

      case "highlighter": {
        if (
          Math.floor(this.boss.specialPhase * 1.2) >
          Math.floor((this.boss.specialPhase - dt) * 1.2)
        ) {
          const helperTarget = this.boss.phase >= 2 ? 2 : 1;
          const currentHelpers = this.bossMinions.filter(
            (m) => m.active && m.type === "marker_helper",
          ).length;
          for (let i = currentHelpers; i < helperTarget; i++) {
            this.spawnBossMinion(
              "marker_helper",
              this.boss.x + (i === 0 ? -70 : 70),
              this.boss.y + 20,
              {
                health: 4 + this.boss.phase,
                angle: i === 0 ? Math.PI : 0,
              },
            );
          }
          // Also fire stamps + bolts during ultimate phase
          this.highlighterAttack();
        }
        break;
      }

      case "ruler": {
        if (
          Math.floor(this.boss.specialPhase * 1.85) >
          Math.floor((this.boss.specialPhase - dt) * 1.85)
        ) {
          const verticalCount = 1 + this.boss.phase;
          const horizontalCount = this.boss.phase >= 2 ? 2 : 1;
          for (let i = 0; i < verticalCount; i++) {
            const x = randomRange(20, this.w - 20);
            if (!this.isRulerBeamOverlapping(x, 0, true)) {
              const label = (Math.floor(randomRange(3, 27)) * 2).toString();
              this.spawnBossAreaEffect("ruler_beam", x, 0, {
                x2: x,
                y2: this.h,
                radius: 14,
                life: 2.8,
                warmup: 1.5,
                color: "rgba(160,120,70,0.8)",
                label: label,
              });
            }
          }
          for (let i = 0; i < horizontalCount; i++) {
            const rowY = randomRange(this.h * 0.2, this.h * 0.82);
            if (!this.isRulerBeamOverlapping(0, rowY, false)) {
              const label = (Math.floor(randomRange(5, 20)) * 3).toString();
              this.spawnBossAreaEffect("ruler_beam", 0, rowY, {
                x2: this.w,
                y2: rowY,
                radius: 12,
                life: 2.6,
                warmup: 1.5,
                color: "rgba(160,120,70,0.6)",
                label: label,
              });
            }
          }
        }
        break;
      }

      case "holepunch": {
        if (
          Math.floor(this.boss.specialPhase * 1.5) >
          Math.floor((this.boss.specialPhase - dt) * 1.5)
        ) {
          const angle = Math.atan2(
            this.playerY - this.boss.y,
            this.playerX - this.boss.x,
          );
          const baseX = clamp(this.playerX, 60, this.w - 60);
          const baseY = clamp(this.playerY, 140, this.h - 140);
          const offsetDistance = 95 + this.boss.phase * 14;
          const burstCount = this.boss.phase >= 2 ? 2 : 1;
          this.spawnBossAreaEffect("punch_zone", baseX, baseY, {
            radius: 42 + this.boss.phase * 5,
            life: 1.2,
            warmup: 0.78,
            color: "rgba(199,208,218,0.35)",
            projectileCount: burstCount,
            projectileAngle: angle,
          });
          this.spawnBossAreaEffect(
            "punch_zone",
            clamp(baseX + Math.cos(angle) * offsetDistance, 60, this.w - 60),
            clamp(baseY + Math.sin(angle) * offsetDistance, 140, this.h - 140),
            {
              radius: 36 + this.boss.phase * 4,
              life: 1.75,
              warmup: 0.78,
              color: "rgba(199,208,218,0.3)",
              projectileCount: burstCount,
              projectileAngle: angle,
            },
          );
        }
        break;
      }

      case "binderclip": {
        if (
          Math.floor(this.boss.specialPhase * 1.15) >
          Math.floor((this.boss.specialPhase - dt) * 1.15)
        ) {
          const hasActiveClampCurtain = this.bossAreaEffects.some(
            (ef) => ef.active && ef.type === "clamp_wall",
          );
          if (!hasActiveClampCurtain) {
            const rowSpacing = 72;
            const rowCount = 6 + this.boss.phase;
            const gapWidth = clamp(155 - this.boss.phase * 12, 102, 155);
            const speed = 1.65 + this.boss.phase * 0.16;
            const spawnY = this.boss.y + 48;
            const aimBase = clamp(this.playerX, this.w * 0.18, this.w * 0.82);
            for (let row = 0; row < rowCount; row++) {
              const y = spawnY + row * rowSpacing;
              const lateralOffset =
                Math.sin(row * 0.95 + this.boss.specialPhase * 1.7) *
                  (65 + this.boss.phase * 12) +
                (row % 2 === 0 ? -1 : 1) * 22;
              const gapCenter = clamp(
                aimBase + lateralOffset,
                gapWidth * 0.5 + 24,
                this.w - gapWidth * 0.5 - 24,
              );
              const gapStart = gapCenter - gapWidth * 0.5;
              const gapEnd = gapCenter + gapWidth * 0.5;
              this.spawnBossAreaEffect("clamp_wall", 0, y, {
                x2: gapStart,
                y2: y,
                radius: 14,
                life: 7.5,
                vx: 0,
                vy: speed,
                warmup: 0.22,
                color: "rgba(118,167,255,0.48)",
              });
              this.spawnBossAreaEffect("clamp_wall", gapEnd, y, {
                x2: this.w,
                y2: y,
                radius: 14,
                life: 7.5,
                vx: 0,
                vy: speed,
                warmup: 0.22,
                color: "rgba(118,167,255,0.48)",
              });
            }
          }
          const baseAngle = Math.atan2(
            this.playerY - this.boss.y,
            this.playerX - this.boss.x,
          );
          const specialSpreadBase = baseAngle + randomRange(-0.45, 0.45);
          for (let i = -1; i <= 1; i++) {
            const spreadOffset = i * 0.28 + randomRange(-0.12, 0.12);
            this.spawnBossProjectile("clip_shard", {
              vx:
                Math.cos(specialSpreadBase + spreadOffset) *
                this.getBossPhaseProjectileSpeed(3.8 + Math.random() * 0.5),
              vy:
                Math.sin(specialSpreadBase + spreadOffset) *
                this.getBossPhaseProjectileSpeed(3.8 + Math.random() * 0.5),
              size: 15,
              color: BOSS_CONFIGS.binderclip.accentColor,
              rotationSpeed: 0.11,
            });
          }
        }
        break;
      }

      case "sharpener": {
        if (
          Math.floor(this.boss.specialPhase * 2.4) >
          Math.floor((this.boss.specialPhase - dt) * 2.4)
        ) {
          const bladeCount = 12 + this.boss.phase * 3;
          const safeStart = Math.floor(
            (this.boss.specialPhase * 1.9) % bladeCount,
          );
          for (let i = 0; i < bladeCount; i++) {
            if (i === safeStart || i === (safeStart + 1) % bladeCount) continue;
            const angle =
              (i / bladeCount) * Math.PI * 2 +
              this.boss.specialPhase * 0.55 +
              this.boss.phase;
            this.spawnBossProjectile("shaving", {
              vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(4.4),
              vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(4.4),
              size: 14,
              color: BOSS_CONFIGS.sharpener.accentColor,
              rotationSpeed: 0.18,
            });
          }
          if (
            Math.floor(this.boss.specialPhase * 1.3) >
            Math.floor((this.boss.specialPhase - dt) * 1.3)
          ) {
            const dustY = randomRange(this.h * 0.28, this.h * 0.78);
            this.spawnBossAreaEffect("highlight_band", 20, dustY, {
              x2: this.w - 20,
              y2: dustY,
              radius: 14,
              life: 1.4,
              warmup: 0.2,
              color: "rgba(120,120,120,0.22)",
            });
          }
        }
        break;
      }

      case "tape": {
        // Fire tape strips in a radial burst every 0.5s
        if (
          Math.floor(this.boss.specialPhase * 2) >
          Math.floor((this.boss.specialPhase - dt) * 2)
        ) {
          const count = 10 + this.boss.phase * 2;
          for (let i = 0; i < count; i++) {
            const angle =
              (i / count) * Math.PI * 2 + this.boss.specialPhase * 0.45;
            this.spawnBossProjectile("tape_strip", {
              vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(3.0),
              vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(3.0),
              size: 18,
              color: BOSS_CONFIGS.tape.color,
              rotationSpeed: 0.08,
            });
          }
        }
        break;
      }

      case "gluestick": {
        // Rain glue blobs from random positions above
        if (Math.random() < 0.12 + this.boss.specialPhase * 0.015) {
          const tx = randomRange(50, this.w - 50);
          const ty = randomRange(this.h * 0.05, this.h * 0.2);
          this.spawnBossAreaEffect("glue_zone", tx, ty, {
            radius: 60 + this.boss.phase * 15,
            life: 5.0,
            warmup: 0.6,
            color: "rgba(232,213,183,0.55)",
          });
          this.spawnBossProjectile("glue_blob", {
            vx: 0,
            vy: this.getBossPhaseProjectileSpeed(2.8),
            size: 20,
            color: BOSS_CONFIGS.gluestick.accentColor,
            rotationSpeed: 0.05,
          });
        }
        break;
      }

      case "stapleremover": {
        // Twin claw fangs converge from sides, plus a fast aimed shot
        if (
          Math.floor(this.boss.specialPhase * 1.8) >
          Math.floor((this.boss.specialPhase - dt) * 1.8)
        ) {
          // Left claw from left edge
          this.spawnBossProjectile("claw_fang", {
            vx: this.getBossPhaseProjectileSpeed(4.2),
            vy: (this.playerY - this.boss.y) * 0.015,
            size: 22,
            color: BOSS_CONFIGS.stapleremover.accentColor,
            rotationSpeed: -0.1,
          });
          // Right claw from right edge
          this.spawnBossProjectile("claw_fang", {
            vx: -this.getBossPhaseProjectileSpeed(4.2),
            vy: (this.playerY - this.boss.y) * 0.015,
            size: 22,
            color: BOSS_CONFIGS.stapleremover.accentColor,
            rotationSpeed: 0.1,
          });
          // Fast aimed staple
          const angle = Math.atan2(
            this.playerY - this.boss.y,
            this.playerX - this.boss.x,
          );
          this.spawnBossProjectile("staple", {
            vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(5.5),
            vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(5.5),
            size: 10,
            color: BOSS_CONFIGS.stapleremover.color,
            rotationSpeed: 0.2,
          });
        }
        break;
      }
    }

    if (this.boss.specialTimer <= 0) {
      this.boss.isSpecial = false;
      this.boss.waveTimer = config.waveInterval;
    }
  }

  // Update boss projectiles (separate from asteroids)
  updateBossProjectiles(dt: number): void {
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      const proj = this.bossProjectiles[i];
      if (!proj.active) {
        this.bossProjectiles.splice(i, 1);
        continue;
      }

      proj.age += dt;
      proj.x += proj.vx * dt * 60;
      proj.y += proj.vy * dt * 60;
      proj.rotation += proj.rotationSpeed * dt * 60;

      // Type-specific updates
      if (proj.type === "rubber_band" && proj.stretchPhase !== undefined) {
        proj.stretchPhase += dt * 8;
      }

      // Remove if off screen (seismic waves get larger margin and max age)
      if (proj.type === "seismic_wave") {
        const margin = 200;
        if (
          proj.age > 6 ||
          proj.y > this.h + margin ||
          proj.y < -margin ||
          proj.x < -margin ||
          proj.x > this.w + margin
        ) {
          proj.active = false;
        }
      } else if (
        proj.y > this.h + 50 ||
        proj.y < -100 ||
        proj.x < -50 ||
        proj.x > this.w + 50
      ) {
        proj.active = false;
      }
    }
  }

  // Check collision between boss projectiles and player
  checkBossProjectileCollisions(): void {
    if (this.damageTimer > 0 || this.isInvincible) return;

    const playerRadius = 15;

    for (const proj of this.bossProjectiles) {
      if (!proj.active) continue;

      if (
        proj.type === "seismic_wave" &&
        proj.arcAngle !== undefined &&
        proj.arcSpan !== undefined
      ) {
        const dist = distance(proj.x, proj.y, this.playerX, this.playerY);
        const waveR = proj.size + proj.age * 15;
        const ringThickness = 20;
        if (Math.abs(dist - waveR) < ringThickness) {
          const playerAngle = Math.atan2(
            this.playerY - proj.y,
            this.playerX - proj.x,
          );
          let angleDiff = playerAngle - proj.arcAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          if (Math.abs(angleDiff) < proj.arcSpan) {
            proj.active = false;
            this.eventBus.emit("PLAYER_HIT");
            this.particles.emit(
              this.playerX,
              this.playerY,
              proj.color,
              8,
              "spark",
            );
            this.audio.triggerHaptic("heavy");
            return;
          }
        }
        continue;
      }

      const dist = distance(proj.x, proj.y, this.playerX, this.playerY);
      if (dist < playerRadius + proj.size) {
        // Hit player
        proj.active = false;
        this.eventBus.emit("PLAYER_HIT");
        this.particles.emit(proj.x, proj.y, proj.color, 8, "spark");
        this.audio.triggerHaptic("error");
        return;
      }
    }
  }

  updateBossMinions(dt: number): void {
    for (let i = this.bossMinions.length - 1; i >= 0; i--) {
      const m = this.bossMinions[i];
      if (!m.active) {
        this.bossMinions.splice(i, 1);
        continue;
      }

      m.timer -= dt * 1000;

      switch (m.type) {
        case "eraser_grunt":
          // Eraser grunts dash toward player every few seconds
          if (m.timer <= 0) {
            const dx = this.playerX - m.x;
            const dy = this.playerY - m.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            m.vx = (dx / dist) * 6;
            m.vy = (dy / dist) * 6;
            m.timer = 2000; // Reset dash timer
          }
          // Slow down
          m.vx *= 0.95;
          m.vy *= 0.95;
          break;

        case "ink_spider":
          // Ink spiders crawl randomly and occasionally spray dots
          if (m.timer <= 0) {
            m.vx = (Math.random() - 0.5) * 4;
            m.vy = (Math.random() - 0.5) * 4;
            m.timer = 1000 + Math.random() * 2000;

            // Spray small ink dots
            for (let j = 0; j < 4; j++) {
              const angle = Math.random() * Math.PI * 2;
              this.spawnBossProjectile("ink_blob", {
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                size: 6,
                color: BOSS_CONFIGS.inkblot.color,
                rotationSpeed: 0,
              });
            }
          }
          break;

        case "rubber_minion":
          if (m.timer <= 0) {
            m.vx = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 2);
            m.vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
            m.timer = 900;
          }
          if (m.x < 30 || m.x > this.w - 30) m.vx *= -1;
          if (m.y < 100 || m.y > this.h - 60) m.vy *= -1;
          break;

        case "staple_sentry":
          // Sentry stays in place and shoots in fixed directions
          if (m.timer <= 0) {
            m.angle += 0.5; // Rotate firing angle
            const speed = 4;
            this.spawnBossProjectile("staple", {
              vx: Math.cos(m.angle) * speed,
              vy: Math.sin(m.angle) * speed,
              size: 8,
              color: "#c0c0c0",
              rotationSpeed: 0,
            });
            m.timer = 800;
          }
          m.vx = 0;
          m.vy = 0;
          break;

        case "blade_drone":
          // Blade drones follow player closely
          const dx = this.playerX - m.x;
          const dy = this.playerY - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          m.vx = lerp(m.vx, (dx / dist) * 3, 0.05);
          m.vy = lerp(m.vy, (dy / dist) * 3, 0.05);
          break;

        case "stick_man":
          // Little people that run around and scribble
          if (!m.phase) m.phase = 0;
          m.phase += dt * 10;
          if (m.timer <= 0) {
            m.vx = (Math.random() - 0.5) * 8;
            m.vy = (Math.random() - 0.5) * 4;
            m.timer = 1000 + Math.random() * 1000;
          }
          // Scribble effect
          if (Math.random() < 0.1) {
            this.particles.emit(m.x, m.y, CONFIG.PENCIL_MEDIUM, 1, "spark");
          }
          break;

        case "pin_satellite":
          if (this.boss) {
            m.angle += dt * (1.8 + this.boss.phase * 0.25);
            const orbitRadius = 90 + Math.sin(m.timer * 0.002) * 18;
            m.x = this.boss.x + Math.cos(m.angle) * orbitRadius;
            m.y = this.boss.y + Math.sin(m.angle) * orbitRadius * 0.6;
          }
          if (m.timer <= 0) {
            const angle = Math.atan2(this.playerY - m.y, this.playerX - m.x);
            this.spawnBossProjectile("push_pin", {
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4,
              size: 10,
              color: BOSS_CONFIGS.pushpin.color,
              rotationSpeed: 0.18,
            });
            m.timer = 1100;
          }
          break;

        case "marker_helper":
          if (this.boss) {
            m.angle += dt * (1.3 + this.boss.phase * 0.15);
            m.x = this.boss.x + Math.cos(m.angle) * 90;
            m.y = this.boss.y + 35 + Math.sin(m.angle * 1.4) * 24;
          }
          if (m.timer <= 0) {
            const dir = Math.atan2(this.playerY - m.y, this.playerX - m.x);
            this.spawnBossProjectile("marker_bolt", {
              vx: Math.cos(dir) * 3.8,
              vy: Math.sin(dir) * 3.8,
              size: 14,
              color: BOSS_CONFIGS.highlighter.accentColor,
              rotationSpeed: 0.05,
            });
            m.timer = 850;
          }
          break;
      }

      m.x += m.vx * dt * 60;
      m.y += m.vy * dt * 60;

      // Wrap on screen for some minions or remove
      if (
        m.y > this.h + 100 ||
        m.y < -200 ||
        m.x < -100 ||
        m.x > this.w + 100
      ) {
        m.active = false;
      }
    }
  }

  updateBossAreaEffects(dt: number): void {
    for (let i = this.bossAreaEffects.length - 1; i >= 0; i--) {
      const ef = this.bossAreaEffects[i];
      const prevWarmup = ef.warmup ?? 0;
      if (ef.warmup !== undefined && ef.warmup > 0) {
        ef.warmup -= dt;
      }
      if (ef.splashTimer !== undefined && ef.splashTimer > 0) {
        ef.splashTimer -= dt;
      }
      ef.life -= dt;
      ef.x += (ef.vx ?? 0) * dt * 60;
      ef.y += (ef.vy ?? 0) * dt * 60;
      if (ef.x2 !== undefined) ef.x2 += (ef.vx ?? 0) * dt * 60;
      if (ef.y2 !== undefined) ef.y2 += (ef.vy ?? 0) * dt * 60;
      if (ef.life <= 0) {
        ef.active = false;
        this.bossAreaEffects.splice(i, 1);
        continue;
      }

      // Check player interaction with area effects
      const dist = distance(this.playerX, this.playerY, ef.x, ef.y);

      switch (ef.type) {
        case "ink_puddle":
          if (prevWarmup > 0 && (ef.warmup ?? 0) <= 0) {
            ef.splashTimer = 0.24;
            this.particles.emit(
              ef.x,
              ef.y,
              BOSS_CONFIGS.inkblot.color,
              14,
              "explosion",
            );
          }
          if ((ef.warmup ?? 0) <= 0 && dist < ef.radius) {
            this.playerVelocityX *= 0.5; // Slow down
            this.playerVelocityY *= 0.5;
          }
          break;
        case "ink_pool":
          // Tape sticky zone — slows movement
          if (prevWarmup > 0 && (ef.warmup ?? 0) <= 0) {
            ef.splashTimer = 0.2;
            this.particles.emit(
              ef.x,
              ef.y,
              BOSS_CONFIGS.tape.color,
              8,
              "explosion",
            );
          }
          if ((ef.warmup ?? 0) <= 0 && dist < ef.radius) {
            this.playerVelocityX *= 0.45;
            this.playerVelocityY *= 0.45;
          }
          break;
        case "glue_zone":
          // Glue zone — heavy slow
          if (prevWarmup > 0 && (ef.warmup ?? 0) <= 0) {
            ef.splashTimer = 0.2;
            this.particles.emit(
              ef.x,
              ef.y,
              BOSS_CONFIGS.gluestick.accentColor,
              10,
              "explosion",
            );
          }
          if ((ef.warmup ?? 0) <= 0 && dist < ef.radius) {
            this.playerVelocityX *= 0.3;
            this.playerVelocityY *= 0.3;
          }
          break;
        case "highlight_stamp":
          if (prevWarmup > 0 && (ef.warmup ?? 0) <= 0) {
            ef.splashTimer = 0.2;
            this.particles.emit(
              ef.x,
              ef.y,
              BOSS_CONFIGS.highlighter.color,
              16,
              "explosion",
            );
            if (
              dist < ef.radius &&
              this.damageTimer <= 0 &&
              !this.isInvincible
            ) {
              ef.hasDamaged = true;
              this.eventBus.emit("PLAYER_HIT");
              this.audio.triggerHaptic("medium");
            }
          }
          if ((ef.warmup ?? 0) <= 0 && dist < ef.radius * 0.92) {
            this.playerVelocityX *= 0.62;
            this.playerVelocityY *= 0.62;
          }
          break;
        case "gravity_well":
          if (dist < ef.radius) {
            const pull = (1 - dist / ef.radius) * 5;
            const angle = Math.atan2(ef.y - this.playerY, ef.x - this.playerX);
            this.playerX += Math.cos(angle) * pull;
            this.playerY += Math.sin(angle) * pull;
          }
          break;
        case "paper_cut":
        case "ruler_beam":
        case "highlight_band":
        case "clamp_wall":
          // Check line collision
          if (
            ef.x2 !== undefined &&
            ef.y2 !== undefined &&
            this.damageTimer <= 0 &&
            !this.isInvincible &&
            (ef.warmup ?? 0) <= 0
          ) {
            const d = this.distToSegment(
              this.playerX,
              this.playerY,
              ef.x,
              ef.y,
              ef.x2,
              ef.y2,
            );
            if (d < ef.radius) {
              this.eventBus.emit("PLAYER_HIT");
              this.audio.triggerHaptic("error");
            }
          }
          break;
        case "punch_zone":
          if (prevWarmup > 0 && (ef.warmup ?? 0) <= 0) {
            if (
              ef.projectileCount !== undefined &&
              ef.projectileCount > 0 &&
              ef.projectileAngle !== undefined
            ) {
              const split = ef.projectileCount;
              for (let j = 0; j < split; j++) {
                const offset = split === 1 ? 0 : (j - (split - 1) / 2) * 0.18;
                this.spawnBossProjectile("paper_chad", {
                  vx: Math.cos(ef.projectileAngle + offset) * 4.1,
                  vy: Math.sin(ef.projectileAngle + offset) * 4.1,
                  size: 10,
                  color: CONFIG.PAPER_BG,
                  rotationSpeed: 0.1,
                });
              }
            } else {
              for (let j = 0; j < 8; j++) {
                const angle = (j / 8) * Math.PI * 2;
                this.spawnBossProjectile("paper_chad", {
                  vx: Math.cos(angle) * 3.2,
                  vy: Math.sin(angle) * 3.2,
                  size: 8,
                  color: CONFIG.PAPER_BG,
                  rotationSpeed: 0.1,
                });
              }
            }
          }
          if (
            !ef.hasDamaged &&
            (ef.warmup ?? 0) <= 0 &&
            dist < ef.radius &&
            this.damageTimer <= 0 &&
            !this.isInvincible
          ) {
            ef.hasDamaged = true;
            this.eventBus.emit("PLAYER_HIT");
            this.audio.triggerHaptic("heavy");
          }
          break;
        case "shockwave":
          if (
            !ef.hasDamaged &&
            this.damageTimer <= 0 &&
            !this.isInvincible &&
            ef.aimAngle !== undefined &&
            ef.arcWidth !== undefined
          ) {
            const shockRadius = (1 - ef.life / ef.maxLife) * ef.radius;
            const ringThickness = 30;
            if (Math.abs(dist - shockRadius) < ringThickness) {
              const playerAngle = Math.atan2(
                this.playerY - ef.y,
                this.playerX - ef.x,
              );
              let angleDiff = playerAngle - ef.aimAngle;
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
              if (Math.abs(angleDiff) < ef.arcWidth) {
                ef.hasDamaged = true;
                this.eventBus.emit("PLAYER_HIT");
                this.audio.triggerHaptic("heavy");
                this.triggerScreenShake(6);
              }
            }
          }
          break;
      }
    }
  }

  distToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return distance(px, py, x1, y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distance(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  }

  getCurrentBossRadius(): number {
    if (!this.boss) return CONFIG.BOSS_RADIUS;
    return CONFIG.BOSS_RADIUS * (1 + Math.sin(this.boss.pulsePhase) * 0.03);
  }

  getEraserRenderRotation(): number {
    return this.boss ? this.boss.rotation * 0.3 : 0;
  }

  getStaplerLeverAngle(): number {
    return this.boss ? Math.sin(this.boss.pulsePhase * 2) * 0.15 : 0;
  }

  getScissorsOpenAngle(): number {
    return this.boss
      ? 0.3 + Math.abs(Math.sin(this.boss.pulsePhase * 2)) * 0.4
      : 0.3;
  }

  rotatePoint(x: number, y: number, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  toBossLocalSpace(
    px: number,
    py: number,
    angle: number = 0,
  ): { x: number; y: number } {
    if (!this.boss) {
      return { x: 0, y: 0 };
    }

    return this.rotatePoint(px - this.boss.x, py - this.boss.y, -angle);
  }

  isPointInLocalRect(
    px: number,
    py: number,
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
    padding: number = 0,
  ): boolean {
    return (
      Math.abs(px - cx) <= halfW + padding &&
      Math.abs(py - cy) <= halfH + padding
    );
  }

  isPointInLocalRotatedRect(
    px: number,
    py: number,
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
    rotation: number,
    padding: number = 0,
  ): boolean {
    const local = this.rotatePoint(px - cx, py - cy, -rotation);
    return this.isPointInLocalRect(
      local.x,
      local.y,
      0,
      0,
      halfW,
      halfH,
      padding,
    );
  }

  isPointInLocalEllipse(
    px: number,
    py: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number = 0,
    padding: number = 0,
  ): boolean {
    const local = this.rotatePoint(px - cx, py - cy, -rotation);
    const paddedRx = rx + padding;
    const paddedRy = ry + padding;
    const normalized =
      (local.x * local.x) / (paddedRx * paddedRx) +
      (local.y * local.y) / (paddedRy * paddedRy);
    return normalized <= 1;
  }

  isPointInLocalEllipseRing(
    px: number,
    py: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    thickness: number,
    padding: number = 0,
  ): boolean {
    const outer = this.isPointInLocalEllipse(
      px,
      py,
      cx,
      cy,
      rx + thickness * 0.5,
      ry + thickness * 0.5,
      rotation,
      padding,
    );
    const innerRx = Math.max(1, rx - thickness * 0.5 - padding);
    const innerRy = Math.max(1, ry - thickness * 0.5 - padding);
    const inner = this.isPointInLocalEllipse(
      px,
      py,
      cx,
      cy,
      innerRx,
      innerRy,
      rotation,
      0,
    );

    return outer && !inner;
  }

  isPointInPolygon(
    px: number,
    py: number,
    points: Array<{ x: number; y: number }>,
  ): boolean {
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;

      const intersects =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  isPointNearPolygon(
    px: number,
    py: number,
    points: Array<{ x: number; y: number }>,
    padding: number,
  ): boolean {
    if (this.isPointInPolygon(px, py, points)) {
      return true;
    }

    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      if (
        this.distToSegment(
          px,
          py,
          points[i].x,
          points[i].y,
          points[next].x,
          points[next].y,
        ) <= padding
      ) {
        return true;
      }
    }

    return false;
  }

  isPointInBossHitbox(px: number, py: number): boolean {
    if (!this.boss) return false;

    const radius = this.getCurrentBossRadius();
    const padding = Math.max(CONFIG.BULLET_WIDTH, CONFIG.BULLET_HEIGHT * 0.2);

    switch (this.boss.type) {
      case "eraser": {
        const local = this.toBossLocalSpace(
          px,
          py,
          this.getEraserRenderRotation(),
        );
        return this.isPointInLocalRect(
          local.x,
          local.y,
          0,
          0,
          radius * 0.9,
          radius * 0.45,
          padding,
        );
      }

      case "paperweight": {
        const local = this.toBossLocalSpace(px, py);
        return (
          this.isPointInLocalEllipse(
            local.x,
            local.y,
            0,
            10,
            radius * 1.1,
            radius * 0.7,
            0,
            padding,
          ) ||
          this.isPointInLocalEllipse(
            local.x,
            local.y,
            0,
            -15,
            radius * 0.8,
            radius * 0.6,
            0,
            padding,
          )
        );
      }

      case "inkblot": {
        const local = this.toBossLocalSpace(px, py, this.boss.rotation);
        const angle = Math.atan2(local.y, local.x);
        const wobble = Math.sin(angle * 5 + this.boss.pulsePhase * 3) * 15;
        return Math.hypot(local.x, local.y) <= radius * 0.9 + wobble + padding;
      }

      case "rubberband": {
        const local = this.toBossLocalSpace(px, py, this.boss.rotation);
        return Math.hypot(local.x, local.y) <= radius * 0.95 + padding;
      }

      case "stapler": {
        const local = this.toBossLocalSpace(px, py);
        const w = radius * 2;
        const h = radius * 0.6;
        const leverAngle = this.getStaplerLeverAngle();

        return (
          this.isPointInLocalRect(
            local.x,
            local.y,
            0,
            h * 0.5,
            w * 0.5,
            h * 0.5,
            padding,
          ) ||
          this.isPointInLocalRotatedRect(
            local.x,
            local.y,
            0,
            -h * 0.45,
            (w - 20) * 0.5,
            h * 0.35,
            leverAngle,
            padding,
          ) ||
          this.isPointInLocalRect(local.x, local.y, 0, h, 10, 5, padding)
        );
      }

      case "scissors": {
        const local = this.toBossLocalSpace(px, py);
        const openAngle = this.getScissorsOpenAngle();

        const leftBlade = [
          this.rotatePoint(0, 0, -openAngle),
          this.rotatePoint(-radius * 1.5, -30, -openAngle),
          this.rotatePoint(-radius * 1.4, 0, -openAngle),
          this.rotatePoint(-radius * 1.5, 30, -openAngle),
        ];

        const rightBlade = [
          this.rotatePoint(0, 0, openAngle),
          this.rotatePoint(radius * 1.5, -30, openAngle),
          this.rotatePoint(radius * 1.4, 0, openAngle),
          this.rotatePoint(radius * 1.5, 30, openAngle),
        ];

        return (
          this.isPointNearPolygon(local.x, local.y, leftBlade, padding) ||
          this.isPointNearPolygon(local.x, local.y, rightBlade, padding) ||
          Math.hypot(local.x, local.y) <= 20 + padding ||
          this.isPointInLocalEllipseRing(
            local.x,
            local.y,
            -radius * 0.3,
            radius * 0.7,
            25,
            30,
            -0.3,
            8,
            padding,
          ) ||
          this.isPointInLocalEllipseRing(
            local.x,
            local.y,
            radius * 0.3,
            radius * 0.7,
            25,
            30,
            0.3,
            8,
            padding,
          )
        );
      }

      case "pushpin": {
        const local = this.toBossLocalSpace(px, py, this.boss.rotation);
        return (
          this.isPointInLocalEllipse(
            local.x,
            local.y,
            0,
            -radius * 0.15,
            radius * 0.55,
            radius * 0.55,
            0,
            padding,
          ) ||
          this.isPointInLocalRect(
            local.x,
            local.y,
            0,
            radius * 0.55,
            10,
            radius * 0.45,
            padding,
          )
        );
      }

      case "highlighter": {
        const wobble = Math.sin(this.boss.pulsePhase) * 0.08;
        const local = this.toBossLocalSpace(px, py, wobble);
        const w = radius * 1.9;
        const h = radius * 0.7;
        return (
          this.isPointInLocalRect(
            local.x,
            local.y,
            0,
            0,
            w * 0.5,
            h * 0.5,
            padding,
          ) ||
          this.isPointInLocalRect(
            local.x,
            local.y,
            -w * 0.36 + w * 0.14,
            0,
            w * 0.14,
            (h - 16) * 0.5,
            padding,
          )
        );
      }

      case "ruler": {
        const wobble = Math.sin(this.boss.pulsePhase) * 0.04;
        const local = this.toBossLocalSpace(px, py, wobble);
        return this.isPointInLocalRect(
          local.x,
          local.y,
          0,
          0,
          radius * 1.1,
          radius * 0.225,
          padding,
        );
      }

      case "holepunch": {
        const local = this.toBossLocalSpace(px, py);
        const inBody = this.isPointInLocalRect(
          local.x,
          local.y,
          0,
          0,
          radius * 0.85,
          radius * 0.55,
          padding,
        );
        const inHole = [-28, 0, 28].some(
          (offset) =>
            Math.hypot(local.x - offset, local.y - 12) <= 11 + padding * 0.35,
        );
        return inBody && !inHole;
      }

      case "binderclip": {
        const local = this.toBossLocalSpace(px, py);
        const w = radius * 1.5;
        const h = radius * 1.2;
        return (
          this.isPointInLocalRect(
            local.x,
            local.y,
            0,
            0,
            w * 0.5,
            h * 0.5,
            padding,
          ) ||
          Math.hypot(local.x + w * 0.22, local.y + h * 0.25) <= 24 + padding ||
          Math.hypot(local.x - w * 0.22, local.y + h * 0.25) <= 24 + padding
        );
      }

      case "sharpener": {
        const local = this.toBossLocalSpace(px, py, this.boss.rotation * 0.6);
        const body = [
          { x: -radius * 0.9, y: radius * 0.6 },
          { x: -radius * 0.9, y: -radius * 0.6 },
          { x: radius * 0.8, y: -radius * 0.4 },
          { x: radius * 0.95, y: 0 },
          { x: radius * 0.8, y: radius * 0.4 },
        ];
        return (
          this.isPointNearPolygon(local.x, local.y, body, padding) ||
          Math.hypot(local.x - radius * 0.25, local.y) <= 22 + padding
        );
      }
      case "tape":
      case "gluestick":
        // Circular boss bodies
        return (
          Math.hypot(px - this.boss.x, py - this.boss.y) <= radius + padding
        );
      case "stapleremover": {
        // Two jaw rectangles — use simple circular hitbox
        return (
          Math.hypot(px - this.boss.x, py - this.boss.y) <=
          radius * 0.9 + padding
        );
      }
    }

    return false;
  }

  checkBossMinionCollisions(): void {
    // Bullets hit minions
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (!bullet.active) continue;

      for (const m of this.bossMinions) {
        if (!m.active) continue;

        const dist = distance(bullet.x, bullet.y, m.x, m.y);
        if (dist < 20) {
          m.health -= bullet.damage;
          const shouldConsumeBullet = m.type !== "rubber_minion";
          if (shouldConsumeBullet) {
            bullet.active = false;
            this.bulletPool.release(bullet);
            this.bullets.splice(i, 1);
          }

          if (m.health <= 0) {
            m.active = false;
            this.particles.emit(m.x, m.y, CONFIG.PENCIL_DARK, 10, "explosion");
            this.score += 500;
          }
          if (shouldConsumeBullet) {
            break;
          }
        }
      }
    }

    // Minions hit player
    if (this.damageTimer > 0 || this.isInvincible) return;
    for (const m of this.bossMinions) {
      if (!m.active) continue;
      const dist = distance(this.playerX, this.playerY, m.x, m.y);
      if (dist < 25) {
        this.eventBus.emit("PLAYER_HIT");
        this.audio.triggerHaptic("error");
        m.active = false; // Minion explodes on hit
        break;
      }
    }
  }

  updateBossMovement(dt: number): void {
    if (!this.boss || this.boss.entering) return;

    const config = BOSS_CONFIGS[this.boss.type];
    const moveSpeed = 2 + (this.boss.phase - 1) * 0.4;
    const margin = CONFIG.BOSS_RADIUS + 20;

    switch (config.movePattern) {
      case "static":
        // Stays in place, slight hover
        this.boss.x = lerp(this.boss.x, this.w / 2, 0.02);
        break;

      case "sway":
        // Gentle side-to-side
        const swayTarget =
          this.w / 2 + Math.sin(this.boss.movePhase * 0.8) * 120;
        this.boss.x = lerp(this.boss.x, swayTarget, 0.03);
        break;

      case "chase":
        // Follows player horizontally
        const chaseTarget = clamp(this.playerX, margin, this.w - margin);
        this.boss.x = lerp(this.boss.x, chaseTarget, 0.015);
        break;

      case "bounce":
        // Bounces off walls
        if (this.boss.vx === 0) this.boss.vx = moveSpeed;
        this.boss.x += this.boss.vx * dt * 60;
        if (this.boss.x < margin) {
          this.boss.x = margin;
          this.boss.vx = Math.abs(this.boss.vx);
          this.bossThrowAsteroid(); // Throw on bounce
          this.audio.triggerHaptic("medium");
        } else if (this.boss.x > this.w - margin) {
          this.boss.x = this.w - margin;
          this.boss.vx = -Math.abs(this.boss.vx);
          this.bossThrowAsteroid(); // Throw on bounce
          this.audio.triggerHaptic("medium");
        }
        break;

      case "zigzag":
        // Fast zigzag pattern
        const zigzagPhase = Math.floor(this.boss.movePhase * 2) % 2;
        const zigTarget = zigzagPhase === 0 ? this.w * 0.25 : this.w * 0.75;
        this.boss.x = lerp(this.boss.x, zigTarget, 0.04);
        break;

      case "circle":
        // Circular motion
        const circleRadius = 100;
        const circleSpeed = 1.5 + (this.boss.phase - 1) * 0.18;
        this.boss.x =
          this.w / 2 +
          Math.cos(this.boss.movePhase * circleSpeed) * circleRadius;
        this.boss.y =
          this.boss.targetY +
          Math.sin(this.boss.movePhase * circleSpeed) * (circleRadius * 0.5);
        break;

      case "orbit": {
        const orbitRadius = 130;
        const orbitSpeed = 1.1 + (this.boss.phase - 1) * 0.12;
        this.boss.x =
          this.w / 2 + Math.cos(this.boss.movePhase * orbitSpeed) * orbitRadius;
        this.boss.y =
          this.boss.targetY +
          Math.sin(this.boss.movePhase * orbitSpeed) * orbitRadius * 0.25;
        break;
      }

      case "sweep": {
        const sweepTarget =
          this.w / 2 + Math.sin(this.boss.movePhase * 1.2) * (this.w * 0.32);
        this.boss.x = lerp(
          this.boss.x,
          clamp(sweepTarget, margin, this.w - margin),
          0.03,
        );
        break;
      }

      case "snap": {
        const snapLane = Math.floor(this.boss.movePhase * 1.25) % 3;
        const snapTargets = [this.w * 0.22, this.w * 0.5, this.w * 0.78];
        this.boss.x = lerp(this.boss.x, snapTargets[snapLane], 0.08);
        break;
      }

      case "stomp": {
        const stompLane = Math.floor(this.boss.movePhase * 0.85) % 4;
        const laneX = [this.w * 0.2, this.w * 0.4, this.w * 0.6, this.w * 0.8][
          stompLane
        ];
        this.boss.x = lerp(this.boss.x, laneX, 0.06);
        this.boss.y =
          this.boss.targetY +
          Math.abs(Math.sin(this.boss.movePhase * 2.6)) * 45;
        break;
      }

      case "lunge": {
        const lungeTarget =
          Math.sin(this.boss.movePhase * 0.9) > 0
            ? this.w * 0.72
            : this.w * 0.28;
        this.boss.x = lerp(this.boss.x, lungeTarget, 0.05);
        break;
      }

      case "spiral": {
        const spiralRadius = 70 + Math.sin(this.boss.movePhase * 0.7) * 50;
        const spiralSpeed = 1.6 + (this.boss.phase - 1) * 0.18;
        this.boss.x =
          this.w / 2 +
          Math.cos(this.boss.movePhase * spiralSpeed) * spiralRadius;
        this.boss.y =
          this.boss.targetY +
          Math.sin(this.boss.movePhase * spiralSpeed) * spiralRadius * 0.6;
        break;
      }
    }
  }

  // Fire a single attack based on boss type
  bossFireAttack(): void {
    if (!this.boss) return;

    this.boss.totalAttacks++;

    switch (this.boss.type) {
      case "eraser":
        this.eraserAttack();
        break;
      case "paperweight":
        this.paperweightAttack();
        break;
      case "inkblot":
        this.inkblotAttack();
        break;
      case "rubberband":
        this.rubberbandAttack();
        break;
      case "stapler":
        this.staplerAttack();
        break;
      case "scissors":
        this.scissorsAttack();
        break;
      case "pushpin":
        this.pushpinAttack();
        break;
      case "highlighter":
        this.highlighterAttack();
        break;
      case "ruler":
        this.rulerAttack();
        break;
      case "holepunch":
        this.holePunchAttack();
        break;
      case "binderclip":
        this.binderClipAttack();
        break;
      case "sharpener":
        this.sharpenerAttack();
        break;
      case "tape":
        this.tapeAttack();
        break;
      case "gluestick":
        this.glueStickAttack();
        break;
      case "stapleremover":
        this.stapleRemoverAttack();
        break;
    }

    this.audio.triggerHaptic("light");
  }

  // ===== ERASER ATTACK =====
  // Throws eraser chunks that tumble toward player
  eraserAttack(): void {
    if (!this.boss) return;

    // Special ability: spawn grunt every 4th attack
    if (this.boss.totalAttacks % 4 === 0) {
      this.spawnBossMinion("eraser_grunt", this.boss.x, this.boss.y, {
        vx: (Math.random() - 0.5) * 4,
        vy: 2,
        health: 3,
      });
      this.floatingText.add(
        this.boss.x,
        this.boss.y - 20,
        "ERASER GRUNT!",
        "#f5b5c8",
        1.5,
      );
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const angle = Math.atan2(dy, dx);
    const speed = 2.8 + Math.random() * 0.5;

    // Slight spread on each shot
    const spreadAngle = angle + (Math.random() - 0.5) * 0.3;

    this.spawnBossProjectile("eraser_chunk", {
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      size: 18 + Math.random() * 8,
      color: BOSS_CONFIGS.eraser.color,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
    });
  }

  // ===== PAPERWEIGHT ATTACK =====
  // Drops heavy rocks that fall straight down with slight horizontal drift
  paperweightAttack(): void {
    if (!this.boss) return;

    // Special ability: gravity well every 5th attack
    if (this.boss.totalAttacks % 5 === 0) {
      this.spawnBossAreaEffect("gravity_well", this.playerX, this.playerY, {
        radius: 120,
        life: 4,
        color: "rgba(0,0,0,0.5)",
      });
      this.floatingText.add(
        this.playerX,
        this.playerY - 40,
        "GRAVITY WELL!",
        "#8b8b8b",
        1.5,
      );
    }

    // Rocks fall mostly down with slight aim at player
    const horizontalBias = (this.playerX - this.boss.x) * 0.01;

    this.spawnBossProjectile("rock", {
      vx: horizontalBias + (Math.random() - 0.5) * 0.5,
      vy: 2.5 + Math.random() * 1,
      size: 22 + Math.random() * 10,
      color: BOSS_CONFIGS.paperweight.color,
      rotationSpeed: (Math.random() - 0.5) * 0.08,
    });

    // Every 3rd attack, send a small seismic wave in a random direction
    if (this.boss.totalAttacks % 3 === 0) {
      const dir = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 1.5;
      const wave = this.spawnBossProjectile("seismic_wave", {
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        size: 35,
        color: "rgba(140,120,100,0.7)",
        rotationSpeed: 0,
      });
      if (wave) {
        wave.arcAngle = dir;
        wave.arcSpan = Math.PI * 0.3;
      }
    }
  }

  // ===== INK BLOT ATTACK =====
  // Sprays ink blobs in a spread pattern
  inkblotAttack(): void {
    if (!this.boss) return;

    // Keep spider pressure, but remove the old direct puddle-drop branch.
    if (this.boss.totalAttacks % 3 === 0) {
      this.spawnBossMinion("ink_spider", this.boss.x, this.boss.y, {
        health: 2,
      });
      this.floatingText.add(
        this.boss.x,
        this.boss.y - 20,
        "INK SPIDER!",
        "#2a2a4a",
        1.5,
      );
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const baseAngle = Math.atan2(dy, dx);
    const speed = 3.2;

    // Core ability: scatter warned ink drops across the player-facing side.
    {
      const predictedPlayerX = clamp(
        this.playerX + this.playerVelocityX * 110,
        50,
        this.w - 50,
      );
      const predictedPlayerY = clamp(
        this.playerY + this.playerVelocityY * 110,
        95,
        this.h - 45,
      );
      const predictedAngle = Math.atan2(
        predictedPlayerY - this.boss.y,
        predictedPlayerX - this.boss.x,
      );
      const targetPositions: Array<{ x: number; y: number }> = [];
      const targetCount = 8;
      const minSpacing = 85;

      for (let i = 0; i < targetCount; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 12 && !placed; attempt++) {
          const angleOffset = randomRange(-0.95, 0.95);
          const distFromBoss = randomRange(
            140,
            Math.min(Math.hypot(this.w, this.h) * 0.62, this.h + 80),
          );
          const targetX = clamp(
            this.boss.x + Math.cos(predictedAngle + angleOffset) * distFromBoss,
            50,
            this.w - 50,
          );
          const targetY = clamp(
            this.boss.y + Math.sin(predictedAngle + angleOffset) * distFromBoss,
            95,
            this.h - 45,
          );
          const overlapsExisting = targetPositions.some(
            (p) => distance(p.x, p.y, targetX, targetY) < minSpacing,
          );
          if (!overlapsExisting) {
            targetPositions.push({ x: targetX, y: targetY });
            placed = true;
          }
        }
        if (!placed) {
          targetPositions.push({
            x: clamp(
              predictedPlayerX + randomRange(-180, 180),
              50,
              this.w - 50,
            ),
            y: clamp(
              predictedPlayerY + randomRange(-150, 150),
              95,
              this.h - 45,
            ),
          });
        }
      }

      for (let i = 0; i < targetPositions.length; i++) {
        const target = targetPositions[i];
        this.spawnBossAreaEffect("ink_puddle", target.x, target.y, {
          radius: 34 + this.boss.phase * 5,
          life: 3.4,
          warmup: 0.45 + i * 0.22,
          color: "rgba(42,42,74,0.32)",
        });
      }

      this.floatingText.add(
        predictedPlayerX,
        predictedPlayerY - 28,
        "INK STORM!",
        "#2a2a4a",
        1.6,
      );
    }

    // Spray 3 ink blobs in a fan
    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * 0.35;
      this.spawnBossProjectile("ink_blob", {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 12 + Math.random() * 6,
        color: BOSS_CONFIGS.inkblot.color,
        rotationSpeed: 0,
      });
    }
  }

  // ===== RUBBER BAND ATTACK =====
  // Shoots stretchy rubber bands that wobble toward player
  rubberbandAttack(): void {
    if (!this.boss) return;

    // Special ability: extra asteroids on every 4th attack
    if (this.boss.totalAttacks % 4 === 0) {
      this.bossThrowAsteroid();
      this.bossThrowAsteroid();
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const angle = Math.atan2(dy, dx);
    const speed = 3.5;

    // Shoot rubber bands in a spiral pattern
    const spiralOffset = (this.boss.totalAttacks % 8) * 0.4;
    const finalAngle = angle + Math.sin(spiralOffset) * 0.5;

    const proj = this.spawnBossProjectile("rubber_band", {
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      size: 20,
      color: BOSS_CONFIGS.rubberband.color,
      rotationSpeed: 0.1,
    });
    if (proj) {
      proj.stretchPhase = 0;
    }
  }

  // ===== STAPLER ATTACK =====
  // Fires staples in rapid succession - they're small but fast
  staplerAttack(): void {
    if (!this.boss) return;

    // Special ability: staple sentry every 10th attack (it fires a lot of staples)
    if (this.boss.totalAttacks % 10 === 0) {
      this.spawnBossMinion(
        "staple_sentry",
        this.boss.x + (Math.random() - 0.5) * 200,
        100,
        {
          health: 10,
          angle: Math.random() * Math.PI * 2,
        },
      );
      this.floatingText.add(
        this.boss.x,
        this.boss.y - 20,
        "STAPLE SENTRY!",
        "#4a4a4a",
        1.5,
      );
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const baseAngle = Math.atan2(dy, dx);
    const speed = 5; // Fast staples!

    // Slight wobble pattern based on attack count
    const wobble = Math.sin(this.boss.totalAttacks * 0.5) * 0.15;
    const angle = baseAngle + wobble;

    this.spawnBossProjectile("staple", {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 8,
      color: "#c0c0c0",
      rotationSpeed: 0,
    });
  }

  // ===== SCISSORS ATTACK =====
  // Fires scissor blades in V-patterns that close together
  scissorsAttack(): void {
    if (!this.boss) return;

    // Special ability: blade drone or diagonal cuts every 4th attack
    if (this.boss.totalAttacks % 4 === 0) {
      if (Math.random() > 0.5) {
        this.spawnBossMinion("blade_drone", this.boss.x, this.boss.y, {
          health: 5,
        });
        this.floatingText.add(
          this.boss.x,
          this.boss.y - 20,
          "BLADE DRONE!",
          "#c0c0c0",
          1.5,
        );
      } else {
        // Diagonal cut across screen
        const x1 = Math.random() > 0.5 ? 0 : this.w;
        const y1 = Math.random() * this.h;
        const x2 = this.w - x1;
        const y2 = this.h - y1;
        this.spawnBossAreaEffect("paper_cut", x1, y1, {
          x2: x2,
          y2: y2,
          life: 3,
          color: "#ff6600",
        });
        this.floatingText.add(
          this.w / 2,
          this.h / 2,
          "PAPER CUT!",
          "#ff6600",
          2,
        );
      }
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const baseAngle = Math.atan2(dy, dx);
    const speed = 3.8;

    // Fire two blades in a V pattern
    const leftAngle = baseAngle - 0.4;
    const rightAngle = baseAngle + 0.4;

    const leftBlade = this.spawnBossProjectile("blade", {
      vx: Math.cos(leftAngle) * speed,
      vy: Math.sin(leftAngle) * speed,
      size: 25,
      color: BOSS_CONFIGS.scissors.color,
      rotationSpeed: 0.12,
    });
    if (leftBlade) leftBlade.bladeAngle = leftAngle;

    const rightBlade = this.spawnBossProjectile("blade", {
      vx: Math.cos(rightAngle) * speed,
      vy: Math.sin(rightAngle) * speed,
      size: 25,
      color: BOSS_CONFIGS.scissors.color,
      rotationSpeed: -0.12,
    });
    if (rightBlade) rightBlade.bladeAngle = rightAngle;
  }

  pushpinAttack(): void {
    if (!this.boss) return;

    const fanCount = 3 + Math.min(2, this.boss.phase - 1);
    const baseAngle = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );
    for (let i = 0; i < fanCount; i++) {
      const offset = (i - (fanCount - 1) / 2) * 0.18;
      this.spawnBossProjectile("push_pin", {
        vx:
          Math.cos(baseAngle + offset) * this.getBossPhaseProjectileSpeed(4.2),
        vy:
          Math.sin(baseAngle + offset) * this.getBossPhaseProjectileSpeed(4.2),
        size: 12,
        color: BOSS_CONFIGS.pushpin.color,
        rotationSpeed: 0.16,
      });
    }
    if (this.boss.totalAttacks % 5 === 0) {
      this.spawnBossMinion("pin_satellite", this.boss.x, this.boss.y, {
        health: 4 + this.boss.phase,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  highlighterAttack(): void {
    if (!this.boss) return;

    const stampCount = 1 + Math.min(2, this.boss.phase - 1);
    const predictedX = clamp(
      this.playerX + this.playerVelocityX * 85,
      60,
      this.w - 60,
    );
    const predictedY = clamp(
      this.playerY + this.playerVelocityY * 85,
      150,
      this.h - 85,
    );
    const lateralBase = 70 + this.boss.phase * 10;

    for (let i = 0; i < stampCount; i++) {
      const side =
        stampCount === 1 ? 0 : (i - (stampCount - 1) / 2) * lateralBase;
      this.spawnBossAreaEffect(
        "highlight_stamp",
        clamp(predictedX + side, 60, this.w - 60),
        predictedY,
        {
          radius: 30 + this.boss.phase * 4,
          life: 2.3,
          warmup: 0.55 + i * 0.14,
          color: "rgba(243,232,90,0.45)",
        },
      );
    }

    const boltCount = 1 + Math.min(2, this.boss.phase - 1);
    const baseDir = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );
    for (let i = 0; i < boltCount; i++) {
      const offset = (i - (boltCount - 1) / 2) * 0.14;
      this.spawnBossProjectile("marker_bolt", {
        vx: Math.cos(baseDir + offset) * this.getBossPhaseProjectileSpeed(3.9),
        vy: Math.sin(baseDir + offset) * this.getBossPhaseProjectileSpeed(3.9),
        size: 18,
        color: BOSS_CONFIGS.highlighter.accentColor,
        rotationSpeed: 0.06,
      });
    }
  }

  isRulerBeamOverlapping(
    newX: number,
    newY: number,
    isVertical: boolean,
    minGap: number = 45,
  ): boolean {
    return this.bossAreaEffects.some(
      (e) =>
        e.active &&
        e.type === "ruler_beam" &&
        (isVertical
          ? Math.abs(e.x - newX) < minGap
          : Math.abs(e.y - newY) < minGap),
    );
  }

  rulerAttack(): void {
    if (!this.boss) return;

    const targetX = clamp(this.playerX, 20, this.w - 20);
    if (!this.isRulerBeamOverlapping(targetX, 0, true)) {
      this.spawnBossAreaEffect("ruler_beam", targetX, 0, {
        x2: targetX,
        y2: this.h,
        radius: 10 + this.boss.phase * 2,
        life: 2.6,
        warmup: 1.5,
        color: "rgba(160,120,70,0.7)",
      });
    }

    // Every 3rd attack, add a horizontal beam
    if (this.boss.totalAttacks % 3 === 0) {
      const beamY = clamp(this.playerY, 160, this.h - 100);
      if (!this.isRulerBeamOverlapping(0, beamY, false)) {
        this.spawnBossAreaEffect("ruler_beam", 0, beamY, {
          x2: this.w,
          y2: beamY,
          radius: 8,
          life: 2.6,
          warmup: 1.5,
          color: "rgba(160,120,70,0.55)",
        });
      }
    }
  }

  holePunchAttack(): void {
    if (!this.boss) return;

    const zoneCount = 1 + Math.min(2, this.boss.phase - 1);
    for (let i = 0; i < zoneCount; i++) {
      const laneX = this.w * (0.25 + Math.random() * 0.5);
      const laneY = this.h * (0.35 + Math.random() * 0.25);
      this.spawnBossAreaEffect("punch_zone", laneX, laneY, {
        radius: 34 + this.boss.phase * 4,
        life: 1.45,
        warmup: 0.7,
        color: "rgba(199,208,218,0.28)",
      });
    }
  }

  binderClipAttack(): void {
    if (!this.boss) return;

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const baseAngle = Math.atan2(dy, dx);
    const shardCount = 2 + Math.min(2, this.boss.phase - 1);
    const spreadBase = baseAngle + randomRange(-0.38, 0.38);
    for (let i = 0; i < shardCount; i++) {
      const offset = (i - (shardCount - 1) / 2) * 0.3 + randomRange(-0.1, 0.1);
      this.spawnBossProjectile("clip_shard", {
        vx:
          Math.cos(spreadBase + offset) *
          this.getBossPhaseProjectileSpeed(4 + Math.random() * 0.45),
        vy:
          Math.sin(spreadBase + offset) *
          this.getBossPhaseProjectileSpeed(4 + Math.random() * 0.45),
        size: 16,
        color: BOSS_CONFIGS.binderclip.accentColor,
        rotationSpeed: 0.12,
      });
    }
  }

  sharpenerAttack(): void {
    if (!this.boss) return;

    const bladeCount = 4 + this.boss.phase;
    const baseAngle = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );
    for (let i = 0; i < bladeCount; i++) {
      const angle = baseAngle + (i - (bladeCount - 1) / 2) * 0.14;
      this.spawnBossProjectile("shaving", {
        vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(4.8),
        vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(4.8),
        size: 13,
        color: BOSS_CONFIGS.sharpener.accentColor,
        rotationSpeed: 0.16,
      });
    }
    if (this.boss.totalAttacks % 4 === 0) {
      this.spawnBossProjectile("ruler_chip", {
        vx: Math.cos(baseAngle) * this.getBossPhaseProjectileSpeed(5.1),
        vy: Math.sin(baseAngle) * this.getBossPhaseProjectileSpeed(5.1),
        size: 20,
        color: BOSS_CONFIGS.sharpener.color,
        rotationSpeed: 0.08,
      });
    }
  }

  // ===== TAPE ATTACK =====
  // Fires sticky tape strips in an arc toward player; every 3rd attack lays a tape area trap
  tapeAttack(): void {
    if (!this.boss) return;

    const angle = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );
    const spreadCount = 2 + this.boss.phase;
    for (let i = 0; i < spreadCount; i++) {
      const spread = (i - (spreadCount - 1) / 2) * 0.22;
      this.spawnBossProjectile("tape_strip", {
        vx: Math.cos(angle + spread) * this.getBossPhaseProjectileSpeed(3.4),
        vy: Math.sin(angle + spread) * this.getBossPhaseProjectileSpeed(3.4),
        size: 20,
        color: BOSS_CONFIGS.tape.color,
        rotationSpeed: 0.06,
      });
    }

    if (this.boss.totalAttacks % 3 === 0) {
      // Lay a sticky tape zone at a random screen position
      const tx = randomRange(80, this.w - 80);
      const ty = randomRange(this.h * 0.3, this.h * 0.8);
      this.spawnBossAreaEffect("ink_pool", tx, ty, {
        radius: 55,
        life: 6.0,
        warmup: 0.5,
        color: "rgba(200,230,245,0.5)",
      });
    }
  }

  // ===== GLUE STICK ATTACK =====
  // Lobs slow glue blobs that create large sticky pools on impact; faster aimed shot every 4th
  glueStickAttack(): void {
    if (!this.boss) return;

    const angle = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );
    // Arc shot with some spread
    const spread = (Math.random() - 0.5) * 0.5;
    this.spawnBossProjectile("glue_blob", {
      vx: Math.cos(angle + spread) * this.getBossPhaseProjectileSpeed(2.6),
      vy: Math.sin(angle + spread) * this.getBossPhaseProjectileSpeed(2.6),
      size: 24,
      color: BOSS_CONFIGS.gluestick.accentColor,
      rotationSpeed: 0.03,
    });

    if (this.boss.totalAttacks % 4 === 0) {
      // Fast aimed shot
      this.spawnBossProjectile("glue_blob", {
        vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(4.8),
        vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(4.8),
        size: 14,
        color: BOSS_CONFIGS.gluestick.color,
        rotationSpeed: 0.1,
      });
    }

    if (this.boss.totalAttacks % 5 === 0) {
      // Drop a glue pool near the player
      this.spawnBossAreaEffect("glue_zone", this.playerX, this.playerY + 40, {
        radius: 70,
        life: 5.5,
        warmup: 0.7,
        color: "rgba(245,166,35,0.35)",
      });
    }
  }

  // ===== STAPLE REMOVER ATTACK =====
  // Fires a cross pattern of fast staples plus an aimed claw fang every other wave
  stapleRemoverAttack(): void {
    if (!this.boss) return;

    const angle = Math.atan2(
      this.playerY - this.boss.y,
      this.playerX - this.boss.x,
    );

    // Aimed burst of staples
    const burstCount = 3 + this.boss.phase;
    for (let i = 0; i < burstCount; i++) {
      const spread = (i - (burstCount - 1) / 2) * 0.16;
      this.spawnBossProjectile("staple", {
        vx: Math.cos(angle + spread) * this.getBossPhaseProjectileSpeed(4.5),
        vy: Math.sin(angle + spread) * this.getBossPhaseProjectileSpeed(4.5),
        size: 10,
        color: BOSS_CONFIGS.stapleremover.color,
        rotationSpeed: 0.15,
      });
    }

    // Every even wave: fire a claw fang from the boss position
    if (this.boss.totalAttacks % 2 === 0) {
      this.spawnBossProjectile("claw_fang", {
        vx: Math.cos(angle) * this.getBossPhaseProjectileSpeed(5.0),
        vy: Math.sin(angle) * this.getBossPhaseProjectileSpeed(5.0),
        size: 24,
        color: BOSS_CONFIGS.stapleremover.accentColor,
        rotationSpeed: -0.12,
      });
    }

    // Every 3rd wave: spawn a spiral of staples
    if (this.boss.totalAttacks % 3 === 0) {
      const spiralCount = 8;
      for (let i = 0; i < spiralCount; i++) {
        const a = (i / spiralCount) * Math.PI * 2;
        this.spawnBossProjectile("staple", {
          vx: Math.cos(a) * this.getBossPhaseProjectileSpeed(3.2),
          vy: Math.sin(a) * this.getBossPhaseProjectileSpeed(3.2),
          size: 9,
          color: "#ff8888",
          rotationSpeed: 0.2,
        });
      }
    }
  }

  // Spawn a boss minion
  spawnBossMinion(
    type: BossMinion["type"],
    x: number,
    y: number,
    options: {
      vx?: number;
      vy?: number;
      health?: number;
      angle?: number;
    } = {},
  ): BossMinion {
    const minion: BossMinion = {
      id: ++this.bossMinionIdCounter,
      type: type,
      x: x,
      y: y,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      health: options.health ?? 5,
      maxHealth: options.health ?? 5,
      active: true,
      timer: 0,
      angle: options.angle ?? 0,
    };
    this.bossMinions.push(minion);
    return minion;
  }

  // Spawn a boss area effect
  spawnBossAreaEffect(
    type: BossAreaEffect["type"],
    x: number,
    y: number,
    options: {
      x2?: number;
      y2?: number;
      radius?: number;
      life?: number;
      color?: string;
      aimAngle?: number;
      arcWidth?: number;
      vx?: number;
      vy?: number;
      warmup?: number;
      label?: string;
      projectileCount?: number;
      projectileAngle?: number;
      splashTimer?: number;
    } = {},
  ): BossAreaEffect {
    const effect: BossAreaEffect = {
      id: ++this.bossAreaEffectIdCounter,
      type: type,
      x: x,
      y: y,
      x2: options.x2,
      y2: options.y2,
      radius: options.radius ?? 50,
      life: options.life ?? 3,
      maxLife: options.life ?? 3,
      active: true,
      color: options.color ?? "rgba(0,0,0,0.2)",
      aimAngle: options.aimAngle,
      arcWidth: options.arcWidth,
      hasDamaged: false,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      warmup: options.warmup ?? 0,
      label: options.label,
      projectileCount: options.projectileCount,
      projectileAngle: options.projectileAngle,
      splashTimer: options.splashTimer ?? 0,
    };
    this.bossAreaEffects.push(effect);
    return effect;
  }

  // Spawn a boss-specific projectile
  spawnBossProjectile(
    type: BossProjectile["type"],
    options: {
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotationSpeed: number;
    },
  ): BossProjectile | null {
    if (!this.boss) return null;

    const proj: BossProjectile = {
      id: ++this.bossProjectileIdCounter,
      type: type,
      x: this.boss.x,
      y: this.boss.y + CONFIG.BOSS_RADIUS * 0.6,
      vx: options.vx,
      vy: options.vy,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: options.rotationSpeed,
      size: options.size,
      damage: 1,
      active: true,
      age: 0,
      color: options.color,
    };

    this.bossProjectiles.push(proj);
    return proj;
  }

  // Legacy function for bounce attacks (rubber band still throws asteroids on bounce)
  bossThrowAsteroid(): void {
    if (!this.boss) return;

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 3;

    this.spawnBossAsteroid((dx / dist) * speed, (dy / dist) * speed);
  }

  spawnBossAsteroid(vx: number, vy: number): void {
    if (!this.boss) return;

    const asteroid = this.asteroidPool.acquire();
    if (!asteroid) return;

    asteroid.id = ++this.asteroidIdCounter;
    asteroid.size = "large";
    asteroid.maxHealth = CONFIG.BOSS_ASTEROID_HEALTH;
    asteroid.health = CONFIG.BOSS_ASTEROID_HEALTH;
    asteroid.x = this.boss.x;
    asteroid.y = this.boss.y + CONFIG.BOSS_RADIUS * 0.8;
    asteroid.vx = vx;
    asteroid.vy = vy;
    asteroid.rotation = Math.random() * Math.PI * 2;
    asteroid.rotationSpeed = randomRange(-2, 2);
    asteroid.active = true;
    asteroid.hitFlash = 0;
    asteroid.isBossAsteroid = true;

    this.asteroids.push(asteroid);
  }

  // Draw boss projectiles
  drawBossProjectiles(): void {
    const ctx = this.ctx;

    for (const proj of this.bossProjectiles) {
      if (!proj.active) continue;

      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(proj.rotation);

      switch (proj.type) {
        case "eraser_chunk":
          // Pink eraser chunk
          ctx.fillStyle = proj.color;
          ctx.strokeStyle = BOSS_CONFIGS.eraser.accentColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(
            -proj.size / 2,
            -proj.size / 3,
            proj.size,
            proj.size * 0.6,
            4,
          );
          ctx.fill();
          ctx.stroke();
          break;

        case "rock":
          // Gray rock
          ctx.fillStyle = proj.color;
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Irregular rock shape
          const points = 6;
          for (let i = 0; i <= points; i++) {
            const a = (i / points) * Math.PI * 2;
            const r = proj.size * (0.8 + Math.sin(i * 2.3) * 0.2);
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;

        case "ink_blob":
          // Dark ink blob
          ctx.fillStyle = proj.color;
          ctx.beginPath();
          // Blobby shape
          const blobPoints = 8;
          for (let i = 0; i <= blobPoints; i++) {
            const a = (i / blobPoints) * Math.PI * 2;
            const wobble = Math.sin(proj.age * 10 + i * 1.5) * 3;
            const r = proj.size + wobble;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          // Ink drip
          ctx.beginPath();
          ctx.ellipse(
            0,
            proj.size,
            proj.size * 0.3,
            proj.size * 0.5,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          break;

        case "rubber_band":
          // Stretchy rubber band
          const stretch = 1 + Math.sin(proj.stretchPhase || 0) * 0.3;
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            proj.size * stretch,
            proj.size / stretch,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          // Inner band
          ctx.strokeStyle = BOSS_CONFIGS.rubberband.accentColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            proj.size * stretch * 0.7,
            (proj.size / stretch) * 0.7,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          break;

        case "staple":
          // Metal staple
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 3;
          ctx.lineCap = "square";
          ctx.beginPath();
          ctx.moveTo(-proj.size, -proj.size / 2);
          ctx.lineTo(-proj.size, proj.size / 2);
          ctx.lineTo(proj.size, proj.size / 2);
          ctx.lineTo(proj.size, -proj.size / 2);
          ctx.stroke();
          break;

        case "blade":
          // Scissor blade
          ctx.fillStyle = proj.color;
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-proj.size, 0);
          ctx.lineTo(0, -proj.size * 0.3);
          ctx.lineTo(proj.size, 0);
          ctx.lineTo(0, proj.size * 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Sharp edge highlight
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-proj.size * 0.8, -proj.size * 0.1);
          ctx.lineTo(proj.size * 0.5, -proj.size * 0.1);
          ctx.stroke();
          break;

        case "seismic_wave": {
          ctx.restore();
          ctx.save();
          ctx.translate(proj.x, proj.y);

          const waveDir = proj.arcAngle ?? 0;
          const span = proj.arcSpan ?? Math.PI * 0.3;
          const waveR = proj.size + proj.age * 15;

          // Outer danger arc
          ctx.strokeStyle = "rgba(180, 100, 60, 0.8)";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, waveR, waveDir - span, waveDir + span);
          ctx.stroke();

          // Inner glow
          ctx.strokeStyle = "rgba(255, 180, 80, 0.4)";
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(0, 0, waveR, waveDir - span, waveDir + span);
          ctx.stroke();

          // Trailing arc (fading)
          const trailR = Math.max(0, waveR - 15);
          if (trailR > 0) {
            ctx.strokeStyle = "rgba(140, 120, 100, 0.3)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, trailR, waveDir - span * 0.8, waveDir + span * 0.8);
            ctx.stroke();
          }
          break;
        }

        case "push_pin":
          ctx.fillStyle = proj.color;
          ctx.beginPath();
          ctx.arc(0, -proj.size * 0.3, proj.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = BOSS_CONFIGS.pushpin.accentColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -proj.size * 0.05);
          ctx.lineTo(0, proj.size);
          ctx.stroke();
          break;

        case "marker_bolt":
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = proj.size * 0.45;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-proj.size, 0);
          ctx.lineTo(proj.size, 0);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-proj.size * 0.8, -2);
          ctx.lineTo(proj.size * 0.8, -2);
          ctx.stroke();
          break;

        case "ruler_chip":
          ctx.fillStyle = proj.color;
          ctx.fillRect(
            -proj.size,
            -proj.size * 0.35,
            proj.size * 2,
            proj.size * 0.7,
          );
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 2;
          ctx.strokeRect(
            -proj.size,
            -proj.size * 0.35,
            proj.size * 2,
            proj.size * 0.7,
          );
          break;

        case "paper_chad":
          ctx.fillStyle = CONFIG.PAPER_BG;
          ctx.beginPath();
          ctx.arc(0, 0, proj.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;

        case "clip_shard":
          ctx.fillStyle = proj.color;
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-proj.size, -proj.size * 0.3);
          ctx.lineTo(proj.size * 0.7, -proj.size * 0.1);
          ctx.lineTo(proj.size, proj.size * 0.4);
          ctx.lineTo(-proj.size * 0.6, proj.size * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;

        case "shaving":
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, proj.size * 0.7, Math.PI * 0.2, Math.PI * 1.5);
          ctx.stroke();
          ctx.strokeStyle = BOSS_CONFIGS.sharpener.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(2, 1, proj.size * 0.35, Math.PI * 0.2, Math.PI * 1.5);
          ctx.stroke();
          break;

        case "tape_strip":
          // Semi-transparent light-blue rectangle strip
          ctx.fillStyle = proj.color;
          ctx.globalAlpha = 0.75;
          ctx.fillRect(
            -proj.size * 0.5,
            -proj.size * 0.2,
            proj.size,
            proj.size * 0.4,
          );
          ctx.globalAlpha = 1;
          ctx.strokeStyle = BOSS_CONFIGS.tape.accentColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(
            -proj.size * 0.5,
            -proj.size * 0.2,
            proj.size,
            proj.size * 0.4,
          );
          break;

        case "glue_blob":
          // Viscous amber/yellow blob with glossy highlight
          ctx.beginPath();
          ctx.arc(0, 0, proj.size, 0, Math.PI * 2);
          ctx.fillStyle = proj.color;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = BOSS_CONFIGS.gluestick.color;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Shine
          ctx.beginPath();
          ctx.arc(
            -proj.size * 0.3,
            -proj.size * 0.3,
            proj.size * 0.25,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.fill();
          break;

        case "claw_fang":
          // Two sharp curved fangs in a V shape
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(0, -proj.size * 0.6);
          ctx.bezierCurveTo(
            -proj.size * 0.5,
            0,
            -proj.size * 0.3,
            proj.size * 0.5,
            -proj.size * 0.1,
            proj.size * 0.7,
          );
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -proj.size * 0.6);
          ctx.bezierCurveTo(
            proj.size * 0.5,
            0,
            proj.size * 0.3,
            proj.size * 0.5,
            proj.size * 0.1,
            proj.size * 0.7,
          );
          ctx.stroke();
          // Glowing core dot
          ctx.beginPath();
          ctx.arc(0, 0, proj.size * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = BOSS_CONFIGS.stapleremover.accentColor;
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }

  drawBossMinions(): void {
    const ctx = this.ctx;
    for (const m of this.bossMinions) {
      if (!m.active) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);

      switch (m.type) {
        case "eraser_grunt":
          ctx.fillStyle = BOSS_CONFIGS.eraser.color;
          ctx.strokeStyle = BOSS_CONFIGS.eraser.accentColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-15, -10, 30, 20, 5);
          ctx.fill();
          ctx.stroke();
          // Angry eyes
          ctx.fillStyle = "white";
          ctx.fillRect(-8, -5, 4, 4);
          ctx.fillRect(4, -5, 4, 4);
          break;
        case "ink_spider":
          ctx.fillStyle = BOSS_CONFIGS.inkblot.color;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          // Legs
          ctx.strokeStyle = BOSS_CONFIGS.inkblot.color;
          ctx.lineWidth = 2;
          for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2 + this.survivalTime * 0.01;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
            ctx.stroke();
          }
          break;
        case "staple_sentry":
          ctx.fillStyle = "#4a4a4a";
          ctx.strokeStyle = "#2d2d2d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-12, -12, 24, 24, 3);
          ctx.fill();
          ctx.stroke();
          // Core
          ctx.fillStyle = "#ff4444";
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "blade_drone":
          ctx.fillStyle = "#c0c0c0";
          ctx.strokeStyle = "#2d2d2d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-20, 0);
          ctx.lineTo(0, -10);
          ctx.lineTo(20, 0);
          ctx.lineTo(0, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Propeller
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 25, 5, this.survivalTime * 0.02, 0, Math.PI * 2);
          ctx.stroke();
          break;

        case "stick_man":
          // Draw a little stick person
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 2;
          const legSwing = Math.sin(m.phase || 0) * 10;

          // Head
          ctx.beginPath();
          ctx.arc(0, -25, 6, 0, Math.PI * 2);
          ctx.stroke();
          // Body
          ctx.beginPath();
          ctx.moveTo(0, -19);
          ctx.lineTo(0, -5);
          ctx.stroke();
          // Legs
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(-legSwing, 10);
          ctx.moveTo(0, -5);
          ctx.lineTo(legSwing, 10);
          ctx.stroke();
          // Arms
          ctx.beginPath();
          ctx.moveTo(0, -15);
          ctx.lineTo(-10, -10 + legSwing / 2);
          ctx.moveTo(0, -15);
          ctx.lineTo(10, -10 - legSwing / 2);
          ctx.stroke();
          break;
        case "pin_satellite":
          ctx.fillStyle = BOSS_CONFIGS.pushpin.color;
          ctx.beginPath();
          ctx.arc(0, -10, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = BOSS_CONFIGS.pushpin.accentColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.lineTo(0, 18);
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(0, -10, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "rubber_minion":
          ctx.strokeStyle = BOSS_CONFIGS.rubberband.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(0, 0, 18, 12, m.angle, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = BOSS_CONFIGS.rubberband.accentColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 8, m.angle, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "marker_helper":
          ctx.fillStyle = BOSS_CONFIGS.highlighter.color;
          ctx.beginPath();
          ctx.roundRect(-18, -8, 36, 16, 6);
          ctx.fill();
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = BOSS_CONFIGS.highlighter.accentColor;
          ctx.fillRect(-14, -4, 10, 8);
          this.drawBossEyes(ctx, -6, 0, 8, 0, 0.45);
          break;
      }
      ctx.restore();
    }
  }

  drawBossAreaEffects(): void {
    const ctx = this.ctx;
    for (const ef of this.bossAreaEffects) {
      if (!ef.active) continue;
      ctx.save();

      const opacity = Math.min(1, ef.life / 0.5) * 0.4;
      const warmupAlpha = (ef.warmup ?? 0) > 0 ? 0.25 : 1;
      ctx.globalAlpha = opacity;

      switch (ef.type) {
        case "ink_puddle":
          ctx.beginPath();
          for (let j = 0; j < 12; j++) {
            const a = (j / 12) * Math.PI * 2;
            const r = ef.radius * (0.8 + Math.sin(j * 1.7) * 0.2);
            if (j === 0)
              ctx.moveTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
            else ctx.lineTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
          }
          ctx.closePath();
          if ((ef.warmup ?? 0) > 0) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = "#111111";
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = "rgba(42,42,74,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ef.x, ef.y, ef.radius * 0.95, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.globalAlpha = opacity * 0.95;
            ctx.fillStyle = ef.color;
            ctx.fill();
            if ((ef.splashTimer ?? 0) > 0) {
              const splashT = (ef.splashTimer ?? 0) / 0.24;
              ctx.globalAlpha = Math.min(1, splashT) * 0.75;
              ctx.strokeStyle = "rgba(28, 28, 56, 0.95)";
              ctx.lineWidth = 4;
              ctx.beginPath();
              for (let j = 0; j < 10; j++) {
                const a = (j / 10) * Math.PI * 2;
                const innerR = ef.radius * 0.45;
                const outerR = ef.radius * (0.85 + (j % 2) * 0.2);
                ctx.moveTo(
                  ef.x + Math.cos(a) * innerR,
                  ef.y + Math.sin(a) * innerR,
                );
                ctx.lineTo(
                  ef.x + Math.cos(a) * outerR,
                  ef.y + Math.sin(a) * outerR,
                );
              }
              ctx.stroke();
            }
          }
          break;
        case "highlight_stamp":
          if ((ef.warmup ?? 0) > 0) {
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = "rgba(243,232,90,0.8)";
            ctx.beginPath();
            ctx.roundRect(
              ef.x - ef.radius * 0.95,
              ef.y - ef.radius * 0.55,
              ef.radius * 1.9,
              ef.radius * 1.1,
              14,
            );
            ctx.fill();
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.roundRect(
              ef.x - ef.radius,
              ef.y - ef.radius * 0.6,
              ef.radius * 2,
              ef.radius * 1.2,
              14,
            );
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.globalAlpha = opacity * 0.95;
            ctx.fillStyle = ef.color;
            ctx.beginPath();
            ctx.roundRect(
              ef.x - ef.radius,
              ef.y - ef.radius * 0.58,
              ef.radius * 2,
              ef.radius * 1.16,
              14,
            );
            ctx.fill();
            ctx.strokeStyle = "rgba(142,214,65,0.95)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(ef.x - ef.radius * 0.75, ef.y);
            ctx.lineTo(ef.x + ef.radius * 0.75, ef.y);
            ctx.stroke();
            if ((ef.splashTimer ?? 0) > 0) {
              ctx.globalAlpha = Math.min(1, (ef.splashTimer ?? 0) / 0.2) * 0.8;
              ctx.strokeStyle = "rgba(255,255,180,0.95)";
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(ef.x, ef.y, ef.radius * 0.85, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          break;
        case "gravity_well":
          const gradient = ctx.createRadialGradient(
            ef.x,
            ef.y,
            0,
            ef.x,
            ef.y,
            ef.radius,
          );
          gradient.addColorStop(0, "rgba(0,0,0,0.8)");
          gradient.addColorStop(1, "transparent");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(ef.x, ef.y, ef.radius, 0, Math.PI * 2);
          ctx.fill();
          // Swirl effect
          ctx.strokeStyle = "white";
          ctx.lineWidth = 1;
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.arc(
              ef.x,
              ef.y,
              ef.radius * (0.3 + j * 0.2),
              this.survivalTime * 0.005 + j,
              this.survivalTime * 0.005 + j + 2,
            );
            ctx.stroke();
          }
          break;
        case "paper_cut":
          if (ef.x2 !== undefined && ef.y2 !== undefined) {
            const isWarning = (ef.warmup ?? 0) > 0;
            ctx.strokeStyle = isWarning ? "#ffffff" : ef.color;
            ctx.lineWidth = isWarning ? 4 : 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (isWarning) {
              ctx.globalAlpha = 1;
              ctx.strokeStyle = "white";
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(ef.x, ef.y);
              ctx.lineTo(ef.x2, ef.y2);
              ctx.stroke();
            }
          }
          break;

        case "highlight_band":
          if (ef.x2 !== undefined && ef.y2 !== undefined) {
            const bandActive = (ef.warmup ?? 0) <= 0;
            ctx.globalAlpha = opacity * (bandActive ? 1 : warmupAlpha);
            ctx.strokeStyle = bandActive ? "rgba(220,50,0,0.85)" : ef.color;
            ctx.lineWidth = ef.radius * 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
          }
          break;

        case "ruler_beam":
          if (ef.x2 !== undefined && ef.y2 !== undefined) {
            const rulerActive = (ef.warmup ?? 0) <= 0;
            ctx.globalAlpha = opacity * (rulerActive ? 1 : warmupAlpha);
            ctx.strokeStyle = rulerActive ? "rgba(220,0,0,0.85)" : ef.color;
            ctx.lineWidth = ef.radius * 2;
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
            // Dashed overlay: dark during warning, bright red outline when active
            ctx.strokeStyle = rulerActive
              ? "rgba(255,80,80,0.6)"
              : CONFIG.PENCIL_DARK;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (ef.label) {
              ctx.fillStyle = rulerActive ? "#ff3333" : CONFIG.PENCIL_DARK;
              ctx.font = "bold 16px " + CONFIG.FONT_FAMILY;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const midX = (ef.x + ef.x2) * 0.5;
              const midY = (ef.y + ef.y2) * 0.5;
              ctx.fillText(ef.label, midX, midY);
            }
          }
          break;

        case "punch_zone":
          ctx.globalAlpha = (ef.warmup ?? 0) > 0 ? 0.35 : 0.55;
          ctx.fillStyle = ef.color;
          ctx.beginPath();
          ctx.arc(ef.x, ef.y, ef.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = CONFIG.PENCIL_DARK;
          ctx.lineWidth = 3;
          ctx.stroke();
          break;

        case "clamp_wall":
          if (ef.x2 !== undefined && ef.y2 !== undefined) {
            ctx.globalAlpha = opacity * warmupAlpha;
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = ef.radius * 2;
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
          }
          break;

        case "shockwave": {
          const shockR = (1 - ef.life / ef.maxLife) * ef.radius;
          const fadeAlpha = Math.min(1, ef.life / (ef.maxLife * 0.3));

          if (ef.aimAngle !== undefined && ef.arcWidth !== undefined) {
            const startDanger = ef.aimAngle - ef.arcWidth;
            const endDanger = ef.aimAngle + ef.arcWidth;

            // Danger arc -- thick, bright, red-tinted
            ctx.globalAlpha = fadeAlpha * 0.9;
            ctx.strokeStyle = "rgba(255, 80, 60, 0.85)";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(ef.x, ef.y, shockR, startDanger, endDanger);
            ctx.stroke();

            // Inner glow on danger arc
            ctx.globalAlpha = fadeAlpha * 0.4;
            ctx.strokeStyle = "rgba(255, 200, 100, 0.6)";
            ctx.lineWidth = 16;
            ctx.beginPath();
            ctx.arc(ef.x, ef.y, shockR, startDanger, endDanger);
            ctx.stroke();

            // Safe arc -- thin, faint
            ctx.globalAlpha = fadeAlpha * 0.2;
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ef.x, ef.y, shockR, endDanger, startDanger);
            ctx.stroke();
          } else {
            ctx.globalAlpha = fadeAlpha;
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ef.x, ef.y, shockR, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }

        case "ink_pool":
          // Tape zone — light blue semi-transparent circle with diagonal hatching
          ctx.beginPath();
          ctx.arc(ef.x, ef.y, ef.radius, 0, Math.PI * 2);
          ctx.fillStyle =
            (ef.warmup ?? 0) > 0 ? "rgba(200,230,245,0.18)" : ef.color;
          ctx.fill();
          if ((ef.warmup ?? 0) > 0) {
            ctx.strokeStyle = "rgba(74,157,200,0.6)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.strokeStyle = BOSS_CONFIGS.tape.accentColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          break;

        case "glue_zone":
          // Glue zone — amber blob
          ctx.beginPath();
          for (let j = 0; j < 10; j++) {
            const a = (j / 10) * Math.PI * 2;
            const r = ef.radius * (0.85 + Math.sin(j * 2.3) * 0.15);
            if (j === 0)
              ctx.moveTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
            else ctx.lineTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fillStyle =
            (ef.warmup ?? 0) > 0 ? "rgba(245,166,35,0.15)" : ef.color;
          ctx.fill();
          ctx.strokeStyle = BOSS_CONFIGS.gluestick.accentColor;
          ctx.lineWidth = (ef.warmup ?? 0) > 0 ? 2 : 1;
          if ((ef.warmup ?? 0) > 0) ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
      }
      ctx.restore();
    }
  }

  checkBossCollisions(): void {
    if (!this.boss || !this.boss.active || this.boss.entering) return;

    // Check bullet collisions with boss
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (!bullet.active) continue;

      if (this.isPointInBossHitbox(bullet.x, bullet.y)) {
        const snowballMult = bullet.snowball
          ? 1 + Math.min(1, bullet.age / 1.2) * (bullet.snowballMax - 1)
          : 1;
        const damage = Math.ceil(bullet.damage * snowballMult);
        bullet.active = false;
        this.bulletPool.release(bullet);
        this.bullets.splice(i, 1);
        this.boss.health -= damage;
        this.boss.health = Math.max(0, this.boss.health);

        // Visual feedback
        this.particles.emit(bullet.x, bullet.y, CONFIG.PENCIL_DARK, 5, "spark");

        this.audio.playHit();
        this.triggerScreenShake(0.6);

        console.log(
          "[checkBossCollisions] Boss hit! Health:",
          this.boss.health,
        );

        if (this.boss.health <= 0) {
          this.defeatBoss();
        }
      }
    }
  }

  defeatBoss(): void {
    if (!this.boss || this.boss.defeated) return;

    const bossNumber = this.bossesDefeated + 1;
    console.log("[defeatBoss] Boss #" + bossNumber + " defeated!");

    // Big explosion - scales with boss number
    this.particles.emit(
      this.boss.x,
      this.boss.y,
      CONFIG.PENCIL_DARK,
      30 + bossNumber * 5,
      "explosion",
    );
    this.particles.emit(
      this.boss.x,
      this.boss.y,
      "#ff6644",
      20 + bossNumber * 3,
      "spark",
    );
    this.particles.emit(
      this.boss.x,
      this.boss.y,
      CONFIG.PAPER_BG,
      25 + bossNumber * 4,
      "paper",
    );

    // Award massive bonus coins and points - scales significantly with boss number
    const bonusCoins = 250 * bossNumber;
    const scoreBonus = 10000 * bossNumber;

    this.coins += bonusCoins;
    this.score += scoreBonus + bonusCoins * 10;

    // Impactful visual feedback for points
    this.floatingText.add(
      this.boss.x - 40,
      this.boss.y,
      "+" + bonusCoins + " COINS",
      "#ffd700",
      30,
    );
    this.floatingText.add(
      this.boss.x + 40,
      this.boss.y - 30,
      "+" + scoreBonus + " POINTS",
      "#ff4444",
      40,
    );

    // Extra visual celebration for massive points
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (!this.boss) return;
        this.floatingText.add(
          this.boss.x + (Math.random() - 0.5) * 200,
          this.boss.y + (Math.random() - 0.5) * 200,
          "JACKPOT!",
          "#ffcc00",
          25,
        );
      }, i * 200);
    }

    // Mark as defeated BEFORE incrementing counter (for ability check)
    this.boss.active = false;
    this.boss.defeated = true;
    this.bossesDefeated++;

    // Clear boss asteroids and projectiles
    this.asteroids.forEach((a) => {
      if (a.isBossAsteroid) a.active = false;
    });
    this.bossProjectiles = [];

    // --- Compute round score with time bonus ---
    const timeBonus = this.isRechallengeMode
      ? 0
      : this.getRoundClearTimeBonus();
    this.score += timeBonus;
    if (timeBonus > 0) {
      this.floatingText.add(
        this.w / 2,
        this.h / 2,
        "TIME BONUS +" + timeBonus,
        "#ffd700",
        40,
      );
    }

    // --- Rechallenge mode: only update that round's score ---
    if (this.isRechallengeMode) {
      const rcKey = String(this.rechallengeRoundNumber);
      const rcScore = this.score - this.roundStartScore;
      const rcExisting = this.saveState.rounds[rcKey];
      const rcPrevBest = rcExisting?.bestScore ?? 0;
      if (rcScore > rcPrevBest) {
        if (rcExisting) {
          this.saveState.rounds[rcKey].bestScore = rcScore;
          this.saveState.rounds[rcKey].lastScore = rcScore;
        } else {
          this.saveState.rounds[rcKey] = {
            bossType: BOSS_ORDER[this.rechallengeRoundNumber - 1] ?? "",
            defeated: true,
            unlocked: true,
            bestScore: rcScore,
            lastScore: rcScore,
            completedAt: new Date().toISOString(),
          };
        }
        this.floatingText.add(
          this.w / 2,
          this.h / 3,
          "NEW BEST!",
          "#ffd700",
          50,
        );
      } else if (rcExisting) {
        // Not a new best — update lastScore in memory only, do NOT persist
        this.saveState.rounds[rcKey].lastScore = rcScore;
      }
      // Only submit & persist if score changed (i.e. new best was set above)
      if (rcScore > rcPrevBest) {
        const totalScore = getLeaderboardTotalScore(this.saveState);
        oasiz.submitScore(totalScore);
        persistSaveState(this.saveState, true);
      }
      this.audio.playUpgrade();
      this.audio.stopMusic();
      this.isRechallengeMode = false;
      setTimeout(() => {
        this.showStartScreen();
        this.showGalleryScreen();
      }, 2000);
      return;
    }

    // --- Persist progression ---
    const roundKey = String(this.currentRound);
    const roundScore = this.score - this.roundStartScore;
    const existingRound = this.saveState.rounds[roundKey];
    const prevBest = existingRound?.bestScore ?? 0;
    this.saveState.rounds[roundKey] = {
      bossType: BOSS_ORDER[this.currentRound - 1] ?? "",
      defeated: true,
      unlocked: true,
      bestScore: Math.max(prevBest, roundScore),
      lastScore: roundScore,
      completedAt: new Date().toISOString(),
    };
    // Unlock next round
    const nextRound = this.currentRound + 1;
    const nextRoundKey = String(nextRound);
    if (!this.saveState.rounds[nextRoundKey]) {
      const nextBossType = BOSS_ORDER[nextRound - 1];
      if (nextBossType) {
        this.saveState.rounds[nextRoundKey] = {
          bossType: nextBossType,
          defeated: false,
          unlocked: true,
          bestScore: 0,
          lastScore: 0,
        };
      }
    } else {
      this.saveState.rounds[nextRoundKey].unlocked = true;
    }
    // Update progression
    if (
      !this.saveState.progression.defeatedBossRounds.includes(this.currentRound)
    ) {
      this.saveState.progression.defeatedBossRounds.push(this.currentRound);
      this.saveState.progression.defeatedBossRounds.sort((a, b) => a - b);
    }
    if (this.currentRound > this.saveState.progression.highestDefeatedRound) {
      this.saveState.progression.highestDefeatedRound = this.currentRound;
    }
    if (nextRound > this.saveState.progression.highestUnlockedRound) {
      this.saveState.progression.highestUnlockedRound = nextRound;
      this.highestUnlockedRound = nextRound;
    }
    // Update checkpoint
    this.saveState.checkpoint = {
      roundNumber: nextRound,
      totalUpgradesSpent: this.totalUpgrades,
    };
    // Commit the current in-run build as the saved build
    this.saveState.build = {
      upgrades: { ...this.upgrades },
      pierceBonus: this.upgrades.piercingRounds,
      maxLivesBonus: this.getMaxLivesBonusFromHull(),
      ultimateLevels: { ...this.ultimateLevels },
      permanentStatBoost: 0,
      postHitInvincibilityBonus: this.upgrades.emergencyShielding * 0.4,
    };

    const totalScore = getLeaderboardTotalScore(this.saveState);
    oasiz.submitScore(totalScore);
    persistSaveState(this.saveState, true);

    // Advance round
    this.currentRound++;
    this.roundStartScore = this.score;
    this.roundStartTime = this.survivalTime;
    this.usedUltimatesThisRound = new Set();

    // Show victory and resume playing
    this.audio.playUpgrade();
    this.audio.switchToNormalMusic(this.currentRound);
    this.audio.triggerHaptic("success");
    this.triggerScreenShake(15);

    // Boss reward: show ability choice, then continue
    this.bossRewardPending = true;

    setTimeout(() => {
      if (this.isBossTestMode) {
        this.showStartScreen();
        this.showBossTestScreen();
        return;
      }
      this.showAbilityScreen(bossNumber);
    }, 1500);
  }

  // ============= RENDERING =============

  generateDoodles(): void {
    this.bgDoodles = [];
    const doodleTypes = [
      "!",
      "??",
      "*",
      "+",
      "=",
      "hello!",
      "PE",
      "maths...",
      "???",
      "( )",
      "Paper Plane",
      "BOOM!",
      "A+",
      "100%",
      "Nice!",
      "Cool",
      "X",
      "O",
      "V",
      "POWER",
      "FLY",
      "CLOUD",
      "Doodle",
      "Paper",
      "Ink",
    ];
    for (let i = 0; i < 25; i++) {
      this.bgDoodles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        text: doodleTypes[Math.floor(Math.random() * doodleTypes.length)],
        scale: 0.4 + Math.random() * 1.6,
        rotation: (Math.random() - 0.5) * 0.8,
        speed: 15 + Math.random() * 45,
      });
    }
  }

  drawBackground(): void {
    const ctx = this.ctx;

    // Paper background
    ctx.fillStyle = CONFIG.PAPER_BG;
    ctx.fillRect(0, 0, this.w, this.h);

    // Scrolling grid lines
    this.bgOffset =
      (this.bgOffset + CONFIG.BACKGROUND_SCROLL_SPEED * 0.016) %
      CONFIG.GRID_SIZE;

    ctx.strokeStyle = CONFIG.GRID_LINE;
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x < this.w; x += CONFIG.GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }

    // Horizontal lines (scrolling)
    for (
      let y = this.bgOffset;
      y < this.h + CONFIG.GRID_SIZE;
      y += CONFIG.GRID_SIZE
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }

    // Left margin line (notebook style)
    ctx.strokeStyle = "#ffaaaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(60, this.h);
    ctx.stroke();

    // Draw background doodles (parallax)
    ctx.fillStyle = "rgba(45, 45, 45, 0.08)";
    ctx.font = "bold 24px 'Caveat', cursive";
    this.bgDoodles.forEach((d) => {
      d.y += d.speed * 0.016;
      if (d.y > this.h + 50) {
        d.y = -50;
        d.x = Math.random() * this.w;
      }
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      ctx.scale(d.scale, d.scale);
      ctx.fillText(d.text, 0, 0);
      ctx.restore();
    });
  }

  drawPlayer(): void {
    const ctx = this.ctx;
    const x = this.playerX;
    const y = this.playerY;

    // Invincibility blink effect - skip drawing on odd frames
    if (this.isInvincible && Math.floor(this.damageFlashTimer) % 2 === 1) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);

    // Apply Tilt and Squish/Stretch juice
    ctx.rotate(this.playerTilt);
    ctx.scale(this.playerScaleX, this.playerScaleY);

    // Apply barrel roll (roll around forward axis - simulated with X scale)
    if (this.spinDirection !== 0) {
      const rollScale = Math.cos(this.spinAngle);
      ctx.scale(rollScale, 1);
    }

    // Apply damage tint during invincibility
    const damageAlpha = this.isInvincible ? 0.7 : 1;
    ctx.globalAlpha = damageAlpha;

    // Draw paper plane based on type
    ctx.strokeStyle = this.isInvincible ? "#ff6666" : CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2.5; // Slightly thicker lines for intent
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = this.isInvincible ? "#ffcccc" : "#ffffff";

    // Add subtle shadow for depth
    ctx.shadowColor = "rgba(0,0,0,0.1)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 15;

    if (this.selectedPlane === "dart") {
      // Classic pointed dart - hand-drawn variation
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(-22, 28);
      ctx.lineTo(0, 18);
      ctx.lineTo(22, 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center fold line
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(0, 18);
      ctx.stroke();

      // Wing details
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, 5);
      ctx.lineTo(-18, 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, 5);
      ctx.lineTo(18, 20);
      ctx.stroke();
    } else if (this.selectedPlane === "glider") {
      // Wide-winged glider
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(-38, 22);
      ctx.lineTo(-28, 28);
      ctx.lineTo(0, 12);
      ctx.lineTo(28, 28);
      ctx.lineTo(38, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing folds
      ctx.beginPath();
      ctx.moveTo(-20, 24);
      ctx.lineTo(0, -22);
      ctx.lineTo(20, 24);
      ctx.stroke();
    } else {
      // Bomber - chunky
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(-28, 18);
      ctx.lineTo(-22, 28);
      ctx.lineTo(0, 22);
      ctx.lineTo(22, 28);
      ctx.lineTo(28, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Chunky body
      ctx.fillStyle = "#f8f8f8";
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(10, -18);
      ctx.lineTo(12, 22);
      ctx.lineTo(-12, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  drawDrones(): void {
    if (this.drones.length === 0) return;
    const ctx = this.ctx;

    for (const drone of this.drones) {
      ctx.save();
      ctx.translate(drone.x, drone.y);

      // Rotate to face the target direction
      // Add PI/2 because the drone shape points "up" by default
      ctx.rotate(drone.facingAngle + Math.PI / 2);

      // Small paper drone
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "#f0f0f0";

      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-8, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  drawBullets(): void {
    const ctx = this.ctx;

    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);

      if (b.shape === "note") {
        ctx.fillStyle = "#3b2f2f";
        ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 6, 5 * b.size, 4 * b.size, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(3, -14 * b.size);
        ctx.lineTo(3, 2 * b.size);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6, -14 * b.size, 4 * b.size, Math.PI, Math.PI * 1.6);
        ctx.stroke();
      } else if (b.shape === "star") {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const outer = 8 * b.size;
          const inner = 4 * b.size;
          const x1 = Math.cos(angle) * outer;
          const y1 = Math.sin(angle) * outer;
          const x2 = Math.cos(angle + Math.PI / 5) * inner;
          const y2 = Math.sin(angle + Math.PI / 5) * inner;
          if (i === 0) ctx.moveTo(x1, y1);
          else ctx.lineTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.shape === "bolt") {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.lineTo(2, -2);
        ctx.lineTo(-2, 2);
        ctx.lineTo(4, 10);
        ctx.stroke();
      } else if (b.shape === "rocket") {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -12 * b.size);
        ctx.lineTo(-5 * b.size, 8 * b.size);
        ctx.lineTo(5 * b.size, 8 * b.size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffcc66";
        ctx.beginPath();
        ctx.moveTo(0, 10 * b.size);
        ctx.lineTo(-3 * b.size, 15 * b.size);
        ctx.lineTo(3 * b.size, 15 * b.size);
        ctx.closePath();
        ctx.fill();
      } else if (b.shape === "bubble") {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8 * b.size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(3 * b.size, -4 * b.size, 2 * b.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Pencil line bullet
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.fromDrone ? 2 : 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.jitterOffset * 0.5, -10 * b.size);
        ctx.lineTo(-b.jitterOffset * 0.5, 10 * b.size);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  drawAsteroids(): void {
    const ctx = this.ctx;

    for (const a of this.asteroids) {
      const config = CONFIG.ASTEROID_SIZES[a.size];

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      // Visual Juice: Hit pulse
      const scale = 1 + (a.hitFlash > 0 ? a.hitFlash * 0.5 : 0);
      ctx.scale(scale, scale);

      // Crumpled paper asteroid
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";

      // Irregular shape - deterministic based on ID
      ctx.beginPath();
      const points = 10;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        // Deterministic wobble using Math.sin(a.id)
        const wobble = 0.8 + Math.sin(a.id * 1.5 + i * 2.3) * 0.25;
        const r = config.radius * wobble;
        if (i === 0) {
          ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        } else {
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
      }
      ctx.closePath();

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.05)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 8;

      ctx.fill();
      ctx.stroke();

      // Crinkle lines inside the asteroid
      ctx.strokeStyle = "rgba(45, 45, 45, 0.15)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const angle1 = (a.id * 1.2 + i * 1.5) % (Math.PI * 2);
        const r1 = config.radius * (0.2 + Math.sin(a.id + i) * 0.1);
        const r2 = config.radius * (0.6 + Math.cos(a.id * 2 + i) * 0.2);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle1) * r1, Math.sin(angle1) * r1);
        ctx.lineTo(Math.cos(angle1 + 0.5) * r2, Math.sin(angle1 + 0.5) * r2);
        ctx.stroke();
      }

      // Health number
      ctx.rotate(-a.rotation); // Unrotate for text
      ctx.font = "bold " + config.radius * 0.7 + "px 'Caveat', cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(45, 45, 45, 0.8)";
      ctx.fillText(a.health.toString(), 0, 2);

      ctx.restore();
    }
  }

  // ============= DEMO ANIMATION =============

  initDemoAnimation(): void {
    if (!this.demoCanvas) return;
    console.log("[initDemoAnimation]");

    // Set canvas size based on container
    const container = this.demoCanvas.parentElement;
    if (container) {
      this.demoCanvas.width = container.clientWidth;
      this.demoCanvas.height = container.clientHeight;
    }

    // Initialize plane position
    this.demoPlaneX = this.demoCanvas.width / 2;
    this.demoPlaneY = this.demoCanvas.height - 35;
    this.demoPlaneTargetX = this.demoPlaneX;
    this.demoPlaneDirection = 1;

    // Clear entities
    this.demoBullets = [];
    this.demoAsteroids = [];
    this.demoParticles = [];
  }

  updateDemoAnimation(dt: number): void {
    if (!this.demoCanvas || !this.demoCtx) return;

    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Update background scroll
    this.demoBgOffset = (this.demoBgOffset + 30 * dt) % 25;

    // Move plane side to side
    if (Math.random() < 0.02) {
      this.demoPlaneTargetX = 40 + Math.random() * (w - 80);
    }
    this.demoPlaneX = lerp(this.demoPlaneX, this.demoPlaneTargetX, 0.05);

    // Fire bullets
    this.demoFireTimer -= dt * 1000;
    if (this.demoFireTimer <= 0) {
      this.demoBullets.push({
        x: this.demoPlaneX,
        y: this.demoPlaneY - 15,
        vy: -6,
        active: true,
      });
      this.demoFireTimer = 200;
    }

    // Spawn asteroids
    this.demoSpawnTimer -= dt * 1000;
    if (this.demoSpawnTimer <= 0) {
      this.demoAsteroids.push({
        x: 30 + Math.random() * (w - 60),
        y: -25,
        vx: (Math.random() - 0.5) * 2,
        vy: 1.8 + Math.random() * 1.2,
        radius: 18 + Math.random() * 12,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        health: 2,
        active: true,
      });
      this.demoSpawnTimer = 800 + Math.random() * 400;
    }

    // Update bullets
    for (let i = this.demoBullets.length - 1; i >= 0; i--) {
      const b = this.demoBullets[i];
      b.y += b.vy;
      if (b.y < -10) {
        this.demoBullets.splice(i, 1);
      }
    }

    // Update asteroids
    for (let i = this.demoAsteroids.length - 1; i >= 0; i--) {
      const a = this.demoAsteroids[i];
      a.x += a.vx;
      a.y += a.vy;
      a.rotation += a.rotationSpeed;

      // Bounce off walls
      if (a.x - a.radius < 0) {
        a.x = a.radius;
        a.vx = Math.abs(a.vx);
      } else if (a.x + a.radius > w) {
        a.x = w - a.radius;
        a.vx = -Math.abs(a.vx);
      }

      if (a.y > h + 30) {
        this.demoAsteroids.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.demoParticles.length - 1; i >= 0; i--) {
      const p = this.demoParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.04;
      if (p.life <= 0) {
        this.demoParticles.splice(i, 1);
      }
    }

    // Collision detection
    for (let bi = this.demoBullets.length - 1; bi >= 0; bi--) {
      const b = this.demoBullets[bi];
      for (let ai = this.demoAsteroids.length - 1; ai >= 0; ai--) {
        const a = this.demoAsteroids[ai];
        const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        if (dist < a.radius + 4) {
          a.health--;
          this.demoBullets.splice(bi, 1);

          if (a.health <= 0) {
            // Spawn particles
            for (let p = 0; p < 6; p++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 1 + Math.random() * 2;
              this.demoParticles.push({
                x: a.x,
                y: a.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 3 + Math.random() * 4,
              });
            }
            this.demoAsteroids.splice(ai, 1);
          }
          break;
        }
      }
    }
  }

  renderDemoAnimation(): void {
    if (!this.demoCanvas || !this.demoCtx) return;

    const ctx = this.demoCtx;
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Clear with paper background
    ctx.fillStyle = "#f5f5dc";
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = "#d4d4c4";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = this.demoBgOffset; y < h + 25; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw asteroids
    for (const a of this.demoAsteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      ctx.fillStyle = "#e8e8e0";
      ctx.strokeStyle = "#2d2d2d";
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const wobble = 0.85 + Math.sin(i * 47) * 0.2;
        const r = a.radius * wobble;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Draw bullets
    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const b of this.demoBullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 6);
      ctx.lineTo(b.x, b.y + 6);
      ctx.stroke();
    }

    // Draw particles
    for (const p of this.demoParticles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = "#2d2d2d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw plane
    ctx.save();
    ctx.translate(this.demoPlaneX, this.demoPlaneY);

    const tilt = (this.demoPlaneTargetX - this.demoPlaneX) * 0.015;
    ctx.rotate(clamp(tilt, -0.25, 0.25));

    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "#ffffff";

    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-12, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(12, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.restore();
  }

  // ============= GAME LOOP =============

  gameLoop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    // Update demo animation on start screen
    if (this.gameState === "START") {
      this.updateDemoAnimation(dt);
      this.renderDemoAnimation();
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(dt: number): void {
    // Update screen shake
    if (this.screenShake.intensity > 0) {
      this.screenShake.x =
        (Math.random() - 0.5) * this.screenShake.intensity * 15;
      this.screenShake.y =
        (Math.random() - 0.5) * this.screenShake.intensity * 15;
      this.screenShake.intensity *= 0.9;
      if (this.screenShake.intensity < 0.01) {
        this.screenShake.intensity = 0;
        this.screenShake.x = 0;
        this.screenShake.y = 0;
      }
    }

    // Always update particles and floating text
    this.particles.update(dt);
    this.floatingText.update(dt);

    if (this.gameState === "PLAYING") {
      this.updatePlayer(dt);
      this.updateAbilities(dt);
      this.updateDamageState(dt);
      this.updateReinforcedHullRegen(dt);
      this.updateDrones(dt);
      this.updateBullets(dt);
      this.updateAsteroids(dt);
      this.checkCollisions();
      this.updateDifficulty(dt);

      // Firing
      const fireInterval = this.currentStats.fireRateMs;
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this.fireBullets();
        this.fireTimer = fireInterval;
      }

      // Spawning
      // Spawn interval decreases gradually: starts at 3.5s, reaches min (~600ms) around 2.5 minutes
      // Also decreases by 5% after each boss defeated (slower ramp)
      const bossSpawnMult = Math.pow(0.95, this.bossesDefeated);
      const spawnInterval = Math.max(
        CONFIG.SPAWN_INTERVAL_MIN * bossSpawnMult,
        (CONFIG.SPAWN_INTERVAL_START - this.survivalTime * 0.027) *
          bossSpawnMult,
      );
      this.spawnTimer -= dt * 1000;
      if (this.spawnTimer <= 0) {
        this.spawnAsteroid();
        this.spawnTimer = spawnInterval;
      }

      this.updateHUD();
    } else if (this.gameState === "ABILITY_CHOICE") {
      // Player must choose - no auto-select
    } else if (this.gameState === "UPGRADE") {
      // Player must choose - no auto-select
    } else if (this.gameState === "BOSS") {
      // Boss fight update
      this.updateBossAnnouncement(dt);
      this.updatePlayer(dt);
      this.updateAbilities(dt);
      this.updateDamageState(dt);
      this.updateDrones(dt);
      this.updateBullets(dt);
      this.updateAsteroids(dt);
      this.updateBoss(dt);
      this.updateBossProjectiles(dt);
      this.updateBossMinions(dt);
      this.updateBossAreaEffects(dt);
      this.checkBossCollisions();
      this.checkBossProjectileCollisions();
      this.checkBossMinionCollisions();
      this.checkCollisions();

      // Firing during boss fight
      const fireInterval = this.currentStats.fireRateMs;
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this.fireBullets();
        this.fireTimer = fireInterval;
      }

      this.updateHUD();
    }
  }

  render(): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(this.screenShake.x, this.screenShake.y);

    this.drawBackground();

    if (
      this.gameState === "PLAYING" ||
      this.gameState === "PAUSED" ||
      this.gameState === "UPGRADE" ||
      this.gameState === "ABILITY_CHOICE" ||
      this.gameState === "GAME_OVER" ||
      this.gameState === "BOSS"
    ) {
      this.drawAsteroids();
      this.drawBullets();
      this.drawDrones();
      this.drawOrbitals();
      this.drawPlayer();
      this.particles.draw(ctx);
      this.floatingText.draw(ctx);

      // Draw boss and boss projectiles
      if (this.gameState === "BOSS") {
        this.drawBossAreaEffects();
        this.drawBossProjectiles();
        this.drawBossMinions();
        if (this.boss && this.boss.active) {
          this.drawBoss();
        }
      }
    }

    ctx.restore();
  }

  drawBoss(): void {
    if (!this.boss) return;

    const ctx = this.ctx;
    const x = this.boss.x;
    const y = this.boss.y;
    const radius = this.getCurrentBossRadius();
    const config = BOSS_CONFIGS[this.boss.type];

    ctx.save();
    ctx.translate(x, y);

    // Rage aura — drawn behind the boss when phase >= 2
    if (this.boss.phase >= 2) {
      const pulse = 0.55 + Math.abs(Math.sin(this.boss.pulsePhase * 3)) * 0.45;
      const auraRadius = radius * (1.45 + pulse * 0.25);
      const grad = ctx.createRadialGradient(
        0,
        0,
        radius * 0.7,
        0,
        0,
        auraRadius,
      );
      grad.addColorStop(0, "rgba(255,60,0,0.28)");
      grad.addColorStop(1, "rgba(255,0,0,0)");
      ctx.beginPath();
      ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    switch (this.boss.type) {
      case "eraser":
        this.drawEraserBoss(ctx, radius, config);
        break;
      case "paperweight":
        this.drawPaperweightBoss(ctx, radius, config);
        break;
      case "inkblot":
        this.drawInkblotBoss(ctx, radius, config);
        break;
      case "rubberband":
        this.drawRubberbandBoss(ctx, radius, config);
        break;
      case "stapler":
        this.drawStaplerBoss(ctx, radius, config);
        break;
      case "scissors":
        this.drawScissorsBoss(ctx, radius, config);
        break;
      case "pushpin":
        this.drawPushpinBoss(ctx, radius, config);
        break;
      case "highlighter":
        this.drawHighlighterBoss(ctx, radius, config);
        break;
      case "ruler":
        this.drawRulerBoss(ctx, radius, config);
        break;
      case "holepunch":
        this.drawHolePunchBoss(ctx, radius, config);
        break;
      case "binderclip":
        this.drawBinderClipBoss(ctx, radius, config);
        break;
      case "sharpener":
        this.drawSharpenerBoss(ctx, radius, config);
        break;
      case "tape":
        this.drawTapeBoss(ctx, radius, config);
        break;
      case "gluestick":
        this.drawGlueStickBoss(ctx, radius, config);
        break;
      case "stapleremover":
        this.drawStapleRemoverBoss(ctx, radius, config);
        break;
    }

    ctx.restore();

    // Draw health bar above boss (not rotated)
    this.drawBossHealthBar(x, y - radius - 25);

    // Draw boss name
    ctx.save();
    ctx.font = "bold 14px " + CONFIG.FONT_FAMILY;
    ctx.fillStyle = CONFIG.PENCIL_DARK;
    ctx.textAlign = "center";
    ctx.fillText(config.name, x, y - radius - 45);
    ctx.restore();
  }

  drawEraserBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.getEraserRenderRotation());

    // Pink eraser body - rounded rectangle shape
    const w = radius * 1.8;
    const h = radius * 0.9;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 15);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = config.accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Blue band on side
    ctx.fillStyle = "#5588cc";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w * 0.2, h, [15, 0, 0, 15]);
    ctx.fill();

    // Eraser shavings/residue
    ctx.strokeStyle = CONFIG.PENCIL_MEDIUM;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const sx = -w / 4 + i * 15;
      const sy = -5 + Math.sin(i * 2 + this.boss!.pulsePhase) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 8, sy + 4);
      ctx.stroke();
    }

    // Angry eyes
    this.drawBossEyes(ctx, -15, -5, 15, 5);
  }

  drawPaperweightBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    // Heavy stone dome shape
    ctx.beginPath();
    ctx.ellipse(0, 10, radius * 1.1, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Top dome
    ctx.beginPath();
    ctx.ellipse(0, -15, radius * 0.8, radius * 0.6, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = "#9a9a9a";
    ctx.fill();
    ctx.stroke();

    // Stone texture cracks
    ctx.strokeStyle = config.accentColor;
    ctx.lineWidth = 2;
    const cracks = [
      [-30, 0, -10, 20],
      [20, -10, 35, 15],
      [-15, 25, 15, 35],
      [0, -25, 10, -5],
    ];
    for (const [x1, y1, x2, y2] of cracks) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Angry eyes
    this.drawBossEyes(ctx, -20, -5, 20, -5);
  }

  drawInkblotBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation);

    // Amorphous ink blob with wobble
    ctx.beginPath();
    const points = 20;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = Math.sin(angle * 5 + this.boss!.pulsePhase * 3) * 15;
      const r = radius * 0.9 + wobble;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = config.color;
    ctx.fill();

    // Ink drips
    ctx.fillStyle = config.accentColor;
    for (let i = 0; i < 4; i++) {
      const dripX = -40 + i * 25;
      const dripY = radius * 0.5 + Math.sin(this.boss!.pulsePhase + i) * 10;
      ctx.beginPath();
      ctx.ellipse(
        dripX,
        dripY,
        8,
        15 + Math.sin(this.boss!.pulsePhase + i * 2) * 5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Glowing eyes
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-18, -10, 12, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(18, -10, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.arc(-18, -8, 5, 0, Math.PI * 2);
    ctx.arc(18, -8, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRubberbandBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation);

    // Ball made of rubber bands
    const bandCount = 12;
    for (let layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = layer % 2 === 0 ? config.color : config.accentColor;
      ctx.lineWidth = 6 - layer;

      for (let i = 0; i < bandCount; i++) {
        const angle = (i / bandCount) * Math.PI + layer * 0.3;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          radius * (0.9 - layer * 0.15),
          radius * (0.6 - layer * 0.1),
          angle,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }

    // Center core
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = "#654321";
    ctx.fill();

    // Angry eyes on core
    this.drawBossEyes(ctx, -8, -5, 8, -5, 0.5);
  }

  drawStaplerBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    // Stapler body
    const w = radius * 2;
    const h = radius * 0.6;

    // Base
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Top lever (animated)
    const leverAngle = this.getStaplerLeverAngle();
    ctx.save();
    ctx.rotate(leverAngle);
    ctx.fillStyle = config.accentColor;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 10, -h * 0.8, w - 20, h * 0.7, 5);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Staple output
    ctx.fillStyle = "#c0c0c0";
    ctx.fillRect(-10, h - 5, 20, 10);

    // Eyes on top
    ctx.save();
    ctx.rotate(leverAngle);
    this.drawBossEyes(ctx, -25, -h * 0.4, 25, -h * 0.4);
    ctx.restore();
  }

  drawScissorsBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    // Animated scissor blades
    const openAngle = this.getScissorsOpenAngle();

    // Left blade
    ctx.save();
    ctx.rotate(-openAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-radius * 1.5, -30);
    ctx.lineTo(-radius * 1.4, 0);
    ctx.lineTo(-radius * 1.5, 30);
    ctx.closePath();
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Blade edge highlight
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-radius * 1.4, -25);
    ctx.stroke();
    ctx.restore();

    // Right blade
    ctx.save();
    ctx.rotate(openAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * 1.5, -30);
    ctx.lineTo(radius * 1.4, 0);
    ctx.lineTo(radius * 1.5, 30);
    ctx.closePath();
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Blade edge highlight
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.lineTo(radius * 1.4, -25);
    ctx.stroke();
    ctx.restore();

    // Center pivot with handles
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = config.accentColor;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Handle rings
    ctx.strokeStyle = config.accentColor;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(-radius * 0.3, radius * 0.7, 25, 30, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(radius * 0.3, radius * 0.7, 25, 30, 0.3, 0, Math.PI * 2);
    ctx.stroke();

    // Eye on pivot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, -3, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.arc(0, -1, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPushpinBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation);
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(0, -radius * 0.15, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(-10, radius * 0.1, 20, radius * 0.9);
    this.drawBossEyes(ctx, -18, -20, 18, -20, 0.8);
  }

  drawHighlighterBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    const w = radius * 1.9;
    const h = radius * 0.7;
    ctx.rotate(Math.sin(this.boss!.pulsePhase) * 0.08);
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(-w / 2 + 8, -h / 2 + 8, w * 0.28, h - 16);
    this.drawBossEyes(ctx, -22, 0, 22, 0, 0.85);
  }

  drawRulerBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    const w = radius * 2.2;
    const h = radius * 0.45;
    ctx.rotate(Math.sin(this.boss!.pulsePhase) * 0.04);
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = config.accentColor;
    ctx.lineWidth = 2;
    for (let i = 1; i < 13; i++) {
      const x = -w / 2 + (w / 13) * i;
      const tickHeight = i % 3 === 0 ? h * 0.45 : h * 0.26;
      ctx.beginPath();
      ctx.moveTo(x, h / 2 - 4);
      ctx.lineTo(x, h / 2 - tickHeight);
      ctx.stroke();
    }
    ctx.fillStyle = CONFIG.PENCIL_DARK;
    ctx.font = "bold 11px " + CONFIG.FONT_FAMILY;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 1; i <= 5; i++) {
      const x = -w / 2 + (w / 6) * i - w / 12;
      ctx.fillText((i * 2).toString(), x, 0);
    }
    this.drawBossEyes(ctx, -28, 5, 28, 5, 0.75);
  }

  drawHolePunchBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    const w = radius * 1.7;
    const h = radius * 1.1;
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    for (const offset of [-28, 0, 28]) {
      ctx.beginPath();
      ctx.arc(offset, 12, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawBossEyes(ctx, -22, -18, 22, -18, 0.8);
  }

  drawBinderClipBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    const w = radius * 1.5;
    const h = radius * 1.2;
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = config.accentColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(-w * 0.22, -h * 0.25, 24, Math.PI, 0);
    ctx.arc(w * 0.22, -h * 0.25, 24, Math.PI, 0);
    ctx.stroke();
    this.drawBossEyes(ctx, -18, 8, 18, 8, 0.75);
  }

  drawSharpenerBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation * 0.6);
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.9, radius * 0.6);
    ctx.lineTo(-radius * 0.9, -radius * 0.6);
    ctx.lineTo(radius * 0.8, -radius * 0.4);
    ctx.lineTo(radius * 0.95, 0);
    ctx.lineTo(radius * 0.8, radius * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = config.accentColor;
    ctx.beginPath();
    ctx.arc(radius * 0.25, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    this.drawBossEyes(ctx, -18, -8, 0, 10, 0.75);
  }

  // ===== TAPE DISPENSER BOSS =====
  drawTapeBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation * 0.4);
    // Round spool body
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner hub
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = config.accentColor;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tape stripes
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.strokeStyle = "rgba(74,157,200,0.25)";
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    ctx.restore();

    this.drawBossEyes(ctx, -12, -5, 12, -5, 0.7);
  }

  // ===== GLUE STICK BOSS =====
  drawGlueStickBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation * 0.3);
    const w = radius * 0.7;
    const h = radius * 1.7;

    // Main cylindrical body
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 18);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Label band
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h * 0.1, w, h * 0.25, 6);
    ctx.fillStyle = config.accentColor;
    ctx.fill();

    // Glue tip
    ctx.beginPath();
    ctx.ellipse(0, -h / 2 - 8, w * 0.45, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f0e0b0";
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    this.drawBossEyes(ctx, -10, 0, 10, 0, 0.75);
  }

  // ===== STAPLE REMOVER BOSS =====
  drawStapleRemoverBoss(
    ctx: CanvasRenderingContext2D,
    radius: number,
    config: BossConfig,
  ): void {
    ctx.rotate(this.boss!.rotation * 0.5);
    const clampGap =
      (0.25 + Math.abs(Math.sin(this.boss!.movePhase * 3)) * 0.25) * radius;

    // Top jaw
    ctx.save();
    ctx.translate(0, -clampGap);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.85, 0);
    ctx.lineTo(radius * 0.85, 0);
    ctx.lineTo(radius * 0.7, -radius * 0.55);
    ctx.lineTo(-radius * 0.7, -radius * 0.55);
    ctx.closePath();
    ctx.fillStyle = config.accentColor;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Fang tips
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * radius * 0.5, 0);
      ctx.lineTo(i * radius * 0.5 - radius * 0.12, -radius * 0.22);
      ctx.lineTo(i * radius * 0.5 + radius * 0.12, -radius * 0.22);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();

    // Bottom jaw
    ctx.save();
    ctx.translate(0, clampGap);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.85, 0);
    ctx.lineTo(radius * 0.85, 0);
    ctx.lineTo(radius * 0.7, radius * 0.55);
    ctx.lineTo(-radius * 0.7, radius * 0.55);
    ctx.closePath();
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Bottom fang tips
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * radius * 0.5, 0);
      ctx.lineTo(i * radius * 0.5 - radius * 0.12, radius * 0.22);
      ctx.lineTo(i * radius * 0.5 + radius * 0.12, radius * 0.22);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();

    // Eyes in the center gap
    this.drawBossEyes(ctx, -14, 0, 14, 0, 0.8);
  }

  drawBossEyes(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    scale: number = 1,
  ): void {
    const eyeSize = 10 * scale;
    const pupilSize = 5 * scale;
    const isEnraged = this.boss ? this.boss.phase >= 2 : false;

    // Left eye
    ctx.fillStyle = isEnraged ? "#fff0f0" : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x1, y1, eyeSize, eyeSize * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Left pupil (follows player direction)
    const dx = this.playerX - this.boss!.x;
    const dy = this.playerY - this.boss!.y;
    const angle = Math.atan2(dy, dx);
    ctx.fillStyle = isEnraged ? "#aa0000" : "#000000";
    ctx.beginPath();
    ctx.arc(
      x1 + Math.cos(angle) * 3,
      y1 + Math.sin(angle) * 2,
      pupilSize,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Right eye
    ctx.fillStyle = isEnraged ? "#fff0f0" : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x2, y2, eyeSize, eyeSize * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Right pupil
    ctx.fillStyle = isEnraged ? "#aa0000" : "#000000";
    ctx.beginPath();
    ctx.arc(
      x2 + Math.cos(angle) * 3,
      y2 + Math.sin(angle) * 2,
      pupilSize,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (isEnraged) {
      // Angry (furrowed V) eyebrows
      ctx.strokeStyle = "#cc0000";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x1 - eyeSize, y1 - eyeSize);
      ctx.lineTo(x1 + eyeSize * 0.5, y1 - eyeSize * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2 + eyeSize, y2 - eyeSize);
      ctx.lineTo(x2 - eyeSize * 0.5, y2 - eyeSize * 0.5);
      ctx.stroke();
    } else {
      // Calm flat eyebrows
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x1 - eyeSize, y1 - eyeSize * 0.7);
      ctx.lineTo(x1 + eyeSize, y1 - eyeSize * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2 - eyeSize, y2 - eyeSize * 0.7);
      ctx.lineTo(x2 + eyeSize, y2 - eyeSize * 0.7);
      ctx.stroke();
    }
  }

  drawBossHealthBar(x: number, y: number): void {
    if (!this.boss) return;

    const ctx = this.ctx;
    const barWidth = 160;
    const barHeight = 12;
    const healthPercent = this.boss.health / this.boss.maxHealth;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);

    // Health fill — rage phase turns bar red and pulses
    const isEnraged = this.boss.phase >= 2;
    let healthColor: string;
    if (isEnraged) {
      const pulse = 0.7 + Math.abs(Math.sin(this.boss.pulsePhase * 4)) * 0.3;
      const r = Math.floor(220 * pulse);
      healthColor = `rgb(${r},30,30)`;
    } else {
      healthColor =
        healthPercent > 0.5
          ? "#44cc44"
          : healthPercent > 0.25
            ? "#cccc44"
            : "#cc4444";
    }
    ctx.fillStyle = healthColor;
    ctx.fillRect(x - barWidth / 2, y, barWidth * healthPercent, barHeight);

    // Border
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - barWidth / 2, y, barWidth, barHeight);

    // Health text
    ctx.fillStyle = CONFIG.PENCIL_DARK;
    ctx.font = "bold 10px " + CONFIG.FONT_FAMILY;
    ctx.textAlign = "center";
    ctx.fillText(
      this.boss.health + "/" + this.boss.maxHealth,
      x,
      y + barHeight + 12,
    );
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Paper Plane Asteroid Survivor");
  new PaperPlaneGame();
});

// Back-button type bridge (runtime-injected by platform, not in SDK typings)
type OasizNav = typeof oasiz & {
  onBackButton?: (cb: () => void) => void;
  leaveGame?: () => void;
};
