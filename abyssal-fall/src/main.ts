/**
 * DOWNWELL - A vertical roguelike shooter
 * 
 * Fall down an endless well, shoot enemies, bounce on heads, and survive.
 * Features deterministic level generation with infinite vertical world.
 */

import { CONFIG } from "./config";
import { LevelSpawner, Entity, Platform, Gem, BaseEnemy, Weed } from "./world";
import { PlayerController, InputState, Player } from "./player";
import { PowerUpManager, PowerUpOrb, POWERUP_INFO, POWERUP_CONSTANTS, PowerUpType } from "./powerups";
import { EnemyBullet, PufferEnemy, StaticEnemy } from "./enemies";
import { WorldDoorwaySystem, WorldDoorway, DoorwayRoomType, DoorwaySide } from "./world-doorways";

// ============= TYPES =============
interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface HudRefs {
  scoreEl: HTMLElement | null;
  depthEl: HTMLElement | null;
  gemsEl: HTMLElement | null;
  ammoEl: HTMLElement | null;
  comboEl: HTMLElement | null;
  ammoSliderFill: HTMLElement | null;
  ammoSliderSegmentsEl: HTMLElement | null;
  hpBar: HTMLElement | null;
  hpBubbles: HTMLElement[];
  powerupBar: HTMLElement | null;
}

interface ChunkPlatformCache {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
}

type ShopSide = DoorwaySide;
type RoomItemId =
  | "hp_up"
  | "ammo_up"
  | "stomp_reload"
  | "deep_tank"
  | "vampiric_gel"
  | "salvage_bonus"
  | "rapid_chamber"
  | "chest_cache"
  | "powerup_cache";

interface RoomItem {
  id: RoomItemId;
  name: string;
  description: string;
  cost: number;
  soldOut: boolean;
  rect: { x: number; y: number; width: number; height: number };
  rewardPowerupType?: PowerUpType;
}

interface RoomPowerupPickup {
  type: PowerUpType;
  x: number;
  y: number;
  width: number;
  height: number;
  glowPhase: number;
  collected: boolean;
}

interface RunUpgrades {
  stompReloadOneAmmo: boolean;
  deepTankPlusTwoAmmo: boolean;
  vampiricGel: boolean;
  salvageBreakablesDropGems: boolean;
  rapidChamber: boolean;
}

interface RoomEntryContext {
  returnX: number;
  returnY: number;
  returnVx: number;
  returnVy: number;
}

type PlayerAnimState = "idle" | "run" | "jump" | "fall" | "shoot";
interface PlayerAnimConfig {
  src: string;
  frames: number;
  speed: number;
}

interface HitboxTuning {
  playerBaseWidth: number;
  playerBaseHeight: number;
  playerHorizontalWidth: number;
  playerHorizontalHeight: number;
  weedPadXRatio: number;
  weedPadTopRatio: number;
  weedTrimBottomRatio: number;
  pufferRadiusScale: number;
  crabScaleX: number;
  crabScaleY: number;
  sharkScaleX: number;
  sharkScaleY: number;
  squidScaleX: number;
  squidScaleY: number;
  playerSpriteOffsetX: number;
  playerSpriteOffsetY: number;
}

type LabRectCollider = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
};

type LabCircleCollider = {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
};

type LabCollider = LabRectCollider | LabCircleCollider;

const DEFAULT_HITBOX_TUNING: HitboxTuning = {
  playerBaseWidth: 30,
  playerBaseHeight: 40,
  playerHorizontalWidth: 38,
  playerHorizontalHeight: 28,
  weedPadXRatio: 0.22,
  weedPadTopRatio: 0.12,
  weedTrimBottomRatio: 0.08,
  pufferRadiusScale: 1,
  crabScaleX: 1,
  crabScaleY: 1,
  sharkScaleX: 1,
  sharkScaleY: 1,
  squidScaleX: 1,
  squidScaleY: 1,
  playerSpriteOffsetX: 0,
  playerSpriteOffsetY: 0,
};

// ============= GAME STATE =============
class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: "start" | "playing" | "shop" | "gameOver" = "start";
  
  private playerController: PlayerController;
  private levelSpawner: LevelSpawner;
  private powerUpManager: PowerUpManager;
  
  private activeEnemies: BaseEnemy[] = [];
  private activeGems: Gem[] = [];
  private droppedGems: Gem[] = [];
  private droppedGemPool: Gem[] = [];
  private activePlatforms: Platform[] = [];
  private activeWallPlatforms: Platform[] = [];
  private activeWeeds: Weed[] = [];
  private brokenWeeds: Set<string> = new Set();
  private stompedWeeds: Map<string, { weed: Weed; timer: number }> = new Map();
  private enemyBullets: EnemyBullet[] = [];
  private platformBuckets: Map<string, Platform[]> = new Map();
  private readonly PLATFORM_BUCKET_SIZE: number = 64;
  private chunkPlatformCache: Map<number, ChunkPlatformCache> = new Map();
  private hudRefs: HudRefs = {
    scoreEl: null,
    depthEl: null,
    gemsEl: null,
    ammoEl: null,
    comboEl: null,
    ammoSliderFill: null,
    ammoSliderSegmentsEl: null,
    hpBar: null,
    hpBubbles: [],
    powerupBar: null,
  };
  private prevHudScore: number = -1;
  private prevHudDepth: number = -1;
  private prevHudGems: number = -1;
  private prevHudAmmo: string = "";
  private prevHudAmmoPercent: number = -1;
  private prevHudCombo: number = -1;
  
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
  private enemyKillCount: number = 0;
  private gemCollectCount: number = 0;
  private breakableDestroyCount: number = 0;
  private gameOverTimers: number[] = [];
  private frameCount: number = 0;
  private roomActionWasPressed: boolean = false;

  private readonly SHOP_HP_UP_COST: number = 50;
  private readonly SHOP_AMMO_UP_COST: number = 50;
  private readonly SHOP_STOMP_RELOAD_COST: number = 100;
  private readonly SHOP_DEEP_TANK_COST: number = 100;
  private readonly SHOP_VAMPIRIC_GEL_COST: number = 100;
  private readonly SHOP_SALVAGE_BONUS_COST: number = 50;
  private readonly SHOP_RAPID_CHAMBER_COST: number = 50;
  private readonly VAMPIRIC_GEL_HEAL_CHANCE: number = 0.05;
  private readonly SALVAGE_BREAKABLE_GEM_CHANCE: number = 0.45;
  private readonly SHOP_TEST_BREAKABLE_RESPAWN_FRAMES: number = 35;
  private readonly SHOP_TEST_MODE: boolean =
    new URLSearchParams(window.location.search).get("shoptest") === "1";
  private readonly SHOP_ROOM_LEFT: number = 54;
  private readonly SHOP_ROOM_RIGHT: number = CONFIG.INTERNAL_WIDTH - 54;
  private readonly SHOP_ROOM_TOP: number = 98;
  private readonly SHOP_ROOM_BOTTOM: number = CONFIG.INTERNAL_HEIGHT - 56;
  private readonly SHOP_ENTRANCE_HEIGHT: number = 110;
  private readonly ROOM_CORRIDOR_DEPTH: number = 120;
  private readonly SHOP_TUNNEL_STRIP_HEIGHT: number = 6;
  private readonly SHOP_TRANSITION_LOCK_FRAMES: number = 18;
  private readonly WORLD_DOORWAY_DEBUG: boolean = false;
  private debugDrawHitboxes: boolean = false;
  private readonly HITBOX_TUNING_STORAGE_KEY: string = "downwellHitboxTuningV1";
  private readonly HITBOX_LAB_STORAGE_KEY: string = "downwellHitboxLabFramesV1";
  private hitboxTuning: HitboxTuning = { ...DEFAULT_HITBOX_TUNING };
  private hitboxLabColliders: Record<string, LabCollider> = {};
  private hitboxLabLoadedCount: number = 0;
  private hitboxPanelEl: HTMLDivElement | null = null;
  private hitboxPanelVisible: boolean = false;
  private readonly WORLD_DOORWAY_INTERVAL_METERS: number = 300;
  private readonly WORLD_FIRST_DOORWAY_METERS: number = 300;
  private roomTransitionLockFrames: number = 0;
  private roomNoFundsTimer: number = 0;
  private currentRoomEntranceSide: ShopSide = "left";
  private roomEntryContext: RoomEntryContext | null = null;
  private currentRoomType: DoorwayRoomType | null = null;
  private pendingRoomPowerupReward: PowerUpType | null = null;
  private roomItems: RoomItem[] = [];
  private roomPowerupPickup: RoomPowerupPickup | null = null;
  private selectedRoomItemId: RoomItemId | null = null;
  private previousRoomItemId: RoomItemId | null = null;
  private shopTestBreakableDestroyed: boolean = false;
  private shopTestBreakableRespawnFrames: number = 0;
  private runUpgrades: RunUpgrades = {
    stompReloadOneAmmo: false,
    deepTankPlusTwoAmmo: false,
    vampiricGel: false,
    salvageBreakablesDropGems: false,
    rapidChamber: false,
  };
  private worldDoorwaySystem: WorldDoorwaySystem;
  private activeWorldDoorways: WorldDoorway[] = [];
  
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
  private wallTileLeftImg: HTMLImageElement | null = null;
  private wallTileCenterImg: HTMLImageElement | null = null;
  private wallTileRightImg: HTMLImageElement | null = null;
  private platformTopAImg: HTMLImageElement | null = null;
  private platformTopBImg: HTMLImageElement | null = null;
  private platformBottomImg: HTMLImageElement | null = null;
  private platformFillImg: HTMLImageElement | null = null;
  private wallBreakableTileImg: HTMLImageElement | null = null;
  private playerAnimImages: Record<PlayerAnimState, HTMLImageElement | null> = {
    idle: null,
    run: null,
    jump: null,
    fall: null,
    shoot: null,
  };
  private playerAnimLoaded: Record<PlayerAnimState, boolean> = {
    idle: false,
    run: false,
    jump: false,
    fall: false,
    shoot: false,
  };
  private playerAnimState: PlayerAnimState = "idle";
  private playerAnimFrame: number = 0;
  private playerAnimTimer: number = 0;
  private gemSimpleImg: HTMLImageElement | null = null;
  private gemOutlinedImg: HTMLImageElement | null = null;
  private gemSimpleLoaded: boolean = false;
  private gemOutlinedLoaded: boolean = false;
  private weedsImg: HTMLImageElement | null = null;
  private shopHpIconImg: HTMLImageElement | null = null;
  private shopAmmoIconImg: HTMLImageElement | null = null;
  private shopUtilityIconImg: HTMLImageElement | null = null;
  private shopRapidIconImg: HTMLImageElement | null = null;
  private shopVampiricIconImg: HTMLImageElement | null = null;
  private shopSalvageIconImg: HTMLImageElement | null = null;
  private chestIconImg: HTMLImageElement | null = null;
  private menuCrabImg: HTMLImageElement | null = null;
  private menuCrabFrame: number = 0;
  private readonly DIVER_DRAW_SIZE: number = 64;
  private readonly PLAYER_FRAME_W: number = 48;
  private readonly PLAYER_FRAME_H: number = 48;
  private readonly PLAYER_ANIMS: Record<PlayerAnimState, PlayerAnimConfig> = {
    idle: { src: "assets/characters/underwater4/Idle.png", frames: 4, speed: 0.07 },
    run: { src: "assets/characters/underwater4/Walk.png", frames: 6, speed: 0.11 },
    jump: { src: "assets/characters/underwater4/Walk2.png", frames: 6, speed: 0.1 },
    fall: { src: "assets/characters/underwater4/Walk2.png", frames: 6, speed: 0.07 },
    shoot: { src: "assets/characters/underwater4/Attack.png", frames: 6, speed: 0.15 },
  };
  
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
    spriteType: "shark" | "crab" | "squid" | "puffer"; // Which hurt sprite to use
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
  private readonly DEATH_FREEZE_DURATION_FRAMES: number = 180;
  private readonly CONTACT_HIT_INVULN_FRAMES: number = 54;
  
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
  private shopMusicAudio: HTMLAudioElement | null = null;
  private loadingMusicAudio: HTMLAudioElement | null = null;
  private gameOverMusicAudio: HTMLAudioElement | null = null;
  private bulletBuffer: AudioBuffer | null = null;
  private laserBuffer: AudioBuffer | null = null;
  private gemBuffer: AudioBuffer | null = null;
  private enemyCrunchBuffer: AudioBuffer | null = null;
  private blastBuffer: AudioBuffer | null = null;
  private lightningBuffer: AudioBuffer | null = null;
  private shieldBuffer: AudioBuffer | null = null;
  private readonly UNIFORM_SFX_VOLUME: number = 0.55;
  private readonly UNIFORM_SYNTH_PEAK_GAIN: number = 0.14;
  private readonly MAGNET_RADIUS: number = 200;
  private magnetPullSfxCooldownFrames: number = 0;
  
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
    this.worldDoorwaySystem = new WorldDoorwaySystem({
      worldWidth: CONFIG.INTERNAL_WIDTH,
      wallBlockSize: CONFIG.WALL_BLOCK_SIZE,
      intervalMeters: this.WORLD_DOORWAY_INTERVAL_METERS,
      firstDoorwayMeters: this.WORLD_FIRST_DOORWAY_METERS,
      openingWidth: CONFIG.WALL_MAX_BLOCKS * CONFIG.WALL_BLOCK_SIZE,
      openingHeightBlocksMin: 3,
      openingHeightBlocksMax: 4,
      tunnelStripHeight: this.SHOP_TUNNEL_STRIP_HEIGHT,
      triggerDepthPx: 18,
      antiDroughtIntervals: 2,
      roomWeights: { shop: 0.45, chest: 0.3, powerup: 0.25 },
    });
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
    this.cacheHudRefs();
    this.loadHitboxTuning();
    this.loadHitboxLabColliders();
    this.loadHitboxLabCollidersFromFile(); // async, overrides localStorage if collisions.json exists
    this.applyHitboxTuning();
    
    // Start game loop
    this.gameLoop();
  }
  
  private setupEventListeners(): void {
    const tryStartFromUi = (): void => {
      if (this.gameState !== "start" && this.gameState !== "gameOver") return;
      try {
        this.triggerHaptic("light");
        this.startGame();
      } catch (err) {
        console.error("[Game] Failed to start from UI:", err);
      }
    };

    // Start button
    document.getElementById("start-btn")?.addEventListener("click", tryStartFromUi);
    document.getElementById("start-btn")?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      tryStartFromUi();
    });
    
    // Restart button
    document.getElementById("restart-btn")?.addEventListener("click", tryStartFromUi);
    
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
      this.tryStartLoadingMusicFromInteraction();
      this.tryStartGameOverMusicFromInteraction();
      if (e.code === "KeyP" && !e.repeat) {
        this.debugDrawHitboxes = !this.debugDrawHitboxes;
        console.log(`[Debug] Hitboxes ${this.debugDrawHitboxes ? "ON" : "OFF"}`);
        e.preventDefault();
      }
      if (this.gameState !== "playing" && this.gameState !== "shop") return;
      const isLeftKey = e.code === "ArrowLeft" || e.code === "KeyA";
      const isRightKey = e.code === "ArrowRight" || e.code === "KeyD";
      const isActionKey =
        e.code === "Space" ||
        e.code === "ArrowDown" ||
        e.code === "KeyS" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight" ||
        e.code === "ArrowUp" ||
        e.code === "KeyW";
      
      if (isLeftKey) {
        this.input.left = true;
        e.preventDefault();
      }
      if (isRightKey) {
        this.input.right = true;
        e.preventDefault();
      }
      if (isActionKey) {
        // Unified action: jump when grounded, shoot when airborne.
        this.input.shoot = true;
        this.input.jump = true;
        if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
          console.log("[Keyboard]", "Shift pressed for shoot");
        }
        e.preventDefault();
      }
    });
    
    window.addEventListener("keyup", (e) => {
      const isLeftKey = e.code === "ArrowLeft" || e.code === "KeyA";
      const isRightKey = e.code === "ArrowRight" || e.code === "KeyD";
      const isActionKey =
        e.code === "Space" ||
        e.code === "ArrowDown" ||
        e.code === "KeyS" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight" ||
        e.code === "ArrowUp" ||
        e.code === "KeyW";

      if (isLeftKey) {
        this.input.left = false;
      }
      if (isRightKey) {
        this.input.right = false;
      }
      if (isActionKey) {
        this.input.shoot = false;
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
      this.tryStartLoadingMusicFromInteraction();
      this.tryStartGameOverMusicFromInteraction();
      if (this.gameState !== "playing" && this.gameState !== "shop") return;
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
    this.tryStartLoadingMusicFromInteraction();
    this.tryStartGameOverMusicFromInteraction();
    if (this.gameState !== "playing" && this.gameState !== "shop") return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    this.updateInputFromTouches();
  }
  
  private handleTouchMove(e: TouchEvent): void {
    if (this.gameState !== "playing" && this.gameState !== "shop") return;
    
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

  /** Get CSS display height of the canvas (not the buffer height) */
  private getDisplayHeight(): number {
    const vv = (window as any).visualViewport;
    return vv ? Math.round(vv.height) : window.innerHeight;
  }

  /** Returns mobile button positions in CSS pixel coordinates */
  private getMobileButtons() {
    const w = this.getDisplayWidth();
    const h = this.getDisplayHeight();
    const r = 44;
    const margin = 28;
    const gap = 18;
    const clusterY = h - margin - r;
    return {
      left:   { cx: margin + r,             cy: clusterY, r },
      right:  { cx: margin + r * 3 + gap,   cy: clusterY, r },
      action: { cx: w - margin - r,         cy: clusterY, r },
    };
  }

  private inCircle(x: number, y: number, btn: { cx: number; cy: number; r: number }): boolean {
    const dx = x - btn.cx;
    const dy = y - btn.cy;
    return dx * dx + dy * dy <= btn.r * btn.r;
  }
  
  private updateInputFromTouches(): void {
    // Reset input
    this.input.left = false;
    this.input.right = false;
    this.input.shoot = false;
    this.input.jump = false;

    const btns = this.getMobileButtons();
    for (const touch of this.touches.values()) {
      if (this.inCircle(touch.x, touch.y, btns.left))   this.input.left = true;
      if (this.inCircle(touch.x, touch.y, btns.right))  this.input.right = true;
      if (this.inCircle(touch.x, touch.y, btns.action)) { this.input.jump = true; this.input.shoot = true; }
    }
  }
  
  private handleMouseInput(clientX: number, clientY: number): void {
    const btns = this.getMobileButtons();
    if (this.inCircle(clientX, clientY, btns.left))   this.input.left = true;
    if (this.inCircle(clientX, clientY, btns.right))  this.input.right = true;
    if (this.inCircle(clientX, clientY, btns.action)) { this.input.jump = true; this.input.shoot = true; }
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

  private cacheHudRefs(): void {
    this.hudRefs.scoreEl = document.getElementById("score");
    this.hudRefs.depthEl = document.getElementById("depth");
    this.hudRefs.gemsEl = document.getElementById("gems");
    this.hudRefs.ammoEl = document.getElementById("ammo");
    this.hudRefs.comboEl = document.getElementById("combo");
    this.hudRefs.ammoSliderFill = document.getElementById("ammo-slider-fill");
    this.hudRefs.ammoSliderSegmentsEl = document.getElementById("ammo-slider-segments");
    this.hudRefs.hpBar = document.getElementById("hp-bar");
    this.hudRefs.powerupBar = document.getElementById("powerup-bar");
    this.hudRefs.hpBubbles = this.hudRefs.hpBar
      ? Array.from(this.hudRefs.hpBar.querySelectorAll(".hp-bubble")) as HTMLElement[]
      : [];
  }

  private syncHpBubbles(maxHp: number): void {
    if (!this.hudRefs.hpBar) return;
    const existing = this.hudRefs.hpBubbles.length;
    if (existing === maxHp) return;

    this.hudRefs.hpBar.innerHTML = "";
    for (let hp = maxHp - 1; hp >= 0; hp--) {
      const bubble = document.createElement("div");
      bubble.className = "hp-bubble";
      bubble.setAttribute("data-hp", `${hp}`);
      this.hudRefs.hpBar.appendChild(bubble);
    }
    this.hudRefs.hpBubbles = Array.from(this.hudRefs.hpBar.querySelectorAll(".hp-bubble")) as HTMLElement[];
    this.previousHp = this.playerController.getPlayer().hp;
  }

  private syncAmmoSliderSegments(maxAmmo: number): void {
    if (!this.hudRefs.ammoSliderSegmentsEl) return;
    const existing = this.hudRefs.ammoSliderSegmentsEl.querySelectorAll(".ammo-segment").length;
    if (existing === maxAmmo) return;

    this.hudRefs.ammoSliderSegmentsEl.innerHTML = "";
    for (let i = 0; i < maxAmmo; i++) {
      const seg = document.createElement("div");
      seg.className = "ammo-segment";
      this.hudRefs.ammoSliderSegmentsEl.appendChild(seg);
    }
  }

  private resetHudStateCache(): void {
    this.prevHudScore = -1;
    this.prevHudDepth = -1;
    this.prevHudGems = -1;
    this.prevHudAmmo = "";
    this.prevHudAmmoPercent = -1;
    this.prevHudCombo = -1;
  }

  private getBucketKey(col: number, row: number): string {
    return `${col}:${row}`;
  }

  private rebuildPlatformBuckets(): void {
    this.platformBuckets.clear();
    const size = this.PLATFORM_BUCKET_SIZE;
    for (const platform of this.activePlatforms) {
      const minCol = Math.floor(platform.x / size);
      const maxCol = Math.floor((platform.x + platform.width) / size);
      const minRow = Math.floor(platform.y / size);
      const maxRow = Math.floor((platform.y + platform.height) / size);
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const key = this.getBucketKey(col, row);
          const list = this.platformBuckets.get(key);
          if (list) {
            list.push(platform);
          } else {
            this.platformBuckets.set(key, [platform]);
          }
        }
      }
    }
  }

  private getPlatformsNearRect(x: number, y: number, width: number, height: number, padding: number = 0): Platform[] {
    const size = this.PLATFORM_BUCKET_SIZE;
    const minCol = Math.floor((x - padding) / size);
    const maxCol = Math.floor((x + width + padding) / size);
    const minRow = Math.floor((y - padding) / size);
    const maxRow = Math.floor((y + height + padding) / size);
    const candidates: Platform[] = [];
    const seen = new Set<Platform>();
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = this.getBucketKey(col, row);
        const bucket = this.platformBuckets.get(key);
        if (!bucket) continue;
        for (const platform of bucket) {
          if (seen.has(platform)) continue;
          seen.add(platform);
          candidates.push(platform);
        }
      }
    }
    return candidates;
  }

  private clearPlatformChunkCache(): void {
    this.chunkPlatformCache.clear();
  }

  private markChunkPlatformCacheDirty(chunkIndex: number): void {
    const cache = this.chunkPlatformCache.get(chunkIndex);
    if (cache) cache.dirty = true;
  }

  private cleanupChunkPlatformCache(cameraY: number): void {
    const currentChunk = Math.floor(cameraY / CONFIG.CHUNK_HEIGHT);
    const minChunk = currentChunk - 4;
    for (const chunkIndex of this.chunkPlatformCache.keys()) {
      if (chunkIndex < minChunk) {
        this.chunkPlatformCache.delete(chunkIndex);
      }
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

    // Load wall tile textures (seaside cave set)
    this.wallTileLeftImg = new Image();
    this.wallTileLeftImg.onload = () => {
      console.log("[Game] Wall tile LEFT loaded");
      this.clearPlatformChunkCache();
    };
    this.wallTileLeftImg.src = "assets/tiles/wall_terrain_left.png";

    this.wallTileCenterImg = new Image();
    this.wallTileCenterImg.onload = () => {
      console.log("[Game] Wall tile CENTER loaded");
      this.clearPlatformChunkCache();
    };
    this.wallTileCenterImg.src = "assets/tiles/wall_terrain_center.png";

    this.wallTileRightImg = new Image();
    this.wallTileRightImg.onload = () => {
      console.log("[Game] Wall tile RIGHT loaded");
      this.clearPlatformChunkCache();
    };
    this.wallTileRightImg.src = "assets/tiles/wall_terrain_right.png";

    this.platformTopAImg = new Image();
    this.platformTopAImg.onload = () => {
      console.log("[Game] Platform tile TOP A loaded");
      this.clearPlatformChunkCache();
    };
    this.platformTopAImg.src = "assets/tiles/platform_top_a.png";

    this.platformTopBImg = new Image();
    this.platformTopBImg.onload = () => {
      console.log("[Game] Platform tile TOP B loaded");
      this.clearPlatformChunkCache();
    };
    this.platformTopBImg.src = "assets/tiles/platform_top_b.png";

    this.platformBottomImg = new Image();
    this.platformBottomImg.onload = () => {
      console.log("[Game] Platform tile BOTTOM loaded");
      this.clearPlatformChunkCache();
    };
    this.platformBottomImg.src = "assets/tiles/platform_bottom.png";

    this.platformFillImg = new Image();
    this.platformFillImg.onload = () => {
      console.log("[Game] Platform tile FILL loaded");
      this.clearPlatformChunkCache();
    };
    this.platformFillImg.src = "assets/tiles/platform_fill.png";

    this.wallBreakableTileImg = new Image();
    this.wallBreakableTileImg.onload = () => {
      console.log("[Game] Wall tile BREAKABLE loaded");
      this.clearPlatformChunkCache();
    };
    this.wallBreakableTileImg.src = "assets/tiles/wall_breakable_a.png";
    
    // Load player animation strips from underwater pack.
    (Object.keys(this.PLAYER_ANIMS) as PlayerAnimState[]).forEach((state) => {
      const img = new Image();
      img.onload = () => {
        this.playerAnimLoaded[state] = true;
        console.log(`[Game] Player animation loaded: ${state}`);
      };
      img.src = this.PLAYER_ANIMS[state].src;
      this.playerAnimImages[state] = img;
    });

    this.gemSimpleImg = new Image();
    this.gemSimpleImg.onload = () => {
      this.gemSimpleLoaded = true;
      console.log("[Game] Pink gem sprite loaded");
    };
    this.gemSimpleImg.src = "assets/gem_pink.png";

    this.gemOutlinedImg = new Image();
    this.gemOutlinedImg.onload = () => {
      this.gemOutlinedLoaded = true;
      console.log("[Game] Pink outlined gem sprite loaded");
    };
    this.gemOutlinedImg.src = "assets/gem_pink_outlined.png";

    // Load weeds sprite sheet (4 cols x 2 rows, 7 sprites)
    this.weedsImg = new Image();
    this.weedsImg.onload = () => {
      console.log("[Game] Weeds sprite sheet loaded");
    };
    this.weedsImg.src = "assets/weeds.png";

    // Load shop item icons
    this.shopHpIconImg = new Image();
    this.shopHpIconImg.onload = () => {
      console.log("[Game] Shop HP icon loaded");
    };
    this.shopHpIconImg.src = "assets/shop-icons/hp_yellow.png";

    this.shopAmmoIconImg = new Image();
    this.shopAmmoIconImg.onload = () => {
      console.log("[Game] Shop ammo icon loaded");
    };
    this.shopAmmoIconImg.src = "assets/shop-icons/ammo_B_red.png";

    this.shopUtilityIconImg = new Image();
    this.shopUtilityIconImg.onload = () => {
      console.log("[Game] Shop utility icon loaded");
    };
    this.shopUtilityIconImg.src = "assets/shop-icons/stomp_utility_spritesheet.png";

    this.shopRapidIconImg = new Image();
    this.shopRapidIconImg.onload = () => {
      console.log("[Game] Shop rapid chamber icon loaded");
    };
    this.shopRapidIconImg.src = "assets/shop-icons/rapid_chamber.png";

    this.shopVampiricIconImg = new Image();
    this.shopVampiricIconImg.onload = () => {
      console.log("[Game] Shop vampiric gel icon loaded");
    };
    this.shopVampiricIconImg.src = "assets/shop-icons/heart_red.png";

    this.shopSalvageIconImg = new Image();
    this.shopSalvageIconImg.onload = () => {
      console.log("[Game] Shop salvage bonus icon loaded");
    };
    this.shopSalvageIconImg.src = "assets/shop-icons/salvage_bonus.png";

    this.chestIconImg = new Image();
    this.chestIconImg.onload = () => {
      console.log("[Game] Chest icon loaded");
    };
    this.chestIconImg.src = "assets/shop-icons/chest_closed.png";
    
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
    this.loadingMusicAudio = new Audio("assets/sfx/underwater-ambience.mp3");
    this.loadingMusicAudio.loop = true;
    this.loadingMusicAudio.volume = 0.25;
    this.loadingMusicAudio.preload = "auto";
    this.loadingMusicAudio.addEventListener("error", () => {
      console.log("[loadAudio]", "Failed to load loading music file");
    });
    console.log("[Game] Loading music audio loaded");

    this.gameOverMusicAudio = new Audio("assets/sfx/game-over.mp3");
    this.gameOverMusicAudio.loop = true;
    this.gameOverMusicAudio.volume = 0.24;
    this.gameOverMusicAudio.preload = "auto";
    this.gameOverMusicAudio.addEventListener("error", () => {
      console.log("[loadAudio]", "Failed to load game-over music file");
    });
    console.log("[Game] Game-over music audio loaded");

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

    this.shopMusicAudio = new Audio("assets/sfx/coral-cafe-jingle.mp3");
    this.shopMusicAudio.loop = true;
    this.shopMusicAudio.volume = 0.22;
    this.shopMusicAudio.preload = "auto";
    this.shopMusicAudio.addEventListener("error", () => {
      console.log("[loadAudio]", "Failed to load shop music file");
    });
    console.log("[Game] Shop music audio loaded");
    
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

    this.decodeAudioFile("assets/sfx/bubble-laser-fx.wav").then((buf) => {
      this.blastBuffer = buf;
      console.log("[loadAudio]", "Blast audio decoded");
    });

    this.decodeAudioFile("assets/sfx/lightning-zap.mp3").then((buf) => {
      this.lightningBuffer = buf;
      console.log("[loadAudio]", "Lightning audio decoded");
    });

    this.decodeAudioFile("assets/sfx/shield-hit.mp3").then((buf) => {
      this.shieldBuffer = buf;
      console.log("[loadAudio]", "Shield audio decoded");
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
    this.playSfx(this.bulletBuffer, this.UNIFORM_SFX_VOLUME);
  }
  
  private playLaserSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.laserBuffer, this.UNIFORM_SFX_VOLUME * 0.35);
  }

  private playGemSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.gemBuffer, this.UNIFORM_SFX_VOLUME);
  }

  private playRoomSelectBeep(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.045;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN * 0.55, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playRoomNegativeBeep(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.06;
    const playTone = (start: number, fromHz: number, toHz: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(fromHz, start);
      osc.frequency.exponentialRampToValueAtTime(toHz, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN * 0.5, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(now, 320, 260);
    playTone(now + 0.085, 300, 240);
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
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN, now + 0.01);
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
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private startDeathFreeze(killerX: number, killerY: number): void {
    if (this.deathFreezeFrames > 0) return;
    this.deathFreezeFrames = this.DEATH_FREEZE_DURATION_FRAMES;
    this.deathFreezeKiller = { x: killerX, y: killerY };
    this.playDeathSound();
    this.triggerHaptic("error");
  }

  private triggerPlayerDeath(killerX: number, killerY: number): void {
    this.startDeathFreeze(killerX, killerY);
  }

  private getDeathFreezeZoom(): number {
    if (this.deathFreezeFrames <= 0) return 1;
    const elapsed = this.DEATH_FREEZE_DURATION_FRAMES - this.deathFreezeFrames;
    const t = Math.max(0, Math.min(1, elapsed / this.DEATH_FREEZE_DURATION_FRAMES));
    const easeOut = 1 - Math.pow(1 - t, 3);
    return 1 + easeOut * 0.18;
  }

  private applyPlayerDamage(killerX: number, killerY: number): void {
    if (this.powerUpManager.hasPowerUp("SHIELD")) return;
    if (this.playerController.isInvulnerable()) return;
    const player = this.playerController.getPlayer();
    this.worldDoorwaySystem.preloadForDepth(player.y);
    this.playerController.takeDamage();
    player.invulnerable = Math.max(player.invulnerable, this.CONTACT_HIT_INVULN_FRAMES);
    this.spawnDamageText(player.x, player.y - player.height * 0.6, "-1");
    this.playHurtSound();
    if (this.playerController.isDead()) {
      this.triggerPlayerDeath(killerX, killerY);
    }
  }

  private playEnemyCrunchSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.enemyCrunchBuffer, this.UNIFORM_SFX_VOLUME);
  }

  private playBlockBreakSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.07;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playBlastSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.blastBuffer, this.UNIFORM_SFX_VOLUME * 0.35);
  }

  private playLightningSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.lightningBuffer, this.UNIFORM_SFX_VOLUME * 0.35);
  }

  private playShieldSound(): void {
    if (!this.settings.fx) return;
    this.playSfx(this.shieldBuffer, this.UNIFORM_SFX_VOLUME);
  }

  private playMagnetPullSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.045;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playPufferBoingSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.11;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    osc.frequency.exponentialRampToValueAtTime(250, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN * 1.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  private playTreasureRingSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const noteLength = 0.11;
    const gap = 0.045;
    const notes = [880, 1175, 1568];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * (noteLength + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(notes[i], start);
      osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.04, start + noteLength);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(this.UNIFORM_SYNTH_PEAK_GAIN * 0.75, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteLength);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + noteLength);
    }
  }

  private playShopPurchaseSound(): void {
    if (!this.settings.fx) return;
    const ctx = this.getAudioCtx();
    const now = ctx.currentTime;
    const playTone = (start: number, fromHz: number, toHz: number, dur: number, gainPeak: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(fromHz, start);
      osc.frequency.exponentialRampToValueAtTime(toHz, start + dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(gainPeak, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };

    playTone(now, 780, 980, 0.08, this.UNIFORM_SYNTH_PEAK_GAIN * 0.78);
    playTone(now + 0.075, 1200, 1620, 0.09, this.UNIFORM_SYNTH_PEAK_GAIN * 0.9);
  }
  
  private startAmbience(): void {
    if (!this.settings.music || !this.ambienceAudio) return;
    
    // Ensure AudioContext is active (needed on mobile after user gesture)
    this.getAudioCtx();
    
    if (this.loadingMusicAudio) {
      this.loadingMusicAudio.pause();
      this.loadingMusicAudio.currentTime = 0;
    }
    if (this.gameOverMusicAudio) {
      this.gameOverMusicAudio.pause();
      this.gameOverMusicAudio.currentTime = 0;
    }
    if (this.shopMusicAudio) {
      this.shopMusicAudio.pause();
      this.shopMusicAudio.currentTime = 0;
    }
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

  private startShopMusic(): void {
    if (!this.settings.music || !this.shopMusicAudio) return;
    if (this.loadingMusicAudio) {
      this.loadingMusicAudio.pause();
      this.loadingMusicAudio.currentTime = 0;
    }
    if (this.gameOverMusicAudio) {
      this.gameOverMusicAudio.pause();
      this.gameOverMusicAudio.currentTime = 0;
    }
    if (this.ambienceAudio) {
      this.ambienceAudio.pause();
      this.ambienceAudio.currentTime = 0;
    }
    this.shopMusicAudio.currentTime = 0;
    this.shopMusicAudio.play().catch(() => {
      console.log("[Game] Shop music autoplay blocked, will retry on interaction");
    });
  }

  private stopShopMusic(): void {
    if (!this.shopMusicAudio) return;
    this.shopMusicAudio.pause();
    this.shopMusicAudio.currentTime = 0;
  }

  private startLoadingMusic(): void {
    if (!this.settings.music || !this.loadingMusicAudio) return;
    if (this.ambienceAudio) {
      this.ambienceAudio.pause();
      this.ambienceAudio.currentTime = 0;
    }
    if (this.shopMusicAudio) {
      this.shopMusicAudio.pause();
      this.shopMusicAudio.currentTime = 0;
    }
    if (this.gameOverMusicAudio) {
      this.gameOverMusicAudio.pause();
      this.gameOverMusicAudio.currentTime = 0;
    }
    this.loadingMusicAudio.currentTime = 0;
    this.loadingMusicAudio.play().catch(() => {
      console.log("[Game] Loading music autoplay blocked, will retry on interaction");
    });
  }

  private tryStartLoadingMusicFromInteraction(): void {
    if (this.gameState !== "start" || !this.settings.music || !this.loadingMusicAudio) return;
    if (!this.loadingMusicAudio.paused) return;
    this.getAudioCtx();
    this.loadingMusicAudio.play().catch(() => {});
  }

  private stopLoadingMusic(): void {
    if (!this.loadingMusicAudio) return;
    this.loadingMusicAudio.pause();
    this.loadingMusicAudio.currentTime = 0;
  }

  private startGameOverMusic(): void {
    if (!this.settings.music || !this.gameOverMusicAudio) return;
    if (this.ambienceAudio) {
      this.ambienceAudio.pause();
      this.ambienceAudio.currentTime = 0;
    }
    if (this.shopMusicAudio) {
      this.shopMusicAudio.pause();
      this.shopMusicAudio.currentTime = 0;
    }
    if (this.loadingMusicAudio) {
      this.loadingMusicAudio.pause();
      this.loadingMusicAudio.currentTime = 0;
    }
    this.gameOverMusicAudio.currentTime = 0;
    this.gameOverMusicAudio.play().catch(() => {
      console.log("[Game] Game-over music autoplay blocked, will retry on interaction");
    });
  }

  private tryStartGameOverMusicFromInteraction(): void {
    if (this.gameState !== "gameOver" || !this.settings.music || !this.gameOverMusicAudio) return;
    if (!this.gameOverMusicAudio.paused) return;
    this.getAudioCtx();
    this.gameOverMusicAudio.play().catch(() => {});
  }

  private stopGameOverMusic(): void {
    if (!this.gameOverMusicAudio) return;
    this.gameOverMusicAudio.pause();
    this.gameOverMusicAudio.currentTime = 0;
  }
  
  private initMenuEntities(): void {
    this.menuEnemies = [];
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
    document.getElementById("powerup-bar")?.classList.add("hidden");
    this.stopAmbience();
    this.stopShopMusic();
    this.stopGameOverMusic();
    this.startLoadingMusic();
    
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
      
      const cw = canvas.width || 48;
      const ch = canvas.height || 48;
      ctx.clearRect(0, 0, cw, ch);

      // Preserve aspect ratio and keep a small margin in title icons.
      const fitScale = Math.min(cw / spriteW, ch / spriteH) * 0.9;
      const drawW = Math.round(spriteW * fitScale);
      const drawH = Math.round(spriteH * fitScale);
      const dx = Math.floor((cw - drawW) / 2);
      const dy = Math.floor((ch - drawH) / 2);
      
      if (flipX) {
        ctx.save();
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(
        this.weedsImg!,
        col * spriteW, row * spriteH, spriteW, spriteH,
        dx, dy, drawW, drawH
      );
      
      if (flipX) {
        ctx.restore();
      }
    };
    
    // Different weed sprites for each position
    drawWeedToCanvas("weed-canvas-left", 1, false);   // Red coral
    drawWeedToCanvas("weed-canvas-right", 1, true);   // Red coral flipped
    drawWeedToCanvas("weed-canvas-top", 0, false);    // Coral variant
  }
  
  private addScreenShake(intensity: number): void {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
  }
  
  private onPlayerShoot(): void {
    // Query powerup manager for special shot effects
    this.lastShotEffects = this.powerUpManager.onPlayerShoot();

    // Show ammo depletion feedback when the last bullet is spent.
    const player = this.playerController.getPlayer();
    if (player.ammo <= 0) {
      this.spawnDamageText(player.x, player.y - player.height * 0.8, "Empty!");
    }

    // Laser shots replace normal bubble bullets entirely.
    if (this.lastShotEffects.triggerLaser) {
      const bullets = this.playerController.getBullets();
      if (bullets.length > 0) {
        this.playerController.removeBullet(bullets.length - 1);
      }
      this.powerUpManager.spawnLaserBeam(
        player.x,
        player.y,
        this.cameraY + CONFIG.INTERNAL_HEIGHT + 100
      );
      
      // Play laser sound
      this.playLaserSound();
      return;
    }

    // Tag the bullet that was just created with powerup flags
    this.playerController.tagLastBullet(
      this.lastShotEffects.triggerBlast && this.powerUpManager.hasPowerUp("BLAST"),
      this.lastShotEffects.triggerLightning && this.powerUpManager.hasPowerUp("LIGHTNING")
    );
    
    // Play bullet sound
    this.playBulletSound();
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

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private sanitizeHitboxTuning(raw: Partial<HitboxTuning>): HitboxTuning {
    return {
      playerBaseWidth: this.clamp(raw.playerBaseWidth ?? DEFAULT_HITBOX_TUNING.playerBaseWidth, 8, 120),
      playerBaseHeight: this.clamp(raw.playerBaseHeight ?? DEFAULT_HITBOX_TUNING.playerBaseHeight, 8, 120),
      playerHorizontalWidth: this.clamp(raw.playerHorizontalWidth ?? DEFAULT_HITBOX_TUNING.playerHorizontalWidth, 8, 120),
      playerHorizontalHeight: this.clamp(raw.playerHorizontalHeight ?? DEFAULT_HITBOX_TUNING.playerHorizontalHeight, 8, 120),
      weedPadXRatio: this.clamp(raw.weedPadXRatio ?? DEFAULT_HITBOX_TUNING.weedPadXRatio, 0, 0.45),
      weedPadTopRatio: this.clamp(raw.weedPadTopRatio ?? DEFAULT_HITBOX_TUNING.weedPadTopRatio, 0, 0.45),
      weedTrimBottomRatio: this.clamp(raw.weedTrimBottomRatio ?? DEFAULT_HITBOX_TUNING.weedTrimBottomRatio, 0, 0.45),
      pufferRadiusScale: this.clamp(raw.pufferRadiusScale ?? DEFAULT_HITBOX_TUNING.pufferRadiusScale, 0.4, 2.2),
      crabScaleX: this.clamp(raw.crabScaleX ?? DEFAULT_HITBOX_TUNING.crabScaleX, 0.4, 2.2),
      crabScaleY: this.clamp(raw.crabScaleY ?? DEFAULT_HITBOX_TUNING.crabScaleY, 0.4, 2.2),
      sharkScaleX: this.clamp(raw.sharkScaleX ?? DEFAULT_HITBOX_TUNING.sharkScaleX, 0.4, 2.2),
      sharkScaleY: this.clamp(raw.sharkScaleY ?? DEFAULT_HITBOX_TUNING.sharkScaleY, 0.4, 2.2),
      squidScaleX: this.clamp(raw.squidScaleX ?? DEFAULT_HITBOX_TUNING.squidScaleX, 0.4, 2.2),
      squidScaleY: this.clamp(raw.squidScaleY ?? DEFAULT_HITBOX_TUNING.squidScaleY, 0.4, 2.2),
      playerSpriteOffsetX: this.clamp(raw.playerSpriteOffsetX ?? DEFAULT_HITBOX_TUNING.playerSpriteOffsetX, -80, 80),
      playerSpriteOffsetY: this.clamp(raw.playerSpriteOffsetY ?? DEFAULT_HITBOX_TUNING.playerSpriteOffsetY, -80, 80),
    };
  }

  private loadHitboxTuning(): void {
    const saved = localStorage.getItem(this.HITBOX_TUNING_STORAGE_KEY);
    if (!saved) {
      this.hitboxTuning = { ...DEFAULT_HITBOX_TUNING };
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Partial<HitboxTuning>;
      this.hitboxTuning = this.sanitizeHitboxTuning(parsed);
    } catch {
      this.hitboxTuning = { ...DEFAULT_HITBOX_TUNING };
    }
  }

  private loadHitboxLabColliders(): void {
    const saved = localStorage.getItem(this.HITBOX_LAB_STORAGE_KEY);
    if (!saved) {
      this.hitboxLabColliders = {};
      this.hitboxLabLoadedCount = 0;
      console.log(`[HitboxLab] No saved collider data found in key '${this.HITBOX_LAB_STORAGE_KEY}'`);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Record<string, Partial<LabCollider>>;
      const next: Record<string, LabCollider> = {};
      for (const [frameId, raw] of Object.entries(parsed)) {
        if (!raw || typeof raw !== "object") continue;
        if (raw.type === "rect") {
          const x = Number(raw.x);
          const y = Number(raw.y);
          const width = Number(raw.width);
          const height = Number(raw.height);
          if ([x, y, width, height].some((n) => !Number.isFinite(n))) continue;
          next[frameId] = {
            type: "rect",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.max(1, Math.round(width)),
            height: Math.max(1, Math.round(height)),
          };
          continue;
        }
        if (raw.type === "circle") {
          const cx = Number(raw.cx);
          const cy = Number(raw.cy);
          const radius = Number(raw.radius);
          if ([cx, cy, radius].some((n) => !Number.isFinite(n))) continue;
          next[frameId] = {
            type: "circle",
            cx: Math.round(cx),
            cy: Math.round(cy),
            radius: Math.max(1, Math.round(radius)),
          };
        }
      }
      this.hitboxLabColliders = next;
      this.hitboxLabLoadedCount = Object.keys(next).length;
      console.log(`[HitboxLab] Loaded ${this.hitboxLabLoadedCount} frame colliders`);
    } catch {
      this.hitboxLabColliders = {};
      this.hitboxLabLoadedCount = 0;
      console.warn(`[HitboxLab] Failed to parse '${this.HITBOX_LAB_STORAGE_KEY}'`);
    }
  }

  private async loadHitboxLabCollidersFromFile(): Promise<void> {
    try {
      const res = await fetch("./collisions.json");
      if (!res.ok) return;
      const parsed = await res.json() as Record<string, Partial<LabCollider>>;
      const next: Record<string, LabCollider> = {};
      for (const [frameId, raw] of Object.entries(parsed)) {
        if (!raw || typeof raw !== "object") continue;
        if (raw.type === "rect") {
          const x = Number(raw.x), y = Number(raw.y), width = Number(raw.width), height = Number(raw.height);
          if ([x, y, width, height].some((n) => !Number.isFinite(n))) continue;
          next[frameId] = { type: "rect", x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
        } else if (raw.type === "circle") {
          const cx = Number(raw.cx), cy = Number(raw.cy), radius = Number(raw.radius);
          if ([cx, cy, radius].some((n) => !Number.isFinite(n))) continue;
          next[frameId] = { type: "circle", cx: Math.round(cx), cy: Math.round(cy), radius: Math.max(1, Math.round(radius)) };
        }
      }
      this.hitboxLabColliders = next;
      this.hitboxLabLoadedCount = Object.keys(next).length;
      console.log(`[HitboxLab] Loaded ${this.hitboxLabLoadedCount} frame colliders from collisions.json`);
    } catch {
      // collisions.json not found — localStorage version stays active
    }
  }

  private saveHitboxTuning(): void {
    localStorage.setItem(this.HITBOX_TUNING_STORAGE_KEY, JSON.stringify(this.hitboxTuning));
  }

  private applyHitboxTuning(): void {
    this.playerController.setHitboxSizes(
      this.hitboxTuning.playerBaseWidth,
      this.hitboxTuning.playerBaseHeight,
      this.hitboxTuning.playerHorizontalWidth,
      this.hitboxTuning.playerHorizontalHeight
    );
  }

  private setupHitboxTunerPanel(): void {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.right = "10px";
    panel.style.top = "10px";
    panel.style.zIndex = "9999";
    panel.style.width = "300px";
    panel.style.maxHeight = "70vh";
    panel.style.overflow = "auto";
    panel.style.padding = "10px";
    panel.style.background = "rgba(0,0,0,0.82)";
    panel.style.border = "1px solid rgba(180,235,255,0.8)";
    panel.style.color = "#dff8ff";
    panel.style.font = "12px monospace";
    panel.style.display = "none";
    panel.style.pointerEvents = "auto";
    panel.innerHTML = "<div style='font-weight:bold;margin-bottom:8px'>Hitbox Tuner (O toggle)</div>";

    const addSlider = (label: string, key: keyof HitboxTuning, min: number, max: number, step: number) => {
      const row = document.createElement("div");
      row.style.marginBottom = "8px";

      const top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("span");
      value.textContent = String(this.hitboxTuning[key]);
      top.appendChild(name);
      top.appendChild(value);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(this.hitboxTuning[key]);
      input.style.width = "100%";
      input.dataset.hitboxKey = key;
      input.addEventListener("input", () => {
        const next = Number(input.value);
        (this.hitboxTuning as Record<string, number>)[key] = next;
        value.textContent = step < 1 ? next.toFixed(2) : String(Math.round(next));
        this.applyHitboxTuning();
      });

      row.appendChild(top);
      row.appendChild(input);
      panel.appendChild(row);
    };

    addSlider("Player Base W", "playerBaseWidth", 12, 80, 1);
    addSlider("Player Base H", "playerBaseHeight", 12, 90, 1);
    addSlider("Player Horiz W", "playerHorizontalWidth", 12, 96, 1);
    addSlider("Player Horiz H", "playerHorizontalHeight", 12, 90, 1);
    addSlider("Weed Pad X", "weedPadXRatio", 0, 0.45, 0.01);
    addSlider("Weed Pad Top", "weedPadTopRatio", 0, 0.45, 0.01);
    addSlider("Weed Trim Bot", "weedTrimBottomRatio", 0, 0.45, 0.01);
    addSlider("Puffer Radius", "pufferRadiusScale", 0.4, 2.2, 0.01);
    addSlider("Crab X", "crabScaleX", 0.4, 2.2, 0.01);
    addSlider("Crab Y", "crabScaleY", 0.4, 2.2, 0.01);
    addSlider("Shark X", "sharkScaleX", 0.4, 2.2, 0.01);
    addSlider("Shark Y", "sharkScaleY", 0.4, 2.2, 0.01);
    addSlider("Squid X", "squidScaleX", 0.4, 2.2, 0.01);
    addSlider("Squid Y", "squidScaleY", 0.4, 2.2, 0.01);
    addSlider("Player Sprite X", "playerSpriteOffsetX", -60, 60, 1);
    addSlider("Player Sprite Y", "playerSpriteOffsetY", -60, 60, 1);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";
    actions.style.marginTop = "8px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => {
      this.hitboxTuning = this.sanitizeHitboxTuning(this.hitboxTuning);
      this.applyHitboxTuning();
      this.saveHitboxTuning();
      this.syncHitboxTunerPanelInputs();
    };

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => {
      this.hitboxTuning = { ...DEFAULT_HITBOX_TUNING };
      this.applyHitboxTuning();
      this.syncHitboxTunerPanelInputs();
      this.saveHitboxTuning();
    };

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy JSON";
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(JSON.stringify(this.hitboxTuning, null, 2));
    };

    actions.appendChild(saveBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(copyBtn);
    panel.appendChild(actions);

    document.body.appendChild(panel);
    this.hitboxPanelEl = panel;
  }

  private syncHitboxTunerPanelInputs(): void {
    if (!this.hitboxPanelEl) return;
    const sliders = this.hitboxPanelEl.querySelectorAll<HTMLInputElement>("input[data-hitbox-key]");
    sliders.forEach((input) => {
      const key = input.dataset.hitboxKey as keyof HitboxTuning | undefined;
      if (!key) return;
      input.value = String(this.hitboxTuning[key]);
      const valueEl = input.parentElement?.querySelector("div span:last-child");
      if (valueEl) {
        const step = Number(input.step);
        const value = Number(this.hitboxTuning[key]);
        valueEl.textContent = step < 1 ? value.toFixed(2) : String(Math.round(value));
      }
    });
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
      } else if (this.settings.music && this.gameState === "shop") {
        this.startShopMusic();
      } else if (this.settings.music && this.gameState === "start") {
        this.startLoadingMusic();
      } else if (this.settings.music && this.gameState === "gameOver") {
        this.startGameOverMusic();
      } else {
        this.stopAmbience();
        this.stopShopMusic();
        this.stopLoadingMusic();
        this.stopGameOverMusic();
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
    this.enemyKillCount = 0;
    this.gemCollectCount = 0;
    this.breakableDestroyCount = 0;
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
    this.releaseAllDroppedGems();
    this.brokenWeeds.clear();
    this.stompedWeeds.clear();
    this.damageTexts = [];
    this.deathFreezeFrames = 0;
    this.deathFreezeKiller = null;
    this.roomActionWasPressed = false;
    this.roomNoFundsTimer = 0;
    this.roomTransitionLockFrames = 0;
    this.roomEntryContext = null;
    this.currentRoomEntranceSide = "left";
    this.currentRoomType = null;
    this.pendingRoomPowerupReward = null;
    this.selectedRoomItemId = null;
    this.roomItems = [];
    this.roomPowerupPickup = null;
    this.shopTestBreakableDestroyed = false;
    this.shopTestBreakableRespawnFrames = 0;
    this.runUpgrades = {
      stompReloadOneAmmo: false,
      deepTankPlusTwoAmmo: false,
      vampiricGel: false,
      salvageBreakablesDropGems: false,
      rapidChamber: false,
    };
    this.playerController.setShootCooldownFrames(CONFIG.SHOOT_COOLDOWN);
    this.activeWorldDoorways = [];
    this.worldDoorwaySystem.reset();
    this.clearPlatformChunkCache();
    this.resetHudStateCache();
    
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
    this.cacheHudRefs();
    this.hudRefs.hpBubbles.forEach((bubble) => {
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
    document.getElementById("powerup-bar")?.classList.add("hidden");

    if (this.SHOP_TEST_MODE) {
      console.log("[startGame]", "Shop test mode enabled");
      this.gems = 999;
      const player = this.playerController.getPlayer();
      player.hp = Math.max(1, player.maxHp - 1);
      this.previousHp = player.hp;
      this.roomEntryContext = {
        returnX: player.x,
        returnY: player.y,
        returnVx: 0,
        returnVy: 0,
      };
      this.stopLoadingMusic();
      this.stopGameOverMusic();
      this.stopAmbience();
      this.stopShopMusic();
      this.enterSpecialRoom("shop", "left");
      this.powerUpManager.grantPowerUp("BLAST");
      this.triggerPowerUpAnnouncement("BLAST");
      this.updateHUD();
      return;
    }
    
    // Start ambience music
    this.stopLoadingMusic();
    this.stopGameOverMusic();
    this.stopShopMusic();
    this.startAmbience();
    
    this.updateHUD();
  }
  
  private gameOver(): void {
    console.log("[Game] Game over. Final score:", this.score, "Depth:", this.maxDepth);
    
    this.gameState = "gameOver";
    
    // Stop ambience music
    this.stopLoadingMusic();
    this.stopAmbience();
    this.stopShopMusic();
    this.startGameOverMusic();
    
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
    document.getElementById("powerup-bar")?.classList.add("hidden");
    
    this.triggerHaptic("error");
  }
  
  private update(): void {
    this.frameCount++;
    if (this.roomTransitionLockFrames > 0) {
      this.roomTransitionLockFrames--;
    }
    if (this.roomNoFundsTimer > 0) {
      this.roomNoFundsTimer--;
    }

    if (this.gameState === "playing") {
      this.updatePlayingState();
    } else if (this.gameState === "shop") {
      this.updateSpecialRoomState();
    }
    this.updateScreenShake();
  }

  private updatePlayingState(): void {
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
      this.triggerPlayerDeath(p.x, this.cameraY + CONFIG.INTERNAL_HEIGHT + 70);
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

    // 4.5 World doorway entry
    if (this.roomTransitionLockFrames <= 0) {
      const playerRect = this.playerController.getRect();
      const doorway = this.worldDoorwaySystem.tryEnter(playerRect, player.vx);
      if (doorway) {
        this.roomEntryContext = {
          returnX: doorway.returnSpawn.x,
          returnY: doorway.returnSpawn.y - player.height / 2,
          returnVx: doorway.returnSpawn.vx,
          returnVy: doorway.returnSpawn.vy,
        };
        this.enterSpecialRoom(doorway.roomType, doorway.side);
        return;
      }
    }
    
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
    this.cleanupChunkPlatformCache(this.cameraY);
    
    // Update HUD
    this.updateHUD();
    
    // Check fail states
    if (this.playerController.isDead() && this.deathFreezeFrames <= 0) {
      const p = this.playerController.getPlayer();
      this.triggerPlayerDeath(p.x, p.y);
      return;
    }
  }

  private updateSpecialRoomState(): void {
    const player = this.playerController.getPlayer();
    const entrance = this.getSpecialRoomEntranceRect(this.currentRoomEntranceSide);
    this.activePlatforms = this.getSpecialRoomCollisionPlatforms();
    this.activeWallPlatforms = this.activePlatforms.filter((p) => p.isWall);
    this.rebuildPlatformBuckets();
    if (this.currentRoomType !== "powerup") {
      this.updateRoomItemSelection();
    } else {
      this.selectedRoomItemId = null;
    }
    const popupActive = this.selectedRoomItemId !== null;
    const actionPressed = this.input.jump || this.input.shoot;
    const actionJustPressed = actionPressed && !this.roomActionWasPressed;
    this.roomActionWasPressed = actionPressed;
    if (popupActive && actionJustPressed) {
      this.tryActivateSelectedRoomItem();
    }

    const playerHalfW = player.width / 2;
    const playerHalfH = player.height / 2;
    const wallThickness = CONFIG.WALL_BLOCK_SIZE;
    const floorTop = this.SHOP_ROOM_BOTTOM - wallThickness;
    const ceilingBottom = this.SHOP_ROOM_TOP + wallThickness;
    const leftInner = this.SHOP_ROOM_LEFT + wallThickness;
    const rightInner = this.SHOP_ROOM_RIGHT - wallThickness;

    const shopInput: InputState = {
      left: this.input.left,
      right: this.input.right,
      jump: popupActive ? false : this.input.jump,
      shoot: popupActive ? false : this.input.shoot,
    };
    this.playerController.handleInput(shopInput);
    this.playerController.updateMovement(shopInput);
    this.playerController.setGrounded(false);

    const inEntranceBand = player.y + playerHalfH >= entrance.y &&
      player.y - playerHalfH <= entrance.y + entrance.height;
    const onTunnelSide = this.currentRoomEntranceSide === "left"
      ? player.x <= this.SHOP_ROOM_LEFT + playerHalfW + 2
      : player.x >= this.SHOP_ROOM_RIGHT - playerHalfW - 2;
    const tunnelFloorTop = entrance.y + entrance.height - 6 - CONFIG.WALL_BLOCK_SIZE;
    const activeFloorTop = inEntranceBand && onTunnelSide ? tunnelFloorTop : floorTop;

    if (player.vy >= 0 && player.y + playerHalfH >= activeFloorTop) {
      this.playerController.land(activeFloorTop);
    }
    if (player.vy < 0 && player.y - playerHalfH <= ceilingBottom) {
      player.y = ceilingBottom + playerHalfH;
      player.vy = 0;
    }
    let minX = leftInner + playerHalfW;
    let maxX = rightInner - playerHalfW;
    if (this.currentRoomEntranceSide === "left" && inEntranceBand && this.roomTransitionLockFrames <= 0) {
      minX = this.SHOP_ROOM_LEFT - playerHalfW - 24;
    }
    if (this.currentRoomEntranceSide === "right" && inEntranceBand && this.roomTransitionLockFrames <= 0) {
      maxX = this.SHOP_ROOM_RIGHT + playerHalfW + 24;
    }
    player.x = Math.max(minX, Math.min(maxX, player.x));

    if (this.currentRoomEntranceSide === "left" &&
      inEntranceBand &&
      player.x < this.SHOP_ROOM_LEFT - playerHalfW - 8 &&
      this.roomTransitionLockFrames <= 0) {
      this.exitSpecialRoom();
      return;
    }
    if (this.currentRoomEntranceSide === "right" &&
      inEntranceBand &&
      player.x > this.SHOP_ROOM_RIGHT + playerHalfW + 8 &&
      this.roomTransitionLockFrames <= 0) {
      this.exitSpecialRoom();
      return;
    }

    if (this.currentRoomType === "powerup" && this.roomPowerupPickup && !this.roomPowerupPickup.collected) {
      const playerRect = this.playerController.getRect();
      const pickupRect = {
        x: this.roomPowerupPickup.x - this.roomPowerupPickup.width / 2,
        y: this.roomPowerupPickup.y - this.roomPowerupPickup.height / 2,
        width: this.roomPowerupPickup.width,
        height: this.roomPowerupPickup.height,
      };
      if (this.isRectOverlapping(playerRect, pickupRect)) {
        this.roomPowerupPickup.collected = true;
        this.powerUpManager.grantPowerUp(this.roomPowerupPickup.type);
        this.triggerPowerUpAnnouncement(this.roomPowerupPickup.type);
        this.triggerHaptic("success");
      }
    }

    this.updateShopTestBreakableRespawn();

    this.updateDroppedGems();
    const playerRect = this.playerController.getRect();
    for (let i = this.droppedGems.length - 1; i >= 0; i--) {
      const gem = this.droppedGems[i];
      if (gem.collected) continue;
      if ((gem.collectDelay ?? 0) > 0) continue;

      if (this.checkGemPickup(playerRect, gem)) {
        gem.collected = true;
        const comboMultiplier = this.playerController.getComboMultiplier();
        if (this.isHeartPickup(gem)) {
          this.collectHeartPickup(gem);
        } else {
          const points = gem.value * comboMultiplier;
          this.score += points;
          this.scoreGems += points;
          this.gems++;
          this.gemCollectCount++;
          this.playGemSound();
        }
        this.releaseDroppedGem(i);
      }
    }

    this.updateBullets();
    this.powerUpManager.updateVisualsOnly();
    if (this.currentRoomType !== "powerup") {
      this.updateRoomItemSelection();
    }
    this.updateHUD();
  }

  private getSpecialRoomCollisionPlatforms(): Platform[] {
    const left = this.SHOP_ROOM_LEFT;
    const right = this.SHOP_ROOM_RIGHT;
    const top = this.SHOP_ROOM_TOP;
    const bottom = this.SHOP_ROOM_BOTTOM;
    const entrance = this.getSpecialRoomEntranceRect(this.currentRoomEntranceSide);
    const wallThickness = CONFIG.WALL_BLOCK_SIZE;

    const segments: Platform[] = [];
    const add = (x: number, y: number, width: number, height: number, oneWay: boolean = false): void => {
      if (width <= 0 || height <= 0) return;
      segments.push({
        x,
        y,
        width,
        height,
        isWall: !oneWay,
        breakable: false,
        oneWay: oneWay ? true : undefined,
        hp: 0,
        chunkIndex: -1,
      });
    };

    add(left, top, right - left, wallThickness);
    add(left, bottom - wallThickness, right - left, wallThickness);

    const fullVerticalHeight = bottom - top;
    if (this.currentRoomEntranceSide === "left") {
      add(left, top, wallThickness, entrance.y - top);
      add(left, entrance.y + entrance.height, wallThickness, bottom - (entrance.y + entrance.height));
      add(right - wallThickness, top, wallThickness, fullVerticalHeight);
    } else {
      add(left, top, wallThickness, fullVerticalHeight);
      add(right - wallThickness, top, wallThickness, entrance.y - top);
      add(right - wallThickness, entrance.y + entrance.height, wallThickness, bottom - (entrance.y + entrance.height));
    }

    const corridorX = this.currentRoomEntranceSide === "left"
      ? Math.max(0, left - this.ROOM_CORRIDOR_DEPTH)
      : right;
    const corridorY = entrance.y;
    const corridorW = this.ROOM_CORRIDOR_DEPTH;
    const corridorH = entrance.height;
    const floorTop = bottom - wallThickness;
    add(corridorX, corridorY - 6, corridorW, 6, true);
    add(corridorX, corridorY + corridorH - 6 - CONFIG.WALL_BLOCK_SIZE, corridorW, 6, true);

    if (this.isShopTestRoomActive()) {
      const lowerPlatform = this.getShopTestLowerPlatformRect();
      add(lowerPlatform.x, lowerPlatform.y, lowerPlatform.width, lowerPlatform.height);
      if (!this.shopTestBreakableDestroyed) {
        const breakable = this.getShopTestBreakableRect();
        segments.push({
          x: breakable.x,
          y: breakable.y,
          width: breakable.width,
          height: breakable.height,
          isWall: true,
          breakable: true,
          hp: 1,
          chunkIndex: -1,
        });
      }
    }

    return segments;
  }

  private getOppositePassageSide(side: ShopSide): ShopSide {
    return side === "left" ? "right" : "left";
  }

  private pickRandomPowerupType(): PowerUpType {
    const types = Object.keys(POWERUP_INFO) as PowerUpType[];
    return types[Math.floor(Math.random() * types.length)];
  }

  private isRectOverlapping(rectA: { x: number; y: number; width: number; height: number }, rectB: { x: number; y: number; width: number; height: number }): boolean {
    return rectA.x < rectB.x + rectB.width &&
      rectA.x + rectA.width > rectB.x &&
      rectA.y < rectB.y + rectB.height &&
      rectA.y + rectA.height > rectB.y;
  }

  private buildShopItemPool(itemWidth: number, itemHeight: number, itemY: number): RoomItem[] {
    return [
      {
        id: "hp_up",
        name: "+1 MAX HP",
        description: "Increase maximum HP by 1 and heal 1 HP",
        cost: this.SHOP_HP_UP_COST,
        soldOut: false,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "ammo_up",
        name: "+1 MAX AMMO",
        description: "Increase max ammo by 1 and reload 1 ammo",
        cost: this.SHOP_AMMO_UP_COST,
        soldOut: false,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "stomp_reload",
        name: "STOMP RELOAD",
        description: "Jumping on enemy heads reloads 1 ammo",
        cost: this.SHOP_STOMP_RELOAD_COST,
        soldOut: this.runUpgrades.stompReloadOneAmmo,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "deep_tank",
        name: "DEEP TANK",
        description: "Increase max ammo by 2 and reload 2 ammo",
        cost: this.SHOP_DEEP_TANK_COST,
        soldOut: this.runUpgrades.deepTankPlusTwoAmmo,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "vampiric_gel",
        name: "LIFESTEAL CHANCE",
        description: "5% chance to spawn a heart on enemy kill",
        cost: this.SHOP_VAMPIRIC_GEL_COST,
        soldOut: this.runUpgrades.vampiricGel,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "salvage_bonus",
        name: "SALVAGE BONUS",
        description: "Breakable blocks can spawn bonus gems",
        cost: this.SHOP_SALVAGE_BONUS_COST,
        soldOut: this.runUpgrades.salvageBreakablesDropGems,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
      {
        id: "rapid_chamber",
        name: "RAPID CHAMBER",
        description: "Fire rate increased while airborne",
        cost: this.SHOP_RAPID_CHAMBER_COST,
        soldOut: this.runUpgrades.rapidChamber,
        rect: { x: 0, y: itemY, width: itemWidth, height: itemHeight },
      },
    ];
  }

  private createShopRoomItems(): RoomItem[] {
    const itemWidth = 40;
    const itemHeight = 40;
    const itemGap = 12;
    const floorTop = this.SHOP_ROOM_BOTTOM - CONFIG.WALL_BLOCK_SIZE;
    const itemY = floorTop - itemHeight - 8;
    const roomMidX = (this.SHOP_ROOM_LEFT + this.SHOP_ROOM_RIGHT) * 0.5;
    const shownCount = 3;
    const rowWidth = shownCount * itemWidth + (shownCount - 1) * itemGap;
    const rowStartX = roomMidX - rowWidth * 0.5;
    const pool = this.buildShopItemPool(itemWidth, itemHeight, itemY);
    const available = pool.filter((item) => !item.soldOut);
    const candidates = (available.length >= shownCount ? available : pool).slice();

    // Fisher-Yates shuffle for unbiased random kiosk selection.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    return candidates.slice(0, shownCount).map((item, idx) => ({
      ...item,
      rect: {
        x: rowStartX + idx * (itemWidth + itemGap),
        y: itemY,
        width: itemWidth,
        height: itemHeight,
      },
    }));
  }

  private createShopTestRoomItems(): RoomItem[] {
    const itemWidth = 40;
    const itemHeight = 40;
    const itemGap = 12;
    const floorTop = this.SHOP_ROOM_BOTTOM - CONFIG.WALL_BLOCK_SIZE;
    const bottomRowY = floorTop - itemHeight - 8;
    const topRowY = bottomRowY - itemHeight - 12;
    const roomMidX = (this.SHOP_ROOM_LEFT + this.SHOP_ROOM_RIGHT) * 0.5;
    const topRowCount = 4;
    const bottomRowCount = 3;
    const topRowWidth = topRowCount * itemWidth + (topRowCount - 1) * itemGap;
    const bottomRowWidth = bottomRowCount * itemWidth + (bottomRowCount - 1) * itemGap;
    const topRowStartX = roomMidX - topRowWidth * 0.5;
    const bottomRowStartX = roomMidX - bottomRowWidth * 0.5;
    const pool = this.buildShopItemPool(itemWidth, itemHeight, topRowY);
    const topRow = pool.slice(0, 4).map((item, idx) => ({
      ...item,
      rect: { x: topRowStartX + idx * (itemWidth + itemGap), y: topRowY, width: itemWidth, height: itemHeight },
    }));
    const bottomRow = pool.slice(4).map((item, idx) => ({
      ...item,
      rect: { x: bottomRowStartX + idx * (itemWidth + itemGap), y: bottomRowY, width: itemWidth, height: itemHeight },
    }));
    return topRow.concat(bottomRow);
  }

  private isShopTestRoomActive(): boolean {
    return this.SHOP_TEST_MODE && this.currentRoomType === "shop";
  }

  private getShopTestLowerPlatformRect(): { x: number; y: number; width: number; height: number } {
    const width = 184;
    const height = 16;
    const wallThickness = CONFIG.WALL_BLOCK_SIZE;
    const floorTop = this.SHOP_ROOM_BOTTOM - wallThickness;
    const x = (this.SHOP_ROOM_LEFT + this.SHOP_ROOM_RIGHT) * 0.5 - width * 0.5;
    const y = floorTop - 64;
    return { x, y, width, height };
  }

  private getShopTestBreakableRect(): { x: number; y: number; width: number; height: number } {
    const lower = this.getShopTestLowerPlatformRect();
    const width = 28;
    const height = 22;
    const x = lower.x + (lower.width - width) * 0.5;
    const y = lower.y - height;
    return { x, y, width, height };
  }

  private updateShopTestBreakableRespawn(): void {
    if (!this.isShopTestRoomActive()) return;
    if (!this.shopTestBreakableDestroyed) return;
    if (this.shopTestBreakableRespawnFrames > 0) {
      this.shopTestBreakableRespawnFrames--;
      return;
    }
    this.shopTestBreakableDestroyed = false;
  }

  private createChestRoomItems(): RoomItem[] {
    const itemSize = 104;
    const floorTop = this.SHOP_ROOM_BOTTOM - CONFIG.WALL_BLOCK_SIZE;
    const itemY = floorTop - itemSize;
    const itemX = (this.SHOP_ROOM_LEFT + this.SHOP_ROOM_RIGHT) * 0.5 - itemSize * 0.5;
    return [{
      id: "chest_cache",
      name: "TREASURE CHEST",
      description: "Blast it open for gems",
      cost: 0,
      soldOut: false,
      rect: { x: itemX, y: itemY, width: itemSize, height: itemSize },
    }];
  }

  private createRoomPowerupPickup(type: PowerUpType): RoomPowerupPickup {
    return {
      type,
      x: (this.SHOP_ROOM_LEFT + this.SHOP_ROOM_RIGHT) * 0.5,
      y: this.SHOP_ROOM_BOTTOM - CONFIG.WALL_BLOCK_SIZE - 40,
      width: POWERUP_CONSTANTS.ORB_HITBOX,
      height: POWERUP_CONSTANTS.ORB_HITBOX,
      glowPhase: this.frameCount * 0.37 + Math.random() * Math.PI * 2,
      collected: false,
    };
  }

  private enterSpecialRoom(roomType: DoorwayRoomType, worldSide: ShopSide): void {
    this.currentRoomEntranceSide = this.getOppositePassageSide(worldSide);
    this.currentRoomType = roomType;
    this.gameState = "shop";
    this.roomTransitionLockFrames = this.SHOP_TRANSITION_LOCK_FRAMES;
    this.roomActionWasPressed = true;
    this.selectedRoomItemId = null;
    this.pendingRoomPowerupReward = null;
    this.roomPowerupPickup = null;
    if (roomType === "shop") {
      this.roomItems = this.createShopRoomItems();
      if (this.SHOP_TEST_MODE) {
        this.shopTestBreakableDestroyed = false;
        this.shopTestBreakableRespawnFrames = 0;
      }
    } else if (roomType === "chest") {
      this.roomItems = this.createChestRoomItems();
    } else {
      const rewardType = this.pickRandomPowerupType();
      this.roomItems = [];
      this.roomPowerupPickup = this.createRoomPowerupPickup(rewardType);
    }

    const player = this.playerController.getPlayer();
    const startX = this.currentRoomEntranceSide === "left"
      ? this.SHOP_ROOM_LEFT + player.width / 2 + 12
      : this.SHOP_ROOM_RIGHT - player.width / 2 - 12;
    const startY = this.SHOP_ROOM_BOTTOM - player.height / 2;
    this.playerController.setPosition(startX, startY);
    this.playerController.setVelocity(0, 0);
    this.playerController.setGrounded(true);
    this.stopAmbience();
    this.startShopMusic();
    this.triggerHaptic("medium");
  }

  private exitSpecialRoom(): void {
    this.gameState = "playing";
    this.roomTransitionLockFrames = this.SHOP_TRANSITION_LOCK_FRAMES;
    this.roomActionWasPressed = true;
    this.selectedRoomItemId = null;
    this.roomItems = [];
    this.roomPowerupPickup = null;
    this.shopTestBreakableRespawnFrames = 0;

    const player = this.playerController.getPlayer();
    const returnX = this.roomEntryContext ? this.roomEntryContext.returnX : player.x;
    const returnY = this.roomEntryContext ? this.roomEntryContext.returnY : player.y;
    const returnVx = this.roomEntryContext ? this.roomEntryContext.returnVx : 0;
    const returnVy = this.roomEntryContext ? this.roomEntryContext.returnVy : 0;
    this.playerController.setPosition(returnX, returnY);
    this.playerController.setVelocity(returnVx, returnVy);
    this.playerController.setGrounded(false);
    this.stopShopMusic();
    this.startAmbience();
    if (this.pendingRoomPowerupReward) {
      this.powerUpManager.grantPowerUp(this.pendingRoomPowerupReward);
      this.triggerPowerUpAnnouncement(this.pendingRoomPowerupReward);
      this.triggerHaptic("success");
      this.pendingRoomPowerupReward = null;
    }
    this.roomEntryContext = null;
    this.currentRoomType = null;
  }

  private getSpecialRoomEntranceRect(side: ShopSide): { x: number; y: number; width: number; height: number } {
    const y = this.SHOP_ROOM_BOTTOM - this.SHOP_ENTRANCE_HEIGHT;
    const x = side === "left" ? this.SHOP_ROOM_LEFT - 3 : this.SHOP_ROOM_RIGHT - 3;
    return {
      x,
      y,
      width: 6,
      height: this.SHOP_ENTRANCE_HEIGHT,
    };
  }

  private updateRoomItemSelection(): void {
    const playerRect = this.playerController.getRect();
    const previous = this.selectedRoomItemId;
    this.selectedRoomItemId = null;
    for (const item of this.roomItems) {
      if (this.isRectOverlapping(playerRect, item.rect)) {
        this.selectedRoomItemId = item.id;
        break;
      }
    }
    if (this.selectedRoomItemId !== null && this.selectedRoomItemId !== previous) {
      this.playRoomSelectBeep();
    }
    this.previousRoomItemId = this.selectedRoomItemId;
  }

  private triggerChestGemBurst(x: number, y: number): void {
    const count = 10 + Math.floor(Math.random() * 6); // 10-15 gems
    const burstOriginY = y - 8;
    for (let i = 0; i < count; i++) {
      const isLargeGem = Math.random() < 0.18;
      const gemSize = isLargeGem ? 20 : 14;
      const gemValue = isLargeGem ? CONFIG.SCORE_PER_GEM * 2 : CONFIG.SCORE_PER_GEM;
      const spread = (Math.random() - 0.5) * 1.35;
      const speed = 2.9 + Math.random() * 2.7;
      const vx = Math.sin(spread) * speed;
      const vy = -(2.2 + Math.abs(Math.cos(spread)) * (2.2 + Math.random() * 2.5));
      const spawnX = x + (Math.random() - 0.5) * 14;
      const spawnY = burstOriginY + (Math.random() - 0.5) * 8;

      this.droppedGems.push({
        x: spawnX,
        y: spawnY,
        width: gemSize,
        height: gemSize,
        value: gemValue,
        collected: false,
        chunkIndex: -1,
        bobOffset: Math.random() * Math.PI * 2,
        dropped: true,
        vx,
        vy,
        life: 0,
        settled: false,
        settleFrames: 0,
        fadeTimer: 0,
        collectDelay: 20,
        isLarge: isLargeGem,
      });
    }
  }

  private tryActivateSelectedRoomItem(): void {
    if (!this.selectedRoomItemId) return;
    const item = this.roomItems.find((entry) => entry.id === this.selectedRoomItemId);
    if (!item || item.soldOut) return;

    if (item.cost > 0 && this.gems < item.cost) {
      this.roomNoFundsTimer = 24;
      this.playRoomNegativeBeep();
      this.triggerHaptic("error");
      this.addScreenShake(2);
      return;
    }

    this.gems -= item.cost;
    item.soldOut = true;
    if (item.id === "hp_up") {
      const beforeHp = this.playerController.getPlayer().hp;
      this.playerController.addMaxHp(1);
      const player = this.playerController.getPlayer();
      player.hp = Math.max(player.hp, Math.min(player.maxHp, beforeHp + 1));
      this.previousHp = player.hp;
    } else if (item.id === "ammo_up") {
      const beforeAmmo = this.playerController.getPlayer().ammo;
      this.playerController.addMaxAmmo(1);
      const player = this.playerController.getPlayer();
      player.ammo = Math.max(player.ammo, Math.min(player.maxAmmo, beforeAmmo + 1));
    } else if (item.id === "stomp_reload") {
      this.runUpgrades.stompReloadOneAmmo = true;
    } else if (item.id === "deep_tank") {
      this.runUpgrades.deepTankPlusTwoAmmo = true;
      const beforeAmmo = this.playerController.getPlayer().ammo;
      this.playerController.addMaxAmmo(2);
      const player = this.playerController.getPlayer();
      player.ammo = Math.max(player.ammo, Math.min(player.maxAmmo, beforeAmmo + 2));
    } else if (item.id === "vampiric_gel") {
      this.runUpgrades.vampiricGel = true;
    } else if (item.id === "salvage_bonus") {
      this.runUpgrades.salvageBreakablesDropGems = true;
    } else if (item.id === "rapid_chamber") {
      this.runUpgrades.rapidChamber = true;
      this.playerController.setShootCooldownFrames(5);
    } else if (item.id === "chest_cache") {
      this.triggerChestGemBurst(item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height / 2);
      this.playTreasureRingSound();
      this.addScreenShake(4);
    } else if (item.id === "powerup_cache" && item.rewardPowerupType) {
      this.pendingRoomPowerupReward = item.rewardPowerupType;
    }

    if (item.id !== "chest_cache") {
      this.playShopPurchaseSound();
    }
    this.updateHUD();
    this.triggerHaptic("success");
  }

  private updateEnemies(): void {
    const visible = this.levelSpawner.getVisibleEntities(this.cameraY, CONFIG.INTERNAL_HEIGHT);
    this.activeWorldDoorways = this.worldDoorwaySystem.getVisibleDoorways(
      this.cameraY - CONFIG.INTERNAL_HEIGHT * 1.25,
      this.cameraY + CONFIG.INTERNAL_HEIGHT * 2.25
    );
    this.activeEnemies = visible.enemies;
    const carvedWorldPlatforms = this.applyWorldDoorwayCarves(visible.platforms, this.activeWorldDoorways);
    const doorwayLipPlatforms = this.buildWorldDoorwayLipPlatforms(this.activeWorldDoorways);
    this.activePlatforms = carvedWorldPlatforms.concat(doorwayLipPlatforms);
    this.activeWallPlatforms = this.activePlatforms.filter((p) => p.isWall);
    this.activeGems = visible.gems;
    this.activeWeeds = [];
    for (const weed of visible.weeds) {
      if (!this.brokenWeeds.has(this.getWeedKey(weed))) {
        this.activeWeeds.push(weed);
      }
    }
    this.rebuildPlatformBuckets();
    this.updateStompedWeeds();
    
    const player = this.playerController.getPlayer();
    
    // Update each enemy using their class-specific behavior
    for (const enemy of this.activeEnemies) {
      enemy.update(player.x, player.y);

      if (enemy instanceof PufferEnemy && enemy.consumePuffStart()) {
        this.playPufferBoingSound();
      }

      // Horizontal movers should never enter cave walls.
      // Use actual generated wall geometry at this enemy's Y, not static WALL_WIDTH.
      if (enemy.type === "HORIZONTAL" || enemy.type === "EXPLODER" || enemy.type === "PUFFER") {
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

  private updateStompedWeeds(): void {
    for (const [key, stomped] of this.stompedWeeds) {
      stomped.timer--;
      if (stomped.timer <= 0) {
        this.stompedWeeds.delete(key);
        this.brokenWeeds.add(key);
      }
    }
  }

  private constrainEnemyInsideWalls(enemy: BaseEnemy): void {
    const sampleY = enemy.y + enemy.height * 0.5;
    let leftBound = CONFIG.WALL_WIDTH;
    let rightBound = CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH;

    for (const platform of this.activeWallPlatforms) {
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

  private buildWorldDoorwayLipPlatforms(doorways: WorldDoorway[]): Platform[] {
    const lips: Platform[] = [];
    for (const doorway of doorways) {
      const lipChunk = Math.floor(doorway.openingRect.y / CONFIG.CHUNK_HEIGHT);
      lips.push({
        x: doorway.roofLipRect.x,
        y: doorway.roofLipRect.y,
        width: doorway.roofLipRect.width,
        height: doorway.roofLipRect.height,
        isWall: false,
        breakable: false,
        oneWay: true,
        hp: 0,
        chunkIndex: lipChunk,
      });
      lips.push({
        x: doorway.floorLipRect.x,
        y: doorway.floorLipRect.y,
        width: doorway.floorLipRect.width,
        height: doorway.floorLipRect.height,
        isWall: false,
        breakable: false,
        oneWay: true,
        hp: 0,
        chunkIndex: lipChunk,
      });
    }
    return lips;
  }

  private applyWorldDoorwayCarves(platforms: Platform[], doorways: WorldDoorway[]): Platform[] {
    if (doorways.length === 0) return platforms.slice();

    const carved: Platform[] = [];
    const leftDoorways = doorways.filter((d) => d.side === "left");
    const rightDoorways = doorways.filter((d) => d.side === "right");

    for (const platform of platforms) {
      if (!platform.isWall || platform.oneWay) {
        carved.push(platform);
        continue;
      }

      const platformSide: DoorwaySide = platform.x + platform.width * 0.5 < CONFIG.INTERNAL_WIDTH * 0.5 ? "left" : "right";
      const matches = platformSide === "left" ? leftDoorways : rightDoorways;
      if (matches.length === 0) {
        carved.push(platform);
        continue;
      }

      let segments: Array<{ y0: number; y1: number }> = [{ y0: platform.y, y1: platform.y + platform.height }];
      for (const doorway of matches) {
        const openTop = doorway.openingRect.y;
        const openBottom = doorway.openingRect.y + doorway.openingRect.height;
        const nextSegments: Array<{ y0: number; y1: number }> = [];
        for (const segment of segments) {
          if (openBottom <= segment.y0 || openTop >= segment.y1) {
            nextSegments.push(segment);
            continue;
          }
          if (openTop > segment.y0) {
            nextSegments.push({ y0: segment.y0, y1: openTop });
          }
          if (openBottom < segment.y1) {
            nextSegments.push({ y0: openBottom, y1: segment.y1 });
          }
        }
        segments = nextSegments;
        if (segments.length === 0) break;
      }

      for (const segment of segments) {
        const segmentHeight = segment.y1 - segment.y0;
        if (segmentHeight < 1) continue;
        carved.push({
          x: platform.x,
          y: segment.y0,
          width: platform.width,
          height: segmentHeight,
          isWall: platform.isWall,
          breakable: platform.breakable,
          hp: platform.hp,
          oneWay: platform.oneWay,
          chunkIndex: platform.chunkIndex,
        });
      }
    }

    return carved;
  }

  private getWeedKey(weed: Weed): string {
    return `${Math.round(weed.x)}:${Math.round(weed.y)}:${weed.spriteIndex}:${weed.isLeft ? 1 : 0}`;
  }

  private acquireDroppedGem(): Gem {
    const gem = this.droppedGemPool.pop();
    if (gem) return gem;
    return {
      x: 0,
      y: 0,
      width: 14,
      height: 14,
      value: CONFIG.SCORE_PER_GEM,
      collected: false,
      chunkIndex: 0,
      bobOffset: 0,
      dropped: true,
      vx: 0,
      vy: 0,
      life: 0,
      settled: false,
      settleFrames: 0,
      fadeTimer: 0,
      collectDelay: 0,
      isLarge: false,
    };
  }

  private releaseDroppedGem(index: number): void {
    const gem = this.droppedGems[index];
    if (!gem) return;
    gem.collected = false;
    gem.dropped = true;
    gem.width = 14;
    gem.height = 14;
    gem.value = CONFIG.SCORE_PER_GEM;
    gem.vx = 0;
    gem.vy = 0;
    gem.life = 0;
    gem.settled = false;
    gem.settleFrames = 0;
    gem.fadeTimer = 0;
    gem.collectDelay = 0;
    gem.isLarge = false;
    this.droppedGemPool.push(gem);
    this.droppedGems.splice(index, 1);
  }

  private releaseAllDroppedGems(): void {
    for (let i = this.droppedGems.length - 1; i >= 0; i--) {
      this.releaseDroppedGem(i);
    }
  }

  private overlapsRect(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private isInsideBreakablePocket(x: number, y: number, width: number, height: number): boolean {
    const block = CONFIG.WALL_BLOCK_SIZE;
    const maxSideGap = block * 1.1;
    const maxFloorGap = block * 1.4;
    const rectLeft = x - width / 2;
    const rectTop = y - height / 2;
    const rectRight = rectLeft + width;
    const rectBottom = rectTop + height;

    let hasLeftBreakable = false;
    let hasRightBreakable = false;
    let hasFloorBreakable = false;

    const nearby = this.getPlatformsNearRect(rectLeft, rectTop, width, height, block * 2);
    for (const platform of nearby) {
      if (!platform.breakable) continue;

      const verticalOverlap = rectTop < platform.y + platform.height && rectBottom > platform.y;
      if (verticalOverlap) {
        const rightEdgeGap = rectLeft - (platform.x + platform.width);
        if (rightEdgeGap >= -2 && rightEdgeGap <= maxSideGap) {
          hasLeftBreakable = true;
        }

        const leftEdgeGap = platform.x - rectRight;
        if (leftEdgeGap >= -2 && leftEdgeGap <= maxSideGap) {
          hasRightBreakable = true;
        }
      }

      const horizontalOverlap = rectRight > platform.x && rectLeft < platform.x + platform.width;
      if (horizontalOverlap) {
        const floorGap = platform.y - rectBottom;
        if (floorGap >= -2 && floorGap <= maxFloorGap) {
          hasFloorBreakable = true;
        }
      }

      if (hasLeftBreakable && hasRightBreakable && hasFloorBreakable) {
        return true;
      }
    }

    return false;
  }

  private pushDroppedGemOutOfBreakablePocket(gem: Gem): void {
    const halfW = gem.width / 2;
    const halfH = gem.height / 2;
    const rectLeft = gem.x - halfW;
    const rectTop = gem.y - halfH;
    const rectRight = rectLeft + gem.width;
    const rectBottom = rectTop + gem.height;
    const nearby = this.getPlatformsNearRect(rectLeft, rectTop, gem.width, gem.height, CONFIG.WALL_BLOCK_SIZE * 2);

    let nearestFloor: Platform | null = null;
    let nearestLeftWall: Platform | null = null;
    let nearestRightWall: Platform | null = null;
    let nearestFloorGap = Number.POSITIVE_INFINITY;
    let nearestLeftGap = Number.POSITIVE_INFINITY;
    let nearestRightGap = Number.POSITIVE_INFINITY;

    for (const platform of nearby) {
      if (!platform.breakable) continue;

      const horizontalOverlap = rectRight > platform.x && rectLeft < platform.x + platform.width;
      if (horizontalOverlap) {
        const floorGap = platform.y - rectBottom;
        if (floorGap >= -2 && floorGap < nearestFloorGap) {
          nearestFloorGap = floorGap;
          nearestFloor = platform;
        }
      }

      const verticalOverlap = rectTop < platform.y + platform.height && rectBottom > platform.y;
      if (verticalOverlap) {
        const leftGap = rectLeft - (platform.x + platform.width);
        if (leftGap >= -2 && leftGap < nearestLeftGap) {
          nearestLeftGap = leftGap;
          nearestLeftWall = platform;
        }

        const rightGap = platform.x - rectRight;
        if (rightGap >= -2 && rightGap < nearestRightGap) {
          nearestRightGap = rightGap;
          nearestRightWall = platform;
        }
      }
    }

    if (nearestFloor) {
      gem.y = nearestFloor.y - halfH - 4;
      gem.vy = Math.min(gem.vy ?? 0, -3.2);
    }

    const pushRight = nearestLeftGap <= nearestRightGap;
    if (nearestLeftWall || nearestRightWall) {
      const direction = pushRight ? 1 : -1;
      gem.x += direction * (CONFIG.WALL_BLOCK_SIZE * 0.65);
      gem.vx = direction * Math.max(Math.abs(gem.vx ?? 0), 1.8);
    }

    gem.x = Math.max(halfW, Math.min(CONFIG.INTERNAL_WIDTH - halfW, gem.x));
  }

  private resolveDroppedGemSolidOverlaps(gem: Gem, maxIterations: number = 6): void {
    const halfW = gem.width / 2;
    const halfH = gem.height / 2;

    for (let iter = 0; iter < maxIterations; iter++) {
      const gemLeft = gem.x - halfW;
      const gemTop = gem.y - halfH;
      const nearbyPlatforms = this.getPlatformsNearRect(gemLeft, gemTop, gem.width, gem.height, 6);
      let resolvedAny = false;

      for (const platform of nearbyPlatforms) {
        if (!this.overlapsRect(gemLeft, gemTop, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;

        const overlapLeft = gemLeft + gem.width - platform.x;
        const overlapRight = platform.x + platform.width - gemLeft;
        const overlapTop = gemTop + gem.height - platform.y;
        const overlapBottom = platform.y + platform.height - gemTop;
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        if (minOverlapX < minOverlapY) {
          if (overlapLeft < overlapRight) {
            gem.x = platform.x - halfW;
            gem.vx = -Math.abs(gem.vx ?? 0) * 0.6;
          } else {
            gem.x = platform.x + platform.width + halfW;
            gem.vx = Math.abs(gem.vx ?? 0) * 0.6;
          }
        } else {
          if (overlapTop < overlapBottom) {
            gem.y = platform.y - halfH;
            gem.vy = -Math.abs(gem.vy ?? 0) * 0.42;
          } else {
            gem.y = platform.y + platform.height + halfH;
            gem.vy = Math.abs(gem.vy ?? 0) * 0.35;
          }
        }

        gem.x = Math.max(halfW, Math.min(CONFIG.INTERNAL_WIDTH - halfW, gem.x));
        resolvedAny = true;
        break;
      }

      if (!resolvedAny) {
        break;
      }
    }
  }

  private updateDroppedGems(): void {
    for (let i = this.droppedGems.length - 1; i >= 0; i--) {
      const gem = this.droppedGems[i];

      if (gem.collected) {
        this.releaseDroppedGem(i);
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
          if (!this.overlapsRect(testLeftX, testTopY, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;
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
          if (!this.overlapsRect(testLeft, testTop, gem.width, gem.height, platform.x, platform.y, platform.width, platform.height)) continue;

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

        // If a gem ended up inside geometry, iteratively resolve overlaps.
        this.resolveDroppedGemSolidOverlaps(gem);

        if (this.isInsideBreakablePocket(gem.x, gem.y, gem.width, gem.height)) {
          this.pushDroppedGemOutOfBreakablePocket(gem);
          // Re-run solid overlap resolution after pocket ejection.
          this.resolveDroppedGemSolidOverlaps(gem);
        }

        // Keep dropped gems dynamic; despawn is time-based (not settle/flash-based).
        const nearStill = Math.abs(gem.vx) < 0.08 && Math.abs(gem.vy) < 0.08;
        if (onGround && nearStill) {
          gem.vx = 0;
          gem.vy = 0;
        }
      }

      const offTopOfScreen = this.gameState === "shop"
        ? gem.y + gem.height * 0.5 < this.SHOP_ROOM_TOP - 40
        : gem.y + gem.height * 0.5 < this.cameraY - 24;
      const isFarBelow = this.gameState === "shop"
        ? gem.y > this.SHOP_ROOM_BOTTOM + 80
        : gem.y > this.cameraY + CONFIG.INTERNAL_HEIGHT * 1.6;
      const expiredByLifetime = (gem.life ?? 0) > 300; // 5 seconds at 60fps
      if (expiredByLifetime || offTopOfScreen || isFarBelow) {
        this.releaseDroppedGem(i);
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
      const nearbyPlatforms = this.getPlatformsNearRect(bullet.x, bullet.y, bullet.width, bullet.height, 4);
      
      for (const platform of nearbyPlatforms) {
        if (this.checkCollision(bullet, platform)) {
          const impactX = bullet.x;
          const impactY = bullet.y;

          // Blast shots should explode on terrain impact too, not only enemy impact.
          if (bullet.isBlast && this.powerUpManager.hasPowerUp("BLAST")) {
            this.powerUpManager.spawnBlastExplosion(impactX, impactY);
            this.playBlastSound();
            this.addScreenShake(8);
            this.triggerHaptic("medium");
          }

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

        let bulletHitEnemy = false;
        if (enemy instanceof PufferEnemy) {
          const { cx, cy, radius } = this.getPufferCollisionCircle(enemy);
          bulletHitEnemy = this.rectCircleOverlap(
            { x: bullet.x, y: bullet.y, width: bullet.width, height: bullet.height },
            cx,
            cy,
            radius
          );
        } else {
          const enemyRect = this.getEnemyCollisionRect(enemy);
          bulletHitEnemy = this.checkCollision(bullet, enemyRect);
        }

        if (bulletHitEnemy) {
          const isDead = enemy.takeDamage(1);
          this.playerController.removeBullet(i);
          
          const hitX = enemy.x + enemy.width / 2;
          const hitY = enemy.y + enemy.height / 2;
          
          if (isDead) {
            this.killEnemy(enemy, j);
          }
          
          // Trigger blast explosion if blast powerup shot
          if (bullet.isBlast && this.powerUpManager.hasPowerUp("BLAST")) {
            this.powerUpManager.spawnBlastExplosion(hitX, hitY);
            this.playBlastSound();
            this.addScreenShake(8);
            this.triggerHaptic("medium");
          }
          
          // Trigger lightning chain if lightning powerup shot
          if (bullet.isLightning && this.powerUpManager.hasPowerUp("LIGHTNING")) {
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
    const playerRect = this.getPlayerCollisionRect();
    
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

      // Enemy bullets should be blocked by any solid tile/wall.
      // One-way platforms stay pass-through from below for consistency.
      let hitSolid = false;
      const nearbyPlatforms = this.getPlatformsNearRect(
        bulletRect.x,
        bulletRect.y,
        bulletRect.width,
        bulletRect.height,
        2
      );
      for (const platform of nearbyPlatforms) {
        if (platform.oneWay) continue;
        const overlaps =
          bulletRect.x < platform.x + platform.width &&
          bulletRect.x + bulletRect.width > platform.x &&
          bulletRect.y < platform.y + platform.height &&
          bulletRect.y + bulletRect.height > platform.y;
        if (overlaps) {
          hitSolid = true;
          break;
        }
      }
      if (hitSolid) {
        this.enemyBullets.splice(i, 1);
        continue;
      }
      
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
      this.playLightningSound();
    }
  }
  
  private destroyPlatform(platform: Platform): void {
    const cx = platform.x + platform.width / 2;
    const cy = platform.y + platform.height / 2;
    this.playBlockBreakSound();

    // Spawn crumble debris (chunky sand blocks flying outward)
    this.spawnCrumbleDebris(platform.x, platform.y, platform.width, platform.height);

    // Spawn sand fall particles (fine grains cascading down)
    this.spawnSandParticles(platform.x, platform.y, platform.width, platform.height);

    // Small screen shake for impact
    this.addScreenShake(2);

    // Remove platform from its chunk
    if (platform.chunkIndex >= 0) {
      const chunk = this.levelSpawner.getChunk(platform.chunkIndex);
      const index = chunk.platforms.indexOf(platform);
      if (index !== -1) {
        chunk.platforms.splice(index, 1);
        this.markChunkPlatformCacheDirty(platform.chunkIndex);
        this.rebuildPlatformBuckets();
      }
    } else if (this.isShopTestRoomActive()) {
      this.shopTestBreakableDestroyed = true;
      this.shopTestBreakableRespawnFrames = this.SHOP_TEST_BREAKABLE_RESPAWN_FRAMES;
    }
    
    // Award some score for breaking blocks
    this.score += 2;
    this.scoreBreakables += 2;
    this.breakableDestroyCount++;
    if (this.runUpgrades.salvageBreakablesDropGems && Math.random() < this.SALVAGE_BREAKABLE_GEM_CHANCE) {
      const isLargeGem = Math.random() < 0.2;
      const gemSize = isLargeGem ? 18 : 14;
      const gemValue = isLargeGem ? CONFIG.SCORE_PER_GEM * 2 : CONFIG.SCORE_PER_GEM;
      this.droppedGems.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy - 8,
        width: gemSize,
        height: gemSize,
        value: gemValue,
        collected: false,
        chunkIndex: platform.chunkIndex,
        bobOffset: Math.random() * Math.PI * 2,
        dropped: true,
        vx: (Math.random() - 0.5) * 2.8,
        vy: -(2 + Math.random() * 1.8),
        life: 0,
        settled: false,
        settleFrames: 0,
        fadeTimer: 0,
        collectDelay: 14,
        isLarge: isLargeGem,
      });
    }
    this.triggerHaptic("light");
  }
  
  private resolveCollisions(): void {
    const player = this.playerController.getPlayer();
    // Capture vy BEFORE platform resolution so stomp detection isn't broken
    // by stopVertical() zeroing vy before the enemy collision check runs.
    const vyBeforeResolve = player.vy;
    const prevX = player.x - player.vx;
    const prevY = player.y - player.vy;
    const minLandingOverlap = player.width * 0.5;
    
    this.playerController.setGrounded(false);
    const nearX = Math.min(prevX, player.x) - player.width;
    const nearY = Math.min(prevY, player.y) - player.height;
    const nearW = Math.abs(player.x - prevX) + player.width * 2;
    const nearH = Math.abs(player.y - prevY) + player.height * 2;
    const nearbyPlatforms = this.getPlatformsNearRect(nearX, nearY, nearW, nearH, 12);
    
    // First pass: Check if player is standing on any platform (including walls treated as floor)
    // This allows walking on blocks
    for (const platform of nearbyPlatforms) {
      const playerBottom = player.y + player.height / 2;
      const prevBottom = prevY + player.height / 2;
      const playerLeft = player.x - player.width / 2;
      const playerRight = player.x + player.width / 2;
      const prevLeft = prevX - player.width / 2;
      const prevRight = prevX + player.width / 2;
      const platformTop = platform.y;
      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;
      const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
      const overlapWidth = Math.min(playerRight, platformRight) - Math.max(playerLeft, platformLeft);
      const prevOverlapWidth = Math.min(prevRight, platformRight) - Math.max(prevLeft, platformLeft);
      const crossedTop = prevBottom <= platformTop + 1 &&
                        playerBottom >= platformTop &&
                        Math.max(overlapWidth, prevOverlapWidth) >= minLandingOverlap;
      
      // Check if player is standing on top of this platform
      const isOnTop = playerBottom >= platformTop - 2 && 
                      playerBottom <= platformTop + 8 &&
                      overlapsX &&
                      overlapWidth >= minLandingOverlap;
      
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
      for (const platform of nearbyPlatforms) {
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
    for (const platform of nearbyPlatforms) {
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

      for (const platform of nearbyPlatforms) {
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
        const prevRectTop = prevY - player.height / 2;
        const prevRectBottom = prevY + player.height / 2;
        const prevRectLeft = prevX - player.width / 2;
        const prevRectRight = prevX + player.width / 2;
        const overlapWidthNow = Math.min(rectRight, platRight) - Math.max(rectLeft, platLeft);
        const overlapWidthPrev = Math.min(prevRectRight, platRight) - Math.max(prevRectLeft, platLeft);
        const playerBottomNow = player.y + player.height / 2;
        const playerTopNow = player.y - player.height / 2;
        const crossedTop = prevRectBottom <= platTop + 2 && playerBottomNow >= platTop;
        const crossedBottom = prevRectTop >= platBottom - 2 && playerTopNow <= platBottom;
        const canResolveVertically = (crossedTop || crossedBottom) &&
          Math.max(overlapWidthNow, overlapWidthPrev) >= minLandingOverlap;

        if (minOverlapX < minOverlapY || !canResolveVertically) {
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

    const playerRect = this.getPlayerCollisionRect();
    
    // Enemy collisions
    for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
      const enemy = this.activeEnemies[i];

      if (enemy instanceof PufferEnemy) {
        const { cx, cy, radius } = this.getPufferCollisionCircle(enemy);
        const overlapsVisual = this.rectCircleOverlap(playerRect, cx, cy, radius);
        if (!overlapsVisual) continue;

        if (enemy.isPuffed()) {
          if (!this.playerController.isInvulnerable()) {
            this.applyPlayerDamage(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
            const player = this.playerController.getPlayer();
            const knock = enemy.getCollisionKnockback(player.x, player.y);
            this.playerController.setVelocity(knock.vx, knock.vy);
            this.addScreenShake(6);
            this.triggerHaptic("error");
          }
          continue;
        }
      } else if (!this.checkCollision(playerRect, this.getEnemyCollisionRect(enemy))) {
        continue;
      }
      
      // Player bounces if falling downward — use vyBeforeResolve because
      // platform collision may have zeroed vy before this check runs.
      if (vyBeforeResolve > 0) {
        // Bounce mechanic - player lands on enemy from above
        this.bounceOnEnemy(enemy, i);
      } else if (!this.playerController.isInvulnerable()) {
        // Player takes damage only if moving up or stationary
        this.applyPlayerDamage(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
      }
    }

    // Weed stomp bounce (no score, no combo). Drops one gem.
    // Weeds act like springy coral: contact from above bounces the player.
    for (let i = this.activeWeeds.length - 1; i >= 0; i--) {
      const weed = this.activeWeeds[i];
      const weedKey = this.getWeedKey(weed);
      if (this.stompedWeeds.has(weedKey)) continue;
      const weedRect = this.getWeedCollisionRect(weed);
      const playerBottom = playerRect.y + playerRect.height;
      const fromAbove = playerBottom <= weed.y + 8;
      const overlapsWeed =
        playerRect.x < weedRect.x + weedRect.width &&
        playerRect.x + playerRect.width > weedRect.x &&
        playerRect.y < weedRect.y + weedRect.height &&
        playerRect.y + playerRect.height > weedRect.y;
      if (overlapsWeed && player.vy > 0 && fromAbove) {
        this.playerController.bounce(false);
        this.playEnemyCrunchSound();
        this.triggerHaptic("light");
        const weedChunkIndex = Math.max(0, Math.floor(weed.y / CONFIG.CHUNK_HEIGHT));
        this.spawnSingleDroppedGem(weed.x, weed.y - 10, weedChunkIndex);
        this.stompedWeeds.set(weedKey, { weed, timer: 10 });
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
        this.gemCollectCount++;
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
        if (this.isHeartPickup(gem)) {
          this.collectHeartPickup(gem);
        } else {
          const points = gem.value * comboMultiplier;
          this.score += points;
          this.scoreGems += points;
          this.gems++;
          this.gemCollectCount++;
          this.playGemSound();
        }
        this.releaseDroppedGem(i);
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

  private isHeartPickup(gem: Gem): boolean {
    return gem.value <= 0;
  }

  private collectHeartPickup(gem: Gem): void {
    const player = this.playerController.getPlayer();
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
      this.previousHp = player.hp;
      this.triggerHaptic("success");
    } else {
      this.triggerHaptic("light");
    }
    this.playGemSound();
  }
  
  private bounceOnEnemy(enemy: BaseEnemy, index: number): void {
    // Bounce and restore ammo
    this.playerController.bounce(false);
    if (this.runUpgrades.stompReloadOneAmmo) {
      this.playerController.addAmmo(1);
    }
    
    // Kill enemy instantly when stomped
    this.killEnemy(enemy, index);
    
    // Increment combo
    this.playerController.incrementCombo();
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
      (worldY, entityWidth, preferredX) => this.levelSpawner.getSafeSpawnX(worldY, entityWidth, preferredX),
      this.cameraY + CONFIG.INTERNAL_HEIGHT + 80
    );
    
    // Check powerup orb collection
    const collected = this.powerUpManager.checkCollection(
      player.x, player.y, player.width, player.height
    );
    
    if (collected) {
      // Trigger aura flash effect around diver
      this.triggerPowerUpAnnouncement(collected);
      this.triggerHaptic("success");
    }
    
    // Update powerup manager (timers, effects)
    this.powerUpManager.update();
    
    // Process shield collisions with enemies
    if (this.powerUpManager.hasPowerUp("SHIELD")) {
      this.processShieldCollisions();
    }
    
    // Process laser beam collisions with enemies
    this.processLaserCollisions();
    
    // Process blast explosion collisions
    this.processBlastCollisions();
    
    // Process lightning chain from explosions
    this.processLightningCollisions();

    // Process magnet pull on nearby gems
    this.processMagnetAttraction();
    
    // (Powerup indicators removed - aura effect replaces them)
  }
  
  private triggerPowerUpAnnouncement(type: PowerUpType): void {
    // Instead of pausing the game with a title screen,
    // trigger a brief bright aura flash around the diver
    const info = POWERUP_INFO[type];
    this.powerupAuraFlash = 30; // 0.5 second bright flash
    this.powerupAuraFlashColor = info.color;
  }
  
  private processShieldCollisions(): void {
    const player = this.playerController.getPlayer();
    const positions = this.powerUpManager.getShieldPositions(player.x, player.y);
    const orbSize = POWERUP_CONSTANTS.SHIELD_ORB_SIZE;
    
    for (const pos of positions) {
      for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
        const enemy = this.activeEnemies[i];
        
        // Simple circle-rect collision
        const ecx = enemy.x + enemy.width / 2;
        const ecy = enemy.y + enemy.height / 2;
        const dist = Math.sqrt((pos.x - ecx) ** 2 + (pos.y - ecy) ** 2);
        
        if (dist < orbSize + Math.max(enemy.width, enemy.height) / 2) {
          const isDead = enemy.takeDamage(POWERUP_CONSTANTS.SHIELD_DAMAGE);
          if (isDead) {
            this.killEnemy(enemy, i);
            this.playShieldSound();
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
    const blastedBreakables = new Set<Platform>();
    
    for (const exp of explosions) {
      if (exp.frame !== 5) continue; // Only deal damage on frame 5 (middle of expansion)
      const radiusSq = exp.maxRadius * exp.maxRadius;
      
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

      // Blast utility role: instantly clear any breakables caught in the blast radius.
      for (let i = this.activePlatforms.length - 1; i >= 0; i--) {
        const platform = this.activePlatforms[i];
        if (!platform.breakable || blastedBreakables.has(platform)) continue;

        const closestX = Math.max(platform.x, Math.min(exp.x, platform.x + platform.width));
        const closestY = Math.max(platform.y, Math.min(exp.y, platform.y + platform.height));
        const dx = exp.x - closestX;
        const dy = exp.y - closestY;
        if (dx * dx + dy * dy > radiusSq) continue;

        blastedBreakables.add(platform);
        this.destroyPlatform(platform);
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

  private processMagnetAttraction(): void {
    if (!this.powerUpManager.hasPowerUp("MAGNET")) return;

    const player = this.playerController.getPlayer();
    const radius = this.MAGNET_RADIUS;
    const radiusSq = radius * radius;
    let pulledGemCount = 0;

    if (this.magnetPullSfxCooldownFrames > 0) {
      this.magnetPullSfxCooldownFrames--;
    }

    const pullGem = (gem: Gem, useVelocity: boolean) => {
      if (gem.collected) return;
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0.001 || distSq > radiusSq) return;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      const strength = (1 - dist / radius);
      const pullSpeed = 0.9 + strength * 3.2;
      pulledGemCount++;

      if (useVelocity) {
        gem.vx = (gem.vx ?? 0) + nx * pullSpeed * 0.35;
        gem.vy = (gem.vy ?? 0) + ny * pullSpeed * 0.35;
      } else {
        gem.x += nx * pullSpeed;
        gem.y += ny * pullSpeed;
      }
    };

    for (const gem of this.activeGems) {
      pullGem(gem, false);
    }

    for (const gem of this.droppedGems) {
      pullGem(gem, true);
    }

    if (pulledGemCount > 0 && this.magnetPullSfxCooldownFrames <= 0) {
      this.playMagnetPullSound();
      this.magnetPullSfxCooldownFrames = 4;
    }
  }
  
  
  private killEnemy(enemy: BaseEnemy, index: number): void {
    this.playEnemyCrunchSound();

    const cx = enemy.x + enemy.width / 2;
    const cy = enemy.y + enemy.height / 2;
    const enemyColor = enemy.getBaseColor();
    
    // Determine which hurt sprite to use based on enemy type
    let spriteType: "shark" | "crab" | "squid" | "puffer";
    if (enemy.type === "HORIZONTAL") {
      spriteType = "shark";
    } else if (enemy.type === "EXPLODER") {
      spriteType = "squid";
    } else if (enemy.type === "PUFFER") {
      spriteType = "puffer";
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
    this.enemyKillCount++;
    if (this.runUpgrades.vampiricGel) {
      const player = this.playerController.getPlayer();
      if (player.hp < player.maxHp && Math.random() < this.VAMPIRIC_GEL_HEAL_CHANCE) {
        this.spawnLifestealHeartDrop(cx, cy, enemy.chunkIndex);
      }
    }
    
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

  private formatBreakdownMultiplier(multiplier: number): string {
    if (!Number.isFinite(multiplier)) return "0";
    if (Math.abs(multiplier - Math.round(multiplier)) < 0.001) {
      return `${Math.round(multiplier)}`;
    }
    return multiplier.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  private roundUpToNearestFive(value: number): number {
    if (value <= 0) return 0;
    return Math.ceil(value / 5) * 5;
  }

  private formatScoreBreakdown(count: number, score: number): string {
    const roundedScore = this.roundUpToNearestFive(score);
    if (count <= 0 || roundedScore <= 0) {
      return "0 x 0 = 0";
    }
    const multiplier = roundedScore / count;
    return `${count} x ${this.formatBreakdownMultiplier(multiplier)} = ${roundedScore}`;
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
    enemiesValueEl.textContent = this.formatScoreBreakdown(this.enemyKillCount, this.scoreEnemies);
    gemsValueEl.textContent = this.formatScoreBreakdown(this.gemCollectCount, this.scoreGems);
    breakablesValueEl.textContent = this.formatScoreBreakdown(this.breakableDestroyCount, this.scoreBreakables);
    depthRow.classList.remove("visible");
    enemiesRow.classList.remove("visible");
    gemsRow.classList.remove("visible");
    breakablesRow.classList.remove("visible");

    const steps = [
      { row: depthRow, el: depthValueEl, value: this.roundUpToNearestFive(this.scoreDepth), animate: true },
      { row: enemiesRow, el: enemiesValueEl, value: this.roundUpToNearestFive(this.scoreEnemies), animate: false },
      { row: gemsRow, el: gemsValueEl, value: this.roundUpToNearestFive(this.scoreGems), animate: false },
      { row: breakablesRow, el: breakablesValueEl, value: this.roundUpToNearestFive(this.scoreBreakables), animate: false },
    ];

    let delay = 120;
    for (const step of steps) {
      const showId = window.setTimeout(() => {
        step.row.classList.add("visible");
        if (step.animate) {
          this.animateValue(step.el, 0, step.value, 420);
        }
      }, delay);
      this.gameOverTimers.push(showId);
      delay += 460;
    }

    const totalId = window.setTimeout(() => {
      this.animateValue(finalScoreEl, 0, this.roundUpToNearestFive(this.score), 550);
    }, delay + 120);
    this.gameOverTimers.push(totalId);
  }

  private spawnDroppedGems(x: number, y: number, chunkIndex: number): void {
    const count = 2 + Math.floor(Math.random() * 3);
    const hasLargeGem = Math.random() < 0.2;
    const largeGemIndex = hasLargeGem ? Math.floor(Math.random() * count) : -1;
    for (let i = 0; i < count; i++) {
      const isLargeGem = i === largeGemIndex;
      const gemSize = isLargeGem ? 20 : 14;
      const gemValue = isLargeGem ? CONFIG.SCORE_PER_GEM * 2 : CONFIG.SCORE_PER_GEM;
      let angle = Math.random() * Math.PI * 2;
      let speed = 1.2 + Math.random() * 2.8;
      let spawnX = x;
      let spawnY = y;
      let foundSafeSpawn = false;

      for (let attempt = 0; attempt < 14; attempt++) {
        angle = Math.random() * Math.PI * 2;
        speed = 1.2 + Math.random() * 2.8;
        const spawnRadius = 12 + Math.random() * 10 + attempt * 2;
        spawnX = x + Math.cos(angle) * spawnRadius;
        spawnY = y + Math.sin(angle) * (spawnRadius * 0.6);
        const rectX = spawnX - gemSize / 2;
        const rectY = spawnY - gemSize / 2;
        const overlapsPlatform = this.getPlatformsNearRect(rectX, rectY, gemSize, gemSize, 2).some((platform) => {
          return this.overlapsRect(rectX, rectY, gemSize, gemSize, platform.x, platform.y, platform.width, platform.height);
        });
        if (overlapsPlatform) continue;
        if (this.isInsideBreakablePocket(spawnX, spawnY, gemSize, gemSize)) continue;
        foundSafeSpawn = true;
        break;
      }

      if (!foundSafeSpawn) {
        continue;
      }

      this.droppedGems.push({
        x: spawnX,
        y: spawnY,
        width: gemSize,
        height: gemSize,
        value: gemValue,
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
        isLarge: isLargeGem,
      });
    }
  }

  private spawnSingleDroppedGem(x: number, y: number, chunkIndex: number): void {
    const gemSize = 14;
    const gemValue = CONFIG.SCORE_PER_GEM;
    let angle = Math.random() * Math.PI * 2;
    let speed = 1.0 + Math.random() * 2.0;
    let spawnX = x;
    let spawnY = y;
    let foundSafeSpawn = false;

    for (let attempt = 0; attempt < 14; attempt++) {
      angle = Math.random() * Math.PI * 2;
      speed = 1.0 + Math.random() * 2.0;
      const spawnRadius = 8 + Math.random() * 10 + attempt * 2;
      spawnX = x + Math.cos(angle) * spawnRadius;
      spawnY = y + Math.sin(angle) * (spawnRadius * 0.6);
      const rectX = spawnX - gemSize / 2;
      const rectY = spawnY - gemSize / 2;
      const overlapsPlatform = this.getPlatformsNearRect(rectX, rectY, gemSize, gemSize, 2).some((platform) => {
        return this.overlapsRect(rectX, rectY, gemSize, gemSize, platform.x, platform.y, platform.width, platform.height);
      });
      if (overlapsPlatform) continue;
      if (this.isInsideBreakablePocket(spawnX, spawnY, gemSize, gemSize)) continue;
      foundSafeSpawn = true;
      break;
    }

    if (!foundSafeSpawn) {
      return;
    }

    this.droppedGems.push({
      x: spawnX,
      y: spawnY,
      width: gemSize,
      height: gemSize,
      value: gemValue,
      collected: false,
      chunkIndex,
      bobOffset: Math.random() * Math.PI * 2,
      dropped: true,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.0,
      life: 0,
      settled: false,
      settleFrames: 0,
      fadeTimer: 0,
      collectDelay: 8,
      isLarge: false,
    });
  }

  private spawnLifestealHeartDrop(x: number, y: number, chunkIndex: number): void {
    const heartSize = 16;
    this.droppedGems.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - 8,
      width: heartSize,
      height: heartSize,
      value: 0,
      collected: false,
      chunkIndex,
      bobOffset: Math.random() * Math.PI * 2,
      dropped: true,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -(1.6 + Math.random() * 1.2),
      life: 0,
      settled: false,
      settleFrames: 0,
      fadeTimer: 0,
      collectDelay: 8,
      isLarge: false,
    });
  }
  
  private spawnHurtAnimation(x: number, y: number, width: number, height: number, color: string, direction: number, spriteType: "shark" | "crab" | "squid" | "puffer"): void {
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
      } else if (anim.spriteType === "puffer") {
        // Puffer deaths should not briefly show the crab hurt sprite.
        sprite = null;
        spriteLoaded = false;
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
    this.syncHpBubbles(player.maxHp);
    this.syncAmmoSliderSegments(player.maxAmmo);
    const scoreText = `${this.score}`;
    if (this.hudRefs.scoreEl && this.prevHudScore !== this.score) {
      this.hudRefs.scoreEl.textContent = scoreText;
      this.prevHudScore = this.score;
    }
    const depthValue = Math.floor(this.maxDepth);
    if (this.hudRefs.depthEl && this.prevHudDepth !== depthValue) {
      this.hudRefs.depthEl.textContent = `${depthValue}m`;
      this.prevHudDepth = depthValue;
    }
    if (this.hudRefs.gemsEl && this.prevHudGems !== this.gems) {
      this.hudRefs.gemsEl.textContent = `GEMS: ${this.gems}`;
      this.prevHudGems = this.gems;
    }
    const ammoText = "AMMO: " + "●".repeat(player.ammo) + "○".repeat(player.maxAmmo - player.ammo);
    if (this.hudRefs.ammoEl && this.prevHudAmmo !== ammoText) {
      this.hudRefs.ammoEl.textContent = ammoText;
      this.prevHudAmmo = ammoText;
    }
    
    // Update HP bubbles - detect lost HP and trigger pop
    if (this.hudRefs.hpBar && this.hudRefs.hpBubbles.length > 0) {
      // Detect if HP just decreased (bubble pop trigger)
      if (player.hp < this.previousHp) {
        // Pop bubbles for each lost HP point
        this.hudRefs.hpBubbles.forEach((bubble, index) => {
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
        
        this.hudRefs.hpBubbles.forEach((bubble, index) => {
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
    if (this.hudRefs.ammoSliderFill) {
      const ammoPercent = (player.ammo / player.maxAmmo) * 100;
      if (ammoPercent !== this.prevHudAmmoPercent) {
        this.hudRefs.ammoSliderFill.style.height = `${ammoPercent}%`;
        this.prevHudAmmoPercent = ammoPercent;
      }
    }

    // DOM powerup bar is hidden; active timer is rendered above the player.
    this.hudRefs.powerupBar?.classList.add("hidden");
    
    if (this.hudRefs.comboEl) {
      if (player.combo > 0) {
        if (this.prevHudCombo !== player.combo) {
          this.hudRefs.comboEl.textContent = `x${player.combo}`;
          this.prevHudCombo = player.combo;
        }
        this.hudRefs.comboEl.style.opacity = "1";
      } else {
        this.hudRefs.comboEl.style.opacity = "0";
        this.prevHudCombo = 0;
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

  private getLabRectFromFrame(
    frameId: string,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    frameW: number,
    frameH: number,
    flipX: boolean = false
  ): { x: number; y: number; width: number; height: number } | null {
    const collider = this.hitboxLabColliders[frameId];
    if (!collider || collider.type !== "rect") return null;
    const sx = drawW / frameW;
    const sy = drawH / frameH;
    const localX = flipX ? frameW - (collider.x + collider.width) : collider.x;
    return {
      x: drawX + localX * sx,
      y: drawY + collider.y * sy,
      width: Math.max(1, collider.width * sx),
      height: Math.max(1, collider.height * sy),
    };
  }

  private getLabCircleFromFrame(
    frameId: string,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    frameW: number,
    frameH: number,
    flipX: boolean = false
  ): { cx: number; cy: number; radius: number } | null {
    const collider = this.hitboxLabColliders[frameId];
    if (!collider || collider.type !== "circle") return null;
    const sx = drawW / frameW;
    const sy = drawH / frameH;
    const localCx = flipX ? frameW - collider.cx : collider.cx;
    return {
      cx: drawX + localCx * sx,
      cy: drawY + collider.cy * sy,
      radius: Math.max(1, collider.radius * Math.min(sx, sy)),
    };
  }

  private getPufferCollisionCircle(enemy: PufferEnemy): { cx: number; cy: number; radius: number } {
    const cx = enemy.x + enemy.width / 2;
    const cy = enemy.y + enemy.height / 2;
    const fallback = { cx, cy, radius: enemy.getVisualRadius() * this.hitboxTuning.pufferRadiusScale };
    if (!this.weedsImg || !this.weedsImg.complete) return fallback;

    const cols = 4;
    const rows = 2;
    const frameW = this.weedsImg.naturalWidth / cols;
    const frameH = this.weedsImg.naturalHeight / rows;
    const visualScale = enemy.getVisualScale();
    const drawW = enemy.width * visualScale;
    const drawH = enemy.height * visualScale;
    const drawX = cx - drawW / 2;
    const drawY = cy - drawH / 2;
    const fromLab = this.getLabCircleFromFrame("puffer#0", drawX, drawY, drawW, drawH, frameW, frameH, enemy.direction < 0);
    if (!fromLab) return fallback;
    return {
      cx: fromLab.cx,
      cy: fromLab.cy,
      radius: fromLab.radius * this.hitboxTuning.pufferRadiusScale,
    };
  }

  private getLabRectWithFallback(
    sourceKey: string,
    frameIndex: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    frameW: number,
    frameH: number,
    flipX: boolean = false
  ): { x: number; y: number; width: number; height: number } | null {
    const exact = this.getLabRectFromFrame(
      `${sourceKey}#${frameIndex}`,
      drawX,
      drawY,
      drawW,
      drawH,
      frameW,
      frameH,
      flipX
    );
    if (exact) return exact;
    return this.getLabRectFromFrame(
      `${sourceKey}#0`,
      drawX,
      drawY,
      drawW,
      drawH,
      frameW,
      frameH,
      flipX
    );
  }

  private getCurrentPlayerAnimState(player: Player): PlayerAnimState {
    if (!player.grounded) {
      if (this.playerController.isCurrentlyShooting()) return "shoot";
      return player.vy > 1.2 ? "fall" : "jump";
    }
    if (Math.abs(player.vx) > 0.05) return "run";
    return "idle";
  }

  private getPlayerCollisionRect(): { x: number; y: number; width: number; height: number } {
    const p = this.playerController.getPlayer();
    const fallback = this.playerController.getRect();
    const state = this.getCurrentPlayerAnimState(p);
    const footY = p.y + p.height / 2;
    const spriteCenterY = footY - this.DIVER_DRAW_SIZE / 2 + 2 + this.hitboxTuning.playerSpriteOffsetY;
    const spriteCenterX = p.x + this.hitboxTuning.playerSpriteOffsetX;
    const drawSize = this.DIVER_DRAW_SIZE;
    const drawX = spriteCenterX - drawSize / 2;
    const drawY = spriteCenterY - drawSize / 2;
    return this.getLabRectWithFallback(
      `player_${state}`,
      this.playerAnimFrame,
      drawX,
      drawY,
      drawSize,
      drawSize,
      this.PLAYER_FRAME_W,
      this.PLAYER_FRAME_H,
      !p.facingRight
    ) ?? fallback;
  }

  private getEnemyCollisionRect(enemy: BaseEnemy): { x: number; y: number; width: number; height: number } {
    const spriteDrawRect = enemy.getSpriteDrawRect();
    const spriteFrameSize = enemy.getSpriteFrameSize();

    let sourceKey = "";
    if (enemy.type === "STATIC") sourceKey = "crab_idle";
    else if (enemy.type === "HORIZONTAL") sourceKey = "shark_walk";
    else if (enemy.type === "EXPLODER") sourceKey = "squid_walk";
    if (sourceKey && spriteDrawRect && spriteFrameSize) {
      const fromLab = this.getLabRectWithFallback(
        sourceKey,
        enemy.getAnimationFrameIndex(),
        spriteDrawRect.x,
        spriteDrawRect.y,
        spriteDrawRect.width,
        spriteDrawRect.height,
        spriteFrameSize.width,
        spriteFrameSize.height,
        enemy.direction < 0
      );
      if (fromLab) return fromLab;
    }

    let scaleX = 1;
    let scaleY = 1;
    if (enemy.type === "STATIC") {
      scaleX = this.hitboxTuning.crabScaleX;
      scaleY = this.hitboxTuning.crabScaleY;
    } else if (enemy.type === "HORIZONTAL") {
      scaleX = this.hitboxTuning.sharkScaleX;
      scaleY = this.hitboxTuning.sharkScaleY;
    } else if (enemy.type === "EXPLODER") {
      scaleX = this.hitboxTuning.squidScaleX;
      scaleY = this.hitboxTuning.squidScaleY;
    }
    const baseX = spriteDrawRect ? spriteDrawRect.x : enemy.x;
    const baseY = spriteDrawRect ? spriteDrawRect.y : enemy.y;
    const baseW = spriteDrawRect ? spriteDrawRect.width : enemy.width;
    const baseH = spriteDrawRect ? spriteDrawRect.height : enemy.height;
    const width = baseW * scaleX;
    const height = baseH * scaleY;
    return {
      x: baseX + (baseW - width) / 2,
      y: baseY + (baseH - height) / 2,
      width,
      height,
    };
  }

  private rectCircleOverlap(rect: { x: number; y: number; width: number; height: number }, cx: number, cy: number, radius: number): boolean {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= radius * radius;
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
      if (this.deathFreezeFrames > 0) {
        const player = this.playerController.getPlayer();
        const zoom = this.getDeathFreezeZoom();
        ctx.translate(player.x, player.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-player.x, -player.y);
      }
      
      // Draw platforms
      this.drawPlatforms();
      this.drawWorldDoorways();
      
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
      this.drawLaserBeams();
      
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
      if (this.debugDrawHitboxes) {
        this.drawDebugHitboxes();
      }
      this.drawPowerUpBarAbovePlayer();

      // Draw powerup effects (on top of player)
      this.drawShields();
      this.drawBlastExplosions();
      this.drawLightningChains();
      
      ctx.restore();
    } else if (this.gameState === "shop") {
      this.drawSpecialRoom();
      this.drawGems();
      this.drawBullets();
      this.drawLaserBeams();
      this.drawPlayer();
      if (this.debugDrawHitboxes) {
        this.drawDebugHitboxes();
      }
      this.drawPowerUpBarAbovePlayer();
      this.drawShields();
      this.drawBlastExplosions();
      this.drawLightningChains();
      this.drawSpecialRoomOverlay();
    }
    
    ctx.restore();

    // Draw touch zones overlay OUTSIDE the scale transform so it fills the full screen
    if ((this.gameState === "playing" || this.gameState === "shop") && this.isMobile) {
      this.drawTouchZones();
    }

    if (this.gameState === "playing" && this.WORLD_DOORWAY_DEBUG) {
      this.drawWorldDoorwayDebugOverlay();
    }
    
    // Death freeze spotlight — drawn after ALL transforms are restored, in screen space
    if (this.deathFreezeFrames > 0) {
      this.drawDeathFreezeHighlight();
    }

    // Apply dithering effect as post-process
    this.applyDithering();
  }

  private drawWorldDoorways(): void {
    const ctx = this.ctx;
    for (const doorway of this.activeWorldDoorways) {
      const roofLipPlatform: Platform = {
        x: doorway.roofLipRect.x,
        y: doorway.roofLipRect.y,
        width: doorway.roofLipRect.width,
        height: doorway.roofLipRect.height,
        isWall: false,
        breakable: false,
        oneWay: true,
        hp: 0,
        chunkIndex: -1,
      };

      const floorLipPlatform: Platform = {
        x: doorway.floorLipRect.x,
        y: doorway.floorLipRect.y,
        width: doorway.floorLipRect.width,
        height: doorway.floorLipRect.height,
        isWall: false,
        breakable: false,
        oneWay: true,
        hp: 0,
        chunkIndex: -1,
      };
      const floorLipSupport: Platform = {
        x: doorway.floorLipRect.x,
        y: doorway.floorLipRect.y + doorway.floorLipRect.height,
        width: doorway.floorLipRect.width,
        height: CONFIG.WALL_BLOCK_SIZE,
        isWall: true,
        breakable: false,
        hp: 0,
        chunkIndex: -1,
      };
      const gradientX = doorway.openingRect.x;
      const gradientY = roofLipPlatform.y + roofLipPlatform.height;
      const gradientW = doorway.openingRect.width;
      const gradientH = Math.max(0, floorLipPlatform.y - gradientY);
      if (gradientH > 0) {
        ctx.fillStyle = "#11558d";
        ctx.fillRect(gradientX, gradientY, gradientW, gradientH);
        this.drawDirectionalTunnelGradient(
          gradientX,
          gradientY,
          gradientW,
          gradientH,
          doorway.side,
          14
        );
      }
      this.drawPlatformGeometry(ctx, roofLipPlatform);
      this.drawPlatformGeometry(ctx, floorLipSupport);
      this.drawPlatformGeometry(ctx, floorLipPlatform);

      const signWidth = 64;
      const signHeight = 22;
      const signX = doorway.side === "left"
        ? doorway.openingRect.x + doorway.openingRect.width - signWidth - 4
        : doorway.openingRect.x + 4;
      const signY = doorway.openingRect.y - signHeight - 8;
      ctx.fillStyle = "rgba(122, 88, 50, 0.96)";
      ctx.fillRect(signX, signY, signWidth, signHeight);
      ctx.strokeStyle = "rgba(72, 48, 24, 0.98)";
      ctx.lineWidth = 2;
      ctx.strokeRect(signX, signY, signWidth, signHeight);
      ctx.strokeStyle = "rgba(160, 126, 84, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(signX + 3, signY + 5);
      ctx.lineTo(signX + signWidth - 3, signY + 5);
      ctx.moveTo(signX + 3, signY + signHeight - 5);
      ctx.lineTo(signX + signWidth - 3, signY + signHeight - 5);
      ctx.stroke();
      const arrowY = signY + signHeight * 0.5;
      ctx.strokeStyle = "rgba(255, 74, 74, 0.98)";
      ctx.fillStyle = "rgba(255, 74, 74, 0.98)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (doorway.side === "left") {
        ctx.moveTo(signX + signWidth - 14, arrowY);
        ctx.lineTo(signX + 18, arrowY);
      } else {
        ctx.moveTo(signX + 14, arrowY);
        ctx.lineTo(signX + signWidth - 18, arrowY);
      }
      ctx.stroke();
      ctx.beginPath();
      if (doorway.side === "left") {
        ctx.moveTo(signX + 12, arrowY);
        ctx.lineTo(signX + 22, arrowY - 6);
        ctx.lineTo(signX + 22, arrowY + 6);
      } else {
        ctx.moveTo(signX + signWidth - 12, arrowY);
        ctx.lineTo(signX + signWidth - 22, arrowY - 6);
        ctx.lineTo(signX + signWidth - 22, arrowY + 6);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawDirectionalTunnelGradient(
    x: number,
    y: number,
    width: number,
    height: number,
    side: DoorwaySide,
    transitionWidth: number
  ): void {
    const ctx = this.ctx;
    const openingGradient = side === "left"
      ? ctx.createLinearGradient(x, y, x + width, y)
      : ctx.createLinearGradient(x + width, y, x, y);
    openingGradient.addColorStop(0, "rgba(8, 24, 49, 0.24)");
    openingGradient.addColorStop(0.45, "rgba(8, 24, 49, 0.12)");
    openingGradient.addColorStop(1, "rgba(8, 24, 49, 0)");
    ctx.fillStyle = openingGradient;
    ctx.fillRect(x, y, width, height);

    const clampedTransitionWidth = Math.max(8, Math.min(width, transitionWidth));
    const tx = side === "left" ? x : x + width - clampedTransitionWidth;
    const transitionGradient = side === "left"
      ? ctx.createLinearGradient(tx, y, tx + clampedTransitionWidth, y)
      : ctx.createLinearGradient(tx + clampedTransitionWidth, y, tx, y);
    transitionGradient.addColorStop(0, "rgba(3, 10, 24, 0.2)");
    transitionGradient.addColorStop(1, "rgba(3, 10, 24, 0)");
    ctx.fillStyle = transitionGradient;
    ctx.fillRect(tx, y, clampedTransitionWidth, height);
  }

  private drawWorldDoorwayDebugOverlay(): void {
    const ctx = this.ctx;
    const player = this.playerController.getPlayer();
    const pRect = this.playerController.getRect();
    const nearest = this.activeWorldDoorways.reduce<WorldDoorway | null>((best, doorway) => {
      if (!best) return doorway;
      const bestDy = Math.abs((best.openingRect.y + best.openingRect.height * 0.5) - player.y);
      const nextDy = Math.abs((doorway.openingRect.y + doorway.openingRect.height * 0.5) - player.y);
      return nextDy < bestDy ? doorway : best;
    }, null);

    const infoLines = [
      `[WorldDoorways] count: ${this.activeWorldDoorways.length}`,
      nearest
        ? `[WorldDoorways] nearest idx ${nearest.index} ${nearest.side} ${nearest.roomType}`
        : "[WorldDoorways] nearest: n/a",
      nearest
        ? `[WorldDoorways] overlap: ${this.isRectOverlapping(pRect, nearest.enterTriggerRect)}`
        : "[WorldDoorways] overlap: false",
    ];

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(8, 8, 268, infoLines.length * 16 + 12);
    ctx.fillStyle = "#d3edff";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < infoLines.length; i++) {
      ctx.fillText(infoLines[i], 14, 14 + i * 16);
    }
    ctx.restore();
  }

  private drawSpecialRoom(): void {
    const ctx = this.ctx;
    const left = this.SHOP_ROOM_LEFT;
    const right = this.SHOP_ROOM_RIGHT;
    const top = this.SHOP_ROOM_TOP;
    const bottom = this.SHOP_ROOM_BOTTOM;
    const entrance = this.getSpecialRoomEntranceRect(this.currentRoomEntranceSide);
    const wallThickness = CONFIG.WALL_BLOCK_SIZE;

    const wallSegments: Platform[] = [];
    const addWall = (x: number, y: number, width: number, height: number): void => {
      if (width <= 0 || height <= 0) return;
      wallSegments.push({
        x,
        y,
        width,
        height,
        isWall: true,
        breakable: false,
        hp: 0,
        chunkIndex: -1,
      });
    };

    addWall(left, top, right - left, wallThickness);
    addWall(left, bottom - wallThickness, right - left, wallThickness);

    const fullVerticalHeight = bottom - top;
    if (this.currentRoomEntranceSide === "left") {
      addWall(left, top, wallThickness, entrance.y - top);
      addWall(left, entrance.y + entrance.height, wallThickness, bottom - (entrance.y + entrance.height));
      addWall(right - wallThickness, top, wallThickness, fullVerticalHeight);
    } else {
      addWall(left, top, wallThickness, fullVerticalHeight);
      addWall(right - wallThickness, top, wallThickness, entrance.y - top);
      addWall(right - wallThickness, entrance.y + entrance.height, wallThickness, bottom - (entrance.y + entrance.height));
    }

    if (this.isShopTestRoomActive()) {
      const lowerPlatform = this.getShopTestLowerPlatformRect();
      addWall(lowerPlatform.x, lowerPlatform.y, lowerPlatform.width, lowerPlatform.height);
    }

    for (const wall of wallSegments) {
      this.drawPlatformGeometry(ctx, wall);
    }

    if (this.isShopTestRoomActive() && !this.shopTestBreakableDestroyed) {
      const breakable = this.getShopTestBreakableRect();
      this.drawPlatformGeometry(ctx, {
        x: breakable.x,
        y: breakable.y,
        width: breakable.width,
        height: breakable.height,
        isWall: true,
        breakable: true,
        hp: 1,
        chunkIndex: -1,
      });
    }

    // Tunnel styling inside shop: flat strips (same style as outside tunnel).
    const interiorTunnelX = this.currentRoomEntranceSide === "left"
      ? Math.max(0, left - this.ROOM_CORRIDOR_DEPTH)
      : right;
    const interiorTunnelY = entrance.y;
    const interiorTunnelW = this.ROOM_CORRIDOR_DEPTH;
    const interiorTunnelH = entrance.height;
    const interiorTunnelRoof: Platform = {
      x: interiorTunnelX,
      y: interiorTunnelY - 6,
      width: interiorTunnelW,
      height: 6,
      isWall: false,
      breakable: false,
      hp: 0,
      chunkIndex: -1,
      oneWay: true,
    };
    const interiorTunnelFloor: Platform = {
      x: interiorTunnelX,
      y: interiorTunnelY + interiorTunnelH - 6 - CONFIG.WALL_BLOCK_SIZE,
      width: interiorTunnelW,
      height: 6,
      isWall: false,
      breakable: false,
      hp: 0,
      chunkIndex: -1,
      oneWay: true,
    };
    const interiorTunnelFloorSupport: Platform = {
      x: interiorTunnelX,
      y: interiorTunnelFloor.y + interiorTunnelFloor.height,
      width: interiorTunnelW,
      height: CONFIG.WALL_BLOCK_SIZE,
      isWall: true,
      breakable: false,
      hp: 0,
      chunkIndex: -1,
    };
    const gradientY = interiorTunnelRoof.y + interiorTunnelRoof.height;
    const gradientH = Math.max(0, interiorTunnelFloor.y - gradientY);
    if (gradientH > 0) {
      ctx.fillStyle = "#11558d";
      ctx.fillRect(interiorTunnelX, gradientY, interiorTunnelW, gradientH);
      this.drawDirectionalTunnelGradient(
        interiorTunnelX,
        gradientY,
        interiorTunnelW,
        gradientH,
        this.currentRoomEntranceSide,
        14
      );
    }
    this.drawPlatformGeometry(ctx, interiorTunnelRoof);
    this.drawPlatformGeometry(ctx, interiorTunnelFloorSupport);
    this.drawPlatformGeometry(ctx, interiorTunnelFloor);

    if (this.currentRoomType === "powerup" && this.roomPowerupPickup && !this.roomPowerupPickup.collected) {
      this.drawSinglePowerUpOrb(
        this.roomPowerupPickup.x,
        this.roomPowerupPickup.y,
        this.roomPowerupPickup.type,
        this.roomPowerupPickup.glowPhase,
        true
      );
    }

    // Draw items
    for (const item of this.roomItems) {
      const isChestDisplay = this.currentRoomType === "chest" && item.id === "chest_cache";
      if (isChestDisplay) {
        this.drawShopItemIcon(item);
        continue;
      }

      const glow = ctx.createRadialGradient(
        item.rect.x + item.rect.width / 2,
        item.rect.y + item.rect.height / 2,
        6,
        item.rect.x + item.rect.width / 2,
        item.rect.y + item.rect.height / 2,
        26
      );
      glow.addColorStop(0, item.soldOut ? "rgba(120, 120, 120, 0.3)" : "rgba(255, 220, 140, 0.5)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height / 2, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = item.soldOut ? "rgba(120, 120, 120, 0.9)" : "rgba(252, 206, 96, 0.96)";
      ctx.fillRect(item.rect.x, item.rect.y, item.rect.width, item.rect.height);
      this.drawShopItemIcon(item);
      ctx.strokeStyle = item.id === this.selectedRoomItemId ? "rgba(255,255,255,0.9)" : "rgba(255, 240, 190, 0.65)";
      ctx.lineWidth = item.id === this.selectedRoomItemId ? 2.4 : 1.4;
      ctx.strokeRect(item.rect.x, item.rect.y, item.rect.width, item.rect.height);
    }

  }

  private drawShopItemIcon(item: RoomItem): void {
    const ctx = this.ctx;
    const iconPadding = 8;
    const iconSize = Math.max(10, Math.min(item.rect.width, item.rect.height) - iconPadding * 2);
    const iconX = item.rect.x + (item.rect.width - iconSize) / 2;
    const iconY = item.rect.y + (item.rect.height - iconSize) / 2;
    const alpha = item.soldOut ? 0.45 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (item.id === "hp_up" && this.shopHpIconImg && this.shopHpIconImg.complete) {
      ctx.drawImage(this.shopHpIconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if ((item.id === "ammo_up" || item.id === "deep_tank") && this.shopAmmoIconImg && this.shopAmmoIconImg.complete) {
      ctx.drawImage(this.shopAmmoIconImg, iconX, iconY, iconSize, iconSize);
      if (item.id === "deep_tank") {
        ctx.fillStyle = "rgba(255, 246, 210, 0.98)";
        ctx.strokeStyle = "rgba(14, 24, 38, 0.95)";
        ctx.lineWidth = 2;
        ctx.font = "7px 'Press Start 2P'";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        const tx = iconX + iconSize - 1;
        const ty = iconY + iconSize - 1;
        ctx.strokeText("2x", tx, ty);
        ctx.fillText("2x", tx, ty);
      }
      ctx.restore();
      return;
    }

    if (item.id === "stomp_reload" && this.shopUtilityIconImg && this.shopUtilityIconImg.complete) {
      const frameSize = Math.min(this.shopUtilityIconImg.naturalHeight, this.shopUtilityIconImg.naturalWidth);
      ctx.drawImage(
        this.shopUtilityIconImg,
        0,
        0,
        frameSize,
        frameSize,
        iconX,
        iconY,
        iconSize,
        iconSize
      );
      ctx.restore();
      return;
    }

    if (item.id === "rapid_chamber" && this.shopRapidIconImg && this.shopRapidIconImg.complete) {
      ctx.drawImage(this.shopRapidIconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if (item.id === "vampiric_gel" && this.shopVampiricIconImg && this.shopVampiricIconImg.complete) {
      ctx.drawImage(this.shopVampiricIconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if (item.id === "salvage_bonus" && this.shopSalvageIconImg && this.shopSalvageIconImg.complete) {
      ctx.drawImage(this.shopSalvageIconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if (item.id === "chest_cache" && this.chestIconImg && this.chestIconImg.complete) {
      ctx.drawImage(this.chestIconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if (item.id === "powerup_cache" && item.rewardPowerupType) {
      ctx.fillStyle = POWERUP_INFO[item.rewardPowerupType].color;
      ctx.beginPath();
      ctx.arc(item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height / 2, iconSize * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Fallback if icon is missing
    ctx.fillStyle = "rgba(40, 28, 10, 0.88)";
    ctx.beginPath();
    ctx.arc(item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height / 2, iconSize * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private getShopKioskExplainer(item: RoomItem): string {
    switch (item.id) {
      case "hp_up":
        return "+1 max HP, heal +1";
      case "ammo_up":
        return "+1 max ammo, +1 ammo";
      case "stomp_reload":
        return "Stomp reloads +1 ammo";
      case "deep_tank":
        return "+2 max ammo, +2 ammo";
      case "vampiric_gel":
        return "5% chance to drop a heart";
      case "salvage_bonus":
        return "Breakables can drop gems";
      case "rapid_chamber":
        return "Faster airborne fire";
      case "chest_cache":
        return "Open for gem burst";
      default:
        return "";
    }
  }

  private drawSpecialRoomOverlay(): void {
    if (this.currentRoomType === "powerup") return;

    const ctx = this.ctx;
    const selected = this.roomItems.find((item) => item.id === this.selectedRoomItemId) ?? null;

    const wallClearance = CONFIG.WALL_BLOCK_SIZE + 10;
    const popupLeft = this.SHOP_ROOM_LEFT + wallClearance;
    const popupRight = this.SHOP_ROOM_RIGHT - wallClearance;
    const popupMaxWidth = Math.max(120, popupRight - popupLeft);

    if (this.currentRoomType === "chest") {
      if (!selected || selected.id !== "chest_cache") return;
      const panelWidth = Math.min(244, popupMaxWidth);
      const panelHeight = 42;
      const panelX = popupLeft + (popupMaxWidth - panelWidth) * 0.5;
      const panelY = this.SHOP_ROOM_TOP + 38;
      ctx.fillStyle = "rgba(6, 22, 40, 0.9)";
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.strokeStyle = "rgba(180, 235, 255, 0.82)";
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
      ctx.fillStyle = "rgba(235, 248, 255, 0.98)";
      ctx.font = "8px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const msg = selected.soldOut ? "CHEST OPENED" : "OPEN CHEST WITH SHOOT BUTTON!";
      ctx.fillText(msg, panelX + panelWidth * 0.5, panelY + panelHeight * 0.5 + 1);
      return;
    }

    const panelWidth = Math.min(236, popupMaxWidth);
    const panelHeight = selected ? (selected.cost > 0 ? 96 : 104) : 40;
    const shakeX = this.roomNoFundsTimer > 0 ? Math.sin(this.frameCount * 0.85) * 4 : 0;
    const panelX = popupLeft + (popupMaxWidth - panelWidth) * 0.5 + shakeX;
    const panelY = this.SHOP_ROOM_TOP + 48;
    const rightInset = 10;

    const fitText = (text: string, maxWidth: number): string => {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let out = text;
      while (out.length > 3 && ctx.measureText(`${out}...`).width > maxWidth) {
        out = out.slice(0, -1);
      }
      return `${out}...`;
    };
    const wrapText = (text: string, maxWidth: number, maxLines: number): string[] => {
      const words = text.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) return [""];
      const lines: string[] = [];
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const candidate = `${current} ${words[i]}`;
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          lines.push(current);
          current = words[i];
          if (lines.length >= maxLines - 1) break;
        }
      }
      const usedWordCount = lines.join(" ").split(/\s+/).filter((w) => w.length > 0).length;
      const remainingWords = words.slice(usedWordCount);
      let lastLine = remainingWords.join(" ");
      if (ctx.measureText(lastLine).width > maxWidth) {
        while (lastLine.length > 3 && ctx.measureText(`${lastLine}...`).width > maxWidth) {
          lastLine = lastLine.slice(0, -1);
        }
        lastLine = `${lastLine}...`;
      }
      lines.push(lastLine);
      return lines.slice(0, maxLines);
    };

    ctx.fillStyle = "rgba(6, 22, 40, 0.88)";
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = "rgba(180, 235, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.fillStyle = "#ff7ad9";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "10px 'Press Start 2P'";
    if (this.gemSimpleImg && this.gemSimpleImg.complete) {
      ctx.drawImage(this.gemSimpleImg, panelX + 10, panelY + 8, 12, 12);
    }
    ctx.fillText(`x ${this.gems}`, panelX + 26, panelY + 14);

    if (!selected) {
      ctx.fillStyle = "rgba(210, 236, 255, 0.92)";
      ctx.fillText("STEP ON A KIOSK", panelX + 10, panelY + 30);
      return;
    }

    ctx.fillStyle = "rgba(235, 248, 255, 0.98)";
    ctx.font = "9px 'Press Start 2P'";
    ctx.fillText(fitText(selected.name, panelWidth - 20), panelX + 10, panelY + 30);
    ctx.fillStyle = "rgba(192, 230, 255, 0.95)";
    const explainer = this.getShopKioskExplainer(selected);
    const explainerText = explainer.length > 0 ? explainer.toUpperCase() : selected.description.toUpperCase();
    const explainerLines = wrapText(explainerText, panelWidth - 20, 2);
    for (let i = 0; i < explainerLines.length; i++) {
      ctx.fillText(explainerLines[i], panelX + 10, panelY + 44 + i * 10);
    }
    const infoBottomY = panelY + 44 + (explainerLines.length - 1) * 10;
    const costRowY = infoBottomY + 13;
    const actionRowY = selected.cost <= 0 ? costRowY + 12 : costRowY;

    if (selected.cost > 0) {
      if (this.gemSimpleImg && this.gemSimpleImg.complete) {
        ctx.drawImage(this.gemSimpleImg, panelX + 10, costRowY - 6, 12, 12);
      }
      ctx.fillStyle = "rgba(255, 232, 160, 0.98)";
      ctx.fillText(`x ${selected.cost}`, panelX + 26, costRowY);
    }

    if (selected.soldOut) {
      ctx.fillStyle = "rgba(255, 190, 110, 0.95)";
      ctx.fillText("SOLD OUT", panelX + panelWidth - 96, costRowY);
    } else if (selected.cost <= 0 || this.gems >= selected.cost) {
      ctx.fillStyle = "rgba(200, 255, 210, 0.95)";
      const actionLabel = selected.id === "chest_cache"
        ? "OPEN"
        : selected.id === "powerup_cache"
          ? "CLAIM"
          : "PRESS ACTION";
      const actionText = selected.cost <= 0 ? `PRESS ACTION: ${actionLabel}` : actionLabel;
      const actionWidth = ctx.measureText(actionText).width;
      const actionX = Math.max(panelX + 10, panelX + panelWidth - actionWidth - rightInset);
      ctx.fillText(actionText, actionX, actionRowY);
    } else {
      ctx.fillStyle = "rgba(255, 120, 120, 0.95)";
      const msg = this.roomNoFundsTimer > 0 ? "NOT ENOUGH GEMS" : "INSUFFICIENT GEMS";
      ctx.fillText(msg, panelX + panelWidth - 164, costRowY);
    }
  }

  private drawDeathFreezeHighlight(): void {
    const ctx = this.ctx;
    const p = this.playerController.getPlayer();
    const k = this.deathFreezeKiller;
    const freezeProgress =
      (this.DEATH_FREEZE_DURATION_FRAMES - this.deathFreezeFrames) /
      this.DEATH_FREEZE_DURATION_FRAMES;
    const pulse = 0.65 + Math.sin(this.frameCount * 0.2) * 0.35;
    const zoom = this.getDeathFreezeZoom();

    // Convert a game-space point to canvas buffer pixel coordinates.
    // Must account for the death-freeze zoom applied around the player.
    const toScreen = (gx: number, gy: number) => {
      const zx = (gx - p.x) * zoom + p.x;
      const zy = (gy - p.y) * zoom + p.y;
      return {
        x: (zx + this.screenShakeX) * this.scale + this.offsetX,
        y: (zy - this.cameraY + this.screenShakeY) * this.scale + this.offsetY,
      };
    };

    const diverRadius = Math.max(this.DIVER_DRAW_SIZE * 0.46, Math.max(p.width, p.height) + 16);
    const threatRadius = 36;
    let focusX = p.x;
    let focusY = p.y;
    let focusRadius = diverRadius + 26;

    if (k) {
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      const dist = Math.hypot(dx, dy);
      focusX = (p.x + k.x) * 0.5;
      focusY = (p.y + k.y) * 0.5;
      focusRadius = Math.max(52, dist * 0.5 + Math.max(diverRadius, threatRadius) + 16);
    }

    const sf = toScreen(focusX, focusY);
    const screenRadius = focusRadius * zoom * this.scale;

    ctx.save();

    // Full-canvas darkness with spotlight cutout, covering letterbox strips too
    ctx.fillStyle = `rgba(4, 12, 22, ${0.55 + freezeProgress * 0.25})`;
    ctx.beginPath();
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    ctx.arc(sf.x, sf.y, screenRadius, 0, Math.PI * 2);
    ctx.fill("evenodd");

    // Dashed outline ring
    const outlineRadius = screenRadius + pulse * 2.1 * this.scale;
    const dash = 5 * this.scale;
    const gap = 7 * this.scale;
    const pattern = dash + gap;
    const dashOffset = -((this.frameCount * 0.8) % pattern);
    ctx.strokeStyle = "rgba(255, 235, 190, 0.92)";
    ctx.lineWidth = 2.4 * this.scale;
    ctx.lineCap = "round";
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    ctx.arc(sf.x, sf.y, outlineRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Phase-shifted second pass hides the seam
    ctx.strokeStyle = "rgba(255, 245, 210, 0.42)";
    ctx.lineDashOffset = dashOffset - pattern * 0.5;
    ctx.beginPath();
    ctx.arc(sf.x, sf.y, outlineRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = "butt";

    ctx.restore();
  }
  
  private drawMenuBackground(): void {
    const ctx = this.ctx;

    const crabScale = 0.95;
    const crabW = 96 * crabScale;
    const crabH = 96 * crabScale;
    const crabX = CONFIG.INTERNAL_WIDTH / 2 - crabW / 2;
    // Push characters to the very bottom so they don't overlap HTML text
    const crabY = CONFIG.INTERNAL_HEIGHT - crabH + 10;
    
    // Draw bobbing character above the crab
    if (this.playerAnimLoaded.idle && this.playerAnimImages.idle) {
      const diverX = CONFIG.INTERNAL_WIDTH / 2;
      const bobY = crabY - 18 + Math.sin(this.frameCount * 0.03) * 4;
      // Gentle tilt with the bob
      const tilt = Math.sin(this.frameCount * 0.03 + 0.5) * 0.08;
      this.drawSharedDiver(ctx, diverX, bobY, { tilt, faceRight: true, scale: 1, state: "idle", animate: true });
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

  private drawSharedDiver(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    opts?: { tilt?: number; faceRight?: boolean; scale?: number; state?: PlayerAnimState; animate?: boolean }
  ): void {
    const tilt = opts?.tilt ?? 0;
    const faceRight = opts?.faceRight ?? false;
    const scale = opts?.scale ?? 1;
    const state = opts?.state ?? "idle";
    const animate = opts?.animate ?? true;
    const anim = this.PLAYER_ANIMS[state];
    const sheet = this.playerAnimImages[state];
    if (!sheet || !this.playerAnimLoaded[state]) return;

    if (this.playerAnimState !== state) {
      this.playerAnimState = state;
      this.playerAnimFrame = 0;
      this.playerAnimTimer = 0;
    }
    if (animate) {
      this.playerAnimTimer += anim.speed;
      if (this.playerAnimTimer >= 1) {
        this.playerAnimTimer = 0;
        this.playerAnimFrame = (this.playerAnimFrame + 1) % anim.frames;
      }
    }
    const frame = animate ? this.playerAnimFrame : 0;
    const sx = frame * this.PLAYER_FRAME_W;
    const sy = 0;
    const drawSize = this.DIVER_DRAW_SIZE * scale;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(tilt);
    if (!faceRight) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      sheet,
      sx,
      sy,
      this.PLAYER_FRAME_W,
      this.PLAYER_FRAME_H,
      -drawSize / 2,
      -drawSize / 2,
      drawSize,
      drawSize
    );
    ctx.restore();
  }
  
  private drawPlatforms(): void {
    const ctx = this.ctx;
    const visibleChunkSet = new Set<number>();
    for (const platform of this.activePlatforms) {
      if (!platform.oneWay) {
        visibleChunkSet.add(platform.chunkIndex);
      }
    }

    for (const chunkIndex of visibleChunkSet) {
      const cache = this.getChunkPlatformCache(chunkIndex);
      ctx.drawImage(cache.canvas, 0, chunkIndex * CONFIG.CHUNK_HEIGHT);
    }

    // One-way strips are dynamic and inexpensive, so keep immediate rendering.
    for (const platform of this.activePlatforms) {
      if (!platform.oneWay) continue;
      this.drawPlatformGeometry(ctx, platform);
    }
  }

  private getChunkPlatformCache(chunkIndex: number): ChunkPlatformCache {
    let cache = this.chunkPlatformCache.get(chunkIndex);
    if (!cache) {
      const canvas = document.createElement("canvas");
      canvas.width = CONFIG.INTERNAL_WIDTH;
      canvas.height = CONFIG.CHUNK_HEIGHT;
      const cacheCtx = canvas.getContext("2d");
      if (!cacheCtx) {
        throw new Error("Failed to create chunk platform cache context");
      }
      cacheCtx.imageSmoothingEnabled = false;
      cache = { canvas, ctx: cacheCtx, dirty: true };
      this.chunkPlatformCache.set(chunkIndex, cache);
    }
    if (cache.dirty) {
      this.redrawChunkPlatformCache(chunkIndex, cache);
    }
    return cache;
  }

  private redrawChunkPlatformCache(chunkIndex: number, cache: ChunkPlatformCache): void {
    const chunk = this.levelSpawner.getChunk(chunkIndex);
    cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
    cache.ctx.save();
    cache.ctx.translate(0, -chunkIndex * CONFIG.CHUNK_HEIGHT);
    for (const platform of chunk.platforms) {
      if (platform.oneWay) continue;
      this.drawPlatformGeometry(cache.ctx, platform);
    }
    cache.ctx.restore();
    cache.dirty = false;
  }

  private drawPlatformGeometry(ctx: CanvasRenderingContext2D, platform: Platform): void {
    const BLOCK_SIZE = 32;
    const blocksX = Math.ceil(platform.width / BLOCK_SIZE);
    const blocksY = Math.ceil(platform.height / BLOCK_SIZE);
    const isBreakable = platform.breakable && !platform.oneWay;

    if (
      !this.wallTileLeftImg?.complete ||
      !this.wallTileCenterImg?.complete ||
      !this.wallTileRightImg?.complete ||
      !this.platformTopAImg?.complete ||
      !this.platformTopBImg?.complete ||
      !this.platformBottomImg?.complete ||
      !this.platformFillImg?.complete ||
      !this.wallBreakableTileImg?.complete
    ) {
      // Tile-only pipeline: avoid procedural fallback.
      return;
    }

    const drawTile = (img: HTMLImageElement, x: number, y: number, w: number, h: number, quarterTurns: number): void => {
      // For partial edge tiles, crop source proportionally to avoid squashing.
      if (quarterTurns === 0) {
        const sw = Math.max(1, Math.floor((w / BLOCK_SIZE) * img.naturalWidth));
        const sh = Math.max(1, Math.floor((h / BLOCK_SIZE) * img.naturalHeight));
        ctx.drawImage(img, 0, 0, sw, sh, x, y, w, h);
        return;
      }
      if (w !== BLOCK_SIZE || h !== BLOCK_SIZE) {
        // Rotation only for full-size cells; partial cells are cropped non-rotated.
        const sw = Math.max(1, Math.floor((w / BLOCK_SIZE) * img.naturalWidth));
        const sh = Math.max(1, Math.floor((h / BLOCK_SIZE) * img.naturalHeight));
        ctx.drawImage(img, 0, 0, sw, sh, x, y, w, h);
        return;
      }
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((Math.PI / 2) * quarterTurns);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    };

    for (let bx = 0; bx < blocksX; bx++) {
      for (let by = 0; by < blocksY; by++) {
        const blockX = platform.x + bx * BLOCK_SIZE;
        const blockY = platform.y + by * BLOCK_SIZE;
        const blockW = Math.min(BLOCK_SIZE, platform.x + platform.width - blockX);
        const blockH = Math.min(BLOCK_SIZE, platform.y + platform.height - blockY);

        let tile: HTMLImageElement;
        let rotation = 0;
        if (isBreakable) {
          // Deterministic 90-degree rotation for visual variety while keeping one texture family.
          const cx = Math.floor(blockX / BLOCK_SIZE);
          const cy = Math.floor(blockY / BLOCK_SIZE);
          rotation = Math.abs((cx * 73856093) ^ (cy * 19349663)) % 4;
          tile = this.wallBreakableTileImg;
        } else if (platform.isWall) {
          // Left-most column uses LEFT tile, right-most column uses RIGHT tile.
          // This removes the vertical seam on the inner edge of right-side walls.
          if (bx === 0) {
            tile = this.wallTileLeftImg;
          } else if (bx === blocksX - 1) {
            tile = this.wallTileRightImg;
          } else {
            tile = this.wallTileCenterImg;
          }
        } else {
          // Flat/non-wall solids: use top strip + center fill + bottom cap.
          if (by === 0) {
            const cx = Math.floor(blockX / BLOCK_SIZE);
            tile = (cx % 2 === 0) ? this.platformTopAImg : this.platformTopBImg;
          } else if (by === blocksY - 1) {
            tile = this.platformBottomImg;
          } else {
            tile = this.platformFillImg;
          }
        }

        drawTile(tile, blockX, blockY, blockW, blockH, rotation);
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
    
    // Display height target (smaller than before); width follows aspect ratio.
    const targetDrawHeight = 44;
    // Most weed sprites have transparent pixels at the bottom; sink slightly
    // so the visible base appears seated on the platform top.
    const weedGroundSink = 5;
    
    for (const weed of this.activeWeeds) {
      // Hard guard to prevent any fish-like sheet entries from rendering
      // in existing chunks generated before sprite filtering changes.
      if (weed.spriteIndex === 3 || weed.spriteIndex === 4 || weed.spriteIndex === 6) continue;

      const weedKey = this.getWeedKey(weed);
      const col = weed.spriteIndex % cols;
      const row = Math.floor(weed.spriteIndex / cols);
      
      const sx = col * spriteW;
      const sy = row * spriteH;
      
      ctx.save();
      
      // Position weed: centered on the wall edge, bottom aligned to top of ledge
      const drawH = targetDrawHeight;
      const drawW = Math.max(1, Math.round((spriteW / spriteH) * drawH));
      const drawX = weed.x - drawW / 2;
      // Bottom of sprite sits on top of the platform surface
      const drawY = weed.y - drawH + weedGroundSink;
      
      // Flip if needed
      if (weed.flipX) {
        ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
        ctx.scale(-1, 1);
        ctx.translate(-(drawX + drawW / 2), -(drawY + drawH / 2));
      }

      if (this.stompedWeeds.has(weedKey)) {
        // Tint only the sprite draw call to red; avoid rectangular overlay artifacts.
        ctx.filter = "brightness(0.7) sepia(1) saturate(6) hue-rotate(-35deg)";
      }
      
      ctx.drawImage(
        this.weedsImg,
        sx, sy, spriteW, spriteH,
        drawX, drawY, drawW, drawH
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
      
      if (this.gemSimpleImg && this.gemSimpleLoaded) {
        ctx.save();
        ctx.translate(gem.x, gem.y + bobY);
        ctx.rotate(spin * 0.25);
        ctx.drawImage(
          this.gemSimpleImg,
          -gem.width / 2,
          -gem.height / 2,
          gem.width,
          gem.height
        );
        ctx.restore();
      } else {
        // Fallback diamond if sprite is unavailable
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
    }

    for (const gem of this.droppedGems) {
      if (gem.collected) continue;

      if (this.isHeartPickup(gem)) {
        const heartIcon = this.shopVampiricIconImg ?? this.shopHpIconImg;
        if (heartIcon && heartIcon.complete) {
          this.ctx.drawImage(
            heartIcon,
            gem.x - gem.width / 2,
            gem.y - gem.height / 2,
            gem.width,
            gem.height
          );
        } else {
          ctx.save();
          ctx.translate(gem.x, gem.y);
          ctx.fillStyle = "rgba(255, 122, 150, 0.95)";
          ctx.beginPath();
          ctx.moveTo(0, gem.height * 0.36);
          ctx.bezierCurveTo(-gem.width * 0.6, -gem.height * 0.1, -gem.width * 0.5, -gem.height * 0.55, 0, -gem.height * 0.22);
          ctx.bezierCurveTo(gem.width * 0.5, -gem.height * 0.55, gem.width * 0.6, -gem.height * 0.1, 0, gem.height * 0.36);
          ctx.fill();
          ctx.restore();
        }
        continue;
      }

      const sprite = gem.isLarge ? this.gemOutlinedImg : this.gemSimpleImg;
      const spriteLoaded = gem.isLarge ? this.gemOutlinedLoaded : this.gemSimpleLoaded;
      if (sprite && spriteLoaded) {
        ctx.drawImage(
          sprite,
          gem.x - gem.width / 2,
          gem.y - gem.height / 2,
          gem.width,
          gem.height
        );
      } else {
        ctx.save();
        ctx.fillStyle = gem.isLarge ? "#ffea7a" : "#ffd84a";
        ctx.beginPath();
        ctx.moveTo(gem.x, gem.y - gem.height / 2);
        ctx.lineTo(gem.x + gem.width / 2, gem.y);
        ctx.lineTo(gem.x, gem.y + gem.height / 2);
        ctx.lineTo(gem.x - gem.width / 2, gem.y);
        ctx.closePath();
        ctx.fill();
        if (gem.isLarge) {
          ctx.strokeStyle = "rgba(255, 255, 220, 0.9)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }
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

  private getWeedCollisionRect(weed: Weed): { x: number; y: number; width: number; height: number } {
    // Match collision to rendered weed footprint instead of a fixed 20x20 box.
    const targetDrawHeight = 44;
    const weedGroundSink = 5;
    if (this.weedsImg && this.weedsImg.complete) {
      const cols = 4;
      const rows = 2;
      const spriteW = this.weedsImg.naturalWidth / cols;
      const spriteH = this.weedsImg.naturalHeight / rows;
      const drawH = targetDrawHeight;
      const drawW = Math.max(1, Math.round((spriteW / spriteH) * drawH));
      const drawX = weed.x - drawW / 2;
      const drawY = weed.y - drawH + weedGroundSink;
      const fromLab = this.getLabRectWithFallback("weed_decor", weed.spriteIndex, drawX, drawY, drawW, drawH, spriteW, spriteH, !!weed.flipX);
      if (fromLab) return fromLab;
      const padX = Math.round(drawW * this.hitboxTuning.weedPadXRatio);
      const padTop = Math.round(drawH * this.hitboxTuning.weedPadTopRatio);
      const trimBottom = Math.round(drawH * this.hitboxTuning.weedTrimBottomRatio);
      return {
        x: drawX + padX,
        y: drawY + padTop,
        width: Math.max(8, drawW - padX * 2),
        height: Math.max(10, drawH - padTop - trimBottom),
      };
    }

    return {
      x: weed.x - 12,
      y: weed.y - 30,
      width: 24,
      height: 30,
    };
  }

  private drawDebugHitboxes(): void {
    const ctx = this.ctx;
    const playerRect = this.getPlayerCollisionRect();
    ctx.save();
    ctx.font = "9px monospace";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 1.2;

    // Player hitbox
    ctx.strokeStyle = "rgba(40, 255, 120, 0.95)";
    ctx.fillStyle = "rgba(40, 255, 120, 0.1)";
    ctx.fillRect(playerRect.x, playerRect.y, playerRect.width, playerRect.height);
    ctx.strokeRect(playerRect.x, playerRect.y, playerRect.width, playerRect.height);
    ctx.fillStyle = "rgba(40, 255, 120, 0.95)";
    ctx.fillText("PLAYER", playerRect.x, playerRect.y - 2);
    ctx.fillStyle = "rgba(180, 235, 255, 0.95)";
    ctx.fillText(`LAB ${this.hitboxLabLoadedCount}`, 8, 12);

    // Enemy hitboxes
    ctx.strokeStyle = "rgba(255, 90, 90, 0.95)";
    ctx.fillStyle = "rgba(255, 90, 90, 0.1)";
    for (const enemy of this.activeEnemies) {
      if (enemy instanceof PufferEnemy) {
        const { cx, cy, radius } = this.getPufferCollisionCircle(enemy);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 90, 90, 0.95)";
        ctx.fillText("PUFFER", cx - radius, cy - radius - 2);
        ctx.fillStyle = "rgba(255, 90, 90, 0.1)";
      } else {
        const rect = this.getEnemyCollisionRect(enemy);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = "rgba(255, 90, 90, 0.95)";
        ctx.fillText(enemy.type, rect.x, rect.y - 2);
        ctx.fillStyle = "rgba(255, 90, 90, 0.1)";
      }
    }

    // Weed hitboxes (matches collision logic)
    ctx.strokeStyle = "rgba(255, 210, 40, 0.95)";
    ctx.fillStyle = "rgba(255, 210, 40, 0.1)";
    for (const weed of this.activeWeeds) {
      const rect = this.getWeedCollisionRect(weed);
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.fillStyle = "rgba(255, 210, 40, 0.95)";
      ctx.fillText("WEED", rect.x, rect.y - 2);
      ctx.fillStyle = "rgba(255, 210, 40, 0.1)";
    }

    this.drawDebugTunnelColliders(ctx);

    ctx.restore();
  }

  private drawDebugTunnelColliders(ctx: CanvasRenderingContext2D): void {
    // World doorway collider visualization
    if (this.gameState === "playing") {
      for (const doorway of this.activeWorldDoorways) {
        ctx.strokeStyle = "rgba(120, 210, 255, 0.95)";
        ctx.fillStyle = "rgba(120, 210, 255, 0.08)";
        ctx.fillRect(
          doorway.openingRect.x,
          doorway.openingRect.y,
          doorway.openingRect.width,
          doorway.openingRect.height
        );
        ctx.strokeRect(
          doorway.openingRect.x,
          doorway.openingRect.y,
          doorway.openingRect.width,
          doorway.openingRect.height
        );
        ctx.fillStyle = "rgba(120, 210, 255, 0.95)";
        ctx.fillText(
          `TUN ${doorway.side.toUpperCase()} ${doorway.roomType.toUpperCase()}`,
          doorway.openingRect.x + 2,
          doorway.openingRect.y - 2
        );

        ctx.strokeStyle = "rgba(255, 120, 220, 0.98)";
        ctx.fillStyle = "rgba(255, 120, 220, 0.12)";
        ctx.fillRect(
          doorway.enterTriggerRect.x,
          doorway.enterTriggerRect.y,
          doorway.enterTriggerRect.width,
          doorway.enterTriggerRect.height
        );
        ctx.strokeRect(
          doorway.enterTriggerRect.x,
          doorway.enterTriggerRect.y,
          doorway.enterTriggerRect.width,
          doorway.enterTriggerRect.height
        );
        ctx.fillStyle = "rgba(255, 120, 220, 0.98)";
        ctx.fillText("TRIGGER", doorway.enterTriggerRect.x + 2, doorway.enterTriggerRect.y - 2);

        ctx.strokeStyle = "rgba(180, 255, 120, 0.95)";
        ctx.strokeRect(
          doorway.roofLipRect.x,
          doorway.roofLipRect.y,
          doorway.roofLipRect.width,
          doorway.roofLipRect.height
        );
        ctx.strokeRect(
          doorway.floorLipRect.x,
          doorway.floorLipRect.y,
          doorway.floorLipRect.width,
          doorway.floorLipRect.height
        );
      }
      return;
    }

    // Room corridor collider visualization
    if (this.gameState === "shop") {
      const entrance = this.getSpecialRoomEntranceRect(this.currentRoomEntranceSide);
      const corridorX = this.currentRoomEntranceSide === "left"
        ? Math.max(0, this.SHOP_ROOM_LEFT - this.ROOM_CORRIDOR_DEPTH)
        : this.SHOP_ROOM_RIGHT;
      const corridorY = entrance.y;
      const corridorW = this.ROOM_CORRIDOR_DEPTH;
      const corridorH = entrance.height;
      const roofY = corridorY - 6;
      const floorY = corridorY + corridorH - 6 - CONFIG.WALL_BLOCK_SIZE;

      ctx.strokeStyle = "rgba(120, 210, 255, 0.95)";
      ctx.fillStyle = "rgba(120, 210, 255, 0.08)";
      ctx.fillRect(corridorX, corridorY, corridorW, corridorH);
      ctx.strokeRect(corridorX, corridorY, corridorW, corridorH);
      ctx.fillStyle = "rgba(120, 210, 255, 0.95)";
      ctx.fillText("ROOM CORRIDOR", corridorX + 2, corridorY - 2);

      ctx.strokeStyle = "rgba(180, 255, 120, 0.95)";
      ctx.strokeRect(corridorX, roofY, corridorW, 6);
      ctx.strokeRect(corridorX, floorY, corridorW, 6);
      ctx.strokeRect(corridorX, floorY + 6, corridorW, CONFIG.WALL_BLOCK_SIZE);
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const p = this.playerController.getPlayer();
    
    // Invulnerability flash
    if (this.deathFreezeFrames <= 0 && p.invulnerable > 0 && Math.floor(p.invulnerable / 4) % 2 === 0) {
      return;
    }
    
    // Draw powerup aura(s) behind the diver
    this.drawPowerUpAura(ctx, p.x, p.y);
    this.drawMagnetRadiusIndicator(p.x, p.y);
    
    // Draw animated underwater character sprite
    if (this.playerAnimLoaded.idle && this.playerAnimImages.idle) {
      let animState: PlayerAnimState = "idle";
      if (!p.grounded) {
        animState = p.vy > 1.2 ? "fall" : "jump";
        if (this.playerController.isCurrentlyShooting()) {
          animState = "shoot";
        }
      } else if (Math.abs(p.vx) > 0.05) {
        animState = "run";
      }
      const footY = p.y + p.height / 2;
      const spriteCenterY = footY - this.DIVER_DRAW_SIZE / 2 + 2 + this.hitboxTuning.playerSpriteOffsetY;
      const spriteCenterX = p.x + this.hitboxTuning.playerSpriteOffsetX;
      this.drawSharedDiver(ctx, spriteCenterX, spriteCenterY, {
        faceRight: p.facingRight,
        scale: 1,
        state: animState,
        animate: true,
      });
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
  
  /** Draw a colored aura around the diver for each active powerup */
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

  private drawMagnetRadiusIndicator(px: number, py: number): void {
    if (!this.powerUpManager.hasPowerUp("MAGNET")) return;

    const ctx = this.ctx;
    const pulse = 0.5 + Math.sin(this.frameCount * 0.08) * 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(110, 220, 255, ${0.22 + pulse * 0.18})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(px, py, this.MAGNET_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawPowerUpBarAbovePlayer(): void {
    const active = this.powerUpManager.getPrimaryPowerUp();
    if (!active) return;

    const ctx = this.ctx;
    const p = this.playerController.getPlayer();
    const info = POWERUP_INFO[active.type];
    const pct = Math.max(0, Math.min(1, active.remainingFrames / active.totalFrames));

    const width = 64;
    const height = 8;
    const x = Math.floor(p.x - width / 2);
    const y = Math.floor(p.y - p.height / 2 - 20);

    ctx.save();

    // Label
    ctx.fillStyle = "rgba(240, 252, 255, 0.95)";
    ctx.font = "7px 'Press Start 2P'";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${info.name}!`, p.x, y - 3);

    // Track
    ctx.fillStyle = "rgba(4, 16, 30, 0.82)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(170, 230, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    // Fill
    const fillW = Math.max(0, Math.floor((width - 2) * pct));
    if (fillW > 0) {
      ctx.fillStyle = info.color;
      ctx.fillRect(x + 1, y + 1, fillW, height - 2);
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

  private drawSinglePowerUpOrb(
    cx: number,
    cy: number,
    type: PowerUpType,
    glowPhase: number,
    useBob: boolean
  ): void {
    const ctx = this.ctx;
    const info = POWERUP_INFO[type];
    const size = POWERUP_CONSTANTS.ORB_SIZE;

    const bobY = useBob ? Math.sin(this.frameCount * 0.06 + glowPhase) * 4 : 0;
    const drawY = cy + bobY;
    const pulse = 0.6 + Math.sin(this.frameCount * 0.08 + glowPhase) * 0.4;

    ctx.save();

    const outerGlow = ctx.createRadialGradient(cx, drawY, 0, cx, drawY, size * 2.5);
    outerGlow.addColorStop(0, info.glowColor.replace("0.6", `${0.3 * pulse}`));
    outerGlow.addColorStop(0.5, info.glowColor.replace("0.6", `${0.1 * pulse}`));
    outerGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, drawY, size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    const midGlow = ctx.createRadialGradient(cx, drawY, size * 0.3, cx, drawY, size * 1.2);
    midGlow.addColorStop(0, info.color);
    midGlow.addColorStop(0.4, info.glowColor);
    midGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = midGlow;
    ctx.beginPath();
    ctx.arc(cx, drawY, size * 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(cx, drawY, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.beginPath();
    ctx.arc(cx - size * 0.15, drawY - size * 0.15, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    const sparkleCount = 4;
    for (let s = 0; s < sparkleCount; s++) {
      const angle = (Math.PI * 2 / sparkleCount) * s + this.frameCount * 0.04 + glowPhase;
      const sparkleR = size * 0.9 + Math.sin(this.frameCount * 0.1 + s * 2) * 3;
      const sx = cx + Math.cos(angle) * sparkleR;
      const sy = drawY + Math.sin(angle) * sparkleR;
      const sparkleSize = 1.5 + Math.sin(this.frameCount * 0.15 + s) * 0.5;

      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px 'Press Start 2P'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.name[0], cx, drawY + 1);

    ctx.restore();
  }
  
  private drawPowerUpOrbs(): void {
    const orbs = this.powerUpManager.getVisibleOrbs(this.cameraY, CONFIG.INTERNAL_HEIGHT);
    
    for (const orb of orbs) {
      this.drawSinglePowerUpOrb(orb.x, orb.y, orb.type, orb.glowPhase, true);
    }
  }
  
  private drawShields(): void {
    if (!this.powerUpManager.hasPowerUp("SHIELD")) return;
    
    const ctx = this.ctx;
    const player = this.playerController.getPlayer();
    const positions = this.powerUpManager.getShieldPositions(player.x, player.y);
    const orbSize = POWERUP_CONSTANTS.SHIELD_ORB_SIZE;
    const info = POWERUP_INFO["SHIELD"];
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      // Trail effect
      const shields = this.powerUpManager.getShields();
      const trailAngle = shields[i].angle - POWERUP_CONSTANTS.SHIELD_SPEED * 5;
      const trailX = player.x + Math.cos(trailAngle) * shields[i].radius;
      const trailY = player.y + Math.sin(trailAngle) * shields[i].radius;
      
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
    ctx.arc(player.x, player.y, POWERUP_CONSTANTS.SHIELD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  private drawBlastExplosions(): void {
    const ctx = this.ctx;
    const explosions = this.powerUpManager.getBlastExplosions();
    const info = POWERUP_INFO["BLAST"];
    
    for (const exp of explosions) {
      ctx.save();

      // Solid filled radius for clearer gameplay readability.
      ctx.fillStyle = `rgba(255, 102, 51, ${Math.max(0.12, exp.alpha * 0.35)})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const btns = this.getMobileButtons();

    this.drawMobileButton(ctx, btns.left.cx * dpr,   btns.left.cy * dpr,   btns.left.r * dpr,   this.input.left,  "left");
    this.drawMobileButton(ctx, btns.right.cx * dpr,  btns.right.cy * dpr,  btns.right.r * dpr,  this.input.right, "right");
    this.drawMobileButton(ctx, btns.action.cx * dpr, btns.action.cy * dpr, btns.action.r * dpr, this.input.jump || this.input.shoot, "action");
  }

  private drawMobileButton(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    active: boolean,
    type: "left" | "right" | "action"
  ): void {
    ctx.save();

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? "rgba(255, 255, 255, 0.30)" : "rgba(0, 0, 0, 0.50)";
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.30)";
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.stroke();

    // Arrow icon
    ctx.fillStyle = active ? "rgba(255, 255, 255, 1.0)" : "rgba(255, 255, 255, 0.65)";
    const a = r * 0.42;
    ctx.beginPath();
    if (type === "left") {
      ctx.moveTo(cx - a, cy);
      ctx.lineTo(cx + a * 0.55, cy - a);
      ctx.lineTo(cx + a * 0.55, cy + a);
    } else if (type === "right") {
      ctx.moveTo(cx + a, cy);
      ctx.lineTo(cx - a * 0.55, cy - a);
      ctx.lineTo(cx - a * 0.55, cy + a);
    } else {
      // Up arrow for jump/shoot
      ctx.moveTo(cx, cy - a);
      ctx.lineTo(cx + a, cy + a * 0.55);
      ctx.lineTo(cx - a, cy + a * 0.55);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
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
