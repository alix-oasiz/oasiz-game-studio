import Matter from "matter-js";
import {
  PILOT_COLLIDER_VERTICES,
  SHIP_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../../geometry/EntityShapes.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  POWERUP_SHIELD_HITS,
} from "../constants.js";
import {
  type Vec2,
  segmentIntersectsPolygonWithRadius,
  segmentsIntersect,
} from "../physics/geometryMath.js";
import { segmentIntersectsShipShield } from "../physics/shieldGeometry.js";
import {
  shipBodyPositionFromCenter,
  shipCenterFromBodyPosition,
} from "../physics/shipTransform.js";
import type {
  SimulationCollisionHandlersContext,
  SweptPose,
} from "./simulationCollisionHandlers.js";

interface SweptProjectileCollisionDeps {
  onProjectileHitShip: (
    ctx: SimulationCollisionHandlersContext,
    projectileBody: Matter.Body,
    shipBody: Matter.Body,
  ) => void;
  onProjectileHitPilot: (
    ctx: SimulationCollisionHandlersContext,
    projectileBody: Matter.Body,
    pilotBody: Matter.Body,
  ) => void;
}

interface SweptShipTunnelGuardDeps {
  onShipHitPilot: (
    ctx: SimulationCollisionHandlersContext,
    shipBody: Matter.Body,
    pilotBody: Matter.Body,
  ) => void;
}

interface OrderedBodyHit {
  body: Matter.Body;
  t: number;
}

const SHIP_SWEEP_RADIUS = Math.max(
  1,
  ...SHIP_COLLIDER_VERTICES.map((vertex) => Math.hypot(vertex.x, vertex.y)),
);
const PILOT_SWEEP_RADIUS = Math.max(
  1,
  ...PILOT_COLLIDER_VERTICES.map((vertex) => Math.hypot(vertex.x, vertex.y)),
);

export function runSweptProjectileHitShipCollisions(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  previousProjectilePositions: ReadonlyMap<string, Vec2>,
  _previousProjectileVelocities: ReadonlyMap<string, Vec2>,
  deferredProjectileWallHits: ReadonlySet<string> | undefined,
  previousShipPoses: ReadonlyMap<string, SweptPose> | undefined,
  pilotBodies: ReadonlyMap<string, Matter.Body> | undefined,
  previousPilotPoses: ReadonlyMap<string, SweptPose> | undefined,
  deps: SweptProjectileCollisionDeps,
): void {
  if (ctx.projectileBodies.size <= 0) return;
  if (shipBodies.size <= 0 && (pilotBodies?.size ?? 0) <= 0) return;
  const onTelemetry = ctx.onCollisionTelemetry;

  const shipBodyEntries = [...shipBodies.entries()];
  const pilotBodyEntries = [...(pilotBodies?.entries() ?? [])];
  const projectileEntries = [...ctx.projectileBodies.entries()];

  for (const [projectileId, projectileBody] of projectileEntries) {
    if (!ctx.projectileBodies.has(projectileId)) continue;
    const previous = previousProjectilePositions.get(projectileId);
    if (!previous) continue;

    const start = previous;
    const end = projectileBody.position;
    const sweepWidth = getBodySweepWidth(projectileBody);
    const sweepSegments: [Vec2, Vec2][] = [[start, end]];
    const projectileOwnerId = ctx.getPluginString(projectileBody, "ownerId") ?? "";
    const projectileRadius = getProjectileRadius(projectileBody, sweepWidth);
    const hasDeferredWallHit = deferredProjectileWallHits?.has(projectileId) ?? false;

    for (const [segmentStart, segmentEnd] of sweepSegments) {
      if (!ctx.projectileBodies.has(projectileId)) break;
      const orderedShieldHits = queryOrderedShieldHitsAlongSegment(
        ctx,
        shipBodyEntries,
        projectileOwnerId,
        segmentStart,
        segmentEnd,
        projectileRadius,
        previousShipPoses,
      );
      const orderedShipHits = queryOrderedShipHitsAlongSegment(
        shipBodyEntries,
        segmentStart,
        segmentEnd,
        projectileRadius,
        previousShipPoses,
      );
      const orderedPilotHits = queryOrderedPilotHitsAlongSegment(
        pilotBodyEntries,
        segmentStart,
        segmentEnd,
        projectileRadius,
        previousPilotPoses,
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
      let processedCollision = false;
      let wallHandled = wallHitT === null;
      let shieldIndex = 0;
      let shipIndex = 0;
      let pilotIndex = 0;
      while (
        ctx.projectileBodies.has(projectileId) &&
        (shieldIndex < orderedShieldHits.length ||
          shipIndex < orderedShipHits.length ||
          pilotIndex < orderedPilotHits.length ||
          !wallHandled)
      ) {
        const nextShield = orderedShieldHits[shieldIndex];
        const nextShip = orderedShipHits[shipIndex];
        const nextPilot = orderedPilotHits[pilotIndex];
        const nextShieldT = nextShield?.t ?? Infinity;
        const nextShipT = nextShip?.t ?? Infinity;
        const nextPilotT = nextPilot?.t ?? Infinity;
        const nextWallT = wallHandled ? Infinity : wallHitT ?? Infinity;

        if (
          nextWallT <= nextShieldT &&
          nextWallT <= nextShipT &&
          nextWallT <= nextPilotT
        ) {
          wallHandled = true;
          processedCollision = true;
          const projectileIdAtWall = ctx.getPluginString(projectileBody, "entityId");
          if (!projectileIdAtWall || !ctx.projectileBodies.has(projectileIdAtWall)) {
            break;
          }
          if (onTelemetry) {
            onTelemetry({
              kind: "projectile_wall_swept_hit",
              nowMs: ctx.nowMs,
              projectileId: projectileIdAtWall,
              ownerId: projectileOwnerId,
              t: nextWallT,
              startX: segmentStart.x,
              startY: segmentStart.y,
              endX: segmentEnd.x,
              endY: segmentEnd.y,
            });
          }
          ctx.removeProjectileEntity(projectileIdAtWall);
          break;
        }

        if (nextShieldT <= nextShipT && nextShieldT <= nextPilotT) {
          shieldIndex += 1;
          processedCollision = true;
          const consumed = applySweptProjectileShieldHit(
            ctx,
            projectileBody,
            nextShield.playerId,
          );
          if (consumed && onTelemetry) {
            onTelemetry({
              kind: "projectile_shield_swept_hit",
              nowMs: ctx.nowMs,
              projectileId,
              ownerId: projectileOwnerId,
              targetPlayerId: nextShield.playerId,
              t: nextShieldT,
              startX: segmentStart.x,
              startY: segmentStart.y,
              endX: segmentEnd.x,
              endY: segmentEnd.y,
            });
          }
          if (consumed) break;
          continue;
        }

        if (nextPilotT <= nextShipT) {
          pilotIndex += 1;
          if (!ctx.projectileBodies.has(projectileId)) break;
          const pilotPlayerId = ctx.getPluginString(nextPilot.body, "playerId");
          if (onTelemetry) {
            onTelemetry({
              kind: "projectile_pilot_swept_hit",
              nowMs: ctx.nowMs,
              projectileId,
              ownerId: projectileOwnerId,
              pilotPlayerId: pilotPlayerId ?? undefined,
              t: nextPilotT,
              startX: segmentStart.x,
              startY: segmentStart.y,
              endX: segmentEnd.x,
              endY: segmentEnd.y,
            });
          }
          processedCollision = true;
          deps.onProjectileHitPilot(ctx, projectileBody, nextPilot.body);
          continue;
        }

        shipIndex += 1;
        if (!ctx.projectileBodies.has(projectileId)) break;
        const shipPlayerId = ctx.getPluginString(nextShip.body, "playerId");
        if (onTelemetry) {
          onTelemetry({
            kind: "projectile_ship_swept_hit",
            nowMs: ctx.nowMs,
            projectileId,
            ownerId: projectileOwnerId,
            shipPlayerId: shipPlayerId ?? undefined,
            t: nextShipT,
            startX: segmentStart.x,
            startY: segmentStart.y,
            endX: segmentEnd.x,
            endY: segmentEnd.y,
          });
        }
        processedCollision = true;
        deps.onProjectileHitShip(ctx, projectileBody, nextShip.body);
      }

      if (ctx.projectileBodies.has(projectileId) && !processedCollision && onTelemetry) {
        onTelemetry({
          kind: "projectile_sweep_no_hit",
          nowMs: ctx.nowMs,
          projectileId,
          ownerId: projectileOwnerId,
          startX: segmentStart.x,
          startY: segmentStart.y,
          endX: segmentEnd.x,
          endY: segmentEnd.y,
        });
      }
    }
  }
}

export function runSweptShipTunnelingGuards(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  pilotBodies: ReadonlyMap<string, Matter.Body>,
  previousShipPoses: ReadonlyMap<string, SweptPose> | undefined,
  previousPilotPoses: ReadonlyMap<string, SweptPose> | undefined,
  deps: SweptShipTunnelGuardDeps,
): void {
  resolveSweptShipShipTunneling(ctx, shipBodies, previousShipPoses);
  resolveSweptShipPilotTunneling(
    ctx,
    shipBodies,
    pilotBodies,
    previousShipPoses,
    previousPilotPoses,
    deps,
  );
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
  previousShipPoses?: ReadonlyMap<string, SweptPose>,
): Array<{ playerId: string; t: number }> {
  const hits: Array<{ playerId: string; t: number }> = [];

  for (const [shipPlayerId, shipBody] of shipBodyEntries) {
    if (shipPlayerId === projectileOwnerId) continue;
    const shipPlayer = ctx.players.get(shipPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive) continue;
    if (shipPlayer.ship.invulnerableUntil > ctx.nowMs) continue;
    const powerUp = ctx.playerPowerUps.get(shipPlayerId);
    if (powerUp?.type !== "SHIELD") continue;
    const currentPose = getCurrentShipPoseFromBody(shipBody);
    const previousPose = previousShipPoses?.get(shipPlayerId) ?? currentPose;
    const intersectsShield =
      segmentIntersectsShipShield(
        currentPose,
        start.x,
        start.y,
        end.x,
        end.y,
        projectileRadius,
      ) ||
      segmentIntersectsShipShield(
        previousPose,
        start.x,
        start.y,
        end.x,
        end.y,
        projectileRadius,
      ) ||
      segmentIntersectsMovementCapsule(
        start,
        end,
        previousPose,
        currentPose,
        SHIP_SWEEP_RADIUS + projectileRadius,
      );

    if (!intersectsShield) continue;

    const movementHit = closestPointsBetweenSegments(
      start,
      end,
      toVec2(previousPose),
      toVec2(currentPose),
    );
    hits.push({
      playerId: shipPlayerId,
      t: movementHit.aT,
    });
  }

  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function queryOrderedShipHitsAlongSegment(
  shipBodyEntries: ReadonlyArray<readonly [string, Matter.Body]>,
  start: Vec2,
  end: Vec2,
  projectileRadius: number,
  previousShipPoses?: ReadonlyMap<string, SweptPose>,
): OrderedBodyHit[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy <= 1e-9) return [];
  const hits: OrderedBodyHit[] = [];

  for (const [playerId, shipBody] of shipBodyEntries) {
    const currentPose = getCurrentShipPoseFromBody(shipBody);
    const previousPose = previousShipPoses?.get(playerId) ?? currentPose;
    const prevVertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      previousPose.x,
      previousPose.y,
      previousPose.angle,
    );
    const currentVertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      currentPose.x,
      currentPose.y,
      currentPose.angle,
    );
    const intersects =
      segmentIntersectsPolygonWithRadius(
        start,
        end,
        projectileRadius,
        prevVertices,
      ) ||
      segmentIntersectsPolygonWithRadius(
        start,
        end,
        projectileRadius,
        currentVertices,
      ) ||
      segmentIntersectsMovementCapsule(
        start,
        end,
        previousPose,
        currentPose,
        SHIP_SWEEP_RADIUS + projectileRadius,
      );
    if (!intersects) continue;
    const closest = closestPointsBetweenSegments(
      start,
      end,
      toVec2(previousPose),
      toVec2(currentPose),
    );
    hits.push({
      body: shipBody,
      t: closest.aT,
    });
  }

  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function queryOrderedPilotHitsAlongSegment(
  pilotBodyEntries: ReadonlyArray<readonly [string, Matter.Body]>,
  start: Vec2,
  end: Vec2,
  projectileRadius: number,
  previousPilotPoses?: ReadonlyMap<string, SweptPose>,
): OrderedBodyHit[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy <= 1e-9) return [];
  const hits: OrderedBodyHit[] = [];

  for (const [playerId, pilotBody] of pilotBodyEntries) {
    const currentPose: SweptPose = {
      x: pilotBody.position.x,
      y: pilotBody.position.y,
      angle: pilotBody.angle,
    };
    const previousPose = previousPilotPoses?.get(playerId) ?? currentPose;
    const prevVertices = transformLocalVertices(
      PILOT_COLLIDER_VERTICES,
      previousPose.x,
      previousPose.y,
      previousPose.angle,
    );
    const currentVertices = transformLocalVertices(
      PILOT_COLLIDER_VERTICES,
      currentPose.x,
      currentPose.y,
      currentPose.angle,
    );
    const intersects =
      segmentIntersectsPolygonWithRadius(
        start,
        end,
        projectileRadius,
        prevVertices,
      ) ||
      segmentIntersectsPolygonWithRadius(
        start,
        end,
        projectileRadius,
        currentVertices,
      ) ||
      segmentIntersectsMovementCapsule(
        start,
        end,
        previousPose,
        currentPose,
        PILOT_SWEEP_RADIUS + projectileRadius,
      );
    if (!intersects) continue;
    const closest = closestPointsBetweenSegments(
      start,
      end,
      toVec2(previousPose),
      toVec2(currentPose),
    );
    hits.push({
      body: pilotBody,
      t: closest.aT,
    });
  }

  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function resolveSweptShipShipTunneling(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  previousShipPoses?: ReadonlyMap<string, SweptPose>,
): void {
  const onTelemetry = ctx.onCollisionTelemetry;
  if (shipBodies.size < 2) return;
  const shipEntries = [...shipBodies.entries()];
  const tunnelDistanceSq = (SHIP_SWEEP_RADIUS * 2) ** 2;

  for (let i = 0; i < shipEntries.length; i += 1) {
    const [playerIdA, bodyA] = shipEntries[i];
    const currentPoseA = getCurrentShipPoseFromBody(bodyA);
    const previousPoseA = previousShipPoses?.get(playerIdA) ?? currentPoseA;

    for (let j = i + 1; j < shipEntries.length; j += 1) {
      const [playerIdB, bodyB] = shipEntries[j];
      const currentPoseB = getCurrentShipPoseFromBody(bodyB);
      const previousPoseB = previousShipPoses?.get(playerIdB) ?? currentPoseB;

      if (areBodiesCurrentlyColliding(bodyA, bodyB)) continue;

      const closest = closestPointsBetweenSegments(
        toVec2(previousPoseA),
        toVec2(currentPoseA),
        toVec2(previousPoseB),
        toVec2(currentPoseB),
      );
      if (closest.distanceSq > tunnelDistanceSq) continue;

      if (onTelemetry) {
        onTelemetry({
          kind: "ship_ship_tunnel_resolved",
          nowMs: ctx.nowMs,
          shipPlayerId: playerIdA,
          targetPlayerId: playerIdB,
          startX: closest.pointA.x,
          startY: closest.pointA.y,
          endX: closest.pointB.x,
          endY: closest.pointB.y,
        });
      }
      resolveShipShipTunnel(bodyA, bodyB, closest.pointA, closest.pointB);
    }
  }
}

function resolveSweptShipPilotTunneling(
  ctx: SimulationCollisionHandlersContext,
  shipBodies: ReadonlyMap<string, Matter.Body>,
  pilotBodies: ReadonlyMap<string, Matter.Body>,
  previousShipPoses: ReadonlyMap<string, SweptPose> | undefined,
  previousPilotPoses: ReadonlyMap<string, SweptPose> | undefined,
  deps: SweptShipTunnelGuardDeps,
): void {
  const onTelemetry = ctx.onCollisionTelemetry;
  if (shipBodies.size <= 0 || pilotBodies.size <= 0) return;
  const shipEntries = [...shipBodies.entries()];
  const pilotEntries = [...pilotBodies.entries()];
  const tunnelDistanceSq = (SHIP_SWEEP_RADIUS + PILOT_SWEEP_RADIUS) ** 2;

  for (const [shipPlayerId, shipBody] of shipEntries) {
    const shipPlayer = ctx.players.get(shipPlayerId);
    if (!shipPlayer || !shipPlayer.ship.alive) continue;
    const currentShipPose = getCurrentShipPoseFromBody(shipBody);
    const previousShipPose = previousShipPoses?.get(shipPlayerId) ?? currentShipPose;

    for (const [pilotPlayerId, pilotBody] of pilotEntries) {
      if (pilotPlayerId === shipPlayerId) continue;
      const pilot = ctx.pilots.get(pilotPlayerId);
      if (!pilot || !pilot.alive) continue;

      const currentPilotPose: SweptPose = {
        x: pilotBody.position.x,
        y: pilotBody.position.y,
        angle: pilotBody.angle,
      };
      const previousPilotPose = previousPilotPoses?.get(pilotPlayerId) ?? currentPilotPose;
      if (areBodiesCurrentlyColliding(shipBody, pilotBody)) continue;

      const closest = closestPointsBetweenSegments(
        toVec2(previousShipPose),
        toVec2(currentShipPose),
        toVec2(previousPilotPose),
        toVec2(currentPilotPose),
      );
      if (closest.distanceSq > tunnelDistanceSq) continue;

      if (onTelemetry) {
        onTelemetry({
          kind: "ship_pilot_tunnel_resolved",
          nowMs: ctx.nowMs,
          shipPlayerId,
          pilotPlayerId,
          startX: closest.pointA.x,
          startY: closest.pointA.y,
          endX: closest.pointB.x,
          endY: closest.pointB.y,
        });
      }
      deps.onShipHitPilot(ctx, shipBody, pilotBody);
    }
  }
}

function areBodiesCurrentlyColliding(
  bodyA: Matter.Body,
  bodyB: Matter.Body,
): boolean {
  return Matter.Query.collides(bodyA, [bodyB]).length > 0;
}

function resolveShipShipTunnel(
  bodyA: Matter.Body,
  bodyB: Matter.Body,
  pointA: Vec2,
  pointB: Vec2,
): void {
  let nx = pointB.x - pointA.x;
  let ny = pointB.y - pointA.y;
  let length = Math.hypot(nx, ny);
  if (length <= 1e-6) {
    nx = bodyB.position.x - bodyA.position.x;
    ny = bodyB.position.y - bodyA.position.y;
    length = Math.hypot(nx, ny);
  }
  if (length <= 1e-6) {
    nx = 1;
    ny = 0;
    length = 1;
  }
  nx /= length;
  ny /= length;

  const midpointX = (pointA.x + pointB.x) * 0.5;
  const midpointY = (pointA.y + pointB.y) * 0.5;
  const separation = SHIP_SWEEP_RADIUS + 0.25;
  const targetACenter = {
    x: midpointX - nx * separation,
    y: midpointY - ny * separation,
  };
  const targetBCenter = {
    x: midpointX + nx * separation,
    y: midpointY + ny * separation,
  };

  Matter.Body.setPosition(
    bodyA,
    shipBodyPositionFromCenter(targetACenter.x, targetACenter.y, bodyA.angle),
  );
  Matter.Body.setPosition(
    bodyB,
    shipBodyPositionFromCenter(targetBCenter.x, targetBCenter.y, bodyB.angle),
  );

  const va = { x: bodyA.velocity.x, y: bodyA.velocity.y };
  const vb = { x: bodyB.velocity.x, y: bodyB.velocity.y };
  const relativeNormalVelocity = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
  if (relativeNormalVelocity > 0) return;

  const restitution = Math.max(0.2, bodyA.restitution, bodyB.restitution);
  const impulse = -((1 + restitution) * relativeNormalVelocity) * 0.5;
  Matter.Body.setVelocity(bodyA, {
    x: va.x + nx * impulse,
    y: va.y + ny * impulse,
  });
  Matter.Body.setVelocity(bodyB, {
    x: vb.x - nx * impulse,
    y: vb.y - ny * impulse,
  });
}

function getCurrentShipPoseFromBody(shipBody: Matter.Body): SweptPose {
  const center = shipCenterFromBodyPosition(
    shipBody.position.x,
    shipBody.position.y,
    shipBody.angle,
  );
  return {
    x: center.x,
    y: center.y,
    angle: shipBody.angle,
  };
}

function toVec2(pose: SweptPose): Vec2 {
  return { x: pose.x, y: pose.y };
}

function segmentIntersectsMovementCapsule(
  segmentStart: Vec2,
  segmentEnd: Vec2,
  movingStart: Vec2,
  movingEnd: Vec2,
  radius: number,
): boolean {
  if (
    segmentsIntersect(
      segmentStart.x,
      segmentStart.y,
      segmentEnd.x,
      segmentEnd.y,
      movingStart.x,
      movingStart.y,
      movingEnd.x,
      movingEnd.y,
    )
  ) {
    return true;
  }
  const closest = closestPointsBetweenSegments(
    segmentStart,
    segmentEnd,
    movingStart,
    movingEnd,
  );
  return closest.distanceSq <= radius * radius;
}

function closestPointsBetweenSegments(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): { pointA: Vec2; pointB: Vec2; distanceSq: number; aT: number; bT: number } {
  const d1x = a1.x - a0.x;
  const d1y = a1.y - a0.y;
  const d2x = b1.x - b0.x;
  const d2y = b1.y - b0.y;
  const rx = a0.x - b0.x;
  const ry = a0.y - b0.y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const eps = 1e-9;
  let s = 0;
  let t = 0;

  if (a <= eps && e <= eps) {
    const pointA = { x: a0.x, y: a0.y };
    const pointB = { x: b0.x, y: b0.y };
    const dx = pointA.x - pointB.x;
    const dy = pointA.y - pointB.y;
    return {
      pointA,
      pointB,
      distanceSq: dx * dx + dy * dy,
      aT: 0,
      bT: 0,
    };
  }

  if (a <= eps) {
    s = 0;
    t = Math.max(0, Math.min(1, f / Math.max(eps, e)));
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= eps) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      if (Math.abs(denom) > eps) {
        s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
      } else {
        s = 0;
      }

      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }

  const pointA = { x: a0.x + d1x * s, y: a0.y + d1y * s };
  const pointB = { x: b0.x + d2x * t, y: b0.y + d2y * t };
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return {
    pointA,
    pointB,
    distanceSq: dx * dx + dy * dy,
    aT: s,
    bT: t,
  };
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

  if (start.x < minX || start.x > maxX || start.y < minY || start.y > maxY) {
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
