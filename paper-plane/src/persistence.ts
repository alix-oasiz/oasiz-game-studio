// ============= PERSISTENCE =============
// Save / load game progression through the Oasiz SDK.
// Version history: 1 = initial, 2 = roundBests flat, 3 = rounds+progression+checkpoint

import { oasiz } from "@oasiz/sdk";
import { UpgradeTree, createEmptyUpgradeTree } from "./upgrades";
import { UltimateLevelMap, createEmptyUltimateLevelMap } from "./abilities";

export const SAVE_VERSION = 3;

export interface RoundData {
  bossType: string;
  defeated: boolean;
  unlocked: boolean;
  bestScore: number;
  lastScore: number;
  completedAt?: string;
}

export interface PaperPlaneSaveBuild {
  upgrades: UpgradeTree;
  pierceBonus: number;
  maxLivesBonus: number;
  ultimateLevels: UltimateLevelMap;
  permanentStatBoost: number;
  postHitInvincibilityBonus: number;
}

export interface PaperPlaneCheckpoint {
  roundNumber: number;
  totalUpgradesSpent: number;
}

export interface PaperPlaneProgression {
  defeatedBossRounds: number[];
  highestDefeatedRound: number;
  highestUnlockedRound: number;
}

export interface PaperPlaneSaveState {
  version: number;
  build: PaperPlaneSaveBuild;
  rounds: Record<string, RoundData>;
  checkpoint: PaperPlaneCheckpoint;
  progression: PaperPlaneProgression;
  selectedPlane: string;
}

export function createDefaultSaveBuild(): PaperPlaneSaveBuild {
  return {
    upgrades: createEmptyUpgradeTree(),
    pierceBonus: 0,
    maxLivesBonus: 0,
    ultimateLevels: createEmptyUltimateLevelMap(),
    permanentStatBoost: 0,
    postHitInvincibilityBonus: 0,
  };
}

export function createDefaultSaveState(): PaperPlaneSaveState {
  return {
    version: SAVE_VERSION,
    build: createDefaultSaveBuild(),
    rounds: {},
    checkpoint: { roundNumber: 1, totalUpgradesSpent: 0 },
    progression: {
      defeatedBossRounds: [],
      highestDefeatedRound: 0,
      highestUnlockedRound: 1,
    },
    selectedPlane: "dart",
  };
}

/** Returns the sum of all per-round best scores (leaderboard total). */
export function getLeaderboardTotalScore(state: PaperPlaneSaveState): number {
  return Object.values(state.rounds).reduce(
    (sum, r) => sum + (r.bestScore ?? 0),
    0,
  );
}

/** Load and migrate save state from the Oasiz SDK. */
export function loadSaveState(): PaperPlaneSaveState {
  const raw = oasiz.loadGameState() as Record<string, unknown>;

  // Empty save
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return createDefaultSaveState();
  }

  const version = typeof raw.version === "number" ? raw.version : 0;

  // v0 / v1 migration: discard incompatible data
  if (version < 2) {
    return createDefaultSaveState();
  }

  // v2 migration: had roundBests/highestUnlockedRound but no rounds/progression
  if (version === 2) {
    const state = createDefaultSaveState();

    const highestUnlockedRound =
      typeof raw.highestUnlockedRound === "number"
        ? raw.highestUnlockedRound
        : 0;
    state.progression.highestUnlockedRound = Math.max(
      1,
      highestUnlockedRound + 1,
    );
    state.progression.highestDefeatedRound = highestUnlockedRound;

    // Recover round bests
    if (raw.roundBests && typeof raw.roundBests === "object") {
      const bests = raw.roundBests as Record<string, unknown>;
      for (const [k, v] of Object.entries(bests)) {
        if (typeof v === "number" && v > 0) {
          const roundNum = parseInt(k, 10);
          state.rounds[k] = {
            bossType: "",
            defeated: true,
            unlocked: true,
            bestScore: v,
            lastScore: v,
          };
          if (
            !state.progression.defeatedBossRounds.includes(roundNum) &&
            roundNum <= highestUnlockedRound
          ) {
            state.progression.defeatedBossRounds.push(roundNum);
          }
        }
      }
      state.progression.defeatedBossRounds.sort((a, b) => a - b);
    }

    // Recover build
    const rawBuild =
      raw.build && typeof raw.build === "object"
        ? (raw.build as Record<string, unknown>)
        : {};
    state.build.upgrades = migrateUpgradeTree(rawBuild.upgrades);
    state.build.ultimateLevels = migrateUltimateLevels(rawBuild.ultimateLevels);

    return state;
  }

  // v3: current format — recover all fields
  const progression = migrateProgression(raw.progression);
  const checkpoint = migrateCheckpoint(raw.checkpoint);
  const rounds = migrateRounds(raw.rounds);
  const rawBuild =
    raw.build && typeof raw.build === "object"
      ? (raw.build as Record<string, unknown>)
      : {};
  const build = migrateBuild(rawBuild);
  const selectedPlane =
    typeof raw.selectedPlane === "string" ? raw.selectedPlane : "dart";

  return {
    version: SAVE_VERSION,
    build,
    rounds,
    checkpoint,
    progression,
    selectedPlane,
  };
}

/** Persist save state via the Oasiz SDK. */
export function persistSaveState(
  state: PaperPlaneSaveState,
  flush = false,
): void {
  oasiz.saveGameState(state as unknown as Record<string, unknown>);
  if (flush) oasiz.flushGameState();
}

// ─── Migration helpers ────────────────────────────────────────────────────────

function migrateUpgradeTree(raw: unknown): UpgradeTree {
  const base = createEmptyUpgradeTree();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const clamp = (v: unknown) =>
    typeof v === "number" ? Math.max(0, Math.min(5, Math.floor(v))) : 0;
  return {
    fireRate: clamp(r.fireRate),
    multiShot: clamp(r.multiShot),
    turrets: clamp(r.turrets),
    reinforcedHull: clamp(r.reinforcedHull),
    piercingRounds: clamp(r.piercingRounds),
    emergencyShielding: clamp(r.emergencyShielding),
  };
}

function migrateUltimateLevels(raw: unknown): UltimateLevelMap {
  const base = createEmptyUltimateLevelMap();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const clamp = (v: unknown) =>
    typeof v === "number" ? Math.max(0, Math.min(5, Math.floor(v))) : 0;
  return {
    shield: clamp(r.shield ?? r.paper_shield),
    blast: clamp(r.blast ?? r.ink_explosion),
    turbo: clamp(r.turbo ?? r.black_hole),
  };
}

function migrateRounds(raw: unknown): Record<string, RoundData> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, RoundData> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    result[k] = {
      bossType: typeof r.bossType === "string" ? r.bossType : "",
      defeated: Boolean(r.defeated),
      unlocked: Boolean(r.unlocked),
      bestScore: typeof r.bestScore === "number" ? r.bestScore : 0,
      lastScore: typeof r.lastScore === "number" ? r.lastScore : 0,
      completedAt:
        typeof r.completedAt === "string" ? r.completedAt : undefined,
    };
  }
  return result;
}

function migrateProgression(raw: unknown): PaperPlaneProgression {
  const base: PaperPlaneProgression = {
    defeatedBossRounds: [],
    highestDefeatedRound: 0,
    highestUnlockedRound: 1,
  };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const defeatedBossRounds = Array.isArray(r.defeatedBossRounds)
    ? (r.defeatedBossRounds as unknown[]).filter(
        (x): x is number => typeof x === "number",
      )
    : [];
  return {
    defeatedBossRounds,
    highestDefeatedRound:
      typeof r.highestDefeatedRound === "number" ? r.highestDefeatedRound : 0,
    highestUnlockedRound:
      typeof r.highestUnlockedRound === "number"
        ? r.highestUnlockedRound
        : Math.max(1, defeatedBossRounds.length),
  };
}

function migrateCheckpoint(raw: unknown): PaperPlaneCheckpoint {
  if (!raw || typeof raw !== "object")
    return { roundNumber: 1, totalUpgradesSpent: 0 };
  const r = raw as Record<string, unknown>;
  return {
    roundNumber:
      typeof r.roundNumber === "number" ? Math.max(1, r.roundNumber) : 1,
    totalUpgradesSpent:
      typeof r.totalUpgradesSpent === "number" ? r.totalUpgradesSpent : 0,
  };
}

function migrateBuild(raw: Record<string, unknown>): PaperPlaneSaveBuild {
  return {
    upgrades: migrateUpgradeTree(raw.upgrades),
    pierceBonus: typeof raw.pierceBonus === "number" ? raw.pierceBonus : 0,
    maxLivesBonus:
      typeof raw.maxLivesBonus === "number" ? raw.maxLivesBonus : 0,
    ultimateLevels: migrateUltimateLevels(raw.ultimateLevels),
    permanentStatBoost:
      typeof raw.permanentStatBoost === "number" ? raw.permanentStatBoost : 0,
    postHitInvincibilityBonus:
      typeof raw.postHitInvincibilityBonus === "number"
        ? raw.postHitInvincibilityBonus
        : 0,
  };
}
