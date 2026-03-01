export class Audio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _muted = false;

  get muted(): boolean { return this._muted; }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    waveform: OscillatorType,
    frequencies: number[],
    durationMs: number,
    gain: number,
  ): void {
    if (this._muted) return;
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = waveform;
    osc.frequency.value = frequencies[0];

    if (frequencies.length > 1) {
      const stepTime = durationMs / 1000 / frequencies.length;
      for (let i = 1; i < frequencies.length; i++) {
        osc.frequency.linearRampToValueAtTime(frequencies[i], ctx.currentTime + stepTime * (i + 1));
      }
    }

    g.gain.value = gain;
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

    osc.connect(g);
    g.connect(this.masterGain!);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  trailTick(): void {
    this.playTone('square', [220], 30, 0.05);
  }

  territoryCaptured(): void {
    this.playTone('sine', [440, 660], 120, 0.15);
  }

  playerDeath(): void {
    this.playTone('sawtooth', [300, 80], 400, 0.2);
  }

  enemyDeath(): void {
    this.playTone('triangle', [600, 300], 200, 0.1);
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    return this._muted;
  }
}
