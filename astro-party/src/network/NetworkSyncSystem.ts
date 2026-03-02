import { Renderer } from "../systems/rendering/Renderer";
import { NetworkManager } from "./NetworkManager";
import { PlayerManager } from "../managers/PlayerManager";
import { NETWORK_GAME_FEEL_TUNING } from "./gameFeel/NetworkGameFeelTuning";
import { SHIP_DODGE_ANGLE_DEG } from "../../shared/sim/constants.js";
import { getShipMuzzleWorldPoint } from "../../shared/geometry/ShipRenderAnchors";
import {
  triggerMineArmingFeedback,
  triggerMineExplodeFeedback,
} from "../feedback/networkFeedback";
import {
  ASTEROID_COLLIDER_VERTEX_SCALE,
  AsteroidColliderSync,
  GAME_CONFIG,
  GameStateSync,
  PlayerInput,
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
} from "../types";

interface SnapshotFrame {
  state: GameStateSync;
  receivedAtMs: number;
  hostTick: number;
  tickDurationMs: number;
  hostTimeMs: number;
}

export interface RenderNetworkState {
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
  networkRotationDirection: number;
  networkYellowBlockHp: number[];
  networkLaserBeamWidth: number;
}

export interface NetworkPredictionDebugTelemetry {
  predictionErrorPxLast: number;
  predictionErrorPxEwma: number;
  presentationLagPxLast: number;
  presentationLagPxEwma: number;
  wallCorrectionEvents: number;
  wallOscillationEvents: number;
  wallOscillationRatio: number;
  hostNowBiasTicks: number | null;
  hostNowBiasMs: number | null;
  estimatedHostNowTick: number | null;
  latestSnapshotTick: number | null;
  capturedInputTick: number | null;
  latestHostAckTick: number | null;
  inputAckGapTicks: number | null;
  inputAckGapMs: number | null;
}

export class NetworkSyncSystem {
  private static readonly DEFAULT_TICK_MS = 1000 / 60;

  private latestSnapshotFrame: SnapshotFrame | null = null;
  private lastAppliedHostTick = -1;
  private latestRotationDirection = 1;

  private snapshotJitterMs = 0;
  private snapshotIntervalMs = 0;
  private lastSnapshotReceivedAtMs = 0;
  private lastSnapshotAgeMs = 0;
  private lastPlayerStateSyncMs = 0;

  private hostNowBiasMs: number | null = null;
  private hostNowBiasTicks: number | null = null;
  private estimatedHostNowTick: number | null = null;
  private latestHostAckSequence: number | null = null;
  private lastCapturedInputSequence = 0;
  private lastSentInputSequence = 0;

  private networkShips: ShipState[] = [];
  private networkPilots: PilotState[] = [];
  private networkProjectiles: ProjectileState[] = [];
  private networkAsteroids: AsteroidState[] = [];
  private networkPowerUps: PowerUpState[] = [];
  private networkLaserBeams: LaserBeamState[] = [];
  private networkMines: MineState[] = [];
  private networkHomingMissiles: HomingMissileState[] = [];
  private networkTurret: TurretState | null = null;
  private networkTurretBullets: TurretBulletState[] = [];
  private networkRotationDirection = 1;
  private networkYellowBlockHp: number[] = [];
  private networkLaserBeamWidth: number = GAME_CONFIG.POWERUP_BEAM_WIDTH;

  hostSimTimeMs = 0;

  private clientArmingMines: Set<string> = new Set();
  private clientExplodedMines: Set<string> = new Set();
  private clientProjectileIds: Set<string> = new Set();
  private hasProjectileBaseline = false;
  private clientShipPositions: Map<
    string,
    { x: number; y: number; color: string; alive: boolean }
  > = new Map();
  private clientAsteroidStates: Map<
    string,
    { x: number; y: number; size: number }
  > = new Map();
  private clientPilotPositions: Map<string, { x: number; y: number }> =
    new Map();
  private asteroidColliderVerticesById = new Map<
    string,
    Array<{ x: number; y: number }>
  >();

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  captureLocalInput(input: PlayerInput): void {
    if (!Number.isFinite(input.inputSequence)) return;
    this.lastCapturedInputSequence = Math.max(
      this.lastCapturedInputSequence,
      Math.floor(input.inputSequence),
    );
  }

  recordSentInput(input: PlayerInput): void {
    if (!Number.isFinite(input.inputSequence)) return;
    this.lastSentInputSequence = Math.max(
      this.lastSentInputSequence,
      Math.floor(input.inputSequence),
    );
  }

  triggerLocalDashPrediction(playerId: string): void {
    const ship = this.getLocalVisualShip(playerId);
    if (!ship) return;
    const color =
      this.playerMgr.players.get(playerId)?.color.primary ?? "#ffffff";
    const dodgeAngle =
      ship.angle +
      ((SHIP_DODGE_ANGLE_DEG * Math.PI) / 180) * this.latestRotationDirection;
    this.renderer.spawnDashParticles(ship.x, ship.y, dodgeAngle, color, 10);
  }

  triggerLocalFirePrediction(playerId: string): void {
    const ship = this.getLocalVisualShip(playerId);
    if (!ship) return;
    const color =
      this.playerMgr.players.get(playerId)?.color.primary ?? "#ffffff";
    const muzzlePoint = getShipMuzzleWorldPoint(ship);
    const muzzleX = muzzlePoint.x;
    const muzzleY = muzzlePoint.y;
    for (let i = 0; i < 3; i += 1) {
      this.renderer.spawnParticle(muzzleX, muzzleY, color, "hit");
    }
    this.renderer.spawnParticle(muzzleX, muzzleY, "#ffffff", "hit");
  }

  applyAsteroidColliders(payload: AsteroidColliderSync[]): void {
    if (!Array.isArray(payload) || payload.length === 0) return;
    for (const entry of payload) {
      if (!entry || typeof entry.asteroidId !== "string") continue;
      const decoded = this.decodeAsteroidVertices(entry.vertices);
      if (decoded.length < 3) continue;
      this.asteroidColliderVerticesById.set(entry.asteroidId, decoded);
    }
  }

  getRenderState(
    _myPlayerId: string | null = null,
    _latencyMs: number = 0,
  ): RenderNetworkState {
    const frame = this.latestSnapshotFrame;
    if (!frame) {
      return this.buildRenderState();
    }

    const nowMs = performance.now();
    if (this.lastSnapshotReceivedAtMs > 0) {
      this.lastSnapshotAgeMs = Math.max(
        0,
        nowMs - this.lastSnapshotReceivedAtMs,
      );
    }

    const extrapolationMs = this.clamp(
      nowMs - frame.receivedAtMs,
      0,
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs,
    );
    const renderState = this.buildExtrapolatedSnapshotState(
      frame.state,
      extrapolationMs,
    );

    this.hostSimTimeMs = frame.hostTimeMs + extrapolationMs;
    this.estimatedHostNowTick =
      frame.tickDurationMs > 0
        ? this.hostSimTimeMs / frame.tickDurationMs
        : frame.hostTick;

    this.applyDirectSnapshotState(renderState);
    return this.buildRenderState();
  }

  getSnapshotTelemetry(): {
    jitterMs: number;
    snapshotAgeMs: number;
    snapshotIntervalMs: number;
  } {
    return {
      jitterMs: this.snapshotJitterMs,
      snapshotAgeMs: this.lastSnapshotAgeMs,
      snapshotIntervalMs: this.snapshotIntervalMs,
    };
  }

  applyNetworkState(state: GameStateSync): void {
    const hydratedState = this.hydrateAsteroidVertices(state);
    const normalizedHostTick = Number.isFinite(hydratedState.hostTick)
      ? Math.floor(hydratedState.hostTick)
      : this.lastAppliedHostTick + 1;
    const normalizedTickDurationMs =
      Number.isFinite(hydratedState.tickDurationMs) &&
      hydratedState.tickDurationMs > 0
        ? hydratedState.tickDurationMs
        : NetworkSyncSystem.DEFAULT_TICK_MS;

    if (normalizedHostTick <= this.lastAppliedHostTick) {
      return;
    }

    this.lastAppliedHostTick = normalizedHostTick;
    this.latestRotationDirection =
      hydratedState.rotationDirection ?? this.latestRotationDirection;

    const receivedAtMs = performance.now();
    if (this.lastSnapshotReceivedAtMs > 0) {
      const interval = receivedAtMs - this.lastSnapshotReceivedAtMs;
      this.snapshotIntervalMs = interval;
      const jitterSample = Math.abs(interval - normalizedTickDurationMs);
      this.snapshotJitterMs =
        this.snapshotJitterMs * 0.85 + jitterSample * 0.15;
    } else {
      this.snapshotIntervalMs = normalizedTickDurationMs;
      this.snapshotJitterMs = 0;
    }
    this.lastSnapshotReceivedAtMs = receivedAtMs;
    this.lastSnapshotAgeMs = 0;

    const frame: SnapshotFrame = {
      state: hydratedState,
      receivedAtMs,
      hostTick: normalizedHostTick,
      tickDurationMs: normalizedTickDurationMs,
      hostTimeMs: normalizedHostTick * normalizedTickDurationMs,
    };
    this.latestSnapshotFrame = frame;
    this.hostSimTimeMs = frame.hostTimeMs;
    this.estimatedHostNowTick = frame.hostTick;

    if (Number.isFinite(hydratedState.serverNowMs)) {
      const biasSample = Date.now() - (hydratedState.serverNowMs as number);
      this.hostNowBiasMs =
        this.hostNowBiasMs === null
          ? biasSample
          : this.hostNowBiasMs * 0.9 + biasSample * 0.1;
      this.hostNowBiasTicks = this.hostNowBiasMs / normalizedTickDurationMs;
    }

    const myPlayerId = this.network.getMyPlayerId();
    if (myPlayerId && hydratedState.lastProcessedInputSequenceByPlayer) {
      const ackSequence =
        hydratedState.lastProcessedInputSequenceByPlayer[myPlayerId];
      if (Number.isFinite(ackSequence)) {
        this.latestHostAckSequence = Math.floor(ackSequence as number);
      }
    }

    this.syncPlayerStatesFromNetwork();
    this.processAuthoritativeEffects(hydratedState);
    this.syncPlayerPowerUps(hydratedState.playerPowerUps);
    this.applyDirectSnapshotState(hydratedState);
  }

  clear(): void {
    this.networkShips = [];
    this.networkPilots = [];
    this.networkProjectiles = [];
    this.networkAsteroids = [];
    this.networkPowerUps = [];
    this.networkLaserBeams = [];
    this.networkMines = [];
    this.networkHomingMissiles = [];
    this.networkTurret = null;
    this.networkTurretBullets = [];
    this.networkRotationDirection = 1;
    this.networkYellowBlockHp = [];
    this.networkLaserBeamWidth = GAME_CONFIG.POWERUP_BEAM_WIDTH;

    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientProjectileIds.clear();
    this.hasProjectileBaseline = false;
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();
    this.asteroidColliderVerticesById.clear();

    this.resetSnapshotTracking();
  }

  clearClientTracking(): void {
    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientProjectileIds.clear();
    this.hasProjectileBaseline = false;
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();
  }

  clearNetworkEntities(): void {
    this.networkShips = [];
    this.networkPilots = [];
    this.networkProjectiles = [];
    this.networkAsteroids = [];
    this.networkPowerUps = [];
    this.networkLaserBeams = [];
    this.networkMines = [];
    this.networkHomingMissiles = [];
    this.networkTurret = null;
    this.networkTurretBullets = [];
    this.networkRotationDirection = 1;
    this.networkYellowBlockHp = [];
    this.networkLaserBeamWidth = GAME_CONFIG.POWERUP_BEAM_WIDTH;

    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientProjectileIds.clear();
    this.hasProjectileBaseline = false;
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();

    this.resetSnapshotTracking();
  }

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    const capturedSequence = Math.max(
      this.lastCapturedInputSequence,
      this.lastSentInputSequence,
    );
    const ackSequence = this.latestHostAckSequence ?? 0;
    const gap = Math.max(0, capturedSequence - ackSequence);

    return {
      predictionErrorPxLast: 0,
      predictionErrorPxEwma: 0,
      presentationLagPxLast: 0,
      presentationLagPxEwma: 0,
      wallCorrectionEvents: 0,
      wallOscillationEvents: 0,
      wallOscillationRatio: 0,
      hostNowBiasTicks: this.hostNowBiasTicks,
      hostNowBiasMs: this.hostNowBiasMs,
      estimatedHostNowTick: this.estimatedHostNowTick,
      latestSnapshotTick:
        this.lastAppliedHostTick >= 0 ? this.lastAppliedHostTick : null,
      capturedInputTick: capturedSequence > 0 ? capturedSequence : null,
      latestHostAckTick: ackSequence > 0 ? ackSequence : null,
      inputAckGapTicks: gap > 0 ? gap : null,
      inputAckGapMs:
        gap > 0
          ? gap * NETWORK_GAME_FEEL_TUNING.selfPrediction.inputSendIntervalMs
          : null,
    };
  }

  isShipAlive(playerId: string): boolean {
    const ship = this.latestSnapshotFrame?.state.ships.find(
      (entry) => entry.playerId === playerId,
    );
    return Boolean(ship?.alive);
  }

  private buildRenderState(): RenderNetworkState {
    return {
      networkShips: this.networkShips,
      networkPilots: this.networkPilots,
      networkProjectiles: this.networkProjectiles,
      networkAsteroids: this.networkAsteroids,
      networkPowerUps: this.networkPowerUps,
      networkLaserBeams: this.networkLaserBeams,
      networkMines: this.networkMines,
      networkHomingMissiles: this.networkHomingMissiles,
      networkTurret: this.networkTurret,
      networkTurretBullets: this.networkTurretBullets,
      networkRotationDirection: this.networkRotationDirection,
      networkYellowBlockHp: this.networkYellowBlockHp,
      networkLaserBeamWidth: this.networkLaserBeamWidth,
    };
  }

  private buildExtrapolatedSnapshotState(
    state: GameStateSync,
    extrapolationMs: number,
  ): GameStateSync {
    const dtFactor = (extrapolationMs / 1000) * 60;
    if (dtFactor <= 0) return state;

    return {
      ...state,
      ships: (state.ships || []).map((ship) =>
        this.extrapolateShip(ship, extrapolationMs),
      ),
      pilots: (state.pilots || []).map((pilot) => ({
        ...pilot,
        x: pilot.x + pilot.vx * dtFactor,
        y: pilot.y + pilot.vy * dtFactor,
      })),
      projectiles: (state.projectiles || []).map((projectile) => ({
        ...projectile,
        x: projectile.x + projectile.vx * dtFactor,
        y: projectile.y + projectile.vy * dtFactor,
      })),
      asteroids: (state.asteroids || []).map((asteroid) => ({
        ...asteroid,
        x: asteroid.x + asteroid.vx * dtFactor,
        y: asteroid.y + asteroid.vy * dtFactor,
        angle: this.normalizeAngle(
          asteroid.angle + asteroid.angularVelocity * dtFactor,
        ),
      })),
      powerUps: (state.powerUps || []).map((powerUp) => ({ ...powerUp })),
      laserBeams: (state.laserBeams || []).map((beam) => ({ ...beam })),
      mines: (state.mines || []).map((mine) => ({ ...mine })),
      homingMissiles: (state.homingMissiles || []).map((missile) => ({
        ...missile,
        x: missile.x + missile.vx * dtFactor,
        y: missile.y + missile.vy * dtFactor,
      })),
      turret: state.turret ? { ...state.turret } : undefined,
      turretBullets: (state.turretBullets || []).map((bullet) => ({
        ...bullet,
        x: bullet.x + bullet.vx * dtFactor,
        y: bullet.y + bullet.vy * dtFactor,
      })),
    };
  }

  private extrapolateShip(ship: ShipState, extrapolationMs: number): ShipState {
    if (!ship.alive) {
      return { ...ship };
    }
    const dtFactor = (extrapolationMs / 1000) * 60;
    return {
      ...ship,
      x: this.clamp(ship.x + ship.vx * dtFactor, 0, GAME_CONFIG.ARENA_WIDTH),
      y: this.clamp(ship.y + ship.vy * dtFactor, 0, GAME_CONFIG.ARENA_HEIGHT),
    };
  }

  private getLocalVisualShip(playerId: string): ShipState | null {
    const frame = this.latestSnapshotFrame;
    if (!frame) return null;
    const ship = frame.state.ships.find((entry) => entry.playerId === playerId);
    if (!ship) return null;
    const extrapolationMs = this.clamp(
      performance.now() - frame.receivedAtMs,
      0,
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs,
    );
    return this.extrapolateShip(ship, extrapolationMs);
  }

  private applyDirectSnapshotState(state: GameStateSync): void {
    this.networkShips = state.ships || [];
    this.networkPilots = state.pilots || [];
    this.networkProjectiles = state.projectiles || [];
    this.networkAsteroids = state.asteroids || [];
    this.networkPowerUps = state.powerUps || [];
    this.networkLaserBeams = state.laserBeams || [];
    this.networkMines = state.mines || [];
    this.networkHomingMissiles = state.homingMissiles || [];
    this.networkTurret = state.turret ?? null;
    this.networkTurretBullets = state.turretBullets || [];
    this.networkRotationDirection =
      state.rotationDirection === -1 ? -1 : 1;
    this.networkYellowBlockHp = state.yellowBlockHp || [];
    this.networkLaserBeamWidth = Number.isFinite(state.laserBeamWidth)
      ? Math.max(1, state.laserBeamWidth as number)
      : GAME_CONFIG.POWERUP_BEAM_WIDTH;
  }

  private hydrateAsteroidVertices(state: GameStateSync): GameStateSync {
    const incomingAsteroids = state.asteroids || [];
    if (incomingAsteroids.length === 0) {
      this.asteroidColliderVerticesById.clear();
      return {
        ...state,
        asteroids: [],
      };
    }

    const aliveAsteroidIds = new Set<string>();
    const asteroids = incomingAsteroids.map((asteroid) => {
      aliveAsteroidIds.add(asteroid.id);

      let vertices = this.normalizeVertices(asteroid.vertices);
      if (vertices.length >= 3) {
        this.asteroidColliderVerticesById.set(
          asteroid.id,
          vertices.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        );
      } else {
        const cached = this.asteroidColliderVerticesById.get(asteroid.id);
        if (cached && cached.length >= 3) {
          vertices = cached.map((point) => ({ x: point.x, y: point.y }));
        } else {
          vertices = this.buildFallbackAsteroidVertices(asteroid.size);
        }
      }

      return {
        ...asteroid,
        vertices,
      };
    });

    for (const asteroidId of [...this.asteroidColliderVerticesById.keys()]) {
      if (aliveAsteroidIds.has(asteroidId)) continue;
      this.asteroidColliderVerticesById.delete(asteroidId);
    }

    return {
      ...state,
      asteroids,
    };
  }

  private normalizeVertices(
    vertices: Array<{ x: number; y: number }> | undefined,
  ): Array<{ x: number; y: number }> {
    if (!Array.isArray(vertices) || vertices.length < 3) return [];
    const normalized: Array<{ x: number; y: number }> = [];
    for (const vertex of vertices) {
      if (!vertex) continue;
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) continue;
      normalized.push({ x: vertex.x, y: vertex.y });
    }
    return normalized.length >= 3 ? normalized : [];
  }

  private decodeAsteroidVertices(
    encodedVertices: number[] | undefined,
  ): Array<{ x: number; y: number }> {
    if (!Array.isArray(encodedVertices) || encodedVertices.length < 6)
      return [];
    const decoded: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < encodedVertices.length; i += 2) {
      const x = encodedVertices[i];
      const y = encodedVertices[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      decoded.push({
        x: x / ASTEROID_COLLIDER_VERTEX_SCALE,
        y: y / ASTEROID_COLLIDER_VERTEX_SCALE,
      });
    }
    return decoded.length >= 3 ? decoded : [];
  }

  private buildFallbackAsteroidVertices(
    size: number,
  ): Array<{ x: number; y: number }> {
    const pointCount = 8;
    const radius = this.clamp(Number.isFinite(size) ? size : 20, 8, 80);
    const vertices: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < pointCount; i += 1) {
      const angle = (i / pointCount) * Math.PI * 2;
      const wobble = 0.85 + Math.sin(i * 2.17) * 0.12;
      vertices.push({
        x: Math.cos(angle) * radius * wobble,
        y: Math.sin(angle) * radius * wobble,
      });
    }
    return vertices;
  }

  private processAuthoritativeEffects(state: GameStateSync): void {
    const incomingShips = state.ships || [];
    const shipById = new Map(incomingShips.map((ship) => [ship.playerId, ship]));
    const currentShipIds = new Set(incomingShips.map((ship) => ship.playerId));
    for (const shipState of incomingShips) {
      const color =
        this.playerMgr.players.get(shipState.playerId)?.color.primary ||
        "#ffffff";
      const previousShip = this.clientShipPositions.get(shipState.playerId);
      if (previousShip?.alive && !shipState.alive) {
        this.renderer.spawnShipDestroyedBurst(
          previousShip.x,
          previousShip.y,
          color,
        );
      }
      this.clientShipPositions.set(shipState.playerId, {
        x: shipState.x,
        y: shipState.y,
        color,
        alive: shipState.alive,
      });
    }
    for (const [playerId] of this.clientShipPositions) {
      if (!currentShipIds.has(playerId)) {
        this.clientShipPositions.delete(playerId);
      }
    }

    const incomingPilots = state.pilots || [];
    const currentPilotIds = new Set(
      incomingPilots.map((pilot) => pilot.playerId),
    );
    for (const [playerId, pilotData] of this.clientPilotPositions) {
      if (!currentPilotIds.has(playerId)) {
        const ownerShip = shipById.get(playerId);
        if (ownerShip && !ownerShip.alive) {
          const pilotColor =
            this.playerMgr.players.get(playerId)?.color.primary ?? "#00f0ff";
          this.renderer.spawnPilotKillBurst(
            pilotData.x,
            pilotData.y,
            pilotColor,
          );
        }
        this.clientPilotPositions.delete(playerId);
      }
    }
    for (const pilotState of incomingPilots) {
      if (!pilotState.alive) continue;
      this.clientPilotPositions.set(pilotState.playerId, {
        x: pilotState.x,
        y: pilotState.y,
      });
    }

    const incomingProjectiles = state.projectiles || [];
    const currentProjectileIds = new Set<string>();
    for (const projectile of incomingProjectiles) {
      currentProjectileIds.add(projectile.id);
    }

    if (!this.hasProjectileBaseline) {
      this.clientProjectileIds = currentProjectileIds;
      this.hasProjectileBaseline = true;
    } else {
      for (const projectile of incomingProjectiles) {
        if (this.clientProjectileIds.has(projectile.id)) continue;
        this.clientProjectileIds.add(projectile.id);

        const ownerShip = shipById.get(projectile.ownerId);
        const shotAngle = ownerShip
          ? ownerShip.angle
          : Math.atan2(projectile.vy, projectile.vx);
        const spawnX = projectile.x - Math.cos(shotAngle) * 8;
        const spawnY = projectile.y - Math.sin(shotAngle) * 8;
        this.renderer.spawnBulletCasing(
          spawnX,
          spawnY,
          shotAngle,
          ownerShip?.vx ?? 0,
          ownerShip?.vy ?? 0,
        );
      }
      for (const projectileId of this.clientProjectileIds) {
        if (!currentProjectileIds.has(projectileId)) {
          this.clientProjectileIds.delete(projectileId);
        }
      }
    }

    const incomingAsteroids = state.asteroids || [];
    const currentAsteroidIds = new Set(
      incomingAsteroids.map((asteroid) => asteroid.id),
    );
    for (const [asteroidId, asteroidData] of this.clientAsteroidStates) {
      if (!currentAsteroidIds.has(asteroidId)) {
        this.renderer.spawnExplosion(
          asteroidData.x,
          asteroidData.y,
          GAME_CONFIG.ASTEROID_COLOR,
        );
        this.renderer.spawnAsteroidDebris(
          asteroidData.x,
          asteroidData.y,
          asteroidData.size,
          GAME_CONFIG.ASTEROID_COLOR,
        );
        this.clientAsteroidStates.delete(asteroidId);
      }
    }
    for (const asteroidState of incomingAsteroids) {
      if (!asteroidState.alive) continue;
      this.clientAsteroidStates.set(asteroidState.id, {
        x: asteroidState.x,
        y: asteroidState.y,
        size: asteroidState.size,
      });
    }

    const incomingMines = state.mines || [];
    for (const mineState of incomingMines) {
      if (
        mineState.arming &&
        !mineState.exploded &&
        !this.clientArmingMines.has(mineState.id)
      ) {
        this.clientArmingMines.add(mineState.id);
        this.renderer.spawnExplosion(mineState.x, mineState.y, "#ff4400");
        triggerMineArmingFeedback();
      }
      if (mineState.exploded && !this.clientExplodedMines.has(mineState.id)) {
        this.clientExplodedMines.add(mineState.id);
        this.renderer.spawnMineExplosion(
          mineState.x,
          mineState.y,
          GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS,
        );
        triggerMineExplodeFeedback();
      }
    }

    const currentMineIds = new Set(incomingMines.map((mine) => mine.id));
    for (const mineId of this.clientArmingMines) {
      if (!currentMineIds.has(mineId)) this.clientArmingMines.delete(mineId);
    }
    for (const mineId of this.clientExplodedMines) {
      if (!currentMineIds.has(mineId)) this.clientExplodedMines.delete(mineId);
    }
  }

  private syncPlayerPowerUps(
    networkPlayerPowerUps: Record<string, PlayerPowerUp | null> | undefined,
  ): void {
    if (!networkPlayerPowerUps) return;
    const activePowerUpIds = new Set(Object.keys(networkPlayerPowerUps));
    for (const playerId of this.playerPowerUps.keys()) {
      if (!activePowerUpIds.has(playerId)) this.playerPowerUps.delete(playerId);
    }
    Object.entries(networkPlayerPowerUps).forEach(([playerId, powerUp]) => {
      this.playerPowerUps.set(playerId, powerUp);
    });
  }

  private syncPlayerStatesFromNetwork(): void {
    if (this.network.isSimulationAuthority()) return;
    const now = performance.now();
    if (now - this.lastPlayerStateSyncMs < 200) return;
    this.lastPlayerStateSyncMs = now;

    let changed = false;
    for (const [playerId, player] of this.playerMgr.players) {
      const netPlayer = this.network.getPlayer(playerId);
      if (!netPlayer) continue;

      const kills = netPlayer.getState("kills") as number | undefined;
      if (Number.isFinite(kills) && kills !== player.kills) {
        player.kills = kills as number;
        changed = true;
      }
      const wins = netPlayer.getState("roundWins") as number | undefined;
      if (Number.isFinite(wins) && wins !== player.roundWins) {
        player.roundWins = wins as number;
        changed = true;
      }
      const score = netPlayer.getState("score") as number | undefined;
      if (Number.isFinite(score) && score !== player.score) {
        player.score = score as number;
        changed = true;
      }
      const state = netPlayer.getState("playerState") as
        | "ACTIVE"
        | "EJECTED"
        | "SPECTATING"
        | undefined;
      if (state && state !== player.state) {
        player.state = state;
        changed = true;
      }
      const name = this.network.getPlayerName(playerId);
      if (name && name !== player.name) {
        player.name = name;
        changed = true;
      }
      const color = this.network.getPlayerColor(playerId);
      if (color.primary !== player.color.primary) {
        player.color = color;
        changed = true;
      }
    }

    if (changed) this.onPlayersUpdate();
  }

  private resetSnapshotTracking(): void {
    this.latestSnapshotFrame = null;
    this.lastAppliedHostTick = -1;
    this.latestRotationDirection = 1;

    this.snapshotJitterMs = 0;
    this.snapshotIntervalMs = 0;
    this.lastSnapshotReceivedAtMs = 0;
    this.lastSnapshotAgeMs = 0;
    this.lastPlayerStateSyncMs = 0;

    this.hostNowBiasMs = null;
    this.hostNowBiasTicks = null;
    this.estimatedHostNowTick = null;
    this.latestHostAckSequence = null;
    this.lastCapturedInputSequence = 0;
    this.lastSentInputSequence = 0;

    this.hostSimTimeMs = 0;
  }

  private normalizeAngle(angle: number): number {
    let out = angle;
    while (out > Math.PI) out -= Math.PI * 2;
    while (out < -Math.PI) out += Math.PI * 2;
    return out;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
