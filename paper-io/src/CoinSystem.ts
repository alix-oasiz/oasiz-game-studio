/**
 * CoinSystem — renders all orbs as a single THREE.InstancedMesh draw call.
 *
 * Three.js docs insight: InstancedMesh with setMatrixAt / setColorAt collapses
 * N individual Mesh draw calls into 1, which is the biggest GPU win available
 * when many objects share the same geometry.  We use DynamicDrawUsage because
 * instance matrices change every frame during the gather/pop animations.
 */
import * as THREE from "three";
import {
  territoryArea,
  pointInTerritory,
  type TerritoryMultiPolygon,
} from "./polygon-ops.ts";
import { type Vec2 } from "./constants.ts";

const ORB_RADIUS = 0.18;
const ORB_SEGMENTS_W = 14;
const ORB_SEGMENTS_H = 10;

const ORB_POP_DURATION = 0.2;
const ORB_LINGER_DURATION = 1.0;
const ORB_GATHER_DURATION_BASE = 0.58;
const ORB_COLLECT_RADIUS_SQ = 0.81;

/** Upper bound on simultaneous orbs across all players. */
const MAX_ORB_INSTANCES = 48;

const COIN_AREA_THRESHOLDS: [number, number][] = [
  [120, 5],
  [60, 4],
  [25, 3],
  [12, 2],
  [6, 1],
];

export function computeCoinCount(area: number): number {
  for (const [threshold, count] of COIN_AREA_THRESHOLDS) {
    if (area >= threshold) return count;
  }
  return 0;
}

interface OrbState {
  slotIndex: number; // index into InstancedMesh
  batchId: number;
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  ownerId: number;
  color: THREE.Color;
  totalTime: number;
  popDuration: number;
  lingerDuration: number;
  gatherDuration: number;
  wobblePhase: number;
  collected: boolean;
}

export interface CoinSpawnResult {
  batchId: number | null;
  orbCount: number;
  maxTotalMs: number;
}

export class CoinSystem {
  private scene: THREE.Scene;
  private readonly onCollect:
    | ((ownerId: number, batchId: number) => void)
    | null;

  lastSpawnPositions: Vec2[] = [];

  // Single instanced mesh for all orbs — 1 draw call total
  private instancedMesh: THREE.InstancedMesh;
  private activeOrbs: OrbState[] = [];

  // Scratch objects reused every frame to avoid GC pressure
  private readonly _dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();
  private readonly _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
  private nextBatchId = 1;

  constructor(
    scene: THREE.Scene,
    onCollect?: (ownerId: number, batchId: number) => void,
  ) {
    this.scene = scene;
    this.onCollect = onCollect ?? null;

    const geo = new THREE.SphereGeometry(
      ORB_RADIUS,
      ORB_SEGMENTS_W,
      ORB_SEGMENTS_H,
    );

    // vertexColors: true enables per-instance coloring via setColorAt
    const mat = new THREE.MeshPhongMaterial({
      vertexColors: false,
      emissiveIntensity: 0.45,
      shininess: 120,
      specular: new THREE.Color(0xffffff),
      transparent: true,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, MAX_ORB_INSTANCES);
    // DynamicDrawUsage tells the GPU driver this buffer updates frequently
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0;

    // Zero out all instance matrices so hidden slots don't render stray geometry
    for (let i = 0; i < MAX_ORB_INSTANCES; i++) {
      this.instancedMesh.setMatrixAt(i, this._zeroScale);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instancedMesh.frustumCulled = false; // orbs are always near the player

    scene.add(this.instancedMesh);
  }

  spawnCoins(
    region: TerritoryMultiPolygon,
    target: Vec2,
    ownerId: number,
    playerColor: number,
  ): CoinSpawnResult {
    const area = territoryArea(region);
    const count = computeCoinCount(area);
    if (count === 0) return { batchId: null, orbCount: 0, maxTotalMs: 0 };

    const spawnPositions = this.sampleSpawnPositions(region, count);
    this.lastSpawnPositions = spawnPositions;
    if (spawnPositions.length === 0) {
      return { batchId: null, orbCount: 0, maxTotalMs: 0 };
    }

    let maxTotalMs = 0;
    let orbCount = 0;
    const batchId = this.nextBatchId++;

    for (let i = 0; i < count; i++) {
      if (this.activeOrbs.length >= MAX_ORB_INSTANCES) break;

      const slotIndex = this.activeOrbs.length;
      const pos = spawnPositions[i % spawnPositions.length];

      const popDuration = ORB_POP_DURATION + Math.random() * 0.04;
      const lingerDuration = ORB_LINGER_DURATION + Math.random() * 0.18;
      const gatherDuration = ORB_GATHER_DURATION_BASE + Math.random() * 0.22;

      const orb: OrbState = {
        slotIndex,
        batchId,
        startPosition: new THREE.Vector3(pos.x, 0.02, pos.z),
        targetPosition: new THREE.Vector3(target.x, 0.55, target.z),
        ownerId,
        color: new THREE.Color(playerColor),
        totalTime: 0,
        popDuration,
        lingerDuration,
        gatherDuration,
        wobblePhase: Math.random() * Math.PI * 2,
        collected: false,
      };

      this.activeOrbs.push(orb);
      this.instancedMesh.setColorAt(slotIndex, orb.color);
      orbCount++;

      const total = (popDuration + lingerDuration + gatherDuration) * 1000;
      if (total > maxTotalMs) maxTotalMs = total;
    }

    this.instancedMesh.count = this.activeOrbs.length;
    if (this.instancedMesh.instanceColor)
      this.instancedMesh.instanceColor.needsUpdate = true;

    return {
      batchId: orbCount > 0 ? batchId : null,
      orbCount,
      maxTotalMs,
    };
  }

  private sampleSpawnPositions(
    region: TerritoryMultiPolygon,
    count: number,
  ): Vec2[] {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (const polygon of region) {
      for (const pt of polygon.outer) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.z < minZ) minZ = pt.z;
        if (pt.z > maxZ) maxZ = pt.z;
      }
    }

    const w = maxX - minX;
    const d = maxZ - minZ;
    if (w <= 0 || d <= 0) return [];

    const step = Math.max(0.5, Math.min(1.4, Math.sqrt(w * d) * 0.18));
    const inside: Vec2[] = [];

    for (let z = minZ + step * 0.5; z < maxZ; z += step) {
      for (let x = minX + step * 0.5; x < maxX; x += step) {
        if (pointInTerritory({ x, z }, region)) {
          inside.push({ x, z });
        }
      }
    }

    if (inside.length === 0) return [];
    if (inside.length <= count) return inside;

    const result: Vec2[] = [];
    const stride = inside.length / count;
    for (let i = 0; i < count; i++) {
      result.push(inside[Math.floor(i * stride)]);
    }
    return result;
  }

  updateCoinTarget(ownerId: number, target: Vec2): void {
    for (const orb of this.activeOrbs) {
      if (orb.ownerId !== ownerId) continue;
      orb.targetPosition.set(target.x, 0.55, target.z);
    }
  }

  update(dt: number): void {
    let i = 0;
    let matrixDirty = false;
    let colorDirty = false;

    while (i < this.activeOrbs.length) {
      const orb = this.activeOrbs[i];
      orb.totalTime += dt;

      const totalDuration =
        orb.popDuration + orb.lingerDuration + orb.gatherDuration;

      if (orb.totalTime >= totalDuration) {
        if (!orb.collected) {
          orb.collected = true;
          this.onCollect?.(orb.ownerId, orb.batchId);
        }
        this.removeOrb(i);
        matrixDirty = true;
        continue;
      }

      const dummy = this._dummy;
      let scale = 1;
      let opacity = 1;

      if (orb.totalTime < orb.popDuration) {
        // Pop phase: scale 0→1 with slight overshoot
        const t = orb.totalTime / orb.popDuration;
        const eased = 1 - Math.pow(1 - t, 2);
        scale = eased < 0.85 ? eased * 1.18 : 1 + (1 - eased) * 0.18;
        opacity = eased;

        dummy.position.set(
          orb.startPosition.x,
          0.02 + eased * 0.43,
          orb.startPosition.z,
        );
      } else if (orb.totalTime < orb.popDuration + orb.lingerDuration) {
        // Linger phase: gentle hover
        const lingerT = (orb.totalTime - orb.popDuration) / orb.lingerDuration;
        const hover = Math.sin(lingerT * Math.PI * 3 + orb.wobblePhase) * 0.04;
        dummy.position.set(
          orb.startPosition.x,
          0.45 + hover,
          orb.startPosition.z,
        );
        scale = 1;
        opacity = 1;
      } else {
        // Gather phase: arc-float toward player
        const gatherElapsed =
          orb.totalTime - orb.popDuration - orb.lingerDuration;
        const gatherT = Math.min(1, gatherElapsed / orb.gatherDuration);
        const eased = 1 - Math.pow(1 - gatherT, 3);

        const wobble =
          Math.sin(gatherT * Math.PI * 2 + orb.wobblePhase) *
          0.07 *
          (1 - gatherT);
        const arcY = Math.sin(gatherT * Math.PI) * 0.35;

        dummy.position.set(
          THREE.MathUtils.lerp(
            orb.startPosition.x,
            orb.targetPosition.x,
            eased,
          ) + wobble,
          THREE.MathUtils.lerp(0.45, orb.targetPosition.y, eased) + arcY,
          THREE.MathUtils.lerp(
            orb.startPosition.z,
            orb.targetPosition.z,
            eased,
          ) - wobble,
        );
        scale = Math.max(0.08, 1 - gatherT * 0.7);
        opacity = Math.max(0, 1 - Math.max(0, gatherT - 0.82) * 5.5);

        if (!orb.collected) {
          const dx = dummy.position.x - orb.targetPosition.x;
          const dz = dummy.position.z - orb.targetPosition.z;
          if (dx * dx + dz * dz < ORB_COLLECT_RADIUS_SQ || gatherT >= 0.9) {
            orb.collected = true;
            this.onCollect?.(orb.ownerId, orb.batchId);
            this.removeOrb(i);
            matrixDirty = true;
            continue;
          }
        }

        if (gatherT >= 1.0) {
          this.removeOrb(i);
          matrixDirty = true;
          continue;
        }
      }

      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(orb.slotIndex, dummy.matrix);
      matrixDirty = true;

      // Fade opacity via emissive intensity encoded in color brightness
      if (opacity < 1) {
        this._color.copy(orb.color).multiplyScalar(opacity);
        this.instancedMesh.setColorAt(orb.slotIndex, this._color);
        colorDirty = true;
      }

      i++;
    }

    if (matrixDirty) this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && this.instancedMesh.instanceColor)
      this.instancedMesh.instanceColor.needsUpdate = true;
  }

  private removeOrb(index: number): void {
    const last = this.activeOrbs.length - 1;

    if (index !== last) {
      // Swap-remove: move the last orb into this slot
      const swapped = this.activeOrbs[last];
      swapped.slotIndex = index;
      this.activeOrbs[index] = swapped;

      // Copy the last orb's matrix/color into its new slot
      const dummy = this._dummy;
      dummy.position.set(0, 0, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      // The swapped orb will re-write its slot next frame; zero the old last slot
      this.instancedMesh.setMatrixAt(last, this._zeroScale);
    } else {
      // It was the last element; just zero its slot
      this.instancedMesh.setMatrixAt(index, this._zeroScale);
    }

    this.activeOrbs.pop();
    this.instancedMesh.count = this.activeOrbs.length;
  }

  hasActiveCoins(): boolean {
    return this.activeOrbs.length > 0;
  }

  dispose(): void {
    this.scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.activeOrbs = [];
  }
}
