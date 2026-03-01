import { MAP_HALF, BotBehavior, type Difficulty, BOT_DIFFICULTY, type Vec2, dist } from './constants.ts';
import { type PlayerState, setDirectionToward } from './Player.ts';

interface BotAI {
  behavior: BotBehavior;
  waypoints: Vec2[];
  waypointIndex: number;
  ticksSinceChange: number;
}

export class BotController {
  private ais: Map<number, BotAI> = new Map();
  private config: { maxTrailLen: number; aggression: number; loopSize: number };

  constructor(difficulty: Difficulty) {
    this.config = BOT_DIFFICULTY[difficulty];
  }

  initBot(player: PlayerState): void {
    this.ais.set(player.id, {
      behavior: BotBehavior.EXPAND,
      waypoints: [],
      waypointIndex: 0,
      ticksSinceChange: 0,
    });
  }

  update(bot: PlayerState, allPlayers: PlayerState[]): void {
    if (!bot.alive) return;
    const ai = this.ais.get(bot.id);
    if (!ai) return;

    ai.ticksSinceChange++;

    // Check flee condition
    if (bot.trail.length > 2) {
      for (const p of allPlayers) {
        if (p.id === bot.id || !p.alive) continue;
        if (dist(p.position, bot.position) < this.config.loopSize * 0.5) {
          ai.behavior = BotBehavior.RETURN_HOME;
          ai.waypoints = [];
          break;
        }
      }
    }

    // Trail too long → return home
    if (bot.trail.length > this.config.maxTrailLen * 2 && ai.behavior === BotBehavior.EXPAND) {
      ai.behavior = BotBehavior.RETURN_HOME;
      ai.waypoints = [];
    }

    // Jitter: 10% chance of slight random offset
    const jitter = Math.random() < 0.10 ? (Math.random() - 0.5) * 2 : 0;

    switch (ai.behavior) {
      case BotBehavior.EXPAND:
        this.doExpand(bot, ai, jitter);
        break;
      case BotBehavior.RETURN_HOME:
      case BotBehavior.FLEE:
        this.doReturnHome(bot, ai);
        break;
    }
  }

  private doExpand(bot: PlayerState, ai: BotAI, jitter: number): void {
    if (ai.waypoints.length === 0 || ai.waypointIndex >= ai.waypoints.length) {
      ai.waypoints = this.planLoop(bot);
      ai.waypointIndex = 0;
    }

    const target = ai.waypoints[ai.waypointIndex];
    const offsetTarget = { x: target.x + jitter, z: target.z + jitter };
    setDirectionToward(bot, offsetTarget);

    if (dist(bot.position, target) < 1.0) {
      ai.waypointIndex++;
    }

    if (bot.trail.length > this.config.maxTrailLen) {
      ai.behavior = BotBehavior.RETURN_HOME;
      ai.waypoints = [];
    }
  }

  private doReturnHome(bot: PlayerState, ai: BotAI): void {
    const nearest = bot.territory.getNearestBoundaryPoint(bot.position);
    setDirectionToward(bot, nearest);

    if (bot.territory.containsPoint(bot.position) && bot.trail.length === 0) {
      ai.behavior = BotBehavior.EXPAND;
      ai.waypoints = [];
      ai.ticksSinceChange = 0;
    }
  }

  private planLoop(bot: PlayerState): Vec2[] {
    const size = this.config.loopSize * (0.5 + Math.random() * 0.8);
    const angle = Math.random() * Math.PI * 2;
    const cx = bot.position.x;
    const cz = bot.position.z;

    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const perpX = -dz;
    const perpZ = dx;

    const width = size * (0.5 + Math.random() * 0.5);
    const height = size * (0.5 + Math.random() * 0.5);

    const points: Vec2[] = [
      { x: cx + dx * height, z: cz + dz * height },
      { x: cx + dx * height + perpX * width, z: cz + dz * height + perpZ * width },
      { x: cx + perpX * width, z: cz + perpZ * width },
      { x: cx, z: cz },
    ];

    for (const p of points) {
      p.x = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, p.x));
      p.z = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, p.z));
    }

    return points;
  }
}
