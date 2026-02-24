// You can write more code here
/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */



type TrapType =
	'STATIC_GAP' |
	'ROTATING_BAR' |
	'SIDE_WIND_ZONE' |
	'SIDE_MOVER' |
	'HEXAGON_TURRET' |
	'MAGNET_CORE' |
	'LASER_GRID' |
	'PULSE_RING' |
	'TELEPORT_GATE' |
	'GRAVITY_FLIP_ZONE';

type SideMoverUnit = {
	t: number;
	dir: number;
	waitTimer: number;
	yOffset: number;
	x: number;
	square: Phaser.GameObjects.Rectangle;
	glow: Phaser.GameObjects.Rectangle;
};

type HexProjectile = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	spin: number;
	active: boolean;
	body: Phaser.GameObjects.Rectangle;
	glow: Phaser.GameObjects.Rectangle;
};

type LaserBeamUnit = {
	yOffset: number;
	phase: number;
	active: boolean;
	beam: Phaser.GameObjects.Rectangle;
	glow: Phaser.GameObjects.Rectangle;
};

type Barrier = {
	type: TrapType;
	y: number;
	passed: boolean;
	// Static Gap Properties
	gapX?: number;
	gapWidth?: number;
	leftX?: number; leftW?: number;
	rightX?: number; rightW?: number;
	left?: Phaser.GameObjects.Rectangle;
	right?: Phaser.GameObjects.Rectangle;
	leftGlow?: Phaser.GameObjects.Rectangle;
	rightGlow?: Phaser.GameObjects.Rectangle;
	// Rotating Bar Properties
	angle?: number;
	rotationSpeed?: number;
	angularVelocity?: number; // radians per sec
	centerX?: number;
	barLength?: number;
	barThickness?: number;
	barGraphics?: Phaser.GameObjects.Graphics;
	glowGraphics?: Phaser.GameObjects.Graphics;
	// Wind Zone Properties
	windDirection?: number; // 1 for right, -1 for left
	windForce?: number;
	windZoneHeight?: number;
	windGraphics?: Phaser.GameObjects.Graphics;
	windArrows?: Phaser.GameObjects.Group;
	// Side Mover Properties
	moverUnits?: SideMoverUnit[];
	moverSize?: number;
	moverSpeed?: number;
	moverWait?: number;
	moverPadding?: number;
	// Hexagon Turret Properties
	turretRadius?: number;
	turretAngle?: number;
	turretAngularVelocity?: number;
	turretShootTimer?: number;
	turretShootInterval?: number;
	turretShotIndex?: number;
	turretGraphics?: Phaser.GameObjects.Graphics;
	turretGlowGraphics?: Phaser.GameObjects.Graphics;
	turretProjectiles?: HexProjectile[];
	turretProjectileSpeed?: number;
	turretProjectileLife?: number;
	// Magnet Core Properties
	magnetCenterX?: number;
	magnetInfluenceRadius?: number;
	magnetForce?: number;
	magnetPolarity?: number; // 1 pull, -1 push
	magnetPhaseTimer?: number;
	magnetPhaseDuration?: number;
	magnetCoreRadius?: number;
	magnetCore?: Phaser.GameObjects.Arc;
	magnetGlow?: Phaser.GameObjects.Arc;
	magnetRingA?: Phaser.GameObjects.Arc;
	magnetRingB?: Phaser.GameObjects.Arc;
	magnetArcs?: Phaser.GameObjects.Graphics;
	// Laser Grid Properties
	laserBandHeight?: number;
	laserThickness?: number;
	laserCycle?: number; // seconds per active beam
	laserOffDuration?: number; // all beams disabled window
	laserBeamUnits?: LaserBeamUnit[];
	// Pulse Ring Properties
	pulseCenterX?: number;
	pulseCurrentRadius?: number;
	pulseStartRadius?: number;
	pulseMaxRadius?: number;
	pulseSpeed?: number;
	pulseBandWidth?: number;
	pulseCore?: Phaser.GameObjects.Arc;
	pulseRing?: Phaser.GameObjects.Arc;
	pulseGlow?: Phaser.GameObjects.Arc;
	// Teleport Gate Properties
	teleportAX?: number;
	teleportBX?: number;
	teleportRadius?: number;
	teleportCooldownUntil?: number;
	teleportA?: Phaser.GameObjects.Arc;
	teleportB?: Phaser.GameObjects.Arc;
	teleportAGlow?: Phaser.GameObjects.Arc;
	teleportBGlow?: Phaser.GameObjects.Arc;
	teleportLink?: Phaser.GameObjects.Graphics;
	// Gravity Flip Zone Properties
	gravityZoneHeight?: number;
	gravityCurrentScale?: number;
	gravityTargetScale?: number;
	gravityScaleTimer?: number;
	gravityScaleInterval?: number;
	gravityZoneGraphics?: Phaser.GameObjects.Graphics;
	gravityWaveGraphics?: Phaser.GameObjects.Graphics;
};

type TailPoint = {
	x: number;
	y: number;
	life: number;
};

export default class Level extends Phaser.Scene {

	private ball!: Phaser.GameObjects.Arc;
	private ballGlow!: Phaser.GameObjects.Arc;
	private ballHalo!: Phaser.GameObjects.Arc;
	private floor!: Phaser.GameObjects.Rectangle;
	private floorGlow!: Phaser.GameObjects.Rectangle;
	private aimLine!: Phaser.GameObjects.Graphics;
	private aimArc!: Phaser.GameObjects.Graphics;
	private aimCenterArrow!: Phaser.GameObjects.Graphics;
	private scoreText!: Phaser.GameObjects.Text;
	private hintText!: Phaser.GameObjects.Text;
	private titleText!: Phaser.GameObjects.Text;
	private launchFx!: Phaser.GameObjects.Particles.ParticleEmitter;
	private trailFx!: Phaser.GameObjects.Particles.ParticleEmitter;
	private scanLines!: Phaser.GameObjects.Graphics;
	private sideLines!: Phaser.GameObjects.Graphics;
	private colliderDebug!: Phaser.GameObjects.Graphics;
	private tailRibbon!: Phaser.GameObjects.Graphics;
	private tailCore!: Phaser.GameObjects.Graphics;
	private lightningPickup?: Phaser.GameObjects.Container;
	private lightningPickupGlow?: Phaser.GameObjects.Arc;
	private lightningPickupBody?: Phaser.GameObjects.Graphics;
	private bgMusic?: Phaser.Sound.BaseSound;

	private barriers: Barrier[] = [];
	private worldWidth = 0;
	private worldHeight = 0;

	private ballRadius = 26;
	private trapHitboxScale = 0.72;
	private ballVx = 0;
	private ballVy = 0;
	private linearDrag = 1400;
	private minVelocity = 40;

	private floorY = 0;
	private floorRiseSpeed = 18;
	private gravity = 0;
	private score = 0;
	private isGameOver = false;
	private hasStarted = false;

	private gapWidth = 210;
	private barrierHeight = 28;
	private nextBarrierSpawnY = 0;
	private spawnAheadMin = 140;
	private spawnAheadMax = 420;
	private barrierSpacingMin = 190;
	private barrierSpacingMax = 300;
	private minLaunchPower = 260;
	private maxLaunchPower = 760;
	private launchCooldownMs = 250;
	private lastLaunchAt = -100000;
	private launchAngle = Phaser.Math.DegToRad(-90);
	private launchPower = 300;
	private aimDisplayBaseAngle = Phaser.Math.DegToRad(-90);
	private aimCenterPulse = 0;
	private aimRotationDirection = 1;
	private aimCharge = 0;
	private aimChargeRate = 0.34;
	private fullChargePulseCooldown = 0;
	private aimSweepSpeed = 2.35;
	private aimCenterAngle = Phaser.Math.DegToRad(-90);
	private aimMinAngle = Phaser.Math.DegToRad(-180);
	private aimMaxAngle = Phaser.Math.DegToRad(0);
	private cameraFollowLerp = 0.035;
	private cameraLead = 0.62;
	private sideLineInset = 8;
	private sidePeakDepth = 20;
	private sidePeakSpacing = 240;
	private showColliderDebug = false;
	private tailPoints: TailPoint[] = [];
	private tailLifetime = 0.42;
	private tailMinSampleDist = 8;
	private maxTailPoints = 36;
	private pickupRadius = 24;
	private nextPickupSpawnY = -1120;
	private boostedLaunches = 0;

	private readonly ballColor = 0x7df9ff;
	private readonly neonPink = 0xff2ea6;
	private readonly neonBlue = 0x00e5ff;
	private readonly neonPurple = 0x7b2cff;
	private readonly barrierColor = 0xffffff;
	private readonly floorColor = 0x2a0429;

	private startY = 0;
	private maxHeightScore = 0;
	private isGameStarted = false;
	private readonly launchBoost = 1.5;
	private readonly flightDistanceBoost = 1.31;
	private readonly onPointerDown = () => {
		if (!this.isGameStarted) return;

		this.ensureBgMusicPlaying();

		if (this.isGameOver) {
			return; // Handled by UI
		}

		this.launchBall();
	};

	constructor() {
		super("Level");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	/* START-USER-CODE */

	create() {
		this.isGameOver = false;
		this.hasStarted = false;
		this.score = 0;
		this.ballVx = 0;
		this.ballVy = 0;
		this.floorRiseSpeed = 18;
		this.barriers = [];
		this.launchAngle = Phaser.Math.DegToRad(-90);
		this.launchPower = this.minLaunchPower;
		this.lastLaunchAt = -100000;
		this.aimDisplayBaseAngle = Phaser.Math.DegToRad(-90);
		this.aimCenterPulse = 0;
		this.aimRotationDirection = 1;
		this.aimCharge = 0;
		this.fullChargePulseCooldown = 0;
		this.tailPoints = [];
		this.boostedLaunches = 0;
		this.nextPickupSpawnY = -1120;
		this.lightningPickup?.destroy();
		this.lightningPickup = undefined;
		this.lightningPickupGlow = undefined;
		this.lightningPickupBody = undefined;

		this.aimCenterAngle = Phaser.Math.DegToRad(-90);
		this.aimMinAngle = Phaser.Math.DegToRad(-180);
		this.aimMaxAngle = Phaser.Math.DegToRad(0);
		this.maxHeightScore = 0;

		this.worldWidth = this.scale.width;
		this.worldHeight = this.scale.height;
		this.cameras.main.setScroll(0, 0);
		this.cameras.main.setZoom(1);
		this.nextBarrierSpawnY = this.cameras.main.scrollY - this.spawnAheadMin;

		const centerX = this.cameras.main.centerX;
		const ballStartY = this.worldHeight - 150;
		this.startY = ballStartY;

		this.drawNeonBackground();

		this.floorY = this.worldHeight - 92;
		this.floorGlow = this.add.rectangle(
			this.worldWidth / 2,
			(this.floorY + this.worldHeight) / 2,
			this.worldWidth,
			this.worldHeight - this.floorY + 14,
			this.neonPink,
			0.26
		).setBlendMode(Phaser.BlendModes.ADD);

		this.floor = this.add.rectangle(
			this.worldWidth / 2,
			(this.floorY + this.worldHeight) / 2,
			this.worldWidth,
			this.worldHeight - this.floorY,
			this.floorColor
		);

		this.ballHalo = this.add.circle(centerX, ballStartY, this.ballRadius + 34, this.neonPink, 0.14)
			.setBlendMode(Phaser.BlendModes.ADD);
		this.ballGlow = this.add.circle(centerX, ballStartY, this.ballRadius + 18, this.neonBlue, 0.42)
			.setBlendMode(Phaser.BlendModes.ADD);
		this.ball = this.add.circle(centerX, ballStartY, this.ballRadius, this.ballColor);

		this.aimLine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
		this.aimArc = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
		this.aimCenterArrow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
		this.sideLines = this.add.graphics().setDepth(18);
		this.colliderDebug = this.add.graphics().setDepth(140);
		this.tailRibbon = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(24);
		this.tailCore = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(25);

		this.titleText = this.add.text(this.worldWidth / 2, 80, "NEON PUSH", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "64px",
			color: "#ffffff",
			fontStyle: "900",
			shadow: { blur: 0, color: "#2a2a30", fill: true, offsetX: 4, offsetY: 4 }
		}).setOrigin(0.5).setScrollFactor(0);

		this.scoreText = this.add.text(24, 24, "0", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "48px",
			color: "#ffffff",
			fontStyle: "900",
			shadow: { blur: 0, color: "#000000", fill: true, offsetX: 3, offsetY: 3 }
		}).setScrollFactor(0);

		this.hintText = this.add.text(this.worldWidth / 2, 160, "TAP TO SHOOT", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "20px",
			color: "#00f0ff", // Accent Primary
			fontStyle: "700"
		}).setOrigin(0.5).setScrollFactor(0);
		this.hintText.setVisible(false);

		this.ensureParticleTexture();
		this.launchFx = this.add.particles(0, 0, "neon-dot", {
			speed: { min: 140, max: 430 },
			lifespan: { min: 260, max: 600 },
			angle: { min: 0, max: 360 },
			scale: { start: 0.82, end: 0 },
			alpha: { start: 0.9, end: 0 },
			blendMode: Phaser.BlendModes.ADD,
			quantity: 0,
			tint: [this.neonBlue, this.neonPink, this.neonPurple]
		});
		this.trailFx = this.add.particles(0, 0, "neon-dot", {
			speed: { min: 26, max: 120 },
			lifespan: { min: 280, max: 620 },
			scale: { start: 0.9, end: 0 },
			alpha: { start: 0.88, end: 0 },
			blendMode: Phaser.BlendModes.ADD,
			frequency: 14,
			quantity: 2,
			emitting: false,
			tint: [this.neonBlue, this.neonPink, 0xeaffff]
		});

		this.input.off("pointerdown", this.onPointerDown, this);
		this.input.on("pointerdown", this.onPointerDown, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.input.off("pointerdown", this.onPointerDown, this);
		});

		this.fillBarriersAhead();
		this.ensureBgMusicPlaying();
		this.initUI();
		this.toggleMainMenu(true);
	}

	update(_: number, delta: number) {
		if (this.isGameOver) {
			return;
		}

		const dt = delta / 1000;

		this.updateNeonPulse();
		this.updateNeonTail(dt);
		this.updateAimIndicator(dt);
		this.updateUi();
		this.updateSideLines();
		this.drawColliderDebug();

		if (!this.hasStarted) {
			return;
		}

		this.updateBallPhysics(dt);
		this.updateCameraFollow();
		this.updateWorld(dt);
		this.checkCollisions();
	}

	private drawNeonBackground() {
		const gradient = this.add.graphics().setScrollFactor(0);
		const bands = 22;

		for (let i = 0; i < bands; i++) {
			const t = i / (bands - 1);
			const color = Phaser.Display.Color.Interpolate.ColorWithColor(
				Phaser.Display.Color.ValueToColor(0x070910),
				Phaser.Display.Color.ValueToColor(0x1b0633),
				100,
				Math.floor(t * 100)
			);
			const fill = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
			const y = t * this.worldHeight;
			gradient.fillStyle(fill, 1);
			gradient.fillRect(0, y, this.worldWidth, this.worldHeight / bands + 3);
		}

		const grid = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0);
		grid.lineStyle(1, this.neonBlue, 0.15);
		for (let x = 0; x <= this.worldWidth; x += 60) {
			grid.beginPath();
			grid.moveTo(x, 0);
			grid.lineTo(x, this.worldHeight);
			grid.strokePath();
		}
		for (let y = 0; y <= this.worldHeight; y += 70) {
			grid.beginPath();
			grid.moveTo(0, y);
			grid.lineTo(this.worldWidth, y);
			grid.strokePath();
		}

		this.scanLines = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0);
	}

	private updateNeonPulse() {
		const t = this.time.now * 0.001;
		const pulse = 1 + Math.sin(t * 5.2) * 0.07;

		this.ballGlow.x = this.ball.x;
		this.ballGlow.y = this.ball.y;
		this.ballGlow.setScale(pulse);
		this.ballGlow.alpha = 0.34 + (Math.sin(t * 9) + 1) * 0.12;
		this.ballHalo.x = this.ball.x;
		this.ballHalo.y = this.ball.y;
		this.ballHalo.setScale(1 + Math.sin(t * 4.1) * 0.1);
		this.ballHalo.alpha = 0.1 + (Math.sin(t * 6.7) + 1) * 0.06;

		this.floorGlow.alpha = 0.25 + (Math.sin(t * 3) + 1) * 0.14;
		this.titleText.setScale(1 + Math.sin(t * 2.8) * 0.03);

		this.scanLines.clear();
		this.scanLines.lineStyle(2, this.neonBlue, 0.13);
		const offset = (t * 80) % 34;
		for (let y = -34; y < this.worldHeight + 34; y += 34) {
			const lineY = y + offset;
			this.scanLines.beginPath();
			this.scanLines.moveTo(0, lineY);
			this.scanLines.lineTo(this.worldWidth, lineY);
			this.scanLines.strokePath();
		}
	}

	private updateSideLines() {
		const cam = this.cameras.main;
		const top = cam.scrollY - 220;
		const bottom = cam.scrollY + this.worldHeight + 220;
		const step = 8;

		this.sideLines.clear();
		this.sideLines.lineStyle(12, this.neonPink, 0.16);
		this.sideLines.beginPath();
		for (let y = top; y <= bottom; y += step) {
			const lx = this.getSideWallX(y, true);
			if (y === top) {
				this.sideLines.moveTo(lx, y);
			} else {
				this.sideLines.lineTo(lx, y);
			}
		}
		for (let y = top; y <= bottom; y += step) {
			const rx = this.getSideWallX(y, false);
			if (y === top) {
				this.sideLines.moveTo(rx, y);
			} else {
				this.sideLines.lineTo(rx, y);
			}
		}
		this.sideLines.strokePath();

		this.sideLines.lineStyle(4, this.neonPink, 0.95);
		this.sideLines.beginPath();
		for (let y = top; y <= bottom; y += step) {
			const lx = this.getSideWallX(y, true);
			if (y === top) {
				this.sideLines.moveTo(lx, y);
			} else {
				this.sideLines.lineTo(lx, y);
			}
		}
		for (let y = top; y <= bottom; y += step) {
			const rx = this.getSideWallX(y, false);
			if (y === top) {
				this.sideLines.moveTo(rx, y);
			} else {
				this.sideLines.lineTo(rx, y);
			}
		}
		this.sideLines.strokePath();
	}

	private getSideWallX(worldY: number, isLeft: boolean) {
		const offset = this.getSideWallOffset(worldY);
		if (isLeft) {
			return this.sideLineInset + offset;
		}
		return this.worldWidth - this.sideLineInset - offset;
	}

	private getSideWallOffset(worldY: number) {
		const segmentLen = this.getSideSegmentLength();
		const segmentIndex = Math.floor(worldY / segmentLen);
		const localY = ((worldY % segmentLen) + segmentLen) % segmentLen;
		const cyclePos = ((segmentIndex % 5) + 5) % 5;

		const activeTop = segmentLen * Phaser.Math.Linear(0.2, 0.35, this.hash01(segmentIndex, 17));
		const activeBottom = segmentLen * Phaser.Math.Linear(0.65, 0.82, this.hash01(segmentIndex, 31));
		if (localY <= activeTop || localY >= activeBottom) {
			return 0;
		}
		const activeLen = Math.max(1, activeBottom - activeTop);
		const normalizedY = (localY - activeTop) / activeLen;

		// 4 üçgen segmentten sonra 1 kare/dikdörtgen segment üret.
		if (cyclePos < 4) {
			const triangle = 1 - Math.abs(normalizedY * 2 - 1);
			const depthScale = Phaser.Math.Linear(2.8, 4.6, this.hash01(segmentIndex, 43));
			return triangle * this.sidePeakDepth * depthScale;
		}

		const shapeRoll = this.hash01(segmentIndex, 59);
		if (shapeRoll < 0.55) {
			return this.getSquareSideOffset(normalizedY, segmentIndex, segmentLen);
		}
		return this.getRectSideOffset(normalizedY, segmentIndex, segmentLen);
	}

	private getSideSegmentLength() {
		return this.sidePeakSpacing * 3;
	}

	private getSideSegmentIndex(worldY: number) {
		const segmentLen = this.getSideSegmentLength();
		return Math.floor(worldY / segmentLen);
	}

	private isSquareSideSegment(worldY: number) {
		const segmentIndex = this.getSideSegmentIndex(worldY);
		const cyclePos = ((segmentIndex % 5) + 5) % 5;
		if (cyclePos !== 4) return false;
		return this.hash01(segmentIndex, 59) < 0.55;
	}

	private getSquareSegmentAnchorY(worldY: number) {
		const segmentLen = this.getSideSegmentLength();
		const segmentIndex = this.getSideSegmentIndex(worldY);
		const cyclePos = ((segmentIndex % 5) + 5) % 5;
		if (cyclePos !== 4) {
			return null;
		}
		if (this.hash01(segmentIndex, 59) >= 0.55) {
			return null;
		}
		const activeTop = segmentLen * Phaser.Math.Linear(0.2, 0.35, this.hash01(segmentIndex, 17));
		const activeBottom = segmentLen * Phaser.Math.Linear(0.65, 0.82, this.hash01(segmentIndex, 31));
		const segmentStartY = segmentIndex * segmentLen;
		return segmentStartY + (activeTop + activeBottom) * 0.5;
	}

	private getSquareSideOffset(normalizedY: number, segmentIndex: number, segmentLen: number) {
		const depthScale = Phaser.Math.Linear(2.7, 3.8, this.hash01(segmentIndex, 67));
		const depth = this.sidePeakDepth * depthScale;
		const widthScale = Phaser.Math.Linear(4.6, 6.1, this.hash01(segmentIndex, 83));
		const span = Phaser.Math.Clamp((depth * widthScale) / segmentLen, 0.46, 0.78);
		const profile = this.sampleBlockProfile(normalizedY, 0.5, span, 0.08);
		return profile * depth;
	}

	private getRectSideOffset(normalizedY: number, segmentIndex: number, segmentLen: number) {
		const depthScale = Phaser.Math.Linear(2.6, 4.5, this.hash01(segmentIndex, 73));
		const depth = this.sidePeakDepth * depthScale;
		const widthScale = Phaser.Math.Linear(4.5, 6.5, this.hash01(segmentIndex, 79)); // Increased scale for wider/taller rects
		const span = Phaser.Math.Clamp((depth * widthScale) / segmentLen, 0.75, 0.98); // Increased min/max span
		const profile = this.sampleBlockProfile(normalizedY, 0.5, span, 0.06);
		return profile * depth;
	}

	private sampleBlockProfile(normalizedY: number, center: number, span: number, edgeRatio: number) {
		const clampedSpan = Phaser.Math.Clamp(span, 0.02, 0.95);
		const start = center - clampedSpan * 0.5;
		const end = center + clampedSpan * 0.5;
		if (normalizedY <= start || normalizedY >= end) {
			return 0;
		}

		const local = (normalizedY - start) / clampedSpan;
		const edge = Phaser.Math.Clamp(edgeRatio, 0.01, 0.48);
		if (local < edge) {
			return local / edge;
		}
		if (local > 1 - edge) {
			return (1 - local) / edge;
		}
		return 1;
	}

	private hash01(n: number, seed: number) {
		const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
		return x - Math.floor(x);
	}

	private aimSmoothCenterAngle = Phaser.Math.DegToRad(-90);

	private updateAimIndicator(dt: number) {
		const diff = Phaser.Math.Angle.Wrap(this.aimCenterAngle - this.aimSmoothCenterAngle);
		this.aimSmoothCenterAngle += diff * dt * 5.0;
		this.aimMinAngle = this.aimSmoothCenterAngle - Phaser.Math.DegToRad(90);
		this.aimMaxAngle = this.aimSmoothCenterAngle + Phaser.Math.DegToRad(90);

		this.aimCenterPulse = Math.max(0, this.aimCenterPulse - dt * 3.5);
		this.fullChargePulseCooldown = Math.max(0, this.fullChargePulseCooldown - dt);
		let nextAngle = this.aimDisplayBaseAngle + dt * this.aimSweepSpeed * this.aimRotationDirection;
		if (nextAngle <= this.aimMinAngle) {
			nextAngle = this.aimMinAngle;
			this.aimRotationDirection = 1;
		} else if (nextAngle >= this.aimMaxAngle) {
			nextAngle = this.aimMaxAngle;
			this.aimRotationDirection = -1;
		}
		this.aimDisplayBaseAngle = nextAngle;
		const angle = this.aimDisplayBaseAngle;
		this.aimCharge = Phaser.Math.Clamp(this.aimCharge + dt * this.aimChargeRate, 0, 1);
		const powerFill = this.boostedLaunches > 0 ? 1 : this.aimCharge;
		const power = Phaser.Math.Linear(this.minLaunchPower, this.maxLaunchPower, powerFill);
		const endX = this.ball.x + Math.cos(angle) * 170;
		const endY = this.ball.y + Math.sin(angle) * 170;
		const fillX = this.ball.x + (endX - this.ball.x) * powerFill;
		const fillY = this.ball.y + (endY - this.ball.y) * powerFill;

		this.aimLine.clear();
		this.drawTaperedBar(this.ball.x, this.ball.y, endX, endY, 16, 2.2, this.neonBlue, 0.14);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 24, 4, this.neonBlue, 0.24);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 13, 2.2, this.neonPink, 0.88);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 6, 1, 0xeaffff, 0.88);

		this.drawAimRangeArc();
		this.drawAimCenterArrow(angle, endX, endY, powerFill);
		if (powerFill >= 0.999 && this.fullChargePulseCooldown <= 0) {
			const tipX = endX + Math.cos(angle) * 10;
			const tipY = endY + Math.sin(angle) * 10;
			this.launchFx.explode(10, tipX, tipY);
			this.fullChargePulseCooldown = 0.16;
		}
		this.launchAngle = angle;
		this.launchPower = power;
	}

	private drawTaperedBar(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		startWidth: number,
		endWidth: number,
		color: number,
		alpha: number
	) {
		const segments = 12;
		for (let i = 0; i < segments; i++) {
			const t0 = i / segments;
			const t1 = (i + 1) / segments;
			const sx = Phaser.Math.Linear(x0, x1, t0);
			const sy = Phaser.Math.Linear(y0, y1, t0);
			const ex = Phaser.Math.Linear(x0, x1, t1);
			const ey = Phaser.Math.Linear(y0, y1, t1);
			const mid = (t0 + t1) * 0.5;
			const width = Phaser.Math.Linear(startWidth, endWidth, mid);
			const segmentAlpha = alpha * Phaser.Math.Linear(1, 0.65, mid);

			this.aimLine.lineStyle(width, color, segmentAlpha);
			this.aimLine.beginPath();
			this.aimLine.moveTo(sx, sy);
			this.aimLine.lineTo(ex, ey);
			this.aimLine.strokePath();
		}
	}

	private drawAimRangeArc() {
		const minAngle = this.aimMinAngle;
		const maxAngle = this.aimMaxAngle;
		const radius = 62;
		const segment = Phaser.Math.DegToRad(3);
		const gap = Phaser.Math.DegToRad(2);

		this.aimArc.clear();
		this.aimArc.lineStyle(14, this.neonPink, 0.16);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();

		this.aimArc.lineStyle(8, this.neonPink, 0.28);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();

		this.aimArc.lineStyle(5, this.neonPink, 0.9);
		for (let a = minAngle; a < maxAngle; a += segment + gap) {
			const a0 = a;
			const a1 = Math.min(a + segment, maxAngle);
			const x0 = this.ball.x + Math.cos(a0) * radius;
			const y0 = this.ball.y + Math.sin(a0) * radius;
			this.aimArc.beginPath();
			this.aimArc.moveTo(x0, y0);
			this.aimArc.arc(this.ball.x, this.ball.y, radius, a0, a1, false);
			this.aimArc.strokePath();
		}

		this.aimArc.lineStyle(10, this.neonPink, 0.2);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();


		// Draw top center arrow
		const centerAngle = this.aimSmoothCenterAngle;
		const tipDist = radius + 28;
		const baseDist = radius + 14;

		const tipX = this.ball.x + Math.cos(centerAngle) * tipDist;
		const tipY = this.ball.y + Math.sin(centerAngle) * tipDist;

		const baseCx = this.ball.x + Math.cos(centerAngle) * baseDist;
		const baseCy = this.ball.y + Math.sin(centerAngle) * baseDist;

		const perpX = Math.cos(centerAngle + Math.PI / 2) * 7;
		const perpY = Math.sin(centerAngle + Math.PI / 2) * 7;


		this.aimArc.fillStyle(this.neonPink, 1);
		this.aimArc.beginPath();
		this.aimArc.moveTo(tipX, tipY);
		this.aimArc.lineTo(baseCx + perpX, baseCy + perpY);
		this.aimArc.lineTo(baseCx - perpX, baseCy - perpY);
		this.aimArc.closePath();
		this.aimArc.fillPath();
	}

	private drawAimCenterArrow(angle: number, endX: number, endY: number, powerFill: number) {
		const pulse = 1 + this.aimCenterPulse * 0.35 + Math.sin(this.time.now * 0.012) * 0.08;
		const dirX = Math.cos(angle);
		const dirY = Math.sin(angle);
		const nx = -dirY;
		const ny = dirX;

		const headLen = 28 * pulse;
		const wing = 10 * pulse;
		const tipX = endX + dirX * 10;
		const tipY = endY + dirY * 10;
		const headBaseX = tipX - dirX * headLen;
		const headBaseY = tipY - dirY * headLen;
		const leftX = headBaseX + nx * wing;
		const leftY = headBaseY + ny * wing;
		const rightX = headBaseX - nx * wing;
		const rightY = headBaseY - ny * wing;

		const shaftStartX = this.ball.x + dirX * 16;
		const shaftStartY = this.ball.y + dirY * 16;
		const shaftEndX = headBaseX - dirX * 8;
		const shaftEndY = headBaseY - dirY * 8;
		const fillEndX = Phaser.Math.Linear(shaftStartX, shaftEndX, powerFill);
		const fillEndY = Phaser.Math.Linear(shaftStartY, shaftEndY, powerFill);

		this.aimCenterArrow.clear();

		// Always-visible transparent rotating arrow body.
		this.aimCenterArrow.lineStyle(14, this.neonBlue, 0.16);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(shaftEndX, shaftEndY);
		this.aimCenterArrow.strokePath();

		this.aimCenterArrow.lineStyle(6, 0xeaffff, 0.18);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(shaftEndX, shaftEndY);
		this.aimCenterArrow.strokePath();

		// Fill grows from start to end while arrow stays present.
		this.aimCenterArrow.lineStyle(10, this.neonPink, 0.42 + powerFill * 0.28);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(fillEndX, fillEndY);
		this.aimCenterArrow.strokePath();

		this.aimCenterArrow.lineStyle(4, 0xeaffff, 0.52 + powerFill * 0.36);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(fillEndX, fillEndY);
		this.aimCenterArrow.strokePath();

		// Transparent arrow head always visible.
		this.aimCenterArrow.fillStyle(this.neonBlue, 0.16);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.fillPath();

		this.aimCenterArrow.lineStyle(2, this.neonBlue, 0.46);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.strokePath();

		// Filled neon core on top.
		this.aimCenterArrow.fillStyle(0xeaffff, 0.2 + powerFill * 0.72);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.fillPath();

		if (powerFill >= 0.999) {
			const pulseT = (Math.sin(this.time.now * 0.02) + 1) * 0.5;
			const innerR = Phaser.Math.Linear(10, 18, pulseT);
			const outerR = innerR + Phaser.Math.Linear(8, 16, pulseT);
			const ringAlpha = Phaser.Math.Linear(0.62, 0.18, pulseT);

			this.aimCenterArrow.lineStyle(8, this.neonBlue, 0.22);
			this.aimCenterArrow.beginPath();
			this.aimCenterArrow.moveTo(shaftEndX, shaftEndY);
			this.aimCenterArrow.lineTo(tipX, tipY);
			this.aimCenterArrow.strokePath();

			this.aimCenterArrow.lineStyle(4, 0xeaffff, 0.64);
			this.aimCenterArrow.strokeCircle(tipX, tipY, innerR);

			this.aimCenterArrow.lineStyle(2, this.neonPink, ringAlpha);
			this.aimCenterArrow.strokeCircle(tipX, tipY, outerR);

			for (let i = 0; i < 6; i++) {
				const rayA = angle + i * (Math.PI / 3);
				const rayStart = outerR + 1;
				const rayLen = Phaser.Math.Linear(4, 12, pulseT);
				const rx0 = tipX + Math.cos(rayA) * rayStart;
				const ry0 = tipY + Math.sin(rayA) * rayStart;
				const rx1 = tipX + Math.cos(rayA) * (rayStart + rayLen);
				const ry1 = tipY + Math.sin(rayA) * (rayStart + rayLen);
				this.aimCenterArrow.lineStyle(2, 0xeaffff, 0.4 * (1 - pulseT) + 0.2);
				this.aimCenterArrow.beginPath();
				this.aimCenterArrow.moveTo(rx0, ry0);
				this.aimCenterArrow.lineTo(rx1, ry1);
				this.aimCenterArrow.strokePath();
			}
		}
	}

	private launchBall() {
		const now = this.time.now;
		if (now - this.lastLaunchAt < this.launchCooldownMs) {
			return;
		}

		const angle = this.launchAngle;
		const power = this.launchPower;
		if (!Number.isFinite(angle) || !Number.isFinite(power)) {
			return;
		}
		this.lastLaunchAt = now;
		const isChargedJump = this.boostedLaunches > 0 || power >= this.maxLaunchPower - 0.01;
		const launchPower = power * this.launchBoost * this.flightDistanceBoost;


		this.hasStarted = true;
		this.ballVx = Math.cos(angle) * launchPower;
		this.ballVy = Math.sin(angle) * launchPower;
		this.aimCenterPulse = 1;
		this.aimRotationDirection *= -1;
		this.aimCharge = 0;
		this.fullChargePulseCooldown = 0;
		if (this.boostedLaunches > 0) {
			this.boostedLaunches -= 1;
		}
		this.tailPoints = [];
		this.pushTailPoint(this.ball.x, this.ball.y);

		this.aimCenterAngle = angle;
		this.aimMinAngle = angle - Phaser.Math.DegToRad(90);
		this.aimMaxAngle = angle + Phaser.Math.DegToRad(90);

		this.hintText.setVisible(false);
		this.launchFx.explode(42, this.ball.x, this.ball.y);
		this.trailFx.startFollow(this.ball);
		this.trailFx.start();
		this.cameras.main.shake(90, 0.008);
		this.cameras.main.flash(100, 20, 255, 245, false);
		this.tweens.add({
			targets: this.cameras.main,
			zoom: 1.045,
			duration: 120,
			yoyo: true,
			ease: "Sine.easeOut"
		});

		if (isChargedJump) {
			this.playSfx("chargedjump");
			this.triggerHaptic("medium");
		} else {
			this.playSfx("jump");
			this.triggerHaptic("light");
		}
	}

	private updateNeonTail(dt: number) {
		if (this.tailPoints.length > 0) {
			for (const point of this.tailPoints) {
				point.life -= dt;
			}
			this.tailPoints = this.tailPoints.filter((point) => point.life > 0);
		}

		const speed = Math.hypot(this.ballVx, this.ballVy);
		const speedThreshold = this.minVelocity * 0.75;
		const hasSpeed = speed > speedThreshold;

		if (this.hasStarted && hasSpeed && !this.isGameOver) {
			const invSpeed = 1 / speed;
			const dirX = -this.ballVx * invSpeed;
			const dirY = -this.ballVy * invSpeed;
			const anchorX = this.ball.x + dirX * this.ballRadius * 0.55;
			const anchorY = this.ball.y + dirY * this.ballRadius * 0.55;
			this.pushTailPoint(anchorX, anchorY);
		}

		this.drawNeonTailLayer(this.tailRibbon, 0x11d4ff, 0.2, 1.8, speed);
		this.drawNeonTailLayer(this.tailCore, 0x72f8ff, 0.42, 1, speed);

		if (this.tailPoints.length >= 2) {
			const sparkleAlpha = Phaser.Math.Clamp(0.28 + speed / this.maxLaunchPower * 0.42, 0.2, 0.62);
			this.tailCore.lineStyle(2, 0xeaffff, sparkleAlpha);
			this.tailCore.beginPath();
			this.tailCore.moveTo(this.tailPoints[0].x, this.tailPoints[0].y);
			for (let i = 1; i < this.tailPoints.length; i++) {
				const point = this.tailPoints[i];
				this.tailCore.lineTo(point.x, point.y);
			}
			this.tailCore.strokePath();
		}
	}

	private pushTailPoint(x: number, y: number) {
		const head = this.tailPoints[0];
		if (!head) {
			this.tailPoints.unshift({ x, y, life: this.tailLifetime });
			return;
		}

		const dist = Phaser.Math.Distance.Between(x, y, head.x, head.y);
		if (dist >= this.tailMinSampleDist) {
			this.tailPoints.unshift({ x, y, life: this.tailLifetime });
			if (this.tailPoints.length > this.maxTailPoints) {
				this.tailPoints.pop();
			}
			return;
		}

		head.x = x;
		head.y = y;
		head.life = this.tailLifetime;
	}

	private drawNeonTailLayer(
		g: Phaser.GameObjects.Graphics,
		color: number,
		baseAlpha: number,
		widthScale: number,
		speed: number
	) {
		g.clear();
		if (this.tailPoints.length < 2) {
			return;
		}

		const count = this.tailPoints.length;
		const leftX: number[] = [];
		const leftY: number[] = [];
		const rightX: number[] = [];
		const rightY: number[] = [];
		const speedScale = Phaser.Math.Clamp(speed / this.maxLaunchPower, 0.5, 1.2);

		for (let i = 0; i < count; i++) {
			const point = this.tailPoints[i];
			const prev = this.tailPoints[Math.max(0, i - 1)];
			const next = this.tailPoints[Math.min(count - 1, i + 1)];
			let tx = prev.x - next.x;
			let ty = prev.y - next.y;
			if (tx === 0 && ty === 0) {
				tx = -this.ballVx;
				ty = -this.ballVy;
			}
			const len = Math.hypot(tx, ty) || 1;
			const nx = -ty / len;
			const ny = tx / len;
			const lifeT = Phaser.Math.Clamp(point.life / this.tailLifetime, 0, 1);
			const alongT = 1 - i / Math.max(1, count - 1);
			const width = (this.ballRadius * (0.12 + alongT * 0.95) * lifeT * speedScale + 2) * widthScale;

			leftX.push(point.x + nx * width);
			leftY.push(point.y + ny * width);
			rightX.push(point.x - nx * width);
			rightY.push(point.y - ny * width);
		}

		const alpha = Phaser.Math.Clamp(baseAlpha * (0.78 + speedScale * 0.42), 0, 1);
		g.fillStyle(color, alpha);
		g.beginPath();
		g.moveTo(leftX[0], leftY[0]);
		for (let i = 1; i < count; i++) {
			g.lineTo(leftX[i], leftY[i]);
		}
		for (let i = count - 1; i >= 0; i--) {
			g.lineTo(rightX[i], rightY[i]);
		}
		g.closePath();
		g.fillPath();
	}

	private updateBallPhysics(dt: number) {
		this.ballVy += this.gravity * dt;
		this.ball.x += this.ballVx * dt;
		this.ball.y += this.ballVy * dt;
		const speed = Math.hypot(this.ballVx, this.ballVy);
		if (speed > 0) {
			const nextSpeed = Math.max(0, speed - this.linearDrag * dt);
			if (nextSpeed <= this.minVelocity) {
				this.ballVx = 0;
				this.ballVy = 0;
			} else {
				const ratio = nextSpeed / speed;
				this.ballVx *= ratio;
				this.ballVy *= ratio;
			}
		}

		const leftWallX = this.getSideWallX(this.ball.y, true);
		const rightWallX = this.getSideWallX(this.ball.y, false);

		if (this.ball.x - this.ballRadius < leftWallX) {
			this.endGame();
			return;
		}

		if (this.ball.x + this.ballRadius > rightWallX) {
			this.endGame();
			return;
		}

	}

	private updateWorld(dt: number) {
		this.floorY -= this.floorRiseSpeed * dt;
		this.floorRiseSpeed += 2.2 * dt;

		this.maxHeightScore = Math.max(this.maxHeightScore, Math.floor(this.startY - this.ball.y));

		this.floor.y = (this.floorY + this.worldHeight) / 2;
		this.floor.height = this.worldHeight - this.floorY;

		this.floorGlow.y = this.floor.y;
		this.floorGlow.height = this.floor.height + 14;
		this.fillBarriersAhead();
		this.updateLightningPickup(dt);

		for (const barrier of this.barriers) {
			if (barrier.type === 'STATIC_GAP') {
				this.updateStaticBarrierVisuals(barrier);
			} else if (barrier.type === 'ROTATING_BAR') {
				this.updateRotatingTrap(barrier, dt);
			} else if (barrier.type === 'SIDE_WIND_ZONE') {
				this.updateWindZone(barrier, dt);
				// Check overlap and apply force is done inside updateWindZone to keep updateWorld clean, 
				// or we can do it here. Let's do it here for physics clarity.
				if (barrier.windZoneHeight) {
					const zoneTop = barrier.y - barrier.windZoneHeight / 2;
					const zoneBottom = barrier.y + barrier.windZoneHeight / 2;
					if (this.ball.y > zoneTop && this.ball.y < zoneBottom) {
						// Apply wind force
						this.ballVx += (barrier.windForce || 0) * dt;
					}
				}
			} else if (barrier.type === 'SIDE_MOVER') {
				this.updateSideMover(barrier, dt);
			} else if (barrier.type === 'HEXAGON_TURRET') {
				this.updateHexagonTurret(barrier, dt);
			} else if (barrier.type === 'MAGNET_CORE') {
				this.updateMagnetCore(barrier, dt);
			} else if (barrier.type === 'LASER_GRID') {
				this.updateLaserGrid(barrier, dt);
			} else if (barrier.type === 'PULSE_RING') {
				this.updatePulseRing(barrier, dt);
			} else if (barrier.type === 'TELEPORT_GATE') {
				this.updateTeleportGate(barrier, dt);
			} else if (barrier.type === 'GRAVITY_FLIP_ZONE') {
				this.updateGravityFlipZone(barrier, dt);
			}

			if (!barrier.passed) {
				let passedThreshold = barrier.y;
				if (barrier.type === 'ROTATING_BAR') {
					const radius = (barrier.barLength || 0) / 2;
					passedThreshold = barrier.y - radius - this.ballRadius;
				} else if (barrier.type === 'SIDE_WIND_ZONE') {
					passedThreshold = barrier.y - (barrier.windZoneHeight || 0) / 2 - this.ballRadius;
				} else if (barrier.type === 'HEXAGON_TURRET') {
					passedThreshold = barrier.y - (barrier.turretRadius || 56) - this.ballRadius;
				} else if (barrier.type === 'MAGNET_CORE') {
					passedThreshold = barrier.y - (barrier.magnetInfluenceRadius || 220) - this.ballRadius;
				} else if (barrier.type === 'LASER_GRID') {
					passedThreshold = barrier.y - (barrier.laserBandHeight || 220) * 0.5 - this.ballRadius;
				} else if (barrier.type === 'PULSE_RING') {
					passedThreshold = barrier.y - (barrier.pulseMaxRadius || 220) - this.ballRadius;
				} else if (barrier.type === 'TELEPORT_GATE') {
					passedThreshold = barrier.y - (barrier.teleportRadius || 34) - this.ballRadius;
				} else if (barrier.type === 'GRAVITY_FLIP_ZONE') {
					passedThreshold = barrier.y - (barrier.gravityZoneHeight || 260) * 0.5 - this.ballRadius;
				} else {
					passedThreshold = barrier.y + this.ballRadius;
				}

				if (this.ball.y < passedThreshold) {
					barrier.passed = true;
					// Score is now height-based, no increment here
					this.launchFx.explode(22, this.ball.x, this.ball.y);
					this.cameras.main.flash(60, 255, 46, 166, false);
				}
			}
		}

		this.barriers = this.barriers.filter((barrier) => {
			const passedFarBelow = barrier.y > this.cameras.main.scrollY + this.worldHeight + 180;
			if (passedFarBelow) {
				this.destroyBarrier(barrier);
			}
			return !passedFarBelow;
		});
	}

	private updateLightningPickup(_: number) {
		if (!this.lightningPickup) {
			const topY = this.cameras.main.scrollY;
			if (topY <= this.nextPickupSpawnY) {
				this.spawnLightningPickup(topY);
			}
			return;
		}

		const t = this.time.now * 0.001;
		const bob = Math.sin(t * 3.4) * 8;
		this.lightningPickup.y += (this.lightningPickup.getData("baseY") + bob - this.lightningPickup.y) * 0.22;
		if (this.lightningPickupGlow) {
			this.lightningPickupGlow.alpha = 0.34 + (Math.sin(t * 8.3) + 1) * 0.18;
			this.lightningPickupGlow.setScale(1 + Math.sin(t * 6.1) * 0.08);
		}
		if (this.lightningPickupBody) {
			this.lightningPickupBody.rotation = Math.sin(t * 2.7) * 0.1;
		}
	}

	private spawnLightningPickup(topY: number) {
		const y = topY - Phaser.Math.Between(220, 560);
		let left = this.getSideWallX(y, true) + 80;
		let right = this.getSideWallX(y, false) - 80;
		if (left >= right) {
			const mid = (left + right) * 0.5;
			left = mid - 24;
			right = mid + 24;
		}
		const x = Phaser.Math.Between(left, right);

		const container = this.add.container(x, y).setDepth(34);
		container.setData("baseY", y);

		const glow = this.add.circle(0, 0, this.pickupRadius + 18, 0xffea00, 0.42)
			.setBlendMode(Phaser.BlendModes.ADD);
		const core = this.add.circle(0, 0, this.pickupRadius, 0xffd200, 0.95)
			.setStrokeStyle(3, 0xfff59a, 1);
		const bolt = this.add.graphics();
		bolt.fillStyle(0xfff8cf, 1);
		bolt.beginPath();
		bolt.moveTo(-7, -16);
		bolt.lineTo(6, -16);
		bolt.lineTo(-1, -2);
		bolt.lineTo(8, -2);
		bolt.lineTo(-8, 17);
		bolt.lineTo(-2, 4);
		bolt.lineTo(-10, 4);
		bolt.closePath();
		bolt.fillPath();

		container.add([glow, core, bolt]);
		this.lightningPickup = container;
		this.lightningPickupGlow = glow;
		this.lightningPickupBody = bolt;
	}

	private collectLightningPickup() {
		if (!this.lightningPickup) return;
		const x = this.lightningPickup.x;
		const y = this.lightningPickup.y;
		this.lightningPickup.destroy();
		this.lightningPickup = undefined;
		this.lightningPickupGlow = undefined;
		this.lightningPickupBody = undefined;
		this.boostedLaunches += 3;
		this.nextPickupSpawnY = y - Phaser.Math.Between(1520, 2600);
		this.launchFx.explode(52, x, y);
		this.cameras.main.flash(90, 255, 235, 40, false);
		this.playSfx("chargedbuff");
		this.triggerHaptic("success");
	}

	private updateStaticBarrierVisuals(barrier: Barrier) {
		if (!barrier.left || !barrier.right) return;
		barrier.left.y = barrier.y;
		barrier.right.y = barrier.y;

		if (barrier.leftGlow && barrier.rightGlow) {
			barrier.leftGlow.y = barrier.left.y;
			barrier.rightGlow.y = barrier.right.y;
			barrier.leftGlow.alpha = 0.22 + Math.max(0, Math.sin(this.time.now * 0.01 + barrier.y * 0.02)) * 0.35;
			barrier.rightGlow.alpha = 0.22 + Math.max(0, Math.sin(this.time.now * 0.01 + barrier.y * 0.02 + 1.3)) * 0.35;
		}
	}

	private updateRotatingTrap(barrier: Barrier, dt: number) {
		if (!barrier.barGraphics || !barrier.glowGraphics) return;

		barrier.angle = (barrier.angle || 0) + (barrier.angularVelocity || 0) * dt;

		const rotation = barrier.angle;
		barrier.barGraphics.setRotation(rotation);
		barrier.glowGraphics.setRotation(rotation);

		barrier.barGraphics.y = barrier.y;
		barrier.glowGraphics.y = barrier.y;

		const pulse = 1 + Math.sin(this.time.now * 0.008 + barrier.y) * 0.1;
		barrier.glowGraphics.setScale(pulse);
		barrier.glowGraphics.alpha = 0.8 + Math.sin(this.time.now * 0.015) * 0.2;
	}

	private destroyBarrier(barrier: Barrier) {
		barrier.left?.destroy();
		barrier.right?.destroy();
		barrier.leftGlow?.destroy();
		barrier.rightGlow?.destroy();
		barrier.barGraphics?.destroy();
		barrier.glowGraphics?.destroy();
		barrier.windGraphics?.destroy();
		barrier.windArrows?.destroy(true, true);
		if (barrier.moverUnits) {
			for (const unit of barrier.moverUnits) {
				unit.square.destroy();
				unit.glow.destroy();
			}
		}
		barrier.turretGraphics?.destroy();
		barrier.turretGlowGraphics?.destroy();
		if (barrier.turretProjectiles) {
			for (const projectile of barrier.turretProjectiles) {
				projectile.body.destroy();
				projectile.glow.destroy();
			}
		}
		barrier.magnetCore?.destroy();
		barrier.magnetGlow?.destroy();
		barrier.magnetRingA?.destroy();
		barrier.magnetRingB?.destroy();
		barrier.magnetArcs?.destroy();
		if (barrier.laserBeamUnits) {
			for (const beam of barrier.laserBeamUnits) {
				beam.beam.destroy();
				beam.glow.destroy();
			}
		}
		barrier.pulseCore?.destroy();
		barrier.pulseRing?.destroy();
		barrier.pulseGlow?.destroy();
		barrier.teleportA?.destroy();
		barrier.teleportB?.destroy();
		barrier.teleportAGlow?.destroy();
		barrier.teleportBGlow?.destroy();
		barrier.teleportLink?.destroy();
		barrier.gravityZoneGraphics?.destroy();
		barrier.gravityWaveGraphics?.destroy();
	}

	private fillBarriersAhead() {
		const topY = this.cameras.main.scrollY;
		const spawnEndY = topY - this.spawnAheadMax;
		while (this.nextBarrierSpawnY >= spawnEndY) {
			this.spawnBarrier(this.nextBarrierSpawnY);
			this.nextBarrierSpawnY -= Phaser.Math.Between(this.barrierSpacingMin, this.barrierSpacingMax);
		}
	}

	private spawnBarrier(spawnY: number) {
		this.spawnRandomTrap(spawnY);
		this.trySpawnSideMover(spawnY);
	}

	private trySpawnSideMover(spawnY: number) {
		const anchorY = this.getSquareSegmentAnchorY(spawnY);
		if (anchorY === null) {
			return;
		}
		if (Math.random() > 0.5) {
			return;
		}
		const spawnDouble = Math.random() < 0.25;
		this.spawnSideMover(anchorY, spawnDouble);
	}

	private spawnRandomTrap(spawnY: number) {
		const rand = Math.random();
		let trapType: TrapType;
		if (rand < 0.2) {
			trapType = 'STATIC_GAP';
		} else if (rand < 0.34) {
			trapType = 'ROTATING_BAR';
		} else if (rand < 0.46) {
			trapType = 'SIDE_WIND_ZONE';
		} else if (rand < 0.56) {
			trapType = 'HEXAGON_TURRET';
		} else if (rand < 0.66) {
			trapType = 'MAGNET_CORE';
		} else if (rand < 0.78) {
			trapType = 'LASER_GRID';
		} else if (rand < 0.88) {
			trapType = 'PULSE_RING';
		} else if (rand < 0.95) {
			trapType = 'TELEPORT_GATE';
		} else {
			trapType = 'GRAVITY_FLIP_ZONE';
		}

		let heightReserved = 0;

		if (trapType === 'STATIC_GAP') {
			this.spawnStaticBarrier(spawnY);
			heightReserved = Phaser.Math.Between(this.barrierSpacingMin, this.barrierSpacingMax);
		} else if (trapType === 'ROTATING_BAR') {
			// Rotating bar variations
			const variation = Phaser.Math.RND.integerInRange(0, 2);

			if (variation === 0) {
				this.spawnRotatingBar(spawnY, this.worldWidth / 2);
				heightReserved = Phaser.Math.Between(380, 460);
			} else {
				const gap = 320;
				const isRightFirst = variation === 2;
				const x1 = isRightFirst ? this.worldWidth * 0.75 : this.worldWidth * 0.25;
				const x2 = isRightFirst ? this.worldWidth * 0.25 : this.worldWidth * 0.75;

				this.spawnRotatingBar(spawnY, x1);
				this.spawnRotatingBar(spawnY - gap, x2);

				heightReserved = gap + Phaser.Math.Between(380, 460);
				spawnY -= gap;
			}
		} else if (trapType === 'SIDE_WIND_ZONE') {
			this.spawnWindZone(spawnY);
			heightReserved = Phaser.Math.Between(400, 500);
		} else if (trapType === 'HEXAGON_TURRET') {
			this.spawnHexagonTurret(spawnY);
			heightReserved = Phaser.Math.Between(360, 520);
		} else if (trapType === 'MAGNET_CORE') {
			this.spawnMagnetCore(spawnY);
			heightReserved = Phaser.Math.Between(430, 560);
		} else if (trapType === 'LASER_GRID') {
			this.spawnLaserGrid(spawnY);
			heightReserved = Phaser.Math.Between(430, 550);
		} else if (trapType === 'PULSE_RING') {
			this.spawnPulseRing(spawnY);
			heightReserved = Phaser.Math.Between(400, 520);
		} else if (trapType === 'TELEPORT_GATE') {
			this.spawnTeleportGate(spawnY);
			heightReserved = Phaser.Math.Between(420, 540);
		} else if (trapType === 'GRAVITY_FLIP_ZONE') {
			this.spawnGravityFlipZone(spawnY);
			heightReserved = Phaser.Math.Between(420, 560);
		}

		this.nextBarrierSpawnY = spawnY - heightReserved;
	}

	private spawnHexagonTurret(spawnY: number) {
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const margin = 96;
		const safeLeft = leftWall + margin;
		const safeRight = rightWall - margin;
		const centerX = safeLeft < safeRight
			? Phaser.Math.Between(safeLeft, safeRight)
			: (leftWall + rightWall) * 0.5;
		const radius = 52;
		const turretAngle = Math.random() * Math.PI * 2;
		const turretAngularVelocity = Phaser.Math.FloatBetween(0.45, 0.95) * (Math.random() > 0.5 ? 1 : -1);

		const glow = this.add.graphics()
			.setDepth(26)
			.setBlendMode(Phaser.BlendModes.ADD);
		glow.x = centerX;
		glow.y = spawnY;
		const body = this.add.graphics().setDepth(32);
		body.x = centerX;
		body.y = spawnY;

		this.drawHexagonTurret(glow, body, radius);

		this.barriers.push({
			type: 'HEXAGON_TURRET',
			y: spawnY,
			passed: false,
			centerX,
			turretRadius: radius,
			turretAngle,
			turretAngularVelocity,
			turretShootTimer: Phaser.Math.FloatBetween(0.35, 0.9),
			turretShootInterval: Phaser.Math.FloatBetween(0.7, 1.05),
			turretShotIndex: Phaser.Math.Between(0, 5),
			turretGraphics: body,
			turretGlowGraphics: glow,
			turretProjectiles: [],
			turretProjectileSpeed: Phaser.Math.Between(160, 220),
			turretProjectileLife: Phaser.Math.FloatBetween(1.7, 2.35)
		});
	}

	private drawHexagonTurret(
		glowGraphics: Phaser.GameObjects.Graphics,
		bodyGraphics: Phaser.GameObjects.Graphics,
		radius: number
	) {
		glowGraphics.clear();
		glowGraphics.fillStyle(this.neonBlue, 0.22);
		glowGraphics.beginPath();
		this.traceRegularPolygonPath(glowGraphics, 0, 0, radius + 18, 6);
		glowGraphics.closePath();
		glowGraphics.fillPath();

		glowGraphics.lineStyle(8, this.neonPink, 0.3);
		glowGraphics.beginPath();
		this.traceRegularPolygonPath(glowGraphics, 0, 0, radius + 8, 6);
		glowGraphics.closePath();
		glowGraphics.strokePath();

		bodyGraphics.clear();
		bodyGraphics.fillStyle(0xd8fcff, 0.94);
		bodyGraphics.beginPath();
		this.traceRegularPolygonPath(bodyGraphics, 0, 0, radius, 6);
		bodyGraphics.closePath();
		bodyGraphics.fillPath();

		bodyGraphics.lineStyle(3, this.neonPink, 0.95);
		bodyGraphics.beginPath();
		this.traceRegularPolygonPath(bodyGraphics, 0, 0, radius, 6);
		bodyGraphics.closePath();
		bodyGraphics.strokePath();

		bodyGraphics.fillStyle(0xffffff, 0.95);
		bodyGraphics.fillCircle(0, 0, radius * 0.36);
		bodyGraphics.lineStyle(2, this.neonBlue, 0.9);
		bodyGraphics.strokeCircle(0, 0, radius * 0.36);
	}

	private traceRegularPolygonPath(
		g: Phaser.GameObjects.Graphics,
		cx: number,
		cy: number,
		radius: number,
		sides: number
	) {
		for (let i = 0; i < sides; i++) {
			const angle = -Math.PI / 2 + (i / sides) * Math.PI * 2;
			const px = cx + Math.cos(angle) * radius;
			const py = cy + Math.sin(angle) * radius;
			if (i === 0) {
				g.moveTo(px, py);
			} else {
				g.lineTo(px, py);
			}
		}
	}

	private updateHexagonTurret(barrier: Barrier, dt: number) {
		if (
			barrier.centerX === undefined ||
			barrier.turretRadius === undefined ||
			barrier.turretAngle === undefined ||
			barrier.turretAngularVelocity === undefined ||
			!barrier.turretGraphics ||
			!barrier.turretGlowGraphics ||
			!barrier.turretProjectiles
		) {
			return;
		}

		barrier.turretAngle += barrier.turretAngularVelocity * dt;
		barrier.turretGraphics.x = barrier.centerX;
		barrier.turretGraphics.y = barrier.y;
		barrier.turretGraphics.rotation = barrier.turretAngle;
		barrier.turretGlowGraphics.x = barrier.centerX;
		barrier.turretGlowGraphics.y = barrier.y;
		barrier.turretGlowGraphics.rotation = barrier.turretAngle;

		const pulse = 1 + Math.sin(this.time.now * 0.008 + barrier.y * 0.04) * 0.12;
		barrier.turretGlowGraphics.setScale(pulse);
		barrier.turretGlowGraphics.alpha = 0.56 + Math.sin(this.time.now * 0.015) * 0.18;

		barrier.turretShootTimer = (barrier.turretShootTimer || 0) - dt;
		if (barrier.turretShootTimer <= 0) {
			this.fireHexTurretProjectile(barrier);
			const baseInterval = barrier.turretShootInterval || 0.85;
			barrier.turretShootTimer = Phaser.Math.Clamp(baseInterval + Phaser.Math.FloatBetween(-0.12, 0.15), 0.55, 1.2);
		}

		for (let i = barrier.turretProjectiles.length - 1; i >= 0; i--) {
			const projectile = barrier.turretProjectiles[i];
			if (!projectile.active) {
				barrier.turretProjectiles.splice(i, 1);
				continue;
			}

			projectile.life -= dt;
			projectile.x += projectile.vx * dt;
			projectile.y += projectile.vy * dt;

			projectile.body.x = projectile.x;
			projectile.body.y = projectile.y;
			projectile.body.rotation += projectile.spin * dt;
			projectile.glow.x = projectile.x;
			projectile.glow.y = projectile.y;
			projectile.glow.rotation = projectile.body.rotation;

			const lifeT = Phaser.Math.Clamp(projectile.life / projectile.maxLife, 0, 1);
			projectile.glow.alpha = 0.24 + lifeT * 0.5;
			projectile.body.alpha = 0.5 + lifeT * 0.5;
			const glowScale = 0.9 + (1 - lifeT) * 0.35;
			projectile.glow.setScale(glowScale);

			const isOffscreen =
				projectile.y > this.cameras.main.scrollY + this.worldHeight + 260 ||
				projectile.y < this.cameras.main.scrollY - 260 ||
				projectile.x < -220 ||
				projectile.x > this.worldWidth + 220;

			if (projectile.life <= 0 || isOffscreen) {
				this.destroyHexProjectile(projectile);
				barrier.turretProjectiles.splice(i, 1);
			}
		}
	}

	private fireHexTurretProjectile(barrier: Barrier) {
		if (
			barrier.centerX === undefined ||
			barrier.turretRadius === undefined ||
			barrier.turretAngle === undefined ||
			!barrier.turretProjectiles
		) {
			return;
		}

		const shotIndex = (barrier.turretShotIndex || 0) % 6;
		const shootAngle = barrier.turretAngle + shotIndex * (Math.PI / 3);
		const spawnDist = barrier.turretRadius + 18;
		const speed = barrier.turretProjectileSpeed || 190;
		const life = barrier.turretProjectileLife || 2.0;
		const size = 18;
		const x = barrier.centerX + Math.cos(shootAngle) * spawnDist;
		const y = barrier.y + Math.sin(shootAngle) * spawnDist;
		const vx = Math.cos(shootAngle) * speed;
		const vy = Math.sin(shootAngle) * speed;

		const glow = this.add.rectangle(x, y, size + 14, size + 14, this.neonBlue, 0.52)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(28);
		const body = this.add.rectangle(x, y, size, size, 0xe9fdff, 1)
			.setStrokeStyle(2, this.neonPink, 0.98)
			.setDepth(33);
		body.rotation = shootAngle + Math.PI / 4;
		glow.rotation = body.rotation;

		const projectile: HexProjectile = {
			x,
			y,
			vx,
			vy,
			life,
			maxLife: life,
			size,
			spin: Phaser.Math.FloatBetween(-2.4, 2.4),
			active: true,
			body,
			glow
		};
		barrier.turretProjectiles.push(projectile);
		barrier.turretShotIndex = (shotIndex + 1) % 6;
	}

	private destroyHexProjectile(projectile: HexProjectile) {
		if (!projectile.active) return;
		projectile.active = false;

		const x = projectile.x;
		const y = projectile.y;
		projectile.body.disableInteractive();
		projectile.glow.disableInteractive();

		this.launchFx.explode(8, x, y);
		const fadeTargets = [projectile.body, projectile.glow];
		this.tweens.add({
			targets: fadeTargets,
			scaleX: 1.9,
			scaleY: 1.9,
			alpha: 0,
			duration: 180,
			ease: "Cubic.easeOut",
			onComplete: () => {
				projectile.body.destroy();
				projectile.glow.destroy();
			}
		});
	}

	private spawnMagnetCore(spawnY: number) {
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const influenceRadius = Phaser.Math.Between(210, 280);
		const coreRadius = Phaser.Math.Between(24, 31);
		const sidePadding = Math.min(130, influenceRadius * 0.38);
		const safeLeft = leftWall + sidePadding;
		const safeRight = rightWall - sidePadding;
		const centerX = safeLeft < safeRight
			? Phaser.Math.Between(safeLeft, safeRight)
			: (leftWall + rightWall) * 0.5;

		const glow = this.add.circle(centerX, spawnY, influenceRadius * 0.62, this.neonBlue, 0.11)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(22);
		const ringA = this.add.circle(centerX, spawnY, influenceRadius * 0.72, this.neonBlue, 0)
			.setStrokeStyle(5, this.neonBlue, 0.46)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(26);
		const ringB = this.add.circle(centerX, spawnY, influenceRadius * 0.44, this.neonPink, 0)
			.setStrokeStyle(4, this.neonPink, 0.62)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(27);
		const core = this.add.circle(centerX, spawnY, coreRadius, 0xe8fdff, 1)
			.setStrokeStyle(3, this.neonPink, 0.95)
			.setDepth(34);
		const arcs = this.add.graphics()
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(29);

		this.barriers.push({
			type: 'MAGNET_CORE',
			y: spawnY,
			passed: false,
			magnetCenterX: centerX,
			magnetInfluenceRadius: influenceRadius,
			magnetCoreRadius: coreRadius,
			magnetForce: Phaser.Math.Between(1400, 1950),
			magnetPolarity: Math.random() > 0.5 ? 1 : -1,
			magnetPhaseDuration: Phaser.Math.FloatBetween(1.45, 2.1),
			magnetPhaseTimer: Phaser.Math.FloatBetween(0.4, 1.1),
			magnetCore: core,
			magnetGlow: glow,
			magnetRingA: ringA,
			magnetRingB: ringB,
			magnetArcs: arcs
		});
	}

	private updateMagnetCore(barrier: Barrier, dt: number) {
		if (
			barrier.magnetCenterX === undefined ||
			barrier.magnetInfluenceRadius === undefined ||
			barrier.magnetCoreRadius === undefined ||
			barrier.magnetForce === undefined ||
			barrier.magnetPolarity === undefined ||
			barrier.magnetPhaseDuration === undefined ||
			barrier.magnetPhaseTimer === undefined ||
			!barrier.magnetCore ||
			!barrier.magnetGlow ||
			!barrier.magnetRingA ||
			!barrier.magnetRingB ||
			!barrier.magnetArcs
		) {
			return;
		}

		const cx = barrier.magnetCenterX;
		const cy = barrier.y;
		const polarityColor = barrier.magnetPolarity === 1 ? this.neonBlue : this.neonPink;
		const altColor = barrier.magnetPolarity === 1 ? this.neonPink : this.neonBlue;

		barrier.magnetPhaseTimer -= dt;
		if (barrier.magnetPhaseTimer <= 0) {
			barrier.magnetPolarity *= -1;
			barrier.magnetPhaseDuration = Phaser.Math.FloatBetween(1.4, 2.15);
			barrier.magnetPhaseTimer = barrier.magnetPhaseDuration;
			this.launchFx.explode(26, cx, cy);
			this.cameras.main.flash(55, 110, 230, 255, false);
		}

		const phaseT = Phaser.Math.Clamp(barrier.magnetPhaseTimer / barrier.magnetPhaseDuration, 0, 1);
		const t = this.time.now * 0.001;
		const pulse = 1 + Math.sin(t * 7.6 + cy * 0.02) * 0.07;
		const surge = 0.5 + Math.sin(t * 12.0 + (1 - phaseT) * Math.PI * 2) * 0.5;

		barrier.magnetCore.x = cx;
		barrier.magnetCore.y = cy;
		barrier.magnetGlow.x = cx;
		barrier.magnetGlow.y = cy;
		barrier.magnetRingA.x = cx;
		barrier.magnetRingA.y = cy;
		barrier.magnetRingB.x = cx;
		barrier.magnetRingB.y = cy;

		barrier.magnetCore.setFillStyle(0xefffff, 0.9);
		barrier.magnetCore.setStrokeStyle(3, polarityColor, 0.95);
		barrier.magnetCore.setScale(pulse * (0.92 + surge * 0.14));
		barrier.magnetGlow.setFillStyle(polarityColor, 0.08 + surge * 0.08);
		barrier.magnetGlow.setScale(0.95 + surge * 0.18);

		barrier.magnetRingA.setStrokeStyle(5, polarityColor, 0.42 + surge * 0.32);
		barrier.magnetRingA.rotation += dt * 0.65;
		barrier.magnetRingA.setScale(0.95 + (1 - phaseT) * 0.08);
		barrier.magnetRingB.setStrokeStyle(4, altColor, 0.45 + (1 - surge) * 0.28);
		barrier.magnetRingB.rotation -= dt * 1.15;
		barrier.magnetRingB.setScale(0.88 + surge * 0.14);

		const arcs = barrier.magnetArcs;
		arcs.clear();
		const influenceRadius = barrier.magnetInfluenceRadius;
		for (let i = 0; i < 6; i++) {
			const baseAngle = t * (barrier.magnetPolarity === 1 ? 1.5 : -1.7) + (Math.PI * 2 * i) / 6;
			const endAngle = baseAngle + Math.sin(t * 4 + i) * 0.22;
			const startR = barrier.magnetCoreRadius + 8;
			const endR = influenceRadius * Phaser.Math.Linear(0.56, 0.95, (i + surge) / 6);
			const segments = 6;
			arcs.lineStyle(2.2, polarityColor, 0.18 + surge * 0.3);
			arcs.beginPath();
			for (let s = 0; s <= segments; s++) {
				const segT = s / segments;
				const a = Phaser.Math.Linear(baseAngle, endAngle, segT) + Math.sin(t * 9 + i * 1.7 + s) * 0.08;
				const r = Phaser.Math.Linear(startR, endR, segT) + Math.sin(t * 12 + i * 2.4 + s * 0.6) * 7;
				const px = cx + Math.cos(a) * r;
				const py = cy + Math.sin(a) * r;
				if (s === 0) {
					arcs.moveTo(px, py);
				} else {
					arcs.lineTo(px, py);
				}
			}
			arcs.strokePath();
		}

		const dx = cx - this.ball.x;
		const dy = cy - this.ball.y;
		const dist = Math.hypot(dx, dy);
		if (dist > 1 && dist < influenceRadius) {
			const nx = dx / dist;
			const ny = dy / dist;
			const falloff = Phaser.Math.Clamp(1 - dist / influenceRadius, 0, 1);
			const strength = (falloff * falloff) * barrier.magnetForce;
			const pullSign = barrier.magnetPolarity === 1 ? 1 : -1;
			const swirlSign = Math.sin(t * 3.8 + cy * 0.01) >= 0 ? 1 : -1;
			const tx = -ny * swirlSign;
			const ty = nx * swirlSign;
			const fx = nx * strength * pullSign + tx * strength * 0.16;
			const fy = ny * strength * pullSign + ty * strength * 0.16;
			this.ballVx += fx * dt;
			this.ballVy += fy * dt;

			if (falloff > 0.82 && Math.random() < 0.22) {
				this.launchFx.explode(1, this.ball.x, this.ball.y);
			}
		}
	}

	private spawnLaserGrid(spawnY: number) {
		const beamCount = 4;
		const bandHeight = Phaser.Math.Between(210, 250);
		const thickness = Phaser.Math.Between(12, 16);
		const perBeamDuration = Phaser.Math.FloatBetween(0.32, 0.48);
		const allOffDuration = 3;
		const units: LaserBeamUnit[] = [];

		for (let i = 0; i < beamCount; i++) {
			const t = beamCount <= 1 ? 0.5 : i / (beamCount - 1);
			const yOffset = Phaser.Math.Linear(-bandHeight * 0.42, bandHeight * 0.42, t);
			const y = spawnY + yOffset;
			const leftWall = this.getSideWallX(y, true) + 6;
			const rightWall = this.getSideWallX(y, false) - 6;
			const width = Math.max(30, rightWall - leftWall);
			const glow = this.add.rectangle(leftWall, y, width, thickness + 16, this.neonBlue, 0.28)
				.setOrigin(0, 0.5)
				.setBlendMode(Phaser.BlendModes.ADD)
				.setDepth(24);
			const beam = this.add.rectangle(leftWall, y, width, thickness, 0xeeffff, 1)
				.setOrigin(0, 0.5)
				.setStrokeStyle(2, this.neonPink, 0.95)
				.setDepth(31);

			units.push({
				yOffset,
				phase: t + Phaser.Math.FloatBetween(0, 0.35),
				active: true,
				beam,
				glow
			});
		}

		this.barriers.push({
			type: 'LASER_GRID',
			y: spawnY,
			passed: false,
			laserBandHeight: bandHeight,
			laserThickness: thickness,
			laserCycle: perBeamDuration,
			laserOffDuration: allOffDuration,
			laserBeamUnits: units
		});
	}

	private updateLaserGrid(barrier: Barrier, _: number) {
		if (
			!barrier.laserBeamUnits ||
			barrier.laserThickness === undefined ||
			barrier.laserCycle === undefined ||
			barrier.laserOffDuration === undefined
		) {
			return;
		}

		const now = this.time.now * 0.001;
		const activePhaseDuration = barrier.laserBeamUnits.length * barrier.laserCycle;
		const fullCycleDuration = activePhaseDuration + barrier.laserOffDuration;
		const cycleT = ((now + barrier.y * 0.0009) % fullCycleDuration + fullCycleDuration) % fullCycleDuration;
		const allOffPhase = cycleT >= activePhaseDuration;
		const activeStepIndex = allOffPhase ? -1 : Math.floor(cycleT / barrier.laserCycle);
		const activeBeamIndex = allOffPhase
			? -1
			: (barrier.laserBeamUnits.length - 1 - activeStepIndex);

		for (let i = 0; i < barrier.laserBeamUnits.length; i++) {
			const unit = barrier.laserBeamUnits[i];
			const y = barrier.y + unit.yOffset;
			const leftWall = this.getSideWallX(y, true) + 6;
			const rightWall = this.getSideWallX(y, false) - 6;
			const width = Math.max(30, rightWall - leftWall);
			const active = i === activeBeamIndex;

			unit.active = active;
			unit.beam.x = leftWall;
			unit.beam.y = y;
			unit.beam.width = width;
			unit.beam.height = barrier.laserThickness;
			unit.glow.x = leftWall;
			unit.glow.y = y;
			unit.glow.width = width;
			unit.glow.height = barrier.laserThickness + 16;

			const pulse = 0.74 + (Math.sin(now * 14 + i * 1.3 + barrier.y * 0.02) + 1) * 0.12;
			const beamTargetAlpha = active ? pulse : (allOffPhase ? 0.18 : 0.24);
			const glowTargetAlpha = active ? 0.22 + pulse * 0.3 : (allOffPhase ? 0.12 : 0.18);
			unit.beam.alpha += (beamTargetAlpha - unit.beam.alpha) * 0.24;
			unit.glow.alpha += (glowTargetAlpha - unit.glow.alpha) * 0.24;
		}
	}

	private spawnPulseRing(spawnY: number) {
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const margin = 90;
		const safeLeft = leftWall + margin;
		const safeRight = rightWall - margin;
		const centerX = safeLeft < safeRight
			? Phaser.Math.Between(safeLeft, safeRight)
			: (leftWall + rightWall) * 0.5;
		const maxRadius = Phaser.Math.Clamp(
			Math.min(
				Phaser.Math.Between(180, 260),
				Math.min(centerX - leftWall, rightWall - centerX) - 18
			),
			130,
			280
		);
		const startRadius = 24;
		const bandWidth = Phaser.Math.Between(22, 30);
		const speed = Phaser.Math.Between(170, 245);

		const glow = this.add.circle(centerX, spawnY, maxRadius * 0.38, this.neonBlue, 0.1)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(22);
		const ring = this.add.circle(centerX, spawnY, startRadius, 0, 0)
			.setStrokeStyle(6, this.neonBlue, 0.88)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(30);
		const core = this.add.circle(centerX, spawnY, 18, 0xeeffff, 0.92)
			.setStrokeStyle(3, this.neonPink, 0.95)
			.setDepth(34);

		this.barriers.push({
			type: 'PULSE_RING',
			y: spawnY,
			passed: false,
			pulseCenterX: centerX,
			pulseCurrentRadius: startRadius,
			pulseStartRadius: startRadius,
			pulseMaxRadius: maxRadius,
			pulseSpeed: speed,
			pulseBandWidth: bandWidth,
			pulseCore: core,
			pulseRing: ring,
			pulseGlow: glow
		});
	}

	private updatePulseRing(barrier: Barrier, dt: number) {
		if (
			barrier.pulseCenterX === undefined ||
			barrier.pulseCurrentRadius === undefined ||
			barrier.pulseStartRadius === undefined ||
			barrier.pulseMaxRadius === undefined ||
			barrier.pulseSpeed === undefined ||
			!barrier.pulseCore ||
			!barrier.pulseRing ||
			!barrier.pulseGlow
		) {
			return;
		}

		barrier.pulseCurrentRadius += barrier.pulseSpeed * dt;
		if (barrier.pulseCurrentRadius > barrier.pulseMaxRadius) {
			barrier.pulseCurrentRadius = barrier.pulseStartRadius;
			this.launchFx.explode(10, barrier.pulseCenterX, barrier.y);
		}

		const now = this.time.now * 0.001;
		const progress = Phaser.Math.Clamp(
			(barrier.pulseCurrentRadius - barrier.pulseStartRadius) / Math.max(1, barrier.pulseMaxRadius - barrier.pulseStartRadius),
			0,
			1
		);
		const color = progress > 0.68 ? this.neonPink : this.neonBlue;
		const ringAlpha = 0.55 + (1 - progress) * 0.35;

		barrier.pulseRing.x = barrier.pulseCenterX;
		barrier.pulseRing.y = barrier.y;
		barrier.pulseRing.radius = barrier.pulseCurrentRadius;
		barrier.pulseRing.setStrokeStyle(6, color, ringAlpha);

		barrier.pulseCore.x = barrier.pulseCenterX;
		barrier.pulseCore.y = barrier.y;
		barrier.pulseCore.setScale(0.92 + Math.sin(now * 9.2 + barrier.y * 0.02) * 0.09);
		barrier.pulseCore.setStrokeStyle(3, this.neonPink, 0.86 + (1 - progress) * 0.14);

		barrier.pulseGlow.x = barrier.pulseCenterX;
		barrier.pulseGlow.y = barrier.y;
		barrier.pulseGlow.setScale(0.86 + progress * 0.52);
		barrier.pulseGlow.setFillStyle(color, 0.07 + (1 - progress) * 0.12);
	}

	private spawnTeleportGate(spawnY: number) {
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const portalRadius = 34;
		const safeLeft = leftWall + 80;
		const safeRight = rightWall - 80;
		let portalAX = Phaser.Math.Linear(safeLeft, safeRight, 0.3);
		let portalBX = Phaser.Math.Linear(safeLeft, safeRight, 0.7);
		if (safeLeft >= safeRight) {
			const mid = (leftWall + rightWall) * 0.5;
			portalAX = mid - 90;
			portalBX = mid + 90;
		}
		if (portalBX - portalAX < portalRadius * 3) {
			const mid = (portalAX + portalBX) * 0.5;
			portalAX = mid - portalRadius * 1.65;
			portalBX = mid + portalRadius * 1.65;
		}

		const minX = leftWall + portalRadius + 10;
		const maxX = rightWall - portalRadius - 10;
		portalAX = Phaser.Math.Clamp(portalAX, minX, maxX);
		portalBX = Phaser.Math.Clamp(portalBX, minX, maxX);

		const glowA = this.add.circle(portalAX, spawnY, portalRadius + 22, this.neonBlue, 0.22)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(24);
		const glowB = this.add.circle(portalBX, spawnY, portalRadius + 22, this.neonPink, 0.22)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(24);
		const portalA = this.add.circle(portalAX, spawnY, portalRadius, 0x121833, 0.56)
			.setStrokeStyle(4, this.neonBlue, 0.95)
			.setDepth(32);
		const portalB = this.add.circle(portalBX, spawnY, portalRadius, 0x261125, 0.56)
			.setStrokeStyle(4, this.neonPink, 0.95)
			.setDepth(32);
		const link = this.add.graphics()
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(26);

		this.barriers.push({
			type: 'TELEPORT_GATE',
			y: spawnY,
			passed: false,
			teleportAX: portalAX,
			teleportBX: portalBX,
			teleportRadius: portalRadius,
			teleportCooldownUntil: 0,
			teleportA: portalA,
			teleportB: portalB,
			teleportAGlow: glowA,
			teleportBGlow: glowB,
			teleportLink: link
		});
	}

	private updateTeleportGate(barrier: Barrier, dt: number) {
		if (
			barrier.teleportAX === undefined ||
			barrier.teleportBX === undefined ||
			barrier.teleportRadius === undefined ||
			!barrier.teleportA ||
			!barrier.teleportB ||
			!barrier.teleportAGlow ||
			!barrier.teleportBGlow ||
			!barrier.teleportLink
		) {
			return;
		}

		const now = this.time.now * 0.001;
		const pulseA = 1 + Math.sin(now * 6.8 + barrier.y * 0.03) * 0.08;
		const pulseB = 1 + Math.sin(now * 6.2 + barrier.y * 0.03 + Math.PI * 0.65) * 0.08;
		barrier.teleportAGlow.x = barrier.teleportAX;
		barrier.teleportAGlow.y = barrier.y;
		barrier.teleportAGlow.setScale(pulseA);
		barrier.teleportAGlow.alpha = 0.14 + (Math.sin(now * 9.1) + 1) * 0.13;
		barrier.teleportBGlow.x = barrier.teleportBX;
		barrier.teleportBGlow.y = barrier.y;
		barrier.teleportBGlow.setScale(pulseB);
		barrier.teleportBGlow.alpha = 0.14 + (Math.sin(now * 8.6 + 0.8) + 1) * 0.13;

		barrier.teleportA.x = barrier.teleportAX;
		barrier.teleportA.y = barrier.y;
		barrier.teleportA.setScale(0.96 + pulseA * 0.08);
		barrier.teleportA.rotation += dt * 0.9;
		barrier.teleportA.setStrokeStyle(4, this.neonBlue, 0.84 + pulseA * 0.08);

		barrier.teleportB.x = barrier.teleportBX;
		barrier.teleportB.y = barrier.y;
		barrier.teleportB.setScale(0.96 + pulseB * 0.08);
		barrier.teleportB.rotation -= dt * 1.05;
		barrier.teleportB.setStrokeStyle(4, this.neonPink, 0.84 + pulseB * 0.08);

		const link = barrier.teleportLink;
		const wave = Math.sin(now * 4.6 + barrier.y * 0.02) * 24;
		const midX = (barrier.teleportAX + barrier.teleportBX) * 0.5;
		const span = Math.max(1, barrier.teleportBX - barrier.teleportAX);
		const segments = 18;
		link.clear();
		link.lineStyle(4, this.neonBlue, 0.26);
		link.beginPath();
		link.moveTo(barrier.teleportAX, barrier.y);
		for (let i = 1; i <= segments; i++) {
			const t = i / segments;
			const x = barrier.teleportAX + span * t;
			const curve = Math.sin(t * Math.PI) * wave;
			link.lineTo(x, barrier.y - curve);
		}
		link.strokePath();
		link.lineStyle(2, this.neonPink, 0.42);
		link.beginPath();
		link.moveTo(barrier.teleportAX, barrier.y);
		for (let i = 1; i <= segments; i++) {
			const t = i / segments;
			const x = barrier.teleportAX + span * t;
			const curve = Math.sin(t * Math.PI) * wave;
			const cross = Math.sin(t * Math.PI * 2 + now * 3.1 + midX * 0.01) * 8;
			link.lineTo(x, barrier.y + curve + cross);
		}
		link.strokePath();

		const cooldownUntil = barrier.teleportCooldownUntil || 0;
		if (cooldownUntil > this.time.now) {
			return;
		}

		const trapHitRadius = this.ballRadius * this.trapHitboxScale;
		const hitA = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, barrier.teleportAX, barrier.y)
			<= (trapHitRadius + barrier.teleportRadius);
		const hitB = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, barrier.teleportBX, barrier.y)
			<= (trapHitRadius + barrier.teleportRadius);

		if (hitA) {
			this.teleportBall(barrier, barrier.teleportAX, barrier.teleportBX);
		} else if (hitB) {
			this.teleportBall(barrier, barrier.teleportBX, barrier.teleportAX);
		}
	}

	private teleportBall(barrier: Barrier, fromX: number, toX: number) {
		const now = this.time.now;
		if ((barrier.teleportCooldownUntil || 0) > now) {
			return;
		}

		const yOffset = Phaser.Math.Clamp((this.ball.y - barrier.y) * 0.42, -26, 26);
		const targetY = barrier.y + yOffset;
		const dir = Math.sign(toX - fromX) || 1;
		const leftBound = this.getSideWallX(targetY, true) + this.ballRadius + 8;
		const rightBound = this.getSideWallX(targetY, false) - this.ballRadius - 8;

		this.ball.x = Phaser.Math.Clamp(toX + dir * 6, leftBound, rightBound);
		this.ball.y = targetY;
		this.ballVx += dir * 180;
		this.ballVy -= 70;

		barrier.teleportCooldownUntil = now + 420;
		this.launchFx.explode(16, fromX, barrier.y);
		this.launchFx.explode(16, toX, targetY);
		this.cameras.main.flash(45, 90, 230, 255, false);
	}

	private spawnGravityFlipZone(spawnY: number) {
		const zoneHeight = Phaser.Math.Between(240, 300);
		const zoneGraphics = this.add.graphics()
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(20);
		const waveGraphics = this.add.graphics()
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(24);
		const initialScale = -0.72;

		this.barriers.push({
			type: 'GRAVITY_FLIP_ZONE',
			y: spawnY,
			passed: false,
			gravityZoneHeight: zoneHeight,
			gravityCurrentScale: initialScale,
			gravityTargetScale: initialScale,
			gravityScaleInterval: Phaser.Math.FloatBetween(1.35, 2.1),
			gravityScaleTimer: Phaser.Math.FloatBetween(0.35, 1.0),
			gravityZoneGraphics: zoneGraphics,
			gravityWaveGraphics: waveGraphics
		});
	}

	private updateGravityFlipZone(barrier: Barrier, dt: number) {
		if (
			barrier.gravityZoneHeight === undefined ||
			barrier.gravityCurrentScale === undefined ||
			barrier.gravityTargetScale === undefined ||
			barrier.gravityScaleTimer === undefined ||
			barrier.gravityScaleInterval === undefined ||
			!barrier.gravityZoneGraphics ||
			!barrier.gravityWaveGraphics
		) {
			return;
		}

		barrier.gravityScaleTimer -= dt;
		if (barrier.gravityScaleTimer <= 0) {
			const inverted = Math.random() > 0.45;
			barrier.gravityTargetScale = inverted
				? -Phaser.Math.FloatBetween(0.55, 0.95)
				: Phaser.Math.FloatBetween(0.22, 0.6);
			barrier.gravityScaleInterval = Phaser.Math.FloatBetween(1.3, 2.05);
			barrier.gravityScaleTimer = barrier.gravityScaleInterval;
			this.launchFx.explode(8, this.worldWidth * 0.5, barrier.y);
		}

		barrier.gravityCurrentScale = Phaser.Math.Linear(
			barrier.gravityCurrentScale,
			barrier.gravityTargetScale,
			dt * 2.6
		);

		const top = barrier.y - barrier.gravityZoneHeight * 0.5;
		const bottom = barrier.y + barrier.gravityZoneHeight * 0.5;
		const now = this.time.now * 0.001;
		const positive = barrier.gravityCurrentScale >= 0;
		const zoneColor = positive ? this.neonPink : this.neonBlue;
		const altColor = positive ? this.neonBlue : this.neonPink;
		const amp = Phaser.Math.Clamp(Math.abs(barrier.gravityCurrentScale), 0, 1);
		const zoneG = barrier.gravityZoneGraphics;
		zoneG.clear();
		zoneG.fillStyle(zoneColor, 0.03 + amp * 0.05);
		zoneG.fillRect(0, top, this.worldWidth, barrier.gravityZoneHeight);
		zoneG.lineStyle(2.5, zoneColor, 0.22 + amp * 0.16);
		zoneG.strokeRect(0, top, this.worldWidth, barrier.gravityZoneHeight);

		const waveG = barrier.gravityWaveGraphics;
		waveG.clear();
		const lineCount = 5;
		for (let i = 0; i < lineCount; i++) {
			const yT = lineCount <= 1 ? 0.5 : i / (lineCount - 1);
			const y = Phaser.Math.Linear(top + 24, bottom - 24, yT);
			const phase = now * (2.6 + i * 0.45) + barrier.y * 0.01;
			waveG.lineStyle(2, i % 2 === 0 ? zoneColor : altColor, 0.16 + amp * 0.28);
			waveG.beginPath();
			for (let x = 0; x <= this.worldWidth; x += 24) {
				const wy = y + Math.sin(phase + x * 0.018) * (6 + amp * 12);
				if (x === 0) {
					waveG.moveTo(x, wy);
				} else {
					waveG.lineTo(x, wy);
				}
			}
			waveG.strokePath();
		}

		if (this.ball.y > top && this.ball.y < bottom) {
			const desiredScale = barrier.gravityCurrentScale;
			const correction = (desiredScale - 1) * this.gravity;
			this.ballVy += correction * dt;
			const centerFalloff = Phaser.Math.Clamp(
				1 - Math.abs(this.ball.y - barrier.y) / (barrier.gravityZoneHeight * 0.5),
				0,
				1
			);
			const sway = Math.sin(now * 6.3 + barrier.y * 0.017) * 72;
			this.ballVx += sway * centerFalloff * dt;
			if (centerFalloff > 0.82 && Math.random() < 0.06) {
				this.launchFx.explode(1, this.ball.x, this.ball.y);
			}
		}
	}

	private spawnStaticBarrier(spawnY: number) {
		const gapMargin = 65;
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const inTriangleZone = this.getSideWallOffset(spawnY) > 0.5;
		const desiredGapWidth = this.gapWidth * (inTriangleZone ? 3 : 2);
		const rawMaxGap = (rightWall - leftWall) - gapMargin * 2;
		let gapWidth = Math.min(desiredGapWidth, Math.max(40, rawMaxGap));
		let halfGap = gapWidth / 2;
		let gapMin = leftWall + gapMargin + halfGap;
		let gapMax = rightWall - gapMargin - halfGap;
		if (gapMin > gapMax) {
			gapWidth = Math.max(40, (rightWall - leftWall) * 0.55);
			halfGap = gapWidth / 2;
			gapMin = leftWall + halfGap;
			gapMax = rightWall - halfGap;
		}
		const gapX = gapMin <= gapMax ? Phaser.Math.Between(gapMin, gapMax) : (leftWall + rightWall) / 2;

		// Calculate geometry
		const leftWidth = Math.max(0, gapX - halfGap);
		const rightX = Math.min(this.worldWidth, gapX + halfGap);
		const rightWidth = Math.max(0, this.worldWidth - rightX);

		const leftGlow = this.add.rectangle(0, spawnY, leftWidth, this.barrierHeight + 14, this.neonBlue, 0.38)
			.setOrigin(0, 0.5)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(25);
		const rightGlow = this.add.rectangle(rightX, spawnY, rightWidth, this.barrierHeight + 14, this.neonBlue, 0.38)
			.setOrigin(0, 0.5)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(25);
		const left = this.add.rectangle(0, spawnY, leftWidth, this.barrierHeight, this.barrierColor)
			.setOrigin(0, 0.5)
			.setStrokeStyle(2, 0x5a5a5a, 0.9)
			.setDepth(30);
		const right = this.add.rectangle(rightX, spawnY, rightWidth, this.barrierHeight, this.barrierColor)
			.setOrigin(0, 0.5)
			.setStrokeStyle(2, 0x5a5a5a, 0.9)
			.setDepth(30);

		this.barriers.push({
			type: 'STATIC_GAP',
			y: spawnY,
			gapX,
			gapWidth,
			passed: false,
			leftX: 0,
			leftW: leftWidth,
			rightX: rightX,
			rightW: rightWidth,
			left,
			right,
			leftGlow,
			rightGlow
		});

		// No need to call updateStaticBarrierVisuals here just for size, as they are now set correctly.
		// Use it for animation init if needed, but the main loop handles it.
	}

	private spawnWindZone(spawnY: number) {
		const height = 240;
		const direction = Math.random() > 0.5 ? 1 : -1; // 1: Right, -1: Left
		const windForce = 1400 * direction;

		// Visual container
		const g = this.add.graphics();
		g.setDepth(20);
		g.setBlendMode(Phaser.BlendModes.ADD);

		// Minimal background
		const color = direction === 1 ? 0x00ff66 : 0xffaa00;
		g.fillStyle(color, 0.03);
		g.fillRect(0, spawnY - height / 2, this.worldWidth, height);

		// Create arrows group
		const arrowGroup = this.add.group();
		const arrowCount = 5;
		const spacing = this.worldWidth / (arrowCount - 1);

		for (let i = 0; i < arrowCount + 1; i++) {
			const arrowG = this.add.graphics();
			arrowG.setDepth(21);

			// Draw Big Chevron with 3D Effect
			const w = 50;
			const h = 80;

			// 1. Depth/Shadow Layer (Offset)
			arrowG.lineStyle(8, 0x000000, 0.6);
			arrowG.beginPath();
			const offX = 6;
			const offY = 6;
			if (direction === 1) {
				arrowG.moveTo(-w / 2 + offX, -h / 2 + offY);
				arrowG.lineTo(w / 2 + offX, 0 + offY);
				arrowG.lineTo(-w / 2 + offX, h / 2 + offY);
			} else {
				arrowG.moveTo(w / 2 + offX, -h / 2 + offY);
				arrowG.lineTo(-w / 2 + offX, 0 + offY);
				arrowG.lineTo(w / 2 + offX, h / 2 + offY);
			}
			arrowG.strokePath();

			// 2. Main Neon Layer
			arrowG.lineStyle(6, this.neonBlue, 1);
			arrowG.beginPath();
			if (direction === 1) {
				arrowG.moveTo(-w / 2, -h / 2);
				arrowG.lineTo(w / 2, 0);
				arrowG.lineTo(-w / 2, h / 2);
			} else {
				arrowG.moveTo(w / 2, -h / 2);
				arrowG.lineTo(-w / 2, 0);
				arrowG.lineTo(w / 2, h / 2);
			}
			arrowG.strokePath();

			arrowG.x = i * spacing;
			arrowG.y = spawnY;
			arrowG.setAlpha(0.8); // More visible
			arrowGroup.add(arrowG);
		}

		this.barriers.push({
			type: 'SIDE_WIND_ZONE',
			y: spawnY,
			passed: false,
			windDirection: direction,
			windForce: windForce,
			windZoneHeight: height,
			windGraphics: g,
			windArrows: arrowGroup
		});
	}

	private updateWindZone(barrier: Barrier, dt: number) {
		if (!barrier.windArrows) return;

		const flowSpeed = (barrier.windDirection || 0) * 150 * dt; // Slow visual speed
		const height = barrier.windZoneHeight || 200;
		const top = barrier.y - height / 2;

		// Move Arrows
		barrier.windArrows.getChildren().forEach((child: any) => {
			const arrow = child as Phaser.GameObjects.Graphics;
			arrow.x += flowSpeed;

			// Wrap
			const bound = 60;
			if (barrier.windDirection === 1 && arrow.x > this.worldWidth + bound) {
				arrow.x = -bound;
			} else if (barrier.windDirection === -1 && arrow.x < -bound) {
				arrow.x = this.worldWidth + bound;
			}

			// Minimal pulse
			arrow.alpha = 0.25 + Math.sin(this.time.now * 0.002 + arrow.x * 0.005) * 0.15;
		});

		// Minimal Background Pulse
		if (barrier.windGraphics) {
			barrier.windGraphics.clear();
			const color = barrier.windDirection === 1 ? 0x00ff66 : 0xffaa00;
			const pulse = 0.02 + Math.sin(this.time.now * 0.002) * 0.015;
			barrier.windGraphics.fillStyle(color, pulse);
			barrier.windGraphics.fillRect(0, top, this.worldWidth, height);
		}
	}

	private spawnSideMover(spawnY: number, spawnDouble: boolean) {
		const size = 44;
		const padding = 28;
		const speed = Phaser.Math.Between(180, 260);
		const waitAtEnd = 1.0;
		const verticalGap = size + 90;
		const offsets = spawnDouble ? [-(verticalGap * 0.5), verticalGap * 0.5] : [0];
		const units: SideMoverUnit[] = [];

		for (let i = 0; i < offsets.length; i++) {
			const yOffset = offsets[i];
			const startAtLeft = spawnDouble ? i === 0 : Math.random() > 0.5;
			const t = startAtLeft ? 0 : 1;
			const dir = startAtLeft ? 1 : -1;
			const y = spawnY + yOffset;
			const leftBound = this.getSideWallX(y, true) + padding + size * 0.5;
			const rightBound = this.getSideWallX(y, false) - padding - size * 0.5;
			const x = Phaser.Math.Linear(leftBound, rightBound, t);

			const glow = this.add.rectangle(x, y, size + 30, size + 30, this.neonBlue, 0.36)
				.setBlendMode(Phaser.BlendModes.ADD)
				.setDepth(27);
			const square = this.add.rectangle(x, y, size, size, 0xc9fdff, 1)
				.setStrokeStyle(3, this.neonPink, 0.95)
				.setDepth(32);

			units.push({
				t,
				dir,
				waitTimer: 0,
				yOffset,
				x,
				square,
				glow
			});
		}

		this.barriers.push({
			type: 'SIDE_MOVER',
			y: spawnY,
			passed: false,
			moverUnits: units,
			moverSize: size,
			moverSpeed: speed,
			moverWait: waitAtEnd,
			moverPadding: padding
		});
	}

	private updateSideMover(barrier: Barrier, dt: number) {
		if (!barrier.moverUnits || !barrier.moverSize) return;
		const speed = barrier.moverSpeed || 200;
		const waitAtEnd = barrier.moverWait ?? 1;
		const padding = barrier.moverPadding ?? 28;
		const tNow = this.time.now * 0.001;

		for (let i = 0; i < barrier.moverUnits.length; i++) {
			const unit = barrier.moverUnits[i];
			const y = barrier.y + unit.yOffset;
			const leftBound = this.getSideWallX(y, true) + padding + barrier.moverSize * 0.5;
			const rightBound = this.getSideWallX(y, false) - padding - barrier.moverSize * 0.5;
			const travel = Math.max(1, rightBound - leftBound);

			if (unit.waitTimer > 0) {
				unit.waitTimer = Math.max(0, unit.waitTimer - dt);
			} else {
				unit.t += (unit.dir * speed * dt) / travel;
				if (unit.t >= 1) {
					unit.t = 1;
					unit.dir = -1;
					unit.waitTimer = waitAtEnd;
				} else if (unit.t <= 0) {
					unit.t = 0;
					unit.dir = 1;
					unit.waitTimer = waitAtEnd;
				}
			}

			unit.x = Phaser.Math.Linear(leftBound, rightBound, unit.t);
			unit.square.x = unit.x;
			unit.square.y = y;
			unit.glow.x = unit.x;
			unit.glow.y = y;

			const pulse = 1 + Math.sin(tNow * 8.5 + i * 1.9 + barrier.y * 0.02) * 0.1;
			unit.glow.setScale(pulse);
			unit.glow.alpha = 0.24 + (Math.sin(tNow * 9.4 + i) + 1) * 0.2;
			unit.square.rotation = Math.sin(tNow * 3.8 + i * 2.1) * 0.09;
		}
	}

	private spawnRotatingBar(spawnY: number, centerX: number) {
		const len = 240;
		const thickness = 22;
		const angularVel = Phaser.Math.FloatBetween(0.8, 1.8) * (Math.random() > 0.5 ? 1 : -1);

		const barG = this.add.graphics();
		barG.setDepth(30);
		barG.x = centerX;
		barG.y = spawnY;

		// Draw Bar
		barG.fillStyle(0xffffff, 1);
		barG.fillRoundedRect(-len / 2, -thickness / 2, len, thickness, 6);
		barG.lineStyle(2, 0x5a5a5a, 1);
		barG.strokeRoundedRect(-len / 2, -thickness / 2, len, thickness, 6);

		// Draw Center Hub
		barG.fillStyle(0xffffff, 1);
		barG.fillCircle(0, 0, 18);
		barG.lineStyle(2, 0x5a5a5a, 1);
		barG.strokeCircle(0, 0, 18);

		const glowG = this.add.graphics();
		glowG.setDepth(25);
		glowG.setBlendMode(Phaser.BlendModes.ADD);
		glowG.x = centerX;
		glowG.y = spawnY;

		// Glow
		glowG.fillStyle(this.neonPink, 0.35);
		glowG.fillRoundedRect(-len / 2 - 4, -thickness / 2 - 4, len + 8, thickness + 8, 8);
		glowG.fillCircle(0, 0, 26);

		this.barriers.push({
			type: 'ROTATING_BAR',
			y: spawnY,
			passed: false,
			centerX,
			barLength: len,
			barThickness: thickness,
			angle: Math.random() * Math.PI * 2,
			angularVelocity: angularVel,
			rotationSpeed: angularVel,
			barGraphics: barG,
			glowGraphics: glowG
		});
	}

	private updateCameraFollow() {
		const camera = this.cameras.main;
		const targetScrollY = this.ball.y - this.worldHeight * this.cameraLead;
		camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, this.cameraFollowLerp);
	}

	private checkCollisions() {
		const trapHitRadius = this.ballRadius * this.trapHitboxScale;

		if (this.ball.y + this.ballRadius >= this.floorY) {
			this.endGame();
			return;
		}

		if (this.lightningPickup) {
			const pickupHit = Phaser.Math.Distance.Between(
				this.ball.x, this.ball.y,
				this.lightningPickup.x, this.lightningPickup.y
			) <= (trapHitRadius + this.pickupRadius);
			if (pickupHit) {
				this.collectLightningPickup();
			}
		}

		for (const barrier of this.barriers) {
			if (barrier.passed) continue;

			if (barrier.type === 'STATIC_GAP') {
				if (barrier.leftX === undefined || barrier.rightX === undefined ||
					barrier.leftW === undefined || barrier.rightW === undefined) continue;

				const halfBarrierH = this.barrierHeight * 0.5;
				const barrierTop = barrier.y - halfBarrierH;
				const leftHit = this.circleIntersectsRect(
					this.ball.x, this.ball.y, trapHitRadius,
					barrier.leftX, barrierTop, barrier.leftW, this.barrierHeight
				);
				const rightHit = this.circleIntersectsRect(
					this.ball.x, this.ball.y, trapHitRadius,
					barrier.rightX, barrierTop, barrier.rightW, this.barrierHeight
				);

				if (leftHit || rightHit) {
					this.endGame();
					return;
				}
			} else if (barrier.type === 'ROTATING_BAR') {
				// Rotated rectangle collision
				if (barrier.centerX === undefined || barrier.barLength === undefined ||
					barrier.barThickness === undefined || barrier.angle === undefined) continue;

				const hit = this.circleIntersectsRotatedRect(
					this.ball.x, this.ball.y, trapHitRadius,
					barrier.centerX, barrier.y,
					barrier.barLength, barrier.barThickness,
					barrier.angle
				);
				if (hit) {
					this.endGame();
					return;
				}
			} else if (barrier.type === 'SIDE_MOVER') {
				if (!barrier.moverUnits || !barrier.moverSize) continue;
				for (const unit of barrier.moverUnits) {
					const y = barrier.y + unit.yOffset;
					const hit = this.circleIntersectsRect(
						this.ball.x, this.ball.y, trapHitRadius,
						unit.x - barrier.moverSize * 0.5,
						y - barrier.moverSize * 0.5,
						barrier.moverSize,
						barrier.moverSize
					);
					if (hit) {
						this.endGame();
						return;
					}
				}
			} else if (barrier.type === 'HEXAGON_TURRET') {
				if (
					barrier.centerX === undefined ||
					barrier.turretRadius === undefined ||
					barrier.turretAngle === undefined
				) {
					continue;
				}

				const hexVertices = this.getHexagonVertices(
					barrier.centerX,
					barrier.y,
					barrier.turretRadius,
					barrier.turretAngle
				);
				const turretHit = this.circleIntersectsPolygon(
					this.ball.x,
					this.ball.y,
					trapHitRadius,
					hexVertices
				);
				if (turretHit) {
					this.endGame();
					return;
				}

				if (!barrier.turretProjectiles) continue;
				for (const projectile of barrier.turretProjectiles) {
					if (!projectile.active) continue;
					const hit = this.circleIntersectsRotatedRect(
						this.ball.x,
						this.ball.y,
						trapHitRadius,
						projectile.x,
						projectile.y,
						projectile.size,
						projectile.size,
						projectile.body.rotation
					);
					if (hit) {
						this.endGame();
						return;
					}
				}
			} else if (barrier.type === 'MAGNET_CORE') {
				if (
					barrier.magnetCenterX === undefined ||
					barrier.magnetCoreRadius === undefined
				) {
					continue;
				}
				const coreHit = Phaser.Math.Distance.Between(
					this.ball.x,
					this.ball.y,
					barrier.magnetCenterX,
					barrier.y
				) <= (trapHitRadius + barrier.magnetCoreRadius);
				if (coreHit) {
					this.endGame();
					return;
				}
			} else if (barrier.type === 'LASER_GRID') {
				if (!barrier.laserBeamUnits || barrier.laserThickness === undefined) {
					continue;
				}
				for (const beam of barrier.laserBeamUnits) {
					if (!beam.active) continue;
					const y = barrier.y + beam.yOffset;
					const leftWall = this.getSideWallX(y, true) + 6;
					const rightWall = this.getSideWallX(y, false) - 6;
					const width = Math.max(30, rightWall - leftWall);
					const hit = this.circleIntersectsRect(
						this.ball.x,
						this.ball.y,
						trapHitRadius,
						leftWall,
						y - barrier.laserThickness * 0.5,
						width,
						barrier.laserThickness
					);
					if (hit) {
						this.endGame();
						return;
					}
				}
			} else if (barrier.type === 'PULSE_RING') {
				if (
					barrier.pulseCenterX === undefined ||
					barrier.pulseCurrentRadius === undefined ||
					barrier.pulseBandWidth === undefined
				) {
					continue;
				}
				const dist = Phaser.Math.Distance.Between(
					this.ball.x,
					this.ball.y,
					barrier.pulseCenterX,
					barrier.y
				);
				const ringBand = barrier.pulseBandWidth * 0.5 + trapHitRadius;
				const ringHit = Math.abs(dist - barrier.pulseCurrentRadius) <= ringBand;
				if (ringHit) {
					this.endGame();
					return;
				}
			}
		}
	}

	private circleIntersectsRect(
		cx: number, cy: number, r: number,
		rx: number, ry: number, rw: number, rh: number
	) {
		if (rw <= 0 || rh <= 0) return false;
		const closestX = Phaser.Math.Clamp(cx, rx, rx + rw);
		const closestY = Phaser.Math.Clamp(cy, ry, ry + rh);
		const dx = cx - closestX;
		const dy = cy - closestY;
		return dx * dx + dy * dy <= r * r;
	}

	private circleIntersectsRotatedRect(
		cx: number, cy: number, r: number,
		rectCx: number, rectCy: number, w: number, h: number, angle: number
	) {
		// Transform circle into rect's local space (unrotated)
		const cos = Math.cos(-angle);
		const sin = Math.sin(-angle);
		const dx = cx - rectCx;
		const dy = cy - rectCy;
		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;

		// Check against AABB centered at 0,0
		const halfW = w / 2;
		const halfH = h / 2;
		const closestX = Phaser.Math.Clamp(localX, -halfW, halfW);
		const closestY = Phaser.Math.Clamp(localY, -halfH, halfH);

		const distX = localX - closestX;
		const distY = localY - closestY;
		return (distX * distX + distY * distY) <= (r * r);
	}

	private getHexagonVertices(
		cx: number,
		cy: number,
		radius: number,
		rotation: number
	) {
		const points: Phaser.Math.Vector2[] = [];
		for (let i = 0; i < 6; i++) {
			const angle = rotation - Math.PI / 2 + i * (Math.PI / 3);
			points.push(new Phaser.Math.Vector2(
				cx + Math.cos(angle) * radius,
				cy + Math.sin(angle) * radius
			));
		}
		return points;
	}

	private isPointInPolygon(x: number, y: number, points: Phaser.Math.Vector2[]) {
		let inside = false;
		for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
			const xi = points[i].x;
			const yi = points[i].y;
			const xj = points[j].x;
			const yj = points[j].y;
			const intersects = ((yi > y) !== (yj > y))
				&& (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-6) + xi);
			if (intersects) {
				inside = !inside;
			}
		}
		return inside;
	}

	private circleIntersectsPolygon(
		cx: number,
		cy: number,
		r: number,
		points: Phaser.Math.Vector2[]
	) {
		if (this.isPointInPolygon(cx, cy, points)) {
			return true;
		}
		const rr = r * r;
		for (let i = 0; i < points.length; i++) {
			const a = points[i];
			const b = points[(i + 1) % points.length];
			const abx = b.x - a.x;
			const aby = b.y - a.y;
			const segLenSq = abx * abx + aby * aby;
			const t = segLenSq > 0
				? Phaser.Math.Clamp(((cx - a.x) * abx + (cy - a.y) * aby) / segLenSq, 0, 1)
				: 0;
			const closestX = a.x + abx * t;
			const closestY = a.y + aby * t;
			const dx = cx - closestX;
			const dy = cy - closestY;
			if (dx * dx + dy * dy <= rr) {
				return true;
			}
		}
		return false;
	}

	private drawColliderDebug() {
		if (!this.showColliderDebug) {
			this.colliderDebug.clear();
			return;
		}

		const g = this.colliderDebug;
		const trapHitRadius = this.ballRadius * this.trapHitboxScale;
		g.clear();

		// Ball collider
		g.lineStyle(3, 0x00ff66, 0.95);
		g.strokeCircle(this.ball.x, this.ball.y, trapHitRadius);

		// Floor collider
		g.lineStyle(2, 0xff3b3b, 0.85);
		g.beginPath();
		g.moveTo(0, this.floorY - this.ballRadius);
		g.lineTo(this.worldWidth, this.floorY - this.ballRadius);
		g.strokePath();

		for (const barrier of this.barriers) {
			if (barrier.passed) continue;

			if (barrier.type === 'STATIC_GAP') {
				if (barrier.leftX === undefined || barrier.leftW === undefined ||
					barrier.rightX === undefined || barrier.rightW === undefined) continue;

				const leftEdge = barrier.leftX + barrier.leftW;
				const rightEdge = barrier.rightX;
				const bandHalf = this.barrierHeight * 0.5 + trapHitRadius;
				const bandTop = barrier.y - bandHalf;
				const bandHeight = bandHalf * 2;

				g.fillStyle(0xff2ea6, 0.08);
				g.fillRect(0, bandTop, this.worldWidth, bandHeight);

				g.lineStyle(2, 0x00e5ff, 0.95);
				g.strokeRect(barrier.leftX, barrier.y - this.barrierHeight / 2, barrier.leftW, this.barrierHeight);
				g.strokeRect(barrier.rightX, barrier.y - this.barrierHeight / 2, barrier.rightW, this.barrierHeight);

			} else if (barrier.type === 'ROTATING_BAR') {
				if (barrier.centerX === undefined || barrier.barLength === undefined ||
					barrier.barThickness === undefined || barrier.angle === undefined) continue;

				// Draw rotated rect
				const corners = [
					{ x: -barrier.barLength / 2, y: -barrier.barThickness / 2 },
					{ x: barrier.barLength / 2, y: -barrier.barThickness / 2 },
					{ x: barrier.barLength / 2, y: barrier.barThickness / 2 },
					{ x: -barrier.barLength / 2, y: barrier.barThickness / 2 }
				];

				const cos = Math.cos(barrier.angle);
				const sin = Math.sin(barrier.angle);

				g.lineStyle(2, 0xff00ff, 0.95);
				g.beginPath();
				for (let i = 0; i < 5; i++) {
					const idx = i % 4;
					const lx = corners[idx].x;
					const ly = corners[idx].y;
					const wx = barrier.centerX + (lx * cos - ly * sin);
					const wy = barrier.y + (lx * sin + ly * cos);
					if (i === 0) g.moveTo(wx, wy);
					else g.lineTo(wx, wy);
				}
				g.strokePath();
			} else if (barrier.type === 'HEXAGON_TURRET') {
				if (
					barrier.centerX === undefined ||
					barrier.turretRadius === undefined ||
					barrier.turretAngle === undefined
				) {
					continue;
				}
				const hexVertices = this.getHexagonVertices(
					barrier.centerX,
					barrier.y,
					barrier.turretRadius,
					barrier.turretAngle
				);

				g.lineStyle(2, 0xfffb00, 0.95);
				g.beginPath();
				for (let i = 0; i <= hexVertices.length; i++) {
					const p = hexVertices[i % hexVertices.length];
					if (i === 0) g.moveTo(p.x, p.y);
					else g.lineTo(p.x, p.y);
				}
				g.strokePath();

				if (!barrier.turretProjectiles) continue;
				g.lineStyle(2, 0x00ff66, 0.9);
				for (const projectile of barrier.turretProjectiles) {
					if (!projectile.active) continue;
					g.strokeRect(
						projectile.x - projectile.size * 0.5,
						projectile.y - projectile.size * 0.5,
						projectile.size,
						projectile.size
					);
				}
			} else if (barrier.type === 'MAGNET_CORE') {
				if (
					barrier.magnetCenterX === undefined ||
					barrier.magnetCoreRadius === undefined ||
					barrier.magnetInfluenceRadius === undefined
				) {
					continue;
				}

				g.lineStyle(2, 0x5cf4ff, 0.65);
				g.strokeCircle(
					barrier.magnetCenterX,
					barrier.y,
					barrier.magnetInfluenceRadius
				);
				g.lineStyle(2, 0xff2ea6, 0.95);
				g.strokeCircle(
					barrier.magnetCenterX,
					barrier.y,
					barrier.magnetCoreRadius
				);
			} else if (barrier.type === 'LASER_GRID') {
				if (!barrier.laserBeamUnits || barrier.laserThickness === undefined) {
					continue;
				}
				for (const beam of barrier.laserBeamUnits) {
					if (!beam.active) continue;
					const y = barrier.y + beam.yOffset;
					const leftWall = this.getSideWallX(y, true) + 6;
					const rightWall = this.getSideWallX(y, false) - 6;
					g.lineStyle(2, 0xff3366, 0.95);
					g.strokeRect(
						leftWall,
						y - barrier.laserThickness * 0.5,
						Math.max(30, rightWall - leftWall),
						barrier.laserThickness
					);
				}
			} else if (barrier.type === 'PULSE_RING') {
				if (
					barrier.pulseCenterX === undefined ||
					barrier.pulseCurrentRadius === undefined ||
					barrier.pulseBandWidth === undefined
				) {
					continue;
				}
				g.lineStyle(2, 0x7af5ff, 0.9);
				g.strokeCircle(
					barrier.pulseCenterX,
					barrier.y,
					barrier.pulseCurrentRadius
				);
				g.lineStyle(2, 0xff2ea6, 0.72);
				g.strokeCircle(
					barrier.pulseCenterX,
					barrier.y,
					Math.max(0, barrier.pulseCurrentRadius - barrier.pulseBandWidth * 0.5)
				);
				g.strokeCircle(
					barrier.pulseCenterX,
					barrier.y,
					barrier.pulseCurrentRadius + barrier.pulseBandWidth * 0.5
				);
			} else if (barrier.type === 'TELEPORT_GATE') {
				if (
					barrier.teleportAX === undefined ||
					barrier.teleportBX === undefined ||
					barrier.teleportRadius === undefined
				) {
					continue;
				}
				g.lineStyle(2, 0x7b9dff, 0.9);
				g.strokeCircle(barrier.teleportAX, barrier.y, barrier.teleportRadius);
				g.lineStyle(2, 0xff6bc6, 0.9);
				g.strokeCircle(barrier.teleportBX, barrier.y, barrier.teleportRadius);
			} else if (barrier.type === 'GRAVITY_FLIP_ZONE') {
				if (barrier.gravityZoneHeight === undefined) {
					continue;
				}
				const top = barrier.y - barrier.gravityZoneHeight * 0.5;
				g.lineStyle(2, 0x7de5ff, 0.62);
				g.strokeRect(0, top, this.worldWidth, barrier.gravityZoneHeight);
			}
		}
	}

	private endGame() {
		if (this.isGameOver) {
			return;
		}

		this.isGameOver = true;
		this.aimLine.clear();
		this.aimArc.clear();
		this.aimCenterArrow.clear();
		this.tailRibbon.clear();
		this.tailCore.clear();
		this.tailPoints = [];
		this.trailFx.stop();
		this.cameras.main.shake(230, 0.02);
		this.cameras.main.flash(140, 255, 70, 166, false);
		this.launchFx.explode(120, this.ball.x, this.ball.y);
		this.time.delayedCall(70, () => this.launchFx.explode(90, this.ball.x, this.ball.y));
		this.time.delayedCall(140, () => this.launchFx.explode(70, this.ball.x, this.ball.y));
		this.tweens.add({
			targets: this.cameras.main,
			zoom: 1.085,
			duration: 130,
			yoyo: true,
			ease: "Cubic.easeOut"
		});

		const blastRing = this.add.circle(this.ball.x, this.ball.y, 24, this.neonPink, 0.7)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(95);
		this.tweens.add({
			targets: blastRing,
			scale: 5.4,
			alpha: 0,
			duration: 360,
			ease: "Cubic.easeOut",
			onComplete: () => blastRing.destroy()
		});

		this.showGameOverScreen();

		this.playSfx("dead");
		this.triggerHaptic("error");
	}

	private updateUi() {
		// Update score based on max height reached
		const currentHeight = Math.max(0, this.startY - this.ball.y);
		if (currentHeight > this.maxHeightScore) {
			this.maxHeightScore = currentHeight;
		}

		// Scale down for display (e.g. 1 unit per 10 pixels)
		this.score = Math.floor(this.maxHeightScore / 10);

		const boostText = this.boostedLaunches > 0 ? `  BOOST x${this.boostedLaunches}` : "";
		this.scoreText.setText(`${this.score}${boostText}`);
	}

	private ensureParticleTexture() {
		const key = "neon-dot";
		if (this.textures.exists(key)) {
			return;
		}

		const dot = this.make.graphics({ x: 0, y: 0, add: false });
		dot.fillStyle(0xffffff, 1);
		dot.fillCircle(6, 6, 6);
		dot.generateTexture(key, 12, 12);
		dot.destroy();
	}

	private ensureBgMusicPlaying() {
		if (!this.bgMusic) {
			this.bgMusic = this.sound.add("bgMusic", {
				loop: true,
				volume: 0.45
			});
		}
		if (!this.bgMusic.isPlaying) {
			this.bgMusic.play();
		}
	}

	private playSfx(key: string) {
		this.sound.play(key, { volume: 0.85 });
	}

	private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error") {
		const fn = (window as any).triggerHaptic;
		if (typeof fn === "function") {
			const enabled = localStorage.getItem("setting_haptic") !== "false";
			if (enabled) {
				fn(type);
			}
		}
	}

	private initUI() {
		const pauseBtn = document.getElementById("btn-pause");
		const resumeBtn = document.getElementById("btn-resume");
		const restartPauseBtn = document.getElementById("btn-restart-pause");
		const restartGameOverBtn = document.getElementById("btn-restart-gameover");
		const quitBtn = document.getElementById("btn-quit");
		const startGameBtn = document.getElementById("btn-start-game");

		const pauseMenu = document.getElementById("pause-menu");
		const gameOverMenu = document.getElementById("game-over-menu");

		// Reset visibility
		pauseMenu?.classList.add("hidden");
		gameOverMenu?.classList.add("hidden");
		// hud visibility managed by menu state

		// Listeners (assign to onclick to prevent stacking)
		if (pauseBtn) pauseBtn.onclick = () => this.pauseGame();
		if (resumeBtn) resumeBtn.onclick = () => this.resumeGame();

		if (startGameBtn) startGameBtn.onclick = () => {
			this.toggleMainMenu(false);
			this.isGameStarted = true;
			this.hintText.setVisible(true);
			this.ensureBgMusicPlaying();
		};

		if (restartPauseBtn) restartPauseBtn.onclick = () => {
			this.resumeGame();
			this.scene.restart();
		};

		if (restartGameOverBtn) restartGameOverBtn.onclick = () => {
			// Hide UI before restart
			gameOverMenu?.classList.add("hidden");
			document.getElementById("hud")?.classList.remove("hidden");
			this.scene.restart();
		};

		if (quitBtn) quitBtn.onclick = () => {
			location.reload();
		};

		// Settings Toggles
		document.querySelectorAll(".setting-toggle").forEach(el => {
			(el as HTMLElement).onclick = (e) => {
				const target = (e.currentTarget as HTMLElement).dataset.setting;
				if (target) this.toggleSetting(target);
			};
		});

		this.loadSettings();
	}

	private pauseGame() {
		this.scene.pause();
		document.getElementById("pause-menu")?.classList.remove("hidden");
		document.getElementById("hud")?.classList.add("hidden");
	}

	private resumeGame() {
		this.scene.resume();
		document.getElementById("pause-menu")?.classList.add("hidden");
		document.getElementById("hud")?.classList.remove("hidden");
	}

	private showGameOverScreen() {
		const gameOverMenu = document.getElementById("game-over-menu");
		const finalScoreEl = document.getElementById("final-score");
		const hud = document.getElementById("hud");

		if (finalScoreEl) finalScoreEl.innerText = this.score.toString();

		hud?.classList.add("hidden");
		gameOverMenu?.classList.remove("hidden");

		// Submit score
		if (typeof (window as any).submitScore === "function") {
			(window as any).submitScore(this.score);
		}
	}

	private toggleSetting(key: string) {
		const storeKey = `setting_${key}`;
		const current = localStorage.getItem(storeKey) !== "false";
		const next = !current;
		localStorage.setItem(storeKey, next.toString());
		this.applySettings(key, next);
		this.updateSettingUI(key, next);
	}

	private loadSettings() {
		["music", "sfx", "haptic"].forEach(key => {
			const enabled = localStorage.getItem(`setting_${key}`) !== "false";
			this.applySettings(key, enabled);
			this.updateSettingUI(key, enabled);
		});
	}

	private updateSettingUI(key: string, enabled: boolean) {
		const icon = document.getElementById(`icon-${key}`);
		const iconMain = document.getElementById(`icon-${key}-main`);
		const containers = document.querySelectorAll(`.setting-toggle[data-setting="${key}"]`);

		containers.forEach(container => {
			if (enabled) {
				container.classList.add("active");
			} else {
				container.classList.remove("active");
			}
		});

		const iconName = key === "music" ? (enabled ? "music_note" : "music_off") :
			key === "sfx" ? (enabled ? "volume_up" : "volume_off") :
				(enabled ? "smartphone" : "smartphone"); // Material Symbols Rounded

		if (icon) icon.innerText = iconName;
		if (iconMain) iconMain.innerText = iconName;
	}

	private toggleMainMenu(visible: boolean) {
		const mainMenu = document.getElementById("main-menu");
		const hud = document.getElementById("hud");

		if (visible) {
			mainMenu?.classList.remove("hidden");
			hud?.classList.add("hidden");
			this.titleText.setVisible(false);
		} else {
			mainMenu?.classList.add("hidden");
			hud?.classList.remove("hidden");
			this.titleText.setVisible(true);
		}
	}

	private applySettings(key: string, enabled: boolean) {
		if (key === "music") {
			if (this.bgMusic) {
				if (enabled && !this.bgMusic.isPlaying) this.bgMusic.play();
				if (!enabled && this.bgMusic.isPlaying) this.bgMusic.pause();
			}
			this.sound.mute = !enabled && (localStorage.getItem("setting_sfx") === "false"); // Simple check
		}
		// SFX is handled in playSfx
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
