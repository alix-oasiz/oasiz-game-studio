import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { C, type Block, type BlockRow } from "./config";
import { seededRandom, SimplexNoise } from "./utils";

/* ── Shared materials (created once) ── */

const blockShades = [0x0f1e30, 0x121f33, 0x0d1a2c, 0x142236, 0x101c2e];
let blockMats: THREE.MeshStandardMaterial[] = [];
let blockEdgeMat: THREE.MeshBasicMaterial;
let wireframeMats: LineMaterial[] = [];
let groundMat: THREE.MeshStandardMaterial;
let movingStripMat: THREE.MeshBasicMaterial;
let matsReady = false;

const OUTLINE_COLORS = [
  0x00aaff, 0x00ff88, 0xffdd00, 0xff6600, 0xff0066, 0xaa00ff, 0x0088ff, 0x88ff00,
];

const _outlineBaseColors = OUTLINE_COLORS.map((c) => new THREE.Color(c));

function ensureMats(): void {
  if (matsReady) return;
  matsReady = true;

  wireframeMats = OUTLINE_COLORS.map(
    () =>
      new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: 2,
        resolution: new THREE.Vector2(1, 1),
      }),
  );

  blockMats = blockShades.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.5,
        metalness: 0.4,
        emissive: 0x060e1a,
        emissiveIntensity: 0.3,
      }),
  );

  blockEdgeMat = new THREE.MeshBasicMaterial({
    color: 0x0066aa,
    transparent: true,
    opacity: 0.3,
  });

  groundMat = new THREE.MeshStandardMaterial({
    color: 0x080e1a,
    roughness: 0.8,
    metalness: 0.2,
  });

  movingStripMat = new THREE.MeshBasicMaterial({
    color: 0xff2255,
    transparent: true,
    opacity: 0.6,
  });
}

/* ── Geometry cache ── */

const GEO_QUANT = 0.5;

function quantize(v: number): number {
  return Math.round(v / GEO_QUANT) * GEO_QUANT;
}

function geoKey(w: number, h: number, d: number): string {
  return `${w}_${h}_${d}`;
}

const _boxGeoCache = new Map<string, THREE.BoxGeometry>();
const _edgesGeoCache = new Map<string, THREE.EdgesGeometry>();

function getCachedBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const qw = quantize(w);
  const qh = quantize(h);
  const qd = quantize(d);
  const key = geoKey(qw, qh, qd);
  let geo = _boxGeoCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(qw, qh, qd);
    _boxGeoCache.set(key, geo);
  }
  return geo;
}

function getCachedEdgesGeo(boxGeo: THREE.BoxGeometry, w: number, h: number, d: number): THREE.EdgesGeometry {
  const qw = quantize(w);
  const qh = quantize(h);
  const qd = quantize(d);
  const key = geoKey(qw, qh, qd);
  let geo = _edgesGeoCache.get(key);
  if (!geo) {
    geo = new THREE.EdgesGeometry(boxGeo);
    _edgesGeoCache.set(key, geo);
  }
  return geo;
}

const _reusableColArr = new Float32Array(256 * 6);

/* ── Ground ── */

export function buildGround(scene: THREE.Scene): THREE.Group[] {
  ensureMats();
  const size = C.GROUND_SIZE;
  const tiles: THREE.Group[] = [];

  for (let i = 0; i < C.GROUND_SEGMENTS; i++) {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    g.add(floor);
    g.position.z = -i * size;
    scene.add(g);
    tiles.push(g);
  }

  return tiles;
}

export function recycleGround(tiles: THREE.Group[], planeZ: number): void {
  for (const g of tiles) {
    if (g.position.z > planeZ + C.GROUND_SIZE) {
      g.position.z -= C.GROUND_SIZE * C.GROUND_SEGMENTS;
    }
  }
}

/* ── Noise instances (lazily created per run seed) ── */

let cachedSeed = -1;
let noiseLo: SimplexNoise;
let noiseHi: SimplexNoise;
let noiseCorridor: SimplexNoise;
let noiseCorridor2: SimplexNoise;

function ensureNoise(seed: number): void {
  if (seed === cachedSeed) return;
  cachedSeed = seed;
  noiseLo = new SimplexNoise(seed);
  noiseHi = new SimplexNoise(seed + 7919);
  noiseCorridor = new SimplexNoise(seed + 13337);
  noiseCorridor2 = new SimplexNoise(seed + 24571);
}

/* ── Height from noise ── */

function sampleHeight(x: number, z: number): number {
  const lo = (noiseLo.noise2D(x * C.NOISE_SCALE_LO, z * C.NOISE_SCALE_LO) + 1) * 0.5;
  const hi = (noiseHi.noise2D(x * C.NOISE_SCALE_HI, z * C.NOISE_SCALE_HI) + 1) * 0.5;
  const raw = lo * C.NOISE_WEIGHT_LO + hi * C.NOISE_WEIGHT_HI;
  const shaped = Math.pow(raw, C.NOISE_HEIGHT_POW);

  if (shaped >= C.TALL_NOISE_CUTOFF) {
    const t = (shaped - C.TALL_NOISE_CUTOFF) / (1 - C.TALL_NOISE_CUTOFF);
    return C.TALL_H_MIN + t * (C.TALL_H_MAX - C.TALL_H_MIN);
  }
  const t = shaped / C.TALL_NOISE_CUTOFF;
  return C.SHORT_H_MIN + t * (C.SHORT_H_MAX - C.SHORT_H_MIN);
}

/* ── Corridor center X at a given Z ── */

function corridorCenterX(z: number): number {
  return noiseCorridor.noise2D(0, z * C.CORRIDOR_WANDER_SCALE) * C.CORRIDOR_WANDER_AMP;
}

function corridor2CenterX(z: number): number {
  return noiseCorridor2.noise2D(5.5, z * C.CORRIDOR2_WANDER_SCALE) * C.CORRIDOR2_WANDER_AMP;
}

/** Returns the primary corridor's center X at a given Z. Requires ensureNoise() first. */
export function getCorridorCenter(z: number, runSeed: number): number {
  ensureNoise(runSeed);
  return corridorCenterX(z);
}

/* ── Cell data computed before mesh creation ── */

interface CellData {
  bx: number;
  bz: number;
  bw: number;
  bd: number;
  bh: number;
}

/* ── Spawn a dense row of city blocks ── */

export function spawnRow(
  scene: THREE.Scene,
  z: number,
  runSeed: number,
  safeZone: boolean = false,
  score: number = 0,
  edgeTallOnly: boolean = false,
): BlockRow {
  ensureMats();
  ensureNoise(runSeed);

  const rng = seededRandom(Math.floor(z * 7.37 + runSeed));
  const cx1 = corridorCenterX(z);
  const cx2 = corridor2CenterX(z);

  const edgeThreshold = C.BLOCK_SPREAD_X * 0.55;

  /* ── Pass 1: compute cell positions and heights ── */
  const cells: CellData[] = [];

  for (let cellX = -C.BLOCK_SPREAD_X; cellX <= C.BLOCK_SPREAD_X; cellX += C.CELL_SIZE_X) {
    const jitterX = (rng() - 0.5) * 1.2;
    const jitterZ = (rng() - 0.5) * 1.0;
    const bx = cellX + jitterX;
    const bz = z + jitterZ;

    const bw = C.BLOCK_W_MIN + rng() * (C.BLOCK_W_MAX - C.BLOCK_W_MIN);
    const bd = C.BLOCK_D_MIN + rng() * (C.BLOCK_D_MAX - C.BLOCK_D_MIN);

    let bh = sampleHeight(bx, bz);

    if (safeZone) {
      bh = Math.min(bh, C.CORRIDOR_SAFE_H);
    }

    if (edgeTallOnly) {
      const absBx = Math.abs(bx);
      if (absBx < edgeThreshold) {
        bh = Math.min(bh, C.SHORT_H_MAX * 0.6);
      } else {
        const edgeFactor = (absBx - edgeThreshold) / (C.BLOCK_SPREAD_X - edgeThreshold);
        const minTall = C.TALL_H_MIN * 0.6;
        const maxTall = C.TALL_H_MAX;
        bh = minTall + edgeFactor * edgeFactor * (maxTall - minTall);
      }
    }

    const dist1 = Math.abs(bx - cx1);
    const dist2 = Math.abs(bx - cx2);

    if (!safeZone && !edgeTallOnly) {
      if (dist1 < C.CORRIDOR_HALF_W) {
        const t = dist1 / C.CORRIDOR_HALF_W;
        const maxH = C.CORRIDOR_SAFE_H + t * t * (bh - C.CORRIDOR_SAFE_H);
        bh = Math.min(bh, maxH);
      }
      if (dist2 < C.CORRIDOR2_HALF_W) {
        const t = dist2 / C.CORRIDOR2_HALF_W;
        const maxH = C.CORRIDOR_SAFE_H + t * t * (bh - C.CORRIDOR_SAFE_H);
        bh = Math.min(bh, maxH);
      }
    }

    bh = Math.max(C.SHORT_H_MIN, bh);

    const deadLo = C.PLANE_Y - 1;
    const deadHi = C.PLANE_Y + 1;
    if (bh > deadLo && bh < deadHi) {
      bh = deadLo;
    }

    cells.push({ bx, bz, bw, bd, bh });
  }

  /* ── Pass 2: de-clump tall blocks ── */
  if (!safeZone) {
    const gap = C.TALL_MIN_GAP_CELLS;
    const thresh = C.TALL_THRESHOLD;
    let lastTallIdx = -gap - 1;

    for (let i = 0; i < cells.length; i++) {
      if (cells[i].bh >= thresh) {
        if (i - lastTallIdx <= gap) {
          cells[i].bh = C.SHORT_H_MIN + rng() * (C.SHORT_H_MAX - C.SHORT_H_MIN);
        } else {
          lastTallIdx = i;
        }
      }
    }
  }

  /* ── Pass 3: create meshes from cell data ── */
  const blocks: Block[] = [];
  const rng2 = seededRandom(Math.floor(z * 3.13 + runSeed));

  for (const cell of cells) {
    const { bx, bz, bw, bd, bh } = cell;

    const isMoving = !safeZone && bh > C.PLANE_Y && rng2() < C.MOVE_CHANCE;
    const moveAmp = isMoving
      ? C.MOVE_AMP_MIN + rng2() * (C.MOVE_AMP_MAX - C.MOVE_AMP_MIN)
      : 0;
    const moveSpeed = isMoving
      ? C.MOVE_SPEED_MIN + rng2() * (C.MOVE_SPEED_MAX - C.MOVE_SPEED_MIN)
      : 0;
    const movePhase = rng2() * Math.PI * 2;

    const geo = getCachedBoxGeo(bw, bh, bd);
    const mat = blockMats[Math.floor(rng2() * blockMats.length)];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx, bh / 2, bz);

    const outlineTier = Math.floor(score / 100) % OUTLINE_COLORS.length;
    const edgesGeo = getCachedEdgesGeo(geo, bw, bh, bd);
    const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edgesGeo);

    const baseCol = _outlineBaseColors[outlineTier];
    const posBuffer = (lineGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute)
      .data.array as Float32Array;
    const segCount = posBuffer.length / 6;
    const needed = segCount * 6;
    const colArr = needed <= _reusableColArr.length
      ? _reusableColArr
      : new Float32Array(needed);
    const halfH = bh / 2;
    for (let si = 0; si < segCount; si++) {
      const off = si * 6;
      const y0 = posBuffer[off + 1];
      const y1 = posBuffer[off + 4];
      const t0 = THREE.MathUtils.clamp((y0 + halfH) / bh, 0, 1);
      const t1 = THREE.MathUtils.clamp((y1 + halfH) / bh, 0, 1);
      const b0 = 0.15 + t0 * 0.85;
      const b1 = 0.15 + t1 * 0.85;
      colArr[off]     = baseCol.r * b0;
      colArr[off + 1] = baseCol.g * b0;
      colArr[off + 2] = baseCol.b * b0;
      colArr[off + 3] = baseCol.r * b1;
      colArr[off + 4] = baseCol.g * b1;
      colArr[off + 5] = baseCol.b * b1;
    }
    if (colArr === _reusableColArr) {
      lineGeo.setColors(Array.from(colArr.subarray(0, needed)));
    } else {
      lineGeo.setColors(colArr);
    }

    const wireframe = new LineSegments2(lineGeo, wireframeMats[outlineTier]);
    wireframe.name = "wireframeOutline";
    mesh.add(wireframe);

    scene.add(mesh);

    if (bh > 4.0) {
      const edgeGeo = getCachedBoxGeo(bw + 0.06, 0.06, bd + 0.06);
      const edge = new THREE.Mesh(edgeGeo, blockEdgeMat);
      edge.position.y = bh / 2;
      mesh.add(edge);
    }

    if (isMoving) {
      const stripGeo = getCachedBoxGeo(bw + 0.08, 0.1, bd + 0.08);
      const stripTop = new THREE.Mesh(stripGeo, movingStripMat);
      stripTop.position.y = bh / 2;
      mesh.add(stripTop);

      const stripBot = new THREE.Mesh(stripGeo, movingStripMat);
      stripBot.position.y = -bh / 2 + 0.05;
      mesh.add(stripBot);
    }

    blocks.push({
      mesh,
      worldZ: bz,
      worldX: bx,
      baseHeight: bh,
      width: bw,
      depth: bd,
      moving: isMoving,
      moveAmp,
      moveSpeed,
      movePhase,
      currentTop: bh,
    });
  }

  return { z, blocks };
}

/** Removes a row from the scene and disposes only per-instance geometry (LineSegmentsGeometry). */
export function destroyRow(scene: THREE.Scene, row: BlockRow): void {
  for (const b of row.blocks) {
    scene.remove(b.mesh);
    b.mesh.traverse((child) => {
      if (child instanceof LineSegments2) {
        child.geometry.dispose();
      }
    });
  }
}

/** Animates all moving blocks based on elapsed time. */
export function updateBlockAnimations(rows: BlockRow[], elapsed: number): void {
  for (let ri = 0; ri < rows.length; ri++) {
    const blocks = rows[ri].blocks;
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      if (!b.moving) continue;

      const yOffset = Math.sin(elapsed * b.moveSpeed + b.movePhase) * b.moveAmp;
      const newH = Math.max(0.3, b.baseHeight + yOffset);
      b.currentTop = newH;

      b.mesh.scale.y = newH / b.baseHeight;
      b.mesh.position.y = newH / 2;
    }
  }
}
