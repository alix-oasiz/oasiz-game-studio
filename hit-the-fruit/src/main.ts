/**
 * HIT THE FRUIT
 * 
 * A casual web game where players throw knives at rotating fruit slices.
 * 
 * Features:
 * - 100 procedurally generated levels
 * - 8+ rotation patterns with smooth transitions
 * - Angle-based collision detection
 * - Seeded RNG for deterministic level generation
 * - Mobile and desktop support
 * - Debug mode with level preview
 * 
 * Difficulty Tuning:
 * - Adjust MIN_FRUIT_RADIUS, MAX_FRUIT_RADIUS for fruit size range
 * - Modify MIN_EMBEDDED_KNIVES, MAX_EMBEDDED_KNIVES for starting knife count
 * - Change MIN_ROTATION_SPEED, MAX_ROTATION_SPEED for speed range
 * - Tweak COLLISION_THRESHOLD_MULTIPLIER for collision sensitivity
 * - Modify MIN_ANGULAR_SPACING for minimum gap between embedded knives
 */

import { oasiz } from "@oasiz/sdk";

// Import assets
import background1Url from "../Assets/Backgrounds/Back 1.png";
import background2Url from "../Assets/Backgrounds/Back 2.png";
import background3Url from "../Assets/Backgrounds/Back 3.png";
import avocadoUrl from "../Assets/Targets/Fruit/Normal Fruit/avocado.png";
import orangeUrl from "../Assets/Targets/Fruit/Normal Fruit/orange.png";
import grapeUrl from "../Assets/Targets/Fruit/Normal Fruit/grape.png";
import watermelonUrl from "../Assets/Targets/Fruit/Normal Fruit/watermelon.png";
import kiwiUrl from "../Assets/Targets/Fruit/Normal Fruit/kiwi.png";
import lemonUrl from "../Assets/Targets/Fruit/Normal Fruit/lemon.png";
import knifeUrl from "../Assets/Weapons/Normal Knif.png";
import kunaiUrl from "../Assets/Weapons/kunai.png";
import penUrl from "../Assets/Weapons/pen.png";
import pencilUrl from "../Assets/Weapons/pencil_weapon.png";
import brokenKnife1Url from "../Assets/Weapons/broken1.png";
import brokenKnife2Url from "../Assets/Weapons/broken2.png";
import brokenKunai1Url from "../Assets/Weapons/broken_kunai1.png";
import brokenKunai2Url from "../Assets/Weapons/broken_kunai2.png";
import brokenPen1Url from "../Assets/Weapons/broken_pen1.png";
import brokenPen2Url from "../Assets/Weapons/broken_pen2.png";
import brokenPencil1Url from "../Assets/Weapons/broken_pencil1.png";
import brokenPencil2Url from "../Assets/Weapons/broken_pencil2.png";
import knifeIconUrl from "../Assets/Weapons/icon.png";
import kunaiIconUrl from "../Assets/Weapons/kunai_icon.png";
import penIconUrl from "../Assets/Weapons/pen_icon.png";
import pencilIconUrl from "../Assets/Weapons/Pencil.png";

// Import sound effects
import stabUrl from "../sfx/stab.wav";
import brokeUrl from "../sfx/broke.wav";
import dullUrl from "../sfx/dull.wav";
import successUrl from "../sfx/success.wav";
import pencilBreakUrl from "../sfx/pencil_break.mp3";
import uiTapUrl from "../sfx/ui_tap.mp3";
import uiConfirmUrl from "../sfx/ui_confirm.mp3";
import timeoutUrl from "../sfx/timeout.mp3";
import bgm1Url from "../sfx/bgm1.mp3";
import bgm2Url from "../sfx/bgm2.mp3";

// ============= CONFIGURATION =============
const CONFIG = {
  // Fruit
  MIN_FRUIT_RADIUS: 75,
  MAX_FRUIT_RADIUS: 150,
  FRUIT_CENTER_X: 0.5, // Ratio of screen width
  FRUIT_CENTER_Y: 0.45, // Ratio of screen height
  
  // Knives
  KNIFE_WIDTH: 8, // Angular width in degrees
  KNIFE_THROW_SPEED: 1600, // Pixels per second
  KNIFE_THROW_DISTANCE: 400, // Max distance from bottom
  COLLISION_THRESHOLD_MULTIPLIER: 1.2, // Multiplier for collision detection
  MIN_ANGULAR_SPACING: 15, // Minimum degrees between embedded knives
  
  // Level Generation
  TOTAL_LEVELS: 150,
  MIN_EMBEDDED_KNIVES: 4, // Increased from 2 to make early levels harder
  MAX_EMBEDDED_KNIVES: 12,
  MIN_ROTATION_SPEED: 60, // Increased from 30 to make early levels faster
  MAX_ROTATION_SPEED: 180,
  MIN_KNIVES_TO_THROW: 5, // Increased from 3 to make early levels harder
  MAX_KNIVES_TO_THROW: 16,
  
  // Visual
  FRUIT_RINGS: 3,
  SEED_COUNT: 5,
  KNIFE_COLOR: "#2c3e50",
  FRUIT_COLORS: [
    { outer: "#ff6b6b", middle: "#ff8787", inner: "#ffa8a8" }, // Red (Apple)
    { outer: "#4ecdc4", middle: "#6edcd4", inner: "#8eece4" }, // Cyan (Lime)
    { outer: "#ffe66d", middle: "#ffed85", inner: "#fff39d" }, // Yellow (Lemon)
    { outer: "#a8e6cf", middle: "#b8f0d9", inner: "#c8fae3" }, // Green (Green Apple)
    { outer: "#ff9ff3", middle: "#ffb3f7", inner: "#ffc7fb" }, // Pink (Grapefruit)
  ],
  
  // Animation
  KNIFE_STICK_BOUNCE: 0.3, // Bounce factor when knife sticks
  KNIFE_STICK_DURATION: 200, // ms
  
  // Audio (optional - can be added later)
  SOUND_ENABLED: false,
};

// ============= TYPES =============
type GameState = "START" | "LEVEL_SELECT" | "PLAYING" | "PAUSED" | "GAME_OVER" | "WIN";

type WeaponType = "knife" | "kunai" | "pen" | "pencil";

const ECONOMY = {
  UNLOCKS_STORAGE_KEY: "knifeHitWeaponUnlocks",
  PRICES: {
    kunai: 100,
    pen: 500,
    pencil: 1000,
  } as const,
} as const;

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface LevelConfig {
  fruitRadius: number;
  embeddedKnives: number[];
  coins: number[]; // Angles for coins (similar to embedded knives)
  rotationSpeed: number;
  rotationDirection: number; // -1 or 1
  rotationPatterns: RotationPatternType[];
  knivesToThrow: number;
}

type RotationPatternType =
  | "constant"
  | "ramp_up_down"
  | "reverse_smooth"
  | "pulse"
  | "alternating"
  | "breathing"
  | "staged"
  | "chaotic"
  | "stutter";

interface Knife {
  angle: number; // Angle when embedded (0-360)
  isFlying: boolean;
  flyX: number; // X position when flying
  flyY: number; // Y position when flying
  flyStartX: number;
  flyStartY: number;
  flyTime: number;
  flyW?: number; // cached render width for flying knife (CSS px coords)
  flyH?: number; // cached render height for flying knife (CSS px coords)
  flyStartRot?: number; // cached start rotation (radians)
  flyEndRot?: number; // cached end rotation (radians)
  stickBounce: number; // Animation value for stick bounce
  throwScale: number; // Animation scale when thrown (for juice)
  throwRotation: number; // Rotation when flying (radians) for rendering on canvas
  isColliding: boolean; // Highlight in red when colliding
  transitionTargetX?: number; // Target X for transition (optional)
  transitionTargetY?: number; // Target Y for transition (optional)
  transitionDistance?: number; // Distance for transition trajectory
  transitionKnifeWidth?: number; // Knife width for transition
  transitionKnifeHeight?: number; // Knife height for transition
  embeddedRotation?: number; // Rotation to use when embedded (for transition knives)
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
  type: "splash" | "drop"; // splash = burst outward, drop = falls down
}

interface BrokenKnifePiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  life: number;
  maxLife: number;
  // Which broken sprite to use (1 or 2)
  spriteIndex: number;
  // Concrete image for this piece (already picked for current weapon)
  image: HTMLImageElement | null;
}

interface Coin {
  angle: number; // Angle when embedded (0-360)
  collected: boolean; // Whether coin has been collected
  animating: boolean; // Whether coin is animating to coin display
  animX: number; // Current animation X
  animY: number; // Current animation Y
  animStartX: number; // Fixed start X of animation (impact point)
  animStartY: number; // Fixed start Y of animation (impact point)
  animProgress: number; // Animation progress (0-1)
  spawnScale: number; // Spawn animation scale (0-1)
}

interface Fruit {
  radius: number;
  rotationAngle: number; // Current rotation angle in degrees
  colorIndex: number;
  image: HTMLImageElement | null;
  hitDistortion: number; // Distortion effect when hit (0-1)
}

interface StartMenuFruit {
  image: HTMLImageElement;
  baseAngle: number; // placement around the ring
  hitDistortion: number; // start-menu-only distortion value (0-1)
}

// ============= SEEDED RNG =============
class SeededRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

// ============= ROTATION PATTERNS =============
type RotationPattern = (t: number, baseSpeed: number, direction: number, params?: any) => number;

const ROTATION_PATTERNS: Record<RotationPatternType, RotationPattern> = {
  // Constant speed
  constant: (t, baseSpeed, direction) => baseSpeed * direction,

  // Ramp up then ramp down (ease in/out)
  ramp_up_down: (t, baseSpeed, direction) => {
    const cycle = 2.5;
    const phase = (t % cycle) / cycle;
    let multiplier = 1;
    if (phase < 0.5) {
      multiplier = phase * 2;
    } else {
      multiplier = 2 - phase * 2;
    }
    return baseSpeed * direction * (0.85 + multiplier * 0.55); // 85% to 140%
  },

  // Smooth direction reversal
  reverse_smooth: (t, baseSpeed, direction) => {
    const cycle = 5;
    const phase = (t % cycle) / cycle;
    let speed = baseSpeed;
    let dir = direction;
    
    if (phase < 0.3) {
      speed = baseSpeed * 0.8;
      dir = direction;
    } else if (phase < 0.6) {
      const reversePhase = (phase - 0.3) / 0.3;
      speed = baseSpeed * (0.8 + reversePhase * 0.5);
      dir = direction * (1 - reversePhase * 2); // 1 -> -1
    } else {
      speed = baseSpeed * 1.4;
      dir = -direction;
    }
    return speed * dir;
  },

  // Constant speed with periodic pulses
  pulse: (t, baseSpeed, direction) => {
    const pulseFreq = 2;
    const pulse = Math.sin(t * Math.PI * 2 * pulseFreq);
    const multiplier = 0.9 + pulse * 0.35; // 90% to 125%
    return baseSpeed * direction * multiplier;
  },

  // Alternating direction every N seconds with smooth interpolation
  alternating: (t, baseSpeed, direction) => {
    const switchInterval = 2.5;
    const phase = (t % (switchInterval * 2)) / switchInterval;
    let dir = direction;
    
    if (phase < 0.5) {
      dir = direction;
    } else {
      const transition = (phase - 0.5) * 2;
      const smoothTransition = transition * transition * (3 - 2 * transition);
      dir = direction * (1 - smoothTransition * 2); // 1 -> -1
    }
    return baseSpeed * dir * 1.1; // 110% base speed during alternation
  },

  // "Breathing" speed: sin wave modulation around base speed
  breathing: (t, baseSpeed, direction) => {
    const breathFreq = 0.6;
    const breath = Math.sin(t * Math.PI * 2 * breathFreq);
    const multiplier = 0.85 + breath * 0.35; // 85% to 120%
    return baseSpeed * direction * multiplier;
  },

  // Staged pattern: segment A (medium), segment B (fast), segment C (reverse), repeat
  staged: (t, baseSpeed, direction) => {
    const cycle = 6;
    const phase = (t % cycle) / cycle;
    let speed = baseSpeed;
    let dir = direction;
    
    if (phase < 0.33) {
      speed = baseSpeed * 0.8;
      dir = direction;
    } else if (phase < 0.66) {
      speed = baseSpeed * 1.4;
      dir = direction;
    } else {
      speed = baseSpeed * 1.0;
      dir = -direction;
    }
    return speed * dir;
  },

  // Chaotic: random-like but smooth
  chaotic: (t, baseSpeed, direction) => {
    const wave1 = Math.sin(t * 0.7);
    const wave2 = Math.sin(t * 1.3);
    const wave3 = Math.sin(t * 2.1);
    const combined = (wave1 + wave2 * 0.5 + wave3 * 0.25) / 1.75;
    const multiplier = 0.75 + combined * 0.5; // 75% to 125%
    const dirMultiplier = Math.sin(t * 0.4) > 0 ? 1 : -1;
    return baseSpeed * direction * multiplier * dirMultiplier;
  },

  // Stutter: spins fast then near-stops briefly — a psychological trap
  stutter: (t, baseSpeed, direction) => {
    const cycle = 1.5; // 1.5s cycle: 1.1s fast, 0.4s near-stop
    const phase = t % cycle;
    if (phase < 1.1) {
      return baseSpeed * direction * 1.35; // 135% speed during fast phase
    }
    // Near-stop: crawls at 4% speed — looks like a safe throw window
    return baseSpeed * direction * 0.04;
  },
};

// Smooth acceleration limiter
function applyAccelerationLimit(
  currentVelocity: number,
  targetVelocity: number,
  dt: number,
  maxAccel: number = 60 // degrees per second squared
): number {
  const diff = targetVelocity - currentVelocity;
  const maxChange = maxAccel * dt;
  if (Math.abs(diff) <= maxChange) {
    return targetVelocity;
  }
  return currentVelocity + Math.sign(diff) * maxChange;
}

// ============= LEVEL GENERATOR =============
class LevelGenerator {
  private rng: SeededRNG;

  constructor(seed: number = 12345) {
    this.rng = new SeededRNG(seed);
  }

  generateLevel(levelIndex: number): LevelConfig {
    // Two distinct difficulty bands: levels 0-99 (original) and 100-149 (new)
    const isAdvanced = levelIndex >= 100;

    // progress within each band (0 to 1)
    const progress = isAdvanced
      ? (levelIndex - 100) / 49 // 0→1 across levels 100-149
      : levelIndex / 99; // 0→1 across levels 0-99

    // ── Fruit radius ──────────────────────────────────────────────────────────
    // Levels 0-99: subtle shrink from MAX down to ~85% of range
    // Levels 100-149: locked at the radius level 99 had — no further shrink
    let fruitRadius: number;
    if (!isAdvanced) {
      fruitRadius =
        CONFIG.MIN_FRUIT_RADIUS +
        (CONFIG.MAX_FRUIT_RADIUS - CONFIG.MIN_FRUIT_RADIUS) * (1 - progress * 0.3);
    } else {
      // Radius at level 99
      fruitRadius =
        CONFIG.MIN_FRUIT_RADIUS +
        (CONFIG.MAX_FRUIT_RADIUS - CONFIG.MIN_FRUIT_RADIUS) * (1 - 0.3);
    }

    // ── Embedded knives ───────────────────────────────────────────────────────
    // Levels 0-99:   3 → 5 (hard cap 5 per original design)
    // Levels 100-149: continue from 5, ramp to hard cap of 7
    let numEmbedded: number;
    if (levelIndex < 10) {
      numEmbedded = 3;
    } else if (levelIndex < 30) {
      numEmbedded = 4;
    } else if (levelIndex < 100) {
      numEmbedded = Math.min(5, 5 + Math.floor((levelIndex - 30) / 15));
    } else {
      // Levels 100-149: ramp 5 → 7 (one extra knife every ~17 levels)
      numEmbedded = Math.min(7, 5 + Math.floor((levelIndex - 100) / 17));
    }

    // Use cluster placement for advanced levels, even distribution otherwise
    const embeddedKnives = isAdvanced
      ? this.generateClusteredKnives(numEmbedded, fruitRadius)
      : this.generateEmbeddedKnives(numEmbedded, fruitRadius);

    // ── Rotation speed ────────────────────────────────────────────────────────
    // Levels 0-99:   original ramp (×1.5 multiplier, power 0.7 curve)
    // Levels 100-149: continue ramping above level-99 speed, up to ×1.9
    let rotationSpeed: number;
    if (!isAdvanced) {
      const speedProgress = Math.pow(progress, 0.7);
      rotationSpeed =
        (CONFIG.MIN_ROTATION_SPEED +
          (CONFIG.MAX_ROTATION_SPEED - CONFIG.MIN_ROTATION_SPEED) * speedProgress) *
        1.5;
    } else {
      // Speed at level 99 (speedProgress ≈ 0.965 with power 0.7)
      const baseSpeed99 =
        (CONFIG.MIN_ROTATION_SPEED +
          (CONFIG.MAX_ROTATION_SPEED - CONFIG.MIN_ROTATION_SPEED) *
            Math.pow(99 / 99, 0.7)) *
        1.5;
      // Ramp multiplier from 1.0 → 1.27 over the 50 advanced levels
      const advMultiplier = 1.0 + progress * 0.27;
      rotationSpeed = baseSpeed99 * advMultiplier;
    }

    // ── Rotation direction ────────────────────────────────────────────────────
    const rotationDirection = this.rng.next() < 0.5 ? -1 : 1;

    // ── Rotation patterns ─────────────────────────────────────────────────────
    // Levels 1-14:   constant only
    // Levels 15-29:  speed-variation patterns
    // Levels 30-49:  + alternating, reverse_smooth
    // Levels 50-69:  + staged
    // Levels 70-99:  + chaotic
    // Levels 100-119: all of the above
    // Levels 120+:   + stutter (psychological trap)
    let rotationPatterns: RotationPatternType[];

    if (levelIndex < 15) {
      rotationPatterns = ["constant"];
    } else if (levelIndex < 30) {
      rotationPatterns = ["constant", "ramp_up_down", "pulse", "breathing"];
    } else {
      rotationPatterns = [
        "constant",
        "ramp_up_down",
        "pulse",
        "breathing",
        "alternating",
        "reverse_smooth",
      ];
      if (levelIndex >= 50) rotationPatterns.push("staged");
      if (levelIndex >= 70) rotationPatterns.push("chaotic");
      if (levelIndex >= 120) rotationPatterns.push("stutter");
    }

    // ── Knives to throw ───────────────────────────────────────────────────────
    // Original: 5 + floor(level / 10), no cap
    // Advanced: ramp but hard-cap at 15
    const knivesToThrow = Math.min(15, 5 + Math.floor(levelIndex / 10));

    // ── Coins ─────────────────────────────────────────────────────────────────
    const coinCount = Math.max(1, Math.floor(2 + progress * 3)); // 2-5 coins
    const coins = this.generateCoins(coinCount, embeddedKnives, fruitRadius);

    return {
      fruitRadius: Math.round(fruitRadius),
      embeddedKnives,
      coins,
      rotationSpeed,
      rotationDirection,
      rotationPatterns,
      knivesToThrow,
    };
  }

  private generateEmbeddedKnives(count: number, _fruitRadius: number): number[] {
    // Evenly distribute knives around the circumference
    const angles: number[] = [];

    if (count === 0) return angles;

    const spacing = 360 / count;
    const startOffset = this.rng.nextFloat(0, 360);

    for (let i = 0; i < count; i++) {
      angles.push(normalizeAngle(startOffset + i * spacing));
    }

    return angles.sort((a, b) => a - b);
  }

  private generateClusteredKnives(count: number, _fruitRadius: number): number[] {
    // "Cluster" layout: group knives into 2 tight bundles, leaving wide safe arcs
    // that trick the player into thinking there are more openings than there are.
    const angles: number[] = [];

    if (count === 0) return angles;

    const minGap = 22; // degrees between knives inside a cluster

    if (count <= 3) {
      // Small counts: one cluster + one solo knife on the opposite side
      const clusterStart = this.rng.nextFloat(0, 360);
      const clusterSize = Math.min(count - 1, 2);
      for (let i = 0; i < clusterSize; i++) {
        angles.push(normalizeAngle(clusterStart + i * minGap));
      }
      // Solo knife ~160-200° away
      angles.push(normalizeAngle(clusterStart + 170 + this.rng.nextFloat(0, 30)));
    } else {
      // Split into two clusters of roughly equal size on opposite sides
      const half = Math.ceil(count / 2);
      const clusterA = this.rng.nextFloat(0, 180);
      const clusterB = normalizeAngle(clusterA + 180 + this.rng.nextFloat(-15, 15));

      for (let i = 0; i < half; i++) {
        angles.push(normalizeAngle(clusterA + i * minGap));
      }
      for (let i = 0; i < count - half; i++) {
        angles.push(normalizeAngle(clusterB + i * minGap));
      }
    }

    return angles.sort((a, b) => a - b);
  }

  private generateCoins(count: number, knifeAngles: number[], fruitRadius: number): number[] {
    // Generate coins that don't overlap with knives
    const angles: number[] = [];
    const minDistanceFromKnife = 30; // Minimum degrees between coin and knife
    
    if (count === 0) {
      return angles;
    }
    
    // Calculate equal spacing for coins
    const spacing = 360 / count;
    const startOffset = this.rng.nextFloat(0, 360);
    
    let attempts = 0;
    const maxAttempts = count * 50;
    
    while (angles.length < count && attempts < maxAttempts) {
      // Try evenly spaced positions first
      const baseAngle = normalizeAngle(startOffset + (angles.length * spacing));
      
      // Try the base angle and nearby positions
      let angle = baseAngle;
      let valid = false;
      
      // Check multiple positions around the base angle
      for (let offset = 0; offset < 360 && !valid; offset += 5) {
        angle = normalizeAngle(baseAngle + offset);
        valid = true;
        
        // Check distance from all knives
        for (const knifeAngle of knifeAngles) {
          const diff = angleDifference(angle, knifeAngle);
          if (diff < minDistanceFromKnife) {
            valid = false;
            break;
          }
        }
        
        // Check distance from already placed coins
        for (const existingCoin of angles) {
          const diff = angleDifference(angle, existingCoin);
          if (diff < minDistanceFromKnife) {
            valid = false;
            break;
          }
        }
        
        if (valid) {
          break;
        }
      }
      
      if (valid) {
        angles.push(angle);
      } else {
        // If evenly spaced doesn't work, try random positions
        const randomAngle = this.rng.nextFloat(0, 360);
        let randomValid = true;
        
        for (const knifeAngle of knifeAngles) {
          const diff = angleDifference(randomAngle, knifeAngle);
          if (diff < minDistanceFromKnife) {
            randomValid = false;
            break;
          }
        }
        
        for (const existingCoin of angles) {
          const diff = angleDifference(randomAngle, existingCoin);
          if (diff < minDistanceFromKnife) {
            randomValid = false;
            break;
          }
        }
        
        if (randomValid) {
          angles.push(randomAngle);
        }
      }
      
      attempts++;
    }
    
    return angles.sort((a, b) => a - b);
  }

  generateAllLevels(): LevelConfig[] {
    const levels: LevelConfig[] = [];
    for (let i = 0; i < CONFIG.TOTAL_LEVELS; i++) {
      levels.push(this.generateLevel(i));
    }
    return levels;
  }
}

// ============= UTILITY FUNCTIONS =============
function normalizeAngle(angle: number): number {
  angle = angle % 360;
  if (angle < 0) angle += 360;
  return angle;
}

function angleDifference(a1: number, a2: number): number {
  const diff = normalizeAngle(a1 - a2);
  return Math.min(diff, 360 - diff);
}

// ============= GAME CLASS =============
class KnifeHitGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState = "PLAYING";
  private settings: Settings = { music: true, fx: true, haptics: true };

  // Canvas rendering (keep game coordinates in CSS pixels; render at devicePixelRatio for crispness)
  private viewW: number = 0;
  private viewH: number = 0;
  private dpr: number = 1;
  private lastTapTs: number = 0; // used to de-dupe touch + click

  // Start menu (in-canvas)
  private startMenuActive: boolean = true;
  private startMenuTime: number = 0;
  private startMenuRingAngle: number = 0; // degrees
  private startMenuRingSpeed: number = 70; // deg/sec
  private startMenuRingTargetSpeed: number = 70;
  private startMenuScale: number = 1;
  private startMenuAlpha: number = 1;
  private startMenuFruits: StartMenuFruit[] = [];
  private startIntroState: "idle" | "knives" | "done" = "idle";
  private startIntroIndex: number = 0;
  private startIntroKnifeT: number = 0;
  private startIntroKnifeFrom: { x: number; y: number } = { x: 0, y: 0 };
  private startIntroKnifeTo: { x: number; y: number } = { x: 0, y: 0 };
  private startIntroHitHold: number = 0;
  private startIntroHitsApplied: boolean = false;
  private startIntroFinishTime: number = 0;
  private shopBtnRect: { x: number; y: number; w: number; h: number } | null = null;

  // Level select
  private highestUnlockedLevel: number = 0;
  private selectedStartLevel: number = 0;
  private levelSelectScroll: number = 0;
  private levelSelectBtnRects: { x: number; y: number; w: number; h: number; level: number }[] = [];
  private levelSelectBackRect: { x: number; y: number; w: number; h: number } | null = null;
  private levelSelectTouchStartY: number = 0;
  private levelSelectTouchDragged: boolean = false;
  private levelSelectTime: number = 0;
  
  // Game objects
  private fruit!: Fruit;
  private knives: Knife[] = [];
  private coins: Coin[] = [];
  // Persistent currency balance (saved to localStorage)
  private coinBank: number = 0;
  // Weapon unlocks (knife always unlocked)
  private weaponUnlocks: Record<WeaponType, boolean> = { knife: true, kunai: false, pen: false, pencil: false };
  private knivesToThrow: number = 0;
  private currentLevel: number = 0;
  private levels: LevelConfig[] = [];
  private levelGenerator: LevelGenerator;
  
  // Rotation
  private rotationTime: number = 0;
  private currentAngularVelocity: number = 0;
  private targetAngularVelocity: number = 0;
  private activePattern: RotationPatternType = "constant";
  private patternTimer: number = 0;
  private patternDuration: number = 0;
  
  // Animation
  private lastTime: number = 0;
  private debugMode: boolean = false;
  
  // Effects
  private particles: Particle[] = [];
  private particlePool: Particle[] = [];
  private brokenKnifePieces: BrokenKnifePiece[] = [];
  private brokenPiecePool: BrokenKnifePiece[] = [];
  private screenShake: { x: number; y: number; time: number } = { x: 0, y: 0, time: 0 };
  private screenFlash: { active: boolean; time: number; duration: number } = { active: false, time: 0, duration: 0.15 };
  private backgroundOverlay: { target: number; current: number; speed: number } = { target: 0, current: 0, speed: 2.0 }; // 0 = normal, negative = darker, positive = brighter
  
  // Round timer
  private roundTimer: number = 30;
  private roundTimerActive: boolean = false;
  private timerDisplay!: HTMLElement;
  
  // Level transition
  private transitionActive: boolean = false;
  private transitionTime: number = 0;
  private transitionPhase: "bg_slide" | "fruit_zoom" | "knives_fly" | "complete" = "bg_slide";
  private bgSlideOffset: number = 0; // Background slides down from top
  private fruitZoomScale: number = 0; // Fruit zooms in from 0 to 1
  private fruitWiggleTime: number = 0; // Wiggle animation after zoom
  private embeddedKnivesFlying: boolean = false; // Track if embedded knives are flying in
  
  // Slow motion and camera
  private slowMoActive: boolean = false;
  private slowMoTime: number = 0;
  private slowMoDuration: number = 1.5; // seconds
  private cameraZoom: number = 1.0;
  private cameraTargetZoom: number = 1.0;
  private cameraX: number = 0;
  private cameraY: number = 0;
  private cameraTargetX: number = 0;
  private cameraTargetY: number = 0;
  
  // Celebration
  private celebrationActive: boolean = false;
  private celebrationTime: number = 0;
  private encouragementText: string = "";
  private encouragementX: number = -500; // Start off screen
  private tapToContinueOpacity: number = 1.0;
  private tapToContinueFlicker: number = 0;
  
  // Collision prediction and game over
  private collisionPredicted: boolean = false;
  private collisionKnifeIndex: number = -1; // Index of flying knife that will collide
  private collisionEmbeddedKnifeIndex: number = -1; // Index of embedded knife being hit
  private collisionPoint: { x: number; y: number } | null = null;
  private gameOverActive: boolean = false;
  private gameOverTimeout: boolean = false;
  private tapToRetryOpacity: number = 1.0;
  private tapToRetryFlicker: number = 0;
  
  // Assets
  private background1Image: HTMLImageElement | null = null;
  private background2Image: HTMLImageElement | null = null;
  private background3Image: HTMLImageElement | null = null;
  private selectedBackground: number = 0;
  private avocadoImage: HTMLImageElement | null = null;
  private orangeImage: HTMLImageElement | null = null;
  private grapeImage: HTMLImageElement | null = null;
  private watermelonImage: HTMLImageElement | null = null;
  private kiwiImage: HTMLImageElement | null = null;
  private lemonImage: HTMLImageElement | null = null;
  private knifeImage: HTMLImageElement | null = null;
  private brokenKnife1Image: HTMLImageElement | null = null;
  private brokenKnife2Image: HTMLImageElement | null = null;
  private brokenKunai1Image: HTMLImageElement | null = null;
  private brokenKunai2Image: HTMLImageElement | null = null;
  private brokenPen1Image: HTMLImageElement | null = null;
  private brokenPen2Image: HTMLImageElement | null = null;
  private brokenPencil1Image: HTMLImageElement | null = null;
  private brokenPencil2Image: HTMLImageElement | null = null;
  private knifeIconImage: HTMLImageElement | null = null;
  private kunaiIconImage: HTMLImageElement | null = null;
  private penIconImage: HTMLImageElement | null = null;
  private pencilIconImage: HTMLImageElement | null = null;
  private currentWeapon: WeaponType = "knife";
  private weaponImages: Record<WeaponType, HTMLImageElement | null> = {
    knife: null,
    kunai: null,
    pen: null,
    pencil: null,
  };
  private assetsLoaded: boolean = false;
  
  // Audio — all sounds decoded to AudioBuffer; BGM tracked via a live BufferSourceNode
  private sharedAudioContext: AudioContext | null = null;
  private bgmGainNode: GainNode | null = null;
  private bgmBuffers: AudioBuffer[] = [];
  private bgmIndex: number = 0;
  private bgmSource: AudioBufferSourceNode | null = null;
  private sfxBufUiTap: AudioBuffer | null = null;
  private sfxBufUiConfirm: AudioBuffer | null = null;
  private sfxBufTimeout: AudioBuffer | null = null;
  private sfxBufStab: AudioBuffer | null = null;
  private sfxBufBroke: AudioBuffer | null = null;
  private sfxBufDull: AudioBuffer | null = null;
  private sfxBufPencilBreak: AudioBuffer | null = null;
  private sfxBufSuccess: AudioBuffer | null = null;
  private sfxBufTransition: AudioBuffer | null = null;
  private sfxBufSpawn: AudioBuffer | null = null;
  private sfxBufPling: AudioBuffer | null = null;
  
  // UI Elements
  private hud: HTMLElement;
  private startScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private winScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private pauseBtn: HTMLElement;
  private settingsModal: HTMLElement;
  private weaponModal: HTMLElement;
  private levelDisplay: HTMLElement;
  private coinDisplay: HTMLElement;
  private weaponBtn: HTMLElement;
  private bottomHud: HTMLElement;
  private knifePreviewImage: HTMLImageElement;
  private knivesCount: HTMLElement;
  private knifeIconsContainer: HTMLElement;
  private knifeIconEls: HTMLImageElement[] = [];
  private lastKnifeIconsCount: number = -1;
  private lastKnifeIconsWeapon: WeaponType | null = null;
  private cachedKnifePreviewWidth: number = 0;
  private cachedKnifePreviewHeight: number = 0;
  private cachedKnifePreviewWeapon: WeaponType | null = null;
  // Cached coin display rect to avoid getBoundingClientRect every frame
  private cachedCoinDisplayX: number = 60;
  private cachedCoinDisplayY: number = 60;
  private coinDisplayRectDirty: boolean = true;
  private coinSaveDirty: boolean = false;
  // Cached isMobile value (only changes on resize)
  private isMobile: boolean = false;
  // Cached gradients — rebuilt in resizeCanvas() to avoid per-frame allocations
  private cachedVignetteGradient: CanvasGradient | null = null;
  private cachedRingGlowGradient: CanvasGradient | null = null;
  private cachedLevelSelectVignetteGradient: CanvasGradient | null = null;
  private cachedTimeoutTextGradient: CanvasGradient | null = null;
  // Pre-rendered coin sprite (drawn once, reused every frame)
  private debugPanel: HTMLElement;
  private debugContent: HTMLElement;
  private settingsIconBtn: HTMLElement;
  private settingsBtn: HTMLElement;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = true;
    (this.ctx as any).imageSmoothingQuality = "high";
    
    // Initialize UI
    this.hud = document.getElementById("hud")!;
    this.startScreen = document.getElementById("startScreen")!;
    this.gameOverScreen = document.getElementById("gameOverScreen")!;
    this.winScreen = document.getElementById("winScreen")!;
    this.pauseScreen = document.getElementById("pauseScreen")!;
    this.pauseBtn = document.getElementById("pauseBtn")!;
    this.settingsModal = document.getElementById("settingsModal")!;
    this.weaponModal = document.getElementById("weaponModal")!;
    this.levelDisplay = document.getElementById("levelDisplay")!;
    this.timerDisplay = document.getElementById("timerDisplay")!;
    this.coinDisplay = document.getElementById("coinDisplay")!;
    this.weaponBtn = document.getElementById("weaponBtn")!;
    this.bottomHud = document.getElementById("bottomHud")!;
    this.knifePreviewImage = document.getElementById("knifePreviewImage") as HTMLImageElement;
    this.knivesCount = document.getElementById("knivesCount")!;
    this.knifeIconsContainer = document.getElementById("knifeIconsContainer")!;
    this.debugPanel = document.getElementById("debugPanel")!;
    this.debugContent = document.getElementById("debugContent")!;
    this.settingsIconBtn = document.getElementById("settingsIconBtn")!;
    this.settingsBtn = document.getElementById("settingsBtn")!;
    
    // Generate levels
    this.levelGenerator = new LevelGenerator(12345);
    this.levels = this.levelGenerator.generateAllLevels();
    
    // Load assets
    this.loadAssets();
    
    // Setup event listeners
    this.setupEventListeners();
    this.setupSettings();
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    
    // Load settings
    this.loadSettings();
    // Load progression (coins + unlocks) and sync UI
    this.loadProgression();
    this.refreshWeaponShopUI();
    this.updateLevelDisplay();

    // Pre-create bottom knife icons to avoid DOM churn during throws
    this.initKnifeIconStrip();

    // Pre-warm particle pool to avoid GC spikes on first explosion
    for (let i = 0; i < 100; i++) {
      this.particlePool.push({} as Particle);
    }

    // Platform lifecycle hooks
    oasiz.onPause(() => {
      if (this.state === "PLAYING") this.pause();
      this.stopBgm();
      this.flushCoinSave();
      this.saveGameStateAll(true);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.flushCoinSave();
        this.saveGameStateAll(true);
      }
    });
    oasiz.onResume(() => {
      if (this.settings.music) this.startBgm();
    });

    // Start game loop
    this.gameLoop(0);
  }

  private initKnifeIconStrip(): void {
    this.knifeIconEls = [];
    this.knifeIconsContainer.innerHTML = "";
    const max = CONFIG.MAX_KNIVES_TO_THROW;
    for (let i = 0; i < max; i++) {
      const icon = document.createElement("img");
      icon.className = "knife-icon-bottom";
      icon.alt = "Knife icon";
      icon.style.display = "none";
      // Stagger base delay once (kept for optional animation)
      icon.style.animationDelay = `${i * 0.05}s`;
      this.knifeIconsContainer.appendChild(icon);
      this.knifeIconEls.push(icon);
    }
  }

  private loadAssets(): void {
    let loadedCount = 0;
    const totalAssets = 23; // backgrounds(3) + weapons + broken sprites + icons
    
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount === totalAssets) {
        this.assetsLoaded = true;
        console.log("[KnifeHitGame] All assets loaded");
        // Enter start menu after assets load
        this.enterStartMenu();
      }
    };
    
    // Load background 1
    this.background1Image = new Image();
    this.background1Image.src = background1Url;
    this.background1Image.onload = checkAllLoaded;
    this.background1Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load background1");
      checkAllLoaded();
    };
    
    // Load background 2
    this.background2Image = new Image();
    this.background2Image.src = background2Url;
    this.background2Image.onload = checkAllLoaded;
    this.background2Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load background2");
      checkAllLoaded();
    };

    // Load background 3
    this.background3Image = new Image();
    this.background3Image.src = background3Url;
    this.background3Image.onload = checkAllLoaded;
    this.background3Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load background3");
      checkAllLoaded();
    };
    
    // Load avocado
    this.avocadoImage = new Image();
    this.avocadoImage.src = avocadoUrl;
    this.avocadoImage.onload = checkAllLoaded;
    this.avocadoImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load avocado");
      checkAllLoaded();
    };
    
    // Load orange
    this.orangeImage = new Image();
    this.orangeImage.src = orangeUrl;
    this.orangeImage.onload = checkAllLoaded;
    this.orangeImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load orange");
      checkAllLoaded();
    };
    
    // Load grape
    this.grapeImage = new Image();
    this.grapeImage.src = grapeUrl;
    this.grapeImage.onload = checkAllLoaded;
    this.grapeImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load grape");
      checkAllLoaded();
    };
    
    // Load watermelon
    this.watermelonImage = new Image();
    this.watermelonImage.src = watermelonUrl;
    this.watermelonImage.onload = checkAllLoaded;
    this.watermelonImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load watermelon");
      checkAllLoaded();
    };
    
    // Load kiwi
    this.kiwiImage = new Image();
    this.kiwiImage.src = kiwiUrl;
    this.kiwiImage.onload = checkAllLoaded;
    this.kiwiImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load kiwi");
      checkAllLoaded();
    };
    
    // Load lemon
    this.lemonImage = new Image();
    this.lemonImage.src = lemonUrl;
    this.lemonImage.onload = checkAllLoaded;
    this.lemonImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load lemon");
      checkAllLoaded();
    };
    
    // Load all weapons
    this.weaponImages.knife = new Image();
    this.weaponImages.knife.src = knifeUrl;
    this.weaponImages.knife.onload = checkAllLoaded;
    this.weaponImages.knife.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load knife");
      checkAllLoaded();
    };
    
    this.weaponImages.kunai = new Image();
    this.weaponImages.kunai.src = kunaiUrl;
    this.weaponImages.kunai.onload = checkAllLoaded;
    this.weaponImages.kunai.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load kunai");
      checkAllLoaded();
    };
    
    this.weaponImages.pen = new Image();
    this.weaponImages.pen.src = penUrl;
    this.weaponImages.pen.onload = checkAllLoaded;
    this.weaponImages.pen.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load pen");
      checkAllLoaded();
    };
    
    this.weaponImages.pencil = new Image();
    this.weaponImages.pencil.src = pencilUrl;
    this.weaponImages.pencil.onload = checkAllLoaded;
    this.weaponImages.pencil.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load pencil");
      checkAllLoaded();
    };

    this.updateWeaponImage();
    
    // Load broken knife sprites (for normal knife)
    this.brokenKnife1Image = new Image();
    this.brokenKnife1Image.src = brokenKnife1Url;
    this.brokenKnife1Image.onload = checkAllLoaded;
    this.brokenKnife1Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken knife 1");
      checkAllLoaded();
    };
    
    this.brokenKnife2Image = new Image();
    this.brokenKnife2Image.src = brokenKnife2Url;
    this.brokenKnife2Image.onload = checkAllLoaded;
    this.brokenKnife2Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken knife 2");
      checkAllLoaded();
    };
    
    // Load broken kunai sprites
    this.brokenKunai1Image = new Image();
    this.brokenKunai1Image.src = brokenKunai1Url;
    this.brokenKunai1Image.onload = checkAllLoaded;
    this.brokenKunai1Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken kunai 1");
      checkAllLoaded();
    };

    this.brokenKunai2Image = new Image();
    this.brokenKunai2Image.src = brokenKunai2Url;
    this.brokenKunai2Image.onload = checkAllLoaded;
    this.brokenKunai2Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken kunai 2");
      checkAllLoaded();
    };

    // Load broken pen sprites
    this.brokenPen1Image = new Image();
    this.brokenPen1Image.src = brokenPen1Url;
    this.brokenPen1Image.onload = checkAllLoaded;
    this.brokenPen1Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken pen 1");
      checkAllLoaded();
    };

    this.brokenPen2Image = new Image();
    this.brokenPen2Image.src = brokenPen2Url;
    this.brokenPen2Image.onload = checkAllLoaded;
    this.brokenPen2Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken pen 2");
      checkAllLoaded();
    };

    this.brokenPencil1Image = new Image();
    this.brokenPencil1Image.src = brokenPencil1Url;
    this.brokenPencil1Image.onload = checkAllLoaded;
    this.brokenPencil1Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken pencil 1");
      checkAllLoaded();
    };

    this.brokenPencil2Image = new Image();
    this.brokenPencil2Image.src = brokenPencil2Url;
    this.brokenPencil2Image.onload = checkAllLoaded;
    this.brokenPencil2Image.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load broken pen 2");
      checkAllLoaded();
    };

    // Load knife icon
    this.knifeIconImage = new Image();
    this.knifeIconImage.src = knifeIconUrl;
    this.knifeIconImage.onload = checkAllLoaded;
    this.knifeIconImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load knife icon");
      checkAllLoaded();
    };

    // Load kunai icon
    this.kunaiIconImage = new Image();
    this.kunaiIconImage.src = kunaiIconUrl;
    this.kunaiIconImage.onload = checkAllLoaded;
    this.kunaiIconImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load kunai icon");
      checkAllLoaded();
    };

    // Load pen icon
    this.penIconImage = new Image();
    this.penIconImage.src = penIconUrl;
    this.penIconImage.onload = checkAllLoaded;
    this.penIconImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load pen icon");
      checkAllLoaded();
    };

    this.pencilIconImage = new Image();
    this.pencilIconImage.src = pencilIconUrl;
    this.pencilIconImage.onload = checkAllLoaded;
    this.pencilIconImage.onerror = () => {
      console.warn("[KnifeHitGame] Failed to load pencil icon");
      checkAllLoaded();
    };
    
    // Initialise single shared AudioContext for all audio
    try {
      this.sharedAudioContext = new (AudioContext || (window as any).webkitAudioContext)();
      // Dedicated gain node for BGM so we can mute music independently
      this.bgmGainNode = this.sharedAudioContext.createGain();
      this.bgmGainNode.gain.value = 0.22;
      this.bgmGainNode.connect(this.sharedAudioContext.destination);
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to create AudioContext:", e);
    }

    // Helper: fetch a URL and decode to AudioBuffer (non-blocking, best-effort)
    const decodeUrl = async (url: string): Promise<AudioBuffer | null> => {
      if (!this.sharedAudioContext) return null;
      try {
        const resp = await fetch(url);
        const arrayBuf = await resp.arrayBuffer();
        return await this.sharedAudioContext.decodeAudioData(arrayBuf);
      } catch (e) {
        console.warn("[KnifeHitGame] Failed to decode audio:", url, e);
        return null;
      }
    };

    // Decode all file-based SFX in parallel (fire and forget — game is playable before they arrive)
    Promise.all([
      decodeUrl(uiTapUrl),
      decodeUrl(uiConfirmUrl),
      decodeUrl(timeoutUrl),
      decodeUrl(stabUrl),
      decodeUrl(brokeUrl),
      decodeUrl(dullUrl),
      decodeUrl(successUrl),
      decodeUrl(pencilBreakUrl),
      decodeUrl(bgm1Url),
      decodeUrl(bgm2Url),
    ]).then(([uiTap, uiConfirm, timeout, stab, broke, dull, success, pencilBreak, bgm1, bgm2]) => {
      this.sfxBufUiTap = uiTap;
      this.sfxBufUiConfirm = uiConfirm;
      this.sfxBufTimeout = timeout;
      this.sfxBufStab = stab;
      this.sfxBufBroke = broke;
      this.sfxBufDull = dull;
      this.sfxBufSuccess = success;
      this.sfxBufPencilBreak = pencilBreak;
      if (bgm1) this.bgmBuffers.push(bgm1);
      if (bgm2) this.bgmBuffers.push(bgm2);
      console.log("[KnifeHitGame] All audio decoded");
      // Start BGM now that buffers are ready (ctx.resume handles autoplay policy)
      if (this.settings.music) this.startBgm();
    });

    // Fallback: if the AudioContext is still suspended after first user interaction
    // (autoplay policy), resume and start BGM then
    const onFirstInteraction = () => {
      const ctx = this.sharedAudioContext;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          if (this.settings.music && !this.bgmSource && this.bgmBuffers.length > 0) {
            this.startBgm();
          }
        });
      }
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
    };
    document.addEventListener("click", onFirstInteraction);
    document.addEventListener("touchstart", onFirstInteraction);
    document.addEventListener("keydown", onFirstInteraction);

    // Build procedural sound buffers synchronously (no fetch needed)
    this.sfxBufTransition = this.buildTransitionBuffer();
    this.sfxBufSpawn = this.buildSpawnBuffer();
    this.sfxBufPling = this.buildPlingBuffer();

  }
  
  // ─── unified Web Audio playback helper ───────────────────────────────────
  private playBuffer(buffer: AudioBuffer | null, volume = 1.0): void {
    const ctx = this.sharedAudioContext;
    if (!ctx || !buffer) return;
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.warn("[KnifeHitGame] playBuffer error:", e);
    }
  }

  // ─── BGM ─────────────────────────────────────────────────────────────────
  private playNextBgm(): void {
    if (this.bgmBuffers.length === 0) return;
    this.bgmIndex = (this.bgmIndex + 1) % this.bgmBuffers.length;
    this.startBgm();
  }

  private startBgm(): void {
    const ctx = this.sharedAudioContext;
    if (!this.settings.music || !ctx || !this.bgmGainNode) return;
    if (this.bgmBuffers.length === 0) return;
    this.stopBgm();
    const buffer = this.bgmBuffers[this.bgmIndex];
    if (!buffer) return;

    const doPlay = () => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = false;
        source.connect(this.bgmGainNode!);
        source.onended = () => {
          if (this.bgmSource === source) this.playNextBgm();
        };
        source.start();
        this.bgmSource = source;
      } catch (e) {
        console.warn("[KnifeHitGame] startBgm error:", e);
      }
    };

    // Resume suspended context (browser autoplay policy) then play
    if (ctx.state === "suspended") {
      ctx.resume().then(doPlay).catch((e) => console.warn("[KnifeHitGame] ctx.resume error:", e));
    } else {
      doPlay();
    }
  }

  private stopBgm(): void {
    if (this.bgmSource) {
      try { this.bgmSource.onended = null; this.bgmSource.stop(); } catch (_) {}
      this.bgmSource = null;
    }
  }

  private buildTransitionBuffer(): AudioBuffer | null {
    const ctx = this.sharedAudioContext;
    if (!ctx) return null;
    try {
      const duration = 0.5;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        const t = i / ctx.sampleRate;
        const fadeIn = Math.min(1, t / 0.1);
        const fadeOut = Math.min(1, (duration - t) / 0.1);
        const envelope = fadeIn * fadeOut;
        const freq = 400 + (200 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
      }
      return buffer;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to build transition buffer:", e);
      return null;
    }
  }

  private buildSpawnBuffer(): AudioBuffer | null {
    const ctx = this.sharedAudioContext;
    if (!ctx) return null;
    try {
      const duration = 0.3;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.exp(-t * 15) * (1 - t / duration);
        const freq = 600 + (300 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.4;
      }
      return buffer;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to build spawn buffer:", e);
      return null;
    }
  }

  private buildPlingBuffer(): AudioBuffer | null {
    const ctx = this.sharedAudioContext;
    if (!ctx) return null;
    try {
      const duration = 0.2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.exp(-t * 20) * (1 - t / duration);
        const freq = 800 + (400 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
      }
      return buffer;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to build pling buffer:", e);
      return null;
    }
  }

  private setupEventListeners(): void {
    // Start button
    document.getElementById("startButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiConfirm();
      if (this.state === "START") this.startStartMenuIntro();
    });
    
    // Restart button
    document.getElementById("restartButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.restart();
    });
    
    // Menu buttons
    document.getElementById("menuButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showMenu();
    });
    document.getElementById("menuButtonWin")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showMenu();
    });
    document.getElementById("menuButtonPause")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showMenu();
    });
    
    // Next level button
    document.getElementById("nextLevelButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.nextLevel();
    });
    
    // Pause button
    this.pauseBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.pause();
    });

    // Resume button (in pause modal)
    document.getElementById("resumeButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.resume();
    });

    // Settings (top right button)
    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showSettings();
    });
    
    // Settings (HUD icon)
    this.settingsIconBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showSettings();
    });
    document.getElementById("closeSettings")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.hideSettings();
    });
    
    // Weapon selection button
    this.weaponBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.showWeaponModal();
    });
    
    // Weapon selection modal
    document.getElementById("closeWeaponModal")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiTap();
      this.hideWeaponModal();
    });
    
    document.getElementById("selectKnife")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiConfirm();
      this.handleWeaponOptionClick("knife");
    });
    
    document.getElementById("selectKunai")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiConfirm();
      this.handleWeaponOptionClick("kunai");
    });
    
    document.getElementById("selectPen")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiConfirm();
      this.handleWeaponOptionClick("pen");
    });

    document.getElementById("selectPencil")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playUiConfirm();
      this.handleWeaponOptionClick("pencil");
    });
    
    // Input
    this.canvas.addEventListener("click", (e) => this.handleInput(e));
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.state === "LEVEL_SELECT") {
        const touch = e.touches[0];
        this.levelSelectTouchStartY = touch.clientY;
        this.levelSelectTouchDragged = false;
        return;
      }
      this.handleInput(e);
    });
    this.canvas.addEventListener("touchmove", (e) => {
      if (this.state !== "LEVEL_SELECT") return;
      e.preventDefault();
      const touch = e.touches[0];
      const dy = this.levelSelectTouchStartY - touch.clientY;
      if (Math.abs(dy) > 8) {
        this.levelSelectTouchDragged = true;
      }
      this.levelSelectScroll += dy;
      this.levelSelectTouchStartY = touch.clientY;
    }, { passive: false } as any);
    this.canvas.addEventListener("touchend", (e) => {
      if (this.state !== "LEVEL_SELECT") return;
      if (!this.levelSelectTouchDragged) {
        this.handleInput(e);
      }
      this.levelSelectTouchDragged = false;
    });
    this.canvas.addEventListener("wheel", (e) => {
      if (this.state !== "LEVEL_SELECT") return;
      e.preventDefault();
      this.levelSelectScroll += e.deltaY;
    }, { passive: false } as any);
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (this.state === "PLAYING") {
          this.throwKnife();
        }
      } else if (e.code === "KeyL" && this.state === "PLAYING") {
        // Debug: Skip level
        this.nextLevel();
      } else if (e.code === "KeyR") {
        // Debug: Restart
        this.restart();
      } else if (e.code === "KeyD") {
        this.debugMode = !this.debugMode;
        this.debugPanel.classList.toggle("visible", this.debugMode);
      } else if (e.code === "Escape" && this.state === "LEVEL_SELECT") {
        this.enterStartMenu();
      }
    });
  }

  private safeStorageGet(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn("[KnifeHitGame] localStorage.getItem failed:", key, e);
      return null;
    }
  }

  private safeStorageSet(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[KnifeHitGame] localStorage.setItem failed:", key, e);
    }
  }

  private bindTap(el: HTMLElement, handler: () => void): void {
    const wrapped = (ev: Event) => {
      // Prevent canvas touch handler from interfering in some WebViews
      if (typeof (ev as any).preventDefault === "function") (ev as any).preventDefault();
      if (typeof (ev as any).stopPropagation === "function") (ev as any).stopPropagation();

      // De-dupe touch + click double fire
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - this.lastTapTs < 250) return;
      this.lastTapTs = now;

      handler();
    };

    if (typeof (window as any).PointerEvent !== "undefined") {
      el.addEventListener("pointerup", wrapped as any, { passive: false } as any);
    } else {
      el.addEventListener("touchend", wrapped as any, { passive: false } as any);
      el.addEventListener("click", wrapped as any);
    }
  }

  private syncSettingsToggleUI(): void {
    document.getElementById("musicToggle")?.classList.toggle("active", this.settings.music);
    document.getElementById("fxToggle")?.classList.toggle("active", this.settings.fx);
    document.getElementById("hapticsToggle")?.classList.toggle("active", this.settings.haptics);
  }

  private setupSettings(): void {
    const musicToggle = document.getElementById("musicToggle")!;
    const fxToggle = document.getElementById("fxToggle")!;
    const hapticsToggle = document.getElementById("hapticsToggle")!;
    
    this.bindTap(musicToggle, () => {
      this.settings.music = !this.settings.music;
      musicToggle.classList.toggle("active", this.settings.music);
      this.saveSettings();
      if (this.settings.music) {
        this.startBgm();
      } else if (!this.settings.music) {
        this.stopBgm();
      }
    });
    
    this.bindTap(fxToggle, () => {
      this.settings.fx = !this.settings.fx;
      fxToggle.classList.toggle("active", this.settings.fx);
      this.saveSettings();
    });
    
    this.bindTap(hapticsToggle, () => {
      this.settings.haptics = !this.settings.haptics;
      hapticsToggle.classList.toggle("active", this.settings.haptics);
      this.saveSettings();
    });
    
    // Initialize toggle states
    this.syncSettingsToggleUI();
  }

  private loadSettings(): void {
    const saved = this.safeStorageGet("knifeHitSettings");
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch {
        // ignore invalid JSON
      }
    }
    
    // Load weapon preference
    const weaponSaved = this.safeStorageGet("knifeHitWeapon");
    if (weaponSaved && (weaponSaved === "knife" || weaponSaved === "kunai" || weaponSaved === "pen" || weaponSaved === "pencil")) {
      this.currentWeapon = weaponSaved as WeaponType;
    }
    this.updateWeaponImage();

    // Sync settings toggle UI after loading
    this.syncSettingsToggleUI();
  }
  
  private saveWeapon(): void {
    this.safeStorageSet("knifeHitWeapon", this.currentWeapon);
    this.saveGameStateAll();
  }

  private loadTotalCoins(): number {
    try {
      return parseInt(this.safeStorageGet("knifeHitCoins") || "0", 10) || 0;
    } catch {
      return 0;
    }
  }

  private saveTotalCoins(): void {
    this.safeStorageSet("knifeHitCoins", String(this.coinBank));
    this.saveGameStateAll();
  }

  private loadHighestLevel(): number {
    try {
      return parseInt(this.safeStorageGet("knifeHitHighestLevel") || "0", 10) || 0;
    } catch {
      return 0;
    }
  }

  private saveGameStateAll(flush = false): void {
    const state = {
      coinBank: this.coinBank,
      currentWeapon: this.currentWeapon,
      weaponUnlocks: {
        pen: this.weaponUnlocks.pen,
        kunai: this.weaponUnlocks.kunai,
        pencil: this.weaponUnlocks.pencil,
      },
      highestUnlockedLevel: this.highestUnlockedLevel,
    };
    oasiz.saveGameState(state);
    if (flush) oasiz.flushGameState();
  }

  private saveHighestLevel(): void {
    this.safeStorageSet("knifeHitHighestLevel", String(this.highestUnlockedLevel));
    this.saveGameStateAll(true);
  }

  private loadProgression(): void {
    // Load from oasiz.loadGameState() (cross-device), falling back to localStorage
    const cloudState = oasiz.loadGameState() as {
      coinBank?: number;
      currentWeapon?: WeaponType;
      weaponUnlocks?: Partial<Record<WeaponType, boolean>>;
      highestUnlockedLevel?: number;
    };

    const hasCloudState = Object.keys(cloudState).length > 0;

    if (hasCloudState) {
      // Always read localStorage too — it's written synchronously on this device
      // and may be newer than the platform's cached snapshot of loadGameState()
      const localCoins = this.loadTotalCoins();
      const localLevel = this.loadHighestLevel();

      const cloudCoins = typeof cloudState.coinBank === "number" ? cloudState.coinBank : 0;
      const cloudLevel = typeof cloudState.highestUnlockedLevel === "number" ? cloudState.highestUnlockedLevel : 0;

      // Take the higher of cloud vs local — they should match, but local wins if cloud is stale
      this.coinBank = Math.max(0, cloudCoins, localCoins);
      this.highestUnlockedLevel = Math.max(0, cloudLevel, localLevel);

      const unlocks = cloudState.weaponUnlocks ?? {};
      this.weaponUnlocks = {
        knife: true,
        kunai: Boolean(unlocks.kunai),
        pen: Boolean(unlocks.pen),
        pencil: Boolean(unlocks.pencil),
      };
      const validWeapons: WeaponType[] = ["knife", "kunai", "pen", "pencil"];
      if (cloudState.currentWeapon && validWeapons.includes(cloudState.currentWeapon)) {
        this.currentWeapon = cloudState.currentWeapon;
      }
    } else {
      // Fallback: read legacy localStorage values
      this.coinBank = this.loadTotalCoins();
      this.highestUnlockedLevel = this.loadHighestLevel();

      const rawUnlocks = this.safeStorageGet(ECONOMY.UNLOCKS_STORAGE_KEY);
      if (rawUnlocks) {
        try {
          const obj = JSON.parse(rawUnlocks) as Partial<Record<WeaponType, boolean>>;
          this.weaponUnlocks = {
            knife: true,
            kunai: Boolean(obj.kunai),
            pen: Boolean(obj.pen),
            pencil: Boolean(obj.pencil),
          };
        } catch {
          this.weaponUnlocks = { knife: true, kunai: false, pen: false, pencil: false };
        }
      } else {
        this.weaponUnlocks = { knife: true, kunai: false, pen: false, pencil: false };
      }
    }

    // If the saved weapon is locked, force fallback to knife
    if (!this.weaponUnlocks[this.currentWeapon]) {
      this.currentWeapon = "knife";
      this.saveWeapon();
      this.updateWeaponImage();
    }
  }

  private saveProgression(): void {
    this.safeStorageSet(
      ECONOMY.UNLOCKS_STORAGE_KEY,
      JSON.stringify({ kunai: this.weaponUnlocks.kunai, pen: this.weaponUnlocks.pen, pencil: this.weaponUnlocks.pencil })
    );
    this.saveGameStateAll();
  }

  private addCoins(amount: number): void {
    const n = Math.max(0, Math.floor(amount));
    if (n <= 0) return;
    this.coinBank = Math.max(0, Math.floor(this.coinBank + n));
    this.coinSaveDirty = true;
    requestAnimationFrame(() => {
      this.updateLevelDisplay();
      this.refreshWeaponShopUI();
    });
  }

  private flushCoinSave(): void {
    if (!this.coinSaveDirty) return;
    this.saveTotalCoins();
    this.coinSaveDirty = false;
  }

  private canAfford(cost: number): boolean {
    const c = Math.max(0, Math.floor(cost));
    return this.coinBank >= c;
  }

  private trySpendCoins(cost: number): boolean {
    const c = Math.max(0, Math.floor(cost));
    if (c <= 0) return true;
    if (this.coinBank < c) return false;
    this.coinBank = Math.max(0, Math.floor(this.coinBank - c));
    this.saveTotalCoins();
    this.updateLevelDisplay();
    this.refreshWeaponShopUI();
    return true;
  }

  private getWeaponPrice(weapon: WeaponType): number {
    if (weapon === "knife") return 0;
    if (weapon === "kunai") return ECONOMY.PRICES.kunai;
    if (weapon === "pen") return ECONOMY.PRICES.pen;
    return ECONOMY.PRICES.pencil;
  }

  private refreshWeaponShopUI(): void {
    if (!this.weaponModal.classList.contains("visible")) return;

    const elBalance = document.getElementById("weaponBalance");
    if (elBalance) elBalance.textContent = `Balance: ${this.coinBank}`;

    const weapons: WeaponType[] = ["knife", "kunai", "pen", "pencil"];
    const btnIds: Record<WeaponType, string> = { knife: "selectKnife", kunai: "selectKunai", pen: "selectPen", pencil: "selectPencil" };
    const subIds: Record<WeaponType, string> = { knife: "weaponSubKnife", kunai: "weaponSubKunai", pen: "weaponSubPen", pencil: "weaponSubPencil" };
    for (const w of weapons) {
      const btnId = btnIds[w];
      const subId = subIds[w];

      const btn = document.getElementById(btnId);
      const sub = document.getElementById(subId);
      if (!btn) continue;

      const unlocked = Boolean(this.weaponUnlocks[w]);
      btn.classList.toggle("locked", !unlocked);
      btn.classList.toggle("active", this.currentWeapon === w);

      if (sub) {
        if (w === "knife" || unlocked) {
          sub.textContent = "Owned";
          sub.classList.remove("can-afford");
        } else {
          const price = this.getWeaponPrice(w);
          sub.textContent = `${price} coins`;
          sub.classList.toggle("can-afford", this.canAfford(price));
        }
      }
    }
  }
  
  private updateWeaponImage(): void {
    // Update the active weapon image
    this.knifeImage = this.weaponImages[this.currentWeapon];
    
    // Update preview image
    if (this.knifePreviewImage && this.knifeImage) {
      this.knifePreviewImage.src = this.knifeImage.src;
    }
    
    // Update weapon modal preview images
    const previewKnife = document.getElementById("weaponPreviewKnife") as HTMLImageElement;
    const previewKunai = document.getElementById("weaponPreviewKunai") as HTMLImageElement;
    const previewPen = document.getElementById("weaponPreviewPen") as HTMLImageElement;
    
    if (previewKnife && this.weaponImages.knife) {
      previewKnife.src = this.weaponImages.knife.src;
    }
    if (previewKunai && this.weaponImages.kunai) {
      previewKunai.src = this.weaponImages.kunai.src;
    }
    if (previewPen && this.weaponImages.pen) {
      previewPen.src = this.weaponImages.pen.src;
    }
    const previewPencil = document.getElementById("weaponPreviewPencil") as HTMLImageElement;
    if (previewPencil && this.weaponImages.pencil) {
      previewPencil.src = this.weaponImages.pencil.src;
    }
    
    // Update active state in modal
    document.getElementById("selectKnife")?.classList.toggle("active", this.currentWeapon === "knife");
    document.getElementById("selectKunai")?.classList.toggle("active", this.currentWeapon === "kunai");
    document.getElementById("selectPen")?.classList.toggle("active", this.currentWeapon === "pen");
    document.getElementById("selectPencil")?.classList.toggle("active", this.currentWeapon === "pencil");
  }

  private saveSettings(): void {
    this.safeStorageSet("knifeHitSettings", JSON.stringify(this.settings));
  }

  private resizeCanvas(): void {
    const container = this.canvas.parentElement!;
    const cssW = Math.max(1, Math.floor(container.clientWidth));
    const cssH = Math.max(1, Math.floor(container.clientHeight));

    this.viewW = cssW;
    this.viewH = cssH;
    // Cap DPR at 2 to keep canvas resolution manageable on high-DPR devices (e.g. iPhone DPR=3)
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);

    // Ensure the canvas displays at CSS pixel size
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Cache isMobile (expensive matchMedia call)
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    // Mark coin display rect as stale after resize
    this.coinDisplayRectDirty = true;

    // Apply DPR transform once here so render() doesn't have to each frame
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Rebuild cached gradients now that w/h are known
    const w = cssW;
    const h = cssH;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const minWH = Math.min(w, h);

    this.cachedVignetteGradient = this.ctx.createRadialGradient(cx, cy, minWH * 0.2, cx, cy, minWH * 0.8);
    this.cachedVignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
    this.cachedVignetteGradient.addColorStop(1, "rgba(0,0,0,0.35)");

    const ringR = minWH * 0.22;
    this.cachedRingGlowGradient = this.ctx.createRadialGradient(cx, cy, ringR * 0.55, cx, cy, ringR * 1.15);
    this.cachedRingGlowGradient.addColorStop(0, "rgba(255,255,255,0)");
    this.cachedRingGlowGradient.addColorStop(0.55, "rgba(255,255,255,0.08)");
    this.cachedRingGlowGradient.addColorStop(1, "rgba(255,255,255,0)");

    const lsCx = w * 0.5;
    const lsCy = h * 0.5;
    const lsMin = Math.min(w, h);
    this.cachedLevelSelectVignetteGradient = this.ctx.createRadialGradient(lsCx, lsCy, lsMin * 0.15, lsCx, lsCy, lsMin * 0.85);
    this.cachedLevelSelectVignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
    this.cachedLevelSelectVignetteGradient.addColorStop(1, "rgba(0,0,0,0.4)");

    const fontSize = Math.min(w * 0.14, 80);
    this.cachedTimeoutTextGradient = this.ctx.createLinearGradient(0, -fontSize / 2, 0, fontSize / 2);
    this.cachedTimeoutTextGradient.addColorStop(0, "#ff6644");
    this.cachedTimeoutTextGradient.addColorStop(0.5, "#ff2211");
    this.cachedTimeoutTextGradient.addColorStop(1, "#cc0000");
  }

  private handleInput(e: MouseEvent | TouchEvent): void {
    if (this.state === "PLAYING") {
      this.throwKnife();
    } else if (this.state === "WIN" && this.celebrationActive) {
      // Tap to continue to next level
      this.celebrationActive = false;
      // Reset background overlay before next level
      this.backgroundOverlay.target = 0;
      this.nextLevel();
    } else if (this.state === "GAME_OVER" && this.gameOverActive) {
      // Tap to retry
      this.restart();
    } else if (this.state === "LEVEL_SELECT") {
      if (this.levelSelectTouchDragged) return;
      let px: number, py: number;
      if (e instanceof TouchEvent && e.changedTouches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        px = e.changedTouches[0].clientX - rect.left;
        py = e.changedTouches[0].clientY - rect.top;
      } else if (e instanceof MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        px = e.clientX - rect.left;
        py = e.clientY - rect.top;
      } else {
        return;
      }

      // Back button
      const bb = this.levelSelectBackRect;
      if (bb && px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h) {
        this.triggerHaptic("light");
        this.playUiTap();
        this.enterStartMenu();
        return;
      }

      // Level buttons
      for (const btn of this.levelSelectBtnRects) {
        if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
          this.triggerHaptic("light");
          this.playUiConfirm();
          this.selectedStartLevel = btn.level;
          this.startGame();
          return;
        }
      }
    } else if (this.state === "START") {
      if (this.shopBtnRect) {
        let px: number, py: number;
        if (e instanceof TouchEvent && e.changedTouches.length > 0) {
          const rect = this.canvas.getBoundingClientRect();
          px = e.changedTouches[0].clientX - rect.left;
          py = e.changedTouches[0].clientY - rect.top;
        } else if (e instanceof MouseEvent) {
          const rect = this.canvas.getBoundingClientRect();
          px = e.clientX - rect.left;
          py = e.clientY - rect.top;
        } else {
          this.startStartMenuIntro();
          return;
        }
        const sb = this.shopBtnRect;
        if (px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) {
          this.triggerHaptic("light");
          this.playUiTap();
          this.showWeaponModal();
          return;
        }
      }
      this.playUiConfirm();
      this.startStartMenuIntro();
    }
  }

  private throwKnife(): void {
    if (this.transitionActive) return; // Don't allow throwing during transition
    if (this.knivesToThrow <= 0) return;
    if (this.knives.some(k => k.isFlying)) return; // Only one knife flying at a time
    
    // Derive throw origin from the actual knifePreviewImage element position so
    // the knife visually launches from the UI knife on both desktop and mobile.
    let canvasX = this.viewW * 0.5;
    let canvasY = this.viewH * 0.9;
    if (this.knifePreviewImage && this.knifePreviewImage.offsetParent !== null) {
      const rect = this.knifePreviewImage.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      // Center of the preview image in canvas-local CSS pixels
      canvasX = rect.left - canvasRect.left + rect.width / 2;
      canvasY = rect.top - canvasRect.top + rect.height / 2;
    }

    // Get fruit center position
    const fruitCenterX = this.viewW * CONFIG.FRUIT_CENTER_X;
    const fruitCenterY = this.viewH * CONFIG.FRUIT_CENTER_Y;

    // Cache flying knife render size + start/end rotations (for canvas render)
    let flyW: number | undefined;
    let flyH: number | undefined;
    let flyStartRot: number | undefined;
    let flyEndRot: number | undefined;

    if (this.knifeImage && this.assetsLoaded && this.fruit) {
      const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
      const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
      const aspectRatio = imageWidth / imageHeight;
      const baseSize = this.fruit.radius * 0.6;

      if (aspectRatio > 1) {
        flyW = baseSize;
        flyH = baseSize / aspectRatio;
      } else {
        flyH = baseSize;
        flyW = baseSize * aspectRatio;
      }

      const isHorizontal = aspectRatio > 1;
      // Wide sprites (knife/kunai): -90° so blade points up, matching the vertical preview
      // Narrow sprites (pen/pencil): 0° already points up in natural orientation
      flyStartRot = isHorizontal ? -Math.PI / 2 : 0;
      // Wide sprites: rotate so blade faces the fruit (atan2 gives the direction to target)
      // Narrow sprites: same formula + 90° offset because their "forward" axis is the image's vertical
      const dirAngle = Math.atan2(fruitCenterY - canvasY, fruitCenterX - canvasX);
      flyEndRot = isHorizontal ? dirAngle : dirAngle + Math.PI / 2;
    }
    
    const knife: Knife = {
      angle: 0, // Will be set when it sticks
      isFlying: true,
      flyX: canvasX,
      flyY: canvasY,
      flyStartX: canvasX,
      flyStartY: canvasY,
      flyTime: 0,
      flyW,
      flyH,
      flyStartRot,
      flyEndRot,
      stickBounce: 0,
      throwScale: 1.0, // No scale animation
      throwRotation: flyStartRot ?? -Math.PI / 2,
      isColliding: false,
    };
    
    this.knives.push(knife);
    this.knivesToThrow--;
    
    // Check if this is the last knife - trigger slow motion
    const isLastKnife = this.knivesToThrow === 0;
    if (isLastKnife) {
      this.slowMoActive = true;
      this.slowMoTime = 0;
      this.cameraTargetZoom = 2.0; // Zoom in 2x
      
      // Target camera to where knife will hit the fruit (fruit center)
      // Don't offset camera - just zoom to fruit center
      this.cameraTargetX = 0;
      this.cameraTargetY = 0;
    }
    
    // Immediately show the next knife in the preview (flying knife is separate now)
    // Show preview even if it's the last knife (before it was thrown)
    this.updateKnivesRemaining();
    this.triggerHaptic("light");
  }

  private enterLevelSelect(): void {
    this.state = "LEVEL_SELECT";
    this.levelSelectBtnRects = [];
    this.levelSelectBackRect = null;
    this.levelSelectTouchDragged = false;
    this.levelSelectTime = 0;

    // Scroll so the highest unlocked level row is visible
    const w = this.viewW;
    const isMobile = this.isMobile;
    const cols = isMobile ? 5 : 10;
    const gridPadX = w * 0.04;
    const gap = Math.min(w * 0.02, 8);
    const availW = w - gridPadX * 2;
    const cellSize = Math.min((availW - gap * (cols - 1)) / cols, isMobile ? 60 : 56);
    const targetRow = Math.floor(this.highestUnlockedLevel / cols);
    // Place the target row roughly in the upper third of the visible area
    this.levelSelectScroll = Math.max(0, targetRow * (cellSize + gap) - (cellSize + gap));
  }

  private startGame(): void {
    this.refreshWeaponShopUI();

    this.currentLevel = this.selectedStartLevel;
    this.loadLevel(this.currentLevel);
    this.state = "PLAYING";
    this.startScreen.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.winScreen.classList.add("hidden");
    this.pauseScreen.classList.add("hidden");
    // Keep gameplay UI hidden until the first transition completes (we animate it in)
    this.hud.classList.add("hidden");
    this.settingsIconBtn.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.bottomHud.classList.add("hidden");
  }

  private enterStartMenu(): void {
    this.flushCoinSave();
    this.startBgm();

    if (this.viewW <= 0 || this.viewH <= 0) this.resizeCanvas();

    this.state = "START";
    this.startMenuActive = true;
    this.startMenuTime = 0;
    this.startMenuRingAngle = 0;
    this.startMenuRingSpeed = 70;
    this.startMenuRingTargetSpeed = 70;
    this.startMenuScale = 1;
    this.startMenuAlpha = 1;
    this.startIntroState = "idle";
    this.startIntroIndex = 0;
    this.startIntroKnifeT = 0;
    this.startIntroHitHold = 0;
    this.startIntroHitsApplied = false;
    this.startIntroFinishTime = 0;
    this.particles = [];

    this.updateLevelDisplay();
    this.refreshWeaponShopUI();

    // Hide gameplay UI on start screen
    this.gameOverScreen.classList.add("hidden");
    this.winScreen.classList.add("hidden");
    this.pauseScreen.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.settingsIconBtn.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.pauseBtn.classList.add("hidden");
    this.bottomHud.classList.add("hidden");
    // Keep legacy overlay hidden; start menu is rendered on canvas
    this.startScreen.classList.add("hidden");

    // Build fruit ring (use loaded fruit images, filtered)
    const imgs = [
      this.avocadoImage,
      this.orangeImage,
      this.grapeImage,
      this.watermelonImage,
      this.kiwiImage,
      this.lemonImage,
    ].filter((i): i is HTMLImageElement => Boolean(i));

    const count = imgs.length;
    this.startMenuFruits = [];
    for (let i = 0; i < count; i++) {
      this.startMenuFruits.push({
        image: imgs[i],
        baseAngle: (360 / count) * i,
        hitDistortion: 0,
      });
    }

    // Reset camera
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraTargetX = 0;
    this.cameraTargetY = 0;
    this.transitionActive = false;
    this.celebrationActive = false;
    this.gameOverActive = false;
    this.gameOverTimeout = false;
    this.screenFlash.active = false;
    this.backgroundOverlay.target = 0;
    this.backgroundOverlay.current = 0;
  }

  private startStartMenuIntro(): void {
    if (!this.startMenuActive) return;
    if (this.startIntroState !== "idle") return;
    if (!this.assetsLoaded) return;

    this.triggerHaptic("light");

    // Stop ring immediately when intro starts
    this.startMenuRingSpeed = 0;
    this.startMenuRingTargetSpeed = 0;
    this.startIntroState = "knives";
    this.startIntroIndex = 0;
    this.startIntroKnifeT = 0;
    this.startIntroHitHold = 0;
    this.startIntroHitsApplied = false;
    this.startIntroFinishTime = 0;

    // Knives launch from the middle
    const centerX = this.viewW * 0.5;
    const centerY = this.viewH * 0.52;
    this.startIntroKnifeFrom = { x: centerX, y: centerY };
  }

  private getStartMenuFruitPos(index: number, centerX: number, centerY: number): { x: number; y: number } {
    const ringR = Math.min(this.viewW, this.viewH) * 0.22;
    const f = this.startMenuFruits[index % Math.max(1, this.startMenuFruits.length)];
    const angleDeg = f.baseAngle + this.startMenuRingAngle;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: centerX + Math.cos(angleRad) * ringR,
      y: centerY + Math.sin(angleRad) * ringR,
    };
  }

  private loadLevel(levelIndex: number, changeBackground = true): void {
    if (levelIndex >= this.levels.length) {
      // Game complete!
      this.state = "GAME_OVER";
      return;
    }
    
    const level = this.levels[levelIndex];
    this.currentLevel = levelIndex;

    // Pick a random background only when advancing to a new round (not on retry)
    if (changeBackground) {
      const bgCount = 3;
      let nextBg = Math.floor(Math.random() * bgCount);
      if (nextBg === this.selectedBackground && bgCount > 1) {
        nextBg = (nextBg + 1) % bgCount;
      }
      this.selectedBackground = nextBg;
    }

    // Create fruit (cycle through available fruit images)
    const fruitImages = [
      this.avocadoImage,
      this.orangeImage,
      this.grapeImage,
      this.watermelonImage,
      this.kiwiImage,
      this.lemonImage,
    ].filter(img => img !== null); // Filter out any null images
    
    const fruitImageIndex = levelIndex % fruitImages.length;
    this.fruit = {
      radius: level.fruitRadius,
      rotationAngle: 0,
      colorIndex: levelIndex % CONFIG.FRUIT_COLORS.length,
      image: fruitImages[fruitImageIndex] || null,
      hitDistortion: 0,
    };
    
    // Create embedded knives - initially set as flying from sides
    // Use same logic as gameplay knife throw
    const w = this.viewW;
    const h = this.viewH;
    const fruitCenterX = w * CONFIG.FRUIT_CENTER_X;
    const fruitCenterY = h * CONFIG.FRUIT_CENTER_Y;
    
    // Calculate knife size (same as gameplay)
    let knifeWidth = 180;
    let knifeHeight = 180;
    if (this.knifeImage && this.assetsLoaded) {
      const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
      const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
      const aspectRatio = imageWidth / imageHeight;
      const fruitRadius = level.fruitRadius;
      const baseSize = fruitRadius * 0.6;
      
      if (aspectRatio > 1) {
        knifeWidth = baseSize;
        knifeHeight = baseSize / aspectRatio;
      } else {
        knifeHeight = baseSize;
        knifeWidth = baseSize * aspectRatio;
      }
    }
    
    this.knives = level.embeddedKnives.map((angle, index) => {
      const normalizedAngle = normalizeAngle(angle);
      
      return {
        angle: normalizedAngle,
        isFlying: false, // Not flying - spawn in place
        flyX: 0,
        flyY: 0,
        flyStartX: 0,
        flyStartY: 0,
        flyTime: 0,
        stickBounce: 0,
        throwScale: 0, // Start at 0 for zoom-in animation
        throwRotation: 0,
        isColliding: false,
        transitionKnifeWidth: knifeWidth,
        transitionKnifeHeight: knifeHeight,
      };
    });
    
    // Initialize coins
    this.coins = level.coins.map((angle) => {
      const normalizedAngle = normalizeAngle(angle);
      return {
        angle: normalizedAngle,
        collected: false,
        animating: false,
        animX: 0,
        animY: 0,
        animStartX: 0,
        animStartY: 0,
        animProgress: 0,
        spawnScale: 0, // Start at 0 for zoom-in animation
      };
    });
    
    this.knivesToThrow = level.knivesToThrow;
    this.rotationTime = 0;
    this.currentAngularVelocity = 0;
    this.targetAngularVelocity = 0;
    this.activePattern = level.rotationPatterns[0];
    this.patternTimer = 0;
    this.patternDuration = 3 + Math.random() * 4;
    
    this.roundTimer = 30;
    this.roundTimerActive = true;
    this.updateTimerDisplay();
    this.updateLevelDisplay();
    
    // Reset collision prediction and game over state
    this.collisionPredicted = false;
    this.collisionPoint = null;
    this.gameOverActive = false;
    this.gameOverTimeout = false;
    // Clear broken knife pieces
    this.brokenKnifePieces = [];
    // Reset background overlay
    this.backgroundOverlay.target = 0;
    this.backgroundOverlay.current = 0;
    
    // Start transition animation
    this.transitionActive = true;
    this.transitionTime = 0;
    this.transitionPhase = "bg_slide";
    this.bgSlideOffset = -h; // Start above screen
    this.fruitZoomScale = 0;
    this.fruitWiggleTime = 0;
    this.embeddedKnivesFlying = true;
    
    // Hide UI during transition
    this.hud.classList.add("hidden");
    this.settingsIconBtn.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.pauseBtn.classList.add("hidden");
    this.bottomHud.classList.add("hidden");
  }

  private nextLevel(): void {
    // Instantly reset camera zoom before transition
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraTargetX = 0;
    this.cameraTargetY = 0;
    this.slowMoActive = false;
    
    // Clear all splash effects instantly when transitioning to next level
    // Release particles back to pool before clearing
    for (const particle of this.particles) {
      this.particlePool.push(particle);
    }
    this.particles = [];
    
    if (this.currentLevel < this.levels.length - 1) {
      this.currentLevel++;
      if (this.currentLevel > this.highestUnlockedLevel) {
        this.highestUnlockedLevel = this.currentLevel;
        this.saveHighestLevel();
      }
      this.loadLevel(this.currentLevel);
      this.state = "PLAYING";
      this.winScreen.classList.add("hidden");
      
      // Resume spin sound for next level (will start when transition completes)
    } else {
      // Game complete
      this.state = "GAME_OVER";
      this.saveGameStateAll(true);
      this.gameOverScreen.classList.remove("hidden");
    }
  }

  private restart(): void {
    // Instantly reset camera zoom before transition
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraTargetX = 0;
    this.cameraTargetY = 0;
    this.slowMoActive = false;
    
    // Clear all splash effects instantly when restarting
    // Release particles back to pool before clearing
    for (const particle of this.particles) {
      this.particlePool.push(particle);
    }
    this.particles = [];
    
    this.loadLevel(this.currentLevel, false); // retry — keep same background
    this.state = "PLAYING";
    this.gameOverScreen.classList.add("hidden");
    this.winScreen.classList.add("hidden");
    this.startScreen.classList.add("hidden");
    // Reset game over state
    this.gameOverActive = false;
    this.gameOverTimeout = false;
    this.collisionPredicted = false;
    this.collisionPoint = null;
    
    // Resume spin sound on restart (will start when transition completes)
    // Clear broken knife pieces and screen flash
    this.brokenKnifePieces = [];
    this.screenFlash.active = false;
    // Reset background overlay
    this.backgroundOverlay.target = 0;
    this.backgroundOverlay.current = 0;
    // Reset background overlay
    this.backgroundOverlay.target = 0;
    this.backgroundOverlay.current = 0;

    // Sync HUD / shop
    this.updateLevelDisplay();
    this.refreshWeaponShopUI();
  }

  private pause(): void {
    if (this.state === "PLAYING") {
      this.flushCoinSave();
      this.state = "PAUSED";
      this.pauseBtn.classList.add("hidden");
      if (
        !this.settingsModal.classList.contains("visible") &&
        !this.weaponModal.classList.contains("visible")
      ) {
        this.pauseScreen.classList.remove("hidden");
      }
    }
  }

  private resume(): void {
    if (this.state === "PAUSED") {
      this.state = "PLAYING";
      this.pauseScreen.classList.add("hidden");
      this.pauseBtn.classList.remove("hidden");
    }
  }

  private showMenu(): void {
    // Return to the in-canvas start menu (do not show legacy overlay)
    this.enterStartMenu();
  }

  private showSettings(): void {
    // Force reflow to ensure initial state is applied
    this.settingsModal.offsetHeight;
    this.settingsModal.classList.add("visible");
    // Hide pause screen if it's showing
    this.pauseScreen.classList.add("hidden");
    if (this.state === "PLAYING") {
      this.pause();
    }
  }

  private hideSettings(): void {
    this.settingsModal.classList.remove("visible");
    // Wait for animation to complete before resuming (if needed)
    setTimeout(() => {
      if (this.state === "PAUSED") {
        this.resume();
      }
    }, 300); // Match CSS transition duration
  }
  
  private showWeaponModal(): void {
    this.weaponModal.offsetHeight; // Force reflow
    this.weaponModal.classList.add("visible");
    this.refreshWeaponShopUI();
    // Hide pause screen if it's showing
    this.pauseScreen.classList.add("hidden");
    if (this.state === "PLAYING") {
      this.pause();
    }
  }
  
  private hideWeaponModal(): void {
    this.weaponModal.classList.remove("visible");
    this.pauseScreen.classList.add("hidden");
    setTimeout(() => {
      if (this.state === "PAUSED") {
        this.resume();
      }
    }, 300);
  }
  
  private equipWeapon(weapon: WeaponType): void {
    this.currentWeapon = weapon;
    this.updateWeaponImage();
    this.saveWeapon();
    this.refreshWeaponShopUI();
    this.updateKnivesRemaining();
    this.hideWeaponModal();
  }

  private handleWeaponOptionClick(weapon: WeaponType): void {
    if (weapon === "knife") {
      this.equipWeapon("knife");
      return;
    }

    if (this.weaponUnlocks[weapon]) {
      this.equipWeapon(weapon);
      return;
    }

    // Attempt purchase
    const price = this.getWeaponPrice(weapon);
    if (!this.canAfford(price)) {
      this.triggerHaptic("error");
      return;
    }

    if (this.trySpendCoins(price)) {
      this.weaponUnlocks[weapon] = true;
      this.saveProgression();
      this.triggerHaptic("success");
      this.equipWeapon(weapon);
    }
  }

  private updateLevelDisplay(): void {
    this.levelDisplay.textContent = `Level ${this.currentLevel + 1}/${CONFIG.TOTAL_LEVELS}`;
    this.coinDisplay.textContent = this.coinBank.toString();
  }

  private updateTimerDisplay(): void {
    const secs = Math.max(0, Math.ceil(this.roundTimer));
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    this.timerDisplay.textContent = `${mins}:${String(remainder).padStart(2, "0")}`;

    if (this.roundTimer <= 5 && this.roundTimerActive) {
      this.timerDisplay.classList.add("urgent");
    } else {
      this.timerDisplay.classList.remove("urgent");
    }
  }

  private updateKnivesRemaining(): void {
    // Update bottom HUD (preview knife with count)
    // Show preview if we have knives to throw OR if there's a knife currently flying (so we see the preview before it disappears)
    const hasKnivesToShow = this.knivesToThrow > 0 || this.knives.some(k => k.isFlying);
    if ((this.state === "PLAYING" || this.state === "PAUSED") && hasKnivesToShow) {
      this.bottomHud.classList.remove("hidden");
      
      // Update knife preview image - only recalculate size when weapon changes (cache layout reads)
      if (this.knifeImage && this.assetsLoaded) {
        if (this.cachedKnifePreviewWeapon !== this.currentWeapon) {
          // Only read layout values when weapon changes, not on every throw
          const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
          const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
          const aspectRatio = imageWidth / imageHeight;

          const containerHeight = this.viewH || window.innerHeight;
          const availableHeight = containerHeight * 0.25;
          const maxKnifeHeight = availableHeight * 0.42;
          const maxKnifeWidth = (this.viewW || window.innerWidth) * 0.18;

          let width: number;
          let height: number;

          if (aspectRatio > 1) {
            // Wide weapon (knife, kunai) shown vertically — size as if horizontal then rotate -90
            // so visual height = original image width direction, visual width = image height direction
            width = Math.min(maxKnifeWidth, maxKnifeHeight * aspectRatio);
            height = width / aspectRatio;
          } else {
            height = Math.min(maxKnifeHeight, maxKnifeWidth / aspectRatio);
            width = height * aspectRatio;
          }

          this.cachedKnifePreviewWidth = width;
          this.cachedKnifePreviewHeight = height;
          this.cachedKnifePreviewWeapon = this.currentWeapon;

          this.knifePreviewImage.src = this.knifeImage.src;
          this.knifePreviewImage.style.width = `${width}px`;
          this.knifePreviewImage.style.height = `${height}px`;
          // Wide weapons: -90° makes the tip point upward (vertical)
          // Narrow weapons (pen/pencil): already naturally vertical, no rotation needed
          const rotationDeg = aspectRatio > 1 ? -90 : 0;
          this.knifePreviewImage.style.transform = `rotate(${rotationDeg}deg)`;
        }
        this.knifePreviewImage.style.display = "block";
      } else {
        this.knifePreviewImage.style.display = "none";
      }
      
      // Update count text above knife (show 0 if no knives left but knife is flying)
      const displayCount = this.knivesToThrow > 0 ? this.knivesToThrow : 0;
      this.knivesCount.textContent = displayCount.toString();
      
      // Update knife icons below knife preview (use actual weapon image)
      if (this.knifeImage && this.assetsLoaded) {
        const alt = this.currentWeapon.charAt(0).toUpperCase() + this.currentWeapon.slice(1) + " icon";

        // Update src if weapon changed
        if (this.lastKnifeIconsWeapon !== this.currentWeapon) {
          for (const el of this.knifeIconEls) {
            el.src = this.knifeImage.src;
            el.alt = alt;
          }
          this.lastKnifeIconsWeapon = this.currentWeapon;
        }

        // Update visibility only if count changed
        if (this.lastKnifeIconsCount !== this.knivesToThrow) {
          for (let i = 0; i < this.knifeIconEls.length; i++) {
            const el = this.knifeIconEls[i];
            const shouldShow = i < this.knivesToThrow;
            if (shouldShow) {
              if (el.style.display === "none") {
                // Show icon: use class-swap animation instead of forced reflow
                // Remove animate class, then re-add on next frame to trigger animation
                el.classList.remove("animate");
                el.style.display = "block";
                // Schedule animation class add on next frame - avoids layout reflow in game loop
                requestAnimationFrame(() => { el.classList.add("animate"); });
              }
            } else {
              el.style.display = "none";
              el.classList.remove("animate");
            }
          }
          this.lastKnifeIconsCount = this.knivesToThrow;
        }
      } else {
        // Hide all if assets not ready
        for (const el of this.knifeIconEls) {
          el.style.display = "none";
          el.classList.remove("animate");
        }
        this.lastKnifeIconsCount = -1;
        this.lastKnifeIconsWeapon = null;
      }
    } else {
      this.bottomHud.classList.add("hidden");
    }
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (this.settings.haptics) {
      oasiz.triggerHaptic(type);
    }
  }

  private playUiTap(): void {
    if (!this.settings.fx) return;
    this.playBuffer(this.sfxBufUiTap);
  }

  private playUiConfirm(): void {
    if (!this.settings.fx) return;
    this.playBuffer(this.sfxBufUiConfirm);
  }

  private update(dt: number): void {
    // Update transition if active
    if (this.transitionActive) {
      this.updateTransition(dt);
      // Don't update game logic during transition
      return;
    }
    
    // Start menu animation
    if (this.state === "START") {
      this.updateStartMenu(dt);
      return;
    }

    if (this.state === "LEVEL_SELECT") {
      this.levelSelectTime += dt;
      return;
    }

    if (this.state !== "PLAYING" && this.state !== "WIN" && this.state !== "GAME_OVER") return;
    
    // Round timer countdown (paused during transitions)
    if (this.roundTimerActive && this.state === "PLAYING" && !this.transitionActive) {
      this.roundTimer -= dt;
      this.updateTimerDisplay();
      if (this.roundTimer <= 0) {
        this.roundTimer = 0;
        this.roundTimerActive = false;
        this.updateTimerDisplay();
        this.flushCoinSave();
        this.saveGameStateAll(true);
        this.gameOverActive = true;
        this.gameOverTimeout = true;
        this.state = "GAME_OVER";
        this.pauseBtn.classList.add("hidden");
        this.backgroundOverlay.target = -0.5;
        this.triggerHaptic("error");
        if (this.settings.fx) this.playBuffer(this.sfxBufTimeout);
        requestAnimationFrame(() => {
          this.updateLevelDisplay();
          this.refreshWeaponShopUI();
        });
        return;
      }
    }
    
    // Apply slow motion time scale
    let actualDt = dt;
    if (this.slowMoActive) {
      actualDt = dt * 0.2; // 5x slower
      this.slowMoTime += dt;
      // Don't auto-end slow motion during game over - let it stay zoomed
      if (!this.gameOverActive && this.slowMoTime >= this.slowMoDuration) {
        this.slowMoActive = false;
        // Start zooming back out smoothly
        this.cameraTargetZoom = 1.0;
        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
      }
    } else {
      // If slow motion ended, ensure we're zooming back out
      if (this.cameraZoom > 1.0 && !this.gameOverActive) {
        this.cameraTargetZoom = 1.0;
        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
      }
    }
    
    // Smooth camera zoom and position (faster when zooming out)
    const zoomSpeed = this.cameraTargetZoom < this.cameraZoom ? 5 : 3; // Faster zoom out
    this.cameraZoom += (this.cameraTargetZoom - this.cameraZoom) * dt * zoomSpeed;
    this.cameraX += (this.cameraTargetX - this.cameraX) * dt * 5;
    this.cameraY += (this.cameraTargetY - this.cameraY) * dt * 5;
    
    const level = this.levels[this.currentLevel];
    
    // Only update rotation if not in transition
    if (!this.transitionActive) {
      this.rotationTime += actualDt;
      this.patternTimer += actualDt;
      
      // Switch to a random pattern when the current one expires
      if (this.patternTimer >= this.patternDuration && level.rotationPatterns.length > 1) {
        const available = level.rotationPatterns.filter(p => p !== this.activePattern);
        this.activePattern = available[Math.floor(Math.random() * available.length)];
        this.patternTimer = 0;
        this.patternDuration = 3 + Math.random() * 4; // 3-7 seconds per pattern
      }
      
      // Calculate target angular velocity from active pattern
      const pattern = ROTATION_PATTERNS[this.activePattern];
      this.targetAngularVelocity = pattern(
        this.rotationTime,
        level.rotationSpeed,
        level.rotationDirection
      );
      
      // Apply acceleration limit for smooth transitions
      this.currentAngularVelocity = applyAccelerationLimit(
        this.currentAngularVelocity,
        this.targetAngularVelocity,
        dt,
        180 // Snappier transitions between patterns
      );
      
      // Update fruit rotation (keep spinning even during celebration)
      if (this.fruit) {
        this.fruit.rotationAngle = normalizeAngle(
          this.fruit.rotationAngle + this.currentAngularVelocity * actualDt
        );
      }
    }
    
    // Update celebration
    if (this.celebrationActive) {
      this.celebrationTime += dt;
      
      // Animate encouragement text sliding in
      if (this.encouragementX < 50) {
        this.encouragementX += (50 - this.encouragementX) * dt * 5;
      }
      
      // Flicker tap to continue
      this.tapToContinueFlicker += dt * 3;
      this.tapToContinueOpacity = 0.5 + Math.sin(this.tapToContinueFlicker) * 0.5;
    }
    
    // Update background overlay (smoothly transition to target)
    this.backgroundOverlay.current += (this.backgroundOverlay.target - this.backgroundOverlay.current) * dt * this.backgroundOverlay.speed;
    
    // Update game over
    if (this.gameOverActive) {
      // Flicker tap to retry
      this.tapToRetryFlicker += dt * 3;
      this.tapToRetryOpacity = 0.5 + Math.sin(this.tapToRetryFlicker) * 0.5;
    }
    
    // Update flying knives
    // Use real dt for knife movement so collision happens at the right time
    // Slow motion effect comes from camera zoom, not from slowing down the knife
    for (const knife of this.knives) {
      if (knife.isFlying) {
        knife.flyTime += dt; // Use real dt - slow motion is visual only (camera zoom)
        
        // Calculate trajectory from start position to fruit center
        const fruitCenterX = this.viewW * CONFIG.FRUIT_CENTER_X;
        const fruitCenterY = this.viewH * CONFIG.FRUIT_CENTER_Y;
        const dx = fruitCenterX - knife.flyStartX;
        const dy = fruitCenterY - knife.flyStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Update knife position along trajectory
        const progress = Math.min(1, knife.flyTime * CONFIG.KNIFE_THROW_SPEED / distance);
        knife.flyX = knife.flyStartX + dx * progress;
        knife.flyY = knife.flyStartY + dy * progress;
        
        // No throw animation effects (removed scale and wobble)
        knife.throwScale = 1.0;

        // Smoothly rotate from a flat start orientation to pointing toward the fruit
        const rotationProgress = Math.min(1, progress * 1.2);
        const easedT = 1 - Math.pow(1 - rotationProgress, 3);
        const startRot = knife.flyStartRot ?? -Math.PI / 2;
        const endRot = knife.flyEndRot ?? Math.atan2(dy, dx);
        let diff = endRot - startRot;
        // shortest path wrap
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        knife.throwRotation = startRot + diff * easedT;
        
        // Predictive collision detection - check if collision will happen soon
        const currentDx = fruitCenterX - knife.flyX;
        const currentDy = fruitCenterY - knife.flyY;
        const distanceToCenter = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
        
        // Predict collision a few frames ahead
        if (this.fruit && !this.collisionPredicted && distanceToCenter > this.fruit.radius) {
          const predictionTime = 0.05; // 50ms ahead
          const futureProgress = Math.min(1, (knife.flyTime + predictionTime) * CONFIG.KNIFE_THROW_SPEED / distance);
          const futureX = knife.flyStartX + dx * futureProgress;
          const futureY = knife.flyStartY + dy * futureProgress;
          const futureDx = fruitCenterX - futureX;
          const futureDy = fruitCenterY - futureY;
          const futureDistanceToCenter = Math.sqrt(futureDx * futureDx + futureDy * futureDy);
          
          // Check for predicted collision
          if (futureDistanceToCenter <= this.fruit.radius) {
            // Calculate future angle
            const futureVx = futureX - fruitCenterX;
            const futureVy = futureY - fruitCenterY;
            const futureLen = Math.max(0.00001, Math.hypot(futureVx, futureVy));
            const futureUx = futureVx / futureLen;
            const futureUy = futureVy / futureLen;
            const futureAngleWorld = normalizeAngle(Math.atan2(futureUy, futureUx) * (180 / Math.PI) + 90);
            const futureRelativeAngle = normalizeAngle(futureAngleWorld - this.fruit.rotationAngle);
            
            const collisionThreshold = (CONFIG.KNIFE_WIDTH * CONFIG.COLLISION_THRESHOLD_MULTIPLIER);
            
            // Check if future position will collide
            for (let i = 0; i < this.knives.length; i++) {
              const embeddedKnife = this.knives[i];
              if (embeddedKnife.isFlying) continue;
              const diff = angleDifference(futureRelativeAngle, embeddedKnife.angle);
              if (diff < collisionThreshold) {
                // Collision predicted! Trigger slow motion
                this.collisionPredicted = true;
                this.collisionKnifeIndex = this.knives.indexOf(knife);
                this.collisionEmbeddedKnifeIndex = i;
                
                // Trigger slow motion and zoom to collision point
                this.slowMoActive = true;
                this.slowMoTime = 0;
                this.cameraTargetZoom = 2.0;
                this.cameraTargetX = 0;
                this.cameraTargetY = 0;
                
                break;
              }
            }
          }
        }
        
        // Check if knife reached the fruit using circular collider
        if (this.fruit && distanceToCenter <= this.fruit.radius) {
          // Vector from fruit center -> knife (outward direction)
          const vx = knife.flyX - fruitCenterX;
          const vy = knife.flyY - fruitCenterY;
          
          // Project to exact circumference to remove dt/jitter variation
          const len = Math.max(0.00001, Math.hypot(vx, vy));
          const ux = vx / len;
          const uy = vy / len;
          
          // Calculate exact impact point on fruit circumference
          const impactX = fruitCenterX + ux * this.fruit.radius;
          const impactY = fruitCenterY + uy * this.fruit.radius;
          
          // Project knife to exact circumference
          knife.flyX = impactX;
          knife.flyY = impactY;
          
          // Angle convention: 0°=top, 90°=right, 180°=bottom, 270°=left
          const angleWorld = normalizeAngle(Math.atan2(uy, ux) * (180 / Math.PI) + 90);
          
          // Store knife angle relative to fruit (so it rotates with fruit consistently)
          const relativeAngle = normalizeAngle(angleWorld - this.fruit.rotationAngle);
          
          // Check for coin collision first (before knife collision)
          const coinCollisionThreshold = 15; // Degrees
          for (let i = 0; i < this.coins.length; i++) {
            const coin = this.coins[i];
            if (coin.collected || coin.animating) continue;
            const diff = angleDifference(relativeAngle, coin.angle);
            if (diff < coinCollisionThreshold) {
              // Collect coin
              coin.collected = true;
              coin.animating = true;
              coin.animX = impactX;
              coin.animY = impactY;
              coin.animStartX = impactX;
              coin.animStartY = impactY;
              coin.animProgress = 0;
              
              // Add to persistent coin bank
              this.addCoins(1);
              
              // Trigger haptic feedback
              if (this.settings.haptics) {
                this.triggerHaptic("light");
              }
              
              
              // Don't check for knife collision if coin was hit
              break;
            }
          }
          
          // Collision threshold
          const collisionThreshold = (CONFIG.KNIFE_WIDTH * CONFIG.COLLISION_THRESHOLD_MULTIPLIER);
          
          let collision = false;
          let collidingEmbeddedIndex = -1;
          for (let i = 0; i < this.knives.length; i++) {
            const embeddedKnife = this.knives[i];
            if (embeddedKnife.isFlying) continue;
            const diff = angleDifference(relativeAngle, embeddedKnife.angle);
            if (diff < collisionThreshold) {
              collision = true;
              collidingEmbeddedIndex = i;
              break;
            }
          }
          
          if (collision) {
            // Knife breaks into pieces and falls
            
            // Get exact position of the knife when it breaks
            const knifeX = knife.flyX;
            const knifeY = knife.flyY;
            
            // Play broke sound — pen/pencil use the pencil_break sound, others use the metal broke sound
            if (this.settings.fx) {
              const isPenLike = this.currentWeapon === "pen" || this.currentWeapon === "pencil";
              if (isPenLike) {
                this.playBuffer(this.sfxBufPencilBreak);
              } else {
                this.playBuffer(this.sfxBufBroke);
                setTimeout(() => { if (this.settings.fx) this.playBuffer(this.sfxBufDull); }, 50);
              }
            }
            
            // Trigger screen flash
            this.screenFlash.active = true;
            this.screenFlash.time = 0;
            
            // Create broken knife pieces at exact knife position (using native sprite resolution)
            this.createBrokenKnifePieces(knifeX, knifeY, knife.throwRotation);
            
            // Remove the broken knife from the array immediately - it should not spawn on the fruit
            // Find and remove the knife from the array
            const knifeIndex = this.knives.indexOf(knife);
            if (knifeIndex !== -1) {
              this.knives.splice(knifeIndex, 1);
            }
            
            // Trigger slow motion if not already active
            if (!this.slowMoActive) {
              this.slowMoActive = true;
              this.slowMoTime = 0;
              this.cameraTargetZoom = 2.0;
              this.cameraTargetX = 0;
              this.cameraTargetY = 0;
            }
            
            this.flushCoinSave();
            this.saveGameStateAll(true);
            this.gameOverActive = true;
            this.state = "GAME_OVER";
            this.roundTimerActive = false;
            this.pauseBtn.classList.add("hidden");
            // Darken background smoothly
            this.backgroundOverlay.target = -0.5; // Darken to 50%
            this.triggerHaptic("error");
            
            // Defer non-critical DOM updates to avoid blocking the impact frame
            requestAnimationFrame(() => {
              this.updateLevelDisplay();
              this.refreshWeaponShopUI();
            });
            
            // Break out of the loop since the knife is removed and game is over
            break;
          } else {
            // Knife sticks - store angle and stop flying
            knife.angle = relativeAngle;
            knife.isFlying = false;
            knife.stickBounce = 1;
            
            if (this.settings.fx) this.playBuffer(this.sfxBufStab);

            // Fruit distortion effect
            if (this.fruit) {
              this.fruit.hitDistortion = 1.0; // Start at full distortion
            }
            
            // Enhanced explosion effects
            const isLastKnife = this.knivesToThrow === 0;
            
            // Calculate knife tip position for particle effects
            const knifeTipOffset = this.fruit.radius * 0.35;
            const knifeTipX = impactX + ux * knifeTipOffset;
            const knifeTipY = impactY + uy * knifeTipOffset;
            
            // Offset particles to spawn closer to the impact point (adjust these values to fine-tune)
            // Positive offsetX/Y moves particles in the direction of the knife (towards fruit center)
            // Negative offsetX/Y moves particles away from fruit center
            // Change 0.1 to adjust offset: 0.0 = no offset, 0.1 = 10% of radius, -0.1 = opposite direction
            const particleOffsetX = ux * (this.fruit.radius * -1); // Adjust multiplier to fine-tune
            const particleOffsetY = uy * (this.fruit.radius * -1); // Adjust multiplier to fine-tune
            
            if (isLastKnife) {
              // Bigger explosion for last knife at knife tip
              this.createBigExplosion(knifeTipX, knifeTipY, particleOffsetX, particleOffsetY);
              this.screenShake.time = 0.5; // Longer shake
              this.screenShake.x = (Math.random() - 0.5) * 30;
              this.screenShake.y = (Math.random() - 0.5) * 30;
              
              // Start celebration immediately (slow motion will end naturally)
              this.startCelebration();
            } else {
              // Normal splash for regular knives at knife tip
              this.createSplashEffect(knifeTipX, knifeTipY, particleOffsetX, particleOffsetY);
              this.createDropParticles(knifeTipX, knifeTipY, particleOffsetX, particleOffsetY);
              this.screenShake.time = 0.2;
              this.screenShake.x = (Math.random() - 0.5) * 10;
              this.screenShake.y = (Math.random() - 0.5) * 10;
            }
            
            // Update preview if more knives - defer to next frame to avoid DOM work during impact
            if (this.knivesToThrow > 0) {
              requestAnimationFrame(() => { this.updateKnivesRemaining(); });
            }
            
            this.triggerHaptic("medium");
            
            // Check win - no modal, just keep playing
            if (this.knivesToThrow === 0 && !this.knives.some(k => k.isFlying)) {
              this.state = "WIN";
              this.roundTimerActive = false;
              // Brighten background smoothly
              this.backgroundOverlay.target = 0.3;
              this.triggerHaptic("success");
              
              // Play success sound when clearing level
              if (this.settings.fx) this.playBuffer(this.sfxBufSuccess);
              
              // Unlock the next level immediately on win (not deferred to Next tap)
              // so that exiting the game on the win screen still saves progress
              const nextLevelIndex = this.currentLevel + 1;
              if (nextLevelIndex > this.highestUnlockedLevel) {
                this.highestUnlockedLevel = nextLevelIndex;
                this.saveHighestLevel(); // flushes immediately
              }
              if (this.currentLevel >= this.highestUnlockedLevel - 1) {
                oasiz.submitScore(this.currentLevel + 1);
              }
            }
          }
        }
      } else if (knife.stickBounce > 0) {
        // Animate stick bounce
        knife.stickBounce = Math.max(0, knife.stickBounce - dt * 5);
      }
    }
    
    // Update fruit distortion
    if (this.fruit && this.fruit.hitDistortion > 0) {
      this.fruit.hitDistortion = Math.max(0, this.fruit.hitDistortion - actualDt * 3);
    }
    
    // Update particles
    this.updateParticles(actualDt);
    this.updateBrokenKnifePieces(actualDt);
    
    // Update coin animations
    this.updateCoinAnimations(dt);
    
    // Update screen shake
    if (this.screenShake.time > 0) {
      this.screenShake.time = Math.max(0, this.screenShake.time - dt);
      if (this.screenShake.time > 0) {
        // Decay shake
        const intensity = this.screenShake.time / 0.2;
        this.screenShake.x = (Math.random() - 0.5) * 10 * intensity;
        this.screenShake.y = (Math.random() - 0.5) * 10 * intensity;
      } else {
        this.screenShake.x = 0;
        this.screenShake.y = 0;
      }
    }
    
    // Update screen flash
    if (this.screenFlash.active) {
      this.screenFlash.time += dt;
      if (this.screenFlash.time >= this.screenFlash.duration) {
        this.screenFlash.active = false;
        this.screenFlash.time = 0;
      }
    }
    
    // Update debug info
    if (this.debugMode) {
      this.updateDebugInfo(level);
    }
  }

  private updateStartMenu(dt: number): void {
    this.startMenuTime += dt;

    // Smooth ring speed to target
    this.startMenuRingSpeed += (this.startMenuRingTargetSpeed - this.startMenuRingSpeed) * dt * 3;
    this.startMenuRingAngle = normalizeAngle(this.startMenuRingAngle + this.startMenuRingSpeed * dt);

    // Decay per-fruit hit distortion
    for (const f of this.startMenuFruits) {
      if (f.hitDistortion > 0) f.hitDistortion = Math.max(0, f.hitDistortion - dt * 3);
    }

    if (this.startIntroState === "knives") {
      const centerX = this.viewW * 0.5;
      const centerY = this.viewH * 0.52;

      if (this.startIntroHitHold > 0) {
        this.startIntroHitHold = Math.max(0, this.startIntroHitHold - dt);
        if (this.startIntroHitHold === 0) {
          // Wait for VFX to finish before transitioning
        }
      } else {
        // Knives flight (all at once)
        const duration = 0.22;
        this.startIntroKnifeT += dt / duration;

        if (this.startIntroKnifeT >= 1) {
          this.startIntroKnifeT = 1;

          if (!this.startIntroHitsApplied) {
            this.startIntroHitsApplied = true;
            this.startIntroFinishTime = 0;

            // Impact: wiggle fruits + spawn juice VFX on each fruit
            for (let i = 0; i < this.startMenuFruits.length; i++) {
              const f = this.startMenuFruits[i];
              f.hitDistortion = 1.0;

              const pos = this.getStartMenuFruitPos(i, centerX, centerY);
              const color = this.getJuiceColorForImage(f.image);
              this.createSplashEffect(pos.x, pos.y, 0, 0, color);
              this.createDropParticles(pos.x, pos.y, 0, 0, color);
            }

            // Tiny flash and sound/haptic (once)
            this.screenFlash.active = true;
            this.screenFlash.time = 0;
            this.screenFlash.duration = 0.08;

            if (this.settings.fx) this.playBuffer(this.sfxBufStab);
            this.triggerHaptic("medium");

            // Hold briefly so the player sees the splashes + wiggle before we start checking completion
            this.startIntroHitHold = 0.18;
          }
        }
      }

      // After impacts are applied, wait until particles finish (or a max timeout)
      if (this.startIntroHitsApplied) {
        this.startIntroFinishTime += dt;
        const particlesDone = this.particles.length === 0;
        const ready = particlesDone && this.startIntroFinishTime >= 0.25;
        const safety = this.startIntroFinishTime >= 1.6;

        if (ready || safety) {
          this.startMenuActive = false;
          this.startIntroState = "done";
          this.shopBtnRect = null;
          this.enterLevelSelect();
          return;
        }
      }
    }

    // Update VFX particles during start menu too
    this.updateParticles(dt);

    // Update screen flash timer during start menu too
    if (this.screenFlash.active) {
      this.screenFlash.time += dt;
      if (this.screenFlash.time >= this.screenFlash.duration) {
        this.screenFlash.active = false;
        this.screenFlash.time = 0;
      }
    }
  }
  
  private createSplashEffect(
    x: number,
    y: number,
    offsetX: number = 0,
    offsetY: number = 0,
    colorOverride?: string
  ): void {
    // Create juice splash particles that burst outward
    const particleCount = 20; // More particles for juicier effect
    const fruitColor = colorOverride || this.getFruitJuiceColor(); // Get color based on current fruit
    // Apply offset to spawn position
    const spawnX = x + offsetX;
    const spawnY = y + offsetY;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 100 + Math.random() * 60; // Faster for more impact
      const maxLife = 0.5 + Math.random() * 0.4;
      const particle = (this.particlePool.pop() || ({} as Particle)) as Particle;
      particle.x = spawnX;
      particle.y = spawnY;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.life = maxLife;
      particle.maxLife = maxLife;
      particle.size = 4 + Math.random() * 5;
      particle.color = fruitColor;
      particle.type = "splash";
      this.particles.push(particle);
    }
  }
  
  private createBigExplosion(
    x: number,
    y: number,
    offsetX: number = 0,
    offsetY: number = 0,
    colorOverride?: string
  ): void {
    // Create massive juice explosion with many particles
    const particleCount = 50; // More particles for bigger explosion
    const fruitColor = colorOverride || this.getFruitJuiceColor(); // Get color based on current fruit
    // Apply offset to spawn position
    const spawnX = x + offsetX;
    const spawnY = y + offsetY;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 180 + Math.random() * 120; // Faster for more impact
      const maxLife = 0.7 + Math.random() * 0.5;
      const particle = (this.particlePool.pop() || ({} as Particle)) as Particle;
      particle.x = spawnX;
      particle.y = spawnY;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.life = maxLife;
      particle.maxLife = maxLife;
      particle.size = 5 + Math.random() * 7;
      particle.color = fruitColor;
      particle.type = "splash";
      this.particles.push(particle);
    }
    
    // Also create juice drop particles
    for (let i = 0; i < 10; i++) { // Reduced from 20 to 10
      const maxLife = 1.2 + Math.random() * 0.6;
      const particle = (this.particlePool.pop() || ({} as Particle)) as Particle;
      particle.x = spawnX;
      particle.y = spawnY;
      particle.vx = (Math.random() - 0.5) * 60;
      particle.vy = 100 + Math.random() * 100;
      particle.life = maxLife;
      particle.maxLife = maxLife;
      particle.size = 4 + Math.random() * 5;
      particle.color = fruitColor;
      particle.type = "drop";
      this.particles.push(particle);
    }
  }
  
  private updateTransition(dt: number): void {
    this.transitionTime += dt;
    const w = this.viewW;
    const h = this.viewH;
    const fruitCenterX = w * CONFIG.FRUIT_CENTER_X;
    const fruitCenterY = h * CONFIG.FRUIT_CENTER_Y;
    
    if (this.transitionPhase === "bg_slide") {
      // Background slides down from top (0.5 seconds)
      const slideDuration = 0.5;
      const progress = Math.min(1, this.transitionTime / slideDuration);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      this.bgSlideOffset = -h + (h * eased);
      
      // Play transition sound at the start
      if (this.transitionTime === 0 || this.transitionTime < dt) {
        if (this.settings.fx) this.playBuffer(this.sfxBufTransition);
      }
      
      if (progress >= 1) {
        this.bgSlideOffset = 0;
        this.transitionPhase = "fruit_zoom";
        this.transitionTime = 0;
      }
    } else if (this.transitionPhase === "fruit_zoom") {
      // Fruit zooms in (0.4 seconds)
      const zoomDuration = 0.4;
      const progress = Math.min(1, this.transitionTime / zoomDuration);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      this.fruitZoomScale = eased;
      
      // Play spawn sound when fruit starts zooming
      if (this.transitionTime === 0 || this.transitionTime < dt) {
        if (this.settings.fx) this.playBuffer(this.sfxBufSpawn);
      }
      
      if (progress >= 1) {
        // Zoom complete - keep at scale 1
        this.fruitZoomScale = 1;
        // Start wiggle animation (0.3 seconds)
        this.fruitWiggleTime += dt;
        
        // After wiggle completes (0.3 seconds), transition to knives zoom
        if (this.fruitWiggleTime >= 0.3) {
          this.transitionPhase = "knives_fly";
          this.transitionTime = 0;
          // Ensure fruit stays at scale 1
          this.fruitZoomScale = 1;
        }
      }
    } else if (this.transitionPhase === "knives_fly") {
      // Zoom in knives (same animation as fruit) - only starts after fruit wiggle completes
      const zoomDuration = 0.4;
      const progress = Math.min(1, this.transitionTime / zoomDuration);
      // Ease out (same as fruit)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Play spawn sound when knives start zooming
      if (this.transitionTime === 0 || this.transitionTime < dt) {
        if (this.settings.fx) this.playBuffer(this.sfxBufSpawn);
      }
      
      // Apply zoom scale to all embedded knives
      for (const knife of this.knives) {
        knife.throwScale = eased;
      }
      
      // Apply zoom scale to all coins
      for (const coin of this.coins) {
        coin.spawnScale = eased;
      }
      
      if (progress >= 1) {
        // All knives zoomed in, complete transition
        for (const knife of this.knives) {
          knife.throwScale = 1.0; // Ensure they're at full scale
        }
        // All coins zoomed in
        for (const coin of this.coins) {
          coin.spawnScale = 1.0; // Ensure they're at full scale
        }
        this.transitionPhase = "complete";
        this.transitionActive = false;
        this.embeddedKnivesFlying = false;
        this.fruitWiggleTime = 0;
        
        // Show UI and start rotation (animate UI spawn after knives count is ready)
        this.updateKnivesRemaining();
        this.showGameplayUI(true);
        
        // Start fruit rotation
        const level = this.levels[this.currentLevel];
        this.targetAngularVelocity = level.rotationSpeed * level.rotationDirection;
      }
    }
  }

  private showGameplayUI(animate: boolean): void {
    // Show top HUD (weapon/coins/level + settings icon)
    this.hud.classList.remove("hidden");
    this.settingsIconBtn.classList.remove("hidden");
    this.settingsBtn.classList.remove("hidden");
    this.pauseBtn.classList.remove("hidden");

    this.coinDisplayRectDirty = true;

    // Bottom HUD is shown via updateKnivesRemaining()

    if (animate) {
      const els: HTMLElement[] = [this.hud, this.settingsIconBtn, this.settingsBtn];
      for (const el of els) this.animateUIIn(el);
      // bottomHud may be shown by updateKnivesRemaining; animate if present
      if (!this.bottomHud.classList.contains("hidden")) this.animateUIIn(this.bottomHud);
    }
  }

  private animateUIIn(el: HTMLElement): void {
    // Restart animation
    el.classList.remove("ui-spawn");
    // Force reflow
    void el.offsetHeight;
    el.classList.add("ui-spawn");
    // Clean up class after animation
    window.setTimeout(() => el.classList.remove("ui-spawn"), 450);
  }
  
  private startCelebration(): void {
    this.flushCoinSave();
    this.pauseBtn.classList.add("hidden");
    this.celebrationActive = true;
    this.celebrationTime = 0;
    this.encouragementX = -500;
    
    // Random encouraging messages (no emojis)
    const messages = [
      "EXCELLENT!",
      "AMAZING!",
      "PERFECT!",
      "INCREDIBLE!",
      "OUTSTANDING!",
      "FANTASTIC!",
      "BRILLIANT!",
      "LEGENDARY!",
    ];
    this.encouragementText = messages[Math.floor(Math.random() * messages.length)];
  }
  
  private createDropParticles(
    x: number,
    y: number,
    offsetX: number = 0,
    offsetY: number = 0,
    colorOverride?: string
  ): void {
    // Create juice drops that fall down
    const particleCount = 6; // Reduced from 12 to 6
    const fruitColor = colorOverride || this.getFruitJuiceColor(); // Get color based on current fruit
    // Apply offset to spawn position
    const spawnX = x + offsetX;
    const spawnY = y + offsetY;
    
    for (let i = 0; i < particleCount; i++) {
      const maxLife = 0.8 + Math.random() * 0.5;
      const particle = (this.particlePool.pop() || ({} as Particle)) as Particle;
      particle.x = spawnX;
      particle.y = spawnY;
      particle.vx = (Math.random() - 0.5) * 40;
      particle.vy = 60 + Math.random() * 70;
      particle.life = maxLife;
      particle.maxLife = maxLife;
      particle.size = 3 + Math.random() * 4;
      particle.color = fruitColor;
      particle.type = "drop";
      this.particles.push(particle);
    }
  }
  
  private getFruitJuiceColor(): string {
    if (!this.fruit || !this.fruit.image) {
      // Default: warm juice tone
      const h = 30 + Math.random() * 15;
      const s = 80 + Math.random() * 10;
      const l = 50 + Math.random() * 10;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // Detect fruit by sprite identity (based on filenames: avocado/grape/kiwi/lemon/orange/watermelon)
    const img = this.fruit.image;
    return this.getJuiceColorForImage(img);
  }

  private getJuiceColorForImage(img: HTMLImageElement | null): string {
    if (!img) {
      const h = 30 + Math.random() * 15;
      const s = 80 + Math.random() * 10;
      const l = 50 + Math.random() * 10;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // Base palette per fruit type (picked to match the real fruit flesh/juice)
    let base: { h: number; s: number; l: number } = { h: 30, s: 85, l: 55 }; // fallback

    if (img === this.avocadoImage) {
      base = { h: 95, s: 55, l: 45 }; // avocado green
    } else if (img === this.grapeImage) {
      base = { h: 285, s: 60, l: 45 }; // grape purple
    } else if (img === this.kiwiImage) {
      base = { h: 75, s: 70, l: 50 }; // kiwi lime-green
    } else if (img === this.lemonImage) {
      base = { h: 50, s: 92, l: 58 }; // lemon yellow
    } else if (img === this.orangeImage) {
      base = { h: 28, s: 92, l: 55 }; // orange orange
    } else if (img === this.watermelonImage) {
      base = { h: 350, s: 85, l: 55 }; // watermelon red/pink
    }

    // Add small variation at spawn-time (this is called only when creating VFX, not per-frame)
    const h = base.h + (Math.random() - 0.5) * 8;
    const s = Math.max(55, Math.min(100, base.s + (Math.random() - 0.5) * 10));
    const l = Math.max(35, Math.min(75, base.l + (Math.random() - 0.5) * 12));

    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  
  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Apply gravity to drop particles
      if (p.type === "drop") {
        p.vy += 200 * dt; // Gravity
      } else {
        // Friction for splash particles
        p.vx *= 0.95;
        p.vy *= 0.95;
      }
      
      // Update life
      p.life -= dt;
      
      // Remove dead particles
      if (p.life <= 0) {
        // swap-pop to avoid O(n) splice and reduce GC
        const last = this.particles[this.particles.length - 1];
        this.particles[i] = last;
        this.particles.pop();
        this.particlePool.push(p);
      }
    }
  }

  private updateDebugInfo(level: LevelConfig): void {
    const info = [
      `Level: ${this.currentLevel + 1}`,
      `Fruit Radius: ${level.fruitRadius}px`,
      `Embedded Knives: ${level.embeddedKnives.length}`,
      `Knives to Throw: ${this.knivesToThrow}`,
      `Rotation Speed: ${level.rotationSpeed.toFixed(1)}°/s`,
      `Direction: ${level.rotationDirection > 0 ? "CW" : "CCW"}`,
      `Pattern: ${this.activePattern} (${level.rotationPatterns.length} available)`,
      `Current Vel: ${this.currentAngularVelocity.toFixed(1)}°/s`,
      `Rotation Angle: ${this.fruit.rotationAngle.toFixed(1)}°`,
    ];
    this.debugContent.innerHTML = info.map(line => `<div>${line}</div>`).join("");
  }

  private render(): void {
    const w = this.viewW;
    const h = this.viewH;

    // Apply camera zoom and position
    const fruitCenterX = w * CONFIG.FRUIT_CENTER_X;
    const fruitCenterY = h * CONFIG.FRUIT_CENTER_Y;
    
    this.ctx.save();
    // Apply camera transform
    this.ctx.translate(fruitCenterX, fruitCenterY);
    this.ctx.scale(this.cameraZoom, this.cameraZoom);
    this.ctx.translate(-fruitCenterX + this.cameraX, -fruitCenterY + this.cameraY);
    
    // Apply screen shake offset
    const shakeX = this.screenShake.x;
    const shakeY = this.screenShake.y;
    this.ctx.translate(shakeX, shakeY);
    
    // Draw background with slide animation during transition
    const bgImages = [this.background1Image, this.background2Image, this.background3Image];
    const bgImage = bgImages[this.selectedBackground] ?? this.background1Image;
    if (bgImage && this.assetsLoaded) {
      if (this.transitionActive && this.transitionPhase === "bg_slide") {
        // Draw background with offset during slide
        this.ctx.drawImage(bgImage, 0, this.bgSlideOffset, w, h);
      } else {
        this.ctx.drawImage(bgImage, 0, 0, w, h);
      }
    } else {
      // Fallback: clear canvas
      this.ctx.clearRect(0, 0, w, h);
    }
    
    // Draw brightness/darkness overlay
    if (this.backgroundOverlay.current !== 0) {
      this.ctx.save();
      if (this.backgroundOverlay.current < 0) {
        // Darken (negative value)
        this.ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(this.backgroundOverlay.current)})`;
      } else {
        // Brighten (positive value)
        this.ctx.fillStyle = `rgba(255, 255, 255, ${this.backgroundOverlay.current})`;
      }
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();
    }
    
    // Allow rendering during transition / start menu
    const isTransitioning = this.transitionActive;
    if (
      !isTransitioning &&
      this.state !== "PLAYING" &&
      this.state !== "PAUSED" &&
      this.state !== "WIN" &&
      this.state !== "GAME_OVER" &&
      this.state !== "START" &&
      this.state !== "LEVEL_SELECT"
    ) {
      this.ctx.restore();
      return;
    }
    
    if (!this.assetsLoaded) {
      this.ctx.restore();
      return; // Wait for assets to load
    }

    // Level select rendering (in-canvas) -- draw outside camera transform
    if (this.state === "LEVEL_SELECT") {
      this.ctx.restore();
      this.drawLevelSelect(w, h);
      return;
    }

    // Start menu rendering (in-canvas)
    if (!isTransitioning && this.state === "START") {
      this.drawStartMenu(w, h);
      this.ctx.restore();

      // Draw screen flash on top
      if (this.screenFlash.active) {
        const flashAlpha = 1.0 - (this.screenFlash.time / this.screenFlash.duration);
        this.ctx.save();
        this.ctx.fillStyle = "#ffffff";
        this.ctx.globalAlpha = flashAlpha * 0.8;
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.restore();
      }
      return;
    }
    
    // During bg_slide phase, don't draw fruit or knives yet
    if (isTransitioning && this.transitionPhase === "bg_slide") {
      this.ctx.restore();
      return; // Only background is visible during slide
    }
    
    // Draw embedded knives FIRST (behind the fruit)
    // Only draw knives during knives_fly phase (they start invisible at scale 0)
    // Check if fruit exists before drawing knives
    if (this.fruit) {
      for (let i = 0; i < this.knives.length; i++) {
        const knife = this.knives[i];
        if (!knife.isFlying) {
          // During knives_fly phase, apply zoom scale to each knife individually
          // During fruit_zoom phase, knives are invisible (throwScale = 0)
          if (isTransitioning && this.transitionPhase === "knives_fly" && knife.throwScale > 0) {
            this.ctx.save();
            // Calculate knife position
            const angleRad = ((knife.angle + this.fruit.rotationAngle - 90) * Math.PI) / 180;
            const positionRadius = this.fruit.radius * 0.4; // Position where knife is embedded
            const knifeX = fruitCenterX + Math.cos(angleRad) * positionRadius;
            const knifeY = fruitCenterY + Math.sin(angleRad) * positionRadius;

            // Apply zoom scale centered on knife position
            this.ctx.translate(knifeX, knifeY);
            this.ctx.scale(knife.throwScale, knife.throwScale);
            this.ctx.translate(-knifeX, -knifeY);

            // Use embeddedRotation if available (for transition knives), otherwise use default rotation
            this.drawKnife(
              fruitCenterX,
              fruitCenterY,
              this.fruit.radius,
              knife.angle + this.fruit.rotationAngle,
              knife.stickBounce,
              false, // No longer using isColliding
              knife.embeddedRotation // Pass custom rotation for transition knives
            );

            this.ctx.restore();
          } else if (!isTransitioning) {
            // Normal gameplay - draw knives normally
            this.drawKnife(
              fruitCenterX,
              fruitCenterY,
              this.fruit.radius,
              knife.angle + this.fruit.rotationAngle,
              knife.stickBounce,
              false, // No longer using isColliding
              knife.embeddedRotation // Pass custom rotation for transition knives
            );
          }
        }
      }
    }
    
    // Draw fruit ON TOP (so knives appear inside) with transition animations
    // Only draw fruit during fruit_zoom and knives_fly phases (not during bg_slide)
    // Check if fruit exists before drawing
    if (this.fruit) {
      if (isTransitioning && this.transitionPhase === "fruit_zoom") {
        // Apply zoom and wiggle during fruit zoom phase only
        // Fruit starts at scale 0 and animates to scale 1
        this.ctx.save();
        this.ctx.translate(fruitCenterX, fruitCenterY);
        this.ctx.scale(this.fruitZoomScale, this.fruitZoomScale);
        
        // Apply wiggle only after zoom completes (when scale is 1)
        if (this.fruitZoomScale >= 1 && this.fruitWiggleTime > 0) {
          const wiggle = Math.sin(this.fruitWiggleTime * Math.PI * 6) * 0.05 * (1 - this.fruitWiggleTime / 0.3);
          const scaleX = 1.0 + wiggle;
          const scaleY = 1.0 - wiggle;
          this.ctx.scale(scaleX, scaleY);
        }
        
        this.ctx.translate(-fruitCenterX, -fruitCenterY);
        this.drawFruit(fruitCenterX, fruitCenterY, this.fruit);
        this.ctx.restore();
      } else if (isTransitioning && this.transitionPhase === "knives_fly") {
        // During knives_fly phase, fruit is at full scale (no animation, no wiggle)
        this.drawFruit(fruitCenterX, fruitCenterY, this.fruit);
      } else if (!isTransitioning) {
        // Normal gameplay - draw fruit normally
        this.drawFruit(fruitCenterX, fruitCenterY, this.fruit);
      }
    }
    
    // Draw coins (before particles so they appear behind juice)
    this.drawCoins(fruitCenterX, fruitCenterY);
    
    // Draw particles
    this.drawParticles();
    
    // Draw flying knives (on top of everything)
    this.drawFlyingKnives();
    
    // Draw broken knife pieces (on top of everything, after flying knives)
    this.drawBrokenKnifePieces();
    
    this.ctx.restore(); // Restore from camera and screen shake
    
    // Draw screen flash (outside camera transform, on top of everything)
    if (this.screenFlash.active) {
      const flashAlpha = 1.0 - (this.screenFlash.time / this.screenFlash.duration);
      this.ctx.save();
      this.ctx.fillStyle = "#ffffff";
      this.ctx.globalAlpha = flashAlpha * 0.8; // White flash at 80% opacity max
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();
    }
    
    // Draw celebration UI (outside camera transform)
    if (this.celebrationActive) {
      this.drawCelebrationUI();
    }
    
    // Draw game over UI
    if (this.gameOverActive) {
      this.drawGameOverUI();
    }
  }
  
  private drawCelebrationUI(): void {
    const w = this.viewW;
    const h = this.viewH;
    
    // Draw encouragement text from left side
    this.ctx.save();
    this.ctx.font = `bold ${Math.min(w * 0.08, 60)}px Fredoka One`;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.strokeStyle = "#000000";
    this.ctx.lineWidth = 4;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    
    const textX = this.encouragementX;
    const textY = h * 0.3;
    
    // Draw text with outline
    this.ctx.strokeText(this.encouragementText, textX, textY);
    this.ctx.fillText(this.encouragementText, textX, textY);
    
    this.ctx.restore();
    
    // Draw tap to continue on right side
    this.ctx.save();
    this.ctx.font = `${Math.min(w * 0.05, 40)}px Fredoka One`;
    this.ctx.fillStyle = `rgba(255, 255, 255, ${this.tapToContinueOpacity})`;
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "middle";
    
    const tapX = w - 30;
    const tapY = h * 0.7;
    
    this.ctx.fillText("Tap to Continue →", tapX, tapY);
    this.ctx.restore();
  }

  private drawStartMenu(w: number, h: number): void {
    // Darken background (start menu only)
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    this.ctx.fillRect(0, 0, w, h);
    // Subtle vignette for depth
    if (this.cachedVignetteGradient) {
      this.ctx.fillStyle = this.cachedVignetteGradient;
      this.ctx.fillRect(0, 0, w, h);
    }
    this.ctx.restore();

    const cx = w * 0.5;
    const cy = h * 0.52;
    const isMobile = this.isMobile;

    // Global scale/alpha for zoom-out
    this.ctx.save();
    this.ctx.globalAlpha = this.startMenuAlpha;
    this.ctx.translate(cx, cy);
    this.ctx.scale(this.startMenuScale, this.startMenuScale);
    this.ctx.translate(-cx, -cy);

    // Title (bouncing)
    const titleBounce = Math.sin(this.startMenuTime * 3.2) * 10;
    this.ctx.save();
    this.ctx.font = `bold ${Math.min(w * 0.11, 72)}px Fredoka One`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = "#ffffff";
    this.ctx.strokeStyle = "rgba(0,0,0,0.55)";
    this.ctx.lineWidth = 6;
    // Lower title a bit on mobile to feel less cramped with platform top overlays
    const titleBaseY = isMobile ? Math.max(120, h * 0.19) : Math.max(90, h * 0.16);
    const titleY = titleBaseY + titleBounce;
    this.ctx.strokeText("Hit The Fruit", cx, titleY);
    this.ctx.fillText("Hit The Fruit", cx, titleY);
    this.ctx.restore();

    // Ring
    const ringR = Math.min(w, h) * 0.22;
    const fruitSize = Math.min(w, h) * (isMobile ? 0.17 : 0.145);
    const fruitRadius = fruitSize * 0.46;

    // Soft ring glow
    if (this.cachedRingGlowGradient) {
      this.ctx.save();
      this.ctx.fillStyle = this.cachedRingGlowGradient;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, ringR * 1.15, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Knife intro (all knives from center at once), drawn BEHIND fruits for a "stab" look
    if (this.startIntroState === "knives") {
      const t = Math.max(0, Math.min(1, this.startIntroKnifeT));
      const eased = 1 - Math.pow(1 - t, 3);

      if (this.knifeImage) {
        const iw = this.knifeImage.naturalWidth || this.knifeImage.width;
        const ih = this.knifeImage.naturalHeight || this.knifeImage.height;
        const ar = iw / ih;
        const base = Math.min(w, h) * 0.11;
        const kW = ar > 1 ? base : base * ar;
        const kH = ar > 1 ? base / ar : base;
        const kLen = Math.max(kW, kH);

        for (let i = 0; i < this.startMenuFruits.length; i++) {
          const toCenter = this.getStartMenuFruitPos(i, cx, cy);
          const dx = toCenter.x - this.startIntroKnifeFrom.x;
          const dy = toCenter.y - this.startIntroKnifeFrom.y;
          const dLen = Math.max(0.00001, Math.hypot(dx, dy));
          const ux = dx / dLen;
          const uy = dy / dLen;

          // Stop at the fruit edge (closest edge to the throw origin), not inside
          const edgeX = toCenter.x - ux * fruitRadius;
          const edgeY = toCenter.y - uy * fruitRadius;
          // Pull slightly outward (towards origin) so it doesn't look embedded
          const finalX = edgeX - ux * (kLen * 0.12);
          const finalY = edgeY - uy * (kLen * 0.12);

          const x = this.startIntroKnifeFrom.x + (finalX - this.startIntroKnifeFrom.x) * eased;
          const y = this.startIntroKnifeFrom.y + (finalY - this.startIntroKnifeFrom.y) * eased;

          const angle = Math.atan2(uy, ux);
          this.ctx.save();
          this.ctx.translate(x, y);
          this.ctx.rotate(angle + Math.PI / 2);
          this.ctx.drawImage(this.knifeImage, -kW / 2, -kH / 2, kW, kH);
          this.ctx.restore();
        }
      }
    }

    // Fruits on ring (drawn on top of knives)
    for (const f of this.startMenuFruits) {
      const angleDeg = f.baseAngle + this.startMenuRingAngle;
      const angleRad = ((angleDeg - 90) * Math.PI) / 180;
      const x = cx + Math.cos(angleRad) * ringR;
      const y = cy + Math.sin(angleRad) * ringR;

      // Hit distortion: squash/stretch + tiny nudge (match gameplay)
      const d = f.hitDistortion;
      const pulse = Math.sin(d * Math.PI * 6);
      const sx = 1.0 + pulse * 0.08 * d;
      const sy = 1.0 - pulse * 0.08 * d;
      const ox = Math.sin(d * Math.PI * 8) * 2 * d;
      const oy = Math.cos(d * Math.PI * 8) * 2 * d;

      this.ctx.save();
      this.ctx.translate(x + ox, y + oy);
      this.ctx.scale(sx, sy);
      this.ctx.drawImage(f.image, -fruitSize / 2, -fruitSize / 2, fruitSize, fruitSize);
      this.ctx.restore();
    }

    // Center text (no background)
    const pulse = 0.5 + Math.sin(this.startMenuTime * 2.5) * 0.5;
    this.ctx.save();
    this.ctx.globalAlpha = this.startMenuAlpha * (0.75 + pulse * 0.25);
    this.ctx.font = `bold ${Math.min(w * 0.035, 22)}px Fredoka One`;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.strokeStyle = "rgba(0,0,0,0.55)";
    this.ctx.lineWidth = 5;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const label = this.isMobile ? "Tap to Start" : "Click to Start";
    this.ctx.strokeText(label, cx, cy);
    this.ctx.fillText(label, cx, cy);
    this.ctx.restore();

    // Shop button at bottom
    const shopBtnW = Math.min(w * 0.42, 180);
    const shopBtnH = Math.min(h * 0.06, 48);
    const shopBtnX = cx - shopBtnW / 2;
    const shopBtnY = h * 0.82 - shopBtnH / 2;
    const shopR = shopBtnH * 0.35;

    this.ctx.save();
    this.ctx.globalAlpha = this.startMenuAlpha * 0.92;
    this.ctx.fillStyle = "rgba(60, 30, 10, 0.65)";
    this.roundRect(shopBtnX, shopBtnY, shopBtnW, shopBtnH, shopR);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255, 200, 80, 0.6)";
    this.ctx.lineWidth = 2;
    this.roundRect(shopBtnX, shopBtnY, shopBtnW, shopBtnH, shopR);
    this.ctx.stroke();

    const shopFontSize = Math.min(shopBtnH * 0.48, 20);
    this.ctx.font = `bold ${shopFontSize}px Fredoka One`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = "#FFD54F";
    this.ctx.fillText("Shop", cx, shopBtnY + shopBtnH / 2);
    this.ctx.restore();

    this.shopBtnRect = {
      x: shopBtnX / this.startMenuScale + cx * (1 - 1 / this.startMenuScale),
      y: shopBtnY / this.startMenuScale + cy * (1 - 1 / this.startMenuScale),
      w: shopBtnW / this.startMenuScale,
      h: shopBtnH / this.startMenuScale,
    };

    // Coin balance below shop button
    this.ctx.save();
    this.ctx.globalAlpha = this.startMenuAlpha * 0.85;
    const balFontSize = Math.min(shopBtnH * 0.38, 16);
    this.ctx.font = `bold ${balFontSize}px Fredoka One`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const coinRadius = balFontSize * 0.45;
    const coinText = String(this.coinBank);
    const textW = this.ctx.measureText(coinText).width;
    const totalW = coinRadius * 2 + 6 + textW;
    const balCx = cx;
    const balCy = shopBtnY + shopBtnH + balFontSize * 1.2;

    this.ctx.fillStyle = "#FFD54F";
    this.ctx.beginPath();
    this.ctx.arc(balCx - totalW / 2 + coinRadius, balCy, coinRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#A67C00";
    this.ctx.font = `bold ${coinRadius * 1.1}px Fredoka One`;
    this.ctx.fillText("$", balCx - totalW / 2 + coinRadius, balCy + 1);

    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = `bold ${balFontSize}px Fredoka One`;
    this.ctx.fillText(coinText, balCx - totalW / 2 + coinRadius * 2 + 6 + textW / 2, balCy);
    this.ctx.restore();

    // Start-menu particles (juice splashes)
    this.drawParticles();

    this.ctx.restore();
  }

  private drawLevelSelect(w: number, h: number): void {
    const ctx = this.ctx;
    const isMobile = this.isMobile;

    // Dark background + vignette (same as start menu)
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);
    if (this.cachedLevelSelectVignetteGradient) {
      ctx.fillStyle = this.cachedLevelSelectVignetteGradient;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // Layout constants
    const topSafe = isMobile ? 120 : 45;
    const titleFontSize = Math.min(w * 0.07, 40);
    const titleY = topSafe + titleFontSize * 0.8;

    // Title
    ctx.save();
    ctx.font = `bold ${titleFontSize}px Fredoka One`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 4;
    ctx.strokeText("Select Level", w * 0.5, titleY);
    ctx.fillText("Select Level", w * 0.5, titleY);
    ctx.restore();

    // Back button (top-left)
    const backBtnSize = Math.min(w * 0.1, 44);
    const backBtnX = isMobile ? 16 : 16;
    const backBtnY = topSafe;
    const backR = backBtnSize * 0.25;

    ctx.save();
    ctx.fillStyle = "rgba(60, 30, 10, 0.65)";
    this.roundRect(backBtnX, backBtnY, backBtnSize, backBtnSize, backR);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 200, 80, 0.6)";
    ctx.lineWidth = 2;
    this.roundRect(backBtnX, backBtnY, backBtnSize, backBtnSize, backR);
    ctx.stroke();

    // Arrow icon
    ctx.fillStyle = "#FFD54F";
    ctx.font = `bold ${backBtnSize * 0.5}px Fredoka One`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("<", backBtnX + backBtnSize / 2, backBtnY + backBtnSize / 2);
    ctx.restore();

    this.levelSelectBackRect = { x: backBtnX, y: backBtnY, w: backBtnSize, h: backBtnSize };

    // Grid layout
    const cols = isMobile ? 5 : 10;
    const rows = Math.ceil(CONFIG.TOTAL_LEVELS / cols);
    const gridTop = titleY + titleFontSize * 1.1;
    const gridPadX = w * 0.04;
    const gap = Math.min(w * 0.02, 8);
    const availW = w - gridPadX * 2;
    const cellSize = Math.min((availW - gap * (cols - 1)) / cols, isMobile ? 60 : 56);
    const gridW = cols * cellSize + (cols - 1) * gap;
    const gridLeft = (w - gridW) / 2;
    const gridH = rows * cellSize + (rows - 1) * gap;
    const bottomPad = isMobile ? 140 : 40;
    const viewH = h - gridTop - bottomPad;

    // Clamp scroll
    const maxScroll = Math.max(0, gridH - viewH);
    this.levelSelectScroll = Math.max(0, Math.min(this.levelSelectScroll, maxScroll));

    // Clip grid area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gridTop, w, viewH);
    ctx.clip();

    this.levelSelectBtnRects = [];
    const r = cellSize * 0.2;

    for (let i = 0; i < CONFIG.TOTAL_LEVELS; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridLeft + col * (cellSize + gap);
      const cy = gridTop + row * (cellSize + gap) - this.levelSelectScroll;

      // Skip if off-screen
      if (cy + cellSize < gridTop - 10 || cy > gridTop + viewH + 10) continue;

      const unlocked = i <= this.highestUnlockedLevel;
      const isHighest = i === this.highestUnlockedLevel;

      ctx.save();

      if (unlocked) {
        // Unlocked cell
        if (isHighest) {
          // Glow for current frontier level
          ctx.fillStyle = "rgba(255, 200, 80, 0.12)";
          this.roundRect(cx - 3, cy - 3, cellSize + 6, cellSize + 6, r + 3);
          ctx.fill();
        }

        ctx.fillStyle = "rgba(60, 30, 10, 0.65)";
        this.roundRect(cx, cy, cellSize, cellSize, r);
        ctx.fill();

        ctx.strokeStyle = isHighest ? "rgba(255, 213, 79, 0.9)" : "rgba(255, 200, 80, 0.6)";
        ctx.lineWidth = isHighest ? 2.5 : 1.5;
        this.roundRect(cx, cy, cellSize, cellSize, r);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${cellSize * 0.36}px Fredoka One`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), cx + cellSize / 2, cy + cellSize / 2);
      } else {
        // Locked cell
        ctx.fillStyle = "rgba(30, 15, 5, 0.4)";
        this.roundRect(cx, cy, cellSize, cellSize, r);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 200, 80, 0.15)";
        ctx.lineWidth = 1;
        this.roundRect(cx, cy, cellSize, cellSize, r);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = `bold ${cellSize * 0.36}px Fredoka One`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), cx + cellSize / 2, cy + cellSize / 2);
      }

      ctx.restore();

      if (unlocked) {
        this.levelSelectBtnRects.push({ x: cx, y: cy, w: cellSize, h: cellSize, level: i });
      }
    }

    ctx.restore();

    // Scroll indicators
    if (maxScroll > 0) {
      if (this.levelSelectScroll > 5) {
        const grad = ctx.createLinearGradient(0, gridTop, 0, gridTop + 30);
        grad.addColorStop(0, "rgba(0,0,0,0.5)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, gridTop, w, 30);
      }
      if (this.levelSelectScroll < maxScroll - 5) {
        const grad = ctx.createLinearGradient(0, gridTop + viewH - 30, 0, gridTop + viewH);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.5)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, gridTop + viewH - 30, w, 30);
      }
    }

    // Floating fruit parade at bottom
    const fruitImgs = [
      this.avocadoImage,
      this.orangeImage,
      this.grapeImage,
      this.watermelonImage,
      this.kiwiImage,
      this.lemonImage,
    ].filter((img): img is HTMLImageElement => Boolean(img));

    if (fruitImgs.length > 0) {
      const paradeCount = 10;
      const fruitSize = isMobile ? 36 : 42;
      const paradeY = h - (isMobile ? 60 : 40);
      const t = this.levelSelectTime;

      for (let i = 0; i < paradeCount; i++) {
        const img = fruitImgs[i % fruitImgs.length];
        const spacing = w / paradeCount;
        const baseX = spacing * i + spacing * 0.5;
        const drift = ((baseX + t * 18 * (0.6 + (i % 3) * 0.2)) % (w + fruitSize * 2)) - fruitSize;
        const bob = Math.sin(t * 2.4 + i * 1.7) * 8;
        const rot = Math.sin(t * 1.3 + i * 2.1) * 0.25;
        const scale = 0.85 + Math.sin(t * 1.8 + i * 0.9) * 0.1;
        const alpha = 0.45 + Math.sin(t * 1.5 + i * 1.2) * 0.15;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(drift, paradeY + bob);
        ctx.rotate(rot);
        ctx.drawImage(img, -fruitSize * scale * 0.5, -fruitSize * scale * 0.5, fruitSize * scale, fruitSize * scale);
        ctx.restore();
      }
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    this.ctx.beginPath();
    this.ctx.moveTo(x + rr, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, rr);
    this.ctx.arcTo(x + w, y + h, x, y + h, rr);
    this.ctx.arcTo(x, y + h, x, y, rr);
    this.ctx.arcTo(x, y, x + w, y, rr);
    this.ctx.closePath();
  }

  private drawGameOverUI(): void {
    const w = this.viewW;
    const h = this.viewH;
    const ctx = this.ctx;
    
    // Draw "TIMEOUT" banner if lost by timer
    if (this.gameOverTimeout) {
      ctx.save();
      const fontSize = Math.min(w * 0.14, 80);
      ctx.font = `bold ${fontSize}px Fredoka One`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const cx = w / 2;
      const cy = h * 0.35;
      const t = this.tapToRetryFlicker;
      const pulse = 1.0 + Math.sin(t * 2.5) * 0.04;
      const shake = Math.sin(t * 12) * 2;

      ctx.save();
      ctx.translate(cx + shake, cy);
      ctx.scale(pulse, pulse);

      ctx.fillStyle = this.cachedTimeoutTextGradient ?? "#ff2211";
      ctx.fillText("TIMEOUT", 0, 0);

      ctx.restore();
      ctx.restore();
    }

    // Draw "Tap to Retry"
    ctx.save();
    ctx.font = `bold ${Math.min(w * 0.05, 40)}px Fredoka One`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    
    const tapX = w * 0.9;
    const tapY = h * 0.7;
    
    ctx.globalAlpha = this.tapToRetryOpacity;
    ctx.fillText("← Tap to Retry", tapX, tapY);
    ctx.restore();
  }

  private drawFruit(centerX: number, centerY: number, fruit: Fruit): void {
    if (!fruit || !fruit.image) {
      return; // Don't draw if fruit or image is not available
    }
    if (fruit.image) {
      // Draw fruit image with proper aspect ratio
      const imageWidth = fruit.image.naturalWidth || fruit.image.width;
      const imageHeight = fruit.image.naturalHeight || fruit.image.height;
      const aspectRatio = imageWidth / imageHeight;
      
      // Scale based on radius but keep aspect ratio
      const baseSize = fruit.radius * 1.1; // Slightly bigger than radius
      let width: number;
      let height: number;
      
      if (aspectRatio > 1) {
        // Wider than tall
        width = baseSize;
        height = baseSize / aspectRatio;
      } else {
        // Taller than wide
        height = baseSize;
        width = baseSize * aspectRatio;
      }
      
      // Apply distortion effect
      const distortion = fruit.hitDistortion;
      // Use deterministic values based on distortion to avoid flickering
      // Create a pulsing squash/stretch effect
      const pulse = Math.sin(distortion * Math.PI * 6); // Fast pulse that slows as distortion decreases
      const scaleX = 1.0 + pulse * 0.08 * distortion; // Horizontal squash/stretch
      const scaleY = 1.0 - pulse * 0.08 * distortion; // Vertical squash/stretch
      // Small offset that decreases with distortion
      const offsetX = Math.sin(distortion * Math.PI * 8) * 2 * distortion;
      const offsetY = Math.cos(distortion * Math.PI * 8) * 2 * distortion;
      
      this.ctx.save();
      this.ctx.translate(centerX + offsetX, centerY + offsetY);
      this.ctx.rotate((fruit.rotationAngle * Math.PI) / 180);
      this.ctx.scale(scaleX, scaleY);
      this.ctx.drawImage(fruit.image, -width / 2, -height / 2, width, height);
      this.ctx.restore();
    } else {
      // Fallback: draw simple circle
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, fruit.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = "#ff6b6b";
      this.ctx.fill();
    }
  }

  private drawKnife(
    centerX: number,
    centerY: number,
    radius: number,
    angle: number,
    bounce: number,
    isColliding: boolean = false,
    customRotation?: number // Optional custom rotation override (for transition knives)
  ): void {
    // Convert angle from our convention (0°=top) to canvas convention (0°=right)
    // angle - 90 converts: 0° top -> -90° canvas = 270° canvas (which is up/right)
    const angleRad = ((angle - 90) * Math.PI) / 180;
    
    if (!this.knifeImage) {
      // Fallback: draw simple triangle
      // Position deeper inside fruit (at 50% of radius) so tip is inside
      const innerRadius = radius * 0.5;
      const offset = bounce * 5;
      const x = centerX + Math.cos(angleRad) * (innerRadius + offset);
      const y = centerY + Math.sin(angleRad) * (innerRadius + offset);
      
      this.ctx.save();
      this.ctx.translate(x, y);
      
      // Use custom rotation if provided (for transition knives), otherwise use default rotation
      if (customRotation !== undefined) {
        const customRotationRad = (customRotation * Math.PI) / 180;
        this.ctx.rotate(customRotationRad);
      } else {
        this.ctx.rotate(angleRad + Math.PI / 2 + Math.PI);
      }
      
      // 3x bigger
      this.ctx.fillStyle = isColliding ? "#ff0000" : CONFIG.KNIFE_COLOR;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -36); // 3x bigger
      this.ctx.lineTo(-15, 36);
      this.ctx.lineTo(15, 36);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      return;
    }
    
    // Calculate proper aspect ratio for knife
    const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
    const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
    const aspectRatio = imageWidth / imageHeight;
    
    // Size knife bigger
    const baseSize = radius * 0.6; // Bigger size
    let width: number;
    let height: number;
    
    if (aspectRatio > 1) {
      width = baseSize;
      height = baseSize / aspectRatio;
    } else {
      height = baseSize;
      width = baseSize * aspectRatio;
    }
    
    // Position knife so more of the blade is inside
    // The knife extends from the handle (outside) to the tip (inside)
    // We want more of the blade inside the fruit
    const knifeLength = height; // Total knife height
    const bladeLength = knifeLength * 0.6; // Approximate blade length (60% of total)
    const bladeInside = bladeLength * 0.7; // 70% of blade inside (more inserted)
    
    // Position at rim minus more blade, so more blade is inside
    const positionRadius = radius - bladeInside;
    const offset = bounce * 5; // Bounce animation
    const x = centerX + Math.cos(angleRad) * (positionRadius + offset);
    const y = centerY + Math.sin(angleRad) * (positionRadius + offset);
    
    this.ctx.save();
    this.ctx.translate(x, y);
    
    // Use custom rotation if provided (for transition knives), otherwise use default rotation
    if (customRotation !== undefined) {
      // Convert CSS rotation (0°=right, 90°=down) to canvas rotation
      // CSS: 0°=right, 90°=down, 180°=left, 270°=up
      // Canvas: 0°=right, 90°=down, 180°=left, 270°=up
      // The knife image needs to be rotated to point in the correct direction
      // Custom rotation is already in CSS degrees, convert to radians and adjust
      const customRotationRad = (customRotation * Math.PI) / 180;
      this.ctx.rotate(customRotationRad);
    } else {
      // Default rotation: point outward from fruit center
      this.ctx.rotate(angleRad + Math.PI / 2 + Math.PI); // Rotate 180 degrees (original rotation)
    }
    
    // Apply red tint if colliding
    if (isColliding) {
      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.drawImage(this.knifeImage, -width / 2, -height / 2, width, height);
      // Overlay red tint
      this.ctx.globalCompositeOperation = "multiply";
      this.ctx.fillStyle = "#ff0000";
      this.ctx.fillRect(-width / 2, -height / 2, width, height);
      this.ctx.globalCompositeOperation = "source-over";
    } else {
      this.ctx.drawImage(this.knifeImage, -width / 2, -height / 2, width, height);
    }
    
    this.ctx.restore();
  }

  private drawFlyingKnifeSprite(x: number, y: number, scale: number, rotation: number, knife?: Knife): void {
    if (!this.knifeImage) {
      // Fallback: draw simple triangle
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(Math.PI / 2 + Math.PI + (rotation * Math.PI / 180));
      this.ctx.scale(scale, scale);
      this.ctx.fillStyle = CONFIG.KNIFE_COLOR;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -15);
      this.ctx.lineTo(-6, 15);
      this.ctx.lineTo(6, 15);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      return;
    }
    
    // Use transition knife size if available, otherwise calculate from fruit radius
    let knifeWidth: number;
    let knifeHeight: number;
    
    if (knife && knife.transitionKnifeWidth && knife.transitionKnifeHeight) {
      // Use stored transition size (same as gameplay)
      knifeWidth = knife.transitionKnifeWidth;
      knifeHeight = knife.transitionKnifeHeight;
    } else {
      // Calculate size (same as gameplay)
      const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
      const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
      const aspectRatio = imageWidth / imageHeight;
      const fruitRadius = this.fruit ? this.fruit.radius : 120;
      const baseSize = fruitRadius * 0.6;
      
      if (aspectRatio > 1) {
        knifeWidth = baseSize;
        knifeHeight = baseSize / aspectRatio;
      } else {
        knifeHeight = baseSize;
        knifeWidth = baseSize * aspectRatio;
      }
    }
    
    // Draw knife with correct size and rotation (same as gameplay)
    // Rotation is already calculated in CSS coordinates, convert to canvas coordinates
    this.ctx.save();
    this.ctx.translate(x, y);
    // Convert CSS rotation to canvas rotation (CSS: 0°=right, Canvas: 0°=right, but we need to match the gameplay sprite rotation)
    // The gameplay sprite uses: rotate((rotation * Math.PI / 180)) where rotation is in CSS degrees
    this.ctx.rotate((rotation * Math.PI) / 180);
    this.ctx.drawImage(this.knifeImage, -knifeWidth / 2, -knifeHeight / 2, knifeWidth, knifeHeight);
    this.ctx.restore();
  }
  
  private drawParticles(): void {
    if (this.particles.length === 0) return;

    // Splash pass — one save/restore for the entire group
    this.ctx.save();
    for (const p of this.particles) {
      if (p.type !== "splash") continue;
      this.ctx.globalAlpha = p.life / p.maxLife;
      this.drawJuiceSplash(p.x, p.y, p.size, p.vx, p.vy, p.color);
    }
    this.ctx.restore();

    // Drop pass — one save/restore for the entire group
    this.ctx.save();
    for (const p of this.particles) {
      if (p.type !== "drop") continue;
      this.ctx.globalAlpha = p.life / p.maxLife;
      this.drawJuiceDrop(p.x, p.y, p.size, p.vy, p.color);
    }
    this.ctx.restore();
  }

  private drawJuiceDrop(x: number, y: number, size: number, vy: number, color: string): void {
    const dropLength = size * 1.5;
    const direction = vy > 0 ? 1 : -1;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y - dropLength * 0.3 * direction, size, 0, Math.PI * 2);
    this.ctx.moveTo(x, y + dropLength * 0.7 * direction);
    this.ctx.lineTo(x - size * 0.6, y + dropLength * 0.2 * direction);
    this.ctx.lineTo(x + size * 0.6, y + dropLength * 0.2 * direction);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawJuiceSplash(x: number, y: number, size: number, vx: number, vy: number, color: string): void {
    const angle = Math.atan2(vy, vx);
    const elongation = 1.3;
    this.ctx.fillStyle = color;
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, size * elongation, size / elongation, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.rotate(-angle);
    this.ctx.translate(-x, -y);
  }
  
  private createBrokenKnifePieces(x: number, y: number, rotation: number): void {
    // Choose the correct broken sprite set based on current weapon
    let sprite1: HTMLImageElement | null = null;
    let sprite2: HTMLImageElement | null = null;

    if (this.currentWeapon === "knife") {
      sprite1 = this.brokenKnife1Image;
      sprite2 = this.brokenKnife2Image;
    } else if (this.currentWeapon === "kunai") {
      sprite1 = this.brokenKunai1Image;
      sprite2 = this.brokenKunai2Image;
    } else if (this.currentWeapon === "pen") {
      sprite1 = this.brokenPen1Image;
      sprite2 = this.brokenPen2Image;
    } else if (this.currentWeapon === "pencil") {
      sprite1 = this.brokenPencil1Image;
      sprite2 = this.brokenPencil2Image;
    }

    if (!sprite1 || !sprite2) return;

    const baseScale =
      this.currentWeapon === "knife"
        ? 1.0
        : this.currentWeapon === "kunai"
        ? 0.9
        : this.currentWeapon === "pencil"
        ? 0.12
        : 0.1;

    for (let i = 0; i < 2; i++) {
      const spriteIndex = i + 1; // 1 or 2
      
      // Pieces fall in different directions (left and right)
      const direction = i === 0 ? -1 : 1; // Left (-1) or Right (1)
      const speed = 80 + Math.random() * 40; // Horizontal speed
      
      const piece = (this.brokenPiecePool.pop() || ({} as BrokenKnifePiece)) as BrokenKnifePiece;
      piece.x = x;
      piece.y = y;
      piece.vx = direction * speed;
      piece.vy = 50 + Math.random() * 50;
      piece.rotation = rotation + (Math.random() - 0.5) * 0.5;
      piece.rotationSpeed = (Math.random() - 0.5) * 8;
      piece.scale = baseScale;
      piece.life = 2.0;
      piece.maxLife = 2.0;
      piece.spriteIndex = spriteIndex;
      piece.image = spriteIndex === 1 ? sprite1 : sprite2;
      
      this.brokenKnifePieces.push(piece);
    }
  }
  
  private updateBrokenKnifePieces(dt: number): void {
    for (let i = this.brokenKnifePieces.length - 1; i >= 0; i--) {
      const piece = this.brokenKnifePieces[i];
      
      // Update position
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      
      // Apply gravity
      piece.vy += 300 * dt; // Gravity pulls down
      
      // Update rotation
      piece.rotation += piece.rotationSpeed * dt;
      
      // Apply friction
      piece.vx *= 0.98;
      piece.vy *= 0.98;
      
      // Update life
      piece.life -= dt;
      
      // Remove dead pieces
      if (piece.life <= 0) {
        const last = this.brokenKnifePieces[this.brokenKnifePieces.length - 1];
        this.brokenKnifePieces[i] = last;
        this.brokenKnifePieces.pop();
        this.brokenPiecePool.push(piece);
      }
    }
  }
  
  private updateCoinDisplayCache(): void {
    if (!this.coinDisplay) return;
    const coinRect = this.coinDisplay.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    this.cachedCoinDisplayX = coinRect.left - canvasRect.left + coinRect.width / 2;
    this.cachedCoinDisplayY = coinRect.top - canvasRect.top + coinRect.height / 2;
    this.coinDisplayRectDirty = false;
  }

  private updateCoinAnimations(dt: number): void {
    if (this.coinDisplayRectDirty) {
      this.updateCoinDisplayCache();
    }
    const targetX = this.cachedCoinDisplayX;
    const targetY = this.cachedCoinDisplayY;
    
    for (const coin of this.coins) {
      if (coin.animating) {
        coin.animProgress += dt * 2; // Animation speed
        
        if (coin.animProgress >= 1) {
          // Animation complete
          coin.animating = false;
          coin.animProgress = 1;
        }
        
        // Ease out animation (easeOutCubic)
        const t = coin.animProgress;
        const eased = 1 - Math.pow(1 - t, 3);
        
        // Interpolate from fixed start position to target (avoids compounding drift)
        coin.animX = coin.animStartX + (targetX - coin.animStartX) * eased;
        coin.animY = coin.animStartY + (targetY - coin.animStartY) * eased;
      }
    }
  }
  
  private drawCoins(centerX: number, centerY: number): void {
    if (!this.fruit) return;
    
    for (const coin of this.coins) {
      if (coin.collected && coin.animating) {
        // Draw coin animating to coin display — fade out as it approaches
        this.drawCoin(coin.animX, coin.animY, 1.0 - coin.animProgress, 1.0);
      } else if (!coin.collected) {
        // Draw coin spinning with fruit
        const angleRad = ((coin.angle + this.fruit.rotationAngle - 90) * Math.PI) / 180;
        const positionRadius = this.fruit.radius * 0.7; // Outside the fruit (120% of radius)
        const coinX = centerX + Math.cos(angleRad) * positionRadius;
        const coinY = centerY + Math.sin(angleRad) * positionRadius;
        this.drawCoin(coinX, coinY, 1.0, coin.spawnScale);
      }
    }
  }
  
  private drawCoin(x: number, y: number, alpha: number, scale: number = 1.0): void {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.translate(x, y);
    this.ctx.scale(scale, scale);
    this.ctx.translate(-x, -y);

    const coinSize = 20;

    // Outer glow
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, coinSize);
    gradient.addColorStop(0, "rgba(255, 215, 0, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 215, 0, 0.4)");
    gradient.addColorStop(1, "rgba(255, 215, 0, 0)");
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, coinSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Coin body (golden)
    this.ctx.fillStyle = "#FFD700";
    this.ctx.beginPath();
    this.ctx.arc(x, y, coinSize * 0.7, 0, Math.PI * 2);
    this.ctx.fill();

    // Coin border
    this.ctx.strokeStyle = "#FFA500";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, coinSize * 0.7, 0, Math.PI * 2);
    this.ctx.stroke();

    // Coin symbol ($)
    this.ctx.fillStyle = "#FFA500";
    this.ctx.font = "bold 16px Orbitron";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("$", x, y);

    this.ctx.restore();
  }

  private drawFlyingKnives(): void {
    if (!this.knifeImage || !this.fruit) return;

    const imageWidth = this.knifeImage.naturalWidth || this.knifeImage.width;
    const imageHeight = this.knifeImage.naturalHeight || this.knifeImage.height;
    const aspectRatio = imageWidth / imageHeight;

    for (const knife of this.knives) {
      if (!knife.isFlying) continue;

      const w = knife.flyW ?? (aspectRatio > 1 ? this.fruit.radius * 0.6 : (this.fruit.radius * 0.6) * aspectRatio);
      const h = knife.flyH ?? (aspectRatio > 1 ? (this.fruit.radius * 0.6) / aspectRatio : this.fruit.radius * 0.6);

      this.ctx.save();
      this.ctx.translate(knife.flyX, knife.flyY);
      this.ctx.rotate(knife.throwRotation);
      this.ctx.drawImage(this.knifeImage, -w / 2, -h / 2, w, h);
      this.ctx.restore();
    }
  }
  
  private drawBrokenKnifePieces(): void {
    for (const piece of this.brokenKnifePieces) {
      // Each piece already knows which image to use
      const brokenSprite = piece.image;
      if (!brokenSprite) continue;
      
      const alpha = piece.life / piece.maxLife;
      
      // Use native sprite resolution but scale down
      const spriteWidth = brokenSprite.naturalWidth || brokenSprite.width;
      const spriteHeight = brokenSprite.naturalHeight || brokenSprite.height;
      
      // Scale down to 30% of native size, then apply piece.scale
      const sizeMultiplier = 0.3;
      const displayWidth = spriteWidth * sizeMultiplier * piece.scale;
      const displayHeight = spriteHeight * sizeMultiplier * piece.scale;
      
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(piece.x, piece.y);
      this.ctx.rotate(piece.rotation);
      
      // Draw the broken knife sprite at reduced size
      this.ctx.drawImage(
        brokenSprite,
        -displayWidth / 2,  // Destination X (centered)
        -displayHeight / 2, // Destination Y (centered)
        displayWidth,       // Destination width (60% of native)
        displayHeight       // Destination height (60% of native)
      );
      
      this.ctx.restore();
    }
  }

  private gameLoop(time: number): void {
    const dt = (time - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = time;
    
    if (dt > 0 && dt < 1) {
      // Cap dt to prevent large jumps
      this.update(Math.min(dt, 0.1));
    }
    
    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Initialize game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new KnifeHitGame();
  });
} else {
  new KnifeHitGame();
}
