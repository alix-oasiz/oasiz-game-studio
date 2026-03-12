import { oasiz } from "@oasiz/sdk";

/**
 * HOOPS JUMP
 *
 * A retro pixel-art basketball game with Game Boy handheld aesthetic.
 * Tap to boost the ball into hoops that alternate sides.
 * Score combos for bonus points!
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Ball
  BALL_RADIUS: 20,
  GRAVITY: 0.75,
  BOOST_FORCE: 13.5,
  WALL_BOUNCE: 0.7,
  GROUND_BOUNCE: 0.7,
  AIR_RESISTANCE: 0.998,
  BOOST_ASSIST_START: 0.78,
  BOOST_ASSIST_FLOOR: 0.42,
  BOOST_ASSIST_STEP: 0.04,
  POST_SCORE_REDIRECT_START: 4.2,
  POST_SCORE_REDIRECT_FLOOR: 3.0,
  POST_SCORE_REDIRECT_STEP: 0.1,

  // Hoop
  HOOP_WIDTH: 80,
  HOOP_HEIGHT: 50,
  RIM_RADIUS: 5.2,
  NET_SEGMENTS: 7,
  BACKBOARD_WIDTH: 18,
  BACKBOARD_HEIGHT: 170,
  HOOP_MARGIN: 0,
  HOOP_Y_MIN_RATIO: 0.52,
  HOOP_Y_MAX_RATIO: 0.69,
  HOOP_Y_MIN_FLOOR: 0.45,
  HOOP_Y_MAX_FLOOR: 0.63,
  HOOP_Y_RATIO_STEP: 0.005,
  HOOP_SWITCH_DURATION: 500,

  // Scoring
  SCORE_TIER_SIZE: 500,
  BASE_POINTS: 8,
  POINTS_PER_TIER: 0.5,
  POINTS_PER_TIER_LATE: 0.3,
  SWISH_MULTIPLIER: 1.22,
  BANK_MULTIPLIER: 1.1,
  COMBO_WINDOW: 3000,

  // Timer
  GAME_DURATION: 20,
  MAX_TIME: 20,
  TIME_BONUS_START: 2.2,
  TIME_BONUS_FLOOR: 1.4,
  TIME_BONUS_DECAY_EARLY: 0.08,
  TIME_BONUS_DECAY_LATE: 0.06,
  TIME_BONUS_SLOWMO_EXTRA: 0.75,
  WARNING_TIME: 10,

  // Shot detection timing thresholds
  RIM_RATTLE_THRESHOLD: 300, // ms - if rim hit but score within this time, still swish
  BACKBOARD_VALID_WINDOW: 700, // ms - backboard hit only counts if scored within this time

  // Particles
  PARTICLE_COUNT: 12,
  PARTICLE_LIFE: 600,
  MAX_PARTICLES: 140,
  MAX_FIRE_PARTICLES: 70,
  FIRE_EMIT_INTERVAL: 32,

  // Background performance
  IDLE_BG_START_INTERVAL: 140,
  IDLE_BG_OVERLAY_INTERVAL: 220,
  BG_CACHE_PADDING: 180,

  // Screen shake
  SHAKE_BOOST: 2,
  SHAKE_SCORE: 6,
  SHAKE_COMBO: 10,
  SHAKE_DECAY: 0.85,

  // Slow-mo effect
  SLOWMO_THRESHOLD: 5, // Start slow-mo at 5 seconds remaining
  SLOWMO_MIN_SCALE: 0.3, // Slowest time scale for physics (30% speed)
  SLOWMO_TIMER_SCALE: 0.65, // Timer slows less (65% speed)

  // Score popups
  POPUP_DURATION: 1200,
  POPUP_RISE_SPEED: 1.2,

  // Safe areas
  TOP_SAFE_DESKTOP: 45,
  TOP_SAFE_MOBILE: 120,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type HoopSide = "left" | "right";
type ShotType = "swish" | "bank" | "rattle";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  lastGroundTime: number;
}

interface Hoop {
  side: HoopSide;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  animationProgress: number;
  netWave: number;
  scored: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "burst" | "trail" | "star" | "confetti";
  rotation: number;
  rotationSpeed: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

type MapType = "city" | "mountain" | "beach";

interface ComboTheme {
  label: string;
  popupColor: string;
  flashColor: string;
  particleColors: string[];
}

interface RankTier {
  label: string;
  color: string;
}

interface DriftCloud {
  baseX: number;
  y: number;
  scale: number;
  speed: number;
  depth?: number;
  opacity?: number;
}

interface BirdDescriptor {
  baseX: number;
  y: number;
  speed: number;
  size: number;
}

interface SailboatDescriptor {
  baseX: number;
  y: number;
  scale: number;
  speed: number;
}

interface PalmDescriptor {
  x: number;
  y: number;
  height: number;
  rotation: number;
}

interface SeagullDescriptor {
  baseX: number;
  y: number;
  speed: number;
}

interface MountainStar {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

interface RidgeLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface RockHighlight {
  x: number;
  y: number;
  length: number;
  tilt: number;
}

interface BackgroundLayerCache {
  canvas: HTMLCanvasElement;
  depth: number;
}

interface MountainSceneData {
  stars: MountainStar[];
  ridgeLines: RidgeLine[];
  rockHighlights: RockHighlight[];
}

type OasizRuntime = typeof oasiz & {
  emitScoreConfig?: (config: {
    anchors: Array<{ raw: number; normalized: number }>;
  }) => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
};

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const screenContainer = document.getElementById("screen-container")!;
const oasizRuntime = oasiz as OasizRuntime;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const startAction = document.getElementById("startAction")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const settingsScreen = document.getElementById("settingsScreen")!;
const scoreDisplay = document.getElementById("scoreDisplay")!;
const timerDisplay = document.getElementById("timerDisplay")!;
const scoreBadge = document.getElementById("score-badge")!;
const timerBadge = document.getElementById("timer-badge")!;
const finalScoreEl = document.getElementById("finalScore")!;
const rankValueEl = document.getElementById("rankValue")!;
const comboDisplay = document.getElementById("combo-display")!;
const timerBonusPopup = document.getElementById("timer-bonus-popup")!;
const hudElement = document.getElementById("hud")!;
const controlsElement = document.getElementById("controls")!;

// Control button
const boostBtn = document.getElementById("boost-btn")!;

// State
let gameState: GameState = "START";
let w = 0;
let h = 0;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let ball: Ball = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  rotation: 0,
  lastGroundTime: 0,
};

let hoop: Hoop = {
  side: "right",
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  animationProgress: 1,
  netWave: 0,
  scored: false,
};

let particles: Particle[] = [];
let scorePopups: ScorePopup[] = [];

// Progress
let score = 0;
let basketCount = 0;
let comboCount = 0;
let lastScoreTime = 0;
let ballOnFire = false;
let fireParticles: Array<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}> = [];
let hitBackboard = false; // Track if ball hit backboard this possession
let backboardHitTime = 0; // When backboard was hit (gameTime)
let hitRim = false; // Track if ball hit rim this possession
let rimHitTime = 0; // When rim was hit (gameTime)

function resetShotTracking(): void {
  hitBackboard = false;
  backboardHitTime = 0;
  hitRim = false;
  rimHitTime = 0;
}
let timeRemaining = CONFIG.GAME_DURATION;
let groundY = 0;

// Screen shake
let shakeX = 0;
let shakeY = 0;
let shakeIntensity = 0;

// Flash effects
let screenFlash = 0;
let flashColor = "#ffffff";

// Timing
let gameTime = 0;
let lastFrameTime = 0;
let rafId = 0;

function startLoop(): void {
  if (rafId) return;
  lastFrameTime = 0; // reset so first frame dt is 0, not a huge spike
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// Settings
let settings: Settings = {
  music: localStorage.getItem("hoopsJump_music") !== "false",
  fx: localStorage.getItem("hoopsJump_fx") !== "false",
  haptics: localStorage.getItem("hoopsJump_haptics") !== "false",
};

// Map selection
let currentMap: MapType =
  (localStorage.getItem("hoopsJump_map") as MapType) || "city";
let backgroundBaseCaches: Record<MapType, HTMLCanvasElement | null> = {
  city: null,
  mountain: null,
  beach: null,
};
let cityLayerCaches: BackgroundLayerCache[] = [];
let mountainSceneData: MountainSceneData = {
  stars: [],
  ridgeLines: [],
  rockHighlights: [],
};
let cityClouds: DriftCloud[] = [];
let cityBirds: BirdDescriptor[] = [];
let mountainClouds: DriftCloud[] = [];
let mountainBirds: BirdDescriptor[] = [];
let beachClouds: DriftCloud[] = [];
let beachSailboats: SailboatDescriptor[] = [];
let beachPalms: PalmDescriptor[] = [];
let beachSeagulls: SeagullDescriptor[] = [];
let frozenBackgroundTime = 0;
let fireParticleSpawnCarry = 0;

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function formatScore(value: number): string {
  return Math.floor(value).toLocaleString("en-US");
}

function getScoreTierForValue(value: number): number {
  return Math.max(0, Math.floor(value / CONFIG.SCORE_TIER_SIZE));
}

function getCurrentScoreTier(): number {
  return getScoreTierForValue(score);
}

function getBasePointsForTier(tier: number): number {
  const earlyTier = Math.min(tier, 10);
  const lateTier = Math.max(0, tier - 10);
  return (
    CONFIG.BASE_POINTS +
    earlyTier * CONFIG.POINTS_PER_TIER +
    lateTier * CONFIG.POINTS_PER_TIER_LATE
  );
}

function getComboBonusPoints(combo: number): number {
  return Math.max(0, combo - 1);
}

function getComboBand(combo: number): number {
  if (combo >= 50) return 5;
  if (combo >= 35) return 4;
  if (combo >= 20) return 3;
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

function getComboColorTier(combo: number): number {
  if (combo >= 50) return 10;
  if (combo >= 45) return 9;
  if (combo >= 40) return 8;
  if (combo >= 35) return 7;
  if (combo >= 30) return 6;
  if (combo >= 25) return 5;
  if (combo >= 20) return 4;
  if (combo >= 15) return 3;
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

function getComboTheme(combo: number): ComboTheme {
  const colorTier = getComboColorTier(combo);

  switch (colorTier) {
    case 10:
      return {
        label: "COSMIC",
        popupColor: "#ffffff",
        flashColor: "#ffffff",
        particleColors: ["#ffffff", "#ff8ae2", "#00A1E4", "#b8ff5c", "#ffd166"],
      };
    case 9:
      return {
        label: "PRISMATIC",
        popupColor: "#ff8ae2",
        flashColor: "#ff8ae2",
        particleColors: ["#ff8ae2", "#ffffff", "#7dd3ff", "#b8ff5c", "#ffd166"],
      };
    case 8:
      return {
        label: "STARLIGHT",
        popupColor: "#b8ff5c",
        flashColor: "#b8ff5c",
        particleColors: ["#b8ff5c", "#ffffff", "#00A1E4", "#ffd166", "#8d7cff"],
      };
    case 7:
      return {
        label: "NEBULA",
        popupColor: "#8d7cff",
        flashColor: "#8d7cff",
        particleColors: ["#8d7cff", "#ff8ae2", "#ffffff", "#00A1E4", "#ffd166"],
      };
    case 6:
      return {
        label: "AURORA",
        popupColor: "#00ffd0",
        flashColor: "#00ffd0",
        particleColors: ["#00ffd0", "#7dd3ff", "#ffffff", "#b8ff5c", "#00A1E4"],
      };
    case 5:
      return {
        label: "LEGENDARY",
        popupColor: "#ffffff",
        flashColor: "#00A1E4",
        particleColors: ["#ffffff", "#00A1E4", "#7dd3ff", "#ffd166"],
      };
    case 4:
      return {
        label: "UNSTOPPABLE",
        popupColor: "#7d5cff",
        flashColor: "#7d5cff",
        particleColors: ["#7d5cff", "#00A1E4", "#ffffff", "#ffb347"],
      };
    case 3:
      return {
        label: "BLAZING",
        popupColor: "#00A1E4",
        flashColor: "#00A1E4",
        particleColors: ["#00A1E4", "#7dd3ff", "#ffd166", "#ffffff"],
      };
    case 2:
      return {
        label: "HEAT CHECK",
        popupColor: "#ff5d73",
        flashColor: "#ff5d73",
        particleColors: ["#ff5d73", "#ffd166", "#ffffff", "#ff9966"],
      };
    case 1:
      return {
        label: "ON FIRE",
        popupColor: "#ff9f1c",
        flashColor: "#ff9f1c",
        particleColors: ["#ff9f1c", "#ffd166", "#ffffff", "#ff6b35"],
      };
    default:
      return {
        label: "COMBO",
        popupColor: "#ffff00",
        flashColor: "#ffff00",
        particleColors: ["#ffff00", "#ff8800", "#ffffff", "#ff4400"],
      };
  }
}

function getComboBannerText(combo: number): string {
  const theme = getComboTheme(combo);
  return combo + "x " + theme.label + "!";
}

function getComboMilestoneText(combo: number): string | null {
  if (combo === 5) return "ON FIRE!";
  if (combo === 10) return "HEAT CHECK!";
  if (combo === 15) return "RISING STAR!";
  if (combo === 20) return "BLAZING!";
  if (combo === 25) return "UNREAL!";
  if (combo === 30) return "AURORA!";
  if (combo === 35) return "UNSTOPPABLE!";
  if (combo === 40) return "NEBULA!";
  if (combo === 45) return "STARLIGHT!";
  if (combo === 50) return "COSMIC!";
  return null;
}

function getTierMilestoneText(tier: number): string {
  const milestoneScore = tier * CONFIG.SCORE_TIER_SIZE;
  if (tier === 1) return formatScore(milestoneScore) + "!";
  if (tier <= 4) return formatScore(milestoneScore) + " HOTTER!";
  return formatScore(milestoneScore) + " PRESSURE UP!";
}

function getCurrentComboWindow(): number {
  return CONFIG.COMBO_WINDOW;
}

function getTimeBonusForTier(tier: number): number {
  const earlyDecay = Math.min(tier, 5) * CONFIG.TIME_BONUS_DECAY_EARLY;
  const lateDecay = Math.max(0, tier - 5) * CONFIG.TIME_BONUS_DECAY_LATE;
  return Math.max(
    CONFIG.TIME_BONUS_FLOOR,
    CONFIG.TIME_BONUS_START - earlyDecay - lateDecay,
  );
}

function getCurrentTimeBonus(tier: number = getCurrentScoreTier()): number {
  return getTimeBonusForTier(tier);
}

function getCurrentSlowMoTimeBonus(
  tier: number = getCurrentScoreTier(),
): number {
  return getTimeBonusForTier(tier) + CONFIG.TIME_BONUS_SLOWMO_EXTRA;
}

function getCurrentHoopYRange(tier: number = getCurrentScoreTier()): {
  minRatio: number;
  maxRatio: number;
} {
  return {
    minRatio: Math.max(
      CONFIG.HOOP_Y_MIN_FLOOR,
      CONFIG.HOOP_Y_MIN_RATIO - tier * CONFIG.HOOP_Y_RATIO_STEP,
    ),
    maxRatio: Math.max(
      CONFIG.HOOP_Y_MAX_FLOOR,
      CONFIG.HOOP_Y_MAX_RATIO - tier * CONFIG.HOOP_Y_RATIO_STEP,
    ),
  };
}

function getCurrentBoostAssist(tier: number = getCurrentScoreTier()): number {
  return Math.max(
    CONFIG.BOOST_ASSIST_FLOOR,
    CONFIG.BOOST_ASSIST_START - tier * CONFIG.BOOST_ASSIST_STEP,
  );
}

function getCurrentPostScoreRedirectVelocity(
  tier: number = getCurrentScoreTier(),
): number {
  return Math.max(
    CONFIG.POST_SCORE_REDIRECT_FLOOR,
    CONFIG.POST_SCORE_REDIRECT_START - tier * CONFIG.POST_SCORE_REDIRECT_STEP,
  );
}

function getBgmTargetVolume(): number {
  const comboLift = Math.min(0.08, getComboBand(comboCount) * 0.02);
  const dangerLift = timeRemaining <= CONFIG.SLOWMO_THRESHOLD ? 0.03 : 0;
  return Math.min(0.42, 0.28 + comboLift + dangerLift);
}

function getRankForScore(value: number): RankTier {
  if (value >= 7500) return { label: "HALL OF FAME", color: "#00A1E4" };
  if (value >= 4500) return { label: "LEGEND", color: "#7d5cff" };
  if (value >= 2500) return { label: "MVP", color: "#ffd700" };
  if (value >= 1500) return { label: "ALL-STAR", color: "#ffffff" };
  if (value >= 650) return { label: "PRO", color: "#ff9f1c" };
  return { label: "ROOKIE", color: "#a0a0a0" };
}

function emitPlatformScoreConfig(): void {
  oasizRuntime.emitScoreConfig?.({
    anchors: [
      { raw: 250, normalized: 100 },
      { raw: 1250, normalized: 350 },
      { raw: 2500, normalized: 650 },
      { raw: 12500, normalized: 950 },
    ],
  });
}

function gameplayStart(): void {
  oasizRuntime.gameplayStart?.();
}

function gameplayStop(): void {
  oasizRuntime.gameplayStop?.();
}

// ============= AUDIO =============
import bgm1 from "./background-1.mp3";
import bgm2 from "./background-2.mp3";
import bgm3 from "./background-3.mp3";
import bgm4 from "./background-4.mp3";

let audioContext: AudioContext | null = null;
const bgmFiles = [bgm1, bgm2, bgm3, bgm4].sort(() => Math.random() - 0.5);
const bgmAudios = bgmFiles.map((src) => {
  const a = new Audio(src);
  a.loop = false;
  return a;
});
let currentBgmIndex = 0;
let isFading = false;
let userStarted = false;

function initAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log("[initAudio] Audio context initialized");
  }
  userStarted = true;
}

function startBgm(): void {
  if (!settings.music) return;
  const track = bgmAudios[currentBgmIndex];
  track.volume = getBgmTargetVolume();
  track.currentTime = 0;
  track.play().catch((e) => console.warn("[BGM] play blocked:", e));
}

function manageBgm(): void {
  if (!userStarted) return;

  const current = bgmAudios[currentBgmIndex];
  const targetVolume = getBgmTargetVolume();

  // Music is toggled from the click handler directly; just bail here if off
  if (!settings.music) return;

  if (!isFading) {
    current.volume += (targetVolume - current.volume) * 0.08;
  }

  // Crossfade when near end (2 seconds before)
  if (
    !isFading &&
    current.duration > 0 &&
    current.currentTime > current.duration - 2.0
  ) {
    isFading = true;
    const nextIndex = (currentBgmIndex + 1) % bgmAudios.length;
    const next = bgmAudios[nextIndex];
    next.currentTime = 0;
    next.volume = 0;

    // Play next track — this is a direct response to an ongoing interaction so it should work
    next.play().catch((e) => console.warn("[BGM] crossfade play blocked:", e));

    const FADE_STEPS = 20;
    let step = 0;
    const intv = setInterval(() => {
      step++;
      current.volume = Math.max(0, targetVolume * (1 - step / FADE_STEPS));
      next.volume = Math.min(targetVolume, targetVolume * (step / FADE_STEPS));
      if (step >= FADE_STEPS) {
        clearInterval(intv);
        current.pause();
        current.currentTime = 0;
        current.volume = targetVolume; // reset for next time
        currentBgmIndex = nextIndex;
        isFading = false;
      }
    }, 100);
  }
}

function playArpeggio(
  baseFreq: number,
  intervals: number[],
  waveType: OscillatorType,
  noteSpacing: number,
  noteDuration: number,
  gainValue: number,
): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  intervals.forEach((interval, index) => {
    const osc = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    const startAt = audioContext!.currentTime + index * noteSpacing;

    osc.connect(gain);
    gain.connect(audioContext!.destination);
    osc.type = waveType;
    osc.frequency.setValueAtTime(baseFreq * interval, startAt);

    gain.gain.setValueAtTime(gainValue, startAt);
    gain.gain.exponentialRampToValueAtTime(0.01, startAt + noteDuration);

    osc.start(startAt);
    osc.stop(startAt + noteDuration);
  });
}

function playBoostSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    500,
    audioContext.currentTime + 0.08,
  );

  gain.gain.setValueAtTime(0.22, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playBounceSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "triangle";
  osc.frequency.setValueAtTime(150, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    80,
    audioContext.currentTime + 0.06,
  );

  gain.gain.setValueAtTime(0.16, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.08);
}

function playSwishSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Create a "swish" sound with noise and pitch sweep
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioContext.destination);

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(800, audioContext.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(
    400,
    audioContext.currentTime + 0.15,
  );

  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(1200, audioContext.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(
    600,
    audioContext.currentTime + 0.15,
  );

  gain.gain.setValueAtTime(0.2, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

  osc1.start(audioContext.currentTime);
  osc2.start(audioContext.currentTime);
  osc1.stop(audioContext.currentTime + 0.2);
  osc2.stop(audioContext.currentTime + 0.2);
}

function playComboSound(level: number): void {
  const band = getComboBand(level);
  const pitchLift = Math.min(180, Math.sqrt(level) * 32);
  const baseFreq = Math.min(1100, 420 + pitchLift + band * 30);
  const intervals =
    band >= 4
      ? [1, 1.2, 1.5, 2]
      : band >= 2
        ? [1, 1.25, 1.5]
        : [1, 1.125, 1.33];
  const waveType: OscillatorType =
    band >= 4 ? "sawtooth" : band >= 2 ? "square" : "triangle";

  playArpeggio(
    baseFreq,
    intervals,
    waveType,
    0.06,
    0.14 + band * 0.01,
    0.1 + band * 0.015,
  );
}

function playComboMilestoneSound(level: number): void {
  const band = getComboBand(level);
  const baseFreq = 520 + band * 55;
  playArpeggio(baseFreq, [1, 1.33, 1.78, 2.2], "square", 0.05, 0.18, 0.14);
}

function playTierAdvanceSound(tier: number): void {
  const baseFreq = 380 + Math.min(160, tier * 20);
  playArpeggio(baseFreq, [1, 1.26, 1.5], "triangle", 0.07, 0.2, 0.12);
}

function playBuzzerSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    100,
    audioContext.currentTime + 0.5,
  );

  gain.gain.setValueAtTime(0.28, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.5);
}

function playUIClick(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(800, audioContext.currentTime);

  gain.gain.setValueAtTime(0.1, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.03);
}

// ============= HAPTICS =============
function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

// ============= SCREEN EFFECTS =============
function addScreenShake(intensity: number): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

function addScreenFlash(color: string, intensity: number = 1): void {
  screenFlash = intensity;
  flashColor = color;
}

function getSlowMoScale(): number {
  if (timeRemaining > CONFIG.SLOWMO_THRESHOLD) return 1;
  // Constant slow-mo speed for the entire duration
  return CONFIG.SLOWMO_MIN_SCALE;
}

function getTimerSlowMoScale(): number {
  if (timeRemaining > CONFIG.SLOWMO_THRESHOLD) return 1;
  // Timer slows less than physics
  return CONFIG.SLOWMO_TIMER_SCALE;
}

function updateScreenEffects(): void {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeIntensity *= CONFIG.SHAKE_DECAY;
  } else {
    shakeX = 0;
    shakeY = 0;
    shakeIntensity = 0;
  }

  if (screenFlash > 0) {
    screenFlash *= 0.85;
    if (screenFlash < 0.05) screenFlash = 0;
  }
}

// ============= DRAWING FUNCTIONS =============
// Pre-calculated building data for consistent rendering with depth
interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  shadowColor: string;
  highlightColor: string;
  depth: number;
  hasSpire: boolean;
  hasWaterTower: boolean;
  hasAC: boolean;
  windows: Array<{ wx: number; wy: number; ww: number; wh: number }>;
}

let cityBuildings: Building[] = [];

function initCityBuildings(): void {
  cityBuildings = [];

  // Create 6 layers of buildings for extreme depth
  const layers = [
    { minH: 250, maxH: 500, baseColor: [200, 210, 225], depth: 0, alpha: 0.3 }, // Distant mountains/buildings (hazy)
    {
      minH: 200,
      maxH: 450,
      baseColor: [180, 195, 215],
      depth: 0.15,
      alpha: 0.5,
    }, // Very far
    {
      minH: 180,
      maxH: 400,
      baseColor: [160, 180, 200],
      depth: 0.3,
      alpha: 0.7,
    }, // Far
    {
      minH: 140,
      maxH: 320,
      baseColor: [130, 155, 180],
      depth: 0.5,
      alpha: 0.85,
    }, // Mid-far
    {
      minH: 100,
      maxH: 250,
      baseColor: [100, 130, 160],
      depth: 0.7,
      alpha: 0.95,
    }, // Mid-near
    { minH: 60, maxH: 180, baseColor: [70, 100, 135], depth: 0.9, alpha: 1 }, // Near
  ];

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    let x = -100 + layerIndex * 17; // Offset each layer
    const buildingSpacing = 8 - layerIndex; // Closer buildings pack tighter

    while (x < w + 150) {
      const widthBase = 30 + layerIndex * 15;
      const width = widthBase + Math.floor(Math.random() * (widthBase * 0.8));
      const height =
        layer.minH + Math.floor(Math.random() * (layer.maxH - layer.minH));

      // Color variation within layer
      const colorVar = Math.floor(Math.random() * 20) - 10;
      const r = Math.min(255, Math.max(0, layer.baseColor[0] + colorVar));
      const g = Math.min(255, Math.max(0, layer.baseColor[1] + colorVar));
      const b = Math.min(255, Math.max(0, layer.baseColor[2] + colorVar));
      const color = "rgb(" + r + "," + g + "," + b + ")";
      const shadowColor =
        "rgb(" +
        Math.floor(r * 0.7) +
        "," +
        Math.floor(g * 0.7) +
        "," +
        Math.floor(b * 0.7) +
        ")";
      const highlightColor =
        "rgb(" +
        Math.min(255, r + 30) +
        "," +
        Math.min(255, g + 30) +
        "," +
        Math.min(255, b + 30) +
        ")";

      // Windows on ALL buildings - size scales with depth
      const windows: Array<{ wx: number; wy: number; ww: number; wh: number }> =
        [];
      const windowSize = Math.max(2, 2 + Math.floor(layer.depth * 6));
      const windowSpacingX = windowSize + 4 + Math.floor(layer.depth * 4);
      const windowSpacingY = windowSize + 5 + Math.floor(layer.depth * 5);
      const windowRows = Math.floor((height - 15) / windowSpacingY);
      const windowCols = Math.floor((width - 8) / windowSpacingX);

      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          if (Math.random() > 0.1) {
            windows.push({
              wx: col * windowSpacingX + 6,
              wy: row * windowSpacingY + 10,
              ww: windowSize,
              wh: windowSize + 1,
            });
          }
        }
      }

      cityBuildings.push({
        x,
        width,
        height,
        color,
        shadowColor,
        highlightColor,
        depth: layer.depth,
        hasSpire: height > 350 && Math.random() > 0.6,
        hasWaterTower:
          layer.depth > 0.5 &&
          height > 100 &&
          height < 200 &&
          Math.random() > 0.7,
        hasAC: layer.depth > 0.6 && Math.random() > 0.5,
        windows,
      });
      x += width + buildingSpacing + Math.floor(Math.random() * 15);
    }
  }

  // Sort by depth
  cityBuildings.sort((a, b) => a.depth - b.depth);
}

function createRenderCanvas(width: number, height: number): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.floor(width));
  target.height = Math.max(1, Math.floor(height));
  return target;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function initializeBackgroundDescriptors(): void {
  cityClouds = [
    { baseX: 0, y: 30, scale: 1.3, speed: 0.007 },
    { baseX: w * 0.25, y: 50, scale: 1.0, speed: 0.006 },
    { baseX: w * 0.5, y: 20, scale: 1.1, speed: 0.009 },
    { baseX: w * 0.75, y: 65, scale: 0.85, speed: 0.008 },
    { baseX: w * 0.1, y: 80, scale: 0.7, speed: 0.005 },
    { baseX: w * 0.4, y: 35, scale: 0.95, speed: 0.01 },
    { baseX: w * 0.6, y: 90, scale: 0.6, speed: 0.004 },
    { baseX: w * 0.85, y: 45, scale: 0.8, speed: 0.007 },
  ];
  cityBirds = [
    { baseX: 0, y: 40, speed: 0.05, size: 4 },
    { baseX: w * 0.4, y: 30, speed: 0.045, size: 4 },
    { baseX: w * 0.7, y: 50, speed: 0.055, size: 5 },
    { baseX: w * 0.2, y: 80, speed: 0.04, size: 5 },
    { baseX: w * 0.55, y: 100, speed: 0.035, size: 6 },
    { baseX: w * 0.85, y: 70, speed: 0.042, size: 5 },
    { baseX: w * 0.1, y: 140, speed: 0.06, size: 7 },
    { baseX: w * 0.5, y: 160, speed: 0.055, size: 8 },
    { baseX: w * 0.75, y: 130, speed: 0.05, size: 7 },
  ];
  mountainClouds = [
    { baseX: 0, y: groundY * 0.12, scale: 0.9, speed: 0.006, depth: 0.6 },
    {
      baseX: w * 0.25,
      y: groundY * 0.08,
      scale: 1.1,
      speed: 0.005,
      depth: 0.7,
    },
    {
      baseX: w * 0.55,
      y: groundY * 0.15,
      scale: 0.75,
      speed: 0.007,
      depth: 0.55,
    },
    {
      baseX: w * 0.78,
      y: groundY * 0.1,
      scale: 0.95,
      speed: 0.004,
      depth: 0.65,
    },
    {
      baseX: w * 0.15,
      y: groundY * 0.22,
      scale: 0.6,
      speed: 0.008,
      depth: 0.45,
    },
    { baseX: w * 0.85, y: groundY * 0.2, scale: 0.5, speed: 0.006, depth: 0.4 },
  ];
  mountainBirds = [
    { baseX: 0, y: groundY * 0.35, speed: 0.05, size: 6 },
    { baseX: w * 0.4, y: groundY * 0.28, speed: 0.04, size: 5 },
    { baseX: w * 0.6, y: groundY * 0.32, speed: 0.06, size: 4 },
    { baseX: w * 0.2, y: groundY * 0.25, speed: 0.045, size: 5 },
    { baseX: w * 0.8, y: groundY * 0.3, speed: 0.055, size: 6 },
  ];
  beachClouds = [
    { baseX: 0, y: 35, scale: 1.1, speed: 0.008 },
    { baseX: w * 0.3, y: 55, scale: 1.3, speed: 0.006 },
    { baseX: w * 0.6, y: 25, scale: 0.9, speed: 0.009 },
    { baseX: w * 0.85, y: 65, scale: 1.0, speed: 0.007 },
  ];
  beachSailboats = [
    { baseX: w * 0.2, y: groundY * 0.65 + 25, scale: 1.0, speed: 0.015 },
    { baseX: w * 0.6, y: groundY * 0.65 + 45, scale: 0.8, speed: 0.012 },
    { baseX: w * 0.45, y: groundY * 0.65 + 15, scale: 0.6, speed: 0.008 },
  ];
  beachPalms = [
    { x: w * 0.06, y: groundY, height: 85, rotation: -0.05 },
    { x: w * 0.03, y: groundY + 10, height: 70, rotation: -0.12 },
    { x: w * 0.94, y: groundY, height: 90, rotation: 0.08 },
    { x: w * 0.97, y: groundY + 15, height: 65, rotation: 0.15 },
  ];
  beachSeagulls = [
    { baseX: w * 0.3, y: 80, speed: 0.04 },
    { baseX: w * 0.5, y: 65, speed: 0.05 },
    { baseX: w * 0.8, y: 100, speed: 0.035 },
    { baseX: w * 0.1, y: 90, speed: 0.045 },
  ];

  const stars: MountainStar[] = [];
  for (let i = 0; i < 34; i++) {
    stars.push({
      x: w * seededUnit(20 + i * 3.1),
      y: 8 + groundY * 0.12 * seededUnit(40 + i * 4.7),
      size: 0.6 + seededUnit(80 + i * 2.3) * 1.4,
      brightness: 0.25 + seededUnit(110 + i * 5.3) * 0.75,
    });
  }

  const mtn2Points = [
    { x: -20, y: groundY * 0.75 },
    { x: w * 0.15, y: groundY * 0.52 },
    { x: w * 0.25, y: groundY * 0.62 },
    { x: w * 0.42, y: groundY * 0.45 },
    { x: w * 0.55, y: groundY * 0.58 },
    { x: w * 0.72, y: groundY * 0.48 },
    { x: w * 0.88, y: groundY * 0.65 },
    { x: w + 20, y: groundY * 0.78 },
  ];
  const mtn3Points = [
    { x: -50, y: groundY * 0.85 },
    { x: w * 0.1, y: groundY * 0.68 },
    { x: w * 0.22, y: groundY * 0.78 },
    { x: w * 0.38, y: groundY * 0.55 },
    { x: w * 0.52, y: groundY * 0.68 },
    { x: w * 0.65, y: groundY * 0.52 },
    { x: w * 0.82, y: groundY * 0.75 },
    { x: w + 50, y: groundY * 0.88 },
  ];
  const mtn4Points = [
    { x: -100, y: groundY },
    { x: w * 0.15, y: groundY * 0.78 },
    { x: w * 0.3, y: groundY * 0.88 },
    { x: w * 0.5, y: groundY * 0.72 },
    { x: w * 0.7, y: groundY * 0.85 },
    { x: w * 0.88, y: groundY * 0.78 },
    { x: w + 100, y: groundY * 0.95 },
  ];
  const ridgeLines: RidgeLine[] = [];
  const collectRidges = (
    points: Array<{ x: number; y: number }>,
    seedBase: number,
  ) => {
    for (let i = 1; i < points.length - 1; i++) {
      if (i % 2 !== 0) continue;
      const offsetX = (seededUnit(seedBase + i) - 0.5) * 20;
      const length = 40 + seededUnit(seedBase + i * 3) * 40;
      ridgeLines.push({
        startX: points[i].x,
        startY: points[i].y,
        endX: points[i].x + offsetX,
        endY: points[i].y + length,
      });
    }
  };
  collectRidges(mtn2Points, 200);
  collectRidges(mtn3Points, 300);
  collectRidges(mtn4Points, 400);

  const rockHighlights: RockHighlight[] = [];
  for (let i = 0; i < 20; i++) {
    rockHighlights.push({
      x: seededUnit(500 + i * 2.7) * w,
      y: groundY * 0.8 + seededUnit(700 + i * 1.9) * groundY * 0.2,
      length: 3 + seededUnit(900 + i * 3.3) * 4,
      tilt: -1 + seededUnit(1100 + i * 4.1) * 2,
    });
  }

  mountainSceneData = { stars, ridgeLines, rockHighlights };
}

function buildCityBackgroundCaches(): void {
  const base = createRenderCanvas(w, h);
  const bctx = base.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;

  const skyGradient = bctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#2d8adb");
  skyGradient.addColorStop(0.3, "#5aa8e8");
  skyGradient.addColorStop(0.6, "#8fc5f2");
  skyGradient.addColorStop(0.85, "#c5e0f8");
  skyGradient.addColorStop(1, "#e8f2fc");
  bctx.fillStyle = skyGradient;
  bctx.fillRect(0, 0, w, groundY);

  const hazeGradient = bctx.createLinearGradient(0, groundY * 0.5, 0, groundY);
  hazeGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  hazeGradient.addColorStop(1, "rgba(255, 255, 255, 0.3)");
  bctx.fillStyle = hazeGradient;
  bctx.fillRect(0, groundY * 0.5, w, groundY * 0.5);

  const sunX = w * 0.15;
  const sunY = groundY * 0.18;
  const sunRadius = 35;
  const outerGlow = bctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 4,
  );
  outerGlow.addColorStop(0, "rgba(255, 250, 220, 0.3)");
  outerGlow.addColorStop(0.5, "rgba(255, 250, 220, 0.1)");
  outerGlow.addColorStop(1, "rgba(255, 250, 220, 0)");
  bctx.fillStyle = outerGlow;
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius * 4, 0, Math.PI * 2);
  bctx.fill();

  const innerGlow = bctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 1.5,
  );
  innerGlow.addColorStop(0, "rgba(255, 255, 240, 0.9)");
  innerGlow.addColorStop(0.7, "rgba(255, 255, 200, 0.4)");
  innerGlow.addColorStop(1, "rgba(255, 255, 200, 0)");
  bctx.fillStyle = innerGlow;
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius * 1.5, 0, Math.PI * 2);
  bctx.fill();

  bctx.fillStyle = "#fffef0";
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  bctx.fill();

  bctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (let i = 0; i < 6; i++) {
    const wx = (i * 120 + 30) % w;
    const wy = groundY * 0.25 + (i % 3) * 15;
    bctx.fillRect(wx, wy, 40 + (i % 4) * 15, 2);
    bctx.fillRect(wx + 10, wy + 4, 25 + (i % 3) * 10, 1);
  }

  bctx.fillStyle = "#b0a090";
  bctx.fillRect(0, groundY, w, h - groundY);
  bctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  bctx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) {
    bctx.beginPath();
    bctx.moveTo(x, groundY);
    bctx.lineTo(x, h);
    bctx.stroke();
  }
  bctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  bctx.fillRect(0, groundY, w, 3);
  const edgeShadow = bctx.createLinearGradient(0, groundY, 0, groundY + 20);
  edgeShadow.addColorStop(0, "rgba(0, 0, 0, 0.15)");
  edgeShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  bctx.fillStyle = edgeShadow;
  bctx.fillRect(0, groundY, w, 20);
  backgroundBaseCaches.city = base;

  const padding = CONFIG.BG_CACHE_PADDING;
  const layerDepths = Array.from(
    new Set(cityBuildings.map((building) => building.depth)),
  );
  cityLayerCaches = layerDepths.map((depth) => {
    const layerCanvas = createRenderCanvas(w + padding * 2, h);
    const lctx = layerCanvas.getContext("2d")!;
    lctx.imageSmoothingEnabled = false;
    for (const building of cityBuildings) {
      if (building.depth !== depth) continue;
      const buildingTop = groundY - building.height;
      const px = building.x + padding;
      lctx.fillStyle = building.color;
      lctx.fillRect(px, buildingTop, building.width, building.height);
      lctx.fillStyle = building.highlightColor;
      lctx.fillRect(
        px,
        buildingTop,
        Math.max(2, building.width * 0.08),
        building.height,
      );
      lctx.fillStyle = building.shadowColor;
      lctx.fillRect(
        px + building.width - Math.max(2, building.width * 0.1),
        buildingTop,
        Math.max(2, building.width * 0.1),
        building.height,
      );
      if (building.depth > 0.4) {
        lctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        for (let y = buildingTop + 20; y < groundY; y += 25) {
          lctx.fillRect(px, y, building.width, 2);
        }
      }
      lctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      for (const win of building.windows) {
        lctx.fillRect(
          px + win.wx - 1,
          buildingTop + win.wy - 1,
          win.ww + 2,
          win.wh + 2,
        );
        lctx.fillStyle = "rgba(170, 210, 245, 0.72)";
        lctx.fillRect(px + win.wx, buildingTop + win.wy, win.ww, win.wh);
        lctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      }
    }
    return { canvas: layerCanvas, depth };
  });
}

function buildMountainBackgroundCache(): void {
  const base = createRenderCanvas(w, h);
  const bctx = base.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;

  const skyGradient = bctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#0a0015");
  skyGradient.addColorStop(0.08, "#1a0533");
  skyGradient.addColorStop(0.18, "#3a1055");
  skyGradient.addColorStop(0.3, "#6a1a5a");
  skyGradient.addColorStop(0.42, "#9c2848");
  skyGradient.addColorStop(0.55, "#cc4433");
  skyGradient.addColorStop(0.68, "#e87722");
  skyGradient.addColorStop(0.8, "#f5a020");
  skyGradient.addColorStop(0.9, "#ffc830");
  skyGradient.addColorStop(0.97, "#ffe888");
  skyGradient.addColorStop(1, "#fff8dd");
  bctx.fillStyle = skyGradient;
  bctx.fillRect(0, 0, w, groundY);

  const sunX = w * 0.65;
  const sunY = groundY * 0.72;
  const outerGlow = bctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 200);
  outerGlow.addColorStop(0, "rgba(255, 240, 180, 0.6)");
  outerGlow.addColorStop(0.2, "rgba(255, 200, 120, 0.4)");
  outerGlow.addColorStop(0.4, "rgba(255, 150, 80, 0.2)");
  outerGlow.addColorStop(0.7, "rgba(255, 100, 60, 0.05)");
  outerGlow.addColorStop(1, "rgba(255, 80, 50, 0)");
  bctx.fillStyle = outerGlow;
  bctx.beginPath();
  bctx.arc(sunX, sunY, 200, 0, Math.PI * 2);
  bctx.fill();

  const sunRadius = 45;
  const sunGradient = bctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 1.3,
  );
  sunGradient.addColorStop(0, "#fffff8");
  sunGradient.addColorStop(0.3, "#fffae0");
  sunGradient.addColorStop(0.6, "#ffdd66");
  sunGradient.addColorStop(0.85, "#ffaa22");
  sunGradient.addColorStop(1, "rgba(255, 140, 30, 0)");
  bctx.fillStyle = sunGradient;
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius * 1.3, 0, Math.PI * 2);
  bctx.fill();

  for (const star of mountainSceneData.stars) {
    bctx.fillStyle = "rgba(255, 255, 255, " + star.brightness + ")";
    bctx.beginPath();
    bctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    bctx.fill();
  }

  const dist1Gradient = bctx.createLinearGradient(
    0,
    groundY * 0.45,
    0,
    groundY * 0.7,
  );
  dist1Gradient.addColorStop(0, "rgba(100, 70, 100, 0.4)");
  dist1Gradient.addColorStop(1, "rgba(120, 80, 110, 0.2)");
  bctx.fillStyle = dist1Gradient;
  bctx.beginPath();
  bctx.moveTo(0, groundY * 0.65);
  bctx.lineTo(w * 0.1, groundY * 0.58);
  bctx.lineTo(w * 0.2, groundY * 0.62);
  bctx.lineTo(w * 0.35, groundY * 0.5);
  bctx.lineTo(w * 0.45, groundY * 0.55);
  bctx.lineTo(w * 0.6, groundY * 0.45);
  bctx.lineTo(w * 0.75, groundY * 0.58);
  bctx.lineTo(w * 0.9, groundY * 0.52);
  bctx.lineTo(w, groundY * 0.6);
  bctx.lineTo(w, groundY);
  bctx.lineTo(0, groundY);
  bctx.closePath();
  bctx.fill();

  const drawMountainLayer = (
    points: Array<{ x: number; y: number }>,
    lightColor: string,
    shadowColor: string,
  ) => {
    bctx.fillStyle = lightColor;
    bctx.beginPath();
    bctx.moveTo(points[0].x, groundY);
    for (let i = 0; i < points.length; i++) {
      bctx.lineTo(points[i].x, points[i].y);
      if (i < points.length - 1 && points[i].y < points[i + 1].y) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        bctx.lineTo(midX, groundY);
        bctx.lineTo(points[i].x, groundY);
      }
    }
    bctx.closePath();
    bctx.fill();

    bctx.fillStyle = shadowColor;
    bctx.beginPath();
    bctx.moveTo(points[points.length - 1].x, groundY);
    for (let i = points.length - 1; i >= 0; i--) {
      bctx.lineTo(points[i].x, points[i].y);
      if (i > 0 && points[i].y < points[i - 1].y) {
        const midX = (points[i].x + points[i - 1].x) / 2;
        bctx.lineTo(midX, groundY);
        bctx.lineTo(points[i].x, groundY);
      }
    }
    bctx.closePath();
    bctx.fill();
  };

  const mtn2Points = [
    { x: -20, y: groundY * 0.75 },
    { x: w * 0.15, y: groundY * 0.52 },
    { x: w * 0.25, y: groundY * 0.62 },
    { x: w * 0.42, y: groundY * 0.45 },
    { x: w * 0.55, y: groundY * 0.58 },
    { x: w * 0.72, y: groundY * 0.48 },
    { x: w * 0.88, y: groundY * 0.65 },
    { x: w + 20, y: groundY * 0.78 },
  ];
  const mtn3Points = [
    { x: -50, y: groundY * 0.85 },
    { x: w * 0.1, y: groundY * 0.68 },
    { x: w * 0.22, y: groundY * 0.78 },
    { x: w * 0.38, y: groundY * 0.55 },
    { x: w * 0.52, y: groundY * 0.68 },
    { x: w * 0.65, y: groundY * 0.52 },
    { x: w * 0.82, y: groundY * 0.75 },
    { x: w + 50, y: groundY * 0.88 },
  ];
  const mtn4Points = [
    { x: -100, y: groundY },
    { x: w * 0.15, y: groundY * 0.78 },
    { x: w * 0.3, y: groundY * 0.88 },
    { x: w * 0.5, y: groundY * 0.72 },
    { x: w * 0.7, y: groundY * 0.85 },
    { x: w * 0.88, y: groundY * 0.78 },
    { x: w + 100, y: groundY * 0.95 },
  ];
  drawMountainLayer(mtn2Points, "#5a3855", "#3a1838");
  drawMountainLayer(mtn3Points, "#3d2248", "#1d0a28");
  drawMountainLayer(mtn4Points, "#1a0d20", "#0a0410");

  bctx.strokeStyle = "rgba(255, 230, 245, 0.18)";
  bctx.lineWidth = 1;
  for (const ridge of mountainSceneData.ridgeLines) {
    bctx.beginPath();
    bctx.moveTo(ridge.startX, ridge.startY);
    bctx.lineTo(ridge.endX, ridge.endY);
    bctx.stroke();
  }

  const drawSnow = (px: number, py: number, width: number) => {
    bctx.beginPath();
    bctx.moveTo(px, py);
    bctx.lineTo(px - width, py + width * 1.5);
    for (let sx = px - width + 4; sx < px + width; sx += 6) {
      bctx.lineTo(sx, py + width * 1.2 + Math.sin(sx * 0.5) * 4);
    }
    bctx.lineTo(px + width, py + width * 1.5);
    bctx.closePath();
    bctx.fill();
  };
  bctx.fillStyle = "rgba(255, 230, 245, 0.4)";
  drawSnow(w * 0.42, groundY * 0.45, 18);
  drawSnow(w * 0.72, groundY * 0.48, 15);
  bctx.fillStyle = "rgba(255, 240, 250, 0.7)";
  drawSnow(w * 0.38, groundY * 0.55, 25);
  drawSnow(w * 0.65, groundY * 0.52, 22);

  const mistGradient = bctx.createLinearGradient(
    0,
    groundY * 0.55,
    0,
    groundY * 0.85,
  );
  mistGradient.addColorStop(0, "rgba(255, 180, 160, 0)");
  mistGradient.addColorStop(0.5, "rgba(255, 180, 160, 0.1)");
  mistGradient.addColorStop(1, "rgba(255, 160, 140, 0.05)");
  bctx.fillStyle = mistGradient;
  bctx.fillRect(0, groundY * 0.55, w, groundY * 0.3);

  bctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  for (const rock of mountainSceneData.rockHighlights) {
    bctx.beginPath();
    bctx.moveTo(rock.x, rock.y);
    bctx.lineTo(rock.x + rock.length, rock.y + rock.tilt * 1.5);
    bctx.stroke();
  }

  const courtGradient = bctx.createLinearGradient(0, groundY, 0, h);
  courtGradient.addColorStop(0, "#6a4535");
  courtGradient.addColorStop(0.3, "#5a3a2a");
  courtGradient.addColorStop(0.7, "#4a2f20");
  courtGradient.addColorStop(1, "#3a2415");
  bctx.fillStyle = courtGradient;
  bctx.fillRect(0, groundY, w, h - groundY);
  const reflectionGrad = bctx.createLinearGradient(0, groundY, 0, groundY + 30);
  reflectionGrad.addColorStop(0, "rgba(255, 180, 120, 0.25)");
  reflectionGrad.addColorStop(1, "rgba(255, 150, 100, 0)");
  bctx.fillStyle = reflectionGrad;
  bctx.fillRect(0, groundY, w, 30);
  bctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  bctx.lineWidth = 2;
  for (let x = 0; x < w; x += 32) {
    bctx.beginPath();
    bctx.moveTo(x, groundY);
    bctx.lineTo(x, h);
    bctx.stroke();
  }
  bctx.fillStyle = "rgba(60, 35, 20, 0.3)";
  for (let i = 0; i < 8; i++) {
    const kx = (i * 47 + 15) % w;
    const ky = groundY + 8 + (i % 3) * 12;
    bctx.beginPath();
    bctx.ellipse(kx, ky, 3 + (i % 2), 2, 0, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.fillStyle = "rgba(255, 200, 150, 0.3)";
  bctx.fillRect(0, groundY, w, 3);
  backgroundBaseCaches.mountain = base;
}

function buildBeachBackgroundCache(): void {
  const base = createRenderCanvas(w, h);
  const bctx = base.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;

  const skyGradient = bctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#0077aa");
  skyGradient.addColorStop(0.3, "#1fb1d9");
  skyGradient.addColorStop(0.6, "#7dd3e8");
  skyGradient.addColorStop(0.85, "#b8e8f5");
  skyGradient.addColorStop(1, "#e0f6fc");
  bctx.fillStyle = skyGradient;
  bctx.fillRect(0, 0, w, groundY);

  const sunX = w * 0.8;
  const sunY = groundY * 0.2;
  const sunRadius = 45;
  const sunGlow = bctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 4,
  );
  sunGlow.addColorStop(0, "rgba(255, 255, 240, 0.7)");
  sunGlow.addColorStop(0.2, "rgba(255, 255, 200, 0.4)");
  sunGlow.addColorStop(0.5, "rgba(255, 255, 150, 0.1)");
  sunGlow.addColorStop(1, "rgba(255, 255, 120, 0)");
  bctx.fillStyle = sunGlow;
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius * 4, 0, Math.PI * 2);
  bctx.fill();
  bctx.fillStyle = "#fffdf0";
  bctx.beginPath();
  bctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  bctx.fill();

  const oceanY = groundY * 0.65;
  const oceanGradient = bctx.createLinearGradient(0, oceanY, 0, groundY);
  oceanGradient.addColorStop(0, "#005588");
  oceanGradient.addColorStop(0.4, "#0077aa");
  oceanGradient.addColorStop(0.8, "#20a0cc");
  oceanGradient.addColorStop(1, "#40b8dd");
  bctx.fillStyle = oceanGradient;
  bctx.fillRect(0, oceanY, w, groundY - oceanY);

  bctx.fillStyle = "#e8d8a0";
  bctx.beginPath();
  bctx.moveTo(0, oceanY + 20);
  bctx.lineTo(0, groundY);
  bctx.lineTo(w * 0.12, groundY);
  bctx.lineTo(w * 0.04, oceanY + 30);
  bctx.closePath();
  bctx.fill();
  bctx.beginPath();
  bctx.moveTo(w, oceanY + 25);
  bctx.lineTo(w, groundY);
  bctx.lineTo(w * 0.88, groundY);
  bctx.lineTo(w * 0.96, oceanY + 35);
  bctx.closePath();
  bctx.fill();
  bctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  for (let i = 0; i < 20; i++) {
    const sx = (i * 23) % (w * 0.12);
    const sy = groundY - 5 - (i % 8) * 4;
    bctx.fillRect(sx, sy, 2, 2);
    const dx = w - ((i * 19) % (w * 0.12));
    bctx.fillRect(dx, sy, 2, 2);
  }

  const pierGradient = bctx.createLinearGradient(0, groundY, 0, h);
  pierGradient.addColorStop(0, "#8a6a4a");
  pierGradient.addColorStop(0.5, "#705838");
  pierGradient.addColorStop(1, "#504028");
  bctx.fillStyle = pierGradient;
  bctx.fillRect(0, groundY, w, h - groundY);
  bctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  bctx.lineWidth = 2;
  for (let x = 0; x < w; x += 30) {
    bctx.beginPath();
    bctx.moveTo(x, groundY);
    bctx.lineTo(x, h);
    bctx.stroke();
    bctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    bctx.beginPath();
    bctx.moveTo(x + 2, groundY);
    bctx.lineTo(x + 2, h);
    bctx.stroke();
    bctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  }
  bctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  bctx.fillRect(0, groundY, w, 3);
  backgroundBaseCaches.beach = base;
}

function rebuildBackgroundCaches(): void {
  initializeBackgroundDescriptors();
  shootingStars = [];
  cityBuildings = [];
  initCityBuildings();
  buildCityBackgroundCaches();
  buildMountainBackgroundCache();
  buildBeachBackgroundCache();
  frozenBackgroundTime = gameTime;
}

function drawCityCloud(
  targetCtx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  const s = scale;
  targetCtx.fillStyle = "rgba(200, 215, 235, 0.4)";
  targetCtx.beginPath();
  targetCtx.arc(cx + 5, cy + 8 * s, 22 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 30 * s, cy + 10 * s, 18 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 55 * s, cy + 8 * s, 20 * s, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
  targetCtx.beginPath();
  targetCtx.arc(cx, cy, 20 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 18 * s, cy - 8 * s, 16 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 35 * s, cy - 5 * s, 22 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 55 * s, cy, 18 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 70 * s, cy + 5 * s, 14 * s, 0, Math.PI * 2);
  targetCtx.fill();
}

function drawSunsetCloudCached(
  targetCtx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  depth: number,
): void {
  const s = scale;
  targetCtx.fillStyle = "rgba(80, 40, 60, " + 0.3 * depth + ")";
  targetCtx.beginPath();
  targetCtx.ellipse(cx + 5, cy + 12 * s, 35 * s, 10 * s, 0, 0, Math.PI * 2);
  targetCtx.ellipse(cx + 40 * s, cy + 14 * s, 28 * s, 8 * s, 0, 0, Math.PI * 2);
  targetCtx.fill();
  const cloudGrad = targetCtx.createLinearGradient(
    cx,
    cy - 15 * s,
    cx,
    cy + 15 * s,
  );
  cloudGrad.addColorStop(0, "rgba(255, 200, 160, " + 0.7 * depth + ")");
  cloudGrad.addColorStop(0.5, "rgba(255, 150, 120, " + 0.6 * depth + ")");
  cloudGrad.addColorStop(1, "rgba(200, 100, 100, " + 0.4 * depth + ")");
  targetCtx.fillStyle = cloudGrad;
  targetCtx.beginPath();
  targetCtx.ellipse(cx, cy, 28 * s, 14 * s, 0, 0, Math.PI * 2);
  targetCtx.ellipse(
    cx + 22 * s,
    cy - 6 * s,
    22 * s,
    12 * s,
    0.1,
    0,
    Math.PI * 2,
  );
  targetCtx.ellipse(
    cx + 45 * s,
    cy - 3 * s,
    26 * s,
    14 * s,
    -0.1,
    0,
    Math.PI * 2,
  );
  targetCtx.ellipse(cx + 68 * s, cy + 2 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
  targetCtx.fill();
}

function drawTropicalCloudCached(
  targetCtx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  opacity: number,
): void {
  const s = scale;
  targetCtx.fillStyle = "rgba(255, 255, 255, " + opacity + ")";
  targetCtx.beginPath();
  targetCtx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 15 * s, cy - 10 * s, 14 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 35 * s, cy - 5 * s, 20 * s, 0, Math.PI * 2);
  targetCtx.arc(cx + 55 * s, cy, 16 * s, 0, Math.PI * 2);
  targetCtx.fill();
}

function drawAnimatedCityBackground(
  motionTime: number,
  animateMotion: boolean = true,
): void {
  for (const layer of cityLayerCaches) {
    const offsetX = -CONFIG.BG_CACHE_PADDING - ball.x * layer.depth * 0.08;
    ctx.drawImage(layer.canvas, offsetX, 0);
  }
  for (const cloud of cityClouds) {
    const cx = ((cloud.baseX + motionTime * cloud.speed) % (w + 150)) - 75;
    drawCityCloud(ctx, cx, cloud.y, cloud.scale);
  }
  for (let i = 0; i < cityBirds.length; i++) {
    const bird = cityBirds[i];
    const bx = ((bird.baseX + motionTime * bird.speed) % (w + 80)) - 40;
    const by = bird.y + Math.sin(motionTime * 0.008 + i * 2) * 4;
    const wingFlap = animateMotion
      ? Math.sin(motionTime * 0.025 + i * 1.5) * (bird.size * 0.5)
      : 0;
    const alpha = 0.4 + (bird.y / groundY) * 0.4;
    ctx.strokeStyle = "rgba(40, 40, 60, " + alpha + ")";
    ctx.lineWidth = bird.size > 6 ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - bird.size, by + wingFlap);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bird.size, by + wingFlap);
    ctx.stroke();
  }
}

function drawAnimatedMountainBackground(
  motionTime: number,
  animateMotion: boolean,
): void {
  if (animateMotion) updateShootingStars();
  for (const s of shootingStars) {
    const alpha = s.life / 100;
    const grad = ctx.createLinearGradient(
      s.x,
      s.y,
      s.x - s.vx * 5,
      s.y - s.vy * 5,
    );
    grad.addColorStop(0, "rgba(255, 255, 255, " + alpha + ")");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 3, s.y - s.vy * 3);
    ctx.stroke();
  }

  const sunX = w * 0.65;
  const sunY = groundY * 0.72;
  ctx.save();
  const rayCount = 8;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + motionTime * 0.00005;
    const rayGradient = ctx.createLinearGradient(
      sunX,
      sunY,
      sunX + Math.cos(angle) * 300,
      sunY + Math.sin(angle) * 300,
    );
    rayGradient.addColorStop(0, "rgba(255, 200, 100, 0.05)");
    rayGradient.addColorStop(1, "rgba(255, 100, 50, 0)");
    ctx.fillStyle = rayGradient;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(
      sunX + Math.cos(angle - 0.1) * 360,
      sunY + Math.sin(angle - 0.1) * 360,
    );
    ctx.lineTo(
      sunX + Math.cos(angle + 0.1) * 360,
      sunY + Math.sin(angle + 0.1) * 360,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  for (const cloud of mountainClouds) {
    const cx = ((cloud.baseX + motionTime * cloud.speed) % (w + 150)) - 75;
    drawSunsetCloudCached(ctx, cx, cloud.y, cloud.scale, cloud.depth || 0.5);
  }
  for (let i = 0; i < mountainBirds.length; i++) {
    const bird = mountainBirds[i];
    const bx = ((bird.baseX + motionTime * bird.speed) % (w + 40)) - 20;
    const by = bird.y + Math.sin(motionTime * 0.008 + i * 2) * 4;
    const wingFlap = animateMotion
      ? Math.sin(motionTime * 0.02 + i * 1.8) * 3
      : 0;
    ctx.strokeStyle = "rgba(10, 5, 15, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - bird.size, by + wingFlap);
    ctx.quadraticCurveTo(bx - bird.size * 0.3, by - 2, bx, by);
    ctx.quadraticCurveTo(
      bx + bird.size * 0.3,
      by - 2,
      bx + bird.size,
      by + wingFlap,
    );
    ctx.stroke();
  }
}

function drawAnimatedBeachBackground(
  motionTime: number,
  animateMotion: boolean,
): void {
  const sunX = w * 0.8;
  const sunY = groundY * 0.2;
  ctx.save();
  const rayCount = 8;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + motionTime * 0.0001;
    const rayGradient = ctx.createLinearGradient(
      sunX,
      sunY,
      sunX + Math.cos(angle) * 360,
      sunY + Math.sin(angle) * 360,
    );
    rayGradient.addColorStop(0, "rgba(255, 255, 240, 0.07)");
    rayGradient.addColorStop(1, "rgba(255, 255, 200, 0)");
    ctx.fillStyle = rayGradient;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(
      sunX + Math.cos(angle - 0.12) * 520,
      sunY + Math.sin(angle - 0.12) * 520,
    );
    ctx.lineTo(
      sunX + Math.cos(angle + 0.12) * 520,
      sunY + Math.sin(angle + 0.12) * 520,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  for (const cloud of beachClouds) {
    const cx = ((cloud.baseX + motionTime * cloud.speed) % (w + 150)) - 75;
    drawTropicalCloudCached(ctx, cx, cloud.y, cloud.scale, 0.9);
  }

  const oceanY = groundY * 0.65;
  for (let i = 0; i < 4; i++) {
    const waveY = oceanY + 18 + i * 28;
    const waveOffset = motionTime * 0.03 + i * 50;
    ctx.strokeStyle = "rgba(255, 255, 255, " + (0.14 + i * 0.03) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 8) {
      const y = waveY + Math.sin((x + waveOffset) * 0.045) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const boat of beachSailboats) {
    const bx = ((boat.baseX + motionTime * boat.speed) % (w + 100)) - 50;
    const bob = animateMotion
      ? Math.sin(motionTime * 0.002 + boat.baseX) * 2
      : 0;
    const s = boat.scale;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(bx - 12 * s, boat.y + bob);
    ctx.lineTo(bx + 12 * s, boat.y + bob);
    ctx.lineTo(bx + 8 * s, boat.y + 5 * s + bob);
    ctx.lineTo(bx - 8 * s, boat.y + 5 * s + bob);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < beachSeagulls.length; i++) {
    const gull = beachSeagulls[i];
    const gx = ((gull.baseX + motionTime * gull.speed) % (w + 60)) - 30;
    const gy = gull.y + Math.sin(motionTime * 0.012 + i) * 6;
    const wing = animateMotion ? Math.sin(motionTime * 0.025 + i * 1.5) * 5 : 0;
    ctx.beginPath();
    ctx.moveTo(gx - 8, gy + wing);
    ctx.quadraticCurveTo(gx - 4, gy - 2, gx, gy);
    ctx.quadraticCurveTo(gx + 4, gy - 2, gx + 8, gy + wing);
    ctx.stroke();
  }
}

function drawBackground(
  motionTime: number,
  animateLiveLayers: boolean = true,
): void {
  switch (currentMap) {
    case "mountain":
      if (backgroundBaseCaches.mountain)
        ctx.drawImage(backgroundBaseCaches.mountain, 0, 0);
      drawAnimatedMountainBackground(motionTime, animateLiveLayers);
      break;
    case "beach":
      if (backgroundBaseCaches.beach)
        ctx.drawImage(backgroundBaseCaches.beach, 0, 0);
      drawAnimatedBeachBackground(motionTime, animateLiveLayers);
      break;
    case "city":
    default:
      if (backgroundBaseCaches.city)
        ctx.drawImage(backgroundBaseCaches.city, 0, 0);
      drawAnimatedCityBackground(motionTime, animateLiveLayers);
      break;
  }
}

function drawCityBackground(): void {
  // Bright daytime sky gradient with atmospheric perspective
  const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#2d8adb"); // Deep sky blue at top
  skyGradient.addColorStop(0.3, "#5aa8e8"); // Mid sky
  skyGradient.addColorStop(0.6, "#8fc5f2"); // Lighter
  skyGradient.addColorStop(0.85, "#c5e0f8"); // Hazy
  skyGradient.addColorStop(1, "#e8f2fc"); // Very hazy horizon
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, w, groundY);

  // Atmospheric haze layer at horizon
  const hazeGradient = ctx.createLinearGradient(0, groundY * 0.5, 0, groundY);
  hazeGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  hazeGradient.addColorStop(1, "rgba(255, 255, 255, 0.3)");
  ctx.fillStyle = hazeGradient;
  ctx.fillRect(0, groundY * 0.5, w, groundY * 0.5);

  // Sun with lens flare effect
  const sunX = w * 0.15;
  const sunY = groundY * 0.18;
  const sunRadius = 35;

  // Outer glow
  const outerGlow = ctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 4,
  );
  outerGlow.addColorStop(0, "rgba(255, 250, 220, 0.3)");
  outerGlow.addColorStop(0.5, "rgba(255, 250, 220, 0.1)");
  outerGlow.addColorStop(1, "rgba(255, 250, 220, 0)");
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 4, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  const innerGlow = ctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 1.5,
  );
  innerGlow.addColorStop(0, "rgba(255, 255, 240, 0.9)");
  innerGlow.addColorStop(0.7, "rgba(255, 255, 200, 0.4)");
  innerGlow.addColorStop(1, "rgba(255, 255, 200, 0)");
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Sun core
  ctx.fillStyle = "#fffef0";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Slow-moving fluffy clouds with shading - more clouds!
  const cloudBaseData = [
    { baseX: 0, y: 30, scale: 1.3, speed: 0.007 },
    { baseX: w * 0.25, y: 50, scale: 1.0, speed: 0.006 },
    { baseX: w * 0.5, y: 20, scale: 1.1, speed: 0.009 },
    { baseX: w * 0.75, y: 65, scale: 0.85, speed: 0.008 },
    { baseX: w * 0.1, y: 80, scale: 0.7, speed: 0.005 },
    { baseX: w * 0.4, y: 35, scale: 0.95, speed: 0.01 },
    { baseX: w * 0.6, y: 90, scale: 0.6, speed: 0.004 },
    { baseX: w * 0.85, y: 45, scale: 0.8, speed: 0.007 },
    { baseX: w * 0.15, y: 55, scale: 0.75, speed: 0.006 },
    { baseX: w * 0.55, y: 70, scale: 0.65, speed: 0.0055 },
    { baseX: w * 0.3, y: 15, scale: 1.0, speed: 0.008 },
    { baseX: w * 0.7, y: 100, scale: 0.5, speed: 0.003 },
  ];

  for (const cloud of cloudBaseData) {
    // Slow drift - wraps around screen
    const cx = ((cloud.baseX + gameTime * cloud.speed) % (w + 150)) - 75;
    const cy = cloud.y;
    const s = cloud.scale;

    // Cloud shadow (underneath)
    ctx.fillStyle = "rgba(200, 215, 235, 0.4)";
    ctx.beginPath();
    ctx.arc(cx + 5, cy + 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(cx + 30 * s, cy + 10 * s, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx + 55 * s, cy + 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();

    // Main cloud body (white base)
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, 20 * s, 0, Math.PI * 2);
    ctx.arc(cx + 18 * s, cy - 8 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(cx + 35 * s, cy - 5 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(cx + 55 * s, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx + 70 * s, cy + 5 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();

    // Cloud highlights (top)
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    ctx.arc(cx + 5 * s, cy - 5 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(cx + 35 * s, cy - 12 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(cx + 55 * s, cy - 6 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();

    // Subtle shading on bottom edges
    ctx.fillStyle = "rgba(220, 230, 245, 0.6)";
    ctx.beginPath();
    ctx.arc(cx + 10 * s, cy + 6 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(cx + 40 * s, cy + 8 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(cx + 62 * s, cy + 6 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant wispy cirrus clouds near horizon (static)
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (let i = 0; i < 6; i++) {
    const wx = (i * 120 + 30) % w;
    const wy = groundY * 0.25 + (i % 3) * 15;
    ctx.fillRect(wx, wy, 40 + (i % 4) * 15, 2);
    ctx.fillRect(wx + 10, wy + 4, 25 + (i % 3) * 10, 1);
  }

  // Flying birds at various heights - small V shapes
  const birdData = [
    // High flying birds (smaller, faster)
    { baseX: 0, y: 40, speed: 0.05, size: 4 },
    { baseX: w * 0.4, y: 30, speed: 0.045, size: 4 },
    { baseX: w * 0.7, y: 50, speed: 0.055, size: 5 },
    // Mid-height birds
    { baseX: w * 0.2, y: 80, speed: 0.04, size: 5 },
    { baseX: w * 0.55, y: 100, speed: 0.035, size: 6 },
    { baseX: w * 0.85, y: 70, speed: 0.042, size: 5 },
    // Lower flying birds (larger, closer)
    { baseX: w * 0.1, y: 140, speed: 0.06, size: 7 },
    { baseX: w * 0.5, y: 160, speed: 0.055, size: 8 },
    { baseX: w * 0.75, y: 130, speed: 0.05, size: 7 },
    { baseX: w * 0.3, y: 180, speed: 0.065, size: 8 },
    // Very low (near buildings)
    { baseX: w * 0.15, y: groundY * 0.5, speed: 0.07, size: 9 },
    { baseX: w * 0.6, y: groundY * 0.55, speed: 0.065, size: 9 },
    { baseX: w * 0.9, y: groundY * 0.45, speed: 0.06, size: 8 },
  ];

  for (let i = 0; i < birdData.length; i++) {
    const bird = birdData[i];
    const bx = ((bird.baseX + gameTime * bird.speed) % (w + 80)) - 40;
    const by = bird.y + Math.sin(gameTime * 0.008 + i * 2) * 4; // Gentle bob
    const wingFlap = Math.sin(gameTime * 0.025 + i * 1.5) * (bird.size * 0.5); // Wing animation

    // Birds further away are more faded
    const alpha = 0.4 + (bird.y / groundY) * 0.4;
    ctx.strokeStyle = "rgba(40, 40, 60, " + alpha + ")";
    ctx.lineWidth = bird.size > 6 ? 2 : 1.5;

    ctx.beginPath();
    ctx.moveTo(bx - bird.size, by + wingFlap);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bird.size, by + wingFlap);
    ctx.stroke();
  }

  // Initialize buildings if needed
  if (cityBuildings.length === 0) {
    initCityBuildings();
  }

  // Draw pixel city skyline with depth
  for (const building of cityBuildings) {
    const parallaxX = building.x - ball.x * building.depth * 0.08;
    const buildingTop = groundY - building.height;

    // Main building body
    ctx.fillStyle = building.color;
    ctx.fillRect(parallaxX, buildingTop, building.width, building.height);

    // Left highlight (sun side)
    ctx.fillStyle = building.highlightColor;
    ctx.fillRect(
      parallaxX,
      buildingTop,
      Math.max(2, building.width * 0.08),
      building.height,
    );

    // Right shadow
    ctx.fillStyle = building.shadowColor;
    ctx.fillRect(
      parallaxX + building.width - Math.max(2, building.width * 0.1),
      buildingTop,
      Math.max(2, building.width * 0.1),
      building.height,
    );

    // Horizontal bands/floors
    if (building.depth > 0.4) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      for (let y = buildingTop + 20; y < groundY; y += 25) {
        ctx.fillRect(parallaxX, y, building.width, 2);
      }
    }

    // Windows
    if (building.windows.length > 0) {
      for (const win of building.windows) {
        // Window frame
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fillRect(
          parallaxX + win.wx - 1,
          buildingTop + win.wy - 1,
          win.ww + 2,
          win.wh + 2,
        );
        // Glass with sky reflection
        const reflectGradient = ctx.createLinearGradient(
          0,
          buildingTop + win.wy,
          0,
          buildingTop + win.wy + win.wh,
        );
        reflectGradient.addColorStop(0, "rgba(180, 220, 255, 0.7)");
        reflectGradient.addColorStop(1, "rgba(100, 150, 200, 0.5)");
        ctx.fillStyle = reflectGradient;
        ctx.fillRect(parallaxX + win.wx, buildingTop + win.wy, win.ww, win.wh);
      }
    }
  }

  // Ground/floor (rooftop court surface)
  ctx.fillStyle = "#b0a090";
  ctx.fillRect(0, groundY, w, h - groundY);

  // Floor texture - concrete tiles
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Floor top highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(0, groundY, w, 3);

  // Subtle shadow from player's rooftop edge
  const edgeShadow = ctx.createLinearGradient(0, groundY, 0, groundY + 20);
  edgeShadow.addColorStop(0, "rgba(0, 0, 0, 0.15)");
  edgeShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = edgeShadow;
  ctx.fillRect(0, groundY, w, 20);
}

// Shooting stars state
let shootingStars: Array<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  length: number;
}> = [];

function updateShootingStars(): void {
  // Occasionally spawn a shooting star
  if (currentMap === "mountain" && Math.random() < 0.005) {
    shootingStars.push({
      x: Math.random() * w,
      y: Math.random() * groundY * 0.3,
      vx: 4 + Math.random() * 4,
      vy: 1 + Math.random() * 2,
      life: 100,
      length: 20 + Math.random() * 30,
    });
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 1.5;
    if (s.life <= 0) shootingStars.splice(i, 1);
  }
}

// ============= MOUNTAIN SUNSET BACKGROUND =============
function drawMountainBackground(): void {
  // Rich sunset gradient with more color stops for smoother transitions
  const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#0a0015"); // Almost black at top
  skyGradient.addColorStop(0.08, "#1a0533"); // Deep purple
  skyGradient.addColorStop(0.18, "#3a1055"); // Purple
  skyGradient.addColorStop(0.3, "#6a1a5a"); // Magenta purple
  skyGradient.addColorStop(0.42, "#9c2848"); // Rose
  skyGradient.addColorStop(0.55, "#cc4433"); // Deep orange-red
  skyGradient.addColorStop(0.68, "#e87722"); // Orange
  skyGradient.addColorStop(0.8, "#f5a020"); // Golden orange
  skyGradient.addColorStop(0.9, "#ffc830"); // Yellow-orange
  skyGradient.addColorStop(0.97, "#ffe888"); // Pale gold
  skyGradient.addColorStop(1, "#fff8dd"); // Creamy horizon
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, w, groundY);

  // Update and draw shooting stars
  updateShootingStars();
  for (const s of shootingStars) {
    const alpha = s.life / 100;
    const grad = ctx.createLinearGradient(
      s.x,
      s.y,
      s.x - s.vx * 5,
      s.y - s.vy * 5,
    );
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 3, s.y - s.vy * 3);
    ctx.stroke();
  }

  // Atmospheric light rays from sun
  const sunX = w * 0.65;
  const sunY = groundY * 0.72;

  // God rays / crepuscular rays - radiating 360 degrees
  ctx.save();
  const mtnRayCount = 10;
  for (let i = 0; i < mtnRayCount; i++) {
    const angle = (i / mtnRayCount) * Math.PI * 2 + gameTime * 0.00005;
    const rayGradient = ctx.createLinearGradient(
      sunX,
      sunY,
      sunX + Math.cos(angle) * 300,
      sunY + Math.sin(angle) * 300,
    );
    // Lighter alphas for sunset
    rayGradient.addColorStop(0, "rgba(255, 200, 100, 0.06)");
    rayGradient.addColorStop(0.5, "rgba(255, 150, 80, 0.02)");
    rayGradient.addColorStop(1, "rgba(255, 100, 50, 0)");

    ctx.fillStyle = rayGradient;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    const rayWidth = 0.12;
    ctx.lineTo(
      sunX + Math.cos(angle - rayWidth) * 400,
      sunY + Math.sin(angle - rayWidth) * 400,
    );
    ctx.lineTo(
      sunX + Math.cos(angle + rayWidth) * 400,
      sunY + Math.sin(angle + rayWidth) * 400,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Large outer sun glow
  const outerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 200);
  outerGlow.addColorStop(0, "rgba(255, 240, 180, 0.6)");
  outerGlow.addColorStop(0.2, "rgba(255, 200, 120, 0.4)");
  outerGlow.addColorStop(0.4, "rgba(255, 150, 80, 0.2)");
  outerGlow.addColorStop(0.7, "rgba(255, 100, 60, 0.05)");
  outerGlow.addColorStop(1, "rgba(255, 80, 50, 0)");
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 200, 0, Math.PI * 2);
  ctx.fill();

  // Sun core with soft edge
  const sunRadius = 45;
  const sunGradient = ctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 1.3,
  );
  sunGradient.addColorStop(0, "#fffff8");
  sunGradient.addColorStop(0.3, "#fffae0");
  sunGradient.addColorStop(0.6, "#ffdd66");
  sunGradient.addColorStop(0.85, "#ffaa22");
  sunGradient.addColorStop(1, "rgba(255, 140, 30, 0)");
  ctx.fillStyle = sunGradient;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Twinkling stars with varied brightness - way more stars!
  const stars = [
    { x: w * 0.05, y: 12, s: 1.5, b: 0.9 },
    { x: w * 0.12, y: 28, s: 1, b: 0.6 },
    { x: w * 0.18, y: 8, s: 2, b: 1 },
    { x: w * 0.25, y: 42, s: 1.2, b: 0.5 },
    { x: w * 0.32, y: 18, s: 1.8, b: 0.8 },
    { x: w * 0.38, y: 55, s: 0.8, b: 0.4 },
    { x: w * 0.45, y: 22, s: 1.5, b: 0.7 },
    { x: w * 0.52, y: 35, s: 1, b: 0.5 },
    { x: w * 0.6, y: 15, s: 1.8, b: 0.85 },
    { x: w * 0.68, y: 48, s: 1.2, b: 0.45 },
    { x: w * 0.75, y: 25, s: 2, b: 0.9 },
    { x: w * 0.82, y: 10, s: 1.5, b: 0.75 },
    { x: w * 0.88, y: 38, s: 1, b: 0.55 },
    { x: w * 0.95, y: 20, s: 1.8, b: 0.8 },
    { x: w * 0.08, y: 50, s: 0.8, b: 0.35 },
    { x: w * 0.22, y: 62, s: 0.7, b: 0.3 },
    { x: w * 0.42, y: 68, s: 0.6, b: 0.25 },
    { x: w * 0.55, y: 58, s: 0.9, b: 0.35 },
    { x: w * 0.03, y: 32, s: 1.1, b: 0.6 },
    { x: w * 0.15, y: 45, s: 0.9, b: 0.4 },
    { x: w * 0.28, y: 15, s: 1.3, b: 0.7 },
    { x: w * 0.48, y: 12, s: 1.0, b: 0.5 },
    { x: w * 0.65, y: 38, s: 1.4, b: 0.65 },
    { x: w * 0.85, y: 52, s: 0.8, b: 0.4 },
    { x: w * 0.92, y: 8, s: 1.6, b: 0.8 },
    { x: w * 0.07, y: 18, s: 1.2, b: 0.55 },
    { x: w * 0.35, y: 32, s: 1.1, b: 0.6 },
    { x: w * 0.58, y: 25, s: 0.9, b: 0.45 },
    { x: w * 0.72, y: 15, s: 1.5, b: 0.75 },
    { x: w * 0.88, y: 42, s: 1.0, b: 0.5 },
    { x: w * 0.1, y: 65, s: 0.7, b: 0.3 },
    { x: w * 0.3, y: 72, s: 0.6, b: 0.25 },
    { x: w * 0.5, y: 68, s: 0.8, b: 0.3 },
    { x: w * 0.7, y: 75, s: 0.7, b: 0.35 },
  ];
  for (const star of stars) {
    // Star glow
    const starGlow = ctx.createRadialGradient(
      star.x,
      star.y,
      0,
      star.x,
      star.y,
      star.s * 3,
    );
    const twinkle = 0.8 + Math.sin(gameTime * 0.005 + star.x) * 0.2;
    starGlow.addColorStop(
      0,
      "rgba(255, 255, 255, " + star.b * 0.8 * twinkle + ")",
    );
    starGlow.addColorStop(
      0.5,
      "rgba(255, 255, 255, " + star.b * 0.2 * twinkle + ")",
    );
    starGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.s * 3, 0, Math.PI * 2);
    ctx.fill();
    // Star core
    ctx.fillStyle = "rgba(255, 255, 255, " + star.b * twinkle + ")";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layered clouds with sunset colors and shading
  const drawSunsetCloud = (
    cx: number,
    cy: number,
    scale: number,
    depth: number,
  ) => {
    const s = scale;
    // Underside shadow
    ctx.fillStyle = "rgba(80, 40, 60, " + 0.3 * depth + ")";
    ctx.beginPath();
    ctx.ellipse(cx + 5, cy + 12 * s, 35 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 40 * s, cy + 14 * s, 28 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main cloud body - warm orange-pink
    const cloudGrad = ctx.createLinearGradient(
      cx,
      cy - 15 * s,
      cx,
      cy + 15 * s,
    );
    cloudGrad.addColorStop(0, "rgba(255, 200, 160, " + 0.7 * depth + ")");
    cloudGrad.addColorStop(0.5, "rgba(255, 150, 120, " + 0.6 * depth + ")");
    cloudGrad.addColorStop(1, "rgba(200, 100, 100, " + 0.4 * depth + ")");
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22 * s, cy - 6 * s, 22 * s, 12 * s, 0.1, 0, Math.PI * 2);
    ctx.ellipse(cx + 45 * s, cy - 3 * s, 26 * s, 14 * s, -0.1, 0, Math.PI * 2);
    ctx.ellipse(cx + 68 * s, cy + 2 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top highlights - golden from sun
    ctx.fillStyle = "rgba(255, 240, 200, " + 0.5 * depth + ")";
    ctx.beginPath();
    ctx.ellipse(cx + 8 * s, cy - 8 * s, 15 * s, 6 * s, 0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + 35 * s, cy - 12 * s, 18 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 58 * s, cy - 6 * s, 12 * s, 5 * s, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Bright rim from sun backlighting
    ctx.fillStyle = "rgba(255, 255, 220, " + 0.35 * depth + ")";
    ctx.beginPath();
    ctx.ellipse(cx + 25 * s, cy - 14 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 50 * s, cy - 10 * s, 10 * s, 3 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
  };

  // Multiple cloud layers - moving slowly
  const sunsetCloudData = [
    { baseX: 0, y: groundY * 0.12, scale: 0.9, depth: 0.6, speed: 0.006 },
    {
      baseX: w * 0.25,
      y: groundY * 0.08,
      scale: 1.1,
      depth: 0.7,
      speed: 0.005,
    },
    {
      baseX: w * 0.55,
      y: groundY * 0.15,
      scale: 0.75,
      depth: 0.55,
      speed: 0.007,
    },
    {
      baseX: w * 0.78,
      y: groundY * 0.1,
      scale: 0.95,
      depth: 0.65,
      speed: 0.004,
    },
    {
      baseX: w * 0.15,
      y: groundY * 0.22,
      scale: 0.6,
      depth: 0.45,
      speed: 0.008,
    },
    { baseX: w * 0.85, y: groundY * 0.2, scale: 0.5, depth: 0.4, speed: 0.006 },
  ];

  for (const cloud of sunsetCloudData) {
    const cx = ((cloud.baseX + gameTime * cloud.speed) % (w + 150)) - 75;
    drawSunsetCloud(cx, cloud.y, cloud.scale, cloud.depth);
  }

  // LAYER 1: Very distant mountains (atmospheric haze)
  const dist1Gradient = ctx.createLinearGradient(
    0,
    groundY * 0.45,
    0,
    groundY * 0.7,
  );
  dist1Gradient.addColorStop(0, "rgba(100, 70, 100, 0.4)");
  dist1Gradient.addColorStop(1, "rgba(120, 80, 110, 0.2)");
  ctx.fillStyle = dist1Gradient;
  ctx.beginPath();
  ctx.moveTo(0, groundY * 0.65);
  ctx.lineTo(w * 0.1, groundY * 0.58);
  ctx.lineTo(w * 0.2, groundY * 0.62);
  ctx.lineTo(w * 0.35, groundY * 0.5);
  ctx.lineTo(w * 0.45, groundY * 0.55);
  ctx.lineTo(w * 0.6, groundY * 0.45);
  ctx.lineTo(w * 0.75, groundY * 0.58);
  ctx.lineTo(w * 0.9, groundY * 0.52);
  ctx.lineTo(w, groundY * 0.6);
  ctx.lineTo(w, groundY);
  ctx.lineTo(0, groundY);
  ctx.closePath();
  ctx.fill();

  // Helper for drawing detailed jagged mountains with lighting
  const drawJaggedMountain = (
    points: Array<{ x: number; y: number }>,
    baseColor: string,
    lightColor: string,
    shadowColor: string,
  ) => {
    // 1. Draw light side (left slopes)
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, groundY);
    for (let i = 0; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
      // Create a vertical "ridge" down from each peak
      if (i < points.length - 1 && points[i].y < points[i + 1].y) {
        // This is a peak or descending slope - find mid point for ridge
        const midX = (points[i].x + points[i + 1].x) / 2;
        ctx.lineTo(midX, groundY);
        ctx.lineTo(points[i].x, groundY);
      }
    }
    ctx.closePath();
    ctx.fill();

    // 2. Draw shadow side (right slopes)
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.moveTo(points[points.length - 1].x, groundY);
    for (let i = points.length - 1; i >= 0; i--) {
      ctx.lineTo(points[i].x, points[i].y);
      if (i > 0 && points[i].y < points[i - 1].y) {
        const midX = (points[i].x + points[i - 1].x) / 2;
        ctx.lineTo(midX, groundY);
        ctx.lineTo(points[i].x, groundY);
      }
    }
    ctx.closePath();
    ctx.fill();

    // 3. Draw internal ridges/crags for detail
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let i = 1; i < points.length - 1; i++) {
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(
          points[i].x + (Math.random() - 0.5) * 20,
          points[i].y + 40 + Math.random() * 40,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
  };

  // LAYER 2: Far mountains
  const mtn2Points = [
    { x: -20, y: groundY * 0.75 },
    { x: w * 0.15, y: groundY * 0.52 },
    { x: w * 0.25, y: groundY * 0.62 },
    { x: w * 0.42, y: groundY * 0.45 },
    { x: w * 0.55, y: groundY * 0.58 },
    { x: w * 0.72, y: groundY * 0.48 },
    { x: w * 0.88, y: groundY * 0.65 },
    { w: w + 20, y: groundY * 0.78 },
  ];
  // Correct last point format
  (mtn2Points[mtn2Points.length - 1] as any).x = w + 20;

  drawJaggedMountain(mtn2Points as any, "#4a2848", "#5a3855", "#3a1838");

  // Snow on Layer 2 peaks (more natural "clinging" look)
  ctx.fillStyle = "rgba(255, 230, 245, 0.4)";
  const drawSnow = (px: number, py: number, width: number) => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - width, py + width * 1.5);
    // Jagged snow line
    for (let sx = px - width + 4; sx < px + width; sx += 6) {
      ctx.lineTo(sx, py + width * 1.2 + Math.sin(sx * 0.5) * 4);
    }
    ctx.lineTo(px + width, py + width * 1.5);
    ctx.closePath();
    ctx.fill();
  };
  drawSnow(w * 0.42, groundY * 0.45, 18);
  drawSnow(w * 0.72, groundY * 0.48, 15);

  // Mist layer
  const mistGradient = ctx.createLinearGradient(
    0,
    groundY * 0.55,
    0,
    groundY * 0.85,
  );
  mistGradient.addColorStop(0, "rgba(255, 180, 160, 0)");
  mistGradient.addColorStop(0.5, "rgba(255, 180, 160, 0.1)");
  mistGradient.addColorStop(1, "rgba(255, 160, 140, 0.05)");
  ctx.fillStyle = mistGradient;
  ctx.fillRect(0, groundY * 0.55, w, groundY * 0.3);

  // LAYER 3: Mid-ground mountains
  const mtn3Points = [
    { x: -50, y: groundY * 0.85 },
    { x: w * 0.1, y: groundY * 0.68 },
    { x: w * 0.22, y: groundY * 0.78 },
    { x: w * 0.38, y: groundY * 0.55 },
    { x: w * 0.52, y: groundY * 0.68 },
    { x: w * 0.65, y: groundY * 0.52 },
    { x: w * 0.82, y: groundY * 0.75 },
    { x: w + 50, y: groundY * 0.88 },
  ];
  drawJaggedMountain(mtn3Points, "#2d1538", "#3d2248", "#1d0a28");

  // Detailed snow on mid mountains
  ctx.fillStyle = "rgba(255, 240, 250, 0.7)";
  drawSnow(w * 0.38, groundY * 0.55, 25);
  drawSnow(w * 0.65, groundY * 0.52, 22);

  // LAYER 4: Foreground mountains
  const mtn4Points = [
    { x: -100, y: groundY },
    { x: w * 0.15, y: groundY * 0.78 },
    { x: w * 0.3, y: groundY * 0.88 },
    { x: w * 0.5, y: groundY * 0.72 },
    { x: w * 0.7, y: groundY * 0.85 },
    { x: w * 0.88, y: groundY * 0.78 },
    { x: w + 100, y: groundY * 0.95 },
  ];
  drawJaggedMountain(mtn4Points, "#120818", "#1a0d20", "#0a0410");

  // Detailed rock highlights on foreground ridge
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const rx = Math.random() * w;
    const ry = groundY * 0.8 + Math.random() * groundY * 0.2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + 5, ry - 3);
    ctx.stroke();
  }

  // Flying birds silhouettes with MOVEMENT
  ctx.strokeStyle = "rgba(10, 5, 15, 0.7)";
  ctx.lineWidth = 1.5;
  const birds = [
    { baseX: 0, y: groundY * 0.35, s: 6, speed: 0.05 },
    { baseX: w * 0.4, y: groundY * 0.28, s: 5, speed: 0.04 },
    { baseX: w * 0.6, y: groundY * 0.32, s: 4, speed: 0.06 },
    { baseX: w * 0.2, y: groundY * 0.25, s: 5, speed: 0.045 },
    { baseX: w * 0.8, y: groundY * 0.3, s: 6, speed: 0.055 },
  ];
  for (let i = 0; i < birds.length; i++) {
    const bird = birds[i];
    const bx = ((bird.baseX + gameTime * bird.speed) % (w + 40)) - 20;
    const by = bird.y + Math.sin(gameTime * 0.008 + i * 2) * 4;
    const wingFlap = Math.sin(gameTime * 0.02 + i * 1.8) * 3;

    ctx.beginPath();
    ctx.moveTo(bx - bird.s, by + wingFlap);
    ctx.quadraticCurveTo(bx - bird.s * 0.3, by - 2, bx, by);
    ctx.quadraticCurveTo(bx + bird.s * 0.3, by - 2, bx + bird.s, by + wingFlap);
    ctx.stroke();
  }

  // Ground - rustic outdoor court with warm sunset reflection
  const courtGradient = ctx.createLinearGradient(0, groundY, 0, h);
  courtGradient.addColorStop(0, "#6a4535");
  courtGradient.addColorStop(0.3, "#5a3a2a");
  courtGradient.addColorStop(0.7, "#4a2f20");
  courtGradient.addColorStop(1, "#3a2415");
  ctx.fillStyle = courtGradient;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Sunset reflection on the court
  const reflectionGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 30);
  reflectionGrad.addColorStop(0, "rgba(255, 180, 120, 0.25)");
  reflectionGrad.addColorStop(1, "rgba(255, 150, 100, 0)");
  ctx.fillStyle = reflectionGrad;
  ctx.fillRect(0, groundY, w, 30);

  // Wood planks with warm highlights
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Knots and grain
  ctx.fillStyle = "rgba(60, 35, 20, 0.3)";
  for (let i = 0; i < 8; i++) {
    const kx = (i * 47 + 15) % w;
    const ky = groundY + 8 + (i % 3) * 12;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 3 + (i % 2), 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floor edge highlight
  ctx.fillStyle = "rgba(255, 200, 150, 0.3)";
  ctx.fillRect(0, groundY, w, 3);
}

// ============= BEACH/PIER BACKGROUND =============
function drawBeachBackground(): void {
  // Bright tropical sky with subtle vertical gradient
  const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#0077aa"); // Deep tropical blue at top
  skyGradient.addColorStop(0.3, "#1fb1d9"); // Azure
  skyGradient.addColorStop(0.6, "#7dd3e8"); // Light cyan
  skyGradient.addColorStop(0.85, "#b8e8f5"); // Pale blue
  skyGradient.addColorStop(1, "#e0f6fc"); // Hazy horizon
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, w, groundY);

  // God rays / Solar rays from sun - radiating 360 degrees
  const sunX = w * 0.8;
  const sunY = groundY * 0.2;
  const sunRadius = 45;

  ctx.save();
  const rayCount = 12;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + gameTime * 0.0001; // Gentle rotation
    const rayGradient = ctx.createLinearGradient(
      sunX,
      sunY,
      sunX + Math.cos(angle) * 400,
      sunY + Math.sin(angle) * 400,
    );
    // Much lighter alphas
    rayGradient.addColorStop(0, "rgba(255, 255, 240, 0.08)");
    rayGradient.addColorStop(0.5, "rgba(255, 255, 220, 0.03)");
    rayGradient.addColorStop(1, "rgba(255, 255, 200, 0)");

    ctx.fillStyle = rayGradient;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    // Wider but softer rays
    const rayWidth = 0.15;
    ctx.lineTo(
      sunX + Math.cos(angle - rayWidth) * 600,
      sunY + Math.sin(angle - rayWidth) * 600,
    );
    ctx.lineTo(
      sunX + Math.cos(angle + rayWidth) * 600,
      sunY + Math.sin(angle + rayWidth) * 600,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Sun glow with multi-layered radial gradients
  const sunGlow = ctx.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 4,
  );
  sunGlow.addColorStop(0, "rgba(255, 255, 240, 0.7)");
  sunGlow.addColorStop(0.2, "rgba(255, 255, 200, 0.4)");
  sunGlow.addColorStop(0.5, "rgba(255, 255, 150, 0.1)");
  sunGlow.addColorStop(1, "rgba(255, 255, 120, 0)");
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius * 4, 0, Math.PI * 2);
  ctx.fill();

  // Sun core
  ctx.fillStyle = "#fffdf0";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Detailed tropical clouds with lighting
  const drawTropicalCloud = (
    cx: number,
    cy: number,
    scale: number,
    opacity: number,
  ) => {
    const s = scale;
    // Cloud body
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx + 15 * s, cy - 10 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(cx + 35 * s, cy - 5 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(cx + 55 * s, cy, 16 * s, 0, Math.PI * 2);
    ctx.fill();

    // Highlights from sun
    ctx.fillStyle = `rgba(255, 255, 240, ${opacity * 0.8})`;
    ctx.beginPath();
    ctx.arc(cx + 8 * s, cy - 8 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(cx + 30 * s, cy - 12 * s, 12 * s, 0, Math.PI * 2);
    ctx.fill();

    // Soft blue shading
    ctx.fillStyle = `rgba(180, 220, 240, ${opacity * 0.4})`;
    ctx.beginPath();
    ctx.arc(cx + 10 * s, cy + 8 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(cx + 40 * s, cy + 10 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
  };

  const cloudBaseData = [
    { baseX: 0, y: 35, s: 1.1, speed: 0.008 },
    { baseX: w * 0.3, y: 55, s: 1.3, speed: 0.006 },
    { baseX: w * 0.6, y: 25, s: 0.9, speed: 0.009 },
    { baseX: w * 0.85, y: 65, s: 1.0, speed: 0.007 },
  ];

  for (const cloud of cloudBaseData) {
    const cx = ((cloud.baseX + gameTime * cloud.speed) % (w + 150)) - 75;
    drawTropicalCloud(cx, cloud.y, cloud.s, 0.9);
  }

  // Ocean water with depth and specular highlights
  const oceanY = groundY * 0.65;
  const oceanGradient = ctx.createLinearGradient(0, oceanY, 0, groundY);
  oceanGradient.addColorStop(0, "#005588"); // Dark blue depth
  oceanGradient.addColorStop(0.4, "#0077aa"); // Mid depth
  oceanGradient.addColorStop(0.8, "#20a0cc"); // Surface blue
  oceanGradient.addColorStop(1, "#40b8dd"); // Shallow shore
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, oceanY, w, groundY - oceanY);

  // Animated ocean waves with foam
  for (let i = 0; i < 5; i++) {
    const waveY = oceanY + 15 + i * 25;
    const waveOffset = gameTime * 0.03 + i * 50;

    // Wave foam
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + i * 0.03})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 6) {
      const y = waveY + Math.sin((x + waveOffset) * 0.045) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Specular highlights on wave crests
    ctx.fillStyle = "rgba(255, 255, 240, 0.2)";
    for (let x = 0; x < w; x += 40) {
      const sx = (x + waveOffset * 0.8) % w;
      const sy = waveY + Math.sin((sx + waveOffset) * 0.045) * 4 - 2;
      ctx.fillRect(sx, sy, 10, 1);
    }
  }

  // Detailed sailboats with hulls and sails
  const drawSailboat = (x: number, y: number, scale: number, speed: number) => {
    const bx = ((x + gameTime * speed) % (w + 100)) - 50;
    const s = scale;
    const bob = Math.sin(gameTime * 0.002 + x) * 2;

    // Hull
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(bx - 12 * s, y + bob);
    ctx.lineTo(bx + 12 * s, y + bob);
    ctx.lineTo(bx + 8 * s, y + 5 * s + bob);
    ctx.lineTo(bx - 8 * s, y + 5 * s + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mast
    ctx.fillStyle = "#8b4513";
    ctx.fillRect(bx - 1, y - 18 * s + bob, 2, 18 * s);

    // Main sail
    ctx.fillStyle = "#fffdf0";
    ctx.beginPath();
    ctx.moveTo(bx, y - 16 * s + bob);
    ctx.lineTo(bx + 10 * s, y - 2 * s + bob);
    ctx.lineTo(bx, y - 2 * s + bob);
    ctx.closePath();
    ctx.fill();

    // Jib sail
    ctx.beginPath();
    ctx.moveTo(bx - 1, y - 14 * s + bob);
    ctx.lineTo(bx - 7 * s, y - 3 * s + bob);
    ctx.lineTo(bx - 1, y - 3 * s + bob);
    ctx.closePath();
    ctx.fill();
  };

  drawSailboat(w * 0.2, oceanY + 25, 1.0, 0.015);
  drawSailboat(w * 0.6, oceanY + 45, 0.8, 0.012);
  drawSailboat(w * 0.45, oceanY + 15, 0.6, 0.008);

  // Beach sand with texture
  ctx.fillStyle = "#e8d8a0";
  ctx.beginPath();
  ctx.moveTo(0, oceanY + 20);
  ctx.lineTo(0, groundY);
  ctx.lineTo(w * 0.12, groundY);
  ctx.lineTo(w * 0.04, oceanY + 30);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, oceanY + 25);
  ctx.lineTo(w, groundY);
  ctx.lineTo(w * 0.88, groundY);
  ctx.lineTo(w * 0.96, oceanY + 35);
  ctx.closePath();
  ctx.fill();

  // Sand texture dots
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  for (let i = 0; i < 20; i++) {
    const sx = (i * 23) % (w * 0.12);
    const sy = groundY - 5 - (i % 8) * 4;
    ctx.fillRect(sx, sy, 2, 2);
    const dx = w - ((i * 19) % (w * 0.12));
    ctx.fillRect(dx, sy, 2, 2);
  }

  // Multiple palm trees with variety
  const drawPalmTree = (px: number, py: number, h: number, rot: number) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);

    // Trunk with segmented texture
    ctx.fillStyle = "#6b4423";
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(-2, -h * 0.5, -3, -h);
    ctx.lineTo(3, -h);
    ctx.quadraticCurveTo(2, -h * 0.5, 5, 0);
    ctx.closePath();
    ctx.fill();

    // Trunk segments
    ctx.strokeStyle = "#4a3015";
    ctx.lineWidth = 1;
    for (let ty = -10; ty > -h + 10; ty -= 8) {
      ctx.beginPath();
      ctx.arc(0, ty, 4, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }

    // Palm fronds
    ctx.fillStyle = "#228833";
    const frondCount = 7;
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2 + gameTime * 0.0002;
      const flen = 35 + Math.sin(i * 1.5) * 10;
      ctx.save();
      ctx.translate(0, -h);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(flen * 0.5, -12, flen, 8);
      ctx.quadraticCurveTo(flen * 0.5, -4, 0, 0);
      ctx.fill();
      // Highlight on frond
      ctx.fillStyle = "#32a852";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(flen * 0.4, -8, flen * 0.8, 2);
      ctx.quadraticCurveTo(flen * 0.4, -2, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  drawPalmTree(w * 0.06, groundY, 85, -0.05);
  drawPalmTree(w * 0.03, groundY + 10, 70, -0.12);
  drawPalmTree(w * 0.94, groundY, 90, 0.08);
  drawPalmTree(w * 0.97, groundY + 15, 65, 0.15);

  // PIER STRUCTURE with detail
  const pierGradient = ctx.createLinearGradient(0, groundY, 0, h);
  pierGradient.addColorStop(0, "#8a6a4a"); // Warm wood top
  pierGradient.addColorStop(0.5, "#705838"); // Mid
  pierGradient.addColorStop(1, "#504028"); // Shadowed bottom
  ctx.fillStyle = pierGradient;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Pier planks with depth
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, h);
    ctx.stroke();
    // Highlight on plank edge
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(x + 2, groundY);
    ctx.lineTo(x + 2, h);
    ctx.stroke();
  }

  // SHOPS ON THE PIER (Background buildings)
  const drawPierShop = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    color: string,
    name: string,
  ) => {
    // Parallax based on ball position
    const px = sx - ball.x * 0.05;
    const py = sy - sh;

    // Building body
    ctx.fillStyle = color;
    ctx.fillRect(px, py, sw, sh);

    // Roof (striped awning)
    const stripeW = sw / 6;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#ff4040";
      ctx.fillRect(px + i * stripeW, py - 12, stripeW, 14);
    }

    // Window/Door
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(px + sw * 0.2, py + sh * 0.3, sw * 0.6, sh * 0.5);

    // Sign board
    ctx.fillStyle = "#fff5e6";
    ctx.strokeStyle = "#4a2500";
    ctx.lineWidth = 2;
    ctx.fillRect(px + 5, py + 5, sw - 10, 15);
    ctx.strokeRect(px + 5, py + 5, sw - 10, 15);

    // Name text (simplified pixel art look)
    ctx.fillStyle = "#4a2500";
    ctx.font = "bold 6px 'Press Start 2P'";
    ctx.fillText(name, px + sw * 0.5 - name.length * 3, py + 16);

    // Shadow on pier
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(px, sy, sw, 8);
  };

  drawPierShop(w * 0.15, groundY, 60, 50, "#f5e6d3", "SURF");
  drawPierShop(w * 0.45, groundY, 70, 60, "#d3f5e6", "TACO");
  drawPierShop(w * 0.75, groundY, 65, 55, "#e6d3f5", "ICE");

  // Pier railings
  ctx.fillStyle = "#4a2500";
  for (let x = 0; x < w; x += 40) {
    const rx = x - ball.x * 0.02;
    // Post
    ctx.fillRect(rx, groundY - 20, 4, 20);
    // Top rail
    ctx.fillRect(rx - 20, groundY - 20, 40, 3);
    // Mid rail
    ctx.fillRect(rx - 20, groundY - 12, 40, 2);
  }

  // Seagulls with flapping animation
  const seagulls = [
    { baseX: w * 0.3, y: 80, speed: 0.04 },
    { baseX: w * 0.5, y: 65, speed: 0.05 },
    { baseX: w * 0.8, y: 100, speed: 0.035 },
    { baseX: w * 0.1, y: 90, speed: 0.045 },
  ];
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < seagulls.length; i++) {
    const gull = seagulls[i];
    const gx = ((gull.baseX + gameTime * gull.speed) % (w + 60)) - 30;
    const gy = gull.y + Math.sin(gameTime * 0.012 + i) * 6;
    const wing = Math.sin(gameTime * 0.025 + i * 1.5) * 5;

    ctx.beginPath();
    ctx.moveTo(gx - 8, gy + wing);
    ctx.quadraticCurveTo(gx - 4, gy - 2, gx, gy);
    ctx.quadraticCurveTo(gx + 4, gy - 2, gx + 8, gy + wing);
    ctx.stroke();
  }

  // Floor edge highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.fillRect(0, groundY, w, 3);
}

function drawBall(): void {
  const bx = ball.x;
  const by = ball.y;
  const r = CONFIG.BALL_RADIUS;

  // Draw ground shadow first (not rotated with ball)
  const shadowDistance = groundY - by;
  const shadowScale = Math.max(0.5, 1 - shadowDistance / 800); // Shadow shrinks slightly as ball goes higher
  const shadowAlpha = Math.max(0.25, 0.5 - shadowDistance / 1000); // Shadow stays visible
  ctx.fillStyle = "rgba(0, 0, 0, " + shadowAlpha + ")";
  ctx.beginPath();
  ctx.ellipse(
    bx,
    groundY - 2,
    r * shadowScale * 1.2,
    r * 0.3 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Now draw the ball with rotation
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ball.rotation);

  // Main ball body
  const ballGradient = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  ballGradient.addColorStop(0, "#ff9955");
  ballGradient.addColorStop(0.5, "#ff7722");
  ballGradient.addColorStop(1, "#cc5500");
  ctx.fillStyle = ballGradient;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Ball border
  ctx.strokeStyle = "#8b4513";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Basketball lines
  ctx.strokeStyle = "rgba(70, 30, 0, 0.85)";
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.lineCap = "round";

  // We want the lines to clip neatly to the circle border
  // The easiest way is to use clip()
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.clip();

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();

  // Left curve (standard basketball C shape)
  ctx.beginPath();
  ctx.arc(-r * 0.8, 0, r * 0.8, -Math.PI / 2.3, Math.PI / 2.3);
  ctx.stroke();

  // Right curve
  ctx.beginPath();
  ctx.arc(
    r * 0.8,
    0,
    r * 0.8,
    Math.PI - Math.PI / 2.3,
    Math.PI + Math.PI / 2.3,
  );
  ctx.stroke();

  ctx.restore();

  // Highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.ellipse(
    -r * 0.3,
    -r * 0.3,
    r * 0.25,
    r * 0.15,
    -Math.PI / 4,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.restore();

  // Fire effects when ball is on fire!
  if (ballOnFire) {
    ctx.save();

    // Outer fire glow
    const fireGlow = ctx.createRadialGradient(bx, by, r, bx, by, r * 2.5);
    fireGlow.addColorStop(0, "rgba(255, 100, 0, 0.4)");
    fireGlow.addColorStop(0.5, "rgba(255, 50, 0, 0.2)");
    fireGlow.addColorStop(1, "rgba(255, 0, 0, 0)");
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(bx, by, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Animated flame tongues around the ball
    const flameCount = 6;
    for (let i = 0; i < flameCount; i++) {
      const angle = (i / flameCount) * Math.PI * 2 + gameTime * 0.01;
      const flameLength = r * (0.8 + Math.sin(gameTime * 0.03 + i * 2) * 0.4);
      const fx = bx + Math.cos(angle) * (r + 2);
      const fy = by + Math.sin(angle) * (r + 2);
      const tipX = bx + Math.cos(angle) * (r + flameLength);
      const tipY = by + Math.sin(angle) * (r + flameLength) - flameLength * 0.3; // Flames rise

      const flameGradient = ctx.createLinearGradient(fx, fy, tipX, tipY);
      flameGradient.addColorStop(0, "rgba(255, 200, 0, 0.9)");
      flameGradient.addColorStop(0.5, "rgba(255, 100, 0, 0.7)");
      flameGradient.addColorStop(1, "rgba(255, 0, 0, 0)");

      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(fx - 4, fy);
      ctx.quadraticCurveTo(tipX, tipY, fx + 4, fy);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawHoop(): void {
  const hx = hoop.x;
  const hy = hoop.y;
  const hoopW = CONFIG.HOOP_WIDTH;
  const rimR = CONFIG.RIM_RADIUS;

  // Determine which side the hoop is on for drawing order
  const isLeft = hoop.side === "left";

  // Backboard - extends more upward than downward
  const backboardX = isLeft
    ? hx - hoopW / 2 - CONFIG.BACKBOARD_WIDTH
    : hx + hoopW / 2;
  const backboardTopOffset = CONFIG.BACKBOARD_HEIGHT * 0.7; // 70% above rim, 30% below
  const backboardY = hy - backboardTopOffset;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    backboardX,
    backboardY,
    CONFIG.BACKBOARD_WIDTH,
    CONFIG.BACKBOARD_HEIGHT,
  );

  // Backboard border
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 3;
  ctx.strokeRect(
    backboardX,
    backboardY,
    CONFIG.BACKBOARD_WIDTH,
    CONFIG.BACKBOARD_HEIGHT,
  );

  // Backboard square target
  ctx.strokeStyle = "#ff4444";
  ctx.lineWidth = 2;
  const targetSize = 20;
  const targetX = isLeft
    ? backboardX + CONFIG.BACKBOARD_WIDTH / 2 - targetSize / 2
    : backboardX + CONFIG.BACKBOARD_WIDTH / 2 - targetSize / 2;
  ctx.strokeRect(targetX, hy - targetSize / 2, targetSize, targetSize);

  // Rim bracket
  ctx.fillStyle = "#666666";
  const bracketX = isLeft ? hx - hoopW / 2 : hx + hoopW / 2 - 8;
  ctx.fillRect(bracketX, hy - 4, 8, 8);

  // Draw net (behind rim on scoring side)
  drawNet(hx, hy, hoopW);

  // Rim (orange)
  ctx.strokeStyle = "#ff6600";
  ctx.lineWidth = 6;

  // Left rim circle
  ctx.fillStyle = "#ff6600";
  ctx.beginPath();
  ctx.arc(hx - hoopW / 2 + rimR, hy, rimR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cc4400";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Right rim circle
  ctx.fillStyle = "#ff6600";
  ctx.beginPath();
  ctx.arc(hx + hoopW / 2 - rimR, hy, rimR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rim bar connecting circles
  ctx.strokeStyle = "#ff6600";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(hx - hoopW / 2 + rimR, hy - rimR);
  ctx.lineTo(hx + hoopW / 2 - rimR, hy - rimR);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(hx - hoopW / 2 + rimR, hy + rimR);
  ctx.lineTo(hx + hoopW / 2 - rimR, hy + rimR);
  ctx.stroke();
}

function drawNet(hx: number, hy: number, hoopW: number): void {
  const netHeight = 35;
  const segments = CONFIG.NET_SEGMENTS;
  const topY = hy + CONFIG.RIM_RADIUS;
  const bottomWidth = hoopW * 0.5;

  // Wave intensity based on current netWave value
  const waveIntensity = Math.min(Math.abs(hoop.netWave) * 0.8 + 1, 20);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;

  // Vertical strings
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const topX = hx - hoopW / 2 + hoopW * t;
    const bottomX = hx - bottomWidth / 2 + bottomWidth * t;

    // Add wave animation - more intense
    const wave = Math.sin(hoop.netWave * 0.5 + i * 0.8) * waveIntensity;

    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      (topX + bottomX) / 2 + wave,
      topY + netHeight * 0.6,
      bottomX + wave,
      topY + netHeight,
    );
    ctx.stroke();
  }

  // Horizontal rings
  for (let j = 1; j <= 3; j++) {
    const ringY = topY + (netHeight / 4) * j;
    const ringProgress = j / 4;
    const ringWidth = hoopW * (1 - ringProgress * 0.5);

    const ringWave =
      Math.sin(hoop.netWave * 0.5 + j * 1.2) * waveIntensity * 0.8;
    ctx.beginPath();
    ctx.moveTo(
      hx - ringWidth / 2 + ringWave,
      ringY + Math.sin(hoop.netWave + j) * waveIntensity * 0.5,
    );
    ctx.lineTo(
      hx + ringWidth / 2 + ringWave,
      ringY + Math.sin(hoop.netWave + j + 1) * waveIntensity * 0.5,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawParticle(p: Particle): void {
  const alpha = p.life / p.maxLife;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  if (p.type === "star") {
    ctx.fillStyle = p.color;
    const starSize = p.size * alpha;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const innerAngle = angle + Math.PI / 5;
      ctx.lineTo(Math.cos(angle) * starSize, Math.sin(angle) * starSize);
      ctx.lineTo(
        Math.cos(innerAngle) * starSize * 0.4,
        Math.sin(innerAngle) * starSize * 0.4,
      );
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.type === "confetti") {
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  } else {
    const size = p.size * alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(): void {
  for (const p of particles) {
    drawParticle(p);
  }
}

function drawScorePopups(): void {
  for (const popup of scorePopups) {
    const progress = 1 - popup.life / popup.maxLife;
    const alpha = 1 - easeOutQuad(progress);
    const y = popup.y - progress * 40;
    const scale =
      popup.scale * (1 + easeOutBack(Math.min(progress * 2, 1)) * 0.2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(popup.x, y);
    ctx.scale(scale, scale);

    ctx.font = "bold 16px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Outline
    ctx.fillStyle = "#000000";
    ctx.fillText(popup.value, 2, 2);

    // Main text
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.value, 0, 0);

    ctx.restore();
  }
}

function drawFlashEffect(): void {
  if (screenFlash > 0) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = screenFlash * 0.4;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

function drawSlowMoEffect(): void {
  const slowMoScale = getSlowMoScale();
  if (slowMoScale >= 1) return;

  // Calculate intensity based on how slow we are (0 = normal, 1 = max slow)
  const intensity = 1 - slowMoScale;

  // Heavy vignette effect - very dark edges
  const gradient = ctx.createRadialGradient(
    w / 2,
    h / 2,
    h * 0.15,
    w / 2,
    h / 2,
    h * 0.7,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.4, "rgba(0, 0, 0, " + intensity * 0.4 + ")");
  gradient.addColorStop(0.7, "rgba(0, 0, 0, " + intensity * 0.6 + ")");
  gradient.addColorStop(1, "rgba(0, 0, 0, " + intensity * 0.8 + ")");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Strong red/orange urgency tint
  ctx.fillStyle = "rgba(255, 30, 0, " + intensity * 0.12 + ")";
  ctx.fillRect(0, 0, w, h);

  // Pulsing red border effect
  const pulse = 0.5 + Math.sin(gameTime * 0.015) * 0.5;
  ctx.strokeStyle = "rgba(255, 0, 0, " + intensity * pulse * 0.5 + ")";
  ctx.lineWidth = 6 + intensity * 10;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  // Pulsing "FINAL SECONDS" text
  if (intensity > 0.2) {
    const textPulse = 0.6 + Math.sin(gameTime * 0.012) * 0.4;
    const textScale = 1 + intensity * 0.2;
    ctx.save();
    ctx.globalAlpha = intensity * textPulse;
    ctx.translate(w / 2, 45);
    ctx.scale(textScale, textScale);
    ctx.font = "bold 14px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Text shadow
    ctx.fillStyle = "#000000";
    ctx.fillText("FINAL SECONDS!", 2, 2);
    // Main text
    ctx.fillStyle = "#ff2222";
    ctx.fillText("FINAL SECONDS!", 0, 0);
    ctx.restore();
  }
}

let lastHUDScore = -1;
let lastHUDTime = -1;

function updateHUD(): void {
  // Update score with pop animation
  if (score !== lastHUDScore) {
    scoreDisplay.textContent = formatScore(score);
    if (lastHUDScore !== -1) {
      scoreBadge.classList.add("pop");
      setTimeout(() => scoreBadge.classList.remove("pop"), 120);
    }
    lastHUDScore = score;
  }

  // Update timer
  const displayTime = Math.ceil(timeRemaining);
  if (displayTime !== lastHUDTime) {
    timerDisplay.textContent = displayTime.toString();
    lastHUDTime = displayTime;

    // Warning state
    if (displayTime <= CONFIG.WARNING_TIME && displayTime > 0) {
      timerBadge.classList.add("warning");
    } else {
      timerBadge.classList.remove("warning");
    }
  }
}

function showTimerBonus(amount: number, isClutch: boolean): void {
  timerBonusPopup.textContent = "+" + amount.toFixed(1);
  timerBonusPopup.style.color = isClutch ? "#00A1E4" : "#00ffaa";
  timerBonusPopup.classList.remove("animate");

  // Also pop the timer badge itself
  timerBadge.classList.remove("pop");

  // Force reflow
  void timerBonusPopup.offsetWidth;

  timerBonusPopup.classList.add("animate");
  timerBadge.classList.add("pop");
  setTimeout(() => timerBadge.classList.remove("pop"), 150);
}

// ============= PARTICLE SPAWNERS =============
function pushParticle(particle: Particle): void {
  if (particles.length >= CONFIG.MAX_PARTICLES) {
    particles.splice(0, particles.length - CONFIG.MAX_PARTICLES + 1);
  }
  particles.push(particle);
}

function spawnScorePopup(
  x: number,
  y: number,
  value: string,
  color: string,
  scale: number = 1,
): void {
  // Clamp position to keep popup on screen
  const padding = 60;
  const clampedX = Math.max(padding, Math.min(w - padding, x));
  const clampedY = Math.max(padding, Math.min(groundY - padding, y));

  scorePopups.push({
    x: clampedX,
    y: clampedY,
    value,
    life: CONFIG.POPUP_DURATION,
    maxLife: CONFIG.POPUP_DURATION,
    color,
    scale,
  });
}

function spawnBoostParticles(x: number, y: number): void {
  const colors = ["#ff9955", "#ffcc88", "#ffffff"];

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const speed = 2 + Math.random() * 2;

    pushParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 2,
      life: 300 + Math.random() * 100,
      maxLife: 400,
      size: 4 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: "burst",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
}

function spawnScoreParticles(
  x: number,
  y: number,
  shotType: ShotType,
  combo: number,
): void {
  const theme = getComboTheme(combo);
  const shotColors =
    shotType === "swish"
      ? ["#ffffff", "#90ff90", "#ffd700"]
      : shotType === "bank"
        ? ["#88ccff", "#ffcc00", "#ffffff"]
        : ["#ffaa00", "#ff7070", "#ffffff"];
  const colors = [...shotColors, ...theme.particleColors];
  const band = getComboBand(combo);
  const count = Math.min(
    28,
    CONFIG.PARTICLE_COUNT +
      band * 3 +
      (shotType === "swish" ? 4 : shotType === "bank" ? 2 : 0),
  );

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 4 + Math.random() * (4 + band);
    const isstar = Math.random() > Math.max(0.18, 0.55 - band * 0.08);

    pushParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: CONFIG.PARTICLE_LIFE + Math.random() * 200,
      maxLife: CONFIG.PARTICLE_LIFE + Math.random() * 200,
      size: isstar ? 8 + Math.random() * 5 : 5 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: isstar ? "star" : "burst",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.25,
    });
  }
}

function spawnComboParticles(x: number, y: number, level: number): void {
  const theme = getComboTheme(level);
  const band = getComboBand(level);
  const colorTier = getComboColorTier(level);
  const count = Math.min(56, 14 + Math.min(level, 20) + band * 3 + colorTier);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * (5 + band + colorTier * 0.18);
    const particleType =
      colorTier >= 7 && Math.random() > 0.38
        ? "star"
        : colorTier >= 2 && Math.random() > 0.32
          ? "confetti"
          : "burst";

    pushParticle({
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      life: 800 + Math.random() * 400,
      maxLife: 1000,
      size: 6 + Math.random() * (4 + colorTier * 0.12),
      color:
        theme.particleColors[
          Math.floor(Math.random() * theme.particleColors.length)
        ],
      type: particleType,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
    });
  }
}

// ============= GAME LOGIC =============
function updateBall(dt: number): void {
  // Normalize to ~60fps baseline for slow-mo effect
  const timeScale = dt / 16.67;

  // Apply gravity (scaled by time)
  ball.vy += CONFIG.GRAVITY * timeScale;

  // Air resistance (scaled by time - use lerp toward 1 for proper scaling)
  const airResistPower = Math.pow(CONFIG.AIR_RESISTANCE, timeScale);
  ball.vx *= airResistPower;
  ball.vy *= airResistPower;

  // Update position (scaled by time)
  ball.x += ball.vx * timeScale;
  ball.y += ball.vy * timeScale;

  // Rotation based on horizontal velocity (scaled by time)
  ball.rotation += ball.vx * 0.05 * timeScale;

  // Wall collision - portal on the hoop's side wall (entire height)
  // The wall behind the hoop is always a portal, no bouncing
  const isInHoopYRange = true; // Entire wall on hoop's side is a portal

  // Left wall
  if (ball.x - CONFIG.BALL_RADIUS < 0) {
    if (hoop.side === "left" && isInHoopYRange) {
      // Portal: teleport to right side, keep velocity
      ball.x = w - CONFIG.BALL_RADIUS - 5;
      console.log("[updateBall] Ball portaled from left wall to right");
    } else {
      // Normal bounce
      ball.x = CONFIG.BALL_RADIUS;
      ball.vx = -ball.vx * CONFIG.WALL_BOUNCE;
      playBounceSound();
      triggerHaptic("light");
    }
  }

  // Right wall
  if (ball.x + CONFIG.BALL_RADIUS > w) {
    if (hoop.side === "right" && isInHoopYRange) {
      // Portal: teleport to left side, keep velocity
      ball.x = CONFIG.BALL_RADIUS + 5;
      console.log("[updateBall] Ball portaled from right wall to left");
    } else {
      // Normal bounce
      ball.x = w - CONFIG.BALL_RADIUS;
      ball.vx = -ball.vx * CONFIG.WALL_BOUNCE;
      playBounceSound();
      triggerHaptic("light");
    }
  }

  // Ground bounce and jump reset (normal behavior everywhere)
  if (ball.y + CONFIG.BALL_RADIUS >= groundY) {
    ball.y = groundY - CONFIG.BALL_RADIUS;
    ball.vy = -ball.vy * CONFIG.GROUND_BOUNCE;

    ball.lastGroundTime = gameTime;

    if (Math.abs(ball.vy) > 1) {
      playBounceSound();
      triggerHaptic("light");
    }

    // Stop small bounces
    if (Math.abs(ball.vy) < 2) {
      ball.vy = 0;
    }
  }

  // No ceiling collision - ball can go above screen

  // Check hoop collision
  checkHoopCollision();

  // Spawn fire particles when ball is on fire
  if (ballOnFire) {
    fireParticleSpawnCarry += dt;
    if (fireParticleSpawnCarry < CONFIG.FIRE_EMIT_INTERVAL) {
      return;
    }
    fireParticleSpawnCarry = 0;

    const comboTheme = getComboTheme(comboCount);
    const comboBand = getComboBand(comboCount);
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const spawnCount = Math.min(
      4,
      Math.floor(speed * 0.22) + 1 + Math.floor(comboBand / 2),
    );

    for (let i = 0; i < spawnCount; i++) {
      fireParticles.push({
        x: ball.x + (Math.random() - 0.5) * CONFIG.BALL_RADIUS,
        y: ball.y + (Math.random() - 0.5) * CONFIG.BALL_RADIUS,
        vx: -ball.vx * 0.2 + (Math.random() - 0.5) * 2,
        vy: -ball.vy * 0.2 - Math.random() * 3, // Fire rises
        life: 300 + Math.random() * 200,
        size: 4 + Math.random() * (8 + comboBand * 1.5),
        color:
          comboTheme.particleColors[
            Math.floor(Math.random() * comboTheme.particleColors.length)
          ],
      });
    }

    // Limit fire particles
    if (fireParticles.length > CONFIG.MAX_FIRE_PARTICLES) {
      fireParticles = fireParticles.slice(-CONFIG.MAX_FIRE_PARTICLES);
    }
  } else {
    fireParticleSpawnCarry = 0;
  }
}

function updateFireParticles(dt: number): void {
  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.1; // Fire rises
    p.life -= dt;
    p.size *= 0.97; // Shrink

    if (p.life <= 0 || p.size < 1) {
      fireParticles.splice(i, 1);
    }
  }
}

function drawFireParticles(): void {
  for (const p of fireParticles) {
    const alpha = Math.min(1, p.life / 200);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function boost(): void {
  if (gameState !== "PLAYING") return;

  // Reset shot tracking - each boost is a new shot attempt
  resetShotTracking();

  // Upward boost - unlimited taps allowed
  ball.vy = -CONFIG.BOOST_FORCE;

  // Always push ball toward the hoop
  const hoopDirection = hoop.side === "left" ? -1 : 1;
  const assistBias = getCurrentBoostAssist();

  // If ball is moving away from hoop, redirect it toward the hoop
  const movingAwayFromHoop =
    (hoopDirection === -1 && ball.vx > 0) ||
    (hoopDirection === 1 && ball.vx < 0);

  if (movingAwayFromHoop) {
    // Reverse and add bias toward hoop
    ball.vx =
      hoopDirection * Math.abs(ball.vx) * 0.5 + hoopDirection * assistBias;
  } else {
    // Already moving toward hoop, just add more bias
    ball.vx += hoopDirection * assistBias;
  }

  // Clamp horizontal velocity
  ball.vx = Math.max(-8, Math.min(8, ball.vx));

  // Effects
  spawnBoostParticles(ball.x, ball.y);
  addScreenShake(CONFIG.SHAKE_BOOST);
  playBoostSound();
  triggerHaptic("light");

  console.log("[boost] Boost used");
}

// Track if ball has entered the scoring zone from above
let ballEnteredFromAbove = false;
let ballWasAboveRim = false;

function checkHoopCollision(): void {
  // Get rim circle positions
  const leftRimX = hoop.x - CONFIG.HOOP_WIDTH / 2 + CONFIG.RIM_RADIUS;
  const rightRimX = hoop.x + CONFIG.HOOP_WIDTH / 2 - CONFIG.RIM_RADIUS;
  const rimY = hoop.y;
  const rimRadius = CONFIG.RIM_RADIUS;

  // Check collision with left rim
  const leftRimCollision = checkCircleCollision(
    ball.x,
    ball.y,
    CONFIG.BALL_RADIUS,
    leftRimX,
    rimY,
    rimRadius,
  );

  if (leftRimCollision.colliding) {
    resolveRimBounce(leftRimX, rimY, leftRimCollision);
  }

  // Check collision with right rim
  const rightRimCollision = checkCircleCollision(
    ball.x,
    ball.y,
    CONFIG.BALL_RADIUS,
    rightRimX,
    rimY,
    rimRadius,
  );

  if (rightRimCollision.colliding) {
    resolveRimBounce(rightRimX, rimY, rightRimCollision);
  }

  // Check collision with backboard
  checkBackboardCollision();

  // Check for scoring (ball passing through the net)
  checkScoring();

  // Check net collision for physics effect
  checkNetCollision();
}

interface CollisionResult {
  colliding: boolean;
  overlap: number;
  normalX: number;
  normalY: number;
}

function checkCircleCollision(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): CollisionResult {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = r1 + r2;

  if (distance < minDist && distance > 0) {
    return {
      colliding: true,
      overlap: minDist - distance,
      normalX: dx / distance,
      normalY: dy / distance,
    };
  }

  return {
    colliding: false,
    overlap: 0,
    normalX: 0,
    normalY: 0,
  };
}

function resolveRimBounce(
  rimX: number,
  rimY: number,
  collision: CollisionResult,
): void {
  // Separate the ball from the rim with extra padding to prevent getting stuck
  const separationPadding = 2;
  ball.x += collision.normalX * (collision.overlap + separationPadding);
  ball.y += collision.normalY * (collision.overlap + separationPadding);

  // Calculate reflection velocity
  const dotProduct = ball.vx * collision.normalX + ball.vy * collision.normalY;

  // Only bounce if moving toward the rim
  if (dotProduct < 0) {
    const bounceFactor = 0.8; // Keep more energy to push ball away
    ball.vx -= 2 * dotProduct * collision.normalX * bounceFactor;
    ball.vy -= 2 * dotProduct * collision.normalY * bounceFactor;

    // Ensure minimum bounce velocity to prevent getting stuck
    const minBounceSpeed = 3;
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed < minBounceSpeed) {
      const scale = minBounceSpeed / Math.max(speed, 0.1);
      ball.vx *= scale;
      ball.vy *= scale;
    }

    // Effects
    playRimHitSound();
    triggerHaptic("medium");
    addScreenShake(3);
    spawnRimParticles(rimX, rimY);

    // Reset scoring state since we hit the rim
    ballEnteredFromAbove = false;
    hitRim = true;
    rimHitTime = gameTime;

    console.log("[resolveRimBounce] Ball bounced off rim at time " + gameTime);
  }
}

function checkBackboardCollision(): void {
  const isLeft = hoop.side === "left";
  const backboardX = isLeft
    ? hoop.x - CONFIG.HOOP_WIDTH / 2 - CONFIG.BACKBOARD_WIDTH
    : hoop.x + CONFIG.HOOP_WIDTH / 2;

  // Match the visual offset: 70% above rim, 30% below
  const backboardTopOffset = CONFIG.BACKBOARD_HEIGHT * 0.7;
  const backboardTop = hoop.y - backboardTopOffset;
  const backboardBottom =
    hoop.y + (CONFIG.BACKBOARD_HEIGHT - backboardTopOffset);

  // Check if ball is hitting the backboard
  if (isLeft) {
    // Left side backboard - check right edge
    const backboardRight = backboardX + CONFIG.BACKBOARD_WIDTH;
    if (
      ball.x - CONFIG.BALL_RADIUS < backboardRight &&
      ball.x + CONFIG.BALL_RADIUS > backboardX &&
      ball.y > backboardTop &&
      ball.y < backboardBottom &&
      ball.vx < 0
    ) {
      ball.x = backboardRight + CONFIG.BALL_RADIUS;
      ball.vx = -ball.vx * 0.75;
      // Slightly reduce vertical velocity for more realistic bounce
      ball.vy *= 0.9;
      playBackboardSound();
      triggerHaptic("medium");
      addScreenShake(4);
      spawnBackboardParticles(backboardRight, ball.y);
      hitBackboard = true;
      backboardHitTime = gameTime;
      console.log(
        "[checkBackboardCollision] Bank shot off left backboard at time " +
          gameTime,
      );
    }
  } else {
    // Right side backboard - check left edge
    if (
      ball.x + CONFIG.BALL_RADIUS > backboardX &&
      ball.x - CONFIG.BALL_RADIUS < backboardX + CONFIG.BACKBOARD_WIDTH &&
      ball.y > backboardTop &&
      ball.y < backboardBottom &&
      ball.vx > 0
    ) {
      ball.x = backboardX - CONFIG.BALL_RADIUS;
      ball.vx = -ball.vx * 0.75;
      // Slightly reduce vertical velocity for more realistic bounce
      ball.vy *= 0.9;
      playBackboardSound();
      triggerHaptic("medium");
      addScreenShake(4);
      spawnBackboardParticles(backboardX, ball.y);
      hitBackboard = true;
      backboardHitTime = gameTime;
      console.log(
        "[checkBackboardCollision] Bank shot off right backboard at time " +
          gameTime,
      );
    }
  }
}

function spawnBackboardParticles(x: number, y: number): void {
  const colors = ["#ffffff", "#dddddd", "#ff4444"];

  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;

    pushParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400,
      maxLife: 400,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: "burst",
      rotation: 0,
      rotationSpeed: 0,
    });
  }
}

function playBackboardSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Solid thud sound for backboard
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(150, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    80,
    audioContext.currentTime + 0.1,
  );

  gain.gain.setValueAtTime(0.4, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

// Track if ball is currently in net for continuous collision
let ballInNet = false;

function checkNetCollision(): void {
  const hoopLeft = hoop.x - CONFIG.HOOP_WIDTH / 2;
  const hoopRight = hoop.x + CONFIG.HOOP_WIDTH / 2;
  const netTop = hoop.y + CONFIG.RIM_RADIUS;
  const netBottom = netTop + 35; // Net height
  const netNarrowBottom = CONFIG.HOOP_WIDTH * 0.5; // Net narrows at bottom

  // Calculate net width at ball's Y position (net narrows as it goes down)
  const netProgress = Math.max(
    0,
    Math.min(1, (ball.y - netTop) / (netBottom - netTop)),
  );
  const netWidthAtBall = CONFIG.HOOP_WIDTH * (1 - netProgress * 0.5);
  const netLeftAtBall = hoop.x - netWidthAtBall / 2;
  const netRightAtBall = hoop.x + netWidthAtBall / 2;

  // Check if ball is inside net area
  const isInNetY = ball.y > netTop && ball.y < netBottom;
  const isInNetX = ball.x > netLeftAtBall && ball.x < netRightAtBall;

  if (isInNetY && isInNetX) {
    if (!ballInNet) {
      // Ball just entered the net - big initial wave
      ballInNet = true;

      // Apply strong wave based on ball velocity
      const impactForce =
        Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * 0.8;
      hoop.netWave += impactForce * (ball.vx > 0 ? 1 : -1);

      // Add vertical impact to wave too
      hoop.netWave += ball.vy * 0.3;

      console.log(
        "[checkNetCollision] Ball entered net, wave: " +
          hoop.netWave.toFixed(2),
      );
    }

    // Continuous net interaction - stronger wave effect
    hoop.netWave += ball.vx * 0.15;

    // Net creates slight drag on the ball
    ball.vx *= 0.97;
    ball.vy *= 0.98;

    // Check collision with net sides (the narrowing effect)
    const margin = CONFIG.BALL_RADIUS * 0.5;
    if (ball.x - margin < netLeftAtBall) {
      ball.x = netLeftAtBall + margin;
      ball.vx = Math.abs(ball.vx) * 0.5;
      hoop.netWave -= 8;
    } else if (ball.x + margin > netRightAtBall) {
      ball.x = netRightAtBall - margin;
      ball.vx = -Math.abs(ball.vx) * 0.5;
      hoop.netWave += 8;
    }
  } else {
    ballInNet = false;
  }
}

function checkScoring(): void {
  if (hoop.scored) return;

  const hoopLeft = hoop.x - CONFIG.HOOP_WIDTH / 2 + CONFIG.RIM_RADIUS * 2;
  const hoopRight = hoop.x + CONFIG.HOOP_WIDTH / 2 - CONFIG.RIM_RADIUS * 2;
  const rimY = hoop.y;
  const netBottom = rimY + CONFIG.RIM_RADIUS + 40;

  // Track if ball is above the rim
  const isAboveRim = ball.y + CONFIG.BALL_RADIUS < rimY;
  const isInHoopX = ball.x > hoopLeft && ball.x < hoopRight;

  // Ball just entered from above
  if (isAboveRim && isInHoopX && ball.vy > 0) {
    ballWasAboveRim = true;
  }

  // Check if ball is passing through the net area
  const isBelowRim = ball.y > rimY + CONFIG.RIM_RADIUS;
  const isAboveNetBottom = ball.y < netBottom;
  const isGoingDown = ball.vy > 0;

  if (
    ballWasAboveRim &&
    isBelowRim &&
    isAboveNetBottom &&
    isInHoopX &&
    isGoingDown
  ) {
    // Ball successfully went through!
    hoop.scored = true;
    ballWasAboveRim = false;
    ballEnteredFromAbove = false;
    onScore();
    console.log("[checkScoring] SCORE! Ball went through cleanly");
  }

  // Reset if ball leaves the scoring area without scoring
  if (!isInHoopX || ball.y > netBottom + 20) {
    ballWasAboveRim = false;
    ballEnteredFromAbove = false;
  }
}

function spawnRimParticles(x: number, y: number): void {
  const colors = ["#ff6600", "#ff8844", "#ffaa66"];

  for (let i = 0; i < 4; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 2;

    pushParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 300,
      maxLife: 300,
      size: 3 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: "burst",
      rotation: 0,
      rotationSpeed: 0,
    });
  }
}

function playRimHitSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  // Metallic ping sound
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    400,
    audioContext.currentTime + 0.1,
  );

  gain.gain.setValueAtTime(0.22, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

function onScore(): void {
  basketCount++;
  const scoreTierBefore = getCurrentScoreTier();
  const comboColorTierBefore = getComboColorTier(comboCount);

  // Simple clean redirect: set velocity toward the new hoop (opposite side)
  const newHoopDirection = hoop.side === "left" ? 1 : -1;
  ball.vx =
    newHoopDirection * getCurrentPostScoreRedirectVelocity(scoreTierBefore);
  ball.vy = -2; // Slight upward pop

  // Check for combo
  const now = gameTime;
  const comboWindow = getCurrentComboWindow();
  if (now - lastScoreTime < comboWindow) {
    comboCount++;
  } else {
    comboCount = 1;
    ballOnFire = false; // Reset fire on combo break
  }
  lastScoreTime = now;
  const comboBand = getComboBand(comboCount);
  const comboTheme = getComboTheme(comboCount);

  // Ball catches fire at 5x combo!
  if (comboCount >= 5 && !ballOnFire) {
    ballOnFire = true;
    addScreenShake(15);
    addScreenFlash(comboTheme.flashColor, 1);
    triggerHaptic("heavy");
    console.log("[onScore] BALL IS ON FIRE!");
  }

  // Determine shot type based on timing
  // If rim was hit but ball scored quickly, it's still a swish (ball just grazed)
  // Only count as rim rattle if it took longer than threshold
  const timeSinceRimHit = gameTime - rimHitTime;
  const timeSinceBackboardHit = gameTime - backboardHitTime;

  // Backboard only counts if hit recently (within window) - otherwise it was a missed shot
  const isValidBankShot =
    hitBackboard && timeSinceBackboardHit < CONFIG.BACKBOARD_VALID_WINDOW;
  // Rim rattle only counts if it took a while to go in
  const isRimRattle =
    hitRim && timeSinceRimHit > CONFIG.RIM_RATTLE_THRESHOLD && !isValidBankShot;
  // Swish = no valid bank shot and no rim rattle
  const isSwish = !isValidBankShot && !isRimRattle;
  const isBankShot = isValidBankShot;
  const shotType: ShotType = isSwish ? "swish" : isBankShot ? "bank" : "rattle";

  const basePoints = getBasePointsForTier(scoreTierBefore);
  const qualityMultiplier = isSwish
    ? CONFIG.SWISH_MULTIPLIER
    : isBankShot
      ? CONFIG.BANK_MULTIPLIER
      : 1;
  const comboBonusPoints = getComboBonusPoints(comboCount);
  const points = Math.round(basePoints * qualityMultiplier) + comboBonusPoints;
  score += points;
  const scoreTierAfter = getCurrentScoreTier();

  // Add time bonus with a gentle long-run taper.
  const isClutchScore = timeRemaining <= CONFIG.SLOWMO_THRESHOLD;
  const timeBonus = isClutchScore
    ? getCurrentSlowMoTimeBonus(scoreTierBefore)
    : getCurrentTimeBonus(scoreTierBefore);
  timeRemaining = Math.min(timeRemaining + timeBonus, CONFIG.MAX_TIME);
  showTimerBonus(timeBonus, isClutchScore);

  // Effects
  spawnScoreParticles(hoop.x, hoop.y, shotType, comboCount);
  hoop.netWave += 12;

  // Shot type specific effects with varied messages
  // Spawn at center of screen so text is always visible
  const centerX = w / 2;
  const centerY = h * 0.3;

  if (isSwish) {
    // SWISH - Nothing but net! Clean and satisfying
    const swishMessages = [
      { text: "SWISH!", color: "#00ffaa" },
      { text: "CLEAN!", color: "#90ff90" },
      { text: "PERFECT!", color: "#ffd700" },
      { text: "PURE!", color: "#ffffff" },
    ];
    const msg = swishMessages[Math.floor(Math.random() * swishMessages.length)];
    spawnScorePopup(centerX, centerY, msg.text, msg.color, 1.5);
    addScreenFlash(msg.color, 0.6);
    playSwishSound();
    triggerHaptic("success");
    console.log("[onScore] " + msg.text + " Nothing but net!");
  } else if (isBankShot) {
    // BANK SHOT - Off the glass!
    const bankMessages = [
      { text: "BANK SHOT!", color: "#ff88ff" },
      { text: "OFF THE GLASS!", color: "#88ccff" },
      { text: "BANKED IT!", color: "#ffcc00" },
      { text: "ANGLES!", color: "#90ffcc" },
      { text: "TIM DUNCAN!", color: "#a0a0a0" },
    ];
    const msg = bankMessages[Math.floor(Math.random() * bankMessages.length)];
    spawnScorePopup(centerX, centerY, msg.text, msg.color, 1.4);
    addScreenFlash(msg.color, 0.5);
    triggerHaptic("medium");
    console.log("[onScore] " + msg.text + " Off the glass!");
  } else if (isRimRattle) {
    // Rim shot - lucky bounce (ball rattled around before going in)
    const luckyMessages = [
      { text: "RIM BOUNCE!", color: "#ffaa00" },
      { text: "LUCKY BOUNCE!", color: "#ff7070" },
      { text: "OFF THE RIM!", color: "#ffa0a0" },
      { text: "RATTLED IN!", color: "#ffcc80" },
    ];
    const msg = luckyMessages[Math.floor(Math.random() * luckyMessages.length)];
    spawnScorePopup(centerX, centerY, msg.text, msg.color, 1.3);
    addScreenFlash(msg.color, 0.4);
    triggerHaptic("light");
    console.log(
      "[onScore] " +
        msg.text +
        " Lucky bounce! (rattled for " +
        timeSinceRimHit +
        "ms)",
    );
  }

  if (comboCount > 1) {
    // Combo effects
    spawnComboParticles(w / 2, h / 2, comboCount);
    spawnScorePopup(
      hoop.x,
      hoop.y - 30,
      "+" + formatScore(points),
      comboTheme.popupColor,
      1.08 + comboBand * 0.08,
    );
    addScreenShake(CONFIG.SHAKE_COMBO + comboBand * 1.5);
    addScreenFlash(
      comboTheme.flashColor,
      Math.min(0.9, 0.55 + comboBand * 0.08),
    );
    playComboSound(comboCount);
    triggerHaptic(comboBand >= 3 ? "heavy" : "medium");

    // Update combo display
    comboDisplay.textContent = getComboBannerText(comboCount);
    comboDisplay.style.color = comboTheme.popupColor;
    comboDisplay.classList.add("active");
    setTimeout(() => comboDisplay.classList.remove("active"), 1500);
  } else {
    spawnScorePopup(
      hoop.x,
      hoop.y - 30,
      "+" + formatScore(points),
      "#ffffff",
      1,
    );
    addScreenShake(CONFIG.SHAKE_SCORE);
  }

  if (getComboColorTier(comboCount) > comboColorTierBefore) {
    const milestoneText =
      getComboMilestoneText(comboCount) || comboTheme.label + "!";
    spawnScorePopup(
      w / 2,
      h * 0.42,
      milestoneText,
      comboTheme.popupColor,
      1.55,
    );
    addScreenFlash(comboTheme.flashColor, Math.min(1, 0.65 + comboBand * 0.05));
    addScreenShake(CONFIG.SHAKE_COMBO + comboBand * 2);
    playComboMilestoneSound(comboCount);
  }

  if (scoreTierAfter > scoreTierBefore) {
    for (let tier = scoreTierBefore + 1; tier <= scoreTierAfter; tier++) {
      spawnScorePopup(
        w / 2,
        h * 0.22,
        getTierMilestoneText(tier),
        "#00A1E4",
        1.35,
      );
      addScreenFlash("#00A1E4", 0.55);
      addScreenShake(CONFIG.SHAKE_SCORE + 2);
      playTierAdvanceSound(tier);
    }
  }

  // Reset shot tracking for next possession
  hitBackboard = false;
  hitRim = false;

  // Switch hoop side immediately
  switchHoopSide();

  console.log(
    "[onScore] Scored! Points: " +
      points +
      ", Combo: " +
      comboCount +
      ", Tier: " +
      scoreTierAfter +
      ", Total: " +
      score,
  );
}

function switchHoopSide(): void {
  hoop.side = hoop.side === "left" ? "right" : "left";
  hoop.targetX = calculateHoopX(hoop.side);

  // Raise hoop placement over long runs so each 20k band adds pressure.
  const { minRatio, maxRatio } = getCurrentHoopYRange();
  const minY = h * minRatio;
  const maxY = h * maxRatio;
  hoop.targetY = minY + Math.random() * (maxY - minY);

  hoop.animationProgress = 0;
  hoop.scored = false;

  // Reset shot tracking for the new hoop
  resetShotTracking();

  console.log(
    "[switchHoopSide] Hoop switching to " +
      hoop.side +
      " at height " +
      Math.round(hoop.targetY),
  );
}

function calculateHoopX(side: HoopSide): number {
  if (side === "left") {
    return CONFIG.HOOP_MARGIN + CONFIG.HOOP_WIDTH / 2 + CONFIG.BACKBOARD_WIDTH;
  } else {
    return (
      w - CONFIG.HOOP_MARGIN - CONFIG.HOOP_WIDTH / 2 - CONFIG.BACKBOARD_WIDTH
    );
  }
}

function updateHoop(dt: number): void {
  // Animate hoop position
  if (hoop.animationProgress < 1) {
    hoop.animationProgress += dt / CONFIG.HOOP_SWITCH_DURATION;
    if (hoop.animationProgress > 1) hoop.animationProgress = 1;

    const t = easeInOutQuad(hoop.animationProgress);
    hoop.x = lerp(hoop.x, hoop.targetX, t * 0.2);
    hoop.y = lerp(hoop.y, hoop.targetY, t * 0.2);
  } else {
    hoop.x = hoop.targetX;
    hoop.y = hoop.targetY;
  }

  // Net wave animation decay - slower for more visible effect
  hoop.netWave *= 0.92;
  if (Math.abs(hoop.netWave) < 0.01) hoop.netWave = 0;
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // Particle gravity
    p.vx *= 0.98;
    p.rotation += p.rotationSpeed;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateScorePopups(dt: number): void {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].life -= dt;
    if (scorePopups[i].life <= 0) {
      scorePopups.splice(i, 1);
    }
  }
}

function updateTimer(dt: number): void {
  if (gameState !== "PLAYING") return;

  timeRemaining -= dt / 1000;

  if (timeRemaining <= 0) {
    timeRemaining = 0;
    gameOver();
  }
}

function resetGame(): void {
  console.log("[resetGame] Resetting game state");

  score = 0;
  basketCount = 0;
  comboCount = 0;
  lastScoreTime = 0;
  ballOnFire = false;
  fireParticles = [];
  timeRemaining = CONFIG.GAME_DURATION;
  gameTime = 0;

  particles = [];
  scorePopups = [];

  shakeIntensity = 0;
  screenFlash = 0;
  lastHUDScore = -1;
  lastHUDTime = -1;

  // Reset ball
  ball.x = w / 2;
  ball.y = groundY - CONFIG.BALL_RADIUS - 125;
  ball.vx = 0;
  ball.vy = 0;
  ball.rotation = 0;
  ball.lastGroundTime = 0;

  // Reset hoop
  hoop.side = "right";
  hoop.x = calculateHoopX("right");
  hoop.targetX = hoop.x;
  hoop.y = h * getCurrentHoopYRange(0).minRatio;
  hoop.targetY = hoop.y;
  hoop.animationProgress = 1;
  hoop.netWave = 0;
  hoop.scored = false;

  // Reset UI
  comboDisplay.textContent = "";
  comboDisplay.style.color = "#ffffff";
  comboDisplay.classList.remove("active");
  timerBadge.classList.remove("warning");
}

// ============= SCORE SUBMISSION =============
function submitFinalScore(): void {
  console.log("[Game] Submitting final score:", score);
  oasiz.submitScore(score);
}

function gameOver(): void {
  if (gameState === "GAME_OVER") return; // Prevent multiple calls

  gameState = "GAME_OVER";
  frozenBackgroundTime = gameTime;
  gameplayStop();
  console.log("[gameOver] Final score: " + score + ", Baskets: " + basketCount);

  // Submit score to platform
  submitFinalScore();

  // Effects
  playBuzzerSound();
  triggerHaptic("error");

  // Update UI
  finalScoreEl.textContent = formatScore(score);

  const rankTier = getRankForScore(score);

  rankValueEl.textContent = rankTier.label;
  rankValueEl.style.color = rankTier.color;
  rankValueEl.style.borderColor = rankTier.color;
  rankValueEl.style.boxShadow = "none";

  startScreen.classList.add("hidden");
  startAction.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
  document.getElementById("settingsBtn")!.classList.add("hidden");
  settingsScreen.classList.add("hidden");
  hudElement.classList.add("hidden");
  controlsElement.classList.add("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";

  initAudio();
  startBgm();
  resetGame();
  gameplayStart();

  startScreen.classList.add("hidden");
  startAction.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.remove("hidden");
  document.getElementById("settingsBtn")!.classList.remove("hidden");
  hudElement.classList.remove("hidden");
  controlsElement.classList.remove("hidden");

  playUIClick();
  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  frozenBackgroundTime = gameTime;
  gameplayStop();
  pauseScreen.classList.remove("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  gameplayStart();
  pauseScreen.classList.add("hidden");
  triggerHaptic("light");
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";
  frozenBackgroundTime = gameTime;
  gameplayStop();

  startScreen.classList.remove("hidden");
  startAction.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  document.getElementById("settingsBtn")!.classList.add("hidden");
  settingsScreen.classList.add("hidden");
  hudElement.classList.add("hidden");
  controlsElement.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (
      e.key === " " ||
      e.key === "ArrowUp" ||
      e.key === "w" ||
      e.key === "W"
    ) {
      e.preventDefault();
      if (gameState === "PLAYING") {
        boost();
      } else if (gameState === "START") {
        startGame();
      }
    }
    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }
  });

  // Boost button touch/click
  function handleBoostDown(e: Event): void {
    e.preventDefault();
    boostBtn.classList.add("pressed");
    if (gameState === "PLAYING") {
      boost();
    }
  }

  function handleBoostUp(e: Event): void {
    e.preventDefault();
    boostBtn.classList.remove("pressed");
  }

  boostBtn.addEventListener("touchstart", handleBoostDown);
  boostBtn.addEventListener("touchend", handleBoostUp);
  boostBtn.addEventListener("touchcancel", handleBoostUp);
  boostBtn.addEventListener("mousedown", handleBoostDown);
  boostBtn.addEventListener("mouseup", handleBoostUp);
  boostBtn.addEventListener("mouseleave", () =>
    boostBtn.classList.remove("pressed"),
  );

  // Canvas tap (for quick boost anywhere on screen)
  canvas.addEventListener("click", () => {
    if (gameState === "PLAYING") {
      boost();
    }
  });

  // UI buttons
  document.getElementById("startButton")!.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", pauseGame);
  document
    .getElementById("resumeButton")!
    .addEventListener("click", resumeGame);
  document.getElementById("pauseRestartBtn")!.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    startGame();
  });
  document
    .getElementById("pauseMenuBtn")!
    .addEventListener("click", showStartScreen);
  document
    .getElementById("restartButton")!
    .addEventListener("click", startGame);
  document
    .getElementById("menuButton")!
    .addEventListener("click", showStartScreen);

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("hoopsJump_music", settings.music.toString());
    if (settings.music && userStarted) {
      // Resume directly inside the click handler (user gesture) so browser allows it
      const current = bgmAudios[currentBgmIndex];
      current.volume = getBgmTargetVolume();
      current.play().catch((e) => console.warn("[BGM] resume blocked:", e));
    } else {
      bgmAudios.forEach((a) => a.pause()); // pause but keep currentTime intact
    }
    playUIClick();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("hoopsJump_fx", settings.fx.toString());
    if (settings.fx) playUIClick();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("hoopsJump_haptics", settings.haptics.toString());
    playUIClick();
    triggerHaptic("light");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsScreen.classList.add("hidden");
    // Resume game if it was paused for settings
    if (gameState === "PAUSED") {
      gameState = "PLAYING";
    }
    playUIClick();
    triggerHaptic("light");
  });

  // Settings button (opens modal and pauses game)
  const settingsBtn = document.getElementById("settingsBtn")!;
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Only open settings, don't toggle - use DONE button to close
    if (settingsScreen.classList.contains("hidden")) {
      settingsScreen.classList.remove("hidden");
      if (gameState === "PLAYING") {
        gameState = "PAUSED";
      }
      playUIClick();
      triggerHaptic("light");
    }
  });

  // Map selection - handle both settings modal and start screen court buttons
  const allMapBtns = document.querySelectorAll(".map-btn, .court-btn");
  const updateMapSelection = (map: MapType) => {
    console.log("[initEventListeners] Updating map to:", map);
    currentMap = map;
    localStorage.setItem("hoopsJump_map", map);
    frozenBackgroundTime = gameTime;
    if (!backgroundBaseCaches[map] && w > 0 && h > 0) {
      rebuildBackgroundCaches();
    }
    // Update all map/court buttons across all menus
    document.querySelectorAll(".map-btn, .court-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-map") === map);
    });
  };

  // Initialize map selection
  updateMapSelection(currentMap);

  allMapBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const map = btn.getAttribute("data-map") as MapType;
      updateMapSelection(map);
      playUIClick();
      triggerHaptic("light");
    });
  });

  // Start screen tap anywhere to start (except buttons)
  startScreen.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    // Only start if clicking outside of interactive elements
    if (!target.closest(".court-btn") && !target.closest("#startButton")) {
      startGame();
    }
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  const oldH = h; // Save old height for ratio calculation

  const rect = screenContainer.getBoundingClientRect();
  w = rect.width;
  h = rect.height;
  canvas.width = w;
  canvas.height = h;

  ctx.imageSmoothingEnabled = false;

  groundY = h - 30;

  rebuildBackgroundCaches();

  // Update hoop position
  hoop.targetX = calculateHoopX(hoop.side);
  hoop.x = hoop.targetX;
  // Keep current Y ratio on resize
  if (hoop.targetY > 0 && oldH > 0) {
    const ratio = hoop.y / oldH;
    hoop.y = h * ratio;
    hoop.targetY = hoop.y;
  }

  // Ensure ball is in bounds
  if (ball.y > groundY - CONFIG.BALL_RADIUS) {
    ball.y = groundY - CONFIG.BALL_RADIUS;
  }

  console.log("[resizeCanvas] Canvas resized to: " + w + " x " + h);
}

// ============= GAME LOOP =============
function getBackgroundMotionTime(): number {
  return gameState === "PLAYING" ? gameTime : frozenBackgroundTime;
}

function gameLoop(timestamp: number): void {
  const rawDt = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;
  gameTime = timestamp;

  // Calculate slow-mo time scales (timer slows less than physics)
  const slowMoScale = gameState === "PLAYING" ? getSlowMoScale() : 1;
  const timerSlowMoScale = gameState === "PLAYING" ? getTimerSlowMoScale() : 1;
  const dt = rawDt * slowMoScale;
  const timerDt = rawDt * timerSlowMoScale;

  // Update screen effects
  updateScreenEffects();

  // Apply screen shake
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Clear and draw background
  const animateBackground = gameState === "PLAYING";
  const backgroundMotionTime = getBackgroundMotionTime();
  ctx.clearRect(-20, -20, w + 40, h + 40);
  drawBackground(backgroundMotionTime, animateBackground);
  manageBgm();

  if (gameState === "PLAYING") {
    // Timer runs with less slow-mo than physics
    updateTimer(timerDt);

    // Physics and effects run in full slow-mo
    updateBall(dt);
    updateHoop(dt);
    updateParticles(dt);
    updateScorePopups(dt);
    updateFireParticles(dt);

    // Apply zoom effect during slow-mo
    const zoomIntensity = 1 - slowMoScale;
    if (zoomIntensity > 0) {
      const zoomScale = 1 + zoomIntensity * 0.12; // Zoom up to 12%
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoomScale, zoomScale);
      ctx.translate(-w / 2, -h / 2);
    }

    drawFireParticles(); // Draw fire trail behind ball
    drawHoop();
    drawBall();
    drawParticles();
    drawScorePopups();

    // Restore zoom before drawing overlays
    if (zoomIntensity > 0) {
      ctx.restore();
    }

    drawFlashEffect();
    drawSlowMoEffect(); // Vignette and urgency effect
    updateHUD();
  } else if (gameState === "START") {
    // Draw live background preview for court selection
    drawHoop();
    drawBall();
  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    updateParticles(dt);
    updateScorePopups(dt);

    drawHoop();
    if (gameState === "PAUSED") drawBall();
    drawParticles();
    drawScorePopups();
    drawFlashEffect();
    updateHUD();
  }

  ctx.restore();
  rafId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Hoops Jump");

  emitPlatformScoreConfig();

  // Stop loop when app backgrounds, restart when it returns
  oasiz.onPause(() => {
    if (gameState === "PLAYING") {
      pauseGame();
    }
    stopLoop();
  });

  oasiz.onResume(() => {
    startLoop();
  });

  // Also handle plain tab visibility changes (desktop browser)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  setupInputHandlers();

  // Initialize ball position
  ball.x = w / 2;
  ball.y = groundY - CONFIG.BALL_RADIUS - 125;

  // Initialize hoop at highest position
  hoop.x = calculateHoopX("right");
  hoop.targetX = hoop.x;
  hoop.y = h * getCurrentHoopYRange(0).minRatio;
  hoop.targetY = hoop.y;

  startLoop();
  showStartScreen();

  console.log("[init] Game initialized");
}

init();
