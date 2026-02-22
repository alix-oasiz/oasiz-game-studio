import Matter from "matter-js";

// Static imports for car assets (iOS WebView compatibility)
import carBlue from "../assets/cars/blue.png";
import carBrown from "../assets/cars/brown.png";
import carCyan from "../assets/cars/cyan.png";
import carDarkBlue from "../assets/cars/dark blue.png";
import carGreen from "../assets/cars/green.png";
import carPurple from "../assets/cars/purple.png";
import carRed from "../assets/cars/red.png";
import carYellow from "../assets/cars/yellow.png";

const CAR_IMPORTS: Record<string, string> = {
  "blue": carBlue,
  "brown": carBrown,
  "cyan": carCyan,
  "dark blue": carDarkBlue,
  "green": carGreen,
  "purple": carPurple,
  "red": carRed,
  "yellow": carYellow,
};

type GameState = "MENU" | "SEARCHING" | "PLAYING" | "GOAL" | "GAME_OVER";
type MatchMode = "BOT" | "LOCAL_2P";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
  // Physics settings
  carWidth: number;
  carHeight: number;
  carBoundsWidth: number; // Collision bounds width multiplier (to match sprite size)
  carBoundsHeight: number; // Collision bounds height multiplier (to match sprite size)
  carSpriteWidth: number;
  carSpriteHeight: number;
  ballRadius: number;
  ballBoundsScale: number; // Collision bounds scale multiplier (to match sprite size)
  ballSpriteSize: number;
  carMaxSpeed: number;
  carMaxSpeedBoost: number;
  carForce: number;
  carForceBoost: number;
  carTurnRate: number;
  carFriction: number;
  carFrictionAir: number;
  carRestitution: number;
  carDensity: number;
  ballRestitution: number;
  ballFriction: number;
  ballFrictionAir: number;
  ballDensity: number;
  // Stadium bounds
  fieldWidth: number;
  fieldHeight: number;
  goalWidth: number;
  goalHeight: number;
  goalDepth: number;
  // VFX settings
  vfxBoostClouds: boolean;
  vfxDrifting: boolean;
  vfxBumping: boolean;
  vfxBoostCloudIntensity: number;
  vfxDriftIntensity: number;
  vfxBumpIntensity: number;
  // Debug/Visualization settings
  showCarBounds: boolean; // Show car collision bounds visualization
  // Camera settings
  cameraZoomSpeedFactor: number;
  cameraZoomBallFactor: number;
  cameraZoomSmoothness: number;
  // UI settings - Menu
  uiMenuLogoSize: number;
  uiMenuLogoSizeMobile: number;
  uiMenuButtonWideWidth: number;
  uiMenuButtonWideWidthMobile: number;
  uiMenuButtonGap: number;
  uiMenuButtonGapMobile: number;
  uiMenuIconButtonSize: number;
  uiMenuIconButtonSizeMobile: number;
  // UI settings - Country/Car Picker
  uiFlagGap: number;
  uiFlagGapMobile: number;
  uiFlagPadding: number;
  uiFlagPaddingMobile: number;
  uiFlagBorderWidth: number;
  uiFlagBorderWidthMobile: number;
  uiPanelPadding: number;
  uiPanelPaddingMobile: number;
  uiTitleSize: number;
  uiSubtitleSize: number;
  // UI settings - Game HUD
  uiHudFontSize: number;
  uiHudFontSizeMobile: number;
  uiHudScoreSize: number;
  uiHudScoreSizeMobile: number;
  uiHudSpacing: number;
  uiHudSpacingMobile: number;
  uiHudTopOffset: number;
  uiHudTopOffsetMobile: number;
}

interface InputState {
  throttle: number; // -1..1
  steer: number; // -1..1
  boost: boolean;
}

interface JoyState {
  active: boolean;
  id: number | null;
  baseX: number;
  baseY: number;
  dx: number;
  dy: number;
}

interface BoostCloudParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  dirX: number; // Direction the car was facing when particle spawned (for turbo shape)
  dirY: number;
}

interface DriftParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
}

interface BumpParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  hue: number;
}

interface TireTracePoint {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface TireTracePath {
  leftTire: TireTracePoint[];
  rightTire: TireTracePoint[];
  isPlayer: boolean;
}

interface GoalBurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
}

// (Removed) Procedural environment types (buildings/crowd/stars/sparks)

const {
  Engine,
  World,
  Bodies,
  Body,
  Events,
  Composite,
  Vector,
  Query,
} = Matter;

// Collision categories for selective collision
const CATEGORY_CAR = 0x0001;
const CATEGORY_BALL = 0x0002;
const CATEGORY_GOAL_BOUNDARY = 0x0004;
const CATEGORY_WALL = 0x0008; // Default, collides with everything

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function angleWrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function fmtTimeSec(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m) + ":" + String(r).padStart(2, "0");
}

function isMobile(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private fx: GainNode | null = null;
  private musicNodes: Array<AudioNode> = [];
  private musicTimer: number | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicLoading: Promise<void> | null = null;
  private bumpBuffer: AudioBuffer | null = null;
  private screechBuffer: AudioBuffer | null = null;
  private crowdBuffer: AudioBuffer | null = null;
  private countdown321Buffer: AudioBuffer | null = null;
  private revBuffer: AudioBuffer | null = null;
  private lastScreechTime = 0;
  private lastBumpTime = 0;
  private lastRevTime = 0;
  private screechSource: AudioBufferSourceNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;

  constructor(private settings: Settings) {}

  setSettings(s: Settings): void {
    this.settings = s;
    if (this.master) this.master.gain.value = 1;
    if (this.music) this.music.gain.value = this.settings.music ? 0.9 : 0;
    if (this.fx) this.fx.gain.value = this.settings.fx ? 1 : 0;
  }

  ensure(): void {
    if (this.ctx) {
      // Resume AudioContext if suspended (browsers require user interaction)
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch((e) => {
          console.warn("[AudioManager.ensure] Failed to resume AudioContext:", e);
        });
      }
      return;
    }
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctx) return;
    this.ctx = new Ctx();
    
    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.ensure] Failed to resume AudioContext:", e);
      });
    }
    
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.music = this.ctx.createGain();
    this.fx = this.ctx.createGain();
    this.music.gain.value = this.settings.music ? 0.9 : 0;
    this.fx.gain.value = this.settings.fx ? 1 : 0;
    this.music.connect(this.master);
    this.fx.connect(this.master);
  }

  startMusic(): void {
    this.ensure();
    if (!this.ctx || !this.music) return;
    if (!this.settings.music) return;
    // Don't restart if already playing - just ensure it continues
    if (this.musicSource) return;

    // Resume AudioContext if suspended (required for autoplay)
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        // Try again after resuming
        this.startMusic();
      }).catch((e) => {
        console.warn("[AudioManager.startMusic] Failed to resume AudioContext:", e);
      });
      return;
    }

    if (this.musicBuffer) {
      this.playBufferLoop();
      return;
    }

    if (!this.musicLoading) {
      this.musicLoading = this.loadLoopMusic()
        .then(() => {
          if (this.settings.music) this.playBufferLoop();
        })
        .catch((e) => {
          console.warn("[AudioManager.startMusic] Failed to load MP3, using fallback:", e);
          this.startSynthFallback();
        })
        .finally(() => {
          this.musicLoading = null;
        });
    }
  }

  stopMusic(): void {
    // Stop MP3
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {}
      try {
        this.musicSource.disconnect();
      } catch {}
      this.musicSource = null;
    }

    // Stop fallback synth if running
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    for (const n of this.musicNodes) {
      try {
        (n as any).disconnect();
      } catch {}
    }
    this.musicNodes = [];
    console.log("[AudioManager.stopMusic] Stopped");
  }

  private playBufferLoop(): void {
    if (!this.ctx || !this.music || !this.musicBuffer) return;
    if (!this.settings.music) return;
    if (this.musicSource) return;

    // Ensure AudioContext is resumed before playing
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        this.playBufferLoop();
      }).catch((e) => {
        console.warn("[AudioManager.playBufferLoop] Failed to resume AudioContext:", e);
      });
      return;
    }

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.musicBuffer;
      src.loop = true;
      src.connect(this.music);
      src.onended = () => {
        // If music source ended but music is still enabled, restart it
        if (this.musicSource === src) {
          this.musicSource = null;
          if (this.settings.music && this.musicBuffer) {
            // Restart the loop
            this.playBufferLoop();
          }
        }
      };
      src.start(0);
      this.musicSource = src;
      console.log("[AudioManager.playBufferLoop] Started");
    } catch (e) {
      console.warn("[AudioManager.playBufferLoop] Failed:", e);
    }
  }

  private async loadLoopMusic(): Promise<void> {
    if (!this.ctx) return;
    console.log("[AudioManager.loadLoopMusic] Loading src/Zero-G Kickoff.mp3");
    const url = new URL("./Zero-G Kickoff.mp3", import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch music: " + String(res.status));
    const buf = await res.arrayBuffer();
    this.musicBuffer = await this.ctx.decodeAudioData(buf.slice(0));
    console.log("[AudioManager.loadLoopMusic] Loaded");
  }

  private startSynthFallback(): void {
    // Only start fallback if we still want music and MP3 isn't playing.
    this.ensure();
    if (!this.ctx || !this.music) return;
    if (!this.settings.music) return;
    if (this.musicSource) return;
    if (this.musicTimer !== null) return;

    // Ensure AudioContext is resumed before starting fallback
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        this.startSynthFallback();
      }).catch((e) => {
        console.warn("[AudioManager.startSynthFallback] Failed to resume AudioContext:", e);
      });
      return;
    }

    const ctx = this.ctx;
    const musicGain = this.music;

    const base = ctx.createGain();
    base.gain.value = 0.55;
    base.connect(musicGain);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.6;
    filter.connect(base);

    const padGain = ctx.createGain();
    padGain.gain.value = 0.55;
    padGain.connect(filter);

    this.musicNodes = [base, filter, padGain];

    const notes = [196, 220, 246.94, 261.63]; // G3 A3 B3 C4
    let step = 0;
    const schedule = () => {
      if (!this.ctx || !this.music || !this.settings.music) return;
      const t0 = this.ctx.currentTime + 0.02;
      const root = notes[step % notes.length];

      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      o1.frequency.setValueAtTime(root, t0);
      o2.frequency.setValueAtTime(root * 2, t0);

      const eg = this.ctx.createGain();
      eg.gain.setValueAtTime(0, t0);
      eg.gain.linearRampToValueAtTime(0.10, t0 + 0.08);
      eg.gain.linearRampToValueAtTime(0.0, t0 + 1.05);

      o1.connect(eg);
      o2.connect(eg);
      eg.connect(padGain);

      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 1.1);
      o2.stop(t0 + 1.1);

      step++;
    };

    schedule();
    this.musicTimer = window.setInterval(schedule, 420);
    console.log("[AudioManager.startSynthFallback] Started");
  }

  uiTap(): void {
    this.beep(520, 0.06, 0.05);
  }

  boost(): void {
    this.noiseWhoosh(0.12, 0.08);
  }

  kick(): void {
    this.beep(220, 0.04, 0.07);
    this.beep(160, 0.05, 0.06);
  }

  thud(): void {
    this.beep(90, 0.06, 0.09);
  }

  goal(isPlayer: boolean): void {
    if (isPlayer) {
      this.beep(660, 0.12, 0.12);
      this.beep(880, 0.14, 0.10);
    } else {
      this.beep(220, 0.16, 0.14);
      this.beep(180, 0.14, 0.12);
    }
  }

  explosiveGoal(): void {
    // Explosive sound effect
    this.noiseWhoosh(0.15, 0.3);
    this.beep(440, 0.08, 0.05);
    this.beep(550, 0.1, 0.06);
    this.beep(660, 0.12, 0.08);
    // Deep rumble
    this.beep(110, 0.2, 0.15);
  }

  private beep(freq: number, dur: number, vol: number): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;

    const t0 = this.ctx.currentTime + 0.01;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t0);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(this.fx);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noiseWhoosh(dur: number, vol: number): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;

    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const v = (Math.random() * 2 - 1) * (1 - t);
      ch[i] = v;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.9;

    const g = this.ctx.createGain();
    const t0 = this.ctx.currentTime + 0.01;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.fx);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  async loadSFX(): Promise<void> {
    this.ensure();
    if (!this.ctx) return;

    try {
      // Load bump.wav
      const bumpUrl = new URL("../assets/sfx/bump.wav", import.meta.url);
      const bumpRes = await fetch(bumpUrl);
      if (bumpRes.ok) {
        const bumpBuf = await bumpRes.arrayBuffer();
        this.bumpBuffer = await this.ctx.decodeAudioData(bumpBuf);
        console.log("[AudioManager] Loaded bump.wav");
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load bump.wav:", e);
    }

    try {
      // Load screech.mp3
      const screechUrl = new URL("../assets/sfx/screech.mp3", import.meta.url);
      const screechRes = await fetch(screechUrl);
      if (screechRes.ok) {
        const screechBuf = await screechRes.arrayBuffer();
        this.screechBuffer = await this.ctx.decodeAudioData(screechBuf);
        console.log("[AudioManager] Loaded screech.mp3");
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load screech.mp3:", e);
    }

    try {
      // Load crowd.mp3
      const crowdUrl = new URL("../assets/sfx/crowd.mp3", import.meta.url);
      const crowdRes = await fetch(crowdUrl);
      if (crowdRes.ok) {
        const crowdBuf = await crowdRes.arrayBuffer();
        this.crowdBuffer = await this.ctx.decodeAudioData(crowdBuf);
        console.log("[AudioManager] Loaded crowd.mp3");
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load crowd.mp3:", e);
    }

    try {
      // Load 321.wav
      const countdown321Url = new URL("../assets/sfx/321.wav", import.meta.url);
      const countdown321Res = await fetch(countdown321Url);
      if (countdown321Res.ok) {
        const countdown321Buf = await countdown321Res.arrayBuffer();
        this.countdown321Buffer = await this.ctx.decodeAudioData(countdown321Buf);
        console.log("[AudioManager] Loaded 321.wav");
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load 321.wav:", e);
    }

    try {
      // Load rev.wav
      const revUrl = new URL("../assets/sfx/rev.wav", import.meta.url);
      const revRes = await fetch(revUrl);
      if (revRes.ok) {
        const revBuf = await revRes.arrayBuffer();
        this.revBuffer = await this.ctx.decodeAudioData(revBuf);
        console.log("[AudioManager] Loaded rev.wav");
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load rev.wav:", e);
    }
  }

  playBump(volume: number = 0.15): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;
    if (!this.bumpBuffer) {
      console.warn("[AudioManager.playBump] Bump buffer not loaded yet");
      return;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.playBump] Failed to resume AudioContext:", e);
      });
    }

    // Throttle bump sounds (max once per 500ms - less frequent)
    const now = Date.now();
    if (now - this.lastBumpTime < 500) return;
    this.lastBumpTime = now;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bumpBuffer;
      
      const g = this.ctx.createGain();
      g.gain.value = volume;
      
      src.connect(g);
      g.connect(this.fx);
      src.start(0);
    } catch (e) {
      console.warn("[AudioManager.playBump] Failed:", e);
    }
  }

  playScreech(volume: number = 0.2): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;
    if (!this.screechBuffer) {
      console.warn("[AudioManager.playScreech] Screech buffer not loaded yet");
      return;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.playScreech] Failed to resume AudioContext:", e);
      });
    }

    // Prevent overlapping - if already playing, don't start another
    if (this.screechSource) {
      return;
    }

    // Throttle screech sounds (max once per 300ms)
    const now = Date.now();
    if (now - this.lastScreechTime < 300) return;
    this.lastScreechTime = now;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.screechBuffer;
      
      const g = this.ctx.createGain();
      g.gain.value = volume; // Lower volume (default 0.2 instead of 0.4)
      
      src.connect(g);
      g.connect(this.fx);
      
      // Track the source so we can prevent overlapping
      this.screechSource = src;
      
      // Clear the source when it ends
      src.onended = () => {
        if (this.screechSource === src) {
          this.screechSource = null;
        }
      };
      
      src.start(0);
    } catch (e) {
      console.warn("[AudioManager.playScreech] Failed:", e);
      this.screechSource = null;
    }
  }

  playCrowd(volume: number = 0.7): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;
    if (!this.crowdBuffer) {
      console.warn("[AudioManager.playCrowd] Crowd buffer not loaded yet");
      return;
    }

    // Stop any existing crowd sound before playing a new one
    if (this.crowdSource) {
      try {
        this.crowdSource.stop();
      } catch (e) {
        // Source may have already stopped
      }
      this.crowdSource = null;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.playCrowd] Failed to resume AudioContext:", e);
      });
    }

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.crowdBuffer;
      
      const g = this.ctx.createGain();
      g.gain.value = volume;
      
      src.connect(g);
      g.connect(this.fx);
      
      // Track the source so we can stop it if needed
      this.crowdSource = src;
      
      // Clear reference when sound ends
      src.onended = () => {
        if (this.crowdSource === src) {
          this.crowdSource = null;
        }
      };
      
      src.start(0);
    } catch (e) {
      console.warn("[AudioManager.playCrowd] Failed:", e);
      this.crowdSource = null;
    }
  }

  play321(): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;
    if (!this.countdown321Buffer) {
      console.warn("[AudioManager.play321] 321 buffer not loaded yet");
      return;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.play321] Failed to resume AudioContext:", e);
      });
    }

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.countdown321Buffer;
      
      const g = this.ctx.createGain();
      g.gain.value = 0.8;
      
      src.connect(g);
      g.connect(this.fx);
      src.start(0);
    } catch (e) {
      console.warn("[AudioManager.play321] Failed:", e);
    }
  }

  playRev(volume: number = 0.5): void {
    this.ensure();
    if (!this.ctx || !this.fx) return;
    if (!this.settings.fx) return;
    if (!this.revBuffer) {
      console.warn("[AudioManager.playRev] Rev buffer not loaded yet");
      return;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => {
        console.warn("[AudioManager.playRev] Failed to resume AudioContext:", e);
      });
    }

    // Throttle rev sounds (max once per 150ms)
    const now = Date.now();
    if (now - this.lastRevTime < 150) return;
    this.lastRevTime = now;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.revBuffer;
      
      const g = this.ctx.createGain();
      g.gain.value = volume;
      
      src.connect(g);
      g.connect(this.fx);
      src.start(0);
    } catch (e) {
      console.warn("[AudioManager.playRev] Failed:", e);
    }
  }
}

class GoalDuelGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private state: GameState = "MENU";
  private lastTs = 0;

  private settings: Settings;
  private audio: AudioManager;

  private engine: Matter.Engine;
  private world: Matter.World;

  // Vertical stadium (portrait-ish): goals are top/bottom.
  // These are now read from settings, but kept as properties for easy access
  private get fieldW(): number {
    return this.settings.fieldWidth;
  }
  private get fieldH(): number {
    return this.settings.fieldHeight;
  }
  private get goalW(): number {
    return this.settings.goalWidth;
  }
  private get goalH(): number {
    return this.settings.goalHeight;
  }

  private playerCar!: Matter.Body;
  private botCar!: Matter.Body;
  private ball!: Matter.Body;
  private topGoalSensor!: Matter.Body;
  private bottomGoalSensor!: Matter.Body;

  private playerInput: InputState = { throttle: 0, steer: 0, boost: false };
  private botInput: InputState = { throttle: 0, steer: 0, boost: false };

  private keys = new Set<string>();
  private joy: JoyState = { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
  private joyP2: JoyState = { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
  private boostTouch = false;
  private boostTouchP2 = false;
  private boostCharge = 1.0; // 0.0 to 1.0, starts full
  private boostChargeP2 = 1.0; // Player 2 boost charge
  private boostChargeRate = 0.15; // Charge per second (slower - takes ~6.7 seconds to fill)
  private boostDrainRate = 1.5; // Drain per second when boosting (drains in ~0.67 seconds)

  private playerScore = 0;
  private botScore = 0;
  private matchTime = 0;
  private matchLimit = 90;
  private goalPause = 0;
  private timeScale = 1.0; // For slow motion
  private cameraShake = { x: 0, y: 0, intensity: 0 };
  private isReplayMode = false;
  private replayData: Array<{
    playerCar: { x: number; y: number; angle: number };
    botCar: { x: number; y: number; angle: number };
    ball: { x: number; y: number };
    time: number;
  }> = [];
  private replayIndex = 0;
  private replayStartTime = 0;
  private recordingReplay = false;
  private replayScoringPlayer: boolean | null = null; // true = player scored, false = bot scored
  private countdownActive = false;
  private countdownValue = 0;

  private goalBurst: GoalBurstParticle[] = [];
  private boostClouds: BoostCloudParticle[] = [];
  private driftParticles: DriftParticle[] = [];
  private bumpParticles: BumpParticle[] = [];
  private tireTraces: TireTracePath[] = [];
  private lastTireTraceTime = 0;
  private searchingScrollInterval: number | null = null;
  private searchingEaseInterval: number | null = null;

  // Gameplay stadium background
  private stadiumBg = new Image();
  private goalImage = new Image();
  private ballTrail: Array<{ x: number; y: number; life: number; maxLife: number }> = [];
  
  // Goal animation state
  private goalAnimation = {
    active: false,
    time: 0,
    maxTime: 2.0,
    scale: 0,
    rotation: 0,
    alpha: 0,
  };

  // Camera (world space)
  private camX = 0;
  private camY = 0;
  private camVX = 0;
  private camVY = 0;
  private currentZoom = 1.20;
  private targetZoom = 1.20;
  
  // Track previous positions/velocities for collision detection
  private prevPlayerVel = { x: 0, y: 0 };
  private prevBotVel = { x: 0, y: 0 };
  private prevPlayerPos = { x: 0, y: 0 };
  private prevBotPos = { x: 0, y: 0 };
  private prevPlayerSpeed = 0;
  private prevBotSpeed = 0;
  private botPositionHistory: Array<{ x: number; y: number; time: number }> = []; // Track bot position over time for stuck detection
  private botStuckTimer = 0; // Time since bot was last making progress
  private botStuckThreshold = 1.5; // Seconds without progress before considered stuck
  private botBackwardTimer = 0; // Timer for backward movement
  private botBackwardDuration = 0; // How long to go backwards
  private botStopTimer = 0; // Timer for stopping when close to ball
  private botStopDuration = 0; // How long to stop
  private prevBallVel = { x: 0, y: 0 };
  private prevBallPos = { x: 0, y: 0 };

  // DOM
  private elHudRoot = document.getElementById("hudRoot") as HTMLDivElement;
  private elHudPills = document.getElementById("hudPills") as HTMLDivElement;
  private elHudYou = document.getElementById("hudYou") as HTMLSpanElement;
  private elHudBot = document.getElementById("hudBot") as HTMLSpanElement;
  private elHudTime = document.getElementById("hudTime") as HTMLSpanElement;
  private elStart = document.getElementById("startOverlay") as HTMLDivElement;
  private elEnd = document.getElementById("endOverlay") as HTMLDivElement;
  private elEndTitle = document.getElementById("endTitle") as HTMLDivElement;
  private elEndWinnerFlag = document.getElementById("endWinnerFlag") as HTMLImageElement;
  private elEndWinnerCar = document.getElementById("endWinnerCar") as HTMLImageElement;
  private elImgEndPlay = document.getElementById("imgEndPlay") as HTMLImageElement;
  private elImgEndMenu = document.getElementById("imgEndMenu") as HTMLImageElement;
  private elFade = document.getElementById("fade") as HTMLDivElement;
  private elCountdownOverlay = document.getElementById("countdownOverlay") as HTMLDivElement;
  private elCountdownText = document.getElementById("countdownText") as HTMLDivElement;
  private elBtnSkipReplay = document.getElementById("btnSkipReplay") as HTMLButtonElement;
  private elSearchingOverlay = document.getElementById("searchingOverlay") as HTMLDivElement;
  private elScrollerLeft = document.getElementById("scrollerLeft") as HTMLDivElement;
  private elScrollerRight = document.getElementById("scrollerRight") as HTMLDivElement;
  private elSearchingResult = document.getElementById("searchingResult") as HTMLDivElement;
  private elResultFlag = document.getElementById("resultFlag") as HTMLDivElement;
  private elResultCar = document.getElementById("resultCar") as HTMLDivElement;
  private elHudPlayerFlag = document.getElementById("hudPlayerFlag") as HTMLImageElement | null;
  private elHudBotFlag = document.getElementById("hudBotFlag") as HTMLImageElement | null;

  // Menu assets / controls
  private elMenuBg = document.getElementById("menuBg") as HTMLImageElement;
  private elMenuLogo = document.getElementById("menuLogo") as HTMLImageElement;
  private elBtnSound = document.getElementById("btnSound") as HTMLButtonElement;
  private elImgSound = document.getElementById("imgSound") as HTMLImageElement;
  private elBtnQuick = document.getElementById("btnQuick") as HTMLButtonElement;
  private elImgQuick = document.getElementById("imgQuick") as HTMLImageElement;
  private elBtnLocal = document.getElementById("btnLocal") as HTMLButtonElement;
  private elImgLocal = document.getElementById("imgLocal") as HTMLImageElement;
  private elCountryStage = document.getElementById("countryStage") as HTMLDivElement;
  private elCountryGrid = document.getElementById("countryGrid") as HTMLDivElement;
  private elBtnCountryBack = document.getElementById("btnCountryBack") as HTMLButtonElement;
  private elCarStage = document.getElementById("carStage") as HTMLDivElement;
  private elCarGrid = document.getElementById("carGrid") as HTMLDivElement;
  private elBtnCarBack = document.getElementById("btnCarBack") as HTMLButtonElement;
  private elBtnRestart = document.getElementById("btnRestart") as HTMLButtonElement;
  private elBtnEndMenu = document.getElementById("btnEndMenu") as HTMLButtonElement;
  private elBtnMenu = document.getElementById("btnMenu") as HTMLButtonElement;
  private elBtnSettings = document.getElementById("btnSettings") as HTMLButtonElement;

  private elSettingsModal = document.getElementById("settingsModal") as HTMLDivElement;
  private elBtnCloseSettings = document.getElementById("btnCloseSettings") as HTMLButtonElement;
  private elToggleMusic = document.getElementById("toggleMusic") as HTMLDivElement;
  private elToggleFx = document.getElementById("toggleFx") as HTMLDivElement;
  private elToggleHaptics = document.getElementById("toggleHaptics") as HTMLDivElement;

  private elInfoModal = document.getElementById("infoModal") as HTMLDivElement;
  private elBtnCloseInfo = document.getElementById("btnCloseInfo") as HTMLButtonElement;

  // Physics settings sliders - removed: now handled dynamically in buildPhysicsPanel()

  private elMobileControls = document.getElementById("mobileControls") as HTMLDivElement;
  private elJoyWrap = document.getElementById("joyWrap") as HTMLDivElement;
  private elJoyStick = document.getElementById("joyStick") as HTMLDivElement;
  private elBtnBoost = document.getElementById("btnBoost") as HTMLButtonElement;
  // Player 2 controls (for LOCAL_2P mode)
  private elJoyWrapP2 = document.getElementById("joyWrapP2") as HTMLDivElement;
  private elJoyStickP2 = document.getElementById("joyStickP2") as HTMLDivElement;
  private elBtnBoostP2 = document.getElementById("btnBoostP2") as HTMLButtonElement;
  
  private elPhysicsPanel = document.getElementById("physicsPanel") as HTMLDivElement;
  private elPhysicsPanelContent = document.getElementById("physicsPanelContent") as HTMLDivElement;
  private elBtnTogglePhysicsPanel = document.getElementById("btnTogglePhysicsPanel") as HTMLButtonElement;
  private elBtnCopyPhysicsSettings = document.getElementById("btnCopyPhysicsSettings") as HTMLButtonElement;
  private elUIPanel = document.getElementById("uiPanel") as HTMLDivElement;
  private elUIPanelContent = document.getElementById("uiPanelContent") as HTMLDivElement;
  private elBtnToggleUIPanel = document.getElementById("btnToggleUIPanel") as HTMLButtonElement;
  private elBtnCopyUISettings = document.getElementById("btnCopyUISettings") as HTMLButtonElement;
  private elImgMenuBtn = document.getElementById("imgMenuBtn") as HTMLImageElement;
  private elImgSettingsBtn = document.getElementById("imgSettingsBtn") as HTMLImageElement;

  // Debug panel
  private elDebugPanel = document.getElementById("debugPanel") as HTMLDivElement;
  private elDebugContent = document.getElementById("debugContent") as HTMLDivElement;
  private elDebugClearBtn = document.getElementById("debugClearBtn") as HTMLButtonElement;
  private debugLogs: Array<{ time: number; level: string; message: string }> = [];
  private maxDebugLogs = 100;

  private carNames = ["blue", "brown", "cyan", "dark blue", "green", "purple", "red", "yellow"];
  private selectedCarIndex = 0;
  private playerCarName = "blue";
  private botCarName = "red";
  private local2PPlayer1Selected = false; // Track if first player has selected in local 2P mode
  private botCountry = "us"; // Bot's selected country
  private matchMode: MatchMode = "BOT";
  private pendingMode: MatchMode = "BOT";

  private countries: Array<{ code: string; name: string }> = [
    { code: "us", name: "United States" },
    { code: "ca", name: "Canada" },
    { code: "mx", name: "Mexico" },
    { code: "br", name: "Brazil" },
    { code: "ar", name: "Argentina" },
    { code: "co", name: "Colombia" },
    { code: "cl", name: "Chile" },
    { code: "pe", name: "Peru" },
    { code: "gb", name: "United Kingdom" },
    { code: "fr", name: "France" },
    { code: "de", name: "Germany" },
    { code: "es", name: "Spain" },
    { code: "it", name: "Italy" },
    { code: "nl", name: "Netherlands" },
    { code: "se", name: "Sweden" },
    { code: "no", name: "Norway" },
    { code: "dk", name: "Denmark" },
    { code: "fi", name: "Finland" },
    { code: "pl", name: "Poland" },
    { code: "cz", name: "Czechia" },
    { code: "at", name: "Austria" },
    { code: "ch", name: "Switzerland" },
    { code: "tr", name: "Türkiye" },
    { code: "gr", name: "Greece" },
    { code: "ua", name: "Ukraine" },
    { code: "za", name: "South Africa" },
    { code: "ng", name: "Nigeria" },
    { code: "eg", name: "Egypt" },
    { code: "sa", name: "Saudi Arabia" },
    { code: "ae", name: "United Arab Emirates" },
    { code: "in", name: "India" },
    { code: "cn", name: "China" },
    { code: "jp", name: "Japan" },
    { code: "kr", name: "South Korea" },
    { code: "id", name: "Indonesia" },
    { code: "th", name: "Thailand" },
    { code: "vn", name: "Vietnam" },
    { code: "ph", name: "Philippines" },
    { code: "au", name: "Australia" },
    { code: "ke", name: "Kenya" },
  ];
  private selectedCountry = "gb";

  private carImages = new Map<string, HTMLImageElement>();
  private carLoadPromise: Promise<void> | null = null;
  private flagImages = new Map<string, HTMLImageElement>(); // Preloaded flag images

  constructor() {
    this.canvas = document.getElementById("game") as HTMLCanvasElement;
    if (!this.canvas) {
      this.debugLog("error", "Canvas element not found!");
      throw new Error("Canvas element not found");
    }
    
    const c = this.canvas.getContext("2d");
    if (!c) {
      this.debugLog("error", "2D context not available");
      throw new Error("2D context not available");
    }
    this.ctx = c;
    
    // Initialize debug panel
    if (this.elDebugContent) {
      this.debugLog("info", "Debug panel initialized");
    } else {
      console.warn("[GoalDuelGame] Debug panel elements not found");
    }
    
    // Log canvas context info
    const dpr = window.devicePixelRatio || 1;
    this.debugLog("info", `Canvas initialized: ${this.canvas.width}x${this.canvas.height}, DPR=${dpr}, context=${this.ctx ? "OK" : "FAIL"}`);

    this.settings = this.loadSettings();
    this.audio = new AudioManager(this.settings);

    this.engine = Engine.create();
    this.world = this.engine.world;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;

    this.bindUI();
    this.bindInput();
    this.buildWorld();
    this.initMenuAssets();
    // Load SFX files asynchronously
    this.audio.loadSFX().catch((e) => {
      console.error("[Game] Failed to load SFX files:", e);
    });
    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.setState("MENU", true);
    // Start music from main menu - try immediately and also on first user interaction
    this.audio.ensure();
    if (this.settings.music) {
      this.audio.startMusic();
    }
    
    // Also try to start music on first user interaction (for browsers that block autoplay)
    const startMusicOnInteraction = () => {
      if (this.settings.music) {
        this.audio.ensure();
        this.audio.startMusic();
      }
      // Remove listeners after first interaction
      document.removeEventListener("click", startMusicOnInteraction);
      document.removeEventListener("touchstart", startMusicOnInteraction);
      document.removeEventListener("keydown", startMusicOnInteraction);
    };
    document.addEventListener("click", startMusicOnInteraction, { once: true });
    document.addEventListener("touchstart", startMusicOnInteraction, { once: true });
    document.addEventListener("keydown", startMusicOnInteraction, { once: true });
    
    requestAnimationFrame((t) => this.loop(t));
  }

  private loadSettings(): Settings {
    const defaults: Settings = {
      music: true,
      fx: true,
      haptics: true,
      // Physics defaults (user-optimized values)
      carWidth: 73,
      carHeight: 60,
      carBoundsWidth: 1,
      carBoundsHeight: 2.8, // Increased by 40% (2 * 1.4 = 2.8)
      carSpriteWidth: 78,
      carSpriteHeight: 150,
      ballRadius: 13,
      ballBoundsScale: 2.8, // Increased by 40% (2 * 1.4 = 2.8)
      ballSpriteSize: 40,
      carMaxSpeed: 20,
      carMaxSpeedBoost: 25,
      carForce: 0.0099,
      carForceBoost: 0.01,
      carTurnRate: 0.08,
      carFriction: 0.01,
      carFrictionAir: 0.02,
      carRestitution: 0.4,
      carDensity: 0.002,
      ballRestitution: 0.98, // Very bouncy
      ballFriction: 0.0001, // Very low friction (slippery)
      ballFrictionAir: 0.005, // Lower air friction
      ballDensity: 0.0012,
      // Stadium bounds defaults (user-optimized values)
      fieldWidth: 1050,
      fieldHeight: 2220,
      goalWidth: 295,
      goalHeight: 54,
      goalDepth: 115,
      // VFX defaults
      vfxBoostClouds: true,
      vfxDrifting: true,
      vfxBumping: true,
      showCarBounds: false, // Debug: show car collision bounds
      vfxBoostCloudIntensity: 2,
      vfxDriftIntensity: 1.5,
      vfxBumpIntensity: 1.3,
      // Camera defaults
      cameraZoomSpeedFactor: 0.12,
      cameraZoomBallFactor: 0.12,
      cameraZoomSmoothness: 11,
      // UI defaults - Menu
      uiMenuLogoSize: 520,
      uiMenuLogoSizeMobile: 62,
      uiMenuButtonWideWidth: 320,
      uiMenuButtonWideWidthMobile: 280,
      uiMenuButtonGap: 14,
      uiMenuButtonGapMobile: 6,
      uiMenuIconButtonSize: 76,
      uiMenuIconButtonSizeMobile: 90,
      // UI defaults - Country/Car Picker
      uiFlagGap: 2,
      uiFlagGapMobile: 3,
      uiFlagPadding: 2,
      uiFlagPaddingMobile: 3,
      uiFlagBorderWidth: 1.5,
      uiFlagBorderWidthMobile: 1.5,
      uiPanelPadding: 18,
      uiPanelPaddingMobile: 16,
      uiTitleSize: 14,
      uiSubtitleSize: 12,
      // UI defaults - Game HUD
      uiHudFontSize: 10,
      uiHudFontSizeMobile: 9,
      uiHudScoreSize: 16,
      uiHudScoreSizeMobile: 14,
      uiHudSpacing: 6,
      uiHudSpacingMobile: 5,
      uiHudTopOffset: 0,
      uiHudTopOffsetMobile: 0,
    };
    try {
      const saved = localStorage.getItem("gameSettings");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Settings>;
        // Remove old zoom property if it exists
        if ("zoom" in parsed) delete (parsed as any).zoom;
        if ("zoomedOut" in parsed) delete (parsed as any).zoomedOut;
        // Merge with defaults to ensure all properties exist
        return { ...defaults, ...parsed };
      }
    } catch {}
    return defaults;
  }

  private initMenuAssets(): void {
    const urlBg = new URL("../assets/background/menu.png", import.meta.url).toString();
    const urlPanel = new URL("../assets/background/panel.png", import.meta.url).toString();
    const urlGameBg = new URL("../assets/background/game.png", import.meta.url).toString();
    const urlLogo = new URL("../assets/icons/Logo.png", import.meta.url).toString();
    const urlGoal = new URL("../assets/icons/Goal.png", import.meta.url).toString();
    const urlQuick = new URL("../assets/buttons/quick match.png", import.meta.url).toString();
    const urlLocal = new URL("../assets/buttons/local 2 players.png", import.meta.url).toString();
    const urlMenu = new URL("../assets/buttons/menu.png", import.meta.url).toString();
    const urlPlay = new URL("../assets/buttons/play.png", import.meta.url).toString();
    const urlSoundOn = new URL("../assets/buttons/sound on.png", import.meta.url).toString();
    const urlSoundOff = new URL("../assets/buttons/sound off.png", import.meta.url).toString();
    const urlBack = new URL("../assets/buttons/back.png", import.meta.url).toString();
    const urlSettings = new URL("../assets/buttons/settings.png", import.meta.url).toString();

    this.elMenuBg.src = urlBg;
    this.elMenuLogo.src = urlLogo;
    this.elImgQuick.src = urlQuick;
    this.elImgLocal.src = urlLocal;
    this.elImgEndPlay.src = urlPlay;
    this.elImgEndMenu.src = urlMenu;
    if (this.elImgMenuBtn) this.elImgMenuBtn.src = urlBack;
    if (this.elImgSettingsBtn) this.elImgSettingsBtn.src = urlSettings;
    // Panel backgrounds removed - using fog overlay instead
    this.stadiumBg.onerror = () => {
      this.debugLog("error", `Failed to load stadium background image: ${urlGameBg}`);
      console.error("[Game] Failed to load stadium background");
    };
    this.stadiumBg.onload = () => {
      this.debugLog("info", `Stadium BG loaded: ${this.stadiumBg.naturalWidth}x${this.stadiumBg.naturalHeight}`);
      console.log("[Game] Loaded stadium background");
    };
    this.stadiumBg.src = urlGameBg;
    
    this.goalImage.onerror = () => {
      this.debugLog("error", `Failed to load goal image: ${urlGoal}`);
      console.error("[Game] Failed to load goal image");
    };
    this.goalImage.onload = () => {
      this.debugLog("info", `Goal image loaded: ${this.goalImage.naturalWidth}x${this.goalImage.naturalHeight}`);
      console.log("[Game] Loaded goal image");
    };
    this.goalImage.src = urlGoal;

    const savedCar = (() => {
      try {
        return localStorage.getItem("goalDuelCar");
      } catch {
        return null;
      }
    })();
    if (savedCar && this.carNames.includes(savedCar)) {
      this.selectedCarIndex = this.carNames.indexOf(savedCar);
    }
    this.playerCarName = this.carNames[this.selectedCarIndex] ?? "blue";

    const savedCountry = (() => {
      try {
        return localStorage.getItem("goalDuelCountry");
      } catch {
        return null;
      }
    })();
    if (savedCountry && this.countries.some((c) => c.code === savedCountry)) {
      this.selectedCountry = savedCountry;
    }

    // Preload car images using static imports (iOS WebView compatibility)
    const carLoadPromises: Promise<void>[] = [];
    for (const name of this.carNames) {
      const importUrl = CAR_IMPORTS[name];
      if (!importUrl) {
        console.error("[Game] No import URL for car:", name);
        continue;
      }
      
      const img = new Image();
      const loadPromise = new Promise<void>((resolve, reject) => {
        img.onerror = () => {
          console.error("[Game] Failed to load car image:", name);
          this.debugLog("error", `Failed to load car: ${name}`);
          // Don't reject - allow game to continue with fallback rendering
          resolve();
        };
        img.onload = () => {
          console.log("[Game] Loaded car image:", name);
          this.debugLog("info", `Car loaded: ${name} (${img.naturalWidth}x${img.naturalHeight})`);
          resolve();
        };
        img.src = importUrl;
      });
      carLoadPromises.push(loadPromise);
      this.carImages.set(name, img);
    }
    
    // Store promise to wait for assets before starting match
    this.carLoadPromise = Promise.all(carLoadPromises).then(() => {
      console.log("[Game] All car images loaded");
    }).catch((err) => {
      console.error("[Game] Some car images failed to load:", err);
    });

    // Preload flag images (same way as car images - eagerly)
    for (const country of this.countries) {
      const url = `https://hatscripts.github.io/circle-flags/flags/${country.code}.svg`;
      const img = new Image();
      img.onerror = () => {
        console.error("[Game] Failed to load flag image:", country.code, url);
      };
      img.onload = () => {
        console.log("[Game] Loaded flag image:", country.code);
      };
      img.src = url; // Load eagerly
      this.flagImages.set(country.code, img);
    }

    // Sound icon
    this.elImgSound.src = this.settings.music ? urlSoundOn : urlSoundOff;

    this.buildCountryUI();
    this.buildCarUI();
  }

  private buildCountryUI(): void {
    // Countries
    if (!this.elCountryGrid) {
      console.error("[Game] countryGrid element not found");
      return;
    }
    
    this.elCountryGrid.innerHTML = "";
    for (const c of this.countries) {
      const btn = document.createElement("button");
      btn.className = "flagBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", c.name);
      btn.dataset.code = c.code;

      const img = document.createElement("img");
      img.alt = c.name;
      // Use preloaded flag image if available, otherwise load eagerly
      const preloadedFlag = this.flagImages.get(c.code);
      if (preloadedFlag && preloadedFlag.complete && preloadedFlag.naturalWidth > 0) {
        img.src = preloadedFlag.src;
      } else {
        img.loading = "eager"; // Load eagerly, not lazily
        img.src = "https://hatscripts.github.io/circle-flags/flags/" + c.code + ".svg";
      }
      
      // Error handling for image load
      img.onerror = () => {
        console.warn("[Game] Failed to load flag for", c.code);
        // Fallback: create a colored circle
        img.style.display = "none";
        btn.style.backgroundColor = `hsl(${(c.code.charCodeAt(0) * 137.5) % 360}, 70%, 50%)`;
      };

      btn.appendChild(img);
      btn.addEventListener("click", () => {
        this.audio.ensure();
        this.audio.uiTap();
        this.triggerHaptic("light");
        this.setCountry(c.code);
        this.fadeScene(() => {
          this.showCountryPicker(false);
          this.refreshCarUI();
          this.showCarPicker(true);
        });
      });

      this.elCountryGrid.appendChild(btn);
    }
    this.refreshCountryUI();
  }

  private setCountry(code: string): void {
    if (!this.countries.some((c) => c.code === code)) return;
    this.selectedCountry = code;
    try {
      localStorage.setItem("goalDuelCountry", code);
    } catch {}
    this.refreshCountryUI();
  }

  private refreshCountryUI(): void {
    for (const el of Array.from(this.elCountryGrid.querySelectorAll<HTMLButtonElement>(".flagBtn"))) {
      const code = el.dataset.code ?? "";
      if (code === this.selectedCountry) el.classList.add("selected");
      else el.classList.remove("selected");
    }
  }

  private showCountryPicker(open: boolean): void {
    if (open) {
      // Rebuild UI when opening to ensure flags are loaded
      this.buildCountryUI();
      this.elCountryStage.classList.remove("hidden");
    } else {
      this.elCountryStage.classList.add("hidden");
    }
  }

  private buildCarUI(): void {
    if (!this.elCarGrid) {
      console.error("[Game] carGrid element not found");
      return;
    }
    
    this.elCarGrid.innerHTML = "";
    for (const name of this.carNames) {
      const btn = document.createElement("button");
      btn.className = "carSkinBtn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Car " + name);
      btn.dataset.name = name;

      const img = document.createElement("img");
      img.alt = name;
      img.decoding = "async";
      // Reduce sprite size in selection panel
      img.style.width = "60px";
      img.style.height = "auto";
      img.style.objectFit = "contain";
      const carImg = this.carImages.get(name);
      if (carImg && carImg.naturalWidth > 0 && carImg.naturalHeight > 0) {
        img.src = carImg.src;
      } else {
        // Fallback: use static import if available
        const importUrl = CAR_IMPORTS[name];
        if (importUrl) {
          img.src = importUrl;
        } else {
          console.error("[Game] No import URL for car in UI:", name);
        }
        img.onerror = () => {
          console.error("[Game] Failed to load car image in UI:", name);
        };
      }
      btn.appendChild(img);

      btn.addEventListener("click", () => {
        this.audio.ensure();
        this.audio.uiTap();
        this.triggerHaptic("light");
        
        if (this.pendingMode === "LOCAL_2P") {
          // For local 2P mode
          if (!this.local2PPlayer1Selected) {
            // First player selects car
            this.setCarSkin(name);
            this.local2PPlayer1Selected = true;
            this.fadeScene(() => {
              // Keep car picker open for second player, update title
              this.showCarPicker(true);
            });
          } else {
            // Second player selects car (this becomes botCarName for local 2P)
            this.botCarName = name;
            this.fadeScene(() => {
              this.showCarPicker(false);
              // Start match directly for local 2P
              this.startMatch();
            });
          }
        } else {
          // For BOT mode
          this.setCarSkin(name);
          this.fadeScene(() => {
            this.showCarPicker(false);
            this.startSearching(this.pendingMode);
            this.pendingMode = "BOT";
          });
        }
      });

      this.elCarGrid.appendChild(btn);
    }

    this.refreshCarUI();
  }

  private setCarSkin(name: string): void {
    if (!this.carNames.includes(name)) return;
    this.playerCarName = name;
    this.selectedCarIndex = this.carNames.indexOf(name);
    try {
      localStorage.setItem("goalDuelCar", name);
    } catch {}
    this.refreshCarUI();
  }

  private refreshCarUI(): void {
    for (const el of Array.from(this.elCarGrid.querySelectorAll<HTMLButtonElement>(".carSkinBtn"))) {
      const name = el.dataset.name ?? "";
      if (name === this.playerCarName) el.classList.add("selected");
      else el.classList.remove("selected");
    }
  }

  private showCarPicker(open: boolean): void {
    if (open) {
      // Rebuild UI when opening to ensure car images are loaded
      this.buildCarUI();
      // Update title for local 2P mode
      if (this.pendingMode === "LOCAL_2P") {
        const carTitle = this.elCarStage.querySelector(".countryTitle");
        const carSub = this.elCarStage.querySelector(".countrySub");
        if (carTitle && carSub) {
          if (this.local2PPlayer1Selected) {
            carTitle.textContent = "Player 2: Choose your car";
            carSub.textContent = "Tap a car to start the match";
          } else {
            carTitle.textContent = "Player 1: Choose your car";
            carSub.textContent = "Tap a car to continue";
          }
        }
      }
      this.elCarStage.classList.remove("hidden");
    } else {
      this.elCarStage.classList.add("hidden");
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("gameSettings", JSON.stringify(this.settings));
    } catch {}
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private submitFinalScore(): void {
    const score = Math.max(0, Math.floor(this.playerScore));
    console.log("[GoalDuelGame.submitFinalScore] score", score);
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(score);
    }
  }

  private bindUI(): void {
    const tap = () => {
      this.audio.ensure();
      this.audio.uiTap();
      this.triggerHaptic("light");
    };

    this.elBtnQuick.addEventListener("click", () => {
      tap();
      this.pendingMode = "BOT";
      this.fadeScene(() => {
        this.refreshCountryUI();
        this.showCountryPicker(true);
      });
    });

    this.elBtnLocal.addEventListener("click", () => {
      tap();
      this.pendingMode = "LOCAL_2P";
      this.local2PPlayer1Selected = false;
      this.playerCarName = ""; // Reset player car selection
      this.fadeScene(() => {
        // Skip country picker for local 2P, go straight to car picker
        this.refreshCarUI();
        this.showCarPicker(true);
      });
    });

    this.elBtnSound.addEventListener("click", () => {
      tap();
      this.settings.music = !this.settings.music;
      this.saveSettings();
      this.syncSettingsUI();
      this.audio.setSettings(this.settings);
      if (this.settings.music) this.audio.startMusic();
      else this.audio.stopMusic();
      const urlSoundOn = new URL("../assets/buttons/sound on.png", import.meta.url).toString();
      const urlSoundOff = new URL("../assets/buttons/sound off.png", import.meta.url).toString();
      this.elImgSound.src = this.settings.music ? urlSoundOn : urlSoundOff;
    });


    this.elBtnCountryBack.addEventListener("click", () => {
      tap();
      this.fadeScene(() => {
        this.showCountryPicker(false);
      });
    });

    this.elBtnCarBack.addEventListener("click", () => {
      tap();
      this.fadeScene(() => {
        this.showCarPicker(false);
        this.refreshCountryUI();
        this.showCountryPicker(true);
      });
    });

    if (this.elBtnSettings) {
      this.elBtnSettings.addEventListener("click", () => {
        tap();
        // Settings panel temporarily disabled
        this.showSettings(true);
      });
    }

    // Physics panel (internal buttons only, no toggle)
    this.elBtnTogglePhysicsPanel.addEventListener("click", () => {
      tap();
      this.togglePhysicsPanel();
    });
    this.elBtnCopyPhysicsSettings.addEventListener("click", () => {
      tap();
      this.copyPhysicsSettings();
    });

    // UI panel (internal buttons only, no toggle)
    this.elBtnToggleUIPanel.addEventListener("click", () => {
      tap();
      this.toggleUIPanel();
    });

    this.elBtnCopyUISettings.addEventListener("click", () => {
      tap();
      this.copyUISettings();
    });

    this.elBtnCloseSettings.addEventListener("click", () => {
      tap();
      this.showSettings(false);
    });

    this.elSettingsModal.addEventListener("click", (e) => {
      if (e.target === this.elSettingsModal) {
        tap();
        this.showSettings(false);
      }
    });

    this.elDebugClearBtn?.addEventListener("click", () => {
      this.clearDebugLogs();
      this.debugLog("info", "Debug logs cleared");
    });

    this.elBtnCloseInfo.addEventListener("click", () => {
      tap();
      this.showInfo(false);
    });
    this.elInfoModal.addEventListener("click", (e) => {
      if (e.target === this.elInfoModal) {
        tap();
        this.showInfo(false);
      }
    });

    const bindSwitch = (el: HTMLDivElement, key: "music" | "fx" | "haptics") => {
      const toggle = () => {
        tap();
        this.settings[key] = !this.settings[key];
        this.saveSettings();
        this.syncSettingsUI();
        this.audio.setSettings(this.settings);
        if (key === "music") {
          if (this.settings.music) this.audio.startMusic();
          else this.audio.stopMusic();
        }
      };
      el.addEventListener("click", toggle);
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") toggle();
      });
    };

    bindSwitch(this.elToggleMusic, "music");
    bindSwitch(this.elToggleFx, "fx");
    bindSwitch(this.elToggleHaptics, "haptics");

    // Physics settings sliders - now handled dynamically in buildPhysicsPanel()

    if (this.elBtnMenu) {
      this.elBtnMenu.addEventListener("click", () => {
        tap();
        this.toMenu();
      });
    }

    this.elBtnSkipReplay.addEventListener("click", () => {
      tap();
      this.skipReplay();
    });

    this.elBtnRestart.addEventListener("click", () => {
      tap();
      this.elEnd.classList.add("hidden");
      this.startSearching("BOT");
    });
    this.elBtnEndMenu.addEventListener("click", () => {
      tap();
      this.elEnd.classList.add("hidden");
      this.toMenu();
    });
  }

  private syncSettingsUI(): void {
    const set = (el: HTMLDivElement, on: boolean) => {
      if (on) el.classList.add("on");
      else el.classList.remove("on");
      el.setAttribute("aria-checked", on ? "true" : "false");
    };
    set(this.elToggleMusic, this.settings.music);
    set(this.elToggleFx, this.settings.fx);
    set(this.elToggleHaptics, this.settings.haptics);

    // Physics sliders are synced dynamically in buildPhysicsPanel()
  }

  private showSettings(open: boolean): void {
    if (open) {
      this.syncSettingsUI();
      this.elSettingsModal.classList.add("visible");
      this.elSettingsModal.removeAttribute("inert");
      // Show the settings card when opening settings
      const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
      if (settingsCard) {
        (settingsCard as HTMLElement).style.display = "";
      }
    } else {
      // Hide the settings card when closing, but keep modal visible for controls during gameplay
      const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
      if (settingsCard) {
        (settingsCard as HTMLElement).style.display = "none";
      }
      // Keep the modal visible for controls if in playing state
      if (this.state === "PLAYING" || this.state === "GOAL") {
        this.elSettingsModal.classList.add("visible");
        this.elSettingsModal.removeAttribute("inert");
    } else {
      this.elSettingsModal.classList.remove("visible");
      this.elSettingsModal.setAttribute("inert", "");
      }
    }
  }

  private buildPhysicsPanel(): void {
    const physicsSettings = [
      { key: "carWidth", label: "Car Width", desc: "Physics body width", min: 20, max: 100, step: 1, format: (v: number) => String(v) },
      { key: "carHeight", label: "Car Height", desc: "Physics body height", min: 10, max: 60, step: 1, format: (v: number) => String(v) },
      { key: "carBoundsWidth", label: "Car Bounds Width", desc: "Width multiplier for collision bounds", min: 0.1, max: 10.0, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "carBoundsHeight", label: "Car Bounds Height", desc: "Height multiplier for collision bounds", min: 0.1, max: 10.0, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "carSpriteWidth", label: "Car Sprite Width", desc: "Visual sprite width", min: 20, max: 120, step: 1, format: (v: number) => String(v) },
      { key: "carSpriteHeight", label: "Car Sprite Height", desc: "Visual sprite height", min: 20, max: 200, step: 1, format: (v: number) => String(v) },
      { key: "ballRadius", label: "Ball Radius", desc: "Physics ball size", min: 4, max: 20, step: 0.5, format: (v: number) => v.toFixed(1) },
      { key: "ballBoundsScale", label: "Ball Bounds Scale", desc: "Scale collision bounds to match sprite", min: 0.1, max: 10.0, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "ballSpriteSize", label: "Ball Sprite Size", desc: "Visual ball size", min: 4, max: 40, step: 1, format: (v: number) => String(v) },
      { key: "carMaxSpeed", label: "Car Max Speed", desc: "Normal max speed", min: 4, max: 20, step: 0.1, format: (v: number) => v.toFixed(1) },
      { key: "carMaxSpeedBoost", label: "Car Max Speed (Boost)", desc: "Boost max speed", min: 6, max: 25, step: 0.1, format: (v: number) => v.toFixed(1) },
      { key: "carForce", label: "Car Force", desc: "Normal acceleration", min: 0.001, max: 0.01, step: 0.0001, format: (v: number) => v.toFixed(4) },
      { key: "carForceBoost", label: "Car Force (Boost)", desc: "Boost acceleration", min: 0.001, max: 0.01, step: 0.0001, format: (v: number) => v.toFixed(4) },
      { key: "carTurnRate", label: "Car Turn Rate", desc: "Steering responsiveness", min: 0.01, max: 0.2, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "carFriction", label: "Car Friction", desc: "Ground friction", min: 0, max: 0.1, step: 0.001, format: (v: number) => v.toFixed(3) },
      { key: "carFrictionAir", label: "Car Air Friction", desc: "Air resistance", min: 0, max: 0.5, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "carRestitution", label: "Car Restitution", desc: "Bounce factor", min: 0, max: 1, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "carDensity", label: "Car Density", desc: "Mass factor", min: 0.0005, max: 0.01, step: 0.0001, format: (v: number) => v.toFixed(4) },
      { key: "ballRestitution", label: "Ball Restitution", desc: "Ball bounce", min: 0, max: 1, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "ballFriction", label: "Ball Friction", desc: "Ball ground friction", min: 0, max: 0.01, step: 0.0001, format: (v: number) => v.toFixed(4) },
      { key: "ballFrictionAir", label: "Ball Air Friction", desc: "Ball air resistance", min: 0, max: 0.1, step: 0.001, format: (v: number) => v.toFixed(3) },
      { key: "ballDensity", label: "Ball Density", desc: "Ball mass factor", min: 0.0005, max: 0.01, step: 0.0001, format: (v: number) => v.toFixed(4) },
      { key: "fieldWidth", label: "Field Width", desc: "Stadium width", min: 400, max: 1200, step: 10, format: (v: number) => String(v) },
      { key: "fieldHeight", label: "Field Height", desc: "Stadium height", min: 600, max: 4000, step: 10, format: (v: number) => String(v) },
      { key: "goalWidth", label: "Goal Width", desc: "Goal opening width", min: 100, max: 400, step: 5, format: (v: number) => String(v) },
      { key: "goalHeight", label: "Goal Height", desc: "Goal opening height", min: 20, max: 100, step: 2, format: (v: number) => String(v) },
      { key: "goalDepth", label: "Goal Depth", desc: "Goal depth", min: 50, max: 200, step: 5, format: (v: number) => String(v) },
      // VFX settings
      { key: "vfxBoostClouds", label: "Boost Clouds", desc: "Enable boost cloud VFX", min: 0, max: 1, step: 1, format: (v: number) => v > 0.5 ? "On" : "Off", isToggle: true },
      { key: "vfxDrifting", label: "Drift Effects", desc: "Enable drift VFX", min: 0, max: 1, step: 1, format: (v: number) => v > 0.5 ? "On" : "Off", isToggle: true },
      { key: "vfxBumping", label: "Bump Effects", desc: "Enable collision VFX", min: 0, max: 1, step: 1, format: (v: number) => v > 0.5 ? "On" : "Off", isToggle: true },
      { key: "vfxBoostCloudIntensity", label: "Boost Cloud Intensity", desc: "Boost cloud particle intensity", min: 0, max: 2, step: 0.1, format: (v: number) => v.toFixed(1) },
      { key: "vfxDriftIntensity", label: "Drift Intensity", desc: "Drift particle intensity", min: 0, max: 2, step: 0.1, format: (v: number) => v.toFixed(1) },
      { key: "vfxBumpIntensity", label: "Bump Intensity", desc: "Collision particle intensity", min: 0, max: 2, step: 0.1, format: (v: number) => v.toFixed(1) },
      // Camera settings
      { key: "cameraZoomSpeedFactor", label: "Speed Zoom Factor", desc: "Zoom change based on speed", min: 0, max: 0.5, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "cameraZoomBallFactor", label: "Ball Zoom Factor", desc: "Zoom change based on ball distance", min: 0, max: 0.5, step: 0.01, format: (v: number) => v.toFixed(2) },
      { key: "cameraZoomSmoothness", label: "Zoom Smoothness", desc: "Camera zoom transition speed", min: 1, max: 20, step: 0.5, format: (v: number) => v.toFixed(1) },
    ];

    this.elPhysicsPanelContent.innerHTML = "";
    physicsSettings.forEach((setting) => {
      const row = document.createElement("div");
      row.className = "physicsToggleRow";
      const rawValue = (this.settings as any)[setting.key];
      const value = (setting as any).isToggle ? (rawValue ? 1 : 0) : rawValue;
      row.innerHTML = `
        <div class="label">
          <span>${setting.label}</span>
          <small>${setting.desc}</small>
        </div>
        <div class="sliderContainer">
          <input type="range" id="physics_${setting.key}" min="${setting.min}" max="${setting.max}" step="${setting.step}" value="${value}" />
          <span class="value" id="physics_${setting.key}_value">${setting.format(value)}</span>
        </div>
      `;
      this.elPhysicsPanelContent.appendChild(row);

      const slider = document.getElementById(`physics_${setting.key}`) as HTMLInputElement;
      const valueSpan = document.getElementById(`physics_${setting.key}_value`) as HTMLSpanElement;
      slider.addEventListener("input", () => {
        let val = parseFloat(slider.value);
        if ((setting as any).isToggle) {
          val = val > 0.5 ? 1 : 0;
          (this.settings as any)[setting.key] = val > 0.5;
        } else {
          (this.settings as any)[setting.key] = val;
        }
        valueSpan.textContent = setting.format(val);
        this.saveSettings();
        if (this.state === "PLAYING" || this.state === "GOAL") {
          this.rebuildWorldWithNewPhysics();
        }
      });
    });
  }

  private togglePhysicsPanel(): void {
    const isHidden = this.elPhysicsPanel.classList.contains("hidden");
    if (isHidden) {
      this.elPhysicsPanel.classList.remove("hidden");
      this.buildPhysicsPanel();
      this.buildUIPanel();
      this.applyUISettings();
    } else {
      this.elPhysicsPanel.classList.add("hidden");
    }
  }

  private copyPhysicsSettings(): void {
    // Extract only physics settings (exclude music, fx, haptics)
    const physicsSettings: any = {
      carWidth: this.settings.carWidth,
      carHeight: this.settings.carHeight,
      carBoundsWidth: this.settings.carBoundsWidth,
      carBoundsHeight: this.settings.carBoundsHeight,
      carSpriteWidth: this.settings.carSpriteWidth,
      carSpriteHeight: this.settings.carSpriteHeight,
      ballRadius: this.settings.ballRadius,
      ballBoundsScale: this.settings.ballBoundsScale,
      ballSpriteSize: this.settings.ballSpriteSize,
      carMaxSpeed: this.settings.carMaxSpeed,
      carMaxSpeedBoost: this.settings.carMaxSpeedBoost,
      carForce: this.settings.carForce,
      carForceBoost: this.settings.carForceBoost,
      carTurnRate: this.settings.carTurnRate,
      carFriction: this.settings.carFriction,
      carFrictionAir: this.settings.carFrictionAir,
      carRestitution: this.settings.carRestitution,
      carDensity: this.settings.carDensity,
      ballRestitution: this.settings.ballRestitution,
      ballFriction: this.settings.ballFriction,
      ballFrictionAir: this.settings.ballFrictionAir,
      ballDensity: this.settings.ballDensity,
      fieldWidth: this.settings.fieldWidth,
      fieldHeight: this.settings.fieldHeight,
      goalWidth: this.settings.goalWidth,
      goalHeight: this.settings.goalHeight,
      goalDepth: this.settings.goalDepth,
      // VFX settings
      vfxBoostClouds: this.settings.vfxBoostClouds,
      vfxDrifting: this.settings.vfxDrifting,
      vfxBumping: this.settings.vfxBumping,
      vfxBoostCloudIntensity: this.settings.vfxBoostCloudIntensity,
      vfxDriftIntensity: this.settings.vfxDriftIntensity,
      vfxBumpIntensity: this.settings.vfxBumpIntensity,
      // Camera settings
      cameraZoomSpeedFactor: this.settings.cameraZoomSpeedFactor,
      cameraZoomBallFactor: this.settings.cameraZoomBallFactor,
      cameraZoomSmoothness: this.settings.cameraZoomSmoothness,
    };

    const jsonString = JSON.stringify(physicsSettings, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonString).then(() => {
      // Visual feedback
      const btn = this.elBtnCopyPhysicsSettings;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
        </svg>
      `;
      btn.style.color = "rgba(183, 255, 74, 1)";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
      }, 2000);
      
      console.log("[Game] Physics settings copied to clipboard:");
      console.log(jsonString);
    }).catch((err) => {
      console.error("[Game] Failed to copy settings:", err);
      alert("Failed to copy settings. Check console for the JSON.");
    });
  }

  private buildUIPanel(): void {
    // Determine which settings to show based on current scene
    const isMenu = this.state === "MENU" || (this.state as string) === "COUNTRY_PICKER" || (this.state as string) === "CAR_PICKER";
    
    let uiSettings: Array<{ key: string; label: string; desc: string; min: number; max: number; step: number; format: (v: number) => string }> = [];
    
    if (isMenu) {
      // Menu scene settings
      uiSettings = [
        { key: "uiMenuLogoSize", label: "Logo Size (Desktop)", desc: "Menu logo max width (vw)", min: 40, max: 80, step: 1, format: (v: number) => String(v) },
        { key: "uiMenuLogoSizeMobile", label: "Logo Size (Mobile)", desc: "Menu logo max width (vw)", min: 50, max: 80, step: 1, format: (v: number) => String(v) },
        { key: "uiMenuButtonWideWidth", label: "Wide Button Width (Desktop)", desc: "Quick Match button width (px)", min: 200, max: 400, step: 10, format: (v: number) => String(v) },
        { key: "uiMenuButtonWideWidthMobile", label: "Wide Button Width (Mobile)", desc: "Quick Match button width (vw)", min: 60, max: 90, step: 1, format: (v: number) => String(v) },
        { key: "uiMenuButtonGap", label: "Button Gap (Desktop)", desc: "Space between menu buttons", min: 6, max: 20, step: 1, format: (v: number) => String(v) },
        { key: "uiMenuButtonGapMobile", label: "Button Gap (Mobile)", desc: "Space between menu buttons on mobile", min: 4, max: 12, step: 1, format: (v: number) => String(v) },
        { key: "uiMenuIconButtonSize", label: "Icon Button Size (Desktop)", desc: "Tutorial/Sound button size", min: 50, max: 100, step: 2, format: (v: number) => String(v) },
        { key: "uiMenuIconButtonSizeMobile", label: "Icon Button Size (Mobile)", desc: "Tutorial/Sound button size on mobile", min: 60, max: 120, step: 2, format: (v: number) => String(v) },
        // Country/Car picker settings (shown in menu too)
        { key: "uiFlagGap", label: "Flag Gap (Desktop)", desc: "Space between flags", min: 2, max: 15, step: 1, format: (v: number) => String(v) },
        { key: "uiFlagGapMobile", label: "Flag Gap (Mobile)", desc: "Space between flags on mobile", min: 2, max: 20, step: 1, format: (v: number) => String(v) },
        { key: "uiFlagPadding", label: "Flag Padding (Desktop)", desc: "Flag button padding", min: 1, max: 8, step: 0.5, format: (v: number) => v.toFixed(1) },
        { key: "uiFlagPaddingMobile", label: "Flag Padding (Mobile)", desc: "Flag button padding on mobile", min: 1, max: 10, step: 0.5, format: (v: number) => v.toFixed(1) },
        { key: "uiFlagBorderWidth", label: "Flag Border (Desktop)", desc: "Flag border width", min: 0.5, max: 4, step: 0.5, format: (v: number) => v.toFixed(1) },
        { key: "uiFlagBorderWidthMobile", label: "Flag Border (Mobile)", desc: "Flag border width on mobile", min: 0.5, max: 4, step: 0.5, format: (v: number) => v.toFixed(1) },
        { key: "uiPanelPadding", label: "Panel Padding (Desktop)", desc: "Country panel padding", min: 8, max: 30, step: 1, format: (v: number) => String(v) },
        { key: "uiPanelPaddingMobile", label: "Panel Padding (Mobile)", desc: "Country panel padding on mobile", min: 8, max: 30, step: 1, format: (v: number) => String(v) },
        { key: "uiTitleSize", label: "Title Font Size", desc: "Country title font size", min: 10, max: 20, step: 1, format: (v: number) => String(v) },
        { key: "uiSubtitleSize", label: "Subtitle Font Size", desc: "Subtitle font size", min: 8, max: 16, step: 1, format: (v: number) => String(v) },
      ];
    } else {
      // Game scene settings
      uiSettings = [
        { key: "uiHudFontSize", label: "HUD Font Size (Desktop)", desc: "HUD text font size", min: 10, max: 20, step: 1, format: (v: number) => String(v) },
        { key: "uiHudFontSizeMobile", label: "HUD Font Size (Mobile)", desc: "HUD text font size on mobile", min: 10, max: 18, step: 1, format: (v: number) => String(v) },
        { key: "uiHudScoreSize", label: "Score Font Size (Desktop)", desc: "Score display font size", min: 16, max: 36, step: 2, format: (v: number) => String(v) },
        { key: "uiHudScoreSizeMobile", label: "Score Font Size (Mobile)", desc: "Score display font size on mobile", min: 14, max: 32, step: 2, format: (v: number) => String(v) },
        { key: "uiHudSpacing", label: "HUD Spacing (Desktop)", desc: "Space between HUD elements", min: 6, max: 20, step: 1, format: (v: number) => String(v) },
        { key: "uiHudSpacingMobile", label: "HUD Spacing (Mobile)", desc: "Space between HUD elements on mobile", min: 6, max: 18, step: 1, format: (v: number) => String(v) },
        { key: "uiHudTopOffset", label: "HUD Top Offset (Desktop)", desc: "Distance from top", min: 30, max: 80, step: 5, format: (v: number) => String(v) },
        { key: "uiHudTopOffsetMobile", label: "HUD Top Offset (Mobile)", desc: "Distance from top on mobile", min: 100, max: 150, step: 5, format: (v: number) => String(v) },
      ];
    }

    this.elUIPanelContent.innerHTML = "";
    uiSettings.forEach((setting) => {
      const row = document.createElement("div");
      row.className = "physicsToggleRow";
      const value = (this.settings as any)[setting.key];
      
      const label = document.createElement("label");
      label.style.cssText = "display: flex; flex-direction: column; gap: 4px; width: 100%;";
      
      const labelTop = document.createElement("div");
      labelTop.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
      const labelText = document.createElement("span");
      labelText.textContent = setting.label;
      labelText.style.cssText = "font-weight: 600; font-size: 12px; color: rgba(255, 255, 255, 0.9);";
      const valueText = document.createElement("span");
      valueText.textContent = setting.format(value);
      valueText.style.cssText = "font-weight: 700; font-size: 12px; color: rgba(120, 245, 255, 1); min-width: 40px; text-align: right;";
      labelTop.appendChild(labelText);
      labelTop.appendChild(valueText);
      
      const desc = document.createElement("div");
      desc.textContent = setting.desc;
      desc.style.cssText = "font-size: 10px; color: rgba(255, 255, 255, 0.5);";
      
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(setting.min);
      slider.max = String(setting.max);
      slider.step = String(setting.step);
      slider.value = String(value);
      slider.style.cssText = "width: 100%; margin-top: 4px;";
      
      slider.addEventListener("input", () => {
        const newValue = parseFloat(slider.value);
        (this.settings as any)[setting.key] = newValue;
        valueText.textContent = setting.format(newValue);
        this.saveSettings();
        this.applyUISettings();
      });
      
      label.appendChild(labelTop);
      label.appendChild(desc);
      label.appendChild(slider);
      row.appendChild(label);
      this.elUIPanelContent.appendChild(row);
    });
  }

  private applyUISettings(): void {
    const root = document.documentElement;
    // Menu settings
    root.style.setProperty("--ui-menu-logo-size", `${this.settings.uiMenuLogoSize}px`);
    root.style.setProperty("--ui-menu-logo-size-mobile", `${this.settings.uiMenuLogoSizeMobile}vw`);
    root.style.setProperty("--ui-menu-button-wide-width", `${this.settings.uiMenuButtonWideWidth}px`);
    root.style.setProperty("--ui-menu-button-wide-width-mobile", `${this.settings.uiMenuButtonWideWidthMobile}vw`);
    root.style.setProperty("--ui-menu-button-gap", `${this.settings.uiMenuButtonGap}px`);
    root.style.setProperty("--ui-menu-button-gap-mobile", `${this.settings.uiMenuButtonGapMobile}px`);
    root.style.setProperty("--ui-menu-icon-button-size", `${this.settings.uiMenuIconButtonSize}px`);
    root.style.setProperty("--ui-menu-icon-button-size-mobile", `${this.settings.uiMenuIconButtonSizeMobile}px`);
    // Country/Car picker settings
    root.style.setProperty("--ui-flag-gap", `${this.settings.uiFlagGap}px`);
    root.style.setProperty("--ui-flag-gap-mobile", `${this.settings.uiFlagGapMobile}px`);
    root.style.setProperty("--ui-flag-padding", `${this.settings.uiFlagPadding}px`);
    root.style.setProperty("--ui-flag-padding-mobile", `${this.settings.uiFlagPaddingMobile}px`);
    root.style.setProperty("--ui-flag-border", `${this.settings.uiFlagBorderWidth}px`);
    root.style.setProperty("--ui-flag-border-mobile", `${this.settings.uiFlagBorderWidthMobile}px`);
    root.style.setProperty("--ui-panel-padding", `${this.settings.uiPanelPadding}px`);
    root.style.setProperty("--ui-panel-padding-mobile", `${this.settings.uiPanelPaddingMobile}px`);
    root.style.setProperty("--ui-title-size", `${this.settings.uiTitleSize}px`);
    root.style.setProperty("--ui-subtitle-size", `${this.settings.uiSubtitleSize}px`);
    // Game HUD settings
    root.style.setProperty("--ui-hud-font-size", `${this.settings.uiHudFontSize}px`);
    root.style.setProperty("--ui-hud-font-size-mobile", `${this.settings.uiHudFontSizeMobile}px`);
    root.style.setProperty("--ui-hud-score-size", `${this.settings.uiHudScoreSize}px`);
    root.style.setProperty("--ui-hud-score-size-mobile", `${this.settings.uiHudScoreSizeMobile}px`);
    root.style.setProperty("--ui-hud-spacing", `${this.settings.uiHudSpacing}px`);
    root.style.setProperty("--ui-hud-spacing-mobile", `${this.settings.uiHudSpacingMobile}px`);
    root.style.setProperty("--ui-hud-top-offset", `${this.settings.uiHudTopOffset}px`);
    root.style.setProperty("--ui-hud-top-offset-mobile", `${this.settings.uiHudTopOffsetMobile}px`);
  }

  private toggleUIPanel(): void {
    const isHidden = this.elUIPanel.classList.contains("hidden");
    if (isHidden) {
      // Rebuild panel with current scene's settings
      this.buildUIPanel();
      this.elUIPanel.classList.remove("hidden");
      this.elUIPanel.style.display = "flex";
    } else {
      this.elUIPanel.classList.add("hidden");
      this.elUIPanel.style.display = "none";
    }
  }

  private copyUISettings(): void {
    const uiSettings: any = {};
    // Menu settings
    uiSettings.uiMenuLogoSize = this.settings.uiMenuLogoSize;
    uiSettings.uiMenuLogoSizeMobile = this.settings.uiMenuLogoSizeMobile;
    uiSettings.uiMenuButtonWideWidth = this.settings.uiMenuButtonWideWidth;
    uiSettings.uiMenuButtonWideWidthMobile = this.settings.uiMenuButtonWideWidthMobile;
    uiSettings.uiMenuButtonGap = this.settings.uiMenuButtonGap;
    uiSettings.uiMenuButtonGapMobile = this.settings.uiMenuButtonGapMobile;
    uiSettings.uiMenuIconButtonSize = this.settings.uiMenuIconButtonSize;
    uiSettings.uiMenuIconButtonSizeMobile = this.settings.uiMenuIconButtonSizeMobile;
    // Country/Car picker settings
    uiSettings.uiFlagGap = this.settings.uiFlagGap;
    uiSettings.uiFlagGapMobile = this.settings.uiFlagGapMobile;
    uiSettings.uiFlagPadding = this.settings.uiFlagPadding;
    uiSettings.uiFlagPaddingMobile = this.settings.uiFlagPaddingMobile;
    uiSettings.uiFlagBorderWidth = this.settings.uiFlagBorderWidth;
    uiSettings.uiFlagBorderWidthMobile = this.settings.uiFlagBorderWidthMobile;
    uiSettings.uiPanelPadding = this.settings.uiPanelPadding;
    uiSettings.uiPanelPaddingMobile = this.settings.uiPanelPaddingMobile;
    uiSettings.uiTitleSize = this.settings.uiTitleSize;
    uiSettings.uiSubtitleSize = this.settings.uiSubtitleSize;
    // Game HUD settings
    uiSettings.uiHudFontSize = this.settings.uiHudFontSize;
    uiSettings.uiHudFontSizeMobile = this.settings.uiHudFontSizeMobile;
    uiSettings.uiHudScoreSize = this.settings.uiHudScoreSize;
    uiSettings.uiHudScoreSizeMobile = this.settings.uiHudScoreSizeMobile;
    uiSettings.uiHudSpacing = this.settings.uiHudSpacing;
    uiSettings.uiHudSpacingMobile = this.settings.uiHudSpacingMobile;
    uiSettings.uiHudTopOffset = this.settings.uiHudTopOffset;
    uiSettings.uiHudTopOffsetMobile = this.settings.uiHudTopOffsetMobile;

    const jsonString = JSON.stringify(uiSettings, null, 2);
    
    navigator.clipboard.writeText(jsonString).then(() => {
      const btn = this.elBtnCopyUISettings;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
        </svg>
      `;
      btn.style.color = "rgba(183, 255, 74, 1)";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
      }, 2000);
      
      console.log("[Game] UI settings copied to clipboard:");
      console.log(jsonString);
    }).catch((err) => {
      console.error("[Game] Failed to copy UI settings:", err);
      alert("Failed to copy settings. Check console for the JSON.");
    });
  }

  private showInfo(open: boolean): void {
    if (open) {
      this.elInfoModal.classList.add("visible");
      this.elInfoModal.removeAttribute("inert");
    } else {
      this.elInfoModal.classList.remove("visible");
      this.elInfoModal.setAttribute("inert", "");
    }
  }

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === "Escape") {
        if (this.elSettingsModal.classList.contains("visible")) this.showSettings(false);
        if (this.elInfoModal.classList.contains("visible")) this.showInfo(false);
      }
      this.audio.ensure();
      if (this.settings.music) this.audio.startMusic();
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    // Mobile joystick - completely rewritten
    const maxRadius = 30;
    
    const updateJoystick = (dx: number, dy: number) => {
      // Ensure playerCar exists before accessing its angle
      if (!this.playerCar) {
        console.warn("[Game] updateJoystick: playerCar not initialized");
        return;
      }
      
      const distance = Math.hypot(dx, dy);
      const scale = distance > maxRadius ? maxRadius / distance : 1;
      const px = dx * scale;
      const py = dy * scale;
      
      if (this.elJoyStick) {
        this.elJoyStick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      }
      
      const normalizedX = clamp(px / maxRadius, -1, 1);
      const normalizedY = clamp(py / maxRadius, -1, 1);
      
      // Calculate the desired direction angle from joystick input
      // Reverse Y to fix direction mapping (down=up), keep X normal (left=left, right=right)
      const desiredAngle = Math.atan2(normalizedY, normalizedX);
      const joystickMagnitude = Math.hypot(normalizedX, normalizedY);
      
      // Only apply input if joystick is moved significantly
      if (joystickMagnitude > 0.1) {
        // Get current car angle
        const carAngle = this.playerCar.angle;
        
        // Calculate angle difference between car's current facing and desired direction
        let angleDiff = desiredAngle - carAngle;
        
        // Normalize angle to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Convert to throttle and steering
        // Throttle: magnitude of joystick push (how hard you're pushing)
        // Steering: angle difference (how much we need to turn)
        this.playerInput.throttle = joystickMagnitude; // Always forward when joystick is pushed
        this.playerInput.steer = clamp(angleDiff / Math.PI, -1, 1); // Normalize angle diff to [-1, 1]
      } else {
        // Joystick released or at center
        this.playerInput.throttle = 0;
        this.playerInput.steer = 0;
      }
    };

    const handleJoystickStart = (x: number, y: number, pointerId: number) => {
      // Allow joystick during PLAYING, GOAL, and countdown (countdownActive is checked in applyCarControls)
      if (this.state !== "PLAYING" && this.state !== "GOAL") return;
      
      const rect = this.elJoyWrap.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      this.joy.active = true;
      this.joy.id = pointerId;
      this.joy.baseX = centerX;
      this.joy.baseY = centerY;
      this.joy.dx = 0;
      this.joy.dy = 0;
      
      updateJoystick(0, 0);
      this.triggerHaptic("light");
      this.audio.ensure();
    };

    const handleJoystickMove = (x: number, y: number) => {
      if (!this.joy.active) return;
      
      const dx = x - this.joy.baseX;
      const dy = y - this.joy.baseY;
      
      this.joy.dx = dx;
      this.joy.dy = dy;
      updateJoystick(dx, dy);
    };

    const handleJoystickEnd = () => {
      this.joy.active = false;
      this.joy.id = null;
      this.joy.dx = 0;
      this.joy.dy = 0;
      this.playerInput.throttle = 0;
      this.playerInput.steer = 0;
      
      if (this.elJoyStick) {
        this.elJoyStick.style.transform = "translate(-50%, -50%)";
      }
    };

    // Bind joystick events (pointer events + touch fallback for iOS WebView)
    if (this.elJoyWrap) {
      // Pointer events (desktop + modern mobile)
      this.elJoyWrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch (err) {
          // setPointerCapture may not work in all iOS WebViews
        }
        handleJoystickStart(e.clientX, e.clientY, e.pointerId);
      });
      
      this.elJoyWrap.addEventListener("pointermove", (e) => {
        if (!this.joy.active || this.joy.id !== e.pointerId) return;
        e.preventDefault();
        handleJoystickMove(e.clientX, e.clientY);
      });
      
      this.elJoyWrap.addEventListener("pointerup", (e) => {
        if (this.joy.id === e.pointerId) {
          e.preventDefault();
          handleJoystickEnd();
          pointerHandled = false;
        }
      });
      
      this.elJoyWrap.addEventListener("pointercancel", (e) => {
        if (this.joy.id === e.pointerId) {
          e.preventDefault();
          handleJoystickEnd();
          pointerHandled = false;
        }
      });
      
      // Touch events fallback (iOS WebView compatibility)
      // Use a flag to prevent both pointer and touch from firing simultaneously
      let touchHandled = false;
      let touchId: number | null = null;
      
      this.elJoyWrap.addEventListener("touchstart", (e) => {
        // If pointer events are already handling this, ignore touch
        if (pointerHandled || (this.joy.active && this.joy.id !== null && !touchHandled)) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        touchHandled = true;
        pointerHandled = false; // Disable pointer when touch fires
        const touch = e.touches[0];
        if (touch) {
          touchId = touch.identifier;
          handleJoystickStart(touch.clientX, touch.clientY, touch.identifier);
        }
      }, { passive: false });
      
      this.elJoyWrap.addEventListener("touchmove", (e) => {
        if (!this.joy.active || !touchHandled || touchId === null) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = Array.from(e.touches).find(t => t.identifier === touchId);
        if (touch) {
          handleJoystickMove(touch.clientX, touch.clientY);
        }
      }, { passive: false });
      
      this.elJoyWrap.addEventListener("touchend", (e) => {
        if (touchHandled && touchId !== null) {
          e.preventDefault();
          e.stopPropagation();
          handleJoystickEnd();
          touchId = null;
          touchHandled = false;
        }
      }, { passive: false });
      
      this.elJoyWrap.addEventListener("touchcancel", (e) => {
        if (touchHandled && touchId !== null) {
          e.preventDefault();
          e.stopPropagation();
          handleJoystickEnd();
          touchId = null;
          touchHandled = false;
        }
      }, { passive: false });
    }

    // Boost button
    const boostDown = () => {
      if (this.state !== "PLAYING") return;
      // Only allow boost if charge is full
      if (this.boostCharge >= 1.0) {
        this.playerInput.boost = true;
        this.boostTouch = true;
        this.audio.ensure();
        this.audio.boost();
        this.triggerHaptic("light");
        this.elBtnBoost.classList.add("active");
      }
    };
    const boostUp = () => {
      this.playerInput.boost = false;
      this.boostTouch = false;
      this.elBtnBoost.classList.remove("active");
    };
    // Boost button (pointer + touch fallback for iOS)
    this.elBtnBoost.addEventListener("pointerdown", (e) => {
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch (err) {
        // setPointerCapture may not work in all iOS WebViews
      }
      boostDown();
    });
    this.elBtnBoost.addEventListener("pointerup", () => boostUp());
    this.elBtnBoost.addEventListener("pointercancel", () => boostUp());
    
    // Touch fallback for iOS WebView
    this.elBtnBoost.addEventListener("touchstart", (e) => {
      e.preventDefault();
      boostDown();
    }, { passive: false });
    this.elBtnBoost.addEventListener("touchend", (e) => {
      e.preventDefault();
      boostUp();
    }, { passive: false });
    this.elBtnBoost.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      boostUp();
    }, { passive: false });

    // Player 2 joystick (for LOCAL_2P mode)
    const updateJoystickP2 = (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      const scale = distance > maxRadius ? maxRadius / distance : 1;
      const px = dx * scale;
      const py = dy * scale;
      
      if (this.elJoyStickP2) {
        this.elJoyStickP2.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      }
      
      const normalizedX = clamp(px / maxRadius, -1, 1);
      const normalizedY = clamp(py / maxRadius, -1, 1);
      
      // Calculate the desired direction angle from joystick input
      // Reverse Y to fix direction mapping (down=up), keep X normal (left=left, right=right)
      const desiredAngle = Math.atan2(normalizedY, normalizedX);
      const joystickMagnitude = Math.hypot(normalizedX, normalizedY);
      
      // Only apply input if joystick is moved significantly
      if (joystickMagnitude > 0.1) {
        // Get current car angle
        const carAngle = this.botCar.angle;
        
        // Calculate angle difference between car's current facing and desired direction
        let angleDiff = desiredAngle - carAngle;
        
        // Normalize angle to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Convert to throttle and steering
        // Throttle: magnitude of joystick push (how hard you're pushing)
        // Steering: angle difference (how much we need to turn)
        this.botInput.throttle = joystickMagnitude; // Always forward when joystick is pushed
        this.botInput.steer = clamp(angleDiff / Math.PI, -1, 1); // Normalize angle diff to [-1, 1]
      } else {
        // Joystick released or at center
        this.botInput.throttle = 0;
        this.botInput.steer = 0;
      }
    };

    const handleJoystickStartP2 = (x: number, y: number, pointerId: number) => {
      if (this.state !== "PLAYING" && this.state !== "GOAL") return;
      if (this.matchMode !== "LOCAL_2P") return;
      
      const rect = this.elJoyWrapP2.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      this.joyP2.active = true;
      this.joyP2.id = pointerId;
      this.joyP2.baseX = centerX;
      this.joyP2.baseY = centerY;
      this.joyP2.dx = 0;
      this.joyP2.dy = 0;
      
      updateJoystickP2(0, 0);
      this.triggerHaptic("light");
      this.audio.ensure();
    };

    const handleJoystickMoveP2 = (x: number, y: number) => {
      if (!this.joyP2.active) return;
      
      const dx = x - this.joyP2.baseX;
      const dy = y - this.joyP2.baseY;
      
      this.joyP2.dx = dx;
      this.joyP2.dy = dy;
      updateJoystickP2(dx, dy);
    };

    const handleJoystickEndP2 = () => {
      this.joyP2.active = false;
      this.joyP2.id = null;
      this.joyP2.dx = 0;
      this.joyP2.dy = 0;
      this.botInput.throttle = 0;
      this.botInput.steer = 0;
      
      if (this.elJoyStickP2) {
        this.elJoyStickP2.style.transform = "translate(-50%, -50%)";
      }
    };

    // Bind player 2 joystick events
    if (this.elJoyWrapP2) {
      // Pointer events (desktop + modern mobile)
      this.elJoyWrapP2.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch (err) {
          // setPointerCapture may not work in all iOS WebViews
        }
        handleJoystickStartP2(e.clientX, e.clientY, e.pointerId);
      });
      
      this.elJoyWrapP2.addEventListener("pointermove", (e) => {
        if (!this.joyP2.active || this.joyP2.id !== e.pointerId) return;
        e.preventDefault();
        handleJoystickMoveP2(e.clientX, e.clientY);
      });
      
      this.elJoyWrapP2.addEventListener("pointerup", (e) => {
        if (this.joyP2.id === e.pointerId) {
          e.preventDefault();
          handleJoystickEndP2();
        }
      });
      
      this.elJoyWrapP2.addEventListener("pointercancel", (e) => {
        if (this.joyP2.id === e.pointerId) {
          e.preventDefault();
          handleJoystickEndP2();
        }
      });
      
      // Touch events fallback (iOS WebView compatibility)
      let touchIdP2: number | null = null;
      this.elJoyWrapP2.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          touchIdP2 = touch.identifier;
          handleJoystickStartP2(touch.clientX, touch.clientY, touch.identifier);
        }
      }, { passive: false });
      
      this.elJoyWrapP2.addEventListener("touchmove", (e) => {
        if (!this.joyP2.active || touchIdP2 === null) return;
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.identifier === touchIdP2);
        if (touch) {
          handleJoystickMoveP2(touch.clientX, touch.clientY);
        }
      }, { passive: false });
      
      this.elJoyWrapP2.addEventListener("touchend", (e) => {
        if (touchIdP2 !== null) {
          e.preventDefault();
          handleJoystickEndP2();
          touchIdP2 = null;
        }
      }, { passive: false });
      
      this.elJoyWrapP2.addEventListener("touchcancel", (e) => {
        if (touchIdP2 !== null) {
          e.preventDefault();
          handleJoystickEndP2();
          touchIdP2 = null;
        }
      }, { passive: false });
    }

    // Player 2 boost button
    const boostDownP2 = () => {
      if (this.state !== "PLAYING") return;
      if (this.matchMode !== "LOCAL_2P") return;
      // Only allow boost if charge is full
      if (this.boostChargeP2 >= 1.0) {
        this.botInput.boost = true;
        this.boostTouchP2 = true;
        this.audio.ensure();
        this.audio.boost();
        this.triggerHaptic("light");
        this.elBtnBoostP2.classList.add("active");
      }
    };
    const boostUpP2 = () => {
      this.botInput.boost = false;
      this.boostTouchP2 = false;
      this.elBtnBoostP2.classList.remove("active");
    };
    if (this.elBtnBoostP2) {
      this.elBtnBoostP2.addEventListener("pointerdown", (e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        boostDownP2();
      });
      this.elBtnBoostP2.addEventListener("pointerup", () => boostUpP2());
      this.elBtnBoostP2.addEventListener("pointercancel", () => boostUpP2());
    }
  }

  private rebuildWorldWithNewPhysics(): void {
    // Save current positions and velocities
    const playerPos = this.playerCar.position;
    const playerVel = this.playerCar.velocity;
    const playerAngle = this.playerCar.angle;
    const botPos = this.botCar.position;
    const botVel = this.botCar.velocity;
    const botAngle = this.botCar.angle;
    const ballPos = this.ball.position;
    const ballVel = this.ball.velocity;

    // Rebuild world
    this.buildWorld();

    // Restore positions and velocities
    Body.setPosition(this.playerCar, playerPos);
    Body.setVelocity(this.playerCar, playerVel);
    Body.setAngle(this.playerCar, playerAngle);
    Body.setPosition(this.botCar, botPos);
    Body.setVelocity(this.botCar, botVel);
    Body.setAngle(this.botCar, botAngle);
    Body.setPosition(this.ball, ballPos);
    Body.setVelocity(this.ball, ballVel);
  }

  private buildWorld(): void {
    this.debugLog("info", "Building world...");
    Composite.clear(this.world, false);

    // Field bounds in world units
    const w = this.fieldW;
    const h = this.fieldH;
    const goalHalf = this.goalW * 0.5;
    const wallT = 28;

    const wallOpts = {
      isStatic: true,
      friction: 0,
      restitution: 0.9,
      label: "wall",
      collisionFilter: {
        category: CATEGORY_WALL,
        mask: CATEGORY_CAR | CATEGORY_BALL, // Collide with both cars and ball
      },
    };

    // Left/right walls (full height)
    const left = Bodies.rectangle(-w * 0.5 - wallT * 0.5, 0, wallT, h + 400, wallOpts);
    const right = Bodies.rectangle(w * 0.5 + wallT * 0.5, 0, wallT, h + 400, wallOpts);

    // Top wall segments (goal opening in middle)
    const topLeft = Bodies.rectangle(
      -goalHalf - (w * 0.5 - goalHalf) * 0.5,
      -h * 0.5 - wallT * 0.5,
      w * 0.5 - goalHalf,
      wallT,
      wallOpts,
    );
    const topRight = Bodies.rectangle(
      goalHalf + (w * 0.5 - goalHalf) * 0.5,
      -h * 0.5 - wallT * 0.5,
      w * 0.5 - goalHalf,
      wallT,
      wallOpts,
    );

    // Bottom wall segments
    const botLeft = Bodies.rectangle(
      -goalHalf - (w * 0.5 - goalHalf) * 0.5,
      h * 0.5 + wallT * 0.5,
      w * 0.5 - goalHalf,
      wallT,
      wallOpts,
    );
    const botRight = Bodies.rectangle(
      goalHalf + (w * 0.5 - goalHalf) * 0.5,
      h * 0.5 + wallT * 0.5,
      w * 0.5 - goalHalf,
      wallT,
      wallOpts,
    );

    // Goal "back walls"
    const goalDepth = this.settings.goalDepth;
    const topBack = Bodies.rectangle(0, -h * 0.5 - goalDepth, this.goalW, wallT, wallOpts);
    const bottomBack = Bodies.rectangle(0, h * 0.5 + goalDepth, this.goalW, wallT, wallOpts);

    // Goal boundary walls (block cars but allow ball through)
    // These are invisible walls at the goal opening that only cars collide with
    const goalBoundaryOpts = {
      isStatic: true,
      friction: 0,
      restitution: 0.9,
      label: "goalBoundary",
      collisionFilter: {
        category: CATEGORY_GOAL_BOUNDARY,
        mask: CATEGORY_CAR, // Only collide with cars, not ball
      },
    };
    
    // Top goal boundary (at the goal opening)
    const topGoalBoundary = Bodies.rectangle(
      0,
      -h * 0.5,
      this.goalW,
      wallT,
      goalBoundaryOpts,
    );
    
    // Bottom goal boundary (at the goal opening)
    const bottomGoalBoundary = Bodies.rectangle(
      0,
      h * 0.5,
      this.goalW,
      wallT,
      goalBoundaryOpts,
    );

    // Goal sensors (top is opponent's goal, bottom is player's goal)
    this.topGoalSensor = Bodies.rectangle(
      0,
      -h * 0.5 - goalDepth * 0.5,
      this.goalW - 10,
      goalDepth,
      { isStatic: true, isSensor: true, label: "goalTop" },
    );
    this.bottomGoalSensor = Bodies.rectangle(
      0,
      h * 0.5 + goalDepth * 0.5,
      this.goalW - 10,
      goalDepth,
      { isStatic: true, isSensor: true, label: "goalBottom" },
    );

    // Cars
    const carOpts = {
      friction: this.settings.carFriction,
      frictionAir: this.settings.carFrictionAir,
      restitution: this.settings.carRestitution,
      density: this.settings.carDensity,
      label: "car",
      collisionFilter: {
        category: CATEGORY_CAR,
        mask: CATEGORY_CAR | CATEGORY_BALL | CATEGORY_WALL | CATEGORY_GOAL_BOUNDARY, // Collide with cars, ball, walls, and goal boundaries
      },
    };
    // Apply bounds multipliers to match sprite size
    const actualCarWidth = this.settings.carWidth * this.settings.carBoundsWidth;
    const actualCarHeight = this.settings.carHeight * this.settings.carBoundsHeight;
    
    // Calculate area scaling factor to adjust density (keep mass constant)
    // Original area = carWidth * carHeight
    // New area = actualCarWidth * actualCarHeight
    // To keep mass constant: newDensity = originalDensity * (originalArea / newArea)
    const originalArea = this.settings.carWidth * this.settings.carHeight;
    const newArea = actualCarWidth * actualCarHeight;
    const areaScale = originalArea / newArea;
    const adjustedDensity = this.settings.carDensity * areaScale;
    
    this.playerCar = Bodies.rectangle(-w * 0.25, 0, actualCarWidth, actualCarHeight, {
      ...carOpts,
      density: adjustedDensity, // Adjust density to keep mass constant
      chamfer: { radius: Math.min(actualCarWidth, actualCarHeight) * 0.16 },
    });
    this.botCar = Bodies.rectangle(w * 0.25, 0, actualCarWidth, actualCarHeight, {
      ...carOpts,
      density: adjustedDensity, // Adjust density to keep mass constant
      chamfer: { radius: Math.min(actualCarWidth, actualCarHeight) * 0.16 },
    });
    // Player starts at bottom facing up; bot at top facing down
    Body.setAngle(this.playerCar, -Math.PI * 0.5);
    Body.setAngle(this.botCar, Math.PI * 0.5);

    // Ball - apply bounds scale
    const actualBallRadius = this.settings.ballRadius * this.settings.ballBoundsScale;
    
    // Calculate area scaling factor to adjust density (keep mass constant)
    // For circle: area = π * r²
    // Original area = π * ballRadius²
    // New area = π * actualBallRadius²
    // To keep mass constant: newDensity = originalDensity * (originalArea / newArea)
    const ballOriginalArea = Math.PI * this.settings.ballRadius * this.settings.ballRadius;
    const ballNewArea = Math.PI * actualBallRadius * actualBallRadius;
    const ballAreaScale = ballOriginalArea / ballNewArea;
    const adjustedBallDensity = this.settings.ballDensity * ballAreaScale;
    
    this.ball = Bodies.circle(0, 0, actualBallRadius, {
      restitution: this.settings.ballRestitution,
      friction: this.settings.ballFriction,
      frictionAir: this.settings.ballFrictionAir,
      density: adjustedBallDensity, // Adjust density to keep mass constant
      label: "ball",
      collisionFilter: {
        category: CATEGORY_BALL,
        mask: CATEGORY_CAR | CATEGORY_WALL, // Collide with cars and walls, but NOT goal boundaries
      },
    });

    World.add(this.world, [
      left,
      right,
      topLeft,
      topRight,
      botLeft,
      botRight,
      topBack,
      bottomBack,
      topGoalBoundary,
      bottomGoalBoundary,
      this.topGoalSensor,
      this.bottomGoalSensor,
      this.playerCar,
      this.botCar,
      this.ball,
    ]);

    Events.off(this.engine, "collisionStart");
    Events.on(this.engine, "collisionStart", (evt) => {
      for (const p of evt.pairs) {
        const a = p.bodyA;
        const b = p.bodyB;
        const la = a.label;
        const lb = b.label;

        // Goal
        // Ball into top goal => player scored. Ball into bottom => bot scored.
        if ((la === "ball" && lb === "goalTop") || (lb === "ball" && la === "goalTop")) {
          this.onGoal(true);
        }
        if ((la === "ball" && lb === "goalBottom") || (lb === "ball" && la === "goalBottom")) {
          this.onGoal(false);
        }

        // Kick / thud feedback
        const isCarBall =
          (la === "car" && lb === "ball") || (lb === "car" && la === "ball");
        const isCarWall =
          (la === "car" && lb === "wall") || (lb === "car" && la === "wall");
        if (this.state === "PLAYING") {
          if (isCarBall) {
            this.audio.kick();
            this.triggerHaptic("medium");
          } else if (isCarWall) {
            this.audio.thud();
            this.triggerHaptic("light");
          }
        }
      }
    });
  }

  private resetPositions(kickoffToPlayer: boolean): void {
    const h = this.fieldH;
    Body.setPosition(this.ball, { x: 0, y: 0 });
    Body.setVelocity(this.ball, { x: 0, y: 0 });
    Body.setAngularVelocity(this.ball, 0);

    Body.setPosition(this.playerCar, { x: 0, y: h * 0.25 });
    Body.setVelocity(this.playerCar, { x: 0, y: 0 });
    Body.setAngle(this.playerCar, -Math.PI * 0.5);
    Body.setAngularVelocity(this.playerCar, 0);

    Body.setPosition(this.botCar, { x: 0, y: -h * 0.25 });
    Body.setVelocity(this.botCar, { x: 0, y: 0 });
    Body.setAngle(this.botCar, Math.PI * 0.5);
    Body.setAngularVelocity(this.botCar, 0);

    if (kickoffToPlayer) {
      Body.applyForce(this.ball, this.ball.position, { x: 0, y: -0.005 });
    } else {
      Body.applyForce(this.ball, this.ball.position, { x: 0, y: 0.005 });
    }

    // Camera snap
    this.camX = this.playerCar.position.x;
    this.camY = this.playerCar.position.y;
    const baseZoom = 1.20;
    this.currentZoom = baseZoom;
    this.targetZoom = baseZoom;
    this.camVX = 0;
    this.camVY = 0;
  }

  private startSearching(mode: MatchMode = "BOT"): void {
    console.log("[Game] Starting search for opponent, mode:", mode);
    
    // Clear any existing intervals first
    if (this.searchingScrollInterval !== null) {
      clearInterval(this.searchingScrollInterval);
      this.searchingScrollInterval = null;
    }
    if (this.searchingEaseInterval !== null) {
      clearInterval(this.searchingEaseInterval);
      this.searchingEaseInterval = null;
    }
    
    this.pendingMode = mode;
    this.elSearchingResult.classList.add("hidden");
    
    // Build scroller items first
    this.buildSearchingScroller();
    
    // Set state (this will show the overlay via setState)
    this.setState("SEARCHING");
    
    // Animate scroller
    this.animateSearchingScroller();
  }

  private buildSearchingScroller(): void {
    // Clear existing items
    this.elScrollerLeft.innerHTML = "";
    this.elScrollerRight.innerHTML = "";
    
    // Add flags to left scroller (duplicate for seamless loop)
    for (let i = 0; i < 3; i++) {
      for (const country of this.countries) {
        const item = document.createElement("div");
        item.className = "scrollerItem";
        const img = document.createElement("img");
        // Use preloaded flag image if available
        const preloadedFlag = this.flagImages.get(country.code);
        if (preloadedFlag && preloadedFlag.complete && preloadedFlag.naturalWidth > 0) {
          img.src = preloadedFlag.src;
        } else {
          img.src = `https://hatscripts.github.io/circle-flags/flags/${country.code}.svg`;
        }
        img.alt = country.name;
        item.appendChild(img);
        this.elScrollerLeft.appendChild(item);
      }
    }
    
    // Add cars to right scroller (duplicate for seamless loop)
    for (let i = 0; i < 3; i++) {
      for (const carName of this.carNames) {
        const item = document.createElement("div");
        item.className = "scrollerItem";
        const img = document.createElement("img");
        const carImg = this.carImages.get(carName);
        if (carImg && carImg.naturalWidth > 0) {
          img.src = carImg.src;
        } else {
          // Fallback: create a colored square
          img.style.width = "80px";
          img.style.height = "80px";
          img.style.backgroundColor = carName === "red" ? "#ff0000" : carName === "blue" ? "#0000ff" : "#888888";
        }
        item.appendChild(img);
        this.elScrollerRight.appendChild(item);
      }
    }
  }

  private animateSearchingScroller(): void {
    // Clear any existing intervals
    if (this.searchingScrollInterval !== null) {
      clearInterval(this.searchingScrollInterval);
      this.searchingScrollInterval = null;
    }
    if (this.searchingEaseInterval !== null) {
      clearInterval(this.searchingEaseInterval);
      this.searchingEaseInterval = null;
    }
    
    const flagItems = Array.from(this.elScrollerLeft.querySelectorAll(".scrollerItem"));
    const carItems = Array.from(this.elScrollerRight.querySelectorAll(".scrollerItem"));
    
    // Fast scrolling phase - both at same speed
    let flagOffset = 0;
    let carOffset = 0;
    const fastSpeed = 8; // Fast scrolling speed
    
    this.searchingScrollInterval = window.setInterval(() => {
      flagOffset += fastSpeed;
      carOffset += fastSpeed;
      
      flagItems.forEach((item, i) => {
        const y = (i * 200) - (flagOffset % (flagItems.length * 200));
        (item as HTMLElement).style.transform = `translateY(${y}px)`;
      });
      
      carItems.forEach((item, i) => {
        const y = (i * 200) - (carOffset % (carItems.length * 200));
        (item as HTMLElement).style.transform = `translateY(${y}px)`;
      });
    }, 16);
    
    // After 1.5 seconds, select opponent and ease down
    setTimeout(() => {
      if (this.searchingScrollInterval !== null) {
        clearInterval(this.searchingScrollInterval);
        this.searchingScrollInterval = null;
      }
      
      // Select random bot country and car
      const botCountryIndex = Math.floor(Math.random() * this.countries.length);
      const botCountry = this.countries[botCountryIndex];
      this.botCountry = botCountry.code;
      
      const botCarChoices = this.carNames.filter((c) => c !== this.playerCarName);
      this.botCarName = botCarChoices[Math.floor(Math.random() * botCarChoices.length)] ?? "red";
      
      // Get current positions
      const currentFlagY = flagOffset % (flagItems.length * 200);
      const currentCarY = carOffset % (carItems.length * 200);
      const targetFlagY = -(botCountryIndex * 200);
      const targetCarIndex = this.carNames.indexOf(this.botCarName);
      const targetCarY = -(targetCarIndex * 200);
      
      // Ease down to target
      let progress = 0;
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      
      this.searchingEaseInterval = window.setInterval(() => {
        progress += 0.03; // Ease speed
        if (progress >= 1) {
          progress = 1;
          if (this.searchingEaseInterval !== null) {
            clearInterval(this.searchingEaseInterval);
            this.searchingEaseInterval = null;
          }
          
          // Show result
          this.elSearchingResult.classList.remove("hidden");
          const flagImg = document.createElement("img");
          const preloadedFlag = this.flagImages.get(this.botCountry);
          if (preloadedFlag && preloadedFlag.complete && preloadedFlag.naturalWidth > 0) {
            flagImg.src = preloadedFlag.src;
          } else {
            flagImg.src = `https://hatscripts.github.io/circle-flags/flags/${this.botCountry}.svg`;
          }
          flagImg.alt = botCountry.name;
          this.elResultFlag.innerHTML = "";
          this.elResultFlag.appendChild(flagImg);
          
          const carImg = document.createElement("img");
          const botCarImg = this.carImages.get(this.botCarName);
          if (botCarImg && botCarImg.naturalWidth > 0) {
            carImg.src = botCarImg.src;
          }
          this.elResultCar.innerHTML = "";
          this.elResultCar.appendChild(carImg);
          
          // Start match after showing result
          setTimeout(() => {
            this.elSearchingOverlay.classList.add("hidden");
            this.startMatch();
          }, 1500);
        }
        
        const eased = easeOut(progress);
        const flagY = currentFlagY + (targetFlagY - currentFlagY) * eased;
        const carY = currentCarY + (targetCarY - currentCarY) * eased;
        
        flagItems.forEach((item, i) => {
          const y = (i * 200) + flagY;
          (item as HTMLElement).style.transform = `translateY(${y}px)`;
        });
        
        carItems.forEach((item, i) => {
          const y = (i * 200) + carY;
          (item as HTMLElement).style.transform = `translateY(${y}px)`;
        });
      }, 16);
    }, 1500);
  }

  private async startMatch(limitSec?: number): Promise<void> {
    // Wait for car assets to load before starting (iOS WebView compatibility)
    if (this.carLoadPromise) {
      try {
        await this.carLoadPromise;
      } catch (err) {
        console.warn("[Game] Car assets not fully loaded, continuing anyway:", err);
      }
    }
    
    this.matchMode = this.pendingMode;
    this.playerScore = 0;
    this.botScore = 0;
    this.matchTime = 0;
    this.goalPause = 0;
    this.goalBurst = [];
    this.matchLimit = Math.max(10, Math.floor(limitSec ?? 90));
    this.boostCharge = 1.0; // Reset boost charge to full
    this.boostChargeP2 = 1.0; // Reset player 2 boost charge to full
    
    // Reset bot stuck detection
    this.botPositionHistory = [];
    this.botStuckTimer = 0;
    // Reset timers
    this.botBackwardTimer = 0;
    this.botBackwardDuration = 0;
    this.botStopTimer = 0;
    this.botStopDuration = 0;

    this.audio.ensure();
    // Music should already be playing from menu, just ensure it continues
    if (this.settings.music) this.audio.startMusic();

    if (this.matchMode === "BOT") {
      // Bot car and country already selected in searching screen
    } else {
      // Local 2P: keep a stable contrasting skin for Player 2
      const preferred = this.playerCarName === "red" ? "blue" : "red";
      this.botCarName = this.carNames.includes(preferred) ? preferred : (this.carNames.find((c) => c !== this.playerCarName) ?? "red");
      // Clear any leftover bot AI inputs; P2 will drive these.
      this.botInput.throttle = 0;
      this.botInput.steer = 0;
      this.botInput.boost = false;
    }

    // Update HUD flags (if elements exist) - use preloaded images
    if (this.elHudPlayerFlag) {
      const playerFlagImg = this.flagImages.get(this.selectedCountry);
      if (playerFlagImg && playerFlagImg.complete && playerFlagImg.naturalWidth > 0) {
        this.elHudPlayerFlag.src = playerFlagImg.src;
      } else {
        // Fallback to direct URL if preloaded image not ready
        this.elHudPlayerFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.selectedCountry}.svg`;
      }
    }
    if (this.elHudBotFlag) {
      const botFlagImg = this.flagImages.get(this.botCountry);
      if (botFlagImg && botFlagImg.complete && botFlagImg.naturalWidth > 0) {
        this.elHudBotFlag.src = botFlagImg.src;
      } else {
        // Fallback to direct URL if preloaded image not ready
        this.elHudBotFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.botCountry}.svg`;
      }
    }

    this.resetPositions(true);
    this.recordingReplay = true; // Start recording replay
    this.replayData = []; // Clear old replay
    this.tireTraces = []; // Clear tire traces
    this.lastTireTraceTime = 0;
    // Show mobile controls at the beginning of the match (they're inside settings modal, so show the modal container but hide the card)
    this.elSettingsModal.classList.add("visible");
    this.elSettingsModal.removeAttribute("inert");
      this.elMobileControls.classList.remove("hidden");
    // Hide the settings card during gameplay
    const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
    if (settingsCard) {
      (settingsCard as HTMLElement).style.display = "none";
    }
    
    // Ensure player 2 controls are hidden in BOT mode (use !important to override CSS)
    if (this.matchMode === "BOT") {
      if (this.elJoyWrapP2) {
        this.elJoyWrapP2.style.setProperty("display", "none", "important");
      }
      if (this.elBtnBoostP2) {
        const actionWrapP2 = document.getElementById("actionWrapP2");
        if (actionWrapP2) {
          actionWrapP2.style.setProperty("display", "none", "important");
        }
      }
    }
    
    this.setState("PLAYING");
    this.startCountdown();
  }

  private startCountdown(): void {
    this.countdownActive = true;
    this.countdownValue = 3;
    this.elCountdownOverlay.classList.remove("hidden");
    this.elCountdownText.textContent = "3";
    this.audio.play321();
    this.triggerHaptic("light");
    
    const countdownInterval = setInterval(() => {
      this.countdownValue--;
      if (this.countdownValue > 0) {
        this.elCountdownText.textContent = this.countdownValue.toString();
        this.audio.play321();
        this.triggerHaptic("light");
      } else if (this.countdownValue === 0) {
        this.elCountdownText.textContent = "GO!";
        this.audio.play321();
        this.audio.playCrowd(0.6); // Play crowd when game starts
        this.triggerHaptic("medium");
        clearInterval(countdownInterval);
        setTimeout(() => {
          this.elCountdownOverlay.classList.add("hidden");
          this.countdownActive = false;
          this.setState("PLAYING");
        }, 500);
      }
    }, 1000);
  }

  private toMenu(): void {
    this.fadeScene(() => {
      this.setState("MENU");
    });
  }

  private onGoal(isPlayerScored: boolean): void {
    if (this.state !== "PLAYING") return;
    this.state = "GOAL";
    this.goalPause = 1.1;

    if (isPlayerScored) this.playerScore++;
    else this.botScore++;
    
    // Play crowd sound on goal
    this.audio.playCrowd();

    // Stop recording replay and store who scored
    this.recordingReplay = false;
    this.replayScoringPlayer = isPlayerScored;
    
    // Launch cars with explosive force
    this.launchCarsOnGoal(isPlayerScored);
    
    // Camera shake
    this.cameraShake.intensity = 15;
    
    // Slow motion effect
    this.timeScale = 0.2;
    
    // Enhanced explosive SFX
    this.audio.goal(isPlayerScored);
    this.audio.explosiveGoal();
    this.triggerHaptic(isPlayerScored ? "success" : "error");
    this.spawnGoalBurst(isPlayerScored);
    
    // Start goal animation
    this.goalAnimation.active = true;
    this.goalAnimation.time = 0;
    this.goalAnimation.scale = 0;
    this.goalAnimation.rotation = 0;
    this.goalAnimation.alpha = 0;

    if (this.playerScore >= 5 || this.botScore >= 5) {
      // Show replay then end match
      window.setTimeout(() => {
        this.startReplay();
      }, 2000);
      return;
    }

    // Show replay then reset
    window.setTimeout(() => {
      this.startReplay();
    }, 2000);
  }

  private launchCarsOnGoal(isPlayerScored: boolean): void {
    // Launch cars with explosive force
    const goalY = isPlayerScored ? -this.fieldH * 0.5 : this.fieldH * 0.5;
    const explosionCenter = { x: 0, y: goalY };
    
    // Player car
    const playerToGoal = Vector.sub(explosionCenter, this.playerCar.position);
    const playerDist = Vector.magnitude(playerToGoal);
    const playerDir = Vector.normalise(playerToGoal);
    const playerForce = Math.min(0.15 / (playerDist * 0.01 + 1), 0.08);
    Body.applyForce(this.playerCar, this.playerCar.position, {
      x: playerDir.x * playerForce,
      y: playerDir.y * playerForce,
    });
    Body.setAngularVelocity(this.playerCar, (Math.random() - 0.5) * 0.3);
    
    // Bot car
    const botToGoal = Vector.sub(explosionCenter, this.botCar.position);
    const botDist = Vector.magnitude(botToGoal);
    const botDir = Vector.normalise(botToGoal);
    const botForce = Math.min(0.15 / (botDist * 0.01 + 1), 0.08);
    Body.applyForce(this.botCar, this.botCar.position, {
      x: botDir.x * botForce,
      y: botDir.y * botForce,
    });
    Body.setAngularVelocity(this.botCar, (Math.random() - 0.5) * 0.3);
  }

  private startReplay(): void {
    // Deactivate goal animation when replay starts
    this.goalAnimation.active = false;
    
    if (this.replayData.length === 0) {
      // No replay data, just reset
      if (this.playerScore >= 5 || this.botScore >= 5) {
        this.endMatch();
      } else {
        this.resetPositions(this.playerScore > this.botScore);
        this.state = "PLAYING";
        this.timeScale = 1.0;
        this.cameraShake.intensity = 0;
      }
      return;
    }
    
    this.isReplayMode = true;
    this.replayIndex = 0;
    this.replayStartTime = performance.now();
    this.timeScale = 1.0; // Normal speed for replay
    this.cameraShake.intensity = 0;
    this.elBtnSkipReplay.classList.remove("hidden");
    
    // Disable physics during replay
    Engine.update(this.engine, 0);
  }

  private endReplay(): void {
    this.isReplayMode = false;
    this.elBtnSkipReplay.classList.add("hidden");
    this.replayData = [];
    this.replayIndex = 0;
    this.replayScoringPlayer = null;
    
    if (this.playerScore >= 5 || this.botScore >= 5) {
      this.endMatch();
    } else {
      this.resetPositions(this.playerScore > this.botScore);
      this.state = "PLAYING";
      this.timeScale = 1.0;
      this.cameraShake.intensity = 0;
      this.recordingReplay = true; // Start recording again
    }
  }

  private skipReplay(): void {
    if (this.isReplayMode) {
      this.endReplay();
    }
  }

  private endMatch(): void {
    this.fadeScene(() => {
      this.submitFinalScore();
      this.triggerHaptic(this.playerScore >= this.botScore ? "success" : "error");
      // Play crowd sound when team wins
      this.audio.playCrowd(0.8);
      this.setState("GAME_OVER");
    });
  }

  private setState(s: GameState, instant?: boolean): void {
    this.state = s;
    if (s === "MENU") {
      this.elStart.classList.remove("hidden");
      this.elEnd.classList.add("hidden");
      this.elHudRoot.classList.add("hidden");
      this.elHudPills.classList.add("hidden");
      // Hide mobile controls in menu - hide the settings modal container and controls
      this.elSettingsModal.classList.remove("visible");
      this.elSettingsModal.setAttribute("inert", "");
      this.elMobileControls.classList.add("hidden");
      // Ensure settings card is also hidden
      const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
      if (settingsCard) {
        (settingsCard as HTMLElement).style.display = "none";
      }
      this.elSearchingOverlay.classList.add("hidden");
      // Music should already be playing, just ensure it continues
      if (!instant) {
        this.audio.ensure();
        if (this.settings.music) this.audio.startMusic();
      }
    } else if (s === "SEARCHING") {
      this.elStart.classList.add("hidden");
      this.elEnd.classList.add("hidden");
      this.elHudRoot.classList.add("hidden");
      this.elHudPills.classList.add("hidden");
      this.elMobileControls.classList.add("hidden");
      this.elSearchingOverlay.classList.remove("hidden");
      // Music continues playing
    } else if (s === "PLAYING" || s === "GOAL") {
      this.elStart.classList.add("hidden");
      this.elEnd.classList.add("hidden");
      this.elHudRoot.classList.remove("hidden");
      this.elHudPills.classList.remove("hidden");
      this.elSearchingOverlay.classList.add("hidden");
      // Show mobile controls when playing (same logic as settings - always show if playing)
      this.elMobileControls.classList.remove("hidden");
      // Update mobile controls visibility to show/hide player 2 controls based on match mode
      this.updateMobileControlsVisibility();
      // Music continues playing
    } else if (s === "GAME_OVER") {
      this.elStart.classList.add("hidden");
      this.elHudRoot.classList.add("hidden");
      this.elHudPills.classList.add("hidden");
      this.elMobileControls.classList.add("hidden");
      this.elPhysicsPanel?.classList.add("hidden");
      this.elUIPanel?.classList.add("hidden");
      const youWon = this.playerScore > this.botScore;
      const draw = this.playerScore === this.botScore;
      
      // Always show "Winner!" text
      this.elEndTitle.textContent = "Winner!";
      
      // Determine winner and set their car and flag
      if (draw) {
        // Draw - show player's car and flag
        const playerFlagImg = this.flagImages.get(this.selectedCountry);
        if (playerFlagImg && playerFlagImg.complete && playerFlagImg.naturalWidth > 0) {
          this.elEndWinnerFlag.src = playerFlagImg.src;
        } else {
          this.elEndWinnerFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.selectedCountry}.svg`;
        }
        const playerCarImg = this.carImages.get(this.playerCarName);
        if (playerCarImg && playerCarImg.naturalWidth > 0) {
          this.elEndWinnerCar.src = playerCarImg.src;
        }
      } else if (youWon) {
        // Player won
        const playerFlagImg = this.flagImages.get(this.selectedCountry);
        if (playerFlagImg && playerFlagImg.complete && playerFlagImg.naturalWidth > 0) {
          this.elEndWinnerFlag.src = playerFlagImg.src;
        } else {
          this.elEndWinnerFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.selectedCountry}.svg`;
        }
        const playerCarImg = this.carImages.get(this.playerCarName);
        if (playerCarImg && playerCarImg.naturalWidth > 0) {
          this.elEndWinnerCar.src = playerCarImg.src;
        }
      } else {
        // Bot won
        const botFlagImg = this.flagImages.get(this.botCountry);
        if (botFlagImg && botFlagImg.complete && botFlagImg.naturalWidth > 0) {
          this.elEndWinnerFlag.src = botFlagImg.src;
        } else {
          this.elEndWinnerFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.botCountry}.svg`;
        }
        const botCarImg = this.carImages.get(this.botCarName);
        if (botCarImg && botCarImg.naturalWidth > 0) {
          this.elEndWinnerCar.src = botCarImg.src;
        }
      }
      
      this.elEnd.classList.remove("hidden");
    }
  }

  private cycleCar(): void {
    // Legacy helper (kept for future menu iterations).
    this.selectedCarIndex = (this.selectedCarIndex + 1) % this.carNames.length;
    this.playerCarName = this.carNames[this.selectedCarIndex] ?? "blue";
    try {
      localStorage.setItem("goalDuelCar", this.playerCarName);
    } catch {}
  }

  private fadeScene(next: () => void): void {
    this.elFade.classList.add("on");
    window.setTimeout(() => {
      next();
      this.elFade.classList.remove("on");
    }, 220);
  }

  private resize(): void {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    const oldW = this.canvas.width;
    const oldH = this.canvas.height;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    this.debugLog("info", `Resize: ${w}x${h}, DPR=${dpr.toFixed(2)}, canvas=${this.canvas.width}x${this.canvas.height} (was ${oldW}x${oldH})`);
    
    // Update mobile controls visibility on resize
    this.updateMobileControlsVisibility();
  }

  private updateMobileControlsVisibility(): void {
    // Hide controls in menu, show if playing/goal
    if (this.state === "MENU") {
      // Safely hide everything in menu
      this.elSettingsModal.classList.remove("visible");
      this.elSettingsModal.setAttribute("inert", "");
      this.elMobileControls.classList.add("hidden");
      const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
      if (settingsCard) {
        (settingsCard as HTMLElement).style.display = "none";
      }
      // Hide player 2 controls (use !important to override CSS)
      if (this.elJoyWrapP2) {
        this.elJoyWrapP2.style.setProperty("display", "none", "important");
      }
      if (this.elBtnBoostP2) {
        const actionWrapP2 = document.getElementById("actionWrapP2");
        if (actionWrapP2) {
          actionWrapP2.style.setProperty("display", "none", "important");
        }
      }
    } else if (this.state === "PLAYING" || this.state === "GOAL") {
      // Show controls during gameplay
      this.elSettingsModal.classList.add("visible");
      this.elSettingsModal.removeAttribute("inert");
      this.elMobileControls.classList.remove("hidden");
      const settingsCard = this.elSettingsModal.querySelector(".settingsCard");
      if (settingsCard) {
        (settingsCard as HTMLElement).style.display = "none";
      }
      // Show/hide player 2 controls based on match mode (use !important to override CSS)
      if (this.matchMode === "LOCAL_2P") {
        if (this.elJoyWrapP2) {
          this.elJoyWrapP2.style.setProperty("display", "block", "important");
        }
        if (this.elBtnBoostP2) {
          const actionWrapP2 = document.getElementById("actionWrapP2");
          if (actionWrapP2) {
            actionWrapP2.style.setProperty("display", "block", "important");
          }
        }
      } else {
        if (this.elJoyWrapP2) {
          this.elJoyWrapP2.style.setProperty("display", "none", "important");
        }
        if (this.elBtnBoostP2) {
          const actionWrapP2 = document.getElementById("actionWrapP2");
          if (actionWrapP2) {
            actionWrapP2.style.setProperty("display", "none", "important");
          }
        }
      }
    } else {
      // Hide for all other states
      this.elSettingsModal.classList.remove("visible");
      this.elSettingsModal.setAttribute("inert", "");
      this.elMobileControls.classList.add("hidden");
      // Hide player 2 controls (use !important to override CSS)
      if (this.elJoyWrapP2) {
        this.elJoyWrapP2.style.setProperty("display", "none", "important");
      }
      if (this.elBtnBoostP2) {
        const actionWrapP2 = document.getElementById("actionWrapP2");
        if (actionWrapP2) {
          actionWrapP2.style.setProperty("display", "none", "important");
        }
      }
    }
  }

  private buildEnvironment(): void {
    // Removed (gameplay now uses a static stadium background image)
  }

  private updateInputsFromKeyboard(): void {
    if (isMobile()) return;

    // P1: WASD (+ arrows when NOT in local 2P) + Space boost
    const allowArrowsForP1 = this.matchMode !== "LOCAL_2P";
    const up = this.keys.has("w") || (allowArrowsForP1 && this.keys.has("arrowup"));
    const down = this.keys.has("s") || (allowArrowsForP1 && this.keys.has("arrowdown"));
    const left = this.keys.has("a") || (allowArrowsForP1 && this.keys.has("arrowleft"));
    const right = this.keys.has("d") || (allowArrowsForP1 && this.keys.has("arrowright"));
    const boost = this.keys.has(" ");

    this.playerInput.throttle = (up ? 1 : 0) + (down ? -1 : 0);
    this.playerInput.steer = (right ? 1 : 0) + (left ? -1 : 0);
    this.playerInput.boost = boost;

    // P2: Arrow keys + Enter boost (only in local 2P)
    if (this.matchMode === "LOCAL_2P") {
      const p2Up = this.keys.has("arrowup");
      const p2Down = this.keys.has("arrowdown");
      const p2Left = this.keys.has("arrowleft");
      const p2Right = this.keys.has("arrowright");
      const p2Boost = this.keys.has("enter");
      this.botInput.throttle = (p2Up ? 1 : 0) + (p2Down ? -1 : 0);
      this.botInput.steer = (p2Right ? 1 : 0) + (p2Left ? -1 : 0);
      this.botInput.boost = p2Boost;
    }
  }

  private computeBotAI(dt: number): void {
    const car = this.botCar;
    const ball = this.ball;
    const carAngle = car.angle;
    
    // Calculate distance to ball
        const toBall = Vector.sub(ball.position, car.position);
        const distToBall = Vector.magnitude(toBall);
    
    // Update timers
    this.botBackwardTimer += dt;
    this.botStopTimer += dt;
    
    // Check if we should start going backwards (15% chance, every 2-4 seconds)
    if (this.botBackwardDuration <= 0 && this.botBackwardTimer > (2 + Math.random() * 2)) {
      if (Math.random() < 0.15) {
        // Start going backwards for 0.3-0.6 seconds
        this.botBackwardDuration = 0.3 + Math.random() * 0.3;
        this.botBackwardTimer = 0;
        } else {
        this.botBackwardTimer = 0; // Reset timer
      }
    }
    
    // Check if we should stop when close to ball (random chance when < 80px)
    if (this.botStopDuration <= 0 && distToBall < 80 && this.botStopTimer > 0.5) {
      if (Math.random() < 0.3) {
        // Stop for 0.2-0.5 seconds
        this.botStopDuration = 0.2 + Math.random() * 0.3;
        this.botStopTimer = 0;
      }
    }
    
    let steer = 0;
    let throttle = 0;
    
    // If we're in backward mode
    if (this.botBackwardDuration > 0) {
      this.botBackwardDuration -= dt;
      // Go backwards with random steering
      const randomAngle = (Math.random() - 0.5) * 1.5;
      const targetAngle = angleWrap(randomAngle - carAngle);
      steer = clamp(targetAngle * 1.5, -1, 1);
      throttle = -0.5; // Backwards
    }
    // If we're in stop mode
    else if (this.botStopDuration > 0) {
      this.botStopDuration -= dt;
      throttle = 0; // Stop
      // Still turn a bit randomly
      const randomAngle = (Math.random() - 0.5) * 0.5;
      steer = clamp(randomAngle * 1.0, -1, 1);
    }
    // Normal behavior: check ball direction and respond accordingly
    else {
      // Bot's goal is at the top (y = -fieldH * 0.5), player's goal is at bottom (y = fieldH * 0.5)
      const botGoal = { x: 0, y: -this.fieldH * 0.5 - 60 };
      const playerGoal = { x: 0, y: this.fieldH * 0.5 + 60 };
      
      // Check which direction the ball is heading
      const ballVel = ball.velocity;
      const ballSpeed = Vector.magnitude(ballVel);
      const ballVelNorm = ballSpeed > 0.1 ? Vector.normalise(ballVel) : { x: 0, y: 0 };
      
      // Direction from ball to bot's goal (top)
      const ballToBotGoal = Vector.sub(botGoal, ball.position);
      const dirToBotGoal = Vector.normalise(ballToBotGoal);
      
      // Direction from ball to player's goal (bottom)
      const ballToPlayerGoal = Vector.sub(playerGoal, ball.position);
      const dirToPlayerGoal = Vector.normalise(ballToPlayerGoal);
      
      // Check if ball is heading towards bot's goal (defensive situation)
      const ballHeadingToBotGoal = ballVelNorm.y * dirToBotGoal.y > 0.3 && ballSpeed > 1.0;
      
      // Check if ball is heading towards player's goal (offensive situation)
      const ballHeadingToPlayerGoal = ballVelNorm.y * dirToPlayerGoal.y > 0.3 && ballSpeed > 1.0;
      
      if (ballHeadingToBotGoal) {
        // DEFENSIVE: Ball heading towards bot's goal - go around it to hit it in opposite direction
        // Position to intercept from the side and push it away from goal
        const interceptDistance = 100;
        // Go to the side of the ball (perpendicular to ball's velocity)
        const perpendicular = { x: -ballVelNorm.y, y: ballVelNorm.x }; // 90 degrees to velocity
        // Choose side based on which is closer to car
        const side1 = Vector.add(ball.position, Vector.mult(perpendicular, interceptDistance));
        const side2 = Vector.add(ball.position, Vector.mult(perpendicular, -interceptDistance));
        const distToSide1 = Vector.magnitude(Vector.sub(side1, car.position));
        const distToSide2 = Vector.magnitude(Vector.sub(side2, car.position));
        const targetPos = distToSide1 < distToSide2 ? side1 : side2;
        
        const toTarget = Vector.sub(targetPos, car.position);
        const angleToTarget = Math.atan2(toTarget.y, toTarget.x);
        const targetAngle = angleWrap(angleToTarget - carAngle);
        steer = clamp(targetAngle * 2.2, -1, 1);
        throttle = 0.7; // Faster when defending
      } else if (ballHeadingToPlayerGoal) {
        // OFFENSIVE: Ball heading towards player's goal - go straight at it
        const dirToBall = distToBall > 0.1 ? Vector.normalise(toBall) : { x: 0, y: 0 };
        const angleToBall = Math.atan2(dirToBall.y, dirToBall.x);
        const targetAngle = angleWrap(angleToBall - carAngle);
        steer = clamp(targetAngle * 2.5, -1, 1);
        throttle = 0.8; // Fast when attacking
      } else {
        // Ball not clearly heading anywhere - default behavior: push towards bot's goal
        const pushDistance = 80;
        const idealPos = Vector.add(ball.position, Vector.mult(dirToBotGoal, -pushDistance));
        const toIdealPos = Vector.sub(idealPos, car.position);
        const angleToIdeal = Math.atan2(toIdealPos.y, toIdealPos.x);
        const targetAngle = angleWrap(angleToIdeal - carAngle);
        steer = clamp(targetAngle * 2.0, -1, 1);
        throttle = 0.6; // Moderate speed
      }
    }
    
    // Smooth inputs
    this.botInput.steer = lerp(this.botInput.steer, steer, clamp(dt * 8, 0, 1));
    this.botInput.throttle = lerp(this.botInput.throttle, throttle, clamp(dt * 6, 0, 1));
    this.botInput.boost = false; // No boost for simple AI
  }


  private applyCarControls(body: Matter.Body, input: InputState, dt: number, isPlayer: boolean): void {
    // During countdown: allow revving (throttle input) but don't apply forces
    if (this.countdownActive) {
      // Still update boost charge for player
      if (isPlayer) {
        if (input.boost) {
          if (this.boostCharge <= 0) {
            this.playerInput.boost = false;
            this.boostTouch = false;
            this.elBtnBoost.classList.remove("active");
          } else {
            this.boostCharge = Math.max(0, this.boostCharge - this.boostDrainRate * dt);
          }
        } else {
          this.boostCharge = Math.min(1.0, this.boostCharge + this.boostChargeRate * dt);
        }
        this.elBtnBoost.style.setProperty("--boost-fill", `${this.boostCharge * 100}%`);
        if (this.boostCharge >= 1.0) {
          this.elBtnBoost.classList.add("ready");
        } else {
          this.elBtnBoost.classList.remove("ready");
        }
      } else if (this.matchMode === "LOCAL_2P") {
        // Player 2 boost charge handling during countdown
        if (input.boost) {
          if (this.boostChargeP2 <= 0) {
            this.botInput.boost = false;
            this.boostTouchP2 = false;
            if (this.elBtnBoostP2) this.elBtnBoostP2.classList.remove("active");
          } else {
            this.boostChargeP2 = Math.max(0, this.boostChargeP2 - this.boostDrainRate * dt);
          }
        } else {
          this.boostChargeP2 = Math.min(1.0, this.boostChargeP2 + this.boostChargeRate * dt);
        }
        if (this.elBtnBoostP2) {
          this.elBtnBoostP2.style.setProperty("--boost-fill", `${this.boostChargeP2 * 100}%`);
          if (this.boostChargeP2 >= 1.0) {
            this.elBtnBoostP2.classList.add("ready");
          } else {
            this.elBtnBoostP2.classList.remove("ready");
          }
        }
      }
      // Prevent car movement during countdown
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      return; // Don't apply any forces during countdown
    }
    
    // For player, check boost charge and drain it
    let actualBoost = input.boost;
    if (isPlayer) {
      if (input.boost) {
        if (this.boostCharge <= 0) {
          // Out of charge, disable boost
          actualBoost = false;
          this.playerInput.boost = false;
          this.boostTouch = false;
          this.elBtnBoost.classList.remove("active");
        } else {
          // Drain charge while boosting
          this.boostCharge = Math.max(0, this.boostCharge - this.boostDrainRate * dt);
        }
      } else {
        // Recharge when not boosting
        this.boostCharge = Math.min(1.0, this.boostCharge + this.boostChargeRate * dt);
      }
      
      // Update button fill visual
      this.elBtnBoost.style.setProperty("--boost-fill", `${this.boostCharge * 100}%`);
      if (this.boostCharge >= 1.0) {
        this.elBtnBoost.classList.add("ready");
      } else {
        this.elBtnBoost.classList.remove("ready");
      }
    } else if (this.matchMode === "LOCAL_2P") {
      // Player 2 boost charge handling
      if (input.boost) {
        if (this.boostChargeP2 <= 0) {
          // Out of charge, disable boost
          actualBoost = false;
          this.botInput.boost = false;
          this.boostTouchP2 = false;
          if (this.elBtnBoostP2) this.elBtnBoostP2.classList.remove("active");
        } else {
          // Drain charge while boosting
          this.boostChargeP2 = Math.max(0, this.boostChargeP2 - this.boostDrainRate * dt);
        }
      } else {
        // Recharge when not boosting
        this.boostChargeP2 = Math.min(1.0, this.boostChargeP2 + this.boostChargeRate * dt);
      }
      
      // Update button fill visual
      if (this.elBtnBoostP2) {
        this.elBtnBoostP2.style.setProperty("--boost-fill", `${this.boostChargeP2 * 100}%`);
        if (this.boostChargeP2 >= 1.0) {
          this.elBtnBoostP2.classList.add("ready");
        } else {
          this.elBtnBoostP2.classList.remove("ready");
        }
      }
    }
    
    const maxSpeed = actualBoost ? this.settings.carMaxSpeedBoost : this.settings.carMaxSpeed;
    const forceMag = actualBoost ? this.settings.carForceBoost : this.settings.carForce;
    const turnRate = this.settings.carTurnRate;

    const fwd = { x: Math.cos(body.angle), y: Math.sin(body.angle) };

    const speed = Vector.magnitude(body.velocity);
    const thr = clamp(input.throttle, -1, 1);

    // Apply throttle force
    if (Math.abs(thr) > 0.01) {
      const scale = forceMag * thr;
      const boostMultiplier = actualBoost ? 1.8 : 1.0;
      Body.applyForce(body, body.position, { x: fwd.x * scale * boostMultiplier, y: fwd.y * scale * boostMultiplier });
    }
    
    // Apply boost force even without throttle (pure boost push)
    if (actualBoost && Math.abs(thr) < 0.01) {
      const boostForce = forceMag * 0.6; // 60% of normal force when just boosting
      Body.applyForce(body, body.position, { x: fwd.x * boostForce * 1.8, y: fwd.y * boostForce * 1.8 });
    }

    const steer = clamp(input.steer, -1, 1);
    Body.setAngularVelocity(body, lerp(body.angularVelocity, steer * turnRate, clamp(dt * 10, 0, 1)));

    // Clamp speed
    if (speed > maxSpeed) {
      const v = Vector.mult(Vector.normalise(body.velocity), maxSpeed);
      Body.setVelocity(body, v);
    }

    // Small sideways damping for "car feel"
    const right = { x: -fwd.y, y: fwd.x };
    const sideSpeed = body.velocity.x * right.x + body.velocity.y * right.y;
    const damp = 0.22;
    const vx = body.velocity.x - right.x * sideSpeed * damp;
    const vy = body.velocity.y - right.y * sideSpeed * damp;
    Body.setVelocity(body, { x: vx, y: vy });

    // Spawn VFX
    if (this.state === "PLAYING") {
      const prevSpeed = isPlayer ? this.prevPlayerSpeed : this.prevBotSpeed;
      const acceleration = speed - prevSpeed;
      
      // Spawn tire traces all the time when moving
      if (speed > 2) {
        const now = Date.now();
        // Spawn tire trace every 30ms when moving for smoother lines
        if (now - this.lastTireTraceTime > 30) {
          this.spawnTireTrace(body.position.x, body.position.y, body.angle, isPlayer);
          this.lastTireTraceTime = now;
        }
      }
      
      // Boost clouds (when boosting) - enhanced for cool nitro effect
      if (actualBoost && speed > 1) {
        this.spawnBoostCloud(body.position.x, body.position.y, fwd, speed, isPlayer);
      }
      
      // Acceleration sounds (removed acceleration cloud VFX - only turbo fire now)
      if (!input.boost && acceleration > 0.5 && speed > 3 && thr > 0.3) {
        // Play rev sound for acceleration
        this.audio.playRev(Math.min(0.6, acceleration * 0.1));
        // Play screech sound for acceleration
        this.audio.playScreech(Math.min(0.25, acceleration * 0.05));
      }
      
      // Drift particles (when turning sharply while moving)
      if (this.settings.vfxDrifting && Math.abs(steer) > 0.25 && speed > 3) {
        this.spawnDriftParticle(body.position.x, body.position.y, right, sideSpeed, isPlayer, speed);
        // Play screech sound when drifting
        this.audio.playScreech(0.2);
      }
    }

    if (isPlayer && input.boost && !isMobile()) {
      // Keyboard boost sound is too spammy; only play on touch (already handled).
    }
  }

  private spawnTireTrace(x: number, y: number, angle: number, isPlayer: boolean): void {
    // Calculate left and right tire positions
    // Car width from settings, offset tires to the sides
    const carW = this.settings.carWidth;
    const tireOffset = carW * 0.35; // Distance from center to each tire
    
    // Calculate perpendicular direction (right side of car)
    const rightX = -Math.sin(angle);
    const rightY = Math.cos(angle);
    
    // Left tire position (negative right direction)
    const leftX = x - rightX * tireOffset;
    const leftY = y - rightY * tireOffset;
    
    // Right tire position (positive right direction)
    const rightTireX = x + rightX * tireOffset;
    const rightTireY = y + rightY * tireOffset;
    
    const maxLife = 3.0; // Last 3 seconds (fade faster)
    
    // Find or create tire trace path for this car
    let path = this.tireTraces.find(p => p.isPlayer === isPlayer);
    if (!path) {
      path = {
        leftTire: [],
        rightTire: [],
        isPlayer,
      };
      this.tireTraces.push(path);
    }
    
    // Add points to the tire paths
    path.leftTire.push({
      x: leftX,
      y: leftY,
      life: 0,
      maxLife,
    });
    
    path.rightTire.push({
      x: rightTireX,
      y: rightTireY,
      life: 0,
      maxLife,
    });
    
    // Limit path length to prevent memory issues (keep last 400 points per tire = ~12 seconds at 30ms intervals)
    if (path.leftTire.length > 400) {
      path.leftTire.shift();
    }
    if (path.rightTire.length > 400) {
      path.rightTire.shift();
    }
  }

  private spawnBoostCloud(x: number, y: number, fwd: { x: number; y: number }, speed: number, isPlayer: boolean): void {
    // Turbo/fire effect - spawn particles behind the car in a stream
    const intensity = this.settings.vfxBoostCloudIntensity;
    const count = Math.floor(4 + speed * 0.5 * intensity);
    for (let i = 0; i < count; i++) {
      // Spawn particles in a stream behind the car (along the reverse direction)
      const dist = 8 + i * 12 + Math.random() * 8; // Staggered along the exhaust trail
      const sideOffset = (Math.random() - 0.5) * 6; // Slight side variation
      const rightX = -fwd.y; // Perpendicular to forward
      const rightY = fwd.x;
      const spd = 60 + Math.random() * 40;
      
      this.boostClouds.push({
        x: x - fwd.x * dist + rightX * sideOffset,
        y: y - fwd.y * dist + rightY * sideOffset,
        vx: -fwd.x * spd + (Math.random() - 0.5) * 15,
        vy: -fwd.y * spd + (Math.random() - 0.5) * 15,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 18 + Math.random() * 12, // Bigger size for more prominent fire
        alpha: 0.8 + Math.random() * 0.2,
        dirX: -fwd.x, // Store direction for turbo shape
        dirY: -fwd.y,
      });
    }
  }

  private spawnAccelerationCloud(x: number, y: number, fwd: { x: number; y: number }, speed: number, acceleration: number): void {
    if (!this.settings.vfxBoostClouds) return;
    const intensity = this.settings.vfxBoostCloudIntensity;
    const count = Math.floor(1 + acceleration * 0.5 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 10;
      const spd = 15 + Math.random() * 25;
      this.boostClouds.push({
        x: x - fwd.x * dist,
        y: y - fwd.y * dist,
        vx: -fwd.x * spd * 0.6 + (Math.random() - 0.5) * 20,
        vy: -fwd.y * spd * 0.6 + (Math.random() - 0.5) * 20,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.15,
        size: 8 + Math.random() * 12,
        alpha: 0.3 + Math.random() * 0.2,
        dirX: -fwd.x,
        dirY: -fwd.y,
      });
    }
  }

  private spawnDriftParticle(x: number, y: number, right: { x: number; y: number }, sideSpeed: number, isPlayer: boolean, speed: number): void {
    if (!this.settings.vfxDrifting) return;
    const intensity = this.settings.vfxDriftIntensity;
    if (Math.random() > 0.4 * intensity) return; // Throttle spawn rate
    const spd = Math.abs(sideSpeed);
    const speedFactor = Math.min(speed / 10, 1.0);
    this.driftParticles.push({
      x: x + right.x * (Math.random() - 0.5) * 25,
      y: y + right.y * (Math.random() - 0.5) * 25,
      vx: right.x * spd * 0.6 + (Math.random() - 0.5) * 25 * speedFactor,
      vy: right.y * spd * 0.6 + (Math.random() - 0.5) * 25 * speedFactor,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.4,
      size: 8 + Math.random() * 12 * speedFactor,
      alpha: 0.6 + Math.random() * 0.3,
    });
  }

  private spawnBallImpactCloud(x: number, y: number, normal: { x: number; y: number }, impact: number): void {
    if (!this.settings.vfxBoostClouds) return;
    const intensity = this.settings.vfxBoostCloudIntensity;
    const count = Math.floor(2 + impact * 0.8 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(normal.y, normal.x) + (Math.random() - 0.5) * 1.5;
      const dist = 4 + Math.random() * 8;
      const spd = 30 + impact * 3 + Math.random() * 40;
      this.boostClouds.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * spd * 0.7 + (Math.random() - 0.5) * 25,
        vy: Math.sin(angle) * spd * 0.7 + (Math.random() - 0.5) * 25,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 10 + Math.random() * 14,
        alpha: 0.5 + Math.random() * 0.3,
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
      });
    }
  }

  private spawnBumpParticle(x: number, y: number, normal: { x: number; y: number }, impact: number): void {
    if (!this.settings.vfxBumping) return;
    const intensity = this.settings.vfxBumpIntensity;
    const count = Math.floor(3 + impact * 0.5 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(normal.y, normal.x) + (Math.random() - 0.5) * 1.2;
      const spd = 40 + impact * 2 + Math.random() * 30;
      this.bumpParticles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.15,
        size: 4 + Math.random() * 6,
        alpha: 0.7 + Math.random() * 0.2,
        hue: 30 + Math.random() * 40, // Orange-yellow sparks
      });
    }
  }

  private update(dt: number): void {
    if (this.state === "MENU") return;
    
    // Debug: log update cycle occasionally
    if (Math.random() < 0.01) { // ~1% of frames
      // Reduced debug logging frequency to prevent stutters
      if (Math.random() < 0.01) {
        this.debugLog("info", `Update: state=${this.state}, dt=${dt.toFixed(4)}, zoom=${this.currentZoom.toFixed(2)}`);
      }
    }
    
    // During countdown: allow car controls (revving) but prevent movement and ball physics
    if (this.countdownActive) {
      // Allow input processing for revving
      this.updateInputsFromKeyboard();
      if (this.matchMode === "BOT") this.computeBotAI(dt);
      
      // Prevent ball from moving during countdown - set velocity to 0 every frame
      Body.setVelocity(this.ball, { x: 0, y: 0 });
      Body.setAngularVelocity(this.ball, 0);
      
      // Prevent cars from moving but allow them to rev (throttle input works, but no forces applied)
      // This is handled in applyCarControls by checking countdownActive
      // Also prevent car movement by setting velocity to 0
      Body.setVelocity(this.playerCar, { x: 0, y: 0 });
      Body.setAngularVelocity(this.playerCar, 0);
      Body.setVelocity(this.botCar, { x: 0, y: 0 });
      Body.setAngularVelocity(this.botCar, 0);
      
      // Don't run physics update during countdown
      // Camera update happens in render(), so we just return here
      return;
    }

    // Apply time scale (slow motion)
    const scaledDt = dt * this.timeScale;
    
    // Gradually return to normal time
    if (this.timeScale < 1.0 && this.state === "GOAL") {
      this.timeScale = Math.min(1.0, this.timeScale + dt * 0.8);
    }

    // Update camera shake
    if (this.cameraShake.intensity > 0) {
      this.cameraShake.x = (Math.random() - 0.5) * this.cameraShake.intensity;
      this.cameraShake.y = (Math.random() - 0.5) * this.cameraShake.intensity;
      this.cameraShake.intensity *= 0.92;
      if (this.cameraShake.intensity < 0.1) {
        this.cameraShake.intensity = 0;
        this.cameraShake.x = 0;
        this.cameraShake.y = 0;
      }
    }

    // Handle replay mode
    if (this.isReplayMode) {
      const replayDt = 0.016; // Fixed timestep for replay
      const elapsed = (performance.now() - this.replayStartTime) / 1000;
      const targetIndex = Math.floor(elapsed / replayDt) % this.replayData.length; // Loop replay
      
      // Don't auto-end replay - wait for skip button
      
      // Interpolate between frames
      const frame = this.replayData[targetIndex];
      const nextFrame = this.replayData[Math.min(targetIndex + 1, this.replayData.length - 1)];
      const t = (elapsed / replayDt) % 1;
      
      Body.setPosition(this.playerCar, {
        x: lerp(frame.playerCar.x, nextFrame.playerCar.x, t),
        y: lerp(frame.playerCar.y, nextFrame.playerCar.y, t),
      });
      Body.setAngle(this.playerCar, lerp(frame.playerCar.angle, nextFrame.playerCar.angle, t));
      
      Body.setPosition(this.botCar, {
        x: lerp(frame.botCar.x, nextFrame.botCar.x, t),
        y: lerp(frame.botCar.y, nextFrame.botCar.y, t),
      });
      Body.setAngle(this.botCar, lerp(frame.botCar.angle, nextFrame.botCar.angle, t));
      
      Body.setPosition(this.ball, {
        x: lerp(frame.ball.x, nextFrame.ball.x, t),
        y: lerp(frame.ball.y, nextFrame.ball.y, t),
      });
      
      // Camera follows the scoring player during replay
      if (this.replayScoringPlayer !== null) {
        const scoringCar = this.replayScoringPlayer ? frame.playerCar : frame.botCar;
        const nextScoringCar = this.replayScoringPlayer ? nextFrame.playerCar : nextFrame.botCar;
        const camTargetX = lerp(scoringCar.x, nextScoringCar.x, t);
        const camTargetY = lerp(scoringCar.y, nextScoringCar.y, t);
        
        // Smooth camera follow
        const k = 14;
        const a = 1 - Math.exp(-k * dt);
        this.camX = lerp(this.camX, camTargetX, a);
        this.camY = lerp(this.camY, camTargetY, a);
      }
      
      return; // Skip normal update during replay
    }

    if (this.state === "PLAYING") {
      this.matchTime += scaledDt;
      if (this.matchTime >= this.matchLimit) {
        this.endMatch();
        return;
      }
      
      // Record replay data (last 4 seconds at 60fps)
      if (this.recordingReplay) {
        this.replayData.push({
          playerCar: { ...this.playerCar.position, angle: this.playerCar.angle },
          botCar: { ...this.botCar.position, angle: this.botCar.angle },
          ball: { ...this.ball.position },
          time: this.matchTime,
        });
        // Keep only last 4 seconds (240 frames at 60fps)
        if (this.replayData.length > 240) {
          this.replayData.shift();
        }
      }
    }

    if (this.state === "GOAL") {
      this.goalPause -= scaledDt;
      
      // Update goal animation
      if (this.goalAnimation.active) {
        this.goalAnimation.time += scaledDt;
        const t = Math.min(this.goalAnimation.time / this.goalAnimation.maxTime, 1.0);
        
        // Bounce scale animation (ease out bounce)
        if (t < 1) {
          const bounce = 1 - Math.pow(1 - t, 3);
          this.goalAnimation.scale = bounce * 1.1; // Slight overshoot
          if (this.goalAnimation.scale > 1.0) {
            this.goalAnimation.scale = 1.0 + (this.goalAnimation.scale - 1.0) * 0.3; // Bounce back
          }
        } else {
          this.goalAnimation.scale = 1.0;
        }
        
        // Rotation (slight spin)
        this.goalAnimation.rotation = Math.sin(t * Math.PI * 2) * 0.15;
        
        // Fade in
        this.goalAnimation.alpha = Math.min(t * 2, 1.0);
        
        // Fade out at the end
        if (t > 0.7) {
          this.goalAnimation.alpha = 1.0 - ((t - 0.7) / 0.3);
        }
        
        if (t >= 1.0) {
          this.goalAnimation.active = false;
        }
      }
    }

    this.updateInputsFromKeyboard();
    if (this.matchMode === "BOT") this.computeBotAI(scaledDt);

    if (this.state === "PLAYING") {
      this.applyCarControls(this.playerCar, this.playerInput, scaledDt, true);
      this.applyCarControls(this.botCar, this.botInput, scaledDt, false);
    }

    Engine.update(this.engine, scaledDt * 1000);

    // Prevent ball from getting stuck in corners
    this.preventBallStuckInCorner();

    // Prevent ball from going out of bounds (comprehensive bounds checking)
    this.enforceBallBounds();
    this.keepBallMoving(); // Ensure ball never stops

    // Dynamic camera zoom and follow
    const fixedFieldW = 720;
    const fixedFieldH = 1200;
    
    // Calculate dynamic zoom adjustments based on speed and ball distance
    const playerSpeed = Vector.magnitude(this.playerCar.velocity);
    const maxSpeed = this.settings.carMaxSpeedBoost;
    const speedRatio = Math.min(playerSpeed / maxSpeed, 1.0);
    
    // Base zoom at 1.20
    let baseZoom = 1.20;
    
    // In BOT mode: intense zoom when accelerating (subtract from zoom to zoom IN)
    if (this.matchMode === "BOT") {
      // Intense zoom: subtract from base zoom to zoom IN dramatically
      // Higher speed = more zoom in (lower zoom value = closer view)
      const intenseZoomAmount = speedRatio * 0.45; // 45% zoom in at max speed (very dramatic)
      baseZoom = 1.20 - intenseZoomAmount; // Subtract to zoom IN
      // Clamp to prevent zooming too close
      baseZoom = Math.max(0.75, baseZoom); // Don't zoom closer than 0.75
    } else {
      // LOCAL_2P mode: normal zoom behavior (add small adjustments)
      const baseZoomFactor = this.settings.cameraZoomSpeedFactor;
      const speedZoomAdjust = speedRatio * baseZoomFactor;
    
    // Zoom based on ball distance (closer ball = zoom in more) - small adjustment
    const ballDist = Vector.magnitude(Vector.sub(this.ball.position, this.playerCar.position));
    const maxDist = Math.sqrt(fixedFieldW * fixedFieldW + fixedFieldH * fixedFieldH);
    const distRatio = Math.min(ballDist / maxDist, 1.0);
    const ballZoomAdjust = (1.0 - distRatio) * this.settings.cameraZoomBallFactor;
    
      // Add adjustments (but these are small, so effect is minimal)
      baseZoom = 1.20 + speedZoomAdjust + ballZoomAdjust;
    }
    
    this.targetZoom = baseZoom;
    
    // Smooth zoom transition
    const zoomSmooth = this.settings.cameraZoomSmoothness;
    const zoomA = 1 - Math.exp(-zoomSmooth * dt);
    this.currentZoom = lerp(this.currentZoom, this.targetZoom, zoomA);
    
    const viewW = fixedFieldW * this.currentZoom;
    const viewH = fixedFieldH * this.currentZoom;

    const px = this.playerCar.position.x;
    const py = this.playerCar.position.y;
    const bx = this.ball.position.x;
    const by2 = this.ball.position.y;

    const targetX = lerp(px, bx, 0.18);
    const targetY = lerp(py, by2, 0.28);

    // Allow camera to follow the car across the larger stadium (no clamping)
    const k = 14; // responsiveness
    const a = 1 - Math.exp(-k * dt);
    this.camX = lerp(this.camX, targetX, a);
    this.camY = lerp(this.camY, targetY, a);
    
    // Apply camera shake
    this.camX += this.cameraShake.x;
    this.camY += this.cameraShake.y;
    
    // Detect collisions for bump VFX
    if (this.state === "PLAYING" && this.settings.vfxBumping) {
      this.detectCollisions();
    }

    // Ball trail (update-side so render stays deterministic)
    if (this.state === "PLAYING") {
      this.ballTrail.push({ x: this.ball.position.x, y: this.ball.position.y, life: 0, maxLife: 0.5 });
      if (this.ballTrail.length > 26) this.ballTrail.shift();
    }
    for (const t of this.ballTrail) t.life += dt;
    this.ballTrail = this.ballTrail.filter((t) => t.life < t.maxLife);

    // Update particles
    for (const p of this.goalBurst) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
    this.goalBurst = this.goalBurst.filter((p) => p.life < p.maxLife);
    
    // Update VFX particles
    for (const p of this.boostClouds) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.boostClouds = this.boostClouds.filter((p) => p.life < p.maxLife);
    
    for (const p of this.driftParticles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.driftParticles = this.driftParticles.filter((p) => p.life < p.maxLife);
    
    for (const p of this.bumpParticles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.bumpParticles = this.bumpParticles.filter((p) => p.life < p.maxLife);
    
    // Update tire traces
    for (const path of this.tireTraces) {
      for (const point of path.leftTire) {
        point.life += dt;
      }
      for (const point of path.rightTire) {
        point.life += dt;
      }
      
      // Remove expired points
      path.leftTire = path.leftTire.filter((p) => p.life < p.maxLife);
      path.rightTire = path.rightTire.filter((p) => p.life < p.maxLife);
    }
    
    // Remove empty paths
    this.tireTraces = this.tireTraces.filter((p) => p.leftTire.length > 0 || p.rightTire.length > 0);
    
    // Store previous positions/velocities for collision detection
    this.prevPlayerVel = { ...this.playerCar.velocity };
    this.prevBotVel = { ...this.botCar.velocity };
    this.prevPlayerPos = { ...this.playerCar.position };
    this.prevBotPos = { ...this.botCar.position };
    this.prevPlayerSpeed = Vector.magnitude(this.playerCar.velocity);
    this.prevBotSpeed = Vector.magnitude(this.botCar.velocity);
    this.prevBallVel = { ...this.ball.velocity };
    this.prevBallPos = { ...this.ball.position };

  }

  private preventBallStuckInCorner(): void {
    if (this.state !== "PLAYING") return;
    
    const ballPos = this.ball.position;
    const ballVel = this.ball.velocity;
    const ballSpeed = Vector.magnitude(ballVel);
    
    const fieldW = this.fieldW;
    const fieldH = this.fieldH;
    const cornerThreshold = 60; // Distance from corner to consider "stuck"
    const minSpeed = 2; // Minimum speed to consider ball moving
    
    // Check if ball is near a corner (close to both X and Y boundaries)
    const nearLeftWall = ballPos.x < -fieldW * 0.5 + cornerThreshold;
    const nearRightWall = ballPos.x > fieldW * 0.5 - cornerThreshold;
    const nearTopWall = ballPos.y < -fieldH * 0.5 + cornerThreshold;
    const nearBottomWall = ballPos.y > fieldH * 0.5 - cornerThreshold;
    
    const inCorner = (nearLeftWall || nearRightWall) && (nearTopWall || nearBottomWall);
    
    // If ball is in a corner and has very low velocity, push it away
    if (inCorner && ballSpeed < minSpeed) {
      // Calculate direction away from the corner
      let pushX = 0;
      let pushY = 0;
      
      // Push away from X boundary
      if (nearLeftWall) {
        pushX = 1; // Push right
      } else if (nearRightWall) {
        pushX = -1; // Push left
      }
      
      // Push away from Y boundary
      if (nearTopWall) {
        pushY = 1; // Push down
      } else if (nearBottomWall) {
        pushY = -1; // Push up
      }
      
      // Normalize the push direction
      const pushMag = Math.sqrt(pushX * pushX + pushY * pushY);
      if (pushMag > 0) {
        pushX /= pushMag;
        pushY /= pushMag;
        
        // Apply a force to push the ball away from the corner
        const pushForce = 0.015; // Force magnitude
        Body.applyForce(this.ball, ballPos, {
          x: pushX * pushForce,
          y: pushY * pushForce,
        });
      }
    }
  }

  private keepBallMoving(): void {
    // Ensure ball never stops - always has minimum velocity
    if (this.state !== "PLAYING") return;
    
    const ballVel = this.ball.velocity;
    const speed = Vector.magnitude(ballVel);
    const minSpeed = 0.5; // Minimum speed to keep ball sliding
    
    if (speed < minSpeed) {
      // Ball is too slow, give it a random push
      const randomAngle = Math.random() * Math.PI * 2;
      const pushSpeed = minSpeed + Math.random() * 0.5; // 0.5 to 1.0 speed
      const newVel = {
        x: Math.cos(randomAngle) * pushSpeed,
        y: Math.sin(randomAngle) * pushSpeed
      };
      Body.setVelocity(this.ball, newVel);
    }
  }

  private enforceBallBounds(): void {
    if (this.state !== "PLAYING") return;
    
    const ballPos = this.ball.position;
    const ballRadius = this.settings.ballRadius * this.settings.ballBoundsScale;
    const fieldW = this.fieldW;
    const fieldH = this.fieldH;
    const goalW = this.goalW;
    
    // Early exit: only check if ball is actually out of bounds (performance optimization)
    const leftBound = -fieldW * 0.5 + ballRadius;
    const rightBound = fieldW * 0.5 - ballRadius;
    const topBound = -fieldH * 0.5 + ballRadius;
    const bottomBound = fieldH * 0.5 - ballRadius;
    
    // Quick check: if ball is well within bounds, skip all processing
    if (ballPos.x > leftBound && ballPos.x < rightBound && 
        ballPos.y > topBound && ballPos.y < bottomBound) {
      return; // Ball is safely within bounds
    }
    
    // Goal openings (middle of top and bottom walls)
    const goalHalf = goalW * 0.5;
    
    let newX = ballPos.x;
    let newY = ballPos.y;
    let needsVelocityChange = false;
    let newVelX = this.ball.velocity.x;
    let newVelY = this.ball.velocity.y;
    
    // Check X bounds (left/right walls) - only correct if actually out
    if (ballPos.x < leftBound) {
      newX = leftBound;
      // Make it slip out - add tangential velocity to prevent sticking
      // Always add some Y velocity to make it slip along the wall
      const currentYVel = Math.abs(newVelY);
      const minSlipSpeed = 0.8; // Minimum speed to slip
      newVelX = Math.max(currentYVel, minSlipSpeed) * 0.4; // Slip to the right
      newVelY = newVelY * 0.85 + (Math.random() - 0.5) * 0.3; // Keep Y velocity with randomness
      needsVelocityChange = true;
    } else if (ballPos.x > rightBound) {
      newX = rightBound;
      // Make it slip out - add tangential velocity to prevent sticking
      // Always add some Y velocity to make it slip along the wall
      const currentYVel = Math.abs(newVelY);
      const minSlipSpeed = 0.8; // Minimum speed to slip
      newVelX = -Math.max(currentYVel, minSlipSpeed) * 0.4; // Slip to the left
      newVelY = newVelY * 0.85 + (Math.random() - 0.5) * 0.3; // Keep Y velocity with randomness
      needsVelocityChange = true;
    }
    
    // Check Y bounds (top/bottom walls, but allow through goal openings)
    if (ballPos.y < topBound) {
      // Check if ball is within goal opening horizontally
      if (Math.abs(ballPos.x) < goalHalf) {
        // Ball is in goal opening, allow it to go through (but limit depth)
        const maxGoalY = topBound - this.settings.goalDepth;
        if (ballPos.y < maxGoalY) {
          newY = maxGoalY;
          newVelY = -newVelY * 0.8; // Reverse and dampen
          needsVelocityChange = true;
        }
      } else {
        // Ball is hitting top wall (not in goal)
        newY = topBound;
        // Make it slip out - add tangential velocity to prevent sticking
        // Always add some X velocity to make it slip along the wall
        const currentXVel = Math.abs(newVelX);
        const minSlipSpeed = 0.8; // Minimum speed to slip
        newVelY = Math.max(currentXVel, minSlipSpeed) * 0.4; // Slip downward
        newVelX = newVelX * 0.85 + (Math.random() - 0.5) * 0.3; // Keep X velocity with randomness
        needsVelocityChange = true;
      }
    } else if (ballPos.y > bottomBound) {
      // Check if ball is within goal opening horizontally
      if (Math.abs(ballPos.x) < goalHalf) {
        // Ball is in goal opening, allow it to go through (but limit depth)
        const maxGoalY = bottomBound + this.settings.goalDepth;
        if (ballPos.y > maxGoalY) {
          newY = maxGoalY;
          newVelY = -newVelY * 0.8; // Reverse and dampen
          needsVelocityChange = true;
        }
      } else {
        // Ball is hitting bottom wall (not in goal)
        newY = bottomBound;
        // Make it slip out - add tangential velocity to prevent sticking
        // Always add some X velocity to make it slip along the wall
        const currentXVel = Math.abs(newVelX);
        const minSlipSpeed = 0.8; // Minimum speed to slip
        newVelY = -Math.max(currentXVel, minSlipSpeed) * 0.4; // Slip upward
        newVelX = newVelX * 0.85 + (Math.random() - 0.5) * 0.3; // Keep X velocity with randomness
        needsVelocityChange = true;
      }
    }
    
    // Apply all changes at once (single physics update to avoid stuttering)
    if (needsVelocityChange || newX !== ballPos.x || newY !== ballPos.y) {
      if (newX !== ballPos.x || newY !== ballPos.y) {
        Body.setPosition(this.ball, { x: newX, y: newY });
      }
      if (needsVelocityChange) {
        Body.setVelocity(this.ball, { x: newVelX, y: newVelY });
      }
    }
  }

  private detectCollisions(): void {
    // Detect car-to-ball collisions
    const ballVel = this.ball.velocity;
    const ballPos = this.ball.position;
    const playerVel = this.playerCar.velocity;
    const botVel = this.botCar.velocity;
    const playerPos = this.playerCar.position;
    const botPos = this.botCar.position;
    
    const carRadius = Math.max(this.settings.carWidth, this.settings.carHeight) * 0.6;
    const ballRadius = this.settings.ballRadius;
    const collisionDist = carRadius + ballRadius;
    
    // Player car to ball collision
    const playerToBall = Vector.magnitude(Vector.sub(ballPos, playerPos));
    if (playerToBall < collisionDist * 1.3) {
      const prevDist = Vector.magnitude(Vector.sub(this.prevBallPos, this.prevPlayerPos));
      if (playerToBall < prevDist) {
        // Approaching collision
        const ballVelChange = Vector.magnitude(Vector.sub(ballVel, this.prevBallVel));
        const carVelChange = Vector.magnitude(Vector.sub(playerVel, this.prevPlayerVel));
        const impact = ballVelChange + carVelChange;
        if (impact > 1.5) {
          const normal = Vector.normalise(Vector.sub(ballPos, playerPos));
          this.spawnBumpParticle(ballPos.x, ballPos.y, normal, impact);
          // Spawn clouds at impact point
          if (this.settings.vfxBoostClouds) {
            this.spawnBallImpactCloud(ballPos.x, ballPos.y, normal, impact);
          }
        }
      }
    }
    
    // Bot car to ball collision
    const botToBall = Vector.magnitude(Vector.sub(ballPos, botPos));
    if (botToBall < collisionDist * 1.3) {
      const prevDist = Vector.magnitude(Vector.sub(this.prevBallPos, this.prevBotPos));
      if (botToBall < prevDist) {
        // Approaching collision
        const ballVelChange = Vector.magnitude(Vector.sub(ballVel, this.prevBallVel));
        const carVelChange = Vector.magnitude(Vector.sub(botVel, this.prevBotVel));
        const impact = ballVelChange + carVelChange;
        if (impact > 1.5) {
          const normal = Vector.normalise(Vector.sub(ballPos, botPos));
          this.spawnBumpParticle(ballPos.x, ballPos.y, normal, impact);
          // Spawn clouds at impact point
          if (this.settings.vfxBoostClouds) {
            this.spawnBallImpactCloud(ballPos.x, ballPos.y, normal, impact);
          }
          // Play bump sound
          this.audio.playBump(Math.min(0.8, impact * 0.1));
        }
      }
    }
    
    // Detect car-to-car collisions
    const dist = Vector.magnitude(Vector.sub(playerPos, botPos));
    
    if (dist < carRadius * 2.2) {
      // Check if velocities changed significantly (collision)
      const prevDist = Vector.magnitude(Vector.sub(this.prevPlayerPos, this.prevBotPos));
      if (dist < prevDist) {
        // Approaching collision
        const impact = Vector.magnitude(Vector.sub(playerVel, this.prevPlayerVel)) + 
                      Vector.magnitude(Vector.sub(botVel, this.prevBotVel));
        if (impact > 2) {
          const midX = (playerPos.x + botPos.x) * 0.5;
          const midY = (playerPos.y + botPos.y) * 0.5;
          const normal = Vector.normalise(Vector.sub({ x: midX, y: midY }, playerPos));
          this.spawnBumpParticle(midX, midY, normal, impact);
          // Play bump sound for car-to-car collision
          this.audio.playBump(Math.min(0.9, impact * 0.08));
          // Play crowd sound for heavy impacts (varying volume based on impact)
          if (impact > 8) {
            this.audio.playCrowd(Math.min(0.9, impact * 0.05)); // Heavy impact
          } else if (impact > 5) {
            this.audio.playCrowd(Math.min(0.7, impact * 0.06)); // Medium-heavy impact
          }
        }
      }
    }
    
    // Detect car-to-wall collisions (simplified: check if velocity changed near boundaries)
    const fieldW = this.fieldW;
    const fieldH = this.fieldH;
    const margin = 50;
    
    // Player car wall collision
    if (Math.abs(playerPos.x) > fieldW * 0.5 - margin || Math.abs(playerPos.y) > fieldH * 0.5 - margin) {
      const velChange = Vector.magnitude(Vector.sub(playerVel, this.prevPlayerVel));
      if (velChange > 3) {
        const normal = { x: Math.abs(playerPos.x) > fieldW * 0.5 - margin ? (playerPos.x > 0 ? -1 : 1) : 0,
                        y: Math.abs(playerPos.y) > fieldH * 0.5 - margin ? (playerPos.y > 0 ? -1 : 0) : 0 };
        if (normal.x !== 0 || normal.y !== 0) {
          this.spawnBumpParticle(playerPos.x, playerPos.y, normal, velChange);
          // Play bump sound for wall collision
          this.audio.playBump(Math.min(0.7, velChange * 0.1));
        }
      }
    }
    
    // Bot car wall collision
    if (Math.abs(botPos.x) > fieldW * 0.5 - margin || Math.abs(botPos.y) > fieldH * 0.5 - margin) {
      const velChange = Vector.magnitude(Vector.sub(botVel, this.prevBotVel));
      if (velChange > 3) {
        const normal = { x: Math.abs(botPos.x) > fieldW * 0.5 - margin ? (botPos.x > 0 ? -1 : 1) : 0,
                        y: Math.abs(botPos.y) > fieldH * 0.5 - margin ? (botPos.y > 0 ? -1 : 0) : 0 };
        if (normal.x !== 0 || normal.y !== 0) {
          this.spawnBumpParticle(botPos.x, botPos.y, normal, velChange);
          // Play bump sound for wall collision
          this.audio.playBump(Math.min(0.7, velChange * 0.1));
        }
      }
    }
  }

  private spawnGoalBurst(isPlayer: boolean): void {
    const hue = isPlayer ? 190 : 330;
    const x = 0;
    const y = isPlayer ? -this.fieldH * 0.5 + 40 : this.fieldH * 0.5 - 40;
    const n = 44;
    const base = isPlayer ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 150 + (i % 7) * 12;
      this.goalBurst.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + base * 160,
        life: 0,
        maxLife: 0.9,
        hue: hue + (i % 9) * 3,
      });
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Debug: check for canvas context issues (iOS can lose context)
    if (!ctx) {
      this.debugLog("error", "Canvas context is null!");
      return;
    }
    
    // Debug: check canvas size issues
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      this.debugLog("error", `Canvas has zero size: ${this.canvas.width}x${this.canvas.height}`);
    }

    // Debug: log render info occasionally
    if (Math.random() < 0.01) { // ~1% of frames
      // Reduced debug logging frequency to prevent stutters
      if (Math.random() < 0.01) {
        this.debugLog("render", `Render: ${w}x${h}, canvas=${this.canvas.width}x${this.canvas.height}, state=${this.state}, DPR=${window.devicePixelRatio || 1}`);
      }
    }

    ctx.clearRect(0, 0, w, h);

    // Gameplay camera (dynamic zoom view)
    const pad = isMobile() ? 18 : 26;
    const topUI = isMobile() ? 190 : 120;
    const availH = Math.max(200, h - topUI - (isMobile() ? 120 : 0) - pad);
    // Use fixed field dimensions for camera (not adjustable bounds) so background doesn't move
    const fixedFieldW = 720;
    const fixedFieldH = 1200;
    const zoom = this.currentZoom;
    const viewW = fixedFieldW * zoom;
    const viewH = fixedFieldH * zoom;
    const scale = Math.min((w - pad * 2) / viewW, availH / viewH);
    const cx = w * 0.5;
    const cy = topUI + availH * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-this.camX, -this.camY);

    this.drawStadiumBG(ctx);
    this.drawStadiumBounds(ctx);
    this.drawTireTraces(ctx);
    this.drawBallTrail(ctx);
    // Draw VFX before bodies so they appear behind
    this.drawVFX(ctx);
    this.drawBodies(ctx);
    this.drawGoalBurst(ctx);

    ctx.restore();

    // Draw goal animation overlay (screen space)
    if (this.goalAnimation.active && this.goalImage && this.goalImage.naturalWidth > 0 && this.goalImage.naturalHeight > 0) {
      ctx.save();
      ctx.globalAlpha = this.goalAnimation.alpha;
      const imgW = this.goalImage.naturalWidth;
      const imgH = this.goalImage.naturalHeight;
      const isMobile = window.matchMedia("(pointer: coarse)").matches;
      const scale = isMobile ? 0.5 : 0.8; // Smaller on mobile
      const displayW = imgW * scale;
      const displayH = imgH * scale;
      const centerX = w * 0.5;
      const centerY = h * 0.5;
      
      ctx.translate(centerX, centerY);
      ctx.rotate(this.goalAnimation.rotation);
      ctx.scale(this.goalAnimation.scale, this.goalAnimation.scale);
      
      // Glow effect
      ctx.shadowBlur = 30;
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      
      // Debug: log goal image drawing (reduced frequency)
      if (Math.random() < 0.01) {
        this.debugLog("render", `drawGoalImage: ${imgW}x${imgH}, display=${displayW}x${displayH}, scale=${scale}`);
      }
      ctx.drawImage(
        this.goalImage,
        -displayW * 0.5,
        -displayH * 0.5,
        displayW,
        displayH
      );
      
      ctx.restore();
    }

    // HUD text update
    this.elHudYou.textContent = String(this.playerScore);
    this.elHudBot.textContent = String(this.botScore);
    this.elHudTime.textContent = fmtTimeSec(this.matchTime);
    
    // Update HUD flags (in case they weren't set) - use preloaded images
    if (this.elHudPlayerFlag && (!this.elHudPlayerFlag.src || this.elHudPlayerFlag.src.includes("about:blank"))) {
      const playerFlagImg = this.flagImages.get(this.selectedCountry);
      if (playerFlagImg && playerFlagImg.complete && playerFlagImg.naturalWidth > 0) {
        this.elHudPlayerFlag.src = playerFlagImg.src;
      } else {
        this.elHudPlayerFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.selectedCountry}.svg`;
      }
    }
    if (this.elHudBotFlag && (!this.elHudBotFlag.src || this.elHudBotFlag.src.includes("about:blank"))) {
      const botFlagImg = this.flagImages.get(this.botCountry);
      if (botFlagImg && botFlagImg.complete && botFlagImg.naturalWidth > 0) {
        this.elHudBotFlag.src = botFlagImg.src;
      } else {
        this.elHudBotFlag.src = `https://hatscripts.github.io/circle-flags/flags/${this.botCountry}.svg`;
      }
    }
  }

  private drawStadiumBG(ctx: CanvasRenderingContext2D): void {
    // Fallback if image hasn't loaded yet
    if (!this.stadiumBg || this.stadiumBg.naturalWidth === 0 || this.stadiumBg.naturalHeight === 0) {
      if (Math.random() < 0.05) { // Log occasionally
        this.debugLog("warn", `StadiumBG: image not loaded (w=${this.stadiumBg?.naturalWidth || 0}, h=${this.stadiumBg?.naturalHeight || 0})`);
      }
      // Use fixed size for fallback, not the adjustable bounds
      const w = 720;
      const h = 1200;
      ctx.fillStyle = "rgba(16, 30, 24, 1)";
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
      return;
    }

    // Draw the stadium at a fixed large size (independent of adjustable field bounds).
    // The source background is horizontal; rotate 90° so gameplay stays vertical (goals top/bottom).
    // Use fixed 4x multiplier of original field size (720x1200) so background doesn't move when bounds change.
    const fixedFieldW = 720;
    const fixedFieldH = 1200;
    const stadiumW = fixedFieldW * 4;
    const stadiumH = fixedFieldH * 4;
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(this.stadiumBg, -stadiumH * 0.5, -stadiumW * 0.5, stadiumH, stadiumW);
    ctx.restore();
  }

  private drawStadiumBounds(ctx: CanvasRenderingContext2D): void {
    const w = this.fieldW;
    const h = this.fieldH;
    const goalHalf = this.goalW * 0.5;
    const goalDepth = this.settings.goalDepth;

    ctx.save();
    ctx.strokeStyle = "rgba(183, 255, 74, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    // Field boundaries
    ctx.beginPath();
    // Left wall
    ctx.moveTo(-w * 0.5, -h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    // Right wall
    ctx.moveTo(w * 0.5, -h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.5);
    // Top wall (with goal opening)
    ctx.moveTo(-w * 0.5, -h * 0.5);
    ctx.lineTo(-goalHalf, -h * 0.5);
    ctx.moveTo(goalHalf, -h * 0.5);
    ctx.lineTo(w * 0.5, -h * 0.5);
    // Bottom wall (with goal opening)
    ctx.moveTo(-w * 0.5, h * 0.5);
    ctx.lineTo(-goalHalf, h * 0.5);
    ctx.moveTo(goalHalf, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.stroke();

    // Goal posts and depth
    ctx.strokeStyle = "rgba(255, 106, 213, 0.7)";
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    
    // Top goal
    ctx.beginPath();
    // Goal opening
    ctx.moveTo(-goalHalf, -h * 0.5);
    ctx.lineTo(goalHalf, -h * 0.5);
    // Goal depth lines
    ctx.moveTo(-goalHalf, -h * 0.5);
    ctx.lineTo(-goalHalf, -h * 0.5 - goalDepth);
    ctx.moveTo(goalHalf, -h * 0.5);
    ctx.lineTo(goalHalf, -h * 0.5 - goalDepth);
    // Back wall
    ctx.moveTo(-goalHalf, -h * 0.5 - goalDepth);
    ctx.lineTo(goalHalf, -h * 0.5 - goalDepth);
    ctx.stroke();

    // Bottom goal
    ctx.beginPath();
    // Goal opening
    ctx.moveTo(-goalHalf, h * 0.5);
    ctx.lineTo(goalHalf, h * 0.5);
    // Goal depth lines
    ctx.moveTo(-goalHalf, h * 0.5);
    ctx.lineTo(-goalHalf, h * 0.5 + goalDepth);
    ctx.moveTo(goalHalf, h * 0.5);
    ctx.lineTo(goalHalf, h * 0.5 + goalDepth);
    // Back wall
    ctx.moveTo(-goalHalf, h * 0.5 + goalDepth);
    ctx.lineTo(goalHalf, h * 0.5 + goalDepth);
    ctx.stroke();

    ctx.restore();
  }

  // Removed: procedural city/crowd backdrop (stadium art is baked into `game.png`)

  private drawVFX(ctx: CanvasRenderingContext2D): void {
    // Boost turbo/fire effect - elongated flame shape behind car
    for (const p of this.boostClouds as BoostCloudParticle[]) {
      const t = p.life / p.maxLife;
      const alpha = p.alpha * (1 - t);
      
      // Turbo shape: elongated along the direction, tapered (bigger)
      const length = p.size * (3.5 - t * 1.5); // Gets shorter as it fades, bigger base
      const width = p.size * (1.6 - t * 1.0); // Gets narrower as it fades, bigger base
      
      ctx.save();
      ctx.translate(p.x, p.y);
      
      // Rotate to align with exhaust direction
      const angle = Math.atan2(p.dirY, p.dirX);
      ctx.rotate(angle);
      
      ctx.globalAlpha = alpha;
      
      // Create turbo/fire gradient - bright at base, fading at tip
      const gradient = ctx.createLinearGradient(-length * 0.5, 0, length * 0.5, 0);
      gradient.addColorStop(0, "rgba(120, 220, 255, 1.0)"); // Bright blue at base (car end)
      gradient.addColorStop(0.3, "rgba(100, 200, 255, 0.95)");
      gradient.addColorStop(0.6, "rgba(80, 180, 255, 0.7)");
      gradient.addColorStop(0.85, "rgba(60, 150, 255, 0.4)");
      gradient.addColorStop(1, "rgba(40, 120, 255, 0.1)"); // Fade at tip
      
      // Draw turbo flame shape - tapered ellipse
      ctx.fillStyle = gradient;
      ctx.beginPath();
      // Draw a tapered flame shape using bezier curves
      const tipX = length * 0.5;
      const baseX = -length * 0.5;
      const baseW = width;
      const tipW = width * 0.2;
      
      // Top curve
      ctx.moveTo(baseX, -baseW * 0.5);
      ctx.bezierCurveTo(
        baseX * 0.3, -baseW * 0.4,
        tipX * 0.3, -tipW * 0.5,
        tipX, 0
      );
      // Bottom curve
      ctx.bezierCurveTo(
        tipX * 0.3, tipW * 0.5,
        baseX * 0.3, baseW * 0.4,
        baseX, baseW * 0.5
      );
      ctx.closePath();
      ctx.fill();
      
      // Add bright inner core for extra glow
      ctx.globalAlpha = alpha * 0.9;
      const coreGradient = ctx.createLinearGradient(-length * 0.4, 0, length * 0.3, 0);
      coreGradient.addColorStop(0, "rgba(150, 230, 255, 1.0)");
      coreGradient.addColorStop(0.5, "rgba(120, 220, 255, 0.8)");
      coreGradient.addColorStop(1, "rgba(100, 200, 255, 0.3)");
      
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      const coreTipX = length * 0.3;
      const coreBaseX = -length * 0.4;
      const coreBaseW = width * 0.5;
      const coreTipW = width * 0.15;
      
      ctx.moveTo(coreBaseX, -coreBaseW * 0.5);
      ctx.bezierCurveTo(
        coreBaseX * 0.4, -coreBaseW * 0.4,
        coreTipX * 0.4, -coreTipW * 0.5,
        coreTipX, 0
      );
      ctx.bezierCurveTo(
        coreTipX * 0.4, coreTipW * 0.5,
        coreBaseX * 0.4, coreBaseW * 0.4,
        coreBaseX, coreBaseW * 0.5
      );
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    // Drift particles
    if (this.settings.vfxDrifting) {
      for (const p of this.driftParticles as DriftParticle[]) {
        const t = p.life / p.maxLife;
        const alpha = p.alpha * (1 - t);
        const size = p.size * (1 - t * 0.3);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(200, 200, 200, 0.7)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    
    // Bump particles
    if (this.settings.vfxBumping) {
      for (const p of this.bumpParticles as BumpParticle[]) {
        const t = p.life / p.maxLife;
        const alpha = p.alpha * (1 - t);
        const size = p.size * (1 - t * 0.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        const h = p.hue;
        ctx.fillStyle = `hsla(${h}, 80%, 60%, 0.9)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawTireTraces(ctx: CanvasRenderingContext2D): void {
    if (this.tireTraces.length === 0) return;
    ctx.save();
    
    // Draw each tire trace path
    for (const path of this.tireTraces) {
      // Draw left tire path as continuous line segments with fading
      if (path.leftTire.length > 1) {
        for (let i = 0; i < path.leftTire.length - 1; i++) {
          const point1 = path.leftTire[i];
          const point2 = path.leftTire[i + 1];
          
          const t1 = point1.life / point1.maxLife;
          const t2 = point2.life / point2.maxLife;
          const alpha1 = (1.0 - t1) * 0.8; // Fade from 80% to 0%
          const alpha2 = (1.0 - t2) * 0.8;
          
          // Skip if both points are invisible
          if (alpha1 <= 0 && alpha2 <= 0) continue;
          
          // Draw line segment with gradient alpha
          ctx.beginPath();
          ctx.moveTo(point1.x, point1.y);
          ctx.lineTo(point2.x, point2.y);
          
          // Use average alpha for the segment
          const avgAlpha = (alpha1 + alpha2) * 0.5;
          ctx.globalAlpha = avgAlpha;
          ctx.strokeStyle = "rgba(0, 0, 0, 1)";
          ctx.lineWidth = 6; // Thicker lines
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      }
      
      // Draw right tire path as continuous line segments with fading
      if (path.rightTire.length > 1) {
        for (let i = 0; i < path.rightTire.length - 1; i++) {
          const point1 = path.rightTire[i];
          const point2 = path.rightTire[i + 1];
          
          const t1 = point1.life / point1.maxLife;
          const t2 = point2.life / point2.maxLife;
          const alpha1 = (1.0 - t1) * 0.8; // Fade from 80% to 0%
          const alpha2 = (1.0 - t2) * 0.8;
          
          // Skip if both points are invisible
          if (alpha1 <= 0 && alpha2 <= 0) continue;
          
          // Draw line segment with gradient alpha
          ctx.beginPath();
          ctx.moveTo(point1.x, point1.y);
          ctx.lineTo(point2.x, point2.y);
          
          // Use average alpha for the segment
          const avgAlpha = (alpha1 + alpha2) * 0.5;
          ctx.globalAlpha = avgAlpha;
          ctx.strokeStyle = "rgba(0, 0, 0, 1)";
          ctx.lineWidth = 6; // Thicker lines
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      }
    }
    
    ctx.restore();
  }

  private drawBallTrail(ctx: CanvasRenderingContext2D): void {
    if (this.ballTrail.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const t of this.ballTrail) {
      const p = clamp(t.life / t.maxLife, 0, 1);
      const a = (1 - p) * 0.18;
      ctx.fillStyle = "rgba(180,210,255," + a.toFixed(4) + ")";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 14 + 12 * (1 - p), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBodies(ctx: CanvasRenderingContext2D): void {
    // Debug: check if bodies exist
    if (!this.ball || !this.playerCar || !this.botCar) {
      this.debugLog("error", `drawBodies: Missing bodies (ball=${!!this.ball}, playerCar=${!!this.playerCar}, botCar=${!!this.botCar})`);
      return;
    }
    
    // Ball
    const b = this.ball;
    const spriteSize = this.settings.ballSpriteSize;
    const bg = ctx.createRadialGradient(b.position.x - spriteSize * 0.5, b.position.y - spriteSize * 0.5, spriteSize * 0.25, b.position.x, b.position.y, spriteSize * 1.75);
    bg.addColorStop(0, "rgba(255,220,180,0.96)"); // Light orange center
    bg.addColorStop(1, "rgba(255,180,120,0.75)"); // Light orange edge
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, spriteSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw collision bounds visualization for ball
    const actualBallRadius = this.settings.ballRadius * this.settings.ballBoundsScale;
    ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, actualBallRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cars
    this.drawCarSpriteOrFallback(ctx, this.playerCar, this.playerCarName, "rgba(80, 230, 255, 0.92)", "rgba(8, 179, 255, 0.35)");
    this.drawCarSpriteOrFallback(ctx, this.botCar, this.botCarName, "rgba(255, 106, 213, 0.92)", "rgba(255, 59, 126, 0.35)");
  }

  private drawCarSpriteOrFallback(
    ctx: CanvasRenderingContext2D,
    body: Matter.Body,
    carName: string,
    col: string,
    glow: string,
  ): void {
    const img = this.carImages.get(carName);
    const isPlayer = body === this.playerCar;
    const isBoosting = isPlayer ? this.playerInput.boost && this.boostCharge > 0 : false;
    
    // More lenient check: image exists and has valid dimensions (may not be "complete" yet)
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      // Sprites are drawn facing "up". Our physics forward at angle -PI/2 is "up".
      const rot = body.angle + Math.PI * 0.5;
      const desiredW = this.settings.carSpriteWidth;
      const desiredH = this.settings.carSpriteHeight;
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(rot);

      // Draw blue nitro flame behind car when boosting (before shadow and car)
      if (isBoosting) {
        const fwd = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
        const nitroLength = desiredH * 0.8;
        const nitroWidth = desiredW * 0.6;
        
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9;
        
        // Main nitro flame
        const nitroGradient = ctx.createLinearGradient(
          -fwd.x * nitroLength * 0.5, -fwd.y * nitroLength * 0.5,
          -fwd.x * nitroLength, -fwd.y * nitroLength
        );
        nitroGradient.addColorStop(0, "rgba(150, 230, 255, 0.9)");
        nitroGradient.addColorStop(0.3, "rgba(100, 200, 255, 0.8)");
        nitroGradient.addColorStop(0.6, "rgba(80, 180, 255, 0.6)");
        nitroGradient.addColorStop(1, "rgba(60, 150, 255, 0.2)");
        
        ctx.fillStyle = nitroGradient;
        ctx.beginPath();
        ctx.ellipse(
          -fwd.x * nitroLength * 0.5, -fwd.y * nitroLength * 0.5,
          nitroWidth * 0.5, nitroLength * 0.5,
          Math.atan2(fwd.y, fwd.x), 0, Math.PI * 2
        );
        ctx.fill();
        
        // Inner bright core
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "rgba(180, 240, 255, 1.0)";
        ctx.beginPath();
        ctx.ellipse(
          -fwd.x * nitroLength * 0.3, -fwd.y * nitroLength * 0.3,
          nitroWidth * 0.25, nitroLength * 0.25,
          Math.atan2(fwd.y, fwd.x), 0, Math.PI * 2
        );
        ctx.fill();
        
        ctx.restore();
      }

      // Soft shadow
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 8, desiredW * 0.42, desiredH * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Debug: log drawImage calls very rarely (reduced frequency to prevent stutters)
      if (Math.random() < 0.001) {
        this.debugLog("render", `drawCarSprite: ${carName}, img=${img.naturalWidth}x${img.naturalHeight}, draw=${desiredW}x${desiredH}`);
      }
      ctx.drawImage(img, -desiredW * 0.5, -desiredH * 0.5, desiredW, desiredH);
      
      // Draw collision bounds visualization (if enabled)
      if (this.settings.showCarBounds) {
      const actualCarWidth = this.settings.carWidth * this.settings.carBoundsWidth;
      const actualCarHeight = this.settings.carHeight * this.settings.carBoundsHeight;
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)"; // Cyan for better visibility
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
      ctx.strokeRect(-actualCarWidth * 0.5, -actualCarHeight * 0.5, actualCarWidth, actualCarHeight);
      ctx.setLineDash([]);
      }
      
      ctx.restore();
      return;
    }

    this.drawCarFallback(ctx, body, col, glow);
    
    // Draw collision bounds visualization for fallback car too (if enabled)
    if (this.settings.showCarBounds) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    const actualCarWidth = this.settings.carWidth * this.settings.carBoundsWidth;
    const actualCarHeight = this.settings.carHeight * this.settings.carBoundsHeight;
      ctx.strokeStyle = "rgba(0, 255, 255, 0.8)"; // Cyan for better visibility
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
    ctx.strokeRect(-actualCarWidth * 0.5, -actualCarHeight * 0.5, actualCarWidth, actualCarHeight);
    ctx.setLineDash([]);
    ctx.restore();
    }
  }

  private drawCarFallback(ctx: CanvasRenderingContext2D, body: Matter.Body, col: string, glow: string): void {
    const w = 94;
    const h = 54;
    const isPlayer = body === this.playerCar;
    const isBoosting = isPlayer ? this.playerInput.boost && this.boostCharge > 0 : false;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    
    // Draw blue nitro flame behind car when boosting
    if (isBoosting) {
      const fwd = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
      const nitroLength = h * 0.9;
      const nitroWidth = w * 0.5;
      
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.9;
      
      // Main nitro flame
      const nitroGradient = ctx.createLinearGradient(
        -fwd.x * nitroLength * 0.5, -fwd.y * nitroLength * 0.5,
        -fwd.x * nitroLength, -fwd.y * nitroLength
      );
      nitroGradient.addColorStop(0, "rgba(150, 230, 255, 0.9)");
      nitroGradient.addColorStop(0.3, "rgba(100, 200, 255, 0.8)");
      nitroGradient.addColorStop(0.6, "rgba(80, 180, 255, 0.6)");
      nitroGradient.addColorStop(1, "rgba(60, 150, 255, 0.2)");
      
      ctx.fillStyle = nitroGradient;
      ctx.beginPath();
      ctx.ellipse(
        -fwd.x * nitroLength * 0.5, -fwd.y * nitroLength * 0.5,
        nitroWidth * 0.5, nitroLength * 0.5,
        Math.atan2(fwd.y, fwd.x), 0, Math.PI * 2
      );
      ctx.fill();
      
      // Inner bright core
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = "rgba(180, 240, 255, 1.0)";
      ctx.beginPath();
      ctx.ellipse(
        -fwd.x * nitroLength * 0.3, -fwd.y * nitroLength * 0.3,
        nitroWidth * 0.25, nitroLength * 0.25,
        Math.atan2(fwd.y, fwd.x), 0, Math.PI * 2
      );
      ctx.fill();
      
      ctx.restore();
    }

    // Glow
    ctx.fillStyle = glow;
    pathRoundRect(ctx, -w * 0.55, -h * 0.65, w * 1.1, h * 1.3, 14);
    ctx.fill();

    // Body
    const g = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.5, h * 0.5);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(255,255,255,0.12)");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    pathRoundRect(ctx, -w * 0.5, -h * 0.5, w, h, 10);
    ctx.fill();
    ctx.stroke();

    // Front marker
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    pathRoundRect(ctx, w * 0.12, -h * 0.18, w * 0.22, h * 0.36, 6);
    ctx.fill();

    // Wheels
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    pathRoundRect(ctx, -w * 0.44, -h * 0.62, w * 0.24, h * 0.22, 6);
    ctx.fill();
    pathRoundRect(ctx, -w * 0.44, h * 0.40, w * 0.24, h * 0.22, 6);
    ctx.fill();
    pathRoundRect(ctx, w * 0.2, -h * 0.62, w * 0.24, h * 0.22, 6);
    ctx.fill();
    pathRoundRect(ctx, w * 0.2, h * 0.40, w * 0.24, h * 0.22, 6);
    ctx.fill();

    ctx.restore();
  }

  private drawGoalBurst(ctx: CanvasRenderingContext2D): void {
    for (const p of this.goalBurst) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      const a = 1 - t;
      ctx.fillStyle = "hsla(" + p.hue.toFixed(0) + ", 95%, 60%, " + (a * 0.85).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 + 8 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Removed: sparks + screen FX (background art already includes the vibe)

  private loop(ts: number): void {
    if (!this.lastTs) {
      this.lastTs = ts;
      this.debugLog("info", "Game loop started");
    }
    const dt = clamp((ts - this.lastTs) / 1000, 0, 1 / 30);
    this.lastTs = ts;

    try {
      this.update(dt);
      this.render();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.debugLog("error", `Loop error: ${errorMsg}`);
      console.warn("[GoalDuelGame.loop] error", e);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  // Debug logging methods
  private debugLog(level: string, message: string): void {
    const time = performance.now();
    this.debugLogs.push({ time, level, message });
    
    // Keep only last N logs
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs.shift();
    }
    
    // Also log to console
    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleMethod(`[GoalDuelGame.${level.toUpperCase()}]`, message);
    
    // Update UI
    this.updateDebugPanel();
  }

  private updateDebugPanel(): void {
    if (!this.elDebugContent) return;
    
    // Clear and rebuild
    this.elDebugContent.innerHTML = "";
    
    // Show last 50 logs (most recent at bottom)
    const logsToShow = this.debugLogs.slice(-50);
    
    for (const log of logsToShow) {
      const div = document.createElement("div");
      div.className = `debugLog ${log.level}`;
      
      const timestamp = new Date(log.time).toLocaleTimeString("en-US", { 
        hour12: false, 
        hour: "2-digit", 
        minute: "2-digit", 
        second: "2-digit",
        fractionalSecondDigits: 3
      });
      
      div.innerHTML = `<span class="debugLogTimestamp">${timestamp}</span>${log.message}`;
      this.elDebugContent.appendChild(div);
    }
    
    // Auto-scroll to bottom
    this.elDebugContent.scrollTop = this.elDebugContent.scrollHeight;
  }

  private clearDebugLogs(): void {
    this.debugLogs = [];
    if (this.elDebugContent) {
      this.elDebugContent.innerHTML = "";
    }
  }
}

new GoalDuelGame();

