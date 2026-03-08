import * as THREE from "three";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private activeCount = 0;
  private geo: THREE.TetrahedronGeometry;
  // Pool of inactive particles for reuse
  private pool: Particle[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geo = new THREE.TetrahedronGeometry(0.15);
  }

  private getParticle(color: number): Particle {
    let p = this.pool.pop();
    if (p) {
      // Reuse pooled particle
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      p.mesh.visible = true;
      p.life = 0;
      p.active = true;
      p.mesh.scale.set(1, 1, 1);
      return p;
    }
    // Create new
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    return {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.4,
      active: true,
    };
  }

  spawnDeathBurst(x: number, z: number, color: number): void {
    const count = 12 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const p = this.getParticle(color);
      p.mesh.position.set(x, 0.2, z);
      p.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      p.maxLife = 0.4;

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 2 + Math.random() * 3;
      p.velocity.set(
        Math.cos(angle) * speed,
        3 + Math.random() * 4,
        Math.sin(angle) * speed,
      );

      this.scene.add(p.mesh);
      this.particles.push(p);
      this.activeCount++;
    }
  }

  update(dt: number): void {
    // Iterate and swap-remove dead particles (O(1) removal)
    let i = 0;
    while (i < this.activeCount) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        // Deactivate: hide mesh, move to pool
        p.mesh.visible = false;
        p.active = false;
        this.scene.remove(p.mesh);
        this.pool.push(p);

        // Swap with last active
        this.activeCount--;
        this.particles[i] = this.particles[this.activeCount];
        this.particles[this.activeCount] = p;
        // Don't increment i — recheck swapped element
        continue;
      }
      p.velocity.y -= 15 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 3;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      const scale = 1 - t * 0.5;
      p.mesh.scale.set(scale, scale, scale);
      i++;
    }
  }

  hasActiveParticles(): boolean {
    return this.activeCount > 0;
  }

  dispose(): void {
    for (let i = 0; i < this.activeCount; i++) {
      const p = this.particles[i];
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    for (const p of this.pool) {
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.pool = [];
    this.activeCount = 0;
  }
}
