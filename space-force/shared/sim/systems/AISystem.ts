import type { SimState, RuntimePlayer } from "../types.js";
import { AI_CONFIG } from "../constants.js";
import { normalizeAngle } from "../utils.js";

export function updateBots(sim: SimState): void {
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.isBot || player.botType !== "ai") continue;
    // Demo tutorial: skip AI for frozen ships
    if (sim.demoFrozenPlayerIds?.has(playerId)) continue;
    if (sim.nowMs - player.botLastDecisionMs < AI_CONFIG.REACTION_DELAY_MS) {
      player.input.buttonA = player.botCachedAction.buttonA;
      sim.setFireButtonState(player, player.botCachedAction.buttonB);
      if (player.botCachedAction.dash) {
        player.dashQueued = true;
      }
      continue;
    }
    player.botLastDecisionMs = sim.nowMs;

    if (!player.ship.alive) {
      const pilot = sim.pilots.get(playerId);
      if (!pilot || !pilot.alive) continue;
      player.botCachedAction = {
        buttonA: sim.aiRng.next() > 0.45,
        buttonB: sim.aiRng.next() > 0.78,
        dash: false,
      };
      player.input.buttonA = player.botCachedAction.buttonA;
      sim.setFireButtonState(player, player.botCachedAction.buttonB);
      continue;
    }

    const target = findNearestEnemy(sim, playerId);
    if (!target) {
      player.botCachedAction = {
        buttonA: sim.aiRng.next() > 0.5,
        buttonB: sim.aiRng.next() > 0.7,
        dash: false,
      };
      player.input.buttonA = player.botCachedAction.buttonA;
      sim.setFireButtonState(player, player.botCachedAction.buttonB);
      continue;
    }

    const leadX = target.ship.x + target.ship.vx * AI_CONFIG.LEAD_FACTOR;
    const leadY = target.ship.y + target.ship.vy * AI_CONFIG.LEAD_FACTOR;
    let desired = Math.atan2(leadY - player.ship.y, leadX - player.ship.x);
    desired += (sim.aiRng.next() - 0.5) * AI_CONFIG.AIM_ERROR * 2;
    const diff = normalizeAngle(desired - player.ship.angle);
    const aimed = Math.abs(diff) < AI_CONFIG.AIM_TOLERANCE;
    let rotate = !aimed;
    if (sim.aiRng.next() < AI_CONFIG.ROTATION_OVERSHOOT) {
      rotate = !rotate;
    }
    const fire = aimed
      ? sim.aiRng.next() < AI_CONFIG.FIRE_PROBABILITY
      : sim.aiRng.next() < 0.05;
    const dash = aimed && Math.abs(diff) < 0.3 && sim.aiRng.next() > 0.94;

    player.botCachedAction = { buttonA: rotate, buttonB: fire, dash };
    player.input.buttonA = rotate;
    sim.setFireButtonState(player, fire);
    if (dash) {
      player.dashQueued = true;
    }
  }
}

export function findNearestEnemy(sim: SimState, playerId: string): RuntimePlayer | null {
  const me = sim.players.get(playerId);
  if (!me) return null;
  let best: RuntimePlayer | null = null;
  let bestDistSq = Infinity;
  for (const otherId of sim.playerOrder) {
    if (otherId === playerId) continue;
    const other = sim.players.get(otherId);
    if (!other || !other.ship.alive) continue;
    const dx = other.ship.x - me.ship.x;
    const dy = other.ship.y - me.ship.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = other;
    }
  }
  return best;
}
