/**
 * WORDFALL - Real-time Typing Arcade Game with Matter.js Physics
 *
 * Type falling words before they stack up in the bucket!
 * Special words: bomb, freeze, shrink
 */

import Matter from "matter-js";
import { oasiz } from "@oasiz/sdk";
import WORD_LIST from "../words.json";


// ============= CONFIGURATION =============
const CONFIG = {
  // Bucket dimensions (relative to screen)
  BUCKET_WIDTH_RATIO: 0.6, // 60% of screen width
  BUCKET_HEIGHT_RATIO: 0.7, // 70% of screen height
  BUCKET_WALL_THICKNESS: 20,
  BUCKET_CORNER_RADIUS: 30,

  // Spawn settings
  SPAWN_INTERVAL_MIN: 2.0,
  SPAWN_INTERVAL_MAX: 3.5,
  SPAWN_INTERVAL_MIN_LIMIT: 0.5,
  SPAWN_INTERVAL_MAX_LIMIT: 1.0,
  SPAWN_AREA_TOP_OFFSET: 80,
  DOUBLE_SPAWN_PROB: 0.06,

  // Difficulty: ramp=1 in ~3 min at normal speed
  DIFFICULTY_RAMP_RATE: 0.006,

  // Physics
  GRAVITY: 0.8,
  GRAVITY_MAX: 1.2,
  WORD_RESTITUTION: 0,
  WORD_FRICTION: 1,
  WORD_CHAMFER_RADIUS: 8,

  // Special word probabilities
  PROB_NORMAL: 0.83,
  PROB_BOMB: 0.05,
  PROB_FREEZE: 0.06,
  PROB_SHRINK: 0.06,

  // Effects
  FREEZE_DURATION: 5,
  SHRINK_SCALE: 0.7,
  SHRINK_MIN_SCALE: 0.5,
  BOMB_RADIUS: 120,

  // Danger zone
  DANGER_LINE_PERCENT: 0.15,
  GRACE_PERIOD: 1.0,

  // Scoring
  SCORE_BASE: 10,
  SCORE_BOMB: 25,
  SCORE_FREEZE: 25,
  SCORE_SHRINK: 20,
  SCORE_BOMB_BONUS: 8,
  COMBO_TIMEOUT: 2.0,

  // Colors
  COLOR_NORMAL: {
    bg: "#FFF3E0",
    text: "#4E342E",
    shadow: "#D4A373",
    highlight: "#FFFFFF",
  },
  COLOR_BOMB: { 
    bg: "#FF5252", 
    text: "#FFF", 
    shadow: "#D32F2F", 
    highlight: "#FF8A80" 
  },
  COLOR_FREEZE: { 
    bg: "#4DD0E1", 
    text: "#FFF", 
    shadow: "#0097A7", 
    highlight: "#B2EBF2" 
  },
  COLOR_SHRINK: {
    bg: "#BA68C8",
    text: "#FFF",
    shadow: "#7B1FA2",
    highlight: "#E1BEE7"
  },
  COLOR_BUCKET: "#3D2B1F",
  COLOR_BUCKET_BORDER: "#5E3F38",
  COLOR_BUCKET_SHADOW: "#2A1E17",
};

// ============= TYPE DEFINITIONS =============
type WordType = "normal" | "bomb" | "freeze" | "shrink";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface WordData {
  id: number;
  text: string;
  type: WordType;
  body: Matter.Body;
  width: number;
  height: number;
  scale: number;
  exploding: boolean;
  explosionProgress: number;
}

interface GameState {
  started: boolean;
  gameOver: boolean;
  frozen: boolean;
  freezeTimer: number;
  score: number;
  wordsCleared: number;
  survivalTime: number;
  combo: number;
  maxCombo: number;
  lastClearTime: number;
  dangerGraceTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
}

interface BucketLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  dangerLineY: number;
}

// ============= UTILITY FUNCTIONS =============
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ":" + (secs < 10 ? "0" : "") + secs;
}

// ============= PARTICLE SYSTEM =============
class ParticleSystem {
  particles: Particle[] = [];

  emit(x: number, y: number, color: string, count: number) {
    console.log("[ParticleSystem.emit]", count, "particles at", x, y);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        size: 4 + Math.random() * 8,
        color,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  emitExplosion(x: number, y: number, color: string) {
    this.emit(x, y, color, 12);
    this.emit(x, y, "#ffffff", 6);
  }

  emitBombExplosion(x: number, y: number) {
    this.emit(x, y, CONFIG.COLOR_BOMB.bg, 25);
    this.emit(x, y, "#ff8a5b", 15);
    this.emit(x, y, "#ffd700", 10);
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.2 * dt * 60;
      p.rotation += p.rotationSpeed * dt * 60;
      p.life -= 0.025 * dt * 60;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.9;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      const size = p.size * p.life;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }
}

// ============= SCREEN SHAKE =============
class ScreenShake {
  intensity = 0;
  x = 0;
  y = 0;

  trigger(amount: number) {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(dt: number) {
    if (this.intensity > 0) {
      this.x = (Math.random() - 0.5) * this.intensity * 15;
      this.y = (Math.random() - 0.5) * this.intensity * 15;
      this.intensity *= Math.pow(0.85, dt * 60);
      if (this.intensity < 0.01) {
        this.intensity = 0;
        this.x = 0;
        this.y = 0;
      }
    }
  }
}

// ============= SETTINGS =============
interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= AUDIO MANAGER =============
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;
  private settings: Settings;
  private bgMusic: HTMLAudioElement;
  private clickSound: HTMLAudioElement;
  private musicStarted = false;

  constructor(settings: Settings) {
    this.settings = settings;
    this.bgMusic = new Audio(new URL("./MOVE.mp3", import.meta.url).href);
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.25; // Default background volume

    this.clickSound = new Audio(new URL("./click.mp3", import.meta.url).href);
    this.clickSound.volume = 0.8;
  }

  playClick() {
    if (this.settings.fx) {
      this.clickSound.currentTime = 0;
      this.clickSound.play().catch(() => {});
    }
  }

  init() {
    if (this.initialized) return;
    try {
      const resume = () => {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = 0.4;
          this.masterGain.connect(this.ctx.destination);
        } else if (this.ctx.state === "suspended") {
          this.ctx.resume();
        }
        
        if (this.musicStarted && this.settings.music) {
          this.bgMusic.play().catch(() => {});
        }
        
        document.removeEventListener("pointerdown", resume);
        document.removeEventListener("keydown", resume);
      };

      document.addEventListener("pointerdown", resume);
      document.addEventListener("keydown", resume);

      this.initialized = true;
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  applySettings(settings: Settings) {
    this.settings = settings;
    if (this.settings.music && this.musicStarted) {
      this.bgMusic.play().catch(() => {});
    } else {
      this.bgMusic.pause();
    }
  }

  startMusic() {
    this.musicStarted = true;
    if (this.settings.music) {
      this.bgMusic.play().catch(() => {});
    }
  }

  stopMusic() {
    this.musicStarted = false;
    this.bgMusic.pause();
    this.bgMusic.currentTime = 0;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.3,
  ) {
    if (!this.settings.fx || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  playClear() {
    [400, 500, 600].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.15, "sine", 0.25), i * 50);
    });
  }

  playBomb() {
    if (!this.settings.fx || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
    this.playTone(200, 0.15, "square", 0.2);
  }

  playFreeze() {
    if (!this.settings.fx || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playShrink() {
    if (!this.settings.fx || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playThud() {
    // Very soft, low click sound for blocks landing
    this.playTone(80, 0.05, "sine", 0.05); 
  }

  playGameOver() {
    [400, 350, 300, 200].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, "sawtooth", 0.2), i * 150);
    });
  }

  playCombo(streak: number) {
    const baseFreq = 500 + streak * 50;
    [0, 4, 7].forEach((semitone, i) => {
      const freq = baseFreq * Math.pow(2, semitone / 12);
      setTimeout(() => this.playTone(freq, 0.12, "square", 0.15), i * 60);
    });
  }
}

// ============= MAIN GAME CLASS =============
class WordfallGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  // Matter.js
  engine: Matter.Engine;
  world: Matter.World;

  // Systems
  particles: ParticleSystem;
  shake: ScreenShake;
  audio: AudioManager;
  settings: Settings;

  // State
  state: GameState;
  words: WordData[] = [];
  wordsByLength: Map<number, string[]> = new Map();
  nextWordId = 0;
  spawnTimer = 0;
  nextSpawnInterval = 1;
  typedBuffer = "";

  // Layout
  isMobile: boolean;
  bucket: BucketLayout = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    innerLeft: 0,
    innerRight: 0,
    innerTop: 0,
    innerBottom: 0,
    dangerLineY: 0,
  };
  wallBodies: Matter.Body[] = [];

  // Timing
  lastTime = 0;
  private rafId = 0;

  constructor() {
    console.log("[WordfallGame] Initializing with Matter.js");

    this.settings = this.loadSettings();

    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;

    // Initialize Matter.js - sleeping disabled so bodies always re-fall when support is removed
    this.engine = Matter.Engine.create({
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 10,
    });
    this.world = this.engine.world;
    this.engine.world.gravity.y = CONFIG.GRAVITY;

    this.particles = new ParticleSystem();
    this.shake = new ScreenShake();
    this.audio = new AudioManager(this.settings);

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Load initial words (filtered)
    for (const word of WORD_LIST) {
      const len = word.length;
      if (!this.wordsByLength.has(len)) {
        this.wordsByLength.set(len, []);
      }
      this.wordsByLength.get(len)!.push(word);
    }
    this.fetchMoreWords();

    this.state = this.createInitialState();

    this.setupEventListeners();
    this.setupCollisionEvents();
    this.resizeCanvas();
    this.updateSettingsUi();

    window.addEventListener("resize", () => this.resizeCanvas());

    oasiz.onPause(() => {
      this.stopLoop();
    });

    oasiz.onResume(() => {
      this.startLoop();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    });

    this.startLoop();
  }

  private startLoop(): void {
    if (this.rafId) return;
    this.lastTime = 0;
    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem("wordfallSettings");
    return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("wordfallSettings", JSON.stringify(this.settings));
    this.audio.applySettings(this.settings);
  }

  private updateSettingsUi(): void {
    const musicToggle = document.getElementById("musicToggle");
    const fxToggle = document.getElementById("fxToggle");
    const hapticsToggle = document.getElementById("hapticsToggle");

    if (musicToggle) musicToggle.classList.toggle("active", this.settings.music);
    if (fxToggle) fxToggle.classList.toggle("active", this.settings.fx);
    if (hapticsToggle) hapticsToggle.classList.toggle("active", this.settings.haptics);
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (this.settings.haptics) {
      oasiz.triggerHaptic(type);
    }
  }

  private async fetchMoreWords() {
    try {
      // Google's curated frequency-sorted English word list — no swears, all common words
      const res = await fetch(
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-medium.txt"
      );
      if (!res.ok) return;
      const text = await res.text();
      const words = text.split(/\r?\n/).map((w) => w.trim().toLowerCase());

      this.wordsByLength.clear();
      let added = 0;
      for (const w of words) {
        if (w.length >= 3 && w.length <= 8 && /^[a-z]+$/.test(w)) {
          if (!this.wordsByLength.has(w.length)) {
            this.wordsByLength.set(w.length, []);
          }
          this.wordsByLength.get(w.length)!.push(w);
          added++;
        }
      }
      console.log(`[WordfallGame] Loaded ${added} clean common words.`);
    } catch (e) {
      console.warn("[WordfallGame] Failed to fetch word list:", e);
    }
  }

  createInitialState(): GameState {
    return {
      started: false,
      gameOver: false,
      frozen: false,
      freezeTimer: 0,
      score: 0,
      wordsCleared: 0,
      survivalTime: 0,
      combo: 0,
      maxCombo: 0,
      lastClearTime: 0,
      dangerGraceTimer: 0,
    };
  }

  resizeCanvas() {
    console.log("[WordfallGame.resizeCanvas]");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.calculateLayout();
    this.createBucketWalls();
  }

  calculateLayout() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // On mobile, we want the bucket to start much higher because the keyboard covers the bottom half.
    // Desktop can stay centered.
    const widthRatio = this.isMobile ? 0.95 : CONFIG.BUCKET_WIDTH_RATIO;
    const heightRatio = this.isMobile ? 0.8 : 0.4;

    const bucketWidth = Math.min(w * widthRatio, 500);
    // On mobile, keyboard can take up to 50% or more. Let's be aggressive.
    const effectiveScreenHeight = this.isMobile ? h * 0.52 : h;
    let bucketHeight = effectiveScreenHeight * heightRatio;

    if (!this.isMobile) {
      bucketHeight = Math.min(bucketHeight, 400);
    }

    const bucketX = (w - bucketWidth) / 2;
    // Start bucket lower on mobile to push it down towards the keyboard
    const bucketY = this.isMobile ? 120 : (h - bucketHeight) / 2;

    const wallThickness = CONFIG.BUCKET_WALL_THICKNESS;

    this.bucket = {
      x: bucketX,
      y: bucketY,
      width: bucketWidth,
      height: bucketHeight,
      innerLeft: bucketX + wallThickness,
      innerRight: bucketX + bucketWidth - wallThickness,
      innerTop: bucketY,
      innerBottom: bucketY + bucketHeight - wallThickness,
      dangerLineY: bucketY + bucketHeight * CONFIG.DANGER_LINE_PERCENT,
    };

    // Position typing buffer above the keyboard
    const bufferDisplay = document.getElementById("bufferDisplay");
    if (bufferDisplay) {
      if (this.isMobile) {
        // Position it right under the bucket with a small gap
        bufferDisplay.style.top = bucketY + bucketHeight + 10 + "px";
        bufferDisplay.style.bottom = "auto";
      } else {
        bufferDisplay.style.top = "auto";
        bufferDisplay.style.bottom = "2rem";
      }
    }

    console.log("[WordfallGame.calculateLayout] bucket:", this.bucket);

    // Position combo display inside the bucket
    const comboDisplay = document.getElementById("comboDisplay");
    if (comboDisplay) {
      comboDisplay.style.top = bucketY + bucketHeight / 2 + "px";
    }
  }

  createBucketWalls() {
    // Remove old walls
    for (const wall of this.wallBodies) {
      Matter.Composite.remove(this.world, wall);
    }
    this.wallBodies = [];

    const { x, y, width, height } = this.bucket;
    const t = CONFIG.BUCKET_WALL_THICKNESS;
    const cr = CONFIG.BUCKET_CORNER_RADIUS;

    // Bottom wall
    const bottom = Matter.Bodies.rectangle(
      x + width / 2,
      y + height - t / 2,
      width,
      t,
      { isStatic: true, friction: 1, label: "bottom-wall" },
    );

    // Left wall
    const left = Matter.Bodies.rectangle(x + t / 2, y + height / 2, t, height, {
      isStatic: true,
      friction: 1,
      label: "wall",
    });

    // Right wall
    const right = Matter.Bodies.rectangle(
      x + width - t / 2,
      y + height / 2,
      t,
      height,
      { isStatic: true, friction: 1, label: "wall" },
    );

    this.wallBodies = [bottom, left, right];
    Matter.Composite.add(this.world, this.wallBodies);
  }

  setupEventListeners() {
    console.log("[WordfallGame.setupEventListeners]");

    const input = document.getElementById("typingInput") as HTMLInputElement;
    const startBtn = document.getElementById("startButton");
    const restartBtn = document.getElementById("restartButton");
    const menuBtn = document.getElementById("menuButton");

    const triggerLightHaptic = () => {
      this.triggerHaptic("light");
      this.audio.playClick();
    };

    startBtn?.addEventListener("click", () => {
      triggerLightHaptic();
      this.startGame();
    });
    restartBtn?.addEventListener("click", () => {
      triggerLightHaptic();
      this.startGame();
    });
    menuBtn?.addEventListener("click", () => {
      triggerLightHaptic();
      this.showMenu();
    });

    // Settings
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const settingsCloseBtn = document.getElementById("settingsCloseBtn");
    const musicToggle = document.getElementById("musicToggle");
    const fxToggle = document.getElementById("fxToggle");
    const hapticsToggle = document.getElementById("hapticsToggle");

    settingsBtn?.addEventListener("click", () => {
      triggerLightHaptic();
      settingsModal?.classList.add("active");
      
      if (this.state.started && !this.state.gameOver) {
        this.stopLoop();
      }
    });

    settingsCloseBtn?.addEventListener("click", () => {
      triggerLightHaptic();
      settingsModal?.classList.remove("active");
      
      if (this.state.started && !this.state.gameOver) {
        this.startLoop();
        input.focus();
      }
    });

    musicToggle?.addEventListener("click", () => {
      this.settings.music = !this.settings.music;
      this.saveSettings();
      this.updateSettingsUi();
      triggerLightHaptic();
    });

    fxToggle?.addEventListener("click", () => {
      this.settings.fx = !this.settings.fx;
      this.saveSettings();
      this.updateSettingsUi();
      triggerLightHaptic();
    });

    hapticsToggle?.addEventListener("click", () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings();
      this.updateSettingsUi();
      triggerLightHaptic();
    });

    // Input handling
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.typedBuffer = target.value.toLowerCase();
      this.updateBufferDisplay();
      this.checkAutoMatch();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.submitBuffer();
      }
    });

    // Keep input focused
    this.canvas.addEventListener("click", () => {
      if (this.state.started && !this.state.gameOver) {
        input.focus();
      }
    });

    input.addEventListener("blur", () => {
      if (this.state.started && !this.state.gameOver) {
        setTimeout(() => input.focus(), 10);
      }
    });
  }

  setupCollisionEvents() {
    Matter.Events.on(this.engine, "collisionStart", (event) => {
      if (!this.state.started || this.state.gameOver) return;

      let triggered = false;
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const labelA = bodyA.label || "";
        const labelB = bodyB.label || "";

        const isWordA = labelA.startsWith("word-");
        const isWordB = labelB.startsWith("word-");
        const isBottomA = labelA === "bottom-wall";
        const isBottomB = labelB === "bottom-wall";

        // Collision between two words OR word with the bottom wall
        if (
          (isWordA && isWordB) ||
          (isWordA && isBottomB) ||
          (isWordB && isBottomA)
        ) {
          triggered = true;
          break; // One haptic per collision event is enough
        }
      }

      if (triggered) {
        if (this.settings.haptics) {
          oasiz.triggerHaptic("light");
        }
      }
    });
  }

  startGame() {
    console.log("[WordfallGame.startGame]");

    this.audio.init();
    this.audio.startMusic();
    document.body.style.background = "#0a0e1a";

    // Clear all word bodies
    for (const word of this.words) {
      Matter.Composite.remove(this.world, word.body);
    }

    this.state = this.createInitialState();
    this.state.started = true;
    this.words = [];
    this.typedBuffer = "";
    this.spawnTimer = 0;
    this.nextSpawnInterval = randomRange(
      CONFIG.SPAWN_INTERVAL_MIN,
      CONFIG.SPAWN_INTERVAL_MAX,
    );
    this.engine.world.gravity.y = CONFIG.GRAVITY;
    this.engine.timing.timeScale = 1;

    // Start game loop
    this.startLoop();

    // Hide overlays, show HUD
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("hud")!.style.display = "flex";
    document.getElementById("bufferDisplay")!.style.display = "block";

    // Focus input
    const input = document.getElementById("typingInput") as HTMLInputElement;
    input.value = "";
    input.focus();

    this.updateBufferDisplay();
    this.updateHUD();
  }

  showMenu() {
    this.stopLoop();

    // Clear words
    for (const word of this.words) {
      Matter.Composite.remove(this.world, word.body);
    }
    this.words = [];

    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("startScreen")?.classList.remove("hidden");
    document.getElementById("hud")!.style.display = "none";
    document.getElementById("bufferDisplay")!.style.display = "none";
  }

  updateBufferDisplay() {
    const bufferText = document.getElementById("bufferText");
    if (bufferText) {
      bufferText.textContent = this.typedBuffer;
    }
  }

  private lastDisplayedScore = 0;

  updateHUD() {
    const scoreEl = document.getElementById("score")!;
    scoreEl.textContent = this.state.score.toString();
    if (this.state.score !== this.lastDisplayedScore) {
      this.lastDisplayedScore = this.state.score;
      scoreEl.classList.remove("pop");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("pop");
    }
  }

  // Word spawning
  spawnWord() {
    const type = this.getRandomWordType();
    const text = type === "normal" ? this.getRandomWord() : type;

    console.log("[WordfallGame.spawnWord]", text, "type:", type);

    // Measure text
    const fontSize = this.isMobile ? 20 : 18;
    this.ctx.font = "700 " + fontSize + "px 'JetBrains Mono', monospace";
    const textWidth = this.ctx.measureText(text).width;
    const padding = 14;
    const width = textWidth + padding * 2;
    const height = fontSize + padding * 1.5;

    // Spawn position - random x within bucket, above the bucket
    const spawnMargin = 10;
    const minX = this.bucket.innerLeft + width / 2 + spawnMargin;
    const maxX = this.bucket.innerRight - width / 2 - spawnMargin;
    const spawnX = minX + Math.random() * Math.max(0, maxX - minX);
    const spawnY = this.bucket.y - height - 40 - Math.random() * 30;

    // Create physics body with chamfered corners
    const body = Matter.Bodies.rectangle(spawnX, spawnY, width, height, {
      chamfer: { radius: CONFIG.WORD_CHAMFER_RADIUS },
      restitution: CONFIG.WORD_RESTITUTION,
      friction: CONFIG.WORD_FRICTION,
      frictionStatic: 1,
      frictionAir: 0.02,
      label: "word-" + this.nextWordId,
    });

    // Add slight random rotation
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);

    Matter.Composite.add(this.world, body);

    const wordData: WordData = {
      id: this.nextWordId++,
      text,
      type,
      body,
      width,
      height,
      scale: 1,
      exploding: false,
      explosionProgress: 0,
    };

    this.words.push(wordData);
  }

  getRandomWordType(): WordType {
    const r = Math.random();
    if (r < CONFIG.PROB_BOMB) return "bomb";
    if (r < CONFIG.PROB_BOMB + CONFIG.PROB_FREEZE) return "freeze";
    if (r < CONFIG.PROB_BOMB + CONFIG.PROB_FREEZE + CONFIG.PROB_SHRINK)
      return "shrink";
    return "normal";
  }

  getRandomWord(): string {
    // Bias selection towards longer words
    // Available lengths are 3 to 12
    const lengths = Array.from(this.wordsByLength.keys()).sort((a, b) => a - b);
    if (lengths.length === 0) return "error";

    // Use a power function to bias towards higher indices (longer words)
    // Math.pow(r, 0.6) biases towards 1.0
    const biasedRandom = Math.pow(Math.random(), 0.6);
    const lengthIndex = Math.floor(biasedRandom * lengths.length);
    const targetLength = lengths[lengthIndex];

    const wordsAtLength = this.wordsByLength.get(targetLength)!;
    return wordsAtLength[Math.floor(Math.random() * wordsAtLength.length)];
  }

  // Input handling
  private flashBuffer() {
    const container = document.querySelector(".buffer-container");
    if (container) {
      container.classList.remove("flash");
      void (container as HTMLElement).offsetWidth;
      container.classList.add("flash");
    }
  }

  checkAutoMatch() {
    if (!this.typedBuffer) return;

    const matchingWord = this.findMatchingWord(this.typedBuffer);
    if (matchingWord) {
      this.clearWord(matchingWord);
      this.typedBuffer = "";
      (document.getElementById("typingInput") as HTMLInputElement).value = "";
      this.updateBufferDisplay();
      this.flashBuffer();
    }
  }

  submitBuffer() {
    if (!this.typedBuffer) return;

    const matchingWord = this.findMatchingWord(this.typedBuffer);
    if (matchingWord) {
      this.clearWord(matchingWord);
      this.typedBuffer = "";
      (document.getElementById("typingInput") as HTMLInputElement).value = "";
      this.updateBufferDisplay();
      this.flashBuffer();
    }
  }

  findMatchingWord(text: string): WordData | null {
    // Find lowest matching word (by y position, highest number = lowest on screen)
    let match: WordData | null = null;
    let maxY = -Infinity;

    for (const word of this.words) {
      if (word.exploding) continue;
      if (word.text.toLowerCase() === text.toLowerCase()) {
        const y = word.body.position.y;
        if (y > maxY) {
          maxY = y;
          match = word;
        }
      }
    }

    return match;
  }

  clearWord(word: WordData) {
    console.log("[WordfallGame.clearWord]", word.text, "type:", word.type);

    const pos = word.body.position;

    // Calculate score
    let score = CONFIG.SCORE_BASE + word.text.length;

    // Handle special effects
    switch (word.type) {
      case "bomb":
        score = CONFIG.SCORE_BOMB;
        this.triggerBombEffect(word);
        break;
      case "freeze":
        score = CONFIG.SCORE_FREEZE;
        this.triggerFreezeEffect();
        this.particles.emitExplosion(pos.x, pos.y, CONFIG.COLOR_FREEZE.bg);
        break;
      case "shrink":
        score = CONFIG.SCORE_SHRINK;
        this.triggerShrinkEffect();
        this.particles.emitExplosion(pos.x, pos.y, CONFIG.COLOR_SHRINK.bg);
        break;
      default:
        this.particles.emitExplosion(pos.x, pos.y, CONFIG.COLOR_NORMAL.bg);
        this.audio.playClear();
        this.triggerHaptic("light");
    }

    // Combo handling
    const now = this.state.survivalTime;
    if (now - this.state.lastClearTime < CONFIG.COMBO_TIMEOUT) {
      this.state.combo++;
      if (this.state.combo > 1) {
        score = Math.floor(score * (1 + this.state.combo * 0.25));
        this.showCombo(this.state.combo);
        this.audio.playCombo(this.state.combo);
      }
    } else {
      this.state.combo = 1;
    }
    this.state.lastClearTime = now;
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);

    this.state.score += score;
    this.state.wordsCleared++;

    // Remove the word
    this.removeWord(word);

    this.updateHUD();
  }

  removeWord(word: WordData) {
    Matter.Composite.remove(this.world, word.body);
    const idx = this.words.indexOf(word);
    if (idx !== -1) {
      this.words.splice(idx, 1);
    }
  }

  triggerBombEffect(bomb: WordData) {
    console.log("[WordfallGame.triggerBombEffect]");

    const pos = bomb.body.position;

    this.particles.emitBombExplosion(pos.x, pos.y);
    this.shake.trigger(1.0);
    this.audio.playBomb();
    this.triggerHaptic("heavy");

    // Destroy nearby words
    const toRemove: WordData[] = [];
    for (const word of this.words) {
      if (word.id === bomb.id) continue;
      if (word.exploding) continue;

      const wp = word.body.position;
      const dist = Math.sqrt(
        Math.pow(wp.x - pos.x, 2) + Math.pow(wp.y - pos.y, 2),
      );

      if (dist < CONFIG.BOMB_RADIUS) {
        this.particles.emitExplosion(
          wp.x,
          wp.y,
          this.getWordColor(word.type).bg,
        );
        this.state.score +=
          CONFIG.SCORE_BOMB_BONUS + Math.floor(word.text.length / 2);
        this.state.wordsCleared++;
        toRemove.push(word);
      }
    }

    for (const w of toRemove) {
      this.removeWord(w);
    }
  }

  triggerFreezeEffect() {
    console.log("[WordfallGame.triggerFreezeEffect]");

    this.state.frozen = true;
    this.state.freezeTimer = CONFIG.FREEZE_DURATION;

    // Pause physics
    this.engine.timing.timeScale = 0;

    document.getElementById("freezeOverlay")?.classList.add("active");
    document.getElementById("freezeTimer")?.classList.add("active");

    this.audio.playFreeze();
    this.triggerHaptic("medium");
  }

  triggerShrinkEffect() {
    console.log("[WordfallGame.triggerShrinkEffect]");

    this.audio.playShrink();
    this.triggerHaptic("medium");

    // Shrink all current words
    for (const word of this.words) {
      if (word.exploding) continue;

      const newScale = Math.max(
        CONFIG.SHRINK_MIN_SCALE,
        word.scale * CONFIG.SHRINK_SCALE,
      );
      const scaleRatio = newScale / word.scale;
      word.scale = newScale;

      // Scale the physics body
      Matter.Body.scale(word.body, scaleRatio, scaleRatio);
      word.width *= scaleRatio;
      word.height *= scaleRatio;

      this.particles.emit(
        word.body.position.x,
        word.body.position.y,
        CONFIG.COLOR_SHRINK.bg,
        5,
      );
    }
  }

  showCombo(count: number) {
    const comboDisplay = document.getElementById("comboDisplay");
    if (comboDisplay) {
      comboDisplay.textContent = count + "x COMBO!";
      comboDisplay.classList.remove("active", "tier-1", "tier-2", "tier-3");

      // Determine tier and add juice
      let hapticType = "light";
      let shakeIntensity = 0;

      if (count === 2) {
        comboDisplay.classList.add("tier-1");
        hapticType = "medium";
        shakeIntensity = 0.2;
      } else if (count === 3) {
        comboDisplay.classList.add("tier-2");
        hapticType = "success";
        shakeIntensity = 0.4;
      } else {
        comboDisplay.classList.add("tier-3");
        hapticType = "heavy";
        shakeIntensity = 0.7;
      }

      // Trigger effects
      this.triggerHaptic(hapticType as "light" | "medium" | "heavy" | "success" | "error");
      this.shake.trigger(shakeIntensity);

      void comboDisplay.offsetWidth;
      comboDisplay.classList.add("active");

      setTimeout(() => comboDisplay.classList.remove("active"), 800);
    }
  }

  getWordColor(type: WordType) {
    switch (type) {
      case "bomb":
        return CONFIG.COLOR_BOMB;
      case "freeze":
        return CONFIG.COLOR_FREEZE;
      case "shrink":
        return CONFIG.COLOR_SHRINK;
      default:
        return CONFIG.COLOR_NORMAL;
    }
  }

  // Game state checks
  checkDangerLine(): boolean {
    // Don't check in first 2 seconds
    if (this.state.survivalTime < 2) return false;

    for (const word of this.words) {
      if (word.exploding) continue;

      const pos = word.body.position;
      const top = pos.y - word.height / 2;
      const bottom = pos.y + word.height / 2;

      // Only check words that have entered the bucket
      if (bottom < this.bucket.y + 40) continue;

      // IMPORTANT: Only trigger game over if the word is moving slowly or resting.
      // This prevents falling words from triggering it as they pass through.
      const isMovingFast = Math.abs(word.body.velocity.y) > 1.5;
      if (isMovingFast) continue;

      // Check if word top is above danger line
      if (top < this.bucket.dangerLineY) {
        return true;
      }
    }
    return false;
  }

  endGame() {
    console.log("[WordfallGame.endGame] Final score:", this.state.score);

    this.state.gameOver = true;
    this.stopLoop();
    this.audio.playGameOver();

    oasiz.submitScore(this.state.score);
    this.triggerHaptic("error");

    // Update game over screen
    document.getElementById("finalScore")!.textContent =
      this.state.score.toString();
    document.getElementById("wordsCleared")!.textContent =
      this.state.wordsCleared.toString();
    document.getElementById("bestCombo")!.textContent =
      this.state.maxCombo.toString();

    // Clear freeze overlay
    document.getElementById("freezeOverlay")?.classList.remove("active");
    document.getElementById("freezeTimer")?.classList.remove("active");

    setTimeout(() => {
      document.getElementById("gameOverScreen")?.classList.remove("hidden");
    }, 500);
  }

  // Main update
  update(dt: number) {
    if (!this.state.started || this.state.gameOver) return;

    this.state.survivalTime += dt;

    // Freeze timer
    if (this.state.frozen) {
      this.state.freezeTimer -= dt;
      document.getElementById("freezeTimer")!.textContent = Math.ceil(
        this.state.freezeTimer,
      ).toString();

      if (this.state.freezeTimer <= 0) {
        this.state.frozen = false;
        this.engine.timing.timeScale = 1;
        document.getElementById("freezeOverlay")?.classList.remove("active");
        document.getElementById("freezeTimer")?.classList.remove("active");
      }
    }

    // Always compute ramp and update background regardless of freeze state
    {
      const minutes = this.state.survivalTime / 60;
      let wpm = 0;
      if (minutes > 0.1) {
        wpm = this.state.wordsCleared / minutes;
      }
      const speedFactor = Math.min(2.5, Math.max(1, 1 + ((wpm - 10) / 50)));
      const ramp = Math.min(
        1,
        this.state.survivalTime * CONFIG.DIFFICULTY_RAMP_RATE * speedFactor,
      );
      const hue = 210 - ramp * 210;
      const sat = 50 + ramp * 30;
      const light = 6 + ramp * 3;
      document.body.style.background = `hsl(${hue}, ${sat}%, ${light}%)`;
    }

    // Spawn words (not during freeze)
    if (!this.state.frozen) {
      const minutes = this.state.survivalTime / 60;
      let wpm = 0;
      if (minutes > 0.1) {
        wpm = this.state.wordsCleared / minutes;
      }
      const speedFactor = Math.min(2.5, Math.max(1, 1 + ((wpm - 10) / 50)));
      const ramp = Math.min(
        1,
        this.state.survivalTime * CONFIG.DIFFICULTY_RAMP_RATE * speedFactor,
      );
      this.engine.world.gravity.y =
        CONFIG.GRAVITY + (CONFIG.GRAVITY_MAX - CONFIG.GRAVITY) * ramp;

      this.spawnTimer += dt;
      if (this.spawnTimer >= this.nextSpawnInterval) {
        this.spawnTimer = 0;

        const min =
          CONFIG.SPAWN_INTERVAL_MIN -
          (CONFIG.SPAWN_INTERVAL_MIN - CONFIG.SPAWN_INTERVAL_MIN_LIMIT) * ramp;
        const max =
          CONFIG.SPAWN_INTERVAL_MAX -
          (CONFIG.SPAWN_INTERVAL_MAX - CONFIG.SPAWN_INTERVAL_MAX_LIMIT) * ramp;

        this.nextSpawnInterval = randomRange(min, max);
        this.spawnWord();

        // Rare double spawn
        if (Math.random() < CONFIG.DOUBLE_SPAWN_PROB) {
          console.log("[WordfallGame.update] Rare double spawn!");
          this.spawnWord();
        }
      }
    }

    // Clean up words that fell way below bucket (shouldn't happen but just in case)
    for (let i = this.words.length - 1; i >= 0; i--) {
      const word = this.words[i];
      if (word.body.position.y > this.canvas.height + 200) {
        this.removeWord(word);
      }
    }

    // Check danger line
    if (this.checkDangerLine()) {
      this.state.dangerGraceTimer += dt;
      if (this.state.dangerGraceTimer >= CONFIG.GRACE_PERIOD) {
        this.endGame();
      }
    } else {
      this.state.dangerGraceTimer = 0;
    }

    // Update systems
    this.particles.update(dt);
    this.shake.update(dt);

    this.updateHUD();
  }

  // Rendering
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear with transparent background to see the body gradient
    ctx.clearRect(0, 0, w, h);

    if (!this.state.started) return;

    ctx.save();
    ctx.translate(this.shake.x, this.shake.y);

    // Draw bucket
    this.renderBucket(ctx);

    // Draw danger line
    this.renderDangerLine(ctx);

    // Sort words by Y position so ones lower on the screen (closer to camera) are drawn on top
    const sortedWords = [...this.words].sort((a, b) => a.body.position.y - b.body.position.y);

    // Draw words
    for (const word of sortedWords) {
      if (!word.exploding) {
        this.renderWord(ctx, word);
      }
    }

    // Particles
    this.particles.draw(ctx);

    ctx.restore();
  }

  renderBucket(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bucket;
    const t = CONFIG.BUCKET_WALL_THICKNESS;
    const cr = CONFIG.BUCKET_CORNER_RADIUS;

    const drawBucketPath = (offsetY: number = 0) => {
      ctx.beginPath();
      ctx.moveTo(x, y + offsetY);
      ctx.lineTo(x, y + height - cr + offsetY);
      ctx.quadraticCurveTo(x, y + height + offsetY, x + cr, y + height + offsetY);
      ctx.lineTo(x + width - cr, y + height + offsetY);
      ctx.quadraticCurveTo(x + width, y + height + offsetY, x + width, y + height - cr + offsetY);
      ctx.lineTo(x + width, y + offsetY);
      ctx.lineTo(x + width - t, y + offsetY);
      ctx.lineTo(x + width - t, y + height - cr - t + offsetY);
      ctx.quadraticCurveTo(x + width - t, y + height - t + offsetY, x + width - t - cr, y + height - t + offsetY);
      ctx.lineTo(x + t + cr, y + height - t + offsetY);
      ctx.quadraticCurveTo(x + t, y + height - t + offsetY, x + t, y + height - t - cr + offsetY);
      ctx.lineTo(x + t, y + offsetY);
      ctx.closePath();
    };

    // Draw solid shadow block (offset down)
    drawBucketPath(6);
    ctx.fillStyle = CONFIG.COLOR_BUCKET_SHADOW;
    ctx.fill();

    // Draw main bucket body
    drawBucketPath(0);
    ctx.fillStyle = CONFIG.COLOR_BUCKET;
    ctx.fill();

    // Inner and outer border
    ctx.strokeStyle = CONFIG.COLOR_BUCKET_BORDER;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  renderDangerLine(ctx: CanvasRenderingContext2D) {
    const { innerLeft, innerRight, dangerLineY } = this.bucket;
    const inDanger = this.state.dangerGraceTimer > 0;
    const alpha = inDanger ? 0.9 : 0.3;

    // Physical looking danger line
    ctx.fillStyle = `rgba(255, 82, 82, ${alpha})`;
    ctx.fillRect(innerLeft, dangerLineY - 3, innerRight - innerLeft, 6);

    // Caution stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerLeft, dangerLineY - 3, innerRight - innerLeft, 6);
    ctx.clip();
    
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    for (let i = 0; i < (innerRight - innerLeft); i += 20) {
      ctx.beginPath();
      ctx.moveTo(innerLeft + i, dangerLineY - 3);
      ctx.lineTo(innerLeft + i + 10, dangerLineY - 3);
      ctx.lineTo(innerLeft + i + 4, dangerLineY + 3);
      ctx.lineTo(innerLeft + i - 6, dangerLineY + 3);
      ctx.fill();
    }
    ctx.restore();
  }

  renderWord(ctx: CanvasRenderingContext2D, word: WordData) {
    const colors = this.getWordColor(word.type);
    const pos = word.body.position;
    const angle = word.body.angle;
    const w = word.width;
    const h = word.height;
    const cr = CONFIG.WORD_CHAMFER_RADIUS * word.scale;

    // Draw rounded-rect helper
    const roundRect = (rx: number, ry: number, rw: number, rh: number, radius: number) => {
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
    };

    const shadowDepth = 6 * word.scale;

    // 1. Draw solid shadow block (offset down GLOBALLY)
    ctx.save();
    ctx.translate(pos.x, pos.y + shadowDepth);
    ctx.rotate(angle);
    ctx.fillStyle = colors.shadow || "rgba(0,0,0,0.5)";
    roundRect(-w / 2, -h / 2, w, h, cr);
    ctx.fill();
    ctx.restore();

    // 2. Draw main block body
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    
    ctx.fillStyle = colors.bg;
    roundRect(-w / 2, -h / 2, w, h, cr);
    ctx.fill();

    // 3. Top edge highlight for bevel effect
    ctx.strokeStyle = colors.highlight || "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + cr, -h / 2 + 1.5);
    ctx.lineTo(w / 2 - cr, -h / 2 + 1.5);
    ctx.stroke();

    // Text rendering with prefix highlighting
    const fontSize = (this.isMobile ? 20 : 18) * word.scale;
    ctx.font = "800 " + fontSize + "px 'Nunito', sans-serif";
    ctx.textBaseline = "middle";

    const wordLower = word.text.toLowerCase();
    const bufferLower = this.typedBuffer.toLowerCase();
    const hasMatch =
      bufferLower.length > 0 && wordLower.startsWith(bufferLower);

    if (hasMatch) {
      // Draw the word in two parts: highlighted prefix + remaining
      const matchLen = bufferLower.length;
      const matchedPart = word.text.substring(0, matchLen);
      const remainingPart = word.text.substring(matchLen);

      // Measure both parts
      const matchedWidth = ctx.measureText(matchedPart).width;
      const remainingWidth = ctx.measureText(remainingPart).width;
      const totalWidth = matchedWidth + remainingWidth;

      const startX = -totalWidth / 2;

      // Draw matched part with highlight color
      ctx.textAlign = "left";
      ctx.fillStyle = "#FF9F00";
      ctx.fillText(matchedPart, startX, 1);

      // Draw remaining part with normal color
      ctx.fillStyle = colors.text;
      ctx.fillText(remainingPart, startX + matchedWidth, 1);
    } else {
      // No match, draw normally
      ctx.fillStyle = colors.text;
      ctx.textAlign = "center";
      ctx.fillText(word.text, 0, 1);
    }

    ctx.restore();
  }

  // Game loop
  gameLoop(timestamp: number) {
    const dt = this.lastTime === 0 ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    
    if (this.state.started && !this.state.gameOver) {
      // Manual physics tick
      Matter.Engine.update(this.engine, dt * 1000);
    }

    this.render();

    if (this.rafId !== 0) {
      this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
    }
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Wordfall with Matter.js physics");
  new WordfallGame();
});
