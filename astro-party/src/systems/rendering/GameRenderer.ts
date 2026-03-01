import { Renderer } from "./Renderer";
import { RenderEffectsSystem } from "./RenderEffectsSystem";
import { resolveShipSkinIdForPlayer } from "../../../shared/geometry/ShipSkins";
import {
  GAME_CONFIG,
  GamePhase,
  MapId,
  PlayerData,
  PlayerPowerUp,
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
  TurretState,
  TurretBulletState,
} from "../../types";
import { getMapDefinition, type YellowBlock } from "../../../shared/sim/maps";

export interface RenderContext {
  dt: number;
  nowMs: number;
  phase: GamePhase;
  countdown: number;
  showMapElements: boolean;
  hideBorder: boolean;
  isDevModeEnabled: boolean;
  playerPowerUps: Map<string, PlayerPowerUp | null>;
  players: Map<string, PlayerData>;
  networkShips: ShipState[];
  networkPilots: PilotState[];
  networkProjectiles: ProjectileState[];
  networkAsteroids: AsteroidState[];
  networkPowerUps: PowerUpState[];
  networkLaserBeams: LaserBeamState[];
  networkMines: MineState[];
  networkHomingMissiles: HomingMissileState[];
  networkTurret: TurretState | null;
  networkTurretBullets: TurretBulletState[];
  mapId: MapId;
  rotationDirection: number;
  yellowBlockHp: number[];
  networkLaserBeamWidth: number;
}

interface GameplayRenderData {
  renderShips: ShipState[];
  renderPilots: PilotState[];
  renderProjectiles: ProjectileState[];
  renderAsteroids: AsteroidState[];
  renderPowerUps: PowerUpState[];
  renderLaserBeams: LaserBeamState[];
  renderMines: MineState[];
  renderHomingMissiles: HomingMissileState[];
  renderTurret: TurretState | null;
  renderTurretBullets: TurretBulletState[];
}

export class GameRenderer {
  private mapVisualTimeSec = 0;

  constructor(
    private renderer: Renderer,
    private effects: RenderEffectsSystem,
  ) {}

  render(ctx: RenderContext): void {
    this.renderer.clear();
    this.renderer.beginFrame();
    this.renderer.setGameTimeMs(this.usesSimTime(ctx.phase) ? ctx.nowMs : null);

    const map = getMapDefinition(ctx.mapId);
    const mapTheme = this.getMapTheme(ctx.mapId);
    const mapTimeSec = this.advanceMapVisualTime(ctx.dt);
    this.renderMapPass(ctx, map, mapTheme, mapTimeSec);

    if (this.isGameplayRenderPhase(ctx.phase)) {
      this.renderGameplayPass(ctx);
    }

    this.renderCountdownPass(ctx);

    this.renderer.endFrame();
  }

  private usesSimTime(phase: GamePhase): boolean {
    return phase === "PLAYING" || phase === "GAME_END" || phase === "ROUND_END";
  }

  private isGameplayRenderPhase(phase: GamePhase): boolean {
    return phase === "PLAYING" || phase === "GAME_END";
  }

  private advanceMapVisualTime(dt: number): number {
    // Keep map FX phase on a monotonic local clock to avoid
    // snapshot-time jitter causing apparent random jumps on direction swaps.
    this.mapVisualTimeSec += Math.max(0, Math.min(dt, 0.1));
    return this.mapVisualTimeSec;
  }

  private renderMapPass(
    ctx: RenderContext,
    map: ReturnType<typeof getMapDefinition>,
    mapTheme: ReturnType<GameRenderer["getMapTheme"]>,
    mapTimeSec: number,
  ): void {
    if (!ctx.showMapElements) return;

    if (!ctx.hideBorder) {
      this.renderer.drawArenaBorder(mapTheme.border);
    }
    for (const block of this.getYellowBlocksForRender(
      map.yellowBlocks,
      ctx.yellowBlockHp,
    )) {
      this.renderer.drawYellowBlock(block);
    }
    for (const hole of map.centerHoles) {
      this.renderer.drawCenterHole(
        hole,
        mapTimeSec,
        ctx.rotationDirection === -1 ? -1 : 1,
        mapTheme.centerHole,
      );
    }
    for (const zone of map.repulsionZones) {
      this.renderer.drawRepulsionZone(zone, mapTimeSec, mapTheme.repulsion);
    }
  }

  private renderGameplayPass(ctx: RenderContext): void {
    const data = this.getGameplayRenderData(ctx);

    data.renderShips.forEach((state) => {
      if (!state.alive) return;
      const player = ctx.players.get(state.playerId);
      if (!player) return;
      this.renderer.sampleShipTrail(state, player.color);
    });
    this.renderer.drawShipTrails();

    // Draw beams first so ship art can sit on top of the beam origin.
    data.renderLaserBeams.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawLaserBeam(state, ctx.networkLaserBeamWidth);
    });

    data.renderShips.forEach((state) => {
      if (!state.alive) return;
      const player = ctx.players.get(state.playerId);
      if (!player) return;
      const powerUp = ctx.playerPowerUps.get(state.playerId);
      const renderData = this.getShipPowerUpRenderData(powerUp, ctx.nowMs);
      const shipSkinId = resolveShipSkinIdForPlayer(state.playerId);
      this.renderer.drawShip(
        state,
        player.color,
        shipSkinId,
        renderData.shieldHits,
        renderData.laserCharges,
        renderData.laserMaxCharges,
        renderData.laserCooldownProgress,
        renderData.scatterCharges,
        renderData.scatterCooldownProgress,
        renderData.joustLeftActive,
        renderData.joustRightActive,
        renderData.homingMissileCharges,
      );
    });

    data.renderPilots.forEach((state) => {
      if (!state.alive) return;
      const player = ctx.players.get(state.playerId);
      if (!player) return;
      this.renderer.drawPilot(state, player.color);
    });

    this.effects.drawPilotDeathDebris();
    this.effects.drawBulletCasings();

    data.renderProjectiles.forEach((state) => {
      this.renderer.drawProjectile(state);
    });

    data.renderAsteroids.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawAsteroid(state);
    });

    data.renderPowerUps.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawPowerUp(state);
    });

    data.renderMines.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawMineState(state);
    });

    data.renderHomingMissiles.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawHomingMissile(state);
    });

    if (data.renderTurret) {
      this.renderer.drawTurret(data.renderTurret);
    }

    data.renderTurretBullets.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawTurretBullet(state);
    });

    if (ctx.isDevModeEnabled) {
      this.renderDebugOverlaysPass(data);
    }

    if (this.renderer.hasMapOverlay(ctx.mapId)) {
      this.renderer.drawMapOverlay(ctx.mapId);
    }

    this.effects.drawParticles();
  }

  private renderDebugOverlaysPass(data: GameplayRenderData): void {
    data.renderShips.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawShipColliderDebug(state);
    });
    this.renderer.drawProjectileSweepDebug(data.renderProjectiles);

    data.renderHomingMissiles.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawHomingMissileDetectionRadius(
        state.x,
        state.y,
        GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
      );
    });

    const mineDetectionRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33;
    data.renderMines.forEach((state) => {
      if (!state.alive || state.exploded) return;
      this.renderer.drawMineDetectionRadius(
        state.x,
        state.y,
        mineDetectionRadius,
      );
    });

    if (data.renderTurret) {
      this.renderer.drawTurretDetectionRadius(
        data.renderTurret.x,
        data.renderTurret.y,
        data.renderTurret.detectionRadius,
      );
    }

    data.renderTurretBullets.forEach((state) => {
      if (!state.alive || state.exploded) return;
      this.renderer.drawTurretBulletRadius(
        state.x,
        state.y,
        Number.isFinite(state.explosionRadius) ? state.explosionRadius : 100,
      );
    });

    data.renderPowerUps.forEach((state) => {
      if (!state.alive) return;
      this.renderer.drawPowerUpMagneticRadius(
        state.x,
        state.y,
        state.magneticRadius || 150,
        state.isMagneticActive || false,
      );
    });
  }

  private renderCountdownPass(ctx: RenderContext): void {
    if (ctx.phase !== "COUNTDOWN") return;
    this.renderer.drawCountdown(ctx.countdown > 0 ? ctx.countdown : 0);
  }

  private getGameplayRenderData(ctx: RenderContext): GameplayRenderData {
    return {
      renderShips: ctx.networkShips,
      renderPilots: ctx.networkPilots,
      renderProjectiles: ctx.networkProjectiles,
      renderAsteroids: ctx.networkAsteroids,
      renderPowerUps: ctx.networkPowerUps,
      renderLaserBeams: ctx.networkLaserBeams,
      renderMines: ctx.networkMines,
      renderHomingMissiles: ctx.networkHomingMissiles,
      renderTurret: ctx.networkTurret,
      renderTurretBullets: ctx.networkTurretBullets,
    };
  }

  private getShipPowerUpRenderData(
    powerUp: PlayerPowerUp | null | undefined,
    nowMs: number,
  ): {
    shieldHits?: number;
    laserCharges?: number;
    laserMaxCharges?: number;
    laserCooldownProgress?: number;
    scatterCharges?: number;
    scatterCooldownProgress?: number;
    joustLeftActive?: boolean;
    joustRightActive?: boolean;
    homingMissileCharges?: number;
  } {
    const shieldHits =
      powerUp?.type === "SHIELD" ? powerUp.shieldHits : undefined;
    const laserCharges =
      powerUp?.type === "LASER" ? powerUp.charges : undefined;
    const laserMaxCharges =
      powerUp?.type === "LASER" ? Math.max(1, powerUp.maxCharges) : undefined;
    const laserCooldownProgress =
      powerUp?.type === "LASER" &&
      powerUp.charges < Math.max(1, powerUp.maxCharges)
        ? Math.min(
            1,
            (nowMs - powerUp.lastFireTime) / GAME_CONFIG.POWERUP_LASER_COOLDOWN,
          )
        : undefined;
    const scatterCharges =
      powerUp?.type === "SCATTER" ? powerUp.charges : undefined;
    const scatterCooldownProgress =
      powerUp?.type === "SCATTER" &&
      powerUp.charges < GAME_CONFIG.POWERUP_SCATTER_CHARGES
        ? Math.min(
            1,
            (nowMs - powerUp.lastFireTime) /
              GAME_CONFIG.POWERUP_SCATTER_COOLDOWN,
          )
        : undefined;
    const joustLeftActive =
      powerUp?.type === "JOUST" ? powerUp.leftSwordActive : undefined;
    const joustRightActive =
      powerUp?.type === "JOUST" ? powerUp.rightSwordActive : undefined;
    const homingMissileCharges =
      powerUp?.type === "HOMING_MISSILE" ? powerUp.charges : undefined;

    return {
      shieldHits,
      laserCharges,
      laserMaxCharges,
      laserCooldownProgress,
      scatterCharges,
      scatterCooldownProgress,
      joustLeftActive,
      joustRightActive,
      homingMissileCharges,
    };
  }

  private getYellowBlocksForRender(
    yellowBlocks: YellowBlock[],
    networkYellowBlockHp: number[],
  ): YellowBlock[] {
    if (networkYellowBlockHp.length <= 0) return [];
    if (networkYellowBlockHp.length !== yellowBlocks.length) return [];
    return yellowBlocks.filter(
      (_, index) => (networkYellowBlockHp[index] ?? 1) > 0,
    );
  }

  private getMapTheme(mapId: MapId): {
    border: string;
    centerHole?: {
      drawSnake?: boolean;
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    };
    repulsion?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    };
  } {
    switch (mapId) {
      case 1:
        return { border: "#e7c04d" };
      case 2:
        return {
          border: "#ef7b4a",
          centerHole: {
            drawSnake: true,
            ring: "#ef7b4a",
            innerRing: "#ffd19c",
            arrow: "#fff0d8",
            glow: "#ef7b4a",
            gradientInner: "#2b1510",
            gradientMid: "#56251a",
            gradientOuter: "#85422c",
          },
        };
      case 3:
        return {
          border: "#ff2f56",
          repulsion: {
            gradientInner: "#a3173e",
            gradientMid: "#5f1128",
            gradientOuter: "#2b0712",
            core: "#640c22",
            ring: "#ff2f56",
            arrow: "#ff9b8f",
            glow: "#a3173e",
          },
        };
      case 4:
        return {
          border: "#50c97f",
        };
      case 5:
        return {
          border: "#58b5ff",
        };
      case 0:
      default:
        // Classic rotation selector (map 0) uses a neutral border because
        // it doesn't represent a specific arena theme.
        return { border: "#8a9eb8" };
    }
  }
}
