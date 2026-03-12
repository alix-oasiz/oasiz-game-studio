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

  private withAlpha(color: string, alpha: number): string {
    if (!color.startsWith("#")) return color;
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((part) => part + part)
        .join("");
    }
    if (hex.length !== 6) return color;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return color;
    }
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  drawTurret(state: TurretState): void {
    const { ctx } = this;
    const { x, y, angle, isTracking, orbitRadius } = state;

    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isTracking ? "#f7756f" : "#96a2be";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius - 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#3a3f4e";
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8089a1";
    ctx.beginPath();
    ctx.arc(-3, -4, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(angle);

    ctx.fillStyle = isTracking ? "#f05c56" : "#7a8398";
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2.5;
    ctx.fillRect(15, -6, 25, 12);
    ctx.strokeRect(15, -6, 25, 12);

    ctx.fillStyle = isTracking ? "#ffd6bd" : "#d0d7e8";
    ctx.fillRect(20, -3, 15, 6);
    ctx.strokeRect(20, -3, 15, 6);

    ctx.fillStyle = "#272c3a";
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isTracking ? "#ff6b65" : "#8da0ff";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= TURRET BULLET RENDERING =============


  drawTurretBullet(state: TurretBulletState): void {
    const { ctx } = this;
    const { x, y, vx, vy, exploded, explosionTime, explosionRadius } = state;
    const nowMs = this.getNowMs();

    if (exploded && explosionTime > 0) {
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const blastRadius = Number.isFinite(explosionRadius) ? explosionRadius : 100;
      const radius = blastRadius * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      ctx.strokeStyle = this.withAlpha("#12141a", alpha);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = this.withAlpha("#ffd089", alpha * 0.95);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();

      const rayCount = 10;
      ctx.strokeStyle = this.withAlpha("#ffe3b5", alpha * 0.85);
      ctx.lineWidth = 2;
      for (let i = 0; i < rayCount; i++) {
        const rayAngle = (i / rayCount) * Math.PI * 2;
        const inner = radius * 0.3;
        const outer = radius * (0.82 + (i % 2) * 0.12);
        ctx.beginPath();
        ctx.moveTo(Math.cos(rayAngle) * inner, Math.sin(rayAngle) * inner);
        ctx.lineTo(Math.cos(rayAngle) * outer, Math.sin(rayAngle) * outer);
        ctx.stroke();
      }

      ctx.fillStyle = this.withAlpha("#ffffff", alpha);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      const angle = Math.atan2(vy, vx);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.fillStyle = "#f57f30";
      ctx.strokeStyle = "#12141a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffd989";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 168, 92, 0.55)";
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

    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size * 0.8,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();

    ctx.strokeStyle = "#fff8de";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size * 0.84,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();

    const glowColor = this.powerUpSprites.getGlowColor(type);
    ctx.fillStyle = this.withAlpha(glowColor, 0.24);
    ctx.beginPath();
    ctx.roundRect(-size * 0.58, -size * 0.58, size * 1.16, size * 1.16, 7);
    ctx.fill();
    const drewSprite = this.powerUpSprites.drawPowerUp(ctx, type, size);

    if (!drewSprite) {
      ctx.fillStyle = glowColor;
      ctx.strokeStyle = "#12141a";
      ctx.lineWidth = 2;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeRect(-size / 2, -size / 2, size, size);
    }

    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);

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

    ctx.fillStyle = "rgba(255, 74, 132, 0.55)";
    ctx.fillRect(0, -beamWidth / 2, beamLength, beamWidth);

    ctx.fillStyle = "rgba(255, 231, 239, 0.88)";
    ctx.fillRect(0, -beamWidth / 4, beamLength, beamWidth / 2);

    ctx.strokeStyle = "rgba(20, 20, 26, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -beamWidth / 2);
    ctx.lineTo(beamLength, -beamWidth / 2);
    ctx.moveTo(0, beamWidth / 2);
    ctx.lineTo(beamLength, beamWidth / 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 194, 220, 0.7)";
    ctx.lineWidth = 1.1;
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

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // ============= SHIELD RENDERING =============


  drawShield(x: number, y: number, hits: number): void {
    const { ctx } = this;

    const isDamaged = hits >= 1;
    const color = isDamaged ? "#ff6b6b" : "#67a8ff";

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = this.withAlpha(color, 0.24);
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.ellipse(0, 0, SHIP_SHIELD_RADII.x, SHIP_SHIELD_RADII.y, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([7, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, SHIP_SHIELD_RADII.x, SHIP_SHIELD_RADII.y, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

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

    ctx.fillStyle = "#888888";
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#aaaaaa";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#666666";
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const tailX = -10;
    const time = this.getNowMs() * 0.02;

    ctx.fillStyle = "#ff8800";
    ctx.globalAlpha = 0.7 + Math.sin(time) * 0.2;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, -3);
    ctx.lineTo(tailX - 12 - Math.sin(time * 2) * 4, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, 3);
    ctx.closePath();
    ctx.fill();

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

    ctx.fillStyle = "rgba(46, 50, 64, 0.45)";
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

