import type { SimState, PowerUpType } from "../types.js";
import {
  POWERUP_DESPAWN_MS,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
  POWERUP_SPAWN_WEIGHTS,
  SCATTER_CHARGES,
  SCATTER_COOLDOWN_MS,
  STARTING_POWERUP_TYPES,
  ARENA_WIDTH,
  ARENA_HEIGHT,
} from "../constants.js";

export function updatePowerUps(sim: SimState, dtSec: number): void {
  for (const powerUp of sim.powerUps) {
    if (!powerUp.alive) continue;
    if (sim.nowMs - powerUp.spawnTime > POWERUP_DESPAWN_MS) {
      powerUp.alive = false;
      continue;
    }

    let best: { id: string; x: number; y: number; distSq: number } | null = null;
    for (const playerId of sim.playerOrder) {
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      if (sim.playerPowerUps.get(playerId)) continue;
      const dx = player.ship.x - powerUp.x;
      const dy = player.ship.y - powerUp.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > powerUp.magneticRadius * powerUp.magneticRadius) continue;
      if (!best || distSq < best.distSq) {
        best = { id: playerId, x: player.ship.x, y: player.ship.y, distSq };
      }
    }

    if (!best) {
      powerUp.isMagneticActive = false;
      powerUp.targetPlayerId = null;
      continue;
    }

    powerUp.isMagneticActive = true;
    powerUp.targetPlayerId = best.id;
    const angle = Math.atan2(best.y - powerUp.y, best.x - powerUp.x);
    powerUp.x += Math.cos(angle) * powerUp.magneticSpeed * dtSec;
    powerUp.y += Math.sin(angle) * powerUp.magneticSpeed * dtSec;
  }
}

export function grantPowerUp(sim: SimState, playerId: string, type: PowerUpType): void {
  if (type === "LASER") {
    const globals = sim.getGlobalConfig();
    const laserCharges = Math.max(1, Math.round(globals.LASER_CHARGES));
    sim.playerPowerUps.set(playerId, {
      type: "LASER",
      charges: laserCharges,
      maxCharges: laserCharges,
      lastFireTime: sim.nowMs - globals.LASER_COOLDOWN_MS - 1,
      shieldHits: 0,
    });
    return;
  }
  if (type === "SHIELD") {
    sim.playerPowerUps.set(playerId, {
      type: "SHIELD",
      charges: 0,
      maxCharges: 0,
      lastFireTime: sim.nowMs,
      shieldHits: 0,
    });
    return;
  }
  if (type === "SCATTER") {
    sim.playerPowerUps.set(playerId, {
      type: "SCATTER",
      charges: SCATTER_CHARGES,
      maxCharges: SCATTER_CHARGES,
      lastFireTime: sim.nowMs - SCATTER_COOLDOWN_MS - 1,
      shieldHits: 0,
    });
    return;
  }
  if (type === "MINE") {
    sim.playerPowerUps.set(playerId, {
      type: "MINE",
      charges: 1,
      maxCharges: 1,
      lastFireTime: sim.nowMs,
      shieldHits: 0,
    });
    return;
  }
  if (type === "REVERSE") {
    sim.rotationDirection *= -1;
    return;
  }
  if (type === "JOUST") {
    sim.playerPowerUps.set(playerId, {
      type: "JOUST",
      charges: 0,
      maxCharges: 0,
      lastFireTime: sim.nowMs,
      shieldHits: 0,
      leftSwordActive: true,
      rightSwordActive: true,
      leftSwordDurability: 6,
      rightSwordDurability: 6,
    });
    return;
  }
  sim.playerPowerUps.set(playerId, {
    type: "HOMING_MISSILE",
    charges: 1,
    maxCharges: 1,
    lastFireTime: sim.nowMs,
    shieldHits: 0,
  });
}

export function spawnRandomPowerUp(sim: SimState): void {
  const entries = Object.entries(POWERUP_SPAWN_WEIGHTS) as Array<[PowerUpType, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const r = sim.powerUpRng.next() * total;
  let cumulative = 0;
  let chosen: PowerUpType = entries[0][0];
  for (const [type, weight] of entries) {
    cumulative += weight;
    if (r <= cumulative) {
      chosen = type;
      break;
    }
  }

  const padding = 100;
  const x = padding + sim.powerUpRng.next() * (ARENA_WIDTH - padding * 2);
  const y = padding + sim.powerUpRng.next() * (ARENA_HEIGHT - padding * 2);
  sim.powerUps.push({
    id: sim.nextEntityId("pow"),
    x,
    y,
    type: chosen,
    spawnTime: sim.nowMs,
    remainingTimeFraction: 1,
    alive: true,
    magneticRadius: POWERUP_MAGNETIC_RADIUS,
    isMagneticActive: false,
    magneticSpeed: POWERUP_MAGNETIC_SPEED,
    targetPlayerId: null,
  });
}

export function grantStartingPowerups(sim: SimState): void {
  if (!sim.settings.startPowerups) return;

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    if (sim.playerPowerUps.get(playerId)) continue;
    const idx = sim.powerUpRng.nextInt(0, STARTING_POWERUP_TYPES.length - 1);
    sim.grantPowerUp(playerId, STARTING_POWERUP_TYPES[idx]);
  }
}
