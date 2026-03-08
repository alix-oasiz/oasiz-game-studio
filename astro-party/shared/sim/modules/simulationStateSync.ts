import type {
  DebugPhysicsMaterials,
  RuntimeAsteroid,
  RuntimePilot,
  RuntimePlayer,
  RuntimePowerUp,
  RuntimeProjectile,
  RuntimeTurret,
  RuntimeTurretBullet,
} from "../types.js";
import Matter from "matter-js";
import { clamp } from "../utils.js";
import {
  ARENA_HEIGHT,
  ARENA_PADDING,
  ARENA_WIDTH,
  ASTEROID_FRICTION,
  ASTEROID_RESTITUTION,
} from "../constants.js";
import { TURRET_TUNING } from "../mapFeatureTuning.js";
import {
  shipBodyPositionFromCenter,
  shipBodyVelocityFromCenterVelocity,
  shipCenterFromBodyPosition,
  shipCenterVelocityFromBodyVelocity,
} from "../physics/shipTransform.js";
import type { Physics } from "../physics/Physics.js";

const { Body } = Matter;

const LAG_COMP_HISTORY_MS = 500;

export interface ShipTransformHistoryEntry {
  atMs: number;
  x: number;
  y: number;
  angle: number;
}

export interface RecordShipTransformHistoryContext {
  nowMs: number;
  playerOrder: string[];
  players: Map<string, RuntimePlayer>;
  shipTransformHistory: Map<string, ShipTransformHistoryEntry[]>;
}

export interface SyncPhysicsFromSimContext {
  resolveMaterialValues: () => DebugPhysicsMaterials;
  physics: Physics;
  playerOrder: string[];
  players: Map<string, RuntimePlayer>;
  shipBodies: Map<string, Matter.Body>;
  asteroids: RuntimeAsteroid[];
  asteroidBodies: Map<string, Matter.Body>;
  pilots: Map<string, RuntimePilot>;
  pilotBodies: Map<string, Matter.Body>;
  projectiles: RuntimeProjectile[];
  projectileBodies: Map<string, Matter.Body>;
  powerUps: RuntimePowerUp[];
  powerUpBodies: Map<string, Matter.Body>;
  turretBullets: RuntimeTurretBullet[];
  turretBulletBodies: Map<string, Matter.Body>;
  turret: RuntimeTurret | null;
  getTurretBody: () => Matter.Body | null;
  setTurretBody: (body: Matter.Body | null) => void;
  removeShipBody: (playerId: string) => void;
  removeAsteroidBody: (asteroidId: string) => void;
  removePilotBody: (playerId: string) => void;
  removeProjectileBody: (projectileId: string) => void;
  removePowerUpBody: (powerUpId: string) => void;
  removeTurretBulletBody: (bulletId: string) => void;
}

export interface SyncSimFromPhysicsContext {
  players: Map<string, RuntimePlayer>;
  shipBodies: Map<string, Matter.Body>;
  asteroids: RuntimeAsteroid[];
  asteroidBodies: Map<string, Matter.Body>;
  pilots: Map<string, RuntimePilot>;
  pilotBodies: Map<string, Matter.Body>;
  projectiles: RuntimeProjectile[];
  projectileBodies: Map<string, Matter.Body>;
  turretBullets: RuntimeTurretBullet[];
  turretBulletBodies: Map<string, Matter.Body>;
}

export function recordShipTransformHistory(
  ctx: RecordShipTransformHistoryContext,
): void {
  const minTimeMs = ctx.nowMs - LAG_COMP_HISTORY_MS;

  for (const playerId of ctx.playerOrder) {
    const player = ctx.players.get(playerId);
    if (!player || !player.ship.alive) continue;

    let history = ctx.shipTransformHistory.get(playerId);
    if (!history) {
      history = [];
      ctx.shipTransformHistory.set(playerId, history);
    }

    history.push({
      atMs: ctx.nowMs,
      x: player.ship.x,
      y: player.ship.y,
      angle: player.ship.angle,
    });

    while (history.length > 0 && history[0].atMs < minTimeMs) {
      history.shift();
    }
  }

  for (const [playerId, history] of ctx.shipTransformHistory) {
    if (!ctx.players.has(playerId)) {
      ctx.shipTransformHistory.delete(playerId);
      continue;
    }
    while (history.length > 0 && history[0].atMs < minTimeMs) {
      history.shift();
    }
    if (history.length <= 0) {
      ctx.shipTransformHistory.delete(playerId);
    }
  }
}

export function syncPhysicsFromSim(ctx: SyncPhysicsFromSimContext): void {
  const materials = ctx.resolveMaterialValues();
  const shipRestitution = materials.SHIP_RESTITUTION;
  const shipFriction = materials.SHIP_FRICTION;
  const shipFrictionAir = materials.SHIP_FRICTION_AIR;
  const shipAngularDamping = materials.SHIP_ANGULAR_DAMPING;
  const wallRestitution = materials.WALL_RESTITUTION;
  const wallFriction = materials.WALL_FRICTION;
  ctx.physics.setWallMaterials(wallRestitution, wallFriction);

  const aliveShips = new Set<string>();
  for (const playerId of ctx.playerOrder) {
    const player = ctx.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    aliveShips.add(playerId);
    const existing = ctx.shipBodies.get(playerId);
    if (!existing) {
      const body = ctx.physics.createShip(player.ship.x, player.ship.y, playerId, {
        frictionAir: shipFrictionAir,
        restitution: shipRestitution,
        friction: shipFriction,
        angularDamping: shipAngularDamping,
      });
      Body.setAngle(body, player.ship.angle);
      Body.setPosition(
        body,
        shipBodyPositionFromCenter(player.ship.x, player.ship.y, player.ship.angle),
      );
      Body.setAngularVelocity(body, player.angularVelocity);
      Body.setVelocity(
        body,
        shipBodyVelocityFromCenterVelocity(
          player.ship.vx,
          player.ship.vy,
          player.ship.angle,
          player.angularVelocity,
        ),
      );
      ctx.shipBodies.set(playerId, body);
    } else {
      existing.restitution = shipRestitution;
      existing.friction = shipFriction;
      existing.frictionAir = shipFrictionAir;
      (existing as unknown as { angularDamping?: number }).angularDamping =
        shipAngularDamping;
    }
  }
  for (const [playerId] of ctx.shipBodies) {
    if (!aliveShips.has(playerId)) ctx.removeShipBody(playerId);
  }

  const aliveAsteroids = new Set<string>();
  for (const asteroid of ctx.asteroids) {
    if (!asteroid.alive) continue;
    aliveAsteroids.add(asteroid.id);
    const existing = ctx.asteroidBodies.get(asteroid.id);
    if (!existing) {
      const body = ctx.physics.createAsteroid(
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
      ctx.asteroidBodies.set(asteroid.id, body);
    }
  }
  for (const [asteroidId] of ctx.asteroidBodies) {
    if (!aliveAsteroids.has(asteroidId)) ctx.removeAsteroidBody(asteroidId);
  }

  const alivePilots = new Set<string>();
  for (const [playerId, pilot] of ctx.pilots) {
    if (!pilot.alive) continue;
    alivePilots.add(playerId);
    const existing = ctx.pilotBodies.get(playerId);
    if (!existing) {
      const body = ctx.physics.createPilot(pilot.x, pilot.y, playerId, {
        frictionAir: materials.PILOT_FRICTION_AIR,
        angularDamping: materials.PILOT_ANGULAR_DAMPING,
        initialAngle: pilot.angle,
        initialAngularVelocity: pilot.angularVelocity,
        vx: pilot.vx,
        vy: pilot.vy,
      });
      ctx.pilotBodies.set(playerId, body);
    } else {
      existing.frictionAir = materials.PILOT_FRICTION_AIR;
      (existing as unknown as { angularDamping?: number }).angularDamping =
        materials.PILOT_ANGULAR_DAMPING;
    }
  }
  for (const [playerId] of ctx.pilotBodies) {
    if (!alivePilots.has(playerId)) ctx.removePilotBody(playerId);
  }

  const aliveProjectiles = new Set<string>();
  for (const projectile of ctx.projectiles) {
    aliveProjectiles.add(projectile.id);
    const existing = ctx.projectileBodies.get(projectile.id);
    if (!existing) {
      const body = ctx.physics.createProjectile(
        projectile.x,
        projectile.y,
        projectile.vx,
        projectile.vy,
        projectile.radius,
        projectile.ownerId,
        projectile.id,
      );
      ctx.projectileBodies.set(projectile.id, body);
    }
  }
  for (const [projectileId] of ctx.projectileBodies) {
    if (!aliveProjectiles.has(projectileId)) ctx.removeProjectileBody(projectileId);
  }

  const alivePowerUps = new Set<string>();
  for (const powerUp of ctx.powerUps) {
    if (!powerUp.alive) continue;
    alivePowerUps.add(powerUp.id);
    const existing = ctx.powerUpBodies.get(powerUp.id);
    if (!existing) {
      const body = ctx.physics.createPowerUp(
        powerUp.x,
        powerUp.y,
        powerUp.type,
        powerUp.id,
      );
      ctx.powerUpBodies.set(powerUp.id, body);
    } else {
      Body.setPosition(existing, { x: powerUp.x, y: powerUp.y });
    }
  }
  for (const [powerUpId] of ctx.powerUpBodies) {
    if (!alivePowerUps.has(powerUpId)) ctx.removePowerUpBody(powerUpId);
  }

  const aliveBullets = new Set<string>();
  for (const bullet of ctx.turretBullets) {
    if (!bullet.alive || bullet.exploded) continue;
    aliveBullets.add(bullet.id);
    const existing = ctx.turretBulletBodies.get(bullet.id);
    if (!existing) {
      const body = ctx.physics.createTurretBullet(
        bullet.x,
        bullet.y,
        bullet.vx,
        bullet.vy,
        TURRET_TUNING.bulletRadius,
        bullet.id,
      );
      ctx.turretBulletBodies.set(bullet.id, body);
    }
  }
  for (const [bulletId] of ctx.turretBulletBodies) {
    if (!aliveBullets.has(bulletId)) ctx.removeTurretBulletBody(bulletId);
  }

  const turretBody = ctx.getTurretBody();
  if (ctx.turret && ctx.turret.alive) {
    if (!turretBody) {
      ctx.setTurretBody(ctx.physics.createTurret(ctx.turret.x, ctx.turret.y));
    } else {
      Body.setPosition(turretBody, { x: ctx.turret.x, y: ctx.turret.y });
    }
  } else if (turretBody) {
    ctx.physics.removeBody(turretBody);
    ctx.setTurretBody(null);
  }
}

export function syncSimFromPhysics(ctx: SyncSimFromPhysicsContext): void {
  for (const [playerId, body] of ctx.shipBodies) {
    const player = ctx.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const centerPosition = shipCenterFromBodyPosition(
      body.position.x,
      body.position.y,
      body.angle,
    );
    const centerVelocity = shipCenterVelocityFromBodyVelocity(
      body.velocity.x,
      body.velocity.y,
      body.angle,
      body.angularVelocity,
    );
    let x = centerPosition.x;
    let y = centerPosition.y;
    let vx = centerVelocity.x;
    let vy = centerVelocity.y;

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

      Body.setPosition(body, shipBodyPositionFromCenter(x, y, body.angle));
      Body.setVelocity(
        body,
        shipBodyVelocityFromCenterVelocity(vx, vy, body.angle, body.angularVelocity),
      );
    }

    player.ship.x = x;
    player.ship.y = y;
    player.ship.vx = vx;
    player.ship.vy = vy;
    player.ship.angle = body.angle;
    player.angularVelocity = body.angularVelocity;
  }

  for (const asteroid of ctx.asteroids) {
    if (!asteroid.alive) continue;
    const body = ctx.asteroidBodies.get(asteroid.id);
    if (!body) continue;
    asteroid.x = body.position.x;
    asteroid.y = body.position.y;
    asteroid.vx = body.velocity.x;
    asteroid.vy = body.velocity.y;
    asteroid.angle = body.angle;
    asteroid.angularVelocity = body.angularVelocity;
  }

  for (const [playerId, pilot] of ctx.pilots) {
    if (!pilot.alive) continue;
    const body = ctx.pilotBodies.get(playerId);
    if (!body) continue;
    pilot.x = body.position.x;
    pilot.y = body.position.y;
    pilot.vx = body.velocity.x;
    pilot.vy = body.velocity.y;
    pilot.angle = body.angle;
    pilot.angularVelocity = body.angularVelocity;
  }

  for (const projectile of ctx.projectiles) {
    const body = ctx.projectileBodies.get(projectile.id);
    if (!body) continue;
    projectile.x = body.position.x;
    projectile.y = body.position.y;
    projectile.vx = body.velocity.x;
    projectile.vy = body.velocity.y;
  }

  for (const bullet of ctx.turretBullets) {
    if (!bullet.alive || bullet.exploded) continue;
    const body = ctx.turretBulletBodies.get(bullet.id);
    if (!body) continue;
    bullet.x = body.position.x;
    bullet.y = body.position.y;
    bullet.vx = body.velocity.x;
    bullet.vy = body.velocity.y;
  }
}
