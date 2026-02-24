/**
 * DOWNWELL - A vertical roguelike shooter
 * 
 * Fall down an endless well, shoot enemies, bounce on heads, and survive.
 * Features deterministic level generation with infinite vertical world.
 */

import { CONFIG } from "./config";
import { LevelSpawner, Entity, Platform, Gem, BaseEnemy, Weed } from "./world";
import { PlayerController, InputState } from "./player";
import { PowerUpManager, PowerUpOrb, POWERUP_INFO, POWERUP_CONSTANTS, PowerUpType } from "./powerups";
import { EnemyBullet, StaticEnemy } from "./enemies";

// ============= TYPES =============
interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= GAME STATE =============
class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: "start" | "playing" | "gameOver" = "start";
  
  private playerController: PlayerController;
  private levelSpawner: LevelSpawner;
  private powerUpManager: PowerUpManager;
  
  private activeEnemies: BaseEnemy[] = [];
  private activeGems: Gem[] = [];
  private droppedGems: Gem[] = [];
  private activePlatforms: Platform[] = [];
  private activeWeeds: Weed[] = [];
  private brokenWeeds: Set<string> = new Set();
  private enemyBullets: EnemyBullet[] = [];
  
  // Powerup state
  private lastShotEffects: { triggerBlast: boolean; triggerLightning: boolean; triggerLaser: boolean } = { triggerBlast: false, triggerLightning: false, triggerLaser: false };
  
  // Powerup aura flash (when collected, brief flash then fades to steady aura)
  private powerupAuraFlash: number = 0;  // frames remaining for the bright flash
  private powerupAuraFlashColor: string = "#fff";
  
  private cameraY: number = 0;
  private maxDepth: number = 0;
  private score: number = 0;
  private gems: number = 0;
  private scoreDepth: number = 0;
  private scoreEnemies: number = 0;
  private scoreGems: number = 0;
  private scoreBreakables: number = 0;
  private gameOverTimers: number[] = [];
  private frameCount: number = 0;
  
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  
  // Dithering
  private ditherPattern: ImageData | null = null;
  private ditherCanvas: HTMLCanvasElement | null = null;
  private ditherCtx: CanvasRenderingContext2D | null = null;
  
  // Textures
  private breakableGroundImg: HTMLImageElement | null = null;
  private breakableGroundPattern: CanvasPattern | null = null;
  private submarineImg: HTMLImageElement | null = null;
  private weedsImg: HTMLImageElement | null = null;
  private menuCrabImg: HTMLImageElement | null = null;
  private menuCrabFrame: number = 0;
  
  // Screen shake
  private screenShakeIntensity: number = 0;
  private screenShakeX: number = 0;
  private screenShakeY: number = 0;
  
  // Input state
  private input: InputState = {
    left: false,
    right: false,
    shoot: false,
    jump: false,
  };
  
  // Touch zones
  private touches: Map<number, { x: number; y: number }> = new Map();
  
  // Death bubbles (rise from killed enemies)
  private deathBubbles: { x: number; y: number; size: number; vy: number; vx: number; alpha: number; wobbleOffset: number }[] = [];

  // Hurt animations (play before death explosion)
  private hurtAnimations: {
    x: number; y: number;
    width: number; height: number;
    frame: number;
    frameTimer: number;
    maxFrames: number;
    color: string;
    direction: number;
    spriteType: "shark" | "crab" | "squid"; // Which hurt sprite to use
  }[] = [];
  
  // Hurt sprite sheets (loaded once, shared by all hurt animations)
  private hurtSpriteShark: HTMLImageElement | null = null;
  private hurtSpriteCrab: HTMLImageElement | null = null;
  private hurtSpriteSquid: HTMLImageElement | null = null;
  private hurtSpriteSharkLoaded: boolean = false;
  private hurtSpriteCrabLoaded: boolean = false;
  private hurtSpriteSquidLoaded: boolean = false;

  // Death explosions (flash + shockwave when enemies die)
  private deathExplosions: {
    x: number; y: number;
    radius: number; maxRadius: number;
    alpha: number; frame: number; maxFrames: number;
    color: string;
    // Delayed bubble spawn info
    bubbleSpawned: boolean;
  }[] = [];

  // Explosion particles (debris flying outward from enemy death)
  private explosionParticles: {
    x: number; y: number;
    vx: number; vy: number;
    size: number; alpha: number;
    color: string;
    life: number; maxLife: number;
    rotation: number; rotationSpeed: number;
  }[] = [];

  // Platform crumble debris (chunky sand blocks flying outward)
  private crumbleDebris: {
    x: number; y: number;
    vx: number; vy: number;
    width: number; height: number;
    alpha: number;
    rotation: number; rotationSpeed: number;
    life: number; maxLife: number;
    r: number; g: number; b: number; // sand color
  }[] = [];

  // Sand fall particles (granular sand grains falling down)
  private sandParticles: {
    x: number; y: number;
    vx: number; vy: number;
    size: number; alpha: number;
    life: number; maxLife: number;
    r: number; g: number; b: number;
  }[] = [];

  // Floating damage text for player hits
  private damageTexts: {
    x: number; y: number;
    vy: number;
    alpha: number;
    life: number;
    maxLife: number;
    text: string;
  }[] = [];
  private deathFreezeFrames: number = 0;
  private deathFreezeKiller: { x: number; y: number } | null = null;
  
  // Track previous HP for bubble pop detection
  private previousHp: number = CONFIG.PLAYER_MAX_HP;
  
  private settings: Settings = { music: true, fx: true, haptics: true };
  private isMobile: boolean = false;
  
  // Animation frame tracking for iOS WebView reliability
  private animFrameId: number = 0;
  private isVisible: boolean = true;
  
  // Fixed timestep (cap logic at 60fps)
  private lastFrameTime: number = 0;
  private readonly TARGET_FRAME_MS: number = 1000 / 60; // ~16.67ms
  private accumulator: number = 0;
  
  // Audio
  private audioCtx: AudioContext | null = null;
  private ambienceAudio: HTMLAudioElement | null = null;
  private bulletBuffer: AudioBuffer | null = null;
  private laserBuffer: AudioBuffer | null = null;
  private gemBuffer: AudioBuffer | null = null;
  private enemyCrunchBuffer: AudioBuffer | null = null;
  
  // Menu animation entities
  private menuEnemies: BaseEnemy[] = [];
  private menuWeedsDrawn: boolean = false;
  
  constructor() {
    console.log("[Game] Initializing Downwell");
    
    this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false; // Crisp pixel art
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    
    this.levelSpawner = new LevelSpawner();
    this.playerController = new PlayerController();
    this.powerUpManager = new PowerUpManager();
    this.playerController.setHapticCallback((type) => this.triggerHaptic(type));
    this.playerController.setScreenShakeCallback((intensity) => this.addScreenShake(intensity));
    this.playerController.setShootCallback(() => this.onPlayerShoot());
    
    this.setupEventListeners();
    this.loadSettings();
    this.resizeCanvas();
    this.initDitherPattern();
    this.loadTextures();
    this.loadAudio();
    this.initMenuEntities();
    
    // Ensure DOM is in correct initial state (handles WebView soft reloads)
    this.resetDOMState();
    
    // Start game loop
    this.gameLoop();
  }
  
  private setupEventListeners(): void {
    // Start button
    document.getElementById("start-btn")?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.startGame();
    });
    
    // Restart button
    document.getElementById("restart-btn")?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.startGame();
    });
    
    // Settings button
    document.getElementById("settings-btn")?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.openSettings();
    });
    
    // Settings toggles
    document.getElementById("toggle-music")?.addEventListener("click", () => {
      this.toggleSetting("music");
    });
    
    document.getElementById("toggle-fx")?.addEventListener("click", () => {
      this.toggleSetting("fx");
    });
    
    document.getElementById("toggle-haptics")?.addEventListener("click", () => {
      this.toggleSetting("haptics");
    });
    
    // Settings close
    document.getElementById("settings-close")?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.closeSettings();
    });
    
    // Keyboard controls (for testing, spec says touch-only)
    window.addEventListener("keydown", (e) => {
      if (this.gameState !== "playing") return;
      const isLeftKey = e.code === "ArrowLeft" || e.code === "KeyA";
      const isRightKey = e.code === "ArrowRight" || e.code === "KeyD";
      const isShootKey = e.code === "Space" || e.code === "ArrowDown" || e.code === "KeyS" || e.code === "ShiftLeft" || e.code === "ShiftRight";
      const isJumpKey = e.code === "ArrowUp" || e.code === "KeyW";
      
      if (isLeftKey) {
        this.input.left = true;
        e.preventDefault();
      }
      if (isRightKey) {
        this.input.right = true;
        e.preventDefault();
      }
      if (isShootKey) {
        this.input.shoot = true;
        if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
          console.log("[Keyboard]", "Shift pressed for shoot");
        }
        e.preventDefault();
      }
      if (isJumpKey) {
        this.input.jump = true;
        e.preventDefault();
      }
    });
    
    window.addEventListener("keyup", (e) => {
      const isLeftKey = e.code === "ArrowLeft" || e.code === "KeyA";
      const isRightKey = e.code === "ArrowRight" || e.code === "KeyD";
      const isShootKey = e.code === "Space" || e.code === "ArrowDown" || e.code === "KeyS" || e.code === "ShiftLeft" || e.code === "ShiftRight";
      const isJumpKey = e.code === "ArrowUp" || e.code === "KeyW";

      if (isLeftKey) {
        this.input.left = false;
      }
      if (isRightKey) {
        this.input.right = false;
      }
      if (isShootKey) {
        this.input.shoot = false;
      }
      if (isJumpKey) {
        this.input.jump = false;
      }
    });
    
    // Touch controls (mobile spec)
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.tryStartAmbienceFromInteraction();
      this.handleTouchStart(e);
    }, { passive: false });
    
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      this.handleTouchMove(e);
    }, { passive: false });
    
    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.handleTouchEnd(e);
    }, { passive: false });
    
    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      this.handleTouchEnd(e);
    }, { passive: false });
    
    // Mouse controls (for desktop testing)
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.gameState !== "playing") return;
      this.tryStartAmbienceFromInteraction();
      this.handleMouseInput(e.clientX, e.clientY);
    });
    
    this.canvas.addEventListener("mouseup", () => {
      this.clearInputState();
    });

    // Prevent sticky input if mouse button is released outside the canvas
    window.addEventListener("mouseup", () => {
      this.clearInputState();
    });

    // Prevent sticky input if keyboard focus leaves the game window
    window.addEventListener("blur", () => {
      this.clearInputState();
    });
    
    // Resize handler
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });
    
    // iOS WebView: also listen to visualViewport resize events
    if ((window as any).visualViewport) {
      (window as any).visualViewport.addEventListener("resize", () => {
        this.resizeCanvas();
      });
    }
    
    // Handle visibility changes (iOS WebView backgrounding)
    // When the app comes back to foreground, rAF may have stopped - restart it
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("[Game] Visibility restored, ensuring game loop is running");
        this.isVisible = true;
        this.resizeCanvas();
        this.ensureGameLoopRunning();
      } else {
        this.isVisible = false;
        this.clearInputState();
      }
    });
    
    // iOS WebView specific: pageshow event fires when navigating back
    window.addEventListener("pageshow", (e) => {
      if ((e as PageTransitionEvent).persisted) {
        console.log("[Game] Page restored from bfcache, restarting loop");
        this.resizeCanvas();
        this.ensureGameLoopRunning();
      }
    });
  }
  
  private handleTouchStart(e: TouchEvent): void {
    if (this.gameState !== "playing") return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    this.updateInputFromTouches();
  }
  
  private handleTouchMove(e: TouchEvent): void {
    if (this.gameState !== "playing") return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    this.updateInputFromTouches();
  }
  
  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.touches.delete(touch.identifier);
    }
    this.updateInputFromTouches();
  }
  
  /** Get CSS display width of the canvas (not the buffer width) */
  private getDisplayWidth(): number {
    const vv = (window as any).visualViewport;
    return vv ? Math.round(vv.width) : window.innerWidth;
  }
  
  private updateInputFromTouches(): void {
    // Reset input
    this.input.left = false;
    this.input.right = false;
    this.input.shoot = false;
    this.input.jump = false;
    
    // Use CSS pixel screen width (not buffer width which is DPR-scaled)
    const screenWidth = this.getDisplayWidth();
    const leftZone = screenWidth * 0.33;
    const rightZone = screenWidth * 0.67;
    
    for (const touch of this.touches.values()) {
      // Left third = move left
      if (touch.x < leftZone) {
        this.input.left = true;
      } 
      // Right third = move right
      else if (touch.x > rightZone) {
        this.input.right = true;
      } 
      // Center third = tap action (jump if grounded, shoot if airborne)
      else {
        // Set both - player controller will decide based on grounded state
        this.input.jump = true;
        this.input.shoot = true;
      }
    }
  }
  
  private handleMouseInput(clientX: number, clientY: number): void {
    // Use CSS pixel screen width (not buffer width which is DPR-scaled)
    const screenWidth = this.getDisplayWidth();
    const leftZone = screenWidth * 0.33;
    const rightZone = screenWidth * 0.67;
    
    // Left third = move left
    if (clientX < leftZone) {
      this.input.left = true;
    } 
    // Right third = move right
    else if (clientX > rightZone) {
      this.input.right = true;
    } 
    // Center third = tap action (jump if grounded, shoot if airborne)
    else {
      this.input.jump = true;
      this.input.shoot = true;
    }
  }

  private clearInputState(): void {
    this.input.left = false;
    this.input.right = false;
    this.input.shoot = false;
    this.input.jump = false;
  }
  
  private resizeCanvas(): void {
    // Use visualViewport for accurate dimensions in iOS WebViews,
    // falling back to window.innerWidth/Height
    const vv = (window as any).visualViewport;
    const w = vv ? Math.round(vv.width) : window.innerWidth;
    const h = vv ? Math.round(vv.height) : window.innerHeight;
    
    // Use device pixel ratio for crisp rendering but cap it to avoid huge buffers
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // Set canvas buffer size
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    
    // Set CSS display size to match viewport exactly
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    
    // Calculate scale to fit internal resolution
    const scaleX = this.canvas.width / CONFIG.INTERNAL_WIDTH;
    const scaleY = this.canvas.height / CONFIG.INTERNAL_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);
    
    // Center the game
    this.offsetX = (this.canvas.width - CONFIG.INTERNAL_WIDTH * this.scale) / 2;
    this.offsetY = (this.canvas.height - CONFIG.INTERNAL_HEIGHT * this.scale) / 2;
    
    // Ensure crisp pixel rendering after resize
    this.ctx.imageSmoothingEnabled = false;
    
    // Position HP bar and ammo slider centered between wall edge and screen edge
    this.positionSideBars();
    
    // Reinitialize dither pattern for new canvas size
    this.initDitherPattern();
  }
  
  private positionSideBars(): void {
    const hpBar = document.getElementById("hp-bar");
    const ammoSlider = document.getElementById("ammo-slider");
    
    // Convert buffer coordinates to CSS pixel coordinates for DOM positioning
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // The game's sand wall occupies WALL_WIDTH (32px) on each side in internal coords
    // In CSS screen coords, the left wall inner edge is at: (offsetX + WALL_WIDTH * scale) / dpr
    const leftWallScreenEdge = (this.offsetX + CONFIG.WALL_WIDTH * this.scale) / dpr;
    const leftCenter = leftWallScreenEdge / 2;
    
    // Right wall inner edge in CSS screen coords
    const rightWallScreenEdge = (this.offsetX + (CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH) * this.scale) / dpr;
    const rightEdge = this.canvas.width / dpr;
    const rightCenter = rightWallScreenEdge + (rightEdge - rightWallScreenEdge) / 2;
    
    if (hpBar) {
      hpBar.style.left = `${leftCenter - 7}px`; // 7 = half of 14px width
      hpBar.style.top = "50%";
      hpBar.style.transform = "translateY(-50%)";
    }
    
    if (ammoSlider) {
      ammoSlider.style.left = `${rightCenter - 7}px`; // 7 = half of 14px width
      ammoSlider.style.right = "auto";
      ammoSlider.style.top = "50%";
      ammoSlider.style.transform = "translateY(-50%)";
    }
  }
  
  private initDitherPattern(): void {
    // Create an offscreen canvas for processing
    this.ditherCanvas = document.createElement("canvas");
    this.ditherCanvas.width = this.canvas.width;
    this.ditherCanvas.height = this.canvas.height;
    this.ditherCtx = this.ditherCanvas.getContext("2d", { willReadFrequently: true })!;
  }
  
  private applyDithering(): void {
    if (!this.ditherCtx || !this.ditherCanvas) return;
    
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Dither settings from config
    const pixelSize = CONFIG.DITHER_PIXEL_SIZE;
    const strength = CONFIG.DITHER_STRENGTH;
    
    // Skip dithering if strength is 0
    if (strength <= 0) return;
    
    // Bayer 4x4 ordered dithering matrix (normalized to 0-1)
    const bayerMatrix = [
      [ 0/16,  8/16,  2/16, 10/16],
      [12/16,  4/16, 14/16,  6/16],
      [ 3/16, 11/16,  1/16,  9/16],
      [15/16,  7/16, 13/16,  5/16]
    ];
    
    // Get the current canvas image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Process in blocks of pixelSize for chunky pixels
    for (let by = 0; by < height; by += pixelSize) {
      for (let bx = 0; bx < width; bx += pixelSize) {
        // Sample the center of the block
        const sampleX = Math.min(bx + Math.floor(pixelSize / 2), width - 1);
        const sampleY = Math.min(by + Math.floor(pixelSize / 2), height - 1);
        const sampleI = (sampleY * width + sampleX) * 4;
        
        // Get RGB
        const r = data[sampleI];
        const g = data[sampleI + 1];
        const b = data[sampleI + 2];
        
        // Check if this is a cyan/teal pixel (gems are #0ff = rgb(0, 255, 255))
        const isCyan = b > 200 && g > 200 && r < 100;
        
        // Check if this is a red pixel (blood cracks - #8B0000 or #CD5C5C range)
        const isRed = r > 100 && g < 100 && b < 100;
        
        // Convert to grayscale (luminance)
        const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Get dither threshold from Bayer matrix, adjusted by strength
        const matrixX = Math.floor(bx / pixelSize) % 4;
        const matrixY = Math.floor(by / pixelSize) % 4;
        // Strength adjusts how much the threshold varies (lower = more gray tones)
        const baseThreshold = 0.5;
        const threshold = baseThreshold + (bayerMatrix[matrixY][matrixX] - 0.5) * strength;
        
        // Determine output color
        let outR: number, outG: number, outB: number;
        
        if (isCyan) {
          // Gems: dither between yellow and dark yellow/black
          if (gray > threshold) {
            outR = 255; outG = 255; outB = 0; // Bright yellow
          } else {
            outR = Math.floor(128 * strength); 
            outG = Math.floor(128 * strength); 
            outB = 0; // Dark yellow (fades with lower strength)
          }
        } else if (isRed) {
          // Blood cracks: dither between bright red and dark red
          if (gray > threshold) {
            outR = 200; outG = 0; outB = 0; // Bright red
          } else {
            outR = Math.floor(80 * strength); 
            outG = 0; 
            outB = 0; // Dark red
          }
        } else {
          // Everything else: black and white (or gray tones at lower strength)
          if (strength >= 1.0) {
            const output = gray > threshold ? 255 : 0;
            outR = output; outG = output; outB = output;
          } else {
            // Blend between original grayscale and dithered based on strength
            const dithered = gray > threshold ? 255 : 0;
            const grayValue = Math.floor(gray * 255);
            const output = Math.floor(grayValue * (1 - strength) + dithered * strength);
            outR = output; outG = output; outB = output;
          }
        }
        
        // Fill the entire block with the dithered color
        for (let py = by; py < by + pixelSize && py < height; py++) {
          for (let px = bx; px < bx + pixelSize && px < width; px++) {
            const i = (py * width + px) * 4;
            data[i] = outR;     // R
            data[i + 1] = outG; // G
            data[i + 2] = outB; // B
            // Keep alpha as is
          }
        }
      }
    }
    
    // Put the processed image back
    ctx.putImageData(imageData, 0, 0);
  }
  
  private loadTextures(): void {
    // Load breakable ground texture
    this.breakableGroundImg = new Image();
    this.breakableGroundImg.onload = () => {
      console.log("[Game] Breakable ground texture loaded");
      this.breakableGroundPattern = this.ctx.createPattern(this.breakableGroundImg!, "repeat");
    };
    this.breakableGroundImg.src = "assets/breakable_ground.png";
    
    // Load submarine sprite
    this.submarineImg = new Image();
    this.submarineImg.onload = () => {
      console.log("[Game] Submarine sprite loaded");
    };
    this.submarineImg.src = "assets/submarine.png";
    
    // Load weeds sprite sheet (4 cols x 2 rows, 7 sprites)
    this.weedsImg = new Image();
    this.weedsImg.onload = () => {
      console.log("[Game] Weeds sprite sheet loaded");
    };
    this.weedsImg.src = "assets/weeds.png";
    
    // Load menu crab sprite sheet (4 frames, 96x96 per frame)
    this.menuCrabImg = new Image();
    this.menuCrabImg.onload = () => {
      console.log("[Game] Menu crab sprite loaded");
    };
    this.menuCrabImg.src = "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Idle.png";
    
    // Load hurt animation sprite sheets
    // Shark hurt sprite (2 frames, 96x96 per frame) - used for HORIZONTAL enemies
    this.hurtSpriteShark = new Image();
    this.hurtSpriteShark.onload = () => {
      console.log("[Game] Shark hurt sprite sheet loaded");
      this.hurtSpriteSharkLoaded = true;
    };
    this.hurtSpriteShark.onerror = () => {
      console.warn("[Game] Failed to load shark hurt sprite");
    };
    this.hurtSpriteShark.src = "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/1/Hurt.png";
    
    // Crab hurt sprite (2 frames, 96x96 per frame) - used for STATIC enemies
    this.hurtSpriteCrab = new Image();
    this.hurtSpriteCrab.onload = () => {
      console.log("[Game] Crab hurt sprite sheet loaded");
      this.hurtSpriteCrabLoaded = true;
    };
    this.hurtSpriteCrab.onerror = () => {
      console.warn("[Game] Failed to load crab hurt sprite");
    };
    this.hurtSpriteCrab.src = "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Hurt.png";
    
    // Squid hurt sprite (2 frames, 96x96 per frame) - used for EXPLODER enemies
    this.hurtSpriteSquid = new Image();
    this.hurtSpriteSquid.onload = () => {
      console.log("[Game] Squid hurt sprite sheet loaded");
      this.hurtSpriteSquidLoaded = true;
    };
    this.hurtSpriteSquid.onerror = () => {
      console.warn("[Game] Failed to load squid hurt sprite");
    };
    this.hurtSpriteSquid.src = "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/2/Hurt.png";
  }
  
  private loadAudio(): void {
    // Ambience uses HTMLAudioElement (long looping track)
    this.ambienceAudio = new Audio("assets/sfx/abyssal-echoes.mp3");
    this.ambienceAudio.loop = true;
    this.ambienceAudio.volume = 0.2;
    this.ambienceAudio.preload = "auto";
    this.ambienceAudio.addEventListener("canplaythrough", () => {
      console.log("[loadAudio]", "Background music ready");
      this.tryStartAmbienceFromInteraction();
    });
    this.ambienceAudio.addEventListener("error", () => {
      console.log("[loadAudio]", "Failed to load background music file");
    });
    console.log("[Game] Ambience audio loaded");
    
    // SFX use Web Audio API for instant, overlapping playback
    this.decodeAudioFile("assets/sfx/zap-hiphop-b.wav").then((buf) => {
      this.bulletBuffer = buf;
      console.log("[Game] Bullet audio decoded");
    });
    
    this.decodeAudioFile("assets/sfx/zap-exile.wav").then((buf) => {
      this.laserBuffer = buf;
      console.log("[Game] Laser audio decoded");
    });

    this.decodeAudioFile("assets/sfx/gem-pickup.mp3").then((buf) => {
      this.gemBuffer = buf;
      console.log("[Game] Gem pickup audio decoded");
    });

    this.decodeAudioFile("assets/sfx/enemy-crunch.mp3").then((buf) => {
      this.enemyCrunchBuffer = buf;
      console.log("[loadAudio]", "Enemy crunch audio decoded");
    });
  }
  
  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }
  
  private async decodeAudioFile(url: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getAudioCtx();
      return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn("[Game] Failed to decode audio:", url, e);
      return null;
    }
  }
  
  private playSfx(buffer: AudioBuffer | null, volume: number): void {
    if (!buffer) return;
    
    const ctx = this.getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    gain.gain.value = volume;
    
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
  }
  
  private playBulletSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.bulletBuffer, 0.5);
  }
  
  private playLaserSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.laserBuffer, 1.0);
  }

  private playGemSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.gemBuffer, 0.35);
  }

  private playHurtSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.1;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playDeathSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.22;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private startDeathFreeze(killerX: number, killerY: number): void {
    if (this.deathFreezeFrames > 0) return;
    this.deathFreezeFrames = 120;
    this.deathFreezeKiller = { x: killerX, y: killerY };
    this.playDeathSound();
    this.triggerHaptic("error");
  }

  private applyPlayerDamage(killerX: number, killerY: number): void {
    if (this.playerController.isInvulnerable()) return;
    const player = this.playerController.getPlayer();
    this.playerController.takeDamage();
    this.spawnDamageText(player.x, player.y - player.height * 0.6, "-1");
    this.playHurtSound();
    if (this.playerController.isDead()) {
      this.startDeathFreeze(killerX, killerY);
    }
  }

  private playEnemyCrunchSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.enemyCrunchBuffer, 0.45);
  }
  
  private startAmbience(): void {
    if (!this.settings.music || !this.ambienceAudio) return;
    
    // Ensure AudioContext is active (needed on mobile after user gesture)
    this.getAudioCtx();
    
    this.ambienceAudio.currentTime = 0;
    this.ambienceAudio.play().catch(() => {
      console.log("[Game] Ambience autoplay blocked, will retry on interaction");
    });
  }

  private tryStartAmbienceFromInteraction(): void {
    if (this.gameState !== "playing" || !this.settings.music || !this.ambienceAudio) return;
    if (!this.ambienceAudio.paused) return;

    this.getAudioCtx();
    this.ambienceAudio.play().catch(() => {});
  }
  
  private stopAmbience(): void {
    if (!this.ambienceAudio) return;
    
    this.ambienceAudio.pause();
    this.ambienceAudio.currentTime = 0;
  }
  
  private initMenuEntities(): void {
    // Menu initialization (currently empty - no enemies on menu)
  }
  
  /** Reset DOM elements to their initial state.
   *  Handles iOS WebView soft reloads where the DOM may retain
   *  stale classes/styles from a previous game session. */
  private resetDOMState(): void {
    // Show start screen, hide game-over screen
    document.getElementById("start-screen")?.classList.remove("hidden");
    document.getElementById("game-over-screen")?.classList.add("hidden");
    
    // Hide gameplay UI
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "none";
    document.getElementById("settings-btn")?.classList.add("hidden");
    document.getElementById("ammo-slider")?.classList.add("hidden");
    document.getElementById("hp-bar")?.classList.add("hidden");
    
    // Hide settings modal
    document.getElementById("settings-modal")?.classList.add("hidden");
    
    // Reset HP bubbles
    const bubbles = document.querySelectorAll(".hp-bubble");
    bubbles.forEach((bubble) => {
      bubble.classList.remove("popped", "empty");
    });
    
    console.log("[Game] DOM state reset for clean initialization");
  }
  
  private drawTitleWeeds(): void {
    if (this.menuWeedsDrawn || !this.weedsImg || !this.weedsImg.complete) return;
    this.menuWeedsDrawn = true;
    
    const sheetW = this.weedsImg.naturalWidth;
    const sheetH = this.weedsImg.naturalHeight;
    const cols = 4;
    const rows = 2;
    const spriteW = sheetW / cols;
    const spriteH = sheetH / rows;
    
    // Draw weed sprites into the title canvases
    const drawWeedToCanvas = (canvasId: string, spriteIndex: number, flipX: boolean) => {
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      
      const col = spriteIndex % cols;
      const row = Math.floor(spriteIndex / cols);
      
      ctx.clearRect(0, 0, 48, 48);
      
      if (flipX) {
        ctx.save();
        ctx.translate(48, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(
        this.weedsImg!,
        col * spriteW, row * spriteH, spriteW, spriteH,
        0, 0, 48, 48
      );
      
      if (flipX) {
        ctx.restore();
      }
    };
    
    // Different weed sprites for each position
    drawWeedToCanvas("weed-canvas-left", 1, false);   // Red coral
    drawWeedToCanvas("weed-canvas-right", 1, true);    // Red coral flipped
    drawWeedToCanvas("weed-canvas-top", 6, false);     // Starfish
  }
  
  private addScreenShake(intensity: number): void {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
  }
  
  private onPlayerShoot(): void {
    // Query powerup manager for special shot effects
    this.lastShotEffects = this.powerUpManager.onPlayerShoot();
    
    // Tag the bullet that was just created with powerup flags
    this.playerController.tagLastBullet(
      this.lastShotEffects.triggerBlast && this.powerUpManager.hasPowerUp("BLAST"),
      this.lastShotEffects.triggerLightning && this.powerUpManager.hasPowerUp("LIGHTNING")
    );
    
    // Play bullet sound
    this.playBulletSound();

    // Show ammo depletion feedback when the last bullet is spent.
    const player = this.playerController.getPlayer();
    if (player.ammo <= 0) {
      this.spawnDamageText(player.x, player.y - player.height * 0.8, "Empty!");
    }
    
    // If laser is active, fire a laser beam immediately
    if (this.lastShotEffects.triggerLaser) {
      this.powerUpManager.spawnLaserBeam(
        player.x,
        player.y + player.height / 2,
        this.cameraY + CONFIG.INTERNAL_HEIGHT + 100
      );
      
      // Play laser sound
      this.playLaserSound();
    }
  }
  
  private updateScreenShake(): void {
    if (this.screenShakeIntensity > 0) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
      this.screenShakeIntensity *= 0.9; // Decay
      if (this.screenShakeIntensity < 0.1) {
        this.screenShakeIntensity = 0;
        this.screenShakeX = 0;
        this.screenShakeY = 0;
      }
    }
  }
  
  private loadSettings(): Settings {
    const saved = localStorage.getItem("downwellSettings");
    if (saved) {
      this.settings = JSON.parse(saved);
    }
    this.updateSettingsUI();
    return this.settings;
  }
  
  private saveSettings(): void {
    localStorage.setItem("downwellSettings", JSON.stringify(this.settings));
  }
  
  private updateSettingsUI(): void {
    document.getElementById("toggle-music")?.classList.toggle("active", this.settings.music);
    document.getElementById("toggle-fx")?.classList.toggle("active", this.settings.fx);
    document.getElementById("toggle-haptics")?.classList.toggle("active", this.settings.haptics);
  }
  
  private toggleSetting(key: keyof Settings): void {
    this.settings[key] = !this.settings[key];
    this.updateSettingsUI();
    this.saveSettings();
    this.triggerHaptic("light");
    
    // Handle music toggle during gameplay
    if (key === "music") {
      if (this.settings.music && this.gameState === "playing") {
        this.startAmbience();
      } else {
        this.stopAmbience();
      }
    }
  }
  
  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }
  
  private openSettings(): void {
    document.getElementById("settings-modal")?.classList.remove("hidden");
  }
  
  private closeSettings(): void {
    document.getElementById("settings-modal")?.classList.add("hidden");
  }
  
  private startGame(): void {
    console.log("[Game] Starting game");
    
    this.gameState = "playing";
    this.score = 0;
    this.gems = 0;
    this.scoreDepth = 0;
    this.scoreEnemies = 0;
    this.scoreGems = 0;
    this.scoreBreakables = 0;
    this.maxDepth = 0;
    this.frameCount = 0;
    this.cameraY = 0;
    this.clearGameOverTimers();
    
    // Reset input
    this.input = { left: false, right: false, shoot: false, jump: false };
    this.touches.clear();
    this.deathBubbles = [];
    this.hurtAnimations = [];
    this.enemyBullets = [];
    this.droppedGems = [];
    this.brokenWeeds.clear();
    this.damageTexts = [];
    this.deathFreezeFrames = 0;
    this.deathFreezeKiller = null;
    
    // Reset level spawner
    this.levelSpawner.reset();
    
    // Reset player
    this.playerController.reset();
    
    // Reset powerup system
    this.powerUpManager.reset();
    this.lastShotEffects = { triggerBlast: false, triggerLightning: false, triggerLaser: false };
    this.powerupAuraFlash = 0;
    
    // Reset HP tracking for bubble pop detection
    this.previousHp = CONFIG.PLAYER_MAX_HP;
    
    // Reset bubble states
    const bubbles = document.querySelectorAll(".hp-bubble");
    bubbles.forEach((bubble) => {
      bubble.classList.remove("popped", "empty");
    });
    
    // Hide start screen, show HUD and settings button
    document.getElementById("start-screen")?.classList.add("hidden");
    document.getElementById("game-over-screen")?.classList.add("hidden");
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "block";
    document.getElementById("settings-btn")?.classList.remove("hidden");
    document.getElementById("ammo-slider")?.classList.remove("hidden");
    document.getElementById("hp-bar")?.classList.remove("hidden");
    
    // Start ambience music
    this.startAmbience();
    
    this.updateHUD();
  }
  
  private gameOver(): void {
    console.log("[Game] Game over. Final score:", this.score, "Depth:", this.maxDepth);
    
    this.gameState = "gameOver";
    
    // Stop ambience music
    this.stopAmbience();
    
    // Submit score
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
    
    // Show game over screen
    document.getElementById("game-over-screen")?.classList.remove("hidden");
    this.animateGameOverScoreBreakdown();
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "none";
    document.getElementById("settings-btn")?.classList.add("hidden");
    document.getElementById("ammo-slider")?.classList.add("hidden");
    document.getElementById("hp-bar")?.classList.add("hidden");
    
    this.triggerHaptic("error");
  }
  
  private update(): void {
    this.frameCount++;
    
    if (this.gameState !== "playing") return;

    if (this.deathFreezeFrames > 0) {
      this.deathFreezeFrames--;
      if (this.deathFreezeFrames <= 0) {
        this.gameOver();
      }
      return;
    }
    
    // Update powerup aura flash timer
    if (this.powerupAuraFlash > 0) {
      this.powerupAuraFlash--;
    }
    
    const player = this.playerController.getPlayer();
    
    // 1. Input & Movement System (handled by PlayerController)
    this.playerController.handleInput(this.input);
    this.playerController.updateMovement(this.input);
    
    // Update depth score
    const depth = Math.floor(player.y / 10);
    if (depth > this.maxDepth) {
      const delta = (depth - this.maxDepth) * CONFIG.SCORE_PER_DEPTH;
      this.score += delta;
      this.scoreDepth += delta;
      this.maxDepth = depth;
    }
    
    // Check kill plane
    const killedByFall = this.playerController.checkKillPlane(this.cameraY);
    if (killedByFall) {
      const p = this.playerController.getPlayer();
      this.startDeathFreeze(p.x, this.cameraY + CONFIG.INTERNAL_HEIGHT + 70);
      return;
    }
    
    // 2. Enemy System
    this.updateEnemies();
    this.updateDroppedGems();
    
    // 3. Weapon System
    this.updateBullets();
    this.updateEnemyBullets();
    
    // 4. Physics & Collision
    this.resolveCollisions();
    
    // 5. Combo System
    this.playerController.updateCombo();
    
    // 6. Camera
    this.updateCamera();
    
    // 7. Death effects (hurt animations, explosions, particles, bubbles)
    this.updateHurtAnimations();
    this.updateDeathExplosions();
    this.updateExplosionParticles();
    this.updateDeathBubbles();
    this.updateDamageTexts();

    // 8. Platform crumble & sand effects
    this.updateCrumbleDebris();
    this.updateSandParticles();
    
    // 9. Powerup System
    this.updatePowerUps();
    
    // 10. Cleanup
    this.levelSpawner.cleanupChunks(this.cameraY);
    
    // Update HUD
    this.updateHUD();
    
    // Check fail states
    if (this.playerController.isDead() && this.deathFreezeFrames <= 0) {
      this.gameOver();
    }
  }
  
  private updateEnemies(): void {
    const visible = this.levelSpawner.getVisibleEntities(this.cameraY, CONFIG.INTERNAL_HEIGHT);
    this.activeEnemies = visible.enemies;
    this.activePlatforms = visible.platforms;
    this.activeGems = visible.gems;
    this.activeWeeds = visible.weeds.filter((weed) => !this.brokenWeeds.has(this.getWeedKey(weed)));
    
    const player = this.playerController.getPlayer();
    
    // Update each enemy using their class-specific behavior
    for (const enemy of this.activeEnemies) {
      enemy.update(player.x, player.y);

      // Horizontal movers should never enter cave walls.
      // Use actual generated wall geometry at this enemy's Y, not static WALL_WIDTH.
      if (enemy.type === "HORIZONTAL" || enemy.type === "EXPLODER") {
        this.constrainEnemyInsideWalls(enemy);
      }
      
      // Collect bullets from static enemies
      if (enemy instanceof StaticEnemy) {
        const bullet = enemy.getPendingBullet();
        if (bullet) {
          this.enemyBullets.push(bullet);
        }
      }
    }
  }

  private constrainEnemyInsideWalls(enemy: BaseEnemy): void {
    const sampleY = enemy.y + enemy.height * 0.5;
    let leftBound = CONFIG.WALL_WIDTH;
    let rightBound = CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH;

    for (const platform of this.activePlatforms) {
      if (!platform.isWall) continue;
      if (sampleY < platform.y || sampleY > platform.y + platform.height) continue;
      if (platform.x <= 0) {
        leftBound = Math.max(leftBound, platform.x + platform.width);
      } else {
        rightBound = Math.min(rightBound, platform.x);
      }
    }

    if (rightBound <= leftBound) return;

    if (enemy.x < leftBound) {
      enemy.x = leftBound;
      enemy.direction = 1;
      return;
    }

    const maxX = rightBound - enemy.width;
    if (enemy.x > maxX) {
      enemy.x = maxX;
      enemy.direction = -1;
    }
  }

  private getWeedKey(weed: Weed): string {
    return `${Math.round(weed.x)}:${Math.round(weed.y)}:${weed.spriteIndex}:${weed.isLeft ? 1 : 0}`;
  }

  private updateDroppedGems(): void {
    const overlapsRect = (
      ax: number,
      ay: number,
      aw: number,
      ah: number,
      bx: number,
      by: number,
      bw: number,
      bh: number
    ): boolean => {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    };

    for (let i = this.droppedGems.length - 1; i >= 0; i--) {
      const gem = this.droppedGems[i];

      if (gem.collected) {
        this.droppedGems.splice(i, 1);
        continue;
      }

      gem.life = (gem.life ?? 0) + 1;
      gem.vx = gem.vx ?? 0;
      gem.vy = gem.vy ?? 0;
      gem.settleFrames = gem.settleFrames ?? 0;
      gem.fadeTimer = gem.fadeTimer ?? 0;
      gem.collectDelay = Math.max(0, (gem.collectDelay ?? 0) - 1);

      const halfW = gem.width / 2;
      const halfH = gem.height / 2;
      let onGround = false;

      if (!gem.settled) {
        // Horizontal move and collision (walls + solids).
        let nextX = gem.x + gem.vx;
        const testLeftX = nextX - halfW;
        const testTopY = gem.y - halfH;
        for (const platform of this.activePlatforms) {
          if (!overlapsRect(testLeftX, testTopY, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;
          if (gem.vx > 0) {
            nextX = Math.min(nextX, platform.x - halfW);
            gem.vx = -Math.abs(gem.vx) * 0.6;
          } else if (gem.vx < 0) {
            nextX = Math.max(nextX, platform.x + platform.width + halfW);
            gem.vx = Math.abs(gem.vx) * 0.6;
          }
        }
        gem.x = nextX;

        // Vertical move and collision (bounce on top, damp on ceiling).
        let nextY = gem.y + gem.vy;
        const testLeft = gem.x - halfW;
        const testTop = nextY - halfH;
        for (const platform of this.activePlatforms) {
          if (!overlapsRect(testLeft, testTop, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;

          if (gem.vy >= 0) {
            // Falling or resting onto top face.
            nextY = Math.min(nextY, platform.y - halfH);
            gem.vy = -Math.abs(gem.vy) * 0.42;
            gem.vx *= 0.8;
            onGround = true;
            if (Math.abs(gem.vy) < 0.55) {
              gem.vy = 0;
            }
          } else {
            // Rising into underside.
            nextY = Math.max(nextY, platform.y + platform.height + halfH);
            gem.vy = Math.abs(gem.vy) * 0.35;
          }
        }
        gem.y = nextY;

        // Underwater drag + gentle gravity for dropped gems
        gem.vx *= 0.985;
        gem.vy = gem.vy * 0.99 + 0.12;

        // Safety clamp to map bounds.
        const minX = halfW;
        const maxX = CONFIG.INTERNAL_WIDTH - halfW;
        if (gem.x < minX) {
          gem.x = minX;
          gem.vx = Math.abs(gem.vx) * 0.65;
        } else if (gem.x > maxX) {
          gem.x = maxX;
          gem.vx = -Math.abs(gem.vx) * 0.65;
        }

        // If a gem ended up inside geometry, push it out along the shallowest overlap axis.
        const gemLeft = gem.x - halfW;
        const gemTop = gem.y - halfH;
        for (const platform of this.activePlatforms) {
          if (!overlapsRect(gemLeft, gemTop, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;
          const overlapLeft = gemLeft + gem.width - platform.x;
          const overlapRight = platform.x + platform.width - gemLeft;
          const overlapTop = gemTop + gem.height - platform.y;
          const overlapBottom = platform.y + platform.height - gemTop;
          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);
          if (minOverlapX < minOverlapY) {
            if (overlapLeft < overlapRight) {
              gem.x = platform.x - halfW;
              gem.vx = -Math.abs(gem.vx) * 0.6;
            } else {
              gem.x = platform.x + platform.width + halfW;
              gem.vx = Math.abs(gem.vx) * 0.6;
            }
          } else {
            if (overlapTop < overlapBottom) {
              gem.y = platform.y - halfH;
              gem.vy = -Math.abs(gem.vy) * 0.42;
              onGround = true;
            } else {
              gem.y = platform.y + platform.height + halfH;
              gem.vy = Math.abs(gem.vy) * 0.35;
            }
          }
        }

        // Once almost still on ground, transition to flashing despawn state
        const nearStill = Math.abs(gem.vx) < 0.08 && Math.abs(gem.vy) < 0.08;
        if (onGround && nearStill) {
          gem.settleFrames++;
          if (gem.settleFrames > 10) {
            gem.settled = true;
            gem.vx = 0;
            gem.vy = 0;
            gem.fadeTimer = 0;
          }
        } else {
          gem.settleFrames = 0;
        }
      } else {
        gem.fadeTimer++;
      }

      const isFarAbove = gem.y < this.cameraY - CONFIG.INTERNAL_HEIGHT * 1.2;
      const isFarBelow = gem.y > this.cameraY + CONFIG.INTERNAL_HEIGHT * 1.6;
      const expiredAfterSettle = gem.settled && (gem.fadeTimer ?? 0) > 140;
      if ((gem.life ?? 0) > 1200 || isFarAbove || isFarBelow || expiredAfterSettle) {
        this.droppedGems.splice(i, 1);
      }
    }
  }

  private updateBullets(): void {
    // Update bullet positions and remove off-screen bullets
    this.playerController.updateBullets(this.cameraY);
    
    const bullets = this.playerController.getBullets();
    
    // Check collision with platforms (destroy bullet on any contact)
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      
      for (const platform of this.activePlatforms) {
        if (this.checkCollision(bullet, platform)) {
          if (platform.breakable) {
            // Damage breakable platform
            platform.hp--;
            if (platform.hp <= 0) {
              this.destroyPlatform(platform);
            }
          }
          // Destroy bullet on contact with any platform
          this.playerController.removeBullet(i);
          break;
        }
      }
    }
    
    // Check bullet-enemy collisions
    const bulletsAfterPlatforms = this.playerController.getBullets();
    for (let i = bulletsAfterPlatforms.length - 1; i >= 0; i--) {
      const bullet = bulletsAfterPlatforms[i];
      
      for (let j = this.activeEnemies.length - 1; j >= 0; j--) {
        const enemy = this.activeEnemies[j];
        
        if (this.checkCollision(bullet, enemy)) {
          const isDead = enemy.takeDamage(1);
          this.playerController.removeBullet(i);
          
          const hitX = enemy.x + enemy.width / 2;
          const hitY = enemy.y + enemy.height / 2;
          
          if (isDead) {
            this.killEnemy(enemy, j);
          }
          
          // Trigger blast explosion if blast powerup shot
          if (this.lastShotEffects.triggerBlast && this.powerUpManager.hasPowerUp("BLAST")) {
            this.powerUpManager.spawnBlastExplosion(hitX, hitY);
            this.addScreenShake(8);
            this.triggerHaptic("medium");
          }
          
          // Trigger lightning chain if lightning powerup shot
          if (this.lastShotEffects.triggerLightning && this.powerUpManager.hasPowerUp("LIGHTNING")) {
            this.triggerLightningChain(hitX, hitY);
            this.addScreenShake(5);
            this.triggerHaptic("light");
          }
          
          break;
        }
      }
    }
  }
  
  private updateEnemyBullets(): void {
    const player = this.playerController.getPlayer();
    const playerRect = {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height,
    };
    
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const bullet = this.enemyBullets[i];
      
      // Update position
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      
      // Remove if off-screen
      if (bullet.y < this.cameraY - 50 || 
          bullet.y > this.cameraY + CONFIG.INTERNAL_HEIGHT + 50 ||
          bullet.x < -50 || 
          bullet.x > CONFIG.INTERNAL_WIDTH + 50) {
        this.enemyBullets.splice(i, 1);
        continue;
      }
      
      // Check collision with player
      const bulletRect = {
        x: bullet.x - bullet.size,
        y: bullet.y - bullet.size,
        width: bullet.size * 2,
        height: bullet.size * 2,
      };
      
      if (this.checkCollision(bulletRect, playerRect)) {
        if (this.playerController.isInvulnerable()) {
          this.enemyBullets.splice(i, 1);
          continue;
        }
        this.applyPlayerDamage(bullet.x, bullet.y);
        this.addScreenShake(5);
        this.triggerHaptic("error");
        
        // Remove bullet
        this.enemyBullets.splice(i, 1);
      }
    }
  }
  
  private triggerLightningChain(originX: number, originY: number): void {
    const chainPoints: { x: number; y: number }[] = [{ x: originX, y: originY }];
    const hitEnemies = new Set<number>();
    
    let lastX = originX;
    let lastY = originY;
    
    for (let c = 0; c < POWERUP_CONSTANTS.LIGHTNING_MAX_CHAINS; c++) {
      let closestDist = POWERUP_CONSTANTS.LIGHTNING_RADIUS;
      let closestEnemy: BaseEnemy | null = null;
      let closestIdx = -1;
      
      for (let i = 0; i < this.activeEnemies.length; i++) {
        if (hitEnemies.has(i)) continue;
        
        const enemy = this.activeEnemies[i];
        const ecx = enemy.x + enemy.width / 2;
        const ecy = enemy.y + enemy.height / 2;
        const dist = Math.sqrt((lastX - ecx) ** 2 + (lastY - ecy) ** 2);
        
        if (dist < closestDist) {
          closestDist = dist;
          closestEnemy = enemy;
          closestIdx = i;
        }
      }
      
      if (closestEnemy && closestIdx >= 0) {
        const ecx = closestEnemy.x + closestEnemy.width / 2;
        const ecy = closestEnemy.y + closestEnemy.height / 2;
        chainPoints.push({ x: ecx, y: ecy });
        hitEnemies.add(closestIdx);
        lastX = ecx;
        lastY = ecy;
      } else {
        break;
      }
    }
    
    if (chainPoints.length > 1) {
      this.powerUpManager.spawnLightningChain(chainPoints);
    }
  }
  
  private destroyPlatform(platform: Platform): void {
    const cx = platform.x + platform.width / 2;
    const cy = platform.y + platform.height / 2;

    // Spawn crumble debris (chunky sand blocks flying outward)
    this.spawnCrumbleDebris(platform.x, platform.y, platform.width, platform.height);

    // Spawn sand fall particles (fine grains cascading down)
    this.spawnSandParticles(platform.x, platform.y, platform.width, platform.height);

    // Small screen shake for impact
    this.addScreenShake(2);

    // Remove platform from its chunk
    const chunk = this.levelSpawner.getChunk(platform.chunkIndex);
    const index = chunk.platforms.indexOf(platform);
    if (index !== -1) {
      chunk.platforms.splice(index, 1);
    }
    
    // Award some score for breaking blocks
    this.score += 2;
    this.scoreBreakables += 2;
    this.triggerHaptic("light");
  }
  
  private resolveCollisions(): void {
    const player = this.playerController.getPlayer();
    const prevX = player.x - player.vx;
    const prevY = player.y - player.vy;
    
    this.playerController.setGrounded(false);
    
    // First pass: Check if player is standing on any platform (including walls treated as floor)
    // This allows walking on blocks
    for (const platform of this.activePlatforms) {
      const playerBottom = player.y + player.height / 2;
      const prevBottom = prevY + player.height / 2;
      const playerLeft = player.x - player.width / 2;
      const playerRight = player.x + player.width / 2;
      const platformTop = platform.y;
      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;
      const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
      const crossedTop = prevBottom <= platformTop + 1 && playerBottom >= platformTop;
      
      // Check if player is standing on top of this platform
      const isOnTop = playerBottom >= platformTop - 2 && 
                      playerBottom <= platformTop + 8 &&
                      overlapsX;
      
      if (player.vy >= 0 && overlapsX) {
        if (platform.oneWay) {
          if (crossedTop) {
            this.playerController.land(platformTop);
          }
        } else if (crossedTop || isOnTop) {
          this.playerController.land(platformTop);
        }
      }
    }

    // Ceiling pass: block upward recoil/shoot movement from tunneling through tiles.
    if (player.vy < 0) {
      const playerTop = player.y - player.height / 2;
      const prevTop = prevY - player.height / 2;
      const playerLeft = player.x - player.width / 2;
      const playerRight = player.x + player.width / 2;

      let hitCeilingY: number | null = null;
      for (const platform of this.activePlatforms) {
        if (platform.oneWay) continue;
        const platformBottom = platform.y + platform.height;
        const platformLeft = platform.x;
        const platformRight = platform.x + platform.width;
        const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
        const crossedBottom = prevTop >= platformBottom && playerTop <= platformBottom;
        if (!overlapsX || !crossedBottom) continue;
        hitCeilingY = hitCeilingY === null ? platformBottom : Math.max(hitCeilingY, platformBottom);
      }

      if (hitCeilingY !== null) {
        this.playerController.setPosition(player.x, hitCeilingY + player.height / 2);
        this.playerController.stopVertical();
      }
    }
    
    // Second pass: Handle horizontal collisions for all platform tiles.
    // A tile blocks horizontal movement as long as it exists.
    for (const platform of this.activePlatforms) {
      if (platform.oneWay) continue;
      const rect = this.playerController.getRect();
      const rectLeft = rect.x;
      const rectRight = rect.x + rect.width;
      const rectTop = rect.y;
      const rectBottom = rect.y + rect.height;

      const platLeft = platform.x;
      const platRight = platform.x + platform.width;
      const platTop = platform.y;
      const platBottom = platform.y + platform.height;

      if (rectRight <= platLeft || rectLeft >= platRight || rectBottom <= platTop || rectTop >= platBottom) {
        continue;
      }

      // Resolve only horizontal penetration here; vertical is handled in landing pass.
      const overlapX = Math.min(rectRight, platRight) - Math.max(rectLeft, platLeft);
      const overlapY = Math.min(rectBottom, platBottom) - Math.max(rectTop, platTop);
      if (overlapX <= 0 || overlapY <= 0 || overlapX >= overlapY) {
        continue;
      }

      const playerCenterX = rectLeft + rect.width / 2;
      const platformCenterX = platLeft + platform.width / 2;
      if (playerCenterX < platformCenterX) {
        this.playerController.setPosition(platLeft - player.width / 2, player.y);
      } else {
        this.playerController.setPosition(platRight + player.width / 2, player.y);
      }
      this.playerController.stopHorizontal();
    }

    // Final depenetration pass: player should never remain inside any tile/wall.
    for (let iter = 0; iter < 2; iter++) {
      let resolvedAny = false;
      const rect = this.playerController.getRect();
      const rectLeft = rect.x;
      const rectRight = rect.x + rect.width;
      const rectTop = rect.y;
      const rectBottom = rect.y + rect.height;

      for (const platform of this.activePlatforms) {
        if (platform.oneWay) continue;
        const platLeft = platform.x;
        const platRight = platform.x + platform.width;
        const platTop = platform.y;
        const platBottom = platform.y + platform.height;

        if (rectRight <= platLeft || rectLeft >= platRight || rectBottom <= platTop || rectTop >= platBottom) {
          continue;
        }

        const overlapLeft = rectRight - platLeft;
        const overlapRight = platRight - rectLeft;
        const overlapTop = rectBottom - platTop;
        const overlapBottom = platBottom - rectTop;
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        if (minOverlapX < minOverlapY) {
          const pushRight = overlapLeft < overlapRight;
          const nextX = pushRight
            ? platLeft - player.width / 2
            : platRight + player.width / 2;
          this.playerController.setPosition(nextX, player.y);
          this.playerController.stopHorizontal();
        } else {
          const pushUp = overlapTop < overlapBottom;
          const nextY = pushUp
            ? platTop - player.height / 2
            : platBottom + player.height / 2;
          this.playerController.setPosition(player.x, nextY);
          this.playerController.stopVertical();
        }
        resolvedAny = true;
      }

      if (!resolvedAny) break;
    }

    const playerRect = this.playerController.getRect();
    
    // Enemy collisions
    for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
      const enemy = this.activeEnemies[i];
      
      if (!this.checkCollision(playerRect, enemy)) continue;
      
      // Player bounces if falling downward (vy > 0 means moving down)
      // This is the primary stomp mechanic - if player is falling, they stomp
      if (player.vy > 0) {
        // Bounce mechanic - player lands on enemy from above
        this.bounceOnEnemy(enemy, i);
      } else if (!this.playerController.isInvulnerable()) {
        // Player takes damage only if moving up or stationary
        this.applyPlayerDamage(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
      }
    }

    // Weed stomp bounce (no score, no gems, no combo).
    // Weeds act like springy coral: contact from above bounces the player.
    const weedHitWidth = 20;
    const weedHitHeight = 20;
    for (let i = this.activeWeeds.length - 1; i >= 0; i--) {
      const weed = this.activeWeeds[i];
      const weedRect = {
        x: weed.x - weedHitWidth / 2,
        y: weed.y - weedHitHeight,
        width: weedHitWidth,
        height: weedHitHeight,
      };
      const playerBottom = playerRect.y + playerRect.height;
      const fromAbove = playerBottom <= weed.y + 8;
      const overlapsWeed =
        playerRect.x < weedRect.x + weedRect.width &&
        playerRect.x + playerRect.width > weedRect.x &&
        playerRect.y < weedRect.y + weedRect.height &&
        playerRect.y + playerRect.height > weedRect.y;
      if (overlapsWeed && player.vy > 0 && fromAbove) {
        this.playerController.bounce();
        this.playEnemyCrunchSound();
        this.triggerHaptic("light");
        this.brokenWeeds.add(this.getWeedKey(weed));
        this.activeWeeds.splice(i, 1);
        break;
      }
    }
    
    // Gem collection
    for (const gem of this.activeGems) {
      if (gem.collected) continue;
      
      if (this.checkGemPickup(playerRect, gem)) {
        gem.collected = true;
        const comboMultiplier = this.playerController.getComboMultiplier();
        const points = gem.value * comboMultiplier;
        this.score += points;
        this.scoreGems += points;
        this.gems++;
        this.playGemSound();
      }
    }

    // Dropped gem collection
    for (let i = this.droppedGems.length - 1; i >= 0; i--) {
      const gem = this.droppedGems[i];
      if (gem.collected) continue;
      if ((gem.collectDelay ?? 0) > 0) continue;

      if (this.checkGemPickup(playerRect, gem)) {
        gem.collected = true;
        const comboMultiplier = this.playerController.getComboMultiplier();
        const points = gem.value * comboMultiplier;
        this.score += points;
        this.scoreGems += points;
        this.gems++;
        this.playGemSound();
        this.droppedGems.splice(i, 1);
      }
    }
  }

  private checkGemPickup(playerRect: { x: number; y: number; width: number; height: number }, gem: Gem): boolean {
    const gemLeft = gem.x - gem.width / 2;
    const gemTop = gem.y - gem.height / 2;

    return (
      playerRect.x < gemLeft + gem.width &&
      playerRect.x + playerRect.width > gemLeft &&
      playerRect.y < gemTop + gem.height &&
      playerRect.y + playerRect.height > gemTop
    );
  }
  
  private bounceOnEnemy(enemy: BaseEnemy, index: number): void {
    // Bounce and restore ammo
    this.playerController.bounce();
    
    const hitX = enemy.x + enemy.width / 2;
    const hitY = enemy.y + enemy.height / 2;
    
    // Kill enemy instantly when stomped
    this.killEnemy(enemy, index);
    
    // Increment combo
    this.playerController.incrementCombo();
    
    // Stomp counts as a "shot" for blast/lightning purposes
    const effects = this.powerUpManager.onPlayerShoot();
    if (effects.triggerBlast && this.powerUpManager.hasPowerUp("BLAST")) {
      this.powerUpManager.spawnBlastExplosion(hitX, hitY);
      this.addScreenShake(8);
      this.triggerHaptic("medium");
    }
    if (effects.triggerLightning && this.powerUpManager.hasPowerUp("LIGHTNING")) {
      this.triggerLightningChain(hitX, hitY);
      this.addScreenShake(5);
      this.triggerHaptic("light");
    }
  }
  
  private spawnDeathExplosion(x: number, y: number, color: string): void {
    this.deathExplosions.push({
      x, y,
      radius: 2,
      maxRadius: 28 + Math.random() * 8,
      alpha: 1.0,
      frame: 0,
      maxFrames: 20,
      color,
      bubbleSpawned: false,
    });
  }

  private spawnExplosionParticles(x: number, y: number, color: string): void {
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2.0 + Math.random() * 3.0;
      this.explosionParticles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        alpha: 0.9 + Math.random() * 0.1,
        color,
        life: 0,
        maxLife: 18 + Math.floor(Math.random() * 10),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  private spawnDeathBubbles(x: number, y: number): void {
    // Spawn 8-12 bubbles at enemy death location (enhanced count)
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      this.deathBubbles.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 12,
        size: 3 + Math.random() * 7,
        vy: -(1.2 + Math.random() * 2.5), // Rise upward
        vx: (Math.random() - 0.5) * 1.8,   // Slight horizontal drift
        alpha: 0.8 + Math.random() * 0.2,
        wobbleOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateDeathExplosions(): void {
    for (let i = this.deathExplosions.length - 1; i >= 0; i--) {
      const exp = this.deathExplosions[i];
      exp.frame++;
      
      const progress = exp.frame / exp.maxFrames;
      // Fast expand, slow fade
      exp.radius = exp.maxRadius * Math.min(1, progress * 2.5);
      exp.alpha = Math.max(0, 1 - progress);
      
      // Spawn bubbles when explosion is about halfway done
      if (!exp.bubbleSpawned && exp.frame >= 8) {
        exp.bubbleSpawned = true;
        this.spawnDeathBubbles(exp.x, exp.y);
      }
      
      if (exp.frame >= exp.maxFrames) {
        this.deathExplosions.splice(i, 1);
      }
    }
  }

  private updateExplosionParticles(): void {
    for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
      const p = this.explosionParticles[i];
      p.life++;
      
      const progress = p.life / p.maxLife;
      p.x += p.vx;
      p.y += p.vy;
      // Slow down over time (underwater drag)
      p.vx *= 0.94;
      p.vy *= 0.94;
      // Slight upward drift (buoyancy)
      p.vy -= 0.05;
      p.alpha = Math.max(0, 1 - progress);
      p.size *= 0.97;
      p.rotation += p.rotationSpeed;
      
      if (p.life >= p.maxLife || p.alpha <= 0) {
        this.explosionParticles.splice(i, 1);
      }
    }
  }

  private updateDeathBubbles(): void {
    for (let i = this.deathBubbles.length - 1; i >= 0; i--) {
      const b = this.deathBubbles[i];
      b.y += b.vy;
      b.x += b.vx + Math.sin(this.frameCount * 0.08 + b.wobbleOffset) * 0.3;
      b.alpha -= 0.005;
      b.size *= 0.998; // Slowly shrink
      
      // Remove faded or tiny bubbles
      if (b.alpha <= 0 || b.size < 1) {
        this.deathBubbles.splice(i, 1);
      }
    }
  }

  private spawnDamageText(x: number, y: number, text: string): void {
    this.damageTexts.push({
      x,
      y,
      vy: -0.55,
      alpha: 1,
      life: 0,
      maxLife: 64,
      text,
    });
  }

  private updateDamageTexts(): void {
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const t = this.damageTexts[i];
      t.life++;
      t.y += t.vy;
      t.vy -= 0.01;
      const p = t.life / t.maxLife;
      t.alpha = Math.max(0, 1 - p);
      if (t.life >= t.maxLife || t.alpha <= 0) {
        this.damageTexts.splice(i, 1);
      }
    }
  }

  // ============= PLATFORM CRUMBLE & SAND EFFECTS =============

  private spawnCrumbleDebris(px: number, py: number, pw: number, ph: number): void {
    // Sand color palette
    const colors = [
      { r: 175, g: 140, b: 70 },   // deep sand
      { r: 155, g: 115, b: 55 },   // dark sand
      { r: 210, g: 175, b: 100 },  // rich sand
      { r: 190, g: 155, b: 85 },   // mid sand
      { r: 140, g: 100, b: 45 },   // brown dirt
    ];

    // Spawn 6-10 chunky debris pieces
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
      const speed = 1.5 + Math.random() * 2.5;
      this.crumbleDebris.push({
        x: px + Math.random() * pw,
        y: py + Math.random() * ph,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5, // slight upward bias at start
        width: 3 + Math.random() * 6,
        height: 3 + Math.random() * 5,
        alpha: 1.0,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        life: 0,
        maxLife: 30 + Math.floor(Math.random() * 20),
        r: col.r + Math.floor((Math.random() - 0.5) * 20),
        g: col.g + Math.floor((Math.random() - 0.5) * 20),
        b: col.b + Math.floor((Math.random() - 0.5) * 15),
      });
    }
  }

  private spawnSandParticles(px: number, py: number, pw: number, ph: number): void {
    const colors = [
      { r: 235, g: 200, b: 120 },  // golden sand
      { r: 210, g: 175, b: 100 },  // rich sand
      { r: 190, g: 155, b: 85 },   // mid sand
      { r: 175, g: 140, b: 70 },   // deep sand
    ];

    // Spawn 15-22 fine sand grains that cascade downward
    const count = 15 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      this.sandParticles.push({
        x: px + Math.random() * pw,
        y: py + ph * 0.5 + Math.random() * (ph * 0.5), // start from lower half
        vx: (Math.random() - 0.5) * 1.2,
        vy: 0.5 + Math.random() * 1.5, // fall downward
        size: 1 + Math.random() * 2.5,
        alpha: 0.8 + Math.random() * 0.2,
        life: 0,
        maxLife: 40 + Math.floor(Math.random() * 30),
        r: col.r + Math.floor((Math.random() - 0.5) * 15),
        g: col.g + Math.floor((Math.random() - 0.5) * 15),
        b: col.b + Math.floor((Math.random() - 0.5) * 10),
      });
    }
  }

  private updateCrumbleDebris(): void {
    for (let i = this.crumbleDebris.length - 1; i >= 0; i--) {
      const d = this.crumbleDebris[i];
      d.life++;

      d.x += d.vx;
      d.y += d.vy;
      // Gravity pulls debris down (underwater gravity, slower)
      d.vy += 0.12;
      // Underwater drag slows horizontal movement
      d.vx *= 0.96;
      d.vy *= 0.98;
      d.rotation += d.rotationSpeed;
      // Slow rotation over time (drag)
      d.rotationSpeed *= 0.98;

      const progress = d.life / d.maxLife;
      d.alpha = Math.max(0, 1 - progress * progress); // quadratic fade for lingering visibility

      if (d.life >= d.maxLife) {
        this.crumbleDebris.splice(i, 1);
      }
    }
  }

  private updateSandParticles(): void {
    for (let i = this.sandParticles.length - 1; i >= 0; i--) {
      const s = this.sandParticles[i];
      s.life++;

      s.x += s.vx;
      s.y += s.vy;
      // Gentle gravity (sand sinks in water)
      s.vy += 0.06;
      // Slight horizontal wobble (water currents)
      s.vx += Math.sin(this.frameCount * 0.1 + s.x * 0.05) * 0.02;
      // Underwater drag
      s.vx *= 0.97;
      s.vy *= 0.99;

      const progress = s.life / s.maxLife;
      s.alpha = Math.max(0, (1 - progress) * 0.8);
      s.size *= 0.997; // Very slow shrink

      if (s.life >= s.maxLife || s.alpha <= 0) {
        this.sandParticles.splice(i, 1);
      }
    }
  }
  
  // ============= POWERUP SYSTEM =============
  
  private updatePowerUps(): void {
    const player = this.playerController.getPlayer();
    
    // Check if we need to spawn a new powerup orb
    this.powerUpManager.checkSpawnOrb(
      this.maxDepth,
      player.x,
      (worldY, entityWidth, preferredX) => this.levelSpawner.getSafeSpawnX(worldY, entityWidth, preferredX)
    );
    
    // Check powerup orb collection
    const collected = this.powerUpManager.checkCollection(
      player.x, player.y, player.width, player.height
    );
    
    if (collected) {
      // Trigger aura flash effect around submarine
      this.triggerPowerUpAnnouncement(collected);
      this.triggerHaptic("success");
    }
    
    // Update powerup manager (timers, effects)
    this.powerUpManager.update();
    
    // Process satellite collisions with enemies
    if (this.powerUpManager.hasPowerUp("SATELLITE")) {
      this.processSatelliteCollisions();
    }
    
    // Process laser beam collisions with enemies
    this.processLaserCollisions();
    
    // Process blast explosion collisions
    this.processBlastCollisions();
    
    // Process lightning chain from explosions
    this.processLightningCollisions();
    
    // (Powerup indicators removed - aura effect replaces them)
  }
  
  private triggerPowerUpAnnouncement(type: PowerUpType): void {
    // Instead of pausing the game with a title screen,
    // trigger a brief bright aura flash around the submarine
    const info = POWERUP_INFO[type];
    this.powerupAuraFlash = 30; // 0.5 second bright flash
    this.powerupAuraFlashColor = info.color;
  }
  
  private processSatelliteCollisions(): void {
    const player = this.playerController.getPlayer();
    const positions = this.powerUpManager.getSatellitePositions(player.x, player.y);
    const orbSize = POWERUP_CONSTANTS.SATELLITE_ORB_SIZE;
    
    for (const pos of positions) {
      for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
        const enemy = this.activeEnemies[i];
        
        // Simple circle-rect collision
        const ecx = enemy.x + enemy.width / 2;
        const ecy = enemy.y + enemy.height / 2;
        const dist = Math.sqrt((pos.x - ecx) ** 2 + (pos.y - ecy) ** 2);
        
        if (dist < orbSize + Math.max(enemy.width, enemy.height) / 2) {
          const isDead = enemy.takeDamage(POWERUP_CONSTANTS.SATELLITE_DAMAGE);
          if (isDead) {
            this.killEnemy(enemy, i);
          }
        }
      }
    }
  }
  
  private processLaserCollisions(): void {
    const beams = this.powerUpManager.getLaserBeams();
    
    for (const beam of beams) {
      if (beam.frame > 3) continue; // Only deal damage in first 3 frames
      
      const halfWidth = beam.width / 2;
      
      for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
        const enemy = this.activeEnemies[i];
        
        // Check if enemy is within beam horizontally and vertically
        const ecx = enemy.x + enemy.width / 2;
        
        if (Math.abs(ecx - beam.x) < halfWidth + enemy.width / 2 &&
            enemy.y + enemy.height > beam.startY &&
            enemy.y < beam.endY) {
          const isDead = enemy.takeDamage(POWERUP_CONSTANTS.LASER_DAMAGE);
          if (isDead) {
            this.killEnemy(enemy, i);
          }
        }
      }
    }
  }
  
  private processBlastCollisions(): void {
    const explosions = this.powerUpManager.getBlastExplosions();
    
    for (const exp of explosions) {
      if (exp.frame !== 5) continue; // Only deal damage on frame 5 (middle of expansion)
      
      for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
        const enemy = this.activeEnemies[i];
        
        const ecx = enemy.x + enemy.width / 2;
        const ecy = enemy.y + enemy.height / 2;
        const dist = Math.sqrt((exp.x - ecx) ** 2 + (exp.y - ecy) ** 2);
        
        if (dist < exp.maxRadius) {
          const isDead = enemy.takeDamage(POWERUP_CONSTANTS.BLAST_DAMAGE);
          if (isDead) {
            this.killEnemy(enemy, i);
          }
        }
      }
    }
  }
  
  private processLightningCollisions(): void {
    const chains = this.powerUpManager.getLightningChains();
    
    for (const chain of chains) {
      if (chain.frame !== 1) continue; // Only deal damage on frame 1
      
      // Damage all enemies at chain points (excluding the first point which is the origin)
      for (let p = 1; p < chain.points.length; p++) {
        const pt = chain.points[p];
        
        for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
          const enemy = this.activeEnemies[i];
          const ecx = enemy.x + enemy.width / 2;
          const ecy = enemy.y + enemy.height / 2;
          const dist = Math.sqrt((pt.x - ecx) ** 2 + (pt.y - ecy) ** 2);
          
          if (dist < 30) { // Close enough to the chain point
            const isDead = enemy.takeDamage(POWERUP_CONSTANTS.LIGHTNING_DAMAGE);
            if (isDead) {
              this.killEnemy(enemy, i);
            }
          }
        }
      }
    }
  }
  
  
  private killEnemy(enemy: BaseEnemy, index: number): void {
    this.playEnemyCrunchSound();

    const cx = enemy.x + enemy.width / 2;
    const cy = enemy.y + enemy.height / 2;
    const enemyColor = enemy.getBaseColor();
    
    // Determine which hurt sprite to use based on enemy type
    let spriteType: "shark" | "crab" | "squid";
    if (enemy.type === "HORIZONTAL") {
      spriteType = "shark";
    } else if (enemy.type === "EXPLODER") {
      spriteType = "squid";
    } else {
      spriteType = "crab";
    }
    
    // Spawn hurt animation first (explosion and bubbles will spawn after it completes)
    this.spawnHurtAnimation(cx, cy, enemy.width, enemy.height, enemyColor, enemy.direction, spriteType);
    
    // Remove enemy from chunk
    const chunk = this.levelSpawner.getChunk(enemy.chunkIndex);
    const chunkIndex = chunk.enemies.indexOf(enemy);
    if (chunkIndex !== -1) {
      chunk.enemies.splice(chunkIndex, 1);
    }

    this.spawnDroppedGems(cx, cy, enemy.chunkIndex);
    
    // Score with combo multiplier
    const comboMultiplier = this.playerController.getComboMultiplier();
    const points = CONFIG.SCORE_PER_ENEMY * comboMultiplier;
    this.score += points;
    this.scoreEnemies += points;
    
    // Small screen shake on enemy death
    this.addScreenShake(3);
    
    this.triggerHaptic("light");
  }

  private clearGameOverTimers(): void {
    for (const t of this.gameOverTimers) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    this.gameOverTimers = [];
  }

  private animateValue(el: HTMLElement, from: number, to: number, durationMs: number): void {
    const start = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(from + (to - from) * t);
      el.textContent = value.toString();
      if (t < 1) {
        return;
      }
      window.clearInterval(intervalId);
    }, 16);
    this.gameOverTimers.push(intervalId);
  }

  private animateGameOverScoreBreakdown(): void {
    this.clearGameOverTimers();
    const finalScoreEl = document.getElementById("final-score");
    const finalDepthEl = document.getElementById("final-depth");
    const depthRow = document.getElementById("score-row-depth");
    const enemiesRow = document.getElementById("score-row-enemies");
    const gemsRow = document.getElementById("score-row-gems");
    const breakablesRow = document.getElementById("score-row-breakables");
    const depthValueEl = document.getElementById("score-depth");
    const enemiesValueEl = document.getElementById("score-enemies");
    const gemsValueEl = document.getElementById("score-gems");
    const breakablesValueEl = document.getElementById("score-breakables");
    if (
      !finalScoreEl || !finalDepthEl ||
      !depthRow || !enemiesRow || !gemsRow || !breakablesRow ||
      !depthValueEl || !enemiesValueEl || !gemsValueEl || !breakablesValueEl
    ) {
      return;
    }

    finalScoreEl.textContent = "0";
    finalDepthEl.textContent = `Depth: ${Math.floor(this.maxDepth)}m`;
    depthValueEl.textContent = "0";
    enemiesValueEl.textContent = "0";
    gemsValueEl.textContent = "0";
    breakablesValueEl.textContent = "0";
    depthRow.classList.remove("visible");
    enemiesRow.classList.remove("visible");
    gemsRow.classList.remove("visible");
    breakablesRow.classList.remove("visible");

    const steps = [
      { row: depthRow, el: depthValueEl, value: this.scoreDepth },
      { row: enemiesRow, el: enemiesValueEl, value: this.scoreEnemies },
      { row: gemsRow, el: gemsValueEl, value: this.scoreGems },
      { row: breakablesRow, el: breakablesValueEl, value: this.scoreBreakables },
    ];

    let delay = 120;
    for (const step of steps) {
      const showId = window.setTimeout(() => {
        step.row.classList.add("visible");
        this.animateValue(step.el, 0, step.value, 420);
      }, delay);
      this.gameOverTimers.push(showId);
      delay += 460;
    }

    const totalId = window.setTimeout(() => {
      this.animateValue(finalScoreEl, 0, this.score, 550);
    }, delay + 120);
    this.gameOverTimers.push(totalId);
  }

  private spawnDroppedGems(x: number, y: number, chunkIndex: number): void {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8;
      const spawnRadius = 12 + Math.random() * 10;
      const spawnX = x + Math.cos(angle) * spawnRadius;
      const spawnY = y + Math.sin(angle) * (spawnRadius * 0.6);

      this.droppedGems.push({
        x: spawnX,
        y: spawnY,
        width: 14,
        height: 14,
        value: (1 + Math.floor(Math.random() * 2)) * CONFIG.SCORE_PER_GEM,
        collected: false,
        chunkIndex,
        bobOffset: Math.random() * Math.PI * 2,
        dropped: true,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 0,
        settled: false,
        settleFrames: 0,
        fadeTimer: 0,
        collectDelay: 8,
      });
    }
  }
  
  private spawnHurtAnimation(x: number, y: number, width: number, height: number, color: string, direction: number, spriteType: "shark" | "crab" | "squid"): void {
    this.hurtAnimations.push({
      x,
      y,
      width,
      height,
      frame: 0,
      frameTimer: 0,
      maxFrames: 2, // 2 frames in the hurt sprite sheet
      color,
      direction,
      spriteType,
    });
  }
  
  private updateHurtAnimations(): void {
    for (let i = this.hurtAnimations.length - 1; i >= 0; i--) {
      const anim = this.hurtAnimations[i];
      anim.frameTimer += 0.25; // Animation speed
      
      if (anim.frameTimer >= 1) {
        anim.frameTimer = 0;
        anim.frame++;
        
        // When animation completes, spawn explosion and bubbles
        if (anim.frame >= anim.maxFrames) {
          // Spawn death explosion (flash + shockwave)
          this.spawnDeathExplosion(anim.x, anim.y, anim.color);
          
          // Spawn explosion particles (debris flying outward)
          this.spawnExplosionParticles(anim.x, anim.y, anim.color);
          
          // Remove completed animation
          this.hurtAnimations.splice(i, 1);
        }
      }
    }
  }
  
  private drawHurtAnimations(): void {
    const ctx = this.ctx;
    const frameWidth = 96;
    const frameHeight = 96;
    
    for (const anim of this.hurtAnimations) {
      // Select the correct sprite based on type
      let sprite: HTMLImageElement | null;
      let spriteLoaded: boolean;
      if (anim.spriteType === "shark") {
        sprite = this.hurtSpriteShark;
        spriteLoaded = this.hurtSpriteSharkLoaded;
      } else if (anim.spriteType === "squid") {
        sprite = this.hurtSpriteSquid;
        spriteLoaded = this.hurtSpriteSquidLoaded;
      } else {
        sprite = this.hurtSpriteCrab;
        spriteLoaded = this.hurtSpriteCrabLoaded;
      }
      
      if (!sprite || !spriteLoaded) {
        // Fallback: draw a simple flash effect if sprite not loaded
        ctx.save();
        ctx.fillStyle = `rgba(255, 100, 100, ${0.8 - anim.frame * 0.3})`;
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, anim.width * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      
      ctx.save();
      
      // Calculate source rectangle from sprite sheet
      const sx = anim.frame * frameWidth;
      const sy = 0;
      
      // Scale to match enemy size (roughly)
      const scale = Math.max(anim.width, anim.height) / frameWidth * 1.5;
      const drawWidth = frameWidth * scale;
      const drawHeight = frameHeight * scale;
      
      // Center on the animation position
      const drawX = anim.x - drawWidth / 2;
      const drawY = anim.y - drawHeight / 2;
      
      // Handle horizontal flipping based on direction
      if (anim.direction < 0) {
        ctx.translate(drawX + drawWidth, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          sprite,
          sx, sy, frameWidth, frameHeight,
          0, 0, drawWidth, drawHeight
        );
      } else {
        ctx.drawImage(
          sprite,
          sx, sy, frameWidth, frameHeight,
          drawX, drawY, drawWidth, drawHeight
        );
      }
      
      ctx.restore();
    }
  }
  
  private updateCamera(): void {
    const player = this.playerController.getPlayer();
    // Camera follows player downward, limited upward movement
    const targetY = player.y - CONFIG.INTERNAL_HEIGHT * 0.3;
    
    // Only move camera down or slightly up
    if (targetY > this.cameraY) {
      this.cameraY += (targetY - this.cameraY) * CONFIG.CAMERA_SMOOTHING;
    } else if (targetY < this.cameraY - 50) {
      // Allow slight upward camera movement
      this.cameraY += (targetY + 50 - this.cameraY) * CONFIG.CAMERA_SMOOTHING * 0.5;
    }
  }
  
  private updateHUD(): void {
    const player = this.playerController.getPlayer();
    const scoreEl = document.getElementById("score");
    const depthEl = document.getElementById("depth");
    const ammoEl = document.getElementById("ammo");
    const comboEl = document.getElementById("combo");
    const ammoSliderFill = document.getElementById("ammo-slider-fill");
    const hpBar = document.getElementById("hp-bar");
    
    if (scoreEl) scoreEl.textContent = `${this.score}`;
    if (depthEl) depthEl.textContent = `${Math.floor(this.maxDepth)}m`;
    if (ammoEl) ammoEl.textContent = "AMMO: " + "●".repeat(player.ammo) + "○".repeat(player.maxAmmo - player.ammo);
    
    // Update HP bubbles - detect lost HP and trigger pop
    if (hpBar) {
      const bubbles = hpBar.querySelectorAll(".hp-bubble");
      
      // Detect if HP just decreased (bubble pop trigger)
      if (player.hp < this.previousHp) {
        // Pop bubbles for each lost HP point
        bubbles.forEach((bubble, index) => {
          // Bubbles are ordered top-to-bottom: data-hp 3,2,1,0
          // Index 0 = hp slot 3 (top), index 3 = hp slot 0 (bottom)
          const hpSlot = player.maxHp - 1 - index;
          
          if (hpSlot >= player.hp && hpSlot < this.previousHp) {
            // This bubble should pop now
            bubble.classList.remove("empty");
            bubble.classList.add("popped");
            
            // After pop animation, switch to empty state
            setTimeout(() => {
              bubble.classList.remove("popped");
              bubble.classList.add("empty");
            }, 350);
          }
        });
        this.previousHp = player.hp;
      } else {
        // Normal state update (e.g., on game reset HP goes back up)
        if (player.hp > this.previousHp) {
          this.previousHp = player.hp;
        }
        
        bubbles.forEach((bubble, index) => {
          const hpSlot = player.maxHp - 1 - index;
          
          if (hpSlot < player.hp) {
            // Bubble is alive
            bubble.classList.remove("popped", "empty");
          } else if (!bubble.classList.contains("popped")) {
            // Bubble is gone (already popped previously)
            bubble.classList.add("empty");
          }
        });
      }
    }
    
    // Update vertical ammo slider
    if (ammoSliderFill) {
      const ammoPercent = (player.ammo / player.maxAmmo) * 100;
      ammoSliderFill.style.height = `${ammoPercent}%`;
    }
    
    if (comboEl) {
      if (player.combo > 0) {
        comboEl.textContent = `x${player.combo}`;
        comboEl.style.opacity = "1";
      } else {
        comboEl.style.opacity = "0";
      }
    }
  }
  
  private checkCollision(a: Entity, b: Entity): boolean {
    const ax = "width" in a && a.x < CONFIG.INTERNAL_WIDTH / 2 ? a.x : a.x - (a.width || 0) / 2;
    const ay = a.y - (a.height || 0) / 2;
    const bx = b.x;
    const by = b.y;
    
    return (
      ax < bx + b.width &&
      ax + a.width > bx &&
      ay < by + b.height &&
      ay + a.height > by
    );
  }
  
  /** Draw ocean background across the full screen (all states, no dark bars) */
  private drawOceanBackgroundFullScreen(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Depth-based color shift during gameplay (water gets darker as player descends)
    const depth = this.gameState === "playing" ? Math.max(0, this.cameraY) : 0;
    const depthFactor = Math.min(depth / 10000, 1);
    
    const topR = Math.floor(20 - depthFactor * 10);
    const topG = Math.floor(140 - depthFactor * 60);
    const topB = Math.floor(200 - depthFactor * 50);
    const botR = Math.floor(10 - depthFactor * 6);
    const botG = Math.floor(80 - depthFactor * 40);
    const botB = Math.floor(150 - depthFactor * 40);
    
    // Gradient across full screen
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, `rgb(${topR}, ${topG}, ${topB})`);
    gradient.addColorStop(0.5, `rgb(${Math.floor((topR + botR) / 2)}, ${Math.floor((topG + botG) / 2)}, ${Math.floor((topB + botB) / 2)})`);
    gradient.addColorStop(1, `rgb(${botR}, ${botG}, ${botB})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    
    // Underwater light rays (caustics) - full screen
    ctx.save();
    const rayCount = 7;
    const time = this.frameCount * 0.02;
    
    for (let i = 0; i < rayCount; i++) {
      const baseX = (w / (rayCount + 1)) * (i + 1);
      const sway = Math.sin(time + i * 1.8) * 40;
      const opacity = 0.05 + Math.sin(time * 0.7 + i * 2.1) * 0.025;
      
      ctx.fillStyle = `rgba(130, 220, 255, ${opacity})`;
      ctx.beginPath();
      ctx.moveTo(baseX + sway - 30, 0);
      ctx.lineTo(baseX + sway + 30, 0);
      ctx.lineTo(baseX + sway * 0.5 + 60, h);
      ctx.lineTo(baseX + sway * 0.5 - 60, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    
    // Floating particles - full screen
    ctx.save();
    const particleCount = 18;
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 137.5 + 42.3;
      const px = ((Math.sin(seed) * 0.5 + 0.5) * w +
                  Math.sin(time * 0.3 + i * 0.7) * 20) % w;
      const py = ((Math.cos(seed * 1.3) * 0.5 + 0.5) * h +
                  this.frameCount * (0.3 + (i % 3) * 0.15)) % h;
      const size = 1.5 + (i % 3);
      const alpha = 0.15 + Math.sin(time + i) * 0.05;
      
      ctx.fillStyle = `rgba(180, 220, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  
  private draw(): void {
    const ctx = this.ctx;
    
    // Update screen shake
    this.updateScreenShake();
    
    // Clear canvas with ocean base
    ctx.fillStyle = "#0a2a50";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw ocean background at full screen size (no dark bars)
    // This runs for ALL states so the ocean fills edge-to-edge
    this.drawOceanBackgroundFullScreen();
    
    // Apply scale and offset
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    
    if (this.gameState === "start" || this.gameState === "gameOver") {
      // Animate and draw menu background entities
      this.drawMenuBackground();
    }
    
    // Draw game content
    if (this.gameState === "playing") {
      // Apply camera transform with screen shake
      ctx.save();
      ctx.translate(this.screenShakeX, -this.cameraY + this.screenShakeY);
      
      // Draw platforms
      this.drawPlatforms();
      
      // Draw platform crumble debris & falling sand (on top of platforms, behind entities)
      this.drawCrumbleDebris();
      this.drawSandParticles();
      
      // Draw weeds on wall ledges
      this.drawWeeds();
      
      // Draw gems
      this.drawGems();
      
      // Draw enemies
      this.drawEnemies();
      
      // Draw bullets (bubbles)
      this.drawBullets();
      this.drawEnemyBullets();
      
      // Draw powerup orbs
      this.drawPowerUpOrbs();
      
      // Draw death effects (hurt animations, explosions, particles, then bubbles rising up)
      this.drawHurtAnimations();
      this.drawDeathExplosions();
      this.drawExplosionParticles();
      this.drawDeathBubbles();
      this.drawDamageTexts();
      
      // Draw player
      this.drawPlayer();
      if (this.deathFreezeFrames > 0) {
        this.drawDeathFreezeHighlight();
      }
      
      // Draw powerup effects (on top of player)
      this.drawSatellites();
      this.drawBlastExplosions();
      this.drawLightningChains();
      this.drawLaserBeams();
      
      ctx.restore();
    }
    
    ctx.restore();
    
    // Draw touch zones overlay OUTSIDE the scale transform so it fills the full screen
    if (this.gameState === "playing" && this.isMobile) {
      this.drawTouchZones();
    }
    
    // Apply dithering effect as post-process
    this.applyDithering();
  }

  private drawDeathFreezeHighlight(): void {
    const ctx = this.ctx;
    const p = this.playerController.getPlayer();
    const k = this.deathFreezeKiller;
    const pulse = 0.5 + Math.sin(this.frameCount * 0.35) * 0.5;

    ctx.save();
    ctx.fillStyle = `rgba(6, 15, 30, ${0.28 + pulse * 0.15})`;
    ctx.fillRect(0, this.cameraY, CONFIG.INTERNAL_WIDTH, CONFIG.INTERNAL_HEIGHT);

    ctx.strokeStyle = "rgba(255, 255, 210, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    if (k) {
      ctx.strokeStyle = "rgba(255, 90, 90, 0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(k.x, k.y, 22 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  
  private drawMenuBackground(): void {
    const ctx = this.ctx;
    const crabScale = 0.95;
    const crabW = 96 * crabScale;
    const crabH = 96 * crabScale;
    const crabX = CONFIG.INTERNAL_WIDTH / 2 - crabW / 2;
    // Keep crab and submarine below the instruction block area
    const crabY = CONFIG.INTERNAL_HEIGHT - crabH - 20;
    
    // Draw bobbing submarine above the crab
    if (this.submarineImg && this.submarineImg.complete) {
      const subX = CONFIG.INTERNAL_WIDTH / 2;
      const bobY = crabY - 18 + Math.sin(this.frameCount * 0.03) * 4;
      const subSize = 64;
      
      ctx.save();
      
      // Gentle tilt with the bob
      const tilt = Math.sin(this.frameCount * 0.03 + 0.5) * 0.08;
      ctx.translate(subX, bobY);
      ctx.rotate(tilt);
      
      ctx.drawImage(this.submarineImg, -subSize / 2, -subSize / 2, subSize, subSize);
      ctx.restore();
    }
    
    // Draw animated crab near the bottom of the start screen
    if (this.menuCrabImg && this.menuCrabImg.complete) {
      // Sprite sheet: 4 frames, 96x96 per frame
      const frameW = 96;
      const frameH = 96;
      const cols = 4;
      
      // Animate through frames (4 frames for idle)
      if (this.frameCount % 10 === 0) {
        this.menuCrabFrame = (this.menuCrabFrame + 1) % cols;
      }
      
      const sx = this.menuCrabFrame * frameW;
      const sy = 0;

      // Slight bob
      const bobY = Math.sin(this.frameCount * 0.05) * 3;
      
      ctx.drawImage(
        this.menuCrabImg,
        sx, sy, frameW, frameH,
        crabX, crabY + bobY, crabW, crabH
      );
    }
    
    // Draw title weeds (once, after sprite sheet loads)
    this.drawTitleWeeds();
  }
  
  private drawPlatforms(): void {
    const ctx = this.ctx;
    const BLOCK_SIZE = 32; // Size of individual blocks (2x bigger)
    
    // Sand color palette for underwater theme - bright & vibrant
    const SAND_LIGHT = { r: 255, g: 225, b: 150 };    // Bright warm sand
    const SAND_MID   = { r: 235, g: 200, b: 120 };     // Vivid golden sand
    const SAND_DARK  = { r: 210, g: 175, b: 100 };     // Rich sand
    const SAND_DEEP  = { r: 175, g: 140, b: 70 };      // Deep shadow sand
    
    for (const platform of this.activePlatforms) {
      if (platform.oneWay) {
        const x = platform.x;
        const y = platform.y;
        const w = platform.width;
        const h = platform.height;
        ctx.fillStyle = "rgba(215, 190, 120, 0.95)";
        ctx.fillRect(x, y, w, h);
        // Brighter top edge for readability.
        ctx.fillStyle = "rgba(255, 240, 190, 0.9)";
        ctx.fillRect(x, y, w, 2);
        // Pixel-like dark notches so it reads as a platform strip.
        ctx.fillStyle = "rgba(120, 90, 45, 0.55)";
        for (let px = 2; px < w - 2; px += 10) {
          ctx.fillRect(x + px, y + h - 2, 4, 2);
        }
        continue;
      }

      // Render cave walls and any impenetrable (non-breakable) masses
      if (platform.isWall || !platform.breakable) {
        // Organic wall made up of sand-colored pixelated blocks
        const blocksX = Math.ceil(platform.width / BLOCK_SIZE);
        const blocksY = Math.ceil(platform.height / BLOCK_SIZE);
        const isLeftWall = platform.x < CONFIG.INTERNAL_WIDTH / 2;
        
        for (let bx = 0; bx < blocksX; bx++) {
          for (let by = 0; by < blocksY; by++) {
            const blockX = platform.x + bx * BLOCK_SIZE;
            const blockY = platform.y + by * BLOCK_SIZE;
            const blockW = Math.min(BLOCK_SIZE, platform.x + platform.width - blockX);
            const blockH = Math.min(BLOCK_SIZE, platform.y + platform.height - blockY);
            
            // Determine if this is the inner edge block (facing the well)
            const isInnerEdge = isLeftWall ? (bx === blocksX - 1) : (bx === 0);
            // Depth from the inner edge (0 = edge, higher = deeper into wall)
            const depthFromEdge = isLeftWall ? (blocksX - 1 - bx) : bx;
            
            // Sand color with depth variation - deeper into wall = darker sand
            const depthDarken = depthFromEdge * 12;
            const edgeBrighten = isInnerEdge ? 15 : 0;
            const variation = ((bx + by) % 3) * 8;
            // Alternate between slightly different hues for natural sand look
            const hueShift = ((bx * 3 + by * 7) % 5) * 3;
            
            const r = Math.max(120, SAND_MID.r - depthDarken + edgeBrighten + variation - hueShift);
            const g = Math.max(95, SAND_MID.g - depthDarken + edgeBrighten + variation - hueShift);
            const b = Math.max(50, SAND_MID.b - depthDarken + edgeBrighten + variation - hueShift);
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(blockX, blockY, blockW, blockH);
            
            // Pixelated grain detail (4x4 pixel sub-blocks for sandy texture)
            const grainSize = 4;
            for (let gx = 0; gx < blockW; gx += grainSize) {
              for (let gy = 0; gy < blockH; gy += grainSize) {
                const seed = ((blockX + gx) * 13 + (blockY + gy) * 7) % 11;
                if (seed < 3) {
                  // Darker grain speckle
                  ctx.fillStyle = `rgba(160, 120, 50, 0.18)`;
                  ctx.fillRect(blockX + gx, blockY + gy, grainSize, grainSize);
                } else if (seed > 8) {
                  // Lighter grain speckle  
                  ctx.fillStyle = `rgba(255, 245, 210, 0.2)`;
                  ctx.fillRect(blockX + gx, blockY + gy, grainSize, grainSize);
                }
              }
            }
            
            // Block outline / grid lines (warm brown)
            ctx.strokeStyle = `rgb(${SAND_DEEP.r - 15}, ${SAND_DEEP.g - 15}, ${SAND_DEEP.b - 10})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(blockX + 0.5, blockY + 0.5, blockW - 1, blockH - 1);
            
            // Inner highlight (top-left) - bright warm sand highlight
            ctx.fillStyle = `rgba(255, 245, 200, 0.25)`;
            ctx.fillRect(blockX + 1, blockY + 1, blockW - 2, 2);
            ctx.fillRect(blockX + 1, blockY + 1, 2, blockH - 2);
            
            // Inner shadow (bottom-right) - warm brown shadow
            ctx.fillStyle = `rgba(140, 100, 40, 0.25)`;
            ctx.fillRect(blockX + 1, blockY + blockH - 3, blockW - 2, 2);
            ctx.fillRect(blockX + blockW - 3, blockY + 1, 2, blockH - 2);
            
            // Edge highlight on the inner face of cave wall
            if (isInnerEdge) {
              const edgeX = isLeftWall 
                ? blockX + blockW - 3  // Right edge of left wall
                : blockX + 1;          // Left edge of right wall
              
              // Brighter sand highlight on the face
              ctx.fillStyle = `rgba(255, 240, 180, 0.35)`;
              ctx.fillRect(edgeX, blockY + 2, 2, blockH - 4);
              
              // Subtle rough edge detail (small notches) - sand erosion
              const notchSeed = (blockX * 7 + blockY * 13) % 5;
              if (notchSeed < 2) {
                ctx.fillStyle = `rgba(140, 100, 40, 0.35)`;
                const notchY = blockY + (notchSeed + 1) * 8;
                const notchX = isLeftWall ? blockX + blockW - 4 : blockX;
                ctx.fillRect(notchX, notchY, 4, 3);
              }
            }
          }
        }
      } else {
        // Breakable platform block (32x32 square, same size as wall blocks)
        const blockX = platform.x;
        const blockY = platform.y;
        const blockW = platform.width;
        const blockH = platform.height;
        
        // Breakable blocks - darker sand/dirt color (more brown, less yellow)
        const variation = (Math.floor(blockX / BLOCK_SIZE) % 3) * 5;
        const r = SAND_DEEP.r - 20 + variation;
        const g = SAND_DEEP.g - 20 + variation;
        const b = SAND_DEEP.b - 15 + variation;
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(blockX, blockY, blockW, blockH);
        
        // Pixelated texture variation (darker/lighter spots)
        const grainSize = 4;
        for (let gx = 0; gx < blockW; gx += grainSize) {
          for (let gy = 0; gy < blockH; gy += grainSize) {
            const seed = ((blockX + gx) * 11 + (blockY + gy) * 17) % 9;
            if (seed < 2) {
              ctx.fillStyle = `rgba(100, 70, 30, 0.25)`;
              ctx.fillRect(blockX + gx, blockY + gy, grainSize, grainSize);
            } else if (seed > 7) {
              ctx.fillStyle = `rgba(180, 140, 80, 0.2)`;
              ctx.fillRect(blockX + gx, blockY + gy, grainSize, grainSize);
            }
          }
        }
        
        // Minecraft-style pixelated X crack pattern
        const crackColor = `rgba(40, 25, 10, 0.7)`;
        const pixelSize = 4; // Size of crack pixels
        
        ctx.fillStyle = crackColor;
        
        // X-shaped crack pattern - diagonal from corners meeting in center
        // Top-left to bottom-right diagonal
        ctx.fillRect(blockX + 4, blockY + 4, pixelSize, pixelSize);
        ctx.fillRect(blockX + 8, blockY + 8, pixelSize, pixelSize);
        ctx.fillRect(blockX + 12, blockY + 12, pixelSize, pixelSize);
        ctx.fillRect(blockX + 16, blockY + 16, pixelSize, pixelSize);
        ctx.fillRect(blockX + 20, blockY + 20, pixelSize, pixelSize);
        ctx.fillRect(blockX + 24, blockY + 24, pixelSize, pixelSize);
        
        // Top-right to bottom-left diagonal
        ctx.fillRect(blockX + 24, blockY + 4, pixelSize, pixelSize);
        ctx.fillRect(blockX + 20, blockY + 8, pixelSize, pixelSize);
        ctx.fillRect(blockX + 16, blockY + 12, pixelSize, pixelSize);
        ctx.fillRect(blockX + 12, blockY + 16, pixelSize, pixelSize);
        ctx.fillRect(blockX + 8, blockY + 20, pixelSize, pixelSize);
        ctx.fillRect(blockX + 4, blockY + 24, pixelSize, pixelSize)
        
        // Block outline (dark brown)
        ctx.strokeStyle = `rgb(80, 55, 25)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(blockX + 0.5, blockY + 0.5, blockW - 1, blockH - 1);
        
        // Subtle inner highlight (top-left) for 3D feel
        ctx.fillStyle = `rgba(180, 140, 80, 0.15)`;
        ctx.fillRect(blockX + 1, blockY + 1, blockW - 2, 2);
        ctx.fillRect(blockX + 1, blockY + 1, 2, blockH - 2);
        
        // Subtle inner shadow (bottom-right)
        ctx.fillStyle = `rgba(40, 25, 10, 0.2)`;
        ctx.fillRect(blockX + 1, blockY + blockH - 3, blockW - 2, 2);
        ctx.fillRect(blockX + blockW - 3, blockY + 1, 2, blockH - 2);
      }
    }
  }
  
  private drawWeeds(): void {
    const ctx = this.ctx;
    if (!this.weedsImg || !this.weedsImg.complete) return;
    
    // Sprite sheet layout: 4 columns x 2 rows, 7 sprites total
    // We measure from the image dimensions
    const sheetW = this.weedsImg.naturalWidth;
    const sheetH = this.weedsImg.naturalHeight;
    const cols = 4;
    const rows = 2;
    const spriteW = sheetW / cols;
    const spriteH = sheetH / rows;
    
    // Display size for weeds (2x size)
    const drawSize = 56;
    
    for (const weed of this.activeWeeds) {
      const col = weed.spriteIndex % cols;
      const row = Math.floor(weed.spriteIndex / cols);
      
      const sx = col * spriteW;
      const sy = row * spriteH;
      
      ctx.save();
      
      // Position weed: centered on the wall edge, bottom aligned to top of ledge
      let drawX: number;
      if (weed.isLeft) {
        // Left wall: centered on the inner edge
        drawX = weed.x - drawSize / 2;
      } else {
        // Right wall: centered on the inner edge
        drawX = weed.x - drawSize / 2;
      }
      // Bottom of sprite sits on top of the platform surface
      const drawY = weed.y - drawSize;
      
      // Flip if needed
      if (weed.flipX) {
        ctx.translate(drawX + drawSize / 2, drawY + drawSize / 2);
        ctx.scale(-1, 1);
        ctx.translate(-(drawX + drawSize / 2), -(drawY + drawSize / 2));
      }
      
      ctx.drawImage(
        this.weedsImg,
        sx, sy, spriteW, spriteH,
        drawX, drawY, drawSize, drawSize
      );
      
      ctx.restore();
    }
  }
  
  private drawGems(): void {
    const ctx = this.ctx;
    
    for (const gem of this.activeGems) {
      if (gem.collected) continue;
      
      // Bob animation using pre-calculated offset
      const bobY = Math.sin(this.frameCount * 0.1 + gem.bobOffset) * 3;
      const spin = this.frameCount * 0.015 + gem.bobOffset * 0.35;
      
      // Diamond shape (no glow for clean dithering)
      ctx.save();
      ctx.translate(gem.x, gem.y + bobY);
      ctx.rotate(spin);
      ctx.fillStyle = "#0ff";
      ctx.beginPath();
      ctx.moveTo(0, -gem.height / 2);
      ctx.lineTo(gem.width / 2, 0);
      ctx.lineTo(0, gem.height / 2);
      ctx.lineTo(-gem.width / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const gem of this.droppedGems) {
      if (gem.collected) continue;

      const bobY = Math.sin(this.frameCount * 0.16 + gem.bobOffset) * 1.5;
      const fadeTimer = gem.fadeTimer ?? 0;
      const flashing = gem.settled && fadeTimer > 30;
      const alpha = flashing ? (Math.floor((fadeTimer - 30) / 6) % 2 === 0 ? 0.22 : 0.95) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.moveTo(gem.x, gem.y - gem.height / 2 + bobY);
      ctx.lineTo(gem.x + gem.width / 2, gem.y + bobY);
      ctx.lineTo(gem.x, gem.y + gem.height / 2 + bobY);
      ctx.lineTo(gem.x - gem.width / 2, gem.y + bobY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  
  private drawEnemies(): void {
    const ctx = this.ctx;
    
    // Each enemy class handles its own drawing
    for (const enemy of this.activeEnemies) {
      enemy.draw(ctx);
    }
  }
  
  private drawBullets(): void {
    const ctx = this.ctx;
    const bullets = this.playerController.getBullets();
    
    for (const bullet of bullets) {
      const bx = bullet.x;
      const by = bullet.y;
      const radius = Math.max(bullet.width, bullet.height) / 2 + 2;
      
      if (bullet.isBlast) {
        // === BLAST BULLET: fiery orange with flame trail ===
        
        // Flame trail (3 trailing circles)
        for (let t = 1; t <= 3; t++) {
          const trailY = by - bullet.vy * t * 0.4;
          const trailAlpha = 0.25 - t * 0.07;
          const trailR = radius * (1 - t * 0.15);
          ctx.beginPath();
          ctx.arc(bx + Math.sin(this.frameCount * 0.3 + t * 2) * 2, trailY, trailR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 80, 0, ${trailAlpha})`;
          ctx.fill();
        }
        
        // Outer fire glow
        const fireGlow = ctx.createRadialGradient(bx, by, 0, bx, by, radius * 2.5);
        fireGlow.addColorStop(0, "rgba(255, 150, 50, 0.4)");
        fireGlow.addColorStop(0.5, "rgba(255, 80, 0, 0.15)");
        fireGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = fireGlow;
        ctx.beginPath();
        ctx.arc(bx, by, radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Core - bright orange/yellow
        const coreGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
        coreGrad.addColorStop(0, "rgba(255, 240, 150, 0.95)");
        coreGrad.addColorStop(0.5, "rgba(255, 120, 30, 0.8)");
        coreGrad.addColorStop(1, "rgba(200, 50, 0, 0.5)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(bx, by, radius + 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = "rgba(255, 255, 200, 0.9)";
        ctx.beginPath();
        ctx.arc(bx, by, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        
        // Ring outline
        ctx.strokeStyle = "rgba(255, 160, 50, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        
      } else if (bullet.isLightning) {
        // === LIGHTNING BULLET: electric yellow with sparks ===
        
        // Electric sparks radiating outward
        const sparkCount = 4;
        for (let s = 0; s < sparkCount; s++) {
          const angle = (Math.PI * 2 / sparkCount) * s + this.frameCount * 0.15;
          const sparkLen = radius * 1.5 + Math.sin(this.frameCount * 0.4 + s * 1.7) * 3;
          const sx = bx + Math.cos(angle) * radius * 0.5;
          const sy = by + Math.sin(angle) * radius * 0.5;
          const ex = bx + Math.cos(angle) * sparkLen;
          const ey = by + Math.sin(angle) * sparkLen;
          
          // Jagged spark line
          ctx.strokeStyle = `rgba(255, 255, 100, ${0.6 + Math.sin(this.frameCount * 0.5 + s) * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          const midX = (sx + ex) / 2 + Math.sin(this.frameCount * 0.6 + s * 3) * 3;
          const midY = (sy + ey) / 2 + Math.cos(this.frameCount * 0.6 + s * 3) * 3;
          ctx.lineTo(midX, midY);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        
        // Outer electric glow
        const elecGlow = ctx.createRadialGradient(bx, by, 0, bx, by, radius * 2.2);
        elecGlow.addColorStop(0, "rgba(255, 255, 100, 0.35)");
        elecGlow.addColorStop(0.5, "rgba(255, 238, 51, 0.12)");
        elecGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = elecGlow;
        ctx.beginPath();
        ctx.arc(bx, by, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Core - bright yellow/white
        const coreGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
        coreGrad.addColorStop(0, "rgba(255, 255, 240, 0.95)");
        coreGrad.addColorStop(0.4, "rgba(255, 238, 51, 0.8)");
        coreGrad.addColorStop(1, "rgba(200, 180, 0, 0.4)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(bx, by, radius + 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(bx, by, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Ring outline
        ctx.strokeStyle = "rgba(255, 238, 51, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        
      } else {
        // === NORMAL BULLET: standard cyan bubble ===
        
        // Outer bubble glow
        ctx.beginPath();
        ctx.arc(bx, by, radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(120, 220, 255, 0.15)";
        ctx.fill();
        
        // Main bubble body - translucent
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(150, 230, 255, 0.35)";
        ctx.fill();
        
        // Bubble outline
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(200, 240, 255, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Highlight / shine spot (top-left)
        ctx.beginPath();
        ctx.arc(bx - radius * 0.3, by - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();
        
        // Secondary smaller shine
        ctx.beginPath();
        ctx.arc(bx - radius * 0.1, by - radius * 0.5, radius * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fill();
      }
    }
  }
  
  private drawEnemyBullets(): void {
    const ctx = this.ctx;
    
    for (const bullet of this.enemyBullets) {
      const bx = bullet.x;
      const by = bullet.y;
      const r = bullet.size;
      
      // Outer glow - reddish/orange danger color
      ctx.beginPath();
      ctx.arc(bx, by, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 100, 50, 0.3)";
      ctx.fill();
      
      // Main bullet body - red/orange
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grad.addColorStop(0, "rgba(255, 200, 100, 0.95)");
      grad.addColorStop(0.5, "rgba(255, 100, 50, 0.9)");
      grad.addColorStop(1, "rgba(200, 50, 30, 0.7)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      
      // Bright center
      ctx.fillStyle = "rgba(255, 255, 200, 0.9)";
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Outline
      ctx.strokeStyle = "rgba(255, 150, 50, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  
  private drawCrumbleDebris(): void {
    const ctx = this.ctx;

    for (const d of this.crumbleDebris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);

      // Main chunk body
      ctx.fillStyle = `rgba(${d.r}, ${d.g}, ${d.b}, ${d.alpha})`;
      ctx.fillRect(-d.width / 2, -d.height / 2, d.width, d.height);

      // Highlight edge (top-left)
      ctx.fillStyle = `rgba(${Math.min(255, d.r + 40)}, ${Math.min(255, d.g + 35)}, ${Math.min(255, d.b + 25)}, ${d.alpha * 0.5})`;
      ctx.fillRect(-d.width / 2, -d.height / 2, d.width, 1);
      ctx.fillRect(-d.width / 2, -d.height / 2, 1, d.height);

      // Shadow edge (bottom-right)
      ctx.fillStyle = `rgba(${Math.max(0, d.r - 50)}, ${Math.max(0, d.g - 50)}, ${Math.max(0, d.b - 35)}, ${d.alpha * 0.4})`;
      ctx.fillRect(-d.width / 2, d.height / 2 - 1, d.width, 1);
      ctx.fillRect(d.width / 2 - 1, -d.height / 2, 1, d.height);

      ctx.restore();
    }
  }

  private drawSandParticles(): void {
    const ctx = this.ctx;

    for (const s of this.sandParticles) {
      // Soft glow behind the grain
      ctx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${s.alpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size + 1, 0, Math.PI * 2);
      ctx.fill();

      // Sand grain core
      ctx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${s.alpha})`;
      ctx.fillRect(
        s.x - s.size / 2,
        s.y - s.size / 2,
        s.size,
        s.size
      );

      // Tiny bright speck on top
      if (s.size > 1.5) {
        ctx.fillStyle = `rgba(${Math.min(255, s.r + 50)}, ${Math.min(255, s.g + 45)}, ${Math.min(255, s.b + 30)}, ${s.alpha * 0.6})`;
        ctx.fillRect(
          s.x - s.size / 4,
          s.y - s.size / 2,
          s.size / 2,
          1
        );
      }
    }
  }

  private drawDeathExplosions(): void {
    const ctx = this.ctx;
    
    for (const exp of this.deathExplosions) {
      ctx.save();
      
      const progress = exp.frame / exp.maxFrames;
      
      // Bright center flash (strongest at start)
      if (exp.frame < 10) {
        const flashAlpha = (1 - exp.frame / 10) * 0.9;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Inner colored glow (enemy color)
      const gradient = ctx.createRadialGradient(
        exp.x, exp.y, 0,
        exp.x, exp.y, exp.radius
      );
      gradient.addColorStop(0, `rgba(255, 255, 220, ${exp.alpha * 0.6})`);
      gradient.addColorStop(0.3, exp.color.replace("rgb(", "rgba(").replace(")", `, ${exp.alpha * 0.35})`));
      gradient.addColorStop(0.6, exp.color.replace("rgb(", "rgba(").replace(")", `, ${exp.alpha * 0.15})`));
      gradient.addColorStop(1, `rgba(100, 200, 255, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Expanding shockwave ring
      if (progress > 0.1 && progress < 0.8) {
        const ringAlpha = exp.alpha * 0.7 * (1 - progress);
        ctx.strokeStyle = `rgba(180, 235, 255, ${ringAlpha})`;
        ctx.lineWidth = 2.5 * (1 - progress);
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Secondary outer ring (thin, fast-expanding)
      if (progress > 0.15 && progress < 0.6) {
        const outerAlpha = exp.alpha * 0.3 * (1 - progress * 1.5);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, outerAlpha)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      ctx.restore();
    }
  }

  private drawExplosionParticles(): void {
    const ctx = this.ctx;
    
    for (const p of this.explosionParticles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      
      // Glowing particle core
      ctx.fillStyle = p.color.replace("rgb(", "rgba(").replace(")", `, ${p.alpha * 0.8})`);
      const s = p.size;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      
      // Bright center
      ctx.fillStyle = `rgba(255, 255, 220, ${p.alpha * 0.6})`;
      ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
      
      // Outer glow
      ctx.fillStyle = `rgba(100, 200, 255, ${p.alpha * 0.2})`;
      ctx.beginPath();
      ctx.arc(0, 0, s + 1, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
  }

  private drawDeathBubbles(): void {
    const ctx = this.ctx;
    
    for (const b of this.deathBubbles) {
      const r = b.size;
      
      // Outer glow
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, ${b.alpha * 0.2})`;
      ctx.fill();
      
      // Main bubble body
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140, 220, 255, ${b.alpha * 0.35})`;
      ctx.fill();
      
      // Bubble rim
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 235, 255, ${b.alpha * 0.65})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Tiny highlight (specular)
      if (r > 2) {
        ctx.beginPath();
        ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.75})`;
        ctx.fill();
      }
      
      // Secondary smaller highlight
      if (r > 4) {
        ctx.beginPath();
        ctx.arc(b.x + r * 0.15, b.y - r * 0.15, r * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.4})`;
        ctx.fill();
      }
    }
  }

  private drawDamageTexts(): void {
    const ctx = this.ctx;
    for (const t of this.damageTexts) {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = "14px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ff6e6e";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
  
  private drawPlayer(): void {
    const ctx = this.ctx;
    const p = this.playerController.getPlayer();
    
    // Invulnerability flash
    if (p.invulnerable > 0 && Math.floor(p.invulnerable / 4) % 2 === 0) {
      return;
    }
    
    // Draw powerup aura(s) behind the submarine
    this.drawPowerUpAura(ctx, p.x, p.y);
    
    // Draw submarine sprite
    if (this.submarineImg && this.submarineImg.complete) {
      const spriteWidth = 72;  // Display size (1.5x bigger: 48 * 1.5 = 72)
      const spriteHeight = 72;
      const x = p.x - spriteWidth / 2;
      // Center on physics body with slight upward bias to avoid sinking into tiles.
      const y = p.y - spriteHeight / 2 - 3;
      
      ctx.save();
      
      // Flip horizontally if facing right (fixed: was backwards)
      if (p.facingRight) {
        ctx.translate(p.x, p.y);
        ctx.scale(-1, 1);
        ctx.translate(-p.x, -p.y);
      }
      
      ctx.drawImage(this.submarineImg, x, y, spriteWidth, spriteHeight);
      ctx.restore();
    } else {
      // Fallback rectangle if image not loaded
      const x = p.x - p.width / 2;
      const y = p.y - p.height / 2;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, p.width, p.height);
    }
    
    // Bubble burst effect when shooting
    const shootCooldown = this.playerController.getShootCooldown();
    if (shootCooldown > CONFIG.SHOOT_COOLDOWN - 3) {
      ctx.fillStyle = "rgba(120, 210, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(p.x, p.y + p.height / 2 + 5, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(180, 240, 255, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  
  /** Draw a colored aura around the submarine for each active powerup */
  private drawPowerUpAura(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const activePowerUps = this.powerUpManager.getActivePowerUps();
    if (activePowerUps.length === 0 && this.powerupAuraFlash <= 0) return;
    
    ctx.save();
    
    // Draw a layered aura for each active powerup
    for (let i = 0; i < activePowerUps.length; i++) {
      const powerup = activePowerUps[i];
      const info = POWERUP_INFO[powerup.type];
      const pct = powerup.remainingFrames / powerup.totalFrames;
      
      // Parse hex color to RGB for rgba usage
      const rgb = this.hexToRgb(info.color);
      if (!rgb) continue;
      
      // Pulse animation - subtle breathing
      const pulse = 0.7 + Math.sin(this.frameCount * 0.07 + i * 1.5) * 0.3;
      
      // Base alpha based on remaining time (fades as it expires)
      const baseAlpha = 0.15 + pct * 0.25;
      
      // Aura radius varies per layer (stack outward for multiple powerups)
      const auraRadius = 45 + i * 12;
      
      // Outer soft glow
      const outerGlow = ctx.createRadialGradient(px, py, auraRadius * 0.3, px, py, auraRadius);
      outerGlow.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${baseAlpha * pulse})`);
      outerGlow.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${baseAlpha * pulse * 0.5})`);
      outerGlow.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(px, py, auraRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner bright ring
      const ringAlpha = baseAlpha * pulse * 0.6;
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${ringAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, auraRadius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Bright flash effect when powerup is first collected
    if (this.powerupAuraFlash > 0) {
      const flashPct = this.powerupAuraFlash / 30; // normalized 0-1
      const flashRgb = this.hexToRgb(this.powerupAuraFlashColor);
      if (flashRgb) {
        const flashRadius = 60 + (1 - flashPct) * 30; // expands outward
        const flashAlpha = flashPct * 0.6; // fades out
        
        const flashGlow = ctx.createRadialGradient(px, py, 0, px, py, flashRadius);
        flashGlow.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha * 0.8})`);
        flashGlow.addColorStop(0.3, `rgba(${flashRgb.r}, ${flashRgb.g}, ${flashRgb.b}, ${flashAlpha})`);
        flashGlow.addColorStop(0.6, `rgba(${flashRgb.r}, ${flashRgb.g}, ${flashRgb.b}, ${flashAlpha * 0.4})`);
        flashGlow.addColorStop(1, `rgba(${flashRgb.r}, ${flashRgb.g}, ${flashRgb.b}, 0)`);
        ctx.fillStyle = flashGlow;
        ctx.beginPath();
        ctx.arc(px, py, flashRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  }
  
  /** Convert hex color string to RGB components */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }
  
  // ============= POWERUP RENDERING =============
  
  private drawPowerUpOrbs(): void {
    const ctx = this.ctx;
    const orbs = this.powerUpManager.getVisibleOrbs(this.cameraY, CONFIG.INTERNAL_HEIGHT);
    
    for (const orb of orbs) {
      const info = POWERUP_INFO[orb.type];
      const cx = orb.x;
      const cy = orb.y;
      const size = POWERUP_CONSTANTS.ORB_SIZE;
      
      // Floating bob animation
      const bobY = Math.sin(this.frameCount * 0.06 + orb.glowPhase) * 4;
      const drawY = cy + bobY;
      
      // Pulsing glow factor
      const pulse = 0.6 + Math.sin(this.frameCount * 0.08 + orb.glowPhase) * 0.4;
      
      ctx.save();
      
      // Outer glow (large, soft)
      const outerGlow = ctx.createRadialGradient(cx, drawY, 0, cx, drawY, size * 2.5);
      outerGlow.addColorStop(0, info.glowColor.replace("0.6", `${0.3 * pulse}`));
      outerGlow.addColorStop(0.5, info.glowColor.replace("0.6", `${0.1 * pulse}`));
      outerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, drawY, size * 2.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Middle glow ring
      const midGlow = ctx.createRadialGradient(cx, drawY, size * 0.3, cx, drawY, size * 1.2);
      midGlow.addColorStop(0, info.color);
      midGlow.addColorStop(0.4, info.glowColor);
      midGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = midGlow;
      ctx.beginPath();
      ctx.arc(cx, drawY, size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Core orb
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(cx, drawY, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner white highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(cx - size * 0.15, drawY - size * 0.15, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      
      // Rotating sparkle particles around the orb
      const sparkleCount = 4;
      for (let s = 0; s < sparkleCount; s++) {
        const angle = (Math.PI * 2 / sparkleCount) * s + this.frameCount * 0.04 + orb.glowPhase;
        const sparkleR = size * 0.9 + Math.sin(this.frameCount * 0.1 + s * 2) * 3;
        const sx = cx + Math.cos(angle) * sparkleR;
        const sy = drawY + Math.sin(angle) * sparkleR;
        const sparkleSize = 1.5 + Math.sin(this.frameCount * 0.15 + s) * 0.5;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Type icon letter in center
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.name[0], cx, drawY + 1);
      
      ctx.restore();
    }
  }
  
  private drawSatellites(): void {
    if (!this.powerUpManager.hasPowerUp("SATELLITE")) return;
    
    const ctx = this.ctx;
    const player = this.playerController.getPlayer();
    const positions = this.powerUpManager.getSatellitePositions(player.x, player.y);
    const orbSize = POWERUP_CONSTANTS.SATELLITE_ORB_SIZE;
    const info = POWERUP_INFO["SATELLITE"];
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      // Trail effect
      const satellites = this.powerUpManager.getSatellites();
      const trailAngle = satellites[i].angle - POWERUP_CONSTANTS.SATELLITE_SPEED * 5;
      const trailX = player.x + Math.cos(trailAngle) * satellites[i].radius;
      const trailY = player.y + Math.sin(trailAngle) * satellites[i].radius;
      
      ctx.fillStyle = info.glowColor.replace("0.6", "0.15");
      ctx.beginPath();
      ctx.arc(trailX, trailY, orbSize * 0.7, 0, Math.PI * 2);
      ctx.fill();
      
      // Glow
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, orbSize * 2);
      glow.addColorStop(0, info.glowColor.replace("0.6", "0.4"));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, orbSize * 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Core orb
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, orbSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(pos.x - orbSize * 0.25, pos.y - orbSize * 0.25, orbSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer ring
      ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, orbSize + 1, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw orbit path (faint)
    ctx.strokeStyle = info.glowColor.replace("0.6", "0.08");
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, POWERUP_CONSTANTS.SATELLITE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  private drawBlastExplosions(): void {
    const ctx = this.ctx;
    const explosions = this.powerUpManager.getBlastExplosions();
    const info = POWERUP_INFO["BLAST"];
    
    for (const exp of explosions) {
      ctx.save();
      
      // Outer shockwave ring
      ctx.strokeStyle = info.color.replace("1)", `${exp.alpha * 0.6})`).replace("#ff6633", `rgba(255, 102, 51, ${exp.alpha * 0.6})`);
      const ringColor = `rgba(255, 102, 51, ${exp.alpha * 0.6})`;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner fire gradient
      const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
      gradient.addColorStop(0, `rgba(255, 200, 100, ${exp.alpha * 0.5})`);
      gradient.addColorStop(0.4, `rgba(255, 102, 51, ${exp.alpha * 0.3})`);
      gradient.addColorStop(0.7, `rgba(255, 50, 0, ${exp.alpha * 0.15})`);
      gradient.addColorStop(1, `rgba(255, 50, 0, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Bright center flash
      if (exp.frame < 8) {
        const flashAlpha = (1 - exp.frame / 8) * 0.7;
        ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }
  
  private drawLightningChains(): void {
    const ctx = this.ctx;
    const chains = this.powerUpManager.getLightningChains();
    const info = POWERUP_INFO["LIGHTNING"];
    
    for (const chain of chains) {
      if (chain.points.length < 2) continue;
      
      ctx.save();
      
      // Draw jagged lightning bolts between points
      for (let i = 0; i < chain.points.length - 1; i++) {
        const from = chain.points[i];
        const to = chain.points[i + 1];
        
        // Main bolt (thick, bright)
        this.drawLightningBolt(ctx, from.x, from.y, to.x, to.y, chain.alpha, info.color, 3);
        
        // Glow bolt (wider, dimmer)
        this.drawLightningBolt(ctx, from.x, from.y, to.x, to.y, chain.alpha * 0.3, info.color, 8);
      }
      
      // Draw glow at each chain point
      for (const pt of chain.points) {
        const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 20);
        glow.addColorStop(0, `rgba(255, 238, 51, ${chain.alpha * 0.5})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }
  
  private drawLightningBolt(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    alpha: number, color: string, width: number
  ): void {
    const segments = 6;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const perpX = -dy;
    const perpY = dx;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
    const normPerpX = perpLen > 0 ? perpX / perpLen : 0;
    const normPerpY = perpLen > 0 ? perpY / perpLen : 0;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const baseX = x1 + dx * t;
      const baseY = y1 + dy * t;
      // Use deterministic jitter based on frame count and segment
      const jitter = Math.sin(this.frameCount * 0.5 + s * 3.7) * 12;
      ctx.lineTo(baseX + normPerpX * jitter, baseY + normPerpY * jitter);
    }
    
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  private drawLaserBeams(): void {
    const ctx = this.ctx;
    const beams = this.powerUpManager.getLaserBeams();
    const info = POWERUP_INFO["LASER"];
    
    for (const beam of beams) {
      ctx.save();
      
      const halfWidth = beam.width / 2;
      
      // Outer glow
      const outerGlow = ctx.createLinearGradient(beam.x - halfWidth * 3, 0, beam.x + halfWidth * 3, 0);
      outerGlow.addColorStop(0, "rgba(0,0,0,0)");
      outerGlow.addColorStop(0.3, `rgba(0, 255, 204, ${beam.alpha * 0.15})`);
      outerGlow.addColorStop(0.5, `rgba(0, 255, 204, ${beam.alpha * 0.3})`);
      outerGlow.addColorStop(0.7, `rgba(0, 255, 204, ${beam.alpha * 0.15})`);
      outerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = outerGlow;
      ctx.fillRect(beam.x - halfWidth * 3, beam.startY, halfWidth * 6, beam.endY - beam.startY);
      
      // Core beam
      const coreGrad = ctx.createLinearGradient(beam.x - halfWidth, 0, beam.x + halfWidth, 0);
      coreGrad.addColorStop(0, `rgba(0, 255, 204, ${beam.alpha * 0.6})`);
      coreGrad.addColorStop(0.5, `rgba(200, 255, 240, ${beam.alpha * 0.9})`);
      coreGrad.addColorStop(1, `rgba(0, 255, 204, ${beam.alpha * 0.6})`);
      ctx.fillStyle = coreGrad;
      ctx.fillRect(beam.x - halfWidth, beam.startY, halfWidth * 2, beam.endY - beam.startY);
      
      // White-hot center line
      ctx.fillStyle = `rgba(255, 255, 255, ${beam.alpha * 0.8})`;
      ctx.fillRect(beam.x - 1, beam.startY, 2, beam.endY - beam.startY);
      
      // Sparkle particles along the beam
      const sparkCount = 5;
      for (let s = 0; s < sparkCount; s++) {
        const t = (s / sparkCount + this.frameCount * 0.03) % 1;
        const sy = beam.startY + (beam.endY - beam.startY) * t;
        const sx = beam.x + Math.sin(this.frameCount * 0.2 + s * 2.5) * halfWidth * 1.5;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${beam.alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }
  
  private drawTouchZones(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const leftZone = w * 0.33;
    const rightZone = w * 0.67;
    
    // Semi-transparent zone indicators - full screen
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    
    // Left zone (move left)
    ctx.fillRect(0, 0, leftZone, h);
    
    // Right zone (move right)
    ctx.fillRect(rightZone, 0, w - rightZone, h);
    
    // Center zone (tap action - jump/shoot)
    ctx.fillStyle = "rgba(0, 255, 0, 0.03)";
    ctx.fillRect(leftZone, 0, rightZone - leftZone, h);
    
    // Zone labels - scale font for DPR
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = Math.round(10 * dpr);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = `${fontSize}px 'Press Start 2P'`;
    ctx.textAlign = "center";
    
    const labelY = h - Math.round(20 * dpr);
    ctx.fillText("LEFT", w * 0.165, labelY);
    ctx.fillText("TAP", w * 0.5, labelY);
    ctx.fillText("RIGHT", w * 0.835, labelY);
  }
  
  private gameLoop(timestamp: number = 0): void {
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
      this.draw();
      return;
    }
    
    let delta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    
    // Clamp delta to avoid spiral of death after tab switch / backgrounding
    if (delta > 200) delta = this.TARGET_FRAME_MS;
    
    this.accumulator += delta;
    
    // Run update at fixed 60fps steps
    while (this.accumulator >= this.TARGET_FRAME_MS) {
      this.update();
      this.accumulator -= this.TARGET_FRAME_MS;
    }
    
    this.draw();
  }
  
  /** Restart the game loop if it was stopped (e.g., iOS WebView tab switch) */
  private ensureGameLoopRunning(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    // Reset timing so we don't get a huge delta spike on resume
    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.gameLoop();
  }
}

// Initialize game when DOM is ready (singleton to prevent duplicate game loops in WebViews)
let gameInstance: Game | null = null;

function initGame(): void {
  if (gameInstance) {
    console.log("[Game] Game instance already exists, skipping duplicate init");
    return;
  }
  gameInstance = new Game();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGame);
} else {
  initGame();
}
