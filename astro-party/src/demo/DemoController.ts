import type { Game } from "../Game";
import type { GamePhase, MapId } from "../types";
import { AudioManager } from "../AudioManager";

export type DemoState =
  | "IDLE"
  | "STARTING"
  | "ATTRACT"
  | "TUTORIAL"
  | "FREEPLAY"
  | "MENU"
  | "TEARING_DOWN"
  | "DONE";

export class DemoController {
  private static readonly BACKGROUND_GAMEPLAY_FX_VOLUME = 0.05;
  private state: DemoState = "IDLE";
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  // Respawn monitoring (demo-only)
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private respawnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Stale pilot cleanup (demo-only)
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly PILOT_MAX_AGE_MS = 20_000; // 20 seconds

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
      this.state === "FREEPLAY" ||
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

    // Set to demo map (hidden from picker)
    this.game.setMap(6 as MapId);

    // Hide arena border (collision still active)
    this.game.setHideBorder(true);

    // Start the match
    this.game.startGame();

    // Skip the countdown so ships move immediately (COUNTDOWN phase skip
    // is also handled generically in onPhaseChange, but do it here too)
    setTimeout(() => {
      this.game.skipDemoCountdown();
    }, 50);

    // Start monitoring for dead players to respawn them
    this.startRespawnMonitor();
    this.startCleanupInterval();

    this.state = "ATTRACT";
    this.applyDemoAudioMix();
  }

  enterTutorial(): void {
    if (this.state !== "ATTRACT") return;
    this.state = "TUTORIAL";
    this.applyDemoAudioMix();

    // Restore the host player to human control
    this.game.setHostAI(false);

    // Enable keyboard/touch input
    this.game.setKeyboardInputEnabled(true);
  }

  /** Player finished tutorial and is now free-playing the demo. */
  enterFreePlay(): void {
    if (this.state !== "TUTORIAL") return;
    this.state = "FREEPLAY";
    this.applyDemoAudioMix();
    // Sim was paused for the "You're ready!" panel — resume it
    this.game.setSimPaused(false);
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
    if (
      this.state !== "TUTORIAL" &&
      this.state !== "ATTRACT" &&
      this.state !== "FREEPLAY"
    )
      return;
    this.state = "MENU";
    this.applyDemoAudioMix();

    // Unpause sim (in case we were paused during a tutorial step)
    this.game.setSimPaused(false);

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

    this.stopRespawnMonitor();
    this.stopCleanupInterval();

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

    if (phase === "COUNTDOWN") {
      // Skip the 3-2-1 countdown for every round in demo mode
      setTimeout(() => {
        if (this.isDemoActive()) this.game.skipDemoCountdown();
      }, 50);
    }

    if (phase === "ROUND_END") {
      // New round incoming — clear stale respawn timers (ships will
      // respawn naturally via spawnAllShips when the new round begins)
      this.clearRespawnTimers();
    }

    if (phase === "GAME_END") {
      this.clearRespawnTimers();
      // Auto-restart the demo battle after a short delay
      this.restartTimeout = setTimeout(() => {
        this.restartTimeout = null;
        if (this.isDemoActive()) {
          this.game.continueMatchSequence();
          // Countdown will be skipped via onPhaseChange("COUNTDOWN")
        }
      }, 1500);
    }
  }

  // ---------------------------------------------------------------------------
  // Respawn monitoring — demo only
  // ---------------------------------------------------------------------------

  private startRespawnMonitor(): void {
    if (this.monitorInterval !== null) return;
    this.monitorInterval = setInterval(() => {
      this.checkAndScheduleRespawns();
    }, 500);
  }

  private stopRespawnMonitor(): void {
    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.clearRespawnTimers();
  }

  private clearRespawnTimers(): void {
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval !== null) return;
    // Run cleanup every 10 seconds
    this.cleanupInterval = setInterval(() => {
      if (this.isDemoActive()) {
        this.game.demoCleanupStalePilots(DemoController.PILOT_MAX_AGE_MS);
      }
    }, 10_000);
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private checkAndScheduleRespawns(): void {
    if (!this.isDemoActive()) return;
    if (this.game.getPhase() !== "PLAYING") return;

    const players = this.game.getPlayers();
    for (const player of players) {
      if (
        player.state === "SPECTATING" &&
        !this.respawnTimers.has(player.id)
      ) {
        // Respawn after 5–8 s (random spread so ships don't all pop at once)
        const delayMs = 5000 + Math.random() * 3000;
        const timer = setTimeout(() => {
          this.respawnTimers.delete(player.id);
          if (this.isDemoActive() && this.game.getPhase() === "PLAYING") {
            this.game.demoRespawnPlayer(player.id);
          }
        }, delayMs);
        this.respawnTimers.set(player.id, timer);
      }
    }
  }
}
