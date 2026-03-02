/**
 * ARCHERY ATTACK — Mongolian Horse Archer (2D Side-Scroll)
 *
 * Ride across the steppe. Targets scroll in from the right.
 * Hold space to draw the bow, release to fire at 45 degrees.
 * Build draw power, then release with good timing for accurate shots.
 * Hold too long and the bow wobbles!
 */

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "WAVE_UPGRADE" | "GAME_OVER";
type UpgradeId = "doubleShot" | "pullSpeed" | "wobbleControl" | "magnetArrows" | "windReader" | "perfectReload" | "extraQuiver";
type TargetKind = "normal" | "runner" | "tiny" | "stoneColumn";

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
  stuckInGround: boolean;
  impactAngle: number;
  magnetFxStrength: number;
  magnetTargetWorldX: number;
  magnetTargetHeight: number;
  magnetTargetRadius: number;
}

interface WorldTarget {
  worldX: number;     // position along the path (horse rides past)
  postHeight: number;
  radius: number;
  hit: boolean;
  kind: TargetKind;
  hp: number;
  maxHp: number;
  speedMult: number;
  embeddedArrow: {
    offsetX: number;
    offsetY: number;
    angle: number;
  } | null;
}

interface Horse {
  screenX: number;
  screenY: number;
  baseY: number;
  legPhase: number;
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

interface RingBurst {
  worldX: number;
  height: number;
  radius: number;
  ringWidth: number;
  color: string;
  life: number;
  growSpeed: number;
  driftX: number;
  driftY: number;
}

interface PerfectBurst {
  worldX: number;
  height: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hueShift: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
  opacity: number;
}

interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
}

interface SpriteBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RiderPlacement {
  tipScreenX: number;
  tipScreenY: number;
  headScreenX: number;
  headScreenY: number;
}


// ============= CONFIG =============
const CONFIG = {
  MAX_SPREAD_ANGLE: 0.3,   // ~17° max deviation at worst stability
  PERFECT_THRESHOLD: 0.82,

  HORSE_SPEED: 0.22,

  WORLD_WIDTH: 20000,
  TARGETS_PER_LAP: 3,

  DRAW_DURATION_MS: 1000,
  WOBBLE_START_MS: 300,
  WOBBLE_RATE: 0.0015,
  MAX_WOBBLE: 0.45,
  MIN_DRAW_TO_FIRE: 0.15,

  ARROW_SPEED: 0.5,
  ARROW_MAX_STRENGTH_BONUS: 0.45,
  ARROW_GRAVITY: 0.0004,
  ARROW_COLLISION_FORWARD: 24,

  TARGET_RADIUS: 40,
  TARGET_HIT_RADIUS: 45,
  TARGET_PENETRATION_WINDOW_MS: 220,
  NEAR: 80,
  DEPTH_NEAR: 400,         // perspective factor: higher = less foreshortening
  HORIZON_RATIO: 0.28,

  ROUND_TIME_MS: 40000,
  PERFECT_MULTIPLIER: 2,
  WAVE_HIT_GOAL: 10,
  WAVE_SPEED_MULT: 1.12,
  MAGNET_RADIUS: 30,
  MAGNET_PULL_RADIUS: 180,
  MAGNET_PULL_STRENGTH: 0.00014,
  QUIVER_SIZE: 5,
  RELOAD_MS: 1500,

  GROUND_RATIO: 0.15,

  RING_COLORS: ["#FFD700", "#FF4444", "#4488FF", "#333333", "#EEEEEE"],
};

const TARGET_KIND_PROGRESS_ORDER: TargetKind[] = ["tiny", "runner", "stoneColumn"];
const TARGET_KIND_WEIGHTS: Record<TargetKind, number> = {
  normal: 1,
  tiny: 0.28,
  runner: 0.24,
  stoneColumn: 0.18,
};

const MOUNTED_SPRITE_ANCHOR = {
  x: 0.5,
  y: 0.78,
};

const MOUNTED_SPRITE_HEAD = {
  x: 0.44,
  y: 0.33,
};

const MOUNTED_CHARACTER_SCALE = 1.32;
const HORSE_RUN_CYCLE_RATE = 0.0105;

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const upgradeScreen = document.getElementById("upgradeScreen")!;
const upgradeWaveTitle = document.getElementById("upgradeWaveTitle")!;
const upgradeSubtitle = document.getElementById("upgradeSubtitle")!;
const rotatePrompt = document.getElementById("rotatePrompt")!;
const fullscreenBtn = document.getElementById("fullscreenBtn")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const finalScoreEl = document.getElementById("finalScore")!;
const fireBtn = document.getElementById("fireBtn")!;
const fireLabelEl = document.querySelector("#fireBtn .fire-label") as HTMLSpanElement;
const startTipEl = document.getElementById("startTip");
const upgradeButtons = [
  document.getElementById("upgradeOption1") as HTMLButtonElement,
  document.getElementById("upgradeOption2") as HTMLButtonElement,
  document.getElementById("upgradeOption3") as HTMLButtonElement,
];

let gameState: GameState = "START";
let w = window.innerWidth;
let h = window.innerHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

let score = 0;
let timeRemaining = CONFIG.ROUND_TIME_MS;
let waveNumber = 1;
let waveHits = 0;
let waveHitMarkProgress: number[] = [];
let settings: Settings = loadSettings();
let animationFrameId: number;
let lastTime = 0;

let groundY = 0;
let horizonY = 0;
let pxPerUnit = 1; // pixels per world unit for 2D mapping
let dpr = 1;       // device pixel ratio for crisp rendering
let gameScale = 1; // responsive scale factor (1.0 at 900px shortest dimension)
let isOrientationBlocked = false;
let environmentTime = 0;
let ammoCount = CONFIG.QUIVER_SIZE;
let isReloading = false;
let reloadRemaining = 0;
let lastCountdownCueSecond = 0;

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
};

let targets: WorldTarget[] = [];
let arrows: Arrow[] = [];
let clouds: Cloud[] = [];
let scorePopups: ScorePopup[] = [];
let ringBursts: RingBurst[] = [];
let perfectBursts: PerfectBurst[] = [];
let characterVideo: HTMLVideoElement | null = null;
let characterVideoLoaded = false;
let characterFrameCanvas: HTMLCanvasElement | null = null;
let characterFrameCtx: CanvasRenderingContext2D | null = null;
let characterFrameReady = false;
let archerImage: HTMLImageElement | null = null;
let archerImageLoaded = false;
let archerBounds: SpriteBounds | null = null;
let ornateTargetCanvas: HTMLCanvasElement | null = null;
let ornateTargetLoaded = false;
let ornateTargetBounds: SpriteBounds | null = null;
let uiCharacterImage: HTMLImageElement | null = null;
let uiCharacterLoaded = false;
let uiPullButtonImage: HTMLImageElement | null = null;
let uiPullButtonLoaded = false;
let uiWavePanelImage: HTMLImageElement | null = null;
let uiWavePanelLoaded = false;
let uiArrowPanelImage: HTMLImageElement | null = null;
let uiArrowPanelLoaded = false;
let uiTopBarImage: HTMLImageElement | null = null;
let uiTopBarLoaded = false;
let loopableBackgroundImage: HTMLImageElement | null = null;
let loopableBackgroundLoaded = false;
let archerArrowTipNorm = { x: 0.66, y: 0.14 };
let riderAnchorBaseTopY: number | null = null;
let riderAnchorOffsetPx = 0;
let riderAnchorLastSampleTime = 0;
let musicTrack: HTMLAudioElement | null = null;
let bowPullTrack: HTMLAudioElement | null = null;
let draftAutoAdvanceTimer: number | null = null;
let draftChoices: UpgradeId[] = [];
const HIT_MARK_ANIM_MS = 320;

const sfxTracks: Record<string, HTMLAudioElement | null> = {
  uiTap: null,
  bowRelease: null,
  targetHit: null,
  perfectHit: null,
  reloadReady: null,
  countdownTick: null,
  gameOverFail: null,
};

const upgradeDefs: UpgradeDef[] = [
  {
    id: "doubleShot",
    name: "Two Can Play At Arrow",
    description: "Shoot 2 arrows at once.",
    maxLevel: 1,
  },
  {
    id: "pullSpeed",
    name: "Bowflex Membership",
    description: "Increase pull speed by 20%.",
    maxLevel: 3,
  },
  {
    id: "wobbleControl",
    name: "Steady Spaghetti",
    description: "Halve wobble impact on shots.",
    maxLevel: 1,
  },
  {
    id: "magnetArrows",
    name: "Cupid's Cheat Code",
    description: "Nearby arrows pull toward targets and auto-hit close shots.",
    maxLevel: 1,
  },
  {
    id: "windReader",
    name: "Wind Reader",
    description: "Show a ghost arc preview while pulling the bow.",
    maxLevel: 1,
  },
  {
    id: "perfectReload",
    name: "Bullseye Refill",
    description: "Perfect shots instantly refill your quiver.",
    maxLevel: 1,
  },
  {
    id: "extraQuiver",
    name: "Extra Quiver Pocket",
    description: "Carry one extra arrow in your quiver.",
    maxLevel: 1,
  },
];

const upgradeLevels: Record<UpgradeId, number> = {
  doubleShot: 0,
  pullSpeed: 0,
  wobbleControl: 0,
  magnetArrows: 0,
  windReader: 0,
  perfectReload: 0,
  extraQuiver: 0,
};

// ============= CANVAS SETUP =============
function resizeCanvas(): void {
  dpr = window.devicePixelRatio || 1;
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gameScale = Math.min(w, h) / 900;

  groundY = h * (1 - CONFIG.GROUND_RATIO);
  horizonY = h * CONFIG.HORIZON_RATIO;
  horse.screenX = w * 0.22;
  horse.baseY = groundY + (h - groundY) * 0.5;
  horse.screenY = horse.baseY;
  pxPerUnit = (w - horse.screenX) / 900;
  updateOrientationState();
}

function isPortraitViewport(): boolean {
  return h > w;
}

async function enterImmersiveMode(): Promise<void> {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  try {
    if (!document.fullscreenElement) {
      if (typeof root.requestFullscreen === "function") {
        await root.requestFullscreen();
      } else if (typeof root.webkitRequestFullscreen === "function") {
        await root.webkitRequestFullscreen();
      }
    }
  } catch {
    console.log("[enterImmersiveMode]", "Fullscreen request was blocked or unavailable.");
  }

  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      await screen.orientation.lock("landscape");
    }
  } catch {
    console.log("[enterImmersiveMode]", "Orientation lock is not available on this browser.");
  }
}

function updateOrientationState(): void {
  isOrientationBlocked = isPortraitViewport();
  rotatePrompt.classList.toggle("hidden", !isOrientationBlocked);

  if (isOrientationBlocked) {
    if (gameState === "PLAYING") {
      isDrawing = false;
      drawProgress = 0;
      wobbleAmount = 0;
      stopBowPullLoop();
    }
    pauseBtn.classList.add("hidden");
    settingsBtn.classList.add("hidden");
    fireBtn.classList.add("hidden");
    pauseMusic();
    syncCharacterVideoState();
    return;
  }

  if (gameState === "PLAYING") {
    pauseBtn.classList.remove("hidden");
    settingsBtn.classList.remove("hidden");
    fireBtn.classList.remove("hidden");
    syncMusicState();
    syncCharacterVideoState();
  }
}

// ============= HAPTICS =============
function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const pattern = type === "success"
      ? [20, 30, 20]
      : type === "heavy"
        ? [30]
        : type === "medium"
          ? [18]
          : [12];
    navigator.vibrate(pattern);
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

function createAudio(path: string, volume: number, loop = false): HTMLAudioElement {
  const audio = new Audio(path);
  audio.preload = "auto";
  audio.loop = loop;
  audio.volume = volume;
  return audio;
}

function loadAudio(): void {
  musicTrack = createAudio("./Steppe_Gallop.mp3", 0.1, true);
  bowPullTrack = createAudio("./bow_pull_loop.mp3", 0.48, true);

  sfxTracks.uiTap = createAudio("./ui_tap.mp3", 0.65);
  sfxTracks.bowRelease = createAudio("./bow_release.mp3", 0.8);
  sfxTracks.targetHit = createAudio("./target_hit.mp3", 0.88);
  sfxTracks.perfectHit = createAudio("./perfect_hit.mp3", 0.7);
  sfxTracks.reloadReady = createAudio("./reload_ready.mp3", 0.92);
  sfxTracks.countdownTick = createAudio("./countdown_tick.mp3", 0.3);
  sfxTracks.gameOverFail = createAudio("./game_over_fail.mp3", 0.3);
}

function playSfx(
  trackKey: keyof typeof sfxTracks,
  fallbackKey: keyof typeof sfxTracks | null = null,
): void {
  if (!settings.fx) return;
  const base = sfxTracks[trackKey];
  if (!base) return;

  try {
    const oneShot = base.cloneNode(true) as HTMLAudioElement;
    oneShot.volume = base.volume;
    const playPromise = oneShot.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        console.log("[playSfx]", "SFX playback failed.");
        if (fallbackKey) {
          playSfx(fallbackKey, null);
        }
      });
    }
  } catch {
    console.log("[playSfx]", "SFX playback failed.");
    if (fallbackKey) {
      playSfx(fallbackKey, null);
    }
  }
}

function playSfxAtVolume(
  trackKey: keyof typeof sfxTracks,
  volumeScale: number,
  fallbackKey: keyof typeof sfxTracks | null = null,
): void {
  if (!settings.fx) return;
  const defaultFallbackKey: keyof typeof sfxTracks = trackKey === "countdownTick" ? "uiTap" : "perfectHit";
  const resolvedFallback = fallbackKey || defaultFallbackKey;
  const base = sfxTracks[trackKey] || sfxTracks[resolvedFallback];
  if (!base) return;
  const clampedScale = Math.max(0, Math.min(2, volumeScale));
  try {
    const oneShot = base.cloneNode(true) as HTMLAudioElement;
    oneShot.volume = Math.max(0, Math.min(1, base.volume * clampedScale));
    const playPromise = oneShot.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        console.log("[playSfxAtVolume]", "SFX playback failed.");
        if (resolvedFallback) {
          playSfx(resolvedFallback, null);
        }
      });
    }
  } catch {
    console.log("[playSfxAtVolume]", "SFX playback failed.");
    if (resolvedFallback) {
      playSfx(resolvedFallback, null);
    }
  }
}

function playCountdownBeep(secondRemaining: number): void {
  if (secondRemaining < 1 || secondRemaining > 5) return;
  const urgency = (6 - secondRemaining) / 5;
  const volumeScale = 0.9 + urgency * 0.3;
  playSfxAtVolume("countdownTick", volumeScale, "uiTap");
}

function playGameOverSfx(): void {
  playSfx("gameOverFail", "perfectHit");
}

function playMusicIfAllowed(): void {
  if (!settings.music || !musicTrack) return;
  if (gameState !== "PLAYING") return;
  if (isOrientationBlocked) return;

  void musicTrack.play().catch(() => {
    console.log("[playMusicIfAllowed]", "Music playback was blocked.");
  });
}

function pauseMusic(): void {
  if (!musicTrack) return;
  musicTrack.pause();
}

function syncMusicState(): void {
  if (!musicTrack) return;
  if (!settings.music) {
    pauseMusic();
    return;
  }
  playMusicIfAllowed();
}

function playBowPullLoopIfAllowed(): void {
  if (!bowPullTrack || !settings.fx) return;
  if (!isDrawing) return;
  if (gameState !== "PLAYING" || isOrientationBlocked) return;
  if (!bowPullTrack.paused) return;
  bowPullTrack.currentTime = 0;
  void bowPullTrack.play().catch(() => {
    console.log("[playBowPullLoopIfAllowed]", "Bow pull loop playback was blocked.");
  });
}

function stopBowPullLoop(): void {
  if (!bowPullTrack) return;
  bowPullTrack.pause();
  bowPullTrack.currentTime = 0;
}

function loadCharacterVideo(): void {
  const video = document.createElement("video");
  video.src = "/horse.mp4";
  video.loop = false;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  video.addEventListener("loadeddata", () => {
    characterVideoLoaded = true;
    characterVideo = video;
    characterFrameCanvas = document.createElement("canvas");
    characterFrameCanvas.width = video.videoWidth;
    characterFrameCanvas.height = video.videoHeight;
    characterFrameCtx = characterFrameCanvas.getContext("2d");
    riderAnchorBaseTopY = null;
    riderAnchorOffsetPx = 0;
    riderAnchorLastSampleTime = 0;
    syncCharacterVideoState();
    console.log("[loadCharacterVideo]", "Loaded " + video.currentSrc);
  });

  video.addEventListener("error", () => {
    characterVideoLoaded = false;
    console.log("[loadCharacterVideo]", "Could not load character video, using fallback character.");
  });

  video.addEventListener("ended", () => {
    video.currentTime = 0.02;
    void video.play().catch(() => {
      console.log("[loadCharacterVideo]", "Video loop restart was blocked.");
    });
  });
}

function maintainCharacterVideoLoop(): void {
  if (!characterVideoLoaded || !characterVideo) return;
  if (gameState !== "PLAYING" || isOrientationBlocked) return;
  if (characterVideo.readyState < 2) return;
  const dur = characterVideo.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;

  // Rewind a hair before the clip ends to avoid visible end-of-loop stutter.
  const safeLead = 0.08;
  if (characterVideo.currentTime >= dur - safeLead) {
    characterVideo.currentTime = 0.02;
  }
}

function loadArcherImage(): void {
  const img = new Image();
  img.src = "/hose-removebg-preview.png";
  img.onload = () => {
    archerImage = img;
    archerImageLoaded = true;
    archerBounds = getOpaqueSpriteBounds(img);
    // Manual arrow-tip anchor for the mounted composite sprite.
    archerArrowTipNorm = { x: 0.66, y: 0.14 };
    console.log("[loadArcherImage]", "Loaded /hose-removebg-preview.png");
  };
  img.onerror = () => {
    archerImageLoaded = false;
    archerBounds = null;
    console.log("[loadArcherImage]", "Could not load /hose-removebg-preview.png.");
  };
}

function loadOrnateTargetImage(): void {
  const img = new Image();
  img.src = "/incoming/Gemini_Generated_Image_z2qg17z2qg17z2qg.png";
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cctx = c.getContext("2d");
    if (!cctx) {
      ornateTargetLoaded = false;
      console.log("[loadOrnateTargetImage]", "Could not create canvas context.");
      return;
    }
    cctx.clearRect(0, 0, c.width, c.height);
    cctx.drawImage(img, 0, 0);
    const imageData = cctx.getImageData(0, 0, c.width, c.height);
    const data = imageData.data;
    let minX = c.width;
    let minY = c.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const idx = (y * c.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const minCh = Math.min(r, g, b);
        if (minCh >= 244) {
          data[idx + 3] = 0;
        } else if (minCh >= 210) {
          const alphaScale = (244 - minCh) / 34;
          data[idx + 3] = Math.round(data[idx + 3] * alphaScale);
        }
        // Decontaminate white matte fringing on anti-aliased edges.
        if (data[idx + 3] < 255) {
          const a = data[idx + 3] / 255;
          data[idx] = Math.round(data[idx] * a);
          data[idx + 1] = Math.round(data[idx + 1] * a);
          data[idx + 2] = Math.round(data[idx + 2] * a);
        }
        if (data[idx + 3] > 24) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    cctx.putImageData(imageData, 0, 0);
    ornateTargetCanvas = c;
    if (maxX >= minX && maxY >= minY) {
      ornateTargetBounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } else {
      ornateTargetBounds = { x: 0, y: 0, w: c.width, h: c.height };
    }
    ornateTargetLoaded = true;
    console.log("[loadOrnateTargetImage]", "Loaded and keyed ornate target image.");
  };
  img.onerror = () => {
    ornateTargetLoaded = false;
    ornateTargetCanvas = null;
    ornateTargetBounds = null;
    console.log("[loadOrnateTargetImage]", "Could not load ornate target image.");
  };
}

function loadUiReplacementAssets(): void {
  const load = (
    path: string,
    onOk: (img: HTMLImageElement) => void,
    onFail: () => void,
    label: string,
  ): void => {
    const img = new Image();
    img.src = path;
    img.onload = () => {
      onOk(img);
      console.log("[loadUiReplacementAssets]", "Loaded " + label);
    };
    img.onerror = () => {
      onFail();
      console.log("[loadUiReplacementAssets]", "Could not load " + label);
    };
  };

  load(
    "/incoming/ui/character_mount.png",
    (img) => {
      uiCharacterImage = img;
      uiCharacterLoaded = true;
    },
    () => {
      uiCharacterImage = null;
      uiCharacterLoaded = false;
    },
    "character_mount.png",
  );

  load(
    "/incoming/ui/pull_button.png",
    (img) => {
      uiPullButtonImage = img;
      uiPullButtonLoaded = true;
      fireBtn.style.background = "transparent";
      fireBtn.style.border = "none";
      fireBtn.style.width = "150px";
      fireBtn.style.height = "150px";
      fireBtn.style.backgroundImage = "url('/incoming/ui/pull_button.png')";
      fireBtn.style.backgroundSize = "contain";
      fireBtn.style.backgroundRepeat = "no-repeat";
      fireBtn.style.backgroundPosition = "center";
      fireBtn.style.boxShadow = "none";
      fireBtn.style.color = "transparent";
      fireBtn.style.textShadow = "none";
      fireLabelEl.style.opacity = "0";
    },
    () => {
      uiPullButtonImage = null;
      uiPullButtonLoaded = false;
    },
    "pull_button.png",
  );

  load(
    "/incoming/ui/wave_score_panel.png",
    (img) => {
      uiWavePanelImage = img;
      uiWavePanelLoaded = true;
    },
    () => {
      uiWavePanelImage = null;
      uiWavePanelLoaded = false;
    },
    "wave_score_panel.png",
  );

  load(
    "/incoming/ui/arrow_inventory_panel.png",
    (img) => {
      uiArrowPanelImage = img;
      uiArrowPanelLoaded = true;
    },
    () => {
      uiArrowPanelImage = null;
      uiArrowPanelLoaded = false;
    },
    "arrow_inventory_panel.png",
  );

  load(
    "/incoming/ui/top_global_bar.png",
    (img) => {
      uiTopBarImage = img;
      uiTopBarLoaded = true;
    },
    () => {
      uiTopBarImage = null;
      uiTopBarLoaded = false;
    },
    "top_global_bar.png",
  );
}

function loadLoopableBackground(): void {
  const img = new Image();
  img.src = "/incoming/background.jpg";
  img.onload = () => {
    loopableBackgroundImage = img;
    loopableBackgroundLoaded = true;
    console.log("[loadLoopableBackground]", "Loaded loopable background.");
  };
  img.onerror = () => {
    loopableBackgroundImage = null;
    loopableBackgroundLoaded = false;
    console.log("[loadLoopableBackground]", "Could not load loopable background.");
  };
}

function drawLoopableBackground(): boolean {
  if (!loopableBackgroundLoaded || !loopableBackgroundImage) return false;
  const img = loopableBackgroundImage;
  const scale = h / Math.max(1, img.naturalHeight);
  const tileW = img.naturalWidth * scale;
  if (tileW <= 1) return false;

  const scroll = (world.cameraX * pxPerUnit * 0.45) % tileW;
  const startX = -scroll - tileW;
  for (let x = startX; x < w + tileW; x += tileW) {
    ctx.drawImage(img, x, 0, tileW, h);
  }
  return true;
}

function drawUiImage(img: HTMLImageElement | null, loaded: boolean, x: number, y: number, wOut: number, hOut: number): void {
  if (!loaded || !img) return;
  ctx.drawImage(img, x, y, wOut, hOut);
}

function getOpaqueSpriteBounds(img: HTMLImageElement): SpriteBounds {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext("2d");
  if (!cctx) {
    return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  }
  cctx.clearRect(0, 0, c.width, c.height);
  cctx.drawImage(img, 0, 0);
  const data = cctx.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width;
  let minY = c.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const a = data[(y * c.width + x) * 4 + 3];
      if (a <= 24) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function getArrowTipNormInBounds(img: HTMLImageElement, bounds: SpriteBounds): { x: number; y: number } {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext("2d");
  if (!cctx) return { x: 0.975, y: 0.29 };

  cctx.clearRect(0, 0, c.width, c.height);
  cctx.drawImage(img, 0, 0);
  const d = cctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h).data;

  let rightmostX = -1;
  for (let y = 0; y < bounds.h; y++) {
    for (let x = 0; x < bounds.w; x++) {
      const a = d[(y * bounds.w + x) * 4 + 3];
      if (a > 24 && x > rightmostX) rightmostX = x;
    }
  }
  if (rightmostX < 0) return { x: 0.975, y: 0.29 };

  // Average y around the rightmost opaque edge. This approximates the visible arrow tip.
  let sumY = 0;
  let count = 0;
  const xBandStart = Math.max(0, rightmostX - 2);
  for (let y = 0; y < bounds.h; y++) {
    for (let x = xBandStart; x <= rightmostX; x++) {
      const a = d[(y * bounds.w + x) * 4 + 3];
      if (a <= 24) continue;
      sumY += y;
      count++;
    }
  }
  const tipY = count > 0 ? sumY / count : bounds.h * 0.29;
  return {
    x: Math.max(0, Math.min(1, rightmostX / Math.max(1, bounds.w - 1))),
    y: Math.max(0, Math.min(1, tipY / Math.max(1, bounds.h - 1))),
  };
}

function getRiderPlacement(): RiderPlacement | null {
  const horseScale = MOUNTED_CHARACTER_SCALE * gameScale;
  const riderBaseX = horse.screenX - 8 * horseScale;
  const riderBaseY = horse.screenY - 66 * horseScale;
  const bowCenterX = riderBaseX + 18 * horseScale;
  const bowCenterY = riderBaseY - 18 * horseScale;
  const bowAngle = -Math.PI * 0.25;
  const maxPull = 20 * horseScale;
  const pullBack = isDrawing ? drawProgress * maxPull : 0;
  const pullDirX = -Math.cos(bowAngle);
  const pullDirY = -Math.sin(bowAngle);
  const stringPullX = bowCenterX + pullDirX * pullBack;
  const stringPullY = bowCenterY + pullDirY * pullBack;
  const nockX = isDrawing && drawProgress > 0.05 ? stringPullX : bowCenterX;
  const nockY = isDrawing && drawProgress > 0.05 ? stringPullY : bowCenterY;
  const arrowLen = 32 * horseScale;
  const aDirX = Math.cos(bowAngle);
  const aDirY = Math.sin(bowAngle);
  const tipScreenX = nockX + aDirX * arrowLen;
  const tipScreenY = nockY + aDirY * arrowLen;
  const headScreenX = riderBaseX + 1 * horseScale;
  const headScreenY = riderBaseY - 55 * horseScale;

  return {
    tipScreenX,
    tipScreenY,
    headScreenX,
    headScreenY,
  };
}

function getArrowSpawnPointWorld(): { worldX: number; height: number } {
  const placement = getRiderPlacement();
  if (placement) {
    return {
      worldX: world.cameraX + (placement.tipScreenX - horse.screenX) / pxPerUnit,
      height: (groundY - placement.tipScreenY) / pxPerUnit,
    };
  }

  // Fallback if rider placement is unavailable.
  const bowTipOffsetX = 127 * gameScale;
  const bowTipOffsetY = 292 * gameScale;
  return {
    worldX: world.cameraX + bowTipOffsetX / pxPerUnit,
    height: (groundY - horse.screenY + bowTipOffsetY) / pxPerUnit,
  };
}

function getPlayerHeadScreenPosition(): { x: number; y: number } {
  const placement = getRiderPlacement();
  if (placement) {
    return {
      x: placement.headScreenX,
      y: placement.headScreenY,
    };
  }

  const horseScale = MOUNTED_CHARACTER_SCALE * gameScale;
  return {
    x: horse.screenX + 7 * horseScale,
    y: horse.screenY - 92 * horseScale,
  };
}

function sampleRiderAnchorFromHorseFrame(): void {
  if (!characterFrameCanvas || !characterFrameCtx) return;
  const now = performance.now();
  if (now - riderAnchorLastSampleTime < 45) return;
  riderAnchorLastSampleTime = now;

  const fw = characterFrameCanvas.width;
  const fh = characterFrameCanvas.height;
  const x0 = Math.max(0, Math.floor(fw * 0.33));
  const x1 = Math.min(fw - 1, Math.floor(fw * 0.56));
  const y0 = Math.max(0, Math.floor(fh * 0.22));
  const y1 = Math.min(fh - 1, Math.floor(fh * 0.70));
  if (x1 <= x0 || y1 <= y0) return;

  const img = characterFrameCtx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const data = img.data;
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  let massY = 0;
  let mass = 0;

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const idx = (y * rw + x) * 4 + 3;
      const a = data[idx];
      if (a <= 8) continue;
      const weight = a / 255;
      massY += (y0 + y) * weight;
      mass += weight;
    }
  }

  if (mass < 50) return;
  const centerY = massY / mass;
  if (riderAnchorBaseTopY === null) {
    riderAnchorBaseTopY = centerY;
    riderAnchorOffsetPx = 0;
    return;
  }

  const targetOffset = centerY - riderAnchorBaseTopY;
  riderAnchorOffsetPx += (targetOffset - riderAnchorOffsetPx) * 0.75;
}

function normalizeHorseFrameAlpha(): void {
  if (!characterFrameCanvas || !characterFrameCtx) return;
  const fw = characterFrameCanvas.width;
  const fh = characterFrameCanvas.height;
  const imageData = characterFrameCtx.getImageData(0, 0, fw, fh);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxCh = Math.max(r, g, b);
    data[i + 3] = maxCh <= 22 ? 0 : 255;
  }
  characterFrameCtx.putImageData(imageData, 0, 0);
}

function syncCharacterVideoState(): void {
  if (!characterVideoLoaded || !characterVideo) return;
  if (gameState === "PLAYING" && !isOrientationBlocked) {
    void characterVideo.play().catch(() => {
      console.log("[syncCharacterVideoState]", "Video playback was blocked.");
    });
    return;
  }
  characterVideo.pause();
}

function clearDraftTimer(): void {
  if (draftAutoAdvanceTimer !== null) {
    window.clearTimeout(draftAutoAdvanceTimer);
    draftAutoAdvanceTimer = null;
  }
}

function resetUpgrades(): void {
  upgradeLevels.doubleShot = 0;
  upgradeLevels.pullSpeed = 0;
  upgradeLevels.wobbleControl = 0;
  upgradeLevels.magnetArrows = 0;
  upgradeLevels.windReader = 0;
  upgradeLevels.perfectReload = 0;
  upgradeLevels.extraQuiver = 0;
}

function getMaxQuiverArrows(): number {
  return CONFIG.QUIVER_SIZE + upgradeLevels.extraQuiver;
}

function getDrawSpeedMultiplier(): number {
  return 1 + upgradeLevels.pullSpeed * 0.2;
}

function getWobbleMultiplier(): number {
  return upgradeLevels.wobbleControl > 0 ? 0.5 : 1;
}

function updateStartTip(): void {
  if (!startTipEl) return;
  const roundSeconds = Math.round(CONFIG.ROUND_TIME_MS / 1000);
  const lineOne =
    "You have " +
    roundSeconds.toString() +
    " seconds to hit " +
    CONFIG.WAVE_HIT_GOAL.toString() +
    " targets!";
  const lineTwo = isMobile
    ? "Hold the button to pull your arrow back!"
    : "Hold the Space bar to pull your arrow back!";
  startTipEl.innerHTML = lineOne + "<br>" + lineTwo;
}

function getArrowLaunchSpeed(drawAmount: number): number {
  const drawFactor = Math.max(0, Math.min(1, drawAmount));
  // Scale top-end pull force more than low draw amounts to extend max-range shots.
  return CONFIG.ARROW_SPEED * drawFactor * (1 + CONFIG.ARROW_MAX_STRENGTH_BONUS * drawFactor);
}

function getTargetSpacingFactor(): number {
  return Math.min(1 + (waveNumber - 1) * 0.2, 3);
}

function getMaxReachableArrowApexHeight(): number {
  const spawnPoint = getArrowSpawnPointWorld();
  const maxLaunchSpeed = getArrowLaunchSpeed(1);
  const maxAimAngle = Math.PI / 4;
  const maxVy = maxLaunchSpeed * Math.sin(maxAimAngle);
  const apexDelta = (maxVy * maxVy) / (2 * CONFIG.ARROW_GRAVITY);
  return spawnPoint.height + apexDelta;
}

function getMaxTargetSpawnHeight(): number {
  // Keep target center slightly below theoretical arrow apex to avoid edge-case misses.
  const apex = getMaxReachableArrowApexHeight();
  const safetyMargin = Math.max(10, CONFIG.TARGET_RADIUS * 0.35);
  const apexLimitedHeight = apex - safetyMargin;
  const topSafeY = h * 0.1;
  const topSafeHeight = (groundY - topSafeY) / Math.max(0.001, pxPerUnit);
  const topSafeRadiusPad = CONFIG.TARGET_RADIUS * 1.1;
  const viewportLimitedHeight = topSafeHeight - topSafeRadiusPad;
  return Math.max(130, Math.min(apexLimitedHeight, viewportLimitedHeight));
}

function getRandomTargetPostHeight(): number {
  const minHeight = 150;
  const capHeight = getMaxTargetSpawnHeight();
  if (capHeight <= minHeight + 1) return minHeight;
  return minHeight + Math.random() * (capHeight - minHeight);
}

function getCrosswindAccel(): number {
  if (waveNumber < 5) return 0;
  const gust = Math.sin(environmentTime * 0.0011 + waveNumber * 0.6);
  const pulse = Math.sin(environmentTime * 0.00043 + waveNumber) * 0.35;
  const amp = 0.000016 + Math.min(0.00003, (waveNumber - 4) * 0.0000028);
  return (gust + pulse) * amp;
}

function getHeatShimmerAmount(): number {
  if (waveNumber < 6) return 0;
  return Math.min(1, 0.22 + (waveNumber - 6) * 0.08);
}

function getSpawnGapDx(spacingFactor: number): number {
  const baseGap = 250 * spacingFactor;
  if (waveNumber < 4) return baseGap + Math.random() * (80 * spacingFactor);
  const roll = Math.random();
  if (roll < 0.34) {
    // Burst cluster.
    return baseGap * (0.52 + Math.random() * 0.28);
  }
  if (roll < 0.56) {
    // Breather gap.
    return baseGap * (1.65 + Math.random() * 0.55);
  }
  return baseGap * (0.9 + Math.random() * 0.5);
}

function pickTargetKind(): TargetKind {
  const unlockedCount = Math.max(0, waveNumber - 1);
  const unlockedKinds = TARGET_KIND_PROGRESS_ORDER.slice(0, unlockedCount);
  const candidates: TargetKind[] = ["normal", ...unlockedKinds];

  let totalWeight = 0;
  for (const kind of candidates) {
    totalWeight += TARGET_KIND_WEIGHTS[kind] || 0;
  }
  if (totalWeight <= 0) return "normal";

  let roll = Math.random() * totalWeight;
  for (const kind of candidates) {
    roll -= TARGET_KIND_WEIGHTS[kind] || 0;
    if (roll <= 0) return kind;
  }
  return candidates[candidates.length - 1] || "normal";
}

function applyTargetKindStats(t: WorldTarget, kind: TargetKind): void {
  t.kind = kind;
  if (kind === "stoneColumn") {
    t.radius = 34;
    t.maxHp = 1;
    t.hp = 1;
    t.speedMult = 1;
    return;
  }
  if (kind === "runner") {
    t.radius = 34;
    t.maxHp = 1;
    t.hp = 1;
    t.speedMult = 1.45;
    return;
  }
  if (kind === "tiny") {
    t.radius = 26;
    t.maxHp = 1;
    t.hp = 1;
    t.speedMult = 1.2;
    return;
  }
  t.radius = CONFIG.TARGET_RADIUS;
  t.maxHp = 1;
  t.hp = 1;
  t.speedMult = 1;
}

function setWorldSpeedForWave(): void {
  world.speed = CONFIG.HORSE_SPEED * Math.pow(CONFIG.WAVE_SPEED_MULT, waveNumber - 1);
}

function getEligibleUpgrades(): UpgradeDef[] {
  return upgradeDefs.filter((upgrade) => upgradeLevels[upgrade.id] < upgrade.maxLevel);
}

function pickDraftChoices(): UpgradeId[] {
  const eligible = getEligibleUpgrades();
  if (eligible.length <= 3) {
    return eligible.map((upgrade) => upgrade.id);
  }
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, 3).map((upgrade) => upgrade.id);
}

function beginWave(nextWave: number): void {
  clearDraftTimer();
  draftChoices = [];
  waveNumber = nextWave;
  waveHits = 0;
  waveHitMarkProgress = new Array(CONFIG.WAVE_HIT_GOAL).fill(0);
  timeRemaining = CONFIG.ROUND_TIME_MS;
  lastCountdownCueSecond = Math.ceil(timeRemaining / 1000);
  setWorldSpeedForWave();

  isDrawing = false;
  stopBowPullLoop();
  drawProgress = 0;
  wobbleAmount = 0;
  drawElapsed = 0;
  ammoCount = getMaxQuiverArrows();
  isReloading = false;
  reloadRemaining = 0;

  arrows = [];
  scorePopups = [];
  ringBursts = [];
  perfectBursts = [];

  generateTargets();
  gameState = "PLAYING";
  upgradeScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  fireBtn.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  updateOrientationState();
  syncMusicState();
  syncCharacterVideoState();
}

function applyUpgrade(upgradeId: UpgradeId): void {
  if (upgradeLevels[upgradeId] >= upgradeDefs.find((u) => u.id === upgradeId)!.maxLevel) return;
  upgradeLevels[upgradeId] += 1;
}

function enterUpgradeDraft(): void {
  gameState = "WAVE_UPGRADE";
  isDrawing = false;
  stopBowPullLoop();
  drawProgress = 0;
  wobbleAmount = 0;
  fireBtn.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  upgradeScreen.classList.remove("hidden");
  upgradeWaveTitle.textContent = "Wave " + waveNumber + " Cleared";
  upgradeSubtitle.textContent = "Pick One Upgrade";
  playSfx("perfectHit");
  triggerHaptic("success");

  draftChoices = pickDraftChoices();
  if (draftChoices.length === 0) {
    for (const button of upgradeButtons) button.classList.add("hidden");
    upgradeSubtitle.textContent = "All upgrades maxed. Next wave...";
    draftAutoAdvanceTimer = window.setTimeout(() => {
      beginWave(waveNumber + 1);
    }, 1200);
    return;
  }

  upgradeButtons.forEach((button, index) => {
    const upgradeId = draftChoices[index];
    if (!upgradeId) {
      button.classList.add("hidden");
      return;
    }
    const def = upgradeDefs.find((upgrade) => upgrade.id === upgradeId)!;
    const nextLevel = upgradeLevels[upgradeId] + 1;
    const maxLevelText = def.maxLevel > 1 ? " (" + nextLevel + "/" + def.maxLevel + ")" : "";
    const nameEl = button.querySelector(".upgrade-name");
    const descEl = button.querySelector(".upgrade-desc");
    if (nameEl) nameEl.textContent = def.name + maxLevelText;
    if (descEl) descEl.textContent = def.description;
    button.classList.remove("hidden");
  });
}

function chooseUpgrade(choiceIndex: number): void {
  if (gameState !== "WAVE_UPGRADE") return;
  const upgradeId = draftChoices[choiceIndex];
  if (!upgradeId) return;
  clearDraftTimer();
  playSfx("uiTap");
  triggerHaptic("light");
  applyUpgrade(upgradeId);
  beginWave(waveNumber + 1);
}

function setupUpgradeButtons(): void {
  upgradeButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      chooseUpgrade(index);
    });
  });
}

// ============= SHOT STEADINESS =============
function getSteadiness(): number {
  const drawFactor = Math.max(0, Math.min(1, drawProgress));
  const wobblePenalty = Math.max(0, Math.min(1, wobbleAmount / Math.max(0.001, CONFIG.MAX_WOBBLE)));
  const steadiness = 0.55 + drawFactor * 0.45 - wobblePenalty * 0.72;
  return Math.max(0, Math.min(1, steadiness));
}

// ============= TARGET GENERATION =============
function generateTargets(): void {
  targets = [];
  const spacingFactor = getTargetSpacingFactor();
  const offscreenSpawnMinDx = getOffscreenSpawnMinDx();
  const initialSpawnMinDx = offscreenSpawnMinDx + 120 * spacingFactor;
  const spawnVariance = 120 * spacingFactor * 0.8;
  let spawnDx = initialSpawnMinDx;
  for (let i = 0; i < CONFIG.TARGETS_PER_LAP; i++) {
    const kind = pickTargetKind();
    const target: WorldTarget = {
      // Spawn initial targets out of sight on the right so they ride into view.
      worldX: world.cameraX + spawnDx + Math.random() * spawnVariance,
      postHeight: getRandomTargetPostHeight(),
      radius: CONFIG.TARGET_RADIUS,
      hit: false,
      kind: "normal",
      hp: 1,
      maxHp: 1,
      speedMult: 1,
      embeddedArrow: null,
    };
    applyTargetKindStats(target, kind);
    targets.push(target);
    spawnDx += getSpawnGapDx(spacingFactor);
  }
}

function recycleTarget(t: WorldTarget, worldX: number): void {
  t.worldX = worldX;
  t.postHeight = getRandomTargetPostHeight();
  t.hit = false;
  t.embeddedArrow = null;
  applyTargetKindStats(t, pickTargetKind());
}

function getTargetHitRadius(t: WorldTarget): number {
  return Math.max(CONFIG.TARGET_HIT_RADIUS * 0.72, t.radius * 1.08);
}

// ============= TARGET HELPERS =============
function getTargetLateralDx(t: WorldTarget): number {
  let dx = t.worldX - world.cameraX;
  if (dx < -world.width / 2) dx += world.width;
  if (dx > world.width / 2) dx -= world.width;
  return dx;
}

function getOffscreenSpawnMinDx(): number {
  // Convert right edge of the visible area into world units and add a buffer.
  const rightEdgeDx = (w - horse.screenX) / pxPerUnit;
  return rightEdgeDx + 140;
}

function getArrowCollisionPoint(arrow: Arrow): { x: number; y: number; angle: number } {
  const speedMag = Math.sqrt(arrow.vx * arrow.vx + arrow.vy * arrow.vy);
  if (speedMag <= 0.00001) {
    return { x: arrow.worldX, y: arrow.height, angle: 0 };
  }
  const dirX = arrow.vx / speedMag;
  const dirY = arrow.vy / speedMag;
  const tipX = arrow.worldX + dirX * CONFIG.ARROW_COLLISION_FORWARD;
  const tipY = arrow.height + dirY * CONFIG.ARROW_COLLISION_FORWARD;
  const angle = Math.atan2(-arrow.vy, arrow.vx);
  return { x: tipX, y: tipY, angle };
}

function getPointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.0000001) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function getClosestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.0000001) {
    return { x: ax, y: ay };
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  return { x: ax + abx * t, y: ay + aby * t };
}

// ============= BOW DRAW & FIRE =============
function startDraw(): void {
  if (isDrawing) return;
  if (isReloading || ammoCount <= 0) return;
  isDrawing = true;
  drawStartTime = performance.now();
  drawProgress = 0;
  wobbleAmount = 0;
  drawElapsed = 0;
  playBowPullLoopIfAllowed();
  triggerHaptic("medium");
}

function updateDraw(dt: number): void {
  if (!isDrawing) return;
  drawElapsed += dt * getDrawSpeedMultiplier();
  drawProgress = Math.min(drawElapsed / CONFIG.DRAW_DURATION_MS, 1);

  const overHoldTime = drawElapsed - CONFIG.DRAW_DURATION_MS - CONFIG.WOBBLE_START_MS;
  if (overHoldTime > 0) {
    wobbleAmount = Math.min(overHoldTime * CONFIG.WOBBLE_RATE, CONFIG.MAX_WOBBLE) * getWobbleMultiplier();
  } else {
    wobbleAmount = 0;
  }
}

function releaseDraw(): void {
  if (!isDrawing) return;
  isDrawing = false;
  stopBowPullLoop();

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
  if (ammoCount <= 0 || isReloading) return;
  const steadiness = getSteadiness();
  const isPerfect = steadiness >= CONFIG.PERFECT_THRESHOLD && wobbleAmount < 0.1;

  const speed = getArrowLaunchSpeed(drawProgress);
  const baseAngle = Math.PI / 4; // 45 degrees

  // Stability spread: poor timing on horse bob = arrow deviates from 45°
  const stabilitySpread = (1 - steadiness) * CONFIG.MAX_SPREAD_ANGLE;
  const effectiveWobble = wobbleAmount;
  const wobbleSpread = effectiveWobble * CONFIG.MAX_SPREAD_ANGLE * 0.8;
  const totalSpread = stabilitySpread + wobbleSpread;
  let angleDeviation = (Math.random() - 0.5) * 2 * totalSpread;
  if (effectiveWobble > 0.1) {
    const wobbleDirection = Math.random() < 0.5 ? -1 : 1;
    angleDeviation += baseAngle * 0.3 * wobbleDirection;
  }

  const finalAngle = baseAngle + angleDeviation;
  const spawnPoint = getArrowSpawnPointWorld();

  const spawnArrow = (angle: number): void => {
    arrows.push({
      worldX: spawnPoint.worldX,
      height: spawnPoint.height,
      vx: world.speed + speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
      active: true,
      perfect: isPerfect,
      stuckInGround: false,
      impactAngle: 0,
      magnetFxStrength: 0,
      magnetTargetWorldX: 0,
      magnetTargetHeight: 0,
      magnetTargetRadius: 0,
    });
  };

  const arrowsToShoot = upgradeLevels.doubleShot > 0 ? Math.min(2, ammoCount) : 1;
  if (arrowsToShoot === 2) {
    spawnArrow(finalAngle - 0.045);
    spawnArrow(finalAngle + 0.045);
  } else {
    spawnArrow(finalAngle);
  }

  ammoCount = Math.max(0, ammoCount - arrowsToShoot);
  if (ammoCount === 0) {
    isReloading = true;
    reloadRemaining = CONFIG.RELOAD_MS;
    playSfx("reloadReady");
  }

  playSfx("bowRelease");
  triggerHaptic("heavy");
}

// ============= SCORE POPUPS =============
function spawnScorePopup(
  x: number,
  y: number,
  points: number,
  perfect: boolean,
): void {
  const text = perfect ? `${points} PERFECT!` : (points >= 0 ? `+${points}` : `${points}`);
  const color = perfect ? "#FFD700" : (points >= 0 ? "#FFFFFF" : "#FF8888");
  scorePopups.push({ x, y, text, color, life: 1, vy: -0.08 });
}

function spawnTargetRingBurst(t: WorldTarget): void {
  for (let i = 0; i < CONFIG.RING_COLORS.length; i++) {
    const baseR = t.radius * (1 - i / CONFIG.RING_COLORS.length);
    if (baseR <= 0.5) continue;
    ringBursts.push({
      worldX: t.worldX,
      height: t.postHeight,
      radius: baseR,
      ringWidth: Math.max(2.5, t.radius * 0.16 * (1 - i * 0.08)),
      color: CONFIG.RING_COLORS[i],
      life: 1,
      growSpeed: 0.018 + i * 0.003,
      driftX: (Math.random() - 0.5) * 0.06,
      driftY: (Math.random() - 0.5) * 0.03,
    });
  }
}

function spawnPerfectBurst(t: WorldTarget): void {
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.18;
    const speed = 0.055 + Math.random() * 0.05;
    perfectBursts.push({
      worldX: t.worldX,
      height: t.postHeight,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed + 0.03,
      life: 1,
      size: 3 + Math.random() * 4,
      hueShift: Math.random() * 0.35,
    });
  }
}

// ============= GAME STATE =============
function gameOver(): void {
  if (gameState !== "PLAYING") return;
  gameState = "GAME_OVER";
  clearDraftTimer();

  isDrawing = false;
  stopBowPullLoop();
  drawProgress = 0;
  wobbleAmount = 0;

  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  triggerHaptic("error");
  playGameOverSfx();

  finalScoreEl.textContent = score.toString();
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
  upgradeScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseMusic();
  syncCharacterVideoState();
  updateOrientationState();
}

function startGame(): void {
  clearDraftTimer();

  score = 0;
  waveNumber = 1;
  waveHits = 0;
  resetUpgrades();
  timeRemaining = CONFIG.ROUND_TIME_MS;
  lastCountdownCueSecond = Math.ceil(timeRemaining / 1000);
  ammoCount = getMaxQuiverArrows();
  isReloading = false;
  reloadRemaining = 0;
  environmentTime = 0;

  world.cameraX = 0;
  horse.screenY = horse.baseY;

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  upgradeScreen.classList.add("hidden");

  beginWave(1);

  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  gameState = "PAUSED";

  isDrawing = false;
  stopBowPullLoop();
  drawProgress = 0;
  wobbleAmount = 0;

  pauseScreen.classList.remove("hidden");
  fireBtn.classList.add("hidden");
  pauseMusic();
  syncCharacterVideoState();
  updateOrientationState();
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  fireBtn.classList.remove("hidden");
  syncMusicState();
  syncCharacterVideoState();
  updateOrientationState();
  triggerHaptic("light");
}

function showStartScreen(): void {
  gameState = "START";
  clearDraftTimer();
  stopBowPullLoop();
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  upgradeScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
  pauseMusic();
  syncCharacterVideoState();
  updateOrientationState();
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
  const cloudVisibility = 1 - getDayNightDarkness() * 0.95;
  ctx.globalAlpha = c.opacity * cloudVisibility;
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

function getParallaxShift(speedFactor: number): number {
  return world.cameraX * speedFactor * pxPerUnit;
}

function getDayNightDarkness(): number {
  // Smooth full loop day->night->day where darkness is driven by moon altitude.
  const phase = (environmentTime * 0.000045) % (Math.PI * 2);
  const moonAltitude = Math.sin(phase + Math.PI);
  const moonLight = Math.max(0, Math.min(1, (moonAltitude + 0.1) / 1.1));
  return moonLight * moonLight;
}

function drawLayerRidge(
  baseY: number,
  ampA: number,
  ampB: number,
  freqA: number,
  freqB: number,
  speedFactor: number,
  color: string,
): void {
  const shift = getParallaxShift(speedFactor);
  const step = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + step; x += step) {
    const sampleX = x + shift;
    const ridgeY =
      baseY +
      Math.sin(sampleX * freqA + speedFactor * 9) * ampA +
      Math.sin(sampleX * freqB + speedFactor * 21) * ampB;
    ctx.lineTo(x, ridgeY);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

// ============= WORLD UPDATE =============
function updateWorld(dt: number): void {
  world.cameraX += world.speed * dt;
  horse.legPhase += dt * HORSE_RUN_CYCLE_RATE;

  // Keep the horse at a fixed vertical position (no sine-wave bobbing).
  horse.screenY = horse.baseY;

  // Wrap cameraX to prevent float overflow (no target reset)
  if (world.cameraX >= world.width) {
    world.cameraX -= world.width;
    for (const t of targets) t.worldX = ((t.worldX % world.width) + world.width) % world.width;
    for (const a of arrows) a.worldX = ((a.worldX % world.width) + world.width) % world.width;
  }
}

// ============= DRAWING =============
function drawSky(): void {
  const darkness = getDayNightDarkness();
  const phase = (environmentTime * 0.000045) % (Math.PI * 2);
  const sunAltitude = Math.sin(phase);
  const moonPhase = phase + Math.PI;
  const moonAltitude = Math.sin(moonPhase);
  // Keep both celestial bodies visible around the horizon to avoid abrupt switches.
  const sunVisibility = Math.max(0, Math.min(1, (sunAltitude + 0.14) / 0.34));
  const moonVisibility = Math.max(0, Math.min(1, (moonAltitude + 0.14) / 0.34));
  const sunX = w * (0.5 + Math.cos(phase) * 0.42);
  const sunY = horizonY * (0.92 - sunAltitude * 0.66);
  const moonX = w * (0.5 + Math.cos(moonPhase) * 0.42);
  const moonY = horizonY * (0.92 - moonAltitude * 0.66);
  const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
  const daySkyTop = [102, 185, 242];
  const daySkyMid = [142, 210, 255];
  const daySkyLow = [192, 224, 255];
  const nightSkyTop = [2, 6, 17];
  const nightSkyMid = [11, 23, 48];
  const nightSkyLow = [20, 36, 62];
  const blend = darkness;
  const topR = Math.round(daySkyTop[0] * (1 - blend) + nightSkyTop[0] * blend);
  const topG = Math.round(daySkyTop[1] * (1 - blend) + nightSkyTop[1] * blend);
  const topB = Math.round(daySkyTop[2] * (1 - blend) + nightSkyTop[2] * blend);
  const midR = Math.round(daySkyMid[0] * (1 - blend) + nightSkyMid[0] * blend);
  const midG = Math.round(daySkyMid[1] * (1 - blend) + nightSkyMid[1] * blend);
  const midB = Math.round(daySkyMid[2] * (1 - blend) + nightSkyMid[2] * blend);
  const lowR = Math.round(daySkyLow[0] * (1 - blend) + nightSkyLow[0] * blend);
  const lowG = Math.round(daySkyLow[1] * (1 - blend) + nightSkyLow[1] * blend);
  const lowB = Math.round(daySkyLow[2] * (1 - blend) + nightSkyLow[2] * blend);
  grad.addColorStop(0, "rgb(" + topR + ", " + topG + ", " + topB + ")");
  grad.addColorStop(0.45, "rgb(" + midR + ", " + midG + ", " + midB + ")");
  grad.addColorStop(1, "rgb(" + lowR + ", " + lowG + ", " + lowB + ")");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, horizonY + 5);

  const sunR = 38;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3);
  glow.addColorStop(0, "rgba(255, 245, 195, " + (0.62 * sunVisibility).toFixed(3) + ")");
  glow.addColorStop(0.45, "rgba(255, 159, 110, " + (0.26 * sunVisibility).toFixed(3) + ")");
  glow.addColorStop(1, "rgba(255, 120, 80, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  body.addColorStop(0, "#FFFEE7");
  body.addColorStop(0.7, "#FFD867");
  body.addColorStop(1, "#FFAE4A");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  const bandShiftA = getParallaxShift(0.02);
  const bandShiftB = getParallaxShift(0.035);
  ctx.fillStyle = "rgba(152, 232, 255, 0.11)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 260 - bandShiftA) % (w + 340)) - 120;
    const cy = horizonY * 0.25 + i * 18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 90, 24, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(224, 164, 255, 0.1)";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 320 - bandShiftB + 170) % (w + 380)) - 140;
    const cy = horizonY * 0.38 + i * 16;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 120, 30, -0.02, 0, Math.PI * 2);
    ctx.fill();
  }

  const nightAlpha = moonVisibility * 0.82;
  if (nightAlpha > 0.001) {
    const moonR = 24;

    // Dark sky veil first, then moon and stars above it.
    ctx.fillStyle = "rgba(8, 14, 28, " + (darkness * 0.38).toFixed(3) + ")";
    ctx.fillRect(0, 0, w, horizonY + 5);

    const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.2);
    moonGlow.addColorStop(0, "rgba(214, 234, 255, " + (0.35 * nightAlpha).toFixed(3) + ")");
    moonGlow.addColorStop(1, "rgba(214, 234, 255, 0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(228, 240, 255, " + (0.72 * nightAlpha).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Deterministic starfield with subtle twinkle.
    for (let i = 0; i < 70; i++) {
      const fx = (Math.sin(i * 97.13) * 43758.5453) % 1;
      const fy = (Math.sin(i * 53.71 + 8.2) * 24634.6345) % 1;
      const x = (fx < 0 ? fx + 1 : fx) * w;
      const y = (fy < 0 ? fy + 1 : fy) * (horizonY * 0.9);
      const twinkle = 0.5 + 0.5 * Math.sin(environmentTime * 0.003 + i * 1.7);
      const a = nightAlpha * (0.14 + twinkle * 0.42);
      const r = 0.8 + (i % 3) * 0.5;
      ctx.fillStyle = "rgba(228, 240, 255, " + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMountains(): void {
  drawLayerRidge(horizonY + 22, 24, 10, 0.006, 0.011, 0.08, "#6A4C3A");
  drawLayerRidge(horizonY + 34, 20, 9, 0.0075, 0.013, 0.15, "#8A5E42");
  drawLayerRidge(horizonY + 44, 15, 8, 0.009, 0.016, 0.22, "rgba(54, 124, 136, 0.75)");
}

function drawGround(): void {
  const darkness = getDayNightDarkness();
  // Base ground gradient stays green for the distant flatlands.
  const grad = ctx.createLinearGradient(0, horizonY, 0, h);
  grad.addColorStop(0, "#2F8B8A");
  grad.addColorStop(0.3, "#49A06F");
  grad.addColorStop(0.68, "#66B85A");
  grad.addColorStop(1, "#5E9A4D");
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Horizon line
  ctx.strokeStyle = "rgba(255, 210, 142, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.stroke();

  // Colorful rolling land strata (no grass tufts or dust streak overlays).
  drawLayerRidge(horizonY + (groundY - horizonY) * 0.34, 11, 5, 0.011, 0.020, 0.26, "rgba(39, 125, 154, 0.45)");
  drawLayerRidge(horizonY + (groundY - horizonY) * 0.48, 10, 4, 0.013, 0.022, 0.38, "rgba(69, 164, 104, 0.42)");
  drawLayerRidge(horizonY + (groundY - horizonY) * 0.64, 8, 4, 0.015, 0.026, 0.52, "rgba(113, 196, 79, 0.35)");

  // Closest layer: dusty road tones to separate the green horse details from the foreground.
  drawLayerRidge(horizonY + (groundY - horizonY) * 0.74, 7, 3, 0.016, 0.028, 0.62, "rgba(168, 137, 92, 0.42)");

  const roadTopY = groundY + Math.max(8, 10 * gameScale);
  const roadGrad = ctx.createLinearGradient(0, roadTopY, 0, h);
  roadGrad.addColorStop(0, "rgba(188, 154, 104, 0.62)");
  roadGrad.addColorStop(1, "rgba(126, 94, 58, 0.75)");
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, roadTopY, w, h - roadTopY);

  // Subtle moving road texture near the camera.
  const roadShift = getParallaxShift(0.72);
  ctx.strokeStyle = "rgba(114, 86, 54, 0.22)";
  ctx.lineWidth = Math.max(1, 1.4 * gameScale);
  for (let i = 0; i < 8; i++) {
    const y = roadTopY + 5 + i * Math.max(8, 10 * gameScale);
    ctx.beginPath();
    for (let x = -18; x <= w + 18; x += 18) {
      const wave = Math.sin((x + roadShift + i * 23) * 0.025) * 1.2;
      const py = y + wave;
      if (x <= -18) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  // Keep terrain readable at night with a simple cool tint.
  const terrainNightAlpha = darkness * 0.56;
  if (terrainNightAlpha > 0.001) {
    ctx.fillStyle = "rgba(10, 16, 24, " + terrainNightAlpha.toFixed(3) + ")";
    ctx.fillRect(0, horizonY, w, h - horizonY);
  }
}

function drawWorldTargets(): void {
  for (const t of targets) {
    const dx = getTargetLateralDx(t);

    const shimmer = getHeatShimmerAmount();
    const shimmerX = shimmer > 0 ? Math.sin((environmentTime * 0.004) + dx * 0.01) * (2.5 * shimmer) : 0;
    const screenX = horse.screenX + dx * pxPerUnit + shimmerX;
    if (screenX < -60 || screenX > w + 60) continue;

    // Flat side-scroll projection: targets only translate horizontally.
    const scale = pxPerUnit;
    const postHeightPx = t.postHeight * scale;
    const shimmerY = shimmer > 0 ? Math.cos((environmentTime * 0.003) + dx * 0.008) * (1.6 * shimmer) : 0;
    const faceY = -postHeightPx + shimmerY;
    const visualR = t.radius * scale;

    ctx.save();
    ctx.translate(screenX, groundY);

    if (t.kind === "stoneColumn") {
      const colW = Math.max(10, visualR * 1.08);
      const colH = Math.max(26, postHeightPx + visualR * 0.9);
      const colTopY = -colH;
      const stoneGrad = ctx.createLinearGradient(0, colTopY, 0, 0);
      stoneGrad.addColorStop(0, "#D5C9AF");
      stoneGrad.addColorStop(0.5, "#B4A07D");
      stoneGrad.addColorStop(1, "#8E7754");
      ctx.fillStyle = stoneGrad;
      ctx.beginPath();
      ctx.roundRect(-colW * 0.5, colTopY, colW, colH, Math.max(4, 5 * gameScale));
      ctx.fill();

      ctx.strokeStyle = "rgba(74, 57, 35, 0.6)";
      ctx.lineWidth = Math.max(1.1, 1.7 * gameScale);
      ctx.beginPath();
      ctx.moveTo(-colW * 0.3, colTopY + colH * 0.18);
      ctx.lineTo(-colW * 0.22, colTopY + colH * 0.84);
      ctx.moveTo(colW * 0.12, colTopY + colH * 0.1);
      ctx.lineTo(colW * 0.2, colTopY + colH * 0.72);
      ctx.stroke();

      if (t.embeddedArrow) {
        const arrowRenderScale = 3;
        const arrowLen = 22 * gameScale * arrowRenderScale;
        const impactX = t.embeddedArrow.offsetX * pxPerUnit;
        const impactY = -t.postHeight * scale - t.embeddedArrow.offsetY * pxPerUnit;
        const angle = t.embeddedArrow.angle;
        const embedDepth = Math.max(8, arrowLen * 0.28);
        const tipX = impactX;
        const tipY = impactY;
        const visibleTipX = tipX - Math.cos(angle) * embedDepth;
        const visibleTipY = tipY - Math.sin(angle) * embedDepth;
        const tailX = tipX - Math.cos(angle) * arrowLen;
        const tailY = tipY - Math.sin(angle) * arrowLen;
        const hs = 6 * gameScale * arrowRenderScale;
        const shaftInset = hs * 0.78;
        const shaftTipX = visibleTipX - Math.cos(angle) * shaftInset;
        const shaftTipY = visibleTipY - Math.sin(angle) * shaftInset;

        ctx.strokeStyle = "#5C3A1E";
        ctx.lineWidth = Math.max(1.5, 2.5 * gameScale * arrowRenderScale * 0.7);
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(shaftTipX, shaftTipY);
        ctx.stroke();
        ctx.lineCap = "round";

        const fSize = 5 * gameScale * arrowRenderScale;
        const backAngle = angle + Math.PI;
        drawArrowFletching(tailX, tailY, backAngle, fSize);
      }

      ctx.restore();
      continue;
    }

    const drewUiTarget = false;
    const drewOrnate =
      !drewUiTarget &&
      ornateTargetLoaded &&
      !!ornateTargetCanvas &&
      !!ornateTargetBounds &&
      t.kind !== "stoneColumn";

    if (drewUiTarget) {
      // Reserved for a future dedicated target-face asset.
    } else if (drewOrnate) {
      const bounds = ornateTargetBounds as SpriteBounds;
      const targetCenterFromBottomNorm = 0.72;
      const spriteH = Math.max(46, postHeightPx / targetCenterFromBottomNorm);
      const spriteW = spriteH * (bounds.w / Math.max(1, bounds.h));
      const spriteTopY = faceY - spriteH * (1 - targetCenterFromBottomNorm);
      ctx.drawImage(
        ornateTargetCanvas as HTMLCanvasElement,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        -spriteW * 0.5,
        spriteTopY,
        spriteW,
        spriteH,
      );
    } else {
      // Post
      ctx.strokeStyle = "#5A3A1E";
      ctx.lineWidth = Math.max(2, 3 * gameScale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, faceY);
      ctx.stroke();

      // Post cap
      const capW = Math.max(4, 10 * scale);
      const capH = Math.max(2, 6 * scale);
      ctx.fillStyle = "#3D2810";
      ctx.fillRect(-capW / 2, faceY - capH / 2, capW, capH);

      // Slight 3D target depth: rear rim offset.
      const rimDepth = Math.max(2, 3.2 * gameScale);
      ctx.fillStyle = t.hit ? "#6A4428" : "#4F2E1D";
      ctx.beginPath();
      ctx.arc(rimDepth, faceY + rimDepth * 0.15, visualR, 0, Math.PI * 2);
      ctx.fill();

      // Target face
      if (t.hit) {
        const woodGrad = ctx.createRadialGradient(
          -visualR * 0.2,
          faceY - visualR * 0.2,
          visualR * 0.1,
          0,
          faceY,
          visualR,
        );
        woodGrad.addColorStop(0, "#C99757");
        woodGrad.addColorStop(0.5, "#A8703F");
        woodGrad.addColorStop(1, "#7F532E");
        ctx.fillStyle = woodGrad;
        ctx.beginPath();
        ctx.arc(0, faceY, visualR, 0, Math.PI * 2);
        ctx.fill();

        // Subtle wood grain rings.
        for (let i = 1; i <= 3; i++) {
          const r = visualR * (0.25 + i * 0.2);
          ctx.strokeStyle = "rgba(70, 43, 25, 0.35)";
          ctx.lineWidth = Math.max(0.8, 1.1 * gameScale);
          ctx.beginPath();
          ctx.arc(0, faceY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < CONFIG.RING_COLORS.length; i++) {
          const r = visualR * (1 - i / CONFIG.RING_COLORS.length);
          if (r < 0.5) continue;
          ctx.fillStyle = CONFIG.RING_COLORS[i];
          ctx.beginPath();
          ctx.arc(0, faceY, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Target outline
      if (visualR > 1) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = Math.max(1, 1.5 * gameScale);
        ctx.beginPath();
        ctx.arc(0, faceY, visualR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (t.embeddedArrow) {
      const arrowRenderScale = 3;
      const arrowLen = 22 * gameScale * arrowRenderScale;
      const impactX = t.embeddedArrow.offsetX * pxPerUnit;
      const impactY = faceY - t.embeddedArrow.offsetY * pxPerUnit;
      const angle = t.embeddedArrow.angle;
      const embedDepth = Math.max(8, arrowLen * 0.28);
      const tipX = impactX;
      const tipY = impactY;
      const visibleTipX = tipX - Math.cos(angle) * embedDepth;
      const visibleTipY = tipY - Math.sin(angle) * embedDepth;
      const tailX = tipX - Math.cos(angle) * arrowLen;
      const tailY = tipY - Math.sin(angle) * arrowLen;
      const hs = 6 * gameScale * arrowRenderScale;
      const shaftInset = hs * 0.78;
      const shaftTipX = visibleTipX - Math.cos(angle) * shaftInset;
      const shaftTipY = visibleTipY - Math.sin(angle) * shaftInset;

      ctx.strokeStyle = "#5C3A1E";
      ctx.lineWidth = Math.max(1.5, 2.5 * gameScale * arrowRenderScale * 0.7);
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(shaftTipX, shaftTipY);
      ctx.stroke();
      ctx.lineCap = "round";

      const fSize = 5 * gameScale * arrowRenderScale;
      const backAngle = angle + Math.PI;
      drawArrowFletching(tailX, tailY, backAngle, fSize);
    }

    ctx.restore();
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return "rgba(" + r + ", " + g + ", " + b + ", " + alpha.toFixed(3) + ")";
    }
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", ", " + alpha.toFixed(3) + ")");
  }
  if (color.startsWith("rgba(")) {
    return color.replace(/,\s*[\d.]+\)$/, ", " + alpha.toFixed(3) + ")");
  }
  return "rgba(255, 255, 255, " + alpha.toFixed(3) + ")";
}

function drawRingBursts(): void {
  for (const burst of ringBursts) {
    let dx = burst.worldX - world.cameraX;
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;
    const screenX = horse.screenX + dx * pxPerUnit;
    const screenY = groundY - burst.height * pxPerUnit;
    if (screenX < -80 || screenX > w + 80) continue;

    const life = Math.max(0, burst.life);
    const alpha = Math.min(0.9, life * 0.9);
    const r = burst.radius * pxPerUnit;
    const ringW = Math.max(1.2, burst.ringWidth * pxPerUnit * life);
    ctx.strokeStyle = colorWithAlpha(burst.color, alpha);
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(screenX, screenY, Math.max(1, r), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPerfectBursts(): void {
  for (const p of perfectBursts) {
    let dx = p.worldX - world.cameraX;
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;
    const sx = horse.screenX + dx * pxPerUnit;
    const sy = groundY - p.height * pxPerUnit;
    if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) continue;

    const alpha = Math.max(0, p.life);
    const core = Math.max(1.2, p.size * p.life * gameScale);
    const glow = core * (2.2 + p.hueShift);
    const tailScale = Math.max(5, 60 * gameScale * p.life);
    const tailX = sx - (p.vx * pxPerUnit) * tailScale;
    const tailY = sy + (p.vy * pxPerUnit) * tailScale;

    ctx.strokeStyle = "rgba(255, 244, 190, " + (alpha * 0.75).toFixed(3) + ")";
    ctx.lineWidth = Math.max(1, core * 0.45);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 230, 160, " + (alpha * 0.4).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(sx, sy, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 247, 210, " + (alpha * 0.95).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(sx, sy, core, 0, Math.PI * 2);
    ctx.fill();

    if (p.life > 0.35) {
      const cross = core * (2 + p.hueShift * 1.8);
      ctx.strokeStyle = "rgba(255, 233, 156, " + (alpha * 0.72).toFixed(3) + ")";
      ctx.lineWidth = Math.max(0.8, core * 0.22);
      ctx.beginPath();
      ctx.moveTo(sx - cross, sy);
      ctx.lineTo(sx + cross, sy);
      ctx.moveTo(sx, sy - cross);
      ctx.lineTo(sx, sy + cross);
      ctx.stroke();
    }
  }
}

function drawHorseAndArcher(): void {
  const hx = horse.screenX;
  const hy = horse.screenY;
  const phase = horse.legPhase;
  const horseScale = MOUNTED_CHARACTER_SCALE * gameScale;
  const strideSwing = Math.sin(phase);
  const stomp = Math.max(0, Math.sin(phase * 2.0));
  const bob = strideSwing * 0.85 - stomp * 1.7;

  ctx.save();
  ctx.translate(hx, hy + bob);
  ctx.scale(horseScale, horseScale);

  // Horse Colors - Steppe Dun / Grey
  const horseColor = "#D8D8DF";
  const horseDarkColor = "#A0A0AA";
  const horseLightColor = "#F0F0F5";
  const metalColor = "#9DA5AF";

  // Ground shadow - more dynamic
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(2, 4 + stomp * 1.5, 62 + stomp * 8, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // HORSE LEGS - asymmetrical gallop cycle
  ctx.strokeStyle = horseDarkColor;
  ctx.lineWidth = 6.6;
  ctx.lineCap = "round";
  const gallopCycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const suspensionStart = 0.72;
  const suspensionEnd = 0.88;
  const inSuspension = gallopCycle >= suspensionStart && gallopCycle <= suspensionEnd;
  const legPositions = [
    // Order for a right-lead gallop: LH -> RH -> LF -> RF -> suspension
    { base: -28, strike: 0.0 },   // left hind
    { base: -10, strike: 0.16 },  // right hind
    { base: 10, strike: 0.34 },   // left fore
    { base: 28, strike: 0.52 },   // right fore (lead)
  ];

  const getLegPose = (leg: typeof legPositions[0]) => {
    const local = ((gallopCycle - leg.strike) % 1 + 1) % 1;
    const stanceDur = 0.22;
    const travel = 18;
    let hoofX = leg.base;
    let hoofY = 8;
    let kneeX = leg.base;
    let kneeY = -14;
    let liftAmount = 0;

    if (local < stanceDur) {
      // Stance: hoof on/near ground while body passes over it.
      const t = local / stanceDur;
      hoofX = leg.base + (0.5 - t) * travel;
      hoofY = 8 + Math.sin(t * Math.PI) * 0.8;
      kneeX = leg.base + (0.35 - t * 0.7) * travel * 0.44;
      kneeY = -14 + Math.sin(t * Math.PI) * 2.6;
    } else {
      // Swing: hoof travels forward with clear lift.
      const t = (local - stanceDur) / (1 - stanceDur);
      liftAmount = Math.sin(t * Math.PI) * 15;
      hoofX = leg.base + (-0.5 + t) * travel;
      hoofY = 8 - liftAmount;
      kneeX = leg.base + (-0.25 + t * 0.55) * travel * 0.58;
      kneeY = -14 - liftAmount * 0.33;
    }

    // Gallop suspension: brief airborne window for all four hooves.
    if (inSuspension) {
      const suspT = (gallopCycle - suspensionStart) / (suspensionEnd - suspensionStart);
      const suspLift = 7 + Math.sin(suspT * Math.PI) * 3;
      hoofY -= suspLift;
      kneeY -= suspLift * 0.45;
    }

    return {
      hoofX,
      hoofY,
      kneeX,
      kneeY,
      liftFrac: Math.max(0, Math.min(1, liftAmount / 15)),
    };
  };

  const drawLeg = (leg: typeof legPositions[0]) => {
    const pose = getLegPose(leg);

    ctx.strokeStyle = horseDarkColor;
    ctx.lineWidth = 6.6;
    ctx.beginPath();
    ctx.moveTo(leg.base, -24);
    ctx.lineTo(pose.kneeX, pose.kneeY);
    ctx.lineTo(pose.hoofX, pose.hoofY);
    ctx.stroke();

    // Hoof
    ctx.fillStyle = "#333336";
    ctx.beginPath();
    ctx.ellipse(pose.hoofX, pose.hoofY + 2, 4.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const hindFlex = (getLegPose(legPositions[0]).liftFrac + getLegPose(legPositions[1]).liftFrac) * 0.5;
  const foreFlex = (getLegPose(legPositions[2]).liftFrac + getLegPose(legPositions[3]).liftFrac) * 0.5;
  const hindMuscleShiftY = -hindFlex * 1.8;
  const foreMuscleShiftY = -foreFlex * 1.6;
  const hindMuscleScale = 1 + hindFlex * 0.14;
  const foreMuscleScale = 1 + foreFlex * 0.12;

  // Draw rear pair first
  drawLeg(legPositions[0]);
  drawLeg(legPositions[2]);

  // HORSE BODY - layered muscle volumes (hindquarter, barrel, shoulder, chest)
  const hindGrad = ctx.createRadialGradient(-22, -41, 6, -18, -39, 30);
  hindGrad.addColorStop(0, horseLightColor);
  hindGrad.addColorStop(1, horseDarkColor);
  ctx.fillStyle = hindGrad;
  ctx.beginPath();
  ctx.ellipse(-20, -40 + hindMuscleShiftY, 30 * hindMuscleScale, 21, -0.08, 0, Math.PI * 2);
  ctx.fill();

  const barrelGrad = ctx.createRadialGradient(-2, -39, 10, 0, -38, 45);
  barrelGrad.addColorStop(0, horseLightColor);
  barrelGrad.addColorStop(0.62, horseColor);
  barrelGrad.addColorStop(1, horseDarkColor);
  ctx.fillStyle = barrelGrad;
  ctx.beginPath();
  ctx.ellipse(-1, -39, 33, 23, 0, 0, Math.PI * 2);
  ctx.fill();

  const shoulderGrad = ctx.createRadialGradient(19, -41, 5, 20, -40, 24);
  shoulderGrad.addColorStop(0, horseLightColor);
  shoulderGrad.addColorStop(1, horseDarkColor);
  ctx.fillStyle = shoulderGrad;
  ctx.beginPath();
  ctx.ellipse(20, -40 + foreMuscleShiftY, 23 * foreMuscleScale, 18, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(31, -43 + foreMuscleShiftY * 0.85, 12 * (1 + foreFlex * 0.08), 10, 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Surface muscle cues
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-24, -41 + hindMuscleShiftY * 0.8, 12 * (1 + hindFlex * 0.08), Math.PI * 0.7, Math.PI * 1.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(15, -41 + foreMuscleShiftY * 0.75, 11 * (1 + foreFlex * 0.08), Math.PI * 1.42, Math.PI * 2.14);
  ctx.stroke();

  // Draw front pair after body
  drawLeg(legPositions[1]);
  drawLeg(legPositions[3]);

  // NECK - rebuilt from scratch with a broad shoulder root.
  const neckGrad = ctx.createLinearGradient(22, -56, 64, -98);
  neckGrad.addColorStop(0, horseColor);
  neckGrad.addColorStop(1, horseLightColor);
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(19, -47);
  ctx.quadraticCurveTo(34, -56, 49, -62);
  ctx.quadraticCurveTo(59, -66, 64, -69);
  ctx.quadraticCurveTo(56, -72, 45, -69);
  ctx.quadraticCurveTo(31, -64, 18, -56);
  ctx.quadraticCurveTo(12, -52, 9, -49);
  ctx.closePath();
  ctx.fill();

  // Shoulder blend for a clear neck-to-body connection.
  ctx.fillStyle = horseDarkColor;
  ctx.beginPath();
  ctx.moveTo(9, -49);
  ctx.quadraticCurveTo(4, -44, 1, -40);
  ctx.quadraticCurveTo(11, -38, 22, -41);
  ctx.quadraticCurveTo(27, -44, 23, -48);
  ctx.closePath();
  ctx.fill();

  // HEAD - rebuilt from scratch with a horse profile silhouette.
  ctx.save();
  ctx.translate(64, -71);
  ctx.rotate(0.12 + Math.sin(phase) * 0.03);

  const headGrad = ctx.createLinearGradient(-24, -15, 22, 12);
  headGrad.addColorStop(0, horseLightColor);
  headGrad.addColorStop(1, horseColor);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.moveTo(-18, -4);
  ctx.quadraticCurveTo(-10, -13, 1, -13);
  ctx.quadraticCurveTo(13, -13, 22, -4);
  ctx.quadraticCurveTo(27, 2, 22, 8);
  ctx.quadraticCurveTo(11, 12, -2, 11);
  ctx.quadraticCurveTo(-14, 10, -22, 3);
  ctx.closePath();
  ctx.fill();

  // Poll/jowl bridge to tuck head into neck.
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(-21, -4);
  ctx.quadraticCurveTo(-29, 2, -28, 10);
  ctx.quadraticCurveTo(-20, 13, -11, 7);
  ctx.quadraticCurveTo(-15, 1, -19, -3);
  ctx.closePath();
  ctx.fill();

  // Pointed ears attached to skull line.
  ctx.fillStyle = horseDarkColor;
  ctx.beginPath();
  ctx.moveTo(-11, -13);
  ctx.lineTo(-17, -27);
  ctx.lineTo(-8, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(-5, -13);
  ctx.lineTo(-9, -28);
  ctx.lineTo(1, -17);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(6, -1.8, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(6.7, -2.5, 0.65, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle / nostril
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.arc(18, 3.2, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // TAIL - fuller horse tail with layered hair strands
  const tailSwing = Math.sin(phase * 0.5) * 10;
  ctx.fillStyle = "#55555F";
  ctx.beginPath();
  ctx.moveTo(-44, -50);
  ctx.quadraticCurveTo(-62 + tailSwing * 0.6, -42, -74 + tailSwing, -27);
  ctx.quadraticCurveTo(-88 + tailSwing, -10, -75 + tailSwing * 0.7, -4);
  ctx.quadraticCurveTo(-60 + tailSwing * 0.35, -14, -50, -30);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#44444E";
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const rootX = -46 + t * 7;
    const rootY = -48 + t * 2;
    const strandEndX = -72 + tailSwing * (0.8 + t * 0.5) - t * 6;
    const strandEndY = -10 + t * 5;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(rootX - 12 + tailSwing * 0.35, rootY + 8, strandEndX, strandEndY);
    ctx.stroke();
  }

  // MANE - more fluid
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2.8;
  for (let i = 0; i < 5; i++) {
    const mx = 45 + i * 2.7;
    const my = -66 - i * 2.5;
    const windOffset = Math.sin(phase * 0.7 + i * 0.8) * 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx - 10 + windOffset, my - 5, mx - 15 + windOffset, my + 4);
    ctx.stroke();
  }

  // SADDLE CLOTH - simple draped blanket
  const clothX = -20;
  const clothY = -61;
  const clothW = 44;
  const clothH = 16;
  const clothGrad = ctx.createLinearGradient(clothX, clothY, clothX, clothY + clothH);
  clothGrad.addColorStop(0, "#A13A24");
  clothGrad.addColorStop(1, "#6E2518");
  ctx.fillStyle = clothGrad;
  ctx.beginPath();
  ctx.moveTo(clothX, clothY + 2);
  ctx.quadraticCurveTo(clothX + clothW * 0.5, clothY - 4, clothX + clothW, clothY + 1);
  ctx.lineTo(clothX + clothW - 1, clothY + clothH - 2);
  ctx.quadraticCurveTo(clothX + clothW * 0.5, clothY + clothH + 4, clothX + 1, clothY + clothH - 1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(240, 198, 132, 0.35)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(clothX + 3, clothY + clothH - 2);
  ctx.quadraticCurveTo(clothX + clothW * 0.5, clothY + clothH + 3, clothX + clothW - 3, clothY + clothH - 2);
  ctx.stroke();

  // RIDER / ARCHER
  const riderBaseX = -8;
  const riderBaseY = -66;

  // Riding legs: near leg visible, far leg mostly hidden by horse body.
  ctx.fillStyle = "rgba(50, 33, 19, 0.55)";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 10, riderBaseY + 10);
  ctx.lineTo(riderBaseX - 4, riderBaseY + 16);
  ctx.lineTo(riderBaseX + 3, riderBaseY + 8);
  ctx.lineTo(riderBaseX - 6, riderBaseY + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#332211";
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 8, riderBaseY + 8);
  ctx.lineTo(riderBaseX + 20, riderBaseY + 26);
  ctx.lineTo(riderBaseX + 30, riderBaseY + 25);
  ctx.lineTo(riderBaseX + 16, riderBaseY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2A1B10";
  ctx.beginPath();
  ctx.ellipse(riderBaseX + 29, riderBaseY + 27, 5, 2.8, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Capsule torso (mounted posture)
  const deelColor = "#2F4F7A";
  const deelLight = "#4F76A3";
  const deelGrad = ctx.createLinearGradient(riderBaseX, riderBaseY - 24, riderBaseX, riderBaseY + 16);
  deelGrad.addColorStop(0, deelLight);
  deelGrad.addColorStop(1, deelColor);
  ctx.fillStyle = deelGrad;
  ctx.beginPath();
  ctx.roundRect(riderBaseX - 13, riderBaseY - 24, 28, 42, 14);
  ctx.fill();

  // Belt/Sash (Buse)
  ctx.fillStyle = "#D4AF37"; // Golden sash
  ctx.beginPath();
  ctx.roundRect(riderBaseX - 13, riderBaseY - 2, 28, 6, 3);
  ctx.fill();

  // FACE / HEAD
  ctx.fillStyle = "#E5C298"; // Skin tone
  ctx.beginPath();
  ctx.arc(riderBaseX + 1, riderBaseY - 32, 9, 0, Math.PI * 2);
  ctx.fill();

  // Features
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(riderBaseX + 4, riderBaseY - 34, 3, 1.5); // Eye
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 3, riderBaseY - 28);
  ctx.quadraticCurveTo(riderBaseX + 7, riderBaseY - 28, riderBaseX + 9, riderBaseY - 26); // Mustache
  ctx.stroke();

  // HAT (Malgais)
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 11, riderBaseY - 35);
  ctx.lineTo(riderBaseX + 1, riderBaseY - 55);
  ctx.lineTo(riderBaseX + 13, riderBaseY - 35);
  ctx.closePath();
  ctx.fill();
  // Hat trim (fur)
  ctx.fillStyle = "#CDBA8F";
  ctx.beginPath();
  ctx.roundRect(riderBaseX - 13, riderBaseY - 40, 27, 8, 4);
  ctx.fill();
  // Tassel
  ctx.strokeStyle = "#FF0000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 1, riderBaseY - 55);
  ctx.lineTo(riderBaseX - 4, riderBaseY - 52);
  ctx.stroke();

  // BOW
  const bowCenterX = riderBaseX + 18;
  const bowCenterY = riderBaseY - 18;
  const bowAngle = -Math.PI * 0.25;
  const bowR = 24;
  const maxPull = 20;
  const pullBack = isDrawing ? drawProgress * maxPull : 0;
  const pullDirX = -Math.cos(bowAngle);
  const pullDirY = -Math.sin(bowAngle);
  const stringPullX = bowCenterX + pullDirX * pullBack;
  const stringPullY = bowCenterY + pullDirY * pullBack;

  // Bow Arm
  ctx.strokeStyle = "#E5C298";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 8, riderBaseY - 16);
  ctx.lineTo(bowCenterX - 2, bowCenterY + 2);
  ctx.stroke();

  // Recurve Bow Body
  ctx.strokeStyle = "#4D2E1D";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  // Drawing a simplified recurve shape with two arcs
  ctx.arc(bowCenterX, bowCenterY, bowR, bowAngle - 1.1, bowAngle + 1.1, false);
  ctx.stroke();
  
  // Horn/Sinew tips (recurve ends)
  ctx.strokeStyle = "#221100";
  ctx.lineWidth = 4;
  const topTipX = bowCenterX + Math.cos(bowAngle - 1.1) * bowR;
  const topTipY = bowCenterY + Math.sin(bowAngle - 1.1) * bowR;
  const botTipX = bowCenterX + Math.cos(bowAngle + 1.1) * bowR;
  const botTipY = bowCenterY + Math.sin(bowAngle + 1.1) * bowR;
  
  // Small recurve flicks at ends
  ctx.beginPath();
  ctx.moveTo(topTipX, topTipY);
  ctx.lineTo(topTipX + Math.cos(bowAngle - 1.5) * 6, topTipY + Math.sin(bowAngle - 1.5) * 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(botTipX, botTipY);
  ctx.lineTo(botTipX + Math.cos(bowAngle + 1.5) * 6, botTipY + Math.sin(bowAngle + 1.5) * 6);
  ctx.stroke();

  // String
  ctx.strokeStyle = "#EEE";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const stringTopX = topTipX + Math.cos(bowAngle - 1.5) * 5;
  const stringTopY = topTipY + Math.sin(bowAngle - 1.5) * 5;
  const stringBotX = botTipX + Math.cos(bowAngle + 1.5) * 5;
  const stringBotY = botTipY + Math.sin(bowAngle + 1.5) * 5;
  
  ctx.moveTo(stringTopX, stringTopY);
  if (isDrawing && drawProgress > 0.01) {
    ctx.lineTo(stringPullX, stringPullY);
  }
  ctx.lineTo(stringBotX, stringBotY);
  ctx.stroke();

  // Draw Arm - smooth two-joint motion (no elbow snap/pop)
  const shoulderX = riderBaseX + 2;
  const shoulderY = riderBaseY - 18;
  const pullT = isDrawing ? Math.max(0, Math.min(1, drawProgress)) : 0;
  const easedPullT = pullT * pullT * (3 - 2 * pullT);
  const restHandX = riderBaseX - 5;
  const restHandY = riderBaseY - 10;
  const handX = restHandX + (stringPullX - restHandX) * easedPullT;
  const handY = restHandY + (stringPullY - restHandY) * easedPullT;
  const restElbowX = riderBaseX - 2;
  const restElbowY = riderBaseY - 20;
  const pullElbowX = riderBaseX - 9;
  const pullElbowY = riderBaseY - 23;
  let elbowX = restElbowX + (pullElbowX - restElbowX) * easedPullT;
  let elbowY = restElbowY + (pullElbowY - restElbowY) * easedPullT;
  const upperToHandX = handX - shoulderX;
  const upperToHandY = handY - shoulderY;
  const dist = Math.sqrt(upperToHandX * upperToHandX + upperToHandY * upperToHandY);
  if (dist > 0.001) {
    const nx = -upperToHandY / dist;
    const ny = upperToHandX / dist;
    const bend = 3.2 + easedPullT * 4.8;
    elbowX += nx * bend;
    elbowY += ny * bend;
  }

  ctx.strokeStyle = "#E5C298";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  // Arrow while drawing
  if (isDrawing && drawProgress > 0.05) {
    const nockX = stringPullX;
    const nockY = stringPullY;
    const arrowLen = 32;
    const aDirX = Math.cos(bowAngle);
    const aDirY = Math.sin(bowAngle);
    const tipX = nockX + aDirX * arrowLen;
    const tipY = nockY + aDirY * arrowLen;

    ctx.strokeStyle = "#3D2616";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(nockX, nockY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = metalColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(bowAngle - 0.35) * 7, tipY - Math.sin(bowAngle - 0.35) * 7);
    ctx.lineTo(tipX - Math.cos(bowAngle + 0.35) * 7, tipY - Math.sin(bowAngle + 0.35) * 7);
    ctx.closePath();
    ctx.fill();

    const backAngle = bowAngle + Math.PI;
    drawArrowFletching(nockX, nockY, backAngle, 4.5);
  }

  ctx.restore();
}

function drawArrowFletching(tailX: number, tailY: number, backAngle: number, fSize: number): void {
  const spread = 0.6;
  const featherWidth = fSize * 0.9;
  const featherLen = fSize * 0.7;
  ctx.fillStyle = "rgba(240, 245, 255, 0.9)";

  for (const side of [-1, 1]) {
    const sideSpread = spread * side;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(
      tailX + Math.cos(backAngle + sideSpread) * featherWidth,
      tailY + Math.sin(backAngle + sideSpread) * featherWidth,
    );
    ctx.lineTo(
      tailX + Math.cos(backAngle + sideSpread * 0.45) * featherLen,
      tailY + Math.sin(backAngle + sideSpread * 0.45) * featherLen,
    );
    ctx.closePath();
    ctx.fill();
  }
}

function drawArrows(): void {
  for (const arrow of arrows) {
    if (!arrow.active) continue;

    let dx = arrow.worldX - world.cameraX;
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;

    const screenX = horse.screenX + dx * pxPerUnit;

    const scale = pxPerUnit;
    const baseY = groundY;
    const screenY = baseY - arrow.height * scale;

    if (screenX < -50 || screenX > w + 50) continue;
    if (screenY < -50 || screenY > h + 50) continue;

    const arrowRenderScale = 3;
    const arrowLen = 22 * gameScale * arrowRenderScale;
    const angle = arrow.stuckInGround ? arrow.impactAngle : Math.atan2(-arrow.vy, arrow.vx);

    let tipX: number;
    let tipY: number;
    let tailX: number;
    let tailY: number;
    if (arrow.stuckInGround) {
      const embedDepth = Math.max(8, arrowLen * 0.28);
      tipX = screenX;
      tipY = groundY + embedDepth;
      tailX = tipX - Math.cos(angle) * arrowLen;
      tailY = tipY - Math.sin(angle) * arrowLen;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, groundY);
      ctx.clip();
    } else {
      tipX = screenX + Math.cos(angle) * arrowLen * 0.6;
      tipY = screenY + Math.sin(angle) * arrowLen * 0.6;
      tailX = screenX - Math.cos(angle) * arrowLen * 0.4;
      tailY = screenY - Math.sin(angle) * arrowLen * 0.4;
    }

    const hs = 6 * gameScale * arrowRenderScale;
    let shaftTipX = tipX;
    let shaftTipY = tipY;
    if (!arrow.stuckInGround) {
      const shaftInset = hs * 0.78;
      shaftTipX -= Math.cos(angle) * shaftInset;
      shaftTipY -= Math.sin(angle) * shaftInset;
    }

    // Shaft
    ctx.strokeStyle = "#5C3A1E";
    ctx.lineWidth = Math.max(1.5, 2.5 * gameScale * arrowRenderScale * 0.7);
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shaftTipX, shaftTipY);
    ctx.stroke();
    ctx.lineCap = "round";

    if (!arrow.stuckInGround) {
      // Arrowhead
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - Math.cos(angle - 0.4) * hs, tipY - Math.sin(angle - 0.4) * hs);
      ctx.lineTo(tipX - Math.cos(angle + 0.4) * hs, tipY - Math.sin(angle + 0.4) * hs);
      ctx.closePath();
      ctx.fill();
    }

    // Fletching
    const fSize = 5 * gameScale * arrowRenderScale;
    const backAngle = angle + Math.PI;
    drawArrowFletching(tailX, tailY, backAngle, fSize);

    if (arrow.stuckInGround) {
      ctx.restore();
    }

    if (!arrow.stuckInGround && arrow.magnetFxStrength > 0) {
      let fxDx = arrow.magnetTargetWorldX - world.cameraX;
      if (fxDx > world.width / 2) fxDx -= world.width;
      if (fxDx < -world.width / 2) fxDx += world.width;
      const targetScreenX = horse.screenX + fxDx * pxPerUnit;
      const targetScreenY = groundY - arrow.magnetTargetHeight * pxPerUnit;
      const fxAlpha = Math.min(0.5, 0.16 + arrow.magnetFxStrength * 0.5);
      const lineDx = targetScreenX - screenX;
      const lineDy = targetScreenY - screenY;
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
      const targetRadiusPx = Math.max(0, arrow.magnetTargetRadius * pxPerUnit);
      const activationLenPx = Math.max(
        CONFIG.MAGNET_RADIUS * pxPerUnit * 2.2,
        targetRadiusPx + CONFIG.MAGNET_RADIUS * pxPerUnit * 1.6,
      ) * 2;
      const redZoneStartRatio = lineLen > 0.001
        ? Math.max(0, Math.min(1, (lineLen - activationLenPx) / lineLen))
        : 0;
      const splitX = screenX + lineDx * redZoneStartRatio;
      const splitY = screenY + lineDy * redZoneStartRatio;

      ctx.lineWidth = Math.max(1.2, 2.2 * gameScale * arrow.magnetFxStrength);
      if (redZoneStartRatio > 0.001) {
        ctx.strokeStyle = "rgba(120, 230, 255, " + fxAlpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(splitX, splitY);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255, 90, 90, " + Math.min(0.8, fxAlpha + 0.15).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(splitX, splitY);
      ctx.lineTo(targetScreenX, targetScreenY);
      ctx.stroke();

      ctx.fillStyle = "rgba(170, 245, 255, " + (0.14 + arrow.magnetFxStrength * 0.28).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(3, 6 * gameScale * arrow.magnetFxStrength), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWindReaderPreview(): void {
  if (upgradeLevels.windReader <= 0) return;
  if (!isDrawing) return;

  const baseAngle = Math.PI / 4;
  const spawnPoint = getArrowSpawnPointWorld();
  const speed = getArrowLaunchSpeed(Math.max(drawProgress, CONFIG.MIN_DRAW_TO_FIRE));
  let simX = spawnPoint.worldX;
  let simY = spawnPoint.height;
  let simVx = world.speed + speed * Math.cos(baseAngle);
  let simVy = speed * Math.sin(baseAngle);
  const stepDt = 28;

  ctx.save();
  ctx.setLineDash([6 * gameScale, 7 * gameScale]);
  ctx.lineWidth = Math.max(1.2, 1.9 * gameScale);
  ctx.strokeStyle = "rgba(155, 240, 255, 0.7)";
  ctx.beginPath();

  for (let i = 0; i < 26; i++) {
    simVy -= CONFIG.ARROW_GRAVITY * stepDt;
    simVx += getCrosswindAccel() * stepDt;
    simX += simVx * stepDt;
    simY += simVy * stepDt;

    let dx = simX - world.cameraX;
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;
    const sx = horse.screenX + dx * pxPerUnit;
    const sy = groundY - simY * pxPerUnit;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) break;
  }

  ctx.stroke();
  ctx.restore();
}

function drawScorePopups(): void {
  for (const sp of scorePopups) {
    ctx.globalAlpha = sp.life;
    ctx.fillStyle = sp.color;
    ctx.font = `bold ${Math.round(22 * gameScale)}px 'Sora', sans-serif`;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(sp.text, sp.x, sp.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawCircularActionMeter(
  centerX: number,
  centerY: number,
  progress: number,
  label: string,
  progressColor: string,
  trackColor: string,
  labelColor: string,
  clockwise: boolean,
): void {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const ringRadius = Math.max(15, 19 * gameScale);
  const ringWidth = Math.max(3, 4 * gameScale);
  const startAngle = -Math.PI / 2;
  const sweep = Math.PI * 2 * clampedProgress;
  const endAngle = clockwise ? startAngle + sweep : startAngle - sweep;

  ctx.fillStyle = "rgba(23, 16, 11, 0.4)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringRadius + ringWidth, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = trackColor;
  ctx.lineWidth = ringWidth;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = progressColor;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringRadius, startAngle, endAngle, !clockwise);
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.fillStyle = labelColor;
  ctx.font = `bold ${Math.max(9, Math.round(9 * gameScale))}px 'Sora', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, centerX, centerY - ringRadius - Math.max(8, 10 * gameScale));
  ctx.textAlign = "left";
}

function drawHitTargetSlot(centerX: number, centerY: number, radius: number, markProgress: number): void {
  for (let i = 0; i < CONFIG.RING_COLORS.length; i++) {
    const r = radius * (1 - i / CONFIG.RING_COLORS.length);
    if (r < 0.6) continue;
    ctx.fillStyle = CONFIG.RING_COLORS[i];
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(34, 26, 20, 0.9)";
  ctx.lineWidth = Math.max(1, 1.2 * gameScale);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  const p = Math.max(0, Math.min(1, markProgress));
  if (p <= 0) return;
  const half = radius * 0.88;
  ctx.strokeStyle = "rgba(227, 48, 48, 0.98)";
  ctx.lineWidth = Math.max(2.1, 2.9 * gameScale);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (p < 0.5) {
    const t = p / 0.5;
    ctx.moveTo(centerX - half, centerY - half);
    ctx.lineTo(centerX - half + (half * 2) * t, centerY - half + (half * 2) * t);
  } else {
    const t = (p - 0.5) / 0.5;
    ctx.moveTo(centerX - half, centerY - half);
    ctx.lineTo(centerX + half, centerY + half);
    ctx.moveTo(centerX + half, centerY - half);
    ctx.lineTo(centerX + half - (half * 2) * t, centerY - half + (half * 2) * t);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawHitTracker(): void {
  const count = CONFIG.WAVE_HIT_GOAL;
  if (count <= 0) return;
  const trackerY = Math.max(56, 68 * gameScale);
  const slotGap = Math.max(18, Math.min(30, (w * 0.7) / Math.max(1, count - 1)));
  const slotRadius = Math.max(6, Math.min(11, slotGap * 0.32));
  const totalWidth = slotGap * (count - 1);
  const startX = w * 0.5 - totalWidth * 0.5;

  const panelPadX = Math.max(16, 20 * gameScale);
  const panelPadY = Math.max(10, 12 * gameScale);
  const panelX = startX - slotRadius - panelPadX;
  const panelY = trackerY - slotRadius - panelPadY;
  const panelW = totalWidth + slotRadius * 2 + panelPadX * 2;
  const panelH = slotRadius * 2 + panelPadY * 2;
  ctx.fillStyle = "rgba(30, 20, 12, 0.44)";
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, Math.max(10, 12 * gameScale));
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 210, 160, 0.2)";
  ctx.lineWidth = Math.max(1, 1.2 * gameScale);
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, Math.max(10, 12 * gameScale));
  ctx.stroke();

  for (let i = 0; i < count; i++) {
    const x = startX + i * slotGap;
    drawHitTargetSlot(x, trackerY, slotRadius, waveHitMarkProgress[i] || 0);
  }
}

function drawHUD(): void {
  const secs = Math.ceil(timeRemaining / 1000);
  const timerText = secs.toString();
  const labelFontSize = Math.max(11, Math.round(11 * gameScale));
  const valueFontSize = Math.max(18, Math.round(19 * gameScale));
  const timeElapsedRatio = Math.max(0, Math.min(1, 1 - timeRemaining / CONFIG.ROUND_TIME_MS));
  const lastTenRatio = Math.max(0, Math.min(1, (10000 - timeRemaining) / 10000));
  const lastFifteenShakeRatio = Math.max(0, Math.min(1, (15000 - timeRemaining) / 15000));
  const minTimeFont = Math.max(34, Math.round(40 * gameScale));
  const maxTimeFont = Math.max(102, Math.round(132 * gameScale));
  const timeFontSize = Math.round(minTimeFont + (maxTimeFont - minTimeFont) * timeElapsedRatio);
  const hudLeftX = 20;
  const labelX = hudLeftX;
  const valueX = hudLeftX + Math.max(66, 74 * gameScale);
  const rowGap = Math.max(27, 29 * gameScale);
  const hudRows = 2;
  const hudBlockHeight = rowGap * (hudRows - 1);
  const startY = h * 0.5 - hudBlockHeight * 0.5;
  const waveY = startY;
  const scoreY = waveY + rowGap;

  const hudPanelX = hudLeftX - Math.max(10, 12 * gameScale);
  const hudPanelY = waveY - Math.max(24, 28 * gameScale);
  const hudPanelW = Math.max(136, 162 * gameScale);
  const hudPanelH = (scoreY - waveY) + Math.max(42, 52 * gameScale);
  const hudPanelR = Math.max(10, 14 * gameScale);
  const hudPanelGrad = ctx.createLinearGradient(hudPanelX, hudPanelY, hudPanelX, hudPanelY + hudPanelH);
  hudPanelGrad.addColorStop(0, "rgba(39, 27, 18, 0.72)");
  hudPanelGrad.addColorStop(1, "rgba(24, 16, 10, 0.62)");
  ctx.fillStyle = hudPanelGrad;
  ctx.beginPath();
  ctx.roundRect(hudPanelX, hudPanelY, hudPanelW, hudPanelH, hudPanelR);
  ctx.fill();
  ctx.strokeStyle = "rgba(227, 192, 132, 0.28)";
  ctx.lineWidth = Math.max(1, 1.4 * gameScale);
  ctx.beginPath();
  ctx.roundRect(hudPanelX, hudPanelY, hudPanelW, hudPanelH, hudPanelR);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 8;

  ctx.fillStyle = "rgba(200, 170, 120, 0.95)";
  ctx.font = `bold ${labelFontSize}px 'Sora', sans-serif`;
  ctx.fillText("WAVE", labelX, waveY);
  ctx.fillText("SCORE", labelX, scoreY);

  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.font = `bold ${valueFontSize}px 'Sora', sans-serif`;
  ctx.fillText(waveNumber.toString(), valueX, waveY);
  ctx.fillText(score.toString(), valueX, scoreY);

  drawHitTracker();

  const timerX = w * 0.5;
  const timerY = h - Math.max(64, 110 * gameScale);
  const timerR = Math.round(245 + (255 - 245) * lastTenRatio);
  const timerG = Math.round(245 + (60 - 245) * lastTenRatio);
  const timerB = Math.round(245 + (60 - 245) * lastTenRatio);
  const shakeAmp = lastFifteenShakeRatio * (1.2 + lastFifteenShakeRatio * 4.2);
  const shakeX = Math.sin(environmentTime * 0.12) * shakeAmp;
  const shakeY = Math.cos(environmentTime * 0.17) * shakeAmp;

  ctx.fillStyle = "rgb(" + timerR + ", " + timerG + ", " + timerB + ")";
  ctx.shadowColor = "rgba(" + (210 + Math.round(45 * lastTenRatio)) + ", 0, 0, " + (0.22 + lastTenRatio * 0.5).toFixed(3) + ")";
  ctx.shadowBlur = 12 + lastTenRatio * 16;
  ctx.textAlign = "center";
  ctx.save();
  ctx.translate(timerX + shakeX, timerY + shakeY);
  ctx.font = `bold ${timeFontSize}px 'Sora', sans-serif`;
  ctx.fillText(timerText, 0, 0);
  ctx.restore();
  ctx.textAlign = "left";

  const headPos = getPlayerHeadScreenPosition();
  const quiverCenterX = headPos.x;
  const quiverY = headPos.y - Math.max(44, 52 * gameScale);
  ctx.shadowBlur = 0;
  const arrowSpacing = Math.max(15, 17 * gameScale);
  const arrowStemH = Math.max(10, 12 * gameScale);
  const arrowHeadH = Math.max(5, 6 * gameScale);
  const arrowHalfW = Math.max(3.5, 4.5 * gameScale);
  const maxQuiver = getMaxQuiverArrows();
  const quiverStartX = quiverCenterX - ((maxQuiver - 1) * arrowSpacing) / 2;
  const quiverSpan = (maxQuiver - 1) * arrowSpacing;
  const actionCircleX = quiverStartX + quiverSpan * 0.5;
  const actionCircleY = quiverY - Math.max(42, 48 * gameScale);

  const quiverPadX = Math.max(10, 12 * gameScale);
  const quiverPadY = Math.max(7, 9 * gameScale);
  const quiverBgX = quiverStartX - arrowHalfW - quiverPadX;
  const quiverBgY = quiverY - quiverPadY;
  const quiverBgW = quiverSpan + arrowHalfW * 2 + quiverPadX * 2;
  const quiverBgH = arrowHeadH + arrowStemH + quiverPadY * 2;
  ctx.fillStyle = "rgba(30, 20, 12, 0.44)";
  ctx.beginPath();
  ctx.roundRect(quiverBgX, quiverBgY, quiverBgW, quiverBgH, Math.max(8, 10 * gameScale));
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 210, 160, 0.2)";
  ctx.lineWidth = Math.max(1, 1.3 * gameScale);
  ctx.beginPath();
  ctx.roundRect(quiverBgX, quiverBgY, quiverBgW, quiverBgH, Math.max(8, 10 * gameScale));
  ctx.stroke();

  for (let i = 0; i < maxQuiver; i++) {
    const x = quiverStartX + i * arrowSpacing;
    const filled = i < ammoCount;
    const alpha = filled ? 1 : 0.22;
    ctx.strokeStyle = filled ? "#FFFFFF" : "rgba(236, 228, 211, " + alpha.toFixed(3) + ")";
    ctx.lineWidth = Math.max(1.4, 2 * gameScale);
    ctx.beginPath();
    ctx.moveTo(x, quiverY + arrowHeadH);
    ctx.lineTo(x, quiverY + arrowHeadH + arrowStemH);
    ctx.stroke();

    ctx.fillStyle = filled ? "#FFFFFF" : "rgba(189, 198, 212, " + alpha.toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(x, quiverY);
    ctx.lineTo(x - arrowHalfW, quiverY + arrowHeadH);
    ctx.lineTo(x + arrowHalfW, quiverY + arrowHeadH);
    ctx.closePath();
    ctx.fill();
  }

  if (isReloading) {
    const reloadT = 1 - reloadRemaining / CONFIG.RELOAD_MS;
    drawCircularActionMeter(
      actionCircleX,
      actionCircleY,
      reloadT,
      "RELOADING",
      "rgba(232, 190, 92, 0.95)",
      "rgba(60, 45, 30, 0.75)",
      "rgba(255, 230, 190, 0.95)",
      false,
    );
  } else if (isDrawing) {
    const drawLabel = wobbleAmount > 0.1 ? "WOBBLING" : "DRAWING";
    const drawColor = wobbleAmount > 0.1
      ? "rgba(235, 96, 96, 0.95)"
      : drawProgress >= 0.95
        ? "rgba(108, 240, 199, 0.96)"
        : "rgba(84, 209, 255, 0.95)";
    drawCircularActionMeter(
      actionCircleX,
      actionCircleY,
      drawProgress,
      drawLabel,
      drawColor,
      "rgba(22, 48, 64, 0.82)",
      "rgba(198, 236, 255, 0.95)",
      true,
    );
  }

  if (uiWavePanelLoaded || uiArrowPanelLoaded || uiTopBarLoaded) {
    const wavePanelW = Math.max(150, 188 * gameScale);
    if (uiWavePanelLoaded && uiWavePanelImage) {
      const wavePanelH = wavePanelW * (uiWavePanelImage.naturalHeight / Math.max(1, uiWavePanelImage.naturalWidth));
      drawUiImage(uiWavePanelImage, uiWavePanelLoaded, hudPanelX - 4, hudPanelY - 8, wavePanelW, wavePanelH);
    }

    const arrowPanelW = Math.max(140, 172 * gameScale);
    if (uiArrowPanelLoaded && uiArrowPanelImage) {
      const arrowPanelH = arrowPanelW * (uiArrowPanelImage.naturalHeight / Math.max(1, uiArrowPanelImage.naturalWidth));
      drawUiImage(
        uiArrowPanelImage,
        uiArrowPanelLoaded,
        quiverBgX - Math.max(8, 10 * gameScale),
        quiverBgY - Math.max(8, 10 * gameScale),
        arrowPanelW,
        arrowPanelH,
      );
    }

    const topBarW = Math.min(w * 0.36, 430 * gameScale);
    if (uiTopBarLoaded && uiTopBarImage) {
      const topBarH = topBarW * (uiTopBarImage.naturalHeight / Math.max(1, uiTopBarImage.naturalWidth));
      drawUiImage(uiTopBarImage, uiTopBarLoaded, w * 0.5 - topBarW * 0.5, 18, topBarW, topBarH);
    }
  }
}

function drawUiCharacterOverlay(): void {
  if (!uiCharacterLoaded || !uiCharacterImage) return;
  const spriteW = Math.max(140, 300 * gameScale);
  const spriteH = spriteW * (uiCharacterImage.naturalHeight / Math.max(1, uiCharacterImage.naturalWidth));
  const baseY = groundY + Math.max(14, 20 * gameScale);
  const x = horse.screenX - spriteW * 0.58;
  const y = baseY - spriteH;
  drawUiImage(uiCharacterImage, uiCharacterLoaded, x, y, spriteW, spriteH);
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
    fireLabelEl.textContent = "Release!";
    if (wobbleAmount > 0.1) {
      fireBtn.classList.add("state-wobble");
    } else {
      fireBtn.classList.add("state-drawing");
    }
    return;
  }

  fireLabelEl.textContent = "Pull!";

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
  if (isOrientationBlocked) return;

  environmentTime += dt;
  updateClouds(dt);
  updateWorld(dt);
  updateDraw(dt);
  updateFireButton();
  const trackedHits = Math.min(CONFIG.WAVE_HIT_GOAL, waveHits);
  for (let i = 0; i < CONFIG.WAVE_HIT_GOAL; i++) {
    if (i < trackedHits) {
      const next = (waveHitMarkProgress[i] || 0) + dt / HIT_MARK_ANIM_MS;
      waveHitMarkProgress[i] = Math.max(0, Math.min(1, next));
    } else {
      waveHitMarkProgress[i] = 0;
    }
  }
  if (isReloading) {
    reloadRemaining -= dt;
    if (reloadRemaining <= 0) {
      reloadRemaining = 0;
      isReloading = false;
      ammoCount = getMaxQuiverArrows();
    }
  }
  let waveClearedThisFrame = false;
  const crosswindAccel = getCrosswindAccel();

  for (const t of targets) {
    if (t.hit) continue;
    if (t.speedMult !== 1) {
      t.worldX += world.speed * (1 - t.speedMult) * dt;
    }
  }

  // Update arrows (2D physics)
  arrowLoop:
  for (const arrow of arrows) {
    if (!arrow.active) continue;
    arrow.magnetFxStrength = 0;

    if (!arrow.stuckInGround) {
      arrow.vy -= CONFIG.ARROW_GRAVITY * dt;
      arrow.vx += crosswindAccel * dt;
      arrow.vy += crosswindAccel * 0.18 * dt;
      arrow.worldX += arrow.vx * dt;
      arrow.height += arrow.vy * dt;
    }

    // Hit ground and stick in place so the rider passes by it.
    if (!arrow.stuckInGround && arrow.height <= 0) {
      arrow.impactAngle = Math.atan2(-arrow.vy, arrow.vx);
      arrow.height = 0;
      arrow.vx = 0;
      arrow.vy = 0;
      arrow.stuckInGround = true;
    }

    // Too far ahead or behind camera
    let arrowDx = arrow.worldX - world.cameraX;
    if (arrowDx > world.width / 2) arrowDx -= world.width;
    if (arrowDx < -world.width / 2) arrowDx += world.width;
    // Keep airborne arrows alive while ahead of camera so they can land and stick.
    if (!arrow.stuckInGround && arrowDx < -100) {
      arrow.active = false;
      continue;
    }
    if (arrow.stuckInGround && (arrowDx > 1200 || arrowDx < -1000)) {
      arrow.active = false;
      continue;
    }

    // Target collision (2D: worldX + height)
    if (arrow.stuckInGround) continue;
    const collisionPoint = getArrowCollisionPoint(arrow);
    const prevCollisionX = collisionPoint.x - arrow.vx * dt;
    const prevCollisionY = collisionPoint.y - arrow.vy * dt;
    let closestTarget: WorldTarget | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    let closestDx = 0;
    let closestDy = 0;
    for (const t of targets) {
      if (t.hit) continue;

      let tdx = collisionPoint.x - t.worldX;
      if (tdx > world.width / 2) tdx -= world.width;
      if (tdx < -world.width / 2) tdx += world.width;

      const dy = collisionPoint.y - t.postHeight;
      const dist = Math.sqrt(tdx * tdx + dy * dy);
      const targetXAligned = collisionPoint.x - tdx;
      const sweptDist = getPointToSegmentDistance(
        targetXAligned,
        t.postHeight,
        prevCollisionX,
        prevCollisionY,
        collisionPoint.x,
        collisionPoint.y,
      );
      const sweptClosestPoint = getClosestPointOnSegment(
        targetXAligned,
        t.postHeight,
        prevCollisionX,
        prevCollisionY,
        collisionPoint.x,
        collisionPoint.y,
      );
      const sweptDx = sweptClosestPoint.x - targetXAligned;
      const sweptDy = sweptClosestPoint.y - t.postHeight;
      const useSweptForLock = sweptDist < dist;
      const lockDx = useSweptForLock ? sweptDx : tdx;
      const lockDy = useSweptForLock ? sweptDy : dy;
      const pullDist = Math.min(dist, sweptDist);
      if (pullDist < closestDist) {
        closestDist = pullDist;
        closestTarget = t;
        closestDx = lockDx;
        closestDy = lockDy;
      }
      const hitRadius = getTargetHitRadius(t);
      // Reduced by ~40% from prior tuning to avoid overpowered lock behavior.
      const magnetCatchRadius = Math.max(CONFIG.MAGNET_RADIUS * 1.32, t.radius * 1.08);
      const isMagnetLockHit =
        upgradeLevels.magnetArrows > 0 && (dist <= magnetCatchRadius || sweptDist <= magnetCatchRadius);
      const isDirectHit = dist < hitRadius;

      if (isMagnetLockHit || isDirectHit) {
        // Slight 3D target behavior: score by where the arrow is projected
        // toward the target's center plane instead of first edge contact.
        let scoreDx = tdx;
        let scoreDy = dy;
        let scoreDist = Math.sqrt(scoreDx * scoreDx + scoreDy * scoreDy);
        let impactAngle = collisionPoint.angle;
        let magnetAssistedEdgeHit = false;

        if (isMagnetLockHit) {
          // Use current frame target-relative vector for embedding so arrows stick to the face.
          const embedDx = Math.abs(tdx) + Math.abs(dy) > 0.0001 ? tdx : lockDx;
          const embedDy = Math.abs(tdx) + Math.abs(dy) > 0.0001 ? dy : lockDy;
          const safeDist = Math.max(0.0001, Math.sqrt(embedDx * embedDx + embedDy * embedDy));
          const edgeNx = embedDx / safeDist;
          const edgeNy = embedDy / safeDist;
          // Magnet lock turns the arrow toward center but only grants an edge impact.
          scoreDx = edgeNx * t.radius;
          scoreDy = edgeNy * t.radius;
          scoreDist = t.radius;
          impactAngle = Math.atan2(embedDy, -embedDx);
          magnetAssistedEdgeHit = true;
        } else if (Math.abs(arrow.vx) > 0.00001) {
          const tToCenter = -tdx / arrow.vx;
          if (tToCenter >= 0 && tToCenter <= CONFIG.TARGET_PENETRATION_WINDOW_MS) {
            scoreDx = 0;
            scoreDy = dy + arrow.vy * tToCenter;
          }
          scoreDist = Math.sqrt(scoreDx * scoreDx + scoreDy * scoreDy);
        }

        arrow.active = false;
        // Always clamp embedded-arrow position to the target face to avoid floating off-disc artifacts.
        const embedDist = Math.sqrt(scoreDx * scoreDx + scoreDy * scoreDy);
        if (embedDist > t.radius && embedDist > 0.0001) {
          const scaleToFace = t.radius / embedDist;
          scoreDx *= scaleToFace;
          scoreDy *= scaleToFace;
        }
        t.embeddedArrow = {
          offsetX: scoreDx,
          offsetY: scoreDy,
          angle: impactAngle,
        };
        if (t.kind === "stoneColumn") {
          playSfx("targetHit");
          triggerHaptic("heavy");
          break;
        }
        spawnTargetRingBurst(t);

        let points = 2;
        let isBullseye = false;
        if (!magnetAssistedEdgeHit) {
          const scoringBias = t.radius * 0.08;
          const adjustedDist = Math.max(0, scoreDist - scoringBias);
          const ringFrac = adjustedDist / t.radius;
          if (ringFrac < 0.25) {
            points = 10;
            isBullseye = true;
          } else if (ringFrac < 0.4) {
            points = 8;
          } else if (ringFrac < 0.6) {
            points = 6;
          } else if (ringFrac < 0.8) {
            points = 4;
          }
        }
        if (t.kind === "tiny") points += 2;

        t.hp = Math.max(0, t.hp - 1);
        const targetCleared = t.hp <= 0;
        if (targetCleared) t.hit = true;

        score += points;
        if (score < 0) score = 0;
        if (targetCleared) {
          waveHits += 1;
        }
        // Screen position for score popup (perspective-matched)
        const lateralX = getTargetLateralDx(t);
        const hitScale = pxPerUnit;
        const sx = horse.screenX + lateralX * pxPerUnit;
        const hitBaseY = groundY;
        const sy = hitBaseY - t.postHeight * hitScale;
        spawnScorePopup(sx, sy - 30, points, isBullseye);
        if (isBullseye) {
          spawnPerfectBurst(t);
          if (upgradeLevels.perfectReload > 0) {
            isReloading = false;
            reloadRemaining = 0;
            ammoCount = getMaxQuiverArrows();
          }
        }

        playSfx(isBullseye ? "perfectHit" : "targetHit");
        triggerHaptic(isBullseye ? "success" : "heavy");
        if (waveHits >= CONFIG.WAVE_HIT_GOAL) {
          waveClearedThisFrame = true;
        }
        break;
      }

    }
    if (arrow.active && closestTarget && upgradeLevels.magnetArrows > 0) {
      const magnetPullRadius = Math.max(CONFIG.MAGNET_PULL_RADIUS * 0.42, closestTarget.radius * 2.52);
      if (closestDist <= magnetPullRadius) {
        const pullRatio = 1 - closestDist / magnetPullRadius;
        if (closestDist > 0.001) {
          const pullX = -closestDx / closestDist;
          const pullY = -closestDy / closestDist;
          const speedMag = Math.sqrt(arrow.vx * arrow.vx + arrow.vy * arrow.vy);
          const targetSpeed = Math.max(0.16, speedMag);
          const desiredVx = pullX * targetSpeed;
          const desiredVy = pullY * targetSpeed;
          const steer = 1 - Math.exp(-(0.011 + pullRatio * 0.026) * dt);
          // Strong directional steering makes above/below passes visibly bend toward center.
          arrow.vx += (desiredVx - arrow.vx) * steer;
          arrow.vy += (desiredVy - arrow.vy) * steer;
        }
        arrow.magnetFxStrength = pullRatio;
      }
      arrow.magnetTargetWorldX = closestTarget.worldX;
      arrow.magnetTargetHeight = closestTarget.postHeight;
      arrow.magnetTargetRadius = closestTarget.radius;
    }
    if (waveClearedThisFrame) break arrowLoop;
  }

  // Recycle targets that scrolled past or were hit — respawn off-screen right
  // Find the furthest existing target to avoid clumping
  const spacingFactor = getTargetSpacingFactor();
  const recycleBaseSpawnDx = getOffscreenSpawnMinDx() + 120 * spacingFactor;
  const recycleGapDx = 250 * spacingFactor;
  const recycleVariance = 200 * spacingFactor * 0.8;
  let furthestDx = 0;
  for (const t of targets) {
    const d = getTargetLateralDx(t);
    if (d > furthestDx) furthestDx = d;
  }
  for (const t of targets) {
    const dx = getTargetLateralDx(t);
    if (dx < -300) {
      // Place well beyond the furthest target with spacing
      const gapDx = getSpawnGapDx(spacingFactor);
      const minDx = Math.max(recycleBaseSpawnDx, furthestDx + gapDx);
      recycleTarget(t, world.cameraX + minDx + Math.random() * recycleVariance);
      furthestDx = minDx + gapDx; // update for next recycle in same frame
    }
  }

  // Update score popups
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const sp = scorePopups[i];
    sp.y += sp.vy * dt;
    sp.life -= 0.0015 * dt;
    if (sp.life <= 0) scorePopups.splice(i, 1);
  }

  for (let i = ringBursts.length - 1; i >= 0; i--) {
    const burst = ringBursts[i];
    burst.life -= 0.00075 * dt;
    burst.radius += burst.growSpeed * dt;
    burst.worldX += burst.driftX * dt;
    burst.height += burst.driftY * dt;
    if (burst.life <= 0) ringBursts.splice(i, 1);
  }

  for (let i = perfectBursts.length - 1; i >= 0; i--) {
    const p = perfectBursts[i];
    p.life -= 0.00105 * dt;
    p.worldX += p.vx * dt;
    p.height += p.vy * dt;
    p.vy -= 0.00012 * dt;
    if (p.life <= 0) perfectBursts.splice(i, 1);
  }

  arrows = arrows.filter((a) => a.active);

  if (waveClearedThisFrame) {
    enterUpgradeDraft();
    return;
  }

  timeRemaining -= dt;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    gameOver();
    return;
  }

  const countdownSecond = Math.ceil(timeRemaining / 1000);
  if (countdownSecond !== lastCountdownCueSecond) {
    if (countdownSecond >= 1 && countdownSecond <= 5) {
      playCountdownBeep(countdownSecond);
    }
    lastCountdownCueSecond = countdownSecond;
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
  fireBtn.addEventListener("pointercancel", (e: Event) => {
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
    } else if (gameState === "WAVE_UPGRADE") {
      if (e.key === "1") chooseUpgrade(0);
      if (e.key === "2") chooseUpgrade(1);
      if (e.key === "3") chooseUpgrade(2);
    } else if (gameState === "PAUSED" && e.key === "Escape") {
      resumeGame();
    } else if (gameState === "START" && (e.key === " " || e.key === "Enter")) {
      void enterImmersiveMode();
      playSfx("uiTap");
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
    void enterImmersiveMode();
    playSfx("uiTap");
    triggerHaptic("light");
    startGame();
  });

  fullscreenBtn.addEventListener("click", () => {
    void enterImmersiveMode();
    playSfx("uiTap");
    triggerHaptic("light");
  });

  settingsBtn.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("startSettingsBtn")?.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    pauseGame();
  });

  document.getElementById("resumeButton")!.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    resumeGame();
  });

  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    void enterImmersiveMode();
    playSfx("uiTap");
    triggerHaptic("light");
    pauseScreen.classList.add("hidden");
    startGame();
  });

  document.getElementById("pauseMenuButton")!.addEventListener("click", () => {
    playSfx("uiTap");
    triggerHaptic("light");
    showStartScreen();
  });

  document.getElementById("restartButton")!.addEventListener("click", () => {
    void enterImmersiveMode();
    playSfx("uiTap");
    triggerHaptic("light");
    startGame();
  });

  document.getElementById("backToStartButton")!.addEventListener("click", () => {
    playSfx("uiTap");
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
    playSfx("uiTap");
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    saveSettings();
    syncMusicState();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    if (settings.fx) playSfx("uiTap");
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    saveSettings();
    if (!settings.fx) {
      stopBowPullLoop();
    } else {
      playBowPullLoopIfAllowed();
    }
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    if (settings.fx) playSfx("uiTap");
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

  const drewLoopableBg = drawLoopableBackground();
  if (!drewLoopableBg) {
    drawSky();
    drawMountains();
    for (const c of clouds) drawCloud(c);
    drawGround();
  } else {
    for (const c of clouds) drawCloud(c);
  }
  drawWorldTargets();
  drawRingBursts();
  drawPerfectBursts();
  drawWindReaderPreview();
  drawArrows();
  drawHorseAndArcher();
  drawUiCharacterOverlay();
  drawScorePopups();

  if (gameState === "PLAYING") {
    drawHUD();
  }

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  loadAudio();
  loadOrnateTargetImage();
  loadUiReplacementAssets();
  loadLoopableBackground();
  updateStartTip();
  setupInputHandlers();
  setupUpgradeButtons();
  initClouds();
  generateTargets();
  updateOrientationState();

  requestAnimationFrame(gameLoop);
  showStartScreen();
}

init();
