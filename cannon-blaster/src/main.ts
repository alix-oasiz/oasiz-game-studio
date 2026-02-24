/**
 * CANNON BLASTER
 *
 * A cannon defense game with falling boulders,
 * splitting mechanics, and roguelike upgrades.
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Cannon (simple position-based)
  CANNON_WHEEL_RADIUS: 24,
  CANNON_BODY_WIDTH: 80,
  CANNON_BODY_HEIGHT: 28,
  CANNON_BARREL_LENGTH: 50,
  CANNON_BARREL_WIDTH: 18,
  CANNON_MAX_SPEED: 1200, // Increased for much snappier direct follow
  CANNON_ACCELERATION: 3500, // Also boosted for keyboard
  CANNON_FRICTION: 8,

  // Bullets
  BULLET_SPEED: 14,
  BULLET_RADIUS: 5,
  BULLET_POOL_SIZE: 100,
  BASE_FIRE_INTERVAL: 350, // ms between shots

  // Boulders
  BOULDER_POOL_SIZE: 50,
  BOULDER_SIZES: {
    large: { radius: 75, health: 1, points: 30 }, // Scaled up from 42
    medium: { radius: 50, health: 1, points: 15 }, // Scaled up from 28
    small: { radius: 30, health: 1, points: 5 }, // Much larger than 16
  },
  BOULDER_GRAVITY: 0.12,
  BOULDER_BOUNCE: 0.82,
  BOULDER_SPAWN_INTERVAL_START: 2800, // Slightly slower start
  BOULDER_SPAWN_INTERVAL_MIN: 1000, // Slower min interval
  BOULDER_HEALTH_INCREASE_INTERVAL: 36, // Destructions before health increases

  // Particles
  PARTICLE_POOL_SIZE: 300,

  // Upgrades
  UPGRADE_BASE_COUNT: 12,

  // Colors
  BG_TOP: "#1a2530",
  BG_BOTTOM: "#0d1520",
  GROUND_COLOR: "#2a3a30",
  BOULDER_FILL: "#4a3a30",
  BOULDER_STROKE: "#6a5a4a",
  BULLET_COLOR: "#ffd54f",
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "UPGRADE" | "PAUSED" | "GAME_OVER";
type BoulderSize = "large" | "medium" | "small";
type SkillTreeCategory = "fire" | "utility" | "defense";

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierceRemaining: number;
  explosive: boolean;
  active: boolean;
}

interface Boulder {
  id: number;
  size: BoulderSize;
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
  hasHitGround: boolean; // For bonus point logic
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
  type: "spark" | "debris" | "explosion";
  rotation: number;
  rotationSpeed: number;
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

// ============= EVENT BUS =============
class EventBus {
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
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
    initialSize: number = 0
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
}

// ============= AUDIO MANAGER =============
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private initialized = false;
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

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.masterGain);

      // Setup music element
      this.music = new Audio("https://assets.oasiz.ai/audio/tank-song.mp3");
      this.music.loop = true;
      this.music.crossOrigin = "anonymous";
      
      this.musicSource = this.ctx.createMediaElementSource(this.music);
      this.musicSource.connect(this.musicGain);

      this.initialized = true;
      console.log("[AudioManager.init] Audio context and music initialized");
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  playMusic(): void {
    if (!this.music || !this.settings.music) return;
    this.music.play().catch(e => console.warn("[AudioManager.playMusic] Failed:", e));
  }

  stopMusic(): void {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
  }

  updateSettings(): void {
    if (this.music) {
      if (this.settings.music) {
        // If music was off and now on, we might want to start it if in game
        // but for now just handle the pause/unpause if already playing
      } else {
        this.music.pause();
      }
    }
  }

  playShoot(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playHit(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDestroy(size: BoulderSize): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const baseFreq = size === "large" ? 60 : size === "medium" ? 100 : 180;

    // Noise burst for rock breaking
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = baseFreq * 6;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  playUpgrade(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const notes = [392, 523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.25);
    });
  }

  playGameOver(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  triggerHaptic(type: string): void {
    if (!this.settings.haptics) return;
    if (
      typeof (window as unknown as { triggerHaptic: (t: string) => void })
        .triggerHaptic === "function"
    ) {
      (
        window as unknown as { triggerHaptic: (t: string) => void }
      ).triggerHaptic(type);
    }
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
      CONFIG.PARTICLE_POOL_SIZE
    );
  }

  emit(
    x: number,
    y: number,
    color: string,
    count: number,
    type: Particle["type"] = "spark"
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      const angle = Math.random() * Math.PI * 2;
      const speed =
        type === "explosion" ? 4 + Math.random() * 6 : 2 + Math.random() * 4;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1;
      p.maxLife = 1;
      p.size =
        type === "debris"
          ? 6 + Math.random() * 10
          : type === "explosion"
            ? 5 + Math.random() * 7
            : 3 + Math.random() * 4;
      p.color = color;
      p.type = type;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.4;
      this.particles.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.15 * dt * 60;
      p.rotation += p.rotationSpeed * dt * 60;
      p.life -= (p.type === "debris" ? 0.018 : 0.03) * dt * 60;

      if (p.life <= 0) {
        this.pool.release(p);
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.9;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.type === "debris") {
        // Rock debris
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size * p.life;
        ctx.moveTo(-s / 2, -s / 3);
        ctx.lineTo(s / 2, -s / 4);
        ctx.lineTo(s / 3, s / 3);
        ctx.lineTo(-s / 3, s / 2);
        ctx.closePath();
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
    size: number = 20
  ): void {
    this.texts.push({ x, y, text, life: 1, color, size });
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 50 * dt;
      t.life -= 0.025 * dt * 60;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const t of this.texts) {
      ctx.save();
      ctx.globalAlpha = t.life;
      ctx.font =
        "900 " +
        t.size * easeOutBack(Math.min(1, (1 - t.life) * 3 + 0.3)) +
        "px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillText(t.text, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  clear(): void {
    this.texts = [];
  }
}

// ============= SKILL TREE DEFINITIONS =============
interface SkillNode {
  id: string;
  name: string;
  desc: string;
  requires: string | null; // ID of required skill, null if root
  tree: "fire" | "utility" | "defense";
  tier: number; // 1, 2, 3, or 4
  sibling: string | null; // Mutually exclusive sibling (choosing one locks the other)
}

const SKILL_TREE: SkillNode[] = [
  // FIRE RATE TREE - Linear choices at each tier
  { id: "f1", name: "Quick Fire", desc: "+25% fire rate", requires: null, tree: "fire", tier: 1, sibling: null },
  { id: "f2a", name: "Rapid Fire", desc: "+50% fire rate", requires: "f1", tree: "fire", tier: 2, sibling: "f2b" },
  { id: "f2b", name: "Heavy Rounds", desc: "2 damage per bullet", requires: "f1", tree: "fire", tier: 2, sibling: "f2a" },
  { id: "f3a", name: "Gatling", desc: "+80% fire rate", requires: "f2a", tree: "fire", tier: 3, sibling: null },
  { id: "f3b", name: "Armor Piercing", desc: "3 damage per bullet", requires: "f2b", tree: "fire", tier: 3, sibling: null },
  { id: "f4a", name: "Bullet Storm", desc: "+100% fire rate", requires: "f3a", tree: "fire", tier: 4, sibling: null },
  { id: "f4b", name: "Explosive Rounds", desc: "Explosions on hit", requires: "f3b", tree: "fire", tier: 4, sibling: null },

  // UTILITY TREE
  { id: "u1", name: "Double Barrel", desc: "Fire 2 bullets", requires: null, tree: "utility", tier: 1, sibling: null },
  { id: "u2a", name: "Spread Shot", desc: "Fire 3 bullets, wide", requires: "u1", tree: "utility", tier: 2, sibling: "u2b" },
  { id: "u2b", name: "Pierce Shot", desc: "Pierce 1 boulder", requires: "u1", tree: "utility", tier: 2, sibling: "u2a" },
  { id: "u3a", name: "Barrage", desc: "Fire 5 bullets", requires: "u2a", tree: "utility", tier: 3, sibling: null },
  { id: "u3b", name: "Full Pierce", desc: "Pierce all boulders", requires: "u2b", tree: "utility", tier: 3, sibling: null },
  { id: "u4a", name: "Wall of Lead", desc: "Fire 8 bullets, 60deg", requires: "u3a", tree: "utility", tier: 4, sibling: null },
  { id: "u4b", name: "Rail Gun", desc: "Pierce all, 5 damage", requires: "u3b", tree: "utility", tier: 4, sibling: null },

  // DEFENSE TREE
  { id: "d1", name: "Reinforced Hull", desc: "Survive 1 hit", requires: null, tree: "defense", tier: 1, sibling: null },
  { id: "d2a", name: "Shield Regen", desc: "Recharge after 10s", requires: "d1", tree: "defense", tier: 2, sibling: "d2b" },
  { id: "d2b", name: "Kill Repair", desc: "5 kills restore shield", requires: "d1", tree: "defense", tier: 2, sibling: "d2a" },
  { id: "d3a", name: "Energy Shield", desc: "Absorb 2 hits", requires: "d2a", tree: "defense", tier: 3, sibling: null },
  { id: "d3b", name: "Fast Repair", desc: "3 kills restore", requires: "d2b", tree: "defense", tier: 3, sibling: null },
  { id: "d4a", name: "Fortress", desc: "Absorb 3 hits", requires: "d3a", tree: "defense", tier: 4, sibling: null },
  { id: "d4b", name: "Phoenix", desc: "Revive once per game", requires: "d3b", tree: "defense", tier: 4, sibling: null },
];

// Helper to get skill by ID
function getSkill(id: string): SkillNode | undefined {
  return SKILL_TREE.find((s) => s.id === id);
}

// Get available upgrades (ones that can be purchased right now)
function getAvailableUpgrades(owned: Set<string>, locked: Set<string>): SkillNode[] {
  return SKILL_TREE.filter((skill) => {
    // Already owned
    if (owned.has(skill.id)) return false;
    // Branch is locked
    if (locked.has(skill.id)) return false;
    // Check prerequisite
    if (skill.requires === null) return true;
    return owned.has(skill.requires);
  });
}

// ============= DEMO ANIMATION TYPES =============
interface DemoBullet {
  x: number;
  y: number;
  vy: number;
}

interface DemoBoulder {
  x: number;
  y: number;
  vy: number;
  radius: number;
  rotation: number;
  health: number;
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
class CannonBlasterGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gameContainer: HTMLElement;
  eventBus: EventBus;

  // Systems
  particles: ParticleSystem;
  floatingText: FloatingTextSystem;
  audio: AudioManager;

  // Simple cannon state (no physics engine needed)
  cannonX: number = 0;
  cannonVx: number = 0;
  wheelRotation: number = 0;

  // Pools
  bulletPool: ObjectPool<Bullet>;
  boulderPool: ObjectPool<Boulder>;

  // Active entities
  bullets: Bullet[] = [];
  boulders: Boulder[] = [];

  // Game state
  gameState: GameState = "START";
  score: number = 0;
  totalDestroyed: number = 0;
  destroyedSinceUpgrade: number = 0;
  upgradesEarned: number = 0;

  // Timers
  fireTimer: number = 0;
  spawnTimer: number = 0;

  // Skill Tree Upgrades
  ownedUpgrades: Set<string> = new Set();
  lockedBranches: Set<string> = new Set(); // Branches locked by sibling choices
  upgradePoints: number = 0; // Points available to spend
  
  // Defense/Shield state
  shieldHits: number = 0;
  maxShieldHits: number = 0;
  shieldRechargeTimer: number = 0;
  killsSinceShieldLost: number = 0;
  invincibilityTimer: number = 0;
  hasRevived: boolean = false;

  // Layout
  w: number = 0;
  h: number = 0;
  isMobile: boolean = false;
  groundY: number = 0;

  // Screen shake
  screenShake: { x: number; y: number; intensity: number } = {
    x: 0,
    y: 0,
    intensity: 0,
  };

  // Input
  keysDown: Set<string> = new Set();
  touchCurrentX: number | null = null;
  isDragging: boolean = false;
  isFiring: boolean = false;

  // Settings
  settings: Settings;

  // Timing
  lastTime: number = 0;
  boulderIdCounter: number = 0;
  
  // Track if player selected an upgrade this round
  hasSelectedUpgrade: boolean = false;
  selectedNodeId: string | null = null; // Currently selected for preview

  // Demo animation
  demoCanvas: HTMLCanvasElement | null = null;
  demoCtx: CanvasRenderingContext2D | null = null;
  demoCannonX: number = 0;
  demoCannonDir: number = 1;
  demoBullets: DemoBullet[] = [];
  demoBoulders: DemoBoulder[] = [];
  demoParticles: DemoParticle[] = [];
  demoFireTimer: number = 0;
  demoSpawnTimer: number = 0;

  // Environment
  mountains: { x: number; w: number; h: number }[] = [];
  distantBase: { x: number; w: number; h: number }[] = [];
  stars: { x: number; y: number; s: number; o: number }[] = [];
  shootingStars: { x: number; y: number; vx: number; vy: number; life: number; len: number }[] = [];
  nebulae: { x: number; y: number; r: number; c: string }[] = [];
  lastShootingStarTime: number = 0;

  constructor() {
    console.log("[CannonBlasterGame] Initializing");

    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.gameContainer = document.getElementById("game-container")!;

    this.eventBus = new EventBus();
    this.particles = new ParticleSystem();
    this.floatingText = new FloatingTextSystem();

    // Load settings
    this.settings = {
      music: localStorage.getItem("cannonBlaster_music") !== "false",
      fx: localStorage.getItem("cannonBlaster_fx") !== "false",
      haptics: localStorage.getItem("cannonBlaster_haptics") !== "false",
    };

    this.audio = new AudioManager(this.settings);

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Initialize environment
    this.initEnvironment();

    // Initialize demo canvas
    this.demoCanvas = document.getElementById(
      "demoCanvas"
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
        active: false,
      }),
      (b) => {
        b.active = false;
      },
      CONFIG.BULLET_POOL_SIZE
    );

    this.boulderPool = new ObjectPool<Boulder>(
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
        hasHitGround: false,
      }),
      (b) => {
        b.active = false;
        b.hasHitGround = false;
      },
      CONFIG.BOULDER_POOL_SIZE
    );

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

    // Touch
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.gameState === "PLAYING") {
        this.isDragging = true;
        this.touchCurrentX = this.getRelativeX(e.touches[0].clientX);
      }
    });

    window.addEventListener("touchmove", (e) => {
      if (this.isDragging && this.gameState === "PLAYING") {
        this.touchCurrentX = this.getRelativeX(e.touches[0].clientX);
      }
    }, { passive: false });

    window.addEventListener("touchend", () => {
      this.isDragging = false;
      this.touchCurrentX = null;
    });

    // Mouse
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.gameState === "PLAYING" && !this.isMobile) {
        this.isDragging = true;
        this.touchCurrentX = this.getRelativeX(e.clientX);
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isDragging && this.gameState === "PLAYING" && !this.isMobile) {
        this.touchCurrentX = this.getRelativeX(e.clientX);
      }
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.touchCurrentX = null;
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

    // Install / Continue button
    document.getElementById("installBtn")?.addEventListener("click", () => {
      if (this.hasSelectedUpgrade) {
        this.audio.triggerHaptic("light");
        this.continueFromUpgrade();
      } else if (this.selectedNodeId) {
        this.installUpgrade();
      }
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
        "cannonBlaster_" + settingKey,
        this.settings[settingKey].toString()
      );
      this.audio.triggerHaptic("light");
      
      // Update audio music state if it was the music setting
      if (settingKey === "music") {
        if (this.settings.music && this.gameState === "PLAYING") {
          this.audio.playMusic();
        } else if (!this.settings.music) {
          this.audio.stopMusic();
        }
      }
    });
  }

  setupGameEvents(): void {
    this.eventBus.on("BOULDER_DESTROYED", (data) => {
      const { boulder, points } = data as { boulder: Boulder; points: number };
      console.log("[Event] BOULDER_DESTROYED", boulder.size, "points:", points);

      let finalPoints = points;
      let airborneBonus = false;

      // Airborne bonus: destroy sub-boulder (medium or small) before it hits the ground
      if (boulder.size !== "large" && !boulder.hasHitGround) {
        airborneBonus = true;
        finalPoints += Math.ceil(points * 0.5); // 50% bonus
      }

      this.score += finalPoints;
      this.totalDestroyed++;
      this.destroyedSinceUpgrade++;

      this.audio.playDestroy(boulder.size);
      this.audio.triggerHaptic(airborneBonus ? "success" : boulder.size === "large" ? "heavy" : "medium");

      // Particles
      this.particles.emit(boulder.x, boulder.y, "#8a7a6a", 10, "debris");
      this.particles.emit(boulder.x, boulder.y, "#ffa500", 6, "explosion");

      // Floating text
      this.floatingText.add(boulder.x, boulder.y, "+" + finalPoints, airborneBonus ? "#44ff88" : "#ffd54f", airborneBonus ? 28 : 22);
      if (airborneBonus) {
        this.floatingText.add(boulder.x, boulder.y - 30, "AIRBORNE BONUS!", "#44ff88", 14);
      }

      // Screen shake
      const intensity =
        boulder.size === "large"
          ? 0.6
          : boulder.size === "medium"
            ? 0.35
            : 0.15;
      this.triggerScreenShake(intensity);

      // Kill-based shield restoration (Emergency Repair path)
      if (this.shieldHits < this.maxShieldHits) {
        this.killsSinceShieldLost++;
        
        // Determine kills needed based on upgrades
        let killsNeeded = 99999;
        if (this.ownedUpgrades.has("d4c")) killsNeeded = 5; // Regeneration
        else if (this.ownedUpgrades.has("d3c")) killsNeeded = 8; // Auto Repair
        else if (this.ownedUpgrades.has("d2b")) killsNeeded = 5; // Emergency Repair (base)

        if (this.killsSinceShieldLost >= killsNeeded) {
          this.shieldHits = this.maxShieldHits;
          this.killsSinceShieldLost = 0;
          this.floatingText.add(this.cannonX, this.groundY - 100, "SHIELD RESTORED", "#44ff88", 18);
          this.audio.triggerHaptic("success");
        }
      }

      // Check for upgrade
      this.updateProgressBar();
      const needed = this.getDestructionsNeededForNextUpgrade();
      if (this.destroyedSinceUpgrade >= needed) {
        const available = getAvailableUpgrades(this.ownedUpgrades, this.lockedBranches);
        if (available.length === 0) {
          console.log("[Game] No upgrades available, skipping upgrade screen");
          this.destroyedSinceUpgrade = 0;
          this.updateProgressBar();
        } else {
          console.log(
            "[Game] Triggering upgrade after",
            this.destroyedSinceUpgrade,
            "destructions (needed " + needed + ")"
          );
          this.showUpgradeScreen();
        }
      }
    });

    this.eventBus.on("BOULDER_HIT", (data) => {
      const { boulder } = data as { boulder: Boulder };
      this.audio.playHit();
      this.audio.triggerHaptic("light");
      boulder.hitFlash = 0.15;
      this.particles.emit(boulder.x, boulder.y, "#ffcc00", 3, "spark");
    });

    this.eventBus.on("PLAYER_HIT", () => {
      console.log("[Event] PLAYER_HIT");
      
      // Check invincibility
      if (this.invincibilityTimer > 0) {
        console.log("[Event] Player invincible, ignoring hit");
        return;
      }

      // Check shield
      if (this.shieldHits > 0) {
        this.shieldHits--;
        this.invincibilityTimer = 1000; // 1 second of grace period after any hit
        console.log("[Event] Shield absorbed hit, remaining:", this.shieldHits);
        this.audio.triggerHaptic("medium");
        this.triggerScreenShake(0.4);
        this.floatingText.add(this.cannonX, this.groundY - 80, "SHIELD HIT", "#ffaa00", 16);
        
        // Second Wind - longer invincibility when shield breaks
        if (this.shieldHits === 0 && this.ownedUpgrades.has("d3d")) {
          this.invincibilityTimer = 2000; // 2 seconds
          this.floatingText.add(this.cannonX, this.groundY - 100, "SECOND WIND!", "#44ff88", 20);
        }
        return;
      }

      // Phoenix Protocol - revive once
      if (!this.hasRevived && this.ownedUpgrades.has("d4d")) {
        this.hasRevived = true;
        this.shieldHits = this.maxShieldHits;
        this.invincibilityTimer = 3000;
        this.floatingText.add(this.cannonX, this.groundY - 100, "PHOENIX PROTOCOL!", "#ff4444", 24);
        this.audio.triggerHaptic("success");
        this.triggerScreenShake(0.8);
        return;
      }

      // Game over
      console.log("[Event] No defenses remaining - Game Over");
      this.gameOver();
    });
  }

  resizeCanvas(): void {
    this.w = this.gameContainer.clientWidth;
    this.h = this.gameContainer.clientHeight;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.groundY = this.h - 50;

    console.log("[resizeCanvas]", this.w, "x", this.h);
  }

  // Helper to get position relative to game container
  getRelativeX(clientX: number): number {
    const rect = this.gameContainer.getBoundingClientRect();
    return clientX - rect.left;
  }

  resetCannon(): void {
    console.log("[resetCannon] Resetting cannon position");
    this.cannonX = this.w / 2;
    this.cannonVx = 0;
    this.wheelRotation = 0;
  }

  startGame(): void {
    console.log("[startGame] Starting game");

    this.audio.init();
    this.audio.playMusic();
    this.gameState = "PLAYING";
    
    // Reset state
    this.score = 0;
    this.totalDestroyed = 0;
    this.destroyedSinceUpgrade = 0;
    this.upgradesEarned = 0;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    
    // Reset skill tree
    this.ownedUpgrades = new Set();
    this.lockedBranches = new Set();
    this.upgradePoints = 0;
    this.hasSelectedUpgrade = false;
    this.selectedNodeId = null;
    
    // Reset defense state
    this.shieldHits = 0;
    this.maxShieldHits = 0;
    this.shieldRechargeTimer = 0;
    this.killsSinceShieldLost = 0;
    this.invincibilityTimer = 0;
    this.hasRevived = false;

    // Clear entities
    for (const b of this.bullets) this.bulletPool.release(b);
    this.bullets = [];
    for (const b of this.boulders) this.boulderPool.release(b);
    this.boulders = [];
    this.particles.clear();
    this.floatingText.clear();

    // Reset cannon
    this.resetCannon();

    // Hide screens
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");

    // Show HUD parts
    document.getElementById("hud")?.classList.remove("hidden");
    document.getElementById("pauseBtn")?.classList.remove("hidden");

    this.updateHUD();
    this.updateProgressBar();
    this.updateUpgradeDots();
  }

  showStartScreen(): void {
    console.log("[showStartScreen]");
    this.gameState = "START";

    document.getElementById("startScreen")?.classList.remove("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");

    this.initDemoAnimation();
  }

  pauseGame(): void {
    if (this.gameState !== "PLAYING") return;
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
    console.log("[gameOver] Score:", this.score, "Destroyed:", this.totalDestroyed);
    this.gameState = "GAME_OVER";

    this.audio.stopMusic();
    this.audio.playGameOver();
    this.audio.triggerHaptic("error");

    // Submit score
    if (
      typeof (window as unknown as { submitScore: (s: number) => void })
        .submitScore === "function"
    ) {
      (window as unknown as { submitScore: (s: number) => void }).submitScore(
        this.score
      );
      console.log("[gameOver] Score submitted:", this.score);
    }

    // Update game over screen
    document.getElementById("finalScore")!.textContent = this.score.toString();
    document.getElementById("finalDestroyed")!.textContent =
      this.totalDestroyed.toString();

    // Count upgrades per tree
    const fireCount = SKILL_TREE.filter((s) => s.tree === "fire" && this.ownedUpgrades.has(s.id)).length;
    const utilityCount = SKILL_TREE.filter((s) => s.tree === "utility" && this.ownedUpgrades.has(s.id)).length;
    const defenseCount = SKILL_TREE.filter((s) => s.tree === "defense" && this.ownedUpgrades.has(s.id)).length;

    document.getElementById("summaryRate")!.textContent = fireCount.toString();
    document.getElementById("summaryPower")!.textContent = utilityCount.toString();
    document.getElementById("summaryMulti")!.textContent = defenseCount.toString();

    // Show screen
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.remove("hidden");
  }

  showUpgradeScreen(): void {
    console.log("[showUpgradeScreen]");
    this.gameState = "UPGRADE";
    this.hasSelectedUpgrade = false;
    this.selectedNodeId = null;
    this.upgradePoints = 1;

    // Reset details panel
    this.updateDetailsPanel(null);

    // Render the schematic
    this.renderSchematic();

    // Safety net: if no upgrades are purchasable, let the player continue immediately
    const available = getAvailableUpgrades(this.ownedUpgrades, this.lockedBranches);
    if (available.length === 0) {
      console.log("[showUpgradeScreen] No upgrades available — enabling skip");
      this.hasSelectedUpgrade = true;
      const installBtn = document.getElementById("installBtn");
      if (installBtn) {
        installBtn.textContent = "All Systems Maxed - Continue";
        installBtn.classList.add("active");
      }
    }

    document.getElementById("upgradeScreen")?.classList.remove("hidden");
  }

  renderSchematic(): void {
    const pillars: Record<string, HTMLElement | null> = {
      fire: document.getElementById("pillarFire"),
      utility: document.getElementById("pillarUtility"),
      defense: document.getElementById("pillarDefense"),
    };

    // Clear pillars
    Object.values(pillars).forEach(p => { if (p) p.innerHTML = ""; });

    // Group all skills by tree and tier for layout
    const treeSkills: Record<string, Record<number, SkillNode[]>> = {
      fire: {}, utility: {}, defense: {}
    };

    SKILL_TREE.forEach(skill => {
      if (!treeSkills[skill.tree][skill.tier]) treeSkills[skill.tree][skill.tier] = [];
      treeSkills[skill.tree][skill.tier].push(skill);
    });

    // Render each tree
    ["fire", "utility", "defense"].forEach(treeName => {
      const pillarEl = pillars[treeName];
      if (!pillarEl) return;

      const tiers = Object.keys(treeSkills[treeName]).map(Number).sort((a, b) => a - b);
      
      tiers.forEach(tier => {
        const skillsInTier = treeSkills[treeName][tier];
        const tierGroup = document.createElement("div");
        tierGroup.className = "branch-group";

        skillsInTier.forEach(skill => {
          const node = document.createElement("div");
          node.className = "node";
          node.setAttribute("data-id", skill.id);
          
          const icon = document.createElement("div");
          icon.className = "node-icon";
          icon.textContent = skill.tree[0].toUpperCase();
          node.appendChild(icon);

          // Determine state
          const isOwned = this.ownedUpgrades.has(skill.id);
          const isLocked = this.lockedBranches.has(skill.id);
          const isAvailable = this.canPurchase(skill.id);
          const isSelected = this.selectedNodeId === skill.id;

          // Discovery / Fog of War Logic
          // Show if: owned, available, locked branch (to show what was missed), 
          // or if prerequisite is owned (discovery).
          let isFog = true;
          if (isOwned || isLocked || isAvailable) {
            isFog = false;
          } else if (skill.requires === null) {
            // Tier 1 is always visible
            isFog = false;
          } else if (this.ownedUpgrades.has(skill.requires)) {
            // Direct child of owned node is visible
            isFog = false;
          }

          if (isOwned) node.classList.add("owned");
          else if (isSelected) node.classList.add("selected");
          else if (isAvailable) node.classList.add("available");
          else if (isLocked) node.classList.add("locked-branch");
          else if (isFog) node.classList.add("fog");

          // Click handler
          node.addEventListener("click", () => {
            if (isFog || isLocked || isOwned) return;
            this.previewUpgrade(skill.id);
          });

          tierGroup.appendChild(node);
        });

        pillarEl.appendChild(tierGroup);
      });
    });

    // Update Install button state
    const installBtn = document.getElementById("installBtn");
    if (installBtn) {
      if (this.selectedNodeId && !this.hasSelectedUpgrade) {
        installBtn.classList.add("active");
      } else {
        installBtn.classList.remove("active");
      }
    }
  }

  previewUpgrade(skillId: string): void {
    console.log("[previewUpgrade]", skillId);
    this.selectedNodeId = skillId;
    this.audio.triggerHaptic("light");
    
    const skill = getSkill(skillId);
    this.updateDetailsPanel(skill || null);
    this.renderSchematic();
  }

  updateDetailsPanel(skill: SkillNode | null): void {
    const nameEl = document.getElementById("detailsName");
    const tierEl = document.getElementById("detailsTier");
    const descEl = document.getElementById("detailsDesc");
    const warningEl = document.getElementById("detailsWarning");
    const detailsPanel = document.getElementById("moduleDetails");

    if (!skill) {
      if (nameEl) nameEl.textContent = "SELECT MODULE";
      if (tierEl) tierEl.textContent = "SYSTEM READY";
      if (descEl) descEl.textContent = "Select an available module to view technical specifications.";
      if (warningEl) warningEl.style.display = "none";
      if (detailsPanel) {
        detailsPanel.style.borderLeftColor = "#5a7a8a";
        detailsPanel.style.removeProperty("--p-color");
      }
      return;
    }

    // Set theme color based on tree
    const treeColors: Record<string, string> = { fire: "#ffaa00", utility: "#00ccff", defense: "#44ff88" };
    if (detailsPanel) {
      detailsPanel.style.borderLeftColor = treeColors[skill.tree];
      detailsPanel.style.setProperty("--p-color", treeColors[skill.tree]);
    }

    if (nameEl) nameEl.textContent = skill.name;
    if (tierEl) tierEl.textContent = "CLASS " + skill.tier + " " + skill.tree.toUpperCase() + " SYSTEM";
    
    // Cleaner, more readable description
    if (descEl) descEl.textContent = skill.desc;
    
    if (warningEl) {
      if (skill.sibling) {
        const sibling = getSkill(skill.sibling);
        warningEl.textContent = "LOCKOUT WARNING: Installing this will offline " + (sibling?.name || "alternate branch") + ".";
        warningEl.style.display = "block";
      } else {
        warningEl.style.display = "none";
      }
    }
  }

  installUpgrade(): void {
    if (!this.selectedNodeId || this.hasSelectedUpgrade) return;
    
    const skillId = this.selectedNodeId;
    const skill = getSkill(skillId);
    if (!skill) return;

    console.log("[installUpgrade]", skillId);
    
    // Purchase!
    this.ownedUpgrades.add(skillId);
    this.upgradePoints--;
    this.hasSelectedUpgrade = true;
    this.upgradesEarned++;

    // Lock sibling
    if (skill.sibling) {
      this.lockedBranches.add(skill.sibling);
      this.lockDownstream(skill.sibling);
    }

    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");

    // Apply effects
    this.applyUpgradeEffects(skillId);

    // Update UI
    this.renderSchematic();
    this.updateUpgradeDots();
    
    // Change button to Continue
    const installBtn = document.getElementById("installBtn");
    if (installBtn) {
      installBtn.textContent = "Upgrade Installed - Continue";
      installBtn.classList.add("active");
    }
  }

  canPurchase(skillId: string): boolean {
    const skill = getSkill(skillId);
    if (!skill) return false;
    if (this.upgradePoints <= 0) return false;
    if (this.ownedUpgrades.has(skillId)) return false;
    if (this.lockedBranches.has(skillId)) return false;
    if (skill.requires === null) return true;
    return this.ownedUpgrades.has(skill.requires);
  }

  lockDownstream(skillId: string): void {
    SKILL_TREE.forEach((skill) => {
      if (skill.requires === skillId && !this.lockedBranches.has(skill.id)) {
        this.lockedBranches.add(skill.id);
        this.lockDownstream(skill.id);
      }
    });
  }

  continueFromUpgrade(): void {
    if (!this.hasSelectedUpgrade) return;

    this.gameState = "PLAYING";
    this.destroyedSinceUpgrade = 0;

    // Reset button text for next time
    const installBtn = document.getElementById("installBtn");
    if (installBtn) installBtn.textContent = "Initiate Install";

    document.getElementById("upgradeScreen")?.classList.add("hidden");
    this.updateProgressBar();
  }

  applyUpgradeEffects(skillId: string): void {
    console.log("[applyUpgradeEffects]", skillId);
    
    // Defense upgrades need immediate effect
    if (skillId === "d1") {
      this.maxShieldHits = 1;
      this.shieldHits = 1;
    } else if (skillId === "d3a") {
      this.maxShieldHits = 2;
      this.shieldHits = 2;
    } else if (skillId === "d4a") {
      this.maxShieldHits = 3;
      this.shieldHits = 3;
    }
  }

  getDestructionsNeededForNextUpgrade(): number {
    const count = this.upgradesEarned;
    if (count <= 1) return CONFIG.UPGRADE_BASE_COUNT;
    if (count === 2) return 14;
    if (count === 3) return 16;
    
    // Ramping up further: +4 for every upgrade after 3
    return 16 + (count - 3) * 4;
  }

  getDifficultyMultiplier(): number {
    if (this.upgradesEarned === 0) return 1.0;
    // Aggressive scaling after the first upgrade: 
    // 25% jump for the first upgrade, then 15% per subsequent upgrade
    return 1.25 * Math.pow(1.15, this.upgradesEarned - 1);
  }

  updateHUD(): void {
    document.getElementById("scoreDisplay")!.textContent = this.score.toString();
    document.getElementById("destroyedDisplay")!.textContent =
      this.totalDestroyed.toString();
  }

  updateProgressBar(): void {
    const needed = this.getDestructionsNeededForNextUpgrade();
    const progress = Math.min(this.destroyedSinceUpgrade / needed, 1);
    const progressFill = document.getElementById("progressFill");
    if (progressFill) {
      progressFill.style.width = progress * 100 + "%";
    }
    const progressText = document.getElementById("progressText");
    if (progressText) {
      progressText.textContent = this.destroyedSinceUpgrade + "/" + needed;
    }
  }

  updateUpgradeDots(): void {
    const trees: SkillTreeCategory[] = ["fire", "utility", "defense"];
    trees.forEach((tree) => {
      const rowEl = document.getElementById(tree + "DotsRow");
      if (!rowEl) return;
      
      // Count owned upgrades in this tree
      const ownedCount = SKILL_TREE.filter(
        (s) => s.tree === tree && this.ownedUpgrades.has(s.id)
      ).length;
      const totalCount = SKILL_TREE.filter((s) => s.tree === tree).length;
      
      // Generate dots
      rowEl.innerHTML = "";
      for (let i = 0; i < Math.min(totalCount, 11); i++) {
        const dot = document.createElement("div");
        dot.className = "dot" + (i < ownedCount ? " filled" : "");
        rowEl.appendChild(dot);
      }
    });
  }

  triggerScreenShake(intensity: number): void {
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity
    );
  }

  // ============= GAME LOGIC =============

  updateCannon(dt: number): void {
    const leftPressed =
      this.keysDown.has("ArrowLeft") ||
      this.keysDown.has("a") ||
      this.keysDown.has("A");
    const rightPressed =
      this.keysDown.has("ArrowRight") ||
      this.keysDown.has("d") ||
      this.keysDown.has("D");

    // Firing state: any movement input
    this.isFiring = leftPressed || rightPressed || this.isDragging;

    if (this.isDragging && this.touchCurrentX !== null) {
      // DIRECT FOLLOW: Use a high-gain P-controller to snap to cursor
      const dx = this.touchCurrentX - this.cannonX;
      
      // Very high gain (20) means it will close 20x the distance in 1 second
      // This makes it feel "glued" to the finger/cursor
      this.cannonVx = dx * 22; 
      
      // Still respect max speed but it's higher now for responsiveness
      this.cannonVx = clamp(this.cannonVx, -CONFIG.CANNON_MAX_SPEED, CONFIG.CANNON_MAX_SPEED);
      
      // Instant snap if very close to prevent micro-jitter
      if (Math.abs(dx) < 2) {
        this.cannonVx = 0;
        this.cannonX = this.touchCurrentX;
      }
    } else {
      // KEYBOARD: Use standard acceleration/friction for tactile feel
      let inputDir = 0;
      if (leftPressed) inputDir = -1;
      else if (rightPressed) inputDir = 1;

      if (inputDir !== 0) {
        this.cannonVx += inputDir * CONFIG.CANNON_ACCELERATION * dt;
        this.cannonVx = clamp(this.cannonVx, -CONFIG.CANNON_MAX_SPEED, CONFIG.CANNON_MAX_SPEED);
      } else {
        // Friction to slow down naturally when no keys are pressed
        this.cannonVx *= Math.pow(0.001, dt * CONFIG.CANNON_FRICTION);
        if (Math.abs(this.cannonVx) < 1) this.cannonVx = 0;
      }
    }

    // Update position
    this.cannonX += this.cannonVx * dt;

    // Clamp to screen bounds
    const halfWidth = CONFIG.CANNON_BODY_WIDTH / 2 + CONFIG.CANNON_WHEEL_RADIUS;
    this.cannonX = clamp(this.cannonX, halfWidth, this.w - halfWidth);

    // Stop velocity at walls
    if (this.cannonX <= halfWidth || this.cannonX >= this.w - halfWidth) {
      this.cannonVx = 0;
    }

    // Rotate wheels based on movement (visual only)
    this.wheelRotation += (this.cannonVx * dt) / CONFIG.CANNON_WHEEL_RADIUS;
  }

  // Calculate fire rate bonus from skill tree
  getFireRateMultiplier(): number {
    let bonus = 1.0;
    if (this.ownedUpgrades.has("f1")) bonus -= 0.25;
    if (this.ownedUpgrades.has("f2a")) bonus -= 0.25; // Total -50%
    if (this.ownedUpgrades.has("f3a")) bonus -= 0.30; // Total -80%
    if (this.ownedUpgrades.has("f4a")) bonus -= 0.20; // Total -100% (capped at 0.2)
    return Math.max(0.2, bonus);
  }

  fireBullets(): void {
    // Determine bullet count and spread from UTILITY tree
    let bulletCount = 1;
    let spread = 0;

    if (this.ownedUpgrades.has("u1")) { bulletCount = 2; spread = 8; }
    if (this.ownedUpgrades.has("u2a")) { bulletCount = 3; spread = 15; }
    if (this.ownedUpgrades.has("u3a")) { bulletCount = 4; spread = 20; }
    if (this.ownedUpgrades.has("u3b")) { spread = 30; }
    if (this.ownedUpgrades.has("u4a")) { bulletCount = 6; spread = 35; }
    if (this.ownedUpgrades.has("u4b")) { bulletCount = 8; spread = 60; }

    // Determine damage from FIRE tree
    let damage = 1;
    if (this.ownedUpgrades.has("f2b")) damage = 2;
    if (this.ownedUpgrades.has("f3c")) damage = 3;
    if (this.ownedUpgrades.has("f4c")) damage = 5;

    // Determine pierce from UTILITY tree
    let pierce = 0;
    if (this.ownedUpgrades.has("u2b")) pierce = 1;
    if (this.ownedUpgrades.has("u3c")) pierce = 99; // Pierce all

    // Determine explosive from FIRE tree
    let explosive = false;
    if (this.ownedUpgrades.has("f3d") || this.ownedUpgrades.has("f4d")) explosive = true;

    // Burst mode handling
    const burstCount = this.ownedUpgrades.has("f4b") ? 5 : this.ownedUpgrades.has("f3b") ? 3 : 1;

    // Get cannon muzzle position
    const cannonY = this.groundY - CONFIG.CANNON_WHEEL_RADIUS - CONFIG.CANNON_BODY_HEIGHT - CONFIG.CANNON_BARREL_LENGTH;

    const baseAngle = -Math.PI / 2;
    const startAngle = baseAngle - ((spread / 2) * Math.PI) / 180;
    const angleStep = bulletCount > 1 ? (spread * Math.PI) / 180 / (bulletCount - 1) : 0;

    for (let burst = 0; burst < burstCount; burst++) {
      for (let i = 0; i < bulletCount; i++) {
        const angle = bulletCount === 1 ? baseAngle : startAngle + angleStep * i;
        // Add slight random spread for Bullet Storm
        const spreadNoise = this.ownedUpgrades.has("f4a") ? (Math.random() - 0.5) * 0.1 : 0;

        const bullet = this.bulletPool.acquire();
        bullet.x = this.cannonX;
        bullet.y = cannonY - burst * 5; // Stagger burst bullets slightly
        bullet.vx = Math.cos(angle + spreadNoise) * CONFIG.BULLET_SPEED;
        bullet.vy = Math.sin(angle + spreadNoise) * CONFIG.BULLET_SPEED;
        bullet.damage = damage;
        bullet.pierceRemaining = pierce;
        bullet.explosive = explosive;
        bullet.active = true;

        this.bullets.push(bullet);
      }
    }

    this.audio.playShoot();
    this.audio.triggerHaptic("light");
  }

  updateShieldRecharge(dt: number): void {
    // Time-based shield recharge (Shield Generator path)
    if (this.shieldHits < this.maxShieldHits && this.ownedUpgrades.has("d2a")) {
      this.shieldRechargeTimer += dt * 1000;
      const rechargeTime = 10000; // 10 seconds
      if (this.shieldRechargeTimer >= rechargeTime) {
        this.shieldHits = this.maxShieldHits;
        this.shieldRechargeTimer = 0;
        this.floatingText.add(this.cannonX, this.groundY - 100, "SHIELD RESTORED", "#44ff88", 18);
        this.audio.triggerHaptic("success");
      }
    }

    // Invincibility timer decay
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt * 1000;
    }
  }

  updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;

      // Remove if off screen
      if (b.y < -50 || b.y > this.h + 50 || b.x < -50 || b.x > this.w + 50) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
      }
    }
  }

  spawnBoulder(
    size?: BoulderSize,
    x?: number,
    y?: number,
    vx?: number,
    vy?: number
  ): void {
    // Determine size based on progress
    if (!size) {
      const roll = Math.random();
      // Start with mostly small/medium, slowly increase large chance
      const largeChance = clamp(0.1 + (this.totalDestroyed / 200), 0.1, 0.35);
      const mediumChance = 0.4;
      
      if (roll < largeChance) size = "large";
      else if (roll < largeChance + mediumChance) size = "medium";
      else size = "small";
    }

    const config = CONFIG.BOULDER_SIZES[size];
    const boulder = this.boulderPool.acquire();

    // Calculate dynamic health: starts at 1, slowly increases for large/medium
    let bonusHealth = 0;
    if (size !== "small") {
      // Every BOULDER_HEALTH_INCREASE_INTERVAL destructions, health goes up by 1
      // Cap at 3 as requested
      bonusHealth = Math.floor(this.totalDestroyed / CONFIG.BOULDER_HEALTH_INCREASE_INTERVAL);
      bonusHealth = clamp(bonusHealth, 0, 2);
    }

    boulder.id = ++this.boulderIdCounter;
    boulder.size = size;
    boulder.maxHealth = config.health + bonusHealth;
    boulder.health = boulder.maxHealth;
    boulder.x =
      x ?? randomRange(config.radius + 30, this.w - config.radius - 30);
    boulder.y = y ?? -config.radius - 20;
    const diffMult = this.getDifficultyMultiplier();
    boulder.vx = vx ?? randomRange(-0.8, 0.8) * diffMult;
    boulder.vy = vy ?? randomRange(0.8, 2.0) * diffMult; // Falls faster over time
    boulder.rotation = Math.random() * Math.PI * 2;
    boulder.rotationSpeed = (Math.random() - 0.5) * 0.03;
    boulder.active = true;
    boulder.hitFlash = 0;
    boulder.hasHitGround = false;

    this.boulders.push(boulder);
  }

  updateBoulders(dt: number): void {
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      const config = CONFIG.BOULDER_SIZES[b.size];

      // Apply gravity
      b.vy += CONFIG.BOULDER_GRAVITY * dt * 60;

      // Update position
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;
      b.rotation += b.rotationSpeed * dt * 60;

      // Hit flash decay
      if (b.hitFlash > 0) {
        b.hitFlash -= dt;
      }

      // Bounce off walls
      if (b.x - config.radius < 0) {
        b.x = config.radius;
        b.vx = Math.abs(b.vx) * CONFIG.BOULDER_BOUNCE;
      } else if (b.x + config.radius > this.w) {
        b.x = this.w - config.radius;
        b.vx = -Math.abs(b.vx) * CONFIG.BOULDER_BOUNCE;
      }

      // Bounce off ground
      if (b.y + config.radius > this.groundY) {
        b.y = this.groundY - config.radius;
        b.vy = -Math.abs(b.vy) * CONFIG.BOULDER_BOUNCE;
        b.vx *= 0.95; // Reduced friction for more sliding
        b.hasHitGround = true; // Lost airborne bonus eligibility
      }

      // Remove if fallen way below screen (shouldn't happen with ground)
      if (b.y > this.h + 100) {
        this.boulderPool.release(b);
        this.boulders.splice(i, 1);
      }
    }
  }

  checkCollisions(): void {
    // Bullets vs Boulders
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const bullet = this.bullets[bi];
      if (!bullet.active) continue;

      for (let boi = this.boulders.length - 1; boi >= 0; boi--) {
        const boulder = this.boulders[boi];
        if (!boulder.active) continue;

        const config = CONFIG.BOULDER_SIZES[boulder.size];
        const dist = distance(bullet.x, bullet.y, boulder.x, boulder.y);

        if (dist < config.radius + CONFIG.BULLET_RADIUS) {
          // Hit!
          boulder.health -= bullet.damage;
          this.eventBus.emit("BOULDER_HIT", { boulder });

          if (boulder.health <= 0) {
            // Destroyed
            const points = config.points;
            this.eventBus.emit("BOULDER_DESTROYED", { boulder, points });

            // Split
            this.splitBoulder(boulder);

            // Explosive effect
            if (bullet.explosive) {
              this.handleExplosion(boulder.x, boulder.y, 2, 60);
            }

            this.boulderPool.release(boulder);
            this.boulders.splice(boi, 1);
          }

          // Handle pierce
          if (bullet.pierceRemaining > 0) {
            bullet.pierceRemaining--;
          } else {
            this.bulletPool.release(bullet);
            this.bullets.splice(bi, 1);
            break;
          }
        }
      }
    }

    // Boulders vs Cannon
    const cannonCenterY = this.groundY - CONFIG.CANNON_WHEEL_RADIUS - CONFIG.CANNON_BODY_HEIGHT / 2;
    let cannonHitRadius = CONFIG.CANNON_BODY_WIDTH / 2;
    
    // If shield is active, hit detection matches the visual shield size
    if (this.shieldHits > 0 || this.invincibilityTimer > 0) {
      cannonHitRadius = CONFIG.CANNON_BODY_WIDTH * 1.1;
    }

    for (const boulder of this.boulders) {
      const config = CONFIG.BOULDER_SIZES[boulder.size];
      const dist = distance(boulder.x, boulder.y, this.cannonX, cannonCenterY);

      if (dist < config.radius + cannonHitRadius - 5) {
        this.eventBus.emit("PLAYER_HIT", {});
        return;
      }
    }
  }

  splitBoulder(boulder: Boulder): void {
    if (boulder.size === "small") return;

    const newSize: BoulderSize = boulder.size === "large" ? "medium" : "small";

    // Spawn 2 children with a strong "pop" effect (upward and outward)
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? -1 : 1;
      
      // Horizontal "outward" velocity
      const vx = dir * randomRange(3, 5);
      // Stronger "upward" velocity
      const vy = randomRange(-5, -8);

      this.spawnBoulder(
        newSize,
        boulder.x + dir * 25,
        boulder.y - 5,
        vx,
        vy
      );
    }
  }

  handleExplosion(x: number, y: number, damage: number, radius: number): void {
    this.particles.emit(x, y, "#ff6600", 12, "explosion");
    this.triggerScreenShake(0.5);

    // Damage nearby boulders
    for (const boulder of this.boulders) {
      const dist = distance(x, y, boulder.x, boulder.y);
      if (dist < radius) {
        boulder.health -= damage;
        if (boulder.health <= 0) {
          const config = CONFIG.BOULDER_SIZES[boulder.size];
          this.eventBus.emit("BOULDER_DESTROYED", {
            boulder,
            points: config.points,
          });
        }
      }
    }
  }

  // ============= RENDERING =============

  initEnvironment(): void {
    // Generate stars
    this.stars = [];
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        s: 0.4 + Math.random() * 1.2,
        o: 0.1 + Math.random() * 0.5,
      });
    }

    // Generate distant mountains - more subtle
    this.mountains = [];
    let mx = -200;
    while (mx < 1200) {
      const mw = 300 + Math.random() * 400;
      const mh = 80 + Math.random() * 120;
      this.mountains.push({ x: mx, w: mw, h: mh });
      mx += mw * 0.5;
    }

    // Generate distant base structures - very subtle
    this.distantBase = [];
    let bx = 0;
    while (bx < 1000) {
      const bw = 60 + Math.random() * 100;
      const bh = 30 + Math.random() * 50;
      if (Math.random() > 0.6) {
        this.distantBase.push({ x: bx, w: bw, h: bh });
      }
      bx += bw + 50 + Math.random() * 150;
    }

    // Generate soft nebulae
    this.nebulae = [
      { x: 200, y: 200, r: 300, c: "rgba(68, 100, 255, 0.05)" },
      { x: 800, y: 400, r: 400, c: "rgba(144, 255, 170, 0.03)" },
      { x: 500, y: 600, r: 350, c: "rgba(255, 100, 200, 0.03)" },
    ];
  }

  drawBackground(): void {
    const ctx = this.ctx;
    const now = Date.now();

    // Soft gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, this.h);
    gradient.addColorStop(0, "#050a14");
    gradient.addColorStop(0.5, "#0a1525");
    gradient.addColorStop(1, "#0d1a2d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.w, this.h);

    // Draw Nebulae (Soft animation effects)
    for (const n of this.nebulae) {
      const x = (n.x / 1000) * this.w + Math.sin(now / 5000 + n.x) * 20;
      const y = (n.y / 1000) * this.h + Math.cos(now / 4000 + n.y) * 20;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, n.r);
      grad.addColorStop(0, n.c);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Draw Stars (twinkling softly)
    ctx.fillStyle = "#fff";
    for (const s of this.stars) {
      const twinkle = 0.7 + Math.sin(now / 1500 + s.x * 10) * 0.3;
      ctx.globalAlpha = s.o * twinkle;
      ctx.beginPath();
      ctx.arc((s.x / 1000) * this.w, (s.y / 1000) * this.h * 0.8, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shooting Star logic
    if (now - this.lastShootingStarTime > 8000 + Math.random() * 12000) {
      this.shootingStars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h * 0.4,
        vx: 15 + Math.random() * 10,
        vy: 5 + Math.random() * 5,
        life: 1,
        len: 40 + Math.random() * 60,
      });
      this.lastShootingStarTime = now;
    }

    // Draw & Update Shooting Stars
    ctx.lineWidth = 2;
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const ss = this.shootingStars[i];
      const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 2, ss.y - ss.vy * 2);
      grad.addColorStop(0, `rgba(255, 255, 255, ${ss.life})`);
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(ss.x - ss.vx * (ss.len / 20), ss.y - ss.vy * (ss.len / 20));
      ctx.stroke();

      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= 0.02;
      if (ss.life <= 0) this.shootingStars.splice(i, 1);
    }

    // Draw Mountains - very soft silhouettes
    ctx.fillStyle = "rgba(10, 20, 35, 0.6)";
    for (const m of this.mountains) {
      const x = (m.x / 1000) * this.w;
      const w = (m.w / 1000) * this.w;
      const h = (m.h / 1000) * this.h;
      ctx.beginPath();
      ctx.moveTo(x, this.groundY);
      ctx.lineTo(x + w / 2, this.groundY - h);
      ctx.lineTo(x + w, this.groundY);
      ctx.fill();
    }

    // Draw Distant Base - almost merged with sky
    ctx.fillStyle = "rgba(20, 30, 50, 0.4)";
    for (const b of this.distantBase) {
      const x = (b.x / 1000) * this.w;
      const w = (b.w / 1000) * this.w;
      const h = (b.h / 1000) * this.h;
      ctx.fillRect(x, this.groundY - h, w, h);
      
      // Window lights - warm amber
      if (h > 30) {
        ctx.fillStyle = "rgba(255, 200, 100, 0.15)";
        ctx.fillRect(x + w * 0.2, this.groundY - h + 10, w * 0.1, 4);
        ctx.fillRect(x + w * 0.7, this.groundY - h + 15, w * 0.1, 4);
        ctx.fillStyle = "rgba(20, 30, 50, 0.4)";
      }
    }

    // Vignette
    const vGrad = ctx.createRadialGradient(this.w / 2, this.h / 2, this.w * 0.3, this.w / 2, this.h / 2, this.w * 0.9);
    vGrad.addColorStop(0, "rgba(0,0,0,0)");
    vGrad.addColorStop(1, "rgba(5, 10, 20, 0.5)");
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawGround(): void {
    const ctx = this.ctx;

    // Ground platform
    const gradient = ctx.createLinearGradient(
      0,
      this.groundY,
      0,
      this.groundY + 50
    );
    gradient.addColorStop(0, "#2a3a30");
    gradient.addColorStop(1, "#1a2520");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, this.groundY, this.w, 50);

    // Ground details (mechanical plates)
    ctx.strokeStyle = "rgba(144, 255, 170, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.w; x += 100) {
      ctx.strokeRect(x + 10, this.groundY + 10, 80, 30);
      // Small rivets
      ctx.fillStyle = "rgba(144, 255, 170, 0.2)";
      ctx.beginPath();
      ctx.arc(x + 20, this.groundY + 20, 2, 0, Math.PI * 2);
      ctx.arc(x + 80, this.groundY + 20, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground top edge (Glowing)
    ctx.strokeStyle = "#4a8a60";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.w, this.groundY);
    ctx.stroke();
    
    // Add glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#44ff88";
    ctx.strokeStyle = "rgba(68, 255, 136, 0.3)";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawCannon(): void {
    const ctx = this.ctx;
    const wheelR = CONFIG.CANNON_WHEEL_RADIUS;
    const bodyW = CONFIG.CANNON_BODY_WIDTH;
    const bodyH = CONFIG.CANNON_BODY_HEIGHT;
    
    // Calculate positions
    const wheelY = this.groundY - wheelR;
    const bodyY = wheelY - bodyH / 2 - 2;
    const wheelSpacing = bodyW / 2 + wheelR * 0.2;

    // Draw wheels
    const wheelPositions = [
      this.cannonX - wheelSpacing,
      this.cannonX + wheelSpacing,
    ];

    for (const wx of wheelPositions) {
      ctx.save();
      ctx.translate(wx, wheelY);
      ctx.rotate(this.wheelRotation);

      // Tire (outer) - Dark Grey/Black
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
      ctx.fill();

      // Hub (inner) - Grey
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.65, 0, Math.PI * 2);
      ctx.fill();

      // Spokes - Steel Grey
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * wheelR * 0.9, Math.sin(angle) * wheelR * 0.9);
        ctx.stroke();
      }

      // Rim highlight
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      // Center cap
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw body (Heavy iron carriage)
    ctx.save();
    ctx.translate(this.cannonX, bodyY);

    // Main body - Dark metallic grey
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 4);
    ctx.fill();

    // Top carriage plating
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2 + 10, -bodyH / 2 - 5, bodyW - 20, 10, 3);
    ctx.fill();

    // Rivets/Bolts for detail
    ctx.fillStyle = "#444";
    const rivetX = bodyW / 2 - 10;
    const rivetY = bodyH / 2 - 8;
    [[-rivetX, -rivetY], [rivetX, -rivetY], [-rivetX, rivetY], [rivetX, rivetY]].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Border
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 4);
    ctx.stroke();

    ctx.restore();

    // Draw barrel (Thick black iron)
    const barrelBaseY = bodyY - bodyH / 2;
    
    ctx.save();
    ctx.translate(this.cannonX, barrelBaseY);

    // Barrel body gradient
    const barrelGradient = ctx.createLinearGradient(
      -CONFIG.CANNON_BARREL_WIDTH / 2, 0,
      CONFIG.CANNON_BARREL_WIDTH / 2, 0
    );
    barrelGradient.addColorStop(0, "#0a0a0a");
    barrelGradient.addColorStop(0.4, "#2a2a2a");
    barrelGradient.addColorStop(0.6, "#2a2a2a");
    barrelGradient.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = barrelGradient;

    // Barrel shape - slightly tapered for classic cannon look
    ctx.beginPath();
    ctx.moveTo(-CONFIG.CANNON_BARREL_WIDTH / 2, 0);
    ctx.lineTo(-CONFIG.CANNON_BARREL_WIDTH / 2 - 2, -CONFIG.CANNON_BARREL_LENGTH);
    ctx.lineTo(CONFIG.CANNON_BARREL_WIDTH / 2 + 2, -CONFIG.CANNON_BARREL_LENGTH);
    ctx.lineTo(CONFIG.CANNON_BARREL_WIDTH / 2, 0);
    ctx.closePath();
    ctx.fill();

    // Decorative rings (Bands)
    ctx.fillStyle = "#333";
    const bandHeight = 4;
    const bandYPositions = [-10, -CONFIG.CANNON_BARREL_LENGTH * 0.6];
    bandYPositions.forEach(by => {
      ctx.fillRect(-CONFIG.CANNON_BARREL_WIDTH / 2 - 2, by, CONFIG.CANNON_BARREL_WIDTH + 4, bandHeight);
    });

    // Muzzle flare (The heavy front rim)
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.roundRect(
      -CONFIG.CANNON_BARREL_WIDTH / 2 - 4,
      -CONFIG.CANNON_BARREL_LENGTH,
      CONFIG.CANNON_BARREL_WIDTH + 8,
      8,
      2
    );
    ctx.fill();

    // Muzzle opening
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, -CONFIG.CANNON_BARREL_LENGTH, CONFIG.CANNON_BARREL_WIDTH / 2 + 1, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Draw Shield Visual if active
    if (this.shieldHits > 0 || this.invincibilityTimer > 0) {
      ctx.save();
      ctx.translate(this.cannonX, bodyY);
      
      const shieldRadius = CONFIG.CANNON_BODY_WIDTH * 1.1; // Increased size to extend further out
      const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
      
      // If invincible (just hit), flicker or show different color
      const isInvinc = this.invincibilityTimer > 0;
      const color = isInvinc ? "rgba(255, 255, 255," : "rgba(68, 255, 136,";
      const alpha = isInvinc ? (pulse * 0.5) : (pulse * 0.3);
      
      ctx.beginPath();
      ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
      
      const grad = ctx.createRadialGradient(0, 0, shieldRadius * 0.7, 0, 0, shieldRadius);
      grad.addColorStop(0, color + "0)");
      grad.addColorStop(0.8, color + alpha + ")");
      grad.addColorStop(1, color + "0)");
      
      ctx.strokeStyle = color + (alpha + 0.2) + ")";
      ctx.lineWidth = 2;
      ctx.fillStyle = grad;
      
      ctx.fill();
      ctx.stroke();
      
      // Draw shield charges as small pips
      if (this.maxShieldHits > 0) {
        for (let i = 0; i < this.maxShieldHits; i++) {
          const angle = -Math.PI / 2 + (i - (this.maxShieldHits - 1) / 2) * 0.3;
          const px = Math.cos(angle) * (shieldRadius + 8);
          const py = Math.sin(angle) * (shieldRadius + 8);
          
          ctx.fillStyle = i < this.shieldHits ? "#44ff88" : "#224422";
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
          if (i < this.shieldHits) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#44ff88";
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }
      
      ctx.restore();
    }
  }

  drawBullets(): void {
    const ctx = this.ctx;

    for (const bullet of this.bullets) {
      ctx.save();
      ctx.translate(bullet.x, bullet.y);

      // Glow
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, CONFIG.BULLET_RADIUS * 2);
      glow.addColorStop(0, "rgba(255, 213, 79, 0.8)");
      glow.addColorStop(0.5, "rgba(255, 180, 50, 0.3)");
      glow.addColorStop(1, "rgba(255, 150, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, CONFIG.BULLET_RADIUS * 2, 0, Math.PI * 2);
      ctx.fill();

      // Bullet core
      ctx.fillStyle = CONFIG.BULLET_COLOR;
      ctx.beginPath();
      ctx.arc(0, 0, CONFIG.BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  drawBoulders(): void {
    const ctx = this.ctx;

    for (const boulder of this.boulders) {
      const config = CONFIG.BOULDER_SIZES[boulder.size];

      ctx.save();
      ctx.translate(boulder.x, boulder.y);
      ctx.rotate(boulder.rotation);

      // Hit flash
      if (boulder.hitFlash > 0) {
        ctx.globalAlpha = 0.6 + boulder.hitFlash * 2;
      }

      // Boulder body - irregular shape
      const gradient = ctx.createRadialGradient(
        -config.radius * 0.3,
        -config.radius * 0.3,
        0,
        0,
        0,
        config.radius
      );
      gradient.addColorStop(0, "#6a5a4a");
      gradient.addColorStop(1, "#3a2a20");
      ctx.fillStyle = gradient;

      ctx.beginPath();
      const points = 8;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const wobble = 0.85 + Math.sin(boulder.id * 73 + i * 41) * 0.2;
        const r = config.radius * wobble;
        if (i === 0) {
          ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        } else {
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
      }
      ctx.closePath();
      ctx.fill();

      // Outline
      ctx.strokeStyle = "#8a7a6a";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crack lines
      ctx.strokeStyle = "#2a1a10";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const angle1 = (boulder.id * 31 + i * 100) * (Math.PI / 180);
        const angle2 = angle1 + 0.6;
        ctx.beginPath();
        ctx.moveTo(
          Math.cos(angle1) * config.radius * 0.2,
          Math.sin(angle1) * config.radius * 0.2
        );
        ctx.lineTo(
          Math.cos(angle2) * config.radius * 0.6,
          Math.sin(angle2) * config.radius * 0.6
        );
        ctx.stroke();
      }

      // Health number
      ctx.rotate(-boulder.rotation);
      ctx.font = "900 " + config.radius * 0.7 + "px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000";
      ctx.fillText(boulder.health.toString(), 2, 2);
      ctx.fillStyle = "#fff";
      ctx.fillText(boulder.health.toString(), 0, 0);

      ctx.restore();
    }
  }

  // ============= DEMO ANIMATION =============

  initDemoAnimation(): void {
    if (!this.demoCanvas) return;
    console.log("[initDemoAnimation]");

    const container = this.demoCanvas.parentElement;
    if (container) {
      this.demoCanvas.width = container.clientWidth;
      this.demoCanvas.height = container.clientHeight;
    }

    this.demoCannonX = this.demoCanvas.width / 2;
    this.demoCannonDir = 1;
    this.demoBullets = [];
    this.demoBoulders = [];
    this.demoParticles = [];
  }

  updateDemoAnimation(dt: number): void {
    if (!this.demoCanvas || !this.demoCtx) return;

    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Move cannon
    this.demoCannonX += this.demoCannonDir * 40 * dt;
    if (this.demoCannonX > w - 40) {
      this.demoCannonDir = -1;
    } else if (this.demoCannonX < 40) {
      this.demoCannonDir = 1;
    }

    // Fire bullets
    this.demoFireTimer -= dt * 1000;
    if (this.demoFireTimer <= 0) {
      this.demoBullets.push({
        x: this.demoCannonX,
        y: h - 35,
        vy: -8,
      });
      this.demoFireTimer = 250;
    }

    // Spawn boulders
    this.demoSpawnTimer -= dt * 1000;
    if (this.demoSpawnTimer <= 0) {
      this.demoBoulders.push({
        x: 30 + Math.random() * (w - 60),
        y: -20,
        vy: 1.5 + Math.random(),
        radius: 12 + Math.random() * 10,
        rotation: Math.random() * Math.PI * 2,
        health: 2,
      });
      this.demoSpawnTimer = 700 + Math.random() * 400;
    }

    // Update bullets
    for (let i = this.demoBullets.length - 1; i >= 0; i--) {
      const b = this.demoBullets[i];
      b.y += b.vy;
      if (b.y < -10) {
        this.demoBullets.splice(i, 1);
      }
    }

    // Update boulders
    for (let i = this.demoBoulders.length - 1; i >= 0; i--) {
      const b = this.demoBoulders[i];
      b.y += b.vy;
      b.rotation += 0.02;
      if (b.y > h + 30) {
        this.demoBoulders.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.demoParticles.length - 1; i >= 0; i--) {
      const p = this.demoParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= 0.04;
      if (p.life <= 0) {
        this.demoParticles.splice(i, 1);
      }
    }

    // Collisions
    for (let bi = this.demoBullets.length - 1; bi >= 0; bi--) {
      const bullet = this.demoBullets[bi];
      for (let boi = this.demoBoulders.length - 1; boi >= 0; boi--) {
        const boulder = this.demoBoulders[boi];
        const dist = Math.sqrt(
          (bullet.x - boulder.x) ** 2 + (bullet.y - boulder.y) ** 2
        );
        if (dist < boulder.radius + 4) {
          boulder.health--;
          this.demoBullets.splice(bi, 1);

          if (boulder.health <= 0) {
            for (let p = 0; p < 6; p++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 2 + Math.random() * 3;
              this.demoParticles.push({
                x: boulder.x,
                y: boulder.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 3 + Math.random() * 4,
              });
            }
            this.demoBoulders.splice(boi, 1);
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

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#1a2530");
    gradient.addColorStop(1, "#0d1520");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(60, 80, 90, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Ground
    ctx.fillStyle = "#2a3a30";
    ctx.fillRect(0, h - 15, w, 15);

    // Boulders
    for (const b of this.demoBoulders) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);

      ctx.fillStyle = "#5a4a3a";
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a6a5a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    // Bullets
    ctx.fillStyle = "#ffd54f";
    for (const b of this.demoBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    for (const p of this.demoParticles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = "#8a7a6a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Cannon
    const cx = this.demoCannonX;
    const cy = h - 22;

    // Wheels
    ctx.fillStyle = "#3a4a40";
    ctx.beginPath();
    ctx.arc(cx - 15, cy + 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 15, cy + 5, 8, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#4a5a50";
    ctx.beginPath();
    ctx.roundRect(cx - 20, cy - 8, 40, 16, 4);
    ctx.fill();

    // Barrel
    ctx.fillStyle = "#5a6a60";
    ctx.beginPath();
    ctx.roundRect(cx - 5, cy - 30, 10, 25, 3);
    ctx.fill();
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
        (Math.random() - 0.5) * this.screenShake.intensity * 12;
      this.screenShake.y =
        (Math.random() - 0.5) * this.screenShake.intensity * 12;
      this.screenShake.intensity *= 0.88;
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
      this.updateCannon(dt);
      this.updateBullets(dt);
      this.updateBoulders(dt);
      this.checkCollisions();

      // Firing - only when moving
      if (this.isFiring) {
        const fireInterval = CONFIG.BASE_FIRE_INTERVAL * this.getFireRateMultiplier();
        this.fireTimer -= dt * 1000;
        if (this.fireTimer <= 0) {
          this.fireBullets();
          this.fireTimer = fireInterval;
        }
      }

      // Spawning - faster progression with exponential ramp
      const difficultyMult = this.getDifficultyMultiplier();
      const spawnInterval = Math.max(
        CONFIG.BOULDER_SPAWN_INTERVAL_MIN,
        (CONFIG.BOULDER_SPAWN_INTERVAL_START - this.totalDestroyed * 25) / difficultyMult
      );
      this.spawnTimer -= dt * 1000;
      if (this.spawnTimer <= 0) {
        this.spawnBoulder();
        this.spawnTimer = spawnInterval;
      }

      this.updateHUD();
      this.updateShieldRecharge(dt);
    }
    // UPGRADE state - no timer, player takes their time
  }

  render(): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(this.screenShake.x, this.screenShake.y);

    this.drawBackground();
    this.drawGround();

    if (
      this.gameState === "PLAYING" ||
      this.gameState === "PAUSED" ||
      this.gameState === "UPGRADE" ||
      this.gameState === "GAME_OVER"
    ) {
      this.drawBoulders();
      this.drawBullets();
      this.drawCannon();
      this.particles.draw(ctx);
      this.floatingText.draw(ctx);
    }

    ctx.restore();
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Cannon Blaster");
  new CannonBlasterGame();
});
