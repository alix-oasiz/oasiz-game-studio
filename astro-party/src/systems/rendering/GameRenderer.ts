import { Renderer } from "./Renderer";
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

export class GameRenderer {
  private mapVisualTimeSec = 0;

  constructor(private renderer: Renderer) {}

  render(ctx: RenderContext): void {
    this.renderer.clear();
    this.renderer.beginFrame();
    const useSimTime =
      ctx.phase === "PLAYING" ||
      ctx.phase === "GAME_END" ||
      ctx.phase === "ROUND_END";
    this.renderer.setGameTimeMs(useSimTime ? ctx.nowMs : null);

    // Stars are now rendered via CSS starfield, not canvas
    const map = getMapDefinition(ctx.mapId);
    const mapTheme = this.getMapTheme(ctx.mapId);
    // Keep map FX phase on a monotonic local clock to avoid
    // snapshot-time jitter causing apparent random jumps on direction swaps.
    this.mapVisualTimeSec += Math.max(0, Math.min(ctx.dt, 0.1));
    const mapTimeSec = this.mapVisualTimeSec;
    if (ctx.showMapElements) {
      this.renderer.drawArenaBorder(mapTheme.border);
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

    if (ctx.phase === "PLAYING" || ctx.phase === "GAME_END") {
      const renderShips = ctx.networkShips;
      const renderPilots = ctx.networkPilots;
      const renderProjectiles = ctx.networkProjectiles;
      const renderAsteroids = ctx.networkAsteroids;
      const renderPowerUps = ctx.networkPowerUps;
      const renderLaserBeams = ctx.networkLaserBeams;
      const renderMines = ctx.networkMines;
      const renderHomingMissiles = ctx.networkHomingMissiles;
      const renderTurret = ctx.networkTurret;
      const renderTurretBullets = ctx.networkTurretBullets;

      renderShips.forEach((state) => {
        if (!state.alive) return;
        const player = ctx.players.get(state.playerId);
        if (!player) return;
        this.renderer.sampleShipTrail(state, player.color);
      });
      this.renderer.drawShipTrails();

      // Draw beams first so ship art can sit on top of the beam origin.
      renderLaserBeams.forEach((state) => {
        if (state.alive) {
          this.renderer.drawLaserBeam(state, ctx.networkLaserBeamWidth);
        }
      });

      renderShips.forEach((state) => {
        if (state.alive) {
          const player = ctx.players.get(state.playerId);
          if (player) {
            const powerUp = ctx.playerPowerUps.get(state.playerId);
            const renderData = this.getShipPowerUpRenderData(
              powerUp,
              ctx.nowMs,
            );
            this.renderer.drawShip(
              state,
              player.color,
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
          }
        }
      });

      renderPilots.forEach((state) => {
        if (state.alive) {
          const player = ctx.players.get(state.playerId);
          if (player) {
            this.renderer.drawPilot(state, player.color);
          }
        }
      });

      this.renderer.drawPilotDeathDebris();
      this.renderer.drawBulletCasings();

      renderProjectiles.forEach((state) => {
        this.renderer.drawProjectile(state);
      });

      renderAsteroids.forEach((state) => {
        if (state.alive) {
          this.renderer.drawAsteroid(state);
        }
      });

      renderPowerUps.forEach((state) => {
        if (state.alive) {
          this.renderer.drawPowerUp(state);
        }
      });

      renderMines.forEach((state) => {
        if (state.alive) {
          this.renderer.drawMineState(state);
        }
      });

      renderHomingMissiles.forEach((state) => {
        if (state.alive) {
          this.renderer.drawHomingMissile(state);
        }
      });

      if (renderTurret) {
        this.renderer.drawTurret(renderTurret);
      }

      renderTurretBullets.forEach((state) => {
        if (state.alive) {
          this.renderer.drawTurretBullet(state);
        }
      });

      if (ctx.isDevModeEnabled) {
        renderShips.forEach((state) => {
          if (state.alive) {
            this.renderer.drawShipColliderDebug(state);
          }
        });
        this.renderer.drawProjectileSweepDebug(renderProjectiles);

        renderHomingMissiles.forEach((state) => {
          if (state.alive) {
            this.renderer.drawHomingMissileDetectionRadius(
              state.x,
              state.y,
              GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
            );
          }
        });

        const mineDetectionRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33;
        renderMines.forEach((state) => {
          if (state.alive && !state.exploded) {
            this.renderer.drawMineDetectionRadius(
              state.x,
              state.y,
              mineDetectionRadius,
            );
          }
        });

        if (renderTurret) {
          this.renderer.drawTurretDetectionRadius(
            renderTurret.x,
            renderTurret.y,
            renderTurret.detectionRadius,
          );
        }

        renderTurretBullets.forEach((state) => {
          if (state.alive && !state.exploded) {
            this.renderer.drawTurretBulletRadius(
              state.x,
              state.y,
              Number.isFinite(state.explosionRadius)
                ? state.explosionRadius
                : 100,
            );
          }
        });

        renderPowerUps.forEach((state) => {
          if (state.alive) {
            this.renderer.drawPowerUpMagneticRadius(
              state.x,
              state.y,
              state.magneticRadius || 150,
              state.isMagneticActive || false,
            );
          }
        });
      }

      if (this.renderer.hasMapOverlay(ctx.mapId)) {
        this.renderer.drawMapOverlay(ctx.mapId);
      }

      this.renderer.drawParticles();
    }

    if (ctx.phase === "COUNTDOWN" && ctx.countdown > 0) {
      this.renderer.drawCountdown(ctx.countdown);
    } else if (ctx.phase === "COUNTDOWN" && ctx.countdown === 0) {
      this.renderer.drawCountdown(0);
    }

    this.renderer.endFrame();
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
        return { border: "#ffee00" };
      case 2:
        return {
          border: "#ff5a2b",
          centerHole: {
            ring: "#ff5a2b",
            innerRing: "#ffb36b",
            arrow: "#ff8844",
            glow: "#ff5a2b",
            gradientInner: "rgba(0, 0, 0, 0.95)",
            gradientMid: "rgba(40, 12, 0, 0.9)",
            gradientOuter: "rgba(90, 35, 10, 0.65)",
          },
        };
      case 3:
        return {
          border: "#ff5a2b",
          repulsion: {
            gradientInner: "rgba(255, 90, 40, 0.45)",
            gradientMid: "rgba(255, 140, 60, 0.2)",
            gradientOuter: "rgba(255, 120, 50, 0)",
            core: "rgba(230, 50, 30, 0.65)",
            ring: "#ff5a2b",
            arrow: "rgba(255, 140, 80, 0.75)",
            glow: "#ff5a2b",
          },
        };
      case 4:
        return {
          border: "#00ff88",
        };
      case 0:
      default:
        return { border: "#00f0ff" };
    }
  }
}
