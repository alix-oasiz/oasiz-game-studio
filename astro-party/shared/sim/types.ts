// ============= GAME TYPES =============

export type GamePhase =
  | "START"
  | "LOBBY"
  | "COUNTDOWN"
  | "PLAYING"
  | "ROUND_END"
  | "GAME_END";

export type PlayerState = "ACTIVE" | "EJECTED" | "SPECTATING";
export type GameMode = "STANDARD" | "SANE" | "CHAOTIC" | "CUSTOM";
export type BaseGameMode = "STANDARD" | "SANE" | "CHAOTIC";
export type PowerUpType =
  | "LASER"
  | "SHIELD"
  | "SCATTER"
  | "MINE"
  | "REVERSE"
  | "JOUST"
  | "HOMING_MISSILE";
export type MapId = 0 | 1 | 2 | 3 | 4;

// ============= SETTINGS =============

export type AsteroidDensity = "NONE" | "SOME" | "MANY" | "SPAWN";
export type SpeedPreset = "SLOW" | "NORMAL" | "FAST";
export type DashPreset = "LOW" | "NORMAL" | "HIGH";
export type ModePreset = "STANDARD" | "SANE" | "CHAOTIC";

export interface AdvancedSettings {
  asteroidDensity: AsteroidDensity;
  startPowerups: boolean;
  roundsToWin: number;
  shipSpeed: SpeedPreset;
  dashPower: DashPreset;
  rotationPreset: ModePreset;
  rotationBoostPreset: ModePreset;
  recoilPreset: ModePreset;
  shipRestitutionPreset: ModePreset;
  shipFrictionAirPreset: ModePreset;
  wallRestitutionPreset: ModePreset;
  wallFrictionPreset: ModePreset;
  shipFrictionPreset: ModePreset;
  angularDampingPreset: ModePreset;
}

export interface AdvancedSettingsSync {
  mode: GameMode;
  baseMode: BaseGameMode;
  settings: AdvancedSettings;
}

// ============= INPUT =============

export interface PlayerInput {
  buttonA: boolean;
  buttonB: boolean;
  timestamp: number;
  clientTimeMs: number;
  inputSequence: number;
  rttMs?: number;
}

// ============= ENTITY STATES (snapshot-serializable) =============

export interface ShipState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  alive: boolean;
  invulnerableUntil: number;
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  reloadStartTime: number;
  isReloading: boolean;
}

export interface PilotState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  survivalProgress: number;
  alive: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
}

export interface AsteroidState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  size: number;
  alive: boolean;
  vertices: { x: number; y: number }[];
  variant: "ORANGE" | "GREY";
  hp: number;
  maxHp: number;
}

export interface PowerUpState {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  spawnTime: number;
  remainingTimeFraction: number;
  alive: boolean;
  magneticRadius?: number;
  isMagneticActive?: boolean;
}

export interface LaserBeamState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
}

export interface MineState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  spawnTime: number;
  alive: boolean;
  exploded: boolean;
  explosionTime: number;
  arming: boolean;
  armingStartTime: number;
  triggeringPlayerId?: string;
}

export interface HomingMissileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
}

export interface TurretState {
  id: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  detectionRadius: number;
  orbitRadius: number;
  isTracking: boolean;
  targetAngle: number;
}

export interface TurretBulletState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
  exploded: boolean;
  explosionTime: number;
}

export interface PlayerPowerUp {
  type: PowerUpType;
  charges: number;
  maxCharges: number;
  lastFireTime: number;
  shieldHits: number;
  leftSwordActive?: boolean;
  rightSwordActive?: boolean;
}

// ============= PAYLOADS =============

export interface RoundResultPayload {
  roundNumber: number;
  winnerId?: string;
  winnerName?: string;
  isTie: boolean;
  roundWinsById: Record<string, number>;
}

export interface PlayerListMeta {
  id: string;
  customName: string;
  profileName?: string;
  botType?: "ai" | "local";
  colorIndex: number;
  keySlot?: number;
  kills: number;
  roundWins: number;
  playerState: PlayerState;
  isBot: boolean;
}

export interface PlayerListPayload {
  order: string[];
  meta: PlayerListMeta[];
  hostId: string | null;
  revision: number;
}

export interface RoomMetaPayload {
  roomCode: string;
  leaderPlayerId: string | null;
  phase: GamePhase;
  mode: GameMode;
  baseMode: BaseGameMode;
  settings: AdvancedSettings;
  mapId: MapId;
}

export interface AsteroidColliderSync {
  asteroidId: string;
  // Flat [x1, y1, x2, y2, ...] in local asteroid space,
  // quantized by ASTEROID_COLLIDER_VERTEX_SCALE.
  vertices: number[];
}

export interface SnapshotPayload {
  ships: ShipState[];
  pilots: PilotState[];
  projectiles: ProjectileState[];
  asteroids: AsteroidState[];
  powerUps: PowerUpState[];
  laserBeams: LaserBeamState[];
  mines: MineState[];
  homingMissiles: HomingMissileState[];
  turret?: TurretState;
  turretBullets: TurretBulletState[];
  playerPowerUps: Record<string, PlayerPowerUp | null>;
  rotationDirection: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
  hostTick: number;
  tickDurationMs: number;
  serverNowMs: number;
  lastProcessedInputSequenceByPlayer: Record<string, number>;
  mapId: MapId;
  yellowBlockHp: number[];
}

// ============= HOOKS (simulation → host) =============

export interface Hooks {
  onPlayers: (payload: PlayerListPayload) => void;
  onRoomMeta: (payload: RoomMetaPayload) => void;
  onPhase: (phase: GamePhase, winnerId?: string, winnerName?: string) => void;
  onCountdown: (count: number) => void;
  onRoundResult: (payload: RoundResultPayload) => void;
  onSnapshot: (payload: SnapshotPayload) => void;
  onSound: (type: string, playerId: string) => void;
  onScreenShake: (intensity: number, duration: number) => void;
  onDashParticles: (payload: {
    playerId: string;
    x: number;
    y: number;
    angle: number;
    color: string;
  }) => void;
  onDevMode: (enabled: boolean) => void;
  onError: (sessionId: string, code: string, message: string) => void;
}

// ============= RUNTIME TYPES (simulation-internal, not serialized) =============

export interface RuntimePlayer {
  id: string;
  sessionId: string | null;
  name: string;
  isBot: boolean;
  botType: "ai" | "local" | null;
  keySlot?: number;
  colorIndex: number;
  kills: number;
  roundWins: number;
  state: PlayerState;
  input: PlayerInput;
  latestInputSequence: number;
  lastProcessedInputSequence: number;
  reportedRttMs: number;
  dashQueued: boolean;
  botThinkAtMs: number;
  botLastDecisionMs: number;
  botCachedAction: {
    buttonA: boolean;
    buttonB: boolean;
    dash: boolean;
  };
  fireButtonHeld: boolean;
  fireRequested: boolean;
  firePressStartMs: number;
  lastShipDashAtMs: number;
  dashTimerSec: number;
  dashVectorX: number;
  dashVectorY: number;
  recoilTimerSec: number;
  angularVelocity: number;
  ship: ShipState;
}

export interface RuntimePilot extends PilotState {
  angularVelocity: number;
  lastDashAtMs: number;
  dashInputHeld: boolean;
  controlMode: "player" | "ai";
  aiThinkAtMs: number;
  aiTargetAngle: number;
  aiShouldDash: boolean;
}

export interface RuntimeProjectile extends ProjectileState {
  lifetimeMs: number;
}

export interface RuntimeAsteroid extends AsteroidState {}

export interface RuntimePowerUp extends PowerUpState {
  magneticRadius: number;
  magneticSpeed: number;
  targetPlayerId: string | null;
}

export interface RuntimeLaserBeam extends LaserBeamState {
  durationMs: number;
}

export interface RuntimeMine extends MineState {}

export interface RuntimeHomingMissile extends HomingMissileState {
  targetId: string | null;
  hasDetectedTarget: boolean;
}

export interface RuntimeTurret extends TurretState {
  lastFireTimeMs: number;
  fireCooldownMs: number;
  fireAngleThreshold: number;
}

export interface RuntimeTurretBullet extends TurretBulletState {
  lifetimeMs: number;
  explosionRadius: number;
  hitsApplied: boolean;
}

// ============= ACTIVE CONFIG =============

export interface ActiveConfig {
  BASE_THRUST: number;
  ROTATION_SPEED: number;
  ROTATION_THRUST_BONUS: number;
  RECOIL_FORCE: number;
  DASH_FORCE: number;
  SHIP_FRICTION_AIR: number;
  SHIP_RESTITUTION: number;
  SHIP_TARGET_SPEED: number;
  SHIP_SPEED_RESPONSE: number;
  SHIP_DASH_BOOST: number;
  SHIP_DASH_DURATION: number;
  SHIP_RECOIL_SLOWDOWN: number;
  SHIP_RECOIL_DURATION: number;
  PROJECTILE_SPEED: number;
  PILOT_ROTATION_SPEED: number;
  PILOT_DASH_FORCE: number;
}

// ============= SIM STATE (interface for system access) =============

export interface SimState {
  // Entity collections
  players: Map<string, RuntimePlayer>;
  playerOrder: string[];
  humanBySession: Map<string, string>;
  pilots: Map<string, RuntimePilot>;
  projectiles: RuntimeProjectile[];
  asteroids: RuntimeAsteroid[];
  powerUps: RuntimePowerUp[];
  laserBeams: RuntimeLaserBeam[];
  mines: RuntimeMine[];
  homingMissiles: RuntimeHomingMissile[];
  turret: RuntimeTurret | null;
  turretBullets: RuntimeTurretBullet[];
  playerPowerUps: Map<string, PlayerPowerUp | null>;

  // Game state
  phase: GamePhase;
  hostTick: number;
  nowMs: number;
  settings: AdvancedSettings;
  baseMode: BaseGameMode;
  mode: GameMode;
  mapId: MapId;
  rotationDirection: number;
  devModeEnabled: boolean;
  currentRound: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
  pendingEliminationCheckAtMs: number | null;
  nextAsteroidSpawnAtMs: number | null;
  tickDurationMs: number;
  roomCode: string;
  leaderPlayerId: string | null;
  roundEndMs: number;

  // Hooks
  hooks: Hooks;

  // RNG instances
  asteroidRng: import("./SeededRNG.js").SeededRNG;
  powerUpRng: import("./SeededRNG.js").SeededRNG;
  aiRng: import("./SeededRNG.js").SeededRNG;
  idRng: import("./SeededRNG.js").SeededRNG;

  // Helper methods systems may call
  nextEntityId(prefix: string): string;
  getActiveConfig(): ActiveConfig;
  triggerScreenShake(intensity: number, duration: number): void;
  syncPlayers(): void;
  grantPowerUp(playerId: string, type: PowerUpType): void;
  setFireButtonState(player: RuntimePlayer, pressed: boolean): void;
  spawnMapFeatures(): void;
  updateMapFeatures(dtSec: number): void;
  clearMapFeatures(): void;
  onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void;
  killPilot(pilotPlayerId: string, killerId: string): void;
  respawnFromPilot(playerId: string, pilot: RuntimePilot): void;
  destroyAsteroid(asteroid: RuntimeAsteroid): void;
  explodeMine(mine: RuntimeMine): void;
  removeShipBody(playerId: string): void;
  removeAsteroidBody(asteroidId: string): void;
  removePilotBody(playerId: string): void;
  removeProjectileBody(projectileId: string): void;
  removeHomingMissileBody(missileId: string): void;
  removeTurretBulletBody(bulletId: string): void;
  applyShipForce(playerId: string, x: number, y: number): void;
  applyPilotForce(playerId: string, x: number, y: number): void;
  setShipAngle(playerId: string, angle: number): void;
  setShipVelocity(playerId: string, vx: number, vy: number): void;
  setShipAngularVelocity(playerId: string, angularVelocity: number): void;
  setPilotAngle(playerId: string, angle: number): void;
  setPilotAngularVelocity(playerId: string, angularVelocity: number): void;
  setAsteroidPosition(asteroidId: string, x: number, y: number): void;
  getLagCompensatedShipPose(
    playerId: string,
    rewindMs: number,
  ): { x: number; y: number; angle: number } | null;
  getLagCompensationRewindMs(playerId: string): number;
  clearPhysicsBodies(): void;
}
