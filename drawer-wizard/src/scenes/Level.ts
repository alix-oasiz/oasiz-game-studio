import { detectShape, Point } from "../utils/shapeDetector";
import { showGameOver, triggerHaptic, getSettings } from "../ui";

// Character geometry constants (local coords, feet = 0,0)
const HEAD_R = 22;
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

const LEAP_TRIGGER = 170;   // px from wizard centre → start leap
const LEAP_ARC = 130;   // px extra height above the straight line
const LEAP_MS = 620;   // leap duration in ms
const DARK_LEAP_DURATION_MULT = 1.35;

interface Enemy {
    x: number;
    y: number;       // world groundY (container anchor)
    symbols: string[];   // 1 or 2 symbols (stacked heads, bottom = [0])
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
}

export default class Level extends Phaser.Scene {

    private enemies: Enemy[] = [];
    private drawingGraphics!: Phaser.GameObjects.Graphics;
    private wizardSprite!: Phaser.GameObjects.Image;
    private feedbackText!: Phaser.GameObjects.Text;
    private scoreText!: Phaser.GameObjects.Text;
    private score = 0;
    private nextBossScore = 200;
    private points: Point[] = [];
    private isDrawing = false;
    private groundY = 0;
    private hopH = HOP_H;   // scaled per-device in create()
    private wizardX = 0;
    private spawnLoop?: Phaser.Time.TimerEvent;
    private bossAlive = false;
    private isGameOver = false;
    private bgMusic?: Phaser.Sound.BaseSound;

    private attractMode: boolean = false;
    private autoAimTimer: number = 0;
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
        this.setupInput();

        this.enemies = [];
        this.spawnLoop = undefined;
        this.points = [];
        this.isDrawing = false;
        this.bossAlive = false;
        this.isGameOver = false;
        this.score = 0;
        this.nextBossScore = 200;

        this.startSpawnLoop();

        if (!this.bgMusic) {
            this.bgMusic = this.sound.add('bgMusic', { loop: true });
            this.bgMusic.play();
        } else if (!this.bgMusic.isPlaying) {
            this.bgMusic.play();
        }

        const onRestart = () => {
            this.scene.restart();
        };
        const onSettings = () => {
            const s = getSettings();
            if (this.bgMusic) {
                (this.bgMusic as any).setVolume(s.music ? 1 : 0);
            }
        };
        const onBtnClick = () => {
            if (getSettings().fx) {
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

        this.events.once('shutdown', () => {
            window.removeEventListener('restart-game', onRestart);
            window.removeEventListener('settings-changed', onSettings);
            window.removeEventListener('btn-click', onBtnClick);
            window.removeEventListener('scene-pause', onPause);
            window.removeEventListener('scene-resume', onResume);
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

        this.scoreText = this.add.text(w / 2, 18, "0", {
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
            this.drawingGraphics.setVisible(true);
            this.drawingGraphics.setAlpha(0.95);
            this.attractHintText = this.add.text(w / 2, h * 0.76, "Draw the symbol to stop the enemies!", {
                fontFamily: "Arial",
                fontSize: "20px",
                color: "#ffffff",
                fontStyle: "bold",
            }).setOrigin(0.5, 0.5).setAlpha(0.82);
        }
    }

    // ─── Enemies ─────────────────────────────────────────────────────────────────

    private spawnEnemy(): void {
        const w = this.scale.width;
        const allSymbols = [
            "Triangle",
            "Square",
            "Vertical Line",
            "Horizontal Line",
            "Circle",
            "/",
            "\\",
            "V",
        ];

        const isDark = Math.random() < DARK_ENEMY_CHANCE;
        const isRunning = Math.random() < 0.60;
        // White: 30% chance of 2-headed. Dark: allow 3-headed stacks too.
        let count = Math.random() < 0.30 ? 2 : 1;
        if (isDark && Math.random() < 0.35) count = 3;
        if (isRunning) count = 1;
        const shuffled = [...allSymbols].sort(() => Math.random() - 0.5);
        const symbols = shuffled.slice(0, count);

        const spawnX = w + 30;
        const container = this.add.container(spawnX, this.groundY);
        const gfx = this.add.graphics();
        container.add(gfx);
        container.setScale(ENEMY_SCALE);

        // Normalize speed so enemies always take the same time to reach the
        // wizard regardless of screen width.
        // Travel distance = spawn to leap-trigger = (spawnX) - (wizardX + LEAP_TRIGGER)
        // Reference (430px wide mobile): 430 - 172 = 258px
        const WIZARD_X = this.wizardX;
        const REF_TRAVEL = 258;                                // px at 430-wide screen
        const actualTravel = Math.max(1, spawnX - (WIZARD_X + LEAP_TRIGGER));
        const speedScale = actualTravel / REF_TRAVEL;
        const baseSpeed = (24 + Math.random() * 19) * 1.5;   // 1.5x speed multiplier

        this.enemies.push({
            x: spawnX,
            y: this.groundY,
            symbols,
            container,
            gfx,
            speed: baseSpeed * speedScale,
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
        });
    }

    private spawnBoss(): void {
        const w = this.scale.width;
        const allSymbols = [
            "Triangle",
            "Square",
            "Vertical Line",
            "Horizontal Line",
            "Circle",
            "/",
            "\\",
            "V",
        ];

        const spawnX = w + 30;
        const container = this.add.container(spawnX, this.groundY);
        const gfx = this.add.graphics();
        container.add(gfx);
        container.setScale(ENEMY_SCALE);

        const WIZARD_X = this.wizardX;
        const REF_TRAVEL = 258;
        const actualTravel = Math.max(1, spawnX - (WIZARD_X + LEAP_TRIGGER));
        const speedScale = actualTravel / REF_TRAVEL;
        const baseSpeed = (24 + Math.random() * 19) * 1.5;

        const shuffled = [...allSymbols].sort(() => Math.random() - 0.5);
        const symbols = Array.from({ length: 5 }, (_, i) => shuffled[i % shuffled.length]);

        this.enemies.push({
            x: spawnX,
            y: this.groundY,
            symbols,
            container,
            gfx,
            speed: baseSpeed * speedScale * 0.5,
            alive: true,
            hit: false,
            phase: Math.random() * Math.PI * 2,
            dark: true,
            running: false,
            boss: true,
            hopMult: 1,
            trail: [],
            leaping: false, leapT: 0,
            leapSX: 0, leapSY: 0, leapTX: 0, leapTY: 0,
            canLeap: Math.random() < 0.30,
        });
        this.bossAlive = true;
    }

    private startSpawnLoop(): void {
        if (this.spawnLoop) return;
        this.spawnLoop = this.time.addEvent({ delay: 2133, callback: this.spawnTick, callbackScope: this, loop: true });
        this.spawnTick();
    }

    private spawnTick(): void {
        if (this.bossAlive) return;

        if (this.score >= this.nextBossScore) {
            this.spawnBoss();
            this.nextBossScore += 200;
            // Stop normal enemy spawns during boss fight
            if (this.spawnLoop) {
                this.spawnLoop.remove();
                this.spawnLoop = undefined;
            }
        } else {
            this.spawnEnemy();
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

        if (e.boss) {
            const freq = ((2 * Math.PI) / HOP_CYCLE) * e.hopMult;
            const raw = ((time * freq + e.phase) % (2 * Math.PI)) / (2 * Math.PI);
            let hipY: number;
            let hop = 0;

            if (raw < 0.08) {
                const compress = Math.sin((raw / 0.08) * Math.PI);
                hipY = lerp(HIP_Y, HIP_Y * 0.62, compress);
            } else if (raw < 0.36) {
                hipY = HIP_Y;
            } else if (raw < 0.63) {
                const wu = 1 - Math.cos(((raw - 0.36) / 0.27) * Math.PI / 2);
                hipY = lerp(HIP_Y, HIP_Y * 0.40, wu);
                hop = 0;
            } else {
                const t = (raw - 0.63) / 0.37;
                hop = Math.sin(t * Math.PI);
                if (t < 0.35) {
                    const ht = t / 0.35;
                    hipY = lerp(HIP_Y * 0.40, HIP_Y, 1 - (1 - ht) * (1 - ht));
                } else {
                    hipY = HIP_Y;
                }
            }

            e.container.y = e.y - hop * this.hopH;
            this.drawEnemyPose(g, e, hipY, 0, 0, 1);
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
        for (const e of this.enemies) {
            if (!e.alive || e.hit) continue;
            const idx = e.symbols.indexOf(detected);
            if (idx === -1) continue;

            anyHit = true;
            this.score += 10;
            this.scoreText.setText(String(this.score));

            // World position of the hit head at this moment
            const headPos = this.getHeadWorldPos(e, idx);
            const wx = headPos.x;
            const wy = headPos.y;

            e.symbols.splice(idx, 1);

            if (e.symbols.length === 0) {
                e.hit = true;
                this.explodeEnemy(e);
            } else {
                this.popHead(wx, wy);
            }
        }

        if (anyHit) {
            this.flashDrawing();
            this.wizardAttack();
            triggerHaptic('medium');
        } else {
            if (detected !== "none") {
                this.cameras.main.shake(120, 0.008);
                triggerHaptic('light');
                const s = getSettings();
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

    // ─── Explosion ───────────────────────────────────────────────────────────────

    private explodeEnemy(enemy: Enemy): void {
        const ex = enemy.x;
        const ey = enemy.y + HEAD_CY * ENEMY_SCALE;

        const s = getSettings();
        if (s.fx) {
            this.sound.play('kill', { volume: 0.20 });
        }

        if (enemy.dark) {
            this.score += 25;
            this.scoreText.setText(String(this.score));
        }
        if (enemy.boss) {
            this.bossAlive = false;
            this.time.delayedCall(650, () => this.startSpawnLoop());
        }

        // Instantly hide enemy
        enemy.container.setAlpha(0);
        this.time.delayedCall(10, () => { enemy.container.destroy(); enemy.alive = false; });

        // ── Impact flash ──────────────────────────────────────────────────────
        const flashG = this.add.graphics();
        const fp = { t: 0 };
        this.tweens.add({
            targets: fp, t: 1, duration: 180, ease: "Power3",
            onUpdate: () => {
                flashG.clear();
                flashG.fillStyle(0x000000, (1 - fp.t) * 0.75);
                flashG.fillCircle(ex, ey, 8 + fp.t * 50);
            },
            onComplete: () => flashG.destroy(),
        });

        // ── Two shockwave rings ───────────────────────────────────────────────
        for (let r = 0; r < 2; r++) {
            const rg = this.add.graphics();
            const rp = { t: 0 };
            this.tweens.add({
                targets: rp, t: 1, delay: r * 70, duration: 380, ease: "Power2",
                onUpdate: () => {
                    rg.clear();
                    rg.lineStyle(3.5 - r * 1.5, 0x000000, (1 - rp.t) * 0.85);
                    rg.strokeCircle(ex, ey, 14 + rp.t * 90);
                },
                onComplete: () => rg.destroy(),
            });
        }

        // ── Sharp cross-slash marks ───────────────────────────────────────────
        const slashG = this.add.graphics();
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
            onComplete: () => slashG.destroy(),
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

            const fg = this.add.graphics();
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
                onComplete: () => fg.destroy(),
            });
        }

        // ── Spark lines (thin, fast, like metal sparks) ───────────────────────
        const sparkG = this.add.graphics();
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
            onComplete: () => sparkG.destroy(),
        });

        this.time.delayedCall(600, () => {
            const idx = this.enemies.indexOf(enemy);
            if (idx !== -1) this.enemies.splice(idx, 1);
        });
    }

    /** Mini pop effect when one head of a 2-headed enemy is destroyed. */
    private popHead(wx: number, wy: number): void {
        const s = getSettings();
        if (s.fx) {
            this.sound.play('kill', { volume: 0.20 });
        }

        // Small flash
        const flashG = this.add.graphics();
        const fp = { t: 0 };
        this.tweens.add({
            targets: fp, t: 1, duration: 130, ease: "Power2",
            onUpdate: () => {
                flashG.clear();
                flashG.fillStyle(0x000000, (1 - fp.t) * 0.65);
                flashG.fillCircle(wx, wy, 4 + fp.t * 22);
            },
            onComplete: () => flashG.destroy(),
        });

        // One shockwave ring
        const rg = this.add.graphics();
        const rp = { t: 0 };
        this.tweens.add({
            targets: rp, t: 1, duration: 250, ease: "Power2",
            onUpdate: () => {
                rg.clear();
                rg.lineStyle(2.5, 0x000000, (1 - rp.t) * 0.8);
                rg.strokeCircle(wx, wy, 8 + rp.t * 40);
            },
            onComplete: () => rg.destroy(),
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

            const fg = this.add.graphics();
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
                onComplete: () => fg.destroy(),
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
                    // Landed on wizard
                    e.alive = false;
                    e.container.destroy();
                    this.enemies.splice(i, 1);
                    this.tweens.add({
                        targets: this.wizardSprite,
                        alpha: 0, duration: 60, yoyo: true, repeat: 7,
                    });

                    if (!this.isGameOver && !this.attractMode) {
                        this.isGameOver = true;
                        if (getSettings().fx) {
                            this.sound.play('gothit', { volume: 0.8 });
                        }
                        triggerHaptic('heavy');
                        this.cameras.main.shake(300, 0.01);
                        if (this.spawnLoop) this.spawnLoop.remove();
                        this.time.delayedCall(800, () => {
                            showGameOver(this.score);
                            triggerHaptic('error');
                        });
                    }
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
                // Landed on wizard directly (walked into player)
                e.alive = false;
                e.container.destroy();
                this.enemies.splice(i, 1);
                this.tweens.add({
                    targets: this.wizardSprite,
                    alpha: 0, duration: 60, yoyo: true, repeat: 7,
                });

                if (!this.isGameOver && !this.attractMode) {
                    this.isGameOver = true;
                    if (getSettings().fx) {
                        this.sound.play('gothit', { volume: 0.8 });
                    }
                    triggerHaptic('heavy');
                    this.cameras.main.shake(300, 0.01);
                    if (this.spawnLoop) this.spawnLoop.remove();
                    this.time.delayedCall(800, () => {
                        showGameOver(this.score);
                        triggerHaptic('error');
                    });
                }
            }
        }
    }

}
