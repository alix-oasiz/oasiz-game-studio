import { NetworkManager } from "../network/NetworkManager";
import { GamePhase, RoundResultPayload, GAME_CONFIG } from "../types";

export class GameFlowManager {
  phase: GamePhase = "START";
  countdown: number = 0;
  private countdownRemainingMs: number | null = null;
  private roundEndRemainingMs: number | null = null;
  countdownInterval: number | null = null; // Legacy field retained for compatibility
  winnerId: string | null = null;
  winnerName: string | null = null;
  currentRound: number = 1;
  roundWinnerId: string | null = null;
  roundWinnerName: string | null = null;
  roundIsTie: boolean = false;

  onPhaseChange: ((phase: GamePhase) => void) | null = null;
  onPlayersUpdate: (() => void) | null = null;
  onCountdownUpdate: ((count: number) => void) | null = null;
  onBeginMatch: (() => void) | null = null;
  onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  onResetRound: (() => void) | null = null;

  constructor(private network: NetworkManager) {}

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.onPhaseChange?.(phase);

    if (this.network.isHost()) {
      this.network.broadcastGamePhase(
        phase,
        phase === "GAME_END" ? (this.winnerId ?? undefined) : undefined,
        phase === "GAME_END" ? (this.winnerName ?? undefined) : undefined,
      );
    }
  }

  startGame(): void {
    if (!this.network.isHost()) return;
    if (this.phase !== "LOBBY") return;
    if (this.network.getPlayerCount() < 2) return;

    this.currentRound = 1;
    this.roundWinnerId = null;
    this.roundWinnerName = null;
    this.roundIsTie = false;

    this.startCountdown();
  }

  startCountdown(): void {
    this.setPhase("COUNTDOWN");
    this.countdownRemainingMs = GAME_CONFIG.COUNTDOWN_DURATION * 1000;
    this.roundEndRemainingMs = null;
    this.countdown = GAME_CONFIG.COUNTDOWN_DURATION;
    this.onCountdownUpdate?.(this.countdown);
    this.network.broadcastCountdown(this.countdown);
  }

  updateTimers(dtMs: number): void {
    if (!this.network.isHost()) return;

    if (this.phase === "COUNTDOWN" && this.countdownRemainingMs !== null) {
      this.countdownRemainingMs = Math.max(0, this.countdownRemainingMs - dtMs);
      const nextCount = Math.max(
        0,
        Math.ceil(this.countdownRemainingMs / 1000),
      );
      if (nextCount !== this.countdown) {
        this.countdown = nextCount;
        this.onCountdownUpdate?.(this.countdown);
        this.network.broadcastCountdown(this.countdown);
      }

      if (this.countdownRemainingMs <= 0) {
        this.countdownRemainingMs = null;
        this.onBeginMatch?.();
      }
    }

    if (this.phase === "ROUND_END" && this.roundEndRemainingMs !== null) {
      this.roundEndRemainingMs = Math.max(0, this.roundEndRemainingMs - dtMs);
      if (this.roundEndRemainingMs <= 0) {
        this.roundEndRemainingMs = null;
        if (this.phase !== "ROUND_END") return;
        this.currentRound += 1;
        this.onResetRound?.();
        this.startCountdown();
      }
    }
  }
}
