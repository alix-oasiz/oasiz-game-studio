import type { HapticType, Settings, SfxName } from "../types";

type BgNode = { osc: OscillatorNode; gain: GainNode };

export class AudioSystem {
  private audioCtx: AudioContext | null = null;
  private bgNodes: BgNode[] = [];

  public constructor(private readonly getSettings: () => Settings) {}

  public playSfx(name: SfxName): void {
    if (!this.getSettings().fx) return;

    try {
      if (name === "tap") this.playTapSfx();
      if (name === "start") this.playStartSfx();
      if (name === "claim") this.playClaimSfx();
      if (name === "kill") this.playKillSfx();
      if (name === "death") this.playDeathSfx();
    } catch {
      console.log("[AudioSystem.playSfx]", "Audio playback skipped");
    }
  }

  public startBgMusic(): void {
    if (this.bgNodes.length > 0) return;
    const ctx = this.getAudioCtx();
    const frequencies = [174.61, 220, 261.63];
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequencies[i], ctx.currentTime);
      gain.gain.setValueAtTime(0.015, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.bgNodes.push({ osc, gain });
    }
  }

  public stopBgMusic(): void {
    for (const node of this.bgNodes) {
      node.osc.stop();
      node.osc.disconnect();
      node.gain.disconnect();
    }
    this.bgNodes = [];
  }

  public triggerHaptic(type: HapticType): void {
    if (!this.getSettings().haptics) return;

    if (typeof window.triggerHaptic === "function") {
      window.triggerHaptic(type);
      return;
    }

    if (!navigator.vibrate) return;

    const durations: Record<HapticType, number> = {
      light: 10,
      medium: 20,
      heavy: 40,
      success: 30,
      error: 55,
    };

    navigator.vibrate(durations[type]);
  }

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  private playToneSweep(
    fromHz: number,
    toHz: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    const ctx = this.getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playTapSfx(): void {
    this.playToneSweep(860, 620, 0.08, "sine", 0.09);
  }

  private playStartSfx(): void {
    const ctx = this.getAudioCtx();
    const notes = [440, 554, 659];
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(notes[i], ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.14);
    }
  }

  private playClaimSfx(): void {
    this.playToneSweep(320, 900, 0.16, "triangle", 0.13);
  }

  private playKillSfx(): void {
    this.playToneSweep(760, 180, 0.18, "square", 0.12);
  }

  private playDeathSfx(): void {
    this.playToneSweep(420, 90, 0.45, "sawtooth", 0.14);
  }
}
