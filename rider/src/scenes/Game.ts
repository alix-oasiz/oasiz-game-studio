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

    // UI
    public flipCount: number = 0;
    public collectedGems: number = 0;
    private airRotationAccumulator: number = 0;
    private lastAirAngle: number = 0;
    private wasAirborne: boolean = false;
    private flipText!: Phaser.GameObjects.Text;
    private gemText!: Phaser.GameObjects.Text;
    private descentAllowance: number = 0; // Pixels of descent allowed, earned by climbing up first
    private lastChunkEndSlope: number = 0; // dy/dx continuity hint between generated chunks
    private readonly terrainTargetY: number = 500;
    private readonly terrainMinY: number = 280;
    private readonly terrainMaxY: number = 580;
    private readonly terrainBalanceBand: number = 260;
    private readonly nearZoom: number = 0.74;
    private readonly farZoom: number = 0.48;
    private readonly cameraLerp: number = 0.06;
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
    private wheelBottomFromCOM: number = 20; // tekerlek altından compound CoM'a mesafe

    // Motor sabitleri
    private readonly maxGroundSpeed: number = 25;
    private readonly airSpinClockwiseSpeed: number = 0.16;
    private readonly airSpinLerp: number = 0.11;
    private readonly airSpinDamping: number = 0.99;
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
        this.load.image('motorcycle', 'assets/motorcycle.png');
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
            speed: { min: 45, max: 120 },
            angle: { min: 150, max: 210 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.58, end: 0 },
            blendMode: 'ADD',
            lifespan: { min: 180, max: 360 },
            frequency: 22,
            quantity: 1,
            tint: [0x00f6ff, 0x5de8ff, 0xffffff, 0xff4ef8]
        });
        this.trailEmitter.setDepth(10.8);
        this.trailEmitter.stop();


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
        this.flipText = this.add.text(24, 24, '0 FLIPS', {
            fontSize: '24px',
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        }).setScrollFactor(0).setDepth(100);

        this.gemText = this.add.text(24, 58, '0 PTS', {
            fontSize: '20px',
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#cccccc',
            stroke: '#000000',
            strokeThickness: 5
        }).setScrollFactor(0).setDepth(100);

        // Tell the main zoomed camera to ignore UI text elements so they don't get scaled down
        this.cameras.main.ignore([this.flipText, this.gemText]);
        // Tell the UI camera to ignore the sparks
        uiCamera.ignore(this.sparksEmitter);
        uiCamera.ignore(this.trailEmitter);
        this.events.on(Phaser.Scenes.Events.PAUSE, this.onScenePause, this);
        this.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onSceneShutdown, this);

        // Gem toplama ve crash detection artık update() içinde kinematic olarak yapılıyor.
    }

    private onScenePause() {
        this.audio.stopEngine();
        if (this.trailEmitter) this.trailEmitter.stop();
    }

    private onSceneResume() {
        this.audio.unlockFromUserGesture();
    }

    private onSceneShutdown() {
        this.audio.stopEngine();
        if (this.trailEmitter) this.trailEmitter.stop();
        this.events.off(Phaser.Scenes.Events.PAUSE, this.onScenePause, this);
        this.events.off(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
    }

    private updateTrailEmitter() {
        if (!this.trailEmitter) return;

        const speed = Math.hypot(this.kinVelX, this.kinVelY);
        const speedRatio = Phaser.Math.Clamp(speed / this.maxGroundSpeed, 0, 1.45);
        const backOffset = 50;
        const tx = this.kinX - Math.cos(this.kinAngle) * backOffset;
        const ty = this.kinY - Math.sin(this.kinAngle) * backOffset + 10;

        this.trailEmitter.setPosition(tx, ty);

        const direction = Phaser.Math.RadToDeg(this.kinAngle + Math.PI);
        this.trailEmitter.setAngle(direction);
        this.trailEmitter.setParticleSpeed(80 + speedRatio * 95);
        this.trailEmitter.setFrequency(this.isAccelerating ? 13 : 30);
        this.trailEmitter.setQuantity(this.isAccelerating ? 2 : 1);
        this.trailEmitter.setAlpha(0.48 + speedRatio * 0.16);
        this.trailEmitter.setScale(0.36 + speedRatio * 0.18);

        const shouldEmit = !this.isGameOver && speed > 2.4;
        if (shouldEmit && !this.trailEmitter.emitting) {
            this.trailEmitter.start();
        } else if (!shouldEmit && this.trailEmitter.emitting) {
            this.trailEmitter.stop();
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

        const wheelRadius = 15;
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
        (compoundBody as any).slop = 0.06;
        (compoundBody as any).ignoreGravity = true;

        this.player = this.matter.add.gameObject(this.add.rectangle(startX, startY, 2, 2, 0x000000, 0), compoundBody);

        // Kinematic başlangıç konumunu compound body CoM'una göre ayarla
        // Tekerlek alt noktası = startY + 15 (wheel center) + 15 (radius) = startY + 30
        const wheelBottomY = startY + 30;
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
            const startChunkX = this.lastTerrainPoint.x;

            // Mostly connected terrain — gaps only happen on dedicated launch ramps (case 4)
            // Dynamic Difficulty scaling based on distance traveled
            const distanceRatio = Math.min(this.lastTerrainPoint.x / 50000, 1.0); // 0.0 at start, 1.0 at 50k pixels
            const altitudeError = this.terrainTargetY - this.lastTerrainPoint.y;
            const altitudeBias = Phaser.Math.Clamp(Math.abs(altitudeError) / this.terrainBalanceBand, 0, 1);
            const isTooHigh = altitudeError > 0;
            const isTooLow = altitudeError < 0;
            const canUseDownhillChunk = this.descentAllowance >= 350;

            // Base probabilities (weights)
            let weightFlat = 8 - (distanceRatio * 3);        // Keep flats rare
            let weightDownhill = (canUseDownhillChunk || isTooHigh) ? (10 - (distanceRatio * 2)) : 0;
            let weightUphill = 20 + (distanceRatio * 15);
            let weightSteps = 22 + (distanceRatio * 14);
            let weightGapRamp = 22 + (distanceRatio * 20);
            let weightDoubleJump = 12 + (distanceRatio * 12);

            // Height controller: keep terrain around targetY, avoid one-way climb to the sky.
            if (isTooHigh) {
                weightDownhill += 14 + altitudeBias * 20;
                weightUphill *= 1 - (0.75 * altitudeBias);
                weightDoubleJump *= 1 - (0.5 * altitudeBias);
                weightFlat += 4 + altitudeBias * 6;
            } else if (isTooLow) {
                weightUphill += 10 + altitudeBias * 16;
                weightDownhill *= 1 - (0.8 * altitudeBias);
                weightFlat += 3;
            }

            // Calculate total weight and pick a chunk type
            const totalWeight = weightFlat + weightDownhill + weightUphill + weightSteps + weightGapRamp + weightDoubleJump;
            let randomRoll = Math.random() * totalWeight;
            let chunkType = 0;

            if (randomRoll < weightFlat) {
                chunkType = 0;
            } else if (randomRoll < weightFlat + weightDownhill) {
                chunkType = 1;
            } else if (randomRoll < weightFlat + weightDownhill + weightUphill) {
                chunkType = 2;
            } else if (randomRoll < weightFlat + weightDownhill + weightUphill + weightSteps) {
                chunkType = 3;
            } else if (randomRoll < weightFlat + weightDownhill + weightUphill + weightSteps + weightGapRamp) {
                chunkType = 4;
            } else {
                chunkType = 5;
            }

            let p1 = { ...this.lastTerrainPoint };

            // Allow multiple unconnected splines per chunk for complex floating islands
            let splinesData: { points: Phaser.Math.Vector2[], multiplier: number }[] = [];
            let isGapJump = false; // Flag to determine if we should generate a flying gap after this chunk

            switch (chunkType) {
                case 0:
                    // Short crest: always starts by climbing, then gently returns down.
                    const crestLength = 650 - (distanceRatio * 220);
                    const crestUp = 70 + distanceRatio * 30;
                    const crestDown = 45 + distanceRatio * 25;
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + crestLength * 0.35, p1.y - crestUp),
                            new Phaser.Math.Vector2(p1.x + crestLength * 0.7, p1.y - 20),
                            new Phaser.Math.Vector2(p1.x + crestLength, p1.y + crestDown)
                        ], multiplier: 1.05
                    });
                    break;
                case 1:
                    // Up first, then controlled downhill
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + 450, p1.y - 130),
                            new Phaser.Math.Vector2(p1.x + 1050, p1.y - 30),
                            new Phaser.Math.Vector2(p1.x + 1750, p1.y + 240)
                        ], multiplier: 1.2
                    });
                    break;
                case 2:
                    // Uphill crest, then return downward
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + 520, p1.y - 170),
                            new Phaser.Math.Vector2(p1.x + 1080, p1.y - 260),
                            new Phaser.Math.Vector2(p1.x + 1650, p1.y + 80)
                        ], multiplier: 1.2
                    });
                    break;
                case 3:
                    // Rollercoaster that always starts by going up first
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + 420, p1.y - 150),
                            new Phaser.Math.Vector2(p1.x + 960, p1.y + 70),
                            new Phaser.Math.Vector2(p1.x + 1480, p1.y - 140),
                            new Phaser.Math.Vector2(p1.x + 1980, p1.y + 220)
                        ], multiplier: 1.5
                    });
                    break;
                case 4:
                    // Smooth ski-jump ramp: Dynamic gap based on difficulty, less sharp lip
                    const lipHeight = 250 + (Math.random() * distanceRatio * 150);
                    const slopeLength = 1000 - (Math.random() * distanceRatio * 200);

                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),              // flat start
                            new Phaser.Math.Vector2(p1.x + 180, p1.y - 40),   // starts with an uphill cue
                            new Phaser.Math.Vector2(p1.x + 600, p1.y - 20),   // transition
                            new Phaser.Math.Vector2(p1.x + 800, p1.y - 100),  // steepening
                            new Phaser.Math.Vector2(p1.x + slopeLength, p1.y - lipHeight) // lip
                        ], multiplier: 1.5
                    });
                    isGapJump = true;
                    break;
                case 5:
                    // Smooth Double Uphill Jump
                    splinesData.push({
                        points: [
                            new Phaser.Math.Vector2(p1.x, p1.y),
                            new Phaser.Math.Vector2(p1.x + 400, p1.y - 80),
                            new Phaser.Math.Vector2(p1.x + 800, p1.y - 200)
                        ], multiplier: 1.2
                    });
                    isGapJump = true;
                    break;
            }

            // Generate physics for all splines in this chunk
            let finalPoint = { ...p1 };
            splinesData.forEach(splineDef => {
                let processedPoints = splineDef.points.map(pt => new Phaser.Math.Vector2(pt.x, pt.y));
                processedPoints = this.applyChunkEntryContinuity(processedPoints);
                processedPoints = this.enforceDriveableControlPoints(processedPoints);
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

            finalPoint.y = Phaser.Math.Clamp(finalPoint.y, this.terrainMinY, this.terrainMaxY);

            this.lastTerrainPoint = finalPoint;

            // Only case 4 and 5 trigger a gap — and when it does, make it wide and dynamic
            if (isGapJump) {
                // Gap width scales from 150-300 up to 350-550 based on distance
                const minGap = 110 + (distanceRatio * 120);
                const maxGap = 220 + (distanceRatio * 180);
                const gapWidth = Phaser.Math.Between(minGap, maxGap);

                // Landing drop is limited by earned descent budget.
                const minDrop = -80 - (distanceRatio * 120); // uphill landing remains possible
                const maxDropByDifficulty = 100 + (distanceRatio * 150);
                const maxDropByBudget = Math.floor(this.descentAllowance * 0.6);
                let maxDrop = Math.min(maxDropByDifficulty, maxDropByBudget);

                // If terrain is too high, force jump landings to trend downward.
                if (isTooHigh) {
                    const forcedDrop = 60 + altitudeBias * 140;
                    maxDrop = Math.max(maxDrop, forcedDrop);
                }

                const dropHeight = Phaser.Math.Between(minDrop, maxDrop);

                this.lastTerrainPoint = {
                    x: this.lastTerrainPoint.x + gapWidth,
                    y: this.lastTerrainPoint.y + dropHeight
                };

                this.lastTerrainPoint.y = Phaser.Math.Clamp(this.lastTerrainPoint.y, this.terrainMinY, this.terrainMaxY);

                if (dropHeight < 0) {
                    this.descentAllowance = Math.min(this.descentAllowance + (-dropHeight), 1200);
                } else if (dropHeight > 0) {
                    this.descentAllowance = Math.max(0, this.descentAllowance - dropHeight);
                }
            }

            // Safety: if no forward progress happened, force a small step and exit this call.
            if (this.lastTerrainPoint.x <= startChunkX + 1) {
                this.lastTerrainPoint.x = startChunkX + 200;
                break;
            }
        }
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

        for (const terrain of this.terrainGroup) {
            if (!terrain.isLine || !terrain.p1 || !terrain.p2) continue;
            const x1 = terrain.p1.x;
            const x2 = terrain.p2.x;
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            if (x < minX || x > maxX) continue;

            const t = (x2 === x1) ? 0 : (x - x1) / (x2 - x1);
            const y = terrain.p1.y + t * (terrain.p2.y - terrain.p1.y);

            // En yüksek (en küçük y) yüzeyi al (overlapping segment varsa)
            if (bestY === null || y < bestY) {
                bestY = y;
                bestAngle = Math.atan2(terrain.p2.y - terrain.p1.y, terrain.p2.x - terrain.p1.x);
            }
        }

        return bestY !== null ? { y: bestY, angle: bestAngle } : null;
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
            this.motorcycleSprite.setPosition(parts[1].position.x, parts[1].position.y + 10);
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
        this.graphics.lineStyle(22, roadNeon, 0.12); // wide soft glow
        drawContinuousPath();
        this.graphics.lineStyle(9, roadNeon, 0.7);   // mid bloom
        drawContinuousPath();
        this.graphics.lineStyle(4, 0xffffff, 1);      // bright white core
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
                // Yerdeyken hızlı ama kontrollü yapışık sürüş.
                if (this.isAccelerating) {
                    this.kinVelX = Math.min(this.kinVelX + 0.12, 45);
                } else {
                    this.kinVelX *= 0.995;
                }
                this.kinVelX = Math.max(0, this.kinVelX);
                this.kinX += this.kinVelX;

                const centerSurf = this.getTerrainSurfaceAt(this.kinX);
                if (centerSurf) {
                    const groundTargetY = centerSurf.y - this.wheelBottomFromCOM;
                    this.kinY = Phaser.Math.Linear(this.kinY, groundTargetY, 0.85);
                    const angleDiff = Phaser.Math.Angle.Wrap(centerSurf.angle - this.kinAngle);
                    this.kinAngle += angleDiff * 0.27;
                    this.kinVelY = 0;
                    this.kinAngularVel = 0;
                    this.snapBodyToKinematic(b);
                } else {
                    // Boşlukta artık gerçek fizik: sadece bir kez hava moduna geç.
                    this.leaveGroundIntoAir(b);
                    this.syncKinematicFromBody(b);
                }
            } else {
                // Havada tamamen Matter fizik çalışır.
                if (b.ignoreGravity) b.ignoreGravity = false;

                if (this.isAccelerating) {
                    const nextSpin = Phaser.Math.Linear(b.angularVelocity, this.airSpinClockwiseSpeed, this.airSpinLerp);
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
            }
            if (!airborne && this.wasAirborne) {
                const landedFlips = Math.floor(Math.abs(this.airRotationAccumulator) / (Math.PI * 2));
                if (landedFlips > 0) {
                    this.flipCount += landedFlips;
                    this.audio.playFlip();
                }
                this.airRotationAccumulator = 0;
                this.lastAirAngle = this.kinAngle;
            }
            this.wasAirborne = airborne;
        }

        // --- UI Updates ---
        if (!this.isGameOver) {
            this.flipText.setText(`${this.flipCount} FLIPS`);
            this.gemText.setText(`${this.collectedGems} PTS`);
        }

        // Visuals
        this.drawNeonGraphics();

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
                    this.collectedGems += 5;
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

        this.cameras.main.flash(250, 255, 80, 0);
        this.matter.world.pause();

        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        const cx = W / 2;
        const cy = H / 2;
        const finalScore = this.flipCount * 10 + this.collectedGems;

        // Dark overlay
        const overlay = this.add.rectangle(cx, cy, W, H, 0x000000, 0.75)
            .setScrollFactor(0).setDepth(198);

        // "GAME OVER"
        const titleText = this.add.text(cx, cy - 70, 'GAME OVER', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontStyle: 'bold',
            fontSize: '42px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(199);

        // Score number
        const scoreNum = this.add.text(cx, cy + 20, `${finalScore}`, {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontStyle: 'bold',
            fontSize: '90px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(199);

        // "SCORE" label below number
        const scoreLabel = this.add.text(cx, cy + 85, 'S C O R E', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            color: '#888888'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(199);

        this.cameras.main.ignore([overlay, titleText, scoreNum, scoreLabel]);

        this.time.delayedCall(2200, () => {
            this.scene.start("Menu", { isGameOver: true, score: finalScore });
        });
    }

    updateDynamicCamera(playerX: number, playerY: number) {
        // Higher altitude (smaller Y) means we zoom out to show more of the upcoming track.
        const climbAmount = Phaser.Math.Clamp((this.cameraBaseY - playerY) / this.cameraHeightRange, 0, 1);
        const targetZoom = Phaser.Math.Linear(this.nearZoom, this.farZoom, climbAmount);
        const cam = this.cameras.main;
        const downBias = Phaser.Math.Linear(0, this.cameraHighAltitudeDownOffset, climbAmount);

        cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, this.cameraLerp));
        // Use screen-relative offsets so the player stays centered on all screen sizes.
        // Player sits at ~38% from left (showing more track ahead) and ~55% from top.
        const visW = this.scale.width / cam.zoom;
        const visH = this.scale.height / cam.zoom;
        cam.scrollX = playerX - visW * 0.38;
        cam.scrollY = playerY - visH * 0.55 + downBias;
    }
}
