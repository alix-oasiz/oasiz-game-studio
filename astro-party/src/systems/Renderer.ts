import {
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
  Particle,
  PlayerColor,
  PLAYER_COLORS,
  GAME_CONFIG,
  MapId,
} from "../types";
import { SeededRNG } from "../../shared/sim/SeededRNG";
import { EntitySpriteStore } from "./EntitySpriteStore";
import { MapOverlayStore } from "./MapOverlayStore";
import type {
  YellowBlock,
  CenterHole,
  RepulsionZone,
} from "../../shared/sim/maps";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private screenShake = { intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
  private visualRng: SeededRNG;
  private gameTimeMs: number | null = null;

  // Dev mode visualization flag
  private devModeEnabled = false;

  // Fixed arena scaling
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private viewportWidth: number = 1;
  private viewportHeight: number = 1;
  private entitySprites = new EntitySpriteStore();
  private mapOverlays = new MapOverlayStore();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.visualRng = new SeededRNG(Date.now() >>> 0);
  }

  setVisualRng(rng: SeededRNG): void {
    this.visualRng = rng;
  }

  setGameTimeMs(nowMs: number | null): void {
    this.gameTimeMs = nowMs;
  }

  private getNowMs(): number {
    return this.gameTimeMs ?? Date.now();
  }

  private random(): number {
    return this.visualRng.next();
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const layoutWidth = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-width"),
    );
    const layoutHeight = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-height"),
    );
    const targetWidth =
      Number.isFinite(layoutWidth) && layoutWidth > 0
        ? layoutWidth
        : rect.width;
    const targetHeight =
      Number.isFinite(layoutHeight) && layoutHeight > 0
        ? layoutHeight
        : rect.height;

    const cssWidth = Math.max(1, Math.round(targetWidth));
    const cssHeight = Math.max(1, Math.round(targetHeight));
    this.viewportWidth = cssWidth;
    this.viewportHeight = cssHeight;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate scale to fit fixed arena in window while maintaining aspect ratio
    const scaleX = cssWidth / GAME_CONFIG.ARENA_WIDTH;
    const scaleY = cssHeight / GAME_CONFIG.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);

    // Center the arena
    this.offsetX = (cssWidth - GAME_CONFIG.ARENA_WIDTH * this.scale) / 2;
    this.offsetY = (cssHeight - GAME_CONFIG.ARENA_HEIGHT * this.scale) / 2;
  }

  getSize(): { width: number; height: number } {
    // Return fixed arena size (not canvas size)
    return { width: GAME_CONFIG.ARENA_WIDTH, height: GAME_CONFIG.ARENA_HEIGHT };
  }

  getScale(): number {
    return this.scale;
  }

  // Enable/disable dev mode visualization
  setDevMode(enabled: boolean): void {
    this.devModeEnabled = enabled;
  }

  // Draw homing missile detection radius (dev mode only)
  drawHomingMissileDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;

    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    // Green dashed circle for detection radius
    ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill with transparent green
    ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = "#00ff00";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("DETECT", 0, radius + 15);
    ctx.fillText(`${radius}px`, 0, radius + 28);

    ctx.restore();
  }

  // Draw mine detection radius (dev mode only)
  drawMineDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;

    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    // Green dashed circle for detection radius
    ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill with transparent green
    ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = "#00ff00";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("MINE", 0, radius + 15);
    ctx.fillText(`${radius}px`, 0, radius + 28);

    ctx.restore();
  }

  // Draw turret detection radius (dev mode only)
  drawTurretDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;

    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    // Red dashed circle for turret detection radius
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill with transparent red
    ctx.fillStyle = "rgba(255, 50, 50, 0.1)";
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff3333";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TURRET", 0, radius + 15);
    ctx.fillText(`${radius}px`, 0, radius + 28);

    ctx.restore();
  }

  // Draw turret bullet explosion radius (dev mode only)
  drawTurretBulletRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;

    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    // Orange dashed circle for bullet explosion radius
    ctx.strokeStyle = "rgba(255, 150, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill with transparent orange
    ctx.fillStyle = "rgba(255, 150, 0, 0.1)";
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff9900";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("BULLET", 0, radius + 15);
    ctx.fillText(`${radius}px`, 0, radius + 28);

    ctx.restore();
  }

  // Draw power-up magnetic radius (dev mode only)
  drawPowerUpMagneticRadius(
    x: number,
    y: number,
    radius: number,
    isActive: boolean,
  ): void {
    if (!this.devModeEnabled) return;

    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    // Purple dashed circle for magnetic radius
    ctx.strokeStyle = isActive
      ? "rgba(200, 100, 255, 0.9)"
      : "rgba(150, 80, 200, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill with transparent purple
    ctx.fillStyle = isActive
      ? "rgba(200, 100, 255, 0.15)"
      : "rgba(150, 80, 200, 0.08)";
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = isActive ? "#cc66ff" : "#9966cc";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("MAGNET", 0, radius + 15);
    ctx.fillText(`${radius}px`, 0, radius + 28);

    ctx.restore();
  }

  // ============= TURRET RENDERING =============

  drawTurret(state: import("../types").TurretState): void {
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

  drawTurretBullet(state: import("../types").TurretBulletState): void {
    const { ctx } = this;
    const { x, y, vx, vy, exploded, explosionTime } = state;
    const nowMs = this.getNowMs();

    if (exploded && explosionTime > 0) {
      // Draw explosion effect
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const radius = 100 * (0.3 + progress * 0.7); // 100px explosion radius
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

  clear(): void {
    this.ctx.fillStyle = "#0a0a12";
    this.ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  beginFrame(): void {
    this.ctx.save();

    // Apply screen shake (using pre-calculated offsets from updateScreenShake)
    if (this.screenShake.duration > 0) {
      this.ctx.translate(this.screenShake.offsetX, this.screenShake.offsetY);
    }

    // Apply arena scaling and centering
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
  }

  endFrame(): void {
    this.ctx.restore();
  }

  updateScreenShake(dt: number): void {
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= dt;

      // Calculate deterministic shake offsets using time-based sin/cos
      // This avoids Math.random() in the render loop while still giving chaotic motion
      const time = performance.now() * 0.05;
      const decay = this.screenShake.duration > 0 ? 1 : 0;
      this.screenShake.offsetX =
        Math.sin(time * 1.1) *
        Math.cos(time * 0.7) *
        this.screenShake.intensity *
        decay;
      this.screenShake.offsetY =
        Math.sin(time * 0.9) *
        Math.cos(time * 1.3) *
        this.screenShake.intensity *
        decay;

      if (this.screenShake.duration <= 0) {
        this.screenShake.intensity = 0;
        this.screenShake.offsetX = 0;
        this.screenShake.offsetY = 0;
      }
    }
  }

  getScreenShakeIntensity(): number {
    return this.screenShake.intensity;
  }

  getScreenShakeDuration(): number {
    return this.screenShake.duration;
  }

  addScreenShake(intensity: number, duration: number): void {
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity,
    );
    this.screenShake.duration = Math.max(this.screenShake.duration, duration);
  }

  clearEffects(): void {
    this.particles = [];
    this.screenShake.intensity = 0;
    this.screenShake.duration = 0;
    this.screenShake.offsetX = 0;
    this.screenShake.offsetY = 0;
  }

  // ============= SHIP RENDERING =============

  drawShip(
    state: ShipState,
    color: PlayerColor,
    shieldHits?: number,
    laserCharges?: number,
    laserCooldownProgress?: number,
    scatterCharges?: number,
    scatterCooldownProgress?: number,
    joustLeftActive?: boolean,
    joustRightActive?: boolean,
    homingMissileCharges?: number,
  ): void {
    const { ctx } = this;
    const { x, y, angle, invulnerableUntil } = state;
    const nowMs = this.getNowMs();
    const isInvulnerable = nowMs < invulnerableUntil;
    const size = 15;

    ctx.save();
    ctx.translate(x, y);

    // Draw shield if present
    if (
      shieldHits !== undefined &&
      shieldHits < GAME_CONFIG.POWERUP_SHIELD_HITS
    ) {
      this.drawShield(0, 0, shieldHits);
    }

    // Draw laser cooldown circle (outside the rotation)
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

    // Draw laser charge indicators on ship tail - arranged in arc pattern
    if (laserCharges !== undefined && laserCharges > 0) {
      const maxCharges = GAME_CONFIG.POWERUP_LASER_CHARGES;
      const dotSize = 3.5;
      const arcRadius = size * 1.3; // Distance from ship center
      const arcAngle = Math.PI * 0.6; // Total arc spread (108 degrees)

      for (let i = 0; i < maxCharges; i++) {
        // Calculate angle for this charge in the arc (spread around back of ship)
        const angleOffset = (i / (maxCharges - 1) - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        // Red if available, dark gray/black if used
        const isAvailable = i < laserCharges;
        ctx.fillStyle = isAvailable ? "#ff0044" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ff6688" : "#222222";
        ctx.lineWidth = 1;

        // Draw bullet-like shape
        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw scatter shot charge indicators on ship tail - green balls with red centers
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

        // Green ball background
        ctx.fillStyle = isAvailable ? "#00ff44" : "#333333";
        ctx.strokeStyle = isAvailable ? "#88ffaa" : "#222222";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(dotX, dotY, ballSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Red center dot
        if (isAvailable) {
          ctx.fillStyle = "#ff0044";
          ctx.beginPath();
          ctx.arc(dotX, dotY, ballSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw ammo indicators on ship tail (yellow dots) - rotating around ship
    // Only show when no laser/scatter/homing/joust power-up is active
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
      const dotSize = 3.5;
      const orbitRadius = size * 1.3; // Distance from ship center
      const rotation = nowMs * 0.0008; // Slow rotation like missile

      for (let i = 0; i < maxAmmo; i++) {
        // Calculate angle for this ammo rotating around the back of ship
        const angleOffset = (i / maxAmmo) * Math.PI * 2;
        const totalAngle = rotation + angleOffset;
        const dotX = Math.cos(Math.PI + totalAngle) * orbitRadius;
        const dotY = Math.sin(Math.PI + totalAngle) * orbitRadius;

        // Yellow if available, dark gray if used
        const isAvailable = i < currentAmmo;
        ctx.fillStyle = isAvailable ? "#ffee00" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ffee88" : "#222222";
        ctx.lineWidth = 1;

        // Draw bullet-like shape
        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw Homing Missile indicator (red ball on back) - rotates slowly
    if (homingMissileCharges !== undefined && homingMissileCharges > 0) {
      const rotation = nowMs * 0.001; // Slow rotation
      const orbitRadius = size * 1.4;
      const ballX = Math.cos(Math.PI + rotation) * orbitRadius;
      const ballY = Math.sin(Math.PI + rotation) * orbitRadius;

      // Red ball glow
      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff6688";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Joust lightsabers on ship - positioned at 45 degrees from back corners
    // Left sword: starts at left back corner, points forward at 45 degrees
    // Right sword: starts at right back corner, points forward at 45 degrees
    // This creates a V-shape pointing forward like: >
    if (joustLeftActive !== undefined || joustRightActive !== undefined) {
      const swordLength = GAME_CONFIG.POWERUP_JOUST_SIZE;
      const swordWidth = GAME_CONFIG.POWERUP_JOUST_WIDTH;
      const size = 15;

      // Glow effect for lightsabers
      ctx.shadowColor = "#00ff44";
      ctx.shadowBlur = 20;

      // Ship triangle vertices (relative to center)
      const noseX = size;
      const noseY = 0;
      const topWingX = -size * 0.7;
      const topWingY = -size * 0.6;
      const bottomWingX = -size * 0.7;
      const bottomWingY = size * 0.6;

      // Offset for swords to align with wing corners
      const cornerOffset = 0;

      // Left sword - starts at left back corner (top wing), extends straight forward at 0 degrees
      if (joustLeftActive) {
        // Start position: left back corner with offset toward the back
        const startX = topWingX - cornerOffset;
        const startY = topWingY;

        // Angle: 0 degrees from ship centerline (pointing straight forward)
        // Both swords point straight forward, parallel to ship direction
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);

        // Sword blade (green glow) - extending outward from the corner
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);

        // Inner bright core
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);

        // Hilt at the corner
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);

        ctx.restore();
      }

      // Right sword - starts at right back corner (bottom wing), extends straight forward at 0 degrees
      if (joustRightActive) {
        // Start position: right back corner with offset toward the back
        const startX = bottomWingX - cornerOffset;
        const startY = bottomWingY;

        // Angle: 0 degrees from ship centerline (pointing straight forward)
        // Both swords point straight forward, parallel to ship direction
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);

        // Sword blade (green glow) - extending outward from the corner
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);

        // Inner bright core
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);

        // Hilt at the corner
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);

        ctx.restore();
      }

      ctx.shadowBlur = 0;
    }

    // Flash when invulnerable
    const shouldFlash = isInvulnerable && Math.floor(nowMs / 100) % 2 === 0;
    if (shouldFlash) {
      ctx.globalAlpha = 0.5;
    }

    // Glow effect
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 15;

    this.entitySprites.drawEntity(this.ctx, "ship", {
      "slot-primary": color.primary,
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ============= PILOT RENDERING =============

  drawPilot(state: PilotState, color: PlayerColor): void {
    const { ctx } = this;
    const { x, y, angle, survivalProgress } = state;
    const nowMs = this.getNowMs();
    const isFlashing =
      survivalProgress > 0.6 && Math.floor(nowMs / 150) % 2 === 0;

    ctx.save();
    ctx.translate(x, y);

    if (isFlashing) {
      ctx.globalAlpha = 0.5;
    }

    // Survival progress ring
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

    // Astronaut
    ctx.save();
    ctx.rotate(angle);

    this.entitySprites.drawEntity(this.ctx, "pilot", {
      "slot-primary": color.primary,
      "slot-secondary": "#f4fbff",
      "slot-tertiary": "#1d2636",
      "slot-outline": "#ffffff",
    });

    ctx.restore();

    ctx.restore();
  }

  // ============= ASTEROID RENDERING =============

  drawAsteroid(state: AsteroidState): void {
    const { ctx } = this;
    const { x, y, angle, vertices } = state;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = GAME_CONFIG.ASTEROID_GLOW;
    ctx.shadowBlur = 15;

    // Asteroid body
    ctx.fillStyle = GAME_CONFIG.ASTEROID_COLOR;
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth = 2;

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

    // Add some surface detail (craters)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    const craterSource = vertices[0] ?? { x: state.size * 0.7, y: 0 };
    ctx.beginPath();
    ctx.arc(
      craterSource.x * 0.3,
      craterSource.y * 0.3,
      Math.max(3, Math.abs(craterSource.x) * 0.25),
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // ============= PROJECTILE RENDERING =============

  drawProjectile(state: ProjectileState): void {
    const { ctx } = this;
    const { x, y, vx, vy } = state;
    const angle = Math.atan2(vy, vx);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= PARTICLE SYSTEM =============

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

  spawnNitroParticle(x: number, y: number, color: string): void {
    // Larger, faster particles for nitro boost effect
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
    // Spray particles behind the ship during dash
    // Ship angle is where the ship is pointing - particles should spray from the back
    const backAngle = shipAngle + Math.PI; // Opposite direction of ship
    const spreadAngle = Math.PI / 3; // 60 degree spread

    for (let i = 0; i < count; i++) {
      // Random angle within spread behind the ship
      const particleAngle = backAngle + (this.random() - 0.5) * spreadAngle;
      const speed = 150 + this.random() * 100; // Fast spray
      const life = 0.15 + this.random() * 0.15; // Short life
      const size = 3 + this.random() * 3;

      // Spawn slightly behind the ship
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
        color: color || "#44aaff", // Default blue if no color provided
      });
    }

    // Add some white/bright core particles
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

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    // Spawn debris pieces - purely visual, no collision
    const pieceCount = 4 + Math.floor(this.random() * 4); // 4-7 pieces
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

    // Add some dust/smaller particles
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
    // Spawn ship debris pieces - larger and more dramatic than asteroid debris
    const pieceCount = 8 + Math.floor(this.random() * 4); // 8-11 pieces

    // Ship body pieces (colored)
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 50 + this.random() * 80;
      const life = 0.8 + this.random() * 0.6; // Longer lasting
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

    // Metal/wreckage pieces (grey/silver)
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

    // Spark particles
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

  updateParticles(dt: number): void {
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

  drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============= POWER-UP RENDERING =============

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

    // Draw power-up box - color based on type
    let boxColor: string;
    if (type === "LASER") {
      boxColor = "#ff0066"; // Pink
    } else if (type === "SHIELD") {
      boxColor = "#00ccff"; // Cyan
    } else if (type === "SCATTER") {
      boxColor = "#00cc44"; // Green
    } else if (type === "MINE") {
      boxColor = "#ff8800"; // Orange
    } else if (type === "JOUST") {
      boxColor = "#00aa22"; // Dark green
    } else if (type === "HOMING_MISSILE") {
      boxColor = "#888888"; // Metallic gray
    } else {
      boxColor = "#666666"; // Gray for REVERSE
    }
    ctx.fillStyle = boxColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    // Glow effect
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 15;

    // Draw square box
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    ctx.shadowBlur = 0;

    // Draw symbol
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px Arial";

    if (type === "LASER") {
      // Draw laser symbol (lightning bolt)
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 8);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    } else if (type === "SHIELD") {
      // Draw shield symbol (circle)
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "SCATTER") {
      // Draw shotgun shell symbol - green cylinder with red primer
      // Shell body (green rectangle)
      ctx.fillStyle = "#00ff44";
      ctx.fillRect(-4, -7, 8, 14);
      // Shell rim
      ctx.fillStyle = "#00aa33";
      ctx.fillRect(-5, 5, 10, 3);
      // Red primer in center
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.arc(0, 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "MINE") {
      // Draw mine symbol - orange ball with grey spikes
      // Center orange ball
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      // Grey spikes
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
        ctx.lineTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        ctx.stroke();
      }
    } else if (type === "REVERSE") {
      // Draw reverse symbol - blue glowing "R"
      // Blue glow effect
      ctx.shadowColor = "#0088ff";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#0088ff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("R", 0, 0);
      ctx.shadowBlur = 0;
    } else if (type === "JOUST") {
      // Draw Joust symbol - green box with red cross (X)
      // Green box background
      ctx.fillStyle = "#00ff44";
      ctx.fillRect(-8, -8, 16, 16);
      // Red X in center
      ctx.strokeStyle = "#ff0044";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, 4);
      ctx.moveTo(4, -4);
      ctx.lineTo(-4, 4);
      ctx.stroke();
    } else if (type === "HOMING_MISSILE") {
      // Draw Homing Missile symbol - rocket icon
      // Rocket body
      ctx.fillStyle = "#aaaaaa";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Rocket nose
      ctx.fillStyle = "#cccccc";
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-3, -3);
      ctx.lineTo(3, -3);
      ctx.closePath();
      ctx.fill();
      // Fins
      ctx.fillStyle = "#666666";
      ctx.beginPath();
      ctx.moveTo(-3, 4);
      ctx.lineTo(-6, 8);
      ctx.lineTo(-2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(3, 4);
      ctx.lineTo(6, 8);
      ctx.lineTo(2, 6);
      ctx.closePath();
      ctx.fill();
      // Flame
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.moveTo(-2, 6);
      ctx.lineTo(0, 10);
      ctx.lineTo(2, 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // ============= LASER BEAM RENDERING =============

  drawLaserBeam(state: LaserBeamState): void {
    const { ctx } = this;
    const { x, y, angle, id } = state;
    const beamLength = GAME_CONFIG.POWERUP_BEAM_LENGTH;
    const beamWidth = GAME_CONFIG.POWERUP_BEAM_WIDTH;
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
    ctx.shadowBlur = 20;

    // Draw oval shield
    ctx.fillStyle = color;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  spawnShieldBreakDebris(x: number, y: number): void {
    // Spawn glass-like debris when shield breaks
    const pieceCount = 8 + Math.floor(this.random() * 4);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 40 + this.random() * 60;
      const life = 0.4 + this.random() * 0.4;

      this.particles.push({
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 30, // Add downward gravity effect
        life,
        maxLife: life,
        size: 3 + this.random() * 4,
        color: "#88ccff",
      });
    }
  }

  // ============= STARS BACKGROUND =============

  private stars: {
    x: number;
    y: number;
    size: number;
    brightness: number;
    twinkleSpeed: number;
    twinkleOffset: number;
  }[] = [];

  initStars(): void {
    this.stars = [];
    // Stars are in arena coordinates (within the fixed arena size)
    const count = Math.floor(
      (GAME_CONFIG.ARENA_WIDTH * GAME_CONFIG.ARENA_HEIGHT) / 4000,
    );
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: this.random() * GAME_CONFIG.ARENA_WIDTH,
        y: this.random() * GAME_CONFIG.ARENA_HEIGHT,
        size: 0.5 + this.random() * 1.5,
        brightness: 0.3 + this.random() * 0.7,
        twinkleSpeed: 1 + this.random() * 3,
        twinkleOffset: this.random() * Math.PI * 2,
      });
    }
  }

  drawStars(): void {
    const { ctx } = this;
    const time = performance.now() / 1000;

    // Stars are drawn in arena coordinates (already transformed)
    for (const star of this.stars) {
      const twinkle =
        0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.brightness * twinkle;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============= ARENA BORDER =============

  drawArenaBorder(borderColor: string = "#00f0ff"): void {
    const { ctx } = this;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;
    const borderWidth = 4;

    // Neon border glow
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 20;
    ctx.lineWidth = borderWidth;

    // Draw rounded rectangle border
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.arcTo(w, 0, w, radius, radius);
    ctx.lineTo(w, h - radius);
    ctx.arcTo(w, h, w - radius, h, radius);
    ctx.lineTo(radius, h);
    ctx.arcTo(0, h, 0, h - radius, radius);
    ctx.lineTo(0, radius);
    ctx.arcTo(0, 0, radius, 0, radius);
    ctx.closePath();
    ctx.stroke();

    // Inner dim fill for area outside arena (corners if visible)
    ctx.restore();
  }

  drawYellowBlock(block: YellowBlock): void {
    const { ctx } = this;
    ctx.save();

    ctx.shadowColor = "#ffee00";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#ffee00";
    ctx.lineWidth = 2;
    ctx.strokeRect(block.x + 1, block.y + 1, block.width - 2, block.height - 2);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 180, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x + 4, block.y + 4, block.width - 8, block.height - 8);

    ctx.restore();
  }

  drawCenterHole(
    hole: CenterHole,
    time: number,
    playerMovementDirection: number,
    theme?: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    },
  ): void {
    const { ctx } = this;
    ctx.save();

    const gradientInner = theme?.gradientInner ?? "rgba(0, 0, 0, 0.95)";
    const gradientMid = theme?.gradientMid ?? "rgba(10, 10, 30, 0.9)";
    const gradientOuter = theme?.gradientOuter ?? "rgba(20, 20, 50, 0.6)";
    const ringColor = theme?.ring ?? "#4444ff";
    const ringGlow = theme?.glow ?? ringColor;
    const innerRingColor = theme?.innerRing ?? "#6666ff";
    const arrowColor = theme?.arrow ?? "#00f0ff";

    const gradient = ctx.createRadialGradient(
      hole.x,
      hole.y,
      0,
      hole.x,
      hole.y,
      hole.radius,
    );
    gradient.addColorStop(0, gradientInner);
    gradient.addColorStop(0.7, gradientMid);
    gradient.addColorStop(1, gradientOuter);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringGlow;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 10;
    ctx.strokeStyle = innerRingColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    if (hole.hasRotatingArrow) {
      ctx.shadowBlur = 0;
      const lineRadius = hole.radius + 18;
      const rotationAngle = time * 1.5 * playerMovementDirection;
      const segments = 3;
      const segmentArc = Math.PI / 6;
      const gapArc = Math.PI / 12;

      for (let i = 0; i < segments; i++) {
        const startAngle = rotationAngle + i * (segmentArc + gapArc);
        const endAngle = startAngle + segmentArc;

        ctx.beginPath();
        ctx.arc(hole.x, hole.y, lineRadius, startAngle, endAngle);
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = arrowColor;
        ctx.shadowBlur = 12;
        ctx.stroke();
      }

      const arrowAngle = rotationAngle + 0.25 * playerMovementDirection;
      const ax = hole.x + Math.cos(arrowAngle) * (lineRadius + 8);
      const ay = hole.y + Math.sin(arrowAngle) * (lineRadius + 8);
      const arrowSize = 10;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(
        arrowAngle + (playerMovementDirection > 0 ? Math.PI / 2 : -Math.PI / 2),
      );
      ctx.fillStyle = arrowColor;
      ctx.shadowColor = arrowColor;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize);
      ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
      ctx.lineTo(arrowSize * 0.5, arrowSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.shadowBlur = 0;
      for (let i = 1; i <= 5; i++) {
        const trailAngle = rotationAngle - i * 0.4 * playerMovementDirection;
        const trailAlpha = 0.5 - i * 0.08;
        ctx.globalAlpha = Math.max(0, trailAlpha);
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 3 - i * 0.4;
        ctx.beginPath();
        ctx.arc(
          hole.x,
          hole.y,
          lineRadius,
          trailAngle,
          trailAngle + Math.PI / 8,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (theme?.ring === "#ff5a2b") {
      this.drawVortexSnake(hole, time, playerMovementDirection, theme);
    }

    ctx.restore();
  }

  private drawVortexSnake(
    hole: CenterHole,
    time: number,
    playerMovementDirection: number,
    theme: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    },
  ): void {
    void theme;
    const { ctx } = this;
    const snakeRadius = hole.radius + 25;
    const snakeSpeed = 1.2;
    const segmentCount = 8;
    const segmentSpacing = 0.25;
    const baseAngle = time * snakeSpeed * playerMovementDirection;

    ctx.save();
    for (let i = segmentCount - 1; i >= 0; i--) {
      const segmentAngle =
        baseAngle - i * segmentSpacing * playerMovementDirection;
      const x = hole.x + Math.cos(segmentAngle) * snakeRadius;
      const y = hole.y + Math.sin(segmentAngle) * snakeRadius;
      const size = 8 - i * 0.6;
      const alpha = 1 - i * 0.08;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(segmentAngle);
      if (i === 0) {
        ctx.shadowColor = "#ff8844";
        ctx.shadowBlur = 20;
      }

      const r = 255;
      const g = Math.floor(136 - i * 12);
      const b = Math.floor(68 - i * 6);
      ctx.fillStyle = "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (i === 0) {
        ctx.fillStyle = "#ffaa66";
        ctx.beginPath();
        ctx.ellipse(size * 0.3, 0, size * 0.5, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawRepulsionZone(
    zone: RepulsionZone,
    time: number,
    theme?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    },
  ): void {
    const { ctx } = this;
    ctx.save();

    const gradientInner = theme?.gradientInner ?? "rgba(255, 50, 50, 0.4)";
    const gradientMid = theme?.gradientMid ?? "rgba(255, 100, 50, 0.2)";
    const gradientOuter = theme?.gradientOuter ?? "rgba(255, 100, 50, 0)";
    const coreColor = theme?.core ?? "rgba(200, 30, 30, 0.6)";
    const ringColor = theme?.ring ?? "#ff4444";
    const arrowColor = theme?.arrow ?? "rgba(255, 100, 50, 0.7)";
    const ringGlow = theme?.glow ?? ringColor;

    const pulse = 0.9 + Math.sin(time * 3) * 0.1;
    const drawRadius = zone.radius * pulse;

    const gradient = ctx.createRadialGradient(
      zone.x,
      zone.y,
      0,
      zone.x,
      zone.y,
      drawRadius,
    );
    gradient.addColorStop(0, gradientInner);
    gradient.addColorStop(0.5, gradientMid);
    gradient.addColorStop(1, gradientOuter);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringGlow;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, drawRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    const waveCount = 4;
    const waveStart = drawRadius * 0.95;
    const waveRange = drawRadius * 0.75;
    const waveSpeed = 24;
    for (let i = 0; i < waveCount; i++) {
      const waveOffset =
        (time * waveSpeed + (i * waveRange) / waveCount) % waveRange;
      const waveRadius = waveStart + waveOffset;
      const waveAlpha = 0.35 * (1 - waveOffset / waveRange);
      ctx.globalAlpha = waveAlpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, waveRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const arrowCount = 6;
    for (let i = 0; i < arrowCount; i++) {
      const angle = (i / arrowCount) * Math.PI * 2 + time * 1.5;
      const dist = drawRadius * 0.6 + Math.sin(time * 4 + i) * 5;
      const ax = zone.x + Math.cos(angle) * dist;
      const ay = zone.y + Math.sin(angle) * dist;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  hasMapOverlay(mapId: MapId): boolean {
    return this.mapOverlays.hasOverlay(mapId);
  }

  drawMapOverlay(mapId: MapId): void {
    this.mapOverlays.drawMapOverlay(this.ctx, mapId);
  }

  // ============= UI ELEMENTS =============

  drawCountdown(count: number): void {
    const { ctx } = this;
    const text = count > 0 ? count.toString() : "FIGHT!";

    // Countdown is drawn in arena coordinates (already transformed)
    ctx.save();
    ctx.font = "bold 80px Orbitron, sans-serif";
    ctx.fillStyle = count > 0 ? "#ffee00" : "#00ff88";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 30;
    // Center of arena
    ctx.fillText(
      text,
      GAME_CONFIG.ARENA_WIDTH / 2,
      GAME_CONFIG.ARENA_HEIGHT / 2,
    );
    ctx.restore();
  }

  getPlayerColor(index: number): PlayerColor {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  // ============= MINE RENDERING =============

  drawMine(mine: {
    x: number;
    y: number;
    exploded: boolean;
    explosionTime: number;
  }): void {
    const { ctx } = this;
    const { x, y, exploded, explosionTime } = mine;
    const nowMs = this.getNowMs();

    if (exploded && explosionTime > 0) {
      // Draw explosion effect - lasts 500ms
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const radius =
        GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
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
      // Draw pointy ball mine with pulsing animation
      ctx.save();
      ctx.translate(x, y);

      // Pulsing animation - scale shrinks and grows
      const pulseSpeed = 0.008;
      const pulseAmount = 0.15;
      const pulseScale = 1 + Math.sin(nowMs * pulseSpeed) * pulseAmount;
      ctx.scale(pulseScale, pulseScale);

      const mineSize = GAME_CONFIG.POWERUP_MINE_SIZE;
      const spikeCount = 8;
      const innerRadius = mineSize * 0.6;
      const outerRadius = mineSize;

      // Glow effect - orange
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 15;

      // Draw spiky ball shape - grey spikes
      ctx.fillStyle = "#888888";
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 2;

      ctx.beginPath();
      for (let i = 0; i < spikeCount * 2; i++) {
        const angle = (i / (spikeCount * 2)) * Math.PI * 2;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center glow - orange center
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.arc(0, 0, mineSize * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = "#ffaa44";
      ctx.beginPath();
      ctx.arc(0, 0, mineSize * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  drawMineState(state: import("../types").MineState): void {
    const { ctx } = this;
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

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // Normal mine rendering with pulse
    ctx.save();
    ctx.translate(x, y);

    // Pulsing animation
    const pulseSpeed = 0.008;
    const pulseAmount = 0.15;
    const pulseScale = 1 + Math.sin(nowMs * pulseSpeed) * pulseAmount;
    ctx.scale(pulseScale, pulseScale);

    const mineSize = GAME_CONFIG.POWERUP_MINE_SIZE;
    const spikeCount = 8;
    const innerRadius = mineSize * 0.6;
    const outerRadius = mineSize;

    // Grey spikes
    ctx.fillStyle = "#888888";
    ctx.strokeStyle = "#aaaaaa";
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let i = 0; i < spikeCount * 2; i++) {
      const angle = (i / (spikeCount * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orange center
    ctx.fillStyle = "#ff8800";
    ctx.beginPath();
    ctx.arc(0, 0, mineSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = "#ffaa44";
    ctx.beginPath();
    ctx.arc(0, 0, mineSize * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  spawnMineExplosion(x: number, y: number, radius: number): void {
    const { ctx } = this;

    // Create a bright flash particle
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

    // Create explosion ring
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

    // Create debris particles
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

  // ============= HOMING MISSILE RENDERING =============

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
    const time = Date.now() * 0.02;

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
