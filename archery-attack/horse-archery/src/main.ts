/**
 * ARCHERY ATTACK — Mongolian Horse Archer (2D Side-Scroll)
 *
 * Ride across the steppe. Targets scroll in from the right.
 * Hold space to draw the bow, release to fire at 45 degrees.
 * Time your release at the peak/trough of the sine wave for max steadiness.
 * Hold too long and the bow wobbles!
 */

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Arrow {
  worldX: number;   // position along path
  height: number;   // above ground
  vx: number;
  vy: number;
  active: boolean;
  perfect: boolean;
}

interface WorldTarget {
  worldX: number;     // position along the path (horse rides past)
  postHeight: number;
  radius: number;
  hit: boolean;
}

interface Horse {
  screenX: number;
  screenY: number;
  baseY: number;
  legPhase: number;
  bobPhase: number;
}

interface World {
  cameraX: number;  // lateral position (horse rides along X)
  speed: number;
  width: number;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
  opacity: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

// ============= CONFIG =============
const CONFIG = {
  BOB_AMPLITUDE: 55,
  BOB_FREQUENCY: 0.003,
  MAX_SPREAD_ANGLE: 0.3,   // ~17° max deviation at worst stability
  PERFECT_THRESHOLD: 0.82,

  HORSE_SPEED: 0.22,

  WORLD_WIDTH: 1500,
  TARGETS_PER_LAP: 5,

  DRAW_DURATION_MS: 1000,
  WOBBLE_START_MS: 300,
  WOBBLE_RATE: 0.0015,
  MAX_WOBBLE: 0.45,
  MIN_DRAW_TO_FIRE: 0.15,

  ARROW_SPEED: 0.5,
  ARROW_GRAVITY: 0.0004,

  TARGET_RADIUS: 40,
  TARGET_HIT_RADIUS: 45,

  NEAR: 80,
  HORIZON_RATIO: 0.28,

  ROUND_TIME_MS: 20000,
  PERFECT_MULTIPLIER: 2,

  GROUND_RATIO: 0.15,

  RING_COLORS: ["#FFD700", "#FF4444", "#4488FF", "#333333", "#EEEEEE"],
};

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const scoreDisplay = document.getElementById("scoreDisplay")!;
const currentScoreEl = document.getElementById("currentScore")!;
const finalScoreEl = document.getElementById("finalScore")!;
const fireBtn = document.getElementById("fireBtn")!;

let gameState: GameState = "START";
let w = window.innerWidth;
let h = window.innerHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

let score = 0;
let timeRemaining = CONFIG.ROUND_TIME_MS;
let settings: Settings = loadSettings();
let animationFrameId: number;
let lastTime = 0;

let groundY = 0;
let horizonY = 0;
let pxPerUnit = 1; // pixels per world unit for 2D mapping

let horseBobVelocity = 0;

// Bow draw state
let isDrawing = false;
let drawStartTime = 0;
let drawProgress = 0;
let wobbleAmount = 0;
let drawElapsed = 0;

let world: World = {
  cameraX: 0,
  speed: CONFIG.HORSE_SPEED,
  width: CONFIG.WORLD_WIDTH,
};

let horse: Horse = {
  screenX: 0,
  screenY: 0,
  baseY: 0,
  legPhase: 0,
  bobPhase: 0,
};

let targets: WorldTarget[] = [];
let arrows: Arrow[] = [];
let particles: Particle[] = [];
let clouds: Cloud[] = [];
let scorePopups: ScorePopup[] = [];

// ============= CANVAS SETUP =============
function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  groundY = h * (1 - CONFIG.GROUND_RATIO);
  horizonY = h * CONFIG.HORIZON_RATIO;
  horse.screenX = w * 0.22;
  horse.baseY = groundY - 30; // adjusted for 3x horse scale
  horse.screenY = horse.baseY;
  // 2D world scale: 900 world units fill from horse to right edge
  pxPerUnit = (w - horse.screenX) / 900;
}

// ============= HAPTICS =============
function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= SETTINGS =============
function loadSettings(): Settings {
  const saved = localStorage.getItem("archeryAttack_settings");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("archeryAttack_settings", JSON.stringify(settings));
}

// ============= BOB STEADINESS =============
function getSteadiness(): number {
  const maxV = CONFIG.BOB_AMPLITUDE * CONFIG.BOB_FREQUENCY;
  return 1 - Math.abs(horseBobVelocity) / maxV;
}

// ============= TARGET GENERATION =============
function generateTargets(): void {
  targets = [];
  const spacing = world.width / (CONFIG.TARGETS_PER_LAP + 1);

  for (let i = 0; i < CONFIG.TARGETS_PER_LAP; i++) {
    const jitter = (Math.random() - 0.5) * spacing * 0.3;
    const worldX = spacing * (i + 1) + jitter;
    const postHeight = 150 + Math.random() * 250; // 150-400: low = easy quick shots, high = need arc peak

    targets.push({
      worldX,
      postHeight,
      radius: CONFIG.TARGET_RADIUS,
      hit: false,
    });
  }
}

// ============= TARGET HELPERS =============
function getTargetLateralDx(t: WorldTarget): number {
  let dx = t.worldX - world.cameraX;
  if (dx < -world.width / 2) dx += world.width;
  if (dx > world.width / 2) dx -= world.width;
  return dx;
}

// ============= BOW DRAW & FIRE =============
function startDraw(): void {
  if (isDrawing) return;
  isDrawing = true;
  drawStartTime = performance.now();
  drawProgress = 0;
  wobbleAmount = 0;
  drawElapsed = 0;
  triggerHaptic("light");
}

function updateDraw(dt: number): void {
  if (!isDrawing) return;
  drawElapsed += dt;
  drawProgress = Math.min(drawElapsed / CONFIG.DRAW_DURATION_MS, 1);

  const overHoldTime = drawElapsed - CONFIG.DRAW_DURATION_MS - CONFIG.WOBBLE_START_MS;
  if (overHoldTime > 0) {
    wobbleAmount = Math.min(overHoldTime * CONFIG.WOBBLE_RATE, CONFIG.MAX_WOBBLE);
  } else {
    wobbleAmount = 0;
  }
}

function releaseDraw(): void {
  if (!isDrawing) return;
  isDrawing = false;

  if (drawProgress < CONFIG.MIN_DRAW_TO_FIRE) {
    drawProgress = 0;
    wobbleAmount = 0;
    return;
  }

  fireArrow();
  drawProgress = 0;
  wobbleAmount = 0;
}

function fireArrow(): void {
  const steadiness = getSteadiness();
  const isPerfect = steadiness >= CONFIG.PERFECT_THRESHOLD && wobbleAmount < 0.1;

  const speed = CONFIG.ARROW_SPEED * drawProgress;
  const baseAngle = Math.PI / 4; // 45 degrees

  // Stability spread: poor timing on horse bob = arrow deviates from 45°
  const stabilitySpread = (1 - steadiness) * CONFIG.MAX_SPREAD_ANGLE;
  const wobbleSpread = wobbleAmount * CONFIG.MAX_SPREAD_ANGLE * 0.8;
  const totalSpread = stabilitySpread + wobbleSpread;
  const angleDeviation = (Math.random() - 0.5) * 2 * totalSpread;

  const finalAngle = baseAngle + angleDeviation;

  // Launch relative to screen (compensate for horse/camera movement)
  const vx = world.speed + speed * Math.cos(finalAngle);
  const vy = speed * Math.sin(finalAngle);

  // Arrow starts from bow tip position (converted from screen to world coords)
  const bowTipOffsetX = 127;
  const bowTipOffsetY = 292;
  const startWorldX = world.cameraX + bowTipOffsetX / pxPerUnit;
  const startHeight = (groundY - horse.screenY + bowTipOffsetY) / pxPerUnit;

  arrows.push({
    worldX: startWorldX,
    height: startHeight,
    vx,
    vy,
    active: true,
    perfect: isPerfect,
  });

  triggerHaptic(isPerfect ? "success" : "medium");
}

// ============= PARTICLES =============
function spawnHitParticles(x: number, y: number): void {
  const colors = ["#FFD700", "#FF6644", "#FFAA22", "#FFFFFF"];
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.1 + Math.random() * 0.3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 4,
    });
  }
}

// ============= SCORE POPUPS =============
function spawnScorePopup(
  x: number,
  y: number,
  points: number,
  perfect: boolean,
): void {
  const text = perfect ? `${points} PERFECT!` : `+${points}`;
  const color = perfect ? "#FFD700" : "#FFFFFF";
  scorePopups.push({ x, y, text, color, life: 1, vy: -0.08 });
}

// ============= GAME STATE =============
function gameOver(): void {
  if (gameState !== "PLAYING") return;
  gameState = "GAME_OVER";

  isDrawing = false;
  drawProgress = 0;
  wobbleAmount = 0;

  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  triggerHaptic("error");

  finalScoreEl.textContent = score.toString();
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  gameState = "PLAYING";

  score = 0;
  timeRemaining = CONFIG.ROUND_TIME_MS;
  currentScoreEl.textContent = "0";

  arrows = [];
  particles = [];
  scorePopups = [];

  world.cameraX = 0;
  horse.bobPhase = 0;
  horse.screenY = horse.baseY;
  horseBobVelocity = 0;

  isDrawing = false;
  drawProgress = 0;
  wobbleAmount = 0;
  drawElapsed = 0;

  generateTargets();

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  scoreDisplay.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  fireBtn.classList.remove("hidden");

  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  gameState = "PAUSED";

  isDrawing = false;
  drawProgress = 0;
  wobbleAmount = 0;

  pauseScreen.classList.remove("hidden");
  fireBtn.classList.add("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  fireBtn.classList.remove("hidden");
  triggerHaptic("light");
}

function showStartScreen(): void {
  gameState = "START";
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
}

// ============= CLOUDS =============
function initClouds(): void {
  clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * w * 1.5 - w * 0.25,
      y: 30 + Math.random() * (horizonY * 0.8),
      speed: 0.008 + Math.random() * 0.015,
      scale: 0.6 + Math.random() * 0.8,
      opacity: 0.25 + Math.random() * 0.25,
    });
  }
}

function updateClouds(dt: number): void {
  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x > w + 150) {
      c.x = -150;
      c.y = 30 + Math.random() * (horizonY * 0.8);
    }
  }
}

function drawCloud(c: Cloud): void {
  ctx.globalAlpha = c.opacity;
  ctx.fillStyle = "#FFEEDD";
  const s = c.scale;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 50 * s, 25 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x - 30 * s, c.y + 5 * s, 35 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 30 * s, c.y + 5 * s, 35 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 10 * s, c.y - 12 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ============= WORLD UPDATE =============
function updateWorld(dt: number): void {
  world.cameraX += world.speed * dt;
  horse.legPhase += dt * 0.015;

  horse.bobPhase += CONFIG.BOB_FREQUENCY * dt;
  horse.screenY = horse.baseY - Math.sin(horse.bobPhase) * CONFIG.BOB_AMPLITUDE;

  horseBobVelocity = -Math.cos(horse.bobPhase) * CONFIG.BOB_AMPLITUDE * CONFIG.BOB_FREQUENCY;

  if (world.cameraX >= world.width) {
    world.cameraX -= world.width;
    generateTargets();
    arrows = [];
  }
}

// ============= DRAWING =============
function drawSky(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
  grad.addColorStop(0, "#2A1B3D");
  grad.addColorStop(0.3, "#A0522D");
  grad.addColorStop(0.6, "#D4883E");
  grad.addColorStop(0.85, "#E8A84C");
  grad.addColorStop(1, "#F0C060");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, horizonY + 5);

  // Sun at horizon center
  const sunX = w * 0.5;
  const sunY = horizonY * 0.85;
  const sunR = 40;

  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3);
  glow.addColorStop(0, "rgba(255, 240, 180, 0.6)");
  glow.addColorStop(0.4, "rgba(255, 200, 100, 0.2)");
  glow.addColorStop(1, "rgba(255, 180, 50, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  body.addColorStop(0, "#FFFDE0");
  body.addColorStop(0.7, "#FFE44D");
  body.addColorStop(1, "#FFB800");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(): void {
  ctx.fillStyle = "#5A3A2A";
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 5);

  const segments = 20;
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * w;
    const peakH = Math.sin(i * 1.3) * 25 + Math.sin(i * 2.7) * 15 + Math.sin(i * 0.5) * 20;
    ctx.lineTo(x, horizonY - peakH - 10);
  }

  ctx.lineTo(w, horizonY + 5);
  ctx.closePath();
  ctx.fill();
}

function drawGround(): void {
  // Base ground gradient
  const grad = ctx.createLinearGradient(0, horizonY, 0, h);
  grad.addColorStop(0, "#9A8350");
  grad.addColorStop(0.3, "#8B7340");
  grad.addColorStop(0.7, "#7A6330");
  grad.addColorStop(1, "#5A4820");
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Horizon line
  ctx.strokeStyle = "#9A8350";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.stroke();

  // Subtle depth lines
  for (let dz = 20; dz < 400; dz += 35) {
    const scale = CONFIG.NEAR / (CONFIG.NEAR + dz);
    const y = horizonY + (groundY - horizonY) * scale;
    ctx.strokeStyle = `rgba(100, 80, 40, ${0.08 * scale})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawWorldTargets(): void {
  for (const t of targets) {
    if (t.hit) continue;
    const dx = getTargetLateralDx(t);

    // Show targets from far ahead to past the archer (scroll fully across)
    if (dx < -200 || dx > 850) continue;

    const screenX = horse.screenX + dx * pxPerUnit;
    if (screenX < -60 || screenX > w + 60) continue;

    const baseScreenY = groundY;
    const faceScreenY = groundY - t.postHeight * pxPerUnit;

    // Post
    ctx.strokeStyle = "#5A3A1E";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(screenX, baseScreenY);
    ctx.lineTo(screenX, faceScreenY);
    ctx.stroke();

    // Post cap
    ctx.fillStyle = "#3D2810";
    ctx.fillRect(screenX - 5, faceScreenY - 3, 10, 6);

    // Target face (concentric rings)
    const rings = CONFIG.RING_COLORS;
    const visualR = t.radius * pxPerUnit;
    for (let i = 0; i < rings.length; i++) {
      const r = visualR * (1 - i / rings.length);
      if (r < 0.5) continue;
      ctx.fillStyle = rings[i];
      ctx.beginPath();
      ctx.arc(screenX, faceScreenY, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Target outline
    if (visualR > 1) {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenX, faceScreenY, visualR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawHorseAndArcher(): void {
  const hx = horse.screenX;
  const hy = horse.screenY;
  const phase = horse.legPhase;

  // 3x scale — draw everything in local coords centered on (0,0), then scale
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(3, 3);

  const horseColor = "#3D2810";
  const horseLightColor = "#5A3A1E";

  // Body (local coords, horse centered at 0,0)
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(0, -40, 50, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Underbelly highlight
  ctx.fillStyle = horseLightColor;
  ctx.beginPath();
  ctx.ellipse(0, -35, 42, 14, 0, 0.2, Math.PI - 0.2);
  ctx.fill();

  // Legs
  ctx.strokeStyle = horseColor;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  const legPositions = [
    { base: -30, offset: 0 },
    { base: -12, offset: Math.PI * 0.5 },
    { base: 12, offset: Math.PI },
    { base: 30, offset: Math.PI * 1.5 },
  ];

  for (const leg of legPositions) {
    const swing = Math.sin(phase + leg.offset) * 18;
    const lift = Math.max(0, -Math.sin(phase + leg.offset)) * 12;

    const kneeX = leg.base + swing * 0.3;
    const kneeY = -12;
    const hoofX = leg.base + swing;
    const hoofY = 8 - lift;

    ctx.beginPath();
    ctx.moveTo(leg.base, -22);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(hoofX, hoofY);
    ctx.stroke();

    ctx.fillStyle = "#1A0E05";
    ctx.beginPath();
    ctx.ellipse(hoofX, hoofY + 2, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Neck
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(40, -52);
  ctx.quadraticCurveTo(55, -70, 50, -82);
  ctx.quadraticCurveTo(42, -72, 38, -52);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(56, -84, 18, 10, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle
  ctx.fillStyle = horseLightColor;
  ctx.beginPath();
  ctx.ellipse(70, -80, 8, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(58, -88, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Ear
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(50, -92);
  ctx.lineTo(46, -104);
  ctx.lineTo(54, -94);
  ctx.closePath();
  ctx.fill();

  // Mane
  ctx.strokeStyle = "#1A0E05";
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const mx = 42 + i * 2;
    const my = -55 - i * 6;
    const windOffset = Math.sin(phase * 0.7 + i * 0.8) * 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx - 10 + windOffset, my - 5, mx - 15 + windOffset, my + 3);
    ctx.stroke();
  }

  // Tail
  ctx.strokeStyle = "#1A0E05";
  ctx.lineWidth = 4;
  const tailSwing = Math.sin(phase * 0.5) * 12;
  ctx.beginPath();
  ctx.moveTo(-48, -42);
  ctx.quadraticCurveTo(-70 + tailSwing, -35, -80 + tailSwing * 1.5, -20);
  ctx.stroke();

  // ---- RIDER ----
  const riderBaseX = 5;
  const riderBaseY = -58;

  // Legs on horse
  ctx.fillStyle = "#8B2500";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 12, riderBaseY + 10);
  ctx.lineTo(riderBaseX - 18, riderBaseY + 25);
  ctx.lineTo(riderBaseX - 8, riderBaseY + 25);
  ctx.lineTo(riderBaseX - 5, riderBaseY + 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 5, riderBaseY + 10);
  ctx.lineTo(riderBaseX + 12, riderBaseY + 25);
  ctx.lineTo(riderBaseX + 20, riderBaseY + 25);
  ctx.lineTo(riderBaseX + 10, riderBaseY + 10);
  ctx.closePath();
  ctx.fill();

  // Torso
  ctx.fillStyle = "#B22222";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 12, riderBaseY + 12);
  ctx.lineTo(riderBaseX - 10, riderBaseY - 20);
  ctx.lineTo(riderBaseX + 10, riderBaseY - 20);
  ctx.lineTo(riderBaseX + 12, riderBaseY + 12);
  ctx.closePath();
  ctx.fill();

  // Sash
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 11, riderBaseY + 2);
  ctx.lineTo(riderBaseX + 11, riderBaseY + 2);
  ctx.stroke();

  // Head
  ctx.fillStyle = "#D2A679";
  ctx.beginPath();
  ctx.arc(riderBaseX, riderBaseY - 28, 8, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = "#8B4513";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 10, riderBaseY - 30);
  ctx.lineTo(riderBaseX, riderBaseY - 48);
  ctx.lineTo(riderBaseX + 10, riderBaseY - 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#A0522D";
  ctx.beginPath();
  ctx.ellipse(riderBaseX, riderBaseY - 30, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- BOW (45-degree angle, always aiming top-right) ----
  const bowCenterX = riderBaseX + 16;
  const bowCenterY = riderBaseY - 18;

  // Wobble shake
  let shakeX = 0;
  let shakeY = 0;
  if (isDrawing && wobbleAmount > 0) {
    shakeX = (Math.random() - 0.5) * wobbleAmount * 12;
    shakeY = (Math.random() - 0.5) * wobbleAmount * 12;
  }

  const drawBowX = bowCenterX + shakeX;
  const drawBowY = bowCenterY + shakeY;

  // Bow arm (reaches up-right to hold bow)
  ctx.strokeStyle = "#D2A679";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 8, riderBaseY - 14);
  ctx.lineTo(drawBowX, drawBowY);
  ctx.stroke();

  // Bow arc — 45 degrees top-right
  const bowR = 22;
  const bowAngle = -Math.PI * 0.25; // 45 deg top-right
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(drawBowX, drawBowY, bowR, bowAngle - 0.9, bowAngle + 0.9, false);
  ctx.stroke();

  // Bow tip positions (the two ends of the arc)
  const topTipX = drawBowX + Math.cos(bowAngle - 0.9) * bowR;
  const topTipY = drawBowY + Math.sin(bowAngle - 0.9) * bowR;
  const botTipX = drawBowX + Math.cos(bowAngle + 0.9) * bowR;
  const botTipY = drawBowY + Math.sin(bowAngle + 0.9) * bowR;

  // String pullback — pulls opposite to aim (bottom-left)
  const maxPull = 18;
  const pullBack = isDrawing ? drawProgress * maxPull : 0;
  const pullDirX = -Math.cos(bowAngle); // opposite of aim direction
  const pullDirY = -Math.sin(bowAngle);
  const stringPullX = drawBowX + pullDirX * pullBack;
  const stringPullY = drawBowY + pullDirY * pullBack;

  // Bowstring
  ctx.strokeStyle = "#C4A058";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(topTipX, topTipY);
  if (isDrawing && drawProgress > 0.05) {
    ctx.lineTo(stringPullX, stringPullY);
  }
  ctx.lineTo(botTipX, botTipY);
  ctx.stroke();

  // Draw arm (reaches to string nock point)
  const drawArmEndX = isDrawing ? stringPullX : riderBaseX;
  const drawArmEndY = isDrawing ? stringPullY : riderBaseY - 8;

  ctx.strokeStyle = "#D2A679";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 5, riderBaseY - 14);
  ctx.lineTo(drawArmEndX, drawArmEndY);
  ctx.stroke();

  // Nocked arrow while drawing — points top-right at 45 degrees
  if (isDrawing && drawProgress > 0.05) {
    const nockX = stringPullX;
    const nockY = stringPullY;
    const arrowLen = 30;

    // Arrow points in aim direction (top-right, 45 deg)
    const aDirX = Math.cos(bowAngle);  // 0.707
    const aDirY = Math.sin(bowAngle);  // -0.707

    const tipX = nockX + aDirX * arrowLen;
    const tipY = nockY + aDirY * arrowLen;

    ctx.strokeStyle = "#5C3A1E";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(nockX, nockY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.moveTo(tipX + aDirX * 4, tipY + aDirY * 4);
    ctx.lineTo(tipX + aDirY * 4 - aDirX * 3, tipY - aDirX * 4 - aDirY * 3);
    ctx.lineTo(tipX - aDirY * 4 - aDirX * 3, tipY + aDirX * 4 - aDirY * 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawArrows(): void {
  for (const arrow of arrows) {
    if (!arrow.active) continue;

    let dx = arrow.worldX - world.cameraX;
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;

    const screenX = horse.screenX + dx * pxPerUnit;
    const screenY = groundY - arrow.height * pxPerUnit;

    if (screenX < -50 || screenX > w + 50) continue;
    if (screenY < -50 || screenY > h + 50) continue;

    // Arrow orientation follows velocity (screen Y inverted)
    const angle = Math.atan2(-arrow.vy, arrow.vx);
    const arrowLen = 22;

    const tipX = screenX + Math.cos(angle) * arrowLen * 0.6;
    const tipY = screenY + Math.sin(angle) * arrowLen * 0.6;
    const tailX = screenX - Math.cos(angle) * arrowLen * 0.4;
    const tailY = screenY - Math.sin(angle) * arrowLen * 0.4;

    // Shaft
    ctx.strokeStyle = "#5C3A1E";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    const hs = 6;
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(angle - 0.4) * hs, tipY - Math.sin(angle - 0.4) * hs);
    ctx.lineTo(tipX - Math.cos(angle + 0.4) * hs, tipY - Math.sin(angle + 0.4) * hs);
    ctx.closePath();
    ctx.fill();

    // Fletching
    const fSize = 5;
    ctx.fillStyle = "#CC3333";
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tailX + Math.cos(angle - 0.5) * fSize, tailY + Math.sin(angle - 0.5) * fSize);
    ctx.lineTo(tailX + Math.cos(angle) * fSize * 0.7, tailY + Math.sin(angle) * fSize * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tailX + Math.cos(angle + 0.5) * fSize, tailY + Math.sin(angle + 0.5) * fSize);
    ctx.lineTo(tailX + Math.cos(angle) * fSize * 0.7, tailY + Math.sin(angle) * fSize * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawParticles(): void {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawScorePopups(): void {
  for (const sp of scorePopups) {
    ctx.globalAlpha = sp.life;
    ctx.fillStyle = sp.color;
    ctx.font = "bold 22px 'Cinzel', serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(sp.text, sp.x, sp.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawBobIndicator(): void {
  const meterX = 35;
  const meterCenterY = h * 0.5;
  const meterH = CONFIG.BOB_AMPLITUDE * 2.2;
  const halfH = meterH / 2;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(meterX, meterCenterY - halfH);
  ctx.lineTo(meterX, meterCenterY + halfH);
  ctx.stroke();

  const zoneH = meterH * 0.15;
  ctx.fillStyle = "rgba(50, 220, 50, 0.15)";
  ctx.fillRect(meterX - 12, meterCenterY - halfH - 2, 24, zoneH);
  ctx.fillRect(meterX - 12, meterCenterY + halfH - zoneH + 2, 24, zoneH);

  ctx.strokeStyle = "rgba(50, 220, 50, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(meterX - 10, meterCenterY - halfH);
  ctx.lineTo(meterX + 10, meterCenterY - halfH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(meterX - 10, meterCenterY + halfH);
  ctx.lineTo(meterX + 10, meterCenterY + halfH);
  ctx.stroke();

  const bobNorm = Math.sin(horse.bobPhase);
  const dotY = meterCenterY - bobNorm * halfH;
  const steadiness = getSteadiness();

  let dotColor: string;
  if (steadiness >= CONFIG.PERFECT_THRESHOLD) {
    dotColor = "#44FF44";
  } else if (steadiness > 0.5) {
    dotColor = "#FFDD44";
  } else {
    dotColor = "#FF5544";
  }

  ctx.shadowColor = dotColor;
  ctx.shadowBlur = steadiness >= CONFIG.PERFECT_THRESHOLD ? 12 : 6;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(meterX, dotY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(meterX, dotY, 7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDrawMeter(): void {
  const meterX = w * 0.5;
  const meterY = h - 90;
  const meterW = 120;
  const meterH = 10;
  const barX = meterX - meterW / 2;
  const barY = meterY;

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.roundRect(barX - 2, barY - 2, meterW + 4, meterH + 4, 4);
  ctx.fill();

  let fillColor: string;
  if (wobbleAmount > 0.1) {
    fillColor = "#FF4444";
  } else if (drawProgress >= 0.95) {
    fillColor = "#FFDD44";
  } else {
    fillColor = "#44CC44";
  }

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY, meterW * drawProgress, meterH, 3);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = "bold 11px 'Cinzel', serif";
  ctx.textAlign = "center";
  const label =
    wobbleAmount > 0.1
      ? "WOBBLING!"
      : drawProgress >= 0.95
        ? "FULL DRAW"
        : "DRAWING...";
  ctx.fillText(label, meterX, barY - 6);
  ctx.textAlign = "left";
}

function drawHUD(): void {
  const secs = Math.ceil(timeRemaining / 1000);
  const timerText = secs.toString();
  const urgent = secs <= 5;

  ctx.textAlign = "center";
  ctx.font = `bold ${urgent ? 52 : 44}px 'Cinzel', serif`;
  ctx.fillStyle = urgent ? "#FF3333" : "rgba(255, 255, 255, 0.9)";
  ctx.shadowColor = urgent ? "rgba(255, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = urgent ? 20 : 10;
  ctx.fillText(timerText, w / 2, isMobile ? 130 : 70);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  drawBobIndicator();

  if (isDrawing) {
    drawDrawMeter();
  }
}

// ============= FIRE BUTTON DOM UPDATE =============
function updateFireButton(): void {
  if (gameState !== "PLAYING") return;

  fireBtn.classList.remove(
    "state-focusing",
    "state-steady",
    "state-flash",
    "state-drawing",
    "state-wobble",
  );

  if (isDrawing) {
    if (wobbleAmount > 0.1) {
      fireBtn.classList.add("state-wobble");
    } else {
      fireBtn.classList.add("state-drawing");
    }
    return;
  }

  const steadiness = getSteadiness();

  if (steadiness >= CONFIG.PERFECT_THRESHOLD) {
    fireBtn.classList.add("state-flash");
  } else if (steadiness > 0.5) {
    fireBtn.classList.add("state-steady");
  } else {
    fireBtn.classList.add("state-focusing");
  }
}

// ============= UPDATE =============
function update(dt: number): void {
  if (gameState !== "PLAYING") return;

  updateClouds(dt);
  updateWorld(dt);
  updateDraw(dt);
  updateFireButton();

  // Update arrows (2D physics)
  for (const arrow of arrows) {
    if (!arrow.active) continue;

    arrow.vy -= CONFIG.ARROW_GRAVITY * dt;
    arrow.worldX += arrow.vx * dt;
    arrow.height += arrow.vy * dt;

    // Hit ground
    if (arrow.height <= 0) {
      arrow.active = false;
      continue;
    }

    // Too far ahead or behind camera
    let arrowDx = arrow.worldX - world.cameraX;
    if (arrowDx > world.width / 2) arrowDx -= world.width;
    if (arrowDx < -world.width / 2) arrowDx += world.width;
    if (arrowDx > 1200 || arrowDx < -100) {
      arrow.active = false;
      continue;
    }

    // Target collision (2D: worldX + height)
    for (const t of targets) {
      if (t.hit) continue;

      let tdx = arrow.worldX - t.worldX;
      if (tdx > world.width / 2) tdx -= world.width;
      if (tdx < -world.width / 2) tdx += world.width;

      const dy = arrow.height - t.postHeight;
      const dist = Math.sqrt(tdx * tdx + dy * dy);

      if (dist < CONFIG.TARGET_HIT_RADIUS) {
        arrow.active = false;
        t.hit = true;

        const ringFrac = dist / t.radius;
        let points = 2;
        if (ringFrac < 0.2) points = 10;
        else if (ringFrac < 0.4) points = 8;
        else if (ringFrac < 0.6) points = 6;
        else if (ringFrac < 0.8) points = 4;

        if (arrow.perfect) points *= CONFIG.PERFECT_MULTIPLIER;

        score += points;
        currentScoreEl.textContent = score.toString();

        // Screen position for particles/popup
        const lateralX = getTargetLateralDx(t);
        const sx = horse.screenX + lateralX * pxPerUnit;
        const sy = groundY - t.postHeight * pxPerUnit;
        spawnHitParticles(sx, sy);
        spawnScorePopup(sx, sy - 30, points, arrow.perfect);

        triggerHaptic("success");
        break;
      }
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= 0.002 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Update score popups
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const sp = scorePopups[i];
    sp.y += sp.vy * dt;
    sp.life -= 0.0015 * dt;
    if (sp.life <= 0) scorePopups.splice(i, 1);
  }

  arrows = arrows.filter((a) => a.active);

  timeRemaining -= dt;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    gameOver();
  }
}

// ============= INPUT =============
function setupFireButton(): void {
  fireBtn.addEventListener("pointerdown", (e: Event) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
    startDraw();
  });

  fireBtn.addEventListener("pointerup", (e: Event) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
    releaseDraw();
  });

  fireBtn.addEventListener("pointerleave", (e: Event) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
    releaseDraw();
  });

  fireBtn.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setupInputHandlers(): void {
  setupFireButton();

  window.addEventListener("keydown", (e) => {
    if (gameState === "PLAYING") {
      if (e.key === "Escape") {
        pauseGame();
      }
      if (e.key === " " && !e.repeat) {
        startDraw();
        e.preventDefault();
      }
    } else if (gameState === "PAUSED" && e.key === "Escape") {
      resumeGame();
    } else if (gameState === "START" && (e.key === " " || e.key === "Enter")) {
      startGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (gameState === "PLAYING" && e.key === " ") {
      releaseDraw();
      e.preventDefault();
    }
  });

  document.getElementById("startButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("startSettingsBtn")?.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", () => {
    triggerHaptic("light");
    pauseGame();
  });

  document.getElementById("resumeButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    resumeGame();
  });

  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    pauseScreen.classList.add("hidden");
    startGame();
  });

  document.getElementById("pauseMenuButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  document.getElementById("restartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  document.getElementById("backToStartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  setupSettingsToggles();
}

function setupSettingsToggles(): void {
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    saveSettings();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    saveSettings();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    saveSettings();
    if (settings.haptics) triggerHaptic("light");
  });
}

// ============= GAME LOOP =============
function gameLoop(timestamp: number): void {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  update(dt);

  ctx.clearRect(0, 0, w, h);

  drawSky();
  drawMountains();
  for (const c of clouds) drawCloud(c);
  drawGround();
  drawWorldTargets();
  drawArrows();
  drawHorseAndArcher();

  drawParticles();
  drawScorePopups();

  if (gameState === "PLAYING") {
    drawHUD();
  }

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  ctx.fillText("build 17", w - 10, h - 10);
  ctx.textAlign = "left";

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupInputHandlers();
  initClouds();
  generateTargets();

  requestAnimationFrame(gameLoop);
  showStartScreen();
}

init();
