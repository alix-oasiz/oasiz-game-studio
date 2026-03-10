import type {
  SimState,
  RuntimePlayer,
  ActiveConfig,
  DebugPhysicsGlobals,
} from "../types.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_COLORS,
  JOUST_SPEED_MULTIPLIER,
  SCATTER_COOLDOWN_MS,
  SCATTER_ANGLE_DEG,
  SCATTER_PROJECTILE_SPEED,
  SCATTER_PROJECTILE_LIFETIME_MS,
  HOMING_MISSILE_SPEED,
  POWERUP_SHIELD_HITS,
  MINE_DEPLOY_OFFSET,
} from "../constants.js";
import { normalizeAngle } from "../utils.js";
import {
  getAsteroidWorldVertices,
  projectRayToArenaWall,
  segmentIntersectsPolygonWithRadius,
} from "../physics/geometryMath.js";
import {
  SHIP_COLLIDER_VERTICES,
  PILOT_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../../geometry/EntityShapes.js";

const STANDARD_DODGE_FORWARD_FACTOR = 0.35;
const STANDARD_DODGE_SPEED_FACTOR = 1.65;
const MATTER_BASE_STEPS_PER_SECOND = 60;

interface ProjectileSizing {
  radius: number;
  visualGlowRadius: number;
}

function resolveProjectileSizing(globals: DebugPhysicsGlobals): ProjectileSizing {
  return {
    radius: Math.max(0.1, globals.PROJECTILE_RADIUS),
    visualGlowRadius: Math.max(0.1, globals.PROJECTILE_VISUAL_GLOW_RADIUS),
  };
}

export function updateShips(sim: SimState, dtSec: number): void {
  const cfg = sim.getActiveConfig();
  const globals = sim.getGlobalConfig();
  const isStandard = sim.baseMode === "STANDARD";

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player) continue;
    const ship = player.ship;
    if (!ship.alive) continue;
    const rotatingInputHeld = player.input.buttonA;

    if (player.dashQueued) {
      player.dashQueued = false;
      if (sim.nowMs - player.lastShipDashAtMs >= globals.SHIP_DODGE_COOLDOWN_MS) {
        player.lastShipDashAtMs = sim.nowMs;
        const dodgeAngle = normalizeAngle(
          ship.angle +
            ((globals.SHIP_DODGE_ANGLE_DEG * Math.PI) / 180) *
              sim.rotationDirection,
        );
        ship.angle = dodgeAngle;
        sim.setShipAngle(player.id, ship.angle);
        player.dashVectorX = Math.cos(dodgeAngle);
        player.dashVectorY = Math.sin(dodgeAngle);
        player.dashTimerSec = cfg.SHIP_DASH_DURATION;

        if (!isStandard) {
          sim.applyShipForce(
            player.id,
            player.dashVectorX * cfg.DASH_FORCE,
            player.dashVectorY * cfg.DASH_FORCE,
          );
        }

        sim.hooks.onSound("dash", player.id);
        sim.hooks.onDashParticles({
          playerId: player.id,
          x: ship.x,
          y: ship.y,
          angle: dodgeAngle,
          color: PLAYER_COLORS[player.colorIndex].primary,
          kind: "ship",
        });
      }
    }

    const dodgeActiveForRotation = player.dashTimerSec > 0;
    const rotating = rotatingInputHeld && !dodgeActiveForRotation;
    if (dodgeActiveForRotation) {
      player.angularVelocity = 0;
      sim.setShipAngularVelocity(player.id, 0);
    } else {
      // ROTATION_SPEED is tuned as radians/second.
      // Matter angular velocity is radians per base-step (~1/60s),
      // so convert to avoid exaggerated "beyblade" spin.
      const targetAngularVelocity = rotating
        ? (cfg.ROTATION_SPEED * sim.rotationDirection) /
          MATTER_BASE_STEPS_PER_SECOND
        : 0;
      const angularResponse = rotating
        ? cfg.SHIP_ROTATION_RESPONSE
        : cfg.SHIP_ROTATION_RELEASE_RESPONSE;
      const angularT = 1 - Math.exp(-angularResponse * dtSec);
      player.angularVelocity +=
        (targetAngularVelocity - player.angularVelocity) * angularT;
      if (!rotating && Math.abs(player.angularVelocity) < 0.0001) {
        player.angularVelocity = 0;
      }
      sim.setShipAngularVelocity(player.id, player.angularVelocity);
    }

    if (player.dashTimerSec > 0) {
      player.dashTimerSec = Math.max(0, player.dashTimerSec - dtSec);
      if (player.dashTimerSec <= 0) {
        player.dashVectorX = 0;
        player.dashVectorY = 0;
      }
    }
    if (player.recoilTimerSec > 0) {
      player.recoilTimerSec = Math.max(0, player.recoilTimerSec - dtSec);
    }
    if (isStandard) {
      const dodgeActive = player.dashTimerSec > 0;
      const dodgeBoost = dodgeActive ? cfg.SHIP_DASH_BOOST : 0;
      const recoilSlowdown =
        player.recoilTimerSec > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
      const joustPowerUp = sim.playerPowerUps.get(playerId);
      const speedMultiplier = joustPowerUp?.type === "JOUST" ? JOUST_SPEED_MULTIPLIER : 1;
      const dodgeForwardFactor = dodgeActive
        ? STANDARD_DODGE_FORWARD_FACTOR
        : 1;
      const dodgeSpeed = dodgeActive
        ? cfg.SHIP_TARGET_SPEED *
          dodgeBoost *
          STANDARD_DODGE_SPEED_FACTOR *
          speedMultiplier
        : 0;
      const baseForwardSpeed = Math.max(
        0,
        (cfg.SHIP_TARGET_SPEED - recoilSlowdown) * speedMultiplier,
      );
      const forwardSpeed = rotating ? 0 : baseForwardSpeed;
      const desiredVx =
        Math.cos(ship.angle) * forwardSpeed * dodgeForwardFactor +
        player.dashVectorX * dodgeSpeed;
      const desiredVy =
        Math.sin(ship.angle) * forwardSpeed * dodgeForwardFactor +
        player.dashVectorY * dodgeSpeed;
      const speedResponse = rotating
        ? cfg.SHIP_SPEED_RESPONSE * cfg.SHIP_ROTATION_DRIFT_RESPONSE_FACTOR
        : cfg.SHIP_SPEED_RESPONSE;
      const t = 1 - Math.exp(-speedResponse * dtSec);
      ship.vx += (desiredVx - ship.vx) * t;
      ship.vy += (desiredVy - ship.vy) * t;
      sim.setShipVelocity(player.id, ship.vx, ship.vy);
    } else {
      sim.applyShipForce(
        player.id,
        Math.cos(ship.angle) * cfg.BASE_THRUST,
        Math.sin(ship.angle) * cfg.BASE_THRUST,
      );
      if (rotating && cfg.ROTATION_THRUST_BONUS !== 0) {
        sim.applyShipForce(
          player.id,
          Math.cos(ship.angle) * cfg.ROTATION_THRUST_BONUS,
          Math.sin(ship.angle) * cfg.ROTATION_THRUST_BONUS,
        );
      }
    }

    if (player.fireRequested) {
      const didFire = tryFire(sim, player, cfg, isStandard, globals);
      player.fireRequested = false;
      if (didFire && player.firePressStartMs <= 0) {
        player.firePressStartMs = sim.nowMs;
      }
    } else if (
      player.input.buttonB &&
      player.firePressStartMs > 0 &&
      sim.nowMs - player.firePressStartMs >= globals.FIRE_HOLD_REPEAT_DELAY_MS
    ) {
      tryFire(sim, player, cfg, isStandard, globals);
    }

    updateReload(sim, ship, globals);
  }
}

export function tryFire(
  sim: SimState,
  player: RuntimePlayer,
  cfg: ActiveConfig,
  isStandard: boolean,
  globals: DebugPhysicsGlobals,
): boolean {
  const ship = player.ship;
  const projectileSizing = resolveProjectileSizing(globals);
  const shipCenterX = ship.x;
  const shipCenterY = ship.y;
  const powerUp = sim.playerPowerUps.get(player.id);

  if (powerUp?.type === "JOUST") {
    return false;
  }

  if (powerUp?.type === "LASER" && powerUp.charges > 0) {
    if (sim.nowMs - powerUp.lastFireTime < globals.LASER_COOLDOWN_MS) {
      return false;
    }
    powerUp.lastFireTime = sim.nowMs;
    powerUp.charges -= 1;
    const spawnX = Math.max(0, Math.min(ARENA_WIDTH, shipCenterX));
    const spawnY = Math.max(0, Math.min(ARENA_HEIGHT, shipCenterY));
    sim.laserBeams.push({
      id: sim.nextEntityId("beam"),
      ownerId: player.id,
      x: spawnX,
      y: spawnY,
      angle: ship.angle,
      spawnTime: sim.nowMs,
      alive: true,
      durationMs: globals.LASER_BEAM_DURATION_MS,
    });
    const rewindMs = sim.getLagCompensationRewindMs(player.id);
    applyLaserDamage(
      sim,
      player.id,
      spawnX,
      spawnY,
      ship.angle,
      rewindMs,
      globals.LASER_BEAM_WIDTH,
    );
    applyWeaponRecoil(
      sim,
      player,
      cfg,
      isStandard,
      ship.angle,
      cfg.LASER_RECOIL_MULTIPLIER,
    );
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "SCATTER" && powerUp.charges > 0) {
    if (sim.nowMs - powerUp.lastFireTime < SCATTER_COOLDOWN_MS) {
      return false;
    }
    powerUp.lastFireTime = sim.nowMs;
    powerUp.charges -= 1;
    const offsets = [-(SCATTER_ANGLE_DEG * Math.PI) / 180, 0, (SCATTER_ANGLE_DEG * Math.PI) / 180];
    for (const offset of offsets) {
      const angle = ship.angle + offset;
      sim.projectiles.push({
        id: sim.nextEntityId("proj"),
        ownerId: player.id,
        x: shipCenterX,
        y: shipCenterY,
        vx: Math.cos(angle) * SCATTER_PROJECTILE_SPEED,
        vy: Math.sin(angle) * SCATTER_PROJECTILE_SPEED,
        spawnTime: sim.nowMs,
        radius: projectileSizing.radius,
        visualGlowRadius: projectileSizing.visualGlowRadius,
        lifetimeMs: SCATTER_PROJECTILE_LIFETIME_MS,
      });
    }
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "MINE" && powerUp.charges > 0) {
    powerUp.charges -= 1;
    sim.mines.push({
      id: sim.nextEntityId("mine"),
      ownerId: player.id,
      x: shipCenterX - Math.cos(ship.angle) * MINE_DEPLOY_OFFSET,
      y: shipCenterY - Math.sin(ship.angle) * MINE_DEPLOY_OFFSET,
      spawnTime: sim.nowMs,
      alive: true,
      exploded: false,
      explosionTime: 0,
      arming: false,
      armingStartTime: 0,
    });
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "HOMING_MISSILE" && powerUp.charges > 0) {
    powerUp.charges -= 1;
    sim.homingMissiles.push({
      id: sim.nextEntityId("missile"),
      ownerId: player.id,
      x: shipCenterX,
      y: shipCenterY,
      vx: Math.cos(ship.angle) * HOMING_MISSILE_SPEED,
      vy: Math.sin(ship.angle) * HOMING_MISSILE_SPEED,
      angle: ship.angle,
      spawnTime: sim.nowMs,
      alive: true,
      targetId: null,
      hasDetectedTarget: false,
    });
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (sim.nowMs - ship.lastShotTime < globals.FIRE_COOLDOWN_MS) return false;
  if (ship.ammo <= 0) return false;

  ship.lastShotTime = sim.nowMs;
  ship.ammo -= 1;

  applyWeaponRecoil(sim, player, cfg, isStandard, ship.angle);

  if (!ship.isReloading) {
    ship.reloadStartTime = sim.nowMs;
    ship.isReloading = true;
  }

  sim.projectiles.push({
    id: sim.nextEntityId("proj"),
    ownerId: player.id,
    x: shipCenterX,
    y: shipCenterY,
    vx: Math.cos(ship.angle) * cfg.PROJECTILE_SPEED,
    vy: Math.sin(ship.angle) * cfg.PROJECTILE_SPEED,
    spawnTime: sim.nowMs,
    radius: projectileSizing.radius,
    visualGlowRadius: projectileSizing.visualGlowRadius,
    lifetimeMs: globals.PROJECTILE_LIFETIME_MS,
  });
  sim.hooks.onSound("fire", player.id);
  return true;
}

function applyWeaponRecoil(
  sim: SimState,
  player: RuntimePlayer,
  cfg: ActiveConfig,
  isStandard: boolean,
  shipAngle: number,
  recoilScale: number = 1,
): void {
  if (isStandard) {
    player.recoilTimerSec = cfg.SHIP_RECOIL_DURATION * recoilScale;
    const recoilKickSpeed = Math.min(
      20,
      (cfg.SHIP_RECOIL_SLOWDOWN + cfg.RECOIL_FORCE * 1500) * recoilScale,
    );
    if (recoilKickSpeed > 0) {
      player.ship.vx -= Math.cos(shipAngle) * recoilKickSpeed;
      player.ship.vy -= Math.sin(shipAngle) * recoilKickSpeed;
      sim.setShipVelocity(player.id, player.ship.vx, player.ship.vy);
    }
    return;
  }
  sim.applyShipForce(
    player.id,
    -Math.cos(shipAngle) * cfg.RECOIL_FORCE * recoilScale,
    -Math.sin(shipAngle) * cfg.RECOIL_FORCE * recoilScale,
  );
}

function updateReload(
  sim: SimState,
  ship: {
    ammo: number;
    maxAmmo: number;
    isReloading: boolean;
    reloadStartTime: number;
  },
  globals: DebugPhysicsGlobals,
): void {
  if (!ship.isReloading) return;
  if (ship.ammo >= ship.maxAmmo) {
    ship.isReloading = false;
    return;
  }
  if (sim.nowMs - ship.reloadStartTime < globals.RELOAD_MS) return;
  ship.ammo += 1;
  ship.reloadStartTime = sim.nowMs;
  if (ship.ammo >= ship.maxAmmo) {
    ship.ammo = ship.maxAmmo;
    ship.isReloading = false;
  }
}

function applyLaserDamage(
  sim: SimState,
  ownerId: string,
  startX: number,
  startY: number,
  angle: number,
  rewindMs: number,
  beamWidth: number,
): void {
  const beamRadius = Math.max(0, beamWidth * 0.5);
  const beamEnd = projectRayToArenaWall(
    { x: startX, y: startY },
    angle,
    ARENA_WIDTH,
    ARENA_HEIGHT,
  );
  const endX = beamEnd.x;
  const endY = beamEnd.y;

  for (const playerId of sim.playerOrder) {
    if (playerId === ownerId) continue;
    const shipOwner = sim.players.get(playerId);
    if (!shipOwner || !shipOwner.ship.alive) continue;
    if (shipOwner.ship.invulnerableUntil > sim.nowMs) continue;
    const lagCompPose = sim.getLagCompensatedShipPose(playerId, rewindMs);
    const targetX = lagCompPose?.x ?? shipOwner.ship.x;
    const targetY = lagCompPose?.y ?? shipOwner.ship.y;
    const targetAngle = lagCompPose?.angle ?? shipOwner.ship.angle;
    const shipVertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      targetX,
      targetY,
      targetAngle,
    );
    if (!segmentIntersectsPolygonWithRadius(
      { x: startX, y: startY },
      { x: endX, y: endY },
      beamRadius,
      shipVertices,
    )) {
      continue;
    }
    const shield = sim.playerPowerUps.get(playerId);
    if (shield?.type === "SHIELD") {
      shield.shieldHits += 1;
      sim.triggerScreenShake(3, 0.1);
      if (shield.shieldHits >= POWERUP_SHIELD_HITS) {
        sim.playerPowerUps.delete(playerId);
      }
      continue;
    }
    sim.playerPowerUps.delete(playerId);
    sim.onShipHit(sim.players.get(ownerId), shipOwner);
  }

  for (const [pilotPlayerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;
    if (
      checkLinePilotCollision(
        startX, startY, endX, endY,
        beamRadius,
        pilot.x, pilot.y, pilot.angle,
      )
    ) {
      sim.killPilot(pilotPlayerId, ownerId);
    }
  }

  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    if (
      checkLineAsteroidCollision(
        startX, startY, endX, endY,
        beamRadius,
        asteroid,
      )
    ) {
      sim.destroyAsteroid(asteroid);
    }
  }
}

function checkLineAsteroidCollision(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  asteroid: {
    x: number;
    y: number;
    angle: number;
    vertices: Array<{ x: number; y: number }>;
  },
): boolean {
  const vertices = getAsteroidWorldVertices(asteroid);
  return segmentIntersectsPolygonWithRadius(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    radius,
    vertices,
  );
}

function checkLinePilotCollision(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  pilotX: number,
  pilotY: number,
  pilotAngle: number,
): boolean {
  const vertices = transformLocalVertices(PILOT_COLLIDER_VERTICES, pilotX, pilotY, pilotAngle);
  return segmentIntersectsPolygonWithRadius(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    radius,
    vertices,
  );
}

