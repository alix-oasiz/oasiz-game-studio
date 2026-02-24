import { EntitySpriteStore } from "./assets/EntitySpriteStore";
import { RenderEffectsBulletCasingLayer } from "./effects/RenderEffectsBulletCasingLayer";
import { RenderEffectsParticleLayer } from "./effects/RenderEffectsParticleLayer";
import { RenderEffectsPilotDebrisLayer } from "./effects/RenderEffectsPilotDebrisLayer";

export class RenderEffectsSystem {
  private readonly particles: RenderEffectsParticleLayer;
  private readonly bulletCasings: RenderEffectsBulletCasingLayer;
  private readonly pilotDebris: RenderEffectsPilotDebrisLayer;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private entitySprites: EntitySpriteStore,
    private random: () => number,
    private getNowMs: () => number,
  ) {
    this.particles = new RenderEffectsParticleLayer(this.random);
    this.bulletCasings = new RenderEffectsBulletCasingLayer(this.random);
    this.pilotDebris = new RenderEffectsPilotDebrisLayer(
      this.entitySprites,
      this.random,
      (particle) => this.particles.pushParticle(particle),
    );
  }

  clear(): void {
    this.particles.clear();
    this.bulletCasings.clear();
    this.pilotDebris.clear();
  }

  spawnParticle(
    x: number,
    y: number,
    color: string,
    type: "explosion" | "thrust" | "hit",
  ): void {
    this.particles.spawnParticle(x, y, color, type);
  }

  spawnExplosion(x: number, y: number, color: string): void {
    this.particles.spawnExplosion(x, y, color);
  }

  spawnShipDestroyedBurst(x: number, y: number, color: string): void {
    this.particles.spawnShipDestroyedBurst(x, y, color);
  }

  spawnNitroParticle(x: number, y: number, color: string): void {
    this.particles.spawnNitroParticle(x, y, color);
  }

  spawnDashParticles(
    x: number,
    y: number,
    shipAngle: number,
    color: string,
    count: number = 12,
  ): void {
    this.particles.spawnDashParticles(x, y, shipAngle, color, count);
  }

  spawnPilotDashBurstParticles(
    x: number,
    y: number,
    pilotAngle: number,
    color: string,
  ): void {
    this.particles.spawnPilotDashBurstParticles(x, y, pilotAngle, color);
  }

  spawnBulletCasing(
    x: number,
    y: number,
    shotAngle: number,
    inheritedVx: number = 0,
    inheritedVy: number = 0,
  ): void {
    this.bulletCasings.spawnBulletCasing(
      x,
      y,
      shotAngle,
      inheritedVx,
      inheritedVy,
    );
  }

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    this.particles.spawnAsteroidDebris(x, y, size, color);
  }

  spawnShipDebris(x: number, y: number, color: string): void {
    this.particles.spawnShipDebris(x, y, color);
  }

  spawnPilotKillBurst(x: number, y: number, color: string): void {
    this.pilotDebris.spawnPilotKillBurst(x, y, color);
  }

  spawnPilotDeathBurst(x: number, y: number, color: string): void {
    this.pilotDebris.spawnPilotDeathBurst(x, y, color);
  }

  drawPilotDeathDebris(): void {
    this.pilotDebris.draw(this.ctx);
  }

  getPilotDebrisScaleFactor(): number {
    return this.pilotDebris.getPilotDebrisScaleFactor();
  }

  bumpPilotDebrisWithBody(
    bodyX: number,
    bodyY: number,
    bodyRadius: number,
    bodyVx: number,
    bodyVy: number,
  ): void {
    this.pilotDebris.bumpWithBody(bodyX, bodyY, bodyRadius, bodyVx, bodyVy);
  }

  updateParticles(dt: number): void {
    this.pilotDebris.update(dt);
    this.bulletCasings.update(dt);
    this.particles.update(dt);
  }

  drawBulletCasings(): void {
    this.bulletCasings.draw(this.ctx, this.getNowMs());
  }

  drawParticles(): void {
    this.particles.draw(this.ctx);
  }

  spawnShieldBreakDebris(x: number, y: number): void {
    this.particles.spawnShieldBreakDebris(x, y);
  }

  spawnMineExplosion(x: number, y: number, radius: number): void {
    this.particles.spawnMineExplosion(x, y, radius);
  }
}
