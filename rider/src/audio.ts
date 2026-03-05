import { getSettings, SETTINGS_CHANGED_EVENT, UI_SOUND_EVENT, type Settings } from "./settings";

type MusicMode = "menu" | "game";

interface EngineState {
    speed: number;
    accelerating: boolean;
    grounded: boolean;
    active: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    music: true,
    fx: true,
    haptics: true
};

const MUSIC_PATTERNS: Record<MusicMode, number[]> = {
    menu: [220, 247, 277, 330, 277, 247, 196, 247],
    game: [165, 196, 220, 247, 220, 196, 247, 294]
};

class GameAudioManager {
    private context: AudioContext | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private settings: Settings = { ...DEFAULT_SETTINGS };

    private masterGain: GainNode | null = null;
    private musicGain: GainNode | null = null;
    private fxGain: GainNode | null = null;

    private engineOscA: OscillatorNode | null = null;
    private engineOscB: OscillatorNode | null = null;
    private engineNoise: AudioBufferSourceNode | null = null;
    private engineNoiseGain: GainNode | null = null;
    private engineFilter: BiquadFilterNode | null = null;
    private engineGain: GainNode | null = null;
    private engineThrottle: number = 0;

    private windNoise: AudioBufferSourceNode | null = null;
    private windFilter: BiquadFilterNode | null = null;
    private windGain: GainNode | null = null;

    private musicMode: MusicMode = "menu";
    private musicStep: number = 0;
    private musicTimer: number | null = null;

    constructor() {
        this.settings = { ...DEFAULT_SETTINGS, ...getSettings() };
        if (typeof window !== "undefined") {
            window.addEventListener(SETTINGS_CHANGED_EVENT, this.onSettingsChanged as EventListener);
            window.addEventListener(UI_SOUND_EVENT, this.onUiSoundRequested as EventListener);
        }
    }

    unlockFromUserGesture(): void {
        const ctx = this.ensureContext();
        if (!ctx) return;
        void ctx.resume();
    }

    startMusic(mode: MusicMode): void {
        this.musicMode = mode;
        this.musicStep = 0;
        this.ensureContext();
        if (this.musicTimer === null && typeof window !== "undefined") {
            this.musicTimer = window.setInterval(() => this.tickMusic(), 255);
        }
        this.applySettingsToGains();
    }

    updateEngine(state: EngineState): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.engineGain || !this.engineFilter || !this.engineOscA || !this.engineOscB || !this.windGain || !this.windFilter || !this.engineNoiseGain) {
            return;
        }

        const speed = Math.max(0, Math.min(state.speed, 60));
        const activeFx = this.settings.fx && state.active;
        const now = ctx.currentTime;
        const speedNorm = speed / 60;

        const throttleTarget = state.accelerating ? 1 : 0;
        const throttleLerp = state.accelerating ? 0.14 : 0.035;
        this.engineThrottle += (throttleTarget - this.engineThrottle) * throttleLerp;

        const throttleBoost = this.engineThrottle * 0.055;
        const baseEngine = 0.024 + speedNorm * 0.14 + throttleBoost;
        const airborneMul = state.grounded ? 1 : 0.65;
        const targetEngineGain = activeFx ? baseEngine * airborneMul : 0;
        const currentEngineGain = this.engineGain.gain.value;
        const gainRamp = targetEngineGain < currentEngineGain ? 0.22 : 0.08;

        this.engineGain.gain.cancelScheduledValues(now);
        this.engineGain.gain.linearRampToValueAtTime(targetEngineGain, now + gainRamp);

        const baseFreq = 56 + speed * 5.2 + this.engineThrottle * 20;
        this.engineOscA.frequency.cancelScheduledValues(now);
        this.engineOscA.frequency.linearRampToValueAtTime(baseFreq, now + 0.1);

        this.engineOscB.frequency.cancelScheduledValues(now);
        this.engineOscB.frequency.linearRampToValueAtTime(baseFreq * 0.5, now + 0.12);

        const cutoff = 320 + speed * 22 + this.engineThrottle * 340;
        this.engineFilter.frequency.cancelScheduledValues(now);
        this.engineFilter.frequency.linearRampToValueAtTime(cutoff, now + 0.12);

        const targetNoiseGain = activeFx ? (0.006 + speedNorm * 0.014 + this.engineThrottle * 0.006) * airborneMul : 0;
        this.engineNoiseGain.gain.cancelScheduledValues(now);
        this.engineNoiseGain.gain.linearRampToValueAtTime(targetNoiseGain, now + 0.16);

        const windLevel = activeFx && !state.grounded ? Math.min(0.11, 0.016 + speedNorm * 0.09) : 0;
        this.windGain.gain.cancelScheduledValues(now);
        this.windGain.gain.linearRampToValueAtTime(windLevel, now + 0.11);

        const windCutoff = 1400 + speed * 25;
        this.windFilter.frequency.cancelScheduledValues(now);
        this.windFilter.frequency.linearRampToValueAtTime(windCutoff, now + 0.11);
    }

    stopEngine(): void {
        this.engineThrottle = 0;
        this.updateEngine({
            speed: 0,
            accelerating: false,
            grounded: true,
            active: false
        });
    }

    playGem(): void {
        if (!this.canPlayFx()) return;
        this.playTone(720, 0.07, "triangle", 0.08, this.fxGain, 0);
        this.playTone(980, 0.09, "triangle", 0.06, this.fxGain, 0.045);
    }

    playFlip(): void {
        if (!this.canPlayFx()) return;
        this.playTone(520, 0.07, "square", 0.06, this.fxGain, 0);
        this.playTone(780, 0.08, "triangle", 0.06, this.fxGain, 0.055);
    }

    playLand(intensity: number): void {
        if (!this.canPlayFx()) return;
        const strength = Math.max(0.25, Math.min(intensity, 1.3));
        this.playTone(95 + strength * 20, 0.12, "triangle", 0.08 * strength, this.fxGain, 0);
        this.playNoiseBurst(0.08, 0.05 * strength, 1200);
    }

    playCollision(intensity: number = 1): void {
        if (!this.canPlayFx()) return;
        const strength = Math.max(0.2, Math.min(intensity, 1.5));
        this.playTone(130 + strength * 40, 0.14, "sawtooth", 0.07 * strength, this.fxGain, 0);
        this.playNoiseBurst(0.09 + strength * 0.05, 0.08 * strength, 1400 + strength * 800);
    }

    playCrash(): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.fxGain || !this.settings.fx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.42);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

        osc.connect(gain);
        gain.connect(this.fxGain);
        osc.start(now);
        osc.stop(now + 0.5);

        this.playNoiseBurst(0.38, 0.26, 1800);
    }

    playUIButton(): void {
        if (!this.canPlayFx()) return;
        this.playTone(430, 0.045, "triangle", 0.055, this.fxGain, 0);
        this.playTone(640, 0.05, "triangle", 0.05, this.fxGain, 0.028);
    }

    private onSettingsChanged = (event: Event): void => {
        const customEvent = event as CustomEvent<Settings>;
        this.settings = { ...DEFAULT_SETTINGS, ...(customEvent.detail || {}) };
        this.applySettingsToGains();
    };

    private onUiSoundRequested = (): void => {
        this.unlockFromUserGesture();
        this.playUIButton();
    };

    private ensureContext(): AudioContext | null {
        if (this.context) return this.context;
        if (typeof window === "undefined") return null;

        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextCtor) return null;

        const ctx = new AudioContextCtor() as AudioContext;
        this.context = ctx;

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.9;
        this.masterGain.connect(ctx.destination);

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.masterGain);

        this.fxGain = ctx.createGain();
        this.fxGain.gain.value = 0;
        this.fxGain.connect(this.masterGain);

        this.noiseBuffer = this.createNoiseBuffer(ctx, 1.6);
        this.setupEngineVoice(ctx);
        this.setupWindVoice(ctx);
        this.applySettingsToGains();
        return ctx;
    }

    private setupEngineVoice(ctx: AudioContext): void {
        if (!this.fxGain || !this.noiseBuffer) return;

        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = "lowpass";
        this.engineFilter.frequency.value = 520;
        this.engineFilter.Q.value = 0.28;

        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineGain.connect(this.fxGain);

        this.engineFilter.connect(this.engineGain);

        this.engineOscA = ctx.createOscillator();
        this.engineOscA.type = "triangle";
        this.engineOscA.frequency.value = 62;
        this.engineOscA.connect(this.engineFilter);
        this.engineOscA.start();

        this.engineOscB = ctx.createOscillator();
        this.engineOscB.type = "sine";
        this.engineOscB.frequency.value = 31;
        this.engineOscB.connect(this.engineFilter);
        this.engineOscB.start();

        this.engineNoise = ctx.createBufferSource();
        this.engineNoise.buffer = this.noiseBuffer;
        this.engineNoise.loop = true;
        this.engineNoiseGain = ctx.createGain();
        this.engineNoiseGain.gain.value = 0.006;
        this.engineNoise.connect(this.engineNoiseGain);
        this.engineNoiseGain.connect(this.engineFilter);
        this.engineNoise.start();
    }

    private setupWindVoice(ctx: AudioContext): void {
        if (!this.fxGain || !this.noiseBuffer) return;

        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = "bandpass";
        this.windFilter.frequency.value = 1400;
        this.windFilter.Q.value = 0.9;

        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0;

        this.windNoise = ctx.createBufferSource();
        this.windNoise.buffer = this.noiseBuffer;
        this.windNoise.loop = true;
        this.windNoise.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.fxGain);
        this.windNoise.start();
    }

    private applySettingsToGains(): void {
        if (!this.context || !this.musicGain || !this.fxGain) return;
        const now = this.context.currentTime;

        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.linearRampToValueAtTime(this.settings.music ? 0.12 : 0, now + 0.08);

        this.fxGain.gain.cancelScheduledValues(now);
        this.fxGain.gain.linearRampToValueAtTime(this.settings.fx ? 1 : 0, now + 0.06);
    }

    private tickMusic(): void {
        const ctx = this.context;
        if (!ctx || !this.musicGain || !this.settings.music || ctx.state !== "running") return;

        const pattern = MUSIC_PATTERNS[this.musicMode];
        const index = this.musicStep % pattern.length;
        const note = pattern[index];
        this.musicStep += 1;

        this.playTone(note, 0.21, "triangle", 0.055, this.musicGain, 0);
        if (index % 2 === 0) {
            this.playTone(note / 2, 0.24, "sine", 0.032, this.musicGain, 0.015);
        }
    }

    private createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
        const length = Math.floor(ctx.sampleRate * durationSeconds);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.9;
        }
        return buffer;
    }

    private canPlayFx(): boolean {
        return !!this.context && !!this.fxGain && this.settings.fx && this.context.state === "running";
    }

    private playTone(
        frequency: number,
        durationSec: number,
        waveform: OscillatorType,
        peakGain: number,
        destination: GainNode | null,
        startOffsetSec: number
    ): void {
        const ctx = this.context;
        if (!ctx || !destination) return;

        const start = ctx.currentTime + Math.max(0, startOffsetSec);
        const stop = start + Math.max(0.03, durationSec);

        const osc = ctx.createOscillator();
        osc.type = waveform;
        osc.frequency.setValueAtTime(Math.max(20, frequency), start);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, stop);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2200;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        osc.start(start);
        osc.stop(stop + 0.02);
    }

    private playNoiseBurst(durationSec: number, gainAmount: number, cutoff: number): void {
        const ctx = this.context;
        if (!ctx || !this.noiseBuffer || !this.fxGain) return;

        const start = ctx.currentTime;
        const stop = start + Math.max(0.04, durationSec);
        const source = ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(Math.max(120, cutoff), start);
        filter.Q.value = 0.7;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainAmount), start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, stop);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.fxGain);
        source.start(start);
        source.stop(stop + 0.01);
    }
}

let instance: GameAudioManager | null = null;

export function getAudioManager(): GameAudioManager {
    if (!instance) {
        instance = new GameAudioManager();
    }
    return instance;
}
