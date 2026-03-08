import crashSfx from "./sfx/crash.mp3";
import uiSfx from "./sfx/ui.mp3";
import collectSfx from "./sfx/collect.mp3";
import stealthOnSfx from "./sfx/stealth_on.mp3";
import stealthLoopSfx from "./sfx/stealth_loop.mp3";
import milestone1Sfx from "./sfx/milestone1.mp3";
import milestone2Sfx from "./sfx/milestone2.mp3";

const sfxUrls: Record<string, string> = {
  crash: crashSfx,
  ui: uiSfx,
  collect: collectSfx,
  stealth_on: stealthOnSfx,
  stealth_loop: stealthLoopSfx,
  milestone1: milestone1Sfx,
  milestone2: milestone2Sfx,
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers: Record<string, AudioBuffer> = {};

  constructor() {
    const initCtx = () => {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.loadBuffer("crash");
        this.loadBuffer("ui");
        this.loadBuffer("collect");
        this.loadBuffer("stealth_on");
        this.loadBuffer("stealth_loop");
        this.loadBuffer("milestone1");
        this.loadBuffer("milestone2");
      } catch (e) {
        console.warn("AudioContext not supported");
      }
    };

    initCtx();

    const unlock = () => {
      initCtx();
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("mousedown", unlock);
      document.removeEventListener("touchend", unlock);
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };

    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("mousedown", unlock, { once: true });
    document.addEventListener("touchend", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  }

  private async loadBuffer(name: string) {
    try {
      const resp = await fetch(sfxUrls[name]);
      const arrayBuffer = await resp.arrayBuffer();
      if (this.ctx) {
        this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
      }
    } catch (e) {
      console.warn("Failed to load audio:", name);
    }
  }

  private playSound(name: string, volume: number = 0.5): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    const buffer = this.buffers[name];
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(0);
    return source;
  }

  crash(): void {
    this.playSound("crash", 0.6);
  }

  ui(): void {
    this.playSound("ui", 0.4);
  }

  collect(): void {
    this.playSound("collect", 0.5);
  }

  stealthOn(): void {
    this.playSound("stealth_on", 0.7);
  }

  private milestoneIdx = 0;
  milestone(): void {
    const name = this.milestoneIdx % 2 === 0 ? "milestone1" : "milestone2";
    this.milestoneIdx++;
    this.playSound(name, 0.7);
  }

  private stealthLoopSource: AudioBufferSourceNode | null = null;

  stealthLoopStart(): void {
    if (this.stealthLoopSource) {
      try { this.stealthLoopSource.stop(); } catch (_) {}
    }
    this.stealthLoopSource = this.playSound("stealth_loop", 0.6);
    if (this.stealthLoopSource) {
      this.stealthLoopSource.loop = true;
    }
  }

  stealthLoopStop(): void {
    if (this.stealthLoopSource) {
      try { this.stealthLoopSource.stop(); } catch (_) {}
      this.stealthLoopSource = null;
    }
  }

  /* ── Background music (dual-track crossfade) ── */

  private static readonly BGM_URLS = [
    "sfx/Orbiting The Unknown.mp3",
    "sfx/Orbiting The Unknown 2.mp3",
  ];
  private audioA: HTMLAudioElement | null = null;
  private audioB: HTMLAudioElement | null = null;
  private activeAudio: "A" | "B" = "A";
  private crossfadeTimer: number | null = null;
  private isMusicEnabled = false;
  private readonly MAX_VOL = 0.35;
  private readonly CROSSFADE_TIME = 3.0;

  musicOn(): void {
    this.isMusicEnabled = true;
    if (!this.audioA) {
      this.audioA = new Audio(AudioManager.BGM_URLS[0]);
      this.audioB = new Audio(AudioManager.BGM_URLS[1]);

      this.setupTimeUpdate(this.audioA, "B");
      this.setupTimeUpdate(this.audioB, "A");
    }

    const active = this.activeAudio === "A" ? this.audioA : this.audioB;
    if (active) {
      active.volume = this.MAX_VOL;
      active.play().catch(() => {});
    }
  }

  private setupTimeUpdate(audio: HTMLAudioElement, nextAudioKey: "A" | "B"): void {
    audio.addEventListener("timeupdate", () => {
      if (!this.isMusicEnabled) return;
      if (audio.duration && audio.currentTime >= audio.duration - this.CROSSFADE_TIME) {
        if (!this.crossfadeTimer) {
          this.startCrossfade(audio, nextAudioKey);
        }
      }
    });
  }

  private startCrossfade(fadingOutAudio: HTMLAudioElement, nextAudioKey: "A" | "B"): void {
    const nextAudio = nextAudioKey === "A" ? this.audioA : this.audioB;
    if (!nextAudio) return;

    nextAudio.currentTime = 0;
    nextAudio.volume = 0;
    nextAudio.play().catch(() => {});

    const steps = 30;
    const interval = (this.CROSSFADE_TIME * 1000) / steps;
    let step = 0;

    this.crossfadeTimer = window.setInterval(() => {
      step++;
      const progress = step / steps;
      fadingOutAudio.volume = Math.max(0, this.MAX_VOL * (1 - progress));
      nextAudio.volume = Math.min(this.MAX_VOL, this.MAX_VOL * progress);

      if (step >= steps) {
        this.clearCrossfade();
        fadingOutAudio.pause();
        fadingOutAudio.currentTime = 0;
        this.activeAudio = nextAudioKey;
      }
    }, interval);
  }

  private clearCrossfade(): void {
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
  }

  musicOff(): void {
    this.isMusicEnabled = false;
    this.clearCrossfade();
    if (this.audioA) {
      this.audioA.pause();
      this.audioA.currentTime = 0;
    }
    if (this.audioB) {
      this.audioB.pause();
      this.audioB.currentTime = 0;
    }
  }
}
