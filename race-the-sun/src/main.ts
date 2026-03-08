export {};

type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type Lane = -1 | 0 | 1;
type PickupType = "tri" | "boost";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Layout {
  centerX: number;
  horizonY: number;
  groundHeight: number;
  laneNearSpread: number;
  laneFarSpread: number;
  maxVisibleZ: number;
  shipY: number;
  shipScale: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  parallax: number;
}

interface Obstacle {
  id: number;
  lane: Lane;
  z: number;
  width: number;
  height: number;
  tilt: number;
  hue: number;
}

interface Pickup {
  id: number;
  lane: Lane;
  z: number;
  type: PickupType;
  phase: number;
  spin: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  groundY: number;
  scale: number;
  depth: number;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
  }
}

const CONFIG = {
  START_SPEED: 280,
  MAX_SPEED: 770,
  SPEED_ACCEL: 24,
  BOOST_MULTIPLIER: 1.38,
  BOOST_TIME: 2.2,
  BOOST_SPEED_BONUS: 24,
  BASE_ENERGY_DRAIN: 8,
  SPEED_ENERGY_DRAIN: 0.0048,
  TRI_ENERGY_GAIN: 5.5,
  BOOST_ENERGY_GAIN: 18,
  MAX_ENERGY: 100,
  PLAYER_COLLISION_Z: 26,
  COLLISION_WINDOW: 30,
  PICKUP_WINDOW: 28,
  SPAWN_AHEAD_BUFFER: 220,
  MIN_SPAWN_SPACING: 120,
  MAX_SPAWN_SPACING: 240,
  PARTICLE_GRAVITY: 8.8,
  PARTICLE_LIFE: 0.72,
  MAX_DT: 1 / 30,
};

const LANES: Lane[] = [-1, 0, 1];

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function lerp(current: number, target: number, smoothing: number): number {
  return current + (target - current) * smoothing;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private musicMaster: GainNode | null = null;
  private musicOscA: OscillatorNode | null = null;
  private musicOscB: OscillatorNode | null = null;
  private musicPulse: OscillatorNode | null = null;
  private musicPulseGain: GainNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }

    if (this.ctx.state !== "running") {
      this.ctx.resume().catch(() => {
        console.log("[AudioManager.ensureContext]", "Audio resume blocked until user interaction");
      });
    }

    return this.ctx;
  }

  startMusic(): void {
    if (this.musicMaster) {
      return;
    }

    const ctx = this.ensureContext();

    this.musicMaster = ctx.createGain();
    this.musicMaster.gain.value = 0;
    this.musicMaster.connect(ctx.destination);

    const layerA = ctx.createGain();
    const layerB = ctx.createGain();

    layerA.gain.value = 0.052;
    layerB.gain.value = 0.028;

    this.musicOscA = ctx.createOscillator();
    this.musicOscA.type = "triangle";
    this.musicOscA.frequency.value = 174;

    this.musicOscB = ctx.createOscillator();
    this.musicOscB.type = "sine";
    this.musicOscB.frequency.value = 261;

    this.musicPulse = ctx.createOscillator();
    this.musicPulse.type = "sine";
    this.musicPulse.frequency.value = 0.3;

    this.musicPulseGain = ctx.createGain();
    this.musicPulseGain.gain.value = 0.02;

    this.musicPulse.connect(this.musicPulseGain);
    this.musicPulseGain.connect(layerA.gain);

    this.musicOscA.connect(layerA);
    this.musicOscB.connect(layerB);

    layerA.connect(this.musicMaster);
    layerB.connect(this.musicMaster);

    this.musicOscA.start();
    this.musicOscB.start();
    this.musicPulse.start();

    const now = ctx.currentTime;
    this.musicMaster.gain.cancelScheduledValues(now);
    this.musicMaster.gain.setValueAtTime(0, now);
    this.musicMaster.gain.linearRampToValueAtTime(0.15, now + 0.8);

    console.log("[AudioManager.startMusic]", "Background music started");
  }

  stopMusic(): void {
    if (!this.ctx || !this.musicMaster) {
      return;
    }

    const now = this.ctx.currentTime;
    this.musicMaster.gain.cancelScheduledValues(now);
    this.musicMaster.gain.setValueAtTime(this.musicMaster.gain.value, now);
    this.musicMaster.gain.linearRampToValueAtTime(0, now + 0.2);

    const stopAt = now + 0.22;

    this.musicOscA?.stop(stopAt);
    this.musicOscB?.stop(stopAt);
    this.musicPulse?.stop(stopAt);

    this.musicOscA = null;
    this.musicOscB = null;
    this.musicPulse = null;
    this.musicPulseGain = null;
    this.musicMaster = null;

    console.log("[AudioManager.stopMusic]", "Background music stopped");
  }

  playFx(kind: "ui" | "tri" | "boost" | "impact" | "gameOver"): void {
    const ctx = this.ensureContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    let start = 350;
    let end = 560;
    let duration = 0.07;
    let peak = 0.06;
    let type: OscillatorType = "triangle";

    if (kind === "tri") {
      start = 680;
      end = 840;
      duration = 0.08;
      peak = 0.055;
      type = "sine";
    }

    if (kind === "boost") {
      start = 420;
      end = 980;
      duration = 0.15;
      peak = 0.09;
      type = "sawtooth";
    }

    if (kind === "impact") {
      start = 210;
      end = 95;
      duration = 0.18;
      peak = 0.1;
      type = "square";
    }

    if (kind === "gameOver") {
      start = 210;
      end = 120;
      duration = 0.26;
      peak = 0.11;
      type = "triangle";
    }

    if (kind === "ui") {
      start = 470;
      end = 620;
      duration = 0.05;
      peak = 0.045;
      type = "sine";
    }

    osc.type = type;
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration + 0.03);
  }
}

class SolarHorizonGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private startScreen: HTMLDivElement;
  private gameOverScreen: HTMLDivElement;
  private settingsModal: HTMLDivElement;
  private hud: HTMLDivElement;
  private mobileControls: HTMLDivElement;

  private settingsBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;
  private closeSettingsBtn: HTMLButtonElement;
  private musicToggle: HTMLButtonElement;
  private fxToggle: HTMLButtonElement;
  private hapticsToggle: HTMLButtonElement;
  private leftBtn: HTMLButtonElement;
  private rightBtn: HTMLButtonElement;

  private scoreValue: HTMLDivElement;
  private trisValue: HTMLDivElement;
  private speedValue: HTMLDivElement;
  private regionValue: HTMLDivElement;
  private energyFill: HTMLDivElement;
  private finalScore: HTMLDivElement;
  private gameOverReason: HTMLDivElement;
  private musicState: HTMLSpanElement;
  private fxState: HTMLSpanElement;
  private hapticsState: HTMLSpanElement;

  private state: GameState = "START";
  private settings: Settings = this.loadSettings();

  private width = window.innerWidth;
  private height = window.innerHeight;
  private isMobile = window.matchMedia("(pointer: coarse)").matches;
  private layout: Layout = {
    centerX: this.width * 0.5,
    horizonY: this.height * 0.32,
    groundHeight: this.height * 0.68,
    laneNearSpread: 120,
    laneFarSpread: 30,
    maxVisibleZ: 1320,
    shipY: this.height * 0.8,
    shipScale: 1,
  };

  private audio = new AudioManager();

  private stars: Star[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];

  private nextEntityId = 1;
  private distance = 0;
  private spawnCursor = 180;
  private score = 0;
  private tris = 0;
  private region = 1;

  private baseSpeed = CONFIG.START_SPEED;
  private currentSpeed = CONFIG.START_SPEED;
  private boostTimer = 0;
  private boostCount = 0;
  private energy = CONFIG.MAX_ENERGY;

  private currentLane: Lane = 0;
  private laneVisual = 0;

  private elapsed = 0;
  private lastFrame = performance.now();
  private flash = 0;
  private shakeTimer = 0;
  private shakeStrength = 0;

  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    console.log("[SolarHorizonGame.constructor]", "Initializing game");

    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      throw new Error("Canvas initialization failed");
    }

    this.canvas = canvas;
    this.ctx = ctx;

    this.startScreen = this.getElement<HTMLDivElement>("startScreen");
    this.gameOverScreen = this.getElement<HTMLDivElement>("gameOverScreen");
    this.settingsModal = this.getElement<HTMLDivElement>("settingsModal");
    this.hud = this.getElement<HTMLDivElement>("hud");
    this.mobileControls = this.getElement<HTMLDivElement>("mobileControls");

    this.settingsBtn = this.getElement<HTMLButtonElement>("settingsBtn");
    this.startBtn = this.getElement<HTMLButtonElement>("startBtn");
    this.restartBtn = this.getElement<HTMLButtonElement>("restartBtn");
    this.closeSettingsBtn = this.getElement<HTMLButtonElement>("closeSettingsBtn");
    this.musicToggle = this.getElement<HTMLButtonElement>("musicToggle");
    this.fxToggle = this.getElement<HTMLButtonElement>("fxToggle");
    this.hapticsToggle = this.getElement<HTMLButtonElement>("hapticsToggle");
    this.leftBtn = this.getElement<HTMLButtonElement>("leftBtn");
    this.rightBtn = this.getElement<HTMLButtonElement>("rightBtn");

    this.scoreValue = this.getElement<HTMLDivElement>("scoreValue");
    this.trisValue = this.getElement<HTMLDivElement>("trisValue");
    this.speedValue = this.getElement<HTMLDivElement>("speedValue");
    this.regionValue = this.getElement<HTMLDivElement>("regionValue");
    this.energyFill = this.getElement<HTMLDivElement>("energyFill");
    this.finalScore = this.getElement<HTMLDivElement>("finalScore");
    this.gameOverReason = this.getElement<HTMLDivElement>("gameOverReason");
    this.musicState = this.getElement<HTMLSpanElement>("musicState");
    this.fxState = this.getElement<HTMLSpanElement>("fxState");
    this.hapticsState = this.getElement<HTMLSpanElement>("hapticsState");

    this.bindEvents();
    this.createStars();
    this.applySettingsUI();
    this.resizeCanvas();
    this.showStartScreen();

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
      throw new Error("Missing element: " + id);
    }
    return element;
  }

  private loadSettings(): Settings {
    const raw = localStorage.getItem("solar_horizon_settings");
    if (!raw) {
      return { music: true, fx: true, haptics: true };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        music: parsed.music ?? true,
        fx: parsed.fx ?? true,
        haptics: parsed.haptics ?? true,
      };
    } catch (_error) {
      console.log("[loadSettings]", "Failed to parse settings, using defaults");
      return { music: true, fx: true, haptics: true };
    }
  }

  private saveSettings(): void {
    localStorage.setItem("solar_horizon_settings", JSON.stringify(this.settings));
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });

    this.startBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playFx("ui");
      this.startGame();
    });

    this.restartBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playFx("ui");
      this.startGame();
    });

    this.settingsBtn.addEventListener("click", () => {
      if (this.state !== "PLAYING") {
        return;
      }
      this.triggerHaptic("light");
      this.playFx("ui");
      this.openSettings();
    });

    this.closeSettingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playFx("ui");
      this.closeSettings();
    });

    this.settingsModal.addEventListener("click", (event) => {
      if (event.target === this.settingsModal) {
        this.closeSettings();
      }
    });

    this.musicToggle.addEventListener("click", () => {
      this.settings.music = !this.settings.music;
      this.saveSettings();
      this.applySettingsUI();
      this.triggerHaptic("light");
      this.playFx("ui");

      if (this.settings.music && (this.state === "PLAYING" || this.state === "PAUSED")) {
        this.audio.startMusic();
      } else {
        this.audio.stopMusic();
      }
    });

    this.fxToggle.addEventListener("click", () => {
      this.settings.fx = !this.settings.fx;
      this.saveSettings();
      this.applySettingsUI();
      this.triggerHaptic("light");
      this.playFx("ui");
    });

    this.hapticsToggle.addEventListener("click", () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings();
      this.applySettingsUI();
      this.triggerHaptic("light");
      this.playFx("ui");
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Enter" && this.state === "START") {
        event.preventDefault();
        this.triggerHaptic("light");
        this.playFx("ui");
        this.startGame();
        return;
      }

      if (this.state !== "PLAYING") {
        return;
      }

      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        this.shiftLane(-1);
      }

      if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        this.shiftLane(1);
      }
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      this.touchStartX = event.clientX;
      this.touchStartY = event.clientY;
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (this.state !== "PLAYING") {
        return;
      }

      const dx = event.clientX - this.touchStartX;
      const dy = event.clientY - this.touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 28 && absDx > absDy) {
        this.shiftLane(dx > 0 ? 1 : -1);
      }
    });

    const handleLeft = (): void => {
      if (this.state !== "PLAYING") {
        return;
      }
      this.triggerHaptic("light");
      this.shiftLane(-1);
    };

    const handleRight = (): void => {
      if (this.state !== "PLAYING") {
        return;
      }
      this.triggerHaptic("light");
      this.shiftLane(1);
    };

    this.leftBtn.addEventListener("pointerdown", handleLeft);
    this.rightBtn.addEventListener("pointerdown", handleRight);
  }

  private createStars(): void {
    this.stars = [];

    const count = 120;

    for (let i = 0; i < count; i += 1) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.75,
        size: 0.6 + Math.random() * 2.1,
        alpha: 0.2 + Math.random() * 0.6,
        parallax: 14 + Math.random() * 42,
      });
    }
  }

  private applySettingsUI(): void {
    this.musicToggle.classList.toggle("active", this.settings.music);
    this.fxToggle.classList.toggle("active", this.settings.fx);
    this.hapticsToggle.classList.toggle("active", this.settings.haptics);

    this.musicState.textContent = this.settings.music ? "On" : "Off";
    this.fxState.textContent = this.settings.fx ? "On" : "Off";
    this.hapticsState.textContent = this.settings.haptics ? "On" : "Off";
  }

  private resizeCanvas(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.layout.centerX = this.width * 0.5;
    this.layout.horizonY = this.height * (this.isMobile ? 0.32 : 0.3);
    this.layout.groundHeight = this.height * (this.isMobile ? 0.7 : 0.74);
    this.layout.laneNearSpread = Math.min(this.width * (this.isMobile ? 0.23 : 0.2), this.isMobile ? 138 : 194);
    this.layout.laneFarSpread = Math.min(this.width * 0.065, this.isMobile ? 36 : 44);
    this.layout.maxVisibleZ = this.isMobile ? 1480 : 1320;
    this.layout.shipY = this.height * (this.isMobile ? 0.77 : 0.82);
    this.layout.shipScale = Math.min(this.width, this.height) / 820;

    if (this.state === "PLAYING") {
      this.mobileControls.classList.toggle("hidden", !this.isMobile);
    } else {
      this.mobileControls.classList.add("hidden");
    }

    console.log("[resizeCanvas]", "Resized canvas to " + this.width + "x" + this.height);
  }

  private showStartScreen(): void {
    this.state = "START";
    this.startScreen.classList.remove("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.settingsModal.classList.add("hidden");
    this.setGameplayUiVisible(false);
    this.audio.stopMusic();
  }

  private setGameplayUiVisible(visible: boolean): void {
    this.hud.classList.toggle("hidden", !visible);
    this.settingsBtn.classList.toggle("hidden", !visible);

    if (visible && this.isMobile) {
      this.mobileControls.classList.remove("hidden");
    } else {
      this.mobileControls.classList.add("hidden");
    }
  }

  private openSettings(): void {
    if (this.state !== "PLAYING") {
      return;
    }

    this.state = "PAUSED";
    this.settingsModal.classList.remove("hidden");
  }

  private closeSettings(): void {
    this.settingsModal.classList.add("hidden");

    if (this.state === "PAUSED") {
      this.state = "PLAYING";
    }
  }

  private startGame(): void {
    console.log("[startGame]", "Starting new run");

    this.state = "PLAYING";

    this.distance = 0;
    this.spawnCursor = 180;
    this.score = 0;
    this.tris = 0;
    this.region = 1;

    this.baseSpeed = CONFIG.START_SPEED;
    this.currentSpeed = CONFIG.START_SPEED;
    this.boostTimer = 0;
    this.boostCount = 0;
    this.energy = CONFIG.MAX_ENERGY;

    this.currentLane = 0;
    this.laneVisual = 0;

    this.obstacles = [];
    this.pickups = [];
    this.particles = [];

    this.flash = 0;
    this.shakeTimer = 0;
    this.shakeStrength = 0;

    this.startScreen.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.settingsModal.classList.add("hidden");
    this.setGameplayUiVisible(true);

    this.updateHud();

    if (this.settings.music) {
      this.audio.startMusic();
    } else {
      this.audio.stopMusic();
    }
  }

  private shiftLane(direction: -1 | 1): void {
    const nextLane = clamp(this.currentLane + direction, -1, 1) as Lane;
    if (nextLane === this.currentLane) {
      return;
    }

    this.currentLane = nextLane;
    this.playFx("ui");
  }

  private loop(timestamp: number): void {
    const delta = Math.min(CONFIG.MAX_DT, (timestamp - this.lastFrame) / 1000);
    this.lastFrame = timestamp;
    this.elapsed += delta;

    this.update(delta);
    this.render();

    requestAnimationFrame((time) => this.loop(time));
  }

  private update(delta: number): void {
    if (this.state === "PLAYING") {
      this.updatePlaying(delta);
    }

    this.updateParticles(delta);

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - delta * 1.8);
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - delta);
      if (this.shakeTimer === 0) {
        this.shakeStrength = 0;
      }
    }
  }

  private updatePlaying(delta: number): void {
    this.baseSpeed = Math.min(CONFIG.MAX_SPEED, this.baseSpeed + CONFIG.SPEED_ACCEL * delta);

    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - delta);
    }

    const boostFactor = this.boostTimer > 0 ? CONFIG.BOOST_MULTIPLIER : 1;
    this.currentSpeed = this.baseSpeed * boostFactor;

    this.distance += this.currentSpeed * delta;

    const drainMultiplier = this.boostTimer > 0 ? 0.78 : 1;
    const energyDrain = (CONFIG.BASE_ENERGY_DRAIN + this.currentSpeed * CONFIG.SPEED_ENERGY_DRAIN) * drainMultiplier;
    this.energy = Math.max(0, this.energy - energyDrain * delta);

    this.laneVisual = lerp(this.laneVisual, this.currentLane, Math.min(1, delta * 12));

    this.spawnEntities();
    this.checkObstacleCollisions();
    this.checkPickupCollisions();
    this.cleanupEntities();

    this.region = 1 + Math.floor(this.distance / 2100);
    this.score = Math.max(0, Math.floor(this.distance * 0.09 + this.tris * 28 + this.boostCount * 22));

    if (this.energy <= 0) {
      this.endGame("Sunlight depleted");
      return;
    }

    this.updateHud();
  }

  private spawnEntities(): void {
    const spawnLimit = this.distance + this.layout.maxVisibleZ + CONFIG.SPAWN_AHEAD_BUFFER;

    while (this.spawnCursor < spawnLimit) {
      this.spawnWave(this.spawnCursor);

      const difficulty = clamp(this.distance / 9000, 0, 1);
      const spacingRange = CONFIG.MAX_SPAWN_SPACING - CONFIG.MIN_SPAWN_SPACING;
      const spacing =
        CONFIG.MIN_SPAWN_SPACING + Math.random() * spacingRange - difficulty * 54 + (this.boostTimer > 0 ? 22 : 0);

      this.spawnCursor += Math.max(CONFIG.MIN_SPAWN_SPACING * 0.8, spacing);
    }
  }

  private spawnWave(z: number): void {
    const difficulty = clamp(this.distance / 9000, 0, 1);

    const shuffled = [...LANES];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    const safeLane = shuffled[0];
    const hazardLanes = shuffled.slice(1);

    const placeDouble = Math.random() < 0.38 + difficulty * 0.44;

    this.obstacles.push({
      id: this.nextEntityId,
      lane: hazardLanes[0],
      z,
      width: 0.92 + Math.random() * 0.14,
      height: 0.95 + Math.random() * 0.32,
      tilt: Math.random() * Math.PI * 2,
      hue: 26 + Math.random() * 16,
    });
    this.nextEntityId += 1;

    if (placeDouble) {
      this.obstacles.push({
        id: this.nextEntityId,
        lane: hazardLanes[1],
        z: z + 18,
        width: 0.88 + Math.random() * 0.2,
        height: 0.92 + Math.random() * 0.4,
        tilt: Math.random() * Math.PI * 2,
        hue: 18 + Math.random() * 18,
      });
      this.nextEntityId += 1;
    }

    const triChance = 0.67;
    if (Math.random() < triChance) {
      this.pickups.push({
        id: this.nextEntityId,
        lane: safeLane,
        z: z + 28,
        type: "tri",
        phase: Math.random() * Math.PI * 2,
        spin: 1.8 + Math.random() * 1.2,
      });
      this.nextEntityId += 1;
    }

    if (Math.random() < 0.11 + difficulty * 0.07) {
      this.pickups.push({
        id: this.nextEntityId,
        lane: safeLane,
        z: z + 62,
        type: "boost",
        phase: Math.random() * Math.PI * 2,
        spin: 0.8 + Math.random() * 0.7,
      });
      this.nextEntityId += 1;
    }
  }

  private checkObstacleCollisions(): void {
    if (this.state !== "PLAYING") {
      return;
    }

    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obstacle = this.obstacles[i];
      const relZ = obstacle.z - this.distance;

      if (Math.abs(relZ - CONFIG.PLAYER_COLLISION_Z) <= CONFIG.COLLISION_WINDOW) {
        if (obstacle.lane === this.currentLane) {
          this.spawnCollisionBurst(obstacle.lane, obstacle.z, 22, 10);
          this.playFx("impact");
          this.triggerHaptic("heavy");
          this.kickScreen(0.24, 7.5);
          this.endGame("Collision detected");
          return;
        }
      }
    }
  }

  private checkPickupCollisions(): void {
    if (this.state !== "PLAYING") {
      return;
    }

    const remaining: Pickup[] = [];

    for (let i = 0; i < this.pickups.length; i += 1) {
      const pickup = this.pickups[i];
      const relZ = pickup.z - this.distance;

      if (relZ < -40) {
        continue;
      }

      const hitWindow = Math.abs(relZ - CONFIG.PLAYER_COLLISION_Z) <= CONFIG.PICKUP_WINDOW;

      if (hitWindow && pickup.lane === this.currentLane) {
        if (pickup.type === "tri") {
          this.tris += 1;
          this.energy = clamp(this.energy + CONFIG.TRI_ENERGY_GAIN, 0, CONFIG.MAX_ENERGY);
          this.playFx("tri");
          this.triggerHaptic("medium");
          this.spawnCollisionBurst(pickup.lane, pickup.z, 12, 42);
          this.flash = Math.max(this.flash, 0.34);
        } else {
          this.energy = clamp(this.energy + CONFIG.BOOST_ENERGY_GAIN, 0, CONFIG.MAX_ENERGY);
          this.boostTimer = Math.max(this.boostTimer, CONFIG.BOOST_TIME);
          this.baseSpeed = Math.min(CONFIG.MAX_SPEED, this.baseSpeed + CONFIG.BOOST_SPEED_BONUS);
          this.boostCount += 1;
          this.playFx("boost");
          this.triggerHaptic("success");
          this.spawnCollisionBurst(pickup.lane, pickup.z, 18, 56);
          this.kickScreen(0.14, 3.4);
          this.flash = Math.max(this.flash, 0.5);
        }

        continue;
      }

      remaining.push(pickup);
    }

    this.pickups = remaining;
  }

  private spawnCollisionBurst(lane: Lane, z: number, count: number, hue: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 0.45 + (i % 4) * 0.16;
      const vx = Math.cos(angle) * speed;
      const vy = 2.2 + (i % 5) * 0.35;
      const vz = ((i % 6) - 2.5) * 7;

      this.particles.push({
        x: lane + vx * 0.2,
        y: 16,
        z,
        vx,
        vy,
        vz,
        life: CONFIG.PARTICLE_LIFE,
        maxLife: CONFIG.PARTICLE_LIFE,
        size: 2.4 + (i % 3),
        hue,
      });
    }
  }

  private updateParticles(delta: number): void {
    const alive: Particle[] = [];

    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];

      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy;
      particle.vy -= CONFIG.PARTICLE_GRAVITY * delta;
      particle.z += particle.vz * delta;

      if (particle.life > 0) {
        alive.push(particle);
      }
    }

    this.particles = alive;
  }

  private cleanupEntities(): void {
    const cutoff = this.distance - 120;

    this.obstacles = this.obstacles.filter((obstacle) => obstacle.z > cutoff);
    this.pickups = this.pickups.filter((pickup) => pickup.z > cutoff);

    const particleCutoff = this.distance - 90;
    this.particles = this.particles.filter((particle) => particle.z > particleCutoff && particle.life > 0);
  }

  private updateHud(): void {
    this.scoreValue.textContent = String(this.score);
    this.trisValue.textContent = String(this.tris);
    this.speedValue.textContent = String(Math.floor(this.currentSpeed));
    this.regionValue.textContent = String(this.region);
    this.energyFill.style.width = String(clamp(this.energy, 0, 100)) + "%";
  }

  private kickScreen(duration: number, strength: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  private endGame(reason: string): void {
    if (this.state === "GAME_OVER") {
      return;
    }

    this.state = "GAME_OVER";

    this.settingsModal.classList.add("hidden");
    this.setGameplayUiVisible(false);

    this.finalScore.textContent = String(this.score);
    this.gameOverReason.textContent = reason;
    this.gameOverScreen.classList.remove("hidden");

    this.submitFinalScore();
    this.playFx("gameOver");
    this.triggerHaptic("error");
    this.audio.stopMusic();

    console.log("[endGame]", "Run ended with score " + this.score);
  }

  private submitFinalScore(): void {
    const finalScore = Math.max(0, Math.floor(this.score));
    console.log("[submitFinalScore]", "Submitting final score " + finalScore);

    if (typeof window.submitScore === "function") {
      window.submitScore(finalScore);
    }
  }

  private triggerHaptic(type: HapticType): void {
    if (!this.settings.haptics) {
      return;
    }

    if (typeof window.triggerHaptic === "function") {
      window.triggerHaptic(type);
    }
  }

  private playFx(kind: "ui" | "tri" | "boost" | "impact" | "gameOver"): void {
    if (!this.settings.fx) {
      return;
    }

    this.audio.playFx(kind);
  }

  private getShakeOffset(): { x: number; y: number } {
    if (this.shakeTimer <= 0 || this.shakeStrength <= 0) {
      return { x: 0, y: 0 };
    }

    const energy = this.shakeTimer * 9;
    const x = Math.sin(this.elapsed * 62) * this.shakeStrength * energy;
    const y = Math.cos(this.elapsed * 52) * this.shakeStrength * 0.62 * energy;

    return { x, y };
  }

  private project(lanePos: number, relativeZ: number, lift: number): ProjectedPoint | null {
    if (relativeZ < -80 || relativeZ > this.layout.maxVisibleZ) {
      return null;
    }

    const normalized = 1 - relativeZ / this.layout.maxVisibleZ;
    const depth = clamp(normalized, 0, 1);
    const depthCurve = depth * depth;

    const spread =
      this.layout.laneFarSpread +
      (this.layout.laneNearSpread - this.layout.laneFarSpread) * Math.pow(depthCurve, 0.72);

    const groundY = this.layout.horizonY + depthCurve * this.layout.groundHeight;
    const x = this.layout.centerX + lanePos * spread;
    const y = groundY - lift * (0.18 + depthCurve * 1.35);

    return {
      x,
      y,
      groundY,
      scale: 0.32 + depthCurve * 1.8,
      depth: depthCurve,
    };
  }

  private drawBackground(): void {
    const energyRatio = clamp(this.energy / CONFIG.MAX_ENERGY, 0, 1);
    const dusk = 1 - energyRatio;

    const top = "hsl(" + Math.floor(217 - dusk * 34) + " 52% " + Math.floor(12 + dusk * 3) + "%)";
    const mid = "hsl(" + Math.floor(211 - dusk * 26) + " 56% " + Math.floor(18 + dusk * 8) + "%)";
    const low = "hsl(" + Math.floor(24 + dusk * 12) + " 76% " + Math.floor(34 + energyRatio * 13) + "%)";

    const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    skyGradient.addColorStop(0, top);
    skyGradient.addColorStop(0.58, mid);
    skyGradient.addColorStop(1, low);

    this.ctx.fillStyle = skyGradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const starDrift = this.distance * 0.02;
    for (let i = 0; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      const xBase = star.x * this.width;
      const wrappedX = ((xBase - starDrift / star.parallax) % this.width + this.width) % this.width;
      const y = star.y * this.layout.horizonY;
      const flicker = 0.62 + Math.sin(this.elapsed * (1.1 + star.parallax * 0.02) + star.x * 8) * 0.38;
      const alpha = star.alpha * flicker * (0.2 + dusk * 0.9);

      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = "#dff3ff";
      this.ctx.fillRect(wrappedX, y, star.size, star.size);
    }
    this.ctx.globalAlpha = 1;

    const sunPulse = Math.sin(this.elapsed * 1.6) * 4;
    const sunY = this.layout.horizonY - 122 + dusk * 158 + sunPulse;
    const sunX = this.layout.centerX + Math.sin(this.elapsed * 0.35) * 16;
    const sunRadius = this.isMobile ? 66 : 74;

    const glow = this.ctx.createRadialGradient(sunX, sunY, sunRadius * 0.3, sunX, sunY, sunRadius * 2.2);
    glow.addColorStop(0, "rgba(255,238,182,0.95)");
    glow.addColorStop(0.35, "rgba(255,182,107,0.6)");
    glow.addColorStop(1, "rgba(255,160,89,0)");

    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, sunRadius * 2.2, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(255,243,204,0.96)";
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    this.ctx.fill();

    const haze = this.ctx.createLinearGradient(0, this.layout.horizonY - 40, 0, this.layout.horizonY + 150);
    haze.addColorStop(0, "rgba(255,180,104,0.28)");
    haze.addColorStop(1, "rgba(255,180,104,0)");
    this.ctx.fillStyle = haze;
    this.ctx.fillRect(0, this.layout.horizonY - 50, this.width, 220);
  }

  private drawGround(): void {
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height);
    this.ctx.lineTo(this.width, this.height);
    this.ctx.lineTo(this.layout.centerX + this.layout.laneFarSpread * 3, this.layout.horizonY);
    this.ctx.lineTo(this.layout.centerX - this.layout.laneFarSpread * 3, this.layout.horizonY);
    this.ctx.closePath();

    const groundGrad = this.ctx.createLinearGradient(0, this.layout.horizonY, 0, this.height);
    groundGrad.addColorStop(0, "rgba(27,37,50,0.88)");
    groundGrad.addColorStop(1, "rgba(4,9,15,0.98)");
    this.ctx.fillStyle = groundGrad;
    this.ctx.fill();

    const laneBase = this.distance - (this.distance % 120);
    for (let i = 0; i < 22; i += 1) {
      const worldZ = laneBase + i * 120;
      const relZ = worldZ - this.distance;
      const left = this.project(-2.4, relZ, 0);
      const right = this.project(2.4, relZ, 0);

      if (!left || !right) {
        continue;
      }

      this.ctx.strokeStyle = "rgba(138,198,242," + String(0.08 + left.depth * 0.2) + ")";
      this.ctx.lineWidth = 1 + left.depth * 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(left.x, left.groundY);
      this.ctx.lineTo(right.x, right.groundY);
      this.ctx.stroke();
    }

    const laneMarks = [-0.5, 0.5];

    for (let l = 0; l < laneMarks.length; l += 1) {
      const lane = laneMarks[l];
      this.ctx.beginPath();

      let started = false;
      for (let z = 0; z <= this.layout.maxVisibleZ; z += 36) {
        const p = this.project(lane, z, 0);
        if (!p) {
          continue;
        }

        if (!started) {
          this.ctx.moveTo(p.x, p.groundY);
          started = true;
        } else {
          this.ctx.lineTo(p.x, p.groundY);
        }
      }

      this.ctx.strokeStyle = "rgba(130,210,255,0.27)";
      this.ctx.lineWidth = this.isMobile ? 2.2 : 2;
      this.ctx.stroke();
    }

    const edgeGlow = this.ctx.createLinearGradient(0, this.layout.horizonY, 0, this.height);
    edgeGlow.addColorStop(0, "rgba(116,201,255,0)");
    edgeGlow.addColorStop(1, "rgba(116,201,255,0.16)");

    this.ctx.strokeStyle = edgeGlow;
    this.ctx.lineWidth = 4;

    for (let side = -1; side <= 1; side += 2) {
      this.ctx.beginPath();
      let started = false;
      for (let z = 0; z <= this.layout.maxVisibleZ; z += 30) {
        const p = this.project(side * 1.5, z, 0);
        if (!p) {
          continue;
        }

        if (!started) {
          this.ctx.moveTo(p.x, p.groundY);
          started = true;
        } else {
          this.ctx.lineTo(p.x, p.groundY);
        }
      }
      this.ctx.stroke();
    }
  }

  private drawObstacles(): void {
    const visible: Array<{ obstacle: Obstacle; relZ: number }> = [];

    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obstacle = this.obstacles[i];
      const relZ = obstacle.z - this.distance;
      if (relZ > -40 && relZ <= this.layout.maxVisibleZ) {
        visible.push({ obstacle, relZ });
      }
    }

    visible.sort((a, b) => b.relZ - a.relZ);

    for (let i = 0; i < visible.length; i += 1) {
      const item = visible[i];
      const obstacle = item.obstacle;
      const relZ = item.relZ;

      const point = this.project(obstacle.lane, relZ, 0);
      if (!point) {
        continue;
      }

      const wobble = Math.sin(this.elapsed * 1.6 + obstacle.tilt) * 2.2 * point.scale;
      const width = 34 * point.scale * obstacle.width;
      const height = 56 * point.scale * obstacle.height;

      const x = point.x + wobble;
      const topY = point.groundY - height;

      const blockGrad = this.ctx.createLinearGradient(x, topY, x, point.groundY);
      blockGrad.addColorStop(0, "hsla(" + String(obstacle.hue) + ",72%,58%,0.92)");
      blockGrad.addColorStop(1, "hsla(" + String(obstacle.hue + 14) + ",76%,34%,0.98)");

      this.ctx.fillStyle = blockGrad;
      this.ctx.beginPath();
      this.ctx.moveTo(x - width * 0.56, point.groundY);
      this.ctx.lineTo(x - width * 0.4, topY + height * 0.18);
      this.ctx.lineTo(x, topY);
      this.ctx.lineTo(x + width * 0.4, topY + height * 0.18);
      this.ctx.lineTo(x + width * 0.56, point.groundY);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.strokeStyle = "rgba(255,213,160,0.44)";
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();

      this.ctx.fillStyle = "rgba(12,20,33,0.52)";
      this.ctx.beginPath();
      this.ctx.ellipse(x, point.groundY + 3, width * 0.62, 7 * point.scale, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawPickups(): void {
    const visible: Array<{ pickup: Pickup; relZ: number }> = [];

    for (let i = 0; i < this.pickups.length; i += 1) {
      const pickup = this.pickups[i];
      const relZ = pickup.z - this.distance;

      if (relZ > -20 && relZ <= this.layout.maxVisibleZ) {
        visible.push({ pickup, relZ });
      }
    }

    visible.sort((a, b) => b.relZ - a.relZ);

    for (let i = 0; i < visible.length; i += 1) {
      const item = visible[i];
      const pickup = item.pickup;
      const relZ = item.relZ;

      const bob = Math.sin(this.elapsed * 5 + pickup.phase) * 7;
      const point = this.project(pickup.lane, relZ, 18 + bob);

      if (!point) {
        continue;
      }

      const spin = this.elapsed * pickup.spin;

      if (pickup.type === "tri") {
        const size = 15 * point.scale;

        this.ctx.save();
        this.ctx.translate(point.x, point.y);
        this.ctx.rotate(spin);

        const triGrad = this.ctx.createLinearGradient(0, -size, 0, size);
        triGrad.addColorStop(0, "rgba(112,228,255,0.95)");
        triGrad.addColorStop(1, "rgba(76,143,255,0.8)");

        this.ctx.fillStyle = triGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size);
        this.ctx.lineTo(size * 0.82, size * 0.82);
        this.ctx.lineTo(-size * 0.82, size * 0.82);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = "rgba(218,246,255,0.92)";
        this.ctx.lineWidth = Math.max(1, point.scale * 0.9);
        this.ctx.stroke();
        this.ctx.restore();
      } else {
        const radius = 16 * point.scale;

        this.ctx.save();
        this.ctx.translate(point.x, point.y);
        this.ctx.rotate(spin);

        this.ctx.strokeStyle = "rgba(255,233,171,0.95)";
        this.ctx.lineWidth = 3 * point.scale;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = "rgba(255,189,102,0.95)";
        this.ctx.beginPath();
        this.ctx.moveTo(0, -radius * 0.55);
        this.ctx.lineTo(radius * 0.45, radius * 0.55);
        this.ctx.lineTo(-radius * 0.45, radius * 0.55);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
      }
    }
  }

  private drawParticles(): void {
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      const relZ = particle.z - this.distance;

      const point = this.project(particle.x, relZ, particle.y);
      if (!point) {
        continue;
      }

      const lifeRatio = clamp(particle.life / particle.maxLife, 0, 1);
      const size = particle.size * point.scale * lifeRatio;

      this.ctx.fillStyle = "hsla(" + String(particle.hue) + ",95%,70%," + String(lifeRatio * 0.85) + ")";
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawShip(): void {
    const nearSpread = this.layout.laneNearSpread;
    const x = this.layout.centerX + this.laneVisual * nearSpread;
    const y = this.layout.shipY;

    const base = 24 * this.layout.shipScale;
    const wing = 34 * this.layout.shipScale;
    const nose = 48 * this.layout.shipScale;

    const enginePulse = 0.78 + Math.sin(this.elapsed * 18) * 0.2;
    const boostPulse = this.boostTimer > 0 ? 0.72 + Math.sin(this.elapsed * 30) * 0.28 : 0;

    const trailLen = this.boostTimer > 0 ? 124 : 74;
    const trailWidth = this.boostTimer > 0 ? 30 : 20;

    const engineGrad = this.ctx.createLinearGradient(x, y + 6, x, y + trailLen);
    engineGrad.addColorStop(0, "rgba(255,239,192," + String(0.65 + boostPulse * 0.24) + ")");
    engineGrad.addColorStop(1, "rgba(80,195,255,0)");

    this.ctx.fillStyle = engineGrad;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + 2);
    this.ctx.lineTo(x + trailWidth * enginePulse, y + trailLen);
    this.ctx.lineTo(x - trailWidth * enginePulse, y + trailLen);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(153,228,255,0.95)";
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - nose);
    this.ctx.lineTo(x + wing, y + base * 0.2);
    this.ctx.lineTo(x + base * 0.55, y + base);
    this.ctx.lineTo(x - base * 0.55, y + base);
    this.ctx.lineTo(x - wing, y + base * 0.2);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(22,51,84,0.9)";
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - nose * 0.45);
    this.ctx.lineTo(x + base * 0.32, y + base * 0.58);
    this.ctx.lineTo(x - base * 0.32, y + base * 0.58);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(224,247,255,0.85)";
    this.ctx.lineWidth = 1.4;
    this.ctx.stroke();

    if (this.boostTimer > 0) {
      this.ctx.fillStyle = "rgba(255,243,187,0.45)";
      this.ctx.beginPath();
      this.ctx.ellipse(x, y - base * 0.1, wing * 1.25, base * 0.78, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawFlashOverlay(): void {
    if (this.flash <= 0) {
      return;
    }

    this.ctx.fillStyle = "rgba(255,229,170," + String(this.flash * 0.3) + ")";
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private render(): void {
    const shake = this.getShakeOffset();

    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    this.drawBackground();
    this.drawGround();
    this.drawPickups();
    this.drawObstacles();
    this.drawParticles();
    this.drawShip();
    this.drawFlashOverlay();

    this.ctx.restore();
  }
}

new SolarHorizonGame();
