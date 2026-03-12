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
import {
  runSweptProjectileHitShipCollisions,
  runSweptShipTunnelingGuards,
} from "./simulationSweptCollisions.js";

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

export type CollisionTelemetryEventKind =
  | "projectile_wall_swept_hit"
  | "projectile_shield_swept_hit"
  | "projectile_ship_swept_hit"
  | "projectile_pilot_swept_hit"
  | "projectile_sweep_no_hit"
  | "ship_ship_tunnel_resolved"
  | "ship_pilot_tunnel_resolved";

export interface CollisionTelemetryEvent {
  kind: CollisionTelemetryEventKind;
  nowMs: number;
  projectileId?: string;
  ownerId?: string;
  shipPlayerId?: string;
  pilotPlayerId?: string;
  targetPlayerId?: string;
  t?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
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
  onSound: (type: string, playerId: string) => void;
  onShipHit: (owner: RuntimePlayer | undefined, target: RuntimePlayer) => void;
  killPilot: (pilotPlayerId: string, killerId: string) => void;
  hitAsteroid: (asteroid: RuntimeAsteroid) => void;
  destroyAsteroid: (asteroid: RuntimeAsteroid) => void;
  grantPowerUp: (playerId: string, type: RuntimePowerUp["type"]) => void;
  removePowerUpBody: (powerUpId: string) => void;
  onCollisionTelemetry?: (event: CollisionTelemetryEvent) => void;
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
  ctx.onSound("powerupPickup", shipPlayerId);
  powerUp.alive = false;
  ctx.removePowerUpBody(powerUpId);
}

export interface SweptPose {
  x: number;
  y: number;
  angle: number;
}

export function damageYellowBlock(
  ctx: SimulationCollisionHandlersContext,
  blockIndex: number,
  amount: number,
): void {
  const block = ctx.yellowBlocks[blockIndex];
  if (!block || block.hp <= 0) return;

  block.hp -= amount;
  ctx.onSound("yellowBlockHit", "yellowBlock");
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
  previousShipPoses?: ReadonlyMap<string, SweptPose>,
  pilotBodies?: ReadonlyMap<string, Matter.Body>,
  previousPilotPoses?: ReadonlyMap<string, SweptPose>,
): void {
  runSweptProjectileHitShipCollisions(
    ctx,
    shipBodies,
    previousProjectilePositions,
    _previousProjectileVelocities,
    deferredProjectileWallHits,
    previousShipPoses,
    pilotBodies,
    previousPilotPoses,
    {
      onProjectileHitShip: handleProjectileHitShipCollision,
      onProjectileHitPilot: handleProjectileHitPilotCollision,
    },
  );
}

export function applySweptShipTunnelingGuards(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  pilotBodies: ReadonlyMap<string, Matter.Body>,
  previousShipPoses?: ReadonlyMap<string, SweptPose>,
  previousPilotPoses?: ReadonlyMap<string, SweptPose>,
): void {
  runSweptShipTunnelingGuards(
    ctx,
    shipBodies,
    pilotBodies,
    previousShipPoses,
    previousPilotPoses,
    {
      onShipHitPilot: handleShipHitPilotCollision,
    },
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
