console.log("[TwoDots] Game initialized");

import { StartScreen } from "./StartScreen";
import { LevelSelector } from "./LevelSelector";
import { oasiz } from "@oasiz/sdk";
import bgMusicUrl from "./music/Chibi Puzzle Glow.mp3";

// Types
export type DotColor = "red" | "blue" | "green" | "yellow" | "purple";
type CellType = "dot" | "empty";
type GameState =
  | "start"
  | "levelSelect"
  | "playing"
  | "paused"
  | "won"
  | "lost";

interface Cell {
  type: CellType;
  color?: DotColor;
  // Animation state
  animOffsetY?: number; // Current Y offset from target position (pixels)
  animVelocity?: number; // Current fall velocity
  animScaleY?: number; // Vertical scale for squash/stretch (1 = normal)
  animScaleX?: number; // Horizontal scale for squash/stretch (1 = normal)
}

interface Position {
  x: number;
  y: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// Constants
const ALL_COLORS: DotColor[] = ["red", "blue", "green", "yellow", "purple"];
const MIN_CHAIN_LENGTH = 2;

// Level difficulty configuration
interface LevelConfig {
  colors: DotColor[];
  rows: number;
  cols: number;
  moves: number;
  objectiveCount: number;
  objectiveMultiplier: number;
}

function getLevelConfig(level: number): LevelConfig {
  if (level <= 3) {
    return {
      colors: ["red", "blue", "green"],
      rows: 5,
      cols: 5,
      moves: 25,
      objectiveCount: 1,
      objectiveMultiplier: 3.0,
    };
  }
  if (level <= 7) {
    return {
      colors: ["red", "blue", "green", "yellow"],
      rows: 5,
      cols: 5,
      moves: 22,
      objectiveCount: 2,
      objectiveMultiplier: 3.5,
    };
  }
  if (level <= 11) {
    return {
      colors: ["red", "blue", "green", "yellow"],
      rows: 6,
      cols: 6,
      moves: 22,
      objectiveCount: 2,
      objectiveMultiplier: 3.5,
    };
  }
  if (level <= 15) {
    return {
      colors: ["red", "blue", "green", "yellow", "purple"],
      rows: 6,
      cols: 6,
      moves: 20,
      objectiveCount: 2,
      objectiveMultiplier: 4.0,
    };
  }
  if (level <= 18) {
    return {
      colors: ["red", "blue", "green", "yellow", "purple"],
      rows: 6,
      cols: 6,
      moves: 18,
      objectiveCount: 3,
      objectiveMultiplier: 4.0,
    };
  }
  return {
    colors: ["red", "blue", "green", "yellow", "purple"],
    rows: 7,
    cols: 7,
    moves: 18,
    objectiveCount: 3,
    objectiveMultiplier: 4.5,
  };
}

let activeConfig: LevelConfig = getLevelConfig(1);

// Seeded Random Number Generator (Mulberry32)
// Each level uses its own seed for deterministic grid generation
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Use a hash of the seed to ensure good distribution
    this.state = this.hashSeed(seed);
  }

  // Simple hash function to convert level number to a well-distributed seed
  private hashSeed(seed: number): number {
    let h = seed * 2654435761;
    h = ((h >>> 16) ^ h) * 2246822519;
    h = ((h >>> 13) ^ h) * 3266489917;
    h = (h >>> 16) ^ h;
    return h >>> 0;
  }

  // Mulberry32 PRNG - fast and produces good quality random numbers
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Get random integer in range [0, max)
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  // Shuffle array in place using Fisher-Yates
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Level-specific seeded random - reset when starting a new level
let levelRandom: SeededRandom = new SeededRandom(1);

// Spawn weights for objective-favoring logic
const OBJECTIVE_COLOR_WEIGHT = 0.65; // 65% chance to spawn objective colors
const CHAIN_ADJACENT_WEIGHT = 0.3; // 30% chance to match adjacent cells

// UI Configuration
const GRID_SIZE_MULTIPLIER = 0.9; // Multiplier for grid cell size (0.7 = 70% of available space)
const DOT_SIZE_MULTIPLIER = 0.2; // Multiplier for dot radius relative to cell size (0.3 = 30% of cell size)
const LINE_SIZE_MULTIPLIER = 0.15; // Multiplier for chain line width relative to cell size (0.15 = 15% of cell size)
const OBJECTIVE_DOT_SIZE_MULTIPLIER = 0.6; // Multiplier for objective dot size (0.7 = 70% of base size)
const LEVEL_FONT_SIZE_MOBILE = 20; // Font size for "Level 1" text on mobile
const LEVEL_FONT_SIZE_DESKTOP = 14; // Font size for "Level 1" text on desktop

// Common panel dimensions (shared by moves, star, level, settings)
const PANEL_WIDTH_MOBILE = 55;
const PANEL_WIDTH_DESKTOP = 60;
const PANEL_HEIGHT_MOBILE = 55;
const PANEL_HEIGHT_DESKTOP = 60;
const PANEL_BORDER_RADIUS = 12;

// Color definitions
const COLOR_HEX: Record<DotColor, string> = {
  red: "#e84e60",
  blue: "#a5547d",
  green: "#77c299",
  yellow: "#fece6c",
  purple: "#AA44FF",
};

// Ripple effect interface
interface Ripple {
  x: number;
  y: number;
  color: DotColor;
  scale: number;
  alpha: number;
}

// Floating text interface (for chain pop feedback)
interface FloatingText {
  x: number;
  y: number;
  text: string;
  alpha: number;
  velocityY: number;
}

// Game state
let gameState: GameState = "start";
let grid: Cell[][] = [];
let selectedChain: Position[] = [];
let movesRemaining = activeConfig.moves;
let dotsCleared = 0;
let isDragging = false;
let lastSelectedPos: Position | null = null;
let currentPointerX = 0;
let currentPointerY = 0;
let animationFrame = 0;
let isAnimating = false;
let dotsAnimating = false;
let ripples: Ripple[] = [];
let floatingTexts: FloatingText[] = [];
let needsRedraw = true;
let shakingObjectives = 0;

// Best scores per level (persisted via platform saveGameState)
let bestScores: Record<number, number> = {};
let totalScore = 0;

function loadPersistentState(): void {
  const state = oasiz.loadGameState();

  if (state && state.bestScores) {
    bestScores = state.bestScores as Record<number, number>;
  }

  if (state && typeof state.maxUnlockedLevel === "number") {
    maxUnlockedLevel = state.maxUnlockedLevel;
  } else {
    const localSaved = localStorage.getItem("twoDotsMaxLevel");
    if (localSaved) {
      maxUnlockedLevel = parseInt(localSaved, 10);
    } else {
      const levels = Object.keys(bestScores).map(Number);
      if (levels.length > 0) {
        maxUnlockedLevel = Math.max(...levels) + 1;
      } else {
        maxUnlockedLevel = 1;
      }
    }
  }

  // Self-healing: Ensure maxUnlockedLevel is at least (highest completed level + 1)
  const completedLevels = Object.keys(bestScores).map(Number);
  if (completedLevels.length > 0) {
    const highestCompleted = Math.max(...completedLevels);
    if (maxUnlockedLevel <= highestCompleted) {
      maxUnlockedLevel = highestCompleted + 1;
    }
  }

  recalcTotalScore();
}

function savePersistentState(): void {
  oasiz.saveGameState({ bestScores, maxUnlockedLevel });
  oasiz.flushGameState(); // Force immediate write to prevent data loss due to debouncing
}

function recalcTotalScore(): void {
  totalScore = 0;
  for (const s of Object.values(bestScores)) {
    totalScore += s;
  }
}

function markDirty(): void {
  needsRedraw = true;
}

// Settings and level progression functions (defined early)
function loadSettings(): Settings {
  const saved = localStorage.getItem("twoDotsSettings");
  return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("twoDotsSettings", JSON.stringify(settings));
}

// Settings
let settings: Settings = loadSettings();

// ── Web Audio API for low-latency SFX ──
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playPopFx(): void {
  if (!settings.fx) return;
  const ctx = getAudioContext();
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.06);
  } catch (_) {}
}

function playWinFx(): void {
  if (!settings.fx) return;
  const ctx = getAudioContext();
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.setValueAtTime(500, t + 0.1);
    osc.frequency.setValueAtTime(600, t + 0.2);
    osc.frequency.setValueAtTime(800, t + 0.3);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
    gain.gain.setValueAtTime(0.5, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.5);
  } catch (_) {}
}

function playTapFx(): void {
  if (!settings.fx) return;
  const ctx = getAudioContext();
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.06);
  } catch (_) {}
}

// Background music still uses HTMLAudioElement (needs looping/pause/resume)
const bgMusic = new Audio(bgMusicUrl);
bgMusic.loop = true;
bgMusic.preload = "auto";
bgMusic.volume = 0.35;

async function applyMusicSetting(): Promise<void> {
  try {
    if (!settings.music) {
      if (!bgMusic.paused) bgMusic.pause();
      return;
    }
    const playPromise = bgMusic.play();
    await playPromise;
  } catch (err) {
    console.log("[TwoDots] Background music play blocked:", err);
  }
}

function hookFirstUserGestureForMusic(): void {
  const startOnGesture = () => {
    getAudioContext();
    void applyMusicSetting();
  };
  document.addEventListener("pointerdown", startOnGesture, {
    once: true,
    passive: true,
  });
}

// Start screen component
const startScreen = new StartScreen();

// Level selector component
let currentLevel = 1;
let maxUnlockedLevel = 1;
loadPersistentState();
const levelSelector = new LevelSelector(
  20,
  (level: number) => {
    currentLevel = level;
    updateLevelIndicator(level);
  },
  ALL_COLORS,
  COLOR_HEX,
  null,
  undefined,
  undefined,
  undefined,
  maxUnlockedLevel,
); // Pass maxUnlockedLevel

// Objectives
interface Objective {
  type: "clearColor";
  color: DotColor;
  target: number;
  current: number;
  // Shake animation state
  shakeTime: number;
  pendingCount: number; // Count to add after shake completes
}

let objectives: Objective[] = [];

// Shake animation constants
const SHAKE_DURATION = 200; // ms
const SHAKE_INTENSITY = 2; // pixels

// DOM elements
const gameContainer = document.getElementById(
  "game-container",
) as HTMLDivElement;
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas || !gameContainer) {
  throw new Error("Canvas or container element not found");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Could not get 2D context");
}

// Cached display values -- updated only on resize, not every frame
let isMobile = window.matchMedia("(pointer: coarse)").matches;
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let canvasRect = canvas.getBoundingClientRect();

// Pre-computed font strings (rebuilt on resize when isMobile changes)
const cachedFonts = {
  floatingText: "",
  gameOverTitle: "",
  gameOverScore: "",
  ribbonLabel: "",
  movesValue: "",
  scorePanelValue: "",
  scorePanelLevel: "",
  objectiveLabel: "",
  objectiveCount: "",
  startTitle: "",
};

function rebuildFontCache(): void {
  cachedFonts.floatingText = `600 ${isMobile ? 18 : 20}px 'Nunito', sans-serif`;
  cachedFonts.gameOverTitle = `700 ${isMobile ? 28 : 36}px 'Nunito', sans-serif`;
  cachedFonts.gameOverScore = `600 ${isMobile ? 16 : 20}px 'Nunito', sans-serif`;
  cachedFonts.ribbonLabel = `700 ${isMobile ? 8 : 9}px 'Nunito', sans-serif`;
  cachedFonts.movesValue = `500 ${isMobile ? 20 : 28}px 'Nunito', sans-serif`;
  cachedFonts.scorePanelValue = `600 ${isMobile ? 22 : 26}px 'Nunito', sans-serif`;
  cachedFonts.scorePanelLevel = `600 ${isMobile ? 10 : 11}px 'Nunito', sans-serif`;
  cachedFonts.objectiveLabel = `700 ${isMobile ? 8 : 9}px 'Nunito', sans-serif`;
  cachedFonts.objectiveCount = `600 ${isMobile ? 10 : 12}px 'DM Sans', sans-serif`;
  cachedFonts.startTitle = `${isMobile ? 32 : 48}px 'Press Start 2P', monospace`;
}

// Start button width is fixed via CSS (200px) for consistency across devices

// Layout calculations
let cellSize = 0;
let gridOffsetX = 0;
let gridOffsetY = 0;
let hudHeight = 0;

function calculateLayout(): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  hudHeight = isMobile ? h * 0.12 : h * 0.1;

  // Reserve space for top HUD and bottom HUD
  const topHudHeight = isMobile
    ? 120 + PANEL_HEIGHT_MOBILE
    : 45 + PANEL_HEIGHT_DESKTOP;
  const bottomHudHeight = isMobile
    ? 40 + PANEL_HEIGHT_MOBILE
    : 30 + PANEL_HEIGHT_DESKTOP;

  const availableHeight = h - topHudHeight - bottomHudHeight;
  const availableWidth = w * 0.95;

  const cellSizeByHeight = availableHeight / activeConfig.rows;
  const cellSizeByWidth = availableWidth / activeConfig.cols;
  // Apply grid size multiplier
  cellSize =
    Math.min(cellSizeByHeight, cellSizeByWidth, 60) * GRID_SIZE_MULTIPLIER;

  const gridWidth = cellSize * activeConfig.cols;
  const gridHeight = cellSize * activeConfig.rows;

  // Center grid horizontally and vertically in the available space
  gridOffsetX = (w - gridWidth) / 2;
  gridOffsetY = topHudHeight + (availableHeight - gridHeight) / 2;
}

function resizeCanvas(): void {
  isMobile = window.matchMedia("(pointer: coarse)").matches;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (isMobile) {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  } else {
    canvas.width = gameContainer.clientWidth * dpr;
    canvas.height = gameContainer.clientHeight * dpr;
  }

  if (ctx) {
    ctx.scale(dpr, dpr);
  }

  calculateLayout();
  canvasRect = canvas.getBoundingClientRect();
  rebuildFontCache();
}

window.addEventListener("resize", () => {
  resizeCanvas();
  markDirty();
});
resizeCanvas();

// Try applying music setting early; may be blocked until gesture.
hookFirstUserGestureForMusic();
void applyMusicSetting();

// Grid initialization - uses seeded random for deterministic level generation
function initGrid(): void {
  // Reset the seeded random for this level to ensure same initial grid
  levelRandom = new SeededRandom(currentLevel);

  grid = [];
  for (let y = 0; y < activeConfig.rows; y++) {
    grid[y] = [];
    for (let x = 0; x < activeConfig.cols; x++) {
      grid[y][x] = {
        type: "dot",
        color:
          activeConfig.colors[levelRandom.nextInt(activeConfig.colors.length)],
      };
    }
  }

  // Ensure no initial matches (also uses seeded random)
  while (hasMatches()) {
    shuffleGrid();
  }
}

function shuffleGrid(): void {
  const allDots: DotColor[] = [];
  for (let y = 0; y < activeConfig.rows; y++) {
    for (let x = 0; x < activeConfig.cols; x++) {
      if (grid[y][x].type === "dot" && grid[y][x].color) {
        allDots.push(grid[y][x].color!);
      }
    }
  }

  // Shuffle using seeded random for deterministic results
  levelRandom.shuffle(allDots);

  let idx = 0;
  for (let y = 0; y < activeConfig.rows; y++) {
    for (let x = 0; x < activeConfig.cols; x++) {
      if (grid[y][x].type === "dot") {
        grid[y][x].color = allDots[idx++];
      }
    }
  }
}

function hasMatches(): boolean {
  // Check for 2x2 squares or horizontal/vertical matches
  for (let y = 0; y < activeConfig.rows - 1; y++) {
    for (let x = 0; x < activeConfig.cols - 1; x++) {
      const c = grid[y][x].color;
      if (
        c &&
        grid[y][x + 1].color === c &&
        grid[y + 1][x].color === c &&
        grid[y + 1][x + 1].color === c
      ) {
        return true;
      }
    }
  }
  return false;
}

// Initialize objectives
function initObjectives(): void {
  objectives = [];
  shakingObjectives = 0;
  const colorCounts: Record<DotColor, number> = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    purple: 0,
  };

  for (let y = 0; y < activeConfig.rows; y++) {
    for (let x = 0; x < activeConfig.cols; x++) {
      const color = grid[y][x].color;
      if (color) {
        colorCounts[color]++;
      }
    }
  }

  const sorted = Object.entries(colorCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, activeConfig.objectiveCount);

  for (const [color, count] of sorted) {
    objectives.push({
      type: "clearColor",
      color: color as DotColor,
      target: Math.floor(count * activeConfig.objectiveMultiplier),
      current: 0,
      shakeTime: 0,
      pendingCount: 0,
    });
  }
}

// Chain validation
function isValidAdjacent(pos1: Position, pos2: Position): boolean {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function isValidChain(chain: Position[]): boolean {
  if (chain.length < MIN_CHAIN_LENGTH) return false;

  // Check all same color
  const firstColor = grid[chain[0].y][chain[0].x].color;
  if (!firstColor) return false;

  for (const pos of chain) {
    if (grid[pos.y][pos.x].color !== firstColor) return false;
  }

  // Check adjacency
  for (let i = 1; i < chain.length; i++) {
    if (!isValidAdjacent(chain[i - 1], chain[i])) {
      return false;
    }
  }

  // Check uniqueness
  const seen = new Set<string>();
  for (const pos of chain) {
    const key = `${pos.x},${pos.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }

  return true;
}

function isClosedLoop(chain: Position[]): boolean {
  if (chain.length < 4) return false;

  const first = chain[0];
  const last = chain[chain.length - 1];

  // Check if first and last are adjacent
  return isValidAdjacent(first, last);
}

// Position helpers
function getCellAtPixel(x: number, y: number): Position | null {
  const cellX = Math.floor((x - gridOffsetX) / cellSize);
  const cellY = Math.floor((y - gridOffsetY) / cellSize);

  if (
    cellX >= 0 &&
    cellX < activeConfig.cols &&
    cellY >= 0 &&
    cellY < activeConfig.rows
  ) {
    return { x: cellX, y: cellY };
  }
  return null;
}

function isPositionInChain(pos: Position, chain: Position[]): boolean {
  return chain.some((p) => p.x === pos.x && p.y === pos.y);
}

// Ripple effect functions
function spawnRipple(pos: Position, color: DotColor): void {
  const pixelX = gridOffsetX + pos.x * cellSize + cellSize / 2;
  const pixelY = gridOffsetY + pos.y * cellSize + cellSize / 2;

  ripples.push({
    x: pixelX,
    y: pixelY,
    color: color,
    scale: 1,
    alpha: 1,
  });
}

function updateRipples(): void {
  let i = ripples.length;
  while (i--) {
    const ripple = ripples[i];
    ripple.scale += 0.04;
    ripple.alpha -= 0.025;
    if (ripple.alpha <= 0) {
      ripples[i] = ripples[ripples.length - 1];
      ripples.pop();
    }
  }
}

function drawRipples(renderCtx: CanvasRenderingContext2D): void {
  if (ripples.length === 0) return;
  for (const ripple of ripples) {
    const radius = cellSize * DOT_SIZE_MULTIPLIER * ripple.scale;
    renderCtx.globalAlpha = ripple.alpha;
    renderCtx.fillStyle = COLOR_HEX[ripple.color];
    renderCtx.beginPath();
    renderCtx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
    renderCtx.fill();
  }
  renderCtx.globalAlpha = 1;
}

// Floating text functions (chain pop feedback)
function spawnFloatingText(chain: Position[], count: number): void {
  // Calculate center of the chain
  let centerX = 0;
  let centerY = 0;
  for (const pos of chain) {
    centerX += gridOffsetX + pos.x * cellSize + cellSize / 2;
    centerY += gridOffsetY + pos.y * cellSize + cellSize / 2;
  }
  centerX /= chain.length;
  centerY /= chain.length;

  floatingTexts.push({
    x: centerX,
    y: centerY,
    text: `+${count}`,
    alpha: 1,
    velocityY: -2, // Initial upward velocity
  });
}

function updateFloatingTexts(): void {
  let i = floatingTexts.length;
  while (i--) {
    const ft = floatingTexts[i];
    ft.y += ft.velocityY;
    ft.alpha -= 0.02;
    if (ft.alpha <= 0) {
      floatingTexts[i] = floatingTexts[floatingTexts.length - 1];
      floatingTexts.pop();
    }
  }
}

function drawFloatingTexts(renderCtx: CanvasRenderingContext2D): void {
  if (floatingTexts.length === 0) return;
  renderCtx.font = cachedFonts.floatingText;
  renderCtx.textAlign = "center";
  for (const ft of floatingTexts) {
    renderCtx.globalAlpha = ft.alpha;
    renderCtx.fillStyle = "#666666";
    renderCtx.fillText(ft.text, ft.x, ft.y);
  }
  renderCtx.globalAlpha = 1;
}

// Chain selection
function startChain(pos: Position): void {
  if (gameState !== "playing" || isAnimating) return;
  if (grid[pos.y][pos.x].type !== "dot" || !grid[pos.y][pos.x].color) return;

  selectedChain = [pos];
  lastSelectedPos = pos;
  isDragging = true;

  // Initialize pointer position to the dot center
  currentPointerX = gridOffsetX + pos.x * cellSize + cellSize / 2;
  currentPointerY = gridOffsetY + pos.y * cellSize + cellSize / 2;

  // Spawn ripple effect
  spawnRipple(pos, grid[pos.y][pos.x].color!);
  playPopFx();

  triggerHaptic("light");
}

function addToChain(pos: Position): void {
  if (!isDragging || !lastSelectedPos) return;
  if (grid[pos.y][pos.x].type !== "dot" || !grid[pos.y][pos.x].color) return;

  // Check if already in chain
  if (isPositionInChain(pos, selectedChain)) {
    // Allow backtracking - remove everything after this position
    const idx = selectedChain.findIndex((p) => p.x === pos.x && p.y === pos.y);
    if (idx >= 0) {
      selectedChain = selectedChain.slice(0, idx + 1);
      lastSelectedPos = pos;
      return;
    }
  }

  // Check if adjacent to last position
  if (!isValidAdjacent(lastSelectedPos, pos)) return;

  // Check if same color
  const firstColor = grid[selectedChain[0].y][selectedChain[0].x].color;
  if (grid[pos.y][pos.x].color !== firstColor) return;

  selectedChain.push(pos);
  lastSelectedPos = pos;

  // Spawn ripple effect
  spawnRipple(pos, grid[pos.y][pos.x].color!);
  playPopFx();

  triggerHaptic("light");
}

function endChain(): void {
  if (!isDragging) return;
  isDragging = false;

  if (isValidChain(selectedChain)) {
    processChain(selectedChain);
  }

  selectedChain = [];
  lastSelectedPos = null;
  currentPointerX = 0;
  currentPointerY = 0;
}

// Process chain clearing
async function processChain(chain: Position[]): Promise<void> {
  if (isAnimating) return;
  isAnimating = true;

  const isLoop = isClosedLoop(chain);
  const chainColor = grid[chain[0].y][chain[0].x].color!;

  // Clear dots
  const dotsToClear = isLoop ? getAllDotsOfColor(chainColor) : chain;

  // Track dots cleared this round (score computed at level end)
  const dotsGained = dotsToClear.length;
  dotsCleared += dotsGained;

  // Update objectives with shake animation
  const colorCounts: Partial<Record<DotColor, number>> = {};
  for (const pos of dotsToClear) {
    const color = grid[pos.y][pos.x].color;
    if (color) {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
  }

  // Trigger shake and queue pending count updates
  for (const [color, count] of Object.entries(colorCounts)) {
    const obj = objectives.find(
      (o) => o.type === "clearColor" && o.color === color,
    );
    if (obj && count > 0) {
      if (obj.shakeTime <= 0) shakingObjectives++;
      obj.shakeTime = SHAKE_DURATION;
      obj.pendingCount += count;
    }
  }

  // Spawn floating text showing dots gained
  spawnFloatingText(dotsToClear, dotsGained);

  // Clear dots
  for (const pos of dotsToClear) {
    grid[pos.y][pos.x] = { type: "empty" };
  }

  triggerHaptic(isLoop ? "success" : "medium");

  // Wait for clear animation
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Apply gravity (starts bouncy fall animation)
  applyGravity();

  // Spawn new dots (starts bouncy fall animation)
  spawnNewDots();

  // Wait for all dot animations to complete
  await waitForAnimations();

  // Decrease moves
  movesRemaining--;

  // Check win/lose
  checkGameState();

  isAnimating = false;
}

function getAllDotsOfColor(color: DotColor): Position[] {
  const positions: Position[] = [];
  for (let y = 0; y < activeConfig.rows; y++) {
    for (let x = 0; x < activeConfig.cols; x++) {
      if (grid[y][x].type === "dot" && grid[y][x].color === color) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

function applyGravity(): void {
  for (let x = 0; x < activeConfig.cols; x++) {
    let writeY = activeConfig.rows - 1;
    for (let y = activeConfig.rows - 1; y >= 0; y--) {
      if (grid[y][x].type === "dot") {
        if (writeY !== y) {
          // Calculate how many rows the dot needs to fall
          const fallDistance = writeY - y;
          // Move the dot to its new position with animation offset
          grid[writeY][x] = {
            ...grid[y][x],
            animOffsetY: -fallDistance * cellSize, // Start above target
            animVelocity: 0,
          };
          grid[y][x] = { type: "empty" };
          dotsAnimating = true;
        }
        writeY--;
      }
    }
  }
}

// Get a weighted random color that favors objective colors
function getWeightedRandomColor(): DotColor {
  // If no objectives, return random color
  if (objectives.length === 0) {
    return activeConfig.colors[
      Math.floor(Math.random() * activeConfig.colors.length)
    ];
  }

  // Get incomplete objective colors (still need to clear more)
  const incompleteObjectiveColors = objectives
    .filter((obj) => obj.current + obj.pendingCount < obj.target)
    .map((obj) => obj.color);

  // If all objectives complete, return random color
  if (incompleteObjectiveColors.length === 0) {
    return activeConfig.colors[
      Math.floor(Math.random() * activeConfig.colors.length)
    ];
  }

  if (Math.random() < OBJECTIVE_COLOR_WEIGHT) {
    // Pick a random incomplete objective color
    return incompleteObjectiveColors[
      Math.floor(Math.random() * incompleteObjectiveColors.length)
    ];
  }

  // Otherwise return any random color
  return activeConfig.colors[
    Math.floor(Math.random() * activeConfig.colors.length)
  ];
}

// Get a weighted color that also considers adjacency for chain building
function getChainFavoringColor(x: number, y: number): DotColor {
  if (Math.random() < CHAIN_ADJACENT_WEIGHT) {
    const adjacentColors: DotColor[] = [];

    // Check cell below (most important for vertical chains)
    if (
      y < activeConfig.rows - 1 &&
      grid[y + 1][x].type === "dot" &&
      grid[y + 1][x].color
    ) {
      adjacentColors.push(grid[y + 1][x].color!);
      adjacentColors.push(grid[y + 1][x].color!); // Double weight for vertical
    }

    // Check left neighbor
    if (x > 0 && grid[y][x - 1].type === "dot" && grid[y][x - 1].color) {
      adjacentColors.push(grid[y][x - 1].color!);
    }

    // Check right neighbor
    if (
      x < activeConfig.cols - 1 &&
      grid[y][x + 1].type === "dot" &&
      grid[y][x + 1].color
    ) {
      adjacentColors.push(grid[y][x + 1].color!);
    }

    // If we found adjacent colors, prioritize objective colors among them
    if (adjacentColors.length > 0) {
      // Filter to objective colors if any exist
      const objectiveColors = objectives
        .filter((obj) => obj.current + obj.pendingCount < obj.target)
        .map((obj) => obj.color);

      const adjacentObjectiveColors = adjacentColors.filter((c) =>
        objectiveColors.includes(c),
      );

      if (adjacentObjectiveColors.length > 0) {
        return adjacentObjectiveColors[
          Math.floor(Math.random() * adjacentObjectiveColors.length)
        ];
      }

      return adjacentColors[Math.floor(Math.random() * adjacentColors.length)];
    }
  }

  // Fall back to weighted random
  return getWeightedRandomColor();
}

function spawnNewDots(): void {
  for (let x = 0; x < activeConfig.cols; x++) {
    // First pass: collect empty cell positions
    const emptyCells: number[] = [];
    for (let y = 0; y < activeConfig.rows; y++) {
      if (grid[y][x].type === "empty") {
        emptyCells.push(y);
      }
    }

    // Second pass: spawn dots with reversed stagger (bottom dots arrive first)
    // Process from bottom to top so we can check adjacency properly
    const totalEmpty = emptyCells.length;
    for (let i = emptyCells.length - 1; i >= 0; i--) {
      const y = emptyCells[i];
      // Reverse stagger: top empty gets largest offset, bottom empty gets smallest
      const staggerIndex = totalEmpty - (emptyCells.length - 1 - i);
      const spawnOffset = -staggerIndex * cellSize;

      // Use chain-favoring color selection
      const color = getChainFavoringColor(x, y);

      grid[y][x] = {
        type: "dot",
        color: color,
        animOffsetY: spawnOffset,
        animVelocity: 0,
      };
      dotsAnimating = true;
    }
  }
}

// Wait for all dot animations to complete
function waitForAnimations(): Promise<void> {
  return new Promise((resolve) => {
    const checkAnimations = () => {
      if (dotsAnimating) {
        requestAnimationFrame(checkAnimations);
      } else {
        resolve();
      }
    };
    // Start checking after a short delay to ensure animations have started
    setTimeout(checkAnimations, 50);
  });
}

// Game state checks
function checkGameState(): void {
  const allComplete = objectives.every((obj) => obj.current >= obj.target);

  if (allComplete) {
    const moveBonus = movesRemaining * 100;
    const levelScore = (dotsCleared + moveBonus) * currentLevel;
    const prevBest = bestScores[currentLevel] ?? 0;
    const isNewBest = levelScore > prevBest;

    if (isNewBest) {
      bestScores[currentLevel] = levelScore;
      savePersistentState();
      recalcTotalScore();
    }

    gameState = "won";
    triggerHaptic("success");
    submitTotalScore();
    updateUI();

    if (currentLevel >= maxUnlockedLevel && currentLevel < 20) {
      maxUnlockedLevel = currentLevel + 1;
      savePersistentState();
      levelSelector.updateMaxUnlockedLevel(maxUnlockedLevel);
    }

    openWinModal(dotsCleared, moveBonus, currentLevel, levelScore, isNewBest);
  } else if (movesRemaining <= 0) {
    gameState = "lost";
    triggerHaptic("error");
    updateUI();
  }
}

// Input handling
function handlePointerDown(e: PointerEvent): void {
  e.preventDefault();
  markDirty();
  const x = e.clientX - canvasRect.left;
  const y = e.clientY - canvasRect.top;

  if (gameState === "start") {
    return;
  }

  if (gameState === "levelSelect") {
    if (levelSelector.handleButtonClick(x, y)) {
      playTapFx();
      triggerHaptic("light");
      startGame();
      return;
    }
    levelSelector.handleInput(x, y);
    return;
  }

  if (gameState === "lost") {
    restartGame();
    return;
  }

  // Won state is handled by the modal, so ignore canvas clicks
  if (gameState === "won") {
    return;
  }

  if (gameState !== "playing") return;

  if (
    x >= backBtnHitArea.x &&
    x <= backBtnHitArea.x + backBtnHitArea.w &&
    y >= backBtnHitArea.y &&
    y <= backBtnHitArea.y + backBtnHitArea.h
  ) {
    playTapFx();
    triggerHaptic("light");
    gameState = "levelSelect";
    levelSelector.reset();
    updateUI();
    markDirty();
    return;
  }

  const pos = getCellAtPixel(x, y);
  if (pos) {
    startChain(pos);
  }
}

function handlePointerMove(e: PointerEvent): void {
  markDirty();
  const x = e.offsetX;
  const y = e.offsetY;

  if (gameState === "levelSelect") {
    // Handle scrolling drag
    levelSelector.handleInputMove(x, y);
    levelSelector.updateHover(x, y);
    return;
  }

  if (!isDragging || gameState !== "playing") return;

  // Always update pointer position for free-form drawing
  currentPointerX = x;
  currentPointerY = y;

  // Check if pointer is over a valid dot
  const pos = getCellAtPixel(x, y);
  if (
    pos &&
    lastSelectedPos &&
    (pos.x !== lastSelectedPos.x || pos.y !== lastSelectedPos.y)
  ) {
    addToChain(pos);
  }
}

function handlePointerUp(e: PointerEvent): void {
  e.preventDefault();
  markDirty();

  if (gameState === "levelSelect") {
    levelSelector.handleInputEnd();
    return;
  }

  endChain();
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointerleave", handlePointerUp);

// Wheel event for scrolling level selector
canvas.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    if (gameState === "levelSelect") {
      e.preventDefault();
      levelSelector.handleWheel(e.deltaY);
    }
  },
  { passive: false },
);

// Haptics and score submission
function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

function submitTotalScore(): void {
  console.log("[TwoDots] Submitting total score:", totalScore);
  oasiz.submitScore(totalScore);
}

// Game flow
function startGame(): void {
  console.log("[TwoDots] Starting game, level", currentLevel);
  activeConfig = getLevelConfig(currentLevel);
  gameState = "playing";
  movesRemaining = activeConfig.moves;
  dotsCleared = 0;
  selectedChain = [];
  startScreen.reset();
  resizeCanvas();
  initGrid();
  initObjectives();
  updateUI();
  markDirty();
  triggerHaptic("light");
}

function restartGame(): void {
  startGame();
}

// Rendering
function drawDot(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: DotColor,
  size: number,
  alpha = 1,
  scaleX = 1,
  scaleY = 1,
): void {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size * DOT_SIZE_MULTIPLIER;
  const needsTransform = alpha !== 1 || scaleX !== 1 || scaleY !== 1;

  if (needsTransform) {
    renderCtx.save();
    if (alpha !== 1) renderCtx.globalAlpha = alpha;
    if (scaleX !== 1 || scaleY !== 1) {
      renderCtx.translate(centerX, centerY + radius);
      renderCtx.scale(scaleX, scaleY);
      renderCtx.translate(-centerX, -(centerY + radius));
    }
  }

  renderCtx.fillStyle = COLOR_HEX[color];
  renderCtx.beginPath();
  renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  renderCtx.fill();

  if (needsTransform) renderCtx.restore();
}

function drawChainLine(
  renderCtx: CanvasRenderingContext2D,
  chain: Position[],
): void {
  if (chain.length === 0) return;

  // Get the color of the first dot in the chain
  const firstDotColor = grid[chain[0].y][chain[0].x].color;
  renderCtx.strokeStyle = firstDotColor ? COLOR_HEX[firstDotColor] : "#FFFFFF";
  renderCtx.lineWidth = cellSize * LINE_SIZE_MULTIPLIER;
  renderCtx.lineCap = "round";
  renderCtx.lineJoin = "round";

  renderCtx.beginPath();

  // Draw line through all chain positions
  for (let i = 0; i < chain.length; i++) {
    const pos = chain[i];
    const x = gridOffsetX + pos.x * cellSize + cellSize / 2;
    const y = gridOffsetY + pos.y * cellSize + cellSize / 2;

    if (i === 0) {
      renderCtx.moveTo(x, y);
    } else {
      renderCtx.lineTo(x, y);
    }
  }

  // If dragging, extend line to current pointer position for free-form drawing
  if (isDragging && chain.length > 0) {
    renderCtx.lineTo(currentPointerX, currentPointerY);
  }

  renderCtx.stroke();
}

function render(): void {
  if (!ctx) return;

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.clearRect(0, 0, w, h);

  // Background (same for start screen and gameplay)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  if (gameState === "start") {
    startScreen.render(ctx, w, h, COLOR_HEX);
    return;
  }

  if (gameState === "levelSelect") {
    levelSelector.render(ctx, w, h, isMobile);
    return;
  }

  // Draw top HUD (moves, objectives)
  drawTopHUD(ctx, isMobile);

  // Draw bottom HUD (star, score/level)
  drawBottomHUD(ctx, isMobile);

  // Grid background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(
    gridOffsetX - 10,
    gridOffsetY - 10,
    cellSize * activeConfig.cols + 20,
    cellSize * activeConfig.rows + 20,
  );

  // Draw chain line (behind dots but on top of background) - even if only one dot, to show free-form extension
  if (selectedChain.length > 0 && isDragging) {
    drawChainLine(ctx, selectedChain);
  } else if (selectedChain.length > 1) {
    drawChainLine(ctx, selectedChain);
  }

  // Draw ripple effects (behind dots)
  drawRipples(ctx);

  // Draw grid (dots on top of chain line and ripples)
  for (let y = 0; y < activeConfig.rows; y++) {
    for (let x = 0; x < activeConfig.cols; x++) {
      const cell = grid[y][x];
      const pixelX = gridOffsetX + x * cellSize;
      // Apply animation offset to Y position
      const animOffset = cell.animOffsetY || 0;
      const pixelY = gridOffsetY + y * cellSize + animOffset;

      // Get scale values for squash/stretch effect
      const scaleX = cell.animScaleX ?? 1;
      const scaleY = cell.animScaleY ?? 1;

      if (cell.type === "dot" && cell.color) {
        drawDot(ctx, pixelX, pixelY, cell.color, cellSize, 1, scaleX, scaleY);
      }
    }
  }

  // Draw floating texts (chain pop feedback)
  drawFloatingTexts(ctx);

  // Game over screen (only for lost - win uses HTML modal)
  if (gameState === "lost") {
    drawGameOverScreen("Game Over", "#FF4444");
  }
}

function drawGameOverScreen(message: string, color: string): void {
  if (!ctx) return;

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = cachedFonts.gameOverTitle;
  ctx.textAlign = "center";
  ctx.fillText(message, w / 2, h / 2 - 40);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = cachedFonts.gameOverScore;
  ctx.fillText("Dots: " + dotsCleared, w / 2, h / 2 + 40);
  ctx.fillText("Tap to Restart", w / 2, h / 2 + 80);
}

// Common panel background drawing function
function drawPanelBackground(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  renderCtx.fillStyle = "rgba(0, 0, 0, 0.06)";
  renderCtx.beginPath();
  renderCtx.roundRect(x, y + 2, width, height, PANEL_BORDER_RADIUS);
  renderCtx.fill();

  renderCtx.fillStyle = "#f0f0f1";
  renderCtx.beginPath();
  renderCtx.roundRect(x, y, width, height, PANEL_BORDER_RADIUS);
  renderCtx.fill();

  renderCtx.fillStyle = "#d5d5d6";
  renderCtx.beginPath();
  renderCtx.roundRect(x, y + height - 4, width, 4, [
    0,
    0,
    PANEL_BORDER_RADIUS,
    PANEL_BORDER_RADIUS,
  ]);
  renderCtx.fill();
}

function drawTopHUD(
  renderCtx: CanvasRenderingContext2D,
  isMobile: boolean,
): void {
  const w = canvas.width / dpr;

  const topMargin = isMobile ? 120 : 45;

  // Panel dimensions - using common sizes
  const sidePanelWidth = isMobile ? PANEL_WIDTH_MOBILE : PANEL_WIDTH_DESKTOP;
  const sidePanelHeight = isMobile ? PANEL_HEIGHT_MOBILE : PANEL_HEIGHT_DESKTOP;
  const objectivesPanelWidth = isMobile ? 180 : 200;
  const objectivesPanelHeight = isMobile
    ? PANEL_HEIGHT_MOBILE
    : PANEL_HEIGHT_DESKTOP;

  const padding = isMobile ? 15 : 20;

  // Draw Moves panel (left)
  const movesX = padding;
  const panelY = topMargin;
  drawMovesPanel(
    renderCtx,
    movesX,
    panelY,
    sidePanelWidth,
    sidePanelHeight,
    isMobile,
  );

  // Draw Objectives panel (center)
  const objectivesX = (w - objectivesPanelWidth) / 2;
  drawObjectivesPanel(
    renderCtx,
    objectivesX,
    panelY,
    objectivesPanelWidth,
    objectivesPanelHeight,
    isMobile,
  );
}

function drawBottomHUD(
  renderCtx: CanvasRenderingContext2D,
  isMobile: boolean,
): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const bottomMargin = isMobile ? 40 : 30;
  const padding = isMobile ? 15 : 20;

  // Panel dimensions - using common sizes
  const panelWidth = isMobile ? PANEL_WIDTH_MOBILE : PANEL_WIDTH_DESKTOP;
  const panelHeight = isMobile ? PANEL_HEIGHT_MOBILE : PANEL_HEIGHT_DESKTOP;
  const panelY = h - panelHeight - bottomMargin;

  // Draw back button (left)
  drawBackButton(renderCtx, padding, panelY, panelWidth, panelHeight, isMobile);

  // Draw Score/Level panel (right)
  const scoreX = w - panelWidth - padding;
  drawScoreLevelPanel(
    renderCtx,
    scoreX,
    panelY,
    panelWidth,
    panelHeight,
    isMobile,
  );
}

function drawMovesPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean,
): void {
  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);

  // Draw sharp ribbon label with inward pointing arrow ends
  const ribbonHeight = isMobile ? 16 : 18;
  const ribbonY = y - ribbonHeight / 2 + 2;
  const arrowSize = isMobile ? 5 : 6;
  const ribbonBodyWidth = width + 8;
  const ribbonX = x - 4;

  // Draw ribbon as a single path with inward arrow notches
  renderCtx.fillStyle = "#9AA8B8";
  renderCtx.beginPath();
  // Start from top-left corner
  renderCtx.moveTo(ribbonX, ribbonY);
  // Across top
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY);
  // Down to right notch point (inward)
  renderCtx.lineTo(
    ribbonX + ribbonBodyWidth - arrowSize,
    ribbonY + ribbonHeight / 2,
  );
  // Down to bottom-right corner
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY + ribbonHeight);
  // Across bottom
  renderCtx.lineTo(ribbonX, ribbonY + ribbonHeight);
  // Up to left notch point (inward)
  renderCtx.lineTo(ribbonX + arrowSize, ribbonY + ribbonHeight / 2);
  // Back to start
  renderCtx.closePath();
  renderCtx.fill();

  renderCtx.fillStyle = "#FFFFFF";
  renderCtx.font = cachedFonts.ribbonLabel;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";
  renderCtx.fillText(
    "MOVES",
    Math.round(x + width / 2),
    Math.round(ribbonY + ribbonHeight / 2),
  );
  renderCtx.textBaseline = "alphabetic";

  renderCtx.fillStyle = "#555555";
  renderCtx.font = cachedFonts.movesValue;
  renderCtx.textAlign = "center";
  renderCtx.fillText(
    movesRemaining.toString(),
    x + width / 2,
    y + height / 2 + 16,
  );
}

// Bottom-left back button hit area (cached for click detection)
let backBtnHitArea = { x: 0, y: 0, w: 0, h: 0 };

function drawBackButton(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  _isMobile: boolean,
): void {
  backBtnHitArea = { x, y, w: width, h: height };

  drawPanelBackground(renderCtx, x, y, width, height);

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const arrowSize = width * 0.22;

  renderCtx.strokeStyle = "#999999";
  renderCtx.lineWidth = 2.5;
  renderCtx.lineCap = "round";
  renderCtx.lineJoin = "round";
  renderCtx.beginPath();
  renderCtx.moveTo(centerX + arrowSize * 0.4, centerY - arrowSize);
  renderCtx.lineTo(centerX - arrowSize * 0.4, centerY);
  renderCtx.lineTo(centerX + arrowSize * 0.4, centerY + arrowSize);
  renderCtx.stroke();
}

function drawScoreLevelPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  _isMobile: boolean,
): void {
  drawPanelBackground(renderCtx, x, y, width, height);

  renderCtx.fillStyle = "#555555";
  renderCtx.font = cachedFonts.scorePanelValue;
  renderCtx.textAlign = "center";
  renderCtx.fillText(dotsCleared.toString(), x + width / 2, y + height / 2 + 4);

  renderCtx.fillStyle = "#999999";
  renderCtx.font = cachedFonts.scorePanelLevel;
  renderCtx.textAlign = "center";
  renderCtx.fillText("LV " + currentLevel, x + width / 2, y + height / 2 + 20);
}

function drawObjectivesPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean,
): void {
  if (objectives.length === 0) return;

  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);

  // Draw sharp ribbon label with inward pointing arrow ends
  const ribbonHeight = isMobile ? 16 : 18;
  const ribbonY = y - ribbonHeight / 2 + 2;
  const arrowSize = isMobile ? 5 : 6;
  const ribbonBodyWidth = width * 0.7;
  const ribbonX = x + (width - ribbonBodyWidth) / 2;

  // Draw ribbon as a single path with inward arrow notches
  renderCtx.fillStyle = "#9AA8B8";
  renderCtx.beginPath();
  // Start from top-left corner
  renderCtx.moveTo(ribbonX, ribbonY);
  // Across top
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY);
  // Down to right notch point (inward)
  renderCtx.lineTo(
    ribbonX + ribbonBodyWidth - arrowSize,
    ribbonY + ribbonHeight / 2,
  );
  // Down to bottom-right corner
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY + ribbonHeight);
  // Across bottom
  renderCtx.lineTo(ribbonX, ribbonY + ribbonHeight);
  // Up to left notch point (inward)
  renderCtx.lineTo(ribbonX + arrowSize, ribbonY + ribbonHeight / 2);
  // Back to start
  renderCtx.closePath();
  renderCtx.fill();

  renderCtx.fillStyle = "#FFFFFF";
  renderCtx.font = cachedFonts.objectiveLabel;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";
  renderCtx.fillText(
    "OBJECTIVES",
    Math.round(x + width / 2),
    Math.round(ribbonY + ribbonHeight / 2),
  );
  renderCtx.textBaseline = "alphabetic";

  // Draw objective dots
  const baseDotRadius = isMobile ? 14 : 16;
  const dotRadius = baseDotRadius * OBJECTIVE_DOT_SIZE_MULTIPLIER;
  const spacing = width / (objectives.length + 1);
  const dotY = y + height / 2 + 2;

  for (let i = 0; i < objectives.length; i++) {
    const obj = objectives[i];
    // Show remaining including pending count (will be applied after shake)
    const remaining = Math.max(0, obj.target - obj.current - obj.pendingCount);
    let dotX = x + spacing * (i + 1);
    let currentDotY = dotY;

    // Apply shake offset if shaking (both X and Y axes)
    if (obj.shakeTime > 0) {
      const shakeProgress = obj.shakeTime / SHAKE_DURATION;
      const shakeFrequency = 30; // Higher = faster shake
      const shakeOffsetX =
        Math.sin(obj.shakeTime * shakeFrequency * 0.01) *
        SHAKE_INTENSITY *
        shakeProgress;
      const shakeOffsetY =
        Math.cos(obj.shakeTime * shakeFrequency * 0.012) *
        SHAKE_INTENSITY *
        shakeProgress;
      dotX += shakeOffsetX;
      currentDotY += shakeOffsetY;
    }

    // Draw colored dot
    renderCtx.fillStyle = COLOR_HEX[obj.color];
    renderCtx.beginPath();
    renderCtx.arc(dotX, currentDotY, dotRadius, 0, Math.PI * 2);
    renderCtx.fill();

    const textX = x + spacing * (i + 1);
    renderCtx.fillStyle = "#555555";
    renderCtx.font = cachedFonts.objectiveCount;
    renderCtx.textAlign = "center";
    renderCtx.fillText(remaining.toString(), textX, dotY + dotRadius + 10);
  }
}

function updateUI(): void {
  // Show/hide settings button
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    if (
      gameState === "start" ||
      gameState === "levelSelect" ||
      gameState === "won" ||
      gameState === "lost"
    ) {
      settingsBtn.classList.add("hidden");
    } else {
      settingsBtn.classList.remove("hidden");
    }
  }

  // Show/hide start button
  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    if (gameState === "start") {
      startBtn.classList.remove("hidden");
    } else {
      startBtn.classList.add("hidden");
    }
  }

  // Show/hide back button
  const backBtn = document.getElementById("back-btn");
  if (backBtn) {
    if (gameState === "levelSelect") {
      backBtn.classList.remove("hidden");
      updateLevelIndicator(currentLevel);
    } else {
      backBtn.classList.add("hidden");
    }
  }
}

function updateLevelIndicator(level: number): void {
  const backBtn = document.getElementById("back-btn");
  if (backBtn) {
    backBtn.textContent = `Level ${level}`;
  }
}

// Animation constants
const FALL_SPEED = 12; // Constant fall speed (pixels per frame)
const BOUNCE_DAMPING = 0.4; // Retain velocity for visible bounce
const MIN_VELOCITY = 1.5; // Stop bouncing sooner to feel crisp
const MAX_BOUNCE_HEIGHT = 10; // Max pixels to bounce up
const SQUASH_AMOUNT = 0.18; // How much to squash on impact (0-1)
const SCALE_RECOVERY = 0.15; // How fast scale returns to normal
const BOUNCE_GRAVITY = 0.8; // Gravity only used during bounce phase

// Update dot animations (bouncy fall with squash/stretch)
function updateDotAnimations(): void {
  // Don't run if grid isn't initialized yet
  if (grid.length === 0) return;

  let stillAnimating = false;

  for (let y = 0; y < activeConfig.rows; y++) {
    if (!grid[y]) continue;
    for (let x = 0; x < activeConfig.cols; x++) {
      const cell = grid[y][x];
      if (!cell) continue;

      // Check if dot needs animation
      const hasOffset =
        cell.animOffsetY !== undefined && cell.animOffsetY !== 0;
      const isBouncing =
        cell.animVelocity !== undefined && cell.animVelocity !== 0;
      const hasScaleAnim =
        (cell.animScaleY !== undefined && cell.animScaleY !== 1) ||
        (cell.animScaleX !== undefined && cell.animScaleX !== 1);

      if (cell.type === "dot" && (hasOffset || isBouncing || hasScaleAnim)) {
        // Handle position animation
        if (hasOffset || isBouncing) {
          const currentOffset = cell.animOffsetY || 0;
          const currentVelocity = cell.animVelocity || 0;

          // Determine if we're in initial falling phase (velocity is 0, hasn't bounced yet)
          // Once velocity becomes non-zero from bouncing, use gravity physics
          const isInitialFall = currentOffset < 0 && currentVelocity === 0;

          if (isInitialFall) {
            // Constant fall speed for uniform dropping (initial fall only)
            cell.animOffsetY = currentOffset + FALL_SPEED;
          } else {
            // Gravity-based physics for bounce and subsequent falls
            cell.animVelocity = currentVelocity + BOUNCE_GRAVITY;
            cell.animOffsetY = currentOffset + cell.animVelocity;
          }

          // Check if dot has reached or passed target position
          if (cell.animOffsetY >= 0) {
            // Hit the target - bounce!
            cell.animOffsetY = 0;

            // Calculate impact velocity for squash effect
            const impactVel = isInitialFall
              ? FALL_SPEED
              : Math.abs(cell.animVelocity || 0);
            const impactStrength = Math.min(impactVel / 15, 1);
            cell.animScaleY = 1 - SQUASH_AMOUNT * impactStrength;
            cell.animScaleX = 1 + SQUASH_AMOUNT * impactStrength * 0.5;

            // Reverse velocity and apply damping for bounce
            const bounceVelocity = -impactVel * BOUNCE_DAMPING;

            // Cap the bounce velocity to limit bounce height
            cell.animVelocity = Math.max(bounceVelocity, -MAX_BOUNCE_HEIGHT);

            // If velocity is too small, stop position bouncing
            if (Math.abs(cell.animVelocity) < MIN_VELOCITY) {
              cell.animOffsetY = 0;
              cell.animVelocity = 0;
            } else {
              stillAnimating = true;
            }
          } else {
            stillAnimating = true;
          }
        }

        // Recover scale toward normal (visual only, doesn't block interaction)
        if (cell.animScaleY !== undefined && cell.animScaleY !== 1) {
          cell.animScaleY += (1 - cell.animScaleY) * SCALE_RECOVERY;
          cell.animScaleX = 2 - cell.animScaleY; // Inverse for volume preservation
          if (Math.abs(cell.animScaleY - 1) < 0.01) {
            cell.animScaleY = 1;
            cell.animScaleX = 1;
          }
        }
      }
    }
  }

  dotsAnimating = stillAnimating;
}

// Track time for shake animation
let lastFrameTime = performance.now();

// Update objective shake animations
function updateObjectiveShake(deltaTime: number): void {
  for (const obj of objectives) {
    if (obj.shakeTime > 0) {
      obj.shakeTime -= deltaTime;

      if (obj.shakeTime <= 0) {
        obj.shakeTime = 0;
        obj.current += obj.pendingCount;
        obj.pendingCount = 0;
        shakingObjectives--;
      }
    }
  }
}

let rafId = 0;

function startLoop(): void {
  if (rafId) return;
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function gameLoop(): void {
  const now = performance.now();
  const deltaTime = now - lastFrameTime;
  lastFrameTime = now;

  const hasAnimations =
    dotsAnimating ||
    ripples.length > 0 ||
    floatingTexts.length > 0 ||
    shakingObjectives > 0 ||
    gameState === "start" ||
    gameState === "levelSelect";

  if (hasAnimations) {
    updateDotAnimations();
    updateRipples();
    updateFloatingTexts();
    updateObjectiveShake(deltaTime);
    needsRedraw = true;
  }

  if (needsRedraw) {
    render();
    needsRedraw = false;
  }

  rafId = requestAnimationFrame(gameLoop);
}

// Lifecycle events
oasiz.onPause(() => {
  stopLoop();
  if (!bgMusic.paused) bgMusic.pause();
});

oasiz.onResume(() => {
  startLoop();
  if (settings.music && gameState === "playing") {
    bgMusic.play().catch(() => {});
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
    if (!bgMusic.paused) bgMusic.pause();
  } else {
    startLoop();
    if (settings.music && gameState === "playing") {
      bgMusic.play().catch(() => {});
    }
  }
});

startLoop();

// Settings button
function createSettingsButton(): void {
  const btn = document.createElement("button");
  btn.id = "settings-btn";
  btn.className = "settings-btn hidden";
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
  </svg>`;
  btn.setAttribute("aria-label", "Settings");

  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openSettings();
    triggerHaptic("light");
  });

  gameContainer.appendChild(btn);
}

function spawnConfetti(container: HTMLElement): void {
  const colors = [
    "#e84e60",
    "#a5547d",
    "#77c299",
    "#fece6c",
    "#FFD700",
    "#FF6B6B",
    "#4ECDC4",
  ];
  const shapes = ["square", "circle", "strip"];
  const confettiCount = 50;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement("div");
    confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`;
    confetti.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.top = `${-10 - Math.random() * 20}%`;
    confetti.style.animation = `confetti-fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s forwards`;
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(confetti);

    // Remove confetti after animation
    setTimeout(() => {
      if (confetti.parentNode) {
        confetti.remove();
      }
    }, 4500);
  }
}

function openWinModal(
  dots: number,
  moveBonus: number,
  level: number,
  levelScore: number,
  isNewBest: boolean,
): void {
  const prevBest = isNewBest ? 0 : (bestScores[level] ?? 0);
  const modal = document.createElement("div");
  modal.className = "win-modal";
  modal.id = "win-modal";
  modal.innerHTML = `
    <div class="win-content">
      <div class="win-crown">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
        </svg>
      </div>
      <h2>You Win!</h2>
      <p class="score-text">${levelScore.toLocaleString()}</p>
      <p class="score-breakdown">
        (${dots} dots + ${moveBonus} move bonus) x${level}
      </p>
      ${isNewBest ? '<p class="new-best-badge">New Best!</p>' : '<p class="score-breakdown">Best: ' + (prevBest > levelScore ? prevBest : levelScore).toLocaleString() + "</p>"}
      <p class="total-score-line">Total: ${totalScore.toLocaleString()}</p>
      <div class="win-buttons">
        <button class="win-btn secondary" id="retry-btn">Retry</button>
        <button class="win-btn" id="next-level-btn">Next Level</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Play win sound when crown animates
  playWinFx();

  // Spawn confetti
  spawnConfetti(modal);

  const retryBtn = modal.querySelector("#retry-btn") as HTMLButtonElement;
  const nextLevelBtn = modal.querySelector(
    "#next-level-btn",
  ) as HTMLButtonElement;

  let isClosing = false;
  const closeModal = (callback?: () => void) => {
    if (isClosing) return;
    isClosing = true;
    modal.classList.add("closing");
    triggerHaptic("light");
    setTimeout(() => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
      if (callback) callback();
    }, 300);
  };

  retryBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("light");
    closeModal(() => {
      restartGame();
    });
  });

  nextLevelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("light");
    closeModal(() => {
      currentLevel++;
      levelSelector.setLevel(currentLevel);
      startGame();
    });
  });
}

let lastSettingsOpenTime = 0;
function openSettings(): void {
  const now = performance.now();
  if (now - lastSettingsOpenTime < 400) return;
  if (document.querySelector(".settings-modal")) return;
  lastSettingsOpenTime = now;
  const modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.innerHTML = `
    <div class="settings-content">
      <h2>Settings</h2>
      <div class="settings-toggle">
        <label>
          <span>Music</span>
          <input type="checkbox" id="music-toggle" ${settings.music ? "checked" : ""}>
        </label>
      </div>
      <div class="settings-toggle">
        <label>
          <span>Sound Effects</span>
          <input type="checkbox" id="fx-toggle" ${settings.fx ? "checked" : ""}>
        </label>
      </div>
      <div class="settings-toggle">
        <label>
          <span>Haptics</span>
          <input type="checkbox" id="haptics-toggle" ${settings.haptics ? "checked" : ""}>
        </label>
      </div>
      <button class="back-btn-settings">Home</button>
      <button class="close-btn">Close</button>
    </div>
  `;

  document.body.appendChild(modal);

  const musicToggle = modal.querySelector("#music-toggle") as HTMLInputElement;
  const fxToggle = modal.querySelector("#fx-toggle") as HTMLInputElement;
  const hapticsToggle = modal.querySelector(
    "#haptics-toggle",
  ) as HTMLInputElement;
  const backBtn = modal.querySelector(
    ".back-btn-settings",
  ) as HTMLButtonElement;
  const closeBtn = modal.querySelector(".close-btn") as HTMLButtonElement;

  musicToggle.addEventListener("change", () => {
    settings.music = musicToggle.checked;
    saveSettings();
    void applyMusicSetting();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("change", () => {
    settings.fx = fxToggle.checked;
    saveSettings();
    triggerHaptic("light");
  });

  hapticsToggle.addEventListener("change", () => {
    settings.haptics = hapticsToggle.checked;
    saveSettings();
    triggerHaptic("light");
  });

  const closeModal = () => {
    modal.classList.add("closing");
    triggerHaptic("light");
    setTimeout(() => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  };

  backBtn.addEventListener("click", () => {
    closeModal();
    // Navigate to start screen
    gameState = "start";
    startScreen.reset();
    updateUI();
    triggerHaptic("light");
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

createSettingsButton();

// Start button with ripple effect
let isStarting = false;
const startBtn = document.getElementById("start-btn");
if (startBtn) {
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gameState === "start" && !isStarting) {
      isStarting = true;
      // Create ripple effect
      const rect = startBtn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";

      // Calculate ripple size (should be large enough to cover the button)
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;

      // Position ripple at center of button
      ripple.style.left = `${(rect.width - size) / 2}px`;
      ripple.style.top = `${(rect.height - size) / 2}px`;

      startBtn.appendChild(ripple);

      // Remove ripple element after animation completes
      ripple.addEventListener("animationend", () => {
        ripple.remove();
      });

      playTapFx();
      triggerHaptic("light");
      void applyMusicSetting();

      // Delay state transition to let ripple animation play
      setTimeout(() => {
        gameState = "levelSelect";
        levelSelector.reset();
        updateUI();
        isStarting = false;
      }, 500);
    }
  });
}

let isBacking = false;
const backBtn = document.getElementById("back-btn");
if (backBtn) {
  backBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gameState === "levelSelect" && !isBacking) {
      isBacking = true;
      playTapFx();
      triggerHaptic("light");
      void applyMusicSetting();
      startGame();
      setTimeout(() => {
        isBacking = false;
      }, 300);
    }
  });
}

updateUI();

updateUI();
