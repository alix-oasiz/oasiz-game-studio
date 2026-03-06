export interface SoundSettings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export interface LandingSoundDebugInfo {
  played: boolean;
  reason: string;
  clipId: string;
  clipDurationSeconds: number;
  playbackRate: number;
  gain: number;
  impact: number;
}

export class SoundManager {
  private audioCtx: AudioContext | null = null;
  private rollingSource: AudioBufferSourceNode | null = null;
  private rollingBuffer: AudioBuffer | null = null;
  private pendingRollingStart = false;
  private rollingGain: GainNode | null = null;
  private rollingFilter: BiquadFilterNode | null = null;
  private impactBuffers: AudioBuffer[] = [];
  private bouncerBoingBuffer: AudioBuffer | null = null;
  private lastBouncerBoingTime = -999;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffers: AudioBuffer[] = [];
  private currentMusicTrackIndex: number | null = null;
  private pendingRandomTrackStart = false;
  private initialized = false;
  private readonly musicTrackPaths = [
    "/assets/sky-rider.mp3",
    "/assets/playthrough-in-pastel.mp3",
    "/assets/playthrough-in-pastel-alt.mp3",
    "/assets/soft-corners-sharp-focus.mp3",
    "/assets/soft-corners-sharp-focus-alt.mp3",
  ];
  private readonly rollingLoopPath = "/assets/marble-roll-loop.mp3";
  private readonly impactTrackPaths = [
    "/assets/marble-impact-1.mp3",
    "/assets/marble-impact-2.mp3",
  ];
  private readonly bouncerBoingPath = "/assets/purple-bouncer-boing.mp3";

  constructor(private getSettings: () => SoundSettings) {}

  public init(): void {
    if (this.initialized) return;
    try {
      this.audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      this.setupContinuousSounds();
      this.loadRollingLoop();
      this.loadImpactTracks();
      this.loadBouncerBoing();
      this.loadMusicTracks();
      this.initialized = true;
      console.log("[SoundManager] Initialized");
    } catch (e) {
      console.error("[SoundManager] Failed to init AudioContext", e);
    }
  }

  private async loadMusicTracks(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      const decoded: AudioBuffer[] = [];
      for (const path of this.musicTrackPaths) {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        decoded.push(audioBuffer);
      }
      this.musicBuffers = decoded;
      console.log(
        "[SoundManager]",
        "Loaded music tracks count=" + String(this.musicBuffers.length),
      );
      if (this.pendingRandomTrackStart || this.currentMusicTrackIndex === null) {
        this.pendingRandomTrackStart = false;
        this.startRandomRunTrack();
      } else {
        this.startTrack(this.currentMusicTrackIndex);
      }
    } catch (e) {
      console.error("[SoundManager] Failed to load music tracks", e);
    }
  }

  private ensureMusicGain(): void {
    if (!this.audioCtx || this.musicGain) return;
    this.musicGain = this.audioCtx.createGain();
    this.musicGain.gain.value = this.getSettings().music ? 0.35 : 0;
    this.musicGain.connect(this.audioCtx.destination);
  }

  private startTrack(trackIndex: number): void {
    if (!this.audioCtx || this.musicBuffers.length === 0) return;
    if (trackIndex < 0 || trackIndex >= this.musicBuffers.length) return;

    this.ensureMusicGain();
    if (!this.musicGain) return;

    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        console.log("[SoundManager]", "Previous music source already stopped");
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }

    this.musicSource = this.audioCtx.createBufferSource();
    this.musicSource.buffer = this.musicBuffers[trackIndex];
    this.musicSource.loop = true;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0);
    this.currentMusicTrackIndex = trackIndex;
    console.log("[SoundManager]", "Now playing track index=" + String(trackIndex));
  }

  private startRandomRunTrack(): void {
    if (this.musicBuffers.length === 0) {
      this.pendingRandomTrackStart = true;
      return;
    }
    const randomIndex = Math.floor(Math.random() * this.musicBuffers.length);
    this.startTrack(randomIndex);
  }

  public onRunStart(): void {
    if (this.currentMusicTrackIndex === null) {
      this.startRandomRunTrack();
      return;
    }
    if (!this.musicSource) {
      this.startTrack(this.currentMusicTrackIndex);
    }
  }

  public advanceToNextTrack(): void {
    if (this.musicBuffers.length === 0) {
      this.pendingRandomTrackStart = false;
      return;
    }
    const nextTrack =
      this.currentMusicTrackIndex === null
        ? 0
        : (this.currentMusicTrackIndex + 1) % this.musicBuffers.length;
    this.startTrack(nextTrack);
  }

  public updateMusicState(): void {
    if (!this.audioCtx || !this.musicGain) return;
    const targetGain = this.getSettings().music ? 0.35 : 0;
    this.musicGain.gain.setTargetAtTime(
      targetGain,
      this.audioCtx.currentTime,
      0.2,
    );
  }

  public resume(): void {
    if (this.audioCtx?.state === "suspended") {
      void this.audioCtx.resume();
    }
    this.ensureRollingSource();
    this.updateMusicState();
    if (this.currentMusicTrackIndex !== null && !this.musicSource) {
      this.startTrack(this.currentMusicTrackIndex);
    }
  }

  public pause(): void {
    if (!this.audioCtx) {
      return;
    }
    const t = this.audioCtx.currentTime;
    if (this.rollingGain) {
      this.rollingGain.gain.setTargetAtTime(0, t, 0.05);
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0, t, 0.05);
    }
    if (this.audioCtx.state === "running") {
      void this.audioCtx.suspend();
    }
  }

  private setupContinuousSounds(): void {
    if (!this.audioCtx) return;

    this.rollingFilter = this.audioCtx.createBiquadFilter();
    this.rollingFilter.type = "lowpass";
    this.rollingFilter.frequency.value = 900;

    this.rollingGain = this.audioCtx.createGain();
    this.rollingGain.gain.value = 0;

    this.rollingFilter.connect(this.rollingGain);
    this.rollingGain.connect(this.audioCtx.destination);
  }

  private async loadRollingLoop(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      const response = await fetch(this.rollingLoopPath);
      const arrayBuffer = await response.arrayBuffer();
      this.rollingBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.ensureRollingSource();
      console.log("[SoundManager]", "Loaded rolling loop");
    } catch (e) {
      console.error("[SoundManager] Failed to load rolling loop", e);
    }
  }

  private ensureRollingSource(): void {
    if (!this.audioCtx || !this.rollingFilter || !this.rollingBuffer) {
      this.pendingRollingStart = true;
      return;
    }
    if (this.rollingSource) {
      return;
    }
    this.rollingSource = this.audioCtx.createBufferSource();
    this.rollingSource.buffer = this.rollingBuffer;
    this.rollingSource.loop = true;
    this.rollingSource.playbackRate.value = 0.92;
    this.rollingSource.connect(this.rollingFilter);
    this.rollingSource.onended = () => {
      this.rollingSource = null;
      if (this.pendingRollingStart) {
        this.pendingRollingStart = false;
        this.ensureRollingSource();
      }
    };
    this.rollingSource.start(0);
    this.pendingRollingStart = false;
  }

  private async loadImpactTracks(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      const decoded: AudioBuffer[] = [];
      for (const path of this.impactTrackPaths) {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        decoded.push(audioBuffer);
      }
      this.impactBuffers = decoded;
      console.log(
        "[SoundManager]",
        "Loaded impact tracks count=" + String(this.impactBuffers.length),
      );
    } catch (e) {
      console.error("[SoundManager] Failed to load impact tracks", e);
    }
  }

  private async loadBouncerBoing(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      const response = await fetch(this.bouncerBoingPath);
      const arrayBuffer = await response.arrayBuffer();
      this.bouncerBoingBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      console.log(
        "[SoundManager]",
        "Loaded bouncer boing from " + this.bouncerBoingPath,
      );
    } catch (e) {
      console.error("[SoundManager] Failed to load bouncer boing", e);
    }
  }

  public updateLocomotion(speed: number, inAir: boolean): void {
    if (!this.audioCtx || !this.initialized) return;
    this.ensureRollingSource();

    if (!this.getSettings().fx) {
      if (this.rollingGain)
        this.rollingGain.gain.setTargetAtTime(
          0,
          this.audioCtx.currentTime,
          0.1,
        );
      return;
    }

    const t = this.audioCtx.currentTime;

    if (inAir) {
      if (this.rollingGain) this.rollingGain.gain.setTargetAtTime(0, t, 0.1);
    } else {
      const clampedSpeed = Math.max(0, Math.min(52, speed));
      const speedT = clampedSpeed / 52;
      const targetRollingGain =
        clampedSpeed < 0.8 ? 0 : 0.012 + Math.pow(speedT, 1.15) * 0.092;
      const targetRollingFreq = 900 + speedT * 1100;
      const targetPlaybackRate = 0.92 + speedT * 0.24;
      if (this.rollingGain)
        this.rollingGain.gain.setTargetAtTime(targetRollingGain, t, 0.08);
      if (this.rollingFilter)
        this.rollingFilter.frequency.setTargetAtTime(targetRollingFreq, t, 0.12);
      if (this.rollingSource) {
        this.rollingSource.playbackRate.setTargetAtTime(targetPlaybackRate, t, 0.12);
      }
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol: number,
    freqDecay: boolean = false,
  ): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;

    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqDecay) {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.1, t + duration);
    }

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playNoiseBurst(
    duration: number,
    vol: number,
    filterFreq: number,
  ): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;

    const bufferSize = this.audioCtx.sampleRate * duration;
    const buffer = this.audioCtx.createBuffer(
      1,
      bufferSize,
      this.audioCtx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;

    const gain = this.audioCtx.createGain();
    const t = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    source.start(t);
  }

  public playWallHit(impact: number): void {
    const vol = Math.min(0.5, impact * 0.1);
    this.playNoiseBurst(0.15, vol, 400);
  }

  public playBouncerBoing(intensity: number = 1): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;

    const now = this.audioCtx.currentTime;
    if (now - this.lastBouncerBoingTime < 0.08) {
      return;
    }
    this.lastBouncerBoingTime = now;
    const clampedIntensity = Math.max(0, Math.min(1, intensity));

    if (!this.bouncerBoingBuffer) {
      const baseFreq = 220 + clampedIntensity * 110;
      this.playTone(baseFreq, "triangle", 0.2, 0.16 + clampedIntensity * 0.08, true);
      this.playTone(
        baseFreq * 1.45,
        "sine",
        0.16,
        0.09 + clampedIntensity * 0.06,
        true,
      );
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.bouncerBoingBuffer;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;

    const gain = this.audioCtx.createGain();
    const gainValue = 0.2 + clampedIntensity * 0.18;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

    source.connect(gain);
    gain.connect(this.audioCtx.destination);
    source.start(now);
  }

  public playHeavyLanding(impact: number): LandingSoundDebugInfo {
    if (!this.audioCtx || !this.initialized) {
      return {
        played: false,
        reason: "audio_not_ready",
        clipId: "none",
        clipDurationSeconds: 0,
        playbackRate: 1,
        gain: 0,
        impact,
      };
    }
    if (!this.getSettings().fx) {
      return {
        played: false,
        reason: "fx_disabled",
        clipId: "none",
        clipDurationSeconds: 0,
        playbackRate: 1,
        gain: 0,
        impact,
      };
    }

    if (this.impactBuffers.length === 0) {
      const vol = Math.min(0.6, impact * 0.1);
      this.playTone(100, "sine", 0.2, vol, true);
      this.playNoiseBurst(0.2, vol, 500);
      return {
        played: true,
        reason: "fallback_synth",
        clipId: "synthetic_fallback",
        clipDurationSeconds: 0.2,
        playbackRate: 1,
        gain: vol,
        impact,
      };
    }

    const normalizedImpact = Math.max(0, Math.min(1, (impact - 1.8) / 14));
    const gainValue = 0.14 + normalizedImpact * 0.74;
    const randomIndex = Math.floor(Math.random() * this.impactBuffers.length);
    const selectedPath = this.impactTrackPaths[randomIndex] ?? "unknown";
    const clipId = selectedPath.split("/").pop() ?? selectedPath;
    const source = this.audioCtx.createBufferSource();
    source.buffer = this.impactBuffers[randomIndex];
    const playbackRate = 0.96 + Math.random() * 0.08;
    source.playbackRate.value = playbackRate;

    const gain = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    source.connect(gain);
    gain.connect(this.audioCtx.destination);
    source.start(now);
    const clipDurationSeconds =
      source.buffer.duration / Math.max(0.001, playbackRate);
    return {
      played: true,
      reason: "sample",
      clipId,
      clipDurationSeconds,
      playbackRate,
      gain: gainValue,
      impact,
    };
  }

  public playStartLaunch(): void {
    this.playTone(400, "square", 0.2, 0.3);
    this.playTone(600, "square", 0.3, 0.3);
  }

  public playFallOff(): void {
    if (!this.audioCtx || !this.initialized || !this.getSettings().fx) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 1.0);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.0);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.0);
  }

  public playFinish(): void {
    this.playTone(400, "square", 0.1, 0.2);
    setTimeout(() => this.playTone(500, "square", 0.1, 0.2), 100);
    setTimeout(() => this.playTone(600, "square", 0.4, 0.2), 200);
  }

  public playFirework(): void {
    this.playNoiseBurst(0.4, 0.3, 2000);
    this.playTone(200 + Math.random() * 400, "sine", 0.3, 0.2, true);
  }

  public playUIClick(): void {
    this.playTone(800, "sine", 0.05, 0.1);
  }

  public playUIToggle(on: boolean): void {
    this.playTone(on ? 1000 : 600, "sine", 0.05, 0.1);
  }
}
