import { MAP_RADIUS, BotBehavior, type Difficulty, BOT_DIFFICULTY, type Vec2, dist2 } from './constants.ts';
import { type PlayerState } from './Player.ts';

interface BotAI {
  behavior: BotBehavior;
  waypoints: Vec2[];
  waypointIndex: number;
  ticksSinceChange: number;
  stuckTicks: number;
  lastExpansionAngle: number;
}

export class BotController {
  private ais: Map<number, BotAI> = new Map();
  private config: { maxTrailLen: number; aggression: number; loopSize: number; turnRate: number };

  constructor(difficulty: Difficulty) {
    this.config = BOT_DIFFICULTY[difficulty];
  }

  initBot(player: PlayerState): void {
    this.ais.set(player.id, {
      behavior: BotBehavior.EXPAND,
      waypoints: [],
      waypointIndex: 0,
      ticksSinceChange: 0,
      stuckTicks: 0,
      lastExpansionAngle: Math.atan2(player.moveDir.z, player.moveDir.x),
    });
  }

  update(bot: PlayerState, allPlayers: PlayerState[], dt: number): void {
    if (!bot.alive) return;
    const ai = this.ais.get(bot.id);
    if (!ai) return;

    ai.ticksSinceChange++;

    if (bot.trail.length > 2) {
      const fleeDist = this.config.loopSize * 0.6;
      const fleeDist2 = fleeDist * fleeDist;
      for (const p of allPlayers) {
        if (p.id === bot.id || !p.alive) continue;
        if (dist2(p.position, bot.position) < fleeDist2) {
          ai.behavior = BotBehavior.RETURN_HOME;
          ai.waypoints = [];
          break;
        }
      }
    }

    if (bot.trail.length > this.config.maxTrailLen && ai.behavior === BotBehavior.EXPAND) {
      ai.behavior = BotBehavior.RETURN_HOME;
      ai.waypoints = [];
    }

    // Stuck detection: if expanding for too long without completing, return home
    if (ai.behavior === BotBehavior.EXPAND && ai.ticksSinceChange > 600) {
      ai.behavior = BotBehavior.RETURN_HOME;
      ai.waypoints = [];
      ai.ticksSinceChange = 0;
    }

    switch (ai.behavior) {
      case BotBehavior.EXPAND:
        this.doExpand(bot, ai, dt);
        break;
      case BotBehavior.RETURN_HOME:
      case BotBehavior.FLEE:
        this.doReturnHome(bot, ai, dt);
        break;
    }
  }

  private doExpand(bot: PlayerState, ai: BotAI, dt: number): void {
    if (ai.waypoints.length === 0 || ai.waypointIndex >= ai.waypoints.length) {
      ai.waypoints = this.planSmoothLoop(bot, ai);
      ai.waypointIndex = 0;
      ai.stuckTicks = 0;
    }

    const target = ai.waypoints[ai.waypointIndex];
    this.smoothTurn(bot, target, dt);

    const advanceThreshold = 2.25; // 1.5^2
    if (dist2(bot.position, target) < advanceThreshold) {
      ai.waypointIndex++;
      ai.stuckTicks = 0;
    } else {
      ai.stuckTicks++;
      if (ai.stuckTicks > 300) {
        ai.waypoints = [];
        ai.stuckTicks = 0;
      }
    }
  }

  private doReturnHome(bot: PlayerState, ai: BotAI, dt: number): void {
    const nearest = bot.territory.getNearestBoundaryPoint(bot.position);
    this.smoothTurn(bot, nearest, dt);

    if (bot.territory.containsPoint(bot.position) && bot.trail.length === 0) {
      ai.behavior = BotBehavior.EXPAND;
      ai.waypoints = [];
      ai.ticksSinceChange = 0;
      ai.stuckTicks = 0;
    }
  }

  private smoothTurn(bot: PlayerState, target: Vec2, dt: number): void {
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;

    const targetAngle = Math.atan2(dz, dx);
    const currentAngle = Math.atan2(bot.moveDir.z, bot.moveDir.x);

    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = this.config.turnRate * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

    const newAngle = currentAngle + turn;
    bot.moveDir = { x: Math.cos(newAngle), z: Math.sin(newAngle) };
    bot.hasInput = true;
  }

  private chooseExpansionAngle(bot: PlayerState): number {
    const botDist2 = bot.position.x * bot.position.x + bot.position.z * bot.position.z;
    const edgeThreshold = MAP_RADIUS * 0.7;

    // Near arena edge: prefer toward center
    if (botDist2 > edgeThreshold * edgeThreshold) {
      const toCenter = Math.atan2(-bot.position.z, -bot.position.x);
      return toCenter + (Math.random() - 0.5) * Math.PI * 0.6;
    }

    // Expand away from territory centroid to claim new ground
    const polys = bot.territory.polygons;
    if (polys.length > 0) {
      let cx = 0, cz = 0, count = 0;
      for (const poly of polys) {
        for (const v of poly) {
          cx += v.x;
          cz += v.z;
          count++;
        }
      }
      if (count > 0) {
        cx /= count;
        cz /= count;
        const dx = bot.position.x - cx;
        const dz = bot.position.z - cz;
        if (dx * dx + dz * dz > 0.5) {
          const baseAngle = Math.atan2(dz, dx);
          return baseAngle + (Math.random() - 0.5) * Math.PI * 0.8;
        }
      }
    }

    return Math.random() * Math.PI * 2;
  }

  private planSmoothLoop(bot: PlayerState, ai: BotAI): Vec2[] {
    const baseSize = this.config.loopSize;

    // 15% chance of an extra-large "power grab" loop
    const sizeMultiplier = Math.random() < 0.15 ? 1.5 : 1.0;
    const size = baseSize * (0.8 + Math.random() * 0.6) * sizeMultiplier;

    const angle = this.chooseExpansionAngle(bot);
    ai.lastExpansionAngle = angle;

    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    const length = size * (1.0 + Math.random() * 0.5);
    const width = size * (0.5 + Math.random() * 0.5);

    // Ellipse centered ahead of the bot
    const ecx = bot.position.x + forwardX * length * 0.5;
    const ecz = bot.position.z + forwardZ * length * 0.5;

    const numPoints = 24;
    const points: Vec2[] = [];

    // Start from near bot (t=π maps to bot position) and trace the full ellipse
    for (let i = 0; i <= numPoints; i++) {
      const t = Math.PI + (i / numPoints) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const px = ecx + ct * (length * 0.5) * forwardX + st * (width * 0.5) * rightX;
      const pz = ecz + ct * (length * 0.5) * forwardZ + st * (width * 0.5) * rightZ;
      points.push({ x: px, z: pz });
    }

    const maxR = MAP_RADIUS - 2;
    for (const p of points) {
      const d = Math.sqrt(p.x * p.x + p.z * p.z);
      if (d > maxR) {
        const scale = maxR / d;
        p.x *= scale;
        p.z *= scale;
      }
    }

    return points;
  }
}
