import type { SimState, RuntimeProjectile } from "../types.js";
import { ARENA_WIDTH, ARENA_HEIGHT } from "../constants.js";

export function updateProjectiles(sim: SimState, _dtSec: number): void {
  const outOfBoundsMargin = 60;
  const kept: RuntimeProjectile[] = [];
  for (const proj of sim.projectiles) {
    if (sim.nowMs - proj.spawnTime > proj.lifetimeMs) {
      sim.removeProjectileBody(proj.id);
      continue;
    }
    if (
      proj.x < -outOfBoundsMargin ||
      proj.x > ARENA_WIDTH + outOfBoundsMargin ||
      proj.y < -outOfBoundsMargin ||
      proj.y > ARENA_HEIGHT + outOfBoundsMargin
    ) {
      sim.removeProjectileBody(proj.id);
      continue;
    }
    kept.push(proj);
  }
  sim.projectiles = kept;
}
