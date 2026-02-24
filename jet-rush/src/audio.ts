export class AudioManager {
  private ctx: AudioContext | null = null;
  private cachedNoiseBuf: AudioBuffer | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private tone(
    freq: number,
    dur: number,
    vol = 0.25,
    type: OscillatorType = "sine",
  ): void {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private getNoiseBuffer(): AudioBuffer {
    const ctx = this.ensure();
    if (this.cachedNoiseBuf && this.cachedNoiseBuf.sampleRate === ctx.sampleRate) {
      return this.cachedNoiseBuf;
    }
    const dur = 0.5;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    this.cachedNoiseBuf = buf;
    return buf;
  }

  private noise(dur: number, vol = 0.12): void {
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
    src.connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  crash(): void {
    this.noise(0.4, 0.3);
    this.tone(120, 0.3, 0.2, "sawtooth");
  }

  ui(): void {
    this.tone(600, 0.06, 0.12);
  }

  collect(): void {
    this.tone(880, 0.08, 0.15);
    this.tone(1320, 0.1, 0.10);
  }

  /* ── Background music ── */

  private static readonly BGM_URL = "assets/sfx/Orbiting The Unknown.mp3";
  private bgm: HTMLAudioElement | null = null;

  musicOn(): void {
    if (this.bgm) {
      this.bgm.play().catch(() => {});
      return;
    }
    const audio = new Audio(AudioManager.BGM_URL);
    audio.loop = true;
    audio.volume = 0.35;
    audio.play().catch(() => {});
    this.bgm = audio;
  }

  musicOff(): void {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
  }
}
