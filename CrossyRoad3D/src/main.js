import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import bgMusicUrl from './bgMusic.mp3';
import { DEVILSWORKSHOP_VEHICLE_FILES } from './devilsworkshopVehicleAssets.js';

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Color(0xa9d7ff);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#7fc3f4');
  gradient.addColorStop(0.45, '#b7e2ff');
  gradient.addColorStop(1, '#eaf7ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 42; i++) {
    const x = Math.random() * canvas.width;
    const y = 130 + Math.random() * 220;
    const w = 3 + Math.random() * 8;
    const h = 1 + Math.random() * 3;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xb8ddf8, 60, 180);

let orthoFrustum = 22;
const camera = new THREE.OrthographicCamera(
  -orthoFrustum * (innerWidth / innerHeight) / 2,
   orthoFrustum * (innerWidth / innerHeight) / 2,
   orthoFrustum / 2,
  -orthoFrustum / 2,
  0.1, 500
);
// Isometric Crossy Road camera — fixed diagonal angle (set properly after cameraRig init)
camera.position.set(16, 16, 16);
camera.lookAt(0, 0, 0);

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
const PERFORMANCE = {
  fixedStep: 1 / 60,
  maxFrameDelta: 0.05,
  maxSubSteps: 3,
  mainPixelRatio: isMobile ? 0.85 : 1.15,
  previewPixelRatio: isMobile ? 0.85 : 0.95,
  shadowMapSize: isMobile ? 384 : 768,
};

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, PERFORMANCE.mainPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.touchAction = 'none';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = isMobile ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x72a276, 1.08);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dc, 1.45);
sun.position.set(34, 44, 16);
sun.castShadow = true;
const shadowRes = PERFORMANCE.shadowMapSize;
sun.shadow.mapSize.set(shadowRes, shadowRes);
const shadowFrustum = isMobile ? 30 : 60;
sun.shadow.camera.left = -shadowFrustum;
sun.shadow.camera.right = shadowFrustum;
sun.shadow.camera.top = shadowFrustum;
sun.shadow.camera.bottom = -shadowFrustum;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xaed6ff, 0.34);
rim.position.set(-28, 20, -52);
scene.add(rim);


const laneDepth = 4.4;
const laneWidth = 60;
const xStep = 1.8;
const forwardStep = laneDepth; // ileri/geri adımı lane merkezinde biter
const sideLimit = 16.2; // 2x wider playable map
const leftBlockLimit = 7;
const playerLeftLimit = xStep * leftBlockLimit;
const trafficSpawnX = laneWidth * 0.5 + 1.4;
const trafficDespawnX = laneWidth * 0.5 + 2.8;
const PLAYER_HITBOX = { halfX: 0.25, halfZ: 0.25 };
const PLAYER_MOVE_DURATION_S = 0.12;
const TRAIN_WARNING_LEAD_S = 1.5;
const TRAIN_SPEED_BOOST = 3;
const LOG_RIDE_Y_OFFSET = 0.42;
const LOG_SUPPORT_EDGE_PAD_X = 0.2;
const LOG_SUPPORT_EDGE_PAD_Z = 0.14;
const LOG_SUPPORT_EXTRA_X = 0.14;
const LOG_SUPPORT_EXTRA_Z = 0.2;
const RIVER_SUPPORT_GRACE_S = 0.22;

const cameraRig = {
  height: 16,
  diagX: 16,       // fixed X offset (never changes)
  diagZ: 16,       // fixed Z offset from look target
  lookAhead: 5.5,
};

function refreshCameraRig() {
  const aspect = innerWidth / innerHeight;
  const baseViewSize = 7 / 1.1; // desktop zoom
  const isCoarsePointer = window.matchMedia('(pointer:coarse)').matches;
  // On mobile portrait, preserve wide horizontal coverage similar to desktop.
  const minWorldHalfWidth = isCoarsePointer ? 9.6 : 0;
  const widthDrivenView = minWorldHalfWidth > 0 ? minWorldHalfWidth / Math.max(aspect, 0.56) : baseViewSize;
  const phoneZoomFactor = isCoarsePointer ? (1 / 1.2) : 1; // 1.2x closer on phones
  const viewSize = Math.max(baseViewSize, widthDrivenView) * phoneZoomFactor;
  camera.left   = -viewSize * aspect;
  camera.right  =  viewSize * aspect;
  camera.top    =  viewSize;
  camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
}

refreshCameraRig();

function requestShadowRefresh() {
  renderer.shadowMap.needsUpdate = true;
}

function setMeshShadowFlags(root, castShadow, receiveShadow) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = castShadow;
    node.receiveShadow = receiveShadow;
  });
}

function clampPlayerX(x) {
  return THREE.MathUtils.clamp(x, -playerLeftLimit, sideLimit);
}

const lanes = [];
const movers = [];
const decor = [];

const hud = document.getElementById('hud');
const hudScore = document.getElementById('hudScore');
const menu = document.getElementById('menu');
const gameover = document.getElementById('gameover');
const final = document.getElementById('final');
const menuCharacterLabel = document.querySelector('.t-rabbit');
const characterBtn = document.getElementById('characterBtn');
const characterMenu = document.getElementById('characterMenu');
const characterCloseBtn = document.getElementById('characterCloseBtn');
const characterApplyBtn = document.getElementById('characterApplyBtn');
const selectedAnimalLabel = document.getElementById('selectedAnimalLabel');
const characterCards = [...document.querySelectorAll('.animal-card')];
const characterPreviewSlots = [...document.querySelectorAll('.animal-preview')];

let active = false;
let score = 0;
let bestForward = 0;
let dead = false;
const MOVE_INPUT_COOLDOWN_S = 0.12;
let lastMoveAtS = -Infinity;
let elapsedGameTime = 0;
let deathAnim = { type: 'none', time: 0, done: false };
let camSmoothZ = 0;
let demoZ = 0;

// ── Settings (persisted) ──
const settings = {
  music:   localStorage.getItem('crossy3d_music')   !== 'false',
  fx:      localStorage.getItem('crossy3d_fx')      !== 'false',
  haptics: localStorage.getItem('crossy3d_haptics') !== 'false',
};
function saveSettings() {
  localStorage.setItem('crossy3d_music',   settings.music);
  localStorage.setItem('crossy3d_fx',      settings.fx);
  localStorage.setItem('crossy3d_haptics', settings.haptics);
}

// ── Background music (file-based loop) ──
const bgMusic = (() => {
  const audio = new Audio(bgMusicUrl);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.36;
  let running = false;
  return {
    start() {
      running = true;
      if (!settings.music) return;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    },
    stop() {
      running = false;
      audio.pause();
    },
  };
})();

function makeLaneTexture(type, shifted = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (type === 'grass') {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 12; col++) {
        const checker = (row + col + (shifted ? 1 : 0)) % 2 === 0;
        ctx.fillStyle = checker ? '#84d96f' : '#67bd56';
        ctx.fillRect(col * 12, row * 12, 12, 12);
        if ((col + row + (shifted ? 2 : 0)) % 4 === 0) {
          ctx.fillStyle = '#9fe988';
          ctx.fillRect(col * 12 + 4, row * 12 + 4, 3, 3);
        }
        if ((col + row + (shifted ? 1 : 0)) % 5 === 0) {
          ctx.fillStyle = '#4a9a45';
          ctx.fillRect(col * 12 + 1, row * 12 + 9, 4, 2);
        }
      }
    }
    for (let x = shifted ? 2 : 0; x < 144; x += 18) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 3, 3, 2, 2);
    }
  } else if (type === 'road') {
    ctx.fillStyle = '#233146';
    ctx.fillRect(0, 0, 144, 24);
    for (let col = 0; col < 12; col++) {
      const palette = shifted
        ? ['#2a3950', '#31445e', '#253247', '#394d68']
        : ['#2f3f58', '#364962', '#28374c', '#3b506b'];
      ctx.fillStyle = palette[col % palette.length];
      ctx.fillRect(col * 12, 0, 12, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(col * 12 + 1, 3, 10, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(col * 12, 0, 1, 24);
    }
    ctx.fillStyle = '#1b2636';
    ctx.fillRect(0, 0, 144, 4);
    ctx.fillRect(0, 20, 144, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 4, 144, 1);
    ctx.fillRect(0, 19, 144, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 17 + (shifted ? 9 : 0)) % 140);
      const sy = ((i * 11 + (shifted ? 3 : 0)) % 18) + 3;
      ctx.fillRect(sx, sy, 3, 1);
    }
    ctx.fillStyle = '#f4f7fb';
    for (let x = shifted ? 8 : 0; x < 144; x += 24) {
      ctx.fillRect(x + 2, 11, 16, 2);
    }
  } else if (type === 'roadRumble') {
    for (let col = 0; col < 24; col++) {
      const isRed = (col + (shifted ? 1 : 0)) % 2 === 0;
      ctx.fillStyle = isRed ? '#ef5247' : '#f4f6f8';
      ctx.fillRect(col * 6, 0, 6, 24);
      ctx.fillStyle = isRed ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(col * 6 + 1, 2, 4, 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(0, 0, 144, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, 22, 144, 2);
  } else if (type === 'mud') {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 12; col++) {
        const checker = (row + col + (shifted ? 1 : 0)) % 2 === 0;
        ctx.fillStyle = checker ? '#9f7c4e' : '#876644';
        ctx.fillRect(col * 12, row * 12, 12, 12);
        if ((col + row + (shifted ? 2 : 0)) % 4 === 0) {
          ctx.fillStyle = '#b7905f';
          ctx.fillRect(col * 12 + 3, row * 12 + 3, 6, 4);
        }
        if ((col + row + (shifted ? 1 : 0)) % 3 === 0) {
          ctx.fillStyle = '#765738';
          ctx.fillRect(col * 12 + 5, row * 12 + 8, 4, 2);
        }
      }
    }
    ctx.fillStyle = '#6a4d31';
    for (let x = shifted ? 6 : 1; x < 144; x += 20) {
      ctx.fillRect(x, 10, 10, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let x = shifted ? 4 : 0; x < 144; x += 24) {
      ctx.fillRect(x + 2, 6, 7, 1);
    }
  } else if (type === 'rail') {
    ctx.fillStyle = '#666a70';
    ctx.fillRect(0, 0, 144, 24);
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = (col + (shifted ? 1 : 0)) % 2 === 0 ? '#6f747b' : '#5b5f66';
      ctx.fillRect(col * 12, 0, 12, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(col * 12 + 10, 2, 1, 20);
    }
    ctx.fillStyle = '#7c5c38';
    for (let x = shifted ? 4 : 0; x < 144; x += 12) {
      ctx.fillRect(x, 5, 3, 14);
      ctx.fillRect(x + 7, 5, 2, 14);
    }
    ctx.fillStyle = '#d4dbe4';
    ctx.fillRect(0, 7, 144, 2);
    ctx.fillRect(0, 15, 144, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    for (let x = shifted ? 2 : 0; x < 144; x += 18) {
      ctx.fillRect(x, 8, 4, 1);
      ctx.fillRect(x + 8, 16, 3, 1);
    }
  } else {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 12; col++) {
        const wave = (row + col + (shifted ? 1 : 0)) % 2 === 0;
        ctx.fillStyle = wave ? '#4daee3' : '#3b98d0';
        ctx.fillRect(col * 12, row * 12, 12, 12);
        if ((col + row + (shifted ? 1 : 0)) % 3 === 0) {
          ctx.fillStyle = '#75caf3';
          ctx.fillRect(col * 12 + 2, row * 12 + 4, 6, 3);
        }
        if ((col + row + (shifted ? 2 : 0)) % 4 === 0) {
          ctx.fillStyle = '#9cdef9';
          ctx.fillRect(col * 12 + 7, row * 12 + 8, 3, 2);
        }
      }
    }
    ctx.fillStyle = '#ddf5ff';
    ctx.fillRect(0, 0, 144, 2);
    ctx.fillRect(0, 22, 144, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // Correct aspect ratio: canvas is 144x24 but geometry is 60x4.4
  const aspectCorrection = (laneWidth / laneDepth) * (canvas.height / canvas.width);
  texture.repeat.set(aspectCorrection, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const MAT = {
  grassA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('grass', false), roughness: 1 }),
  grassB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('grass', true), roughness: 1 }),
  roadA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('road', false), roughness: 0.9 }),
  roadB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('road', true), roughness: 0.9 }),
  mudA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('mud', false), roughness: 0.96 }),
  mudB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('mud', true), roughness: 0.96 }),
  railA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('rail', false), roughness: 0.9 }),
  railB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('rail', true), roughness: 0.9 }),
  riverA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('river', false), roughness: 0.42, metalness: 0.08, emissive: 0x083d54, emissiveIntensity: 0.08 }),
  riverB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('river', true), roughness: 0.42, metalness: 0.08, emissive: 0x083d54, emissiveIntensity: 0.08 }),
  grassEdge: new THREE.MeshStandardMaterial({ color: 0x3f8f3b, roughness: 1 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xbebebe, roughness: 0.92 }),
  roadShoulder: new THREE.MeshStandardMaterial({ color: 0xc7d0da, roughness: 0.88, metalness: 0.06 }),
  roadRumbleA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('roadRumble', false), roughness: 0.82 }),
  roadRumbleB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('roadRumble', true), roughness: 0.82 }),
  bank: new THREE.MeshStandardMaterial({ color: 0x9a7a48, roughness: 1 }),
  railMetal: new THREE.MeshStandardMaterial({ color: 0xd6dde8, roughness: 0.45, metalness: 0.42 }),
  railSleeper: new THREE.MeshStandardMaterial({ color: 0x6f4f30, roughness: 0.95 }),
  mudPuddle: new THREE.MeshStandardMaterial({ color: 0x6d5438, roughness: 0.68 }),
  roadStripe: new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.72 }),
  roadLine: new THREE.MeshStandardMaterial({ color: 0xe3ebf5, roughness: 0.78 }),
  foam: new THREE.MeshStandardMaterial({ color: 0xdbf4ff, roughness: 0.65 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x8f6038, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4daa4a, roughness: 1 }),
  leafDark: new THREE.MeshStandardMaterial({ color: 0x3f943f, roughness: 1 }),
  bush: new THREE.MeshStandardMaterial({ color: 0x5ab55a, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xc8d3df, roughness: 0.82 }),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x9fcbf8, roughness: 0.26, metalness: 0.3 }),
  carTrim: new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.38, metalness: 0.52 }),
  carMetal: new THREE.MeshStandardMaterial({ color: 0x8c98a5, roughness: 0.48, metalness: 0.44 }),
  carWheel: new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.92 }),
  carHeadlight: new THREE.MeshStandardMaterial({ color: 0xfff6c3, emissive: 0xffefac, emissiveIntensity: 0.45 }),
  carTaillight: new THREE.MeshStandardMaterial({ color: 0xff5f63, emissive: 0xff4d4d, emissiveIntensity: 0.35 }),
};

const POOL_DIMENSION_STEP = 0.02;
const pooledMeshes = new Map();
const pooledGroups = new Map();
const cachedBoxGeometries = new Map();
const cachedCylinderGeometries = new Map();
const cachedTorusGeometries = new Map();
const cachedMaterials = new Map();

function snapPooledDimension(value) {
  return Math.max(0.01, Math.round(value / POOL_DIMENSION_STEP) * POOL_DIMENSION_STEP);
}

function toPoolScalar(value) {
  return Number(value.toFixed(3));
}

function makePoolKey(prefix, values) {
  return `${prefix}:${values.map((value) => (
    typeof value === 'number' ? toPoolScalar(value) : value
  )).join(':')}`;
}

function getCachedBoxGeometry(width, height, depth) {
  const w = snapPooledDimension(width);
  const h = snapPooledDimension(height);
  const d = snapPooledDimension(depth);
  const key = makePoolKey('box-geo', [w, h, d]);
  let geometry = cachedBoxGeometries.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(w, h, d);
    cachedBoxGeometries.set(key, geometry);
  }
  return geometry;
}

function getCachedCylinderGeometry(radiusTop, radiusBottom, height, radialSegments = 8) {
  const rt = snapPooledDimension(radiusTop);
  const rb = snapPooledDimension(radiusBottom);
  const h = snapPooledDimension(height);
  const key = makePoolKey('cyl-geo', [rt, rb, h, radialSegments]);
  let geometry = cachedCylinderGeometries.get(key);
  if (!geometry) {
    geometry = new THREE.CylinderGeometry(rt, rb, h, radialSegments);
    cachedCylinderGeometries.set(key, geometry);
  }
  return geometry;
}

function getCachedTorusGeometry(radius, tube, radialSegments = 8, tubularSegments = 16) {
  const r = snapPooledDimension(radius);
  const t = snapPooledDimension(tube);
  const key = makePoolKey('torus-geo', [r, t, radialSegments, tubularSegments]);
  let geometry = cachedTorusGeometries.get(key);
  if (!geometry) {
    geometry = new THREE.TorusGeometry(r, t, radialSegments, tubularSegments);
    cachedTorusGeometries.set(key, geometry);
  }
  return geometry;
}

function getCachedStandardMaterial(key, params) {
  let material = cachedMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial(params);
    cachedMaterials.set(key, material);
  }
  return material;
}

const POOL_MAT = {
  stoneHighlight: getCachedStandardMaterial('stone-highlight', { color: 0xe6eef7, roughness: 0.7 }),
  bushFlower: getCachedStandardMaterial('bush-flower', { color: 0xffc5d8, roughness: 0.82 }),
  trainWarningSign: getCachedStandardMaterial('train-warning-sign', { color: 0xeef3fb, roughness: 0.62, metalness: 0.08 }),
  trainWarningStripe: getCachedStandardMaterial('train-warning-stripe', { color: 0xd64040, roughness: 0.65, metalness: 0.04 }),
  trainFrame: getCachedStandardMaterial('train-frame', { color: 0x1e2228, roughness: 0.86 }),
  trainConnector: getCachedStandardMaterial('train-connector', { color: 0x434951, roughness: 0.78, metalness: 0.14 }),
  trainDoor: getCachedStandardMaterial('train-door', { color: 0xe8edf5, roughness: 0.54, metalness: 0.12 }),
  vehicleUnder: getCachedStandardMaterial('vehicle-under', { color: 0x252a31, roughness: 0.84 }),
  truckCargo: getCachedStandardMaterial('truck-cargo', { color: 0xf4efe2, roughness: 0.82 }),
  logBody: getCachedStandardMaterial('log-body', { color: 0x8d5d37, roughness: 0.96, metalness: 0.02 }),
  logDeck: getCachedStandardMaterial('log-deck', { color: 0xa47345, roughness: 0.9 }),
  barrelRing: getCachedStandardMaterial('barrel-ring', { color: 0x4d341f, roughness: 0.88 }),
  barrelSpike: getCachedStandardMaterial('barrel-spike', { color: 0x5f3f25, roughness: 0.92 }),
};
const pooledTrainWarningMaterials = [];

function acquireTrainWarningMaterial() {
  const material = pooledTrainWarningMaterials.pop() ?? new THREE.MeshStandardMaterial({
    color: 0x5a3a3a,
    emissive: 0x251010,
    emissiveIntensity: 0.08,
    roughness: 0.5,
    metalness: 0.22,
  });
  material.color.setHex(0x5a3a3a);
  material.emissive.setHex(0x251010);
  material.emissiveIntensity = 0.08;
  return material;
}

function releaseTrainWarningMaterial(material) {
  if (!material) return;
  material.color.setHex(0x5a3a3a);
  material.emissive.setHex(0x251010);
  material.emissiveIntensity = 0.08;
  pooledTrainWarningMaterials.push(material);
}

function getVehiclePaintMaterial(kind, color) {
  const colorKey = color.toString(16);
  return getCachedStandardMaterial(`vehicle-paint:${kind}:${colorKey}`, {
    color,
    roughness: kind === 'bike' ? 0.38 : 0.3,
    metalness: kind === 'bike' ? 0.2 : 0.24,
  });
}

function resetPooledObjectTransform(object) {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.visible = true;
}

function acquirePooledMesh(poolKey, geometry, material) {
  const bucket = pooledMeshes.get(poolKey);
  const mesh = bucket?.pop() ?? new THREE.Mesh(geometry, material);
  mesh.geometry = geometry;
  mesh.material = material;
  resetPooledObjectTransform(mesh);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.pooledMeshKey = poolKey;
  return mesh;
}

function acquireBoxMesh(width, height, depth, material) {
  const w = snapPooledDimension(width);
  const h = snapPooledDimension(height);
  const d = snapPooledDimension(depth);
  const poolKey = makePoolKey(`box:${material.uuid}`, [w, h, d]);
  return acquirePooledMesh(poolKey, getCachedBoxGeometry(w, h, d), material);
}

function acquireCylinderMesh(radiusTop, radiusBottom, height, radialSegments, material) {
  const rt = snapPooledDimension(radiusTop);
  const rb = snapPooledDimension(radiusBottom);
  const h = snapPooledDimension(height);
  const poolKey = makePoolKey(`cyl:${material.uuid}`, [rt, rb, h, radialSegments]);
  return acquirePooledMesh(poolKey, getCachedCylinderGeometry(rt, rb, h, radialSegments), material);
}

function acquireTorusMesh(radius, tube, radialSegments, tubularSegments, material) {
  const r = snapPooledDimension(radius);
  const t = snapPooledDimension(tube);
  const poolKey = makePoolKey(`torus:${material.uuid}`, [r, t, radialSegments, tubularSegments]);
  return acquirePooledMesh(poolKey, getCachedTorusGeometry(r, t, radialSegments, tubularSegments), material);
}

function addTrackedObject(parent, trackList, object) {
  parent.add(object);
  if (trackList) trackList.push(object);
  return object;
}

function acquirePooledGroup(poolKey) {
  const bucket = pooledGroups.get(poolKey);
  const group = bucket?.pop() ?? new THREE.Group();
  resetPooledObjectTransform(group);
  group.userData.pooledGroupKey = poolKey;
  if (!group.userData.managedChildren) group.userData.managedChildren = [];
  group.userData.managedChildren.length = 0;
  return group;
}

function trackManagedChild(group, child) {
  group.userData.managedChildren.push(child);
  group.add(child);
  return child;
}

function releasePooledMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  resetPooledObjectTransform(mesh);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const poolKey = mesh.userData?.pooledMeshKey;
  if (!poolKey) return;
  if (!pooledMeshes.has(poolKey)) pooledMeshes.set(poolKey, []);
  pooledMeshes.get(poolKey).push(mesh);
}

function releaseManagedGroup(group) {
  if (!group) return;
  const managedChildren = group.userData?.managedChildren ?? [];
  while (managedChildren.length) {
    releaseSceneObject(managedChildren.pop());
  }
  while (group.children.length) group.remove(group.children[0]);
  if (group.parent) group.parent.remove(group);
  resetPooledObjectTransform(group);
  const poolKey = group.userData?.pooledGroupKey;
  if (!poolKey) return;
  if (!pooledGroups.has(poolKey)) pooledGroups.set(poolKey, []);
  pooledGroups.get(poolKey).push(group);
}

function releaseSceneObject(object) {
  if (!object) return;
  if (object.userData?.pooledGroupKey) {
    releaseManagedGroup(object);
    return;
  }
  if (object.userData?.pooledMeshKey) {
    releasePooledMesh(object);
    return;
  }
  if (object.userData?.importedVehiclePoolKey) {
    releaseImportedVehicleInstance(object);
    return;
  }
  if (object.parent) object.parent.remove(object);
}

function countPooledObjects(pool) {
  let total = 0;
  for (const bucket of pool.values()) total += bucket.length;
  return total;
}

function releaseLane(lane) {
  releaseSceneObject(lane.mesh);
  for (const mesh of lane.decorMeshes) releaseSceneObject(mesh);
  for (const channel of lane.channels) {
    if (!channel.warningMaterials?.length) continue;
    for (const warningMaterial of channel.warningMaterials) releaseTrainWarningMaterial(warningMaterial);
    channel.warningMaterials.length = 0;
  }
  lane.decorMeshes.length = 0;
  lane.obstacles.length = 0;
  lane.channels.length = 0;
  lane.mesh = null;
}

function releaseMover(mover) {
  releaseSceneObject(mover.mesh);
}

const VEHICLE_COLOR_FAMILIES = {
  car: [0x2f79d5, 0xd54f3a, 0xf0b83f, 0x43a865, 0x8b68de, 0xf26d96, 0x3ea5a8],
  truck: [0x3f67c7, 0xd26444, 0x4da282, 0x8b78cf, 0xc94f58],
  bike: [0x30333a, 0xcf4b3f, 0xf2b83d, 0x46aa63, 0x2f74c7],
  train: [0xd33f3a, 0x2f5fbd, 0x2f7d89, 0xc55931],
};

function pickVehicleColor(kind) {
  const pool = VEHICLE_COLOR_FAMILIES[kind] ?? VEHICLE_COLOR_FAMILIES.car;
  return pool[Math.floor(Math.random() * pool.length)];
}

const DEVILSWORKSHOP_VEHICLE_ASSETS = [
  {
    id: 'car01',
    kinds: ['car'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car01,
    targetSize: { x: 3.2, y: 1.84, z: 1.94 },
    hitbox: { x: 3.23, z: 1.97 },
  },
  {
    id: 'car02',
    kinds: ['car'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car02,
    targetSize: { x: 3.2, y: 1.84, z: 1.94 },
    hitbox: { x: 3.23, z: 1.97 },
  },
  {
    id: 'car03',
    kinds: ['car'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car03,
    targetSize: { x: 3.2, y: 1.84, z: 1.94 },
    hitbox: { x: 3.23, z: 1.97 },
  },
  {
    id: 'carPolice',
    kinds: ['car'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.carPolice,
    targetSize: { x: 3.3, y: 2.0, z: 1.94 },
    hitbox: { x: 3.33, z: 2.0 },
    weight: 0.7,
  },
  {
    id: 'pickupTruck01',
    kinds: ['truck'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.pickupTruck01,
    targetSize: { x: 4.05, y: 1.9, z: 2.07 },
    hitbox: { x: 4.11, z: 2.1 },
  },
  {
    id: 'pickupTruck02',
    kinds: ['truck'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.pickupTruck02,
    targetSize: { x: 4.05, y: 1.9, z: 2.07 },
    hitbox: { x: 4.11, z: 2.1 },
  },
  {
    id: 'bus',
    kinds: ['truck'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.bus,
    targetSize: { x: 8.25, y: 3.54, z: 2.62 },
    hitbox: { x: 7.99, z: 2.48 },
    weight: 1.45,
  },
  {
    id: 'bikeCar01',
    kinds: ['bike'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car01,
    targetSize: { x: 2.58, y: 1.5, z: 1.56 },
    hitbox: { x: 2.62, z: 1.6 },
  },
  {
    id: 'bikeCar02',
    kinds: ['bike'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car02,
    targetSize: { x: 2.58, y: 1.5, z: 1.56 },
    hitbox: { x: 2.62, z: 1.6 },
  },
  {
    id: 'bikeCar03',
    kinds: ['bike'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.car03,
    targetSize: { x: 2.58, y: 1.5, z: 1.56 },
    hitbox: { x: 2.62, z: 1.6 },
  },
  {
    id: 'bikeCarPolice',
    kinds: ['bike'],
    ...DEVILSWORKSHOP_VEHICLE_FILES.carPolice,
    targetSize: { x: 2.65, y: 1.6, z: 1.56 },
    hitbox: { x: 2.69, z: 1.63 },
    weight: 0.7,
  },
];

const vehicleAssetLibrary = new Map();
const importedVehicleInstancePools = new Map();
const vehicleObjLoader = new OBJLoader();
const vehicleTextureLoader = new THREE.TextureLoader();
const maxVehicleTextureAnisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 1;

async function loadDevilsworkshopVehicleAsset(config) {
  const obj = vehicleObjLoader.parse(config.objSource);
  const texture = await vehicleTextureLoader.loadAsync(config.textureUrl);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxVehicleTextureAnisotropy;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    roughness: 0.86,
    metalness: 0.05,
  });

  const root = new THREE.Group();
  const source = obj.clone(true);
  source.rotation.y = Math.PI * 0.5;
  source.traverse((node) => {
    if (!node.isMesh) return;
    if (typeof node.geometry?.computeVertexNormals === 'function') node.geometry.computeVertexNormals();
    node.material = material;
    node.castShadow = false;
    node.receiveShadow = false;
  });
  root.add(source);

  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  const scale = Math.min(
    config.targetSize.x / Math.max(size.x, 0.001),
    config.targetSize.y / Math.max(size.y, 0.001),
    config.targetSize.z / Math.max(size.z, 0.001),
  );
  source.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;
  source.position.y += 0.03;

  root.userData.assetId = config.id;
  root.userData.hitboxX = config.hitbox.x;
  root.userData.hitboxZ = config.hitbox.z;
  root.userData.height = config.targetSize.y;
  return root;
}

async function preloadDevilsworkshopVehicleAssets() {
  await Promise.all(DEVILSWORKSHOP_VEHICLE_ASSETS.map(async (config) => {
    try {
      const template = await loadDevilsworkshopVehicleAsset(config);
      vehicleAssetLibrary.set(config.id, { config, template });
    } catch (error) {
      console.error(`Vehicle asset load failed: ${config.id}`, error);
    }
  }));
}

function pickImportedVehicleEntry(kind) {
  const entries = DEVILSWORKSHOP_VEHICLE_ASSETS
    .filter(config => config.kinds.includes(kind))
    .map(config => vehicleAssetLibrary.get(config.id))
    .filter(Boolean);

  if (!entries.length) return null;

  const totalWeight = entries.reduce((sum, entry) => sum + (entry.config.weight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.config.weight ?? 1;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function createImportedVehicleInstance(kind) {
  const entry = pickImportedVehicleEntry(kind);
  if (!entry) return null;

  const poolKey = entry.config.id;
  const bucket = importedVehicleInstancePools.get(poolKey);
  const mesh = bucket?.pop() ?? entry.template.clone(true);
  mesh.userData.importedVehiclePoolKey = poolKey;

  return {
    mesh,
    hitboxX: entry.config.hitbox.x,
    hitboxZ: entry.config.hitbox.z,
    height: entry.config.targetSize.y,
  };
}

function releaseImportedVehicleInstance(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);
  const poolKey = root.userData?.importedVehiclePoolKey ?? root.userData?.assetId;
  if (!poolKey) return;
  if (!importedVehicleInstancePools.has(poolKey)) importedVehicleInstancePools.set(poolKey, []);
  importedVehicleInstancePools.get(poolKey).push(root);
}

for (const riverMat of [MAT.riverA, MAT.riverB]) {
  if (!riverMat.map) continue;
  riverMat.map.wrapS = THREE.RepeatWrapping;
  riverMat.map.repeat.set(1.35, 1);
}

const CHARACTER_META = {
  rabbit: { name: 'Rabbit' },
  turtle: { name: 'Turtle' },
  deer: { name: 'Deer' },
};

function normalizeCharacterId(id) {
  return Object.hasOwn(CHARACTER_META, id) ? id : 'rabbit';
}

function finalizeCharacter(id, group) {
  group.rotation.y = Math.PI;
  setMeshShadowFlags(group, false, true);
  return {
    id,
    group,
    jump: 0,
    targetRotY: Math.PI,
    targetX: 0,
    targetZ: 0,
    moving: false,
    moveTime: 0,
    moveDuration: PLAYER_MOVE_DURATION_S,
    moveFromX: 0,
    moveFromZ: 0,
    moveToX: 0,
    moveToZ: 0,
    riverSupportGraceS: 0,
  };
}

function createRabbit() {
  const group = new THREE.Group();
  const mFur = new THREE.MeshStandardMaterial({ color: 0xdfd7cf, roughness: 0.92 });
  const mBelly = new THREE.MeshStandardMaterial({ color: 0xf8f3ea, roughness: 0.9 });
  const mEarInner = new THREE.MeshStandardMaterial({ color: 0xf4b8c2, roughness: 0.82 });
  const mNose = new THREE.MeshStandardMaterial({ color: 0xd88a9d, roughness: 0.72 });
  const mEye = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const mHL = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.88, 1.02), mFur);
  body.position.y = 0.86;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.76), mBelly);
  belly.position.set(0, 0.8, 0.14);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.68), mFur);
  head.position.set(0, 1.48, 0.23);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.36), mBelly);
  snout.position.set(0, 1.33, 0.58);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), mNose);
  nose.position.set(0, 1.37, 0.78);

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.84, 0.2), mFur);
  earL.position.set(-0.24, 2.0, 0.1);
  earL.rotation.z = 0.08;
  const earR = earL.clone();
  earR.position.x = 0.24;
  earR.rotation.z = -0.08;
  const earInL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.08), mEarInner);
  earInL.position.set(-0.24, 2.0, 0.17);
  earInL.rotation.z = 0.08;
  const earInR = earInL.clone();
  earInR.position.x = 0.24;
  earInR.rotation.z = -0.08;

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), mEye);
  eyeL.position.set(-0.2, 1.48, 0.58);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.2;
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), mHL);
  hlL.position.set(-0.22, 1.51, 0.59);
  const hlR = hlL.clone();
  hlR.position.x = 0.22;

  const rearLegL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.28), mFur);
  rearLegL.position.set(-0.24, 0.26, -0.15);
  const rearLegR = rearLegL.clone();
  rearLegR.position.x = 0.24;
  const frontLegL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.2), mFur);
  frontLegL.position.set(-0.2, 0.3, 0.38);
  const frontLegR = frontLegL.clone();
  frontLegR.position.x = 0.2;
  const pawL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.24), mBelly);
  pawL.position.set(-0.24, 0.06, -0.08);
  const pawR = pawL.clone();
  pawR.position.x = 0.24;
  const pawFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.2), mBelly);
  pawFrontL.position.set(-0.2, 0.08, 0.45);
  const pawFrontR = pawFrontL.clone();
  pawFrontR.position.x = 0.2;

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.24), mBelly);
  tail.position.set(0, 1.0, -0.65);

  group.add(
    body, belly, head, snout, nose,
    earL, earR, earInL, earInR,
    eyeL, eyeR, hlL, hlR,
    rearLegL, rearLegR, frontLegL, frontLegR,
    pawL, pawR, pawFrontL, pawFrontR,
    tail
  );
  group.scale.setScalar(1 / 1.35);
  return finalizeCharacter('rabbit', group);
}

function createFox() {
  const group = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xe98a3b, roughness: 0.84 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xf5e8d4, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1f1a, roughness: 0.82 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x0f0f0f });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.72, 1.2), fur);
  body.position.set(0, 0.76, 0);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.72), belly);
  chest.position.set(0, 0.72, 0.24);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.74), fur);
  head.position.set(0, 1.24, 0.32);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.32), belly);
  snout.position.set(0, 1.14, 0.73);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), dark);
  nose.position.set(0, 1.15, 0.9);

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.16), fur);
  earL.position.set(-0.22, 1.66, 0.3);
  earL.rotation.z = 0.08;
  const earR = earL.clone();
  earR.position.x = 0.22;
  earR.rotation.z = -0.08;
  const earTipL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.09), dark);
  earTipL.position.set(-0.22, 1.79, 0.3);
  const earTipR = earTipL.clone();
  earTipR.position.x = 0.22;

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.07), eye);
  eyeL.position.set(-0.18, 1.28, 0.68);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18;

  const legBackL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.26), fur);
  legBackL.position.set(-0.24, 0.28, -0.26);
  const legBackR = legBackL.clone();
  legBackR.position.x = 0.24;
  const legFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.2), fur);
  legFrontL.position.set(-0.2, 0.28, 0.42);
  const legFrontR = legFrontL.clone();
  legFrontR.position.x = 0.2;
  const pawL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.19), dark);
  pawL.position.set(-0.2, 0.04, 0.42);
  const pawR = pawL.clone();
  pawR.position.x = 0.2;
  const pawBL = pawL.clone();
  pawBL.position.set(-0.24, 0.04, -0.25);
  const pawBR = pawBL.clone();
  pawBR.position.x = 0.24;

  const tailBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.76), fur);
  tailBase.position.set(0, 0.88, -0.84);
  tailBase.rotation.x = -0.4;
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), belly);
  tailTip.position.set(0, 0.68, -1.15);
  tailTip.rotation.x = -0.35;

  group.add(
    body, chest, head, snout, nose, earL, earR, earTipL, earTipR, eyeL, eyeR,
    legBackL, legBackR, legFrontL, legFrontR, pawL, pawR, pawBL, pawBR,
    tailBase, tailTip
  );
  return finalizeCharacter('fox', group);
}

function createPanda() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.88 });
  const black = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.86 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x0d0d0d });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.92, 1.0), white);
  body.position.set(0, 0.86, 0.02);
  // Keep side patches slightly offset to avoid coplanar flicker in previews.
  const bodySideL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.96), black);
  bodySideL.position.set(-0.47, 0.84, 0.02);
  const bodySideR = bodySideL.clone();
  bodySideR.position.x = 0.47;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.78, 0.8), white);
  head.position.set(0, 1.5, 0.2);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), black);
  earL.position.set(-0.25, 1.93, 0.1);
  const earR = earL.clone();
  earR.position.x = 0.25;
  const eyePatchL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), black);
  eyePatchL.position.set(-0.21, 1.5, 0.58);
  const eyePatchR = eyePatchL.clone();
  eyePatchR.position.x = 0.21;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), eye);
  eyeL.position.set(-0.21, 1.5, 0.64);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.21;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), white);
  snout.position.set(0, 1.35, 0.66);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), black);
  nose.position.set(0, 1.36, 0.77);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.56, 0.22), black);
  armL.position.set(-0.4, 0.52, 0.36);
  const armR = armL.clone();
  armR.position.x = 0.4;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.3), black);
  legL.position.set(-0.25, 0.23, -0.2);
  const legR = legL.clone();
  legR.position.x = 0.25;
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.28), black);
  footL.position.set(-0.25, 0.05, -0.2);
  const footR = footL.clone();
  footR.position.x = 0.25;

  group.add(
    body, bodySideL, bodySideR, head, earL, earR,
    eyePatchL, eyePatchR, eyeL, eyeR, snout, nose,
    armL, armR, legL, legR, footL, footR
  );
  return finalizeCharacter('panda', group);
}

function createTurtle() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x4f7f39, roughness: 0.88 });
  const shellDark = new THREE.MeshStandardMaterial({ color: 0x3e652d, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9bc981, roughness: 0.9 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x121212 });

  const shellBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.56, 1.28), shell);
  shellBase.position.set(0, 0.62, 0);
  const shellTop = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.34, 1.0), shellDark);
  shellTop.position.set(0, 0.98, 0);
  const shellStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 1.02), shell);
  shellStripe.position.set(0, 0.97, 0);
  const shellStripeL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 1.02), shell);
  shellStripeL.position.set(-0.26, 0.93, 0);
  const shellStripeR = shellStripeL.clone();
  shellStripeR.position.x = 0.26;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.46), skin);
  head.position.set(0, 0.56, 0.88);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), skin);
  jaw.position.set(0, 0.41, 1.0);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.07), eye);
  eyeL.position.set(-0.12, 0.63, 1.08);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;

  const legFL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.32), skin);
  legFL.position.set(-0.42, 0.2, 0.43);
  const legFR = legFL.clone();
  legFR.position.x = 0.42;
  const legBL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.34), skin);
  legBL.position.set(-0.42, 0.2, -0.45);
  const legBR = legBL.clone();
  legBR.position.x = 0.42;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), skin);
  tail.position.set(0, 0.43, -0.86);

  group.add(
    shellBase, shellTop, shellStripe, shellStripeL, shellStripeR,
    head, jaw, eyeL, eyeR, legFL, legFR, legBL, legBR, tail
  );
  return finalizeCharacter('turtle', group);
}

function createDeer() {
  const group = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xc58d56, roughness: 0.87 });
  const furDark = new THREE.MeshStandardMaterial({ color: 0x9b6d43, roughness: 0.9 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xf0dfc8, roughness: 0.9 });
  const antler = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.92 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const eyePupil = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.82 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.78, 1.44), fur);
  body.position.set(0, 0.92, 0);
  const bellyPatch = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 1.1), belly);
  bellyPatch.position.set(0, 0.8, 0.1);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.32), furDark);
  neck.position.set(0, 1.3, 0.56);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.7), fur);
  head.position.set(0, 1.56, 0.95);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.34), belly);
  snout.position.set(0, 1.44, 1.31);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), furDark);
  nose.position.set(0, 1.46, 1.46);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.07), eyeWhite);
  eyeL.position.set(-0.14, 1.6, 1.23);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.14;
  const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), eyePupil);
  pupilL.position.set(-0.14, 1.6, 1.29);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.14;

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.14), furDark);
  earL.position.set(-0.17, 1.8, 0.98);
  earL.rotation.z = 0.12;
  const earR = earL.clone();
  earR.position.x = 0.17;
  earR.rotation.z = -0.12;

  const antlerStemL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), antler);
  antlerStemL.position.set(-0.11, 2.02, 0.96);
  const antlerStemR = antlerStemL.clone();
  antlerStemR.position.x = 0.11;
  const antlerBranchL1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), antler);
  antlerBranchL1.position.set(-0.2, 2.12, 1.0);
  antlerBranchL1.rotation.z = 0.52;
  const antlerBranchL2 = antlerBranchL1.clone();
  antlerBranchL2.position.set(-0.02, 2.18, 1.02);
  antlerBranchL2.rotation.z = -0.36;
  const antlerBranchR1 = antlerBranchL1.clone();
  antlerBranchR1.position.x = 0.2;
  antlerBranchR1.rotation.z = -0.52;
  const antlerBranchR2 = antlerBranchL2.clone();
  antlerBranchR2.position.x = 0.02;
  antlerBranchR2.rotation.z = 0.36;

  const legFL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.18), furDark);
  legFL.position.set(-0.22, 0.36, 0.52);
  const legFR = legFL.clone();
  legFR.position.x = 0.22;
  const legBL = legFL.clone();
  legBL.position.set(-0.22, 0.36, -0.52);
  const legBR = legBL.clone();
  legBR.position.x = 0.22;
  const hoofFL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), antler);
  hoofFL.position.set(-0.22, 0.05, 0.52);
  const hoofFR = hoofFL.clone();
  hoofFR.position.x = 0.22;
  const hoofBL = hoofFL.clone();
  hoofBL.position.set(-0.22, 0.05, -0.52);
  const hoofBR = hoofBL.clone();
  hoofBR.position.x = 0.22;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.2), belly);
  tail.position.set(0, 1.08, -0.84);

  group.add(
    body, bellyPatch, neck, head, snout, nose, eyeL, eyeR, pupilL, pupilR, earL, earR,
    antlerStemL, antlerStemR, antlerBranchL1, antlerBranchL2, antlerBranchR1, antlerBranchR2,
    legFL, legFR, legBL, legBR, hoofFL, hoofFR, hoofBL, hoofBR, tail
  );
  return finalizeCharacter('deer', group);
}

function createCharacterById(id) {
  if (id === 'turtle') return createTurtle();
  if (id === 'deer') return createDeer();
  return createRabbit();
}

const CHARACTER_PREVIEW_SCALE = {
  rabbit: 1.03,
  turtle: 1.12,
  deer: 0.83,
};
const CHARACTER_PREVIEW_ROTATION = {
  rabbit: 0.62,
  turtle: 0.56,
  deer: 0.64,
};
const characterPreviewRigs = [];

function refreshCharacterPreviewSizes() {
  for (const rig of characterPreviewRigs) {
    const width = Math.max(56, Math.round(rig.slot.clientWidth || 72));
    const height = Math.max(56, Math.round(rig.slot.clientHeight || 72));
    rig.renderer.setSize(width, height, false);
    rig.camera.aspect = width / height;
    rig.camera.updateProjectionMatrix();
  }
}

function renderCharacterPreviews(dt = 0) {
  if (!characterPreviewRigs.length) return;
  for (const rig of characterPreviewRigs) {
    rig.time += dt;
    rig.model.rotation.y = rig.baseRot + Math.sin(rig.time * 0.28 + rig.phase) * 0.018;
    rig.model.position.y = rig.baseY;
    rig.renderer.render(rig.scene, rig.camera);
  }
}

function setupCharacterPreviews() {
  if (!characterPreviewSlots.length) return;
  for (const oldRig of characterPreviewRigs) {
    oldRig.renderer.dispose();
    oldRig.slot.replaceChildren();
  }
  characterPreviewRigs.length = 0;

  for (const slot of characterPreviewSlots) {
    const id = normalizeCharacterId(slot.dataset.preview || 'rabbit');
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(31, 1, 0.1, 18);
    previewCamera.position.set(2.05, 2.0, 2.28);
    previewCamera.lookAt(0, 0.82, 0);

    const hemiLight = new THREE.HemisphereLight(0xf8fff4, 0x31533f, 1.1);
    const keyLight = new THREE.DirectionalLight(0xffefd6, 1.2);
    keyLight.position.set(2.6, 3.2, 2.4);
    const fillLight = new THREE.DirectionalLight(0x8fb7ff, 0.45);
    fillLight.position.set(-2.1, 1.8, -2.4);
    previewScene.add(hemiLight, keyLight, fillLight);

    const previewCharacter = createCharacterById(id);
    previewCharacter.group.scale.multiplyScalar(CHARACTER_PREVIEW_SCALE[id] ?? 1);
    previewCharacter.group.position.y = 0.03;
    previewScene.add(previewCharacter.group);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.18, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: 0x365943, roughness: 0.92, metalness: 0.04 })
    );
    floor.position.y = -0.05;
    previewScene.add(floor);

    const previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio, PERFORMANCE.previewPixelRatio));
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.06;
    previewRenderer.domElement.style.width = '100%';
    previewRenderer.domElement.style.height = '100%';
    slot.replaceChildren(previewRenderer.domElement);

    characterPreviewRigs.push({
      id,
      slot,
      scene: previewScene,
      camera: previewCamera,
      renderer: previewRenderer,
      model: previewCharacter.group,
      baseRot: CHARACTER_PREVIEW_ROTATION[id] ?? 0.62,
      baseY: previewCharacter.group.position.y,
      phase: Math.random() * Math.PI * 2,
      time: Math.random() * 8,
    });
  }

  refreshCharacterPreviewSizes();
  renderCharacterPreviews(0);
}

function shouldRenderCharacterPreviews() {
  return menu.style.display !== 'none' || characterMenu?.classList.contains('open');
}

let selectedCharacterId = normalizeCharacterId(localStorage.getItem('crossy3d_character'));
let player = createCharacterById(selectedCharacterId);
scene.add(player.group);

function setCharacter(id) {
  const nextId = normalizeCharacterId(id);
  selectedCharacterId = nextId;
  localStorage.setItem('crossy3d_character', nextId);
  if (player.id === nextId) return;

  const next = createCharacterById(nextId);
  next.group.position.copy(player.group.position);
  next.group.rotation.copy(player.group.rotation);
  next.group.scale.copy(player.group.scale);
  next.targetX = player.targetX;
  next.targetZ = player.targetZ;
  next.targetRotY = player.targetRotY;
  next.jump = player.jump;
  next.moving = player.moving;
  next.moveTime = player.moveTime;
  next.moveDuration = player.moveDuration;
  next.moveFromX = player.moveFromX;
  next.moveFromZ = player.moveFromZ;
  next.moveToX = player.moveToX;
  next.moveToZ = player.moveToZ;
  next.riverSupportGraceS = player.riverSupportGraceS;
  next.group.visible = player.group.visible;
  scene.remove(player.group);
  scene.add(next.group);
  player = next;
}

function getCharacterName(id) {
  return CHARACTER_META[normalizeCharacterId(id)].name;
}

function syncCharacterUi() {
  const selectedName = getCharacterName(selectedCharacterId);
  if (selectedAnimalLabel) selectedAnimalLabel.textContent = `Selected: ${selectedName}`;
  if (menuCharacterLabel) menuCharacterLabel.textContent = selectedName.toUpperCase();

  for (const card of characterCards) {
    const cardId = normalizeCharacterId(card.dataset.animal || 'rabbit');
    const isSelected = cardId === selectedCharacterId;
    card.classList.toggle('selected', isSelected);
    const check = card.querySelector('.animal-check');
    if (check) check.textContent = isSelected ? 'Selected' : 'Tap to Select';
  }
}

function openCharacterMenu() {
  if (!characterMenu || menu.style.display === 'none') return;
  syncCharacterUi();
  characterMenu.classList.add('open');
  characterMenu.setAttribute('aria-hidden', 'false');
}

function closeCharacterMenu() {
  if (!characterMenu) return;
  characterMenu.classList.remove('open');
  characterMenu.setAttribute('aria-hidden', 'true');
}

syncCharacterUi();
setupCharacterPreviews();

// ── Eagle (swoops in when player goes 3+ blocks behind furthest point) ──
function createEagle() {
  const group = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: 0x3b2507, roughness: 0.85 });
  const mBelly = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });
  const mBeak = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.6 });
  const mEye = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const mWing = new THREE.MeshStandardMaterial({ color: 0x2a1a05, roughness: 0.85 });
  const mTalon = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.6 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.6), mBody);
  body.position.y = 0;
  body.castShadow = true;

  // White belly
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.0), mBelly);
  belly.position.set(0, -0.15, 0.1);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), mBelly);
  head.position.set(0, 0.6, 0.5);
  head.castShadow = true;

  // Beak
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.45), mBeak);
  beak.position.set(0, 0.45, 0.95);

  // Eyes
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), mEye);
  eyeL.position.set(-0.25, 0.65, 0.82);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.25;

  // Wings (wide, spread)
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.2), mWing);
  wingL.position.set(-1.7, 0.15, 0);
  wingL.rotation.z = 0.15;
  wingL.castShadow = true;
  const wingR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.2), mWing);
  wingR.position.set(1.7, 0.15, 0);
  wingR.rotation.z = -0.15;
  wingR.castShadow = true;

  // Legs (visible when grabbing)
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), mTalon);
  legL.position.set(-0.25, -0.65, 0.15);
  const legR = legL.clone(); legR.position.x = 0.25;

  // Talons (claws that grab player's head)
  const talonL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.4), mTalon);
  talonL.position.set(-0.25, -0.92, 0.2);
  const talonR = talonL.clone(); talonR.position.x = 0.25;
  // Front claw tips
  const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mTalon);
  clawL.position.set(-0.35, -0.98, 0.38);
  clawL.rotation.x = 0.4;
  const clawR = clawL.clone(); clawR.position.x = 0.35;
  const clawCL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mTalon);
  clawCL.position.set(-0.18, -0.98, 0.38);
  clawCL.rotation.x = 0.4;
  const clawCR = clawCL.clone(); clawCR.position.x = 0.18;

  group.add(body, belly, head, beak, eyeL, eyeR, wingL, wingR,
            legL, legR, talonL, talonR, clawL, clawR, clawCL, clawCR);
  group.scale.set(1.2, 1.2, 1.2);
  setMeshShadowFlags(group, false, false);
  return group;
}

const eagle = {
  mesh: createEagle(),
  active: false,
  phase: 0,      // 0=inactive, 1=swooping down, 2=carrying player away
  time: 0,
  startPos: new THREE.Vector3(),
  grabPos: new THREE.Vector3(),   // where eagle grabs player
  carryPos: new THREE.Vector3(),  // fly-away destination
};
eagle.mesh.visible = false;
scene.add(eagle.mesh);

function haptic(type = 'light') {
  if (!settings.haptics) return;
  const fn = window.triggerHaptic;
  if (typeof fn === 'function') fn(type);
}

function submitScore(v) {
  const fn = window.submitScore;
  if (typeof fn === 'function') fn(v);
}

function addClouds() { /* removed */ }

function getDifficulty() {
  // Her 20 skorda hız/sıklık artar, en fazla 2.5x
  return 1 + Math.min(score / 20, 1.5);
}

const DYNAMIC_LANE_PATTERN = [
  { type: 'road', hazard: 'cars' },
  { type: 'road', hazard: 'bikes' },
  { type: 'mud', hazard: 'barrels' },
  { type: 'road', hazard: 'trucks' },
  { type: 'rail', hazard: 'trains' },
  { type: 'grass', hazard: 'open' },
  { type: 'road', hazard: 'cars' },
  { type: 'road', hazard: 'bikes' },
  { type: 'grass', hazard: 'open' }, // riverdan hemen once guvenli cimen
  { type: 'river', hazard: 'logs' },
];

function laneProfileByIndex(i) {
  if (i === 0) return { type: 'grass', hazard: 'forest' };
  const idx = (Math.abs(i) - 1) % DYNAMIC_LANE_PATTERN.length;
  return DYNAMIC_LANE_PATTERN[idx];
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function resetChannelCooldown(channel, diff = getDifficulty()) {
  if (channel.kind === 'train') {
    channel.cooldown = channel.cooldownRange[0];
  } else {
    channel.cooldown = randomRange(channel.cooldownRange[0], channel.cooldownRange[1]) / diff;
  }
  channel.warningActive = false;
  channel.warningTimer = 0;
  channel.warningBeepTimer = 0;
  setTrainWarningVisual(channel, 0);
}

function makeLaneChannel(z, speed, kind, max, cooldownRange, spawnGap) {
  const channel = {
    z,
    speed,
    kind,
    max,
    cooldown: 0,
    cooldownRange,
    spawnGap,
    warningLead: kind === 'train' ? TRAIN_WARNING_LEAD_S : 0,
    warningActive: false,
    warningTimer: 0,
    warningBeepTimer: 0,
    warningMaterials: [],
    trainSpeedMultiplier: kind === 'train' ? 1 : 1,
    trainSpeedRamp: kind === 'train' ? 0.35 : 0,
    trainSpeedMax: kind === 'train' ? 3 : 1,
  };
  resetChannelCooldown(channel);
  return channel;
}

function setTrainWarningVisual(channel, pulse) {
  if (channel.kind !== 'train' || !channel.warningMaterials.length) return;
  const clamped = THREE.MathUtils.clamp(pulse, 0, 1);
  for (const mat of channel.warningMaterials) {
    mat.color.setHex(clamped > 0.08 ? 0xff5f5f : 0x5a3a3a);
    mat.emissive.setHex(clamped > 0.08 ? 0xff2d2d : 0x251010);
    mat.emissiveIntensity = 0.08 + clamped * 1.6;
  }
}

function canSpawnInChannel(lane, channel) {
  const sub = movers.filter(m => m.lane === lane && Math.abs(m.mesh.position.z - channel.z) < laneDepth * 0.4);
  if (sub.length >= channel.max) return false;
  const spawnX = channel.speed > 0 ? -trafficSpawnX : trafficSpawnX;
  const newHalfX = estimateMoverHalfX(channel.kind);
  const spawnSafety = Math.max(0.55, channel.spawnGap * 0.34);
  return !sub.some(m => Math.abs(m.mesh.position.x - spawnX) < m.halfX + newHalfX + spawnSafety);
}

function trySpawnInChannel(lane, channel, setBusyCooldown = true) {
  if (!canSpawnInChannel(lane, channel)) {
    if (setBusyCooldown) channel.cooldown = 0.24 + Math.random() * 0.3;
    return false;
  }
  spawnMover(lane, channel.speed, channel.z, channel.kind);
  resetChannelCooldown(channel, getDifficulty());
  return true;
}

function updateTrainChannel(lane, channel, dt) {
  if (!channel.warningActive) {
    if (channel.cooldown > channel.warningLead) {
      setTrainWarningVisual(channel, 0);
      return;
    }
    channel.warningActive = true;
    channel.warningTimer = Math.max(channel.warningLead, 0.35);
    channel.warningBeepTimer = 0;
  }

  channel.warningTimer -= dt;
  channel.warningBeepTimer -= dt;
  const pulse = 0.5 + 0.5 * Math.sin(elapsedGameTime * 22);
  setTrainWarningVisual(channel, pulse);

  if (
    active
    && channel.warningBeepTimer <= 0
    && Math.abs(channel.z - player.group.position.z) <= laneDepth * 1.7
  ) {
    blip(880, 0.05, 0.018, 'square');
    channel.warningBeepTimer = 0.32;
  }

  if (channel.warningTimer > 0) return;

  const spawned = canSpawnInChannel(lane, channel);
  if (!spawned) {
    channel.warningTimer = 0.2;
    return;
  }
  const signedSpeed = Math.sign(channel.speed || 1);
  const boostedSpeed = signedSpeed * Math.abs(channel.speed) * channel.trainSpeedMultiplier;
  spawnMover(lane, boostedSpeed, channel.z, channel.kind);
  channel.trainSpeedMultiplier = Math.min(channel.trainSpeedMax, channel.trainSpeedMultiplier + channel.trainSpeedRamp);
  resetChannelCooldown(channel);

  channel.warningActive = false;
  channel.warningTimer = 0;
  channel.warningBeepTimer = 0;
  setTrainWarningVisual(channel, 0);
}

function addLane(z, idx) {
  const diff = getDifficulty();
  const speedScale = 1 + Math.min((diff - 1) * 0.65, 0.85);
  const profile = laneProfileByIndex(idx);
  const lane = {
    z, idx,
    type: profile.type,
    hazard: profile.hazard,
    channels: [],
    obstacles: [],
    decorMeshes: [],
    mesh: null,
  };

  if (lane.hazard === 'cars') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (3.2 + Math.random() * 1.6) * speedScale, 'car', 3, [1.2, 2.0], 2.8));
  } else if (lane.hazard === 'bikes') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (2.9 + Math.random() * 1.3) * speedScale, 'bike', 3, [0.9, 1.45], 1.9));
  } else if (lane.hazard === 'logs') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (1.05 + Math.random() * 0.75) * speedScale, 'log', 5, [0.45, 0.85], 2.0));
  } else if (lane.hazard === 'trucks') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (1.5 + Math.random() * 0.85) * speedScale, 'truck', 2, [2.0, 3.1], 4.2));
  } else if (lane.hazard === 'trains') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    const trainScale = 1 + Math.min((diff - 1) * 0.32, 0.46);
    lane.channels.push(makeLaneChannel(z, dir * (8.3 + Math.random() * 2.6) * trainScale * TRAIN_SPEED_BOOST, 'train', 1, [7.0, 7.0], 9.2));
  } else if (lane.hazard === 'barrels') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (2.2 + Math.random() * 1.05) * speedScale, 'barrel', 3, [0.8, 1.35], 2.1));
  }

  const mat = lane.type === 'grass'
    ? (idx % 2 === 0 ? MAT.grassA : MAT.grassB)
    : lane.type === 'road'
      ? (idx % 2 === 0 ? MAT.roadA : MAT.roadB)
      : lane.type === 'river'
        ? (idx % 2 === 0 ? MAT.riverA : MAT.riverB)
        : lane.type === 'rail'
          ? (idx % 2 === 0 ? MAT.railA : MAT.railB)
          : (idx % 2 === 0 ? MAT.mudA : MAT.mudB);
  const laneMesh = acquireBoxMesh(laneWidth, 0.24, laneDepth, mat);
  laneMesh.position.set(0, 0, z);
  laneMesh.receiveShadow = true;
  scene.add(laneMesh);
  lane.mesh = laneMesh;

  const shoulderMat = lane.type === 'road'
    ? MAT.curb
    : lane.type === 'river' || lane.type === 'mud'
      ? MAT.bank
      : lane.type === 'rail'
        ? MAT.railSleeper
        : MAT.grassEdge;
  const shoulderW = lane.type === 'road' ? 0.26 : 0.2;
  const shoulderH = lane.type === 'road' ? 0.32 : 0.27;
  const edgeL = acquireBoxMesh(shoulderW, shoulderH, laneDepth, shoulderMat);
  const edgeR = acquireBoxMesh(shoulderW, shoulderH, laneDepth, shoulderMat);
  edgeL.position.set(-laneWidth * 0.5 - shoulderW * 0.5, shoulderH * 0.5 - 0.03, z);
  edgeR.position.set(laneWidth * 0.5 + shoulderW * 0.5, shoulderH * 0.5 - 0.03, z);
  edgeL.receiveShadow = edgeR.receiveShadow = true;
  addTrackedObject(scene, lane.decorMeshes, edgeL);
  addTrackedObject(scene, lane.decorMeshes, edgeR);

  if (lane.type === 'road') {
    const shoulderA = acquireBoxMesh(laneWidth - 0.45, 0.03, 0.24, MAT.roadShoulder);
    const shoulderB = acquireBoxMesh(laneWidth - 0.45, 0.03, 0.24, MAT.roadShoulder);
    shoulderA.position.set(0, 0.145, z - laneDepth * 0.37);
    shoulderB.position.set(0, 0.145, z + laneDepth * 0.37);
    addTrackedObject(scene, lane.decorMeshes, shoulderA);
    addTrackedObject(scene, lane.decorMeshes, shoulderB);

    const rumbleMat = idx % 2 === 0 ? MAT.roadRumbleA : MAT.roadRumbleB;
    const rumbleA = acquireBoxMesh(laneWidth - 0.08, 0.06, 0.28, rumbleMat);
    const rumbleB = acquireBoxMesh(laneWidth - 0.08, 0.06, 0.28, rumbleMat);
    rumbleA.position.set(0, 0.165, z - laneDepth * 0.455);
    rumbleB.position.set(0, 0.165, z + laneDepth * 0.455);
    addTrackedObject(scene, lane.decorMeshes, rumbleA);
    addTrackedObject(scene, lane.decorMeshes, rumbleB);

    const sideA = acquireBoxMesh(laneWidth - 1.4, 0.015, 0.05, MAT.roadLine);
    const sideB = acquireBoxMesh(laneWidth - 1.4, 0.015, 0.05, MAT.roadLine);
    sideA.position.set(0, 0.15, z - laneDepth * 0.29);
    sideB.position.set(0, 0.15, z + laneDepth * 0.29);
    addTrackedObject(scene, lane.decorMeshes, sideA);
    addTrackedObject(scene, lane.decorMeshes, sideB);

  } else if (lane.type === 'river') {
    const foamL = acquireBoxMesh(laneWidth, 0.02, 0.08, MAT.foam);
    const foamR = acquireBoxMesh(laneWidth, 0.02, 0.08, MAT.foam);
    foamL.position.set(0, 0.14, z - laneDepth * 0.45);
    foamR.position.set(0, 0.14, z + laneDepth * 0.45);
    addTrackedObject(scene, lane.decorMeshes, foamL);
    addTrackedObject(scene, lane.decorMeshes, foamR);
  } else if (lane.type === 'rail') {
    const railA = acquireBoxMesh(laneWidth - 0.45, 0.08, 0.09, MAT.railMetal);
    const railB = acquireBoxMesh(laneWidth - 0.45, 0.08, 0.09, MAT.railMetal);
    railA.position.set(0, 0.17, z - laneDepth * 0.18);
    railB.position.set(0, 0.17, z + laneDepth * 0.18);
    addTrackedObject(scene, lane.decorMeshes, railA);
    addTrackedObject(scene, lane.decorMeshes, railB);
    for (let x = -laneWidth * 0.45; x <= laneWidth * 0.45; x += 1.3) {
      const sleeper = acquireBoxMesh(0.28, 0.04, laneDepth * 0.72, MAT.railSleeper);
      sleeper.position.set(x, 0.135, z);
      sleeper.receiveShadow = true;
      addTrackedObject(scene, lane.decorMeshes, sleeper);
    }
    if (lane.hazard === 'trains') {
      for (const channel of lane.channels) {
        const warningMat = acquireTrainWarningMaterial();
        for (let x = -laneWidth * 0.38; x <= laneWidth * 0.38; x += 6.4) {
          for (const edge of [-1, 1]) {
            const edgeZ = channel.z + edge * laneDepth * 0.44;
            const post = acquireBoxMesh(0.08, 0.42, 0.08, MAT.carMetal);
            post.position.set(x, 0.22, edgeZ);
            const sign = acquireBoxMesh(0.34, 0.24, 0.05, POOL_MAT.trainWarningSign);
            sign.position.set(x, 0.47, edgeZ);
            const stripeA = acquireBoxMesh(0.24, 0.04, 0.01, POOL_MAT.trainWarningStripe);
            const stripeB = acquireBoxMesh(0.24, 0.04, 0.01, POOL_MAT.trainWarningStripe);
            stripeA.position.set(x, 0.47, edgeZ + 0.03);
            stripeB.position.set(x, 0.47, edgeZ - 0.03);
            stripeA.rotation.z = Math.PI * 0.25;
            stripeB.rotation.z = -Math.PI * 0.25;
            const lamp = acquireBoxMesh(0.12, 0.12, 0.12, warningMat);
            lamp.position.set(x, 0.65, edgeZ);
            for (const mesh of [post, sign, stripeA, stripeB, lamp]) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              addTrackedObject(scene, lane.decorMeshes, mesh);
            }
          }
        }

        for (const side of [-1, 1]) {
          const lamp = acquireBoxMesh(0.34, 0.26, 0.26, warningMat);
          lamp.position.set(side * (sideLimit + 0.82), 0.34, channel.z);
          lamp.castShadow = true;
          lamp.receiveShadow = true;
          addTrackedObject(scene, lane.decorMeshes, lamp);
        }

        channel.warningMaterials.push(warningMat);
        setTrainWarningVisual(channel, 0);
      }
    }
  } else if (lane.type === 'mud') {
    for (let x = -laneWidth * 0.42; x <= laneWidth * 0.42; x += 3.1) {
      if (Math.random() < 0.75) {
        const puddle = acquireBoxMesh(1.2, 0.03, 0.42, MAT.mudPuddle);
        puddle.position.set(x + randomRange(-0.3, 0.3), 0.135, z + randomRange(-0.7, 0.7));
        addTrackedObject(scene, lane.decorMeshes, puddle);
      }
    }
  }

  if (lane.type === 'grass') {
    if (lane.hazard === 'open') spawnOpenGrassDecor(lane);
    else spawnGrassDecor(lane);
  }

  lanes.push(lane);
  requestShadowRefresh();
}

function spawnTree(lane, x, z, isObstacle) {
  const pieces = [];
  const variant = Math.random();
  if (variant < 0.5) {
    const trunk = acquireBoxMesh(0.22, 0.5, 0.22, MAT.trunk);
    const leafBase = acquireBoxMesh(0.88, 0.58, 0.88, MAT.leaf);
    const leafMid = acquireBoxMesh(0.7, 0.4, 0.7, MAT.leafDark);
    const leafTop = acquireBoxMesh(0.46, 0.3, 0.46, MAT.leaf);
    trunk.position.set(x, 0.26, z);
    leafBase.position.set(x, 0.72, z);
    leafMid.position.set(x + randomRange(-0.04, 0.04), 1.07, z + randomRange(-0.04, 0.04));
    leafTop.position.set(x, 1.38, z);
    pieces.push(trunk, leafBase, leafMid, leafTop);
  } else {
    const trunk = acquireBoxMesh(0.2, 0.56, 0.2, MAT.trunk);
    const tierA = acquireBoxMesh(0.86, 0.3, 0.86, MAT.leafDark);
    const tierB = acquireBoxMesh(0.62, 0.28, 0.62, MAT.leaf);
    const tierC = acquireBoxMesh(0.42, 0.24, 0.42, MAT.leafDark);
    const crown = acquireBoxMesh(0.2, 0.16, 0.2, MAT.leaf);
    trunk.position.set(x, 0.29, z);
    tierA.position.set(x, 0.72, z);
    tierB.position.set(x, 0.99, z);
    tierC.position.set(x, 1.24, z);
    crown.position.set(x, 1.45, z);
    pieces.push(trunk, tierA, tierB, tierC, crown);
  }

  for (const piece of pieces) {
    piece.castShadow = true;
    piece.receiveShadow = true;
    addTrackedObject(scene, lane.decorMeshes, piece);
  }
  if (isObstacle) lane.obstacles.push({ x, z, halfX: 0.48, halfZ: 0.48, kind: 'tree' });
}

function spawnRock(lane, x, z, isObstacle) {
  const base = acquireBoxMesh(0.68, 0.3, 0.64, MAT.stone);
  const side = acquireBoxMesh(0.28, 0.16, 0.24, MAT.stone);
  const top = acquireBoxMesh(0.46, 0.24, 0.44, MAT.stone);
  const highlight = acquireBoxMesh(0.24, 0.08, 0.18, POOL_MAT.stoneHighlight);
  base.position.set(x, 0.16, z);
  side.position.set(x - 0.18, 0.22, z + 0.16);
  top.position.set(x + randomRange(-0.06, 0.06), 0.42, z + randomRange(-0.05, 0.05));
  highlight.position.set(top.position.x + 0.06, 0.53, top.position.z - 0.06);
  for (const mesh of [base, side, top, highlight]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addTrackedObject(scene, lane.decorMeshes, mesh);
  }
  if (isObstacle) lane.obstacles.push({ x, z, halfX: 0.38, halfZ: 0.36, kind: 'rock' });
}

function spawnBush(lane, x, z, isObstacle) {
  const core = acquireBoxMesh(0.74, 0.34, 0.64, MAT.bush);
  const sideL = acquireBoxMesh(0.28, 0.22, 0.28, MAT.leaf);
  const sideR = acquireBoxMesh(0.28, 0.22, 0.28, MAT.leaf);
  const top = acquireBoxMesh(0.52, 0.26, 0.46, MAT.leafDark);
  const flower = acquireBoxMesh(0.1, 0.08, 0.1, POOL_MAT.bushFlower);
  core.position.set(x, 0.2, z);
  sideL.position.set(x - 0.22, 0.24, z + 0.06);
  sideR.position.set(x + 0.22, 0.24, z - 0.04);
  top.position.set(x, 0.44, z + 0.02);
  flower.position.set(x + randomRange(-0.08, 0.08), 0.56, z + randomRange(-0.08, 0.08));
  for (const mesh of [core, sideL, sideR, top, flower]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addTrackedObject(scene, lane.decorMeshes, mesh);
  }
  if (isObstacle) lane.obstacles.push({ x, z, halfX: 0.36, halfZ: 0.34, kind: 'bush' });
}

function spawnGrassDecor(lane) {
  const z = lane.z;
  const count = 6 + Math.floor(Math.random() * 4);
  const usedCells = new Set();
  for (let i = 0; i < count; i++) {
    const rawX = THREE.MathUtils.randFloat(-sideLimit + 0.7, sideLimit - 0.7);
    if (Math.abs(rawX) < xStep * 1.15) continue;
    const gridX = Math.round(rawX / xStep) * xStep;
    const laneRow = Math.random() > 0.5 ? 'a' : 'b';
    const cellKey = `${gridX.toFixed(2)}:${laneRow}`;
    if (usedCells.has(cellKey)) continue;
    usedCells.add(cellKey);
    const x = gridX + (Math.random() > 0.5 ? 0.08 : -0.08);
    const zOffset = laneRow === 'a' ? -0.54 : 0.54;
    const pick = Math.random();
    if (pick < 0.42) spawnTree(lane, x, z + zOffset, true);
    else if (pick < 0.74) spawnRock(lane, x, z + zOffset, true);
    else spawnBush(lane, x, z + zOffset, true);
  }
  const marginInner = sideLimit + 1.4;
  const marginOuter = laneWidth * 0.5 - 0.5;
  for (let side = -1; side <= 1; side += 2) {
    const decorCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < decorCount; i++) {
      const x = side * THREE.MathUtils.randFloat(marginInner, marginOuter);
      const zOff = THREE.MathUtils.randFloat(-laneDepth * 0.4, laneDepth * 0.4);
      if (Math.random() < 0.6) spawnTree(lane, x, z + zOff, false);
      else spawnBush(lane, x, z + zOff, false);
    }
  }
}

function spawnOpenGrassDecor(lane) {
  const z = lane.z;
  const marginInner = sideLimit + 1.6;
  const marginOuter = laneWidth * 0.5 - 0.5;
  for (let side = -1; side <= 1; side += 2) {
    const decorCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < decorCount; i++) {
      const x = side * THREE.MathUtils.randFloat(marginInner, marginOuter);
      const zOff = THREE.MathUtils.randFloat(-laneDepth * 0.4, laneDepth * 0.4);
      if (Math.random() < 0.55) spawnTree(lane, x, z + zOff, false);
      else if (Math.random() < 0.5) spawnRock(lane, x, z + zOff, false);
      else spawnBush(lane, x, z + zOff, false);
    }
  }
}

function buildProceduralTrainMover(mover, w, h, d, wheelMeshes) {
  const paint = getVehiclePaintMaterial('train', pickVehicleColor('train'));
  const frameMat = POOL_MAT.trainFrame;
  const connectorMat = POOL_MAT.trainConnector;
  const doorMat = POOL_MAT.trainDoor;
  const carGap = 0.24;
  const carLen = (w - carGap) * 0.5;
  const centerOffset = (carLen + carGap) * 0.5;
  const carCenters = [-centerOffset, centerOffset];
  const wheelRadius = 0.14;

  for (const carCenter of carCenters) {
    const base = trackManagedChild(mover, acquireBoxMesh(carLen * 0.98, h * 0.24, d * 0.96, frameMat));
    base.position.set(carCenter, h * 0.18, 0);

    const lowerBody = trackManagedChild(mover, acquireBoxMesh(carLen * 0.96, h * 0.4, d * 0.94, paint));
    lowerBody.position.set(carCenter, h * 0.44, 0);

    const upperBody = trackManagedChild(mover, acquireBoxMesh(carLen * 0.82, h * 0.28, d * 0.86, paint));
    upperBody.position.set(carCenter, h * 0.77, 0);

    const roof = trackManagedChild(mover, acquireBoxMesh(carLen * 0.76, h * 0.08, d * 0.72, MAT.carTrim));
    roof.position.set(carCenter, h * 0.97, 0);

    const stripe = trackManagedChild(mover, acquireBoxMesh(carLen * 0.92, h * 0.08, d * 0.88, MAT.carTrim));
    stripe.position.set(carCenter, h * 0.63, 0);

    const bogieCenters = [carCenter - carLen * 0.28, carCenter + carLen * 0.28];
    for (const bogieX of bogieCenters) {
      const bogie = trackManagedChild(mover, acquireBoxMesh(carLen * 0.16, h * 0.1, d * 0.74, frameMat));
      bogie.position.set(bogieX, h * 0.12, 0);

      for (const side of [-1, 1]) {
        const wheel = trackManagedChild(mover, acquireCylinderMesh(wheelRadius, wheelRadius, 0.16, 14, MAT.carWheel));
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(bogieX, 0.16, side * d * 0.33);
        wheelMeshes.push(wheel);
      }
    }

    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const x = THREE.MathUtils.lerp(carCenter - carLen * 0.2, carCenter + carLen * 0.2, t);
      const windowBox = trackManagedChild(mover, acquireBoxMesh(carLen * 0.16, h * 0.18, d * 0.72, MAT.carGlass));
      windowBox.position.set(x, h * 0.82, 0);
    }
  }

  const connectorBase = trackManagedChild(mover, acquireBoxMesh(carGap * 1.2, h * 0.1, d * 0.34, frameMat));
  connectorBase.position.set(0, h * 0.16, 0);

  const connectorBoot = trackManagedChild(mover, acquireBoxMesh(carGap * 0.9, h * 0.32, d * 0.76, connectorMat));
  connectorBoot.position.set(0, h * 0.58, 0);

  const connectorRoof = trackManagedChild(mover, acquireBoxMesh(carGap * 0.82, h * 0.06, d * 0.64, MAT.carTrim));
  connectorRoof.position.set(0, h * 0.9, 0);

  const innerDoorLeft = trackManagedChild(mover, acquireBoxMesh(carGap * 0.32, h * 0.34, d * 0.62, doorMat));
  const innerDoorRight = trackManagedChild(mover, acquireBoxMesh(carGap * 0.32, h * 0.34, d * 0.62, doorMat));
  innerDoorLeft.position.set(-carGap * 0.52, h * 0.58, 0);
  innerDoorRight.position.set(carGap * 0.52, h * 0.58, 0);

  const frontNose = trackManagedChild(mover, acquireBoxMesh(carLen * 0.18, h * 0.34, d * 0.84, paint));
  frontNose.position.set(centerOffset + carLen * 0.43, h * 0.66, 0);

  const frontCab = trackManagedChild(mover, acquireBoxMesh(carLen * 0.22, h * 0.2, d * 0.66, MAT.carGlass));
  frontCab.position.set(centerOffset + carLen * 0.26, h * 0.9, 0);

  const frontSkirt = trackManagedChild(mover, acquireBoxMesh(carLen * 0.14, h * 0.12, d * 0.7, MAT.carMetal));
  frontSkirt.position.set(centerOffset + carLen * 0.49, h * 0.34, 0);

  const rearCap = trackManagedChild(mover, acquireBoxMesh(carLen * 0.1, h * 0.28, d * 0.84, MAT.carMetal));
  rearCap.position.set(-(centerOffset + carLen * 0.49), h * 0.6, 0);

  const frontLightL = trackManagedChild(mover, acquireBoxMesh(0.12, 0.12, 0.12, MAT.carHeadlight));
  const frontLightR = trackManagedChild(mover, acquireBoxMesh(0.12, 0.12, 0.12, MAT.carHeadlight));
  frontLightL.position.set(centerOffset + carLen * 0.51, h * 0.6, -d * 0.22);
  frontLightR.position.set(centerOffset + carLen * 0.51, h * 0.6, d * 0.22);

  const rearLightL = trackManagedChild(mover, acquireBoxMesh(0.1, 0.1, 0.1, MAT.carTaillight));
  const rearLightR = trackManagedChild(mover, acquireBoxMesh(0.1, 0.1, 0.1, MAT.carTaillight));
  rearLightL.position.set(-(centerOffset + carLen * 0.53), h * 0.56, -d * 0.2);
  rearLightR.position.set(-(centerOffset + carLen * 0.53), h * 0.56, d * 0.2);

  return wheelRadius;
}

function buildProceduralVehicleMover(mover, moverKind, w, h, d, wheelMeshes) {
  if (moverKind === 'train') return buildProceduralTrainMover(mover, w, h, d, wheelMeshes);

  const paintColor = pickVehicleColor(moverKind);
  const paint = getVehiclePaintMaterial(moverKind, paintColor);
  const under = trackManagedChild(mover, acquireBoxMesh(w, h * 0.38, d * 0.98, POOL_MAT.vehicleUnder));
  under.position.y = h * 0.24;

  const body = trackManagedChild(mover, acquireBoxMesh(w * 0.96, h * (moverKind === 'bike' ? 0.42 : 0.72), d * 0.96, paint));
  body.position.y = h * (moverKind === 'bike' ? 0.52 : 0.56) + 0.04;

  if (moverKind === 'bike') {
    const seat = trackManagedChild(mover, acquireBoxMesh(w * 0.36, h * 0.18, d * 0.82, paint));
    seat.position.set(-w * 0.06, h * 0.8, 0);
    const handle = trackManagedChild(mover, acquireBoxMesh(w * 0.1, h * 0.34, d * 0.9, MAT.carMetal));
    handle.position.set(w * 0.22, h * 0.94, 0);
    const fork = trackManagedChild(mover, acquireBoxMesh(w * 0.06, h * 0.4, d * 0.84, MAT.carMetal));
    fork.position.set(w * 0.31, h * 0.57, 0);
  } else {
    const cabinCenterX = moverKind === 'truck' ? w * 0.2 : -w * 0.02;
    const cabinBase = trackManagedChild(mover, acquireBoxMesh(
      w * (moverKind === 'truck' ? 0.46 : 0.62),
      h * 0.36,
      d * 0.88,
      paint
    ));
    cabinBase.position.set(cabinCenterX, h * 0.94, 0);

    const cabin = trackManagedChild(mover, acquireBoxMesh(
      w * (moverKind === 'truck' ? 0.34 : 0.56),
      h * 0.32,
      d * 0.8,
      MAT.carGlass
    ));
    cabin.position.set(cabinCenterX, h * 1.02, 0);

    const roof = trackManagedChild(mover, acquireBoxMesh(
      w * (moverKind === 'truck' ? 0.34 : 0.4),
      h * 0.1,
      d * 0.62,
      MAT.carTrim
    ));
    roof.position.set(cabin.position.x, h * 1.16, 0);

    if (moverKind === 'truck') {
      const cargo = trackManagedChild(mover, acquireBoxMesh(w * 0.44, h * 0.5, d * 0.84, POOL_MAT.truckCargo));
      cargo.position.set(-w * 0.2, h * 0.76, 0);
    } else if (Math.random() < 0.55) {
      const rack = trackManagedChild(mover, acquireBoxMesh(w * 0.32, h * 0.09, d * 0.64, MAT.carMetal));
      rack.position.set(0, h * 1.18, 0);
    }
  }

  const hood = trackManagedChild(mover, acquireBoxMesh(w * 0.26, h * 0.18, d * 0.82, paint));
  hood.position.set(w * 0.32, h * 0.78, 0);

  const bumperF = trackManagedChild(mover, acquireBoxMesh(w * 0.1, h * 0.18, d * 0.9, MAT.carMetal));
  const bumperR = trackManagedChild(mover, acquireBoxMesh(w * 0.1, h * 0.18, d * 0.9, MAT.carMetal));
  bumperF.position.set(w * 0.5, h * 0.42, 0);
  bumperR.position.set(-w * 0.5, h * 0.42, 0);

  if (moverKind !== 'bike') {
    const sideTrimL = trackManagedChild(mover, acquireBoxMesh(w * 0.7, h * 0.06, 0.05, MAT.carTrim));
    const sideTrimR = trackManagedChild(mover, acquireBoxMesh(w * 0.7, h * 0.06, 0.05, MAT.carTrim));
    sideTrimL.position.set(0, h * 0.6, -d * 0.47);
    sideTrimR.position.set(0, h * 0.6, d * 0.47);
  }

  const wheelRadius = moverKind === 'truck' ? 0.16 : moverKind === 'bike' ? 0.11 : 0.13;
  const wheelWidth = moverKind === 'bike' ? 0.12 : 0.16;
  const wx = w * (moverKind === 'bike' ? 0.34 : 0.28);
  const wz = moverKind === 'bike' ? d * 0.55 : d * 0.42;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (moverKind === 'bike' && sx === -1) continue;
      const wheel = trackManagedChild(mover, acquireCylinderMesh(wheelRadius, wheelRadius, wheelWidth, 14, MAT.carWheel));
      wheel.rotation.z = Math.PI * 0.5;
      wheel.position.set(moverKind === 'bike' ? 0 : sx * wx, moverKind === 'bike' ? 0.16 : 0.19, sz * wz);
      wheelMeshes.push(wheel);
    }
  }

  const frontLightL = trackManagedChild(mover, acquireBoxMesh(0.08, 0.08, 0.08, MAT.carHeadlight));
  const frontLightR = trackManagedChild(mover, acquireBoxMesh(0.08, 0.08, 0.08, MAT.carHeadlight));
  frontLightL.position.set(w * 0.51, h * 0.63, -d * 0.24);
  frontLightR.position.set(w * 0.51, h * 0.63, d * 0.24);
  const rearLightL = trackManagedChild(mover, acquireBoxMesh(0.08, 0.08, 0.08, MAT.carTaillight));
  const rearLightR = trackManagedChild(mover, acquireBoxMesh(0.08, 0.08, 0.08, MAT.carTaillight));
  rearLightL.position.set(-w * 0.51, h * 0.63, -d * 0.24);
  rearLightR.position.set(-w * 0.51, h * 0.63, d * 0.24);

  return wheelRadius;
}

function spawnMover(lane, subSpeed, subZ, kindOverride) {
  const defaultChannel = lane.channels[0];
  const moverKind = kindOverride ?? defaultChannel?.kind ?? 'car';
  const spd = subSpeed ?? defaultChannel?.speed ?? 1;
  const posZ = subZ ?? lane.z;
  const isLog = moverKind === 'log';
  let w = 1.6;
  let h = 0.8;
  let d = laneDepth * 0.32;
  let spinRate = 0;
  let wheelRadius = 0;
  const wheelMeshes = [];
  const headingYaw = spd < 0 ? Math.PI : 0;

  if (moverKind === 'log') {
    w = snapPooledDimension(1.9 + Math.random() * 2.3);
    h = 0.34;
    d = 0.92;
  } else if (moverKind === 'truck') {
    w = snapPooledDimension(2.7 + Math.random() * 1.0);
    h = 0.92;
    d = snapPooledDimension(laneDepth * 0.34);
  } else if (moverKind === 'bike') {
    w = snapPooledDimension(0.95 + Math.random() * 0.24);
    h = 0.52;
    d = snapPooledDimension(laneDepth * 0.18);
  } else if (moverKind === 'train') {
    w = 8.4;
    h = 1.24;
    d = snapPooledDimension(laneDepth * 0.46);
  } else if (moverKind === 'barrel') {
    w = snapPooledDimension(0.64 + Math.random() * 0.14);
    h = snapPooledDimension(0.62 + Math.random() * 0.14);
    d = w;
    spinRate = spd * 3.1;
  } else {
    w = snapPooledDimension(1.45 + Math.random() * 0.66);
    h = snapPooledDimension(0.74 + Math.random() * 0.1);
    d = snapPooledDimension(laneDepth * 0.32);
  }

  const mover = acquirePooledGroup(`mover:${moverKind}`);
  mover.position.set(spd > 0 ? -trafficSpawnX : trafficSpawnX, 0, posZ);
  if (moverKind === 'log') mover.position.y = -0.14;

  if (moverKind === 'log') {
    const body = trackManagedChild(mover, acquireBoxMesh(w, h, d, POOL_MAT.logBody));
    const deck = trackManagedChild(mover, acquireBoxMesh(w * 0.88, h * 0.3, d * 0.76, POOL_MAT.logDeck));
    const capL = trackManagedChild(mover, acquireBoxMesh(0.12, h * 0.92, d * 0.92, MAT.trunk));
    const capR = trackManagedChild(mover, acquireBoxMesh(0.12, h * 0.92, d * 0.92, MAT.trunk));
    body.position.y = h * 0.5 + 0.06;
    deck.position.y = h * 0.72 + 0.06;
    capL.position.set(-w * 0.5, h * 0.52 + 0.06, 0);
    capR.position.set(w * 0.5, h * 0.52 + 0.06, 0);
    for (let x = -w * 0.34; x <= w * 0.34; x += 0.54) {
      const plank = trackManagedChild(mover, acquireBoxMesh(0.08, h * 0.34, d * 0.7, MAT.trunk));
      plank.position.set(x, h * 0.69 + 0.06, 0);
    }
  } else if (moverKind === 'barrel') {
    const barrel = trackManagedChild(mover, acquireCylinderMesh(w * 0.5, w * 0.5, d * 0.92, 14, MAT.trunk));
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.y = h * 0.5 + 0.06;
    const ringL = trackManagedChild(mover, acquireTorusMesh(w * 0.34, 0.04, 8, 16, POOL_MAT.barrelRing));
    const ringR = trackManagedChild(mover, acquireTorusMesh(w * 0.34, 0.04, 8, 16, POOL_MAT.barrelRing));
    ringL.rotation.y = Math.PI * 0.5;
    ringR.rotation.y = Math.PI * 0.5;
    ringL.position.set(0, h * 0.5 + 0.06, -d * 0.19);
    ringR.position.set(0, h * 0.5 + 0.06, d * 0.19);
    for (let i = 0; i < 6; i++) {
      const spike = trackManagedChild(mover, acquireBoxMesh(0.28, 0.04, 0.04, POOL_MAT.barrelSpike));
      const angle = (Math.PI * 2 * i) / 6;
      spike.position.set(Math.cos(angle) * w * 0.46, h * 0.5 + 0.06, Math.sin(angle) * d * 0.23);
      spike.rotation.y = angle;
    }
  } else {
    const importedVehicle = moverKind === 'car' || moverKind === 'truck' || moverKind === 'bike'
      ? createImportedVehicleInstance(moverKind)
      : null;
    if (importedVehicle) {
      w = importedVehicle.hitboxX;
      d = importedVehicle.hitboxZ;
      h = Math.max(h, importedVehicle.height);
      trackManagedChild(mover, importedVehicle.mesh);
    } else {
      wheelRadius = buildProceduralVehicleMover(mover, moverKind, w, h, d, wheelMeshes);
    }
  }

  setMeshShadowFlags(mover, false, false);
  mover.rotation.y = headingYaw;
  scene.add(mover);
  movers.push({
    lane,
    mesh: mover,
    kind: moverKind,
    isLog,
    halfX: moverKind === 'train' ? 4.3 : w * 0.5,
    halfZ: d * 0.52,
    speed: spd,
    motion: createMoverMotion(moverKind, spd, headingYaw, posZ, wheelMeshes, wheelRadius, mover.position.y),
    spinRate,
  });
}

function createMoverMotion(kind, baseSpeed, headingYaw, restZ, wheels, wheelRadius, restY = 0) {
  const isBoat = kind === 'log';
  const isRoadVehicle = kind === 'car' || kind === 'truck' || kind === 'bike';
  if (!isBoat && !isRoadVehicle) return null;

  return {
    time: Math.random() * Math.PI * 2,
    baseSpeed,
    headingYaw,
    restY,
    restZ,
    wheelRadius,
    wheels,
    speedBlend: isBoat ? 2.8 : 5.4,
    speedWaveAmp: isBoat ? 0.12 : kind === 'bike' ? 0.08 : 0.06,
    speedWaveFreq: isBoat ? 1.15 + Math.random() * 0.45 : 1.9 + Math.random() * 0.7,
    speedWavePhase: Math.random() * Math.PI * 2,
    bobAmp: isBoat ? 0.028 : kind === 'bike' ? 0.048 : 0.034,
    bobFreq: isBoat ? 2.2 + Math.random() * 0.7 : 7.0 + Math.random() * 1.8,
    bobPhase: Math.random() * Math.PI * 2,
    swayAmp: isBoat ? 0.03 : kind === 'bike' ? 0.055 : 0.034,
    swayFreq: isBoat ? 1.7 + Math.random() * 0.6 : 3.4 + Math.random() * 1.2,
    swayPhase: Math.random() * Math.PI * 2,
    driftZAmp: isBoat ? 0.035 : 0.03,
    yawAmp: isBoat ? 0.011 : kind === 'bike' ? 0.03 : 0.018,
    rollAmp: isBoat ? 0.04 : kind === 'bike' ? 0.11 : 0.055,
    pitchAmp: isBoat ? 0.011 : 0.03,
  };
}

function animateMover(m, dt) {
  const motion = m.motion;
  if (!motion) {
    m.mesh.position.x += m.speed * dt;
    if (m.spinRate) m.mesh.rotation.z += m.spinRate * dt;
    return;
  }

  motion.time += dt;
  const speedWave = Math.sin(motion.time * motion.speedWaveFreq + motion.speedWavePhase) * motion.speedWaveAmp;
  const targetSpeed = motion.baseSpeed * (1 + speedWave);
  const speedLerp = 1 - Math.exp(-motion.speedBlend * dt);
  m.speed += (targetSpeed - m.speed) * speedLerp;

  const prevX = m.mesh.position.x;
  m.mesh.position.x += m.speed * dt;
  const travelX = m.mesh.position.x - prevX;

  const bob = Math.sin(motion.time * motion.bobFreq + motion.bobPhase);
  const sway = Math.sin(motion.time * motion.swayFreq + motion.swayPhase);
  const accelLean = THREE.MathUtils.clamp((targetSpeed - m.speed) * 0.16, -0.08, 0.08);

  m.mesh.position.y = motion.restY + bob * motion.bobAmp;
  m.mesh.position.z = motion.restZ + sway * motion.driftZAmp;
  m.mesh.rotation.x = bob * motion.pitchAmp + accelLean;
  m.mesh.rotation.y = motion.headingYaw + sway * motion.yawAmp;
  m.mesh.rotation.z = sway * motion.rollAmp;

  if (m.spinRate) m.mesh.rotation.z += m.spinRate * dt;

  if (motion.wheels.length && motion.wheelRadius > 0.01) {
    const wheelTurn = travelX / motion.wheelRadius;
    for (const wheel of motion.wheels) wheel.rotation.x += wheelTurn;
  }
}

function estimateMoverHalfX(kind) {
  if (kind === 'train') return 4.3;
  if (kind === 'truck') return 2.35;
  if (kind === 'log') return 2.1;
  if (kind === 'bike') return 0.8;
  if (kind === 'barrel') return 0.4;
  return 1.06; // car
}

function pickNonOverlappingSeedX(lane, channel, mover) {
  const minX = -sideLimit * 0.78;
  const maxX = sideLimit * 0.78;
  const sameChannel = () => movers.filter(
    m => m !== mover && m.lane === lane && Math.abs(m.mesh.position.z - channel.z) < laneDepth * 0.32
  );
  const safetyPad = Math.max(0.5, channel.spawnGap * 0.32);

  for (let i = 0; i < 30; i++) {
    const x = THREE.MathUtils.randFloat(minX, maxX);
    const blocked = sameChannel().some(other => Math.abs(other.mesh.position.x - x) < other.halfX + mover.halfX + safetyPad);
    if (!blocked) return x;
  }

  const step = Math.max(1.2, mover.halfX * 2 + safetyPad);
  for (let shift = 0; shift < 2; shift++) {
    for (let x = minX + shift * step * 0.5; x <= maxX; x += step) {
      const blocked = sameChannel().some(other => Math.abs(other.mesh.position.x - x) < other.halfX + mover.halfX + safetyPad);
      if (!blocked) return x;
    }
  }

  return THREE.MathUtils.randFloat(minX, maxX);
}

function resetWorld() {
  for (const l of lanes) {
    releaseLane(l);
  }
  for (const m of movers) releaseMover(m);
  for (const d of decor) scene.remove(d);
  lanes.length = 0;
  movers.length = 0;
  decor.length = 0;

  addClouds();

  // More lanes for isometric view: 8 behind start, player at 0, 16 ahead
  for (let laneIndex = 8; laneIndex >= -16; laneIndex--) {
    addLane(laneIndex * laneDepth, laneIndex);
  }

  player.group.position.set(0, 0, 0);
  player.group.rotation.set(0, Math.PI, 0);
  player.targetX = 0;
  player.targetZ = 0;
  player.moving = false;
  player.moveTime = 0;
  player.moveDuration = PLAYER_MOVE_DURATION_S;
  player.moveFromX = 0;
  player.moveFromZ = 0;
  player.moveToX = 0;
  player.moveToZ = 0;
  player.jump = 0;
  player.riverSupportGraceS = 0;
  player.group.visible = true;
  player.group.scale.set(1, 1, 1);
  score = 0;
  bestForward = 0;
  elapsedGameTime = 0;
  lastMoveAtS = -Infinity;
  dead = false;
  deathAnim.type = 'none';
  deathAnim.time = 0;
  deathAnim.done = false;
  camSmoothZ = 0;
  demoZ = 0;
  hudScore.textContent = '0';
  // Reset game over UI state
  gameover.style.display = 'none';
  document.getElementById('goScoreWrap')?.classList.remove('show');
  document.getElementById('retryBtn')?.classList.remove('show');
  // Reset eagle
  eagle.active = false;
  eagle.phase = 0;
  eagle.time = 0;
  eagle.mesh.visible = false;

  // Pre-spawn movers so traffic is already visible at game start
  for (const lane of lanes) {
    if (!lane.channels?.length) continue;
    for (const channel of lane.channels) {
      const baseCount = channel.kind === 'train'
        ? 1
        : channel.kind === 'log'
          ? 5
          : channel.kind === 'bike'
            ? 3
            : 2;
      const seedCount = Math.min(channel.max, baseCount);
      for (let i = 0; i < seedCount; i++) {
        spawnMover(lane, channel.speed, channel.z, channel.kind);
        const mover = movers[movers.length - 1];
        mover.mesh.position.x = pickNonOverlappingSeedX(lane, channel, mover);
      }
    }
  }
  requestShadowRefresh();
}

function movePlayer(dir) {
  if (!active || dead || eagle.active) return;
  const nowS = elapsedGameTime;
  if (nowS - lastMoveAtS < MOVE_INPUT_COOLDOWN_S) return;

  // Use logical target position as base (not visual)
  let nextX = player.targetX;
  let nextZ = player.targetZ;

  if (dir === 'left') nextX -= xStep;
  if (dir === 'right') nextX += xStep;
  if (dir === 'up') nextZ -= forwardStep;
  if (dir === 'down') nextZ += forwardStep;

  nextX = clampPlayerX(nextX);
  nextZ = Math.round(nextZ / forwardStep) * forwardStep;
  if (hitsGrassObstacle(nextX, nextZ)) {
    blip(220, 0.04, 0.018, 'square');
    haptic('medium');
    return;
  }

  player.moveFromX = player.group.position.x;
  player.moveFromZ = player.group.position.z;
  player.targetX = nextX;
  player.targetZ = nextZ;
  player.moveToX = nextX;
  player.moveToZ = nextZ;
  player.moveDuration = PLAYER_MOVE_DURATION_S;
  player.moveTime = 0;
  player.moving = true;
  player.jump = 0.001;
  lastMoveAtS = nowS;

  // Rotate player to face movement direction (model front is local +Z)
  if (dir === 'up')    player.targetRotY =  Math.PI;
  if (dir === 'down')  player.targetRotY =  0;
  if (dir === 'left')  player.targetRotY = -Math.PI / 2;
  if (dir === 'right') player.targetRotY =  Math.PI / 2;

  if (player.targetZ < bestForward) {
    bestForward = player.targetZ;
    score += 1;
    hudScore.textContent = score;
    blip(650, 0.04, 0.02);
    haptic('light');
  }
}

function laneAt(z) {
  let closest = null;
  let min = Infinity;
  for (const l of lanes) {
    const d = Math.abs(l.z - z);
    if (d < min) { min = d; closest = l; }
  }
  // Full-tile movement allows a wider snap window without edge misclassification.
  return min < laneDepth * 0.56 ? closest : null;
}

function hitsGrassObstacle(x, z) {
  const lane = laneAt(z);
  if (!lane || lane.type !== 'grass' || !lane.obstacles.length) return false;
  for (const obstacle of lane.obstacles) {
    if (
      Math.abs(obstacle.x - x) <= obstacle.halfX + PLAYER_HITBOX.halfX
      && Math.abs(obstacle.z - z) <= obstacle.halfZ + PLAYER_HITBOX.halfZ
    ) {
      return true;
    }
  }
  return false;
}

function findSupportingLog(x, z) {
  for (const m of movers) {
    if (!m.isLog) continue;
    // Use player hitbox overlap instead of center-point test to avoid false river deaths.
    const xAllowance = Math.max(0.18, m.halfX - LOG_SUPPORT_EDGE_PAD_X) + PLAYER_HITBOX.halfX + LOG_SUPPORT_EXTRA_X;
    const zAllowance = Math.max(0.1, m.halfZ - LOG_SUPPORT_EDGE_PAD_Z) + PLAYER_HITBOX.halfZ + LOG_SUPPORT_EXTRA_Z;
    if (Math.abs(m.mesh.position.x - x) <= xAllowance && Math.abs(m.mesh.position.z - z) <= zAllowance) {
      return m;
    }
  }
  return null;
}

function checkDeath() {
  // Returns 'river', 'car', or null
  // Use actual on-screen position for reliable mover collisions.
  const px = player.group.position.x;
  const pz = player.group.position.z;

  // Skip river death while mid-jump — player hasn't landed yet.
  // Use target position for log support so landing on a log is detected reliably.
  if (player.jump <= 0) {
    const lane = laneAt(pz);
    if (lane?.type === 'river') {
      if (!findSupportingLog(player.targetX, player.targetZ) && player.riverSupportGraceS <= 0) return 'river';
    }
  }

  for (const m of movers) {
    if (m.isLog) continue;
    const dz = Math.abs(m.mesh.position.z - pz);
    if (dz > m.halfZ + PLAYER_HITBOX.halfZ) continue;
    const dx = Math.abs(m.mesh.position.x - px);
    if (dx <= m.halfX + PLAYER_HITBOX.halfX) return 'car';
  }

  return null;
}

function showGameOverScreen() {
  if (!dead) return; // guard: if player retried before animation finished, abort

  // Make sure UI is visible
  document.getElementById('ui').style.display = 'block';
  gameover.style.display = 'flex';

  // Build letter-by-letter GAME OVER title
  const titleEl = document.getElementById('goTitle');
  titleEl.innerHTML = '';
  const words = ['GAME', 'OVER'];
  const cls = ['go-letter-game', 'go-letter-over'];
  let delay = 0;
  words.forEach((word, wi) => {
    const row = document.createElement('div');
    row.className = 'go-title-row';
    for (const ch of word) {
      const span = document.createElement('span');
      span.className = `go-letter ${cls[wi]}`;
      span.textContent = ch;
      span.style.animationDelay = `${delay.toFixed(2)}s`;
      row.appendChild(span);
      delay += 0.09;
    }
    titleEl.appendChild(row);
  });

  const totalMs = delay * 1000 + 180;

  setTimeout(() => {
    if (typeof window.submitScore === 'function') window.submitScore(score);
    final.textContent = score;
    document.getElementById('goScoreWrap').classList.add('show');
  }, totalMs);

  setTimeout(() => {
    document.getElementById('retryBtn').classList.add('show');
  }, totalMs + 450);
}

// Called for eagle kill (instant, no body animation needed)
function killPlayer() {
  if (dead) return;
  dead = true;
  active = false;
  deathAnim.done = true;
  playDeathSfx();
  haptic('error');
  showGameOverScreen();
}

function update(dt) {
  elapsedGameTime += dt;
  // Clouds drift
  for (const d of decor) {
    if (!(d instanceof THREE.Group)) continue;
    d.position.x += d.userData.speed * dt;
    if (d.position.x > 58) d.position.x = -58;
  }

  if (MAT.riverA.map && MAT.riverB.map) {
    MAT.riverA.map.offset.x = (MAT.riverA.map.offset.x + dt * 0.5) % 1;
    MAT.riverB.map.offset.x = (MAT.riverB.map.offset.x + dt * 0.44) % 1;
  }

  // Demo mode: camera auto-scrolls forward while menu is showing
  if (!active && !dead) demoZ -= dt * 3.8;

  // Traffic spawning + movement (runs in both demo and active modes)
  for (const lane of lanes) {
    if (!lane.channels?.length) continue;
    for (const channel of lane.channels) {
      channel.cooldown -= dt;
      if (channel.kind === 'train') {
        updateTrainChannel(lane, channel, dt);
        continue;
      }
      if (channel.cooldown > 0) continue;
      trySpawnInChannel(lane, channel, true);
    }
  }

  for (let i = movers.length - 1; i >= 0; i--) {
    const m = movers[i];
    animateMover(m, dt);
    if (Math.abs(m.mesh.position.x) > trafficDespawnX) {
      releaseMover(m);
      movers.splice(i, 1);
    }
  }

  // Player logic — only when game is active
  if (active) {
    player.riverSupportGraceS = Math.max(0, player.riverSupportGraceS - dt);
    if (player.moving) {
      player.moveTime = Math.min(player.moveTime + dt, player.moveDuration);
      const t = THREE.MathUtils.clamp(player.moveTime / Math.max(player.moveDuration, 0.001), 0, 1);
      const eased = t * t * (3 - 2 * t);
      player.group.position.x = THREE.MathUtils.lerp(player.moveFromX, player.moveToX, eased);
      player.group.position.z = THREE.MathUtils.lerp(player.moveFromZ, player.moveToZ, eased);
      if (t >= 1) {
        player.moving = false;
        player.group.position.x = player.moveToX;
        player.group.position.z = player.moveToZ;
      }
    } else {
      player.group.position.x = player.targetX;
      player.group.position.z = player.targetZ;
    }

    let groundY = 0.12;
    // Use target position for log detection so jumping onto a river lane works reliably
    const targetLane = laneAt(player.targetZ);
    const visualLane = laneAt(player.group.position.z);
    const riverLane = (targetLane?.type === 'river' ? targetLane : null)
                   || (visualLane?.type === 'river' ? visualLane : null);
    if (riverLane) {
      const log = findSupportingLog(player.targetX, player.targetZ)
               || findSupportingLog(player.group.position.x, player.group.position.z);
      if (log) {
        player.riverSupportGraceS = RIVER_SUPPORT_GRACE_S;
        const drift = log.speed * dt;
        player.targetX += drift;
        player.group.position.x += drift;
        player.moveFromX += drift;
        player.moveToX += drift;
        const rideHalfX = Math.max(0.16, log.halfX - PLAYER_HITBOX.halfX * 0.2);
        const left = log.mesh.position.x - rideHalfX;
        const right = log.mesh.position.x + rideHalfX;
        player.targetX = THREE.MathUtils.clamp(player.targetX, left, right);
        player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, left, right);
        player.moveFromX = THREE.MathUtils.clamp(player.moveFromX, left, right);
        player.moveToX = THREE.MathUtils.clamp(player.moveToX, left, right);
        groundY = Math.max(0.12, log.mesh.position.y + LOG_RIDE_Y_OFFSET);
      }
    }

    player.targetX = clampPlayerX(player.targetX);
    player.group.position.x = clampPlayerX(player.group.position.x);
    player.moveFromX = clampPlayerX(player.moveFromX);
    player.moveToX = clampPlayerX(player.moveToX);

    if (player.jump > 0) {
      player.jump += dt * 3.8;
      const t = Math.min(player.jump, 1);
      player.group.position.y = groundY + Math.sin(t * Math.PI) * 0.62;
      const sq = 1 + Math.sin(t * Math.PI) * 0.18;
      player.group.scale.set(1 / sq, sq, 1 / sq);
      if (player.jump >= 1) {
        player.jump = 0;
        player.group.position.y = groundY;
        player.group.scale.set(1, 1, 1);
      }
    } else {
      player.group.position.y += (groundY - player.group.position.y) * Math.min(1, dt * 18);
    }

    let rotDiff = player.targetRotY - player.group.rotation.y;
    rotDiff = ((rotDiff % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    player.group.rotation.y += rotDiff * Math.min(dt * 12, 1);

    const deathType = eagle.active ? null : checkDeath();
    if (deathType) {
      dead = true;
      active = false;
      deathAnim.type = deathType;
      deathAnim.time = 0;
      deathAnim.done = false;
      player.moving = false;
      player.group.position.x = player.targetX;
      player.group.position.z = player.targetZ;
      player.group.position.y = 0.12;
      player.jump = 0;
      player.group.scale.set(1, 1, 1);
      playDeathSfx();
      haptic('error');
    }

    // ── Eagle ──
    const blocksBack = (player.targetZ - bestForward) / laneDepth;
    if (!eagle.active && blocksBack >= 3 && !dead) {
      eagle.active = true;
      eagle.phase = 1;
      eagle.time = 0;
      eagle.mesh.visible = true;
      player.moving = false;
      player.group.position.x = player.targetX;
      player.group.position.z = player.targetZ;
      player.group.position.y = 0.12;
      player.jump = 0;
      eagle.startPos.set(player.targetX + 40, 28, player.targetZ + 50);
      eagle.grabPos.set(player.targetX, 2.7, player.targetZ);
      eagle.carryPos.set(player.targetX - 30, 40, player.targetZ - 45);
      eagle.mesh.position.copy(eagle.startPos);
      blip(280, 0.35, 0.05, 'sawtooth');
    }

    if (eagle.active && eagle.phase === 1) {
      eagle.time += dt * 0.9;
      const t = Math.min(eagle.time, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      eagle.mesh.position.lerpVectors(eagle.startPos, eagle.grabPos, ease);
      eagle.mesh.position.y += Math.sin(t * Math.PI) * 8;
      const wingFlap = Math.sin(eagle.time * Math.PI * 6) * 0.3;
      eagle.mesh.children[6].rotation.z = 0.15 + wingFlap;
      eagle.mesh.children[7].rotation.z = -0.15 - wingFlap;
      eagle.mesh.lookAt(eagle.grabPos.x, eagle.grabPos.y, eagle.grabPos.z);
      if (t > 0.7) {
        const clench = (t - 0.7) / 0.3;
        [12, 13, 14, 15].forEach(i => {
          if (eagle.mesh.children[i]) eagle.mesh.children[i].rotation.x = 0.4 + clench * 0.8;
        });
      }
      if (t >= 1) { eagle.phase = 2; eagle.time = 0; blip(180, 0.25, 0.06, 'sawtooth'); }
    }

    if (eagle.active && eagle.phase === 2) {
      eagle.time += dt * 0.7;
      const t = Math.min(eagle.time, 1);
      eagle.mesh.position.lerpVectors(eagle.grabPos, eagle.carryPos, t * t);
      const wingFlap = Math.sin(eagle.time * Math.PI * 5) * 0.3;
      eagle.mesh.children[6].rotation.z = 0.15 + wingFlap;
      eagle.mesh.children[7].rotation.z = -0.15 - wingFlap;
      eagle.mesh.lookAt(eagle.carryPos.x, eagle.carryPos.y, eagle.carryPos.z);
      player.group.position.set(eagle.mesh.position.x, eagle.mesh.position.y - 2.72, eagle.mesh.position.z);
      player.group.rotation.x = Math.sin(eagle.time * Math.PI * 3) * 0.15;
      player.group.rotation.z = Math.sin(eagle.time * Math.PI * 2.3) * 0.1;
      if (t >= 1) {
        eagle.active = false; eagle.phase = 0; eagle.mesh.visible = false;
        player.group.visible = false;
        if (!dead) {
          dead = true;
          active = false;
          deathAnim.done = true;
          playDeathSfx();
          haptic('error');
          showGameOverScreen();
        }
      }
    }
  } // end active

  // Death animations (run after active block so active=false doesn't skip them)
  if (dead && !deathAnim.done) {
    deathAnim.time += dt;

    if (deathAnim.type === 'river') {
      const SINK_DUR = 0.85;
      const t = Math.min(deathAnim.time / SINK_DUR, 1);
      player.group.position.y = 0.12 - t * 2.2;
      const s = Math.max(1 - t * 0.7, 0.04);
      player.group.scale.set(s, s, s);
      if (deathAnim.time < 0.25) {
        player.group.rotation.z = Math.sin(deathAnim.time * 28) * 0.18;
      } else {
        player.group.rotation.z = 0;
      }
      if (deathAnim.time >= SINK_DUR) {
        deathAnim.done = true;
        player.group.visible = false;
        showGameOverScreen();
      }

    } else if (deathAnim.type === 'car') {
      const SQUASH_DUR = 0.38;
      const HOLD_DUR  = 0.75; // hold squashed then show game over
      // Squash phase
      if (deathAnim.time <= SQUASH_DUR) {
        const t = deathAnim.time / SQUASH_DUR;
        const scaleY  = Math.max(1 - t * 0.95, 0.04);
        const scaleXZ = 1 + t * 1.5;
        player.group.scale.set(scaleXZ, scaleY, scaleXZ);
        if (deathAnim.time < 0.16) {
          player.group.position.x = player.targetX + Math.sin(deathAnim.time * 90) * 0.07;
        } else {
          player.group.position.x = player.targetX;
        }
      }
      // After squash: character stays flat — no scale changes
      if (deathAnim.time >= HOLD_DUR) {
        deathAnim.done = true;
        showGameOverScreen();
      }
    }
  }

  // Camera — follows player when active, stays on player when dead, demoZ in menu
  const refZ = active ? player.targetZ : demoZ;
  if (active) {
    camSmoothZ += (player.targetZ - camSmoothZ) * (1 - Math.exp(-dt * 6));
  } else if (!dead) {
    camSmoothZ = demoZ;
  }
  // when dead: camSmoothZ keeps its last value — camera stays on player
  const followZ = camSmoothZ - cameraRig.lookAhead;
  camera.position.set(cameraRig.diagX, cameraRig.height, followZ + cameraRig.diagZ);
  camera.lookAt(0, 0, followZ);
  sun.position.set(34, 44, followZ + 16);
  sun.target.position.set(0, 0, followZ);
  sun.target.updateMatrixWorld();

  // Lane management based on refZ
  let worldChanged = false;
  while (lanes.length && lanes[lanes.length - 1].z > refZ - 16 * laneDepth) {
    const nextIndex = lanes[lanes.length - 1].idx - 1;
    addLane(lanes[lanes.length - 1].z - laneDepth, nextIndex);
    worldChanged = true;
  }
  while (lanes.length && lanes[0].z > refZ + 8 * laneDepth) {
    const old = lanes.shift();
    releaseLane(old);
    for (let i = movers.length - 1; i >= 0; i--) {
      if (movers[i].lane === old) { releaseMover(movers[i]); movers.splice(i, 1); }
    }
    worldChanged = true;
  }
  if (worldChanged) requestShadowRefresh();
}

document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'w', 'W'].includes(e.key)) movePlayer('up');
  if (['ArrowDown', 's', 'S'].includes(e.key)) movePlayer('down');
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movePlayer('left');
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movePlayer('right');
});

const dragControl = {
  active: false,
  pointerId: null,
  x: 0,
  y: 0,
  moved: false,
  threshold: window.matchMedia('(pointer:coarse)').matches ? 28 : 22,
};

function moveByDragDelta(dx, dy) {
  if (Math.abs(dx) < dragControl.threshold && Math.abs(dy) < dragControl.threshold) return false;
  if (Math.abs(dx) > Math.abs(dy)) movePlayer(dx > 0 ? 'right' : 'left');
  else movePlayer(dy > 0 ? 'down' : 'up');
  return true;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!active || dead || eagle.active) return;
  const canUsePointerMove = e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'mouse';
  if (!canUsePointerMove) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  dragControl.active = true;
  dragControl.pointerId = e.pointerId;
  dragControl.x = e.clientX;
  dragControl.y = e.clientY;
  dragControl.moved = false;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragControl.active || e.pointerId !== dragControl.pointerId) return;
  if (dragControl.moved) return;
  const dx = e.clientX - dragControl.x;
  const dy = e.clientY - dragControl.y;
  if (moveByDragDelta(dx, dy)) {
    dragControl.moved = true;
  }
});

function endDrag(e) {
  if (!dragControl.active || e.pointerId !== dragControl.pointerId) return;
  if (!dragControl.moved) {
    const dx = e.clientX - dragControl.x;
    const dy = e.clientY - dragControl.y;
    const dragged = moveByDragDelta(dx, dy);
    if (!dragged && Math.hypot(dx, dy) <= dragControl.threshold * 0.7) {
      movePlayer('up');
    }
  }
  dragControl.active = false;
  dragControl.pointerId = null;
  dragControl.moved = false;
  if (renderer.domElement.hasPointerCapture(e.pointerId)) {
    renderer.domElement.releasePointerCapture(e.pointerId);
  }
}

renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

characterBtn?.addEventListener('click', () => {
  openCharacterMenu();
  haptic('light');
});

characterCloseBtn?.addEventListener('click', () => {
  closeCharacterMenu();
  haptic('light');
});

characterApplyBtn?.addEventListener('click', () => {
  closeCharacterMenu();
  haptic('success');
});

characterMenu?.addEventListener('click', (e) => {
  if (e.target !== characterMenu) return;
  closeCharacterMenu();
});

for (const card of characterCards) {
  card.addEventListener('click', () => {
    const id = normalizeCharacterId(card.dataset.animal || 'rabbit');
    setCharacter(id);
    syncCharacterUi();
    haptic('light');
  });
}

document.getElementById('startBtn').addEventListener('click', () => {
  closeCharacterMenu();
  resetWorld(); // resets world + makes selected character visible
  menu.style.transition = 'opacity .35s ease';
  menu.style.opacity = '0';
  menu.style.pointerEvents = 'none';
  document.getElementById('ui').style.display = 'block';
  setTimeout(() => { menu.style.display = 'none'; }, 380);
  active = true;
  dead = false;
  bgMusic.start();
  haptic('success');
});

document.getElementById('retryBtn').addEventListener('click', () => {
  resetWorld(); // resets gameover UI, dead, deathAnim
  document.getElementById('ui').style.display = 'block';
  active = true;
  bgMusic.start();
  haptic('success');
});

// ── Settings modal ──
const settingsModal = document.getElementById('settingsModal');

function updateToggleUI() {
  const tm = document.getElementById('toggleMusic');
  const tf = document.getElementById('toggleFX');
  const th = document.getElementById('toggleHaptics');
  tm.className = 'toggle-btn ' + (settings.music   ? 'on' : 'off');
  tm.textContent = settings.music   ? 'ON' : 'OFF';
  tf.className = 'toggle-btn ' + (settings.fx      ? 'on' : 'off');
  tf.textContent = settings.fx      ? 'ON' : 'OFF';
  th.className = 'toggle-btn ' + (settings.haptics ? 'on' : 'off');
  th.textContent = settings.haptics ? 'ON' : 'OFF';
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  updateToggleUI();
  settingsModal.classList.add('open');
  haptic('light');
});

document.getElementById('closeSettings').addEventListener('click', () => {
  settingsModal.classList.remove('open');
  haptic('light');
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('open');
});

document.getElementById('toggleMusic').addEventListener('click', () => {
  settings.music = !settings.music;
  saveSettings();
  if (settings.music) bgMusic.start(); else bgMusic.stop();
  updateToggleUI();
  haptic('light');
});

document.getElementById('toggleFX').addEventListener('click', () => {
  settings.fx = !settings.fx;
  saveSettings();
  updateToggleUI();
});

document.getElementById('toggleHaptics').addEventListener('click', () => {
  settings.haptics = !settings.haptics;
  saveSettings();
  updateToggleUI();
  haptic('light');
});

function applyViewport() {
  refreshCameraRig();
  dragControl.threshold = window.matchMedia('(pointer:coarse)').matches ? 28 : 22;
  renderer.setSize(innerWidth, innerHeight);
  refreshCharacterPreviewSizes();
  requestShadowRefresh();
}

addEventListener('resize', applyViewport);

function blip(freq = 440, dur = 0.06, vol = 0.02, type = 'triangle') {
  if (!settings.fx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = blip.ctx || (blip.ctx = new AC());
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function playDeathSfx() {
  if (!settings.fx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = blip.ctx || (blip.ctx = new AC());
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.0001, t);
  mainGain.gain.exponentialRampToValueAtTime(0.11, t + 0.018);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  mainGain.connect(ctx.destination);

  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(320, t);
  tone.frequency.exponentialRampToValueAtTime(70, t + 0.34);
  tone.connect(mainGain);
  tone.start(t);
  tone.stop(t + 0.38);

  const hit = ctx.createOscillator();
  const hitGain = ctx.createGain();
  hit.type = 'triangle';
  hit.frequency.setValueAtTime(140, t);
  hit.frequency.exponentialRampToValueAtTime(48, t + 0.2);
  hitGain.gain.setValueAtTime(0.0001, t);
  hitGain.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
  hitGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  hit.connect(hitGain).connect(mainGain);
  hit.start(t);
  hit.stop(t + 0.22);
}

function renderGameToText() {
  const playerZ = player.group.position.z;
  const nearbyLanes = lanes
    .filter(l => Math.abs(l.z - playerZ) <= laneDepth * 4)
    .sort((a, b) => a.z - b.z)
    .map(l => ({
      z: Number(l.z.toFixed(2)),
      type: l.type,
      hazard: l.hazard,
      channels: l.channels.map(channel => ({
        kind: channel.kind,
        z: Number(channel.z.toFixed(2)),
        speed: Number(channel.speed.toFixed(2)),
        warning_active: channel.kind === 'train' ? channel.warningActive : undefined,
        warning_timer: channel.kind === 'train' ? Number(channel.warningTimer.toFixed(2)) : undefined,
        train_speed_multiplier: channel.kind === 'train' ? Number(channel.trainSpeedMultiplier.toFixed(2)) : undefined,
        train_period_s: channel.kind === 'train' ? Number(channel.cooldownRange[0].toFixed(2)) : undefined,
      })),
    }));

  const nearbyMovers = movers
    .filter(m => Math.abs(m.mesh.position.z - playerZ) <= laneDepth * 3)
    .map(m => ({
      type: m.kind,
      x: Number(m.mesh.position.x.toFixed(2)),
      y: Number(m.mesh.position.y.toFixed(2)),
      z: Number(m.mesh.position.z.toFixed(2)),
      speed: Number(m.speed.toFixed(2)),
      half_x: Number(m.halfX.toFixed(2)),
      half_z: Number(m.halfZ.toFixed(2)),
    }));

  const nearbyObstacles = lanes
    .filter(l => l.type === 'grass' && Math.abs(l.z - playerZ) <= laneDepth * 3)
    .flatMap(l => l.obstacles.map(o => ({
      type: o.kind,
      x: Number(o.x.toFixed(2)),
      z: Number(o.z.toFixed(2)),
      half_x: Number(o.halfX.toFixed(2)),
      half_z: Number(o.halfZ.toFixed(2)),
    })));

  const trainChannels = lanes
    .flatMap(l => l.channels
      .filter(channel => channel.kind === 'train')
      .map(channel => ({
        lane_z: Number(l.z.toFixed(2)),
        z: Number(channel.z.toFixed(2)),
        speed: Number(channel.speed.toFixed(2)),
        warning_active: channel.warningActive,
        warning_timer: Number(channel.warningTimer.toFixed(2)),
        cooldown: Number(channel.cooldown.toFixed(2)),
        train_speed_multiplier: Number(channel.trainSpeedMultiplier.toFixed(2)),
      })))
    .sort((a, b) => Math.abs(a.z - playerZ) - Math.abs(b.z - playerZ))
    .slice(0, 3);

  return JSON.stringify({
    mode: dead ? 'gameover' : active ? 'playing' : 'menu',
    character: player.id,
    coordinate_system: 'origin at spawn; x positive right, y positive up, z negative is forward',
    lane_width: laneWidth,
    lane_depth: laneDepth,
    forward_step: forwardStep,
    player_hitbox: PLAYER_HITBOX,
    score,
    player: {
      x: Number(player.group.position.x.toFixed(2)),
      y: Number(player.group.position.y.toFixed(2)),
      z: Number(player.group.position.z.toFixed(2)),
    },
    lane_here: laneAt(playerZ)?.type ?? null,
    hazard_here: laneAt(playerZ)?.hazard ?? null,
    pool_stats: {
      cached_meshes: countPooledObjects(pooledMeshes),
      cached_groups: countPooledObjects(pooledGroups),
      cached_warning_materials: pooledTrainWarningMaterials.length,
    },
    nearby_lanes: nearbyLanes,
    train_channels: trainChannels,
    movers: nearbyMovers,
    obstacles: nearbyObstacles,
  });
}

window.render_game_to_text = renderGameToText;

window.advanceTime = (ms = 1000 / 60) => {
  const stepMs = PERFORMANCE.fixedStep * 1000;
  let remaining = Math.max(stepMs, ms);
  while (remaining > 0) {
    update(PERFORMANCE.fixedStep);
    remaining -= stepMs;
  }
  renderer.render(scene, camera);
  if (shouldRenderCharacterPreviews()) renderCharacterPreviews(Math.max(ms / 1000, stepMs / 1000));
};

let last = performance.now();
let accumulator = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, PERFORMANCE.maxFrameDelta);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= PERFORMANCE.fixedStep && steps < PERFORMANCE.maxSubSteps) {
    update(PERFORMANCE.fixedStep);
    accumulator -= PERFORMANCE.fixedStep;
    steps += 1;
  }
  if (steps === PERFORMANCE.maxSubSteps) accumulator = 0;
  renderer.render(scene, camera);
  if (shouldRenderCharacterPreviews()) {
    renderCharacterPreviews(Math.max(dt, Math.max(steps, 1) * PERFORMANCE.fixedStep));
  }
  requestAnimationFrame(loop);
}

await preloadDevilsworkshopVehicleAssets();

applyViewport();
resetWorld();
player.group.visible = false; // hidden during menu demo
requestAnimationFrame(loop);
