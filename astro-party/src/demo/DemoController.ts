import type { Game } from "../Game";
import type { GamePhase, MapId } from "../types";
import { AudioManager } from "../AudioManager";

export type DemoState =
  | "IDLE"
  | "STARTING"
  | "ATTRACT"
  | "TUTORIAL"
  | "MENU"
  | "TEARING_DOWN"
  | "DONE";

export class DemoController {
  private static readonly BACKGROUND_GAMEPLAY_FX_VOLUME = 0.05;
  private state: DemoState = "IDLE";
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private game: Game) {}

  private applyDemoAudioMix(): void {
    const isBackgroundOnly =
      this.state === "STARTING" ||
      this.state === "ATTRACT" ||
      this.state === "MENU";
    AudioManager.setGameplayFxSuppressed(false);
    AudioManager.setGameplayFxVolumeMultiplier(
      isBackgroundOnly ? DemoController.BACKGROUND_GAMEPLAY_FX_VOLUME : 1,
    );
  }

  getState(): DemoState {
    return this.state;
  }

  isDemoActive(): boolean {
    return (
      this.state === "STARTING" ||
      this.state === "ATTRACT" ||
      this.state === "TUTORIAL" ||
      this.state === "MENU"
    );
  }

  async startDemo(): Promise<void> {
    if (this.state !== "IDLE") return;
    this.state = "STARTING";
    this.applyDemoAudioMix();

    this.game.setDemoSession(true);
    this.game.setSessionMode("local");

    await this.game.createRoom();

    // Make host AI-controlled so all 4 players are AI during attract
    this.game.setHostAI(true);

    // Add 3 AI bots (4 AI total)
    await this.game.addAIBot();
    await this.game.addAIBot();
    await this.game.addAIBot();

    // Use Repulse for attract/tutorial background play.
    this.game.setMap(3 as MapId);

    // Hide arena border (collision still active)
    this.game.setHideBorder(true);

    // Start the match
    this.game.startGame();

    this.state = "ATTRACT";
    this.applyDemoAudioMix();
  }

  enterTutorial(): void {
    if (this.state !== "ATTRACT" && this.state !== "MENU") return;
    this.state = "TUTORIAL";
    this.applyDemoAudioMix();

    // Show arena border in interactive tutorial
    this.game.setHideBorder(false);

    // Restore the host player to human control
    this.game.setHostAI(false);

    // Enable keyboard/touch input
    this.game.setKeyboardInputEnabled(true);

    // Freeze all bot ships — only the player's ship moves during tutorial
    const myId = this.game.getMyPlayerId();
    this.game.setDemoBotFreeze(myId);
  }

  /** Promote the tutorial session into a normal live match without teardown. */
  promoteToLiveMatch(): void {
    if (this.state !== "TUTORIAL") return;
    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.state = "DONE";
    this.game.setHideBorder(false);
    this.game.setSimPaused(false);
    this.game.setDemoBotFreeze(null);
    this.game.setHostAI(false);
    this.game.setKeyboardInputEnabled(true);
    this.game.setDemoSession(false);
    this.applyDemoAudioMix();
  }

  /** Pause simulation (while tutorial panel is showing dialogue). */
  pauseGame(): void {
    this.game.setSimPaused(true);
  }

  /** Resume simulation (during "try it" phases). */
  resumeGame(): void {
    this.game.setSimPaused(false);
  }

  /**
   * Transition to MENU state: return host to AI, keep game running in
   * background behind the start screen. Restore gameplay SFX.
   */
  enterMenu(): void {
    if (this.state !== "TUTORIAL" && this.state !== "ATTRACT") return;
    this.state = "MENU";
    this.game.setHideBorder(true);
    this.applyDemoAudioMix();

    // Unpause sim (in case we were paused during a tutorial step)
    this.game.setSimPaused(false);
    // Unfreeze bots (in case tutorial was active)
    this.game.setDemoBotFreeze(null);

    // Return host to AI so the background battle continues autonomously
    this.game.setHostAI(true);

    // Keep background gameplay SFX reduced while demo sim runs behind menu.
  }

  async teardown(): Promise<void> {
    if (
      this.state === "IDLE" ||
      this.state === "TEARING_DOWN" ||
      this.state === "DONE"
    )
      return;

    this.state = "TEARING_DOWN";

    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    // Restore gameplay SFX settings.
    AudioManager.setGameplayFxSuppressed(false);
    AudioManager.setGameplayFxVolumeMultiplier(1);

    // Restore border and unpause sim
    this.game.setHideBorder(false);
    this.game.setSimPaused(false);

    // Reset demo flag and leave game
    this.game.setDemoSession(false);
    await this.game.leaveGame();

    this.state = "DONE";
  }

  /** Called from main.ts onPhaseChange to react to game phase transitions. */
  onPhaseChange(phase: GamePhase): void {
    if (!this.isDemoActive()) return;

    if (phase === "GAME_END") {
      // Auto-restart the demo battle after a short delay
      this.restartTimeout = setTimeout(() => {
        this.restartTimeout = null;
        if (this.isDemoActive()) {
          this.game.continueMatchSequence();
          // Next sequence starts immediately in non-live demo contexts
        }
      }, 1500);
    }
  }
}

