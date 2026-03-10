import { oasiz } from "@oasiz/sdk";
import { detectShape, Point } from "../utils/shapeDetector";
import { showGameOver, triggerHaptic, getSettings } from "../ui";

// Character geometry constants (local coords, feet = 0,0)
const HEAD_R = 22;
const ALL_SYMBOLS = ["Triangle", "Square", "Vertical Line", "Horizontal Line", "Circle", "/", "\\", "V"];
const THIGH = 15;
const SHIN = 15;
const HIP_Y = -(THIGH + SHIN);   // -30  (hip above feet)
const HEAD_CY = HIP_Y - HEAD_R;   // -52  (base head centre, used for explosion)
const HOP_H = 60;
const HOP_CYCLE = 2600;
const ENEMY_SCALE = 2 / 3; // 1.5x smaller
const DARK_ENEMY_CHANCE = 0.20;
const DARK_ENEMY_HOP_MULT = 1.5;
const DARK_LEAP_TRIGGER_MULT = 1.15;

const LEAP_TRIGGER = 115;   // px from wizard centre → start leap
const LEAP_ARC = 130;   // px extra height above the straight line
const LEAP_MS = 620;   // leap duration in ms
const DARK_LEAP_DURATION_MULT = 1.35;

interface Enemy {
    x: number;
    y: number;       // world groundY (container anchor)
    symbols: string[];   // symbols remaining (source of truth for all bosses)
    container: Phaser.GameObjects.Container;
    gfx: Phaser.GameObjects.Graphics;
    speed: number;
    alive: boolean;
    hit: boolean;
    phase: number;
    dark: boolean;
    running: boolean;
    boss: boolean;
    hopMult: number;
    trail: { x: number; y: number; hipY: number }[];
    // leap-attack state
    leaping: boolean;
    leapT: number;   // 0 → 1
    leapSX: number; leapSY: number;   // start world pos
    leapTX: number; leapTY: number;   // target world pos
    canLeap: boolean;
    // boss-specific fields
    bossType: 'colossus' | 'hydra' | 'warlock' | 'void' | null;
    bossPhase: number;      // 0=normal, 1=enraged
    bossTimer: number;      // ms accumulator for special-move clock
    bossHitsLeft: number;   // symbol kills before rage triggers
    neckAlive: boolean[];   // hydra: one entry per original neck
    bossExtraLives: number[]; // per visible symbol: extra hit(s) before removal
}

export default class Level extends Phaser.Scene {

    private enemies: Enemy[] = [];
    private drawingGraphics!: Phaser.GameObjects.Graphics;
    private wizardSprite!: Phaser.GameObjects.Image;
    private feedbackText!: Phaser.GameObjects.Text;
    private scoreText!: Phaser.GameObjects.Text;
    private score = 0;
    private nextBossScore = 250;
    private bossSpawnCount = 0;
    private bossesDefeated = 0;
    private points: Point[] = [];
    private isDrawing = false;
    private groundY = 0;
    private hopH = HOP_H;   // scaled per-device in create()
    private wizardX = 0;
    private spawnLoop?: Phaser.Time.TimerEvent;
    private bossAlive = false;
    private isGameOver = false;
    private bgMusic?: Phaser.Sound.BaseSound;
    private bgMusicTrack = 1;   // 1 = Clockwork Lanterns, 2 = original track
    private bossMusic?: Phaser.Sound.BaseSound;
    private bossMusicActive = false;

    private health = 3;
    private maxHealth = 3;
    private healthIcons: Phaser.GameObjects.Graphics[] = [];

    private comboCount = 0;
    private lastKillTime = 0;
    private comboBreak = false;
    private comboTimeout?: Phaser.Time.TimerEvent;
    private killNoteIdx = 0;
    // Pentatonic scale steps (semitones from root). Ascending then wraps back.
    private readonly KILL_MELODY_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];
    private activeFeedback?: { text: Phaser.GameObjects.Text; burst: Phaser.GameObjects.Graphics; burstProg: { t: number } };

    private attractMode: boolean = false;
    private autoAimTimer: number = 0;
    // Cached settings — updated once on create() and on every settings-changed event.
    // Avoids repeated synchronous localStorage reads in hot paths.
    private _s = { music: true, fx: true, haptics: true };
    // Reusable Graphics pool — avoids per-frame alloc/dealloc of short-lived effect objects.
    private gfxPool: Phaser.GameObjects.Graphics[] = [];
    private attractDrawState: {
        enemy: Enemy;
        symbol: string;
        path: Point[];
        elapsedMs: number;
        durationMs: number;
    } | null = null;
    private attractHintText?: Phaser.GameObjects.Text;

    constructor() {
        super("Level");
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    init(data: any) {
        this.attractMode = data?.attractMode || false;
        this.autoAimTimer = 0;
    }

    create() {
        const h = this.scale.height;
        const w = this.scale.width;
        this.groundY = Math.floor(h / 2) - 16;

        // Hop height scales with screen width: phone (430px) → HOP_H, PC → up to 2× HOP_H
        this.hopH = Math.round(HOP_H * Math.min(w / 430, 2.0));

        this.createBackground();
        this.createWizard();
        this.setupDrawingArea();

        // Reset state before creating health display so the array is clean
        this._s = getSettings();
        this.enemies = [];
        this.spawnLoop = undefined;
        this.points = [];
        this.isDrawing = false;
        this.bossAlive = false;
        this.isGameOver = false;
        this.score = 0;
        this.nextBossScore = 250;
        this.bossSpawnCount = 0;
        this.bossesDefeated = 0;
        this.health = this.maxHealth;
        // Destroy any old icons from a previous run before recreating
        for (const icon of this.healthIcons) icon.destroy();
        this.healthIcons = [];

        this.createHealthDisplay();
        this.setupInput();
        this.comboCount = 0;
        this.lastKillTime = 0;
        this.comboBreak = false;
        this.comboTimeout = undefined;
        this.killNoteIdx = 0;
        this.activeFeedback = undefined;

        this.startSpawnLoop();

        const settingsBtn = document.getElementById("settings-btn") as HTMLElement | null;
        if (settingsBtn && !this.attractMode) {
            settingsBtn.style.display = "";
        }

        // Start on track 1 (Clockwork Lanterns), then alternate to track 2 on loop end
        if (!this.bgMusic) {
            this.bgMusic = this.sound.add('bgMusic1', { loop: false, volume: 1 });
            this.bgMusicTrack = 1;
            this.bgMusic.play();
            this.bgMusic.on('complete', () => this.advanceBgTrack());
        } else if (!this.bgMusic.isPlaying) {
            this.bgMusic.play();
        }

        const onRestart = () => {
            this.scene.restart();
        };
        const onSettings = () => {
            this._s = getSettings();
            const vol = this._s.music ? 1 : 0;
            if (this.bgMusic) (this.bgMusic as any).setVolume(vol);
            if (this.bossMusic) (this.bossMusic as any).setVolume(vol);
        };
        const onBtnClick = () => {
            if (this._s.fx) {
                this.sound.play('btnClick');
            }
        };
        const onPause = () => {
            this.scene.pause();
        };
        const onResume = () => {
            this.scene.resume();
        };

        window.addEventListener('restart-game', onRestart);
        window.addEventListener('settings-changed', onSettings);
        window.addEventListener('btn-click', onBtnClick);
        window.addEventListener('scene-pause', onPause);
        window.addEventListener('scene-resume', onResume);

        // Platform lifecycle — fires when the app is backgrounded / foregrounded
        const offPlatformPause = oasiz.onPause(() => {
            if (this.bgMusic?.isPlaying) this.bgMusic.pause();
            if (this.bossMusic?.isPlaying) (this.bossMusic as any).pause();
            if (!this.isGameOver) this.scene.pause();
        });
        const offPlatformResume = oasiz.onResume(() => {
            if (this._s.music) {
                if (this.bossMusicActive && this.bossMusic && !(this.bossMusic as any).isPlaying) {
                    (this.bossMusic as any).resume();
                } else if (!this.bossMusicActive && this.bgMusic && !this.bgMusic.isPlaying) {
                    this.bgMusic.resume();
                }
            }
            this.scene.resume();
        });

        this.events.once('shutdown', () => {
            offPlatformPause();
            offPlatformResume();
            window.removeEventListener('restart-game', onRestart);
            window.removeEventListener('settings-changed', onSettings);
            window.removeEventListener('btn-click', onBtnClick);
            window.removeEventListener('scene-pause', onPause);
            window.removeEventListener('scene-resume', onResume);
            const btn = document.getElementById("settings-btn") as HTMLElement | null;
            if (btn) btn.style.display = "none";
            // Stop and destroy all music objects so they don't accumulate across restarts.
            if (this.bgMusic) {
                this.bgMusic.removeAllListeners();
                this.bgMusic.destroy();
                this.bgMusic = undefined;
            }
            if (this.bossMusic) {
                (this.bossMusic as any).stop?.();
                this.bossMusic.removeAllListeners();
                this.bossMusic.destroy();
                this.bossMusic = undefined;
            }
            this.bossMusicActive = false;
            // Destroy all pooled Graphics objects to free GPU/CPU memory.
            for (const g of this.gfxPool) g.destroy();
            this.gfxPool = [];
        });

        onSettings();
    }

    // ─── Background ──────────────────────────────────────────────────────────────

    private createBackground(): void {
        const w = this.scale.width;
        const h = this.scale.height;
        const mid = Math.floor(h / 2);

        // ── Base fills ─────────────────────────────────────────────────────────
        this.add.rectangle(w / 2, h / 4, w, h / 2, 0xffffff);
        this.add.rectangle(w / 2, 3 * h / 4, w, h / 2, 0x000000);

        const g = this.add.graphics();

        // ── Top: very faint horizontal scan lines (lined-paper texture) ────────
        for (let y = 24; y < mid - 2; y += 22) {
            g.lineStyle(1, 0x000000, 0.045);
            g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
        }

        // ── Top: corner L-brackets ─────────────────────────────────────────────
        const BL = 22, BP = 14;
        const topCorners: [number, number, number, number][] = [
            [BP, BP, 1, 1],
            [w - BP, BP, -1, 1],
            [BP, mid - BP, 1, -1],
            [w - BP, mid - BP, -1, -1],
        ];
        g.lineStyle(2, 0x000000, 0.32);
        for (const [ox, oy, sx, sy] of topCorners) {
            g.beginPath();
            g.moveTo(ox + sx * BL, oy); g.lineTo(ox, oy); g.lineTo(ox, oy + sy * BL);
            g.strokePath();
        }

        // ── Divider: thick band + thin flanking rules + diamond accents ────────
        const BAND = 8;
        g.fillStyle(0x000000, 1);
        g.fillRect(0, mid - BAND / 2, w, BAND);

        // Thin flanking lines just outside the band
        g.lineStyle(1, 0x000000, 0.15);
        g.beginPath(); g.moveTo(0, mid - BAND / 2 - 5); g.lineTo(w, mid - BAND / 2 - 5); g.strokePath();
        g.beginPath(); g.moveTo(0, mid + BAND / 2 + 5); g.lineTo(w, mid + BAND / 2 + 5); g.strokePath();

        // ── Ground line: heavier with small tick marks ─────────────────────────
        const gY = this.groundY;
        g.lineStyle(2, 0x1a1a1a, 0.75);
        g.beginPath(); g.moveTo(50, gY); g.lineTo(w, gY); g.strokePath();

        g.lineStyle(1, 0x1a1a1a, 0.28);
        for (let x = 80; x < w; x += 44) {
            g.beginPath(); g.moveTo(x, gY); g.lineTo(x, gY + 6); g.strokePath();
        }

        // ── Bottom: inset white frame ──────────────────────────────────────────
        const INS = 13;
        g.lineStyle(1, 0xffffff, 0.15);
        g.strokeRect(INS, mid + INS, w - INS * 2, h / 2 - INS * 2);

        // Bottom corner L-brackets (white)
        const BP2 = INS + 5, BL2 = 18;
        const botCorners: [number, number, number, number][] = [
            [BP2, mid + BP2, 1, 1],
            [w - BP2, mid + BP2, -1, 1],
            [BP2, h - BP2, 1, -1],
            [w - BP2, h - BP2, -1, -1],
        ];
        g.lineStyle(2, 0xffffff, 0.50);
        for (const [ox, oy, sx, sy] of botCorners) {
            g.beginPath();
            g.moveTo(ox + sx * BL2, oy); g.lineTo(ox, oy); g.lineTo(ox, oy + sy * BL2);
            g.strokePath();
        }
    }

    // ─── Wizard ──────────────────────────────────────────────────────────────────

    private createWizard(): void {
        const targetH = this.scale.height / 2 * 0.85;   // fit nicely in top half
        const scale = (targetH / 566) * 0.5;          // 566 = original height, 2x smaller
        this.wizardSprite = this.add.image(0, this.groundY + 27, "player")
            .setOrigin(0.5, 1)   // anchor at feet centre
            .setScale(scale);
        this.wizardX = this.wizardSprite.displayWidth * 0.5 - 15;
        this.wizardSprite.setX(this.wizardX);
    }

    // ─── Drawing area ────────────────────────────────────────────────────────────

    private setupDrawingArea(): void {
        const w = this.scale.width;
        const h = this.scale.height;

        const scoreY = Math.max(65, h * 0.12);
        this.scoreText = this.add.text(w / 2, scoreY, "0", {
            fontFamily: "'Outfit', sans-serif", fontSize: "66px", color: "#000000",
            fontStyle: "100",
        }).setOrigin(0.5, 0).setAlpha(0.4);

        this.feedbackText = this.add.text(w / 2, (3 * h) / 4, "", {
            fontFamily: "Arial", fontSize: "40px", color: "#ffffff",
        }).setOrigin(0.5, 0.5).setAlpha(0);

        this.drawingGraphics = this.add.graphics();

        if (this.attractMode) {
            this.scoreText.setVisible(false);
            this.feedbackText.setVisible(false);
            for (const icon of this.healthIcons) icon.setVisible(false);
            this.drawingGraphics.setVisible(true);
            this.drawingGraphics.setAlpha(0.95);
            this.attractHintText = this.add.text(w / 2, h * 0.76, "DRAW THE SYMBOL\nTO BANISH THE DARKNESS", {
                fontFamily: "'Cinzel Decorative', serif",
                fontSize: "15px",
                color: "#ffffff",
                fontStyle: "700",
                stroke: "#000000",
                strokeThickness: 5,
                letterSpacing: 2,
                align: "center",
                lineSpacing: 6,
            } as any).setOrigin(0.5, 0.5).setAlpha(0.9);
        }
    }

    // ─── Health display ──────────────────────────────────────────────────────────

    private createHealthDisplay(): void {
        const iconR = 9;
        const iconSpacing = 26;
        const startX = 24 + iconR;
        // Align vertically with the centre of the settings button (45px top + 26px half-height on
        // desktop, 120px top + 26px on mobile).
        const isMobile = window.matchMedia('(pointer: coarse)').matches;
        const btnTop = isMobile ? 120 : 45;
        const startY = btnTop + 26;

        for (let i = 0; i < this.maxHealth; i++) {
            const icon = this.add.graphics();
            icon.setPosition(startX + i * iconSpacing, startY);
            this.healthIcons.push(icon);
        }
        this.updateHealthDisplay();
    }

    private updateHealthDisplay(): void {
        const iconR = 9;
        for (let i = 0; i < this.maxHealth; i++) {
            const icon = this.healthIcons[i];
            if (!icon) continue;
            icon.clear();
            if (i < this.health) {
                // Filled diamond – full health
                icon.fillStyle(0x000000, 1);
                icon.beginPath();
                icon.moveTo(0, -iconR);
                icon.lineTo(iconR * 0.7, 0);
                icon.lineTo(0, iconR);
                icon.lineTo(-iconR * 0.7, 0);
                icon.closePath();
                icon.fillPath();
            } else {
                // Hollow diamond – lost health
                icon.lineStyle(2, 0x000000, 0.30);
                icon.beginPath();
                icon.moveTo(0, -iconR);
                icon.lineTo(iconR * 0.7, 0);
                icon.lineTo(0, iconR);
                icon.lineTo(-iconR * 0.7, 0);
                icon.closePath();
                icon.strokePath();
            }
        }
    }

    private takeDamage(amount: number): void {
        if (this.isGameOver || this.attractMode) return;

        this.health = Math.max(0, this.health - amount);
        this.updateHealthDisplay();

        if (this.health <= 0) {
            this.isGameOver = true;
            if (this._s.fx) {
                this.sound.play('gothit', { volume: 0.8 });
            }
            triggerHaptic('error');
            this.cameras.main.shake(300, 0.01);
            this.stopSpawnLoop();
            oasiz.flushGameState();
            this.time.delayedCall(800, () => {
                showGameOver(this.score);
            });
        } else {
            // Took a hit but still alive
            this.cameras.main.shake(200, 0.008);
            triggerHaptic('heavy');
            if (this._s.fx) {
                this.sound.play('gothit', { volume: 0.5 });
            }
            // Restart spawning in case a boss just attacked and cleared bossAlive
            this.time.delayedCall(600, () => {
                if (!this.isGameOver) this.scheduleNextSpawnTick();
            });
        }
    }

    // ─── Enemies ─────────────────────────────────────────────────────────────────

    private getDifficultyParams(): { delayMs: number; darkChance: number; runnerChance: number } {
        const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
        const s = this.score;
        if (s < 100) {
            return { delayMs: 2800, darkChance: 0, runnerChance: 0.13 };
        } else if (s < 500) {
            const t = (s - 100) / 400;
            return { delayMs: lerp(2400, 1600, t), darkChance: lerp(0, 0.12, t), runnerChance: lerp(0.15, 0.35, t) };
        } else if (s < 750) {
            const t = (s - 500) / 250;
            return { delayMs: lerp(2000, 1400, t), darkChance: lerp(0.12, 0.22, t), runnerChance: lerp(0.35, 0.52, t) };
        } else if (s < 1000) {
            const t = (s - 750) / 250;
            return { delayMs: lerp(1400, 1000, t), darkChance: lerp(0.22, 0.28, t), runnerChance: lerp(0.52, 0.62, t) };
        } else if (s < 1500) {
            const t = (s - 1000) / 500;
            return { delayMs: lerp(1000, 850, t), darkChance: lerp(0.28, 0.35, t), runnerChance: lerp(0.62, 0.68, t) };
        } else if (s < 2000) {
            const t = (s - 1500) / 500;
            return { delayMs: lerp(850, 750, t), darkChance: lerp(0.35, 0.40, t), runnerChance: lerp(0.68, 0.72, t) };
        }
        return { delayMs: 750, darkChance: 0.40, runnerChance: 0.72 };
    }

    private spawnEnemy(): void {
        const w = this.scale.width;
        const diff = this.getDifficultyParams();

        // Elite minion: 4-head dark enemy, replaces the old boss tower design
        const isElite = this.score > 150 && Math.random() < 0.06;

        const isDark = isElite || Math.random() < diff.darkChance;
        const isRunning = !isElite && Math.random() < diff.runnerChance;

        let count: number;
        if (isElite) {
            count = 4;
        } else {
            count = Math.random() < 0.30 ? 2 : 1;
            if (isDark && Math.random() < 0.35) count = 3;
            if (isRunning) count = 1;
        }

        const shuffled = [...ALL_SYMBOLS].sort(() => Math.random() - 0.5);
        const symbols = shuffled.slice(0, count);

        const spawnX = w + 30;
        const container = this.add.container(spawnX, this.groundY);
        const gfx = this.add.graphics();
        container.add(gfx);
        const scale = isElite ? ENEMY_SCALE * 1.1 : ENEMY_SCALE;
        container.setScale(scale);

        const WIZARD_X = this.wizardX;
        const REF_TRAVEL = 258;
        const actualTravel = Math.max(1, spawnX - (WIZARD_X + LEAP_TRIGGER));
        const speedScale = actualTravel / REF_TRAVEL;
        const baseSpeed = (24 + Math.random() * 19) * 1.5;
        const speed = isElite ? baseSpeed * speedScale * 0.7 : baseSpeed * speedScale;

        this.enemies.push({
            x: spawnX,
            y: this.groundY,
            symbols,
            container,
            gfx,
            speed,
            alive: true,
            hit: false,
            phase: Math.random() * Math.PI * 2,
            dark: isDark,
            running: isRunning,
            boss: false,
            hopMult: isDark ? DARK_ENEMY_HOP_MULT : 1,
            trail: [],
            leaping: false, leapT: 0,
            leapSX: 0, leapSY: 0, leapTX: 0, leapTY: 0,
            canLeap: Math.random() < 0.30,
            bossType: null, bossPhase: 0, bossTimer: 0, bossHitsLeft: 0, neckAlive: [], bossExtraLives: [],
        });
    }

    private getNextBossScore(current: number): number {
        if (current === 250) return 1000;
        return current + 1000;
    }

    private spawnBossAtIndex(level: number): void {
        const w = this.scale.width;
        const spawnX = w + 30;
        const container = this.add.container(spawnX, this.groundY);
        const gfx = this.add.graphics();
        container.add(gfx);

        const WIZARD_X = this.wizardX;
        const REF_TRAVEL = 258;
        const actualTravel = Math.max(1, spawnX - (WIZARD_X + LEAP_TRIGGER));
        const speedScale = actualTravel / REF_TRAVEL;
        const baseSpeed = 28 * 1.5;
        const speedBoostPerBoss = 0.12;
        const speedMult = 0.45 + level * speedBoostPerBoss;

        // Extra lives per visible symbol scale with boss number:
        // Boss 1 (level 0): 5 hits  → all symbols 1-hit  → [0,0,0,0,0]
        // Boss 2 (level 1): 7 hits  → 2 symbols 2-hit    → [1,1,0,0,0]
        // Boss 3+ (level 2+): 10 hits → all symbols 2-hit → [1,1,1,1,1]
        const shuffled = [...ALL_SYMBOLS].sort(() => Math.random() - 0.5);
        const symbols = Array.from({ length: 5 }, (_, i) => shuffled[i % shuffled.length]);
        let bossExtraLives: number[];
        if (level === 0) {
            bossExtraLives = Array(5).fill(0);
        } else if (level === 1) {
            bossExtraLives = [1, 1, 0, 0, 0];
        } else {
            bossExtraLives = Array(5).fill(1);
        }

        // Keep the visual style familiar: stacked-head boss silhouette.
        container.setScale(ENEMY_SCALE * 1.45);

        this.enemies.push({
            x: spawnX, y: this.groundY, symbols, container, gfx,
            speed: baseSpeed * speedScale * speedMult,
            alive: true, hit: false, phase: Math.random() * Math.PI * 2,
            dark: true, running: false, boss: true, hopMult: 1, trail: [],
            leaping: false, leapT: 0, leapSX: 0, leapSY: 0, leapTX: 0, leapTY: 0,
            canLeap: true,
            bossType: null, bossPhase: 0, bossTimer: 0,
            bossHitsLeft: 0, neckAlive: [],
            bossExtraLives,
        });
        this.bossAlive = true;
    }

    // ─── Music helpers ────────────────────────────────────────────────────────────

    private advanceBgTrack(): void {
        if (this.bossMusicActive) return;
        // Destroy the finished track before creating the next to prevent accumulation.
        if (this.bgMusic) {
            this.bgMusic.removeAllListeners();
            this.bgMusic.destroy();
            this.bgMusic = undefined;
        }
        this.bgMusicTrack = this.bgMusicTrack === 1 ? 2 : 1;
        const key = this.bgMusicTrack === 1 ? 'bgMusic1' : 'bgMusic2';
        this.bgMusic = this.sound.add(key, { loop: false, volume: this._s.music ? 1 : 0 });
        this.bgMusic.play();
        this.bgMusic.on('complete', () => this.advanceBgTrack());
    }

    private playBossMusic(): void {
        if (this.bossMusicActive) return;
        this.bossMusicActive = true;
        if (this.bgMusic?.isPlaying) this.bgMusic.pause();
        if (!this.bossMusic) {
            this.bossMusic = this.sound.add('bossMusic', { loop: true, volume: this._s.music ? 1 : 0 });
        }
        (this.bossMusic as any).play?.();
        if (!(this.bossMusic as any).isPlaying) (this.bossMusic as any).resume?.();
    }

    private stopBossMusic(): void {
        if (!this.bossMusicActive) return;
        this.bossMusicActive = false;
        if (this.bossMusic?.isPlaying) (this.bossMusic as any).stop();
        // Resume or restart bg music
        if (this._s.music) {
            if (this.bgMusic && !this.bgMusic.isPlaying) {
                this.bgMusic.play();
            } else if (!this.bgMusic) {
                this.advanceBgTrack();
            }
        }
    }

    private startSpawnLoop(): void {
        if (this.spawnLoop) return;
        this.spawnTick();
    }

    private stopSpawnLoop(): void {
        if (this.spawnLoop) {
            this.spawnLoop.remove();
            this.spawnLoop = undefined;
        }
    }

    private scheduleNextSpawnTick(): void {
        if (this.isGameOver || this.bossAlive) return;
        this.stopSpawnLoop();
        const delay = this.getDifficultyParams().delayMs;
        this.spawnLoop = this.time.delayedCall(delay, () => {
            this.spawnLoop = undefined;
            this.spawnTick();
        });
    }

    private spawnTick(): void {
        if (this.isGameOver || this.bossAlive) return;

        if (this.score >= this.nextBossScore) {
            const level = this.bossSpawnCount;
            this.bossSpawnCount++;
            this.showBossAnnouncement(level);
            this.stopSpawnLoop();
            this.time.delayedCall(1600, () => {
                if (!this.isGameOver) this.spawnBossAtIndex(level);
            });
            this.nextBossScore = this.getNextBossScore(this.nextBossScore);
        } else {
            this.spawnEnemy();
            this.scheduleNextSpawnTick();
        }
    }

    private showBossAnnouncement(level: number): void {
        const w = this.scale.width;
        const h = this.scale.height;
        void level;

        this.playBossMusic();
        this.cameras.main.shake(600, 0.022);

        // Dark flash overlay
        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
        this.tweens.add({
            targets: overlay,
            alpha: 0.7, duration: 200, yoyo: true, repeat: 2,
            onComplete: () => overlay.destroy(),
        });

        // Place announcement just below the score display
        const scoreBotY = this.scoreText.y + this.scoreText.height + 18;

        const title = this.add.text(w / 2, scoreBotY, 'BOSS INCOMING', {
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: `${Math.max(22, Math.min(40, Math.floor(w * 0.075)))}px`,
            color: '#ffffff', fontStyle: '700', letterSpacing: 2,
            stroke: '#000000', strokeThickness: 7,
        } as any).setOrigin(0.5, 0).setAlpha(0).setScale(0.4);

        this.tweens.add({
            targets: title, alpha: 1,
            scaleX: 1.05, scaleY: 1.05,
            duration: 300, ease: 'Back.easeOut',
            onComplete: () => this.tweens.add({ targets: title, scaleX: 1, scaleY: 1, duration: 120 }),
        });

        this.time.delayedCall(1400, () => {
            this.tweens.add({ targets: title, alpha: 0, y: '-=20', duration: 300, onComplete: () => { title.destroy(); } });
        });

        // Synth boss-incoming sound
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && this._s.fx) {
            const mg = ctx.createGain(); mg.gain.value = 0.18; mg.connect(ctx.destination);
            [[110, 0], [87, 0.15], [65, 0.35]].forEach(([freq, delay]) => {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.value = freq;
                o.connect(g); g.connect(mg);
                const t = ctx.currentTime + delay;
                g.gain.setValueAtTime(0.001, t);
                g.gain.exponentialRampToValueAtTime(1.0, t + 0.04);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                o.start(t); o.stop(t + 0.6);
                o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
            });
            setTimeout(() => { try { mg.disconnect(); } catch (_) {} }, 1200);
        }
    }

    /**
     * Hop cycle (0–1):
     *  0.00–0.08  landing compression (brief knee-bend on touchdown)
     *  0.08–0.36  standing still
     *  0.36–0.63  crouch wind-up
     *  0.63–1.00  airborne (legs straighten quickly, then hold extended)
     *
     * Both knees point LEFT via IK.
     */
    private redrawEnemy(e: Enemy, time: number): void {
        const g = e.gfx;
        g.clear();
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

        if (e.running) {
            const runFreq = ((2 * Math.PI) / HOP_CYCLE) * e.hopMult * 1.9;
            const phase = time * runFreq + e.phase;
            const strideBase = Math.sin(phase) * 11;
            const kneeBend = (Math.sin(phase * 2) + 1) * 0.5; // 0..1
            const stride = strideBase * (1 - kneeBend * 0.18);
            const hipBob = Math.sin(phase * 2) * 2;
            const hipY = HIP_Y * 0.82 + hipBob + kneeBend * 4;
            const leanX = stride * 0.12;
            this.drawEnemyPoseRunning(g, e, hipY, stride, leanX);
            return;
        }

        if (e.boss && e.bossType) {
            this.redrawBoss(e, time);
            return;
        }

        const freq = ((2 * Math.PI) / HOP_CYCLE) * e.hopMult;
        const raw = ((time * freq + e.phase) % (2 * Math.PI)) / (2 * Math.PI);

        let hipY: number;
        let hop = 0;

        if (raw < 0.08) {
            // Landing: brief squat that eases back to upright
            const compress = Math.sin((raw / 0.08) * Math.PI);   // 0→peak→0
            hipY = lerp(HIP_Y, HIP_Y * 0.62, compress);

        } else if (raw < 0.36) {
            // Standing still
            hipY = HIP_Y;

        } else if (raw < 0.63) {
            // Crouch wind-up
            const wu = 1 - Math.cos(((raw - 0.36) / 0.27) * Math.PI / 2);
            hipY = lerp(HIP_Y, HIP_Y * 0.40, wu);
            hop = 0;

        } else {
            // Airborne: straighten legs fast (ease-out quad, done by 35% of arc)
            const t = (raw - 0.63) / 0.37;
            hop = Math.sin(t * Math.PI);
            if (t < 0.35) {
                const ht = t / 0.35;
                hipY = lerp(HIP_Y * 0.40, HIP_Y, 1 - (1 - ht) * (1 - ht));
            } else {
                hipY = HIP_Y;   // fully extended for rest of arc
            }
        }

        if (e.running) {
            hop = 0;
        }
        e.container.y = e.y - hop * this.hopH;

        if (e.dark && !e.boss) {
            // Real trail: draw previous world poses (position + animation phase), not static offsets.
            e.trail.unshift({ x: e.x, y: e.container.y, hipY });
            if (e.trail.length > 8) e.trail.length = 8;
            const i1 = e.trail[2];
            const i2 = e.trail[4];
            const i3 = e.trail[6];
            if (i3) this.drawEnemyPose(g, e, i3.hipY, i3.x - e.x, i3.y - e.container.y, 0.08);
            if (i2) this.drawEnemyPose(g, e, i2.hipY, i2.x - e.x, i2.y - e.container.y, 0.14);
            if (i1) this.drawEnemyPose(g, e, i1.hipY, i1.x - e.x, i1.y - e.container.y, 0.22);
        }
        this.drawEnemyPose(g, e, hipY, 0, 0, 1);
    }

    /**
     * Draws a 2-joint leg using inverse kinematics.
     * Hip and foot are fixed; knee position is solved geometrically.
     * kneeDir: -1 = knee goes left of hip→foot line, +1 = right.
     */
    private strokeLegIK(
        g: Phaser.GameObjects.Graphics,
        hipX: number, hipY: number,
        footX: number, footY: number,
        kneeDir: 1 | -1,
    ): void {
        const dx = footX - hipX;
        const dy = footY - hipY;
        const dist = Math.hypot(dx, dy);
        const d = Math.min(dist, THIGH + SHIN - 0.5);

        const lineAngle = Math.atan2(dy, dx);
        const cosAlpha = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

        const kneeAngle = lineAngle - kneeDir * alpha;
        const kx = hipX + Math.cos(kneeAngle) * THIGH;
        const ky = hipY + Math.sin(kneeAngle) * THIGH;

        g.beginPath();
        g.moveTo(hipX, hipY);
        g.lineTo(kx, ky);
        g.lineTo(footX, footY);
        g.strokePath();
    }

    private drawSymbol(
        g: Phaser.GameObjects.Graphics,
        cx: number, cy: number,
        r: number,
        symbol: string,
        color = 0x000000,
        alpha = 1,
    ): void {
        g.lineStyle(2, color, alpha);
        if (symbol === "Triangle") {
            g.beginPath();
            g.moveTo(cx, cy - r * 0.72);
            g.lineTo(cx + r * 0.68, cy + r * 0.52);
            g.lineTo(cx - r * 0.68, cy + r * 0.52);
            g.closePath();
            g.strokePath();
        } else if (symbol === "Square") {
            const s = r * 0.60;
            g.strokeRect(cx - s, cy - s, s * 2, s * 2);
        } else if (symbol === "Circle") {
            g.strokeCircle(cx, cy, r * 0.62);
        } else if (symbol === "Horizontal Line") {
            g.beginPath();
            g.moveTo(cx - r * 0.72, cy);
            g.lineTo(cx + r * 0.72, cy);
            g.strokePath();
        } else if (symbol === "/") {
            g.beginPath();
            g.moveTo(cx - r * 0.6, cy + r * 0.6);
            g.lineTo(cx + r * 0.6, cy - r * 0.6);
            g.strokePath();
        } else if (symbol === "\\") {
            g.beginPath();
            g.moveTo(cx - r * 0.6, cy - r * 0.6);
            g.lineTo(cx + r * 0.6, cy + r * 0.6);
            g.strokePath();
        } else if (symbol === "V") {
            g.beginPath();
            g.moveTo(cx - r * 0.65, cy - r * 0.45);
            g.lineTo(cx, cy + r * 0.65);
            g.lineTo(cx + r * 0.65, cy - r * 0.45);
            g.strokePath();
        } else {                          // Vertical Line
            g.beginPath();
            g.moveTo(cx, cy - r * 0.72);
            g.lineTo(cx, cy + r * 0.72);
            g.strokePath();
        }
    }

    /** Draw one enemy pose at a local X offset (used for trail clones). */
    private drawEnemyPose(
        g: Phaser.GameObjects.Graphics,
        e: Enemy,
        hipY: number,
        offsetX: number,
        offsetY: number,
        alpha: number,
    ): void {
        g.lineStyle(2.5, 0x000000, alpha);
        this.strokeLegIK(g, -6 + offsetX, hipY + offsetY, -6 + offsetX, 0 + offsetY, -1);
        this.strokeLegIK(g, 6 + offsetX, hipY + offsetY, 6 + offsetX, 0 + offsetY, -1);

        const HEAD_STACK = HEAD_R * 2 + 3;
        const headFill = e.dark ? 0x000000 : 0xffffff;
        const symbolColor = e.dark ? 0xffffff : 0x000000;
        g.lineStyle(2.5, 0x000000, alpha);
        for (let k = 0; k < e.symbols.length; k++) {
            const symbol = e.symbols[k];
            if (!symbol) continue;
            const headCY = hipY + offsetY - HEAD_R - k * HEAD_STACK;
            g.fillStyle(headFill, alpha);
            g.fillCircle(offsetX, headCY, HEAD_R);
            g.strokeCircle(offsetX, headCY, HEAD_R);
            this.drawSymbol(g, offsetX, headCY, HEAD_R - 5, symbol, symbolColor, alpha);
        }
    }

    private drawEnemyPoseRunning(
        g: Phaser.GameObjects.Graphics,
        e: Enemy,
        hipY: number,
        stride: number,
        leanX: number,
    ): void {
        g.lineStyle(2.5, 0x000000, 1);
        this.strokeLegIK(g, -6 + leanX, hipY, -6 + stride, 0, -1);
        this.strokeLegIK(g, 6 + leanX, hipY, 6 - stride, 0, -1);

        const HEAD_STACK = HEAD_R * 2 + 3;
        const headFill = e.dark ? 0x000000 : 0xffffff;
        const symbolColor = e.dark ? 0xffffff : 0x000000;
        g.lineStyle(2.5, 0x000000, 1);
        for (let k = 0; k < e.symbols.length; k++) {
            const headCY = hipY - HEAD_R - k * HEAD_STACK;
            g.fillStyle(headFill, 1);
            g.fillCircle(leanX, headCY, HEAD_R);
            g.strokeCircle(leanX, headCY, HEAD_R);
            this.drawSymbol(g, leanX, headCY, HEAD_R - 5, e.symbols[k], symbolColor, 1);
        }
    }


    // ─── Input & drawing ─────────────────────────────────────────────────────────

    private setupInput(): void {
        const h = this.scale.height;

        if (this.attractMode) return;

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (pointer.y > h / 2) {
                this.isDrawing = true;
                this.points = [{ x: pointer.x, y: pointer.y }];
            }
        });

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!this.isDrawing || !pointer.isDown) return;
            if (pointer.y <= h / 2) return;
            this.points.push({ x: pointer.x, y: pointer.y });
            this.redrawPath();
        });

        this.input.on("pointerup", () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            this.analyzeAndJudge();
        });
    }

    private buildAttractPath(symbol: string): Point[] {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w * 0.5;
        const cy = h * 0.68;
        const s = Math.max(32, Math.min(w, h) * 0.08);

        if (symbol === "Triangle") {
            return [
                { x: cx, y: cy - s },
                { x: cx + s, y: cy + s },
                { x: cx - s, y: cy + s },
                { x: cx, y: cy - s },
            ];
        }
        if (symbol === "Square") {
            return [
                { x: cx - s, y: cy - s },
                { x: cx + s, y: cy - s },
                { x: cx + s, y: cy + s },
                { x: cx - s, y: cy + s },
                { x: cx - s, y: cy - s },
            ];
        }
        if (symbol === "Circle") {
            const pts: Point[] = [];
            const count = 28;
            for (let i = 0; i <= count; i++) {
                const a = (i / count) * Math.PI * 2;
                pts.push({
                    x: cx + Math.cos(a) * s,
                    y: cy + Math.sin(a) * s,
                });
            }
            return pts;
        }
        if (symbol === "Vertical Line") {
            return [
                { x: cx, y: cy - s * 1.2 },
                { x: cx, y: cy + s * 1.2 },
            ];
        }
        if (symbol === "Horizontal Line") {
            return [
                { x: cx - s * 1.2, y: cy },
                { x: cx + s * 1.2, y: cy },
            ];
        }
        if (symbol === "/") {
            return [
                { x: cx - s, y: cy + s },
                { x: cx + s, y: cy - s },
            ];
        }
        if (symbol === "\\") {
            return [
                { x: cx - s, y: cy - s },
                { x: cx + s, y: cy + s },
            ];
        }
        if (symbol === "V") {
            return [
                { x: cx - s, y: cy - s * 0.8 },
                { x: cx, y: cy + s },
                { x: cx + s, y: cy - s * 0.8 },
            ];
        }
        return [
            { x: cx - s, y: cy },
            { x: cx + s, y: cy },
        ];
    }

    private drawPartialPath(path: Point[], progress: number): void {
        this.drawingGraphics.clear();
        if (path.length < 2) return;

        const clamped = Math.max(0, Math.min(1, progress));
        this.drawingGraphics.lineStyle(6, 0xffffff, 1);
        this.drawingGraphics.beginPath();
        this.drawingGraphics.moveTo(path[0].x, path[0].y);

        let totalLength = 0;
        const segLengths: number[] = [];
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i - 1].x;
            const dy = path[i].y - path[i - 1].y;
            const len = Math.hypot(dx, dy);
            segLengths.push(len);
            totalLength += len;
        }

        const targetLength = totalLength * clamped;
        let consumed = 0;
        for (let i = 1; i < path.length; i++) {
            const segLen = segLengths[i - 1];
            if (consumed + segLen <= targetLength) {
                this.drawingGraphics.lineTo(path[i].x, path[i].y);
                consumed += segLen;
                continue;
            }

            const remain = targetLength - consumed;
            const t = segLen <= 0 ? 0 : remain / segLen;
            const x = path[i - 1].x + (path[i].x - path[i - 1].x) * t;
            const y = path[i - 1].y + (path[i].y - path[i - 1].y) * t;
            this.drawingGraphics.lineTo(x, y);
            break;
        }

        this.drawingGraphics.strokePath();
    }

    private startAttractDraw(enemy: Enemy): void {
        if (!enemy.alive || enemy.hit || enemy.symbols.length === 0) return;
        const symbol = enemy.symbols[0];
        this.attractDrawState = {
            enemy,
            symbol,
            path: this.buildAttractPath(symbol),
            elapsedMs: 0,
            durationMs: 560,
        };
        this.drawPartialPath(this.attractDrawState.path, 0);
    }

    private redrawPath(): void {
        this.drawingGraphics.clear();
        if (this.points.length < 2) return;
        this.drawingGraphics.lineStyle(4, 0xffffff, 1);
        this.drawingGraphics.beginPath();
        this.drawingGraphics.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            this.drawingGraphics.lineTo(this.points[i].x, this.points[i].y);
        }
        this.drawingGraphics.strokePath();
    }

    private analyzeAndJudge(): void {
        if (this.points.length < 5) { this.clearDrawing(); return; }

        const detected = detectShape(this.points);

        let anyHit = false;
        let killsThisStroke = 0;

        for (const e of this.enemies) {
            if (!e.alive || e.hit) continue;
            const idx = e.symbols.indexOf(detected);
            if (idx === -1) continue;

            anyHit = true;
            this.score += 10;
            this.scoreText.setText(String(this.score));

            const headPos = this.getHeadWorldPos(e, idx);

            // Boss durability: each of 5 visible symbols has one replacement life.
            // 1st kill on a slot rerolls symbol; 2nd kill destroys that slot.
            if (e.boss && e.bossExtraLives[idx] && e.bossExtraLives[idx] > 0) {
                e.bossExtraLives[idx]--;
                const current = e.symbols[idx];
                const pool = ALL_SYMBOLS.filter((s) => s !== current);
                e.symbols[idx] = pool[Math.floor(Math.random() * pool.length)];
                this.popHead(headPos.x, headPos.y);
                continue;
            }

            e.symbols.splice(idx, 1);
            if (e.boss && e.bossExtraLives.length > idx) {
                e.bossExtraLives.splice(idx, 1);
            }

            if (e.symbols.length === 0) {
                e.hit = true;
                killsThisStroke++;
                this.explodeEnemy(e);
            } else {
                this.popHead(headPos.x, headPos.y);
                if (e.boss && e.bossType) this.checkBossRage(e);
                // Update Hydra neckAlive — find the first alive neck and mark it dead
                if (e.bossType === 'hydra' && e.neckAlive.length > 0) {
                    const deadSlot = e.neckAlive.findIndex(a => a);
                    if (deadSlot !== -1) e.neckAlive[deadSlot] = false;
                }
            }
        }

        if (anyHit) {
            // ── Combo & multi-kill logic ──────────────────────────────────────
            if (killsThisStroke > 0) {
                const now = this.time.now;
                const timeSinceLast = now - this.lastKillTime;

                if (timeSinceLast <= 1000 && !this.comboBreak && this.comboCount > 0) {
                    this.comboCount += killsThisStroke;
                } else {
                    this.comboCount = killsThisStroke;
                }
                this.lastKillTime = now;
                this.comboBreak = false;

                // Reset the 1-second combo window
                if (this.comboTimeout) this.comboTimeout.remove();
                this.comboTimeout = this.time.delayedCall(1000, () => {
                    this.comboCount = 0;
                    this.comboBreak = false;
                    this.killNoteIdx = 0; // melody resets after the combo window expires
                });

                // Determine celebration tier
                if (killsThisStroke >= 3) {
                    this.showKillFeedback('TRIPLE KILL', this.comboCount, 'triple');
                    this.playKillCelebration('triple');
                    triggerHaptic('success');
                } else if (killsThisStroke === 2) {
                    this.showKillFeedback('DOUBLE KILL', this.comboCount, 'double');
                    this.playKillCelebration('double');
                    triggerHaptic('success');
                } else if (this.comboCount >= 2) {
                    this.showKillFeedback('COMBO', this.comboCount, 'combo');
                    this.playKillCelebration('combo', this.comboCount);
                    triggerHaptic('medium');
                }
            }

            this.flashDrawing();
            this.wizardAttack();
            if (killsThisStroke === 0) triggerHaptic('medium');
        } else {
            if (detected !== "none") {
                // Miss – break combo
                this.comboBreak = true;
                this.comboCount = 0;
                if (this.comboTimeout) { this.comboTimeout.remove(); this.comboTimeout = undefined; }
                this.cameras.main.shake(120, 0.008);
                triggerHaptic('light');
                const s = this._s;
                if (s.fx) {
                    this.sound.play('wrong', { volume: 0.5 });
                }
            }
            this.clearDrawing();
        }
    }

    private getHeadWorldPos(e: Enemy, idx: number): { x: number; y: number } {
        const HEAD_STACK = HEAD_R * 2 + 3;
        const headLocalY = (HIP_Y - HEAD_R - idx * HEAD_STACK) * ENEMY_SCALE;
        return { x: e.container.x, y: e.container.y + headLocalY };
    }

    private clearDrawing(): void {
        this.drawingGraphics.clear();
        this.drawingGraphics.setAlpha(1);
        this.points = [];
        this.isDrawing = false;
    }

    private flashDrawing(): void {
        const pts = this.points.slice();
        this.points = [];
        this.isDrawing = false;

        this.drawingGraphics.clear();
        if (pts.length < 2) return;
        this.drawingGraphics.setAlpha(1);
        this.drawingGraphics.lineStyle(6, 0xffffff, 1);
        this.drawingGraphics.beginPath();
        this.drawingGraphics.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            this.drawingGraphics.lineTo(pts[i].x, pts[i].y);
        }
        this.drawingGraphics.strokePath();

        this.tweens.add({
            targets: this.drawingGraphics,
            alpha: 0,
            duration: 120,
            ease: "Linear",
            onComplete: () => this.clearDrawing(),
        });
    }

    /** Attack flash: sprite switches + animated burst behind it, sprite shakes. */
    private wizardAttack(): void {
        const origX = this.wizardSprite.x;
        const origY = this.wizardSprite.y;
        const startMs = this.time.now;
        const DURATION = 520;

        this.wizardSprite.setTexture("player2");

        // ── Burst graphics (behind sprite) ───────────────────────────────────
        const burst = this.add.graphics();
        this.children.moveBelow(burst as any, this.wizardSprite);

        const prog = { t: 0 };
        this.tweens.add({
            targets: prog,
            t: 1,
            duration: DURATION,
            ease: "Cubic.easeOut",
            onUpdate: () => {
                burst.clear();

                // cx/cy follow the sprite so shake is baked in
                const cx = this.wizardSprite.x;
                const cy = origY - this.wizardSprite.displayHeight * 0.52;
                const elapsed = this.time.now - startMs;
                const rot = elapsed * 0.006;          // radians, frame-rate independent
                const alpha = 1 - prog.t;

                // Layer 1 – thick rotating rays
                const rc1 = 10;
                for (let i = 0; i < rc1; i++) {
                    const a = (i / rc1) * Math.PI * 2 + rot;
                    const inner = 18;
                    const outer = 55 + prog.t * 100;
                    const thick = i % 2 === 0 ? 7 : 3;
                    burst.lineStyle(thick, 0x000000, alpha * (i % 2 === 0 ? 0.90 : 0.40));
                    burst.beginPath();
                    burst.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                    burst.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
                    burst.strokePath();
                }

                // Layer 2 – thin counter-rotating rays
                const rc2 = 16;
                for (let i = 0; i < rc2; i++) {
                    const a = (i / rc2) * Math.PI * 2 - rot * 1.4;
                    const inner = 22;
                    const outer = 35 + prog.t * 60;
                    burst.lineStyle(1.5, 0x000000, alpha * 0.30);
                    burst.beginPath();
                    burst.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                    burst.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
                    burst.strokePath();
                }

                // Pulsing concentric rings
                for (let r = 0; r < 3; r++) {
                    const radius = 20 + r * 22 + prog.t * 55;
                    const pulse = 0.5 + 0.5 * Math.sin(rot * 4 + r * 1.2);
                    burst.lineStyle(3.5 - r, 0x000000, alpha * 0.65 * pulse);
                    burst.strokeCircle(cx, cy, radius);
                }

                // Dark energy blobs orbiting outward
                const blobCount = 5;
                for (let i = 0; i < blobCount; i++) {
                    const a = (i / blobCount) * Math.PI * 2 + rot * 2.5;
                    const dist = 14 + prog.t * 65;
                    const bx = cx + Math.cos(a) * dist;
                    const by = cy + Math.sin(a) * dist;
                    const br = Math.max(0, (7 - prog.t * 7) * alpha);
                    burst.fillStyle(0x000000, alpha * 0.70);
                    burst.fillCircle(bx, by, br);
                }

                // Horizontal speed-lines (attack direction)
                for (let i = 0; i < 7; i++) {
                    const ly = cy - 48 + i * 16;
                    const lx0 = cx - 18 - prog.t * 50;
                    const lx1 = lx0 - 28 - (7 - i) * 9;
                    burst.lineStyle(2, 0x000000, alpha * 0.45);
                    burst.beginPath();
                    burst.moveTo(lx0, ly);
                    burst.lineTo(lx1, ly);
                    burst.strokePath();
                }
            },
            onComplete: () => burst.destroy(),
        });

        // ── Sprite shake (decaying sine on both X and Y) ──────────────────────
        const shakeObj = { p: 0 };
        this.tweens.add({
            targets: shakeObj,
            p: 1,
            duration: DURATION,
            ease: "Linear",
            onUpdate: () => {
                const decay = 1 - shakeObj.p;
                this.wizardSprite.x = origX + Math.sin(shakeObj.p * Math.PI * 9) * 6 * decay;
                this.wizardSprite.y = origY + Math.sin(shakeObj.p * Math.PI * 7 + 1) * 3 * decay;
            },
            onComplete: () => {
                this.wizardSprite.x = origX;
                this.wizardSprite.y = origY;
                this.wizardSprite.setTexture("player");
            },
        });
    }

    private showBossVictory(bossType: string, bonus: number): void {
        const w = this.scale.width;
        const h = this.scale.height;
        const label = `+${bonus} BOSS SLAIN!`;
        const t = this.add.text(w / 2, h * 0.50, label, {
            fontFamily: "'Cinzel Decorative', serif", fontSize: '32px',
            color: '#ffffff', fontStyle: '700', stroke: '#000000', strokeThickness: 7,
        } as any).setOrigin(0.5).setAlpha(0).setScale(0.4);
        this.tweens.add({
            targets: t, alpha: 1, scaleX: 1.05, scaleY: 1.05,
            duration: 260, ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({ targets: t, alpha: 0, y: '-=30', duration: 350, onComplete: () => t.destroy() });
                });
            },
        });

        // Play victory fanfare
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && this._s.fx) {
            const mg = ctx.createGain(); mg.gain.value = 0.16; mg.connect(ctx.destination);
            [[220, 0], [330, 0.12], [440, 0.24], [880, 0.4]].forEach(([freq, delay]) => {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'square'; o.frequency.value = freq;
                o.connect(g); g.connect(mg);
                const ct = ctx.currentTime + delay;
                g.gain.setValueAtTime(0.001, ct);
                g.gain.exponentialRampToValueAtTime(1.0, ct + 0.03);
                g.gain.exponentialRampToValueAtTime(0.001, ct + 0.35);
                o.start(ct); o.stop(ct + 0.4);
                o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
            });
            setTimeout(() => { try { mg.disconnect(); } catch (_) {} }, 1000);
        }
        void bossType;
    }

    // ─── Boss drawing ────────────────────────────────────────────────────────────

    private redrawBoss(e: Enemy, time: number): void {
        // Compute hop offset reused by Colossus and Hydra
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        const freq = (2 * Math.PI) / HOP_CYCLE;
        const raw = ((time * freq + e.phase) % (2 * Math.PI)) / (2 * Math.PI);
        let hop = 0;
        if (raw >= 0.63) { hop = Math.sin(((raw - 0.63) / 0.37) * Math.PI); }

        switch (e.bossType) {
            case 'colossus': {
                e.container.y = e.y - hop * this.hopH * 0.6;
                this.drawColossus(e, time, raw, lerp);
                break;
            }
            case 'hydra': {
                e.container.y = e.y - hop * this.hopH * 0.4;
                this.drawHydra(e, time, lerp);
                break;
            }
            case 'warlock': {
                // Float with sine wave
                e.container.y = e.y - 18 - Math.sin(time * 0.0012 + e.phase) * 14;
                this.drawWarlock(e, time);
                break;
            }
            case 'void': {
                e.container.y = e.y - 30 - Math.sin(time * 0.0008 + e.phase) * 20;
                this.drawVoid(e, time);
                break;
            }
        }
    }

    private drawColossus(e: Enemy, time: number, raw: number, lerp: (a: number, b: number, t: number) => number): void {
        const g = e.gfx;
        g.clear();

        // Leg compression during landing
        const compress = raw < 0.08 ? Math.sin((raw / 0.08) * Math.PI) : 0;
        const legH = lerp(50, 32, compress);

        // Pillar legs
        g.fillStyle(0x000000, 1);
        g.fillRect(-40, -legH, 22, legH);
        g.fillRect(18, -legH, 22, legH);

        // Trapezoid body
        g.beginPath();
        g.moveTo(-50, -legH);
        g.lineTo(50, -legH);
        g.lineTo(30, -legH - 62);
        g.lineTo(-30, -legH - 62);
        g.closePath();
        g.fillPath();

        // Diamond head
        const hR = HEAD_R * 1.6;
        const hCY = -legH - 62 - hR - 8;
        g.beginPath();
        g.moveTo(0, hCY - hR);
        g.lineTo(hR * 0.75, hCY);
        g.lineTo(0, hCY + hR);
        g.lineTo(-hR * 0.75, hCY);
        g.closePath();
        g.fillPath();
        g.lineStyle(3, 0xffffff, 0.5);
        g.strokePath();

        // Enrage cracks on body
        if (e.bossPhase >= 1) {
            g.lineStyle(2, 0xffffff, 0.6);
            g.beginPath(); g.moveTo(-15, -legH - 10); g.lineTo(5, -legH - 35); g.lineTo(-5, -legH - 50); g.strokePath();
            g.beginPath(); g.moveTo(20, -legH - 20); g.lineTo(5, -legH - 40); g.strokePath();
        }

        // 4 orbiting symbol orbs
        const orbitR = 65;
        const orbitSpeed = e.bossPhase >= 1 ? 0.0009 : 0.0005;
        const bodyCY = -legH - 31;
        const total = 4; // always 4 orbit slots, skip missing
        for (let k = 0; k < e.symbols.length; k++) {
            const angle = time * orbitSpeed + (k / total) * Math.PI * 2;
            const ox = Math.cos(angle) * orbitR;
            const oy = bodyCY + Math.sin(angle) * orbitR * 0.45;
            g.fillStyle(0xffffff, 1);
            g.fillCircle(ox, oy, 16);
            g.lineStyle(2.5, 0x000000, 1);
            g.strokeCircle(ox, oy, 16);
            this.drawSymbol(g, ox, oy, 11, e.symbols[k], 0x000000, 1);
        }
    }

    private drawHydra(e: Enemy, time: number, lerp: (a: number, b: number, t: number) => number): void {
        const g = e.gfx;
        g.clear();
        const enraged = e.bossPhase >= 1;

        // Body — filled ellipse approximated as polygon
        g.fillStyle(0x000000, 1);
        g.beginPath();
        const bRx = 40, bRy = 24;
        for (let i = 0; i <= 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const px = Math.cos(a) * bRx, py = Math.sin(a) * bRy;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fillPath();
        g.lineStyle(2.5, 0x000000, 1); g.strokePath();

        // Neck-heads for each alive symbol
        const totalNecks = e.neckAlive.length || e.symbols.length;
        const neckFreq = enraged ? 0.0038 : 0.0019;
        const lunge = e.bossTimer % 3000 < 300; // brief lunge every 3s
        const lungeAmt = lunge ? lerp(0, 20, Math.sin((e.bossTimer % 3000) / 300 * Math.PI)) : 0;

        let symIdx = 0;
        for (let k = 0; k < totalNecks; k++) {
            // Check if this neck is alive (maps to current symbol by original index)
            const alive = e.neckAlive.length > 0 ? e.neckAlive[k] : symIdx < e.symbols.length;
            if (!alive) continue;
            const sym = e.symbols[symIdx];
            symIdx++;

            const spread = totalNecks > 1 ? ((k / (totalNecks - 1)) - 0.5) * 1.6 : 0;
            const baseAngle = -Math.PI / 2 + spread;
            const neckLen = 48 + lungeAmt;

            // Sinusoidal neck bend
            const wave = Math.sin(time * neckFreq + k * 1.3) * (enraged ? 18 : 10);
            const midX = Math.cos(baseAngle) * neckLen * 0.55 + wave;
            const midY = Math.sin(baseAngle) * neckLen * 0.55;
            const tipX = Math.cos(baseAngle) * neckLen + wave * 1.4;
            const tipY = Math.sin(baseAngle) * neckLen;

            g.lineStyle(enraged ? 4 : 3, 0x000000, 1);
            g.beginPath(); g.moveTo(0, -bRy); g.lineTo(midX, midY); g.lineTo(tipX, tipY); g.strokePath();

            const headR = 18;
            g.fillStyle(0x000000, 1);
            g.fillCircle(tipX, tipY, headR);
            g.lineStyle(2, 0xffffff, enraged ? 1 : 0.7);
            g.strokeCircle(tipX, tipY, headR);
            this.drawSymbol(g, tipX, tipY, headR - 5, sym, 0xffffff, 1);
        }
    }

    private drawWarlock(e: Enemy, time: number): void {
        const g = e.gfx;
        g.clear();
        const enraged = e.bossPhase >= 1;
        const armWave = enraged ? 0.0018 : 0.0009;

        // Robe (tall triangle)
        g.fillStyle(0x000000, 1);
        g.beginPath();
        g.moveTo(0, -120); g.lineTo(55, 0); g.lineTo(-55, 0); g.closePath(); g.fillPath();
        g.lineStyle(2, 0xffffff, 0.3); g.strokePath();

        // Pointy hat
        g.fillStyle(0x000000, 1);
        g.beginPath();
        g.moveTo(0, -185); g.lineTo(22, -120); g.lineTo(-22, -120); g.closePath(); g.fillPath();
        g.lineStyle(2, 0xffffff, 0.5); g.strokePath();
        // Hat brim
        g.lineStyle(3, 0xffffff, 0.6);
        g.beginPath(); g.moveTo(-28, -120); g.lineTo(28, -120); g.strokePath();

        // Head circle
        const headCY = -135;
        g.fillStyle(0x000000, 1);
        g.fillCircle(0, headCY, HEAD_R * 0.9);
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeCircle(0, headCY, HEAD_R * 0.9);

        // Eyes
        const eyeR = 4;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-9, headCY, eyeR); g.fillCircle(9, headCY, eyeR);
        if (enraged) {
            g.fillStyle(0xff0000 as any, 1);
            g.fillCircle(-9, headCY, eyeR * 0.5); g.fillCircle(9, headCY, eyeR * 0.5);
        }

        // Waving arms
        const armSwing = Math.sin(time * armWave + e.phase) * (enraged ? 30 : 15);
        const lArmTX = -55 - 28 + armSwing;
        const lArmTY = -80 + Math.sin(time * armWave * 0.7) * 10;
        const rArmTX = 55 + 28 - armSwing;
        const rArmTY = -80 + Math.sin(time * armWave * 0.7 + 1) * 10;
        g.lineStyle(3, 0xffffff, 0.85);
        g.beginPath(); g.moveTo(-22, -90); g.lineTo(lArmTX, lArmTY); g.strokePath();
        g.beginPath(); g.moveTo(22, -90); g.lineTo(rArmTX, rArmTY); g.strokePath();

        // Orbiting symbol orbs — inner 3 (chain from hands), outer ring
        const innerR = 50, outerR = 82;
        const innerSpeed = enraged ? 0.0013 : 0.0007;
        const outerSpeed = enraged ? 0.0009 : 0.0005;
        const bodyCY = -60;

        for (let k = 0; k < e.symbols.length; k++) {
            const isInner = k < 3;
            const R = isInner ? innerR : outerR;
            const speed = isInner ? innerSpeed : -outerSpeed;
            const slot = isInner ? k : k - 3;
            const total = isInner ? 3 : (e.symbols.length - 3);
            const angle = time * speed + (total > 1 ? (slot / total) * Math.PI * 2 : 0);
            const ox = Math.cos(angle) * R;
            const oy = bodyCY + Math.sin(angle) * R * 0.55;

            // Chain line from nearest arm
            const anchorX = ox < 0 ? lArmTX : rArmTX;
            const anchorY = ox < 0 ? lArmTY : rArmTY;
            g.lineStyle(1, 0xffffff, 0.3);
            g.beginPath(); g.moveTo(anchorX, anchorY); g.lineTo(ox, oy); g.strokePath();

            // Orb
            g.fillStyle(0x000000, 1);
            g.fillCircle(ox, oy, 17);
            g.lineStyle(2, 0xffffff, enraged ? 1 : 0.85);
            g.strokeCircle(ox, oy, 17);
            this.drawSymbol(g, ox, oy, 12, e.symbols[k], 0xffffff, 1);
        }
    }

    private drawVoid(e: Enemy, time: number): void {
        const g = e.gfx;
        g.clear();
        const enraged = e.bossPhase >= 1;

        // Pulsing amorphous blob
        const blobPulse = enraged ? 0.0022 : 0.0011;
        const baseR = enraged ? 52 : 44;
        const verts = 14;
        g.fillStyle(0x000000, 1);
        g.lineStyle(3, 0xffffff, enraged ? 0.9 : 0.55);
        g.beginPath();
        for (let i = 0; i <= verts; i++) {
            const a = (i / verts) * Math.PI * 2;
            const wobble = Math.sin(time * blobPulse + a * 3.1 + e.phase) * (enraged ? 14 : 8);
            const r = baseR + wobble;
            const px = Math.cos(a) * r, py = Math.sin(a) * r;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fillPath(); g.strokePath();

        // Outer pulsing ring
        const ringR = baseR + 18 + Math.sin(time * blobPulse * 2) * 6;
        g.lineStyle(1.5, 0xffffff, enraged ? 0.5 : 0.25);
        g.strokeCircle(0, 0, ringR);

        // Single large eye
        const eyeR = 22;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 0, eyeR);
        const pupilR = enraged ? eyeR * 0.55 : eyeR * 0.4;
        const pupilOff = Math.sin(time * 0.0007) * 4;
        g.fillStyle(0x000000, 1);
        g.fillCircle(pupilOff, 0, pupilR);
        // Eye shine
        g.fillStyle(0xffffff, 1);
        g.fillCircle(pupilOff - eyeR * 0.18, -eyeR * 0.22, eyeR * 0.12);

        // Tentacles
        const tentCount = 4;
        for (let t = 0; t < tentCount; t++) {
            const baseA = (t / tentCount) * Math.PI * 2 + time * 0.0004;
            const wave = Math.sin(time * 0.0015 + t * 1.57) * (enraged ? 22 : 12);
            const tx = Math.cos(baseA) * (baseR + 30 + wave);
            const ty = Math.sin(baseA) * (baseR + 30 + wave);
            const mx = Math.cos(baseA) * (baseR + 12) + Math.sin(baseA) * wave * 0.5;
            const my = Math.sin(baseA) * (baseR + 12) - Math.cos(baseA) * wave * 0.5;
            g.lineStyle(enraged ? 3 : 2, 0xffffff, enraged ? 0.7 : 0.45);
            g.beginPath();
            g.moveTo(Math.cos(baseA) * baseR, Math.sin(baseA) * baseR);
            g.lineTo(mx, my); g.lineTo(tx, ty);
            g.strokePath();
        }

        // Symbol rings — outer (4 slots) counter-clockwise, inner (3 slots) clockwise
        const outerSpeed = enraged ? -0.0014 : -0.0006;
        const innerSpeed = enraged ? 0.0018 : 0.0008;
        const outerR2 = 78, innerR2 = 50;

        for (let k = 0; k < e.symbols.length; k++) {
            const isOuter = k < 4;
            const slot = isOuter ? k : k - 4;
            const total = isOuter ? 4 : 3;
            const R = isOuter ? outerR2 : innerR2;
            const speed = isOuter ? outerSpeed : innerSpeed;
            const angle = time * speed + (slot / total) * Math.PI * 2;
            const ox = Math.cos(angle) * R;
            const oy = Math.sin(angle) * R;
            g.fillStyle(0x000000, 1);
            g.fillCircle(ox, oy, 18);
            g.lineStyle(2.5, 0xffffff, enraged ? 1 : 0.8);
            g.strokeCircle(ox, oy, 18);
            this.drawSymbol(g, ox, oy, 12, e.symbols[k], 0xffffff, 1);
        }
    }

    // ─── Boss special moves ───────────────────────────────────────────────────────

    private tickBossSpecial(e: Enemy, time: number, delta: number): void {
        e.bossTimer += delta;

        switch (e.bossType) {
            case 'colossus': {
                // Stomp shockwave every HOP_CYCLE ms (synced with hop)
                if (e.bossTimer >= HOP_CYCLE) {
                    e.bossTimer -= HOP_CYCLE;
                    this.emitStompShockwave(e.x, e.y);
                }
                break;
            }
            case 'hydra': {
                // Neck lunge burst every 3s (visual only — tracked via bossTimer mod)
                // Also check rage: triggers when bossHitsLeft hits 0
                break;
            }
            case 'warlock': {
                const shuffleInterval = e.bossPhase >= 1 ? 2000 : 4000;
                if (e.bossTimer >= shuffleInterval && e.symbols.length > 0) {
                    e.bossTimer -= shuffleInterval;
                    // Swap a random symbol for a different one
                    const idx = Math.floor(Math.random() * e.symbols.length);
                    const current = e.symbols[idx];
                    const pool = ALL_SYMBOLS.filter(s => s !== current && !e.symbols.includes(s));
                    if (pool.length > 0) {
                        e.symbols[idx] = pool[Math.floor(Math.random() * pool.length)];
                        // Visual flash at boss position
                        this.emitSymbolShuffle(e.x, e.container.y, time);
                    }
                }
                break;
            }
            case 'void': {
                // Spawn a minion every 5s (max 1 at a time from this ability)
                if (e.bossTimer >= 5000) {
                    e.bossTimer -= 5000;
                    const regularEnemies = this.enemies.filter(en => en.alive && !en.boss).length;
                    if (regularEnemies < 3) {
                        this.spawnEnemy();
                    }
                }
                break;
            }
        }
    }

    private emitStompShockwave(wx: number, wy: number): void {
        const sg = this.acquireGfx();
        const sp = { t: 0 };
        this.tweens.add({
            targets: sp, t: 1, duration: 500, ease: 'Power2',
            onUpdate: () => {
                sg.clear();
                sg.lineStyle(5 * (1 - sp.t) + 1, 0x000000, (1 - sp.t) * 0.65);
                sg.strokeCircle(wx, wy, 20 + sp.t * 120);
                sg.lineStyle(2 * (1 - sp.t), 0x000000, (1 - sp.t) * 0.3);
                sg.strokeCircle(wx, wy, 10 + sp.t * 60);
            },
            onComplete: () => this.releaseGfx(sg),
        });
    }

    private emitSymbolShuffle(wx: number, wy: number, _time: number): void {
        // Quick flash rings
        for (let r = 0; r < 3; r++) {
            const sg = this.acquireGfx();
            const sp = { t: 0 };
            this.tweens.add({
                targets: sp, t: 1, delay: r * 60, duration: 300, ease: 'Power2',
                onUpdate: () => {
                    sg.clear();
                    sg.lineStyle(3 - r, 0xffffff, (1 - sp.t) * 0.7);
                    sg.strokeCircle(wx, wy - 60, 15 + sp.t * 40 + r * 15);
                },
                onComplete: () => this.releaseGfx(sg),
            });
        }
        // Synth shuffle tone
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && this._s.fx) {
            const mg = ctx.createGain(); mg.gain.value = 0.12; mg.connect(ctx.destination);
            [880, 440, 660].forEach((freq, i) => {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'square'; o.frequency.value = freq;
                o.connect(g); g.connect(mg);
                const t = ctx.currentTime + i * 0.05;
                g.gain.setValueAtTime(0.001, t);
                g.gain.exponentialRampToValueAtTime(1.0, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                o.start(t); o.stop(t + 0.1);
                o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
            });
            setTimeout(() => { try { mg.disconnect(); } catch (_) {} }, 400);
        }
    }

    private checkBossRage(e: Enemy): void {
        if (e.bossPhase >= 1 || e.bossType === 'colossus') return;
        e.bossHitsLeft--;
        if (e.bossHitsLeft > 0) return;

        e.bossPhase = 1;
        e.speed *= (e.bossType === 'void' ? 1.8 : 1.6);
        this.cameras.main.shake(300, 0.015);
        triggerHaptic('heavy');

        // Rage announcement
        const w = this.scale.width;
        const h = this.scale.height;
        const rag = this.add.text(w / 2, h * 0.52, 'ENRAGED!', {
            fontFamily: "'Cinzel Decorative', serif", fontSize: '38px',
            color: '#ffffff', fontStyle: '700', stroke: '#000000', strokeThickness: 8,
        } as any).setOrigin(0.5).setAlpha(0).setScale(0.4);
        this.tweens.add({
            targets: rag, alpha: 1, scaleX: 1.1, scaleY: 1.1, duration: 200, ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({ targets: rag, alpha: 0, y: '-=20', duration: 300, onComplete: () => rag.destroy() });
                });
            },
        });
    }

    // ─── Explosion ───────────────────────────────────────────────────────────────

    /** Acquire a Graphics object from the pool (or create one if pool is empty). */
    private acquireGfx(): Phaser.GameObjects.Graphics {
        const g = this.gfxPool.pop();
        if (g) { g.clear(); g.setVisible(true); return g; }
        return this.add.graphics();
    }

    /** Return a Graphics object to the pool instead of destroying it. */
    private releaseGfx(g: Phaser.GameObjects.Graphics): void {
        g.clear();
        g.setVisible(false);
        this.gfxPool.push(g);
    }

    private explodeEnemy(enemy: Enemy): void {
        const ex = enemy.x;
        const ey = enemy.y + HEAD_CY * ENEMY_SCALE;

        const s = this._s;
        if (s.fx) {
            this.playKillNote();
        }
        if (s.haptics) {
            triggerHaptic('heavy');
        }

        if (enemy.dark) {
            this.score += 25;
            this.scoreText.setText(String(this.score));
        }
        if (enemy.boss) {
            const bonusMap: Record<string, number> = { colossus: 150, hydra: 250, warlock: 350, void: 500 };
            const bonus = enemy.bossType ? (bonusMap[enemy.bossType] ?? 150) : 150;
            this.score += bonus;
            this.scoreText.setText(String(this.score));
            this.bossAlive = false;
            this.stopBossMusic();
            this.bossesDefeated++;
            triggerHaptic('success');
            // Boss kill sound effect — use sound.play() so Phaser auto-releases it
            if (this._s.fx) {
                this.sound.play('bossKill', { volume: 0.85 });
            }
            // Boss victory celebration
            this.cameras.main.shake(400, 0.016);
            this.showBossVictory(enemy.bossType ?? 'colossus', bonus);
            this.time.delayedCall(1400, () => { if (!this.isGameOver) this.startSpawnLoop(); });
        }

        // Instantly hide enemy
        enemy.container.setAlpha(0);
        this.time.delayedCall(10, () => { enemy.container.destroy(); enemy.alive = false; });

        // ── Impact flash ──────────────────────────────────────────────────────
        const flashG = this.acquireGfx();
        const fp = { t: 0 };
        this.tweens.add({
            targets: fp, t: 1, duration: 180, ease: "Power3",
            onUpdate: () => {
                flashG.clear();
                flashG.fillStyle(0x000000, (1 - fp.t) * 0.75);
                flashG.fillCircle(ex, ey, 8 + fp.t * 50);
            },
            onComplete: () => this.releaseGfx(flashG),
        });

        // ── Two shockwave rings ───────────────────────────────────────────────
        for (let r = 0; r < 2; r++) {
            const rg = this.acquireGfx();
            const rp = { t: 0 };
            this.tweens.add({
                targets: rp, t: 1, delay: r * 70, duration: 380, ease: "Power2",
                onUpdate: () => {
                    rg.clear();
                    rg.lineStyle(3.5 - r * 1.5, 0x000000, (1 - rp.t) * 0.85);
                    rg.strokeCircle(ex, ey, 14 + rp.t * 90);
                },
                onComplete: () => this.releaseGfx(rg),
            });
        }

        // ── Sharp cross-slash marks ───────────────────────────────────────────
        const slashG = this.acquireGfx();
        const sp = { t: 0 };
        const slashAngles = [Math.PI / 7, Math.PI / 2 + 0.15, Math.PI * 0.82];
        this.tweens.add({
            targets: sp, t: 1, duration: 260, ease: "Power2",
            onUpdate: () => {
                slashG.clear();
                const a = 1 - sp.t;
                for (const ang of slashAngles) {
                    const len = 22 + sp.t * 52;
                    slashG.lineStyle(4 * a + 1, 0x000000, a * 0.9);
                    slashG.beginPath();
                    slashG.moveTo(ex - Math.cos(ang) * len, ey - Math.sin(ang) * len);
                    slashG.lineTo(ex + Math.cos(ang) * len, ey + Math.sin(ang) * len);
                    slashG.strokePath();
                }
            },
            onComplete: () => this.releaseGfx(slashG),
        });

        // ── Flying sharp shards (physics, frame-rate independent) ─────────────
        const GRAVITY = 380;   // px/s²
        const shards = [
            // 5 elongated spike-triangles
            ...Array.from({ length: 5 }, (_, i) => ({ type: "spike" as const, i, of: 5 })),
            // 4 irregular quads
            ...Array.from({ length: 4 }, (_, i) => ({ type: "quad" as const, i, of: 4 })),
        ];

        for (const shard of shards) {
            const baseAngle = (shard.i / shard.of) * Math.PI * 2
                + (shard.type === "quad" ? Math.PI / shard.of : 0)
                + (Math.random() - 0.5) * 0.55;
            const spd = 100 + Math.random() * 160;
            const vx = Math.cos(baseAngle) * spd;
            const vy = Math.sin(baseAngle) * spd - 50;
            const rot0 = Math.random() * Math.PI * 2;
            const rotS = (Math.random() - 0.5) * 14;
            const dur = 500 + Math.random() * 220;
            const pts = shard.type === "spike"
                ? this.shardSpike(10 + Math.random() * 8)
                : this.shardQuad(7 + Math.random() * 7);

            const fg = this.acquireGfx();
            const tp = { t: 0 };
            this.tweens.add({
                targets: tp, t: 1, duration: dur, ease: "Power1",
                onUpdate: () => {
                    fg.clear();
                    const s = tp.t * dur / 1000;
                    const fx = ex + vx * s;
                    const fy = ey + vy * s + 0.5 * GRAVITY * s * s;
                    const rot = rot0 + rotS * s;
                    const alpha = Math.max(0, 1 - tp.t * 1.15);
                    fg.fillStyle(0x000000, alpha);
                    fg.beginPath();
                    for (let j = 0; j < pts.length; j++) {
                        const px = fx + Math.cos(rot + pts[j].a) * pts[j].r;
                        const py = fy + Math.sin(rot + pts[j].a) * pts[j].r;
                        if (j === 0) fg.moveTo(px, py); else fg.lineTo(px, py);
                    }
                    fg.closePath();
                    fg.fillPath();
                    fg.lineStyle(1.5, 0x000000, alpha * 0.5);
                    fg.strokePath();
                },
                onComplete: () => this.releaseGfx(fg),
            });
        }

        // ── Spark lines (thin, fast, like metal sparks) ───────────────────────
        const sparkG = this.acquireGfx();
        const skp = { t: 0 };
        this.tweens.add({
            targets: skp, t: 1, duration: 320, ease: "Power3",
            onUpdate: () => {
                sparkG.clear();
                const alpha = 1 - skp.t;
                for (let i = 0; i < 16; i++) {
                    const ang = (i / 16) * Math.PI * 2;
                    const near = 6 + skp.t * 12;
                    const far = 18 + skp.t * 75;
                    sparkG.lineStyle(i % 3 === 0 ? 2 : 1, 0x000000, alpha * (i % 3 === 0 ? 0.9 : 0.45));
                    sparkG.beginPath();
                    sparkG.moveTo(ex + Math.cos(ang) * near, ey + Math.sin(ang) * near);
                    sparkG.lineTo(ex + Math.cos(ang) * far, ey + Math.sin(ang) * far);
                    sparkG.strokePath();
                }
            },
            onComplete: () => this.releaseGfx(sparkG),
        });

        this.time.delayedCall(600, () => {
            const idx = this.enemies.indexOf(enemy);
            if (idx !== -1) this.enemies.splice(idx, 1);
        });
    }

    /** Mini pop effect when one head of a 2-headed enemy is destroyed. */
    private popHead(wx: number, wy: number): void {
        const s = this._s;
        if (s.fx) {
            this.playKillNote();
        }

        // Small flash
        const flashG = this.acquireGfx();
        const fp = { t: 0 };
        this.tweens.add({
            targets: fp, t: 1, duration: 130, ease: "Power2",
            onUpdate: () => {
                flashG.clear();
                flashG.fillStyle(0x000000, (1 - fp.t) * 0.65);
                flashG.fillCircle(wx, wy, 4 + fp.t * 22);
            },
            onComplete: () => this.releaseGfx(flashG),
        });

        // One shockwave ring
        const rg = this.acquireGfx();
        const rp = { t: 0 };
        this.tweens.add({
            targets: rp, t: 1, duration: 250, ease: "Power2",
            onUpdate: () => {
                rg.clear();
                rg.lineStyle(2.5, 0x000000, (1 - rp.t) * 0.8);
                rg.strokeCircle(wx, wy, 8 + rp.t * 40);
            },
            onComplete: () => this.releaseGfx(rg),
        });

        // 4 mini shards flying out
        const GRAVITY = 380;
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spd = 55 + Math.random() * 75;
            const vx = Math.cos(ang) * spd;
            const vy = Math.sin(ang) * spd - 40;
            const rot0 = Math.random() * Math.PI * 2;
            const rotS = (Math.random() - 0.5) * 10;
            const dur = 280 + Math.random() * 140;
            const pts = this.shardSpike(4 + Math.random() * 4);

            const fg = this.acquireGfx();
            const tp = { t: 0 };
            this.tweens.add({
                targets: tp, t: 1, duration: dur, ease: "Power1",
                onUpdate: () => {
                    fg.clear();
                    const s = tp.t * dur / 1000;
                    const fx = wx + vx * s;
                    const fy = wy + vy * s + 0.5 * GRAVITY * s * s;
                    const rot = rot0 + rotS * s;
                    const alpha = Math.max(0, 1 - tp.t * 1.3);
                    fg.fillStyle(0x000000, alpha);
                    fg.beginPath();
                    for (let j = 0; j < pts.length; j++) {
                        const px = fx + Math.cos(rot + pts[j].a) * pts[j].r;
                        const py = fy + Math.sin(rot + pts[j].a) * pts[j].r;
                        if (j === 0) fg.moveTo(px, py); else fg.lineTo(px, py);
                    }
                    fg.closePath();
                    fg.fillPath();
                },
                onComplete: () => this.releaseGfx(fg),
            });
        }
    }

    /** Elongated spike triangle: sharp and thin. */
    private shardSpike(size: number): { a: number; r: number }[] {
        return [
            { a: 0, r: size * 1.8 },   // tip
            { a: Math.PI * 0.72, r: size * 0.38 },  // base left
            { a: -Math.PI * 0.72, r: size * 0.38 },  // base right
        ];
    }

    /** Irregular angular quad: jagged broken-piece look. */
    private shardQuad(size: number): { a: number; r: number }[] {
        return Array.from({ length: 4 }, (_, i) => {
            const base = (i / 4) * Math.PI * 2;
            return {
                a: base + (Math.random() - 0.5) * (Math.PI / 4),
                r: size * (0.55 + Math.random() * 0.65),
            };
        });
    }

    // ─── Kill celebration ────────────────────────────────────────────────────────

    private showKillFeedback(label: string, comboCount: number, tier: 'double' | 'triple' | 'combo'): void {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;
        const cy = h * 0.64;

        // Dismiss any active feedback immediately — kill the tween first so
        // its onComplete never fires against an already-destroyed object.
        if (this.activeFeedback) {
            this.tweens.killTweensOf(this.activeFeedback.burstProg);
            this.activeFeedback.text.destroy();
            this.activeFeedback.burst.destroy();
            this.activeFeedback = undefined;
        }

        // ── Burst background (radiating lines) ───────────────────────────────
        const burst = this.add.graphics();
        const burstProg = { t: 0 };
        this.tweens.add({
            targets: burstProg,
            t: 1,
            duration: 600,
            ease: 'Power2',
            onUpdate: () => {
                burst.clear();
                const alpha = 1 - burstProg.t;
                const rayCount = tier === 'triple' ? 18 : tier === 'double' ? 14 : 10;
                const maxR = tier === 'triple' ? 180 : tier === 'double' ? 150 : 120;
                for (let i = 0; i < rayCount; i++) {
                    const angle = (i / rayCount) * Math.PI * 2;
                    const inner = 28 + burstProg.t * 8;
                    const outer = inner + maxR * burstProg.t;
                    const thick = i % 2 === 0 ? 3.5 : 1.5;
                    burst.lineStyle(thick, 0xffffff, alpha * (i % 2 === 0 ? 0.85 : 0.35));
                    burst.beginPath();
                    burst.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
                    burst.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
                    burst.strokePath();
                }
                // Pulsing ring
                burst.lineStyle(tier === 'triple' ? 4 : 2.5, 0xffffff, alpha * 0.6);
                burst.strokeCircle(cx, cy, 22 + burstProg.t * (maxR * 0.55));
            },
            onComplete: () => burst.destroy(),
        });

        // ── Main label text ───────────────────────────────────────────────────
        const isMultiKill = tier !== 'combo';
        const mainStr = isMultiKill ? label : `COMBO`;
        const subStr = isMultiKill
            ? (comboCount >= 2 ? `COMBO x${comboCount}` : '')
            : `x${comboCount}`;

        const fontSize = tier === 'triple' ? 52 : tier === 'double' ? 44 : 36;
        const text = this.add.text(cx, cy - 8, mainStr, {
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            fontStyle: '700',
            stroke: '#000000',
            strokeThickness: tier === 'triple' ? 8 : 6,
            letterSpacing: 2,
        } as any).setOrigin(0.5, 0.5).setAlpha(0).setScale(0.3);

        // Sub label (combo count overlay or combo streak)
        let subText: Phaser.GameObjects.Text | null = null;
        if (subStr) {
            subText = this.add.text(cx, cy + fontSize * 0.72, subStr, {
                fontFamily: "'Outfit', sans-serif",
                fontSize: '22px',
                color: '#ffffff',
                fontStyle: '700',
                stroke: '#000000',
                strokeThickness: 4,
                letterSpacing: 3,
            } as any).setOrigin(0.5, 0.5).setAlpha(0).setScale(0.5);
        }

        // Punch-in animation
        this.tweens.add({
            targets: text,
            alpha: 1,
            scaleX: tier === 'triple' ? 1.15 : 1.05,
            scaleY: tier === 'triple' ? 1.15 : 1.05,
            duration: 120,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: text,
                    scaleX: 1, scaleY: 1,
                    duration: 80,
                    ease: 'Power1',
                });
            },
        });
        if (subText) {
            this.tweens.add({
                targets: subText,
                alpha: 1,
                scaleX: 1, scaleY: 1,
                duration: 140,
                delay: 80,
                ease: 'Power2',
            });
        }

        // Hold then fade out
        const holdMs = tier === 'triple' ? 1200 : tier === 'double' ? 1000 : 800;
        this.time.delayedCall(holdMs, () => {
            this.tweens.add({
                targets: subText ? [text, subText] : [text],
                alpha: 0,
                y: `-=28`,
                duration: 350,
                ease: 'Power2',
                onComplete: () => {
                    text.destroy();
                    subText?.destroy();
                    if (this.activeFeedback?.text === text) this.activeFeedback = undefined;
                },
            });
        });

        this.activeFeedback = { text, burst, burstProg };
    }

    /**
     * Plays the base kill sound pitch-shifted to the next note in the melody.
     * Consecutive kills within the combo window step up the scale, creating a
     * satisfying melodic sequence. Resets when the combo window expires.
     */
    private playKillNote(): void {
        if (!this._s.fx) return;
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (!ctx) return;

        // Try to use the preloaded ElevenLabs killBase buffer for rich character.
        // Fall back to a synthesised sine tone if the buffer isn't ready yet.
        const phaserCacheEntry = this.cache.audio.get('killBase');
        const buffer: AudioBuffer | undefined = phaserCacheEntry ?? undefined;

        const semitones = this.KILL_MELODY_STEPS[this.killNoteIdx % this.KILL_MELODY_STEPS.length];
        this.killNoteIdx++;
        const playbackRate = Math.pow(2, semitones / 12);

        if (buffer) {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.playbackRate.value = playbackRate;

            const gain = ctx.createGain();
            gain.gain.value = 0.30;
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start();
            src.onended = () => {
                try { src.disconnect(); gain.disconnect(); } catch (_) {}
            };
        } else {
            // Fallback: synthesise a warm sine tone at the same relative pitch
            const baseHz = 130; // C3
            const freq = baseHz * playbackRate;
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(env);
            env.connect(ctx.destination);
            const t = ctx.currentTime;
            env.gain.setValueAtTime(0.001, t);
            env.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
            env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc.start(t);
            osc.stop(t + 0.36);
            osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch (_) {} };
        }
    }

    private playKillCelebration(tier: 'double' | 'triple' | 'combo', comboLevel = 2): void {
        if (!this._s.fx) return;
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (!ctx) return;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.22;
        masterGain.connect(ctx.destination);

        // Note sequences per tier (frequencies in Hz)
        const sequences: { freq: number; delay: number; dur: number; type: OscillatorType }[] = [];

        if (tier === 'triple') {
            // Triumphant ascending fanfare – 3 quick tones + high accent
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                sequences.push({ freq, delay: i * 0.07, dur: 0.18, type: 'square' });
            });
        } else if (tier === 'double') {
            // Satisfying two-tone chime
            sequences.push({ freq: 587, delay: 0,    dur: 0.16, type: 'square' });
            sequences.push({ freq: 784, delay: 0.07, dur: 0.18, type: 'square' });
        } else {
            // Combo: escalating pitch stabs – higher = more intense
            const base = 440 + Math.min(comboLevel - 2, 6) * 40;
            sequences.push({ freq: base,        delay: 0,    dur: 0.10, type: 'square' });
            sequences.push({ freq: base * 1.25, delay: 0.06, dur: 0.12, type: 'square' });
            if (comboLevel >= 4) {
                sequences.push({ freq: base * 1.5, delay: 0.12, dur: 0.14, type: 'square' });
            }
        }

        let maxStopMs = 0;
        for (const { freq, delay, dur, type } of sequences) {
            const osc = ctx.createOscillator();
            const envGain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(envGain);
            envGain.connect(masterGain);
            const t0 = ctx.currentTime + delay;
            envGain.gain.setValueAtTime(0.001, t0);
            envGain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.012);
            envGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            osc.start(t0);
            osc.stop(t0 + dur + 0.01);
            osc.onended = () => { try { osc.disconnect(); envGain.disconnect(); } catch (_) {} };
            maxStopMs = Math.max(maxStopMs, (delay + dur + 0.01) * 1000);
        }
        // Disconnect master gain shortly after the last oscillator stops
        setTimeout(() => { try { masterGain.disconnect(); } catch (_) {} }, maxStopMs + 300);
    }

    // ─── Feedback ────────────────────────────────────────────────────────────────

    private showFeedback(correct: boolean): void {
        const w = this.scale.width;
        const h = this.scale.height;
        this.feedbackText.setPosition(w / 2, (3 * h) / 4);
        this.feedbackText.setText(correct ? "✓" : "✗");
        this.feedbackText.setColor(correct ? "#006600" : "#cc0000");
        this.feedbackText.setScale(0.5).setAlpha(1);
        this.tweens.add({
            targets: this.feedbackText,
            scaleX: 1.4, scaleY: 1.4, alpha: 0,
            duration: 560, ease: "Power2",
        });
    }

    /** Leaping pose: tuck legs on the way up, extend/dive on the way down. */
    private redrawEnemyLeaping(e: Enemy, t: number): void {
        const g = e.gfx;
        g.clear();

        // hipY: tuck tight until peak (t=0.5), then shoot legs forward for the pounce
        const hipY = t < 0.5
            ? HIP_Y * (1 - 0.65 * (t / 0.5))          // stand → deep tuck at peak
            : HIP_Y * (0.35 + 0.65 * ((t - 0.5) / 0.5)); // tuck → extend for landing

        this.drawEnemyPose(g, e, hipY, 0, 0, 1);
    }

    // ─── Update loop ─────────────────────────────────────────────────────────────

    update(time: number, delta: number): void {
        if (this.isGameOver) return;
        const wizardX = this.wizardX;
        // Wizard head world position (container.y for the enemy so its head hits the wizard head)
        const wizardHY = this.groundY - 56 - HEAD_CY * ENEMY_SCALE;  // adjusted for enemy scale

        // Auto AI for attract mode
        if (this.attractMode && !this.isGameOver) {
            if (this.attractDrawState) {
                this.attractDrawState.elapsedMs += delta;
                const progress = this.attractDrawState.elapsedMs / this.attractDrawState.durationMs;
                this.drawPartialPath(this.attractDrawState.path, progress);

                if (progress >= 1) {
                    const target = this.attractDrawState.enemy;
                    const symbol = this.attractDrawState.symbol;
                    const idx = target.symbols.indexOf(symbol);

                    if (target.alive && !target.hit && idx !== -1) {
                        const headPos = this.getHeadWorldPos(target, idx);
                        target.symbols.splice(idx, 1);
                        this.points = this.attractDrawState.path.slice();
                        this.flashDrawing();
                        this.wizardAttack();

                        if (target.symbols.length === 0) {
                            target.hit = true;
                            this.explodeEnemy(target);
                        } else {
                            this.popHead(headPos.x, headPos.y);
                        }
                    }

                    this.attractDrawState = null;
                    this.autoAimTimer = 0;
                }
            } else {
                this.autoAimTimer += delta;
                if (this.autoAimTimer > 950) {
                    let target: Enemy | null = null;
                    let closest = Infinity;
                    for (const e of this.enemies) {
                        if (!e.alive || e.hit || e.symbols.length === 0) continue;
                        if (e.x < closest && e.x < wizardX + this.scale.width * 0.72) {
                            closest = e.x;
                            target = e;
                        }
                    }
                    if (target) {
                        this.startAttractDraw(target);
                    }
                }
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive || e.hit) continue;

            // ── Leap-attack flight ────────────────────────────────────────────
            if (e.leaping) {
                const leapMs = e.dark ? LEAP_MS * DARK_LEAP_DURATION_MULT : LEAP_MS;
                e.leapT += delta / leapMs;

                if (e.leapT >= 1) {
                    // Landed on wizard – damage = number of shapes remaining
                    const damage = e.symbols.length;
                    if (e.boss) { this.bossAlive = false; this.stopBossMusic(); }
                    e.alive = false;
                    e.container.destroy();
                    this.enemies.splice(i, 1);
                    const flashRepeats = damage >= 3 ? 9 : damage >= 2 ? 6 : 4;
                    this.tweens.add({
                        targets: this.wizardSprite,
                        alpha: 0, duration: 60, yoyo: true, repeat: flashRepeats,
                    });
                    this.takeDamage(damage);
                    continue;
                }

                const t = e.leapT;
                const cx = e.leapSX + (e.leapTX - e.leapSX) * t;
                // Parabolic arc: straight-line Y minus sin-arc height
                const cy = e.leapSY + (e.leapTY - e.leapSY) * t - Math.sin(t * Math.PI) * LEAP_ARC;
                e.container.x = cx;
                e.container.y = cy;
                e.x = cx;
                this.redrawEnemyLeaping(e, t);
                continue;
            }

            // ── Normal hop movement ───────────────────────────────────────────
            const freq = ((2 * Math.PI) / HOP_CYCLE) * e.hopMult;
            const raw = ((time * freq + e.phase) % (2 * Math.PI)) / (2 * Math.PI);
            const hopSpeedMult = e.dark ? 2 : 1;
            if (e.running) {
                e.x -= e.speed * 2 * hopSpeedMult * (delta / 1000);
            } else if (raw >= 0.63) {
                e.x -= e.speed * 2 * hopSpeedMult * (delta / 1000);
            }
            e.container.x = e.x;
            this.redrawEnemy(e, time);
            if (e.boss && e.bossType) this.tickBossSpecial(e, time, delta);

            // ── Trigger leap when close enough ────────────────────────────────
            const leapTrigger = e.dark ? LEAP_TRIGGER * DARK_LEAP_TRIGGER_MULT : LEAP_TRIGGER;
            if (e.canLeap && e.x < wizardX + leapTrigger) {
                e.leaping = true;
                e.leapT = 0;
                e.leapSX = e.x;
                e.leapSY = e.container.y;
                e.trail.length = 0;
                e.leapTX = wizardX;
                e.leapTY = wizardHY;
            } else if (!e.leaping && e.x <= wizardX + 25) {
                // Walked into wizard – damage = number of shapes remaining
                const damage = e.symbols.length;
                if (e.boss) { this.bossAlive = false; this.stopBossMusic(); }
                e.alive = false;
                e.container.destroy();
                this.enemies.splice(i, 1);
                const flashRepeats = damage >= 3 ? 9 : damage >= 2 ? 6 : 4;
                this.tweens.add({
                    targets: this.wizardSprite,
                    alpha: 0, duration: 60, yoyo: true, repeat: flashRepeats,
                });
                this.takeDamage(damage);
            }
        }
    }

}
