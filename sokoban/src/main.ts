import {
  submitScore,
  triggerHaptic as sdkTriggerHaptic,
  loadGameState,
  saveGameState,
  flushGameState,
  onPause,
  onResume,
} from "@oasiz/sdk";
import playerRightUrl from "./player-right-nobg.png";
import playerFrontUrl from "./player-front-nobg.png";
import playerBackUrl from "./player-back-nobg.png";
import LEVELS from "./levels";
import type { Position, LevelData } from "./levels";

type Direction = "up" | "down" | "left" | "right";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface ProgressData {
  unlockedLevel: number;
  completed: boolean[];
}

interface MoveSnapshot {
  player: Position;
  boxes: Position[];
  moves: number;
  campaignMoves: number;
  facingDirection: Direction;
  fragileCrossCounts: Record<string, number>;
}

interface CustomLevelData {
  id: string;
  name: string;
  grid: number[][];
  player: Position;
  boxes: Position[];
}

type EditorTool = "wall" | "floor" | "goal" | "ice" | "fragile"
  | "portal_a" | "portal_b" | "player" | "box" | "eraser";

const SETTINGS_KEY = "sokoban_settings";
const TUTORIAL_KEY = "sokoban_tutorial_done";

const TILE = {
  WALL: 0,
  FLOOR: 1,
  GOAL: 2,
  ICE: 3,
  FRAGILE: 4,
  SWITCH: 5,
  MAGNET: 6,
  PORTAL_A: 7,
  PORTAL_B: 8,
} as const;


class AudioManager {
  private settings: Settings;
  private actx: AudioContext | null = null;
  private stepBuffer: AudioBuffer | null = null;
  private stepContactBuffer: AudioBuffer | null = null;
  private victoryBuffer: AudioBuffer | null = null;
  private bgMusic: HTMLAudioElement;
  private musicStarted = false;

  constructor(settings: Settings) {
    this.settings = settings;
    this.bgMusic = new Audio(new URL("./background-music.mp3", import.meta.url).href);
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.12;
    this.initAudioContext();
  }

  private initAudioContext(): void {
    const resume = () => {
      if (!this.actx) {
        this.actx = new AudioContext();
        this.loadBuffers();
      } else if (this.actx.state === "suspended") {
        this.actx.resume();
      }
      if (this.musicStarted && this.settings.music) {
        this.bgMusic.play().catch(() => {});
      }
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
  }

  private async loadBuffers(): Promise<void> {
    if (!this.actx) return;
    const load = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        return await this.actx!.decodeAudioData(buf);
      } catch {
        return null;
      }
    };
    const [step, contact, victory] = await Promise.all([
      load(new URL("./step.mp3", import.meta.url).href),
      load(new URL("./step-contact.mp3", import.meta.url).href),
      load(new URL("./victory.mp3", import.meta.url).href),
    ]);
    this.stepBuffer = step;
    this.stepContactBuffer = contact;
    this.victoryBuffer = victory;
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    if (this.settings.music && this.musicStarted) {
      this.bgMusic.play().catch(() => {});
    } else {
      this.bgMusic.pause();
    }
  }

  private playSfx(buffer: AudioBuffer | null, volume: number): void {
    if (!this.settings.fx || !this.actx || !buffer) return;
    if (this.actx.state === "suspended") this.actx.resume();
    const source = this.actx.createBufferSource();
    source.buffer = buffer;
    const gain = this.actx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.actx.destination);
    source.start(0, 0.02);
  }

  startMusic(): void {
    this.musicStarted = true;
    if (this.settings.music) {
      this.bgMusic.play().catch(() => {});
    }
  }

  stopMusic(): void {
    this.musicStarted = false;
    this.bgMusic.pause();
  }

  playButton(): void {
    this.playSfx(this.stepBuffer, 0.3);
  }

  playMove(): void {
    this.playSfx(this.stepBuffer, 0.7);
  }

  playPush(): void {
    this.playSfx(this.stepContactBuffer, 0.8);
  }

  playGoal(): void {
    this.playSfx(this.stepContactBuffer, 0.8);
  }

  playInvalid(): void {
    this.playSfx(this.stepContactBuffer, 0.8);
  }

  playLevelComplete(): void {
    this.playSfx(this.victoryBuffer, 0.9);
  }
}

class SokobanGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private settings: Settings;
  private progress: ProgressData;
  private tutorialDone: boolean;
  private audio: AudioManager;

  private currentLevelIndex = 0;
  private player: Position = { x: 0, y: 0 };
  private boxes: Position[] = [];
  private goals: Position[] = [];
  private moveHistory: MoveSnapshot[] = [];
  private moveCount = 0;
  private campaignMoves = 0;
  private facingDirection: Direction = "right";
  private isPlaying = false;
  private tutorialStep = -1;
  private playerVisible = true;
  private fragileCrossCounts: Map<string, number> = new Map();
  private portalA: Position | null = null;
  private portalB: Position | null = null;

  private tileSize = 64;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private isMobile = false;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;

  // ── Editor state ──
  private editorMode = false;
  private editorGrid: number[][] = [];
  private editorPlayer: Position | null = null;
  private editorBoxes: Position[] = [];
  private editorLevelName = "";
  private editorRows = 8;
  private editorCols = 8;
  private editorSelectedTool: EditorTool = "wall";
  private editorEditingId: string | null = null;
  private customLevels: CustomLevelData[] = [];
  private editorHoverCell: Position | null = null;
  private editorPointerDown = false;
  private testPlayLevel: LevelData | null = null;
  private testPlayEditorState: {
    grid: number[][];
    player: Position | null;
    boxes: Position[];
    name: string;
    rows: number;
    cols: number;
    editingId: string | null;
  } | null = null;

  private playerImageRight = new Image();
  private playerImageFront = new Image();
  private playerImageBack = new Image();
  private playerImagesReady = { right: false, front: false, back: false };

  private rafId = 0;
  private lastFrameTime = 0;

  private movesValueEl = document.getElementById("movesValue");
  private parInfoEl = document.getElementById("parInfo");
  private tutorialHintEl = document.getElementById("tutorialHint");
  private lcMovesEl = document.getElementById("lcMoves");
  private lcParEl = document.getElementById("lcPar");
  private lcScoreEl = document.getElementById("lcScore");
  private lcScoreDetailEl = document.getElementById("lcScoreDetail");
  private levelGridEl = document.getElementById("levelGrid");
  private levelSelectSubtitleEl = document.getElementById("levelSelectSubtitle");
  private startScreenEl = document.getElementById("startScreen");
  private levelSelectScreenEl = document.getElementById("levelSelectScreen");
  private levelCompleteScreenEl = document.getElementById("levelCompleteScreen");
  private hudEl = document.getElementById("hud");
  private hudButtonsEl = document.getElementById("hudButtons");
  private settingsModalEl = document.getElementById("settingsModal");
  private musicToggleEl = document.getElementById("musicToggle");
  private fxToggleEl = document.getElementById("fxToggle");
  private hapticsToggleEl = document.getElementById("hapticsToggle");
  private levelSelectMode: "menu" | "in-game" = "menu";

  // Editor DOM refs
  private editorScreenEl = document.getElementById("editorScreen");
  private editorLevelNameEl = document.getElementById("editorLevelName") as HTMLInputElement | null;
  private editorSizeLabelEl = document.getElementById("editorSizeLabel");
  private editorToolbarEl = document.getElementById("editorToolbar");
  private editorValidationEl = document.getElementById("editorValidationMsg");
  private customLevelsSectionEl = document.getElementById("customLevelsSection");
  private customLevelsListEl = document.getElementById("customLevelsList");

  constructor() {
    const canvas = document.getElementById("gameCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Canvas not found");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.settings = this.loadSettings();
    this.tutorialDone = this.loadTutorialDone();
    this.audio = new AudioManager(this.settings);

    // Load all cross-session state from the Oasiz platform in one call
    const platformState = loadGameState();
    this.progress = this.loadProgress(platformState);
    this.loadCustomLevels(platformState);

    // Pause/resume the game when the platform sends lifecycle events
    onPause(() => {
      this.stopLoop();
      this.audio.stopMusic();
    });
    onResume(() => {
      this.startLoop();
      if (this.isPlaying) this.audio.startMusic();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    });

    this.playerImageRight.onload = () => {
      this.playerImagesReady.right = true;
    };
    this.playerImageRight.src = playerRightUrl;

    this.playerImageFront.onload = () => {
      this.playerImagesReady.front = true;
    };
    this.playerImageFront.src = playerFrontUrl;

    this.playerImageBack.onload = () => {
      this.playerImagesReady.back = true;
    };
    this.playerImageBack.src = playerBackUrl;

    this.setupUiHandlers();
    this.setupInputHandlers();
    this.resizeCanvas();
    this.updateSettingsUi();
    this.updateHud();
    this.renderLevelButtons();
    this.hideGameplayUi();
    this.showOverlay("start");
    this.audio.applySettings(this.settings);

    window.addEventListener("resize", () => this.resizeCanvas());
    this.startLoop();

    console.log("[SokobanGame.constructor][main.ts] Game initialized");
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Settings;
        return {
          music: Boolean(parsed.music),
          fx: Boolean(parsed.fx),
          haptics: Boolean(parsed.haptics),
        };
      }
    } catch (error) {
      console.warn("[SokobanGame.loadSettings][main.ts] Failed to load settings", error);
    }
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("[SokobanGame.saveSettings][main.ts] Failed to save settings", error);
    }
  }

  private loadProgress(state: ReturnType<typeof loadGameState>): ProgressData {
    const fallback: ProgressData = {
      unlockedLevel: 0,
      completed: LEVELS.map(() => false),
    };

    // Use platform state if available
    if (typeof state.unlockedLevel === "number" || Array.isArray(state.completed)) {
      const completed = LEVELS.map((_, i) =>
        Array.isArray(state.completed) ? Boolean(state.completed[i]) : false,
      );
      return {
        unlockedLevel: Math.max(
          0,
          Math.min(LEVELS.length - 1, typeof state.unlockedLevel === "number" ? state.unlockedLevel : 0),
        ),
        completed,
      };
    }

    return fallback;
  }

  private saveProgress(): void {
    saveGameState({
      unlockedLevel: this.progress.unlockedLevel,
      completed: this.progress.completed,
      customLevels: this.customLevels,
    });
    flushGameState();
  }

  private loadTutorialDone(): boolean {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  }

  private saveTutorialDone(done: boolean): void {
    localStorage.setItem(TUTORIAL_KEY, done ? "1" : "0");
  }

  // ── Custom level persistence via Oasiz SDK game state ──

  private loadCustomLevels(state: ReturnType<typeof loadGameState>): void {
    const raw = state.customLevels;
    if (!Array.isArray(raw)) {
      this.customLevels = [];
      return;
    }
    const levels: CustomLevelData[] = [];
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as CustomLevelData).id === "string" &&
        typeof (entry as CustomLevelData).name === "string" &&
        Array.isArray((entry as CustomLevelData).grid) &&
        (entry as CustomLevelData).player &&
        Array.isArray((entry as CustomLevelData).boxes)
      ) {
        levels.push(entry as CustomLevelData);
      }
    }
    this.customLevels = levels;
    console.log("[SokobanGame.loadCustomLevels] Loaded", levels.length, "custom levels");
  }

  private saveCustomLevels(): void {
    saveGameState({
      unlockedLevel: this.progress.unlockedLevel,
      completed: this.progress.completed,
      customLevels: this.customLevels,
    });
    console.log("[SokobanGame.saveCustomLevels] Saved", this.customLevels.length, "custom levels");
  }

  // ── Editor lifecycle ──

  private openEditor(existing?: CustomLevelData): void {
    this.editorMode = true;
    this.isPlaying = false;
    this.editorPointerDown = false;
    this.editorHoverCell = null;

    if (existing) {
      this.editorEditingId = existing.id;
      this.editorLevelName = existing.name;
      this.editorRows = existing.grid.length;
      this.editorCols = existing.grid[0]?.length ?? 8;
      this.editorGrid = existing.grid.map(row => [...row]);
      this.editorPlayer = existing.player ? { x: existing.player.x, y: existing.player.y } : null;
      this.editorBoxes = existing.boxes.map(b => ({ x: b.x, y: b.y }));
    } else {
      this.editorEditingId = null;
      this.editorLevelName = "";
      this.editorRows = 8;
      this.editorCols = 8;
      this.editorGrid = this.createBlankGrid(this.editorRows, this.editorCols);
      this.editorPlayer = null;
      this.editorBoxes = [];
    }

    if (this.editorLevelNameEl) this.editorLevelNameEl.value = this.editorLevelName;
    this.updateEditorSizeLabel();
    this.updateEditorToolSelection("wall");
    this.hideEditorValidation();
    this.showOverlay("editor");
    this.hideGameplayUi();
    this.resizeCanvas();
    console.log("[SokobanGame.openEditor] Editor opened, editing:", this.editorEditingId ?? "new");
  }

  private closeEditor(): void {
    this.editorMode = false;
    this.editorPointerDown = false;
    this.editorHoverCell = null;
    this.openLevelSelect("menu");
  }

  private createBlankGrid(rows: number, cols: number): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < rows; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < cols; x += 1) {
        const isBorder = y === 0 || y === rows - 1 || x === 0 || x === cols - 1;
        row.push(isBorder ? TILE.WALL : TILE.FLOOR);
      }
      grid.push(row);
    }
    return grid;
  }

  private resizeEditorGrid(newRows: number, newCols: number): void {
    const clamped = {
      rows: Math.max(5, Math.min(15, newRows)),
      cols: Math.max(5, Math.min(15, newCols)),
    };
    const oldGrid = this.editorGrid;
    const grid: number[][] = [];
    for (let y = 0; y < clamped.rows; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < clamped.cols; x += 1) {
        const isBorder = y === 0 || y === clamped.rows - 1 || x === 0 || x === clamped.cols - 1;
        if (isBorder) {
          row.push(TILE.WALL);
        } else if (y < oldGrid.length && x < (oldGrid[y]?.length ?? 0)) {
          row.push(oldGrid[y][x]);
        } else {
          row.push(TILE.FLOOR);
        }
      }
      grid.push(row);
    }
    this.editorGrid = grid;
    this.editorRows = clamped.rows;
    this.editorCols = clamped.cols;

    // Remove out-of-bounds player
    if (this.editorPlayer && (this.editorPlayer.x >= clamped.cols || this.editorPlayer.y >= clamped.rows)) {
      this.editorPlayer = null;
    }
    // Remove out-of-bounds boxes
    this.editorBoxes = this.editorBoxes.filter(
      b => b.x > 0 && b.x < clamped.cols - 1 && b.y > 0 && b.y < clamped.rows - 1,
    );

    this.updateEditorSizeLabel();
    this.resizeCanvas();
  }

  private updateEditorSizeLabel(): void {
    if (this.editorSizeLabelEl) {
      this.editorSizeLabelEl.textContent = this.editorRows + "x" + this.editorCols;
    }
  }

  private updateEditorToolSelection(tool: EditorTool): void {
    this.editorSelectedTool = tool;
    const buttons = this.editorToolbarEl?.querySelectorAll(".tool-btn");
    if (!buttons) return;
    for (const btn of buttons) {
      const el = btn as HTMLElement;
      el.classList.toggle("active", el.getAttribute("data-tool") === tool);
    }
  }

  private showEditorValidation(msg: string, isError = true): void {
    if (!this.editorValidationEl) return;
    this.editorValidationEl.textContent = msg;
    this.editorValidationEl.classList.remove("hidden", "success");
    if (!isError) this.editorValidationEl.classList.add("success");
  }

  private hideEditorValidation(): void {
    this.editorValidationEl?.classList.add("hidden");
  }

  // ── Editor tool application ──

  private handleEditorCanvasInteraction(clientX: number, clientY: number): void {
    if (!this.editorMode) return;
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = canvasX * scaleX;
    const py = canvasY * scaleY;

    const cellX = Math.floor((px - this.boardOffsetX) / this.tileSize);
    const cellY = Math.floor((py - this.boardOffsetY) / this.tileSize);

    if (cellX < 0 || cellX >= this.editorCols || cellY < 0 || cellY >= this.editorRows) return;

    this.applyEditorTool(cellX, cellY);
  }

  private applyEditorTool(x: number, y: number): void {
    const tool = this.editorSelectedTool;
    const grid = this.editorGrid;

    if (tool === "player") {
      // Ensure the cell is walkable
      if (grid[y][x] === TILE.WALL) grid[y][x] = TILE.FLOOR;
      // Remove any box at this position
      this.editorBoxes = this.editorBoxes.filter(b => b.x !== x || b.y !== y);
      this.editorPlayer = { x, y };
      return;
    }

    if (tool === "box") {
      // Toggle box at position
      const existingIdx = this.editorBoxes.findIndex(b => b.x === x && b.y === y);
      if (existingIdx >= 0) {
        this.editorBoxes.splice(existingIdx, 1);
      } else {
        if (grid[y][x] === TILE.WALL) grid[y][x] = TILE.FLOOR;
        // Don't place box on player
        if (this.editorPlayer && this.editorPlayer.x === x && this.editorPlayer.y === y) return;
        this.editorBoxes.push({ x, y });
      }
      return;
    }

    if (tool === "eraser") {
      grid[y][x] = TILE.FLOOR;
      this.editorBoxes = this.editorBoxes.filter(b => b.x !== x || b.y !== y);
      if (this.editorPlayer && this.editorPlayer.x === x && this.editorPlayer.y === y) {
        this.editorPlayer = null;
      }
      return;
    }

    // Tile placement tools
    const tileMap: Record<string, number> = {
      wall: TILE.WALL,
      floor: TILE.FLOOR,
      goal: TILE.GOAL,
      ice: TILE.ICE,
      fragile: TILE.FRAGILE,
      portal_a: TILE.PORTAL_A,
      portal_b: TILE.PORTAL_B,
    };

    const tileValue = tileMap[tool];
    if (tileValue === undefined) return;

    // Enforce portal uniqueness -- remove any existing portal of same type
    if (tool === "portal_a" || tool === "portal_b") {
      const portalTile = tool === "portal_a" ? TILE.PORTAL_A : TILE.PORTAL_B;
      for (let py = 0; py < grid.length; py += 1) {
        for (let px = 0; px < grid[py].length; px += 1) {
          if (grid[py][px] === portalTile) {
            grid[py][px] = TILE.FLOOR;
          }
        }
      }
    }

    // Remove player/boxes from this cell if placing a wall
    if (tileValue === TILE.WALL) {
      this.editorBoxes = this.editorBoxes.filter(b => b.x !== x || b.y !== y);
      if (this.editorPlayer && this.editorPlayer.x === x && this.editorPlayer.y === y) {
        this.editorPlayer = null;
      }
    }

    grid[y][x] = tileValue;
  }

  // ── Editor rendering ──

  private renderEditor(): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Dark background
    c.fillStyle = "#161b2a";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid tiles
    for (let y = 0; y < this.editorRows; y += 1) {
      for (let x = 0; x < this.editorCols; x += 1) {
        const cell = this.editorGrid[y]?.[x] ?? TILE.WALL;
        const px = this.boardOffsetX + x * this.tileSize;
        const py = this.boardOffsetY + y * this.tileSize;
        if (cell === TILE.WALL) {
          this.drawWallTile(px, py, x, y);
        } else {
          this.drawFloorTile(px, py, x, y);
          this.drawSpecialFloorOverlay(px, py, x, y, cell);
        }
      }
    }

    // Draw boxes
    for (const box of this.editorBoxes) {
      const px = this.boardOffsetX + box.x * this.tileSize;
      const py = this.boardOffsetY + box.y * this.tileSize;
      this.drawCrate(px, py, false);
    }

    // Draw player marker
    if (this.editorPlayer) {
      const px = this.boardOffsetX + this.editorPlayer.x * this.tileSize;
      const py = this.boardOffsetY + this.editorPlayer.y * this.tileSize;
      const size = this.tileSize * 0.6;
      const cx = px + this.tileSize * 0.5;
      const cy = py + this.tileSize * 0.5;
      c.fillStyle = "rgba(35, 93, 166, 0.85)";
      c.beginPath();
      c.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.6)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
      c.stroke();
      // P label
      c.fillStyle = "#fff";
      c.font = "bold " + Math.floor(this.tileSize * 0.3) + "px Inter, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("P", cx, cy);
    }

    // Draw subtle grid lines
    c.strokeStyle = "rgba(255, 255, 255, 0.06)";
    c.lineWidth = 1;
    for (let y = 0; y <= this.editorRows; y += 1) {
      const py = this.boardOffsetY + y * this.tileSize;
      c.beginPath();
      c.moveTo(this.boardOffsetX, py);
      c.lineTo(this.boardOffsetX + this.editorCols * this.tileSize, py);
      c.stroke();
    }
    for (let x = 0; x <= this.editorCols; x += 1) {
      const px = this.boardOffsetX + x * this.tileSize;
      c.beginPath();
      c.moveTo(px, this.boardOffsetY);
      c.lineTo(px, this.boardOffsetY + this.editorRows * this.tileSize);
      c.stroke();
    }

    // Hover highlight
    if (this.editorHoverCell) {
      const hx = this.boardOffsetX + this.editorHoverCell.x * this.tileSize;
      const hy = this.boardOffsetY + this.editorHoverCell.y * this.tileSize;
      c.strokeStyle = "rgba(255, 222, 127, 0.5)";
      c.lineWidth = 2;
      c.strokeRect(hx + 1, hy + 1, this.tileSize - 2, this.tileSize - 2);
    }
  }

  private calculateEditorBoardLayout(): void {
    const rows = this.editorRows;
    const cols = this.editorCols;
    const topSafe = this.isMobile ? 310 : 200;
    const bottomSafe = this.isMobile ? 120 : 100;
    const availableWidth = this.canvas.width * 0.92;
    const availableHeight = Math.max(200, this.canvas.height - topSafe - bottomSafe);
    const tileByWidth = availableWidth / cols;
    const tileByHeight = availableHeight / rows;
    this.tileSize = Math.floor(Math.min(tileByWidth, tileByHeight));
    this.boardOffsetX = Math.floor((this.canvas.width - cols * this.tileSize) / 2);
    this.boardOffsetY = Math.floor(topSafe + (availableHeight - rows * this.tileSize) / 2);
  }

  // ── Editor validation ──

  private validateEditorLevel(): string | null {
    if (!this.editorPlayer) return "Place a player (P) on the grid.";

    if (this.editorBoxes.length === 0) return "Place at least one box.";

    // Count goals
    let goalCount = 0;
    let portalACount = 0;
    let portalBCount = 0;
    for (let y = 0; y < this.editorRows; y += 1) {
      for (let x = 0; x < this.editorCols; x += 1) {
        const tile = this.editorGrid[y]?.[x];
        if (tile === TILE.GOAL) goalCount += 1;
        if (tile === TILE.PORTAL_A) portalACount += 1;
        if (tile === TILE.PORTAL_B) portalBCount += 1;
      }
    }

    if (goalCount === 0) return "Place at least one goal tile.";
    if (goalCount !== this.editorBoxes.length) {
      return "Boxes (" + this.editorBoxes.length + ") must equal goals (" + goalCount + ").";
    }

    // Check player is on a walkable tile
    const playerTile = this.editorGrid[this.editorPlayer.y]?.[this.editorPlayer.x];
    if (playerTile === TILE.WALL || playerTile === undefined) {
      return "Player must be on a walkable tile.";
    }

    // Check boxes are on walkable tiles and don't overlap player
    for (const box of this.editorBoxes) {
      const boxTile = this.editorGrid[box.y]?.[box.x];
      if (boxTile === TILE.WALL || boxTile === undefined) {
        return "All boxes must be on walkable tiles.";
      }
      if (box.x === this.editorPlayer.x && box.y === this.editorPlayer.y) {
        return "A box cannot overlap the player.";
      }
    }

    // Check portal pairing
    if ((portalACount > 0) !== (portalBCount > 0)) {
      return "Portals must come in pairs (A and B).";
    }

    return null;
  }

  // ── Test play ──

  private startTestPlay(): void {
    const error = this.validateEditorLevel();
    if (error) {
      this.showEditorValidation(error);
      return;
    }

    // Save editor state so we can return to it
    this.testPlayEditorState = {
      grid: this.editorGrid.map(row => [...row]),
      player: this.editorPlayer ? { x: this.editorPlayer.x, y: this.editorPlayer.y } : null,
      boxes: this.editorBoxes.map(b => ({ x: b.x, y: b.y })),
      name: this.editorLevelNameEl?.value ?? this.editorLevelName,
      rows: this.editorRows,
      cols: this.editorCols,
      editingId: this.editorEditingId,
    };

    // Construct a temporary LevelData
    this.testPlayLevel = {
      id: -1,
      name: this.editorLevelNameEl?.value || "Test Level",
      grid: this.editorGrid.map(row => [...row]),
      player: { x: this.editorPlayer!.x, y: this.editorPlayer!.y },
      boxes: this.editorBoxes.map(b => ({ x: b.x, y: b.y })),
    };

    this.editorMode = false;
    this.showOverlay("none");
    this.showGameplayUi();

    // Initialize gameplay state from the test level
    this.player = { x: this.testPlayLevel.player.x, y: this.testPlayLevel.player.y };
    this.boxes = this.testPlayLevel.boxes.map(b => ({ x: b.x, y: b.y }));
    this.goals = this.collectGoals(this.testPlayLevel.grid);
    const portals = this.collectPortals(this.testPlayLevel.grid);
    this.portalA = portals.portalA;
    this.portalB = portals.portalB;
    this.moveHistory = [];
    this.moveCount = 0;
    this.facingDirection = "right";
    this.playerVisible = true;
    this.fragileCrossCounts.clear();
    this.isPlaying = true;
    this.currentLevelIndex = -1;
    this.updateHud();
    this.resizeCanvas();

    console.log("[SokobanGame.startTestPlay] Testing editor level");
  }

  private exitTestPlay(): void {
    this.isPlaying = false;
    this.testPlayLevel = null;

    if (this.testPlayEditorState) {
      this.editorGrid = this.testPlayEditorState.grid;
      this.editorPlayer = this.testPlayEditorState.player;
      this.editorBoxes = this.testPlayEditorState.boxes;
      this.editorLevelName = this.testPlayEditorState.name;
      this.editorRows = this.testPlayEditorState.rows;
      this.editorCols = this.testPlayEditorState.cols;
      this.editorEditingId = this.testPlayEditorState.editingId;
      this.testPlayEditorState = null;
    }

    this.editorMode = true;
    if (this.editorLevelNameEl) this.editorLevelNameEl.value = this.editorLevelName;
    this.updateEditorSizeLabel();
    this.showOverlay("editor");
    this.hideGameplayUi();
    this.resizeCanvas();
    console.log("[SokobanGame.exitTestPlay] Returned to editor");
  }

  // ── Save, delete, play custom levels ──

  private saveEditorLevel(): void {
    // Read name from input
    this.editorLevelName = this.editorLevelNameEl?.value?.trim() || "Untitled";

    const error = this.validateEditorLevel();
    if (error) {
      this.showEditorValidation(error);
      return;
    }

    const levelData: CustomLevelData = {
      id: this.editorEditingId ?? "custom_" + Date.now(),
      name: this.editorLevelName,
      grid: this.editorGrid.map(row => [...row]),
      player: { x: this.editorPlayer!.x, y: this.editorPlayer!.y },
      boxes: this.editorBoxes.map(b => ({ x: b.x, y: b.y })),
    };

    if (this.editorEditingId) {
      const idx = this.customLevels.findIndex(l => l.id === this.editorEditingId);
      if (idx >= 0) {
        this.customLevels[idx] = levelData;
      } else {
        this.customLevels.push(levelData);
      }
    } else {
      this.customLevels.push(levelData);
    }

    this.saveCustomLevels();
    this.showEditorValidation("Level saved!", false);
    setTimeout(() => this.closeEditor(), 600);
    console.log("[SokobanGame.saveEditorLevel] Saved level:", levelData.id);
  }

  private deleteCustomLevel(id: string): void {
    this.customLevels = this.customLevels.filter(l => l.id !== id);
    this.saveCustomLevels();
    this.renderLevelButtons();
    console.log("[SokobanGame.deleteCustomLevel] Deleted:", id);
  }

  private playCustomLevel(id: string): void {
    const level = this.customLevels.find(l => l.id === id);
    if (!level) return;

    this.testPlayLevel = {
      id: -2,
      name: level.name,
      grid: level.grid.map(row => [...row]),
      player: { x: level.player.x, y: level.player.y },
      boxes: level.boxes.map(b => ({ x: b.x, y: b.y })),
    };
    this.testPlayEditorState = null;
    this.editorMode = false;
    this.currentLevelIndex = -2;

    this.player = { x: this.testPlayLevel.player.x, y: this.testPlayLevel.player.y };
    this.boxes = this.testPlayLevel.boxes.map(b => ({ x: b.x, y: b.y }));
    this.goals = this.collectGoals(this.testPlayLevel.grid);
    const portals = this.collectPortals(this.testPlayLevel.grid);
    this.portalA = portals.portalA;
    this.portalB = portals.portalB;
    this.moveHistory = [];
    this.moveCount = 0;
    this.facingDirection = "right";
    this.playerVisible = true;
    this.fragileCrossCounts.clear();
    this.isPlaying = true;

    this.showOverlay("none");
    this.showGameplayUi();
    this.updateHud();
    this.resizeCanvas();
    console.log("[SokobanGame.playCustomLevel] Playing custom level:", id);
  }

  private setupUiHandlers(): void {
    document.getElementById("startButton")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.campaignMoves = 0;
      this.openLevelSelect("menu");
    });

    document.getElementById("levelSelectBackBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      if (this.levelSelectMode === "in-game") {
        this.levelSelectMode = "menu";
        this.showOverlay("none");
        this.showGameplayUi();
        this.isPlaying = true;
        this.renderLevelButtons();
        return;
      }
      this.showOverlay("start");
    });

    document.getElementById("nextLevelBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      // If coming from custom level, go to level select
      if (this.currentLevelIndex < 0) {
        this.testPlayLevel = null;
        this.openLevelSelect("menu");
        return;
      }
      const next = Math.min(this.currentLevelIndex + 1, LEVELS.length - 1);
      this.startLevel(next);
    });

    document.getElementById("replayLevelBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.startLevel(this.currentLevelIndex);
    });

    document.getElementById("levelSelectBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.openLevelSelect("menu");
    });

    document.getElementById("restartBtn")?.addEventListener("click", () => {
      if (!this.isPlaying) return;
      this.handleButtonFeedback();
      this.restartLevel();
    });

    document.getElementById("undoBtn")?.addEventListener("click", () => {
      if (!this.isPlaying) return;
      this.handleButtonFeedback();
      this.undoMove();
    });

    document.getElementById("settingsBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.settingsModalEl?.classList.add("active");
    });

    document.getElementById("levelSwitcherBtn")?.addEventListener("click", () => {
      if (!this.isPlaying) return;
      this.handleButtonFeedback();
      // If test-playing from editor, return to editor
      if (this.currentLevelIndex === -1 && this.testPlayEditorState) {
        this.exitTestPlay();
        return;
      }
      // If playing a custom level, return to level select
      if (this.currentLevelIndex === -2) {
        this.testPlayLevel = null;
        this.isPlaying = false;
        this.openLevelSelect("menu");
        return;
      }
      this.openLevelSelect("in-game");
    });

    document.getElementById("settingsCloseBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.settingsModalEl?.classList.remove("active");
    });

    this.settingsModalEl?.addEventListener("click", (event) => {
      if (event.target === this.settingsModalEl) {
        this.handleButtonFeedback();
        this.settingsModalEl?.classList.remove("active");
      }
    });

    this.musicToggleEl?.addEventListener("click", () => {
      this.settings.music = !this.settings.music;
      this.saveSettings();
      this.updateSettingsUi();
      this.audio.applySettings(this.settings);
      this.handleButtonFeedback();
    });

    this.fxToggleEl?.addEventListener("click", () => {
      this.settings.fx = !this.settings.fx;
      this.saveSettings();
      this.updateSettingsUi();
      this.audio.applySettings(this.settings);
      this.handleButtonFeedback();
    });

    this.hapticsToggleEl?.addEventListener("click", () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings();
      this.updateSettingsUi();
      this.handleButtonFeedback();
    });

    // ── Editor UI handlers ──


    document.getElementById("editorBackBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.closeEditor();
    });

    document.getElementById("editorTestBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.startTestPlay();
    });

    document.getElementById("editorSaveBtn")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.saveEditorLevel();
    });

    document.getElementById("editorRowsDec")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.resizeEditorGrid(this.editorRows - 1, this.editorCols - 1);
    });

    document.getElementById("editorRowsInc")?.addEventListener("click", () => {
      this.handleButtonFeedback();
      this.resizeEditorGrid(this.editorRows + 1, this.editorCols + 1);
    });

    // Tool palette clicks
    this.editorToolbarEl?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest(".tool-btn") as HTMLElement | null;
      if (!target) return;
      const tool = target.getAttribute("data-tool") as EditorTool | null;
      if (!tool) return;
      this.handleButtonFeedback();
      this.updateEditorToolSelection(tool);
    });
  }

  private openLevelSelect(mode: "menu" | "in-game"): void {
    this.levelSelectMode = mode;
    const allowAnyLevelSelection = mode === "in-game";
    if (this.levelSelectSubtitleEl) {
      this.levelSelectSubtitleEl.textContent = "Par = fewest moves to solve. Can you match it?";
    }
    this.showOverlay("level-select");
    this.hideGameplayUi();
    this.renderLevelButtons();
    this.isPlaying = false;
  }

  private setupInputHandlers(): void {
    window.addEventListener("keydown", (event) => {
      if (this.settingsModalEl?.classList.contains("active")) return;
      if (this.editorMode) return; // Skip game keys in editor
      if (!this.isPlaying) return;
      const key = event.key;
      if (key === "z" || key === "Z") {
        event.preventDefault();
        this.undoMove();
        return;
      }
      if (key === "r" || key === "R") {
        event.preventDefault();
        this.restartLevel();
        return;
      }

      if (key === "ArrowUp" || key === "w" || key === "W") {
        event.preventDefault();
        this.tryMove(0, -1);
      } else if (key === "ArrowDown" || key === "s" || key === "S") {
        event.preventDefault();
        this.tryMove(0, 1);
      } else if (key === "ArrowLeft" || key === "a" || key === "A") {
        event.preventDefault();
        this.tryMove(-1, 0);
      } else if (key === "ArrowRight" || key === "d" || key === "D") {
        event.preventDefault();
        this.tryMove(1, 0);
      }
    });

    // Game touch controls (swipe)
    this.canvas.addEventListener("touchstart", (event) => {
      if (this.editorMode) {
        const touch = event.touches[0];
        if (!touch) return;
        event.preventDefault();
        this.editorPointerDown = true;
        this.handleEditorCanvasInteraction(touch.clientX, touch.clientY);
        return;
      }
      if (!this.isPlaying) return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchActive = true;
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (event) => {
      if (this.editorMode && this.editorPointerDown) {
        const touch = event.touches[0];
        if (!touch) return;
        event.preventDefault();
        this.handleEditorCanvasInteraction(touch.clientX, touch.clientY);
        // Update hover cell
        this.updateEditorHover(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    this.canvas.addEventListener("touchend", (event) => {
      if (this.editorMode) {
        this.editorPointerDown = false;
        return;
      }
      if (!this.touchActive || !this.isPlaying) return;
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (!touch) return;
      this.handleSwipe(touch.clientX, touch.clientY);
      this.touchActive = false;
    }, { passive: false });

    // Mouse/pointer events for editor (desktop)
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.editorMode) return;
      event.preventDefault();
      this.editorPointerDown = true;
      this.handleEditorCanvasInteraction(event.clientX, event.clientY);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.editorMode) return;
      this.updateEditorHover(event.clientX, event.clientY);
      if (this.editorPointerDown) {
        this.handleEditorCanvasInteraction(event.clientX, event.clientY);
      }
    });

    this.canvas.addEventListener("pointerup", () => {
      if (!this.editorMode) return;
      this.editorPointerDown = false;
    });

    this.canvas.addEventListener("pointerleave", () => {
      if (!this.editorMode) return;
      this.editorPointerDown = false;
      this.editorHoverCell = null;
    });
  }

  private updateEditorHover(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const cellX = Math.floor((px - this.boardOffsetX) / this.tileSize);
    const cellY = Math.floor((py - this.boardOffsetY) / this.tileSize);
    if (cellX >= 0 && cellX < this.editorCols && cellY >= 0 && cellY < this.editorRows) {
      this.editorHoverCell = { x: cellX, y: cellY };
    } else {
      this.editorHoverCell = null;
    }
  }

  private handleSwipe(endX: number, endY: number): void {
    const deltaX = endX - this.touchStartX;
    const deltaY = endY - this.touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (Math.max(absX, absY) < 22) return;
    if (absX > absY) {
      this.tryMove(deltaX > 0 ? 1 : -1, 0);
    } else {
      this.tryMove(0, deltaY > 0 ? 1 : -1);
    }
  }

  private handleButtonFeedback(): void {
    this.audio.playButton();
    this.triggerHaptic("light");
  }

  private triggerHaptic(type: Parameters<typeof sdkTriggerHaptic>[0]): void {
    if (!this.settings.haptics) return;
    sdkTriggerHaptic(type);
  }

  private updateSettingsUi(): void {
    this.musicToggleEl?.classList.toggle("active", this.settings.music);
    this.fxToggleEl?.classList.toggle("active", this.settings.fx);
    this.hapticsToggleEl?.classList.toggle("active", this.settings.haptics);
  }

  private parseLevelPar(name: string): number {
    const match = name.match(/best\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : 9999;
  }

  private getSortedLevelIndices(): number[] {
    return LEVELS.map((_, i) => i).sort(
      (a, b) => this.parseLevelPar(LEVELS[a].name) - this.parseLevelPar(LEVELS[b].name),
    );
  }

  private renderLevelButtons(): void {
    if (!this.levelGridEl) return;
    this.levelGridEl.innerHTML = "";
    const sortedIndices = this.getSortedLevelIndices();

    for (let displayNum = 0; displayNum < sortedIndices.length; displayNum++) {
      const levelIndex = sortedIndices[displayNum];
      const completed = this.progress.completed[levelIndex];
      const level = LEVELS[levelIndex];
      const par = this.parseLevelPar(level.name);

      const card = document.createElement("div");
      card.className = "level-card";
      if (completed) card.classList.add("completed");

      const previewDiv = document.createElement("div");
      previewDiv.className = "level-card-preview";
      const canvas = document.createElement("canvas");
      this.drawLevelPreview(canvas, level);
      previewDiv.appendChild(canvas);
      card.appendChild(previewDiv);

      const info = document.createElement("div");
      info.className = "level-card-info";
      const nameSpan = document.createElement("span");
      nameSpan.className = "level-card-name";
      nameSpan.textContent = "Level " + (displayNum + 1);
      info.appendChild(nameSpan);
      if (par < 9999) {
        const parSpan = document.createElement("span");
        parSpan.className = "level-card-par";
        parSpan.textContent = "Par " + par;
        info.appendChild(parSpan);
      }
      card.appendChild(info);

      card.addEventListener("click", () => {
        this.handleButtonFeedback();
        this.startLevel(levelIndex);
      });
      this.levelGridEl.appendChild(card);
    }
  }

  private drawLevelPreview(canvas: HTMLCanvasElement, level: LevelData): void {
    const grid = level.grid;
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const cellSize = 8;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = {
      wall: "#3e424a",
      floor: "#c4b696",
      goal: "#c4b696",
      goalDot: "#e0786e",
      box: "#f1b64a",
      boxBorder: "#7e4715",
      player: "#235da6",
      playerBorder: "#ffffff",
    };

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = grid[y][x];
        const px = x * cellSize;
        const py = y * cellSize;
        if (tile === 0) {
          ctx.fillStyle = COLORS.wall;
        } else if (tile === 2) {
          ctx.fillStyle = COLORS.floor;
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.fillStyle = COLORS.goalDot;
          const r = cellSize * 0.2;
          ctx.beginPath();
          ctx.arc(px + cellSize / 2, py + cellSize / 2, r, 0, Math.PI * 2);
          ctx.fill();
          continue;
        } else {
          ctx.fillStyle = COLORS.floor;
        }
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }

    for (const box of level.boxes) {
      const px = box.x * cellSize;
      const py = box.y * cellSize;
      const inset = cellSize * 0.15;
      ctx.fillStyle = COLORS.box;
      ctx.fillRect(px + inset, py + inset, cellSize - inset * 2, cellSize - inset * 2);
    }

    const ppx = level.player.x * cellSize;
    const ppy = level.player.y * cellSize;
    const pr = cellSize * 0.35;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(ppx + cellSize / 2, ppy + cellSize / 2, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.playerBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private renderCustomLevelCards(): void {
    if (!this.customLevelsListEl || !this.customLevelsSectionEl) return;

    if (this.customLevels.length === 0) {
      this.customLevelsSectionEl.classList.add("hidden");
      return;
    }

    this.customLevelsSectionEl.classList.remove("hidden");
    this.customLevelsListEl.innerHTML = "";

    for (const level of this.customLevels) {
      const card = document.createElement("div");
      card.className = "custom-level-card";

      const nameSpan = document.createElement("span");
      nameSpan.className = "custom-level-name";
      nameSpan.textContent = level.name || "Untitled";
      card.appendChild(nameSpan);

      const actions = document.createElement("div");
      actions.className = "custom-level-actions";

      const playBtn = document.createElement("button");
      playBtn.textContent = "Play";
      playBtn.addEventListener("click", () => {
        this.handleButtonFeedback();
        this.playCustomLevel(level.id);
      });
      actions.appendChild(playBtn);

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        this.handleButtonFeedback();
        this.openEditor(level);
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "Del";
      deleteBtn.addEventListener("click", () => {
        this.handleButtonFeedback();
        this.deleteCustomLevel(level.id);
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      this.customLevelsListEl.appendChild(card);
    }
  }

  private confettiPieces: { x: number; y: number; vx: number; vy: number; r: number; color: string; rot: number; rv: number; w: number; h: number; }[] = [];
  private confettiRaf = 0;

  private showOverlay(name: "start" | "level-select" | "level-complete" | "editor" | "none"): void {
    this.startScreenEl?.classList.add("hidden");
    this.levelSelectScreenEl?.classList.add("hidden");
    this.levelCompleteScreenEl?.classList.add("hidden");
    this.editorScreenEl?.classList.add("hidden");
    if (name === "start") this.startScreenEl?.classList.remove("hidden");
    if (name === "level-select") this.levelSelectScreenEl?.classList.remove("hidden");
    if (name === "level-complete") {
      this.levelCompleteScreenEl?.classList.remove("hidden");
      this.fireConfetti();
    }
    if (name === "editor") this.editorScreenEl?.classList.remove("hidden");
    if (name !== "level-complete") {
      this.stopConfetti();
    }
  }

  private fireConfetti(): void {
    const cvs = document.getElementById("confettiCanvas") as HTMLCanvasElement | null;
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (!parent) return;
    cvs.width = parent.clientWidth;
    cvs.height = parent.clientHeight;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    this.confettiPieces = [];
    cancelAnimationFrame(this.confettiRaf);

    const COLORS = ["#f7be59", "#da8d2a", "#7dd683", "#e0786e", "#5ba8f7", "#c084fc", "#f472b6", "#fbbf24"];
    const W = cvs.width;
    const H = cvs.height;
    const COUNT = 120;

    for (let i = 0; i < COUNT; i++) {
      this.confettiPieces.push({
        x: W * 0.5 + (Math.random() - 0.5) * W * 0.3,
        y: H * 0.35,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 14 - 4,
        r: 0,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        rv: (Math.random() - 0.5) * 0.3,
        w: 4 + Math.random() * 6,
        h: 6 + Math.random() * 8,
      });
    }

    const gravity = 0.25;
    const friction = 0.99;
    let frame = 0;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;

      for (const p of this.confettiPieces) {
        p.vy += gravity;
        p.vx *= friction;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rv;

        if (p.y > H + 40) continue;
        alive++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 180);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive > 0 && frame < 200) {
        this.confettiRaf = requestAnimationFrame(animate);
      }
    };

    this.confettiRaf = requestAnimationFrame(animate);
  }

  private stopConfetti(): void {
    cancelAnimationFrame(this.confettiRaf);
    const cvs = document.getElementById("confettiCanvas") as HTMLCanvasElement | null;
    if (cvs) {
      const ctx = cvs.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
    this.confettiPieces = [];
  }

  private showGameplayUi(): void {
    this.hudEl?.classList.remove("hidden");
    this.parInfoEl?.classList.remove("hidden");
  }

  private hideGameplayUi(): void {
    this.hudEl?.classList.add("hidden");
    this.parInfoEl?.classList.add("hidden");
    this.hideTutorialHint();
  }

  private getCurrentLevel(): LevelData {
    if (this.currentLevelIndex < 0 && this.testPlayLevel) {
      return this.testPlayLevel;
    }
    return LEVELS[this.currentLevelIndex] ?? LEVELS[0];
  }

  private startLevel(index: number): void {
    this.levelSelectMode = "menu";
    this.currentLevelIndex = index;
    const level = this.getCurrentLevel();
    this.player = { x: level.player.x, y: level.player.y };
    this.boxes = level.boxes.map((box) => ({ x: box.x, y: box.y }));
    this.goals = this.collectGoals(level.grid);
    const portals = this.collectPortals(level.grid);
    this.portalA = portals.portalA;
    this.portalB = portals.portalB;
    this.moveHistory = [];
    this.moveCount = 0;
    this.facingDirection = "right";
    this.playerVisible = true;
    this.fragileCrossCounts.clear();
    this.isPlaying = true;

    this.settingsModalEl?.classList.remove("active");
    this.showOverlay("none");
    this.showGameplayUi();
    this.updateHud();
    this.updateTutorialStateOnLevelStart();
    this.resizeCanvas();
    this.audio.startMusic();

    console.log("[SokobanGame.startLevel][main.ts] Started level", level.id, level.name);
  }

  private restartLevel(): void {
    if (this.currentLevelIndex < 0 && this.testPlayLevel) {
      // Restart test/custom level from the testPlayLevel data
      this.player = { x: this.testPlayLevel.player.x, y: this.testPlayLevel.player.y };
      this.boxes = this.testPlayLevel.boxes.map(b => ({ x: b.x, y: b.y }));
      this.goals = this.collectGoals(this.testPlayLevel.grid);
      const portals = this.collectPortals(this.testPlayLevel.grid);
      this.portalA = portals.portalA;
      this.portalB = portals.portalB;
      this.moveHistory = [];
      this.moveCount = 0;
      this.facingDirection = "right";
      this.playerVisible = true;
      this.fragileCrossCounts.clear();
      this.isPlaying = true;
      this.updateHud();
      return;
    }
    this.startLevel(this.currentLevelIndex);
  }

  private collectGoals(grid: number[][]): Position[] {
    const goals: Position[] = [];
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x] === TILE.GOAL) goals.push({ x, y });
      }
    }
    return goals;
  }

  private collectPortals(grid: number[][]): { portalA: Position | null; portalB: Position | null } {
    let portalA: Position | null = null;
    let portalB: Position | null = null;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x] === TILE.PORTAL_A) portalA = { x, y };
        if (grid[y][x] === TILE.PORTAL_B) portalB = { x, y };
      }
    }
    return { portalA, portalB };
  }

  private updateTutorialStateOnLevelStart(): void {
    if (!this.tutorialDone && this.currentLevelIndex === 0) {
      this.tutorialStep = 0;
      this.showTutorialHint("Use arrow keys, WASD, or swipe to move.");
    } else {
      this.tutorialStep = -1;
      this.hideTutorialHint();
    }
  }

  private showTutorialHint(text: string): void {
    if (!this.tutorialHintEl) return;
    this.tutorialHintEl.textContent = text;
    this.tutorialHintEl.classList.remove("hidden");
  }

  private hideTutorialHint(): void {
    this.tutorialHintEl?.classList.add("hidden");
  }

  private calculateScore(par: number, moves: number): number {
    if (par >= 9999 || moves <= 0) return 0;
    return Math.max(1, Math.round(par * (par / moves) * 10));
  }

  private getDisplayLevelNumber(): number {
    const sorted = this.getSortedLevelIndices();
    const pos = sorted.indexOf(this.currentLevelIndex);
    return pos >= 0 ? pos + 1 : this.currentLevelIndex + 1;
  }

  private updateHud(): void {
    const level = this.getCurrentLevel();
    if (this.movesValueEl) this.movesValueEl.textContent = String(this.moveCount);
    if (this.parInfoEl) {
      const par = this.parseLevelPar(level.name);
      const displayNum = this.getDisplayLevelNumber();
      if (par < 9999) {
        this.parInfoEl.innerHTML = "Level " + displayNum + " <span class=\"par-sep\">|</span> Best solution: <span class=\"par-number\">" + par + " moves</span>";
        this.parInfoEl.classList.remove("hidden");
      } else {
        this.parInfoEl.innerHTML = "Level " + displayNum;
        this.parInfoEl.classList.remove("hidden");
      }
    }
  }

  private tryMove(dx: number, dy: number): void {
    if (!this.isPlaying) return;
    if (dx === 0 && dy === 0) return;
    if (this.settingsModalEl?.classList.contains("active")) return;

    if (dx < 0) this.facingDirection = "left";
    if (dx > 0) this.facingDirection = "right";
    if (dy < 0) this.facingDirection = "up";
    if (dy > 0) this.facingDirection = "down";

    const level = this.getCurrentLevel();
    const next = { x: this.player.x + dx, y: this.player.y + dy };
    if (!this.isWalkable(level.grid, next.x, next.y)) {
      this.audio.playInvalid();
      this.triggerHaptic("error");
      return;
    }

    const boxIndex = this.findBoxIndex(next.x, next.y);
    let pushed = false;

    this.moveHistory.push({
      player: { x: this.player.x, y: this.player.y },
      boxes: this.boxes.map((box) => ({ x: box.x, y: box.y })),
      moves: this.moveCount,
      campaignMoves: this.campaignMoves,
      facingDirection: this.facingDirection,
      fragileCrossCounts: this.toFragileObject(),
    });

    if (boxIndex >= 0) {
      const pushTo = { x: next.x + dx, y: next.y + dy };
      const finalBoxPosition = this.resolveBoxPushDestination(pushTo, dx, dy, next, boxIndex);
      if (!finalBoxPosition) {
        this.moveHistory.pop();
        this.audio.playInvalid();
        this.triggerHaptic("error");
        return;
      }
      this.boxes[boxIndex] = finalBoxPosition;
      pushed = true;
    }

    this.player = next;
    this.player = this.resolvePlayerPortal(this.player);

    if (this.handleFragileFloorForPlayer()) {
      return;
    }

    this.moveCount += 1;
    this.campaignMoves += 1;
    this.updateHud();

    if (pushed) {
      this.audio.playPush();
      this.triggerHaptic("medium");
      if (this.isAnyBoxOnGoal()) {
        this.audio.playGoal();
      }
    } else {
      this.audio.playMove();
      this.triggerHaptic("light");
    }

    if (this.tutorialStep === 0) {
      this.tutorialStep = 1;
      this.showTutorialHint("Push the crate onto the pink goal tile.");
    }

    if (this.isLevelComplete()) {
      this.handleLevelComplete();
    }
  }

  private undoMove(): void {
    if (!this.isPlaying) return;
    const snapshot = this.moveHistory.pop();
    if (!snapshot) return;
    this.player = { x: snapshot.player.x, y: snapshot.player.y };
    this.boxes = snapshot.boxes.map((box) => ({ x: box.x, y: box.y }));
    this.moveCount = snapshot.moves;
    this.campaignMoves = snapshot.campaignMoves;
    this.facingDirection = snapshot.facingDirection;
    this.fragileCrossCounts = new Map(Object.entries(snapshot.fragileCrossCounts));
    this.playerVisible = true;
    this.updateHud();
    this.audio.playMove();
    this.triggerHaptic("light");
  }

  private findBoxIndex(x: number, y: number): number {
    for (let i = 0; i < this.boxes.length; i += 1) {
      if (this.boxes[i].x === x && this.boxes[i].y === y) return i;
    }
    return -1;
  }

  private toFragileObject(): Record<string, number> {
    return Object.fromEntries(this.fragileCrossCounts.entries());
  }

  private getTile(x: number, y: number): number {
    const grid = this.getCurrentLevel().grid;
    if (y < 0 || y >= grid.length) return TILE.WALL;
    if (x < 0 || x >= grid[y].length) return TILE.WALL;
    return grid[y][x];
  }

  private canBoxOccupy(x: number, y: number, blockedPlayerPosition?: Position, ignoreBoxIndex?: number): boolean {
    if (!this.isWalkable(this.getCurrentLevel().grid, x, y)) return false;
    if (blockedPlayerPosition && blockedPlayerPosition.x === x && blockedPlayerPosition.y === y) return false;
    for (let i = 0; i < this.boxes.length; i += 1) {
      if (ignoreBoxIndex !== undefined && i === ignoreBoxIndex) continue;
      if (this.boxes[i].x === x && this.boxes[i].y === y) return false;
    }
    return true;
  }

  private resolvePortalTarget(position: Position): Position | null {
    const tile = this.getTile(position.x, position.y);
    if (tile === TILE.PORTAL_A && this.portalB) return { x: this.portalB.x, y: this.portalB.y };
    if (tile === TILE.PORTAL_B && this.portalA) return { x: this.portalA.x, y: this.portalA.y };
    return null;
  }

  private resolvePlayerPortal(position: Position): Position {
    const target = this.resolvePortalTarget(position);
    if (!target) return position;
    if (this.findBoxIndex(target.x, target.y) >= 0) return position;
    return target;
  }

  private resolveBoxPortal(position: Position, blockedPlayerPosition: Position, ignoreBoxIndex: number): Position | null {
    const target = this.resolvePortalTarget(position);
    if (!target) return position;
    if (!this.canBoxOccupy(target.x, target.y, blockedPlayerPosition, ignoreBoxIndex)) {
      return null;
    }
    return target;
  }

  private resolveBoxPushDestination(
    start: Position,
    dx: number,
    dy: number,
    blockedPlayerPosition: Position,
    boxIndex: number,
  ): Position | null {
    let destination = { x: start.x, y: start.y };
    if (!this.canBoxOccupy(destination.x, destination.y, blockedPlayerPosition, boxIndex)) return null;

    if (this.getTile(destination.x, destination.y) === TILE.ICE) {
      const slideDestination = { x: destination.x + dx, y: destination.y + dy };
      if (!this.canBoxOccupy(slideDestination.x, slideDestination.y, blockedPlayerPosition, boxIndex)) {
        return null;
      }
      destination = slideDestination;
    }

    const portalResolved = this.resolveBoxPortal(destination, blockedPlayerPosition, boxIndex);
    if (!portalResolved) return null;
    destination = portalResolved;

    return destination;
  }

  private handleFragileFloorForPlayer(): boolean {
    if (this.getTile(this.player.x, this.player.y) !== TILE.FRAGILE) return false;
    const key = this.player.x + "," + this.player.y;
    const nextCount = (this.fragileCrossCounts.get(key) ?? 0) + 1;
    this.fragileCrossCounts.set(key, nextCount);
    if (nextCount < 2) return false;

    this.isPlaying = false;
    this.playerVisible = false;
    this.audio.playInvalid();
    this.triggerHaptic("error");
    this.showTutorialHint("Fragile floor collapsed. Restarting level.");
    window.setTimeout(() => {
      this.hideTutorialHint();
      this.restartLevel();
    }, 700);
    return true;
  }

  private isWalkable(grid: number[][], x: number, y: number): boolean {
    if (y < 0 || y >= grid.length) return false;
    if (x < 0 || x >= grid[y].length) return false;
    return grid[y][x] !== TILE.WALL;
  }

  private isLevelComplete(): boolean {
    for (const goal of this.goals) {
      if (this.findBoxIndex(goal.x, goal.y) < 0) return false;
    }
    return true;
  }

  private isAnyBoxOnGoal(): boolean {
    for (const box of this.boxes) {
      for (const goal of this.goals) {
        if (box.x === goal.x && box.y === goal.y) return true;
      }
    }
    return false;
  }

  private handleLevelComplete(): void {
    this.isPlaying = false;
    this.audio.playLevelComplete();
    this.triggerHaptic("success");

    // Test play from editor -- return to editor on complete
    if (this.currentLevelIndex === -1 && this.testPlayEditorState) {
      this.showTutorialHint("Level complete! Returning to editor.");
      setTimeout(() => {
        this.hideTutorialHint();
        this.exitTestPlay();
      }, 1200);
      return;
    }

    // Custom level play -- return to level select
    if (this.currentLevelIndex === -2) {
      if (this.lcMovesEl) this.lcMovesEl.textContent = String(this.moveCount);
      if (this.lcParEl) this.lcParEl.textContent = "-";
      if (this.lcScoreEl) this.lcScoreEl.textContent = "-";
      if (this.lcScoreDetailEl) { this.lcScoreDetailEl.textContent = ""; this.lcScoreDetailEl.className = "lc-score-detail"; }
      this.showOverlay("level-complete");
      this.hideGameplayUi();
      return;
    }

    if (this.tutorialStep >= 0) {
      this.tutorialStep = 2;
      this.showTutorialHint("Level complete. Great push.");
      this.tutorialDone = true;
      this.saveTutorialDone(true);
      setTimeout(() => this.hideTutorialHint(), 1400);
    }

    this.progress.completed[this.currentLevelIndex] = true;
    if (this.currentLevelIndex + 1 > this.progress.unlockedLevel) {
      this.progress.unlockedLevel = Math.min(LEVELS.length - 1, this.currentLevelIndex + 1);
    }
    this.saveProgress();
    this.renderLevelButtons();

    const LEVEL_CLEAR_DELAY = 100;

    setTimeout(() => {
      const level = this.getCurrentLevel();
      const par = this.parseLevelPar(level.name);
      const moves = this.moveCount;
      const score = this.calculateScore(par, moves);

      if (this.lcMovesEl) this.lcMovesEl.textContent = String(moves);
      if (this.lcParEl) this.lcParEl.textContent = par < 9999 ? String(par) : "-";
      if (this.lcScoreEl) this.lcScoreEl.textContent = String(score);

      if (this.lcScoreDetailEl) {
        if (par < 9999 && moves <= par) {
          this.lcScoreDetailEl.textContent = "Perfect! You matched par.";
          this.lcScoreDetailEl.className = "lc-score-detail perfect";
        } else if (par < 9999) {
          this.lcScoreDetailEl.textContent = "+" + (moves - par) + " over par";
          this.lcScoreDetailEl.className = "lc-score-detail";
        } else {
          this.lcScoreDetailEl.textContent = "";
          this.lcScoreDetailEl.className = "lc-score-detail";
        }
      }

      this.showOverlay("level-complete");
      this.hideGameplayUi();
      submitScore(Math.max(0, score));
      flushGameState();
      console.log("[SokobanGame.handleLevelComplete] Score submitted", score);
    }, LEVEL_CLEAR_DELAY);
  }

  private resizeCanvas(): void {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    const container = document.getElementById("gameContainer");
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    } else {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
    if (this.editorMode) {
      this.calculateEditorBoardLayout();
    } else {
      this.calculateBoardLayout();
    }
  }

  private calculateBoardLayout(): void {
    const level = this.getCurrentLevel();
    const rows = level.grid.length;
    const cols = level.grid[0].length;
    const topSafe = this.isMobile ? 220 : 130;
    const bottomSafe = this.isMobile ? 100 : 85;
    const availableWidth = this.canvas.width * 0.92;
    const availableHeight = Math.max(240, this.canvas.height - topSafe - bottomSafe);
    const tileByWidth = availableWidth / cols;
    const tileByHeight = availableHeight / rows;
    this.tileSize = Math.floor(Math.min(tileByWidth, tileByHeight));
    this.boardOffsetX = Math.floor((this.canvas.width - cols * this.tileSize) / 2);
    this.boardOffsetY = Math.floor(topSafe + (availableHeight - rows * this.tileSize) / 2);
  }

  private startLoop(): void {
    if (this.rafId) return;
    this.lastFrameTime = 0;
    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private gameLoop(_timestamp: number): void {
    if (this.editorMode) {
      this.renderEditor();
    } else {
      this.render();
    }
    this.rafId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private render(): void {
    const level = this.getCurrentLevel();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const bg = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bg.addColorStop(0, "#e8dfcf");
    bg.addColorStop(1, "#cfba95");
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < level.grid.length; y += 1) {
      for (let x = 0; x < level.grid[y].length; x += 1) {
        const cell = level.grid[y][x];
        const px = this.boardOffsetX + x * this.tileSize;
        const py = this.boardOffsetY + y * this.tileSize;
        if (cell === TILE.WALL) {
          this.drawWallTile(px, py, x, y);
        } else {
          this.drawFloorTile(px, py, x, y);
          this.drawSpecialFloorOverlay(px, py, x, y, cell);
        }
      }
    }

    for (const box of this.boxes) {
      const px = this.boardOffsetX + box.x * this.tileSize;
      const py = this.boardOffsetY + box.y * this.tileSize;
      this.drawCrate(px, py, this.findBoxIndex(box.x, box.y) >= 0 && this.isGoalTile(box.x, box.y));
    }

    const playerX = this.boardOffsetX + this.player.x * this.tileSize;
    const playerY = this.boardOffsetY + this.player.y * this.tileSize;
    this.drawPlayer(playerX, playerY);
  }

  private drawFloorTile(px: number, py: number, cellX: number, cellY: number): void {
    const c = this.ctx;
    c.fillStyle = "#d8c9ab";
    c.fillRect(px, py, this.tileSize, this.tileSize);

    const stripeColor = "rgba(120, 96, 62, 0.08)";
    c.fillStyle = stripeColor;
    const step = Math.max(6, Math.floor(this.tileSize / 7));
    for (let i = 0; i < this.tileSize; i += step) {
      const modifier = ((cellX + cellY + i) % 2 === 0) ? 0.8 : 0.5;
      c.fillRect(px + i, py + step * 0.45, Math.max(2, step * modifier), 2);
    }
    c.strokeStyle = "rgba(0, 0, 0, 0.05)";
    c.lineWidth = 1;
    c.strokeRect(px + 0.5, py + 0.5, this.tileSize - 1, this.tileSize - 1);
  }

  private drawGoalTile(px: number, py: number): void {
    const c = this.ctx;
    const cx = px + this.tileSize * 0.5;
    const cy = py + this.tileSize * 0.5;
    const radius = this.tileSize * 0.19;

    c.fillStyle = "rgba(207, 109, 96, 0.5)";
    c.beginPath();
    c.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(224, 148, 139, 0.92)";
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.fill();
  }

  private drawSpecialFloorOverlay(px: number, py: number, cellX: number, cellY: number, tile: number): void {
    if (tile === TILE.GOAL) {
      this.drawGoalTile(px, py);
      return;
    }

    const c = this.ctx;
    const t = this.tileSize;

    if (tile === TILE.ICE) {
      const gradient = c.createLinearGradient(px, py, px + t, py + t);
      gradient.addColorStop(0, "rgba(195, 228, 255, 0.85)");
      gradient.addColorStop(1, "rgba(138, 191, 241, 0.78)");
      c.fillStyle = gradient;
      c.fillRect(px + 2, py + 2, t - 4, t - 4);
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(px + t * 0.2, py + t * 0.25);
      c.lineTo(px + t * 0.8, py + t * 0.85);
      c.moveTo(px + t * 0.35, py + t * 0.15);
      c.lineTo(px + t * 0.9, py + t * 0.7);
      c.stroke();
      return;
    }

    if (tile === TILE.FRAGILE) {
      this.drawFragileTileOverlay(px, py, cellX, cellY);
      return;
    }

    if (tile === TILE.PORTAL_A || tile === TILE.PORTAL_B) {
      this.drawPortalTileOverlay(px, py, cellX, cellY, tile === TILE.PORTAL_A);
      return;
    }
  }

  private drawFragileTileOverlay(px: number, py: number, cellX: number, cellY: number): void {
    const c = this.ctx;
    const t = this.tileSize;
    const key = cellX + "," + cellY;
    const visits = this.fragileCrossCounts.get(key) ?? 0;
    const isCritical = visits >= 1;
    const time = performance.now() * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(time * (isCritical ? 8.4 : 3.4) + (cellX + cellY) * 0.55);

    const fillGradient = c.createLinearGradient(px, py, px + t, py + t);
    if (isCritical) {
      fillGradient.addColorStop(0, "rgba(168, 64, 52, 0.74)");
      fillGradient.addColorStop(1, "rgba(86, 26, 20, 0.82)");
    } else {
      fillGradient.addColorStop(0, "rgba(194, 152, 112, 0.42)");
      fillGradient.addColorStop(1, "rgba(128, 96, 74, 0.54)");
    }
    c.fillStyle = fillGradient;
    c.fillRect(px + 2, py + 2, t - 4, t - 4);

    // Distinct border pulse: calm amber before break, urgent red after first crossing.
    c.strokeStyle = isCritical
      ? "rgba(255, 112, 93, " + (0.42 + pulse * 0.45) + ")"
      : "rgba(214, 173, 118, " + (0.26 + pulse * 0.2) + ")";
    c.lineWidth = Math.max(2, t * (isCritical ? 0.06 : 0.04));
    c.strokeRect(px + 4, py + 4, t - 8, t - 8);

    c.strokeStyle = isCritical ? "rgba(66, 18, 14, 0.95)" : "rgba(72, 48, 30, 0.7)";
    c.lineWidth = Math.max(1, t * 0.03);
    c.beginPath();
    c.moveTo(px + t * 0.18, py + t * 0.22);
    c.lineTo(px + t * 0.78, py + t * 0.78);
    c.moveTo(px + t * 0.82, py + t * 0.2);
    c.lineTo(px + t * 0.38, py + t * 0.62);
    if (isCritical) {
      c.moveTo(px + t * 0.24, py + t * 0.86);
      c.lineTo(px + t * 0.58, py + t * 0.56);
      c.moveTo(px + t * 0.52, py + t * 0.28);
      c.lineTo(px + t * 0.9, py + t * 0.5);
    }
    c.stroke();

    if (isCritical) {
      c.fillStyle = "rgba(255, 240, 225, 0.95)";
      const markerW = Math.max(2, t * 0.085);
      c.fillRect(px + t * 0.5 - markerW * 0.5, py + t * 0.18, markerW, t * 0.36);
      c.beginPath();
      c.arc(px + t * 0.5, py + t * 0.64, markerW * 0.55, 0, Math.PI * 2);
      c.fill();
    } else {
      c.strokeStyle = "rgba(98, 72, 45, 0.45)";
      c.lineWidth = Math.max(1, t * 0.018);
      c.beginPath();
      c.arc(px + t * 0.5, py + t * 0.5, t * 0.22, 0, Math.PI * 2);
      c.stroke();
    }
  }

  private drawPortalTileOverlay(
    px: number,
    py: number,
    cellX: number,
    cellY: number,
    isPortalA: boolean,
  ): void {
    const c = this.ctx;
    const t = this.tileSize;
    const time = performance.now() * 0.001;
    const cx = px + t * 0.5;
    const cy = py + t * 0.5;
    const phase = time * 2.2 + (isPortalA ? 0 : 1.6);
    const pulse = 0.5 + 0.5 * Math.sin(time * 5 + (isPortalA ? 0 : Math.PI));
    const glow = isPortalA ? "96, 170, 255" : "188, 124, 255";
    const accent = isPortalA ? "128, 209, 255" : "222, 150, 255";

    const coreGradient = c.createRadialGradient(cx, cy, t * 0.04, cx, cy, t * 0.34);
    coreGradient.addColorStop(0, "rgba(" + accent + ", 0.94)");
    coreGradient.addColorStop(0.5, "rgba(" + glow + ", 0.42)");
    coreGradient.addColorStop(1, "rgba(" + glow + ", 0)");
    c.fillStyle = coreGradient;
    c.beginPath();
    c.arc(cx, cy, t * 0.34, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = "rgba(" + glow + ", " + (0.5 + pulse * 0.35) + ")";
    c.lineWidth = Math.max(2, t * 0.045);
    c.beginPath();
    c.arc(cx, cy, t * (0.23 + pulse * 0.025), 0, Math.PI * 2);
    c.stroke();

    // Rotating arc bands create a stronger portal read without expensive effects.
    c.lineWidth = Math.max(1, t * 0.03);
    for (let i = 0; i < 3; i += 1) {
      const ringRadius = t * (0.12 + i * 0.08);
      const angleStart = phase * (1 + i * 0.14) + i * 0.9;
      c.strokeStyle = "rgba(" + accent + ", " + (0.25 + i * 0.14) + ")";
      c.beginPath();
      c.arc(cx, cy, ringRadius, angleStart, angleStart + Math.PI * 0.95);
      c.stroke();
    }

    for (let i = 0; i < 5; i += 1) {
      const seed = this.hash01(cellX * 31 + cellY * 47 + i * 13 + (isPortalA ? 2 : 5));
      const angle = phase * (0.75 + seed * 0.7) + i * 1.22;
      const radius = t * (0.08 + seed * 0.2);
      const sparkX = cx + Math.cos(angle) * radius;
      const sparkY = cy + Math.sin(angle) * radius;
      const sparkRadius = t * (0.013 + seed * 0.012);
      const sparkAlpha = 0.28 + 0.45 * (0.5 + 0.5 * Math.sin(time * 6 + seed * 9));
      c.fillStyle = "rgba(" + accent + ", " + sparkAlpha + ")";
      c.beginPath();
      c.arc(sparkX, sparkY, sparkRadius, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawWallTile(px: number, py: number, cellX: number, cellY: number): void {
    const c = this.ctx;
    const t = this.tileSize;

    c.fillStyle = "#4a4f58";
    c.fillRect(px, py, t, t);

    // Clip so brick pattern never bleeds outside this tile
    c.save();
    c.beginPath();
    c.rect(px, py, t, t);
    c.clip();

    // Brick pattern - alternating rows offset by half
    const brickH = Math.max(4, Math.floor(t / 4));
    const brickW = Math.max(8, Math.floor(t / 2));
    const rows = Math.ceil(t / brickH);
    const cols = Math.ceil(t / brickW) + 1;

    for (let row = 0; row < rows; row += 1) {
      const offsetX = (row + cellY) % 2 === 0 ? 0 : -Math.floor(brickW / 2);
      for (let col = 0; col < cols; col += 1) {
        const bx = px + col * brickW + offsetX;
        const by = py + row * brickH;

        // Mortar lines (dark gaps between bricks)
        c.fillStyle = "rgba(0, 0, 0, 0.18)";
        c.fillRect(bx, by, brickW, 1);
        c.fillRect(bx, by, 1, brickH);

        // Subtle per-brick shade variation
        const seed = (cellX * 7 + cellY * 13 + row * 3 + col * 17) % 5;
        const shade = seed < 2 ? "rgba(255,255,255,0.04)" : seed < 4 ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0)";
        c.fillStyle = shade;
        c.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
      }
    }

    c.restore();

    // Top-left highlight
    c.fillStyle = "rgba(255, 255, 255, 0.05)";
    c.fillRect(px, py, t, 1);
    c.fillRect(px, py, 1, t);

    // Bottom-right shadow
    c.fillStyle = "rgba(0, 0, 0, 0.1)";
    c.fillRect(px, py + t - 1, t, 1);
    c.fillRect(px + t - 1, py, 1, t);
  }

  private drawCrate(px: number, py: number, onGoal: boolean): void {
    const c = this.ctx;
    const margin = this.tileSize * 0.12;
    const x = px + margin;
    const y = py + margin;
    const size = this.tileSize - margin * 2;

    if (onGoal) {
      c.save();
      c.shadowColor = "rgba(125, 214, 131, 0.6)";
      c.shadowBlur = this.tileSize * 0.35;
      c.fillStyle = "#7dd683";
      c.fillRect(x, y, size, size);
      c.restore();
    }

    const gradient = c.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(0, onGoal ? "#8edc8e" : "#f1b64a");
    gradient.addColorStop(1, onGoal ? "#4aad52" : "#cc7e1e");
    c.fillStyle = gradient;
    c.fillRect(x, y, size, size);

    c.strokeStyle = onGoal ? "#2d7a34" : "#7e4715";
    c.lineWidth = Math.max(2, this.tileSize * 0.04);
    c.strokeRect(x, y, size, size);

    c.strokeStyle = onGoal ? "#3a8c42" : "#8c4f16";
    c.lineWidth = Math.max(2, this.tileSize * 0.04);
    c.beginPath();
    c.moveTo(x + size * 0.16, y + size * 0.16);
    c.lineTo(x + size * 0.84, y + size * 0.84);
    c.moveTo(x + size * 0.84, y + size * 0.16);
    c.lineTo(x + size * 0.16, y + size * 0.84);
    c.stroke();

    c.strokeStyle = onGoal ? "rgba(200, 255, 200, 0.4)" : "rgba(255, 232, 194, 0.45)";
    c.lineWidth = Math.max(1, this.tileSize * 0.02);
    c.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }

  private drawPlayer(px: number, py: number): void {
    if (!this.playerVisible) return;
    const c = this.ctx;
    const size = this.tileSize * 1.35;
    const bob = Math.sin(performance.now() / 400) * this.tileSize * 0.04;
    const x = px + (this.tileSize - size) / 2;
    const y = py + this.tileSize - size + this.tileSize * 0.22 + bob;

    if (this.facingDirection === "left" && this.playerImagesReady.right) {
      c.save();
      c.translate(x + size, y);
      c.scale(-1, 1);
      c.drawImage(this.playerImageRight, 0, 0, size, size);
      c.restore();
      return;
    } else if (this.facingDirection === "right" && this.playerImagesReady.right) {
      c.drawImage(this.playerImageRight, x, y, size, size);
      return;
    } else if (this.facingDirection === "up" && this.playerImagesReady.back) {
      c.drawImage(this.playerImageBack, x, y, size, size);
      return;
    } else if (this.facingDirection === "down" && this.playerImagesReady.front) {
      c.drawImage(this.playerImageFront, x, y, size, size);
      return;
    } else if (this.playerImagesReady.right) {
      c.drawImage(this.playerImageRight, x, y, size, size);
      return;
    }

    c.fillStyle = "#235da6";
    c.fillRect(x + size * 0.26, y + size * 0.42, size * 0.5, size * 0.34);
    c.fillStyle = "#f1bd98";
    c.beginPath();
    c.arc(x + size * 0.5, y + size * 0.28, size * 0.14, 0, Math.PI * 2);
    c.fill();
  }

  private isGoalTile(x: number, y: number): boolean {
    for (const goal of this.goals) {
      if (goal.x === x && goal.y === y) return true;
    }
    return false;
  }

  private hash01(value: number): number {
    const raw = Math.sin(value * 12.9898) * 43758.5453;
    return raw - Math.floor(raw);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("[main][main.ts] Starting Sokoban");
  new SokobanGame();
});
