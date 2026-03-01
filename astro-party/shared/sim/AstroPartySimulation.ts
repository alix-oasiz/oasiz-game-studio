import type {
  GamePhase,
  GameMode,
  BaseGameMode,
  Ruleset,
  ExperienceContext,
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
  PlayerRemovalReason,
  SnapshotPayload,
  PlayerListPayload,
  PlayerListMeta,
  RoundResultPayload,
  DebugPhysicsGlobals,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
  SimState,
} from "./types.js";
import Matter from "matter-js";
import { SeededRNG } from "./SeededRNG.js";
import { clamp, normalizeAngle } from "./utils.js";
import { Physics } from "./physics/Physics.js";
import { setupCollisions } from "./physics/Collision.js";
import { PlayerIdentityAllocator } from "./PlayerIdentityAllocator.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_PADDING,
  PLAYER_COLORS,
  DEFAULT_ADVANCED_SETTINGS,
  COUNTDOWN_SECONDS,
  ROUND_RESULTS_DURATION_MS,
  MAX_AMMO,
  HOMING_MISSILE_LIFETIME_MS,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
} from "./constants.js";
import {
  getMapDefinition,
  CLASSIC_ROTATION_MAP_IDS,
  ENDLESS_ALLOWED_MAP_IDS,
  isMapAllowedForContext,
  type MapDefinition,
} from "./maps.js";
import {
  applyModeTemplate,
  isCustomComparedToTemplate,
  sanitizeAdvancedSettings,
  sanitizeBaseMode,
} from "./modules/simulationSettings.js";
import {
  getActiveConfigFromSettings,
  resolveGlobalValues,
  resolveMaterialValuesFromSettings,
  sanitizeDebugPhysicsTuningPayload,
} from "./modules/simulationPhysicsTuning.js";
import {
  buildPlayerListPayload,
  buildSimulationSnapshot,
} from "./modules/simulationSnapshot.js";
import {
  shipBodyPositionFromCenter,
  shipBodyVelocityFromCenterVelocity,
  shipCenterFromBodyPosition,
  shipCenterVelocityFromBodyVelocity,
} from "./physics/shipTransform.js";
import {
  recordShipTransformHistory as syncRecordShipTransformHistory,
  syncPhysicsFromSim as syncPhysicsFromSimState,
  syncSimFromPhysics as syncSimFromPhysicsState,
  type ShipTransformHistoryEntry,
} from "./modules/simulationStateSync.js";
import {
  checkSweptProjectileHitShipCollisions,
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
  type SimulationCollisionHandlersContext,
} from "./modules/simulationCollisionHandlers.js";
import {
  applyMapFeatureForcesToBodies as applyMapFeatureForcesToBodiesState,
  applyMapFeatureKinematics as applyMapFeatureKinematicsState,
  clearMapFeatures as clearMapFeaturesState,
  spawnMapFeatures as spawnMapFeaturesState,
  updateMapFeatures as updateMapFeaturesState,
  type RuntimeYellowBlockState,
  type SimulationMapFeaturesContext,
} from "./modules/simulationMapFeatures.js";
import {
  ensureRoomLeader,
  getHumanBySession,
  resolveControlledPlayerFromSession,
  resolveLocalKeySlotForSession,
  sanitizePlayerName,
  type PlayerControlsContext,
} from "./modules/simulationPlayerControls.js";

// System imports
import { updateBots } from "./systems/AISystem.js";
import { updateShips } from "./systems/ShipSystem.js";
import { updateProjectiles } from "./systems/CollisionSystem.js";
import {
  updateAsteroidSpawning,
  updateAsteroids,
  wrapAsteroids,
  destroyAsteroid as asteroidDestroyAsteroid,
  hitAsteroid,
} from "./systems/AsteroidSystem.js";
import {
  updatePowerUps,
  grantPowerUp as powerUpGrantPowerUp,
  spawnRandomPowerUp,
} from "./systems/PowerUpSystem.js";
import {
  updateLaserBeams,
  checkMineCollisions,
  explodeMine as weaponExplodeMine,
  updateHomingMissiles,
  checkHomingMissileCollisions,
  updateJoustCollisions,
  updateTurret,
  updateTurretBullets,
} from "./systems/WeaponSystem.js";
import {
  updatePilots,
  onShipHit as flowOnShipHit,
  killPilot as flowKillPilot,
  respawnFromPilot as flowRespawnFromPilot,
  updateEndlessRespawns,
  updatePendingEliminationChecks,
  checkEliminationWin,
  endMatchByScore,
  beginPlaying,
  clearRoundEntities,
  syncRoomMeta,
  cleanupExpiredEntities,
  getSpawnPoints,
} from "./systems/GameFlowSystem.js";

const { Body } = Matter;

const LAG_COMP_MAX_REWIND_MS = 200;

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
  ruleset: Ruleset = "ROUND_ELIMINATION";
  experienceContext: ExperienceContext = "LIVE_MATCH";
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
  demoFrozenPlayerIds: Set<string> | null = null;
  // Back-compat marker kept while client migrates to explicit context usage.
  isDemo = false;
  private physics: Physics;
  private shipBodies = new Map<string, Matter.Body>();
  private asteroidBodies = new Map<string, Matter.Body>();
  private pilotBodies = new Map<string, Matter.Body>();
  private projectileBodies = new Map<string, Matter.Body>();
  private powerUpBodies = new Map<string, Matter.Body>();
  private turretBulletBodies = new Map<string, Matter.Body>();
  private turretBody: Matter.Body | null = null;
  private yellowBlocks: RuntimeYellowBlockState[] = [];
  private yellowBlockBodyIndex = new Map<number, number>();
  private yellowBlockSwordHitCooldown = new Map<number, number>();
  private centerHoleBodies: Matter.Body[] = [];
  private mapPowerUpsSpawned = false;
  private shipTransformHistory = new Map<string, ShipTransformHistoryEntry[]>();
  private deferredProjectileWallHits = new Set<string>();

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
        const projectileId = this.getPluginString(projectileBody, "entityId");
        if (!projectileId) return;
        this.deferredProjectileWallHits.add(projectileId);
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
    const customName = sanitizePlayerName(requestedName);
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

  removeSession(
    sessionId: string,
    reason: PlayerRemovalReason = "left",
  ): void {
    const localPlayerIds = [...this.players.values()]
      .filter(
        (player) => player.botType === "local" && player.sessionId === sessionId,
      )
      .map((player) => player.id);
    for (const localPlayerId of localPlayerIds) {
      this.removePlayerById(localPlayerId, reason);
    }

    const playerId = this.humanBySession.get(sessionId);
    if (!playerId) return;
    this.humanBySession.delete(sessionId);
    this.removePlayerById(playerId, reason);
  }

  setName(sessionId: string, rawName: string): void {
    const player = getHumanBySession(this.createPlayerControlsContext(), sessionId);
    if (!player) return;
    const name = sanitizePlayerName(rawName);
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
    const player = resolveControlledPlayerFromSession(
      this.createPlayerControlsContext(),
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
    const player = resolveControlledPlayerFromSession(
      this.createPlayerControlsContext(),
      sessionId,
      payload.controlledPlayerId,
    );
    if (!player) return;
    player.dashQueued = true;
  }

  startMatch(sessionId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (this.phase !== "LOBBY" && this.phase !== "GAME_END") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Cannot start from this phase");
      return;
    }
    if (this.playerOrder.length < 2) {
      this.hooks.onError(sessionId, "NOT_ENOUGH_PLAYERS", "Need at least 2 players");
      return;
    }

    this.beginMatchSequence(this.phase === "GAME_END");
  }

  continueMatchSequence(sessionId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (this.phase !== "GAME_END") {
      this.hooks.onError(
        sessionId,
        "INVALID_PHASE",
        "Can only continue from game end",
      );
      return;
    }
    if (this.playerOrder.length < 2) {
      this.hooks.onError(sessionId, "NOT_ENOUGH_PLAYERS", "Need at least 2 players");
      return;
    }

    this.beginMatchSequence(true);
  }

  private beginMatchSequence(preserveScoreAndKills: boolean): void {
    this.winnerId = null;
    this.winnerName = null;
    this.mapPowerUpsSpawned = false;
    if (this.useClassicMapRotation) {
      this.rotateToRandomMap();
    }
    this.currentRound = 1;
    this.roundEndMs = 0;
    this.resetPlayersForNewSequence(preserveScoreAndKills);

    if (!this.shouldUseCountdownPhase()) {
      this.reseed((Date.now() >>> 0) ^ this.currentRound);
      beginPlaying(this);
      return;
    }

    this.phase = "COUNTDOWN";
    this.countdownMs = COUNTDOWN_SECONDS * 1000;
    this.countdownValue = COUNTDOWN_SECONDS;
    // Publish map/room meta before phase/countdown callbacks so clients
    // can swap visuals before entering the next phase.
    syncRoomMeta(this);
    this.hooks.onPhase("COUNTDOWN");
    this.hooks.onCountdown(this.countdownValue);
    this.syncPlayers();
  }


  private shouldUseCountdownPhase(): boolean {
    return this.experienceContext === "LIVE_MATCH";
  }
  restartToLobby(sessionId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    this.phase = "LOBBY";
    this.countdownMs = 0;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.currentRound = 1;
    if (this.useClassicMapRotation) {
      this.mapId = 0;
    }
    this.mapPowerUpsSpawned = false;
    this.devModeEnabled = false;
    this.resetPlayersForNewSequence(false);
    this.hooks.onPhase("LOBBY");
    syncRoomMeta(this);
    this.syncPlayers();
  }

  setMode(sessionId: string, mode: GameMode): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (mode === "CUSTOM") return;
    const baseMode = mode as BaseGameMode;
    this.baseMode = baseMode;
    this.mode = baseMode;
    this.settings = applyModeTemplate(baseMode, this.settings.roundsToWin);
    syncRoomMeta(this);
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  setRuleset(sessionId: string, ruleset: Ruleset): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(
        sessionId,
        "INVALID_PHASE",
        "Ruleset can only be changed in lobby",
      );
      return;
    }

    this.ruleset = ruleset;
    if (!isMapAllowedForContext(this.mapId, this.ruleset, this.experienceContext)) {
      this.mapId = 0;
      this.useClassicMapRotation = true;
    }
    syncRoomMeta(this);
  }

  setExperienceContext(context: ExperienceContext): void {
    this.experienceContext = context;
    this.isDemo = context !== "LIVE_MATCH";
    if (!isMapAllowedForContext(this.mapId, this.ruleset, this.experienceContext)) {
      this.mapId = 0;
      this.useClassicMapRotation = true;
      this.mapPowerUpsSpawned = false;
    }
    syncRoomMeta(this);
  }

  endMatch(sessionId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (this.ruleset !== "ENDLESS_RESPAWN" || this.phase !== "PLAYING") {
      this.hooks.onError(
        sessionId,
        "INVALID_PHASE",
        "Can only end an endless match while playing",
      );
      return;
    }
    endMatchByScore(this);
  }

  setAdvancedSettings(sessionId: string, payload: AdvancedSettingsSync): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
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
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Maps can only be changed in lobby");
      return;
    }
    if (!Number.isInteger(mapId) || mapId < 0 || mapId > 6) {
      this.hooks.onError(sessionId, "INVALID_MAP", "Unknown map");
      return;
    }
    const nextMapId = mapId as MapId;
    if (!isMapAllowedForContext(nextMapId, this.ruleset, this.experienceContext)) {
      this.hooks.onError(
        sessionId,
        "INVALID_MAP",
        "Map is unavailable for selected ruleset",
      );
      return;
    }
    this.useClassicMapRotation = nextMapId === 0;
    this.mapId = nextMapId;
    this.mapPowerUpsSpawned = false;
    syncRoomMeta(this);
  }

  setPlayerAI(sessionId: string, enabled: boolean): void {
    const player = this.players.get(sessionId);
    if (!player) return;
    player.isBot = enabled;
    player.botType = enabled ? "ai" : null;
  }

  /** Immediately skips the countdown, entering PLAYING phase. Demo use only. */
  skipCountdown(): void {
    if (this.phase !== "COUNTDOWN") return;
    this.countdownMs = 0;
    this.countdownValue = 0;
  }

  /**
   * Removes ejected pilots that have been floating for longer than maxAgeMs.
   * Sets their player state to SPECTATING so the demo respawn monitor picks them up.
   * Demo use only.
   */
  demoCleanupStalePilots(maxAgeMs: number): void {
    if (this.phase !== "PLAYING") return;
    let changed = false;
    for (const [playerId, pilot] of this.pilots) {
      if (pilot.alive && this.nowMs - pilot.spawnTime > maxAgeMs) {
        this.pilots.delete(playerId);
        this.removePilotBody(playerId);
        const player = this.players.get(playerId);
        if (player && player.state === "EJECTED") {
          player.state = "SPECTATING";
          if (this.ruleset === "ENDLESS_RESPAWN") {
            player.endlessRespawnAtMs = this.nowMs + 3000;
          }
          changed = true;
        }
      }
    }
    if (changed) this.syncPlayers();
  }

  /**
   * Respawns a player's ship mid-round at their assigned corner.
   * Demo use only — should not be called during normal gameplay.
   */
  /**
   * Freeze every player except the host so their ships stay stationary during
   * tutorial action steps. Pass `null` to unfreeze everyone.
   * Demo use only.
   */
  demoFreezeOthers(hostSessionId: string | null): void {
    if (hostSessionId === null) {
      this.demoFrozenPlayerIds = null;
      return;
    }
    const frozen = new Set<string>();
    for (const id of this.players.keys()) {
      if (id !== hostSessionId) frozen.add(id);
    }
    this.demoFrozenPlayerIds = frozen;
  }

  /** Demo-only: make the player's ship invulnerable for durationMs milliseconds. */
  demoSetPlayerInvincible(playerId: string, durationMs: number): void {
    const player = this.players.get(playerId);
    if (!player?.ship.alive) return;
    player.ship.invulnerableUntil = this.nowMs + durationMs;
  }

  demoRespawnPlayer(playerId: string): void {
    if (this.phase !== "PLAYING") return;
    const player = this.players.get(playerId);
    if (!player) return;

    // Remove any existing ejected pilot
    if (this.pilots.has(playerId)) {
      this.pilots.delete(playerId);
      this.removePilotBody(playerId);
    }

    // Assign spawn position based on player order index
    const idx = this.playerOrder.indexOf(playerId);
    const points = getSpawnPoints(this.playerOrder.length);
    const spawn = points[idx % points.length] ?? points[0];

    player.state = "ACTIVE";
    player.dashQueued = false;
    player.dashTimerSec = 0;
    player.dashVectorX = 0;
    player.dashVectorY = 0;
    player.recoilTimerSec = 0;
    player.angularVelocity = 0;
    player.endlessRespawnAtMs = null;
    player.ship = {
      ...player.ship,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      vx: 0,
      vy: 0,
      alive: true,
      invulnerableUntil: this.nowMs + 2000,
      ammo: MAX_AMMO,
      maxAmmo: MAX_AMMO,
      lastShotTime: this.nowMs - this.getGlobalConfig().FIRE_COOLDOWN_MS - 1,
      reloadStartTime: this.nowMs,
      isReloading: false,
    };

    this.syncPlayers();
  }

  rotateToRandomMap(): void {
    const previousMapId = this.mapId;
    const rotationPool =
      this.ruleset === "ENDLESS_RESPAWN"
        ? CLASSIC_ROTATION_MAP_IDS.filter((id) =>
            ENDLESS_ALLOWED_MAP_IDS.includes(id),
          )
        : CLASSIC_ROTATION_MAP_IDS;
    const otherMaps = rotationPool.filter(
      (id) => id !== previousMapId,
    );
    if (otherMaps.length === 0) return;
    const randomIndex = Math.floor(this.idRng.next() * otherMaps.length);
    const newMapId = otherMaps[randomIndex];
    this.mapId = newMapId;
    this.mapPowerUpsSpawned = false;
  }

  addAIBot(sessionId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
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
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
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

    const normalizedKeySlot = resolveLocalKeySlotForSession(
      this.createPlayerControlsContext(),
      sessionId,
      keySlot,
    );
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
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
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
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    this.markDebugSessionTainted();
    this.debugPhysicsTuning = sanitizeDebugPhysicsTuningPayload(payload);
  }

  getDebugPhysicsTuningSnapshot(): DebugPhysicsTuningSnapshot {
    return {
      config: this.getActiveConfig(),
      materials: resolveMaterialValuesFromSettings(
        this.settings,
        this.debugPhysicsTuning,
      ),
      globals: this.getGlobalConfig(),
      overrides: this.debugPhysicsTuning
        ? {
            configOverrides: this.debugPhysicsTuning.configOverrides
              ? { ...this.debugPhysicsTuning.configOverrides }
              : undefined,
            materialOverrides: this.debugPhysicsTuning.materialOverrides
              ? { ...this.debugPhysicsTuning.materialOverrides }
              : undefined,
            globalOverrides: this.debugPhysicsTuning.globalOverrides
              ? { ...this.debugPhysicsTuning.globalOverrides }
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
    const player = getHumanBySession(this.createPlayerControlsContext(), sessionId);
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
    const player = getHumanBySession(this.createPlayerControlsContext(), sessionId);
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
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    const player = this.players.get(playerId);
    if (!player || !player.isBot) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Bot not found");
      return;
    }
    this.removePlayerById(playerId, "left");
  }

  kickPlayer(sessionId: string, targetId: string): void {
    if (!ensureRoomLeader(this.createPlayerControlsContext(), sessionId)) return;
    const target = this.players.get(targetId);
    if (!target) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Player not found");
      return;
    }
    if (target.sessionId === sessionId) {
      this.hooks.onError(sessionId, "INVALID_TARGET", "Cannot kick yourself");
      return;
    }
    if (target.isBot || !target.sessionId) {
      this.removePlayerById(targetId, "kicked");
      return;
    }

    const targetSessionId = target.sessionId;
    this.hooks.onKickSession?.(
      targetSessionId,
      "KICKED_BY_LEADER",
      "You were removed by the room leader",
    );
    this.removeSession(targetSessionId, "kicked");
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
        if (!this.shouldUseCountdownPhase()) {
          this.reseed((Date.now() >>> 0) ^ this.currentRound);
          beginPlaying(this);
        } else {
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
    }

    if (this.phase !== "PLAYING") {
      syncRecordShipTransformHistory({
        nowMs: this.nowMs,
        playerOrder: this.playerOrder,
        players: this.players,
        shipTransformHistory: this.shipTransformHistory,
      });
      this.hooks.onSnapshot(this.buildSnapshot());
      return;
    }

    const dtSec = deltaMs / 1000;

    updateBots(this);
    updateShips(this, dtSec);
    updatePilots(this, dtSec);
    updateAsteroidSpawning(this);
    updateAsteroids(this, dtSec);
    syncPhysicsFromSimState({
      resolveMaterialValues: () =>
        resolveMaterialValuesFromSettings(this.settings, this.debugPhysicsTuning),
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
    this.applyMapFeatureForcesToBodies();
    const previousProjectilePositions = this.captureBodyPositions(
      this.projectileBodies,
    );
    const previousProjectileVelocities = this.captureBodyVelocities(
      this.projectileBodies,
    );
    this.physics.update(deltaMs);
    const collisionHandlersContext = this.createCollisionHandlersContext();
    checkSweptProjectileHitShipCollisions(
      collisionHandlersContext,
      this.shipBodies,
      previousProjectilePositions,
      previousProjectileVelocities,
      this.deferredProjectileWallHits,
    );
    this.flushDeferredProjectileWallHits(collisionHandlersContext);
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
    wrapAsteroids(this);
    updateProjectiles(this, dtSec);
    updatePowerUps(this, dtSec);
    updateLaserBeams(this);
    checkLaserBeamBlockCollisionsState(collisionHandlersContext);
    checkMineCollisions(this);
    updateHomingMissiles(this, dtSec);
    checkHomingMissileCollisions(this);
    updateJoustCollisions(this);
    checkJoustYellowBlockCollisionsState(collisionHandlersContext);
    updateTurret(this, dtSec);
    updateTurretBullets(this, dtSec);
    this.applyMapFeatureKinematics(dtSec);
    cleanupExpiredEntities(this);
    updateEndlessRespawns(this);
    updatePendingEliminationChecks(this);
    if (this.pendingEliminationCheckAtMs === null) {
      checkEliminationWin(this);
    }

    syncRecordShipTransformHistory({
      nowMs: this.nowMs,
      playerOrder: this.playerOrder,
      players: this.players,
      shipTransformHistory: this.shipTransformHistory,
    });
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

  getGlobalConfig(): DebugPhysicsGlobals {
    return resolveGlobalValues(this.debugPhysicsTuning);
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

  private createMapFeaturesContext(): SimulationMapFeaturesContext {
    return {
      physics: this.physics,
      nowMs: this.nowMs,
      nextEntityId: this.nextEntityId.bind(this),
      powerUpRng: this.powerUpRng,
      rotationDirection: this.rotationDirection,
      getCurrentMap: this.getCurrentMap.bind(this),
      getMapPowerUpsSpawned: () => this.mapPowerUpsSpawned,
      setMapPowerUpsSpawned: (spawned: boolean) => {
        this.mapPowerUpsSpawned = spawned;
      },
      yellowBlocks: this.yellowBlocks,
      yellowBlockBodyIndex: this.yellowBlockBodyIndex,
      yellowBlockSwordHitCooldown: this.yellowBlockSwordHitCooldown,
      centerHoleBodies: this.centerHoleBodies,
      powerUps: this.powerUps,
      players: this.players,
      pilots: this.pilots,
      asteroids: this.asteroids,
      projectiles: this.projectiles,
      turretBullets: this.turretBullets,
      homingMissiles: this.homingMissiles,
      mines: this.mines,
      shipBodies: this.shipBodies,
      pilotBodies: this.pilotBodies,
      asteroidBodies: this.asteroidBodies,
      projectileBodies: this.projectileBodies,
      turretBulletBodies: this.turretBulletBodies,
    };
  }

  private captureBodyPositions(
    bodies: ReadonlyMap<string, Matter.Body>,
  ): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    for (const [entityId, body] of bodies) {
      out.set(entityId, {
        x: body.position.x,
        y: body.position.y,
      });
    }
    return out;
  }

  private captureBodyVelocities(
    bodies: ReadonlyMap<string, Matter.Body>,
  ): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    for (const [entityId, body] of bodies) {
      out.set(entityId, {
        x: body.velocity.x,
        y: body.velocity.y,
      });
    }
    return out;
  }

  private flushDeferredProjectileWallHits(
    collisionContext: SimulationCollisionHandlersContext,
  ): void {
    if (this.deferredProjectileWallHits.size <= 0) return;

    for (const projectileId of this.deferredProjectileWallHits) {
      if (!this.projectileBodies.has(projectileId)) continue;
      collisionContext.removeProjectileEntity(projectileId);
    }
    this.deferredProjectileWallHits.clear();
  }

  spawnMapFeatures(): void {
    spawnMapFeaturesState(this.createMapFeaturesContext());
  }

  private applyMapFeatureForcesToBodies(): void {
    applyMapFeatureForcesToBodiesState(this.createMapFeaturesContext());
  }

  private applyMapFeatureKinematics(dtSec: number): void {
    applyMapFeatureKinematicsState(this.createMapFeaturesContext(), dtSec);
  }

  updateMapFeatures(dtSec: number): void {
    updateMapFeaturesState(this.createMapFeaturesContext(), dtSec);
  }

  clearMapFeatures(): void {
    clearMapFeaturesState(this.createMapFeaturesContext());
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
    this.deferredProjectileWallHits.clear();
    this.clearMapFeatures();
  }

  // ============= PRIVATE HELPERS =============

  private createCollisionHandlersContext(): SimulationCollisionHandlersContext {
    const globals = this.getGlobalConfig();
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
      laserBeamWidth: globals.LASER_BEAM_WIDTH,
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
    if (typeof value === "string") return value;

    const parent = body.parent;
    if (parent && parent !== body) {
      const parentValue = (parent.plugin as Record<string, unknown> | undefined)?.[key];
      if (typeof parentValue === "string") return parentValue;
    }

    return null;
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

  private createPlayerControlsContext(): PlayerControlsContext {
    return {
      players: this.players,
      humanBySession: this.humanBySession,
      leaderPlayerId: this.leaderPlayerId,
      hooks: this.hooks,
    };
  }

  private getCurrentMap(): MapDefinition {
    return getMapDefinition(this.mapId);
  }

  private removePlayerById(
    playerId: string,
    reason: PlayerRemovalReason = "left",
  ): void {
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

    this.hooks.onPlayerRemoved?.(playerId, reason);
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

  private resetPlayersForNewSequence(preserveScoreAndKills: boolean): void {
    clearRoundEntities(this);
    const globals = this.getGlobalConfig();
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      if (!preserveScoreAndKills) {
        player.kills = 0;
        player.score = 0;
      }
      player.roundWins = 0;
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
      player.endlessRespawnAtMs = null;
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
        lastShotTime: this.nowMs - globals.FIRE_COOLDOWN_MS - 1,
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
      endlessRespawnAtMs: null,
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
    const globals = this.getGlobalConfig();
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
      laserBeamWidth: globals.LASER_BEAM_WIDTH,
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
