import { oasiz } from "@oasiz/sdk";

/**
 * DUAL BLOCK DODGE
 *
 * A vertically-scrolling arcade game where the player simultaneously controls
 * two blocks, navigating them through obstacles using a split-screen touch model.
 *
 * Controls:
 * - No touch: Both blocks drift to center
 * - Left touch: Both blocks move left
 * - Right touch: Both blocks move right
 * - Dual touch: Blocks split apart
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Blocks
  BLOCK_SIZE: 28,
  BLOCK_CORNER_RADIUS: 6,
  BLOCK_Y_POSITION: 0.75, // Blocks at 75% down the screen
  BLOCK_MOVE_SPEED: 0.3, // Moderated for better control
  BLOCK_NEUTRAL_GAP: 28, // Gap between blocks matches size so they touch
  BLOCK_EDGE_MARGIN: 0, // No margin, allow blocks to reach edges

  // Scrolling
  INITIAL_SCROLL_SPEED: 6.5, // Even faster start
  SPEED_INCREMENT: 1.8, // Faster ramp-up
  MAX_SCROLL_SPEED: 25, 
  SPEED_RAMP_DECAY_THRESHOLD: 12, 
  SPEED_RAMP_DECAY_RATE: 0.75, 

  // Checkpoints
  CHECKPOINT_OBSTACLE_INTERVAL: 6, // Frequent level progression (every 6 obstacles)

  // Obstacles
  OBSTACLE_MIN_SPACING: 285, // Closer together
  OBSTACLE_MAX_SPACING: 340, 
  REGULAR_SPIKE_SPACING_MULT: 1.2, // Increased to prevent spikes from clustering too close
  OPPOSITE_SIDE_SPACING_MULT: 1.6, // Increased from 1.2 to give more time to swipe across the screen
  ABSOLUTE_MIN_PHYSICAL_GAP: 72, // Minimum vertical pixel gap between the tip of a bottom obstacle and base of a top one
  SIDE_SPIKE_LONG_WIDTH: 0.75, // Reverted to previous length
  SIDE_SPIKE_MEDIUM_WIDTH: 0.48, // Reverted to previous length
  SIDE_SPIKE_SMALL_WIDTH: 0.25, // Reverted to previous length
  CENTER_OBS_SMALL_WIDTH: 0.45,
  CENTER_OBS_LARGE_WIDTH: 0.85,
  CENTER_OBS_MIN_GAP: 54, // Increased from 42 to give more breathing room (Block 28px + 26px buffer)
  SPIKE_HEIGHT: 85, // Even thicker vertically ("wider" in user terms)
  CENTER_OBS_SMALL_HEIGHT: 100, // Original height for small
  CENTER_OBS_LARGE_HEIGHT: 180, // Taller still (was 160)
  SPIKE_TILT_REGULAR: 85, 
  SPIKE_TILT_PAIRED: 15, 

  // Visuals
  TRAIL_LENGTH: 12,
  PARTICLE_COUNT: 20,
  PARTICLE_LIFE: 800,
  GRID_SIZE: 50,
  SCREEN_SHAKE_INTENSITY: 12, // Intensity of the checkpoint shake

  // Colors
  NEON_CYAN: "#00f5ff",
  NEON_PINK: "#ff00ff",
  NEON_PURPLE: "#a855f7",
  SHARD_LIGHT: "#e2e8f0",
  SHARD_DARK: "#94a3b8",
  BG_DARK: "#020617",
  BG_DARKER: "#000000",

  // Background color themes for checkpoints
  BG_THEMES: [
    { dark: "#020617", darker: "#000000", neon: "#00f5ff" }, // Default Cyan
    { dark: "#1a0217", darker: "#000000", neon: "#ff00ff" }, // Pink
    { dark: "#021a02", darker: "#000000", neon: "#00ff00" }, // Green
    { dark: "#1a1a02", darker: "#000000", neon: "#ffff00" }, // Yellow
    { dark: "#02021a", darker: "#000000", neon: "#5555ff" }, // Blue
    { dark: "#1a0202", darker: "#000000", neon: "#ff5555" }, // Red
  ],

  // Safe areas
  TOP_SAFE_DESKTOP: 45,
  TOP_SAFE_MOBILE: 120,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

type ObstacleType =
  | "spike_left"
  | "spike_right"
  | "spike_long_left"
  | "spike_long_right"
  | "spikes_both"
  | "center_small"
  | "center_large"
  | "checkpoint_line";

interface Obstacle {
  type: ObstacleType;
  y: number;
  passed: boolean;
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
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface TouchState {
  leftActive: boolean;
  rightActive: boolean;
}

// ============= UTILITY FUNCTIONS =============
function getObstacleUpwardReach(type: ObstacleType): number {
  switch (type) {
    case "center_large": return CONFIG.CENTER_OBS_LARGE_HEIGHT / 2;
    case "center_small": return CONFIG.CENTER_OBS_SMALL_HEIGHT / 2;
    case "spikes_both": return CONFIG.SPIKE_TILT_PAIRED;
    case "checkpoint_line": return 0;
    default: return CONFIG.SPIKE_TILT_REGULAR; // All other single spikes
  }
}

function getObstacleDownwardReach(type: ObstacleType): number {
  switch (type) {
    case "center_large": return CONFIG.CENTER_OBS_LARGE_HEIGHT / 2;
    case "center_small": return CONFIG.CENTER_OBS_SMALL_HEIGHT / 2;
    case "checkpoint_line": return 0;
    default: return CONFIG.SPIKE_HEIGHT / 2; // All spikes
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const gameContainer = document.getElementById("game-container")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const finalScore = document.getElementById("finalScore")!;
const checkpointCount = document.getElementById("checkpointCount")!;
const startButton = document.getElementById("startButton")!;

// State
let gameState: GameState = "START";
let w = gameContainer.clientWidth;
let h = gameContainer.clientHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let leftBlockX = 0;
let rightBlockX = 0;
let leftBlockTargetX = 0;
let rightBlockTargetX = 0;
let blockY = 0;

// Trails
let leftTrail: TrailPoint[] = [];
let rightTrail: TrailPoint[] = [];

// Touch state
let touchState: TouchState = {
  leftActive: false,
  rightActive: false,
};

// Keyboard state
let keysDown: Set<string> = new Set();

// Obstacles
let obstacles: Obstacle[] = [];
let lastSpikeSide: "left" | "right" | "none" = "none";
let sameSideSpikeCount = 0;
let lastObstacleType: ObstacleType | "none" = "none";
let sameTypeCount = 0;

// Progress
let distance = 0;
let checkpoints = 0;
let currentThemeIndex = 0;
let scrollSpeed = CONFIG.INITIAL_SCROLL_SPEED;
let obstaclesPassedSinceCheckpoint = 0; // New counter

// Particles
let particles: Particle[] = [];

// Screen shake and juice
let checkpointFlash = 0;
let checkpointAnnounceTimer = 0; // Timer for the big centered text
let screenShake = 0; // Current shake timer/intensity

// Settings
let settings: Settings = {
  music: localStorage.getItem("dualBlockDodge_music") !== "false",
  fx: localStorage.getItem("dualBlockDodge_fx") !== "false",
  haptics: localStorage.getItem("dualBlockDodge_haptics") !== "false",
};

// Grid offset for scrolling effect
let gridOffset = 0;

// ============= AUDIO =============
const bgMusic = new Audio("https://assets.oasiz.ai/audio/dualblock-song.mp3");
bgMusic.loop = true;

// Web Audio API for synth sounds
let audioContext: AudioContext | null = null;

function initAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log("[initAudio] Audio context initialized");
  }
}

function playCheckpointSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(880, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    1760,
    audioContext.currentTime + 0.1
  );

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.2);
}

function playCrashSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);

  gain.gain.setValueAtTime(0.4, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.3);
}

function playUIClick(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, audioContext.currentTime);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.05);
}

// ============= HAPTICS =============
function triggerHaptic(type: string): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type as any);
}

// ============= DRAWING FUNCTIONS =============
function drawBackground(): void {
  const theme = CONFIG.BG_THEMES[currentThemeIndex];
  
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, theme.dark);
  gradient.addColorStop(1, theme.darker);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Decorative floating squares (aesthetic from images)
  const time = Date.now() / 1000;
  ctx.fillStyle = hexToRgba(theme.neon, 0.03);
  for (let i = 0; i < 15; i++) {
    const size = 100 + (i * 20) % 150;
    const x = (Math.sin(i * 1.5 + time * 0.1) * 0.5 + 0.5) * w;
    const y = ((i * 200 + gridOffset * 0.5) % (h + 400)) - 200;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i + time * 0.05);
    ctx.fillRect(-size/2, -size/2, size, size);
    ctx.restore();
  }

  // Scrolling grid
  ctx.strokeStyle = hexToRgba(theme.neon, 0.06);
  ctx.lineWidth = 1;

  const gridSize = CONFIG.GRID_SIZE;
  const offsetY = gridOffset % gridSize;

  // Vertical lines
  for (let x = 0; x <= w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Horizontal lines (scrolling)
  for (let y = -gridSize + offsetY; y <= h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Central divider guide (for mobile tap targets)
  if (isMobile) {
    ctx.strokeStyle = hexToRgba(theme.neon, 0.15);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]); // Reset
  }

  // Checkpoint flash
  if (checkpointFlash > 0) {
    const alpha = (checkpointFlash / 600) * 0.4;
    ctx.fillStyle = hexToRgba(theme.neon, alpha);
    ctx.fillRect(0, 0, w, h);
  }
}

function drawScore(): void {
  const theme = CONFIG.BG_THEMES[currentThemeIndex];
  const safeTop = isMobile ? CONFIG.TOP_SAFE_MOBILE : CONFIG.TOP_SAFE_DESKTOP;

  // Distance as large watermark
  const distText = Math.floor(distance).toString();
  const fontSize = Math.min(w * 0.25, 120);
  ctx.font = "900 " + fontSize + "px Orbitron";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hexToRgba(theme.neon, 0.1);
  ctx.fillText(distText, w / 2, safeTop + 80);

  // Checkpoint indicator
  if (checkpoints > 0) {
    ctx.font = "600 16px Orbitron";
    ctx.fillStyle = hexToRgba(theme.neon, 0.4); // More transparent
    ctx.fillText("CHECKPOINT " + checkpoints, w / 2, safeTop + 130);
  }

  // Big centered announcement
  if (checkpointAnnounceTimer > 0) {
    const alpha = (Math.min(1, checkpointAnnounceTimer / 300)) * 0.4; // More transparent
    const scale = 1 + (1 - alpha) * 0.2; // Less intrusive pop-in
    
    ctx.save();
    ctx.translate(w / 2, h * 0.4);
    ctx.scale(scale, scale);
    
    ctx.font = "900 32px Orbitron"; // Slightly smaller
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Outer glow
    ctx.shadowColor = theme.neon;
    ctx.shadowBlur = 15;
    ctx.fillStyle = hexToRgba("#ffffff", alpha);
    ctx.fillText("CHECKPOINT " + checkpoints, 0, 0);
    
    ctx.restore();
  }
}

function drawBlock(
  x: number,
  y: number,
  color: string,
  trail: TrailPoint[]
): void {
  const size = CONFIG.BLOCK_SIZE;
  const radius = CONFIG.BLOCK_CORNER_RADIUS;

  // Draw trail
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const trailSize = size * (0.3 + 0.5 * t.alpha);
    ctx.fillStyle = hexToRgba(color, t.alpha * 0.4);
    ctx.beginPath();
    ctx.roundRect(
      t.x - trailSize / 2,
      t.y - trailSize / 2,
      trailSize,
      trailSize,
      radius * t.alpha
    );
    ctx.fill();
  }

  // Glow effect
  const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
  glowGradient.addColorStop(0, hexToRgba(color, 0.4));
  glowGradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Main block
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 35; // Increased glow
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, radius);
  ctx.fill();
  
  // Extra outer glow layer
  ctx.shadowBlur = 60;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner highlight
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.roundRect(
    x - size / 2 + 2,
    y - size / 2 + 2,
    size / 3,
    size / 3,
    radius / 2
  );
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

function drawBlocks(): void {
  drawBlock(leftBlockX, blockY, CONFIG.NEON_CYAN, leftTrail);
  drawBlock(rightBlockX, blockY, CONFIG.NEON_PINK, rightTrail);
}

function getCenterObstacleWidth(type: "center_small" | "center_large"): number {
  const ratio = type === "center_small" ? CONFIG.CENTER_OBS_SMALL_WIDTH : CONFIG.CENTER_OBS_LARGE_WIDTH;
  const preferredWidth = w * ratio;
  
  if (type === "center_large") {
    const maxWidth = w - (CONFIG.CENTER_OBS_MIN_GAP * 2);
    return Math.min(preferredWidth, maxWidth);
  }
  
  return preferredWidth;
}

function drawObstacles(): void {
  for (const obs of obstacles) {
    if (obs.y > h + 100 || obs.y < -100) continue;

    switch (obs.type) {
      case "spike_left":
        drawSideSpike(obs.y, "left", CONFIG.SIDE_SPIKE_MEDIUM_WIDTH, CONFIG.SPIKE_TILT_REGULAR);
        break;
      case "spike_right":
        drawSideSpike(obs.y, "right", CONFIG.SIDE_SPIKE_MEDIUM_WIDTH, CONFIG.SPIKE_TILT_REGULAR);
        break;
      case "spike_long_left":
        drawSideSpike(obs.y, "left", CONFIG.SIDE_SPIKE_LONG_WIDTH, CONFIG.SPIKE_TILT_REGULAR);
        break;
      case "spike_long_right":
        drawSideSpike(obs.y, "right", CONFIG.SIDE_SPIKE_LONG_WIDTH, CONFIG.SPIKE_TILT_REGULAR);
        break;
      case "spikes_both":
        drawSideSpike(obs.y, "left", CONFIG.SIDE_SPIKE_SMALL_WIDTH, CONFIG.SPIKE_TILT_PAIRED);
        drawSideSpike(obs.y, "right", CONFIG.SIDE_SPIKE_SMALL_WIDTH, CONFIG.SPIKE_TILT_PAIRED);
        break;
      case "center_small":
        drawCenterObstacle(obs.y, getCenterObstacleWidth("center_small"), CONFIG.CENTER_OBS_SMALL_HEIGHT);
        break;
      case "center_large":
        drawCenterObstacle(obs.y, getCenterObstacleWidth("center_large"), CONFIG.CENTER_OBS_LARGE_HEIGHT);
        break;
      case "checkpoint_line":
        drawCheckpointLine(obs.y);
        break;
    }
  }
}

function drawCheckpointLine(y: number): void {
  const theme = CONFIG.BG_THEMES[currentThemeIndex];
  ctx.save();
  ctx.strokeStyle = hexToRgba("#ffffff", 0.5);
  ctx.lineWidth = 4;
  ctx.setLineDash([15, 15]);
  
  // Glowing line
  ctx.shadowColor = theme.neon;
  ctx.shadowBlur = 15;
  
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  
  // Checkpoint text on the line
  ctx.fillStyle = hexToRgba("#ffffff", 0.3); // More transparent
  ctx.font = "900 14px Orbitron";
  ctx.textAlign = "center";
  ctx.fillText("CHECKPOINT", w / 2, y - 10);
  
  ctx.restore();
}

function drawSideSpike(y: number, side: "left" | "right", widthRatio: number, tilt: number): void {
  const spikeWidth = w * widthRatio;
  const spikeHeight = CONFIG.SPIKE_HEIGHT;

  ctx.save();
  
  const tipY = y - tilt;
  if (side === "left") {
    const tipX = spikeWidth;

    // Light face (top half)
    const gradTop = ctx.createLinearGradient(0, y - spikeHeight / 2, tipX, tipY);
    gradTop.addColorStop(0, CONFIG.SHARD_LIGHT);
    gradTop.addColorStop(1, CONFIG.SHARD_DARK);
    ctx.fillStyle = gradTop;
    ctx.beginPath();
    ctx.moveTo(0, y - spikeHeight / 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(0, y);
    ctx.fill();

    // Dark face (bottom half)
    const gradBottom = ctx.createLinearGradient(0, y, tipX, tipY);
    gradBottom.addColorStop(0, CONFIG.SHARD_DARK);
    gradBottom.addColorStop(1, "#475569"); 
    ctx.fillStyle = gradBottom;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(0, y + spikeHeight / 2);
    ctx.fill();

    // Glowing white outline
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y - spikeHeight / 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(0, y + spikeHeight / 2);
    ctx.stroke();
  } else {
    const tipX = w - spikeWidth;

    // Light face (top half)
    const gradTop = ctx.createLinearGradient(w, y - spikeHeight / 2, tipX, tipY);
    gradTop.addColorStop(0, CONFIG.SHARD_LIGHT);
    gradTop.addColorStop(1, CONFIG.SHARD_DARK);
    ctx.fillStyle = gradTop;
    ctx.beginPath();
    ctx.moveTo(w, y - spikeHeight / 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(w, y);
    ctx.fill();

    // Dark face (bottom half)
    const gradBottom = ctx.createLinearGradient(w, y, tipX, tipY);
    gradBottom.addColorStop(0, CONFIG.SHARD_DARK);
    gradBottom.addColorStop(1, "#475569");
    ctx.fillStyle = gradBottom;
    ctx.beginPath();
    ctx.moveTo(w, y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(w, y + spikeHeight / 2);
    ctx.fill();

    // Glowing white outline
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w, y - spikeHeight / 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(w, y + spikeHeight / 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCenterObstacle(y: number, obsWidth: number, obsHeight: number): void {
  const cx = w / 2;

  ctx.save();

  // Faceted 3D look from images
  // Top-left face
  const gradTL = ctx.createLinearGradient(cx - obsWidth/2, y - obsHeight/2, cx, y);
  gradTL.addColorStop(0, CONFIG.SHARD_LIGHT);
  gradTL.addColorStop(1, CONFIG.SHARD_DARK);
  ctx.fillStyle = gradTL;
  ctx.beginPath();
  ctx.moveTo(cx, y - obsHeight / 2);
  ctx.lineTo(cx + obsWidth / 2, y);
  ctx.lineTo(cx, y);
  ctx.fill();

  // Top-right face
  const gradTR = ctx.createLinearGradient(cx + obsWidth/2, y - obsHeight/2, cx, y);
  gradTR.addColorStop(0, CONFIG.SHARD_DARK);
  gradTR.addColorStop(1, "#475569");
  ctx.fillStyle = gradTR;
  ctx.beginPath();
  ctx.moveTo(cx + obsWidth / 2, y);
  ctx.lineTo(cx, y + obsHeight / 2);
  ctx.lineTo(cx, y);
  ctx.fill();

  // Bottom-right face
  const gradBR = ctx.createLinearGradient(cx + obsWidth/2, y + obsHeight/2, cx, y);
  gradBR.addColorStop(0, "#334155");
  gradBR.addColorStop(1, "#1e293b");
  ctx.fillStyle = gradBR;
  ctx.beginPath();
  ctx.moveTo(cx, y + obsHeight / 2);
  ctx.lineTo(cx - obsWidth / 2, y);
  ctx.lineTo(cx, y);
  ctx.fill();

  // Bottom-left face
  const gradBL = ctx.createLinearGradient(cx - obsWidth/2, y + obsHeight/2, cx, y);
  gradBL.addColorStop(0, CONFIG.SHARD_DARK);
  gradBL.addColorStop(1, "#334155");
  ctx.fillStyle = gradBL;
  ctx.beginPath();
  ctx.moveTo(cx - obsWidth / 2, y);
  ctx.lineTo(cx, y - obsHeight / 2);
  ctx.lineTo(cx, y);
  ctx.fill();

  // Glowing white outline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, y - obsHeight / 2);
  ctx.lineTo(cx + obsWidth / 2, y);
  ctx.lineTo(cx, y + obsHeight / 2);
  ctx.lineTo(cx - obsWidth / 2, y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = hexToRgba(p.color, alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= GAME LOGIC =============
function calculateBlockPositions(): void {
  const centerX = w / 2;
  const halfGap = CONFIG.BLOCK_NEUTRAL_GAP / 2;
  const radius = CONFIG.BLOCK_SIZE / 2;
  const edgeMargin = CONFIG.BLOCK_EDGE_MARGIN + radius;

  // Determine target positions based on input
  if (touchState.leftActive && touchState.rightActive) {
    // Dual touch - blocks split to edges
    leftBlockTargetX = edgeMargin;
    rightBlockTargetX = w - edgeMargin;
  } else if (touchState.leftActive) {
    // Left touch only - both blocks move to left edge
    leftBlockTargetX = edgeMargin;
    rightBlockTargetX = edgeMargin + CONFIG.BLOCK_NEUTRAL_GAP;
  } else if (touchState.rightActive) {
    // Right touch only - both blocks move to right edge
    leftBlockTargetX = w - edgeMargin - CONFIG.BLOCK_NEUTRAL_GAP;
    rightBlockTargetX = w - edgeMargin;
  } else {
    // No touch - drift to center
    leftBlockTargetX = centerX - halfGap;
    rightBlockTargetX = centerX + halfGap;
  }

  // Handle keyboard input (overrides touch for accessibility/testing)
  if (keysDown.has("ArrowLeft") || keysDown.has("a") || keysDown.has("A")) {
    if (keysDown.has("ArrowRight") || keysDown.has("d") || keysDown.has("D")) {
      // Both keys - split to edges
      leftBlockTargetX = edgeMargin;
      rightBlockTargetX = w - edgeMargin;
    } else {
      // Left only - move pair to left edge
      leftBlockTargetX = edgeMargin;
      rightBlockTargetX = edgeMargin + CONFIG.BLOCK_NEUTRAL_GAP;
    }
  } else if (keysDown.has("ArrowRight") || keysDown.has("d") || keysDown.has("D")) {
    // Right only - move pair to right edge
    leftBlockTargetX = w - edgeMargin - CONFIG.BLOCK_NEUTRAL_GAP;
    rightBlockTargetX = w - edgeMargin;
  }

  // Final clamping to ensure blocks stay on screen
  leftBlockTargetX = clamp(leftBlockTargetX, edgeMargin, w - edgeMargin);
  rightBlockTargetX = clamp(rightBlockTargetX, edgeMargin, w - edgeMargin);
}

function updateBlocks(): void {
  calculateBlockPositions();

  // Smooth interpolation
  leftBlockX = lerp(leftBlockX, leftBlockTargetX, CONFIG.BLOCK_MOVE_SPEED);
  rightBlockX = lerp(rightBlockX, rightBlockTargetX, CONFIG.BLOCK_MOVE_SPEED);

  // Update trails
  leftTrail.unshift({ x: leftBlockX, y: blockY, alpha: 1 });
  rightTrail.unshift({ x: rightBlockX, y: blockY, alpha: 1 });

  if (leftTrail.length > CONFIG.TRAIL_LENGTH) leftTrail.pop();
  if (rightTrail.length > CONFIG.TRAIL_LENGTH) rightTrail.pop();

  for (const t of leftTrail) t.alpha *= 0.85;
  for (const t of rightTrail) t.alpha *= 0.85;
}

function pickObstacleType(): ObstacleType {
  const types: ObstacleType[] = [
    "spike_left",
    "spike_right",
    "spike_long_left",
    "spike_long_right",
    "spikes_both",
    "center_small",
    "center_large",
  ];

  // Weight based on difficulty
  // [spike_left, spike_right, spike_long_left, spike_long_right, spikes_both, center_small, center_large]
  // Increased center_large weight by ~5% of total
  let weights: number[];
  if (checkpoints < 1) {
    // Level 0: Heavily favor long spikes over medium
    weights = [1, 1, 12, 12, 4, 4, 4]; // center_large 2 -> 4
  } else if (checkpoints < 3) {
    // Levels 1-2: Add more challenge
    weights = [1, 1, 14, 14, 4, 4, 7]; // center_large 4 -> 7
  } else {
    // Level 3+: Peak difficulty variety
    weights = [1, 1, 16, 16, 6, 4, 10]; // center_large 6 -> 10
  }

  let selectedType: ObstacleType = types[0];
  let attempts = 0;

  while (attempts < 20) {
    attempts++;
    
    // Weighted random selection
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedType = types[i];
        break;
      }
    }

    // Determine if this is a regular single-side spike
    let currentSide: "left" | "right" | "none" = "none";
    if (selectedType === "spike_left" || selectedType === "spike_long_left") currentSide = "left";
    else if (selectedType === "spike_right" || selectedType === "spike_long_right") currentSide = "right";

    // --- Side Streak Rules (Single Spikes) ---
    // Never 3 on the same side
    if (currentSide !== "none" && currentSide === lastSpikeSide && sameSideSpikeCount >= 2) {
      continue; // Reroll
    }
    
    // Rarely 2 on the same side
    if (currentSide !== "none" && currentSide === lastSpikeSide && sameSideSpikeCount === 1) {
      if (Math.random() < 0.85) continue; // 85% chance to reroll if it's the 2nd in a row
    }

    // --- General Type Streak Rules (All Obstacles) ---
    // Never 3 of the exact same type in a row
    if (selectedType === lastObstacleType && sameTypeCount >= 2) {
      continue; // Reroll
    }

    // Rarely 2 of the exact same type in a row
    if (selectedType === lastObstacleType && sameTypeCount === 1) {
      if (Math.random() < 0.85) continue; // 85% chance to reroll
    }

    // If we reach here, selection is valid. Update tracking state.
    
    // Update type count
    if (selectedType === lastObstacleType) {
      sameTypeCount++;
    } else {
      lastObstacleType = selectedType;
      sameTypeCount = 1;
    }

    // Update side count
    if (currentSide !== "none") {
      if (currentSide === lastSpikeSide) {
        sameSideSpikeCount++;
      } else {
        lastSpikeSide = currentSide;
        sameSideSpikeCount = 1;
      }
    } else {
      // Something else spawned (both spikes or center), reset the side streak
      lastSpikeSide = "none";
      sameSideSpikeCount = 0;
    }
    
    return selectedType;
  }

  return selectedType;
}

function spawnObstacleAt(y: number, type: ObstacleType): void {
  obstacles.push({
    type: type,
    y: y,
    passed: false,
  });
}

function updateObstacles(): void {
  // Move obstacles down
  for (const obs of obstacles) {
    obs.y += scrollSpeed;
    
    // Check if obstacle has just passed the blocks
    if (!obs.passed && obs.y > blockY) {
      obs.passed = true;
      obstaclesPassedSinceCheckpoint++;
      
      // Trigger checkpoint if count reached
      if (obstaclesPassedSinceCheckpoint >= CONFIG.CHECKPOINT_OBSTACLE_INTERVAL) {
        triggerCheckpoint();
      }
    }
  }

  // Remove off-screen obstacles (below the screen)
  obstacles = obstacles.filter((obs) => obs.y < h + 200);

  // Find the topmost obstacle currently on screen
  let topObstacleY = 0;
  if (obstacles.length > 0) {
    topObstacleY = Math.min(...obstacles.map((obs) => obs.y));
  }

  // Continuously spawn new obstacles above the screen
  const spawnThreshold = -50; 
  
  if (topObstacleY > spawnThreshold || obstacles.length === 0) {
    const previousSide = lastSpikeSide;
    const actualBottomType = obstacles.length > 0 ? obstacles[obstacles.length - 1].type : "none";
    
    // Check if we should spawn a checkpoint line instead of a regular obstacle
    // We want the checkpoint line to be the LAST thing spawned in the interval
    const obstaclesInFlight = obstacles.filter(o => !o.passed && o.type !== "checkpoint_line").length;
    const remainingInInterval = CONFIG.CHECKPOINT_OBSTACLE_INTERVAL - obstaclesPassedSinceCheckpoint;
    
    let nextType: ObstacleType;
    if (obstaclesInFlight + 1 === remainingInInterval && !obstacles.some(o => o.type === "checkpoint_line" && !o.passed)) {
      nextType = "checkpoint_line";
    } else {
      nextType = pickObstacleType();
    }
    
    // Calculate where the next obstacle should spawn
    let spacing =
      CONFIG.OBSTACLE_MIN_SPACING +
      Math.random() * (CONFIG.OBSTACLE_MAX_SPACING - CONFIG.OBSTACLE_MIN_SPACING);
    
    // If it's a checkpoint line, maybe give it a bit more space
    if (nextType === "checkpoint_line") {
      spacing *= 1.5;
    }
    
    // Extra space if ANY center obstacle is involved
    const isCenterInvolved = nextType.includes("center") || 
      (lastObstacleType !== "none" && lastObstacleType.includes("center"));
      
    if (isCenterInvolved) {
      const isSpikeInvolved = 
        nextType.includes("spike") || 
        (lastObstacleType !== "none" && lastObstacleType.includes("spike"));
      
      if (isSpikeInvolved) {
        spacing *= 2.6; // Huge gap to ensure players have time to clear the edges
      } else {
        spacing *= 1.8;
      }
    }
    
    // Determine if this is a regular single-side spike
    let currentSide: "left" | "right" | "none" = "none";
    if (nextType === "spike_left" || nextType === "spike_long_left") currentSide = "left";
    else if (nextType === "spike_right" || nextType === "spike_long_right") currentSide = "right";

    // Increase distance when spikes are on opposite sides
    if (currentSide !== "none" && previousSide !== "none" && currentSide !== previousSide) {
      spacing *= CONFIG.OPPOSITE_SIDE_SPACING_MULT;
    }

    // Regular spikes (single side) are positioned closer together
    const isRegularSpike = currentSide !== "none";
    
    if (isRegularSpike) {
      spacing *= CONFIG.REGULAR_SPIKE_SPACING_MULT;
    }

    // Reduce spacing as speed increases for tighter gameplay
    const speedFactor = 1 - (scrollSpeed - CONFIG.INITIAL_SCROLL_SPEED) / 10;
    const actualSpacing = spacing * Math.max(0.6, speedFactor);
    
    // Safety Net: Ensure absolute minimum physical gap
    let spawnY = obstacles.length > 0 ? topObstacleY - actualSpacing : -50;

    if (actualBottomType !== "none") {
      const upwardReach = getObstacleUpwardReach(actualBottomType as ObstacleType);
      const downwardReach = getObstacleDownwardReach(nextType);
      
      const physicalGap = actualSpacing - upwardReach - downwardReach;
      
      if (physicalGap < CONFIG.ABSOLUTE_MIN_PHYSICAL_GAP) {
        const deficit = CONFIG.ABSOLUTE_MIN_PHYSICAL_GAP - physicalGap;
        spawnY -= deficit;
      }
    }
    
    spawnObstacleAt(spawnY, nextType);
  }
}

function checkCollisions(): boolean {
  const blockSize = CONFIG.BLOCK_SIZE;
  const blockHalf = blockSize / 2;

  for (const obs of obstacles) {
    const hitboxes = getObstacleHitboxes(obs);

    for (const hitbox of hitboxes) {
      // Check left block
      if (
        leftBlockX + blockHalf > hitbox.x &&
        leftBlockX - blockHalf < hitbox.x + hitbox.w &&
        blockY + blockHalf > hitbox.y &&
        blockY - blockHalf < hitbox.y + hitbox.h
      ) {
        return true;
      }

      // Check right block
      if (
        rightBlockX + blockHalf > hitbox.x &&
        rightBlockX - blockHalf < hitbox.x + hitbox.w &&
        blockY + blockHalf > hitbox.y &&
        blockY - blockHalf < hitbox.y + hitbox.h
      ) {
        return true;
      }
    }
  }

  return false;
}

function getObstacleHitboxes(
  obs: Obstacle
): { x: number; y: number; w: number; h: number }[] {
  const hitboxes: { x: number; y: number; w: number; h: number }[] = [];
  const spikeHeight = CONFIG.SPIKE_HEIGHT;
  
  // Use different tilt based on type
  const isPaired = obs.type === "spikes_both";
  const tilt = isPaired ? CONFIG.SPIKE_TILT_PAIRED : CONFIG.SPIKE_TILT_REGULAR;

  const visualToHitboxBuffer = 8; // Shrink hitboxes slightly so glancing blows don't kill

  // Helper to create precise multi-box hitboxes for triangles/diamonds
  // This removes "ghost space" by approximating slanted shapes with multiple rectangles
  const addPreciseSpike = (startX: number, spikeWidth: number, direction: 1 | -1) => {
    const segments = 5;
    for (let i = 0; i < segments; i++) {
      // Current progress through the spike's width (0 to 1)
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      
      // X range for this segment
      const x1 = startX + direction * (t1 * spikeWidth);
      const x2 = startX + direction * (t2 * spikeWidth);
      const segmentW = Math.abs(x2 - x1);
      const leftX = Math.min(x1, x2);

      // Y range at the start and end of this segment
      // Linear interpolation between the thick base and the thin tip
      const baseTop = obs.y - spikeHeight / 2;
      const baseBottom = obs.y + spikeHeight / 2;
      const tipY = obs.y - tilt;

      const yTop1 = lerp(baseTop, tipY, t1);
      const yTop2 = lerp(baseTop, tipY, t2);
      const yBottom1 = lerp(baseBottom, tipY, t1);
      const yBottom2 = lerp(baseBottom, tipY, t2);

      const minY = Math.min(yTop1, yTop2);
      const maxY = Math.max(yBottom1, yBottom2);

      hitboxes.push({
        x: leftX,
        y: minY + visualToHitboxBuffer,
        w: segmentW,
        h: Math.max(0, maxY - minY - visualToHitboxBuffer * 2)
      });
    }
  };

  const addPreciseDiamond = (centerX: number, obsWidth: number, obsHeight: number) => {
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      // Horizontal progress through the diamond (-1 to 1)
      const t1 = (i / segments) * 2 - 1;
      const t2 = ((i + 1) / segments) * 2 - 1;
      
      const x1 = centerX + (t1 * obsWidth / 2);
      const x2 = centerX + (t2 * obsWidth / 2);
      const segmentW = Math.abs(x2 - x1);
      const leftX = Math.min(x1, x2);

      // Vertical reach at these X points (linear diamond profile)
      const reach1 = (1 - Math.abs(t1)) * (obsHeight / 2);
      const reach2 = (1 - Math.abs(t2)) * (obsHeight / 2);
      const maxReach = Math.max(reach1, reach2);

      hitboxes.push({
        x: leftX,
        y: obs.y - maxReach + visualToHitboxBuffer,
        w: segmentW,
        h: Math.max(0, maxReach * 2 - visualToHitboxBuffer * 2)
      });
    }
  };

  switch (obs.type) {
    case "spike_left": {
      addPreciseSpike(0, w * CONFIG.SIDE_SPIKE_MEDIUM_WIDTH, 1);
      break;
    }
    case "spike_right": {
      addPreciseSpike(w, w * CONFIG.SIDE_SPIKE_MEDIUM_WIDTH, -1);
      break;
    }
    case "spike_long_left": {
      addPreciseSpike(0, w * CONFIG.SIDE_SPIKE_LONG_WIDTH, 1);
      break;
    }
    case "spike_long_right": {
      addPreciseSpike(w, w * CONFIG.SIDE_SPIKE_LONG_WIDTH, -1);
      break;
    }
    case "spikes_both": {
      addPreciseSpike(0, w * CONFIG.SIDE_SPIKE_SMALL_WIDTH, 1);
      addPreciseSpike(w, w * CONFIG.SIDE_SPIKE_SMALL_WIDTH, -1);
      break;
    }
    case "center_small": {
      addPreciseDiamond(w / 2, getCenterObstacleWidth("center_small"), CONFIG.CENTER_OBS_SMALL_HEIGHT);
      break;
    }
    case "center_large": {
      addPreciseDiamond(w / 2, getCenterObstacleWidth("center_large"), CONFIG.CENTER_OBS_LARGE_HEIGHT);
      break;
    }
  }

  return hitboxes;
}

function updateProgress(): void {
  distance += scrollSpeed * 0.1;
}

function triggerCheckpoint(): void {
  // Checkpoint reached!
  checkpoints++;
  obstaclesPassedSinceCheckpoint = 0;
  
  // Cycle background theme
  currentThemeIndex = (currentThemeIndex + 1) % CONFIG.BG_THEMES.length;

  // Calculate speed increment with exponential decay for high speeds
  let actualIncrement = CONFIG.SPEED_INCREMENT;
  if (scrollSpeed > CONFIG.SPEED_RAMP_DECAY_THRESHOLD) {
    const excess = scrollSpeed - CONFIG.SPEED_RAMP_DECAY_THRESHOLD;
    // Every 2 speed units beyond threshold reduces increment by the decay rate factor
    actualIncrement *= Math.pow(CONFIG.SPEED_RAMP_DECAY_RATE, excess / 2);
    // Ensure increment doesn't drop to 0 completely, keep some sense of progression
    actualIncrement = Math.max(actualIncrement, 0.1);
  }

  // Increase speed
  scrollSpeed = Math.min(
    scrollSpeed + actualIncrement,
    CONFIG.MAX_SCROLL_SPEED
  );

  // Visual, audio and shake feedback
  checkpointFlash = 600; // Longer flash
  checkpointAnnounceTimer = 1000; // Show text for 1 second
  screenShake = CONFIG.SCREEN_SHAKE_INTENSITY * 1.5; // Stronger shake
  
  playCheckpointSound();
  triggerHaptic("success");

  // Spawn celebratory particles
  const theme = CONFIG.BG_THEMES[currentThemeIndex];
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 10;
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: CONFIG.PARTICLE_LIFE,
      maxLife: CONFIG.PARTICLE_LIFE,
      size: 4 + Math.random() * 8,
      color: theme.neon,
    });
  }

  console.log(
    "[triggerCheckpoint] Checkpoint " + checkpoints + "! Speed: " + scrollSpeed.toFixed(1) + " Theme: " + currentThemeIndex
  );
}

function spawnCollisionParticles(x: number, y: number, color: string): void {
  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / CONFIG.PARTICLE_COUNT + Math.random() * 0.5;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: CONFIG.PARTICLE_LIFE,
      maxLife: CONFIG.PARTICLE_LIFE,
      size: 4 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // Gravity
    p.vx *= 0.98; // Friction
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function resetGame(): void {
  console.log("[resetGame] Starting new game");

  distance = 0;
  checkpoints = 0;
  currentThemeIndex = 0;
  scrollSpeed = CONFIG.INITIAL_SCROLL_SPEED;
  obstaclesPassedSinceCheckpoint = 0;

  obstacles = [];
  lastSpikeSide = "none";
  sameSideSpikeCount = 0;
  lastObstacleType = "none";
  sameTypeCount = 0;
  particles = [];

  leftTrail = [];
  rightTrail = [];

  screenShake = 0;
  checkpointFlash = 0;
  checkpointAnnounceTimer = 0;

  // Reset block positions
  const centerX = w / 2;
  const halfGap = CONFIG.BLOCK_NEUTRAL_GAP / 2;
  leftBlockX = centerX - halfGap;
  rightBlockX = centerX + halfGap;
  leftBlockTargetX = leftBlockX;
  rightBlockTargetX = rightBlockX;

  // Spawn initial obstacles - fill the visible area with some buffer above
  let spawnY = 100; // Start first obstacle near top of visible area
  
  while (spawnY > -300) {
    const type = pickObstacleType();
    
    // Calculate spacing for next obstacle
    let spacing =
      CONFIG.OBSTACLE_MIN_SPACING +
      Math.random() * (CONFIG.OBSTACLE_MAX_SPACING - CONFIG.OBSTACLE_MIN_SPACING);
    
    // Regular spikes are positioned closer together
    const isRegularSpike = type === "spike_left" || type === "spike_right" || 
                          type === "spike_long_left" || type === "spike_long_right";
    if (isRegularSpike) {
      spacing *= CONFIG.REGULAR_SPIKE_SPACING_MULT;
    }

    // Safety Net for Initial Spawning
    if (obstacles.length > 0) {
      const bottomObstacleType = obstacles[obstacles.length - 1].type;
      const upwardReach = getObstacleUpwardReach(bottomObstacleType);
      const downwardReach = getObstacleDownwardReach(type);
      const physicalGap = spacing - upwardReach - downwardReach;
      
      if (physicalGap < CONFIG.ABSOLUTE_MIN_PHYSICAL_GAP) {
        spacing += (CONFIG.ABSOLUTE_MIN_PHYSICAL_GAP - physicalGap);
      }
    }

    spawnObstacleAt(spawnY, type);
    spawnY -= spacing;
  }
  
  console.log("[resetGame] Spawned " + obstacles.length + " initial obstacles");
}

function gameOver(): void {
  gameState = "GAME_OVER";
  console.log("[gameOver] Final distance: " + Math.floor(distance));

  // Stop music
  bgMusic.pause();
  bgMusic.currentTime = 0;

  // Submit score
  const finalDistance = Math.floor(distance);
  oasiz.submitScore(finalDistance);
  console.log("[gameOver] Score submitted: " + finalDistance);

  // Spawn death particles at both block positions
  spawnCollisionParticles(leftBlockX, blockY, CONFIG.NEON_CYAN);
  spawnCollisionParticles(rightBlockX, blockY, CONFIG.NEON_PINK);

  // Audio and haptics
  playCrashSound();
  triggerHaptic("error");

  // Update UI
  finalScore.textContent = finalDistance.toString();
  checkpointCount.textContent = checkpoints + " Checkpoint" + (checkpoints !== 1 ? "s" : "");

  // Show game over screen
  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";

  initAudio();
  resetGame();

  // Play music if enabled
  if (settings.music) {
    bgMusic.play().catch(e => console.log("[startGame] Audio play failed:", e));
  }

  // Hide overlays
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  // Show buttons
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");

  playUIClick();
  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  
  // Pause music
  bgMusic.pause();
  
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  
  // Resume music if enabled
  if (settings.music) {
    bgMusic.play().catch(e => console.log("[resumeGame] Audio play failed:", e));
  }
  
  triggerHaptic("light");
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";

  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (!keysDown.has(e.key)) {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) {
        if (gameState === "PLAYING") triggerHaptic("light");
      }
    }
    keysDown.add(e.key);

    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }

    // Space to start
    if (e.key === " " && gameState === "START") {
      startGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key);
  });

  // Touch handlers
  function handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (gameState !== "PLAYING") return;

    triggerHaptic("light");
    updateTouchState(e.touches);
  }

  function handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (gameState !== "PLAYING") return;

    updateTouchState(e.touches);
  }

  function handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (gameState !== "PLAYING") return;

    updateTouchState(e.touches);
  }

  function updateTouchState(touches: TouchList): void {
    const rect = gameContainer.getBoundingClientRect();
    const midX = rect.width / 2;

    touchState.leftActive = false;
    touchState.rightActive = false;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const x = touch.clientX - rect.left;

      if (x < midX) {
        touchState.leftActive = true;
      } else {
        touchState.rightActive = true;
      }
    }
  }

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

  // Mouse (for desktop testing)
  let mouseDown = false;
  let mouseX = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "PLAYING") return;
    mouseDown = true;
    triggerHaptic("light");
    mouseX = e.clientX - gameContainer.getBoundingClientRect().left;
    updateMouseState();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (gameState !== "PLAYING" || !mouseDown) return;
    mouseX = e.clientX - gameContainer.getBoundingClientRect().left;
    updateMouseState();
  });

  canvas.addEventListener("mouseup", () => {
    mouseDown = false;
    touchState.leftActive = false;
    touchState.rightActive = false;
  });

  canvas.addEventListener("mouseleave", () => {
    mouseDown = false;
    touchState.leftActive = false;
    touchState.rightActive = false;
  });

  function updateMouseState(): void {
    const midX = w / 2;
    if (mouseX < midX) {
      touchState.leftActive = true;
      touchState.rightActive = false;
    } else {
      touchState.leftActive = false;
      touchState.rightActive = true;
    }
  }

  // UI Button handlers
  startButton.addEventListener("click", () => {
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    if (gameState === "PLAYING") {
      gameState = "PAUSED";
      oasiz.gameplayStop();
      bgMusic.pause();
    }
    pauseScreen.classList.add("hidden");
    settingsModal.classList.remove("hidden");
    playUIClick();
    triggerHaptic("light");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    
    // If we are in the middle of a game, return to the pause menu instead of throwing them directly into action
    if (gameState === "PAUSED" && startScreen.classList.contains("hidden") && gameOverScreen.classList.contains("hidden")) {
      pauseScreen.classList.remove("hidden");
    }
    
    playUIClick();
    triggerHaptic("light");
  });

  pauseBtn.addEventListener("click", pauseGame);
  document.getElementById("resumeButton")!.addEventListener("click", resumeGame);
  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    startGame();
  });
  document.getElementById("pauseMenuButton")!.addEventListener("click", showStartScreen);

  document.getElementById("restartButton")!.addEventListener("click", startGame);
  document.getElementById("backToStartButton")!.addEventListener("click", showStartScreen);

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("dualBlockDodge_music", settings.music.toString());
    
    if (settings.music && gameState === "PLAYING") {
      bgMusic.play().catch(e => console.log("[musicToggle] Audio play failed:", e));
    } else {
      bgMusic.pause();
    }
    
    playUIClick();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("dualBlockDodge_fx", settings.fx.toString());
    if (settings.fx) playUIClick();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("dualBlockDodge_haptics", settings.haptics.toString());
    playUIClick();
    triggerHaptic("light");
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  w = gameContainer.clientWidth;
  h = gameContainer.clientHeight;
  canvas.width = w;
  canvas.height = h;

  // Update block Y position - higher up (closer to center) on mobile
  const yRatio = isMobile ? 0.6 : CONFIG.BLOCK_Y_POSITION;
  blockY = h * yRatio;

  console.log("[resizeCanvas] Canvas resized to: " + w + " x " + h + " blockY: " + blockY.toFixed(0));
}

// ============= GAME LOOP =============
let lastTime = 0;
let rafId = 0;

function startLoop(): void {
  if (rafId) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function gameLoop(timestamp: number): void {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  ctx.save();
  // Apply screen shake
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.9; // Decay shake
    if (screenShake < 0.1) screenShake = 0;
  }

  // Clear and draw background
  drawBackground();

  if (gameState === "PLAYING") {
    // Update grid scroll
    gridOffset += scrollSpeed;

    // Update game objects
    updateBlocks();
    updateObstacles();
    updateProgress();
    updateParticles(dt);

    // Check collisions
    if (checkCollisions()) {
      gameOver();
    }

    // Decay checkpoint flash and announcement
    if (checkpointFlash > 0) {
      checkpointFlash -= dt;
      if (checkpointFlash < 0) checkpointFlash = 0;
    }
    if (checkpointAnnounceTimer > 0) {
      checkpointAnnounceTimer -= dt;
      if (checkpointAnnounceTimer < 0) checkpointAnnounceTimer = 0;
    }

    // Draw game
    drawScore();
    drawObstacles();
    drawBlocks();
    drawParticles();
  } else if (gameState === "START") {
    // Animate blocks on start screen
    const time = Date.now() / 1000;
    const floatOffset = Math.sin(time * 2) * 15;

    ctx.save();
    ctx.translate(0, floatOffset);
    drawBlock(w / 2 - 40, h * 0.5, CONFIG.NEON_CYAN, []);
    drawBlock(w / 2 + 40, h * 0.5, CONFIG.NEON_PINK, []);
    ctx.restore();
  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    // Draw frozen state
    gridOffset += scrollSpeed * 0.1; // Slow scroll
    drawScore();
    drawObstacles();
    drawBlocks();
    drawParticles();
    updateParticles(dt);
  }

  ctx.restore();
  rafId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Dual Block Dodge");

  // Setup canvas
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Setup input
  setupInputHandlers();

  // Initialize block positions
  const centerX = w / 2;
  const halfGap = CONFIG.BLOCK_NEUTRAL_GAP / 2;
  blockY = h * CONFIG.BLOCK_Y_POSITION;
  leftBlockX = centerX - halfGap;
  rightBlockX = centerX + halfGap;
  leftBlockTargetX = leftBlockX;
  rightBlockTargetX = rightBlockX;

  // Start game loop
  startLoop();

  // Show start screen
  showStartScreen();

  oasiz.onPause(() => {
    if (gameState === "PLAYING") pauseGame();
    stopLoop();
  });

  oasiz.onResume(() => {
    startLoop();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  });

  console.log("[init] Game initialized");
}

init();
