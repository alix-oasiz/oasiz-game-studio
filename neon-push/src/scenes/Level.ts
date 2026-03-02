// You can write more code here
/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { oasiz } from "@oasiz/sdk";
/* END-USER-IMPORTS */



type TrapType =
	'STATIC_GAP' |
	'ROTATING_BAR' |
	'SIDE_WIND_ZONE' |
	'SIDE_MOVER' |
	'HEXAGON_TURRET' |
	'MINE_FIELD' |
	'LASER_GRID' |
	'PULSE_RING' |
	'TELEPORT_GATE' |
	'BOUNCE_SPEED_ZONE';

type MineUnit = {
	x: number;
	y: number;
	armed: boolean;
	graphics: Phaser.GameObjects.Graphics;
	glow: Phaser.GameObjects.Arc;
};

type SideMoverUnit = {
	t: number;
	dir: number;
	waitTimer: number;
	yOffset: number;
	x: number;
	square: Phaser.GameObjects.Graphics;
	glow: Phaser.GameObjects.Graphics;
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
	beam: Phaser.GameObjects.Graphics;
	glow: Phaser.GameObjects.Graphics;
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
	left?: Phaser.GameObjects.Graphics;
	right?: Phaser.GameObjects.Graphics;
	leftGlow?: Phaser.GameObjects.Graphics;
	rightGlow?: Phaser.GameObjects.Graphics;
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
	// Mine Field Properties
	mineFieldCenterX?: number;
	mineFieldRadius?: number;
	mines?: MineUnit[];
	minePatternTimer?: number;
	minePatternDuration?: number;
	mineFieldBorder?: Phaser.GameObjects.Graphics;
	mineFieldGlow?: Phaser.GameObjects.Arc;
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
	pulseRingSoft?: Phaser.GameObjects.Arc;
	pulseHoldTimer?: number;
	pulseWaitTimer?: number;
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
	// Bounce Speed Zone Properties
	bsMode?: 'BOUNCE' | 'SPEED';
	bsModeTimer?: number;
	bsModeDuration?: number;
	bsZoneGraphics?: Phaser.GameObjects.Graphics;
	bsIconGraphics?: Phaser.GameObjects.Graphics;
	bsTransitionAlpha?: number;
	bsZoneHeight?: number;
};

type TailPoint = {
	x: number;
	y: number;
	life: number;
};

export default class Level extends Phaser.Scene {

	private ball!: Phaser.GameObjects.Arc;
	private ballInner!: Phaser.GameObjects.Arc;
	private ballCore!: Phaser.GameObjects.Arc;
	private ballSpec!: Phaser.GameObjects.Arc;
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

	private ballRadius = 32;
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

	private gapWidth = 240;
	private gapWidthMin = 140;
	private barrierHeight = 44;
	private nextBarrierSpawnY = 0;
	private spawnAheadMin = 140;
	private spawnAheadMax = 420;
	private barrierSpacingMin = 210;
	private barrierSpacingMax = 330;
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

	private readonly ballColor = 0x82B1FF;
	private readonly accentCoral = 0xFF8A80;
	private readonly accentBlue = 0x82B1FF;
	private readonly accentLavender = 0xB388FF;
	private readonly accentMint = 0xA7FFEB;
	private readonly barrierColor = 0xffffff;
	private readonly floorColor = 0x5D4037;
	private readonly shadowColor = 0x3E2723;
	private readonly highlightColor = 0xFFF8E1;
	private readonly clayBg1 = 0xFFF8E1;
	private readonly clayBg2 = 0xE3F2FD;

	private startY = 0;
	private maxHeightScore = 0;
	private isGameStarted = false;
	private readonly launchBoost = 1.5;
	private readonly flightDistanceBoost = 1.31;

	private settings: { music: boolean; fx: boolean; haptics: boolean } = { music: true, fx: true, haptics: true };
	private offPause?: () => void;
	private offResume?: () => void;
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

	create(data?: any) {
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
			this.shadowColor,
			0.3
		);

		this.floor = this.add.rectangle(
			this.worldWidth / 2,
			(this.floorY + this.worldHeight) / 2,
			this.worldWidth,
			this.worldHeight - this.floorY,
			this.floorColor
		);

		this.ballHalo = this.add.circle(centerX, ballStartY, this.ballRadius + 34, this.accentCoral, 0.1);
		this.ballGlow = this.add.circle(centerX, ballStartY + 4, this.ballRadius + 4, this.shadowColor, 0.4);
		this.ball = this.add.circle(centerX, ballStartY, this.ballRadius, this.ballColor);
		this.ballInner = this.add.circle(centerX, ballStartY + 2, this.ballRadius * 0.7, 0xBBDEFB, 0.85);
		this.ballCore = this.add.circle(centerX, ballStartY + 4, this.ballRadius * 0.4, 0xE3F2FD, 0.7);
		this.ballSpec = this.add.circle(centerX - 8, ballStartY - 8, this.ballRadius * 0.2, 0xffffff, 0.9);

		this.aimLine = this.add.graphics();
		this.aimArc = this.add.graphics();
		this.aimCenterArrow = this.add.graphics();
		this.sideLines = this.add.graphics().setDepth(18);
		this.colliderDebug = this.add.graphics().setDepth(140);
		this.tailRibbon = this.add.graphics().setDepth(24);
		this.tailCore = this.add.graphics().setDepth(25);

		this.titleText = this.add.text(this.worldWidth / 2, 80, "PUSH", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "64px",
			color: "#3E2723",
			fontStyle: "900",
			shadow: { blur: 0, color: "#D7CCC8", fill: true, offsetX: 4, offsetY: 4 }
		}).setOrigin(0.5).setScrollFactor(0);

		this.scoreText = this.add.text(this.worldWidth / 2, 200, "0", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "48px",
			color: "#3E2723",
			fontStyle: "900",
			shadow: { blur: 0, color: "#D7CCC8", fill: true, offsetX: 3, offsetY: 3 }
		}).setOrigin(0.5, 0).setScrollFactor(0);

		this.hintText = this.add.text(this.worldWidth / 2, this.worldHeight / 2 - 50, "TAP TO SHOOT", {
			fontFamily: "'Outfit', sans-serif",
			fontSize: "36px",
			color: "#FF8A80",
			fontStyle: "900",
			stroke: "#5D4037",
			strokeThickness: 2,
			shadow: { blur: 0, color: "#D7CCC8", fill: true, offsetX: 2, offsetY: 2 }
		}).setOrigin(0.5).setScrollFactor(0);
		this.hintText.setVisible(false);

		this.tweens.add({
			targets: this.hintText,
			alpha: { from: 0.5, to: 1 },
			scaleX: { from: 0.95, to: 1.05 },
			scaleY: { from: 0.95, to: 1.05 },
			duration: 900,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut"
		});

		this.ensureParticleTexture();
		this.launchFx = this.add.particles(0, 0, "neon-dot", {
			speed: { min: 140, max: 430 },
			lifespan: { min: 260, max: 600 },
			angle: { min: 0, max: 360 },
			scale: { start: 0.82, end: 0 },
			alpha: { start: 0.85, end: 0 },
			quantity: 0,
			tint: [this.accentBlue, this.accentCoral, this.accentLavender]
		});
		this.trailFx = this.add.particles(0, 0, "neon-dot", {
			speed: { min: 26, max: 120 },
			lifespan: { min: 280, max: 620 },
			scale: { start: 0.9, end: 0 },
			alpha: { start: 0.75, end: 0 },
			frequency: 14,
			quantity: 2,
			emitting: false,
			tint: [this.accentBlue, this.accentCoral, this.accentLavender]
		});

		this.input.off("pointerdown", this.onPointerDown, this);
		this.input.on("pointerdown", this.onPointerDown, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.input.off("pointerdown", this.onPointerDown, this);
			this.offPause?.();
			this.offResume?.();
		});

		this.fillBarriersAhead();
		this.ensureBgMusicPlaying();
		this.initUI();

		if (data?.quickRestart) {
			this.toggleMainMenu(false);
			this.isGameStarted = true;
			this.hintText.setVisible(true);
		} else {
			this.toggleMainMenu(true);
		}

		this.offPause?.();
		this.offResume?.();
		this.offPause = oasiz.onPause(() => {
			if (this.isGameStarted && !this.isGameOver) {
				this.scene.pause();
				if (this.bgMusic?.isPlaying) this.bgMusic.pause();
			}
		});
		this.offResume = oasiz.onResume(() => {
			if (this.isGameStarted && !this.isGameOver) {
				this.scene.resume();
				if (this.settings.music && this.bgMusic && !this.bgMusic.isPlaying) this.bgMusic.play();
			}
		});
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
				Phaser.Display.Color.ValueToColor(this.clayBg1),
				Phaser.Display.Color.ValueToColor(this.clayBg2),
				100,
				Math.floor(t * 100)
			);
			const fill = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
			const y = t * this.worldHeight;
			gradient.fillStyle(fill, 1);
			gradient.fillRect(0, y, this.worldWidth, this.worldHeight / bands + 3);
		}

		const dotGrid = this.add.graphics().setScrollFactor(0);
		dotGrid.fillStyle(0xBCAAA4, 0.18);
		for (let x = 30; x <= this.worldWidth; x += 60) {
			for (let y = 35; y <= this.worldHeight; y += 70) {
				dotGrid.fillCircle(x, y, 2);
			}
		}

		this.scanLines = this.add.graphics().setScrollFactor(0);
	}

	private updateNeonPulse() {
		const t = this.time.now * 0.001;
		const pulse = 1 + Math.sin(t * 5.2) * 0.04;

		this.ballGlow.x = this.ball.x + 4;
		this.ballGlow.y = this.ball.y + 4;
		this.ballGlow.setScale(pulse);
		this.ballGlow.alpha = 0.35;
		this.ballHalo.x = this.ball.x;
		this.ballHalo.y = this.ball.y;
		this.ballHalo.setScale(1 + Math.sin(t * 4.1) * 0.06);
		this.ballHalo.alpha = 0.08;

		this.ballInner.x = this.ball.x;
		this.ballInner.y = this.ball.y + 2;
		this.ballCore.x = this.ball.x;
		this.ballCore.y = this.ball.y + 4;
		this.ballSpec.x = this.ball.x - 8;
		this.ballSpec.y = this.ball.y - 8;

		this.floorGlow.alpha = 0.3;
		this.titleText.setScale(1 + Math.sin(t * 2.8) * 0.02);

		this.scanLines.clear();
	}

	private updateSideLines() {
		const cam = this.cameras.main;
		const top = cam.scrollY - 220;
		const bottom = cam.scrollY + this.worldHeight + 220;
		const step = 8;

		this.sideLines.clear();

		this.sideLines.lineStyle(10, this.shadowColor, 0.2);
		this.sideLines.beginPath();
		for (let y = top; y <= bottom; y += step) {
			const lx = this.getSideWallX(y, true) + 3;
			if (y === top) this.sideLines.moveTo(lx, y + 3);
			else this.sideLines.lineTo(lx, y + 3);
		}
		for (let y = top; y <= bottom; y += step) {
			const rx = this.getSideWallX(y, false) + 3;
			if (y === top) this.sideLines.moveTo(rx, y + 3);
			else this.sideLines.lineTo(rx, y + 3);
		}
		this.sideLines.strokePath();

		this.sideLines.lineStyle(6, 0xD7CCC8, 1);
		this.sideLines.beginPath();
		for (let y = top; y <= bottom; y += step) {
			const lx = this.getSideWallX(y, true);
			if (y === top) this.sideLines.moveTo(lx, y);
			else this.sideLines.lineTo(lx, y);
		}
		for (let y = top; y <= bottom; y += step) {
			const rx = this.getSideWallX(y, false);
			if (y === top) this.sideLines.moveTo(rx, y);
			else this.sideLines.lineTo(rx, y);
		}
		this.sideLines.strokePath();

		this.sideLines.lineStyle(2, 0xEFEBE9, 0.6);
		this.sideLines.beginPath();
		for (let y = top; y <= bottom; y += step) {
			const lx = this.getSideWallX(y, true) - 1;
			if (y === top) this.sideLines.moveTo(lx, y - 1);
			else this.sideLines.lineTo(lx, y - 1);
		}
		for (let y = top; y <= bottom; y += step) {
			const rx = this.getSideWallX(y, false) - 1;
			if (y === top) this.sideLines.moveTo(rx, y - 1);
			else this.sideLines.lineTo(rx, y - 1);
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
		this.drawTaperedBar(this.ball.x, this.ball.y, endX, endY, 24, 4.2, this.accentBlue, 0.14);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 32, 6, this.accentBlue, 0.24);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 18, 4.2, this.accentCoral, 0.88);
		this.drawTaperedBar(this.ball.x, this.ball.y, fillX, fillY, 8, 2, 0xeaffff, 0.88);

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
		const radius = 72;
		const segment = Phaser.Math.DegToRad(3);
		const gap = Phaser.Math.DegToRad(2);

		this.aimArc.clear();
		this.aimArc.lineStyle(18, this.accentCoral, 0.16);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();

		this.aimArc.lineStyle(10, this.accentCoral, 0.28);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();

		this.aimArc.lineStyle(6, this.accentCoral, 0.9);
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

		this.aimArc.lineStyle(14, this.accentCoral, 0.2);
		this.aimArc.beginPath();
		this.aimArc.arc(this.ball.x, this.ball.y, radius, minAngle, maxAngle, false);
		this.aimArc.strokePath();


		// Draw top center arrow
		const centerAngle = this.aimSmoothCenterAngle;
		const tipDist = radius + 36;
		const baseDist = radius + 18;

		const tipX = this.ball.x + Math.cos(centerAngle) * tipDist;
		const tipY = this.ball.y + Math.sin(centerAngle) * tipDist;

		const baseCx = this.ball.x + Math.cos(centerAngle) * baseDist;
		const baseCy = this.ball.y + Math.sin(centerAngle) * baseDist;

		const perpX = Math.cos(centerAngle + Math.PI / 2) * 10;
		const perpY = Math.sin(centerAngle + Math.PI / 2) * 10;


		this.aimArc.fillStyle(this.accentCoral, 1);
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

		const headLen = 36 * pulse;
		const wing = 14 * pulse;
		const tipX = endX + dirX * 10;
		const tipY = endY + dirY * 10;
		const headBaseX = tipX - dirX * headLen;
		const headBaseY = tipY - dirY * headLen;
		const leftX = headBaseX + nx * wing;
		const leftY = headBaseY + ny * wing;
		const rightX = headBaseX - nx * wing;
		const rightY = headBaseY - ny * wing;

		const shaftStartX = this.ball.x + dirX * 24;
		const shaftStartY = this.ball.y + dirY * 24;
		const shaftEndX = headBaseX - dirX * 8;
		const shaftEndY = headBaseY - dirY * 8;
		const fillEndX = Phaser.Math.Linear(shaftStartX, shaftEndX, powerFill);
		const fillEndY = Phaser.Math.Linear(shaftStartY, shaftEndY, powerFill);

		this.aimCenterArrow.clear();

		// Always-visible transparent rotating arrow body.
		this.aimCenterArrow.lineStyle(20, this.accentBlue, 0.16);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(shaftEndX, shaftEndY);
		this.aimCenterArrow.strokePath();

		this.aimCenterArrow.lineStyle(10, 0xeaffff, 0.18);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(shaftEndX, shaftEndY);
		this.aimCenterArrow.strokePath();

		// Fill grows from start to end while arrow stays present.
		this.aimCenterArrow.lineStyle(16, this.accentCoral, 0.42 + powerFill * 0.28);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(fillEndX, fillEndY);
		this.aimCenterArrow.strokePath();

		this.aimCenterArrow.lineStyle(8, 0xeaffff, 0.52 + powerFill * 0.36);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(shaftStartX, shaftStartY);
		this.aimCenterArrow.lineTo(fillEndX, fillEndY);
		this.aimCenterArrow.strokePath();

		// Transparent arrow head always visible.
		this.aimCenterArrow.fillStyle(this.accentBlue, 0.16);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.fillPath();

		this.aimCenterArrow.lineStyle(6, this.accentBlue, 0.46);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.strokePath();

		// Filled core on top.
		this.aimCenterArrow.fillStyle(0xeaffff, 0.2 + powerFill * 0.72);
		this.aimCenterArrow.beginPath();
		this.aimCenterArrow.moveTo(tipX, tipY);
		this.aimCenterArrow.lineTo(leftX, leftY);
		this.aimCenterArrow.lineTo(rightX, rightY);
		this.aimCenterArrow.closePath();
		this.aimCenterArrow.fillPath();

		if (powerFill >= 0.999) {
			const pulseT = (Math.sin(this.time.now * 0.02) + 1) * 0.5;
			const innerR = Phaser.Math.Linear(14, 24, pulseT);
			const outerR = innerR + Phaser.Math.Linear(12, 22, pulseT);
			const ringAlpha = Phaser.Math.Linear(0.62, 0.18, pulseT);

			this.aimCenterArrow.lineStyle(12, this.accentBlue, 0.22);
			this.aimCenterArrow.beginPath();
			this.aimCenterArrow.moveTo(shaftEndX, shaftEndY);
			this.aimCenterArrow.lineTo(tipX, tipY);
			this.aimCenterArrow.strokePath();

			this.aimCenterArrow.lineStyle(8, 0xeaffff, 0.64);
			this.aimCenterArrow.strokeCircle(tipX, tipY, innerR);

			this.aimCenterArrow.lineStyle(4, this.accentCoral, ringAlpha);
			this.aimCenterArrow.strokeCircle(tipX, tipY, outerR);

			for (let i = 0; i < 6; i++) {
				const rayA = angle + i * (Math.PI / 3);
				const rayStart = outerR + 1;
				const rayLen = Phaser.Math.Linear(6, 18, pulseT);
				const rx0 = tipX + Math.cos(rayA) * rayStart;
				const ry0 = tipY + Math.sin(rayA) * rayStart;
				const rx1 = tipX + Math.cos(rayA) * (rayStart + rayLen);
				const ry1 = tipY + Math.sin(rayA) * (rayStart + rayLen);
				this.aimCenterArrow.lineStyle(4, 0xeaffff, 0.4 * (1 - pulseT) + 0.2);
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

		this.drawNeonTailLayer(this.tailRibbon, this.accentBlue, 0.2, 1.8, speed);
		this.drawNeonTailLayer(this.tailCore, this.accentCoral, 0.35, 1, speed);

		if (this.tailPoints.length >= 2) {
			const sparkleAlpha = Phaser.Math.Clamp(0.2 + speed / this.maxLaunchPower * 0.3, 0.15, 0.45);
			this.tailCore.lineStyle(2, this.highlightColor, sparkleAlpha);
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

	private getDifficulty(): number {
		const height = Math.max(0, this.startY - this.ball.y);
		return Phaser.Math.Clamp(height / 10000, 0, 1);
	}

	private updateWorld(dt: number) {
		this.floorY -= this.floorRiseSpeed * dt;
		const d = this.getDifficulty();
		this.floorRiseSpeed += (2.2 + d * 1.5) * dt;

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
			} else if (barrier.type === 'MINE_FIELD') {
				this.updateMineField(barrier, dt);
			} else if (barrier.type === 'LASER_GRID') {
				this.updateLaserGrid(barrier, dt);
			} else if (barrier.type === 'PULSE_RING') {
				this.updatePulseRing(barrier, dt);
			} else if (barrier.type === 'TELEPORT_GATE') {
				this.updateTeleportGate(barrier, dt);
			} else if (barrier.type === 'BOUNCE_SPEED_ZONE') {
				this.updateBounceSpeedZone(barrier, dt);
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
				} else if (barrier.type === 'MINE_FIELD') {
					passedThreshold = barrier.y - 200 - this.ballRadius;
				} else if (barrier.type === 'LASER_GRID') {
					passedThreshold = barrier.y - (barrier.laserBandHeight || 220) * 0.5 - this.ballRadius;
				} else if (barrier.type === 'PULSE_RING') {
					passedThreshold = barrier.y - (barrier.pulseMaxRadius || 220) - this.ballRadius;
				} else if (barrier.type === 'TELEPORT_GATE') {
					passedThreshold = barrier.y - (barrier.teleportRadius || 34) - this.ballRadius;
				} else if (barrier.type === 'BOUNCE_SPEED_ZONE') {
					passedThreshold = barrier.y - (barrier.bsZoneHeight || 260) * 0.5 - this.ballRadius;
				} else {
					passedThreshold = barrier.y + this.ballRadius;
				}

				if (this.ball.y < passedThreshold) {
					barrier.passed = true;
					// Score is now height-based, no increment here
					this.launchFx.explode(22, this.ball.x, this.ball.y);
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

		const glow = this.add.circle(3, 3, this.pickupRadius + 6, this.shadowColor, 0.2);
		const core = this.add.circle(0, 0, this.pickupRadius, 0xFFE082, 0.95)
			.setStrokeStyle(3, 0xFFD54F, 1);
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
		if (barrier.mines) {
			for (const mine of barrier.mines) {
				mine.graphics.destroy();
				mine.glow.destroy();
			}
		}
		barrier.mineFieldBorder?.destroy();
		barrier.mineFieldGlow?.destroy();
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
		barrier.pulseRingSoft?.destroy();
		barrier.bsZoneGraphics?.destroy();
		barrier.bsIconGraphics?.destroy();
	}

	private fillBarriersAhead() {
		const topY = this.cameras.main.scrollY;
		const spawnEndY = topY - this.spawnAheadMax;
		const d = this.getDifficulty();
		const spacingMin = this.barrierSpacingMin - Math.floor(d * 40);
		const spacingMax = this.barrierSpacingMax - Math.floor(d * 60);
		while (this.nextBarrierSpawnY >= spawnEndY) {
			this.spawnBarrier(this.nextBarrierSpawnY);
			this.nextBarrierSpawnY -= Phaser.Math.Between(spacingMin, spacingMax);
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
			trapType = 'MINE_FIELD';
		} else if (rand < 0.78) {
			trapType = 'LASER_GRID';
		} else if (rand < 0.88) {
			trapType = 'PULSE_RING';
		} else if (rand < 0.95) {
			trapType = 'TELEPORT_GATE';
		} else {
			trapType = 'BOUNCE_SPEED_ZONE';
		}

		let heightReserved = 0;

		if (trapType === 'STATIC_GAP') {
			this.spawnStaticBarrier(spawnY);
			heightReserved = Phaser.Math.Between(this.barrierSpacingMin, this.barrierSpacingMax);
		} else if (trapType === 'ROTATING_BAR') {
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
		} else if (trapType === 'MINE_FIELD') {
			this.spawnMineField(spawnY);
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
		} else if (trapType === 'BOUNCE_SPEED_ZONE') {
			this.spawnBounceSpeedZone(spawnY);
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
		const radius = 72;
		const d = this.getDifficulty();
		const turretAngle = Math.random() * Math.PI * 2;
		const turretAngularVelocity = Phaser.Math.FloatBetween(0.45 + d * 0.3, 0.95 + d * 0.5) * (Math.random() > 0.5 ? 1 : -1);

		const glow = this.add.graphics().setDepth(26);
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
			turretShootInterval: Phaser.Math.FloatBetween(0.7 - d * 0.2, 1.05 - d * 0.25),
			turretShotIndex: Phaser.Math.Between(0, 5),
			turretGraphics: body,
			turretGlowGraphics: glow,
			turretProjectiles: [],
			turretProjectileSpeed: Phaser.Math.Between(160 + Math.floor(d * 60), 220 + Math.floor(d * 80)),
			turretProjectileLife: Phaser.Math.FloatBetween(1.7 + d * 0.3, 2.35 + d * 0.4)
		});
	}

	private drawHexagonTurret(
		glowGraphics: Phaser.GameObjects.Graphics,
		bodyGraphics: Phaser.GameObjects.Graphics,
		radius: number
	) {
		glowGraphics.clear();
		glowGraphics.fillStyle(this.shadowColor, 0.4);
		glowGraphics.beginPath();
		this.traceRegularPolygonPath(glowGraphics, 6, 6, radius + 10, 6);
		glowGraphics.closePath();
		glowGraphics.fillPath();

		bodyGraphics.clear();
		bodyGraphics.fillStyle(this.accentLavender, 1);
		bodyGraphics.beginPath();
		this.traceRegularPolygonPath(bodyGraphics, 0, 0, radius, 6);
		bodyGraphics.closePath();
		bodyGraphics.fillPath();

		bodyGraphics.lineStyle(6, this.accentCoral, 1);
		bodyGraphics.beginPath();
		this.traceRegularPolygonPath(bodyGraphics, 0, 0, radius, 6);
		bodyGraphics.closePath();
		bodyGraphics.strokePath();

		bodyGraphics.fillStyle(0xE1BEE7, 0.6);
		bodyGraphics.beginPath();
		this.traceRegularPolygonPath(bodyGraphics, -4, -4, radius * 0.7, 6);
		bodyGraphics.closePath();
		bodyGraphics.fillPath();

		bodyGraphics.fillStyle(0xffffff, 0.9);
		bodyGraphics.fillCircle(0, 0, radius * 0.35);
		bodyGraphics.lineStyle(2, this.accentLavender, 0.8);
		bodyGraphics.strokeCircle(0, 0, radius * 0.32);
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

		const glow = this.add.rectangle(x + 2, y + 2, size + 6, size + 6, this.shadowColor, 0.3)
			.setDepth(28);
		const body = this.add.rectangle(x, y, size, size, this.accentLavender, 1)
			.setStrokeStyle(2, this.accentCoral, 0.9)
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

	private spawnMineField(spawnY: number) {
		const d = this.getDifficulty();
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const centerX = (leftWall + rightWall) * 0.5;
		const mineCount = Phaser.Math.Between(5, 6);
		const verticalSpread = Phaser.Math.Between(280, 380);
		const mineRadius = 24;
		const mines: MineUnit[] = [];

		for (let i = 0; i < mineCount; i++) {
			const t = mineCount <= 1 ? 0.5 : i / (mineCount - 1);
			const my = spawnY + Phaser.Math.Linear(-verticalSpread * 0.5, verticalSpread * 0.5, t);
			const lw = this.getSideWallX(my, true) + 40;
			const rw = this.getSideWallX(my, false) - 40;
			const mx = Phaser.Math.Between(lw, rw);

			const g = this.add.graphics().setDepth(32);
			const glow = this.add.circle(mx, my, mineRadius + 8, this.accentCoral, 0).setDepth(28);

			mines.push({ x: mx, y: my, armed: false, graphics: g, glow });
		}

		const armedCount = Math.min(Phaser.Math.Between(2, 2 + Math.floor(d * 2)), 4);
		const indices = Array.from({ length: mineCount }, (_, i) => i);
		Phaser.Utils.Array.Shuffle(indices);
		for (let i = 0; i < armedCount; i++) {
			mines[indices[i]].armed = true;
		}

		this.barriers.push({
			type: 'MINE_FIELD',
			y: spawnY,
			passed: false,
			mineFieldCenterX: centerX,
			mineFieldRadius: mineRadius,
			mines,
			minePatternTimer: Phaser.Math.FloatBetween(1.6, 2.2),
			minePatternDuration: Phaser.Math.FloatBetween(1.6, 2.2),
		});
	}

	private updateMineField(barrier: Barrier, dt: number) {
		if (!barrier.mines || barrier.minePatternTimer === undefined || barrier.minePatternDuration === undefined || barrier.mineFieldRadius === undefined) return;

		const d = this.getDifficulty();
		const mineRadius = barrier.mineFieldRadius;
		const now = this.time.now * 0.001;

		barrier.minePatternTimer -= dt;
		if (barrier.minePatternTimer <= 0) {
			const armedCount = Math.min(Phaser.Math.Between(2, 2 + Math.floor(d * 2)), 4);
			for (const mine of barrier.mines) mine.armed = false;
			const indices = Array.from({ length: barrier.mines.length }, (_, i) => i);
			Phaser.Utils.Array.Shuffle(indices);
			for (let i = 0; i < armedCount; i++) {
				barrier.mines[indices[i]].armed = true;
			}
			barrier.minePatternDuration = Phaser.Math.FloatBetween(1.6, 2.2);
			barrier.minePatternTimer = barrier.minePatternDuration;
		}

		for (const mine of barrier.mines) {
			const g = mine.graphics;
			g.clear();

			if (mine.armed) {
				const pulse = 1 + Math.sin(now * 8 + mine.x * 0.05 + mine.y * 0.03) * 0.12;
				const r = mineRadius * pulse;
				g.fillStyle(this.shadowColor, 0.5);
				g.fillCircle(mine.x + 5, mine.y + 5, r);
				g.fillStyle(this.accentCoral, 1);
				g.fillCircle(mine.x, mine.y, r);
				g.fillStyle(0xFFCDD2, 0.7);
				g.fillCircle(mine.x - 5, mine.y - 6, r * 0.45);
				g.fillStyle(0xffffff, 0.8);
				g.fillCircle(mine.x - 6, mine.y - 7, r * 0.22);
				mine.glow.x = mine.x;
				mine.glow.y = mine.y;
				mine.glow.setFillStyle(this.accentCoral, 0.15 + pulse * 0.1);
				mine.glow.setScale(pulse);
				mine.glow.setVisible(true);
			} else {
				g.fillStyle(this.shadowColor, 0.3);
				g.fillCircle(mine.x + 4, mine.y + 4, mineRadius);
				g.fillStyle(0xD7CCC8, 1);
				g.fillCircle(mine.x, mine.y, mineRadius);
				g.fillStyle(0xEFEBE9, 0.6);
				g.fillCircle(mine.x - 4, mine.y - 5, mineRadius * 0.4);
				mine.glow.setVisible(false);
			}
		}
	}

	private spawnLaserGrid(spawnY: number) {
		const d = this.getDifficulty();
		const beamCount = 4 + Math.floor(d * 2);
		const bandHeight = Phaser.Math.Between(210, 250);
		const thickness = Phaser.Math.Between(18, 24);
		const perBeamDuration = Phaser.Math.FloatBetween(0.32 - d * 0.08, 0.48 - d * 0.1);
		const allOffDuration = 3 - d * 1.2;
		const units: LaserBeamUnit[] = [];

		for (let i = 0; i < beamCount; i++) {
			const t = beamCount <= 1 ? 0.5 : i / (beamCount - 1);
			const yOffset = Phaser.Math.Linear(-bandHeight * 0.42, bandHeight * 0.42, t);
			
			const glow = this.add.graphics().setDepth(24);
			const beam = this.add.graphics().setDepth(31);

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

			const pulse = 0.74 + (Math.sin(now * 14 + i * 1.3 + barrier.y * 0.02) + 1) * 0.12;
			const beamTargetAlpha = active ? pulse : (allOffPhase ? 0.18 : 0.24);
			const glowTargetAlpha = active ? 0.22 + pulse * 0.3 : (allOffPhase ? 0.12 : 0.18);
			
			// Custom soft alpha tracking since we don't have .alpha on drawing
			unit.beam.alpha += (beamTargetAlpha - unit.beam.alpha) * 0.24;
			unit.glow.alpha += (glowTargetAlpha - unit.glow.alpha) * 0.24;

			unit.beam.clear();
			unit.beam.fillStyle(this.accentCoral, 1);
			unit.beam.fillRoundedRect(leftWall, y - barrier.laserThickness / 2, width, barrier.laserThickness, barrier.laserThickness / 2);
			unit.beam.lineStyle(4, 0xFFCDD2, 1);
			unit.beam.strokeRoundedRect(leftWall, y - barrier.laserThickness / 2, width, barrier.laserThickness, barrier.laserThickness / 2);

			unit.glow.clear();
			unit.glow.fillStyle(this.shadowColor, 0.4);
			unit.glow.fillRoundedRect(leftWall + 4, y - barrier.laserThickness / 2 + 4, width, barrier.laserThickness + 4, barrier.laserThickness / 2);
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
				Phaser.Math.Between(220, 320),
				Math.min(centerX - leftWall, rightWall - centerX) - 24
			),
			160,
			350
		);
		const d = this.getDifficulty();
		const startRadius = 32;
		const bandWidth = Phaser.Math.Between(34, 46);
		const speed = Phaser.Math.Between(170 + Math.floor(d * 80), 245 + Math.floor(d * 100));

		const glow = this.add.circle(centerX + 6, spawnY + 6, maxRadius * 0.45, this.shadowColor, 0.25)
			.setDepth(22);
		const ring = this.add.circle(centerX, spawnY, startRadius, 0, 0)
			.setStrokeStyle(12, this.accentBlue, 0.85)
			.setDepth(30);
		const core = this.add.circle(centerX, spawnY, 28, this.accentBlue, 0.9)
			.setStrokeStyle(6, this.accentCoral, 0.9)
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

		const d = this.getDifficulty();
		const holdDuration = 1.5;
		const waitDuration = Math.max(1.2, 2.5 - d * 1.0);

		if (barrier.pulseHoldTimer === undefined) barrier.pulseHoldTimer = 0;
		if (barrier.pulseWaitTimer === undefined) barrier.pulseWaitTimer = 0;

		let isLethal = false;

		if (barrier.pulseWaitTimer > 0) {
			barrier.pulseWaitTimer -= dt;
			barrier.pulseCurrentRadius = barrier.pulseStartRadius;
			isLethal = false;
		} else if (barrier.pulseHoldTimer > 0) {
			barrier.pulseHoldTimer -= dt;
			barrier.pulseCurrentRadius = barrier.pulseMaxRadius;
			isLethal = true;
			if (barrier.pulseHoldTimer <= 0) {
				barrier.pulseWaitTimer = waitDuration;
				barrier.pulseCurrentRadius = barrier.pulseStartRadius;
			}
		} else {
			barrier.pulseCurrentRadius += barrier.pulseSpeed * dt;
			isLethal = true;
			if (barrier.pulseCurrentRadius >= barrier.pulseMaxRadius) {
				barrier.pulseCurrentRadius = barrier.pulseMaxRadius;
				barrier.pulseHoldTimer = holdDuration;
				this.launchFx.explode(10, barrier.pulseCenterX, barrier.y);
			}
		}

		const now = this.time.now * 0.001;
		const progress = Phaser.Math.Clamp(
			(barrier.pulseCurrentRadius - barrier.pulseStartRadius) / Math.max(1, barrier.pulseMaxRadius - barrier.pulseStartRadius),
			0,
			1
		);
		const color = isLethal ? this.accentCoral : this.accentMint;
		const ringAlpha = isLethal ? (0.55 + (1 - progress) * 0.35) : 0.3;

		barrier.pulseRing.x = barrier.pulseCenterX;
		barrier.pulseRing.y = barrier.y;
		barrier.pulseRing.radius = barrier.pulseCurrentRadius;
		barrier.pulseRing.setStrokeStyle(12, color, ringAlpha);

		barrier.pulseCore.x = barrier.pulseCenterX;
		barrier.pulseCore.y = barrier.y;
		barrier.pulseCore.setScale(0.92 + Math.sin(now * 9.2 + barrier.y * 0.02) * 0.09);
		barrier.pulseCore.setStrokeStyle(6, isLethal ? this.accentCoral : this.accentMint, 0.86 + (1 - progress) * 0.14);

		barrier.pulseGlow.x = barrier.pulseCenterX;
		barrier.pulseGlow.y = barrier.y;
		barrier.pulseGlow.setScale(0.86 + progress * 0.52);
		barrier.pulseGlow.setFillStyle(color, isLethal ? (0.07 + (1 - progress) * 0.12) : 0.04);
	}

	private spawnTeleportGate(spawnY: number) {
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const portalRadius = 46;
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

		const glowA = this.add.circle(portalAX + 6, spawnY + 6, portalRadius + 8, this.shadowColor, 0.4)
			.setDepth(24);
		const glowB = this.add.circle(portalBX + 6, spawnY + 6, portalRadius + 8, this.shadowColor, 0.4)
			.setDepth(24);
		const portalA = this.add.circle(portalAX, spawnY, portalRadius, this.accentLavender, 0.95)
			.setStrokeStyle(8, 0xE1BEE7, 1)
			.setDepth(32);
		const portalB = this.add.circle(portalBX, spawnY, portalRadius, this.accentMint, 0.95)
			.setStrokeStyle(8, 0x80CBC4, 1)
			.setDepth(32);
		const link = this.add.graphics().setDepth(26);

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
		barrier.teleportA.setStrokeStyle(4, 0xE1BEE7, 0.84 + pulseA * 0.08);

		barrier.teleportB.x = barrier.teleportBX;
		barrier.teleportB.y = barrier.y;
		barrier.teleportB.setScale(0.96 + pulseB * 0.08);
		barrier.teleportB.rotation -= dt * 1.05;
		barrier.teleportB.setStrokeStyle(4, 0x80CBC4, 0.84 + pulseB * 0.08);

		const link = barrier.teleportLink;
		const wave = Math.sin(now * 4.6 + barrier.y * 0.02) * 24;
		const midX = (barrier.teleportAX + barrier.teleportBX) * 0.5;
		const span = Math.max(1, barrier.teleportBX - barrier.teleportAX);
		const segments = 18;
		link.clear();
		link.lineStyle(4, this.accentLavender, 0.3);
		link.beginPath();
		link.moveTo(barrier.teleportAX, barrier.y);
		for (let i = 1; i <= segments; i++) {
			const t = i / segments;
			const x = barrier.teleportAX + span * t;
			const curve = Math.sin(t * Math.PI) * wave;
			link.lineTo(x, barrier.y - curve);
		}
		link.strokePath();
		link.lineStyle(2, this.accentMint, 0.4);
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
	}

	private spawnBounceSpeedZone(spawnY: number) {
		const d = this.getDifficulty();
		const zoneHeight = Phaser.Math.Between(300 + Math.floor(d * 40), 380 + Math.floor(d * 60));
		const zoneGraphics = this.add.graphics().setDepth(20);
		const iconGraphics = this.add.graphics().setDepth(24);
		const initialMode: 'BOUNCE' | 'SPEED' = Math.random() > 0.5 ? 'BOUNCE' : 'SPEED';

		this.barriers.push({
			type: 'BOUNCE_SPEED_ZONE',
			y: spawnY,
			passed: false,
			bsMode: initialMode,
			bsModeTimer: 2.5,
			bsModeDuration: 2.5,
			bsZoneGraphics: zoneGraphics,
			bsIconGraphics: iconGraphics,
			bsTransitionAlpha: 1,
			bsZoneHeight: zoneHeight,
		});
	}

	private updateBounceSpeedZone(barrier: Barrier, dt: number) {
		if (
			!barrier.bsMode ||
			barrier.bsModeTimer === undefined ||
			barrier.bsModeDuration === undefined ||
			!barrier.bsZoneGraphics ||
			!barrier.bsIconGraphics ||
			barrier.bsZoneHeight === undefined
		) {
			return;
		}

		barrier.bsModeTimer -= dt;
		if (barrier.bsModeTimer <= 0) {
			barrier.bsMode = barrier.bsMode === 'BOUNCE' ? 'SPEED' : 'BOUNCE';
			barrier.bsModeDuration = 2.5;
			barrier.bsModeTimer = barrier.bsModeDuration;
			barrier.bsTransitionAlpha = 0;
		}
		barrier.bsTransitionAlpha = Phaser.Math.Clamp((barrier.bsTransitionAlpha || 0) + dt * 3, 0, 1);

		const top = barrier.y - barrier.bsZoneHeight * 0.5;
		const now = this.time.now * 0.001;
		const isSpeed = barrier.bsMode === 'SPEED';
		const zoneColor = isSpeed ? this.accentMint : 0xFFE082;
		const alpha = barrier.bsTransitionAlpha;

		const zoneG = barrier.bsZoneGraphics;
		zoneG.clear();
		zoneG.fillStyle(zoneColor, 0.08 * alpha);
		zoneG.fillRoundedRect(4, top, this.worldWidth - 8, barrier.bsZoneHeight, 16);
		zoneG.lineStyle(6, zoneColor, 0.45 * alpha);
		zoneG.strokeRoundedRect(4, top, this.worldWidth - 8, barrier.bsZoneHeight, 16);

		const iconG = barrier.bsIconGraphics;
		iconG.clear();
		const chevronCount = 4;
		const chevronSpacing = barrier.bsZoneHeight / (chevronCount + 1);
		for (let i = 0; i < chevronCount; i++) {
			const cy = top + chevronSpacing * (i + 1);
			const cx = this.worldWidth * 0.5;
			const size = 18;
			const animOffset = Math.sin(now * 3 + i * 0.8) * 6;
			const chevronAlpha = 0.25 + Math.sin(now * 4 + i * 1.2) * 0.15;

			iconG.lineStyle(3, zoneColor, chevronAlpha * alpha);
			iconG.beginPath();
			if (isSpeed) {
				iconG.moveTo(cx - size, cy + size * 0.5 + animOffset);
				iconG.lineTo(cx, cy - size * 0.5 + animOffset);
				iconG.lineTo(cx + size, cy + size * 0.5 + animOffset);
			} else {
				iconG.moveTo(cx - size, cy - size * 0.5 + animOffset);
				iconG.lineTo(cx, cy + size * 0.5 + animOffset);
				iconG.lineTo(cx + size, cy - size * 0.5 + animOffset);
			}
			iconG.strokePath();
		}

		if (this.ball.y > top && this.ball.y < top + barrier.bsZoneHeight) {
			const speed = Math.hypot(this.ballVx, this.ballVy);
			if (isSpeed) {
				const boostFactor = Phaser.Math.Clamp(speed / 400, 0.5, 2.5);
				this.ballVy -= 800 * boostFactor * dt;
			} else {
				this.ballVy *= (1 - 2.5 * dt);
				this.ballVx *= (1 - 1.5 * dt);
				if (speed < 60) {
					this.ballVy += 200 * dt;
				}
			}
		}
	}

	private spawnStaticBarrier(spawnY: number) {
		const d = this.getDifficulty();
		const gapMargin = 65;
		const leftWall = this.getSideWallX(spawnY, true);
		const rightWall = this.getSideWallX(spawnY, false);
		const inTriangleZone = this.getSideWallOffset(spawnY) > 0.5;
		const scaledGap = Phaser.Math.Linear(this.gapWidth, this.gapWidthMin, d);
		const desiredGapWidth = scaledGap * (inTriangleZone ? 3 : 2);
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
		const r = this.barrierHeight / 2;

		const leftGlow = this.add.graphics();
		leftGlow.setDepth(25).fillStyle(this.shadowColor, 0.4);
		leftGlow.fillRoundedRect(3, 3 - this.barrierHeight / 2, leftWidth, this.barrierHeight, {tl:0, tr:r, br:r, bl:0} as any);
		leftGlow.y = spawnY;

		const rightGlow = this.add.graphics();
		rightGlow.setDepth(25).fillStyle(this.shadowColor, 0.4);
		rightGlow.fillRoundedRect(rightX + 3, 3 - this.barrierHeight / 2, rightWidth, this.barrierHeight, {tl:r, tr:0, br:0, bl:r} as any);
		rightGlow.y = spawnY;

		const left = this.add.graphics();
		left.setDepth(30).fillStyle(this.highlightColor, 1);
		left.fillRoundedRect(0, -this.barrierHeight / 2, leftWidth, this.barrierHeight, {tl:0, tr:r, br:r, bl:0} as any);
		left.lineStyle(4, 0xD7CCC8, 1);
		left.strokeRoundedRect(0, -this.barrierHeight / 2, leftWidth, this.barrierHeight, {tl:0, tr:r, br:r, bl:0} as any);
		left.y = spawnY;

		const right = this.add.graphics();
		right.setDepth(30).fillStyle(this.highlightColor, 1);
		right.fillRoundedRect(rightX, -this.barrierHeight / 2, rightWidth, this.barrierHeight, {tl:r, tr:0, br:0, bl:r} as any);
		right.lineStyle(4, 0xD7CCC8, 1);
		right.strokeRoundedRect(rightX, -this.barrierHeight / 2, rightWidth, this.barrierHeight, {tl:r, tr:0, br:0, bl:r} as any);
		right.y = spawnY;

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
		const d = this.getDifficulty();
		const height = 300;
		const direction = Math.random() > 0.5 ? 1 : -1;
		const windForce = (1400 + Math.floor(d * 600)) * direction;

		const g = this.add.graphics();
		g.setDepth(20);

		const color = direction === 1 ? this.accentMint : 0xFFE082;
		g.fillStyle(color, 0.08);
		g.fillRoundedRect(4, spawnY - height / 2, this.worldWidth - 8, height, 16);

		// Create arrows group
		const arrowGroup = this.add.group();
		const arrowCount = 5;
		const spacing = this.worldWidth / (arrowCount - 1);

		for (let i = 0; i < arrowCount + 1; i++) {
			const arrowG = this.add.graphics();
			arrowG.setDepth(21);

			const w = 60;
			const h = 100;
			const chevColor = direction === 1 ? this.accentMint : 0xFFE082;

			arrowG.lineStyle(10, this.shadowColor, 0.3);
			arrowG.beginPath();
			if (direction === 1) {
				arrowG.moveTo(-w / 2 + 4, -h / 2 + 4);
				arrowG.lineTo(w / 2 + 4, 0 + 4);
				arrowG.lineTo(-w / 2 + 4, h / 2 + 4);
			} else {
				arrowG.moveTo(w / 2 + 4, -h / 2 + 4);
				arrowG.lineTo(-w / 2 + 4, 0 + 4);
				arrowG.lineTo(w / 2 + 4, h / 2 + 4);
			}
			arrowG.strokePath();

			arrowG.lineStyle(8, chevColor, 0.9);
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

		if (barrier.windGraphics) {
			barrier.windGraphics.clear();
			const color = barrier.windDirection === 1 ? this.accentMint : 0xFFE082;
			const pulse = 0.04 + Math.sin(this.time.now * 0.002) * 0.02;
			barrier.windGraphics.fillStyle(color, pulse);
			barrier.windGraphics.fillRoundedRect(4, top, this.worldWidth - 8, height, 12);
		}
	}

	private spawnSideMover(spawnY: number, spawnDouble: boolean) {
		const d = this.getDifficulty();
		const size = 60;
		const padding = 28;
		const speed = Phaser.Math.Between(180 + Math.floor(d * 60), 260 + Math.floor(d * 80));
		const waitAtEnd = Math.max(0.3, 1.0 - d * 0.4);
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

			const glow = this.add.graphics();
			glow.setDepth(27).fillStyle(this.shadowColor, 0.4);
			glow.fillRoundedRect(-size / 2 + 5, -size / 2 + 5, size, size, 16);
			glow.x = x;
			glow.y = y;

			const square = this.add.graphics();
			square.setDepth(32).fillStyle(this.accentBlue, 1);
			square.fillRoundedRect(-size / 2, -size / 2, size, size, 16);
			square.lineStyle(4, 0xBBDEFB, 1);
			square.strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
			square.x = x;
			square.y = y;

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
		const d = this.getDifficulty();
		const len = 300;
		const thickness = 40;
		const baseMin = 0.8 + d * 0.6;
		const baseMax = 1.8 + d * 0.8;
		const angularVel = Phaser.Math.FloatBetween(baseMin, baseMax) * (Math.random() > 0.5 ? 1 : -1);

		const barG = this.add.graphics();
		barG.setDepth(30);
		barG.x = centerX;
		barG.y = spawnY;

		barG.fillStyle(this.barrierColor, 1);
		barG.fillRoundedRect(-len / 2, -thickness / 2, len, thickness, thickness / 2);
		barG.lineStyle(4, 0xD7CCC8, 1);
		barG.strokeRoundedRect(-len / 2, -thickness / 2, len, thickness, thickness / 2);

		barG.fillStyle(this.accentCoral, 1);
		barG.fillCircle(0, 0, 24);
		barG.fillStyle(0xFFCDD2, 0.6);
		barG.fillCircle(-6, -6, 10);
		barG.lineStyle(4, 0xD7CCC8, 1);
		barG.strokeCircle(0, 0, 24);

		const glowG = this.add.graphics();
		glowG.setDepth(25);
		glowG.x = centerX;
		glowG.y = spawnY;

		glowG.fillStyle(this.shadowColor, 0.4);
		glowG.fillRoundedRect(-len / 2 + 5, -thickness / 2 + 5, len, thickness, thickness / 2);
		glowG.fillCircle(5, 5, 24);

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
			} else if (barrier.type === 'MINE_FIELD') {
				if (!barrier.mines || barrier.mineFieldRadius === undefined) continue;
				for (const mine of barrier.mines) {
					if (!mine.armed) continue;
					const dist = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, mine.x, mine.y);
					if (dist <= trapHitRadius + barrier.mineFieldRadius) {
						this.endGame();
						return;
					}
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
				const isSafe = (barrier.pulseWaitTimer || 0) > 0;
				if (!isSafe) {
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
			} else if (barrier.type === 'MINE_FIELD') {
				if (!barrier.mines || barrier.mineFieldRadius === undefined) continue;
				for (const mine of barrier.mines) {
					if (!mine.armed) continue;
					g.lineStyle(2, 0xff6666, 0.9);
					g.strokeCircle(mine.x, mine.y, barrier.mineFieldRadius);
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
			} else if (barrier.type === 'BOUNCE_SPEED_ZONE') {
				if (barrier.bsZoneHeight === undefined) continue;
				const top = barrier.y - barrier.bsZoneHeight * 0.5;
				g.lineStyle(2, 0x66cc99, 0.62);
				g.strokeRect(0, top, this.worldWidth, barrier.bsZoneHeight);
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

		const blastRing = this.add.circle(this.ball.x, this.ball.y, 24, this.accentCoral, 0.7)
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
		if (this.settings.music && !this.bgMusic.isPlaying) {
			this.bgMusic.play();
		}
	}

	private playSfx(key: string) {
		if (this.settings.fx) {
			this.sound.play(key, { volume: 0.85 });
		}
	}

	private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error") {
		if (this.settings.haptics) {
			oasiz.triggerHaptic(type);
		}
	}

	private initUI() {
		const pauseBtn = document.getElementById("btn-pause");
		const resumeBtn = document.getElementById("btn-resume");
		const restartPauseBtn = document.getElementById("btn-restart-pause");
		const restartGameOverBtn = document.getElementById("btn-restart-gameover");
		const quitBtn = document.getElementById("btn-quit");
		const startGameBtn = document.getElementById("btn-start-game");
		const howToPlayBtn = document.getElementById("btn-how-to-play");
		const tutorialOverlay = document.getElementById("tutorial-carousel");
		const tutNextBtn = document.getElementById("tut-next");

		const pauseMenu = document.getElementById("pause-menu");
		const gameOverMenu = document.getElementById("game-over-menu");

		pauseMenu?.classList.add("hidden");
		gameOverMenu?.classList.add("hidden");
		tutorialOverlay?.classList.add("hidden");

		if (pauseBtn) pauseBtn.onclick = () => this.pauseGame();
		if (resumeBtn) resumeBtn.onclick = () => this.resumeGame();

		const showHowToPlay = () => {
			tutorialOverlay?.classList.remove("hidden");
		};

		const startNormalGame = () => {
			this.toggleMainMenu(false);
			this.isGameStarted = true;
			this.hintText.setVisible(true);
			this.ensureBgMusicPlaying();
			this.triggerHaptic("light");
		};

		if (startGameBtn) startGameBtn.onclick = () => {
			const tutCompleted = localStorage.getItem("tutorialCompleted") === "true";
			if (!tutCompleted) {
				showHowToPlay();
			} else {
				startNormalGame();
			}
		};

		if (howToPlayBtn) howToPlayBtn.onclick = () => {
			showHowToPlay();
		};

		if (tutNextBtn) tutNextBtn.onclick = (e) => {
			e.stopPropagation();
			localStorage.setItem("tutorialCompleted", "true");
			tutorialOverlay?.classList.add("hidden");
			startNormalGame();
			this.triggerHaptic("light");
		};

		if (restartPauseBtn) restartPauseBtn.onclick = () => {
			this.triggerHaptic("light");
			this.resumeGame();
			this.scene.restart({ quickRestart: true });
		};

		if (restartGameOverBtn) restartGameOverBtn.onclick = () => {
			this.triggerHaptic("light");
			gameOverMenu?.classList.add("hidden");
			document.getElementById("hud")?.classList.remove("hidden");
			this.scene.restart({ quickRestart: true });
		};

		if (quitBtn) quitBtn.onclick = () => {
			this.triggerHaptic("light");
			this.resumeGame();
			this.scene.restart({ quickRestart: false });
		};

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
		if (this.bgMusic?.isPlaying) this.bgMusic.pause();
		this.triggerHaptic("light");
	}

	private resumeGame() {
		this.scene.resume();
		document.getElementById("pause-menu")?.classList.add("hidden");
		document.getElementById("hud")?.classList.remove("hidden");
		if (this.settings.music && this.bgMusic && !this.bgMusic.isPlaying) this.bgMusic.play();
		this.triggerHaptic("light");
	}

	private showGameOverScreen() {
		const gameOverMenu = document.getElementById("game-over-menu");
		const finalScoreEl = document.getElementById("final-score");
		const hud = document.getElementById("hud");

		if (finalScoreEl) finalScoreEl.innerText = this.score.toString();

		hud?.classList.add("hidden");
		gameOverMenu?.classList.remove("hidden");

		oasiz.submitScore(this.score);
	}

	private toggleSetting(key: string) {
		const settingKey = key === "sfx" ? "fx" : key === "haptic" ? "haptics" : key;
		const current = this.settings[settingKey as keyof typeof this.settings];
		const next = !current;
		(this.settings as Record<string, boolean>)[settingKey] = next;
		this.saveSettings();
		this.applySettings(key, next);
		this.updateSettingUI(key, next);
		this.triggerHaptic("light");
	}

	private loadSettings() {
		const saved = localStorage.getItem("gameSettings");
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				this.settings = {
					music: parsed.music !== false,
					fx: parsed.fx !== false,
					haptics: parsed.haptics !== false,
				};
			} catch {
				this.settings = { music: true, fx: true, haptics: true };
			}
		}
		this.applySettings("music", this.settings.music);
		this.updateSettingUI("music", this.settings.music);
		this.applySettings("sfx", this.settings.fx);
		this.updateSettingUI("sfx", this.settings.fx);
		this.applySettings("haptic", this.settings.haptics);
		this.updateSettingUI("haptic", this.settings.haptics);
	}

	private saveSettings() {
		localStorage.setItem("gameSettings", JSON.stringify(this.settings));
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

		if (key === "haptic") {
			const hapticIcon = "vibration";
			if (icon) {
				icon.innerText = hapticIcon;
				if (enabled) {
					icon.classList.remove("icon-strikethrough");
				} else {
					icon.classList.add("icon-strikethrough");
				}
			}
			if (iconMain) {
				iconMain.innerText = hapticIcon;
				if (enabled) {
					iconMain.classList.remove("icon-strikethrough");
				} else {
					iconMain.classList.add("icon-strikethrough");
				}
			}
		} else {
			const iconName = key === "music" ? (enabled ? "music_note" : "music_off") :
				(enabled ? "volume_up" : "volume_off");
			if (icon) icon.innerText = iconName;
			if (iconMain) iconMain.innerText = iconName;
		}
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
		}
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
