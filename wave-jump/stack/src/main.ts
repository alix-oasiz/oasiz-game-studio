export {};

import * as THREE from "three";
import * as CANNON from "cannon-es";

/* Audio asset imports — Vite inlines these as data-URLs thanks to assetsInlineLimit */
/* chime removed — perfect hits reuse the glass tap at higher pitch */
import marbleBreakUrl from "./audio/marble-break.mp3";
/* collision.mp3 removed — no longer used */
import failUrl from "./audio/fail.mp3";
import gameoverUrl from "./audio/gameover.mp3";
import uiTapUrl from "./audio/ui-tap.mp3";
import growUrl from "./audio/grow.mp3";
import musicLoopUrl from "./audio/music-loop.mp3";

type GameState = "START" | "PLAYING" | "GAME_OVER";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface StackLayer {
  threejs: THREE.Mesh;
  cannonjs: CANNON.Body;
  width: number;
  depth: number;
  direction?: "x" | "z";
}

interface Ray {
  angle: number;
  length: number;
  speed: number;
  life: number;
  maxLife: number;
}

interface PerfectPulse {
  line: THREE.LineSegments;
  life: number;
  maxLife: number;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
  }
}

const CONFIG = {
  BOX_HEIGHT: 0.42,
  ORIGINAL_SIZE: 3,
  MOVE_SPEED: 0.008,
  MAX_SPEED: 0.016,
  SPEED_GAIN: 0.0001,
  PERFECT_THRESHOLD: 0.15,
  RECOVERY_STREAK: 5,
  RECOVERY_AMOUNT: 0.3,
  PRE_STACK: 6,
  COLOR_START: 30,
  COLOR_STEP: 4,
  RAY_COUNT: 10,
  RAY_LIFE: 0.4,
  RAY_SPEED: 200,
  VIEW_SIZE: 10,
};

/* ─────────────────── Audio Manager ─────────────────── */

/* Pitch multipliers for perfect hits — starts one note above the normal tap, ascending */
const PERFECT_PITCHES = [1.122, 1.26, 1.414, 1.498, 1.682, 1.888, 2.0, 2.244];

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private loaded = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== "running") {
      this.ctx.resume().catch(() => {
        console.log("[AudioManager]", "Resume blocked");
      });
    }
    return this.ctx;
  }

  /** Preload all SFX audio buffers (music uses HTMLAudioElement) */
  async preload(): Promise<void> {
    if (this.loaded) return;
    const ctx = this.ensureContext();

    /* All audio loaded as AudioBuffers for precise, gapless playback */
    const assets: [string, string][] = [
      ["marble", marbleBreakUrl],
      ["fail", failUrl],
      ["gameover", gameoverUrl],
      ["ui", uiTapUrl],
      ["grow", growUrl],
      ["music", musicLoopUrl],
    ];

    const promises = assets.map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.buffers.set(name, audioBuf);
        console.log("[AudioManager]", "Loaded: " + name);
      } catch (err) {
        console.log("[AudioManager]", "Failed to load " + name + ": " + err);
      }
    });

    await Promise.all(promises);
    this.loaded = true;
    console.log("[AudioManager]", "All audio loaded");
  }

  /** Play a named sound effect with optional volume and playback rate */
  private playSfx(name: string, volume: number = 1, rate: number = 1): void {
    const ctx = this.ensureContext();
    const buffer = this.buffers.get(name);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  /** Play glass tap — normal pitch for placement, ascending pitch for perfects */
  playMarbleBreak(volume: number = 0.8, rate: number = 1): void {
    this.playSfx("marble", volume, rate);
  }

  /** Play fail sound */
  playFail(volume: number = 0.6): void {
    this.playSfx("fail", volume);
  }

  /** Play game over sound */
  playGameOver(volume: number = 0.7): void {
    this.playSfx("gameover", volume);
  }

  /** Play UI tap sound */
  playUI(volume: number = 0.4): void {
    this.playSfx("ui", volume);
  }

  /** Play grow/power-up sound */
  playGrow(volume: number = 0.7): void {
    this.playSfx("grow", volume);
  }

  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;

  /** Start gapless looping background music via AudioBufferSourceNode */
  startMusic(): void {
    if (this.musicSource) return;
    const ctx = this.ensureContext();
    const buffer = this.buffers.get("music");
    if (!buffer) return;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(ctx.destination);

    this.musicSource = ctx.createBufferSource();
    this.musicSource.buffer = buffer;
    this.musicSource.loop = true; /* sample-accurate gapless loop */
    this.musicSource.connect(this.musicGain);
    this.musicSource.start();

    /* Fade in */
    const now = ctx.currentTime;
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(0.2, now + 0.8);
  }

  /** Stop background music with fade out */
  stopMusic(): void {
    if (!this.ctx || !this.musicGain || !this.musicSource) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0, now + 0.3);

    const src = this.musicSource;
    setTimeout(() => {
      try {
        src.stop();
      } catch (_) {
        /* already stopped */
      }
    }, 350);

    this.musicSource = null;
    this.musicGain = null;
  }
}

/* ─────────────────── Stack Game ─────────────────── */

class StackGame {
  /* Three.js */
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;

  /* Cannon.js */
  private world: CANNON.World;
  private blockMaterial!: CANNON.Material;

  /* Game data */
  private stack: StackLayer[] = [];
  private overhangs: StackLayer[] = [];

  /* State */
  private state: GameState = "START";
  private autopilot = true;
  private gameEnded = false;
  private moveDirection = 1;
  private lastTime = 0;
  private robotPrecision = 0;
  private score = 0;
  private perfectStreak = 0;
  private elapsed = 0;
  private colorHueOffset = 0;
  private overhangBodyIds = new Set<number>();
  private lastCollisionSoundTime = 0;

  /* Scenery */
  private skyDiv!: HTMLDivElement;
  private starCanvas!: HTMLCanvasElement;
  private starCtx!: CanvasRenderingContext2D;

  /* Perf: cached values & throttling */
  private dpr = window.devicePixelRatio;
  private frameCount = 0;
  private prevOverlayScore = -1;
  private stars: {
    x: number;
    y: number;
    size: number;
    brightness: number;
    phase: number;
    twinkleSpeed: number;
  }[] = [];
  private moon = { x: 0, y: 0, radius: 0 };

  /* Perfect placement 3D pulse effects */
  private perfectPulses: PerfectPulse[] = [];

  /* Overlay canvas for 2D effects */
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private flash = 0;
  private rays: Ray[] = [];
  private messageTimer = 0;
  private messageText = "";

  /* Settings & Audio */
  private settings: Settings;
  private audio: AudioManager;
  private isMobile: boolean;

  /* UI elements */
  private startScreen: HTMLDivElement;
  private gameOverScreen: HTMLDivElement;
  private settingsModal: HTMLDivElement;
  private settingsBtn: HTMLButtonElement;
  private toggleMusicBtn: HTMLButtonElement;
  private toggleFxBtn: HTMLButtonElement;
  private toggleHapticsBtn: HTMLButtonElement;
  // score displayed via canvas watermark only
  private finalScore: HTMLDivElement;
  private hud: HTMLDivElement;
  private musicState: HTMLSpanElement;
  private fxState: HTMLSpanElement;
  private hapticsState: HTMLSpanElement;

  constructor() {
    console.log("[StackGame]", "Initializing");

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.settings = this.loadSettings();
    this.audio = new AudioManager();
    /* Preload audio buffers in background (non-blocking) */
    this.audio.preload().catch(() => {
      console.log("[StackGame]", "Audio preload failed");
    });

    /* ── Three.js ── */
    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const d = CONFIG.VIEW_SIZE;
    this.camera = new THREE.OrthographicCamera(
      (d * aspect) / -2,
      (d * aspect) / 2,
      d / 2,
      d / -2,
      0,
      1000,
    );
    this.camera.position.set(4, 4, 4);
    this.camera.lookAt(0, 0, 0);

    /* Ambient light — dim at night, bright at day */
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    /* Directional (sun) light — from top-right */
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
    this.dirLight.position.set(10, 20, -10);
    this.dirLight.castShadow = true;
    const shadowRes = this.isMobile ? 1024 : 2048;
    this.dirLight.shadow.mapSize.width = shadowRes;
    this.dirLight.shadow.mapSize.height = shadowRes;
    this.dirLight.shadow.camera.left = -5;
    this.dirLight.shadow.camera.right = 5;
    this.dirLight.shadow.camera.top = 30;
    this.dirLight.shadow.camera.bottom = -2;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    this.dirLight.shadow.bias = -0.001;
    this.dirLight.shadow.radius = 3;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = this.el<HTMLDivElement>("gameContainer");
    container.appendChild(this.renderer.domElement);

    /* ── Sky gradient div (lowest layer) ── */
    this.skyDiv = document.createElement("div");
    this.skyDiv.style.cssText =
      "position:fixed;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg,hsl(220 20% 4%) 0%,hsl(220 18% 14%) 100%);";
    document.body.appendChild(this.skyDiv);

    /* ── Star background canvas ── */
    this.starCanvas = document.createElement("canvas");
    this.starCanvas.style.cssText =
      "position:fixed;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;";
    document.body.appendChild(this.starCanvas);

    this.starCtx = this.starCanvas.getContext("2d")!;

    this.initScenery();

    /* ── Cannon.js ── */
    this.world = new CANNON.World();
    this.world.gravity.set(0, -25, 0);
    (this.world.solver as CANNON.GSSolver).iterations = 40;

    /* Bouncy block material */
    const blockMat = new CANNON.Material("block");
    const blockContact = new CANNON.ContactMaterial(blockMat, blockMat, {
      friction: 0.3,
      restitution: 0.45,
    });
    this.world.addContactMaterial(blockContact);
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.45;
    this.blockMaterial = blockMat;

    /* Collision sound for falling overhangs */
    this.world.addEventListener(
      "beginContact",
      (event: { bodyA: CANNON.Body; bodyB: CANNON.Body }) => {
        const aIsOverhang = this.overhangBodyIds.has(event.bodyA.id);
        const bIsOverhang = this.overhangBodyIds.has(event.bodyB.id);
        if (!aIsOverhang && !bIsOverhang) return;

        /* No collision sound — only the initial thock on placement */
        void event;
      },
    );

    /* ── Overlay canvas ── */
    this.overlayCanvas = this.el<HTMLCanvasElement>("overlayCanvas");
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;
    this.overlayCanvas.width = window.innerWidth;
    this.overlayCanvas.height = window.innerHeight;

    /* ── UI elements ── */
    this.startScreen = this.el("startScreen");
    this.gameOverScreen = this.el("gameOverScreen");
    this.settingsModal = this.el("settingsModal");
    this.settingsBtn = this.el("settingsBtn");
    this.toggleMusicBtn = this.el("musicToggle");
    this.toggleFxBtn = this.el("fxToggle");
    this.toggleHapticsBtn = this.el("hapticsToggle");
    this.finalScore = this.el("finalScore");
    this.hud = this.el("hud");
    this.musicState = this.el("musicState");
    this.fxState = this.el("fxState");
    this.hapticsState = this.el("hapticsState");

    this.bindEvents();
    this.applySettingsUI();
    this.updateBackground();
    this.initDemo();

    this.renderer.setAnimationLoop((time: number) => this.animate(time));
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const e = document.getElementById(id) as T | null;
    if (!e) throw new Error("Missing #" + id);
    return e;
  }

  /* ═══════ Settings ═══════ */

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem("stack_settings");
      if (raw) {
        const p = JSON.parse(raw) as Partial<Settings>;
        return {
          music: p.music ?? true,
          fx: p.fx ?? true,
          haptics: p.haptics ?? true,
        };
      }
    } catch (_) {
      console.log("[loadSettings]", "Parse error, using defaults");
    }
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("stack_settings", JSON.stringify(this.settings));
  }

  private applySettingsUI(): void {
    this.toggleMusicBtn.classList.toggle("active", this.settings.music);
    this.toggleFxBtn.classList.toggle("active", this.settings.fx);
    this.toggleHapticsBtn.classList.toggle("active", this.settings.haptics);
    this.musicState.textContent = this.settings.music ? "On" : "Off";
    this.fxState.textContent = this.settings.fx ? "On" : "Off";
    this.hapticsState.textContent = this.settings.haptics ? "On" : "Off";
  }

  /* ═══════ Events ═══════ */

  private bindEvents(): void {
    window.addEventListener("resize", () => this.onResize());

    const isUI = (e: Event): boolean => {
      const target = e.target as HTMLElement;
      return !!target.closest(
        ".modal-card, .icon-btn, .setting-row, .settings-list",
      );
    };

    const handleTap = (e: Event): void => {
      if (isUI(e)) return;

      if (this.state === "START") {
        this.startGame();
        return;
      }
      if (this.state === "GAME_OVER") {
        this.startGame();
        return;
      }
      if (this.state === "PLAYING") {
        this.placeBlock();
      }
    };

    window.addEventListener("mousedown", handleTap);
    window.addEventListener("touchstart", handleTap);
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleTap(e);
      }
    });
    this.settingsBtn.addEventListener("click", () => {
      if (this.state !== "PLAYING") return;
      this.settingsModal.classList.remove("hidden");
      this.haptic("light");
      this.fx("ui");
    });
    this.settingsModal.addEventListener("click", (e) => {
      if (e.target === this.settingsModal)
        this.settingsModal.classList.add("hidden");
    });
    /* Debounced toggle helper — prevents iOS double-click (touch→click + mouse→click) */
    let _lastToggleTime = 0;
    const TOGGLE_DEBOUNCE = 300;
    const toggleHandler = (btn: string, callback: () => void) => {
      return (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - _lastToggleTime < TOGGLE_DEBOUNCE) return;
        _lastToggleTime = now;
        this.haptic("light");
        callback();
      };
    };

    this.toggleMusicBtn.addEventListener(
      "click",
      toggleHandler("musicToggle", () => {
        this.settings.music = !this.settings.music;
        this.saveSettings();
        this.applySettingsUI();
        this.fx("ui");
        if (this.settings.music && this.state === "PLAYING")
          this.audio.startMusic();
        else this.audio.stopMusic();
      }),
    );
    this.toggleFxBtn.addEventListener(
      "click",
      toggleHandler("fxToggle", () => {
        this.settings.fx = !this.settings.fx;
        this.saveSettings();
        this.applySettingsUI();
        this.fx("ui");
      }),
    );
    this.toggleHapticsBtn.addEventListener(
      "click",
      toggleHandler("hapticsToggle", () => {
        this.settings.haptics = !this.settings.haptics;
        this.saveSettings();
        this.applySettingsUI();
        this.fx("ui");
      }),
    );
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const d = CONFIG.VIEW_SIZE;

    this.camera.left = (d * aspect) / -2;
    this.camera.right = (d * aspect) / 2;
    this.camera.top = d / 2;
    this.camera.bottom = d / -2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.dpr = window.devicePixelRatio;
    this.initScenery();
  }

  /* ═══════ Background ═══════ */

  /**
   * Background system with 5 smooth color phases.
   *
   * Phase 0 (score 0):  Night — very dark complementary hue, stars visible
   * Phase 1 (score 15): Dawn  — slightly brighter, complementary tint emerges
   * Phase 2 (score 30): Mid   — moderate brightness
   * Phase 3 (score 50): Late  — subtly richer
   * Phase 4 (score 70): Final — stays locked here
   *
   * Background hue is always the COMPLEMENTARY color of the blocks (~180°
   * offset) but kept deep and desaturated so blocks always pop.
   * Gradient: darker on top, lighter on bottom.
   */

  private static BG_PHASES = [
    { score: 0, topS: 20, topL: 4, botS: 18, botL: 14, starAlpha: 1.0 },
    { score: 15, topS: 24, topL: 6, botS: 22, botL: 18, starAlpha: 0.65 },
    { score: 30, topS: 28, topL: 9, botS: 26, botL: 22, starAlpha: 0.3 },
    { score: 50, topS: 32, topL: 12, botS: 30, botL: 26, starAlpha: 0.1 },
    { score: 70, topS: 35, topL: 14, botS: 33, botL: 30, starAlpha: 0.0 },
  ];

  private updateBackground(): void {
    const phases = StackGame.BG_PHASES;
    const s = this.score;

    /* Find the two phases we're between */
    let lo = 0;
    for (let i = 1; i < phases.length; i++) {
      if (s >= phases[i].score) lo = i;
    }
    const hi = Math.min(lo + 1, phases.length - 1);

    /* Interpolation factor between lo and hi (0→1) */
    let t = 0;
    if (lo !== hi) {
      const range = phases[hi].score - phases[lo].score;
      t = Math.min(1, (s - phases[lo].score) / range);
      /* Smooth-step for a gentler transition */
      t = t * t * (3 - 2 * t);
    }

    const lerp = (a: number, b: number): number => a + (b - a) * t;

    const topS = lerp(phases[lo].topS, phases[hi].topS);
    const topL = lerp(phases[lo].topL, phases[hi].topL);
    const botS = lerp(phases[lo].botS, phases[hi].botS);
    const botL = lerp(phases[lo].botL, phases[hi].botL);
    const starAlpha = lerp(phases[lo].starAlpha, phases[hi].starAlpha);

    /* Complementary hue: 180° offset from blocks for maximum contrast */
    const blockHue =
      (this.colorHueOffset + this.stack.length * CONFIG.COLOR_STEP) % 360;
    const compHue = (blockHue + 180) % 360;
    const botHue = (compHue + 15) % 360; /* slight shift for depth */

    this.skyDiv.style.background =
      "linear-gradient(180deg, hsl(" +
      compHue.toFixed(0) +
      " " +
      topS.toFixed(0) +
      "% " +
      topL.toFixed(0) +
      "%) 0%, hsl(" +
      botHue.toFixed(0) +
      " " +
      botS.toFixed(0) +
      "% " +
      botL.toFixed(0) +
      "%) 100%)";

    /* Stars fade out as the sky brightens */
    this.starCanvas.style.opacity = String(Math.max(0, starAlpha));

    /* Update lighting to track the stack */
    this.updateLighting();
  }

  private updateLighting(): void {
    /* Shadow target follows the stack height */
    const stackTop = CONFIG.BOX_HEIGHT * Math.max(this.stack.length - 1, 0);
    this.dirLight.target.position.set(0, stackTop * 0.5, 0);
    this.dirLight.target.updateMatrixWorld();

    /* Update shadow camera to cover the stack */
    this.dirLight.shadow.camera.top = stackTop + 10;
    this.dirLight.shadow.camera.updateProjectionMatrix();
  }

  /* ═══════ Scenery ═══════ */

  private initScenery(): void {
    const dpr = window.devicePixelRatio;
    const w = window.innerWidth * dpr;
    const h = window.innerHeight * dpr;
    this.starCanvas.width = w;
    this.starCanvas.height = h;
    this.starCtx = this.starCanvas.getContext("2d")!;

    /* Generate stars with twinkle data */
    const starCount = Math.floor((w * h) / 2200);
    this.stars = [];
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size:
          Math.random() < 0.08
            ? Math.random() * 2 + 1.5
            : Math.random() * 1.2 + 0.4,
        brightness: Math.random() * 0.5 + 0.5,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.5 + Math.random() * 2.5,
      });
    }

    /* Moon position — upper right area */
    this.moon = {
      x: w * 0.78,
      y: h * 0.12,
      radius: Math.min(w, h) * 0.035,
    };

    this.renderStars(0);
  }

  /* ── Render stars ── */

  private renderStars(_time: number): void {
    const ctx = this.starCtx;
    const w = this.starCanvas.width;
    const h = this.starCanvas.height;
    ctx.clearRect(0, 0, w, h);

    /* Stars with glow */
    for (const s of this.stars) {
      const alpha = s.brightness;
      if (alpha < 0.05) continue;

      /* Glow halo for larger stars */
      if (s.size > 1.2) {
        const grad = ctx.createRadialGradient(
          s.x,
          s.y,
          0,
          s.x,
          s.y,
          s.size * 3,
        );
        grad.addColorStop(
          0,
          "rgba(255,255,255," + (alpha * 0.6).toFixed(3) + ")",
        );
        grad.addColorStop(
          0.4,
          "rgba(200,220,255," + (alpha * 0.2).toFixed(3) + ")",
        );
        grad.addColorStop(1, "rgba(200,220,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(
          s.x - s.size * 3,
          s.y - s.size * 3,
          s.size * 6,
          s.size * 6,
        );
      }

      /* Core dot */
      ctx.fillStyle = "rgba(255,255,255," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Moon — alpha matches the star canvas opacity driven by bg phases */
    const moonAlpha = parseFloat(this.starCanvas.style.opacity || "1");
    if (moonAlpha > 0.02) {
      const m = this.moon;

      /* Outer glow */
      const glow = ctx.createRadialGradient(
        m.x,
        m.y,
        m.radius * 0.5,
        m.x,
        m.y,
        m.radius * 4,
      );
      glow.addColorStop(
        0,
        "rgba(200,210,255," + (moonAlpha * 0.15).toFixed(3) + ")",
      );
      glow.addColorStop(
        0.5,
        "rgba(180,200,255," + (moonAlpha * 0.05).toFixed(3) + ")",
      );
      glow.addColorStop(1, "rgba(180,200,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(
        m.x - m.radius * 4,
        m.y - m.radius * 4,
        m.radius * 8,
        m.radius * 8,
      );

      /* Moon disc */
      const disc = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
      disc.addColorStop(
        0,
        "rgba(240,240,255," + (moonAlpha * 0.9).toFixed(3) + ")",
      );
      disc.addColorStop(
        0.7,
        "rgba(220,225,245," + (moonAlpha * 0.7).toFixed(3) + ")",
      );
      disc.addColorStop(
        1,
        "rgba(200,210,240," + (moonAlpha * 0.3).toFixed(3) + ")",
      );
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fill();

      /* Crescent shadow — offset circle to create crescent shape */
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0," + (moonAlpha * 0.65).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(
        m.x + m.radius * 0.45,
        m.y - m.radius * 0.15,
        m.radius * 0.85,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* ═══════ World Management ═══════ */

  private clearWorld(): void {
    while (this.world.bodies.length > 0) {
      this.world.removeBody(this.world.bodies[0]);
    }
    const meshes = this.scene.children.filter(
      (c: THREE.Object3D) => c.type === "Mesh",
    ) as THREE.Mesh[];
    for (const m of meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.stack = [];
    this.overhangs = [];
    this.overhangBodyIds.clear();

    /* Clean up perfect pulse effects */
    for (const p of this.perfectPulses) {
      this.scene.remove(p.line);
      p.line.geometry.dispose();
      (p.line.material as THREE.Material).dispose();
    }
    this.perfectPulses = [];
  }

  /* ═══════ Demo / Start Screen ═══════ */

  private initDemo(): void {
    this.state = "START";
    this.autopilot = true;
    this.gameEnded = false;
    this.lastTime = 0;
    this.score = 0;
    this.perfectStreak = 0;
    this.colorHueOffset = Math.floor(Math.random() * 360);
    this.setRobotPrecision();

    this.startScreen.classList.remove("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.settingsModal.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.hud.classList.add("hidden");

    this.clearWorld();

    /* Pre-build a demo stack so the scene looks alive immediately */
    const demoStack = CONFIG.PRE_STACK;
    for (let i = 0; i < demoStack; i++) {
      this.addLayer(0, 0, CONFIG.ORIGINAL_SIZE, CONFIG.ORIGINAL_SIZE);
    }

    /* First moving block on top of the pre-stack */
    this.addLayer(-8, 0, CONFIG.ORIGINAL_SIZE, CONFIG.ORIGINAL_SIZE, "x");

    /* Camera at top of pre-stack */
    const camY = CONFIG.BOX_HEIGHT * demoStack + 4;
    this.camera.position.set(4, camY, 4);
    this.camera.lookAt(0, camY - 4, 0);

    this.updateBackground();
  }

  /* ═══════ Game Start ═══════ */

  private startGame(): void {
    console.log("[startGame]", "Starting new run");

    this.state = "PLAYING";
    this.autopilot = false;
    this.gameEnded = false;
    this.lastTime = 0;
    this.score = 0;
    this.perfectStreak = 0;
    this.moveDirection = 1;
    this.colorHueOffset = Math.floor(Math.random() * 360);
    this.flash = 0;
    this.rays = [];
    this.messageTimer = 0;

    this.startScreen.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.settingsModal.classList.add("hidden");
    this.settingsBtn.classList.remove("hidden");
    this.hud.classList.remove("hidden");

    this.clearWorld();

    /* Pre-stack base */
    for (let i = 0; i < CONFIG.PRE_STACK; i++) {
      this.addLayer(0, 0, CONFIG.ORIGINAL_SIZE, CONFIG.ORIGINAL_SIZE);
    }

    /* First active layer */
    this.addLayer(-8, 0, CONFIG.ORIGINAL_SIZE, CONFIG.ORIGINAL_SIZE, "x");

    /* Camera at top of pre-stack */
    const camY = CONFIG.BOX_HEIGHT * CONFIG.PRE_STACK + 4;
    this.camera.position.set(4, camY, 4);
    this.camera.lookAt(0, camY - 4, 0);

    this.updateBackground();

    if (this.settings.music) this.audio.startMusic();
    else this.audio.stopMusic();
  }

  /* ═══════ Core Logic ═══════ */

  private addLayer(
    x: number,
    z: number,
    width: number,
    depth: number,
    direction?: "x" | "z",
  ): void {
    const y = CONFIG.BOX_HEIGHT * this.stack.length;
    const layer = this.generateBox(x, y, z, width, depth, false);
    layer.direction = direction;
    this.stack.push(layer);
  }

  private addOverhang(
    x: number,
    z: number,
    width: number,
    depth: number,
  ): void {
    const y = CONFIG.BOX_HEIGHT * (this.stack.length - 1);
    const overhang = this.generateBox(x, y, z, width, depth, true);
    this.overhangBodyIds.add(overhang.cannonjs.id);
    this.overhangs.push(overhang);
  }

  private generateBox(
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    falls: boolean,
  ): StackLayer {
    /* Three.js mesh */
    const geometry = new THREE.BoxGeometry(width, CONFIG.BOX_HEIGHT, depth);
    const hue =
      (this.colorHueOffset + this.stack.length * CONFIG.COLOR_STEP) % 360;
    /* Start lighter at the base, get darker as the tower grows */
    const lightness = Math.max(0.28, 0.65 - this.stack.length * 0.012);
    const color = new THREE.Color();
    color.setHSL(hue / 360, 0.85, lightness);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    /* Cannon.js body */
    const shape = new CANNON.Box(
      new CANNON.Vec3(width / 2, CONFIG.BOX_HEIGHT / 2, depth / 2),
    );
    let mass = falls ? 5 : 0;
    mass *= width / CONFIG.ORIGINAL_SIZE;
    mass *= depth / CONFIG.ORIGINAL_SIZE;
    const body = new CANNON.Body({ mass, shape, material: this.blockMaterial });
    body.position.set(x, y, z);
    this.world.addBody(body);

    return { threejs: mesh, cannonjs: body, width, depth };
  }

  private placeBlock(): void {
    const modalOpen = !this.settingsModal.classList.contains("hidden");
    if (this.gameEnded || this.state !== "PLAYING" || modalOpen) return;
    this.splitBlockAndAddNext();
  }

  private splitBlockAndAddNext(): void {
    if (this.gameEnded) return;

    const topLayer = this.stack[this.stack.length - 1];
    const prevLayer = this.stack[this.stack.length - 2];

    if (!topLayer.direction) return;

    const direction = topLayer.direction;
    const size = direction === "x" ? topLayer.width : topLayer.depth;

    const topPos =
      direction === "x"
        ? topLayer.threejs.position.x
        : topLayer.threejs.position.z;
    const prevPos =
      direction === "x"
        ? prevLayer.threejs.position.x
        : prevLayer.threejs.position.z;

    const delta = topPos - prevPos;
    const overhangSize = Math.abs(delta);
    const overlap = size - overhangSize;

    if (overlap <= 0) {
      this.missedTheSpot();
      return;
    }

    const isPerfect = overhangSize < CONFIG.PERFECT_THRESHOLD;

    if (isPerfect) {
      /* ── Perfect placement ── */
      if (direction === "x") {
        topLayer.threejs.position.x = prevLayer.threejs.position.x;
        topLayer.cannonjs.position.x = prevLayer.threejs.position.x;
      } else {
        topLayer.threejs.position.z = prevLayer.threejs.position.z;
        topLayer.cannonjs.position.z = prevLayer.threejs.position.z;
      }

      this.perfectStreak++;
      const isRecovery = this.perfectStreak % CONFIG.RECOVERY_STREAK === 0;

      if (isRecovery) {
        topLayer.width = Math.min(
          CONFIG.ORIGINAL_SIZE,
          topLayer.width + CONFIG.RECOVERY_AMOUNT,
        );
        topLayer.depth = Math.min(
          CONFIG.ORIGINAL_SIZE,
          topLayer.depth + CONFIG.RECOVERY_AMOUNT,
        );

        /* Rebuild geometry */
        const newGeom = new THREE.BoxGeometry(
          topLayer.width,
          CONFIG.BOX_HEIGHT,
          topLayer.depth,
        );
        topLayer.threejs.geometry.dispose();
        topLayer.threejs.geometry = newGeom;
        topLayer.threejs.scale.set(1, 1, 1);

        /* Rebuild physics shape */
        const newShape = new CANNON.Box(
          new CANNON.Vec3(
            topLayer.width / 2,
            CONFIG.BOX_HEIGHT / 2,
            topLayer.depth / 2,
          ),
        );
        topLayer.cannonjs.removeShape(topLayer.cannonjs.shapes[0]);
        topLayer.cannonjs.addShape(newShape);
      }

      this.flash = isRecovery ? 1.4 : 1;
      if (isRecovery) {
        this.messageText = "GROW";
        this.messageTimer = 0.7;
        this.fx("grow");
      } else if (this.perfectStreak >= 2) {
        this.messageText = "Perfect x" + this.perfectStreak;
        this.messageTimer = 0.45;
      }
      this.spawnPerfectPulse(
        topLayer.threejs.position.x,
        topLayer.threejs.position.y,
        topLayer.threejs.position.z,
        topLayer.width,
        topLayer.depth,
      );

      this.fx("perfect");
      this.haptic("success");
    } else {
      /* ── Trim block ── */
      this.perfectStreak = 0;

      const newWidth = direction === "x" ? overlap : topLayer.width;
      const newDepth = direction === "z" ? overlap : topLayer.depth;

      topLayer.width = newWidth;
      topLayer.depth = newDepth;

      /* Update Three.js */
      if (direction === "x") {
        topLayer.threejs.scale.x = overlap / size;
        topLayer.threejs.position.x -= delta / 2;
        topLayer.cannonjs.position.x -= delta / 2;
      } else {
        topLayer.threejs.scale.z = overlap / size;
        topLayer.threejs.position.z -= delta / 2;
        topLayer.cannonjs.position.z -= delta / 2;
      }

      /* Update Cannon.js shape */
      const cutShape = new CANNON.Box(
        new CANNON.Vec3(newWidth / 2, CONFIG.BOX_HEIGHT / 2, newDepth / 2),
      );
      topLayer.cannonjs.removeShape(topLayer.cannonjs.shapes[0]);
      topLayer.cannonjs.addShape(cutShape);

      /* Overhang (falling piece) */
      const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
      const overhangX =
        direction === "x"
          ? topLayer.threejs.position.x + overhangShift
          : topLayer.threejs.position.x;
      const overhangZ =
        direction === "z"
          ? topLayer.threejs.position.z + overhangShift
          : topLayer.threejs.position.z;
      const overhangWidth = direction === "x" ? overhangSize : topLayer.width;
      const overhangDepth = direction === "z" ? overhangSize : topLayer.depth;

      this.addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

      this.fx("place");
      this.haptic("medium");
    }

    /* Next layer */
    const nextDir: "x" | "z" = direction === "x" ? "z" : "x";
    const nextX = direction === "x" ? topLayer.threejs.position.x : -8;
    const nextZ = direction === "z" ? topLayer.threejs.position.z : -8;

    this.score++;
    this.moveDirection = 1; /* Reset — new block always starts from -8 */
    this.updateBackground();

    this.addLayer(nextX, nextZ, topLayer.width, topLayer.depth, nextDir);
  }

  private missedTheSpot(): void {
    const topLayer = this.stack[this.stack.length - 1];

    /* Turn top layer into falling overhang */
    this.addOverhang(
      topLayer.threejs.position.x,
      topLayer.threejs.position.z,
      topLayer.width,
      topLayer.depth,
    );

    this.world.removeBody(topLayer.cannonjs);
    this.scene.remove(topLayer.threejs);
    topLayer.threejs.geometry.dispose();

    this.gameEnded = true;

    if (!this.autopilot) {
      this.fx("fail");
      this.haptic("error");
      setTimeout(() => this.endGame(), 600);
    } else {
      /* Demo mode - restart after delay */
      setTimeout(() => this.initDemo(), 1500);
    }
  }

  private endGame(): void {
    this.state = "GAME_OVER";
    this.settingsBtn.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.settingsModal.classList.add("hidden");
    this.finalScore.textContent = String(this.score);
    this.gameOverScreen.classList.remove("hidden");

    this.submitFinalScore();
    this.fx("gameOver");
    this.haptic("error");
    this.audio.stopMusic();

    console.log("[endGame]", "Score: " + this.score);
  }

  private setRobotPrecision(): void {
    this.robotPrecision = Math.random() * 1 - 0.5;
  }

  /* ═══════ Animation Loop ═══════ */

  private animate(time: number): void {
    if (this.lastTime) {
      const timePassed = Math.min(
        time - this.lastTime,
        33,
      ); /* cap at ~30fps to prevent jump */
      const dt = timePassed / 1000;
      this.elapsed += dt;

      if (this.stack.length >= 2) {
        const topLayer = this.stack[this.stack.length - 1];
        const prevLayer = this.stack[this.stack.length - 2];

        if (topLayer.direction) {
          const direction = topLayer.direction;
          const speed = this.autopilot
            ? CONFIG.MOVE_SPEED
            : Math.min(
                CONFIG.MAX_SPEED,
                CONFIG.MOVE_SPEED + this.score * CONFIG.SPEED_GAIN,
              );

          const topPos =
            direction === "x"
              ? topLayer.threejs.position.x
              : topLayer.threejs.position.z;
          const prevPos =
            direction === "x"
              ? prevLayer.threejs.position.x
              : prevLayer.threejs.position.z;

          const settingsOpen = !this.settingsModal.classList.contains("hidden");
          const boxShouldMove =
            !this.gameEnded &&
            !settingsOpen &&
            (!this.autopilot || topPos < prevPos + this.robotPrecision);

          if (boxShouldMove) {
            const move = speed * timePassed * this.moveDirection;
            if (direction === "x") {
              topLayer.threejs.position.x += move;
              topLayer.cannonjs.position.x += move;
            } else {
              topLayer.threejs.position.z += move;
              topLayer.cannonjs.position.z += move;
            }

            const newPos =
              direction === "x"
                ? topLayer.threejs.position.x
                : topLayer.threejs.position.z;
            /* Bounce back at edges */
            if (newPos > 8) this.moveDirection = -1;
            if (newPos < -8) this.moveDirection = 1;
          } else if (this.autopilot) {
            this.splitBlockAndAddNext();
            this.setRobotPrecision();
          }
        }
      }

      /* Camera follow */
      const targetCamY = CONFIG.BOX_HEIGHT * (this.stack.length - 2) + 4;
      if (this.camera.position.y < targetCamY) {
        this.camera.position.y += CONFIG.MOVE_SPEED * timePassed;
      }

      /* Physics step — skip when no dynamic bodies */
      if (this.overhangs.length > 0) this.world.step(dt);

      /* Sync overhangs: copy Cannon.js positions to Three.js */
      for (const o of this.overhangs) {
        o.threejs.position.set(
          o.cannonjs.position.x,
          o.cannonjs.position.y,
          o.cannonjs.position.z,
        );
        o.threejs.quaternion.set(
          o.cannonjs.quaternion.x,
          o.cannonjs.quaternion.y,
          o.cannonjs.quaternion.z,
          o.cannonjs.quaternion.w,
        );
      }

      /* Cleanup fallen overhangs */
      this.overhangs = this.overhangs.filter((o) => {
        if (o.cannonjs.position.y < -20) {
          this.scene.remove(o.threejs);
          o.threejs.geometry.dispose();
          this.overhangBodyIds.delete(o.cannonjs.id);
          this.world.removeBody(o.cannonjs);
          return false;
        }
        return true;
      });

      /* 3D perfect pulse effects */
      this.updatePerfectPulses(dt);

      /* Overlay effects */
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.8);
      if (this.messageTimer > 0)
        this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.rays = this.rays.filter((r) => {
        r.life -= dt;
        r.length += r.speed * dt;
        return r.life > 0;
      });
    }

    this.frameCount++;

    this.lastTime = time;
    this.renderer.render(this.scene, this.camera);

    /* Only redraw overlay when something changed */
    const overlayDirty =
      this.flash > 0 ||
      this.rays.length > 0 ||
      this.messageTimer > 0 ||
      this.score !== this.prevOverlayScore;
    if (overlayDirty) {
      this.renderOverlay();
      this.prevOverlayScore = this.score;
    }
  }

  /* ═══════ Overlay (2D effects on top of 3D) ═══════ */

  private renderOverlay(): void {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    /* Flash */
    if (this.flash > 0) {
      ctx.fillStyle =
        "rgba(255,255,255," + (this.flash * 0.18).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);
    }

    /* Rays */
    if (this.rays.length > 0) {
      const cx = w * 0.5;
      const cy = h * 0.45;

      for (const ray of this.rays) {
        const alpha = Math.max(0, ray.life / ray.maxLife);
        const inner = ray.length * 0.3;
        const outer = ray.length;
        const cos = Math.cos(ray.angle);
        const sin = Math.sin(ray.angle);

        ctx.beginPath();
        ctx.moveTo(cx + cos * inner, cy + sin * inner);
        ctx.lineTo(cx + cos * outer, cy + sin * outer);
        ctx.strokeStyle = "rgba(255,255,255," + (alpha * 0.8).toFixed(3) + ")";
        ctx.lineWidth = 2.5 * alpha + 0.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    /* Center score watermark */
    if (this.state === "PLAYING") {
      const fontSize = Math.min(w * 0.38, 260);
      ctx.font = "700 " + fontSize + "px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillText(String(this.score), w * 0.5, h * 0.22);
    }

    /* Message text */
    if (this.messageTimer > 0) {
      const maxTime = this.messageText === "GROW" ? 0.7 : 0.45;
      const alpha = Math.min(1, this.messageTimer / maxTime);
      const bounce = 1 + Math.sin(alpha * Math.PI) * 0.15;
      const fontSize = Math.min(w * 0.08, 44) * bounce;

      ctx.font = "700 " + fontSize + "px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      if (this.messageText === "GROW") {
        const hue = (this.colorHueOffset + this.score * 4) % 360;
        ctx.fillStyle = "hsla(" + hue + ", 90%, 70%, " + alpha.toFixed(3) + ")";
      } else {
        ctx.fillStyle = "rgba(255,255,255," + alpha.toFixed(3) + ")";
      }

      ctx.fillText(this.messageText, w * 0.5, this.isMobile ? 164 : 96);
    }
  }

  private spawnRays(): void {
    for (let i = 0; i < CONFIG.RAY_COUNT; i++) {
      const angle = (i / CONFIG.RAY_COUNT) * Math.PI * 2 + this.elapsed * 1.3;
      this.rays.push({
        angle,
        length: 0,
        speed: CONFIG.RAY_SPEED + (i % 3) * 60,
        life: CONFIG.RAY_LIFE,
        maxLife: CONFIG.RAY_LIFE,
      });
    }
  }

  private spawnPerfectPulse(
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
  ): void {
    const PULSE_LIFE = 0.45;
    const boxGeom = new THREE.BoxGeometry(width, CONFIG.BOX_HEIGHT, depth);
    const edges = new THREE.EdgesGeometry(boxGeom);
    boxGeom.dispose();
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(edges, material);
    line.position.set(x, y, z);
    this.scene.add(line);

    this.perfectPulses.push({ line, life: PULSE_LIFE, maxLife: PULSE_LIFE });
  }

  private updatePerfectPulses(dt: number): void {
    this.perfectPulses = this.perfectPulses.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.line);
        p.line.geometry.dispose();
        (p.line.material as THREE.Material).dispose();
        return false;
      }

      const t = 1 - p.life / p.maxLife; // 0→1

      /* Expand outward from edges */
      const expand = 1 + t * 1.1;
      p.line.scale.set(expand, 1, expand);

      /* Fade out */
      (p.line.material as THREE.LineBasicMaterial).opacity = 0.4 * (1 - t);

      return true;
    });
  }

  /* ═══════ Helpers ═══════ */

  private haptic(type: HapticType): void {
    if (!this.settings.haptics) return;
    if (typeof window.triggerHaptic === "function") window.triggerHaptic(type);
  }

  private fx(
    kind: "ui" | "place" | "perfect" | "fail" | "gameOver" | "grow",
  ): void {
    if (!this.settings.fx) return;
    if (kind === "ui") this.audio.playUI();
    else if (kind === "place") this.audio.playMarbleBreak();
    else if (kind === "perfect") {
      const idx = Math.min(this.perfectStreak - 1, PERFECT_PITCHES.length - 1);
      this.audio.playMarbleBreak(0.8, PERFECT_PITCHES[Math.max(0, idx)]);
    } else if (kind === "grow") this.audio.playGrow();
    else if (kind === "fail") this.audio.playFail();
    else if (kind === "gameOver") this.audio.playGameOver();
  }

  private submitFinalScore(): void {
    const s = Math.max(0, Math.floor(this.score));
    console.log("[submitFinalScore]", s);
    if (typeof window.submitScore === "function") window.submitScore(s);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new StackGame();
});
