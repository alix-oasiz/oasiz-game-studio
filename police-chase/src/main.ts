// Police Chase - Open world top-down car game
// Drive freely across infinite procedural biomes, make police cars crash!

import * as Tone from "tone";
import { oasiz } from "@oasiz/sdk";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Vec2 {
  x: number;
  y: number;
}

interface PlayerCar {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  vx: number;
  vy: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  driftAngle: number;
  vehicleId: string;
  waterExposureMs: number;
}

interface VehicleType {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  grip: number;
  cost: number;
  colors: {
    main: string;
    dark: string;
    accent: string;
  };
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
  bobPhase: number;
  collectTime: number;
}

interface CoinPopup {
  x: number;
  y: number;
  time: number;
}

type EnemyType = "patrol" | "interceptor" | "swat";

interface PoliceCar {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  id: number;
  lightPhase: number;
  state: "chase" | "crashed";
  enemyType: EnemyType;
  health: number;
  waterExposureMs: number;
}

interface Explosion {
  x: number;
  y: number;
  time: number;
  maxTime: number;
  particles: Particle[];
  debris: Debris[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
}

interface SkidMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  width: number; // Track width based on vehicle size
  length: number; // Track length based on vehicle size
  isTank: boolean; // Tank uses chunky tracks, others use solid lines
}

interface DriftSmoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface Rock {
  x: number;
  y: number;
  radius: number;
  color: string;
  rotation: number;
  variant: number;
}

interface Lake {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

interface Chunk {
  cx: number;
  cy: number;
  biome: BiomeType;
  rocks: Rock[];
  lakes: Lake[];
  roadSegments: RoadSegment[];
  decorations: Decoration[];
  landmarks: Landmark[];
  coins: Coin[];
  backdropCanvas?: HTMLCanvasElement;
}

interface Landmark {
  x: number;
  y: number;
  type:
    | "shrine"
    | "ruins"
    | "oasis"
    | "monument"
    | "campfire"
    | "racetrack"
    | "arena"
    | "crystals";
  size: number;
  rotation: number;
  discovered: boolean;
}

interface RoadSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

interface Decoration {
  x: number;
  y: number;
  type: string;
  size: number;
  color: string;
  rotation: number;
}

interface ScorePopup {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  text: string;
  time: number;
  color: string;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

type BiomeType = "desert" | "forest" | "snow" | "city" | "beach" | "volcanic";
type GamePhase = "start" | "playing" | "paused" | "gameOver";
type InputState = { up: boolean; down: boolean; left: boolean; right: boolean };

// ============================================================================
// CONSTANTS
// ============================================================================

// Chunk-based infinite world
const CHUNK_SIZE = 1200;
const RENDER_DISTANCE = 3; // Chunks to render in each direction
const BIOME_SCALE = 0.0004; // How quickly biomes change

// Player physics
const PLAYER_ACCELERATION = 0.35;
const PLAYER_BRAKE = 0.4;
const PLAYER_FRICTION = 0.01;
const PLAYER_MAX_SPEED = 22;
const PLAYER_TURN_SPEED = 0.08;
const PLAYER_GRIP = 0.14;
const PLAYER_DRAG = 0.993;

// Enemy settings
const POLICE_MAX_SPEED = 16;
const POLICE_ACCELERATION = 0.15;
const POLICE_SPAWN_INTERVAL_START = 2000;
const POLICE_SPAWN_INTERVAL_MIN = 600;
const POLICE_COLLISION_RADIUS = 38;
const MAX_POLICE = 15;

const INTERCEPTOR_UNLOCK_TIME = 20000;
const SWAT_UNLOCK_TIME = 40000;

const ENEMY_STATS: Record<
  EnemyType,
  {
    width: number;
    height: number;
    maxSpeed: number;
    accel: number;
    turnRate: number;
    health: number;
    points: number;
  }
> = {
  patrol: {
    width: 30,
    height: 52,
    maxSpeed: 16,
    accel: 0.15,
    turnRate: 0.05,
    health: 1,
    points: 100,
  },
  interceptor: {
    width: 26,
    height: 48,
    maxSpeed: 22,
    accel: 0.22,
    turnRate: 0.08,
    health: 1,
    points: 150,
  },
  swat: {
    width: 44,
    height: 72,
    maxSpeed: 12,
    accel: 0.1,
    turnRate: 0.03,
    health: 2,
    points: 250,
  },
};

// Explosion settings
const EXPLOSION_DURATION = 700;
const EXPLOSION_PARTICLE_COUNT = 30;

// Screen shake
const SHAKE_INTENSITY = 20;
const SHAKE_DECAY = 0.88;

// Combo
const COMBO_TIMEOUT = 2500;

// Water danger
const WATER_DROWN_TIME = 5000;
const WATER_RECOVERY_TIME = 5000;

// Performance tuning
const DEBUG_LOGS = false;
const MAX_SKID_MARKS = 900;
const SKID_MARK_FADE_RATE = 0.00035;
const SKID_MARK_EMIT_DISTANCE = 18;
const MAX_DRIFT_SMOKE = 120;
const MINIMAP_REFRESH_MS = 160;
const MINIMAP_MOVE_REFRESH_DISTANCE = 48;

// Biome color palettes
const BIOME_COLORS: Record<
  BiomeType,
  {
    ground1: string;
    ground2: string;
    ground3: string;
    road: string;
    roadLine: string;
    rock1: string;
    rock2: string;
    water: string;
    accent: string;
  }
> = {
  desert: {
    ground1: "#d4a574",
    ground2: "#c49464",
    ground3: "#e8c494",
    road: "#8b7355",
    roadLine: "#f0d0a0",
    rock1: "#8b7355",
    rock2: "#6b5335",
    water: "#4a90c0",
    accent: "#2d6a27",
  },
  forest: {
    ground1: "#4a7a44",
    ground2: "#3a6a34",
    ground3: "#5a8a54",
    road: "#6b5a4a",
    roadLine: "#a08060",
    rock1: "#5a5a5a",
    rock2: "#4a4a4a",
    water: "#3a80b0",
    accent: "#2d5a27",
  },
  snow: {
    ground1: "#e8e8f0",
    ground2: "#d0d0e0",
    ground3: "#f0f0ff",
    road: "#8090a0",
    roadLine: "#ffffff",
    rock1: "#7a8a9a",
    rock2: "#5a6a7a",
    water: "#6ab0d0",
    accent: "#3a6a7a",
  },
  city: {
    ground1: "#5a5a5a",
    ground2: "#4a4a4a",
    ground3: "#6a6a6a",
    road: "#3a3a3a",
    roadLine: "#ffffff",
    rock1: "#6a6a6a",
    rock2: "#5a5a5a",
    water: "#4a90c0",
    accent: "#888888",
  },
  beach: {
    ground1: "#e8d4a4",
    ground2: "#d8c494",
    ground3: "#f8e4b4",
    road: "#a09070",
    roadLine: "#f0e0c0",
    rock1: "#9a8a7a",
    rock2: "#7a6a5a",
    water: "#40a0c0",
    accent: "#3d7a37",
  },
  volcanic: {
    ground1: "#4a3a3a",
    ground2: "#3a2a2a",
    ground3: "#5a4a4a",
    road: "#5a4a4a",
    roadLine: "#ff6a00",
    rock1: "#2a2a2a",
    rock2: "#1a1a1a",
    water: "#ff4400",
    accent: "#ff6600",
  },
};

// Player/Police colors
const COLORS = {
  playerCar: "#c8c8c8",
  playerCarDark: "#909090",
  playerAccent: "#ffffff",
  playerWindshield: "#88ddff",
  policeCar: "#1a1a3a",
  policeWhite: "#ffffff",
  policeLight1: "#ff0044",
  policeLight2: "#0066ff",
  explosion: ["#ff6b35", "#ffcc00", "#ff4444", "#ff8800", "#ffffff"],
  skidMark: "#3a3a3a",
};

// Vehicle definitions — purely cosmetic skins
const VEHICLES: VehicleType[] = [
  {
    id: "sedan",
    name: "Street Sedan",
    description: "Clean silver finish. The classic getaway look.",
    width: 34,
    height: 58,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 0,
    colors: { main: "#c8c8c8", dark: "#909090", accent: "#ffffff" },
  },
  {
    id: "sports",
    name: "Viper X",
    description: "Racing red with gold trim. A head-turner.",
    width: 33,
    height: 56,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 100,
    colors: { main: "#ff2233", dark: "#990011", accent: "#ffdd00" },
  },
  {
    id: "muscle",
    name: "69 Charger",
    description: "Matte black with orange stripes. Old school cool.",
    width: 35,
    height: 60,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 200,
    colors: { main: "#1a1a2a", dark: "#0a0a12", accent: "#ff6600" },
  },
  {
    id: "buggy",
    name: "Dune Rat",
    description: "Lime green with exposed roll cage. Stands out anywhere.",
    width: 33,
    height: 54,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 150,
    colors: { main: "#44cc66", dark: "#228844", accent: "#ffff44" },
  },
  {
    id: "tank",
    name: "Iron Beast",
    description: "Military olive drab with steel plating. Looks tough.",
    width: 36,
    height: 60,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 350,
    colors: { main: "#556655", dark: "#334433", accent: "#aabbaa" },
  },
  {
    id: "hotrod",
    name: "Devil Rod",
    description: "Deep crimson with flame decals. All attitude.",
    width: 34,
    height: 58,
    maxSpeed: 22,
    acceleration: 0.35,
    turnSpeed: 0.08,
    grip: 0.14,
    cost: 500,
    colors: { main: "#880000", dark: "#550000", accent: "#ff4400" },
  },
];

// ============================================================================
// GAME STATE
// ============================================================================

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let gamePhase: GamePhase = "start";
let score = 0;
let displayScore = 0;
let gameTime = 0;
let lastTime = 0;
let policeIdCounter = 0;

let selectedVehicleId = "sedan"; // Default vehicle
let player: PlayerCar;
let policeCars: PoliceCar[] = [];
let explosions: Explosion[] = [];
let skidMarks: SkidMark[] = [];
let driftSmoke: DriftSmoke[] = [];
let scorePopups: ScorePopup[] = [];

// Chunk-based world
let chunks: Map<string, Chunk> = new Map();
let loadedChunks: Chunk[] = [];
let loadedRoadSegments: RoadSegment[] = [];
let loadedLakes: Lake[] = [];
let loadedRocks: Rock[] = [];
let loadedCoins: Coin[] = [];
let loadedChunkX = Number.NaN;
let loadedChunkY = Number.NaN;

let nextPoliceSpawn = 0;
let spawnInterval = POLICE_SPAWN_INTERVAL_START;
let difficultyMultiplier = 1;

let input: InputState = { up: false, down: false, left: false, right: false };

let screenShake = 0;
let freezeFrame = 0;

let combo = 0;
let lastCrashTime = 0;
let crashCount = 0;
let survivalScore = 0;

let camera = { x: 0, y: 0 };
let interceptorWarningShown = false;
let swatWarningShown = false;

let w = 0;
let h = 0;
let isMobile = false;

let settings: Settings = {
  music: true,
  fx: true,
  haptics: true,
};

let totalCoins = 0;
let sessionCoins = 0;
let coinPopups: CoinPopup[] = [];
let ownedVehicles: Set<string> = new Set(["sedan"]);
let shopIndex = 0;
let rafId = 0;
let skidMarkDistance = 0;
let coinSpriteCanvas: HTMLCanvasElement | null = null;
let minimapTerrainCanvas: HTMLCanvasElement | null = null;
let minimapTerrainCtx: CanvasRenderingContext2D | null = null;
let lastMinimapTerrainRender = -Infinity;
let lastMinimapCenterX = 0;
let lastMinimapCenterY = 0;

const COIN_COLLECT_RADIUS = 35;
const COIN_SIZE = 12;

// Background music
const MUSIC_URL = "https://assets.oasiz.ai/audio/car-song.mp3";
let bgMusic: HTMLAudioElement | null = null;

function debugLog(...args: unknown[]): void {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
}

function createCanvasElement(width: number, height: number): HTMLCanvasElement {
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  return buffer;
}

function trimArrayStartInPlace<T>(items: T[], maxLength: number): void {
  if (items.length <= maxLength) return;

  const overflow = items.length - maxLength;
  items.copyWithin(0, overflow);
  items.length = maxLength;
}

function compactArrayInPlace<T>(
  items: T[],
  shouldKeep: (item: T) => boolean,
): void {
  let writeIndex = 0;

  for (let readIndex = 0; readIndex < items.length; readIndex++) {
    const item = items[readIndex];
    if (!shouldKeep(item)) continue;
    items[writeIndex++] = item;
  }

  items.length = writeIndex;
}

function invalidateMinimapCache(): void {
  lastMinimapTerrainRender = -Infinity;
}

function initMusic(): void {
  if (bgMusic) return;

  bgMusic = new Audio(MUSIC_URL);
  bgMusic.loop = true;
  bgMusic.volume = 0.4;

  debugLog("[initMusic] Background music initialized");
}

function playMusic(): void {
  if (!bgMusic || !settings.music) return;

  bgMusic.play().catch((e) => {
    debugLog("[playMusic] Autoplay blocked, will play on interaction:", e);
  });
}

function pauseMusic(): void {
  if (!bgMusic) return;
  bgMusic.pause();
}

function setMusicVolume(volume: number): void {
  if (!bgMusic) return;
  bgMusic.volume = Math.max(0, Math.min(1, volume));
}

// Explosion sound using Tone.js - Multi-layered for intensity
let explosionInitialized = false;
let impactSynth: Tone.MembraneSynth | null = null;
let crackleNoise: Tone.NoiseSynth | null = null;
let rumbleSynth: Tone.Synth | null = null;

function initExplosionSound(): void {
  if (explosionInitialized) return;

  // Layer 1: Deep bass impact (like a bomb hit)
  const impactDistortion = new Tone.Distortion(0.4).toDestination();
  impactSynth = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 6,
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.001,
      decay: 0.5,
      sustain: 0,
      release: 0.4,
    },
  }).connect(impactDistortion);
  impactSynth.volume.value = 2;

  // Layer 2: Crackle/debris noise burst
  const noiseFilter = new Tone.Filter({
    type: "bandpass",
    frequency: 2000,
    Q: 0.5,
  }).toDestination();
  const noiseDistortion = new Tone.Distortion(0.3).connect(noiseFilter);
  crackleNoise = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: {
      attack: 0.002,
      decay: 0.15,
      sustain: 0.05,
      release: 0.3,
    },
  }).connect(noiseDistortion);
  crackleNoise.volume.value = -4;

  // Layer 3: Low rumble with pitch drop
  const rumbleFilter = new Tone.Filter({
    type: "lowpass",
    frequency: 200,
  }).toDestination();
  rumbleSynth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: {
      attack: 0.01,
      decay: 0.4,
      sustain: 0,
      release: 0.3,
    },
  }).connect(rumbleFilter);
  rumbleSynth.volume.value = -2;

  explosionInitialized = true;
  debugLog("[initExplosionSound] Multi-layer explosion synths initialized");
}

function playExplosionSound(): void {
  if (!settings.fx) return;

  const triggerExplosion = (): void => {
    if (!impactSynth || !crackleNoise || !rumbleSynth) return;

    const now = Tone.now();

    // Layer 1: Deep impact boom
    impactSynth.triggerAttackRelease("C1", "8n", now);

    // Layer 2: Debris crackle (slightly delayed)
    crackleNoise.triggerAttackRelease("16n", now + 0.01);

    // Layer 3: Rumble with pitch drop from G1 to C1
    rumbleSynth.triggerAttackRelease("G1", "4n", now);
    rumbleSynth.frequency.exponentialRampTo("C1", 0.3, now);

    debugLog("[playExplosionSound] BOOM!");
  };

  // Initialize on first play (needs user interaction)
  if (!explosionInitialized) {
    initExplosionSound();
  }

  // Start Tone.js context if needed
  if (Tone.getContext().state !== "running") {
    Tone.start().then(() => {
      triggerExplosion();
    });
  } else {
    triggerExplosion();
  }
}

// Joystick state for mobile
let joystick = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

// ============================================================================
// SEEDED RANDOM FOR PROCEDURAL GENERATION
// ============================================================================

function seededRandom(seed: number): () => number {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function hashCoords(x: number, y: number): number {
  const h = (x * 374761393 + y * 668265263) ^ (x * 1274126177);
  return Math.abs(h);
}

// ============================================================================
// BIOME DETERMINATION
// ============================================================================

function getBiomeAt(worldX: number, worldY: number): BiomeType {
  // Use layered noise for natural biome distribution
  const scale1 = BIOME_SCALE;
  const scale2 = BIOME_SCALE * 2.3;

  const n1 = Math.sin(worldX * scale1) * Math.cos(worldY * scale1 * 0.7);
  const n2 =
    Math.sin(worldX * scale2 + 100) * Math.cos(worldY * scale2 * 0.8 + 50);
  const combined = n1 * 0.6 + n2 * 0.4;

  // Map noise to biomes
  if (combined < -0.5) return "volcanic";
  if (combined < -0.2) return "forest";
  if (combined < 0.1) return "city";
  if (combined < 0.35) return "desert";
  if (combined < 0.6) return "beach";
  return "snow";
}

function getBiomeColors(
  worldX: number,
  worldY: number,
): (typeof BIOME_COLORS)["desert"] {
  return BIOME_COLORS[getBiomeAt(worldX, worldY)];
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function loadSettings(): void {
  try {
    const saved = localStorage.getItem("policeChase_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      settings = {
        music: !!parsed.music,
        fx: !!parsed.fx,
        haptics: !!parsed.haptics,
      };
    }
  } catch {
    /* use defaults */
  }
}

function saveSettings(): void {
  localStorage.setItem("policeChase_settings", JSON.stringify(settings));
}

function loadPersistentState(): void {
  const gs = oasiz.loadGameState();
  if (gs && typeof gs.coins === "number") {
    totalCoins = gs.coins;
  }
  if (gs && Array.isArray(gs.owned)) {
    ownedVehicles = new Set(gs.owned as string[]);
    if (!ownedVehicles.has("sedan")) ownedVehicles.add("sedan");
  }
  if (
    gs &&
    typeof gs.selectedVehicle === "string" &&
    ownedVehicles.has(gs.selectedVehicle as string)
  ) {
    selectedVehicleId = gs.selectedVehicle as string;
  }
  debugLog("[loadPersistentState] Coins:", totalCoins, "Owned:", [
    ...ownedVehicles,
  ]);
}

function savePersistentState(): void {
  oasiz.saveGameState({
    coins: totalCoins,
    owned: [...ownedVehicles],
    selectedVehicle: selectedVehicleId,
  });
}

function startLoop(): void {
  if (rafId !== 0) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
  if (rafId === 0) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function init(): void {
  debugLog("[init] Starting Police Chase - Infinite World");

  canvas = document.getElementById("game") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  isMobile = window.matchMedia("(pointer: coarse)").matches;

  loadSettings();
  loadPersistentState();

  oasiz.onPause(() => {
    if (bgMusic) bgMusic.pause();
    if (gamePhase === "playing") {
      pauseGame();
    }
    stopLoop();
  });

  oasiz.onResume(() => {
    startLoop();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (gamePhase === "playing") {
        pauseGame();
      }
      stopLoop();
      return;
    }
    startLoop();
  });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  chunks.clear();
  loadedChunks = [];
  loadedRoadSegments = [];
  loadedLakes = [];
  loadedRocks = [];
  loadedCoins = [];
  loadedChunkX = Number.NaN;
  loadedChunkY = Number.NaN;
  initPlayer();
  updateLoadedChunks(true);

  initMusic();

  setupInputHandlers();
  setupUIHandlers();

  updateStartScreenUI();

  startLoop();
}

function resizeCanvas(): void {
  const container = document.getElementById("game-container");
  if (container) {
    w = container.clientWidth;
    h = container.clientHeight;
  } else {
    w = window.innerWidth;
    h = window.innerHeight;
  }

  canvas.width = w;
  canvas.height = h;
  invalidateMinimapCache();
  debugLog("[resizeCanvas] Canvas:", w, "x", h);
}

// ============================================================================
// CHUNK GENERATION
// ============================================================================

function getChunkKey(cx: number, cy: number): string {
  return cx + "," + cy;
}

function getChunk(cx: number, cy: number): Chunk {
  const key = getChunkKey(cx, cy);
  if (chunks.has(key)) {
    return chunks.get(key)!;
  }

  // Generate new chunk
  const chunk = generateChunk(cx, cy);
  chunks.set(key, chunk);
  return chunk;
}

function generateChunk(cx: number, cy: number): Chunk {
  const seed = hashCoords(cx, cy);
  const rand = seededRandom(seed);

  const worldX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const worldY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
  const biome = getBiomeAt(worldX, worldY);
  const colors = BIOME_COLORS[biome];

  const rocks: Rock[] = [];
  const lakes: Lake[] = [];
  const roadSegments: RoadSegment[] = [];
  const decorations: Decoration[] = [];

  const chunkLeft = cx * CHUNK_SIZE;
  const chunkTop = cy * CHUNK_SIZE;

  // Generate roads based on chunk position
  // Horizontal road through chunks where cy % 3 === 0
  if (Math.abs(cy % 3) === 0) {
    roadSegments.push({
      x1: chunkLeft,
      y1: chunkTop + CHUNK_SIZE / 2,
      x2: chunkLeft + CHUNK_SIZE,
      y2: chunkTop + CHUNK_SIZE / 2,
      width: 100,
    });
  }

  // Vertical road through chunks where cx % 3 === 0
  if (Math.abs(cx % 3) === 0) {
    roadSegments.push({
      x1: chunkLeft + CHUNK_SIZE / 2,
      y1: chunkTop,
      x2: chunkLeft + CHUNK_SIZE / 2,
      y2: chunkTop + CHUNK_SIZE,
      width: 100,
    });
  }

  // Diagonal roads occasionally
  if ((cx + cy) % 7 === 0 && rand() > 0.5) {
    roadSegments.push({
      x1: chunkLeft,
      y1: chunkTop,
      x2: chunkLeft + CHUNK_SIZE,
      y2: chunkTop + CHUNK_SIZE,
      width: 70,
    });
  }

  // Generate lake (rare, ~10% of chunks)
  if (rand() < 0.1) {
    const lakeX = chunkLeft + 200 + rand() * (CHUNK_SIZE - 400);
    const lakeY = chunkTop + 200 + rand() * (CHUNK_SIZE - 400);

    // Don't place lake on roads
    let onRoad = false;
    for (const road of roadSegments) {
      const dist = pointToLineDistance(
        lakeX,
        lakeY,
        road.x1,
        road.y1,
        road.x2,
        road.y2,
      );
      if (dist < road.width / 2 + 150) onRoad = true;
    }

    if (!onRoad) {
      lakes.push({
        x: lakeX,
        y: lakeY,
        radiusX: 120 + rand() * 180,
        radiusY: 80 + rand() * 140,
        rotation: rand() * Math.PI,
      });
    }
  }

  // Generate rocks (1-3 per chunk)
  const numRocks = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < numRocks; i++) {
    const rx = chunkLeft + 50 + rand() * (CHUNK_SIZE - 100);
    const ry = chunkTop + 50 + rand() * (CHUNK_SIZE - 100);

    // Check not on road
    let onRoad = false;
    for (const road of roadSegments) {
      const dist = pointToLineDistance(
        rx,
        ry,
        road.x1,
        road.y1,
        road.x2,
        road.y2,
      );
      if (dist < road.width / 2 + 60) onRoad = true;
    }

    // Check not in lake
    for (const lake of lakes) {
      const dx = rx - lake.x;
      const dy = ry - lake.y;
      if (
        Math.sqrt(dx * dx + dy * dy) <
        Math.max(lake.radiusX, lake.radiusY) + 50
      ) {
        onRoad = true;
      }
    }

    if (!onRoad) {
      rocks.push({
        x: rx,
        y: ry,
        radius: 25 + rand() * 45,
        color: rand() > 0.5 ? colors.rock1 : colors.rock2,
        rotation: rand() * Math.PI * 2,
        variant: Math.floor(rand() * 3),
      });
    }
  }

  // Generate decorations (visual only, no collision) - denser
  const numDecorations = 15 + Math.floor(rand() * 20);
  for (let i = 0; i < numDecorations; i++) {
    const dx = chunkLeft + rand() * CHUNK_SIZE;
    const dy = chunkTop + rand() * CHUNK_SIZE;

    let decorType: string;
    let decorColor: string;
    let decorSize: number;

    if (biome === "forest") {
      const r = rand();
      if (r < 0.35) {
        decorType = "tree";
      } else if (r < 0.55) {
        decorType = "bush";
      } else if (r < 0.7) {
        decorType = "fallenlog";
      } else if (r < 0.82) {
        decorType = "mushroom";
      } else if (r < 0.92) {
        decorType = "flowers";
      } else {
        decorType = "tree";
      }
      decorColor = colors.accent;
      decorSize = 15 + rand() * 25;
    } else if (biome === "desert") {
      const r = rand();
      if (r < 0.3) {
        decorType = "cactus";
      } else if (r < 0.5) {
        decorType = "shrub";
      } else if (r < 0.65) {
        decorType = "skull";
      } else if (r < 0.8) {
        decorType = "tumbleweed";
      } else {
        decorType = "shrub";
      }
      decorColor = colors.accent;
      decorSize = 10 + rand() * 20;
    } else if (biome === "snow") {
      const r = rand();
      if (r < 0.35) {
        decorType = "pine";
      } else if (r < 0.55) {
        decorType = "snowdrift";
      } else if (r < 0.7) {
        decorType = "snowman";
      } else if (r < 0.85) {
        decorType = "icepatch";
      } else {
        decorType = "pine";
      }
      decorColor = rand() > 0.5 ? "#2a4a3a" : "#ffffff";
      decorSize = 12 + rand() * 22;
    } else if (biome === "beach") {
      const r = rand();
      if (r < 0.3) {
        decorType = "palm";
      } else if (r < 0.5) {
        decorType = "umbrella";
      } else if (r < 0.65) {
        decorType = "sandcastle";
      } else if (r < 0.8) {
        decorType = "surfboard";
      } else {
        decorType = "palm";
      }
      decorColor = rand() > 0.5 ? colors.accent : "#ff6666";
      decorSize = 15 + rand() * 20;
    } else if (biome === "volcanic") {
      const r = rand();
      if (r < 0.3) {
        decorType = "vent";
      } else if (r < 0.5) {
        decorType = "ashpile";
      } else if (r < 0.7) {
        decorType = "lavapool";
      } else if (r < 0.85) {
        decorType = "charredtree";
      } else {
        decorType = "vent";
      }
      decorColor = rand() > 0.5 ? "#ff4400" : "#2a2a2a";
      decorSize = 12 + rand() * 18;
    } else {
      const r = rand();
      if (r < 0.25) {
        decorType = "lamppost";
      } else if (r < 0.45) {
        decorType = "bench";
      } else if (r < 0.6) {
        decorType = "parkedcar";
      } else if (r < 0.75) {
        decorType = "dumpster";
      } else if (r < 0.88) {
        decorType = "hydrant";
      } else {
        decorType = "lamppost";
      }
      decorColor = "#666666";
      decorSize = 8 + rand() * 12;
    }

    decorations.push({
      x: dx,
      y: dy,
      type: decorType,
      size: decorSize,
      color: decorColor,
      rotation: rand() * Math.PI * 2,
    });
  }

  // Generate landmarks (~18% of chunks)
  const landmarks: Landmark[] = [];
  if (rand() < 0.18) {
    const lx = chunkLeft + CHUNK_SIZE / 2 + (rand() - 0.5) * 400;
    const ly = chunkTop + CHUNK_SIZE / 2 + (rand() - 0.5) * 400;

    // Check not on road or lake
    let blocked = false;
    for (const road of roadSegments) {
      if (
        pointToLineDistance(lx, ly, road.x1, road.y1, road.x2, road.y2) <
        road.width / 2 + 250
      ) {
        blocked = true;
      }
    }
    for (const lake of lakes) {
      const ldx = lx - lake.x;
      const ldy = ly - lake.y;
      if (
        Math.sqrt(ldx * ldx + ldy * ldy) <
        Math.max(lake.radiusX, lake.radiusY) + 200
      ) {
        blocked = true;
      }
    }

    if (!blocked) {
      // Pick landmark type based on biome
      let lmType: Landmark["type"];
      const r = rand();

      if (biome === "desert") {
        lmType =
          r < 0.3
            ? "ruins"
            : r < 0.6
              ? "oasis"
              : r < 0.8
                ? "shrine"
                : "monument";
      } else if (biome === "forest") {
        lmType =
          r < 0.4
            ? "shrine"
            : r < 0.7
              ? "campfire"
              : r < 0.9
                ? "ruins"
                : "crystals";
      } else if (biome === "snow") {
        lmType =
          r < 0.3
            ? "crystals"
            : r < 0.6
              ? "shrine"
              : r < 0.8
                ? "monument"
                : "ruins";
      } else if (biome === "volcanic") {
        lmType =
          r < 0.4
            ? "arena"
            : r < 0.7
              ? "ruins"
              : r < 0.9
                ? "crystals"
                : "monument";
      } else if (biome === "beach") {
        lmType =
          r < 0.4
            ? "oasis"
            : r < 0.7
              ? "shrine"
              : r < 0.9
                ? "racetrack"
                : "campfire";
      } else {
        // city
        lmType =
          r < 0.4
            ? "monument"
            : r < 0.7
              ? "arena"
              : r < 0.9
                ? "racetrack"
                : "shrine";
      }

      landmarks.push({
        x: lx,
        y: ly,
        type: lmType,
        size: 280 + rand() * 180,
        rotation: rand() * Math.PI * 2,
        discovered: false,
      });
    }
  }

  const coins: Coin[] = [];
  const numCoins = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < numCoins; i++) {
    const coinX = chunkLeft + 60 + rand() * (CHUNK_SIZE - 120);
    const coinY = chunkTop + 60 + rand() * (CHUNK_SIZE - 120);
    let blocked = false;
    for (const lake of lakes) {
      const ldx = coinX - lake.x;
      const ldy = coinY - lake.y;
      if (
        Math.sqrt(ldx * ldx + ldy * ldy) < Math.max(lake.radiusX, lake.radiusY)
      ) {
        blocked = true;
      }
    }
    for (const rock of rocks) {
      const rdx = coinX - rock.x;
      const rdy = coinY - rock.y;
      if (Math.sqrt(rdx * rdx + rdy * rdy) < rock.radius + 20) {
        blocked = true;
      }
    }
    if (!blocked) {
      coins.push({
        x: coinX,
        y: coinY,
        collected: false,
        bobPhase: rand() * Math.PI * 2,
        collectTime: 0,
      });
    }
  }

  return {
    cx,
    cy,
    biome,
    rocks,
    lakes,
    roadSegments,
    decorations,
    landmarks,
    coins,
  };
}

function rebuildLoadedWorldData(): void {
  loadedRoadSegments = [];
  loadedLakes = [];
  loadedRocks = [];
  loadedCoins = [];

  for (const chunk of loadedChunks) {
    loadedRoadSegments.push(...chunk.roadSegments);
    loadedLakes.push(...chunk.lakes);
    loadedRocks.push(...chunk.rocks);
    loadedCoins.push(...chunk.coins);
  }

  invalidateMinimapCache();
}

function prewarmForwardChunks(
  playerChunkX: number,
  playerChunkY: number,
): void {
  const dirX = Math.sign(player.vx);
  const dirY = Math.sign(player.vy);

  if (dirX !== 0) {
    const preloadX = playerChunkX + dirX * (RENDER_DISTANCE + 1);
    for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
      getChunk(preloadX, playerChunkY + dy);
    }
  }

  if (dirY !== 0) {
    const preloadY = playerChunkY + dirY * (RENDER_DISTANCE + 1);
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      getChunk(playerChunkX + dx, preloadY);
    }
  }
}

function updateLoadedChunks(force: boolean = false): void {
  const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
  const playerChunkY = Math.floor(player.y / CHUNK_SIZE);

  if (
    !force &&
    playerChunkX === loadedChunkX &&
    playerChunkY === loadedChunkY
  ) {
    return;
  }

  loadedChunkX = playerChunkX;
  loadedChunkY = playerChunkY;
  loadedChunks = [];

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
      const chunk = getChunk(playerChunkX + dx, playerChunkY + dy);
      loadedChunks.push(chunk);
    }
  }

  rebuildLoadedWorldData();
  prewarmForwardChunks(playerChunkX, playerChunkY);

  // Clean up old chunks (keep chunks within 2x render distance)
  const maxDist = RENDER_DISTANCE * 2;
  for (const [key, chunk] of chunks.entries()) {
    if (
      Math.abs(chunk.cx - playerChunkX) > maxDist ||
      Math.abs(chunk.cy - playerChunkY) > maxDist
    ) {
      chunks.delete(key);
    }
  }
}

function isOnRoad(x: number, y: number): boolean {
  for (const road of loadedRoadSegments) {
    const dist = pointToLineDistance(x, y, road.x1, road.y1, road.x2, road.y2);
    if (dist < road.width / 2) return true;
  }
  return false;
}

function isInLake(x: number, y: number): boolean {
  for (const lake of loadedLakes) {
    const dx = (x - lake.x) / lake.radiusX;
    const dy = (y - lake.y) / lake.radiusY;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

function sampleSurfaceAt(
  x: number,
  y: number,
): { onRoad: boolean; inWater: boolean } {
  let onRoad = false;
  let inWater = false;

  for (const road of loadedRoadSegments) {
    const dist = pointToLineDistance(x, y, road.x1, road.y1, road.x2, road.y2);
    if (dist < road.width / 2) {
      onRoad = true;
      break;
    }
  }

  for (const lake of loadedLakes) {
    const dx = (x - lake.x) / lake.radiusX;
    const dy = (y - lake.y) / lake.radiusY;
    if (dx * dx + dy * dy < 1) {
      inWater = true;
      break;
    }
  }

  return { onRoad, inWater };
}

function updateWaterExposure(
  exposureMs: number,
  inWater: boolean,
  dt: number,
): number {
  if (inWater) {
    return Math.min(WATER_DROWN_TIME, exposureMs + dt);
  }

  const recoveryAmount = dt * (WATER_DROWN_TIME / WATER_RECOVERY_TIME);
  return Math.max(0, exposureMs - recoveryAmount);
}

function pointToLineDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const nearestX = x1 + t * C;
  const nearestY = y1 + t * D;
  const dx = px - nearestX;
  const dy = py - nearestY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getSelectedVehicle(): VehicleType {
  return VEHICLES.find((v) => v.id === selectedVehicleId) || VEHICLES[0];
}

function initPlayer(): void {
  const vehicle = getSelectedVehicle();

  // Start at origin
  const startX = 0;
  const startY = 0;

  player = {
    x: startX,
    y: startY,
    width: vehicle.width,
    height: vehicle.height,
    angle: Math.PI, // Facing west toward city
    vx: 0,
    vy: 0,
    speed: 0,
    maxSpeed: vehicle.maxSpeed,
    acceleration: vehicle.acceleration,
    turnSpeed: vehicle.turnSpeed,
    driftAngle: 0,
    vehicleId: vehicle.id,
    waterExposureMs: 0,
  };

  camera.x = player.x;
  camera.y = player.y;

  debugLog("[initPlayer] Player at", player.x, player.y, "with", vehicle.name);
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function setupInputHandlers(): void {
  window.addEventListener("keydown", (e) => {
    if (gamePhase !== "playing") return;
    handleKeyDown(e.key);
  });

  window.addEventListener("keyup", (e) => {
    handleKeyUp(e.key);
  });

  // Mobile steering buttons
  const steerLeft = document.getElementById("steer-left");
  const steerRight = document.getElementById("steer-right");

  if (steerLeft) {
    steerLeft.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        if (gamePhase !== "playing") return;
        input.left = true;
        steerLeft.classList.add("active");
        triggerHaptic("light");
      },
      { passive: false },
    );

    steerLeft.addEventListener("touchend", () => {
      input.left = false;
      steerLeft.classList.remove("active");
    });

    steerLeft.addEventListener("touchcancel", () => {
      input.left = false;
      steerLeft.classList.remove("active");
    });
  }

  if (steerRight) {
    steerRight.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        if (gamePhase !== "playing") return;
        input.right = true;
        steerRight.classList.add("active");
        triggerHaptic("light");
      },
      { passive: false },
    );

    steerRight.addEventListener("touchend", () => {
      input.right = false;
      steerRight.classList.remove("active");
    });

    steerRight.addEventListener("touchcancel", () => {
      input.right = false;
      steerRight.classList.remove("active");
    });
  }
}

function handleKeyDown(key: string): void {
  if (key === "ArrowUp" || key === "w" || key === "W") input.up = true;
  if (key === "ArrowDown" || key === "s" || key === "S") input.down = true;
  if (key === "ArrowLeft" || key === "a" || key === "A") input.left = true;
  if (key === "ArrowRight" || key === "d" || key === "D") input.right = true;
}

function handleKeyUp(key: string): void {
  if (key === "ArrowUp" || key === "w" || key === "W") input.up = false;
  if (key === "ArrowDown" || key === "s" || key === "S") input.down = false;
  if (key === "ArrowLeft" || key === "a" || key === "A") input.left = false;
  if (key === "ArrowRight" || key === "d" || key === "D") input.right = false;
}

// Mobile uses simple left/right buttons - no joystick needed
function updateJoystickInput(): void {
  // Legacy - kept for compatibility but not used
  const dx = joystick.currentX - joystick.startX;
  const dy = joystick.currentY - joystick.startY;
  const deadzone = 20;

  input.left = dx < -deadzone;
  input.right = dx > deadzone;
  input.up = dy < -deadzone;
  input.down = dy > deadzone;
}

function drawChipVehicle(chip: Element, vehicleId: string): void {
  const chipCanvas = chip.querySelector("canvas") as HTMLCanvasElement;
  if (!chipCanvas) return;
  const chipCtx = chipCanvas.getContext("2d");
  if (!chipCtx) return;
  const vehicle = VEHICLES.find((v) => v.id === vehicleId);
  if (!vehicle) return;

  chipCtx.clearRect(0, 0, chipCanvas.width, chipCanvas.height);
  chipCtx.save();
  chipCtx.translate(chipCanvas.width / 2, chipCanvas.height / 2);
  const scale = 0.55;
  chipCtx.scale(scale, scale);
  drawVehicleShape(chipCtx, vehicle, vehicle.width, vehicle.height, false);
  chipCtx.restore();
}

function updateStartScreenUI(): void {
  document.getElementById("start-coin-count")!.textContent = String(totalCoins);

  const vehicleChips = document.querySelectorAll(".vehicle-chip");
  vehicleChips.forEach((chip) => {
    const vid = chip.getAttribute("data-vehicle");
    if (!vid) return;

    drawChipVehicle(chip, vid);

    const isOwned = ownedVehicles.has(vid);
    chip.classList.toggle("locked", !isOwned);
    chip.classList.toggle("selected", vid === selectedVehicleId);

    let lockIcon = chip.querySelector(".chip-lock");
    if (!isOwned) {
      if (!lockIcon) {
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("class", "chip-lock");
        svg.setAttribute("viewBox", "0 0 24 24");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute(
          "d",
          "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
        );
        svg.appendChild(path);
        chip.appendChild(svg);
      }
    } else if (lockIcon) {
      lockIcon.remove();
    }
  });
}

function updateSettingsToggles(): void {
  document
    .getElementById("toggle-music")!
    .classList.toggle("active", settings.music);
  document.getElementById("toggle-fx")!.classList.toggle("active", settings.fx);
  document
    .getElementById("toggle-haptics")!
    .classList.toggle("active", settings.haptics);
  document.getElementById("musicState")!.textContent = settings.music
    ? "On"
    : "Off";
  document.getElementById("fxState")!.textContent = settings.fx ? "On" : "Off";
  document.getElementById("hapticsState")!.textContent = settings.haptics
    ? "On"
    : "Off";
}

function openShop(): void {
  document.getElementById("shop-modal")!.classList.remove("hidden");
  updateShopUI();
  triggerHaptic("light");
}

function closeShop(): void {
  document.getElementById("shop-modal")!.classList.add("hidden");
}

function updateShopUI(): void {
  const vehicle = VEHICLES[shopIndex];
  document.getElementById("shop-coin-count")!.textContent = String(totalCoins);
  document.getElementById("shop-vehicle-name")!.textContent = vehicle.name;
  document.getElementById("shop-vehicle-desc")!.textContent =
    vehicle.description;

  const shopCanvas = document.getElementById(
    "shop-canvas",
  ) as HTMLCanvasElement;
  const sCtx = shopCanvas.getContext("2d");
  if (sCtx) {
    sCtx.clearRect(0, 0, shopCanvas.width, shopCanvas.height);
    sCtx.save();
    sCtx.translate(shopCanvas.width / 2, shopCanvas.height / 2);
    const scale = 1.2;
    sCtx.scale(scale, scale);
    drawVehicleShape(sCtx, vehicle, vehicle.width, vehicle.height, false);
    sCtx.restore();
  }

  const priceArea = document.getElementById("shop-price-area")!;
  const actionBtn = document.getElementById("shop-action-btn")!;
  const isOwned = ownedVehicles.has(vehicle.id);
  const isEquipped = vehicle.id === selectedVehicleId;

  if (isOwned) {
    priceArea.innerHTML = '<div class="shop-owned-badge">OWNED</div>';
    if (isEquipped) {
      actionBtn.className = "shop-buy-btn equipped";
      actionBtn.textContent = "EQUIPPED";
      (actionBtn as HTMLButtonElement).disabled = true;
    } else {
      actionBtn.className = "shop-buy-btn select";
      actionBtn.textContent = "SELECT";
      (actionBtn as HTMLButtonElement).disabled = false;
    }
  } else {
    priceArea.innerHTML =
      '<div class="shop-price"><div class="start-coin-icon">$</div><span>' +
      vehicle.cost +
      "</span></div>";
    actionBtn.className = "shop-buy-btn buy";
    actionBtn.textContent = "BUY";
    (actionBtn as HTMLButtonElement).disabled = totalCoins < vehicle.cost;
  }
}

function buyOrSelectVehicle(): void {
  const vehicle = VEHICLES[shopIndex];
  if (ownedVehicles.has(vehicle.id)) {
    if (vehicle.id !== selectedVehicleId) {
      selectedVehicleId = vehicle.id;
      initPlayer();
      updateLoadedChunks(true);
      triggerHaptic("light");
      savePersistentState();
      updateStartScreenUI();
    }
  } else if (totalCoins >= vehicle.cost) {
    totalCoins -= vehicle.cost;
    ownedVehicles.add(vehicle.id);
    selectedVehicleId = vehicle.id;
    initPlayer();
    updateLoadedChunks(true);
    triggerHaptic("success");
    savePersistentState();
    updateStartScreenUI();
    debugLog(
      "[buyOrSelectVehicle] Bought:",
      vehicle.id,
      "Remaining coins:",
      totalCoins,
    );
  }
  updateShopUI();
}

function pauseGame(): void {
  if (gamePhase !== "playing") return;
  gamePhase = "paused";
  pauseMusic();
  gameplayStop();
  document.getElementById("pause-modal")!.classList.remove("hidden");
}

function resumeGame(): void {
  if (gamePhase !== "paused") return;
  gamePhase = "playing";
  lastTime = performance.now();
  startLoop();
  playMusic();
  gameplayStart();
  document.getElementById("pause-modal")!.classList.add("hidden");
}

function quitToHome(): void {
  gamePhase = "start";
  pauseMusic();
  gameplayStop();

  document.getElementById("pause-modal")!.classList.add("hidden");
  document.getElementById("settings-modal")!.classList.add("hidden");
  document.getElementById("shop-modal")!.classList.add("hidden");
  document.getElementById("game-over")!.classList.add("hidden");
  document.getElementById("hud")!.classList.add("hidden");
  hideGameplayUI();
  document.getElementById("start-screen")!.classList.remove("hidden");

  chunks.clear();
  loadedChunks = [];
  loadedRoadSegments = [];
  loadedLakes = [];
  loadedRocks = [];
  loadedCoins = [];
  loadedChunkX = Number.NaN;
  loadedChunkY = Number.NaN;
  minimapTerrainCanvas = null;
  minimapTerrainCtx = null;
  invalidateMinimapCache();
  policeCars = [];
  explosions = [];
  skidMarks = [];
  driftSmoke = [];
  scorePopups = [];
  coinPopups = [];
  skidMarkDistance = 0;

  initPlayer();
  updateLoadedChunks(true);
  updateStartScreenUI();
}

function showGameplayUI(): void {
  document.getElementById("settings-btn")!.classList.remove("hidden");
  document.getElementById("pause-btn")!.classList.remove("hidden");
  document.getElementById("ingame-shop-btn")!.classList.remove("hidden");
  document.getElementById("control-hint")!.classList.remove("hidden");
  document.getElementById("mobile-hint")!.classList.remove("hidden");
  document.getElementById("mobile-controls")!.classList.remove("hidden");
}

function hideGameplayUI(): void {
  document.getElementById("settings-btn")!.classList.add("hidden");
  document.getElementById("pause-btn")!.classList.add("hidden");
  document.getElementById("ingame-shop-btn")!.classList.add("hidden");
  document.getElementById("control-hint")!.classList.add("hidden");
  document.getElementById("mobile-hint")!.classList.add("hidden");
  document.getElementById("mobile-controls")!.classList.add("hidden");
}

function setupUIHandlers(): void {
  const startBtn = document.getElementById("start-btn")!;
  const restartBtn = document.getElementById("restart-btn")!;

  startBtn.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  restartBtn.addEventListener("click", () => {
    triggerHaptic("light");
    restartGame();
  });

  // Vehicle chip selection on start screen
  const vehicleChips = document.querySelectorAll(".vehicle-chip");
  vehicleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const vid = chip.getAttribute("data-vehicle");
      if (!vid) return;

      if (!ownedVehicles.has(vid)) {
        shopIndex = VEHICLES.findIndex((v) => v.id === vid);
        if (shopIndex < 0) shopIndex = 0;
        openShop();
        return;
      }

      selectedVehicleId = vid;
      initPlayer();
      updateLoadedChunks(true);
      triggerHaptic("light");
      savePersistentState();
      updateStartScreenUI();
      debugLog("[setupUIHandlers] Selected vehicle:", vid);
    });
  });

  // Start screen shop button
  document.getElementById("start-shop-btn")!.addEventListener("click", () => {
    triggerHaptic("light");
    openShop();
  });

  // Settings button + modal (does NOT trigger pause UI)
  let settingsWasPlaying = false;
  document.getElementById("settings-btn")!.addEventListener("click", () => {
    triggerHaptic("light");
    settingsWasPlaying = gamePhase === "playing";
    if (settingsWasPlaying) {
      gamePhase = "paused";
      pauseMusic();
      gameplayStop();
    }
    document.getElementById("settings-modal")!.classList.remove("hidden");
    updateSettingsToggles();
  });
  document.getElementById("settings-close")!.addEventListener("click", () => {
    document.getElementById("settings-modal")!.classList.add("hidden");
    if (settingsWasPlaying && gamePhase === "paused") {
      gamePhase = "playing";
      lastTime = performance.now();
      if (settings.music) playMusic();
      gameplayStart();
    }
  });

  let lastToggle = 0;
  function settingsToggle(cb: () => void): (e: Event) => void {
    return (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - lastToggle < 300) return;
      lastToggle = Date.now();
      cb();
      saveSettings();
      updateSettingsToggles();
      triggerHaptic("light");
    };
  }

  document.getElementById("toggle-music")!.addEventListener(
    "click",
    settingsToggle(() => {
      settings.music = !settings.music;
      if (!settings.music) pauseMusic();
      else if (gamePhase === "playing") playMusic();
    }),
  );
  document.getElementById("toggle-fx")!.addEventListener(
    "click",
    settingsToggle(() => {
      settings.fx = !settings.fx;
    }),
  );
  document.getElementById("toggle-haptics")!.addEventListener(
    "click",
    settingsToggle(() => {
      settings.haptics = !settings.haptics;
    }),
  );

  // Pause button + modal
  document.getElementById("pause-btn")!.addEventListener("click", () => {
    triggerHaptic("light");
    pauseGame();
  });
  document.getElementById("pause-resume")!.addEventListener("click", () => {
    triggerHaptic("light");
    document.getElementById("settings-modal")!.classList.add("hidden");
    resumeGame();
  });
  document.getElementById("pause-quit")!.addEventListener("click", () => {
    triggerHaptic("light");
    document.getElementById("pause-modal")!.classList.add("hidden");
    endGame();
  });
  document.getElementById("pause-home")!.addEventListener("click", () => {
    triggerHaptic("light");
    quitToHome();
  });

  // In-game shop button
  document.getElementById("ingame-shop-btn")!.addEventListener("click", () => {
    triggerHaptic("light");
    if (gamePhase === "playing") pauseGame();
    openShop();
  });

  // Shop modal
  document.getElementById("shop-close")!.addEventListener("click", () => {
    closeShop();
  });
  let shopNavLock = false;
  function shopNav(delta: number): void {
    if (shopNavLock) return;
    shopNavLock = true;
    shopIndex = (shopIndex + delta + VEHICLES.length) % VEHICLES.length;
    updateShopUI();
    triggerHaptic("light");
    setTimeout(() => {
      shopNavLock = false;
    }, 200);
  }
  document
    .getElementById("shop-prev")!
    .addEventListener("click", () => shopNav(-1));
  document
    .getElementById("shop-next")!
    .addEventListener("click", () => shopNav(1));
  document.getElementById("shop-action-btn")!.addEventListener("click", () => {
    buyOrSelectVehicle();
  });

  // Escape key for pause
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (gamePhase === "playing") {
        pauseGame();
      } else if (gamePhase === "paused") {
        document.getElementById("settings-modal")!.classList.add("hidden");
        closeShop();
        resumeGame();
      }
    }
  });

  updateSettingsToggles();
}

// ============================================================================
// HAPTICS & PLATFORM INTEGRATION
// ============================================================================

function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

function submitFinalScore(): void {
  debugLog("[submitFinalScore] Submitting score:", score);
  oasiz.submitScore(score);
}

function gameplayStart(): void {
  debugLog("[gameplayStart] Gameplay started");
  if (typeof (window as any).gameplayStart === "function") {
    (window as any).gameplayStart();
  }
}

function gameplayStop(): void {
  debugLog("[gameplayStop] Gameplay stopped");
  if (typeof (window as any).gameplayStop === "function") {
    (window as any).gameplayStop();
  }
}

// ============================================================================
// GAME FLOW
// ============================================================================

function startGame(): void {
  debugLog("[startGame] Starting game");

  gamePhase = "playing";
  score = 0;
  displayScore = 0;
  gameTime = 0;
  combo = 0;
  lastCrashTime = 0;
  crashCount = 0;
  survivalScore = 0;
  sessionCoins = 0;
  coinPopups = [];
  difficultyMultiplier = 1;
  spawnInterval = POLICE_SPAWN_INTERVAL_START;
  nextPoliceSpawn = 1000;
  policeIdCounter = 0;

  policeCars = [];
  explosions = [];
  skidMarks = [];
  driftSmoke = [];
  scorePopups = [];
  skidMarkDistance = 0;

  interceptorWarningShown = false;
  swatWarningShown = false;

  input = { up: false, down: false, left: false, right: false };
  screenShake = 0;
  freezeFrame = 0;

  chunks.clear();
  loadedChunks = [];
  loadedRoadSegments = [];
  loadedLakes = [];
  loadedRocks = [];
  loadedCoins = [];
  loadedChunkX = Number.NaN;
  loadedChunkY = Number.NaN;
  minimapTerrainCanvas = null;
  minimapTerrainCtx = null;
  invalidateMinimapCache();

  initPlayer();
  updateLoadedChunks(true);

  startLoop();

  document.getElementById("start-screen")!.classList.add("hidden");
  document.getElementById("hud")!.classList.remove("hidden");
  showGameplayUI();

  playMusic();
  updateScoreDisplay();
  gameplayStart();
}

function restartGame(): void {
  debugLog("[restartGame] Restarting game");
  document.getElementById("game-over")!.classList.add("hidden");
  startGame();
}

function endGame(): void {
  debugLog(
    "[endGame] Game over! Survival score:",
    Math.floor(survivalScore),
    "Crashes:",
    crashCount,
  );

  gamePhase = "gameOver";
  gameplayStop();
  pauseMusic();

  const survivalPoints = Math.floor(survivalScore);
  score = survivalPoints + score;

  totalCoins += sessionCoins;

  submitFinalScore();
  savePersistentState();
  oasiz.flushGameState();
  triggerHaptic("error");
  screenShake = SHAKE_INTENSITY * 2;

  document.getElementById("hud")!.classList.add("hidden");
  document.getElementById("pause-modal")!.classList.add("hidden");
  document.getElementById("settings-modal")!.classList.add("hidden");
  document.getElementById("shop-modal")!.classList.add("hidden");
  hideGameplayUI();

  const totalSeconds = Math.floor(gameTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  document.getElementById("final-time")!.textContent =
    minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  document.getElementById("final-crashes")!.textContent = String(crashCount);
  document.getElementById("final-score")!.textContent = String(score);
  document.getElementById("gameover-coins")!.textContent = "+" + sessionCoins;

  setTimeout(() => {
    document.getElementById("game-over")!.classList.remove("hidden");
  }, 600);
}

function updateScoreDisplay(): void {
  const totalSeconds = Math.floor(gameTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  document.getElementById("time-display")!.textContent =
    minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  document.getElementById("crash-display")!.textContent = String(crashCount);
  document.getElementById("coin-display")!.textContent = String(
    totalCoins + sessionCoins,
  );
}

// ============================================================================
// GAME LOOP
// ============================================================================

function gameLoop(currentTime: number): void {
  rafId = 0;

  if (lastTime === 0 || currentTime - lastTime > 100) {
    lastTime = currentTime;
  }

  const deltaTime = Math.min(currentTime - lastTime, 32);
  lastTime = currentTime;

  if (freezeFrame > 0) {
    freezeFrame -= deltaTime;
    render();
    rafId = requestAnimationFrame(gameLoop);
    return;
  }

  update(deltaTime);
  render();

  rafId = requestAnimationFrame(gameLoop);
}

function updateCoins(dt: number): void {
  for (const coin of loadedCoins) {
    if (coin.collected) continue;
    const dx = player.x - coin.x;
    const dy = player.y - coin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < COIN_COLLECT_RADIUS + player.width / 2) {
      coin.collected = true;
      coin.collectTime = performance.now();
      sessionCoins++;
      coinPopups.push({ x: coin.x, y: coin.y, time: 0 });
      triggerHaptic("light");
      if (settings.fx) playCoinSound();
      trimArrayStartInPlace(coinPopups, 40);
    }
  }

  for (const popup of coinPopups) {
    popup.time += dt;
  }
  compactArrayInPlace(coinPopups, (popup) => popup.time < 800);
}

let coinSynthInitialized = false;
let coinSynth: Tone.Synth | null = null;

function initCoinSound(): void {
  if (coinSynthInitialized) return;
  coinSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
  }).toDestination();
  coinSynth.volume.value = -6;
  coinSynthInitialized = true;
}

function playCoinSound(): void {
  if (!settings.fx) return;
  if (!coinSynthInitialized) initCoinSound();
  if (Tone.getContext().state !== "running") {
    Tone.start().then(() => {
      coinSynth?.triggerAttackRelease("C6", "16n");
    });
  } else {
    coinSynth?.triggerAttackRelease("C6", "16n");
  }
}

function update(dt: number): void {
  if (gamePhase === "playing") {
    gameTime += dt;

    survivalScore += dt * 0.01;

    updateScoreDisplay();

    updateDifficulty();
    updateLoadedChunks();
    updatePlayer(dt);
    if (gamePhase !== "playing") return;
    updateCamera(dt);
    updatePoliceSpawning(dt);
    updatePolice(dt);
    checkCollisions();
    cleanupPoliceCars();
    updateCoins(dt);
    updateExplosions(dt);
    updateSkidMarks(dt);
    updateDriftSmoke(dt);
    updateScorePopups(dt);

    if (combo > 0 && gameTime - lastCrashTime > COMBO_TIMEOUT) {
      combo = 0;
    }

    screenShake *= SHAKE_DECAY;
    if (screenShake < 0.5) screenShake = 0;
  } else if (gamePhase === "gameOver") {
    updateExplosions(dt);
    updateDriftSmoke(dt);
    screenShake *= SHAKE_DECAY;
  }
}

function updateDifficulty(): void {
  difficultyMultiplier = 1 + (gameTime / 25000) * 0.7;

  // Exponential spawn rate increase: starts slow, ramps up fast
  // decay factor - smaller = faster exponential decay
  const decayFactor = 0.00003;
  const exponentialFactor = Math.exp(-gameTime * decayFactor);
  spawnInterval = Math.max(
    POLICE_SPAWN_INTERVAL_MIN,
    POLICE_SPAWN_INTERVAL_START * exponentialFactor,
  );
}

// ============================================================================
// PLAYER PHYSICS
// ============================================================================

function updatePlayer(dt: number): void {
  const dtFactor = dt / 16.667;

  // 1. STEERING - responsive at all speeds
  const minTurnFactor = 0.6;
  const speedRatio = Math.min(1, Math.abs(player.speed) / 8);
  const turnFactor = minTurnFactor + (1 - minTurnFactor) * speedRatio;

  // On mobile, no handbrake - just steering
  const handbrakeActive = !isMobile && input.down && player.speed > 3;
  const handbrakeBoost = handbrakeActive ? 1.8 : 1.0;

  // Steering - use player's turn speed
  const effectiveTurnSpeed =
    player.turnSpeed * turnFactor * handbrakeBoost * dtFactor;

  if (input.left) {
    player.angle -= effectiveTurnSpeed;
  }
  if (input.right) {
    player.angle += effectiveTurnSpeed;
  }

  // 2. ACCELERATION
  if (isMobile) {
    // Mobile: Always accelerate at full speed
    player.vx += Math.cos(player.angle) * player.acceleration * 1.2 * dtFactor;
    player.vy += Math.sin(player.angle) * player.acceleration * 1.2 * dtFactor;
  } else {
    // Desktop: Manual acceleration/brake
    if (input.up) {
      player.vx += Math.cos(player.angle) * player.acceleration * dtFactor;
      player.vy += Math.sin(player.angle) * player.acceleration * dtFactor;
    }
    if (input.down) {
      player.vx -= Math.cos(player.angle) * PLAYER_BRAKE * dtFactor;
      player.vy -= Math.sin(player.angle) * PLAYER_BRAKE * dtFactor;
    }
  }

  // 3. SURFACE PROPERTIES - based on road presence and vehicle stats
  const vehicle = getSelectedVehicle();
  const surface = sampleSurfaceAt(player.x, player.y);
  const onRoad = surface.onRoad;
  let surfaceMaxSpeed = player.maxSpeed * 0.85;
  let surfaceGrip = vehicle.grip * 0.8;

  if (onRoad) {
    surfaceMaxSpeed = player.maxSpeed * 1.25;
    surfaceGrip = vehicle.grip * 1.1;
  }

  // 4. GRIP PHYSICS
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const rightX = -forwardY;
  const rightY = forwardX;

  const lateralVelocity = player.vx * rightX + player.vy * rightY;
  const lateralSlip = Math.abs(lateralVelocity);

  let effectiveGrip = surfaceGrip;
  if (handbrakeActive) {
    effectiveGrip *= 0.4;
  }

  player.vx -= rightX * lateralVelocity * effectiveGrip * dtFactor;
  player.vy -= rightY * lateralVelocity * effectiveGrip * dtFactor;

  // 5. DRAG
  const driftSpeedBoost = 1 + Math.min(0.008, lateralSlip * 0.001);
  player.vx *= PLAYER_DRAG * driftSpeedBoost;
  player.vy *= PLAYER_DRAG * driftSpeedBoost;

  if (!input.up && !input.down) {
    player.vx *= 1 - PLAYER_FRICTION * dtFactor;
    player.vy *= 1 - PLAYER_FRICTION * dtFactor;
  }

  // 6. SPEED CALCULATION
  player.speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);

  const speedCap = surfaceMaxSpeed * (1 + Math.min(0.1, lateralSlip * 0.01));
  if (player.speed > speedCap) {
    const ratio = speedCap / player.speed;
    player.vx *= ratio;
    player.vy *= ratio;
    player.speed = speedCap;
  }

  // 7. VISUAL DRIFT ANGLE
  if (player.speed > 1.5) {
    const velocityAngle = Math.atan2(player.vy, player.vx);
    let angleDiff = velocityAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const targetDrift = angleDiff * 1.2;
    player.driftAngle += (targetDrift - player.driftAngle) * 0.2 * dtFactor;
  } else {
    player.driftAngle *= 0.85;
  }

  // 8. POSITION UPDATE
  player.x += player.vx * dtFactor;
  player.y += player.vy * dtFactor;

  // No world bounds - infinite world!

  // 9. ROCK COLLISION (from chunks)
  const surfaceAfterMove = sampleSurfaceAt(player.x, player.y);
  for (const rock of loadedRocks) {
    const dx = player.x - rock.x;
    const dy = player.y - rock.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = rock.radius + player.width / 2;

    if (dist < minDist) {
      const overlap = minDist - dist;
      const nx = dx / dist || 0;
      const ny = dy / dist || 0;

      player.x += nx * overlap * 1.2;
      player.y += ny * overlap * 1.2;

      const dot = player.vx * nx + player.vy * ny;
      player.vx = (player.vx - 1.5 * dot * nx) * 0.7;
      player.vy = (player.vy - 1.5 * dot * ny) * 0.7;

      if (player.speed > 4) {
        screenShake = Math.max(screenShake, 6);
        triggerHaptic("medium");
      }
    }
  }

  if (surfaceAfterMove.inWater) {
    player.vx *= 0.95;
    player.vy *= 0.95;
    surfaceGrip *= 0.3;
  }

  player.waterExposureMs = updateWaterExposure(
    player.waterExposureMs,
    surfaceAfterMove.inWater,
    dt,
  );
  if (player.waterExposureMs >= WATER_DROWN_TIME) {
    createExplosion(player.x, player.y);
    endGame();
    return;
  }

  // 11. TIRE TRACKS & SMOKE
  // Scale effects based on vehicle size (sedan = 38x70 as baseline)
  const vehicleSizeScale = (player.width * player.height) / (38 * 70);
  const trackScale = Math.sqrt(vehicleSizeScale); // Square root for more subtle scaling
  const isTankVehicle = vehicle.id === "tank";

  // Always show tire tracks when moving
  if (player.speed > 1) {
    const backX = player.x - Math.cos(player.angle) * player.height * 0.4;
    const backY = player.y - Math.sin(player.angle) * player.height * 0.4;
    const wheelOffset = player.width * 0.35;

    // Base alpha - always visible, darker when drifting
    const baseAlpha = 0.25 * trackScale;
    const driftAlpha =
      lateralSlip > 2 ? Math.min(0.4, lateralSlip * 0.06) * trackScale : 0;
    const trackAlpha = baseAlpha + driftAlpha;

    // Track dimensions - length must match distance traveled per frame
    // At 60fps with FIXED_DT=16.67ms, car moves ~speed * 0.28 pixels per frame
    // Add 50% extra length for guaranteed overlap
    const distancePerFrame = player.speed * 0.42; // Speed * dt factor with overlap
    const trackWidth = isTankVehicle ? 12 * trackScale : 4 * trackScale;
    const trackLength =
      Math.max(isTankVehicle ? 20 : 8, distancePerFrame) * trackScale;

    skidMarkDistance += distancePerFrame;
    if (
      skidMarkDistance >= SKID_MARK_EMIT_DISTANCE ||
      lateralSlip > 5 ||
      handbrakeActive
    ) {
      skidMarkDistance %= SKID_MARK_EMIT_DISTANCE;
      skidMarks.push({
        x: backX + Math.cos(player.angle + Math.PI / 2) * wheelOffset,
        y: backY + Math.sin(player.angle + Math.PI / 2) * wheelOffset,
        angle: player.angle,
        alpha: trackAlpha,
        width: trackWidth,
        length: trackLength,
        isTank: isTankVehicle,
      });
      skidMarks.push({
        x: backX - Math.cos(player.angle + Math.PI / 2) * wheelOffset,
        y: backY - Math.sin(player.angle + Math.PI / 2) * wheelOffset,
        angle: player.angle,
        alpha: trackAlpha,
        width: trackWidth,
        length: trackLength,
        isTank: isTankVehicle,
      });
      trimArrayStartInPlace(skidMarks, MAX_SKID_MARKS);
    }

    // Smoke only when drifting hard - size scales with vehicle
    if (lateralSlip > 3 && Math.random() < 0.4 * trackScale) {
      const smokeSpread = 15 * trackScale;
      const baseSmoke = 8 * trackScale;
      const smokeVariance = 12 * trackScale;
      driftSmoke.push({
        x: backX + (Math.random() - 0.5) * smokeSpread,
        y: backY + (Math.random() - 0.5) * smokeSpread,
        vx: -player.vx * 0.1 + (Math.random() - 0.5) * 2,
        vy: -player.vy * 0.1 + (Math.random() - 0.5) * 2,
        size: baseSmoke + Math.random() * smokeVariance,
        alpha: 0.4 * trackScale,
      });
      trimArrayStartInPlace(driftSmoke, MAX_DRIFT_SMOKE);
    }
  }
}

function updateCamera(dt: number): void {
  const dtFactor = dt / 16.667;
  const smoothing = 0.08;

  // Look ahead based on velocity
  const lookAhead = 140;
  const targetX = player.x + player.vx * (lookAhead / PLAYER_MAX_SPEED);
  const targetY = player.y + player.vy * (lookAhead / PLAYER_MAX_SPEED);

  camera.x += (targetX - camera.x) * smoothing * dtFactor;
  camera.y += (targetY - camera.y) * smoothing * dtFactor;
}

// ============================================================================
// POLICE AI
// ============================================================================

function showWaveWarning(text: string): void {
  const el = document.getElementById("wave-warning");
  if (!el) return;
  const span = el.querySelector("span");
  if (span) span.textContent = text;
  el.classList.remove("visible");
  void el.offsetWidth;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2200);
}

function pickEnemyType(): EnemyType {
  if (gameTime >= SWAT_UNLOCK_TIME) {
    const r = Math.random();
    if (r < 0.4) return "patrol";
    if (r < 0.75) return "interceptor";
    return "swat";
  }
  if (gameTime >= INTERCEPTOR_UNLOCK_TIME) {
    return Math.random() < 0.6 ? "patrol" : "interceptor";
  }
  return "patrol";
}

function updatePoliceSpawning(dt: number): void {
  nextPoliceSpawn -= dt;

  if (!interceptorWarningShown && gameTime >= INTERCEPTOR_UNLOCK_TIME) {
    interceptorWarningShown = true;
    showWaveWarning("INTERCEPTORS INCOMING");
    triggerHaptic("heavy");
  }
  if (!swatWarningShown && gameTime >= SWAT_UNLOCK_TIME) {
    swatWarningShown = true;
    showWaveWarning("SWAT DEPLOYED");
    triggerHaptic("heavy");
  }

  if (nextPoliceSpawn <= 0 && policeCars.length < MAX_POLICE) {
    spawnPoliceCar();
    nextPoliceSpawn = spawnInterval;
  }
}

function spawnPoliceCar(): void {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.max(w, h) * 0.8;

  const x = player.x + Math.cos(angle) * distance;
  const y = player.y + Math.sin(angle) * distance;

  const enemyType = pickEnemyType();
  const stats = ENEMY_STATS[enemyType];

  const police: PoliceCar = {
    x,
    y,
    width: stats.width,
    height: stats.height,
    angle: Math.atan2(player.y - y, player.x - x),
    speed: 0,
    maxSpeed:
      stats.maxSpeed * (0.9 + Math.random() * 0.2) * difficultyMultiplier,
    id: policeIdCounter++,
    lightPhase: Math.random() * Math.PI * 2,
    state: "chase",
    enemyType,
    health: stats.health,
    waterExposureMs: 0,
  };

  policeCars.push(police);
  debugLog("[spawnPoliceCar]", enemyType, police.id, "spawned");
}

function destroyPoliceCar(police: PoliceCar, popupColor: string): void {
  police.health = 0;
  police.waterExposureMs = WATER_DROWN_TIME;
  createExplosion(police.x, police.y);
  police.state = "crashed";
  crashCount++;

  if (gameTime - lastCrashTime < COMBO_TIMEOUT) {
    combo++;
  } else {
    combo = 1;
  }
  lastCrashTime = gameTime;

  const pts = ENEMY_STATS[police.enemyType].points;
  score += pts * Math.max(1, combo);
  scorePopups.push({
    x: 0,
    y: 0,
    worldX: police.x,
    worldY: police.y - 50,
    text: "+" + pts,
    time: 0,
    color: popupColor,
  });
  triggerHaptic("medium");
}

function updatePolice(dt: number): void {
  const dtFactor = dt / 16.667;

  for (const police of policeCars) {
    if (police.state === "crashed") continue;
    let policeDestroyed = false;

    const dx = player.x - police.x;
    const dy = player.y - police.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);
    const stats = ENEMY_STATS[police.enemyType];

    let targetAngle: number;

    if (police.enemyType === "interceptor") {
      const predTime = Math.min(distToPlayer / Math.max(police.speed, 1), 1.5);
      const predX = player.x + player.vx * predTime * 30;
      const predY = player.y + player.vy * predTime * 30;
      targetAngle = Math.atan2(predY - police.y, predX - police.x);
    } else if (police.enemyType === "swat") {
      const aheadX = player.x + Math.cos(player.angle) * 200;
      const aheadY = player.y + Math.sin(player.angle) * 200;
      targetAngle = Math.atan2(aheadY - police.y, aheadX - police.x);
    } else {
      targetAngle = Math.atan2(dy, dx);
    }

    let angleDiff = targetAngle - police.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    police.angle += angleDiff * stats.turnRate * dtFactor;

    if (distToPlayer > 80) {
      police.speed += stats.accel * dtFactor;
    } else {
      police.speed *= 0.97;
    }

    const policeSurface = sampleSurfaceAt(police.x, police.y);
    const policeOnRoad = policeSurface.onRoad;
    const policeMaxSpd = policeOnRoad
      ? police.maxSpeed * 1.15
      : police.maxSpeed * 0.85;
    police.speed = Math.min(policeMaxSpd, police.speed);

    police.x += Math.cos(police.angle) * police.speed * dtFactor;
    police.y += Math.sin(police.angle) * police.speed * dtFactor;
    const policeSurfaceAfterMove = sampleSurfaceAt(police.x, police.y);

    for (const rock of loadedRocks) {
      const odx = police.x - rock.x;
      const ody = police.y - rock.y;
      const odist = Math.sqrt(odx * odx + ody * ody);
      const minDist = rock.radius + police.width / 2;

      if (odist < minDist) {
        destroyPoliceCar(police, "#ff9944");
        screenShake = SHAKE_INTENSITY * 0.5;
        policeDestroyed = true;
        break;
      }
    }

    if (policeDestroyed) continue;

    const policeInWater = policeSurfaceAfterMove.inWater;
    if (policeInWater) {
      police.speed *= 0.96;
    }
    police.waterExposureMs = updateWaterExposure(
      police.waterExposureMs,
      policeInWater,
      dt,
    );
    if (police.waterExposureMs >= WATER_DROWN_TIME) {
      destroyPoliceCar(police, "#44aaff");
      screenShake = SHAKE_INTENSITY * 0.4;
      policeDestroyed = true;
    }
  }
}

function cleanupPoliceCars(): void {
  compactArrayInPlace(policeCars, (police) => {
    if (police.state === "crashed") return false;
    const dx = police.x - player.x;
    const dy = police.y - player.y;
    return Math.sqrt(dx * dx + dy * dy) < 2500;
  });
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

function checkCollisions(): void {
  const toRemove = new Set<number>();
  let crashesThisFrame = 0;
  let framePoints = 0;

  for (let i = 0; i < policeCars.length; i++) {
    for (let j = i + 1; j < policeCars.length; j++) {
      const p1 = policeCars[i];
      const p2 = policeCars[j];
      if (p1.state === "crashed" || p2.state === "crashed") continue;

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const collisionDist = (p1.width + p2.width) / 2 + 10;

      if (dist < collisionDist) {
        let p1Destroyed = false;
        let p2Destroyed = false;

        p1.health--;
        p2.health--;

        if (p1.health <= 0) {
          p1Destroyed = true;
          toRemove.add(p1.id);
          p1.state = "crashed";
        }
        if (p2.health <= 0) {
          p2Destroyed = true;
          toRemove.add(p2.id);
          p2.state = "crashed";
        }

        if (p1Destroyed || p2Destroyed) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          createExplosion(midX, midY);
          crashesThisFrame++;
          crashCount++;
          if (p1Destroyed) framePoints += ENEMY_STATS[p1.enemyType].points;
          if (p2Destroyed) framePoints += ENEMY_STATS[p2.enemyType].points;
        } else {
          const nx = dx / dist || 0;
          const ny = dy / dist || 0;
          p1.x += nx * 15;
          p1.y += ny * 15;
          p2.x -= nx * 15;
          p2.y -= ny * 15;
          p1.speed *= 0.5;
          p2.speed *= 0.5;
        }
      }
    }
  }

  if (crashesThisFrame > 0) {
    if (gameTime - lastCrashTime < COMBO_TIMEOUT) {
      combo += crashesThisFrame;
    } else {
      combo = crashesThisFrame;
    }
    lastCrashTime = gameTime;

    const comboMult = Math.max(1, combo);
    score += framePoints * comboMult;

    for (const p of policeCars) {
      if (toRemove.has(p.id)) {
        const pts = ENEMY_STATS[p.enemyType].points;
        scorePopups.push({
          x: 0,
          y: 0,
          worldX: p.x,
          worldY: p.y - 50,
          text: combo > 1 ? "+" + pts + " x" + combo + " COMBO!" : "+" + pts,
          time: 0,
          color: combo > 3 ? "#00ffcc" : combo > 1 ? "#ffcc00" : "#ffffff",
        });
        break;
      }
    }

    if (combo >= 3) {
      triggerHaptic("heavy");
      screenShake = SHAKE_INTENSITY * 1.5;
      freezeFrame = 60;
    } else {
      triggerHaptic("medium");
      screenShake = SHAKE_INTENSITY;
      freezeFrame = 40;
    }

    debugLog(
      "[checkCollisions] Crashes:",
      crashesThisFrame,
      "Combo:",
      combo,
      "Total crashes:",
      crashCount,
    );
  }

  const vehicle = getSelectedVehicle();

  for (const police of policeCars) {
    if (police.state === "crashed") continue;

    const dx = police.x - player.x;
    const dy = police.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ((player.width + police.width) / 2) * 0.75) {
      createExplosion(player.x, player.y);
      endGame();
      return;
    }
  }
}

// ============================================================================
// EFFECTS
// ============================================================================

function createExplosion(x: number, y: number): void {
  // Play explosion sound effect
  playExplosionSound();

  triggerHaptic("heavy");

  const particles: Particle[] = [];
  const debris: Debris[] = [];

  for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
    const angle =
      (Math.PI * 2 * i) / EXPLOSION_PARTICLE_COUNT + Math.random() * 0.5;
    const speed = 4 + Math.random() * 10;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 10 + Math.random() * 18,
      color:
        COLORS.explosion[Math.floor(Math.random() * COLORS.explosion.length)],
      life: 1,
    });
  }

  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    debris.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.5,
      size: 6 + Math.random() * 10,
      color: Math.random() > 0.5 ? "#333" : "#555",
    });
  }

  explosions.push({
    x,
    y,
    time: 0,
    maxTime: EXPLOSION_DURATION,
    particles,
    debris,
  });
}

function updateExplosions(dt: number): void {
  const dtFactor = dt / 16.667;

  for (const explosion of explosions) {
    explosion.time += dt;
    const progress = explosion.time / explosion.maxTime;

    for (const p of explosion.particles) {
      p.x += p.vx * dtFactor;
      p.y += p.vy * dtFactor;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life = 1 - progress;
      p.size *= 0.96;
    }

    for (const d of explosion.debris) {
      d.x += d.vx * dtFactor;
      d.y += d.vy * dtFactor;
      d.vy += 0.25 * dtFactor;
      d.rotation += d.rotationSpeed * dtFactor;
    }
  }

  compactArrayInPlace(
    explosions,
    (explosion) => explosion.time < explosion.maxTime,
  );
}

function updateSkidMarks(dt: number): void {
  for (const mark of skidMarks) {
    mark.alpha -= SKID_MARK_FADE_RATE * dt;
  }
  compactArrayInPlace(skidMarks, (mark) => mark.alpha > 0.02);
  trimArrayStartInPlace(skidMarks, MAX_SKID_MARKS);
}

function updateDriftSmoke(dt: number): void {
  const dtFactor = dt / 16.667;
  for (const smoke of driftSmoke) {
    smoke.x += smoke.vx * dtFactor;
    smoke.y += smoke.vy * dtFactor;
    smoke.size *= 1.025;
    smoke.alpha *= 0.94;
  }
  compactArrayInPlace(driftSmoke, (smoke) => smoke.alpha > 0.05);
  trimArrayStartInPlace(driftSmoke, MAX_DRIFT_SMOKE);
}

function updateScorePopups(dt: number): void {
  for (const popup of scorePopups) {
    popup.time += dt;
  }
  compactArrayInPlace(scorePopups, (popup) => popup.time < 1200);
}

// ============================================================================
// RENDERING
// ============================================================================

function getChunkBackdropCanvas(chunk: Chunk): HTMLCanvasElement {
  if (chunk.backdropCanvas) {
    return chunk.backdropCanvas;
  }

  const chunkLeft = chunk.cx * CHUNK_SIZE;
  const chunkTop = chunk.cy * CHUNK_SIZE;
  const colors = BIOME_COLORS[chunk.biome];
  const buffer = createCanvasElement(CHUNK_SIZE, CHUNK_SIZE);
  const c = buffer.getContext("2d")!;

  const tileSize = 100;
  for (let tx = 0; tx < CHUNK_SIZE; tx += tileSize) {
    for (let ty = 0; ty < CHUNK_SIZE; ty += tileSize) {
      const wx = chunkLeft + tx;
      const wy = chunkTop + ty;
      const hash = ((wx * 73856093) ^ (wy * 19349663)) & 0x7fffffff;
      const shade = hash % 3;

      if (shade === 0) c.fillStyle = colors.ground1;
      else if (shade === 1) c.fillStyle = colors.ground2;
      else c.fillStyle = colors.ground3;

      c.fillRect(tx, ty, tileSize, tileSize);

      const noiseVal = ((hash >> 4) % 20) - 10;
      if (noiseVal > 3) {
        c.fillStyle = "rgba(255,255,255,0.04)";
        c.fillRect(tx, ty, tileSize, tileSize);
      } else if (noiseVal < -3) {
        c.fillStyle = "rgba(0,0,0,0.04)";
        c.fillRect(tx, ty, tileSize, tileSize);
      }
    }
  }

  for (const lake of chunk.lakes) {
    c.save();
    c.translate(lake.x - chunkLeft, lake.y - chunkTop);
    c.rotate(lake.rotation);
    c.fillStyle =
      chunk.biome === "volcanic"
        ? "rgba(60,40,30,0.5)"
        : "rgba(200,180,140,0.4)";
    c.beginPath();
    c.ellipse(0, 0, lake.radiusX + 18, lake.radiusY + 18, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = colors.water;
    c.beginPath();
    c.ellipse(0, 0, lake.radiusX, lake.radiusY, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "rgba(255,255,255,0.15)";
    c.beginPath();
    c.ellipse(
      -lake.radiusX * 0.3,
      -lake.radiusY * 0.3,
      lake.radiusX * 0.35,
      lake.radiusY * 0.25,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
  }

  for (const road of chunk.roadSegments) {
    const angle = Math.atan2(road.y2 - road.y1, road.x2 - road.x1);
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    const x1 = road.x1 - chunkLeft;
    const y1 = road.y1 - chunkTop;
    const x2 = road.x2 - chunkLeft;
    const y2 = road.y2 - chunkTop;

    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.moveTo(
      x1 + perpX * (road.width / 2 + 6),
      y1 + perpY * (road.width / 2 + 6),
    );
    c.lineTo(
      x2 + perpX * (road.width / 2 + 6),
      y2 + perpY * (road.width / 2 + 6),
    );
    c.lineTo(
      x2 - perpX * (road.width / 2 + 6),
      y2 - perpY * (road.width / 2 + 6),
    );
    c.lineTo(
      x1 - perpX * (road.width / 2 + 6),
      y1 - perpY * (road.width / 2 + 6),
    );
    c.closePath();
    c.fill();

    c.fillStyle = colors.road;
    c.beginPath();
    c.moveTo(x1 + (perpX * road.width) / 2, y1 + (perpY * road.width) / 2);
    c.lineTo(x2 + (perpX * road.width) / 2, y2 + (perpY * road.width) / 2);
    c.lineTo(x2 - (perpX * road.width) / 2, y2 - (perpY * road.width) / 2);
    c.lineTo(x1 - (perpX * road.width) / 2, y1 - (perpY * road.width) / 2);
    c.closePath();
    c.fill();

    c.strokeStyle = colors.roadLine;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(
      x1 + perpX * (road.width / 2 - 6),
      y1 + perpY * (road.width / 2 - 6),
    );
    c.lineTo(
      x2 + perpX * (road.width / 2 - 6),
      y2 + perpY * (road.width / 2 - 6),
    );
    c.stroke();
    c.beginPath();
    c.moveTo(
      x1 - perpX * (road.width / 2 - 6),
      y1 - perpY * (road.width / 2 - 6),
    );
    c.lineTo(
      x2 - perpX * (road.width / 2 - 6),
      y2 - perpY * (road.width / 2 - 6),
    );
    c.stroke();

    c.lineWidth = 4;
    c.setLineDash([20, 15]);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.setLineDash([]);
  }

  chunk.backdropCanvas = buffer;
  return buffer;
}

function drawChunkLakeRipples(chunk: Chunk): void {
  const t = gameTime * 0.001;

  for (const lake of chunk.lakes) {
    ctx.save();
    ctx.translate(lake.x, lake.y);
    ctx.rotate(lake.rotation);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;

    for (let r = 0; r < 3; r++) {
      const ripplePhase = (t * 0.5 + r * 0.8) % 1;
      const rippleR = ripplePhase * 0.6 + 0.2;
      ctx.globalAlpha = 1 - ripplePhase;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        lake.radiusX * rippleR,
        lake.radiusY * rippleR,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function render(): void {
  ctx.save();

  if (screenShake > 0) {
    const sx = (Math.random() - 0.5) * screenShake * 2;
    const sy = (Math.random() - 0.5) * screenShake * 2;
    ctx.translate(sx, sy);
  }

  // Clear with current biome color
  const playerBiome = player ? getBiomeAt(player.x, player.y) : "desert";
  const bgColors = BIOME_COLORS[playerBiome];
  ctx.fillStyle = bgColors.ground1;
  ctx.fillRect(0, 0, w, h);

  // Camera transform
  ctx.save();
  ctx.translate(w / 2 - camera.x, h / 2 - camera.y);

  // Draw chunks (ground, roads, lakes, decorations, rocks)
  drawChunks();

  // Draw coins on map (visible even on start screen for ambiance)
  drawWorldCoins();

  // Only draw gameplay elements when not on start screen
  if (gamePhase !== "start") {
    drawSkidMarks();
    drawDriftSmoke();

    for (const police of policeCars) {
      drawPoliceCar(police);
    }

    if (
      gamePhase === "playing" ||
      gamePhase === "paused" ||
      gamePhase === "gameOver"
    ) {
      drawPlayerCar();
    }

    drawExplosions();
    drawScorePopups();
    drawCoinPopups();
  }

  ctx.restore();

  if (gamePhase !== "start") {
    if (joystick.active) {
      drawJoystick();
    }

    if (combo > 1 && (gamePhase === "playing" || gamePhase === "paused")) {
      drawComboIndicator();
    }

    drawMinimap();
  }

  ctx.restore();
}

function drawChunks(): void {
  // Draw each loaded chunk
  for (const chunk of loadedChunks) {
    const chunkLeft = chunk.cx * CHUNK_SIZE;
    const chunkTop = chunk.cy * CHUNK_SIZE;
    const colors = BIOME_COLORS[chunk.biome];

    // Check if chunk is visible
    if (Math.abs(chunkLeft + CHUNK_SIZE / 2 - camera.x) > w / 2 + CHUNK_SIZE)
      continue;
    if (Math.abs(chunkTop + CHUNK_SIZE / 2 - camera.y) > h / 2 + CHUNK_SIZE)
      continue;

    ctx.drawImage(getChunkBackdropCanvas(chunk), chunkLeft, chunkTop);
    drawChunkLakeRipples(chunk);

    // Draw decorations with pseudo-3D depth
    for (const dec of chunk.decorations) {
      if (Math.abs(dec.x - camera.x) > w / 2 + 100) continue;
      if (Math.abs(dec.y - camera.y) > h / 2 + 100) continue;

      ctx.save();
      ctx.translate(dec.x, dec.y);
      const s = dec.size;

      if (dec.type === "tree") {
        // Ground shadow
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(6, 8, s * 0.55, s * 0.3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Trunk
        ctx.fillStyle = "#5a3a2a";
        ctx.fillRect(-4, -s * 0.2, 8, s * 0.9);
        ctx.fillStyle = "#4a2a1a";
        ctx.fillRect(-4, -s * 0.2, 3, s * 0.9);
        // Canopy layers (dark to light, offset up)
        ctx.fillStyle = "#1a5a1a";
        ctx.beginPath();
        ctx.arc(2, -s * 0.35, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dec.color;
        ctx.beginPath();
        ctx.arc(0, -s * 0.45, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a8a3a";
        ctx.beginPath();
        ctx.arc(-2, -s * 0.55, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "pine") {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(5, 8, s * 0.4, s * 0.25, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4a2a1a";
        ctx.fillRect(-3, -s * 0.1, 6, s * 0.7);
        // Layered triangular tiers
        for (let t = 0; t < 3; t++) {
          const ty = -s * 0.2 - t * s * 0.28;
          const tw = s * (0.5 - t * 0.1);
          ctx.fillStyle = t === 0 ? "#1a4a2a" : t === 1 ? "#2a5a3a" : "#3a6a4a";
          ctx.beginPath();
          ctx.moveTo(0, ty - s * 0.25);
          ctx.lineTo(-tw, ty + s * 0.08);
          ctx.lineTo(tw, ty + s * 0.08);
          ctx.closePath();
          ctx.fill();
        }
      } else if (dec.type === "palm") {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(8, 10, s * 0.5, s * 0.25, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Curved trunk
        ctx.strokeStyle = "#6a4a2a";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.4);
        ctx.quadraticCurveTo(s * 0.15, -s * 0.2, 0, -s * 0.6);
        ctx.stroke();
        // Fronds
        ctx.fillStyle = "#3a7a3a";
        for (let f = 0; f < 6; f++) {
          const fa = (f / 6) * Math.PI * 2;
          ctx.save();
          ctx.translate(0, -s * 0.6);
          ctx.rotate(fa);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(s * 0.15, -s * 0.1, s * 0.3, 0);
          ctx.quadraticCurveTo(s * 0.15, s * 0.03, 0, 0);
          ctx.fill();
          ctx.restore();
        }
      } else if (dec.type === "bush" || dec.type === "shrub") {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.ellipse(3, 4, s * 0.45, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a5a2a";
        ctx.beginPath();
        ctx.arc(2, 1, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dec.color;
        ctx.beginPath();
        ctx.arc(-1, -2, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4a8a4a";
        ctx.beginPath();
        ctx.arc(1, -3, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "cactus") {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.ellipse(4, s * 0.5, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        // Side extrusion
        ctx.fillStyle = "#1a4a1a";
        ctx.fillRect(-s * 0.13, -s * 0.75, s * 0.26, s * 1.5);
        // Main body
        ctx.fillStyle = dec.color;
        ctx.fillRect(-s * 0.15, -s * 0.8, s * 0.3, s * 1.6);
        // Arms
        ctx.fillRect(-s * 0.6, -s * 0.3, s * 0.45, s * 0.18);
        ctx.fillRect(-s * 0.6, -s * 0.3, s * 0.18, -s * 0.3);
        ctx.fillRect(s * 0.15, -s * 0.5, s * 0.45, s * 0.18);
        ctx.fillRect(s * 0.42, -s * 0.5, s * 0.18, -s * 0.25);
        // Highlight
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(-s * 0.05, -s * 0.75, s * 0.04, s * 1.4);
      } else if (dec.type === "snowdrift" || dec.type === "ashpile") {
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.beginPath();
        ctx.ellipse(2, 3, s * 0.65, s * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dec.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.7, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.ellipse(
          -s * 0.15,
          -s * 0.08,
          s * 0.3,
          s * 0.12,
          -0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (dec.type === "vent") {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.arc(2, 3, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a2a2a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // Glow rings
        const gp = 0.5 + Math.sin(Date.now() * 0.008 + dec.x) * 0.3;
        ctx.strokeStyle = "rgba(255,80,0," + gp * 0.4 + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,50,0," + gp + ")";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "fallenlog") {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.ellipse(0, 3, s * 0.7, s * 0.2, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5a3a1a";
        ctx.save();
        ctx.rotate(dec.rotation);
        ctx.fillRect(-s * 0.6, -s * 0.12, s * 1.2, s * 0.24);
        ctx.fillStyle = "#4a2a0a";
        ctx.beginPath();
        ctx.arc(-s * 0.6, 0, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (dec.type === "mushroom") {
        ctx.fillStyle = "#e8d8b8";
        ctx.fillRect(-2, -s * 0.1, 4, s * 0.3);
        ctx.fillStyle = "#cc4444";
        ctx.beginPath();
        ctx.arc(0, -s * 0.15, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-s * 0.06, -s * 0.2, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.08, -s * 0.12, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "flowers") {
        const flowerColors = ["#ff6688", "#ffaa44", "#aa66ff", "#66aaff"];
        for (let f = 0; f < 5; f++) {
          const fx = Math.sin(f * 2.5 + dec.rotation) * s * 0.3;
          const fy = Math.cos(f * 1.8 + dec.rotation) * s * 0.3;
          ctx.fillStyle = "#3a7a3a";
          ctx.fillRect(fx - 1, fy, 2, s * 0.15);
          ctx.fillStyle = flowerColors[f % 4];
          ctx.beginPath();
          ctx.arc(fx, fy, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (dec.type === "skull") {
        ctx.fillStyle = "#d8d0c0";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a2a2a";
        ctx.beginPath();
        ctx.arc(-s * 0.06, -s * 0.04, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.06, -s * 0.04, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "tumbleweed") {
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.beginPath();
        ctx.arc(2, 3, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8a7a5a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
        ctx.stroke();
      } else if (dec.type === "snowman") {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.ellipse(2, s * 0.2, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f0f0f8";
        ctx.beginPath();
        ctx.arc(0, s * 0.1, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -s * 0.15, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -s * 0.35, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff6600";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.35);
        ctx.lineTo(s * 0.15, -s * 0.33);
        ctx.lineTo(0, -s * 0.31);
        ctx.fill();
      } else if (dec.type === "icepatch") {
        ctx.fillStyle = "rgba(150,200,240,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.5, s * 0.35, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.1, -s * 0.05, s * 0.2, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "sandcastle") {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.ellipse(2, 3, s * 0.35, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#d4b484";
        ctx.fillRect(-s * 0.25, -s * 0.2, s * 0.5, s * 0.35);
        ctx.fillRect(-s * 0.15, -s * 0.4, s * 0.3, s * 0.2);
        ctx.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.1);
      } else if (dec.type === "surfboard") {
        ctx.save();
        ctx.rotate(dec.rotation);
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.beginPath();
        ctx.ellipse(2, 2, s * 0.08, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff4488";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.07, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffaa44";
        ctx.fillRect(-s * 0.04, -s * 0.15, s * 0.08, s * 0.05);
        ctx.restore();
      } else if (dec.type === "lavapool") {
        const lp = 0.6 + Math.sin(Date.now() * 0.005 + dec.x) * 0.2;
        ctx.fillStyle = "rgba(80,20,0,0.4)";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.55, s * 0.4, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,80,0," + lp + ")";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.45, s * 0.3, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,200,50," + lp * 0.6 + ")";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.2, s * 0.12, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "charredtree") {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.ellipse(4, 6, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(-3, -s * 0.3, 6, s * 0.8);
        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.2);
        ctx.lineTo(-s * 0.2, -s * 0.45);
        ctx.moveTo(0, -s * 0.15);
        ctx.lineTo(s * 0.15, -s * 0.4);
        ctx.stroke();
      } else if (dec.type === "parkedcar") {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(2, 4, s * 0.5, s * 0.3, dec.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.rotate(dec.rotation);
        const carColors = ["#884444", "#446688", "#888844", "#448844"];
        ctx.fillStyle =
          carColors[Math.floor(Math.abs(Math.sin(dec.x * 0.1)) * 4)];
        ctx.beginPath();
        ctx.roundRect(-s * 0.3, -s * 0.5, s * 0.6, s * 1.0, 5);
        ctx.fill();
        ctx.fillStyle = "#334";
        ctx.beginPath();
        ctx.roundRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.3, 3);
        ctx.fill();
        ctx.restore();
      } else if (dec.type === "dumpster") {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(2, 2, s * 0.6, s * 0.4);
        ctx.fillStyle = "#3a5a3a";
        ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.4);
        ctx.fillStyle = "#2a4a2a";
        ctx.fillRect(-s * 0.3, -s * 0.25, s * 0.6, s * 0.06);
      } else if (dec.type === "hydrant") {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.ellipse(2, s * 0.1, s * 0.12, s * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#cc2222";
        ctx.fillRect(-s * 0.08, -s * 0.2, s * 0.16, s * 0.3);
        ctx.beginPath();
        ctx.arc(0, -s * 0.2, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (dec.type === "lamppost") {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.ellipse(3, 5, s * 0.15, s * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#555";
        ctx.fillRect(-2, -s * 0.5, 4, s * 0.8);
        ctx.shadowColor = "#ffeeaa";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#ffeeaa";
        ctx.beginPath();
        ctx.arc(0, -s * 0.5, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Generic fallback
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.arc(2, 3, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dec.color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw landmarks (points of interest) - MASSIVE and impressive
    for (const lm of chunk.landmarks) {
      if (Math.abs(lm.x - camera.x) > w / 2 + lm.size * 2) continue;
      if (Math.abs(lm.y - camera.y) > h / 2 + lm.size * 2) continue;

      ctx.save();
      ctx.translate(lm.x, lm.y);

      const s = lm.size;
      const time = Date.now() * 0.001;
      const pulse = 0.9 + Math.sin(time * 3 + lm.x * 0.01) * 0.1;
      const slowPulse = 0.95 + Math.sin(time * 1.5 + lm.y * 0.01) * 0.05;

      if (lm.type === "shrine") {
        // GRAND TEMPLE with multiple tiers, stairs, and magical energy

        // Outer plaza - stone floor
        ctx.fillStyle = "#6a5a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Stone tile pattern on plaza
        ctx.strokeStyle = "#5a4a3a";
        ctx.lineWidth = 2;
        for (let ring = 0.3; ring <= 1.1; ring += 0.2) {
          ctx.beginPath();
          ctx.arc(0, 0, s * ring, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * s * 0.3, Math.sin(angle) * s * 0.3);
          ctx.lineTo(Math.cos(angle) * s * 1.1, Math.sin(angle) * s * 1.1);
          ctx.stroke();
        }

        // 8 outer pillars in a circle
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const px = Math.cos(angle) * s * 0.9;
          const py = Math.sin(angle) * s * 0.9;

          // Pillar shadow
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.ellipse(px + 8, py + 8, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
          ctx.fill();

          // Pillar base
          ctx.fillStyle = "#8a7a6a";
          ctx.fillRect(px - s * 0.07, py - s * 0.2, s * 0.14, s * 0.4);

          // Pillar detail
          ctx.fillStyle = "#9a8a7a";
          ctx.fillRect(px - s * 0.05, py - s * 0.18, s * 0.1, s * 0.36);

          // Pillar top orb
          ctx.shadowColor = "#00ddaa";
          ctx.shadowBlur = 12 * pulse;
          ctx.fillStyle = "#00ffcc";
          ctx.beginPath();
          ctx.arc(px, py - s * 0.25, s * 0.04 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Inner elevated platform (tier 1)
        ctx.fillStyle = "#7a6a5a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#5a4a3a";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Central temple structure (tier 2)
        ctx.fillStyle = "#8b7355";
        ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);

        // Temple roof layers
        ctx.fillStyle = "#9a8a7a";
        ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.15);
        ctx.fillRect(-s * 0.4, s * 0.25, s * 0.8, s * 0.15);
        ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.15, s * 0.8);
        ctx.fillRect(s * 0.25, -s * 0.4, s * 0.15, s * 0.8);

        // Corner pillars of inner temple
        const corners = [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ];
        for (const [cx, cy] of corners) {
          ctx.fillStyle = "#7a6a5a";
          ctx.fillRect(
            cx * s * 0.28 - s * 0.06,
            cy * s * 0.28 - s * 0.06,
            s * 0.12,
            s * 0.12,
          );
        }

        // Central sanctum
        ctx.fillStyle = "#5a4a3a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // MASSIVE central glowing orb with particle effects
        ctx.shadowColor = "#00ffaa";
        ctx.shadowBlur = 60 * pulse;
        ctx.fillStyle = "#00ffaa";
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.25 * slowPulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.15 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.08 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Energy beams shooting up
        for (let i = 0; i < 4; i++) {
          const beamAngle = (i / 4) * Math.PI * 2 + time * 0.5;
          ctx.strokeStyle =
            "rgba(0,255,170," + (0.3 + Math.sin(time * 5 + i) * 0.2) + ")";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(
            Math.cos(beamAngle) * s * 0.5,
            Math.sin(beamAngle) * s * 0.5,
          );
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else if (lm.type === "ruins") {
        // MASSIVE ANCIENT COLISEUM with crumbling walls

        // Outer ring - collapsed arena walls
        ctx.fillStyle = "#5a5a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Sandy arena floor
        ctx.fillStyle = "#8a7a5a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.0, 0, Math.PI * 2);
        ctx.fill();

        // Crumbling wall sections - varying heights
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          const wallHeight = 0.15 + Math.sin(i * 2.7 + lm.rotation) * 0.1;
          const px = Math.cos(angle) * s * 1.15;
          const py = Math.sin(angle) * s * 1.15;

          // Skip some sections for "collapsed" look
          if (Math.sin(i * 3.14 + lm.rotation * 2) > 0.3) {
            ctx.fillStyle = "#7a7a6a";
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillRect(
              -s * 0.12,
              -s * wallHeight,
              s * 0.24,
              s * wallHeight * 2,
            );

            // Stone detail
            ctx.fillStyle = "#6a6a5a";
            ctx.fillRect(-s * 0.1, -s * wallHeight * 0.8, s * 0.2, s * 0.05);
            ctx.fillRect(-s * 0.1, -s * wallHeight * 0.4, s * 0.2, s * 0.05);
            ctx.restore();
          }
        }

        // Inner ring of broken pillars
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + 0.1;
          const pillarHeight = 0.2 + Math.sin(i * 1.5) * 0.15;
          const px = Math.cos(angle) * s * 0.7;
          const py = Math.sin(angle) * s * 0.7;

          // Some pillars are just stumps
          if (Math.cos(i * 2.1) > -0.5) {
            ctx.fillStyle = "#8a8a7a";
            ctx.save();
            ctx.translate(px, py);

            // Pillar shadow
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath();
            ctx.ellipse(5, 5, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();

            // Pillar
            ctx.fillStyle = "#9a9a8a";
            ctx.fillRect(
              -s * 0.05,
              -s * pillarHeight,
              s * 0.1,
              s * pillarHeight * 2,
            );

            // Broken top
            if (pillarHeight > 0.25) {
              ctx.fillStyle = "#7a7a6a";
              ctx.beginPath();
              ctx.moveTo(-s * 0.06, -s * pillarHeight);
              ctx.lineTo(s * 0.02, -s * pillarHeight - s * 0.05);
              ctx.lineTo(s * 0.06, -s * pillarHeight);
              ctx.closePath();
              ctx.fill();
            }
            ctx.restore();
          }
        }

        // Central altar with mysterious runes
        ctx.fillStyle = "#6a6a5a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Rune circle
        ctx.strokeStyle = "rgba(100,80,60,0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
        ctx.stroke();

        // Rune symbols
        ctx.fillStyle = "#4a4a3a";
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const rx = Math.cos(angle) * s * 0.12;
          const ry = Math.sin(angle) * s * 0.12;
          ctx.fillRect(rx - 4, ry - 8, 8, 16);
        }

        // Scattered rubble around the arena
        for (let i = 0; i < 15; i++) {
          const rx = Math.sin(i * 4.1 + lm.rotation) * 0.8 * s;
          const ry = Math.cos(i * 3.7 + lm.rotation) * 0.8 * s;
          const rubbleSize = 8 + Math.sin(i * 2.3) * 6;
          ctx.fillStyle = "#7a7a6a";
          ctx.beginPath();
          ctx.arc(rx, ry, rubbleSize, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (lm.type === "oasis") {
        // PARADISE OASIS with multiple pools, waterfalls, and lush vegetation

        // Outer sandy area
        ctx.fillStyle = "#c4a060";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Grass ring around water
        ctx.fillStyle = "#4a8a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Main lagoon - large irregular shape
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.9);
        gradient.addColorStop(0, "#2a8aaa");
        gradient.addColorStop(0.6, "#3a9aba");
        gradient.addColorStop(1, "#4aaaca");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.85, s * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();

        // Secondary pool
        ctx.fillStyle = "#3a9aba";
        ctx.beginPath();
        ctx.ellipse(
          -s * 0.5,
          -s * 0.4,
          s * 0.25,
          s * 0.18,
          -0.3,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        // Water shimmer effects
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        for (let i = 0; i < 5; i++) {
          const sx = Math.sin(time * 2 + i * 1.5) * 0.4 * s;
          const sy = Math.cos(time * 1.8 + i * 2.1) * 0.3 * s;
          ctx.beginPath();
          ctx.ellipse(sx, sy, s * 0.12, s * 0.06, time + i, 0, Math.PI * 2);
          ctx.fill();
        }

        // Small island in center
        ctx.fillStyle = "#5a9a5a";
        ctx.beginPath();
        ctx.ellipse(s * 0.15, s * 0.1, s * 0.2, s * 0.15, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Palm trees around the oasis (8 trees)
        const palmPositions = [
          [-0.9, -0.3],
          [-0.7, 0.6],
          [-0.3, -0.8],
          [0.2, -0.85],
          [0.8, -0.4],
          [0.9, 0.3],
          [0.5, 0.7],
          [-0.4, 0.75],
        ];
        for (const [px, py] of palmPositions) {
          const tx = px * s;
          const ty = py * s;

          // Tree shadow
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.beginPath();
          ctx.ellipse(tx + 15, ty + 10, 25, 15, 0.3, 0, Math.PI * 2);
          ctx.fill();

          // Trunk
          ctx.fillStyle = "#6a4a2a";
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(Math.sin(time * 0.5 + px * 3) * 0.05);
          ctx.fillRect(-6, -s * 0.25, 12, s * 0.25);

          // Fronds (leaves)
          ctx.fillStyle = "#3a7a3a";
          for (let f = 0; f < 7; f++) {
            const fAngle = (f / 7) * Math.PI * 2;
            ctx.save();
            ctx.translate(0, -s * 0.25);
            ctx.rotate(fAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(s * 0.1, -s * 0.08, s * 0.18, -s * 0.02);
            ctx.quadraticCurveTo(s * 0.1, s * 0.02, 0, 0);
            ctx.fill();
            ctx.restore();
          }
          ctx.restore();
        }

        // Central palm on island
        ctx.fillStyle = "#5a3a1a";
        ctx.fillRect(s * 0.13, s * 0.1 - s * 0.3, 14, s * 0.3);
        ctx.fillStyle = "#2a6a2a";
        ctx.beginPath();
        ctx.arc(s * 0.17, s * 0.1 - s * 0.32, s * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // Lily pads
        ctx.fillStyle = "#4a9a4a";
        for (let i = 0; i < 6; i++) {
          const lx = Math.sin(i * 2.3 + lm.rotation) * 0.5 * s;
          const ly = Math.cos(i * 1.9 + lm.rotation) * 0.35 * s;
          ctx.beginPath();
          ctx.arc(lx, ly, 12, 0, Math.PI * 1.8);
          ctx.fill();
        }
      } else if (lm.type === "monument") {
        // COLOSSAL PYRAMID with hieroglyphics and golden cap

        // Outer plaza
        ctx.fillStyle = "#a08050";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Stone pathway rings
        ctx.strokeStyle = "#806040";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2);
        ctx.stroke();

        // 4 sphinx statues at cardinal directions
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          const sx = Math.cos(angle) * s * 1.0;
          const sy = Math.sin(angle) * s * 1.0;

          ctx.fillStyle = "#8a7a5a";
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle + Math.PI / 2);

          // Sphinx body
          ctx.fillRect(-s * 0.12, -s * 0.05, s * 0.24, s * 0.1);
          // Sphinx head
          ctx.beginPath();
          ctx.arc(-s * 0.15, 0, s * 0.06, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Main pyramid base (bottom tier)
        ctx.fillStyle = "#9a8a6a";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9);
        ctx.lineTo(s * 0.7, s * 0.6);
        ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.closePath();
        ctx.fill();

        // Pyramid shading (left side darker)
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9);
        ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.lineTo(0, s * 0.3);
        ctx.closePath();
        ctx.fill();

        // Pyramid shading (right side lighter)
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9);
        ctx.lineTo(s * 0.7, s * 0.6);
        ctx.lineTo(0, s * 0.3);
        ctx.closePath();
        ctx.fill();

        // Stone block lines
        ctx.strokeStyle = "rgba(80,70,50,0.4)";
        ctx.lineWidth = 2;
        for (let row = 0; row < 8; row++) {
          const y = -s * 0.8 + row * s * 0.17;
          const widthAtRow = s * 0.08 + row * s * 0.08;
          ctx.beginPath();
          ctx.moveTo(-widthAtRow, y);
          ctx.lineTo(widthAtRow, y);
          ctx.stroke();
        }

        // Golden capstone at top
        ctx.shadowColor = "#ffdd00";
        ctx.shadowBlur = 30 * pulse;
        ctx.fillStyle = "#ffcc00";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.95);
        ctx.lineTo(s * 0.12, -s * 0.7);
        ctx.lineTo(-s * 0.12, -s * 0.7);
        ctx.closePath();
        ctx.fill();

        // Sun rays from capstone
        ctx.strokeStyle = "rgba(255,220,0," + 0.3 * pulse + ")";
        ctx.lineWidth = 3;
        for (let r = 0; r < 8; r++) {
          const rayAngle = (r / 8) * Math.PI * 2 + time * 0.2;
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.85);
          ctx.lineTo(
            Math.cos(rayAngle) * s * 0.25,
            -s * 0.85 + Math.sin(rayAngle) * s * 0.25,
          );
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Entrance at base
        ctx.fillStyle = "#3a3020";
        ctx.fillRect(-s * 0.08, s * 0.35, s * 0.16, s * 0.25);
        ctx.fillStyle = "#4a4030";
        ctx.fillRect(-s * 0.06, s * 0.37, s * 0.12, s * 0.2);
      } else if (lm.type === "campfire") {
        // VIKING ENCAMPMENT with multiple tents, campfire, and longship

        // Clearing
        ctx.fillStyle = "#5a6a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Dirt path around camp
        ctx.fillStyle = "#6a5a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // 5 Viking tents in a circle
        const tentPositions = [
          [0.65, -0.5, 0.3],
          [-0.7, -0.4, -0.4],
          [-0.6, 0.55, 0.2],
          [0.55, 0.6, -0.2],
          [0, -0.8, 0],
        ];
        for (const [tx, ty, rot] of tentPositions) {
          ctx.save();
          ctx.translate(tx * s, ty * s);
          ctx.rotate(rot);

          // Tent shadow
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.beginPath();
          ctx.ellipse(10, 8, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tent body
          ctx.fillStyle = "#8a7a5a";
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.2);
          ctx.lineTo(s * 0.15, s * 0.1);
          ctx.lineTo(-s * 0.15, s * 0.1);
          ctx.closePath();
          ctx.fill();

          // Tent entrance
          ctx.fillStyle = "#5a4a3a";
          ctx.beginPath();
          ctx.moveTo(0, s * 0.1);
          ctx.lineTo(s * 0.05, -s * 0.05);
          ctx.lineTo(-s * 0.05, -s * 0.05);
          ctx.closePath();
          ctx.fill();

          // Tent pole
          ctx.strokeStyle = "#4a3a2a";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.22);
          ctx.lineTo(0, -s * 0.28);
          ctx.stroke();
          ctx.restore();
        }

        // Central fire pit (larger)
        ctx.fillStyle = "#4a4a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Fire pit stones
        ctx.fillStyle = "#6a6a6a";
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const stoneX = Math.cos(angle) * s * 0.15;
          const stoneY = Math.sin(angle) * s * 0.15;
          ctx.beginPath();
          ctx.arc(stoneX, stoneY, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Logs in fire
        ctx.fillStyle = "#4a2a1a";
        ctx.save();
        ctx.rotate(0.3);
        ctx.fillRect(-s * 0.1, -4, s * 0.2, 8);
        ctx.restore();
        ctx.save();
        ctx.rotate(-0.4);
        ctx.fillRect(-s * 0.08, -4, s * 0.16, 8);
        ctx.restore();

        // ROARING FIRE with multiple layers
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 80 * pulse;

        // Outer flame glow
        ctx.fillStyle = "rgba(255,100,0,0.3)";
        ctx.beginPath();
        ctx.arc(0, -s * 0.05, s * 0.2 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Main flames
        for (let f = 0; f < 5; f++) {
          const flameOffset = Math.sin(time * 8 + f * 1.3) * s * 0.03;
          const flameHeight =
            s * (0.25 + Math.sin(time * 6 + f * 2) * 0.08) * pulse;

          ctx.fillStyle = f < 2 ? "#ff2200" : f < 4 ? "#ff6600" : "#ffaa00";
          ctx.beginPath();
          ctx.moveTo(flameOffset + (f - 2) * s * 0.04, s * 0.05);
          ctx.quadraticCurveTo(
            flameOffset + (f - 2) * s * 0.06,
            -flameHeight * 0.5,
            flameOffset + (f - 2) * s * 0.02,
            -flameHeight,
          );
          ctx.quadraticCurveTo(
            flameOffset + (f - 2) * s * 0.01,
            -flameHeight * 0.5,
            flameOffset + (f - 2) * s * 0.04 - s * 0.05,
            s * 0.05,
          );
          ctx.fill();
        }

        // Inner bright core
        ctx.fillStyle = "#ffffaa";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Sparks floating up
        for (let sp = 0; sp < 8; sp++) {
          const sparkY =
            -s * 0.1 - (((time * 50 + sp * 30) % 100) / 100) * s * 0.3;
          const sparkX = Math.sin(time * 3 + sp * 2) * s * 0.08;
          ctx.fillStyle =
            "rgba(255,200,100," +
            (1 - ((time * 50 + sp * 30) % 100) / 100) +
            ")";
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Weapon rack
        ctx.fillStyle = "#5a4a3a";
        ctx.fillRect(s * 0.3, -s * 0.15, s * 0.04, s * 0.3);
        ctx.fillRect(s * 0.38, -s * 0.15, s * 0.04, s * 0.3);
        ctx.fillRect(s * 0.28, -s * 0.12, s * 0.16, s * 0.04);
      } else if (lm.type === "racetrack") {
        // FULL NASCAR-STYLE OVAL with grandstands

        // Outer area (parking/grass)
        ctx.fillStyle = "#5a6a4a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Outer track barrier
        ctx.fillStyle = "#aaaaaa";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.15, s * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();

        // Track surface
        ctx.fillStyle = "#3a3a3a";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.05, s * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner barrier
        ctx.fillStyle = "#888888";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.65, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Infield grass
        ctx.fillStyle = "#4a7a4a";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.55, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Track lane markings
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.setLineDash([30, 20]);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.85, s * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Start/finish line
        ctx.fillStyle = "#ffffff";
        for (let sq = 0; sq < 8; sq++) {
          if (sq % 2 === 0) {
            ctx.fillRect(s * 0.65 + sq * 6, -s * 0.08, 6, s * 0.16);
          }
        }
        ctx.fillStyle = "#000000";
        for (let sq = 0; sq < 8; sq++) {
          if (sq % 2 === 1) {
            ctx.fillRect(s * 0.65 + sq * 6, -s * 0.08, 6, s * 0.16);
          }
        }

        // Grandstands (top and bottom)
        ctx.fillStyle = "#6a6a7a";
        ctx.fillRect(-s * 0.7, -s * 0.9, s * 1.4, s * 0.12);
        ctx.fillRect(-s * 0.7, s * 0.78, s * 1.4, s * 0.12);

        // Crowd (colored dots)
        const crowdColors = [
          "#ff4444",
          "#44ff44",
          "#4444ff",
          "#ffff44",
          "#ff44ff",
        ];
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 20; col++) {
            ctx.fillStyle = crowdColors[(row + col) % 5];
            ctx.beginPath();
            ctx.arc(
              -s * 0.65 + col * s * 0.065,
              -s * 0.87 + row * 4,
              3,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            ctx.beginPath();
            ctx.arc(
              -s * 0.65 + col * s * 0.065,
              s * 0.81 + row * 4,
              3,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }

        // Pit lane
        ctx.fillStyle = "#4a4a4a";
        ctx.fillRect(-s * 0.5, s * 0.58, s * 1.0, s * 0.1);

        // Pit crew boxes
        for (let pit = 0; pit < 6; pit++) {
          ctx.fillStyle = crowdColors[pit % 5];
          ctx.fillRect(-s * 0.45 + pit * s * 0.15, s * 0.55, s * 0.1, s * 0.04);
        }

        // Infield structures
        ctx.fillStyle = "#7a7a8a";
        ctx.fillRect(-s * 0.1, -s * 0.15, s * 0.2, s * 0.12);
        ctx.fillStyle = "#5a5a6a";
        ctx.fillRect(-s * 0.08, -s * 0.18, s * 0.16, s * 0.04);
      } else if (lm.type === "arena") {
        // GLADIATOR ARENA with seating tiers

        // Outer seating (3 tiers)
        ctx.fillStyle = "#7a6a5a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#8a7a6a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#9a8a7a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Arena floor
        ctx.fillStyle = "#b09060";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Sand texture pattern
        ctx.fillStyle = "rgba(150,120,80,0.3)";
        for (let i = 0; i < 20; i++) {
          const sandX = Math.sin(i * 3.7 + lm.rotation) * 0.5 * s;
          const sandY = Math.cos(i * 2.9 + lm.rotation) * 0.5 * s;
          ctx.beginPath();
          ctx.arc(sandX, sandY, 15 + Math.sin(i) * 10, 0, Math.PI * 2);
          ctx.fill();
        }

        // Entry gates (4 cardinal points)
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          ctx.save();
          ctx.rotate(angle);

          // Gate structure
          ctx.fillStyle = "#5a4a3a";
          ctx.fillRect(s * 0.65, -s * 0.1, s * 0.25, s * 0.2);

          // Gate arch
          ctx.fillStyle = "#3a2a1a";
          ctx.beginPath();
          ctx.arc(s * 0.77, 0, s * 0.08, 0, Math.PI * 2);
          ctx.fill();

          // Gate bars
          ctx.strokeStyle = "#2a2a2a";
          ctx.lineWidth = 3;
          for (let bar = 0; bar < 5; bar++) {
            ctx.beginPath();
            ctx.moveTo(s * 0.69 + bar * 4, -s * 0.06);
            ctx.lineTo(s * 0.69 + bar * 4, s * 0.06);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Tier dividers (seats)
        ctx.strokeStyle = "#6a5a4a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        ctx.stroke();

        // Spectators (dots in tiers)
        for (let tier = 0; tier < 3; tier++) {
          const tierRadius = s * (0.85 + tier * 0.15);
          const numSpecs = 24 + tier * 8;
          for (let sp = 0; sp < numSpecs; sp++) {
            const angle = (sp / numSpecs) * Math.PI * 2;
            const specX = Math.cos(angle) * tierRadius;
            const specY = Math.sin(angle) * tierRadius;
            ctx.fillStyle = ["#aa6666", "#66aa66", "#6666aa", "#aaaa66"][
              (sp + tier) % 4
            ];
            ctx.beginPath();
            ctx.arc(specX, specY, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Central combat platform
        ctx.fillStyle = "#8a7050";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Combat circle markings
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
        ctx.stroke();

        // Weapons on ground
        ctx.fillStyle = "#888888";
        ctx.save();
        ctx.rotate(0.5);
        ctx.fillRect(-s * 0.25, -3, s * 0.15, 6);
        ctx.fillRect(-s * 0.22, -8, 12, 6);
        ctx.restore();
        ctx.save();
        ctx.rotate(-0.7);
        ctx.fillRect(s * 0.15, -2, s * 0.12, 4);
        ctx.restore();
      } else if (lm.type === "crystals") {
        // MASSIVE CRYSTAL CAVERN with multiple formations

        // Dark cavern base
        ctx.fillStyle = "#2a1a2a";
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Purple glow around cavern
        const cavGrad = ctx.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 1.3);
        cavGrad.addColorStop(0, "rgba(100,50,150,0.3)");
        cavGrad.addColorStop(1, "rgba(50,25,75,0)");
        ctx.fillStyle = cavGrad;
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Rocky ground texture
        ctx.fillStyle = "#3a2a3a";
        for (let i = 0; i < 25; i++) {
          const rx = Math.sin(i * 4.3 + lm.rotation) * 0.9 * s;
          const ry = Math.cos(i * 3.1 + lm.rotation) * 0.9 * s;
          ctx.beginPath();
          ctx.arc(rx, ry, 15 + Math.sin(i * 2) * 10, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ring of smaller crystals
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 + lm.rotation;
          const cx = Math.cos(angle) * s * 0.85;
          const cy = Math.sin(angle) * s * 0.85;
          const cHeight = s * (0.15 + Math.sin(i * 1.7) * 0.08);
          const crystalPulse = 0.9 + Math.sin(time * 4 + i * 0.8) * 0.1;

          ctx.shadowColor = "#aa44ff";
          ctx.shadowBlur = 15 * crystalPulse;
          ctx.fillStyle = ["#8833cc", "#9944dd", "#7722bb"][i % 3];

          ctx.beginPath();
          ctx.moveTo(cx, cy - cHeight * crystalPulse);
          ctx.lineTo(cx + s * 0.04, cy + cHeight * 0.2);
          ctx.lineTo(cx - s * 0.04, cy + cHeight * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Central crystal cluster (massive)
        const mainCrystals = [
          [0, 0, 0.6, "#aa55ff", 0],
          [-0.2, 0.1, 0.45, "#8833dd", -0.3],
          [0.22, 0.08, 0.5, "#9944ee", 0.25],
          [-0.12, -0.15, 0.35, "#7722cc", 0.15],
          [0.15, -0.12, 0.4, "#bb66ff", -0.2],
          [-0.25, -0.05, 0.3, "#6611aa", 0.4],
          [0.28, -0.02, 0.32, "#cc77ff", -0.35],
        ];

        for (const [ox, oy, height, color, tilt] of mainCrystals) {
          const crystalPulse =
            0.9 + Math.sin(time * 3 + (ox as number) * 10) * 0.1;

          ctx.save();
          ctx.translate((ox as number) * s, (oy as number) * s);
          ctx.rotate(tilt as number);

          ctx.shadowColor = color as string;
          ctx.shadowBlur = 40 * crystalPulse;

          // Crystal body
          ctx.fillStyle = color as string;
          ctx.beginPath();
          ctx.moveTo(0, -(height as number) * s * crystalPulse);
          ctx.lineTo(s * 0.08, s * 0.1);
          ctx.lineTo(-s * 0.08, s * 0.1);
          ctx.closePath();
          ctx.fill();

          // Crystal facet (lighter side)
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.beginPath();
          ctx.moveTo(0, -(height as number) * s * crystalPulse);
          ctx.lineTo(s * 0.08, s * 0.1);
          ctx.lineTo(s * 0.02, s * 0.05);
          ctx.lineTo(0, -(height as number) * s * 0.8 * crystalPulse);
          ctx.closePath();
          ctx.fill();

          ctx.restore();
        }
        ctx.shadowBlur = 0;

        // Energy tendrils between crystals
        ctx.strokeStyle =
          "rgba(170,100,255," + (0.4 + Math.sin(time * 5) * 0.2) + ")";
        ctx.lineWidth = 2;
        for (let t = 0; t < 5; t++) {
          const startAngle = time * 0.5 + t * 1.2;
          const endAngle = startAngle + Math.PI * 0.6;
          ctx.beginPath();
          ctx.moveTo(
            Math.cos(startAngle) * s * 0.15,
            Math.sin(startAngle) * s * 0.15,
          );
          ctx.quadraticCurveTo(
            Math.cos(startAngle + 0.5) * s * 0.3,
            Math.sin(startAngle + 0.5) * s * 0.3,
            Math.cos(endAngle) * s * 0.2,
            Math.sin(endAngle) * s * 0.2,
          );
          ctx.stroke();
        }

        // Floating crystal shards
        for (let sh = 0; sh < 8; sh++) {
          const shardY = -s * 0.3 - Math.sin(time * 2 + sh * 1.5) * s * 0.1;
          const shardX = Math.cos(time * 0.5 + (sh * Math.PI) / 4) * s * 0.4;
          const shardSize = 8 + Math.sin(sh) * 4;

          ctx.shadowColor = "#cc88ff";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#bb77ff";
          ctx.beginPath();
          ctx.moveTo(shardX, shardY - shardSize);
          ctx.lineTo(shardX + shardSize * 0.4, shardY);
          ctx.lineTo(shardX - shardSize * 0.4, shardY);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();
    }

    // Draw rocks with ambient occlusion and highlights
    for (const rock of chunk.rocks) {
      if (Math.abs(rock.x - camera.x) > w / 2 + rock.radius * 2) continue;
      if (Math.abs(rock.y - camera.y) > h / 2 + rock.radius * 2) continue;

      ctx.save();
      ctx.translate(rock.x, rock.y);
      ctx.rotate(rock.rotation);

      // Ambient occlusion ring
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(
        0,
        2,
        rock.radius * 1.1,
        rock.radius * 0.85,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(
        5,
        6,
        rock.radius * 0.85,
        rock.radius * 0.65,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Extruded base (darker)
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      if (rock.variant === 0) {
        ctx.moveTo(rock.radius * 0.8 + 2, 3);
        ctx.lineTo(rock.radius * 0.5 + 2, rock.radius * 0.7 + 3);
        ctx.lineTo(-rock.radius * 0.3 + 2, rock.radius * 0.9 + 3);
        ctx.lineTo(-rock.radius * 0.9 + 2, rock.radius * 0.2 + 3);
        ctx.lineTo(-rock.radius * 0.7 + 2, -rock.radius * 0.5 + 3);
        ctx.lineTo(2, -rock.radius * 0.85 + 3);
        ctx.lineTo(rock.radius * 0.6 + 2, -rock.radius * 0.4 + 3);
      } else if (rock.variant === 1) {
        ctx.ellipse(
          2,
          3,
          rock.radius * 0.9,
          rock.radius * 0.7,
          0,
          0,
          Math.PI * 2,
        );
      } else {
        ctx.arc(2, 3, rock.radius * 0.85, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();

      // Rock shape
      ctx.fillStyle = rock.color;
      ctx.beginPath();
      if (rock.variant === 0) {
        ctx.moveTo(rock.radius * 0.8, 0);
        ctx.lineTo(rock.radius * 0.5, rock.radius * 0.7);
        ctx.lineTo(-rock.radius * 0.3, rock.radius * 0.9);
        ctx.lineTo(-rock.radius * 0.9, rock.radius * 0.2);
        ctx.lineTo(-rock.radius * 0.7, -rock.radius * 0.5);
        ctx.lineTo(0, -rock.radius * 0.85);
        ctx.lineTo(rock.radius * 0.6, -rock.radius * 0.4);
      } else if (rock.variant === 1) {
        ctx.ellipse(
          0,
          0,
          rock.radius * 0.9,
          rock.radius * 0.7,
          0,
          0,
          Math.PI * 2,
        );
      } else {
        ctx.arc(0, 0, rock.radius * 0.85, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();

      // Bright highlight spot
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(
        -rock.radius * 0.25,
        -rock.radius * 0.3,
        rock.radius * 0.25,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      // Secondary smaller highlight
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(
        -rock.radius * 0.1,
        -rock.radius * 0.15,
        rock.radius * 0.12,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.restore();
    }
  }
}

function drawSkidMarks(): void {
  for (const mark of skidMarks) {
    if (Math.abs(mark.x - camera.x) > w / 2 + 50) continue;
    if (Math.abs(mark.y - camera.y) > h / 2 + 50) continue;

    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.angle);

    if (mark.isTank) {
      // Tank: chunky tread marks with pattern
      ctx.fillStyle = "rgba(30, 30, 30, " + mark.alpha + ")";
      const halfW = mark.width / 2;
      const halfL = mark.length / 2;
      ctx.fillRect(-halfW, -halfL, mark.width, mark.length);
      // Add tread pattern
      ctx.fillStyle = "rgba(70, 70, 70, " + mark.alpha * 0.6 + ")";
      for (let i = -halfL + 3; i < halfL; i += 8) {
        ctx.fillRect(-halfW + 2, i, mark.width - 4, 3);
      }
    } else {
      // Cars: smooth solid rubber lines
      ctx.strokeStyle = "rgba(25, 25, 25, " + mark.alpha + ")";
      ctx.lineWidth = mark.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -mark.length / 2);
      ctx.lineTo(0, mark.length / 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawDriftSmoke(): void {
  for (const smoke of driftSmoke) {
    if (Math.abs(smoke.x - camera.x) > w / 2 + smoke.size) continue;
    if (Math.abs(smoke.y - camera.y) > h / 2 + smoke.size) continue;
    ctx.globalAlpha = smoke.alpha;
    ctx.fillStyle = "rgba(180, 160, 140, 0.8)";
    ctx.beginPath();
    ctx.arc(smoke.x, smoke.y, smoke.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVehicleShape(
  c: CanvasRenderingContext2D,
  vehicle: VehicleType,
  w2: number,
  h2: number,
  isBraking: boolean = false,
): void {
  const bodyGrad = c.createLinearGradient(-w2 / 2, 0, w2 / 2, 0);
  bodyGrad.addColorStop(0, vehicle.colors.dark);
  bodyGrad.addColorStop(0.5, vehicle.colors.main);
  bodyGrad.addColorStop(1, vehicle.colors.dark);

  const extH = 5;

  // Ground shadow for all vehicles
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.beginPath();
  c.ellipse(3, 6, w2 * 0.52, h2 * 0.38, 0, 0, Math.PI * 2);
  c.fill();

  // Extruded side (dark underside visible below body)
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.roundRect(-w2 / 2 + 2, -h2 / 2 + extH, w2, h2, 8);
  c.fill();

  if (vehicle.id === "sedan") {
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.roundRect(-w2 / 2, -h2 / 2, w2, h2, 8);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.4)";
    c.lineWidth = 1.5;
    c.stroke();

    // Cabin
    c.fillStyle = vehicle.colors.dark;
    c.beginPath();
    c.roundRect(-w2 * 0.35, -h2 * 0.2, w2 * 0.7, h2 * 0.4, 5);
    c.fill();

    // Windshield
    c.fillStyle = "#88ddff";
    c.beginPath();
    c.roundRect(-w2 * 0.28, -h2 * 0.18, w2 * 0.56, h2 * 0.12, 3);
    c.fill();
  } else if (vehicle.id === "sports") {
    // Low sleek sports car
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.moveTo(-w2 / 2 + 4, h2 / 2 + 2);
    c.lineTo(-w2 * 0.35 + 4, -h2 / 2 + 2);
    c.lineTo(w2 * 0.35 + 4, -h2 / 2 + 2);
    c.lineTo(w2 / 2 + 4, h2 / 2 + 2);
    c.closePath();
    c.fill();

    c.fillStyle = bodyGrad;
    c.beginPath();
    c.moveTo(-w2 / 2, h2 / 2);
    c.lineTo(-w2 * 0.35, -h2 / 2);
    c.lineTo(w2 * 0.35, -h2 / 2);
    c.lineTo(w2 / 2, h2 / 2);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.stroke();

    // Racing stripe
    c.fillStyle = vehicle.colors.accent;
    c.fillRect(-2, -h2 / 2, 4, h2);

    // Tiny cabin
    c.fillStyle = "#222";
    c.beginPath();
    c.roundRect(-w2 * 0.25, -h2 * 0.1, w2 * 0.5, h2 * 0.35, 4);
    c.fill();

    // Windshield
    c.fillStyle = "#66ccff";
    c.beginPath();
    c.roundRect(-w2 * 0.2, -h2 * 0.05, w2 * 0.4, h2 * 0.12, 2);
    c.fill();
  } else if (vehicle.id === "muscle") {
    // Big chunky muscle car
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.roundRect(-w2 / 2 + 4, -h2 / 2 + 4, w2, h2, 6);
    c.fill();

    c.fillStyle = bodyGrad;
    c.beginPath();
    c.roundRect(-w2 / 2, -h2 / 2, w2, h2, 6);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.stroke();

    // Hood bulge
    c.fillStyle = vehicle.colors.dark;
    c.beginPath();
    c.roundRect(-w2 * 0.3, -h2 * 0.45, w2 * 0.6, h2 * 0.25, 4);
    c.fill();

    // Hood scoop
    c.fillStyle = "#111";
    c.fillRect(-w2 * 0.15, -h2 * 0.42, w2 * 0.3, h2 * 0.08);

    // Accent stripes
    c.fillStyle = vehicle.colors.accent;
    c.fillRect(-w2 * 0.42, -h2 / 2, 6, h2);
    c.fillRect(w2 * 0.42 - 6, -h2 / 2, 6, h2);

    // Cabin
    c.fillStyle = "#1a1a1a";
    c.beginPath();
    c.roundRect(-w2 * 0.32, -h2 * 0.12, w2 * 0.64, h2 * 0.4, 4);
    c.fill();
  } else if (vehicle.id === "buggy") {
    // Small dune buggy with visible wheels
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.roundRect(-w2 / 2 + 3, -h2 / 2 + 3, w2, h2, 10);
    c.fill();

    // Wheels (visible)
    c.fillStyle = "#222";
    c.beginPath();
    c.ellipse(-w2 * 0.4, -h2 * 0.35, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(w2 * 0.4, -h2 * 0.35, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(-w2 * 0.4, h2 * 0.35, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(w2 * 0.4, h2 * 0.35, 8, 10, 0, 0, Math.PI * 2);
    c.fill();

    // Body
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.roundRect(-w2 * 0.35, -h2 * 0.4, w2 * 0.7, h2 * 0.8, 8);
    c.fill();
    c.strokeStyle = vehicle.colors.dark;
    c.lineWidth = 2;
    c.stroke();

    // Roll cage
    c.strokeStyle = "#333";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-w2 * 0.25, -h2 * 0.35);
    c.lineTo(-w2 * 0.25, h2 * 0.2);
    c.moveTo(w2 * 0.25, -h2 * 0.35);
    c.lineTo(w2 * 0.25, h2 * 0.2);
    c.moveTo(-w2 * 0.25, -h2 * 0.1);
    c.lineTo(w2 * 0.25, -h2 * 0.1);
    c.stroke();
  } else if (vehicle.id === "tank") {
    // TANK!
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath();
    c.roundRect(-w2 / 2 + 5, -h2 / 2 + 5, w2, h2, 4);
    c.fill();

    // Treads
    c.fillStyle = "#222";
    c.fillRect(-w2 / 2, -h2 / 2, w2 * 0.22, h2);
    c.fillRect(w2 / 2 - w2 * 0.22, -h2 / 2, w2 * 0.22, h2);

    // Tread detail
    c.strokeStyle = "#111";
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const ty = -h2 / 2 + i * (h2 / 7);
      c.beginPath();
      c.moveTo(-w2 / 2, ty);
      c.lineTo(-w2 / 2 + w2 * 0.22, ty);
      c.stroke();
      c.beginPath();
      c.moveTo(w2 / 2, ty);
      c.lineTo(w2 / 2 - w2 * 0.22, ty);
      c.stroke();
    }

    // Main body
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.roundRect(-w2 * 0.35, -h2 * 0.42, w2 * 0.7, h2 * 0.84, 4);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.stroke();

    // Turret
    c.fillStyle = vehicle.colors.dark;
    c.beginPath();
    c.arc(0, h2 * 0.05, w2 * 0.25, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#222";
    c.lineWidth = 2;
    c.stroke();

    // Cannon
    c.fillStyle = "#333";
    c.fillRect(-4, -h2 * 0.55, 8, h2 * 0.45);
    c.fillStyle = "#222";
    c.beginPath();
    c.arc(0, -h2 * 0.55, 5, 0, Math.PI * 2);
    c.fill();

    // Hatch
    c.fillStyle = vehicle.colors.accent;
    c.beginPath();
    c.arc(0, h2 * 0.05, 6, 0, Math.PI * 2);
    c.fill();
  } else if (vehicle.id === "hotrod") {
    // Hot rod with flames
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.roundRect(-w2 / 2 + 4, -h2 / 2 + 4, w2, h2, 6);
    c.fill();

    // Exposed engine at front
    c.fillStyle = "#333";
    c.fillRect(-w2 * 0.3, -h2 * 0.52, w2 * 0.6, h2 * 0.15);
    // Engine details
    c.fillStyle = "#666";
    c.fillRect(-w2 * 0.25, -h2 * 0.5, w2 * 0.12, h2 * 0.1);
    c.fillRect(w2 * 0.25 - w2 * 0.12, -h2 * 0.5, w2 * 0.12, h2 * 0.1);

    // Body
    c.fillStyle = bodyGrad;
    c.beginPath();
    c.roundRect(-w2 / 2, -h2 * 0.38, w2, h2 * 0.88, 6);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.stroke();

    // Flame decals
    c.fillStyle = vehicle.colors.accent;
    for (let i = 0; i < 3; i++) {
      const fy = -h2 * 0.25 + i * h2 * 0.15;
      c.beginPath();
      c.moveTo(-w2 / 2 + 2, fy);
      c.lineTo(-w2 * 0.2, fy - 5);
      c.lineTo(-w2 * 0.1, fy + 3);
      c.lineTo(-w2 / 2 + 2, fy + 6);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(w2 / 2 - 2, fy);
      c.lineTo(w2 * 0.2, fy - 5);
      c.lineTo(w2 * 0.1, fy + 3);
      c.lineTo(w2 / 2 - 2, fy + 6);
      c.closePath();
      c.fill();
    }

    // Cabin
    c.fillStyle = "#111";
    c.beginPath();
    c.roundRect(-w2 * 0.28, -h2 * 0.05, w2 * 0.56, h2 * 0.35, 4);
    c.fill();
  }

  // Rim highlight (top edge)
  const rimGrad = c.createLinearGradient(-w2 / 2, -h2 / 2, w2 / 2, -h2 / 2);
  rimGrad.addColorStop(0, "rgba(255,255,255,0)");
  rimGrad.addColorStop(0.3, "rgba(255,255,255,0.35)");
  rimGrad.addColorStop(0.7, "rgba(255,255,255,0.35)");
  rimGrad.addColorStop(1, "rgba(255,255,255,0)");
  c.strokeStyle = rimGrad;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-w2 * 0.35, -h2 / 2 + 2);
  c.lineTo(w2 * 0.35, -h2 / 2 + 2);
  c.stroke();

  // Headlights with glow
  c.fillStyle = "#fff";
  c.shadowColor = "#ffffaa";
  c.shadowBlur = 10;
  c.beginPath();
  c.ellipse(-w2 * 0.3, -h2 / 2 + 6, 4, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(w2 * 0.3, -h2 / 2 + 6, 4, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;

  // Tail lights
  c.fillStyle = isBraking ? "#ff0000" : "#880000";
  if (isBraking) {
    c.shadowBlur = 14;
    c.shadowColor = "#ff0000";
  }
  c.fillRect(-w2 * 0.38, h2 / 2 - 5, 7, 4);
  c.fillRect(w2 * 0.38 - 7, h2 / 2 - 5, 7, 4);
  c.shadowBlur = 0;
}

function drawPlayerCar(): void {
  if (!player) return;

  const vehicle = getSelectedVehicle();

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle + Math.PI / 2 + player.driftAngle);

  const w2 = player.width;
  const h2 = player.height;
  const isBraking = player.speed > 0 && input.down;

  drawVehicleShape(ctx, vehicle, w2, h2, isBraking);

  ctx.restore();
}

function drawPoliceCar(police: PoliceCar): void {
  if (Math.abs(police.x - camera.x) > w / 2 + 80) return;
  if (Math.abs(police.y - camera.y) > h / 2 + 80) return;

  ctx.save();
  ctx.translate(police.x, police.y);
  ctx.rotate(police.angle + Math.PI / 2);

  const w2 = police.width;
  const h2 = police.height;

  const lightPhase = (gameTime * 0.015 + police.lightPhase) % (Math.PI * 2);
  const isRed = Math.sin(lightPhase) > 0;

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(3, 7, w2 * 0.55, h2 * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Extruded underside
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(-w2 / 2 + 2, -h2 / 2 + 5, w2, h2, 8);
  ctx.fill();

  if (police.enemyType === "interceptor") {
    // Sleek black body with gold stripe
    const intGrad = ctx.createLinearGradient(-w2 / 2, 0, w2 / 2, 0);
    intGrad.addColorStop(0, "#111");
    intGrad.addColorStop(0.5, "#222");
    intGrad.addColorStop(1, "#111");
    ctx.fillStyle = intGrad;
    ctx.beginPath();
    ctx.moveTo(-w2 / 2, h2 * 0.4);
    ctx.lineTo(-w2 * 0.35, -h2 / 2);
    ctx.lineTo(w2 * 0.35, -h2 / 2);
    ctx.lineTo(w2 / 2, h2 * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gold racing stripe
    ctx.fillStyle = "#d4a020";
    ctx.fillRect(-2.5, -h2 / 2, 5, h2 * 0.9);

    // Windshield
    const wsGrad = ctx.createLinearGradient(
      -w2 * 0.2,
      -h2 * 0.15,
      w2 * 0.2,
      -h2 * 0.05,
    );
    wsGrad.addColorStop(0, "#446688");
    wsGrad.addColorStop(1, "#223344");
    ctx.fillStyle = wsGrad;
    ctx.beginPath();
    ctx.roundRect(-w2 * 0.22, -h2 * 0.15, w2 * 0.44, h2 * 0.15, 3);
    ctx.fill();

    // Amber warning lights
    ctx.fillStyle = "#222";
    ctx.fillRect(-w2 * 0.2, -h2 * 0.02, w2 * 0.4, h2 * 0.06);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#ffaa00";
    ctx.fillStyle = isRed ? "#ffaa00" : "#664400";
    ctx.beginPath();
    ctx.arc(-w2 * 0.1, h2 * 0.01, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isRed ? "#664400" : "#ffaa00";
    ctx.beginPath();
    ctx.arc(w2 * 0.1, h2 * 0.01, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (police.enemyType === "swat") {
    // Wide armored SWAT van
    ctx.fillStyle = "#2a3a2a";
    ctx.beginPath();
    ctx.roundRect(-w2 / 2, -h2 / 2, w2, h2, 5);
    ctx.fill();
    ctx.strokeStyle = "#1a2a1a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Armored panels
    ctx.fillStyle = "#3a4a3a";
    ctx.fillRect(-w2 / 2 + 3, -h2 * 0.4, w2 - 6, h2 * 0.3);
    ctx.fillRect(-w2 / 2 + 3, h2 * 0.1, w2 - 6, h2 * 0.3);

    // Reinforced bumper
    ctx.fillStyle = "#444";
    ctx.fillRect(-w2 * 0.45, -h2 / 2, w2 * 0.9, h2 * 0.08);
    ctx.fillRect(-w2 * 0.45, h2 / 2 - h2 * 0.06, w2 * 0.9, h2 * 0.06);

    // Windshield (small, armored)
    ctx.fillStyle = "#2a3a4a";
    ctx.beginPath();
    ctx.roundRect(-w2 * 0.3, -h2 * 0.28, w2 * 0.6, h2 * 0.14, 3);
    ctx.fill();

    // Roof spotlight
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(0, 0, w2 * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 20;
    ctx.shadowColor = isRed ? "#ff2244" : "#2244ff";
    ctx.fillStyle = isRed ? "#ff2244" : "#2244ff";
    ctx.beginPath();
    ctx.arc(0, 0, w2 * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Damage indicator
    if (police.health < ENEMY_STATS.swat.health) {
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w2 * 0.3, -h2 * 0.15);
      ctx.lineTo(-w2 * 0.1, h2 * 0.1);
      ctx.moveTo(w2 * 0.2, -h2 * 0.2);
      ctx.lineTo(w2 * 0.05, h2 * 0.05);
      ctx.stroke();
    }
  } else {
    // Patrol car (default)
    ctx.fillStyle = COLORS.policeCar;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w2 / 2, -h2 / 2, w2, h2, 8);
    ctx.fill();
    ctx.stroke();

    // White stripe
    ctx.fillStyle = COLORS.policeWhite;
    ctx.fillRect(-w2 / 2 + 3, -h2 * 0.05, w2 - 6, h2 * 0.1);

    // Windshield with reflection
    const wsGrad = ctx.createLinearGradient(
      -w2 * 0.3,
      -h2 * 0.34,
      w2 * 0.3,
      -h2 * 0.12,
    );
    wsGrad.addColorStop(0, "#445566");
    wsGrad.addColorStop(1, "#223344");
    ctx.fillStyle = wsGrad;
    ctx.beginPath();
    ctx.roundRect(-w2 * 0.32, -h2 * 0.34, w2 * 0.64, h2 * 0.22, 4);
    ctx.fill();

    // Light bar
    ctx.fillStyle = "#222";
    ctx.fillRect(-w2 * 0.28, -h2 * 0.12, w2 * 0.56, h2 * 0.1);

    ctx.shadowBlur = 15;
    if (isRed) {
      ctx.shadowColor = COLORS.policeLight1;
      ctx.fillStyle = COLORS.policeLight1;
      ctx.beginPath();
      ctx.arc(-w2 * 0.14, -h2 * 0.07, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = COLORS.policeLight2;
      ctx.fillStyle = COLORS.policeLight2;
      ctx.beginPath();
      ctx.arc(w2 * 0.14, -h2 * 0.07, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w2 * 0.3, -h2 / 2 + 2);
  ctx.lineTo(w2 * 0.3, -h2 / 2 + 2);
  ctx.stroke();

  // Headlights
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#ffffaa";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(-w2 * 0.25, -h2 / 2 + 6, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w2 * 0.25, -h2 / 2 + 6, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawExplosions(): void {
  for (const explosion of explosions) {
    if (Math.abs(explosion.x - camera.x) > w / 2 + 120) continue;
    if (Math.abs(explosion.y - camera.y) > h / 2 + 120) continue;

    const progress = explosion.time / explosion.maxTime;

    if (progress < 0.2) {
      const flashSize = 70 * (1 - progress / 0.2);
      const gradient = ctx.createRadialGradient(
        explosion.x,
        explosion.y,
        0,
        explosion.x,
        explosion.y,
        flashSize,
      );
      gradient.addColorStop(
        0,
        "rgba(255, 255, 255, " + (1 - progress * 5) + ")",
      );
      gradient.addColorStop(
        0.5,
        "rgba(255, 200, 50, " + (0.8 - progress * 4) + ")",
      );
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, flashSize, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of explosion.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const d of explosion.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (progress < 0.4) {
      ctx.save();
      ctx.translate(explosion.x, explosion.y - 45);
      const scale = 1 + progress * 2.5;
      ctx.scale(scale, scale);
      ctx.globalAlpha = 1 - progress * 2.5;
      ctx.font = "bold 26px Bangers, cursive";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 3;
      ctx.strokeText("CRASH!", 0, 0);
      ctx.fillStyle = "#ffcc00";
      ctx.fillText("CRASH!", 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawScorePopups(): void {
  for (const popup of scorePopups) {
    const screenX = popup.worldX - camera.x + w / 2;
    const screenY = popup.worldY - camera.y + h / 2 - popup.time * 0.06;
    const progress = popup.time / 1200;
    const scale = 1 + progress * 0.35;
    const alpha = 1 - progress;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(screenX, screenY);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = "bold 30px Bangers, cursive";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(popup.text, 0, 0);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawJoystick(): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(joystick.startX, joystick.startY, 65, 0, Math.PI * 2);
  ctx.stroke();

  const dx = joystick.currentX - joystick.startX;
  const dy = joystick.currentY - joystick.startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = 55;
  const clampedDist = Math.min(dist, maxDist);
  const angle = Math.atan2(dy, dx);
  const knobX = joystick.startX + Math.cos(angle) * clampedDist;
  const knobY = joystick.startY + Math.sin(angle) * clampedDist;

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.arc(knobX, knobY, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawComboIndicator(): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const comboProgress = Math.min(1, (gameTime - lastCrashTime) / COMBO_TIMEOUT);
  const barWidth = 150;
  const barHeight = 7;
  const x = w / 2 - barWidth / 2;
  // Position below the timer - adjust for mobile safe area
  const y = isMobile ? 190 : 80;

  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);

  const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
  gradient.addColorStop(0, "#ff6b35");
  gradient.addColorStop(0.5, "#ffcc00");
  gradient.addColorStop(1, "#00ffcc");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, barWidth * (1 - comboProgress), barHeight);

  ctx.font = "bold 17px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("COMBO x" + combo, w / 2, y + 24);

  ctx.restore();
}

function refreshMinimapTerrainCache(mapSize: number, scale: number): void {
  const now = performance.now();
  const needsResize =
    !minimapTerrainCanvas ||
    minimapTerrainCanvas.width !== mapSize ||
    minimapTerrainCanvas.height !== mapSize;
  const movedFar =
    Math.abs(player.x - lastMinimapCenterX) > MINIMAP_MOVE_REFRESH_DISTANCE ||
    Math.abs(player.y - lastMinimapCenterY) > MINIMAP_MOVE_REFRESH_DISTANCE;
  const stale = now - lastMinimapTerrainRender > MINIMAP_REFRESH_MS;

  if (!needsResize && !movedFar && !stale) {
    return;
  }

  if (needsResize || !minimapTerrainCanvas || !minimapTerrainCtx) {
    minimapTerrainCanvas = createCanvasElement(mapSize, mapSize);
    minimapTerrainCtx = minimapTerrainCanvas.getContext("2d")!;
  }

  const c = minimapTerrainCtx!;
  c.clearRect(0, 0, mapSize, mapSize);

  for (const chunk of loadedChunks) {
    const chunkCenterX = chunk.cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const chunkCenterY = chunk.cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    const relX = chunkCenterX - player.x;
    const relY = chunkCenterY - player.y;
    const colors = BIOME_COLORS[chunk.biome];
    const px = mapSize / 2 + relX * scale;
    const py = mapSize / 2 + relY * scale;
    const chunkSize = CHUNK_SIZE * scale;

    c.fillStyle = colors.ground2;
    c.fillRect(px - chunkSize / 2, py - chunkSize / 2, chunkSize, chunkSize);

    c.strokeStyle = colors.road;
    c.lineWidth = 2;
    for (const road of chunk.roadSegments) {
      c.beginPath();
      c.moveTo(
        mapSize / 2 + (road.x1 - player.x) * scale,
        mapSize / 2 + (road.y1 - player.y) * scale,
      );
      c.lineTo(
        mapSize / 2 + (road.x2 - player.x) * scale,
        mapSize / 2 + (road.y2 - player.y) * scale,
      );
      c.stroke();
    }

    c.fillStyle = colors.water;
    for (const lake of chunk.lakes) {
      c.beginPath();
      c.ellipse(
        mapSize / 2 + (lake.x - player.x) * scale,
        mapSize / 2 + (lake.y - player.y) * scale,
        lake.radiusX * scale,
        lake.radiusY * scale,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }

  lastMinimapTerrainRender = now;
  lastMinimapCenterX = player.x;
  lastMinimapCenterY = player.y;
}

function drawMinimap(): void {
  if (!player) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const mapSize = isMobile ? 100 : 140;
  const mapX = w - mapSize - 15;
  const mapY = isMobile ? 185 : 95;
  const viewRadius = CHUNK_SIZE * 3; // How much world to show
  const scale = mapSize / (viewRadius * 2);

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.arc(
    mapX + mapSize / 2,
    mapY + mapSize / 2,
    mapSize / 2 + 3,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Clip to circle
  ctx.beginPath();
  ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize / 2, 0, Math.PI * 2);
  ctx.clip();

  refreshMinimapTerrainCache(mapSize, scale);
  if (minimapTerrainCanvas) {
    ctx.drawImage(minimapTerrainCanvas, mapX, mapY);
  }

  // Police dots
  ctx.fillStyle = COLORS.policeLight1;
  for (const p of policeCars) {
    const px = mapX + mapSize / 2 + (p.x - player.x) * scale;
    const py = mapY + mapSize / 2 + (p.y - player.y) * scale;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player dot (center, with glow)
  ctx.shadowColor = COLORS.playerCar;
  ctx.shadowBlur = 6;
  ctx.fillStyle = COLORS.playerCar;
  const playerDotX = mapX + mapSize / 2;
  const playerDotY = mapY + mapSize / 2;
  ctx.beginPath();
  ctx.arc(playerDotX, playerDotY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Direction indicator
  ctx.strokeStyle = COLORS.playerCar;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playerDotX, playerDotY);
  ctx.lineTo(
    playerDotX + Math.cos(player.angle) * 12,
    playerDotY + Math.sin(player.angle) * 12,
  );
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// COIN RENDERING
// ============================================================================

function drawWorldCoins(): void {
  const now = performance.now();
  for (const coin of loadedCoins) {
    if (
      Math.abs(coin.x - camera.x) > w / 2 + COIN_SIZE * 3 ||
      Math.abs(coin.y - camera.y) > h / 2 + COIN_SIZE * 3
    ) {
      continue;
    }

    if (coin.collected) {
      const elapsed = now - coin.collectTime;
      if (elapsed < 300) {
        const progress = elapsed / 300;
        const scale = 1 + progress * 0.5;
        const alpha = 1 - progress;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(coin.x, coin.y);
        ctx.scale(scale, scale);
        drawCoinSprite(0, 0);
        ctx.restore();
      }
      continue;
    }

    const bob = Math.sin(gameTime * 0.004 + coin.bobPhase) * 3;
    drawCoinSprite(coin.x, coin.y + bob);
  }
}

function drawCoinSprite(x: number, y: number): void {
  if (!coinSpriteCanvas) {
    const r = COIN_SIZE;
    const size = r * 3;
    coinSpriteCanvas = createCanvasElement(size, size);
    const coinCtx = coinSpriteCanvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;

    coinCtx.fillStyle = "rgba(0,0,0,0.2)";
    coinCtx.beginPath();
    coinCtx.ellipse(cx + 2, cy + 4, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
    coinCtx.fill();

    const grad = coinCtx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
    grad.addColorStop(0, "#fff8b0");
    grad.addColorStop(0.4, "#ffd700");
    grad.addColorStop(0.8, "#daa520");
    grad.addColorStop(1, "#b8860b");
    coinCtx.fillStyle = grad;
    coinCtx.beginPath();
    coinCtx.arc(cx, cy, r, 0, Math.PI * 2);
    coinCtx.fill();

    coinCtx.strokeStyle = "#8b6914";
    coinCtx.lineWidth = 1.5;
    coinCtx.beginPath();
    coinCtx.arc(cx, cy, r, 0, Math.PI * 2);
    coinCtx.stroke();

    coinCtx.lineWidth = 1;
    coinCtx.beginPath();
    coinCtx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
    coinCtx.stroke();

    coinCtx.fillStyle = "#8b6914";
    coinCtx.font = "bold " + Math.round(r * 1.1) + "px 'Nunito', sans-serif";
    coinCtx.textAlign = "center";
    coinCtx.textBaseline = "middle";
    coinCtx.fillText("$", cx, cy + 1);
  }

  const size = coinSpriteCanvas.width;
  ctx.drawImage(coinSpriteCanvas, x - size / 2, y - size / 2);
}

function drawCoinPopups(): void {
  for (const popup of coinPopups) {
    const progress = popup.time / 800;
    const alpha = 1 - progress;
    const yOff = -30 * progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 16px 'Bangers', cursive";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("+1", popup.x, popup.y + yOff);
    ctx.restore();
  }
}

// ============================================================================
// START
// ============================================================================

init();
