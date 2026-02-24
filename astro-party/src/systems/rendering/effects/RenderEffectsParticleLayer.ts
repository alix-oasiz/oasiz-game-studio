import { Particle } from "../../../types";

export class RenderEffectsParticleLayer {
  private particles: Particle[] = [];

  constructor(private random: () => number) {}

  clear(): void {
    this.particles = [];
  }

  pushParticle(particle: Particle): void {
    this.particles.push(particle);
  }

  spawnParticle(
    x: number,
    y: number,
    color: string,
    type: "explosion" | "thrust" | "hit",
  ): void {
    const angle = this.random() * Math.PI * 2;
    let speed: number;
    let life: number;
    let size: number;

    switch (type) {
      case "explosion":
        speed = 80 + this.random() * 120;
        life = 0.3 + this.random() * 0.3;
        size = 3 + this.random() * 5;
        break;
      case "thrust":
        speed = 20 + this.random() * 40;
        life = 0.1 + this.random() * 0.2;
        size = 2 + this.random() * 3;
        break;
      case "hit":
        speed = 40 + this.random() * 60;
        life = 0.2 + this.random() * 0.2;
        size = 2 + this.random() * 3;
        break;
    }

    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  spawnExplosion(x: number, y: number, color: string): void {
    for (let i = 0; i < 20; i++) {
      this.spawnParticle(x, y, color, "explosion");
    }
    for (let i = 0; i < 10; i++) {
      this.spawnParticle(x, y, "#ffffff", "explosion");
    }
  }

  spawnShipDestroyedBurst(x: number, y: number, color: string): void {
    const hullColor = color || "#6ed6ff";

    const flashCount = 18;
    for (let i = 0; i < flashCount; i++) {
      const angle = (i / flashCount) * Math.PI * 2 + this.random() * 0.28;
      const speed = 95 + this.random() * 105;
      const life = 0.16 + this.random() * 0.1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 3.4 + this.random() * 3.6,
        color: this.random() > 0.45 ? "#fff4d8" : "#ffc47a",
      });
    }

    const blastRingCount = 24;
    for (let i = 0; i < blastRingCount; i++) {
      const angle = (i / blastRingCount) * Math.PI * 2 + this.random() * 0.24;
      const spawnRadius = 11 + this.random() * 6;
      const speed = 40 + this.random() * 55;
      const life = 0.24 + this.random() * 0.16;
      this.particles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2.6 + this.random() * 3.4,
        color: this.random() > 0.4 ? "#ff7c3c" : "#ffb55f",
      });
    }

    const plasmaShardCount = 12;
    for (let i = 0; i < plasmaShardCount; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 75 + this.random() * 95;
      const life = 0.32 + this.random() * 0.2;
      this.particles.push({
        x: x + (this.random() - 0.5) * 9,
        y: y + (this.random() - 0.5) * 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 2.6,
        color: this.random() > 0.3 ? hullColor : "#d8f4ff",
      });
    }

    this.spawnShipDebris(x, y, hullColor);
  }

  spawnNitroParticle(x: number, y: number, color: string): void {
    const angle = this.random() * Math.PI * 2;
    const speed = 100 + this.random() * 80;
    const life = 0.2 + this.random() * 0.15;
    const size = 4 + this.random() * 4;

    this.particles.push({
      x: x + (this.random() - 0.5) * 8,
      y: y + (this.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  spawnDashParticles(
    x: number,
    y: number,
    shipAngle: number,
    color: string,
    count: number = 12,
  ): void {
    const backAngle = shipAngle + Math.PI;
    const spreadAngle = Math.PI / 3;

    for (let i = 0; i < count; i++) {
      const particleAngle = backAngle + (this.random() - 0.5) * spreadAngle;
      const speed = 150 + this.random() * 100;
      const life = 0.15 + this.random() * 0.15;
      const size = 3 + this.random() * 3;

      const spawnDistance = 10;
      const spawnX = x + Math.cos(backAngle) * spawnDistance;
      const spawnY = y + Math.sin(backAngle) * spawnDistance;

      this.particles.push({
        x: spawnX + (this.random() - 0.5) * 6,
        y: spawnY + (this.random() - 0.5) * 6,
        vx: Math.cos(particleAngle) * speed,
        vy: Math.sin(particleAngle) * speed,
        life,
        maxLife: life,
        size,
        color: color || "#44aaff",
      });
    }

    for (let i = 0; i < 5; i++) {
      const particleAngle =
        backAngle + (this.random() - 0.5) * (spreadAngle * 0.5);
      const speed = 200 + this.random() * 100;
      const life = 0.1 + this.random() * 0.1;
      const size = 2 + this.random() * 2;

      const spawnDistance = 8;
      const spawnX = x + Math.cos(backAngle) * spawnDistance;
      const spawnY = y + Math.sin(backAngle) * spawnDistance;

      this.particles.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(particleAngle) * speed,
        vy: Math.sin(particleAngle) * speed,
        life,
        maxLife: life,
        size,
        color: "#ffffff",
      });
    }
  }

  spawnPilotDashBurstParticles(
    x: number,
    y: number,
    pilotAngle: number,
    color: string,
  ): void {
    const burstColor = color || "#c8ecff";
    const burstCount = 16;
    for (let i = 0; i < burstCount; i++) {
      const ringAngle = (i / burstCount) * Math.PI * 2;
      const spawnRadius = 2 + this.random() * 2.2;
      const speed = 70 + this.random() * 70;
      const life = 0.08 + this.random() * 0.08;
      const size = 1.2 + this.random() * 2.0;
      const isCore = i % 4 === 0;

      this.particles.push({
        x: x + Math.cos(ringAngle) * spawnRadius,
        y: y + Math.sin(ringAngle) * spawnRadius,
        vx: Math.cos(ringAngle) * speed,
        vy: Math.sin(ringAngle) * speed,
        life,
        maxLife: life,
        size,
        color: isCore ? "#ffffff" : burstColor,
      });
    }

    const releaseAngle = pilotAngle + Math.PI;
    const releaseSpread = Math.PI * 0.85;
    for (let i = 0; i < 7; i++) {
      const angle = releaseAngle + (this.random() - 0.5) * releaseSpread;
      const speed = 55 + this.random() * 45;
      const life = 0.11 + this.random() * 0.09;
      const size = 1.6 + this.random() * 1.8;

      this.particles.push({
        x: x + (this.random() - 0.5) * 3,
        y: y + (this.random() - 0.5) * 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size,
        color: "#d8f4ff",
      });
    }
  }

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    const pieceCount = 4 + Math.floor(this.random() * 4);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 30 + this.random() * 50;
      const life = 0.5 + this.random() * 0.5;
      const pieceSize = size * 0.2 + this.random() * (size * 0.3);

      this.particles.push({
        x: x + Math.cos(angle) * size * 0.3,
        y: y + Math.sin(angle) * size * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: pieceSize,
        color,
      });
    }

    for (let i = 0; i < 8; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 20 + this.random() * 40;
      const life = 0.3 + this.random() * 0.4;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 3,
        color: "#888888",
      });
    }
  }

  spawnShipDebris(x: number, y: number, color: string): void {
    const pieceCount = 8 + Math.floor(this.random() * 4);

    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 50 + this.random() * 80;
      const life = 0.8 + this.random() * 0.6;
      const pieceSize = 4 + this.random() * 6;

      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: pieceSize,
        color,
      });
    }

    for (let i = 0; i < 6; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 40 + this.random() * 60;
      const life = 0.6 + this.random() * 0.5;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 3 + this.random() * 4,
        color: "#aaaaaa",
      });
    }

    for (let i = 0; i < 15; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 60 + this.random() * 100;
      const life = 0.3 + this.random() * 0.3;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + this.random() * 2,
        color: "#ffdd00",
      });
    }
  }

  spawnShieldBreakDebris(x: number, y: number): void {
    const pieceCount = 8 + Math.floor(this.random() * 4);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 40 + this.random() * 60;
      const life = 0.4 + this.random() * 0.4;

      this.particles.push({
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 30,
        life,
        maxLife: life,
        size: 3 + this.random() * 4,
        color: "#88ccff",
      });
    }
  }

  spawnMineExplosion(x: number, y: number, radius: number): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.3,
      maxLife: 0.3,
      size: radius,
      color: "#ffffff",
    });

    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.4 + i * 0.1,
        maxLife: 0.4 + i * 0.1,
        size: radius * (0.3 + i * 0.2),
        color: i === 0 ? "#ffffff" : i === 1 ? "#ffffcc" : "#ffcccc",
      });
    }

    const debrisCount = 20;
    for (let i = 0; i < debrisCount; i++) {
      const angle = (i / debrisCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 50 + this.random() * 100;
      const life = 0.3 + this.random() * 0.3;

      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 3,
        color: this.random() > 0.5 ? "#ffffff" : "#ffcccc",
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const lifeT = p.life / p.maxLife;
      const alpha = lifeT > 0.66 ? 0.95 : lifeT > 0.33 ? 0.72 : 0.48;
      const radius = p.size * Math.max(0.35, lifeT);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "rgba(18, 20, 26, 0.8)";
      ctx.lineWidth = Math.max(0.8, radius * 0.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (radius > 2.2) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(
          p.x - radius * 0.24,
          p.y - radius * 0.22,
          radius * 0.32,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
