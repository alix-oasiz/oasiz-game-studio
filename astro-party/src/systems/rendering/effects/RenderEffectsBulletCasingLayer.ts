import { GAME_CONFIG } from "../../../types";

interface BulletCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  angle: number;
  angularVelocity: number;
  shimmerOffset: number;
}

export class RenderEffectsBulletCasingLayer {
  private static readonly MAX_BULLET_CASINGS = 96;
  private casings: BulletCasing[] = [];

  constructor(private random: () => number) {}

  clear(): void {
    this.casings = [];
  }

  spawnBulletCasing(
    x: number,
    y: number,
    shotAngle: number,
    inheritedVx: number = 0,
    inheritedVy: number = 0,
  ): void {
    const ejectionAngle =
      shotAngle + Math.PI / 2 + (this.random() - 0.5) * 0.5;
    const ejectionSpeed = 28 + this.random() * 34;
    const casingScale = 1.5;

    this.casings.push({
      x,
      y,
      vx: Math.cos(ejectionAngle) * ejectionSpeed + inheritedVx * 0.08,
      vy: Math.sin(ejectionAngle) * ejectionSpeed + inheritedVy * 0.08,
      width: (4.6 + this.random() * 1.6) * casingScale,
      height: (2 + this.random() * 0.8) * casingScale,
      angle: this.random() * Math.PI * 2,
      angularVelocity: (this.random() - 0.5) * 7,
      shimmerOffset: this.random() * Math.PI * 2,
    });

    while (this.casings.length > RenderEffectsBulletCasingLayer.MAX_BULLET_CASINGS) {
      this.casings.shift();
    }
  }

  update(dt: number): void {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const casing = this.casings[i];
      casing.x += casing.vx * dt;
      casing.y += casing.vy * dt;
      casing.vx *= 0.993;
      casing.vy = casing.vy * 0.993 + 2.4 * dt;
      casing.angle += casing.angularVelocity * dt;
      casing.angularVelocity *= 0.995;

      if (casing.x < 0) {
        casing.x = 0;
        casing.vx = Math.abs(casing.vx) * 0.45;
      } else if (casing.x > GAME_CONFIG.ARENA_WIDTH) {
        casing.x = GAME_CONFIG.ARENA_WIDTH;
        casing.vx = -Math.abs(casing.vx) * 0.45;
      }

      if (casing.y < 0) {
        casing.y = 0;
        casing.vy = Math.abs(casing.vy) * 0.45;
      } else if (casing.y > GAME_CONFIG.ARENA_HEIGHT) {
        casing.y = GAME_CONFIG.ARENA_HEIGHT;
        casing.vy = -Math.abs(casing.vy) * 0.45;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
    for (const casing of this.casings) {
      const shimmer = 0.78 + 0.22 * Math.sin(nowMs * 0.006 + casing.shimmerOffset);
      ctx.save();
      ctx.translate(casing.x, casing.y);
      ctx.rotate(casing.angle);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(200, 160, 80, 1)";
      ctx.fillRect(
        -casing.width * 0.5,
        -casing.height * 0.5,
        casing.width,
        casing.height,
      );
      ctx.fillStyle = "rgba(255, 225, 165, " + shimmer + ")";
      ctx.fillRect(
        -casing.width * 0.34,
        -casing.height * 0.34,
        casing.width * 0.52,
        casing.height * 0.5,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
