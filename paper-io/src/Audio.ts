import bgLoopCozyA from "./assets/bg-loop-cozy-a.mp3";
import bgLoopCozyB from "./assets/bg-loop-cozy-b.mp3";
import captureSfxUrl from "./assets/capture.mp3";
import deathSplatSfxUrl from "./assets/death-splat.mp3";
import killConfirmSfxUrl from "./assets/kill-confirm-magical.mp3";
import scoreMilestoneSfxUrl from "./assets/sfx_A_sat_20260315_222942.mp3";
import uiClickSfxUrl from "./assets/sfx_A_lou_20260315_221950.mp3";
import { oasiz } from "@oasiz/sdk";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private settings: Settings;
  private userInteracted = false;
  private lastUiTapAt = 0;
  private musicTracks: HTMLAudioElement[] = [];
  private activeMusicIndex = 0;
  private activeMusic: HTMLAudioElement | null = null;
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private readonly sampleLoadPromises = new Map<string, Promise<AudioBuffer>>();
  private readonly activeSampleSources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.settings = this.loadSettings();
    this.initSettingsUI();
    this.bindGlobalUiFeedback();
    this.bindLifecycle();
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem("paperio-settings");
    return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("paperio-settings", JSON.stringify(this.settings));
  }

  private initSettingsUI(): void {
    const musicToggle = document.getElementById("music-toggle");
    const fxToggle = document.getElementById("fx-toggle");
    const hapticsToggle = document.getElementById("haptics-toggle");
    const musicState = document.getElementById("music-state");
    const fxState = document.getElementById("fx-state");
    const hapticsState = document.getElementById("haptics-state");

    const updateUI = () => {
      musicToggle?.classList.toggle("active", this.settings.music);
      fxToggle?.classList.toggle("active", this.settings.fx);
      hapticsToggle?.classList.toggle("active", this.settings.haptics);
      if (musicState)
        musicState.textContent = this.settings.music ? "On" : "Off";
      if (fxState) fxState.textContent = this.settings.fx ? "On" : "Off";
      if (hapticsState)
        hapticsState.textContent = this.settings.haptics ? "On" : "Off";
    };

    updateUI();

    const bindToggle = (
      element: HTMLElement | null,
      apply: () => void,
      forceFx = false,
    ): void => {
      element?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        if (now - this.lastUiTapAt < 300) return;
        this.lastUiTapAt = now;
        this.markUserInteraction();
        apply();
        this.saveSettings();
        updateUI();
        this.uiButtonClick(forceFx);
      });
    };

    bindToggle(
      musicToggle,
      () => {
        this.settings.music = !this.settings.music;
        if (this.settings.music) this.startMusic();
        else this.stopMusic(true);
      },
      true,
    );

    bindToggle(
      fxToggle,
      () => {
        this.settings.fx = !this.settings.fx;
      },
      true,
    );

    bindToggle(
      hapticsToggle,
      () => {
        this.settings.haptics = !this.settings.haptics;
      },
      true,
    );
  }

  triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    if (!this.settings.haptics) return;
    oasiz.triggerHaptic(type);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.18;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.56;
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private ensureMusicTracks(): void {
    if (this.musicTracks.length > 0) return;
    const urls = [bgLoopCozyA, bgLoopCozyB];
    this.musicTracks = urls.map((url, index) => {
      const track = new window.Audio(url);
      track.preload = "auto";
      track.volume = 0.22;
      track.addEventListener("ended", () => {
        if (this.activeMusic !== track) return;
        this.activeMusicIndex = (index + 1) % this.musicTracks.length;
        this.activeMusic = null;
        this.startMusic();
      });
      return track;
    });
  }

  private markUserInteraction(): void {
    this.userInteracted = true;
    this.ensureCtx();
    void this.preloadSamples();
    this.ensureMusicTracks();
    this.startMusic();
  }

  private bindLifecycle(): void {
    const prime = (): void => {
      this.markUserInteraction();
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, { passive: true });
    window.addEventListener("keydown", prime);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopActiveSamples();
        this.stopMusic(false);
        if (this.ctx && this.ctx.state === "running") {
          void this.ctx.suspend();
        }
        return;
      }

      if (this.userInteracted) {
        this.ensureCtx();
        this.startMusic();
      }
    });

    oasiz.onPause(() => {
      this.stopActiveSamples();
      this.stopMusic(false);
      if (this.ctx && this.ctx.state === "running") {
        void this.ctx.suspend();
      }
    });

    oasiz.onResume(() => {
      if (this.userInteracted) {
        this.ensureCtx();
        this.startMusic();
      }
    });
  }

  private bindGlobalUiFeedback(): void {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest("button");
        if (!button) return;

        const id = button.id;
        if (
          id === "music-toggle" ||
          id === "fx-toggle" ||
          id === "haptics-toggle"
        ) {
          return;
        }
        this.markUserInteraction();
        this.uiButtonClick(true);
      },
      true,
    );
  }

  private playTone(
    waveform: OscillatorType,
    frequencies: number[],
    durationMs: number,
    gain: number,
  ): void {
    if (!this.settings.fx) return;
    const ctx = this.ensureCtx();
    if (!this.masterGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = waveform;
    osc.frequency.value = frequencies[0];

    if (frequencies.length > 1) {
      const stepTime = durationMs / 1000 / frequencies.length;
      for (let i = 1; i < frequencies.length; i++) {
        osc.frequency.linearRampToValueAtTime(
          frequencies[i],
          ctx.currentTime + stepTime * (i + 1),
        );
      }
    }

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gain),
      ctx.currentTime + 0.015,
    );
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + durationMs / 1000,
    );

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  startMusic(): void {
    if (!this.settings.music || !this.userInteracted || document.hidden) return;
    this.ensureMusicTracks();
    if (this.musicTracks.length === 0) return;

    const nextTrack = this.musicTracks[this.activeMusicIndex];
    if (this.activeMusic === nextTrack && !nextTrack.paused) return;

    if (this.activeMusic && this.activeMusic !== nextTrack) {
      this.activeMusic.pause();
    }

    this.activeMusic = nextTrack;
    this.activeMusic.volume = 0.22;
    void this.activeMusic.play().catch(() => {
      // Ignore autoplay-related failures until the next user gesture.
    });
  }

  stopMusic(resetTimeline = false): void {
    if (!this.activeMusic) {
      if (resetTimeline) {
        this.activeMusicIndex = 0;
        for (const track of this.musicTracks) track.currentTime = 0;
      }
      return;
    }

    this.activeMusic.pause();
    if (resetTimeline) {
      for (const track of this.musicTracks) {
        track.currentTime = 0;
      }
      this.activeMusicIndex = 0;
      this.activeMusic = null;
    }
  }

  private async ensureSampleBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.sampleBuffers.get(url);
    if (cached) return cached;

    const inflight = this.sampleLoadPromises.get(url);
    if (inflight) return inflight;

    const promise = (async () => {
      const ctx = this.ensureCtx();
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      this.sampleBuffers.set(url, decoded);
      this.sampleLoadPromises.delete(url);
      return decoded;
    })().catch((error) => {
      this.sampleLoadPromises.delete(url);
      throw error;
    });

    this.sampleLoadPromises.set(url, promise);
    return promise;
  }

  private async preloadSamples(): Promise<void> {
    const urls = [
      uiClickSfxUrl,
      captureSfxUrl,
      deathSplatSfxUrl,
      killConfirmSfxUrl,
      scoreMilestoneSfxUrl,
    ];
    await Promise.allSettled(urls.map((url) => this.ensureSampleBuffer(url)));
  }

  private playOneShotSample(
    url: string,
    volume: number,
    forceFx = false,
  ): void {
    if (!forceFx && !this.settings.fx) return;
    const play = (buffer: AudioBuffer): void => {
      const ctx = this.ensureCtx();
      if (!this.masterGain) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.masterGain);
      this.activeSampleSources.add(source);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.activeSampleSources.delete(source);
      };
      source.start();
    };

    const cached = this.sampleBuffers.get(url);
    if (cached) {
      play(cached);
      return;
    }

    void this.ensureSampleBuffer(url)
      .then((buffer) => {
        if (!forceFx && !this.settings.fx) return;
        play(buffer);
      })
      .catch(() => {
        // Ignore one-shot load failures to avoid blocking gameplay.
      });
  }

  private stopActiveSamples(): void {
    for (const source of this.activeSampleSources) {
      try {
        source.stop();
      } catch {
        // Source may already be stopping/ended.
      }
    }
    this.activeSampleSources.clear();
  }

  private playUiClickSample(forceFx = false): void {
    this.playOneShotSample(uiClickSfxUrl, 0.68, forceFx);
  }

  uiButtonClick(forceFx = false): void {
    this.playUiClickSample(forceFx);
    this.triggerHaptic("light");
  }

  trailTick(): void {
    this.playTone("square", [220], 30, 0.05);
  }

  territoryCaptured(): void {
    this.playTone("sine", [440, 660], 120, 0.15);
  }

  captureBubbleBurst(): void {
    this.playOneShotSample(captureSfxUrl, 0.58);
    this.triggerHaptic("success");
  }

  killConfirm(): void {
    if (!this.settings.fx) {
      this.triggerHaptic("medium");
      return;
    }
    this.playOneShotSample(killConfirmSfxUrl, 0.94);
    this.triggerHaptic("medium");
  }

  deathSplat(): void {
    this.playOneShotSample(deathSplatSfxUrl, 0.62);
  }

  playerDeath(): void {
    if (!this.settings.fx) {
      this.triggerHaptic("error");
      return;
    }
    this.deathSplat();
    this.triggerHaptic("error");
  }

  enemyDeath(): void {
    // Enemy-only deaths intentionally stay silent.
  }

  gameOverLose(): void {
    if (!this.settings.fx) {
      this.triggerHaptic("error");
      return;
    }
    this.playTone("sine", [392, 294, 220, 164.81], 520, 0.12);
    this.triggerHaptic("error");
  }

  scoreMilestone(): void {
    if (!this.settings.fx) {
      this.triggerHaptic("success");
      return;
    }
    this.playOneShotSample(scoreMilestoneSfxUrl, 0.64);
    this.triggerHaptic("success");
  }
}
