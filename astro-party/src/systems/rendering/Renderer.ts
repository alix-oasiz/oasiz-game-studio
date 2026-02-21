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
} from "../../types";
import { SeededRNG } from "../../../shared/sim/SeededRNG";
import {
  SHIP_JOUST_LOCAL_POINTS,
  SHIP_SHIELD_RADII,
  SHIP_VISUAL_REFERENCE_SIZE,
  getShipTrailWorldPoint,
} from "../../../shared/geometry/ShipRenderAnchors";
import {
  SHIP_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../../../shared/geometry/EntityShapes";
import { getEntityAsset } from "../../../shared/geometry/EntityAssets";
import { projectRayToArenaWall } from "../../../shared/sim/physics/geometryMath";
import { EntitySpriteStore } from "./EntitySpriteStore";
import { MapOverlayStore } from "./MapOverlayStore";
import { PowerUpSpriteStore } from "./PowerUpSpriteStore";
import {
  CAMERA_DEFAULT_ZOOM,
  CAMERA_EDGE_SLACK_RATIO,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
} from "../camera/cameraConstants";
import type {
  YellowBlock,
  CenterHole,
  RepulsionZone,
} from "../../../shared/sim/maps";

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

type PilotDebrisKind = "visor" | "shellLeft" | "shellRight" | "core";
type PilotDebrisAssetId =
  | "pilot_death_debris_visor"
  | "pilot_death_debris_shell_left"
  | "pilot_death_debris_shell_right"
  | "pilot_death_debris_core";

interface PilotDebrisPiece {
  kind: PilotDebrisKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  radius: number;
  mass: number;
  life: number;
  maxLife: number;
  persistent: boolean;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
}

interface PilotDeathBurstFx {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

interface ShipTrailPoint {
  x: number;
  y: number;
  atMs: number;
}

interface ShipTrailState {
  color: string;
  points: ShipTrailPoint[];
}

export interface ShipTrailVisualTuning {
  outerWidth: number;
  midWidth: number;
  coreWidth: number;
  outerAlpha: number;
  midAlpha: number;
  coreAlpha: number;
}

const DEFAULT_SHIP_TRAIL_VISUAL_TUNING: Readonly<ShipTrailVisualTuning> =
  Object.freeze({
    outerWidth: 12,
    midWidth: 7,
    coreWidth: 3.3,
    outerAlpha: 0.06,
    midAlpha: 0.12,
    coreAlpha: 0.2,
  });

const SHIP_TRAIL_MAX_AGE_MS = 1400;
const SHIP_TRAIL_MIN_SPEED_SQ = 0.2;
const SHIP_TRAIL_SEGMENT_SPACING = 2.2;
const SHIP_TRAIL_MIN_APPEND_DISTANCE = 0.7;
const SHIP_TRAIL_MAX_INSERT_STEPS = 24;
const SHIP_TRAIL_MAX_POINTS = 32;

const DEFAULT_SHIP_TRAIL_CORE_COLOR = "#dffbff";

interface ShipTrailRenderLayer {
  width: number;
  alpha: number;
  color: string;
}

function buildShipTrailRenderLayers(
  color: string,
  tuning: ShipTrailVisualTuning,
): ReadonlyArray<ShipTrailRenderLayer> {
  return [
    { width: tuning.outerWidth, alpha: tuning.outerAlpha, color },
    { width: tuning.midWidth, alpha: tuning.midAlpha, color },
    {
      width: tuning.coreWidth,
      alpha: tuning.coreAlpha,
      color: DEFAULT_SHIP_TRAIL_CORE_COLOR,
    },
  ];
}

function clampShipTrailVisualTuning(
  current: ShipTrailVisualTuning,
  next: Partial<ShipTrailVisualTuning>,
): ShipTrailVisualTuning {
  const clamped: ShipTrailVisualTuning = { ...current };

  if (Number.isFinite(next.outerWidth)) {
    clamped.outerWidth = Math.max(0.1, Math.min(40, next.outerWidth as number));
  }
  if (Number.isFinite(next.midWidth)) {
    clamped.midWidth = Math.max(0.1, Math.min(40, next.midWidth as number));
  }
  if (Number.isFinite(next.coreWidth)) {
    clamped.coreWidth = Math.max(0.1, Math.min(40, next.coreWidth as number));
  }
  if (Number.isFinite(next.outerAlpha)) {
    clamped.outerAlpha = Math.max(0, Math.min(1, next.outerAlpha as number));
  }
  if (Number.isFinite(next.midAlpha)) {
    clamped.midAlpha = Math.max(0, Math.min(1, next.midAlpha as number));
  }
  if (Number.isFinite(next.coreAlpha)) {
    clamped.coreAlpha = Math.max(0, Math.min(1, next.coreAlpha as number));
  }

  return clamped;
}

function isShipTrailVisualTuningEqual(
  a: ShipTrailVisualTuning,
  b: ShipTrailVisualTuning,
): boolean {
  return (
    a.outerWidth === b.outerWidth &&
    a.midWidth === b.midWidth &&
    a.coreWidth === b.coreWidth &&
    a.outerAlpha === b.outerAlpha &&
    a.midAlpha === b.midAlpha &&
    a.coreAlpha === b.coreAlpha
  );
}

export class Renderer {
  private static readonly PILOT_DEBRIS_BASELINE_PILOT_WIDTH = 52;
  private static readonly PILOT_DEBRIS_SCALE_MULTIPLIER = 1;
  private static readonly PILOT_DEBRIS_BASELINE_BUMP_RADIUS = 8.2;
  private static readonly PILOT_DEBRIS_PERSISTENT_LIFE = 1;
  private static readonly MAX_BULLET_CASINGS = 96;
  private static readonly MAX_PILOT_DEBRIS_PIECES = 36;
  private static readonly MAX_PILOT_DEATH_BURSTS = 10;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private bulletCasings: BulletCasing[] = [];
  private pilotDebrisPieces: PilotDebrisPiece[] = [];
  private pilotDeathBursts: PilotDeathBurstFx[] = [];
  private shipTrails = new Map<string, ShipTrailState>();
  private shipTrailVisualTuning: ShipTrailVisualTuning = {
    ...DEFAULT_SHIP_TRAIL_VISUAL_TUNING,
  };
  private screenShake = { intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
  private visualRng: SeededRNG;
  private gameTimeMs: number | null = null;

  // Dev mode visualization flag
  private devModeEnabled = false;

  // Fixed arena scaling
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private cameraZoom: number = CAMERA_DEFAULT_ZOOM;
  private cameraFocusX: number = GAME_CONFIG.ARENA_WIDTH / 2;
  private cameraFocusY: number = GAME_CONFIG.ARENA_HEIGHT / 2;
  private viewportWidth: number = 1;
  private viewportHeight: number = 1;
  private coarsePointer = false;
  private entitySprites = new EntitySpriteStore();
  private mapOverlays = new MapOverlayStore();
  private powerUpSprites = new PowerUpSpriteStore();
  private previousProjectilePositions = new Map<string, { x: number; y: number }>();
  private projectileDebugHistory = new Map<
    string,
    Array<{ x: number; y: number; atMs: number }>
  >();
  private centerHoleRotationState = new Map<
    string,
    {
      direction: number;
      ringOffset: number;
      snakeOffset: number;
      snakeSizeFlipT: number;
      lastTime: number;
    }
  >();

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
    this.coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

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

  setCamera(zoom: number, focusX: number, focusY: number): void {
    this.cameraZoom = this.clampCameraZoom(zoom);
    this.cameraFocusX = Number.isFinite(focusX)
      ? focusX
      : GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = Number.isFinite(focusY)
      ? focusY
      : GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  resetCamera(): void {
    this.cameraZoom = CAMERA_DEFAULT_ZOOM;
    this.cameraFocusX = GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  // Enable/disable dev mode visualization
  setDevMode(enabled: boolean): void {
    this.devModeEnabled = enabled;
    if (!enabled) {
      this.previousProjectilePositions.clear();
      this.projectileDebugHistory.clear();
    }
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

  drawTurret(state: import("../../types").TurretState): void {
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

  drawTurretBullet(state: import("../../types").TurretBulletState): void {
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

    // Apply camera around world-space focus.
    const zoom = this.getEffectiveCameraZoom();
    const focus = this.getClampedCameraFocus(zoom);
    const scaled = this.scale * zoom;
    this.ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
    this.ctx.scale(scaled, scaled);
    this.ctx.translate(-focus.x, -focus.y);
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
    this.bulletCasings = [];
    this.pilotDebrisPieces = [];
    this.pilotDeathBursts = [];
    this.shipTrails.clear();
    this.previousProjectilePositions.clear();
    this.projectileDebugHistory.clear();
    this.screenShake.intensity = 0;
    this.screenShake.duration = 0;
    this.screenShake.offsetX = 0;
    this.screenShake.offsetY = 0;
    this.centerHoleRotationState.clear();
  }

  getShipTrailVisualTuning(): ShipTrailVisualTuning {
    return { ...this.shipTrailVisualTuning };
  }

  resetShipTrailVisualTuning(): void {
    this.shipTrailVisualTuning = { ...DEFAULT_SHIP_TRAIL_VISUAL_TUNING };
    this.shipTrails.clear();
  }

  setShipTrailVisualTuning(next: Partial<ShipTrailVisualTuning>): void {
    if (!next || typeof next !== "object") return;
    const nextClamped = clampShipTrailVisualTuning(this.shipTrailVisualTuning, next);
    if (!isShipTrailVisualTuningEqual(nextClamped, this.shipTrailVisualTuning)) {
      this.shipTrailVisualTuning = nextClamped;
    }
  }

  private clampCameraZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return CAMERA_DEFAULT_ZOOM;
    return Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, zoom));
  }

  private getViewportZoomCompensation(baseZoom: number): number {
    if (!this.coarsePointer) return 1;
    // Keep mobile close-up from feeling undersized on short-height viewports,
    // while preserving the far-spread baseline zoom exactly.
    const shortEdge = Math.min(this.viewportWidth, this.viewportHeight);
    const t = this.clamp01((620 - shortEdge) / 280);
    const zoomInRange = Math.max(0.0001, CAMERA_MAX_ZOOM - CAMERA_DEFAULT_ZOOM);
    const zoomInT = this.clamp01((baseZoom - CAMERA_DEFAULT_ZOOM) / zoomInRange);
    return 1 + t * 0.16 * zoomInT;
  }

  private getEffectiveCameraZoom(): number {
    const baseZoom = this.clampCameraZoom(this.cameraZoom);
    return this.clampCameraZoom(baseZoom * this.getViewportZoomCompensation(baseZoom));
  }

  private getEffectBlurPx(
    baseBlurAtUnitScale: number,
    minBlur: number,
    maxBlur: number,
  ): number {
    // Shadow blur is screen-space; scale it with world->screen scale
    // so glow remains visually consistent across zoom/device sizes.
    const px = baseBlurAtUnitScale * this.scale * this.getEffectiveCameraZoom();
    return this.clamp(px, minBlur, maxBlur);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getClampedCameraFocus(zoom: number): { x: number; y: number } {
    const viewHalfWidth = this.viewportWidth / (2 * this.scale * zoom);
    const viewHalfHeight = this.viewportHeight / (2 * this.scale * zoom);
    const edgeSlackX = viewHalfWidth * CAMERA_EDGE_SLACK_RATIO;
    const edgeSlackY = viewHalfHeight * CAMERA_EDGE_SLACK_RATIO;

    const minFocusX = viewHalfWidth - edgeSlackX;
    const maxFocusX = GAME_CONFIG.ARENA_WIDTH - viewHalfWidth + edgeSlackX;
    const minFocusY = viewHalfHeight - edgeSlackY;
    const maxFocusY = GAME_CONFIG.ARENA_HEIGHT - viewHalfHeight + edgeSlackY;

    const x =
      minFocusX > maxFocusX
        ? GAME_CONFIG.ARENA_WIDTH / 2
        : this.clamp(this.cameraFocusX, minFocusX, maxFocusX);
    const y =
      minFocusY > maxFocusY
        ? GAME_CONFIG.ARENA_HEIGHT / 2
        : this.clamp(this.cameraFocusY, minFocusY, maxFocusY);

    return { x, y };
  }

  // ============= SHIP RENDERING =============

  sampleShipTrail(state: ShipState, color: PlayerColor): void {
    if (!state.alive) return;
    const nowMs = this.getNowMs();
    const speedSq = state.vx * state.vx + state.vy * state.vy;
    if (speedSq < SHIP_TRAIL_MIN_SPEED_SQ) return;

    const trailAnchor = getShipTrailWorldPoint(state);
    let trail = this.shipTrails.get(state.playerId);
    if (!trail) {
      trail = { color: color.primary, points: [] };
      this.shipTrails.set(state.playerId, trail);
    }
    trail.color = color.primary;
    this.pruneExpiredShipTrailPoints(trail, nowMs);

    const points = trail.points;
    const lastPoint = points[points.length - 1];
    if (!lastPoint) {
      points.push({ x: trailAnchor.x, y: trailAnchor.y, atMs: nowMs });
      return;
    }

    const dx = trailAnchor.x - lastPoint.x;
    const dy = trailAnchor.y - lastPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance < SHIP_TRAIL_MIN_APPEND_DISTANCE) {
      return;
    }

    const insertSteps = Math.min(
      SHIP_TRAIL_MAX_INSERT_STEPS,
      Math.floor(distance / SHIP_TRAIL_SEGMENT_SPACING),
    );
    for (let step = 1; step <= insertSteps; step += 1) {
      const t = step / (insertSteps + 1);
      points.push({
        x: lastPoint.x + dx * t,
        y: lastPoint.y + dy * t,
        atMs: nowMs,
      });
    }
    points.push({ x: trailAnchor.x, y: trailAnchor.y, atMs: nowMs });

    if (points.length > SHIP_TRAIL_MAX_POINTS) {
      points.splice(0, points.length - SHIP_TRAIL_MAX_POINTS);
    }
  }

  drawShipTrails(): void {
    const nowMs = this.getNowMs();
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [playerId, trail] of this.shipTrails) {
      this.pruneExpiredShipTrailPoints(trail, nowMs);
      if (trail.points.length < 2) {
        if (trail.points.length === 0) {
          this.shipTrails.delete(playerId);
        }
        continue;
      }

      this.drawShipTrailLayered(trail, nowMs);
    }

    ctx.restore();
  }

  private pruneExpiredShipTrailPoints(trail: ShipTrailState, nowMs: number): void {
    const cutoff = nowMs - SHIP_TRAIL_MAX_AGE_MS;
    while (trail.points.length > 0 && trail.points[0].atMs < cutoff) {
      trail.points.shift();
    }
  }

  private drawShipTrailLayered(trail: ShipTrailState, nowMs: number): void {
    const { ctx } = this;
    const layers = buildShipTrailRenderLayers(
      trail.color,
      this.shipTrailVisualTuning,
    );

    for (const layer of layers) {
      for (let i = 1; i < trail.points.length; i += 1) {
        const prev = trail.points[i - 1];
        const curr = trail.points[i];
        const age01 = this.clamp01((nowMs - curr.atMs) / SHIP_TRAIL_MAX_AGE_MS);
        const fade = 1 - age01;
        if (fade <= 0) continue;

        const segmentAlpha = layer.alpha * fade * fade;
        if (segmentAlpha <= 0.004) continue;

        ctx.globalAlpha = segmentAlpha;
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.width * (0.4 + fade * 0.6);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
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
    const nowMs = this.getNowMs();
    const isInvulnerable = nowMs < invulnerableUntil;
    const size = SHIP_VISUAL_REFERENCE_SIZE;
    this.bumpPilotDebrisWithBody(
      x,
      y,
      Math.max(6, size * 0.78),
      state.vx,
      state.vy,
    );

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
      const maxCharges = Math.max(
        1,
        laserMaxCharges ?? GAME_CONFIG.POWERUP_LASER_CHARGES,
      );
      const dotSize = 3.5;
      const arcRadius = size * 1.3; // Distance from ship center
      const arcAngle = Math.PI * 0.6; // Total arc spread (108 degrees)

      for (let i = 0; i < maxCharges; i++) {
        // Calculate angle for this charge in the arc (spread around back of ship)
        const lerpT = maxCharges <= 1 ? 0.5 : i / (maxCharges - 1);
        const angleOffset = (lerpT - 0.5) * arcAngle;
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
      const dotRadius = 2.4;
      const orbitRadius = size * 1.3; // Distance from ship center
      const rotation = nowMs * 0.0008; // Slow rotation like missile

      for (let i = 0; i < maxAmmo; i++) {
        // Calculate angle for this ammo rotating around the back of ship
        const angleOffset = (i / maxAmmo) * Math.PI * 2;
        const totalAngle = rotation + angleOffset;
        const dotX = Math.cos(Math.PI + totalAngle) * orbitRadius;
        const dotY = Math.sin(Math.PI + totalAngle) * orbitRadius;

        // Duller circular indicators for normal ammo.
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

    // Draw Homing Missile indicator (red ball on back) - rotates slowly
    if (homingMissileCharges !== undefined && homingMissileCharges > 0) {
      const rotation = nowMs * 0.001; // Slow rotation
      const orbitRadius = size * 1.4;
      const ballX = Math.cos(Math.PI + rotation) * orbitRadius;
      const ballY = Math.sin(Math.PI + rotation) * orbitRadius;

      // Red ball glow
      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = this.getEffectBlurPx(15, 7, 22);
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

      // Glow effect for lightsabers
      ctx.shadowColor = "#00ff44";
      ctx.shadowBlur = this.getEffectBlurPx(20, 8, 28);

      // Left sword - starts at left back corner (top wing), extends straight forward at 0 degrees
      if (joustLeftActive) {
        // Start position from ship asset-derived local hardpoint.
        const startX = SHIP_JOUST_LOCAL_POINTS.left.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.left.y;

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
        // Start position from ship asset-derived local hardpoint.
        const startX = SHIP_JOUST_LOCAL_POINTS.right.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.right.y;

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

    // Ship glow disabled for visual comparison pass.
    this.entitySprites.drawEntity(this.ctx, "ship", {
      "slot-primary": color.primary,
    });

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
    const pilotScale = this.getPilotDebrisScaleFactor();
    this.bumpPilotDebrisWithBody(
      x,
      y,
      Renderer.PILOT_DEBRIS_BASELINE_BUMP_RADIUS * pilotScale,
      state.vx,
      state.vy,
    );

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
    const isGrey = state.variant === "GREY";
    const glowColor = isGrey
      ? GAME_CONFIG.GREY_ASTEROID_GLOW
      : GAME_CONFIG.ASTEROID_GLOW;
    const bodyColor = isGrey
      ? GAME_CONFIG.GREY_ASTEROID_COLOR
      : GAME_CONFIG.ASTEROID_COLOR;
    const strokeColor = isGrey ? "#b9c0d4" : "#ffaa00";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;

    // Asteroid body
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = strokeColor;
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
    const glowRadius = Math.max(
      0.1,
      state.visualGlowRadius ?? GAME_CONFIG.PROJECTILE_VISUAL_GLOW_RADIUS,
    );
    const coreRadius = Math.max(0.1, state.radius ?? GAME_CONFIG.PROJECTILE_RADIUS);
    const tailRadiusX = coreRadius * 1.9;
    const tailRadiusY = coreRadius * 0.62;
    // Keep the visible front edge locked to the collider front (+coreRadius).
    const tailCenterX = coreRadius - tailRadiusX;
    const tailBackX = tailCenterX - tailRadiusX;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Trailing visual only (does not affect hit area).
    const tailGradient = ctx.createLinearGradient(tailBackX, 0, coreRadius, 0);
    tailGradient.addColorStop(0, "rgba(255,255,255,0)");
    tailGradient.addColorStop(0.65, "rgba(255,255,255,0.45)");
    tailGradient.addColorStop(1, "rgba(255,255,255,0.9)");
    ctx.fillStyle = tailGradient;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(tailCenterX, 0, tailRadiusX, tailRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Damaging core (matches physics radius 1:1).
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    if (this.devModeEnabled) {
      // Exact projectile collider.
      ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawShipColliderDebug(state: ShipState): void {
    if (!this.devModeEnabled) return;
    const { ctx } = this;
    const vertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      state.x,
      state.y,
      state.angle,
    );
    if (vertices.length < 3) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 170, 0, 0.95)";
    ctx.fillStyle = "rgba(255, 170, 0, 0.12)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i += 1) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ship center marker for quick visual sanity checks.
    ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.x - 2.5, state.y);
    ctx.lineTo(state.x + 2.5, state.y);
    ctx.moveTo(state.x, state.y - 2.5);
    ctx.lineTo(state.x, state.y + 2.5);
    ctx.stroke();
    ctx.restore();
  }

  drawProjectileSweepDebug(projectiles: ProjectileState[]): void {
    if (!this.devModeEnabled) return;
    const { ctx } = this;
    const nowMs = this.getNowMs();
    const activeProjectileIds = new Set<string>();

    for (const projectile of projectiles) {
      activeProjectileIds.add(projectile.id);
      const radius = Math.max(
        0.1,
        projectile.radius ?? GAME_CONFIG.PROJECTILE_RADIUS,
      );
      const history = this.projectileDebugHistory.get(projectile.id) ?? [];
      const last = history[history.length - 1];
      if (!last || Math.hypot(projectile.x - last.x, projectile.y - last.y) > 0.01) {
        history.push({ x: projectile.x, y: projectile.y, atMs: nowMs });
      } else {
        last.atMs = nowMs;
      }
      while (history.length > 14) {
        history.shift();
      }
      while (history.length > 2 && nowMs - history[0].atMs > 380) {
        history.shift();
      }
      this.projectileDebugHistory.set(projectile.id, history);

      const previous = history.length > 1 ? history[history.length - 2] : null;

      if (previous) {
        const dx = projectile.x - previous.x;
        const dy = projectile.y - previous.y;
        const distSq = dx * dx + dy * dy;

        ctx.save();
        for (let i = 1; i < history.length; i += 1) {
          const a = history[i - 1];
          const b = history[i];
          const t = i / history.length;
          ctx.strokeStyle = `rgba(255, 170, 120, ${0.18 + t * 0.42})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        if (distSq > 1e-6) {
          // Capsule body matching swept-circle width (diameter = 2 * radius).
          ctx.strokeStyle = "rgba(255, 90, 40, 0.45)";
          ctx.lineWidth = radius * 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(projectile.x, projectile.y);
          ctx.stroke();
        }

        // End circles and center line to make the sweep easier to read.
        ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(previous.x, previous.y, radius, 0, Math.PI * 2);
        ctx.arc(projectile.x, projectile.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255, 220, 170, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(projectile.x, projectile.y);
        ctx.stroke();

        // Explicit prev/curr markers.
        ctx.fillStyle = "rgba(255, 210, 120, 0.95)";
        ctx.beginPath();
        ctx.arc(previous.x, previous.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 120, 70, 0.95)";
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Tiny P/C labels so you can tell direction at a glance.
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
        ctx.fillText("P", previous.x, previous.y - Math.max(3, radius + 1));
        ctx.fillStyle = "rgba(255, 150, 110, 0.95)";
        ctx.fillText("C", projectile.x, projectile.y - Math.max(3, radius + 1));
        ctx.restore();
      }

      this.previousProjectilePositions.set(projectile.id, {
        x: projectile.x,
        y: projectile.y,
      });
    }

    for (const projectileId of [...this.previousProjectilePositions.keys()]) {
      if (activeProjectileIds.has(projectileId)) continue;
      this.previousProjectilePositions.delete(projectileId);
    }
    for (const projectileId of [...this.projectileDebugHistory.keys()]) {
      if (activeProjectileIds.has(projectileId)) continue;
      this.projectileDebugHistory.delete(projectileId);
    }
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

    this.bulletCasings.push({
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

    while (this.bulletCasings.length > Renderer.MAX_BULLET_CASINGS) {
      this.bulletCasings.shift();
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

  spawnPilotDeathBurst(x: number, y: number, color: string): void {
    const burstColor = color || "#00f0ff";
    this.pilotDeathBursts.push({
      x,
      y,
      angle: this.random() * Math.PI * 2,
      life: 0.36,
      maxLife: 0.36,
      color: burstColor,
    });
    while (this.pilotDeathBursts.length > Renderer.MAX_PILOT_DEATH_BURSTS) {
      this.pilotDeathBursts.shift();
    }

    const implosionCount = 14;
    for (let i = 0; i < implosionCount; i++) {
      const angle = (i / implosionCount) * Math.PI * 2 + this.random() * 0.2;
      const spawnRadius = 12 + this.random() * 4;
      const speed = 70 + this.random() * 40;
      const life = 0.09 + this.random() * 0.08;
      this.particles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + this.random() * 1.5,
        color: this.random() > 0.5 ? "#ffffff" : burstColor,
      });
    }

    const explosionCount = 20;
    for (let i = 0; i < explosionCount; i++) {
      const angle = (i / explosionCount) * Math.PI * 2 + this.random() * 0.3;
      const speed = 30 + this.random() * 55;
      const life = 0.16 + this.random() * 0.14;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.8 + this.random() * 2.2,
        color: this.random() > 0.35 ? burstColor : "#dff8ff",
      });
    }

    this.spawnPilotDeathDebrisPieces(x, y, burstColor);
  }

  private spawnPilotDeathDebrisPieces(
    x: number,
    y: number,
    primaryColor: string,
  ): void {
    const pilotScale = this.getPilotDebrisScaleFactor();
    const templates: ReadonlyArray<{
      kind: PilotDebrisKind;
      offsetX: number;
      offsetY: number;
      radius: number;
      speedMin: number;
      speedMax: number;
      angleJitter: number;
      secondaryColor: string;
      outlineColor: string;
    }> = [
      {
        kind: "visor",
        offsetX: 10.6,
        offsetY: -7.8,
        radius: 4.1,
        speedMin: 16,
        speedMax: 28,
        angleJitter: 0.45,
        secondaryColor: "#0b1120",
        outlineColor: "#e8f5ff",
      },
      {
        kind: "shellLeft",
        offsetX: -8.1,
        offsetY: 0,
        radius: 5.8,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#141d2a",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "shellRight",
        offsetX: 5.8,
        offsetY: 0.2,
        radius: 5.4,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#162233",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "core",
        offsetX: -0.4,
        offsetY: 0,
        radius: 2.9,
        speedMin: 10,
        speedMax: 18,
        angleJitter: 0.9,
        secondaryColor: "#05131d",
        outlineColor: "#e9fcff",
      },
    ];

    for (const template of templates) {
      const baseAngle = Math.atan2(template.offsetY, template.offsetX);
      const launchAngle =
        baseAngle + (this.random() - 0.5) * template.angleJitter;
      const speed =
        template.speedMin * pilotScale +
        this.random() * (template.speedMax - template.speedMin) * pilotScale;
      const radiusJitter =
        template.radius * pilotScale * (0.92 + this.random() * 0.18);
      const mass = Math.max(0.7, radiusJitter * radiusJitter * 0.06);

      this.pilotDebrisPieces.push({
        kind: template.kind,
        x:
          x +
          template.offsetX * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        y:
          y +
          template.offsetY * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        vx: Math.cos(launchAngle) * speed,
        vy: Math.sin(launchAngle) * speed,
        angle: this.random() * Math.PI * 2,
        angularVelocity: (this.random() - 0.5) * 3.2,
        radius: radiusJitter,
        mass,
        life: Renderer.PILOT_DEBRIS_PERSISTENT_LIFE,
        maxLife: Renderer.PILOT_DEBRIS_PERSISTENT_LIFE,
        persistent: true,
        primaryColor: primaryColor,
        secondaryColor: template.secondaryColor,
        outlineColor: template.outlineColor,
      });
    }

    while (this.pilotDebrisPieces.length > Renderer.MAX_PILOT_DEBRIS_PIECES) {
      this.pilotDebrisPieces.shift();
    }
  }

  drawPilotDeathDebris(): void {
    if (this.pilotDeathBursts.length <= 0 && this.pilotDebrisPieces.length <= 0) {
      return;
    }
    const { ctx } = this;
    for (const burst of this.pilotDeathBursts) {
      const phase = 1 - burst.life / burst.maxLife;
      const implodeT = phase < 0.34 ? 1 - phase / 0.34 : 0;
      const ringRadius = 5 + phase * 16;
      ctx.save();
      ctx.translate(burst.x, burst.y);
      ctx.rotate(burst.angle + phase * 5.8);

      ctx.globalAlpha = Math.max(0, 0.76 * (1 - phase));
      ctx.fillStyle = burst.color;
      ctx.beginPath();
      ctx.arc(0, 0, 2.8 + implodeT * 4.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.max(0, 0.54 * (1 - phase));
      ctx.strokeStyle = "#dff8ff";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = Math.max(0, 0.45 * (1 - phase));
      ctx.strokeStyle = burst.color;
      for (let i = 0; i < 6; i++) {
        const rayAngle = (i / 6) * Math.PI * 2;
        const rayInner = ringRadius * 0.35;
        const rayOuter = ringRadius * 0.78;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rayAngle) * rayInner, Math.sin(rayAngle) * rayInner);
        ctx.lineTo(Math.cos(rayAngle) * rayOuter, Math.sin(rayAngle) * rayOuter);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const piece of this.pilotDebrisPieces) {
      const alpha = Math.max(0, Math.min(1, piece.life / piece.maxLife));
      this.drawPilotDebrisPiece(piece, alpha);
    }
    ctx.globalAlpha = 1;
  }

  private getPilotDebrisAssetId(kind: PilotDebrisKind): PilotDebrisAssetId {
    switch (kind) {
      case "visor":
        return "pilot_death_debris_visor";
      case "shellLeft":
        return "pilot_death_debris_shell_left";
      case "shellRight":
        return "pilot_death_debris_shell_right";
      case "core":
        return "pilot_death_debris_core";
    }
  }

  private getPilotDebrisBaseRadius(kind: PilotDebrisKind): number {
    const pilotScale = this.getPilotDebrisScaleFactor();
    switch (kind) {
      case "visor":
        return 4.1 * pilotScale;
      case "shellLeft":
        return 5.8 * pilotScale;
      case "shellRight":
        return 5.4 * pilotScale;
      case "core":
        return 2.9 * pilotScale;
    }
  }

  private getPilotDebrisScaleFactor(): number {
    const pilotRenderWidth = getEntityAsset("pilot").renderSize.width;
    return (
      (pilotRenderWidth / Renderer.PILOT_DEBRIS_BASELINE_PILOT_WIDTH) *
      Renderer.PILOT_DEBRIS_SCALE_MULTIPLIER
    );
  }

  private drawPilotDebrisPiece(piece: PilotDebrisPiece, alpha: number): void {
    if (alpha <= 0) return;
    const { ctx } = this;

    const spriteAssetId = this.getPilotDebrisAssetId(piece.kind);
    const baseRadius = this.getPilotDebrisBaseRadius(piece.kind);
    const spriteScale = Math.max(0.45, piece.radius / baseRadius);

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.scale(spriteScale, spriteScale);
    ctx.globalAlpha = alpha;
    const drewSprite = this.entitySprites.drawEntity(ctx, spriteAssetId, {
      "slot-primary": piece.primaryColor,
      "slot-secondary": piece.secondaryColor,
      "slot-stroke": piece.outlineColor,
    });
    ctx.restore();
    if (drewSprite) {
      return;
    }

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.globalAlpha = alpha;

    if (piece.kind === "visor") {
      const r = piece.radius;
      ctx.fillStyle = piece.secondaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = piece.primaryColor;
      ctx.globalAlpha = alpha * 0.34;
      ctx.beginPath();
      ctx.ellipse(0.4 * r, -0.05 * r, r * 0.72, r * 0.46, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = "#eaf9ff";
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(r * 0.38, -r * 0.4, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.restore();
      return;
    }

    if (piece.kind === "core") {
      const r = piece.radius;
      ctx.fillStyle = piece.primaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const s = piece.radius / 5.8;
    ctx.scale(s, s);
    ctx.fillStyle = piece.primaryColor;
    ctx.strokeStyle = piece.outlineColor;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-6.8, -4.3);
      ctx.lineTo(-1.8, -5.5);
      ctx.lineTo(0.5, -1.2);
      ctx.lineTo(0.5, 1.2);
      ctx.lineTo(-1.7, 5.4);
      ctx.lineTo(-6.1, 4.5);
      ctx.lineTo(-7.3, 0.2);
    } else {
      ctx.moveTo(-1.4, -5.5);
      ctx.lineTo(2.8, -5.4);
      ctx.lineTo(5.1, -3.7);
      ctx.lineTo(6.5, -1.1);
      ctx.lineTo(6.5, 1.1);
      ctx.lineTo(5.1, 3.7);
      ctx.lineTo(2.8, 5.4);
      ctx.lineTo(-1.4, 5.5);
      ctx.lineTo(-2.4, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = piece.secondaryColor;
    ctx.globalAlpha = alpha * 0.34;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-5.4, -2.8);
      ctx.lineTo(-2.0, -3.4);
      ctx.lineTo(-0.8, -0.8);
      ctx.lineTo(-0.8, 0.8);
      ctx.lineTo(-2.1, 3.3);
      ctx.lineTo(-5.2, 2.6);
    } else {
      ctx.moveTo(-0.3, -3.8);
      ctx.lineTo(2.6, -3.6);
      ctx.lineTo(4.3, -2.3);
      ctx.lineTo(5.2, -0.9);
      ctx.lineTo(5.2, 0.9);
      ctx.lineTo(4.2, 2.4);
      ctx.lineTo(2.6, 3.6);
      ctx.lineTo(-0.2, 3.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.restore();
  }

  private updatePilotDeathDebris(dt: number): void {
    const linearDrag = Math.max(0, 1 - dt * 5.8);
    const angularDrag = Math.max(0, 1 - dt * 7.2);

    for (let i = this.pilotDeathBursts.length - 1; i >= 0; i--) {
      const burst = this.pilotDeathBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        this.pilotDeathBursts.splice(i, 1);
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      piece.vx *= linearDrag;
      piece.vy *= linearDrag;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.angularVelocity * dt;
      piece.angularVelocity *= angularDrag;

      const minX = piece.radius;
      const maxX = GAME_CONFIG.ARENA_WIDTH - piece.radius;
      if (piece.x < minX) {
        piece.x = minX;
        piece.vx = Math.abs(piece.vx) * 0.38;
      } else if (piece.x > maxX) {
        piece.x = maxX;
        piece.vx = -Math.abs(piece.vx) * 0.38;
      }

      const minY = piece.radius;
      const maxY = GAME_CONFIG.ARENA_HEIGHT - piece.radius;
      if (piece.y < minY) {
        piece.y = minY;
        piece.vy = Math.abs(piece.vy) * 0.38;
      } else if (piece.y > maxY) {
        piece.y = maxY;
        piece.vy = -Math.abs(piece.vy) * 0.38;
      }

      if (!piece.persistent) {
        piece.life -= dt;
        const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
        if (speedSq < 16 && piece.life < piece.maxLife * 0.45) {
          piece.life -= dt * 1.35;
        }
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const a = this.pilotDebrisPieces[i];
      for (let j = i + 1; j < this.pilotDebrisPieces.length; j++) {
        const b = this.pilotDebrisPieces[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(Math.max(1e-6, distSq));
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const separateA = overlap * (b.mass / (a.mass + b.mass));
        const separateB = overlap * (a.mass / (a.mass + b.mass));
        a.x -= nx * separateA;
        a.y -= ny * separateA;
        b.x += nx * separateB;
        b.y += ny * separateB;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal >= 0) continue;
        const restitution = 0.32;
        const impulse =
          (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.vx -= impulseX / a.mass;
        a.vy -= impulseY / a.mass;
        b.vx += impulseX / b.mass;
        b.vy += impulseY / b.mass;
      }
    }

    for (let i = this.pilotDebrisPieces.length - 1; i >= 0; i--) {
      if (this.pilotDebrisPieces[i].life <= 0) {
        this.pilotDebrisPieces.splice(i, 1);
      }
    }
  }

  private bumpPilotDebrisWithBody(
    bodyX: number,
    bodyY: number,
    bodyRadius: number,
    bodyVx: number,
    bodyVy: number,
  ): void {
    if (this.pilotDebrisPieces.length <= 0) return;
    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      const dx = piece.x - bodyX;
      const dy = piece.y - bodyY;
      const minDist = piece.radius + bodyRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(Math.max(1e-6, distSq));
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      piece.x += nx * (overlap + 0.08);
      piece.y += ny * (overlap + 0.08);

      piece.vx += nx * 10 + bodyVx * 0.15;
      piece.vy += ny * 10 + bodyVy * 0.15;
      const maxSpeed = 88;
      const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
      if (speedSq > maxSpeed * maxSpeed) {
        const speed = Math.sqrt(speedSq);
        const scale = maxSpeed / speed;
        piece.vx *= scale;
        piece.vy *= scale;
      }
      piece.angularVelocity += (bodyVx * ny - bodyVy * nx) * 0.03;
    }
  }

  updateParticles(dt: number): void {
    this.updatePilotDeathDebris(dt);

    for (let i = this.bulletCasings.length - 1; i >= 0; i--) {
      const casing = this.bulletCasings[i];
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

  drawBulletCasings(): void {
    const { ctx } = this;
    const nowMs = this.getNowMs();
    for (const casing of this.bulletCasings) {
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

    const direction = playerMovementDirection === -1 ? -1 : 1;
    const { ringAngle, snakeAngle, snakeSizeFlipT } = this.getStableCenterHoleAngles(
      hole,
      time,
      direction,
    );

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
      const rotationAngle = ringAngle;
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

      const arrowAngle = rotationAngle + 0.25 * direction;
      const ax = hole.x + Math.cos(arrowAngle) * (lineRadius + 8);
      const ay = hole.y + Math.sin(arrowAngle) * (lineRadius + 8);
      const arrowSize = 10;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(
        arrowAngle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2),
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
        const trailAngle = rotationAngle - i * 0.4 * direction;
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
      this.drawVortexSnake(hole, snakeAngle, snakeSizeFlipT, theme);
    }

    ctx.restore();
  }

  private getCenterHoleStateKey(hole: CenterHole): string {
    return `${hole.x}|${hole.y}|${hole.radius}`;
  }

  private getStableCenterHoleAngles(
    hole: CenterHole,
    time: number,
    direction: number,
  ): { ringAngle: number; snakeAngle: number; snakeSizeFlipT: number } {
    const ringSpeed = 1.5;
    const snakeSpeed = 1.2;
    const sizeFlipRate = 8;
    const sizeFlipTarget = direction === -1 ? 1 : 0;
    const key = this.getCenterHoleStateKey(hole);
    const state = this.centerHoleRotationState.get(key);
    if (!state) {
      const initial = {
        direction,
        ringOffset: 0,
        snakeOffset: 0,
        snakeSizeFlipT: sizeFlipTarget,
        lastTime: time,
      };
      this.centerHoleRotationState.set(key, initial);
      return {
        ringAngle: time * ringSpeed * direction,
        snakeAngle: time * snakeSpeed * direction,
        snakeSizeFlipT: initial.snakeSizeFlipT,
      };
    }

    const dt = this.clamp(time - state.lastTime, 0, 0.2);
    if (state.direction !== direction) {
      const currentRingAngle = time * ringSpeed * state.direction + state.ringOffset;
      state.ringOffset = currentRingAngle - time * ringSpeed * direction;

      const currentSnakeAngle = time * snakeSpeed * state.direction + state.snakeOffset;
      state.snakeOffset = currentSnakeAngle - time * snakeSpeed * direction;

      state.direction = direction;
    }
    const blendAlpha = 1 - Math.exp(-sizeFlipRate * dt);
    state.snakeSizeFlipT +=
      (sizeFlipTarget - state.snakeSizeFlipT) * blendAlpha;
    state.lastTime = time;

    return {
      ringAngle: time * ringSpeed * state.direction + state.ringOffset,
      snakeAngle: time * snakeSpeed * state.direction + state.snakeOffset,
      snakeSizeFlipT: state.snakeSizeFlipT,
    };
  }

  private drawVortexSnake(
    hole: CenterHole,
    baseAngle: number,
    sizeFlipT: number,
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
    const segmentCount = 8;
    const segmentSpacing = 0.25;
    const leadIndex = (segmentCount - 1) * this.clamp01(sizeFlipT);

    ctx.save();
    for (let i = segmentCount - 1; i >= 0; i--) {
      // Keep segment spacing independent from rotation direction so
      // direction swaps reverse motion smoothly without flipping tail side.
      const segmentAngle = baseAngle - i * segmentSpacing;
      const x = hole.x + Math.cos(segmentAngle) * snakeRadius;
      const y = hole.y + Math.sin(segmentAngle) * snakeRadius;
      const flippedIndex = segmentCount - 1 - i;
      const visualIndex = i + (flippedIndex - i) * sizeFlipT;
      const size = 8 - visualIndex * 0.6;
      const alpha = 1 - visualIndex * 0.08;
      const leadWeight = this.clamp01(1 - Math.abs(i - leadIndex));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(segmentAngle);
      if (leadWeight > 0) {
        ctx.shadowColor = "#ff8844";
        ctx.shadowBlur = 20 * leadWeight;
      }

      const r = 255;
      const g = Math.floor(136 - visualIndex * 12);
      const b = Math.floor(68 - visualIndex * 6);
      ctx.fillStyle = "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.2, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (leadWeight > 0) {
        ctx.fillStyle = "rgba(255, 170, 102, " + leadWeight + ")";
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

  drawMineState(state: import("../../types").MineState): void {
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
