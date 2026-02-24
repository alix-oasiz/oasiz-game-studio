import {
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  TurretState,
  TurretBulletState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
  PlayerColor,
  GAME_CONFIG,
  MapId,
} from "../../types";
import { SeededRNG } from "../../../shared/sim/SeededRNG";
import { EntitySpriteStore } from "./assets/EntitySpriteStore";
import { MapOverlayStore } from "./assets/MapOverlayStore";
import { PowerUpSpriteStore } from "./assets/PowerUpSpriteStore";
import { RenderEffectsSystem } from "./RenderEffectsSystem";
import {
  ShipTrailRenderer,
  type ShipTrailVisualTuning,
} from "./layers/ShipTrailRenderer";
import { ScreenShakeController } from "./controllers/ScreenShakeController";
import { MapEffectsRenderer } from "./layers/MapEffectsRenderer";
import { CombatVisualsRenderer } from "./layers/CombatVisualsRenderer";
import { RenderDebugSystem } from "./layers/RenderDebugSystem";
import { EntityVisualsRenderer } from "./layers/EntityVisualsRenderer";
import { RenderViewportController } from "./controllers/RenderViewportController";
import type {
  YellowBlock,
  CenterHole,
  RepulsionZone,
} from "../../../shared/sim/maps";
export type { ShipTrailVisualTuning } from "./layers/ShipTrailRenderer";

interface RendererInitDeps {
  onEffectsReady?: (effects: RenderEffectsSystem) => void;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shipTrails = new ShipTrailRenderer();
  private screenShake = new ScreenShakeController();
  private effects: RenderEffectsSystem;
  private visualRng: SeededRNG;
  private gameTimeMs: number | null = null;

  // Dev mode visualization flag
  private devModeEnabled = false;

  private viewport = new RenderViewportController();
  private entitySprites = new EntitySpriteStore();
  private mapEffects: MapEffectsRenderer;
  private mapOverlays = new MapOverlayStore();
  private powerUpSprites = new PowerUpSpriteStore();
  private combatVisuals: CombatVisualsRenderer;
  private entityVisuals: EntityVisualsRenderer;
  private debug: RenderDebugSystem;

  constructor(canvas: HTMLCanvasElement, deps?: RendererInitDeps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.visualRng = new SeededRNG(Date.now() >>> 0);
    this.mapEffects = new MapEffectsRenderer(this.ctx);
    this.combatVisuals = new CombatVisualsRenderer(
      this.ctx,
      this.powerUpSprites,
      () => this.getNowMs(),
      (baseBlurAtUnitScale, minBlur, maxBlur) =>
        this.getEffectBlurPx(baseBlurAtUnitScale, minBlur, maxBlur),
    );
    this.debug = new RenderDebugSystem(this.ctx, () => this.getNowMs());
    this.effects = new RenderEffectsSystem(
      this.ctx,
      this.entitySprites,
      () => this.random(),
      () => this.getNowMs(),
    );
    deps?.onEffectsReady?.(this.effects);
    this.entityVisuals = new EntityVisualsRenderer(this.ctx, this.entitySprites, {
      bumpPilotDebrisWithBody: (x, y, radius, vx, vy) =>
        this.effects.bumpPilotDebrisWithBody(x, y, radius, vx, vy),
      getPilotDebrisScaleFactor: () => this.effects.getPilotDebrisScaleFactor(),
      drawShield: (x, y, hits) => this.combatVisuals.drawShield(x, y, hits),
      getNowMs: () => this.getNowMs(),
      getEffectBlurPx: (baseBlurAtUnitScale, minBlur, maxBlur) =>
        this.getEffectBlurPx(baseBlurAtUnitScale, minBlur, maxBlur),
    });
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

  resize(): void {
    this.viewport.resize(this.canvas, this.ctx);
  }

  setCamera(zoom: number, focusX: number, focusY: number): void {
    this.viewport.setCamera(zoom, focusX, focusY);
  }

  resetCamera(): void {
    this.viewport.resetCamera();
  }

  // Enable/disable dev mode visualization
  setDevMode(enabled: boolean): void {
    this.devModeEnabled = enabled;
    if (!enabled) {
      this.debug.clear();
    }
  }

  // Draw homing missile detection radius (dev mode only)
  drawHomingMissileDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    this.debug.drawHomingMissileDetectionRadius(x, y, radius);
  }

  // Draw mine detection radius (dev mode only)
  drawMineDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    this.debug.drawMineDetectionRadius(x, y, radius);
  }

  // Draw turret detection radius (dev mode only)
  drawTurretDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    this.debug.drawTurretDetectionRadius(x, y, radius);
  }

  // Draw turret bullet explosion radius (dev mode only)
  drawTurretBulletRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    this.debug.drawTurretBulletRadius(x, y, radius);
  }

  // Draw power-up magnetic radius (dev mode only)
  drawPowerUpMagneticRadius(
    x: number,
    y: number,
    radius: number,
    isActive: boolean,
  ): void {
    if (!this.devModeEnabled) return;
    this.debug.drawPowerUpMagneticRadius(x, y, radius, isActive);
  }

  // ============= TURRET RENDERING =============

  drawTurret(state: TurretState): void {
    this.combatVisuals.drawTurret(state);
  }

  // ============= TURRET BULLET RENDERING =============

  drawTurretBullet(state: TurretBulletState): void {
    this.combatVisuals.drawTurretBullet(state);
  }

  clear(): void {
    this.viewport.clear(this.ctx);
  }

  beginFrame(): void {
    this.ctx.save();

    // Apply screen shake (using pre-calculated offsets from updateScreenShake)
    this.screenShake.applyTransform(this.ctx);

    this.viewport.applyWorldTransform(this.ctx);
  }

  endFrame(): void {
    this.ctx.restore();
  }

  updateScreenShake(dt: number): void {
    this.screenShake.update(dt, this.getNowMs());
  }

  addScreenShake(intensity: number, duration: number): void {
    this.screenShake.add(intensity, duration);
  }

  clearEffects(): void {
    this.effects.clear();
    this.shipTrails.clear();
    this.debug.clear();
    this.screenShake.clear();
    this.mapEffects.clearTransientState();
  }

  getShipTrailVisualTuning(): ShipTrailVisualTuning {
    return this.shipTrails.getVisualTuning();
  }

  resetShipTrailVisualTuning(): void {
    this.shipTrails.resetVisualTuning();
  }

  setShipTrailVisualTuning(next: Partial<ShipTrailVisualTuning>): void {
    this.shipTrails.setVisualTuning(next);
  }

  private getEffectBlurPx(
    baseBlurAtUnitScale: number,
    minBlur: number,
    maxBlur: number,
  ): number {
    return this.viewport.getEffectBlurPx(baseBlurAtUnitScale, minBlur, maxBlur);
  }

  // ============= SHIP RENDERING =============

  sampleShipTrail(state: ShipState, color: PlayerColor): void {
    this.shipTrails.sample(state, color, this.getNowMs());
  }

  drawShipTrails(): void {
    this.shipTrails.draw(this.ctx, this.getNowMs());
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
    this.entityVisuals.drawShip(
      state,
      color,
      shieldHits,
      laserCharges,
      laserMaxCharges,
      laserCooldownProgress,
      scatterCharges,
      scatterCooldownProgress,
      joustLeftActive,
      joustRightActive,
      homingMissileCharges,
    );
  }

  // ============= PILOT RENDERING =============

  drawPilot(state: PilotState, color: PlayerColor): void {
    this.entityVisuals.drawPilot(state, color);
  }

  // ============= ASTEROID RENDERING =============

  drawAsteroid(state: AsteroidState): void {
    this.entityVisuals.drawAsteroid(state);
  }

  // ============= PROJECTILE RENDERING =============

  drawProjectile(state: ProjectileState): void {
    this.entityVisuals.drawProjectile(state, this.devModeEnabled);
  }

  drawShipColliderDebug(state: ShipState): void {
    if (!this.devModeEnabled) return;
    this.debug.drawShipColliderDebug(state);
  }

  drawProjectileSweepDebug(projectiles: ProjectileState[]): void {
    if (!this.devModeEnabled) return;
    this.debug.drawProjectileSweepDebug(projectiles);
  }

  // ============= POWER-UP RENDERING =============

  drawPowerUp(state: PowerUpState): void {
    this.combatVisuals.drawPowerUp(state);
  }

  // ============= LASER BEAM RENDERING =============

  drawLaserBeam(state: LaserBeamState, beamWidthOverride?: number): void {
    this.combatVisuals.drawLaserBeam(state, beamWidthOverride);
  }

  // ============= ARENA BORDER =============

  drawArenaBorder(borderColor: string = "#00f0ff"): void {
    this.mapEffects.drawArenaBorder(borderColor);
  }

  drawYellowBlock(block: YellowBlock): void {
    this.mapEffects.drawYellowBlock(block);
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
    this.mapEffects.drawCenterHole(
      hole,
      time,
      playerMovementDirection,
      theme,
    );
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
    this.mapEffects.drawRepulsionZone(zone, time, theme);
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

  // ============= MINE RENDERING =============

  drawMineState(state: MineState): void {
    this.combatVisuals.drawMineState(state);
  }

  // ============= HOMING MISSILE RENDERING =============

  drawHomingMissile(state: HomingMissileState): void {
    this.combatVisuals.drawHomingMissile(state);
  }
}
