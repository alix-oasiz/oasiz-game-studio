import * as THREE from "three";

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
const PLAYER_BLOCK_OFFSET_Y = 0.66;
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
const DEATH_ANIM_TIME = 1.16;
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

const canvas = document.querySelector("#game-canvas");
const fpsEl = document.querySelector("#fps");
const menu = document.querySelector("#menu");
const menuTitle = document.querySelector("#menu-title");
const menuText = document.querySelector("#menu-text");
const startButton = document.querySelector("#start-btn");
const cloudVeil = document.querySelector("#cloud-veil");
const hud = document.querySelector("#hud");
const tutorial = document.querySelector("#tutorial");
const dashFlash = document.querySelector("#dash-flash");
const shell = document.querySelector("#game-shell");
const settingsButton = document.querySelector("#settings-btn");
const settingsModal = document.querySelector("#settings-modal");
const settingsCloseButton = document.querySelector("#settings-close");
const musicToggleButton = document.querySelector("#toggle-music");
const fxToggleButton = document.querySelector("#toggle-fx");
const hapticsToggleButton = document.querySelector("#toggle-haptics");

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
  if (typeof window.triggerHaptic === "function") {
    window.triggerHaptic(type);
  }
}

function openSettings() {
  if (!settingsModal) return;
  renderSettingsUI();
  settingsModal.showModal();
}

function closeSettings() {
  if (!settingsModal || !settingsModal.open) return;
  settingsModal.close();
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6d88d8);
scene.fog = new THREE.Fog(0x6d88d8, 12, isMobile ? 46 : 72);

const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, isMobile ? 100 : 180);
camera.position.set(0, CAMERA_BASE_HEIGHT, CAMERA_BASE_Z);
camera.lookAt(0, 0, PLAYER_BASE_Z + CAMERA_LOOK_Z_OFFSET);

const ambient = new THREE.AmbientLight(0xffffff, 0.84);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff9ec, 0.74);
sun.position.set(10, 18, 7);
scene.add(sun);

const sideFill = new THREE.DirectionalLight(0x78d7ff, 0.45);
sideFill.position.set(-15, 6, 5);
scene.add(sideFill);

const state = {
  mode: "home",
  elapsed: 0,
  score: 0,
  worldSpeed: 0,
  flashTimer: 0,
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
  },
};

const input = {
  pointerDown: false,
};

const bgMusicAudio = new Audio("/sounds/bg-music.mp3");
bgMusicAudio.loop = true;

// Define WebAudio properties to prevent HTML5 audio source stalling.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let dashAudioBuffer = null;

// Fetch and decode the audio file asynchronously so playing it won't stall the main thread
fetch("/sounds/dash.mp3")
  .then((response) => response.arrayBuffer())
  .then((arrayBuffer) => audioCtx.decodeAudioData(arrayBuffer))
  .then((audioBuffer) => {
    dashAudioBuffer = audioBuffer;
  })
  .catch((e) => console.log("Failed to load dash audio", e));

function playDashSound() {
  if (!settings.fx || !dashAudioBuffer) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Create an impermanent source node for the lightweight buffer memory
  const source = audioCtx.createBufferSource();
  source.buffer = dashAudioBuffer;

  // Create a GainNode to multiply the volume by 6
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 6.0;

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

function updateMusicState() {
  if (settings.music) {
    bgMusicAudio.play().catch(() => { });
  } else {
    bgMusicAudio.pause();
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

const tilePalette = [0x2558b8, 0x2f73cf, 0x2d8acb, 0x4faed8, 0x325ea8];

const tileGeom = new THREE.BoxGeometry(1.94, 0.72, 1.94);
const pathDepth = TILE_ROWS * TILE_SIZE;

for (let row = 0; row < TILE_ROWS; row += 1) {
  for (let col = 0; col < TILE_COLUMNS; col += 1) {
    const tileColor =
      tilePalette[(row + col + Math.floor(Math.random() * 2)) % tilePalette.length];
    const mesh = new THREE.Mesh(
      tileGeom,
      new THREE.MeshStandardMaterial({
        color: tileColor,
        roughness: 0.94,
        metalness: 0.02,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      })
    );
    const x = (col - (TILE_COLUMNS - 1) / 2) * TILE_SIZE;
    const z = PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE;
    mesh.position.set(x, -0.35, z);
    mesh.userData = {
      bobOffset: Math.random() * Math.PI * 2,
      bobAmount: 0.06 + Math.random() * 0.06,
      waveLift: 0,
    };
    scene.add(mesh);
    tiles.push(mesh);
  }
}

const sideTerracePalette = [0x2d4399, 0x3e62b6, 0x2f7fbe, 0x4b9fd2, 0x304f9f];
const sideTerraceGeom = new THREE.BoxGeometry(1.94, SIDE_TERRACE_BLOCK_HEIGHT, 1.94);
for (let row = 0; row < TILE_ROWS; row += 1) {
  const z = PLAYER_BASE_Z + TILE_SIZE - row * TILE_SIZE;
  for (const side of [-1, 1]) {
    for (let rowIndex = 0; rowIndex < SIDE_TERRACE_ROWS; rowIndex += 1) {
      const xJitter = randomRange(-0.08, 0.08);
      const topY = getSideTerraceTopY(z, rowIndex);
      const mesh = new THREE.Mesh(
        sideTerraceGeom,
        new THREE.MeshStandardMaterial({
          color:
            sideTerracePalette[
            (row + rowIndex + (side > 0 ? 1 : 0)) % sideTerracePalette.length
            ],
          roughness: 0.88,
          metalness: 0.02,
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
      };
      scene.add(mesh);
      sideTerraces.push(mesh);
    }
  }
}

const groundBedDepth = pathDepth + 18;
const groundBedCycleDepth = groundBedDepth * 3;
const groundBedWidth = PATH_HALF_WIDTH * 2 + SIDE_TERRACE_ROWS * TILE_SIZE * 2.65;
const groundBeds = [];
for (let i = 0; i < 3; i += 1) {
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(groundBedWidth, 2.6, groundBedDepth),
    new THREE.MeshStandardMaterial({
      color: 0x1f2f6e,
      roughness: 0.96,
      metalness: 0.01,
    })
  );
  bed.position.set(
    0,
    -1.82,
    PLAYER_BASE_Z - pathDepth * 0.5 + (i - 1) * groundBedDepth
  );
  scene.add(bed);
  groundBeds.push(bed);
}

const stepBlockGeometry = new THREE.BoxGeometry(1.42, 0.82, 1.42);
const stepBlockMaterial = new THREE.MeshStandardMaterial({
  color: 0xff87ca,
  emissive: 0xc75394,
  emissiveIntensity: 0.38,
  roughness: 0.42,
  metalness: 0.08,
});
const stepBlockEmissiveBase = new THREE.Color(0xc75394);
const stepBlockEmissiveFlash = new THREE.Color(0xffffff);

function applyStepBlockLayout(block, stepIndex) {
  const y = getStepBlockY(stepIndex);
  block.position.set(0, y, getBlockZ(stepIndex));
  block.rotation.set(0, (stepIndex % 2 === 0 ? 1 : -1) * 0.08, 0);
  block.userData.baseY = y;
  block.userData.waveOffset = stepIndex * 0.35;
  block.userData.stepIndex = stepIndex;
  block.userData.waveLift = 0;
}

for (let index = 0; index < STEP_BLOCK_COUNT; index += 1) {
  const block = new THREE.Mesh(stepBlockGeometry, stepBlockMaterial);
  block.userData = {};
  applyStepBlockLayout(block, index);
  scene.add(block);
  stepBlocks.push(block);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

const flowerStemGeometry = new THREE.CylinderGeometry(0.03, 0.05, 0.26, 5);
const flowerPetalGeometry = new THREE.ConeGeometry(0.11, 0.24, 4);
const flowerCenterGeometry = new THREE.IcosahedronGeometry(0.075, 0);
const grassBladeGeometry = new THREE.ConeGeometry(0.07, 0.34, 4);
const flowerStemMaterial = new THREE.MeshStandardMaterial({
  color: 0x62de93,
  roughness: 0.72,
});
const flowerCenterMaterial = new THREE.MeshStandardMaterial({
  color: 0xffed7b,
  emissive: 0xffda62,
  emissiveIntensity: 0.22,
  roughness: 0.44,
});
const flowerPetalMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xff63be, roughness: 0.56 }),
  new THREE.MeshStandardMaterial({ color: 0xff8f52, roughness: 0.56 }),
  new THREE.MeshStandardMaterial({ color: 0xc57bff, roughness: 0.56 }),
  new THREE.MeshStandardMaterial({ color: 0x6be4ff, roughness: 0.56 }),
];
const grassMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x50cf89, roughness: 0.86 }),
  new THREE.MeshStandardMaterial({ color: 0x56e29f, roughness: 0.86 }),
  new THREE.MeshStandardMaterial({ color: 0x75d8a4, roughness: 0.86 }),
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

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 1.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x6d4267, roughness: 0.9 })
  );
  trunk.position.y = 0.4;
  root.add(trunk);

  const colorPairs =
    side > 0
      ? [
        [0xff9fe4, 0xff5db6],
        [0xffdea1, 0xffb86a],
        [0x72e7ff, 0x45c2ff],
      ]
      : [
        [0xe4b6ff, 0xc382ff],
        [0x7bd6ff, 0x49b7ff],
        [0xff95df, 0xff57c1],
      ];
  const picked = colorPairs[Math.floor(Math.random() * colorPairs.length)];
  const [colorTop, colorBottom] = picked;
  const coneBottom = new THREE.Mesh(
    new THREE.ConeGeometry(randomRange(1.4, 2.1), randomRange(2.5, 3.2), 5),
    new THREE.MeshStandardMaterial({
      color: colorBottom,
      roughness: 0.8,
      emissive: colorBottom,
      emissiveIntensity: 0.08,
    })
  );
  coneBottom.position.y = 1.8;
  root.add(coneBottom);

  const coneTop = new THREE.Mesh(
    new THREE.ConeGeometry(randomRange(1.0, 1.6), randomRange(1.6, 2.1), 5),
    new THREE.MeshStandardMaterial({
      color: colorTop,
      roughness: 0.78,
      emissive: colorTop,
      emissiveIntensity: 0.06,
    })
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
  };

  scene.add(root);
  scenery.push(root);
}

function createBush(side) {
  const rowIndex = Math.floor(Math.random() * SIDE_TERRACE_ROWS);
  const xJitter = randomRange(-0.26, 0.26);
  const bushColor =
    side > 0
      ? [0xff8ed0, 0xf570e6, 0x82dbff][Math.floor(Math.random() * 3)]
      : [0x73d7ff, 0x84b4ff, 0xc695ff][Math.floor(Math.random() * 3)];
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(randomRange(0.45, 0.78)),
    new THREE.MeshStandardMaterial({
      color: bushColor,
      roughness: 0.76,
      emissive: bushColor,
      emissiveIntensity: 0.06,
    })
  );
  const z = randomRange(-128, 14);
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

const bunny = new THREE.Group();

// --- Materials ---
const furMat = new THREE.MeshStandardMaterial({
  color: 0xb3b3ff, // cool lavender-blue mix
  emissive: 0x4a2cba, // deep purple glow
  emissiveIntensity: 0.15,
  roughness: 0.75,
  metalness: 0.1,
});

const bellyMat = new THREE.MeshStandardMaterial({
  color: 0xe0f7fa, // cool ice cyan-white
  emissive: 0x004466,
  emissiveIntensity: 0.15,
  roughness: 0.85,
});

const pinkMat = new THREE.MeshStandardMaterial({
  color: 0x00ffff, // cyan neon inner accent
  emissive: 0x0088ff,
  emissiveIntensity: 0.35,
  roughness: 0.4,
});

const eyeMat = new THREE.MeshStandardMaterial({
  color: 0x050505,
  roughness: 0.1,
  metalness: 0.8,
});

const irisMat = new THREE.MeshStandardMaterial({
  color: 0x0099ff,
  emissive: 0x0055ff,
  emissiveIntensity: 0.5,
  roughness: 0.2,
});



// --- Body ---
// Pear shaped body
const bodyGroup = new THREE.Group();
bunny.add(bodyGroup);

const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 32), furMat);
lowerBody.scale.set(1.0, 0.95, 1.05);
lowerBody.position.set(0, 0.7, 0);
bodyGroup.add(lowerBody);

const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), furMat);
upperBody.scale.set(1.0, 0.9, 1.0);
upperBody.position.set(0, 1.2, 0.05);
bodyGroup.add(upperBody);

// Belly white patch
const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), bellyMat);
bellyPatch.scale.set(0.85, 0.9, 0.3);
bellyPatch.position.set(0, 0.75, -0.72);
bodyGroup.add(bellyPatch);

// --- Head ---
const headGroup = new THREE.Group();
headGroup.position.set(0, 1.7, -0.05);
bunny.add(headGroup);

const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 32), furMat);
headMesh.scale.set(1.15, 0.9, 1.05);
headGroup.add(headMesh);

const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), bellyMat);
muzzle.scale.set(1.25, 0.8, 0.95);
muzzle.position.set(0, -0.15, -0.68);
headGroup.add(muzzle);

const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), pinkMat);
nose.scale.set(1.2, 0.7, 0.8);
nose.position.set(0, 0.02, -1.04);
headGroup.add(nose);

// Cheeks
const cheekGeo = new THREE.SphereGeometry(0.18, 16, 16);
const cheekMatColor = new THREE.MeshStandardMaterial({
  color: 0xff88aa,
  emissive: 0xff3366,
  emissiveIntensity: 0.35,
  transparent: true,
  opacity: 0.65,
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
  const baseEye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 24), eyeMat);
  baseEye.scale.set(0.85, 1, 0.35);
  eyeGroup.add(baseEye);

  // Iris color
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), irisMat);
  iris.scale.set(0.85, 1, 0.35);
  iris.position.set(0, -0.02, -0.04);
  eyeGroup.add(iris);

  // Huge cute highlight
  const shine1 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), bellyMat);
  shine1.position.set(-0.045, 0.06, -0.08);
  eyeGroup.add(shine1);

  // Small secondary highlight
  const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), bellyMat);
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

// --- Ears (Animated) ---
function createEar(side) {
  const earGroup = new THREE.Group();
  // Anchor points for rotation
  const baseX = side * 0.35; // Moved closer together
  const baseY = 2.4;
  const baseZ = -0.05;
  const baseRotZ = side * -0.4; // Point a bit more upwards
  const baseRotX = -0.15;

  earGroup.position.set(baseX, baseY, baseZ);
  earGroup.rotation.z = baseRotZ;
  earGroup.rotation.x = baseRotX;

  // Ear base - shorter capsule
  const earOuter = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.9, 16, 16), furMat);
  earOuter.position.y = 0.45;
  earOuter.rotation.x = 0.12;
  earOuter.scale.set(1, 1, 0.4);
  earGroup.add(earOuter);

  // Inner ear glowing cyan
  const earInner = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.7, 16, 16), pinkMat);
  earInner.position.set(0, 0.45, -0.06);
  earInner.rotation.x = 0.12;
  earInner.scale.set(1, 1, 0.25);
  earGroup.add(earInner);

  // Glowing ear tip for extra aesthetic
  const earTip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), pinkMat);
  earTip.position.set(0, 0.9, 0.05);
  earTip.rotation.x = 0.12;
  earTip.scale.set(1, 1.2, 0.4);
  earGroup.add(earTip);

  bunny.add(earGroup);

  // Ensure we register them for animation
  earGroup.userData = { side, baseX, baseY, baseZ, baseRotX, baseRotZ };
  bunnyEars.push(earGroup);
}
createEar(-1);
createEar(1);

// --- Limbs & Tail ---
// Arms
const buildArm = (side) => {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 16, 16), furMat);
  arm.position.set(side * 0.58, 1.05, -0.2);
  arm.rotation.z = side * 0.45;
  arm.rotation.x = -0.4;

  const paw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), bellyMat);
  paw.position.set(0, -0.25, -0.05);
  arm.add(paw);

  bunny.add(arm);
};
buildArm(-1);
buildArm(1);

// Legs & Feet
const buildLeg = (side) => {
  // Thigh
  const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), furMat);
  thigh.scale.set(0.85, 1.15, 1.05);
  thigh.position.set(side * 0.52, 0.5, 0.15);
  thigh.rotation.z = side * 0.18;
  bunny.add(thigh);

  // Foot
  const footGroup = new THREE.Group();
  footGroup.position.set(side * 0.48, 0.18, -0.28);

  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 16, 16), bellyMat);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(1, 1, 0.65);
  footGroup.add(foot);

  // Cute Toe Beans!
  const beanMat = new THREE.MeshStandardMaterial({ color: 0xff66a3, roughness: 0.5 });
  const mainPad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), beanMat);
  mainPad.scale.set(1, 0.4, 1);
  mainPad.position.set(0, -0.09, 0.06);
  footGroup.add(mainPad);

  [-0.1, 0, 0.1].forEach((tx) => {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), beanMat);
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
const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), bellyMat);
tailGroup.add(t1);
const t2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), bellyMat);
t2.position.set(0.14, 0.12, 0.06);
tailGroup.add(t2);
const t3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), bellyMat);
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
  for (const ear of bunnyEars) {
    const { side, baseX, baseY, baseZ, baseRotX, baseRotZ } = ear.userData;
    const targetX = baseX * (1 - targetTuck * 0.48);
    const targetY = baseY - targetTuck * 0.22;
    const targetZ = baseZ + targetTuck * 0.22;
    const targetRotX = baseRotX - targetTuck * 0.64;
    const targetRotZ = baseRotZ * (1 - targetTuck * 0.72) - side * targetTuck * 0.06;
    ear.position.x = THREE.MathUtils.lerp(ear.position.x, targetX, lerpAmount);
    ear.position.y = THREE.MathUtils.lerp(ear.position.y, targetY, lerpAmount);
    ear.position.z = THREE.MathUtils.lerp(ear.position.z, targetZ, lerpAmount);
    ear.rotation.x = THREE.MathUtils.lerp(ear.rotation.x, targetRotX, lerpAmount);
    ear.rotation.z = THREE.MathUtils.lerp(ear.rotation.z, targetRotZ, lerpAmount);
  }
}

const trailGeometry = new THREE.IcosahedronGeometry(0.27, 1);
const dashTrail = [];
let dashTrailCursor = 0;
for (let i = 0; i < TRAIL_POOL_SIZE; i += 1) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xbdfdff,
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
    color: i % 2 === 0 ? 0x8ce9ff : 0xb995ff,
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
    color: 0x9eeeff,
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
    color: 0xff93c3,
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
    color: 0xff9fd2,
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
const _deathFlashColor = new THREE.Color(0xff9ecf);

const hazardRockMaterial = new THREE.MeshStandardMaterial({
  color: 0xe0e4e8,
  roughness: 0.82,
});

const hazardOrbMaterial = new THREE.MeshStandardMaterial({
  color: 0x8ce9ff,
  roughness: 0.24,
  metalness: 0.12,
  emissive: 0x3ca8ff,
  emissiveIntensity: 0.64,
});
const hazardOrbAuraMaterial = new THREE.MeshBasicMaterial({
  color: 0x9ad8ff,
  transparent: true,
  opacity: 0.28,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: true,
});
const hazardRingMaterial = new THREE.MeshStandardMaterial({
  color: 0xff9bd2,
  emissive: 0xf266b8,
  emissiveIntensity: 0.44,
  roughness: 0.45,
});
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
  slot.userData.orbAura.visible = true;
  slot.userData.ring.visible = true;
  slot.userData.orbScale = 1;
  setHazardOrbCount(slot, 1, false);
  slot.userData.orb.material.emissiveIntensity = slot.userData.orbBaseEmissive;
  slot.userData.orbAura.material.opacity = slot.userData.orbAuraBaseOpacity;
  for (const extra of slot.userData.orbExtras) {
    extra.visible = false;
    extra.userData.scale = 0.01;
    extra.scale.setScalar(0.01);
  }
}

function createHazardSlot(segmentIndex) {
  const slot = new THREE.Group();
  const rocks = [];
  for (let i = 0; i < HAZARD_ROCK_COUNT; i += 1) {
    const baseRadius = 0.86 + Math.random() * 0.14;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(baseRadius),
      hazardRockMaterial
    );
    rock.scale.set(1.18, 0.9, 1.02);
    rock.userData.colliderRadius = baseRadius * 1.02;
    rocks.push(rock);
    slot.add(rock);
  }

  const orbMaterial = hazardOrbMaterial.clone();
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), orbMaterial);
  orb.position.y = 0.25;
  slot.add(orb);

  const orbExtras = [];
  for (let i = 0; i < 2; i += 1) {
    const extraMaterial = hazardOrbMaterial.clone();
    extraMaterial.emissiveIntensity = 0.44;
    const extraOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 0), extraMaterial);
    extraOrb.visible = false;
    extraOrb.userData.scale = 0.01;
    extraOrb.scale.setScalar(0.01);
    slot.add(extraOrb);
    orbExtras.push(extraOrb);
  }

  const orbAuraMaterial = hazardOrbAuraMaterial.clone();
  const orbAura = new THREE.Mesh(new THREE.SphereGeometry(0.64, 16, 16), orbAuraMaterial);
  orbAura.position.y = 0.25;
  slot.add(orbAura);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.09, 12, 20),
    hazardRingMaterial
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.45;
  slot.add(ring);

  slot.userData = {
    rocks,
    orb,
    orbExtras,
    orbAura,
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
    orbAuraBaseOpacity: orbAuraMaterial.opacity,
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

function setMenu(title, text, buttonText) {
  menuTitle.textContent = title;
  menuText.textContent = text;
  startButton.textContent = buttonText;
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
  return block.position.y + 0.41 + PLAYER_BLOCK_OFFSET_Y;
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
  particle.mesh.material.color.setHex(Math.random() > 0.45 ? 0x9ae7ff : 0xbb9dff);
  particle.mesh.material.opacity = 0.9;
  particle.mesh.scale.setScalar(particle.baseScale);
  particle.mesh.visible = true;
}

function triggerOrbCollectEffects(hazard) {
  state.effects.eggCollectTimer = EGG_COLLECT_FLASH_TIME;
  const orbWorldPosition = new THREE.Vector3();
  hazard.userData.orb.getWorldPosition(orbWorldPosition);
  for (let i = 0; i < 20; i += 1) {
    emitEggBurstParticle(orbWorldPosition);
  }
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
    color: Math.random() > 0.5 ? 0xff9fcf : 0x8fe8ff,
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
  particle.mesh.material.color.setHex(Math.random() > 0.5 ? 0x95ecff : 0xffadc8);

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
      color: i % 2 === 0 ? 0x9cf1ff : 0xffb0cf,
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
  cloudVeil.classList.add("covering");
  setTimeout(() => {
    startGame();
    setTimeout(() => {
      cloudVeil.classList.remove("covering");
      cloudTransitionActive = false;
    }, 80);
  }, 380);
}

function startGame() {
  state.mode = "playing";
  bunny.visible = true;
  camera.fov = 62;
  camera.updateProjectionMatrix();
  updateMusicState();
  state.elapsed = 0;
  state.score = 0;
  state.worldSpeed = 0;
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
  state.death.timer = 0;
  state.death.reason = "";
  state.death.velocityY = 0;
  state.death.bounceCount = 0;
  state.death.trailEmitTimer = 0;
  state.death.shockTimer = 0;
  state.death.startX = 0;
  state.death.startY = 0;
  state.death.startZ = 0;
  state.performance.lowFpsTimer = 0;
  state.performance.highFpsTimer = 0;
  state.performance.lowFpsMode = false;
  state.performance.lowFpsBlend = 0;
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
  tutorial.classList.remove("hidden");
  tutorial.textContent =
    "Click/Space: jump. Avoid the moving rock traps and collect the glowing orb.";
  setHudVisibility(true);
  updateHud();
}

function triggerJump() {
  if (state.mode !== "playing") return;
  if (state.player.cooldown > 0) return;
  if (state.player.jumpTimer > 0) return;

  ensureStepBlocksAhead(state.player.currentBlock + 1);
  ensureHazardsAhead(state.player.currentBlock + 1);

  state.player.fromBlock = state.player.currentBlock;
  state.player.toBlock = state.player.currentBlock + 1;
  state.player.activeSegment = state.player.currentBlock;
  state.player.jumpDuration = getCurrentJumpDuration();
  state.player.jumpTimer = state.player.jumpDuration;
  state.player.cooldown = JUMP_COOLDOWN;
  state.camera.catchupTimer = CAMERA_CATCHUP_TIME;
  triggerDashEffects(
    getBlockPosition(state.player.fromBlock).z,
    getBlockPosition(state.player.toBlock).z
  );
  setTimeout(() => {
    playDashSound();
  }, 0);
}

function boostUpcomingOrbMultiplier(currentBlockIndex) {
  const upcomingHazard = getHazardSlot(currentBlockIndex);
  if (!upcomingHazard || upcomingHazard.userData.collected) return;
  setHazardOrbCount(upcomingHazard, getRandomOrbMultiplier(), true);
}

function submitFinalScore() {
  if (typeof window.submitScore === "function") {
    window.submitScore(state.score);
  }
}

function endGame(reason) {
  if (state.mode !== "playing") return;
  state.mode = "dying";
  submitFinalScore();
  triggerHaptic("error");
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
  setHudVisibility(false);
}

function updateDeathAnimation(dt) {
  if (state.mode !== "dying") return;

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
    setMenu(
      "GAME OVER",
      `${state.death.reason} You collected ${state.score} orb${state.score === 1 ? "" : "s"}.`,
      "PLAY AGAIN"
    );
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

function collectOrbFromSegment(segmentIndex) {
  const hazard = getHazardSlot(segmentIndex);
  if (!hazard || hazard.userData.collected) return 0;
  const collectedOrbCount = hazard.userData.orbCount ?? 1;
  triggerOrbCollectEffects(hazard);
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
    bunny.rotation.x = -0.1 - arc * 0.3;
    bunny.rotation.z = Math.sin(progress * Math.PI) * 0.07;

    if (state.player.jumpTimer === 0 && state.mode === "playing") {
      state.player.currentBlock = state.player.toBlock;
      const collectedOrbCount = collectOrbFromSegment(state.player.activeSegment);
      state.score += Math.max(0, collectedOrbCount);
      state.flashTimer = 0.12;
      ensureCourseAhead(state.player.currentBlock);
      boostUpcomingOrbMultiplier(state.player.currentBlock);
      updateHud();
      if (state.score >= 3) {
        tutorial.classList.add("hidden");
      }
    }
  } else {
    const current = getBlockPosition(state.player.currentBlock);
    bunny.position.z = current.z;
    bunny.position.y = getBlockTopY(state.player.currentBlock);
    state.player.progress = 0;
    state.player.yOffset = 0;
    bunny.scale.set(1, 1, 1);
    bunny.rotation.x = 0;
    bunny.rotation.z = 0;
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
      const auraPulse = 0.92 + Math.sin(state.elapsed * 3.6 + segmentIndex * 0.25) * 0.18;
      data.orbAura.position.y = data.orb.position.y;
      data.orbAura.scale.setScalar(
        auraPulse * (1 + (data.orbCount - 1) * 0.12) * (1 + popStrength * 0.8)
      );
      let fogVisibility = 1;
      if (scene.fog) {
        data.orb.getWorldPosition(hazardTempOrbWorld);
        const fogDistance = camera.position.distanceTo(hazardTempOrbWorld);
        const fogSpan = Math.max(0.0001, scene.fog.far - scene.fog.near);
        const fogRatio = THREE.MathUtils.clamp((fogDistance - scene.fog.near) / fogSpan, 0, 1);
        fogVisibility = Math.pow(1 - fogRatio, 1.45);
      }
      data.orb.material.emissiveIntensity =
        data.orbBaseEmissive * (0.2 + fogVisibility * 0.8) * (1 + (data.orbCount - 1) * 0.14);
      data.orbAura.material.opacity =
        data.orbAuraBaseOpacity * (0.14 + fogVisibility * 0.86);

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
      data.orbAura.visible = true;
      data.ring.visible = true;
    } else {
      data.orb.visible = false;
      data.orbAura.visible = false;
      data.ring.visible = false;
      for (const extra of data.orbExtras) {
        extra.visible = false;
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
  const stepFlash =
    state.effects.stepBlockFlashTimer > 0
      ? state.effects.stepBlockFlashTimer / STEP_BLOCK_FLASH_TIME
      : 0;

  const tileFrontZ = bunny.position.z + 10;
  const tileBackZ = tileFrontZ - pathDepth;
  for (const bed of groundBeds) {
    while (bed.position.z > tileFrontZ + groundBedDepth * 0.5) {
      bed.position.z -= groundBedCycleDepth;
    }
    while (bed.position.z < tileBackZ - groundBedDepth * 0.5) {
      bed.position.z += groundBedCycleDepth;
    }
  }

  for (const tile of tiles) {
    while (tile.position.z > tileFrontZ) {
      tile.position.z -= pathDepth;
    }
    while (tile.position.z < tileBackZ) {
      tile.position.z += pathDepth;
    }
    const waveImpact = waveActive
      ? getGroundWaveImpact(tile.position.z, waveFront, waveOpacity)
      : 0;
    const rearLift = waveActive
      ? getRearRowWaveLift(tile.position.z, waveFront, waveOpacity)
      : 0;
    const targetWaveLift = rearLift * DASH_GROUND_WAVE_LIFT * 1.35;
    tile.userData.waveLift = THREE.MathUtils.damp(
      tile.userData.waveLift ?? 0,
      targetWaveLift,
      11,
      dt
    );
    if (!isMobile) {
      tile.position.y =
        -0.5 +
        Math.sin(tile.position.z * 0.14 + tile.userData.bobOffset) * 0.22 +
        Math.sin(state.elapsed * 0.7 + tile.position.x * 0.25) * 0.08 +
        tile.userData.waveLift;
    } else {
      tile.position.y = -0.5 + tile.userData.waveLift;
    }
    tile.material.emissiveIntensity = waveImpact * DASH_GROUND_WAVE_FLASH;
  }

  for (const terrace of sideTerraces) {
    while (terrace.position.z > tileFrontZ) {
      terrace.position.z -= pathDepth;
    }
    while (terrace.position.z < tileBackZ) {
      terrace.position.z += pathDepth;
    }
    const waveImpact = waveActive
      ? getGroundWaveImpact(terrace.position.z, waveFront, waveOpacity)
      : 0;
    const rearLift = waveActive
      ? getRearRowWaveLift(terrace.position.z, waveFront, waveOpacity)
      : 0;
    const targetWaveLift = rearLift * DASH_GROUND_WAVE_LIFT * 1.08;
    terrace.userData.waveLift = THREE.MathUtils.damp(
      terrace.userData.waveLift ?? 0,
      targetWaveLift,
      9.6,
      dt
    );
    const topY = getSideTerraceTopY(terrace.position.z, terrace.userData.rowIndex);
    terrace.position.x = getSideTerraceX(
      terrace.userData.side,
      terrace.userData.rowIndex,
      terrace.userData.xJitter
    );
    terrace.position.y =
      topY -
      SIDE_TERRACE_BLOCK_HEIGHT * 0.5 +
      (isMobile ? 0 : Math.sin(state.elapsed * 0.74 + terrace.userData.bobOffset) * terrace.userData.bobAmount) +
      terrace.userData.waveLift;
    terrace.material.emissiveIntensity = waveImpact * 0.58;
  }

  if (!isMobile) {
    for (const flora of flowerDecor) {
      const sway =
        Math.sin(state.elapsed * 1.7 + flora.userData.swayOffset) * flora.userData.swayAmount;
      flora.rotation.x = Math.sin(state.elapsed * 1.2 + flora.userData.swayOffset * 1.4) * 0.05;
      flora.rotation.z = sway * 0.18;
    }
  }

  for (const block of stepBlocks) {
    const rearLift = waveActive
      ? getRearRowWaveLift(block.position.z, waveFront, waveOpacity)
      : 0;
    const targetWaveLift = rearLift * DASH_GROUND_WAVE_LIFT * 0.98;
    block.userData.waveLift = THREE.MathUtils.damp(
      block.userData.waveLift ?? 0,
      targetWaveLift,
      10,
      dt
    );
    const liftedY =
      block.userData.baseY +
      Math.sin(state.elapsed * 1.2 + block.userData.waveOffset) * 0.06 +
      block.userData.waveLift;
    block.position.y = Math.max(STEP_BLOCK_MIN_Y, liftedY);
    block.rotation.z = Math.sin(state.elapsed * 1.05 + block.userData.waveOffset) * 0.04;
  }
  stepBlockMaterial.emissive
    .copy(stepBlockEmissiveBase)
    .lerp(stepBlockEmissiveFlash, Math.min(1, stepFlash));
  stepBlockMaterial.emissiveIntensity = 0.38 + stepFlash * 0.7;

  updateHazards(dt);

  const sceneryFrontZ = bunny.position.z + SCENERY_FRONT_Z_OFFSET;
  for (const item of scenery) {
    const wrapDepth = item.userData.recycleDepth;
    const sceneryBackZ = sceneryFrontZ - wrapDepth;
    if (item.position.z > sceneryFrontZ) {
      item.position.z -= wrapDepth;
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
    }
    item.position.y =
      getSideTerraceTopY(item.position.z, item.userData.rowIndex) +
      (item.userData.baseYOffset ?? 0.1);
    if (!isMobile) {
      item.rotation.y = Math.sin(state.elapsed * 0.9 + item.userData.swayOffset) * 0.08;
      item.rotation.z = Math.sin(state.elapsed * 0.7 + item.userData.swayOffset * 1.4) * 0.02;
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
  _bgColor.setRGB(
    THREE.MathUtils.lerp(0.24, 0.42, boost),
    THREE.MathUtils.lerp(0.37, 0.58, boost),
    THREE.MathUtils.lerp(0.66, 0.87, boost)
  );
  if (deathBoost > 0) {
    _bgColor.lerp(_deathFlashColor, deathBoost * 0.18);
  }
  scene.background.copy(_bgColor);
  scene.fog.color.copy(_bgColor);

  furMat.emissiveIntensity = 0.15 + eggBoost * 0.68 + deathBoost * 0.24;
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
}

function updateCamera(dt) {
  if (state.mode === "home") {
    const t = state.elapsed;
    const camX = Math.sin(t * 0.21) * 4.2 + Math.sin(t * 0.08) * 1.6;
    const camY = 16.0 + Math.sin(t * 0.16) * 0.7;
    const camZ = bunny.position.z + 14.6;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(camX * 0.06, 0.9, bunny.position.z + CAMERA_LOOK_Z_OFFSET);
    camera.fov = 68;
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
  }
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
  triggerHaptic("light");
  triggerCloudTransition();
});

bindPressAction(settingsButton, () => {
  if (isSettingsOpen()) {
    closeSettings();
  } else {
    openSettings();
    settingsOpenedAt = performance.now();
  }
  triggerHaptic("light");
});

bindPressAction(settingsCloseButton, () => {
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
  settings.music = !settings.music;
  saveSettings();
  renderSettingsUI();
  updateMusicState();
  triggerHaptic("light");
});

bindPressAction(fxToggleButton, () => {
  settings.fx = !settings.fx;
  saveSettings();
  renderSettingsUI();
  triggerHaptic("light");
});

bindPressAction(hapticsToggleButton, () => {
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

let previous = performance.now();
let accumulator = 0;
let fpsFrames = 0;
let fpsTimer = 0;

function animationLoop(now) {
  const frameSeconds = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  const instantFps = frameSeconds > 0 ? 1 / frameSeconds : 60;
  state.performance.fps = THREE.MathUtils.lerp(state.performance.fps, instantFps, 0.14);

  if (state.performance.fps < LOW_FPS_THRESHOLD) {
    state.performance.lowFpsTimer += frameSeconds;
    state.performance.highFpsTimer = 0;
    if (state.performance.lowFpsTimer >= LOW_FPS_ENTER_TIME) {
      state.performance.lowFpsMode = true;
    }
  } else {
    state.performance.highFpsTimer += frameSeconds;
    state.performance.lowFpsTimer = 0;
    if (state.performance.highFpsTimer >= LOW_FPS_EXIT_TIME) {
      state.performance.lowFpsMode = false;
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
  requestAnimationFrame(animationLoop);
}

setMenu(
  "WAVE JUMP",
  "Jump along the endless lane. Avoid mixed moving rock traps and grab the glowing orb.",
  "PLAY"
);
renderSettingsUI();
closeSettings();
tutorial.classList.add("hidden");
setHudVisibility(false);
updateHud();
setCanvasSize();
updateMusicState();
requestAnimationFrame(animationLoop);
