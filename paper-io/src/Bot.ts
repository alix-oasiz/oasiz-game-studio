import { Direction, DIRECTION_VEC, OPPOSITE_DIR, MAP_HALF, BotBehavior, type Difficulty, BOT_DIFFICULTY, type Vec2, dist } from './constants.ts';
import { type PlayerState, setDirection } from './Player.ts';

interface BotAI {
  behavior: BotBehavior;
  waypoints: Vec2[];
  waypointIndex: number;
  ticksSinceChange: number;
  expandDir: number; // angle for expansion direction
}

const ALL_DIRS: Direction[] = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];

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
      expandDir: Math.random() * Math.PI * 2,
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
        const d = dist(p.position, bot.position);
        if (d < this.config.loopSize * 0.5) {
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

    // Jitter: 10% chance of random direction
    if (Math.random() < 0.10) {
      const safeDirs = this.getSafeDirs(bot);
      if (safeDirs.length > 0) {
        setDirection(bot, safeDirs[Math.floor(Math.random() * safeDirs.length)]);
        return;
      }
    }

    switch (ai.behavior) {
      case BotBehavior.EXPAND:
        this.doExpand(bot, ai);
        break;
      case BotBehavior.RETURN_HOME:
      case BotBehavior.FLEE:
        this.doReturnHome(bot, ai);
        break;
    }
  }

  private doExpand(bot: PlayerState, ai: BotAI): void {
    if (ai.waypoints.length === 0 || ai.waypointIndex >= ai.waypoints.length) {
      ai.waypoints = this.planLoop(bot);
      ai.waypointIndex = 0;
    }

    const target = ai.waypoints[ai.waypointIndex];
    const dir = this.directionToward(bot.position, target);
    if (dir) {
      setDirection(bot, dir);
      if (dist(bot.position, target) < 1.0) {
        ai.waypointIndex++;
      }
    }

    // If trail is getting long, switch to return
    if (bot.trail.length > this.config.maxTrailLen) {
      ai.behavior = BotBehavior.RETURN_HOME;
      ai.waypoints = [];
    }
  }

  private doReturnHome(bot: PlayerState, ai: BotAI): void {
    // Steer toward nearest territory boundary point
    const nearest = bot.territory.getNearestBoundaryPoint(bot.position);
    const dir = this.directionToward(bot.position, nearest);
    if (dir) {
      setDirection(bot, dir);
    }

    // If back inside territory with no trail, expand again
    if (bot.territory.containsPoint(bot.position) && bot.trail.length === 0) {
      ai.behavior = BotBehavior.EXPAND;
      ai.waypoints = [];
      ai.ticksSinceChange = 0;
      ai.expandDir = Math.random() * Math.PI * 2;
    }
  }

  private planLoop(bot: PlayerState): Vec2[] {
    const size = this.config.loopSize * (0.5 + Math.random() * 0.8);
    const angle = Math.random() * Math.PI * 2;
    const cx = bot.position.x;
    const cz = bot.position.z;

    // Create a rectangular loop
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
      { x: cx, z: cz }, // back to start-ish
    ];

    // Clamp to map bounds
    for (const p of points) {
      p.x = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, p.x));
      p.z = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, p.z));
    }

    return points;
  }

  private directionToward(from: Vec2, to: Vec2): Direction | null {
    const dx = to.x - from.x;
    const dz = to.z - from.z;

    if (Math.abs(dx) < 0.3 && Math.abs(dz) < 0.3) return null;

    if (Math.abs(dx) >= Math.abs(dz)) {
      return dx > 0 ? Direction.RIGHT : Direction.LEFT;
    } else {
      return dz > 0 ? Direction.DOWN : Direction.UP;
    }
  }

  private getSafeDirs(bot: PlayerState): Direction[] {
    const safe: Direction[] = [];
    for (const dir of ALL_DIRS) {
      if (OPPOSITE_DIR[dir] === bot.direction) continue;
      const vec = DIRECTION_VEC[dir];
      const nx = bot.position.x + vec.dx * 2;
      const nz = bot.position.z + vec.dz * 2;
      if (nx < -MAP_HALF + 1 || nx > MAP_HALF - 1 || nz < -MAP_HALF + 1 || nz > MAP_HALF - 1) continue;
      safe.push(dir);
    }
    return safe;
  }
}
