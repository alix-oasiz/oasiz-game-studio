import Matter from "matter-js";
import { clamp } from "../utils.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
} from "../constants.js";
import {
  REPULSION_TUNING,
  VORTEX_TUNING,
  sampleMapField,
} from "../mapFeatureTuning.js";
import type { CenterHole, MapDefinition, RepulsionZone, YellowBlock } from "../maps.js";
import type { Physics } from "../physics/Physics.js";
import type {
  RuntimeAsteroid,
  RuntimeHomingMissile,
  RuntimeMine,
  RuntimePilot,
  RuntimePlayer,
  RuntimePowerUp,
  RuntimeProjectile,
  RuntimeTurretBullet,
} from "../types.js";
import type { SeededRNG } from "../SeededRNG.js";

const { Body } = Matter;

export interface RuntimeYellowBlockState {
  block: YellowBlock;
  body: Matter.Body | null;
  hp: number;
  maxHp: number;
}

export interface SimulationMapFeaturesContext {
  physics: Physics;
  nowMs: number;
  nextEntityId: (prefix: string) => string;
  powerUpRng: SeededRNG;
  rotationDirection: number;
  getCurrentMap: () => MapDefinition;
  getMapPowerUpsSpawned: () => boolean;
  setMapPowerUpsSpawned: (spawned: boolean) => void;
  yellowBlocks: RuntimeYellowBlockState[];
  yellowBlockBodyIndex: Map<number, number>;
  yellowBlockSwordHitCooldown: Map<number, number>;
  centerHoleBodies: Matter.Body[];
  powerUps: RuntimePowerUp[];
  players: Map<string, RuntimePlayer>;
  pilots: Map<string, RuntimePilot>;
  asteroids: RuntimeAsteroid[];
  projectiles: RuntimeProjectile[];
  turretBullets: RuntimeTurretBullet[];
  homingMissiles: RuntimeHomingMissile[];
  mines: RuntimeMine[];
  shipBodies: Map<string, Matter.Body>;
  pilotBodies: Map<string, Matter.Body>;
  asteroidBodies: Map<string, Matter.Body>;
  projectileBodies: Map<string, Matter.Body>;
  turretBulletBodies: Map<string, Matter.Body>;
}

export function spawnMapFeatures(ctx: SimulationMapFeaturesContext): void {
  clearMapFeatures(ctx);
  const map = ctx.getCurrentMap();

  if (map.yellowBlocks.length > 0) {
    for (const [index, block] of map.yellowBlocks.entries()) {
      const body = ctx.physics.createYellowBlock(
        block.x + block.width * 0.5,
        block.y + block.height * 0.5,
        block.width,
        block.height,
        index,
      );
      ctx.yellowBlocks.push({
        block,
        body,
        hp: 1,
        maxHp: 1,
      });
      ctx.yellowBlockBodyIndex.set(body.id, index);
    }
  }

  if (map.centerHoles.length > 0) {
    for (const hole of map.centerHoles) {
      const body = ctx.physics.createCenterHoleObstacle(
        hole.x,
        hole.y,
        hole.radius,
      );
      ctx.centerHoleBodies.push(body);
    }
  }

  const mapPowerUpConfig = map.powerUpConfig;
  if (!mapPowerUpConfig?.enabled) return;
  if (ctx.getMapPowerUpsSpawned() && !mapPowerUpConfig.respawnPerRound) return;

  const x = mapPowerUpConfig.x * ARENA_WIDTH;
  const y = mapPowerUpConfig.y * ARENA_HEIGHT;
  const existing = ctx.powerUps.find((powerUp) => {
    if (!powerUp.alive) return false;
    const dx = Math.abs(powerUp.x - x);
    const dy = Math.abs(powerUp.y - y);
    return dx < 5 && dy < 5;
  });
  if (existing) return;

  const typeIndex = ctx.powerUpRng.nextInt(0, mapPowerUpConfig.types.length - 1);
  const type = mapPowerUpConfig.types[typeIndex];
  ctx.powerUps.push({
    id: ctx.nextEntityId("pow"),
    x,
    y,
    type,
    spawnTime: ctx.nowMs,
    remainingTimeFraction: 1,
    alive: true,
    magneticRadius: POWERUP_MAGNETIC_RADIUS,
    magneticSpeed: POWERUP_MAGNETIC_SPEED,
    isMagneticActive: false,
    targetPlayerId: null,
  });
  ctx.setMapPowerUpsSpawned(true);
}

export function applyMapFeatureForcesToBodies(
  ctx: SimulationMapFeaturesContext,
): void {
  const map = ctx.getCurrentMap();

  if (map.centerHoles.length > 0) {
    for (const hole of map.centerHoles) {
      applyCenterHoleForcesToBodies(ctx, hole);
    }
  }

  if (map.repulsionZones.length === 0) return;
  for (const zone of map.repulsionZones) {
    applyRepulsionForcesToBodies(ctx, zone);
  }
}

export function applyMapFeatureKinematics(
  ctx: SimulationMapFeaturesContext,
  dtSec: number,
): void {
  const map = ctx.getCurrentMap();

  if (map.centerHoles.length > 0) {
    for (const hole of map.centerHoles) {
      applyCenterHoleKinematics(ctx, hole, dtSec);
    }
  }

  if (map.repulsionZones.length === 0) return;

  for (const zone of map.repulsionZones) {
    applyRepulsionKinematics(ctx, zone, dtSec);
  }
}

export function updateMapFeatures(
  ctx: SimulationMapFeaturesContext,
  dtSec: number,
): void {
  applyMapFeatureForcesToBodies(ctx);
  applyMapFeatureKinematics(ctx, dtSec);
}

function applyCenterHoleForcesToBodies(
  ctx: SimulationMapFeaturesContext,
  hole: CenterHole,
): void {
  const influenceRadius =
    hole.radius * VORTEX_TUNING.profile.influenceRadiusMultiplier;

  const applyRotationalForce = (
    body: Matter.Body | undefined,
    divergenceFactor = 1,
    distanceDamping = 0,
  ): void => {
    if (!body) return;
    const dx = body.position.x - hole.x;
    const dy = body.position.y - hole.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      VORTEX_TUNING.profile,
    );
    if (!sample) return;

    const tx = (-dy / dist) * ctx.rotationDirection;
    const ty = (dx / dist) * ctx.rotationDirection;
    let forceMagnitude = VORTEX_TUNING.baseForce * sample.falloff;

    if (divergenceFactor < 1) {
      const dampingWithFloor =
        distanceDamping > 0
          ? influenceRadius /
            Math.max(
              dist * distanceDamping,
              VORTEX_TUNING.profile.distanceFloor,
            )
          : 1;
      forceMagnitude *= divergenceFactor * dampingWithFloor;
    }

    Body.applyForce(body, body.position, {
      x: tx * forceMagnitude,
      y: ty * forceMagnitude,
    });
  };

  for (const player of ctx.players.values()) {
    if (!player.ship.alive) continue;
    applyRotationalForce(ctx.shipBodies.get(player.id));
  }

  for (const [playerId, pilot] of ctx.pilots) {
    if (!pilot.alive) continue;
    applyRotationalForce(ctx.pilotBodies.get(playerId));
  }

  for (const asteroid of ctx.asteroids) {
    if (!asteroid.alive) continue;
    applyRotationalForce(ctx.asteroidBodies.get(asteroid.id));
  }

  for (const projectile of ctx.projectiles) {
    applyRotationalForce(
      ctx.projectileBodies.get(projectile.id),
      VORTEX_TUNING.projectileDivergenceFactor,
      VORTEX_TUNING.projectileDistanceDamping,
    );
  }

  for (const bullet of ctx.turretBullets) {
    if (!bullet.alive) continue;
    applyRotationalForce(
      ctx.turretBulletBodies.get(bullet.id),
      VORTEX_TUNING.turretBulletDivergenceFactor,
      VORTEX_TUNING.projectileDistanceDamping,
    );
  }
}

function applyRepulsionForcesToBodies(
  ctx: SimulationMapFeaturesContext,
  zone: RepulsionZone,
): void {
  const influenceRadius =
    zone.radius * REPULSION_TUNING.profile.influenceRadiusMultiplier;

  const applyForceToBody = (body: Matter.Body | undefined): void => {
    if (!body) return;
    const dx = body.position.x - zone.x;
    const dy = body.position.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      REPULSION_TUNING.profile,
    );
    if (!sample) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const strengthScale =
      REPULSION_TUNING.bodyStrengthBaseScale +
      sample.falloff * REPULSION_TUNING.bodyStrengthFalloffScale;
    const forceMagnitude =
      (zone.strength * strengthScale) /
      Math.max(
        Math.pow(dist, REPULSION_TUNING.bodyDistanceExponent),
        REPULSION_TUNING.profile.distanceFloor,
      );

    Body.applyForce(body, body.position, {
      x: nx * forceMagnitude,
      y: ny * forceMagnitude,
    });
  };

  for (const player of ctx.players.values()) {
    if (!player.ship.alive) continue;
    applyForceToBody(ctx.shipBodies.get(player.id));
  }

  for (const [playerId, pilot] of ctx.pilots) {
    if (!pilot.alive) continue;
    applyForceToBody(ctx.pilotBodies.get(playerId));
  }

  for (const asteroid of ctx.asteroids) {
    if (!asteroid.alive) continue;
    applyForceToBody(ctx.asteroidBodies.get(asteroid.id));
  }

  for (const projectile of ctx.projectiles) {
    applyForceToBody(ctx.projectileBodies.get(projectile.id));
  }

  for (const bullet of ctx.turretBullets) {
    if (!bullet.alive) continue;
    applyForceToBody(ctx.turretBulletBodies.get(bullet.id));
  }
}

function applyCenterHoleKinematics(
  ctx: SimulationMapFeaturesContext,
  hole: CenterHole,
  dtSec: number,
): void {
  const influenceRadius =
    hole.radius * VORTEX_TUNING.profile.influenceRadiusMultiplier;

  for (const mine of ctx.mines) {
    if (!mine.alive || mine.exploded) continue;
    const dx = mine.x - hole.x;
    const dy = mine.y - hole.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      VORTEX_TUNING.profile,
    );
    if (!sample) continue;
    const tx = (-dy / dist) * ctx.rotationDirection;
    const ty = (dx / dist) * ctx.rotationDirection;
    const drift =
      VORTEX_TUNING.mineTangentialBase +
      sample.falloff * VORTEX_TUNING.mineTangentialFalloff;
    mine.x += tx * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
    mine.y += ty * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
    mine.x = clamp(mine.x, 0, ARENA_WIDTH);
    mine.y = clamp(mine.y, 0, ARENA_HEIGHT);
  }

  for (const powerUp of ctx.powerUps) {
    if (!powerUp.alive) continue;
    const dx = powerUp.x - hole.x;
    const dy = powerUp.y - hole.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      VORTEX_TUNING.profile,
    );
    if (!sample) continue;
    const tx = (-dy / dist) * ctx.rotationDirection;
    const ty = (dx / dist) * ctx.rotationDirection;
    const drift =
      VORTEX_TUNING.powerUpTangentialBase +
      sample.falloff * VORTEX_TUNING.powerUpTangentialFalloff;
    powerUp.x += tx * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
    powerUp.y += ty * drift * dtSec * VORTEX_TUNING.kinematicStepScale;
    powerUp.x = clamp(powerUp.x, 0, ARENA_WIDTH);
    powerUp.y = clamp(powerUp.y, 0, ARENA_HEIGHT);
  }
}

function applyRepulsionKinematics(
  ctx: SimulationMapFeaturesContext,
  zone: RepulsionZone,
  dtSec: number,
): void {
  const influenceRadius =
    zone.radius * REPULSION_TUNING.profile.influenceRadiusMultiplier;

  for (const mine of ctx.mines) {
    if (!mine.alive || mine.exploded) continue;
    const dx = mine.x - zone.x;
    const dy = mine.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      REPULSION_TUNING.profile,
    );
    if (!sample) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    const drift =
      zone.strength *
      (REPULSION_TUNING.mineDriftBase +
        sample.falloff * REPULSION_TUNING.mineDriftFalloff);
    mine.x += nx * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
    mine.y += ny * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
    mine.x = clamp(mine.x, 0, ARENA_WIDTH);
    mine.y = clamp(mine.y, 0, ARENA_HEIGHT);
  }

  for (const powerUp of ctx.powerUps) {
    if (!powerUp.alive) continue;
    const dx = powerUp.x - zone.x;
    const dy = powerUp.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sample = sampleMapField(
      dist,
      influenceRadius,
      REPULSION_TUNING.profile,
    );
    if (!sample) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    const drift =
      zone.strength *
      (REPULSION_TUNING.powerUpDriftBase +
        sample.falloff * REPULSION_TUNING.powerUpDriftFalloff);
    powerUp.x += nx * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
    powerUp.y += ny * drift * dtSec * REPULSION_TUNING.kinematicStepScale;
    powerUp.x = clamp(powerUp.x, 0, ARENA_WIDTH);
    powerUp.y = clamp(powerUp.y, 0, ARENA_HEIGHT);
  }
}

export function clearMapFeatures(ctx: SimulationMapFeaturesContext): void {
  for (const yellowBlock of ctx.yellowBlocks) {
    if (yellowBlock.body) {
      ctx.physics.removeBody(yellowBlock.body);
    }
  }
  ctx.yellowBlocks.length = 0;
  ctx.yellowBlockBodyIndex.clear();
  ctx.yellowBlockSwordHitCooldown.clear();

  for (const centerHoleBody of ctx.centerHoleBodies) {
    ctx.physics.removeBody(centerHoleBody);
  }
  ctx.centerHoleBodies.length = 0;
}
