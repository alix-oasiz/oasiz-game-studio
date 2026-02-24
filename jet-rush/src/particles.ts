import * as THREE from "three";
import { C, type Particle } from "./config";
import { ObjectPool } from "./pool";

const _sharedSphereGeo = new THREE.SphereGeometry(1, 4, 4);
const _sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);

const _burstMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(1.5, 4, 3),
  toneMapped: false,
  transparent: true,
  opacity: 0.9,
});

const _explMats = [0xff4466, 0xff8800, 0xffcc00, 0x00ccff, 0x2288ff].map(
  (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 }),
);

const _trailMat = new THREE.MeshBasicMaterial({
  color: 0x00ccff,
  transparent: true,
  opacity: 0.5,
});

const _tmpVec = new THREE.Vector3();

/* ── Mesh pools ── */

const _trailMeshPool = new ObjectPool<THREE.Mesh>(
  () => new THREE.Mesh(_sharedSphereGeo, _trailMat),
  (m) => { m.scale.setScalar(1); m.position.set(0, 0, 0); m.visible = false; },
  50,
);

const _burstMeshPool = new ObjectPool<THREE.Mesh>(
  () => new THREE.Mesh(_sharedSphereGeo, _burstMat),
  (m) => { m.scale.setScalar(1); m.position.set(0, 0, 0); m.visible = false; },
  15,
);

const _explMeshPools = _explMats.map(
  (mat) =>
    new ObjectPool<THREE.Mesh>(
      () => new THREE.Mesh(_sharedBoxGeo, mat),
      (m) => { m.scale.setScalar(1); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.visible = false; },
      8,
    ),
);

const _vec3Pool = new ObjectPool<THREE.Vector3>(
  () => new THREE.Vector3(),
  (v) => v.set(0, 0, 0),
  60,
);

/** Emits a single engine trail particle behind the jet. */
export function emitTrail(
  scene: THREE.Scene,
  jetPos: THREE.Vector3,
  particles: Particle[],
): void {
  const sz = 0.04 + Math.random() * 0.06;
  const mesh = _trailMeshPool.acquire();
  mesh.material = _trailMat;
  (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5;
  mesh.scale.setScalar(sz);
  mesh.position.set(
    jetPos.x + (Math.random() - 0.5) * 0.2,
    jetPos.y + (Math.random() - 0.5) * 0.15,
    jetPos.z + 1.2,
  );
  mesh.visible = true;
  scene.add(mesh);

  const vel = _vec3Pool.acquire();
  vel.set(
    (Math.random() - 0.5) * 1.2,
    (Math.random() - 0.5) * 1.0,
    2 + Math.random() * 1.5,
  );

  particles.push({ mesh, life: C.TRAIL_LIFE, maxLife: C.TRAIL_LIFE, vel });
}

/** Updates trail particles, removing dead ones. Returns the filtered array. */
export function tickTrail(
  scene: THREE.Scene,
  particles: Particle[],
  dt: number,
): Particle[] {
  let writeIdx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      _trailMeshPool.release(p.mesh);
      _vec3Pool.release(p.vel);
      continue;
    }
    _tmpVec.copy(p.vel).multiplyScalar(dt);
    p.mesh.position.add(_tmpVec);
    const alpha = p.life / p.maxLife;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.4;
    const s = alpha * 0.5 + 0.5;
    p.mesh.scale.setScalar(s * (0.04 + (1 - alpha) * 0.06));
    particles[writeIdx++] = p;
  }
  particles.length = writeIdx;
  return particles;
}

/** Spawns a small radial burst when a collectible is picked up. */
export function spawnCollectBurst(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  particles: Particle[],
): void {
  for (let i = 0; i < 10; i++) {
    const sz = 0.06 + Math.random() * 0.08;
    const mesh = _burstMeshPool.acquire();
    mesh.scale.setScalar(sz);
    mesh.position.set(x, y, z);
    mesh.visible = true;
    scene.add(mesh);

    const ang = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.5) * Math.PI;
    const spd = 4 + Math.random() * 6;

    const vel = _vec3Pool.acquire();
    vel.set(
      Math.cos(ang) * Math.cos(elev) * spd,
      Math.sin(elev) * spd,
      Math.sin(ang) * Math.cos(elev) * spd,
    );

    particles.push({
      mesh,
      life: 0.25 + Math.random() * 0.2,
      maxLife: 0.4,
      vel,
    });
  }
}

/** Spawns an explosion burst of box particles. */
export function spawnExplosion(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  particles: Particle[],
): void {
  for (let i = 0; i < 35; i++) {
    const sz = 0.08 + Math.random() * 0.2;
    const poolIdx = i % 5;
    const mesh = _explMeshPools[poolIdx].acquire();
    mesh.scale.setScalar(sz);
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, 0, 0);
    mesh.visible = true;
    scene.add(mesh);

    const a1 = Math.random() * Math.PI * 2;
    const a2 = Math.random() * Math.PI - Math.PI / 2;
    const speed = 5 + Math.random() * 15;

    const vel = _vec3Pool.acquire();
    vel.set(
      Math.cos(a1) * Math.cos(a2) * speed,
      Math.sin(a2) * speed + 4,
      Math.sin(a1) * Math.cos(a2) * speed,
    );

    particles.push({
      mesh,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.8,
      vel,
    });
  }
}

/** Updates explosion particles with gravity. Returns the filtered array. */
export function tickExplosion(
  scene: THREE.Scene,
  particles: Particle[],
  dt: number,
): Particle[] {
  let writeIdx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.visible = false;
      const geo = p.mesh.geometry;
      if (geo === _sharedBoxGeo) {
        const matIdx = _explMats.indexOf(p.mesh.material as THREE.MeshBasicMaterial);
        if (matIdx >= 0) _explMeshPools[matIdx].release(p.mesh);
      } else if (geo === _sharedSphereGeo) {
        _burstMeshPool.release(p.mesh);
      }
      _vec3Pool.release(p.vel);
      continue;
    }
    p.vel.y -= 12 * dt;
    _tmpVec.copy(p.vel).multiplyScalar(dt);
    p.mesh.position.add(_tmpVec);
    p.mesh.rotation.x += dt * 5;
    p.mesh.rotation.y += dt * 3;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
    particles[writeIdx++] = p;
  }
  particles.length = writeIdx;
  return particles;
}

/** Release all active particles back to their pools. */
export function releaseAllParticles(scene: THREE.Scene, particles: Particle[]): void {
  for (const p of particles) {
    scene.remove(p.mesh);
    p.mesh.visible = false;
    const geo = p.mesh.geometry;
    if (geo === _sharedBoxGeo) {
      const matIdx = _explMats.indexOf(p.mesh.material as THREE.MeshBasicMaterial);
      if (matIdx >= 0) _explMeshPools[matIdx].release(p.mesh);
    } else if (geo === _sharedSphereGeo) {
      if (p.mesh.material === _burstMat) _burstMeshPool.release(p.mesh);
      else _trailMeshPool.release(p.mesh);
    }
    _vec3Pool.release(p.vel);
  }
  particles.length = 0;
}
