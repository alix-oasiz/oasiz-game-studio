import type {
  PlayerPowerUp,
  RuntimeAsteroid,
  RuntimeLaserBeam,
  RuntimePilot,
  RuntimePlayer,
  RuntimePowerUp,
} from "../types.js";
import type { Physics } from "../physics/Physics.js";
import Matter from "matter-js";
import { normalizeAngle } from "../utils.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID_DAMAGE_SHIPS,
  JOUST_SWORD_LENGTH,
  POWERUP_SHIELD_HITS,
} from "../constants.js";
import { damageJoustSword } from "../systems/WeaponSystem.js";
import {
  type Vec2,
  lineIntersectsRect,
  projectRayToArenaWall,
} from "../physics/geometryMath.js";
import { segmentIntersectsShipShield } from "../physics/shieldGeometry.js";

interface RuntimeYellowBlockLike {
  block: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  body: Matter.Body | null;
  hp: number;
}

export interface SimulationCollisionHandlersContext {
  nowMs: number;
  players: Map<string, RuntimePlayer>;
  pilots: Map<string, RuntimePilot>;
  asteroids: RuntimeAsteroid[];
  powerUps: RuntimePowerUp[];
  playerPowerUps: Map<string, PlayerPowerUp | null>;
  projectileBodies: Map<string, Matter.Body>;
  yellowBlocks: RuntimeYellowBlockLike[];
  yellowBlockBodyIndex: Map<number, number>;
  yellowBlockSwordHitCooldown: Map<number, number>;
  laserBeams: RuntimeLaserBeam[];
  laserBeamWidth: number;
  physics: Physics;
  getCurrentMapId: () => number;
  getPluginString: (body: Matter.Body, key: string) => string | null;
  removeProjectileEntity: (projectileId: string) => void;
  triggerScreenShake: (intensity: number, duration: number) => void;
  onShipHit: (owner: RuntimePlayer | undefined, target: RuntimePlayer) => void;
  killPilot: (pilotPlayerId: string, killerId: string) => void;
  hitAsteroid: (asteroid: RuntimeAsteroid) => void;
  destroyAsteroid: (asteroid: RuntimeAsteroid) => void;
  grantPowerUp: (playerId: string, type: RuntimePowerUp["type"]) => void;
  removePowerUpBody: (powerUpId: string) => void;
}

export function handleProjectileHitShipCollision(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
  shipBody: Matter.Body,
): void {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  const projectileOwnerId = ctx.getPluginString(projectileBody, "ownerId");
  const shipPlayerId = ctx.getPluginString(shipBody, "playerId");
  if (!projectileId || !projectileOwnerId || !shipPlayerId) return;
  if (!ctx.projectileBodies.has(projectileId)) return;
  if (projectileOwnerId === shipPlayerId) return;

  const shipPlayer = ctx.players.get(shipPlayerId);
  if (!shipPlayer || !shipPlayer.ship.alive) return;
  if (shipPlayer.ship.invulnerableUntil > ctx.nowMs) return;

  const powerUp = ctx.playerPowerUps.get(shipPlayerId);
  if (powerUp?.type === "SHIELD") {
    powerUp.shieldHits += 1;
    ctx.removeProjectileEntity(projectileId);
    ctx.triggerScreenShake(3, 0.1);
    if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
      ctx.playerPowerUps.delete(shipPlayerId);
    }
    return;
  }

  const owner = ctx.players.get(projectileOwnerId);
  ctx.removeProjectileEntity(projectileId);
  ctx.playerPowerUps.delete(shipPlayerId);
  ctx.onShipHit(owner, shipPlayer);
}

export function handleProjectileHitPilotCollision(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
  pilotBody: Matter.Body,
): void {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  const projectileOwnerId = ctx.getPluginString(projectileBody, "ownerId");
  const pilotPlayerId = ctx.getPluginString(pilotBody, "playerId");
  if (!projectileId || !projectileOwnerId || !pilotPlayerId) return;
  if (!ctx.projectileBodies.has(projectileId)) return;

  const pilot = ctx.pilots.get(pilotPlayerId);
  if (!pilot || !pilot.alive) return;

  ctx.removeProjectileEntity(projectileId);
  ctx.killPilot(pilotPlayerId, projectileOwnerId);
}

export function handleShipHitPilotCollision(
  ctx: SimulationCollisionHandlersContext,
  shipBody: Matter.Body,
  pilotBody: Matter.Body,
): void {
  const shipPlayerId = ctx.getPluginString(shipBody, "playerId");
  const pilotPlayerId = ctx.getPluginString(pilotBody, "playerId");
  if (!shipPlayerId || !pilotPlayerId) return;
  if (shipPlayerId === pilotPlayerId) return;

  const shipPlayer = ctx.players.get(shipPlayerId);
  const pilot = ctx.pilots.get(pilotPlayerId);
  if (!shipPlayer || !shipPlayer.ship.alive || !pilot || !pilot.alive) return;

  ctx.killPilot(pilotPlayerId, shipPlayerId);
}

export function handleProjectileHitAsteroidCollision(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
  asteroidBody: Matter.Body,
): void {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  const asteroidId = ctx.getPluginString(asteroidBody, "entityId");
  if (!projectileId || !asteroidId) return;
  if (!ctx.projectileBodies.has(projectileId)) return;

  const asteroid = ctx.asteroids.find((item) => item.id === asteroidId && item.alive);
  ctx.removeProjectileEntity(projectileId);
  if (asteroid) {
    ctx.hitAsteroid(asteroid);
  }
}

export function handleProjectileHitYellowBlockCollision(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
  blockBody: Matter.Body,
): void {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  if (!projectileId) return;
  if (!ctx.projectileBodies.has(projectileId)) return;

  ctx.removeProjectileEntity(projectileId);

  const rawBlockIndex = (blockBody.plugin as { blockIndex?: unknown } | undefined)
    ?.blockIndex;
  if (!Number.isInteger(rawBlockIndex)) return;
  damageYellowBlock(ctx, rawBlockIndex as number, 1);
}

export function handleShipHitAsteroidCollision(
  ctx: SimulationCollisionHandlersContext,
  shipBody: Matter.Body,
  asteroidBody: Matter.Body,
): void {
  if (!ASTEROID_DAMAGE_SHIPS) return;

  const shipPlayerId = ctx.getPluginString(shipBody, "playerId");
  const asteroidId = ctx.getPluginString(asteroidBody, "entityId");
  if (!shipPlayerId || !asteroidId) return;

  const shipPlayer = ctx.players.get(shipPlayerId);
  if (!shipPlayer || !shipPlayer.ship.alive) return;
  if (shipPlayer.ship.invulnerableUntil > ctx.nowMs) return;

  const asteroid = ctx.asteroids.find((item) => item.id === asteroidId && item.alive);
  if (asteroid) {
    ctx.destroyAsteroid(asteroid);
  }
  ctx.playerPowerUps.delete(shipPlayerId);
  ctx.onShipHit(undefined, shipPlayer);
}

export function handlePilotHitAsteroidCollision(
  ctx: SimulationCollisionHandlersContext,
  pilotBody: Matter.Body,
  asteroidBody: Matter.Body,
): void {
  if (!ASTEROID_DAMAGE_SHIPS) return;

  const pilotPlayerId = ctx.getPluginString(pilotBody, "playerId");
  const asteroidId = ctx.getPluginString(asteroidBody, "entityId");
  if (!pilotPlayerId || !asteroidId) return;

  const pilot = ctx.pilots.get(pilotPlayerId);
  if (!pilot || !pilot.alive) return;

  const asteroid = ctx.asteroids.find((item) => item.id === asteroidId && item.alive);
  if (asteroid) {
    ctx.destroyAsteroid(asteroid);
  }
  ctx.killPilot(pilotPlayerId, "asteroid");
}

export function handleShipHitPowerUpCollision(
  ctx: SimulationCollisionHandlersContext,
  shipBody: Matter.Body,
  powerUpBody: Matter.Body,
): void {
  const shipPlayerId = ctx.getPluginString(shipBody, "playerId");
  const powerUpId = ctx.getPluginString(powerUpBody, "entityId");
  if (!shipPlayerId || !powerUpId) return;

  if (ctx.playerPowerUps.get(shipPlayerId)) return;

  const powerUp = ctx.powerUps.find((item) => item.id === powerUpId && item.alive);
  if (!powerUp) return;

  ctx.grantPowerUp(shipPlayerId, powerUp.type);
  powerUp.alive = false;
  ctx.removePowerUpBody(powerUpId);
}

export function damageYellowBlock(
  ctx: SimulationCollisionHandlersContext,
  blockIndex: number,
  amount: number,
): void {
  const block = ctx.yellowBlocks[blockIndex];
  if (!block || block.hp <= 0) return;

  block.hp -= amount;
  if (block.hp > 0) return;

  block.hp = 0;
  if (block.body) {
    ctx.physics.removeBody(block.body);
    ctx.yellowBlockBodyIndex.delete(block.body.id);
    ctx.yellowBlockSwordHitCooldown.delete(blockIndex);
    block.body = null;
  }
}

export function checkLaserBeamBlockCollisions(
  ctx: SimulationCollisionHandlersContext,
): void {
  for (const beam of ctx.laserBeams) {
    if (!beam.alive) continue;

    const start = { x: beam.x, y: beam.y };
    const beamHalfWidth = Math.max(0, ctx.laserBeamWidth * 0.5);
    const end = projectRayToArenaWall(
      start,
      beam.angle,
      ARENA_WIDTH,
      ARENA_HEIGHT,
    );

    for (let i = ctx.yellowBlocks.length - 1; i >= 0; i--) {
      const block = ctx.yellowBlocks[i];
      if (!block.body || block.hp <= 0) continue;
      const half = block.block.width * 0.5 + beamHalfWidth;
      if (
        lineIntersectsRect(start, end, block.body.position.x, block.body.position.y, half)
      ) {
        damageYellowBlock(ctx, i, 1);
      }
    }
  }
}

export function checkJoustYellowBlockCollisions(
  ctx: SimulationCollisionHandlersContext,
): void {
  if (ctx.getCurrentMapId() !== 1) return;

  for (const [playerId, powerUp] of ctx.playerPowerUps) {
    if (powerUp?.type !== "JOUST") continue;
    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

    const player = ctx.players.get(playerId);
    if (!player || !player.ship.alive) continue;

    const coneLength = JOUST_SWORD_LENGTH + 15;
    const coneWidth = Math.PI / 3;
    const coneTipX = player.ship.x;
    const coneTipY = player.ship.y;
    const coneAngle = player.ship.angle;

    for (let blockIndex = 0; blockIndex < ctx.yellowBlocks.length; blockIndex++) {
      const block = ctx.yellowBlocks[blockIndex];
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
          isPointInCone(
            corner.x,
            corner.y,
            coneTipX,
            coneTipY,
            coneAngle,
            coneLength,
            coneWidth,
          )
        ) {
          hit = tryDamageYellowBlockWithSword(ctx, blockIndex);
          if (hit) {
            const side = powerUp.leftSwordActive ? "left" : "right";
            const swordBroke = damageJoustSword(powerUp, side);
            ctx.triggerScreenShake(swordBroke ? 5 : 3, swordBroke ? 0.15 : 0.1);
            if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
              ctx.playerPowerUps.delete(playerId);
            }
          }
          break;
        }
      }

      if (hit) break;
    }
  }
}

export function removeProjectileByBodyCollision(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
): void {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  if (!projectileId) return;
  if (!ctx.projectileBodies.has(projectileId)) return;
  ctx.removeProjectileEntity(projectileId);
}

export function checkSweptProjectileHitShipCollisions(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  previousProjectilePositions: ReadonlyMap<string, Vec2>,
  _previousProjectileVelocities: ReadonlyMap<string, Vec2>,
  deferredProjectileWallHits?: ReadonlySet<string>,
): void {
  if (ctx.projectileBodies.size <= 0 || shipBodies.size <= 0) return;

  const shipBodyList = [...shipBodies.values()];
  const shipBodyEntries = [...shipBodies.entries()];
  const projectileEntries = [...ctx.projectileBodies.entries()];

  for (const [projectileId, projectileBody] of projectileEntries) {
    if (!ctx.projectileBodies.has(projectileId)) continue;
    const previous = previousProjectilePositions.get(projectileId);
    if (!previous) continue;

    const start = previous;
    const end = projectileBody.position;
    const sweepWidth = getBodySweepWidth(projectileBody);
    const sweepSegments: [Vec2, Vec2][] = [[start, end]];
    const projectileOwnerId =
      ctx.getPluginString(projectileBody, "ownerId") ?? "";
    const projectileRadius = getProjectileRadius(projectileBody, sweepWidth);
    const hasDeferredWallHit =
      deferredProjectileWallHits?.has(projectileId) ?? false;

    for (const [segmentStart, segmentEnd] of sweepSegments) {
      if (!ctx.projectileBodies.has(projectileId)) break;
      const orderedShieldHits = queryOrderedShieldHitsAlongSegment(
        ctx,
        shipBodyEntries,
        projectileOwnerId,
        segmentStart,
        segmentEnd,
        projectileRadius,
      );
      const orderedShipBodies = queryOrderedShipBodiesAlongSegment(
        shipBodyList,
        segmentStart,
        segmentEnd,
        sweepWidth,
      );
      const wallHitT = hasDeferredWallHit
        ? computeWallHitT(
            segmentStart,
            segmentEnd,
            projectileRadius,
            ARENA_WIDTH,
            ARENA_HEIGHT,
          )
        : null;
      let wallHandled = wallHitT === null;
      let shieldIndex = 0;
      let shipIndex = 0;
      while (
        ctx.projectileBodies.has(projectileId) &&
        (shieldIndex < orderedShieldHits.length ||
          shipIndex < orderedShipBodies.length ||
          !wallHandled)
      ) {
        const nextShield = orderedShieldHits[shieldIndex];
        const nextShip = orderedShipBodies[shipIndex];
        const nextShieldT = nextShield?.t ?? Infinity;
        const nextShipT = nextShip
          ? projectPointOntoSegmentT(segmentStart, segmentEnd, nextShip.position)
          : Infinity;
        const nextWallT = wallHandled ? Infinity : wallHitT ?? Infinity;

        if (nextWallT <= nextShieldT && nextWallT <= nextShipT) {
          wallHandled = true;
          const projectileIdAtWall = ctx.getPluginString(projectileBody, "entityId");
          if (!projectileIdAtWall || !ctx.projectileBodies.has(projectileIdAtWall)) {
            break;
          }
          ctx.removeProjectileEntity(projectileIdAtWall);
          break;
        }

        if (nextShieldT <= nextShipT) {
          shieldIndex += 1;
          const consumed = applySweptProjectileShieldHit(
            ctx,
            projectileBody,
            nextShield.playerId,
          );
          if (consumed) break;
          continue;
        }

        shipIndex += 1;
        if (!ctx.projectileBodies.has(projectileId)) break;
        handleProjectileHitShipCollision(ctx, projectileBody, nextShip);
      }
    }
  }
}

function applySweptProjectileShieldHit(
  ctx: SimulationCollisionHandlersContext,
  projectileBody: Matter.Body,
  shipPlayerId: string,
): boolean {
  const projectileId = ctx.getPluginString(projectileBody, "entityId");
  if (!projectileId || !ctx.projectileBodies.has(projectileId)) return false;

  const powerUp = ctx.playerPowerUps.get(shipPlayerId);
  if (powerUp?.type !== "SHIELD") return false;

  powerUp.shieldHits += 1;
  ctx.removeProjectileEntity(projectileId);
  ctx.triggerScreenShake(3, 0.1);
  if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
    ctx.playerPowerUps.delete(shipPlayerId);
  }
  return true;
}

function queryOrderedShieldHitsAlongSegment(
  ctx: SimulationCollisionHandlersContext,
  shipBodyEntries: ReadonlyArray<readonly [string, Matter.Body]>,
  projectileOwnerId: string,
  start: Vec2,
  end: Vec2,
  projectileRadius: number,
): Array<{ playerId: string; t: number }> {
  const hits: Array<{ playerId: string; t: number }> = [];

  for (const [shipPlayerId, shipBody] of shipBodyEntries) {
    if (shipPlayerId === projectileOwnerId) continue;
    const shipPlayer = ctx.players.get(shipPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive) continue;
    if (shipPlayer.ship.invulnerableUntil > ctx.nowMs) continue;
    const powerUp = ctx.playerPowerUps.get(shipPlayerId);
    if (powerUp?.type !== "SHIELD") continue;

    if (
      !segmentIntersectsShipShield(
        shipPlayer.ship,
        start.x,
        start.y,
        end.x,
        end.y,
        projectileRadius,
      )
    ) {
      continue;
    }

    hits.push({
      playerId: shipPlayerId,
      t: projectPointOntoSegmentT(start, end, shipBody.position),
    });
  }

  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function queryOrderedShipBodiesAlongSegment(
  shipBodyList: Matter.Body[],
  start: Vec2,
  end: Vec2,
  sweepWidth: number,
): Matter.Body[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy <= 1e-9) return [];

  const collisions = Matter.Query.ray(shipBodyList, start, end, sweepWidth);
  if (collisions.length <= 0) return [];

  const shipBodiesById = new Map<number, Matter.Body>();
  for (const collision of collisions) {
    const hitBody = collision.bodyA.parent ?? collision.bodyA;
    shipBodiesById.set(hitBody.id, hitBody);
  }

  return [...shipBodiesById.values()].sort(
    (bodyA, bodyB) =>
      projectPointOntoSegmentT(start, end, bodyA.position) -
      projectPointOntoSegmentT(start, end, bodyB.position),
  );
}

function tryDamageYellowBlockWithSword(
  ctx: SimulationCollisionHandlersContext,
  blockIndex: number,
): boolean {
  const now = ctx.nowMs;
  const nextAllowed = ctx.yellowBlockSwordHitCooldown.get(blockIndex) ?? 0;
  if (now < nextAllowed) return false;
  ctx.yellowBlockSwordHitCooldown.set(blockIndex, now + 180);
  damageYellowBlock(ctx, blockIndex, 1);
  return true;
}

function isPointInCone(
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

function projectPointOntoSegmentT(start: Vec2, end: Vec2, point: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return 0;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
}

function getBodySweepWidth(body: Matter.Body): number {
  const circleRadius =
    typeof body.circleRadius === "number" ? body.circleRadius : undefined;
  if (circleRadius && circleRadius > 0) {
    return circleRadius * 2;
  }

  const width = Math.max(0, body.bounds.max.x - body.bounds.min.x);
  const height = Math.max(0, body.bounds.max.y - body.bounds.min.y);
  const diameter = Math.max(width, height);
  return Math.max(1e-4, diameter);
}

function getProjectileRadius(body: Matter.Body, sweepWidth: number): number {
  const circleRadius =
    typeof body.circleRadius === "number" ? body.circleRadius : undefined;
  if (circleRadius && circleRadius > 0) {
    return circleRadius;
  }
  return Math.max(0, sweepWidth * 0.5);
}

function computeWallHitT(
  start: Vec2,
  end: Vec2,
  projectileRadius: number,
  arenaWidth: number,
  arenaHeight: number,
): number | null {
  const minX = projectileRadius;
  const maxX = arenaWidth - projectileRadius;
  const minY = projectileRadius;
  const maxY = arenaHeight - projectileRadius;

  if (
    start.x < minX ||
    start.x > maxX ||
    start.y < minY ||
    start.y > maxY
  ) {
    return 0;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy <= 1e-9) return null;

  let bestT = Infinity;
  const pushCandidate = (t: number): void => {
    if (t < 0 || t > 1) return;
    if (t < bestT) bestT = t;
  };

  if (dx > 1e-9) {
    const t = (maxX - start.x) / dx;
    const y = start.y + dy * t;
    if (y >= minY && y <= maxY) pushCandidate(t);
  } else if (dx < -1e-9) {
    const t = (minX - start.x) / dx;
    const y = start.y + dy * t;
    if (y >= minY && y <= maxY) pushCandidate(t);
  }

  if (dy > 1e-9) {
    const t = (maxY - start.y) / dy;
    const x = start.x + dx * t;
    if (x >= minX && x <= maxX) pushCandidate(t);
  } else if (dy < -1e-9) {
    const t = (minY - start.y) / dy;
    const x = start.x + dx * t;
    if (x >= minX && x <= maxX) pushCandidate(t);
  }

  return Number.isFinite(bestT) ? bestT : null;
}
