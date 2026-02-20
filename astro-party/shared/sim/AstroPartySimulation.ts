import type {
  GamePhase,
  GameMode,
  BaseGameMode,
  MapId,
  PowerUpType,
  PlayerState,
  AdvancedSettings,
  AdvancedSettingsSync,
  PlayerInput,
  PlayerPowerUp,
  RuntimePlayer,
  RuntimePilot,
  RuntimeProjectile,
  RuntimeAsteroid,
  RuntimePowerUp,
  RuntimeLaserBeam,
  RuntimeMine,
  RuntimeHomingMissile,
  RuntimeTurret,
  RuntimeTurretBullet,
  Hooks,
  SnapshotPayload,
  PlayerListPayload,
  PlayerListMeta,
  RoundResultPayload,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
  SimState,
} from "./types.js";
import Matter from "matter-js";
import { SeededRNG } from "./SeededRNG.js";
import { clamp, normalizeAngle } from "./utils.js";
import { Physics } from "./Physics.js";
import { setupCollisions } from "./Collision.js";
import { PlayerIdentityAllocator } from "./PlayerIdentityAllocator.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_PADDING,
  PLAYER_COLORS,
  DEFAULT_ADVANCED_SETTINGS,
  COUNTDOWN_SECONDS,
  ROUND_RESULTS_DURATION_MS,
  FIRE_COOLDOWN_MS,
  MAX_AMMO,
  HOMING_MISSILE_LIFETIME_MS,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
} from "./constants.js";
import {
  getMapDefinition,
  CLASSIC_ROTATION_MAP_IDS,
  type MapDefinition,
  type YellowBlock,
} from "./maps.js";
import {
  REPULSION_TUNING,
  VORTEX_TUNING,
  sampleMapField,
} from "./mapFeatureTuning.js";
import {
  applyModeTemplate,
  isCustomComparedToTemplate,
  sanitizeAdvancedSettings,
  sanitizeBaseMode,
} from "./simulationSettings.js";
import {
  getActiveConfigFromSettings,
  resolveMaterialValuesFromSettings,
  sanitizeDebugPhysicsTuningPayload,
} from "./simulationPhysicsTuning.js";
import {
  buildPlayerListPayload,
  buildSimulationSnapshot,
} from "./simulationSnapshot.js";
import {
  shipBodyPositionFromCenter,
  shipBodyVelocityFromCenterVelocity,
  shipCenterFromBodyPosition,
  shipCenterVelocityFromBodyVelocity,
} from "./shipTransform.js";
import {
  recordShipTransformHistory as syncRecordShipTransformHistory,
  syncPhysicsFromSim as syncPhysicsFromSimState,
  syncSimFromPhysics as syncSimFromPhysicsState,
  type ShipTransformHistoryEntry,
} from "./simulationStateSync.js";
import {
  checkJoustYellowBlockCollisions as checkJoustYellowBlockCollisionsState,
  checkLaserBeamBlockCollisions as checkLaserBeamBlockCollisionsState,
  handlePilotHitAsteroidCollision,
  handleProjectileHitAsteroidCollision,
  handleProjectileHitPilotCollision,
  handleProjectileHitShipCollision,
  handleProjectileHitYellowBlockCollision,
  handleShipHitAsteroidCollision,
  handleShipHitPilotCollision,
  handleShipHitPowerUpCollision,
  removeProjectileByBodyCollision,
  type SimulationCollisionHandlersContext,
} from "./simulationCollisionHandlers.js";

// System imports
import { updateBots } from "./AISystem.js";
import { updateShips } from "./ShipSystem.js";
import { updateProjectiles } from "./CollisionSystem.js";
import {
  updateAsteroidSpawning,
  updateAsteroids,
  wrapAsteroids,
  destroyAsteroid as asteroidDestroyAsteroid,
  hitAsteroid,
} from "./AsteroidSystem.js";
import {
  updatePowerUps,
  grantPowerUp as powerUpGrantPowerUp,
  spawnRandomPowerUp,
} from "./PowerUpSystem.js";
import {
  updateLaserBeams,
  checkMineCollisions,
  explodeMine as weaponExplodeMine,
  updateHomingMissiles,
  checkHomingMissileCollisions,
  updateJoustCollisions,
  updateTurret,
  updateTurretBullets,
} from "./WeaponSystem.js";
import {
  updatePilots,
  onShipHit as flowOnShipHit,
  killPilot as flowKillPilot,
  respawnFromPilot as flowRespawnFromPilot,
  updatePendingEliminationChecks,
  checkEliminationWin,
  beginPlaying,
  clearRoundEntities,
  syncRoomMeta,
  cleanupExpiredEntities,
} from "./GameFlowSystem.js";

const { Body } = Matter;

const LAG_COMP_MAX_REWIND_MS = 200;

interface RuntimeYellowBlock {
  block: YellowBlock;
  body: Matter.Body | null;
  hp: number;
  maxHp: number;
}

interface SimulationOptions {
  debugToolsEnabled?: boolean;
}

export class AstroPartySimulation implements SimState {
  // ---- Entity collections ----
  players = new Map<string, RuntimePlayer>();
  playerOrder: string[] = [];
  humanBySession = new Map<string, string>();
  pilots = new Map<string, RuntimePilot>();
  projectiles: RuntimeProjectile[] = [];
  asteroids: RuntimeAsteroid[] = [];
  powerUps: RuntimePowerUp[] = [];
  laserBeams: RuntimeLaserBeam[] = [];
  mines: RuntimeMine[] = [];
  homingMissiles: RuntimeHomingMissile[] = [];
  turret: RuntimeTurret | null = null;
  turretBullets: RuntimeTurretBullet[] = [];
  playerPowerUps = new Map<string, PlayerPowerUp | null>();

  // ---- Game state ----
  phase: GamePhase = "LOBBY";
  hostTick = 0;
  nowMs = 0;
  settings: AdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
  baseMode: BaseGameMode = "STANDARD";
  mode: GameMode = "STANDARD";
  mapId: MapId = 0;
  private useClassicMapRotation = true;
  rotationDirection = 1;
  devModeEnabled = false;
  debugToolsEnabled = false;
  debugSessionTainted = false;
  private debugPhysicsTuning: DebugPhysicsTuningPayload | null = null;
  currentRound = 1;
  screenShakeIntensity = 0;
  screenShakeDuration = 0;
  pendingEliminationCheckAtMs: number | null = null;
  nextAsteroidSpawnAtMs: number | null = null;
  leaderPlayerId: string | null = null;
  roundEndMs = 0;
  private physics: Physics;
  private shipBodies = new Map<string, Matter.Body>();
  private asteroidBodies = new Map<string, Matter.Body>();
  private pilotBodies = new Map<string, Matter.Body>();
  private projectileBodies = new Map<string, Matter.Body>();
  private powerUpBodies = new Map<string, Matter.Body>();
  private turretBulletBodies = new Map<string, Matter.Body>();
  private turretBody: Matter.Body | null = null;
  private yellowBlocks: RuntimeYellowBlock[] = [];
  private yellowBlockBodyIndex = new Map<number, number>();
  private yellowBlockSwordHitCooldown = new Map<number, number>();
  private centerHoleBodies: Matter.Body[] = [];
  private mapPowerUpsSpawned = false;
  private mapTimeSec = 0;
  private shipTransformHistory = new Map<string, ShipTransformHistoryEntry[]>();

  // ---- Counters ----
  private revision = 0;
  private botCounter = 0;
  private countdownMs = 0;
  private countdownValue = COUNTDOWN_SECONDS;
  private winnerId: string | null = null;
  private winnerName: string | null = null;
  private identityAllocator = new PlayerIdentityAllocator(PLAYER_COLORS.length);

  // ---- RNG ----
  private baseSeed = 0;
  asteroidRng = new SeededRNG(1);
  powerUpRng = new SeededRNG(2);
  aiRng = new SeededRNG(3);
  idRng = new SeededRNG(4);

  constructor(
    public readonly roomCode: string,
    private maxPlayers: number,
    public readonly tickDurationMs: number,
    public readonly hooks: Hooks,
    options: SimulationOptions = {},
  ) {
    this.debugToolsEnabled = Boolean(options.debugToolsEnabled);
    this.physics = new Physics();
    this.reseed(Math.floor(Date.now()) >>> 0);
    this.physics.createWalls(
      ARENA_WIDTH,
      ARENA_HEIGHT,
      ARENA_PADDING,
      WALL_RESTITUTION_BY_PRESET[this.settings.wallRestitutionPreset],
      WALL_FRICTION_BY_PRESET[this.settings.wallFrictionPreset],
    );
    const collisionContext = (): SimulationCollisionHandlersContext =>
      this.createCollisionHandlersContext();
    setupCollisions(this.physics, {
      onProjectileHitShip: (projectileBody, shipBody) => {
        handleProjectileHitShipCollision(
          collisionContext(),
          projectileBody,
          shipBody,
        );
      },
      onProjectileHitPilot: (projectileBody, pilotBody) => {
        handleProjectileHitPilotCollision(
          collisionContext(),
          projectileBody,
          pilotBody,
        );
      },
      onShipHitPilot: (shipBody, pilotBody) => {
        handleShipHitPilotCollision(collisionContext(), shipBody, pilotBody);
      },
      onProjectileHitWall: (projectileBody) => {
        removeProjectileByBodyCollision(collisionContext(), projectileBody);
      },
      onProjectileHitYellowBlock: (projectileBody, blockBody) => {
        handleProjectileHitYellowBlockCollision(
          collisionContext(),
          projectileBody,
          blockBody,
        );
      },
      onProjectileHitAsteroid: (projectileBody, asteroidBody) => {
        handleProjectileHitAsteroidCollision(
          collisionContext(),
          projectileBody,
          asteroidBody,
        );
      },
      onShipHitAsteroid: (shipBody, asteroidBody) => {
        handleShipHitAsteroidCollision(collisionContext(), shipBody, asteroidBody);
      },
      onPilotHitAsteroid: (pilotBody, asteroidBody) => {
        handlePilotHitAsteroidCollision(collisionContext(), pilotBody, asteroidBody);
      },
      onShipHitPowerUp: (shipBody, powerUpBody) => {
        handleShipHitPowerUpCollision(collisionContext(), shipBody, powerUpBody);
      },
    });
  }

  // ============= PUBLIC API (called by Room) =============

  addHuman(sessionId: string, requestedName?: string): void {
    if (this.players.size >= this.maxPlayers) {
      this.hooks.onError(sessionId, "ROOM_FULL", "Room is full");
      return;
    }

    const id = sessionId;
    const customName = this.sanitizeName(requestedName);
    const allocation = this.identityAllocator.allocateHuman(id, customName);
    const player = this.createPlayer(
      id,
      sessionId,
      allocation.displayName,
      false,
      null,
      allocation.colorIndex,
    );
    this.players.set(id, player);
    this.playerOrder.push(id);
    this.humanBySession.set(sessionId, id);

    if (!this.leaderPlayerId) {
      this.leaderPlayerId = id;
    }

    if (this.phase === "PLAYING" || this.phase === "GAME_END") {
      player.state = "SPECTATING";
      player.ship.alive = false;
    }

    if (this.phase === "COUNTDOWN") {
      this.countdownMs = COUNTDOWN_SECONDS * 1000;
      this.countdownValue = COUNTDOWN_SECONDS;
      this.hooks.onCountdown(this.countdownValue);
    }

    this.syncPlayers();
    syncRoomMeta(this);
  }

  removeSession(sessionId: string): void {
    const localPlayerIds = [...this.players.values()]
      .filter(
        (player) => player.botType === "local" && player.sessionId === sessionId,
      )
      .map((player) => player.id);
    for (const localPlayerId of localPlayerIds) {
      this.removePlayerById(localPlayerId);
    }

    const playerId = this.humanBySession.get(sessionId);
    if (!playerId) return;
    this.humanBySession.delete(sessionId);
    this.removePlayerById(playerId);
  }

  setName(sessionId: string, rawName: string): void {
    const player = this.getHuman(sessionId);
    if (!player) return;
    const name = this.sanitizeName(rawName);
    if (!name) return;
    player.name = name;
    this.syncPlayers();
  }

  sendInput(
    sessionId: string,
    payload: {
      controlledPlayerId?: string;
      buttonA: boolean;
      buttonB: boolean;
      clientTimeMs?: number;
      inputSequence?: number;
      rttMs?: number;
    },
  ): void {
    const player = this.resolveControlledPlayer(
      sessionId,
      payload.controlledPlayerId,
    );
    if (!player) return;

    player.input.buttonA = Boolean(payload.buttonA);
    this.setFireButtonState(player, Boolean(payload.buttonB));
    player.input.timestamp = this.nowMs;
    player.input.clientTimeMs = payload.clientTimeMs ?? this.nowMs;
    const nextInputSequence =
      Number.isFinite(payload.inputSequence) && (payload.inputSequence as number) >= 0
        ? Math.floor(payload.inputSequence as number)
        : player.input.inputSequence;
    player.input.inputSequence = nextInputSequence;
    if (nextInputSequence > player.latestInputSequence) {
      player.latestInputSequence = nextInputSequence;
    }

    if (Number.isFinite(payload.rttMs) && (payload.rttMs as number) >= 0) {
      player.reportedRttMs = clamp(payload.rttMs as number, 0, 1000);
    }
  }

  queueDash(sessionId: string, payload: { controlledPlayerId?: string }): void {
    const player = this.resolveControlledPlayer(
      sessionId,
      payload.controlledPlayerId,
    );
    if (!player) return;
    player.dashQueued = true;
  }

  startMatch(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY" && this.phase !== "GAME_END") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Cannot start from this phase");
      return;
    }
    if (this.playerOrder.length < 2) {
      this.hooks.onError(sessionId, "NOT_ENOUGH_PLAYERS", "Need at least 2 players");
      return;
    }

    this.winnerId = null;
    this.winnerName = null;
    this.mapPowerUpsSpawned = false;
    if (this.useClassicMapRotation) {
      this.rotateToRandomMap();
    }
    this.currentRound = 1;
    this.phase = "COUNTDOWN";
    this.countdownMs = COUNTDOWN_SECONDS * 1000;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.resetScoreAndState();
    // Publish map/room meta before phase/countdown callbacks so clients
    // can swap visuals before entering the next phase.
    syncRoomMeta(this);
    this.hooks.onPhase("COUNTDOWN");
    this.hooks.onCountdown(this.countdownValue);
    this.syncPlayers();
  }

  restartToLobby(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    this.phase = "LOBBY";
    this.countdownMs = 0;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.currentRound = 1;
    if (this.useClassicMapRotation) {
      this.mapId = 0;
    }
    this.mapPowerUpsSpawned = false;
    clearRoundEntities(this);
    this.devModeEnabled = false;
    this.resetScoreAndState();
    this.hooks.onPhase("LOBBY");
    syncRoomMeta(this);
    this.syncPlayers();
  }

  setMode(sessionId: string, mode: GameMode): void {
    if (!this.ensureLeader(sessionId)) return;
    if (mode === "CUSTOM") return;
    const baseMode = mode as BaseGameMode;
    this.baseMode = baseMode;
    this.mode = baseMode;
    this.settings = applyModeTemplate(baseMode, this.settings.roundsToWin);
    syncRoomMeta(this);
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  setAdvancedSettings(sessionId: string, payload: AdvancedSettingsSync): void {
    if (!this.ensureLeader(sessionId)) return;
    const baseMode = sanitizeBaseMode(payload.baseMode, this.baseMode);
    const sanitized = sanitizeAdvancedSettings(payload.settings);
    const template = applyModeTemplate(baseMode, sanitized.roundsToWin);

    this.baseMode = baseMode;
    this.settings = sanitized;
    this.mode = isCustomComparedToTemplate(sanitized, template)
      ? "CUSTOM"
      : baseMode;
    syncRoomMeta(this);
  }

  setMap(sessionId: string, mapId: number): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Maps can only be changed in lobby");
      return;
    }
    if (!Number.isInteger(mapId) || mapId < 0 || mapId > 5) {
      this.hooks.onError(sessionId, "INVALID_MAP", "Unknown map");
      return;
    }
    const nextMapId = mapId as MapId;
    this.useClassicMapRotation = nextMapId === 0;
    this.mapId = nextMapId;
    this.mapPowerUpsSpawned = false;
    syncRoomMeta(this);
  }

  rotateToRandomMap(): void {
    const previousMapId = this.mapId;
    const otherMaps = CLASSIC_ROTATION_MAP_IDS.filter(
      (id) => id !== previousMapId,
    );
    if (otherMaps.length === 0) return;
    const randomIndex = Math.floor(this.idRng.next() * otherMaps.length);
    const newMapId = otherMaps[randomIndex];
    this.mapId = newMapId;
    this.mapPowerUpsSpawned = false;
    console.log(
      "[AstroPartySimulation] Map rotated to:",
      newMapId,
      "(previous was:",
      previousMapId,
      ")",
    );
  }

  addAIBot(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Bots can only be added in lobby");
      return;
    }
    if (this.playerOrder.length >= this.maxPlayers) {
      this.hooks.onError(sessionId, "ROOM_FULL", "Room is full");
      return;
    }

    const id = "bot_" + (++this.botCounter).toString();
    const allocation = this.identityAllocator.allocateBot(id, "ai");
    const player = this.createPlayer(
      id,
      null,
      allocation.displayName,
      true,
      "ai",
      allocation.colorIndex,
    );
    this.players.set(id, player);
    this.playerOrder.push(id);
    this.syncPlayers();
  }

  addLocalPlayer(sessionId: string, keySlot?: number): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(
        sessionId,
        "INVALID_PHASE",
        "Local players can only be added in lobby",
      );
      return;
    }
    if (this.playerOrder.length >= this.maxPlayers) {
      this.hooks.onError(sessionId, "ROOM_FULL", "Room is full");
      return;
    }

    const normalizedKeySlot = this.resolveLocalKeySlot(sessionId, keySlot);
    if (normalizedKeySlot < 0) return;

    const id = "local_" + (++this.botCounter).toString();
    const allocation = this.identityAllocator.allocateBot(id, "local");
    const player = this.createPlayer(
      id,
      sessionId,
      allocation.displayName,
      true,
      "local",
      allocation.colorIndex,
    );
    player.keySlot = normalizedKeySlot;
    this.players.set(id, player);
    this.playerOrder.push(id);
    this.syncPlayers();
  }

  setDevMode(sessionId: string, enabled: boolean): void {
    if (!this.debugToolsEnabled) {
      this.hooks.onError(
        sessionId,
        "DEBUG_TOOLS_DISABLED",
        "Debug tools are disabled for this room",
      );
      return;
    }
    if (!this.ensureLeader(sessionId)) return;
    this.markDebugSessionTainted();
    this.devModeEnabled = Boolean(enabled);
    this.hooks.onDevMode(this.devModeEnabled);
  }

  setDebugPhysicsTuning(
    sessionId: string,
    payload: DebugPhysicsTuningPayload | null,
  ): void {
    if (!this.debugToolsEnabled) {
      this.hooks.onError(
        sessionId,
        "DEBUG_TOOLS_DISABLED",
        "Debug tools are disabled for this room",
      );
      return;
    }
    if (!this.ensureLeader(sessionId)) return;
    this.markDebugSessionTainted();
    this.debugPhysicsTuning = this.sanitizeDebugPhysicsTuning(payload);
  }

  getDebugPhysicsTuningSnapshot(): DebugPhysicsTuningSnapshot {
    return {
      config: this.getActiveConfig(),
      materials: this.resolveMaterialValues(),
      overrides: this.debugPhysicsTuning
        ? {
            configOverrides: this.debugPhysicsTuning.configOverrides
              ? { ...this.debugPhysicsTuning.configOverrides }
              : undefined,
            materialOverrides: this.debugPhysicsTuning.materialOverrides
              ? { ...this.debugPhysicsTuning.materialOverrides }
              : undefined,
          }
        : null,
    };
  }

  devGrantPowerUp(sessionId: string, type: PowerUpType | "SPAWN_RANDOM"): void {
    if (!this.debugToolsEnabled) {
      this.hooks.onError(
        sessionId,
        "DEBUG_TOOLS_DISABLED",
        "Debug tools are disabled for this room",
      );
      return;
    }
    const player = this.getHuman(sessionId);
    if (!player) return;
    this.markDebugSessionTainted();
    if (!this.devModeEnabled) {
      this.hooks.onError(sessionId, "DEV_MODE_REQUIRED", "Enable dev mode first");
      return;
    }

    if (type === "SPAWN_RANDOM") {
      spawnRandomPowerUp(this);
      return;
    }

    if (!player.ship.alive) {
      this.hooks.onError(sessionId, "INVALID_STATE", "You need an active ship");
      return;
    }

    if (type !== "REVERSE" && this.playerPowerUps.get(player.id)) {
      this.hooks.onError(sessionId, "POWERUP_OCCUPIED", "Ship already has a power-up");
      return;
    }

    this.grantPowerUp(player.id, type);
  }

  devEjectPilot(sessionId: string): void {
    if (!this.debugToolsEnabled) {
      this.hooks.onError(
        sessionId,
        "DEBUG_TOOLS_DISABLED",
        "Debug tools are disabled for this room",
      );
      return;
    }
    const player = this.getHuman(sessionId);
    if (!player) return;
    this.markDebugSessionTainted();
    if (!player.ship.alive) {
      this.hooks.onError(sessionId, "INVALID_STATE", "You need an active ship");
      return;
    }
    this.onShipHit(undefined, player);
  }

  private markDebugSessionTainted(): void {
    if (this.debugSessionTainted) return;
    this.debugSessionTainted = true;
    syncRoomMeta(this);
  }

  removeBot(sessionId: string, playerId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    const player = this.players.get(playerId);
    if (!player || !player.isBot) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Bot not found");
      return;
    }
    this.removePlayerById(playerId);
  }

  kickPlayer(sessionId: string, targetId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    const target = this.players.get(targetId);
    if (!target) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Player not found");
      return;
    }
    this.removePlayerById(targetId);
  }

  // ============= TICK =============

  update(deltaMs: number): void {
    this.nowMs += deltaMs;
    this.hostTick += 1;
    for (const player of this.players.values()) {
      if (player.lastProcessedInputSequence < player.latestInputSequence) {
        player.lastProcessedInputSequence = player.latestInputSequence;
      }
    }
    if (this.screenShakeDuration > 0) {
      this.screenShakeDuration = Math.max(0, this.screenShakeDuration - deltaMs / 1000);
      if (this.screenShakeDuration <= 0) {
        this.screenShakeIntensity = 0;
      }
    }

    if (this.phase === "COUNTDOWN") {
      this.countdownMs = Math.max(0, this.countdownMs - deltaMs);
      const next = Math.max(0, Math.ceil(this.countdownMs / 1000));
      if (next !== this.countdownValue) {
        this.countdownValue = next;
        this.hooks.onCountdown(next);
      }
      if (this.countdownMs <= 0) {
        this.reseed((Date.now() >>> 0) ^ this.currentRound);
        beginPlaying(this);
      }
    }

    if (this.phase === "ROUND_END") {
      this.roundEndMs = Math.max(0, this.roundEndMs - deltaMs);
      if (this.roundEndMs <= 0) {
        this.currentRound += 1;
        clearRoundEntities(this);
        if (this.useClassicMapRotation) {
          this.rotateToRandomMap();
        }
        this.phase = "COUNTDOWN";
        this.countdownMs = COUNTDOWN_SECONDS * 1000;
        this.countdownValue = COUNTDOWN_SECONDS;
        for (const playerId of this.playerOrder) {
          const player = this.players.get(playerId);
          if (!player) continue;
          player.state = "ACTIVE";
          player.ship.alive = false;
        }
        // Publish rotated map first so remote clients don't briefly render
        // countdown with the previous round's map.
        syncRoomMeta(this);
        this.hooks.onPhase("COUNTDOWN");
        this.hooks.onCountdown(this.countdownValue);
        this.syncPlayers();
      }
    }

    if (this.phase !== "PLAYING") {
      this.recordShipTransformHistory();
      this.hooks.onSnapshot(this.buildSnapshot());
      return;
    }

    const dtSec = deltaMs / 1000;

    updateBots(this);
    updateShips(this, dtSec);
    updatePilots(this, dtSec);
    updateAsteroidSpawning(this);
    updateAsteroids(this, dtSec);
    this.syncPhysicsFromSim();
    this.physics.update(deltaMs);
    this.syncSimFromPhysics();
    wrapAsteroids(this);
    updateProjectiles(this, dtSec);
    updatePowerUps(this, dtSec);
    updateLaserBeams(this);
    checkLaserBeamBlockCollisionsState(this.createCollisionHandlersContext());
    checkMineCollisions(this);
    updateHomingMissiles(this, dtSec);
    checkHomingMissileCollisions(this);
    updateJoustCollisions(this);
    checkJoustYellowBlockCollisionsState(this.createCollisionHandlersContext());
    updateTurret(this, dtSec);
    updateTurretBullets(this, dtSec);
    this.updateMapFeatures(dtSec);
    cleanupExpiredEntities(this);
    updatePendingEliminationChecks(this);
    if (this.pendingEliminationCheckAtMs === null) {
      checkEliminationWin(this);
    }

    this.recordShipTransformHistory();
    this.hooks.onSnapshot(this.buildSnapshot());
  }

  // ============= GETTERS =============

  getAdvancedSettingsSync(): AdvancedSettingsSync {
    return {
      mode: this.mode,
      baseMode: this.baseMode,
      settings: { ...this.settings },
    };
  }

  getDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  getDebugToolsEnabled(): boolean {
    return this.debugToolsEnabled;
  }

  getDebugSessionTainted(): boolean {
    return this.debugSessionTainted;
  }

  // ============= SimState interface methods =============

  nextEntityId(prefix: string): string {
    return prefix + "_" + this.idRng.nextUint32().toString(16);
  }

  getActiveConfig() {
    return getActiveConfigFromSettings(
      this.baseMode,
      this.settings,
      this.debugPhysicsTuning,
    );
  }

  private resolveMaterialValues() {
    return resolveMaterialValuesFromSettings(
      this.settings,
      this.debugPhysicsTuning,
    );
  }

  private sanitizeDebugPhysicsTuning(
    payload: DebugPhysicsTuningPayload | null,
  ): DebugPhysicsTuningPayload | null {
    return sanitizeDebugPhysicsTuningPayload(payload);
  }

  triggerScreenShake(intensity: number, duration: number): void {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeDuration = Math.max(this.screenShakeDuration, duration);
    this.hooks.onScreenShake(intensity, duration);
  }

  applyShipForce(playerId: string, x: number, y: number): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    Body.applyForce(body, body.position, { x, y });
  }

  applyPilotForce(playerId: string, x: number, y: number): void {
    const body = this.pilotBodies.get(playerId);
    if (!body) return;
    Body.applyForce(body, body.position, { x, y });
  }

  setShipAngle(playerId: string, angle: number): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    const center = shipCenterFromBodyPosition(body.position.x, body.position.y, body.angle);
    Body.setAngle(body, angle);
    Body.setPosition(body, shipBodyPositionFromCenter(center.x, center.y, angle));
  }

  setShipVelocity(playerId: string, vx: number, vy: number): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    const bodyVelocity = shipBodyVelocityFromCenterVelocity(
      vx,
      vy,
      body.angle,
      body.angularVelocity,
    );
    Body.setVelocity(body, bodyVelocity);
  }

  setShipAngularVelocity(playerId: string, angularVelocity: number): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    Body.setAngularVelocity(body, angularVelocity);
  }

  setPilotAngle(playerId: string, angle: number): void {
    const body = this.pilotBodies.get(playerId);
    if (!body) return;
    Body.setAngle(body, angle);
  }

  setPilotAngularVelocity(playerId: string, angularVelocity: number): void {
    const body = this.pilotBodies.get(playerId);
    if (!body) return;
    Body.setAngularVelocity(body, angularVelocity);
  }

  setAsteroidPosition(asteroidId: string, x: number, y: number): void {
    const body = this.asteroidBodies.get(asteroidId);
    if (!body) return;
    Body.setPosition(body, { x, y });
  }

  getLagCompensationRewindMs(playerId: string): number {
    const player = this.players.get(playerId);
    if (!player) return 0;
    const estimatedOneWayMs = player.reportedRttMs * 0.5;
    return clamp(estimatedOneWayMs, 0, LAG_COMP_MAX_REWIND_MS);
  }

  getLagCompensatedShipPose(
    playerId: string,
    rewindMs: number,
  ): { x: number; y: number; angle: number } | null {
    const player = this.players.get(playerId);
    if (!player || !player.ship.alive) return null;

    const normalizedRewind = clamp(rewindMs, 0, LAG_COMP_MAX_REWIND_MS);
    if (normalizedRewind <= 0) {
      return {
        x: player.ship.x,
        y: player.ship.y,
        angle: player.ship.angle,
      };
    }

    const history = this.shipTransformHistory.get(playerId);
    if (!history || history.length <= 0) {
      return {
        x: player.ship.x,
        y: player.ship.y,
        angle: player.ship.angle,
      };
    }

    const targetTimeMs = this.nowMs - normalizedRewind;
    let prev: ShipTransformHistoryEntry | null = null;
    let next: ShipTransformHistoryEntry | null = null;

    for (const entry of history) {
      if (entry.atMs <= targetTimeMs) {
        prev = entry;
        continue;
      }
      next = entry;
      break;
    }

    if (!prev) {
      const first = history[0];
      return { x: first.x, y: first.y, angle: first.angle };
    }
    if (!next) {
      return { x: prev.x, y: prev.y, angle: prev.angle };
    }

    const span = Math.max(1, next.atMs - prev.atMs);
    const t = clamp((targetTimeMs - prev.atMs) / span, 0, 1);
    return {
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
      angle: prev.angle + normalizeAngle(next.angle - prev.angle) * t,
    };
  }

  syncPlayers(): void {
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  grantPowerUp(playerId: string, type: PowerUpType): void {
    powerUpGrantPowerUp(this, playerId, type);
  }

  setFireButtonState(player: RuntimePlayer, pressed: boolean): void {
    if (pressed && !player.fireButtonHeld) {
      player.fireRequested = true;
      player.firePressStartMs = this.nowMs;
    } else if (!pressed && player.fireButtonHeld) {
      player.fireRequested = false;
      player.firePressStartMs = 0;
    }
    player.fireButtonHeld = pressed;
    player.input.buttonB = pressed;
  }

  spawnMapFeatures(): void {
    this.clearMapFeatures();
    const map = this.getCurrentMap();

    if (map.yellowBlocks.length > 0) {
      for (const [index, block] of map.yellowBlocks.entries()) {
        const body = this.physics.createYellowBlock(
          block.x + block.width * 0.5,
          block.y + block.height * 0.5,
          block.width,
          block.height,
          index,
        );
        this.yellowBlocks.push({
          block,
          body,
          hp: 1,
          maxHp: 1,
        });
        this.yellowBlockBodyIndex.set(body.id, index);
      }
    }

    if (map.centerHoles.length > 0) {
      for (const hole of map.centerHoles) {
        const body = this.physics.createCenterHoleObstacle(
          hole.x,
          hole.y,
          hole.radius,
        );
        this.centerHoleBodies.push(body);
      }
    }

    const mapPowerUpConfig = map.powerUpConfig;
    if (!mapPowerUpConfig?.enabled) return;
    if (this.mapPowerUpsSpawned && !mapPowerUpConfig.respawnPerRound) return;

    const x = mapPowerUpConfig.x * ARENA_WIDTH;
    const y = mapPowerUpConfig.y * ARENA_HEIGHT;
    const existing = this.powerUps.find((powerUp) => {
      if (!powerUp.alive) return false;
      const dx = Math.abs(powerUp.x - x);
      const dy = Math.abs(powerUp.y - y);
      return dx < 5 && dy < 5;
    });
    if (existing) return;

    const typeIndex = this.powerUpRng.nextInt(0, mapPowerUpConfig.types.length - 1);
    const type = mapPowerUpConfig.types[typeIndex];
    this.powerUps.push({
      id: this.nextEntityId("pow"),
      x,
      y,
      type,
      spawnTime: this.nowMs,
      remainingTimeFraction: 1,
      alive: true,
      magneticRadius: POWERUP_MAGNETIC_RADIUS,
      magneticSpeed: POWERUP_MAGNETIC_SPEED,
      isMagneticActive: false,
      targetPlayerId: null,
    });
    this.mapPowerUpsSpawned = true;
  }

  updateMapFeatures(dtSec: number): void {
    this.mapTimeSec += dtSec;
    const map = this.getCurrentMap();

    if (map.centerHoles.length > 0) {
      for (const hole of map.centerHoles) {
        const influenceRadius =
          hole.radius * VORTEX_TUNING.profile.influenceRadiusMultiplier;

        const applyRotationalForce = (
          body: Matter.Body | undefined,
          divergenceFactor = 1,
          distanceDamping = 0,
        ): void => {
          if (!body) return;
          const dx = body.position.x - hole.x;
          const dy = body.position.y - hole.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sample = sampleMapField(
            dist,
            influenceRadius,
            VORTEX_TUNING.profile,
          );
          if (!sample) return;

          const tx = (-dy / dist) * this.rotationDirection;
          const ty = (dx / dist) * this.rotationDirection;
          let forceMagnitude = VORTEX_TUNING.baseForce * sample.falloff;

          // Projectiles/bullets should curve less aggressively in vortex maps.
          // This makes their divergence feel closer to repulse-style handling.
          if (divergenceFactor < 1) {
            // Keep damping floor in tuning so lowering/raising distance
            // sensitivity stays predictable.
            const dampingWithFloor =
              distanceDamping > 0
                ? influenceRadius /
                  Math.max(
                    dist * distanceDamping,
                    VORTEX_TUNING.profile.distanceFloor,
                  )
                : 1;
            forceMagnitude *= divergenceFactor * dampingWithFloor;
          }

          Body.applyForce(body, body.position, {
            x: tx * forceMagnitude,
            y: ty * forceMagnitude,
          });
        };

        for (const player of this.players.values()) {
          if (!player.ship.alive) continue;
          applyRotationalForce(this.shipBodies.get(player.id));
        }

        for (const [playerId, pilot] of this.pilots) {
          if (!pilot.alive) continue;
          applyRotationalForce(this.pilotBodies.get(playerId));
        }

        for (const asteroid of this.asteroids) {
          if (!asteroid.alive) continue;
          applyRotationalForce(this.asteroidBodies.get(asteroid.id));
        }

        for (const projectile of this.projectiles) {
          applyRotationalForce(
            this.projectileBodies.get(projectile.id),
            VORTEX_TUNING.projectileDivergenceFactor,
            VORTEX_TUNING.projectileDistanceDamping,
          );
        }

        for (const bullet of this.turretBullets) {
          if (!bullet.alive) continue;
          applyRotationalForce(
            this.turretBulletBodies.get(bullet.id),
            VORTEX_TUNING.turretBulletDivergenceFactor,
            VORTEX_TUNING.projectileDistanceDamping,
          );
        }

        for (const missile of this.homingMissiles) {
          if (!missile.alive) continue;
          const dx = missile.x - hole.x;
          const dy = missile.y - hole.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sample = sampleMapField(
            dist,
            influenceRadius,
            VORTEX_TUNING.profile,
          );
          if (!sample) continue;
          const tx = (-dy / dist) * this.rotationDirection;
          const ty = (dx / dist) * this.rotationDirection;
          const drift =
            VORTEX_TUNING.homingMissileTangentialBase +
            sample.falloff * VORTEX_TUNING.homingMissileTangentialFalloff;
          missile.vx += tx * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
          missile.vy += ty * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
        }

        for (const mine of this.mines) {
          if (!mine.alive || mine.exploded) continue;
          const dx = mine.x - hole.x;
          const dy = mine.y - hole.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sample = sampleMapField(
            dist,
            influenceRadius,
            VORTEX_TUNING.profile,
          );
          if (!sample) continue;
          const tx = (-dy / dist) * this.rotationDirection;
          const ty = (dx / dist) * this.rotationDirection;
          const drift =
            VORTEX_TUNING.mineTangentialBase +
            sample.falloff * VORTEX_TUNING.mineTangentialFalloff;
          mine.x += tx * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
          mine.y += ty * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
          mine.x = clamp(mine.x, 0, ARENA_WIDTH);
          mine.y = clamp(mine.y, 0, ARENA_HEIGHT);
        }

        for (const powerUp of this.powerUps) {
          if (!powerUp.alive) continue;
          const dx = powerUp.x - hole.x;
          const dy = powerUp.y - hole.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sample = sampleMapField(
            dist,
            influenceRadius,
            VORTEX_TUNING.profile,
          );
          if (!sample) continue;
          const tx = (-dy / dist) * this.rotationDirection;
          const ty = (dx / dist) * this.rotationDirection;
          const drift =
            VORTEX_TUNING.powerUpTangentialBase +
            sample.falloff * VORTEX_TUNING.powerUpTangentialFalloff;
          powerUp.x += tx * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
          powerUp.y += ty * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
          powerUp.x = clamp(powerUp.x, 0, ARENA_WIDTH);
          powerUp.y = clamp(powerUp.y, 0, ARENA_HEIGHT);
        }
      }
    }

    if (map.repulsionZones.length === 0) return;

    for (const zone of map.repulsionZones) {
      const influenceRadius =
        zone.radius * REPULSION_TUNING.profile.influenceRadiusMultiplier;

      const applyForceToBody = (body: Matter.Body | undefined): void => {
        if (!body) return;
        const dx = body.position.x - zone.x;
        const dy = body.position.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sample = sampleMapField(
          dist,
          influenceRadius,
          REPULSION_TUNING.profile,
        );
        if (!sample) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const strengthScale =
          REPULSION_TUNING.bodyStrengthBaseScale +
          sample.falloff * REPULSION_TUNING.bodyStrengthFalloffScale;
        const forceMagnitude =
          (zone.strength * strengthScale) /
          Math.max(
            Math.pow(dist, REPULSION_TUNING.bodyDistanceExponent),
            REPULSION_TUNING.profile.distanceFloor,
          );

        Body.applyForce(body, body.position, {
          x: nx * forceMagnitude,
          y: ny * forceMagnitude,
        });
      };

      for (const player of this.players.values()) {
        if (!player.ship.alive) continue;
        applyForceToBody(this.shipBodies.get(player.id));
      }

      for (const [playerId, pilot] of this.pilots) {
        if (!pilot.alive) continue;
        applyForceToBody(this.pilotBodies.get(playerId));
      }

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;
        applyForceToBody(this.asteroidBodies.get(asteroid.id));
      }

      for (const projectile of this.projectiles) {
        applyForceToBody(this.projectileBodies.get(projectile.id));
      }

      for (const bullet of this.turretBullets) {
        if (!bullet.alive) continue;
        applyForceToBody(this.turretBulletBodies.get(bullet.id));
      }

      for (const missile of this.homingMissiles) {
        if (!missile.alive) continue;
        const dx = missile.x - zone.x;
        const dy = missile.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sample = sampleMapField(
          dist,
          influenceRadius,
          REPULSION_TUNING.profile,
        );
        if (!sample) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const accel =
          zone.strength *
          (REPULSION_TUNING.homingMissileAccelBase +
            sample.falloff * REPULSION_TUNING.homingMissileAccelFalloff);
        missile.vx += nx * accel * dtSec * REPULSION_TUNING.kinematicStepScale;
        missile.vy += ny * accel * dtSec * REPULSION_TUNING.kinematicStepScale;
      }

      for (const mine of this.mines) {
        if (!mine.alive || mine.exploded) continue;
        const dx = mine.x - zone.x;
        const dy = mine.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sample = sampleMapField(
          dist,
          influenceRadius,
          REPULSION_TUNING.profile,
        );
        if (!sample) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const drift =
          zone.strength *
          (REPULSION_TUNING.mineDriftBase +
            sample.falloff * REPULSION_TUNING.mineDriftFalloff);
        mine.x += nx * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
        mine.y += ny * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
        mine.x = clamp(mine.x, 0, ARENA_WIDTH);
        mine.y = clamp(mine.y, 0, ARENA_HEIGHT);
      }

      for (const powerUp of this.powerUps) {
        if (!powerUp.alive) continue;
        const dx = powerUp.x - zone.x;
        const dy = powerUp.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sample = sampleMapField(
          dist,
          influenceRadius,
          REPULSION_TUNING.profile,
        );
        if (!sample) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const drift =
          zone.strength *
          (REPULSION_TUNING.powerUpDriftBase +
            sample.falloff * REPULSION_TUNING.powerUpDriftFalloff);
        powerUp.x += nx * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
        powerUp.y += ny * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
        powerUp.x = clamp(powerUp.x, 0, ARENA_WIDTH);
        powerUp.y = clamp(powerUp.y, 0, ARENA_HEIGHT);
      }
    }
  }

  clearMapFeatures(): void {
    for (const yellowBlock of this.yellowBlocks) {
      if (yellowBlock.body) {
        this.physics.removeBody(yellowBlock.body);
      }
    }
    this.yellowBlocks = [];
    this.yellowBlockBodyIndex.clear();
    this.yellowBlockSwordHitCooldown.clear();

    for (const centerHoleBody of this.centerHoleBodies) {
      this.physics.removeBody(centerHoleBody);
    }
    this.centerHoleBodies = [];

    this.mapTimeSec = 0;
  }

  onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void {
    flowOnShipHit(this, owner, target);
    this.removeShipBody(target.id);
  }

  killPilot(pilotPlayerId: string, killerId: string): void {
    flowKillPilot(this, pilotPlayerId, killerId);
    this.removePilotBody(pilotPlayerId);
  }

  respawnFromPilot(playerId: string, pilot: RuntimePilot): void {
    flowRespawnFromPilot(this, playerId, pilot);
    this.removePilotBody(playerId);
  }

  destroyAsteroid(asteroid: RuntimeAsteroid): void {
    asteroidDestroyAsteroid(this, asteroid);
    if (!asteroid.alive) {
      this.removeAsteroidBody(asteroid.id);
    }
  }

  explodeMine(mine: RuntimeMine): void {
    weaponExplodeMine(this, mine);
  }

  removeShipBody(playerId: string): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    this.physics.removeBody(body);
    this.shipBodies.delete(playerId);
  }

  removeAsteroidBody(asteroidId: string): void {
    const body = this.asteroidBodies.get(asteroidId);
    if (!body) return;
    this.physics.removeBody(body);
    this.asteroidBodies.delete(asteroidId);
  }

  removePilotBody(playerId: string): void {
    const body = this.pilotBodies.get(playerId);
    if (!body) return;
    this.physics.removeBody(body);
    this.pilotBodies.delete(playerId);
  }

  removeProjectileBody(projectileId: string): void {
    const body = this.projectileBodies.get(projectileId);
    if (body) {
      this.physics.removeBody(body);
      this.projectileBodies.delete(projectileId);
    }
  }

  private removePowerUpBody(powerUpId: string): void {
    const body = this.powerUpBodies.get(powerUpId);
    if (!body) return;
    this.physics.removeBody(body);
    this.powerUpBodies.delete(powerUpId);
  }

  removeHomingMissileBody(_missileId: string): void {
    // Homing missiles use position-only simulation in this architecture.
  }

  removeTurretBulletBody(bulletId: string): void {
    const body = this.turretBulletBodies.get(bulletId);
    if (!body) return;
    this.physics.removeBody(body);
    this.turretBulletBodies.delete(bulletId);
  }

  clearPhysicsBodies(): void {
    for (const playerId of [...this.shipBodies.keys()]) this.removeShipBody(playerId);
    for (const asteroidId of [...this.asteroidBodies.keys()]) this.removeAsteroidBody(asteroidId);
    for (const playerId of [...this.pilotBodies.keys()]) this.removePilotBody(playerId);
    for (const projectileId of [...this.projectileBodies.keys()]) this.removeProjectileBody(projectileId);
    for (const powerUpId of [...this.powerUpBodies.keys()]) this.removePowerUpBody(powerUpId);
    for (const bulletId of [...this.turretBulletBodies.keys()]) this.removeTurretBulletBody(bulletId);
    if (this.turretBody) {
      this.physics.removeBody(this.turretBody);
      this.turretBody = null;
    }
    this.clearMapFeatures();
  }

  // ============= PRIVATE HELPERS =============

  private recordShipTransformHistory(): void {
    syncRecordShipTransformHistory({
      nowMs: this.nowMs,
      playerOrder: this.playerOrder,
      players: this.players,
      shipTransformHistory: this.shipTransformHistory,
    });
  }

  private syncPhysicsFromSim(): void {
    syncPhysicsFromSimState({
      resolveMaterialValues: () => this.resolveMaterialValues(),
      physics: this.physics,
      playerOrder: this.playerOrder,
      players: this.players,
      shipBodies: this.shipBodies,
      asteroids: this.asteroids,
      asteroidBodies: this.asteroidBodies,
      pilots: this.pilots,
      pilotBodies: this.pilotBodies,
      projectiles: this.projectiles,
      projectileBodies: this.projectileBodies,
      powerUps: this.powerUps,
      powerUpBodies: this.powerUpBodies,
      turretBullets: this.turretBullets,
      turretBulletBodies: this.turretBulletBodies,
      turret: this.turret,
      getTurretBody: () => this.turretBody,
      setTurretBody: (body) => {
        this.turretBody = body;
      },
      removeShipBody: this.removeShipBody.bind(this),
      removeAsteroidBody: this.removeAsteroidBody.bind(this),
      removePilotBody: this.removePilotBody.bind(this),
      removeProjectileBody: this.removeProjectileBody.bind(this),
      removePowerUpBody: this.removePowerUpBody.bind(this),
      removeTurretBulletBody: this.removeTurretBulletBody.bind(this),
    });
  }

  private syncSimFromPhysics(): void {
    syncSimFromPhysicsState({
      players: this.players,
      shipBodies: this.shipBodies,
      asteroids: this.asteroids,
      asteroidBodies: this.asteroidBodies,
      pilots: this.pilots,
      pilotBodies: this.pilotBodies,
      projectiles: this.projectiles,
      projectileBodies: this.projectileBodies,
      turretBullets: this.turretBullets,
      turretBulletBodies: this.turretBulletBodies,
    });
  }

  private createCollisionHandlersContext(): SimulationCollisionHandlersContext {
    return {
      nowMs: this.nowMs,
      players: this.players,
      pilots: this.pilots,
      asteroids: this.asteroids,
      powerUps: this.powerUps,
      playerPowerUps: this.playerPowerUps,
      projectileBodies: this.projectileBodies,
      yellowBlocks: this.yellowBlocks,
      yellowBlockBodyIndex: this.yellowBlockBodyIndex,
      yellowBlockSwordHitCooldown: this.yellowBlockSwordHitCooldown,
      laserBeams: this.laserBeams,
      physics: this.physics,
      getCurrentMapId: () => this.getCurrentMap().id,
      getPluginString: this.getPluginString.bind(this),
      removeProjectileEntity: (projectileId: string) => {
        this.removeProjectileBody(projectileId);
        this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
      },
      triggerScreenShake: this.triggerScreenShake.bind(this),
      onShipHit: this.onShipHit.bind(this),
      killPilot: this.killPilot.bind(this),
      hitAsteroid: (asteroid: RuntimeAsteroid) => {
        hitAsteroid(this, asteroid);
      },
      destroyAsteroid: this.destroyAsteroid.bind(this),
      grantPowerUp: this.grantPowerUp.bind(this),
      removePowerUpBody: this.removePowerUpBody.bind(this),
    };
  }

  private getPluginString(body: Matter.Body, key: string): string | null {
    const value = (body.plugin as Record<string, unknown> | undefined)?.[key];
    return typeof value === "string" ? value : null;
  }

  private reseed(seed: number): void {
    const normalized = (seed >>> 0) || 0x9e3779b9;
    this.baseSeed = normalized;
    this.asteroidRng = new SeededRNG(normalized ^ 0xa341316c);
    this.powerUpRng = new SeededRNG(normalized ^ 0xc8013ea4);
    this.aiRng = new SeededRNG(normalized ^ 0xad90777d);
    this.idRng = new SeededRNG(normalized ^ 0x7e95761e);
    this.hooks.onReseed?.(normalized);
  }

  private ensureLeader(sessionId: string): boolean {
    const player = this.getHuman(sessionId);
    if (!player) return false;
    if (this.leaderPlayerId !== player.id) {
      this.hooks.onError(sessionId, "LEADER_ONLY", "Only room leader can do this");
      return false;
    }
    return true;
  }

  private getHuman(sessionId: string): RuntimePlayer | null {
    const playerId = this.humanBySession.get(sessionId);
    if (!playerId) return null;
    return this.players.get(playerId) ?? null;
  }

  private resolveControlledPlayer(
    sessionId: string,
    controlledPlayerId?: string,
  ): RuntimePlayer | null {
    const human = this.getHuman(sessionId);
    if (!human) return null;

    if (!controlledPlayerId || controlledPlayerId === human.id) {
      return human;
    }

    const target = this.players.get(controlledPlayerId);
    if (!target) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Controlled player not found");
      return null;
    }

    if (target.botType !== "local" || target.sessionId !== sessionId) {
      this.hooks.onError(
        sessionId,
        "LOCAL_PLAYER_UNSUPPORTED",
        "Controlled player is not available for this session",
      );
      return null;
    }

    return target;
  }

  private resolveLocalKeySlot(sessionId: string, keySlot?: number): number {
    const preferred =
      Number.isInteger(keySlot) && (keySlot as number) > 0
        ? (keySlot as number)
        : undefined;

    if (preferred !== undefined) {
      const inUse = [...this.players.values()].some(
        (player) =>
          player.botType === "local" &&
          player.sessionId === sessionId &&
          player.keySlot === preferred,
      );
      if (inUse) {
        this.hooks.onError(sessionId, "KEY_SLOT_IN_USE", "Key slot already in use");
        return -1;
      }
      return preferred;
    }

    for (let slot = 1; slot <= 6; slot += 1) {
      const inUse = [...this.players.values()].some(
        (player) =>
          player.botType === "local" &&
          player.sessionId === sessionId &&
          player.keySlot === slot,
      );
      if (!inUse) return slot;
    }

    this.hooks.onError(sessionId, "KEY_SLOT_IN_USE", "No local key slots available");
    return -1;
  }

  private sanitizeName(raw?: string): string | null {
    if (!raw) return null;
    const out = raw.trim().slice(0, 20);
    return out.length > 0 ? out : null;
  }

  private getCurrentMap(): MapDefinition {
    return getMapDefinition(this.mapId);
  }

  private removePlayerById(playerId: string): void {
    this.identityAllocator.releasePlayer(playerId);
    this.shipTransformHistory.delete(playerId);
    this.players.delete(playerId);
    this.playerOrder = this.playerOrder.filter((id) => id !== playerId);
    this.pilots.delete(playerId);
    this.playerPowerUps.delete(playerId);
    const removeProjectileIds = this.projectiles
      .filter((proj) => proj.ownerId === playerId)
      .map((proj) => proj.id);
    for (const projectileId of removeProjectileIds) {
      this.removeProjectileBody(projectileId);
    }
    this.projectiles = this.projectiles.filter((proj) => proj.ownerId !== playerId);
    this.removeShipBody(playerId);
    this.removePilotBody(playerId);

    if (this.leaderPlayerId === playerId) {
      this.reassignLeader();
    }

    if (this.playerOrder.length < 2 && this.phase === "PLAYING") {
      this.phase = "LOBBY";
      this.hooks.onPhase("LOBBY");
      syncRoomMeta(this);
    }
    if (this.playerOrder.length < 2 && this.phase === "COUNTDOWN") {
      this.phase = "LOBBY";
      this.countdownMs = 0;
      this.hooks.onPhase("LOBBY");
      syncRoomMeta(this);
    }

    this.syncPlayers();
  }

  private reassignLeader(): void {
    this.leaderPlayerId = null;
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || player.isBot) continue;
      this.leaderPlayerId = playerId;
      break;
    }
    syncRoomMeta(this);
  }

  private resetScoreAndState(): void {
    clearRoundEntities(this);
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      player.kills = 0;
      player.roundWins = 0;
      player.score = 0;
      player.state = "ACTIVE";
      player.input = {
        buttonA: false,
        buttonB: false,
        timestamp: this.nowMs,
        clientTimeMs: this.nowMs,
        inputSequence: player.latestInputSequence,
      };
      player.lastProcessedInputSequence = player.latestInputSequence;
      player.dashQueued = false;
      player.lastShipDashAtMs = this.nowMs - 1000;
      player.dashTimerSec = 0;
      player.dashVectorX = 0;
      player.dashVectorY = 0;
      player.recoilTimerSec = 0;
      player.angularVelocity = 0;
      player.botThinkAtMs = 0;
      player.botLastDecisionMs = 0;
      player.botCachedAction = {
        buttonA: false,
        buttonB: false,
        dash: false,
      };
      player.fireButtonHeld = false;
      player.fireRequested = false;
      player.firePressStartMs = 0;
      player.ship = {
        ...player.ship,
        x: ARENA_WIDTH * 0.5,
        y: ARENA_HEIGHT * 0.5,
        vx: 0,
        vy: 0,
        alive: false,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: this.nowMs - FIRE_COOLDOWN_MS - 1,
        reloadStartTime: this.nowMs,
        isReloading: false,
      };
    }
    this.syncPlayers();
  }

  private createPlayer(
    id: string,
    sessionId: string | null,
    name: string,
    isBot: boolean,
    botType: "ai" | "local" | null,
    colorIndex: number,
  ): RuntimePlayer {
    return {
      id,
      sessionId,
      name,
      isBot,
      botType,
      colorIndex,
      kills: 0,
      roundWins: 0,
      score: 0,
      state: "ACTIVE",
      input: {
        buttonA: false,
        buttonB: false,
        timestamp: 0,
        clientTimeMs: 0,
        inputSequence: 0,
      },
      latestInputSequence: 0,
      lastProcessedInputSequence: 0,
      reportedRttMs: 0,
      dashQueued: false,
      botThinkAtMs: 0,
      botLastDecisionMs: 0,
      botCachedAction: {
        buttonA: false,
        buttonB: false,
        dash: false,
      },
      fireButtonHeld: false,
      fireRequested: false,
      firePressStartMs: 0,
      lastShipDashAtMs: -1000,
      dashTimerSec: 0,
      dashVectorX: 0,
      dashVectorY: 0,
      recoilTimerSec: 0,
      angularVelocity: 0,
      ship: {
        id: "ship_" + id,
        playerId: id,
        x: ARENA_WIDTH * 0.5,
        y: ARENA_HEIGHT * 0.5,
        angle: 0,
        vx: 0,
        vy: 0,
        alive: false,
        invulnerableUntil: 0,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: 0,
        reloadStartTime: 0,
        isReloading: false,
      },
    };
  }

  private buildPlayerPayload(): PlayerListPayload {
    const payload = buildPlayerListPayload({
      playerOrder: this.playerOrder,
      players: this.players,
      leaderPlayerId: this.leaderPlayerId,
      revision: this.revision,
    });
    this.revision = payload.revision;
    return payload;
  }

  private buildSnapshot(): SnapshotPayload {
    return buildSimulationSnapshot({
      nowMs: this.nowMs,
      playerOrder: this.playerOrder,
      players: this.players,
      pilots: this.pilots,
      projectiles: this.projectiles,
      asteroids: this.asteroids,
      powerUps: this.powerUps,
      laserBeams: this.laserBeams,
      mines: this.mines,
      homingMissiles: this.homingMissiles,
      turret: this.turret,
      turretBullets: this.turretBullets,
      playerPowerUps: this.playerPowerUps,
      rotationDirection: this.rotationDirection,
      screenShakeIntensity: this.screenShakeIntensity,
      screenShakeDuration: this.screenShakeDuration,
      hostTick: this.hostTick,
      tickDurationMs: this.tickDurationMs,
      mapId: this.mapId,
      yellowBlockHp: this.yellowBlocks.map((block) => block.hp),
    });
  }
}

export type {
  AdvancedSettings,
  AdvancedSettingsSync,
  PlayerListPayload,
  RoomMetaPayload,
  RoundResultPayload,
  SnapshotPayload,
} from "./types.js";
