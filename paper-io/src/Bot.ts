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
  config: BotDifficultyConfig;
  targetPlayerId: number | null;
  targetPoint: Vec2 | null;
  prioritizeHuman: boolean;
  retargetIn: number;
  patrolAngle: number;
}

interface BotDifficultyConfig {
  maxTrailLen: number;
  aggression: number;
  loopSize: number;
  turnRate: number;
}

interface AttackTarget {
  playerId: number;
  point: Vec2;
  score: number;
  interceptDist: number;
  enemyReturnDist: number;
}

interface DefenseTarget {
  playerId: number | null;
  point: Vec2;
  score: number;
}

const ATTACK_SCAN_RADIUS = 34;
const ATTACK_SCAN_RADIUS_SQ = ATTACK_SCAN_RADIUS * ATTACK_SCAN_RADIUS;
const DEFENSE_SCAN_RADIUS = 16;
const DEFENSE_SCAN_RADIUS_SQ = DEFENSE_SCAN_RADIUS * DEFENSE_SCAN_RADIUS;
const PATROL_REACH_DIST_SQ = 2.6 * 2.6;
const RETARGET_BASE_SECONDS = 0.18;
const MOBILE_RETARGET_BASE_SECONDS = 0.26;
const HUMAN_FOCUS_BONUS = 7.5;

export class BotController {
  private ais: Map<number, BotAI> = new Map();
  private baseConfig: BotDifficultyConfig;
  private hunterBotIds = new Set<number>();
  private readonly isMobile: boolean;

  constructor(difficulty: Difficulty) {
    this.baseConfig = { ...BOT_DIFFICULTY[difficulty] };
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
  }

  initBot(player: PlayerState): void {
    const prioritizeHuman =
      this.hunterBotIds.has(player.id) || this.hunterBotIds.size < 2;
    if (prioritizeHuman) {
      this.hunterBotIds.add(player.id);
    }

    this.ais.set(player.id, {
      behavior: BotBehavior.ATTACK,
      config: this.createBotConfig(),
      targetPlayerId: null,
      targetPoint: null,
      prioritizeHuman,
      retargetIn: this.randomRange(0.04, this.getRetargetBaseSeconds()),
      patrolAngle: Math.atan2(player.moveDir.z, player.moveDir.x),
    });
  }

  update(bot: PlayerState, allPlayers: PlayerState[], dt: number): void {
    if (!bot.alive) return;
    const ai = this.ais.get(bot.id);
    if (!ai) return;

    ai.retargetIn -= dt;
    if (ai.retargetIn <= 0 || !ai.targetPoint) {
      this.refreshDecision(bot, allPlayers, ai);
      ai.retargetIn =
        this.getRetargetBaseSeconds() +
        this.randomRange(0, 0.08) +
        bot.id * 0.01;
    }

    if (bot.trail.length > ai.config.maxTrailLen) {
      this.setBehavior(ai, BotBehavior.DEFEND, null, null);
    }

    if (ai.behavior === BotBehavior.DEFEND) {
      this.doDefend(bot, allPlayers, ai, dt);
      return;
    }

    this.doAttack(bot, allPlayers, ai, dt);
  }

  private refreshDecision(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): void {
    const defenseTarget = this.findDefenseTarget(bot, allPlayers, ai);
    if (defenseTarget) {
      this.setBehavior(
        ai,
        BotBehavior.DEFEND,
        defenseTarget.playerId,
        defenseTarget.point,
      );
      return;
    }

    const attackTarget = this.findAttackTarget(bot, allPlayers, ai);
    if (attackTarget) {
      this.setBehavior(
        ai,
        BotBehavior.ATTACK,
        attackTarget.playerId,
        attackTarget.point,
      );
      return;
    }

    this.setBehavior(
      ai,
      BotBehavior.ATTACK,
      null,
      this.choosePatrolPoint(bot, allPlayers, ai),
    );
  }

  private doAttack(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
    dt: number,
  ): void {
    const targetPlayer =
      ai.targetPlayerId != null ? allPlayers[ai.targetPlayerId] : null;
    if (targetPlayer?.alive) {
      ai.targetPoint = this.getAttackPoint(bot, targetPlayer);
    } else {
      ai.targetPlayerId = null;
      if (
        !ai.targetPoint ||
        dist2(bot.position, ai.targetPoint) < PATROL_REACH_DIST_SQ
      ) {
        ai.targetPoint = this.choosePatrolPoint(bot, allPlayers, ai);
      }
    }

    if (!ai.targetPoint) {
      ai.targetPoint = this.choosePatrolPoint(bot, allPlayers, ai);
    }

    this.smoothTurn(bot, ai.targetPoint, ai.config.turnRate, dt);

    if (
      bot.isTrailing &&
      this.nearestHomeDistance(bot) >
        ai.config.loopSize * (0.86 + (1 - ai.config.aggression) * 0.22)
    ) {
      this.setBehavior(ai, BotBehavior.DEFEND, null, null);
    }
  }

  private doDefend(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
    dt: number,
  ): void {
    const defenseTarget = this.findDefenseTarget(bot, allPlayers, ai);
    if (!defenseTarget) {
      this.setBehavior(
        ai,
        BotBehavior.ATTACK,
        null,
        this.choosePatrolPoint(bot, allPlayers, ai),
      );
      return;
    }

    ai.targetPlayerId = defenseTarget.playerId;
    ai.targetPoint = defenseTarget.point;
    this.smoothTurn(bot, defenseTarget.point, ai.config.turnRate * 1.05, dt);

    if (
      bot.territory.containsPoint(bot.position) &&
      bot.trail.length === 0 &&
      defenseTarget.playerId == null
    ) {
      this.setBehavior(
        ai,
        BotBehavior.ATTACK,
        null,
        this.choosePatrolPoint(bot, allPlayers, ai),
      );
    }
  }

  private findDefenseTarget(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): DefenseTarget | null {
    const homeDist = this.nearestHomeDistance(bot);
    if (
      bot.isTrailing &&
      (bot.trail.length > ai.config.maxTrailLen * 0.72 ||
        homeDist >
          ai.config.loopSize * (0.92 + (1 - ai.config.aggression) * 0.18))
    ) {
      return {
        playerId: null,
        point: bot.territory.getNearestBoundaryPoint(bot.position),
        score: 999,
      };
    }

    let best: DefenseTarget | null = null;
    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive) continue;
      if (!enemy.isTrailing && enemy.territory.containsPoint(enemy.position)) {
        continue;
      }

      const borderPoint = bot.territory.getNearestBoundaryPoint(enemy.position);
      const enemyBorderDistSq = dist2(enemy.position, borderPoint);
      if (enemyBorderDistSq > this.getDefenseScanRadiusSq()) continue;

      const botBorderDistSq = dist2(bot.position, borderPoint);
      const score =
        (enemy.isHuman ? 4.5 : 0) +
        (ai.prioritizeHuman && enemy.isHuman ? 5.5 : 0) +
        enemy.trail.length * 0.22 -
        enemyBorderDistSq * 0.035 -
        botBorderDistSq * 0.018;

      if (!best || score > best.score) {
        best = {
          playerId: enemy.id,
          point: borderPoint,
          score,
        };
      }
    }

    return best && best.score > 0.5 ? best : null;
  }

  private findAttackTarget(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): AttackTarget | null {
    let best: AttackTarget | null = null;
    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive) continue;

      const exposed =
        enemy.trail.length > 0 &&
        !enemy.territory.containsPoint(enemy.position);
      const point = this.getAttackPoint(bot, enemy);
      const interceptDistSq = dist2(bot.position, point);

      if (!exposed && interceptDistSq > this.getAttackScanRadiusSq()) {
        continue;
      }

      const interceptDist = Math.sqrt(interceptDistSq);
      const enemyReturnDist = this.nearestHomeDistance(enemy, point);
      if (
        exposed &&
        !this.canCommitAttack(bot, ai, interceptDist, enemyReturnDist)
      ) {
        continue;
      }

      const score =
        (exposed ? 8.2 : 0) +
        (enemy.isHuman ? 4.2 : 0) +
        (ai.prioritizeHuman && enemy.isHuman ? HUMAN_FOCUS_BONUS : 0) +
        enemy.trail.length * 0.18 +
        enemyReturnDist * (0.46 + ai.config.aggression * 0.24) -
        interceptDist * 0.28;

      if (!best || score > best.score) {
        best = {
          playerId: enemy.id,
          point,
          score,
          interceptDist,
          enemyReturnDist,
        };
      }
    }

    return best && best.score > 1 ? best : null;
  }

  private getAttackPoint(bot: PlayerState, enemy: PlayerState): Vec2 {
    if (
      enemy.trail.length > 0 &&
      !enemy.territory.containsPoint(enemy.position)
    ) {
      return this.pickNearestTrailPoint(bot.position, enemy.trail);
    }
    return enemy.position;
  }

  private choosePatrolPoint(
    bot: PlayerState,
    allPlayers: PlayerState[],
    ai: BotAI,
  ): Vec2 {
    const human =
      allPlayers.find((player) => player.isHuman && player.alive) ?? null;
    let angle = ai.patrolAngle;

    if (ai.prioritizeHuman && human) {
      angle =
        Math.atan2(
          human.position.z - bot.position.z,
          human.position.x - bot.position.x,
        ) + this.randomRange(-0.28, 0.28);
    } else {
      const nearbyEnemy = this.findNearestEnemy(bot, allPlayers);
      if (nearbyEnemy) {
        angle =
          Math.atan2(
            nearbyEnemy.position.z - bot.position.z,
            nearbyEnemy.position.x - bot.position.x,
          ) + this.randomRange(-0.48, 0.48);
      } else if (bot.territory.hasTerritory()) {
        const centroid = bot.territory.getCentroid();
        angle =
          Math.atan2(bot.position.z - centroid.z, bot.position.x - centroid.x) +
          this.randomRange(-0.7, 0.7);
      } else {
        angle += this.randomRange(-0.8, 0.8);
      }
    }

    ai.patrolAngle = angle;
    const distance =
      ai.config.loopSize *
      this.randomRange(1.05, 1.45) *
      (1 + ai.config.aggression * 0.18);
    return this.clampPointToArena({
      x: bot.position.x + Math.cos(angle) * distance,
      z: bot.position.z + Math.sin(angle) * distance,
    });
  }

  private findNearestEnemy(
    bot: PlayerState,
    allPlayers: PlayerState[],
  ): PlayerState | null {
    let best: PlayerState | null = null;
    let bestDistSq = Infinity;
    for (const enemy of allPlayers) {
      if (enemy.id === bot.id || !enemy.alive) continue;
      const d2 = dist2(bot.position, enemy.position);
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = enemy;
      }
    }
    return best;
  }

  private pickNearestTrailPoint(from: Vec2, trail: Vec2[]): Vec2 {
    let best = trail[0];
    let bestDistSq = dist2(from, best);
    const step = trail.length > 20 ? 3 : trail.length > 10 ? 2 : 1;
    for (let i = step; i < trail.length; i += step) {
      const point = trail[i];
      const d2 = dist2(from, point);
      if (d2 < bestDistSq) {
        best = point;
        bestDistSq = d2;
      }
    }
    return best;
  }

  private canCommitAttack(
    bot: PlayerState,
    ai: BotAI,
    interceptDist: number,
    enemyReturnDist: number,
  ): boolean {
    const homeDist = this.nearestHomeDistance(bot);
    const budget =
      ai.config.loopSize * (1.85 + ai.config.aggression * 1.1) -
      bot.trail.length * 0.45;
    return (
      homeDist + interceptDist * 0.7 <= budget &&
      interceptDist <=
        enemyReturnDist * (1.28 + ai.config.aggression * 0.18) + 2
    );
  }

  private nearestHomeDistance(bot: PlayerState, point = bot.position): number {
    return dist(point, bot.territory.getNearestBoundaryPoint(point));
  }

  private smoothTurn(
    bot: PlayerState,
    target: Vec2,
    turnRate: number,
    dt: number,
  ): void {
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;

    const targetAngle = Math.atan2(dz, dx);
    const currentAngle = Math.atan2(bot.moveDir.z, bot.moveDir.x);
    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = turnRate * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
    const newAngle = currentAngle + turn;
    bot.moveDir = { x: Math.cos(newAngle), z: Math.sin(newAngle) };
    bot.hasInput = true;
  }

  private clampPointToArena(point: Vec2): Vec2 {
    const len = Math.sqrt(point.x * point.x + point.z * point.z);
    const maxR = MAP_RADIUS - 2;
    if (len <= maxR) return point;
    const scale = maxR / Math.max(len, 0.001);
    return { x: point.x * scale, z: point.z * scale };
  }

  private setBehavior(
    ai: BotAI,
    behavior: BotBehavior,
    targetPlayerId: number | null,
    targetPoint: Vec2 | null,
  ): void {
    ai.behavior = behavior;
    ai.targetPlayerId = targetPlayerId;
    ai.targetPoint = targetPoint;
  }

  private createBotConfig(): BotDifficultyConfig {
    const isAdventurous = Math.random() < 0.42;
    return {
      maxTrailLen: Math.max(
        10,
        Math.round(
          this.baseConfig.maxTrailLen *
            this.randomRange(0.84, isAdventurous ? 1.12 : 1.02),
        ),
      ),
      aggression: Math.max(
        0.08,
        Math.min(
          0.95,
          this.baseConfig.aggression +
            this.randomRange(isAdventurous ? -0.02 : -0.08, 0.18),
        ),
      ),
      loopSize: this.baseConfig.loopSize * this.randomRange(0.9, 1.16),
      turnRate: this.baseConfig.turnRate * this.randomRange(0.9, 1.08),
    };
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private getRetargetBaseSeconds(): number {
    return this.isMobile ? MOBILE_RETARGET_BASE_SECONDS : RETARGET_BASE_SECONDS;
  }

  private getAttackScanRadiusSq(): number {
    return this.isMobile ? ATTACK_SCAN_RADIUS_SQ * 0.68 : ATTACK_SCAN_RADIUS_SQ;
  }

  private getDefenseScanRadiusSq(): number {
    return this.isMobile
      ? DEFENSE_SCAN_RADIUS_SQ * 0.72
      : DEFENSE_SCAN_RADIUS_SQ;
  }
}
