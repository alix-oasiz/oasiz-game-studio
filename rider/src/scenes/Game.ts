import Phaser from "phaser";
import { getAudioManager } from "../audio";

export default class Game extends Phaser.Scene {

    // Player pieces
    public player!: Phaser.Physics.Matter.Image | any;

    // Controls
    public isAccelerating: boolean = false;
    public isGrounded: boolean = false;
    public isGameOver: boolean = false;
    public airTime: number = 0;
    private spaceKey!: Phaser.Input.Keyboard.Key;

    // Generation
    private lastTerrainPoint: { x: number, y: number } = { x: 0, y: 500 };
    private terrainGroup: any[] = []; // Store terrain bodies {body, width}
    private gemGroup: any[] = []; // Store gem bodies

    // Visuals
    private motorcycleSprite!: Phaser.GameObjects.Image;
    private graphics!: Phaser.GameObjects.Graphics;
    private bgGraphics!: Phaser.GameObjects.Graphics;
    // Parallax background layers
    private bgStars: { x: number, y: number, r: number }[] = [];
    private bgMountains: { x: number, h: number, w: number, points: { nx: number, ny: number }[] }[] = [];
    private bgMountainsSpan: number = 0;
    private rockPatternWidth: number = 2000;
    private readonly rockPatternCount: number = 3;
    private rockParallaxSpeed: number = 1;
    private rockPatterns: { xOffset: number, rocks: { x: number, h: number, w: number, baseColor: number, polys: { colorOffset: number, points: { nx: number, ny: number }[] }[] }[] }[] = [];
    private sparksEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private glowTrailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private accelBurstEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private wheelSparksEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private speedLinesGfx!: Phaser.GameObjects.Graphics;

    // UI
    public flipCount: number = 0;
    public collectedGems: number = 0;
    private airRotationAccumulator: number = 0;
    private lastAirAngle: number = 0;
    private wasAirborne: boolean = false;
    private scoreText!: Phaser.GameObjects.Text;
    private descentAllowance: number = 0; // Pixels of descent allowed, earned by climbing up first
    private lastChunkEndSlope: number = 0; // dy/dx continuity hint between generated chunks
    private readonly terrainMinY: number = 280;
    private readonly terrainMaxY: number = 580;
    private nearZoom: number = 0.74;
    private farZoom: number = 0.48;
    private readonly cameraLerp: number = 0.06;
    private cameraZoomPulse: number = 0;
    private prevAccelerating: boolean = false;
    private readonly cameraBaseY: number = 500;
    private readonly cameraHeightRange: number = 700;
    private readonly cameraHighAltitudeDownOffset: number = 230;
    private lastTerrainGenTime: number = 0;
    // Kinematic motor state
    private kinX: number = 200;
    private kinY: number = 465;
    private kinAngle: number = 0;
    private kinVelX: number = 0;
    private kinVelY: number = 0;
    private kinAngularVel: number = 0;
    private kinOnGround: boolean = false;
    private wheelBottomFromCOM: number = 20;

    // Parkour System State
    private parkourState: 'FLAT' | 'OBSTACLE' = 'FLAT';
    private parkourBag: number[] = []; // Shuffle-bag for fair random parkour selection

    // Motor sabitleri
    private readonly maxGroundSpeed: number = 25;
    private readonly airSpinSpeed: number = -0.16;
    private readonly airSpinLerp: number = 0.11;
    private readonly airSpinDamping: number = 0.82;
    private readonly landingContactAbove: number = 18;
    private readonly landingContactBelow: number = 6;
    private readonly noCrashTiltFromRoad: number = Math.PI * 0.12;
    private readonly maxLandingTiltFromRoad: number = Math.PI * 0.46;
    private readonly maxLandingNormalSpeed: number = 6.8;
    private readonly maxLandingAngularSpeed: number = 0.7;
    private readonly fallDeathY: number = 1650;
    private readonly audio = getAudioManager();

    constructor() {
        super("Game");
    }

    preload() {
        const keyMap: Record<string, string> = {
            'motorcycle_blue': 'blue',
            'motorcycle_brown': 'brown',
            'motorcycle_red': 'red',
            'motorcycle_neon_purple': 'purple',
        };
        let skin = localStorage.getItem('selectedSkin') || 'blue';
        if (keyMap[skin]) {
            skin = keyMap[skin];
            localStorage.setItem('selectedSkin', skin);
        }
        if (this.textures.exists('motorcycle')) {
            this.textures.remove('motorcycle');
        }
        this.load.image('motorcycle', `assets/Motorcycles/${skin}.png?t=${Date.now()}`);
    }

    create() {
        // --- Reset State on Restart ---
        this.isAccelerating = false;
        this.isGrounded = false;
        this.isGameOver = false;
        this.airTime = 0;
        this.flipCount = 0;
        this.collectedGems = 0;
        this.airRotationAccumulator = 0;
        this.lastAirAngle = 0;
        this.wasAirborne = false;
        this.descentAllowance = 0;
        this.lastChunkEndSlope = 0;
        this.lastTerrainGenTime = 0;
        this.kinX = 200;
        this.kinY = 465;
        this.kinAngle = 0;
        this.kinVelX = 14;
        this.kinVelY = 0;
        this.kinAngularVel = 0;
        this.kinOnGround = false;

        this.parkourState = 'FLAT';

        // --- DYNAMIC CAMERA SCALING FOR MOBILE ---
        if (window.innerWidth <= 768) {
            // Mobile (Portrait typical): Pull camera back significantly
            this.nearZoom = 0.42;
            this.farZoom = 0.28;
        } else {
            // Desktop/Tablet Landscape: Normal zoom
            this.nearZoom = 0.74;
            this.farZoom = 0.48;
        }

        // Ensure old terrain physics bodies are removed from world (Matter.js caches static bodies across scene restarts sometimes)
        if (this.terrainGroup && this.terrainGroup.length > 0) {
            this.terrainGroup.forEach(t => this.matter.world.remove(t.body));
        }
        this.terrainGroup = [];

        if (this.gemGroup && this.gemGroup.length > 0) {
            this.gemGroup.forEach(g => this.matter.world.remove(g));
        }
        this.gemGroup = [];

        this.lastTerrainPoint = { x: 0, y: 500 };

        // Ensure physics is running if it was paused previously
        this.matter.world.resume();

        // Stiffen the physics engine solvers to prevent the heavy wheeled body from sinking into the static ground
        this.matter.world.engine.positionIterations = 18;
        this.matter.world.engine.velocityIterations = 12;
        this.matter.world.engine.constraintIterations = 3;

        // Zoom out camera slightly so player can see more of the upcoming track
        this.cameras.main.setZoom(this.nearZoom);

        // Create a dedicated UI Camera that doesn't zoom or pan
        const uiCamera = this.cameras.add(0, 0, this.cameras.main.width, this.cameras.main.height);

        // Dark neon background color like the Rider game
        this.cameras.main.setBackgroundColor(0x0a0014);

        // Background graphics layer (draw order: behind terrain)
        this.bgGraphics = this.add.graphics();
        this.bgGraphics.setDepth(-10);
        this.bgGraphics.setScrollFactor(0); // Manually apply parallax each frame

        // --- Generate parallax background data ---
        const W = this.scale.width;

        // Layer 1: Tiny ambient stars (spread across a wide world span for wrapping)
        this.bgStars = [];
        for (let i = 0; i < 120; i++) {
            this.bgStars.push({
                x: Math.random() * W * 8,
                y: 0.05 + Math.random() * 0.55, // As fraction of screen height
                r: 0.5 + Math.random() * 1.5
            });
        }

        // Layer 2: Distant huge mountains (silhouettes, trapezoids and chains)
        this.bgMountainsSpan = W * 8;
        this.bgMountains = [];
        let mx = 0;
        while (mx < this.bgMountainsSpan) {
            const mw = 300 + Math.random() * 500;
            const h = 0.3 + Math.random() * 0.4;

            const numPeaks = Phaser.Math.Between(1, 3);
            const points: { nx: number, ny: number }[] = [];
            points.push({ nx: 0, ny: 0 }); // Base left

            const peakWidth = 1 / numPeaks;
            for (let p = 0; p < numPeaks; p++) {
                const startX = p * peakWidth;
                const endX = (p + 1) * peakWidth;

                // Valley between peaks if not first
                if (p > 0) {
                    points.push({ nx: startX, ny: 0.2 + Math.random() * 0.3 });
                }

                const plateauStartX = startX + peakWidth * (0.15 + Math.random() * 0.2);
                const plateauEndX = endX - peakWidth * (0.15 + Math.random() * 0.2);
                const peakH = 0.5 + Math.random() * 0.5; // Relative to overall height 'h'

                points.push({ nx: plateauStartX, ny: peakH });
                points.push({ nx: plateauEndX, ny: peakH });
            }
            points.push({ nx: 1, ny: 0 }); // Base right

            this.bgMountains.push({ x: mx, h: h, w: mw, points });
            mx += mw * 0.6 + Math.random() * 100;
        }

        // Layer 3 is the dark road fill (painted in drawNeonGraphics below the road)

        // Layer 4: Bottom parallax rocks
        // Maintain 3 repeating patterns for an infinite sequence loop
        this.rockPatternWidth = Math.max(2000, W);
        this.rockPatterns = [];
        const rockColors = [0x0a3b80, 0x13509d, 0x0a2b63, 0x1a66c4]; // Slightly brighter blue shades

        // Pre-build exactly 3 rock patterns once. No runtime generation.
        for (let i = 0; i < this.rockPatternCount; i++) {
            let rocksInPattern: { x: number, h: number, w: number, baseColor: number, polys: { colorOffset: number, points: { nx: number, ny: number }[] }[] }[] = [];
            let rx = 0;
            while (rx < this.rockPatternWidth) {
                const rw = 220 + Math.random() * 180;
                const rh = 0.12 + Math.random() * 0.18;

                const polys = [];
                // Generate faceted trapezoidal rocks
                const bL = { nx: 0, ny: 0 };
                const bR = { nx: 1, ny: 0 };
                const tL = { nx: 0.2 + Math.random() * 0.15, ny: 0.8 + Math.random() * 0.2 };
                const tR = { nx: 0.65 + Math.random() * 0.15, ny: 0.8 + Math.random() * 0.2 };

                const v1 = { nx: 0.3 + Math.random() * 0.1, ny: 0.4 + Math.random() * 0.2 };
                const v2 = { nx: 0.6 + Math.random() * 0.1, ny: 0.3 + Math.random() * 0.2 };
                const bottomCenter = { nx: 0.45 + Math.random() * 0.1, ny: 0 };

                // Left facet (brightest)
                polys.push({ colorOffset: 1.3, points: [bL, bottomCenter, v1, tL] });
                // Top-mid facet
                polys.push({ colorOffset: 1.15, points: [tL, v1, v2, tR] });
                // Mid-bottom facet
                polys.push({ colorOffset: 0.95, points: [v1, bottomCenter, v2] });
                // Right facet (shadow)
                polys.push({ colorOffset: 0.65, points: [bottomCenter, bR, tR, v2] });

                rocksInPattern.push({
                    x: rx,
                    h: rh,
                    w: rw,
                    baseColor: Phaser.Math.RND.pick(rockColors),
                    polys: polys
                });
                rx += 170 + Math.random() * 110;
            }
            this.rockPatterns.push({ xOffset: i * this.rockPatternWidth, rocks: rocksInPattern });
        }

        // Neon Graphics layer
        this.graphics = this.add.graphics();
        this.graphics.setDepth(10); // draw above everything
        uiCamera.ignore(this.graphics); // UI camera shouldn't draw gameplay lines
        uiCamera.ignore(this.bgGraphics);

        // Particles
        this.sparksEmitter = this.add.particles(0, 0, 'dummy', {
            speed: { min: 50, max: 200 },
            angle: { min: -180, max: 0 },
            scale: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: 300,
            tint: [0xffffff, 0x00ffff, 0xff00ff],
            emitting: false
        });

        // Generate a simple white square texture for particles if it doesn't exist
        if (!this.textures.exists('spark')) {
            const g = this.make.graphics({});
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 4, 4);
            g.generateTexture('spark', 4, 4);
        }
        this.sparksEmitter.setTexture('spark');
        this.sparksEmitter.setDepth(15);

        this.trailEmitter = this.add.particles(0, 0, 'spark', {
            speed: { min: 60, max: 180 },
            angle: { min: 145, max: 215 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 0.75, end: 0 },
            blendMode: 'ADD',
            lifespan: { min: 200, max: 440 },
            frequency: 14,
            quantity: 2,
            tint: [0x00f6ff, 0x5de8ff, 0xffffff, 0xff4ef8, 0x8844ff]
        });
        this.trailEmitter.setDepth(10.8);
        this.trailEmitter.stop();

        // Glow trail — büyük, yumuşak, arkada kalır
        this.glowTrailEmitter = this.add.particles(0, 0, 'spark', {
            speed: { min: 15, max: 55 },
            angle: { min: 155, max: 205 },
            scale: { start: 2.8, end: 0 },
            alpha: { start: 0.18, end: 0 },
            blendMode: 'ADD',
            lifespan: { min: 350, max: 700 },
            frequency: 20,
            quantity: 1,
            tint: [0x00cfff, 0xaa00ff, 0xff00cc]
        });
        this.glowTrailEmitter.setDepth(10.5);
        this.glowTrailEmitter.stop();

        // Acceleration burst — gaz verince patlama efekti
        this.accelBurstEmitter = this.add.particles(0, 0, 'spark', {
            speed: { min: 120, max: 320 },
            angle: { min: 130, max: 230 },
            scale: { start: 1.2, end: 0 },
            alpha: { start: 0.9, end: 0 },
            blendMode: 'ADD',
            lifespan: { min: 120, max: 260 },
            tint: [0xffffff, 0x00f6ff, 0xff88ff],
            emitting: false
        });
        this.accelBurstEmitter.setDepth(11);

        // Wheel sparks — zeminde hızlı giderken arka tekelden çıkan kıvılcım
        this.wheelSparksEmitter = this.add.particles(0, 0, 'spark', {
            speed: { min: 40, max: 140 },
            angle: { min: 155, max: 205 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: { min: 80, max: 180 },
            tint: [0xffffff, 0xffee44, 0xff8800, 0x00ffff],
            emitting: false
        });
        this.wheelSparksEmitter.setDepth(12);

        // Speed lines — ekran uzayında yatay çizgiler
        this.speedLinesGfx = this.add.graphics();
        this.speedLinesGfx.setScrollFactor(0);
        this.speedLinesGfx.setDepth(12);

        // Setup simple input
        this.input.on('pointerdown', () => {
            this.audio.unlockFromUserGesture();
            this.isAccelerating = true;
        });
        this.input.on('pointerup', () => this.isAccelerating = false);

        // Explicitly capture Spacebar to prevent it from scrolling the browser and breaking the RAF loop
        this.input.keyboard!.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        this.createPlayer();
        uiCamera.ignore(this.player);

        // Motorcycle sprite (replaces procedural neon drawing)
        this.motorcycleSprite = this.add.image(200, 465, 'motorcycle');
        this.motorcycleSprite.setDepth(11);
        this.motorcycleSprite.setScale(0.36);
        uiCamera.ignore(this.motorcycleSprite);
        this.installTextStateHook();
        this.audio.startMusic("game");
        this.audio.stopEngine();

        // Initial terrain setup
        this.generateTerrain(2000, true);

        // Başlangıçta zemine oturt ve stick modunu aktif et.
        const initialSurface = this.getTerrainSurfaceAt(this.kinX);
        if (initialSurface) {
            this.kinY = initialSurface.y - this.wheelBottomFromCOM;
            this.kinAngle = initialSurface.angle;
            this.kinOnGround = true;
            this.snapBodyToKinematic(this.player.body as any);
        } else {
            this.kinOnGround = false;
        }

        // UI
        const cx = this.scale.width / 2;
        this.scoreText = this.add.text(cx, 40, '0', {
            fontSize: '48px',
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

        // Tell the main zoomed camera to ignore UI text elements so they don't get scaled down
        this.cameras.main.ignore([this.scoreText]);
        // Tell the UI camera to ignore the sparks
        uiCamera.ignore(this.sparksEmitter);
        uiCamera.ignore(this.trailEmitter);
        uiCamera.ignore(this.glowTrailEmitter);
        uiCamera.ignore(this.accelBurstEmitter);
        uiCamera.ignore(this.wheelSparksEmitter);
        uiCamera.ignore(this.speedLinesGfx);
        this.events.on(Phaser.Scenes.Events.PAUSE, this.onScenePause, this);
        this.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onSceneShutdown, this);

        // Gem toplama ve crash detection artık update() içinde kinematic olarak yapılıyor.
    }

    private onScenePause() {
        this.audio.stopEngine();
        if (this.trailEmitter) this.trailEmitter.stop();
        if (this.glowTrailEmitter) this.glowTrailEmitter.stop();
    }

    private onSceneResume() {
        this.audio.unlockFromUserGesture();
    }

    private onSceneShutdown() {
        this.audio.stopEngine();
        if (this.trailEmitter) this.trailEmitter.stop();
        if (this.glowTrailEmitter) this.glowTrailEmitter.stop();
        if (this.wheelSparksEmitter) this.wheelSparksEmitter.stop();
        if (this.speedLinesGfx) this.speedLinesGfx.clear();
        this.events.off(Phaser.Scenes.Events.PAUSE, this.onScenePause, this);
        this.events.off(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
    }

    private updateTrailEmitter() {
        if (!this.trailEmitter) return;

        const speed = Math.hypot(this.kinVelX, this.kinVelY);
        const speedRatio = Phaser.Math.Clamp(speed / this.maxGroundSpeed, 0, 1.45);
        const airborne = !this.kinOnGround;

        // Arka tekerden biraz uzakta doğsun
        const backOffset = 52;
        const tx = this.kinX - Math.cos(this.kinAngle) * backOffset;
        const ty = this.kinY - Math.sin(this.kinAngle) * backOffset + 12;
        const direction = Phaser.Math.RadToDeg(this.kinAngle + Math.PI);

        // Ana trail — hıza göre renk kayması: yavaşta cyan, hızda pembe/beyaz
        const trailTints = speedRatio > 0.7
            ? [0xffffff, 0xff88ff, 0xffffff, 0x00f6ff, 0xff44cc]
            : [0x00f6ff, 0x5de8ff, 0xffffff, 0xff4ef8, 0x8844ff];
        this.trailEmitter.setPosition(tx, ty);
        this.trailEmitter.setAngle({ min: direction - 30, max: direction + 30 });
        this.trailEmitter.setParticleSpeed(80 + speedRatio * 180);
        this.trailEmitter.setParticleLifespan(180 + speedRatio * 320);
        this.trailEmitter.setFrequency(this.isAccelerating ? Math.max(4, 14 - speedRatio * 10) : 22);
        this.trailEmitter.setQuantity(this.isAccelerating ? Math.round(2 + speedRatio * 3) : 1);
        this.trailEmitter.setAlpha(0.55 + speedRatio * 0.30);
        this.trailEmitter.setScale(0.4 + speedRatio * 0.45);
        (this.trailEmitter as any).tints = trailTints;

        // Glow trail — büyük yumuşak hale etkisi
        if (this.glowTrailEmitter) {
            this.glowTrailEmitter.setPosition(tx, ty);
            this.glowTrailEmitter.setAngle({ min: direction - 20, max: direction + 20 });
            this.glowTrailEmitter.setFrequency(this.isAccelerating ? 10 : 25);
            this.glowTrailEmitter.setScale(2.0 + speedRatio * 2.5);
            this.glowTrailEmitter.setAlpha(0.10 + speedRatio * 0.14);
        }

        // Wheel sparks — zeminde yüksek hızda arka tekelden kıvılcım
        if (this.wheelSparksEmitter && this.kinOnGround && speedRatio > 0.45 && this.isAccelerating) {
            const sparkChance = (speedRatio - 0.45) / 0.55;
            if (Math.random() < sparkChance * 0.55) {
                const cosA = Math.cos(this.kinAngle);
                const sinA = Math.sin(this.kinAngle);
                const bwx = this.kinX - cosA * 36;
                const bwy = this.kinY - sinA * 36 + 20;
                this.wheelSparksEmitter.emitParticle(Math.ceil(sparkChance * 3), bwx, bwy);
            }
        }

        // Acceleration burst — gaz yeni basıldığında parçacık patlaması + zoom pulse
        const justAccelerated = this.isAccelerating && !this.prevAccelerating;
        if (justAccelerated && speed > 3) {
            if (this.accelBurstEmitter) this.accelBurstEmitter.explode(22, tx, ty);
            this.cameraZoomPulse = 0.065;
        }
        this.prevAccelerating = this.isAccelerating;

        const shouldEmit = !this.isGameOver && speed > 2.4;
        if (shouldEmit && !this.trailEmitter.emitting) {
            this.trailEmitter.start();
            if (this.glowTrailEmitter) this.glowTrailEmitter.start();
        } else if (!shouldEmit && this.trailEmitter.emitting) {
            this.trailEmitter.stop();
            if (this.glowTrailEmitter) this.glowTrailEmitter.stop();
        }
    }

    installTextStateHook() {
        (window as any).render_game_to_text = () => {
            const b = this.player?.body as any;
            const px = this.player ? this.player.x : 0;
            const py = this.player ? this.player.y : 0;
            const vx = this.kinOnGround ? this.kinVelX : (b ? b.velocity.x : 0);
            const vy = this.kinOnGround ? this.kinVelY : (b ? b.velocity.y : 0);
            const av = this.kinOnGround ? this.kinAngularVel : (b ? b.angularVelocity : 0);

            const nearbyTerrain = this.terrainGroup
                .filter(t => t.isLine && t.p1 && t.p2 && t.p2.x >= px - 400 && t.p1.x <= px + 800)
                .slice(0, 12)
                .map(t => ({
                    x1: Math.round(t.p1.x),
                    y1: Math.round(t.p1.y),
                    x2: Math.round(t.p2.x),
                    y2: Math.round(t.p2.y)
                }));

            const nearbyGems = this.gemGroup
                .filter(g => !g.isCollected && Math.abs(g.position.x - px) < 900)
                .slice(0, 10)
                .map(g => ({
                    x: Math.round(g.position.x),
                    y: Math.round(g.position.y)
                }));

            return JSON.stringify({
                mode: this.isGameOver ? "game_over" : "gameplay",
                coords: "origin top-left, +x right, +y down",
                player: {
                    x: Math.round(px),
                    y: Math.round(py),
                    vx: Number(vx.toFixed(3)),
                    vy: Number(vy.toFixed(3)),
                    angle: Number(this.kinAngle.toFixed(3)),
                    av: Number(av.toFixed(3)),
                    grounded: this.isGrounded,
                    accelerating: this.isAccelerating
                },
                score: {
                    flips: this.flipCount,
                    gems: this.collectedGems
                },
                nearbyTerrain,
                nearbyGems
            });
        };
    }

    createPlayer() {
        const startX = 200;
        // Spawn exactly on top of the initial flat terrain (Y=500, thickness=10)
        // Wheels go down by 15, radius is 15. So chassis Y needs to be around 465-470
        const startY = 465;

        const group = this.matter.world.nextGroup(true);

        const MatterLib = (Phaser.Physics.Matter as any).Matter;
        const bodies = MatterLib.Bodies;

        const chassisBody = bodies.rectangle(startX, startY, 70, 10, {
            label: 'chassis',
            isSensor: true,
            chamfer: { radius: 5 } // Rounded edges so it doesn't catch on terrain seams
        });

        const wheelRadius = 22;
        const backWheelBody = bodies.circle(startX - 35, startY + 15, wheelRadius, {
            label: 'wheel',
            friction: 1.25,
            frictionStatic: 2.1,
            restitution: 0
        });

        const frontWheelBody = bodies.circle(startX + 35, startY + 15, wheelRadius, {
            label: 'wheel',
            friction: 1.25,
            frictionStatic: 2.1,
            restitution: 0
        });

        const compoundBody = MatterLib.Body.create({
            parts: [chassisBody, backWheelBody, frontWheelBody],
            mass: 2,
            frictionAir: 0,
            collisionFilter: { group: group },
            restitution: 0,
            plugin: { matterWrap: undefined }
        });
        (compoundBody as any).slop = 0.01;
        (compoundBody as any).ignoreGravity = true;

        this.player = this.matter.add.gameObject(this.add.rectangle(startX, startY, 2, 2, 0x000000, 0), compoundBody);

        // Kinematic başlangıç konumunu compound body CoM'una göre ayarla
        // Tekerlek alt noktası = startY + 15 (wheel center) + 22 (radius) = startY + 37
        const wheelBottomY = startY + 37;
        this.wheelBottomFromCOM = wheelBottomY - compoundBody.position.y;
        this.kinX = startX;
        this.kinY = compoundBody.position.y;
    }

    generateTerrain(distanceToGenerate: number, isInitial: boolean = false) {

        let startX = this.lastTerrainPoint.x;
        let endX = startX + distanceToGenerate;

        if (isInitial) {
            // Create a reliable flat start area
            let p1 = { ...this.lastTerrainPoint };
            let p2 = { x: p1.x + 700, y: p1.y };

            this.createStaticLine(p1, p2);

            this.lastTerrainPoint = p2;
            startX = this.lastTerrainPoint.x;
        }

        let safetyIterations = 0;
        const maxIterations = 8; // hard cap to avoid long blocking generation loops
        while (this.lastTerrainPoint.x < endX && safetyIterations < maxIterations) {
            safetyIterations++;

            let p1 = { ...this.lastTerrainPoint };
            let splinesData: { points: Phaser.Math.Vector2[], multiplier: number, bypassSlopeClamp?: boolean }[] = [];

            if (this.parkourState === 'FLAT') {
                // Generate a short flat road section
                splinesData.push({
                    points: [
                        new Phaser.Math.Vector2(p1.x, p1.y),
                        new Phaser.Math.Vector2(p1.x + 800, p1.y) // short length to keep action frequent
                    ], multiplier: 0.5
                });
                this.parkourState = 'OBSTACLE';
            } else {
                // Shuffle-bag selection: every parkour type appears before any repeats
                const parkourType = this.drawNextParkour();

                if (parkourType === 1) {
                    // Parkour 1: Flight Jump Ramp
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + 400, p1.y), // flat approach

                            // Exponential rise (quarter circle-ish) - Spread out horizontally for easier climb
                            new Phaser.Math.Vector2(p1.x + 800, p1.y - 15),
                            new Phaser.Math.Vector2(p1.x + 1150, p1.y - 60),
                            new Phaser.Math.Vector2(p1.x + 1450, p1.y - 150),
                            new Phaser.Math.Vector2(p1.x + 1720, p1.y - 280),
                            new Phaser.Math.Vector2(p1.x + 1960, p1.y - 450),
                            new Phaser.Math.Vector2(p1.x + 2150, p1.y - 600) // Steep vertical lip!

                            // NO descending connections, it's a pure cliff drop-off
                        ], multiplier: 3.0, bypassSlopeClamp: true // High resolution so the curve is very smooth and not clamped
                    });

                    // The landing zone (completely disconnected gap)
                    // Brought closer to the ramp to reduce the horizontal gap
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x + 2900, p1.y + 100), // starts closer now
                            new Phaser.Math.Vector2(p1.x + 3900, p1.y) // slope back to baseline 0
                        ], multiplier: 1.0
                    });
                } else if (parkourType === 3) {
                    // Parkour 3: Triangle Ramp (no base line)
                    // Two straight angled sides meeting at a peak. Motor launches off the top.
                    const triBaseW = 700;   // narrower base = steeper slopes on both sides
                    const triHeight = 750;   // how high the peak rises above road
                    // FIRST: draw a short flat approach so there's no gap before the triangle
                    this.createStaticLine({ x: p1.x, y: p1.y }, { x: p1.x + 400, y: p1.y });
                    const triStartX = p1.x + 400; // triangle base starts right here, no gap!

                    const peakX = triStartX + triBaseW;   // X of the peak
                    const peakY = p1.y - triHeight;       // Y of the peak

                    // Left incline: ground → peak (motor climbs this)
                    const leftSteps = 50;
                    for (let i = 0; i < leftSteps; i++) {
                        const t1 = i / leftSteps;
                        const t2 = (i + 1) / leftSteps;
                        this.createStaticLine(
                            { x: triStartX + t1 * triBaseW, y: p1.y + (peakY - p1.y) * t1 },
                            { x: triStartX + t2 * triBaseW, y: p1.y + (peakY - p1.y) * t2 }
                        );
                    }

                    // Right decline: peak → ground (disconnected landing)
                    const rightStartX = peakX + triBaseW;
                    const rightSteps = 50;
                    for (let i = 0; i < rightSteps; i++) {
                        const t1 = i / rightSteps;
                        const t2 = (i + 1) / rightSteps;
                        this.createStaticLine(
                            { x: peakX + t1 * triBaseW, y: peakY + (p1.y - peakY) * t1 },
                            { x: peakX + t2 * triBaseW, y: peakY + (p1.y - peakY) * t2 }
                        );
                    }

                    // Update lastTerrainPoint to the bottom of the right side
                    const triEndX = rightStartX;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(triEndX - 20, p1.y), new Phaser.Math.Vector2(triEndX, p1.y)]);
                    this.lastTerrainPoint = { x: triEndX, y: p1.y };
                    splinesData.length = 0;
                } else if (parkourType === 4) {
                    // Parkour 4: HALF-PIPE BOWL
                    // Road dips steeply into a deep valley (gaining speed), flat bottom, then launches upward.
                    // It's like a skateboard half-pipe — the momentum from the descent throws you into the air!
                    const bowlDepth = 450;  // How deep the bowl goes below road
                    const bowlWidth = 1000; // Horizontal width of each curved side
                    const flatBottom = 300;  // Flat section at the bottom
                    const kickerExtra = 220; // The launch kicker overshoots the road level by this much
                    const stepPx = 12;       // Density of points for smooth curves

                    let bX = p1.x;

                    // Short flat approach
                    this.createStaticLine({ x: bX, y: p1.y }, { x: bX + 400, y: p1.y });
                    bX += 400;

                    // === Descent: smooth half-sine dip from road level to bowl depth ===
                    const descentSteps = Math.ceil(bowlWidth / stepPx);
                    let prevPt = { x: bX, y: p1.y };
                    for (let i = 1; i <= descentSteps; i++) {
                        const t = i / descentSteps;
                        // sin² easing: starts and ends at slope=0 for smooth joins
                        const dip = Math.pow(Math.sin(t * Math.PI / 2), 2) * bowlDepth;
                        const nextPt = { x: bX + t * bowlWidth, y: p1.y + dip };
                        this.createStaticLine(prevPt, nextPt);
                        prevPt = nextPt;
                    }
                    bX += bowlWidth;

                    // === Flat bottom ===
                    this.createStaticLine({ x: bX, y: p1.y + bowlDepth }, { x: bX + flatBottom, y: p1.y + bowlDepth });
                    bX += flatBottom;

                    // === Ascent: (1-cos(t*π/2)) ramp — smooth start from flat, gets steeper, SHARP steep launch at top ===
                    const ascentWidth = bowlWidth + 300;
                    const ascentSteps = Math.ceil(ascentWidth / stepPx);
                    prevPt = { x: bX, y: p1.y + bowlDepth };
                    const totalRise = bowlDepth + kickerExtra;
                    for (let i = 1; i <= ascentSteps; i++) {
                        const t = i / ascentSteps;
                        // (1-cos): slope=0 at bottom (smooth join from flat), slope=MAX at top (steep launch)
                        const rise = (1 - Math.cos(t * Math.PI / 2)) * totalRise;
                        const nextPt = { x: bX + t * ascentWidth, y: p1.y + bowlDepth - rise };
                        this.createStaticLine(prevPt, nextPt);
                        prevPt = nextPt;
                    }
                    bX += ascentWidth; // ends above road level at max slope = launch!

                    // === Disconnected landing pad (far, at road level) ===
                    const landPadStart = bX + 500; // reduced air gap
                    this.createStaticLine({ x: landPadStart, y: p1.y + 80 }, { x: landPadStart + 1200, y: p1.y });

                    const bowlEndX = landPadStart + 1200;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(bowlEndX - 20, p1.y), new Phaser.Math.Vector2(bowlEndX, p1.y)]);
                    this.lastTerrainPoint = { x: bowlEndX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 6) {
                    // Parkour 6: DOUBLE CAMEL BACK
                    // Two large humps side by side, each with a gap between them. Fast pace required.
                    const sp6 = 12;
                    const humpW = 900, humpH = 320, gapW = 200;
                    let hX = p1.x;

                    this.createStaticLine({ x: hX, y: p1.y }, { x: hX + 300, y: p1.y });
                    hX += 300;

                    const drawCamelHump = (startX: number) => {
                        const steps = Math.ceil(humpW / sp6);
                        let prev = { x: startX, y: p1.y };
                        for (let i = 1; i <= steps; i++) {
                            const t = i / steps;
                            const raw = Math.sin(t * Math.PI);
                            const y = p1.y - raw * raw * humpH; // sin²: smooth base join, no bumps
                            const next = { x: startX + t * humpW, y };
                            this.createStaticLine(prev, next);
                            prev = next;
                        }
                        return startX + humpW;
                    };

                    hX = drawCamelHump(hX);
                    this.createStaticLine({ x: hX, y: p1.y }, { x: hX + gapW, y: p1.y });
                    hX += gapW;
                    hX = drawCamelHump(hX);

                    this.createStaticLine({ x: hX, y: p1.y }, { x: hX + 400, y: p1.y });
                    hX += 400;

                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(hX - 20, p1.y), new Phaser.Math.Vector2(hX, p1.y)]);
                    this.lastTerrainPoint = { x: hX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 7) {
                    // Parkour 7: SPEED CLIFF
                    // Long gradual uphill ramp → sudden cliff drop for massive hangtime.
                    const sp7 = 12;
                    const rampW = 2800, rampH = 380; // very long gentle slope
                    let cX = p1.x;

                    // flat approach
                    this.createStaticLine({ x: cX, y: p1.y }, { x: cX + 400, y: p1.y });
                    cX += 400;

                    // Gentle uphill: linear slope
                    const rSteps = Math.ceil(rampW / sp7);
                    let prevC = { x: cX, y: p1.y };
                    for (let i = 1; i <= rSteps; i++) {
                        const t = i / rSteps;
                        const nextC = { x: cX + t * rampW, y: p1.y - t * rampH };
                        this.createStaticLine(prevC, nextC);
                        prevC = nextC;
                    }
                    cX += rampW;
                    // ---- CLIFF: terrain just ENDS here, no descent drawn ----

                    // Landing pad far below and ahead
                    const cliffLandX = cX + 700;
                    this.createStaticLine({ x: cliffLandX, y: p1.y + 100 }, { x: cliffLandX + 1400, y: p1.y });
                    const cliffEndX = cliffLandX + 1400;

                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(cliffEndX - 20, p1.y), new Phaser.Math.Vector2(cliffEndX, p1.y)]);
                    this.lastTerrainPoint = { x: cliffEndX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 8) {
                    // Parkour 8: S-WAVE VALLEY
                    // Road dips into a smooth valley then rises back up — one full sine wave.
                    const sp8 = 12;
                    const waveW = 3000, waveDepth = 280;
                    let wX = p1.x;

                    this.createStaticLine({ x: wX, y: p1.y }, { x: wX + 300, y: p1.y });
                    wX += 300;

                    const wSteps = Math.ceil(waveW / sp8);
                    let prevW = { x: wX, y: p1.y };
                    for (let i = 1; i <= wSteps; i++) {
                        const t = i / wSteps;
                        // sin²(t*π): slope=0 at t=0 and t=1, seamlessly joins flat road with no bumps
                        const raw = Math.sin(t * Math.PI);
                        const y = p1.y + raw * raw * waveDepth;
                        const nextW = { x: wX + t * waveW, y };
                        this.createStaticLine(prevW, nextW);
                        prevW = nextW;
                    }
                    wX += waveW;

                    this.createStaticLine({ x: wX, y: p1.y }, { x: wX + 300, y: p1.y });
                    wX += 300;

                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(wX - 20, p1.y), new Phaser.Math.Vector2(wX, p1.y)]);
                    this.lastTerrainPoint = { x: wX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 9) {
                    // Parkour 9: SERPENTINE WAVE
                    // 5 large arcs alternating up and down: ↑↓↑↓↑
                    // Each arc connects seamlessly to the next — no flat gaps, pure sine wave feel.
                    const sp9 = 10;
                    const arcW = 900;   // width of each arc
                    const arcH = 310;   // height of each arc (both up and down)
                    const dirs = [1, -1, 1, -1, 1]; // +1 = arc above road, -1 = arc below road
                    let chX = p1.x;

                    // short flat approach
                    this.createStaticLine({ x: chX, y: p1.y }, { x: chX + 300, y: p1.y });
                    chX += 300;

                    for (const dir of dirs) {
                        const steps = Math.ceil(arcW / sp9);
                        let prev = { x: chX, y: p1.y };
                        for (let i = 1; i <= steps; i++) {
                            const t = i / steps;
                            // sin(t*π): goes 0 → peak → 0 smoothly, direction flips the arc
                            const y = p1.y - dir * Math.sin(t * Math.PI) * arcH;
                            const next = { x: chX + t * arcW, y };
                            this.createStaticLine(prev, next);
                            prev = next;
                        }
                        chX += arcW;
                        // NO flat gap — next arc starts right here at road level
                    }

                    this.createStaticLine({ x: chX, y: p1.y }, { x: chX + 400, y: p1.y });
                    chX += 400;

                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(chX - 20, p1.y), new Phaser.Math.Vector2(chX, p1.y)]);
                    this.lastTerrainPoint = { x: chX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 10) {
                    // Parkour 10: MEGA DOME
                    // One enormous smooth parabolic hill, much larger than the mountain parkour.
                    const sp10 = 10;
                    const megaW = 3000, megaH = 700;
                    let mX10 = p1.x;
                    this.createStaticLine({ x: mX10, y: p1.y }, { x: mX10 + 400, y: p1.y });
                    mX10 += 400;
                    const ms = Math.ceil(megaW / sp10);
                    let prevM = { x: mX10, y: p1.y };
                    for (let i = 1; i <= ms; i++) {
                        const t = i / ms;
                        const raw = Math.sin(t * Math.PI);
                        const y = p1.y - raw * raw * megaH;
                        const nx = { x: mX10 + t * megaW, y };
                        this.createStaticLine(prevM, nx); prevM = nx;
                    }
                    mX10 += megaW;
                    this.createStaticLine({ x: mX10, y: p1.y }, { x: mX10 + 400, y: p1.y });
                    mX10 += 400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(mX10 - 20, p1.y), new Phaser.Math.Vector2(mX10, p1.y)]);
                    this.lastTerrainPoint = { x: mX10, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 12) {
                    // Parkour 12: TWIN PEAKS
                    // Two tall sharp triangles side by side. Launch off each, land in between.
                    const sp12 = 12, pkW = 600, pkH = 600, midGap = 250;
                    let tX = p1.x;
                    this.createStaticLine({ x: tX, y: p1.y }, { x: tX + 400, y: p1.y }); tX += 400;
                    const drawPeak = (sx: number) => {
                        const half = pkW / 2;
                        const peakY = p1.y - pkH;
                        const stL = Math.ceil(half / sp12);
                        let pr = { x: sx, y: p1.y };
                        for (let i = 1; i <= stL; i++) { const t = i / stL; const n = { x: sx + t * half, y: p1.y + (peakY - p1.y) * t }; this.createStaticLine(pr, n); pr = n; }
                        for (let i = 1; i <= stL; i++) { const t = i / stL; const n = { x: sx + half + t * half, y: peakY + (p1.y - peakY) * t }; this.createStaticLine(pr, n); pr = n; }
                        return sx + pkW;
                    };
                    tX = drawPeak(tX);
                    this.createStaticLine({ x: tX, y: p1.y }, { x: tX + midGap, y: p1.y }); tX += midGap;
                    tX = drawPeak(tX);
                    this.createStaticLine({ x: tX, y: p1.y }, { x: tX + 400, y: p1.y }); tX += 400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(tX - 20, p1.y), new Phaser.Math.Vector2(tX, p1.y)]);
                    this.lastTerrainPoint = { x: tX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 13) {
                    // Parkour 13: SKI JUMP
                    // Long flat descent → short sharp curved kicker → massive air
                    const sp13 = 10;
                    let jX = p1.x;
                    // Long downslope (1800px, -200px)
                    const dsW = 1800, dsH = 200;
                    const dsS = Math.ceil(dsW / sp13);
                    let prevJ = { x: jX, y: p1.y };
                    for (let i = 1; i <= dsS; i++) { const t = i / dsS; const n = { x: jX + t * dsW, y: p1.y + t * dsH }; this.createStaticLine(prevJ, n); prevJ = n; }
                    jX += dsW;
                    // Short curved kicker: 1-cos easing from bottom back up + overshoot
                    const kW = 600, kTotal = dsH + 280;
                    const kS = Math.ceil(kW / sp13);
                    prevJ = { x: jX, y: p1.y + dsH };
                    for (let i = 1; i <= kS; i++) { const t = i / kS; const rise = (1 - Math.cos(t * Math.PI / 2)) * kTotal; const n = { x: jX + t * kW, y: p1.y + dsH - rise }; this.createStaticLine(prevJ, n); prevJ = n; }
                    jX += kW;
                    // Landing
                    const jLand = jX + 800;
                    this.createStaticLine({ x: jLand, y: p1.y + 60 }, { x: jLand + 1200, y: p1.y });
                    jX = jLand + 1200;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(jX - 20, p1.y), new Phaser.Math.Vector2(jX, p1.y)]);
                    this.lastTerrainPoint = { x: jX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 14) {
                    // Parkour 14: TABLETOP
                    // Steep climb to wide flat plateau, then steep drop off
                    const sp14 = 10;
                    const climbW = 500, tableH = 350, tableW = 1200, dropW = 400;
                    let tbX = p1.x;
                    this.createStaticLine({ x: tbX, y: p1.y }, { x: tbX + 300, y: p1.y }); tbX += 300;
                    // Climb (1-cos for smooth base)
                    const clS = Math.ceil(climbW / sp14);
                    let prevT = { x: tbX, y: p1.y };
                    for (let i = 1; i <= clS; i++) { const t = i / clS; const y = p1.y - (1 - Math.cos(t * Math.PI / 2)) * tableH; const n = { x: tbX + t * climbW, y }; this.createStaticLine(prevT, n); prevT = n; }
                    tbX += climbW;
                    // Flat top
                    this.createStaticLine({ x: tbX, y: p1.y - tableH }, { x: tbX + tableW, y: p1.y - tableH }); tbX += tableW;
                    // Drop-off (linear)
                    const drS = Math.ceil(dropW / sp14);
                    prevT = { x: tbX, y: p1.y - tableH };
                    for (let i = 1; i <= drS; i++) { const t = i / drS; const n = { x: tbX + t * dropW, y: p1.y - tableH + t * tableH }; this.createStaticLine(prevT, n); prevT = n; }
                    tbX += dropW;
                    this.createStaticLine({ x: tbX, y: p1.y }, { x: tbX + 400, y: p1.y }); tbX += 400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(tbX - 20, p1.y), new Phaser.Math.Vector2(tbX, p1.y)]);
                    this.lastTerrainPoint = { x: tbX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 15) {
                    // Parkour 15: DEEP CRATER
                    // Steep descent into a very deep bowl then steep climb out, no launch kicker.
                    const sp15 = 10;
                    const craterW = 900, craterDepth = 550;
                    let crX = p1.x;
                    this.createStaticLine({ x: crX, y: p1.y }, { x: crX + 400, y: p1.y }); crX += 400;
                    // Descent: linear steep drop
                    const crS = Math.ceil(craterW / sp15);
                    let prevCr = { x: crX, y: p1.y };
                    for (let i = 1; i <= crS; i++) { const t = i / crS; const n = { x: crX + t * craterW, y: p1.y + t * craterDepth }; this.createStaticLine(prevCr, n); prevCr = n; }
                    crX += craterW;
                    // Flat bottom
                    this.createStaticLine({ x: crX, y: p1.y + craterDepth }, { x: crX + 200, y: p1.y + craterDepth }); crX += 200;
                    // Ascent: linear steep climb
                    prevCr = { x: crX, y: p1.y + craterDepth };
                    for (let i = 1; i <= crS; i++) { const t = i / crS; const n = { x: crX + t * craterW, y: p1.y + craterDepth - t * craterDepth }; this.createStaticLine(prevCr, n); prevCr = n; }
                    crX += craterW;
                    this.createStaticLine({ x: crX, y: p1.y }, { x: crX + 400, y: p1.y }); crX += 400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(crX - 20, p1.y), new Phaser.Math.Vector2(crX, p1.y)]);
                    this.lastTerrainPoint = { x: crX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 16) {
                    // Parkour 16: OCEAN WAVES
                    // 4 continuous full-sine oscillations (up AND down), tighter and faster than serpentine.
                    const sp16 = 10;
                    const owW = 650, owH = 220;
                    const owDirs = [1, -1, 1, -1, 1, -1, 1];
                    let owX = p1.x;
                    this.createStaticLine({ x: owX, y: p1.y }, { x: owX + 300, y: p1.y }); owX += 300;
                    for (const dir of owDirs) {
                        const st = Math.ceil(owW / sp16);
                        let prev = { x: owX, y: p1.y };
                        for (let i = 1; i <= st; i++) { const t = i / st; const y = p1.y - dir * Math.sin(t * Math.PI) * owH; const n = { x: owX + t * owW, y }; this.createStaticLine(prev, n); prev = n; }
                        owX += owW;
                    }
                    this.createStaticLine({ x: owX, y: p1.y }, { x: owX + 300, y: p1.y }); owX += 300;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(owX - 20, p1.y), new Phaser.Math.Vector2(owX, p1.y)]);
                    this.lastTerrainPoint = { x: owX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 17) {
                    // Parkour 17: VOLCANO CLIFF
                    // Very tall steep mountain peak — climb the volcano, launch off the crater edge.
                    const sp17 = 10;
                    const volW = 1400, volH = 900;
                    let vX = p1.x;
                    this.createStaticLine({ x: vX, y: p1.y }, { x: vX + 400, y: p1.y }); vX += 400;
                    // Ascent: sin easing (smooth base, steep top)
                    const vS = Math.ceil(volW / sp17);
                    let prevV = { x: vX, y: p1.y };
                    for (let i = 1; i <= vS; i++) { const t = i / vS; const y = p1.y - Math.sin(t * Math.PI / 2) * volH; const n = { x: vX + t * volW, y }; this.createStaticLine(prevV, n); prevV = n; }
                    vX += volW;
                    // Short flat crater rim
                    this.createStaticLine({ x: vX, y: p1.y - volH }, { x: vX + 150, y: p1.y - volH }); vX += 150;
                    // Cliff — terrain ends here
                    const vLand = vX + 500;
                    this.createStaticLine({ x: vLand, y: p1.y + 100 }, { x: vLand + 1400, y: p1.y });
                    vX = vLand + 1400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(vX - 20, p1.y), new Phaser.Math.Vector2(vX, p1.y)]);
                    this.lastTerrainPoint = { x: vX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 18) {
                    // Parkour 18: SPEED DIP
                    // Very quick sharp V-dip: fast drop, instant flat, fast climb, speed boost effect.
                    const sp18 = 10;
                    const dipW = 400, dipH = 300;
                    let dX = p1.x;
                    this.createStaticLine({ x: dX, y: p1.y }, { x: dX + 600, y: p1.y }); dX += 600;
                    // Descent
                    const dS = Math.ceil(dipW / sp18);
                    let prevDp = { x: dX, y: p1.y };
                    for (let i = 1; i <= dS; i++) { const t = i / dS; const n = { x: dX + t * dipW, y: p1.y + t * dipH }; this.createStaticLine(prevDp, n); prevDp = n; }
                    dX += dipW;
                    this.createStaticLine({ x: dX, y: p1.y + dipH }, { x: dX + 150, y: p1.y + dipH }); dX += 150;
                    // Ascent + overshoot for air
                    prevDp = { x: dX, y: p1.y + dipH };
                    const asW = 500, asTotal = dipH + 200;
                    const asS = Math.ceil(asW / sp18);
                    for (let i = 1; i <= asS; i++) { const t = i / asS; const rise = (1 - Math.cos(t * Math.PI / 2)) * asTotal; const n = { x: dX + t * asW, y: p1.y + dipH - rise }; this.createStaticLine(prevDp, n); prevDp = n; }
                    dX += asW;
                    const dLand = dX + 450;
                    this.createStaticLine({ x: dLand, y: p1.y + 50 }, { x: dLand + 1000, y: p1.y });
                    dX = dLand + 1000;
                    this.createStaticLine({ x: dX, y: p1.y }, { x: dX + 300, y: p1.y }); dX += 300;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(dX - 20, p1.y), new Phaser.Math.Vector2(dX, p1.y)]);
                    this.lastTerrainPoint = { x: dX, y: p1.y };
                    splinesData.length = 0;

                } else if (parkourType === 19) {
                    // Parkour 19: TRIPLE VALLEY
                    // 3 consecutive smooth V-shaped valleys, dip-recover-dip-recover-dip
                    const sp19 = 10;
                    const valW = 700, valDepth = 280;
                    let vvX = p1.x;
                    this.createStaticLine({ x: vvX, y: p1.y }, { x: vvX + 300, y: p1.y }); vvX += 300;
                    for (let v = 0; v < 3; v++) {
                        const st = Math.ceil(valW / sp19);
                        let prev = { x: vvX, y: p1.y };
                        for (let i = 1; i <= st; i++) { const t = i / st; const raw = Math.sin(t * Math.PI); const y = p1.y + raw * raw * valDepth; const n = { x: vvX + t * valW, y }; this.createStaticLine(prev, n); prev = n; }
                        vvX += valW;
                        if (v < 2) { this.createStaticLine({ x: vvX, y: p1.y }, { x: vvX + 200, y: p1.y }); vvX += 200; }
                    }
                    this.createStaticLine({ x: vvX, y: p1.y }, { x: vvX + 400, y: p1.y }); vvX += 400;
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(vvX - 20, p1.y), new Phaser.Math.Vector2(vvX, p1.y)]);
                    this.lastTerrainPoint = { x: vvX, y: p1.y };
                    splinesData.length = 0;

                } else {
                    // Parkour 2: 3 Smooth Mountains (Small, Medium, Large)
                    // Directly generate dense terrain points using sine curves.
                    // Each segment is ~15px wide so curves look perfectly smooth.
                    const stepSize = 15; // pixels per segment

                    // Helper: draw one smooth bell (sine-half-arc) directly into terrain.
                    // Connects flat ground -> peak -> flat ground with smooth sine easing.
                    const drawHill = (startX: number, width: number, height: number) => {
                        const steps = Math.ceil(width / stepSize);
                        let prevPt = { x: startX, y: p1.y };
                        for (let i = 1; i <= steps; i++) {
                            const t = i / steps; // 0 to 1
                            // sin² curve: slope is ZERO at both endpoints, so merges smoothly with flat road
                            // sin(t*π)   → slope = π at t=0, harsh join
                            // sin²(t*π)  → slope = 0 at t=0 and t=1, perfectly smooth
                            const raw = Math.sin(t * Math.PI);
                            const sineY = raw * raw; // sin²
                            const nextPt = {
                                x: startX + t * width,
                                y: p1.y - sineY * height
                            };
                            this.createStaticLine(prevPt, nextPt);
                            prevPt = nextPt;
                        }
                        // Return end X for chaining
                        return startX + width;
                    };

                    const drawFlat = (startX: number, width: number) => {
                        const endX = startX + width;
                        this.createStaticLine({ x: startX, y: p1.y }, { x: endX, y: p1.y });
                        return endX;
                    };

                    // Track the current X across all mountains so we can set lastTerrainPoint correctly
                    let mX = p1.x;
                    mX = drawFlat(mX, 400);                   // flat approach
                    mX = drawHill(mX, 700, 250);              // Small Mountain  (H=250, W=700)
                    mX = drawFlat(mX, 250);                   // gap
                    mX = drawHill(mX, 1050, 480);             // Medium Mountain (H=480, W=1050)
                    mX = drawFlat(mX, 350);                   // gap
                    mX = drawHill(mX, 1600, 780);             // Large Mountain  (H=780, W=1600)
                    mX = drawFlat(mX, 600);                   // flat exit

                    // We did NOT use splinesData for this parkour — update lastTerrainPoint directly
                    this.updateLastChunkEndSlope([new Phaser.Math.Vector2(mX - 20, p1.y), new Phaser.Math.Vector2(mX, p1.y)]);
                    this.lastTerrainPoint = { x: mX, y: p1.y };

                    // Skip the normal splinesData -> createStaticLine pass for this chunk
                    splinesData.length = 0;
                }

                this.parkourState = 'FLAT';
            }

            // Generate physics for all splines in this chunk
            let finalPoint = { ...p1 };
            let usedSplines = false;
            splinesData.forEach(splineDef => {
                let processedPoints = splineDef.points.map(pt => new Phaser.Math.Vector2(pt.x, pt.y));
                processedPoints = this.applyChunkEntryContinuity(processedPoints);
                if (!splineDef.bypassSlopeClamp) {
                    processedPoints = this.enforceDriveableControlPoints(processedPoints);
                }
                this.updateLastChunkEndSlope(processedPoints);

                const curve = new Phaser.Curves.Spline(processedPoints);
                const resolution = Math.floor(18 * splineDef.multiplier); // fewer segments = fewer seams = less wheel bounce
                let previousPoint = curve.getPoint(0);

                for (let i = 1; i <= resolution; i++) {
                    const t = i / resolution;
                    const currentPoint = curve.getPoint(t);
                    this.createStaticLine(previousPoint, currentPoint);
                    previousPoint = currentPoint;
                }
                finalPoint = previousPoint;
                usedSplines = true;

                // Spawn Gems
                const spawnRoll = Phaser.Math.Between(1, 100);

                if (spawnRoll <= 35) {
                    // 35% chance: Gems
                    const MatterLib = (Phaser.Physics.Matter as any).Matter;
                    const clusterSize = Phaser.Math.Between(3, 4);
                    const gemHeight = 32;

                    const tStart = 0.3 + Math.random() * 0.2;
                    const tEnd = tStart + 0.25;

                    for (let g = 0; g < clusterSize; g++) {
                        const t = tStart + (g / (clusterSize - 1)) * (tEnd - tStart);
                        const pt = curve.getPoint(Math.min(t, 0.95));
                        const gem = MatterLib.Bodies.rectangle(
                            pt.x,
                            pt.y - gemHeight,
                            18, 18,
                            { isStatic: true, isSensor: true, label: 'gem' }
                        );
                        this.gemGroup.push(gem);
                        this.matter.world.add(gem);
                    }
                }

            });

            // "First climb, then descend": climbing accumulates descent budget, descending consumes it.
            const chunkDeltaY = finalPoint.y - p1.y;
            if (chunkDeltaY < 0) {
                this.descentAllowance = Math.min(this.descentAllowance + (-chunkDeltaY), 1200);
            } else if (chunkDeltaY > 0) {
                this.descentAllowance = Math.max(0, this.descentAllowance - chunkDeltaY);
            }

            if (usedSplines) {
                finalPoint.y = Phaser.Math.Clamp(finalPoint.y, this.terrainMinY, this.terrainMaxY);
                this.lastTerrainPoint = finalPoint;
            }
        }
    }

    // Shuffle-bag for fair, non-repeating parkour selection.
    // Fills bag with all 9 parkour IDs, Fisher-Yates shuffles, pops one at a time.
    private drawNextParkour(): number {
        if (this.parkourBag.length === 0) {
            // Refill with all parkour IDs
            const ids = [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19];
            // Fisher-Yates shuffle
            for (let i = ids.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ids[i], ids[j]] = [ids[j], ids[i]];
            }
            this.parkourBag = ids;
        }
        return this.parkourBag.pop()!;
    }

    // Creates an overlapping beveled terrain segment for smoother wheel contact between seams.
    createStaticLine(p1: { x: number, y: number }, p2: { x: number, y: number }) {
        const thickness = 80;
        const overlap = 28;
        const MatterLib = (Phaser.Physics.Matter as any).Matter;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx);

        // Downward normal for the segment so we can push the rectangle center below the road surface.
        const nx = -dy / length;
        const ny = dx / length;

        const midX = (p1.x + p2.x) / 2 + nx * (thickness / 2);
        const midY = (p1.y + p2.y) / 2 + ny * (thickness / 2);

        const body = MatterLib.Bodies.rectangle(midX, midY, length + overlap, thickness, {
            isStatic: true,
            friction: 1.0,
            frictionStatic: 1.35,
            restitution: 0,
            chamfer: { radius: 32 },
            label: 'ground'
        });
        MatterLib.Body.setAngle(body, angle);
        (body as any).slop = 0.04;

        this.matter.world.add(body);

        this.terrainGroup.push({ body, length, thickness, isLine: true, p1, p2 });
    }

    applyChunkEntryContinuity(points: Phaser.Math.Vector2[]) {
        if (points.length < 2) return points;

        const p0 = points[0];
        const p1 = points[1];
        const dx = Math.max(1, p1.x - p0.x);

        // Continue from previous chunk tangent, but keep it bounded to avoid extreme snap.
        const expectedDy = Phaser.Math.Clamp(this.lastChunkEndSlope * dx, -120, 120);
        const blendedY = p0.y + expectedDy * 0.65 + (p1.y - p0.y) * 0.35;
        points[1] = new Phaser.Math.Vector2(p1.x, blendedY);

        return points;
    }

    enforceDriveableControlPoints(points: Phaser.Math.Vector2[]) {
        if (points.length < 2) return points;

        const maxSlope = 0.55; // ~29 degrees

        // Clamp each control segment slope so transitions stay drivable.
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const cur = points[i];
            const dx = Math.max(1, cur.x - prev.x);
            const maxDy = dx * maxSlope;
            const dy = cur.y - prev.y;

            if (dy > maxDy) {
                points[i] = new Phaser.Math.Vector2(cur.x, prev.y + maxDy);
            } else if (dy < -maxDy) {
                points[i] = new Phaser.Math.Vector2(cur.x, prev.y - maxDy);
            }
        }

        // Light smoothing for abrupt direction flips.
        for (let i = 1; i < points.length - 1; i++) {
            const a = points[i - 1];
            const b = points[i];
            const c = points[i + 1];
            const s1 = (b.y - a.y) / Math.max(1, b.x - a.x);
            const s2 = (c.y - b.y) / Math.max(1, c.x - b.x);
            if (Math.sign(s1) !== Math.sign(s2) && Math.abs(s1 - s2) > 0.6) {
                points[i] = new Phaser.Math.Vector2(b.x, (a.y + b.y + c.y) / 3);
            }
        }

        // Keep points in world Y bounds.
        for (let i = 0; i < points.length; i++) {
            points[i] = new Phaser.Math.Vector2(points[i].x, Phaser.Math.Clamp(points[i].y, this.terrainMinY, this.terrainMaxY));
        }

        return points;
    }

    updateLastChunkEndSlope(points: Phaser.Math.Vector2[]) {
        if (points.length < 2) return;
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        const dx = Math.max(1, b.x - a.x);
        const slope = (b.y - a.y) / dx;
        this.lastChunkEndSlope = Phaser.Math.Clamp(slope, -0.7, 0.7);
    }

    // Belirli bir x koordinatındaki terrain yüzeyini ve açısını döndürür.
    // Boşluk (gap) varsa null döndürür.
    private getTerrainSurfaceAt(x: number): { y: number, angle: number } | null {
        let bestY: number | null = null;
        let bestAngle: number = 0;

        // Collect all matching segments for blending at overlaps
        const hits: { y: number, angle: number, weight: number }[] = [];

        for (const terrain of this.terrainGroup) {
            if (!terrain.isLine || !terrain.p1 || !terrain.p2) continue;
            const x1 = terrain.p1.x;
            const x2 = terrain.p2.x;
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            if (x < minX || x > maxX) continue;

            const t = (x2 === x1) ? 0 : (x - x1) / (x2 - x1);
            const y = terrain.p1.y + t * (terrain.p2.y - terrain.p1.y);
            const angle = Math.atan2(terrain.p2.y - terrain.p1.y, terrain.p2.x - terrain.p1.x);

            // Weight by proximity to segment center (smoother at edges/seams)
            const segLen = maxX - minX;
            const distFromEdge = Math.min(x - minX, maxX - x);
            const edgeBlend = segLen > 0 ? Math.min(distFromEdge / Math.min(segLen * 0.15, 20), 1) : 1;

            hits.push({ y, angle, weight: edgeBlend });
        }

        if (hits.length === 0) return null;

        if (hits.length === 1) {
            return { y: hits[0].y, angle: hits[0].angle };
        }

        // Use highest surface (lowest y) for position, but blend angles
        hits.sort((a, b) => a.y - b.y);
        bestY = hits[0].y;

        // Weighted angle blend across overlapping segments
        let totalWeight = 0;
        let sinSum = 0;
        let cosSum = 0;
        for (const h of hits) {
            // Only blend segments that are close to the best Y (within threshold)
            if (h.y - bestY > 5) continue;
            const w = h.weight + 0.01; // small epsilon to avoid zero
            sinSum += Math.sin(h.angle) * w;
            cosSum += Math.cos(h.angle) * w;
            totalWeight += w;
        }
        bestAngle = Math.atan2(sinSum / totalWeight, cosSum / totalWeight);

        return { y: bestY, angle: bestAngle };
    }

    private syncKinematicFromBody(body: any) {
        this.kinX = body.position.x;
        this.kinY = body.position.y;
        this.kinAngle = body.angle;
        this.kinVelX = body.velocity.x;
        this.kinVelY = body.velocity.y;
        this.kinAngularVel = body.angularVelocity;
    }

    private snapBodyToKinematic(body: any) {
        const MatterLib = (Phaser.Physics.Matter as any).Matter;
        body.ignoreGravity = true;
        MatterLib.Body.setPosition(body, { x: this.kinX, y: this.kinY });
        MatterLib.Body.setAngle(body, this.kinAngle);
        MatterLib.Body.setVelocity(body, { x: 0, y: 0 });
        MatterLib.Body.setAngularVelocity(body, 0);
    }

    private leaveGroundIntoAir(body: any) {
        const MatterLib = (Phaser.Physics.Matter as any).Matter;
        const launchSpeed = Math.max(this.kinVelX, 0.5);
        const launchVx = Math.cos(this.kinAngle) * launchSpeed;
        const launchVy = Math.sin(this.kinAngle) * launchSpeed;

        this.kinOnGround = false;
        body.ignoreGravity = false;
        MatterLib.Body.setPosition(body, { x: this.kinX, y: this.kinY });
        MatterLib.Body.setAngle(body, this.kinAngle);
        MatterLib.Body.setVelocity(body, { x: launchVx, y: launchVy });
        MatterLib.Body.setAngularVelocity(body, this.kinAngularVel);
    }

    private tryReattachFromAir(body: any): boolean {
        const centerSurf = this.getTerrainSurfaceAt(body.position.x);
        if (!centerSurf) return false;
        if (body.velocity.y < -0.2) return false;

        const backWheel = body.parts[2];
        const frontWheel = body.parts[3];
        if (!backWheel || !frontWheel) return false;

        const backX = backWheel.position.x;
        const frontX = frontWheel.position.x;

        const backSurf = this.getTerrainSurfaceAt(backX);
        const frontSurf = this.getTerrainSurfaceAt(frontX);
        if (!backSurf || !frontSurf) return false;

        const backBottomY = backWheel.position.y + (backWheel.circleRadius || 15);
        const frontBottomY = frontWheel.position.y + (frontWheel.circleRadius || 15);
        const backDelta = backBottomY - backSurf.y;
        const frontDelta = frontBottomY - frontSurf.y;

        const backOnTop = backDelta >= -this.landingContactAbove && backDelta <= this.landingContactBelow;
        const frontOnTop = frontDelta >= -this.landingContactAbove && frontDelta <= this.landingContactBelow;
        if (!backOnTop || !frontOnTop) return false;

        const landingAngle = centerSurf.angle;
        const tiltFromRoad = Math.abs(Phaser.Math.Angle.Wrap(body.angle - landingAngle));
        const normalSpeed = body.velocity.x * (-Math.sin(landingAngle)) + body.velocity.y * Math.cos(landingAngle);
        const landingImpact = Math.max(0, normalSpeed);
        const spinSpeed = Math.abs(body.angularVelocity);
        const isVeryTilted = tiltFromRoad > this.maxLandingTiltFromRoad;
        const isTiltedAndHardImpact =
            tiltFromRoad > this.noCrashTiltFromRoad &&
            (landingImpact > this.maxLandingNormalSpeed || spinSpeed > this.maxLandingAngularSpeed);

        if (isVeryTilted || isTiltedAndHardImpact) {
            this.sparksEmitter.explode(50, body.position.x, body.position.y);
            this.audio.playCollision(1.2);
            this.handleGameOver();
            return true;
        }

        const tangentialSpeed = body.velocity.x * Math.cos(landingAngle) + body.velocity.y * Math.sin(landingAngle);
        this.kinX = body.position.x;
        this.kinY = centerSurf.y - this.wheelBottomFromCOM;
        this.kinAngle = Phaser.Math.Angle.Wrap(body.angle + Phaser.Math.Angle.Wrap(landingAngle - body.angle) * 0.35);
        this.kinVelX = Phaser.Math.Clamp(Math.max(0, tangentialSpeed), 0, this.maxGroundSpeed);
        this.kinVelY = 0;
        this.kinAngularVel = 0;
        this.kinOnGround = true;
        this.snapBodyToKinematic(body);
        this.audio.playLand(Math.min(1.2, 0.4 + landingImpact / Math.max(1, this.maxLandingNormalSpeed)));
        return true;
    }

    drawNeonGraphics() {
        this.graphics.clear();

        // === DRAW RIDER-STYLE PARALLAX BACKGROUND ===
        this.bgGraphics.clear();

        const camX = this.cameras.main.scrollX;
        const camY = this.cameras.main.scrollY;
        const zoom = this.cameras.main.zoom;
        // Divide by zoom so the background fills the full visible zoomed-out viewport
        const W = this.scale.width / zoom;
        const H = this.scale.height / zoom;
        // Camera zoom is applied from canvas center, so (0,0) appears offset toward center.
        // Compensate by starting all draws at the "true" top-left of the visible screen area.
        const offX = -(W - this.scale.width) / 2;
        const offY = -(H - this.scale.height) / 2;
        const worldLeft = camX + offX - 400;
        const worldRight = camX + offX + W + 400;
        const worldTop = camY + offY - 300;
        const worldBottom = camY + offY + H + 1800;
        // Horizon sits at 65% down the screen
        const horizonY = H * 0.65;

        // --- LAYER 0: Gradient sky (deep navy to lighter navy) ---
        const skySteps = 8;
        for (let i = 0; i < skySteps; i++) {
            const t = i / skySteps;
            const r = 0;
            const g = Math.round(8 * (1 - t) + 24 * t);
            const b = Math.round(30 * (1 - t) + 78 * t);
            const color = (r << 16) | (g << 8) | b;
            const stripH = horizonY / skySteps;
            this.bgGraphics.fillStyle(color, 1);
            this.bgGraphics.fillRect(offX, offY + i * stripH, W, stripH + 1);
        }

        // Deep solid void below the road horizon (dark fill)
        this.bgGraphics.fillStyle(0x00163a, 1);
        this.bgGraphics.fillRect(offX, offY + horizonY, W, H - horizonY);

        // --- LAYER 1: Distant Mountains (very slow parallax, silhouettes) ---
        const mtnSpeed = 0.08;
        const mtnSilhouetteColor = 0x04183a; // Solid darker silhouette

        const mtnScrollX = camX * mtnSpeed;
        const normalizedMtnScroll = ((mtnScrollX % this.bgMountainsSpan) + this.bgMountainsSpan) % this.bgMountainsSpan;
        const mtnStartX = offX - normalizedMtnScroll;

        // Draw chunks to cover screen
        for (let i = 0; i < 2; i++) {
            const chunkX = mtnStartX + i * this.bgMountainsSpan;
            this.bgMountains.forEach(m => {
                const sx = chunkX + m.x;
                if (sx > offX - m.w && sx < offX + W) {
                    const baseY = offY + horizonY;
                    const maxPeakRange = m.h * H;

                    this.bgGraphics.fillStyle(mtnSilhouetteColor, 1);
                    this.bgGraphics.beginPath();

                    m.points.forEach((pt, index) => {
                        const px = sx + pt.nx * m.w;
                        const py = baseY - pt.ny * maxPeakRange;
                        if (index === 0) this.bgGraphics.moveTo(px, py);
                        else this.bgGraphics.lineTo(px, py);
                    });

                    this.bgGraphics.closePath();
                    this.bgGraphics.fillPath();
                }
            });
        }

        // Bottom rocks removed from bgGraphics and drawn in this.graphics later



        // --- Draw Player (Compound Body) ---
        // Matter.js shifts internal parts relative to a computed Center of Mass. 
        // Hardcoded graphics offsets will visually detach from the physical hitboxes.
        // The only robust way is to query the exact absolute world coordinates of each physical part.
        const parts = this.player.body.parts;
        // parts[0] is the bounding hull for the whole compound body. We skip it.
        // parts[1] is the chassis rectangle.
        // parts[2] and parts[3] are the wheel circles.

        // --- Draw Player as motorcycle sprite ---
        if (parts[1]) {
            this.motorcycleSprite.setPosition(parts[1].position.x, parts[1].position.y - 19);
            this.motorcycleSprite.setRotation(this.player.rotation);
        }



        // --- Draw Terrain Lines ---
        // --- Ground fill below road: follows terrain shape, fills downward ---
        const groundDepth = 1500; // Increased depth to securely hide everything below road like the black void in screenshot
        this.graphics.fillStyle(0x00163a, 1); // Match with the brighter deep void base color
        const visibleTerrain = this.terrainGroup.filter(terrain =>
            terrain.isLine &&
            terrain.p1 &&
            terrain.p2 &&
            terrain.p2.x >= worldLeft &&
            terrain.p1.x <= worldRight &&
            terrain.p1.y <= worldBottom &&
            terrain.p2.y <= worldBottom &&
            terrain.p1.y >= worldTop - 800 &&
            terrain.p2.y >= worldTop - 800
        );

        visibleTerrain.forEach(terrain => {
            if (!terrain.isLine || !terrain.p1 || !terrain.p2) return;
            const p1 = terrain.p1;
            const p2 = terrain.p2;

            this.graphics.beginPath();
            this.graphics.moveTo(p1.x, p1.y);                       // road surface left
            this.graphics.lineTo(p2.x, p2.y);                       // road surface right
            this.graphics.lineTo(p2.x, p2.y + groundDepth);         // below right
            this.graphics.lineTo(p1.x, p1.y + groundDepth);         // below left
            this.graphics.closePath();
            this.graphics.fillPath();
        });

        // --- LAYER 4: Bottom Parallax Rocks (Foreground to the void fill, drawn in this.graphics) ---
        const rockSpeed = this.rockParallaxSpeed; // Keep speed shared with recycling logic
        const screenBottom = offY + H;
        const chunkW = this.rockPatternWidth;
        const rockCamX = camX * rockSpeed;

        // Exactly 3 patterns: if first exits camera on left, move it to the end.
        this.rockPatterns.sort((a, b) => a.xOffset - b.xOffset);
        const leftMost = this.rockPatterns[0];
        const rightMost = this.rockPatterns[this.rockPatterns.length - 1];
        if (leftMost.xOffset + chunkW < rockCamX) {
            leftMost.xOffset = rightMost.xOffset + chunkW;
            this.rockPatterns.sort((a, b) => a.xOffset - b.xOffset);
        }

        // Backward camera safety.
        const newLeftMost = this.rockPatterns[0];
        const newRightMost = this.rockPatterns[this.rockPatterns.length - 1];
        if (newRightMost.xOffset > rockCamX + W) {
            newRightMost.xOffset = newLeftMost.xOffset - chunkW;
            this.rockPatterns.sort((a, b) => a.xOffset - b.xOffset);
        }

        this.rockPatterns.forEach(pattern => {
            const patternWorldX = pattern.xOffset + camX * (1 - rockSpeed) + offX;

            pattern.rocks.forEach(r => {
                const sx = patternWorldX + r.x;
                // World-space culling around current camera viewport.
                if (sx > worldRight || sx + r.w < worldLeft) return;

                const maxPeakRange = r.h * H;
                const baseRgb = Phaser.Display.Color.IntegerToRGB(r.baseColor);

                r.polys.forEach(poly => {
                    // Calculate facet color based on offset multiplier
                    const rf = Math.min(255, Math.floor(baseRgb.r * poly.colorOffset));
                    const gf = Math.min(255, Math.floor(baseRgb.g * poly.colorOffset));
                    const bf = Math.min(255, Math.floor(baseRgb.b * poly.colorOffset));
                    const facetColor = Phaser.Display.Color.GetColor(rf, gf, bf);

                    this.graphics.fillStyle(facetColor, 1);
                    this.graphics.beginPath();

                    poly.points.forEach((pt, index) => {
                        const px = sx + pt.nx * r.w;
                        const py = screenBottom - pt.ny * maxPeakRange;
                        if (index === 0) this.graphics.moveTo(px, py);
                        else this.graphics.lineTo(px, py);
                    });

                    this.graphics.closePath();
                    this.graphics.fillPath();
                });
            });
        });

        const drawContinuousPath = () => {
            this.graphics.beginPath();
            let lastPoint: { x: number, y: number } | null = null;

            visibleTerrain.forEach(terrain => {
                if (!terrain.isLine || !terrain.p1 || !terrain.p2) return;

                if (!lastPoint || Phaser.Math.Distance.BetweenPoints(lastPoint as any, terrain.p1) > 5) {
                    this.graphics.moveTo(terrain.p1.x, terrain.p1.y);
                }

                this.graphics.lineTo(terrain.p2.x, terrain.p2.y);
                lastPoint = terrain.p2;
            });
            this.graphics.strokePath();
        };

        // Neon glow: soft outer bloom + bright tight core
        const roadNeon = 0xd1007a; // purplish red
        this.graphics.lineStyle(30, roadNeon, 0.12); // wide soft glow
        drawContinuousPath();
        this.graphics.lineStyle(14, roadNeon, 0.7);   // mid bloom
        drawContinuousPath();
        this.graphics.lineStyle(6, 0xffffff, 1);      // bright white core
        drawContinuousPath();

        // --- Draw Gems (solid filled diamond, no spin) ---
        this.gemGroup.forEach(gem => {
            if (gem.isCollected) return;

            const gx = gem.position.x;
            const gy = gem.position.y;
            const s = 10; // half-size of diamond

            // Filled diamond shape
            this.graphics.fillStyle(0xff00ff, 1);
            this.graphics.beginPath();
            this.graphics.moveTo(gx, gy - s);   // top
            this.graphics.lineTo(gx + s, gy);   // right
            this.graphics.lineTo(gx, gy + s);   // bottom
            this.graphics.lineTo(gx - s, gy);   // left
            this.graphics.closePath();
            this.graphics.fillPath();

            // Bright white outline
            this.graphics.lineStyle(1.5, 0xffffff, 0.9);
            this.graphics.beginPath();
            this.graphics.moveTo(gx, gy - s);
            this.graphics.lineTo(gx + s, gy);
            this.graphics.lineTo(gx - s, gy);
            this.graphics.closePath();
            this.graphics.strokePath();
        });
    }

    update(time: number) {

        // --- Input ---
        this.isAccelerating = this.input.activePointer.isDown || !!(this.spaceKey && this.spaceKey.isDown);

        // --- Kinematic Motor Mekaniği ---
        if (!this.isGameOver) {
            const MatterLib = (Phaser.Physics.Matter as any).Matter;
            const b = this.player.body as any;

            if (this.kinOnGround) {
                // Mevcut eğimi al — ivme ve frenlemeyi etkiler
                const preSurf = this.getTerrainSurfaceAt(this.kinX);
                const slopeAngle = preSurf ? preSurf.angle : 0;
                // sin < 0 = tırmanış, sin > 0 = iniş
                const uphillFactor = Math.max(0, -Math.sin(slopeAngle));   // 0..1
                const downhillFactor = Math.max(0, Math.sin(slopeAngle));  // 0..1

                if (this.isAccelerating) {
                    // Tırmanışta ivme ve max hız düşer
                    const accelRate = Math.max(0.015, 0.12 - uphillFactor * 0.10);
                    const speedCap = this.maxGroundSpeed * (1 - uphillFactor * 0.38);
                    this.kinVelX = Math.min(this.kinVelX + accelRate, speedCap);
                } else {
                    // Tırmanışta daha hızlı yavaşlar, inişte çok az ivme kazanır
                    this.kinVelX *= (0.995 - uphillFactor * 0.022 + downhillFactor * 0.004);
                }
                this.kinVelX = Math.max(0, this.kinVelX);
                this.kinX += this.kinVelX;

                const centerSurf = this.getTerrainSurfaceAt(this.kinX);
                if (centerSurf) {
                    const groundTargetY = centerSurf.y - this.wheelBottomFromCOM;
                    // Speed-adaptive launch threshold: faster = detach sooner from edges
                    const launchGap = 6 + this.kinVelX * 0.35;
                    const expectedGravityDropY = this.kinY + launchGap;

                    if (groundTargetY > expectedGravityDropY && this.kinVelX > 3) {
                        this.leaveGroundIntoAir(b);
                        this.syncKinematicFromBody(b);
                    } else {
                        // Smooth surface following — speed-adaptive interpolation
                        const speedRatio = Math.min(this.kinVelX / this.maxGroundSpeed, 1);
                        const posLerp = 0.7 + speedRatio * 0.25;   // 0.70–0.95
                        const angLerp = 0.35 + speedRatio * 0.45;  // 0.35–0.80
                        this.kinY = Phaser.Math.Linear(this.kinY, groundTargetY, posLerp);
                        const angleDiff = Phaser.Math.Angle.Wrap(centerSurf.angle - this.kinAngle);
                        this.kinAngle += angleDiff * angLerp;
                        this.kinVelY = 0;
                        this.kinAngularVel = 0;
                        this.snapBodyToKinematic(b);
                    }
                } else {
                    this.leaveGroundIntoAir(b);
                    this.syncKinematicFromBody(b);
                }
            } else {
                // Havada tamamen Matter fizik çalışır.
                if (b.ignoreGravity) b.ignoreGravity = false;

                if (this.isAccelerating) {
                    const nextSpin = Phaser.Math.Linear(b.angularVelocity, this.airSpinSpeed, this.airSpinLerp);
                    MatterLib.Body.setAngularVelocity(b, nextSpin);
                } else {
                    MatterLib.Body.setAngularVelocity(b, b.angularVelocity * this.airSpinDamping);
                }

                this.syncKinematicFromBody(b);

                // Sadece üstten ve iki teker düzgün bastığında tekrar yapış.
                if (this.tryReattachFromAir(b)) {
                    if (this.isGameOver) return;
                }
            }
        }

        // Grounded state güncelle
        this.isGrounded = this.kinOnGround;
        this.airTime = this.kinOnGround ? 0 : this.airTime + 1;
        this.audio.updateEngine({
            speed: Math.hypot(this.kinVelX, this.kinVelY),
            accelerating: this.isAccelerating,
            grounded: this.kinOnGround,
            active: !this.isGameOver
        });
        this.updateTrailEmitter();

        // --- Flip Tracking ---
        if (!this.isGameOver) {
            const airborne = !this.kinOnGround;
            if (airborne && !this.wasAirborne) {
                this.airRotationAccumulator = 0;
                this.lastAirAngle = this.kinAngle;
            }
            if (airborne) {
                const delta = Phaser.Math.Angle.Wrap(this.kinAngle - this.lastAirAngle);
                this.airRotationAccumulator += delta;
                this.lastAirAngle = this.kinAngle;

                // Takla atıldığı anda (havadayken) sayacı arttır
                const midAirFlips = Math.floor(Math.abs(this.airRotationAccumulator) / (Math.PI * 2));
                if (midAirFlips > 0) {
                    this.flipCount += midAirFlips;
                    this.audio.playFlip();
                    // Kazanılan takla açısını sıfırlayıp kalanı koru
                    this.airRotationAccumulator -= Math.sign(this.airRotationAccumulator) * midAirFlips * (Math.PI * 2);
                }
            }
            if (!airborne && this.wasAirborne) {
                // Yere indik
                this.airRotationAccumulator = 0;
                this.lastAirAngle = this.kinAngle;
            }
            this.wasAirborne = airborne;
        }

        // --- UI Updates ---
        if (!this.isGameOver) {
            const currentScore = this.flipCount + this.collectedGems;
            this.scoreText.setText(`${currentScore}`);
        }

        // Visuals
        this.drawNeonGraphics();
        this.drawSpeedLines();

        // --- Follow Camera ---
        this.updateDynamicCamera(this.kinX, this.kinY);

        // --- Endless Terrain ---
        if (this.kinX > this.lastTerrainPoint.x - 1800 && (time - this.lastTerrainGenTime) > 60) {
            this.generateTerrain(700);
            this.lastTerrainGenTime = time;
        }

        // Uzakta kalan terrain temizle
        while (this.terrainGroup.length > 1700) {
            const oldTerrain = this.terrainGroup.shift();
            if (oldTerrain) this.matter.world.remove(oldTerrain.body);
        }

        // --- Gem Toplama + Cleanup ---
        const cleanupDistance = this.kinX - 2500;
        for (let i = this.gemGroup.length - 1; i >= 0; i--) {
            const gem = this.gemGroup[i];
            if (!gem.isCollected) {
                const dx = gem.position.x - this.kinX;
                const dy = gem.position.y - this.kinY;
                if (Math.hypot(dx, dy) < 35) {
                    gem.isCollected = true;
                    this.collectedGems += 1;
                    this.audio.playGem();
                }
            }
            if (gem.isCollected || gem.position.x < cleanupDistance) {
                this.matter.world.remove(gem);
                this.gemGroup.splice(i, 1);
            }
        }

        // --- Düşme ölümü ---
        if (this.kinY > this.fallDeathY && !this.isGameOver) {
            this.handleGameOver();
        }
    }

    handleGameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.audio.playCrash();
        this.audio.stopEngine();
        if (this.trailEmitter) this.trailEmitter.stop();

        // Kamera sarsıntısı + beyaz flash
        this.cameras.main.shake(380, 0.016);
        this.cameras.main.flash(250, 255, 255, 255, true);

        // Oyuncu konumunda tek genişleyen halka
        const uiCam = this.cameras.cameras[1] as Phaser.Cameras.Scene2D.Camera | undefined;
        const rg = this.add.graphics({ x: this.kinX, y: this.kinY }).setDepth(50);
        rg.lineStyle(3, 0xffffff, 0.9);
        rg.strokeCircle(0, 0, 24);
        uiCam?.ignore(rg);
        this.tweens.add({ targets: rg, scaleX: 18, scaleY: 18, alpha: 0, duration: 800, ease: 'Expo.Out', onComplete: () => rg.destroy() });

        this.matter.world.pause();

        const W = this.scale.width;
        const H = this.scale.height;
        const cx = W / 2, cy = H / 2;
        const finalScore = this.flipCount + this.collectedGems;

        // Ana kamerayı kararalt — built-in fade, kesinlikle çalışır
        this.cameras.main.fade(1100, 0, 0, 8);

        // Yazılar — uiCamera'da gösterilir (main.ignore ile)
        const titleTxt = this.add.text(cx, cy - 52, 'GAME OVER', {
            fontFamily: 'Orbitron, Arial Black, sans-serif',
            fontStyle: 'bold',
            fontSize: '36px',
            color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 14, fill: false }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

        const scoreLbl = this.add.text(cx, cy + 6, 'S C O R E', {
            fontFamily: 'Orbitron, Arial, sans-serif',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.5)',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

        const scoreNum = this.add.text(cx, cy + 65, `${finalScore}`, {
            fontFamily: 'Orbitron, Arial Black, sans-serif',
            fontStyle: 'bold',
            fontSize: '78px',
            color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color: '#ffffff', blur: 18, fill: false }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

        this.cameras.main.ignore([titleTxt, scoreLbl, scoreNum]);

        // Kamera yeterince karardıktan sonra yazılar belirir
        this.time.delayedCall(650, () => {
            titleTxt.setY(cy - 72);
            this.tweens.add({ targets: titleTxt, alpha: 1, y: cy - 52, duration: 380, ease: 'Power3.Out' });
            this.tweens.add({ targets: scoreLbl, alpha: 1, duration: 280, ease: 'Power2', delay: 140 });
            this.tweens.add({ targets: scoreNum, alpha: 1, duration: 350, ease: 'Power2', delay: 200 });
        });

        // Menüye geçmeden önce yazılar söner + DOM overlay siyaha çeker
        this.time.delayedCall(2100, () => {
            this.tweens.add({ targets: [titleTxt, scoreLbl, scoreNum], alpha: 0, duration: 300, ease: 'Power2' });
            // DOM overlay siyaha geçer — hem canvas hem DOM'u örter
            const fd = document.getElementById('scene-fade');
            if (fd) { fd.classList.remove('fade-out'); fd.classList.add('fade-in'); }
        });

        this.time.delayedCall(2600, () => {
            this.scene.start("Menu", { isGameOver: true, score: finalScore });
        });
    }

    drawSpeedLines() {
        this.speedLinesGfx.clear();
        const speedRatio = Phaser.Math.Clamp(this.kinVelX / this.maxGroundSpeed, 0, 1);
        if (speedRatio < 0.28 || this.isGameOver) return;

        const alpha = Phaser.Math.Clamp((speedRatio - 0.28) / 0.72, 0, 1);
        const W = this.scale.width;
        const H = this.scale.height;
        const t = this.time.now;
        const lineCount = Math.round(6 + alpha * 16);

        for (let i = 0; i < lineCount; i++) {
            const seed = i * 137.508;
            const baseY = H * (0.08 + (seed % 1000) / 1000 * 0.84);
            const period = 300 + (seed % 400);
            const progress = ((t * (0.5 + speedRatio * 0.8) + seed * 50) % period) / period;
            const x = W * 0.72 - W * 0.78 * progress;
            const maxLen = (40 + (seed % 120)) * (0.4 + alpha * 0.8);
            const lineAlpha = alpha * (0.10 + (seed % 100) / 100 * 0.16);
            const w = i % 4 === 0 ? 1.5 : 0.8;
            const color = i % 3 === 0 ? 0x00eeff : i % 3 === 1 ? 0xffffff : 0xff66ff;

            this.speedLinesGfx.lineStyle(w, color, lineAlpha);
            this.speedLinesGfx.beginPath();
            this.speedLinesGfx.moveTo(x, baseY);
            this.speedLinesGfx.lineTo(x - maxLen, baseY);
            this.speedLinesGfx.strokePath();
        }

        // Ekran kenarı vignette — yüksek hızda hafif koyulaşma
        if (alpha > 0.4) {
            const vigAlpha = (alpha - 0.4) / 0.6 * 0.22;
            this.speedLinesGfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, vigAlpha, 0, vigAlpha, 0);
            this.speedLinesGfx.fillRect(0, 0, W * 0.18, H);
            this.speedLinesGfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, vigAlpha, 0, vigAlpha);
            this.speedLinesGfx.fillRect(W * 0.82, 0, W * 0.18, H);
        }
    }

    updateDynamicCamera(playerX: number, playerY: number) {
        const climbAmount = Phaser.Math.Clamp((this.cameraBaseY - playerY) / this.cameraHeightRange, 0, 1);
        const cam = this.cameras.main;
        const downBias = Phaser.Math.Linear(0, this.cameraHighAltitudeDownOffset, climbAmount);

        // Hıza göre zoom out — yüksek hızda daha geniş alan görünür
        const speedNorm = Phaser.Math.Clamp(this.kinVelX / this.maxGroundSpeed, 0, 1);
        const speedZoomOut = speedNorm * speedNorm * 0.10;
        const altitudeZoom = Phaser.Math.Linear(this.nearZoom, this.farZoom, climbAmount);
        let targetZoom = altitudeZoom - speedZoomOut;

        // Gaz patlamasında zoom-in pulse (updateTrailEmitter tarafından set edilir)
        this.cameraZoomPulse *= 0.87;
        targetZoom = Math.max(this.farZoom * 0.85, targetZoom + this.cameraZoomPulse);

        // Hız yüksekken kamera daha hızlı takip eder
        const lerpSpeed = Phaser.Math.Linear(this.cameraLerp, this.cameraLerp * 2.2, speedNorm);
        cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, lerpSpeed));

        const visW = this.scale.width / cam.zoom;
        const visH = this.scale.height / cam.zoom;
        cam.scrollX = playerX - visW * 0.20;
        cam.scrollY = playerY - visH * 0.35 + downBias;
    }
}
