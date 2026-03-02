import {
  PILOT_SURVIVAL_MS,
  POWERUP_DESPAWN_MS,
} from "../constants.js";
import type {
  MapId,
  PlayerPowerUp,
  PlayerListMeta,
  PlayerListPayload,
  RuntimeAsteroid,
  RuntimeHomingMissile,
  RuntimeLaserBeam,
  RuntimeMine,
  RuntimePilot,
  RuntimePlayer,
  RuntimePowerUp,
  RuntimeProjectile,
  RuntimeTurret,
  RuntimeTurretBullet,
  SnapshotPayload,
} from "../types.js";
import { clamp } from "../utils.js";

export interface BuildPlayerListPayloadInput {
  playerOrder: string[];
  players: Map<string, RuntimePlayer>;
  leaderPlayerId: string | null;
  revision: number;
}

export function buildPlayerListPayload(
  input: BuildPlayerListPayloadInput,
): PlayerListPayload {
  const meta: PlayerListMeta[] = input.playerOrder
    .map((playerId) => input.players.get(playerId))
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
      comboMultiplier: player.comboMultiplier,
      comboExpiresAtMs: player.comboExpiresAtMs,
      playerState: player.state,
      isBot: player.isBot,
    }));

  return {
    order: [...input.playerOrder],
    meta,
    hostId: input.leaderPlayerId,
    revision: input.revision + 1,
  };
}

export interface BuildSimulationSnapshotInput {
  nowMs: number;
  playerOrder: string[];
  players: Map<string, RuntimePlayer>;
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
  rotationDirection: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
  hostTick: number;
  tickDurationMs: number;
  mapId: MapId;
  yellowBlockHp: number[];
  laserBeamWidth: number;
}

export function buildSimulationSnapshot(
  input: BuildSimulationSnapshotInput,
): SnapshotPayload {
  const ships = [];
  for (const playerId of input.playerOrder) {
    const player = input.players.get(playerId);
    if (!player) continue;
    ships.push({ ...player.ship });
  }

  const pilots = [...input.pilots.values()]
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
      survivalProgress: clamp(
        (input.nowMs - pilot.spawnTime) / PILOT_SURVIVAL_MS,
        0,
        1,
      ),
      alive: true,
    }));

  const playerPowerUps: Record<string, PlayerPowerUp | null> = {};
  input.playerPowerUps.forEach((value, key) => {
    playerPowerUps[key] = value;
  });

  const lastProcessedInputSequenceByPlayer: Record<string, number> = {};
  for (const [playerId, player] of input.players) {
    lastProcessedInputSequenceByPlayer[playerId] =
      player.lastProcessedInputSequence;
  }

  return {
    ships,
    pilots,
    projectiles: input.projectiles.map((proj) => ({
      id: proj.id,
      ownerId: proj.ownerId,
      x: proj.x,
      y: proj.y,
      vx: proj.vx,
      vy: proj.vy,
      spawnTime: proj.spawnTime,
      radius: proj.radius,
      visualGlowRadius: proj.visualGlowRadius,
    })),
    asteroids: input.asteroids
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
    powerUps: input.powerUps
      .filter((powerUp) => powerUp.alive)
      .map((powerUp) => ({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: powerUp.type,
        spawnTime: powerUp.spawnTime,
        remainingTimeFraction: clamp(
          (POWERUP_DESPAWN_MS - (input.nowMs - powerUp.spawnTime)) /
            POWERUP_DESPAWN_MS,
          0,
          1,
        ),
        alive: powerUp.alive,
        magneticRadius: powerUp.magneticRadius,
        isMagneticActive: powerUp.isMagneticActive,
      })),
    laserBeams: input.laserBeams
      .filter((beam) => beam.alive)
      .map((beam) => ({
        id: beam.id,
        ownerId: beam.ownerId,
        x: beam.x,
        y: beam.y,
        angle: beam.angle,
        spawnTime: beam.spawnTime,
        alive: beam.alive,
      })),
    mines: input.mines
      .filter((mine) => mine.alive)
      .map((mine) => ({
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
    homingMissiles: input.homingMissiles
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
    turret: input.turret
      ? {
          id: input.turret.id,
          x: input.turret.x,
          y: input.turret.y,
          angle: input.turret.angle,
          alive: input.turret.alive,
          detectionRadius: input.turret.detectionRadius,
          orbitRadius: input.turret.orbitRadius,
          isTracking: input.turret.isTracking,
          targetAngle: input.turret.targetAngle,
        }
      : undefined,
    turretBullets: input.turretBullets
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
        explosionRadius: bullet.explosionRadius,
      })),
    playerPowerUps,
    rotationDirection: input.rotationDirection,
    screenShakeIntensity: input.screenShakeIntensity,
    screenShakeDuration: input.screenShakeDuration,
    hostTick: input.hostTick,
    tickDurationMs: input.tickDurationMs,
    serverNowMs: Date.now(),
    lastProcessedInputSequenceByPlayer,
    mapId: input.mapId,
    yellowBlockHp: input.yellowBlockHp,
    laserBeamWidth: input.laserBeamWidth,
  };
}
