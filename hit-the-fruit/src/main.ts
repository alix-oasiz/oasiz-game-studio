/**
 * FRUIT NINJA - Knife Hit Style Game
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

// Import assets
import background1Url from "../Assets/Backgrounds/Back 1.png";
import background2Url from "../Assets/Backgrounds/Back 2.png";
import avocadoUrl from "../Assets/Targets/Fruit/Normal Fruit/avocado.png";
import orangeUrl from "../Assets/Targets/Fruit/Normal Fruit/orange.png";
import grapeUrl from "../Assets/Targets/Fruit/Normal Fruit/grape.png";
import watermelonUrl from "../Assets/Targets/Fruit/Normal Fruit/watermelon.png";
import kiwiUrl from "../Assets/Targets/Fruit/Normal Fruit/kiwi.png";
import lemonUrl from "../Assets/Targets/Fruit/Normal Fruit/lemon.png";
import knifeUrl from "../Assets/Weapons/Normal Knif.png";
import kunaiUrl from "../Assets/Weapons/kunai.png";
import penUrl from "../Assets/Weapons/pen.png";
import brokenKnife1Url from "../Assets/Weapons/broken1.png";
import brokenKnife2Url from "../Assets/Weapons/broken2.png";
import brokenKunai1Url from "../Assets/Weapons/broken_kunai1.png";
import brokenKunai2Url from "../Assets/Weapons/broken_kunai2.png";
import brokenPen1Url from "../Assets/Weapons/broken_pen1.png";
import brokenPen2Url from "../Assets/Weapons/broken_pen2.png";
import knifeIconUrl from "../Assets/Weapons/icon.png";
import kunaiIconUrl from "../Assets/Weapons/kunai_icon.png";
import penIconUrl from "../Assets/Weapons/pen_icon.png";

// Import sound effects
import wooshUrl from "../sfx/woosh.wav";
import stabUrl from "../sfx/stab.wav";
import brokeUrl from "../sfx/broke.wav";
import dullUrl from "../sfx/dull.wav";
import successUrl from "../sfx/success.wav";

// ============= CONFIGURATION =============
const CONFIG = {
  // Fruit
  MIN_FRUIT_RADIUS: 75,
  MAX_FRUIT_RADIUS: 150,
  FRUIT_CENTER_X: 0.5, // Ratio of screen width
  FRUIT_CENTER_Y: 0.45, // Ratio of screen height
  
  // Knives
  KNIFE_WIDTH: 8, // Angular width in degrees
  KNIFE_THROW_SPEED: 800, // Pixels per second
  KNIFE_THROW_DISTANCE: 400, // Max distance from bottom
  COLLISION_THRESHOLD_MULTIPLIER: 1.2, // Multiplier for collision detection
  MIN_ANGULAR_SPACING: 15, // Minimum degrees between embedded knives
  
  // Level Generation
  TOTAL_LEVELS: 100,
  MIN_EMBEDDED_KNIVES: 4, // Increased from 2 to make early levels harder
  MAX_EMBEDDED_KNIVES: 12,
  MIN_ROTATION_SPEED: 60, // Increased from 30 to make early levels faster
  MAX_ROTATION_SPEED: 180,
  MIN_KNIVES_TO_THROW: 5, // Increased from 3 to make early levels harder
  MAX_KNIVES_TO_THROW: 8,
  
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
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER" | "WIN";

type WeaponType = "knife" | "kunai" | "pen";

const ECONOMY = {
  UNLOCKS_STORAGE_KEY: "knifeHitWeaponUnlocks",
  // Prices in coins
  PRICES: {
    kunai: 10,
    pen: 25,
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
  rotationPattern: RotationPatternType;
  knivesToThrow: number;
  patternParams?: any; // Pattern-specific parameters
}

type RotationPatternType =
  | "constant"
  | "ramp_up_down"
  | "reverse_smooth"
  | "pulse"
  | "alternating"
  | "breathing"
  | "staged"
  | "chaotic";

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
    const cycle = 4; // 4 second cycle
    const phase = (t % cycle) / cycle;
    let multiplier = 1;
    if (phase < 0.5) {
      // Ramp up
      multiplier = phase * 2; // 0 to 1
    } else {
      // Ramp down
      multiplier = 2 - phase * 2; // 1 to 0
    }
    return baseSpeed * direction * (0.5 + multiplier * 0.5); // 50% to 100% speed
  },

  // Slow CW -> smoothly reverse -> fast CCW -> loop
  reverse_smooth: (t, baseSpeed, direction) => {
    const cycle = 6;
    const phase = (t % cycle) / cycle;
    let speed = baseSpeed;
    let dir = direction;
    
    if (phase < 0.33) {
      // Slow CW
      speed = baseSpeed * 0.3;
      dir = direction;
    } else if (phase < 0.66) {
      // Smooth reverse (interpolate direction)
      const reversePhase = (phase - 0.33) / 0.33;
      speed = baseSpeed * (0.3 + reversePhase * 0.7);
      dir = direction * (1 - reversePhase * 2); // 1 -> -1
    } else {
      // Fast CCW
      speed = baseSpeed * 1.5;
      dir = -direction;
    }
    return speed * dir;
  },

  // Constant speed with periodic pulses
  pulse: (t, baseSpeed, direction) => {
    const pulseFreq = 2; // 2 pulses per second
    const pulse = Math.sin(t * Math.PI * 2 * pulseFreq);
    const multiplier = 0.7 + pulse * 0.3; // 70% to 100%
    return baseSpeed * direction * multiplier;
  },

  // Alternating direction every N seconds with smooth interpolation
  alternating: (t, baseSpeed, direction) => {
    const switchInterval = 3; // Switch every 3 seconds
    const phase = (t % (switchInterval * 2)) / switchInterval;
    let dir = direction;
    
    if (phase < 0.5) {
      // First half: original direction
      dir = direction;
    } else {
      // Second half: reverse direction (with smooth transition)
      const transition = (phase - 0.5) * 2; // 0 to 1
      const smoothTransition = transition * transition * (3 - 2 * transition); // Smoothstep
      dir = direction * (1 - smoothTransition * 2); // 1 -> -1
    }
    return baseSpeed * dir;
  },

  // "Breathing" speed: sin wave modulation around base speed
  breathing: (t, baseSpeed, direction) => {
    const breathFreq = 0.5; // Slow breathing
    const breath = Math.sin(t * Math.PI * 2 * breathFreq);
    const multiplier = 0.6 + breath * 0.4; // 60% to 100%
    return baseSpeed * direction * multiplier;
  },

  // Staged pattern: segment A (slow), segment B (fast), segment C (reverse), repeat
  staged: (t, baseSpeed, direction) => {
    const cycle = 8;
    const phase = (t % cycle) / cycle;
    let speed = baseSpeed;
    let dir = direction;
    
    if (phase < 0.33) {
      // Segment A: slow
      speed = baseSpeed * 0.4;
      dir = direction;
    } else if (phase < 0.66) {
      // Segment B: fast
      speed = baseSpeed * 1.3;
      dir = direction;
    } else {
      // Segment C: reverse
      speed = baseSpeed * 0.8;
      dir = -direction;
    }
    return speed * dir;
  },

  // Chaotic: random-like but smooth
  chaotic: (t, baseSpeed, direction) => {
    // Use multiple sine waves for chaotic but smooth motion
    const wave1 = Math.sin(t * 0.7);
    const wave2 = Math.sin(t * 1.3);
    const wave3 = Math.sin(t * 2.1);
    const combined = (wave1 + wave2 * 0.5 + wave3 * 0.25) / 1.75;
    const multiplier = 0.5 + combined * 0.5; // 0% to 100%
    const dirMultiplier = Math.sin(t * 0.4) > 0 ? 1 : -1;
    return baseSpeed * direction * multiplier * dirMultiplier;
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
    // Difficulty ramps gradually
    const progress = levelIndex / (CONFIG.TOTAL_LEVELS - 1); // 0 to 1
    
    // Fruit radius (slightly smaller as difficulty increases)
    const fruitRadius = CONFIG.MIN_FRUIT_RADIUS + 
      (CONFIG.MAX_FRUIT_RADIUS - CONFIG.MIN_FRUIT_RADIUS) * (1 - progress * 0.3);
    
    // Embedded knives (more as difficulty increases, steeper curve for early levels)
    // Use a curve that starts higher and ramps faster: progress^0.7 makes early levels harder
    const embeddedKnifeProgress = Math.pow(progress, 0.7); // Steeper curve
    const embeddedKnives = this.generateEmbeddedKnives(
      Math.floor(CONFIG.MIN_EMBEDDED_KNIVES + 
        (CONFIG.MAX_EMBEDDED_KNIVES - CONFIG.MIN_EMBEDDED_KNIVES) * embeddedKnifeProgress),
      fruitRadius
    );
    
    // Rotation speed (faster as difficulty increases, steeper curve for early levels)
    // Use a curve that starts higher and ramps faster
    const speedProgress = Math.pow(progress, 0.7); // Steeper curve
    const rotationSpeed = (CONFIG.MIN_ROTATION_SPEED + 
      (CONFIG.MAX_ROTATION_SPEED - CONFIG.MIN_ROTATION_SPEED) * speedProgress) * 1.5;
    
    // Rotation direction
    const rotationDirection = this.rng.next() < 0.5 ? -1 : 1;
    
    // Rotation pattern:
    // Levels 1-14  (levelIndex 0-13):  constant only — uniform speed, just gets faster
    // Levels 15-29 (levelIndex 14-28): speed-variation patterns unlocked (no reverse)
    // Levels 30+   (levelIndex 29+):   reverse-rotation patterns also unlocked
    let patternTypes: RotationPatternType[];
    
    if (levelIndex < 15) {
      // Pure constant speed — no variation at all
      patternTypes = ["constant"];
    } else if (levelIndex < 30) {
      // Speed changes allowed, but no direction reversal
      patternTypes = ["constant", "ramp_up_down", "pulse", "breathing"];
    } else {
      // Full pattern pool including reverse/alternating
      patternTypes = ["constant", "ramp_up_down", "pulse", "breathing", "alternating", "reverse_smooth"];
      if (levelIndex >= 50) {
        patternTypes.push("staged");
      }
      if (levelIndex >= 70) {
        patternTypes.push("chaotic");
      }
    }
    
    const rotationPattern = this.rng.choice(patternTypes);
    
    // Knives to throw (more in later levels, steeper curve for early levels)
    const throwProgress = Math.pow(progress, 0.7); // Steeper curve
    const knivesToThrow = Math.floor(
      CONFIG.MIN_KNIVES_TO_THROW + 
      (CONFIG.MAX_KNIVES_TO_THROW - CONFIG.MIN_KNIVES_TO_THROW) * throwProgress
    );
    
    // Generate coins (ensure they don't overlap with knives)
    const coinCount = Math.max(1, Math.floor(2 + progress * 3)); // 2-5 coins
    const coins = this.generateCoins(coinCount, embeddedKnives, fruitRadius);
    
    return {
      fruitRadius: Math.round(fruitRadius),
      embeddedKnives,
      coins,
      rotationSpeed,
      rotationDirection,
      rotationPattern,
      knivesToThrow,
    };
  }

  private generateEmbeddedKnives(count: number, fruitRadius: number): number[] {
    // Evenly distribute knives around the circumference
    const angles: number[] = [];
    
    if (count === 0) {
      return angles;
    }
    
    // Calculate equal spacing: 360 degrees divided by number of knives
    const spacing = 360 / count;
    
    // Start at a random offset to add variety, then space evenly
    const startOffset = this.rng.nextFloat(0, 360);
    
    for (let i = 0; i < count; i++) {
      // Evenly space each knife around the circle
      const angle = normalizeAngle(startOffset + (i * spacing));
      angles.push(angle);
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
  
  // Game objects
  private fruit: Fruit;
  private knives: Knife[] = [];
  private coins: Coin[] = [];
  // Persistent currency balance (saved to localStorage)
  private coinBank: number = 0;
  // Weapon unlocks (knife always unlocked)
  private weaponUnlocks: Record<WeaponType, boolean> = { knife: true, kunai: false, pen: false };
  private knivesToThrow: number = 0;
  private currentLevel: number = 0;
  private levels: LevelConfig[] = [];
  private levelGenerator: LevelGenerator;
  
  // Rotation
  private rotationTime: number = 0;
  private currentAngularVelocity: number = 0;
  private targetAngularVelocity: number = 0;
  
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
  private tapToRetryOpacity: number = 1.0;
  private tapToRetryFlicker: number = 0;
  
  // Assets
  private background1Image: HTMLImageElement | null = null;
  private background2Image: HTMLImageElement | null = null;
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
  private knifeIconImage: HTMLImageElement | null = null;
  private kunaiIconImage: HTMLImageElement | null = null;
  private penIconImage: HTMLImageElement | null = null;
  private currentWeapon: WeaponType = "knife";
  private weaponImages: { knife: HTMLImageElement | null; kunai: HTMLImageElement | null; pen: HTMLImageElement | null } = {
    knife: null,
    kunai: null,
    pen: null,
  };
  private assetsLoaded: boolean = false;
  
  // Audio
  private wooshSound: HTMLAudioElement | null = null;
  private stabSound: HTMLAudioElement | null = null;
  private brokeSound: HTMLAudioElement | null = null;
  private dullSound: HTMLAudioElement | null = null;
  private successSound: HTMLAudioElement | null = null;
  private transitionSound: HTMLAudioElement | null = null;
  private spawnSound: HTMLAudioElement | null = null;
  
  // UI Elements
  private hud: HTMLElement;
  private startScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private winScreen: HTMLElement;
  private pauseScreen: HTMLElement;
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
  // Cached isMobile value (only changes on resize)
  private isMobile: boolean = false;
  private debugPanel: HTMLElement;
  private debugContent: HTMLElement;
  private settingsIconBtn: HTMLElement;
  private settingsBtn: HTMLElement;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    
    // Initialize UI
    this.hud = document.getElementById("hud")!;
    this.startScreen = document.getElementById("startScreen")!;
    this.gameOverScreen = document.getElementById("gameOverScreen")!;
    this.winScreen = document.getElementById("winScreen")!;
    this.pauseScreen = document.getElementById("pauseScreen")!;
    this.settingsModal = document.getElementById("settingsModal")!;
    this.weaponModal = document.getElementById("weaponModal")!;
    this.levelDisplay = document.getElementById("levelDisplay")!;
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
    const totalAssets = 20; // + kunai/pen icons
    
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
    
    // Set initial weapon image based on current selection
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
    
    // Load audio files (all at same volume level)
    this.wooshSound = new Audio(wooshUrl);
    this.wooshSound.preload = "auto";
    this.wooshSound.volume = 0.5; // 50% volume
    
    this.stabSound = new Audio(stabUrl);
    this.stabSound.preload = "auto";
    this.stabSound.volume = 1.0;
    
    this.brokeSound = new Audio(brokeUrl);
    this.brokeSound.preload = "auto";
    this.brokeSound.volume = 1.0;
    
    this.dullSound = new Audio(dullUrl);
    this.dullSound.preload = "auto";
    this.dullSound.volume = 1.0;
    
    this.successSound = new Audio(successUrl);
    this.successSound.preload = "auto";
    this.successSound.volume = 1.0;
    
    // Create transition and spawn sounds using Web Audio API
    this.transitionSound = this.createTransitionSound();
    this.spawnSound = this.createSpawnSound();
    this.plingSound = this.createPlingSound();
  }
  
  private createTransitionSound(): HTMLAudioElement {
    // Create a simple transition sound using a data URL
    // This is a placeholder - in production, you'd use a generated audio file
    const audio = new Audio();
    // Use a simple approach: create audio programmatically
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 0.5;
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / audioContext.sampleRate;
        const fadeIn = Math.min(1, t / 0.1);
        const fadeOut = Math.min(1, (duration - t) / 0.1);
        const envelope = fadeIn * fadeOut;
        const freq = 400 + (200 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
      }
      
      // Store buffer for later playback
      (audio as any).audioBuffer = buffer;
      (audio as any).audioContext = audioContext;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to create transition sound:", e);
    }
    
    audio.volume = 1.0;
    return audio;
  }
  
  private createSpawnSound(): HTMLAudioElement {
    // Create a simple spawn sound using a data URL
    const audio = new Audio();
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 0.3;
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / audioContext.sampleRate;
        const envelope = Math.exp(-t * 15) * (1 - t / duration);
        const freq = 600 + (300 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.4;
      }
      
      // Store buffer for later playback
      (audio as any).audioBuffer = buffer;
      (audio as any).audioContext = audioContext;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to create spawn sound:", e);
    }
    
    audio.volume = 1.0;
    return audio;
  }
  
  private playGeneratedSound(sound: HTMLAudioElement): void {
    if (!sound || !this.settings.fx) return;
    
    try {
      const audioContext = (sound as any).audioContext;
      const buffer = (sound as any).audioBuffer;
      
      if (audioContext && buffer) {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        source.buffer = buffer;
        gainNode.gain.value = 1.0;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        source.start();
      }
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to play generated sound:", e);
    }
  }
  
  private createPlingSound(): HTMLAudioElement {
    const audio = new Audio();
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 0.2;
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / audioContext.sampleRate;
        const envelope = Math.exp(-t * 20) * (1 - t / duration);
        // Higher frequency for a "pling" sound
        const freq = 800 + (400 * (1 - t / duration));
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
      }
      
      (audio as any).audioBuffer = buffer;
      (audio as any).audioContext = audioContext;
    } catch (e) {
      console.warn("[KnifeHitGame] Failed to create pling sound:", e);
    }
    audio.volume = 1.0;
    return audio;
  }

  private setupEventListeners(): void {
    // Start button
    document.getElementById("startButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      // Legacy DOM start button (kept hidden) routes into start menu intro
      if (this.state === "START") this.startStartMenuIntro();
    });
    
    // Restart button
    document.getElementById("restartButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.restart();
    });
    
    // Menu buttons
    document.getElementById("menuButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });
    document.getElementById("menuButtonWin")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });
    document.getElementById("menuButtonPause")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showMenu();
    });
    
    // Next level button
    document.getElementById("nextLevelButton")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.nextLevel();
    });
    
    // Settings (top right button)
    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showSettings();
    });
    
    // Settings (HUD icon)
    this.settingsIconBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showSettings();
    });
    document.getElementById("closeSettings")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.hideSettings();
    });
    
    // Weapon selection button
    this.weaponBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showWeaponModal();
    });
    
    // Weapon selection modal
    document.getElementById("closeWeaponModal")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.hideWeaponModal();
    });
    
    document.getElementById("selectKnife")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.handleWeaponOptionClick("knife");
    });
    
    document.getElementById("selectKunai")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.handleWeaponOptionClick("kunai");
    });
    
    document.getElementById("selectPen")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.handleWeaponOptionClick("pen");
    });
    
    // Input
    this.canvas.addEventListener("click", (e) => this.handleInput(e));
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.handleInput(e);
    });
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
        // Debug: Toggle debug panel
        this.debugMode = !this.debugMode;
        this.debugPanel.classList.toggle("visible", this.debugMode);
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
    if (weaponSaved && (weaponSaved === "knife" || weaponSaved === "kunai" || weaponSaved === "pen")) {
      this.currentWeapon = weaponSaved as WeaponType;
    }
    this.updateWeaponImage();

    // Sync settings toggle UI after loading
    this.syncSettingsToggleUI();
  }
  
  private saveWeapon(): void {
    this.safeStorageSet("knifeHitWeapon", this.currentWeapon);
  }

  private loadProgression(): void {
    // Coins are session-only (not persisted). Always start at 0.
    this.coinBank = 0;

    // Load unlocks
    const rawUnlocks = this.safeStorageGet(ECONOMY.UNLOCKS_STORAGE_KEY);
    if (rawUnlocks) {
      try {
        const obj = JSON.parse(rawUnlocks) as Partial<Record<WeaponType, boolean>>;
        this.weaponUnlocks = {
          knife: true,
          kunai: Boolean(obj.kunai),
          pen: Boolean(obj.pen),
        };
      } catch {
        this.weaponUnlocks = { knife: true, kunai: false, pen: false };
      }
    } else {
      this.weaponUnlocks = { knife: true, kunai: false, pen: false };
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
      JSON.stringify({ kunai: this.weaponUnlocks.kunai, pen: this.weaponUnlocks.pen })
    );
  }

  private addCoins(amount: number): void {
    const n = Math.max(0, Math.floor(amount));
    if (n <= 0) return;
    this.coinBank = Math.max(0, Math.floor(this.coinBank + n));
    // Defer DOM updates to avoid layout reflow stutter on coin hit
    requestAnimationFrame(() => {
      this.updateLevelDisplay();
      this.refreshWeaponShopUI();
    });
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
    this.updateLevelDisplay();
    this.refreshWeaponShopUI();
    return true;
  }

  private getWeaponPrice(weapon: WeaponType): number {
    if (weapon === "knife") return 0;
    return weapon === "kunai" ? ECONOMY.PRICES.kunai : ECONOMY.PRICES.pen;
  }

  private refreshWeaponShopUI(): void {
    const elBalance = document.getElementById("weaponBalance");
    if (elBalance) elBalance.textContent = `Balance: ${this.coinBank}`;

    const weapons: WeaponType[] = ["knife", "kunai", "pen"];
    for (const w of weapons) {
      const btnId = w === "knife" ? "selectKnife" : w === "kunai" ? "selectKunai" : "selectPen";
      const subId = w === "knife" ? "weaponSubKnife" : w === "kunai" ? "weaponSubKunai" : "weaponSubPen";

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
    
    // Update active state in modal
    document.getElementById("selectKnife")?.classList.toggle("active", this.currentWeapon === "knife");
    document.getElementById("selectKunai")?.classList.toggle("active", this.currentWeapon === "kunai");
    document.getElementById("selectPen")?.classList.toggle("active", this.currentWeapon === "pen");
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
    } else if (this.state === "START") {
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
      flyStartRot = isHorizontal ? 0 : Math.PI / 2;
      flyEndRot = Math.atan2(fruitCenterY - canvasY, fruitCenterX - canvasX) + Math.PI / 2;
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
      throwRotation: flyStartRot || 0,
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
    
    // Play woosh sound when throwing knife
    if (this.settings.fx && this.wooshSound) {
      this.wooshSound.currentTime = 0;
      this.wooshSound.play().catch(() => {
        // Ignore audio play errors (e.g., user hasn't interacted yet)
      });
    }
  }

  private startGame(): void {
    // Coins are session-only; starting a run resets balance
    this.coinBank = 0;
    this.refreshWeaponShopUI();

    this.currentLevel = 0;
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
    // Ensure we have a viewport
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

    // Coins are session-only; returning to main menu resets balance
    this.coinBank = 0;
    this.updateLevelDisplay();
    this.refreshWeaponShopUI();

    // Hide gameplay UI on start screen
    this.gameOverScreen.classList.add("hidden");
    this.winScreen.classList.add("hidden");
    this.pauseScreen.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.settingsIconBtn.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
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

  private loadLevel(levelIndex: number): void {
    if (levelIndex >= this.levels.length) {
      // Game complete!
      this.state = "GAME_OVER";
      return;
    }
    
    const level = this.levels[levelIndex];
    this.currentLevel = levelIndex;
    
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
    
    this.updateLevelDisplay();
    
    // Reset collision prediction and game over state
    this.collisionPredicted = false;
    this.collisionPoint = null;
    this.gameOverActive = false;
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
      this.loadLevel(this.currentLevel);
      this.state = "PLAYING";
      this.winScreen.classList.add("hidden");
      
      // Resume spin sound for next level (will start when transition completes)
    } else {
      // Game complete
      this.state = "GAME_OVER";
      this.gameOverScreen.classList.remove("hidden");
    }
  }

  private restart(): void {
    // Coins are session-only; failing/restarting resets balance
    this.coinBank = 0;
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
    
    this.currentLevel = 0;
    this.loadLevel(this.currentLevel);
    this.state = "PLAYING";
    this.gameOverScreen.classList.add("hidden");
    this.winScreen.classList.add("hidden");
    this.startScreen.classList.add("hidden");
    // Reset game over state
    this.gameOverActive = false;
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
      this.state = "PAUSED";
      // Only show pause screen if settings or weapon modal are not visible
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
    this.refreshWeaponShopUI();
    this.weaponModal.classList.add("visible");
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
    // Update coins display with persistent balance
    this.coinDisplay.textContent = this.coinBank.toString();
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
          const rotationDeg = aspectRatio > 1 ? 0 : 90;
          this.knifePreviewImage.style.transform = `rotate(${rotationDeg}deg)`;
        }
        this.knifePreviewImage.style.display = "block";
      } else {
        this.knifePreviewImage.style.display = "none";
      }
      
      // Update count text above knife (show 0 if no knives left but knife is flying)
      const displayCount = this.knivesToThrow > 0 ? this.knivesToThrow : 0;
      this.knivesCount.textContent = displayCount.toString();
      
      // Update knife icons below knife preview
      const currentIcon =
        this.currentWeapon === "kunai"
          ? this.kunaiIconImage
          : this.currentWeapon === "pen"
          ? this.penIconImage
          : this.knifeIconImage;

      const iconToUse = currentIcon || this.knifeIconImage;

      if (iconToUse && this.assetsLoaded) {
        const alt =
          this.currentWeapon === "kunai" ? "Kunai icon" : this.currentWeapon === "pen" ? "Pen icon" : "Knife icon";

        // Update src if weapon changed
        if (this.lastKnifeIconsWeapon !== this.currentWeapon) {
          for (const el of this.knifeIconEls) {
            el.src = iconToUse.src;
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
    if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
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

    if (this.state !== "PLAYING" && this.state !== "WIN" && this.state !== "GAME_OVER") return;
    
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
      this.rotationTime += actualDt; // Use actualDt for rotation
      
      // Calculate target angular velocity from pattern
      const pattern = ROTATION_PATTERNS[level.rotationPattern];
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
        120 // Max acceleration
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
        const startRot = knife.flyStartRot ?? 0;
        const endRot = knife.flyEndRot ?? (Math.atan2(dy, dx) + Math.PI / 2);
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
              
              // Play pling sound effect
              if (this.settings.fx && this.plingSound) {
                this.playGeneratedSound(this.plingSound);
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
            
            // Play broke sound, then dull sound
            if (this.settings.fx) {
              if (this.brokeSound) {
                this.brokeSound.currentTime = 0;
                this.brokeSound.play().catch(() => {});
              }
              // Play dull sound immediately after broke
              if (this.dullSound) {
                this.dullSound.currentTime = 0;
                // Small delay to play after broke starts
                setTimeout(() => {
                  if (this.settings.fx && this.dullSound) {
                    this.dullSound.play().catch(() => {});
                  }
                }, 50);
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
            
            // Start game over sequence (no modal)
            this.gameOverActive = true;
            this.state = "GAME_OVER";
            // Coins are session-only; failing resets balance
            this.coinBank = 0;
            // Darken background smoothly
            this.backgroundOverlay.target = -0.5; // Darken to 50%
            this.triggerHaptic("error");
            
            // Submit score on game over (level reached)
            console.log("[KnifeHitGame] Submitting final score:", this.currentLevel);
            if (typeof (window as any).submitScore === "function") {
              (window as any).submitScore(this.currentLevel); // Submit level reached (0-indexed)
            }
            
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
            
            // Play stab sound when knife hits fruit
            if (this.settings.fx && this.stabSound) {
              this.stabSound.currentTime = 0;
              this.stabSound.play().catch(() => {});
            }
            
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
              this.state = "WIN"; // Keep state as WIN but don't show modal
              // Brighten background smoothly
              this.backgroundOverlay.target = 0.3; // Brighten by 30%
              this.triggerHaptic("success");
              
              // Play success sound when clearing level
              if (this.settings.fx && this.successSound) {
                this.successSound.currentTime = 0;
                this.successSound.play().catch(() => {});
              }
              
              if (typeof (window as any).submitScore === "function") {
                (window as any).submitScore(this.currentLevel + 1);
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

            if (this.settings.fx && this.stabSound) {
              this.stabSound.currentTime = 0;
              this.stabSound.play().catch(() => {});
            }
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
          this.startGame();
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
        if (this.transitionSound) {
          this.playGeneratedSound(this.transitionSound);
        }
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
        if (this.spawnSound) {
          this.playGeneratedSound(this.spawnSound);
        }
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
        if (this.spawnSound) {
          this.playGeneratedSound(this.spawnSound);
        }
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
      `Pattern: ${level.rotationPattern}`,
      `Current Vel: ${this.currentAngularVelocity.toFixed(1)}°/s`,
      `Rotation Angle: ${this.fruit.rotationAngle.toFixed(1)}°`,
    ];
    this.debugContent.innerHTML = info.map(line => `<div>${line}</div>`).join("");
  }

  private render(): void {
    const w = this.viewW;
    const h = this.viewH;

    // Render at devicePixelRatio but keep coordinates in CSS pixels
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    // Some WebViews only support this via "any"
    (this.ctx as any).imageSmoothingQuality = "high";
    
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
    const bgImage = this.currentLevel % 2 === 0 ? this.background1Image : this.background2Image;
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
      this.state !== "START"
    ) {
      this.ctx.restore();
      return;
    }
    
    if (!this.assetsLoaded) {
      this.ctx.restore();
      return; // Wait for assets to load
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
    const vg = this.ctx.createRadialGradient(w * 0.5, h * 0.52, Math.min(w, h) * 0.2, w * 0.5, h * 0.52, Math.min(w, h) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    this.ctx.fillStyle = vg;
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();

    const cx = w * 0.5;
    const cy = h * 0.52;
    const isMobile = window.matchMedia("(pointer: coarse)").matches;

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
    this.ctx.strokeText("Fruit Ninja", cx, titleY);
    this.ctx.fillText("Fruit Ninja", cx, titleY);
    this.ctx.restore();

    // Ring
    const ringR = Math.min(w, h) * 0.22;
    const fruitSize = Math.min(w, h) * (isMobile ? 0.17 : 0.145);
    const fruitRadius = fruitSize * 0.46;

    // Soft ring glow
    this.ctx.save();
    const ringGrad = this.ctx.createRadialGradient(cx, cy, ringR * 0.55, cx, cy, ringR * 1.15);
    ringGrad.addColorStop(0, "rgba(255,255,255,0)");
    ringGrad.addColorStop(0.55, "rgba(255,255,255,0.08)");
    ringGrad.addColorStop(1, "rgba(255,255,255,0)");
    this.ctx.fillStyle = ringGrad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, ringR * 1.15, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

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
    const label = window.matchMedia("(pointer: coarse)").matches ? "Tap to Start" : "Click to Start";
    this.ctx.strokeText(label, cx, cy);
    this.ctx.fillText(label, cx, cy);
    this.ctx.restore();

    // Start-menu particles (juice splashes)
    this.drawParticles();

    this.ctx.restore();
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
    
    this.ctx.save();
    this.ctx.font = `bold ${Math.min(w * 0.05, 40)}px Fredoka One`;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "middle";
    
    // Draw "Tap to Retry" on the right side
    const tapX = w * 0.9;
    const tapY = h * 0.7;
    
    this.ctx.globalAlpha = this.tapToRetryOpacity;
    this.ctx.fillText("← Tap to Retry", tapX, tapY);
    this.ctx.restore();
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
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      
      if (p.type === "drop") {
        // Draw teardrop shape for juice drops
        this.drawJuiceDrop(p.x, p.y, p.size, p.vy, p.color);
      } else {
        // Draw splash particles as slightly elongated ovals for liquid effect
        this.drawJuiceSplash(p.x, p.y, p.size, p.vx, p.vy, p.color);
      }
      
      this.ctx.restore();
    }
  }
  
  private drawJuiceDrop(x: number, y: number, size: number, vy: number, color: string): void {
    // Draw a teardrop shape pointing downward
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    
    // Teardrop shape: circle on top, point on bottom
    const dropLength = size * 1.5; // Make drops slightly elongated
    const direction = vy > 0 ? 1 : -1; // Point in direction of movement
    
    // Top circle part
    this.ctx.arc(x, y - dropLength * 0.3 * direction, size, 0, Math.PI * 2);
    
    // Bottom point
    this.ctx.moveTo(x, y + dropLength * 0.7 * direction);
    this.ctx.lineTo(x - size * 0.6, y + dropLength * 0.2 * direction);
    this.ctx.lineTo(x + size * 0.6, y + dropLength * 0.2 * direction);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Add a highlight for 3D effect
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.beginPath();
    this.ctx.arc(x - size * 0.3, y - dropLength * 0.4 * direction, size * 0.4, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private drawJuiceSplash(x: number, y: number, size: number, vx: number, vy: number, color: string): void {
    // Draw elongated oval in direction of movement for liquid splash effect
    this.ctx.fillStyle = color;
    
    // Calculate angle of movement
    const angle = Math.atan2(vy, vx);
    const elongation = 1.3; // Make splashes slightly elongated
    
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, size * elongation, size / elongation, 0, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Add a highlight for 3D liquid effect
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    this.ctx.beginPath();
    this.ctx.ellipse(-size * 0.3, -size * 0.3, size * 0.5 * elongation, size * 0.5 / elongation, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
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
    }

    if (!sprite1 || !sprite2) return;

    // Spawn exactly 2 broken pieces at the exact same position
    // Tune base scale per weapon to keep visual balance
    const baseScale =
      this.currentWeapon === "knife"
        ? 1.0 // original knife size (baseline)
        : this.currentWeapon === "kunai"
        ? 0.9 // slightly smaller than knife
        : 0.1; // pen: much smaller, so it feels light and shard-like

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
  
  private updateCoinAnimations(dt: number): void {
    // Target: the actual coinDisplay element position in canvas-local CSS pixels
    let targetX = 60;
    let targetY = 60;
    if (this.coinDisplay) {
      const coinRect = this.coinDisplay.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      targetX = coinRect.left - canvasRect.left + coinRect.width / 2;
      targetY = coinRect.top - canvasRect.top + coinRect.height / 2;
    }
    
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
    
    // Draw coin as a golden circle
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
