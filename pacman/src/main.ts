/**
 * PAC-MAN - A responsive canvas-based implementation
 * 
 * Features:
 * - Full viewport responsive canvas
 * - Desktop (keyboard) and mobile (touch/swipe) support
 * - Classic ghost AI behaviors
 * - Power pellets and ghost eating
 * - Multiple levels with increasing difficulty
 */

// ============= CONFIGURATION =============
const CONFIG = {
  TILE_SIZE: 8,
  MAZE_WIDTH: 28,
  MAZE_HEIGHT: 31,
  MAX_FPS: 60,
  PACMAN_SPEED: 0.12, // tiles per frame
  GHOST_SPEED: 0.10,
  GHOST_SCARED_SPEED: 0.05,
  GHOST_EYES_SPEED: 0.20,
  POWER_DURATION: 7000,
  DOT_POINTS: 10,
  POWER_PELLET_POINTS: 50,
  GHOST_POINTS: [200, 400, 800, 1600],
  FRUIT_POINTS: [100, 300, 500, 700, 1000, 2000, 3000, 5000],
};

// Colors
const COLORS = {
  MAZE_WALL: "#2121de",
  MAZE_BG: "#000000",
  DOT: "#ffb8ae",
  POWER_PELLET: "#ffb8ae",
  PACMAN: "#ffff00",
  BLINKY: "#ff0000",
  PINKY: "#ffb8ff",
  INKY: "#00ffff",
  CLYDE: "#ffb852",
  SCARED: "#2121de",
  SCARED_FLASH: "#ffffff",
  EYES: "#ffffff",
  TEXT: "#ffffff",
};

// Maze layout from reference implementation
// X = wall, o = dot, O = power pellet, space = empty
const MAZE_LAYOUT = [
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "XooooooooooooXXooooooooooooX",
  "XoXXXXoXXXXXoXXoXXXXXoXXXXoX",
  "XOXXXXoXXXXXoXXoXXXXXoXXXXOX",
  "XoXXXXoXXXXXoXXoXXXXXoXXXXoX",
  "XooooooooooooooooooooooooooX",
  "XoXXXXoXXoXXXXXXXXoXXoXXXXoX",
  "XoXXXXoXXoXXXXXXXXoXXoXXXXoX",
  "XooooooXXooooXXooooXXooooooX",
  "XXXXXXoXXXXX XX XXXXXoXXXXXX",
  "XXXXXXoXXXXX XX XXXXXoXXXXXX",
  "XXXXXXoXX          XXoXXXXXX",
  "XXXXXXoXX XXXXXXXX XXoXXXXXX",
  "XXXXXXoXX X      X XXoXXXXXX",
  "      o   X      X   o      ",
  "XXXXXXoXX X      X XXoXXXXXX",
  "XXXXXXoXX XXXXXXXX XXoXXXXXX",
  "XXXXXXoXX          XXoXXXXXX",
  "XXXXXXoXX XXXXXXXX XXoXXXXXX",
  "XXXXXXoXX XXXXXXXX XXoXXXXXX",
  "XooooooooooooXXooooooooooooX",
  "XoXXXXoXXXXXoXXoXXXXXoXXXXoX",
  "XoXXXXoXXXXXoXXoXXXXXoXXXXoX",
  "XOooXXooooooo  oooooooXXooOX",
  "XXXoXXoXXoXXXXXXXXoXXoXXoXXX",
  "XXXoXXoXXoXXXXXXXXoXXoXXoXXX",
  "XooooooXXooooXXooooXXooooooX",
  "XoXXXXXXXXXXoXXoXXXXXXXXXXoX",
  "XoXXXXXXXXXXoXXoXXXXXXXXXXoX",
  "XooooooooooooooooooooooooooX",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
];

// ============= TYPES =============
type Direction = "up" | "down" | "left" | "right";
type GameState = "menu" | "ready" | "playing" | "paused" | "dying" | "gameover" | "levelcomplete";
type GhostMode = "scatter" | "chase" | "scared" | "eyes";
type GhostName = "blinky" | "pinky" | "inky" | "clyde";

interface Position {
  x: number;
  y: number;
}

interface GridPosition {
  col: number;
  row: number;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function gridDistance(a: GridPosition, b: GridPosition): number {
  return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2);
}

function getOppositeDirection(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };
  return opposites[dir];
}

function directionToVector(dir: Direction): Position {
  const vectors: Record<Direction, Position> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  return vectors[dir];
}

// ============= SOUND MANAGER =============
class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private musicPlaying: string | null = null;
  private muted: boolean = false;
  private musicVolume: number = 0.3;
  private sfxVolume: number = 0.5;
  private sirenAudio: HTMLAudioElement | null = null;
  private sirenPlaying: boolean = false;
  
  constructor() {
    // Classic Pac-Man sounds from the 1980 arcade game
    const audioBase = "https://assets.oasiz.ai/audio/";
    this.loadSound("waka", audioBase + "pacman_chomp.wav");
    this.loadSound("death", audioBase + "pacman_death.wav");
    this.loadSound("ghost-eat", audioBase + "pacman_eatghost.wav");
    this.loadSound("power", audioBase + "pacman_intermission.wav");
    this.loadSound("fruit", audioBase + "pacman_eatfruit.wav");
    this.loadSound("intro", audioBase + "pacman_beginning.wav");
    this.loadSound("extra-life", audioBase + "pacman_extrapac.wav");
  }
  
  private loadSound(name: string, path: string): void {
    const audio = new Audio(path);
    audio.preload = "auto";
    this.sounds.set(name, audio);
  }
  
  play(name: string): void {
    if (this.muted) return;
    const sound = this.sounds.get(name);
    if (sound) {
      sound.currentTime = 0;
      sound.volume = this.sfxVolume;
      sound.play().catch(() => {}); // Ignore errors for missing files
    }
  }
  
  playMusic(name: string, loop: boolean = true): void {
    if (this.musicPlaying === name) return;
    
    // Stop current music
    this.stopMusic();
    
    const music = this.sounds.get(name);
    if (music) {
      music.loop = loop;
      music.volume = this.musicVolume;
      music.currentTime = 0;
      music.play().catch(() => {}); // Ignore errors for missing files
      this.musicPlaying = name;
    }
  }
  
  stopMusic(): void {
    if (this.musicPlaying) {
      const music = this.sounds.get(this.musicPlaying);
      if (music) {
        music.pause();
        music.currentTime = 0;
      }
      this.musicPlaying = null;
    }
  }
  
  // Play the waka sound with proper timing (original arcade plays it on each pellet)
  playWaka(): void {
    if (this.muted) return;
    const sound = this.sounds.get("waka");
    if (sound) {
      // Only play if not already playing (prevent overlap spam)
      if (sound.paused || sound.ended) {
        sound.currentTime = 0;
        sound.volume = this.sfxVolume;
        sound.play().catch(() => {});
      }
    }
  }
  
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopMusic();
    }
    return this.muted;
  }
  
  isMuted(): boolean {
    return this.muted;
  }
}

// ============= GAME CLASS =============
class PacmanGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isMobile: boolean;
  private soundManager: SoundManager;
  
  // Layout
  private scale: number = 1;
  private scaledTileSize: number = 8;
  private offsetX: number = 0;
  private offsetY: number = 0;
  
  // Game state
  private gameState: GameState = "menu";
  private score: number = 0;
  private highScore: number = 0;
  private lives: number = 3;
  private level: number = 1;
  private dotsRemaining: number = 0;
  private totalDots: number = 0;
  
  // Stats
  private dotsEaten: number = 0;
  private ghostsEaten: number = 0;
  private ghostCombo: number = 0;
  
  // Maze data
  private maze: string[][] = [];
  private dots: boolean[][] = [];
  private powerPellets: boolean[][] = [];
  
  // Entities
  private pacman!: Pacman;
  private ghosts: Ghost[] = [];
  
  // Timing
  private lastTime: number = 0;
  private accumulator: number = 0;
  private timestep: number = 1000 / CONFIG.MAX_FPS;
  private powerTimer: number = 0;
  private readyTimer: number = 0;
  private deathTimer: number = 0;
  private levelCompleteTimer: number = 0;
  private modeTimer: number = 0;
  private currentMode: "scatter" | "chase" = "scatter";
  private modeIndex: number = 0;
  
  // Animation
  private powerPelletBlink: boolean = true;
  private blinkTimer: number = 0;
  private scaredFlash: boolean = false;
  private flashTimer: number = 0;
  
  // UI Elements
  private hudElement: HTMLElement;
  private scoreElement: HTMLElement;
  private highScoreElement: HTMLElement;
  private levelElement: HTMLElement;
  private livesDisplay: HTMLElement;
  private startScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private pauseOverlay: HTMLElement;
  private readyText: HTMLElement;
  private dpad: HTMLElement;
  
  // Touch tracking
  private touchStartX: number = 0;
  private touchStartY: number = 0;

  constructor() {
    console.log("[PacmanGame] Initializing game");
    
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.soundManager = new SoundManager();
    
    // Get UI elements
    this.hudElement = document.getElementById("hud")!;
    this.scoreElement = document.getElementById("score")!;
    this.highScoreElement = document.getElementById("highScore")!;
    this.levelElement = document.getElementById("level")!;
    this.livesDisplay = document.getElementById("livesDisplay")!;
    this.startScreen = document.getElementById("startScreen")!;
    this.gameOverScreen = document.getElementById("gameOverScreen")!;
    this.pauseOverlay = document.getElementById("pauseOverlay")!;
    this.readyText = document.getElementById("readyText")!;
    this.dpad = document.getElementById("dpad")!;
    
    // Load high score
    this.highScore = parseInt(localStorage.getItem("pacmanHighScore") || "0", 10);
    
    // Initialize
    this.initMaze();
    this.calculateLayout();
    this.initEntities();
    this.setupEventListeners();
    
    // Hide d-pad initially (will show when game starts)
    this.dpad.classList.add("hidden");
    
    // Start game loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private initMaze(): void {
    console.log("[initMaze] Parsing maze layout");
    this.maze = [];
    this.dots = [];
    this.powerPellets = [];
    this.dotsRemaining = 0;
    this.totalDots = 0;
    
    for (let row = 0; row < MAZE_LAYOUT.length; row++) {
      this.maze[row] = [];
      this.dots[row] = [];
      this.powerPellets[row] = [];
      
      for (let col = 0; col < MAZE_LAYOUT[row].length; col++) {
        const char = MAZE_LAYOUT[row][col];
        this.maze[row][col] = char;
        this.dots[row][col] = char === "o";
        this.powerPellets[row][col] = char === "O";
        
        if (char === "o" || char === "O") {
          this.dotsRemaining++;
          this.totalDots++;
        }
      }
    }
  }

  private calculateLayout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    this.canvas.width = w;
    this.canvas.height = h;
    
    if (this.isMobile) {
      // Mobile layout: game fills most of screen, HUD above, d-pad below
      const safeAreaTop = 110; // Pushed down even more to clear system buttons
      const dpadHeight = 140;  // Slightly more compact D-pad area
      const hudHeight = 40;    // More compact HUD
      const padding = 5;       // Reduced padding
      
      const availableWidth = w - 10; // More width usage
      const availableHeight = h - dpadHeight - hudHeight - safeAreaTop - padding * 2;
      
      const maxScaleX = availableWidth / (CONFIG.TILE_SIZE * CONFIG.MAZE_WIDTH);
      const maxScaleY = availableHeight / (CONFIG.TILE_SIZE * CONFIG.MAZE_HEIGHT);
      
      // Allow non-integer scaling for better space usage, but keep it reasonably sharp
      this.scale = Math.min(maxScaleX, maxScaleY);
      if (this.scale < 1) this.scale = 1;
      
      this.scaledTileSize = CONFIG.TILE_SIZE * this.scale;
      
      const mazeWidth = this.scaledTileSize * CONFIG.MAZE_WIDTH;
      const mazeHeight = this.scaledTileSize * CONFIG.MAZE_HEIGHT;
      
      // Center horizontally, position below HUD with safe area
      this.offsetX = (w - mazeWidth) / 2;
      this.offsetY = safeAreaTop + hudHeight + padding;
      
      // Position HUD below safe area
      this.hudElement.style.top = safeAreaTop + "px";
      this.hudElement.style.bottom = "auto";
      this.hudElement.style.padding = "5px 20px"; // Compact padding
      
      // Position d-pad just below the maze
      const dpadTop = this.offsetY + mazeHeight + 5;
      this.dpad.style.bottom = "auto";
      this.dpad.style.top = dpadTop + "px";
      this.dpad.style.transform = "translateX(-50%) scale(0.9)"; // Scale down d-pad slightly if needed
      
      // Position lives display below maze, left side
      this.livesDisplay.style.bottom = "auto";
      this.livesDisplay.style.top = (dpadTop + 45) + "px";
      
    } else {
      // Desktop layout
      const hudHeight = h * 0.06;
      const bottomPadding = 40;
      
      const availableWidth = w - 20;
      const availableHeight = h - hudHeight - bottomPadding;
      
      const maxScaleX = availableWidth / (CONFIG.TILE_SIZE * CONFIG.MAZE_WIDTH);
      const maxScaleY = availableHeight / (CONFIG.TILE_SIZE * CONFIG.MAZE_HEIGHT);
      
      this.scale = Math.floor(Math.min(maxScaleX, maxScaleY));
      if (this.scale < 1) this.scale = 1;
      
      this.scaledTileSize = CONFIG.TILE_SIZE * this.scale;
      
      const mazeWidth = this.scaledTileSize * CONFIG.MAZE_WIDTH;
      const mazeHeight = this.scaledTileSize * CONFIG.MAZE_HEIGHT;
      
      this.offsetX = (w - mazeWidth) / 2;
      this.offsetY = hudHeight + (availableHeight - mazeHeight) / 2;
      
      // Reset HUD position for desktop
      this.hudElement.style.top = "0px";
      this.hudElement.style.bottom = "auto";
      
      // Reset lives display for desktop
      this.livesDisplay.style.top = "auto";
      this.livesDisplay.style.bottom = "10px";
    }
    
    console.log("[calculateLayout] Scale:", this.scale, "Offset:", this.offsetX, this.offsetY);
  }

  private initEntities(): void {
    console.log("[initEntities] Creating Pacman and Ghosts");
    
    // Pacman starts at center bottom
    this.pacman = new Pacman(13.5, 23, this);
    
    // Create ghosts
    this.ghosts = [
      new Ghost("blinky", 13.5, 11, this),
      new Ghost("pinky", 13.5, 14, this),
      new Ghost("inky", 11.5, 14, this),
      new Ghost("clyde", 15.5, 14, this),
    ];
  }

  private resetPositions(): void {
    console.log("[resetPositions] Resetting entity positions");
    this.pacman.reset(13.5, 23);
    this.ghosts[0].reset(13.5, 11); // Blinky
    this.ghosts[1].reset(13.5, 14); // Pinky
    this.ghosts[2].reset(11.5, 14); // Inky
    this.ghosts[3].reset(15.5, 14); // Clyde
    
    this.powerTimer = 0;
    this.ghostCombo = 0;
    this.modeIndex = 0;
    this.modeTimer = 0;
    this.currentMode = "scatter";
    
    for (const ghost of this.ghosts) {
      ghost.setMode("scatter");
    }
  }

  private setupEventListeners(): void {
    console.log("[setupEventListeners] Setting up input handlers");
    
    // Resize handler
    window.addEventListener("resize", () => {
      this.calculateLayout();
    });
    
    // Keyboard input
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    
    // Touch/swipe input
    document.addEventListener("touchstart", (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener("touchend", (e) => this.handleTouchEnd(e), { passive: false });
    
    // D-pad buttons - support both touch and click
    const dpadBtns = document.querySelectorAll(".dpad-btn");
    dpadBtns.forEach((btn) => {
      const handleDpad = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const dir = (btn as HTMLElement).dataset.dir as Direction;
        console.log("[handleDpad] D-pad pressed:", dir);
        if (dir && this.gameState === "playing") {
          this.pacman.setDesiredDirection(dir);
        }
      };
      btn.addEventListener("touchstart", handleDpad, { passive: false });
      btn.addEventListener("mousedown", handleDpad);
    });
    
    // Start button
    document.getElementById("startButton")!.addEventListener("click", () => {
      this.startGame();
    });
    
    // Restart button
    document.getElementById("restartButton")!.addEventListener("click", () => {
      this.restartGame();
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Direction keys
    const keyMap: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
    };
    
    const mappedDir = keyMap[e.key];
    
    if (mappedDir && this.gameState === "playing") {
      this.pacman.setDesiredDirection(mappedDir);
      e.preventDefault();
    }
    
    // Pause
    if ((e.key === "Escape" || e.key === "p" || e.key === "P") && 
        (this.gameState === "playing" || this.gameState === "paused")) {
      this.togglePause();
      e.preventDefault();
    }
    
    // Start game on any key from menu
    if (this.gameState === "menu" && e.key === "Enter") {
      this.startGame();
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.gameState !== "playing") return;
    
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (this.gameState !== "playing") return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const diffX = touchEndX - this.touchStartX;
    const diffY = touchEndY - this.touchStartY;
    
    // Minimum swipe distance
    const minSwipe = 30;
    
    if (Math.abs(diffX) < minSwipe && Math.abs(diffY) < minSwipe) return;
    
    let direction: Direction;
    if (Math.abs(diffX) > Math.abs(diffY)) {
      direction = diffX > 0 ? "right" : "left";
    } else {
      direction = diffY > 0 ? "down" : "up";
    }
    
    this.pacman.setDesiredDirection(direction);
  }

  private startGame(): void {
    console.log("[startGame] Starting new game");
    
    this.soundManager.play("intro");
    this.startScreen.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.hudElement.style.display = "flex";
    
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.dotsEaten = 0;
    this.ghostsEaten = 0;
    
    this.initMaze();
    this.resetPositions();
    this.updateHUD();
    this.showReady();
  }

  private restartGame(): void {
    console.log("[restartGame] Restarting game");
    this.startGame();
  }

  private showReady(): void {
    this.gameState = "ready";
    this.readyTimer = 2000;
    this.readyText.textContent = "READY!";
    this.readyText.classList.add("show");
    this.showDpad();
  }
  
  private showDpad(): void {
    if (this.isMobile) {
      this.dpad.classList.remove("hidden");
    }
  }
  
  private hideDpad(): void {
    this.dpad.classList.add("hidden");
  }

  private togglePause(): void {
    if (this.gameState === "playing") {
      this.gameState = "paused";
      this.pauseOverlay.classList.remove("hidden");
    } else if (this.gameState === "paused") {
      this.gameState = "playing";
      this.pauseOverlay.classList.add("hidden");
    }
  }

  private gameLoop(timestamp: number): void {
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    
    this.accumulator += deltaTime;
    
    while (this.accumulator >= this.timestep) {
      this.update(this.timestep);
      this.accumulator -= this.timestep;
    }
    
    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private update(dt: number): void {
    // Update blink timer for power pellets
    this.blinkTimer += dt;
    if (this.blinkTimer >= 200) {
      this.powerPelletBlink = !this.powerPelletBlink;
      this.blinkTimer = 0;
    }
    
    if (this.gameState === "ready") {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.readyText.classList.remove("show");
        this.gameState = "playing";
      }
      return;
    }
    
    if (this.gameState === "dying") {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.lives--;
        if (this.lives <= 0) {
          this.gameOver();
        } else {
          this.resetPositions();
          this.updateHUD();
          this.showReady();
        }
      }
      return;
    }
    
    if (this.gameState === "levelcomplete") {
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.nextLevel();
      }
      return;
    }
    
    if (this.gameState !== "playing") return;
    
    // Update ghost mode timer
    this.updateGhostMode(dt);
    
    // Update power pellet timer
    if (this.powerTimer > 0) {
      this.powerTimer -= dt;
      
      // Flash when power is about to end
      if (this.powerTimer < 2000) {
        this.flashTimer += dt;
        if (this.flashTimer >= 200) {
          this.scaredFlash = !this.scaredFlash;
          this.flashTimer = 0;
        }
      }
      
      if (this.powerTimer <= 0) {
        this.endPowerMode();
      }
    }
    
    // Update Pacman
    this.pacman.update(dt);
    
    // Update ghosts
    for (const ghost of this.ghosts) {
      ghost.update(dt);
    }
    
    // Check dot collision
    this.checkDotCollision();
    
    // Check ghost collision
    this.checkGhostCollision();
    
    // Check level complete
    if (this.dotsRemaining <= 0) {
      this.levelComplete();
    }
  }

  private updateGhostMode(dt: number): void {
    if (this.powerTimer > 0) return;
    
    // Mode timing pattern (scatter/chase alternation)
    const modePattern = [
      { mode: "scatter" as const, duration: 7000 },
      { mode: "chase" as const, duration: 20000 },
      { mode: "scatter" as const, duration: 7000 },
      { mode: "chase" as const, duration: 20000 },
      { mode: "scatter" as const, duration: 5000 },
      { mode: "chase" as const, duration: 20000 },
      { mode: "scatter" as const, duration: 5000 },
      { mode: "chase" as const, duration: Infinity },
    ];
    
    this.modeTimer += dt;
    
    if (this.modeIndex < modePattern.length) {
      const currentPattern = modePattern[this.modeIndex];
      if (this.modeTimer >= currentPattern.duration) {
        this.modeTimer = 0;
        this.modeIndex++;
        
        if (this.modeIndex < modePattern.length) {
          this.currentMode = modePattern[this.modeIndex].mode;
          for (const ghost of this.ghosts) {
            if (ghost.getMode() !== "scared" && ghost.getMode() !== "eyes") {
              ghost.setMode(this.currentMode);
              ghost.reverseDirection();
            }
          }
        }
      }
    }
  }

  private checkDotCollision(): void {
    const col = Math.round(this.pacman.x);
    const row = Math.round(this.pacman.y);
    
    if (row >= 0 && row < this.dots.length && col >= 0 && col < this.dots[0].length) {
      // Check regular dot
      if (this.dots[row][col]) {
        this.dots[row][col] = false;
        this.dotsRemaining--;
        this.dotsEaten++;
        this.addScore(CONFIG.DOT_POINTS);
        this.soundManager.playWaka();
      }
      
      // Check power pellet
      if (this.powerPellets[row][col]) {
        this.powerPellets[row][col] = false;
        this.dotsRemaining--;
        this.dotsEaten++;
        this.addScore(CONFIG.POWER_PELLET_POINTS);
        this.startPowerMode();
      }
    }
  }

  private startPowerMode(): void {
    console.log("[startPowerMode] Power pellet activated");
    this.soundManager.play("power");
    this.powerTimer = CONFIG.POWER_DURATION - (this.level - 1) * 500;
    if (this.powerTimer < 1000) this.powerTimer = 1000;
    
    this.ghostCombo = 0;
    this.scaredFlash = false;
    
    for (const ghost of this.ghosts) {
      if (ghost.getMode() !== "eyes") {
        ghost.setMode("scared");
        ghost.reverseDirection();
      }
    }
  }

  private endPowerMode(): void {
    console.log("[endPowerMode] Power pellet ended");
    this.powerTimer = 0;
    this.scaredFlash = false;
    
    for (const ghost of this.ghosts) {
      if (ghost.getMode() === "scared") {
        ghost.setMode(this.currentMode);
      }
    }
  }

  private checkGhostCollision(): void {
    for (const ghost of this.ghosts) {
      const dist = gridDistance(
        { col: this.pacman.x, row: this.pacman.y },
        { col: ghost.x, row: ghost.y }
      );
      
      if (dist < 0.8) {
        if (ghost.getMode() === "scared") {
          // Eat ghost
          this.eatGhost(ghost);
        } else if (ghost.getMode() !== "eyes") {
          // Pacman dies
          this.pacmanDeath();
          return;
        }
      }
    }
  }

  private eatGhost(ghost: Ghost): void {
    console.log("[eatGhost] Eating ghost:", ghost.name);
    this.soundManager.play("ghost-eat");
    const points = CONFIG.GHOST_POINTS[Math.min(this.ghostCombo, 3)];
    this.addScore(points);
    this.ghostCombo++;
    this.ghostsEaten++;
    ghost.setMode("eyes");
  }

  private pacmanDeath(): void {
    console.log("[pacmanDeath] Pacman died");
    this.soundManager.stopMusic();
    this.soundManager.play("death");
    this.gameState = "dying";
    this.deathTimer = 1500;
    this.pacman.startDeathAnimation();
  }

  private levelComplete(): void {
    console.log("[levelComplete] Level completed");
    this.gameState = "levelcomplete";
    this.levelCompleteTimer = 2000;

    // Submit intermediate score on level completion
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
  }

  private nextLevel(): void {
    console.log("[nextLevel] Advancing to level", this.level + 1);
    this.level++;
    this.initMaze();
    this.resetPositions();
    this.updateHUD();
    this.showReady();
  }

  private gameOver(): void {
    console.log("[gameOver] Game over. Final score:", this.score);
    this.soundManager.stopMusic();
    this.gameState = "gameover";
    this.hideDpad();
    
    // Submit score
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
    
    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("pacmanHighScore", this.highScore.toString());
    }
    
    // Show game over screen
    this.hudElement.style.display = "none";
    document.getElementById("finalScore")!.textContent = this.score.toString();
    document.getElementById("dotsEaten")!.textContent = this.dotsEaten.toString();
    document.getElementById("ghostsEaten")!.textContent = this.ghostsEaten.toString();
    document.getElementById("maxLevel")!.textContent = this.level.toString();
    
    const newHighScoreEl = document.getElementById("newHighScore")!;
    if (this.score >= this.highScore && this.score > 0) {
      newHighScoreEl.classList.add("show");
    } else {
      newHighScoreEl.classList.remove("show");
    }
    
    this.gameOverScreen.classList.remove("hidden");
  }

  private addScore(points: number): void {
    this.score += points;
    this.updateHUD();
  }

  private updateHUD(): void {
    this.scoreElement.textContent = this.score.toString().padStart(2, "0");
    this.highScoreElement.textContent = Math.max(this.score, this.highScore).toString().padStart(2, "0");
    this.levelElement.textContent = this.level.toString();
    
    // Update lives display
    this.livesDisplay.innerHTML = "";
    for (let i = 0; i < this.lives - 1; i++) {
      const life = document.createElement("div");
      life.className = "life-icon";
      this.livesDisplay.appendChild(life);
    }
  }

  private render(): void {
    // Clear canvas
    this.ctx.fillStyle = COLORS.MAZE_BG;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw maze
    this.drawMaze();
    
    // Draw dots and power pellets
    this.drawPickups();
    
    // Draw entities
    if (this.gameState !== "menu") {
      this.drawPacman();
      this.drawGhosts();
    }
  }

  private drawMaze(): void {
    const ctx = this.ctx;
    const ts = this.scaledTileSize;
    
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    
    // Draw walls
    ctx.strokeStyle = COLORS.MAZE_WALL;
    ctx.lineWidth = 2;
    
    for (let row = 0; row < this.maze.length; row++) {
      for (let col = 0; col < this.maze[row].length; col++) {
        if (this.maze[row][col] === "X") {
          const x = col * ts;
          const y = row * ts;
          
          // Check neighbors to draw connected walls
          const top = row > 0 && this.maze[row - 1][col] === "X";
          const bottom = row < this.maze.length - 1 && this.maze[row + 1][col] === "X";
          const left = col > 0 && this.maze[row][col - 1] === "X";
          const right = col < this.maze[row].length - 1 && this.maze[row][col + 1] === "X";
          
          ctx.fillStyle = COLORS.MAZE_WALL;
          
          // Draw wall segment
          const inset = ts * 0.1;
          const wallWidth = ts * 0.15;
          
          // Horizontal segments
          if (left || right) {
            ctx.fillRect(
              x + (left ? 0 : ts / 2 - wallWidth / 2),
              y + ts / 2 - wallWidth / 2,
              (left && right ? ts : ts / 2 + wallWidth / 2),
              wallWidth
            );
          }
          
          // Vertical segments
          if (top || bottom) {
            ctx.fillRect(
              x + ts / 2 - wallWidth / 2,
              y + (top ? 0 : ts / 2 - wallWidth / 2),
              wallWidth,
              (top && bottom ? ts : ts / 2 + wallWidth / 2)
            );
          }
          
          // Single block (no neighbors)
          if (!top && !bottom && !left && !right) {
            ctx.fillRect(
              x + ts * 0.3,
              y + ts * 0.3,
              ts * 0.4,
              ts * 0.4
            );
          }
        }
      }
    }
    
    ctx.restore();
  }

  private drawPickups(): void {
    const ctx = this.ctx;
    const ts = this.scaledTileSize;
    
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    
    // Draw dots
    ctx.fillStyle = COLORS.DOT;
    for (let row = 0; row < this.dots.length; row++) {
      for (let col = 0; col < this.dots[row].length; col++) {
        if (this.dots[row][col]) {
          const x = col * ts + ts / 2;
          const y = row * ts + ts / 2;
          const radius = ts * 0.1;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    // Draw power pellets (blinking)
    if (this.powerPelletBlink) {
      ctx.fillStyle = COLORS.POWER_PELLET;
      for (let row = 0; row < this.powerPellets.length; row++) {
        for (let col = 0; col < this.powerPellets[row].length; col++) {
          if (this.powerPellets[row][col]) {
            const x = col * ts + ts / 2;
            const y = row * ts + ts / 2;
            const radius = ts * 0.35;
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    
    ctx.restore();
  }

  private drawPacman(): void {
    const ctx = this.ctx;
    const ts = this.scaledTileSize;
    
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    
    const x = this.pacman.x * ts + ts / 2;
    const y = this.pacman.y * ts + ts / 2;
    const radius = ts * 0.9;
    
    ctx.fillStyle = COLORS.PACMAN;
    
    if (this.gameState === "dying") {
      // Death animation
      const progress = 1 - (this.deathTimer / 1500);
      const mouthAngle = Math.PI * progress;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, mouthAngle, Math.PI * 2 - mouthAngle);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
    } else {
      // Normal animation
      const mouthAngle = this.pacman.getMouthAngle();
      const rotation = this.pacman.getRotation();
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      
      ctx.beginPath();
      ctx.arc(0, 0, radius, mouthAngle, Math.PI * 2 - mouthAngle);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    ctx.restore();
  }

  private drawGhosts(): void {
    const ctx = this.ctx;
    const ts = this.scaledTileSize;
    
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    
    for (const ghost of this.ghosts) {
      if (this.gameState === "dying") continue;
      
      const x = ghost.x * ts + ts / 2;
      const y = ghost.y * ts + ts / 2;
      const radius = ts * 0.85;
      
      // Determine color
      let color: string;
      if (ghost.getMode() === "scared") {
        color = this.scaredFlash ? COLORS.SCARED_FLASH : COLORS.SCARED;
      } else if (ghost.getMode() === "eyes") {
        // Just draw eyes
        this.drawGhostEyes(x, y, radius, ghost.direction);
        continue;
      } else {
        color = this.getGhostColor(ghost.name);
      }
      
      ctx.fillStyle = color;
      
      // Draw ghost body
      ctx.beginPath();
      ctx.arc(x, y - radius * 0.2, radius, Math.PI, 0, false);
      ctx.lineTo(x + radius, y + radius * 0.8);
      
      // Wavy bottom
      const waves = 3;
      const waveWidth = (radius * 2) / waves;
      for (let i = 0; i < waves; i++) {
        const wx = x + radius - (i + 0.5) * waveWidth;
        const wy = y + radius * 0.8;
        ctx.quadraticCurveTo(
          wx + waveWidth * 0.25, wy + radius * 0.3,
          wx, wy
        );
        ctx.quadraticCurveTo(
          wx - waveWidth * 0.25, wy - radius * 0.3,
          wx - waveWidth * 0.5, wy
        );
      }
      
      ctx.closePath();
      ctx.fill();
      
      // Draw eyes
      if (ghost.getMode() !== "scared") {
        this.drawGhostEyes(x, y, radius, ghost.direction);
      } else {
        // Scared face
        ctx.fillStyle = COLORS.EYES;
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.2, radius * 0.15, 0, Math.PI * 2);
        ctx.arc(x + radius * 0.3, y - radius * 0.2, radius * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        // Wavy mouth
        ctx.strokeStyle = COLORS.EYES;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - radius * 0.4, y + radius * 0.3);
        for (let i = 0; i < 4; i++) {
          const mx = x - radius * 0.4 + i * (radius * 0.2);
          const my = y + radius * 0.3 + (i % 2 === 0 ? 0 : radius * 0.15);
          ctx.lineTo(mx + radius * 0.1, my);
        }
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }

  private drawGhostEyes(x: number, y: number, radius: number, direction: Direction): void {
    const ctx = this.ctx;
    
    // Eye whites
    ctx.fillStyle = COLORS.EYES;
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.3, y - radius * 0.15, radius * 0.25, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(x + radius * 0.3, y - radius * 0.15, radius * 0.25, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils (direction-based offset)
    const pupilOffset = { x: 0, y: 0 };
    switch (direction) {
      case "up": pupilOffset.y = -radius * 0.1; break;
      case "down": pupilOffset.y = radius * 0.1; break;
      case "left": pupilOffset.x = -radius * 0.1; break;
      case "right": pupilOffset.x = radius * 0.1; break;
    }
    
    ctx.fillStyle = "#0000ff";
    ctx.beginPath();
    ctx.arc(x - radius * 0.3 + pupilOffset.x, y - radius * 0.15 + pupilOffset.y, radius * 0.12, 0, Math.PI * 2);
    ctx.arc(x + radius * 0.3 + pupilOffset.x, y - radius * 0.15 + pupilOffset.y, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  private getGhostColor(name: GhostName): string {
    const colors: Record<GhostName, string> = {
      blinky: COLORS.BLINKY,
      pinky: COLORS.PINKY,
      inky: COLORS.INKY,
      clyde: COLORS.CLYDE,
    };
    return colors[name];
  }

  // Public methods for entities to access
  isWall(col: number, row: number): boolean {
    const r = Math.floor(row);
    const c = Math.floor(col);
    if (r < 0 || r >= this.maze.length || c < 0 || c >= this.maze[0].length) {
      // Handle tunnel wrap
      if (r === 14 && (c < 0 || c >= this.maze[0].length)) {
        return false;
      }
      return true;
    }
    return this.maze[r][c] === "X";
  }

  canMove(x: number, y: number, direction: Direction): boolean {
    const vec = directionToVector(direction);
    const speed = 0.5; // Check further ahead
    const checkX = x + vec.x * speed;
    const checkY = y + vec.y * speed;
    
    // Check center point in the direction of movement
    const centerCol = Math.round(checkX);
    const centerRow = Math.round(checkY);
    
    let blocked = false;
    let blockReason = "";
    
    // For horizontal movement, check the tile we're moving into
    if (direction === "left" || direction === "right") {
      const targetCol = direction === "left" ? Math.floor(x - 0.5) : Math.ceil(x + 0.5);
      const currentRow = Math.round(y);
      if (this.isWall(targetCol, currentRow)) {
        blocked = true;
        blockReason = `horizontal wall at col=${targetCol}, row=${currentRow}`;
      }
    }
    
    // For vertical movement, check the tile we're moving into
    if (direction === "up" || direction === "down") {
      const targetRow = direction === "up" ? Math.floor(y - 0.5) : Math.ceil(y + 0.5);
      const currentCol = Math.round(x);
      if (this.isWall(currentCol, targetRow)) {
        blocked = true;
        blockReason = `vertical wall at col=${currentCol}, row=${targetRow}`;
      }
    }
    
    return !blocked;
  }

  getGhostHouseCenter(): Position {
    return { x: 13.5, y: 14 };
  }

  getPacmanPosition(): Position {
    return { x: this.pacman.x, y: this.pacman.y };
  }

  getPacmanDirection(): Direction {
    return this.pacman.direction;
  }

  getBlinkyPosition(): Position {
    return { x: this.ghosts[0].x, y: this.ghosts[0].y };
  }

  getLevel(): number {
    return this.level;
  }

  getMazeWidth(): number {
    return CONFIG.MAZE_WIDTH;
  }
}

// ============= PACMAN CLASS =============
class Pacman {
  x: number;
  y: number;
  direction: Direction = "left";
  private desiredDirection: Direction = "left";
  private speed: number = CONFIG.PACMAN_SPEED;
  private mouthAngle: number = 0;
  private mouthOpening: boolean = true;
  private game: PacmanGame;
  private deathAnimation: boolean = false;

  constructor(x: number, y: number, game: PacmanGame) {
    this.x = x;
    this.y = y;
    this.game = game;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.direction = "left";
    this.desiredDirection = "left";
    this.mouthAngle = 0;
    this.deathAnimation = false;
  }

  setDesiredDirection(dir: Direction): void {
    this.desiredDirection = dir;
  }

  startDeathAnimation(): void {
    this.deathAnimation = true;
  }

  update(dt: number): void {
    if (this.deathAnimation) return;
    
    // Animate mouth
    const mouthSpeed = 0.008 * dt;
    if (this.mouthOpening) {
      this.mouthAngle += mouthSpeed;
      if (this.mouthAngle >= 0.4) this.mouthOpening = false;
    } else {
      this.mouthAngle -= mouthSpeed;
      if (this.mouthAngle <= 0.05) this.mouthOpening = true;
    }
    
    // Check if we're at a grid intersection (center of tile)
    const atCenterX = Math.abs(this.x - Math.round(this.x)) < 0.08;
    const atCenterY = Math.abs(this.y - Math.round(this.y)) < 0.08;
    
    // Check if trying to reverse direction (180 turn) - allowed anytime
    const isReversing = 
      (this.direction === "up" && this.desiredDirection === "down") ||
      (this.direction === "down" && this.desiredDirection === "up") ||
      (this.direction === "left" && this.desiredDirection === "right") ||
      (this.direction === "right" && this.desiredDirection === "left");
    
    if (isReversing) {
      // Allow 180-degree turn anytime
      this.direction = this.desiredDirection;
    } else if (atCenterX && atCenterY && this.desiredDirection !== this.direction) {
      // Only allow 90-degree turns at intersections
      if (this.game.canMove(Math.round(this.x), Math.round(this.y), this.desiredDirection)) {
        // Snap to grid when turning
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.direction = this.desiredDirection;
      }
    }
    
    // Move in current direction
    let canMove = this.game.canMove(this.x, this.y, this.direction);
    
    // H6 FIX: When stuck at wall and want to turn 90 degrees, snap to nearest intersection
    if (!canMove && this.desiredDirection !== this.direction && !isReversing) {
      const isHorizontalTurn = this.desiredDirection === 'left' || this.desiredDirection === 'right';
      const isVerticalTurn = this.desiredDirection === 'up' || this.desiredDirection === 'down';
      const currentHorizontal = this.direction === 'left' || this.direction === 'right';
      const currentVertical = this.direction === 'up' || this.direction === 'down';
      
      // If moving vertically and want to turn horizontally (or vice versa)
      if ((currentVertical && isHorizontalTurn) || (currentHorizontal && isVerticalTurn)) {
        const snapX = Math.round(this.x);
        const snapY = Math.round(this.y);
        // Check if we're close enough to snap (within 0.5 tile)
        const canSnapX = Math.abs(this.x - snapX) < 0.5;
        const canSnapY = Math.abs(this.y - snapY) < 0.5;
        
        if (canSnapX && canSnapY && this.game.canMove(snapX, snapY, this.desiredDirection)) {
          this.x = snapX;
          this.y = snapY;
          this.direction = this.desiredDirection;
          canMove = true; // We just turned, now check if we can move
        }
      }
    }
    if (canMove) {
      const vec = directionToVector(this.direction);
      this.x += vec.x * this.speed;
      this.y += vec.y * this.speed;
      
      // Handle tunnel wrap
      if (this.x < -1) this.x = this.game.getMazeWidth();
      if (this.x > this.game.getMazeWidth()) this.x = -1;
    }
  }

  getMouthAngle(): number {
    return this.mouthAngle * Math.PI;
  }

  getRotation(): number {
    const rotations: Record<Direction, number> = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    };
    return rotations[this.direction];
  }
}

// ============= GHOST CLASS =============
class Ghost {
  x: number;
  y: number;
  name: GhostName;
  direction: Direction = "left";
  private mode: GhostMode = "scatter";
  private speed: number = CONFIG.GHOST_SPEED;
  private game: PacmanGame;
  private inHouse: boolean = true;
  private houseTimer: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;

  constructor(name: GhostName, x: number, y: number, game: PacmanGame) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.game = game;
    
    // Set initial direction based on ghost
    this.direction = name === "blinky" ? "left" : "down";
    this.inHouse = name !== "blinky";
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.mode = "scatter";
    this.inHouse = this.name !== "blinky";
    this.houseTimer = this.getHouseExitDelay();
    this.direction = this.name === "blinky" ? "left" : "down";
  }

  private getHouseExitDelay(): number {
    const delays: Record<GhostName, number> = {
      blinky: 0,
      pinky: 2000,
      inky: 5000,
      clyde: 8000,
    };
    return delays[this.name];
  }

  setMode(mode: GhostMode): void {
    this.mode = mode;
    
    // Update speed based on mode
    switch (mode) {
      case "scared":
        this.speed = CONFIG.GHOST_SCARED_SPEED;
        break;
      case "eyes":
        this.speed = CONFIG.GHOST_EYES_SPEED;
        break;
      default:
        this.speed = CONFIG.GHOST_SPEED + (this.game.getLevel() - 1) * 0.005;
    }
  }

  getMode(): GhostMode {
    return this.mode;
  }

  reverseDirection(): void {
    this.direction = getOppositeDirection(this.direction);
  }

  update(dt: number): void {
    // Handle ghost house exit
    if (this.inHouse) {
      this.houseTimer -= dt;
      if (this.houseTimer <= 0) {
        this.leaveHouse(dt);
      } else {
        // Bounce in house
        this.y += Math.sin(Date.now() / 200) * 0.01;
      }
      return;
    }
    
    // Eyes mode - return to ghost house
    if (this.mode === "eyes") {
      const houseCenter = this.game.getGhostHouseCenter();
      if (gridDistance({ col: this.x, row: this.y }, { col: houseCenter.x, row: houseCenter.y }) < 0.5) {
        this.mode = "scatter";
        this.speed = CONFIG.GHOST_SPEED;
        this.inHouse = true;
        this.houseTimer = 1000;
        return;
      }
    }
    
    // Calculate target
    this.calculateTarget();
    
    // Move
    this.move(dt);
  }

  private leaveHouse(dt: number): void {
    // Move up and out of house
    if (this.x < 13.4) {
      this.x += 0.05;
    } else if (this.x > 13.6) {
      this.x -= 0.05;
    } else if (this.y > 11.5) {
      this.y -= 0.05;
    } else {
      this.inHouse = false;
      this.y = 11;
      this.x = 13.5;
      this.direction = "left";
    }
  }

  private calculateTarget(): void {
    const pacman = this.game.getPacmanPosition();
    const pacmanDir = this.game.getPacmanDirection();
    
    if (this.mode === "scared") {
      // Run away from Pacman (but use standard pathfinding)
      this.targetX = pacman.x;
      this.targetY = pacman.y;
      return;
    }
    
    if (this.mode === "eyes") {
      const house = this.game.getGhostHouseCenter();
      this.targetX = house.x;
      this.targetY = house.y - 3;
      return;
    }
    
    if (this.mode === "scatter") {
      // Each ghost has a corner target
      const corners: Record<GhostName, Position> = {
        blinky: { x: 25, y: 0 },
        pinky: { x: 2, y: 0 },
        inky: { x: 27, y: 30 },
        clyde: { x: 0, y: 30 },
      };
      this.targetX = corners[this.name].x;
      this.targetY = corners[this.name].y;
      return;
    }
    
    // Chase mode - each ghost has unique targeting
    switch (this.name) {
      case "blinky":
        // Target Pacman directly
        this.targetX = pacman.x;
        this.targetY = pacman.y;
        break;
        
      case "pinky":
        // Target 4 tiles ahead of Pacman
        const pinkyOffset = directionToVector(pacmanDir);
        this.targetX = pacman.x + pinkyOffset.x * 4;
        this.targetY = pacman.y + pinkyOffset.y * 4;
        break;
        
      case "inky":
        // Mirror Blinky across 2 tiles ahead of Pacman
        const inkyOffset = directionToVector(pacmanDir);
        const pivot = {
          x: pacman.x + inkyOffset.x * 2,
          y: pacman.y + inkyOffset.y * 2,
        };
        const blinky = this.game.getBlinkyPosition();
        this.targetX = pivot.x + (pivot.x - blinky.x);
        this.targetY = pivot.y + (pivot.y - blinky.y);
        break;
        
      case "clyde":
        // Chase when far, retreat to corner when close
        const dist = gridDistance(
          { col: this.x, row: this.y },
          { col: pacman.x, row: pacman.y }
        );
        if (dist > 8) {
          this.targetX = pacman.x;
          this.targetY = pacman.y;
        } else {
          this.targetX = 0;
          this.targetY = 30;
        }
        break;
    }
  }

  private move(dt: number): void {
    // Check if at intersection (center of tile)
    const atCenterX = Math.abs(this.x - Math.round(this.x)) < 0.05;
    const atCenterY = Math.abs(this.y - Math.round(this.y)) < 0.05;
    
    if (atCenterX && atCenterY) {
      // Choose next direction at intersection
      this.chooseDirection();
    }
    
    // Move in current direction
    const vec = directionToVector(this.direction);
    const newX = this.x + vec.x * this.speed;
    const newY = this.y + vec.y * this.speed;
    
    // Check wall collision
    if (!this.game.isWall(newX, newY)) {
      this.x = newX;
      this.y = newY;
      
      // Handle tunnel wrap
      if (this.x < -1) this.x = this.game.getMazeWidth();
      if (this.x > this.game.getMazeWidth()) this.x = -1;
    } else {
      // Snap to grid and recalculate
      this.x = Math.round(this.x);
      this.y = Math.round(this.y);
      this.chooseDirection();
    }
  }

  private chooseDirection(): void {
    const directions: Direction[] = ["up", "down", "left", "right"];
    const opposite = getOppositeDirection(this.direction);
    
    let bestDir = this.direction;
    let bestDist = this.mode === "scared" ? -Infinity : Infinity;
    
    for (const dir of directions) {
      // Ghosts can't reverse direction
      if (dir === opposite) continue;
      
      // Check if this direction is valid
      const vec = directionToVector(dir);
      const testX = Math.round(this.x) + vec.x;
      const testY = Math.round(this.y) + vec.y;
      
      if (this.game.isWall(testX, testY)) continue;
      
      // Don't go up at certain tiles (ghost house entrance restriction)
      if (dir === "up" && (Math.round(this.y) === 14 || Math.round(this.y) === 26)) {
        const col = Math.round(this.x);
        if (col === 12 || col === 15) {
          if (this.mode !== "eyes") continue;
        }
      }
      
      // Calculate distance to target
      const dist = gridDistance(
        { col: testX, row: testY },
        { col: this.targetX, row: this.targetY }
      );
      
      if (this.mode === "scared") {
        // Scared ghosts go away from target (Pacman)
        if (dist > bestDist) {
          bestDist = dist;
          bestDir = dir;
        }
      } else {
        // Normal/chase mode goes toward target
        if (dist < bestDist) {
          bestDist = dist;
          bestDir = dir;
        }
      }
    }
    
    this.direction = bestDir;
  }
}

// ============= INITIALIZE GAME =============
console.log("[main] Starting Pac-Man game");
const game = new PacmanGame();
