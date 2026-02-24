import {
  AsteroidState,
  GAME_CONFIG,
  PilotState,
  PlayerColor,
  ProjectileState,
  ShipState,
} from "../../../types";
import {
  SHIP_JOUST_LOCAL_POINTS,
  SHIP_VISUAL_REFERENCE_SIZE,
} from "../../../../shared/geometry/ShipRenderAnchors";
import { PILOT_EFFECT_LOCAL_POINTS } from "../../../../shared/geometry/PilotRenderAnchors";
import { EntitySpriteStore } from "../assets/EntitySpriteStore";

interface EntityVisualsDeps {
  bumpPilotDebrisWithBody: (
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
  ) => void;
  getPilotDebrisScaleFactor: () => number;
  drawShield: (x: number, y: number, hits: number) => void;
  getNowMs: () => number;
  getEffectBlurPx: (
    baseBlurAtUnitScale: number,
    minBlur: number,
    maxBlur: number,
  ) => number;
}

export class EntityVisualsRenderer {
  private static readonly PILOT_DEBRIS_BASELINE_BUMP_RADIUS = 8.2;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private entitySprites: EntitySpriteStore,
    private deps: EntityVisualsDeps,
  ) {}

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

  drawShip(
    state: ShipState,
    color: PlayerColor,
    shieldHits?: number,
    laserCharges?: number,
    laserMaxCharges?: number,
    laserCooldownProgress?: number,
    scatterCharges?: number,
    scatterCooldownProgress?: number,
    joustLeftActive?: boolean,
    joustRightActive?: boolean,
    homingMissileCharges?: number,
  ): void {
    const { ctx } = this;
    const { x, y, angle, invulnerableUntil } = state;
    const nowMs = this.deps.getNowMs();
    const isInvulnerable = nowMs < invulnerableUntil;
    const size = SHIP_VISUAL_REFERENCE_SIZE;
    this.deps.bumpPilotDebrisWithBody(
      x,
      y,
      Math.max(6, size * 0.78),
      state.vx,
      state.vy,
    );

    ctx.save();
    ctx.translate(x, y);

    if (
      shieldHits !== undefined &&
      shieldHits < GAME_CONFIG.POWERUP_SHIELD_HITS
    ) {
      this.deps.drawShield(0, 0, shieldHits);
    }

    if (laserCooldownProgress !== undefined && laserCooldownProgress < 1) {
      ctx.strokeStyle = "#ff0066";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        22,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * laserCooldownProgress,
      );
      ctx.stroke();
    }

    ctx.rotate(angle);

    if (laserCharges !== undefined && laserCharges > 0) {
      const maxCharges = Math.max(
        1,
        laserMaxCharges ?? GAME_CONFIG.POWERUP_LASER_CHARGES,
      );
      const dotSize = 3.5;
      const arcRadius = size * 1.3;
      const arcAngle = Math.PI * 0.6;

      for (let i = 0; i < maxCharges; i++) {
        const lerpT = maxCharges <= 1 ? 0.5 : i / (maxCharges - 1);
        const angleOffset = (lerpT - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        const isAvailable = i < laserCharges;
        ctx.fillStyle = isAvailable ? "#ff0044" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ff6688" : "#222222";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (scatterCharges !== undefined && scatterCharges > 0) {
      const maxCharges = GAME_CONFIG.POWERUP_SCATTER_CHARGES;
      const ballSize = 5;
      const arcRadius = size * 1.3;
      const arcAngle = Math.PI * 0.6;

      for (let i = 0; i < maxCharges; i++) {
        const angleOffset = (i / (maxCharges - 1) - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        const isAvailable = i < scatterCharges;

        ctx.fillStyle = isAvailable ? "#00ff44" : "#333333";
        ctx.strokeStyle = isAvailable ? "#88ffaa" : "#222222";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(dotX, dotY, ballSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isAvailable) {
          ctx.fillStyle = "#ff0044";
          ctx.beginPath();
          ctx.arc(dotX, dotY, ballSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (
      laserCharges === undefined &&
      scatterCharges === undefined &&
      homingMissileCharges === undefined &&
      joustLeftActive === undefined &&
      joustRightActive === undefined &&
      state.maxAmmo > 0
    ) {
      const maxAmmo = state.maxAmmo;
      const currentAmmo = state.ammo;
      const dotRadius = 2.4;
      const orbitRadius = size * 1.3;
      const rotation = nowMs * 0.0008;

      for (let i = 0; i < maxAmmo; i++) {
        const angleOffset = (i / maxAmmo) * Math.PI * 2;
        const totalAngle = rotation + angleOffset;
        const dotX = Math.cos(Math.PI + totalAngle) * orbitRadius;
        const dotY = Math.sin(Math.PI + totalAngle) * orbitRadius;

        const isAvailable = i < currentAmmo;
        ctx.fillStyle = isAvailable ? "#b9ac68" : "#343434";
        ctx.strokeStyle = isAvailable ? "#8f844f" : "#262626";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (homingMissileCharges !== undefined && homingMissileCharges > 0) {
      const rotation = nowMs * 0.001;
      const orbitRadius = size * 1.4;
      const ballX = Math.cos(Math.PI + rotation) * orbitRadius;
      const ballY = Math.sin(Math.PI + rotation) * orbitRadius;

      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = this.deps.getEffectBlurPx(15, 7, 22);
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff6688";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (joustLeftActive !== undefined || joustRightActive !== undefined) {
      const swordLength = GAME_CONFIG.POWERUP_JOUST_SIZE;
      const swordWidth = GAME_CONFIG.POWERUP_JOUST_WIDTH;

      ctx.shadowColor = "#00ff44";
      ctx.shadowBlur = this.deps.getEffectBlurPx(20, 8, 28);

      if (joustLeftActive) {
        const startX = SHIP_JOUST_LOCAL_POINTS.left.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.left.y;
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);
        ctx.restore();
      }

      if (joustRightActive) {
        const startX = SHIP_JOUST_LOCAL_POINTS.right.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.right.y;
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);
        ctx.restore();
      }

      ctx.shadowBlur = 0;
    }

    const shouldFlash = isInvulnerable && Math.floor(nowMs / 100) % 2 === 0;
    if (shouldFlash) {
      ctx.globalAlpha = 0.5;
    }

    this.entitySprites.drawEntity(this.ctx, "ship", {
      "slot-primary": color.primary,
    });

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawPilot(state: PilotState, color: PlayerColor): void {
    const { ctx } = this;
    const { x, y, angle, survivalProgress } = state;
    const nowMs = this.deps.getNowMs();
    const isFlashing =
      survivalProgress > 0.6 && Math.floor(nowMs / 150) % 2 === 0;
    const pilotScale = this.deps.getPilotDebrisScaleFactor();
    this.deps.bumpPilotDebrisWithBody(
      x,
      y,
      EntityVisualsRenderer.PILOT_DEBRIS_BASELINE_BUMP_RADIUS * pilotScale,
      state.vx,
      state.vy,
    );

    ctx.save();
    ctx.translate(x, y);

    if (isFlashing) {
      ctx.globalAlpha = 0.5;
    }

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      15,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * survivalProgress,
    );
    ctx.stroke();

    ctx.save();
    ctx.rotate(angle);

    const swimIntensity = this.getPilotSwimArmIntensity(state);
    const swimPhase = nowMs * 0.021;

    this.entitySprites.drawEntity(this.ctx, "pilot", {
      "slot-primary": color.primary,
      "slot-secondary": "#f4fbff",
      "slot-tertiary": "#1d2636",
      "slot-outline": "#ffffff",
    });
    this.drawPilotSwimArms(ctx, swimPhase, swimIntensity, color.primary);

    ctx.restore();
    ctx.restore();
  }

  drawAsteroid(state: AsteroidState): void {
    const { ctx } = this;
    const { x, y, angle, vertices } = state;
    const isGrey = state.variant === "GREY";
    const bodyColor = isGrey
      ? GAME_CONFIG.GREY_ASTEROID_COLOR
      : GAME_CONFIG.ASTEROID_COLOR;
    const strokeColor = isGrey ? "#d6dce8" : "#ffd084";
    const facetColor = isGrey ? "#eff3fa" : "#ffe8b5";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = "#12141a";
    ctx.lineWidth = 4;

    ctx.beginPath();
    if (vertices.length > 0) {
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
    } else {
      ctx.arc(0, 0, state.size, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (vertices.length >= 4) {
      ctx.fillStyle = this.withAlpha(facetColor, 0.35);
      ctx.beginPath();
      const facetA = vertices[0];
      const facetB = vertices[Math.floor(vertices.length * 0.33)];
      const facetC = vertices[Math.floor(vertices.length * 0.66)];
      ctx.moveTo(facetA.x * 0.45, facetA.y * 0.45);
      ctx.lineTo(facetB.x * 0.32, facetB.y * 0.32);
      ctx.lineTo(facetC.x * 0.28, facetC.y * 0.28);
      ctx.closePath();
      ctx.fill();
    }

    const craterCount = Math.min(3, Math.max(1, vertices.length));
    for (let i = 0; i < craterCount; i++) {
      const source = vertices[i % Math.max(1, vertices.length)] ?? {
        x: state.size * 0.65,
        y: 0,
      };
      const craterX = source.x * 0.3 - 2 + i * 1.8;
      const craterY = source.y * 0.26 + (i - 1) * 1.4;
      const craterR = Math.max(2.4, Math.abs(source.x) * (0.14 + i * 0.04));
      ctx.fillStyle = this.withAlpha("#17191f", 0.32);
      ctx.beginPath();
      ctx.arc(craterX, craterY, craterR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.withAlpha("#f3f5f9", isGrey ? 0.25 : 0.18);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(craterX - craterR * 0.22, craterY - craterR * 0.18, craterR * 0.62, 0, Math.PI * 1.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawProjectile(state: ProjectileState, devModeEnabled: boolean): void {
    const { ctx } = this;
    const { x, y, vx, vy } = state;
    const angle = Math.atan2(vy, vx);
    const glowRadius = Math.max(
      0.1,
      state.visualGlowRadius ?? GAME_CONFIG.PROJECTILE_VISUAL_GLOW_RADIUS,
    );
    const coreRadius = Math.max(0.1, state.radius ?? GAME_CONFIG.PROJECTILE_RADIUS);
    const tailRadiusX = coreRadius * 1.9;
    const tailRadiusY = coreRadius * 0.62;
    const tailBackX = coreRadius - tailRadiusX * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = "rgba(255, 236, 196, 0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 228, 160, 0.75)";
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(coreRadius, 0);
    ctx.lineTo(tailBackX, -tailRadiusY * 1.3);
    ctx.lineTo(tailBackX, tailRadiusY * 1.3);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#17191f";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffe9b3";
    ctx.beginPath();
    ctx.arc(coreRadius * 0.22, -coreRadius * 0.16, coreRadius * 0.34, 0, Math.PI * 2);
    ctx.fill();

    if (devModeEnabled) {
      ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private getPilotSwimArmIntensity(state: PilotState): number {
    const speed = Math.hypot(state.vx, state.vy);
    return Math.max(0.7, Math.min(1.25, 0.72 + speed / 120));
  }

  private drawPilotSwimArms(
    ctx: CanvasRenderingContext2D,
    phase: number,
    intensity: number,
    armColor: string,
  ): void {
    const armFrequency = phase * (1 + (intensity - 0.7) * 0.55);
    this.drawSinglePilotSwimArm(
      ctx,
      PILOT_EFFECT_LOCAL_POINTS.armLeft.x,
      PILOT_EFFECT_LOCAL_POINTS.armLeft.y,
      armFrequency,
      intensity,
      armColor,
      -1,
    );
    this.drawSinglePilotSwimArm(
      ctx,
      PILOT_EFFECT_LOCAL_POINTS.armRight.x,
      PILOT_EFFECT_LOCAL_POINTS.armRight.y,
      armFrequency + Math.PI,
      intensity,
      armColor,
      1,
    );
  }

  private drawSinglePilotSwimArm(
    ctx: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    phase: number,
    intensity: number,
    armColor: string,
    verticalDirection: 1 | -1,
  ): void {
    const lateralBase = 8.4 + intensity * 2.3;
    const lateralSwing = Math.sin(phase) * (2.8 + intensity * 1.2);
    const trailingPull = Math.cos(phase) * (2.2 + intensity * 0.9);
    const controlLift = Math.sin(phase * 0.5) * 1.2;

    const endX = anchorX - 1.6 - trailingPull;
    const endY = anchorY + verticalDirection * (lateralBase + lateralSwing);
    const controlX = anchorX - 1.1 - trailingPull * 0.45;
    const controlY =
      anchorY +
      verticalDirection * (lateralBase * 0.58 + lateralSwing * 0.72) +
      controlLift;

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.lineWidth = 3.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(226, 246, 255, 0.84)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = armColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, 1.45 + intensity * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = armColor;
    ctx.fill();
  }
}
