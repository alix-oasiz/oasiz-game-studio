import type { SimState, RuntimeAsteroid } from "./types.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_PADDING,
  ASTEROID_LARGE_MIN,
  ASTEROID_LARGE_MAX,
  ASTEROID_SMALL_MIN,
  ASTEROID_SMALL_MAX,
  ASTEROID_SPLIT_COUNT,
  ASTEROID_DRIFT_MIN,
  ASTEROID_DRIFT_MAX,
  ASTEROID_RESTITUTION,
  ASTEROID_DROP_CHANCE,
  ASTEROID_VERTICES_MIN,
  ASTEROID_VERTICES_MAX,
  ASTEROID_SPAWN_INTERVAL_MIN_MS,
  ASTEROID_SPAWN_INTERVAL_MAX_MS,
  ASTEROID_SPAWN_BATCH_MIN,
  ASTEROID_SPAWN_BATCH_MAX,
  GREY_ASTEROID_MIN,
  GREY_ASTEROID_MAX,
  SHIP_HIT_RADIUS,
  POWERUP_SPAWN_WEIGHTS,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
} from "./constants.js";
import type { PowerUpType } from "./types.js";
import { clamp } from "./utils.js";
import { getMapDefinition } from "./maps.js";

export function spawnInitialAsteroids(sim: SimState): void {
  const map = getMapDefinition(sim.mapId);
  if (!map.asteroidConfig.enabled) return;
  if (sim.settings.asteroidDensity === "NONE") return;
  const count = sim.asteroidRng.nextInt(
    map.asteroidConfig.minCount,
    map.asteroidConfig.maxCount,
  );

  const centerX = ARENA_WIDTH * 0.5;
  const centerY = ARENA_HEIGHT * 0.5;
  const spreadX = ARENA_WIDTH * 0.28;
  const spreadY = ARENA_HEIGHT * 0.28;
  const maxAttempts = 20;

  for (let i = 0; i < count; i++) {
    const isGrey = sim.asteroidRng.next() < map.asteroidConfig.greyRatio;
    const tier = i === 0 ? "LARGE" : rollAsteroidTier(sim);
    const size = isGrey
      ? sim.asteroidRng.nextRange(GREY_ASTEROID_MIN, GREY_ASTEROID_MAX)
      : randomAsteroidSize(sim, tier);
    let x = centerX;
    let y = centerY;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateX = centerX + (sim.asteroidRng.next() * 2 - 1) * spreadX;
      const candidateY = centerY + (sim.asteroidRng.next() * 2 - 1) * spreadY;
      if (isAsteroidSpawnClear(sim, candidateX, candidateY, size)) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }

    const angle = sim.asteroidRng.next() * Math.PI * 2;
    const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
    const velocityScale = 0.75;
    sim.asteroids.push(
      createAsteroidState(
        sim,
        x,
        y,
        Math.cos(angle) * speed * velocityScale,
        Math.sin(angle) * speed * velocityScale,
        size,
        isGrey ? "GREY" : "ORANGE",
      ),
    );
  }
}

export function scheduleAsteroidSpawn(sim: SimState): void {
  if (sim.settings.asteroidDensity !== "SPAWN") {
    sim.nextAsteroidSpawnAtMs = null;
    return;
  }
  const round = Math.max(1, sim.currentRound);
  const t = clamp((round - 1) / 4, 0, 1);
  const intervalScale = 3 + ((1 / 1.5) - 3) * t;
  const delay = sim.asteroidRng.nextRange(
    ASTEROID_SPAWN_INTERVAL_MIN_MS,
    ASTEROID_SPAWN_INTERVAL_MAX_MS,
  );
  sim.nextAsteroidSpawnAtMs = sim.nowMs + delay * intervalScale;
}

export function updateAsteroidSpawning(sim: SimState): void {
  const map = getMapDefinition(sim.mapId);
  if (!map.asteroidConfig.enabled) return;
  if (sim.settings.asteroidDensity !== "SPAWN") return;
  if (sim.nextAsteroidSpawnAtMs === null) {
    scheduleAsteroidSpawn(sim);
    return;
  }
  if (sim.nowMs < sim.nextAsteroidSpawnAtMs) return;

  const batch = sim.asteroidRng.nextInt(ASTEROID_SPAWN_BATCH_MIN, ASTEROID_SPAWN_BATCH_MAX);
  for (let i = 0; i < batch; i++) {
    spawnSingleAsteroidFromBorder(sim);
  }
  scheduleAsteroidSpawn(sim);
}

export function updateAsteroids(sim: SimState, dtSec: number): void {
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    asteroid.angle += asteroid.angularVelocity * dtSec;
  }
}

export function wrapAsteroids(sim: SimState): void {
  const margin = 50;
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    let wrapped = false;
    if (asteroid.x < -margin) {
      asteroid.x = ARENA_WIDTH + margin;
      wrapped = true;
    } else if (asteroid.x > ARENA_WIDTH + margin) {
      asteroid.x = -margin;
      wrapped = true;
    }
    if (asteroid.y < -margin) {
      asteroid.y = ARENA_HEIGHT + margin;
      wrapped = true;
    } else if (asteroid.y > ARENA_HEIGHT + margin) {
      asteroid.y = -margin;
      wrapped = true;
    }
    if (wrapped) {
      sim.setAsteroidPosition(asteroid.id, asteroid.x, asteroid.y);
    }
  }
}

export function hitAsteroid(sim: SimState, asteroid: RuntimeAsteroid): boolean {
  if (!asteroid.alive) return false;
  asteroid.hp -= 1;
  if (asteroid.hp > 0) {
    sim.triggerScreenShake(3, 0.1);
    return false;
  }
  destroyAsteroid(sim, asteroid);
  return true;
}

export function destroyAsteroid(sim: SimState, asteroid: RuntimeAsteroid): void {
  if (!asteroid.alive) return;
  asteroid.alive = false;
  sim.triggerScreenShake(8, 0.2);

  if (asteroid.variant === "ORANGE" && asteroid.size >= ASTEROID_LARGE_MIN) {
    splitAsteroid(sim, asteroid);
  }

  if (
    asteroid.variant === "ORANGE" &&
    asteroid.size < ASTEROID_LARGE_MIN &&
    sim.powerUpRng.next() <= ASTEROID_DROP_CHANCE
  ) {
    const entries = Object.entries(POWERUP_SPAWN_WEIGHTS) as Array<[PowerUpType, number]>;
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const r = sim.powerUpRng.next() * total;
    let cumulative = 0;
    let type: PowerUpType = entries[0][0];
    for (const [entryType, weight] of entries) {
      cumulative += weight;
      if (r <= cumulative) {
        type = entryType;
        break;
      }
    }
    sim.powerUps.push({
      id: sim.nextEntityId("pow"),
      x: asteroid.x,
      y: asteroid.y,
      type,
      spawnTime: sim.nowMs,
      remainingTimeFraction: 1,
      alive: true,
      magneticRadius: POWERUP_MAGNETIC_RADIUS,
      isMagneticActive: false,
      magneticSpeed: POWERUP_MAGNETIC_SPEED,
      targetPlayerId: null,
    });
  }
}

function splitAsteroid(sim: SimState, asteroid: RuntimeAsteroid): void {
  const baseVx = asteroid.vx * 0.4;
  const baseVy = asteroid.vy * 0.4;
  for (let i = 0; i < ASTEROID_SPLIT_COUNT; i++) {
    const angle =
      (Math.PI * 2 * i) / ASTEROID_SPLIT_COUNT + (sim.asteroidRng.next() - 0.5) * 0.6;
    const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
    const offset = 10 + sim.asteroidRng.next() * 6;
    const size = randomAsteroidSize(sim, "SMALL");
    sim.asteroids.push(
      createAsteroidState(
        sim,
        asteroid.x + Math.cos(angle) * offset,
        asteroid.y + Math.sin(angle) * offset,
        baseVx + Math.cos(angle) * speed,
        baseVy + Math.sin(angle) * speed,
        size,
        "ORANGE",
      ),
    );
  }
}

function spawnSingleAsteroidFromBorder(sim: SimState): void {
  const map = getMapDefinition(sim.mapId);
  const inset = ARENA_PADDING + 6;
  const side = Math.floor(sim.asteroidRng.next() * 4);

  let x = inset;
  let y = inset;
  if (side === 0) {
    x = inset + sim.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
    y = inset;
  } else if (side === 1) {
    x = ARENA_WIDTH - inset;
    y = inset + sim.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
  } else if (side === 2) {
    x = inset + sim.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
    y = ARENA_HEIGHT - inset;
  } else {
    x = inset;
    y = inset + sim.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
  }

  const targetX = ARENA_WIDTH * (0.3 + sim.asteroidRng.next() * 0.4);
  const targetY = ARENA_HEIGHT * (0.3 + sim.asteroidRng.next() * 0.4);
  const baseAngle = Math.atan2(targetY - y, targetX - x);
  const finalAngle = baseAngle + (sim.asteroidRng.next() - 0.5) * (Math.PI / 3);
  const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
  const tier = rollAsteroidTier(sim);
  const isGrey = sim.asteroidRng.next() < map.asteroidConfig.greyRatio;
  const size = isGrey
    ? sim.asteroidRng.nextRange(GREY_ASTEROID_MIN, GREY_ASTEROID_MAX)
    : randomAsteroidSize(sim, tier);

  sim.asteroids.push(
    createAsteroidState(
      sim,
      x,
      y,
      Math.cos(finalAngle) * speed,
      Math.sin(finalAngle) * speed,
      size,
      isGrey ? "GREY" : "ORANGE",
    ),
  );
}

export function generateAsteroidVertices(sim: SimState, size: number): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = [];
  const count =
    ASTEROID_VERTICES_MIN +
    Math.floor(
      sim.asteroidRng.next() * (ASTEROID_VERTICES_MAX - ASTEROID_VERTICES_MIN + 1),
    );

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radiusVariation = 0.7 + sim.asteroidRng.next() * 0.6;
    vertices.push({
      x: Math.cos(angle) * size * radiusVariation,
      y: Math.sin(angle) * size * radiusVariation,
    });
  }

  const hull = computeConvexHull(vertices);
  return hull.length >= 3 ? hull : vertices;
}

function computeConvexHull(
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (points.length <= 3) return points.slice();

  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function isAsteroidSpawnClear(sim: SimState, x: number, y: number, size: number): boolean {
  if (
    x - size < ARENA_PADDING ||
    x + size > ARENA_WIDTH - ARENA_PADDING ||
    y - size < ARENA_PADDING ||
    y + size > ARENA_HEIGHT - ARENA_PADDING
  ) {
    return false;
  }

  const minDistance = size * 1.8;
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    const dx = asteroid.x - x;
    const dy = asteroid.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < minDistance + asteroid.size) {
      return false;
    }
  }

  const shipClearance = size + SHIP_HIT_RADIUS + 10;
  const shipClearanceSq = shipClearance * shipClearance;
  for (const player of sim.players.values()) {
    if (!player.ship.alive) continue;
    const dx = player.ship.x - x;
    const dy = player.ship.y - y;
    if (dx * dx + dy * dy < shipClearanceSq) {
      return false;
    }
  }

  const map = getMapDefinition(sim.mapId);
  for (const block of map.yellowBlocks) {
    const nearestX = clamp(x, block.x, block.x + block.width);
    const nearestY = clamp(y, block.y, block.y + block.height);
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx * dx + dy * dy < size * size) {
      return false;
    }
  }

  for (const hole of map.centerHoles) {
    const dx = hole.x - x;
    const dy = hole.y - y;
    const clearance = hole.radius + size;
    if (dx * dx + dy * dy < clearance * clearance) {
      return false;
    }
  }

  return true;
}

function rollAsteroidTier(sim: SimState): "LARGE" | "SMALL" {
  return sim.asteroidRng.next() < 0.6 ? "LARGE" : "SMALL";
}

function randomAsteroidSize(sim: SimState, tier: "LARGE" | "SMALL"): number {
  if (tier === "LARGE") {
    return sim.asteroidRng.nextRange(ASTEROID_LARGE_MIN, ASTEROID_LARGE_MAX);
  }
  return sim.asteroidRng.nextRange(ASTEROID_SMALL_MIN, ASTEROID_SMALL_MAX);
}

function randomAsteroidAngularVelocity(sim: SimState): number {
  return (sim.asteroidRng.next() - 0.5) * 0.02;
}

type AsteroidVariant = "ORANGE" | "GREY";

function createAsteroidState(
  sim: SimState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: number,
  variant: AsteroidVariant,
): RuntimeAsteroid {
  const hp =
    variant === "GREY"
      ? 2 + Math.floor(sim.asteroidRng.next() * 2)
      : 1;

  const clampedSize =
    variant === "GREY"
      ? clamp(size, GREY_ASTEROID_MIN, GREY_ASTEROID_MAX)
      : size;

  return {
    id: sim.nextEntityId("ast"),
    x,
    y,
    vx,
    vy,
    angle: 0,
    angularVelocity: randomAsteroidAngularVelocity(sim),
    size: clampedSize,
    alive: true,
    vertices: generateAsteroidVertices(sim, clampedSize),
    variant,
    hp,
    maxHp: hp,
  };
}
