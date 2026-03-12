import Phaser from 'phaser';

interface Wall {
    distance: number;
    thickness: number;
    sectorIndex: number; // Which sector (0 to n-1)
    color: number;
    speed: number;
    // New fields
    rotationOffset: number; // Extra rotation in radians
    rotationSpeed: number; // Speed of rotation
    widthStart: number; // 0.0 to 1.0 (start relative to sector)
    widthEnd: number; // 0.0 to 1.0 (end relative to sector)
    isPulsing: boolean; // For pulsing effect
    pulseOffset: number; // Phase offset
    onHitCenter?: () => void; // Callback when hitting center
}

export default class Scene extends Phaser.Scene {

    private targetSides: number = 4;
    private currentSides: number = 4;
    private bgGraphics!: Phaser.GameObjects.Graphics;
    private wallGraphics!: Phaser.GameObjects.Graphics; // Added
    private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
    private playerGraphics!: Phaser.GameObjects.Graphics;
    private cameraRotation: number = 0;
    private pulseScale: number = 1;
    private impactScale: number = 0; // Added for collision pop
    private playerAngle: number = 0;
    private playerDistance: number = 105;
    private scoreText!: Phaser.GameObjects.Text;
    private scoreContainer!: Phaser.GameObjects.Container; // Added Container
    private score: number = 0;
    private scoreEvent!: Phaser.Time.TimerEvent;
    private isGameOver: boolean = false;
    private walls: Wall[] = [];
    private globalSpeedMultiplier: number = 1.0;
    private lastPatternName: string = "";
    private bgMusic?: Phaser.Sound.BaseSound;

    // --- Color Themes ---
    private readonly PALETTES = [
        { name: 'Yellow', dark: 0xF9A825, light: 0xFFEE58, wall: 0xC79100 },
        { name: 'Blue', dark: 0x1565C0, light: 0x42A5F5, wall: 0x0D47A1 },
        { name: 'Green', dark: 0x2E7D32, light: 0x66BB6A, wall: 0x1B5E20 },
        { name: 'Red', dark: 0xC62828, light: 0xEF5350, wall: 0xB71C1C },
        { name: 'Purple', dark: 0x6A1B9A, light: 0xAB47BC, wall: 0x4A148C }
    ];
    private themeIndex: number = 0;
    private nextThemeTime: number = 0;
    private currentColors = { ...this.PALETTES[0] };

    // Game State Logic
    private gameState: 'MENU' | 'SPAWNING' | 'CLEARING' | 'TRANSITIONING' | 'GAMEOVER' = 'MENU';
    private patternsSpawned: number = 0;
    private readonly PATTERNS_PER_PHASE: number = 5;
    private nextSpawnTime: number = 0;

    private rotationDirection: number = 1; // 1 or -1
    private isGameRunning: boolean = true; // Control flag for Pause/Resume Countdown
    private isResuming: boolean = false; // Flag to prevent double resume calls

    constructor() {
        super("Scene");
    }

    preload() {
        this.load.audio('lose', 'audio/Lose.wav');
        this.load.audio('pop', 'audio/PopBlock.wav');
        this.load.audio('go', 'audio/Go.wav');
        this.load.audio('bgm', 'audio/BgMusic.mp3');
    }

    create(data: { startActive?: boolean }) {
        console.log("SCENE CREATE START", data);

        try {
            // Reset Game State for fresh start
            this.score = 0;
            this.isGameOver = false;
            this.globalSpeedMultiplier = 1.0;
            this.walls = [];
            this.currentSides = 4;
            this.targetSides = 4;
            this.cameraRotation = 0;
            this.rotationDirection = 1;
            this.isGameRunning = true;
            this.isResuming = false;
            this.patternsSpawned = 0;

            this.bgGraphics = this.add.graphics();
            this.wallGraphics = this.add.graphics(); // Init
            this.playerGraphics = this.add.graphics();

            // Set Depths
            this.bgGraphics.setDepth(0);
            this.wallGraphics.setDepth(1);
            this.playerGraphics.setDepth(2);

            // Safe Area Logic (per Oasiz Guide)
            const isMobile = window.matchMedia('(pointer: coarse)').matches;
            const topMargin = isMobile ? 60 : 30; // Reduced margin as req
            const leftMargin = 20;

            // --- Score Container (3D Card Style) ---
            this.scoreContainer = this.add.container(leftMargin, topMargin);
            this.scoreContainer.setDepth(100);

            // 1. Background (Shadow + White Card + Border)
            // 1. Background (Shadow + White Card + Border)
            const scoreBg = this.add.graphics();

            // Adjust size based on device
            const bgW = isMobile ? 110 : 160;
            const bgH = isMobile ? 55 : 80;
            const radius = isMobile ? 8 : 12;
            const shadowOff = isMobile ? 4 : 6;
            const textConvert = isMobile ? "14px" : "20px";

            // Shadow
            scoreBg.fillStyle(0x000000, 0.4);
            scoreBg.fillRoundedRect(shadowOff, shadowOff, bgW, bgH, radius);

            // Main Card (White)
            scoreBg.fillStyle(0xffffff, 1);
            scoreBg.fillRoundedRect(0, 0, bgW, bgH, radius);

            // Border (Black)
            scoreBg.lineStyle(isMobile ? 3 : 4, 0x000000, 1);
            scoreBg.strokeRoundedRect(0, 0, bgW, bgH, radius);

            this.scoreContainer.add(scoreBg);

            // 2. Text (Score \n Value)
            this.scoreText = this.add.text(bgW / 2, bgH / 2, "SCORE\n0", {
                fontFamily: '"Press Start 2P"',
                fontSize: textConvert,
                color: "#000000",
                align: 'center'
            }).setOrigin(0.5);

            this.scoreContainer.add(this.scoreText);

            // Check Data for Auto Start
            const startActive = data && data.startActive;

            if (startActive) {
                this.scoreContainer.setVisible(true);
                this.gameState = 'SPAWNING';
            } else {
                this.scoreContainer.setVisible(false); // Hide in Menu by default
                this.gameState = 'MENU';
            }

            // Init cursors
            this.cursorKeys = this.input.keyboard!.createCursorKeys();

            this.drawLevel(this.currentSides);

            // "Bam bam poplayıp" pulsing effect
            this.tweens.add({
                targets: this,
                pulseScale: 1.4,
                duration: 200,
                yoyo: true,
                hold: 0,
                repeat: -1,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    this.drawLevel(this.currentSides);
                }
            });

            // Start BGM
            if ((window as any).platform && (window as any).platform.musicEnabled) {
                // Clean up any existing BGM to avoid duplicates
                const existingSounds = this.sound.getAll('bgm');
                existingSounds.forEach(s => s.stop());

                // Create and play new instance
                this.bgMusic = this.sound.add('bgm', { loop: true, volume: 0.4 });
                this.bgMusic.play();

                // Ensure music stops when scene shuts down (restarts)
                this.events.once('shutdown', () => {
                    if (this.bgMusic) {
                        this.bgMusic.stop();
                        this.bgMusic.destroy();
                        this.bgMusic = undefined;
                    }
                });
            }

            // Start Automation Loop - managed in update()
            // Start in MENU state - wait for PLAY button

            this.nextSpawnTime = this.time.now + 1000;
            this.nextThemeTime = this.time.now + 10000; // Switch theme every 10s

            // Setup UI Camera (Static)
            // Main camera ignores debug score container
            this.cameras.main.ignore([this.scoreContainer]);
            // UI Camera ignores everything EXCEPT score container
            const uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
            uiCamera.ignore(this.children.list.filter(child => child !== this.scoreContainer));

            // Handle Resize
            this.scale.on('resize', this.resize, this);
            this.resize();


            // Passive Score Timer (1 point every 100ms)
            this.scoreEvent = this.time.addEvent({
                delay: 100,
                loop: true,
                callback: () => {
                    if (this.isGameOver || !this.isGameRunning) return;
                    this.score++;
                    this.scoreText.setText("SCORE\n" + this.score.toString());

                    // Speed up every 100 points
                    if (this.score % 100 === 0) {
                        this.globalSpeedMultiplier = Math.min(3.0, this.globalSpeedMultiplier + 0.05);
                        // console.log("Speed Up! New Multiplier:", this.globalSpeedMultiplier);

                        // Visual feedback? maybe flash score or something?
                        this.tweens.add({
                            targets: this.scoreContainer,
                            scale: 1.2,
                            duration: 200,
                            yoyo: true
                        });
                    }
                }
            });

            // Expose Restart to Window
            (window as any).restartGame = () => {
                this.scene.restart();
            };
            (window as any).pauseGame = () => {
                this.scene.pause();
                if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.pause();
            };
            (window as any).resumeGame = () => {
                this.scene.resume();

                // If in MENU, just resume music and return (No countdown)
                if (this.gameState === 'MENU') {
                    if (this.bgMusic && !this.bgMusic.isPlaying) this.bgMusic.resume();
                    return;
                }

                // Prevent Double Resume
                if (this.isResuming) return;

                this.isGameRunning = false; // Block update loop
                this.isResuming = true;
                this.startResumeCountdown();
            };

            // Signal HTML that Game is Ready
            if ((window as any).onGameReady) {
                (window as any).onGameReady();
            }

            // New Start Game Hook
            (window as any).startGame = () => {
                this.startGame();
            };

        } catch (e) {
            console.error("SCENE CREATE ERROR:", e);
        }
    }

    // --- Game Loop / State Machine ---

    startGame() {
        // Transition Directly to Game Loop (No Scene Restart)
        console.log("Starting Game...");

        this.scoreContainer.setVisible(true);
        this.gameState = 'SPAWNING';

        // Reset Logic
        this.score = 0;
        this.scoreText.setText("SCORE\n0");
        this.walls = []; // Should be empty anyway from create, but safety
        this.globalSpeedMultiplier = 1.0;

        // Ensure controls are reset
        this.currentSides = 4;
        this.targetSides = 4;

        // Start Spawning soon
        this.nextSpawnTime = this.time.now + 500;
    }

    updateGameLoop(time: number, _delta: number) {
        if (this.gameState === 'MENU' || this.gameState === 'GAMEOVER') return;

        if (this.gameState === 'SPAWNING') {
            // Check if we spawned enough
            if (this.patternsSpawned >= this.PATTERNS_PER_PHASE) {
                console.log("Phase Complete. Waiting to Clear...");
                this.gameState = 'CLEARING';
                return;
            }

            // Attempt Spawn
            if (time > this.nextSpawnTime) {
                // Calculate Start Dist
                const lastDist = this.getLastWallDistance();

                // If last wall is too far, bring it closer (keep flow going)
                // But normally we just append.
                // Scale gap with speed so reaction time stays reasonable!
                const gap = Phaser.Math.Between(500, 800) * this.globalSpeedMultiplier;
                const startDist = Math.max(1200, lastDist + gap);

                this.spawnRandomPattern(startDist);
                this.patternsSpawned++;

                // Reset timer (debounce)
                this.nextSpawnTime = time + 500; // Minimum time between logic checks? 
                // Actually we just spawned at a *distance*. Time doesn't matter as much as distance.
                // But we don't want to spawn 5 instantly.
                // Let's rely on the Update Loop checking distance? 
                // No, just spacing by distance is enough.
                // But to allow "Random" delays, let's keep a timer.
            }
        }
        else if (this.gameState === 'CLEARING') {
            // Wait for ALL walls to be gone
            if (this.walls.length === 0) {
                console.log("Screen Cleared. Transitioning...");
                this.gameState = 'TRANSITIONING';
                this.changeSides();
            }
        }
    }

    changeSides() {
        // Toggle 4 <-> 5
        const nextSides = (this.targetSides === 4) ? 5 : 4;
        this.targetSides = nextSides;

        console.log(`Transitioning to ${nextSides} sides.`);

        this.tweens.add({
            targets: this,
            currentSides: this.targetSides,
            duration: 1500,
            ease: 'Cubic.InOut',
            onUpdate: () => {
                this.drawLevel(this.currentSides);
            },
            onComplete: () => {
                // Done Transitioning
                this.drawLevel(this.currentSides);
                this.gameState = 'SPAWNING';
                this.patternsSpawned = 0;
                this.nextSpawnTime = this.time.now + 1000;
                console.log("Transition Complete. Starting Spawning.");
            }
        });
    }

    // ... (keeping getDiscreteColor, getSectorColor, drawLevel) ...
    // Note: I will only replace the top block and the update bottom block.
    // I need multi_replace.
    // But since I'm removing properties at top, updating create, and update, and adding method.
    // I will try to do it in chunks.

    // Chunk 1: Properties + Create + scheduleNextLevelChange method.
    // Chunk 2: Update method (remove space/q Logic).

    // Replacing top part...
    // I will insert scheduleNextLevelChange AFTER create? Or before?
    // Let's put it after create.

    // I will use replace_file_content for the Property+Create block first.
    // The previous edit left comments at line 20 logic. Ideally clean that up too.

    // I will define the replacement content for the TOP PART.

    // Helper to get discrete color for integer logic
    getDiscreteColor(i: number, intSides: number) {
        // Dynamic Colors
        const dark = this.currentColors.dark;
        const light = this.currentColors.light;
        const distinctColor = 0xFF5722;

        if (intSides % 2 !== 0 && i === intSides - 1) {
            return distinctColor;
        }
        return i % 2 === 0 ? light : dark;
    }

    // Interpolates color based on fractional sides
    getSectorColor(i: number, totalSides: number) {
        const lowerSides = Math.floor(totalSides);
        const upperSides = Math.ceil(totalSides);

        // If exact integer, return exact color
        if (lowerSides === upperSides) {
            return this.getDiscreteColor(i, lowerSides);
        }

        const colorLower = this.getDiscreteColor(i, lowerSides);
        const colorUpper = this.getDiscreteColor(i, upperSides);

        // Remove pinning. Interpolate everything.

        // If colors are same, return one
        if (colorLower === colorUpper) return colorUpper;

        // Interpolate for persistent sectors
        let t = totalSides - lowerSides; // 0.0 to 1.0

        // Apply Cosine Smoothing to 't'
        // This makes the transition start slow and end slow, avoiding linear "points"
        t = (1 - Math.cos(t * Math.PI)) / 2;

        const r1 = (colorLower >> 16) & 0xFF;
        const g1 = (colorLower >> 8) & 0xFF;
        const b1 = colorLower & 0xFF;

        const r2 = (colorUpper >> 16) & 0xFF;
        const g2 = (colorUpper >> 8) & 0xFF;
        const b2 = colorUpper & 0xFF;

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (r << 16) | (g << 8) | b;
    }

    drawLevel(sides: number) {
        const width = this.scale.width;
        const height = this.scale.height;
        const centerX = width / 2;
        const centerY = height / 2;

        this.bgGraphics.clear();

        const bigSize = 1500; // Restored for 1280x720
        const anglePerSide = (Math.PI * 2) / sides;
        const totalSectors = Math.ceil(sides);

        // 3D Effect Settings
        const depthOffset = 10; // Scaled for 720p
        const borderSize = 3;   // Scaled for 720p
        const borderColor = 0x000000;

        // --- Pass 1: Draw Shadows / 3D Depth (Back Layer) ---
        for (let i = 0; i < totalSectors; i++) {
            const startAngle = i * anglePerSide;
            let endAngle = (i + 1) * anglePerSide;

            // Adjust Offset for 3D "Extrusion"
            const shadowX = centerX;
            const shadowY = centerY + depthOffset;

            const mainColor = this.getSectorColor(i, sides);
            // Simple darken:
            const r = ((mainColor >> 16) & 0xFF) * 0.7;
            const g = ((mainColor >> 8) & 0xFF) * 0.7;
            const b = (mainColor & 0xFF) * 0.7;
            const darkColor = (r << 16) | (g << 8) | Math.floor(b);

            this.bgGraphics.fillStyle(darkColor);
            this.bgGraphics.lineStyle(borderSize, borderColor);

            this.bgGraphics.beginPath();
            this.bgGraphics.moveTo(shadowX, shadowY);
            this.bgGraphics.arc(shadowX, shadowY, bigSize, startAngle, endAngle, false);
            this.bgGraphics.lineTo(shadowX, shadowY);
            this.bgGraphics.closePath();
            this.bgGraphics.fillPath();
            this.bgGraphics.strokePath();
        }

        // --- Pass 2: Draw Main Surface (Front Layer) ---
        for (let i = 0; i < totalSectors; i++) {
            const startAngle = i * anglePerSide;
            const endAngle = (i + 1) * anglePerSide;
            const color = this.getSectorColor(i, sides);

            // Gradient: Simulate by "Gradient Fill"
            // Center = Normal. Outer = Slightly Darker?
            // We'll use fillGradientStyle.
            this.bgGraphics.fillStyle(color); // Fallback
            // Gradient: top-left, top-right, bottom-left, bottom-right.
            // We can't easily map this to a wedge.
            // Let's use simple solid for now with the 3D effect providing contrast.

            this.bgGraphics.lineStyle(borderSize, borderColor);
            this.bgGraphics.beginPath();
            this.bgGraphics.moveTo(centerX, centerY);
            this.bgGraphics.arc(centerX, centerY, bigSize, startAngle, endAngle, false);
            this.bgGraphics.lineTo(centerX, centerY);
            this.bgGraphics.closePath();
            this.bgGraphics.fillPath();
            this.bgGraphics.strokePath();
        }

        // --- Draw Center Polygon ---
        // Apply Pulse Scale to Base Radius (and impact)
        const radius = 70 * (this.pulseScale + this.impactScale);

        // Rotation logic: Align edges to split lines (0 degrees)
        // Offset 0 aligns vertices to splits.
        // User wanted this.
        const rotationOffset = 0;

        // Center Shadow
        this.bgGraphics.fillStyle(0x888888); // Grey shadow
        this.bgGraphics.lineStyle(borderSize, borderColor);
        this.bgGraphics.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = i * anglePerSide + rotationOffset;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + depthOffset + Math.sin(angle) * radius; // Shift Y
            if (i === 0) this.bgGraphics.moveTo(x, y);
            else this.bgGraphics.lineTo(x, y);
        }
        this.bgGraphics.closePath();
        this.bgGraphics.fillPath();
        this.bgGraphics.strokePath();

        // Center Main
        this.bgGraphics.fillStyle(0xffffff);
        this.bgGraphics.lineStyle(borderSize, borderColor);
        this.bgGraphics.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = i * anglePerSide + rotationOffset;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            if (i === 0) this.bgGraphics.moveTo(x, y);
            else this.bgGraphics.lineTo(x, y);
        }
        this.bgGraphics.closePath();
        this.bgGraphics.fillPath();
        this.bgGraphics.strokePath();
    }

    update(_time: number, delta: number) {
        if (this.isGameOver) return;

        // If Game Logic is paused (e.g. counting down), FREEZE EVERYTHING
        // Except maybe we want to render the static scene? 
        // Yes, render is automatic, but we stop logic updates.
        if (!this.isGameRunning) return;

        // Cap Delta to avoid large skips (lag spikes)
        delta = Math.min(delta, 50);

        // --- Theme Transition Logic ---
        // SMOOTH LERP towards Target Palette
        const targetPalette = this.PALETTES[this.themeIndex];
        const lerpSpeed = 0.5 * (delta / 1000);

        this.currentColors.dark = this.lerpColor(this.currentColors.dark, targetPalette.dark, lerpSpeed);
        this.currentColors.light = this.lerpColor(this.currentColors.light, targetPalette.light, lerpSpeed);
        this.currentColors.wall = this.lerpColor(this.currentColors.wall, targetPalette.wall, lerpSpeed);

        // Check for Theme Switch
        if (this.time.now > this.nextThemeTime) {
            this.themeIndex = (this.themeIndex + 1) % this.PALETTES.length;
            this.nextThemeTime = this.time.now + 10000;
        }

        // Global Camera Rotation Update
        // In MENU, rotate slower for ambience
        const rotSpeed = (this.gameState === 'MENU') ? 0.0005 : 0.001;
        this.cameraRotation += rotSpeed * delta * this.rotationDirection;
        this.cameras.main.setRotation(this.cameraRotation);

        // Run Game Logic
        this.updateGameLoop(_time, delta);

        // In MENU, Skip Player/Wall updates
        if (this.gameState === 'MENU') {
            // Only Pulse Effect needs to run which is tween based (automatic)
            return;
        }


        // --- Player Controls ---
        const speed = 0.005; // Radians per ms
        const pointer = this.input.activePointer;
        const width = this.scale.width; // Use current width

        const isDesktop = this.sys.game.device.os.desktop;

        // Left: Arrow Key OR (Touch Left Side on Mobile)
        const isLeftDown = this.cursorKeys.left.isDown || (!isDesktop && pointer.isDown && pointer.x < width / 2);
        // Right: Arrow Key OR (Touch Right Side on Mobile)
        const isRightDown = this.cursorKeys.right.isDown || (!isDesktop && pointer.isDown && pointer.x >= width / 2);

        if (isLeftDown) {
            this.playerAngle -= speed * delta;
        } else if (isRightDown) {
            this.playerAngle += speed * delta;
        }

        // Draw Player every frame
        this.drawPlayer();

        // Update and Draw Walls
        this.updateWalls(delta);
        this.drawWalls();
    }

    // --- Wall Logic ---

    // --- Pattern Spawning Logic ---

    getLastWallDistance(): number {
        if (this.walls.length === 0) return 1200; // Start closer if empty
        let maxDist = 0;
        for (const w of this.walls) {
            const d = w.distance + w.thickness;
            if (d > maxDist) maxDist = d;
        }
        return Math.max(1200, maxDist);
    }

    spawnRandomPattern(startDist: number) {
        const patterns = [
            { name: "Single Gap", func: this.spawnSingleGap.bind(this) },
            { name: "Double Gap", func: this.spawnDoubleGap.bind(this) },
            { name: "Spiral", func: this.spawnSpiral.bind(this) },
            { name: "Zigzag", func: this.spawnZigzag.bind(this) },
            //{ name: "Multi Slice (Slim)", func: this.spawnMultiSlice.bind(this) },
            { name: "Direction Change", func: this.spawnDirectionChange.bind(this) },
            { name: "Pulsating", func: this.spawnPulsating.bind(this) },
            { name: "Combined", func: this.spawnCombined.bind(this) }
        ];

        // Filter out same pattern if we have enough options
        let available = patterns;
        if (patterns.length > 1 && this.lastPatternName !== "") {
            available = patterns.filter(p => p.name !== this.lastPatternName);
        }

        const selected = available[Phaser.Math.Between(0, available.length - 1)];
        this.lastPatternName = selected.name;
        selected.func(startDist);
    }

    // 1. Single Gap
    spawnSingleGap(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const gapIndex = Phaser.Math.Between(0, sides - 1);
        const thickness = Phaser.Math.Between(20, 100);
        for (let i = 0; i < sides; i++) {
            if (i !== gapIndex) {
                this.addWall(i, startDist, thickness, 0, 0.2);
            }
        }
    }

    // 2. Double Gap (Rotating)
    spawnDoubleGap(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const gap1 = Phaser.Math.Between(0, sides - 1);
        let gap2 = (gap1 + Math.floor(sides / 2)) % sides;
        if (gap2 === gap1) gap2 = (gap1 + 1) % sides;
        const thickness = Phaser.Math.Between(50, 100);

        for (let i = 0; i < sides; i++) {
            if (i !== gap1 && i !== gap2) {
                this.addWall(i, startDist, thickness, 0, 0.2);
            }
        }
    }

    // 3. Spiral Barrier (Gap Spirals)
    spawnSpiral(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const spacing = 300;
        const length = sides * 4;
        const thickness = Phaser.Math.Between(20, 25);

        for (let i = 0; i < length; i++) {
            const gapSector = i % sides;
            const dist = startDist + (i * spacing);

            for (let s = 0; s < sides; s++) {
                if (s !== gapSector) {
                    this.addWall(s, dist, thickness, 0, 0.2);
                }
            }
        }
    }

    // 4. Zigzag / Wave
    spawnZigzag(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const rows = 8;
        const spacing = 250;
        const thickness = Phaser.Math.Between(20, 100);

        for (let r = 0; r < rows; r++) {
            const dist = startDist + (r * spacing);
            for (let i = 0; i < sides; i++) {
                if ((i + r) % 2 === 0) {
                    this.addWall(i, dist, thickness, 0, 0.2);
                }
            }
        }
    }

    // 5. Multi-Slice (Sık Dilimli)
    spawnMultiSlice(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const rows = 4;
        const spacing = 500; // Increased from 400

        for (let r = 0; r < rows; r++) {
            const dist = startDist + (r * spacing);
            for (let i = 0; i < sides; i++) {
                // Fixed thickness 25, no random. increased gap (0.35 to 0.65 = 0.3 gap)
                this.addWall(i, dist, 25, 0, 0.2, 0, 0, 0.0, 0.35);
                this.addWall(i, dist, 25, 0, 0.2, 0, 0, 0.65, 1.0);
            }
        }
    }

    // 6. Sudden Direction Change
    spawnDirectionChange(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const gapIndex = Phaser.Math.Between(0, sides - 1);
        const thickness = Phaser.Math.Between(20, 100);

        let callbackAttached = false;
        for (let i = 0; i < sides; i++) {
            if (i !== gapIndex) {
                const wall = this.addWall(i, startDist, thickness, 0, 0.2);
                if (!callbackAttached) {
                    wall.onHitCenter = () => {
                        this.rotationDirection *= -1;
                        this.cameras.main.flash(200, 255, 0, 0);
                    };
                    callbackAttached = true;
                }
            }
        }
    }

    // 7. Pulsating
    spawnPulsating(startDist: number) {
        const sides = Math.floor(this.currentSides);
        const gapIndex = Phaser.Math.Between(0, sides - 1);
        const thickness = Phaser.Math.Between(20, 20);

        for (let i = 0; i < sides; i++) {
            if (i !== gapIndex) {
                const wall = this.addWall(i, startDist, thickness, 0, 0.2);
                // wall.isPulsing = true; // All walls pulse now
            }
        }
    }

    // 8. Combined
    // 8. Combined (Combo)
    spawnCombined(startDist: number) {
        // Scale internal offsets by speed multiplier so they don't merge at high speeds
        const m = this.globalSpeedMultiplier;

        this.spawnSingleGap(startDist);
        this.spawnDoubleGap(startDist + (600 * m));
        this.spawnZigzag(startDist + (1200 * m));

        // Random direction change sometimes?
        if (Phaser.Math.Between(0, 100) > 50) {
            this.rotationDirection *= -1;
        }
    }


    // Helper to add wall
    addWall(sector: number, dist: number, thickness: number, _color: number, speed: number, rotSpeed: number = 0, rotOffset: number = 0, wStart: number = 0, wEnd: number = 1): Wall {
        // Enforce Dark Yellow Color for all walls
        const fixedColor = 0xC79100;

        // Thickness is now passed in (randomized per trap, or fixed for specific traps)

        const wall: Wall = {
            distance: dist,
            thickness: thickness,
            sectorIndex: sector,
            color: fixedColor,
            speed: speed, // Keep logic speed
            rotationOffset: rotOffset,
            rotationSpeed: rotSpeed,
            widthStart: wStart,
            widthEnd: wEnd,
            isPulsing: false, // DISABLED
            pulseOffset: 0,
            onHitCenter: undefined // Explicitly undefined
        };
        this.walls.push(wall);
        return wall;
    }

    updateWalls(delta: number) {
        // Move walls inwards
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const wall = this.walls[i];
            wall.distance -= wall.speed * this.globalSpeedMultiplier * delta;

            // Rotation
            if (wall.rotationSpeed !== 0) {
                wall.rotationOffset += wall.rotationSpeed * delta;
            }

            // Removed Pulsating Logic (Thickness is fixed)

            // Collision with Center (Radius ~70)
            if (wall.distance < 70) {
                // Remove wall
                this.walls.splice(i, 1);

                // Trigger BIG POP
                // User only asked for passive score 100ms. 
                // Let's keep the wall clear score as a bonus (optional) or remove it to strictly follow "her 100 ms 1 skor".
                // User said "her 100 ms 1 skor kazandırsın", didn't explicitly satisfy "sadece".
                // But usually endless runners have passive score. Let's REMOVE the wall hit score to avoid inflation if not asked.
                // Or keep it? Let's remove it to be precise to the request "100 ms 1 skor".

                // Trigger BIG POP
                // Trigger SMOOTH POP
                // Instead of jumping to 0.5, tween TO 0.3 then back to 0
                this.tweens.add({
                    targets: this,
                    impactScale: { from: 0, to: 0.3 },
                    duration: 50,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this.tweens.add({
                            targets: this,
                            impactScale: 0,
                            duration: 200,
                            ease: 'Sine.easeIn'
                        });
                    }
                });

                if (wall.onHitCenter) {
                    wall.onHitCenter();
                }

                // Haptic on impact
                if ((window as any).triggerHaptic) (window as any).triggerHaptic("medium");

                // Retro Pulse Effect
                this.playPulseEffect();

                // Play Pop Sound
                if ((window as any).platform && (window as any).platform.fxEnabled) {
                    this.sound.play('pop');
                }

                continue;
            }

            // check Player Collision
            // Player is at this.playerDistance (105)
            // Player is basically a point at this.playerAngle
            // Check radial distance overlap
            if (wall.distance <= this.playerDistance && wall.distance + wall.thickness >= this.playerDistance) {
                // Check Sector overlap
                // Player Angle needs to be normalized to find which sector it is in.

                // Effective Angle = Player Rotation - Camera Rotation
                // But we are drawing walls based on WORLD sector index.
                // So we need to map Player Angle to World Angle.
                // World Angle of Player = this.playerAngle (since we rotate camera to view world)
                // Actually:
                // Camera Rotation renders the world rotated.
                // Player Angle is relative to the screen usually?
                // Let's check drawPlayer: 
                // `const drawAngle = this.playerAngle - this.cameraRotation;`
                // This implies `this.playerAngle` is the WORLD angle of the player.

                // Player Angle is Screen Relative. Convert to World Angle to check against Walls.
                // Must match draw logic logic: world = screen - camera?
                const worldAngle = this.playerAngle - this.cameraRotation;
                let pAngle = worldAngle % (Math.PI * 2);
                if (pAngle < 0) pAngle += Math.PI * 2;

                const sides = this.currentSides;
                const anglePerSide = (Math.PI * 2) / sides;

                // Determine which sector the player is in
                const playerSectorIndex = Math.floor(pAngle / anglePerSide);

                // Wall Sector Index
                // Wall.sectorIndex might be > sides if we didn't modulo it, but usually we do.
                // Let's normalize wall sector just in case.
                const wallSector = wall.sectorIndex % sides; // Should be enough if wall.sectorIndex is int

                if (wallSector === playerSectorIndex) {
                    // HIT!
                    // Check gaps within the sector?
                    // Current implementation: Wall covers ENTIRE sector unless it creates a 'visual' gap using widthStart/End which we don't fully use for logic yet?
                    // Wait, `addWall` has wStart and wEnd.
                    // Standard walls are 0 to 1.
                    // The gaps are created by NOT spawning a wall in that sector.
                    // So if there IS a wall in this sector list, and we are in this sector, we hit it.
                    // UNLESS the wall has partial width.

                    // Check Wall Width
                    // Player angle within sector:
                    // Fix: Include rotationOffset!
                    const sectorStartAngle = (wallSector * anglePerSide) + wall.rotationOffset;
                    let relAngle = pAngle - sectorStartAngle;

                    // Normalize relAngle to -PI..PI or 0..2PI to handle wrap-around correctly with rotation
                    // Actually, just working with simple diff is safest if we assume we are close.
                    // Normalize to [-PI, PI]
                    while (relAngle <= -Math.PI) relAngle += Math.PI * 2;
                    while (relAngle > Math.PI) relAngle -= Math.PI * 2;

                    const relT = relAngle / anglePerSide; // 0..1 (roughly)

                    // Tolerance to make player collider "smaller" (easier to pass)
                    // 0.05 means you can clip into the wall by 5% of a sector width and survive.
                    const tolerance = 0.05;

                    if (relT >= (wall.widthStart + tolerance) && relT <= (wall.widthEnd - tolerance)) {
                        this.handleGameOver();
                        return; // Stop update
                    }
                }
            }

            // Remove if passed far center (safety, though distance < 70 catches it)
            if (wall.distance + wall.thickness < -50) {
                this.walls.splice(i, 1);
            }
        }

        // Safety Check: Prevent impossible walls
        // this.enforceGapSafety(); // DISABLED: Suspected of causing double-row deletion in Combined trap.
    }

    enforceGapSafety() {
        // If walls align perfectly to block all K sectors at ~same distance, remove one.
        // We can bucket walls by rounded distance (bucket size ~ thickness).
        const sides = Math.floor(this.currentSides);
        const buckets: { [key: number]: Wall[] } = {};

        // Bucket size: 30 units?
        for (const wall of this.walls) {
            // Only check walls far enough away (don't delete walls right in player's face unless necessary)
            // But blocking walls are blocking regardless.
            const bucketKey = Math.floor(wall.distance / 50);
            if (!buckets[bucketKey]) buckets[bucketKey] = [];
            buckets[bucketKey].push(wall);
        }

        // Check buckets
        for (const key in buckets) {
            const group = buckets[key];
            // Get unique sectors in this group
            // We must filter by walls that are actually covering a full sector width?
            // Assuming simplified walls for now.
            const coveredSectors = new Set<number>();
            for (const w of group) {
                // If sector index >= currentSides, it counts as covering 'sector % sides' ??
                // Or acts as a blocker?
                // Let's Normalize sector index
                const normalizedSector = w.sectorIndex % sides;
                coveredSectors.add(normalizedSector);
            }

            if (coveredSectors.size >= sides) {
                // FULL BLOCKAGE DETECTED!
                // Remove one random wall from this group to create a gap.
                const wallToRemove = group[Phaser.Math.Between(0, group.length - 1)];
                const index = this.walls.indexOf(wallToRemove);
                if (index > -1) {
                    this.walls.splice(index, 1);
                    // console.log("Safety System: Removed wall to create gap.");
                }
            }
        }
    }

    drawWalls() {
        const sides = this.currentSides;
        if (sides < 3) return;

        // Use wallGraphics
        this.wallGraphics.clear();

        const anglePerSide = (Math.PI * 2) / sides;
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const depthOffset = 15; // 3D depth

        // Draw each wall
        for (const wall of this.walls) {
            // Calculate angles
            // Walls should be fixed to the sector index (World Space).
            // Camera rotation handles the visual spin.
            if (wall.sectorIndex === undefined) continue;

            const color = this.currentColors.wall; // NEW Dynamic Color

            // Base Sector Angle (adjusted by camera rotation) -> NO, Camera rotates World.
            const baseAngle = (wall.sectorIndex * anglePerSide) + wall.rotationOffset;

            // Partial Width Logic
            // Start of wall within the sector
            const startAngle = baseAngle + (wall.widthStart * anglePerSide);
            // End of wall within the sector
            const endAngle = baseAngle + (wall.widthEnd * anglePerSide);

            // Radii
            const innerRadius = wall.distance;
            const outerRadius = wall.distance + wall.thickness;

            // Vertices
            const p1 = { x: centerX + Math.cos(startAngle) * innerRadius, y: centerY + Math.sin(startAngle) * innerRadius };
            const p2 = { x: centerX + Math.cos(endAngle) * innerRadius, y: centerY + Math.sin(endAngle) * innerRadius };
            const p3 = { x: centerX + Math.cos(endAngle) * outerRadius, y: centerY + Math.sin(endAngle) * outerRadius };
            const p4 = { x: centerX + Math.cos(startAngle) * outerRadius, y: centerY + Math.sin(startAngle) * outerRadius };

            // Shadow / Depth (Darker Color)
            // Simple darken: shift bits or hardcode?
            // Let's assume Gold (0xCCCC00), Shadow roughly 0x888800.
            const r = (color >> 16) & 0xFF;
            const g = (color >> 8) & 0xFF;
            const b = color & 0xFF;
            const shadowColor = ((r * 0.6) << 16) | ((g * 0.6) << 8) | (b * 0.6);

            this.wallGraphics.fillStyle(shadowColor);
            this.wallGraphics.beginPath();
            // Draw 3D side (Thickness projection?)
            // Just draw offset polygon behind
            this.wallGraphics.moveTo(p1.x, p1.y + depthOffset);
            this.wallGraphics.lineTo(p2.x, p2.y + depthOffset);
            this.wallGraphics.lineTo(p3.x, p3.y + depthOffset);
            this.wallGraphics.lineTo(p4.x, p4.y + depthOffset);
            this.wallGraphics.closePath();
            this.wallGraphics.fillPath();

            // Main Face
            this.wallGraphics.fillStyle(color);
            this.wallGraphics.beginPath();
            this.wallGraphics.moveTo(p1.x, p1.y);
            this.wallGraphics.lineTo(p2.x, p2.y);
            this.wallGraphics.lineTo(p3.x, p3.y);
            this.wallGraphics.lineTo(p4.x, p4.y);
            this.wallGraphics.closePath();
            this.wallGraphics.fillPath();

            // Borders
            this.wallGraphics.lineStyle(2, 0x000000);
            this.wallGraphics.strokePath();
        }
    }

    drawPlayer() {
        const width = this.scale.width;
        const height = this.scale.height;
        const centerX = width / 2;
        const centerY = height / 2;

        this.playerGraphics.clear();

        // Player Settings
        const radius = this.playerDistance; // Distance from center
        const size = 6;    // Triangle size
        const mainColor = 0xFFFFFF; // White
        const shadowColor = 0x888888; // Grey
        const borderColor = 0x000000;
        const borderSize = 2;
        const depthOffset = 6; // 3D depth

        // Calculate World Angle for Drawing (Player is fixed on Screen, so World Angle rotates *opposite* to Camera?)
        // Try subtraction if addition failed.
        const drawAngle = this.playerAngle - this.cameraRotation;

        // Calculate Vertices (Relative to CENTER 0,0)
        // We calculate offsets from (centerX, centerY)

        // Tip (Outwards)
        const tipX = Math.cos(drawAngle) * (radius + size);
        const tipY = Math.sin(drawAngle) * (radius + size);

        // Base corners
        const baseAngle1 = drawAngle + 0.15;
        const baseAngle2 = drawAngle - 0.15;

        const baseX1 = Math.cos(baseAngle1) * (radius - size);
        const baseY1 = Math.sin(baseAngle1) * (radius - size);

        const baseX2 = Math.cos(baseAngle2) * (radius - size);
        const baseY2 = Math.sin(baseAngle2) * (radius - size);

        // --- Draw Shadow (3D Depth) ---
        // Offset Y by depthOffset
        this.playerGraphics.fillStyle(shadowColor);
        this.playerGraphics.lineStyle(borderSize, borderColor);
        this.playerGraphics.beginPath();
        // Move to Shadow Position
        this.playerGraphics.moveTo(centerX + tipX, centerY + tipY + depthOffset);
        this.playerGraphics.lineTo(centerX + baseX1, centerY + baseY1 + depthOffset);
        this.playerGraphics.lineTo(centerX + baseX2, centerY + baseY2 + depthOffset);
        this.playerGraphics.closePath();
        this.playerGraphics.fillPath();
        this.playerGraphics.strokePath();

        // --- Draw Main Body ---
        this.playerGraphics.fillStyle(mainColor);
        this.playerGraphics.lineStyle(borderSize, borderColor);
        this.playerGraphics.beginPath();
        this.playerGraphics.moveTo(centerX + tipX, centerY + tipY);
        this.playerGraphics.lineTo(centerX + baseX1, centerY + baseY1);
        this.playerGraphics.lineTo(centerX + baseX2, centerY + baseY2);
        this.playerGraphics.closePath();
        this.playerGraphics.fillPath();
        this.playerGraphics.strokePath();
    }

    handleGameOver() {
        this.isGameOver = true;
        console.log("GAME OVER! Score: " + this.score);

        // Visual Shake
        this.cameras.main.shake(500, 0.05);
        this.cameras.main.flash(500, 255, 0, 0);

        // Haptic
        if ((window as any).triggerHaptic) (window as any).triggerHaptic("error");

        // Submit Score
        if ((window as any).submitScore) {
            (window as any).submitScore(this.score);
        }

        // Show HTML UI
        if ((window as any).showGameOver) {
            (window as any).showGameOver(this.score);
        }

        // Play Lose Sound
        if ((window as any).platform && (window as any).platform.fxEnabled) {
            this.sound.play('lose');
        }

        // Stop Score Timer
        if (this.scoreEvent) this.scoreEvent.remove();

        // Stop Music
        if (this.bgMusic && this.bgMusic.isPlaying) {
            this.bgMusic.stop();
        }



        // Optional: Auto Restart (now triggered by external UI)
        // this.time.delayedCall(3000, () => {
        //     this.scene.restart();
        // });
    }

    // Color Interpolation Helper
    lerpColor(c1: number, c2: number, t: number): number {
        const r1 = (c1 >> 16) & 0xFF;
        const g1 = (c1 >> 8) & 0xFF;
        const b1 = c1 & 0xFF;

        const r2 = (c2 >> 16) & 0xFF;
        const g2 = (c2 >> 8) & 0xFF;
        const b2 = c2 & 0xFF;

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (r << 16) | (g << 8) | b;
    }


    playPulseEffect() {
        // Create a temporary graphics object for the pulse
        const pulse = this.add.graphics();
        pulse.setDepth(10); // Above walls/player, below UI/Scanlines
        pulse.setBlendMode(Phaser.BlendModes.ADD); // Glowing effect!

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const maxRadius = Math.max(this.scale.width, this.scale.height) * 0.8;

        // Data object to tween
        const data = { r: 50, width: 20, alpha: 1 };

        this.tweens.add({
            targets: data,
            r: maxRadius,
            width: 0,
            alpha: 0,
            duration: 600,
            ease: 'Cubic.out', // Smooth arcade feel
            onUpdate: () => {
                pulse.clear();
                if (data.width > 0) {
                    pulse.lineStyle(data.width, 0xFFFFFF, data.alpha);
                    pulse.strokeCircle(centerX, centerY, data.r);
                }
            },
            onComplete: () => {
                pulse.destroy();
            }
        });

        // Secondary "Echo" Pulse (slightly delayed)
        this.time.delayedCall(100, () => {
            const echo = this.add.graphics();
            echo.setDepth(10);
            echo.setBlendMode(Phaser.BlendModes.ADD);
            const d2 = { r: 50, alpha: 0.5 };
            this.tweens.add({
                targets: d2,
                r: maxRadius * 0.6,
                alpha: 0,
                duration: 400,
                ease: 'Cubic.out',
                onUpdate: () => {
                    echo.clear();
                    echo.lineStyle(2, 0xFFFFFF, d2.alpha);
                    echo.strokeCircle(centerX, centerY, d2.r);
                },
                onComplete: () => {
                    echo.destroy();
                }
            });
        });
    }

    resize() {
        const width = this.scale.width;
        const height = this.scale.height;

        // Resize UI Camera to match viewport
        if (this.cameras.cameras[1]) {
            this.cameras.cameras[1].setViewport(0, 0, width, height);
        }

        // Logic Height for Zoom Calculation
        // Standard Desktop Height ~720-800px.
        // We want Mobile (~400px wide) to see roughly similar radial distance.
        // So we assume the "Safe Min Dimension" is around 700px.
        const minDim = Math.min(width, height);
        let zoom = minDim / 750;

        // Clamp Zoom (Don't let it get crazy big on 4k monitors, or too small)
        // Actually, allowing it to go > 1 is fine if we want big pixels?
        // But usually we just want to see ENOUGH.
        // If zoom is < 1 (Mobile), we zoom out to fit 750px worth of content.

        if (zoom > 1) zoom = 1; // Cap at 1 (PC size)
        if (zoom < 0.5) zoom = 0.5; // Cap min size

        this.cameras.main.setZoom(zoom);

        // Re-center camera? Default works if we draw at center.
        this.cameras.main.centerOn(width / 2, height / 2);
    }

    startResumeCountdown() {
        let count = 3;
        const width = this.scale.width;
        const height = this.scale.height;

        // Text Object
        const countText = this.add.text(width / 2, height / 2, count.toString(), {
            fontFamily: '"Press Start 2P"',
            fontSize: "96px",
            color: "#ffffff"
        }).setOrigin(0.5).setDepth(300);

        countText.setStroke('#000000', 8);

        // Fix: Only show on UI Camera (Static), Hide from Main Camera (Rotating)
        this.cameras.main.ignore(countText);

        // Helper for Pop Animation
        const popText = (val: string) => {
            countText.setText(val);
            countText.setScale(0);
            countText.setAlpha(1);

            this.tweens.add({
                targets: countText,
                scale: 1.5,
                duration: 200,
                ease: 'Back.out',
                onComplete: () => {
                    this.tweens.add({
                        targets: countText,
                        scale: 1.0, // Settle
                        duration: 200
                    })
                }
            });

            // Vanish after slightly longer
            this.tweens.add({
                targets: countText,
                alpha: 0,
                delay: 600,
                duration: 200
            });

            // Sound
            if ((window as any).platform && (window as any).platform.fxEnabled) {
                if (val === "GO!") {
                    this.sound.play('go');
                } else {
                    this.sound.play('pop');
                }
            }
        };

        popText("3");

        // Schedule 2, 1, GO
        this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                count--;
                if (count > 0) {
                    popText(count.toString());
                } else {
                    // GO! / Resume
                    popText("GO!");

                    // Resume Logic
                    // Resume Logic
                    this.time.delayedCall(500, () => {
                        countText.destroy();
                        this.isGameRunning = true;
                        this.isResuming = false;
                        if (this.bgMusic && this.bgMusic.isPaused) this.bgMusic.resume();
                    });
                }
            }
        });
    }
}
