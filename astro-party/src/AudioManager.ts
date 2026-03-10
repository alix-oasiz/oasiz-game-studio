// ============= AUDIO MANAGER =============
// Handles all game audio using Tone.js, respects SettingsManager

import * as Tone from "tone";
import { SettingsManager } from "./SettingsManager";

class AudioManagerClass {
  private initialized = false;

  // Sound effect synths
  private fireSynth: Tone.Synth | null = null;
  private explosionSynth: Tone.NoiseSynth | null = null;
  private hitSynth: Tone.MembraneSynth | null = null;
  private dashSynth: Tone.Synth | null = null;
  private countdownSynth: Tone.Synth | null = null;
  private fightSynth: Tone.PolySynth | null = null;
  private winSynth: Tone.PolySynth | null = null;
  private killSynth: Tone.PolySynth | null = null;
  private respawnSynth: Tone.Synth | null = null;
  private uiClickSynth: Tone.Synth | null = null;

  // Background music (placeholder - can be replaced with actual audio file)
  private bgMusic: HTMLAudioElement | null = null;

  constructor() {
    // Defer initialization until first user interaction (required by browsers)
  }

  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Start Tone.js audio context (requires user gesture)
      if (Tone.getContext().state !== "running") {
        await Tone.start();
      }

      this.initSynths();
      this.initialized = true;
      console.log("[AudioManager] Initialized");
      return true;
    } catch (e) {
      console.log("[AudioManager] Failed to initialize:", e);
      return false;
    }
  }

  // Helper to safely trigger sounds (Tone.js throws on rapid triggers)
  private safeTrigger(fn: () => void): void {
    try {
      fn();
    } catch {
      // Ignore Tone.js timing errors - sounds still play
    }
  }

  private initSynths(): void {
    // Fire/shoot sound - sharp laser
    this.fireSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination();
    this.fireSynth.volume.value = -15;

    // Explosion sound - noise burst
    this.explosionSynth = new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.2 },
    }).toDestination();
    this.explosionSynth.volume.value = -10;

    // Hit/damage sound - thump
    this.hitSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
    }).toDestination();
    this.hitSynth.volume.value = -12;

    // Dash sound - whoosh
    this.dashSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
    }).toDestination();
    this.dashSynth.volume.value = -18;

    // Countdown beep
    this.countdownSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
    }).toDestination();
    this.countdownSynth.volume.value = -12;

    // Fight! fanfare
    this.fightSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.3 },
    }).toDestination();
    this.fightSynth.volume.value = -8;

    // Win fanfare
    this.winSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.5 },
    }).toDestination();
    this.winSynth.volume.value = -6;

    // Kill confirmation
    this.killSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.2 },
    }).toDestination();
    this.killSynth.volume.value = -10;

    // Respawn sound
    this.respawnSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.1, release: 0.3 },
    }).toDestination();
    this.respawnSynth.volume.value = -12;

    // UI click
    this.uiClickSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 },
    }).toDestination();
    this.uiClickSynth.volume.value = -15;
  }

  // ============= SOUND EFFECTS =============

  async playFire(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.fireSynth?.triggerAttackRelease("C6", "16n", now);
    });
  }

  async playExplosion(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.explosionSynth?.triggerAttackRelease("8n");
    });
  }

  async playHit(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.hitSynth?.triggerAttackRelease("C2", "8n");
    });
  }

  async playDash(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.dashSynth?.triggerAttackRelease("C4", "16n", now);
      this.dashSynth?.triggerAttackRelease("G4", "16n", now + 0.05);
    });
  }

  async playCountdown(count: number): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    if (count > 0) {
      this.safeTrigger(() => {
        this.countdownSynth?.triggerAttackRelease("C5", "8n");
      });
    }
  }

  async playFight(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.fightSynth?.triggerAttackRelease(["C4", "E4", "G4"], "8n", now);
      this.fightSynth?.triggerAttackRelease(
        ["C5", "E5", "G5"],
        "4n",
        now + 0.15,
      );
    });
  }

  async playWin(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.winSynth?.triggerAttackRelease(["C4", "E4", "G4"], "4n", now);
      this.winSynth?.triggerAttackRelease(["C5", "E5", "G5"], "4n", now + 0.3);
      this.winSynth?.triggerAttackRelease(["E5", "G5", "C6"], "2n", now + 0.6);
    });
  }

  async playKill(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.killSynth?.triggerAttackRelease("E5", "16n", now);
      this.killSynth?.triggerAttackRelease("G5", "16n", now + 0.05);
      this.killSynth?.triggerAttackRelease("C6", "8n", now + 0.1);
    });
  }

  async playRespawn(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.respawnSynth?.triggerAttackRelease("C4", "8n", now);
      this.respawnSynth?.triggerAttackRelease("E4", "8n", now + 0.1);
      this.respawnSynth?.triggerAttackRelease("G4", "8n", now + 0.2);
    });
  }

  async playUIClick(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.uiClickSynth?.triggerAttackRelease("C5", "32n");
    });
  }

  async playPilotEject(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.dashSynth?.triggerAttackRelease("G3", "16n", now);
      this.dashSynth?.triggerAttackRelease("E3", "16n", now + 0.05);
      this.dashSynth?.triggerAttackRelease("C3", "8n", now + 0.1);
    });
  }

  async playPilotDeath(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.hitSynth?.triggerAttackRelease("E3", "8n", now);
      this.hitSynth?.triggerAttackRelease("C3", "8n", now + 0.1);
    });
  }

  // ============= BACKGROUND MUSIC =============

  async startMusic(): Promise<void> {
    if (!SettingsManager.shouldPlayMusic()) return;

    // Background music would be loaded from an asset URL
    // For now, this is a placeholder - can be replaced with actual music file
    // Example: this.bgMusic = new Audio("https://assets.oasiz.ai/audio/astro-party-theme.mp3");

    if (this.bgMusic) {
      this.bgMusic.loop = true;
      this.bgMusic.volume = 0.3;
      try {
        await this.bgMusic.play();
      } catch (e) {
        console.log("[AudioManager] Music play failed:", e);
      }
    }
  }

  stopMusic(): void {
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic.currentTime = 0;
    }
  }

  // Update music state based on settings
  updateMusicState(isPlaying: boolean): void {
    if (isPlaying && SettingsManager.shouldPlayMusic()) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  // ============= CLEANUP =============

  destroy(): void {
    this.stopMusic();

    // Dispose synths
    this.fireSynth?.dispose();
    this.explosionSynth?.dispose();
    this.hitSynth?.dispose();
    this.dashSynth?.dispose();
    this.countdownSynth?.dispose();
    this.fightSynth?.dispose();
    this.winSynth?.dispose();
    this.killSynth?.dispose();
    this.respawnSynth?.dispose();
    this.uiClickSynth?.dispose();

    this.initialized = false;
    console.log("[AudioManager] Destroyed");
  }
}

// Export singleton instance
export const AudioManager = new AudioManagerClass();
