import {
  MAP_RADIUS,
  BotBehavior,
  type Difficulty,
  BOT_DIFFICULTY,
  type Vec2,
  dist,
  dist2,
} from "./constants.ts";
import { type PlayerState } from "./Player.ts";

interface BotAI {
  behavior: BotBehavior;
  waypoints: Vec2[];
  waypointIndex: number;
  ticksSinceChange: number;
  stuckTicks: number;
  lastExpansionAngle: number;
  config: BotDifficultyConfig;
  targetPlayerId: number | null;
  targetPoint: Vec2 | null;
  prioritizeHuman: boolean;
}

interface BotDifficultyConfig {
  maxTrailLen: number;
  aggression: number;
  loopSize: number;
  turnRate: number;
  maxExpandTicks: number;
}

interface AttackTarget {
  playerId: number;
  point: Vec2;
  score: number;
  enemyReturnDist: number;
  interceptDist: number;
  enemyDistToPoint: number;
}

interface DefenseTarget {
  playerId: number;
  point: Vec2;
  score: number;
}

const HUMAN_FOCUS_RADIUS = 24;
const HUMAN_FOCUS_RADIUS_SQ = HUMAN_FOCUS_RADIUS * HUMAN_FOCUS_RADIUS;
const HUMAN_GANG_UP_RADIUS = 28;
const HUMAN_GANG_UP_RADIUS_SQ = HUMAN_GANG_UP_RADIUS * HUMAN_GANG_UP_RADIUS;

export interface BotFrameContext {
  leaderId: number;
}

export class BotController {
  private ais: Map<number, BotAI> = new Map();
  private baseConfig: BotDifficultyConfig;
  private hunterBotIds = new Set<number>();

  constructor(difficulty: Difficulty) {
    const base = BOT_DIFFICULTY[difficulty];
    this.baseConfig = {
      ...base,
      maxExpandTicks:
        difficulty === "easy" ? 500 : difficulty === "hard" ? 550 : 520,
    };
  }

  initBot(player: PlayerState): void {
    const prioritizeHuman =
      this.hunterBotIds.has(player.id) || this.hunterBotIds.size < 2;
    if (prioritizeHuman) {
      this.hunterBotIds.add(player.id);
    }
    this.ais.set(player.id, {
      behavior: BotBehavior.EXPAND,
      waypoints: [],
      waypointIndex: 0,
      ticksSinceChange: 0,
      stuckTicks: 0,
      lastExpansionAngle: Math.atan2(player.moveDir.z, player.moveDir.x),
      config: this.createBotConfig(),
      targetPlayerId: null,
      targetPoint: null,
      prioritizeHuman,
    });
  }

  update(
    bot: PlayerState,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
    dt: number,
  ): void {
    if (!bot.alive) return;
    const ai = this.ais.get(bot.id);
    if (!ai) return;

    ai.ticksSinceChange++;

    const pressure = this.getNearbyEnemyPressure(bot, allPlayers);
    const defenseTarget = this.evaluateBorderThreat(bot, allPlayers, ai);
    const attackTarget = this.evaluateTrailAttack(bot, allPlayers, ai, frame);
    const weakTarget = this.evaluateWeakPlayerHunt(bot, allPlayers, ai);
    const hunterTarget = ai.prioritizeHuman
      ? this.evaluatePriorityHumanTarget(bot, allPlayers, ai)
      : null;

    if (bot.trail.length > ai.config.maxTrailLen) {
      this.setBehavior(ai, BotBehavior.RETURN_HOME);
    } else if (
      defenseTarget &&
      bot.isTrailing &&
      defenseTarget.score > 5.4 &&
      bot.trail.length >
        ai.config.maxTrailLen * (0.22 + (1 - ai.config.aggression) * 0.1)
    ) {
      this.setBehavior(ai, BotBehavior.RETURN_HOME);
    } else if (
      bot.trail.length >
        ai.config.maxTrailLen * (0.55 - ai.config.aggression * 0.15) &&
      pressure < ai.config.loopSize * (0.95 + (1 - ai.config.aggression) * 0.4)
    ) {
      this.setBehavior(ai, BotBehavior.FLEE);
    } else if (
      hunterTarget &&
      this.canCommitAttack(bot, ai, hunterTarget.target)
    ) {
      this.setBehavior(
        ai,
        hunterTarget.behavior,
        hunterTarget.target.playerId,
        hunterTarget.target.point,
      );
    } else if (defenseTarget && !bot.isTrailing) {
      this.setBehavior(
        ai,
        BotBehavior.DEFEND_BORDER,
        defenseTarget.playerId,
        defenseTarget.point,
      );
    } else if (attackTarget && this.canCommitAttack(bot, ai, attackTarget)) {
      this.setBehavior(
        ai,
        BotBehavior.ATTACK_TRAIL,
        attackTarget.playerId,
        attackTarget.point,
      );
    } else if (weakTarget && this.canHuntPlayer(bot, ai, weakTarget)) {
      this.setBehavior(
        ai,
        BotBehavior.HUNT_WEAK_PLAYER,
        weakTarget.playerId,
        weakTarget.point,
      );
    } else if (
      ai.behavior !== BotBehavior.EXPAND &&
      bot.territory.containsPoint(bot.position) &&
      bot.trail.length === 0
    ) {
      this.setBehavior(ai, BotBehavior.EXPAND);
    }

    if (
      ai.behavior === BotBehavior.EXPAND &&
      ai.ticksSinceChange > ai.config.maxExpandTicks
    ) {
      this.setBehavior(ai, BotBehavior.RETURN_HOME);
    }

    switch (ai.behavior) {
      case BotBehavior.EXPAND:
        this.doExpand(bot, ai, allPlayers, frame, dt);
        break;
      case BotBehavior.ATTACK_TRAIL:
      case BotBehavior.HUNT_WEAK_PLAYER:
        this.doAttack(bot, ai, allPlayers, frame, dt);
        break;
      case BotBehavior.DEFEND_BORDER:
        this.doDefend(bot, ai, allPlayers, dt);
        break;
      case BotBehavior.RETURN_HOME:
      case BotBehavior.FLEE:
        this.doReturnHome(bot, ai, dt);
        break;
    }
  }

  private doExpand(
    bot: PlayerState,
    ai: BotAI,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
    dt: number,
  ): void {
    if (ai.waypoints.length === 0 || ai.waypointIndex >= ai.waypoints.length) {
      ai.waypoints = this.planScoredLoop(bot, ai, allPlayers, frame);
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

  private doAttack(
    bot: PlayerState,
    ai: BotAI,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
    dt: number,
  ): void {
    const targetPlayer =
      ai.targetPlayerId != null ? allPlayers[ai.targetPlayerId] : null;
    if (!targetPlayer || !targetPlayer.alive) {
      this.setBehavior(
        ai,
        bot.trail.length > 0 ? BotBehavior.RETURN_HOME : BotBehavior.EXPAND,
      );
      return;
    }

    const priorityHunterTarget = ai.prioritizeHuman
      ? this.evaluatePriorityHumanTarget(bot, allPlayers, ai)
      : null;
    const attackTarget = priorityHunterTarget?.target
      ? priorityHunterTarget.target
      : ai.behavior === BotBehavior.HUNT_WEAK_PLAYER
        ? this.evaluateWeakPlayerHunt(bot, allPlayers, ai)
        : this.evaluateTrailAttack(bot, allPlayers, ai, frame);

    if (!attackTarget || !this.canCommitAttack(bot, ai, attackTarget)) {
      this.setBehavior(
        ai,
        bot.trail.length > 0 ? BotBehavior.RETURN_HOME : BotBehavior.EXPAND,
      );
      return;
    }

    ai.targetPlayerId = attackTarget.playerId;
    ai.targetPoint = attackTarget.point;
    this.smoothTurn(bot, attackTarget.point, dt);

    if (
      dist2(bot.position, attackTarget.point) < 1.8 * 1.8 &&
      bot.trail.length > 0
    ) {
      this.setBehavior(ai, BotBehavior.RETURN_HOME);
    }
  }

  private doDefend(
    bot: PlayerState,
    ai: BotAI,
    allPlayers: PlayerState[],
    dt: number,
  ): void {
    const defenseTarget = this.evaluateBorderThreat(bot, allPlayers, ai);
    if (!defenseTarget) {
      this.setBehavior(ai, BotBehavior.EXPAND);
      return;
    }

    ai.targetPoint = defenseTarget.point;
    this.smoothTurn(bot, defenseTarget.point, dt);

    if (
      dist2(bot.position, defenseTarget.point) < 2.2 * 2.2 &&
      !bot.isTrailing
    ) {
      this.setBehavior(ai, BotBehavior.EXPAND);
    }
  }

  private doReturnHome(bot: PlayerState, ai: BotAI, dt: number): void {
    const nearest = bot.territory.getNearestBoundaryPoint(bot.position);
    this.smoothTurn(bot, nearest, dt);

    if (bot.territory.containsPoint(bot.position) && bot.trail.length === 0) {
      this.setBehavior(ai, BotBehavior.EXPAND);
    }
  }

  private smoothTurn(bot: PlayerState, target: Vec2, dt: number): void {
    const ai = this.ais.get(bot.id);
    if (!ai) return;
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;

    const targetAngle = Math.atan2(dz, dx);
    const currentAngle = Math.atan2(bot.moveDir.z, bot.moveDir.x);

    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = ai.config.turnRate * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

    const newAngle = currentAngle + turn;
    bot.moveDir = { x: Math.cos(newAngle), z: Math.sin(newAngle) };
    bot.hasInput = true;
  }

  private chooseExpansionAngle(
    bot: PlayerState,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
  ): number {
    const ai = this.ais.get(bot.id);
    const botDist2 =
      bot.position.x * bot.position.x + bot.position.z * bot.position.z;
    const edgeThreshold = MAP_RADIUS * 0.7;

    // Near arena edge: prefer toward center
    if (botDist2 > edgeThreshold * edgeThreshold) {
      const toCenter = Math.atan2(-bot.position.z, -bot.position.x);
      return toCenter + (Math.random() - 0.5) * Math.PI * 0.6;
    }

    if (ai?.prioritizeHuman) {
      const human = this.getHumanPlayer(allPlayers);
      if (human) {
        return (
          Math.atan2(
            human.position.z - bot.position.z,
            human.position.x - bot.position.x,
          ) + this.randomRange(-0.28, 0.28)
        );
      }
    }

    const contestTarget = this.pickContestTarget(bot, allPlayers, frame);
    if (contestTarget) {
      return (
        Math.atan2(
          contestTarget.position.z - bot.position.z,
          contestTarget.position.x - bot.position.x,
        ) + this.randomRange(-0.45, 0.45)
      );
    }

    // Expand away from territory centroid to claim new ground
    if (bot.territory.hasTerritory()) {
      const c = bot.territory.getCentroid();
      const dx = bot.position.x - c.x;
      const dz = bot.position.z - c.z;
      if (dx * dx + dz * dz > 0.5) {
        const baseAngle = Math.atan2(dz, dx);
        return baseAngle + (Math.random() - 0.5) * Math.PI * 0.8;
      }
    }

    return Math.random() * Math.PI * 2;
  }

  private planScoredLoop(
    bot: PlayerState,
    ai: BotAI,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
  ): Vec2[] {
    let bestPoints: Vec2[] | null = null;
    let bestScore = -Infinity;
    const candidates = 7;

    for (let i = 0; i < candidates; i++) {
      const baseSize = ai.config.loopSize;
      const sizeMultiplier =
        Math.random() < 0.12 + ai.config.aggression * 0.2 ? 1.45 : 1.0;
      const size = baseSize * this.randomRange(0.75, 1.15) * sizeMultiplier;
      const angle =
        i === 0
          ? this.chooseExpansionAngle(bot, allPlayers, frame)
          : ai.lastExpansionAngle + this.randomRange(-1.2, 1.2);
      const length = size * this.randomRange(0.95, 1.45);
      const width = size * this.randomRange(0.55, 1.0);
      const points = this.createLoopPoints(bot, angle, length, width);
      const score = this.scoreLoop(
        bot,
        points,
        allPlayers,
        ai,
        frame,
        length,
        width,
      );
      if (score > bestScore) {
        bestScore = score;
        bestPoints = points;
        ai.lastExpansionAngle = angle;
      }
    }

    return (
      bestPoints ??
      this.createLoopPoints(
        bot,
        0,
        ai.config.loopSize,
        ai.config.loopSize * 0.7,
      )
    );
  }

  private createLoopPoints(
    bot: PlayerState,
    angle: number,
    length: number,
    width: number,
  ): Vec2[] {
    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const ecx = bot.position.x + forwardX * length * 0.5;
    const ecz = bot.position.z + forwardZ * length * 0.5;

    const numPoints = 24;
    const points: Vec2[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = Math.PI + (i / numPoints) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const px =
        ecx + ct * (length * 0.5) * forwardX + st * (width * 0.5) * rightX;
      const pz =
        ecz + ct * (length * 0.5) * forwardZ + st * (width * 0.5) * rightZ;
      points.push(this.clampPointToArena({ x: px, z: pz }));
    }
    return points;
  }

  private scoreLoop(
    bot: PlayerState,
    points: Vec2[],
    allPlayers: PlayerState[],
    ai: BotAI,
    frame: BotFrameContext,
    length: number,
    width: number,
  ): number {
    const center = this.computeCentroid(points);
    const areaGain = length * width;
    const homeDist = this.nearestHomeDistance(bot, center);
    const edgeRisk = Math.max(0, this.length(center) - (MAP_RADIUS - 5));
    const pressure = this.getEnemyPressureAt(center, bot.id, allPlayers);
    const contestBonus = this.getContestBonus(bot, center, allPlayers, frame);
    const escapePenalty = bot.trail.length * 0.5;

    return (
      areaGain * (0.24 + ai.config.aggression * 0.08) +
      contestBonus * (2.1 + ai.config.aggression) -
      homeDist * (0.52 - ai.config.aggression * 0.1) -
      pressure * (1.05 - ai.config.aggression * 0.18) -
      edgeRisk * 3.2 -
      escapePenalty +
      this.randomRange(-1.4, 1.4)
    );
  }

  private evaluateTrailAttack(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
    frame: BotFrameContext,
  ): AttackTarget | null {
    let best: AttackTarget | null = null;
    const human = this.getHumanPlayer(allPlayers);

    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive || enemy.trail.length === 0)
        continue;
      if (enemy.territory.containsPoint(enemy.position)) continue;
      if (
        human &&
        !enemy.isHuman &&
        this.shouldGangUpOnHuman(bot, enemy, human)
      ) {
        continue;
      }

      const intercept = this.pickBestTrailIntercept(bot, enemy, allPlayers, ai);
      const targetPoint = intercept.point;
      const interceptDist = intercept.interceptDist;
      const enemyReturnDist = intercept.enemyReturnDist;
      const pressure = this.getEnemyPressureAt(
        targetPoint,
        bot.id,
        allPlayers,
        enemy.id,
      );
      const score =
        enemyReturnDist * (1.55 + ai.config.aggression * 0.78) -
        interceptDist * (0.42 - ai.config.aggression * 0.08) -
        intercept.enemyDistToPoint * 0.2 -
        pressure * 0.85 +
        intercept.vulnerabilityBonus +
        this.getHumanFocusBonus(bot, targetPoint, enemy, human) +
        (enemy.isHuman ? 4.5 : 0) +
        (enemy.id === frame.leaderId ? 2.5 : 0) +
        enemy.trail.length * 0.16;

      if (!best || score > best.score) {
        best = {
          playerId: enemy.id,
          point: targetPoint,
          score,
          enemyReturnDist,
          interceptDist,
          enemyDistToPoint: intercept.enemyDistToPoint,
        };
      }
    }

    return best && best.score > 1.25 ? best : null;
  }

  private evaluateWeakPlayerHunt(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): AttackTarget | null {
    let best: AttackTarget | null = null;
    const human = this.getHumanPlayer(allPlayers);

    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive || enemy.trail.length === 0)
        continue;
      if (enemy.territory.containsPoint(enemy.position)) continue;
      if (
        human &&
        !enemy.isHuman &&
        this.shouldGangUpOnHuman(bot, enemy, human)
      ) {
        continue;
      }

      const enemyReturnDist = this.nearestHomeDistance(enemy);
      if (enemyReturnDist < ai.config.loopSize * 0.45) continue;

      const interceptDist = dist(bot.position, enemy.position);
      const score =
        enemyReturnDist * (0.9 + ai.config.aggression * 0.8) -
        interceptDist * 0.42 +
        this.getHumanFocusBonus(bot, enemy.position, enemy, human) +
        (enemy.isHuman ? 3 : 0);

      if (!best || score > best.score) {
        best = {
          playerId: enemy.id,
          point: enemy.position,
          score,
          enemyReturnDist,
          interceptDist,
          enemyDistToPoint: 0,
        };
      }
    }

    return best && best.score > 2 ? best : null;
  }

  private evaluateBorderThreat(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): DefenseTarget | null {
    let best: DefenseTarget | null = null;
    const human = this.getHumanPlayer(allPlayers);

    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive) continue;
      if (!enemy.isTrailing && enemy.territory.containsPoint(enemy.position))
        continue;
      if (
        human &&
        !enemy.isHuman &&
        this.shouldGangUpOnHuman(bot, enemy, human)
      ) {
        continue;
      }

      const borderPoint = bot.territory.getNearestBoundaryPoint(enemy.position);
      const enemyBorderDist = dist(enemy.position, borderPoint);
      const botBorderDist = dist(bot.position, borderPoint);
      const enemyReturnDist = this.nearestHomeDistance(enemy, borderPoint);
      const pressure = this.getEnemyPressureAt(
        borderPoint,
        bot.id,
        allPlayers,
        enemy.id,
      );
      const score =
        (ai.config.loopSize * 1.75 - enemyBorderDist) * 1.7 -
        botBorderDist * 0.52 +
        enemy.trail.length * 0.22 +
        enemyReturnDist * 0.26 -
        pressure * 0.08 +
        this.getHumanFocusBonus(bot, borderPoint, enemy, human) * 0.9 +
        (enemy.isHuman ? 3.2 : 0);

      if (!best || score > best.score) {
        best = { playerId: enemy.id, point: borderPoint, score };
      }
    }

    return best && best.score > 2.1 ? best : null;
  }

  private canCommitAttack(
    bot: PlayerState,
    ai: BotAI,
    target: AttackTarget,
  ): boolean {
    const homeDist = this.nearestHomeDistance(bot);
    const trailPenalty = bot.trail.length * 0.65;
    const budget =
      ai.config.loopSize * (2.15 + ai.config.aggression * 1.75) - trailPenalty;
    const interceptWindow =
      target.enemyReturnDist * (1.08 + ai.config.aggression * 0.2) + 2.2;
    const enemyRaceAdvantage = target.enemyReturnDist - target.interceptDist;

    return (
      homeDist + target.interceptDist * 0.8 <= budget &&
      target.interceptDist <= interceptWindow &&
      enemyRaceAdvantage > -1.2
    );
  }

  private canHuntPlayer(
    bot: PlayerState,
    ai: BotAI,
    target: AttackTarget,
  ): boolean {
    return (
      target.enemyReturnDist > ai.config.loopSize * 0.5 &&
      this.canCommitAttack(bot, ai, target)
    );
  }

  private getNearbyEnemyPressure(
    bot: PlayerState,
    allPlayers: PlayerState[],
  ): number {
    let nearest = Infinity;
    for (const player of allPlayers) {
      if (player.id === bot.id || !player.alive) continue;
      nearest = Math.min(nearest, dist(bot.position, player.position));
    }
    return nearest;
  }

  private getEnemyPressureAt(
    point: Vec2,
    selfId: number,
    allPlayers: PlayerState[],
    ignoreId?: number,
  ): number {
    let nearest = MAP_RADIUS * 2;
    for (const player of allPlayers) {
      if (player.id === selfId || player.id === ignoreId || !player.alive)
        continue;
      nearest = Math.min(nearest, dist(point, player.position));
    }
    return nearest;
  }

  private getHumanPlayer(allPlayers: PlayerState[]): PlayerState | null {
    return allPlayers.find((player) => player.isHuman && player.alive) ?? null;
  }

  private isWithinHumanZone(
    point: Vec2,
    human: PlayerState,
    radiusSq: number,
  ): boolean {
    return dist2(point, human.position) <= radiusSq;
  }

  private shouldGangUpOnHuman(
    bot: PlayerState,
    enemy: PlayerState,
    human: PlayerState,
  ): boolean {
    return (
      this.isWithinHumanZone(bot.position, human, HUMAN_GANG_UP_RADIUS_SQ) &&
      this.isWithinHumanZone(enemy.position, human, HUMAN_GANG_UP_RADIUS_SQ)
    );
  }

  private getHumanFocusBonus(
    bot: PlayerState,
    targetPoint: Vec2,
    enemy: PlayerState,
    human: PlayerState | null,
  ): number {
    if (!human || !enemy.isHuman) return 0;

    let bonus = 0;
    if (this.isWithinHumanZone(bot.position, human, HUMAN_FOCUS_RADIUS_SQ)) {
      bonus += 5.5;
    }
    if (this.isWithinHumanZone(targetPoint, human, HUMAN_FOCUS_RADIUS_SQ)) {
      bonus += 4.5;
    }
    return bonus;
  }

  private evaluatePriorityHumanTarget(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): { behavior: BotBehavior; target: AttackTarget } | null {
    const human = this.getHumanPlayer(allPlayers);
    if (!human || human.id === bot.id) return null;

    if (
      human.trail.length > 0 &&
      !human.territory.containsPoint(human.position)
    ) {
      const intercept = this.pickBestTrailIntercept(bot, human, allPlayers, ai);
      const pressure = this.getEnemyPressureAt(
        intercept.point,
        bot.id,
        allPlayers,
        human.id,
      );
      const score =
        intercept.enemyReturnDist * (1.85 + ai.config.aggression * 0.92) -
        intercept.interceptDist * (0.34 - ai.config.aggression * 0.06) -
        intercept.enemyDistToPoint * 0.18 -
        pressure * 0.52 +
        intercept.vulnerabilityBonus +
        9.5;

      return {
        behavior: BotBehavior.ATTACK_TRAIL,
        target: {
          playerId: human.id,
          point: intercept.point,
          score,
          enemyReturnDist: intercept.enemyReturnDist,
          interceptDist: intercept.interceptDist,
          enemyDistToPoint: intercept.enemyDistToPoint,
        },
      };
    }

    const humanReturnDist = this.nearestHomeDistance(human);
    if (humanReturnDist < ai.config.loopSize * 0.3) return null;

    const interceptDist = dist(bot.position, human.position);
    const score =
      humanReturnDist * (1.08 + ai.config.aggression * 0.75) -
      interceptDist * 0.34 +
      7.5;

    return {
      behavior: BotBehavior.HUNT_WEAK_PLAYER,
      target: {
        playerId: human.id,
        point: human.position,
        score,
        enemyReturnDist: humanReturnDist,
        interceptDist,
        enemyDistToPoint: 0,
      },
    };
  }

  private pickNearestTrailPoint(from: Vec2, trail: Vec2[]): Vec2 {
    let best = trail[0];
    let bestDist = dist2(from, best);
    const step = trail.length > 16 ? 2 : 1;
    for (let i = 1; i < trail.length; i += step) {
      const point = trail[i];
      const d2 = dist2(from, point);
      if (d2 < bestDist) {
        best = point;
        bestDist = d2;
      }
    }
    return best;
  }

  private pickBestTrailIntercept(
    bot: PlayerState,
    enemy: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): {
    point: Vec2;
    interceptDist: number;
    enemyReturnDist: number;
    enemyDistToPoint: number;
    vulnerabilityBonus: number;
  } {
    const fallbackPoint = this.pickNearestTrailPoint(bot.position, enemy.trail);
    let best = {
      point: fallbackPoint,
      interceptDist: dist(bot.position, fallbackPoint),
      enemyReturnDist: this.nearestHomeDistance(enemy, fallbackPoint),
      enemyDistToPoint: dist(enemy.position, fallbackPoint),
      vulnerabilityBonus: 0,
      score: -Infinity,
    };

    const trail = enemy.trail;
    const step = trail.length > 18 ? 2 : 1;
    for (let i = 0; i < trail.length; i += step) {
      const point = trail[i];
      const interceptDist = dist(bot.position, point);
      const enemyReturnDist = this.nearestHomeDistance(enemy, point);
      const enemyDistToPoint = dist(enemy.position, point);
      const pressure = this.getEnemyPressureAt(
        point,
        bot.id,
        allPlayers,
        enemy.id,
      );
      const vulnerabilityBonus =
        enemyReturnDist * (0.38 + ai.config.aggression * 0.16) -
        enemyDistToPoint * 0.2 -
        pressure * 0.18;
      const score =
        vulnerabilityBonus +
        enemyReturnDist * 0.72 -
        interceptDist * 0.34 -
        enemyDistToPoint * 0.16;

      if (score > best.score) {
        best = {
          point,
          interceptDist,
          enemyReturnDist,
          enemyDistToPoint,
          vulnerabilityBonus,
          score,
        };
      }
    }

    return best;
  }

  private pickContestTarget(
    bot: PlayerState,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
  ): PlayerState | null {
    let best: PlayerState | null = null;
    let bestScore = -Infinity;
    const leaderId = frame.leaderId;

    for (const player of allPlayers) {
      if (player.id === bot.id || !player.alive) continue;
      const score =
        (player.id === leaderId ? 2 : 0) +
        (player.isHuman ? 2.5 : 0) -
        dist(bot.position, player.position) * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = player;
      }
    }

    return best;
  }

  private getContestBonus(
    bot: PlayerState,
    center: Vec2,
    allPlayers: PlayerState[],
    frame: BotFrameContext,
  ): number {
    let bonus = 0;
    const leaderId = frame.leaderId;

    for (const player of allPlayers) {
      if (player.id === bot.id || !player.alive) continue;
      if (player.territory.containsPoint(center)) {
        bonus += player.isHuman ? 5 : 3;
        if (player.id === leaderId) bonus += 2;
      }
    }

    return bonus;
  }
  private nearestHomeDistance(bot: PlayerState, point = bot.position): number {
    return dist(point, bot.territory.getNearestBoundaryPoint(point));
  }

  private computeCentroid(points: Vec2[]): Vec2 {
    let sx = 0;
    let sz = 0;
    for (const point of points) {
      sx += point.x;
      sz += point.z;
    }
    const inv = 1 / Math.max(1, points.length);
    return { x: sx * inv, z: sz * inv };
  }

  private clampPointToArena(point: Vec2): Vec2 {
    const len = this.length(point);
    const maxR = MAP_RADIUS - 2;
    if (len <= maxR) return point;
    const scale = maxR / Math.max(len, 0.001);
    return { x: point.x * scale, z: point.z * scale };
  }

  private length(point: Vec2): number {
    return Math.sqrt(point.x * point.x + point.z * point.z);
  }

  private setBehavior(
    ai: BotAI,
    behavior: BotBehavior,
    targetPlayerId: number | null = null,
    targetPoint: Vec2 | null = null,
  ): void {
    if (ai.behavior !== behavior) {
      ai.behavior = behavior;
      ai.waypoints = [];
      ai.waypointIndex = 0;
      ai.stuckTicks = 0;
      ai.ticksSinceChange = 0;
    }
    ai.targetPlayerId = targetPlayerId;
    ai.targetPoint = targetPoint;
  }

  private createBotConfig(): BotDifficultyConfig {
    const isAdventurous = Math.random() < 0.34;
    const maxTrailLenBase = Math.max(
      10,
      Math.round(this.baseConfig.maxTrailLen * this.randomRange(0.8, 1.2)),
    );
    const aggressionBase = Math.max(
      0.05,
      Math.min(
        0.95,
        this.baseConfig.aggression + this.randomRange(-0.15, 0.15),
      ),
    );
    const loopSizeBase = this.baseConfig.loopSize * this.randomRange(0.85, 1.2);
    const turnRateBase =
      this.baseConfig.turnRate * this.randomRange(0.85, 1.15);

    return {
      maxTrailLen: Math.max(
        10,
        Math.round(maxTrailLenBase * (isAdventurous ? 1.16 : 1)),
      ),
      aggression: Math.max(
        0.05,
        Math.min(0.95, aggressionBase + (isAdventurous ? 0.05 : 0)),
      ),
      loopSize: loopSizeBase * (isAdventurous ? 1.14 : 1),
      turnRate: turnRateBase,
      maxExpandTicks: Math.round(
        this.randomRange(470, 560) * (isAdventurous ? 1.2 : 1),
      ),
    };
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
