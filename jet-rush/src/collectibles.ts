import * as THREE from "three";
import { C, type Collectible } from "./config";
import { ObjectPool } from "./pool";

/* ── Shared geometry & materials (created once, never cloned) ── */

const coreGeo = new THREE.IcosahedronGeometry(0.45, 1);
const glowGeo = new THREE.IcosahedronGeometry(1.1, 2);

let coreMat: THREE.MeshBasicMaterial;
let glowMat: THREE.MeshBasicMaterial;
let ready = false;

function ensureMats(): void {
  if (ready) return;
  ready = true;

  coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2, 5, 4),
    toneMapped: false,
    transparent: true,
    opacity: 0.95,
  });

  glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.4, 1.5, 1.0),
    toneMapped: false,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
  });
}

/* ── Collectible group pool ── */

const _collectiblePool = new ObjectPool<THREE.Group>(
  () => {
    ensureMats();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(coreGeo, coreMat));
    group.add(new THREE.Mesh(glowGeo, glowMat));
    return group;
  },
  (g) => {
    g.position.set(0, 0, 0);
    g.scale.setScalar(1);
    g.visible = false;
  },
  15,
);

/* ── Spawn ── */

export function spawnCollectible(
  scene: THREE.Scene,
  z: number,
  corridorX: number,
  rng: () => number,
): Collectible {
  ensureMats();

  const side = rng() < 0.5 ? -1 : 1;
  const offset =
    C.COLLECT_OFFSET_MIN +
    rng() * (C.COLLECT_OFFSET_MAX - C.COLLECT_OFFSET_MIN);
  const x = corridorX + side * offset;
  const phase = rng() * Math.PI * 2;

  const group = _collectiblePool.acquire();
  group.position.set(x, C.PLANE_Y, z);
  group.scale.setScalar(1);
  group.visible = true;
  scene.add(group);

  return {
    mesh: group,
    worldX: x,
    worldZ: z,
    collected: false,
    attracting: false,
    phase,
  };
}

/* ── Tick ── */

export function tickCollectibles(
  collectibles: Collectible[],
  planeX: number,
  planeY: number,
  planeZ: number,
  dt: number,
  elapsed: number,
): number {
  let collected = 0;

  for (const c of collectibles) {
    if (c.collected) continue;

    const core = c.mesh.children[0] as THREE.Mesh;
    const glow = c.mesh.children[1] as THREE.Mesh;

    core.rotation.y = elapsed * 2.5 + c.phase;
    core.rotation.x = elapsed * 1.8 + c.phase * 0.5;

    const pulse = 1 + Math.sin(elapsed * 5 + c.phase) * 0.25;
    glow.scale.setScalar(pulse);

    if (!c.attracting) {
      c.mesh.position.y = planeY + Math.sin(elapsed * 2 + c.phase) * 0.8;
    }

    const dx = planeX - c.mesh.position.x;
    const dy = planeY - c.mesh.position.y;
    const dz = planeZ - c.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < C.COLLECT_PICKUP_RANGE) {
      c.collected = true;
      collected++;
      continue;
    }

    if (!c.attracting && dist < C.COLLECT_ATTRACT_RANGE) {
      c.attracting = true;
    }

    if (c.attracting) {
      const speed = dist > C.COLLECT_ATTRACT_RANGE
        ? C.COLLECT_CHASE_SPEED
        : C.COLLECT_ATTRACT_SPEED + (C.COLLECT_CHASE_SPEED - C.COLLECT_ATTRACT_SPEED) * (1 - dist / C.COLLECT_ATTRACT_RANGE);
      const inv = 1 / Math.max(dist, 0.01);

      c.mesh.position.x += dx * inv * speed * dt;
      c.mesh.position.y += dy * inv * speed * dt;
      c.mesh.position.z += dz * inv * speed * dt;

      const shrink = Math.min(1, dist / C.COLLECT_ATTRACT_RANGE);
      c.mesh.scale.setScalar(0.35 + 0.65 * shrink);
    }
  }

  return collected;
}

/* ── Cleanup ── */

export function destroyCollectible(scene: THREE.Scene, c: Collectible): void {
  scene.remove(c.mesh);
  _collectiblePool.release(c.mesh);
}
