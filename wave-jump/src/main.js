import * as THREE from "three";
import { oasiz } from "@oasiz/sdk";
import track1Url from "../assets/endless-geometry.mp3";
import track2Url from "../assets/endless-twilight-1.mp3";
import track3Url from "../assets/endless-twilight-2.mp3";
import gameOverTrackUrl from "../assets/endless-twilight-loop.mp3";

const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  window.innerWidth <= 768;

const FIXED_STEP = 1 / 60;
const TILE_SIZE = 2;
const TILE_COLUMNS = 9;
const TILE_ROWS = 38;
const PLAYER_BASE_Z = 8;
const PATH_HALF_WIDTH = ((TILE_COLUMNS - 1) * TILE_SIZE) / 2;
const JUMP_DURATION = 0.28;
const JUMP_COOLDOWN = 0.05;
const JUMP_ARC_HEIGHT = 1.08;
const STEP_BLOCK_INTERVAL = 10;
const STEP_DISTANCE = TILE_SIZE * STEP_BLOCK_INTERVAL;
const STEP_BLOCK_COUNT = 72;
const STEP_BLOCK_BASE_Y = 0.4;
const STEP_BLOCK_WAVE_HEIGHT = 1.25;
const STEP_BLOCK_WAVE_FREQ = 0.42;
const STEP_BLOCK_MIN_Y = 0.35;
const PLAYER_BLOCK_OFFSET_Y = 0.12;
const CRUMBLE_TIME_BASE = 3.0;
const CRUMBLE_TIME_MIN = 1.8;
const CRUMBLE_WARN_RATIO = 0.35;
const CRUMBLE_SELF_SHAKE_START = 0.80;
const CRUMBLE_FALL_GRAVITY = 12;
const CRUMBLE_TILE_FALL_START = 0.40;
const CRUMBLE_SELF_FALL_DELAY = 0.15;
const CRUMBLE_BUNNY_FALL_DELAY = 0.30;
const CRUMBLE_CASCADE_SPEED_MIN = 4;
const CRUMBLE_CASCADE_SPEED_MAX = 30;
function getCrumbleCascadeSpeed() {
  const t = Math.min(1, state.score / 40);
  return THREE.MathUtils.lerp(CRUMBLE_CASCADE_SPEED_MIN, CRUMBLE_CASCADE_SPEED_MAX, t);
}
const VOID_DEATH_TIME = 0.9;
const VOID_FALL_GRAVITY = 6.0;
const VOID_SPIN_SPEED = 4.5;
const HAZARD_POOL_COUNT = isMobile ? 5 : 6;
const MAX_ACTIVE_ORB_SLOTS = 5;
const HAZARD_ROCK_COUNT = 4;
const HAZARD_ROCK_COUNT_VARIANTS = [4, 3, 2, 1];
const HAZARD_ORBIT_RADIUS = 4.2;
const HAZARD_ORBIT_DEPTH = 2.35;
const HAZARD_CENTER_HEIGHT = 0.95;
const HAZARD_PAIR_FOLLOW_GAP_MIN = 0.72;
const HAZARD_PAIR_FOLLOW_GAP_MAX = 1.28;
const ORB_MULTIPLIER_DECAY_TIME = 1;
const ORB_MULTIPLIER_MIN = 1;
const ORB_MULTIPLIER_MAX = 3;
const ORB_MULTIPLIER_POP_TIME = 0.34;
const ORB_MULTIPLIER_POP_SCALE = 0.26;
const HAZARD_COLLIDER_RADIUS = 0.9;
const PLAYER_COLLIDER_RADIUS = 0.56;
const DIFFICULTY_ORB_STEP = 10;
const DIFFICULTY_SPEED_FACTOR = 1.05;
const DIFFICULTY_SPEED_MAX = 2.0;
const COLLIDER_Y_SCALE = 0.76;
const HAZARD_SAFE_GAP = PLAYER_COLLIDER_RADIUS + HAZARD_COLLIDER_RADIUS;
const EGG_COLLECT_FLASH_TIME = 0.38;
const EGG_BURST_POOL_SIZE = isMobile ? 20 : 44;
const EGG_BURST_LIFE = 0.52;
const CAMERA_BASE_HEIGHT = 12.0;
const CAMERA_BASE_Z = isMobile ? 14.6 : 13.9;
const CAMERA_LOOK_Z_OFFSET = -11.4;
const CAMERA_LOOK_Y_FACTOR = 0.42;
const CAMERA_FOLLOW_DAMP = 2.35;
const CAMERA_CATCHUP_DAMP = 4.4;
const CAMERA_CATCHUP_TIME = 0.46;
const DASH_FLASH_TIME = 0.42;
const DASH_SHAKE_TIME = 0.24;
const DASH_SHAKE_POWER = 0.28;
const TRAIL_POOL_SIZE = isMobile ? 24 : 52;
const TRAIL_EMIT_INTERVAL = 0.015;
const TRAIL_RING_TIME = 0.55;
const DASH_RIBBON_TIME = 0.45;
const DASH_GROUND_WAVE_TIME = 0.92;
const DASH_GROUND_WAVE_RANGE = 64;
const DASH_GROUND_WAVE_SPEED = DASH_GROUND_WAVE_RANGE / DASH_GROUND_WAVE_TIME;
const DASH_GROUND_WAVE_BAND = 4;
const DASH_GROUND_WAVE_TAIL = 34;
const DASH_GROUND_WAVE_MAX_DISTANCE = isMobile ? 80 : 260;
const DASH_GROUND_WAVE_LIFT = 0.72;
const DASH_GROUND_WAVE_FLASH = 0.9;
const DEATH_ANIM_TIME = 0.7;
const DEATH_LIFT_SPEED = 2.9;
const DEATH_GRAVITY = 8.6;
const DEATH_DRIFT = 1.75;
const DEATH_SPIN_SPEED = 8.9;
const DEATH_TRAIL_EMIT_INTERVAL = 0.028;
const DEATH_SHOCKWAVE_TIME = 0.66;
const DEATH_FLASH_TIME = 0.58;
const DEATH_WORLD_TIME_SCALE = 0.52;
const DEATH_CAMERA_PULLBACK = 1.15;
const DEATH_CAMERA_RISE = 0.74;
const LOW_FPS_THRESHOLD = 45;
const LOW_FPS_ENTER_TIME = 0.7;
const LOW_FPS_EXIT_TIME = 1.2;
const STEP_BLOCK_FLASH_TIME = 0.16;
const SCENERY_FRONT_Z_OFFSET = 24;
const SCENERY_POOL_DEPTH = isMobile ? 90 : 142;
const TREE_ROW_COUNT_PER_SIDE = isMobile ? 3 : 7;
const SIDE_TERRACE_ROWS = TREE_ROW_COUNT_PER_SIDE;
const SIDE_TERRACE_BLOCK_HEIGHT = 1.1;
const SIDE_TERRACE_ROW_OFFSET = 1.02;
const SIDE_TERRACE_ROW_SPACING = 1.0;
const SIDE_TERRACE_HEIGHT_WAVE = 0.65;
const SIDE_TERRACE_HEIGHT_RIPPLE = 0.18;

const _themeTemp = new THREE.Color();
const THEME_COLORS = [
  { name: "mono",    base: new THREE.Color(0x888888) },
  { name: "crimson", base: new THREE.Color(0xff2244) },
  { name: "cyan",    base: new THREE.Color(0x00e5ff) },
  { name: "amber",   base: new THREE.Color(0xffaa00) },
  { name: "violet",  base: new THREE.Color(0x9b30ff) },
  { name: "lime",    base: new THREE.Color(0x76ff03) },
  { name: "magenta", base: new THREE.Color(0xff0080) },
  { name: "azure",   base: new THREE.Color(0x2979ff) },
  { name: "coral",   base: new THREE.Color(0xff6e40) },
  { name: "teal",    base: new THREE.Color(0x00e6a0) },
  { name: "rose",    base: new THREE.Color(0xff3580) },
  { name: "gold",    base: new THREE.Color(0xffd000) },
  { name: "indigo",  base: new THREE.Color(0x6040ff) },
  { name: "spring",  base: new THREE.Color(0x30ff70) },
];

function deriveThemePalette(base) {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const h = hsl.h;
  const s = hsl.s;
  const isMono = s < 0.05;

  const hAnalogous = isMono ? h : (h + 0.15) % 1;
  const hComplement = isMono ? h : (h + 0.5) % 1;
  const hStone = isMono ? h : (h + 0.04) % 1;

  const tileLightness = isMono ? 0.28 : hsl.l * 0.45;
  const tileSat = isMono ? 0 : s * 0.9;
  const tilePalette = [];
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * (isMono ? 0.05 : 0.07);
    tilePalette.push(new THREE.Color().setHSL(h, tileSat, Math.max(0.06, tileLightness + spread)));
  }

  const terraceLightness = isMono ? 0.16 : tileLightness * 0.55;
  const terraceSat = isMono ? 0 : s * 0.8;
  const terracePalette = [];
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * (isMono ? 0.03 : 0.05);
    terracePalette.push(new THREE.Color().setHSL(h, terraceSat, Math.max(0.04, terraceLightness + spread)));
  }

  const rockColor = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.8, isMono ? 0.03 : 0.05);
  const stoneBase = new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.65, isMono ? 0.35 : hsl.l * 0.88);
  const stoneMid = new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.58, isMono ? 0.45 : hsl.l * 1.0);
  const stoneTop = new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.5, isMono ? 0.55 : Math.min(0.95, hsl.l * 1.15));
  const stoneEmissiveBase = [
    new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.6, isMono ? 0.2 : hsl.l * 0.6),
    new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.55, isMono ? 0.28 : hsl.l * 0.7),
    new THREE.Color().setHSL(hStone, isMono ? 0 : s * 0.5, isMono ? 0.36 : hsl.l * 0.82),
  ];
  const bgColor = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.55, isMono ? 0.06 : 0.10);
  const groundBedColor = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.3, isMono ? 0.02 : 0.03);
  const crumbleWarnColor = new THREE.Color().setHSL(hComplement, isMono ? 0 : s * 0.7, isMono ? 0.10 : 0.14);
  const orbColor = isMono ? new THREE.Color().setHSL(0, 0, 0.75) : base.clone();
  const orbEmissive = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.7, isMono ? 0.5 : hsl.l * 0.82);
  const ringColor = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.6, isMono ? 0.55 : hsl.l * 0.78);
  const ringEmissive = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.55, isMono ? 0.35 : hsl.l * 0.52);

  const rabbitFur = new THREE.Color(0x1a1a1a);
  const rabbitEar = new THREE.Color(0x383838);
  const rabbitBelly = new THREE.Color(0xffffff);
  const rabbitAccent = new THREE.Color(0xd0d0d0);
  const rabbitIris = new THREE.Color(0xd4a04a);

  const treeTrunk = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.3, isMono ? 0.06 : 0.08);
  const treeLeafTop = new THREE.Color().setHSL(
    hAnalogous, isMono ? 0 : s * 0.6, isMono ? 0.38 : hsl.l * 0.65
  );
  const treeLeafBottom = new THREE.Color().setHSL(
    hAnalogous, isMono ? 0 : s * 0.55, isMono ? 0.26 : hsl.l * 0.48
  );
  const bushColor = new THREE.Color().setHSL(
    hAnalogous, isMono ? 0 : s * 0.55, isMono ? 0.30 : hsl.l * 0.55
  );

  const floraStem = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.35, isMono ? 0.18 : 0.22);
  const floraPetal = new THREE.Color().setHSL(
    hComplement, isMono ? 0 : s * 0.65, isMono ? 0.45 : hsl.l * 0.72
  );
  const floraCenter = new THREE.Color().setHSL(h, isMono ? 0 : s * 0.4, isMono ? 0.6 : hsl.l * 0.9);
  const floraGrass = new THREE.Color().setHSL(
    (h + 0.12) % 1, isMono ? 0 : s * 0.5, isMono ? 0.22 : hsl.l * 0.4
  );

  return {
    tilePalette, terracePalette, rockColor,
    stoneBase, stoneMid, stoneTop, stoneEmissiveBase,
    bgColor, groundBedColor, crumbleWarnColor,
    orbColor, orbEmissive, ringColor, ringEmissive,
    rabbitFur, rabbitEar, rabbitBelly, rabbitAccent, rabbitIris,
    treeTrunk, treeLeafTop, treeLeafBottom, bushColor,
    floraStem, floraPetal, floraCenter, floraGrass,
  };
}

const themePalettes = THEME_COLORS.map((t) => deriveThemePalette(t.base));
function nextOrbThemeIndex() {
  state.nextOrbTheme = (state.nextOrbTheme % (THEME_COLORS.length - 1)) + 1;
  return state.nextOrbTheme;
}

const canvas = document.querySelector("#game-canvas");
const fpsEl = document.querySelector("#fps");
const menu = document.querySelector("#menu");
const menuTitle = document.querySelector("#menu-title");
const menuText = document.querySelector("#menu-text");
const menuKicker = document.querySelector("#menu-kicker");
const menuDivider = document.querySelector("#menu-divider");
const menuOrbs = document.querySelector("#menu-orbs");
const startButton = document.querySelector("#start-btn");
const cloudVeil = document.querySelector("#cloud-veil");
const hud = document.querySelector("#hud");
const tutorial = document.querySelector("#tutorial");
const tapHint = document.querySelector("#tap-hint");
const dashFlash = document.querySelector("#dash-flash");
const crumbleVignette = document.querySelector("#crumble-vignette");
const shell = document.querySelector("#game-shell");
const settingsButton = document.querySelector("#settings-btn");
const settingsModal = document.querySelector("#settings-modal");
const settingsCloseButton = document.querySelector("#settings-close");
const musicToggleButton = document.querySelector("#toggle-music");
const fxToggleButton = document.querySelector("#toggle-fx");
const hapticsToggleButton = document.querySelector("#toggle-haptics");
const scorePopup = document.querySelector("#score-popup");
const scoreNumber = document.querySelector("#score-number");
const milestonePopup = document.querySelector("#milestone-popup");
const milestoneNumber = document.querySelector("#milestone-number");
const milestoneLabel = document.querySelector("#milestone-label");

function sfxX2Synth() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.12);
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  });
}

function sfxX3Synth() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    [1100, 1320, 1540, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const t = now + i * 0.05;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.14);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.25);
    });
    const shimmer = ctx.createOscillator();
    const sg = ctx.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(2200, now + 0.15);
    shimmer.frequency.exponentialRampToValueAtTime(2800, now + 0.35);
    sg.gain.setValueAtTime(0.15, now + 0.15);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    shimmer.connect(sg).connect(dest);
    shimmer.start(now + 0.15);
    shimmer.stop(now + 0.4);
  });
}
const sfxMilestone20 = new Audio("/sfx-milestone-20.mp3");
const sfxMilestone60 = new Audio("/sfx-milestone-60.mp3");
const sfxMilestone100 = new Audio("/sfx-milestone-100.mp3");
sfxMilestone20.preload = "auto";
sfxMilestone60.preload = "auto";
sfxMilestone100.preload = "auto";

const MILESTONES = [
  { score: 20, label: "AMAZING!", sfx: sfxMilestone20, haptic: "success" },
  { score: 60, label: "INCREDIBLE!", sfx: sfxMilestone60, haptic: "success" },
  { score: 100, label: "LEGENDARY!", sfx: sfxMilestone100, haptic: "heavy" },
  { score: 200, label: "GODLIKE!", sfx: sfxMilestone100, haptic: "heavy" },
];

let scorePopupTimer = null;
let milestonePopupTimer = null;
let lastMilestoneHit = 0;

function showScorePopup(count) {
  if (scorePopupTimer) clearTimeout(scorePopupTimer);
  scoreNumber.textContent = count;
  scorePopup.classList.remove("pop");
  void scorePopup.offsetWidth;
  scorePopup.classList.add("pop");
  scorePopupTimer = setTimeout(() => {
    scorePopup.classList.remove("pop");
  }, 1150);
}

function checkMilestones(score) {
  for (const m of MILESTONES) {
    if (score >= m.score && lastMilestoneHit < m.score) {
      lastMilestoneHit = m.score;
      showMilestonePopup(m.score, m.label);
      if (settings.fx) {
        m.sfx.currentTime = 0;
        m.sfx.play().catch(() => {});
      }
      triggerHaptic(m.haptic);
      break;
    }
  }
}

function showMilestonePopup(number, label) {
  if (milestonePopupTimer) clearTimeout(milestonePopupTimer);
  milestoneNumber.textContent = number;
  milestoneLabel.textContent = label;
  milestonePopup.classList.remove("pop");
  void milestonePopup.offsetWidth;
  milestonePopup.classList.add("pop");
  milestonePopupTimer = setTimeout(() => {
    milestonePopup.classList.remove("pop");
  }, 1450);
}

const SETTINGS_STORAGE_KEY = "wave_jump_settings_v1";
const DEFAULT_SETTINGS = {
  music: true,
  fx: true,
  haptics: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      music: parsed.music !== false,
      fx: parsed.fx !== false,
      haptics: parsed.haptics !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const settings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore persistence errors and keep runtime defaults.
  }
}

function isSettingsOpen() {
  return Boolean(settingsModal && settingsModal.open);
}

function renderSettingsUI() {
  if (musicToggleButton) {
    musicToggleButton.setAttribute("aria-pressed", String(settings.music));
    musicToggleButton.textContent = settings.music ? "ON" : "OFF";
  }
  if (fxToggleButton) {
    fxToggleButton.setAttribute("aria-pressed", String(settings.fx));
    fxToggleButton.textContent = settings.fx ? "ON" : "OFF";
  }
  if (hapticsToggleButton) {
    hapticsToggleButton.setAttribute("aria-pressed", String(settings.haptics));
    hapticsToggleButton.textContent = settings.haptics ? "ON" : "OFF";
  }
}

function triggerHaptic(type) {
  if (!settings.haptics) return;
  oasiz.triggerHaptic(type);
}

function openSettings() {
  if (!settingsModal) return;
  renderSettingsUI();
  settingsModal.showModal();
  stopLoop();
  if (currentBgMusic && !currentBgMusic.paused) {
    currentBgMusic.pause();
  }
}

function closeSettings() {
  if (!settingsModal || !settingsModal.open) return;
  settingsModal.close();
  if (state.mode !== "gameover") {
    startLoop();
  }
  updateMusicState();
}

let settingsOpenedAt = -Infinity;

function bindPressAction(element, handler) {
  if (!element) return;
  element.addEventListener("pointerup", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key !== "enter" && key !== " " && key !== "spacebar") return;
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const BASE_PIXEL_RATIO = isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(BASE_PIXEL_RATIO);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color().copy(themePalettes[0].bgColor);
scene.fog = new THREE.Fog(themePalettes[0].bgColor, 12, isMobile ? 54 : 72);

const CAMERA_FOV_PLAY = isMobile ? 80 : 62;
const CAMERA_FOV_HOME = isMobile ? 85 : 68;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV_PLAY, 16 / 9, 0.1, isMobile ? 100 : 180);
camera.position.set(0, CAMERA_BASE_HEIGHT, CAMERA_BASE_Z);
camera.lookAt(0, 0, PLAYER_BASE_Z + CAMERA_LOOK_Z_OFFSET);

const ambient = new THREE.AmbientLight(0xffe8d0, 0.72);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0e0, 0.82);
sun.position.set(10, 18, 7);
scene.add(sun);

const sideFill = new THREE.DirectionalLight(0xd4a574, 0.38);
sideFill.position.set(-15, 6, 5);
scene.add(sideFill);

let tapHintActive = false;

const state = {
  mode: "home",
  elapsed: 0,
  score: 0,
  worldSpeed: 0,
  flashTimer: 0,
  themeIndex: 0,
  prevThemeIndex: 0,
  themeTransitioning: false,
  globalThemeBlend: 1,
  nextOrbTheme: 0,
  player: {
    currentBlock: 0,
    fromBlock: 0,
    toBlock: 0,
    progress: 0,
    activeSegment: 0,
    yOffset: 0,
    jumpTimer: 0,
    jumpDuration: JUMP_DURATION,
    cooldown: 0,
    idleTimer: 0,
    crumbleProgress: 0,
    crumbleWarnFired: false,
    crumbleFallY_self: 0,
    crumbleFallSpeed_self: 0,
    crumbleFallY_bunny: 0,
    crumbleFallSpeed_bunny: 0,
    crumbleCascadeReachedSelf: false,
    crumbleSelfTimer: 0,
    crumbleSelfDustFired: false,
    crumbleTileElapsed: 0,
    crumbleOrbFallY: 0,
    crumbleOrbFallSpeed: 0,
  },
  camera: {
    z: camera.position.z,
    y: camera.position.y,
    catchupTimer: 0,
  },
  performance: {
    fps: 60,
    lowFpsTimer: 0,
    highFpsTimer: 0,
    lowFpsMode: false,
    lowFpsBlend: 0,
  },
  effects: {
    dashFlashTimer: 0,
    deathFlashTimer: 0,
    eggCollectTimer: 0,
    stepBlockFlashTimer: 0,
    groundWaveTimer: 0,
    groundWaveOriginZ: PLAYER_BASE_Z,
    groundWaveFront: 0,
    groundWaveOpacity: 0,
    shakeTimer: 0,
    shakePower: 0,
    trailEmitTimer: 0,
    trailRingTimer: 0,
    dashRibbonTimer: 0,
    dashRibbonFromZ: PLAYER_BASE_Z,
    dashRibbonToZ: PLAYER_BASE_Z,
  },
  course: {
    furthestBlock: STEP_BLOCK_COUNT - 1,
    furthestSegment: HAZARD_POOL_COUNT - 1,
  },
  death: {
    timer: 0,
    reason: "",
    velocityY: 0,
    bounceCount: 0,
    trailEmitTimer: 0,
    shockTimer: 0,
    startX: 0,
    startY: 0,
    startZ: 0,
    isCrumbleDeath: false,
  },
};

const input = {
  pointerDown: false,
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.6;
masterGain.connect(audioCtx.destination);

function ensureAudioCtx() {
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playSynth(fn) {
  if (!settings.fx) return;
  ensureAudioCtx();
  fn(audioCtx, masterGain);
}

function sfxDash() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.22);

    const noise = ctx.createBufferSource();
    const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) nData[i] = (Math.random() * 2 - 1) * 0.3;
    noise.buffer = nBuf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 2000;
    noise.connect(hpf).connect(ng).connect(dest);
    noise.start(now);
    noise.stop(now + 0.08);
  });
}

function sfxOrbCollect() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    [660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.1);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  });
}

function sfxDeath() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    g.gain.setValueAtTime(0.3, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.6);

    const noise = ctx.createBufferSource();
    const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) nData[i] = (Math.random() * 2 - 1);
    noise.buffer = nBuf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(3000, now);
    lpf.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    noise.connect(lpf).connect(ng).connect(dest);
    noise.start(now);
    noise.stop(now + 0.4);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    sg.gain.setValueAtTime(0.35, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    sub.connect(sg).connect(dest);
    sub.start(now);
    sub.stop(now + 0.5);
  });
}

function sfxButtonClick() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.08);
  });
}

function sfxGameStart() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    [330, 440, 550, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      const t = now + i * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  });
}

function sfxMultiplierPop() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.14);
  });
}

function sfxLand() {
  playSynth((ctx, dest) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.14);

    const noise = ctx.createBufferSource();
    const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) nData[i] = (Math.random() * 2 - 1) * 0.15;
    noise.buffer = nBuf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.connect(ng).connect(dest);
    noise.start(now);
    noise.stop(now + 0.06);
  });
}

const MUSIC_SEGMENT_DURATION = 40;
const MUSIC_CROSSFADE = 4;
const MUSIC_TARGET_VOL = 0.45;
const musicTrackDurations = [190, 172, 166];
const musicTracks = [track1Url, track2Url, track3Url];
let musicTrackIndex = Math.floor(Math.random() * musicTracks.length);
let currentBgMusic = null;
let musicPlaying = false;
let segmentTimer = null;
let crossfadeInterval = null;
let gameOverMusic = null;

function pickRandomOffset(trackIdx) {
  const dur = musicTrackDurations[trackIdx];
  const maxStart = Math.max(0, dur - MUSIC_SEGMENT_DURATION - 4);
  return Math.random() * maxStart;
}

function killCrossfade() {
  if (crossfadeInterval) { clearInterval(crossfadeInterval); crossfadeInterval = null; }
}

function crossfade(outAudio, inAudio, duration) {
  killCrossfade();
  const steps = 40;
  const stepMs = (duration * 1000) / steps;
  const outStart = outAudio ? outAudio.volume : 0;
  let step = 0;
  crossfadeInterval = setInterval(() => {
    step++;
    const t = step / steps;
    const fadeIn = t * t;
    const fadeOut = 1 - t;
    if (outAudio) outAudio.volume = Math.max(0, outStart * fadeOut);
    inAudio.volume = MUSIC_TARGET_VOL * fadeIn;
    if (step >= steps) {
      killCrossfade();
      if (outAudio) { outAudio.pause(); outAudio.volume = 0; }
      inAudio.volume = MUSIC_TARGET_VOL;
    }
  }, stepMs);
}

function playNextSegment() {
  if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = null; }
  if (!musicPlaying || !settings.music) return;

  const offset = pickRandomOffset(musicTrackIndex);
  const outgoing = currentBgMusic;
  if (outgoing) outgoing.removeEventListener("ended", onSegmentEnd);

  const incoming = new Audio(musicTracks[musicTrackIndex]);
  incoming.volume = 0;
  incoming.currentTime = offset;
  incoming.addEventListener("ended", onSegmentEnd);
  incoming.play().catch(() => {});
  currentBgMusic = incoming;

  crossfade(outgoing, incoming, MUSIC_CROSSFADE);

  musicTrackIndex = (musicTrackIndex + 1) % musicTracks.length;
  segmentTimer = setTimeout(() => {
    if (musicPlaying && settings.music) playNextSegment();
  }, MUSIC_SEGMENT_DURATION * 1000);
}

function onSegmentEnd() {
  if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = null; }
  if (musicPlaying && settings.music) playNextSegment();
}

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  killCrossfade();
  if (currentBgMusic) {
    currentBgMusic.removeEventListener("ended", onSegmentEnd);
    currentBgMusic.pause();
    currentBgMusic = null;
  }
  currentBgMusic = new Audio(musicTracks[musicTrackIndex]);
  currentBgMusic.volume = MUSIC_TARGET_VOL;
  currentBgMusic.currentTime = 0;
  currentBgMusic.addEventListener("ended", onSegmentEnd);
  currentBgMusic.play().catch(() => {});
  musicTrackIndex = (musicTrackIndex + 1) % musicTracks.length;
  segmentTimer = setTimeout(() => {
    if (musicPlaying && settings.music) playNextSegment();
  }, MUSIC_SEGMENT_DURATION * 1000);
}

function stopMusic() {
  musicPlaying = false;
  killCrossfade();
  if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = null; }
  if (currentBgMusic) {
    currentBgMusic.pause();
  }
}

function startGameOverMusic() {
  if (!settings.music) return;
  if (gameOverMusic) {
    gameOverMusic.pause();
    gameOverMusic.currentTime = 0;
  }
  gameOverMusic = new Audio(gameOverTrackUrl);
  gameOverMusic.volume = 0.35;
  gameOverMusic.loop = true;
  gameOverMusic.currentTime = 0;
  gameOverMusic.play().catch(() => {});
}

function stopGameOverMusic() {
  if (gameOverMusic) {
    gameOverMusic.pause();
    gameOverMusic = null;
  }
}

function updateMusicState() {
  if (settings.music) {
    if (state.mode === "playing" || state.mode === "dying") {
      startMusic();
    }
  } else {
    stopMusic();
    stopGameOverMusic();
  }
}

const tiles = [];
const sideTerraces = [];
const scenery = [];
const flowerDecor = [];
const stepBlocks = [];
const hazards = [];
const bunnyEars = [];

function getStepBlockY(index) {
  const waveY =
    STEP_BLOCK_BASE_Y +
    Math.sin(index * STEP_BLOCK_WAVE_FREQ) * STEP_BLOCK_WAVE_HEIGHT;
  return Math.max(STEP_BLOCK_MIN_Y, waveY);
}

function getBlockZ(index) {
  return PLAYER_BASE_Z - index * STEP_DISTANCE;
}

function getTerrainRowFromZ(z) {
  return (PLAYER_BASE_Z + TILE_SIZE - z) / TILE_SIZE;
}

function getSideTerraceX(side, rowIndex, jitter = 0) {
  return (
    side *
    (PATH_HALF_WIDTH +
      TILE_SIZE *
      (SIDE_TERRACE_ROW_OFFSET + rowIndex * SIDE_TERRACE_ROW_SPACING)) +
    jitter
  );
}

function getSideTerraceTopY(z, rowIndex) {
  const row = getTerrainRowFromZ(z);
  const terraceRise = 0.58 + rowIndex * 0.24;
  const wave = Math.sin(row * 0.56 + rowIndex * 0.92) * SIDE_TERRACE_HEIGHT_WAVE;
  const ripple = Math.sin(row * 1.18 + rowIndex * 1.73) * SIDE_TERRACE_HEIGHT_RIPPLE;
  return Math.max(0.24, terraceRise + wave + ripple);
}

const tilePalette = [0x3d2b1a, 0x4a3525, 0x5c4033, 0x6b4f3a, 0x2e1f12];

const tileGeom = new THREE.BoxGeometry(1.94, 0.72, 1.94);
const pathDepth = TILE_ROWS * TILE_SIZE;

const TILE_COUNT = TILE_ROWS * TILE_COLUMNS;
const tileInstMat = new THREE.MeshLambertMaterial({
  emissive: 0xffffff,
  emissiveIntensity: 0,
  transparent: true,
});
const tileAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(TILE_COUNT), 1);
tileInstMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <color_pars_vertex>",
    "attribute float aAlpha;\nvarying float vInstAlpha;\n#include <color_pars_vertex>"
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <color_vertex>",
    "#include <color_vertex>\nvInstAlpha = aAlpha;"
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_pars_fragment>",
    "varying float vInstAlpha;\n#include <color_pars_fragment>"
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    "#include <color_fragment>\ndiffuseColor.a *= vInstAlpha;"
  );
};
const tileInstancedMesh = new THREE.InstancedMesh(tileGeom, tileInstMat, TILE_COUNT);
tileInstancedMesh.geometry.setAttribute("aAlpha", tileAlphaAttr);
tileInstancedMesh.frustumCulled = false;
scene.add(tileInstancedMesh);

const _tMat4 = new THREE.Matrix4();
const _tVec = new THREE.Vector3();
const _tQuat = new THREE.Quaternion();
const _tScl = new THREE.Vector3(1, 1, 1);
const _axisX = new THREE.Vector3(1, 0, 0);
const _tColor = new THREE.Color();

const monoPalInit = themePalettes[0];
for (let row = 0; row < TILE_ROWS; row += 1) {
  for (let col = 0; col < TILE_COLUMNS; col += 1) {
    const pi = (row + col + Math.floor(Math.random() * 2)) % 5;
    const z = PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE;
    const mesh = new THREE.Mesh(
      tileGeom,
      new THREE.MeshLambertMaterial({
        color: monoPalInit.tilePalette[pi],
        emissive: 0xffffff,
        emissiveIntensity: 0,
      })
    );
    const x = (col - (TILE_COLUMNS - 1) / 2) * TILE_SIZE;
    mesh.position.set(x, -0.35, z);
    mesh.userData = {
      bobOffset: Math.random() * Math.PI * 2,
      bobAmount: 0.06 + Math.random() * 0.06,
      waveLift: 0,
      crumbleFallY: 0,
      crumbleFallSpeed: 0,
      crumbleTiltDir: 0,
      paletteIndex: pi,
      themeBlend: 1,
      displayThemeIndex: 0,
      emissiveIntensity: 0,
    };
    scene.add(mesh);
    tiles.push(mesh);
  }
}

function syncTileInstances() {
  const alphaArr = tileAlphaAttr.array;
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = tiles[i];
    _tVec.set(t.position.x, t.position.y, t.position.z);
    _tQuat.setFromAxisAngle(_axisX, t.rotation.x);
    if (!t.visible) {
      _tScl.set(0, 0, 0);
    } else {
      _tScl.set(1, 1, 1);
    }
    _tMat4.compose(_tVec, _tQuat, _tScl);
    tileInstancedMesh.setMatrixAt(i, _tMat4);
    const c = t.material.color;
    const ei = t.userData.emissiveIntensity || 0;
    _tColor.setRGB(
      Math.min(1, c.r + ei),
      Math.min(1, c.g + ei),
      Math.min(1, c.b + ei)
    );
    tileInstancedMesh.setColorAt(i, _tColor);
    alphaArr[i] = t.material.opacity;
  }
  tileInstancedMesh.instanceMatrix.needsUpdate = true;
  tileInstancedMesh.instanceColor.needsUpdate = true;
  tileAlphaAttr.needsUpdate = true;
}

const sideTerracePalette = [0x2a1c0e, 0x3a2818, 0x4d3622, 0x5a4230, 0x33220f];
const sideTerraceGeom = new THREE.BoxGeometry(1.94, SIDE_TERRACE_BLOCK_HEIGHT, 1.94);
const TERRACE_COUNT = TILE_ROWS * 2 * SIDE_TERRACE_ROWS;
const terrInstMat = new THREE.MeshLambertMaterial({
  emissive: 0xffffff,
  emissiveIntensity: 0,
  transparent: true,
});
const terrAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(TERRACE_COUNT), 1);
terrInstMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <color_pars_vertex>",
    "attribute float aAlpha;\nvarying float vInstAlpha;\n#include <color_pars_vertex>"
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <color_vertex>",
    "#include <color_vertex>\nvInstAlpha = aAlpha;"
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_pars_fragment>",
    "varying float vInstAlpha;\n#include <color_pars_fragment>"
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    "#include <color_fragment>\ndiffuseColor.a *= vInstAlpha;"
  );
};
const terrInstancedMesh = new THREE.InstancedMesh(sideTerraceGeom, terrInstMat, TERRACE_COUNT);
terrInstancedMesh.geometry.setAttribute("aAlpha", terrAlphaAttr);
terrInstancedMesh.frustumCulled = false;
scene.add(terrInstancedMesh);

for (let row = 0; row < TILE_ROWS; row += 1) {
  const z = PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE;
  for (const side of [-1, 1]) {
    for (let rowIndex = 0; rowIndex < SIDE_TERRACE_ROWS; rowIndex += 1) {
      const xJitter = randomRange(-0.08, 0.08);
      const topY = getSideTerraceTopY(z, rowIndex);
      const pi = (row + rowIndex + (side > 0 ? 1 : 0)) % 5;
      const mesh = new THREE.Mesh(
        sideTerraceGeom,
        new THREE.MeshLambertMaterial({
          color: monoPalInit.terracePalette[pi],
          emissive: 0xffffff,
          emissiveIntensity: 0,
        })
      );
      mesh.position.set(
        getSideTerraceX(side, rowIndex, xJitter),
        topY - SIDE_TERRACE_BLOCK_HEIGHT * 0.5,
        z
      );
      mesh.userData = {
        side,
        rowIndex,
        xJitter,
        bobOffset: Math.random() * Math.PI * 2,
        bobAmount: 0.05 + Math.random() * 0.08,
        waveLift: 0,
        crumbleFallY: 0,
        crumbleFallSpeed: 0,
        crumbleTiltDir: 0,
        paletteIndex: pi,
        themeBlend: 1,
        displayThemeIndex: 0,
        emissiveIntensity: 0,
      };
      scene.add(mesh);
      sideTerraces.push(mesh);
    }
  }
}

function syncTerraceInstances() {
  const alphaArr = terrAlphaAttr.array;
  for (let i = 0; i < sideTerraces.length; i++) {
    const t = sideTerraces[i];
    _tVec.set(t.position.x, t.position.y, t.position.z);
    _tQuat.setFromAxisAngle(_axisX, t.rotation.x);
    if (!t.visible) {
      _tScl.set(0, 0, 0);
    } else {
      _tScl.set(1, 1, 1);
    }
    _tMat4.compose(_tVec, _tQuat, _tScl);
    terrInstancedMesh.setMatrixAt(i, _tMat4);
    const c = t.material.color;
    const ei = t.userData.emissiveIntensity || 0;
    _tColor.setRGB(
      Math.min(1, c.r + ei),
      Math.min(1, c.g + ei),
      Math.min(1, c.b + ei)
    );
    terrInstancedMesh.setColorAt(i, _tColor);
    alphaArr[i] = t.material.opacity;
  }
  terrInstancedMesh.instanceMatrix.needsUpdate = true;
  terrInstancedMesh.instanceColor.needsUpdate = true;
  terrAlphaAttr.needsUpdate = true;
}

const groundBedDepth = pathDepth + 18;
const groundBedCycleDepth = groundBedDepth * 3;
const groundBedWidth = PATH_HALF_WIDTH * 2 + SIDE_TERRACE_ROWS * TILE_SIZE * 2.65;
const groundBeds = [];
for (let i = 0; i < 3; i += 1) {
  const bedZ = PLAYER_BASE_Z - pathDepth * 0.5 + (i - 1) * groundBedDepth;
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(groundBedWidth, 2.6, groundBedDepth),
    new THREE.MeshLambertMaterial({
      color: monoPalInit.groundBedColor,
    })
  );
  bed.position.set(0, -1.82, bedZ);
  bed.userData = { displayThemeIndex: 0, themeBlend: 1 };
  scene.add(bed);
  groundBeds.push(bed);
}

const stoneBaseGeo = new THREE.CylinderGeometry(0.82, 0.88, 0.28, 8);
const stoneMidGeo = new THREE.CylinderGeometry(0.7, 0.76, 0.26, 8);
const stoneTopGeo = new THREE.CylinderGeometry(0.62, 0.68, 0.22, 8);

const stoneBaseMat = new THREE.MeshLambertMaterial({
  color: 0xd4b896,
  emissive: 0xa8845a,
  emissiveIntensity: 0.32,
});
const stoneMidMat = new THREE.MeshLambertMaterial({
  color: 0xe8d5b8,
  emissive: 0xb8956a,
  emissiveIntensity: 0.34,
});
const stoneTopMat = new THREE.MeshLambertMaterial({
  color: 0xf5e6d3,
  emissive: 0xc9a87c,
  emissiveIntensity: 0.38,
});
const stepBlockMaterials = [stoneBaseMat, stoneMidMat, stoneTopMat];
const stepBlockEmissiveBase = [
  new THREE.Color(0xa8845a),
  new THREE.Color(0xb8956a),
  new THREE.Color(0xc9a87c),
];
const stepBlockEmissiveFlash = new THREE.Color(0xffffff);

const STONE_BASE_Y = 0;
const STONE_MID_Y = 0.27;
const STONE_TOP_Y = 0.50;
const STONE_TOTAL_HEIGHT = 0.72;

function createStepBlockGroup() {
  const group = new THREE.Group();
  const baseMat = stoneBaseMat.clone();
  const midMat = stoneMidMat.clone();
  const topMat = stoneTopMat.clone();
  const base = new THREE.Mesh(stoneBaseGeo, baseMat);
  base.position.y = STONE_BASE_Y;
  base.userData.restY = STONE_BASE_Y;
  group.add(base);
  const mid = new THREE.Mesh(stoneMidGeo, midMat);
  mid.position.y = STONE_MID_Y;
  mid.userData.restY = STONE_MID_Y;
  group.add(mid);
  const top = new THREE.Mesh(stoneTopGeo, topMat);
  top.position.y = STONE_TOP_Y;
  top.userData.restY = STONE_TOP_Y;
  group.add(top);
  group.userData.mats = [baseMat, midMat, topMat];
  group.userData.emissiveBases = [
    new THREE.Color().copy(stepBlockEmissiveBase[0]),
    new THREE.Color().copy(stepBlockEmissiveBase[1]),
    new THREE.Color().copy(stepBlockEmissiveBase[2]),
  ];
  return group;
}

function applyStepBlockLayout(block, stepIndex) {
  const y = getStepBlockY(stepIndex);
  block.position.set(0, y, getBlockZ(stepIndex));
  block.rotation.set(0, 0, 0);
  block.userData.baseY = y;
  block.userData.waveOffset = stepIndex * 0.35;
  block.userData.stepIndex = stepIndex;
  block.userData.waveLift = 0;
  block.userData.crumbleShakeX = 0;
  block.userData.crumbleShakeZ = 0;
  block.userData.displayThemeIndex = 0;
  block.userData.themeBlend = 1;
  const monoPal = themePalettes[0];
  const monoStones = [monoPal.stoneBase, monoPal.stoneMid, monoPal.stoneTop];
  if (block.userData.mats) {
    for (let mi = 0; mi < 3; mi++) {
      block.userData.mats[mi].color.copy(monoStones[mi]);
      block.userData.emissiveBases[mi].copy(monoPal.stoneEmissiveBase[mi]);
      block.userData.mats[mi].emissive.copy(monoPal.stoneEmissiveBase[mi]);
    }
  }
  for (const child of block.children) {
    child.position.y = child.userData.restY;
  }
}

for (let index = 0; index < STEP_BLOCK_COUNT; index += 1) {
  const block = createStepBlockGroup();
  applyStepBlockLayout(block, index);
  scene.add(block);
  stepBlocks.push(block);
}

function resetCrumbleState() {
  state.player.idleTimer = 0;
  state.player.crumbleProgress = 0;
  state.player.crumbleWarnFired = false;
  state.player.crumbleFallY_self = 0;
  state.player.crumbleFallSpeed_self = 0;
  state.player.crumbleFallY_bunny = 0;
  state.player.crumbleFallSpeed_bunny = 0;
  state.player.crumbleCascadeReachedSelf = false;
  state.player.crumbleSelfTimer = 0;
  state.player.crumbleSelfDustFired = false;
  state.player.crumbleTileElapsed = 0;
  state.player.crumbleOrbFallY = 0;
  state.player.crumbleOrbFallSpeed = 0;
  for (const hazard of hazards) {
    hazard.visible = true;
    const d = hazard.userData;
    if (d.orb) {
      d.orb.material.transparent = false;
      d.orb.material.opacity = 1;
    }
    if (d.ring) {
      d.ring.position.y = -0.45;
    }
    if (d.orbExtras) {
      for (const extra of d.orbExtras) {
        extra.material.transparent = false;
        extra.material.opacity = 1;
      }
    }
  }
  crumbleDustTimer = 0;
  if (crumbleVignette) crumbleVignette.style.opacity = "0";
  for (const block of stepBlocks) {
    block.visible = true;
    for (const child of block.children) {
      child.position.y = child.userData.restY;
      child.rotation.x = 0;
      child.material.transparent = false;
      child.material.opacity = 1;
    }
  }
  for (const tile of tiles) {
    tile.userData.crumbleFallY = 0;
    tile.userData.crumbleFallSpeed = 0;
    tile.userData.crumbleTiltDir = 0;
    tile.material.transparent = false;
    tile.material.opacity = 1;
    tile.rotation.x = 0;
    tile.visible = true;
  }
  for (const terrace of sideTerraces) {
    terrace.userData.crumbleFallY = 0;
    terrace.userData.crumbleFallSpeed = 0;
    terrace.userData.crumbleTiltDir = 0;
    terrace.material.transparent = false;
    terrace.material.opacity = 1;
    terrace.rotation.x = 0;
    terrace.visible = true;
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

const flowerStemGeometry = new THREE.CylinderGeometry(0.03, 0.05, 0.26, 5);
const flowerPetalGeometry = new THREE.ConeGeometry(0.11, 0.24, 4);
const flowerCenterGeometry = new THREE.IcosahedronGeometry(0.075, 0);
const grassBladeGeometry = new THREE.ConeGeometry(0.07, 0.34, 4);
const flowerStemMaterial = new THREE.MeshLambertMaterial({
  color: 0x6b5a42,
});
const flowerCenterMaterial = new THREE.MeshLambertMaterial({
  color: 0xf5e6d3,
  emissive: 0xd4b896,
  emissiveIntensity: 0.22,
});
const flowerPetalMaterials = [
  new THREE.MeshLambertMaterial({ color: 0xc9a87c }),
  new THREE.MeshLambertMaterial({ color: 0xe8d5b8 }),
  new THREE.MeshLambertMaterial({ color: 0x8b6f4e }),
  new THREE.MeshLambertMaterial({ color: 0xf0e0cc }),
];
const grassMaterials = [
  new THREE.MeshLambertMaterial({ color: 0x7a6548 }),
  new THREE.MeshLambertMaterial({ color: 0x8d7a5c }),
  new THREE.MeshLambertMaterial({ color: 0x9e8b6e }),
];

function createFlowerPatch() {
  const patch = new THREE.Group();
  const stem = new THREE.Mesh(flowerStemGeometry, flowerStemMaterial);
  stem.position.y = 0.13;
  patch.add(stem);

  const petalMat =
    flowerPetalMaterials[Math.floor(Math.random() * flowerPetalMaterials.length)];
  const petalCount = 5 + Math.floor(Math.random() * 2);
  for (let i = 0; i < petalCount; i += 1) {
    const petal = new THREE.Mesh(flowerPetalGeometry, petalMat);
    const angle = (Math.PI * 2 * i) / petalCount;
    petal.position.set(Math.cos(angle) * 0.12, 0.28, Math.sin(angle) * 0.12);
    petal.rotation.y = angle;
    petal.rotation.z = Math.PI * 0.5;
    patch.add(petal);
  }

  const center = new THREE.Mesh(flowerCenterGeometry, flowerCenterMaterial);
  center.position.y = 0.28;
  patch.add(center);

  patch.scale.setScalar(randomRange(0.68, 1.08));
  patch.rotation.y = randomRange(0, Math.PI * 2);
  patch.userData = {
    swayOffset: Math.random() * Math.PI * 2,
    swayAmount: randomRange(0.55, 0.95),
    kind: "flower",
  };
  return patch;
}

function createGrassTuft() {
  const tuft = new THREE.Group();
  const bladeCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < bladeCount; i += 1) {
    const mat = grassMaterials[Math.floor(Math.random() * grassMaterials.length)];
    const blade = new THREE.Mesh(grassBladeGeometry, mat);
    blade.position.y = 0.17;
    blade.rotation.y = (Math.PI * 2 * i) / bladeCount + randomRange(-0.2, 0.2);
    blade.rotation.z = randomRange(-0.42, 0.42);
    blade.scale.y = randomRange(0.82, 1.2);
    tuft.add(blade);
  }
  tuft.scale.setScalar(randomRange(0.75, 1.22));
  tuft.rotation.y = randomRange(0, Math.PI * 2);
  tuft.userData = {
    swayOffset: Math.random() * Math.PI * 2,
    swayAmount: randomRange(0.4, 0.8),
    kind: "grass",
  };
  return tuft;
}

function decorateTileWithFlora(tile, topY, flowerChance, grassChance) {
  if (Math.random() < flowerChance) {
    const flower = createFlowerPatch();
    flower.position.set(randomRange(-0.55, 0.55), topY + 0.02, randomRange(-0.55, 0.55));
    tile.add(flower);
    flowerDecor.push(flower);
  }
  if (Math.random() < grassChance) {
    const tuft = createGrassTuft();
    tuft.position.set(randomRange(-0.58, 0.58), topY + 0.01, randomRange(-0.58, 0.58));
    tile.add(tuft);
    flowerDecor.push(tuft);
  }
}

function createTree(side, rowIndex = 0) {
  const root = new THREE.Group();
  const xJitter = randomRange(-0.25, 0.25);
  const x = getSideTerraceX(side, rowIndex, xJitter);
  const z = randomRange(-128, 14);
  const treeScale = randomRange(0.85, 1.42);
  const baseYOffset = 0.42 * treeScale;
  root.position.set(x, getSideTerraceTopY(z, rowIndex) + baseYOffset, z);

  const initPal = themePalettes[0];
  const trunkMat = new THREE.MeshLambertMaterial({
    color: initPal.treeTrunk.clone(),
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 1.6, 7),
    trunkMat
  );
  trunk.position.y = 0.4;
  root.add(trunk);

  const leafBottomMat = new THREE.MeshLambertMaterial({
    color: initPal.treeLeafBottom.clone(),
    emissive: initPal.treeLeafBottom.clone(),
    emissiveIntensity: 0.08,
  });
  const coneBottom = new THREE.Mesh(
    new THREE.ConeGeometry(randomRange(1.4, 2.1), randomRange(2.5, 3.2), 5),
    leafBottomMat
  );
  coneBottom.position.y = 1.8;
  root.add(coneBottom);

  const leafTopMat = new THREE.MeshLambertMaterial({
    color: initPal.treeLeafTop.clone(),
    emissive: initPal.treeLeafTop.clone(),
    emissiveIntensity: 0.06,
  });
  const coneTop = new THREE.Mesh(
    new THREE.ConeGeometry(randomRange(1.0, 1.6), randomRange(1.6, 2.1), 5),
    leafTopMat
  );
  coneTop.position.y = 2.85;
  root.add(coneTop);

  root.scale.setScalar(treeScale);
  root.userData = {
    recycleDepth: SCENERY_POOL_DEPTH,
    swayOffset: Math.random() * Math.PI * 2,
    side,
    rowIndex,
    xJitter,
    baseYOffset,
    kind: "tree",
    trunkMat,
    leafTopMat,
    leafBottomMat,
    displayThemeIndex: 0,
    themeBlend: 1,
  };

  scene.add(root);
  scenery.push(root);
}

function createBush(side) {
  const rowIndex = Math.floor(Math.random() * SIDE_TERRACE_ROWS);
  const xJitter = randomRange(-0.26, 0.26);
  const z = randomRange(-128, 14);
  const initPal = themePalettes[0];
  const bushMat = new THREE.MeshLambertMaterial({
    color: initPal.bushColor.clone(),
    emissive: initPal.bushColor.clone(),
    emissiveIntensity: 0.06,
  });
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(randomRange(0.45, 0.78)),
    bushMat
  );
  const scale = randomRange(0.82, 1.28);
  mesh.scale.setScalar(scale);
  mesh.position.set(
    getSideTerraceX(side, rowIndex, xJitter),
    getSideTerraceTopY(z, rowIndex) + 0.1 + scale * 0.08,
    z
  );
  mesh.userData = {
    recycleDepth: SCENERY_POOL_DEPTH,
    swayOffset: Math.random() * Math.PI * 2,
    side,
    rowIndex,
    xJitter,
    baseYOffset: 0.1 + scale * 0.08,
    kind: "bush",
    bushMat,
    displayThemeIndex: 0,
    themeBlend: 1,
  };
  scene.add(mesh);
  scenery.push(mesh);
}

for (let i = 0; i < (isMobile ? 10 : 28); i += 1) {
  for (let rowIndex = 0; rowIndex < TREE_ROW_COUNT_PER_SIDE; rowIndex += 1) {
    createTree(-1, rowIndex);
    createTree(1, rowIndex);
  }
}
for (let i = 0; i < (isMobile ? 14 : 36); i += 1) {
  createBush(-1);
  createBush(1);
}

for (const tile of tiles) {
  decorateTileWithFlora(tile, 0.36, isMobile ? 0.06 : 0.34, isMobile ? 0.05 : 0.26);
}
for (const tile of sideTerraces) {
  decorateTileWithFlora(tile, SIDE_TERRACE_BLOCK_HEIGHT * 0.5, isMobile ? 0.04 : 0.24, isMobile ? 0.06 : 0.34);
}

const emptyGeom = new THREE.BufferGeometry();
for (const tile of tiles) {
  tile.geometry = emptyGeom;
}
for (const terrace of sideTerraces) {
  terrace.geometry = emptyGeom;
}
syncTileInstances();
syncTerraceInstances();

const bunny = new THREE.Group();

// --- Materials ---
const furMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  emissive: 0x0a0a0a,
  emissiveIntensity: 0.05,
  roughness: 0.75,
  metalness: 0.1,
});

const bellyMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x222222,
  emissiveIntensity: 0.06,
  roughness: 0.85,
});

const pinkMat = new THREE.MeshStandardMaterial({
  color: 0xd0d0d0,
  emissive: 0x888888,
  emissiveIntensity: 0.2,
  roughness: 0.4,
});

const headMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  emissive: 0x111111,
  emissiveIntensity: 0.05,
  roughness: 0.75,
  metalness: 0.1,
});

const earMat = new THREE.MeshStandardMaterial({
  color: 0x383838,
  emissive: 0x161616,
  emissiveIntensity: 0.06,
  roughness: 0.72,
  metalness: 0.08,
});

const eyeMat = new THREE.MeshStandardMaterial({
  color: 0x050505,
  roughness: 0.1,
  metalness: 0.8,
});

const irisMat = new THREE.MeshStandardMaterial({
  color: 0xd4a04a,
  emissive: 0xb8860b,
  emissiveIntensity: 0.5,
  roughness: 0.2,
});



// --- Body ---
// Pear shaped body
const bodyGroup = new THREE.Group();
bunny.add(bodyGroup);

const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 24), furMat);
lowerBody.scale.set(1.0, 0.95, 1.05);
lowerBody.position.set(0, 0.7, 0);
bodyGroup.add(lowerBody);

const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24), furMat);
upperBody.scale.set(1.0, 0.9, 1.0);
upperBody.position.set(0, 1.2, 0.05);
bodyGroup.add(upperBody);

// Belly white patch
const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 24), bellyMat);
bellyPatch.scale.set(0.85, 0.9, 0.3);
bellyPatch.position.set(0, 0.75, -0.72);
bodyGroup.add(bellyPatch);

// --- Head ---
const headGroup = new THREE.Group();
headGroup.position.set(0, 1.7, -0.05);
bunny.add(headGroup);

const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 24, 24), headMat);
headMesh.scale.set(1.15, 0.9, 1.05);
headGroup.add(headMesh);

const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), bellyMat);
muzzle.scale.set(1.25, 0.8, 0.95);
muzzle.position.set(0, -0.15, -0.68);
headGroup.add(muzzle);

const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pinkMat);
nose.scale.set(1.2, 0.7, 0.8);
nose.position.set(0, 0.02, -1.04);
headGroup.add(nose);

// Cheeks
const cheekGeo = new THREE.SphereGeometry(0.18, 10, 10);
const cheekMatColor = new THREE.MeshStandardMaterial({
  color: 0x555555,
  emissive: 0x333333,
  emissiveIntensity: 0.1,
  transparent: true,
  opacity: 0.35,
  roughness: 1.0
});
const cheekL = new THREE.Mesh(cheekGeo, cheekMatColor);
cheekL.scale.set(1.1, 0.65, 0.4);
cheekL.position.set(-0.58, -0.1, -0.7);
headGroup.add(cheekL);
const cheekR = cheekL.clone();
cheekR.position.x = 0.58;
headGroup.add(cheekR);

// Eyes
const buildEye = (side) => {
  const eyeGroup = new THREE.Group();

  // Outer pupil / backing
  const baseEye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), eyeMat);
  baseEye.scale.set(0.85, 1, 0.35);
  eyeGroup.add(baseEye);

  // Iris color
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), irisMat);
  iris.scale.set(0.85, 1, 0.35);
  iris.position.set(0, -0.02, -0.04);
  eyeGroup.add(iris);

  // Huge cute highlight
  const shine1 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), bellyMat);
  shine1.position.set(-0.045, 0.06, -0.08);
  eyeGroup.add(shine1);

  // Small secondary highlight
  const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), bellyMat);
  shine2.position.set(0.035, -0.05, -0.08);
  eyeGroup.add(shine2);

  eyeGroup.position.set(side * 0.38, 0.18, -0.76);
  // Tilt slightly towards center
  eyeGroup.rotation.y = side * -0.15;
  eyeGroup.rotation.z = side * 0.08;
  eyeGroup.rotation.x = 0.05;
  headGroup.add(eyeGroup);
};
buildEye(-1);
buildEye(1);

// --- Ears (Animated, SkinnedMesh with bone chain) ---
function buildSkinnedEar(radiusTop, radiusBottom, height, flatness, segments, material) {
  const radialSegs = 10;
  const geo = new THREE.CapsuleGeometry(radiusBottom, height, radialSegs, segments);
  geo.scale(1, 1, flatness);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + height * 0.5 + radiusBottom) / (height + radiusBottom * 2), 0, 1);
    const taper = THREE.MathUtils.lerp(1, radiusTop / radiusBottom, t);
    pos.setX(i, pos.getX(i) * taper);
    pos.setZ(i, pos.getZ(i) * taper);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const skinIndices = [];
  const skinWeights = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + height * 0.5 + radiusBottom) / (height + radiusBottom * 2), 0, 1);
    if (t < 0.45) {
      const w = t / 0.45;
      skinIndices.push(0, 1, 0, 0);
      skinWeights.push(1 - w, w, 0, 0);
    } else {
      const w = (t - 0.45) / 0.55;
      skinIndices.push(1, 2, 0, 0);
      skinWeights.push(1 - w, w, 0, 0);
    }
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  const bone0 = new THREE.Bone();
  const bone1 = new THREE.Bone();
  const bone2 = new THREE.Bone();
  bone0.position.set(0, -height * 0.5, 0);
  bone1.position.set(0, height * 0.45, 0);
  bone2.position.set(0, height * 0.55, 0);
  bone0.add(bone1);
  bone1.add(bone2);
  const skeleton = new THREE.Skeleton([bone0, bone1, bone2]);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bone0);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  return { mesh, skeleton, bones: [bone0, bone1, bone2] };
}

function createEar(side) {
  const earGroup = new THREE.Group();
  const baseX = side * 0.35;
  const baseY = 2.4;
  const baseZ = -0.05;
  const baseRotZ = side * -0.4;
  const baseRotX = -0.15;
  earGroup.position.set(baseX, baseY, baseZ);
  earGroup.rotation.z = baseRotZ;
  earGroup.rotation.x = baseRotX;

  const EAR_HEIGHT = 0.95;
  const outer = buildSkinnedEar(0.15, 0.21, EAR_HEIGHT, 0.4, 8, earMat);
  outer.mesh.position.y = EAR_HEIGHT * 0.5;
  earGroup.add(outer.mesh);

  const inner = buildSkinnedEar(0.1, 0.14, EAR_HEIGHT * 0.82, 0.25, 8, pinkMat);
  inner.mesh.position.set(0, EAR_HEIGHT * 0.5, -0.04);
  earGroup.add(inner.mesh);

  outer.bones[2].rotation.x = -0.22;
  inner.bones[2].rotation.x = -0.22;

  bunny.add(earGroup);
  earGroup.userData = {
    side, baseX, baseY, baseZ, baseRotX, baseRotZ,
    velX: 0, velZ: 0,
    swayPhase: side * 1.2,
    outerBones: outer.bones,
    innerBones: inner.bones,
    midVelX: 0,
    tipVelX: 0,
  };
  bunnyEars.push(earGroup);
}
createEar(-1);
createEar(1);

// --- Limbs & Tail ---
// Arms
const buildArm = (side) => {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 8, 8), furMat);
  arm.position.set(side * 0.58, 1.05, -0.2);
  arm.rotation.z = side * 0.45;
  arm.rotation.x = -0.4;

  const paw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), bellyMat);
  paw.position.set(0, -0.25, -0.05);
  arm.add(paw);

  bunny.add(arm);
};
buildArm(-1);
buildArm(1);

// Legs & Feet
const buildLeg = (side) => {
  // Thigh
  const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), furMat);
  thigh.scale.set(0.85, 1.15, 1.05);
  thigh.position.set(side * 0.52, 0.5, 0.15);
  thigh.rotation.z = side * 0.18;
  bunny.add(thigh);

  // Foot
  const footGroup = new THREE.Group();
  footGroup.position.set(side * 0.48, 0.18, -0.28);

  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 8, 8), bellyMat);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(1, 1, 0.65);
  footGroup.add(foot);

  // Cute Toe Beans!
  const beanMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 });
  const mainPad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), beanMat);
  mainPad.scale.set(1, 0.4, 1);
  mainPad.position.set(0, -0.09, 0.06);
  footGroup.add(mainPad);

  [-0.1, 0, 0.1].forEach((tx) => {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), beanMat);
    toe.scale.set(1, 0.5, 1);
    toe.position.set(tx, -0.07, -0.16);
    footGroup.add(toe);
  });

  bunny.add(footGroup);
};
buildLeg(-1);
buildLeg(1);

// Tail (Fluffy cloud-like tail composed of multiple spheres)
const tailGroup = new THREE.Group();
tailGroup.position.set(0, 0.55, 0.7);
const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), bellyMat);
tailGroup.add(t1);
const t2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bellyMat);
t2.position.set(0.14, 0.12, 0.06);
tailGroup.add(t2);
const t3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bellyMat);
t3.position.set(-0.14, 0.12, 0.06);
tailGroup.add(t3);
const t4 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bellyMat);
t4.position.set(0, 0.18, 0.14);
tailGroup.add(t4);
bunny.add(tailGroup);


bunny.position.set(0, getStepBlockY(0) + PLAYER_BLOCK_OFFSET_Y, PLAYER_BASE_Z);
scene.add(bunny);
bunny.visible = false;

function updateEarTuck(targetTuck, dt) {
  const lerpAmount = 1 - Math.exp(-dt * 14);
  const elapsed = state.elapsed;
  const BASE_SPRING = 18;
  const BASE_DAMP = 4.5;
  const MID_SPRING = 12;
  const MID_DAMP = 3.5;
  const TIP_SPRING = 8;
  const TIP_DAMP = 2.8;
  const WIND_AMP_X = 0.06;
  const WIND_AMP_Z = 0.04;
  const WIND_FREQ = 1.8;

  for (const ear of bunnyEars) {
    const ud = ear.userData;
    const { side, baseX, baseY, baseZ, baseRotX, baseRotZ, outerBones, innerBones } = ud;

    const windX = Math.sin(elapsed * WIND_FREQ + ud.swayPhase) * WIND_AMP_X
      + Math.sin(elapsed * WIND_FREQ * 2.3 + ud.swayPhase * 0.7) * WIND_AMP_X * 0.4;
    const windZ = Math.cos(elapsed * WIND_FREQ * 0.9 + ud.swayPhase * 1.5) * WIND_AMP_Z;

    const restX = baseX * (1 - targetTuck * 0.48) + windX * (1 - targetTuck * 0.6);
    const restY = baseY - targetTuck * 0.22;
    const restZ = baseZ + targetTuck * 0.22 + windZ * (1 - targetTuck * 0.6);
    const restRotX = baseRotX - targetTuck * 0.64
      + Math.sin(elapsed * WIND_FREQ * 1.1 + ud.swayPhase) * 0.08 * (1 - targetTuck * 0.7);
    const restRotZ = baseRotZ * (1 - targetTuck * 0.72) - side * targetTuck * 0.06
      + windX * 0.6 * (1 - targetTuck * 0.7);

    const dx = restX - ear.position.x;
    const dz = restZ - ear.position.z;
    ud.velX += dx * BASE_SPRING * dt;
    ud.velZ += dz * BASE_SPRING * dt;
    ud.velX *= Math.exp(-BASE_DAMP * dt);
    ud.velZ *= Math.exp(-BASE_DAMP * dt);
    ud.velX = THREE.MathUtils.clamp(ud.velX, -3, 3);
    ud.velZ = THREE.MathUtils.clamp(ud.velZ, -3, 3);
    ear.position.x += ud.velX * dt;
    ear.position.z += ud.velZ * dt;
    ear.position.y = THREE.MathUtils.lerp(ear.position.y, restY, lerpAmount);
    ear.rotation.x = THREE.MathUtils.lerp(ear.rotation.x, restRotX, lerpAmount);
    ear.rotation.z = THREE.MathUtils.lerp(ear.rotation.z, restRotZ, lerpAmount);

    const midWindX = Math.sin(elapsed * WIND_FREQ * 1.2 + ud.swayPhase * 1.1) * 0.08;
    const midTarget = -0.06 - targetTuck * 0.2 + midWindX * (1 - targetTuck * 0.5);
    const midDx = midTarget - outerBones[1].rotation.x;
    ud.midVelX += midDx * MID_SPRING * dt;
    ud.midVelX *= Math.exp(-MID_DAMP * dt);
    ud.midVelX = THREE.MathUtils.clamp(ud.midVelX, -4, 4);
    outerBones[1].rotation.x += ud.midVelX * dt;
    outerBones[1].rotation.x = THREE.MathUtils.clamp(outerBones[1].rotation.x, -0.5, 0.25);
    innerBones[1].rotation.x = outerBones[1].rotation.x;

    const tipWindX = Math.sin(elapsed * WIND_FREQ * 1.5 + ud.swayPhase * 1.4) * 0.14;
    const tipTarget = -0.22 - targetTuck * 0.35 + tipWindX * (1 - targetTuck * 0.5);
    const tipDx = tipTarget - outerBones[2].rotation.x;
    ud.tipVelX += tipDx * TIP_SPRING * dt;
    ud.tipVelX *= Math.exp(-TIP_DAMP * dt);
    ud.tipVelX = THREE.MathUtils.clamp(ud.tipVelX, -5, 5);
    outerBones[2].rotation.x += ud.tipVelX * dt;
    outerBones[2].rotation.x = THREE.MathUtils.clamp(outerBones[2].rotation.x, -0.8, 0.3);
    innerBones[2].rotation.x = outerBones[2].rotation.x;
  }
}

const trailGeometry = new THREE.IcosahedronGeometry(0.27, 1);
const dashTrail = [];
let dashTrailCursor = 0;
for (let i = 0; i < TRAIL_POOL_SIZE; i += 1) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf5e6d3,
    transparent: true,
    opacity: 0,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(trailGeometry, material);
  mesh.visible = false;
  scene.add(mesh);
  dashTrail.push({
    mesh,
    life: 0,
    maxLife: 0,
    velY: 0,
    velZ: 0,
    baseScale: 1,
  });
}

const eggBurstGeometry = new THREE.IcosahedronGeometry(0.18, 0);
const eggBurstParticles = [];
let eggBurstCursor = 0;
for (let i = 0; i < EGG_BURST_POOL_SIZE; i += 1) {
  const material = new THREE.MeshBasicMaterial({
    color: i % 2 === 0 ? 0xf5e6d3 : 0xc9a87c,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(eggBurstGeometry, material);
  mesh.visible = false;
  scene.add(mesh);
  eggBurstParticles.push({
    mesh,
    life: 0,
    maxLife: EGG_BURST_LIFE,
    velX: 0,
    velY: 0,
    velZ: 0,
    baseScale: 0.4,
  });
}

const trailRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.95, 0.17, 10, 30),
  new THREE.MeshBasicMaterial({
    color: 0xf5e6d3,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
);
trailRing.rotation.x = -Math.PI / 2;
trailRing.visible = false;
scene.add(trailRing);

const dashRibbon = new THREE.Mesh(
  new THREE.BoxGeometry(1.65, 0.35, 10),
  new THREE.MeshBasicMaterial({
    color: 0xd4b896,
    transparent: true,
    opacity: 0,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
  })
);
dashRibbon.visible = false;
scene.add(dashRibbon);

const deathShockwave = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.72, 30),
  new THREE.MeshBasicMaterial({
    color: 0xc9a87c,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
);
deathShockwave.rotation.x = -Math.PI / 2;
deathShockwave.visible = false;
scene.add(deathShockwave);

const _bgColor = new THREE.Color();
const _deathFlashColor = new THREE.Color(0x4a3520);

const hazardRockMaterial = new THREE.MeshStandardMaterial({
  color: 0x0d0d0d,
  roughness: 0.82,
});

const hazardOrbMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5e6d3,
  roughness: 0.24,
  metalness: 0.12,
  emissive: 0xd4b896,
  emissiveIntensity: 0.64,
});


const hazardRingMaterial = new THREE.MeshStandardMaterial({
  color: 0xd4a04a,
  emissive: 0xb8860b,
  emissiveIntensity: 0.55,
  roughness: 0.25,
  metalness: 0.7,
});
const hazardRockGeo = new THREE.DodecahedronGeometry(0.93);
const hazardOrbGeo = new THREE.SphereGeometry(0.44, 24, 24);
const hazardOrbExtraGeo = new THREE.SphereGeometry(0.21, 16, 16);
const hazardRingGeo = new THREE.TorusGeometry(0.56, 0.09, 16, 32);

const hazardTempRockWorld = new THREE.Vector3();
const hazardTempOrbWorld = new THREE.Vector3();
const deathParticleOrigin = new THREE.Vector3();

function getSegmentCenterZ(segmentIndex) {
  return getBlockZ(segmentIndex) - STEP_DISTANCE * 0.5;
}

function getSegmentBaseCenterY(segmentIndex) {
  return (
    (getStepBlockY(segmentIndex) + getStepBlockY(segmentIndex + 1)) * 0.5 +
    HAZARD_CENTER_HEIGHT
  );
}

function getHazardRockCount(segmentIndex) {
  const randomIndex = Math.floor(Math.random() * HAZARD_ROCK_COUNT_VARIANTS.length);
  return HAZARD_ROCK_COUNT_VARIANTS[randomIndex];
}

function getRandomOrbMultiplier() {
  return Math.random() < 0.5 ? 2 : 3;
}

function setHazardOrbCount(slot, count, pop = false) {
  const nextCount = THREE.MathUtils.clamp(
    Math.round(count),
    ORB_MULTIPLIER_MIN,
    ORB_MULTIPLIER_MAX
  );
  if (slot.userData.orbCount !== nextCount && pop) {
    slot.userData.orbPopTimer = ORB_MULTIPLIER_POP_TIME;
    sfxMultiplierPop();
  }
  slot.userData.orbCount = nextCount;
  slot.userData.orbDecayTimer =
    nextCount > ORB_MULTIPLIER_MIN ? ORB_MULTIPLIER_DECAY_TIME : 0;
}

function getDifficultySpeedMultiplier() {
  const tier = Math.floor(state.score / DIFFICULTY_ORB_STEP);
  return Math.min(Math.pow(DIFFICULTY_SPEED_FACTOR, tier), DIFFICULTY_SPEED_MAX);
}

function configureHazardSlot(slot, segmentIndex) {
  slot.userData.segmentIndex = segmentIndex;
  slot.userData.phase = Math.random() * Math.PI * 2;
  slot.userData.patternType = "orbit";
  slot.userData.patternDirection = segmentIndex % 2 === 0 ? 1 : -1;
  slot.userData.speed = 2.02 + (segmentIndex % 5) * 0.15;
  slot.userData.radius = HAZARD_ORBIT_RADIUS + ((segmentIndex % 3) - 1) * 0.11;
  slot.userData.depth = HAZARD_ORBIT_DEPTH + (segmentIndex % 2) * 0.08;
  slot.userData.activeRockCount = getHazardRockCount(segmentIndex);
  slot.userData.pairFollowGap = randomRange(
    HAZARD_PAIR_FOLLOW_GAP_MIN,
    HAZARD_PAIR_FOLLOW_GAP_MAX
  );
  if (slot.userData.activeRockCount === 2 && Math.random() > 0.5) {
    slot.userData.patternType = "orbitPairFollow";
  }
  slot.userData.orbSpin = segmentIndex % 2 === 0 ? 1 : -1;
  slot.userData.collected = false;
  slot.userData.orb.visible = true;
  slot.userData.ring.visible = true;
  slot.userData.ring.position.y = -0.45;
  slot.userData.orbScale = 1;
  setHazardOrbCount(slot, 1, false);
  slot.userData.orb.material.emissiveIntensity = slot.userData.orbBaseEmissive;
  for (const extra of slot.userData.orbExtras) {
    extra.visible = false;
    extra.userData.scale = 0.01;
    extra.scale.setScalar(0.01);
  }
  const orbTheme = nextOrbThemeIndex();
  slot.userData.orbThemeIndex = orbTheme;
  const pal = themePalettes[orbTheme];
  slot.userData.orb.material.color.copy(pal.orbColor);
  slot.userData.orb.material.emissive.copy(pal.orbEmissive);
  for (const extra of slot.userData.orbExtras) {
    extra.material.color.copy(pal.orbColor);
    extra.material.emissive.copy(pal.orbEmissive);
  }
}

function createHazardSlot(segmentIndex) {
  const slot = new THREE.Group();
  const rocks = [];
  for (let i = 0; i < HAZARD_ROCK_COUNT; i += 1) {
    const rock = new THREE.Mesh(hazardRockGeo, hazardRockMaterial);
    const radiusScale = 0.86 + Math.random() * 0.14;
    rock.scale.set(1.18 * radiusScale / 0.93, 0.9 * radiusScale / 0.93, 1.02 * radiusScale / 0.93);
    rock.userData.colliderRadius = radiusScale * 1.02;
    rocks.push(rock);
    slot.add(rock);
  }

  const orbMaterial = hazardOrbMaterial.clone();
  const orb = new THREE.Mesh(hazardOrbGeo, orbMaterial);
  orb.position.y = 0.25;
  slot.add(orb);

  const orbExtras = [];
  for (let i = 0; i < 2; i += 1) {
    const extraMaterial = hazardOrbMaterial.clone();
    extraMaterial.emissiveIntensity = 0.44;
    const extraOrb = new THREE.Mesh(hazardOrbExtraGeo, extraMaterial);
    extraOrb.visible = false;
    extraOrb.userData.scale = 0.01;
    extraOrb.scale.setScalar(0.01);
    slot.add(extraOrb);
    orbExtras.push(extraOrb);
  }

  const ringMat = hazardRingMaterial.clone();
  const ring = new THREE.Mesh(hazardRingGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.45;
  slot.add(ring);

  slot.userData = {
    rocks,
    orb,
    orbExtras,
    ring,
    segmentIndex,
    phase: 0,
    speed: 0,
    radius: HAZARD_ORBIT_RADIUS,
    depth: HAZARD_ORBIT_DEPTH,
    patternType: "orbit",
    patternDirection: 1,
    activeRockCount: HAZARD_ROCK_COUNT,
    pairFollowGap: 1,
    orbSpin: 1,
    orbCount: 1,
    orbDecayTimer: 0,
    orbPopTimer: 0,
    orbScale: 1,
    orbBaseEmissive: orbMaterial.emissiveIntensity,
    collected: false,
  };
  configureHazardSlot(slot, segmentIndex);
  slot.position.set(0, getSegmentBaseCenterY(segmentIndex), getSegmentCenterZ(segmentIndex));
  scene.add(slot);
  return slot;
}

for (let i = 0; i < HAZARD_POOL_COUNT; i += 1) {
  const hazard = createHazardSlot(i);
  hazards.push(hazard);
}

function setCanvasSize() {
  const width = shell.clientWidth;
  const height = shell.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setMenu(title, text, buttonText, isGameOver = false) {
  menuTitle.innerHTML = title.split("").map(ch => '<span class="tl">' + ch + "</span>").join("");
  menuText.textContent = text;
  startButton.textContent = buttonText;
  if (isGameOver) {
    menuTitle.classList.add("game-over");
    if (menuKicker) menuKicker.textContent = "BETTER LUCK NEXT TIME";
    if (menuOrbs) menuOrbs.style.display = "none";
  } else {
    menuTitle.classList.remove("game-over");
    if (menuKicker) menuKicker.textContent = "LEAP FORWARD";
    if (menuOrbs) menuOrbs.style.display = "";
  }
  menu.classList.add("visible");
}

function hideMenu() {
  menu.classList.remove("visible");
}

function setHudVisibility(visible) {
  hud.style.opacity = visible ? "1" : "0";
}

function updateHud() {
  hud.textContent = `ORBS ${String(state.score).padStart(2, "0")}`;
}

function getOldestStepBlock() {
  let oldest = stepBlocks[0];
  for (const block of stepBlocks) {
    if (block.userData.stepIndex < oldest.userData.stepIndex) {
      oldest = block;
    }
  }
  return oldest;
}

function getNewestStepBlock() {
  let newest = stepBlocks[0];
  for (const block of stepBlocks) {
    if (block.userData.stepIndex > newest.userData.stepIndex) {
      newest = block;
    }
  }
  return newest;
}

function getOldestHazardSlot() {
  let oldest = hazards[0];
  for (const hazard of hazards) {
    if (hazard.userData.segmentIndex < oldest.userData.segmentIndex) {
      oldest = hazard;
    }
  }
  return oldest;
}

function getNewestHazardSlot() {
  let newest = hazards[0];
  for (const hazard of hazards) {
    if (hazard.userData.segmentIndex > newest.userData.segmentIndex) {
      newest = hazard;
    }
  }
  return newest;
}

function ensureStepBlocksAhead(targetIndex) {
  let newest = getNewestStepBlock();
  while (newest.userData.stepIndex < targetIndex) {
    const oldest = getOldestStepBlock();
    const nextIndex = newest.userData.stepIndex + 1;
    applyStepBlockLayout(oldest, nextIndex);
    newest = oldest;
  }
  state.course.furthestBlock = getNewestStepBlock().userData.stepIndex;
}

function ensureHazardsAhead(targetSegment) {
  let newest = getNewestHazardSlot();
  while (newest.userData.segmentIndex < targetSegment) {
    const oldest = getOldestHazardSlot();
    const nextSegment = newest.userData.segmentIndex + 1;
    configureHazardSlot(oldest, nextSegment);
    newest = oldest;
  }
  state.course.furthestSegment = getNewestHazardSlot().userData.segmentIndex;
}

function ensureCourseAhead(playerBlockIndex) {
  ensureStepBlocksAhead(playerBlockIndex + STEP_BLOCK_COUNT - 6);
  ensureHazardsAhead(playerBlockIndex + HAZARD_POOL_COUNT - 1);
}

function getStepBlock(index) {
  let found = stepBlocks.find((block) => block.userData.stepIndex === index);
  if (found) return found;
  ensureStepBlocksAhead(index);
  found = stepBlocks.find((block) => block.userData.stepIndex === index);
  if (found) return found;
  let nearest = stepBlocks[0];
  let bestDistance = Math.abs(nearest.userData.stepIndex - index);
  for (const block of stepBlocks) {
    const distance = Math.abs(block.userData.stepIndex - index);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = block;
    }
  }
  return nearest;
}

function getHazardSlot(segmentIndex) {
  return hazards.find((hazard) => hazard.userData.segmentIndex === segmentIndex) || null;
}

function getPlayerLaneZ() {
  return bunny.position.z;
}

function getPlayerRenderedZ() {
  return bunny.position.z;
}

function getBlockTopY(index) {
  const block = getStepBlock(index);
  return block.position.y + STONE_TOP_Y + 0.11 + PLAYER_BLOCK_OFFSET_Y;
}

function getBlockPosition(index) {
  const block = getStepBlock(index);
  return block.position;
}

function getCurrentJumpDuration() {
  const startSlowBlend = THREE.MathUtils.clamp(state.elapsed / 4, 0, 1);
  return THREE.MathUtils.lerp(JUMP_DURATION * 1.65, JUMP_DURATION, startSlowBlend);
}

function resetDashEffects() {
  state.effects.dashFlashTimer = 0;
  state.effects.deathFlashTimer = 0;
  state.effects.eggCollectTimer = 0;
  state.effects.stepBlockFlashTimer = 0;
  state.effects.groundWaveTimer = 0;
  state.effects.groundWaveOriginZ = PLAYER_BASE_Z;
  state.effects.groundWaveFront = 0;
  state.effects.groundWaveOpacity = 0;
  state.effects.shakeTimer = 0;
  state.effects.shakePower = 0;
  state.effects.trailEmitTimer = 0;
  state.effects.trailRingTimer = 0;
  state.effects.dashRibbonTimer = 0;
  state.effects.dashRibbonFromZ = PLAYER_BASE_Z;
  state.effects.dashRibbonToZ = PLAYER_BASE_Z;
  trailRing.visible = false;
  dashRibbon.visible = false;
  deathShockwave.visible = false;
  deathShockwave.material.opacity = 0;
  for (const particle of dashTrail) {
    particle.life = 0;
    particle.maxLife = 0;
    particle.mesh.visible = false;
  }
  for (const particle of eggBurstParticles) {
    particle.life = 0;
    particle.mesh.visible = false;
  }
  if (dashFlash) {
    dashFlash.style.opacity = "0";
  }
}

function emitCrumbleDust(origin) {
  const particle = eggBurstParticles[eggBurstCursor];
  eggBurstCursor = (eggBurstCursor + 1) % eggBurstParticles.length;

  const angle = Math.random() * Math.PI * 2;
  const spread = 0.3 + Math.random() * 0.5;
  particle.maxLife = 0.4 + Math.random() * 0.3;
  particle.life = particle.maxLife;
  particle.baseScale = 0.12 + Math.random() * 0.18;
  particle.velX = Math.cos(angle) * spread * 0.6;
  particle.velY = -0.3 - Math.random() * 0.6;
  particle.velZ = Math.sin(angle) * spread * 0.6;
  particle.mesh.position.copy(origin);
  particle.mesh.position.x += (Math.random() - 0.5) * 0.6;
  particle.mesh.position.y += (Math.random() - 0.5) * 0.15;
  particle.mesh.position.z += (Math.random() - 0.5) * 0.6;
  const dustPal = themePalettes[state.themeIndex];
  const dustColors = [dustPal.stoneBase, dustPal.stoneMid, dustPal.stoneTop];
  particle.mesh.material.color.copy(dustColors[Math.floor(Math.random() * 3)]);
  particle.mesh.material.opacity = 0.7;
  particle.mesh.scale.setScalar(particle.baseScale);
  particle.mesh.visible = true;
}

let crumbleDustTimer = 0;
const _dustOrigin = new THREE.Vector3();
const _crumbleWarnColor = new THREE.Color(0x4a2010);

function emitEggBurstParticle(origin) {
  const particle = eggBurstParticles[eggBurstCursor];
  eggBurstCursor = (eggBurstCursor + 1) % eggBurstParticles.length;

  const angle = Math.random() * Math.PI * 2;
  const spread = 0.8 + Math.random() * 0.9;
  particle.maxLife = EGG_BURST_LIFE + Math.random() * 0.2;
  particle.life = particle.maxLife;
  particle.baseScale = 0.26 + Math.random() * 0.34;
  particle.velX = Math.cos(angle) * spread;
  particle.velY = 0.9 + Math.random() * 1.2;
  particle.velZ = Math.sin(angle) * spread;
  particle.mesh.position.copy(origin);
  particle.mesh.position.x += (Math.random() - 0.5) * 0.3;
  particle.mesh.position.y += (Math.random() - 0.5) * 0.2;
  particle.mesh.position.z += (Math.random() - 0.5) * 0.22;
  particle.mesh.material.color.setHex(Math.random() > 0.45 ? 0xf5e6d3 : 0xc9a87c);
  particle.mesh.material.opacity = 0.9;
  particle.mesh.scale.setScalar(particle.baseScale);
  particle.mesh.visible = true;
}

function triggerOrbCollectEffects(hazard, skipSfx = false) {
  state.effects.eggCollectTimer = EGG_COLLECT_FLASH_TIME;
  hazard.userData.orb.getWorldPosition(hazardTempOrbWorld);
  for (let i = 0; i < 20; i += 1) {
    emitEggBurstParticle(hazardTempOrbWorld);
  }
  if (!skipSfx) sfxOrbCollect();
  triggerHaptic("medium");
}

function emitDeathTrailParticle(progress) {
  const spread = 0.2 + progress * 0.38;
  deathParticleOrigin.set(
    bunny.position.x + randomRange(-spread, spread),
    bunny.position.y + randomRange(0.08, 0.88),
    bunny.position.z + randomRange(-0.26, 0.24)
  );
  emitEggBurstParticle(deathParticleOrigin);
  emitTrailParticle(0.18, {
    x: deathParticleOrigin.x + randomRange(-0.08, 0.08),
    y: deathParticleOrigin.y,
    z: deathParticleOrigin.z,
    velY: 0.14 + Math.random() * 0.32,
    velZ: randomRange(-0.16, 0.34),
    scale: 0.44 + Math.random() * 0.32,
    life: 0.22 + Math.random() * 0.16,
    color: Math.random() > 0.5 ? 0xc9a87c : 0xf5e6d3,
  });
}

function triggerDeathBurst(strength = 1) {
  const burstCount = Math.max(8, Math.round(10 + strength * 8));
  for (let i = 0; i < burstCount; i += 1) {
    emitDeathTrailParticle(i / Math.max(1, burstCount - 1));
  }
}

function emitTrailParticle(impulse = 1, custom = null) {
  const particle = dashTrail[dashTrailCursor];
  dashTrailCursor = (dashTrailCursor + 1) % dashTrail.length;

  particle.maxLife = 0.42 + Math.random() * 0.36;
  particle.life = particle.maxLife;
  particle.baseScale = 0.72 + Math.random() * 0.45;
  particle.velY = 0.06 + Math.random() * 0.24;
  particle.velZ = 0.24 + Math.random() * 0.58 + impulse * 0.35;

  particle.mesh.position.set(
    (Math.random() - 0.5) * 0.8,
    0.95 + Math.random() * 0.42,
    bunny.position.z + 0.45 + Math.random() * 2.2
  );
  particle.mesh.material.color.setHex(Math.random() > 0.5 ? 0xf5e6d3 : 0xd4b896);

  if (custom) {
    if (typeof custom.life === "number") {
      particle.maxLife = custom.life;
      particle.life = custom.life;
    }
    if (typeof custom.scale === "number") {
      particle.baseScale = custom.scale;
    }
    if (typeof custom.velY === "number") {
      particle.velY = custom.velY;
    }
    if (typeof custom.velZ === "number") {
      particle.velZ = custom.velZ;
    }
    particle.mesh.position.set(
      typeof custom.x === "number" ? custom.x : particle.mesh.position.x,
      typeof custom.y === "number" ? custom.y : particle.mesh.position.y,
      typeof custom.z === "number" ? custom.z : particle.mesh.position.z
    );
    if (typeof custom.color === "number") {
      particle.mesh.material.color.setHex(custom.color);
    }
  }

  particle.mesh.scale.setScalar(particle.baseScale);
  particle.mesh.material.opacity = 0.75;
  particle.mesh.visible = true;
}

function triggerDashEffects(fromLaneZ, toLaneZ) {
  const lowFpsBlend = state.performance.lowFpsBlend;
  state.effects.dashFlashTimer = DASH_FLASH_TIME;
  state.effects.stepBlockFlashTimer = STEP_BLOCK_FLASH_TIME;
  state.effects.groundWaveTimer = DASH_GROUND_WAVE_TIME;
  state.effects.groundWaveOriginZ = fromLaneZ + 0.6;
  state.effects.groundWaveFront = 0;
  state.effects.groundWaveOpacity = 1;
  state.effects.shakeTimer = DASH_SHAKE_TIME * 1.12;
  state.effects.shakePower = DASH_SHAKE_POWER * 1.18;
  state.effects.trailRingTimer = TRAIL_RING_TIME;
  state.effects.dashRibbonTimer = DASH_RIBBON_TIME;
  state.effects.dashRibbonFromZ = fromLaneZ;
  state.effects.dashRibbonToZ = toLaneZ;
  state.effects.trailEmitTimer = 0;
  const burstBase = isMobile ? 6 : 26;
  const burstCount = Math.max(isMobile ? 3 : 8, Math.round(burstBase - lowFpsBlend * (isMobile ? 3 : 10)));
  for (let i = 0; i < burstCount; i += 1) {
    emitTrailParticle(1.85);
  }
  const segmentBase = isMobile ? 4 : 14;
  const segmentCount = Math.max(isMobile ? 2 : 6, Math.round(segmentBase - lowFpsBlend * (isMobile ? 2 : 4)));
  for (let i = 0; i < segmentCount; i += 1) {
    const t = segmentCount === 1 ? 1 : i / (segmentCount - 1);
    emitTrailParticle(0.32, {
      x: (Math.random() - 0.5) * 0.3,
      y: 0.9 + Math.random() * 0.25,
      z: THREE.MathUtils.lerp(fromLaneZ + 0.7, toLaneZ + 1.05, t),
      velY: 0.04 + Math.random() * 0.07,
      velZ: 0.1 + Math.random() * 0.15,
      scale: 0.9 + Math.random() * 0.42,
      life: 0.48 + Math.random() * 0.26,
      color: i % 2 === 0 ? 0xf5e6d3 : 0xc9a87c,
    });
  }
  trailRing.position.set(0, 0.5, bunny.position.z + 0.9);
  trailRing.scale.setScalar(0.85);
  trailRing.material.opacity = 1;
  trailRing.visible = true;
}

function updateDashTrail(dt) {
  if (state.player.jumpTimer > 0) {
    const emitInterval =
      TRAIL_EMIT_INTERVAL * THREE.MathUtils.lerp(1, 1.8, state.performance.lowFpsBlend);
    state.effects.trailEmitTimer -= dt;
    while (state.effects.trailEmitTimer <= 0) {
      emitTrailParticle(0.8);
      state.effects.trailEmitTimer += emitInterval;
    }
  } else {
    state.effects.trailEmitTimer = 0;
  }

  for (const particle of dashTrail) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    if (particle.life <= 0) {
      particle.life = 0;
      particle.mesh.visible = false;
      continue;
    }

    const ratio = particle.life / particle.maxLife;
    particle.mesh.position.y += particle.velY * dt;
    particle.mesh.position.z += particle.velZ * dt;
    particle.mesh.scale.setScalar(
      particle.baseScale + (1 - ratio) * (0.85 + particle.baseScale * 0.4)
    );
    particle.mesh.material.opacity = Math.max(
      0.14,
      Math.min(0.78, ratio * ratio * 1.1)
    );
  }

  if (state.effects.dashRibbonTimer > 0) {
    state.effects.dashRibbonTimer = Math.max(0, state.effects.dashRibbonTimer - dt);
    const progress = 1 - state.effects.dashRibbonTimer / DASH_RIBBON_TIME;
    const fromZ = state.effects.dashRibbonFromZ;
    const toZ = state.effects.dashRibbonToZ;
    const centerZ = (fromZ + toZ) * 0.5 + 1.1;
    const span = Math.max(4.5, Math.abs(fromZ - toZ) + 2.2);
    dashRibbon.position.set(0, 1.15, centerZ + progress * 0.6);
    dashRibbon.scale.set(1 + progress * 0.35, 1, (span * (1 - progress * 0.24)) / 10);
    dashRibbon.material.opacity = Math.max(0.18, (1 - progress) * 0.8);
    dashRibbon.visible = true;
  } else if (dashRibbon.visible) {
    dashRibbon.visible = false;
  }

  if (state.effects.trailRingTimer > 0) {
    state.effects.trailRingTimer = Math.max(0, state.effects.trailRingTimer - dt);
    const progress = 1 - state.effects.trailRingTimer / TRAIL_RING_TIME;
    trailRing.position.z = bunny.position.z + 1.1 + progress * 1.1;
    trailRing.scale.setScalar(0.85 + progress * 2.1);
    trailRing.material.opacity = Math.max(0.12, (1 - progress) * 0.8);
    trailRing.visible = true;
  } else if (trailRing.visible) {
    trailRing.visible = false;
  }

  for (const particle of eggBurstParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    if (particle.life <= 0) {
      particle.life = 0;
      particle.mesh.visible = false;
      continue;
    }

    const lifeRatio = particle.life / particle.maxLife;
    particle.mesh.position.x += particle.velX * dt;
    particle.mesh.position.y += particle.velY * dt;
    particle.mesh.position.z += particle.velZ * dt;
    particle.velY = Math.max(-0.2, particle.velY - dt * 2.1);
    particle.mesh.scale.setScalar(
      particle.baseScale + (1 - lifeRatio) * (0.4 + particle.baseScale * 0.55)
    );
    particle.mesh.material.opacity = Math.max(0, lifeRatio * 0.9);
  }
}

function resetCourseLayout() {
  for (let i = 0; i < stepBlocks.length; i += 1) {
    applyStepBlockLayout(stepBlocks[i], i);
  }
  for (let i = 0; i < hazards.length; i += 1) {
    configureHazardSlot(hazards[i], i);
  }
  state.course.furthestBlock = STEP_BLOCK_COUNT - 1;
  state.course.furthestSegment = HAZARD_POOL_COUNT - 1;
}

let cloudTransitionActive = false;

function triggerCloudTransition() {
  if (cloudTransitionActive) return;
  if (state.mode !== "home" && state.mode !== "gameover") return;
  cloudTransitionActive = true;
  startLoop();
  cloudVeil.classList.add("covering");
  setTimeout(() => {
    startGame();
    setTimeout(() => {
      cloudVeil.classList.remove("covering");
      cloudTransitionActive = false;
    }, 50);
  }, 200);
}

function startGame() {
  state.mode = "playing";
  bunny.visible = true;
  camera.fov = CAMERA_FOV_PLAY;
  camera.updateProjectionMatrix();
  stopGameOverMusic();
  sfxGameStart();
  updateMusicState();
  state.elapsed = 0;
  state.score = 0;
  state.worldSpeed = 0;
  lastMilestoneHit = 0;
  state.flashTimer = 0;
  state.player.currentBlock = 0;
  state.player.fromBlock = 0;
  state.player.toBlock = 0;
  state.player.progress = 0;
  state.player.activeSegment = 0;
  state.player.yOffset = 0;
  state.player.jumpTimer = 0;
  state.player.jumpDuration = getCurrentJumpDuration();
  state.player.cooldown = 0;
  resetCrumbleState();
  state.death.timer = 0;
  state.death.reason = "";
  state.death.velocityY = 0;
  state.death.bounceCount = 0;
  state.death.trailEmitTimer = 0;
  state.death.shockTimer = 0;
  state.death.startX = 0;
  state.death.startY = 0;
  state.death.startZ = 0;
  state.death.isCrumbleDeath = false;
  state.performance.lowFpsTimer = 0;
  state.performance.highFpsTimer = 0;
  state.performance.lowFpsMode = false;
  state.performance.lowFpsBlend = 0;
  state.themeIndex = 0;
  state.prevThemeIndex = 0;
  state.themeTransitioning = false;
  state.globalThemeBlend = 1;
  state.nextOrbTheme = 0;
  const monoPal = themePalettes[0];
  for (const tile of tiles) {
    tile.userData.themeBlend = 1;
    tile.userData.displayThemeIndex = 0;
    const pi = tile.userData.paletteIndex;
    tile.material.color.copy(monoPal.tilePalette[pi]);
  }
  for (const terrace of sideTerraces) {
    terrace.userData.themeBlend = 1;
    terrace.userData.displayThemeIndex = 0;
    const tpi = terrace.userData.paletteIndex;
    terrace.material.color.copy(monoPal.terracePalette[tpi]);
  }
  const monoStones = [monoPal.stoneBase, monoPal.stoneMid, monoPal.stoneTop];
  for (const block of stepBlocks) {
    block.userData.displayThemeIndex = 0;
    block.userData.themeBlend = 1;
    if (block.userData.mats) {
      for (let mi = 0; mi < 3; mi++) {
        block.userData.mats[mi].color.copy(monoStones[mi]);
        block.userData.emissiveBases[mi].copy(monoPal.stoneEmissiveBase[mi]);
        block.userData.mats[mi].emissive.copy(monoPal.stoneEmissiveBase[mi]);
      }
    }
  }
  for (const bed of groundBeds) {
    bed.userData.displayThemeIndex = 0;
    bed.userData.themeBlend = 1;
    bed.material.color.copy(monoPal.groundBedColor);
  }
  scene.background.copy(monoPal.bgColor);
  scene.fog.color.copy(monoPal.bgColor);
  flowerStemMaterial.color.copy(monoPal.floraStem);
  flowerCenterMaterial.color.copy(monoPal.floraCenter);
  flowerCenterMaterial.emissive.copy(monoPal.floraCenter);
  for (const pm of flowerPetalMaterials) {
    pm.color.copy(monoPal.floraPetal);
  }
  for (const gm of grassMaterials) {
    gm.color.copy(monoPal.floraGrass);
  }
  for (const item of scenery) {
    item.userData.displayThemeIndex = 0;
    item.userData.themeBlend = 1;
    if (item.userData.kind === "tree") {
      item.userData.trunkMat.color.copy(monoPal.treeTrunk);
      item.userData.leafTopMat.color.copy(monoPal.treeLeafTop);
      item.userData.leafTopMat.emissive.copy(monoPal.treeLeafTop);
      item.userData.leafBottomMat.color.copy(monoPal.treeLeafBottom);
      item.userData.leafBottomMat.emissive.copy(monoPal.treeLeafBottom);
    } else if (item.userData.kind === "bush") {
      item.userData.bushMat.color.copy(monoPal.bushColor);
      item.userData.bushMat.emissive.copy(monoPal.bushColor);
    }
  }
  resetCourseLayout();
  ensureCourseAhead(0);
  updateHazards(0);

  const startZ = getBlockPosition(0).z;
  state.camera.z = startZ + (CAMERA_BASE_Z - PLAYER_BASE_Z);
  state.camera.y = CAMERA_BASE_HEIGHT;
  state.camera.catchupTimer = 0;
  bunny.position.set(0, getBlockTopY(0), startZ);
  bunny.scale.set(1, 1, 1);
  bunny.rotation.set(0, 0, 0);
  camera.position.set(0, state.camera.y, state.camera.z);
  camera.lookAt(
    0,
    bunny.position.y * CAMERA_LOOK_Y_FACTOR,
    bunny.position.z + CAMERA_LOOK_Z_OFFSET
  );
  resetDashEffects();

  for (let i = 0; i < tiles.length; i += 1) {
    const row = Math.floor(i / TILE_COLUMNS);
    const col = i % TILE_COLUMNS;
    tiles[i].position.set(
      (col - (TILE_COLUMNS - 1) / 2) * TILE_SIZE,
      -0.35,
      PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE
    );
  }

  const terracePerDepthRow = SIDE_TERRACE_ROWS * 2;
  for (let i = 0; i < sideTerraces.length; i += 1) {
    const terrace = sideTerraces[i];
    const row = Math.floor(i / terracePerDepthRow);
    const z = PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE;
    const topY = getSideTerraceTopY(z, terrace.userData.rowIndex);
    terrace.position.set(
      getSideTerraceX(terrace.userData.side, terrace.userData.rowIndex, terrace.userData.xJitter),
      topY - SIDE_TERRACE_BLOCK_HEIGHT * 0.5,
      z
    );
  }
  for (let i = 0; i < groundBeds.length; i += 1) {
    groundBeds[i].position.z =
      PLAYER_BASE_Z - pathDepth * 0.5 + (i - 1) * groundBedDepth;
  }

  for (const item of scenery) {
    item.position.z = randomRange(-128, 14);
    item.userData.xJitter = randomRange(-0.28, 0.28);
    item.position.x = getSideTerraceX(
      item.userData.side,
      item.userData.rowIndex,
      item.userData.xJitter
    );
    item.position.y =
      getSideTerraceTopY(item.position.z, item.userData.rowIndex) +
      (item.userData.baseYOffset ?? 0.1);
  }

  hideMenu();
  tutorial.classList.add("hidden");
  tapHint.classList.remove("hidden");
  tapHintActive = true;
  setHudVisibility(true);
  updateHud();
}

function triggerJump() {
  if (state.mode !== "playing") return;
  if (state.player.cooldown > 0) return;
  if (state.player.jumpTimer > 0) return;

  if (tapHintActive) {
    tapHint.classList.add("hidden");
    tapHintActive = false;
  }

  ensureStepBlocksAhead(state.player.currentBlock + 1);
  ensureHazardsAhead(state.player.currentBlock + 1);

  resetCrumbleState();

  state.player.fromBlock = state.player.currentBlock;
  state.player.toBlock = state.player.currentBlock + 1;
  state.player.activeSegment = state.player.currentBlock;
  const targetHazard = getHazardSlot(state.player.activeSegment);
  if (targetHazard && !targetHazard.userData.collected && targetHazard.userData.orbThemeIndex !== undefined) {
    const nextTheme = targetHazard.userData.orbThemeIndex;
    if (nextTheme !== state.themeIndex) {
      state.prevThemeIndex = state.themeIndex;
      state.themeIndex = nextTheme;
      state.themeTransitioning = true;
      const jumpCutoffZ = getBlockZ(state.player.activeSegment + 1);
      for (const tile of tiles) {
        if (tile.position.z > jumpCutoffZ) {
          tile.userData.displayThemeIndex = nextTheme;
          tile.userData.themeBlend = 0;
        }
      }
      for (const terrace of sideTerraces) {
        if (terrace.position.z > jumpCutoffZ) {
          terrace.userData.displayThemeIndex = nextTheme;
          terrace.userData.themeBlend = 0;
        }
      }
      for (const block of stepBlocks) {
        if (block.position.z > jumpCutoffZ) {
          block.userData.displayThemeIndex = nextTheme;
          block.userData.themeBlend = 0;
        }
      }
      for (const bed of groundBeds) {
        if (bed.position.z > jumpCutoffZ) {
          bed.userData.displayThemeIndex = nextTheme;
          bed.userData.themeBlend = 0;
        }
      }
      for (const item of scenery) {
        if (item.position.z > jumpCutoffZ) {
          item.userData.displayThemeIndex = nextTheme;
          item.userData.themeBlend = 0;
        }
      }
    }
  }
  state.player.jumpDuration = getCurrentJumpDuration();
  state.player.jumpTimer = state.player.jumpDuration;
  state.player.cooldown = JUMP_COOLDOWN;
  state.camera.catchupTimer = CAMERA_CATCHUP_TIME;
  triggerDashEffects(
    getBlockPosition(state.player.fromBlock).z,
    getBlockPosition(state.player.toBlock).z
  );
  setTimeout(() => {
    sfxDash();
  }, 0);
}

function boostUpcomingOrbMultiplier(currentBlockIndex) {
  const upcomingHazard = getHazardSlot(currentBlockIndex);
  if (!upcomingHazard || upcomingHazard.userData.collected) return;
  setHazardOrbCount(upcomingHazard, getRandomOrbMultiplier(), true);
}

function submitFinalScore() {
  oasiz.submitScore(state.score);
}

function endGame(reason) {
  if (state.mode !== "playing") return;
  state.mode = "dying";
  submitFinalScore();
  sfxDeath();
  triggerHaptic("error");
  stopMusic();
  state.death.timer = DEATH_ANIM_TIME;
  state.death.reason = reason;
  state.death.velocityY = DEATH_LIFT_SPEED;
  state.death.bounceCount = 0;
  state.death.trailEmitTimer = 0;
  state.death.shockTimer = DEATH_SHOCKWAVE_TIME;
  state.death.startX = bunny.position.x;
  state.death.startY = bunny.position.y;
  state.death.startZ = bunny.position.z;
  state.effects.deathFlashTimer = DEATH_FLASH_TIME;
  state.player.jumpTimer = 0;
  state.player.progress = 0;
  state.player.toBlock = state.player.currentBlock;
  state.player.yOffset = 0;
  state.player.cooldown = 0;
  resetCrumbleState();
  state.flashTimer = 0;
  state.effects.shakeTimer = DASH_SHAKE_TIME * 0.9;
  state.effects.shakePower = DASH_SHAKE_POWER * 0.9;
  deathShockwave.position.set(
    bunny.position.x,
    getBlockTopY(state.player.currentBlock) - 0.36,
    bunny.position.z
  );
  deathShockwave.scale.setScalar(0.52);
  deathShockwave.material.opacity = 0.92;
  deathShockwave.visible = true;
  triggerDeathBurst(1.45);
  tutorial.classList.add("hidden");
  tapHint.classList.add("hidden");
  tapHintActive = false;
  setHudVisibility(false);
}

function endCrumbleDeath() {
  if (state.mode !== "playing") return;
  state.mode = "dying";
  submitFinalScore();
  sfxDeath();
  triggerHaptic("error");
  stopMusic();
  state.death.timer = VOID_DEATH_TIME;
  state.death.reason = "The stone crumbled!";
  state.death.isCrumbleDeath = true;
  state.death.velocityY = 0;
  state.death.bounceCount = 0;
  state.death.trailEmitTimer = 0;
  state.death.shockTimer = 0;
  state.death.startX = bunny.position.x;
  state.death.startY = bunny.position.y;
  state.death.startZ = bunny.position.z;
  state.effects.deathFlashTimer = 0;
  state.player.jumpTimer = 0;
  state.player.progress = 0;
  state.player.toBlock = state.player.currentBlock;
  state.player.yOffset = 0;
  state.player.cooldown = 0;
  state.flashTimer = 0;
  deathShockwave.visible = false;
  tutorial.classList.add("hidden");
  tapHint.classList.add("hidden");
  tapHintActive = false;
  setHudVisibility(false);
}

function updateDeathAnimation(dt) {
  if (state.mode !== "dying") return;

  if (state.death.isCrumbleDeath) {
    updateVoidDeathAnimation(dt);
    return;
  }

  state.death.timer = Math.max(0, state.death.timer - dt);
  const progress = 1 - state.death.timer / DEATH_ANIM_TIME;
  const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
  const spinBlend = THREE.MathUtils.smoothstep(progress, 0.08, 0.84);
  const floorY = getBlockTopY(state.player.currentBlock) - 0.35;

  state.death.velocityY -= DEATH_GRAVITY * dt;
  bunny.position.y += state.death.velocityY * dt;
  if (bunny.position.y <= floorY) {
    bunny.position.y = floorY;
    if (state.death.bounceCount < 1 && Math.abs(state.death.velocityY) > 1.15) {
      state.death.velocityY = Math.abs(state.death.velocityY) * 0.26;
      state.death.bounceCount += 1;
      state.effects.deathFlashTimer = Math.max(
        state.effects.deathFlashTimer,
        DEATH_FLASH_TIME * 0.34
      );
      state.effects.shakeTimer = Math.max(state.effects.shakeTimer, DASH_SHAKE_TIME * 0.5);
      state.effects.shakePower = Math.max(state.effects.shakePower, DASH_SHAKE_POWER * 0.45);
      triggerDeathBurst(0.52);
    } else {
      state.death.velocityY = 0;
    }
  }

  bunny.position.z = state.death.startZ - eased * DEATH_DRIFT;
  bunny.position.x =
    state.death.startX + Math.sin(progress * Math.PI * 4.6) * (1 - eased * 0.72) * 0.26;
  bunny.rotation.x += dt * DEATH_SPIN_SPEED * (0.52 + spinBlend * 0.58);
  bunny.rotation.y += dt * DEATH_SPIN_SPEED * (0.2 + spinBlend * 0.3);
  bunny.rotation.z += dt * DEATH_SPIN_SPEED * (0.64 + spinBlend * 0.52);
  const stretch = Math.sin(progress * Math.PI) * 0.05;
  const squish = THREE.MathUtils.lerp(1, 0.66, eased);
  bunny.scale.set(
    1 + eased * 0.15 + stretch,
    Math.max(0.62, squish - stretch * 0.75),
    1 - eased * 0.2 + stretch * 0.45
  );
  updateEarTuck(1, dt);

  state.death.trailEmitTimer -= dt;
  const emitInterval =
    DEATH_TRAIL_EMIT_INTERVAL * THREE.MathUtils.lerp(0.72, 1.26, eased);
  while (state.death.trailEmitTimer <= 0) {
    emitDeathTrailParticle(progress);
    state.death.trailEmitTimer += emitInterval;
  }

  if (state.death.shockTimer > 0) {
    state.death.shockTimer = Math.max(0, state.death.shockTimer - dt);
    const shockProgress = 1 - state.death.shockTimer / DEATH_SHOCKWAVE_TIME;
    const shockEase = THREE.MathUtils.smoothstep(shockProgress, 0, 1);
    deathShockwave.position.set(
      THREE.MathUtils.lerp(state.death.startX, bunny.position.x, 0.3),
      floorY - 0.04,
      THREE.MathUtils.lerp(state.death.startZ, bunny.position.z, 0.4)
    );
    deathShockwave.scale.setScalar(0.52 + shockEase * 4.3);
    deathShockwave.material.opacity = Math.max(0, (1 - shockEase) * (0.95 - shockEase * 0.25));
    deathShockwave.visible = deathShockwave.material.opacity > 0.01;
  } else if (deathShockwave.visible) {
    deathShockwave.visible = false;
  }

  if (progress > 0.58 && state.effects.deathFlashTimer < DEATH_FLASH_TIME * 0.28) {
    state.effects.deathFlashTimer = DEATH_FLASH_TIME * 0.28;
  }

  if (state.death.timer === 0) {
    state.mode = "gameover";
    deathShockwave.visible = false;
    bunny.position.y = Math.max(floorY, bunny.position.y);
    oasiz.flushGameState();
    startGameOverMusic();
    setMenu(
      "GAME OVER",
      `${state.death.reason} You collected ${state.score} orb${state.score === 1 ? "" : "s"}.`,
      "PLAY AGAIN",
      true
    );
    render();
    stopLoop();
  }
}

function updateVoidDeathAnimation(dt) {
  state.death.timer = Math.max(0, state.death.timer - dt);
  const progress = 1 - state.death.timer / VOID_DEATH_TIME;
  const eased = THREE.MathUtils.smoothstep(progress, 0, 1);

  state.death.velocityY -= VOID_FALL_GRAVITY * dt;
  bunny.position.y += state.death.velocityY * dt;

  bunny.rotation.x += dt * VOID_SPIN_SPEED * 0.3;
  bunny.rotation.z += dt * VOID_SPIN_SPEED * 0.5;

  const shrink = Math.max(0, 1 - eased * 1.1);
  bunny.scale.set(shrink, shrink * 1.15, shrink);

  updateEarTuck(1, dt);

  state.death.trailEmitTimer -= dt;
  if (state.death.trailEmitTimer <= 0) {
    emitDeathTrailParticle(progress);
    state.death.trailEmitTimer += DEATH_TRAIL_EMIT_INTERVAL * 1.5;
  }

  const selfBlock = getStepBlock(state.player.currentBlock);
  if (selfBlock) {
    state.player.crumbleFallSpeed_self += CRUMBLE_FALL_GRAVITY * dt;
    state.player.crumbleFallY_self -= state.player.crumbleFallSpeed_self * dt;
    selfBlock.position.y = selfBlock.userData.baseY + state.player.crumbleFallY_self;
    if (state.player.crumbleFallY_self < -20) selfBlock.visible = false;
  }

  state.player.crumbleTileElapsed += dt;
  const originZ = getBlockZ(state.player.currentBlock + 1);
  const selfZ = getBlockZ(state.player.currentBlock);
  const crumbleZMax = selfZ + STEP_DISTANCE * 0.5;
  const elapsed = state.player.crumbleTileElapsed;
  for (const tile of tiles) {
    if (tile.position.z >= originZ && tile.position.z <= crumbleZMax) {
      const dist = tile.position.z - originZ;
      const delay = dist / getCrumbleCascadeSpeed();
      const tileTime = elapsed - delay;
      if (tileTime > 0) {
        if (tile.userData.crumbleTiltDir === 0) {
          tile.userData.crumbleTiltDir = (Math.random() - 0.5) * 2;
        }
        tile.userData.crumbleFallSpeed += CRUMBLE_FALL_GRAVITY * 0.25 * dt;
        tile.userData.crumbleFallY -= tile.userData.crumbleFallSpeed * dt;
      }
    }
  }
  for (const terrace of sideTerraces) {
    if (terrace.position.z >= originZ && terrace.position.z <= crumbleZMax) {
      const dist = terrace.position.z - originZ;
      const delay = dist / getCrumbleCascadeSpeed();
      const tileTime = elapsed - delay;
      if (tileTime > 0) {
        if (terrace.userData.crumbleTiltDir === 0) {
          terrace.userData.crumbleTiltDir = (Math.random() - 0.5) * 2;
        }
        terrace.userData.crumbleFallSpeed += CRUMBLE_FALL_GRAVITY * 0.25 * dt;
        terrace.userData.crumbleFallY -= terrace.userData.crumbleFallSpeed * dt;
      }
    }
  }

  const orbZ = getSegmentCenterZ(state.player.currentBlock);
  const orbDist = orbZ - originZ;
  const orbDelay = orbDist / getCrumbleCascadeSpeed();
  if (elapsed > orbDelay) {
    state.player.crumbleOrbFallSpeed += CRUMBLE_FALL_GRAVITY * 0.25 * dt;
    state.player.crumbleOrbFallY -= state.player.crumbleOrbFallSpeed * dt;
  }

  if (state.death.timer === 0) {
    state.mode = "gameover";
    oasiz.flushGameState();
    startGameOverMusic();
    setMenu(
      "GAME OVER",
      `${state.death.reason} You collected ${state.score} orb${state.score === 1 ? "" : "s"}.`,
      "PLAY AGAIN",
      true
    );
    render();
    stopLoop();
  }
}

function isPlayerCollidingWithRocks() {
  const playerX = bunny.position.x;
  const playerY = bunny.position.y;
  const playerZ = bunny.position.z;
  const threshold =
    HAZARD_ORBIT_DEPTH +
    PLAYER_COLLIDER_RADIUS +
    HAZARD_COLLIDER_RADIUS +
    0.9;

  for (const hazard of hazards) {
    if (Math.abs(hazard.position.z - playerZ) > threshold) continue;
    const rocks = hazard.userData.rocks;
    for (const rock of rocks) {
      if (!rock.visible) continue;
      rock.getWorldPosition(hazardTempRockWorld);
      const dx = hazardTempRockWorld.x - playerX;
      const dy = (hazardTempRockWorld.y - playerY) * COLLIDER_Y_SCALE;
      const dz = hazardTempRockWorld.z - playerZ;
      const combinedRadius =
        PLAYER_COLLIDER_RADIUS +
        (rock.userData.colliderRadius ?? HAZARD_COLLIDER_RADIUS);
      if (dx * dx + dy * dy + dz * dz < combinedRadius * combinedRadius) {
        return true;
      }
    }
  }
  return false;
}

function collectOrbFromSegment(segmentIndex, skipSfx = false) {
  const hazard = getHazardSlot(segmentIndex);
  if (!hazard || hazard.userData.collected) return 0;
  const collectedOrbCount = hazard.userData.orbCount ?? 1;
  triggerOrbCollectEffects(hazard, skipSfx);
  const newest = getNewestHazardSlot();
  const nextSegment = newest.userData.segmentIndex + 1;
  configureHazardSlot(hazard, nextSegment);
  state.course.furthestSegment = Math.max(state.course.furthestSegment, nextSegment);
  return collectedOrbCount;
}

function updatePlayer(dt) {
  if (state.mode === "home") return;
  if (state.mode === "dying") {
    updateDeathAnimation(dt);
    return;
  }
  if (state.mode === "gameover") {
    updateEarTuck(1, dt);
    return;
  }

  state.player.cooldown = Math.max(0, state.player.cooldown - dt);
  let targetEarTuck = 0;

  if (state.player.jumpTimer > 0) {
    state.player.jumpTimer = Math.max(0, state.player.jumpTimer - dt);
    const progress =
      1 - state.player.jumpTimer / Math.max(0.0001, state.player.jumpDuration);
    state.player.progress = progress;
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const ascendRatio = 0.58;
    let arc = 0;
    if (eased < ascendRatio) {
      const t = eased / ascendRatio;
      arc = 1 - Math.pow(1 - t, 3);
    } else {
      const t = (eased - ascendRatio) / (1 - ascendRatio);
      arc = 1 - Math.pow(t, 2);
    }
    targetEarTuck = Math.pow(arc, 0.8);
    const from = getBlockPosition(state.player.fromBlock);
    const to = getBlockPosition(state.player.toBlock);
    const baseY = THREE.MathUtils.lerp(
      getBlockTopY(state.player.fromBlock),
      getBlockTopY(state.player.toBlock),
      eased
    );
    bunny.position.z = THREE.MathUtils.lerp(from.z, to.z, eased);
    state.player.yOffset = JUMP_ARC_HEIGHT * arc;
    bunny.position.y = baseY + state.player.yOffset;
    const squash = 1 - arc * 0.08;
    bunny.scale.set(1 + arc * 0.07, squash, 1 - arc * 0.05);
    bunny.rotation.x = -0.15 - arc * 0.45;
    bunny.rotation.z = Math.sin(progress * Math.PI) * 0.07;

    if (state.player.jumpTimer === 0 && state.mode === "playing") {
      sfxLand();
      triggerHaptic("light");
      const orbFell = state.player.crumbleOrbFallY < -2;
      state.player.currentBlock = state.player.toBlock;
      resetCrumbleState();
      const peekHazard = getHazardSlot(state.player.activeSegment);
      const peekOrbCount = peekHazard && !peekHazard.userData.collected ? (peekHazard.userData.orbCount ?? 1) : 0;
      const isMultiOrb = !orbFell && peekOrbCount >= 2;
      const collectedOrbCount = orbFell ? 0 : collectOrbFromSegment(state.player.activeSegment, isMultiOrb);
      const actualCollected = Math.max(0, collectedOrbCount);
      state.score += actualCollected;
      state.flashTimer = 0.12;
      ensureCourseAhead(state.player.currentBlock);
      boostUpcomingOrbMultiplier(state.player.currentBlock);
      updateHud();
      if (actualCollected >= 2) {
        showScorePopup(actualCollected);
        if (settings.fx) {
          if (actualCollected >= 3) sfxX3Synth();
          else sfxX2Synth();
        }
        triggerHaptic("medium");
      }
      checkMilestones(state.score);
    }
  } else {
    const current = getBlockPosition(state.player.currentBlock);
    bunny.position.z = current.z;
    bunny.position.y = getBlockTopY(state.player.currentBlock) + state.player.crumbleFallY_bunny;
    state.player.progress = 0;
    state.player.yOffset = 0;
    bunny.scale.set(1, 1, 1);
    bunny.rotation.x = 0;
    bunny.rotation.z = 0;

    if (state.mode === "playing" && state.player.currentBlock > 0) {
      state.player.idleTimer += dt;
      const crumbleLimit = THREE.MathUtils.lerp(
        CRUMBLE_TIME_BASE,
        CRUMBLE_TIME_MIN,
        Math.min(1, state.score / 40)
      );
      state.player.crumbleProgress = Math.min(1, state.player.idleTimer / crumbleLimit);

      if (!state.player.crumbleWarnFired && state.player.crumbleProgress >= CRUMBLE_WARN_RATIO) {
        state.player.crumbleWarnFired = true;
        triggerHaptic("medium");
      }

      if (state.player.crumbleProgress >= CRUMBLE_TILE_FALL_START) {
        state.player.crumbleTileElapsed += dt;

        if (!state.player.crumbleCascadeReachedSelf) {
          const selfDist = STEP_DISTANCE;
          const selfDelay = selfDist / getCrumbleCascadeSpeed();
          if (state.player.crumbleTileElapsed >= selfDelay) {
            state.player.crumbleCascadeReachedSelf = true;
            state.player.crumbleSelfTimer = 0;
            triggerHaptic("heavy");
          }
        }
      }

      if (state.player.crumbleCascadeReachedSelf) {
        state.player.crumbleSelfTimer += dt;

        if (state.player.crumbleSelfTimer >= CRUMBLE_SELF_FALL_DELAY) {
          state.player.crumbleFallSpeed_self += CRUMBLE_FALL_GRAVITY * dt;
          state.player.crumbleFallY_self -= state.player.crumbleFallSpeed_self * dt;
        }

        if (state.player.crumbleSelfTimer >= CRUMBLE_BUNNY_FALL_DELAY) {
          state.player.crumbleFallSpeed_bunny += CRUMBLE_FALL_GRAVITY * dt;
          state.player.crumbleFallY_bunny -= state.player.crumbleFallSpeed_bunny * dt;
        }

        if (state.player.crumbleFallY_bunny < -1.5) {
          triggerHaptic("error");
          endCrumbleDeath();
          return;
        }
      }
    }
  }

  if (state.mode === "playing" && isPlayerCollidingWithRocks()) {
    endGame("You hit a rock.");
    updateEarTuck(0, dt);
    bunny.rotation.y = Math.sin(state.elapsed * 8) * 0.04;
    return;
  }

  updateEarTuck(targetEarTuck, dt);
  bunny.rotation.y = Math.sin(state.elapsed * 8) * 0.04;
}

function isOrbSegmentActive(segmentIndex) {
  const firstActive = state.player.currentBlock;
  const lastExclusive = firstActive + MAX_ACTIVE_ORB_SLOTS;
  return segmentIndex >= firstActive && segmentIndex < lastExclusive;
}

function updateHazards(dt) {
  const speedMult = getDifficultySpeedMultiplier();
  for (const hazard of hazards) {
    const data = hazard.userData;
    data.phase += dt * data.speed * speedMult;
    const segmentIndex = data.segmentIndex;
    hazard.position.z = getSegmentCenterZ(segmentIndex);
    hazard.position.y =
      getSegmentBaseCenterY(segmentIndex) +
      Math.sin(state.elapsed * 1.2 + segmentIndex * 0.35) * 0.05;

    const activeCount = data.activeRockCount ?? data.rocks.length;
    for (let i = 0; i < data.rocks.length; i += 1) {
      const rock = data.rocks[i];
      const isActiveRock = i < activeCount;
      rock.visible = isActiveRock;
      if (!isActiveRock) continue;

      let angle = data.phase * data.patternDirection + (Math.PI * 2 * i) / activeCount;
      if (data.patternType === "orbitPairFollow" && activeCount === 2) {
        angle = data.phase * data.patternDirection + i * data.pairFollowGap;
      }
      rock.position.x = Math.cos(angle) * data.radius;
      rock.position.z = Math.sin(angle) * data.depth;
      rock.position.y = 0.14 + Math.sin(state.elapsed * 2.4 + i) * 0.08;
      rock.rotation.x += dt * (0.8 + i * 0.25) * speedMult;
      rock.rotation.y -= dt * (0.74 + i * 0.21) * speedMult;
    }

    const orbActive = !data.collected && isOrbSegmentActive(segmentIndex);
    data.orb.visible = orbActive;

    if (orbActive) {
      if (data.orbPopTimer > 0) {
        data.orbPopTimer = Math.max(0, data.orbPopTimer - dt);
      }
      if (data.orbCount > ORB_MULTIPLIER_MIN) {
        data.orbDecayTimer -= dt;
        while (data.orbDecayTimer <= 0 && data.orbCount > ORB_MULTIPLIER_MIN) {
          const nextCount = data.orbCount - 1;
          setHazardOrbCount(hazard, nextCount, true);
          if (nextCount > ORB_MULTIPLIER_MIN) {
            data.orbDecayTimer += ORB_MULTIPLIER_DECAY_TIME;
          } else {
            data.orbDecayTimer = 0;
          }
        }
      }

      data.orb.position.y = 0.24 + Math.sin(state.elapsed * 4 + segmentIndex * 0.3) * 0.09;
      data.orb.rotation.y += dt * (1.7 + data.speed * 0.3) * data.orbSpin;
      const popProgress = data.orbPopTimer / ORB_MULTIPLIER_POP_TIME;
      const popStrength =
        data.orbPopTimer > 0
          ? Math.sin((1 - popProgress) * Math.PI) * ORB_MULTIPLIER_POP_SCALE
          : 0;
      const targetOrbScale = 1 + (data.orbCount - 1) * 0.2;
      data.orbScale = THREE.MathUtils.damp(data.orbScale ?? targetOrbScale, targetOrbScale, 14, dt);
      data.orb.scale.setScalar(data.orbScale * (1 + popStrength));
      let fogVisibility = 1;
      if (scene.fog) {
        const fogDistance = Math.abs(camera.position.z - hazard.position.z);
        const fogSpan = Math.max(0.0001, scene.fog.far - scene.fog.near);
        const fogRatio = THREE.MathUtils.clamp((fogDistance - scene.fog.near) / fogSpan, 0, 1);
        fogVisibility = (1 - fogRatio) * (1 - fogRatio) * (1 - 0.55 * fogRatio);
      }
      data.orb.material.emissiveIntensity =
        data.orbBaseEmissive * (0.2 + fogVisibility * 0.8) * (1 + (data.orbCount - 1) * 0.14);
      const extraVisibleCount = Math.max(0, data.orbCount - 1);
      for (let i = 0; i < data.orbExtras.length; i += 1) {
        const extra = data.orbExtras[i];
        const visible = i < extraVisibleCount;
        extra.visible = visible;
        if (!visible) {
          extra.userData.scale = 0.01;
          extra.scale.setScalar(0.01);
          continue;
        }
        const orbitAngle = state.elapsed * 2.2 + segmentIndex * 0.45 + i * Math.PI;
        const orbitRadius = 1.0 + i * 0.3;
        extra.position.set(
          Math.cos(orbitAngle) * orbitRadius,
          data.orb.position.y + 0.15 + i * 0.2 + Math.sin(state.elapsed * 3 + i) * 0.2,
          Math.sin(orbitAngle) * orbitRadius * 0.74
        );
        const targetExtraScale = 0.78 + (data.orbCount - 1) * 0.08;
        extra.userData.scale = THREE.MathUtils.damp(
          extra.userData.scale ?? 0.01,
          targetExtraScale,
          16,
          dt
        );
        extra.scale.setScalar(extra.userData.scale * (1 + popStrength * 0.72));
        extra.material.emissiveIntensity =
          data.orbBaseEmissive * 0.58 * (0.2 + fogVisibility * 0.8);
      }

      data.ring.rotation.z += dt * 0.95;
      data.ring.visible = true;
    } else {
      data.orb.visible = false;
      data.ring.visible = false;
      for (const extra of data.orbExtras) {
        extra.visible = false;
      }
    }

    if (segmentIndex === state.player.currentBlock && state.player.crumbleOrbFallY < 0) {
      const orbFadeOpacity = Math.max(0, 1 + state.player.crumbleOrbFallY / 20);
      const orbFallY = state.player.crumbleOrbFallY;
      const orbVisible = orbFadeOpacity > 0.01;
      data.orb.position.y += orbFallY;
      data.orb.material.transparent = true;
      data.orb.material.opacity = orbFadeOpacity;
      data.orb.visible = data.orb.visible && orbVisible;
      data.ring.position.y += orbFallY;
      data.ring.visible = data.ring.visible && orbVisible;
      for (const extra of data.orbExtras) {
        extra.position.y += orbFallY;
        extra.material.transparent = true;
        extra.material.opacity = orbFadeOpacity;
        extra.visible = extra.visible && orbVisible;
      }
    }
  }
}

function getGroundWaveImpact(worldZ, waveFront, waveOpacity) {
  const aheadDistance = state.effects.groundWaveOriginZ - worldZ;
  if (aheadDistance < -1 || aheadDistance > waveFront + DASH_GROUND_WAVE_BAND) {
    return 0;
  }
  const crestDistance = Math.abs(aheadDistance - waveFront);
  if (crestDistance > DASH_GROUND_WAVE_BAND) {
    return 0;
  }
  const crest = Math.max(0, 1 - crestDistance / DASH_GROUND_WAVE_BAND);
  return crest * crest * (3 - 2 * crest) * waveOpacity;
}

function getRearRowWaveLift(worldZ, waveFront, waveOpacity) {
  const aheadDistance = state.effects.groundWaveOriginZ - worldZ;
  const rearCenter = waveFront - TILE_SIZE * 1.35;
  const rearBand = TILE_SIZE * 2.4;
  const distance = Math.abs(aheadDistance - rearCenter);
  if (distance > rearBand) {
    return 0;
  }
  const local = 1 - distance / rearBand;
  const eased = local * local * (3 - 2 * local);
  return Math.sin(eased * Math.PI) * waveOpacity;
}

function updateWorld(dt) {
  if (state.effects.stepBlockFlashTimer > 0) {
    state.effects.stepBlockFlashTimer = Math.max(
      0,
      state.effects.stepBlockFlashTimer - dt
    );
  }
  if (state.effects.groundWaveTimer > 0) {
    state.effects.groundWaveTimer = Math.max(0, state.effects.groundWaveTimer - dt);
  }
  if (state.effects.groundWaveOpacity > 0) {
    state.effects.groundWaveFront += DASH_GROUND_WAVE_SPEED * dt;
    if (state.effects.groundWaveFront > DASH_GROUND_WAVE_MAX_DISTANCE) {
      state.effects.groundWaveOpacity = Math.max(
        0,
        state.effects.groundWaveOpacity - dt * 1.2
      );
    }
  }
  const waveActive = state.effects.groundWaveOpacity > 0;
  const waveFront = waveActive ? state.effects.groundWaveFront : 0;
  const waveOpacity = state.effects.groundWaveOpacity;
  const colorCutoffZ = state.player.jumpTimer > 0
    ? getBlockZ(state.player.activeSegment + 1)
    : getBlockZ(state.player.currentBlock + 1);
  const stepFlash =
    state.effects.stepBlockFlashTimer > 0
      ? state.effects.stepBlockFlashTimer / STEP_BLOCK_FLASH_TIME
      : 0;

  const tileFrontZ = bunny.position.z + 10;
  const tileBackZ = tileFrontZ - pathDepth;
  for (const bed of groundBeds) {
    let bedRecycled = false;
    while (bed.position.z > tileFrontZ + groundBedDepth * 0.5) {
      bed.position.z -= groundBedCycleDepth;
      bedRecycled = true;
    }
    while (bed.position.z < tileBackZ - groundBedDepth * 0.5) {
      bed.position.z += groundBedCycleDepth;
      bedRecycled = true;
    }
    if (bedRecycled) {
      bed.userData.displayThemeIndex = 0;
      bed.userData.themeBlend = 1;
      bed.material.color.copy(themePalettes[0].groundBedColor);
    }
  }

  for (const tile of tiles) {
    let recycled = false;
    while (tile.position.z > tileFrontZ) {
      tile.position.z -= pathDepth;
      recycled = true;
    }
    while (tile.position.z < tileBackZ) {
      tile.position.z += pathDepth;
      recycled = true;
    }
    if (recycled) {
      const pi = tile.userData.paletteIndex;
      tile.userData.displayThemeIndex = 0;
      tile.userData.themeBlend = 1;
      tile.material.color.copy(themePalettes[0].tilePalette[pi]);
    }
    const waveImpact = waveActive
      ? getGroundWaveImpact(tile.position.z, waveFront, waveOpacity)
      : 0;
    if (tile.position.z < colorCutoffZ && tile.userData.displayThemeIndex !== 0) {
      const pi2 = tile.userData.paletteIndex;
      tile.userData.displayThemeIndex = 0;
      tile.userData.themeBlend = 1;
      tile.material.color.copy(themePalettes[0].tilePalette[pi2]);
    }
    if (tile.userData.displayThemeIndex !== state.themeIndex && state.themeIndex !== 0 && tile.position.z > colorCutoffZ) {
      tile.userData.displayThemeIndex = state.themeIndex;
      tile.userData.themeBlend = 0;
    }
    if (waveActive) {
      const rearLift = getRearRowWaveLift(tile.position.z, waveFront, waveOpacity);
      const targetWaveLift = rearLift * DASH_GROUND_WAVE_LIFT * 1.35;
      tile.userData.waveLift = THREE.MathUtils.damp(tile.userData.waveLift, targetWaveLift, 11, dt);
    } else if (tile.userData.waveLift !== 0) {
      tile.userData.waveLift = THREE.MathUtils.damp(tile.userData.waveLift, 0, 11, dt);
      if (Math.abs(tile.userData.waveLift) < 0.001) tile.userData.waveLift = 0;
    }
    if (!isMobile) {
      tile.position.y =
        -0.5 +
        Math.sin(tile.position.z * 0.14 + tile.userData.bobOffset) * 0.22 +
        Math.sin(state.elapsed * 0.7 + tile.position.x * 0.25) * 0.08 +
        tile.userData.waveLift;
    } else {
      tile.position.y = -0.5 + tile.userData.waveLift;
    }
    if (tile.userData.crumbleFallY < 0) {
      tile.position.y += tile.userData.crumbleFallY;
      tile.rotation.x += tile.userData.crumbleTiltDir * dt * 2;
      const fadeOpacity = Math.max(0, 1 + tile.userData.crumbleFallY / 20);
      tile.material.transparent = true;
      tile.material.opacity = fadeOpacity;
      tile.visible = fadeOpacity > 0.01;
    }
    if (state.themeTransitioning && tile.userData.displayThemeIndex !== 0) {
      const rate = waveImpact > 0.1 ? 8 : 3;
      tile.userData.themeBlend = Math.min(1, tile.userData.themeBlend + dt * rate);
    }
    if (tile.userData.themeBlend < 1 && tile.userData.displayThemeIndex !== 0) {
      const pi = tile.userData.paletteIndex;
      const fromTheme = tile.userData.displayThemeIndex === state.themeIndex ? state.prevThemeIndex : 0;
      const prevTileColor = themePalettes[fromTheme].tilePalette[pi];
      const curTileColor = themePalettes[tile.userData.displayThemeIndex].tilePalette[pi];
      tile.material.color.copy(prevTileColor).lerp(curTileColor, tile.userData.themeBlend);
    }
    tile.userData.emissiveIntensity = waveImpact * DASH_GROUND_WAVE_FLASH;
  }
  syncTileInstances();

  for (const terrace of sideTerraces) {
    let terrRecycled = false;
    while (terrace.position.z > tileFrontZ) {
      terrace.position.z -= pathDepth;
      terrRecycled = true;
    }
    while (terrace.position.z < tileBackZ) {
      terrace.position.z += pathDepth;
      terrRecycled = true;
    }
    if (terrRecycled) {
      const tpi = terrace.userData.paletteIndex;
      terrace.userData.displayThemeIndex = 0;
      terrace.userData.themeBlend = 1;
      terrace.material.color.copy(themePalettes[0].terracePalette[tpi]);
    }
    const waveImpact = waveActive
      ? getGroundWaveImpact(terrace.position.z, waveFront, waveOpacity)
      : 0;
    if (terrace.position.z < colorCutoffZ && terrace.userData.displayThemeIndex !== 0) {
      const tpi2 = terrace.userData.paletteIndex;
      terrace.userData.displayThemeIndex = 0;
      terrace.userData.themeBlend = 1;
      terrace.material.color.copy(themePalettes[0].terracePalette[tpi2]);
    }
    if (terrace.userData.displayThemeIndex !== state.themeIndex && state.themeIndex !== 0 && terrace.position.z > colorCutoffZ) {
      terrace.userData.displayThemeIndex = state.themeIndex;
      terrace.userData.themeBlend = 0;
    }
    if (waveActive) {
      const rearLift = getRearRowWaveLift(terrace.position.z, waveFront, waveOpacity);
      const targetWaveLift = rearLift * DASH_GROUND_WAVE_LIFT * 1.08;
      terrace.userData.waveLift = THREE.MathUtils.damp(terrace.userData.waveLift, targetWaveLift, 9.6, dt);
    } else if (terrace.userData.waveLift !== 0) {
      terrace.userData.waveLift = THREE.MathUtils.damp(terrace.userData.waveLift, 0, 9.6, dt);
      if (Math.abs(terrace.userData.waveLift) < 0.001) terrace.userData.waveLift = 0;
    }
    const topY = getSideTerraceTopY(terrace.position.z, terrace.userData.rowIndex);
    if (terrRecycled) {
      terrace.position.x = getSideTerraceX(
        terrace.userData.side,
        terrace.userData.rowIndex,
        terrace.userData.xJitter
      );
    }
    terrace.position.y =
      topY -
      SIDE_TERRACE_BLOCK_HEIGHT * 0.5 +
      (isMobile ? 0 : Math.sin(state.elapsed * 0.74 + terrace.userData.bobOffset) * terrace.userData.bobAmount) +
      terrace.userData.waveLift;
    if (terrace.userData.crumbleFallY < 0) {
      terrace.position.y += terrace.userData.crumbleFallY;
      terrace.rotation.x += terrace.userData.crumbleTiltDir * dt * 2;
      const fadeOpacity = Math.max(0, 1 + terrace.userData.crumbleFallY / 20);
      terrace.material.transparent = true;
      terrace.material.opacity = fadeOpacity;
      terrace.visible = fadeOpacity > 0.01;
    }
    if (state.themeTransitioning && terrace.userData.displayThemeIndex !== 0) {
      const rate = waveImpact > 0.1 ? 8 : 3;
      terrace.userData.themeBlend = Math.min(1, terrace.userData.themeBlend + dt * rate);
    }
    if (terrace.userData.themeBlend < 1 && terrace.userData.displayThemeIndex !== 0) {
      const tpi = terrace.userData.paletteIndex;
      const fromTheme = terrace.userData.displayThemeIndex === state.themeIndex ? state.prevThemeIndex : 0;
      const prevTerrColor = themePalettes[fromTheme].terracePalette[tpi];
      const curTerrColor = themePalettes[terrace.userData.displayThemeIndex].terracePalette[tpi];
      terrace.material.color.copy(prevTerrColor).lerp(curTerrColor, terrace.userData.themeBlend);
    }
    terrace.userData.emissiveIntensity = waveImpact * 0.58;
  }
  syncTerraceInstances();

  if (!isMobile) {
    for (const flora of flowerDecor) {
      const sway =
        Math.sin(state.elapsed * 1.7 + flora.userData.swayOffset) * flora.userData.swayAmount;
      flora.rotation.x = Math.sin(state.elapsed * 1.2 + flora.userData.swayOffset * 1.4) * 0.05;
      flora.rotation.z = sway * 0.18;
    }
  }

  const cp = state.player.crumbleProgress;
  const crumbleActive = state.mode === "playing" && state.player.jumpTimer === 0 && state.player.currentBlock > 0;
  const crumbleDying = (state.mode === "dying" || state.mode === "gameover") && state.death.isCrumbleDeath;
  const camZ = camera.position.z;

  for (const block of stepBlocks) {
    if (block.position.z > camZ + 10 || block.position.z < camZ - 30) {
      block.visible = false;
      continue;
    }
    block.visible = true;

    if (waveActive) {
      const rearLift = getRearRowWaveLift(block.position.z, waveFront, waveOpacity);
      block.userData.waveLift = THREE.MathUtils.damp(
        block.userData.waveLift,
        rearLift * DASH_GROUND_WAVE_LIFT * 0.98,
        10,
        dt
      );
    } else if (block.userData.waveLift) {
      block.userData.waveLift = THREE.MathUtils.damp(block.userData.waveLift, 0, 10, dt);
      if (Math.abs(block.userData.waveLift) < 0.001) block.userData.waveLift = 0;
    }
    const liftedY =
      block.userData.baseY +
      Math.sin(state.elapsed * 1.2 + block.userData.waveOffset) * 0.06 +
      block.userData.waveLift;
    block.position.y = Math.max(STEP_BLOCK_MIN_Y, liftedY);
    block.rotation.z = Math.sin(state.elapsed * 1.05 + block.userData.waveOffset) * 0.04;

    const si = block.userData.stepIndex;
    const isSelfBlock = (crumbleActive || crumbleDying) && si === state.player.currentBlock;

    if (isSelfBlock) {
      for (const child of block.children) child.position.y = child.userData.restY;
      const selfFalling = state.player.crumbleSelfTimer >= CRUMBLE_SELF_FALL_DELAY || crumbleDying;
      if (crumbleActive && cp >= CRUMBLE_SELF_SHAKE_START && !selfFalling) {
        const shakePhase = Math.min(1, (cp - CRUMBLE_SELF_SHAKE_START) / (1 - CRUMBLE_SELF_SHAKE_START));
        const shakeAmp = shakePhase * 0.12;
        const t = state.elapsed * 37;
        block.position.x += Math.sin(t + si * 7.3) * shakeAmp;
        block.position.z += Math.cos(t * 1.3 + si * 11.1) * shakeAmp;
      }
      if (selfFalling) {
        block.position.y += state.player.crumbleFallY_self;
        const selfFadeOpacity = Math.max(0, 1 + state.player.crumbleFallY_self / 20);
        for (const child of block.children) {
          child.material.transparent = true;
          child.material.opacity = selfFadeOpacity;
        }
        block.visible = selfFadeOpacity > 0.01;
      }
    } else {
      for (const child of block.children) child.position.y = child.userData.restY;
    }
  }

  if (crumbleActive && cp >= CRUMBLE_TILE_FALL_START) {
    const cascadeSpeed = getCrumbleCascadeSpeed();
    const originZ = getBlockZ(state.player.currentBlock + 1);
    const selfZ = getBlockZ(state.player.currentBlock);
    const tileZMax = selfZ + STEP_DISTANCE * 0.5;
    const elapsed = state.player.crumbleTileElapsed;
    const gravDt = CRUMBLE_FALL_GRAVITY * 0.25 * dt;
    for (const tile of tiles) {
      if (tile.position.z >= originZ && tile.position.z <= tileZMax) {
        const tileTime = elapsed - (tile.position.z - originZ) / cascadeSpeed;
        if (tileTime > 0) {
          if (tile.userData.crumbleTiltDir === 0) {
            tile.userData.crumbleTiltDir = (Math.random() - 0.5) * 2;
          }
          tile.userData.crumbleFallSpeed += gravDt;
          tile.userData.crumbleFallY -= tile.userData.crumbleFallSpeed * dt;
        }
      }
    }
    for (const terrace of sideTerraces) {
      if (terrace.position.z >= originZ && terrace.position.z <= tileZMax) {
        const tileTime = elapsed - (terrace.position.z - originZ) / cascadeSpeed;
        if (tileTime > 0) {
          if (terrace.userData.crumbleTiltDir === 0) {
            terrace.userData.crumbleTiltDir = (Math.random() - 0.5) * 2;
          }
          terrace.userData.crumbleFallSpeed += gravDt;
          terrace.userData.crumbleFallY -= terrace.userData.crumbleFallSpeed * dt;
        }
      }
    }

    const orbZ = getSegmentCenterZ(state.player.currentBlock);
    const orbDist = orbZ - originZ;
    const orbDelay = orbDist / cascadeSpeed;
    if (elapsed > orbDelay) {
      state.player.crumbleOrbFallSpeed += CRUMBLE_FALL_GRAVITY * 0.25 * dt;
      state.player.crumbleOrbFallY -= state.player.crumbleOrbFallSpeed * dt;
    }
  }

  let playerLocalSum = 0;
  let playerLocalCount = 0;
  const bunnyZ = bunny.position.z;
  if (state.themeTransitioning) {
    let allDone = true;
    let paintedCount = 0;
    let sum = 0;
    for (const tile of tiles) {
      const ud = tile.userData;
      if (ud.displayThemeIndex !== 0) {
        paintedCount++;
        sum += ud.themeBlend;
        if (ud.themeBlend < 1) allDone = false;
      }
      if (Math.abs(tile.position.z - bunnyZ) < TILE_SIZE * 3 && ud.displayThemeIndex !== 0) {
        playerLocalSum += ud.themeBlend;
        playerLocalCount++;
      }
    }
    if (allDone && paintedCount > 0) {
      state.themeTransitioning = false;
      state.prevThemeIndex = state.themeIndex;
    }
    state.globalThemeBlend = paintedCount > 0 ? sum / paintedCount : 1;
  } else {
    state.globalThemeBlend = 1;
    for (const tile of tiles) {
      if (Math.abs(tile.position.z - bunnyZ) < TILE_SIZE * 3 && tile.userData.displayThemeIndex !== 0) {
        playerLocalSum += tile.userData.themeBlend;
        playerLocalCount++;
      }
    }
  }
  state.playerLocalThemeBlend = playerLocalCount > 0
    ? playerLocalSum / playerLocalCount
    : (state.themeTransitioning ? 0 : 1);
  const playerLocalThemeBlend = state.playerLocalThemeBlend;

  const prevPal = themePalettes[state.prevThemeIndex];
  const curPal = themePalettes[state.themeIndex];

  const crumbleDarken = cp > CRUMBLE_SELF_SHAKE_START
    ? (cp - CRUMBLE_SELF_SHAKE_START) / (1 - CRUMBLE_SELF_SHAKE_START)
    : 0;
  _crumbleWarnColor.copy(prevPal.crumbleWarnColor).lerp(curPal.crumbleWarnColor, playerLocalThemeBlend);
  const monoStoneColors = [themePalettes[0].stoneBase, themePalettes[0].stoneMid, themePalettes[0].stoneTop];
  const curStoneColors = [curPal.stoneBase, curPal.stoneMid, curPal.stoneTop];
  const prevStoneColors = [prevPal.stoneBase, prevPal.stoneMid, prevPal.stoneTop];
  for (const block of stepBlocks) {
    if (block.position.z < colorCutoffZ && block.userData.displayThemeIndex !== 0) {
      block.userData.displayThemeIndex = 0;
      block.userData.themeBlend = 1;
    }
    const bWave = waveActive ? getGroundWaveImpact(block.position.z, waveFront, waveOpacity) : 0;
    if (block.userData.displayThemeIndex !== state.themeIndex && state.themeIndex !== 0 && block.position.z > colorCutoffZ) {
      block.userData.displayThemeIndex = state.themeIndex;
      block.userData.themeBlend = 0;
    }
    if (state.themeTransitioning && block.userData.displayThemeIndex !== 0) {
      const rate = bWave > 0.1 ? 8 : 3;
      block.userData.themeBlend = Math.min(1, block.userData.themeBlend + dt * rate);
    }
    const mats = block.userData.mats;
    const emBases = block.userData.emissiveBases;
    if (mats) {
      const dti = block.userData.displayThemeIndex;
      const tb = block.userData.themeBlend;
      if (dti === 0) {
        for (let mi = 0; mi < 3; mi++) {
          mats[mi].color.copy(monoStoneColors[mi]);
          emBases[mi].copy(themePalettes[0].stoneEmissiveBase[mi]);
        }
      } else {
        const fromPal = dti === state.themeIndex ? prevPal : themePalettes[0];
        const toPal = themePalettes[dti];
        const fromStones = [fromPal.stoneBase, fromPal.stoneMid, fromPal.stoneTop];
        const toStones = [toPal.stoneBase, toPal.stoneMid, toPal.stoneTop];
        for (let mi = 0; mi < 3; mi++) {
          mats[mi].color.copy(fromStones[mi]).lerp(toStones[mi], tb);
          emBases[mi].copy(fromPal.stoneEmissiveBase[mi]).lerp(toPal.stoneEmissiveBase[mi], tb);
        }
      }
      for (let mi = 0; mi < 3; mi++) {
        mats[mi].emissive.copy(emBases[mi]).lerp(stepBlockEmissiveFlash, Math.min(1, stepFlash));
        if (crumbleDarken > 0) {
          const pulse = cp >= 0.85 ? 0.5 + Math.sin(state.elapsed * 12) * 0.5 : 1;
          mats[mi].emissive.lerp(_crumbleWarnColor, crumbleDarken * 0.6 * pulse);
        }
        mats[mi].emissiveIntensity = 0.38 + stepFlash * 0.7;
      }
    }
  }

  for (const bed of groundBeds) {
    const bedFrontZ = bed.position.z + groundBedDepth * 0.5;
    if (bedFrontZ < colorCutoffZ && bed.userData.displayThemeIndex !== 0) {
      bed.userData.displayThemeIndex = 0;
      bed.userData.themeBlend = 1;
      bed.material.color.copy(themePalettes[0].groundBedColor);
    }
    const bedWave = waveActive ? getGroundWaveImpact(bed.position.z, waveFront, waveOpacity) : 0;
    if (bed.userData.displayThemeIndex !== state.themeIndex && state.themeIndex !== 0 && bedFrontZ > colorCutoffZ) {
      bed.userData.displayThemeIndex = state.themeIndex;
      bed.userData.themeBlend = 0;
    }
    if (state.themeTransitioning && bed.userData.displayThemeIndex !== 0) {
      bed.userData.themeBlend = Math.min(1, bed.userData.themeBlend + dt * 4);
    }
    if (bed.userData.displayThemeIndex === 0) {
      bed.material.color.copy(themePalettes[0].groundBedColor);
    } else if (bed.userData.themeBlend < 1) {
      const fromPal = bed.userData.displayThemeIndex === state.themeIndex ? prevPal : themePalettes[0];
      const toPal = themePalettes[bed.userData.displayThemeIndex];
      bed.material.color.copy(fromPal.groundBedColor).lerp(toPal.groundBedColor, bed.userData.themeBlend);
    }
  }

  if (playerLocalThemeBlend < 1) {
    flowerStemMaterial.color.copy(prevPal.floraStem).lerp(curPal.floraStem, playerLocalThemeBlend);
    flowerCenterMaterial.color.copy(prevPal.floraCenter).lerp(curPal.floraCenter, playerLocalThemeBlend);
    flowerCenterMaterial.emissive.copy(prevPal.floraCenter).lerp(curPal.floraCenter, playerLocalThemeBlend);
    for (const pm of flowerPetalMaterials) {
      pm.color.copy(prevPal.floraPetal).lerp(curPal.floraPetal, playerLocalThemeBlend);
    }
    for (const gm of grassMaterials) {
      gm.color.copy(prevPal.floraGrass).lerp(curPal.floraGrass, playerLocalThemeBlend);
    }
  }

  updateHazards(dt);

  const sceneryFrontZ = bunny.position.z + SCENERY_FRONT_Z_OFFSET;
  for (const item of scenery) {
    const wrapDepth = item.userData.recycleDepth;
    const sceneryBackZ = sceneryFrontZ - wrapDepth;
    let sceneryRecycled = false;
    if (item.position.z > sceneryFrontZ) {
      item.position.z -= wrapDepth;
      sceneryRecycled = true;
      if (item.userData.kind === "bush" && Math.random() > 0.55) {
        item.userData.rowIndex = Math.floor(Math.random() * SIDE_TERRACE_ROWS);
      }
      item.userData.xJitter = randomRange(-0.28, 0.28);
      item.position.x = getSideTerraceX(
        item.userData.side,
        item.userData.rowIndex,
        item.userData.xJitter
      );
      while (item.position.z > sceneryFrontZ) {
        item.position.z -= wrapDepth;
      }
    }
    while (item.position.z < sceneryBackZ) {
      item.position.z += wrapDepth;
      sceneryRecycled = true;
    }
    if (sceneryRecycled) {
      item.userData.displayThemeIndex = 0;
      item.userData.themeBlend = 1;
      const mp = themePalettes[0];
      if (item.userData.kind === "tree") {
        item.userData.trunkMat.color.copy(mp.treeTrunk);
        item.userData.leafTopMat.color.copy(mp.treeLeafTop);
        item.userData.leafTopMat.emissive.copy(mp.treeLeafTop);
        item.userData.leafBottomMat.color.copy(mp.treeLeafBottom);
        item.userData.leafBottomMat.emissive.copy(mp.treeLeafBottom);
      } else if (item.userData.kind === "bush") {
        item.userData.bushMat.color.copy(mp.bushColor);
        item.userData.bushMat.emissive.copy(mp.bushColor);
      }
    }
    item.position.y =
      getSideTerraceTopY(item.position.z, item.userData.rowIndex) +
      (item.userData.baseYOffset ?? 0.1);
    if (!isMobile) {
      item.rotation.y = Math.sin(state.elapsed * 0.9 + item.userData.swayOffset) * 0.08;
      item.rotation.z = Math.sin(state.elapsed * 0.7 + item.userData.swayOffset * 1.4) * 0.02;
    }
    if (item.position.z < colorCutoffZ && item.userData.displayThemeIndex !== 0) {
      item.userData.displayThemeIndex = 0;
      item.userData.themeBlend = 1;
      const mp2 = themePalettes[0];
      if (item.userData.kind === "tree") {
        item.userData.trunkMat.color.copy(mp2.treeTrunk);
        item.userData.leafTopMat.color.copy(mp2.treeLeafTop);
        item.userData.leafTopMat.emissive.copy(mp2.treeLeafTop);
        item.userData.leafBottomMat.color.copy(mp2.treeLeafBottom);
        item.userData.leafBottomMat.emissive.copy(mp2.treeLeafBottom);
      } else if (item.userData.kind === "bush") {
        item.userData.bushMat.color.copy(mp2.bushColor);
        item.userData.bushMat.emissive.copy(mp2.bushColor);
      }
    }
    const itemWave = waveActive ? getGroundWaveImpact(item.position.z, waveFront, waveOpacity) : 0;
    if (item.userData.displayThemeIndex !== state.themeIndex && state.themeIndex !== 0 && item.position.z > colorCutoffZ) {
      item.userData.displayThemeIndex = state.themeIndex;
      item.userData.themeBlend = 0;
    }
    if (state.themeTransitioning && item.userData.displayThemeIndex !== 0) {
      const rate = itemWave > 0.1 ? 8 : 3;
      item.userData.themeBlend = Math.min(1, item.userData.themeBlend + dt * rate);
    }
    if (item.userData.themeBlend < 1 && item.userData.displayThemeIndex !== 0) {
      const fromIdx = item.userData.displayThemeIndex === state.themeIndex ? state.prevThemeIndex : 0;
      const fp = themePalettes[fromIdx];
      const tp = themePalettes[item.userData.displayThemeIndex];
      const tb = item.userData.themeBlend;
      if (item.userData.kind === "tree") {
        item.userData.trunkMat.color.copy(fp.treeTrunk).lerp(tp.treeTrunk, tb);
        item.userData.leafTopMat.color.copy(fp.treeLeafTop).lerp(tp.treeLeafTop, tb);
        item.userData.leafTopMat.emissive.copy(fp.treeLeafTop).lerp(tp.treeLeafTop, tb);
        item.userData.leafBottomMat.color.copy(fp.treeLeafBottom).lerp(tp.treeLeafBottom, tb);
        item.userData.leafBottomMat.emissive.copy(fp.treeLeafBottom).lerp(tp.treeLeafBottom, tb);
      } else if (item.userData.kind === "bush") {
        item.userData.bushMat.color.copy(fp.bushColor).lerp(tp.bushColor, tb);
        item.userData.bushMat.emissive.copy(fp.bushColor).lerp(tp.bushColor, tb);
      }
    }
  }
}

function updateBackgroundFlash(dt) {
  if (state.flashTimer > 0) {
    state.flashTimer = Math.max(0, state.flashTimer - dt);
  }
  if (state.effects.dashFlashTimer > 0) {
    state.effects.dashFlashTimer = Math.max(0, state.effects.dashFlashTimer - dt);
  }
  if (state.effects.deathFlashTimer > 0) {
    state.effects.deathFlashTimer = Math.max(0, state.effects.deathFlashTimer - dt);
  }
  if (state.effects.eggCollectTimer > 0) {
    state.effects.eggCollectTimer = Math.max(
      0,
      state.effects.eggCollectTimer - dt
    );
  }

  const scoreBoost = state.flashTimer > 0 ? state.flashTimer / 0.12 : 0;
  const dashBoost =
    state.effects.dashFlashTimer > 0
      ? state.effects.dashFlashTimer / DASH_FLASH_TIME
      : 0;
  const waveBoost = state.effects.groundWaveOpacity;
  const eggBoost =
    state.effects.eggCollectTimer > 0
      ? state.effects.eggCollectTimer / EGG_COLLECT_FLASH_TIME
      : 0;
  const deathFlashBoost =
    state.effects.deathFlashTimer > 0
      ? state.effects.deathFlashTimer / DEATH_FLASH_TIME
      : 0;
  const deathModeBoost =
    state.mode === "dying"
      ? 0.24 +
      Math.abs(Math.sin(state.elapsed * 18)) *
      (1 - state.death.timer / Math.max(0.0001, DEATH_ANIM_TIME)) *
      0.28
      : 0;
  const deathBoost = Math.min(1, deathFlashBoost * 0.86 + deathModeBoost);
  const boost = Math.min(
    1,
    scoreBoost * 0.52 +
    dashBoost * 0.85 +
    waveBoost * 0.28 +
    eggBoost * 0.78 +
    deathBoost * 0.72
  );
  const gtb = state.playerLocalThemeBlend ?? 1;
  const pPal = themePalettes[state.prevThemeIndex];
  const cPal = themePalettes[state.themeIndex];
  const themeBg = _themeTemp.copy(pPal.bgColor).lerp(cPal.bgColor, gtb);
  _bgColor.setRGB(
    THREE.MathUtils.lerp(themeBg.r, themeBg.r + 0.12, boost),
    THREE.MathUtils.lerp(themeBg.g, themeBg.g + 0.08, boost),
    THREE.MathUtils.lerp(themeBg.b, themeBg.b + 0.06, boost)
  );
  if (deathBoost > 0) {
    _bgColor.lerp(_deathFlashColor, deathBoost * 0.18);
  }
  scene.background.copy(_bgColor);
  scene.fog.color.copy(_bgColor);

  furMat.emissiveIntensity = 0.15 + eggBoost * 0.68 + deathBoost * 0.24;
  earMat.emissiveIntensity = 0.12 + eggBoost * 0.62 + deathBoost * 0.22;
  bellyMat.emissiveIntensity = 0.1 + eggBoost * 0.54 + deathBoost * 0.22;
  pinkMat.emissiveIntensity = 0.25 + eggBoost * 0.42 + deathBoost * 0.16;
  irisMat.emissiveIntensity = 0.5 + eggBoost * 0.3 + deathBoost * 0.26;

  if (dashFlash) {
    dashFlash.style.opacity = String(
      Math.min(
        0.95,
        dashBoost * 0.86 + waveBoost * 0.22 + eggBoost * 0.3 + deathBoost * 0.62
      )
    );
  }

  if (crumbleVignette) {
    const cp = state.player.crumbleProgress;
    const showVignette =
      (cp > CRUMBLE_SELF_SHAKE_START && state.mode === "playing") ||
      (state.mode === "dying" && state.death.isCrumbleDeath);
    if (showVignette) {
      const vignettePhase = state.death.isCrumbleDeath
        ? 1
        : (cp - CRUMBLE_SELF_SHAKE_START) / (1 - CRUMBLE_SELF_SHAKE_START);
      crumbleVignette.style.opacity = String(Math.min(0.85, vignettePhase * 0.85));
    } else {
      crumbleVignette.style.opacity = "0";
    }
  }
}

function updateCamera(dt) {
  if (state.mode === "home") {
    const t = state.elapsed;
    const camX = Math.sin(t * 0.21) * 4.2 + Math.sin(t * 0.08) * 1.6;
    const camY = 16.0 + Math.sin(t * 0.16) * 0.7;
    const camZ = bunny.position.z + 14.6;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(camX * 0.06, 0.9, bunny.position.z + CAMERA_LOOK_Z_OFFSET);
    camera.fov = CAMERA_FOV_HOME;
    camera.updateProjectionMatrix();
    return;
  }
  state.camera.catchupTimer = Math.max(0, state.camera.catchupTimer - dt);
  const lowFpsBlend = state.performance.lowFpsBlend;
  const deathProgress =
    state.mode === "dying"
      ? 1 - state.death.timer / Math.max(0.0001, DEATH_ANIM_TIME)
      : 0;
  const deathEase = THREE.MathUtils.smoothstep(deathProgress, 0, 1);
  const jumpDuration = Math.max(0.0001, state.player.jumpDuration);
  const jumpLead =
    state.mode === "playing" && state.player.jumpTimer > 0
      ? -1.55 * (state.player.jumpTimer / jumpDuration)
      : 0;
  const deathLead = deathEase * DEATH_CAMERA_PULLBACK;
  const targetCameraZ =
    bunny.position.z + (CAMERA_BASE_Z - PLAYER_BASE_Z) + jumpLead + deathLead;
  const targetCameraY = CAMERA_BASE_HEIGHT + bunny.position.y * 0.11 + deathEase * DEATH_CAMERA_RISE;
  const damp = state.camera.catchupTimer > 0
    ? THREE.MathUtils.lerp(CAMERA_CATCHUP_DAMP, CAMERA_CATCHUP_DAMP * 1.18, lowFpsBlend)
    : THREE.MathUtils.lerp(CAMERA_FOLLOW_DAMP, CAMERA_FOLLOW_DAMP * 1.2, lowFpsBlend);
  const deathDampScale = state.mode === "dying" ? 0.78 : 1;
  state.camera.z = THREE.MathUtils.damp(
    state.camera.z,
    targetCameraZ,
    damp * deathDampScale,
    dt
  );
  state.camera.y = THREE.MathUtils.damp(
    state.camera.y,
    targetCameraY,
    damp * 0.9 * deathDampScale,
    dt
  );

  state.effects.shakeTimer = Math.max(0, state.effects.shakeTimer - dt);
  const shakeAmount =
    state.effects.shakeTimer > 0
      ? (state.effects.shakeTimer / DASH_SHAKE_TIME) * state.effects.shakePower
      : 0;
  const deathShake =
    state.mode === "dying"
      ? (1 - deathEase) * (0.09 + Math.abs(Math.sin(state.elapsed * 24)) * 0.03)
      : 0;
  const smoothShakeAmount =
    shakeAmount * THREE.MathUtils.lerp(1, 0.72, lowFpsBlend) + deathShake;
  const shakeTime = state.elapsed * THREE.MathUtils.lerp(42, 26, lowFpsBlend);
  const shakeX = Math.sin(shakeTime + 0.7) * smoothShakeAmount * 0.48;
  const shakeY = Math.sin(shakeTime * 0.83 + 1.9) * smoothShakeAmount * 0.35;
  const shakeZ = Math.sin(shakeTime * 0.71 + 2.8) * smoothShakeAmount * 0.22;

  camera.position.set(shakeX, state.camera.y + shakeY, state.camera.z + shakeZ);
  camera.lookAt(
    shakeX * 0.2 + bunny.position.x * 0.1,
    bunny.position.y * CAMERA_LOOK_Y_FACTOR + shakeY * 0.1 - deathEase * 0.12,
    bunny.position.z + CAMERA_LOOK_Z_OFFSET + jumpLead * 0.45 - deathEase * 0.86
  );
}

function update(dt) {
  state.elapsed += dt;
  if (state.mode === "home") {
    bunny.position.z += dt * 3.2;
    updateCamera(dt);
    return;
  }
  if (state.mode === "gameover") return;
  const worldDt = state.mode === "dying" ? dt * DEATH_WORLD_TIME_SCALE : dt;
  updatePlayer(dt);
  updateDashTrail(worldDt);
  updateWorld(worldDt);
  updateBackgroundFlash(dt);
  updateCamera(dt);
}

function render() {
  renderer.render(scene, camera);
}


function onPointerDown() {
  if (isSettingsOpen()) return;
  input.pointerDown = true;
  triggerJump();
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key === "escape" && isSettingsOpen()) {
    event.preventDefault();
    closeSettings();
    triggerHaptic("light");
    return;
  }
  if (isSettingsOpen()) return;
  if (key === " " || key === "spacebar") {
    event.preventDefault();
    triggerJump();
  }
  if (key === "enter" && (state.mode === "home" || state.mode === "gameover")) {
    triggerCloudTransition();
  }
}

function onKeyUp() {
  input.pointerDown = false;
}

canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("resize", setCanvasSize);

bindPressAction(startButton, () => {
  sfxButtonClick();
  triggerHaptic("light");
  triggerCloudTransition();
});


bindPressAction(settingsButton, () => {
  sfxButtonClick();
  if (isSettingsOpen()) {
    closeSettings();
  } else {
    openSettings();
    settingsOpenedAt = performance.now();
  }
  triggerHaptic("light");
});

bindPressAction(settingsCloseButton, () => {
  sfxButtonClick();
  closeSettings();
  triggerHaptic("light");
});

if (settingsModal) {
  // Close when clicking the native backdrop
  settingsModal.addEventListener("pointerup", (e) => {
    if (e.target === settingsModal) {
      // Ignore the same tap that opened the dialog; prevents flaky open/instant-close on mobile.
      if (performance.now() - settingsOpenedAt < 180) return;
      closeSettings();
      triggerHaptic("light");
    }
  });

  settingsModal.addEventListener("cancel", () => {
    triggerHaptic("light");
  });
}

bindPressAction(musicToggleButton, () => {
  sfxButtonClick();
  settings.music = !settings.music;
  saveSettings();
  renderSettingsUI();
  updateMusicState();
  triggerHaptic("light");
});

bindPressAction(fxToggleButton, () => {
  sfxButtonClick();
  settings.fx = !settings.fx;
  saveSettings();
  renderSettingsUI();
  triggerHaptic("light");
});

bindPressAction(hapticsToggleButton, () => {
  sfxButtonClick();
  settings.haptics = !settings.haptics;
  saveSettings();
  renderSettingsUI();
  triggerHaptic("light");
});

function toShort(value) {
  return Number(value.toFixed(2));
}

function renderGameToText() {
  const current = getStepBlock(state.player.currentBlock);
  const next = getStepBlock(state.player.currentBlock + 1);
  const activeHazard = getHazardSlot(state.player.currentBlock);
  let laneGap = null;
  let activeOrbVisible = null;
  let activeOrbCount = null;
  let activeOrbDecay = null;
  let activePattern = null;
  let activeRockCount = null;
  if (activeHazard) {
    laneGap = activeHazard.userData.rocks.reduce((minValue, rock) => {
      if (!rock.visible) return minValue;
      const worldX = activeHazard.position.x + rock.position.x;
      const worldZ = activeHazard.position.z + rock.position.z;
      const distance = Math.hypot(worldX, worldZ - bunny.position.z);
      return Math.min(minValue, distance);
    }, Infinity);
    if (!Number.isFinite(laneGap)) {
      laneGap = null;
    }
    activeOrbVisible = activeHazard.userData.collected !== true;
    activeOrbCount = activeHazard.userData.orbCount ?? 1;
    activeOrbDecay = Math.max(0, activeHazard.userData.orbDecayTimer ?? 0);
    activePattern = activeHazard.userData.patternType;
    activeRockCount = activeHazard.userData.activeRockCount;
  }
  const payload = {
    mode: state.mode,
    coordinateSystem:
      "Origin is center of lane. +x right, +z toward player/camera, +y up.",
    score: state.score,
    player: {
      z: toShort(getPlayerRenderedZ()),
      laneZ: toShort(getPlayerLaneZ()),
      y: toShort(bunny.position.y),
      jumpActive: state.player.jumpTimer > 0,
      jumpCooldown: toShort(state.player.cooldown),
      currentBlock: state.player.currentBlock,
      targetBlock: state.player.toBlock,
      jumpProgress: toShort(state.player.progress),
    },
    camera: {
      z: toShort(camera.position.z),
      y: toShort(camera.position.y),
      catchupActive: state.camera.catchupTimer > 0,
      lowFpsSmoothMode: state.performance.lowFpsMode,
      lowFpsBlend: toShort(state.performance.lowFpsBlend),
    },
    effects: {
      dashFlash: state.effects.dashFlashTimer > 0,
      orbCollectFlash: state.effects.eggCollectTimer > 0,
      groundWave: state.effects.groundWaveOpacity > 0,
      screenShake: state.effects.shakeTimer > 0,
      deathAnimation: state.mode === "dying",
      deathAnimationTimeLeft: state.mode === "dying" ? toShort(state.death.timer) : 0,
      deathFlash: state.effects.deathFlashTimer > 0,
      deathShockwave: deathShockwave.visible,
      trailRing: state.effects.trailRingTimer > 0,
      dashRibbon: state.effects.dashRibbonTimer > 0,
      trailParticles: dashTrail.filter((particle) => particle.life > 0).length,
      orbBurstParticles: eggBurstParticles.filter((particle) => particle.life > 0).length,
    },
    path: {
      lane: "single",
      infinite: true,
      blockSpacingInTiles: STEP_BLOCK_INTERVAL,
      pooledBlocks: stepBlocks.length,
      furthestGeneratedBlock: state.course.furthestBlock,
      currentBlockY: toShort(current.position.y),
      nextBlockY: toShort(next.position.y),
    },
    hazards: {
      rotatingRocks: true,
      mixedRockCounts: true,
      rockCountVariants: HAZARD_ROCK_COUNT_VARIANTS,
      glowingOrbAtCenter: true,
      activeSegment: state.player.currentBlock,
      activePattern,
      activeRockCount,
      activeOrbCount,
      activeOrbDecaySeconds: activeOrbDecay === null ? null : toShort(activeOrbDecay),
      activeOrbVisible,
      laneGap: laneGap === null ? null : toShort(laneGap),
      safeGap: HAZARD_SAFE_GAP,
      blockedNow: laneGap === null ? false : laneGap < HAZARD_SAFE_GAP,
    },
    controls: {
      jump: "Click or Space",
      startReplay: "Enter or PLAY button",
      fullscreen: "F",
    },
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    update(FIXED_STEP);
  }
  render();
};

let previous = 0;
let accumulator = 0;
let fpsFrames = 0;
let fpsTimer = 0;
let rafId = 0;

function startLoop() {
  if (rafId) return;
  previous = 0;
  rafId = requestAnimationFrame(animationLoop);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function animationLoop(now) {
  if (!previous) previous = now;
  const frameSeconds = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  const instantFps = frameSeconds > 0 ? 1 / frameSeconds : 60;
  state.performance.fps = THREE.MathUtils.lerp(state.performance.fps, instantFps, 0.14);

  if (state.performance.fps < LOW_FPS_THRESHOLD) {
    state.performance.lowFpsTimer += frameSeconds;
    state.performance.highFpsTimer = 0;
    if (state.performance.lowFpsTimer >= LOW_FPS_ENTER_TIME && !state.performance.lowFpsMode) {
      state.performance.lowFpsMode = true;
      renderer.setPixelRatio(1);
    }
  } else {
    state.performance.highFpsTimer += frameSeconds;
    state.performance.lowFpsTimer = 0;
    if (state.performance.highFpsTimer >= LOW_FPS_EXIT_TIME && state.performance.lowFpsMode) {
      state.performance.lowFpsMode = false;
      renderer.setPixelRatio(BASE_PIXEL_RATIO);
    }
  }

  const targetBlend = state.performance.lowFpsMode ? 1 : 0;
  state.performance.lowFpsBlend = THREE.MathUtils.damp(
    state.performance.lowFpsBlend,
    targetBlend,
    6.2,
    frameSeconds
  );

  fpsFrames += 1;
  fpsTimer += frameSeconds;
  if (fpsTimer >= 0.5) {
    if (fpsEl) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsTimer)} FPS`;
    }
    fpsFrames = 0;
    fpsTimer = 0;
  }

  accumulator += frameSeconds;

  while (accumulator >= FIXED_STEP) {
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  render();
  rafId = requestAnimationFrame(animationLoop);
}

oasiz.onPause(() => {
  stopLoop();
  if (currentBgMusic && !currentBgMusic.paused) {
    currentBgMusic.pause();
  }
});

oasiz.onResume(() => {
  if (state.mode !== "gameover") {
    startLoop();
  }
  updateMusicState();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else if (state.mode !== "gameover" && !isSettingsOpen()) {
    startLoop();
  }
});

setMenu(
  "CHROMABOUND",
  "Dash through an endless path. Collect orbs to bring color back to the world.",
  "PLAY"
);
renderSettingsUI();
closeSettings();
tutorial.classList.add("hidden");
setHudVisibility(false);
updateHud();
setCanvasSize();
updateMusicState();
startLoop();
