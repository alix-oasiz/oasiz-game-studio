interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private settings: Settings;

  constructor() {
    this.settings = this.loadSettings();
    this.initSettingsUI();
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem('paperio-settings');
    return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem('paperio-settings', JSON.stringify(this.settings));
  }

  private initSettingsUI(): void {
    const musicToggle = document.getElementById('music-toggle');
    const fxToggle = document.getElementById('fx-toggle');
    const hapticsToggle = document.getElementById('haptics-toggle');
    const musicState = document.getElementById('music-state');
    const fxState = document.getElementById('fx-state');
    const hapticsState = document.getElementById('haptics-state');

    const updateUI = () => {
      musicToggle?.classList.toggle('active', this.settings.music);
      fxToggle?.classList.toggle('active', this.settings.fx);
      hapticsToggle?.classList.toggle('active', this.settings.haptics);
      if (musicState) musicState.textContent = this.settings.music ? 'On' : 'Off';
      if (fxState) fxState.textContent = this.settings.fx ? 'On' : 'Off';
      if (hapticsState) hapticsState.textContent = this.settings.haptics ? 'On' : 'Off';
    };

    updateUI();

    musicToggle?.addEventListener('click', () => {
      this.settings.music = !this.settings.music;
      this.saveSettings();
      updateUI();
      this.triggerHaptic('light');
    });

    fxToggle?.addEventListener('click', () => {
      this.settings.fx = !this.settings.fx;
      this.saveSettings();
      updateUI();
      this.triggerHaptic('light');
    });

    hapticsToggle?.addEventListener('click', () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings();
      updateUI();
      this.triggerHaptic('light');
    });
  }

  triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error'): void {
    if (!this.settings.haptics) return;
    if (typeof (window as unknown as { triggerHaptic?: (t: string) => void }).triggerHaptic === 'function') {
      (window as unknown as { triggerHaptic: (t: string) => void }).triggerHaptic(type);
    }
  }

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
    if (!this.settings.fx) return;
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
    this.triggerHaptic('success');
  }

  playerDeath(): void {
    this.playTone('sawtooth', [300, 80], 400, 0.2);
    this.triggerHaptic('error');
  }

  enemyDeath(): void {
    this.playTone('triangle', [600, 300], 200, 0.1);
    this.triggerHaptic('medium');
  }
}
