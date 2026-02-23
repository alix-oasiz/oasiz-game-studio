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
type TargetKind = "normal" | "armored" | "decoy" | "runner" | "tiny";

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
  saddleTargetX: number;
  saddleTargetY: number;
  riderW: number;
  riderH: number;
  src: SpriteBounds;
  tipScreenX: number;
  tipScreenY: number;
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

  ROUND_TIME_MS: 30000,
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

const HORSE_TEMPLATE_ANCHOR = {
  seatBoxX: 0.4759233225551644,
  seatBoxY: 0.31104651402259254,
};

const RIDER_SPRITE_ANCHOR = {
  // Rider-local anchor in archer sprite space (seat contact point).
  seatX: 0.5,
  seatY: 0.62,
};

const RIDER_BOW_ROTATION_RAD = -Math.PI * 0.25;
const RIDER_SCREEN_NUDGE_X = 15;

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
let archerArrowTipNorm = { x: 0.975, y: 0.29 };
let riderAnchorBaseTopY: number | null = null;
let riderAnchorOffsetPx = 0;
let riderAnchorLastSampleTime = 0;
let musicTrack: HTMLAudioElement | null = null;
let bowPullTrack: HTMLAudioElement | null = null;
let draftAutoAdvanceTimer: number | null = null;
let draftChoices: UpgradeId[] = [];

const sfxTracks: Record<string, HTMLAudioElement | null> = {
  uiTap: null,
  bowRelease: null,
  targetHit: null,
  perfectHit: null,
  reloadReady: null,
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
  horse.baseY = groundY - 30 * gameScale;
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
  musicTrack = createAudio("/Steppe_Gallop.mp3", 0.18, true);
  bowPullTrack = createAudio("/bow_pull_loop.mp3", 0.48, true);

  sfxTracks.uiTap = createAudio("/ui_tap.mp3", 0.65);
  sfxTracks.bowRelease = createAudio("/bow_release.mp3", 0.8);
  sfxTracks.targetHit = createAudio("/target_hit.mp3", 0.88);
  sfxTracks.perfectHit = createAudio("/perfect_hit.mp3", 0.7);
  sfxTracks.reloadReady = createAudio("/reload_ready.mp3", 0.62);
}

function playSfx(trackKey: keyof typeof sfxTracks): void {
  if (!settings.fx) return;
  const base = sfxTracks[trackKey];
  if (!base) return;

  try {
    const oneShot = base.cloneNode(true) as HTMLAudioElement;
    oneShot.volume = base.volume;
    void oneShot.play();
  } catch {
    console.log("[playSfx]", "SFX playback failed.");
  }
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
  img.src = "/mongolarcher2.png";
  img.onload = () => {
    archerImage = img;
    archerImageLoaded = true;
    archerBounds = getOpaqueSpriteBounds(img);
    archerArrowTipNorm = getArrowTipNormInBounds(img, archerBounds);
    console.log("[loadArcherImage]", "Loaded /mongolarcher2.png");
  };
  img.onerror = () => {
    archerImageLoaded = false;
    archerBounds = null;
    console.log("[loadArcherImage]", "Could not load /mongolarcher2.png.");
  };
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
  if (!characterFrameCanvas || !archerImageLoaded || !archerImage) return null;
  if (!characterFrameReady) return null;

  const drawW = 375 * gameScale;
  const drawH = drawW * (characterFrameCanvas.height / characterFrameCanvas.width);
  const drawX = horse.screenX - drawW * 0.42;
  const drawY = horse.screenY - drawH * 0.66;
  const src = archerBounds || { x: 0, y: 0, w: archerImage.width, h: archerImage.height };
  const riderW = drawW * 0.48;
  const riderH = riderW * (src.h / src.w);
  const riderYOffsetRaw = riderAnchorOffsetPx * (drawH / characterFrameCanvas.height) * 2.6;
  const riderYOffset = Math.max(-drawH * 0.10, Math.min(drawH * 0.12, riderYOffsetRaw));
  const saddleTargetX = drawX + drawW * HORSE_TEMPLATE_ANCHOR.seatBoxX + RIDER_SCREEN_NUDGE_X;
  const saddleTargetY = drawY + drawH * HORSE_TEMPLATE_ANCHOR.seatBoxY + riderYOffset;

  const tipLocalX = riderW * (archerArrowTipNorm.x - RIDER_SPRITE_ANCHOR.seatX);
  const tipLocalY = riderH * (archerArrowTipNorm.y - RIDER_SPRITE_ANCHOR.seatY);
  const cosA = Math.cos(RIDER_BOW_ROTATION_RAD);
  const sinA = Math.sin(RIDER_BOW_ROTATION_RAD);
  const tipScreenX = saddleTargetX + tipLocalX * cosA - tipLocalY * sinA;
  const tipScreenY = saddleTargetY + tipLocalX * sinA + tipLocalY * cosA;

  return {
    saddleTargetX,
    saddleTargetY,
    riderW,
    riderH,
    src,
    tipScreenX,
    tipScreenY,
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
      x: placement.saddleTargetX + placement.riderW * 0.03,
      y: placement.saddleTargetY - placement.riderH * 0.53,
    };
  }

  const horseScale = 3 * gameScale;
  return {
    x: horse.screenX + 5 * horseScale,
    y: horse.screenY - 86 * horseScale,
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
  if (waveNumber <= 2) return "normal";
  const roll = Math.random();
  if (waveNumber >= 4 && roll < 0.2) return "tiny";
  if (waveNumber >= 4 && roll < 0.38) return "runner";
  if (waveNumber >= 5 && roll < 0.52) return "decoy";
  if (waveNumber >= 6 && roll < 0.68) return "armored";
  return "normal";
}

function applyTargetKindStats(t: WorldTarget, kind: TargetKind): void {
  t.kind = kind;
  if (kind === "armored") {
    t.radius = 42;
    t.maxHp = 2;
    t.hp = 2;
    t.speedMult = 1;
    return;
  }
  if (kind === "decoy") {
    t.radius = 36;
    t.maxHp = 1;
    t.hp = 1;
    t.speedMult = 1.05;
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
  timeRemaining = CONFIG.ROUND_TIME_MS;
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
  triggerHaptic("light");
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
  }

  playSfx("bowRelease");
  triggerHaptic("medium");
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
  ammoCount = getMaxQuiverArrows();
  isReloading = false;
  reloadRemaining = 0;

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

function getParallaxShift(speedFactor: number): number {
  return world.cameraX * speedFactor * pxPerUnit;
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
  horse.legPhase += dt * 0.015;

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
  const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
  grad.addColorStop(0, "#10254F");
  grad.addColorStop(0.28, "#4B2F7A");
  grad.addColorStop(0.56, "#BA4E9C");
  grad.addColorStop(0.82, "#F18F6B");
  grad.addColorStop(1, "#FFD47E");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, horizonY + 5);

  // Sun at horizon center
  const sunX = w * 0.5;
  const sunY = horizonY * 0.85;
  const sunR = 40;

  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3);
  glow.addColorStop(0, "rgba(255, 245, 195, 0.62)");
  glow.addColorStop(0.45, "rgba(255, 159, 110, 0.26)");
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
}

function drawMountains(): void {
  drawLayerRidge(horizonY + 22, 24, 10, 0.006, 0.011, 0.08, "#6A4C3A");
  drawLayerRidge(horizonY + 34, 20, 9, 0.0075, 0.013, 0.15, "#8A5E42");
  drawLayerRidge(horizonY + 44, 15, 8, 0.009, 0.016, 0.22, "rgba(54, 124, 136, 0.75)");
}

function drawGround(): void {
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
      ctx.fillStyle = "#CC3333";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(
        tailX + Math.cos(backAngle - 0.5) * fSize,
        tailY + Math.sin(backAngle - 0.5) * fSize,
      );
      ctx.lineTo(
        tailX + Math.cos(backAngle) * fSize * 0.7,
        tailY + Math.sin(backAngle) * fSize * 0.7,
      );
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(
        tailX + Math.cos(backAngle + 0.5) * fSize,
        tailY + Math.sin(backAngle + 0.5) * fSize,
      );
      ctx.lineTo(
        tailX + Math.cos(backAngle) * fSize * 0.7,
        tailY + Math.sin(backAngle) * fSize * 0.7,
      );
      ctx.closePath();
      ctx.fill();
    }

    // Archetype cues for active targets.
    if (!t.hit) {
      if (t.kind === "armored") {
        ctx.strokeStyle = "rgba(180, 192, 205, 0.9)";
        ctx.lineWidth = Math.max(1.5, 2.2 * gameScale);
        ctx.beginPath();
        ctx.arc(0, faceY, Math.max(2, visualR * 1.08), 0, Math.PI * 2);
        ctx.stroke();
      } else if (t.kind === "decoy") {
        ctx.strokeStyle = "rgba(236, 90, 214, 0.9)";
        ctx.lineWidth = Math.max(1.2, 2 * gameScale);
        ctx.beginPath();
        ctx.moveTo(-visualR * 0.6, faceY - visualR * 0.6);
        ctx.lineTo(visualR * 0.6, faceY + visualR * 0.6);
        ctx.moveTo(visualR * 0.6, faceY - visualR * 0.6);
        ctx.lineTo(-visualR * 0.6, faceY + visualR * 0.6);
        ctx.stroke();
      }
      if (t.maxHp > 1) {
        const pipY = faceY - visualR - Math.max(6, 8 * gameScale);
        for (let i = 0; i < t.maxHp; i++) {
          const pipX = (i - (t.maxHp - 1) * 0.5) * Math.max(8, 10 * gameScale);
          ctx.fillStyle = i < t.hp ? "#D8E3F1" : "rgba(216, 227, 241, 0.25)";
          ctx.beginPath();
          ctx.arc(pipX, pipY, Math.max(2.5, 3.5 * gameScale), 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
  if (characterVideoLoaded && characterVideo && characterFrameCtx && characterFrameCanvas) {
    if (characterVideo.readyState >= 2) {
      characterFrameCtx.clearRect(0, 0, characterFrameCanvas.width, characterFrameCanvas.height);
      characterFrameCtx.drawImage(characterVideo, 0, 0, characterFrameCanvas.width, characterFrameCanvas.height);
      normalizeHorseFrameAlpha();
      characterFrameReady = true;
      sampleRiderAnchorFromHorseFrame();
    }
  }

  if (characterFrameReady && characterFrameCanvas) {
    const drawW = 375 * gameScale;
    const drawH = drawW * (characterFrameCanvas.height / characterFrameCanvas.width);
    const drawX = horse.screenX - drawW * 0.42;
    const drawY = horse.screenY - drawH * 0.66;
    ctx.drawImage(characterFrameCanvas, drawX, drawY, drawW, drawH);

    const placement = getRiderPlacement();
    if (placement && archerImageLoaded && archerImage) {
      ctx.save();
      ctx.translate(placement.saddleTargetX, placement.saddleTargetY);
      ctx.rotate(RIDER_BOW_ROTATION_RAD);
      ctx.drawImage(
        archerImage,
        placement.src.x,
        placement.src.y,
        placement.src.w,
        placement.src.h,
        -placement.riderW * RIDER_SPRITE_ANCHOR.seatX,
        -placement.riderH * RIDER_SPRITE_ANCHOR.seatY,
        placement.riderW,
        placement.riderH,
      );
      ctx.restore();
    }
    return;
  }

  const hx = horse.screenX;
  const hy = horse.screenY;
  const phase = horse.legPhase;

  // Scale relative to screen — draw everything in local coords centered on (0,0)
  const horseScale = 3 * gameScale;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(horseScale, horseScale);

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
    const wobbleTime = performance.now() * 0.03;
    const wobbleMagnitude = wobbleAmount * 6;
    shakeX = Math.sin(wobbleTime * 1.3) * wobbleMagnitude;
    shakeY = Math.cos(wobbleTime * 1.7) * wobbleMagnitude;
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
    ctx.fillStyle = "#CC3333";
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(
      tailX + Math.cos(backAngle - 0.5) * fSize,
      tailY + Math.sin(backAngle - 0.5) * fSize,
    );
    ctx.lineTo(
      tailX + Math.cos(backAngle) * fSize * 0.7,
      tailY + Math.sin(backAngle) * fSize * 0.7,
    );
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(
      tailX + Math.cos(backAngle + 0.5) * fSize,
      tailY + Math.sin(backAngle + 0.5) * fSize,
    );
    ctx.lineTo(
      tailX + Math.cos(backAngle) * fSize * 0.7,
      tailY + Math.sin(backAngle) * fSize * 0.7,
    );
    ctx.closePath();
    ctx.fill();

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

      ctx.strokeStyle = "rgba(120, 230, 255, " + fxAlpha.toFixed(3) + ")";
      ctx.lineWidth = Math.max(1.2, 2.2 * gameScale * arrow.magnetFxStrength);
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
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
  const speed = getArrowLaunchSpeed(Math.max(drawProgress, CONFIG.MIN_DRAW_TO_FIRE));
  const spawnPoint = getArrowSpawnPointWorld();
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

function drawDrawMeter(): void {
  const s = gameScale;
  const meterX = w * 0.5;
  const meterW = Math.max(104, 120 * s);
  const meterH = Math.max(8, 10 * s);
  const bottomOffset = 110;
  const meterY = h - Math.max(64, bottomOffset * s);
  const barX = meterX - meterW / 2;
  const barY = meterY;
  const labelFontSize = Math.max(11, Math.round(11 * s));

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.roundRect(barX - 2, barY - 2, meterW + 4, meterH + 4, 4 * s);
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
  ctx.roundRect(barX, barY, meterW * drawProgress, meterH, 3 * s);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = `bold ${labelFontSize}px 'Sora', sans-serif`;
  ctx.textAlign = "center";
  const label =
    wobbleAmount > 0.1
      ? "WOBBLING!"
      : drawProgress >= 0.95
        ? "FULL DRAW"
        : "DRAWING...";
  ctx.fillText(label, meterX, barY - Math.max(8, 10 * s));
  ctx.textAlign = "left";
}

function drawHUD(): void {
  const secs = Math.ceil(timeRemaining / 1000);
  const timerText = secs.toString();
  const urgent = secs <= 5;
  const labelFontSize = Math.max(11, Math.round(11 * gameScale));
  const valueFontSize = Math.max(18, Math.round(19 * gameScale));
  const timeFontSize = Math.max(18, Math.round((urgent ? 21 : 19) * gameScale));
  const hudLeftX = 20;
  const labelX = hudLeftX;
  const valueX = hudLeftX + Math.max(66, 74 * gameScale);
  const rowGap = Math.max(27, 29 * gameScale);
  const hudRows = 4;
  const hudBlockHeight = rowGap * (hudRows - 1);
  const startY = h * 0.5 - hudBlockHeight * 0.5;
  const waveY = startY;
  const hitsY = waveY + rowGap;
  const scoreY = hitsY + rowGap;
  const timeY = scoreY + rowGap;
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 8;

  ctx.fillStyle = "rgba(200, 170, 120, 0.95)";
  ctx.font = `bold ${labelFontSize}px 'Sora', sans-serif`;
  ctx.fillText("WAVE", labelX, waveY);
  ctx.fillText("HITS", labelX, hitsY);
  ctx.fillText("SCORE", labelX, scoreY);
  ctx.fillText("TIME", labelX, timeY);

  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.font = `bold ${valueFontSize}px 'Sora', sans-serif`;
  ctx.fillText(waveNumber.toString(), valueX, waveY);
  ctx.fillText(waveHits.toString() + "/" + CONFIG.WAVE_HIT_GOAL.toString(), valueX, hitsY);
  ctx.fillText(score.toString(), valueX, scoreY);

  ctx.fillStyle = urgent ? "#FF3333" : "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = urgent ? "rgba(255, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = urgent ? 14 : 8;
  if (urgent) {
    const panicProgress = Math.max(0, Math.min(1, (5000 - timeRemaining) / 5000));
    const growthScale = 1 + panicProgress * 0.55;
    const pulse = 1 + Math.sin(environmentTime * 0.045) * (0.03 + panicProgress * 0.07);
    const finalScale = growthScale * pulse;
    const shakeAmp = 0.8 + panicProgress * 2.8;
    const shakeX = Math.sin(environmentTime * 0.11) * shakeAmp;
    const shakeY = Math.cos(environmentTime * 0.16) * shakeAmp;

    ctx.save();
    ctx.translate(valueX + shakeX, timeY + shakeY);
    ctx.scale(finalScale, finalScale);
    ctx.font = `bold ${timeFontSize}px 'Sora', sans-serif`;
    ctx.fillText(timerText, 0, 0);
    ctx.restore();
  } else {
    ctx.font = `bold ${timeFontSize}px 'Sora', sans-serif`;
    ctx.fillText(timerText, valueX, timeY);
  }

  const headPos = getPlayerHeadScreenPosition();
  const quiverCenterX = headPos.x - 20;
  const quiverY = headPos.y + Math.max(24, 28 * gameScale) - 90;
  ctx.shadowBlur = 0;
  const arrowSpacing = Math.max(15, 17 * gameScale);
  const arrowStemH = Math.max(10, 12 * gameScale);
  const arrowHeadH = Math.max(5, 6 * gameScale);
  const arrowHalfW = Math.max(3.5, 4.5 * gameScale);
  const maxQuiver = getMaxQuiverArrows();
  const quiverStartX = quiverCenterX - ((maxQuiver - 1) * arrowSpacing) / 2;
  for (let i = 0; i < maxQuiver; i++) {
    const x = quiverStartX + i * arrowSpacing;
    const filled = i < ammoCount;
    const alpha = filled ? 0.95 : 0.24;
    ctx.strokeStyle = "rgba(236, 228, 211, " + alpha.toFixed(3) + ")";
    ctx.lineWidth = Math.max(1.4, 2 * gameScale);
    ctx.beginPath();
    ctx.moveTo(x, quiverY + arrowHeadH);
    ctx.lineTo(x, quiverY + arrowHeadH + arrowStemH);
    ctx.stroke();

    ctx.fillStyle = "rgba(189, 198, 212, " + alpha.toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(x, quiverY);
    ctx.lineTo(x - arrowHalfW, quiverY + arrowHeadH);
    ctx.lineTo(x + arrowHalfW, quiverY + arrowHeadH);
    ctx.closePath();
    ctx.fill();
  }

  if (isReloading) {
    const reloadT = 1 - reloadRemaining / CONFIG.RELOAD_MS;
    const clampedReloadT = Math.max(0, Math.min(1, reloadT));
    const quiverSpan = (maxQuiver - 1) * arrowSpacing;
    const centerX = quiverStartX + quiverSpan * 0.5;
    const centerY = quiverY - Math.max(26, 30 * gameScale);
    const ringRadius = Math.max(15, 19 * gameScale);
    const ringWidth = Math.max(3, 4 * gameScale);
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * clampedReloadT;

    ctx.fillStyle = "rgba(23, 16, 11, 0.4)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius + ringWidth, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(60, 45, 30, 0.75)";
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(232, 190, 92, 0.95)";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, startAngle, endAngle);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.fillStyle = "rgba(255, 230, 190, 0.95)";
    ctx.font = `bold ${Math.max(9, Math.round(9 * gameScale))}px 'Sora', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("RELOADING", centerX, centerY - ringRadius - Math.max(8, 10 * gameScale));
    ctx.textAlign = "left";
  }

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
  maintainCharacterVideoLoop();
  updateFireButton();
  if (isReloading) {
    reloadRemaining -= dt;
    if (reloadRemaining <= 0) {
      reloadRemaining = 0;
      isReloading = false;
      ammoCount = getMaxQuiverArrows();
      playSfx("reloadReady");
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
    if (!arrow.stuckInGround && (arrowDx > 1200 || arrowDx < -100)) {
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
      if (dist < closestDist) {
        closestDist = dist;
        closestTarget = t;
        closestDx = tdx;
        closestDy = dy;
      }
      const hitRadius = getTargetHitRadius(t);
      const isMagnetHit = upgradeLevels.magnetArrows > 0 && dist <= CONFIG.MAGNET_RADIUS;

      if (isMagnetHit || dist < hitRadius) {
        // Slight 3D target behavior: score by where the arrow is projected
        // toward the target's center plane instead of first edge contact.
        let scoreDx = tdx;
        let scoreDy = dy;
        if (Math.abs(arrow.vx) > 0.00001) {
          const tToCenter = -tdx / arrow.vx;
          if (tToCenter >= 0 && tToCenter <= CONFIG.TARGET_PENETRATION_WINDOW_MS) {
            scoreDx = 0;
            scoreDy = dy + arrow.vy * tToCenter;
          }
        }
        const scoreDist = Math.sqrt(scoreDx * scoreDx + scoreDy * scoreDy);

        arrow.active = false;
        const impactAngle = collisionPoint.angle;
        t.embeddedArrow = {
          offsetX: scoreDx,
          offsetY: scoreDy,
          angle: impactAngle,
        };
        spawnTargetRingBurst(t);

        let points = 2;
        let isBullseye = false;
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
        if (t.kind === "tiny") points += 2;
        if (t.kind === "decoy") {
          points = -3;
        }

        t.hp = Math.max(0, t.hp - 1);
        const targetCleared = t.hp <= 0;
        if (targetCleared) t.hit = true;

        score += points;
        if (score < 0) score = 0;
        if (targetCleared && t.kind !== "decoy") {
          waveHits += 1;
        }
        // Screen position for score popup (perspective-matched)
        const lateralX = getTargetLateralDx(t);
        const hitScale = pxPerUnit;
        const sx = horse.screenX + lateralX * pxPerUnit;
        const hitBaseY = groundY;
        const sy = hitBaseY - t.postHeight * hitScale;
        spawnScorePopup(sx, sy - 30, points, isBullseye && t.kind !== "decoy");
        if (isBullseye && t.kind !== "decoy") {
          spawnPerfectBurst(t);
          if (upgradeLevels.perfectReload > 0) {
            isReloading = false;
            reloadRemaining = 0;
            ammoCount = getMaxQuiverArrows();
          }
        }

        playSfx(isBullseye && t.kind !== "decoy" ? "perfectHit" : "targetHit");
        triggerHaptic("light");
        if (waveHits >= CONFIG.WAVE_HIT_GOAL) {
          waveClearedThisFrame = true;
        }
        break;
      }

    }
    if (arrow.active && closestTarget && upgradeLevels.magnetArrows > 0 && closestDist <= CONFIG.MAGNET_PULL_RADIUS) {
      const pullRatio = 1 - closestDist / CONFIG.MAGNET_PULL_RADIUS;
      const pullAccel = CONFIG.MAGNET_PULL_STRENGTH * pullRatio * dt;
      if (closestDist > 0.001) {
        const pullX = -closestDx / closestDist;
        const pullY = -closestDy / closestDist;
        arrow.vx += pullX * pullAccel;
        arrow.vy += pullY * pullAccel;
      }
      arrow.magnetFxStrength = pullRatio;
      arrow.magnetTargetWorldX = closestTarget.worldX;
      arrow.magnetTargetHeight = closestTarget.postHeight;
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

  drawSky();
  drawMountains();
  for (const c of clouds) drawCloud(c);
  drawGround();
  drawWorldTargets();
  drawRingBursts();
  drawPerfectBursts();
  drawWindReaderPreview();
  drawArrows();
  drawHorseAndArcher();
  drawScorePopups();

  if (gameState === "PLAYING") {
    drawHUD();
  }

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = `${Math.round(11 * gameScale)}px monospace`;
  ctx.textAlign = "right";
  ctx.fillText("build 17", w - 10, h - 10);
  ctx.textAlign = "left";

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  loadAudio();
  setupInputHandlers();
  setupUpgradeButtons();
  loadCharacterVideo();
  loadArcherImage();
  initClouds();
  generateTargets();
  updateOrientationState();

  requestAnimationFrame(gameLoop);
  showStartScreen();
}

init();
