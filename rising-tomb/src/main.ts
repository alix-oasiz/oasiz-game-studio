/**
 * DASH BRO
 * Fast-paced dash-based maze game with 3D rotating cube player
 *
 * Features:
 * - Tile-based endless maze system
 * - Instant dash movement
 * - 3D rotating cube player with wiggly animation
 * - 3D trail with cubes
 * - Dynamic color-shifting
 * - Water rising hazard
 * - Score system
 */

import { oasiz } from "@oasiz/sdk";

import bgImageUrl from "../assets/Bg.webp";
import bg2ImageUrl from "../assets/Bg2.webp";
import bg3ImageUrl from "../assets/Bg3.webp";
import bgMusicUrl from "../assets/Desert Glass Reverie.mp3";
// SFX
import dashMoveSfxUrl from "../assets/sfx/dash_pop.mp3";
import boostedDashSfxUrl from "../assets/sfx/boosted_dash.mp3";
import deathSandSfxUrl from "../assets/sfx/death_sand.mp3";
import deathSpikeSfxUrl from "../assets/sfx/death_spike.mp3";
import deathExplosionSfxUrl from "../assets/sfx/death_explosion.mp3";
import deathCaughtSfxUrl from "../assets/sfx/death_caught.mp3";

// Player sprites (single-frame idle and dash)
import playerIdleSpriteUrl from "../assets/player_idle/idle.webp";
import playerDashSpriteUrl from "../assets/player_dashing/dash.webp";

// Items
import coinSprite from "../assets/items/coin.webp";
import bounceSprite from "../assets/items/bounce.webp";

// Props

// Platforms
import platformTile from "../assets/platforms/2.webp";
import platformCorner from "../assets/platforms/1.webp";
import spikeSprite from "../assets/platforms/spike.webp";
import tileSprite from "../assets/platforms/tile.webp";
import wall8Sprite from "../assets/platforms/wall8.webp";
import wall5Sprite from "../assets/platforms/wall5.webp";
import wall2Sprite from "../assets/platforms/wall2.webp";
import wall12Sprite from "../assets/platforms/wall12.webp";

// UI Elements
import pauseButtonSprite from "../assets/ui/pause.webp";
import settingsButtonSprite from "../assets/ui/settings.webp";
import scoreBadgeSprite from "../assets/ui/score_bagde.webp";
import pausedPanelSprite from "../assets/ui/paused.webp";
import resumeButtonSprite from "../assets/ui/resume.webp";
import menuButtonSprite from "../assets/ui/menu.webp";
import restartButtonSprite from "../assets/ui/restart.webp";
import settingsPanelSprite from "../assets/ui/settings_panel.webp";
import onToggleSprite from "../assets/ui/On.webp";
import offToggleSprite from "../assets/ui/off.webp";
import menuBgSprite from "../assets/ui/bg.webp";
import titleSprite from "../assets/ui/title.webp";
import startButtonSprite from "../assets/ui/start.webp";
import optionsButtonSprite from "../assets/ui/options.webp";
import musicLabelSprite from "../assets/ui/music.webp";
import sfxLabelSprite from "../assets/ui/sfx.webp";
import hapticsLabelSprite from "../assets/ui/haptics.webp";
import gameOverPanelSprite from "../assets/ui/game_over.webp";

// Effect sprites
import warpSpriteUrl from "../../assets/skill-effects/Super Pixel Effects Pack 3/spritesheet/fx3_warp_large_violet/spritesheet.png";
import lightningAuraSpriteUrl from "../../assets/skill-effects/Super Pixel Effects Pack 3/spritesheet/fx3_lightning_aura_large_yellow/spritesheet.png";
import lightningBurstSpriteUrl from "../../assets/skill-effects/Super Pixel Effects Gigapack/spritesheet/Lightning/lightning_burst_001/lightning_burst_001_large_yellow/spritesheet.png";

type GameState =
  | "START"
  | "PLAYING"
  | "PAUSED"
  | "DYING"
  | "GAME_OVER"
  | "CAUGHT";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

type Direction = "up" | "down" | "left" | "right";

type TileType =
  | "wall"
  | "empty"
  | "dot"
  | "power"
  | "trap"
  | "corner_trap"
  | "speed_boost"
  | "portal"
  | "visited";

interface TrailPoint {
  x: number;
  y: number;
  z: number; // 3D depth position
  alpha: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "dash" | "landing";
}

interface ActiveSpriteEffect {
  x: number;
  y: number;
  sprite: HTMLImageElement;
  totalFrames: number;
  currentFrame: number;
  timePerFrame: number;
  elapsedTime: number;
  scale: number;
}

interface DashFlash {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  duration: number;
  elapsed: number;
  hitWall: boolean;
  clothStartX: number; // Where the cloth was thrown from (player's back)
  clothStartY: number;
}

interface DashEnd {
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  hitWall: boolean;
  steps: number;
}

interface PerfBucket {
  totalMs: number;
  maxMs: number;
  count: number;
}

interface CanvasOpCounts {
  drawImage: number;
  fillRect: number;
  fill: number;
  stroke: number;
  arc: number;
  gradients: number;
}

interface PerfCounterEntry {
  name: string;
  value: number;
}

interface SideWallSpawn {
  col: number;
  sprite: "wall8" | "tile";
  border: "left" | "right" | null;
}

interface ChunkTemplate {
  rows: TileType[][];
  sideWallSpawns: SideWallSpawn[];
  entryX: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function waterWaveY(baseY: number, worldX: number, timeS: number): number {
  const w1 = Math.sin(timeS * 1.35 + worldX * 0.02) * 7.5;
  const w2 = Math.sin(timeS * 0.85 + worldX * 0.011) * 4.0;
  const w3 = Math.sin(timeS * 2.1 + worldX * 0.006) * 2.0;
  return baseY + w1 + w2 + w3;
}

function sandDuneY(baseY: number, worldX: number, timeS: number): number {
  // Leftward scroll offset — shifts the wave pattern left over time (~120 world-px/s)
  const wx = worldX + timeS * 120;
  const dune1 = Math.sin(timeS * 0.3 + wx * 0.008) * 25.0; // Large primary dunes
  const dune2 = Math.sin(timeS * 0.5 + wx * 0.015) * 12.0; // Medium secondary dunes
  const dune3 = Math.sin(timeS * 0.8 + wx * 0.025) * 6.0; // Small surface ripples
  const dune4 = Math.sin(timeS * 0.15 + wx * 0.004) * 35.0; // Very large slow dunes
  return baseY + dune1 + dune2 + dune3 + dune4;
}

// Color-shifting functions for Egyptian pharaoh theme
function getColorShift(
  time: number,
  offset: number = 0,
): { r: number; g: number; b: number } {
  // Egyptian color palette: golds, sandy oranges, deep blues, warm ambers
  const hue = (time * 0.2 + offset) % (Math.PI * 2);
  // Gold/amber tones (warm yellows and oranges)
  const r = Math.floor(220 + Math.sin(hue) * 35 + Math.cos(hue * 1.2) * 20);
  const g = Math.floor(
    180 + Math.sin(hue + Math.PI * 0.5) * 50 + Math.cos(hue * 0.9) * 30,
  );
  const b = Math.floor(
    100 + Math.sin(hue + Math.PI) * 40 + Math.cos(hue * 1.1) * 25,
  );
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function getColorString(
  r: number,
  g: number,
  b: number,
  alpha: number = 1.0,
): string {
  return `rgba(${r},${g},${b},${alpha})`;
}

const CONFIG = {
  TILE_SIZE: 30,
  TILE_SPACING: 0, // Spacing between tiles (in pixels). Keep at 0 for game logic.
  TILE_OVERLAP: 5, // Visual overlap (in pixels). Tiles render this much larger to create seamless walls.
  MAZE_COLS: 19,
  MAZE_ROWS: 21,
  MIN_WIDTH_COLS: 7, // Minimum playable width (narrow sections)
  MAX_WIDTH_COLS: 17, // Maximum playable width (wide sections)
  ZOOM: 1.5,
  WATER_RISE_PX_PER_S: 4.2, // Slow rising sand dunes
  WATER_RISE_BASE_MULTIPLIER: 50,
  WATER_RISE_CATCHUP_CHUNK_GAP: 2,
  WATER_RISE_CATCHUP_MULTIPLIER: 3,
  PLAYER_BODY: 30,
  PLAYER_SPEED: 20,
  TRAIL_DURATION: 0.4, // Shorter-lived trail
  TRAIL_COUNT: 12, // Fewer points for a shorter trail
  TRAIL_INTERVAL: 1 / 60,
  DASH_FLASH_DURATION: 0.36,
  DASH_SPEED_PX_PER_S: 600,
  CAMERA_FOLLOW_DELAY_S: 0.05,
  WALL_HIT_SHAKE: 1.5, // Reduced shake intensity
  WALL_HIT_BOUNCE_DURATION: 0.15,
  BG_TOP: "#1a1626", // Deep purple-blue sky
  BG_BOTTOM: "#2d1a0a", // Dark sandy brown
  WALL_FILL: "#1a1408", // Dark stone/sandstone
  WALL_OUTLINE: "rgba(255, 200, 100, 0.70)", // Golden outline
  DOT_COLOR: "rgba(255, 220, 120, 0.95)", // Gold coins
  WATER_COLOR: "rgba(194, 178, 128, 1.0)", // Sandy beige
  WATER_GLOW: "rgba(194, 178, 128, 0.55)",
  WATER_SURFACE_PADDING_PX: 2,
  WATER_COLLISION_RADIUS_MUL: 0.38,
  WATER_COLLISION_PADDING_PX: 0,
  GRID_COLOR: "rgba(255, 200, 100, 0.12)", // Golden grid
  // Player bandage palette
  PLAYER_COLOR: "#D8CBB0", // Mid-tone bandage
  PLAYER_GLOW: "rgba(243, 234, 214, 0.60)", // Highlight bandage glow
  TRAIL_COLOR: "#F3EAD6", // Highlight
  TRAIL_GLOW: "#B3A27F", // Shadow
  SMOOTH_RENDER: true,
  BLOOM_ENABLED: true,
  BLOOM_BLUR_PX: 12,
  BLOOM_STRENGTH: 0.22,
  MAX_ACTIVE_CHUNKS: 4,
  CHUNK_PRELOAD_AHEAD: 3,
  ENABLE_CHASER: false,
  CHASER_SPAWN_DISTANCE_TILES: 10,
  CHASER_SPAWN_DELAY_S: 2.0,
};

class AudioFx {
  private fxEnabled = true;
  private audioContext: AudioContext | null = null;
  private musicEnabled = true;
  private bgm: HTMLAudioElement | null = null;
  private dashMoveSound: HTMLAudioElement | null = null;
  private boostedDashSound: HTMLAudioElement | null = null;
  private deathSandSound: HTMLAudioElement | null = null;
  private deathSpikeSound: HTMLAudioElement | null = null;
  private deathExplosionSound: HTMLAudioElement | null = null;
  private deathCaughtSound: HTMLAudioElement | null = null;

  // Piano note sequencer -- real song melodies, teleport switches randomly
  private noteIndex = 0;
  private currentSeqIdx = Math.floor(Math.random() * AudioFx.SEQUENCES.length);
  private static readonly SEQUENCES: number[][] = [
    // 0: Baby (Bieber) - "Oh woah" intro
    // Eb F G F Eb D C, Eb F G F Eb F C
    [311.1, 349.2, 392.0, 349.2, 311.1, 293.7, 261.6, 311.1, 349.2, 392.0, 349.2, 311.1, 349.2, 261.6],
    // 1: Baby (Bieber) - chorus "Baby baby baby oh"
    // G F G F G F Bb, G G F G F G F C5
    [392.0, 349.2, 392.0, 349.2, 392.0, 349.2, 466.2, 392.0, 392.0, 349.2, 392.0, 349.2, 392.0, 349.2, 523.3],
    // 2: Baby (Bieber) - verse "You know you love me"
    // Eb Bb G F G, Eb Bb G F
    [311.1, 466.2, 392.0, 349.2, 392.0, 311.1, 466.2, 392.0, 349.2],
    // 3: Shake It Off (Swift) - verse "I stay out too late"
    // D5 B A G B, D5 D5 B A G B
    [587.3, 493.9, 440.0, 392.0, 493.9, 587.3, 587.3, 493.9, 440.0, 392.0, 493.9],
    // 4: Shake It Off (Swift) - pre-chorus "But I keep cruising"
    // B A G A E, A B A G A E
    [493.9, 440.0, 392.0, 440.0, 329.6, 440.0, 493.9, 440.0, 392.0, 440.0, 329.6],
    // 5: Shake It Off (Swift) - chorus "Players gonna play"
    // E5 G5 A5 A5 A5 B5 G5 E5 D5 B A G
    [659.3, 784.0, 880.0, 880.0, 880.0, 987.8, 784.0, 659.3, 587.3, 493.9, 440.0, 392.0],
    // 6: One Dance (Drake) - main melody hook
    // Bb Db Eb F Eb Db Bb, Ab Bb Db Eb Db Bb
    [466.2, 554.4, 622.3, 698.5, 622.3, 554.4, 466.2, 415.3, 466.2, 554.4, 622.3, 554.4, 466.2],
    // 7: One Dance (Drake) - vocal hook descending
    // F Eb Db Bb, Db Eb F Eb Db Bb
    [349.2, 311.1, 277.2, 233.1, 277.2, 311.1, 349.2, 311.1, 277.2, 233.1],
    // 8: Moves Like Jagger (Maroon 5) - opening hook
    // B C# D E F# E D C# B, F# E D C# B
    [493.9, 554.4, 587.3, 659.3, 740.0, 659.3, 587.3, 554.4, 493.9, 740.0, 659.3, 587.3, 554.4, 493.9],
    // 9: Moves Like Jagger (Maroon 5) - verse "take me away"
    // D5 E5 F#5 E5 D5 D5 B4, B4 F#5 E5 D5 D5 B4
    [587.3, 659.3, 740.0, 659.3, 587.3, 587.3, 493.9, 493.9, 740.0, 659.3, 587.3, 587.3, 493.9],
    // 10: Shape of You (Ed Sheeran) - chorus "I'm in love with the shape of you"
    // E F G F E E F F, E F G F E F C
    [329.6, 349.2, 392.0, 349.2, 329.6, 329.6, 349.2, 349.2, 329.6, 349.2, 392.0, 349.2, 329.6, 349.2, 261.6],
    // 11: Shape of You (Ed Sheeran) - "Oh I oh I oh I oh I"
    // C C E E F F G G, E F G F E F C
    [261.6, 261.6, 329.6, 329.6, 349.2, 349.2, 392.0, 392.0, 329.6, 349.2, 392.0, 349.2, 329.6, 349.2, 261.6],
    // 12: Blinding Lights (The Weeknd) - chorus "I'm blinded by the lights"
    // Bb F F F G F Eb Eb C5 Eb C5
    [466.2, 349.2, 349.2, 349.2, 392.0, 349.2, 311.1, 311.1, 523.3, 311.1, 523.3],
    // 13: Blinding Lights (The Weeknd) - pre-chorus "Sin City's cold and empty"
    // C5 Eb F G C5 Eb F, C5 Eb F G F Bb
    [523.3, 311.1, 349.2, 392.0, 523.3, 311.1, 349.2, 523.3, 311.1, 349.2, 392.0, 349.2, 466.2],
    // 14: Levitating (Dua Lipa) - chorus "I got you moonlight"
    // D D F# E E E E E E, D D F# E E E E E D B
    [293.7, 293.7, 370.0, 329.6, 329.6, 329.6, 329.6, 329.6, 329.6, 293.7, 293.7, 370.0, 329.6, 329.6, 329.6, 329.6, 329.6, 293.7, 493.9],
    // 15: Levitating (Dua Lipa) - pre-chorus "You want me I want you baby"
    // F# E D F# E D B A, F# E D B A
    [370.0, 329.6, 293.7, 370.0, 329.6, 293.7, 493.9, 440.0, 370.0, 329.6, 293.7, 493.9, 440.0],
  ];

  constructor() {
    try {
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    } catch (e) {
      console.log("[AudioFx] WebAudio not available");
    }

    this.dashMoveSound = new Audio(dashMoveSfxUrl);
    this.dashMoveSound.preload = "auto";
    this.dashMoveSound.volume = 0.85;

    this.boostedDashSound = new Audio(boostedDashSfxUrl);
    this.boostedDashSound.preload = "auto";
    this.boostedDashSound.volume = 0.85;

    this.deathSandSound = new Audio(deathSandSfxUrl);
    this.deathSandSound.preload = "auto";
    this.deathSandSound.volume = 0.85;

    this.deathSpikeSound = new Audio(deathSpikeSfxUrl);
    this.deathSpikeSound.preload = "auto";
    this.deathSpikeSound.volume = 0.85;

    this.deathExplosionSound = new Audio(deathExplosionSfxUrl);
    this.deathExplosionSound.preload = "auto";
    this.deathExplosionSound.volume = 0.85;

    this.deathCaughtSound = new Audio(deathCaughtSfxUrl);
    this.deathCaughtSound.preload = "auto";
    this.deathCaughtSound.volume = 0.85;
  }

  setFxEnabled(enabled: boolean): void {
    this.fxEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled && this.bgm) {
      this.bgm.pause();
    } else if (enabled && this.bgm && this.bgm.paused) {
      this.bgm.play().catch(() => {});
    }
  }

  startMusic(): void {
    if (!this.musicEnabled) return;
    if (!this.bgm) {
      this.bgm = new Audio(bgMusicUrl);
      this.bgm.loop = true;
      this.bgm.preload = "auto";
      this.bgm.volume = 0.1;
    }
    const p = this.bgm.play();
    if (p) {
      p.catch(() => {
        console.log(
          "[AudioFx] Music autoplay blocked, will play on user interaction",
        );
      });
    }
  }

  stopMusic(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  resetNoteSequence(): void {
    this.noteIndex = 0;
    this.currentSeqIdx = Math.floor(Math.random() * AudioFx.SEQUENCES.length);
  }

  private get currentScale(): number[] {
    return AudioFx.SEQUENCES[this.currentSeqIdx];
  }

  private playPianoNote(freq: number, duration: number, volume: number): void {
    if (!this.fxEnabled || !this.audioContext) return;
    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.value = freq;
      osc2.type = "sine";
      osc2.frequency.value = freq * 2.01;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch (_) {}
  }

  playNextNote(): void {
    const seq = this.currentScale;
    const freq = seq[this.noteIndex % seq.length];
    this.playPianoNote(freq, 0.45, 0.25);
    this.noteIndex++;
  }

  playTeleportChord(): void {
    const seq = this.currentScale;
    const baseFreq = seq[this.noteIndex % seq.length];
    this.playPianoNote(baseFreq, 0.6, 0.22);
    this.playPianoNote(baseFreq * 1.25, 0.6, 0.18);
    this.playPianoNote(baseFreq * 1.5, 0.6, 0.14);

    let next = Math.floor(Math.random() * AudioFx.SEQUENCES.length);
    if (next === this.currentSeqIdx) {
      next = (next + 1) % AudioFx.SEQUENCES.length;
    }
    this.currentSeqIdx = next;
    this.noteIndex = 0;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
  ): void {
    if (!this.fxEnabled || !this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + duration,
      );
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + duration);
    } catch (_) {}
  }

  click(
    type:
      | "dot"
      | "power"
      | "death"
      | "death_water"
      | "death_spike"
      | "death_explosion"
      | "death_caught",
  ): void {
    if (type === "power") {
      this.playTone(600, 0.15, "sine");
    } else if (type === "death") {
      this.playTone(200, 0.3, "sawtooth");
    } else if (type === "death_water") {
      this.playSfx(this.deathSandSound);
    } else if (type === "death_spike") {
      this.playSfx(this.deathSpikeSound);
    } else if (type === "death_explosion") {
      this.playSfx(this.deathExplosionSound);
    } else if (type === "death_caught") {
      this.playSfx(this.deathCaughtSound);
    }
  }

  private playSfx(sound: HTMLAudioElement | null): void {
    if (!this.fxEnabled || !sound) return;
    try {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch (_) {}
  }

  private playPopSound(): void {
    if (!this.fxEnabled || !this.audioContext) return;
    try {
      const t = this.audioContext.currentTime;
      
      // Main pop oscillator
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      // A true bubble pop goes UP in frequency very quickly
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
      
      // Quick volume envelope
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1.0, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.start(t);
      osc.stop(t + 0.06);
    } catch (_) {}
  }

  private playTeleportPopSound(): void {
    if (!this.fxEnabled || !this.audioContext) return;
    try {
      const t = this.audioContext.currentTime;
      
      // Teleport sound: a double-pop (warp in, warp out)
      
      // First pop (warp in) - deeper and slightly longer
      const osc1 = this.audioContext.createOscillator();
      const gain1 = this.audioContext.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(800, t);
      osc1.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      
      gain1.gain.setValueAtTime(0, t);
      gain1.gain.linearRampToValueAtTime(0.8, t + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      
      osc1.connect(gain1);
      gain1.connect(this.audioContext.destination);
      osc1.start(t);
      osc1.stop(t + 0.1);

      // Second pop (warp out) - higher and quicker
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(150, t + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.16);
      
      gain2.gain.setValueAtTime(0, t + 0.1);
      gain2.gain.linearRampToValueAtTime(0.8, t + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.start(t + 0.1);
      osc2.stop(t + 0.18);
      
    } catch (_) {}
  }

  playCoinSound(): void {}
  playSwooshSound(): void { this.playPopSound(); }
  playBoostedDash(): void { this.playPopSound(); }
  playTeleportGate(): void { this.playTeleportPopSound(); }
}

/**
 * Mostly-up path generator with side-runs (3–5 steps) for more variation.
 *
 * - 1 = wall, 0 = empty
 * - Outer border is walls
 * - Path reaches y = H-2
 * - Output: List<String> of '0'/'1' lines (top row first)
 */
class MonotonicUpPath {
  public static generate(
    width: number,
    height: number,
    seed: number,
    entryX: number,
    ps: number,
    pe: number,
    prevRow: TileType[] | null = null,
  ): TileType[][] {
    // RNG setup
    let localSeed = seed;
    const random = () => {
      localSeed = (localSeed * 9301 + 49297) % 233280;
      return localSeed / 233280;
    };
    const nextDouble = () => random();
    const nextBoolean = () => random() < 0.5;
    const nextInt = (n: number) => Math.floor(random() * n);
    const randInt = (a: number, b: number) => {
      // inclusive
      if (b < a) return a;
      return a + nextInt(b - a + 1);
    };

    if (width < 6 || height < 6) {
      const fb: ("wall" | "dot" | "power" | "empty" | "trap")[][] = [];
      for (let y = 0; y < height; y++) {
        fb[y] = new Array(width).fill("empty");
      }
      return fb;
    }

    // 1. Identify the path
    const isPath: (boolean | "trap" | "speed_boost" | "portal")[][] = [];
    for (let y = 0; y < height; y++) {
      isPath[y] = new Array(width).fill(false);
    }

    // Start at bottom (y=0) at entryX
    let x = entryX;
    // Clamp entryX to be inside borders
    if (x < ps + 1) x = ps + 1;
    if (x > pe - 2) x = pe - 2;

    let y = 0;
    isPath[y][x] = true;

    // Tuning knobs
    const pSideRun = 0.6; // how often we do a committed side run before going up again
    const pWiggle = 0.2; // small 1–2 sideways wiggle (adds variety without big detours)
    const maxUpCorridor = 6; // Never allow more than 6 consecutive upward tiles in same column.

    const minUp = 1,
      maxUp = 3; // small up bursts
    const sideRunMin = 3,
      sideRunMax = 5; // your requested 3–5 steps
    const wiggleMin = 1,
      wiggleMax = 2;

    // Optional: keep track of last side direction to reduce ping-pong
    let lastSideDir = 0;
    let consecutiveUp = 1;

    // Helper to pick side dir
    const pickSideDir = (rx: number, rWidth: number, rLastSideDir: number) => {
      const nearLeft = rx <= ps + 2;
      const nearRight = rx >= pe - 3;

      if (nearLeft) return 1;
      if (nearRight) return -1;

      // If we previously went right, slightly prefer right again (less zig-zag),
      // but still allow switching.
      if (rLastSideDir !== 0 && nextDouble() < 0.65) return rLastSideDir;

      return nextBoolean() ? 1 : -1;
    };

    // Helper to carve side (updates isPath)
    const carveSide = (
      rx: number,
      ry: number,
      rDir: number,
      rSteps: number,
      makeTrap: boolean,
    ) => {
      let moved = 0;
      let cx = rx;
      for (let i = 0; i < rSteps; i++) {
        const nx = cx + rDir;
        if (nx <= ps || nx >= pe - 1) break;
        cx = nx;
        isPath[ry][cx] = makeTrap ? "trap" : true;
        moved++;
      }
      return moved;
    };

    const forceHorizontalBreak = (
      rx: number,
      ry: number,
    ): { x: number; moved: boolean; dir: number } => {
      const preferredDir = pickSideDir(rx, width, lastSideDir);
      const dirOptions = [preferredDir, -preferredDir];
      for (const dir of dirOptions) {
        const moved = carveSide(rx, ry, dir, 1, false);
        if (moved > 0) {
          return { x: rx + dir * moved, moved: true, dir };
        }
      }
      return { x: rx, moved: false, dir: 0 };
    };

    while (y < height - 2) {
      let movedHorizontally = 0;

      // 1) Maybe do a SIDE RUN (3–5 steps), then we will go up
      // Don't do side runs on the very first row (y=0) to ensure connection with previous chunk
      if (y > 0 && nextDouble() < pSideRun) {
        const dir = pickSideDir(x, width, lastSideDir);
        const steps = randInt(sideRunMin, sideRunMax);

        // 20% chance for trap on side runs
        const makeTrap = nextDouble() < 0.2;
        const moved = carveSide(x, y, dir, steps, makeTrap);
        x += dir * moved;
        movedHorizontally += moved;
        if (moved > 0) lastSideDir = dir;
      }
      // 2) Else maybe do a small wiggle (1–2 steps)
      else if (y > 0 && nextDouble() < pWiggle) {
        const dir = nextBoolean() ? 1 : -1;
        const steps = randInt(wiggleMin, wiggleMax);

        const makeTrap = nextDouble() < 0.2;
        const moved = carveSide(x, y, dir, steps, makeTrap);
        x += dir * moved;
        movedHorizontally += moved;
        if (moved > 0) lastSideDir = dir;
      }

      if (movedHorizontally > 0) {
        consecutiveUp = 1;
      }

      // Force a horizontal break before continuing upward when limit is hit.
      if (consecutiveUp >= maxUpCorridor) {
        const forced = forceHorizontalBreak(x, y);
        x = forced.x;
        if (forced.moved) {
          consecutiveUp = 1;
          lastSideDir = forced.dir;
        }
      }

      // 3) Move UP (always; keeps monotonic y increase)
      const upAllowance = Math.max(1, maxUpCorridor - consecutiveUp);
      const upSteps = randInt(
        Math.min(minUp, upAllowance),
        Math.min(maxUp, upAllowance),
      );
      let buffSpawnedInThisRun = false; // Max 1 buff per vertical run

      for (let i = 0; i < upSteps && y < height - 1; i++) {
        y++;
        if (y < height) {
          isPath[y][x] = true;
          consecutiveUp++;

          // Reduced chance (1.5%) and check flag
          if (!buffSpawnedInThisRun && nextDouble() < 0.015) {
            // Just mark as path; powerups placed in post-processing at corridor ends
            buffSpawnedInThisRun = true;
          }
        }
      }
    }

    // Ensure top exit cell exists and connects to next chunk
    while (y < height - 1) {
      if (consecutiveUp >= maxUpCorridor) {
        const forced = forceHorizontalBreak(x, y);
        x = forced.x;
        if (forced.moved) {
          consecutiveUp = 1;
          lastSideDir = forced.dir;
        }
      }
      y++;
      isPath[y][x] = true;
      consecutiveUp++;
    }

    // Also ensure the very last cell is open (exit)
    isPath[height - 1][x] = true;

    // 2. Build the grid: Path=0, Neighbors=1, Rest=0
    const g: TileType[][] = [];
    // Include diagonals to ensure corners are filled
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0], // Cardinal
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1], // Diagonal
    ];

    for (let r = 0; r < height; r++) {
      g[r] = new Array(width).fill("empty"); // Default to empty (void)
      for (let c = 0; c < width; c++) {
        if (isPath[r][c]) {
          const p = isPath[r][c];
          if (p === "trap") g[r][c] = "trap";
          else g[r][c] = "dot";
        } else {
          // Check if any neighbor is part of the path
          let isWall = false;
          for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
              if (isPath[nr][nc]) {
                isWall = true;
                break;
              }
            } else if (nr === -1 && prevRow) {
              // Check previous chunk row (bottom neighbor)
              const t = prevRow[nc];
              if (t !== "wall" && t !== "empty") {
                isWall = true;
                break;
              }
            }
          }
          if (isWall) {
            g[r][c] = "wall";
          }
        }
      }
    }

    // 3. Post-process: Add corner traps (5% chance)
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        // Skip walls and empty
        if (g[r][c] === "wall" || g[r][c] === "empty") continue;

        // Check neighbors for corners
        const isWallBelow =
          r - 1 < 0
            ? prevRow
              ? prevRow[c] === "wall"
              : true
            : g[r - 1][c] === "wall";
        const isWallAbove = r + 1 >= height ? false : g[r + 1][c] === "wall";
        const isWallLeft = c - 1 < 0 ? true : g[r][c - 1] === "wall";
        const isWallRight = c + 1 >= width ? true : g[r][c + 1] === "wall";

        if (
          (isWallBelow && isWallLeft) ||
          (isWallBelow && isWallRight) ||
          (isWallAbove && isWallLeft) ||
          (isWallAbove && isWallRight)
        ) {
          if (nextDouble() < 0.05) {
            g[r][c] = "corner_trap";
          }
        }
      }
    }

    // 4. Post-process: Place powerups at true corners (L-shaped turns where a dash ends)
    // A corner has 2+ blocked cardinal sides that are ADJACENT (not opposite).
    // Straight corridors (walls on opposite sides) are excluded.
    const corridorEnds: { x: number; y: number }[] = [];
    for (let r = 1; r < height - 1; r++) {
      for (let c = 0; c < width; c++) {
        if (g[r][c] !== "dot") continue;
        const bL =
          c - 1 < 0 || g[r][c - 1] === "wall" || g[r][c - 1] === "empty";
        const bR =
          c + 1 >= width || g[r][c + 1] === "wall" || g[r][c + 1] === "empty";
        const bU = g[r - 1][c] === "wall" || g[r - 1][c] === "empty";
        const bD = g[r + 1][c] === "wall" || g[r + 1][c] === "empty";
        const wallCount = +bL + +bR + +bU + +bD;
        if (wallCount >= 3) {
          corridorEnds.push({ x: c, y: r });
        } else if (wallCount === 2) {
          // Only count L-shaped corners, not straight corridors
          const isStraight = (bL && bR) || (bU && bD);
          if (!isStraight) corridorEnds.push({ x: c, y: r });
        }
      }
    }

    // Place lightning (speed_boost) at a corridor endpoint (~25% chance per chunk)
    let lightningIdx = -1;
    if (corridorEnds.length > 0 && nextDouble() < 0.25) {
      lightningIdx = Math.floor(nextDouble() * corridorEnds.length);
      const le = corridorEnds[lightningIdx];
      g[le.y][le.x] = "speed_boost";
    }

    // Place portal at a different corridor endpoint (~20% chance per chunk)
    const portalEnds = corridorEnds.filter(
      (_, i) => i !== lightningIdx && g[_.y][_.x] === "dot",
    );
    if (portalEnds.length > 0 && nextDouble() < 0.2) {
      const idx = Math.floor(nextDouble() * portalEnds.length);
      const ce = portalEnds[idx];
      g[ce.y][ce.x] = "portal";
    }

    return g;
  }
}

class DashBroGame {
  private canvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private renderCanvas: HTMLCanvasElement | null = null;
  private renderCtx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private cachedVignetteGradient: CanvasGradient | null = null;
  private cachedVignetteSize = { w: 0, h: 0 };
  private noisePattern: CanvasPattern | null = null;
  private wallPattern: CanvasPattern | null = null;
  private bgImage: HTMLImageElement | null = null;
  private bgImage2: HTMLImageElement | null = null;
  private bgImage3: HTMLImageElement | null = null;
  private hieroglyphPattern: CanvasPattern | null = null;

  // Sprite assets
  private playerIdleSprite: HTMLImageElement | null = null;
  private playerDashSprite: HTMLImageElement | null = null;
  private coinImage: HTMLImageElement | null = null;
  private bounceImage: HTMLImageElement | null = null;
  private platformTileImage: HTMLImageElement | null = null;
  private platformCornerImage: HTMLImageElement | null = null;
  private spikeImage: HTMLImageElement | null = null;
  private tileImage: HTMLImageElement | null = null;
  private wall8Image: HTMLImageElement | null = null;
  private wall5Image: HTMLImageElement | null = null;
  private wall2Image: HTMLImageElement | null = null;
  private wall12Image: HTMLImageElement | null = null;

  // UI Elements
  private pauseButtonImage: HTMLImageElement | null = null;
  private settingsButtonImage: HTMLImageElement | null = null;
  private scoreBadgeImage: HTMLImageElement | null = null;
  private pausedPanelImage: HTMLImageElement | null = null;
  private resumeButtonImage: HTMLImageElement | null = null;
  private menuButtonImage: HTMLImageElement | null = null;
  private settingsPanelImage: HTMLImageElement | null = null;
  private onToggleImage: HTMLImageElement | null = null;
  private offToggleImage: HTMLImageElement | null = null;
  private menuBgImage: HTMLImageElement | null = null;
  private titleImage: HTMLImageElement | null = null;
  private startButtonImage: HTMLImageElement | null = null;
  private optionsButtonImage: HTMLImageElement | null = null;
  private musicLabelImage: HTMLImageElement | null = null;
  private sfxLabelImage: HTMLImageElement | null = null;
  private hapticsLabelImage: HTMLImageElement | null = null;
  private gameOverPanelImage: HTMLImageElement | null = null;
  private restartButtonImage: HTMLImageElement | null = null;
  private isMobile = window.matchMedia("(pointer: coarse)").matches;
  private lastToggleTime = 0;

  // Props

  // Player animation state
  private playerAnimationState: "idle" | "dashing" | "landing" = "idle";
  private playerAnimationFrame = 0;
  private playerAnimationTimer = 0;
  private playerAnimationSpeed = 0.1; // seconds per frame

  private state: GameState = "START";
  private lastT = performance.now();
  private readonly perfEnabled = false;
  private readonly perfLogToConsole = new URLSearchParams(
    window.location.search,
  ).has("profile");
  private readonly perfWindowMs = 500; // Update 2x per second
  private perfLastFlushAt = performance.now();
  private perfMethodBuckets = new Map<string, PerfBucket>();
  private monitorOverlay: HTMLDivElement | null = null;
  private perfFrameCount = 0;
  private perfFrameTotalMs = 0;
  private perfFrameMaxMs = 0;
  private perfCanvasOps: CanvasOpCounts = {
    drawImage: 0,
    fillRect: 0,
    fill: 0,
    stroke: 0,
    arc: 0,
    gradients: 0,
  };
  private perfCounters = new Map<string, number>();
  private perfWrappedContexts = new WeakSet<CanvasRenderingContext2D>();
  private settings: Settings = { music: true, fx: true, haptics: true };

  // Traps state: "x,y" -> triggerTime (seconds)
  private activeTraps: Map<string, number> = new Map();
  private speedMultiplier = 1.0;
  private speedEffectTimer = 0;
  private pendingTeleport: { x: number; y: number; dir: Direction } | null =
    null;
  private warpSprite: HTMLImageElement | null = null;
  private lightningAuraSprite: HTMLImageElement | null = null;
  private lightningBurstSprite: HTMLImageElement | null = null;
  private activeSpriteEffects: ActiveSpriteEffect[] = [];
  private sandSlowPhaseStartS = performance.now() * 0.001;
  private firstPlayerMoveAtS: number | null = null;
  private frameTimeEmaMs = 16.7;
  private lowPerfMode = false;
  private audio = new AudioFx();

  // Endless maze
  private rows = new Map<number, TileType[]>();
  private spineXByRow = new Map<number, number>();
  private globalSeed = (Math.random() * 1e9) | 0;
  private minRowCached = 0;
  private maxRowCached = 0;
  private chunkCache = new Map<number, number>(); // rowY -> chunkId
  private chunkWidthFactor = new Map<number, number>(); // chunkId -> width factor (0-1)
  private sideWallSpawnsByRow = new Map<number, SideWallSpawn[]>();
  private chunkTemplateByChunkId = new Map<number, ChunkTemplate>();
  private activeChunkIds = new Set<number>();
  private currentPlayerChunkId = 0;
  private currentChaserChunkId: number | null = null;
  private occupiedChaserChunkIds = new Set<number>();
  private chaserChunkReleaseTimers = new Map<number, number>();
  private recycledChunkTemplatesByEntry = new Map<number, ChunkTemplate[]>();
  private recycledChunkTemplateCount = 0;
  private readonly maxRecycledChunkTemplates = 12;
  private nextChunkId = 0;

  // Player
  private playerX = 0;
  private playerY = 0;
  private playerTileX = 0;
  private playerTileY = 0;
  private playerDirection: Direction = "right";
  private nextDirection: Direction | null = null;
  private trail: TrailPoint[] = [];
  private trailTimer = 0;

  // Particles
  private particles: Particle[] = [];
  private isMoving = false;
  private dashFlash: DashFlash | null = null;

  // Death animation
  private deathTimer = 0;
  private deathDuration = 0.6; // 0.6 seconds
  private deathParticles: Particle[] = [];
  private pendingTrapDeath: {
    tileX: number;
    tileY: number;
    progressFraction: number;
    type: "trap" | "corner_trap";
  } | null = null;

  private playerSpawnX = 9; // Column 10 (1-indexed), matches P position in pattern
  private playerSpawnY = 15; // Row 16 (1-indexed), matches player spawn row

  // Water hazard
  private waterSurfaceY = 0;

  // Game state
  private score = 0;
  private lives = 3;
  private level = 1;

  // Camera
  private cameraX = 0;
  private cameraY = 0;
  private cameraFollowHistory: { t: number; x: number; y: number }[] = [];
  private cameraFollowHz = 5.5; // smoothly interpolated, no abrupt jumps

  // Screen shake
  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private shakeDecay = 8.0;

  // Doppelganger (Red version of player)
  private doppelgangerActive = false;
  private doppelgangerX = 0;
  private doppelgangerY = 0;
  private doppelgangerTileX = 0;
  private doppelgangerTileY = 0;
  private doppelgangerDirection: Direction = "right";
  private doppelgangerMoveTimer = 0;
  private doppelgangerMoveSpeed = 1.2; // Dash cadence multiplier (1.0 => 0.4s aralik)
  private doppelgangerTrail: TrailPoint[] = [];
  private doppelgangerSpawnTimer = 0;
  private caughtTimer = 0;
  private caughtDuration = 2.0; // 2 second freeze before death

  // Player animation
  private wallHitBounce = 0; // 0-1, decays over time
  private wallHitDirection: Direction | null = null;

  // Viewport
  private _viewW = window.innerWidth;
  private _viewH = window.innerHeight;

  // Animation Loop
  private rafId = 0;

  // Background Effects
  private bgParticles: {
    x: number;
    y: number;
    speed: number;
    size: number;
    alpha: number;
    wobble: number;
    phase: number;
  }[] = [];
  private bgScrollY = 0;

  // Visual Effects
  private lightRays: {
    x: number;
    width: number;
    speed: number;
    alpha: number;
    phase: number;
  }[] = [];
  private doppelgangerAuraTimer = 0;
  private dashSpeedLines: {
    x: number;
    y: number;
    length: number;
    alpha: number;
    life: number;
    maxLife: number;
  }[] = [];

  // UI
  private startOverlay = document.getElementById("startOverlay") as HTMLElement;
  private gameOverOverlay = document.getElementById(
    "gameOverOverlay",
  ) as HTMLElement;
  private pauseOverlay = document.getElementById("pauseOverlay") as HTMLElement;
  private hudEl = document.getElementById("hud") as HTMLElement;
  private distanceEl: HTMLElement | null = null;
  private pauseBtn = document.getElementById("pauseBtn") as HTMLElement;
  private settingsBtn = document.getElementById("settingsBtn") as HTMLElement;
  private settingsPanel = document.getElementById(
    "settingsPanel",
  ) as HTMLElement;
  private settingsBackdrop = document.getElementById(
    "settingsBackdrop",
  ) as HTMLElement;
  private tutorialOverlay = document.getElementById(
    "tutorialOverlay",
  ) as HTMLElement;
  private teleportBtn = document.getElementById("teleportBtn") as HTMLElement;
  private teleportBtnImg = document.getElementById("teleportBtnImg") as HTMLImageElement;

  private settingsCloseBtn = document.getElementById(
    "settingsCloseBtn",
  ) as HTMLElement;
  private toggleMusic = document.getElementById("toggleMusic") as HTMLElement;
  private toggleFx = document.getElementById("toggleFx") as HTMLElement;
  private toggleHaptics = document.getElementById(
    "toggleHaptics",
  ) as HTMLElement;
  private finalDistanceEl = document.getElementById(
    "finalDistance",
  ) as HTMLElement;
  private bestDistanceEl = document.getElementById(
    "bestDistance",
  ) as HTMLElement;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const dctx = this.canvas.getContext("2d");
    if (!dctx) throw new Error("Canvas 2D context not available");
    this.displayCtx = dctx;
    this.ctx = dctx;
    this.perfWrapContext(this.displayCtx);

    this.loadSettings();
    if (this.isMobile) {
      CONFIG.BLOOM_ENABLED = false;
      CONFIG.SMOOTH_RENDER = false;
    }
    this.applySettingsToUI();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());

    this.setupUI();
    this.setupInput();
    this.resetGame();

    // Load all sprites
    this.loadSprites();

    this.createMonitorOverlay();

    if (this.perfLogToConsole) {
      console.log("[Perf] profiling enabled (?profile=1)");
    }

    if (typeof oasiz.emitScoreConfig === 'function') {
      oasiz.emitScoreConfig({
        anchors: [
          { raw: 100, normalized: 100 },
          { raw: 500, normalized: 300 },
          { raw: 1500, normalized: 600 },
          { raw: 5000, normalized: 950 },
        ],
      });
    }

    oasiz.onPause(() => {
      if (this.state === "PLAYING") this.pauseGame();
      this.stopLoop();
    });

    oasiz.onResume(() => {
      this.startLoop();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    });

    this.startLoop();
  }

  private startLoop(): void {
    if (this.rafId) return;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private viewW(): number {
    return this._viewW;
  }

  private viewH(): number {
    return this._viewH;
  }

  private perfWrapContext(ctx: CanvasRenderingContext2D | null): void {
    if (!this.perfEnabled || !ctx || this.perfWrappedContexts.has(ctx)) return;

    const anyCtx = ctx as any;
    const wrapOp = (methodName: string, counterKey: keyof CanvasOpCounts) => {
      const original = anyCtx[methodName];
      if (typeof original !== "function") return;
      anyCtx[methodName] = (...args: any[]) => {
        this.perfCanvasOps[counterKey]++;
        return original.apply(ctx, args);
      };
    };

    wrapOp("drawImage", "drawImage");
    wrapOp("fillRect", "fillRect");
    wrapOp("fill", "fill");
    wrapOp("stroke", "stroke");
    wrapOp("arc", "arc");

    const originalLinear = anyCtx.createLinearGradient;
    if (typeof originalLinear === "function") {
      anyCtx.createLinearGradient = (...args: any[]) => {
        this.perfCanvasOps.gradients++;
        return originalLinear.apply(ctx, args);
      };
    }

    const originalRadial = anyCtx.createRadialGradient;
    if (typeof originalRadial === "function") {
      anyCtx.createRadialGradient = (...args: any[]) => {
        this.perfCanvasOps.gradients++;
        return originalRadial.apply(ctx, args);
      };
    }

    this.perfWrappedContexts.add(ctx);
  }

  private perfAccumulate(name: string, elapsedMs: number): void {
    if (!this.perfEnabled) return;
    const bucket = this.perfMethodBuckets.get(name) ?? {
      totalMs: 0,
      maxMs: 0,
      count: 0,
    };
    bucket.totalMs += elapsedMs;
    bucket.maxMs = Math.max(bucket.maxMs, elapsedMs);
    bucket.count += 1;
    this.perfMethodBuckets.set(name, bucket);
  }

  private perfMeasure<T>(name: string, fn: () => T): T {
    if (!this.perfEnabled) return fn();
    const startedAt = performance.now();
    try {
      return fn();
    } finally {
      this.perfAccumulate(name, performance.now() - startedAt);
    }
  }

  private perfRecordFrame(frameMs: number): void {
    if (!this.perfEnabled) return;
    this.perfFrameCount += 1;
    this.perfFrameTotalMs += frameMs;
    this.perfFrameMaxMs = Math.max(this.perfFrameMaxMs, frameMs);
  }

  private perfIncrementCounter(name: string, amount: number = 1): void {
    if (!this.perfEnabled) return;
    this.perfCounters.set(name, (this.perfCounters.get(name) ?? 0) + amount);
  }

  private createMonitorOverlay(): void {
    const div = document.createElement("div");
    div.id = "perfOverlay";
    div.style.position = "absolute";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "240px";
    div.style.maxWidth = "50vw";
    div.style.padding = "8px";
    div.style.background = "rgba(0, 0, 0, 0.65)";
    div.style.color = "#0f0";
    div.style.fontFamily = "monospace";
    div.style.fontSize = "10px";
    div.style.pointerEvents = "none";
    div.style.zIndex = "9999";
    div.style.whiteSpace = "pre-wrap";
    div.style.lineHeight = "1.3";
    div.style.textShadow = "1px 1px 0 #000";
    document.body.appendChild(div);
    this.monitorOverlay = div;
  }

  private perfFlushIfNeeded(now: number): void {
    if (!this.perfEnabled) return;
    const elapsedWindowMs = now - this.perfLastFlushAt;
    if (elapsedWindowMs < this.perfWindowMs) return;

    const avgFrameMs =
      this.perfFrameCount > 0 ? this.perfFrameTotalMs / this.perfFrameCount : 0;
    const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
    const ops = this.perfCanvasOps;

    // Collect logic timings
    const getBucket = (name: string) => {
      const b = this.perfMethodBuckets.get(name);
      return b ? (b.totalMs / Math.max(1, b.count ?? 1)).toFixed(2) : "0.00";
    };

    const updateTime = getBucket("loop.update");
    const renderTime = getBucket("loop.render");
    const drawMazeTime = getBucket("render.drawMaze");

    // Memory
    let memStr = "";
    const perfAny = performance as any;
    if (perfAny.memory && typeof perfAny.memory.usedJSHeapSize === "number") {
      const usedMb = (perfAny.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMb = (perfAny.memory.totalJSHeapSize / (1024 * 1024)).toFixed(
        1,
      );
      memStr = `\nMem: ${usedMb}/${totalMb}MB`;
    }

    // Entities
    const particlesCount = this.particles.length;
    const bgParticlesCount = this.bgParticles.length;
    const trapsCount = this.activeTraps.size;
    const lightRaysCount = this.lightRays.length;

    // Build text
    const text = `FPS: ${fps.toFixed(1)} (Min: ${(avgFrameMs > 0 ? 1000 / this.perfFrameMaxMs : 0).toFixed(1)})
Frame: ${avgFrameMs.toFixed(1)}ms (Max: ${this.perfFrameMaxMs.toFixed(1)})
Update: ${updateTime}ms
Render: ${renderTime}ms
  Maze: ${drawMazeTime}ms
Entities:
  Particles: ${particlesCount}
  BG Parts : ${bgParticlesCount}
  Traps    : ${trapsCount}
  Rays     : ${lightRaysCount}
CanvasOps/frame:
  Img: ${(ops.drawImage / this.perfFrameCount).toFixed(0)}
  Rect: ${(ops.fillRect / this.perfFrameCount).toFixed(0)}
  Fill: ${(ops.fill / this.perfFrameCount).toFixed(0)}
  Stroke: ${(ops.stroke / this.perfFrameCount).toFixed(0)}${memStr}`;

    if (this.monitorOverlay) {
      this.monitorOverlay.textContent = text;
      // Coloring based on FPS
      if (fps < 30)
        this.monitorOverlay.style.color = "#f44"; // Red
      else if (fps < 50)
        this.monitorOverlay.style.color = "#fe0"; // Yellow
      else this.monitorOverlay.style.color = "#0f0"; // Green
    }

    if (this.perfLogToConsole) {
      console.log(
        `[Perf] state=${this.state} window=${(elapsedWindowMs / 1000).toFixed(1)}s avgFrame=${avgFrameMs.toFixed(2)}ms fps=${fps.toFixed(1)} maxFrame=${this.perfFrameMaxMs.toFixed(2)} ` +
          `canvasOps(drawImage=${ops.drawImage} fillRect=${ops.fillRect} fill=${ops.fill} stroke=${ops.stroke} arc=${ops.arc} gradients=${ops.gradients})`,
      );

      const topBuckets = Array.from(this.perfMethodBuckets.entries())
        .sort((a, b) => b[1].totalMs - a[1].totalMs)
        .slice(0, 8)
        .map(([name, bucket]) => {
          const avg = bucket.count > 0 ? bucket.totalMs / bucket.count : 0;
          const share =
            elapsedWindowMs > 0 ? (bucket.totalMs / elapsedWindowMs) * 100 : 0;
          return `${name}(total=${bucket.totalMs.toFixed(1)}ms avg=${avg.toFixed(2)}ms max=${bucket.maxMs.toFixed(2)}ms share=${share.toFixed(1)}% count=${bucket.count})`;
        });

      if (topBuckets.length > 0) {
        console.log(`[PerfTop] ${topBuckets.join(" | ")}`);
      }

      if (memStr) console.log(`[PerfMemory] ${memStr.trim()}`);
    }

    // Reset buckets
    this.perfMethodBuckets.clear();
    this.perfCanvasOps = {
      drawImage: 0,
      fillRect: 0,
      fill: 0,
      stroke: 0,
      arc: 0,
      gradients: 0,
    };
    this.perfFrameCount = 0;
    this.perfFrameTotalMs = 0;
    this.perfFrameMaxMs = 0;
    this.perfCounters.clear();
    this.perfLastFlushAt = now;
  }

  private onResize(): void {
    this._viewW = window.innerWidth;
    this._viewH = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 3);

    this.canvas.width = this._viewW * this.dpr;
    this.canvas.height = this._viewH * this.dpr;
    this.canvas.style.width = `${this._viewW}px`;
    this.canvas.style.height = `${this._viewH}px`;

    if (this.displayCtx) {
      if (CONFIG.SMOOTH_RENDER) {
        this.displayCtx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        this.displayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
    }

    if (CONFIG.SMOOTH_RENDER) {
      this.renderCanvas = document.createElement("canvas");
      this.renderCanvas.width = this._viewW;
      this.renderCanvas.height = this._viewH;
      this.renderCtx = this.renderCanvas.getContext("2d");
      if (this.renderCtx) {
        this.ctx = this.renderCtx;
        this.perfWrapContext(this.renderCtx);
      }
    }

    this.perfWrapContext(this.displayCtx);

    this.buildPatterns();
  }

  private loadSprites(): void {
    // Load background
    this.bgImage = new Image();
    this.bgImage.src = bgImageUrl;

    this.bgImage2 = new Image();
    this.bgImage2.src = bg2ImageUrl;

    this.bgImage3 = new Image();
    this.bgImage3.src = bg3ImageUrl;

    // Load player sprites (single-frame)
    this.playerIdleSprite = new Image();
    this.playerIdleSprite.src = playerIdleSpriteUrl;

    this.playerDashSprite = new Image();
    this.playerDashSprite.src = playerDashSpriteUrl;

    this.warpSprite = new Image();
    this.warpSprite.src = warpSpriteUrl;

    this.lightningAuraSprite = new Image();
    this.lightningAuraSprite.src = lightningAuraSpriteUrl;
    this.lightningBurstSprite = new Image();
    this.lightningBurstSprite.src = lightningBurstSpriteUrl;

    // Load items
    this.coinImage = new Image();
    this.coinImage.src = coinSprite;

    this.bounceImage = new Image();
    this.bounceImage.src = bounceSprite;

    if (this.teleportBtnImg) {
      this.teleportBtnImg.src = bounceSprite;
    }

    // Load platforms
    this.platformTileImage = new Image();
    this.platformTileImage.src = platformTile;

    this.platformCornerImage = new Image();
    this.platformCornerImage.src = platformCorner;

    this.spikeImage = new Image();
    this.spikeImage.src = spikeSprite;

    this.tileImage = new Image();
    this.tileImage.src = tileSprite;

    // Load side wall sprites
    this.wall8Image = new Image();
    this.wall8Image.src = wall8Sprite;

    this.wall5Image = new Image();
    this.wall5Image.src = wall5Sprite;

    this.wall2Image = new Image();
    this.wall2Image.src = wall2Sprite;

    this.wall12Image = new Image();
    this.wall12Image.src = wall12Sprite;

    // Load UI elements
    this.pauseButtonImage = new Image();
    this.pauseButtonImage.src = pauseButtonSprite;

    this.settingsButtonImage = new Image();
    this.settingsButtonImage.src = settingsButtonSprite;

    this.scoreBadgeImage = new Image();
    this.scoreBadgeImage.src = scoreBadgeSprite;

    // Set up UI button images once loaded
    this.pauseButtonImage.onload = () => {
      this.updateUIButtons();
    };
    this.settingsButtonImage.onload = () => {
      this.updateUIButtons();
    };
    this.scoreBadgeImage.onload = () => {
      this.updateScoreBadge();
    };

    // Load pause overlay UI elements
    this.pausedPanelImage = new Image();
    this.pausedPanelImage.src = pausedPanelSprite;

    this.resumeButtonImage = new Image();
    this.resumeButtonImage.src = resumeButtonSprite;

    this.menuButtonImage = new Image();
    this.menuButtonImage.src = menuButtonSprite;

    // Load settings panel assets
    this.settingsPanelImage = new Image();
    this.settingsPanelImage.src = settingsPanelSprite;

    this.onToggleImage = new Image();
    this.onToggleImage.src = onToggleSprite;

    this.offToggleImage = new Image();
    this.offToggleImage.src = offToggleSprite;

    // Update settings panel UI once images are loaded
    this.settingsPanelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.onToggleImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.offToggleImage.onload = () => {
      this.updateSettingsPanel();
    };

    // Load menu assets
    this.menuBgImage = new Image();
    this.menuBgImage.src = menuBgSprite;

    this.titleImage = new Image();
    this.titleImage.src = titleSprite;

    this.startButtonImage = new Image();
    this.startButtonImage.src = startButtonSprite;

    this.optionsButtonImage = new Image();
    this.optionsButtonImage.src = optionsButtonSprite;

    // Update menu once images are loaded
    this.menuBgImage.onload = () => {
      this.updateStartMenu();
    };
    this.titleImage.onload = () => {
      this.updateStartMenu();
    };
    this.startButtonImage.onload = () => {
      this.updateStartMenu();
    };
    this.optionsButtonImage.onload = () => {
      this.updateStartMenu();
    };

    // Load settings label images
    this.musicLabelImage = new Image();
    this.musicLabelImage.src = musicLabelSprite;

    this.sfxLabelImage = new Image();
    this.sfxLabelImage.src = sfxLabelSprite;

    this.hapticsLabelImage = new Image();
    this.hapticsLabelImage.src = hapticsLabelSprite;

    // Update settings panel once label images are loaded
    this.musicLabelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.sfxLabelImage.onload = () => {
      this.updateSettingsPanel();
    };
    this.hapticsLabelImage.onload = () => {
      this.updateSettingsPanel();
    };

    this.pausedPanelImage.onload = () => {
      this.updatePauseOverlay();
    };
    this.resumeButtonImage.onload = () => {
      this.updatePauseOverlay();
    };
    this.menuButtonImage.onload = () => {
      this.updatePauseOverlay();
    };

    // Load restart button
    this.restartButtonImage = new Image();
    this.restartButtonImage.src = restartButtonSprite;
    this.restartButtonImage.onload = () => {
      this.updatePauseOverlay();
      this.updateGameOverOverlay();
    };

    // Load game over panel
    this.gameOverPanelImage = new Image();
    this.gameOverPanelImage.src = gameOverPanelSprite;
    this.gameOverPanelImage.onload = () => {
      this.updateGameOverOverlay();
    };
  }

  private updateUIButtons(): void {
    const pauseBtn = document.getElementById("pauseBtn");
    const settingsBtn = document.getElementById("settingsBtn");

    if (pauseBtn && this.pauseButtonImage && this.pauseButtonImage.complete) {
      pauseBtn.innerHTML = "";
      const img = document.createElement("img");
      img.src = this.pauseButtonImage.src;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      pauseBtn.appendChild(img);
    }

    if (
      settingsBtn &&
      this.settingsButtonImage &&
      this.settingsButtonImage.complete
    ) {
      settingsBtn.innerHTML = "";
      const img = document.createElement("img");
      img.src = this.settingsButtonImage.src;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      settingsBtn.appendChild(img);
    }
  }

  private updateScoreBadge(): void {
    const distanceEl = document.getElementById("distance");
    if (distanceEl && this.scoreBadgeImage && this.scoreBadgeImage.complete) {
      const hud = document.getElementById("hud");
      if (hud) {
        hud.innerHTML = "";
        const badgeContainer = document.createElement("div");
        badgeContainer.style.position = "relative";
        badgeContainer.style.display = "inline-block";

        const badgeImg = document.createElement("img");
        badgeImg.src = this.scoreBadgeImage.src;
        badgeImg.style.width = "auto";
        badgeImg.style.height = "60px";
        badgeImg.style.objectFit = "contain";

        const scoreText = document.createElement("div");
        scoreText.id = "distance";
        scoreText.style.position = "absolute";
        scoreText.style.top = "50%";
        scoreText.style.left = "50%";
        scoreText.style.transform = "translate(-50%, -50%)";
        scoreText.style.color = "#FFD54F";
        scoreText.style.fontSize = "22px";
        scoreText.style.fontWeight = "900";
        scoreText.style.fontFamily = "'Cinzel', serif";
        scoreText.style.letterSpacing = "0.05em";
        scoreText.style.setProperty("-webkit-font-smoothing", "none");
        scoreText.style.textShadow =
          "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.6)";
        scoreText.textContent = "0";

        badgeContainer.appendChild(badgeImg);
        badgeContainer.appendChild(scoreText);
        hud.appendChild(badgeContainer);
      }
    }
  }

  private updatePauseOverlay(): void {
    const pauseOverlay = document.getElementById("pauseOverlay");
    if (!pauseOverlay) return;

    // Only update if all images are loaded
    if (!this.pausedPanelImage || !this.pausedPanelImage.complete) return;
    if (!this.resumeButtonImage || !this.resumeButtonImage.complete) return;
    if (!this.menuButtonImage || !this.menuButtonImage.complete) return;

    // Clear existing content
    pauseOverlay.innerHTML = "";

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "pauseBackdrop";
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    backdrop.style.zIndex = "0";
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing on backdrop click
    });
    pauseOverlay.appendChild(backdrop);

    // Create panel container
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";
    panelContainer.style.animation = "panelSlideIn 0.4s ease-out";
    panelContainer.style.zIndex = "10";

    // Add paused panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.pausedPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";

    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.position = "absolute";
    buttonContainer.style.top = "50%";
    buttonContainer.style.left = "50%";
    buttonContainer.style.transform = "translate(-50%, -50%)";
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "column";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.width = "100%";
    buttonContainer.style.paddingTop = "40px"; // Raised menu button up
    buttonContainer.style.zIndex = "20"; // Ensure buttons are above panel image
    buttonContainer.style.pointerEvents = "auto"; // Ensure buttons are clickable

    // Resume button
    const resumeBtn = document.createElement("button");
    resumeBtn.id = "resumeBtn";
    resumeBtn.style.background = "transparent";
    resumeBtn.style.border = "none";
    resumeBtn.style.padding = "0";
    resumeBtn.style.cursor = "pointer";
    resumeBtn.style.display = "block";

    const resumeImg = document.createElement("img");
    resumeImg.src = this.resumeButtonImage.src;
    resumeImg.style.width = "auto";
    resumeImg.style.height = "35px"; // Significantly smaller
    resumeImg.style.objectFit = "contain";
    resumeImg.style.display = "block";
    resumeBtn.appendChild(resumeImg);

    // Re-attach event listener
    this.bindPress(resumeBtn, () => {
      this.triggerHaptic("light");
      this.resume();
    });

    buttonContainer.appendChild(resumeBtn);

    // Menu button
    const menuBtn = document.createElement("button");
    menuBtn.id = "menuBtn";
    menuBtn.style.background = "transparent";
    menuBtn.style.border = "none";
    menuBtn.style.padding = "0";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.display = "block";

    const menuImg = document.createElement("img");
    menuImg.src = this.menuButtonImage.src;
    menuImg.style.width = "auto";
    menuImg.style.height = "30px"; // Even smaller
    menuImg.style.objectFit = "contain";
    menuImg.style.display = "block";
    menuBtn.appendChild(menuImg);

    // Re-attach event listener
    this.bindPress(menuBtn, () => {
      this.triggerHaptic("light");
      this.showMenu();
    });

    buttonContainer.appendChild(menuBtn);

    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(buttonContainer);

    // Create a wrapper div
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);

    pauseOverlay.appendChild(wrapper);
  }

  private updateGameOverOverlay(score: number = 0): void {
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    if (!gameOverOverlay) return;

    // Only update if all images are loaded
    if (!this.gameOverPanelImage || !this.gameOverPanelImage.complete) return;
    if (!this.menuButtonImage || !this.menuButtonImage.complete) return;
    if (!this.restartButtonImage || !this.restartButtonImage.complete) return;

    // Clear existing content
    gameOverOverlay.innerHTML = "";

    // Remove overlay background
    gameOverOverlay.style.background = "transparent";

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "gameOverBackdrop";
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    backdrop.style.zIndex = "0";
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing on backdrop click
    });
    gameOverOverlay.appendChild(backdrop);

    // Create panel container
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";
    panelContainer.style.zIndex = "10";
    panelContainer.style.animation = "panelSlideIn 0.4s ease-out";

    // Add game over panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.gameOverPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";

    // Create content container (positioned absolutely over the panel)
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "absolute";
    contentContainer.style.top = "0";
    contentContainer.style.left = "0";
    contentContainer.style.width = "100%";
    contentContainer.style.height = "100%";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.justifyContent = "flex-end";
    contentContainer.style.alignItems = "center";
    contentContainer.style.zIndex = "15"; // Above panel image
    contentContainer.style.pointerEvents = "none"; // Allow clicks to pass through to buttons

    // Distance counter (center bottom - in the empty spot)
    const distanceContainer = document.createElement("div");
    distanceContainer.id = "finalDistance";
    distanceContainer.style.position = "absolute";
    distanceContainer.style.top = "77%";
    distanceContainer.style.left = "50%";
    distanceContainer.style.transform = "translate(-50%, -50%)";
    distanceContainer.style.color = "#FFD54F";
    distanceContainer.style.fontSize = "36px";
    distanceContainer.style.fontWeight = "900";
    distanceContainer.style.fontFamily = "'Cinzel', serif";
    distanceContainer.style.letterSpacing = "0.05em";
    distanceContainer.style.setProperty("-webkit-font-smoothing", "none");
    distanceContainer.style.textShadow =
      "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 6px rgba(0,0,0,0.7)";
    distanceContainer.style.zIndex = "20";
    distanceContainer.style.pointerEvents = "none"; // Don't block clicks
    distanceContainer.textContent = `${score}`;

    // Button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.position = "absolute";
    buttonContainer.style.bottom = "20px"; // Position at bottom of panel
    buttonContainer.style.left = "50%";
    buttonContainer.style.transform = "translateX(-50%)";
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "row";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.justifyContent = "center";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.zIndex = "20"; // Ensure buttons are above panel image
    buttonContainer.style.pointerEvents = "auto"; // Ensure buttons are clickable

    // Menu button (from pause menu)
    const menuBtn = document.createElement("button");
    menuBtn.id = "gameOverMenuBtn";
    menuBtn.style.background = "transparent";
    menuBtn.style.border = "none";
    menuBtn.style.padding = "0";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.display = "block";

    const menuImg = document.createElement("img");
    menuImg.src = this.menuButtonImage.src;
    menuImg.style.width = "auto";
    menuImg.style.height = "auto";
    menuImg.style.maxWidth = "min(200px, 30vw)";
    menuImg.style.maxHeight = "min(60px, 8vh)";
    menuImg.style.objectFit = "contain";
    menuImg.style.display = "block";
    menuBtn.appendChild(menuImg);

    this.bindPress(menuBtn, () => {
      this.triggerHaptic("light");
      this.showMenu();
    });

    buttonContainer.appendChild(menuBtn);

    // Restart button
    const restartBtn = document.createElement("button");
    restartBtn.id = "gameOverRestartBtn";
    restartBtn.style.background = "transparent";
    restartBtn.style.border = "none";
    restartBtn.style.padding = "0";
    restartBtn.style.cursor = "pointer";
    restartBtn.style.display = "block";

    const restartImg = document.createElement("img");
    restartImg.src = this.restartButtonImage.src;
    restartImg.style.width = "auto";
    restartImg.style.height = "auto";
    restartImg.style.maxWidth = "min(200px, 30vw)";
    restartImg.style.maxHeight = "min(60px, 8vh)";
    restartImg.style.objectFit = "contain";
    restartImg.style.display = "block";
    restartBtn.appendChild(restartImg);

    this.bindPress(restartBtn, () => {
      this.triggerHaptic("light");
      this.restart();
    });

    buttonContainer.appendChild(restartBtn);

    contentContainer.appendChild(distanceContainer);

    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(contentContainer);
    panelContainer.appendChild(buttonContainer); // Add button container directly to panelContainer so it's above everything

    // Create the Retry button below the panel using restart.png
    const retryBtn = document.createElement("button");
    retryBtn.id = "gameOverRetryBtn";
    retryBtn.style.cssText = `
      display: block;
      margin: 16px auto 0;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      pointer-events: auto;
      z-index: 20;
      position: relative;
      transition: transform 0.15s ease;
    `;

    const retryImg = document.createElement("img");
    retryImg.src = this.restartButtonImage!.src;
    retryImg.style.width = "auto";
    retryImg.style.height = "auto";
    retryImg.style.maxWidth = "min(280px, 60vw)";
    retryImg.style.maxHeight = "min(70px, 10vh)";
    retryImg.style.objectFit = "contain";
    retryImg.style.display = "block";
    retryBtn.appendChild(retryImg);

    retryBtn.addEventListener("mousedown", () => {
      retryBtn.style.transform = "scale(0.93)";
    });
    retryBtn.addEventListener("mouseup", () => {
      retryBtn.style.transform = "scale(1)";
    });
    this.bindPress(retryBtn, () => {
      this.triggerHaptic("light");
      this.restart();
    });

    // Create wrapper div
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);
    wrapper.appendChild(retryBtn);

    gameOverOverlay.appendChild(wrapper);
  }

  private updateSettingsPanel(): void {
    const settingsPanel = document.getElementById("settingsPanel");
    if (!settingsPanel) return;

    // Only update if all images are loaded
    if (!this.settingsPanelImage || !this.settingsPanelImage.complete) return;
    if (!this.onToggleImage || !this.onToggleImage.complete) return;
    if (!this.offToggleImage || !this.offToggleImage.complete) return;

    // Check if already updated
    if (settingsPanel.querySelector("img[src*='settings_panel']")) return;

    // Clear the entire settings panel structure and rebuild like pause panel
    settingsPanel.innerHTML = "";

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "settingsBackdrop";
    backdrop.id = "settingsBackdrop";
    this.bindPress(backdrop, () => {
      this.setSettingsOpen(false);
    });
    settingsPanel.appendChild(backdrop);

    // Create panel container (similar to pause panel)
    const panelContainer = document.createElement("div");
    panelContainer.style.position = "relative";
    panelContainer.style.display = "inline-block";
    panelContainer.style.textAlign = "center";

    // Add settings panel background
    const panelImg = document.createElement("img");
    panelImg.src = this.settingsPanelImage.src;
    panelImg.style.width = "auto";
    panelImg.style.height = "auto";
    panelImg.style.maxWidth = "min(600px, 90vw)";
    panelImg.style.maxHeight = "min(500px, 80vh)";
    panelImg.style.objectFit = "contain";
    panelImg.style.display = "block";

    // Create content container (positioned absolutely over the panel)
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "absolute";
    contentContainer.style.top = "50%";
    contentContainer.style.left = "50%";
    contentContainer.style.transform = "translate(-50%, -50%)";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.gap = "30px";
    contentContainer.style.alignItems = "center";
    contentContainer.style.width = "100%";
    contentContainer.style.paddingTop = "40px";

    // Create settings toggles
    const createToggleRow = (
      labelImage: HTMLImageElement | null,
      settingKey: keyof Settings,
    ) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.width = "80%";
      row.style.marginBottom = "10px";

      // Label (using image instead of text)
      const labelEl = document.createElement("label");
      labelEl.style.cursor = "pointer";
      labelEl.style.display = "flex";
      labelEl.style.alignItems = "center";

      if (labelImage) {
        const labelImg = document.createElement("img");
        labelImg.src = labelImage.src;
        labelImg.style.width = "auto";
        labelImg.style.height = "auto";
        labelImg.style.maxWidth = "min(120px, 20vw)";
        labelImg.style.maxHeight = "min(30px, 5vh)";
        labelImg.style.objectFit = "contain";
        labelImg.style.display = "block";
        labelEl.appendChild(labelImg);
      }

      // Toggle button (using sprite)
      const toggleBtn = document.createElement("button");
      toggleBtn.id = `toggle${settingKey.charAt(0).toUpperCase() + settingKey.slice(1)}`;
      toggleBtn.style.background = "transparent";
      toggleBtn.style.border = "none";
      toggleBtn.style.padding = "0";
      toggleBtn.style.cursor = "pointer";
      toggleBtn.style.display = "block";

      const toggleImg = document.createElement("img");
      const isActive = this.settings[settingKey];
      toggleImg.src = isActive
        ? this.onToggleImage!.src
        : this.offToggleImage!.src;
      toggleImg.style.width = "auto";
      toggleImg.style.height = "50px"; // Larger toggle
      toggleImg.style.objectFit = "contain";
      toggleImg.style.display = "block";
      toggleBtn.appendChild(toggleImg);

      const toggleSetting = () => {
        this.triggerHaptic("light");
        (this.settings as any)[settingKey] = !this.settings[settingKey];
        this.saveSettings();
        this.applySettingsToUI();

        // Update toggle image
        const isActive = this.settings[settingKey];
        toggleImg.src = isActive
          ? this.onToggleImage!.src
          : this.offToggleImage!.src;

        if (settingKey === "fx") {
          this.audio.setFxEnabled(this.settings.fx);
        } else if (settingKey === "music") {
          this.audio.setMusicEnabled(this.settings.music);
          if (this.settings.music && this.state === "PLAYING") {
            this.audio.startMusic();
          } else if (!this.settings.music) {
            this.audio.stopMusic();
          }
        }
      };
      // Pointer-first binding for reliable mobile presses.
      this.bindPress(toggleBtn, toggleSetting);

      // Make label clickable
      this.bindPress(labelEl, toggleSetting);

      row.appendChild(labelEl);
      row.appendChild(toggleBtn);
      return row;
    };

    contentContainer.appendChild(
      createToggleRow(this.musicLabelImage, "music"),
    );
    contentContainer.appendChild(createToggleRow(this.sfxLabelImage, "fx"));
    contentContainer.appendChild(
      createToggleRow(this.hapticsLabelImage, "haptics"),
    );

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.id = "settingsCloseBtn";
    closeBtn.className = "settingsClose";
    closeBtn.textContent = "X";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "20px";
    closeBtn.style.right = "20px";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#ffffff";
    closeBtn.style.fontSize = "24px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.width = "40px";
    closeBtn.style.height = "40px";
    closeBtn.style.display = "flex";
    closeBtn.style.alignItems = "center";
    closeBtn.style.justifyContent = "center";
    this.bindPress(closeBtn, () => {
      this.triggerHaptic("light");
      this.setSettingsOpen(false);
    });

    panelContainer.appendChild(panelImg);
    panelContainer.appendChild(contentContainer);
    panelContainer.appendChild(closeBtn);

    // Create a wrapper div similar to pause overlay structure
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.appendChild(panelContainer);

    settingsPanel.appendChild(wrapper);

    // Store references for applySettingsToUI
    this.toggleMusic = document.getElementById("toggleMusic") as HTMLElement;
    this.toggleFx = document.getElementById("toggleFx") as HTMLElement;
    this.toggleHaptics = document.getElementById(
      "toggleHaptics",
    ) as HTMLElement;
    this.settingsCloseBtn = closeBtn;
    this.settingsBackdrop = backdrop;
  }

  private updateStartMenu(): void {
    const startOverlay = document.getElementById("startOverlay");
    if (!startOverlay) return;

    // Only update if all images are loaded
    if (!this.menuBgImage || !this.menuBgImage.complete) {
      console.log("[Menu] Waiting for bg image to load");
      return;
    }
    if (!this.titleImage || !this.titleImage.complete) {
      console.log("[Menu] Waiting for title image to load");
      return;
    }
    if (!this.startButtonImage || !this.startButtonImage.complete) {
      console.log("[Menu] Waiting for start button image to load");
      return;
    }
    if (!this.optionsButtonImage || !this.optionsButtonImage.complete) {
      console.log("[Menu] Waiting for options button image to load");
      return;
    }

    // Always update - clear existing content first
    startOverlay.innerHTML = "";

    // Remove overlay background so bg.png shows through
    startOverlay.style.background = "transparent";

    // Create background
    const bgImg = document.createElement("img");
    bgImg.src = this.menuBgImage.src;
    bgImg.style.position = "absolute";
    bgImg.style.top = "0";
    bgImg.style.left = "0";
    bgImg.style.width = "100%";
    bgImg.style.height = "100%";
    bgImg.style.objectFit = "cover";
    bgImg.style.zIndex = "0";
    startOverlay.appendChild(bgImg);

    // Particle container (Dust/Gold)
    const particleContainer = document.createElement("div");
    particleContainer.style.position = "absolute";
    particleContainer.style.inset = "0";
    particleContainer.style.pointerEvents = "none";
    particleContainer.style.zIndex = "5";

    for (let i = 0; i < 80; i++) {
      const p = document.createElement("div");
      p.style.position = "absolute";
      p.style.width = Math.random() < 0.5 ? "2px" : "3px";
      p.style.height = p.style.width;
      p.style.background = "gold";
      p.style.borderRadius = "50%";
      p.style.boxShadow = "0 0 4px gold";
      p.style.left = Math.random() * 100 + "%";
      p.style.top = Math.random() * 100 + "%";
      p.style.opacity = "0";
      p.style.animation = `floatParticle ${5 + Math.random() * 5}s infinite linear`;
      p.style.animationDelay = `-${Math.random() * 5}s`;
      particleContainer.appendChild(p);
    }
    startOverlay.appendChild(particleContainer);

    // Create content container
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "relative";
    contentContainer.style.width = "100%";
    contentContainer.style.height = "100%";
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.alignItems = "center";
    contentContainer.style.justifyContent = "center";
    contentContainer.style.gap = "40px";
    contentContainer.style.zIndex = "10";
    contentContainer.style.pointerEvents = "auto";

    // Create title with up/down animation
    const titleContainer = document.createElement("div");
    titleContainer.style.position = "relative";
    titleContainer.style.display = "flex";
    titleContainer.style.justifyContent = "center";
    titleContainer.style.alignItems = "center";
    titleContainer.style.animation = "titleFloat 2.2s ease-in-out infinite";

    const titleImg = document.createElement("img");
    titleImg.src = this.titleImage.src;
    titleImg.style.width = "auto";
    titleImg.style.height = "auto";
    titleImg.style.maxWidth = "min(900px, 95vw)";
    titleImg.style.maxHeight = "min(350px, 40vh)";
    titleImg.style.objectFit = "contain";
    titleImg.style.display = "block";
    titleImg.id = "menuTitle";
    titleImg.className = "menuTitle";
    // titleImg.style.animation = "titleFloat 2.2s ease-in-out infinite"; // Moved to container
    titleContainer.appendChild(titleImg);

    // Shine effect overlay
    const shine = document.createElement("div");
    shine.style.position = "absolute";
    shine.style.top = "0";
    shine.style.left = "0";
    shine.style.width = "100%";
    shine.style.height = "100%";
    shine.style.background =
      "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)";
    shine.style.backgroundSize = "200% 100%";
    shine.style.mixBlendMode = "overlay";
    shine.style.animation = "shineSweep 4s infinite";
    shine.style.pointerEvents = "none";
    shine.style.webkitMaskImage = `url(${this.titleImage.src})`;
    shine.style.webkitMaskSize = "contain";
    shine.style.webkitMaskRepeat = "no-repeat";
    shine.style.webkitMaskPosition = "center";
    shine.style.maskImage = `url(${this.titleImage.src})`;
    shine.style.maskSize = "contain";
    shine.style.maskRepeat = "no-repeat";
    shine.style.maskPosition = "center";
    titleContainer.appendChild(shine);

    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "column";
    buttonContainer.style.gap = "20px";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.pointerEvents = "auto";
    buttonContainer.style.position = "relative";
    buttonContainer.style.zIndex = "10";

    // Start button with zoom animation
    const startBtn = document.createElement("button");
    startBtn.id = "playBtn";
    startBtn.className = "menuBtn primary";
    startBtn.style.background = "transparent";
    startBtn.style.border = "none";
    startBtn.style.padding = "0";
    startBtn.style.cursor = "pointer";
    startBtn.style.display = "block";
    startBtn.style.animation = "startPulse 1.3s ease-in-out infinite";
    startBtn.style.pointerEvents = "auto";
    startBtn.style.position = "relative";
    startBtn.style.zIndex = "10";

    const startImg = document.createElement("img");
    startImg.src = this.startButtonImage.src;
    startImg.style.width = "auto";
    startImg.style.height = "auto";
    startImg.style.maxWidth = "min(400px, 60vw)";
    startImg.style.maxHeight = "min(120px, 15vh)";
    startImg.style.objectFit = "contain";
    startImg.style.display = "block";
    startImg.style.visibility = "visible";
    startImg.style.opacity = "1";
    startImg.onerror = () => {
      console.error("[Menu] Failed to load start button image:", startImg.src);
    };
    startBtn.appendChild(startImg);

    // Re-attach event listener
    this.bindPress(startBtn, () => {
      this.triggerHaptic("light");
      this.start();
    });

    buttonContainer.appendChild(startBtn);

    // Options button
    const optionsBtn = document.createElement("button");
    optionsBtn.id = "optionsBtn";
    optionsBtn.className = "menuBtn";
    optionsBtn.style.background = "transparent";
    optionsBtn.style.border = "none";
    optionsBtn.style.padding = "0";
    optionsBtn.style.cursor = "pointer";
    optionsBtn.style.display = "block";
    optionsBtn.style.pointerEvents = "auto";
    optionsBtn.style.position = "relative";
    optionsBtn.style.zIndex = "10";

    const optionsImg = document.createElement("img");
    optionsImg.src = this.optionsButtonImage.src;
    optionsImg.style.width = "auto";
    optionsImg.style.height = "auto";
    optionsImg.style.maxWidth = "min(350px, 55vw)";
    optionsImg.style.maxHeight = "min(100px, 12vh)";
    optionsImg.style.objectFit = "contain";
    optionsImg.style.display = "block";
    optionsImg.style.visibility = "visible";
    optionsImg.style.opacity = "1";
    optionsImg.onerror = () => {
      console.error(
        "[Menu] Failed to load options button image:",
        optionsImg.src,
      );
    };
    optionsBtn.appendChild(optionsImg);

    // Re-attach event listener
    this.bindPress(optionsBtn, () => {
      this.triggerHaptic("light");
      this.toggleSettings();
    });

    buttonContainer.appendChild(optionsBtn);

    contentContainer.appendChild(titleContainer);
    contentContainer.appendChild(buttonContainer);
    startOverlay.appendChild(contentContainer);

    // Ensure content container has pointer events and is visible
    contentContainer.style.pointerEvents = "auto";
    contentContainer.style.visibility = "visible";
    contentContainer.style.opacity = "1";

    // Ensure buttons and images are visible
    startBtn.style.visibility = "visible";
    startBtn.style.opacity = "1";
    optionsBtn.style.visibility = "visible";
    optionsBtn.style.opacity = "1";
    startImg.style.visibility = "visible";
    startImg.style.opacity = "1";
    optionsImg.style.visibility = "visible";
    optionsImg.style.opacity = "1";

    // Ensure button container is visible
    buttonContainer.style.visibility = "visible";
    buttonContainer.style.opacity = "1";

    console.log("[Menu] Menu updated - buttons created", {
      hasStartBtn: !!startBtn,
      hasOptionsBtn: !!optionsBtn,
      startBtnVisible: startBtn.style.display !== "none",
      optionsBtnVisible: optionsBtn.style.display !== "none",
      startImgSrc: startImg.src,
      optionsImgSrc: optionsImg.src,
      startImgComplete: startImg.complete,
      optionsImgComplete: optionsImg.complete,
      buttonContainerChildren: buttonContainer.children.length,
      contentContainerChildren: contentContainer.children.length,
    });
  }

  private buildPatterns(): void {
    // Noise pattern
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const nctx = noiseCanvas.getContext("2d");
    if (nctx) {
      const imgData = nctx.createImageData(256, 256);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const v = Math.random() * 255;
        imgData.data[i] = v;
        imgData.data[i + 1] = v;
        imgData.data[i + 2] = v;
        imgData.data[i + 3] = 255;
      }
      nctx.putImageData(imgData, 0, 0);
      this.noisePattern = nctx.createPattern(noiseCanvas, "repeat");
    }

    // Egyptian hieroglyphic pattern
    const hieroCanvas = document.createElement("canvas");
    hieroCanvas.width = 64;
    hieroCanvas.height = 64;
    const hctx = hieroCanvas.getContext("2d");
    if (hctx) {
      hctx.fillStyle = "rgba(255, 220, 150, 0.15)"; // Golden hieroglyphic symbols
      hctx.strokeStyle = "rgba(255, 200, 100, 0.25)";
      hctx.lineWidth = 1.5;

      // Draw simple hieroglyphic-like symbols
      for (let y = 0; y < 64; y += 16) {
        for (let x = 0; x < 64; x += 16) {
          const symbol = (x + y * 4) % 4;
          hctx.save();
          hctx.translate(x + 8, y + 8);

          if (symbol === 0) {
            // Eye symbol
            hctx.beginPath();
            hctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            hctx.stroke();
            hctx.fillRect(-1, -1, 2, 2);
          } else if (symbol === 1) {
            // Ankh-like cross
            hctx.beginPath();
            hctx.moveTo(0, -4);
            hctx.lineTo(0, 4);
            hctx.moveTo(-3, 0);
            hctx.lineTo(3, 0);
            hctx.arc(0, -2, 2, 0, Math.PI);
            hctx.stroke();
          } else if (symbol === 2) {
            // Pyramid triangle
            hctx.beginPath();
            hctx.moveTo(0, -4);
            hctx.lineTo(-4, 4);
            hctx.lineTo(4, 4);
            hctx.closePath();
            hctx.stroke();
          } else {
            // Scarab circle
            hctx.beginPath();
            hctx.arc(0, 0, 3, 0, Math.PI * 2);
            hctx.stroke();
            hctx.fillRect(-1, -1, 2, 2);
          }

          hctx.restore();
        }
      }
      this.hieroglyphPattern = hctx.createPattern(hieroCanvas, "repeat");
    }

    // Wall pattern (simpler grid)
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = 100;
    wallCanvas.height = 100;
    const wctx = wallCanvas.getContext("2d");
    if (wctx) {
      wctx.strokeStyle = "rgba(255,200,100,0.20)"; // Golden pattern
      wctx.lineWidth = 1;
      for (let i = 0; i < 100; i += 8) {
        wctx.beginPath();
        wctx.moveTo(i, 0);
        wctx.lineTo(i, 100);
        wctx.stroke();
        wctx.beginPath();
        wctx.moveTo(0, i);
        wctx.lineTo(100, i);
        wctx.stroke();
      }
      this.wallPattern = wctx.createPattern(wallCanvas, "repeat");
    }
  }

  private wrapX(x: number): number {
    while (x < 0) x += CONFIG.MAZE_COLS;
    while (x >= CONFIG.MAZE_COLS) x -= CONFIG.MAZE_COLS;
    return x;
  }

  private getPlayableBoundsForChunk(chunkId: number): {
    playableStart: number;
    playableEnd: number;
  } {
    const widthFactor = this.chunkWidthFactor.get(chunkId) ?? 1.0;
    const scaledWidth = Math.round(CONFIG.MAX_WIDTH_COLS * widthFactor);
    const effectiveWidth = clamp(
      scaledWidth,
      CONFIG.MIN_WIDTH_COLS,
      CONFIG.MAX_WIDTH_COLS,
    );
    const leftMargin = Math.floor((CONFIG.MAZE_COLS - effectiveWidth) / 2);
    const rightMargin = CONFIG.MAZE_COLS - leftMargin - effectiveWidth;
    return {
      playableStart: leftMargin,
      playableEnd: CONFIG.MAZE_COLS - rightMargin,
    };
  }

  private buildSideWallSpawns(
    playableStart: number,
    playableEnd: number,
  ): SideWallSpawn[] {
    const spawns: SideWallSpawn[] = [];

    for (let i = 0; i < 2; i++) {
      spawns.push({
        col: -2 + i,
        sprite: "wall8",
        border: i === 1 ? "right" : null,
      });
    }

    for (let col = 0; col < playableStart - 1; col++) {
      spawns.push({
        col,
        sprite: "wall8",
        border: col === playableStart - 2 ? "right" : null,
      });
    }

    if (playableStart > 0) {
      spawns.push({
        col: playableStart - 1,
        sprite: "tile",
        border: "right",
      });
    }

    for (let i = 0; i < 2; i++) {
      spawns.push({
        col: CONFIG.MAZE_COLS + i,
        sprite: "wall8",
        border: i === 0 ? "left" : null,
      });
    }

    for (let col = playableEnd + 1; col < CONFIG.MAZE_COLS; col++) {
      spawns.push({
        col,
        sprite: "wall8",
        border: col === playableEnd + 1 ? "left" : null,
      });
    }

    if (playableEnd < CONFIG.MAZE_COLS) {
      spawns.push({
        col: playableEnd,
        sprite: "tile",
        border: "left",
      });
    }

    return spawns;
  }

  private forceMarginWalls(
    row: TileType[],
    playableStart: number,
    playableEnd: number,
  ): void {
    for (let col = 0; col < playableStart; col++) {
      row[col] = "wall";
    }
    for (let col = playableEnd; col < CONFIG.MAZE_COLS; col++) {
      row[col] = "wall";
    }
  }

  private ensureSideWallSpawnsForRow(rowY: number): SideWallSpawn[] {
    const cached = this.sideWallSpawnsByRow.get(rowY);
    if (cached) return cached;

    const chunkId = this.getChunkIdForRow(rowY);
    const { playableStart, playableEnd } =
      this.getPlayableBoundsForChunk(chunkId);
    const spawns = this.buildSideWallSpawns(playableStart, playableEnd);
    this.sideWallSpawnsByRow.set(rowY, spawns);
    return spawns;
  }

  private placeChunkRows(
    startRow: number,
    height: number,
    sourceRows: TileType[][],
    sideWallSpawns: SideWallSpawn[],
    templateEntryX: number,
    center: number,
    playableStart: number,
    playableEnd: number,
    entryX: number,
  ): void {
    for (let localY = 0; localY < height; localY++) {
      const ry = startRow + (height - 1 - localY);
      const sourceRow =
        sourceRows[localY] ?? new Array(CONFIG.MAZE_COLS).fill("wall");
      const row = sourceRow.slice() as TileType[];

      // Keep vertical connectivity when reusing pooled chunks.
      if (localY === 0) {
        // Connect the new entry with template's original entry on the seam row.
        const seamStart = Math.max(
          playableStart,
          Math.min(entryX, templateEntryX),
        );
        const seamEnd = Math.min(
          playableEnd - 1,
          Math.max(entryX, templateEntryX),
        );
        for (let x = seamStart; x <= seamEnd; x++) {
          row[x] = "dot";
        }

        if (entryX >= playableStart && entryX < playableEnd) {
          row[entryX] = "dot";
        }
        if (templateEntryX >= playableStart && templateEntryX < playableEnd) {
          row[templateEntryX] = "dot";
        }
      }

      this.forceMarginWalls(row, playableStart, playableEnd);
      this.rows.set(ry, row);
      this.spineXByRow.set(ry, center);
      this.sideWallSpawnsByRow.set(ry, sideWallSpawns);
    }
  }

  private getChunkIdForRow(rowY: number): number {
    if (this.chunkCache.has(rowY)) {
      return this.chunkCache.get(rowY)!;
    }
    // Determine chunk based on row position
    // Chunk 0: [6, 15] (height 10)
    // Chunk -1: [-4, 5] (height 10)
    // Chunk -2: [-14, -5] (height 10)
    // Formula: floor((rowY - 15) / 10) does NOT work for this.
    // 15 -> 0.
    // 6 -> -1 (should be 0).

    // Correct formula for 10-row chunks ending at 15:
    // rowY = 15 -> 0.
    // rowY = 6 -> 0.
    // rowY = 5 -> -1.
    // rowY = -4 -> -1.
    // rowY = -5 -> -2.

    // (rowY - 6) / 10
    // 15 - 6 = 9 -> 0.9 -> 0.
    // 6 - 6 = 0 -> 0.
    // 5 - 6 = -1 -> -0.1 -> -1.
    // -4 - 6 = -10 -> -1.
    // -5 - 6 = -11 -> -1.1 -> -2.
    // This formula works perfectly!

    const chunkId = Math.floor((rowY - 6) / 10);
    this.chunkCache.set(rowY, chunkId);
    return chunkId;
  }

  // =========================================================================
  // CHUNK GENERATION v4 — Exit Gate + Exit Reachability + Stop-Node Graph
  // =========================================================================

  private generateChunk(
    chunkId: number,
    startRow: number,
    height: number,
  ): void {
    const { playableStart: ps, playableEnd: pe } =
      this.getPlayableBoundsForChunk(chunkId);
    const center = ps + Math.floor((pe - ps) / 2);

    this.chunkWidthFactor.set(chunkId, 1.0);

    // Entry X from previous chunk
    // Previous chunk is BELOW (higher Y).
    // Chunk 0 (6..15) -> prev chunk starts at 16? No.
    // If chunkId=0 (6..15).
    // Prev chunk is "below". But below 15 is 16.
    // Row 16 is boundary.
    // So entryX logic needs to check Row 16.

    // Chunk -1 (-4..5).
    // Prev chunk is Chunk 0 (6..15).
    // Prev chunk starts at 6.
    // The "bottom" of prev chunk is 15? No.
    // The "top" of prev chunk is 6.
    // The "bottom" of CURRENT chunk (-1) is 5.
    // We want to connect Bottom of Current (5) to Top of Prev (6).
    // So prevRow = rows.get(startRow + height)?
    // startRow (-4) + 10 = 6. Correct!
    // Row 6 is the Top of Chunk 0.
    // Row 5 is Bottom of Chunk -1.
    // We want to connect 5 to 6.
    // So `prevRow` should be Row 6.

    // So my previous change: const prevRow = this.rows.get(startRow + height);
    // is CORRECT.

    let entryX = center;
    // We are generating UPWARDS (negative Y direction), so the previous chunk is BELOW (higher Y value)
    // For a chunk starting at `startRow` with height `height`, the row below is `startRow + height`

    // CRITICAL FIX: Use ensureRow instead of get to force generation of the previous chunk if it's missing.
    // This handles the case where the loop order in ensureRowsForView visits the top chunk before the bottom chunk.
    // Recursive generation ensures bottom chunks exist before top chunks try to connect to them.
    const prevRow = this.ensureRow(startRow + height);

    if (prevRow) {
      for (let x = ps; x < pe; x++) {
        const tile = prevRow[x];
        if (tile !== "wall" && tile !== "empty") {
          entryX = x;
          break;
        }
      }
    }

    // Map localY (0=bottom, height-1=top) to world Y (startRow+height-1=bottom, startRow=top)
    // Wait. My calculation in ensureRow assumed chunkStartRow is TOP.
    // If chunkStartRow=6, height=10. Rows 6..15.
    // localY=0 (bottom of logic) -> 15.
    // localY=9 (top of logic) -> 6.
    // So ry = startRow + (height - 1 - localY) is correct.
    // ry = 6 + 9 - 0 = 15.
    // ry = 6 + 9 - 9 = 6.
    // Perfect.

    const recycledBucket = this.recycledChunkTemplatesByEntry.get(entryX);
    const recycledTemplate = recycledBucket?.pop();
    if (recycledTemplate) {
      this.recycledChunkTemplateCount = Math.max(
        0,
        this.recycledChunkTemplateCount - 1,
      );
      if (recycledBucket && recycledBucket.length === 0) {
        this.recycledChunkTemplatesByEntry.delete(entryX);
      }
      this.placeChunkRows(
        startRow,
        height,
        recycledTemplate.rows,
        recycledTemplate.sideWallSpawns,
        recycledTemplate.entryX,
        center,
        ps,
        pe,
        entryX,
      );
      this.chunkTemplateByChunkId.set(chunkId, recycledTemplate);
      return;
    }

    const finalGrid = MonotonicUpPath.generate(
      CONFIG.MAZE_COLS,
      height,
      this.globalSeed + chunkId * 1000,
      entryX,
      ps,
      pe,
      prevRow,
    );
    const sideWallSpawns = this.buildSideWallSpawns(ps, pe);
    const templateRows: TileType[][] = new Array(height);

    for (let localY = 0; localY < height; localY++) {
      const ry = startRow + (height - 1 - localY);
      const row: TileType[] = new Array(CONFIG.MAZE_COLS);
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        row[x] =
          finalGrid[localY][x] === "power" ? "power" : finalGrid[localY][x];
      }
      this.forceMarginWalls(row, ps, pe);
      this.rows.set(ry, row);
      this.spineXByRow.set(ry, center);
      this.sideWallSpawnsByRow.set(ry, sideWallSpawns);
      templateRows[localY] = row.slice() as TileType[];
    }

    this.chunkTemplateByChunkId.set(chunkId, {
      rows: templateRows,
      sideWallSpawns,
      entryX,
    });
  }

  // =========================================================================
  // SINGLE ATTEMPT v4 — Gate-first pipeline
  // =========================================================================
  //
  // ORDER:
  //  1. Place exit gate + exit connector (protected)
  //  2. Place entry connector (protected)
  //  3. Carve protected zigzag spine connecting entry → exit gate
  //  4. Add side pockets with reconnection
  //  5. Wall density (never touch protected)
  //  6. Build stop-node graph
  //  7. Exit reachability test (entry → exit on stop-node graph)
  //  8. Progress guarantee test (every node can go up in 8 moves)
  //  9. Reject if either test fails
  //
  private attemptChunkV4(
    height: number,
    ps: number,
    pe: number,
    center: number,
    entryX: number,
    random: () => number,
  ): ("wall" | "dot" | "power")[][] | null {
    type Cell = "wall" | "dot" | "power";
    const grid: Cell[][] = [];
    const protect: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      grid[y] = new Array(CONFIG.MAZE_COLS).fill("wall") as Cell[];
      protect[y] = new Array(CONFIG.MAZE_COLS).fill(false);
    }

    const carve = (y: number, x: number): void => {
      if (y >= 0 && y < height && x >= ps && x < pe) grid[y][x] = "dot";
    };
    const prot = (y: number, x: number): void => {
      if (y >= 0 && y < height && x >= ps && x < pe) {
        grid[y][x] = "dot";
        protect[y][x] = true;
      }
    };

    // ══════════════════════════════════════════════════════════════════════
    // STEP 1: EXIT GATE + EXIT CONNECTOR (placed FIRST, all protected)
    // ══════════════════════════════════════════════════════════════════════
    //
    // Gate geometry (top of chunk):
    //  Row height-1:  ...#.E.#...   ← exit connector (1-tile aligned opening)
    //  Row height-2:  ...#...#...   ← gate path (open above launch pad)
    //  Row height-3:  ...#.L.#...   ← launch pad (L) — wall on left+right
    //
    // The player slides horizontally into launch pad (L), stops at wall,
    // then presses UP → slides through gate path into exit connector (E).
    //
    const exitX = ps + 2 + Math.floor(random() * (pe - ps - 4));

    // Exit connector: top row (height-1) — 1-tile aligned opening
    prot(height - 1, exitX);
    // Walls flanking exit (ensure 1-tile opening)
    if (exitX > ps) grid[height - 1][exitX - 1] = "wall";
    if (exitX < pe - 1) grid[height - 1][exitX + 1] = "wall";

    // Gate path: row height-2 — open above launch pad
    prot(height - 2, exitX);

    // Launch pad: row height-3 — wall on both sides so player stops here
    prot(height - 3, exitX);
    // Walls flanking launch pad
    if (exitX > ps) grid[height - 3][exitX - 1] = "wall";
    if (exitX < pe - 1) grid[height - 3][exitX + 1] = "wall";

    // Gate approach: horizontal corridor into launch pad (so player can slide there)
    // Come from left or right
    const gateApproachDir = random() < 0.5 ? -1 : 1;
    const gateApproachLen = 2 + Math.floor(random() * 3); // 2-4 tiles
    for (let i = 1; i <= gateApproachLen; i++) {
      const ax = exitX + gateApproachDir * i;
      if (ax > ps && ax < pe - 1) {
        prot(height - 3, ax);
      } else break;
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 2: ENTRY CONNECTOR (protected)
    // ══════════════════════════════════════════════════════════════════════
    prot(0, entryX);
    if (entryX > ps) prot(0, entryX - 1);
    if (entryX < pe - 1) prot(0, entryX + 1);

    // ══════════════════════════════════════════════════════════════════════
    // STEP 3: PROTECTED ZIGZAG SPINE (entry → exit gate approach)
    // ══════════════════════════════════════════════════════════════════════
    let curX = entryX;
    let curY = 0;
    const gateApproachY = height - 3;

    while (curY < gateApproachY) {
      // Horizontal segment: 3-5 tiles
      const goLeft = random() < 0.5;
      const hLen = 3 + Math.floor(random() * 3);
      const hDir = goLeft ? -1 : 1;

      for (let i = 1; i <= hLen; i++) {
        const nx = curX + hDir * i;
        if (nx > ps && nx < pe - 1) {
          prot(curY, nx);
          curX = nx;
        } else break;
      }

      if (curY >= gateApproachY) break;

      // Vertical segment: 2-4 tiles (max 6)
      const vLen = Math.min(
        2 + Math.floor(random() * 3),
        6,
        gateApproachY - curY,
      );
      if (vLen <= 0) break;
      for (let i = 1; i <= vLen; i++) {
        prot(curY + i, curX);
      }
      curY += vLen;

      // Small horizontal landing
      const landDir = random() < 0.5 ? -1 : 1;
      const landLen = 1 + Math.floor(random() * 2);
      for (let i = 1; i <= landLen; i++) {
        const nx = curX + landDir * i;
        if (nx > ps && nx < pe - 1) prot(curY, nx);
      }
    }

    // Connect spine end to gate approach row (height-3)
    if (curY < gateApproachY) {
      // Vertical connector up to gate approach row
      for (let y = curY + 1; y <= gateApproachY; y++) prot(y, curX);
      curY = gateApproachY;
    }
    // Horizontal connector to gate approach
    const connMinX = Math.min(curX, exitX + gateApproachDir * gateApproachLen);
    const connMaxX = Math.max(curX, exitX + gateApproachDir * gateApproachLen);
    for (let x = Math.max(ps, connMinX); x <= Math.min(pe - 1, connMaxX); x++) {
      prot(gateApproachY, x);
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 4: SIDE POCKETS (non-dead-end, respect protected)
    // ══════════════════════════════════════════════════════════════════════
    const numPockets = 1 + Math.floor(random() * 3);
    for (let p = 0; p < numPockets; p++) {
      const anchorY = 1 + Math.floor(random() * (height - 5));
      let anchorX = -1;
      for (let x = ps; x < pe; x++) {
        if (grid[anchorY][x] !== "wall") {
          anchorX = x;
          break;
        }
      }
      if (anchorX < 0) continue;

      const dir = random() < 0.5 ? -1 : 1;
      const depth = 1 + Math.floor(random() * 2);
      let pocketX = anchorX;
      for (let d = 1; d <= depth; d++) {
        const nx = pocketX + dir;
        if (nx > ps && nx < pe - 1 && !protect[anchorY][nx]) {
          carve(anchorY, nx);
          pocketX = nx;
        } else break;
      }
      // Reconnect back
      const rcEndY = Math.min(
        anchorY + 1 + Math.floor(random() * 2),
        height - 4,
      );
      for (let y = anchorY; y <= rcEndY; y++) {
        if (!protect[y][pocketX]) carve(y, pocketX);
      }
      const minR = Math.min(pocketX, anchorX);
      const maxR = Math.max(pocketX, anchorX);
      for (let x = minR; x <= maxR; x++) {
        if (!protect[rcEndY][x]) carve(rcEndY, x);
        else carve(rcEndY, x); // OK to carve protected (already open)
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 5: WALL DENSITY (NEVER touch protected tiles)
    // ══════════════════════════════════════════════════════════════════════

    // 5a. Break horizontal runs > 6
    for (let y = 0; y < height; y++) {
      let run = 0;
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        if (grid[y][x] !== "wall") {
          run++;
          if (run > 6 && !protect[y][x]) {
            grid[y][x] = "wall";
            run = 0;
          }
        } else {
          run = 0;
        }
      }
    }

    // 5b. Break vertical runs > 6
    for (let x = ps; x < pe; x++) {
      let run = 0;
      for (let y = 0; y < height; y++) {
        if (grid[y][x] !== "wall") {
          run++;
          if (run > 6 && !protect[y][x]) {
            grid[y][x] = "wall";
            if (x > ps && !protect[y][x - 1]) carve(y, x - 1);
            if (x < pe - 1 && !protect[y][x + 1]) carve(y, x + 1);
            run = 0;
          }
        } else {
          run = 0;
        }
      }
    }

    // 5c. Break 3×3 open areas
    for (let y = 0; y <= height - 3; y++) {
      for (let x = ps; x <= pe - 3; x++) {
        let allOpen = true;
        for (let dy = 0; dy < 3 && allOpen; dy++) {
          for (let dx = 0; dx < 3 && allOpen; dx++) {
            if (grid[y + dy][x + dx] === "wall") allOpen = false;
          }
        }
        if (allOpen && !protect[y + 1][x + 1]) {
          grid[y + 1][x + 1] = "wall";
        }
      }
    }

    // 5d. Strategic wall pillars (respect protected)
    for (let y = 1; y < height - 1; y++) {
      for (let x = ps + 1; x < pe - 1; x++) {
        if (grid[y][x] !== "wall" && !protect[y][x] && random() < 0.12) {
          let adj = 0;
          if (grid[y - 1][x] !== "wall") adj++;
          if (grid[y + 1][x] !== "wall") adj++;
          if (grid[y][x - 1] !== "wall") adj++;
          if (grid[y][x + 1] !== "wall") adj++;
          if (adj >= 3) grid[y][x] = "wall";
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 6: BUILD STOP-NODE GRAPH
    // ══════════════════════════════════════════════════════════════════════
    const stopNodes = this.buildStopNodeGraph(grid, height, ps, pe);

    // ══════════════════════════════════════════════════════════════════════
    // STEP 7: EXIT REACHABILITY TEST (BFS entry → exit on stop-node graph)
    //         This is NOT a soft-lock test — this is a PROGRESS test.
    // ══════════════════════════════════════════════════════════════════════
    const exitReachable = this.exitReachabilityTest(
      stopNodes,
      grid,
      height,
      ps,
      pe,
      entryX,
      exitX,
    );
    if (!exitReachable) {
      return null; // ← CHUNK REJECTED: exit not reachable
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 8: PROGRESS GUARANTEE TEST (every node → higher Y in 8 moves)
    // ══════════════════════════════════════════════════════════════════════
    const passesProgress = this.progressGuaranteeTest(stopNodes, height);
    if (!passesProgress) {
      return null; // ← CHUNK REJECTED: stuck node exists
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 9: LAUNCH PAD VALIDATION
    // ══════════════════════════════════════════════════════════════════════
    // Verify gate launch pad is still functional
    if (
      grid[height - 3][exitX] === "wall" ||
      grid[height - 2][exitX] === "wall" ||
      grid[height - 1][exitX] === "wall"
    ) {
      return null; // ← Gate broken by wall step (shouldn't happen with protect)
    }

    // Verify at least one more launch pad exists elsewhere
    let extraPads = 0;
    for (let y = 0; y < height - 3; y++) {
      for (let x = ps; x < pe; x++) {
        if (x === exitX) continue; // Don't double-count gate pad
        if (
          grid[y][x] !== "wall" &&
          grid[y + 1][x] !== "wall" &&
          grid[y + 2][x] !== "wall"
        ) {
          const hasWall =
            (x > ps && grid[y][x - 1] === "wall") ||
            (x < pe - 1 && grid[y][x + 1] === "wall") ||
            (y > 0 && grid[y - 1][x] === "wall");
          if (hasWall) extraPads++;
        }
      }
    }
    if (extraPads < 1) {
      return null; // Need at least 1 extra launch pad besides gate
    }

    // ══════════════════════════════════════════════════════════════════════
    // STEP 10: COLLECTIBLES
    // ══════════════════════════════════════════════════════════════════════
    for (let y = 0; y < height; y++) {
      for (let x = ps; x < pe; x++) {
        if (grid[y][x] === "dot" && random() < 0.15) {
          grid[y][x] = "power";
        }
      }
    }

    return grid; // ← CHUNK ACCEPTED ✓
  }

  // =========================================================================
  // EXIT REACHABILITY TEST
  // BFS on stop-node graph: can entry stop-node reach exit connector?
  // =========================================================================
  private exitReachabilityTest(
    nodes: Map<string, { x: number; y: number; edges: string[] }>,
    grid: ("wall" | "dot" | "power")[][],
    height: number,
    ps: number,
    pe: number,
    entryX: number,
    exitX: number,
  ): boolean {
    // Find entry stop-nodes (all stop-nodes in row 0)
    const entryKeys: string[] = [];
    for (const [key, node] of nodes) {
      if (node.y === 0) entryKeys.push(key);
    }
    // Also add the entry position itself if it's a stop-node
    const directEntryKey = `0,${entryX}`;
    if (nodes.has(directEntryKey) && !entryKeys.includes(directEntryKey)) {
      entryKeys.push(directEntryKey);
    }

    if (entryKeys.length === 0) return false;

    // Find exit stop-nodes: any stop-node at the exit gate area
    const exitKeys = new Set<string>();
    // The exit connector is at (height-1, exitX)
    // The launch pad is at (height-3, exitX)
    // Any stop-node at height-1 or height-2 near exitX counts
    for (const [key, node] of nodes) {
      if (node.y >= height - 2 && Math.abs(node.x - exitX) <= 1) {
        exitKeys.add(key);
      }
    }
    // Also accept any stop-node at height-1 (any top row exit)
    for (const [key, node] of nodes) {
      if (node.y >= height - 1) exitKeys.add(key);
    }

    if (exitKeys.size === 0) return false;

    // BFS from all entry nodes
    const visited = new Set<string>();
    const queue: string[] = [...entryKeys];
    for (const k of entryKeys) visited.add(k);

    while (queue.length > 0) {
      const nodeKey = queue.shift()!;

      // Reached exit?
      if (exitKeys.has(nodeKey)) return true;

      const node = nodes.get(nodeKey);
      if (!node) continue;

      for (const edgeKey of node.edges) {
        if (!visited.has(edgeKey)) {
          visited.add(edgeKey);
          queue.push(edgeKey);
        }
      }
    }

    return false; // ← Exit NOT reachable from entry
  }

  // =========================================================================
  // STOP-NODE GRAPH BUILDER
  // =========================================================================
  private buildStopNodeGraph(
    grid: ("wall" | "dot" | "power")[][],
    height: number,
    ps: number,
    pe: number,
  ): Map<string, { x: number; y: number; edges: string[] }> {
    const dirs: Array<"up" | "down" | "left" | "right"> = [
      "up",
      "down",
      "left",
      "right",
    ];
    const nodes = new Map<string, { x: number; y: number; edges: string[] }>();

    for (let y = 0; y < height; y++) {
      for (let x = ps; x < pe; x++) {
        if (grid[y][x] === "wall") continue;
        for (const dir of dirs) {
          const l = this.slideInGridV4(grid, height, ps, pe, y, x, dir);
          const key = `${l.y},${l.x}`;
          if (!nodes.has(key)) nodes.set(key, { x: l.x, y: l.y, edges: [] });
        }
      }
    }

    for (const [key, node] of nodes) {
      for (const dir of dirs) {
        const l = this.slideInGridV4(grid, height, ps, pe, node.y, node.x, dir);
        const tk = `${l.y},${l.x}`;
        if (tk !== key && nodes.has(tk) && !node.edges.includes(tk)) {
          node.edges.push(tk);
        }
      }
    }
    return nodes;
  }

  // =========================================================================
  // SLIDE SIMULATION v4
  // =========================================================================
  private slideInGridV4(
    grid: ("wall" | "dot" | "power")[][],
    height: number,
    ps: number,
    pe: number,
    fromY: number,
    fromX: number,
    dir: "up" | "down" | "left" | "right",
  ): { x: number; y: number } {
    let cx = fromX,
      cy = fromY;
    const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    while (true) {
      const nx = cx + dx,
        ny = cy + dy;
      if (ny < 0 || ny >= height || nx < ps || nx >= pe) break;
      if (grid[ny][nx] === "wall") break;
      cx = nx;
      cy = ny;
    }
    return { x: cx, y: cy };
  }

  // =========================================================================
  // PROGRESS GUARANTEE TEST
  // =========================================================================
  private progressGuaranteeTest(
    nodes: Map<string, { x: number; y: number; edges: string[] }>,
    height: number,
  ): boolean {
    const MAX_MOVES = 8;
    for (const [startKey, startNode] of nodes) {
      if (startNode.y >= height - 1 || startNode.y === 0) continue;

      const visited = new Set<string>();
      visited.add(startKey);
      let frontier: string[] = [startKey];
      let canProgress = false;

      for (let depth = 0; depth < MAX_MOVES && !canProgress; depth++) {
        const next: string[] = [];
        for (const nk of frontier) {
          const n = nodes.get(nk);
          if (!n) continue;
          for (const ek of n.edges) {
            if (visited.has(ek)) continue;
            visited.add(ek);
            const t = nodes.get(ek);
            if (!t) continue;
            if (t.y > startNode.y || t.y >= height - 1 || t.y === 0) {
              canProgress = true;
              break;
            }
            next.push(ek);
          }
          if (canProgress) break;
        }
        frontier = next;
      }
      if (!canProgress) return false;
    }
    return true;
  }

  // =========================================================================
  // FALLBACK CHUNK
  // =========================================================================
  private generateFallbackChunk(
    height: number,
    ps: number,
    pe: number,
    center: number,
    entryX: number,
  ): ("wall" | "dot" | "power")[][] {
    const grid: ("wall" | "dot" | "power")[][] = [];
    for (let y = 0; y < height; y++) {
      grid[y] = new Array(CONFIG.MAZE_COLS).fill("wall") as (
        | "wall"
        | "dot"
        | "power"
      )[];
    }

    let curX = entryX;
    let curY = 0;
    const lb = ps + 2,
      rb = pe - 3;

    grid[0][entryX] = "dot";
    if (entryX > ps) grid[0][entryX - 1] = "dot";
    if (entryX < pe - 1) grid[0][entryX + 1] = "dot";

    let goRight = true;
    while (curY < height - 1) {
      const hDir = goRight ? 1 : -1;
      for (let i = 1; i <= 3; i++) {
        const nx = curX + hDir * i;
        if (nx >= lb && nx <= rb) {
          grid[curY][nx] = "dot";
          curX = nx;
        }
      }
      const vEnd = Math.min(curY + 3, height - 1);
      for (let vy = curY + 1; vy <= vEnd; vy++) grid[vy][curX] = "dot";
      curY = vEnd;
      goRight = !goRight;
    }

    grid[height - 1][curX] = "dot";
    if (curX > ps) grid[height - 1][curX - 1] = "dot";
    if (curX < pe - 1) grid[height - 1][curX + 1] = "dot";

    return grid;
  }

  private activateChunk(chunkId: number): void {
    if (this.activeChunkIds.has(chunkId)) return;
    const chunkStartRow = chunkId * 10 + 6;
    this.generateChunk(chunkId, chunkStartRow, 10);
    this.activeChunkIds.add(chunkId);
  }

  private pruneSingleChunk(chunkId: number): void {
    const CHUNK_HEIGHT = 10;
    const template = this.chunkTemplateByChunkId.get(chunkId);
    if (
      template &&
      this.recycledChunkTemplateCount < this.maxRecycledChunkTemplates
    ) {
      let bucket = this.recycledChunkTemplatesByEntry.get(template.entryX);
      if (!bucket) {
        bucket = [];
        this.recycledChunkTemplatesByEntry.set(template.entryX, bucket);
      }
      bucket.push(template);
      this.recycledChunkTemplateCount++;
    }
    this.chunkTemplateByChunkId.delete(chunkId);

    const chunkStartRow = chunkId * CHUNK_HEIGHT + 6;
    for (let ry = chunkStartRow; ry < chunkStartRow + CHUNK_HEIGHT; ry++) {
      this.rows.delete(ry);
      this.spineXByRow.delete(ry);
      this.chunkCache.delete(ry);
      this.sideWallSpawnsByRow.delete(ry);
    }
    this.chunkWidthFactor.delete(chunkId);
    this.activeChunkIds.delete(chunkId);

    for (const key of Array.from(this.activeTraps.keys())) {
      const parts = key.split(",");
      if (parts.length !== 2) continue;
      const trapY = Number(parts[1]);
      if (!Number.isFinite(trapY)) continue;
      const trapChunkId = Math.floor((trapY - 6) / CHUNK_HEIGHT);
      if (trapChunkId === chunkId) this.activeTraps.delete(key);
    }
  }

  private seedInitialChunks(): void {
    this.activateChunk(0);
    this.activateChunk(-1);
    this.activateChunk(-2);
    this.currentPlayerChunkId = 0;
  }

  private ensureRow(rowY: number): TileType[] {
    if (this.rows.has(rowY)) {
      return this.rows.get(rowY)!;
    }

    // Keep exactly one ground row at startup; anything below is empty void.
    if (rowY === 16) {
      const row: TileType[] = new Array(CONFIG.MAZE_COLS);
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        row[x] = "wall";
      }
      const chunkId = this.getChunkIdForRow(rowY);
      const { playableStart, playableEnd } =
        this.getPlayableBoundsForChunk(chunkId);
      this.forceMarginWalls(row, playableStart, playableEnd);
      this.rows.set(rowY, row);
      this.sideWallSpawnsByRow.set(
        rowY,
        this.buildSideWallSpawns(playableStart, playableEnd),
      );
      return row;
    }
    if (rowY > 16) {
      const row: TileType[] = new Array(CONFIG.MAZE_COLS).fill("empty");
      this.rows.set(rowY, row);
      this.sideWallSpawnsByRow.set(rowY, []);
      return row;
    }

    const chunkId = this.getChunkIdForRow(rowY);
    if (!this.activeChunkIds.has(chunkId)) {
      return new Array(CONFIG.MAZE_COLS).fill("empty") as TileType[];
    }

    this.activateChunk(chunkId);

    // Get the row - it should exist now after generateChunk
    const row = this.rows.get(rowY);
    if (!row) {
      // Fallback: create a simple open row if generation failed
      const fallbackRow: TileType[] = new Array(CONFIG.MAZE_COLS);
      fallbackRow[0] = "wall";
      fallbackRow[CONFIG.MAZE_COLS - 1] = "wall";
      for (let x = 1; x < CONFIG.MAZE_COLS - 1; x++) {
        fallbackRow[x] = "dot";
      }
      const { playableStart, playableEnd } =
        this.getPlayableBoundsForChunk(chunkId);
      this.forceMarginWalls(fallbackRow, playableStart, playableEnd);
      this.rows.set(rowY, fallbackRow);
      this.sideWallSpawnsByRow.set(
        rowY,
        this.buildSideWallSpawns(playableStart, playableEnd),
      );
      return fallbackRow;
    }

    return row;
  }

  private getTileType(tileX: number, tileY: number): TileType {
    const row = this.ensureRow(tileY);
    return row[this.wrapX(tileX)] ?? "wall";
  }

  private setTileType(tileX: number, tileY: number, next: TileType): void {
    const row = this.ensureRow(tileY);
    row[this.wrapX(tileX)] = next;
  }

  private canMove(tileX: number, tileY: number, dir: Direction): boolean {
    let nextX = tileX;
    let nextY = tileY;

    if (dir === "up") nextY--;
    else if (dir === "down") nextY++;
    else if (dir === "left") nextX--;
    else if (dir === "right") nextX++;

    // Check for side walls outside normal range (columns -2, -1, >= MAZE_COLS + 1)
    // These are always walls (but allow wrapping for -1 and MAZE_COLS)
    if (nextX < -1 || nextX > CONFIG.MAZE_COLS) {
      return false;
    }

    // Handle wrapping for normal playable area
    // Wrap -1 to MAZE_COLS - 1, and MAZE_COLS to 0
    if (nextX === -1) nextX = CONFIG.MAZE_COLS - 1;
    else if (nextX === CONFIG.MAZE_COLS) nextX = 0;
    else if (nextX < 0) nextX = CONFIG.MAZE_COLS - 1;
    else if (nextX >= CONFIG.MAZE_COLS) nextX = 0;

    const t = this.getTileType(nextX, nextY);
    return t !== "wall" && t !== "empty";
  }

  private calculateDashEnd(
    tileX: number,
    tileY: number,
    dir: Direction,
  ): DashEnd {
    let currentTileX = tileX;
    let currentTileY = tileY;
    let endTileX = tileX;
    let endTileY = tileY;

    let hitWall = false;

    let steps = 0;
    const MAX_DASH_STEPS = 500; // Safety limit for a single dash

    while (this.canMove(currentTileX, currentTileY, dir)) {
      steps++;
      if (steps > MAX_DASH_STEPS) {
        console.log(
          "[DashBroGame] calculateDashEnd: Max dash steps reached, stopping",
        );
        hitWall = true;
        break;
      }

      let nextTileX = currentTileX;
      let nextTileY = currentTileY;

      if (dir === "up") {
        nextTileY--;
      } else if (dir === "down") {
        nextTileY++;
      } else if (dir === "left") {
        nextTileX--;
        if (nextTileX < 0) nextTileX = CONFIG.MAZE_COLS - 1;
      } else if (dir === "right") {
        nextTileX++;
        if (nextTileX >= CONFIG.MAZE_COLS) nextTileX = 0;
      }

      const nextType = this.getTileType(nextTileX, nextTileY);
      if (nextType === "wall") {
        hitWall = true;
        break;
      }

      endTileX = nextTileX;
      endTileY = nextTileY;
      currentTileX = nextTileX;
      currentTileY = nextTileY;
    }

    if (this.getTileType(endTileX, endTileY) === "wall") {
      endTileX = tileX;
      endTileY = tileY;
    }

    const tileSize = CONFIG.TILE_SIZE;
    const spacing = CONFIG.TILE_SPACING;

    // Ensure tileX is wrapped to valid range before calculating pixel position
    const wrappedTileX = this.wrapX(endTileX);

    return {
      tileX: wrappedTileX,
      tileY: endTileY,
      x: Math.round(wrappedTileX * (tileSize + spacing) + tileSize / 2),
      y: Math.round(endTileY * (tileSize + spacing) + tileSize / 2),
      hitWall,
      steps: Math.max(0, steps),
    };
  }

  private ensureRowsForView(): void {
    const tileSize = CONFIG.TILE_SIZE;
    const zoom = CONFIG.ZOOM;
    const viewY0 = this.cameraY;
    const viewY1 = viewY0 + this.viewH() / zoom;
    const row0 = Math.floor(viewY0 / tileSize) - 5;
    const row1 = Math.floor(viewY1 / tileSize) + 5;

    // Pre-generate chunks above the visible window so fast upward movement
    // does not trigger synchronous chunk generation on the same frame.
    const topChunkId = this.getChunkIdForRow(row0);
    for (let i = 0; i <= CONFIG.CHUNK_PRELOAD_AHEAD; i++) {
      this.activateChunk(topChunkId - i);
    }

    for (let ry = row0; ry <= row1; ry++) {
      this.ensureRow(ry);
    }

    this.minRowCached = Math.min(this.minRowCached, row0);
    this.maxRowCached = Math.max(this.maxRowCached, row1);
  }

  private pruneChunksBehindCamera(dt: number): void {
    const playerChunkId = this.getChunkIdForRow(this.playerTileY);
    if (playerChunkId !== this.currentPlayerChunkId) {
      this.currentPlayerChunkId = playerChunkId;
      this.activateChunk(playerChunkId - 1);
    }
    for (let i = 0; i <= CONFIG.CHUNK_PRELOAD_AHEAD; i++) {
      this.activateChunk(playerChunkId - i);
    }

    // Never delete chunks before the fireball has spawned.
    // Also clear any stale timers so they don't fire the moment the fireball appears.
    if (!this.doppelgangerActive) {
      this.currentChaserChunkId = null;
      this.occupiedChaserChunkIds.clear();
      this.chaserChunkReleaseTimers.clear();
      return;
    }

    const nextOccupied = new Set<number>();
    const chaserCenterY = this.doppelgangerY + CONFIG.TILE_SIZE * 0.5;
    const chaserRadius = CONFIG.PLAYER_BODY * 0.8;
    const minRow = Math.floor(
      (chaserCenterY - chaserRadius) / CONFIG.TILE_SIZE,
    );
    const maxRow = Math.floor(
      (chaserCenterY + chaserRadius) / CONFIG.TILE_SIZE,
    );

    for (let row = minRow; row <= maxRow; row++) {
      nextOccupied.add(this.getChunkIdForRow(row));
    }
    // Also protect the logic tile while interpolation is catching up.
    nextOccupied.add(this.getChunkIdForRow(this.doppelgangerTileY));
    // Also protect the player's current chunk and a buffer around it —
    // these must never be pruned regardless of fireball position.
    for (let i = -1; i <= 3; i++) {
      nextOccupied.add(playerChunkId + i);
    }

    for (const prevChunkId of this.occupiedChaserChunkIds) {
      if (!nextOccupied.has(prevChunkId)) {
        // Chunk becomes removable 1s after fireball leaves it.
        this.chaserChunkReleaseTimers.set(prevChunkId, 1.0);
      }
    }
    // If fireball re-enters a chunk (or it's near player), cancel its pending removal.
    for (const occupiedId of nextOccupied) {
      this.chaserChunkReleaseTimers.delete(occupiedId);
    }

    this.occupiedChaserChunkIds = nextOccupied;
    const visualChaserRow = Math.floor(chaserCenterY / CONFIG.TILE_SIZE);
    this.currentChaserChunkId = this.getChunkIdForRow(visualChaserRow);

    for (const [chunkId, timeLeft] of Array.from(
      this.chaserChunkReleaseTimers.entries(),
    )) {
      const next = timeLeft - dt;
      if (next <= 0) {
        this.chaserChunkReleaseTimers.delete(chunkId);
        // Final safety: never prune a chunk that is within 3 chunks of the player.
        const isSafelyBehindPlayer = chunkId > playerChunkId + 3;
        if (!this.occupiedChaserChunkIds.has(chunkId) && isSafelyBehindPlayer) {
          this.pruneSingleChunk(chunkId);
        }
      } else {
        this.chaserChunkReleaseTimers.set(chunkId, next);
      }
    }
  }

  private updateCamera(dt: number): void {
    const zoom = CONFIG.ZOOM;
    // Viewport dimensions in world coordinates (after zoom is applied)
    const viewW = this.viewW() / zoom;
    const viewH = this.viewH() / zoom;

    // Always center the player in the view (camera position is in world coordinates)
    const targetCameraX = this.playerX - viewW * 0.5;
    const targetCameraY = this.playerY - viewH * 0.5;
    const nowS = performance.now() * 0.001;
    this.cameraFollowHistory.push({
      t: nowS,
      x: targetCameraX,
      y: targetCameraY,
    });

    // Keep a small rolling window of targets.
    const historyWindow = 0.8;
    while (
      this.cameraFollowHistory.length > 1 &&
      nowS - this.cameraFollowHistory[0].t > historyWindow
    ) {
      this.cameraFollowHistory.shift();
    }

    // During a dash, skip the follow delay entirely so the camera immediately
    // targets the current player position. Without this, the 50ms delay causes
    // the camera to freeze for ~3 frames at the start of every dash.
    const followDelay = this.dashFlash
      ? 0
      : this.isMobile
        ? 0
        : CONFIG.CAMERA_FOLLOW_DELAY_S;
    const delayedTime = nowS - followDelay;
    let delayedTargetX = targetCameraX;
    let delayedTargetY = targetCameraY;
    if (followDelay > 0) {
      // Only use the history buffer when there is an actual delay to look up.
      delayedTargetX = this.cameraX;
      delayedTargetY = this.cameraY;
      if (
        this.cameraFollowHistory.length > 0 &&
        this.cameraFollowHistory[0].t <= delayedTime
      ) {
        const last =
          this.cameraFollowHistory[this.cameraFollowHistory.length - 1];
        if (delayedTime >= last.t) {
          delayedTargetX = last.x;
          delayedTargetY = last.y;
        } else {
          for (let i = 1; i < this.cameraFollowHistory.length; i++) {
            const prev = this.cameraFollowHistory[i - 1];
            const next = this.cameraFollowHistory[i];
            if (delayedTime >= prev.t && delayedTime <= next.t) {
              const span = Math.max(1e-6, next.t - prev.t);
              const a = (delayedTime - prev.t) / span;
              delayedTargetX = prev.x + (next.x - prev.x) * a;
              delayedTargetY = prev.y + (next.y - prev.y) * a;
              break;
            }
          }
        }
      }
    }

    // Smoothly transition followHz instead of an abrupt binary switch.
    // Abrupt 5.5→12 jumps caused a visible camera snap/fling at dash start/end.
    const targetHz = this.dashFlash ? 14 : 9;
    const hzLerpSpeed = this.dashFlash ? 30 : 12; // fast ramp-up, gentle ramp-down
    this.cameraFollowHz +=
      (targetHz - this.cameraFollowHz) * Math.min(1, hzLerpSpeed * dt);

    const cameraLerp = 1 - Math.exp(-this.cameraFollowHz * dt);

    // Update camera to center player
    this.cameraX += (delayedTargetX - this.cameraX) * cameraLerp;
    this.cameraY += (delayedTargetY - this.cameraY) * cameraLerp;

    // Snap to 0.5px grid to prevent sub-pixel jitter
    this.cameraX = Math.round(this.cameraX * 2) / 2;
    this.cameraY = Math.round(this.cameraY * 2) / 2;
  }

  private updateWater(dt: number): void {
    const timeS = performance.now() * 0.001;
    if (this.firstPlayerMoveAtS === null) return;

    const sandSpawnDelayS = 5;
    if (timeS < this.firstPlayerMoveAtS + sandSpawnDelayS) return;

    const preMoveSurfaceY = sandDuneY(this.waterSurfaceY, this.playerX, timeS);
    const playerChunkId = this.getChunkIdForRow(this.playerTileY);
    const waterRow = Math.floor(preMoveSurfaceY / CONFIG.TILE_SIZE);
    const waterChunkId = this.getChunkIdForRow(waterRow);
    const chunkGap = waterChunkId - playerChunkId;

    let riseMultiplier = CONFIG.WATER_RISE_BASE_MULTIPLIER;
    if (chunkGap >= CONFIG.WATER_RISE_CATCHUP_CHUNK_GAP) {
      riseMultiplier *= CONFIG.WATER_RISE_CATCHUP_MULTIPLIER;
    }

    const riseSlowdownFactor = 1.3;
    this.waterSurfaceY -=
      (CONFIG.WATER_RISE_PX_PER_S * riseMultiplier * dt) / riseSlowdownFactor;
    const localSurfaceY = sandDuneY(this.waterSurfaceY, this.playerX, timeS);

    const r =
      CONFIG.PLAYER_BODY * CONFIG.WATER_COLLISION_RADIUS_MUL +
      CONFIG.WATER_COLLISION_PADDING_PX;
    if (this.playerY + r >= localSurfaceY && this.state === "PLAYING") {
      // Start death animation
      this.state = "DYING";
      this.deathTimer = 0;
      this.audio.click("death_water");
      this.triggerHaptic("error");

      // Spawn death particles
      this.spawnDeathParticles(this.playerX, this.playerY);
    }
  }

  private updatePlayer(dt: number): void {
    const tileSize = CONFIG.TILE_SIZE;

    // Only generate trail when moving
    if (this.isMoving || this.dashFlash) {
      this.trailTimer += dt;
      if (this.trailTimer >= CONFIG.TRAIL_INTERVAL) {
        this.trailTimer = 0;

        // Calculate trail start position from player's back (opposite of direction)
        let backOffsetX = 0;
        let backOffsetY = 0;
        const backOffset = CONFIG.PLAYER_BODY * 0.4; // Offset from center to back
        if (this.playerDirection === "right") {
          backOffsetX = -backOffset;
        } else if (this.playerDirection === "left") {
          backOffsetX = backOffset;
        } else if (this.playerDirection === "up") {
          backOffsetY = backOffset;
        } else if (this.playerDirection === "down") {
          backOffsetY = -backOffset;
        }

        this.trail.push({
          x: this.playerX + backOffsetX,
          y: this.playerY + backOffsetY,
          z: 0,
          alpha: 1.0,
          size: Math.max(8, Math.floor(CONFIG.PLAYER_BODY * 0.55)),
        });

        if (this.trail.length > CONFIG.TRAIL_COUNT) {
          this.trail.shift();
        }
      }
    } else {
      // Clear trail when not moving
      this.trail = [];
    }

    // Fade trail points over time
    const fadeRate = dt / CONFIG.TRAIL_DURATION;
    for (const point of this.trail) {
      point.alpha -= fadeRate;
      point.size *= 0.995; // Slower size decay for longer trail
    }
    this.trail = this.trail.filter((p) => p.alpha > 0.01);

    // Update screen shake
    this.shakeIntensity = Math.max(
      0,
      this.shakeIntensity - this.shakeDecay * dt,
    );
    // Use a deterministic pseudo-random function based on time to avoid Math.random() in render loop
    const timeMs = performance.now();
    this.shakeX = Math.sin(timeMs * 0.05) * this.shakeIntensity;
    this.shakeY = Math.cos(timeMs * 0.04) * this.shakeIntensity;

    // Update wall hit bounce
    if (this.wallHitBounce > 0) {
      this.wallHitBounce = Math.max(
        0,
        this.wallHitBounce - dt / CONFIG.WALL_HIT_BOUNCE_DURATION,
      );
    }

    if (this.dashFlash) {
      this.dashFlash.elapsed += dt;
      this.dashFlash.progress = Math.min(
        1,
        this.dashFlash.elapsed / this.dashFlash.duration,
      );

      // Smoothly lerp player position during dash
      let targetX = this.dashFlash.endX;
      let targetY = this.dashFlash.endY;

      if (this.dashFlash.hitWall) {
        const spacing = CONFIG.TILE_SPACING;
        const cellLeft = this.playerTileX * (tileSize + spacing);
        const cellRight = (this.playerTileX + 1) * (tileSize + spacing);
        const cellTop = this.playerTileY * (tileSize + spacing);
        const cellBottom = (this.playerTileY + 1) * (tileSize + spacing);

        if (this.playerDirection === "right") {
          targetX = cellRight;
        } else if (this.playerDirection === "left") {
          targetX = cellLeft;
        } else if (this.playerDirection === "down") {
          targetY = cellBottom;
        } else if (this.playerDirection === "up") {
          targetY = cellTop;
        }

        // Trigger wall hit effects
        if (this.dashFlash.progress >= 0.95 && this.wallHitBounce === 0) {
          this.shakeIntensity = CONFIG.WALL_HIT_SHAKE;
          this.wallHitBounce = 1.0;
          this.wallHitDirection = this.playerDirection;
          this.triggerHaptic("heavy");
        }
      }

      // Smoothstep easing: slow start and end, fast middle.
      const t = this.dashFlash.progress;
      const easedProgress = 1 - (1 - t) * (1 - t);

      this.playerX =
        this.dashFlash.startX +
        (targetX - this.dashFlash.startX) * easedProgress;
      this.playerY =
        this.dashFlash.startY +
        (targetY - this.dashFlash.startY) * easedProgress;

      if (
        this.pendingTrapDeath &&
        this.state === "PLAYING" &&
        easedProgress >= this.pendingTrapDeath.progressFraction
      ) {
        const trap = this.pendingTrapDeath;
        this.pendingTrapDeath = null;
        this.state = "DYING";
        this.deathTimer = 0;
        this.audio.click("death_spike");
        this.triggerHaptic("error");
        
        // Snap exactly to the trap center
        const spacing = CONFIG.TILE_SPACING;
        const trapPx = trap.tileX * (CONFIG.TILE_SIZE + spacing) + CONFIG.TILE_SIZE / 2;
        const trapPy = trap.tileY * (CONFIG.TILE_SIZE + spacing) + CONFIG.TILE_SIZE / 2;
        this.playerX = trapPx;
        this.playerY = trapPy;
        
        this.spawnDeathParticles(trapPx, trapPy);
        this.dashFlash = null;
        this.isMoving = false;
        this.playerTileX = trap.tileX;
        this.playerTileY = trap.tileY;
      }

      if (this.dashFlash && this.dashFlash.progress >= 1) {
        // Snap to final position when complete
        this.playerX = targetX;
        this.playerY = targetY;

        // Spawn landing particles
        this.spawnLandingParticles(this.playerX, this.playerY);

        this.dashFlash = null;
        this.isMoving = false;
      } else if (this.dashFlash) {
        // Spawn dash particles during dash
        const dashParticleChance = this.isMobile ? 0.08 : 0.3;
        const timeMs = performance.now();
        const pseudoRandom = (Math.sin(timeMs * 0.1) * 0.5 + 0.5);
        if (pseudoRandom < dashParticleChance) {
          this.spawnDashParticles(
            this.playerX,
            this.playerY,
            this.playerDirection,
          );
        }
      }
    }

    const spacing = CONFIG.TILE_SPACING;
    const centerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    const centerY = this.playerTileY * (tileSize + spacing) + tileSize / 2;
    const distToCenter = Math.sqrt(
      (this.playerX - centerX) ** 2 + (this.playerY - centerY) ** 2,
    );
    const isStopped = !this.isMoving && !this.dashFlash && distToCenter < 2;

    if (
      isStopped &&
      this.nextDirection &&
      this.nextDirection !== this.playerDirection
    ) {
      if (
        this.canMove(this.playerTileX, this.playerTileY, this.nextDirection)
      ) {
        const dashEnd = this.calculateDashEnd(
          this.playerTileX,
          this.playerTileY,
          this.nextDirection,
        );

        // Calculate cloth start position (from player's back, opposite of direction)
        let clothOffsetX = 0;
        let clothOffsetY = 0;
        if (this.nextDirection === "right") {
          clothOffsetX = -CONFIG.PLAYER_BODY * 0.4; // Back of player
        } else if (this.nextDirection === "left") {
          clothOffsetX = CONFIG.PLAYER_BODY * 0.4;
        } else if (this.nextDirection === "down") {
          clothOffsetY = -CONFIG.PLAYER_BODY * 0.4;
        } else if (this.nextDirection === "up") {
          clothOffsetY = CONFIG.PLAYER_BODY * 0.4;
        }

        this.dashFlash = {
          startX: this.playerX,
          startY: this.playerY,
          endX: dashEnd.x,
          endY: dashEnd.y,
          progress: 0,
          duration: Math.max(
            0.08,
            (dashEnd.steps * CONFIG.TILE_SIZE) /
              (CONFIG.DASH_SPEED_PX_PER_S * this.speedMultiplier),
          ),
          elapsed: 0,
          hitWall: dashEnd.hitWall,
          clothStartX: this.playerX + clothOffsetX,
          clothStartY: this.playerY + clothOffsetY,
        };

        this.audio.playSwooshSound();

        this.playerDirection = this.nextDirection;
        this.playerTileX = dashEnd.tileX;
        this.playerTileY = dashEnd.tileY;
        this.isMoving = true;
        if (this.firstPlayerMoveAtS === null) {
          this.firstPlayerMoveAtS = performance.now() * 0.001;
          this.tutorialOverlay?.classList.add("uiHidden");
        }

        // Spawn initial dash particles
        this.spawnDashParticles(this.playerX, this.playerY, this.nextDirection);

        const originalTileX = Math.floor(this.dashFlash.startX / tileSize);
        const originalTileY = Math.floor(this.dashFlash.startY / tileSize);

        let origX = originalTileX;
        if (origX < 0) origX = CONFIG.MAZE_COLS - 1;
        if (origX >= CONFIG.MAZE_COLS) origX = 0;

        const dir = this.nextDirection;
        let currentX = origX;
        let currentY = originalTileY;

        const endX = dashEnd.tileX;
        const endY = dashEnd.tileY;
        let collectedDots = 0;
        let collectedPowerLikeItems = 0;
        let playedDedicatedSfx = false;
        let pathStep = 0;
        const totalSteps = dashEnd.steps;
        this.pendingTrapDeath = null;

        while (currentX !== endX || currentY !== endY) {
          const t = this.getTileType(currentX, currentY);
          if (t === "trap" && this.state === "PLAYING" && !this.pendingTrapDeath) {
            const cycle = (performance.now() * 0.001) % 3.75;
            const isRed = cycle > 3.0;
            if (isRed) {
              this.pendingTrapDeath = {
                tileX: currentX,
                tileY: currentY,
                progressFraction: totalSteps > 0 ? (pathStep + 0.5) / totalSteps : 0, // +0.5 to trigger when actually ON the tile
                type: "trap",
              };
            }
          }
          if (t === "dot") {
            this.score += 10;
            this.setTileType(currentX, currentY, "visited");
            collectedDots++;
          } else if (t === "power") {
            this.score += 50;
            this.setTileType(currentX, currentY, "visited");
            collectedPowerLikeItems++;
          } else if (t === "speed_boost") {
            this.score += 20;
            this.setTileType(currentX, currentY, "visited");
            this.speedMultiplier = 2.0;
            this.speedEffectTimer = 5.0;
            const burstScale =
              (CONFIG.PLAYER_BODY * 2.5) /
              (this.lightningBurstSprite?.naturalHeight || 64);
            this.spawnActiveSpriteEffect(
              this.playerX,
              this.playerY,
              this.lightningBurstSprite,
              8,
              20,
              burstScale,
            );
            collectedPowerLikeItems++;
          } else if (t === "portal") {
            this.score += 20;
            this.setTileType(currentX, currentY, "visited");
            collectedPowerLikeItems++;
          }

          pathStep++;
          if (dir === "up") currentY--;
          else if (dir === "down") currentY++;
          else if (dir === "left") {
            currentX--;
            if (currentX < 0) currentX = CONFIG.MAZE_COLS - 1;
          } else if (dir === "right") {
            currentX++;
            if (currentX >= CONFIG.MAZE_COLS) currentX = 0;
          }
        }

        // Process landing tile (end of dash)
        const landTile = this.getTileType(endX, endY);
        if (landTile === "dot") {
          this.score += 10;
          this.setTileType(endX, endY, "visited");
          collectedDots++;
        } else if (landTile === "power") {
          this.score += 50;
          this.setTileType(endX, endY, "visited");
          collectedPowerLikeItems++;
        } else if (landTile === "portal") {
          this.score += 20;
          this.setTileType(endX, endY, "visited");
          const dest = this.findTeleportDestination(
            endX,
            endY,
            this.playerDirection,
          );
          if (dest) {
            this.pendingTeleport = dest;
            this.nextDirection = null;
            this.teleportBtn?.classList.remove("hidden");
          }
          playedDedicatedSfx = true;
          collectedPowerLikeItems++;
        } else if (landTile === "speed_boost") {
          this.score += 20;
          this.setTileType(endX, endY, "visited");
          this.speedMultiplier = 2.0;
          this.speedEffectTimer = 5.0;
          const burstScale =
            (CONFIG.PLAYER_BODY * 2.5) /
            (this.lightningBurstSprite?.naturalHeight || 64);
          this.spawnActiveSpriteEffect(
            this.playerX,
            this.playerY,
            this.lightningBurstSprite,
            8,
            20,
            burstScale,
          );
          collectedPowerLikeItems++;
        }

        // Batch pickup feedback - skip if a dedicated SFX (lightning/portal) already played
        if (this.state === "PLAYING" && !playedDedicatedSfx) {
          if (collectedPowerLikeItems > 0) {
            this.audio.click("power");
            this.triggerHaptic("medium");
          } else if (collectedDots > 0) {
            this.audio.click("dot");
            this.triggerHaptic("light");
          }
        } else if (this.state === "PLAYING" && playedDedicatedSfx) {
          if (collectedDots > 0) {
            this.triggerHaptic("light");
          }
        }
      }
      this.nextDirection = null;
    }

    // Check for trap collision (Time-based trap)
    const currentTile = this.getTileType(this.playerTileX, this.playerTileY);
    if (currentTile === "trap" && this.state === "PLAYING") {
      const time = performance.now() * 0.001;
      const cycle = time % 3.75;
      // Green: 0-3s, Red: 3-3.75s (shorter red phase)
      const isRed = cycle > 3.0;

      if (isRed) {
        // Die
        this.state = "DYING";
        this.deathTimer = 0;
        this.audio.click("death_spike");
        this.triggerHaptic("error");
        this.spawnDeathParticles(this.playerX, this.playerY);
      }
    }

    // Check for corner_trap collision
    if (currentTile === "corner_trap" && this.state === "PLAYING") {
      const key = `${this.playerTileX},${this.playerTileY}`;
      const now = performance.now() * 0.001;

      if (!this.activeTraps.has(key)) {
        this.activeTraps.set(key, now);
        // Trigger sound
        this.audio.click("power");
      }
    }
  }

  private updateTraps(time: number) {
    const toRemove: string[] = [];
    for (const [key, triggeredTime] of this.activeTraps.entries()) {
      if (time - triggeredTime > 2.0) {
        toRemove.push(key);
        const [tx, ty] = key.split(",").map(Number);

        // Explosion effect
        const px = tx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        const py = ty * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        this.spawnDeathParticles(px, py);
        // this.audio.click("explosion"); // Assuming sound exists or use death

        if (
          this.playerTileX === tx &&
          this.playerTileY === ty &&
          this.state === "PLAYING"
        ) {
          this.state = "DYING";
          this.deathTimer = 0;
          this.audio.click("death_explosion");
          this.triggerHaptic("error");
        }
      }
    }
    for (const key of toRemove) this.activeTraps.delete(key);
  }

  private update(dt: number): void {
    if (this.state === "DYING") {
      this.perfMeasure("update.updateDeathAnimation", () =>
        this.updateDeathAnimation(dt),
      );
      this.perfMeasure("update.updateParticles", () =>
        this.updateParticles(dt),
      );
      this.perfMeasure("update.updateCamera", () => this.updateCamera(dt));
      return;
    }

    if (this.state === "CAUGHT") {
      this.caughtTimer += dt;

      // Freeze everything! No movement, no particle updates.
      // Just wait for the timer to finish.

      if (this.caughtTimer >= this.caughtDuration) {
        this.state = "DYING"; // Proceed to death animation
        this.lives = 0; // Ensure 0 lives
        this.gameOver();
      }
      return;
    }

    if (this.state !== "PLAYING") return;

    if (this.speedEffectTimer > 0) {
      this.speedEffectTimer -= dt;
      if (this.speedEffectTimer <= 0) {
        this.speedMultiplier = 1.0;
      }
    }

    this.perfMeasure("update.ensureRowsForView", () =>
      this.ensureRowsForView(),
    );
    this.perfMeasure("update.updateWater", () => this.updateWater(dt)); // Rising sand dunes
    this.perfMeasure("update.updatePlayer", () => this.updatePlayer(dt));
    this.perfMeasure("update.updateBackgroundParticles", () =>
      this.updateBackgroundParticles(dt),
    );
    this.perfMeasure("update.updateDashSpeedLines", () =>
      this.updateDashSpeedLines(dt),
    );
    this.perfMeasure("update.updateTraps", () =>
      this.updateTraps(performance.now() * 0.001),
    );

    this.perfMeasure("update.doppelganger", () => {
      if (!CONFIG.ENABLE_CHASER) {
        this.doppelgangerActive = false;
        return;
      }
      // Doppelganger logic
      // Activate with delay after player reaches minimum distance.
      if (!this.doppelgangerActive) {
        const distanceFromSpawn = Math.abs(
          this.playerTileY - this.playerSpawnY,
        );
        if (distanceFromSpawn >= CONFIG.CHASER_SPAWN_DISTANCE_TILES) {
          this.doppelgangerSpawnTimer += dt;
          if (this.doppelgangerSpawnTimer >= CONFIG.CHASER_SPAWN_DELAY_S) {
            this.doppelgangerActive = true;
            // Spawn below player
            this.doppelgangerTileX = this.playerSpawnX;
            this.doppelgangerTileY = this.playerSpawnY;
            this.doppelgangerX = this.doppelgangerTileX * CONFIG.TILE_SIZE;
            this.doppelgangerY = this.doppelgangerTileY * CONFIG.TILE_SIZE;
          }
        }
      }

      if (this.doppelgangerActive) {
        // Doppelganger dash logic
        // Moves like the player: chooses a direction and dashes until hitting a wall

        // Interpolate visual position for smooth movement during dash
        const targetX = this.doppelgangerTileX * CONFIG.TILE_SIZE;
        const targetY = this.doppelgangerTileY * CONFIG.TILE_SIZE;
        const playerChunkId = this.getChunkIdForRow(this.playerTileY);
        const chaserVisualRow = Math.floor(
          (this.doppelgangerY + CONFIG.TILE_SIZE * 0.5) / CONFIG.TILE_SIZE,
        );
        const chaserChunkId = this.getChunkIdForRow(chaserVisualRow);
        const chunksBehindPlayer = chaserChunkId - playerChunkId;
        const chunkSpeedBoost = chunksBehindPlayer > 1 ? 5 : 1;

        // 5x catch-up until chaser reaches within 1 chunk behind the player.
        // Use exponential smoothing (never exceeds factor 1, no overshoot at low FPS).
        const dopLerp = 1 - Math.exp(-15 * chunkSpeedBoost * dt);
        this.doppelgangerX += (targetX - this.doppelgangerX) * dopLerp;
        this.doppelgangerY += (targetY - this.doppelgangerY) * dopLerp;
        this.doppelgangerTrail.push({
          x: this.doppelgangerX + CONFIG.TILE_SIZE / 2,
          y: this.doppelgangerY + CONFIG.TILE_SIZE / 2,
          z: 0,
          alpha: 0.9,
          size: CONFIG.TILE_SIZE * (0.35 + Math.random() * 0.35),
        });

        // Check if visually arrived at target (or close enough) to start next move
        const distSq =
          (this.doppelgangerX - targetX) ** 2 +
          (this.doppelgangerY - targetY) ** 2;
        const arrived = distSq < 4; // 2 pixels threshold

        if (arrived) {
          this.doppelgangerX = targetX;
          this.doppelgangerY = targetY;

          this.doppelgangerMoveTimer += dt;

          // Wait before next dash; speed scales dash cadence.
          const dashInterval =
            (0.4 * 1.5) /
            Math.max(0.2, this.doppelgangerMoveSpeed * chunkSpeedBoost);
          if (this.doppelgangerMoveTimer > dashInterval) {
            this.doppelgangerMoveTimer = 0;

            // Choose next dash direction
            // 1. Calculate possible dash end points for all 4 directions
            // 2. Choose the one that gets closest to player (Manhattan distance)
            const directions: Direction[] = ["up", "down", "left", "right"];
            let bestDir: Direction | null = null;
            let minDistance = Number.MAX_VALUE;

            // Randomize order to break ties unpredictably
            directions.sort(() => Math.random() - 0.5);

            for (const dir of directions) {
              // Check if can move at all in this direction
              if (
                !this.canMove(
                  this.doppelgangerTileX,
                  this.doppelgangerTileY,
                  dir,
                )
              )
                continue;

              // Simulate dash to find end point
              const endPos = this.calculateDashEnd(
                this.doppelgangerTileX,
                this.doppelgangerTileY,
                dir,
              );

              // Calculate distance from end point to player
              const dx = Math.abs(endPos.tileX - this.playerTileX);
              // Heavily weight vertical distance to prioritize catching up in Y
              // Also add a massive bonus for actually moving upwards (decreasing Y) to prevent getting stuck
              const dy = endPos.tileY - this.playerTileY; // relative Y difference (negative means we are above player)

              // Cost function: minimized
              // base distance + huge penalty for being below player (positive dy)
              let cost = dx + Math.abs(dy) * 2.0;

              // Extra incentive to move UP if we are below the player
              if (endPos.tileY < this.doppelgangerTileY) {
                cost -= 20; // Huge bonus for moving UP
              }

              // Penalty for moving DOWN if we are already below player
              if (
                endPos.tileY > this.doppelgangerTileY &&
                this.doppelgangerTileY > this.playerTileY
              ) {
                cost += 50; // Huge penalty
              }

              if (cost < minDistance) {
                minDistance = cost;
                bestDir = dir;
              }
            }

            if (bestDir) {
              this.doppelgangerDirection = bestDir;
              const dashEnd = this.calculateDashEnd(
                this.doppelgangerTileX,
                this.doppelgangerTileY,
                bestDir,
              );

              // Add trail from start to end
              // We'll add a few trail points along the path
              const dx = dashEnd.tileX - this.doppelgangerTileX;
              const dy = dashEnd.tileY - this.doppelgangerTileY;
              const steps = Math.max(Math.abs(dx), Math.abs(dy));

              for (let i = 0; i <= steps; i += 2) {
                // Add trail point every 2 tiles
                this.doppelgangerTrail.push({
                  x:
                    (this.doppelgangerTileX + (dx * i) / steps) *
                      CONFIG.TILE_SIZE +
                    CONFIG.TILE_SIZE / 2,
                  y:
                    (this.doppelgangerTileY + (dy * i) / steps) *
                      CONFIG.TILE_SIZE +
                    CONFIG.TILE_SIZE / 2,
                  z: 0,
                  alpha: 1.0,
                  size: CONFIG.TILE_SIZE * 0.8,
                });
              }
              if (this.doppelgangerTrail.length > 36)
                this.doppelgangerTrail.splice(
                  0,
                  this.doppelgangerTrail.length - 36,
                );

              // Instantly update logic position (visuals will catch up)
              this.doppelgangerTileX = dashEnd.tileX;
              this.doppelgangerTileY = dashEnd.tileY;
            }
          }
        }

        // Update trail alpha
        for (const t of this.doppelgangerTrail) {
          t.alpha -= dt * 2.6;
          t.size *= 0.985;
        }
        this.doppelgangerTrail = this.doppelgangerTrail.filter(
          (t) => t.alpha > 0,
        );
        if (this.doppelgangerTrail.length > 36)
          this.doppelgangerTrail.splice(0, this.doppelgangerTrail.length - 36);

        // Check collision with player
        // Check both tile overlap and visual overlap (for mid-dash collisions)
        const visualDist = Math.sqrt(
          (this.playerX - this.doppelgangerX) ** 2 +
            (this.playerY - this.doppelgangerY) ** 2,
        );
        if (
          (this.playerTileX === this.doppelgangerTileX &&
            this.playerTileY === this.doppelgangerTileY) ||
          visualDist < CONFIG.PLAYER_BODY
        ) {
          this.lives = 0; // Set lives to 0 so we die after caught
          this.state = "CAUGHT";
          this.caughtTimer = 0;
          this.audio.click("death_caught");
          this.triggerHaptic("error");
        }
      }

      // Ramp up doppelganger speed over time (difficulty curve)
      if (this.doppelgangerActive) {
        // Increase cadence multiplier slightly every second.
        this.doppelgangerMoveSpeed += dt * 0.05;
        // Cap at something scary but playable? Or unlimited?
        // Let's cap at 3.0
        if (this.doppelgangerMoveSpeed > 3.0) this.doppelgangerMoveSpeed = 3.0;
      }
    });

    this.perfMeasure("update.updateParticles", () => this.updateParticles(dt));

    this.perfMeasure("update.updateCamera", () => this.updateCamera(dt));
    this.perfMeasure("update.pruneChunksBehindCamera", () =>
      this.pruneChunksBehindCamera(dt),
    );
  }

  private resetGame(): void {
    this.audio.resetNoteSequence();
    this.sandSlowPhaseStartS = performance.now() * 0.001;
    this.firstPlayerMoveAtS = null;
    this.pendingTeleport = null;
    this.pendingTrapDeath = null;
    this.teleportBtn?.classList.add("hidden");
    this.rows.clear();
    this.activeTraps.clear();
    this.spineXByRow.clear();
    this.chunkCache.clear();
    this.chunkWidthFactor.clear();
    this.sideWallSpawnsByRow.clear();
    this.chunkTemplateByChunkId.clear();
    this.activeChunkIds.clear();
    this.currentChaserChunkId = null;
    this.occupiedChaserChunkIds.clear();
    this.chaserChunkReleaseTimers.clear();
    this.recycledChunkTemplatesByEntry.clear();
    this.recycledChunkTemplateCount = 0;
    this.minRowCached = 0;
    this.maxRowCached = 0;
    this.globalSeed = (Math.random() * 1e9) | 0;

    // Ensure player spawns above a platform (on top of it)
    const tileSize = CONFIG.TILE_SIZE;
    // Spawn on the spawn row, which should be on top of a platform
    this.playerTileY = this.playerSpawnY;
    this.seedInitialChunks();

    // Find an open tile in the spawn row that has a wall below it (platform)
    const spawnRow = this.ensureRow(this.playerTileY);
    const platformRow = this.ensureRow(this.playerSpawnY + 1); // Row below (the platform)
    let spawnX = this.playerSpawnX;

    // FIRST PASS: Try to find a perfect spot (dot above wall)
    let bestX = -1;
    for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
      if (spawnRow[x] === "dot" && platformRow[x] === "wall") {
        bestX = x;
        break;
      }
    }

    // SECOND PASS: If no perfect spot, just find ANY dot
    if (bestX === -1) {
      for (let x = 0; x < CONFIG.MAZE_COLS; x++) {
        if (spawnRow[x] === "dot") {
          bestX = x;
          break;
        }
      }
    }

    // THIRD PASS: If still nothing, force a spot at center
    if (bestX === -1) {
      bestX = Math.floor(CONFIG.MAZE_COLS / 2);
      spawnRow[bestX] = "dot";
      platformRow[bestX] = "wall";
    }

    // Apply the best X found
    spawnX = bestX;

    // Ensure spawnX is within valid grid bounds
    this.playerTileX = this.wrapX(spawnX);
    const spacing = CONFIG.TILE_SPACING;
    this.playerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    this.playerY = this.playerTileY * (tileSize + spacing) + tileSize / 2;

    // Double-check player is within grid bounds
    if (this.playerTileX < 0 || this.playerTileX >= CONFIG.MAZE_COLS) {
      this.playerTileX = Math.floor(CONFIG.MAZE_COLS / 2);
      this.playerX = this.playerTileX * (tileSize + spacing) + tileSize / 2;
    }
    this.playerDirection = "down"; // Normal rotation (0 degrees for idle sprite)
    this.nextDirection = null;
    this.currentPlayerChunkId = this.getChunkIdForRow(this.playerTileY);
    this.trail = [];
    this.trailTimer = 0;
    this.isMoving = false;
    this.dashFlash = null;
    this.particles = []; // Clear particles on reset
    this.deathParticles = []; // Clear death particles on reset
    this.deathTimer = 0;

    // Sand starts from the bottom of the viewport
    this.waterSurfaceY = this.viewH() + 100; // Start below the visible area
    this.score = 0;

    // Initialize camera to center on player
    const zoom = CONFIG.ZOOM;
    const viewW = this.viewW() / zoom;
    const viewH = this.viewH() / zoom;
    this.cameraX = this.playerX - viewW * 0.5;
    this.cameraY = this.playerY - viewH * 0.5;
    this.cameraFollowHz = 5.5;
    this.cameraFollowHistory = [
      {
        t: performance.now() * 0.001,
        x: this.cameraX,
        y: this.cameraY,
      },
    ];
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeIntensity = 0;
    this.wallHitBounce = 0;
    this.wallHitDirection = null;

    // Reset doppelganger state — will reactivate at distance 10
    this.doppelgangerActive = false;
    this.doppelgangerTileX = 0;
    this.doppelgangerTileY = 0;
    this.doppelgangerX = 0;
    this.doppelgangerY = 0;
    this.doppelgangerMoveTimer = 0;
    this.doppelgangerMoveSpeed = 1.2;
    this.doppelgangerTrail = [];
    this.doppelgangerSpawnTimer = 0;
    this.caughtTimer = 0;
    this.lives = 1;

    // Reset player speed effects
    this.speedMultiplier = 1.0;
    this.speedEffectTimer = 0;
    this.activeSpriteEffects = [];

    // Reset visual effects
    this.dashSpeedLines = [];
    this.lightRays = [];
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem("gameSettings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.log("[Game] Failed to load settings");
      }
    }
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("gameSettings", JSON.stringify(this.settings));
  }

  private applySettingsToUI(): void {
    // Update toggle images if settings panel is already rendered
    const toggleMusicImg = document.querySelector(
      "#toggleMusic img",
    ) as HTMLImageElement;
    const toggleFxImg = document.querySelector(
      "#toggleFx img",
    ) as HTMLImageElement;
    const toggleHapticsImg = document.querySelector(
      "#toggleHaptics img",
    ) as HTMLImageElement;

    if (toggleMusicImg && this.onToggleImage && this.offToggleImage) {
      toggleMusicImg.src = this.settings.music
        ? this.onToggleImage.src
        : this.offToggleImage.src;
    }
    if (toggleFxImg && this.onToggleImage && this.offToggleImage) {
      toggleFxImg.src = this.settings.fx
        ? this.onToggleImage.src
        : this.offToggleImage.src;
    }
    if (toggleHapticsImg && this.onToggleImage && this.offToggleImage) {
      toggleHapticsImg.src = this.settings.haptics
        ? this.onToggleImage.src
        : this.offToggleImage.src;
    }

    // Update classList if elements exist (for backwards compatibility)
    if (this.toggleMusic) {
      this.toggleMusic.classList.toggle("active", this.settings.music);
    }
    if (this.toggleFx) {
      this.toggleFx.classList.toggle("active", this.settings.fx);
    }
    if (this.toggleHaptics) {
      this.toggleHaptics.classList.toggle("active", this.settings.haptics);
    }
  }

  private bindPress(target: HTMLElement | null, handler: () => void): void {
    if (!target) return;
    target.style.touchAction = "manipulation";

    let pointerActive = false;
    let lastFiredAt = 0;

    const fire = () => {
      const now = performance.now();
      // Guard against duplicate click + pointer/touch emissions on mobile browsers.
      if (now - lastFiredAt < 140) return;
      lastFiredAt = now;
      handler();
    };

    target.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerActive = true;
    });

    target.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!pointerActive) return;
      pointerActive = false;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      fire();
    });

    target.addEventListener("pointercancel", () => {
      pointerActive = false;
    });

    target.addEventListener(
      "touchend",
      (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        fire();
      },
      { passive: false },
    );

    target.addEventListener("click", (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      fire();
    });
  }

  private triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    if (!this.settings.haptics) return;
    if (typeof oasiz.triggerHaptic === 'function') oasiz.triggerHaptic(type);
  }

  private setupUI(): void {
    // Note: playBtn and optionsBtn are now created dynamically in updateStartMenu()
    // Event listeners are attached there
    const restartBtn = document.getElementById("restartBtn");
    const menuBtn = document.getElementById("menuBtn");
    const resumeBtn = document.getElementById("resumeBtn");

    this.bindPress(restartBtn as HTMLElement | null, () => {
      this.triggerHaptic("light");
      this.restart();
    });

    this.bindPress(menuBtn as HTMLElement | null, () => {
      this.triggerHaptic("light");
      this.showMenu();
    });

    this.bindPress(resumeBtn as HTMLElement | null, () => {
      this.triggerHaptic("light");
      this.resume();
    });

    this.bindPress(this.pauseBtn, () => {
      this.triggerHaptic("light");
      if (this.state === "PLAYING") this.pause();
      else if (this.state === "PAUSED") this.resume();
    });

    this.bindPress(this.settingsBtn, () => {
      this.triggerHaptic("light");
      this.toggleSettings();
    });

    this.bindPress(this.teleportBtn, () => {
      this.executeTeleport();
    });

    // Settings panel event listeners are now set up in updateSettingsPanel()
    // after the panel is dynamically created
  }

  private dismissTeleport(): void {
    if (this.pendingTeleport) {
      this.pendingTeleport = null;
      this.teleportBtn?.classList.add("hidden");
    }
  }

  private setupInput(): void {
    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (this.state !== "PLAYING") return;

      if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        this.nextDirection = "up";
        this.dismissTeleport();
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        this.nextDirection = "down";
        this.dismissTeleport();
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        e.preventDefault();
        this.nextDirection = "left";
        this.dismissTeleport();
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        e.preventDefault();
        this.nextDirection = "right";
        this.dismissTeleport();
      } else if (e.code === "Escape") {
        e.preventDefault();
        if (this.settingsPanel.classList.contains("open")) {
          this.setSettingsOpen(false);
        } else {
          this.pause();
        }
      }
    });

    // Mobile Swipe Controls
    let touchStartX = 0;
    let touchStartY = 0;
    let touchFired = false;

    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        if (this.state !== "PLAYING") return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchFired = false;
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        if (this.state !== "PLAYING") return;
        if (e.cancelable) e.preventDefault();
        if (touchFired) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
          touchFired = true;
          if (Math.abs(dx) > Math.abs(dy)) {
            this.nextDirection = dx > 0 ? "right" : "left";
          } else {
            this.nextDirection = dy > 0 ? "down" : "up";
          }
          this.dismissTeleport();
        }
      },
      { passive: false },
    );

    this.canvas.addEventListener("touchend", (e) => {
      if (this.state !== "PLAYING") return;
      if (touchFired) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      // Fallback for short taps that didn't cross 30px threshold during move
      if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.nextDirection = dx > 0 ? "right" : "left";
        } else {
          this.nextDirection = dy > 0 ? "down" : "up";
        }
        this.dismissTeleport();
      }
    });
  }

  private start(): void {
    if (typeof oasiz.gameplayStart === 'function') oasiz.gameplayStart();
    this.sandSlowPhaseStartS = performance.now() * 0.001;
    this.state = "PLAYING";
    this.audio.startMusic();
    if (this.startOverlay) {
      this.startOverlay.classList.add("hidden");
    }
    this.hudEl?.classList.remove("uiHidden");
    this.tutorialOverlay?.classList.remove("uiHidden");
    this.pauseBtn?.classList.remove("uiHidden");
    this.settingsBtn?.classList.remove("uiHidden");
  }

  private pause(): void {
    if (this.state !== "PLAYING") return;
    if (typeof oasiz.gameplayStop === 'function') oasiz.gameplayStop();
    this.state = "PAUSED";
    this.audio.stopMusic();
    this.teleportBtn?.classList.add("hidden");
    this.pauseOverlay?.classList.remove("hidden");
    // Ensure pause overlay UI is updated
    this.updatePauseOverlay();
  }

  private resume(): void {
    if (this.state !== "PAUSED") return;
    if (typeof oasiz.gameplayStart === 'function') oasiz.gameplayStart();
    this.state = "PLAYING";
    this.audio.startMusic();
    this.pauseOverlay?.classList.add("hidden");
  }

  private restart(): void {
    this.resetGame();
    if (typeof oasiz.gameplayStart === 'function') oasiz.gameplayStart();
    this.state = "PLAYING";
    this.audio.startMusic();
    this.gameOverOverlay?.classList.add("hidden");
    this.pauseOverlay?.classList.add("hidden");
    this.hudEl?.classList.remove("uiHidden");
    this.tutorialOverlay?.classList.remove("uiHidden");
    this.pauseBtn?.classList.remove("uiHidden");
    this.settingsBtn?.classList.remove("uiHidden");
  }

  private showMenu(): void {
    this.state = "START";
    this.audio.stopMusic();
    this.gameOverOverlay?.classList.add("hidden");
    this.pauseOverlay?.classList.add("hidden");
    this.startOverlay?.classList.remove("hidden");
    this.hudEl?.classList.add("uiHidden");
    this.tutorialOverlay?.classList.add("uiHidden");
    this.pauseBtn?.classList.add("uiHidden");
    this.settingsBtn?.classList.add("uiHidden");
    this.teleportBtn?.classList.add("hidden");
    // Ensure menu is updated when showing
    this.updateStartMenu();
  }

  private gameOver(): void {
    if (typeof oasiz.gameplayStop === 'function') oasiz.gameplayStop();
    this.state = "GAME_OVER";

    // Update game over overlay with score (matches leaderboard)
    this.updateGameOverOverlay(this.score);

    this.gameOverOverlay?.classList.remove("hidden");
    this.hudEl?.classList.add("uiHidden");
    this.tutorialOverlay?.classList.add("uiHidden");
    this.teleportBtn?.classList.add("hidden");
    this.pauseBtn?.classList.add("uiHidden");
    this.settingsBtn?.classList.add("uiHidden");

    if (typeof oasiz.submitScore === 'function') {
      oasiz.submitScore(this.score);
    }
  }

  private toggleSettings(): void {
    const now = Date.now();
    if (now - this.lastToggleTime < 300) return;
    this.lastToggleTime = now;

    const isOpen = this.settingsPanel.classList.contains("open");
    this.setSettingsOpen(!isOpen);
  }

  private setSettingsOpen(open: boolean): void {
    if (open) {
      // Ensure settings panel is updated before opening
      this.updateSettingsPanel();
      this.settingsPanel.classList.add("open");
      if (this.state === "PLAYING") {
        // Pause the game but don't show the pause overlay
        if (typeof oasiz.gameplayStop === 'function') oasiz.gameplayStop();
        this.state = "PAUSED";
        this.audio.stopMusic();
        // Explicitly hide pause overlay to prevent it from showing
        this.pauseOverlay?.classList.add("hidden");
      }
      // Add animation
      const settingsPanel = document.getElementById("settingsPanel");
      if (settingsPanel) {
        settingsPanel.style.animation = "panelSlideIn 0.4s ease-out";
      }
    } else {
      this.settingsPanel.classList.remove("open");
      if (
        this.state === "PAUSED" &&
        !this.settingsPanel.classList.contains("open")
      ) {
        this.resume();
      }
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const w = this.viewW();
    const h = this.viewH();
    const t = performance.now() * 0.001;

    // Calculate current background index/blend
    // We want to change background every 200 units (tiles)
    // distance is based on playerSpawnY - playerTileY (as we move UP, Y decreases)
    // distance 0 is start.
    const distance = Math.max(0, this.playerSpawnY - this.playerTileY);
    const transitionZone = 50; // Transition over 50 tiles

    // Determine which backgrounds to draw and their opacities
    let bg1: HTMLImageElement | null = null;
    let bg2: HTMLImageElement | null = null;
    let blend = 0; // 0 = fully bg1, 1 = fully bg2

    if (distance < 200) {
      // First zone: 0 - 200
      bg1 = this.bgImage;
      if (distance > 200 - transitionZone) {
        // Transitioning to zone 2
        bg2 = this.bgImage2;
        blend = (distance - (200 - transitionZone)) / transitionZone;
      }
    } else if (distance < 400) {
      // Second zone: 200 - 400
      bg1 = this.bgImage2;
      if (distance > 400 - transitionZone) {
        // Transitioning to zone 3
        bg2 = this.bgImage3;
        blend = (distance - (400 - transitionZone)) / transitionZone;
      }
    } else {
      // Third zone: 400+
      bg1 = this.bgImage3;
    }

    // Helper to draw an image covering the screen
    const drawBgImage = (img: HTMLImageElement, opacity: number) => {
      if (!img || !img.complete || img.naturalWidth === 0) return;

      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      const imgAspect = imgW / imgH;
      const viewAspect = w / h;

      let drawW = w;
      let drawH = h;
      let drawX = 0;
      let drawY = 0;

      if (imgAspect > viewAspect) {
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) * 0.5;
      } else {
        drawW = w;
        drawH = w / imgAspect;
        drawY = (h - drawH) * 0.5;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    };

    // Draw primary background
    if (bg1) {
      drawBgImage(bg1, 1);
    } else {
      // Fallback gradient if no image
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a1626");
      g.addColorStop(1, "#2d1a0a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw transitioning background if applicable
    if (bg2 && blend > 0) {
      // Fade to black briefly in middle of transition?
      // Request said: "smoothly change, first smooth blacken then new one comes"
      // Let's implement that:
      // 0.0 - 0.5: Fade bg1 to black
      // 0.5 - 1.0: Fade black to bg2

      // Actually, simple crossfade is usually better, but let's try to honor "blacken"
      // We can draw a black overlay based on a parabolic curve of the blend
      // Peak blackness at blend = 0.5

      const blackness = 1.0 - 2 * Math.abs(blend - 0.5); // 0 at ends, 1 at center

      ctx.save();
      ctx.globalAlpha = blackness;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Draw the second image with increasing opacity
      // However, standard crossfade is:
      // bg1 alpha = 1
      // bg2 alpha = blend
      // But with the "blacken" step:

      // We draw bg2 on top.
      // If we want a dip to black:
      // Draw bg1.
      // Draw black overlay (alpha goes 0 -> 1 -> 0).
      // Draw bg2 (alpha goes 0 -> 1).

      // Let's keep it simple: Crossfade + Black Dip

      if (blend > 0.5) {
        // We are closer to bg2
        // Clear everything with Black base
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);

        if (blend < 0.5) {
          // Showing mostly BG1
          const opacity = 1.0 - blend * 2; // 1.0 -> 0.0
          if (bg1) drawBgImage(bg1, opacity);
        } else {
          // Showing mostly BG2
          const opacity = (blend - 0.5) * 2; // 0.0 -> 1.0
          if (bg2) drawBgImage(bg2, opacity);
        }
      } else {
        // blend <= 0.5
        // Draw black overlay on top of bg1 (which is already drawn)
        // alpha 0 -> 1 (blackness increases)
        const blackness = blend * 2;
        ctx.save();
        ctx.globalAlpha = blackness;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // ... rest of overlays (vignette, etc.)
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    // Egyptian orbs: golden suns and warm glows
    const orbs = [
      {
        x: w * 0.2,
        y: h * 0.3,
        phase: t * 0.8,
        size: Math.min(w, h) * 0.4,
        offset: 0,
      },
      {
        x: w * 0.8,
        y: h * 0.5,
        phase: t * 1.2,
        size: Math.min(w, h) * 0.35,
        offset: Math.PI * 0.66,
      },
      {
        x: w * 0.5,
        y: h * 0.7,
        phase: t * 0.6,
        size: Math.min(w, h) * 0.3,
        offset: Math.PI * 1.33,
      },
    ];
    for (const orb of orbs) {
      const pulse = 0.7 + 0.3 * Math.sin(orb.phase);
      const alpha = 0.1 * pulse; // Slightly brighter for Egyptian theme
      const orbColor1 = getColorShift(t, orb.offset);
      const orbColor2 = getColorShift(t, orb.offset + Math.PI);
      const rg = ctx.createRadialGradient(
        orb.x,
        orb.y,
        0,
        orb.x,
        orb.y,
        orb.size * pulse,
      );
      rg.addColorStop(
        0,
        getColorString(orbColor1.r, orbColor1.g, orbColor1.b, alpha),
      );
      rg.addColorStop(
        0.5,
        getColorString(orbColor2.r, orbColor2.g, orbColor2.b, alpha * 0.6),
      );
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.15;
    const gridColor = getColorShift(t, Math.PI * 0.5);
    // Golden grid lines for Egyptian theme
    ctx.strokeStyle = getColorString(
      gridColor.r,
      gridColor.g,
      gridColor.b,
      0.35,
    );
    ctx.lineWidth = 1;
    const gridSize = 60;
    // Center the grid - ensure a grid line passes through the exact center
    const centerX = w * 0.5;
    const centerY = h * 0.5 + (this.bgScrollY % gridSize);

    // Calculate the nearest grid line position to center, then offset from there
    // We want a grid line at centerX, so: offsetX + n*gridSize = centerX
    // Find the offset that places a line at centerX
    const offsetX = centerX % gridSize;
    const offsetY = centerY % gridSize;
    // Start drawing from center outward
    for (
      let x = centerX - (centerX % gridSize);
      x >= -gridSize;
      x -= gridSize
    ) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (
      let x = centerX - (centerX % gridSize) + gridSize;
      x < w + gridSize;
      x += gridSize
    ) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (
      let y = centerY - (centerY % gridSize);
      y >= -gridSize;
      y -= gridSize
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (
      let y = centerY - (centerY % gridSize) + gridSize;
      y < h + gridSize;
      y += gridSize
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Draw background particles (sand grains)
    ctx.save();
    for (const p of this.bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = "#F3EAD6"; // Sand color
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.noisePattern) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = this.noisePattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Darken the center of the gameplay area
    const vg = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.1,
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.85,
    );
    vg.addColorStop(0, "rgba(0,0,0,0.4)"); // Darker in center
    vg.addColorStop(0.5, "rgba(0,0,0,0.25)"); // Medium darkness
    vg.addColorStop(1, "rgba(0,0,0,0)"); // Transparent at edges
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  private drawRedBrickWall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    // Base color - darker reddish brick color
    const baseR = 120;
    const baseG = 50;
    const baseB = 40;

    // Simple base fill (no gradient for performance)
    ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
    ctx.fillRect(x, y, size, size);

    // Draw brick pattern - optimized for smaller tiles
    const brickRows = 2; // Fewer rows for smaller tiles
    const brickHeight = size / brickRows;
    const brickWidth = size / 2; // Wider bricks relative to tile size
    const mortarWidth = 1.5; // Thinner mortar for smaller tiles

    // Draw mortar (much darker lines between bricks)
    const mortarR = Math.max(0, baseR - 50);
    const mortarG = Math.max(0, baseG - 30);
    const mortarB = Math.max(0, baseB - 25);
    ctx.fillStyle = `rgb(${mortarR}, ${mortarG}, ${mortarB})`;

    // Horizontal mortar lines
    for (let i = 1; i < brickRows; i++) {
      ctx.fillRect(
        x,
        Math.round(y + i * brickHeight - mortarWidth / 2),
        size,
        mortarWidth,
      );
    }

    // Vertical mortar lines with offset pattern (classic brick pattern)
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;

      // Draw vertical lines more efficiently
      let colX = Math.round(x + offset);
      while (colX < x + size) {
        ctx.fillRect(colX - mortarWidth / 2, rowY, mortarWidth, brickHeight);
        colX += brickWidth;
      }
    }
  }

  private drawBrickTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    // Base color - sandy/stone color (lighter, more golden)
    const baseR = 220;
    const baseG = 200;
    const baseB = 170;

    // Fill base with gradient for depth
    const gradient = ctx.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(
      0,
      `rgb(${baseR + 10}, ${baseG + 10}, ${baseB + 10})`,
    );
    gradient.addColorStop(
      1,
      `rgb(${baseR - 10}, ${baseG - 10}, ${baseB - 10})`,
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);

    // Draw brick pattern - alternating rows for classic brick layout
    const brickRows = 3;
    const brickHeight = size / brickRows;
    const brickWidth = size / 2;
    const mortarWidth = 2;

    // Draw mortar (darker lines between bricks)
    ctx.fillStyle = `rgb(${baseR - 25}, ${baseG - 25}, ${baseB - 25})`;

    // Horizontal mortar lines
    for (let i = 1; i < brickRows; i++) {
      ctx.fillRect(
        x,
        Math.round(y + i * brickHeight - mortarWidth / 2),
        size,
        mortarWidth,
      );
    }

    // Vertical mortar lines with offset pattern (brick pattern)
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth; // Alternate rows offset for brick pattern

      // Vertical lines
      for (let col = 0; col <= 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size) {
          ctx.fillRect(colX - mortarWidth / 2, rowY, mortarWidth, brickHeight);
        }
      }
    }

    // Add subtle highlights on top of each brick for 3D effect
    ctx.fillStyle = `rgba(${baseR + 25}, ${baseG + 25}, ${baseB + 25}, 0.4)`;
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;

      for (let col = 0; col < 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size - 2) {
          // Top highlight on each brick
          const highlightHeight = Math.max(2, brickHeight * 0.15);
          ctx.fillRect(colX + 1, rowY + 1, brickWidth - 2, highlightHeight);
        }
      }
    }

    // Add subtle shadows at bottom of each brick
    ctx.fillStyle = `rgba(${baseR - 30}, ${baseG - 30}, ${baseB - 30}, 0.3)`;
    for (let row = 0; row < brickRows; row++) {
      const rowY = Math.round(y + row * brickHeight);
      const offset = (row % 2) * brickWidth;

      for (let col = 0; col < 2; col++) {
        const colX = Math.round(x + col * brickWidth + offset);
        if (colX >= x && colX < x + size - 2) {
          // Bottom shadow on each brick
          const shadowHeight = Math.max(2, brickHeight * 0.15);
          ctx.fillRect(
            colX + 1,
            rowY + brickHeight - shadowHeight - 1,
            brickWidth - 2,
            shadowHeight,
          );
        }
      }
    }
  }

  private drawBorder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    orientation: "horizontal" | "vertical",
  ): void {
    // Border color - darker than brick tile for depth
    const borderR = 180;
    const borderG = 160;
    const borderB = 140;

    if (this.isMobile) {
      // Use solid color for performance on mobile
      ctx.fillStyle = `rgb(${borderR}, ${borderG}, ${borderB})`;
    } else {
      // Add subtle gradient for 3D effect on desktop
      const gradient =
        orientation === "horizontal"
          ? ctx.createLinearGradient(x, y, x, y + height)
          : ctx.createLinearGradient(x, y, x + width, y);

      gradient.addColorStop(
        0,
        `rgba(${borderR + 15}, ${borderG + 15}, ${borderB + 15}, 0.6)`,
      );
      gradient.addColorStop(
        1,
        `rgba(${borderR - 15}, ${borderG - 15}, ${borderB - 15}, 0.6)`,
      );
      ctx.fillStyle = gradient;
    }

    ctx.fillRect(x, y, width, height);

    // Add highlight on top edge
    ctx.fillStyle = `rgba(${borderR + 25}, ${borderG + 25}, ${borderB + 25}, 0.5)`;
    if (orientation === "horizontal") {
      ctx.fillRect(x, y, width, Math.max(1, height * 0.2));
    } else {
      ctx.fillRect(x, y, Math.max(1, width * 0.2), height);
    }

    // Add shadow on bottom edge
    ctx.fillStyle = `rgba(${borderR - 25}, ${borderG - 25}, ${borderB - 25}, 0.5)`;
    if (orientation === "horizontal") {
      ctx.fillRect(
        x,
        y + height - Math.max(1, height * 0.2),
        width,
        Math.max(1, height * 0.2),
      );
    } else {
      ctx.fillRect(
        x + width - Math.max(1, width * 0.2),
        y,
        Math.max(1, width * 0.2),
        height,
      );
    }
  }

  private drawMaze(): void {
    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);
    // Apply screen shake (camera is in world coordinates, so no need to divide by zoom)
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);

    const viewX0 = this.cameraX;
    const viewY0 = this.cameraY;
    const viewX1 = viewX0 + this.viewW() / zoom;
    const viewY1 = viewY0 + this.viewH() / zoom;
    const isVisibleWorldRect = (
      x: number,
      y: number,
      w: number,
      h: number,
    ): boolean => {
      return !(x + w < viewX0 || x > viewX1 || y + h < viewY0 || y > viewY1);
    };

    const tileSize = CONFIG.TILE_SIZE;
    const col0 = clamp(
      Math.floor(viewX0 / tileSize) - 2,
      0,
      CONFIG.MAZE_COLS - 1,
    );
    const col1 = clamp(
      Math.floor(viewX1 / tileSize) + 2,
      0,
      CONFIG.MAZE_COLS - 1,
    );
    const row0 = Math.floor(viewY0 / tileSize) - 3;
    const row1 = Math.floor(viewY1 / tileSize) + 3;
    let mainWallTilesDrawn = 0;
    let sideWallTilesDrawn = 0;
    let itemTilesDrawn = 0;
    let fogTilesDrawn = 0;
    let sandSurfaceSamples = 0;

    // Draw walls using procedurally drawn brick tiles with borders
    this.perfMeasure("render.drawMaze.mainWalls", () => {
      ctx.save();
      // Enable image smoothing for smooth brick rendering
      ctx.imageSmoothingEnabled = true;
      for (let ry = row0; ry <= row1; ry++) {
        const row = this.ensureRow(ry);

        // Get width factor for this row to determine playable area boundaries
        const chunkId = this.getChunkIdForRow(ry);
        // Fixed width - no variation
        const effectiveWidth = CONFIG.MAX_WIDTH_COLS;
        const leftMargin = Math.floor((CONFIG.MAZE_COLS - effectiveWidth) / 2);
        const rightMargin = CONFIG.MAZE_COLS - leftMargin - effectiveWidth;
        const playableStart = leftMargin;
        const playableEnd = CONFIG.MAZE_COLS - rightMargin;

        for (let cx = col0; cx <= col1; cx++) {
          if (row[cx] === "wall") {
            const x = cx * (tileSize + CONFIG.TILE_SPACING);
            const y = ry * (tileSize + CONFIG.TILE_SPACING);

            // Check neighbors to determine exposed edges
            const left = cx > 0 && row[cx - 1] === "wall";
            const right = cx < CONFIG.MAZE_COLS - 1 && row[cx + 1] === "wall";
            const upRow = ry > 0 ? this.ensureRow(ry - 1) : null;
            const downRow = ry < row1 ? this.ensureRow(ry + 1) : null;
            const up = upRow && upRow[cx] === "wall";
            const down = downRow && downRow[cx] === "wall";

            // Check if this wall is at the edge of the playable area (needs side borders)
            const isAtPlayableLeftEdge = cx === playableStart;
            const isAtPlayableRightEdge = cx === playableEnd - 1;

            // Use integer pixel positions to prevent gaps
            const drawX = Math.floor(x);
            const drawY = Math.floor(y);

            // Visual tile size includes overlap for seamless walls
            const visualTileSize = tileSize + CONFIG.TILE_OVERLAP;
            const overlapOffset = CONFIG.TILE_OVERLAP / 2;
            if (
              !isVisibleWorldRect(
                x - overlapOffset,
                y - overlapOffset,
                visualTileSize,
                visualTileSize,
              )
            ) {
              continue;
            }
            mainWallTilesDrawn++;
            const centerX = Math.round(drawX + tileSize / 2);
            const centerY = Math.round(drawY + tileSize / 2);

            // Draw tile asset
            if (this.tileImage && this.tileImage.complete) {
              ctx.drawImage(
                this.tileImage,
                drawX - overlapOffset,
                drawY - overlapOffset,
                visualTileSize,
                visualTileSize,
              );
            }

            // Draw borders on exposed edges (skip on mobile for performance).
            if (!this.isMobile) {
              const borderThickness = Math.max(3, visualTileSize * 0.08);
              if (!up) {
                this.drawBorder(
                  ctx,
                  drawX - overlapOffset,
                  drawY - overlapOffset,
                  visualTileSize,
                  borderThickness,
                  "horizontal",
                );
              }
              if (!down) {
                this.drawBorder(
                  ctx,
                  drawX - overlapOffset,
                  drawY + tileSize - overlapOffset,
                  visualTileSize,
                  borderThickness,
                  "horizontal",
                );
              }
              if (!left || isAtPlayableLeftEdge) {
                this.drawBorder(
                  ctx,
                  drawX - overlapOffset,
                  drawY - overlapOffset,
                  borderThickness,
                  visualTileSize,
                  "vertical",
                );
              }
              if (!right || isAtPlayableRightEdge) {
                this.drawBorder(
                  ctx,
                  drawX + tileSize - overlapOffset,
                  drawY - overlapOffset,
                  borderThickness,
                  visualTileSize,
                  "vertical",
                );
              }
            }
          }
        }
      }
      ctx.restore();
    });

    // Side walls are spawned per row during chunk generation.
    // Here we only render visible rows to avoid per-frame full-height redraw cost.
    this.perfMeasure("render.drawMaze.sideWalls", () => {
      ctx.save();
      ctx.imageSmoothingEnabled = true;

      const visualTileSize = tileSize + CONFIG.TILE_OVERLAP;
      const overlapOffset = CONFIG.TILE_OVERLAP / 2;
      const borderThickness = Math.max(3, visualTileSize * 0.08);
      const sparseSideWalls = this.isMobile || this.lowPerfMode;
      const drawSideWallBorders = !this.isMobile && !this.lowPerfMode;

      for (let ry = row0; ry <= row1; ry++) {
        if (sparseSideWalls && (ry & 1) !== 0) continue;
        this.ensureRow(ry);
        const spawns = this.ensureSideWallSpawnsForRow(ry);
        if (spawns.length === 0) continue;

        const y = ry * (tileSize + CONFIG.TILE_SPACING);
        const drawY = Math.floor(y);

        for (const spawn of spawns) {
          const wallX = spawn.col * (tileSize + CONFIG.TILE_SPACING);
          const drawX = Math.floor(wallX);
          const sprite =
            spawn.sprite === "tile" ? this.tileImage : this.wall8Image;

          if (sprite && sprite.complete) {
            if (
              !isVisibleWorldRect(
                wallX - overlapOffset,
                y - overlapOffset,
                visualTileSize,
                visualTileSize,
              )
            ) {
              continue;
            }
            sideWallTilesDrawn++;
            ctx.drawImage(
              sprite,
              drawX - overlapOffset,
              drawY - overlapOffset,
              visualTileSize,
              visualTileSize,
            );
          }

          if (drawSideWallBorders) {
            if (spawn.border === "left") {
              this.drawBorder(
                ctx,
                drawX - overlapOffset,
                drawY - overlapOffset,
                borderThickness,
                visualTileSize,
                "vertical",
              );
            } else if (spawn.border === "right") {
              this.drawBorder(
                ctx,
                drawX + tileSize - overlapOffset,
                drawY - overlapOffset,
                borderThickness,
                visualTileSize,
                "vertical",
              );
            }
          }
        }
      }

      ctx.restore();
    });

    // Walls are now drawn using platform tile sprites above
    // Removed procedurally drawn squares - using sprites only

    const time = performance.now() * 0.001;
    this.perfMeasure("render.drawMaze.items", () => {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let ry = row0; ry <= row1; ry++) {
        const row = this.ensureRow(ry);
        for (let cx = col0; cx <= col1; cx++) {
          const t = row[cx];
          if (
            t !== "dot" &&
            t !== "power" &&
            t !== "trap" &&
            t !== "corner_trap" &&
            t !== "speed_boost" &&
            t !== "portal"
          )
            continue;
          const x = cx * (tileSize + CONFIG.TILE_SPACING);
          const y = ry * (tileSize + CONFIG.TILE_SPACING);
          if (!isVisibleWorldRect(x, y, tileSize, tileSize)) continue;
          itemTilesDrawn++;
          const px = x + tileSize / 2;
          const py = y + tileSize / 2;

          if (t === "dot") {
            // Draw coin sprite - scale to original dot size (5px radius = 10px diameter)
            if (
              this.coinImage &&
              this.coinImage.complete &&
              this.coinImage.naturalWidth > 0
            ) {
              ctx.globalAlpha = 0.95;
              const coinSize = 10; // Original dot size
              const coinScale =
                coinSize /
                Math.max(
                  this.coinImage.naturalWidth,
                  this.coinImage.naturalHeight,
                );
              const coinW = this.coinImage.naturalWidth * coinScale;
              const coinH = this.coinImage.naturalHeight * coinScale;
              ctx.drawImage(
                this.coinImage,
                px - coinW / 2,
                py - coinH / 2,
                coinW,
                coinH,
              );
            } else {
              // Fallback: draw simple circle
              const dotColor = getColorShift(time, (ry * 13 + cx) * 0.1);
              const rg = ctx.createRadialGradient(px, py, 0.5, px, py, 6);
              rg.addColorStop(0, "rgba(255,255,200,0.95)");
              rg.addColorStop(
                0.25,
                getColorString(dotColor.r, dotColor.g, dotColor.b, 0.95),
              );
              rg.addColorStop(1, "rgba(0,0,0,0)");
              ctx.fillStyle = rg;
              ctx.globalAlpha = 0.95;
              ctx.beginPath();
              ctx.arc(px, py, 5.0, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (t === "power") {
            // Power pellets - bright golden orbs
            const pulse =
              0.65 + 0.35 * Math.sin(time * 3.2 + (ry * 13 + cx) * 0.13);
            const rr = 14 * pulse;
            const powerColor = getColorShift(time * 1.5, (ry * 13 + cx) * 0.15);
            const rg = ctx.createRadialGradient(px, py, rr * 0.1, px, py, rr);
            rg.addColorStop(0, "rgba(255,255,180,0.95)"); // Bright gold
            rg.addColorStop(
              0.35,
              getColorString(powerColor.r, powerColor.g, powerColor.b, 0.7),
            );
            rg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = rg;
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            ctx.arc(px, py, rr, 0, Math.PI * 2);
            ctx.fill();
          } else if (t === "speed_boost") {
            // Yellow Lightning Bolt
            ctx.fillStyle = "rgba(255, 255, 0, 0.9)";
            ctx.beginPath();
            ctx.moveTo(px + 2, py - 8);
            ctx.lineTo(px - 4, py + 2);
            ctx.lineTo(px + 0, py + 2);
            ctx.lineTo(px - 2, py + 8);
            ctx.lineTo(px + 4, py - 2);
            ctx.lineTo(px + 0, py - 2);
            ctx.closePath();
            ctx.fill();

            // Glow
            ctx.shadowColor = "orange";
            if (!this.isMobile) ctx.shadowBlur = 15;
            ctx.fill();
            if (!this.isMobile) ctx.shadowBlur = 0;
          } else if (t === "portal") {
            // Animated warp sprite
            if (
              this.warpSprite &&
              this.warpSprite.complete &&
              this.warpSprite.naturalWidth > 0
            ) {
              const spriteH = this.warpSprite.naturalHeight;
              const frameW = spriteH;
              const totalFrames = Math.floor(
                this.warpSprite.naturalWidth / frameW,
              );
              const fps = 12;
              const frame = Math.floor(time * fps) % totalFrames;
              const portalSize = tileSize * 0.9;
              const scale = portalSize / frameW;
              ctx.globalAlpha = 0.9;
              ctx.drawImage(
                this.warpSprite,
                frame * frameW,
                0,
                frameW,
                spriteH,
                px - (frameW * scale) / 2,
                py - (spriteH * scale) / 2,
                frameW * scale,
                spriteH * scale,
              );
            } else {
              ctx.fillStyle = "rgba(180, 100, 255, 0.9)";
              ctx.beginPath();
              ctx.arc(px, py, 6, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (t === "trap") {
            // Trap logic: 3s Green, 0.75s Red. Cycle = 3.75s
            const cycle = time % 3.75;
            const isRed = cycle > 3.0;
            const isTransition = cycle > 2.5 && cycle <= 3.0; // Warning phase

            // Draw base (patterned stone/metal)
            ctx.fillStyle = "#1a1a1a";
            ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

            // Draw decorative corners
            ctx.fillStyle = "#444";
            const cornerSize = 6;
            ctx.fillRect(x + 1, y + 1, cornerSize, cornerSize);
            ctx.fillRect(
              x + tileSize - 1 - cornerSize,
              y + 1,
              cornerSize,
              cornerSize,
            );
            ctx.fillRect(
              x + 1,
              y + tileSize - 1 - cornerSize,
              cornerSize,
              cornerSize,
            );
            ctx.fillRect(
              x + tileSize - 1 - cornerSize,
              y + tileSize - 1 - cornerSize,
              cornerSize,
              cornerSize,
            );

            // Inner active area
            const innerPadding = 4;
            const innerSize = tileSize - innerPadding * 2;

            if (isRed) {
              // RED STATE (Lethal) - "Plasma Core"

              // Deep red background
              ctx.fillStyle = "rgba(100, 0, 0, 0.8)";
              ctx.fillRect(
                x + innerPadding,
                y + innerPadding,
                innerSize,
                innerSize,
              );

              // Intense center glow
              const pulse = 0.8 + 0.2 * Math.sin(time * 20);
              const rg = ctx.createRadialGradient(
                px,
                py,
                2,
                px,
                py,
                innerSize * 0.8,
              );
              rg.addColorStop(0, "rgba(255, 200, 200, 1)"); // White-hot center
              rg.addColorStop(0.4, "rgba(255, 50, 0, 0.9)"); // Bright red
              rg.addColorStop(1, "rgba(100, 0, 0, 0)"); // Fade out

              ctx.fillStyle = rg;
              ctx.globalAlpha = pulse;
              ctx.beginPath();
              ctx.arc(px, py, innerSize * 0.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 0.95;

              // Jagged electric arcs
              ctx.strokeStyle = "rgba(255, 255, 200, 0.9)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              for (let i = 0; i < 4; i++) {
                const angle = (time * 10 + i * (Math.PI / 2)) % (Math.PI * 2);
                const r1 = innerSize * 0.2;
                const r2 = innerSize * 0.5;
                ctx.moveTo(
                  px + Math.cos(angle) * r1,
                  py + Math.sin(angle) * r1,
                );
                ctx.lineTo(
                  px + Math.cos(angle + 0.5) * r2,
                  py + Math.sin(angle + 0.5) * r2,
                );
              }
              ctx.stroke();

              // Red shadow bloom
              ctx.shadowColor = "red";
              ctx.shadowBlur = 20;
              ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
              ctx.lineWidth = 2;
              ctx.strokeRect(
                x + innerPadding,
                y + innerPadding,
                innerSize,
                innerSize,
              );
              ctx.shadowBlur = 0;
            } else {
              // GREEN STATE (Safe) - "Ancient Rune"

              // Darker green background
              ctx.fillStyle = isTransition
                ? `rgba(50, ${100 + Math.sin(time * 30) * 50}, 0, 0.5)` // Flicker if warning
                : "rgba(0, 60, 20, 0.5)";
              ctx.fillRect(
                x + innerPadding,
                y + innerPadding,
                innerSize,
                innerSize,
              );

              // Breathing rune effect
              const pulse = 0.5 + 0.3 * Math.sin(time * 3); // Slow breath

              ctx.strokeStyle = isTransition
                ? "rgba(255, 255, 0, 0.8)"
                : `rgba(100, 255, 150, ${pulse})`;
              ctx.lineWidth = 2;

              // Diamond shape rune
              ctx.beginPath();
              ctx.moveTo(px, y + innerPadding + 2);
              ctx.lineTo(x + tileSize - innerPadding - 2, py);
              ctx.lineTo(px, y + tileSize - innerPadding - 2);
              ctx.lineTo(x + innerPadding + 2, py);
              ctx.closePath();
              ctx.stroke();

              // Inner dot
              ctx.fillStyle = isTransition
                ? "yellow"
                : "rgba(150, 255, 200, 0.8)";
              ctx.beginPath();
              ctx.arc(px, py, 2, 0, Math.PI * 2);
              ctx.fill();

              // Outer safe glow
              if (!isTransition) {
                ctx.shadowColor = "rgba(0, 255, 100, 0.5)";
                ctx.shadowBlur = 5;
                ctx.stroke();
                ctx.shadowBlur = 0;
              }
            }
          } else if (t === "corner_trap") {
            const key = `${cx},${ry}`;
            const triggeredTime = this.activeTraps.get(key);
            const isTriggered = triggeredTime !== undefined;
            const now = time;

            // Base: Pressure Plate
            ctx.fillStyle = "#222";
            ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

            // Rim
            ctx.strokeStyle = isTriggered ? "red" : "#666";
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

            if (isTriggered) {
              const elapsed = now - triggeredTime!;
              const remaining = Math.max(0, 2.0 - elapsed);

              // Flashing Red Core
              const pulse = Math.abs(Math.sin(elapsed * 20));
              ctx.fillStyle = `rgba(255, ${Math.floor(pulse * 100)}, 0, 0.9)`;
              ctx.fillRect(x + 6, y + 6, tileSize - 12, tileSize - 12);

              // Digital countdown - Below the tile
              if (tileSize > 20) {
                const textY = y + tileSize + 10;

                // Background
                ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
                ctx.fillRect(px - 16, textY - 9, 32, 18);

                // Border
                ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
                ctx.lineWidth = 1;
                ctx.strokeRect(px - 16, textY - 9, 32, 18);

                ctx.fillStyle = "#fff";
                ctx.font = "bold 13px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(remaining.toFixed(1), px, textY);
              }
            } else {
              // Idle State
              ctx.fillStyle = "#444";
              ctx.fillRect(x + 8, y + 8, tileSize - 16, tileSize - 16);
              const blink = Math.sin(time * 2) > 0.9;
              ctx.fillStyle = blink ? "red" : "#300";
              ctx.beginPath();
              ctx.arc(px, py, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    });

    // Draw shadow overlay on distant tiles (Fog of War)
    if (!this.isMobile)
      this.perfMeasure("render.drawMaze.fog", () => {
        ctx.save();
        const shadowStartDist = 4; // Tiles within this radius are fully bright
        const shadowEndDist = 9; // Tiles beyond this radius are maximally darkened
        const maxShadowOpacity = 0.4;

        for (let ry = row0; ry <= row1; ry++) {
          for (let cx = col0; cx <= col1; cx++) {
            // Calculate grid distance from player
            const dx = cx - this.playerTileX;
            const dy = ry - this.playerTileY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > shadowStartDist) {
              let alpha =
                (dist - shadowStartDist) / (shadowEndDist - shadowStartDist);
              alpha = Math.min(Math.max(alpha, 0), maxShadowOpacity);

              if (alpha > 0) {
                fogTilesDrawn++;
                const x = cx * (tileSize + CONFIG.TILE_SPACING);
                const y = ry * (tileSize + CONFIG.TILE_SPACING);
                const overlaySize = tileSize + CONFIG.TILE_SPACING; // Exact size to avoid overlap artifacts

                ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                ctx.fillRect(x, y, overlaySize, overlaySize);
              }
            }
          }
        }
        ctx.restore();
      });

    // Draw rising sand dunes
    const surfaceY = this.waterSurfaceY;
    const viewH = this.viewH() / zoom;
    const bottomY = viewY0 + viewH; // Bottom of viewport

    this.perfMeasure("render.drawMaze.sand", () => {
      const DUNE_MAX_AMP = 80; // max dune oscillation amplitude in px
      if (surfaceY < bottomY + DUNE_MAX_AMP) {
        // Always draw sand from bottom, even if surface is above
        const x0 = viewX0 - 200;
        const x1 = viewX1 + 200;
        const y1 = bottomY + DUNE_MAX_AMP; // extend below viewport so fill never collapses

        ctx.save();
        const step = this.isMobile ? 20 : 12; // Coarser sampling on mobile
        const sandPath = new Path2D();
        sandPath.moveTo(x0, y1);

        // Draw dune surface from left to right
        for (let x = x0; x <= x1 + 0.001; x += step) {
          sandSurfaceSamples++;
          const yy = sandDuneY(surfaceY, x, time);
          // Clamp to bottom if surface is below viewport
          const clampedY = Math.min(yy, y1);
          sandPath.lineTo(x, clampedY);
        }
        sandPath.lineTo(x1, y1);
        sandPath.closePath();

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        ctx.fillStyle = CONFIG.WATER_COLOR; // Sandy color
        ctx.fill(sandPath);

        ctx.save();
        ctx.clip(sandPath);
        // Sand gradient - darker at bottom, lighter at surface (dune highlights)
        const minSurfaceY = Math.min(surfaceY, y1 - 50); // Minimum surface Y
        const dg = ctx.createLinearGradient(0, minSurfaceY, 0, y1);
        dg.addColorStop(0, "rgba(255,245,220,0.15)"); // Light sand at dune peaks
        dg.addColorStop(0.3, "rgba(200,180,140,0.10)"); // Medium sand
        dg.addColorStop(0.7, "rgba(160,140,100,0.15)"); // Deeper sand
        dg.addColorStop(1, "rgba(120,100,80,0.30)"); // Darker sand at bottom
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = dg;
        ctx.fillRect(x0, minSurfaceY - 100, x1 - x0, y1 - (minSurfaceY - 100));
        ctx.restore();

        // Subtle glow for sand surface
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.15;
        ctx.shadowColor = CONFIG.WATER_GLOW;
        ctx.shadowBlur = 20;
        ctx.fillStyle = CONFIG.WATER_COLOR;
        ctx.fill(sandPath);

        // Sand surface highlight
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "rgba(255,240,200,0.35)"; // Light sandy highlight
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.stroke(sandPath);
        ctx.restore();
      } // End if (surfaceY < bottomY)
    });

    this.perfIncrementCounter("maze.mainWallTiles", mainWallTilesDrawn);
    this.perfIncrementCounter("maze.sideWallTiles", sideWallTilesDrawn);
    this.perfIncrementCounter("maze.itemTiles", itemTilesDrawn);
    this.perfIncrementCounter("maze.fogTiles", fogTilesDrawn);
    this.perfIncrementCounter("maze.sandSurfaceSamples", sandSurfaceSamples);

    ctx.restore();
  }

  private draw3DCube(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    z: number,
    size: number,
    rotX: number,
    rotY: number,
    rotZ: number,
    alpha: number = 1.0,
  ): void {
    const t = performance.now() * 0.001;

    const wiggleX = Math.sin(t * 4.5) * 0.08;
    const wiggleY = Math.cos(t * 3.8) * 0.08;
    const wiggleZ = Math.sin(t * 5.2) * 0.06;
    const squashX = 1.0 + Math.sin(t * 3.2) * 0.12;
    const squashY = 1.0 + Math.cos(t * 2.9) * 0.12;
    const squashZ = 1.0 + Math.sin(t * 4.1) * 0.1;

    const halfSize = size * 0.5;

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);

    const vertices = [
      [-halfSize * squashX, -halfSize * squashY, -halfSize * squashZ],
      [halfSize * squashX, -halfSize * squashY, -halfSize * squashZ],
      [halfSize * squashX, halfSize * squashY, -halfSize * squashZ],
      [-halfSize * squashX, halfSize * squashY, -halfSize * squashZ],
      [-halfSize * squashX, -halfSize * squashY, halfSize * squashZ],
      [halfSize * squashX, -halfSize * squashY, halfSize * squashZ],
      [halfSize * squashX, halfSize * squashY, halfSize * squashZ],
      [-halfSize * squashX, halfSize * squashY, halfSize * squashZ],
    ];

    const wobbleRotX = rotX + wiggleX;
    const wobbleRotY = rotY + wiggleY;
    const wobbleRotZ = rotZ + wiggleZ;
    const cosWX = Math.cos(wobbleRotX);
    const sinWX = Math.sin(wobbleRotX);
    const cosWY = Math.cos(wobbleRotY);
    const sinWY = Math.sin(wobbleRotY);
    const cosWZ = Math.cos(wobbleRotZ);
    const sinWZ = Math.sin(wobbleRotZ);

    const rotatedVertices = vertices.map(([vx, vy, vz]) => {
      let x1 = vx * cosWY - vz * sinWY;
      let y1 = vy;
      let z1 = vx * sinWY + vz * cosWY;
      let x2 = x1;
      let y2 = y1 * cosWX - z1 * sinWX;
      let z2 = y1 * sinWX + z1 * cosWX;
      let x3 = x2 * cosWZ - y2 * sinWZ;
      let y3 = x2 * sinWZ + y2 * cosWZ;
      let z3 = z2;
      return { x: x3, y: y3, z: z3 };
    });

    const colorShift = getColorShift(t, 0);
    const colorShift2 = getColorShift(t, Math.PI);
    const colorShift3 = getColorShift(t, Math.PI * 0.5);

    const faces = [
      {
        indices: [0, 1, 2, 3],
        color: getColorString(255, 255, 255, 0.95),
        name: "front",
      },
      {
        indices: [5, 4, 7, 6],
        color: getColorString(
          colorShift2.r,
          colorShift2.g,
          colorShift2.b,
          0.55,
        ),
        name: "back",
      },
      {
        indices: [4, 0, 3, 7],
        color: getColorString(colorShift.r, colorShift.g, colorShift.b, 0.75),
        name: "left",
      },
      {
        indices: [1, 5, 6, 2],
        color: getColorString(colorShift.r, colorShift.g, colorShift.b, 0.75),
        name: "right",
      },
      {
        indices: [4, 5, 1, 0],
        color: getColorString(colorShift3.r, colorShift3.g, colorShift3.b, 0.7),
        name: "top",
      },
      {
        indices: [3, 2, 6, 7],
        color: getColorString(colorShift2.r, colorShift2.g, colorShift2.b, 0.5),
        name: "bottom",
      },
    ];

    const sortedFaces = faces
      .map((face) => {
        const avgZ =
          face.indices.reduce((sum, idx) => sum + rotatedVertices[idx].z, 0) /
          face.indices.length;
        return { ...face, avgZ };
      })
      .sort((a, b) => a.avgZ - b.avgZ);

    const perspective = 300;

    ctx.save();
    const zScale = perspective / (perspective + z);
    const zOffsetY = z * 0.3;
    ctx.translate(x, y + zOffsetY);
    ctx.scale(zScale, zScale);
    ctx.globalAlpha = alpha;

    for (const face of sortedFaces) {
      const projected = face.indices.map((idx) => {
        const v = rotatedVertices[idx];
        const scale = perspective / (perspective + v.z + z);
        return {
          x: v.x * scale,
          y: v.y * scale,
          z: v.z + z,
        };
      });

      const v0 = {
        ...rotatedVertices[face.indices[0]],
        z: rotatedVertices[face.indices[0]].z + z,
      };
      const v1 = {
        ...rotatedVertices[face.indices[1]],
        z: rotatedVertices[face.indices[1]].z + z,
      };
      const v2 = {
        ...rotatedVertices[face.indices[2]],
        z: rotatedVertices[face.indices[2]].z + z,
      };
      const dx1 = v1.x - v0.x;
      const dy1 = v1.y - v0.y;
      const dz1 = v1.z - v0.z;
      const dx2 = v2.x - v0.x;
      const dy2 = v2.y - v0.y;
      const dz2 = v2.z - v0.z;
      const nx = dy1 * dz2 - dz1 * dy2;
      const ny = dz1 * dx2 - dx1 * dz2;
      const nz = dx1 * dy2 - dy1 * dx2;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const normalZ = len > 0 ? nz / len : 0;

      if (normalZ < 0) continue;

      const light = Math.max(0.3, normalZ * 0.7 + 0.5);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";

      const grad = ctx.createLinearGradient(
        projected[0].x,
        projected[0].y,
        projected[2].x,
        projected[2].y,
      );
      const baseColor = face.color;
      const baseAlpha = parseFloat(baseColor.match(/0\.\d+/)?.[0] || "0.8");
      const brightAlpha = Math.min(1, baseAlpha * light * alpha);
      const darkAlpha = Math.max(0.2, baseAlpha * light * 0.7 * alpha);
      const brightColor = baseColor.replace(
        /rgba\([^)]+\)/,
        `rgba(255,255,200,${brightAlpha})`,
      ); // Warm gold highlight
      const darkColor = baseColor.replace(
        /rgba\([^)]+\)/,
        `rgba(180,140,80,${darkAlpha})`,
      ); // Amber shadow
      grad.addColorStop(0, brightColor);
      grad.addColorStop(1, darkColor);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i].x, projected[i].y);
      }
      ctx.closePath();
      ctx.fill();

      const edgeColor = getColorShift(t, Math.PI * 0.25);
      ctx.strokeStyle = getColorString(
        edgeColor.r,
        edgeColor.g,
        edgeColor.b,
        0.4 * light * alpha,
      ); // Brighter edges
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.3 * alpha; // Brighter glow for Egyptian theme
    const glowColor = getColorShift(t, 0);
    ctx.shadowColor = getColorString(
      glowColor.r,
      glowColor.g,
      glowColor.b,
      0.7,
    ); // Golden glow
    ctx.shadowBlur = 28;

    const glowSize = size * 1.15;
    const glowHalf = glowSize * 0.5;
    const glowVertices = [
      [-glowHalf, -glowHalf, -glowHalf],
      [glowHalf, -glowHalf, -glowHalf],
      [glowHalf, glowHalf, -glowHalf],
      [-glowHalf, glowHalf, -glowHalf],
      [-glowHalf, -glowHalf, glowHalf],
      [glowHalf, -glowHalf, glowHalf],
      [glowHalf, glowHalf, glowHalf],
      [-glowHalf, glowHalf, glowHalf],
    ];

    const glowRotated = glowVertices.map(([vx, vy, vz]) => {
      let x1 = vx * cosWY - vz * sinWY;
      let y1 = vy;
      let z1 = vx * sinWY + vz * cosWY;
      let x2 = x1;
      let y2 = y1 * cosWX - z1 * sinWX;
      let z2 = y1 * sinWX + z1 * cosWX;
      let x3 = x2 * cosWZ - y2 * sinWZ;
      let y3 = x2 * sinWZ + y2 * cosWZ;
      let z3 = z2;
      return { x: x3, y: y3, z: z3 };
    });

    const glowPerspective = 300;
    const glowProjected = [0, 1, 2, 3].map((idx) => {
      const v = glowRotated[idx];
      const scale = glowPerspective / (glowPerspective + v.z + z);
      return {
        x: v.x * scale,
        y: v.y * scale,
      };
    });

    ctx.fillStyle = getColorString(glowColor.r, glowColor.g, glowColor.b, 0.4);
    ctx.beginPath();
    ctx.moveTo(glowProjected[0].x, glowProjected[0].y);
    for (let i = 1; i < glowProjected.length; i++) {
      ctx.lineTo(glowProjected[i].x, glowProjected[i].y);
    }
    ctx.closePath();
    ctx.fill();

    const radialGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowHalf * 1.2);
    radialGlow.addColorStop(
      0,
      getColorString(glowColor.r, glowColor.g, glowColor.b, 0.3),
    );
    radialGlow.addColorStop(
      0.5,
      getColorString(glowColor.r, glowColor.g, glowColor.b, 0.15),
    );
    radialGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radialGlow;
    ctx.fillRect(-glowHalf * 1.5, -glowHalf * 1.5, glowHalf * 3, glowHalf * 3);

    ctx.restore();

    ctx.restore();
  }

  private drawTrail(): void {
    if (this.trail.length < 2) return;

    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);

    // Mummy-style horizontal bandage streak, pixel-art style:
    // 3 distinct horizontal bands behind the player, stepped lengths.
    ctx.globalCompositeOperation = "source-over";
    (ctx as any).imageSmoothingEnabled = false;

    // Determine trail direction (opposite of movement)
    let dirX = 0;
    let dirY = 0;
    if (this.playerDirection === "right") {
      dirX = -1;
    } else if (this.playerDirection === "left") {
      dirX = 1;
    } else if (this.playerDirection === "up") {
      dirY = 1;
    } else if (this.playerDirection === "down") {
      dirY = -1;
    }

    // Perpendicular vector for stacking bands
    const perpX = -dirY;
    const perpY = dirX;

    // Core band definitions: highlight, mid, shadow (reduced widths for less intensity)
    // Each band starts at a different point in the trail to create stepped ends
    const bands = [
      { tone: "highlight" as const, width: 3, startRatio: 0.0, offset: 0 }, // Longest: starts from beginning
      { tone: "mid" as const, width: 2.5, startRatio: 0.15, offset: 6 }, // Medium: starts 15% in
      { tone: "shadow" as const, width: 2, startRatio: 0.35, offset: 11 }, // Shortest: starts 35% in
    ];

    for (const band of bands) {
      let r = 243;
      let g = 234;
      let b = 214;
      if (band.tone === "mid") {
        r = 216;
        g = 203;
        b = 176;
      } else if (band.tone === "shadow") {
        r = 179;
        g = 162;
        b = 127;
      }

      // Calculate starting index for this band
      const startIdx = Math.floor(this.trail.length * band.startRatio);
      if (startIdx >= this.trail.length - 1) continue;

      // Offset band perpendicular to direction to form a stepped "stair"
      const offX = perpX * band.offset;
      const offY = perpY * band.offset;

      // Draw trail with alpha fade for reduced intensity
      // Use average alpha of trail points for this band
      let avgAlpha = 0;
      let pointCount = 0;
      for (let i = startIdx; i < this.trail.length; i++) {
        avgAlpha += this.trail[i].alpha;
        pointCount++;
      }
      avgAlpha = pointCount > 0 ? avgAlpha / pointCount : 0;
      // Reduce overall intensity with lower alpha multiplier
      const trailAlpha = avgAlpha * 0.6; // Reduced from 1.0 to 0.6 for less intensity

      ctx.beginPath();
      for (let i = startIdx; i < this.trail.length; i++) {
        const point = this.trail[i];
        const x = Math.round(point.x - this.cameraX + offX);
        const y = Math.round(point.y - this.cameraY + offY);

        if (i === startIdx) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = getColorString(r, g, b, trailAlpha);
      ctx.lineWidth = band.width;
      ctx.lineCap = "butt"; // square ends
      ctx.lineJoin = "miter";
      ctx.shadowColor = "rgba(0,0,0,0)";
      ctx.shadowBlur = 0;
      ctx.stroke();
    }

    ctx.restore();
  }

  private spawnActiveSpriteEffect(
    x: number,
    y: number,
    sprite: HTMLImageElement | null,
    totalFrames: number,
    fps: number,
    scale: number,
  ): void {
    if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return;
    this.activeSpriteEffects.push({
      x,
      y,
      sprite,
      totalFrames,
      currentFrame: 0,
      timePerFrame: 1 / fps,
      elapsedTime: 0,
      scale,
    });
  }

  private spawnDashParticles(x: number, y: number, direction: Direction): void {
    const count = this.isMobile
      ? 1 + Math.floor(Math.random() * 2) // 1-2 particles on mobile
      : 3 + Math.floor(Math.random() * 3); // 3-5 particles

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 30;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // Add directional bias based on dash direction
      let biasX = 0;
      let biasY = 0;
      if (direction === "right") biasX = 15;
      else if (direction === "left") biasX = -15;
      else if (direction === "down") biasY = 15;
      else if (direction === "up") biasY = -15;

      this.particles.push({
        x: x, // Exact player position
        y: y, // Exact player position
        vx: vx + biasX,
        vy: vy + biasY,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 2 + Math.random() * 3,
        color: `rgba(255, 240, 200, 1)`, // Light golden/sandy color
        type: "dash",
      });
    }
  }

  private spawnLandingParticles(x: number, y: number): void {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 particles

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 40;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      this.particles.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 3 + Math.random() * 4,
        color: `rgba(194, 178, 128, 1)`, // Sandy/dust color
        type: "landing",
      });
    }
  }

  private executeTeleport(): void {
    if (!this.pendingTeleport) return;
    const dest = this.pendingTeleport;
    this.playerTileX = dest.x;
    this.playerTileY = dest.y;
    this.playerX = dest.x * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.playerY = dest.y * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.playerDirection = dest.dir;
    this.pendingTeleport = null;

    this.triggerHaptic("success");
    this.audio.playTeleportGate();

    const warpScale = (CONFIG.TILE_SIZE * 2) / 100;
    this.spawnWarpVfx(this.playerX, this.playerY, warpScale);

    this.teleportBtn?.classList.add("hidden");
  }

  private findTeleportDestination(
    fromX: number,
    fromY: number,
    currentDir: Direction,
  ): { x: number; y: number; dir: Direction } | null {
    const opposite: Record<Direction, Direction> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };
    const checks: [Direction, number, number][] = [
      ["up", 0, -1],
      ["down", 0, 1],
      ["left", -1, 0],
      ["right", 1, 0],
    ];

    const simulateMoves = (
      numMoves: number,
    ): { x: number; y: number; dir: Direction } | null => {
      let simX = fromX;
      let simY = fromY;
      let simDir = currentDir;

      for (let move = 0; move < numMoves; move++) {
        const possibleDirs: Direction[] = [];
        for (const [d, dx, dy] of checks) {
          if (d === opposite[simDir]) continue;
          let nx = simX + dx;
          let ny = simY + dy;
          if (nx < 0) nx = CONFIG.MAZE_COLS - 1;
          if (nx >= CONFIG.MAZE_COLS) nx = 0;
          const t = this.getTileType(nx, ny);
          if (t !== "wall" && t !== "empty") {
            possibleDirs.push(d);
          }
        }

        if (possibleDirs.length === 0) {
          for (const [d, dx, dy] of checks) {
            let nx = simX + dx;
            let ny = simY + dy;
            if (nx < 0) nx = CONFIG.MAZE_COLS - 1;
            if (nx >= CONFIG.MAZE_COLS) nx = 0;
            const t = this.getTileType(nx, ny);
            if (t !== "wall" && t !== "empty") {
              possibleDirs.push(d);
            }
          }
        }
        if (possibleDirs.length === 0) return null;

        simDir = possibleDirs.includes(simDir) ? simDir : possibleDirs[0];
        const dashEnd = this.calculateDashEnd(simX, simY, simDir);
        simX = dashEnd.tileX;
        simY = dashEnd.tileY;
      }

      const t = this.getTileType(simX, simY);
      if (t === "trap" || t === "wall" || t === "empty") return null;
      return { x: simX, y: simY, dir: simDir };
    };

    // Try 2 moves first, fall back to 1 move
    return simulateMoves(2) ?? simulateMoves(1);
  }

  private spawnWarpVfx(_x: number, _y: number, _scale: number): void {
    // Warp VFX placeholder - visual effect at teleport destination
  }

  private spawnDeathParticles(x: number, y: number): void {
    const count = 15 + Math.floor(Math.random() * 10); // 15-24 particles

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 50;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      this.deathParticles.push({
        x: x, // Exact player position
        y: y, // Exact player position
        vx: vx,
        vy: vy,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        size: 4 + Math.random() * 5,
        color: `rgba(150, 100, 80, 1)`, // Darker sandy/brown color for death
        type: "landing", // Reuse landing type
      });
    }
  }

  private updateDeathAnimation(dt: number): void {
    this.deathTimer += dt;

    // Update death particles
    for (let i = this.deathParticles.length - 1; i >= 0; i--) {
      const p = this.deathParticles[i];

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Apply gravity and friction
      p.vy += 200 * dt; // Gravity
      p.vx *= 0.92; // More friction for death particles
      p.vy *= 0.92;

      // Update life
      p.life -= dt;

      // Remove dead particles
      if (p.life <= 0) {
        this.deathParticles.splice(i, 1);
      }
    }

    // When animation completes, handle game over or reset
    if (this.deathTimer >= this.deathDuration) {
      this.lives--;
      if (this.lives <= 0) {
        this.gameOver();
      } else {
        this.resetGame();
      }
      // Clear death particles
      this.deathParticles = [];
    }
  }

  private bgParticleTimer = 0;

  private updateBackgroundParticles(dt: number): void {
    const w = this.viewW();
    const h = this.viewH();

    // Spawn golden dust particles (increased frequency for richer atmosphere)
    const maxParticles = this.isMobile ? 8 : 40;
    const spawnInterval = this.isMobile ? 1.0 : 0.3; // seconds between spawns
    
    this.bgParticleTimer += dt;
    if (this.bgParticleTimer > spawnInterval && this.bgParticles.length < maxParticles) {
      this.bgParticleTimer = 0;
      const timeMs = performance.now();
      this.bgParticles.push({
        x: (Math.sin(timeMs * 0.01) * 0.5 + 0.5) * w,
        y: -20,
        speed: 10 + (timeMs % 20), // Gentle falling
        size: 1 + (timeMs % 2.5),
        alpha: 0.15 + (timeMs % 0.25), // Visible golden motes
        wobble: (timeMs % (Math.PI * 2)),
        phase: 0.5 + (timeMs % 1.5),
      });
    }

    // Update existing particles
    for (let i = this.bgParticles.length - 1; i >= 0; i--) {
      const p = this.bgParticles[i];
      p.y += p.speed * dt;
      p.x += Math.sin(p.wobble + performance.now() * 0.001) * 20 * dt; // Slight drift

      // Remove if off screen
      if (p.y > h + 50) {
        this.bgParticles.splice(i, 1);
      }
    }

    // Update background scroll
    this.bgScrollY += 15 * dt; // Slow persistent scroll
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Apply gravity and friction
      p.vy += 200 * dt; // Gravity
      p.vx *= 0.95; // Friction
      p.vy *= 0.95;

      // Update life
      p.life -= dt;

      // Remove dead particles
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.activeSpriteEffects.length - 1; i >= 0; i--) {
      const effect = this.activeSpriteEffects[i];
      effect.elapsedTime += dt;
      if (effect.elapsedTime >= effect.timePerFrame) {
        effect.currentFrame++;
        effect.elapsedTime -= effect.timePerFrame;
      }
      if (effect.currentFrame >= effect.totalFrames) {
        this.activeSpriteEffects.splice(i, 1);
      }
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);

    // Transform to world coordinates
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);

    // Draw regular particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + alpha * 0.5); // Shrink as it dies

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      // Draw particle as a circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Add glow for landing particles
      if (!this.isMobile && p.type === "landing" && alpha > 0.5) {
        ctx.shadowBlur = size * 2;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw death particles
    for (const p of this.deathParticles) {
      const alpha = p.life / p.maxLife;
      const size = p.size * (0.5 + alpha * 0.5);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Add glow for death particles
      if (!this.isMobile && alpha > 0.5) {
        ctx.shadowBlur = size * 1.5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    for (const effect of this.activeSpriteEffects) {
      if (
        !effect.sprite ||
        !effect.sprite.complete ||
        effect.sprite.naturalWidth === 0
      )
        continue;
      const frameWidth = effect.sprite.naturalWidth / effect.totalFrames;
      const frameHeight = effect.sprite.naturalHeight;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.scale(effect.scale, effect.scale);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(
        effect.sprite,
        effect.currentFrame * frameWidth,
        0,
        frameWidth,
        frameHeight,
        -frameWidth / 2,
        -frameHeight / 2,
        frameWidth,
        frameHeight,
      );
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawDoppelganger(): void {
    if (!this.doppelgangerActive) return;

    const ctx = this.ctx;
    const t = performance.now() * 0.001;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);

    // Draw fire trail
    for (let i = 0; i < this.doppelgangerTrail.length; i++) {
      const p = this.doppelgangerTrail[i];
      const flicker = 0.85 + Math.sin(t * 16 + i * 0.7) * 0.15;
      const r = p.size * flicker;
      if (this.isMobile) {
        ctx.fillStyle = `rgba(255, 120, 30, ${p.alpha * 0.55})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.65, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const trailGlow = ctx.createRadialGradient(
        p.x,
        p.y,
        r * 0.2,
        p.x,
        p.y,
        r,
      );
      trailGlow.addColorStop(0, `rgba(255, 255, 180, ${p.alpha * 0.95})`);
      trailGlow.addColorStop(0.35, `rgba(255, 190, 40, ${p.alpha * 0.8})`);
      trailGlow.addColorStop(0.7, `rgba(255, 90, 0, ${p.alpha * 0.55})`);
      trailGlow.addColorStop(1, `rgba(120, 20, 0, 0)`);
      ctx.fillStyle = trailGlow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw fireball body
    const cx = this.doppelgangerX + CONFIG.TILE_SIZE / 2;
    const cy = this.doppelgangerY + CONFIG.TILE_SIZE / 2;
    const coreR = CONFIG.PLAYER_BODY * 0.36;
    const glowR = CONFIG.PLAYER_BODY * (0.78 + 0.1 * Math.sin(t * 18));

    const outer = ctx.createRadialGradient(cx, cy, coreR * 0.4, cx, cy, glowR);
    outer.addColorStop(0, "rgba(255, 250, 210, 0.95)");
    outer.addColorStop(0.35, "rgba(255, 205, 90, 0.92)");
    outer.addColorStop(0.68, "rgba(255, 120, 20, 0.82)");
    outer.addColorStop(1, "rgba(180, 30, 0, 0)");
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(cx, cy, coreR * 0.15, cx, cy, coreR);
    core.addColorStop(0, "rgba(255, 255, 230, 1)");
    core.addColorStop(0.5, "rgba(255, 225, 140, 0.96)");
    core.addColorStop(1, "rgba(255, 140, 20, 0.82)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    ctx.save();
    const zoom = CONFIG.ZOOM;
    ctx.scale(zoom, zoom);

    // Draw mummy cloth during dash (before player so it appears behind)
    if (this.dashFlash) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;

      const clothStartX = this.dashFlash.clothStartX - this.cameraX;
      const clothStartY = this.dashFlash.clothStartY - this.cameraY;

      // Cloth connects to current player position (being pulled / trailing)
      const clothEndX = this.playerX - this.cameraX;
      const clothEndY = this.playerY - this.cameraY;

      // Calculate cloth direction and length
      const dx = clothEndX - clothStartX;
      const dy = clothEndY - clothStartY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Draw cloth as a bandage strip with multiple bands (similar to trail style)
      const bands = [
        { tone: "highlight" as const, width: 6, offset: 0 },
        { tone: "mid" as const, width: 5, offset: 3 },
        { tone: "shadow" as const, width: 4, offset: 6 },
      ];

      for (const band of bands) {
        let r = 243,
          g = 234,
          b = 214;
        if (band.tone === "mid") {
          r = 216;
          g = 203;
          b = 176;
        } else if (band.tone === "shadow") {
          r = 179;
          g = 162;
          b = 127;
        }

        // Offset perpendicular to cloth direction
        const perpX = -Math.sin(angle) * band.offset;
        const perpY = Math.cos(angle) * band.offset;

        ctx.save();
        ctx.translate(clothStartX + perpX, clothStartY + perpY);
        ctx.rotate(angle);

        // Draw cloth strip with slight curve/sag for realism
        ctx.beginPath();
        const segments = 8;
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const x = t * length;
          // Add slight sag in the middle (parabolic curve)
          const sag = Math.sin(t * Math.PI) * 2;
          const y = sag;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = getColorString(r, g, b, 0.9);
        ctx.lineWidth = band.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    const t = performance.now() * 0.001;

    const waveOffsetX = waterWaveY(0, this.playerY, t) * 0.12;

    ctx.translate(
      this.playerX - this.cameraX + waveOffsetX,
      this.playerY - this.cameraY,
    );

    if (this.dashFlash) {
      const flashAlpha =
        0.4 + 0.6 * (1 - Math.abs(this.dashFlash.progress - 0.5) * 2);
      ctx.globalAlpha = flashAlpha;
    }

    // Apply bounce effect when hitting wall
    let bounceOffsetX = 0;
    let bounceOffsetY = 0;
    let bounceScale = 1.0;

    if (this.wallHitBounce > 0) {
      const bounceAmount = this.wallHitBounce * 3.0; // Bounce distance
      const scaleSquash = 1.0 - this.wallHitBounce * 0.3; // Squash effect
      const scaleStretch = 1.0 + this.wallHitBounce * 0.2; // Stretch effect

      if (this.wallHitDirection === "right") {
        bounceOffsetX = -bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "left") {
        bounceOffsetX = bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "down") {
        bounceOffsetY = -bounceAmount;
        bounceScale = scaleSquash;
      } else if (this.wallHitDirection === "up") {
        bounceOffsetY = bounceAmount;
        bounceScale = scaleSquash;
      }
    }

    ctx.translate(bounceOffsetX, bounceOffsetY);
    ctx.scale(bounceScale, bounceScale);

    // Choose sprite: dash sprite while dashing, otherwise idle sprite
    let sprite: HTMLImageElement | null = null;
    const isDashing =
      this.dashFlash &&
      this.playerDashSprite &&
      this.playerDashSprite.complete &&
      this.playerDashSprite.naturalWidth > 0;

    if (isDashing) {
      sprite = this.playerDashSprite;
    } else if (
      this.playerIdleSprite &&
      this.playerIdleSprite.complete &&
      this.playerIdleSprite.naturalWidth > 0
    ) {
      sprite = this.playerIdleSprite;
    }

    let rotation = 0;
    let flipX = false;

    if (isDashing) {
      // Dash rotation: sprite naturally faces RIGHT
      if (this.playerDirection === "right") {
        rotation = 0;
      } else if (this.playerDirection === "left") {
        rotation = Math.PI;
      } else if (this.playerDirection === "up") {
        rotation = -Math.PI / 2;
      } else if (this.playerDirection === "down") {
        rotation = Math.PI / 2;
      }
    } else {
      // Idle: feet plant on the wall, face toward open path
      const openLeft = this.canMove(this.playerTileX, this.playerTileY, "left");
      const openRight = this.canMove(
        this.playerTileX,
        this.playerTileY,
        "right",
      );
      const openUp = this.canMove(this.playerTileX, this.playerTileY, "up");
      const openDown = this.canMove(this.playerTileX, this.playerTileY, "down");

      if (this.playerDirection === "right") {
        rotation = -Math.PI / 2;
        if (openDown && !openUp) flipX = true;
      } else if (this.playerDirection === "left") {
        rotation = Math.PI / 2;
        if (openUp && !openDown) flipX = true;
      } else if (this.playerDirection === "up") {
        rotation = Math.PI;
        if (openRight && !openLeft) flipX = true;
      } else if (this.playerDirection === "down") {
        rotation = 0;
        if (openLeft && !openRight) flipX = true;
      }
    }

    ctx.rotate(rotation);

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const targetSize = CONFIG.PLAYER_BODY * 0.85;
      let scaleX = targetSize / sprite.naturalWidth;
      const scaleY = targetSize / sprite.naturalHeight;

      if (flipX) scaleX *= -1;

      // Apply Status Effect Filters
      if (this.speedMultiplier > 1.0) {
        ctx.filter = "brightness(1.4) sepia(1) hue-rotate(10deg) saturate(4)";
      } else if (this.speedMultiplier < 1.0) {
        ctx.filter = "brightness(1.2) sepia(1) hue-rotate(170deg) saturate(2)";
      }

      ctx.scale(scaleX, scaleY);
      ctx.drawImage(
        sprite,
        -sprite.naturalWidth / 2,
        -sprite.naturalHeight / 2,
      );

      ctx.filter = "none"; // Reset filter

      // Draw Status Effect Particles
      const time = performance.now() * 0.001;

      if (this.speedMultiplier > 1.0) {
        if (
          this.lightningAuraSprite &&
          this.lightningAuraSprite.complete &&
          this.lightningAuraSprite.naturalWidth > 0
        ) {
          ctx.save();
          const totalFrames = 10;
          const frameWidth =
            this.lightningAuraSprite.naturalWidth / totalFrames;
          const frameHeight = this.lightningAuraSprite.naturalHeight;
          const fps = 15;
          const currentFrame = Math.floor(time * fps) % totalFrames;

          ctx.scale(1 / scaleX, 1 / scaleY);

          const auraTargetSize = CONFIG.PLAYER_BODY * 2.0;
          const auraScaleX = auraTargetSize / frameWidth;
          const auraScaleY = auraTargetSize / frameHeight;

          ctx.scale(auraScaleX, auraScaleY);
          ctx.shadowColor = "rgba(255, 255, 0, 0.8)";
          if (!this.isMobile) ctx.shadowBlur = 15;

          ctx.drawImage(
            this.lightningAuraSprite,
            currentFrame * frameWidth,
            0,
            frameWidth,
            frameHeight,
            -frameWidth / 2,
            -frameHeight / 2,
            frameWidth,
            frameHeight,
          );
          ctx.restore();
        }
      } else if (this.speedMultiplier < 1.0) {
        // Ice Crystals / Snowflakes - ENHANCED
        ctx.fillStyle = "rgba(150, 240, 255, 1.0)"; // Brighter cyan
        ctx.shadowColor = "white";
        if (!this.isMobile) ctx.shadowBlur = 15;

        for (let i = 0; i < 8; i++) {
          // More crystals
          const angle = time * 2.0 + i * ((Math.PI * 2) / 8);
          const dist = sprite.naturalWidth * 0.8 + Math.sin(time * 5 + i) * 15;
          const sx = Math.cos(angle) * dist;
          const sy = Math.sin(angle) * dist;

          ctx.beginPath();
          // Larger Diamond shape with pulsing size
          const size = 12 + Math.sin(time * 10 + i) * 3;
          ctx.moveTo(sx, sy - size);
          ctx.lineTo(sx + size * 0.6, sy);
          ctx.lineTo(sx, sy + size);
          ctx.lineTo(sx - size * 0.6, sy);
          ctx.fill();
        }
      }
    } else {
      // Fallback: draw a simple rectangle if sprites not loaded
      ctx.fillStyle = CONFIG.PLAYER_COLOR;
      ctx.fillRect(
        -CONFIG.PLAYER_BODY / 2,
        -CONFIG.PLAYER_BODY / 2,
        CONFIG.PLAYER_BODY,
        CONFIG.PLAYER_BODY,
      );
    }

    ctx.restore();
  }

  // Debug functions removed

  // ===== VISUAL EFFECTS =====

  // 1. Light Rays / God Rays — golden shafts of light from above
  private drawLightRays(): void {
    if (this.isMobile) return;
    const ctx = this.ctx;
    const w = this.viewW();
    const h = this.viewH();
    const t = performance.now() * 0.001;

    // Initialize light rays once
    if (this.lightRays.length === 0) {
      for (let i = 0; i < 5; i++) {
        this.lightRays.push({
          x: Math.random() * w,
          width: 30 + Math.random() * 60,
          speed: 8 + Math.random() * 15,
          alpha: 0.03 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const ray of this.lightRays) {
      const currentX = ray.x + Math.sin(t * 0.3 + ray.phase) * 40;
      const pulseAlpha =
        ray.alpha * (0.7 + 0.3 * Math.sin(t * 0.5 + ray.phase));

      const grad = ctx.createLinearGradient(currentX, 0, currentX, h);
      grad.addColorStop(0, `rgba(255, 210, 80, ${pulseAlpha * 1.5})`);
      grad.addColorStop(0.3, `rgba(255, 180, 40, ${pulseAlpha})`);
      grad.addColorStop(0.7, `rgba(255, 160, 20, ${pulseAlpha * 0.5})`);
      grad.addColorStop(1, `rgba(255, 140, 0, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(currentX - ray.width * 0.3, 0);
      ctx.lineTo(currentX + ray.width * 0.3, 0);
      ctx.lineTo(currentX + ray.width * 0.8, h);
      ctx.lineTo(currentX - ray.width * 0.8, h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // 2. Vignette — dark edges around screen
  private drawVignette(): void {
    const ctx = this.ctx;
    const w = this.viewW();
    const h = this.viewH();

    if (
      !this.cachedVignetteGradient ||
      this.cachedVignetteSize.w !== w ||
      this.cachedVignetteSize.h !== h
    ) {
      const vg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.min(w, h) * 0.3,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.75,
      );
      vg.addColorStop(0, "rgba(0, 0, 0, 0)");
      vg.addColorStop(0.6, "rgba(0, 0, 0, 0)");
      vg.addColorStop(1, "rgba(0, 0, 0, 0.4)");
      this.cachedVignetteGradient = vg;
      this.cachedVignetteSize = { w, h };
    }

    ctx.save();
    ctx.fillStyle = this.cachedVignetteGradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 3. Dash Speed Lines — motion blur lines during dash
  private updateDashSpeedLines(dt: number): void {
    // Spawn speed lines when dashing
    if (this.dashFlash && this.dashFlash.progress < 0.8) {
      const zoom = CONFIG.ZOOM;
      const px = (this.playerX - this.cameraX) * zoom;
      const py = (this.playerY - this.cameraY) * zoom;
      const w = this.viewW();
      const h = this.viewH();

      const spawnCount = this.isMobile ? 1 : 3;
      for (let i = 0; i < spawnCount; i++) {
        const timeMs = performance.now() + i * 100;
        this.dashSpeedLines.push({
          x: px + (Math.sin(timeMs * 0.01) - 0.5) * w * 0.6,
          y: py + (Math.cos(timeMs * 0.01) - 0.5) * h * 0.4,
          length: 20 + (timeMs % 40),
          alpha: 0.15 + (timeMs % 0.2),
          life: 0.15 + (timeMs % 0.1),
          maxLife: 0.15 + (timeMs % 0.1),
        });
      }
      const maxLines = this.isMobile ? 10 : 32;
      if (this.dashSpeedLines.length > maxLines) {
        this.dashSpeedLines.splice(0, this.dashSpeedLines.length - maxLines);
      }
    }

    // Update existing
    for (let i = this.dashSpeedLines.length - 1; i >= 0; i--) {
      this.dashSpeedLines[i].life -= dt;
      if (this.dashSpeedLines[i].life <= 0) {
        this.dashSpeedLines.splice(i, 1);
      }
    }
  }

  private drawDashSpeedLines(): void {
    if (this.dashSpeedLines.length === 0) return;

    const ctx = this.ctx;
    ctx.save();

    for (const line of this.dashSpeedLines) {
      const lifeRatio = line.life / line.maxLife;
      const alpha = line.alpha * lifeRatio;

      ctx.strokeStyle = `rgba(255, 230, 180, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      // Lines stretch in the direction of movement
      let dx = 0,
        dy = 0;
      if (this.playerDirection === "up") dy = line.length;
      else if (this.playerDirection === "down") dy = -line.length;
      else if (this.playerDirection === "left") dx = line.length;
      else dx = -line.length;

      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x + dx, line.y + dy);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 4. Fireball Aura — pulsing heat glow
  private drawDoppelgangerAura(): void {
    if (!this.doppelgangerActive) return;

    const ctx = this.ctx;
    const zoom = CONFIG.ZOOM;
    const t = performance.now() * 0.001;
    this.doppelgangerAuraTimer = t;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-this.cameraX + this.shakeX, -this.cameraY + this.shakeY);

    const cx = this.doppelgangerX + CONFIG.TILE_SIZE / 2;
    const cy = this.doppelgangerY + CONFIG.TILE_SIZE / 2;
    const size = CONFIG.PLAYER_BODY;

    if (this.isMobile) {
      // Mobile: simple solid circle — no gradient, no embers
      const pulseAlpha = 0.2 + 0.1 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 80, 0, ${pulseAlpha})`;
      ctx.fill();
      ctx.restore();
      return;
    }

    // Desktop: full gradient aura + orbiting embers
    const pulseSize = size * (1.5 + 0.3 * Math.sin(t * 4));
    const pulseAlpha = 0.15 + 0.1 * Math.sin(t * 3);

    const gradient = ctx.createRadialGradient(
      cx,
      cy,
      size * 0.3,
      cx,
      cy,
      pulseSize,
    );
    gradient.addColorStop(0, `rgba(255, 180, 60, ${pulseAlpha * 1.45})`);
    gradient.addColorStop(0.45, `rgba(255, 95, 20, ${pulseAlpha})`);
    gradient.addColorStop(0.75, `rgba(180, 35, 0, ${pulseAlpha * 0.45})`);
    gradient.addColorStop(1, "rgba(90, 15, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(cx - pulseSize, cy - pulseSize, pulseSize * 2, pulseSize * 2);

    // Orbiting embers
    for (let i = 0; i < 6; i++) {
      const angle = t * 2 + i * Math.PI * 0.5;
      const orbitR = size * 0.8 + Math.sin(t * 3 + i) * 3;
      const ex = cx + Math.cos(angle) * orbitR;
      const ey = cy + Math.sin(angle) * orbitR;
      const emberAlpha = 0.4 + 0.3 * Math.sin(t * 5 + i * 2);
      const emberSize = 1.5 + Math.sin(t * 4 + i) * 0.5;

      ctx.beginPath();
      ctx.arc(ex, ey, emberSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, ${140 + i * 12}, 20, ${emberAlpha})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // 5. Sand Surface Effects — foam/bubbles/wave on rising sand
  private drawSandSurfaceEffects(): void {
    const ctx = this.ctx;
    const zoom = CONFIG.ZOOM;
    const t = performance.now() * 0.001;
    const animSpeedMul = 50;
    const slowDurationS = 5;
    const slowFactor = 0.2; // 5x slower for the first 5 seconds
    const elapsedS = Math.max(0, t - this.sandSlowPhaseStartS);
    const slowedElapsedS =
      Math.min(elapsedS, slowDurationS) * slowFactor +
      Math.max(0, elapsedS - slowDurationS);
    const tAnim = (this.sandSlowPhaseStartS + slowedElapsedS) * animSpeedMul;
    const w = this.viewW();
    const h = this.viewH();
    const climbPx = Math.max(
      0,
      this.playerSpawnY * CONFIG.TILE_SIZE - this.playerY,
    );
    const flowPhase = tAnim * 1.2 + climbPx * 0.08;
    const flowShiftPx = (tAnim * 18 + climbPx * 0.4) % Math.max(1, w);

    const playerSurfaceScreenY =
      (sandDuneY(this.waterSurfaceY, this.playerX, t) - this.cameraY) * zoom;
    const edgeAnchorY = clamp(playerSurfaceScreenY, 14, h - 14);
    const useEdgeAnchor =
      playerSurfaceScreenY < 14 || playerSurfaceScreenY > h - 14;

    ctx.save();

    // Wavy sand surface line
    ctx.beginPath();
    const segments = 40;
    for (let i = 0; i <= segments; i++) {
      const sx = (i / segments) * w;
      const worldX = sx / zoom + this.cameraX;
      const duneY = sandDuneY(this.waterSurfaceY, worldX, t);
      const baseScreenY = (duneY - this.cameraY) * zoom;
      const anchorY = useEdgeAnchor ? edgeAnchorY : baseScreenY;
      const waveY =
        anchorY +
        Math.sin(tAnim * 2 + i * 0.5 - flowPhase) * 3 +
        Math.sin(tAnim * 1.3 + i * 0.3 - flowPhase * 0.7) * 2;
      if (i === 0) ctx.moveTo(sx, waveY);
      else ctx.lineTo(sx, waveY);
    }
    ctx.strokeStyle = "rgba(255, 200, 100, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sand dust rising from the surface
    for (let i = 0; i < 15; i++) {
      const pxRaw =
        (Math.sin(tAnim * 0.7 + i * 3.7 - flowPhase * 0.6) * 0.5 + 0.5) * w +
        flowShiftPx;
      const px = ((pxRaw % w) + w) % w;
      const worldX = px / zoom + this.cameraX;
      const duneY = sandDuneY(this.waterSurfaceY, worldX, t);
      const baseScreenY = useEdgeAnchor
        ? edgeAnchorY
        : (duneY - this.cameraY) * zoom;
      const pyRaw =
        baseScreenY - Math.abs(Math.sin(tAnim * 1.5 + i * 2.3)) * 25;
      const py = clamp(pyRaw, 4, h - 4);
      const alpha = clamp(
        0.1 + 0.15 * Math.sin(tAnim * 2 + i * 1.5),
        0.08,
        0.28,
      );
      const size = 1.5 + Math.sin(tAnim + i) * 0.5;

      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 180, 100, ${alpha})`;
      ctx.fill();
    }

    // Shimmer highlight on surface
    const shimmerY = useEdgeAnchor ? edgeAnchorY : playerSurfaceScreenY;
    const shimmerGrad = ctx.createLinearGradient(
      0,
      shimmerY - 5,
      0,
      shimmerY + 5,
    );
    shimmerGrad.addColorStop(0, "rgba(255, 240, 180, 0)");
    shimmerGrad.addColorStop(
      0.5,
      `rgba(255, 240, 180, ${0.1 + 0.05 * Math.sin(tAnim * 3)})`,
    );
    shimmerGrad.addColorStop(1, "rgba(255, 240, 180, 0)");
    ctx.fillStyle = shimmerGrad;
    ctx.fillRect(0, shimmerY - 5, w, 10);

    ctx.restore();
  }

  // 6. Enhanced ambient dust (more golden, more frequent)
  private drawAmbientDust(): void {
    const ctx = this.ctx;
    const w = this.viewW();
    const h = this.viewH();
    const t = performance.now() * 0.001;

    ctx.save();

    for (const p of this.bgParticles) {
      const flicker = 0.7 + 0.3 * Math.sin(t * p.phase + p.wobble);
      const alpha = p.alpha * flicker;

      if (p.size < 1.5) {
        // Small particles: fillRect is faster than arc
        ctx.fillStyle = `rgba(255, 210, 120, ${alpha})`;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        // Larger particles: arc circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 210, 120, ${alpha})`;
        ctx.fill();

        // Tiny glow — skip on mobile
        if (!this.isMobile) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 190, 80, ${alpha * 0.2})`;
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW(), this.viewH());

    this.perfMeasure("render.drawBackground", () => this.drawBackground());
    this.perfMeasure("render.drawLightRays", () => this.drawLightRays()); // God rays on top of background
    if (
      this.state === "PLAYING" ||
      this.state === "DYING" ||
      this.state === "CAUGHT"
    ) {
      this.perfMeasure("render.drawMaze", () => this.drawMaze());
      this.perfMeasure("render.drawTrail", () => this.drawTrail());
      this.perfMeasure("render.drawParticles", () => this.drawParticles());
      if (this.state === "PLAYING" || this.state === "CAUGHT") {
        if (CONFIG.ENABLE_CHASER) {
          if (!this.isMobile)
            this.perfMeasure("render.drawDoppelgangerAura", () =>
              this.drawDoppelgangerAura(),
            ); // Aura BEFORE body
          this.perfMeasure("render.drawDoppelganger", () =>
            this.drawDoppelganger(),
          );
        }
        this.perfMeasure("render.drawPlayer", () => this.drawPlayer());
        this.perfMeasure("render.drawDashSpeedLines", () =>
          this.drawDashSpeedLines(),
        ); // Speed lines on top of player
      }
      if (!this.isMobile && !this.lowPerfMode)
        this.perfMeasure("render.drawAmbientDust", () =>
          this.drawAmbientDust(),
        ); // Golden dust motes
      if (!this.isMobile && !this.lowPerfMode)
        this.perfMeasure("render.drawSandSurfaceEffects", () =>
          this.drawSandSurfaceEffects(),
        ); // Sand surface wave/foam

      // Draw dramatic red flash overlay when caught
      if (CONFIG.ENABLE_CHASER && this.state === "CAUGHT") {
        const progress = Math.min(this.caughtTimer / this.caughtDuration, 1.0);
        const w = this.viewW();
        const h = this.viewH();

        // Pulsing red vignette overlay
        const pulseAlpha = 0.3 + 0.2 * Math.sin(this.caughtTimer * 12);
        ctx.save();
        ctx.globalAlpha = pulseAlpha;
        const vg = ctx.createRadialGradient(
          w * 0.5,
          h * 0.5,
          Math.min(w, h) * 0.15,
          w * 0.5,
          h * 0.5,
          Math.min(w, h) * 0.7,
        );
        vg.addColorStop(0, "rgba(0, 0, 0, 0)");
        vg.addColorStop(0.6, "rgba(200, 0, 0, 0.4)");
        vg.addColorStop(1, "rgba(150, 0, 0, 0.8)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Fade to black towards the end of the caught duration
        if (progress > 0.6) {
          const fadeAlpha = (progress - 0.6) / 0.4; // 0 -> 1 during last 40%
          ctx.save();
          ctx.globalAlpha = fadeAlpha * 0.8;
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
    }

    // Vignette overlay (always visible, cinematic dark edges)
    if (!this.isMobile && !this.lowPerfMode)
      this.perfMeasure("render.drawVignette", () => this.drawVignette());
    if (this.renderCanvas) {
      this.perfMeasure("render.compositeToDisplay", () => {
        const dctx = this.displayCtx;
        dctx.save();
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.imageSmoothingEnabled = true;
        dctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        dctx.drawImage(
          this.renderCanvas!,
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        );

        if (CONFIG.BLOOM_ENABLED && !this.lowPerfMode) {
          this.perfMeasure("render.bloom", () => {
            dctx.globalCompositeOperation = "screen";
            dctx.globalAlpha = CONFIG.BLOOM_STRENGTH;
            dctx.filter = `blur(${CONFIG.BLOOM_BLUR_PX}px)`;
            dctx.drawImage(
              this.renderCanvas!,
              0,
              0,
              this.canvas.width,
              this.canvas.height,
            );
            dctx.filter = "none";
            dctx.globalAlpha = 1.0;
            dctx.globalCompositeOperation = "source-over";
          });
        }
        dctx.restore();
      });
    }

    // Update HUD with score (matches leaderboard submission)
    const distanceEl = document.getElementById("distance");
    if (distanceEl) {
      distanceEl.textContent = `${this.score}`;
    }
  }

  private loop(): void {
    const now = performance.now();
    // Use real frame delta so low-FPS devices do not run in slow motion.
    // Keep a safety cap against tab-switch / long-freeze jumps.
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const frameMs = dt * 1000;
    this.frameTimeEmaMs = this.frameTimeEmaMs * 0.9 + frameMs * 0.1;
    // Adaptive quality with hysteresis: reduce expensive post effects only under sustained load.
    if (this.lowPerfMode) {
      if (this.frameTimeEmaMs < 17.5) this.lowPerfMode = false;
    } else if (this.frameTimeEmaMs > 20) {
      this.lowPerfMode = true;
    }
    const frameStartedAt = performance.now();

    this.perfMeasure("loop.update", () => this.update(dt));
    this.perfMeasure("loop.render", () => this.render());
    this.perfRecordFrame(performance.now() - frameStartedAt);
    this.perfFlushIfNeeded(now);

    this.rafId = requestAnimationFrame(() => this.loop());
  }
}

// Initialize game
new DashBroGame();
