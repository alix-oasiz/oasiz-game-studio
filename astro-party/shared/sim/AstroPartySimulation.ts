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
  ShipState,
  ActiveConfig,
  SimState,
} from "./types.js";
import Matter from "matter-js";
import { SeededRNG } from "./SeededRNG.js";
import { clamp, getModeBaseConfig, normalizeAngle, resolveConfigValue } from "./utils.js";
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
  PILOT_SURVIVAL_MS,
  POWERUP_DESPAWN_MS,
  HOMING_MISSILE_LIFETIME_MS,
  ASTEROID_RESTITUTION,
  ASTEROID_FRICTION,
  PILOT_FRICTION_AIR,
  PILOT_ANGULAR_DAMPING,
  POWERUP_SHIELD_HITS,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
  LASER_BEAM_LENGTH,
  JOUST_SWORD_LENGTH,
  ASTEROID_DAMAGE_SHIPS,
  SHIP_FRICTION_BY_PRESET,
  SHIP_ANGULAR_DAMPING_BY_PRESET,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_FRICTION_AIR_BY_PRESET,
} from "./constants.js";
import {
  getMapDefinition,
  CLASSIC_ROTATION_MAP_IDS,
  type MapDefinition,
  type YellowBlock,
} from "./maps.js";

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
  damageJoustSword,
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

const MODE_PRESETS = ["STANDARD", "SANE", "CHAOTIC"] as const;
const SPEED_PRESETS = ["SLOW", "NORMAL", "FAST"] as const;
const DASH_PRESETS = ["LOW", "NORMAL", "HIGH"] as const;
const ASTEROID_DENSITIES = ["NONE", "SOME", "MANY", "SPAWN"] as const;
const LAG_COMP_HISTORY_MS = 500;
const LAG_COMP_MAX_REWIND_MS = 200;

interface ShipTransformHistoryEntry {
  atMs: number;
  x: number;
  y: number;
  angle: number;
}

function isInList<T extends string>(value: string, values: readonly T[]): value is T {
  return (values as readonly string[]).includes(value);
}

function sanitizeBaseMode(value: string, fallback: BaseGameMode): BaseGameMode {
  return isInList(value, MODE_PRESETS) ? value : fallback;
}

function sanitizeAdvancedSettings(input: AdvancedSettings): AdvancedSettings {
  const settings: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
    ...input,
  };

  if (!isInList(settings.asteroidDensity, ASTEROID_DENSITIES)) {
    settings.asteroidDensity = DEFAULT_ADVANCED_SETTINGS.asteroidDensity;
  }
  settings.startPowerups = Boolean(settings.startPowerups);
  if (!Number.isFinite(settings.roundsToWin)) {
    settings.roundsToWin = DEFAULT_ADVANCED_SETTINGS.roundsToWin;
  } else {
    settings.roundsToWin = clamp(Math.round(settings.roundsToWin), 3, 6);
  }

  if (!isInList(settings.shipSpeed, SPEED_PRESETS)) {
    settings.shipSpeed = DEFAULT_ADVANCED_SETTINGS.shipSpeed;
  }
  if (!isInList(settings.dashPower, DASH_PRESETS)) {
    settings.dashPower = DEFAULT_ADVANCED_SETTINGS.dashPower;
  }
  if (!isInList(settings.rotationPreset, MODE_PRESETS)) {
    settings.rotationPreset = DEFAULT_ADVANCED_SETTINGS.rotationPreset;
  }
  if (!isInList(settings.rotationBoostPreset, MODE_PRESETS)) {
    settings.rotationBoostPreset = DEFAULT_ADVANCED_SETTINGS.rotationBoostPreset;
  }
  if (!isInList(settings.recoilPreset, MODE_PRESETS)) {
    settings.recoilPreset = DEFAULT_ADVANCED_SETTINGS.recoilPreset;
  }
  if (!isInList(settings.shipRestitutionPreset, MODE_PRESETS)) {
    settings.shipRestitutionPreset = DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset;
  }
  if (!isInList(settings.shipFrictionAirPreset, MODE_PRESETS)) {
    settings.shipFrictionAirPreset = DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset;
  }
  if (!isInList(settings.wallRestitutionPreset, MODE_PRESETS)) {
    settings.wallRestitutionPreset = DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset;
  }
  if (!isInList(settings.wallFrictionPreset, MODE_PRESETS)) {
    settings.wallFrictionPreset = DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset;
  }
  if (!isInList(settings.shipFrictionPreset, MODE_PRESETS)) {
    settings.shipFrictionPreset = DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset;
  }
  if (!isInList(settings.angularDampingPreset, MODE_PRESETS)) {
    settings.angularDampingPreset = DEFAULT_ADVANCED_SETTINGS.angularDampingPreset;
  }

  return settings;
}

function applyModeTemplate(baseMode: BaseGameMode, roundsToWin: number): AdvancedSettings {
  if (baseMode === "SANE") {
    return {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
      asteroidDensity: "MANY",
      startPowerups: true,
      rotationPreset: "SANE",
      rotationBoostPreset: "SANE",
      recoilPreset: "SANE",
      shipRestitutionPreset: "SANE",
      shipFrictionAirPreset: "SANE",
      wallRestitutionPreset: "SANE",
      wallFrictionPreset: "SANE",
      shipFrictionPreset: "SANE",
      angularDampingPreset: "SANE",
    };
  }
  if (baseMode === "CHAOTIC") {
    return {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
      asteroidDensity: "SPAWN",
      startPowerups: true,
      rotationPreset: "CHAOTIC",
      rotationBoostPreset: "CHAOTIC",
      recoilPreset: "CHAOTIC",
      shipRestitutionPreset: "CHAOTIC",
      shipFrictionAirPreset: "CHAOTIC",
      wallRestitutionPreset: "CHAOTIC",
      wallFrictionPreset: "CHAOTIC",
      shipFrictionPreset: "CHAOTIC",
      angularDampingPreset: "CHAOTIC",
    };
  }
  return {
    ...DEFAULT_ADVANCED_SETTINGS,
    roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
  };
}

function isCustomComparedToTemplate(
  settings: AdvancedSettings,
  template: AdvancedSettings,
): boolean {
  return (
    settings.asteroidDensity !== template.asteroidDensity ||
    settings.startPowerups !== template.startPowerups ||
    settings.shipSpeed !== template.shipSpeed ||
    settings.dashPower !== template.dashPower ||
    settings.rotationPreset !== template.rotationPreset ||
    settings.rotationBoostPreset !== template.rotationBoostPreset ||
    settings.recoilPreset !== template.recoilPreset ||
    settings.shipRestitutionPreset !== template.shipRestitutionPreset ||
    settings.shipFrictionAirPreset !== template.shipFrictionAirPreset ||
    settings.wallRestitutionPreset !== template.wallRestitutionPreset ||
    settings.wallFrictionPreset !== template.wallFrictionPreset ||
    settings.shipFrictionPreset !== template.shipFrictionPreset ||
    settings.angularDampingPreset !== template.angularDampingPreset
  );
}

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
    setupCollisions(this.physics, {
      onProjectileHitShip: (projectileBody, shipBody) => {
        this.handleProjectileHitShip(projectileBody, shipBody);
      },
      onProjectileHitPilot: (projectileBody, pilotBody) => {
        this.handleProjectileHitPilot(projectileBody, pilotBody);
      },
      onShipHitPilot: (shipBody, pilotBody) => {
        this.handleShipHitPilot(shipBody, pilotBody);
      },
      onProjectileHitWall: (projectileBody) => {
        this.removeProjectileByBody(projectileBody);
      },
      onProjectileHitYellowBlock: (projectileBody, blockBody) => {
        this.handleProjectileHitYellowBlock(projectileBody, blockBody);
      },
      onProjectileHitAsteroid: (projectileBody, asteroidBody) => {
        this.handleProjectileHitAsteroid(projectileBody, asteroidBody);
      },
      onShipHitAsteroid: (shipBody, asteroidBody) => {
        this.handleShipHitAsteroid(shipBody, asteroidBody);
      },
      onPilotHitAsteroid: (pilotBody, asteroidBody) => {
        this.handlePilotHitAsteroid(pilotBody, asteroidBody);
      },
      onShipHitPowerUp: (shipBody, powerUpBody) => {
        this.handleShipHitPowerUp(shipBody, powerUpBody);
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
    this.hooks.onPhase("COUNTDOWN");
    this.hooks.onCountdown(this.countdownValue);
    syncRoomMeta(this);
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
        this.hooks.onPhase("COUNTDOWN");
        this.hooks.onCountdown(this.countdownValue);
        syncRoomMeta(this);
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
    this.checkLaserBeamBlockCollisions();
    checkMineCollisions(this);
    updateHomingMissiles(this, dtSec);
    checkHomingMissileCollisions(this);
    updateJoustCollisions(this);
    this.checkJoustYellowBlockCollisions();
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

  getActiveConfig(): ActiveConfig {
    const cfg = getModeBaseConfig(this.baseMode);

    if (this.settings.shipSpeed === "SLOW") {
      cfg.SHIP_TARGET_SPEED = 3.6;
      cfg.BASE_THRUST = 0.0001;
    } else if (this.settings.shipSpeed === "FAST") {
      cfg.SHIP_TARGET_SPEED = 5.2;
      cfg.BASE_THRUST = 0.0002;
    }

    if (this.settings.dashPower === "LOW") {
      cfg.SHIP_DASH_BOOST = 1.2;
      cfg.DASH_FORCE = 0.007;
    } else if (this.settings.dashPower === "HIGH") {
      cfg.SHIP_DASH_BOOST = 2.8;
      cfg.DASH_FORCE = 0.018;
    }

    cfg.ROTATION_SPEED = resolveConfigValue(this.settings.rotationPreset, 3.2, 3.0, 4.5);
    cfg.ROTATION_THRUST_BONUS = resolveConfigValue(this.settings.rotationBoostPreset, 0, 0.00004, 0.00008);
    cfg.RECOIL_FORCE = resolveConfigValue(this.settings.recoilPreset, 0, 0.00015, 0.0003);
    cfg.SHIP_RESTITUTION = SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset];
    cfg.SHIP_FRICTION_AIR = SHIP_FRICTION_AIR_BY_PRESET[this.settings.shipFrictionAirPreset];

    return cfg;
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
    Body.setAngle(body, angle);
  }

  setShipVelocity(playerId: string, vx: number, vy: number): void {
    const body = this.shipBodies.get(playerId);
    if (!body) return;
    Body.setVelocity(body, { x: vx, y: vy });
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
        const influenceRadius = hole.radius * 2.5;

        const applyRotationalForce = (body: Matter.Body | undefined): void => {
          if (!body) return;
          const dx = body.position.x - hole.x;
          const dy = body.position.y - hole.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= influenceRadius || dist <= hole.radius + 10) return;

          const tx = (-dy / dist) * this.rotationDirection;
          const ty = (dx / dist) * this.rotationDirection;
          const falloff = (influenceRadius - dist) / influenceRadius;
          const forceMagnitude = 0.0015 * falloff * falloff;

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
          applyRotationalForce(this.projectileBodies.get(projectile.id));
        }

        for (const powerUp of this.powerUps) {
          if (!powerUp.alive) continue;
          applyRotationalForce(this.powerUpBodies.get(powerUp.id));
        }

        for (const bullet of this.turretBullets) {
          if (!bullet.alive) continue;
          applyRotationalForce(this.turretBulletBodies.get(bullet.id));
        }
      }
    }

    if (map.repulsionZones.length === 0) return;

    for (const zone of map.repulsionZones) {
      const influenceRadius = zone.radius * 1.75;

      const applyForceToBody = (body: Matter.Body | undefined): void => {
        if (!body) return;
        const dx = body.position.x - zone.x;
        const dy = body.position.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const strengthScale = 0.8 + falloff * 1.4;
        const forceMagnitude = (zone.strength * strengthScale) / Math.max(dist * dist, 60);

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

      for (const powerUp of this.powerUps) {
        if (!powerUp.alive) continue;
        applyForceToBody(this.powerUpBodies.get(powerUp.id));
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
        if (dist >= influenceRadius || dist <= 8) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const accel = zone.strength * (6 + falloff * 10);
        missile.vx += nx * accel * dtSec * 60;
        missile.vy += ny * accel * dtSec * 60;
      }

      for (const mine of this.mines) {
        if (!mine.alive || mine.exploded) continue;
        const dx = mine.x - zone.x;
        const dy = mine.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const drift = zone.strength * (12 + falloff * 16);
        mine.x += nx * drift * dtSec * 60;
        mine.y += ny * drift * dtSec * 60;
        mine.x = clamp(mine.x, 0, ARENA_WIDTH);
        mine.y = clamp(mine.y, 0, ARENA_HEIGHT);
      }

      for (const powerUp of this.powerUps) {
        if (!powerUp.alive) continue;
        const dx = powerUp.x - zone.x;
        const dy = powerUp.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const drift = zone.strength * (8 + falloff * 12);
        powerUp.x += nx * drift * dtSec * 60;
        powerUp.y += ny * drift * dtSec * 60;
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
    const minTimeMs = this.nowMs - LAG_COMP_HISTORY_MS;

    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;

      let history = this.shipTransformHistory.get(playerId);
      if (!history) {
        history = [];
        this.shipTransformHistory.set(playerId, history);
      }

      history.push({
        atMs: this.nowMs,
        x: player.ship.x,
        y: player.ship.y,
        angle: player.ship.angle,
      });

      while (history.length > 0 && history[0].atMs < minTimeMs) {
        history.shift();
      }
    }

    for (const [playerId, history] of this.shipTransformHistory) {
      if (!this.players.has(playerId)) {
        this.shipTransformHistory.delete(playerId);
        continue;
      }
      while (history.length > 0 && history[0].atMs < minTimeMs) {
        history.shift();
      }
      if (history.length <= 0) {
        this.shipTransformHistory.delete(playerId);
      }
    }
  }

  private syncPhysicsFromSim(): void {
    const shipRestitution =
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset] ?? 0;
    const shipFriction =
      SHIP_FRICTION_BY_PRESET[this.settings.shipFrictionPreset] ?? 0;
    const shipFrictionAir =
      SHIP_FRICTION_AIR_BY_PRESET[this.settings.shipFrictionAirPreset] ?? 0;
    const shipAngularDamping =
      SHIP_ANGULAR_DAMPING_BY_PRESET[this.settings.angularDampingPreset] ?? 0;
    const wallRestitution =
      WALL_RESTITUTION_BY_PRESET[this.settings.wallRestitutionPreset] ?? 0;
    const wallFriction =
      WALL_FRICTION_BY_PRESET[this.settings.wallFrictionPreset] ?? 0;
    this.physics.setWallMaterials(wallRestitution, wallFriction);

    const aliveShips = new Set<string>();
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      aliveShips.add(playerId);
      const existing = this.shipBodies.get(playerId);
      if (!existing) {
        const body = this.physics.createShip(player.ship.x, player.ship.y, playerId, {
          frictionAir: shipFrictionAir,
          restitution: shipRestitution,
          friction: shipFriction,
          angularDamping: shipAngularDamping,
        });
        Body.setAngle(body, player.ship.angle);
        Body.setAngularVelocity(body, player.angularVelocity);
        Body.setVelocity(body, { x: player.ship.vx, y: player.ship.vy });
        this.shipBodies.set(playerId, body);
      } else {
        existing.restitution = shipRestitution;
        existing.friction = shipFriction;
        existing.frictionAir = shipFrictionAir;
        (existing as unknown as { angularDamping?: number }).angularDamping =
          shipAngularDamping;
      }
    }
    for (const [playerId] of this.shipBodies) {
      if (!aliveShips.has(playerId)) this.removeShipBody(playerId);
    }

    const aliveAsteroids = new Set<string>();
    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      aliveAsteroids.add(asteroid.id);
      const existing = this.asteroidBodies.get(asteroid.id);
      if (!existing) {
        const body = this.physics.createAsteroid(
          asteroid.x,
          asteroid.y,
          asteroid.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
          { x: asteroid.vx, y: asteroid.vy },
          asteroid.angle,
          asteroid.angularVelocity,
          asteroid.id,
          ASTEROID_RESTITUTION,
          ASTEROID_FRICTION,
        );
        this.asteroidBodies.set(asteroid.id, body);
      }
    }
    for (const [asteroidId] of this.asteroidBodies) {
      if (!aliveAsteroids.has(asteroidId)) this.removeAsteroidBody(asteroidId);
    }

    const alivePilots = new Set<string>();
    for (const [playerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;
      alivePilots.add(playerId);
      const existing = this.pilotBodies.get(playerId);
      if (!existing) {
        const body = this.physics.createPilot(pilot.x, pilot.y, playerId, {
          frictionAir: PILOT_FRICTION_AIR,
          angularDamping: PILOT_ANGULAR_DAMPING,
          initialAngle: pilot.angle,
          initialAngularVelocity: pilot.angularVelocity,
          vx: pilot.vx,
          vy: pilot.vy,
        });
        this.pilotBodies.set(playerId, body);
      }
    }
    for (const [playerId] of this.pilotBodies) {
      if (!alivePilots.has(playerId)) this.removePilotBody(playerId);
    }

    const aliveProjectiles = new Set<string>();
    for (const projectile of this.projectiles) {
      aliveProjectiles.add(projectile.id);
      const existing = this.projectileBodies.get(projectile.id);
      if (!existing) {
        const body = this.physics.createProjectile(
          projectile.x,
          projectile.y,
          projectile.vx,
          projectile.vy,
          projectile.ownerId,
          projectile.id,
        );
        this.projectileBodies.set(projectile.id, body);
      }
    }
    for (const [projectileId] of this.projectileBodies) {
      if (!aliveProjectiles.has(projectileId)) this.removeProjectileBody(projectileId);
    }

    const alivePowerUps = new Set<string>();
    for (const powerUp of this.powerUps) {
      if (!powerUp.alive) continue;
      alivePowerUps.add(powerUp.id);
      const existing = this.powerUpBodies.get(powerUp.id);
      if (!existing) {
        const body = this.physics.createPowerUp(
          powerUp.x,
          powerUp.y,
          powerUp.type,
          powerUp.id,
        );
        this.powerUpBodies.set(powerUp.id, body);
      } else {
        Body.setPosition(existing, { x: powerUp.x, y: powerUp.y });
      }
    }
    for (const [powerUpId] of this.powerUpBodies) {
      if (!alivePowerUps.has(powerUpId)) this.removePowerUpBody(powerUpId);
    }

    const aliveBullets = new Set<string>();
    for (const bullet of this.turretBullets) {
      if (!bullet.alive || bullet.exploded) continue;
      aliveBullets.add(bullet.id);
      const existing = this.turretBulletBodies.get(bullet.id);
      if (!existing) {
        const body = this.physics.createTurretBullet(
          bullet.x,
          bullet.y,
          bullet.vx,
          bullet.vy,
          bullet.id,
        );
        this.turretBulletBodies.set(bullet.id, body);
      }
    }
    for (const [bulletId] of this.turretBulletBodies) {
      if (!aliveBullets.has(bulletId)) this.removeTurretBulletBody(bulletId);
    }

    if (this.turret && this.turret.alive) {
      if (!this.turretBody) {
        this.turretBody = this.physics.createTurret(this.turret.x, this.turret.y);
      } else {
        Body.setPosition(this.turretBody, { x: this.turret.x, y: this.turret.y });
      }
    } else if (this.turretBody) {
      this.physics.removeBody(this.turretBody);
      this.turretBody = null;
    }
  }

  private syncSimFromPhysics(): void {
    for (const [playerId, body] of this.shipBodies) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      let x = body.position.x;
      let y = body.position.y;
      let vx = body.velocity.x;
      let vy = body.velocity.y;

      // Safety guard: keep ships recoverable if an extreme impulse tunnels past boundaries.
      const minX = -ARENA_PADDING;
      const maxX = ARENA_WIDTH + ARENA_PADDING;
      const minY = -ARENA_PADDING;
      const maxY = ARENA_HEIGHT + ARENA_PADDING;
      if (x < minX || x > maxX || y < minY || y > maxY) {
        x = clamp(x, 0, ARENA_WIDTH);
        y = clamp(y, 0, ARENA_HEIGHT);

        if ((x <= 0 && vx < 0) || (x >= ARENA_WIDTH && vx > 0)) vx = 0;
        if ((y <= 0 && vy < 0) || (y >= ARENA_HEIGHT && vy > 0)) vy = 0;

        Body.setPosition(body, { x, y });
        Body.setVelocity(body, { x: vx, y: vy });
      }

      player.ship.x = x;
      player.ship.y = y;
      player.ship.vx = vx;
      player.ship.vy = vy;
      player.ship.angle = body.angle;
      player.angularVelocity = body.angularVelocity;
    }

    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      const body = this.asteroidBodies.get(asteroid.id);
      if (!body) continue;
      asteroid.x = body.position.x;
      asteroid.y = body.position.y;
      asteroid.vx = body.velocity.x;
      asteroid.vy = body.velocity.y;
      asteroid.angle = body.angle;
      asteroid.angularVelocity = body.angularVelocity;
    }

    for (const [playerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;
      const body = this.pilotBodies.get(playerId);
      if (!body) continue;
      pilot.x = body.position.x;
      pilot.y = body.position.y;
      pilot.vx = body.velocity.x;
      pilot.vy = body.velocity.y;
      pilot.angle = body.angle;
      pilot.angularVelocity = body.angularVelocity;
    }

    for (const projectile of this.projectiles) {
      const body = this.projectileBodies.get(projectile.id);
      if (!body) continue;
      projectile.x = body.position.x;
      projectile.y = body.position.y;
      projectile.vx = body.velocity.x;
      projectile.vy = body.velocity.y;
    }

    for (const bullet of this.turretBullets) {
      if (!bullet.alive || bullet.exploded) continue;
      const body = this.turretBulletBodies.get(bullet.id);
      if (!body) continue;
      bullet.x = body.position.x;
      bullet.y = body.position.y;
      bullet.vx = body.velocity.x;
      bullet.vy = body.velocity.y;
    }
  }

  private handleProjectileHitShip(projectileBody: Matter.Body, shipBody: Matter.Body): void {
    const projectileId = this.getPluginString(projectileBody, "entityId");
    const projectileOwnerId = this.getPluginString(projectileBody, "ownerId");
    const shipPlayerId = this.getPluginString(shipBody, "playerId");
    if (!projectileId || !projectileOwnerId || !shipPlayerId) return;
    if (!this.projectileBodies.has(projectileId)) return;
    if (projectileOwnerId === shipPlayerId) return;

    const shipPlayer = this.players.get(shipPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive) return;
    if (shipPlayer.ship.invulnerableUntil > this.nowMs) return;

    const powerUp = this.playerPowerUps.get(shipPlayerId);
    if (powerUp?.type === "SHIELD") {
      powerUp.shieldHits += 1;
      this.removeProjectileBody(projectileId);
      this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
      this.triggerScreenShake(3, 0.1);
      if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
        this.playerPowerUps.delete(shipPlayerId);
      }
      return;
    }

    const owner = this.players.get(projectileOwnerId);
    this.removeProjectileBody(projectileId);
    this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
    this.playerPowerUps.delete(shipPlayerId);
    this.onShipHit(owner, shipPlayer);
  }

  private handleProjectileHitPilot(projectileBody: Matter.Body, pilotBody: Matter.Body): void {
    const projectileId = this.getPluginString(projectileBody, "entityId");
    const projectileOwnerId = this.getPluginString(projectileBody, "ownerId");
    const pilotPlayerId = this.getPluginString(pilotBody, "playerId");
    if (!projectileId || !projectileOwnerId || !pilotPlayerId) return;
    if (!this.projectileBodies.has(projectileId)) return;
    const pilot = this.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) return;
    this.removeProjectileBody(projectileId);
    this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
    this.killPilot(pilotPlayerId, projectileOwnerId);
  }

  private handleShipHitPilot(shipBody: Matter.Body, pilotBody: Matter.Body): void {
    const shipPlayerId = this.getPluginString(shipBody, "playerId");
    const pilotPlayerId = this.getPluginString(pilotBody, "playerId");
    if (!shipPlayerId || !pilotPlayerId) return;
    if (shipPlayerId === pilotPlayerId) return;
    const shipPlayer = this.players.get(shipPlayerId);
    const pilot = this.pilots.get(pilotPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive || !pilot || !pilot.alive) return;
    this.killPilot(pilotPlayerId, shipPlayerId);
  }

  private handleProjectileHitAsteroid(projectileBody: Matter.Body, asteroidBody: Matter.Body): void {
    const projectileId = this.getPluginString(projectileBody, "entityId");
    const asteroidId = this.getPluginString(asteroidBody, "entityId");
    if (!projectileId || !asteroidId) return;
    if (!this.projectileBodies.has(projectileId)) return;
    const asteroid = this.asteroids.find((item) => item.id === asteroidId && item.alive);
    this.removeProjectileBody(projectileId);
    this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
    if (asteroid) {
      hitAsteroid(this, asteroid);
    }
  }

  private handleProjectileHitYellowBlock(
    projectileBody: Matter.Body,
    blockBody: Matter.Body,
  ): void {
    const projectileId = this.getPluginString(projectileBody, "entityId");
    if (!projectileId) return;
    if (!this.projectileBodies.has(projectileId)) return;

    this.removeProjectileBody(projectileId);
    this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);

    const rawBlockIndex = (blockBody.plugin as { blockIndex?: unknown } | undefined)
      ?.blockIndex;
    if (!Number.isInteger(rawBlockIndex)) return;
    this.damageYellowBlock(rawBlockIndex as number, 1);
  }

  private handleShipHitAsteroid(shipBody: Matter.Body, asteroidBody: Matter.Body): void {
    if (!ASTEROID_DAMAGE_SHIPS) return;
    const shipPlayerId = this.getPluginString(shipBody, "playerId");
    const asteroidId = this.getPluginString(asteroidBody, "entityId");
    if (!shipPlayerId || !asteroidId) return;
    const shipPlayer = this.players.get(shipPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive) return;
    if (shipPlayer.ship.invulnerableUntil > this.nowMs) return;
    const asteroid = this.asteroids.find((item) => item.id === asteroidId && item.alive);
    if (asteroid) {
      this.destroyAsteroid(asteroid);
    }
    this.playerPowerUps.delete(shipPlayerId);
    this.onShipHit(undefined, shipPlayer);
  }

  private handlePilotHitAsteroid(pilotBody: Matter.Body, asteroidBody: Matter.Body): void {
    if (!ASTEROID_DAMAGE_SHIPS) return;
    const pilotPlayerId = this.getPluginString(pilotBody, "playerId");
    const asteroidId = this.getPluginString(asteroidBody, "entityId");
    if (!pilotPlayerId || !asteroidId) return;
    const pilot = this.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) return;
    const asteroid = this.asteroids.find((item) => item.id === asteroidId && item.alive);
    if (asteroid) {
      this.destroyAsteroid(asteroid);
    }
    this.killPilot(pilotPlayerId, "asteroid");
  }

  private handleShipHitPowerUp(shipBody: Matter.Body, powerUpBody: Matter.Body): void {
    const shipPlayerId = this.getPluginString(shipBody, "playerId");
    const powerUpId = this.getPluginString(powerUpBody, "entityId");
    if (!shipPlayerId || !powerUpId) return;

    if (this.playerPowerUps.get(shipPlayerId)) return;

    const powerUp = this.powerUps.find((item) => item.id === powerUpId && item.alive);
    if (!powerUp) return;

    this.grantPowerUp(shipPlayerId, powerUp.type);
    powerUp.alive = false;
    this.removePowerUpBody(powerUpId);
  }

  private damageYellowBlock(blockIndex: number, amount: number): void {
    const block = this.yellowBlocks[blockIndex];
    if (!block || block.hp <= 0) return;
    block.hp -= amount;
    if (block.hp > 0) return;
    block.hp = 0;
    if (block.body) {
      this.physics.removeBody(block.body);
      this.yellowBlockBodyIndex.delete(block.body.id);
      this.yellowBlockSwordHitCooldown.delete(blockIndex);
      block.body = null;
    }
  }

  private checkLaserBeamBlockCollisions(): void {
    for (const beam of this.laserBeams) {
      if (!beam.alive) continue;

      const start = { x: beam.x, y: beam.y };
      const end = {
        x: beam.x + Math.cos(beam.angle) * LASER_BEAM_LENGTH,
        y: beam.y + Math.sin(beam.angle) * LASER_BEAM_LENGTH,
      };

      for (let i = this.yellowBlocks.length - 1; i >= 0; i--) {
        const block = this.yellowBlocks[i];
        if (!block.body || block.hp <= 0) continue;
        const half = block.block.width * 0.5;
        if (
          this.lineIntersectsRect(
            start,
            end,
            block.body.position.x,
            block.body.position.y,
            half,
          )
        ) {
          this.damageYellowBlock(i, 1);
        }
      }
    }
  }

  private lineIntersectsRect(
    start: { x: number; y: number },
    end: { x: number; y: number },
    rectX: number,
    rectY: number,
    halfSize: number,
  ): boolean {
    const left = rectX - halfSize;
    const right = rectX + halfSize;
    const top = rectY - halfSize;
    const bottom = rectY + halfSize;

    if (
      this.pointInRect(start, left, right, top, bottom) ||
      this.pointInRect(end, left, right, top, bottom)
    ) {
      return true;
    }

    return (
      this.lineIntersectsLine(start, end, { x: left, y: top }, { x: right, y: top }) ||
      this.lineIntersectsLine(start, end, { x: right, y: top }, { x: right, y: bottom }) ||
      this.lineIntersectsLine(start, end, { x: right, y: bottom }, { x: left, y: bottom }) ||
      this.lineIntersectsLine(start, end, { x: left, y: bottom }, { x: left, y: top })
    );
  }

  private pointInRect(
    point: { x: number; y: number },
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): boolean {
    return (
      point.x >= left &&
      point.x <= right &&
      point.y >= top &&
      point.y <= bottom
    );
  }

  private lineIntersectsLine(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): boolean {
    const denominator =
      (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denominator === 0) return false;

    const ua =
      ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) /
      denominator;
    const ub =
      ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) /
      denominator;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  private checkJoustYellowBlockCollisions(): void {
    if (this.getCurrentMap().id !== 1) return;

    for (const [playerId, powerUp] of this.playerPowerUps) {
      if (powerUp?.type !== "JOUST") continue;
      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;

      const coneLength = JOUST_SWORD_LENGTH + 15;
      const coneWidth = Math.PI / 3;
      const coneTipX = player.ship.x;
      const coneTipY = player.ship.y;
      const coneAngle = player.ship.angle;

      for (let blockIndex = 0; blockIndex < this.yellowBlocks.length; blockIndex++) {
        const block = this.yellowBlocks[blockIndex];
        if (!block || block.hp <= 0 || !block.body) continue;

        const corners = [
          { x: block.block.x, y: block.block.y },
          { x: block.block.x + block.block.width, y: block.block.y },
          { x: block.block.x + block.block.width, y: block.block.y + block.block.height },
          { x: block.block.x, y: block.block.y + block.block.height },
        ];

        let hit = false;
        for (const corner of corners) {
          if (
            this.isPointInCone(
              corner.x,
              corner.y,
              coneTipX,
              coneTipY,
              coneAngle,
              coneLength,
              coneWidth,
            )
          ) {
            hit = this.tryDamageYellowBlockWithSword(blockIndex);
            if (hit) {
              const side = powerUp.leftSwordActive ? "left" : "right";
              const swordBroke = damageJoustSword(powerUp, side);
              this.triggerScreenShake(
                swordBroke ? 5 : 3,
                swordBroke ? 0.15 : 0.1,
              );
              if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
                this.playerPowerUps.delete(playerId);
              }
            }
            break;
          }
        }

        if (hit) break;
      }
    }
  }

  private tryDamageYellowBlockWithSword(blockIndex: number): boolean {
    const now = this.nowMs;
    const nextAllowed = this.yellowBlockSwordHitCooldown.get(blockIndex) ?? 0;
    if (now < nextAllowed) return false;
    this.yellowBlockSwordHitCooldown.set(blockIndex, now + 180);
    this.damageYellowBlock(blockIndex, 1);
    return true;
  }

  private isPointInCone(
    pointX: number,
    pointY: number,
    tipX: number,
    tipY: number,
    coneAngle: number,
    coneLength: number,
    coneWidth: number,
  ): boolean {
    const dx = pointX - tipX;
    const dy = pointY - tipY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > coneLength) return false;

    const pointAngle = Math.atan2(dy, dx);
    const angleDiff = normalizeAngle(pointAngle - coneAngle);
    return Math.abs(angleDiff) <= coneWidth * 0.5;
  }

  private removeProjectileByBody(projectileBody: Matter.Body): void {
    const projectileId = this.getPluginString(projectileBody, "entityId");
    if (!projectileId) return;
    if (!this.projectileBodies.has(projectileId)) return;
    this.removeProjectileBody(projectileId);
    this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);
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
    const meta: PlayerListMeta[] = this.playerOrder
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is RuntimePlayer => Boolean(player))
      .map((player) => ({
        id: player.id,
        customName: player.name,
        profileName: player.name,
        botType: player.botType ?? undefined,
        colorIndex: player.colorIndex,
        keySlot: player.keySlot,
        kills: player.kills,
        roundWins: player.roundWins,
        score: player.score,
        playerState: player.state,
        isBot: player.isBot,
      }));

    this.revision += 1;
    return {
      order: [...this.playerOrder],
      meta,
      hostId: this.leaderPlayerId,
      revision: this.revision,
    };
  }

  private buildSnapshot(): SnapshotPayload {
    const ships: ShipState[] = [];
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      ships.push({ ...player.ship });
    }

    const pilots = [...this.pilots.values()]
      .filter((pilot) => pilot.alive)
      .map((pilot) => ({
        id: pilot.id,
        playerId: pilot.playerId,
        x: pilot.x,
        y: pilot.y,
        vx: pilot.vx,
        vy: pilot.vy,
        angle: pilot.angle,
        spawnTime: pilot.spawnTime,
        survivalProgress: clamp((this.nowMs - pilot.spawnTime) / PILOT_SURVIVAL_MS, 0, 1),
        alive: true,
      }));

    const playerPowerUps: Record<string, PlayerPowerUp | null> = {};
    this.playerPowerUps.forEach((value, key) => {
      playerPowerUps[key] = value;
    });

    const lastProcessedInputSequenceByPlayer: Record<string, number> = {};
    for (const [playerId, player] of this.players) {
      lastProcessedInputSequenceByPlayer[playerId] = player.lastProcessedInputSequence;
    }

    return {
      ships,
      pilots,
      projectiles: this.projectiles.map((proj) => ({
        id: proj.id,
        ownerId: proj.ownerId,
        x: proj.x,
        y: proj.y,
        vx: proj.vx,
        vy: proj.vy,
        spawnTime: proj.spawnTime,
      })),
      asteroids: this.asteroids
        .filter((asteroid) => asteroid.alive)
        .map((asteroid) => ({
          id: asteroid.id,
          x: asteroid.x,
          y: asteroid.y,
          vx: asteroid.vx,
          vy: asteroid.vy,
          angle: asteroid.angle,
          angularVelocity: asteroid.angularVelocity,
          size: asteroid.size,
          alive: asteroid.alive,
          vertices: asteroid.vertices,
          variant: asteroid.variant,
          hp: asteroid.hp,
          maxHp: asteroid.maxHp,
        })),
      powerUps: this.powerUps
        .filter((powerUp) => powerUp.alive)
        .map((powerUp) => ({
          id: powerUp.id,
          x: powerUp.x,
          y: powerUp.y,
          type: powerUp.type,
          spawnTime: powerUp.spawnTime,
          remainingTimeFraction: clamp(
            (POWERUP_DESPAWN_MS - (this.nowMs - powerUp.spawnTime)) / POWERUP_DESPAWN_MS,
            0,
            1,
          ),
          alive: powerUp.alive,
          magneticRadius: powerUp.magneticRadius,
          isMagneticActive: powerUp.isMagneticActive,
        })),
      laserBeams: this.laserBeams.filter((beam) => beam.alive).map((beam) => ({
        id: beam.id,
        ownerId: beam.ownerId,
        x: beam.x,
        y: beam.y,
        angle: beam.angle,
        spawnTime: beam.spawnTime,
        alive: beam.alive,
      })),
      mines: this.mines.filter((mine) => mine.alive).map((mine) => ({
        id: mine.id,
        ownerId: mine.ownerId,
        x: mine.x,
        y: mine.y,
        spawnTime: mine.spawnTime,
        alive: mine.alive,
        exploded: mine.exploded,
        explosionTime: mine.explosionTime,
        arming: mine.arming,
        armingStartTime: mine.armingStartTime,
        triggeringPlayerId: mine.triggeringPlayerId,
      })),
      homingMissiles: this.homingMissiles
        .filter((missile) => missile.alive)
        .map((missile) => ({
          id: missile.id,
          ownerId: missile.ownerId,
          x: missile.x,
          y: missile.y,
          vx: missile.vx,
          vy: missile.vy,
          angle: missile.angle,
          spawnTime: missile.spawnTime,
          alive: missile.alive,
        })),
      turret: this.turret
        ? {
            id: this.turret.id,
            x: this.turret.x,
            y: this.turret.y,
            angle: this.turret.angle,
            alive: this.turret.alive,
            detectionRadius: this.turret.detectionRadius,
            orbitRadius: this.turret.orbitRadius,
            isTracking: this.turret.isTracking,
            targetAngle: this.turret.targetAngle,
          }
        : undefined,
      turretBullets: this.turretBullets
        .filter((bullet) => bullet.alive)
        .map((bullet) => ({
          id: bullet.id,
          x: bullet.x,
          y: bullet.y,
          vx: bullet.vx,
          vy: bullet.vy,
          angle: bullet.angle,
          spawnTime: bullet.spawnTime,
          alive: bullet.alive,
          exploded: bullet.exploded,
          explosionTime: bullet.explosionTime,
        })),
      playerPowerUps,
      rotationDirection: this.rotationDirection,
      screenShakeIntensity: this.screenShakeIntensity,
      screenShakeDuration: this.screenShakeDuration,
      hostTick: this.hostTick,
      tickDurationMs: this.tickDurationMs,
      serverNowMs: Date.now(),
      lastProcessedInputSequenceByPlayer,
      mapId: this.mapId,
      yellowBlockHp: this.yellowBlocks.map((block) => block.hp),
    };
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
