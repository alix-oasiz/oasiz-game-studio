import {
  GAME_CONFIG,
  TurretState,
  TurretBulletState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
} from "../../../types";
import { SHIP_SHIELD_RADII } from "../../../../shared/geometry/ShipRenderAnchors";
import { projectRayToArenaWall } from "../../../../shared/sim/physics/geometryMath";
import { PowerUpSpriteStore } from "../assets/PowerUpSpriteStore";
import { drawMineBody, drawMineExplosionEffect } from "./RendererVisualPrimitives";

export class CombatVisualsRenderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private powerUpSprites: PowerUpSpriteStore,
    private getNowMs: () => number,
    private getEffectBlurPx: (
      baseBlurAtUnitScale: number,
      minBlur: number,
      maxBlur: number,
    ) => number,
  ) {}

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  drawTurret(state: TurretState): void {
    const { ctx } = this;
    const { x, y, angle, isTracking, orbitRadius } = state;

    ctx.save();
    ctx.translate(x, y);

    // Draw orbit ring (visual base)
    ctx.strokeStyle = "rgba(100, 100, 120, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Orbit ring glow
    ctx.shadowColor = "#6666ff";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(100, 100, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw turret base
    ctx.fillStyle = "#444455";
    ctx.strokeStyle = "#666677";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw turret barrel (rotates toward target)
    ctx.rotate(angle);

    // Barrel glow when tracking
    if (isTracking) {
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 15;
    }

    // Barrel
    ctx.fillStyle = isTracking ? "#ff6666" : "#888899";
    ctx.fillRect(15, -6, 25, 12);

    // Barrel detail
    ctx.fillStyle = "#555566";
    ctx.fillRect(18, -4, 20, 8);

    ctx.shadowBlur = 0;

    // Center hub
    ctx.fillStyle = "#333344";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    // Center glow
    ctx.fillStyle = isTracking ? "#ff4444" : "#6666ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ============= TURRET BULLET RENDERING =============


  drawTurretBullet(state: TurretBulletState): void {
    const { ctx } = this;
    const { x, y, vx, vy, exploded, explosionTime, explosionRadius } = state;
    const nowMs = this.getNowMs();

    if (exploded && explosionTime > 0) {
      // Draw explosion effect
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const blastRadius = Number.isFinite(explosionRadius) ? explosionRadius : 100;
      const radius = blastRadius * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 200, 150, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Normal bullet
      const angle = Math.atan2(vy, vx);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Glow
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 15;

      // Bullet body
      ctx.fillStyle = "#ff6600";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Trail
      ctx.fillStyle = "rgba(255, 100, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-15, -3);
      ctx.lineTo(-15, 3);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }


  drawPowerUp(state: PowerUpState): void {
    const { ctx } = this;
    const { x, y, type, remainingTimeFraction } = state;
    const size = GAME_CONFIG.POWERUP_SIZE;
    const progress = Math.min(1, Math.max(0, remainingTimeFraction));

    ctx.save();
    ctx.translate(x, y);

    // Draw despawn ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size * 0.8,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();

    const glowColor = this.powerUpSprites.getGlowColor(type);
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = this.getEffectBlurPx(15, 7, 22);

    const drewSprite = this.powerUpSprites.drawPowerUp(ctx, type, size);
    ctx.shadowBlur = 0;

    if (!drewSprite) {
      ctx.fillStyle = glowColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeRect(-size / 2, -size / 2, size, size);
    }

    ctx.restore();
  }

  // ============= LASER BEAM RENDERING =============


  drawLaserBeam(state: LaserBeamState, beamWidthOverride?: number): void {
    const { ctx } = this;
    const { x, y, angle, id } = state;
    const beamEnd = projectRayToArenaWall(
      { x, y },
      angle,
      GAME_CONFIG.ARENA_WIDTH,
      GAME_CONFIG.ARENA_HEIGHT,
    );
    const beamLength = Math.hypot(beamEnd.x - x, beamEnd.y - y);
    const beamWidth = Number.isFinite(beamWidthOverride)
      ? Math.max(1, beamWidthOverride as number)
      : GAME_CONFIG.POWERUP_BEAM_WIDTH;
    // Use deterministic offsets based on beam id to avoid flickering
    const baseOffset = (id.charCodeAt(id.length - 1) % 10) / 10;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Main beam gradient
    const gradient = ctx.createLinearGradient(
      0,
      -beamWidth / 2,
      0,
      beamWidth / 2,
    );
    gradient.addColorStop(0, "rgba(255, 0, 100, 0.3)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(1, "rgba(255, 0, 100, 0.3)");

    // Draw main beam
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -beamWidth / 2, beamLength, beamWidth);

    // Core beam (bright white center)
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(0, -beamWidth / 4, beamLength, beamWidth / 2);

    // Wire-like effect (sharp lines) - deterministic based on id
    ctx.strokeStyle = "rgba(255, 150, 200, 0.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const offset = (((baseOffset + i * 0.2) % 1) - 0.5) * beamWidth * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(
        beamLength,
        offset + Math.sin(i * 1.5 + baseOffset * Math.PI) * 5,
      );
      ctx.stroke();
    }

    // Glow effect at beam origin
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    glowGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    glowGradient.addColorStop(0.5, "rgba(255, 0, 100, 0.5)");
    glowGradient.addColorStop(1, "transparent");
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= SHIELD RENDERING =============


  drawShield(x: number, y: number, hits: number): void {
    const { ctx } = this;

    // Color based on hits: 0 = blue, 1 = red
    const isDamaged = hits >= 1;
    const alpha = 0.4;
    const color = isDamaged
      ? `rgba(255, 50, 50, ${alpha})`
      : `rgba(50, 150, 255, ${alpha})`;
    const glowColor = isDamaged ? "#ff3333" : "#3399ff";

    ctx.save();
    ctx.translate(x, y);

    // Glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = this.getEffectBlurPx(20, 8, 28);

    // Draw oval shield
    ctx.fillStyle = color;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(0, 0, SHIP_SHIELD_RADII.x, SHIP_SHIELD_RADII.y, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }


  drawMineState(state: MineState): void {
    const { x, y, exploded, explosionTime } = state;
    const nowMs = this.getNowMs();

    // Check if mine has exploded
    if (exploded && explosionTime > 0) {
      // Draw explosion effect on client - lasts 500ms
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const radius =
        GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      drawMineExplosionEffect(this.ctx, x, y, radius, alpha);
      return;
    }

    drawMineBody(this.ctx, x, y, nowMs, GAME_CONFIG.POWERUP_MINE_SIZE);
  }


  drawHomingMissile(state: HomingMissileState): void {
    const { ctx } = this;
    const { x, y, angle } = state;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur = 15;

    // Rocket body (metallic gray)
    ctx.fillStyle = "#888888";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rocket nose (pointed)
    ctx.fillStyle = "#aaaaaa";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();

    // Fins
    ctx.fillStyle = "#666666";
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Fire and smoke particles at the tail
    const tailX = -10;
    const time = this.getNowMs() * 0.02;

    // Fire (orange/yellow)
    ctx.fillStyle = "#ff8800";
    ctx.globalAlpha = 0.7 + Math.sin(time) * 0.2;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, -3);
    ctx.lineTo(tailX - 12 - Math.sin(time * 2) * 4, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, 3);
    ctx.closePath();
    ctx.fill();

    // Inner fire (yellow)
    ctx.fillStyle = "#ffee00";
    ctx.globalAlpha = 0.8 + Math.sin(time * 1.2) * 0.15;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX - 5 - Math.sin(time * 1.8) * 2, -2);
    ctx.lineTo(tailX - 8 - Math.sin(time * 2.2) * 3, 0);
    ctx.lineTo(tailX - 5 - Math.sin(time * 1.8) * 2, 2);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;

    // Smoke trail (gray)
    ctx.fillStyle = "#555555";
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) {
      const offset = (time * 0.5 + i * 2) % 8;
      const smokeX = tailX - 12 - offset * 2;
      const smokeSize = 2 + offset * 0.5;
      ctx.beginPath();
      ctx.arc(smokeX, Math.sin(time + i) * 2, smokeSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

