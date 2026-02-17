import type { SimState, RuntimePlayer, RuntimePilot, RuntimeAsteroid, RuntimePowerUp, RuntimeLaserBeam, RuntimeMine, RuntimeHomingMissile, RuntimeTurretBullet } from "./types.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  FIRE_COOLDOWN_MS,
  MAX_AMMO,
  PILOT_DASH_COOLDOWN_MS,
  PILOT_SURVIVAL_MS,
  TURRET_DETECTION_RADIUS,
  TURRET_ORBIT_RADIUS,
  TURRET_FIRE_COOLDOWN_MS,
  TURRET_FIRE_ANGLE_THRESHOLD,
  POWERUP_DESPAWN_MS,
  HOMING_MISSILE_LIFETIME_MS,
  MINE_POST_EXPIRY_MS,
  ROUND_RESULTS_DURATION_MS,
} from "./constants.js";
import { normalizeAngle } from "./utils.js";
import { spawnInitialAsteroids, scheduleAsteroidSpawn } from "./AsteroidSystem.js";
import { grantStartingPowerups } from "./PowerUpSystem.js";
import { getMapDefinition } from "./maps.js";
import { getScoreAwardForEvent } from "./scoring.js";

function awardPlayerScore(
  player: RuntimePlayer | undefined,
  event: "SHIP_DESTROY" | "PILOT_KILL" | "ROUND_WIN" | "GAME_WIN",
): void {
  if (!player) return;
  player.score += getScoreAwardForEvent(event);
}

export function updatePilots(sim: SimState, dtSec: number): void {
  const cfg = sim.getActiveConfig();
  for (const [playerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;
    const player = sim.players.get(playerId);
    if (!player) continue;

    let rotate = player.input.buttonA;
    let dash = player.input.buttonB;
    if (pilot.controlMode === "ai") {
      if (sim.nowMs >= pilot.aiThinkAtMs) {
        pilot.aiThinkAtMs = sim.nowMs + 300;
        let nearestThreat: { x: number; y: number; distSq: number } | null = null;
        for (const asteroid of sim.asteroids) {
          if (!asteroid.alive) continue;
          const dx = asteroid.x - pilot.x;
          const dy = asteroid.y - pilot.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 200 * 200) continue;
          if (!nearestThreat || distSq < nearestThreat.distSq) {
            nearestThreat = { x: asteroid.x, y: asteroid.y, distSq };
          }
        }
        if (nearestThreat) {
          const awayAngle = Math.atan2(pilot.y - nearestThreat.y, pilot.x - nearestThreat.x);
          pilot.aiTargetAngle = awayAngle;
          pilot.aiShouldDash = Math.sqrt(nearestThreat.distSq) < 140;
        } else if (sim.aiRng.next() < 0.3) {
          pilot.aiTargetAngle = sim.aiRng.next() * Math.PI * 2;
          pilot.aiShouldDash = sim.aiRng.next() < 0.25;
        } else {
          pilot.aiShouldDash = false;
        }
      }
      const angleDiff = Math.abs(normalizeAngle(pilot.aiTargetAngle - pilot.angle));
      rotate = angleDiff > 0.35;
      dash = pilot.aiShouldDash && angleDiff <= 0.35;
    }

    if (rotate) {
      pilot.angularVelocity = 0;
      sim.setPilotAngularVelocity(playerId, 0);
      pilot.angle += cfg.PILOT_ROTATION_SPEED * dtSec * sim.rotationDirection;
      pilot.angle = normalizeAngle(pilot.angle);
      sim.setPilotAngle(playerId, pilot.angle);
    }
    const dashPressedNow = dash && !pilot.dashInputHeld;
    pilot.dashInputHeld = dash;
    if (dashPressedNow && sim.nowMs - pilot.lastDashAtMs >= PILOT_DASH_COOLDOWN_MS) {
      pilot.lastDashAtMs = sim.nowMs;
      sim.applyPilotForce(
        playerId,
        Math.cos(pilot.angle) * cfg.PILOT_DASH_FORCE,
        Math.sin(pilot.angle) * cfg.PILOT_DASH_FORCE,
      );
    }

    if (sim.nowMs - pilot.spawnTime >= PILOT_SURVIVAL_MS) {
      sim.respawnFromPilot(playerId, pilot);
    }
  }
}

export function onShipHit(sim: SimState, owner: RuntimePlayer | undefined, target: RuntimePlayer): void {
  if (!target.ship.alive) return;
  const prevVx = target.ship.vx;
  const prevVy = target.ship.vy;
  const prevAngle = target.ship.angle;
  target.ship.alive = false;
  target.ship.vx = 0;
  target.ship.vy = 0;
  target.state = "EJECTED";
  const controlMode: RuntimePilot["controlMode"] =
    target.isBot && target.botType === "ai" ? "ai" : "player";
  sim.pilots.set(target.id, {
    id: sim.nextEntityId("pilot"),
    playerId: target.id,
    x: target.ship.x,
    y: target.ship.y,
    vx: prevVx * 0.7,
    vy: prevVy * 0.7,
    angle: prevAngle,
    spawnTime: sim.nowMs,
    survivalProgress: 0,
    alive: true,
    angularVelocity: target.angularVelocity * 0.6,
    lastDashAtMs: sim.nowMs - PILOT_DASH_COOLDOWN_MS - 1,
    dashInputHeld: false,
    controlMode,
    aiThinkAtMs: sim.nowMs + 300,
    aiTargetAngle: prevAngle,
    aiShouldDash: false,
  });

  sim.hooks.onSound("explosion", target.id);
  sim.triggerScreenShake(15, 0.4);
  if (owner && owner.id !== target.id) {
    awardPlayerScore(owner, "SHIP_DESTROY");
  }
  sim.syncPlayers();
}

export function killPilot(sim: SimState, pilotPlayerId: string, killerId: string): void {
  const pilot = sim.pilots.get(pilotPlayerId);
  if (!pilot || !pilot.alive) return;
  pilot.alive = false;
  sim.pilots.delete(pilotPlayerId);

  const player = sim.players.get(pilotPlayerId);
  if (player) {
    player.state = "SPECTATING";
  }

  if (killerId !== "asteroid") {
    const killer = sim.players.get(killerId);
    if (killer && killer.id !== pilotPlayerId) {
      killer.kills += 1;
      awardPlayerScore(killer, "PILOT_KILL");
    }
  }

  sim.hooks.onSound("kill", pilotPlayerId);
  sim.triggerScreenShake(10, 0.3);
  sim.syncPlayers();
}

export function respawnFromPilot(sim: SimState, playerId: string, pilot: RuntimePilot): void {
  const player = sim.players.get(playerId);
  if (!player) return;
  sim.pilots.delete(playerId);

  player.ship.x = pilot.x;
  player.ship.y = pilot.y;
  player.ship.vx = 0;
  player.ship.vy = 0;
  player.ship.angle = pilot.angle;
  player.ship.alive = true;
  player.ship.invulnerableUntil = sim.nowMs + 2000;
  player.angularVelocity = 0;
  player.ship.ammo = MAX_AMMO;
  player.ship.lastShotTime = sim.nowMs - FIRE_COOLDOWN_MS - 1;
  player.ship.reloadStartTime = sim.nowMs;
  player.ship.isReloading = false;
  player.state = "ACTIVE";

  sim.hooks.onSound("respawn", player.id);
  sim.syncPlayers();
}

export function updatePendingEliminationChecks(sim: SimState): void {
  if (sim.pendingEliminationCheckAtMs === null) return;
  if (sim.nowMs < sim.pendingEliminationCheckAtMs) return;
  sim.pendingEliminationCheckAtMs = null;
  if (sim.phase === "PLAYING") {
    checkEliminationWin(sim);
  }
}

export function checkEliminationWin(sim: SimState): void {
  if (sim.phase !== "PLAYING") return;
  const alive = sim.playerOrder
    .map((playerId) => sim.players.get(playerId))
    .filter((player): player is RuntimePlayer => Boolean(player))
    .filter((player) => player.state !== "SPECTATING");

  if (alive.length === 1) {
    endRound(sim, alive[0].id);
    return;
  }
  if (alive.length === 0 && sim.playerOrder.length > 0) {
    endRound(sim, null);
  }
}

export function endRound(sim: SimState, winnerId: string | null): void {
  if (sim.phase !== "PLAYING") return;

  const isTie = winnerId === null;
  let winnerName: string | undefined;
  if (!isTie && winnerId) {
    const winner = sim.players.get(winnerId);
    if (winner) {
      winner.roundWins += 1;
      awardPlayerScore(winner, "ROUND_WIN");
      winnerName = winner.name;
    }
  }

  const roundWinsById: Record<string, number> = {};
  const scoresById: Record<string, number> = {};
  sim.playerOrder.forEach((playerId: string) => {
    const player = sim.players.get(playerId);
    if (!player) return;
    roundWinsById[playerId] = player.roundWins;
    scoresById[playerId] = player.score;
  });

  sim.hooks.onRoundResult({
    roundNumber: sim.currentRound,
    winnerId: winnerId ?? undefined,
    winnerName,
    isTie,
    roundWinsById,
    scoresById,
  });

  if (!isTie && winnerId) {
    const winner = sim.players.get(winnerId);
    if (winner && winner.roundWins >= sim.settings.roundsToWin) {
      endGame(sim, winner.id, winner.name);
      return;
    }
  }

  sim.phase = "ROUND_END";
  sim.roundEndMs = ROUND_RESULTS_DURATION_MS;
  sim.hooks.onPhase("ROUND_END");
  syncRoomMeta(sim);
  sim.syncPlayers();
}

function endGame(sim: SimState, winnerId: string, winnerName: string): void {
  sim.phase = "GAME_END";
  const winner = sim.players.get(winnerId);
  if (winner) {
    awardPlayerScore(winner, "GAME_WIN");
  }
  const roundWinsById: Record<string, number> = {};
  const scoresById: Record<string, number> = {};
  sim.playerOrder.forEach((playerId: string) => {
    const player = sim.players.get(playerId);
    if (!player) return;
    roundWinsById[playerId] = player.roundWins;
    scoresById[playerId] = player.score;
  });
  sim.hooks.onRoundResult({
    roundNumber: sim.currentRound,
    winnerId,
    winnerName,
    isTie: false,
    roundWinsById,
    scoresById,
  });
  sim.hooks.onPhase("GAME_END", winnerId, winnerName);
  sim.hooks.onSound("win", winnerId);
  syncRoomMeta(sim);
  sim.syncPlayers();
}

export function beginPlaying(sim: SimState): void {
  if (sim.playerOrder.length < 2) {
    sim.phase = "LOBBY";
    sim.hooks.onPhase("LOBBY");
    syncRoomMeta(sim);
    sim.syncPlayers();
    return;
  }
  sim.phase = "PLAYING";
  clearRoundEntities(sim);
  spawnAllShips(sim);
  sim.spawnMapFeatures();
  grantStartingPowerups(sim);
  spawnInitialAsteroids(sim);
  scheduleAsteroidSpawn(sim);
  spawnTurret(sim);
  sim.hooks.onPhase("PLAYING");
  syncRoomMeta(sim);
  sim.syncPlayers();
}

export function clearRoundEntities(sim: SimState): void {
  sim.clearPhysicsBodies();
  sim.pilots.clear();
  sim.projectiles = [];
  sim.asteroids = [];
  sim.powerUps = [];
  sim.laserBeams = [];
  sim.mines = [];
  sim.homingMissiles = [];
  sim.turret = null;
  sim.turretBullets = [];
  sim.playerPowerUps.clear();
  sim.rotationDirection = 1;
  sim.nextAsteroidSpawnAtMs = null;
  sim.pendingEliminationCheckAtMs = null;
  sim.screenShakeIntensity = 0;
  sim.screenShakeDuration = 0;
}

export function spawnAllShips(sim: SimState): void {
  const points = getSpawnPoints(sim.playerOrder.length);
  sim.playerOrder.forEach((playerId: string, index: number) => {
    const player = sim.players.get(playerId);
    if (!player) return;
    const spawn = points[index] ?? points[0];
    player.state = "ACTIVE";
    player.dashQueued = false;
    player.lastShipDashAtMs = sim.nowMs - 1000;
    player.dashTimerSec = 0;
    player.dashVectorX = 0;
    player.dashVectorY = 0;
    player.recoilTimerSec = 0;
    player.angularVelocity = 0;
    player.ship = {
      ...player.ship,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      vx: 0,
      vy: 0,
      alive: true,
      invulnerableUntil: sim.nowMs + 2000,
      ammo: MAX_AMMO,
      maxAmmo: MAX_AMMO,
      lastShotTime: sim.nowMs - FIRE_COOLDOWN_MS - 1,
      reloadStartTime: sim.nowMs,
      isReloading: false,
    };
  });
}

export function spawnTurret(sim: SimState): void {
  const map = getMapDefinition(sim.mapId);
  if (!map.hasTurret) {
    sim.turret = null;
    return;
  }
  sim.turret = {
    id: sim.nextEntityId("turret"),
    x: ARENA_WIDTH * 0.5,
    y: ARENA_HEIGHT * 0.5,
    angle: 0,
    alive: true,
    detectionRadius: TURRET_DETECTION_RADIUS,
    orbitRadius: TURRET_ORBIT_RADIUS,
    isTracking: false,
    targetAngle: 0,
    lastFireTimeMs: sim.nowMs - TURRET_FIRE_COOLDOWN_MS - 1,
    fireCooldownMs: TURRET_FIRE_COOLDOWN_MS,
    fireAngleThreshold: TURRET_FIRE_ANGLE_THRESHOLD,
  };
}

export function getSpawnPoints(count: number): Array<{ x: number; y: number; angle: number }> {
  const padding = 100;
  const corners = [
    { x: padding, y: padding, angle: 0 },
    { x: ARENA_WIDTH - padding, y: padding, angle: Math.PI / 2 },
    { x: ARENA_WIDTH - padding, y: ARENA_HEIGHT - padding, angle: Math.PI },
    { x: padding, y: ARENA_HEIGHT - padding, angle: -Math.PI / 2 },
  ];
  if (count <= 2) return [corners[0], corners[2]];
  if (count === 3) return [corners[0], corners[1], corners[2]];
  return corners;
}

export function syncRoomMeta(sim: SimState): void {
  sim.hooks.onRoomMeta({
    roomCode: sim.roomCode,
    leaderPlayerId: sim.leaderPlayerId,
    phase: sim.phase,
    mode: sim.mode,
    baseMode: sim.baseMode,
    settings: { ...sim.settings },
    mapId: sim.mapId,
  });
}

export function cleanupExpiredEntities(sim: SimState): void {
  sim.asteroids = sim.asteroids.filter((asteroid: RuntimeAsteroid) => asteroid.alive);
  sim.powerUps = sim.powerUps.filter(
    (powerUp: RuntimePowerUp) => powerUp.alive && sim.nowMs - powerUp.spawnTime <= POWERUP_DESPAWN_MS,
  );
  sim.laserBeams = sim.laserBeams.filter(
    (beam: RuntimeLaserBeam) => beam.alive && sim.nowMs - beam.spawnTime <= beam.durationMs,
  );
  sim.mines = sim.mines.filter((mine: RuntimeMine) => {
    if (!mine.alive) return false;
    if (!mine.exploded) return true;
    return sim.nowMs - mine.explosionTime <= MINE_POST_EXPIRY_MS;
  });
  sim.homingMissiles = sim.homingMissiles.filter((missile: RuntimeHomingMissile) => {
    const keep = missile.alive && sim.nowMs - missile.spawnTime <= HOMING_MISSILE_LIFETIME_MS;
    if (!keep) {
      sim.removeHomingMissileBody(missile.id);
    }
    return keep;
  });
  sim.turretBullets = sim.turretBullets.filter((bullet: RuntimeTurretBullet) => {
    if (!bullet.alive) {
      sim.removeTurretBulletBody(bullet.id);
      return false;
    }
    return true;
  });
}
