/**
 * RAGDOLL ARCHERS — Tower Defense Archery
 * Defend your tower from troll invaders with slingshot-aimed archery.
 */

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type PlayState = "WAVE_INTRO" | "WAVE_ACTIVE" | "WAVE_COMPLETE" | "UPGRADING";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface VPoint {
  x: number;
  y: number;
  ox: number;
  oy: number;
  pinned: boolean;
}

interface VConstraint {
  a: number;
  b: number;
  len: number;
  stiff: number;
  arm: boolean;
}

interface StuckArrow {
  ptIdx: number;
  offX: number;
  offY: number;
  angle: number;
}

interface Ragdoll {
  pts: VPoint[];
  cons: VConstraint[];
  alive: boolean;
  hp: number;
  maxHp: number;
  facing: number;
  bodyColor: string;
  headColor: string;
  walkCycle: number;
  stuckArrows: StuckArrow[];
  flashTimer: number;
  scale: number;
  isAiming: boolean;
  ragdollActive: boolean;
  ragdollTimer: number;
  baseX: number;
  groundLevel: number;
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  damage: number;
  team: number;
  stuck: boolean;
  life: number;
}

interface Enemy {
  ragdoll: Ragdoll;
  targetX: number;
  attackTimer: number;
  swingPhase: number;
  damage: number;
  state: "walking" | "attacking" | "dead";
  skullReward: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Upgrade {
  name: string;
  desc: string;
  apply: () => void;
}

// ============= CONSTANTS =============
const GRAVITY = 0.35;
const DAMPING = 0.99;
const ITERATIONS = 6;
const GROUND_BOUNCE = 0.3;

// Joint indices
const HEAD = 0;
const NECK = 1;
const L_SHOULDER = 2;
const R_SHOULDER = 3;
const L_ELBOW = 4;
const R_ELBOW = 5;
const L_HAND = 6;
const R_HAND = 7;
const HIP = 8;
const L_KNEE = 9;
const R_KNEE = 10;
const L_FOOT = 11;
const R_FOOT = 12;

const HEAD_RADIUS = 9;
const HIT_THRESHOLD = 7;
const ARROW_LEN = 30;
const MAX_ARROW_SPD = 18;
const MIN_ARROW_SPD = 6;
const ARROW_DMG_BASE = 25;
const HEADSHOT_MULT = 5.0;
const SHOOT_CD = 0.6;

const BODY_SEGS: [number, number][] = [
  [NECK, HIP],
  [NECK, L_SHOULDER],
  [NECK, R_SHOULDER],
  [L_SHOULDER, L_ELBOW],
  [R_SHOULDER, R_ELBOW],
  [L_ELBOW, L_HAND],
  [R_ELBOW, R_HAND],
  [HIP, L_KNEE],
  [HIP, R_KNEE],
  [L_KNEE, L_FOOT],
  [R_KNEE, R_FOOT],
];

// Tower defense constants
const TOWER_W = 80;
const TOWER_H_RATIO = 0.28;
const TROLL_SCALE = 1.4;
const TROLL_ATK_CD = 2.0;
const TROLL_SWING_DUR = 0.6;
const PULL_CLICK_RADIUS = 82;
const QUIVER_BASE_CAPACITY = 5;
const RELOAD_TIME = 1.2;

// ============= DOM & GLOBALS =============
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

let gameState: GameState = "START";
let playState: PlayState = "WAVE_INTRO";
let w = window.innerWidth;
let h = window.innerHeight;
let groundY = 0;
let dpr = 1;
let gameScale = 1;

let settings: Settings = loadSettings();
let animFrameId = 0;
let lastTime = 0;

// Player state
let player: Ragdoll;
let aiming = false;
let aimAngle = 0;
let aimPower = 0;
let shootCD = 0;
let playerDmg = ARROW_DMG_BASE;
let playerMaxHp = 100;
let playerSpdMult = 1;
let playerCritChance = 0;
let playerArrowCount = 1;
let playerDeathTimer = 0;
let quiverMax = QUIVER_BASE_CAPACITY;
let quiverCount = QUIVER_BASE_CAPACITY;
let reloading = false;
let reloadTimer = 0;
let reloadSpeedMult = 1;
let headshotHeal = 0;

// Tower state
let towerX = 0;
let towerTopY = 0;
let towerHp = 500;
let towerMaxHp = 500;
let towerFlash = 0;

// Mouse
let mx = 0;
let my = 0;
let mdown = false;

// Collections
let enemies: Enemy[] = [];
let arrows: Arrow[] = [];
let particles: Particle[] = [];
let floats: FloatText[] = [];

// Game progress
let score = 0;
let wave = 0;

// Wave state
let waveIntroTimer = 0;
let waveCompleteTimer = 0;

// Effects
let shake = 0;
let hitStopFrames = 0;

// Upgrades
let upgradeOpts: Upgrade[] = [];
let upgradeHover = -1;
let upgradeCardRects: { x: number; y: number; w: number; h: number }[] = [];

// Audio
let audioCtx: AudioContext | null = null;

// ============= CANVAS & SETTINGS =============
function resize(): void {
  dpr = window.devicePixelRatio || 1;
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gameScale = Math.min(w, h) / 900;

  groundY = Math.floor(h * 0.78);
  towerX = Math.floor(w * 0.12);
  towerTopY = groundY - Math.floor(h * TOWER_H_RATIO);
}

function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

function loadSettings(): Settings {
  const s = localStorage.getItem("ragdollArchers_settings");
  if (s) {
    try {
      return JSON.parse(s);
    } catch {}
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("ragdollArchers_settings", JSON.stringify(settings));
}

// ============= AUDIO =============
function playSound(
  type: "shoot" | "hit" | "headshot" | "die" | "wave" | "upgrade" | "tower_hit",
): void {
  if (!settings.fx) return;
  if (!audioCtx) audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t = audioCtx.currentTime;
  switch (type) {
    case "shoot":
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    case "hit":
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
      break;
    case "headshot":
      osc.type = "square";
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
      break;
    case "die":
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
      break;
    case "wave":
      osc.type = "sine";
      osc.frequency.setValueAtTime(262, t);
      osc.frequency.setValueAtTime(330, t + 0.1);
      osc.frequency.setValueAtTime(392, t + 0.2);
      osc.frequency.setValueAtTime(523, t + 0.3);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
      break;
    case "upgrade":
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      break;
    case "tower_hit":
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      break;
  }
}

// ============= MATH =============
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function ptSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax,
    dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return dist(px, py, ax + t * dx, ay + t * dy);
}

// ============= VERLET PHYSICS =============
function makePoint(x: number, y: number): VPoint {
  return { x, y, ox: x, oy: y, pinned: false };
}

function verletIntegrate(pts: VPoint[]): void {
  for (const p of pts) {
    if (p.pinned) continue;
    const vx = (p.x - p.ox) * DAMPING;
    const vy = (p.y - p.oy) * DAMPING;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy + GRAVITY;
  }
}

function solveConstraints(pts: VPoint[], cons: VConstraint[], gndY: number, skipArms: boolean = false): void {
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const c of cons) {
      if (skipArms && c.arm) continue;
      const pa = pts[c.a],
        pb = pts[c.b];
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const diff = ((c.len - d) / d) * 0.5 * c.stiff;
      const ox = dx * diff;
      const oy = dy * diff;
      if (!pa.pinned) {
        pa.x -= ox;
        pa.y -= oy;
      }
      if (!pb.pinned) {
        pb.x += ox;
        pb.y += oy;
      }
    }
    // Ground collision
    for (const p of pts) {
      if (p.y > gndY) {
        p.y = gndY;
        const vy = p.y - p.oy;
        p.oy = p.y + vy * GROUND_BOUNCE;
        // Friction
        p.ox = lerp(p.ox, p.x, 0.15);
      }
    }
  }
}

// ============= RAGDOLL =============
function createRagdoll(
  x: number,
  gy: number,
  facing: number,
  hp: number,
  headColor: string,
  scale: number = 1,
  bodyColor: string = "#e8e8e8",
): Ragdoll {
  const f = facing;
  const s = scale;
  const positions: [number, number][] = [
    [x, gy - 80 * s], // HEAD
    [x, gy - 68 * s], // NECK
    [x - 10 * f * s, gy - 65 * s], // L_SHOULDER (back)
    [x + 10 * f * s, gy - 65 * s], // R_SHOULDER (front)
    [x - 15 * f * s, gy - 48 * s], // L_ELBOW
    [x + 15 * f * s, gy - 48 * s], // R_ELBOW
    [x - 18 * f * s, gy - 32 * s], // L_HAND (draw)
    [x + 22 * f * s, gy - 32 * s], // R_HAND (bow)
    [x, gy - 40 * s], // HIP
    [x - 7 * s, gy - 20 * s], // L_KNEE
    [x + 7 * s, gy - 20 * s], // R_KNEE
    [x - 8 * s, gy], // L_FOOT
    [x + 8 * s, gy], // R_FOOT
  ];

  const pts = positions.map(([px, py]) => makePoint(px, py));

  const conDefs: [number, number, number][] = [
    [HEAD, NECK, 1],
    [NECK, L_SHOULDER, 1],
    [NECK, R_SHOULDER, 1],
    [L_SHOULDER, L_ELBOW, 0.8],
    [R_SHOULDER, R_ELBOW, 0.8],
    [L_ELBOW, L_HAND, 0.8],
    [R_ELBOW, R_HAND, 0.8],
    [NECK, HIP, 1],
    [HIP, L_KNEE, 0.9],
    [HIP, R_KNEE, 0.9],
    [L_KNEE, L_FOOT, 0.9],
    [R_KNEE, R_FOOT, 0.9],
    // Structural
    [HEAD, HIP, 0.4],
    [L_SHOULDER, R_SHOULDER, 0.5],
    [L_FOOT, R_FOOT, 0.3],
    [L_SHOULDER, HIP, 0.3],
    [R_SHOULDER, HIP, 0.3],
    [L_KNEE, R_KNEE, 0.2],
  ];

  const ARM_JOINTS = new Set([L_ELBOW, R_ELBOW, L_HAND, R_HAND]);
  const cons = conDefs.map(([a, b, stiff]) => ({
    a,
    b,
    len: dist(pts[a].x, pts[a].y, pts[b].x, pts[b].y),
    stiff,
    arm: ARM_JOINTS.has(a) || ARM_JOINTS.has(b),
  }));

  return {
    pts,
    cons,
    alive: true,
    hp,
    maxHp: hp,
    facing,
    bodyColor,
    headColor,
    walkCycle: 0,
    stuckArrows: [],
    flashTimer: 0,
    scale,
    isAiming: false,
    ragdollActive: false,
    ragdollTimer: 0,
    baseX: x,
    groundLevel: gy,
  };
}

function setStandingPose(r: Ragdoll): void {
  const p = r.pts;
  const s = r.scale;
  const f = r.facing;
  const x = r.baseX;
  const gy = r.groundLevel;

  p[HEAD].x = x;                     p[HEAD].y = gy - 80 * s;
  p[NECK].x = x;                     p[NECK].y = gy - 68 * s;
  p[L_SHOULDER].x = x - 10 * f * s;  p[L_SHOULDER].y = gy - 65 * s;
  p[R_SHOULDER].x = x + 10 * f * s;  p[R_SHOULDER].y = gy - 65 * s;
  p[L_ELBOW].x = x - 15 * f * s;    p[L_ELBOW].y = gy - 48 * s;
  p[R_ELBOW].x = x + 15 * f * s;    p[R_ELBOW].y = gy - 48 * s;
  p[L_HAND].x = x - 18 * f * s;     p[L_HAND].y = gy - 32 * s;
  p[R_HAND].x = x + 22 * f * s;     p[R_HAND].y = gy - 32 * s;
  p[HIP].x = x;                      p[HIP].y = gy - 40 * s;
  p[L_KNEE].x = x - 7 * s;          p[L_KNEE].y = gy - 20 * s;
  p[R_KNEE].x = x + 7 * s;          p[R_KNEE].y = gy - 20 * s;
  p[L_FOOT].x = x - 8 * s;          p[L_FOOT].y = gy;
  p[R_FOOT].x = x + 8 * s;          p[R_FOOT].y = gy;

  // Walking leg animation
  const wa = Math.sin(r.walkCycle);
  if (Math.abs(wa) > 0.01) {
    const legSwing = wa * 12 * s;
    p[L_FOOT].x += legSwing;
    p[R_FOOT].x -= legSwing;
    p[L_KNEE].x += legSwing * 0.6;
    p[R_KNEE].x -= legSwing * 0.6;
    const bob = Math.abs(wa) * 2 * s;
    p[HIP].y -= bob;
    p[NECK].y -= bob;
    p[HEAD].y -= bob;
    p[L_SHOULDER].y -= bob;
    p[R_SHOULDER].y -= bob;
  }

  // Zero all velocities
  for (const pt of p) {
    pt.ox = pt.x;
    pt.oy = pt.y;
  }
}

function applyMuscles(r: Ragdoll): void {
  if (!r.alive) return;
  const p = r.pts;
  const s = r.scale;
  const gy = r.groundLevel;

  const lOnGnd = p[L_FOOT].y >= gy - 2;
  const rOnGnd = p[R_FOOT].y >= gy - 2;
  const onGround = lOnGnd || rOnGnd;

  const nudge = (idx: number, tx: number, ty: number, str: number) => {
    const dx = (tx - p[idx].x) * str;
    const dy = (ty - p[idx].y) * str;
    p[idx].x += dx;
    p[idx].y += dy;
    p[idx].ox += dx;
    p[idx].oy += dy;
  };

  // Foot anchoring
  if (lOnGnd) p[L_FOOT].ox = lerp(p[L_FOOT].ox, p[L_FOOT].x, 0.5);
  if (rOnGnd) p[R_FOOT].ox = lerp(p[R_FOOT].ox, p[R_FOOT].x, 0.5);

  // Center hip over feet
  if (onGround) {
    const feetCX = (p[L_FOOT].x + p[R_FOOT].x) / 2;
    const hipVx = Math.abs(p[HIP].x - p[HIP].ox);
    const centerStr = hipVx < 0.8 ? 0.12 : 0.02;
    nudge(HIP, feetCX, p[HIP].y, centerStr);
  }

  // Keep body upright
  if (onGround) {
    nudge(HIP, p[HIP].x, gy - 40 * s, 0.15);
    nudge(L_KNEE, p[L_KNEE].x, gy - 20 * s, 0.06);
    nudge(R_KNEE, p[R_KNEE].x, gy - 20 * s, 0.06);
  }

  // Upper body upright relative to hip
  nudge(NECK, p[HIP].x, p[HIP].y - 28 * s, 0.1);
  nudge(HEAD, p[HIP].x, p[HIP].y - 40 * s, 0.1);

  // Shoulders level at neck height
  const shY = p[NECK].y + 3 * s;
  nudge(L_SHOULDER, p[NECK].x - 10 * r.facing * s, shY, 0.05);
  nudge(R_SHOULDER, p[NECK].x + 10 * r.facing * s, shY, 0.05);
}

function walkRagdoll(r: Ragdoll, speed: number): void {
  if (!r.alive) return;
  const p = r.pts;
  const upperIdxs = [HIP, NECK, HEAD, L_SHOULDER, R_SHOULDER];
  for (const idx of upperIdxs) {
    p[idx].x += speed;
    p[idx].ox += speed * 0.92;
  }
  r.walkCycle += 0.12;
}

function aimRagdollArms(
  r: Ragdoll,
  angle: number,
  power: number,
  isAiming: boolean,
): void {
  if (!r.alive) return;
  const p = r.pts;
  const s = r.scale;

  if (!isAiming) {
    // Arms hang at rest
    const restBowX = p[R_SHOULDER].x + r.facing * 5 * s;
    const restBowY = p[R_SHOULDER].y + 15 * s;
    p[R_HAND].x += (restBowX - p[R_HAND].x) * 0.05;
    p[R_HAND].y += (restBowY - p[R_HAND].y) * 0.05;
    const restDrawX = p[L_SHOULDER].x - r.facing * 5 * s;
    const restDrawY = p[L_SHOULDER].y + 15 * s;
    p[L_HAND].x += (restDrawX - p[L_HAND].x) * 0.05;
    p[L_HAND].y += (restDrawY - p[L_HAND].y) * 0.05;
    return;
  }

  const sx = p[R_SHOULDER].x;
  const sy = p[R_SHOULDER].y;

  // Bow hand extends toward aim
  const bowDist = 28 * s;
  const bowX = sx + Math.cos(angle) * bowDist;
  const bowY = sy + Math.sin(angle) * bowDist;
  p[R_HAND].x = bowX;
  p[R_HAND].y = bowY;
  p[R_HAND].ox = bowX;
  p[R_HAND].oy = bowY;

  // Bow elbow
  const elbowRX = (sx + bowX) / 2;
  const elbowRY = (sy + bowY) / 2 - 5 * s;
  p[R_ELBOW].x = elbowRX;
  p[R_ELBOW].y = elbowRY;
  p[R_ELBOW].ox = elbowRX;
  p[R_ELBOW].oy = elbowRY;

  // Draw hand pulls back
  const drawDist = 22 * power * s;
  const drawX = bowX - Math.cos(angle) * drawDist;
  const drawY = bowY - Math.sin(angle) * drawDist;
  p[L_HAND].x = drawX;
  p[L_HAND].y = drawY;
  p[L_HAND].ox = drawX;
  p[L_HAND].oy = drawY;

  // Draw elbow
  const elbowLX = (p[L_SHOULDER].x + drawX) / 2;
  const elbowLY = (p[L_SHOULDER].y + drawY) / 2;
  p[L_ELBOW].x = elbowLX;
  p[L_ELBOW].y = elbowLY;
  p[L_ELBOW].ox = elbowLX;
  p[L_ELBOW].oy = elbowLY;
}

// ============= TROLL ARM POSITIONING =============
function positionTrollAttackArm(r: Ragdoll, phase: number): void {
  const p = r.pts;
  const s = r.scale;
  const f = r.facing;
  const sx = p[R_SHOULDER].x;
  const sy = p[R_SHOULDER].y;

  let handX: number, handY: number;
  let elbowX: number, elbowY: number;

  if (phase < 0.3) {
    // Wind up: arm raises behind head
    const t = phase / 0.3;
    handX = sx + (-f) * 15 * s * t;
    handY = sy - 25 * s * t;
    elbowX = sx + (-f) * 8 * s * t;
    elbowY = sy - 12 * s * t;
  } else if (phase < 0.5) {
    // Swing forward/down (impact at 0.5)
    const t = (phase - 0.3) / 0.2;
    const windHandX = sx + (-f) * 15 * s;
    const windHandY = sy - 25 * s;
    const impactHandX = sx + f * 30 * s;
    const impactHandY = sy + 15 * s;
    handX = lerp(windHandX, impactHandX, t);
    handY = lerp(windHandY, impactHandY, t);
    elbowX = lerp(sx + (-f) * 8 * s, sx + f * 15 * s, t);
    elbowY = lerp(sy - 12 * s, sy + 5 * s, t);
  } else {
    // Recovery to rest
    const t = (phase - 0.5) / 0.5;
    const impactHandX = sx + f * 30 * s;
    const impactHandY = sy + 15 * s;
    const restHandX = sx + f * 5 * s;
    const restHandY = sy + 15 * s;
    handX = lerp(impactHandX, restHandX, t);
    handY = lerp(impactHandY, restHandY, t);
    elbowX = lerp(sx + f * 15 * s, sx + f * 5 * s, t);
    elbowY = lerp(sy + 5 * s, sy + 8 * s, t);
  }

  p[R_HAND].x = handX;
  p[R_HAND].y = handY;
  p[R_HAND].ox = handX;
  p[R_HAND].oy = handY;
  p[R_ELBOW].x = elbowX;
  p[R_ELBOW].y = elbowY;
  p[R_ELBOW].ox = elbowX;
  p[R_ELBOW].oy = elbowY;
}

// ============= ARROWS =============
function fireArrow(
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  team: number,
): void {
  arrows.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    damage,
    team,
    stuck: false,
    life: 400,
  });
}

function updateArrows(dt: number): void {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) {
      a.life -= dt * 60;
      if (a.life <= 0) arrows.splice(i, 1);
      continue;
    }

    a.x += a.vx;
    a.y += a.vy;
    a.vy += GRAVITY;
    a.angle = Math.atan2(a.vy, a.vx);
    a.life--;

    // Ground
    if (a.y >= groundY) {
      a.y = groundY;
      a.stuck = true;
      a.life = 120;
      continue;
    }

    // Off screen
    if (a.x < -100 || a.x > w + 100 || a.y < -200 || a.life <= 0) {
      arrows.splice(i, 1);
      continue;
    }

    // Collision with ragdolls (player arrows hit enemies only)
    if (a.team === 0) {
      const targets = enemies.map((e) => e.ragdoll);
      for (const r of targets) {
        if (!r.alive) continue;
        const hitResult = checkArrowHit(a, r);
        if (hitResult >= 0) {
          handleArrowHit(a, r, hitResult);
          break;
        }
      }
    }
  }
}

function checkArrowHit(a: Arrow, r: Ragdoll): number {
  const tipX = a.x + Math.cos(a.angle) * ARROW_LEN * 0.4;
  const tipY = a.y + Math.sin(a.angle) * ARROW_LEN * 0.4;

  // Check head (circle)
  const hp = r.pts[HEAD];
  const hd = dist(tipX, tipY, hp.x, hp.y);
  if (hd < HEAD_RADIUS * r.scale + 2) return -2; // headshot

  // Check body segments
  for (const [ia, ib] of BODY_SEGS) {
    const pa = r.pts[ia],
      pb = r.pts[ib];
    const d = ptSegDist(tipX, tipY, pa.x, pa.y, pb.x, pb.y);
    if (d < HIT_THRESHOLD * r.scale) return ia;
  }
  return -1;
}

function handleArrowHit(a: Arrow, r: Ragdoll, hitResult: number): void {
  r.ragdollActive = true;
  r.ragdollTimer = r === player ? 0.5 : 0.15;

  const headshot = hitResult === -2;
  const isCrit = Math.random() < playerCritChance && a.team === 0;
  let dmg = a.damage;
  if (headshot) dmg *= HEADSHOT_MULT;
  if (isCrit) dmg *= 1.5;
  dmg = Math.round(dmg);

  r.hp -= dmg;
  r.flashTimer = 0.1;

  let closest = headshot ? HEAD : hitResult;
  if (closest < 0) closest = HEAD;

  // Apply impact force (lighter on trolls so they keep charging)
  const force = r === player ? 4 : 2;
  const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
  r.pts[closest].ox -= (a.vx / spd) * force;
  r.pts[closest].oy -= (a.vy / spd) * force;

  // Stick arrow
  a.stuck = true;
  a.life = 300;
  r.stuckArrows.push({
    ptIdx: closest,
    offX: a.x - r.pts[closest].x,
    offY: a.y - r.pts[closest].y,
    angle: a.angle,
  });

  const idx = arrows.indexOf(a);
  if (idx >= 0) arrows.splice(idx, 1);

  // Effects
  spawnBlood(a.x, a.y, a.vx * 0.3, a.vy * 0.3);
  shake = Math.min(shake + (headshot ? 8 : 4), 15);

  const txtColor = headshot
    ? "#ffff00"
    : isCrit
      ? "#ff8800"
      : "#ff6666";
  addFloat(a.x, a.y - 15, `-${dmg}`, txtColor);

  if (headshot) {
    addFloat(a.x, a.y - 35, "HEADSHOT!", "#ffff00");
    playSound("headshot");
    if (headshotHeal > 0 && a.team === 0 && towerHp > 0) {
      towerHp = Math.min(towerHp + headshotHeal, towerMaxHp);
      addFloat(a.x, a.y - 55, `+${headshotHeal} HP`, "#44cc44");
    }
  } else {
    playSound("hit");
  }

  triggerHaptic(headshot ? "heavy" : "medium");

  // Death check
  if (r.hp <= 0) {
    r.hp = 0;
    r.alive = false;
    hitStopFrames = 4;
    shake = 15;
    playSound("die");
    triggerHaptic("heavy");

    // Big force on death
    for (const pt of r.pts) {
      pt.ox -= (a.vx / spd) * 2;
      pt.oy -= (a.vy / spd) * 2;
    }
  }
}

// ============= PARTICLES =============
function spawnBlood(x: number, y: number, dvx: number, dvy: number): void {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x,
      y,
      vx: dvx + (Math.random() - 0.5) * 4,
      vy: dvy + (Math.random() - 0.5) * 4 - 2,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color: Math.random() > 0.3 ? "#cc2222" : "#991111",
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnBrickParticles(x: number, y: number): void {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * TOWER_W,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: -Math.random() * 4 - 1,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color: Math.random() > 0.5 ? "#555566" : "#666677",
      size: 3 + Math.random() * 4,
    });
  }
}

function addFloat(
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  floats.push({ x, y, text, color, life: 1.2, maxLife: 1.2 });
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= dt;
    if (p.y > groundY) {
      p.y = groundY;
      p.vy *= -0.3;
      p.vx *= 0.8;
    }
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateFloats(dt: number): void {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.y -= 40 * dt;
    f.life -= dt;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

// ============= PLAYER =============
function updatePlayer(dt: number): void {
  if (!player.alive) {
    playerDeathTimer -= dt;
    if (playerDeathTimer <= 0) triggerGameOver();
    return;
  }

  shootCD = Math.max(0, shootCD - dt);

  if (reloading) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) {
      reloading = false;
      quiverCount = quiverMax;
    }
  }

  // Slingshot: power is computed from mouse distance in mousemove handler
  // No hold-to-charge logic needed

  // Keep player on tower during ragdoll stagger
  if (player.ragdollActive) {
    const hipX = player.pts[HIP].x;
    const minX = towerX - TOWER_W / 2;
    const maxX = towerX + TOWER_W / 2;
    if (hipX < minX) {
      for (const p of player.pts) p.x += (minX - hipX) * 0.1;
    }
    if (hipX > maxX) {
      for (const p of player.pts) p.x += (maxX - hipX) * 0.1;
    }
  }

  // Position arms when in rigid mode
  if (!player.ragdollActive) {
    aimRagdollArms(
      player,
      aimAngle,
      aimPower,
      aiming && playState === "WAVE_ACTIVE",
    );
  }
}

function playerFire(): void {
  if (!player.alive || shootCD > 0 || aimPower < 0.05 || reloading || quiverCount <= 0) return;

  const speed =
    (MIN_ARROW_SPD + aimPower * (MAX_ARROW_SPD - MIN_ARROW_SPD)) *
    playerSpdMult;
  const dmg = playerDmg * (0.5 + aimPower * 0.5);
  const bowHand = player.pts[R_HAND];

  if (playerArrowCount === 1) {
    fireArrow(bowHand.x, bowHand.y, aimAngle, speed, dmg, 0);
  } else {
    const spread = 0.12;
    for (let i = 0; i < playerArrowCount; i++) {
      const offset =
        (i - (playerArrowCount - 1) / 2) * spread;
      fireArrow(
        bowHand.x,
        bowHand.y,
        aimAngle + offset,
        speed,
        dmg * 0.8,
        0,
      );
    }
  }

  playSound("shoot");
  triggerHaptic("light");
  shootCD = SHOOT_CD;
  quiverCount--;
  if (quiverCount <= 0) {
    reloading = true;
    reloadTimer = RELOAD_TIME * reloadSpeedMult;
  }

  // Recoil on player
  const recoil = 1.5;
  player.pts[R_SHOULDER].ox += Math.cos(aimAngle) * recoil;
  player.pts[R_SHOULDER].oy += Math.sin(aimAngle) * recoil;
}

// ============= ENEMIES =============
function updateEnemies(dt: number): void {
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (!e.ragdoll.alive) {
      e.state = "dead";
      score += e.skullReward * 100;
      currentScoreEl.textContent = score.toString();
      continue;
    }

    // Skip if staggering from arrow hit
    if (e.ragdoll.ragdollActive) continue;

    // Check distance to target (tower)
    const distToTarget = e.ragdoll.baseX - e.targetX;

    if (distToTarget > 5) {
      // Walk toward tower
      e.state = "walking";
      e.ragdoll.baseX -= 1.2;
      e.ragdoll.walkCycle += 0.10;
      e.swingPhase = 0;
    } else {
      // At tower — attacking
      if (e.state !== "attacking") {
        e.state = "attacking";
        e.attackTimer = TROLL_ATK_CD * 0.5;
        e.swingPhase = 0;
        // Snap walk cycle to neutral
        e.ragdoll.walkCycle = Math.round(e.ragdoll.walkCycle / Math.PI) * Math.PI;
      }

      if (e.swingPhase > 0) {
        // Actively swinging
        e.swingPhase += dt / TROLL_SWING_DUR;
        positionTrollAttackArm(e.ragdoll, Math.min(e.swingPhase, 1));

        // Impact at phase 0.5
        if (e.swingPhase >= 0.5 && e.swingPhase - dt / TROLL_SWING_DUR < 0.5) {
          if (towerHp > 0) {
            towerHp -= e.damage;
            towerFlash = 0.15;
            shake = Math.min(shake + 6, 15);
            spawnBrickParticles(towerX, towerTopY + (groundY - towerTopY) * 0.3);
            addFloat(towerX, towerTopY - 10, `-${e.damage}`, "#ff6666");
            playSound("tower_hit");
            triggerHaptic("heavy");

            if (towerHp <= 0) {
              towerHp = 0;
              // Tower destroyed — player falls
              player.alive = false;
              player.groundLevel = groundY;
              player.ragdollActive = true;
              player.ragdollTimer = 999;
              playerDeathTimer = 2.0;
              for (const pt of player.pts) {
                pt.ox -= 4;
                pt.oy += 3;
              }
              shake = 15;
              playSound("die");
              triggerHaptic("error");
            }
          }
        }

        // Swing complete
        if (e.swingPhase >= 1) {
          e.swingPhase = 0;
          e.attackTimer = TROLL_ATK_CD;
        }
      } else {
        // Cooldown between swings
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && towerHp > 0) {
          e.swingPhase = 0.001; // Start swing
        }
      }
    }
  }
}

// ============= WAVES =============
function startNextWave(): void {
  wave++;
  playState = "WAVE_INTRO";
  waveIntroTimer = 1.5;
  playSound("wave");
}

function spawnWaveEnemies(): void {
  const baseHp = 30 + wave * 3;
  const baseDmg = 10 + wave * 3;
  const isBossWave = wave % 5 === 0;

  let count: number;
  if (isBossWave) {
    count = 3 + Math.floor(wave / 3);
  } else if (wave <= 2) {
    count = 4;
  } else {
    count = 4 + wave * 2;
  }

  let smallCount = 0;
  for (let i = 0; i < count; i++) {
    const spawnX = w + 60 + i * 80 + Math.random() * 40;
    const targetX = towerX + TOWER_W / 2 + 10 + i * 15;

    // Boss wave: all bosses. Normal wave: boss every 5-10 small trolls
    let makeBoss: boolean;
    if (isBossWave) {
      makeBoss = true;
    } else if (wave >= 3 && smallCount > 0 && smallCount % (5 + Math.floor(Math.random() * 6)) === 0) {
      makeBoss = true;
    } else {
      makeBoss = false;
    }

    if (!makeBoss) smallCount++;

    const hp = makeBoss ? baseHp * 4 : baseHp;
    const scale = (makeBoss ? 1.7 : TROLL_SCALE) * gameScale;
    const headColor = makeBoss ? "#2a4a2a" : "#3a5a3a";
    const bodyColor = makeBoss ? "#4a6a4a" : "#5a7a5a";

    const ragdoll = createRagdoll(
      spawnX,
      groundY,
      -1,
      hp,
      headColor,
      scale,
      bodyColor,
    );

    enemies.push({
      ragdoll,
      targetX,
      attackTimer: TROLL_ATK_CD,
      swingPhase: 0,
      damage: makeBoss ? baseDmg * 2 : baseDmg,
      state: "walking",
      skullReward: makeBoss ? 5 : 1,
    });
  }
}

function checkWaveComplete(): boolean {
  return enemies.length > 0 && enemies.every((e) => !e.ragdoll.alive);
}

// ============= UPGRADES =============
function generateUpgrades(): void {
  const pool: (() => Upgrade)[] = [
    () => ({
      name: "+100 TOWER HP",
      desc: "Increase tower max health by 100",
      apply() {
        towerMaxHp += 100;
        towerHp = Math.min(towerHp + 100, towerMaxHp);
      },
    }),
    () => ({
      name: "+30% DMG",
      desc: "Arrow damage increased by 30%",
      apply() {
        playerDmg *= 1.3;
      },
    }),
    () => ({
      name: "REPAIR",
      desc: "Fully restore tower health",
      apply() {
        towerHp = towerMaxHp;
      },
    }),
    () => ({
      name: "+SPEED",
      desc: "Arrows fly 25% faster",
      apply() {
        playerSpdMult *= 1.25;
      },
    }),
    () => ({
      name: "VAMPIRIC",
      desc: "Headshots heal tower for 15 HP",
      apply() {
        headshotHeal += 15;
      },
    }),
    () => ({
      name: "FAST RELOAD",
      desc: "Reload 30% faster",
      apply() {
        reloadSpeedMult *= 0.7;
      },
    }),
    () => ({
      name: "+1 ARROW",
      desc: "Add 1 arrow to your quiver",
      apply() {
        quiverMax++;
        quiverCount = quiverMax;
      },
    }),
  ];

  if (playerArrowCount < 3) {
    pool.push(() => ({
      name: "MULTI-SHOT",
      desc: `Fire ${playerArrowCount + 1} arrows at once`,
      apply() {
        playerArrowCount++;
      },
    }));
  }

  // Pick 3 random
  const shuffled = pool.sort(() => Math.random() - 0.5);
  upgradeOpts = shuffled.slice(0, 3).map((fn) => fn());
  upgradeHover = -1;
  upgradeCardRects = [];
}

function applyUpgrade(idx: number): void {
  if (idx < 0 || idx >= upgradeOpts.length) return;
  const up = upgradeOpts[idx];
  up.apply();
  playSound("upgrade");
  triggerHaptic("success");
  proceedAfterUpgrade();
}

function proceedAfterUpgrade(): void {
  enemies = [];
  arrows = arrows.filter((a) => a.team === 0 && a.stuck);
  startNextWave();
}

// ============= RENDERING =============
function drawBackground(): void {
  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, "#0a0a1a");
  skyGrad.addColorStop(0.5, "#1a1a3e");
  skyGrad.addColorStop(1, "#2a3a4e");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY);

  // Far hills
  ctx.fillStyle = "#151530";
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w; x += 50) {
    ctx.lineTo(
      x,
      groundY -
        25 -
        Math.sin(x * 0.008) * 18 -
        Math.sin(x * 0.023) * 12,
    );
  }
  ctx.lineTo(w, groundY);
  ctx.fill();

  // Near hills
  ctx.fillStyle = "#1a2520";
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w; x += 40) {
    ctx.lineTo(
      x,
      groundY -
        12 -
        Math.sin(x * 0.013 + 1) * 10 -
        Math.sin(x * 0.035 + 2) * 7,
    );
  }
  ctx.lineTo(w, groundY);
  ctx.fill();

  // Ground
  const gGrad = ctx.createLinearGradient(0, groundY, 0, h);
  gGrad.addColorStop(0, "#2d4a3a");
  gGrad.addColorStop(0.3, "#1d3a2a");
  gGrad.addColorStop(1, "#0d2a1a");
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Ground line
  ctx.strokeStyle = "#3d6a5a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  // Grass
  ctx.strokeStyle = "#3a6050";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 12) {
    const gh = 4 + Math.sin(x * 0.3) * 2;
    const lean = Math.sin(x * 0.7 + performance.now() * 0.001) * 2;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + lean, groundY - gh);
    ctx.stroke();
  }
}

function drawTower(): void {
  const tx = towerX - TOWER_W / 2;
  const ty = towerTopY;
  const tw = TOWER_W;
  const th = groundY - towerTopY;

  const flash = towerFlash > 0;
  const baseColor = flash ? "#aaaaaa" : "#555566";
  const darkColor = flash ? "#999999" : "#444455";
  const lightColor = flash ? "#bbbbbb" : "#666677";

  // Main body
  ctx.fillStyle = baseColor;
  ctx.fillRect(tx, ty, tw, th);

  // Brick texture
  const brickH = 10;
  const brickW = tw / 4;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1;
  let row = 0;
  for (let by = ty; by < groundY; by += brickH) {
    const offset = (row % 2) * (brickW / 2);
    for (let bx = tx + offset; bx < tx + tw; bx += brickW) {
      const bw = Math.min(brickW, tx + tw - bx);
      ctx.strokeRect(bx, by, bw, brickH);
    }
    row++;
  }

  // Crenellations
  const crenW = 14;
  const crenH = 8;
  const crenGap = 6;
  ctx.fillStyle = baseColor;
  for (let cx = tx; cx < tx + tw; cx += crenW + crenGap) {
    const cw = Math.min(crenW, tx + tw - cx);
    ctx.fillRect(cx, ty - crenH, cw, crenH);
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, ty - crenH, cw, crenH);
  }

  // Side edges for depth
  ctx.strokeStyle = lightColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx, ty - crenH);
  ctx.lineTo(tx, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + tw, ty - crenH);
  ctx.lineTo(tx + tw, groundY);
  ctx.stroke();
}

function drawTusks(r: Ragdoll): void {
  const headPt = r.pts[HEAD];
  const s = r.scale;
  ctx.strokeStyle = "#ddddaa";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  // Left tusk
  ctx.beginPath();
  ctx.moveTo(headPt.x - 4 * s, headPt.y + 4 * s);
  ctx.lineTo(headPt.x - 6 * s, headPt.y + 12 * s);
  ctx.stroke();
  // Right tusk
  ctx.beginPath();
  ctx.moveTo(headPt.x + 4 * s, headPt.y + 4 * s);
  ctx.lineTo(headPt.x + 6 * s, headPt.y + 12 * s);
  ctx.stroke();
}

function drawClub(r: Ragdoll): void {
  const hand = r.pts[R_HAND];
  const elbow = r.pts[R_ELBOW];
  const s = r.scale;

  // Direction from elbow to hand (club extends outward)
  let dx = hand.x - elbow.x;
  let dy = hand.y - elbow.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;

  const clubLen = 25 * s;
  const endX = hand.x + dx * clubLen;
  const endY = hand.y + dy * clubLen;

  // Shaft
  ctx.strokeStyle = "#8B6040";
  ctx.lineWidth = 4 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Club head (circle)
  ctx.fillStyle = "#6B4020";
  ctx.beginPath();
  ctx.arc(endX, endY, 7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a3518";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawRagdoll(r: Ragdoll, drawAimAngle: number | null, drawPower: number): void {
  const p = r.pts;
  const flash = r.flashTimer > 0;
  const bodyCol = r.alive ? (flash ? "#ffffff" : r.bodyColor) : "#888888";
  const headCol = r.alive ? (flash ? "#ffffff" : r.headColor) : "#666666";
  const isEnemy = r !== player;

  // Draw stuck arrows
  for (const sa of r.stuckArrows) {
    const pt = p[sa.ptIdx];
    const ax = pt.x + sa.offX;
    const ay = pt.y + sa.offY;
    drawArrowSprite(ax, ay, sa.angle, 0.5);
  }

  // Body segments
  ctx.strokeStyle = bodyCol;
  ctx.lineWidth = 3 * r.scale;
  ctx.lineCap = "round";
  for (const [a, b] of BODY_SEGS) {
    ctx.beginPath();
    ctx.moveTo(p[a].x, p[a].y);
    ctx.lineTo(p[b].x, p[b].y);
    ctx.stroke();
  }

  // Head
  ctx.fillStyle = headCol;
  ctx.beginPath();
  ctx.arc(p[HEAD].x, p[HEAD].y, HEAD_RADIUS * r.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = bodyCol;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Troll-specific: tusks and club
  if (isEnemy) {
    drawTusks(r);
    drawClub(r);
  } else if (r.alive) {
    // Player: draw bow
    drawBow(r, drawAimAngle, drawPower);
  }

  // Health bar (if damaged and alive)
  if (r.alive && r.hp < r.maxHp) {
    const barW = 40 * r.scale;
    const barH = 4;
    const bx = p[HEAD].x - barW / 2;
    const by = p[HEAD].y - (HEAD_RADIUS + 12) * r.scale;
    ctx.fillStyle = "#333";
    ctx.fillRect(bx, by, barW, barH);
    const ratio = r.hp / r.maxHp;
    ctx.fillStyle =
      ratio > 0.5 ? "#44cc44" : ratio > 0.25 ? "#cccc44" : "#cc4444";
    ctx.fillRect(bx, by, barW * ratio, barH);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
  }
}

function drawBow(r: Ragdoll, angle: number | null, power: number): void {
  const p = r.pts;
  const bowHand = p[R_HAND];
  const drawHand = p[L_HAND];

  if (angle === null) {
    // Resting bow
    const restAngle = r.facing > 0 ? 0 : Math.PI;
    const perpA = restAngle + Math.PI / 2;
    const bLen = 14 * r.scale;
    const tX = bowHand.x + Math.cos(perpA) * bLen;
    const tY = bowHand.y + Math.sin(perpA) * bLen;
    const bX = bowHand.x - Math.cos(perpA) * bLen;
    const bY = bowHand.y - Math.sin(perpA) * bLen;
    const mX = bowHand.x + r.facing * 5 * r.scale;
    const mY = bowHand.y;

    ctx.strokeStyle = "#8B6914";
    ctx.lineWidth = 3 * r.scale;
    ctx.beginPath();
    ctx.moveTo(tX, tY);
    ctx.quadraticCurveTo(mX, mY, bX, bY);
    ctx.stroke();

    // String
    ctx.strokeStyle = "rgba(200,200,200,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tX, tY);
    ctx.lineTo(bX, bY);
    ctx.stroke();
    return;
  }

  // Aiming bow
  const bLen = 20 * r.scale;
  const perpA = angle + Math.PI / 2;
  const tX = bowHand.x + Math.cos(perpA) * bLen;
  const tY = bowHand.y + Math.sin(perpA) * bLen;
  const bX = bowHand.x - Math.cos(perpA) * bLen;
  const bY = bowHand.y - Math.sin(perpA) * bLen;
  const bulge = 8 * r.scale;
  const mX = bowHand.x + Math.cos(angle) * bulge;
  const mY = bowHand.y + Math.sin(angle) * bulge;

  ctx.strokeStyle = "#8B6914";
  ctx.lineWidth = 3 * r.scale;
  ctx.beginPath();
  ctx.moveTo(tX, tY);
  ctx.quadraticCurveTo(mX, mY, bX, bY);
  ctx.stroke();

  // String to draw hand
  ctx.strokeStyle = "rgba(220,220,220,0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tX, tY);
  ctx.lineTo(drawHand.x, drawHand.y);
  ctx.lineTo(bX, bY);
  ctx.stroke();

  // Nocked arrow
  if (power > 0.05) {
    const tipX = drawHand.x + Math.cos(angle) * ARROW_LEN;
    const tipY = drawHand.y + Math.sin(angle) * ARROW_LEN;
    drawArrowSprite(
      (tipX + drawHand.x) / 2,
      (tipY + drawHand.y) / 2,
      angle,
      1,
    );
  }
}

function drawArrowSprite(
  x: number,
  y: number,
  angle: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shaft
  ctx.strokeStyle = "#8B7355";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ARROW_LEN / 2, 0);
  ctx.lineTo(ARROW_LEN / 2 - 5, 0);
  ctx.stroke();

  // Tip
  ctx.fillStyle = "#C0C0C0";
  ctx.beginPath();
  ctx.moveTo(ARROW_LEN / 2, 0);
  ctx.lineTo(ARROW_LEN / 2 - 7, -3);
  ctx.lineTo(ARROW_LEN / 2 - 7, 3);
  ctx.closePath();
  ctx.fill();

  // Fletching
  ctx.fillStyle = "rgba(200, 50, 50, 0.7)";
  ctx.beginPath();
  ctx.moveTo(-ARROW_LEN / 2, 0);
  ctx.lineTo(-ARROW_LEN / 2 + 8, -3);
  ctx.lineTo(-ARROW_LEN / 2 + 8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-ARROW_LEN / 2, 0);
  ctx.lineTo(-ARROW_LEN / 2 + 8, 3);
  ctx.lineTo(-ARROW_LEN / 2 + 8, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawFlyingArrows(): void {
  for (const a of arrows) {
    if (a.stuck && a.y >= groundY - 1) {
      drawArrowSprite(a.x, a.y, a.angle, 0.4);
      continue;
    }
    if (a.stuck) continue;

    // Trail
    ctx.strokeStyle = "rgba(255, 200, 100, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x - a.vx * 3, a.y - a.vy * 3);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();

    drawArrowSprite(a.x, a.y, a.angle, 1);
  }
}

function drawQuiver(): void {
  if (!player || !player.alive) return;

  const qx = towerX - 25;
  const qy = towerTopY - 2;
  const arrowH = 20;
  const spacing = 7;

  for (let i = 0; i < quiverMax; i++) {
    const ax = qx - i * spacing;
    const filled = i < quiverCount;

    if (filled) {
      // Arrow shaft (vertical)
      ctx.strokeStyle = "#8B7355";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, qy);
      ctx.lineTo(ax, qy - arrowH + 5);
      ctx.stroke();
      // Tip
      ctx.fillStyle = "#C0C0C0";
      ctx.beginPath();
      ctx.moveTo(ax, qy - arrowH);
      ctx.lineTo(ax - 2.5, qy - arrowH + 6);
      ctx.lineTo(ax + 2.5, qy - arrowH + 6);
      ctx.closePath();
      ctx.fill();
      // Fletching
      ctx.fillStyle = "rgba(200, 50, 50, 0.7)";
      ctx.beginPath();
      ctx.moveTo(ax, qy);
      ctx.lineTo(ax - 2.5, qy - 5);
      ctx.lineTo(ax, qy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax, qy);
      ctx.lineTo(ax + 2.5, qy - 5);
      ctx.lineTo(ax, qy - 5);
      ctx.closePath();
      ctx.fill();
    } else {
      // Empty slot outline
      ctx.strokeStyle = "rgba(139, 115, 85, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, qy);
      ctx.lineTo(ax, qy - arrowH);
      ctx.stroke();
    }
  }

  // Reload indicator
  if (reloading) {
    const cx = qx - ((quiverMax - 1) * spacing) / 2;
    const cy = qy - arrowH - 14;
    const radius = 8;
    const progress = 1 - reloadTimer / (RELOAD_TIME * reloadSpeedMult);

    // Background circle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc
    ctx.strokeStyle = "#88ccff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
}

function drawPullIndicator(): void {
  if (!player || !player.alive || playState !== "WAVE_ACTIVE") return;

  if (!aiming) {
    // Idle: pulsing circle showing click zone
    const bowHand = player.pts[R_HAND];
    const f = player.facing;
    const pullZoneX = bowHand.x - f * 20;
    const pullZoneY = bowHand.y;
    const t = performance.now() * 0.003;
    const pulse = 1 + Math.sin(t) * 0.08;
    const alpha = 0.25 + Math.sin(t) * 0.1;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#88ccff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pullZoneX, pullZoneY, PULL_CLICK_RADIUS * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // Aiming: red arrow from shoulder toward mouse, tip at mouse (capped at max pull)
  const sx = player.pts[R_SHOULDER].x;
  const sy = player.pts[R_SHOULDER].y;
  const dx = mx - sx;
  const dy = my - sy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 5) return;

  const nx = dx / d;
  const ny = dy / d;
  const maxDist = 130; // matches slingshot max pull
  const clampedDist = Math.min(d, maxDist);
  const tipX = sx + nx * clampedDist;
  const tipY = sy + ny * clampedDist;

  const alpha = 0.4 + aimPower * 0.6;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#ff3333";
  ctx.fillStyle = "#ff3333";
  ctx.lineWidth = 2 + aimPower * 1.5;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Arrowhead at shoulder pointing in fire direction
  const headLen = 8 + aimPower * 6;
  const headAngle = Math.atan2(-ny, -nx);
  const ha1 = headAngle + Math.PI * 0.78;
  const ha2 = headAngle - Math.PI * 0.78;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + Math.cos(ha1) * headLen, sy + Math.sin(ha1) * headLen);
  ctx.lineTo(sx + Math.cos(ha2) * headLen, sy + Math.sin(ha2) * headLen);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloats(): void {
  ctx.textAlign = "center";
  for (const f of floats) {
    const alpha = f.life / f.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.round(16 * gameScale)}px 'Inter', sans-serif`;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawWaveIntro(): void {
  if (playState !== "WAVE_INTRO") return;
  const alpha = Math.min(1, waveIntroTimer / 0.5) * Math.min(1, (1.5 - waveIntroTimer + 0.5) / 0.5);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = "#dd7733";
  ctx.font = `bold ${Math.round(48 * gameScale)}px 'Cinzel', serif`;
  ctx.textAlign = "center";
  ctx.fillText(`WAVE ${wave}`, w / 2, h * 0.35);

  if (wave % 5 === 0) {
    ctx.fillStyle = "#ff44ff";
    ctx.font = `bold ${Math.round(24 * gameScale)}px 'Cinzel', serif`;
    ctx.fillText("BOSS!", w / 2, h * 0.35 + 45 * gameScale);
  }

  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawUpgradeShop(): void {
  if (playState !== "UPGRADING") return;

  // Darken
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#dd7733";
  ctx.font = `bold ${Math.round(36 * gameScale)}px 'Cinzel', serif`;
  ctx.textAlign = "center";
  ctx.fillText("CHOOSE UPGRADE", w / 2, h * 0.18);

  ctx.fillStyle = "#aa8866";
  ctx.font = `${Math.round(16 * gameScale)}px 'Inter', sans-serif`;
  ctx.fillText("Pick one", w / 2, h * 0.18 + 35 * gameScale);

  // Cards
  const cardW = Math.min(170 * gameScale, (w - 80) / 3);
  const cardH = 160 * gameScale;
  const gap = 20;
  const totalW =
    upgradeOpts.length * cardW + (upgradeOpts.length - 1) * gap;
  const startX = (w - totalW) / 2;
  const cardY = h * 0.32;

  upgradeCardRects = [];

  for (let i = 0; i < upgradeOpts.length; i++) {
    const cx = startX + i * (cardW + gap);
    const up = upgradeOpts[i];
    const hover = upgradeHover === i;

    upgradeCardRects.push({ x: cx, y: cardY, w: cardW, h: cardH });

    // Card BG
    ctx.fillStyle = hover
      ? "rgba(221, 119, 51, 0.25)"
      : "rgba(15, 25, 40, 0.92)";
    ctx.beginPath();
    ctx.roundRect(cx, cardY, cardW, cardH, 12);
    ctx.fill();

    ctx.strokeStyle = hover ? "#ffaa55" : "#dd7733";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Name
    ctx.fillStyle = "#dd7733";
    ctx.font = `bold ${Math.round(18 * gameScale)}px 'Cinzel', serif`;
    ctx.textAlign = "center";
    ctx.fillText(up.name, cx + cardW / 2, cardY + 50);

    // Description
    ctx.fillStyle = "#aa8866";
    ctx.font = `${Math.round(13 * gameScale)}px 'Inter', sans-serif`;
    wrapText(
      up.desc,
      cx + cardW / 2,
      cardY + 80,
      cardW - 24,
      17,
    );
  }

  // Skip hint
  ctx.fillStyle = "#666";
  ctx.font = `${Math.round(14 * gameScale)}px 'Inter', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(
    "SPACE to skip",
    w / 2,
    h * 0.32 + cardH + 50,
  );
  ctx.textAlign = "left";
}

function wrapText(
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(" ");
  let line = "";
  let ly = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      ctx.fillText(line.trim(), x, ly);
      line = word + " ";
      ly += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, ly);
}

function drawHUD(): void {
  // Tower HP bar
  if (player) {
    const barX = 20;
    const barY = 95;
    const barW = 140;
    const barH = 10;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const yOff = isMobile ? 75 : 0;

    ctx.fillStyle = "#222";
    ctx.fillRect(barX, barY + yOff, barW, barH);
    const ratio = towerHp / towerMaxHp;
    ctx.fillStyle =
      ratio > 0.5 ? "#44cc44" : ratio > 0.25 ? "#cccc44" : "#cc4444";
    ctx.fillRect(barX, barY + yOff, barW * ratio, barH);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY + yOff, barW, barH);

    ctx.fillStyle = "#aa8866";
    ctx.font = `${Math.round(11 * gameScale)}px 'Inter', sans-serif`;
    ctx.fillText(
      `TOWER HP ${Math.ceil(towerHp)}/${towerMaxHp}`,
      barX,
      barY + yOff + barH + 14,
    );

    ctx.fillText(`Wave ${wave}`, barX, barY + yOff + barH + 28);

    // Ammo counter
    const ammoText = reloading ? "RELOADING..." : `ARROWS: ${quiverCount}/${quiverMax}`;
    ctx.fillStyle = reloading ? "#88ccff" : "#aa8866";
    ctx.fillText(ammoText, barX, barY + yOff + barH + 42);
  }
}

// ============= MAIN RENDER =============
function render(): void {
  ctx.clearRect(0, 0, w, h);

  // Screen shake
  ctx.save();
  if (shake > 0.5) {
    const sx = (Math.random() - 0.5) * shake * 2;
    const sy = (Math.random() - 0.5) * shake * 2;
    ctx.translate(sx, sy);
  }

  drawBackground();

  // Tower
  drawTower();

  // Dead enemies (behind)
  for (const e of enemies) {
    if (!e.ragdoll.alive) {
      drawRagdoll(e.ragdoll, null, 0);
    }
  }

  // Alive enemies
  for (const e of enemies) {
    if (e.ragdoll.alive) {
      drawRagdoll(e.ragdoll, null, 0);
    }
  }

  // Player
  if (player) {
    if (aiming && player.alive && playState === "WAVE_ACTIVE") {
      drawRagdoll(player, aimAngle, aimPower);
    } else {
      drawRagdoll(player, null, 0);
    }
    drawPullIndicator();
    drawQuiver();
  }

  drawFlyingArrows();
  drawParticles();
  drawFloats();
  drawHUD();
  drawWaveIntro();
  drawUpgradeShop();

  ctx.restore();

  // Version
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  ctx.fillText("v4.0", w - 10, h - 10);
  ctx.textAlign = "left";
}

// ============= GAME UPDATE =============
function update(dt: number): void {
  // Hit stop
  if (hitStopFrames > 0) {
    hitStopFrames--;
    return;
  }

  // Shake decay
  shake *= 0.9;
  if (shake < 0.3) shake = 0;

  // Flash timers
  if (player) player.flashTimer = Math.max(0, player.flashTimer - dt);
  if (towerFlash > 0) towerFlash -= dt;
  for (const e of enemies) {
    e.ragdoll.flashTimer = Math.max(0, e.ragdoll.flashTimer - dt);
  }

  // Set aiming flags
  if (player) player.isAiming = aiming && player.alive && playState === "WAVE_ACTIVE" && !player.ragdollActive;
  for (const e of enemies) {
    e.ragdoll.isAiming = e.ragdoll.alive && e.state === "attacking" && e.swingPhase > 0 && !e.ragdoll.ragdollActive;
  }

  // Physics / pose for all ragdolls
  const allRagdolls = [player, ...enemies.map((e) => e.ragdoll)].filter(
    Boolean,
  );
  for (const r of allRagdolls) {
    if (r.ragdollActive) {
      // Full ragdoll physics
      verletIntegrate(r.pts);
      solveConstraints(r.pts, r.cons, r.groundLevel, r.isAiming);
      if (r.alive) {
        applyMuscles(r);
        r.ragdollTimer -= dt;
        if (r.ragdollTimer <= 0) {
          // Recovery: snap back to standing
          r.ragdollActive = false;
          if (r === player) {
            r.baseX = towerX;
          } else {
            r.baseX = clamp(r.pts[HIP].x, towerX + TOWER_W / 2, w + 200);
          }
          setStandingPose(r);
        }
      }
    } else if (r.alive) {
      // Rigid standing pose
      setStandingPose(r);
    }
  }

  // Arrows
  updateArrows(dt);

  // Particles & floats
  updateParticles(dt);
  updateFloats(dt);

  // Play state management
  switch (playState) {
    case "WAVE_INTRO":
      waveIntroTimer -= dt;
      if (waveIntroTimer <= 0) {
        playState = "WAVE_ACTIVE";
        spawnWaveEnemies();
      }
      break;

    case "WAVE_ACTIVE":
      updatePlayer(dt);
      updateEnemies(dt);

      if (player.alive && checkWaveComplete()) {
        playState = "WAVE_COMPLETE";
        waveCompleteTimer = 1.0;
        reloading = false;
        quiverCount = quiverMax;
      }
      break;

    case "WAVE_COMPLETE":
      updatePlayer(dt);
      waveCompleteTimer -= dt;
      if (waveCompleteTimer <= 0) {
        playState = "UPGRADING";
        generateUpgrades();
      }
      break;

    case "UPGRADING":
      updatePlayer(dt);
      break;
  }
}

// ============= INPUT =============
function setupInput(): void {
  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "PLAYING") return;

    if (playState === "UPGRADING") {
      for (let i = 0; i < upgradeCardRects.length; i++) {
        const r = upgradeCardRects[i];
        if (
          e.clientX >= r.x &&
          e.clientX <= r.x + r.w &&
          e.clientY >= r.y &&
          e.clientY <= r.y + r.h
        ) {
          applyUpgrade(i);
          return;
        }
      }
      return;
    }

    if (playState !== "WAVE_ACTIVE") return;
    if (!player.alive || shootCD > 0) return;

    // Slingshot: check if click is in pull zone (behind bow hand)
    const bowHand = player.pts[R_HAND];
    const pullZoneX = bowHand.x - player.facing * 20;
    const pullZoneY = bowHand.y;
    const clickDist = dist(e.clientX, e.clientY, pullZoneX, pullZoneY);
    if (clickDist > PULL_CLICK_RADIUS) return;
    if (reloading) return;

    mdown = true;
    mx = e.clientX;
    my = e.clientY;
    aiming = true;
    aimPower = 0;
    const sx = player.pts[R_SHOULDER].x;
    const sy = player.pts[R_SHOULDER].y;
    aimAngle = Math.atan2(sy - my, sx - mx);
  });

  canvas.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;

    if (gameState === "PLAYING" && playState === "UPGRADING") {
      upgradeHover = -1;
      for (let i = 0; i < upgradeCardRects.length; i++) {
        const r = upgradeCardRects[i];
        if (
          mx >= r.x &&
          mx <= r.x + r.w &&
          my >= r.y &&
          my <= r.y + r.h
        ) {
          upgradeHover = i;
          break;
        }
      }
    }

    if (aiming && player && player.alive) {
      const sx = player.pts[R_SHOULDER].x;
      const sy = player.pts[R_SHOULDER].y;
      aimAngle = Math.atan2(sy - my, sx - mx);
      const d = dist(mx, my, sx, sy);
      aimPower = clamp((d - 30) / 100, 0, 1);
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (aiming && mdown && player && player.alive) {
      playerFire();
    }
    mdown = false;
    aiming = false;
    aimPower = 0;
  });

  // Touch support
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (gameState !== "PLAYING") return;

      const touch = e.touches[0];

      if (playState === "UPGRADING") {
        for (let i = 0; i < upgradeCardRects.length; i++) {
          const r = upgradeCardRects[i];
          if (
            touch.clientX >= r.x &&
            touch.clientX <= r.x + r.w &&
            touch.clientY >= r.y &&
            touch.clientY <= r.y + r.h
          ) {
            applyUpgrade(i);
            return;
          }
        }
        return;
      }

      if (playState !== "WAVE_ACTIVE") return;
      if (!player.alive || shootCD > 0) return;

      // Slingshot: check pull zone
      const bowHand = player.pts[R_HAND];
      const pullZoneX = bowHand.x - player.facing * 20;
      const pullZoneY = bowHand.y;
      const touchDist = dist(touch.clientX, touch.clientY, pullZoneX, pullZoneY);
      if (touchDist > PULL_CLICK_RADIUS) return;
      if (reloading) return;

      mdown = true;
      mx = touch.clientX;
      my = touch.clientY;
      aiming = true;
      aimPower = 0;
      const sx = player.pts[R_SHOULDER].x;
      const sy = player.pts[R_SHOULDER].y;
      aimAngle = Math.atan2(sy - my, sx - mx);
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      mx = touch.clientX;
      my = touch.clientY;
      if (aiming && player && player.alive) {
        const sx = player.pts[R_SHOULDER].x;
        const sy = player.pts[R_SHOULDER].y;
        aimAngle = Math.atan2(sy - my, sx - mx);
        const d = dist(mx, my, sx, sy);
        aimPower = clamp((d - 30) / 100, 0, 1);
      }
    },
    { passive: false },
  );

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (aiming && mdown && player && player.alive) {
      playerFire();
    }
    mdown = false;
    aiming = false;
    aimPower = 0;
  });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (gameState === "PLAYING") {
      if (e.key === "Escape") {
        if (playState === "UPGRADING") return;
        pauseGame();
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (playState === "UPGRADING") {
          proceedAfterUpgrade();
        }
      }
    } else if (gameState === "PAUSED" && e.key === "Escape") {
      resumeGame();
    } else if (
      gameState === "START" &&
      (e.key === " " || e.key === "Enter")
    ) {
      startGame();
    }
  });

  // UI Buttons
  document
    .getElementById("startButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      startGame();
    });

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document
    .getElementById("startSettingsBtn")
    ?.addEventListener("click", () => {
      triggerHaptic("light");
      settingsModal.classList.remove("hidden");
    });

  document
    .getElementById("settingsClose")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      settingsModal.classList.add("hidden");
    });

  pauseBtn.addEventListener("click", () => {
    triggerHaptic("light");
    pauseGame();
  });

  document
    .getElementById("resumeButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      resumeGame();
    });

  document
    .getElementById("pauseRestartButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      pauseScreen.classList.add("hidden");
      startGame();
    });

  document
    .getElementById("pauseMenuButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      showStartScreen();
    });

  document
    .getElementById("restartButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      startGame();
    });

  document
    .getElementById("backToStartButton")!
    .addEventListener("click", () => {
      triggerHaptic("light");
      showStartScreen();
    });

  setupToggles();
}

function setupToggles(): void {
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

// ============= GAME STATE =============
function startGame(): void {
  gameState = "PLAYING";
  wave = 0;
  score = 0;
  playerDmg = ARROW_DMG_BASE;
  playerMaxHp = 100;
  playerSpdMult = 1;
  playerCritChance = 0;
  playerArrowCount = 1;
  playerDeathTimer = 0;
  towerHp = 500;
  towerMaxHp = 500;
  towerFlash = 0;

  currentScoreEl.textContent = score.toString();

  player = createRagdoll(
    towerX,
    towerTopY,
    1,
    playerMaxHp,
    "#4488ff",
    gameScale,
  );
  enemies = [];
  arrows = [];
  particles = [];
  floats = [];
  shake = 0;
  hitStopFrames = 0;
  aiming = false;
  mdown = false;
  shootCD = 0;
  quiverMax = QUIVER_BASE_CAPACITY;
  quiverCount = QUIVER_BASE_CAPACITY;
  reloading = false;
  reloadTimer = 0;
  reloadSpeedMult = 1;
  headshotHeal = 0;

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  scoreDisplay.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");

  triggerHaptic("light");
  startNextWave();
}

function triggerGameOver(): void {
  if (gameState !== "PLAYING") return;
  gameState = "GAME_OVER";

  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  triggerHaptic("error");
  finalScoreEl.textContent = score.toString();
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  lastTime = performance.now();
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
}

// ============= GAME LOOP =============
function gameLoop(timestamp: number): void {
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  dt = Math.min(dt, 0.05);

  if (gameState === "PLAYING") {
    const steps = Math.max(1, Math.round(dt / (1 / 60)));
    for (let i = 0; i < Math.min(steps, 3); i++) {
      update(1 / 60);
    }
  }

  if (gameState === "PLAYING" || gameState === "GAME_OVER") {
    render();
  } else if (gameState === "START" || gameState === "PAUSED") {
    ctx.clearRect(0, 0, w, h);
    drawBackground();
    drawTower();
    if (player) {
      drawRagdoll(player, null, 0);
    }
  }

  animFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  resize();
  window.addEventListener("resize", resize);
  setupInput();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
  showStartScreen();
}

init();
