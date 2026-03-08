
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import TerrainGenerator, { RockBody } from "../scripts/TerrainGenerator";
import SettingsModal from "../scripts/SettingsModal";
import ThemeManager, { SeasonType, TimeType } from "../scripts/ThemeManager";
import SkinManager, { SkinType } from "../scripts/SkinManager";
import {
	b2DefaultWorldDef, b2CreateWorld, b2DestroyWorld,
	b2DefaultBodyDef, b2CreateBody, b2DestroyBody,
	b2BodyType, b2Vec2, b2Rot,
	b2DefaultShapeDef, b2CreateCircleShape,
	b2Body_GetPosition, b2Body_GetLinearVelocity, b2Body_SetLinearVelocity,
	b2Body_SetAngularVelocity, b2Body_SetTransform,
	b2Body_SetGravityScale, b2Body_SetLinearDamping,
	b2Body_GetRotation, b2Rot_GetAngle,
	b2World_GetSensorEvents,
	b2Shape_GetUserData,
	b2CreateWorldArray,
	WorldStep,
} from 'phaser-box2d';
/* END-USER-IMPORTS */

export default class Level extends Phaser.Scene {

	constructor() {
		super("Level");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {
		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	// Box2D world and ball
	private worldId: any;
	private ballBodyId: any;
	// @ts-ignore Stored for potential future shape-level queries
	private ballShapeId: any;
	private readonly SCALE = 30;
	private physicsPaused: boolean = false;

	private graphics: Phaser.GameObjects.Graphics | undefined;
	private isDragging: boolean = false;
	private dragStartPoint: Phaser.Math.Vector2 | undefined;
	private scoreText: Phaser.GameObjects.Text | undefined;
	private holeText: Phaser.GameObjects.Text | undefined;
	private currentHole: number = 1;
	private shotsRemaining: number = 2;
	private shotVisuals: Phaser.GameObjects.Arc[] = [];
	private ballMoving: boolean = false;
	private isGameOver: boolean = false;
	private isTransitioning: boolean = false;
	private spawnPoint: { x: number, y: number } = { x: 0, y: 0 };
	private settingsModal: SettingsModal | undefined;
	private terrainGen: TerrainGenerator | undefined;
	private currentTerrain: any;
	private flagGraphics: Phaser.GameObjects.Graphics | undefined;
	private bgMusic: Phaser.Sound.BaseSound | undefined;
	private ballVisual: Phaser.GameObjects.Arc | Phaser.GameObjects.Container | undefined;
	private hasFiredShot: boolean = false;
	private stoppedTimer: number = 0;
	private isMenuOpen: boolean = true;
	private indicatorGraphics: Phaser.GameObjects.Graphics | undefined;
	private aimReadyGraphics: Phaser.GameObjects.Graphics | undefined;
	private aimReadyTime: number = 0;
	private sky: Phaser.GameObjects.Graphics | undefined;
	private lastTrailSpawnTime: number = 0;
	private tutorialContainer: Phaser.GameObjects.Container | undefined;
	private ghostPool: Phaser.GameObjects.Arc[] = [];
	private activeGhosts: { obj: Phaser.GameObjects.Arc; born: number; }[] = [];
	private readonly GHOST_POOL_SIZE = 24;
	private readonly GHOST_LIFESPAN = 800;
	private pendingRestart: boolean = false;
	private isPaused: boolean = false;
	private prevBallSpeed: number = 0;
	private slowTimer: number = 0;
	private lastVelXSign: number = 0;
	private directionChanges: number = 0;
	private oscillationDetected: boolean = false;
	private crawlTimer: number = 0;
	private gameOverFallbackTimer: number = 0;
	private bounceCount: number = 0;
	private aceStreak: number = 0;

	// Helper: get ball position in pixel coordinates
	private getBallPos(): { x: number, y: number } {
		if (!this.ballBodyId) return { x: 0, y: 0 };
		const pos = b2Body_GetPosition(this.ballBodyId);
		return { x: pos.x * this.SCALE, y: pos.y * this.SCALE };
	}

	// Helper: get ball velocity in Box2D m/s
	private getBallVel(): { x: number, y: number } {
		if (!this.ballBodyId) return { x: 0, y: 0 };
		const vel = b2Body_GetLinearVelocity(this.ballBodyId);
		return { x: vel.x, y: vel.y };
	}

	// Helper: get ball speed magnitude in m/s
	private getBallSpeed(): number {
		const vel = this.getBallVel();
		return Math.sqrt(vel.x * vel.x + vel.y * vel.y);
	}

	create() {
		// --- Explicit State Resets ---
		this.isGameOver = false;
		this.shotsRemaining = 2;
		this.ballMoving = false;
		this.shotVisuals = [];
		this.data.set('isWon', false);
		this.isTransitioning = false;
		this.hasFiredShot = false;
		this.stoppedTimer = 0;
		this.crawlTimer = 0;
		this.gameOverFallbackTimer = 0;
		this.isMenuOpen = true;
		this.pendingRestart = false;
		this.isPaused = false;
		this.prevBallSpeed = 0;
		this.slowTimer = 0;
		this.lastVelXSign = 0;
		this.directionChanges = 0;
		this.oscillationDetected = false;
		this.currentHole = 1;
		this.bounceCount = 0;
		this.aceStreak = 0;
		this.ballBodyId = null;
		this.ballShapeId = null;

		// --- Box2D World Creation ---
		b2CreateWorldArray();
		const worldDef = b2DefaultWorldDef();
		worldDef.gravity = new b2Vec2(0, 30);
		this.worldId = b2CreateWorld(worldDef);
		this.physicsPaused = false;

		// Indicator Graphics
		this.indicatorGraphics = this.add.graphics();
		this.indicatorGraphics.setDepth(100);
		this.indicatorGraphics.setScrollFactor(0);

		// Aim ready indicator (pulsing line when ball is idle)
		this.aimReadyGraphics = this.add.graphics();
		this.aimReadyGraphics.setDepth(50);
		this.aimReadyTime = 0;

		const width = this.scale.width;
		const height = this.scale.height;

		// --- Audio Setup ---
		if (!this.sound.get('GolfBgMusic')) {
			this.bgMusic = this.sound.add('GolfBgMusic', { loop: true, volume: 0.4 });
		} else {
			this.bgMusic = this.sound.get('GolfBgMusic');
		}

		// Background & Decoration
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);

		this.sky = this.add.graphics();
		this.sky.fillStyle(theme.sky, 1);
		this.sky.fillRect(0, 0, width, height);
		this.sky.setDepth(-100);
		this.sky.setScrollFactor(0);

		// --- Layered Parallax Mountain Ranges ---
		this.createMountainLayers(width, height, theme);

		// --- Multi-layer Fluffy Clouds with Ground Shadows ---
		this.createCloudsAndShadows(width, height, theme);

		// Terrain - pass Box2D world to generator
		this.terrainGen = new TerrainGenerator(this, this.worldId, this.SCALE);
		const currentScore = this.registry.get('score') || 0;
		const cappedScore = Math.min(currentScore, 100);
		const initialDifficulty = 1 + (cappedScore * (0.05 / 12));

		this.currentTerrain = this.terrainGen.generateTerrain(undefined, 0, initialDifficulty, theme, false, currentScore);

		// Setup DOM-based game over menu
		this.setupDOMGameOver();

		// Clean up old SettingsModal before creating new one
		if (this.settingsModal) {
			this.settingsModal.destroy();
		}
		this.settingsModal = new SettingsModal(this);
		this.settingsModal.create();

		// Clean up on scene shutdown/restart — wrapped in try-catch to prevent abort
		this.events.once('shutdown', () => {
			try {
				this.hideGameOverMenu();
				this.hidePauseMenu();
				this.settingsModal?.destroy();
				this.cleanupRockBodies();
				this.recycleAllGhosts();
				for (const g of this.ghostPool) g.destroy();
				this.ghostPool = [];
				this.scale.off('resize', this.onResize, this);
				if (this.currentTerrain?.waterGraphics) this.currentTerrain.waterGraphics.destroy();
				if (this.currentTerrain?.waterTimer) this.currentTerrain.waterTimer.destroy();
				if (this.worldId) {
					b2DestroyWorld(this.worldId);
					this.worldId = null;
				}
			} catch (_e) {
				console.warn('[Level] shutdown cleanup error', _e);
			}
		});

		this.drawFlag();

		// Setup DOM-based pause menu
		this.setupDOMPauseMenu();

		// Handle resize events
		this.scale.on('resize', this.onResize, this);

		// Smooth Entry
		this.cameras.main.fadeIn(500, 0, 0, 0);

		// Check if we should skip the menu (retry flow)
		const shouldSkip = this.registry.get('skipMenu') === true;
		if (shouldSkip) {
			this.registry.set('skipMenu', false);
			this.isMenuOpen = false;
			this.physicsPaused = false;
			this.settingsModal?.setVisible(true);
			document.getElementById('pauseBtn')?.classList.remove('hidden');
			if (localStorage.getItem('golf_settings_music') === 'true' && this.bgMusic && !this.bgMusic.isPlaying) {
				this.bgMusic.play();
			}
			this.startGameplay();
		} else {
			this.isMenuOpen = true;
			this.physicsPaused = true;
			this.scene.launch('Menu');

			// Hide HUD, Settings, and Pause on start screen
			this.settingsModal?.setVisible(false);
			document.getElementById('pauseBtn')?.classList.add('hidden');
			this.scoreText?.setVisible(false);
			this.holeText?.setVisible(false);
		}
	}

	public resumeFromMenu() {
		this.isMenuOpen = false;
		this.physicsPaused = false;

		// Show Settings and Pause button during gameplay
		this.settingsModal?.setVisible(true);
		document.getElementById('pauseBtn')?.classList.remove('hidden');

		// Start background music
		if (localStorage.getItem('golf_settings_music') === 'true' && this.bgMusic && !this.bgMusic.isPlaying) {
			this.bgMusic.play();
		}

		// Start gameplay
		this.startGameplay();
	}

	public updateTheme() {
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);

		if (this.sky) {
			const width = this.scale.width;
			const height = this.scale.height;
			this.sky.clear();
			this.sky.fillStyle(theme.sky, 1);
			this.sky.fillRect(0, 0, width, height);
		}

		if (this.terrainGen && this.currentTerrain) {
			this.terrainGen.redraw(this.currentTerrain, theme);
		}
	}

	private onResize() {
		const width = this.scale.width;
		const height = this.scale.height;

		if (this.sky) {
			const season = this.registry.get('season') as SeasonType || 'spring';
			const time = this.registry.get('time') as TimeType || 'day';
			const theme = ThemeManager.getColors(season, time);
			this.sky.clear();
			this.sky.fillStyle(theme.sky, 1);
			this.sky.fillRect(0, 0, width, height);
		}

		if (this.shotVisuals && this.shotVisuals.length > 0) {
			const startY = height - 30;
			this.shotVisuals.forEach((ball) => {
				ball.setY(startY);
			});
		}
	}

	private createBallObject() {
		// Cleanup old visual
		if (this.ballVisual) {
			this.ballVisual.destroy();
			this.ballVisual = undefined;
		}

		// Destroy old Box2D body if it exists
		if (this.ballBodyId) {
			b2DestroyBody(this.ballBodyId);
			this.ballBodyId = null;
			this.ballShapeId = null;
		}

		// Get selected setup
		const ballColor = this.registry.get('ballColor') || 0xffffff;
		const ballSkin = (this.registry.get('ballSkin') as SkinType) || 'solid';

		const ballRadius = 15;
		const S = this.SCALE;

		// Create Box2D dynamic body with CCD (bullet mode prevents tunneling)
		const bodyDef = b2DefaultBodyDef();
		bodyDef.type = b2BodyType.b2_dynamicBody;
		bodyDef.position = new b2Vec2(this.spawnPoint.x / S, this.spawnPoint.y / S);
		bodyDef.isBullet = true;
		bodyDef.linearDamping = 0.03;
		this.ballBodyId = b2CreateBody(this.worldId, bodyDef);

		// Create circle shape
		const shapeDef = b2DefaultShapeDef();
		shapeDef.density = 1.0;
		shapeDef.friction = 0.25;
		shapeDef.restitution = 0.35;
		shapeDef.enableContactEvents = true;
		shapeDef.userData = { type: 'ball' };
		const circle = { center: new b2Vec2(0, 0), radius: ballRadius / S };
		this.ballShapeId = b2CreateCircleShape(this.ballBodyId, shapeDef, circle);

		// Ball starts stationary (no gravity) until first shot
		b2Body_SetGravityScale(this.ballBodyId, 0);

		// Create visual (not bound to physics - we sync manually)
		this.ballVisual = SkinManager.drawBall(this, this.spawnPoint.x, this.spawnPoint.y, ballRadius, ballColor, ballSkin);
		this.ballVisual.setDepth(50);
	}

	private startGameplay() {
		// Setup spawn point
		const spawnX = this.data.get('spawnX');
		const spawnY = this.data.get('spawnY');
		this.spawnPoint = { x: spawnX, y: spawnY - 20 };

		this.createBallObject();
		this.ballVisual?.setAlpha(0);

		this.graphics = this.add.graphics();
		this.graphics.setDepth(100);
		this.dragStartPoint = new Phaser.Math.Vector2(0, 0);

		this.initGhostPool();
		this.createUI();
		this.scoreText?.setAlpha(0);
		this.holeText?.setAlpha(0);
		this.shotVisuals.forEach(v => v.setAlpha(0));

		// Interaction
		this.input.removeAllListeners();
		this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
		this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
		this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

		// Final Smooth Fade In
		this.tweens.add({
			targets: [this.ballVisual, this.scoreText, this.holeText, ...this.shotVisuals],
			alpha: 1,
			duration: 800,
			ease: 'Power2',
			onStart: () => {
				this.scoreText?.setVisible(true);
				this.holeText?.setVisible(true);
				this.shotVisuals.forEach(v => v.setVisible(true));
			}
		});
	}

	private playSFX(key: string, volume: number = 1) {
		if (localStorage.getItem('golf_settings_fx') === 'true') {
			this.sound.play(key, { volume: volume });
		}
	}

	private haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
		if (localStorage.getItem('golf_settings_haptics') === 'false') return;
		if (typeof (window as any).triggerHaptic === 'function') {
			(window as any).triggerHaptic(type);
		}
	}

	private showTapTutorial() {
		this.time.delayedCall(500, () => {
			if (!this.ballBodyId || this.hasFiredShot) return;

			const ballPos = this.getBallPos();

			this.tutorialContainer = this.add.container(0, 0).setDepth(200);

			const ring = this.add.circle(ballPos.x, ballPos.y, 30).setStrokeStyle(3, 0xffffff, 0.8);
			ring.setFillStyle(0xffffff, 0);
			this.tutorialContainer.add(ring);

			this.tweens.add({
				targets: ring,
				scaleX: 1.5,
				scaleY: 1.5,
				alpha: 0,
				duration: 800,
				repeat: -1,
				ease: 'Sine.out'
			});

			const finger = this.add.circle(ballPos.x, ballPos.y, 10, 0xffffff, 0.9).setStrokeStyle(2, 0x000000, 0.4);
			this.tutorialContainer.add(finger);

			const dragLine = this.add.graphics();
			this.tutorialContainer.add(dragLine);

			const dragOffsetX = -60;
			const dragOffsetY = 40;

			this.tweens.add({
				targets: finger,
				x: ballPos.x + dragOffsetX,
				y: ballPos.y + dragOffsetY,
				duration: 800,
				delay: 300,
				ease: 'Power2',
				yoyo: true,
				repeat: -1,
				repeatDelay: 600,
				onUpdate: () => {
					dragLine.clear();
					dragLine.lineStyle(3, 0xffffff, 0.5);
					dragLine.beginPath();
					dragLine.moveTo(ballPos.x, ballPos.y);
					dragLine.lineTo(finger.x, finger.y);
					dragLine.strokePath();

					const dx = ballPos.x - finger.x;
					const dy = ballPos.y - finger.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist > 5) {
						const arrowLen = Math.min(dist * 0.6, 40);
						const nx = dx / dist;
						const ny = dy / dist;
						const arrowX = ballPos.x + nx * arrowLen;
						const arrowY = ballPos.y + ny * arrowLen;

						dragLine.lineStyle(3, 0x00A1E4, 0.7);
						dragLine.beginPath();
						dragLine.moveTo(ballPos.x, ballPos.y);
						dragLine.lineTo(arrowX, arrowY);
						dragLine.strokePath();

						const tipSize = 8;
						const perpX = -ny;
						const perpY = nx;
						dragLine.fillStyle(0x00A1E4, 0.7);
						dragLine.fillTriangle(
							arrowX, arrowY,
							arrowX - nx * tipSize + perpX * tipSize * 0.5, arrowY - ny * tipSize + perpY * tipSize * 0.5,
							arrowX - nx * tipSize - perpX * tipSize * 0.5, arrowY - ny * tipSize - perpY * tipSize * 0.5
						);
					}
				}
			});
		});
	}

	private hideTutorial() {
		if (this.tutorialContainer) {
			this.tutorialContainer.destroy();
			this.tutorialContainer = undefined;
		}
	}

	private createUI() {
		const height = this.scale.height;

		this.showTapTutorial();

		if (this.registry.get('score') === undefined) this.registry.set('score', 0);
		this.scoreText = this.add.text(10, 80, `Score: ${this.registry.get('score')}`, {
			fontSize: '48px', color: '#ffffff', fontFamily: 'VT323',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 6
		}).setDepth(1000).setScrollFactor(0);

		this.holeText = this.add.text(10, 128, `Hole ${this.currentHole}`, {
			fontSize: '28px', color: '#cccccc', fontFamily: 'VT323',
			stroke: '#000000', strokeThickness: 4
		}).setDepth(1000).setScrollFactor(0);

		this.shotVisuals = [];
		const startX = 50;
		const startY = this.scale.height - 30;
		for (let i = 0; i < 2; i++) {
			const ball = this.add.circle(startX + i * 30, startY, 11, 0xffffff);
			ball.setDepth(1000).setStrokeStyle(2.5, 0x000000).setScrollFactor(0);
			this.shotVisuals.push(ball);
		}
	}

	private flagContainer: Phaser.GameObjects.Container | undefined;
	private flagAnimProgress: { pole: number; cloth: number } = { pole: 0, cloth: 0 };

	private drawFlag() {
		const holeX = this.data.get('holeX');
		const holeY = this.data.get('holeY');
		const holeDepth = this.data.get('holeDepth') || 100;

		// Clean up previous flag
		if (this.flagGraphics) this.flagGraphics.destroy();
		if (this.flagContainer) this.flagContainer.destroy();

		const poleBottom = holeY + holeDepth;
		const poleTop = holeY - 140;
		const poleHeight = poleBottom - poleTop;

		// Container anchored at the hole position
		this.flagContainer = this.add.container(holeX, poleBottom);
		this.flagContainer.setDepth(10);

		this.flagGraphics = this.add.graphics();
		this.flagContainer.add(this.flagGraphics);

		// Animation state
		this.flagAnimProgress = { pole: 0, cloth: 0 };

		const redrawFlag = () => {
			const gfx = this.flagGraphics!;
			gfx.clear();

			const poleH = poleHeight * this.flagAnimProgress.pole;
			const clothProgress = this.flagAnimProgress.cloth;

			if (poleH <= 0) return;

			// Pole shadow
			gfx.lineStyle(4, 0x333333, 0.4);
			gfx.lineBetween(3, 0, 3, -poleH + 5);

			// Pole main
			gfx.lineStyle(5, 0xDDDDDD, 1);
			gfx.lineBetween(0, 0, 0, -poleH);

			// Pole highlight
			gfx.lineStyle(2, 0xFFFFFF, 0.8);
			gfx.lineBetween(-1, 0, -1, -poleH);

			// Flag cloth (only after pole is mostly up)
			if (clothProgress > 0) {
				const flagTop = -poleH;
				const flagW = 50 * clothProgress;
				const flagH = 60;

				// Shadow
				gfx.fillStyle(0x000000, 0.2);
				gfx.beginPath();
				gfx.moveTo(4, flagTop);
				gfx.lineTo(4 + flagW, flagTop + flagH * 0.5);
				gfx.lineTo(4, flagTop + flagH);
				gfx.closePath();
				gfx.fillPath();

				// Red cloth
				gfx.fillStyle(0xFF0000, 1);
				gfx.beginPath();
				gfx.moveTo(0, flagTop);
				gfx.lineTo(flagW, flagTop + flagH * 0.5);
				gfx.lineTo(0, flagTop + flagH);
				gfx.closePath();
				gfx.fillPath();

				// Highlight
				gfx.fillStyle(0xFFFFFF, 0.1);
				gfx.beginPath();
				gfx.moveTo(0, flagTop);
				gfx.lineTo(flagW * 0.9, flagTop + flagH * 0.5);
				gfx.lineTo(0, flagTop + flagH * 0.25);
				gfx.closePath();
				gfx.fillPath();
			}
		};

		// Animate pole rising
		this.tweens.add({
			targets: this.flagAnimProgress,
			pole: 1,
			duration: 500,
			ease: 'Power2',
			onUpdate: redrawFlag,
			onComplete: () => {
				// Then animate cloth expanding
				this.tweens.add({
					targets: this.flagAnimProgress,
					cloth: 1,
					duration: 350,
					ease: 'Back.easeOut',
					onUpdate: redrawFlag
				});
			}
		});
	}

	private onPointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.ballBodyId || this.ballMoving || this.shotsRemaining <= 0 || this.isGameOver || this.data.get('isWon') || this.isTransitioning || this.isMenuOpen) return;
		if (this.settingsModal?.getIsOpen()) return;
		const ballPos = this.getBallPos();
		const dist = Phaser.Math.Distance.Between(pointer.x + this.cameras.main.scrollX, pointer.y, ballPos.x, ballPos.y);
		if (dist < 80) {
			this.isDragging = true;
			this.dragStartPoint?.set(pointer.x, pointer.y);
			this.hideTutorial();
		}
	}

	private onPointerMove(pointer: Phaser.Input.Pointer) {
		if (this.isDragging && this.ballBodyId && this.graphics) {
			this.graphics.clear().fillStyle(0xffffff, 1);
			const ballPos = this.getBallPos();
			let pullX = (ballPos.x - this.cameras.main.scrollX) - pointer.x;
			let pullY = ballPos.y - pointer.y;

			const maxDrag = 150;
			const dragDist = Math.sqrt(pullX * pullX + pullY * pullY);
			if (dragDist > maxDrag) {
				pullX = (pullX / dragDist) * maxDrag;
				pullY = (pullY / dragDist) * maxDrag;
			}

			// Trajectory dots (visual prediction in pixel space)
			const vx = pullX * 0.2;
			const vy = pullY * 0.2;
			for (let i = 0; i < 10; i++) {
				const t = (i + 1) * 1.2;
				const px = ballPos.x + vx * t;
				const py = ballPos.y + vy * t + 0.5 * 2 * t * t * 0.05;
				const alpha = 1 - (i / 10) * 0.6;
				this.graphics.fillStyle(0xffffff, alpha);
				this.graphics.beginPath().arc(px, py, 3.5 - i * 0.25, 0, Math.PI * 2).fillPath();
			}
		}
	}

	private onPointerUp(pointer: Phaser.Input.Pointer) {
		if (this.isDragging && this.ballBodyId && this.graphics) {
			this.isDragging = false;
			this.graphics.clear();
			const ballPos = this.getBallPos();
			let pullX = ballPos.x - (pointer.x + this.cameras.main.scrollX);
			let pullY = ballPos.y - pointer.y;

			const maxDrag = 150;
			const dragDist = Math.sqrt(pullX * pullX + pullY * pullY);
			if (dragDist > maxDrag) {
				pullX = (pullX / dragDist) * maxDrag;
				pullY = (pullY / dragDist) * maxDrag;
			}

			// Convert pixel-space drag to Box2D velocity (m/s)
			const power = 0.24;
			// Reset anti-oscillation and bounce tracking before each new shot
			this.slowTimer = 0;
			this.crawlTimer = 0;
			this.gameOverFallbackTimer = 0;
			this.lastVelXSign = 0;
			this.directionChanges = 0;
			this.oscillationDetected = false;
			this.bounceCount = 0;
			b2Body_SetLinearDamping(this.ballBodyId, 0.03);

			// Enable gravity on first shot (ball was stationary)
			b2Body_SetGravityScale(this.ballBodyId, 1);
			// Wake up rocks — enable their gravity now that the ball is in play
			this.enableRockGravity();
			b2Body_SetLinearVelocity(this.ballBodyId, new b2Vec2(pullX * power, pullY * power));

			this.shotsRemaining--;
			this.hasFiredShot = true;
			this.hideTutorial();
			this.updateShotVisuals();
			this.playSFX('HitBall', 2.5);
			this.haptic('light');
		}
	}

	private handleWin() {
		this.data.set('isWon', true);

		this.recycleAllGhosts();

		// Ace detection: no bounces = direct hit into hole
		const isAce = this.bounceCount === 0;

		if (isAce) {
			this.aceStreak++;
		} else {
			this.aceStreak = 0;
		}

		// Calculate points: normal = 1, ace = 2^aceStreak (2, 4, 8, ...)
		const aceMultiplier = isAce ? Math.pow(2, this.aceStreak) : 1;
		const pointsEarned = isAce ? aceMultiplier : 1;

		const currentScore = this.registry.get('score') + pointsEarned;
		this.registry.set('score', currentScore);
		if (this.scoreText) this.scoreText.setText(`Score: ${currentScore}`);
		this.currentHole++;
		if (this.holeText) this.holeText.setText(`Hole ${this.currentHole}`);

		if (isAce) {
			this.playSFX('Score', 1.5);
			this.time.delayedCall(150, () => this.playSFX('Score', 2.0));
			this.time.delayedCall(300, () => this.playSFX('Score', 2.5));
		} else {
			this.playSFX('Score');
		}

		const centerX = this.cameras.main.scrollX + this.scale.width / 2;
		const centerY = this.scale.height * 0.35;

		if (isAce) {
			this.showAceAnimation(centerX, centerY, currentScore, pointsEarned, this.aceStreak);
		} else {
			this.showScoreAnimation(centerX, centerY, currentScore);
		}

		this.haptic('success');
		if (isAce) {
			this.time.delayedCall(200, () => this.haptic('success'));
		}

		this.time.delayedCall(isAce ? 2500 : 2000, () => this.startTransition());
	}

	private showScoreAnimation(centerX: number, centerY: number, score: number) {
		const scoreNum = this.add.text(centerX, centerY, `${score}`, {
			fontSize: '160px', color: '#ffffff', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 14
		}).setOrigin(0.5).setDepth(100).setScale(0).setAlpha(0);

		const scoreLabel = this.add.text(centerX, centerY + 100, 'SCORE!', {
			fontSize: '40px', color: '#FFD700', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 8
		}).setOrigin(0.5).setDepth(100).setScale(0).setAlpha(0);

		this.tweens.add({ targets: scoreNum, scale: 1, alpha: 1, y: centerY, duration: 400, ease: 'Back.out' });
		this.tweens.add({ targets: scoreLabel, scale: 1, alpha: 1, duration: 300, delay: 200, ease: 'Back.out' });

		this.time.delayedCall(1000, () => {
			this.tweens.add({
				targets: [scoreNum, scoreLabel],
				y: '-=80', alpha: 0, duration: 600, ease: 'Power2',
				onComplete: () => { scoreNum.destroy(); scoreLabel.destroy(); }
			});
		});
	}

	private showAceAnimation(centerX: number, centerY: number, score: number, points: number, streak: number) {
		// Ace label with streak indicator
		const streakText = streak > 1 ? `x${Math.pow(2, streak)}` : 'x2';
		const aceLabel = this.add.text(centerX, centerY - 60, 'ACE!', {
			fontSize: '80px', color: '#FF4444', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 10
		}).setOrigin(0.5).setDepth(101).setScale(0).setAlpha(0);

		const multiplierLabel = this.add.text(centerX, centerY + 30, streakText, {
			fontSize: '56px', color: '#FFD700', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 8
		}).setOrigin(0.5).setDepth(101).setScale(0).setAlpha(0);

		const pointsLabel = this.add.text(centerX, centerY + 100, `+${points}`, {
			fontSize: '44px', color: '#ffffff', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 6
		}).setOrigin(0.5).setDepth(101).setScale(0).setAlpha(0);

		const scoreNum = this.add.text(centerX, centerY + 160, `Score: ${score}`, {
			fontSize: '32px', color: '#cccccc', fontFamily: 'VT323',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 4
		}).setOrigin(0.5).setDepth(101).setScale(0).setAlpha(0);

		// ACE! slam in with screen shake
		this.tweens.add({
			targets: aceLabel, scale: 1.2, alpha: 1, duration: 300, ease: 'Back.out',
			onComplete: () => {
				this.tweens.add({ targets: aceLabel, scale: 1, duration: 200, ease: 'Sine.out' });
			}
		});
		this.cameras.main.shake(300, streak > 1 ? 0.012 : 0.008);

		// Multiplier pop
		this.tweens.add({
			targets: multiplierLabel, scale: 1, alpha: 1, duration: 350, delay: 200, ease: 'Back.out'
		});

		// Points float up
		this.tweens.add({
			targets: pointsLabel, scale: 1, alpha: 1, duration: 300, delay: 350, ease: 'Back.out'
		});

		// Score total
		this.tweens.add({
			targets: scoreNum, scale: 1, alpha: 1, duration: 300, delay: 450, ease: 'Power2'
		});

		// Burst particles (radial golden sparks)
		const sparkCount = 12 + streak * 4;
		for (let i = 0; i < sparkCount; i++) {
			const angle = (i / sparkCount) * Math.PI * 2;
			const dist = 60 + Math.random() * 80;
			const spark = this.add.circle(centerX, centerY, 3 + Math.random() * 3, 0xFFD700);
			spark.setDepth(100).setAlpha(0.9);

			this.tweens.add({
				targets: spark,
				x: centerX + Math.cos(angle) * dist,
				y: centerY + Math.sin(angle) * dist,
				alpha: 0,
				scale: 0,
				duration: 600 + Math.random() * 400,
				delay: 100 + Math.random() * 200,
				ease: 'Power2',
				onComplete: () => spark.destroy()
			});
		}

		// If streak > 1, add extra streak fire sparks in red/orange
		if (streak > 1) {
			for (let i = 0; i < streak * 6; i++) {
				const angle = Math.random() * Math.PI * 2;
				const dist = 40 + Math.random() * 120;
				const color = [0xFF4444, 0xFF8800, 0xFFCC00][Math.floor(Math.random() * 3)];
				const spark = this.add.circle(centerX, centerY, 2 + Math.random() * 4, color);
				spark.setDepth(100).setAlpha(0.8);

				this.tweens.add({
					targets: spark,
					x: centerX + Math.cos(angle) * dist,
					y: centerY + Math.sin(angle) * dist - 30,
					alpha: 0, scale: 0,
					duration: 800 + Math.random() * 500,
					delay: 200 + Math.random() * 300,
					ease: 'Power2',
					onComplete: () => spark.destroy()
				});
			}
		}

		// Fade out all labels
		this.time.delayedCall(1400, () => {
			this.tweens.add({
				targets: [aceLabel, multiplierLabel, pointsLabel, scoreNum],
				y: '-=80', alpha: 0, duration: 600, ease: 'Power2',
				onComplete: () => {
					aceLabel.destroy(); multiplierLabel.destroy();
					pointsLabel.destroy(); scoreNum.destroy();
				}
			});
		});
	}

	private startTransition() {
		this.isTransitioning = true;
		this.recycleAllGhosts();

		const lastY = this.currentTerrain.points[this.currentTerrain.points.length - 1].y;
		const currentScore = this.registry.get('score') || 0;
		const cappedScore = Math.min(currentScore, 100);
		const nextDifficulty = 1 + (cappedScore * (0.05 / 12));
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);
		const nextTerrain = this.terrainGen!.generateTerrain(lastY, this.cameras.main.scrollX + this.scale.width, nextDifficulty, theme, false, currentScore);

		this.cameras.main.pan(this.cameras.main.scrollX + this.scale.width + this.scale.width / 2, this.scale.height / 2, 2000, 'Power2');

		this.cameras.main.once('camerapancomplete', () => {
			// Cleanup old terrain
			this.cleanupRockBodies();
			this.currentTerrain.graphics.destroy();
			if (this.currentTerrain.waterGraphics) this.currentTerrain.waterGraphics.destroy();
			if (this.currentTerrain.waterTimer) this.currentTerrain.waterTimer.destroy();

			// Destroy old terrain body (one call destroys body + all chains/shapes)
			if (this.currentTerrain.groundBodyId) {
				b2DestroyBody(this.currentTerrain.groundBodyId);
			}

			this.currentTerrain = nextTerrain;

			this.isTransitioning = false;
			this.data.set('isWon', false);
			this.shotsRemaining = 2;
			this.updateShotVisuals();

			const sX = this.data.get('spawnX');
			const sY = this.data.get('spawnY');
			this.spawnPoint = { x: sX, y: sY - 20 };
			this.resetBall();
			// New round: ball starts stationary until first shot
			this.hasFiredShot = false;
			b2Body_SetGravityScale(this.ballBodyId, 0);
			this.drawFlag();
		});
	}

	update(_time: number, delta: number) {
		// Process pending restart — use stop+start (not restart) for iOS webview reliability
		if (this.pendingRestart) {
			this.pendingRestart = false;
			this.scene.stop('Menu');
			this.scene.stop('Level');
			this.scene.start('Level');
			return;
		}

		if (this.isPaused) return;

		// Step Box2D world (fixed timestep with sub-stepping handled internally)
		if (!this.physicsPaused && this.worldId) {
			WorldStep({ worldId: this.worldId, deltaTime: delta / 1000, fixedTimeStep: 1 / 60, subStepCount: 8 });
		}

		if (!this.ballBodyId || this.isGameOver) return;

		// Sync ball visual to physics body
		const ballPos = this.getBallPos();
		const ballRot = b2Body_GetRotation(this.ballBodyId);
		const ballAngle = b2Rot_GetAngle(ballRot);
		if (this.ballVisual) {
			this.ballVisual.x = ballPos.x;
			this.ballVisual.y = ballPos.y;
			this.ballVisual.rotation = ballAngle;
		}

		// Sync rock visuals to their physics bodies
		this.syncRockVisuals();

		// Aim-ready pulsing indicator when ball is stationary and launchable
		this.drawAimReadyIndicator(delta);

		// Get velocity info
		const speed = this.getBallSpeed();

		// --- Bounce detection via velocity change ---
		// Don't count impacts inside the hole (walls/floor) — they'd kill every ace
		const holeXForBounce = this.data.get('holeX') as number;
		const holeYForBounce = this.data.get('holeY') as number;
		const holeWForBounce = this.data.get('holeWidth') as number;
		const inHoleArea = holeXForBounce && Math.abs(ballPos.x - holeXForBounce) < (holeWForBounce / 2) + 10 && ballPos.y > holeYForBounce - 5;
		const speedDelta = Math.abs(speed - this.prevBallSpeed);
		if (speedDelta > 1.5 && this.prevBallSpeed > 0 && !this.isGameOver && !this.data.get('isWon') && !inHoleArea) {
			this.bounceCount++;

			// Bounce SFX
			if (speedDelta > 2.0) {
				this.playSFX('Bounce', Math.min(speedDelta / 8, 1));
			}

			// Haptic feedback proportional to impact
			if (speedDelta > 6) {
				this.haptic('heavy');
			} else if (speedDelta > 3) {
				this.haptic('medium');
			} else if (speedDelta > 1.5) {
				this.haptic('light');
			}
		}
		this.prevBallSpeed = speed;

		// --- Sensor events (hole detection, water hazard) ---
		if (this.worldId) {
			const sensors = b2World_GetSensorEvents(this.worldId);
			if (sensors && sensors.beginEvents) {
				for (const evt of sensors.beginEvents) {
					let sensorData: any = null;
					if (evt.sensorShapeId) {
						try {
							sensorData = b2Shape_GetUserData(evt.sensorShapeId);
						} catch (_e) {
							// Ignore if userData access fails
						}
					}

					if (sensorData?.type === 'hole-sensor' && !this.data.get('isWon') && !this.isTransitioning) {
						// Ball entered hole sensor area - actual win detected by position check below
					}

					if (sensorData?.type === 'water-hazard' && !this.isGameOver && !this.data.get('isWon') && !this.isTransitioning) {
						this.playSFX('Bounce');
						this.haptic('error');
						if (this.shotsRemaining <= 0) {
							this.handleGameOver();
						} else {
							this.resetBall();
						}
					}
				}
			}
		}

		// Ball is "moving" when velocity is perceptible
		this.ballMoving = speed > 0.3;

		// Force-stop a crawling ball so it becomes interactable for the next shot
		// If speed has been below 0.5 for over 1.5s, snap the ball to a stop
		if (this.hasFiredShot && !this.data.get('isWon') && !this.isTransitioning && !this.isGameOver) {
			if (speed > 0 && speed < 0.5) {
				this.crawlTimer = (this.crawlTimer || 0) + delta;
				if (this.crawlTimer >= 1500) {
					b2Body_SetLinearVelocity(this.ballBodyId, new b2Vec2(0, 0));
					b2Body_SetAngularVelocity(this.ballBodyId, 0);
					this.ballMoving = false;
					this.crawlTimer = 0;
				}
			} else {
				this.crawlTimer = 0;
			}
		} else {
			this.crawlTimer = 0;
		}

		// Anti-oscillation: detect direction reversals to identify oscillation.
		// Normal rolling maintains direction; oscillation reverses repeatedly.
		if (this.hasFiredShot && !this.data.get('isWon') && !this.isTransitioning) {
			const vel = b2Body_GetLinearVelocity(this.ballBodyId);
			const currentSign = vel.x > 0.3 ? 1 : vel.x < -0.3 ? -1 : 0;

			if (currentSign !== 0 && this.lastVelXSign !== 0 && currentSign !== this.lastVelXSign) {
				this.directionChanges++;
			}
			if (currentSign !== 0) this.lastVelXSign = currentSign;

			// No time window — count total reversals since shot. Resets on new shot/resetBall.
			if (this.directionChanges >= 4 && !this.oscillationDetected) {
				this.oscillationDetected = true;
				this.slowTimer = 0;
			}

			if (this.oscillationDetected) {
				this.slowTimer += delta;
				const dampingBoost = Math.min((this.slowTimer / 1000) * 2, 8);
				b2Body_SetLinearDamping(this.ballBodyId, 0.03 + dampingBoost);
			}
		}

		// Ball out of bounds reset
		if (!this.isTransitioning && !this.isGameOver && (ballPos.y > this.scale.height + 150 || Math.abs(ballPos.x - (this.cameras.main.scrollX + this.scale.width / 2)) > 800)) {
			this.haptic('error');
			if (this.shotsRemaining <= 0) {
				this.handleGameOver();
				return;
			}
			this.resetBall();
		}

		// --- WIN DETECTION ---
		const holeX = this.data.get('holeX');
		const holeY = this.data.get('holeY');
		const holeWidth = this.data.get('holeWidth');

		// Ghost ball trail (pooled — no allocations)
		if (this.ballBodyId && this.ballMoving && speed > 0.5) {
			const now = this.time.now;
			if (now - this.lastTrailSpawnTime > 50) {
				this.lastTrailSpawnTime = now;
				this.spawnGhost(ballPos.x, ballPos.y, now);
			}
		}
		this.updateGhosts();

		// Ball settled anywhere inside the hole
		const inHoleX = Math.abs(ballPos.x - holeX) < (holeWidth / 2) + 5;
		const insideHole = ballPos.y > holeY + 10;
		const settled = speed < 1.0;

		if (inHoleX && insideHole && settled && !this.data.get('isWon') && !this.isTransitioning) {
			this.handleWin();
		}

		// Game Over: ball must be truly stationary (speed < 0.2) for 800ms
		const ballDeepInHole = inHoleX && insideHole;
		const ballStopped = speed < 0.2;
		if (ballStopped && this.shotsRemaining <= 0 && this.hasFiredShot && !this.data.get('isWon') && !this.isTransitioning && !this.isGameOver && !ballDeepInHole) {
			this.stoppedTimer += delta;
			if (this.stoppedTimer >= 800) {
				this.handleGameOver();
			}
		} else if (!ballStopped || this.data.get('isWon') || this.isTransitioning) {
			this.stoppedTimer = 0;
		}

		// Hard fallback: only when ball is nearly stopped (speed < 0.5) for >6s
		if (this.shotsRemaining <= 0 && this.hasFiredShot && !this.data.get('isWon') && !this.isTransitioning && !this.isGameOver && speed < 0.5) {
			this.gameOverFallbackTimer = (this.gameOverFallbackTimer || 0) + delta;
			if (this.gameOverFallbackTimer >= 6000) {
				this.handleGameOver();
			}
		} else {
			this.gameOverFallbackTimer = 0;
		}

		// Update Off-screen Indicator
		this.updateIndicator();
	}

	private createMountainLayers(width: number, height: number, theme: { mountains: number; mountainAlpha: number; sky: number }) {
		const totalW = width * 4;

		const layers = [
			{ baseY: height * 0.62, peakMin: 0.22, peakMax: 0.42, segW: 180, scrollFactor: 0.02, depth: -98, alphaMulti: 0.3, hazeAlpha: 0.35, snowChance: 0.6 },
			{ baseY: height * 0.68, peakMin: 0.18, peakMax: 0.35, segW: 130, scrollFactor: 0.05, depth: -96, alphaMulti: 0.55, hazeAlpha: 0.2, snowChance: 0.35 },
			{ baseY: height * 0.74, peakMin: 0.12, peakMax: 0.28, segW: 100, scrollFactor: 0.09, depth: -94, alphaMulti: 0.8, hazeAlpha: 0.1, snowChance: 0.15 },
		];

		// Extract theme mountain color components for layer tinting
		const mR = (theme.mountains >> 16) & 0xFF;
		const mG = (theme.mountains >> 8) & 0xFF;
		const mB = theme.mountains & 0xFF;

		const skyR = (theme.sky >> 16) & 0xFF;
		const skyG = (theme.sky >> 8) & 0xFF;
		const skyB = theme.sky & 0xFF;

		for (let li = 0; li < layers.length; li++) {
			const L = layers[li];

			// Blend mountain color toward sky color for distant layers (atmospheric perspective)
			const blendT = 1 - L.alphaMulti;
			const layerR = Math.round(mR + (skyR - mR) * blendT * 0.6);
			const layerG = Math.round(mG + (skyG - mG) * blendT * 0.6);
			const layerB = Math.round(mB + (skyB - mB) * blendT * 0.6);
			const layerColor = (layerR << 16) | (layerG << 8) | layerB;
			const layerAlpha = theme.mountainAlpha * L.alphaMulti;

			// Generate ridge points
			const segCount = Math.ceil(totalW / L.segW) + 2;
			const points: { x: number; y: number }[] = [];
			const seed = li * 1000 + 42;

			for (let s = 0; s <= segCount; s++) {
				const x = -L.segW + s * L.segW;
				// Pseudo-random deterministic heights using sin combinations
				const n1 = Math.sin(seed + s * 3.7) * 0.5 + 0.5;
				const n2 = Math.sin(seed + s * 7.3 + 2.1) * 0.3;
				const n3 = Math.sin(seed + s * 1.9 + 5.4) * 0.2;
				const peakRange = L.peakMax - L.peakMin;
				const peakHeight = L.peakMin + peakRange * Phaser.Math.Clamp(n1 + n2 + n3, 0, 1);
				const y = L.baseY - height * peakHeight;
				points.push({ x, y });
			}

			// Subdivide for smoother ridges (add midpoints with slight jitter)
			const smoothed: { x: number; y: number }[] = [];
			for (let s = 0; s < points.length - 1; s++) {
				const p0 = points[s];
				const p1 = points[s + 1];
				smoothed.push(p0);
				// Midpoint with vertical jitter
				const jitter = Math.sin(seed + s * 11.3) * height * 0.03;
				smoothed.push({
					x: (p0.x + p1.x) / 2,
					y: (p0.y + p1.y) / 2 + jitter
				});
			}
			smoothed.push(points[points.length - 1]);

			// Draw mountain silhouette
			const gfx = this.add.graphics();
			gfx.fillStyle(layerColor, layerAlpha);
			gfx.beginPath();
			gfx.moveTo(smoothed[0].x, height + 50);
			for (const pt of smoothed) {
				gfx.lineTo(pt.x, pt.y);
			}
			gfx.lineTo(smoothed[smoothed.length - 1].x, height + 50);
			gfx.closePath();
			gfx.fillPath();

			// Snow caps on the tallest peaks
			const peaks: { x: number; y: number }[] = [];
			for (let s = 1; s < smoothed.length - 1; s++) {
				if (smoothed[s].y < smoothed[s - 1].y && smoothed[s].y < smoothed[s + 1].y) {
					peaks.push(smoothed[s]);
				}
			}

			for (const peak of peaks) {
				const snowRoll = Math.sin(seed + peak.x * 0.01) * 0.5 + 0.5;
				if (snowRoll < L.snowChance) {
					const snowH = height * Phaser.Math.FloatBetween(0.02, 0.045);
					const snowW = Phaser.Math.FloatBetween(18, 35) * (1 + L.alphaMulti * 0.5);
					gfx.fillStyle(0xffffff, layerAlpha * 0.7);
					gfx.beginPath();
					gfx.moveTo(peak.x, peak.y);
					gfx.lineTo(peak.x - snowW, peak.y + snowH);
					gfx.lineTo(peak.x + snowW, peak.y + snowH);
					gfx.closePath();
					gfx.fillPath();
				}
			}

			// Atmospheric haze at the base of this layer
			if (L.hazeAlpha > 0) {
				const hazeH = height * 0.08;
				const hazeY = L.baseY - hazeH * 0.5;
				for (let h = 0; h < 6; h++) {
					const t = h / 5;
					const a = L.hazeAlpha * (1 - t);
					gfx.fillStyle(theme.sky, a);
					gfx.fillRect(-L.segW, hazeY + t * hazeH, totalW + L.segW * 2, hazeH / 6);
				}
			}

			gfx.setDepth(L.depth);
			gfx.setScrollFactor(L.scrollFactor);
		}
	}

	private createCloudsAndShadows(width: number, _height: number, theme: { clouds: number; sky: number; mountains: number; mountainAlpha: number; groundTop: number; groundBottom: number; grass: number }) {
		const layers = [
			{ count: 4, yMin: 5, yMax: 80, sizeMin: 0.6, sizeMax: 0.85, scrollFactor: 0.04, depthCloud: -92, alpha: 0.18, speed: 0.6 },
			{ count: 5, yMin: 40, yMax: 130, sizeMin: 0.8, sizeMax: 1.2, scrollFactor: 0.1, depthCloud: -88, alpha: 0.28, speed: 1.0 },
			{ count: 4, yMin: 70, yMax: 185, sizeMin: 1.0, sizeMax: 1.5, scrollFactor: 0.18, depthCloud: -84, alpha: 0.38, speed: 1.5 },
		];

		for (const layer of layers) {
			for (let i = 0; i < layer.count; i++) {
				const scale = Phaser.Math.FloatBetween(layer.sizeMin, layer.sizeMax);
				const cx = Phaser.Math.Between(-200, width * 3);
				const cy = Phaser.Math.Between(layer.yMin, layer.yMax);

				// Generate blob layout for this cloud
				const blobCount = Phaser.Math.Between(4, 7);
				const blobs: { ox: number; oy: number; rx: number; ry: number }[] = [];
				const baseW = Phaser.Math.Between(80, 140) * scale;
				const baseH = Phaser.Math.Between(30, 50) * scale;

				for (let b = 0; b < blobCount; b++) {
					const t = b / (blobCount - 1);
					const ox = (t - 0.5) * baseW * 1.4;
					const oy = Math.sin(t * Math.PI) * (-baseH * 0.35) + (Phaser.Math.FloatBetween(-3, 3) * scale);
					const rx = Phaser.Math.FloatBetween(28, 48) * scale;
					const ry = Phaser.Math.FloatBetween(18, 32) * scale;
					blobs.push({ ox, oy, rx, ry });
				}
				// Add a couple of top bumps for fluffiness
				for (let b = 0; b < 2; b++) {
					const ox = Phaser.Math.FloatBetween(-baseW * 0.3, baseW * 0.3);
					const oy = -baseH * Phaser.Math.FloatBetween(0.25, 0.55);
					const rx = Phaser.Math.FloatBetween(22, 38) * scale;
					const ry = Phaser.Math.FloatBetween(16, 26) * scale;
					blobs.push({ ox, oy, rx, ry });
				}

				// --- Draw the cloud (white only) ---
				const cloudGfx = this.add.graphics();

				// Main body
				for (const blob of blobs) {
					cloudGfx.fillStyle(0xffffff, layer.alpha);
					cloudGfx.fillEllipse(blob.ox, blob.oy, blob.rx * 2, blob.ry * 2);
				}

				// Top highlight (slightly brighter/more opaque upper portion)
				for (const blob of blobs) {
					cloudGfx.fillStyle(0xffffff, layer.alpha * 0.5);
					cloudGfx.fillEllipse(blob.ox, blob.oy - blob.ry * 0.3, blob.rx * 1.5, blob.ry * 1.2);
				}

				const cloudContainer = this.add.container(cx, cy, [cloudGfx]);
				cloudContainer.setDepth(layer.depthCloud);
				cloudContainer.setScrollFactor(layer.scrollFactor);

				// --- Drift animation ---
				const driftDist = Phaser.Math.Between(60, 180) * layer.speed;
				const driftDuration = Phaser.Math.Between(12000, 25000) / layer.speed;

				this.tweens.add({
					targets: cloudContainer,
					x: cx + driftDist,
					duration: driftDuration,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.easeInOut'
				});

				// --- Subtle morphing ---
				this.tweens.add({
					targets: cloudGfx,
					scaleX: Phaser.Math.FloatBetween(0.97, 1.03),
					scaleY: Phaser.Math.FloatBetween(0.96, 1.04),
					duration: Phaser.Math.Between(4000, 7000),
					yoyo: true,
					repeat: -1,
					ease: 'Sine.easeInOut'
				});

				// Gentle vertical bob
				this.tweens.add({
					targets: cloudContainer,
					y: cy + Phaser.Math.FloatBetween(-6, 6),
					duration: Phaser.Math.Between(5000, 9000),
					yoyo: true,
					repeat: -1,
					ease: 'Sine.easeInOut'
				});
			}
		}
	}

	private drawAimReadyIndicator(delta: number) {
		if (!this.aimReadyGraphics) return;
		this.aimReadyGraphics.clear();

		// Only show when ball is ready to launch: not moving, not dragging, not won, not transitioning, not game over
		const canLaunch = this.ballBodyId
			&& !this.ballMoving
			&& !this.isDragging
			&& !this.isGameOver
			&& !this.data.get('isWon')
			&& !this.isTransitioning
			&& !this.isMenuOpen
			&& this.shotsRemaining > 0;

		if (!canLaunch) {
			this.aimReadyTime = 0;
			return;
		}

		this.aimReadyTime += delta;
		const ballPos = this.getBallPos();
		const t = this.aimReadyTime / 1000;

		// Pulsing animation parameters
		const baseLen = 45;
		const pulseLen = baseLen + Math.sin(t * 3) * 8;
		const baseAlpha = 0.4 + Math.sin(t * 2.5) * 0.15;

		// Draw upward extending line from ball
		const gfx = this.aimReadyGraphics;

		// Main white line extending upward-right (default aim direction)
		const angle = -Math.PI / 2; // straight up
		const endX = ballPos.x + Math.cos(angle) * pulseLen;
		const endY = ballPos.y + Math.sin(angle) * pulseLen;

		// Glow line (wider, softer)
		gfx.lineStyle(5, 0xffffff, baseAlpha * 0.3);
		gfx.beginPath();
		gfx.moveTo(ballPos.x, ballPos.y);
		gfx.lineTo(endX, endY);
		gfx.strokePath();

		// Core line
		gfx.lineStyle(2, 0xffffff, baseAlpha);
		gfx.beginPath();
		gfx.moveTo(ballPos.x, ballPos.y);
		gfx.lineTo(endX, endY);
		gfx.strokePath();

		// Small pulsing dot at the tip
		const dotAlpha = 0.5 + Math.sin(t * 4) * 0.3;
		const dotSize = 3 + Math.sin(t * 3.5) * 1;
		gfx.fillStyle(0xffffff, dotAlpha);
		gfx.fillCircle(endX, endY, dotSize);

		// Small arrowhead at tip
		const tipSize = 5;
		const perpX = Math.cos(angle + Math.PI / 2);
		const perpY = Math.sin(angle + Math.PI / 2);
		gfx.fillStyle(0xffffff, baseAlpha * 0.8);
		gfx.fillTriangle(
			endX, endY,
			endX - Math.cos(angle) * tipSize + perpX * tipSize * 0.5,
			endY - Math.sin(angle) * tipSize + perpY * tipSize * 0.5,
			endX - Math.cos(angle) * tipSize - perpX * tipSize * 0.5,
			endY - Math.sin(angle) * tipSize - perpY * tipSize * 0.5
		);
	}

	private updateIndicator() {
		if (!this.ballBodyId || !this.indicatorGraphics) return;
		if (this.isMenuOpen) {
			this.indicatorGraphics.clear();
			return;
		}

		this.indicatorGraphics.clear();

		const cam = this.cameras.main;
		const ballPos = this.getBallPos();

		const left = cam.scrollX;
		const right = cam.scrollX + this.scale.width;
		const top = cam.scrollY;
		const bottom = cam.scrollY + this.scale.height;

		const padding = 50;
		const isOffscreen = ballPos.x < left || ballPos.x > right || ballPos.y < top || ballPos.y > bottom;

		if (isOffscreen && !this.isTransitioning && !this.isGameOver) {
			const targetX = Phaser.Math.Clamp(ballPos.x, left + padding, right - padding);
			const targetY = Phaser.Math.Clamp(ballPos.y, top + padding, bottom - padding);

			const angle = Phaser.Math.Angle.Between(targetX, targetY, ballPos.x, ballPos.y);

			const screenX = targetX - cam.scrollX;
			const screenY = targetY - cam.scrollY;
			const size = 20;

			const p1 = Phaser.Math.Rotate({ x: 12, y: 0 }, angle);
			const p2 = Phaser.Math.Rotate({ x: -size, y: -size }, angle);
			const p3 = Phaser.Math.Rotate({ x: -size, y: size }, angle);

			// 3D Shadow
			this.indicatorGraphics.fillStyle(0x000000, 0.3);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x + 4, screenY + p1.y + 4);
			this.indicatorGraphics.lineTo(screenX + p2.x + 4, screenY + p2.y + 4);
			this.indicatorGraphics.lineTo(screenX + p3.x + 4, screenY + p3.y + 4);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.fillPath();

			// Border (Black)
			this.indicatorGraphics.lineStyle(6, 0x000000, 1);
			this.indicatorGraphics.fillStyle(0x000000, 1);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x, screenY + p1.y);
			this.indicatorGraphics.lineTo(screenX + p2.x, screenY + p2.y);
			this.indicatorGraphics.lineTo(screenX + p3.x, screenY + p3.y);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.strokePath();
			this.indicatorGraphics.fillPath();

			// Main Arrow (White)
			this.indicatorGraphics.lineStyle(2, 0xffffff, 1);
			this.indicatorGraphics.fillStyle(0xffffff, 1);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x, screenY + p1.y);
			this.indicatorGraphics.lineTo(screenX + p2.x, screenY + p2.y);
			this.indicatorGraphics.lineTo(screenX + p3.x, screenY + p3.y);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.fillPath();
			this.indicatorGraphics.strokePath();
		}
	}

	private enableRockGravity() {
		const rocks = this.currentTerrain?.rockBodies as RockBody[] | undefined;
		if (!rocks || rocks.length === 0) return;
		for (const rock of rocks) {
			if (rock.bodyId) b2Body_SetGravityScale(rock.bodyId, 1);
		}
	}

	private syncRockVisuals() {
		const rocks = this.currentTerrain?.rockBodies as RockBody[] | undefined;
		if (!rocks || rocks.length === 0) return;
		const S = this.SCALE;
		for (const rock of rocks) {
			if (!rock.bodyId || !rock.visual) continue;
			const pos = b2Body_GetPosition(rock.bodyId);
			const rot = b2Body_GetRotation(rock.bodyId);
			const angle = b2Rot_GetAngle(rot);
			rock.visual.x = pos.x * S;
			rock.visual.y = pos.y * S;
			rock.visual.rotation = angle;
		}
	}

	private cleanupRockBodies() {
		const rocks = this.currentTerrain?.rockBodies as RockBody[] | undefined;
		if (!rocks) return;
		for (const rock of rocks) {
			if (rock.bodyId) {
				b2DestroyBody(rock.bodyId);
			}
			if (rock.visual) {
				rock.visual.destroy();
			}
		}
		this.currentTerrain.rockBodies = [];
	}

	private updateShotVisuals() {
		this.shotVisuals.forEach((v, i) => v.setFillStyle(i >= this.shotsRemaining ? 0x666666 : 0xffffff));
	}

	private resetBall() {
		if (!this.ballBodyId) {
			this.createBallObject();
			return;
		}
		const S = this.SCALE;
		b2Body_SetLinearVelocity(this.ballBodyId, new b2Vec2(0, 0));
		b2Body_SetAngularVelocity(this.ballBodyId, 0);
		b2Body_SetTransform(this.ballBodyId,
			new b2Vec2(this.spawnPoint.x / S, this.spawnPoint.y / S),
			new b2Rot(1, 0)
		);

		// Ball starts stationary until next shot
		b2Body_SetGravityScale(this.ballBodyId, 0);

		// Sync visual immediately
		if (this.ballVisual) {
			this.ballVisual.x = this.spawnPoint.x;
			this.ballVisual.y = this.spawnPoint.y;
			this.ballVisual.rotation = 0;
		}

		this.recycleAllGhosts();

		// Reset bounce tracking and anti-oscillation state
		this.bounceCount = 0;
		this.slowTimer = 0;
		this.crawlTimer = 0;
		this.gameOverFallbackTimer = 0;
		this.lastVelXSign = 0;
		this.directionChanges = 0;
		this.oscillationDetected = false;
		b2Body_SetLinearDamping(this.ballBodyId, 0.03);
	}

	private initGhostPool() {
		this.ghostPool = [];
		this.activeGhosts = [];
		const ballColor = this.registry.get('ballColor') || 0xffffff;
		for (let i = 0; i < this.GHOST_POOL_SIZE; i++) {
			const g = this.add.circle(0, 0, 15, ballColor);
			g.setStrokeStyle(1.5, 0x000000, 0.5);
			g.setDepth(40).setVisible(false);
			this.ghostPool.push(g);
		}
	}

	private spawnGhost(x: number, y: number, now: number) {
		const obj = this.ghostPool.pop();
		if (!obj) return;
		const ballColor = this.registry.get('ballColor') || 0xffffff;
		obj.setFillStyle(ballColor);
		obj.setPosition(x, y).setScale(1).setAlpha(0.5).setVisible(true);
		this.activeGhosts.push({ obj, born: now });
	}

	private updateGhosts() {
		const now = this.time.now;
		for (let i = this.activeGhosts.length - 1; i >= 0; i--) {
			const g = this.activeGhosts[i];
			const t = (now - g.born) / this.GHOST_LIFESPAN;
			if (t >= 1) {
				g.obj.setVisible(false);
				this.ghostPool.push(g.obj);
				this.activeGhosts.splice(i, 1);
			} else {
				g.obj.setAlpha(0.5 * (1 - t));
				g.obj.setScale(1 - t);
			}
		}
	}

	private recycleAllGhosts() {
		for (const g of this.activeGhosts) {
			g.obj.setVisible(false);
			this.ghostPool.push(g.obj);
		}
		this.activeGhosts = [];
	}

	private setupDOMGameOver(): void {
		const gameOverMenu = document.getElementById('gameover-menu');
		if (gameOverMenu) {
			const el = gameOverMenu as HTMLElement;
			el.classList.add('hidden');
			el.style.display = 'none';
			el.style.pointerEvents = 'none';
		}

		// Clone-replace the retry button to remove stale listeners from previous sessions
		const btn = document.getElementById('btn-retry');
		if (btn) {
			const fresh = btn.cloneNode(true) as HTMLElement;
			btn.replaceWith(fresh);

			const doRestart = () => {
				this.haptic('light');
				this.playSFX('ButtonClick');
				this.restartGame();
			};
			fresh.addEventListener('touchstart', (e) => { e.preventDefault(); doRestart(); }, { passive: false });
			fresh.addEventListener('click', doRestart);
		}
	}

	private showGameOverMenu(): void {
		const finalScore = this.registry.get('score');
		const scoreDisplay = document.getElementById('gameover-score');
		const gameOverMenu = document.getElementById('gameover-menu');

		if (scoreDisplay) scoreDisplay.textContent = finalScore.toString();
		if (gameOverMenu) {
			gameOverMenu.classList.remove('hidden');
			(gameOverMenu as HTMLElement).style.display = 'flex';
			(gameOverMenu as HTMLElement).style.pointerEvents = 'auto';
		}
	}

	private hideGameOverMenu(): void {
		const gameOverMenu = document.getElementById('gameover-menu');
		if (gameOverMenu) {
			gameOverMenu.classList.add('hidden');
			(gameOverMenu as HTMLElement).style.display = 'none';
			(gameOverMenu as HTMLElement).style.pointerEvents = 'none';
		}
	}

	private restartGame(): void {
		if (this.pendingRestart) return;
		this.pendingRestart = true;

		this.hideGameOverMenu();
		this.hidePauseMenu();
		this.registry.set('score', 0);
		this.registry.set('skipMenu', true);
	}

	private goToMainMenu(): void {
		if (this.pendingRestart) return;
		this.pendingRestart = true;

		this.hidePauseMenu();
		document.getElementById('pauseBtn')?.classList.add('hidden');
		this.registry.set('score', 0);
		this.registry.set('skipMenu', false);
	}

	private handleGameOver() {
		if (this.isGameOver) return;
		this.isGameOver = true;
		this.recycleAllGhosts();

		this.playSFX('GameOver');
		this.settingsModal?.close();
		this.settingsModal?.setVisible(false);
		document.getElementById('pauseBtn')?.classList.add('hidden');
		this.scoreText?.setVisible(false);
		this.holeText?.setVisible(false);
		this.shotVisuals.forEach(v => v.setVisible(false));

		const finalScore = this.registry.get('score');
		if (typeof (window as any).submitScore === 'function') (window as any).submitScore(finalScore);
		this.haptic('error');

		this.showGameOverMenu();
	}

	// ── Pause Menu (DOM-based) ──

	private setupDOMPauseMenu(): void {
		const pauseMenu = document.getElementById('pause-menu');
		if (pauseMenu) {
			(pauseMenu as HTMLElement).classList.add('hidden');
			(pauseMenu as HTMLElement).style.display = 'none';
			(pauseMenu as HTMLElement).style.pointerEvents = 'none';
		}

		const pauseBtn = document.getElementById('pauseBtn');
		if (pauseBtn) {
			const fresh = pauseBtn.cloneNode(true) as HTMLElement;
			fresh.classList.add('hidden');
			pauseBtn.replaceWith(fresh);
			const doPause = () => {
				if (this.isMenuOpen || this.isGameOver) return;
				this.haptic('light');
				this.playSFX('ButtonClick');
				this.showPauseMenu();
			};
			fresh.addEventListener('touchstart', (e) => { e.preventDefault(); doPause(); }, { passive: false });
			fresh.addEventListener('click', doPause);
		}

		const btnResume = document.getElementById('btn-resume');
		if (btnResume) {
			const fresh = btnResume.cloneNode(true) as HTMLElement;
			btnResume.replaceWith(fresh);
			const doResume = () => {
				this.haptic('light');
				this.playSFX('ButtonClick');
				this.hidePauseMenu();
				this.isPaused = false;
				this.physicsPaused = false;
			};
			fresh.addEventListener('touchstart', (e) => { e.preventDefault(); doResume(); }, { passive: false });
			fresh.addEventListener('click', doResume);
		}

		const btnMainMenu = document.getElementById('btn-main-menu');
		if (btnMainMenu) {
			const fresh = btnMainMenu.cloneNode(true) as HTMLElement;
			btnMainMenu.replaceWith(fresh);
			const doMainMenu = () => {
				this.haptic('light');
				this.playSFX('ButtonClick');
				this.goToMainMenu();
			};
			fresh.addEventListener('touchstart', (e) => { e.preventDefault(); doMainMenu(); }, { passive: false });
			fresh.addEventListener('click', doMainMenu);
		}
	}

	private showPauseMenu(): void {
		this.isPaused = true;
		this.physicsPaused = true;
		const el = document.getElementById('pause-menu');
		if (el) {
			el.classList.remove('hidden');
			(el as HTMLElement).style.display = 'flex';
			(el as HTMLElement).style.pointerEvents = 'auto';
		}
	}

	private hidePauseMenu(): void {
		const el = document.getElementById('pause-menu');
		if (el) {
			el.classList.add('hidden');
			(el as HTMLElement).style.display = 'none';
			(el as HTMLElement).style.pointerEvents = 'none';
		}
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
