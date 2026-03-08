export type ScoreEventType =
  | "SHIP_DESTROY"
  | "PILOT_KILL"
  | "ROUND_WIN"
  | "GAME_WIN";

export type ScoreEligibleBotType = "ai" | "local";

interface ScoreRulesConfig {
  pointsByEvent: Record<ScoreEventType, number>;
  submission: {
    requireEligibleBotInLobby: boolean;
    eligibleBotTypes: ScoreEligibleBotType[];
    blockWhenDebugSessionTainted: boolean;
  };
}

// Centralized scoring and score-sharing policy.
export const SCORE_RULES: ScoreRulesConfig = {
  pointsByEvent: {
    SHIP_DESTROY: 5,
    PILOT_KILL: 20,
    ROUND_WIN: 50,
    GAME_WIN: 100,
  },
  submission: {
    requireEligibleBotInLobby: true,
    eligibleBotTypes: ["ai"],
    blockWhenDebugSessionTainted: true,
  },
};

export function getScoreAwardForEvent(event: ScoreEventType): number {
  const configured = SCORE_RULES.pointsByEvent[event];
  if (!Number.isFinite(configured)) return 0;
  return Math.max(0, Math.floor(configured));
}

export function isScoreSubmissionEligibleBotType(
  botType: string | null | undefined,
): boolean {
  if (botType !== "ai" && botType !== "local") return false;
  return SCORE_RULES.submission.eligibleBotTypes.includes(botType);
}

export function shouldSubmitScoreToPlatform(
  hasEligibleBotInLobby: boolean,
  debugSessionTainted: boolean = false,
  sessionMode: "online" | "local" = "online",
): boolean {
  if (
    SCORE_RULES.submission.blockWhenDebugSessionTainted &&
    debugSessionTainted
  ) {
    return false;
  }
  // Online sessions always submit once debug policy allows it.
  if (sessionMode === "online") return true;
  if (!SCORE_RULES.submission.requireEligibleBotInLobby) return true;
  return hasEligibleBotInLobby;
}
