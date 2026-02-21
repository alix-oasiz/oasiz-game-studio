import type { SimState, RuntimeMine, RuntimeAsteroid, ShipState } from "../types.js";
import {
  SHIP_RADIUS,
  PILOT_RADIUS,
  MINE_EXPLOSION_RADIUS,
  MINE_ARMING_DELAY_MS,
  MINE_DETECTION_RADIUS,
  HOMING_MISSILE_SPEED,
  HOMING_MISSILE_TURN_RATE,
  HOMING_MISSILE_DETECTION_RADIUS,
  HOMING_MISSILE_RADIUS,
  HOMING_MISSILE_ACCURACY,
  HOMING_MISSILE_LIFETIME_MS,
  JOUST_SWORD_LENGTH,
  JOUST_COLLISION_RADIUS,
  POWERUP_SHIELD_HITS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
} from "../constants.js";
import {
  SHIP_JOUST_LOCAL_POINTS,
  localPointToWorld,
} from "../../geometry/ShipRenderAnchors.js";
import { TURRET_TUNING } from "../mapFeatureTuning.js";
import { normalizeAngle, clamp } from "../utils.js";
import {
  distanceSqPointToSegment,
  getAsteroidWorldVertices,
  pointInPolygon,
} from "../physics/geometryMath.js";

export function updateLaserBeams(sim: SimState): void {
  for (const beam of sim.laserBeams) {
    if (!beam.alive) continue;
    if (sim.nowMs - beam.spawnTime > beam.durationMs) {
      beam.alive = false;
    }
  }
}

export function checkMineCollisions(sim: SimState): void {
  const devMultiplier = sim.devModeEnabled ? 3 : 1;
  const detectionRadius = MINE_DETECTION_RADIUS * devMultiplier;

  for (const mine of sim.mines) {
    if (!mine.alive || mine.exploded) continue;

    if (mine.arming && sim.nowMs - mine.armingStartTime >= MINE_ARMING_DELAY_MS) {
      sim.explodeMine(mine);
      mine.triggeringPlayerId = undefined;
      continue;
    }

    if (mine.arming) continue;

    for (const playerId of sim.playerOrder) {
      if (playerId === mine.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - mine.x;
      const dy = player.ship.y - mine.y;
      if (dx * dx + dy * dy > detectionRadius * detectionRadius) continue;
      mine.arming = true;
      mine.armingStartTime = sim.nowMs;
      mine.triggeringPlayerId = playerId;
      sim.triggerScreenShake(2, 0.1);
      break;
    }
  }
}

export function explodeMine(sim: SimState, mine: RuntimeMine): void {
  if (!mine.alive || mine.exploded) return;
  mine.exploded = true;
  mine.explosionTime = sim.nowMs;
  mine.arming = false;
  sim.triggerScreenShake(15, 0.4);

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const dx = player.ship.x - mine.x;
    const dy = player.ship.y - mine.y;
    if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const knockback = 2.8;
    const nx = dx / dist;
    const ny = dy / dist;

    const shipPowerUp = sim.playerPowerUps.get(playerId);
    if (shipPowerUp?.type === "SHIELD") {
      // Mine strips shield completely (ignores shield hit count), ship survives and is pushed.
      sim.playerPowerUps.delete(playerId);
      applyShipKnockback(sim, playerId, player.ship, nx, ny, knockback);
      sim.triggerScreenShake(10, 0.3);
      continue;
    }

    player.ship.alive = false;
    player.ship.vx = 0;
    player.ship.vy = 0;
    player.state = "SPECTATING";
    sim.playerPowerUps.delete(playerId);
    sim.hooks.onSound("explosion", playerId);
  }

  for (const [pilotPlayerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;
    const dx = pilot.x - mine.x;
    const dy = pilot.y - mine.y;
    if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
    pilot.alive = false;
    sim.pilots.delete(pilotPlayerId);
    const player = sim.players.get(pilotPlayerId);
    if (player) {
      player.state = "SPECTATING";
    }
    sim.hooks.onSound("kill", pilotPlayerId);
  }

  const eliminationAt = sim.nowMs + 2000;
  if (
    sim.pendingEliminationCheckAtMs === null ||
    eliminationAt < sim.pendingEliminationCheckAtMs
  ) {
    sim.pendingEliminationCheckAtMs = eliminationAt;
  }
  sim.syncPlayers();
}

export function updateHomingMissiles(sim: SimState, dtSec: number): void {
  for (const missile of sim.homingMissiles) {
    if (!missile.alive) continue;

    let nearestId: string | null = null;
    let nearestDistSq = Infinity;
    for (const playerId of sim.playerOrder) {
      if (playerId === missile.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - missile.x;
      const dy = player.ship.y - missile.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > HOMING_MISSILE_DETECTION_RADIUS * HOMING_MISSILE_DETECTION_RADIUS) continue;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestId = playerId;
      }
    }

    if (nearestId) {
      missile.targetId = nearestId;
      missile.hasDetectedTarget = true;
    }

    if (missile.hasDetectedTarget && missile.targetId) {
      const target = sim.players.get(missile.targetId);
      if (target && target.ship.alive) {
        const desired = Math.atan2(target.ship.y - missile.y, target.ship.x - missile.x);
        const diff = normalizeAngle(desired - missile.angle);
        const turnRate = HOMING_MISSILE_TURN_RATE * dtSec;
        const maxTurn = turnRate * HOMING_MISSILE_ACCURACY;
        missile.angle += clamp(diff, -maxTurn, maxTurn);
      } else {
        missile.targetId = null;
      }
    }

    missile.vx = Math.cos(missile.angle) * HOMING_MISSILE_SPEED;
    missile.vy = Math.sin(missile.angle) * HOMING_MISSILE_SPEED;
    missile.x += missile.vx * dtSec * 60;
    missile.y += missile.vy * dtSec * 60;

    const margin = 100;
    if (
      missile.x < -margin ||
      missile.x > ARENA_WIDTH + margin ||
      missile.y < -margin ||
      missile.y > ARENA_HEIGHT + margin
    ) {
      missile.alive = false;
      sim.removeHomingMissileBody(missile.id);
    }
  }
}

export function checkHomingMissileCollisions(sim: SimState): void {
  for (const missile of sim.homingMissiles) {
    if (!missile.alive) continue;

    for (const playerId of sim.playerOrder) {
      if (playerId === missile.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - missile.x;
      const dy = player.ship.y - missile.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SHIP_RADIUS + HOMING_MISSILE_RADIUS + 7) continue;

      const powerUp = sim.playerPowerUps.get(playerId);
      if (powerUp?.type === "SHIELD") {
        powerUp.shieldHits += 1;
        sim.triggerScreenShake(3, 0.1);
        if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
          sim.playerPowerUps.delete(playerId);
        }
        missile.alive = false;
        break;
      }

      if (powerUp?.type === "JOUST") {
        const missileAngle = Math.atan2(missile.vy, missile.vx);
        const angleToShip = Math.atan2(dy, dx);
        const approachDiff = Math.abs(normalizeAngle(angleToShip - missileAngle));
        const isFromSide = approachDiff > Math.PI / 4;

        if (!isFromSide) {
          sim.playerPowerUps.delete(playerId);
          sim.onShipHit(sim.players.get(missile.ownerId), player);
          missile.alive = false;
          break;
        }

        const relativeAngle = normalizeAngle(Math.atan2(dy, dx) - player.ship.angle);
        const isLeftSide = relativeAngle > 0;
        if (isLeftSide && powerUp.leftSwordActive) {
          powerUp.leftSwordActive = false;
          missile.alive = false;
          sim.triggerScreenShake(5, 0.15);
        } else if (!isLeftSide && powerUp.rightSwordActive) {
          powerUp.rightSwordActive = false;
          missile.alive = false;
          sim.triggerScreenShake(5, 0.15);
        } else {
          sim.playerPowerUps.delete(playerId);
          sim.onShipHit(sim.players.get(missile.ownerId), player);
          missile.alive = false;
        }
        if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
          sim.playerPowerUps.delete(playerId);
        }
        break;
      }

      sim.playerPowerUps.delete(playerId);
      sim.onShipHit(sim.players.get(missile.ownerId), player);
      missile.alive = false;
      sim.triggerScreenShake(10, 0.3);
      break;
    }

    if (!missile.alive) continue;

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      const dx = asteroid.x - missile.x;
      const dy = asteroid.y - missile.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > asteroid.size + HOMING_MISSILE_RADIUS) continue;
      sim.destroyAsteroid(asteroid);
      missile.alive = false;
      break;
    }

    if (!missile.alive) {
      sim.removeHomingMissileBody(missile.id);
    }
  }
}

export function damageJoustSword(
  powerUp: {
    leftSwordActive?: boolean;
    rightSwordActive?: boolean;
    leftSwordDurability?: number;
    rightSwordDurability?: number;
  },
  side: "left" | "right",
): boolean {
  const durabilityKey =
    side === "left" ? "leftSwordDurability" : "rightSwordDurability";
  const activeKey = side === "left" ? "leftSwordActive" : "rightSwordActive";

  if (!powerUp[activeKey]) return false;

  const currentDurability = powerUp[durabilityKey] ?? 1;
  if (currentDurability <= 1) {
    powerUp[activeKey] = false;
    return true;
  }

  powerUp[durabilityKey] = currentDurability - 1;
  return false;
}

function consumeJoustSideOnShipOrPilotHit(
  powerUp: {
    leftSwordActive?: boolean;
    rightSwordActive?: boolean;
    leftSwordDurability?: number;
    rightSwordDurability?: number;
  },
  side: "left" | "right",
): void {
  const activeKey = side === "left" ? "leftSwordActive" : "rightSwordActive";
  const durabilityKey =
    side === "left" ? "leftSwordDurability" : "rightSwordDurability";
  if (!powerUp[activeKey]) return;
  powerUp[activeKey] = false;
  powerUp[durabilityKey] = 0;
}

export function updateJoustCollisions(sim: SimState): void {
  const consumedProjectiles = new Set<string>();
  for (const [playerId, powerUp] of sim.playerPowerUps) {
    if (powerUp?.type !== "JOUST") continue;
    const owner = sim.players.get(playerId);
    if (!owner || !owner.ship.alive) continue;

    const swords = getJoustSwordGeometry(owner.ship);

    for (const otherId of sim.playerOrder) {
      if (otherId === playerId) continue;
      const other = sim.players.get(otherId);
      if (!other || !other.ship.alive) continue;
      let hitSide: "left" | "right" | null = null;
      let hitDx = 0;
      let hitDy = 0;

      if (powerUp.leftSwordActive) {
        const dx = other.ship.x - swords.left.centerX;
        const dy = other.ship.y - swords.left.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
          hitSide = "left";
          hitDx = dx;
          hitDy = dy;
        }
      }

      if (!hitSide && powerUp.rightSwordActive) {
        const dx = other.ship.x - swords.right.centerX;
        const dy = other.ship.y - swords.right.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
          hitSide = "right";
          hitDx = dx;
          hitDy = dy;
        }
      }

      if (hitSide) {
        const otherPowerUp = sim.playerPowerUps.get(otherId);
        if (otherPowerUp?.type === "SHIELD") {
          sim.playerPowerUps.delete(otherId);
          const dist = Math.sqrt(hitDx * hitDx + hitDy * hitDy) || 1;
          const knockback = 2.5;
          applyShipKnockback(
            sim,
            otherId,
            other.ship,
            hitDx / dist,
            hitDy / dist,
            knockback,
          );
        } else {
          sim.playerPowerUps.delete(otherId);
          sim.onShipHit(owner, other);
        }
        // Ship contact always consumes the contacting side immediately.
        consumeJoustSideOnShipOrPilotHit(powerUp, hitSide);
        sim.triggerScreenShake(8, 0.25);
      }

      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        sim.playerPowerUps.delete(playerId);
        break;
      }
    }

    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

    for (const [pilotPlayerId, pilot] of sim.pilots) {
      if (pilotPlayerId === playerId || !pilot.alive) continue;
      let hitSide: "left" | "right" | null = null;

      if (powerUp.leftSwordActive) {
        const dx = pilot.x - swords.left.centerX;
        const dy = pilot.y - swords.left.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + PILOT_RADIUS + 4) ** 2) {
          hitSide = "left";
        }
      }

      if (!hitSide && powerUp.rightSwordActive) {
        const dx = pilot.x - swords.right.centerX;
        const dy = pilot.y - swords.right.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + PILOT_RADIUS + 4) ** 2) {
          hitSide = "right";
        }
      }

      if (!hitSide) continue;

      sim.killPilot(pilotPlayerId, playerId);
      // Pilot contact also consumes exactly one side.
      consumeJoustSideOnShipOrPilotHit(powerUp, hitSide);
      sim.triggerScreenShake(6, 0.16);

      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        sim.playerPowerUps.delete(playerId);
        break;
      }
    }

    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

    for (const proj of sim.projectiles) {
      if (proj.ownerId === playerId || consumedProjectiles.has(proj.id)) continue;
      const projAngle = Math.atan2(proj.vy, proj.vx);
      const angleToShip = Math.atan2(owner.ship.y - proj.y, owner.ship.x - proj.x);
      const isFromSide = Math.abs(normalizeAngle(angleToShip - projAngle)) > Math.PI / 4;

      if (powerUp.leftSwordActive) {
        const dx = proj.x - swords.left.centerX;
        const dy = proj.y - swords.left.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
          damageJoustSword(powerUp, "left");
          consumedProjectiles.add(proj.id);
          sim.triggerScreenShake(3, 0.1);
        }
      }
      if (powerUp.rightSwordActive) {
        const dx = proj.x - swords.right.centerX;
        const dy = proj.y - swords.right.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
          damageJoustSword(powerUp, "right");
          consumedProjectiles.add(proj.id);
          sim.triggerScreenShake(3, 0.1);
        }
      }
    }

    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
      sim.playerPowerUps.delete(playerId);
      continue;
    }

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      let hitByLeft = false;
      let hitByRight = false;
      if (powerUp.leftSwordActive) {
        if (
          checkCircleAsteroidCollision(
            swords.left.centerX,
            swords.left.centerY,
            JOUST_COLLISION_RADIUS,
            asteroid,
          )
        ) {
          hitByLeft = true;
        }
      }
      if (!hitByLeft && powerUp.rightSwordActive) {
        if (
          checkCircleAsteroidCollision(
            swords.right.centerX,
            swords.right.centerY,
            JOUST_COLLISION_RADIUS,
            asteroid,
          )
        ) {
          hitByRight = true;
        }
      }
      if (hitByLeft || hitByRight) {
        sim.triggerScreenShake(3, 0.1);
        sim.destroyAsteroid(asteroid);
        if (hitByLeft) {
          damageJoustSword(powerUp, "left");
        }
        if (hitByRight) {
          damageJoustSword(powerUp, "right");
        }
      }
    }
  }

  if (consumedProjectiles.size > 0) {
    for (const projId of consumedProjectiles) {
      sim.removeProjectileBody(projId);
    }
    sim.projectiles = sim.projectiles.filter((p: { id: string }) => !consumedProjectiles.has(p.id));
  }
}

function checkCircleAsteroidCollision(
  cx: number,
  cy: number,
  radius: number,
  asteroid: RuntimeAsteroid,
): boolean {
  const vertices = getAsteroidWorldVertices(asteroid);
  if (vertices.length < 3) return false;

  if (pointInPolygon(cx, cy, vertices)) {
    return true;
  }

  const radiusSq = radius * radius;
  for (const vertex of vertices) {
    const dx = vertex.x - cx;
    const dy = vertex.y - cy;
    if (dx * dx + dy * dy <= radiusSq) {
      return true;
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (distanceSqPointToSegment(cx, cy, a.x, a.y, b.x, b.y) <= radiusSq) {
      return true;
    }
  }

  return false;
}

export function getJoustSwordGeometry(ship: ShipState): {
  left: { startX: number; startY: number; centerX: number; centerY: number };
  right: { startX: number; startY: number; centerX: number; centerY: number };
} {
  const shipAngle = ship.angle;
  const leftStart = localPointToWorld(ship, SHIP_JOUST_LOCAL_POINTS.left);
  const leftStartX = leftStart.x;
  const leftStartY = leftStart.y;
  const leftEndX = leftStartX + Math.cos(shipAngle) * JOUST_SWORD_LENGTH;
  const leftEndY = leftStartY + Math.sin(shipAngle) * JOUST_SWORD_LENGTH;

  const rightAngle = shipAngle + Math.PI / 18;
  const rightStart = localPointToWorld(ship, SHIP_JOUST_LOCAL_POINTS.right);
  const rightStartX = rightStart.x;
  const rightStartY = rightStart.y;
  const rightEndX = rightStartX + Math.cos(rightAngle) * JOUST_SWORD_LENGTH;
  const rightEndY = rightStartY + Math.sin(rightAngle) * JOUST_SWORD_LENGTH;

  return {
    left: {
      startX: leftStartX,
      startY: leftStartY,
      centerX: (leftStartX + leftEndX) * 0.5,
      centerY: (leftStartY + leftEndY) * 0.5,
    },
    right: {
      startX: rightStartX,
      startY: rightStartY,
      centerX: (rightStartX + rightEndX) * 0.5,
      centerY: (rightStartY + rightEndY) * 0.5,
    },
  };
}

export function updateTurret(sim: SimState, dtSec: number): void {
  if (!sim.turret || !sim.turret.alive) return;
  let nearest: { id: string; ship: ShipState; distance: number } | null = null;
  let nearestDistSq = Infinity;
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const dx = player.ship.x - sim.turret.x;
    const dy = player.ship.y - sim.turret.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > sim.turret.detectionRadius * sim.turret.detectionRadius) continue;
    if (distSq < nearestDistSq) {
      nearest = {
        id: playerId,
        ship: player.ship,
        distance: Math.sqrt(distSq),
      };
      nearestDistSq = distSq;
    }
  }

  if (nearest) {
    const targetAngle = Math.atan2(
      nearest.ship.y - sim.turret.y,
      nearest.ship.x - sim.turret.x,
    );
    const diff = normalizeAngle(targetAngle - sim.turret.angle);
    sim.turret.angle = normalizeAngle(
      sim.turret.angle + diff * sim.turret.trackingResponse * dtSec,
    );
    sim.turret.targetAngle = targetAngle;
    sim.turret.isTracking = true;
    if (
      Math.abs(diff) <= sim.turret.fireAngleThreshold &&
      sim.nowMs - sim.turret.lastFireTimeMs >= sim.turret.fireCooldownMs
    ) {
      sim.turret.lastFireTimeMs = sim.nowMs;
      sim.turretBullets.push({
        id: sim.nextEntityId("turret_bullet"),
        x: sim.turret.x + Math.cos(sim.turret.angle) * sim.turret.muzzleOffset,
        y: sim.turret.y + Math.sin(sim.turret.angle) * sim.turret.muzzleOffset,
        vx: Math.cos(sim.turret.angle) * TURRET_TUNING.bulletSpeed,
        vy: Math.sin(sim.turret.angle) * TURRET_TUNING.bulletSpeed,
        angle: sim.turret.angle,
        spawnTime: sim.nowMs,
        alive: true,
        exploded: false,
        explosionTime: 0,
        lifetimeMs: TURRET_TUNING.bulletLifetimeMs,
        explosionRadius: TURRET_TUNING.bulletExplosionRadius,
        hitsApplied: false,
      });
      sim.hooks.onSound("fire", "turret");
    }
    return;
  }

  sim.turret.isTracking = false;
  sim.turret.angle = normalizeAngle(
    sim.turret.angle + sim.turret.idleRotationSpeed * dtSec,
  );
}

export function updateTurretBullets(sim: SimState, dtSec: number): void {
  void dtSec;
  const outOfBoundsMargin = 60;
  for (const bullet of sim.turretBullets) {
    if (!bullet.alive) continue;

    if (
      !bullet.exploded &&
      (bullet.x < -outOfBoundsMargin ||
        bullet.x > ARENA_WIDTH + outOfBoundsMargin ||
        bullet.y < -outOfBoundsMargin ||
        bullet.y > ARENA_HEIGHT + outOfBoundsMargin)
    ) {
      bullet.alive = false;
      sim.removeTurretBulletBody(bullet.id);
      continue;
    }

    const stillActive =
      !bullet.exploded ||
      sim.nowMs - bullet.explosionTime < TURRET_TUNING.bulletExplosionDurationMs;

    if (!bullet.exploded) {
      if (sim.nowMs - bullet.spawnTime > bullet.lifetimeMs) {
        bullet.exploded = true;
        bullet.explosionTime = sim.nowMs;
        bullet.vx = 0;
        bullet.vy = 0;
        sim.removeTurretBulletBody(bullet.id);
      } else {
        for (const playerId of sim.playerOrder) {
          const player = sim.players.get(playerId);
          if (!player || !player.ship.alive) continue;
          const dx = player.ship.x - bullet.x;
          const dy = player.ship.y - bullet.y;
          if (
            dx * dx + dy * dy >
            TURRET_TUNING.bulletImpactRadius * TURRET_TUNING.bulletImpactRadius
          ) {
            continue;
          }
          bullet.exploded = true;
          bullet.explosionTime = sim.nowMs;
          bullet.vx = 0;
          bullet.vy = 0;
          sim.removeTurretBulletBody(bullet.id);
          sim.triggerScreenShake(8, 0.2);
          break;
        }
      }
    }

    if (bullet.exploded && !bullet.hitsApplied) {
      bullet.hitsApplied = true;
      for (const playerId of sim.playerOrder) {
        const player = sim.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        const dx = player.ship.x - bullet.x;
        const dy = player.ship.y - bullet.y;
        if (dx * dx + dy * dy > bullet.explosionRadius * bullet.explosionRadius) continue;

        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const knockback = 2.2;

        const powerUp = sim.playerPowerUps.get(playerId);
        if (powerUp?.type === "SHIELD") {
          // Turret blast strips shield completely, keeps ship alive, and applies recoil knockback.
          sim.playerPowerUps.delete(playerId);
          applyShipKnockback(sim, playerId, player.ship, nx, ny, knockback);
          sim.triggerScreenShake(5, 0.15);
          continue;
        }

        // Blast recoil before destruction so ejected pilot inherits outward momentum.
        applyShipKnockback(sim, playerId, player.ship, nx, ny, knockback);
        sim.playerPowerUps.delete(playerId);
        sim.onShipHit(undefined, player);
      }
    }

    if (sim.nowMs - bullet.spawnTime > bullet.lifetimeMs || !stillActive) {
      bullet.alive = false;
    }
  }
}

function applyShipKnockback(
  sim: SimState,
  playerId: string,
  ship: { vx: number; vy: number },
  nx: number,
  ny: number,
  amount: number,
): void {
  ship.vx += nx * amount;
  ship.vy += ny * amount;

  // Keep blast recoil noticeable but bounded to avoid tunneling/off-screen launches.
  const maxSpeed = 10;
  const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
  if (speed > maxSpeed && speed > 1e-6) {
    const scale = maxSpeed / speed;
    ship.vx *= scale;
    ship.vy *= scale;
  }
  sim.setShipVelocity(playerId, ship.vx, ship.vy);
}
