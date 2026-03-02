/**
 * PAPER PLANE ASTEROID SURVIVOR
 *
 * A vertical-scrolling roguelike shooter with hand-drawn paper aesthetic.
 * Features event-driven architecture with object pooling for performance.
 */

import { oasiz } from "@oasiz/sdk";
import bgmNormal1Url from "../sfx/normal-1.mp3";
import bgmNormal2Url from "../sfx/normal-2.mp3";
import bgmBossUrl from "../sfx/boss.mp3";

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  PLAYER_Y_RATIO: 0.85,
  PLAYER_WIDTH: 50,
  PLAYER_HEIGHT: 60,
  PLAYER_SPEED: 8,
  PLAYER_FIRE_RATE: 333, // ms between shots

  // Bullets
  BULLET_SPEED: 12,
  BULLET_WIDTH: 6,
  BULLET_HEIGHT: 20,
  BULLET_POOL_SIZE: 200,

  // Asteroids
  ASTEROID_POOL_SIZE: 100,
  ASTEROID_SIZES: {
    large: { radius: 58, health: 4, speed: 2.0, coins: 15 },
    medium: { radius: 42, health: 2, speed: 2.8, coins: 8 },
    small: { radius: 28, health: 1, speed: 3.5, coins: 3 },
  },
  SPAWN_INTERVAL_START: 1800,
  SPAWN_INTERVAL_MIN: 350,

  // Boss
  BOSS_HEALTH: 400,
  BOSS_RADIUS: 120,
  BOSS_THROW_INTERVAL: 3000, // ms between asteroid throws
  BOSS_ASTEROID_HEALTH: 10,
  BOSS_MAX_THROWS: 5,
  BOSS_Y_POSITION: 180, // Where boss sits at top of screen

  // Drones
  DRONE_ORBIT_RADIUS: 60,
  DRONE_SIZE: 20,

  // Particles
  PARTICLE_POOL_SIZE: 500,

  // Difficulty
  ASTEROIDS_PER_UPGRADE: 6, // Destroy 6 asteroids to trigger upgrade
  SPEED_INCREASE_INTERVAL: 60000,
  HEALTH_INCREASE_INTERVAL: 60000,

  // Visual
  BACKGROUND_SCROLL_SPEED: 50,
  GRID_SIZE: 40,

  // Colors
  PAPER_BG: "#f5f5dc",
  GRID_LINE: "#d4d4c4",
  PENCIL_DARK: "#2d2d2d",
  PENCIL_MEDIUM: "#4a4a4a",
  PENCIL_LIGHT: "#6d6d6d",
  COIN_GOLD: "#ffd700",
  FONT_FAMILY: "Caveat, cursive",
};

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
  // Tier 1 (Boss 1) - Basic abilities
  [
    {
      id: "shield_1",
      name: "Paper Shield",
      description:
        "Crumpled paper protection! Become invincible for 5 seconds.",
      icon: "shield",
      charges: 1,
      tier: 1,
      duration: 5,
    },
    {
      id: "blast_1",
      name: "Eraser Blast",
      description: "Rub it out! Destroy all asteroids on screen.",
      icon: "blast",
      charges: 1,
      tier: 1,
    },
    {
      id: "turbo_1",
      name: "Ink Overdrive",
      description: "Fresh ink! Double fire rate and speed for 8 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 1,
      duration: 8,
      power: 2,
    },
  ],
  // Tier 2 (Boss 2) - Enhanced abilities
  [
    {
      id: "shield_2",
      name: "Reinforced Paper",
      description: "Double-layered! Invincible for 8 seconds.",
      icon: "shield",
      charges: 2,
      tier: 2,
      duration: 8,
    },
    {
      id: "blast_2",
      name: "Eraser Storm",
      description: "Powerful eraser! Destroy all + deal 20 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 2,
      power: 20,
    },
    {
      id: "turbo_2",
      name: "Pencil Fury",
      description: "Sharpened! Triple fire rate and speed for 10 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 2,
      duration: 10,
      power: 3,
    },
  ],
  // Tier 3 (Boss 3) - Powerful abilities
  [
    {
      id: "shield_3",
      name: "Steel Origami",
      description: "Metal-folded! Invincible for 10 seconds + reflect damage.",
      icon: "shield",
      charges: 2,
      tier: 3,
      duration: 10,
    },
    {
      id: "blast_3",
      name: "Nuclear Eraser",
      description: "Massive blast! Destroy everything + 40 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 3,
      power: 40,
    },
    {
      id: "turbo_3",
      name: "Graphite Rush",
      description:
        "Pure graphite! 4x fire rate + extra bullets for 12 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 3,
      duration: 12,
      power: 4,
    },
  ],
  // Tier 4 (Boss 4) - Epic abilities
  [
    {
      id: "shield_4",
      name: "Diamond Fold",
      description: "Crystallized! 12 seconds invincibility + auto-fire.",
      icon: "shield",
      charges: 2,
      tier: 4,
      duration: 12,
    },
    {
      id: "blast_4",
      name: "Black Hole",
      description:
        "Gravitational pull! Pulls in and destroys all + 60 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 4,
      power: 60,
    },
    {
      id: "turbo_4",
      name: "Ink Explosion",
      description: "Explosive ink! Bullets explode on impact for 15 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 4,
      duration: 15,
      power: 5,
    },
  ],
  // Tier 5 (Boss 5) - Legendary abilities
  [
    {
      id: "shield_5",
      name: "Origami Fortress",
      description: "Impenetrable! 15 seconds invincibility + damage aura.",
      icon: "shield",
      charges: 3,
      tier: 5,
      duration: 15,
    },
    {
      id: "blast_5",
      name: "Eraser Apocalypse",
      description:
        "Total annihilation! Screen-wide destruction + 80 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 5,
      power: 80,
    },
    {
      id: "turbo_5",
      name: "Rainbow Ink",
      description: "Legendary ink! All stats doubled for 20 seconds.",
      icon: "turbo",
      charges: 1,
      tier: 5,
      duration: 20,
      power: 6,
    },
  ],
  // Tier 6 (Boss 6) - Mythic abilities
  [
    {
      id: "shield_6",
      name: "Paper God",
      description:
        "Divine protection! 20 seconds invincibility + triple damage.",
      icon: "shield",
      charges: 3,
      tier: 6,
      duration: 20,
    },
    {
      id: "blast_6",
      name: "Reality Eraser",
      description:
        "Erase reality! Freeze time + destroy everything + 100 boss damage.",
      icon: "blast",
      charges: 1,
      tier: 6,
      power: 100,
    },
    {
      id: "turbo_6",
      name: "Eternal Ink",
      description: "Infinite power! Permanent +25% stats + 25s massive boost.",
      icon: "turbo",
      charges: 1,
      tier: 6,
      duration: 25,
      power: 8,
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
  | "scissors";

interface BossConfig {
  name: string;
  subtitle: string;
  healthMult: number;
  waveInterval: number; // Time between attack waves (ms)
  attacksPerWave: number; // How many attacks per wave
  attackDelay: number; // Delay between attacks within a wave (ms)
  movePattern: "static" | "sway" | "chase" | "bounce" | "zigzag" | "circle";
  color: string;
  accentColor: string;
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
  },
  paperweight: {
    name: "Paperweight",
    subtitle: "Heavy Hitter",
    healthMult: 1.4,
    waveInterval: 5000,
    attacksPerWave: 5,
    attackDelay: 200,
    movePattern: "static",
    color: "#8b8b8b",
    accentColor: "#5a5a5a",
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
  },
};

const BOSS_ORDER: BossType[] = [
  "eraser",
  "paperweight",
  "inkblot",
  "rubberband",
  "stapler",
  "scissors",
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
    | "seismic_wave";
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
}

interface BossMinion {
  id: number;
  type:
    | "eraser_grunt"
    | "ink_spider"
    | "staple_sentry"
    | "blade_drone"
    | "stick_man";
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
  type: "ink_puddle" | "gravity_well" | "paper_cut" | "shockwave";
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
  private normalTracks: HTMLAudioElement[] = [];
  private bossTrack: HTMLAudioElement | null = null;
  private currentNormalIndex = 0;
  private normalTracksLoaded = 0;
  private bossTrackLoaded = false;
  private isBossMusic = false;
  private musicActive = false;
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

      // Load background music
      this.loadBgMusic();
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  private loadBgMusic(): void {
    if (this.normalTracks.length > 0) return;
    try {
      const normalUrls = [bgmNormal1Url, bgmNormal2Url];
      for (let i = 0; i < normalUrls.length; i++) {
        const track = new Audio(normalUrls[i]);
        track.loop = true;
        track.volume = 0.06;
        track.preload = "auto";
        track.addEventListener(
          "canplaythrough",
          () => {
            this.normalTracksLoaded++;
            console.log("[AudioManager] Normal track " + (i + 1) + " loaded");
          },
          { once: true },
        );
        track.addEventListener("error", (e) => {
          console.warn(
            "[AudioManager] Failed to load normal track " + (i + 1) + ":",
            e,
          );
        });
        this.normalTracks.push(track);
      }

      this.bossTrack = new Audio(bgmBossUrl);
      this.bossTrack.loop = true;
      this.bossTrack.volume = 0.075;
      this.bossTrack.preload = "auto";
      this.bossTrack.addEventListener(
        "canplaythrough",
        () => {
          this.bossTrackLoaded = true;
          console.log("[AudioManager] Boss track loaded");
        },
        { once: true },
      );
      this.bossTrack.addEventListener("error", (e) => {
        console.warn("[AudioManager] Failed to load boss track:", e);
      });
    } catch (e) {
      console.warn("[AudioManager] Error loading music:", e);
    }
  }

  private getCurrentNormalTrack(): HTMLAudioElement | null {
    if (this.normalTracks.length === 0) return null;
    return this.normalTracks[
      this.currentNormalIndex % this.normalTracks.length
    ];
  }

  startMusic(): void {
    this.musicActive = true;
    this.isBossMusic = false;
    if (!this.settings.music) return;
    const track = this.getCurrentNormalTrack();
    if (!track) return;
    track.currentTime = 0;
    track.volume = 0.06;
    track.play().catch((e) => {
      console.warn("[AudioManager.startMusic] Playback failed:", e);
    });
    console.log(
      "[AudioManager] Normal music started (track " +
        (this.currentNormalIndex + 1) +
        ")",
    );
  }

  stopMusic(): void {
    this.musicActive = false;
    for (const track of this.normalTracks) {
      track.pause();
      track.currentTime = 0;
    }
    if (this.bossTrack) {
      this.bossTrack.pause();
      this.bossTrack.currentTime = 0;
    }
    this.isBossMusic = false;
    console.log("[AudioManager] All music stopped");
  }

  switchToBossMusic(): void {
    if (this.isBossMusic) return;
    console.log("[AudioManager] Switching to boss music");
    for (const track of this.normalTracks) {
      track.pause();
    }
    this.isBossMusic = true;
    if (!this.bossTrack || !this.settings.music) return;
    this.bossTrack.currentTime = 0;
    this.bossTrack.volume = 0.075;
    this.bossTrack.play().catch((e) => {
      console.warn("[AudioManager.switchToBossMusic] Playback failed:", e);
    });
  }

  switchToNormalMusic(): void {
    if (!this.isBossMusic) return;
    console.log("[AudioManager] Switching back to normal music");
    if (this.bossTrack) {
      this.bossTrack.pause();
      this.bossTrack.currentTime = 0;
    }
    this.isBossMusic = false;
    this.currentNormalIndex =
      (this.currentNormalIndex + 1) % this.normalTracks.length;
    if (!this.settings.music) return;
    const track = this.getCurrentNormalTrack();
    if (!track) return;
    track.currentTime = 0;
    track.volume = 0.06;
    track.play().catch((e) => {
      console.warn("[AudioManager.switchToNormalMusic] Playback failed:", e);
    });
    console.log(
      "[AudioManager] Now playing normal track " +
        (this.currentNormalIndex + 1),
    );
  }

  updateMusicState(): void {
    if (!this.musicActive) return;
    if (this.settings.music) {
      if (this.isBossMusic) {
        if (this.bossTrack && this.bossTrack.paused && this.bossTrackLoaded) {
          this.bossTrack.play().catch(() => {});
        }
      } else {
        const track = this.getCurrentNormalTrack();
        if (track && track.paused && this.normalTracksLoaded > 0) {
          track.play().catch(() => {});
        }
      }
    } else {
      for (const track of this.normalTracks) {
        track.pause();
      }
      if (this.bossTrack) {
        this.bossTrack.pause();
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
    oasiz.triggerHaptic(type as "light" | "medium" | "heavy" | "success" | "error");
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
};

// ============= UPGRADE TREE =============
interface UpgradeTree {
  fireRate: number; // 0-5
  multiShot: number; // 0-5
  turrets: number; // 0-5
}

interface UpgradeLevelConfig {
  name: string;
  desc: string;
  value: number;
}

interface UpgradePathConfig {
  name: string;
  icon: string;
  levels: UpgradeLevelConfig[];
}

const UPGRADE_CONFIG: Record<keyof UpgradeTree, UpgradePathConfig> = {
  fireRate: {
    name: "Fire Rate",
    icon: "F",
    levels: [
      { name: "Quick Draw", desc: "+15% fire rate", value: 1.15 },
      { name: "Rapid Fire", desc: "+30% fire rate", value: 1.3 },
      { name: "Machine Gun", desc: "+50% fire rate", value: 1.5 },
      { name: "Bullet Storm", desc: "+75% fire rate", value: 1.75 },
      { name: "Lead Rain", desc: "+100% fire rate", value: 2.0 },
    ],
  },
  multiShot: {
    name: "Multi-Shot",
    icon: "M",
    levels: [
      { name: "Double Tap", desc: "2 bullets", value: 2 },
      { name: "Triple Threat", desc: "3 bullets", value: 3 },
      { name: "Quad Shot", desc: "4 bullets", value: 4 },
      { name: "Penta Burst", desc: "5 bullets", value: 5 },
      { name: "Full Spread", desc: "7 bullets", value: 7 },
    ],
  },
  turrets: {
    name: "Turret Buddy",
    icon: "T",
    levels: [
      { name: "Helper I", desc: "1 turret", value: 1 },
      { name: "Helper II", desc: "2 turrets", value: 2 },
      { name: "Helper III", desc: "3 turrets", value: 3 },
      { name: "Helper IV", desc: "4 turrets", value: 4 },
      { name: "Helper V", desc: "5 turrets", value: 5 },
    ],
  },
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

  // Stats
  survivalTime: number = 0;
  coins: number = 0;
  score: number = 0;

  // Timers
  fireTimer: number = 0;
  spawnTimer: number = 0;
  destroyedCount: number = 0; // Asteroids destroyed since last upgrade
  totalUpgrades: number = 0; // Total upgrades collected

  // Ability system
  activeAbilities: StoredAbility[] = [];
  abilityDuration: number = 0;
  abilityCooldown: number = 0;
  abilityChoices: Ability[] = [];
  permanentStatBoost: number = 0; // For tier 6 "Eternal Ink" permanent boost
  currentlyActiveAbility: StoredAbility | null = null; // The one currently in effect (if any)

  // Upgrade tree system
  upgrades: UpgradeTree = { fireRate: 0, multiShot: 0, turrets: 0 };
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
      if (e.key === "Escape" && this.gameState === "PLAYING") {
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
      this.startGame();
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
        this.startGame();
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
      .getElementById("backFromGalleryBtn")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        this.hideGalleryScreen();
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
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.remove("hidden");
  }

  hideGalleryScreen(): void {
    console.log("[hideGalleryScreen]");
    document.getElementById("galleryScreen")?.classList.add("hidden");
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

  startGame(): void {
    console.log("[startGame] Plane:", this.selectedPlane);

    this.audio.init();
    this.audio.startMusic();
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

    // Generate background doodles for juice
    this.generateDoodles();

    // Reset upgrade tree...
    this.upgrades = { fireRate: 0, multiShot: 0, turrets: 0 };
    this.currentStats = { ...BASE_STATS };

    this.maxLives = BASE_STATS.maxLives;
    this.lives = this.maxLives;
    this.damageTimer = 0;
    this.damageFlashTimer = 0;
    this.isInvincible = false;
    this.boss = null;
    this.bossesDefeated = 0;
    this.bossAnnouncementTimer = 0;

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

    // Show HUD
    document.getElementById("hud")?.classList.remove("hidden");
    document.getElementById("pauseBtn")?.classList.remove("hidden");
    document.getElementById("itemInventory")?.classList.remove("hidden");

    this.updateHUD();
    this.recalculateStats();
    this.updateProgressBar();
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
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("itemInventory")?.classList.add("hidden");

    // Re-init demo animation when returning to start screen
    this.initDemoAnimation();
  }

  pauseGame(): void {
    if (this.gameState !== "PLAYING" && this.gameState !== "BOSS") return;
    console.log("[pauseGame]");
    this.gameState = "PAUSED";
    document.getElementById("pauseScreen")?.classList.remove("hidden");
  }

  resumeGame(): void {
    if (this.gameState !== "PAUSED") return;
    console.log("[resumeGame]");
    this.gameState = "PLAYING";
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

    this.audio.playGameOver();
    this.audio.stopMusic();
    this.audio.triggerHaptic("error");

    const finalScore = Math.floor(this.score);
    oasiz.submitScore(finalScore);
    oasiz.flushGameState();
    console.log("[gameOver] Score submitted:", finalScore);

    // Update game over screen
    const mins = Math.floor(this.survivalTime / 60000);
    const secs = Math.floor((this.survivalTime % 60000) / 1000);
    document.getElementById("finalTime")!.textContent =
      mins + ":" + secs.toString().padStart(2, "0");
    document.getElementById("finalCoins")!.textContent = finalScore.toString();

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
    this.recalculateStats();

    document.getElementById("upgradeScreen")?.classList.add("hidden");

    // Trigger boss every 2 upgrades (up to 6 bosses total)
    // Boss appears after upgrades: 2, 4, 6, 8, 10, 12
    const shouldSpawnBoss =
      this.totalUpgrades % 2 === 0 && this.bossesDefeated < 6;

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

  startBossFight(): void {
    const bossNumber = this.bossesDefeated + 1;
    const bossType =
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
    const progressionMult = 1 + (bossNumber - 1) * 0.3;
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
      phase: 0,
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
    document.getElementById("timeDisplay")!.textContent =
      mins + ":" + secs.toString().padStart(2, "0");
    document.getElementById("coinDisplay")!.textContent = Math.floor(
      this.score,
    ).toString();
    // NOTE: Don't call updateAbilityUI() here - it runs every frame and restarts CSS animations
  }

  getAsteroidsForNextUpgrade(): number {
    // Exponential upgrade requirements to slow down progression
    // Formula: 15 * 1.5^level
    const base = 15;
    const growth = 1.5;
    return Math.floor(base * Math.pow(growth, this.totalUpgrades));
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

    this.currentStats = {
      damage: BASE_STATS.damage * abilityDamageMult * permanentMult,
      fireRateMs:
        BASE_STATS.fireRateMs /
        (fireRateMult * abilityFireRateMult * permanentMult),
      bulletSpeed: BASE_STATS.bulletSpeed * permanentMult,
      moveSpeed: BASE_STATS.moveSpeed * abilityMoveSpeedMult * permanentMult,
      pierce: BASE_STATS.pierce,
      shots: shots + abilityExtraShots,
      spread:
        shots + abilityExtraShots > 1
          ? 8 + (shots + abilityExtraShots - 2) * 4
          : 0,
      maxLives: this.maxLives,
      bulletSize: BASE_STATS.bulletSize,
    };

    // Rebuild turrets based on upgrade
    this.rebuildTurrets();
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
    // Simple display of current upgrade levels in the HUD if needed
    // This replaces the old item inventory UI
    const inventory = document.getElementById("itemInventory");
    if (!inventory) return;

    inventory.innerHTML = "";
    const trees: (keyof UpgradeTree)[] = ["fireRate", "multiShot", "turrets"];
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

  showAbilityScreen(tier: number = 1): void {
    console.log(
      "[showAbilityScreen] Showing tier " + tier + " ability selection",
    );
    this.gameState = "ABILITY_CHOICE";
    this.audio.triggerHaptic("success");

    // Get abilities for this tier (0-indexed array, tier is 1-indexed)
    const tierIndex = Math.min(tier - 1, ABILITY_TIERS.length - 1);
    this.abilityChoices = [...ABILITY_TIERS[tierIndex]];

    // Update the title based on tier
    const titleEl = document.querySelector("#abilityScreen .ability-title");
    const subtitleEl = document.querySelector(
      "#abilityScreen .ability-subtitle",
    );

    const tierNames = [
      "",
      "BOSS DEFEATED!",
      "ELITE BOSS DEFEATED!",
      "CHAMPION DEFEATED!",
      "LEGENDARY BOSS DEFEATED!",
      "MYTHIC BOSS DEFEATED!",
      "FINAL BOSS DEFEATED!",
    ];
    const tierSubtitles = [
      "",
      "Choose your Ultimate Ability",
      "Choose an Enhanced Power",
      "Choose a Powerful Upgrade",
      "Choose an Epic Ability",
      "Choose a Legendary Power",
      "Choose your Final Blessing",
    ];

    if (titleEl) titleEl.textContent = tierNames[tier] || "BOSS DEFEATED!";
    if (subtitleEl)
      subtitleEl.textContent = tierSubtitles[tier] || "Choose your reward";

    const cards = document.querySelectorAll("#abilityScreen .ability-card");

    cards.forEach((card, index) => {
      const ability = this.abilityChoices[index];
      if (!ability) return;

      card.setAttribute("data-ability-id", ability.id);
      card.setAttribute("data-tier", tier.toString());

      const nameEl = card.querySelector(".ability-card-title");
      const descEl = card.querySelector(".ability-card-desc");
      const iconContainer = card.querySelector(".ability-card-icon");
      const chargesEl = card.querySelector(".ability-card-charges");

      if (nameEl) nameEl.textContent = ability.name;
      if (descEl) descEl.textContent = ability.description;
      if (iconContainer)
        iconContainer.innerHTML = this.getAbilityIconSvg(ability.icon);
      if (chargesEl)
        chargesEl.textContent =
          ability.charges + " USE" + (ability.charges > 1 ? "S" : "");
    });

    document.getElementById("abilityScreen")?.classList.remove("hidden");
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
        ][tier - 1] || "Shield",
      blast:
        [
          "Eraser Blast",
          "Eraser Storm",
          "Nuclear Eraser",
          "Black Hole",
          "Eraser Apocalypse",
          "Reality Eraser",
        ][tier - 1] || "Blast",
      turbo:
        [
          "Ink Overdrive",
          "Pencil Fury",
          "Graphite Rush",
          "Ink Explosion",
          "Rainbow Ink",
          "Eternal Ink",
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
          "REFLECT ON!",
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
        const bossDamage = power;
        this.boss.health -= bossDamage;
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

    this.activeAbilities.forEach((ability) => {
      const slot = document.createElement("div");
      slot.className = "ability-slot";

      const isActive =
        this.currentlyActiveAbility?.instanceId === ability.instanceId;
      if (isActive) slot.classList.add("active");

      const isCooldown =
        ability.charges <= 0 && (!isActive || this.abilityDuration <= 0);
      if (isCooldown) slot.classList.add("cooldown");

      const iconType = ability.id.startsWith("shield")
        ? "shield"
        : ability.id.startsWith("blast")
          ? "blast"
          : "turbo";

      const timerHtml =
        isActive && this.abilityDuration > 0
          ? `<div class="timer">${Math.ceil(this.abilityDuration)}s</div>`
          : "";

      slot.innerHTML = `
        <div class="icon">${this.getAbilityIconSvg(iconType)}</div>
        <div class="label">${ability.name.split(" ")[0]}</div>
        ${ability.charges > 0 ? `<div class="ability-indicator">${ability.charges}</div>` : ""}
        ${timerHtml}
      `;

      slot.addEventListener("click", () => {
        if (this.gameState === "PLAYING" || this.gameState === "BOSS") {
          this.triggerAbility(ability.instanceId);
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
    this.damageTimer = 1.5;
    this.damageFlashTimer = 0;

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
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
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

    // Speed increases every 60 seconds
    const newSpeedMult = Math.min(
      2.0,
      1.0 +
        Math.floor(this.survivalTime / CONFIG.SPEED_INCREASE_INTERVAL) * 0.05,
    );
    if (newSpeedMult !== this.speedMultiplier) {
      this.speedMultiplier = newSpeedMult;
      console.log("[updateDifficulty] Speed multiplier:", this.speedMultiplier);
    }

    // Health bonus every 60 seconds
    const newHealthBonus = Math.floor(
      this.survivalTime / CONFIG.HEALTH_INCREASE_INTERVAL,
    );
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

    // Rotation animation (varies by type)
    const rotationSpeeds: Record<BossType, number> = {
      eraser: 0.3,
      paperweight: 0.1,
      inkblot: 0.8,
      rubberband: 0.5,
      stapler: 0.2,
      scissors: 0.4,
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
        this.boss.attackTimer = config.attackDelay;
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
          this.boss.attacksRemaining = config.attacksPerWave;
          this.boss.waveTimer = config.waveInterval;
          this.boss.attackTimer = 0;
          console.log("[updateBoss] " + config.name + " starting attack wave");
        }
      }
    }
  }

  triggerSpecialAbility(): void {
    if (!this.boss) return;
    this.boss.isSpecial = true;
    this.boss.specialTimer = 3000; // Most specials last 3 seconds
    this.boss.phase = 0;

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
      default:
        return "Overdrive";
    }
  }

  updateSpecialAbility(dt: number): void {
    if (!this.boss) return;
    this.boss.specialTimer -= dt * 1000;
    this.boss.phase += dt;

    const config = BOSS_CONFIGS[this.boss.type];

    switch (this.boss.type) {
      case "eraser":
        // Spawn stick men that run around
        if (Math.random() < 0.1) {
          this.spawnBossMinion("stick_man", this.boss.x, this.boss.y, {
            vx: (Math.random() - 0.5) * 10,
            vy: 2 + Math.random() * 2,
            health: 2,
          });
        }
        break;

      case "paperweight": {
        // Periodic shockwaves aimed at the player
        if (
          Math.floor(this.boss.phase * 5) >
          Math.floor((this.boss.phase - dt) * 5)
        ) {
          const aimAngle = Math.atan2(
            this.playerY - this.boss.y,
            this.playerX - this.boss.x,
          );
          this.spawnBossAreaEffect("shockwave", this.boss.x, this.boss.y, {
            radius: 500,
            life: 1.2,
            color: "rgba(100,100,100,0.5)",
            aimAngle: aimAngle,
            arcWidth: Math.PI * 0.4,
          });
          this.triggerScreenShake(5);

          // Spawn small seismic waves in random directions
          const waveCount = 2 + Math.floor(this.boss.phase * 2);
          for (let w = 0; w < waveCount; w++) {
            const dir = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 2;
            const proj = this.spawnBossProjectile("seismic_wave", {
              vx: Math.cos(dir) * speed,
              vy: Math.sin(dir) * speed,
              size: 40,
              color: "rgba(140,120,100,0.8)",
              rotationSpeed: 0,
            });
            if (proj) {
              proj.arcAngle = dir;
              proj.arcSpan = Math.PI * 0.35;
            }
          }
        }
        break;
      }

      case "inkblot":
        // Teleport logic
        if (
          this.boss.specialTimer < 1500 &&
          this.boss.specialTimer + dt * 1000 >= 1500
        ) {
          // Halfway through, teleport
          this.particles.emit(
            this.boss.x,
            this.boss.y,
            BOSS_CONFIGS.inkblot.color,
            20,
            "explosion",
          );
          this.boss.x = Math.random() * (this.w - 100) + 50;
          this.boss.y = Math.random() * 200 + 100;
          // Leave spiders
          for (let i = 0; i < 4; i++) {
            this.spawnBossMinion("ink_spider", this.boss.x, this.boss.y, {
              health: 1,
            });
          }
        }
        break;

      case "rubberband":
        // Tether effect
        if (
          Math.floor(this.boss.phase * 10) >
          Math.floor((this.boss.phase - dt) * 10)
        ) {
          this.spawnBossAreaEffect("gravity_well", this.boss.x, this.boss.y, {
            radius: 400,
            life: 0.2,
            color: "rgba(196,165,116,0.3)",
          });
        }
        break;

      case "stapler":
        // Rain staples from top
        if (Math.random() < 0.3) {
          this.spawnBossProjectile("staple", {
            vx: 0,
            vy: 6,
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
        const waveR = proj.size + proj.age * 20;
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
      ef.life -= dt;
      if (ef.life <= 0) {
        ef.active = false;
        this.bossAreaEffects.splice(i, 1);
        continue;
      }

      // Check player interaction with area effects
      const dist = distance(this.playerX, this.playerY, ef.x, ef.y);

      switch (ef.type) {
        case "ink_puddle":
          if (dist < ef.radius) {
            this.playerVelocityX *= 0.5; // Slow down
            this.playerVelocityY *= 0.5;
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
          // Check line collision
          if (
            ef.x2 !== undefined &&
            ef.y2 !== undefined &&
            this.damageTimer <= 0 &&
            !this.isInvincible
          ) {
            const d = this.distToSegment(
              this.playerX,
              this.playerY,
              ef.x,
              ef.y,
              ef.x2,
              ef.y2,
            );
            if (d < 15) {
              this.eventBus.emit("PLAYER_HIT");
              this.audio.triggerHaptic("error");
            }
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
          bullet.active = false;
          this.bulletPool.release(bullet);
          this.bullets.splice(i, 1);

          if (m.health <= 0) {
            m.active = false;
            this.particles.emit(m.x, m.y, CONFIG.PENCIL_DARK, 10, "explosion");
            this.score += 500;
          }
          break;
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
    const moveSpeed = 2;
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
        const circleSpeed = 1.5;
        this.boss.x =
          this.w / 2 +
          Math.cos(this.boss.movePhase * circleSpeed) * circleRadius;
        this.boss.y =
          this.boss.targetY +
          Math.sin(this.boss.movePhase * circleSpeed) * (circleRadius * 0.5);
        break;
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

    // Special ability: ink puddle or spider every 3rd attack
    if (this.boss.totalAttacks % 3 === 0) {
      if (Math.random() > 0.5) {
        this.spawnBossAreaEffect("ink_puddle", this.playerX, this.playerY, {
          radius: 80,
          life: 5,
          color: BOSS_CONFIGS.inkblot.color,
        });
        this.floatingText.add(
          this.playerX,
          this.playerY - 20,
          "INK PUDDLE!",
          "#2a2a4a",
          1.5,
        );
      } else {
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
    }

    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const baseAngle = Math.atan2(dy, dx);
    const speed = 3.2;

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
          const waveR = proj.size + proj.age * 20;

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
      ctx.globalAlpha = opacity;

      switch (ef.type) {
        case "ink_puddle":
          ctx.fillStyle = ef.color;
          ctx.beginPath();
          // Irregular puddle
          for (let j = 0; j < 12; j++) {
            const a = (j / 12) * Math.PI * 2;
            const r = ef.radius * (0.8 + Math.sin(j * 1.7) * 0.2);
            if (j === 0)
              ctx.moveTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
            else ctx.lineTo(ef.x + Math.cos(a) * r, ef.y + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
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
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(ef.x, ef.y);
            ctx.lineTo(ef.x2, ef.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            // Flash effect
            if (ef.life > ef.maxLife - 0.2) {
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

      const dist = distance(bullet.x, bullet.y, this.boss.x, this.boss.y);
      if (dist < CONFIG.BOSS_RADIUS) {
        const snowballMult = bullet.snowball
          ? 1 + Math.min(1, bullet.age / 1.2) * (bullet.snowballMax - 1)
          : 1;
        const damage = bullet.damage * snowballMult;
        bullet.active = false;
        this.bulletPool.release(bullet);
        this.bullets.splice(i, 1);
        this.boss.health -= damage;

        // Visual feedback
        this.particles.emit(bullet.x, bullet.y, CONFIG.PENCIL_DARK, 5, "spark");

        this.audio.playHit();
        this.triggerScreenShake(2);

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
    const wasFirstBoss = this.bossesDefeated === 0;
    this.bossesDefeated++;

    // Clear boss asteroids and projectiles
    this.asteroids.forEach((a) => {
      if (a.isBossAsteroid) a.active = false;
    });
    this.bossProjectiles = [];

    // Show victory and resume playing
    this.audio.playUpgrade();
    this.audio.switchToNormalMusic();
    this.audio.triggerHaptic("success");
    this.triggerScreenShake(15);

    // Resume normal gameplay after a short delay
    setTimeout(() => {
      // Show ability selection after EVERY boss (tier = boss number)
      console.log(
        "[defeatBoss] Boss #" +
          bossNumber +
          " - showing tier " +
          bossNumber +
          " ability selection",
      );
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
        (CONFIG.SPAWN_INTERVAL_START - this.survivalTime * 0.02) *
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
    const baseRadius = CONFIG.BOSS_RADIUS;
    const pulseScale = 1 + Math.sin(this.boss.pulsePhase) * 0.03;
    const radius = baseRadius * pulseScale;
    const config = BOSS_CONFIGS[this.boss.type];

    ctx.save();
    ctx.translate(x, y);

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
    ctx.rotate(this.boss!.rotation * 0.3);

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
    const leverAngle = Math.sin(this.boss!.pulsePhase * 2) * 0.15;
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
    const openAngle = 0.3 + Math.abs(Math.sin(this.boss!.pulsePhase * 2)) * 0.4;

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

    // Left eye
    ctx.fillStyle = "#ffffff";
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
    ctx.fillStyle = "#000000";
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
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x2, y2, eyeSize, eyeSize * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Right pupil
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(
      x2 + Math.cos(angle) * 3,
      y2 + Math.sin(angle) * 2,
      pupilSize,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Angry eyebrows
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - eyeSize, y1 - eyeSize);
    ctx.lineTo(x1 + eyeSize * 0.5, y1 - eyeSize * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2 + eyeSize, y2 - eyeSize);
    ctx.lineTo(x2 - eyeSize * 0.5, y2 - eyeSize * 0.5);
    ctx.stroke();
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

    // Health fill
    const healthColor =
      healthPercent > 0.5
        ? "#44cc44"
        : healthPercent > 0.25
          ? "#cccc44"
          : "#cc4444";
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
