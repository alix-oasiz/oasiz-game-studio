import * as THREE from './lib/three.module.js';

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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.touchAction = 'none';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x72a276, 1.08);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dc, 1.45);
sun.position.set(34, 44, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xaed6ff, 0.34);
rim.position.set(-28, 20, -52);
scene.add(rim);


const laneDepth = 4.4;
const laneWidth = 60;
const xStep = 1.8;
const forwardStep = laneDepth / 2; // ileri/geri atlama adımı (lane genişliğinin yarısı)
const sideLimit = 16.2; // 2x wider playable map
const trafficSpawnX = laneWidth * 0.5 + 1.4;
const trafficDespawnX = laneWidth * 0.5 + 2.8;

const cameraRig = {
  height: 16,
  diagX: 16,       // fixed X offset (never changes)
  diagZ: 16,       // fixed Z offset from look target
  lookAhead: 4,
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
const MOVE_INPUT_COOLDOWN_S = 0.2;
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
  const audio = new Audio('./bgMusic.mp3');
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
      }
    }
  } else if (type === 'road') {
    ctx.fillStyle = '#262b33';
    ctx.fillRect(0, 0, 144, 24);
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = (col + (shifted ? 1 : 0)) % 2 === 0 ? '#323841' : '#2b313a';
      ctx.fillRect(col * 12, 0, 12, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(col * 12, 0, 1, 24);
    }
    ctx.fillStyle = '#e6edf6';
    ctx.fillRect(0, 1, 144, 2);
    ctx.fillRect(0, 21, 144, 2);
    ctx.fillStyle = '#f4f9ff';
    for (let x = shifted ? 7 : 1; x < 144; x += 18) {
      ctx.fillRect(x, 11, 10, 2);
    }
    ctx.fillStyle = '#ffd85a';
    for (let x = shifted ? 2 : 11; x < 144; x += 22) {
      ctx.fillRect(x, 11, 7, 2);
    }
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
      }
    }
    ctx.fillStyle = '#6a4d31';
    for (let x = shifted ? 6 : 1; x < 144; x += 20) {
      ctx.fillRect(x, 10, 10, 3);
    }
  } else if (type === 'rail') {
    ctx.fillStyle = '#65686d';
    ctx.fillRect(0, 0, 144, 24);
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = (col + (shifted ? 1 : 0)) % 2 === 0 ? '#6f7378' : '#585b61';
      ctx.fillRect(col * 12, 0, 12, 24);
    }
    ctx.fillStyle = '#7b5a38';
    for (let x = shifted ? 4 : 0; x < 144; x += 12) {
      ctx.fillRect(x, 5, 3, 14);
    }
    ctx.fillStyle = '#cdd4de';
    ctx.fillRect(0, 7, 144, 2);
    ctx.fillRect(0, 15, 144, 2);
  } else {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 12; col++) {
        const wave = (row + col + (shifted ? 1 : 0)) % 2 === 0;
        ctx.fillStyle = wave ? '#50b5ed' : '#3c9eda';
        ctx.fillRect(col * 12, row * 12, 12, 12);
        if ((col + row + (shifted ? 1 : 0)) % 3 === 0) {
          ctx.fillStyle = '#74caf4';
          ctx.fillRect(col * 12 + 2, row * 12 + 4, 6, 3);
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
  texture.needsUpdate = true;
  return texture;
}

const MAT = {
  grassA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('grass', false), roughness: 1 }),
  grassB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('grass', true), roughness: 1 }),
  roadA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('road', false), roughness: 0.92 }),
  roadB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('road', true), roughness: 0.92 }),
  mudA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('mud', false), roughness: 0.96 }),
  mudB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('mud', true), roughness: 0.96 }),
  railA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('rail', false), roughness: 0.9 }),
  railB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('rail', true), roughness: 0.9 }),
  riverA: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('river', false), roughness: 0.42, metalness: 0.08, emissive: 0x083d54, emissiveIntensity: 0.08 }),
  riverB: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLaneTexture('river', true), roughness: 0.42, metalness: 0.08, emissive: 0x083d54, emissiveIntensity: 0.08 }),
  grassEdge: new THREE.MeshStandardMaterial({ color: 0x3f8f3b, roughness: 1 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xe3ebf4, roughness: 0.86 }),
  bank: new THREE.MeshStandardMaterial({ color: 0x9a7a48, roughness: 1 }),
  railMetal: new THREE.MeshStandardMaterial({ color: 0xd6dde8, roughness: 0.45, metalness: 0.42 }),
  railSleeper: new THREE.MeshStandardMaterial({ color: 0x6f4f30, roughness: 0.95 }),
  mudPuddle: new THREE.MeshStandardMaterial({ color: 0x6d5438, roughness: 0.68 }),
  roadStripe: new THREE.MeshStandardMaterial({ color: 0xffd64f, roughness: 0.82 }),
  roadLine: new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.86 }),
  foam: new THREE.MeshStandardMaterial({ color: 0xdbf4ff, roughness: 0.65 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x8f6038, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4daa4a, roughness: 1 }),
  leafDark: new THREE.MeshStandardMaterial({ color: 0x3f943f, roughness: 1 }),
  bush: new THREE.MeshStandardMaterial({ color: 0x5ab55a, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xc8d3df, roughness: 0.82 }),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x9fcbf8, roughness: 0.26, metalness: 0.3 }),
  carWheel: new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.92 }),
  carHeadlight: new THREE.MeshStandardMaterial({ color: 0xfff6c3, emissive: 0xffefac, emissiveIntensity: 0.45 }),
  carTaillight: new THREE.MeshStandardMaterial({ color: 0xff5f63, emissive: 0xff4d4d, emissiveIntensity: 0.35 }),
};

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
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return { id, group, jump: 0, targetRotY: Math.PI, targetX: 0, targetZ: 0 };
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

    const previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
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
  channel.cooldown = randomRange(channel.cooldownRange[0], channel.cooldownRange[1]) / diff;
}

function makeLaneChannel(z, speed, kind, max, cooldownRange, spawnGap) {
  const channel = { z, speed, kind, max, cooldown: 0, cooldownRange, spawnGap };
  resetChannelCooldown(channel);
  return channel;
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

  const off = laneDepth * 0.25;
  if (lane.hazard === 'cars') {
    lane.channels.push(
      makeLaneChannel(z - off, (0.95 + Math.random() * 0.9) * speedScale, 'car', 2, [2.0, 3.1], 3.2),
      makeLaneChannel(z + off, -(0.95 + Math.random() * 0.9) * speedScale, 'car', 2, [2.0, 3.1], 3.2)
    );
  } else if (lane.hazard === 'bikes') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (2.0 + Math.random() * 1.1) * speedScale, 'bike', 3, [1.0, 1.75], 2.0));
  } else if (lane.hazard === 'logs') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    lane.channels.push(makeLaneChannel(z, dir * (0.85 + Math.random() * 0.65) * speedScale, 'log', 4, [0.9, 1.45], 2.6));
  } else if (lane.hazard === 'trucks') {
    lane.channels.push(
      makeLaneChannel(z - off, (0.85 + Math.random() * 0.6) * speedScale, 'truck', 2, [2.6, 4.0], 4.8),
      makeLaneChannel(z + off, -(0.85 + Math.random() * 0.6) * speedScale, 'truck', 2, [2.6, 4.0], 4.8)
    );
  } else if (lane.hazard === 'trains') {
    const dir = Math.random() > 0.5 ? 1 : -1;
    const trainScale = 0.85 + Math.min((diff - 1) * 0.35, 0.55);
    lane.channels.push(makeLaneChannel(z, dir * (3.5 + Math.random() * 1.0) * trainScale, 'train', 1, [5.4, 7.4], 9.2));
  } else if (lane.hazard === 'barrels') {
    lane.channels.push(
      makeLaneChannel(z - off, (1.2 + Math.random() * 0.7) * speedScale, 'barrel', 2, [1.3, 2.0], 2.8),
      makeLaneChannel(z + off, -(1.2 + Math.random() * 0.7) * speedScale, 'barrel', 2, [1.3, 2.0], 2.8)
    );
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
  const laneMesh = new THREE.Mesh(new THREE.BoxGeometry(laneWidth, 0.24, laneDepth), mat);
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
  const edgeL = new THREE.Mesh(new THREE.BoxGeometry(shoulderW, shoulderH, laneDepth), shoulderMat);
  const edgeR = edgeL.clone();
  edgeL.position.set(-laneWidth * 0.5 - shoulderW * 0.5, shoulderH * 0.5 - 0.03, z);
  edgeR.position.set(laneWidth * 0.5 + shoulderW * 0.5, shoulderH * 0.5 - 0.03, z);
  edgeL.receiveShadow = edgeR.receiveShadow = true;
  scene.add(edgeL, edgeR);
  lane.decorMeshes.push(edgeL, edgeR);

  if (lane.type === 'road') {
    const sideA = new THREE.Mesh(new THREE.BoxGeometry(laneWidth - 0.35, 0.02, 0.1), MAT.roadLine);
    const sideB = sideA.clone();
    sideA.position.set(0, 0.14, z - laneDepth * 0.37);
    sideB.position.set(0, 0.14, z + laneDepth * 0.37);
    scene.add(sideA, sideB);
    lane.decorMeshes.push(sideA, sideB);

    for (let x = -laneWidth * 0.44; x <= laneWidth * 0.44; x += 2.15) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.03, 0.1), MAT.roadStripe);
      mark.position.set(x, 0.141, z);
      mark.receiveShadow = true;
      scene.add(mark);
      lane.decorMeshes.push(mark);
    }

    const divider = new THREE.Mesh(new THREE.BoxGeometry(laneWidth - 0.5, 0.025, 0.1), MAT.roadStripe);
    divider.position.set(0, 0.142, z);
    scene.add(divider);
    lane.decorMeshes.push(divider);

    for (const channel of lane.channels) {
      const hint = new THREE.Mesh(new THREE.BoxGeometry(laneWidth - 0.9, 0.018, 0.06), MAT.roadLine);
      hint.position.set(0, 0.14, channel.z);
      scene.add(hint);
      lane.decorMeshes.push(hint);
    }
  } else if (lane.type === 'river') {
    const foamL = new THREE.Mesh(new THREE.BoxGeometry(laneWidth, 0.02, 0.08), MAT.foam);
    const foamR = foamL.clone();
    foamL.position.set(0, 0.14, z - laneDepth * 0.45);
    foamR.position.set(0, 0.14, z + laneDepth * 0.45);
    scene.add(foamL, foamR);
    lane.decorMeshes.push(foamL, foamR);
  } else if (lane.type === 'rail') {
    const railA = new THREE.Mesh(new THREE.BoxGeometry(laneWidth - 0.45, 0.08, 0.09), MAT.railMetal);
    const railB = railA.clone();
    railA.position.set(0, 0.17, z - laneDepth * 0.18);
    railB.position.set(0, 0.17, z + laneDepth * 0.18);
    scene.add(railA, railB);
    lane.decorMeshes.push(railA, railB);
    for (let x = -laneWidth * 0.45; x <= laneWidth * 0.45; x += 1.3) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, laneDepth * 0.72), MAT.railSleeper);
      sleeper.position.set(x, 0.135, z);
      sleeper.receiveShadow = true;
      scene.add(sleeper);
      lane.decorMeshes.push(sleeper);
    }
  } else if (lane.type === 'mud') {
    for (let x = -laneWidth * 0.42; x <= laneWidth * 0.42; x += 3.1) {
      if (Math.random() < 0.75) {
        const puddle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.42), MAT.mudPuddle);
        puddle.position.set(x + randomRange(-0.3, 0.3), 0.135, z + randomRange(-0.7, 0.7));
        scene.add(puddle);
        lane.decorMeshes.push(puddle);
      }
    }
  }

  if (lane.type === 'grass') {
    if (lane.hazard === 'open') spawnOpenGrassDecor(lane);
    else spawnGrassDecor(lane);
  }

  lanes.push(lane);
}

function spawnTree(lane, x, z, isObstacle) {
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), MAT.trunk);
  const leafBase = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.56, 0.86), MAT.leaf);
  const leafTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.58), MAT.leafDark);
  trunk.position.set(x, 0.26, z);
  leafBase.position.set(x, 0.72, z);
  leafTop.position.set(x, 1.14, z);
  trunk.castShadow = leafBase.castShadow = leafTop.castShadow = true;
  trunk.receiveShadow = leafBase.receiveShadow = leafTop.receiveShadow = true;
  scene.add(trunk, leafBase, leafTop);
  lane.decorMeshes.push(trunk, leafBase, leafTop);
  if (isObstacle) lane.obstacles.push({ x, z, halfX: 0.48, halfZ: 0.48, kind: 'tree' });
}

function spawnRock(lane, x, z, isObstacle) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.62), MAT.stone);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.42), MAT.stone);
  base.position.set(x, 0.16, z);
  top.position.set(x + randomRange(-0.06, 0.06), 0.41, z + randomRange(-0.05, 0.05));
  base.castShadow = top.castShadow = true;
  base.receiveShadow = top.receiveShadow = true;
  scene.add(base, top);
  lane.decorMeshes.push(base, top);
  if (isObstacle) lane.obstacles.push({ x, z, halfX: 0.38, halfZ: 0.36, kind: 'rock' });
}

function spawnBush(lane, x, z, isObstacle) {
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.34, 0.64), MAT.bush);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.26, 0.46), MAT.leafDark);
  core.position.set(x, 0.2, z);
  top.position.set(x, 0.44, z + 0.02);
  core.castShadow = top.castShadow = true;
  core.receiveShadow = top.receiveShadow = true;
  scene.add(core, top);
  lane.decorMeshes.push(core, top);
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
    w = 1.9 + Math.random() * 2.3;
    h = 0.34;
    d = 0.92;
  } else if (moverKind === 'truck') {
    w = 2.7 + Math.random() * 1.0;
    h = 0.92;
    d = laneDepth * 0.34;
  } else if (moverKind === 'bike') {
    w = 0.95 + Math.random() * 0.24;
    h = 0.52;
    d = laneDepth * 0.18;
  } else if (moverKind === 'train') {
    w = 6.7 + Math.random() * 2.2;
    h = 1.24;
    d = laneDepth * 0.46;
  } else if (moverKind === 'barrel') {
    w = 0.64 + Math.random() * 0.14;
    h = 0.62 + Math.random() * 0.14;
    d = w;
    spinRate = spd * 3.1;
  } else {
    w = 1.45 + Math.random() * 0.66;
    h = 0.74 + Math.random() * 0.1;
    d = laneDepth * 0.32;
  }

  const mover = new THREE.Group();
  mover.position.set(spd > 0 ? -trafficSpawnX : trafficSpawnX, 0, posZ);

  if (moverKind === 'log') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8d5d37, roughness: 0.96, metalness: 0.02 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const capL = new THREE.Mesh(new THREE.BoxGeometry(0.12, h * 0.92, d * 0.92), MAT.trunk);
    const capR = capL.clone();
    body.position.y = h * 0.5 + 0.06;
    capL.position.set(-w * 0.5, h * 0.52 + 0.06, 0);
    capR.position.set(w * 0.5, h * 0.52 + 0.06, 0);
    body.castShadow = capL.castShadow = capR.castShadow = true;
    body.receiveShadow = capL.receiveShadow = capR.receiveShadow = true;
    mover.add(body, capL, capR);
  } else if (moverKind === 'barrel') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.5, d * 0.92, 14), MAT.trunk);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.y = h * 0.5 + 0.06;
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    const ringL = new THREE.Mesh(new THREE.TorusGeometry(w * 0.34, 0.04, 8, 16), new THREE.MeshStandardMaterial({ color: 0x4d341f, roughness: 0.88 }));
    const ringR = ringL.clone();
    ringL.rotation.y = Math.PI * 0.5;
    ringR.rotation.y = Math.PI * 0.5;
    ringL.position.set(0, h * 0.5 + 0.06, -d * 0.19);
    ringR.position.set(0, h * 0.5 + 0.06, d * 0.19);
    mover.add(barrel, ringL, ringR);
  } else {
    const paint = new THREE.MeshStandardMaterial({
      color: moverKind === 'train'
        ? 0xb7412f
        : moverKind === 'truck'
          ? 0x4e7bd4
          : moverKind === 'bike'
            ? 0x2f2f2f
            : new THREE.Color().setHSL(Math.random(), 0.82, 0.56),
      roughness: moverKind === 'bike' ? 0.38 : 0.3,
      metalness: moverKind === 'bike' ? 0.2 : 0.24,
    });
    const under = moverKind === 'train'
      ? new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.26, d * 0.96), new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.86 }))
      : new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.38, d * 0.98), new THREE.MeshStandardMaterial({ color: 0x252a31, roughness: 0.84 }));
    under.position.y = h * 0.24;
    under.castShadow = true;
    under.receiveShadow = true;
    mover.add(under);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * (moverKind === 'bike' ? 0.42 : 0.72), d * 0.96), paint);
    body.position.y = h * (moverKind === 'bike' ? 0.52 : 0.56) + 0.04;
    body.castShadow = true;
    body.receiveShadow = true;
    mover.add(body);

    if (moverKind === 'bike') {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, h * 0.18, d * 0.9), paint);
      seat.position.set(-w * 0.08, h * 0.8, 0);
      mover.add(seat);
    } else {
      const cabinBase = new THREE.Mesh(new THREE.BoxGeometry(w * (moverKind === 'truck' ? 0.46 : 0.62), h * (moverKind === 'train' ? 0.28 : 0.36), d * 0.88), paint);
      cabinBase.position.set(moverKind === 'truck' ? w * 0.18 : -w * 0.03, h * 0.94, 0);
      cabinBase.castShadow = true;
      mover.add(cabinBase);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * (moverKind === 'truck' ? 0.34 : 0.56), h * (moverKind === 'train' ? 0.26 : 0.32), d * 0.84), MAT.carGlass);
      cabin.position.set(moverKind === 'truck' ? w * 0.18 : -w * 0.03, h * (moverKind === 'train' ? 1.0 : 1.02), 0);
      cabin.castShadow = true;
      mover.add(cabin);
    }

    if (moverKind !== 'train') {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.26, h * 0.18, d * 0.82), paint);
      hood.position.set(w * 0.32, h * 0.78, 0);
      mover.add(hood);
    }

    wheelRadius = moverKind === 'truck' ? 0.16 : moverKind === 'bike' ? 0.11 : moverKind === 'train' ? 0.14 : 0.13;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, moverKind === 'bike' ? 0.12 : 0.16, 12);
    const wx = moverKind === 'train' ? w * 0.42 : w * (moverKind === 'bike' ? 0.34 : 0.28);
    const wz = moverKind === 'bike' ? d * 0.55 : d * 0.42;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (moverKind === 'bike' && sx === -1) continue;
        const wheel = new THREE.Mesh(wheelGeo, MAT.carWheel);
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(moverKind === 'bike' ? 0 : sx * wx, moverKind === 'bike' ? 0.16 : 0.19, sz * wz);
        mover.add(wheel);
        wheelMeshes.push(wheel);
      }
    }

    if (moverKind === 'train') {
      for (let x = -w * 0.36; x <= w * 0.36; x += 0.8) {
        const windowBox = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, d * 0.72), MAT.carGlass);
        windowBox.position.set(x, h * 0.94, 0);
        mover.add(windowBox);
      }
    } else {
      const frontLightL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), MAT.carHeadlight);
      const frontLightR = frontLightL.clone();
      frontLightL.position.set(w * 0.51, h * 0.63, -d * 0.24);
      frontLightR.position.set(w * 0.51, h * 0.63, d * 0.24);
      const rearLightL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), MAT.carTaillight);
      const rearLightR = rearLightL.clone();
      rearLightL.position.set(-w * 0.51, h * 0.63, -d * 0.24);
      rearLightR.position.set(-w * 0.51, h * 0.63, d * 0.24);
      mover.add(frontLightL, frontLightR, rearLightL, rearLightR);
    }

  }

  mover.rotation.y = headingYaw;
  scene.add(mover);
  movers.push({
    lane,
    mesh: mover,
    kind: moverKind,
    isLog,
    halfX: w * 0.5,
    halfZ: d * 0.52,
    speed: spd,
    motion: createMoverMotion(moverKind, spd, headingYaw, posZ, wheelMeshes, wheelRadius),
    spinRate,
  });
}

function createMoverMotion(kind, baseSpeed, headingYaw, restZ, wheels, wheelRadius) {
  const isBoat = kind === 'log';
  const isRoadVehicle = kind === 'car' || kind === 'truck' || kind === 'bike';
  if (!isBoat && !isRoadVehicle) return null;

  return {
    time: Math.random() * Math.PI * 2,
    baseSpeed,
    headingYaw,
    restY: 0,
    restZ,
    wheelRadius,
    wheels,
    speedBlend: isBoat ? 2.8 : 5.4,
    speedWaveAmp: isBoat ? 0.12 : kind === 'bike' ? 0.08 : 0.06,
    speedWaveFreq: isBoat ? 1.15 + Math.random() * 0.45 : 1.9 + Math.random() * 0.7,
    speedWavePhase: Math.random() * Math.PI * 2,
    bobAmp: isBoat ? 0.11 : kind === 'bike' ? 0.048 : 0.034,
    bobFreq: isBoat ? 2.2 + Math.random() * 0.7 : 7.0 + Math.random() * 1.8,
    bobPhase: Math.random() * Math.PI * 2,
    swayAmp: isBoat ? 0.12 : kind === 'bike' ? 0.055 : 0.034,
    swayFreq: isBoat ? 1.7 + Math.random() * 0.6 : 3.4 + Math.random() * 1.2,
    swayPhase: Math.random() * Math.PI * 2,
    driftZAmp: isBoat ? 0.14 : 0.03,
    yawAmp: isBoat ? 0.045 : kind === 'bike' ? 0.03 : 0.018,
    rollAmp: isBoat ? 0.16 : kind === 'bike' ? 0.11 : 0.055,
    pitchAmp: isBoat ? 0.045 : 0.03,
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
  if (kind === 'train') return 4.45;
  if (kind === 'truck') return 1.85;
  if (kind === 'log') return 2.1;
  if (kind === 'bike') return 0.6;
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
    scene.remove(l.mesh);
    for (const m of l.decorMeshes) scene.remove(m);
  }
  for (const m of movers) scene.remove(m.mesh);
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
  player.jump = 0;
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
          ? 4
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

  nextX = THREE.MathUtils.clamp(nextX, -sideLimit, sideLimit);
  if (hitsGrassObstacle(nextX, nextZ)) {
    blip(220, 0.04, 0.018, 'square');
    haptic('medium');
    return;
  }

  player.targetX = nextX;
  player.targetZ = nextZ;
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
  // Keep lane snapping tighter so half-step edge tiles do not get misclassified as river.
  return min < laneDepth * 0.45 ? closest : null;
}

function hitsGrassObstacle(x, z) {
  const lane = laneAt(z);
  if (!lane || lane.type !== 'grass' || !lane.obstacles.length) return false;
  for (const obstacle of lane.obstacles) {
    if (Math.abs(obstacle.x - x) <= obstacle.halfX + 0.24 && Math.abs(obstacle.z - z) <= obstacle.halfZ + 0.24) {
      return true;
    }
  }
  return false;
}

function checkDeath() {
  // Returns 'river', 'car', or null
  const px = player.group.position.x;
  const pz = player.group.position.z;

  const lane = laneAt(pz);
  if (lane?.type === 'river') {
    const onLog = movers.some(
      m => m.isLog
        && Math.abs(m.mesh.position.z - pz) < m.halfZ + 0.28
        && Math.abs(m.mesh.position.x - px) < m.halfX + 0.18
    );
    if (!onLog) return 'river';
  }

  for (const m of movers) {
    if (m.isLog) continue;
    const dz = Math.abs(m.mesh.position.z - pz);
    if (dz > m.halfZ + 0.6) continue;
    const dx = Math.abs(m.mesh.position.x - px);
    if (dx < m.halfX + 0.28) return 'car';
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
      if (channel.cooldown > 0) continue;
      const sub = movers.filter(m => m.lane === lane && Math.abs(m.mesh.position.z - channel.z) < laneDepth * 0.4);
      const spawnX = channel.speed > 0 ? -trafficSpawnX : trafficSpawnX;
      const newHalfX = estimateMoverHalfX(channel.kind);
      const spawnSafety = Math.max(0.55, channel.spawnGap * 0.34);
      const busy = sub.some(m => Math.abs(m.mesh.position.x - spawnX) < m.halfX + newHalfX + spawnSafety);
      if (!busy && sub.length < channel.max) {
        spawnMover(lane, channel.speed, channel.z, channel.kind);
        resetChannelCooldown(channel, getDifficulty());
      } else {
        channel.cooldown = 0.24 + Math.random() * 0.3;
      }
    }
  }

  for (let i = movers.length - 1; i >= 0; i--) {
    const m = movers[i];
    animateMover(m, dt);
    if (Math.abs(m.mesh.position.x) > trafficDespawnX) {
      scene.remove(m.mesh);
      movers.splice(i, 1);
    }
  }

  // Player logic — only when game is active
  if (active) {
    const moveAlpha = 1 - Math.exp(-dt * 16);
    player.group.position.x += (player.targetX - player.group.position.x) * moveAlpha;
    player.group.position.z += (player.targetZ - player.group.position.z) * moveAlpha;

    const lane = laneAt(player.targetZ);
    if (lane?.type === 'river') {
      const log = movers.find(
        m => m.isLog
          && Math.abs(m.mesh.position.z - player.targetZ) < m.halfZ + 0.28
          && Math.abs(m.mesh.position.x - player.targetX) < m.halfX + 0.18
      );
      if (log) {
        const drift = log.speed * dt;
        player.targetX += drift;
        player.group.position.x += drift;
      }
    }

    player.targetX = THREE.MathUtils.clamp(player.targetX, -sideLimit, sideLimit);
    player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, -sideLimit, sideLimit);

    if (player.jump > 0) {
      player.jump += dt * 4.5;
      const t = Math.min(player.jump, 1);
      player.group.position.y = 0.12 + Math.sin(t * Math.PI) * 0.62;
      const sq = 1 + Math.sin(t * Math.PI) * 0.18;
      player.group.scale.set(1 / sq, sq, 1 / sq);
      if (player.jump >= 1) {
        player.jump = 0;
        player.group.position.y = 0.12;
        player.group.scale.set(1, 1, 1);
      }
    }

    let rotDiff = player.targetRotY - player.group.rotation.y;
    rotDiff = ((rotDiff % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    player.group.rotation.y += rotDiff * Math.min(dt * 18, 1);

    const deathType = eagle.active ? null : checkDeath();
    if (deathType) {
      dead = true;
      active = false;
      deathAnim.type = deathType;
      deathAnim.time = 0;
      deathAnim.done = false;
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
  const refZ = active ? player.group.position.z : demoZ;
  if (active) {
    camSmoothZ += (player.group.position.z - camSmoothZ) * (1 - Math.exp(-dt * 10));
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
  while (lanes.length && lanes[lanes.length - 1].z > refZ - 16 * laneDepth) {
    const nextIndex = lanes[lanes.length - 1].idx - 1;
    addLane(lanes[lanes.length - 1].z - laneDepth, nextIndex);
  }
  while (lanes.length && lanes[0].z > refZ + 8 * laneDepth) {
    const old = lanes.shift();
    scene.remove(old.mesh);
    for (const m of old.decorMeshes) scene.remove(m);
    for (let i = movers.length - 1; i >= 0; i--) {
      if (movers[i].lane === old) { scene.remove(movers[i].mesh); movers.splice(i, 1); }
    }
  }
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
  const mobileInput = window.matchMedia('(pointer:coarse)').matches
    && (e.pointerType === 'touch' || e.pointerType === 'pen');
  if (!mobileInput) return;
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
    moveByDragDelta(dx, dy);
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

  // Chiptune-style fail beep: short stepped pitch drop with a tiny pixel click.
  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.0001, t);
  mainGain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.31);
  mainGain.connect(ctx.destination);

  const lead = ctx.createOscillator();
  const leadGain = ctx.createGain();
  lead.type = 'square';
  const notes = [780, 660, 560, 470, 390, 320];
  const step = 0.036;
  notes.forEach((freq, idx) => {
    lead.frequency.setValueAtTime(freq, t + idx * step);
  });
  lead.frequency.exponentialRampToValueAtTime(185, t + notes.length * step + 0.05);
  leadGain.gain.setValueAtTime(0.0001, t);
  leadGain.gain.exponentialRampToValueAtTime(0.11, t + 0.008);
  leadGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.27);
  lead.connect(leadGain).connect(mainGain);
  lead.start(t);
  lead.stop(t + 0.31);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(195, t);
  body.frequency.setValueAtTime(164, t + 0.07);
  body.frequency.setValueAtTime(132, t + 0.14);
  body.frequency.exponentialRampToValueAtTime(96, t + 0.28);
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.045, t + 0.014);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
  body.connect(bodyGain).connect(mainGain);
  body.start(t);
  body.stop(t + 0.31);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'square';
  click.frequency.setValueAtTime(1220, t);
  click.frequency.exponentialRampToValueAtTime(420, t + 0.045);
  clickGain.gain.setValueAtTime(0.0001, t);
  clickGain.gain.exponentialRampToValueAtTime(0.035, t + 0.004);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  click.connect(clickGain).connect(mainGain);
  click.start(t);
  click.stop(t + 0.055);
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
      })),
    }));

  const nearbyMovers = movers
    .filter(m => Math.abs(m.mesh.position.z - playerZ) <= laneDepth * 3)
    .map(m => ({
      type: m.kind,
      x: Number(m.mesh.position.x.toFixed(2)),
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

  return JSON.stringify({
    mode: dead ? 'gameover' : active ? 'playing' : 'menu',
    character: player.id,
    coordinate_system: 'origin at spawn; x positive right, y positive up, z negative is forward',
    lane_width: laneWidth,
    lane_depth: laneDepth,
    score,
    player: {
      x: Number(player.group.position.x.toFixed(2)),
      y: Number(player.group.position.y.toFixed(2)),
      z: Number(player.group.position.z.toFixed(2)),
    },
    lane_here: laneAt(playerZ)?.type ?? null,
    hazard_here: laneAt(playerZ)?.hazard ?? null,
    nearby_lanes: nearbyLanes,
    movers: nearbyMovers,
    obstacles: nearbyObstacles,
  });
}

window.render_game_to_text = renderGameToText;

window.advanceTime = (ms = 1000 / 60) => {
  const stepMs = 1000 / 60;
  let remaining = Math.max(stepMs, ms);
  while (remaining > 0) {
    const dt = Math.min(stepMs, remaining) / 1000;
    update(dt);
    remaining -= stepMs;
  }
  renderer.render(scene, camera);
  if (shouldRenderCharacterPreviews()) renderCharacterPreviews(Math.max(ms / 1000, stepMs / 1000));
};

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  if (shouldRenderCharacterPreviews()) renderCharacterPreviews(dt);
  requestAnimationFrame(loop);
}

applyViewport();
resetWorld();
player.group.visible = false; // hidden during menu demo
requestAnimationFrame(loop);
