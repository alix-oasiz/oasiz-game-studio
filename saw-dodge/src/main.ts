/**
 * SAW DODGE
 *
 * A retro pixel-art platformer where you dodge falling saw blades.
 * Jump over saws to score points, collect coins for bonus.
 * "Game within a game" aesthetic with handheld console feel.
 */

import { oasiz } from "@oasiz/sdk";

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  PLAYER_WIDTH: 30,
  PLAYER_HEIGHT: 35,
  PLAYER_SPEED: 4.5,
  JUMP_VELOCITY: -13.5,
  DOUBLE_JUMP_VELOCITY: -11,
  GRAVITY: 0.6,
  GROUND_OFFSET: 30,

  // Squash and stretch
  SQUASH_AMOUNT: 0.3,
  STRETCH_AMOUNT: 0.2,
  SQUASH_RECOVERY: 0.15,

  // Saw blades (bouncing)
  SAW_SIZE: 45,
  SAW_SPEED: 4.5,
  SAW_SPAWN_INTERVAL: 1600,
  SAW_ROTATION_SPEED: 0.08,
  SAWS_PER_ROUND: 8,
  MAX_SAWS_ON_SCREEN: 10,

  // Coins
  COIN_SIZE: 14,
  COIN_GRAVITY: 0.35,
  COIN_BOUNCE: 0.6,
  COINS_PER_SAW: 5,
  COIN_SPREAD: 50,
  COIN_POINTS: 5,
  COIN_LIFETIME: 8000,

  // Particles
  PARTICLE_COUNT: 16,
  PARTICLE_LIFE: 600,

  // Screen shake
  SHAKE_JUMP: 2,
  SHAKE_LAND: 4,
  SHAKE_EXPLOSION: 8,
  SHAKE_DEATH: 15,
  SHAKE_DECAY: 0.85,

  // Danger zone (descending red area)
  DANGER_ZONE_SPEED: 0.03,
  DANGER_ZONE_START: -80,

  // Score popups
  POPUP_DURATION: 1000,
  POPUP_RISE_SPEED: 1.5,

  // Safe areas
  TOP_SAFE_DESKTOP: 45,
  TOP_SAFE_MOBILE: 120,

  // Background themes for rounds - carefully chosen palette
  BG_THEMES: [
    { 
      bg: "#f0e6f5", 
      skyline: "#d4c6df", 
      accent: "#6a4a8f", 
      ground: "#5a3a7a",
      console: "#6a4a8f",
      consoleDark: "#5a3a7a",
      consoleLight: "#7a5a9f",
      btnColor: "#f0e6f5",
      btnDark: "#d4c6df",
      spikeStyle: "neon" 
    },
    { 
      bg: "#e6f0f5", 
      skyline: "#c6d4df", 
      accent: "#4a6a8f", 
      ground: "#3a5a7a",
      console: "#4a6a8f",
      consoleDark: "#3a5a7a",
      consoleLight: "#5a7a9f",
      btnColor: "#e6f0f5",
      btnDark: "#c6d4df",
      spikeStyle: "industrial" 
    },
    { 
      bg: "#f5e6e6", 
      skyline: "#dfc6c6", 
      accent: "#8f4a4a", 
      ground: "#7a3a3a",
      console: "#8f4a4a",
      consoleDark: "#7a3a3a",
      consoleLight: "#9f5a5a",
      btnColor: "#f5e6e6",
      btnDark: "#dfc6c6",
      spikeStyle: "crystal" 
    },
    { 
      bg: "#e6f5e6", 
      skyline: "#c6dfc6", 
      accent: "#4a8f5a", 
      ground: "#3a7a4a",
      console: "#4a8f5a",
      consoleDark: "#3a7a4a",
      consoleLight: "#5a9f6a",
      btnColor: "#e6f5e6",
      btnDark: "#c6dfc6",
      spikeStyle: "organic" 
    },
    { 
      bg: "#f5efe6", 
      skyline: "#d4cfc6", 
      accent: "#5a8f4a", 
      ground: "#4a7a3a",
      console: "#5a8f4a",
      consoleDark: "#4a7a3a",
      consoleLight: "#6aa05a",
      btnColor: "#f5efe6",
      btnDark: "#d8d0c8",
      spikeStyle: "classic" 
    },
    { 
      bg: "#f5f0e6", 
      skyline: "#dfd4c6", 
      accent: "#8f6a4a", 
      ground: "#7a5a3a",
      console: "#8f6a4a",
      consoleDark: "#7a5a3a",
      consoleLight: "#9f7a5a",
      btnColor: "#f5f0e6",
      btnDark: "#dfd4c6",
      spikeStyle: "steampunk" 
    },
  ],
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  isJumping: boolean;
  canDoubleJump: boolean;
  hasDoubleJumped: boolean;
  facingLeft: boolean;
  squashX: number;
  squashY: number;
  runFrame: number;
  runTimer: number;
}

interface SawBlade {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  rotation: number;
  jumpedOver: boolean; // Player passed over this saw while in the air
  passed: boolean; // Points awarded, saw is done
  hasHitGround: boolean; // Has it hit the ground yet?
  exploding: boolean;
  explodeTimer: number;
  scale: number;
  glowIntensity: number;
  style: string;
}

interface Coin {
  x: number;
  y: number;
  vy: number;
  collected: boolean;
  rotation: number;
  onGround: boolean;
  lifetime: number;
  bobOffset: number;
  sparkle: number;
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
  type: "explosion" | "dust" | "coin" | "star";
  rotation: number;
  rotationSpeed: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: string;
  life: number;
  maxLife: number;
  color: string;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const screenContainer = document.getElementById("screen-container")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const settingsModal = document.getElementById("settingsModal")!;
const scoreDisplay = document.getElementById("scoreDisplay")!;
const roundDisplay = document.getElementById("roundDisplay")!;
const scoreBadge = document.getElementById("score-badge")!;
const roundBadge = document.getElementById("round-badge")!;
const progressBar = document.getElementById("progress-bar")!;
const finalScoreEl = document.getElementById("finalScore")!;
const coinsCollectedEl = document.getElementById("coinsCollected")!;

// Control buttons
const leftBtn = document.getElementById("leftBtn")!;
const rightBtn = document.getElementById("rightBtn")!;
const jumpBtn = document.getElementById("jump-btn")!;

// State
let gameState: GameState = "START";
let w = 0;
let h = 0;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let player: Player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  rotation: 0,
  isJumping: false,
  canDoubleJump: true,
  hasDoubleJumped: false,
  facingLeft: false,
  squashX: 1,
  squashY: 1,
  runFrame: 0,
  runTimer: 0,
};

let saws: SawBlade[] = [];
let coins: Coin[] = [];
let particles: Particle[] = [];
let scorePopups: ScorePopup[] = [];

// Progress
let score = 0;
let totalCoins = 0;
let round = 1;
let sawsDodgedThisRound = 0;
let groundY = 0;
let dangerZoneY = CONFIG.DANGER_ZONE_START;

// Screen shake
let shakeX = 0;
let shakeY = 0;
let shakeIntensity = 0;

// Flash effects
let screenFlash = 0;
let flashColor = "#ffffff";

// Input state
let leftPressed = false;
let rightPressed = false;
let jumpPressed = false;

// Timing
let gameTime = 0;

// Settings
let settings: Settings = {
  music: localStorage.getItem("sawDodge_music") !== "false",
  fx: localStorage.getItem("sawDodge_fx") !== "false",
  haptics: localStorage.getItem("sawDodge_haptics") !== "false",
};

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============= AUDIO =============
let audioContext: AudioContext | null = null;
let bgMusic: HTMLAudioElement | null = null;
let bgMusicLoaded = false;

const BG_MUSIC_URL = "https://assets.oasiz.ai/audio/dodge-song.mp3";

function initAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log("[initAudio] Audio context initialized");
  }
  
  // Load background music if not already loaded
  if (!bgMusic) {
    bgMusic = new Audio(BG_MUSIC_URL);
    bgMusic.loop = true;
    bgMusic.volume = 0.4;
    bgMusic.preload = "auto";
    
    bgMusic.addEventListener("canplaythrough", () => {
      bgMusicLoaded = true;
      console.log("[initAudio] Background music loaded");
    });
    
    bgMusic.addEventListener("error", (e) => {
      console.log("[initAudio] Error loading background music:", e);
    });
  }
}

function playBackgroundMusic(): void {
  if (!settings.music || !bgMusic) return;
  
  bgMusic.play().catch((e) => {
    console.log("[playBackgroundMusic] Autoplay blocked, will play on interaction:", e);
  });
  console.log("[playBackgroundMusic] Background music started");
}

function pauseBackgroundMusic(): void {
  if (bgMusic) {
    bgMusic.pause();
    console.log("[pauseBackgroundMusic] Background music paused");
  }
}

function stopBackgroundMusic(): void {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.currentTime = 0;
    console.log("[stopBackgroundMusic] Background music stopped");
  }
}

function updateMusicState(): void {
  if (!bgMusic) return;
  
  if (settings.music && gameState === "PLAYING") {
    if (bgMusic.paused) {
      bgMusic.play().catch(() => {});
    }
  } else {
    bgMusic.pause();
  }
}

function playJumpSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(220, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.08);

  gain.gain.setValueAtTime(0.12, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.12);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.12);
}

function playLandSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "triangle";
  osc.frequency.setValueAtTime(100, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, audioContext.currentTime + 0.08);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playExplosionSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Two-tone explosion for more impact
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioContext.destination);

  osc1.type = "sawtooth";
  osc1.frequency.setValueAtTime(200, audioContext.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.25);

  osc2.type = "square";
  osc2.frequency.setValueAtTime(150, audioContext.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.3);

  gain.gain.setValueAtTime(0.2, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  osc1.start(audioContext.currentTime);
  osc2.start(audioContext.currentTime);
  osc1.stop(audioContext.currentTime + 0.3);
  osc2.stop(audioContext.currentTime + 0.3);
}

function playCoinSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(880, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.06);

  gain.gain.setValueAtTime(0.1, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playDeathSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Descending sad tone
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.5);

  gain.gain.setValueAtTime(0.2, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.5);
}

function playRoundSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Triumphant fanfare
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    osc.connect(gain);
    gain.connect(audioContext!.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, audioContext!.currentTime + i * 0.1);
    gain.gain.setValueAtTime(0.1, audioContext!.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext!.currentTime + i * 0.1 + 0.2);
    osc.start(audioContext!.currentTime + i * 0.1);
    osc.stop(audioContext!.currentTime + i * 0.1 + 0.2);
  });
}

function playUIClick(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(800, audioContext.currentTime);

  gain.gain.setValueAtTime(0.06, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.03);
}

// ============= HAPTICS =============
function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

// ============= SCREEN EFFECTS =============
function addScreenShake(intensity: number): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

function addScreenFlash(color: string, intensity: number = 1): void {
  screenFlash = intensity;
  flashColor = color;
}

function updateScreenEffects(): void {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeIntensity *= CONFIG.SHAKE_DECAY;
  } else {
    shakeX = 0;
    shakeY = 0;
    shakeIntensity = 0;
  }

  if (screenFlash > 0) {
    screenFlash *= 0.85;
    if (screenFlash < 0.05) screenFlash = 0;
  }
}

// ============= THEME APPLICATION =============
function applyTheme(): void {
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];
  const root = document.documentElement;

  root.style.setProperty("--console-color", theme.console);
  root.style.setProperty("--console-color-dark", theme.consoleDark);
  root.style.setProperty("--console-color-light", theme.consoleLight);
  root.style.setProperty("--console-btn-color", theme.btnColor);
  root.style.setProperty("--console-btn-dark", theme.btnDark);
  root.style.setProperty("--screen-bg", theme.bg);

  console.log("[applyTheme] Theme applied for round " + round + ": " + theme.spikeStyle);
}

// ============= DRAWING FUNCTIONS =============
function drawBackground(): void {
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];

  // Sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, theme.bg);
  gradient.addColorStop(0.7, theme.skyline);
  gradient.addColorStop(1, theme.skyline);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Distant mountains/hills silhouette
  drawMountains(theme);

  // City skyline silhouette
  drawCitySkyline(theme);

  // Ground with grass detail
  drawGround(theme);

  // Danger zone (descending red area)
  if (dangerZoneY > 0) {
    drawDangerZone();
  }
}

function drawMountains(theme: typeof CONFIG.BG_THEMES[0]): void {
  ctx.fillStyle = theme.skyline;
  ctx.globalAlpha = 0.4;

  ctx.beginPath();
  ctx.moveTo(0, groundY);

  const mountainPoints = [
    { x: 0, y: groundY - h * 0.15 },
    { x: w * 0.15, y: groundY - h * 0.25 },
    { x: w * 0.3, y: groundY - h * 0.18 },
    { x: w * 0.45, y: groundY - h * 0.3 },
    { x: w * 0.6, y: groundY - h * 0.2 },
    { x: w * 0.75, y: groundY - h * 0.28 },
    { x: w * 0.9, y: groundY - h * 0.15 },
    { x: w, y: groundY - h * 0.22 },
  ];

  mountainPoints.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(w, groundY);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawCitySkyline(theme: typeof CONFIG.BG_THEMES[0]): void {
  const baseY = groundY;
  const buildings = [
    { x: 0.02, w: 0.06, h: 0.2 },
    { x: 0.1, w: 0.05, h: 0.28 },
    { x: 0.17, w: 0.08, h: 0.18 },
    { x: 0.28, w: 0.04, h: 0.32 },
    { x: 0.35, w: 0.07, h: 0.24 },
    { x: 0.48, w: 0.05, h: 0.35 },
    { x: 0.58, w: 0.08, h: 0.2 },
    { x: 0.7, w: 0.05, h: 0.28 },
    { x: 0.8, w: 0.06, h: 0.22 },
    { x: 0.9, w: 0.07, h: 0.26 },
  ];

  ctx.fillStyle = theme.skyline;
  ctx.globalAlpha = 0.5;

  buildings.forEach((b) => {
    const bx = b.x * w;
    const bw = b.w * w;
    const bh = b.h * h * 0.4;
    ctx.fillRect(bx, baseY - bh, bw, bh);

    // Windows
    ctx.fillStyle = theme.bg;
    ctx.globalAlpha = 0.3;
    for (let wy = baseY - bh + 8; wy < baseY - 8; wy += 12) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
        ctx.fillRect(wx, wy, 4, 6);
      }
    }
    ctx.fillStyle = theme.skyline;
    ctx.globalAlpha = 0.5;
  });

  ctx.globalAlpha = 1;
}

function drawGround(theme: typeof CONFIG.BG_THEMES[0]): void {
  // Main ground
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Darker bottom edge
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, groundY + 4, w, h - groundY - 4);

  // Grass tufts
  ctx.fillStyle = theme.accent;
  for (let x = 0; x < w; x += 8) {
    const height = 3 + Math.sin(x * 0.5 + gameTime * 0.001) * 2;
    ctx.fillRect(x, groundY - height, 3, height);
  }
}

function drawDangerZone(): void {
  // Main danger area
  const dangerGradient = ctx.createLinearGradient(0, 0, 0, dangerZoneY + 40);
  dangerGradient.addColorStop(0, "#c84040");
  dangerGradient.addColorStop(0.8, "#c84040");
  dangerGradient.addColorStop(1, "rgba(200, 64, 64, 0)");
  ctx.fillStyle = dangerGradient;
  ctx.fillRect(0, 0, w, dangerZoneY + 40);

  // Animated dripping effect
  ctx.fillStyle = "#c84040";
  for (let i = 0; i < w; i += 12) {
    const phase = i * 0.4 + gameTime * 0.003;
    const dripHeight = Math.sin(phase) * 12 + 18;
    const dripWidth = 6 + Math.sin(phase * 0.7) * 2;

    ctx.beginPath();
    ctx.moveTo(i, dangerZoneY);
    ctx.lineTo(i + dripWidth, dangerZoneY);
    ctx.lineTo(i + dripWidth / 2, dangerZoneY + dripHeight);
    ctx.closePath();
    ctx.fill();
  }

  // Warning pattern at the edge
  ctx.fillStyle = "#ffcc00";
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < w; i += 20) {
    const offset = ((gameTime * 0.05) % 20);
    ctx.fillRect(i - offset, dangerZoneY - 4, 10, 4);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(): void {
  const px = player.x;
  const py = player.y;
  const pw = CONFIG.PLAYER_WIDTH;
  const ph = CONFIG.PLAYER_HEIGHT;

  ctx.save();

  // Apply transformations
  const centerX = px + pw / 2;
  const centerY = py + ph / 2; // Rotate around center for flip
  ctx.translate(centerX, centerY);
  
  // 1. Facing direction (flips the whole character space)
  if (player.facingLeft) {
    ctx.scale(-1, 1);
  }
  
  // 2. Flip rotation (now rotation > 0 is always a "front flip" in character space)
  ctx.rotate(player.rotation);
  
  // 3. Squash and stretch
  ctx.scale(player.squashX, player.squashY);
  
  // Draw relative to center
  ctx.translate(-pw / 2, -ph / 2);

  // === CUTE BLUE SLIME CREATURE WITH LEGS ===
  const bodyMain = "#40a0ff";
  const bodyLight = "#80c0ff";
  const bodyDark = "#2060c0";
  const bodyGlow = "#b0e0ff";

  // Wobble animation
  const wobble = Math.sin(gameTime * 0.008) * 1.5;
  const runCycle = Math.sin(player.runTimer * 0.02);

  // Body - very rounded and "squishy"
  ctx.fillStyle = bodyMain;
  ctx.beginPath();
  // Main body blob
  ctx.roundRect(0, 2 + wobble, pw, ph - 6, 12);
  ctx.fill();

  // Top highlight
  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.roundRect(4, 4 + wobble, pw - 8, 8, 6);
  ctx.fill();

  // Two Little Legs
  ctx.fillStyle = bodyDark;
  const legY = ph - 4;
  const legWidth = 6;
  const legHeight = 6;
  
  if (player.isJumping) {
    // Tucked in legs when in air
    ctx.fillRect(4, legY - 2, legWidth, legHeight);
    ctx.fillRect(pw - 10, legY - 2, legWidth, legHeight);
  } else if (Math.abs(player.vx) > 0.5) {
    // Running legs animation
    const offset = runCycle * 5;
    ctx.fillRect(6 + offset, legY + Math.abs(offset) * 0.2, legWidth, legHeight);
    ctx.fillRect(pw - 12 - offset, legY + Math.abs(offset) * 0.2, legWidth, legHeight);
  } else {
    // Standing legs
    ctx.fillRect(6, legY, legWidth, legHeight);
    ctx.fillRect(pw - 12, legY, legWidth, legHeight);
  }

  // Large Expressive Eyes
  const eyeY = 12 + wobble * 0.5;
  const eyeSize = 7;
  
  ctx.fillStyle = "#ffffff";
  // Left eye
  ctx.beginPath();
  ctx.arc(8, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(pw - 8, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = "#1a1a2e";
  const pupilOffset = player.vx * 0.4;
  ctx.beginPath();
  ctx.arc(8 + pupilOffset, eyeY + 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pw - 8 + pupilOffset, eyeY + 1, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Eye shines
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(6 + pupilOffset, eyeY - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pw - 10 + pupilOffset, eyeY - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Blushing cheeks
  ctx.fillStyle = "#ff90a0";
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(4, eyeY + 6, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(pw - 4, eyeY + 6, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Mouth
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (player.hasDoubleJumped && player.rotation !== 0) {
    // Excited "O" mouth during flip
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.arc(pw / 2, eyeY + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Cute smile
    ctx.beginPath();
    ctx.arc(pw / 2, eyeY + 6, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // Glow aura for double jump
  if (player.hasDoubleJumped && player.isJumping) {
    ctx.globalAlpha = 0.3 + Math.sin(gameTime * 0.02) * 0.2;
    ctx.fillStyle = bodyGlow;
    ctx.beginPath();
    ctx.arc(pw / 2, ph / 2, pw, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}

function drawSaw(saw: SawBlade): void {
  const cx = saw.x;
  const cy = saw.y;
  const size = (CONFIG.SAW_SIZE / 2) * saw.scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(saw.rotation);

  // Glow effect
  if (saw.glowIntensity > 0) {
    let glowColor = "rgba(255, 100, 100, ";
    if (saw.style === "crystal") glowColor = "rgba(100, 200, 255, ";
    if (saw.style === "neon") glowColor = "rgba(255, 0, 255, ";
    
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
    glowGradient.addColorStop(0, glowColor + saw.glowIntensity * 0.5 + ")");
    glowGradient.addColorStop(1, glowColor + "0)");
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Define colors based on style and exploding state
  let mainColor = "#404040";
  let teethColor = "#606060";
  let innerColor = "#505050";
  let teethCount = 10;

  if (saw.exploding) {
    mainColor = "#ff4040";
    teethColor = "#ffff40";
    innerColor = "#ffffff";
  } else {
    switch (saw.style) {
      case "industrial":
        mainColor = "#2a2a2a";
        teethColor = "#808080";
        innerColor = "#3a3a3a";
        teethCount = 8;
        break;
      case "crystal":
        mainColor = "#40a0ff";
        teethColor = "#a0d0ff";
        innerColor = "#ffffff";
        teethCount = 6;
        break;
      case "organic":
        mainColor = "#4a7a3a";
        teethColor = "#6aa05a";
        innerColor = "#2a4a1a";
        teethCount = 12;
        break;
      case "neon":
        mainColor = "#ff00ff";
        teethColor = "#ffffff";
        innerColor = "#000000";
        teethCount = 10;
        break;
      case "steampunk":
        mainColor = "#8b4513";
        teethColor = "#daa520";
        innerColor = "#cd7f32";
        teethCount = 14;
        break;
    }
  }

  // Draw the saw body
  ctx.fillStyle = mainColor;
  ctx.beginPath();

  for (let i = 0; i < teethCount; i++) {
    const angle = (i / teethCount) * Math.PI * 2;
    const nextAngle = ((i + 0.5) / teethCount) * Math.PI * 2;

    const outerR = size;
    const innerR = size * (saw.style === "crystal" ? 0.5 : 0.7);

    if (i === 0) {
      ctx.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
    }
    ctx.lineTo(Math.cos(nextAngle) * innerR, Math.sin(nextAngle) * innerR);

    const nextNextAngle = ((i + 1) / teethCount) * Math.PI * 2;
    ctx.lineTo(Math.cos(nextNextAngle) * outerR, Math.sin(nextNextAngle) * outerR);
  }

  ctx.closePath();
  ctx.fill();

  // Style-specific details
  if (saw.style === "steampunk" && !saw.exploding) {
    ctx.strokeStyle = "#daa520";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner bolts
    ctx.fillStyle = "#cd7f32";
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (saw.style === "neon" && !saw.exploding) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff00ff";
  }

  // Inner core
  ctx.fillStyle = teethColor;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = innerColor;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCoin(coin: Coin): void {
  if (coin.collected) return;

  const cx = coin.x;
  const cy = coin.y + Math.sin(coin.bobOffset + gameTime * 0.005) * 3;
  const size = CONFIG.COIN_SIZE / 2;

  // Fade out near end of lifetime
  const fadeStart = CONFIG.COIN_LIFETIME * 0.7;
  let alpha = 1;
  if (coin.lifetime < fadeStart) {
    alpha = coin.lifetime / fadeStart;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  // Sparkle effect
  if (coin.sparkle > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = coin.sparkle * alpha;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + gameTime * 0.01;
      const dist = size * 1.5;
      ctx.fillRect(
        Math.cos(angle) * dist - 2,
        Math.sin(angle) * dist - 2,
        4,
        4
      );
    }
    ctx.globalAlpha = alpha;
  }

  // Coin body with 3D effect
  const gradient = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 0, 0, 0, size);
  gradient.addColorStop(0, "#fff700");
  gradient.addColorStop(0.5, "#ffd700");
  gradient.addColorStop(1, "#b8860b");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();

  // Coin border
  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Star/dollar symbol
  ctx.fillStyle = "#b8860b";
  ctx.fillRect(-2, -size * 0.5, 4, size);
  ctx.fillRect(-size * 0.5, -2, size, 4);

  ctx.restore();
}

function drawParticle(p: Particle): void {
  const alpha = (p.life / p.maxLife);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  if (p.type === "star") {
    // Star-shaped particle
    ctx.fillStyle = p.color;
    const starSize = p.size * alpha;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const innerAngle = angle + Math.PI / 5;
      ctx.lineTo(Math.cos(angle) * starSize, Math.sin(angle) * starSize);
      ctx.lineTo(Math.cos(innerAngle) * starSize * 0.4, Math.sin(innerAngle) * starSize * 0.4);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // Square particle
    const size = p.size * alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(-size / 2, -size / 2, size, size);
  }

  ctx.restore();
}

function drawParticles(): void {
  for (const p of particles) {
    drawParticle(p);
  }
}

function drawScorePopups(): void {
  for (const popup of scorePopups) {
    const progress = 1 - popup.life / popup.maxLife;
    const alpha = 1 - easeOutQuad(progress);
    const y = popup.y - progress * 30;
    const scale = 1 + easeOutBack(Math.min(progress * 3, 1)) * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(popup.x, y);
    ctx.scale(scale, scale);

    ctx.font = "bold 14px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Outline
    ctx.fillStyle = "#000000";
    ctx.fillText(popup.value, 1, 1);

    // Main text
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.value, 0, 0);

    ctx.restore();
  }
}

function drawFlashEffect(): void {
  if (screenFlash > 0) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = screenFlash * 0.4;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

let lastHUDScore = -1;
let lastHUDRound = -1;

function drawHUD(): void {
  // Update HTML displays with pop animation
  if (score !== lastHUDScore) {
    scoreDisplay.textContent = score.toString();
    if (lastHUDScore !== -1) {
      scoreBadge.classList.add("pop");
      setTimeout(() => scoreBadge.classList.remove("pop"), 120);
    }
    lastHUDScore = score;
  }

  if (round !== lastHUDRound) {
    roundDisplay.textContent = round.toString();
    if (lastHUDRound !== -1) {
      roundBadge.classList.add("pop");
      setTimeout(() => roundBadge.classList.remove("pop"), 200);
    }
    lastHUDRound = round;
  }

  // Progress bar
  const progress = (sawsDodgedThisRound / CONFIG.SAWS_PER_ROUND) * 100;
  progressBar.style.width = progress + "%";
}

// ============= PARTICLE SPAWNERS =============
function spawnScorePopup(x: number, y: number, value: string, color: string): void {
  scorePopups.push({
    x,
    y,
    value,
    life: CONFIG.POPUP_DURATION,
    maxLife: CONFIG.POPUP_DURATION,
    color,
  });
}

function spawnExplosionParticles(x: number, y: number): void {
  const colors = ["#ff6060", "#ff8040", "#ffff40", "#ffffff"];

  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const angle = (i / CONFIG.PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 4 + Math.random() * 6;
    const isstar = Math.random() > 0.6;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: CONFIG.PARTICLE_LIFE + Math.random() * 200,
      maxLife: CONFIG.PARTICLE_LIFE + Math.random() * 200,
      size: isstar ? 8 + Math.random() * 6 : 5 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: isstar ? "star" : "explosion",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
}

function spawnDustParticles(x: number, y: number): void {
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];

  for (let i = 0; i < 6; i++) {
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
    const speed = 1 + Math.random() * 2;

    particles.push({
      x: x + (Math.random() - 0.5) * CONFIG.PLAYER_WIDTH,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 300 + Math.random() * 200,
      maxLife: 400,
      size: 4 + Math.random() * 4,
      color: theme.accent,
      type: "dust",
      rotation: 0,
      rotationSpeed: 0,
    });
  }
}

function spawnCoinParticles(x: number, y: number): void {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const speed = 2 + Math.random() * 3;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 300,
      maxLife: 300,
      size: 4,
      color: "#ffd700",
      type: "star",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
    });
  }
}

// ============= GAME LOGIC =============
function updatePlayer(dt: number): void {
  const wasJumping = player.isJumping;
  const wasOnGround = player.y + CONFIG.PLAYER_HEIGHT >= groundY - 1;

  // Horizontal movement with slight acceleration
  const targetVx =
    (leftPressed ? -1 : 0) + (rightPressed ? 1 : 0);
  player.vx = lerp(player.vx, targetVx * CONFIG.PLAYER_SPEED, 0.3);

  if (player.vx < -0.1) player.facingLeft = true;
  else if (player.vx > 0.1) player.facingLeft = false;

  player.x += player.vx;

  // Keep player in bounds
  if (player.x < 0) player.x = 0;
  if (player.x + CONFIG.PLAYER_WIDTH > w) player.x = w - CONFIG.PLAYER_WIDTH;

  // Running animation
  if (Math.abs(player.vx) > 0.5 && !player.isJumping) {
    player.runTimer += dt;
    if (player.runTimer > 100) {
      player.runFrame = (player.runFrame + 1) % 4;
      player.runTimer = 0;
    }
  }

  // Handle rotation (flip animation)
  if (player.hasDoubleJumped && player.rotation < Math.PI * 2) {
    const flipSpeed = 0.3;
    player.rotation += flipSpeed;
    if (player.rotation > Math.PI * 2) {
      player.rotation = Math.PI * 2; // Stop at full flip
    }
  }

  // Apply gravity
  player.vy += CONFIG.GRAVITY;

  // Variable jump height: if button is released while moving up, cut velocity
  if (!jumpPressed && player.vy < -2) {
    player.vy *= 0.65;
  }

  player.y += player.vy;

  // Ground collision
  if (player.y + CONFIG.PLAYER_HEIGHT >= groundY) {
    player.y = groundY - CONFIG.PLAYER_HEIGHT;
    player.rotation = 0; // Reset rotation on land

    // Landing effects
    if (wasJumping && player.vy > 2) {
      // Squash on landing
      player.squashX = 1 + CONFIG.SQUASH_AMOUNT;
      player.squashY = 1 - CONFIG.SQUASH_AMOUNT;

      // Landing effects
      addScreenShake(CONFIG.SHAKE_LAND);
      spawnDustParticles(player.x + CONFIG.PLAYER_WIDTH / 2, groundY);
      playLandSound();
      triggerHaptic("light");

      // Award points for any saws jumped over
      onPlayerLand();
    }

    player.vy = 0;
    player.isJumping = false;
    player.canDoubleJump = true;
    player.hasDoubleJumped = false;
  }

  // Recover squash/stretch
  player.squashX = lerp(player.squashX, 1, CONFIG.SQUASH_RECOVERY);
  player.squashY = lerp(player.squashY, 1, CONFIG.SQUASH_RECOVERY);

  // Check if player hit by danger zone
  if (dangerZoneY > player.y + 5) {
    gameOver();
  }
}

function jump(): void {
  if (gameState !== "PLAYING") return;

  // First jump (from ground)
  if (!player.isJumping) {
    player.vy = CONFIG.JUMP_VELOCITY;
    player.isJumping = true;
    player.canDoubleJump = true;
    player.hasDoubleJumped = false;

    // Stretch on jump
    player.squashX = 1 - CONFIG.STRETCH_AMOUNT;
    player.squashY = 1 + CONFIG.STRETCH_AMOUNT;

    // Dust burst from ground
    spawnJumpDust(player.x + CONFIG.PLAYER_WIDTH / 2, groundY);

    addScreenShake(CONFIG.SHAKE_JUMP);
    playJumpSound();
    triggerHaptic("light");

    console.log("[jump] Player jumped");
  }
  // Double jump (in air)
  else if (player.canDoubleJump && !player.hasDoubleJumped) {
    player.vy = CONFIG.DOUBLE_JUMP_VELOCITY;
    player.hasDoubleJumped = true;
    player.canDoubleJump = false;
    player.rotation = 0; // Reset rotation to start flip

    // Stretch effect
    player.squashX = 1 - CONFIG.STRETCH_AMOUNT * 0.7;
    player.squashY = 1 + CONFIG.STRETCH_AMOUNT * 0.7;

    // Cool double jump particle burst around player
    spawnDoubleJumpBurst(player.x + CONFIG.PLAYER_WIDTH / 2, player.y + CONFIG.PLAYER_HEIGHT / 2);

    addScreenShake(CONFIG.SHAKE_JUMP * 1.3);
    playDoubleJumpSound();
    triggerHaptic("medium");

    console.log("[jump] Player double jumped and flipped!");
  }
}

function spawnJumpDust(x: number, y: number): void {
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];

  for (let i = 0; i < 10; i++) {
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.7;
    const speed = 2 + Math.random() * 3;

    particles.push({
      x: x + (Math.random() - 0.5) * CONFIG.PLAYER_WIDTH,
      y: y - 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 400,
      maxLife: 400,
      size: 6 + Math.random() * 5,
      color: theme.accent,
      type: "dust",
      rotation: 0,
      rotationSpeed: 0,
    });
  }
}

function spawnDoubleJumpBurst(x: number, y: number): void {
  // Circular burst of magical blue particles around player
  const colors = ["#60a8ff", "#80c8ff", "#ffffff", "#4080e0"];

  // Ring of particles bursting outward
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const speed = 4 + Math.random() * 2.5;

    particles.push({
      x: x + Math.cos(angle) * 12,
      y: y + Math.sin(angle) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 450,
      maxLife: 450,
      size: 6 + Math.random() * 5,
      color: colors[i % colors.length],
      type: "star",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.35,
    });
  }

  // Downward thrust particles for extra flair
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y + 10,
      vx: (Math.random() - 0.5) * 2,
      vy: 4 + Math.random() * 4,
      life: 350,
      maxLife: 350,
      size: 7 + Math.random() * 5,
      color: "#80c8ff",
      type: "dust",
      rotation: 0,
      rotationSpeed: 0,
    });
  }

  // Inner sparkle burst
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * 6,
      vy: Math.sin(angle) * 6 - 2,
      life: 300,
      maxLife: 300,
      size: 4,
      color: "#ffffff",
      type: "star",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: 0.4,
    });
  }
}

function playDoubleJumpSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Magical ascending whoosh sound
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioContext.destination);

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(400, audioContext.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.12);

  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(600, audioContext.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.12);

  gain.gain.setValueAtTime(0.1, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

  osc1.start(audioContext.currentTime);
  osc2.start(audioContext.currentTime);
  osc1.stop(audioContext.currentTime + 0.15);
  osc2.stop(audioContext.currentTime + 0.15);
}

function spawnSaw(): void {
  const x = Math.random() * (w - CONFIG.SAW_SIZE * 2) + CONFIG.SAW_SIZE;
  const adjustedSpeed = CONFIG.SAW_SPEED + (round - 1) * 0.15;
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];

  // Random angle biased downward (between 30 and 150 degrees)
  const angle = (Math.random() * 0.6 + 0.2) * Math.PI;
  const vx = Math.cos(angle) * adjustedSpeed * (Math.random() > 0.5 ? 1 : -1);
  const vy = Math.abs(Math.sin(angle) * adjustedSpeed); // Always start moving down

  saws.push({
    x,
    y: -CONFIG.SAW_SIZE,
    vx,
    vy,
    speed: adjustedSpeed,
    rotation: Math.random() * Math.PI * 2,
    jumpedOver: false,
    passed: false,
    hasHitGround: false,
    exploding: false,
    explodeTimer: 0,
    scale: 1,
    glowIntensity: 0,
    style: theme.spikeStyle,
  });

  console.log("[spawnSaw] Spawned saw at x=" + x.toFixed(0) + " with style " + theme.spikeStyle);
}

function updateSaws(dt: number): void {
  const halfSize = CONFIG.SAW_SIZE / 2;

  for (let i = saws.length - 1; i >= 0; i--) {
    const saw = saws[i];

    if (!saw.exploding) {
      // Move saw with velocity
      saw.x += saw.vx;
      saw.y += saw.vy;
      saw.rotation += CONFIG.SAW_ROTATION_SPEED * (Math.abs(saw.vx) + Math.abs(saw.vy)) * 0.3;

      // Bounce off left wall
      if (saw.x - halfSize <= 0) {
        saw.x = halfSize;
        saw.vx = Math.abs(saw.vx);
        addScreenShake(2);
        triggerHaptic("light");
      }

      // Bounce off right wall
      if (saw.x + halfSize >= w) {
        saw.x = w - halfSize;
        saw.vx = -Math.abs(saw.vx);
        addScreenShake(2);
        triggerHaptic("light");
      }

      // Bounce off top - only if it hasn't hit the ground yet
      if (saw.y - halfSize <= 0 && !saw.hasHitGround) {
        saw.y = halfSize;
        saw.vy = Math.abs(saw.vy);
        addScreenShake(2);
        triggerHaptic("light");
      }

      // Escape through top if it has already hit the ground
      if (saw.y + halfSize < -50 && saw.hasHitGround) {
        saws.splice(i, 1);
        continue;
      }

      // Bounce off ground
      if (saw.y + halfSize >= groundY) {
        saw.y = groundY - halfSize;
        saw.vy = -Math.abs(saw.vy);
        saw.hasHitGround = true; // Mark that it hit the ground
        addScreenShake(3);
        triggerHaptic("light");
      }

      // Check if player is currently above this saw while jumping
      // Player must be in the air and horizontally overlapping with the saw
      if (!saw.jumpedOver && !saw.passed && player.isJumping) {
        const playerBottom = player.y + CONFIG.PLAYER_HEIGHT;
        const playerLeft = player.x;
        const playerRight = player.x + CONFIG.PLAYER_WIDTH;
        const sawTop = saw.y - halfSize;
        const sawLeft = saw.x - halfSize;
        const sawRight = saw.x + halfSize;

        // Player is above the saw and horizontally overlapping
        const horizontalOverlap = playerRight > sawLeft && playerLeft < sawRight;
        const playerAboveSaw = playerBottom < sawTop + 10; // Small tolerance

        if (horizontalOverlap && playerAboveSaw) {
          saw.jumpedOver = true;
          saw.glowIntensity = 0.5; // Visual feedback that it's marked
          console.log("[updateSaws] Player jumped over saw!");
        }
      }

      // Check collision with player (only if not already jumped over)
      if (!saw.passed && checkSawCollision(saw)) {
        gameOver();
        return;
      }
    } else {
      // Exploding animation
      saw.explodeTimer -= dt;
      saw.rotation += CONFIG.SAW_ROTATION_SPEED * 4;
      saw.scale = lerp(saw.scale, 0, 0.1);
      saw.glowIntensity = saw.explodeTimer / 400;

      if (saw.explodeTimer <= 0) {
        saws.splice(i, 1);
        continue;
      }
    }
  }
}

// Called when player lands - awards points for any saws they jumped over
function onPlayerLand(): void {
  for (let i = saws.length - 1; i >= 0; i--) {
    const saw = saws[i];

    if (saw.jumpedOver && !saw.passed && !saw.exploding) {
      saw.passed = true;
      score++;
      sawsDodgedThisRound++;

      // Trigger explosion
      saw.exploding = true;
      saw.explodeTimer = 400;
      saw.glowIntensity = 1;

      addScreenShake(CONFIG.SHAKE_EXPLOSION);
      addScreenFlash("#ff8040", 0.8);
      playExplosionSound();
      triggerHaptic("medium");

      spawnExplosionParticles(saw.x, saw.y);
      spawnCoins(saw.x, saw.y);
      spawnScorePopup(saw.x, saw.y - 20, "+1", "#ffffff");

      console.log("[onPlayerLand] Saw dodged on landing! Score: " + score);

      if (sawsDodgedThisRound >= CONFIG.SAWS_PER_ROUND) {
        nextRound();
      }
    }
  }
}

function checkSawCollision(saw: SawBlade): boolean {
  const playerCX = player.x + CONFIG.PLAYER_WIDTH / 2;
  const playerCY = player.y + CONFIG.PLAYER_HEIGHT / 2;

  const dx = playerCX - saw.x;
  const dy = playerCY - saw.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const collisionRadius = CONFIG.SAW_SIZE / 2 * 0.7 + Math.min(CONFIG.PLAYER_WIDTH, CONFIG.PLAYER_HEIGHT) / 3;

  return distance < collisionRadius;
}

function spawnCoins(x: number, y: number): void {
  for (let i = 0; i < CONFIG.COINS_PER_SAW; i++) {
    const angle = ((i / CONFIG.COINS_PER_SAW) - 0.5) * Math.PI * 0.8 - Math.PI / 2;
    const spreadX = Math.cos(angle) * CONFIG.COIN_SPREAD * (0.6 + Math.random() * 0.4);
    const spreadY = Math.sin(angle) * CONFIG.COIN_SPREAD * 0.5;

    coins.push({
      x: x + spreadX,
      y: y + spreadY,
      vy: -6 - Math.random() * 4,
      collected: false,
      rotation: Math.random() * Math.PI * 2,
      onGround: false,
      lifetime: CONFIG.COIN_LIFETIME,
      bobOffset: Math.random() * Math.PI * 2,
      sparkle: 1,
    });
  }
}

function updateCoins(dt: number): void {
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];

    if (coin.collected) {
      coins.splice(i, 1);
      continue;
    }

    // Sparkle decay
    coin.sparkle = Math.max(0, coin.sparkle - dt * 0.002);

    // Lifetime
    coin.lifetime -= dt;
    if (coin.lifetime <= 0) {
      coins.splice(i, 1);
      continue;
    }

    // Apply gravity
    if (!coin.onGround) {
      coin.vy += CONFIG.COIN_GRAVITY;
      coin.y += coin.vy;

      // Ground collision
      if (coin.y + CONFIG.COIN_SIZE / 2 >= groundY) {
        coin.y = groundY - CONFIG.COIN_SIZE / 2;
        coin.vy = -coin.vy * CONFIG.COIN_BOUNCE;
        if (Math.abs(coin.vy) < 1.5) {
          coin.onGround = true;
          coin.vy = 0;
        }
      }
    }

    // Collect coin if player touches it
    if (checkCoinCollision(coin)) {
      coin.collected = true;
      totalCoins++;

      playCoinSound();
      triggerHaptic("light");
      spawnCoinParticles(coin.x, coin.y);
      spawnScorePopup(coin.x, coin.y, "+1", "#ffd700");
    }
  }
}

function checkCoinCollision(coin: Coin): boolean {
  const playerCX = player.x + CONFIG.PLAYER_WIDTH / 2;
  const playerCY = player.y + CONFIG.PLAYER_HEIGHT / 2;

  const dx = playerCX - coin.x;
  const dy = playerCY - coin.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance < CONFIG.COIN_SIZE + CONFIG.PLAYER_WIDTH / 2;
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.vx *= 0.98;
    p.rotation += p.rotationSpeed;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateScorePopups(dt: number): void {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].life -= dt;
    if (scorePopups[i].life <= 0) {
      scorePopups.splice(i, 1);
    }
  }
}

function updateDangerZone(): void {
  dangerZoneY += CONFIG.DANGER_ZONE_SPEED;
}

function nextRound(): void {
  round++;
  sawsDodgedThisRound = 0;
  dangerZoneY = CONFIG.DANGER_ZONE_START;

  applyTheme();
  addScreenFlash("#ffffff", 1);
  addScreenShake(10);
  playRoundSound();
  triggerHaptic("success");

  spawnScorePopup(w / 2, h / 3, "ROUND " + round + "!", "#ffffff");

  console.log("[nextRound] Starting round " + round);

  // Celebratory particles
  const theme = CONFIG.BG_THEMES[(round - 1) % CONFIG.BG_THEMES.length];
  for (let i = 0; i < 30; i++) {
    particles.push({
      x: Math.random() * w,
      y: h + 20,
      vx: (Math.random() - 0.5) * 4,
      vy: -8 - Math.random() * 8,
      life: 1200,
      maxLife: 1200,
      size: 8 + Math.random() * 6,
      color: i % 2 === 0 ? theme.accent : "#ffffff",
      type: "star",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
    });
  }
}

function resetGame(): void {
  console.log("[resetGame] Resetting game state");

  score = 0;
  totalCoins = 0;
  round = 1;
  sawsDodgedThisRound = 0;
  dangerZoneY = CONFIG.DANGER_ZONE_START;
  gameTime = 0;

  applyTheme();

  saws = [];
  coins = [];
  particles = [];
  scorePopups = [];

  shakeIntensity = 0;
  screenFlash = 0;
  lastHUDScore = -1;
  lastHUDRound = -1;

  player.x = w / 2 - CONFIG.PLAYER_WIDTH / 2;
  player.y = groundY - CONFIG.PLAYER_HEIGHT;
  player.vx = 0;
  player.vy = 0;
  player.rotation = 0;
  player.isJumping = false;
  player.canDoubleJump = true;
  player.hasDoubleJumped = false;
  player.facingLeft = false;
  player.squashX = 1;
  player.squashY = 1;
  player.runFrame = 0;
}

function gameOver(): void {
  gameState = "GAME_OVER";
  stopLoop();
  console.log("[gameOver] Final score: " + score + ", Coins: " + totalCoins);

  oasiz.submitScore(score);
  console.log("[gameOver] Score submitted: " + score);

  // Death effects
  addScreenShake(CONFIG.SHAKE_DEATH);
  addScreenFlash("#ff0000", 1);

  for (let i = 0; i < 25; i++) {
    const angle = (i / 25) * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x: player.x + CONFIG.PLAYER_WIDTH / 2,
      y: player.y + CONFIG.PLAYER_HEIGHT / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 800,
      maxLife: 800,
      size: 6 + Math.random() * 6,
      color: i % 3 === 0 ? "#40a0ff" : i % 3 === 1 ? "#80c0ff" : "#ffffff",
      type: "explosion",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    });
  }

  playDeathSound();
  triggerHaptic("error");
  stopBackgroundMusic();

  finalScoreEl.textContent = score.toString();
  coinsCollectedEl.textContent = totalCoins + " COINS";

  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";
  stopFallingSaws();
  startLoop();

  initAudio();
  resetGame();

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");

  playUIClick();
  triggerHaptic("light");
  playBackgroundMusic();
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  stopLoop();
  pauseScreen.classList.remove("hidden");
  triggerHaptic("light");
  pauseBackgroundMusic();
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  startLoop();
  triggerHaptic("light");
  playBackgroundMusic();
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";
  stopLoop();

  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");

  startFallingSaws();
  stopBackgroundMusic();
}

// ============= INPUT HANDLERS =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      leftPressed = true;
      if (gameState === "PLAYING") triggerHaptic("light");
    }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      rightPressed = true;
      if (gameState === "PLAYING") triggerHaptic("light");
    }
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      jumpPressed = true;
      if (gameState === "PLAYING") {
        jump();
      } else if (gameState === "START") {
        startGame();
      }
    }
    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      leftPressed = false;
    }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      rightPressed = false;
    }
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      jumpPressed = false;
    }
  });

  // Touch controls
  function addButtonHandler(btn: HTMLElement, onDown: () => void, onUp: () => void): void {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      onDown();
      btn.classList.add("pressed");
    });
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      onUp();
      btn.classList.remove("pressed");
    });
    btn.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      onUp();
      btn.classList.remove("pressed");
    });
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onDown();
      btn.classList.add("pressed");
    });
    btn.addEventListener("mouseup", (e) => {
      e.preventDefault();
      onUp();
      btn.classList.remove("pressed");
    });
    btn.addEventListener("mouseleave", () => {
      onUp();
      btn.classList.remove("pressed");
    });
  }

  addButtonHandler(leftBtn, () => {
    leftPressed = true;
    if (gameState === "PLAYING") triggerHaptic("light");
  }, () => { leftPressed = false; });

  addButtonHandler(rightBtn, () => {
    rightPressed = true;
    if (gameState === "PLAYING") triggerHaptic("light");
  }, () => { rightPressed = false; });

  addButtonHandler(jumpBtn, () => {
    jumpPressed = true;
    if (gameState === "PLAYING") jump();
  }, () => {
    jumpPressed = false;
  });

  // UI buttons
  document.getElementById("startButton")!.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", pauseGame);
  settingsBtn.addEventListener("click", () => {
    if (gameState === "PLAYING") pauseGame();
    settingsModal.classList.remove("hidden");
    playUIClick();
    triggerHaptic("light");
  });
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add("hidden");
      playUIClick();
    }
  });
  document.getElementById("resumeButton")!.addEventListener("click", resumeGame);
  document.getElementById("pauseRestartBtn")!.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    startGame();
  });
  document.getElementById("pauseMenuBtn")!.addEventListener("click", showStartScreen);
  document.getElementById("restartButton")!.addEventListener("click", startGame);
  document.getElementById("menuButton")!.addEventListener("click", showStartScreen);

  // Settings
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("sawDodge_music", settings.music.toString());
    updateMusicState();
    playUIClick();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("sawDodge_fx", settings.fx.toString());
    if (settings.fx) playUIClick();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("sawDodge_haptics", settings.haptics.toString());
    playUIClick();
    triggerHaptic("light");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    if (gameState === "PAUSED") resumeGame();
    playUIClick();
    triggerHaptic("light");
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  const rect = screenContainer.getBoundingClientRect();
  w = rect.width;
  h = rect.height;
  canvas.width = w;
  canvas.height = h;

  ctx.imageSmoothingEnabled = false;

  groundY = h - CONFIG.GROUND_OFFSET;

  if (player.y > groundY - CONFIG.PLAYER_HEIGHT) {
    player.y = groundY - CONFIG.PLAYER_HEIGHT;
  }

  console.log("[resizeCanvas] Canvas resized to: " + w + " x " + h);
}

// ============= GAME LOOP =============
let lastTime = 0;
let lastSawSpawn = 0;
let accumulator = 0;
const FIXED_DT = 1000 / 60; // Fixed timestep at 60fps (16.67ms)
let rafId: number | null = null;

function startLoop(): void {
  if (rafId !== null) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function gameLoop(timestamp: number): void {
  const frameTime = Math.min(timestamp - lastTime, 100); // Cap at 100ms to prevent spiral of death
  lastTime = timestamp;
  gameTime = timestamp;
  
  accumulator += frameTime;

  // Update screen effects (visual only, can run per frame)
  updateScreenEffects();

  // Apply screen shake
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Clear and draw
  ctx.clearRect(-20, -20, w + 40, h + 40);
  drawBackground();

  if (gameState === "PLAYING") {
    // Spawn saws (limit how many can be on screen) - time based, not physics
    const activeSaws = saws.filter(s => !s.exploding).length;
    const maxSaws = CONFIG.MAX_SAWS_ON_SCREEN + Math.floor((round - 1) * 0.5);
    const spawnInterval = CONFIG.SAW_SPAWN_INTERVAL / (1 + (round - 1) * 0.1);
    
    if (timestamp - lastSawSpawn > spawnInterval && activeSaws < maxSaws) {
      spawnSaw();
      lastSawSpawn = timestamp;
    }

    // Fixed timestep physics updates
    while (accumulator >= FIXED_DT) {
      updatePlayer(FIXED_DT);
      updateSaws(FIXED_DT);
      updateCoins(FIXED_DT);
      updateDangerZone();
      accumulator -= FIXED_DT;
    }
    
    // Visual updates can use frame time
    updateParticles(frameTime);
    updateScorePopups(frameTime);

    // Draw
    for (const coin of coins) drawCoin(coin);
    for (const saw of saws) drawSaw(saw);
    drawPlayer();
    drawParticles();
    drawScorePopups();
    drawFlashEffect();
    drawHUD();

  } else if (gameState === "START") {
    // The start screen overlay handles the white background and falling saws via DOM
    // Just draw the background for the canvas area (will be covered by overlay)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    accumulator = 0; // Reset accumulator when not playing

  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    for (const coin of coins) drawCoin(coin);
    for (const saw of saws) drawSaw(saw);
    if (gameState === "PAUSED") drawPlayer();
    drawParticles();
    updateParticles(frameTime);
    drawScorePopups();
    updateScorePopups(frameTime);
    drawFlashEffect();
    drawHUD();
    accumulator = 0; // Reset accumulator when paused
  }

  ctx.restore();
  rafId = requestAnimationFrame(gameLoop);
}

// ============= START SCREEN FALLING SAWS =============
const fallingSawsContainer = document.getElementById("fallingSaws")!;
let startScreenSawInterval: number | null = null;

const SAW_COLORS = [
  { main: "#c84040", teeth: "#e06060", core: "#802020" }, // Red
  { main: "#4080c8", teeth: "#60a0e0", core: "#205080" }, // Blue
  { main: "#40c840", teeth: "#60e060", core: "#208020" }, // Green
  { main: "#c8a040", teeth: "#e0c060", core: "#806020" }, // Gold
  { main: "#8040c8", teeth: "#a060e0", core: "#502080" }, // Purple
  { main: "#c84080", teeth: "#e060a0", core: "#802050" }, // Pink
  { main: "#40c8c8", teeth: "#60e0e0", core: "#208080" }, // Cyan
  { main: "#c86040", teeth: "#e08060", core: "#804020" }, // Orange
];

function createFallingSaw(): void {
  const sawElement = document.createElement("div");
  sawElement.className = "falling-saw";
  
  // Use the start screen container dimensions
  const containerRect = startScreen.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  
  const size = 30 + Math.random() * 45;
  const x = Math.random() * (containerWidth - size);
  const duration = 3 + Math.random() * 3;
  const delay = Math.random() * -duration;
  const opacity = 0.25 + Math.random() * 0.45;
  const teethCount = 6 + Math.floor(Math.random() * 6);
  const colorSet = SAW_COLORS[Math.floor(Math.random() * SAW_COLORS.length)];
  
  // Use transform for the fall animation with custom travel distance
  const travelDistance = containerHeight + size + 100;
  sawElement.style.cssText = "left: " + x + "px; width: " + size + "px; height: " + size + "px; animation-duration: " + duration + "s; animation-delay: " + delay + "s; opacity: " + opacity + "; --fall-distance: " + travelDistance + "px;";
  
  // Create SVG saw blade
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  
  // Generate saw teeth path
  let pathD = "";
  for (let i = 0; i < teethCount; i++) {
    const angle = (i / teethCount) * Math.PI * 2;
    const nextAngle = ((i + 0.5) / teethCount) * Math.PI * 2;
    const nextNextAngle = ((i + 1) / teethCount) * Math.PI * 2;
    
    const outerR = 45;
    const innerR = 30;
    
    const x1 = 50 + Math.cos(angle) * outerR;
    const y1 = 50 + Math.sin(angle) * outerR;
    const x2 = 50 + Math.cos(nextAngle) * innerR;
    const y2 = 50 + Math.sin(nextAngle) * innerR;
    const x3 = 50 + Math.cos(nextNextAngle) * outerR;
    const y3 = 50 + Math.sin(nextNextAngle) * outerR;
    
    if (i === 0) {
      pathD += "M " + x1 + " " + y1 + " ";
    }
    pathD += "L " + x2 + " " + y2 + " L " + x3 + " " + y3 + " ";
  }
  pathD += "Z";
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", colorSet.main);
  
  const innerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  innerCircle.setAttribute("cx", "50");
  innerCircle.setAttribute("cy", "50");
  innerCircle.setAttribute("r", "15");
  innerCircle.setAttribute("fill", colorSet.teeth);
  
  const coreCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  coreCircle.setAttribute("cx", "50");
  coreCircle.setAttribute("cy", "50");
  coreCircle.setAttribute("r", "6");
  coreCircle.setAttribute("fill", colorSet.core);
  
  svg.appendChild(path);
  svg.appendChild(innerCircle);
  svg.appendChild(coreCircle);
  sawElement.appendChild(svg);
  
  fallingSawsContainer.appendChild(sawElement);
  
  // Remove after animation completes
  setTimeout(() => {
    if (sawElement.parentNode) {
      sawElement.parentNode.removeChild(sawElement);
    }
  }, (duration - delay) * 1000 + 100);
}

function startFallingSaws(): void {
  console.log("[startFallingSaws] Starting falling saws animation");
  // Clear existing saws
  fallingSawsContainer.innerHTML = "";
  
  // Create initial batch
  for (let i = 0; i < 12; i++) {
    createFallingSaw();
  }
  
  // Keep creating new saws
  startScreenSawInterval = window.setInterval(() => {
    if (gameState === "START") {
      createFallingSaw();
    }
  }, 400);
}

function stopFallingSaws(): void {
  console.log("[stopFallingSaws] Stopping falling saws animation");
  if (startScreenSawInterval !== null) {
    clearInterval(startScreenSawInterval);
    startScreenSawInterval = null;
  }
  fallingSawsContainer.innerHTML = "";
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Saw Dodge");

  oasiz.onPause(() => {
    if (gameState === "PLAYING") {
      pauseGame();
    } else {
      pauseBackgroundMusic();
    }
  });

  oasiz.onResume(() => {
    if (gameState === "PAUSED") {
      playBackgroundMusic();
    }
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  setupInputHandlers();

  player.x = w / 2 - CONFIG.PLAYER_WIDTH / 2;
  player.y = groundY - CONFIG.PLAYER_HEIGHT;

  showStartScreen();
  startFallingSaws();

  console.log("[init] Game initialized");
}

init();
