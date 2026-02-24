
// You can write more code here
/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

export default class Scene extends Phaser.Scene {

	constructor() {
		super("Scene");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	/* START-USER-CODE */

	// Merkezdeki hedef obje
	private centerTarget!: Phaser.GameObjects.Zone;
	// Düşmanları tutacak grup
	private enemies!: Phaser.GameObjects.Group;
	// Mermileri tutacak grup
	private bullets!: Phaser.GameObjects.Group;

	// Game Progression
	private money: number = 100;
	private level: number = 1;
	private enemiesDefeated: number = 0; // To track leveling
	private enemySpeed: number = 1;
	private enemyHP: number = 1;

	// Shop & Combat Stats
	private bulletDamage: number = 1;
	private damageCost: number = 150;

	// Spiral Burst Stats
	private ballCost: number = 50;
	private ballLevel: number = 0;
	private spiralAngle: number = -Math.PI / 2; // Start from top
	private orbitCost: number = 100;

	private spawnDistance: number = 75; // Spacing between rings of blocks
	private spawnTimer!: Phaser.Time.TimerEvent;

	// Upgrade Levels
	private damageLevel: number = 1;
	private orbitLevel: number = 0;
	private orbitBalls: Phaser.GameObjects.Arc[] = [];
	private orbitRadius: number = 80;
	private orbitAngle: number = 0;
	private orbitTrailGraphics!: Phaser.GameObjects.Graphics;
	private laserLevel: number = 0;
	private laserCost: number = 300;
	private laserChance: number = 0;
	private electricLevel: number = 0;
	private electricCost: number = 300;
	private electricChance: number = 0;
	private bombLevel: number = 0;
	private bombCost: number = 300;
	private bombChance: number = 0;

	// No max levels - all upgrades are infinite
	private purchaseStartTime: number = 0;
	private currentCatchUpMultiplier: number = 1;

	// Level Management
	private wavesSpawned: number = 0;
	private isLevelActive: boolean = true;
	private gameOverTriggered: boolean = false;
	private lastSpawnedDistance: number = 0; // Track distance of last wave for spacing

	// Visuals
	private idleHexagon!: Phaser.GameObjects.Graphics;
	private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private impactEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private bulletGlowSprites: Map<Phaser.GameObjects.Arc, Phaser.GameObjects.Image> = new Map();

	private bgMusic!: Phaser.Sound.BaseSound;
	private audioSettings: { music: boolean, fx: boolean } = { music: true, fx: true };
	private lastBlockPopPlayTime: number = 0;

	// Dynamic Color System
	private currentDynamicColor: number = 0x242424; // Initial background color
	private colorTransitionTimer!: Phaser.Time.TimerEvent;

	// World & Camera Panning
	private worldWidth: number = 0;
	private worldHeight: number = 0;
	private isPanning: boolean = false;
	private fireTrailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

	create(data: { isTestMode?: boolean }) {

		this.editorCreate();

		// Remove debug overlay if present from previous session
		const dbgEl = document.getElementById('_dbg_overlay');
		if (dbgEl) dbgEl.remove();

		// Reset all game state for clean restarts
		this.money = 100;
		this.level = 1;
		this.enemiesDefeated = 0;
		this.enemySpeed = 1;
		this.enemyHP = 1;
		this.bulletDamage = 1;
		this.damageCost = 150;
		this.ballCost = 50;
		this.ballLevel = 0;
		this.spiralAngle = -Math.PI / 2;
		this.orbitCost = 100;
		this.spawnDistance = 75;
		this.damageLevel = 1;
		this.orbitLevel = 0;
		this.orbitBalls = [];
		this.orbitRadius = 80;
		this.orbitAngle = 0;
		this.laserLevel = 0;
		this.laserCost = 300;
		this.laserChance = 0;
		this.electricLevel = 0;
		this.electricCost = 300;
		this.electricChance = 0;
		this.bombLevel = 0;
		this.bombCost = 300;
		this.bombChance = 0;
		this.purchaseStartTime = 0;
		this.currentCatchUpMultiplier = 1;
		this.wavesSpawned = 0;
		this.isLevelActive = true;
		this.gameOverTriggered = false;
		this.lastSpawnedDistance = 0;
		this.score = 0;
		this.lastBlockPopPlayTime = 0;
		this.lastShopRefresh = 0;
		this.globalWorldSpeed = 0.6;
		this.input.enabled = true;
		this.isPanning = false;

		// Clean up glow sprites from previous session
		this.bulletGlowSprites.forEach((glow) => glow.destroy());
		this.bulletGlowSprites.clear();

		// World extends equally in all directions beyond the visible area
		const zoom = 0.55;
		const visibleW = this.scale.width / zoom;
		const visibleH = this.scale.height / zoom;
		const panPadding = 1200;
		this.worldWidth = visibleW + panPadding * 2;
		this.worldHeight = visibleH + panPadding * 2;

		this.cameras.main.setZoom(0.55);
		this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
		this.cameras.main.centerOn(this.worldWidth / 2, this.worldHeight / 2);

		// Initial background color setup - Start with Black
		this.currentDynamicColor = 0x000000;
		this.cameras.main.setBackgroundColor(this.currentDynamicColor);

		// Start 20-second color transition loop
		this.colorTransitionTimer = this.time.addEvent({
			delay: 20000,
			callback: this.startColorTransition,
			callbackScope: this,
			loop: true
		});

		const centerX = this.worldWidth / 2;
		const centerY = this.worldHeight / 2;
		this.centerTarget = this.add.zone(centerX, centerY, 10, 10);

		// Create Idle Hexagon (Visual Only)
		this.idleHexagon = this.add.graphics({ x: centerX, y: centerY });

		const r = 30;
		const hexPoints: { x: number, y: number }[] = [];
		for (let i = 0; i < 6; i++) {
			const angle = Phaser.Math.DegToRad(60 * i);
			hexPoints.push({
				x: r * Math.cos(angle),
				y: r * Math.sin(angle)
			});
		}

		this.idleHexagon.lineStyle(2, 0x00ff00);
		this.idleHexagon.fillStyle(0x00ff00, 0.2);
		this.idleHexagon.beginPath();
		this.idleHexagon.moveTo(hexPoints[0].x, hexPoints[0].y);
		for (let i = 1; i < hexPoints.length; i++) {
			this.idleHexagon.lineTo(hexPoints[i].x, hexPoints[i].y);
		}
		this.idleHexagon.closePath();
		this.idleHexagon.fillPath();
		this.idleHexagon.strokePath();

		// No glow behind hexagon — keep center clean

		this.enemies = this.add.group();
		this.bullets = this.add.group();

		// Particle Systems
		const particleManager = this.add.particles(0, 0, 'flare'); // You might need to load a texture, or use a default if available, or create one.
		// Since we might not have a texture, let's create a simple texture for particles
		if (!this.textures.exists('particle')) {
			const graphics = this.make.graphics({ x: 0, y: 0 });
			graphics.fillStyle(0xffffff, 1);
			graphics.fillCircle(4, 4, 4);
			graphics.generateTexture('particle', 8, 8);
		}

		// Ghost Trail Texture (Bigger circle matching bullet size)
		if (!this.textures.exists('bulletTrail')) {
			const graphics = this.make.graphics({ x: 0, y: 0 });
			graphics.fillStyle(0xffffff, 1);
			graphics.fillCircle(18, 18, 18); // Match bullet radius
			graphics.generateTexture('bulletTrail', 36, 36);
		}

		this.trailEmitter = this.add.particles(0, 0, 'bulletTrail', {
			speed: 0,
			scale: { start: 1, end: 0.2 },
			alpha: { start: 0.25, end: 0 },
			lifespan: 90,
			blendMode: 'NORMAL',
			frequency: -1
		});

		this.impactEmitter = this.add.particles(0, 0, 'particle', {
			speed: { min: 50, max: 150 },
			scale: { start: 1, end: 0 },
			alpha: { start: 1, end: 0 },
			lifespan: 300,
			blendMode: 'ADD',
			emitting: false
		});

		this.explosionEmitter = this.add.particles(0, 0, 'particle', {
			speed: { min: 100, max: 300 },
			scale: { start: 2, end: 0 },
			alpha: { start: 1, end: 0 },
			lifespan: 600,
			blendMode: 'ADD',
			quantity: 30,
			emitting: false,
			tint: 0xff4444 // Reddish tint
		});

		// Fire trail texture (small warm circle for tier 2+)
		if (!this.textures.exists('fireTrail')) {
			const g = this.make.graphics({ x: 0, y: 0 });
			g.fillStyle(0xffffff, 1);
			g.fillCircle(6, 6, 6);
			g.generateTexture('fireTrail', 12, 12);
		}

		// Pre-rendered glow textures (replaces expensive per-object postFX.addGlow shaders)
		const glowSize = 56;
		const glowCenter = glowSize / 2;
		if (!this.textures.exists('glowWhite')) {
			const g = this.make.graphics({ x: 0, y: 0 });
			g.fillStyle(0xffffff, 0.15);
			g.fillCircle(glowCenter, glowCenter, glowCenter);
			g.fillStyle(0xffffff, 0.1);
			g.fillCircle(glowCenter, glowCenter, glowCenter * 0.65);
			g.generateTexture('glowWhite', glowSize, glowSize);
			g.destroy();
		}

		this.fireTrailEmitter = this.add.particles(0, 0, 'fireTrail', {
			speed: { min: 5, max: 30 },
			scale: { start: 0.8, end: 0 },
			alpha: { start: 0.6, end: 0 },
			lifespan: 120,
			blendMode: 'ADD',
			tint: [0xff4400, 0xff8800, 0xffcc00],
			frequency: -1
		});

		// Touch-to-pan camera using raw DOM events (bypasses Phaser's per-frame batching)
		const panBarHeight = 180;
		let lastScreenX = 0;
		let lastScreenY = 0;
		const panCam = this.cameras.main;
		const gameCanvas = this.game.canvas;

		// Zoom limits: default 0.55, zoom in to 0.85, zoom out to 0.38
		const zoomMin = 0.38;
		const zoomMax = 0.85;
		const zoomDefault = 0.55;
		let pinchStartDist = 0;
		let pinchStartZoom = zoomDefault;
		let isPinching = false;

		const getTouchDist = (e: TouchEvent): number => {
			const a = e.touches[0];
			const b = e.touches[1];
			return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		};

		const clampZoom = (z: number): number => Math.min(zoomMax, Math.max(zoomMin, z));

		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 2) {
				isPinching = true;
				this.isPanning = false;
				pinchStartDist = getTouchDist(e);
				pinchStartZoom = panCam.zoom;
				return;
			}
			if (e.touches.length === 1) {
				const t = e.touches[0];
				if (t.clientY > window.innerHeight - panBarHeight) return;
				this.isPanning = true;
				lastScreenX = t.clientX;
				lastScreenY = t.clientY;
			}
		};
		const onTouchMove = (e: TouchEvent) => {
			if (isPinching && e.touches.length === 2) {
				const dist = getTouchDist(e);
				const scale = dist / pinchStartDist;
				panCam.setZoom(clampZoom(pinchStartZoom * scale));
				return;
			}
			if (!this.isPanning || e.touches.length !== 1) return;
			const t = e.touches[0];
			const dx = t.clientX - lastScreenX;
			const dy = t.clientY - lastScreenY;
			panCam.scrollX -= dx / panCam.zoom;
			panCam.scrollY -= dy / panCam.zoom;
			lastScreenX = t.clientX;
			lastScreenY = t.clientY;
		};
		const onTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) isPinching = false;
			if (e.touches.length === 0) this.isPanning = false;
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const zoomDelta = e.deltaY > 0 ? -0.03 : 0.03;
			panCam.setZoom(clampZoom(panCam.zoom + zoomDelta));
		};

		gameCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
		gameCanvas.addEventListener('touchmove', onTouchMove, { passive: true });
		gameCanvas.addEventListener('touchend', onTouchEnd, { passive: true });
		gameCanvas.addEventListener('wheel', onWheel, { passive: false });

		// Clean up raw DOM listeners when scene shuts down (prevents stacking on restart)
		this.events.once('shutdown', () => {
			gameCanvas.removeEventListener('touchstart', onTouchStart);
			gameCanvas.removeEventListener('touchmove', onTouchMove);
			gameCanvas.removeEventListener('touchend', onTouchEnd);
			gameCanvas.removeEventListener('wheel', onWheel);
		});

		// Desktop mouse panning (kept via Phaser since mouse events are reliable)
		this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
			if (p.event instanceof TouchEvent) return;
			const ev = p.event as MouseEvent;
			if (ev.clientY > window.innerHeight - panBarHeight) return;
			this.isPanning = true;
			lastScreenX = ev.clientX;
			lastScreenY = ev.clientY;
		});
		this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
			if (p.event instanceof TouchEvent) return;
			if (!this.isPanning || !p.isDown) return;
			const ev = p.event as MouseEvent;
			panCam.scrollX -= (ev.clientX - lastScreenX) / panCam.zoom;
			panCam.scrollY -= (ev.clientY - lastScreenY) / panCam.zoom;
			lastScreenX = ev.clientX;
			lastScreenY = ev.clientY;
		});
		this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
			if (p.event instanceof TouchEvent) return;
			this.isPanning = false;
		});

		// Start UI Scene
		this.purchaseStartTime = this.time.now;
		this.scene.launch("UIScene");
		this.time.delayedCall(100, () => {
			this.events.emit('game-start');
		});

		// Initialize values
		this.money = 100;
		this.level = 1;
		this.enemiesDefeated = 0;
		this.wavesSpawned = 0;
		this.isLevelActive = true;

		// TEST MODE: Start at Level 100 with Upgrades
		if (data && data.isTestMode) {
			this.level = 100;
			this.money = 1000000; // Big money for testing
			this.bulletDamage = 80;
			// Removed old stats
			this.damageLevel = 20;
			this.orbitLevel = 5;
			this.laserLevel = 6;
			this.laserChance = 20;
			this.damageCost = 6000;
			this.laserCost = 200;

			// Difficulty Scaling (Level 100 difficulty)
			// Speed caps at Level 20
			this.enemyHP = 1 + (100 - 1) * 0.5; // Scaled HP
			this.enemySpeed = 1 + (19 * 0.055);
			this.globalWorldSpeed = 3 + (19 * 0.165);

			this.time.delayedCall(100, () => {
				this.events.emit('update-money', this.money);
				this.events.emit('update-level', this.level);
				this.events.emit('update-score', this.score);
			});
		} else {
			this.time.delayedCall(100, () => {
				this.events.emit('update-money', this.money);
				this.events.emit('update-level', this.level);
				this.events.emit('update-score', this.score);
			});
		}

		// Spawn Timer (Dynamic)
		this.spawnCircleWave();


		// Upgrade Listener

		this.events.on('request-upgrade', (type: string) => {
			// Enforce 5-second initial lock
			if (this.time.now - this.purchaseStartTime < 5000) {
				this.updateShopUI();
				return;
			}

			// Enforce Lock: Cannot buy anything else until first ball is bought
			if (type !== 'balls' && this.ballCost <= 50) {
				this.updateShopUI();
				return;
			}

			let purchased = false;

			// Cost scaling helper: linear x1.4 up to level 10, then exponential x1.8 after
			const nextCost = (currentCost: number, level: number): number => {
				if (level <= 10) {
					return Math.round((currentCost * 1.4) / 50) * 50;
				}
				return Math.round((currentCost * 1.8) / 50) * 50;
			};

			if (type === 'damage') {
				if (this.money >= this.damageCost) {
					this.addMoney(-this.damageCost);
					this.damageLevel++;
					this.bulletDamage += 0.11;
					this.damageCost = nextCost(this.damageCost, this.damageLevel);
					this.updateShopUI();
					this.refreshBulletVisuals();
					purchased = true;
				}
			} else if (type === 'balls') {
				if (this.money >= this.ballCost) {
					this.addMoney(-this.ballCost);
					this.ballLevel++;
					this.spawnBall();
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'orbit') {
				if (this.money >= this.orbitCost) {
					this.addMoney(-this.orbitCost);
					this.orbitLevel++;
					this.spawnOrbitBall();
					this.orbitCost = nextCost(this.orbitCost, this.orbitLevel);
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'laser') {
				if (this.money >= this.laserCost) {
					this.addMoney(-this.laserCost);
					this.laserLevel++;
					if (this.laserLevel === 1) {
						this.laserChance = 5;
					} else {
						this.laserChance += 1.25;
					}
					this.laserCost = nextCost(this.laserCost, this.laserLevel);
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'electric') {
				if (this.money >= this.electricCost) {
					this.addMoney(-this.electricCost);
					this.electricLevel++;
					if (this.electricLevel === 1) {
						this.electricChance = 5;
					} else {
						this.electricChance += 1.25;
					}
					this.electricCost = nextCost(this.electricCost, this.electricLevel);
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'bomb') {
				if (this.money >= this.bombCost) {
					this.addMoney(-this.bombCost);
					this.bombLevel++;
					if (this.bombLevel === 1) {
						this.bombChance = 5;
					} else {
						this.bombChance += 1.25;
					}
					this.bombCost = nextCost(this.bombCost, this.bombLevel);
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'burst') {
				const cost = this.ballCost * 2;
				if (this.money >= cost) {
					this.addMoney(-cost);
					this.spawnBurst();
					this.updateShopUI();
					purchased = true;
				}
			}

			if (purchased) {
				this.playSound('purchase');
			}
		});

		// Listen for UI requesting update
		this.events.on('request-shop-update', this.updateShopUI, this);

		// Submit current score on request
		this.events.on('request-current-score', () => {
			console.log('[Scene] Score submission requested:', this.score);
			this.events.emit('submit-score-value', this.score);
		});

		// Re-center camera on the hexagon with a smooth tween
		this.events.on('request-recenter', () => {
			const cam = this.cameras.main;
			const targetX = this.getWorldCenterX() - cam.width / 2;
			const targetY = this.getWorldCenterY() - cam.height / 2;
			this.tweens.add({
				targets: cam,
				scrollX: targetX,
				scrollY: targetY,
				duration: 300,
				ease: 'Power2'
			});
			this.triggerHaptic('light');
		});

		// Initial UI Update
		this.updateShopUI();

		// Handle Window Resize
		this.scale.on('resize', this.resize, this);

		// Initialize Audio
		this.initAudio();

		// VFX system uses code-generated effects (no sprite atlases needed)
	}

	// ── Code-Generated VFX System ───────────────────────────────────────

	/** Expanding ring burst - great for spawn, kills, activations */
	vfxRingBurst(x: number, y: number, color: number, radius: number = 40, thickness: number = 4, dur: number = 300) {
		const ring = this.add.circle(x, y, 4, undefined, 0);
		ring.setStrokeStyle(thickness, color);
		ring.setDepth(60);
		ring.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: ring,
			radius: radius,
			alpha: 0,
			duration: dur,
			ease: 'Cubic.easeOut',
			onComplete: () => ring.destroy()
		});
	}

	/** Flash circle that pops then fades */
	vfxFlash(x: number, y: number, color: number, size: number = 30, dur: number = 200) {
		const flash = this.add.circle(x, y, size, color, 0.7);
		flash.setDepth(58);
		flash.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: flash,
			scale: 2.5,
			alpha: 0,
			duration: dur,
			ease: 'Cubic.easeOut',
			onComplete: () => flash.destroy()
		});
	}

	/** Radial particle burst using existing particle texture */
	vfxParticleBurst(x: number, y: number, color: number, count: number = 12, speed: number = 200, life: number = 400) {
		for (let i = 0; i < count; i++) {
			const angle = (Math.PI * 2 / count) * i + Phaser.Math.FloatBetween(-0.2, 0.2);
			const spd = speed * Phaser.Math.FloatBetween(0.5, 1.2);
			const vx = Math.cos(angle) * spd;
			const vy = Math.sin(angle) * spd;
			const sz = Phaser.Math.Between(3, 7);
			const dot = this.add.circle(x, y, sz, color, 1);
			dot.setDepth(59);
			dot.setBlendMode(Phaser.BlendModes.ADD);
			this.tweens.add({
				targets: dot,
				x: x + vx * (life / 1000),
				y: y + vy * (life / 1000),
				alpha: 0,
				scale: 0.1,
				duration: life,
				ease: 'Cubic.easeOut',
				onComplete: () => dot.destroy()
			});
		}
	}

	/** Star-shaped burst lines radiating outward */
	vfxStarBurst(x: number, y: number, color: number, rays: number = 6, length: number = 50, dur: number = 300) {
		for (let i = 0; i < rays; i++) {
			const angle = (Math.PI * 2 / rays) * i;
			const g = this.add.graphics();
			g.lineStyle(3, color, 1);
			const ex = x + Math.cos(angle) * length;
			const ey = y + Math.sin(angle) * length;
			g.lineBetween(x, y, ex, ey);
			g.setDepth(57);
			g.setBlendMode(Phaser.BlendModes.ADD);
			this.tweens.add({
				targets: g,
				alpha: 0,
				duration: dur,
				ease: 'Power2',
				onComplete: () => g.destroy()
			});
		}
	}

	// ── Composed VFX for game events ────────────────────────────────────

	/** Kill effect - tier determines color and intensity */
	vfxKill(x: number, y: number) {
		const tier = this.getDamageTier();
		const colors = [0x66ccff, 0x44ff88, 0xff8833, 0xff3344];
		const c = colors[tier] || colors[0];
		const count = 8 + tier * 4;
		const radius = 35 + tier * 15;
		this.vfxRingBurst(x, y, c, radius, 3 + tier, 250 + tier * 50);
		this.vfxParticleBurst(x, y, c, count, 150 + tier * 50, 300 + tier * 50);
		if (tier >= 2) this.vfxFlash(x, y, c, 20 + tier * 5);
	}

	/** Ball spawn flash at center */
	vfxBallSpawn(x: number, y: number) {
		this.vfxRingBurst(x, y, 0x44aaff, 50, 3, 300);
		this.vfxFlash(x, y, 0x88ccff, 20, 200);
		this.vfxStarBurst(x, y, 0x44aaff, 5, 35, 250);
	}

	/** Burst activation flash */
	vfxBurstFlash(x: number, y: number) {
		this.vfxFlash(x, y, 0xffff44, 35, 250);
		this.vfxRingBurst(x, y, 0xffcc00, 60, 4, 350);
		this.vfxStarBurst(x, y, 0x00ffff, 8, 45, 300);
	}

	/** Burst ball trail dash */
	vfxDashTrail(x: number, y: number) {
		this.vfxFlash(x, y, 0x00ffff, 12, 150);
	}

	/** Laser activation flash at source */
	vfxLaserActivation(x: number, y: number, tier: number) {
		const colors = [0x4488ff, 0xff8800, 0xff2222];
		const c = colors[tier] || colors[0];
		this.vfxFlash(x, y, c, 25, 200);
		this.vfxRingBurst(x, y, c, 40, 3, 250);
	}

	/** Laser impact on enemy */
	vfxLaserImpact(x: number, y: number, tier: number) {
		const colors = [0x4488ff, 0xff8800, 0xff2222];
		const c = colors[tier] || colors[0];
		this.vfxParticleBurst(x, y, c, 6 + tier * 2, 100, 250);
		this.vfxFlash(x, y, 0xffffff, 10, 150);
	}

	/** Electric strike at source */
	vfxElectricStrike(x: number, y: number, tier: number) {
		const colors = [0x00ffff, 0xaa44ff, 0xffff00];
		const c = colors[tier] || colors[0];
		this.vfxFlash(x, y, c, 20, 200);
		this.vfxStarBurst(x, y, c, 4 + tier * 2, 30 + tier * 10, 250);
	}

	/** Electric chain zap at source */
	vfxElectricChain(x: number, y: number, tier: number) {
		const colors = [0x00ffff, 0xaa44ff, 0xffff00];
		const c = colors[tier] || colors[0];
		this.vfxRingBurst(x, y, c, 30, 2, 200);
	}

	/** Electric endpoint burst */
	vfxElectricEndpoint(x: number, y: number, tier: number) {
		const colors = [0x00ffff, 0xaa44ff, 0xffff00];
		const c = colors[tier] || colors[0];
		this.vfxParticleBurst(x, y, c, 4 + tier, 80, 200);
	}

	/** Bomb pre-flash */
	vfxBombPreflash(x: number, y: number) {
		this.vfxFlash(x, y, 0xff6600, 30, 150);
	}

	/** Bomb main explosion - tier scales size and intensity */
	vfxBombExplosion(x: number, y: number, tier: number) {
		const colors = [0xff8800, 0xff4400, 0xff0044];
		const c = colors[tier] || colors[0];
		const radius = 60 + tier * 25;
		this.vfxFlash(x, y, c, 40 + tier * 15, 400);
		this.vfxRingBurst(x, y, c, radius, 5 + tier * 2, 400 + tier * 50);
		this.vfxParticleBurst(x, y, c, 16 + tier * 8, 200 + tier * 50, 500);
		this.vfxStarBurst(x, y, 0xffcc44, 6 + tier * 2, radius * 0.8, 350);
		if (tier >= 1) {
			this.time.delayedCall(80, () => {
				this.vfxRingBurst(x, y, 0xffaa00, radius * 0.6, 3, 300);
			});
		}
	}

	/** Bomb smoke aftermath */
	vfxBombSmoke(x: number, y: number, tier: number) {
		const count = 5 + tier * 3;
		for (let i = 0; i < count; i++) {
			const ox = Phaser.Math.Between(-20, 20);
			const oy = Phaser.Math.Between(-20, 20);
			const sz = Phaser.Math.Between(8, 16 + tier * 4);
			const smoke = this.add.circle(x + ox, y + oy, sz, 0x888888, 0.3);
			smoke.setDepth(54);
			this.tweens.add({
				targets: smoke,
				y: smoke.y - Phaser.Math.Between(20, 50),
				scale: Phaser.Math.FloatBetween(1.5, 2.5),
				alpha: 0,
				duration: Phaser.Math.Between(400, 700),
				ease: 'Cubic.easeOut',
				onComplete: () => smoke.destroy()
			});
		}
	}

	/** Red block explosion */
	vfxRedExplosion(x: number, y: number) {
		this.vfxFlash(x, y, 0xff2222, 35, 300);
		this.vfxRingBurst(x, y, 0xff4444, 50, 4, 350);
		this.vfxParticleBurst(x, y, 0xff6644, 14, 180, 400);
	}

	/**
	 * Get the damage tier (0-3) based on current damage level.
	 * Tier 0: Level 1-15, Tier 1: Level 16-30, Tier 2: Level 31-45, Tier 3: Level 46-60
	 */
	getDamageTier(): number {
		if (this.damageLevel >= 15) return 3;
		if (this.damageLevel >= 8) return 2;
		if (this.damageLevel >= 4) return 1;
		return 0;
	}

	/**
	 * Get the orbit tier (0-3) based on current orbit level.
	 */
	getOrbitTier(): number {
		if (this.orbitLevel >= 16) return 3;
		if (this.orbitLevel >= 11) return 2;
		if (this.orbitLevel >= 6) return 1;
		return 0;
	}

	/**
	 * Get the laser tier (0-2) based on current laser level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5-6
	 */
	getLaserTier(): number {
		if (this.laserLevel >= 5) return 2;
		if (this.laserLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the electric tier (0-2) based on current electric level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5
	 */
	getElectricTier(): number {
		if (this.electricLevel >= 5) return 2;
		if (this.electricLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the bomb tier (0-2) based on current bomb level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5
	 */
	getBombTier(): number {
		if (this.bombLevel >= 5) return 2;
		if (this.bombLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the bullet tint color based on damage tier.
	 */
	getBulletTint(): number {
		const tier = this.getDamageTier();
		switch (tier) {
			case 3: return 0xff4444; // Red
			case 2: return 0xff8800; // Orange
			case 1: return 0x44ff44; // Green
			default: return 0xffffff; // White (default)
		}
	}

	/** Apply tier-based glow sprite behind a bullet (replaces postFX.addGlow) */
	applyBulletFX(bullet: Phaser.GameObjects.Arc, tier: number) {
		// Remove existing glow sprite if any
		const existing = this.bulletGlowSprites.get(bullet);
		if (existing) {
			existing.destroy();
			this.bulletGlowSprites.delete(bullet);
		}

		if (tier <= 0) return;

		const tints: Record<number, number> = { 1: 0x44ff44, 2: 0xff8800, 3: 0xff4400 };
		const scales: Record<number, number> = { 1: 0.8, 2: 0.95, 3: 1.1 };

		const glow = this.add.image(bullet.x, bullet.y, 'glowWhite');
		glow.setTint(tints[tier]);
		glow.setScale(scales[tier]);
		glow.setBlendMode(Phaser.BlendModes.ADD);
		glow.setDepth(bullet.depth - 1);
		this.bulletGlowSprites.set(bullet, glow);
	}

	/** Destroy a bullet and its associated glow sprite */
	destroyBulletGlow(bullet: Phaser.GameObjects.Arc) {
		const glow = this.bulletGlowSprites.get(bullet);
		if (glow) {
			glow.destroy();
			this.bulletGlowSprites.delete(bullet);
		}
	}

	/** Update all existing bullet colors and FX to match current damage tier */
	refreshBulletVisuals() {
		const tier = this.getDamageTier();
		const tint = this.getBulletTint();

		this.bullets.getChildren().forEach((child: any) => {
			const bullet = child as Phaser.GameObjects.Arc;
			if (!bullet.active) return;
			// Skip burst balls (cyan) and extra/duplicate balls (magenta)
			if (bullet.getData('isBurst')) return;
			if (bullet.getData('isDuplicate')) return;

			bullet.setFillStyle(tint);
			this.applyBulletFX(bullet, tier);
		});
	}

	resize(gameSize: Phaser.Structs.Size, baseSize: Phaser.Structs.Size, displaySize: Phaser.Structs.Size, resolution: number) {
		const z = this.cameras.main.zoom || 0.55;
		const panPadding = 1200;
		this.worldWidth = gameSize.width / z + panPadding * 2;
		this.worldHeight = gameSize.height / z + panPadding * 2;

		const centerX = this.worldWidth / 2;
		const centerY = this.worldHeight / 2;

		this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

		if (this.centerTarget) {
			this.centerTarget.setPosition(centerX, centerY);
		}

		if (this.idleHexagon) {
			this.idleHexagon.setPosition(centerX, centerY);
		}
		if (this.enemies) {
			this.enemies.getChildren().forEach((child: any) => {
				const enemy = child as Phaser.GameObjects.Container;
				if (enemy.active) {
					const targetAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, centerX, centerY);
					enemy.rotation = targetAngle;
				}
			});
		}
	}

	updateShopUI() {
		const timeLocked = (this.time.now - this.purchaseStartTime) < 5000;
		// New logic: Only BALLS allowed until first ball bought (Ball Cost > 50).
		const ballLocked = this.ballCost <= 50;
		const burstCost = this.ballCost * 2;

		this.events.emit('update-shop-prices', {
			money: Math.floor(this.money),
			damage: Math.round(this.damageCost),
			balls: Math.round(this.ballCost),
			ballsLv: this.ballLevel,
			orbit: Math.round(this.orbitCost),
			laser: Math.round(this.laserCost),
			electric: Math.round(this.electricCost),
			bomb: Math.round(this.bombCost),
			burst: Math.round(burstCost),
			damageLv: this.damageLevel,
			orbitLv: this.orbitLevel,
			laserLv: this.laserLevel,
			electricLv: this.electricLevel,
			bombLv: this.bombLevel,
			locked: ballLocked,
			timeLocked: timeLocked
		});

		// If still in the 5s period, schedule an update precisely when it ends
		if (timeLocked) {
			const remaining = 5000 - (this.time.now - this.purchaseStartTime);
			this.time.delayedCall(remaining + 10, () => this.updateShopUI());
		}
	}

	/** World center X (shorthand to avoid repeated division) */
	getWorldCenterX(): number { return this.worldWidth / 2; }
	/** World center Y */
	getWorldCenterY(): number { return this.worldHeight / 2; }

	// World Speed Control
	private globalWorldSpeed: number = 0.55;

	// Helper to calculate speed multiplier based on screen size
	// Mobile reference: ~850px height.
	// If screen is larger (e.g. Desktop 1920x1080), multiplier > 1.
	getSpeedMultiplier(): number {
		const maxDim = Math.max(this.scale.width, this.scale.height);
		// 850px is a rough baseline for a "tall" mobile screen or "standard" view distance
		// We clamp at 1.0 minimum so mobile/smaller screens don't get SLOWER.
		return Math.max(1, maxDim / 850);
	}

	spawnCircleWave() {
		if (!this.isLevelActive) return;

		this.wavesSpawned++;

		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();
		const maxDim = Math.max(this.worldWidth, this.worldHeight);
		// Gradually push spawn point further: starts at 0.55x, grows by 0.03 per wave, caps at 1.1x
		const spawnMult = Math.min(1.1, 0.55 + (this.wavesSpawned - 1) * 0.03);
		const radius = maxDim * spawnMult;

		// Bir dairede kaç kutu olsun?
		const count = 50;
		// Her kutu arasındaki açı farkı
		const angleStep = (Math.PI * 2) / count;

		// Offset logic: Shift every other wave by half a step to fill gaps
		const angleOffset = (this.wavesSpawned % 2 === 0) ? (angleStep / 2) : 0;

		// O anki dalga için rastgele bir renk seçelim (Fallback if we needed one, but individual logic overrides)
		// const waveColor = Phaser.Display.Color.RandomRGB().color;

		// Calculate Speed Multiplier ONCE per wave
		const speedMultiplier = this.getSpeedMultiplier();

		for (let i = 0; i < count; i++) {
			// Açıyı hesapla
			const angle = i * angleStep + angleOffset;

			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);

			// Calculate Probabilities
			// Red: Starts low, increases by 0.5% per level, Max 10%
			const redChance = Math.min(5, 2 + (this.level * 0.5));

			// Blue: Fixed 15%
			const blueChance = 15;

			const rand = Phaser.Math.Between(0, 100);

			let color = 0xffffff;
			let hp = 1; // Default (White) - one hit kill
			let type = 'white';
			let moneyValue = 2 + (this.level - 1) * 0.4; // Money income stretched (1 * 0.4)

			// HP Scaling: White = 1-hit kill early, Blue = tanky, Red = strongest
			const whiteHP = 1 + (this.level - 1) * 0.8;
			const blueHP = 3 + (this.level - 1) * 2.5;
			const redHP = 6 + (this.level - 1) * 5;

			if (rand < redChance) {
				color = 0xff0000;
				hp = redHP;
				type = 'red';
				moneyValue = moneyValue * 3; // 3x
			} else if (rand < redChance + blueChance) {
				color = 0x4444ff; // Brighter Blue
				hp = blueHP;
				type = 'blue';
				moneyValue = moneyValue * 2; // 2x
			} else {
				// White
				hp = whiteHP;
			}

			// 3D Blok Efekti için Container
			const enemy = this.add.container(x, y);

			// Alt kısım (Gölge/Derinlik)
			const darkColor = Phaser.Display.Color.ValueToColor(color).darken(30).color;
			const side = this.add.rectangle(6, 6, 50, 50, darkColor);
			side.setStrokeStyle(2, 0x000000);
			side.setName('side');

			// Üst kısım (Ana Renk)
			const top = this.add.rectangle(0, 0, 50, 50, color);
			top.setStrokeStyle(2, 0x000000);
			top.setName('top');

			enemy.add([side, top]);

			if (type === 'white') {
				enemy.setData('isDynamicColor', true);
				// Set initial color based on current system color
				const maxHP = hp;
				const currentHP = hp;
				const ratio = currentHP / maxHP;
				const brightness = 0.5 + (0.5 * ratio);

				// If background is black, make blocks white
				let baseColor = this.currentDynamicColor;
				if (baseColor === 0x000000) baseColor = 0xffffff;

				const colorObj = Phaser.Display.Color.ValueToColor(baseColor);
				const r = Math.floor(colorObj.red * brightness);
				const g = Math.floor(colorObj.green * brightness);
				const b = Math.floor(colorObj.blue * brightness);
				top.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));

				const darkBase = Phaser.Display.Color.ValueToColor(baseColor).darken(30).color;
				side.setFillStyle(darkBase);
			} else {
				enemy.setData('originalColor', color);
			}

			enemy.setData('maxHP', hp);
			enemy.setData('hp', hp);

			// Apply Global World Speed multiplied by Screen Size Multiplier
			const effectiveSpeed = this.enemySpeed * this.globalWorldSpeed * speedMultiplier;
			enemy.setData('speed', effectiveSpeed);

			enemy.setData('moneyValue', moneyValue);

			this.enemies.add(enemy);

			// Hedefe doğru döndür
			const targetAngle = Phaser.Math.Angle.Between(x, y, centerX, centerY);
			enemy.rotation = targetAngle;
		}
	}

	// Remove scheduleNextWave entirely as we will use update loop check
	getGlobalEnemySpeed(): number {
		return this.enemySpeed * this.globalWorldSpeed * this.getSpeedMultiplier() * this.currentCatchUpMultiplier;
	}

	spawnBurst() {
		this.updateShopUI();

		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();

		this.vfxBurstFlash(centerX, centerY);
		this.playSound('burstFire', 0.6);

		this.time.addEvent({
			delay: 100,
			repeat: 7,
			callback: () => {
				this.spawnSingleBall(10, 0x00ffff, true);
				this.playSound('ballShoot', 0.5, Phaser.Math.Between(-300, 300));
				this.vfxDashTrail(centerX, centerY);
			},
			callbackScope: this
		});
	}

	spawnSingleBall(bounces: number, color: number, isBurst: boolean = false) {
		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();
		const speed = 25;

		const vx = Math.cos(this.spiralAngle) * speed;
		const vy = Math.sin(this.spiralAngle) * speed;

		const bulletColor = isBurst ? 0x00ffff : this.getBulletTint();
		const bullet = this.add.circle(centerX, centerY, 18, bulletColor);
		this.bullets.add(bullet);
		bullet.setData('vx', vx);
		bullet.setData('vy', vy);
		bullet.setData('bounces', bounces);
		bullet.setData('isDuplicate', isBurst);
		bullet.setData('isBurst', isBurst);

		if (!isBurst) {
			this.applyBulletFX(bullet, this.getDamageTier());
		}

		// Also apply duplicate level to bursts?
		// "duplicate satın alındığında her updatinde + 1 topla birlikte"
		// The extra balls from duplicate apply to *every* shot usually.
		// If burst is a shot, maybe it should trigger duplication?
		// "8 tane ... top göndersin". 
		// If duplicate Level is 5, does a burst of 8 become 8 * (1+5) = 48 balls?!
		// That might crash the game.
		// Let's assume Burst is simply 8 standard balls for now.
		// Or maybe duplicate adds to main shot only.
		// I'll stick to 8 simple balls for now to avoid chaos.
	}

	spawnBall() {
		let increment = 50;
		if (this.level >= 15) increment = 2000;
		else if (this.level >= 10) increment = 1000;
		else if (this.level >= 5) increment = 300;

		this.ballCost += increment;
		this.updateShopUI();

		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();
		const speed = 25;

		this.vfxBallSpawn(centerX, centerY);

		// Helper to fire
		const fire = (angleOffset: number, isExtra: boolean) => {
			let finalAngle = this.spiralAngle + angleOffset;

			// SMART TARGETING: Occasionaly target the nearest enemy if it's far but incoming
			// Only for the main shot (isExtra === false) AND after 30 seconds
			if (!isExtra && this.enemies.getLength() > 0 && (this.time.now - this.purchaseStartTime > 5000)) {
				const rand = Phaser.Math.Between(0, 100);
				if (rand < 30) { // 30% chance to "lock on" to a random but close-ish enemy
					const nearest = this.getNearestEnemy(centerX, centerY);
					if (nearest) {
						finalAngle = Phaser.Math.Angle.Between(centerX, centerY, nearest.x, nearest.y);
					}
				}
			}

			const vx = Math.cos(finalAngle) * speed;
			const vy = Math.sin(finalAngle) * speed;

			const c = isExtra ? 0xff00ff : this.getBulletTint();
			const b = isExtra ? 15 : 9999; // Infinite for main

			const bullet = this.add.circle(centerX, centerY, 18, c);
			this.bullets.add(bullet);
			bullet.setData('vx', vx);
			bullet.setData('vy', vy);
			bullet.setData('bounces', b);
			bullet.setData('isDuplicate', isExtra);

			if (!isExtra) {
				this.applyBulletFX(bullet, this.getDamageTier());
			}
		};

		// Main Shot
		fire(0, false);

		this.playSound('ballShoot', 0.6, Phaser.Math.Between(-300, 300));
	}

	spawnOrbitBall() {
		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();

		// Each new orbit ball gets evenly spaced
		const count = this.orbitBalls.length + 1;
		const angleStep = (Math.PI * 2) / count;

		const ball = this.add.circle(centerX, centerY, 8, 0x00ffcc);
		ball.setData('orbitIndex', this.orbitBalls.length);
		this.orbitBalls.push(ball);

		// Re-distribute angles evenly for all orbit balls
		for (let i = 0; i < this.orbitBalls.length; i++) {
			this.orbitBalls[i].setData('orbitIndex', i);
		}

		// Expand radius slightly with more balls
		this.orbitRadius = 80 + (this.orbitBalls.length - 1) * 8;

		this.playSound('orbitHit', 0.5);
		this.vfxBallSpawn(centerX, centerY);
	}

	updateOrbitBalls() {
		if (this.orbitBalls.length === 0) return;

		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();
		const count = this.orbitBalls.length;
		const angleStep = (Math.PI * 2) / count;
		const now = this.time.now;

		// Rotate orbit - speed increases slightly with more balls
		this.orbitAngle += 0.025 + count * 0.003;

		// Draw trail ring with pulsing glow
		if (!this.orbitTrailGraphics) {
			this.orbitTrailGraphics = this.add.graphics();
			this.orbitTrailGraphics.setDepth(48);
		}
		this.orbitTrailGraphics.clear();
		const pulse = 0.1 + Math.sin(now * 0.003) * 0.05;
		this.orbitTrailGraphics.lineStyle(1.5, 0x00ffcc, pulse);
		this.orbitTrailGraphics.strokeCircle(centerX, centerY, this.orbitRadius);

		// Update each orbit ball position
		for (let i = 0; i < count; i++) {
			const ball = this.orbitBalls[i];
			if (!ball.active) continue;

			const angle = this.orbitAngle + i * angleStep;
			const prevX = ball.x;
			const prevY = ball.y;
			ball.x = centerX + Math.cos(angle) * this.orbitRadius;
			ball.y = centerY + Math.sin(angle) * this.orbitRadius;

			// Check collision with enemies (throttled per enemy)
			this.enemies.getChildren().forEach((child: any) => {
				const enemy = child as Phaser.GameObjects.Container;
				if (!enemy.active) return;

				const dist = Phaser.Math.Distance.Between(ball.x, ball.y, enemy.x, enemy.y);
				if (dist < 50) {
					// Throttle: only damage same enemy once every 300ms per orbit ball
					const hitKey = 'orbitHit_' + i;
					const lastHit = enemy.getData(hitKey) || 0;
					if (now - lastHit < 300) return;
					enemy.setData(hitKey, now);

					let hp = enemy.getData('hp');
					const dmg = this.bulletDamage * 0.75;
					hp -= dmg;
					enemy.setData('hp', hp);

					this.showDamageText(enemy.x, enemy.y, dmg);
					this.playSound('orbitPing', 0.2, Phaser.Math.Between(-200, 200));

					if (hp <= 0) {
						const reward = enemy.getData('moneyValue') || 10;

						if (enemy.getData('originalColor') === 0xff0000) {
							this.triggerExplosion(enemy.x, enemy.y);
							this.playSound('redBlockExplosion');
						}

						// On-kill procs from orbit kills
						if (this.laserChance > 0 && Phaser.Math.Between(0, 100) < this.laserChance) {
							const lvx = Math.cos(angle);
							const lvy = Math.sin(angle);
							this.fireLaser(enemy.x, enemy.y, lvx, lvy);
						}
						if (this.electricChance > 0 && Phaser.Math.Between(0, 100) < this.electricChance) {
							this.triggerElectricEffect(enemy.x, enemy.y);
						}
						if (this.bombChance > 0 && Phaser.Math.Between(0, 100) < this.bombChance) {
							this.triggerBombExplosion(enemy.x, enemy.y);
						}

						enemy.destroy();
						this.addMoney(reward);
						this.addScore(100);
						this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
						this.trackProgress();
					} else {
						// Flash enemy with orbit color
						const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
						if (top) {
							const orig = top.fillColor;
							top.setFillStyle(0x00ffcc);
							this.time.delayedCall(80, () => {
								if (enemy.active && top.active) top.setFillStyle(orig);
							});
						}
					}
				}
			});
		}
	}

	update() {
		// SPAWN LOGIC IN UPDATE (Distance Based)
		if (this.isLevelActive) {
			// Find the "last spawned wave" (furthest from center, or rather, the one with highest ID? 
			// No, simply track the 'distance travelled' of a virtual cursor or check the last added group?
			// Easier: Check if the *Last Added Enemy* has moved 'spawnDistance' pixels towards center.
			// Problem: Enemies move towards center. Distance decreases.

			// Better: Just check if we can spawn.
			// When we spawn a wave, we can store a reference or just a timestamp? Timestamp is time based.
			// We want DISTANCE based.

			// Let's rely on the fact that enemies move at 'speed'.
			// But effective speed changes.

			// Alternative: Keep track of "how much space has cleared".
			// Every frame: spaceCleared += speed.
			// If spaceCleared >= spawnDistance: Spawn() and spaceCleared = 0.

			// This is perfect. It adapts to speed changes instantly.
			const speed = this.getGlobalEnemySpeed();
			this.lastSpawnedDistance += speed;

			if (this.lastSpawnedDistance >= this.spawnDistance) {
				this.spawnCircleWave();
				this.lastSpawnedDistance = 0; // Or subtract spawnDistance to keep remainder
			}
		}

		// Continuous Rotation (Auto)
		this.spiralAngle += 0.08;

		// Rotate Idle Hexagon
		if (this.idleHexagon) {
			this.idleHexagon.rotation += 0.005;
		}

		// ORBIT BALL UPDATE
		this.updateOrbitBalls();

		// Game Over Check: If we are not running updates or scene paused?
		// Actually we just stop physics or ignore updates if game over.
		// Let's add a flag? Or just destroy looking at logic below.

		// CATCH-UP MECHANIC: If nearest enemy is far, increase speed
		if (this.enemies.getLength() > 0) {
			const cx = this.getWorldCenterX();
			const cy = this.getWorldCenterY();
			const nearest = this.getNearestEnemy(cx, cy);
			if (nearest) {
				const dist = Phaser.Math.Distance.Between(cx, cy, nearest.x, nearest.y);
				// If distance > 250, speed up (1.5x)
				if (dist > 250) {
					this.currentCatchUpMultiplier = 1.3;
				} else {
					this.currentCatchUpMultiplier = 1.0;
				}
			}
		} else {
			// No enemies? Speed up to spawn faster? No, spawn logic is separate.
			// Just reset speed.
			this.currentCatchUpMultiplier = 1.0;
		}

		// 1. Düşmanları güncelle
		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;

			if (!enemy.active) return;

			// İleri doğru			// Hareket ettir: Update position based on GLOBAL speed
			const angle = enemy.rotation;
			// Speed is now uniform for all.
			const speed = this.getGlobalEnemySpeed();

			// Move towards center (rotation points to center)
			enemy.x += Math.cos(angle) * speed;
			enemy.y += Math.sin(angle) * speed;

			// Merkeze çok yaklaşınca OYUN BITIR
			if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.centerTarget.x, this.centerTarget.y) < 15) {
				// GAME OVER LOGIC
				enemy.destroy();
				this.triggerGameOver();
			}
		});

		// 2. Mermileri güncelle ve Çarpışma Kontrolü
		const bulletsArray = this.bullets.getChildren();
		const enemiesArray = this.enemies.getChildren();

		for (let i = bulletsArray.length - 1; i >= 0; i--) {
			const bullet = bulletsArray[i] as Phaser.GameObjects.Arc;

			if (!bullet.active) {
				this.destroyBulletGlow(bullet);
				continue;
			}

			// Her frame güncel hızı al (çünkü sekerken değişebilir)
			const vx = bullet.getData('vx');
			const vy = bullet.getData('vy');

			// 2.A HOMING LOGIC (Very gentle pull towards nearest enemy)
			// Only for the main ball (isDuplicate === false) AND after 5 seconds
			if (!bullet.getData('isDuplicate') && this.enemies.getLength() > 0 && (this.time.now - this.purchaseStartTime > 5000)) {
				const nearest = this.getNearestEnemy(bullet.x, bullet.y);
				if (nearest) {
					const distToEnemy = Phaser.Math.Distance.Between(bullet.x, bullet.y, nearest.x, nearest.y);

					// Only apply gentle homing when reasonably close to an enemy
					if (distToEnemy < 300) {
						const targetAngle = Phaser.Math.Angle.Between(bullet.x, bullet.y, nearest.x, nearest.y);
						const currentAngle = Math.atan2(vy, vx);
						const lerpFactor = 0.008;
						const newAngle = Phaser.Math.Angle.RotateTo(currentAngle, targetAngle, lerpFactor);
						const speedValue = Math.sqrt(vx * vx + vy * vy);
						bullet.setData('vx', Math.cos(newAngle) * speedValue);
						bullet.setData('vy', Math.sin(newAngle) * speedValue);
					}
				}
			}

			// Gentle center tendency - very slight pull towards center so balls don't drift forever
			{
				const cx = this.getWorldCenterX();
				const cy = this.getWorldCenterY();
				const dx = cx - bullet.x;
				const dy = cy - bullet.y;
				const distToCenter = Math.sqrt(dx * dx + dy * dy);
				// Only apply when far from center (beyond 500px); strength grows with distance
				if (distToCenter > 500) {
					const pull = 0.0015 * ((distToCenter - 500) / 500);
					const cvx = bullet.getData('vx') + dx * pull;
					const cvy = bullet.getData('vy') + dy * pull;
					// Maintain speed so it's a direction nudge, not acceleration
					const spd = Math.sqrt(bullet.getData('vx') ** 2 + bullet.getData('vy') ** 2);
					const newSpd = Math.sqrt(cvx * cvx + cvy * cvy);
					bullet.setData('vx', (cvx / newSpd) * spd);
					bullet.setData('vy', (cvy / newSpd) * spd);
				}
			}

			// Hareket ettir
			const updatedVx = bullet.getData('vx');
			const updatedVy = bullet.getData('vy');
			bullet.x += updatedVx;
			bullet.y += updatedVy;

			// Sync glow sprite position
			const glowSprite = this.bulletGlowSprites.get(bullet);
			if (glowSprite) {
				glowSprite.x = bullet.x;
				glowSprite.y = bullet.y;
			}

			// Emit trail particle (every 2nd frame to halve particle count)
			const frameNum = this.game.getFrame();
			if (frameNum % 2 === 0) {
				this.trailEmitter.emitParticleAt(bullet.x, bullet.y);
			}

			// Fire trail for high-tier damage balls (every 3rd frame)
			if (!bullet.getData('isBurst') && !bullet.getData('isDuplicate')) {
				const tier = this.getDamageTier();
				if (tier >= 3 && frameNum % 3 === 0) {
					this.fireTrailEmitter.emitParticleAt(
						bullet.x + Phaser.Math.FloatBetween(-8, 8),
						bullet.y + Phaser.Math.FloatBetween(-8, 8)
					);
				} else if (tier >= 2 && frameNum % 3 === 0) {
					this.fireTrailEmitter.emitParticleAt(bullet.x, bullet.y);
				}
			}

			// Wrap around world edges so balls never disappear
			const wrapMargin = 50;
			let wrapped = false;
			if (bullet.x < -wrapMargin) { bullet.x = this.worldWidth + wrapMargin; wrapped = true; }
			else if (bullet.x > this.worldWidth + wrapMargin) { bullet.x = -wrapMargin; wrapped = true; }
			if (bullet.y < -wrapMargin) { bullet.y = this.worldHeight + wrapMargin; wrapped = true; }
			else if (bullet.y > this.worldHeight + wrapMargin) { bullet.y = -wrapMargin; wrapped = true; }

			// Nudge direction slightly on wrap so ball doesn't loop through the same gaps
			if (wrapped) {
				let bvx = bullet.getData('vx');
				let bvy = bullet.getData('vy');
				const bAngle = Math.atan2(bvy, bvx) + Phaser.Math.FloatBetween(-0.3, 0.3);
				const bSpeed = Math.sqrt(bvx * bvx + bvy * bvy);
				bullet.setData('vx', Math.cos(bAngle) * bSpeed);
				bullet.setData('vy', Math.sin(bAngle) * bSpeed);
			}

			// Çarpışma Kontrolü (Basit Mesafe Kontrolü)
			// Kare ve Daire çarpışması için yaklaşık bir mesafe kullanıyoruz (kare yarıçapı ~25 + mermi yarıçapı 10 = ~35)
			for (let j = enemiesArray.length - 1; j >= 0; j--) {
				const enemy = enemiesArray[j] as Phaser.GameObjects.Container;

				if (!enemy.active) continue;

				// Collision radius increased to 50 (from 35) to make it easier to hit enemies (50x50 box + 10 radius + margin)
				if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 90) {
					// --- ÇARPIŞMA OLDU ---

					// 1. DÜŞMAN HASARI
					let hp = enemy.getData('hp');
					const damageDealt = bullet.getData('isBurst') ? this.bulletDamage * 2 : this.bulletDamage;
					hp -= damageDealt;
					enemy.setData('hp', hp);

					// Floating Damage Text
					this.showDamageText(enemy.x, enemy.y, damageDealt);

					if (hp <= 0) {
						// Retrieve money value before destroying
						const reward = enemy.getData('moneyValue') || 10;

						if (enemy.getData('originalColor') === 0xff0000) {
							console.log("Exploding Red Block at", enemy.x, enemy.y);
							this.triggerExplosion(enemy.x, enemy.y);
							this.playSound('redBlockExplosion');
						}

						// LASER CHANCE
						if (this.laserChance > 0 && Phaser.Math.Between(0, 100) < this.laserChance) {
							// Fire Laser in direction of bullet movement
							const lvx = bullet.getData('vx');
							const lvy = bullet.getData('vy');
							this.fireLaser(enemy.x, enemy.y, lvx, lvy);
						}

						// ELECTRIC CHANCE
						if (this.electricChance > 0 && Phaser.Math.Between(0, 100) < this.electricChance) {
							this.triggerElectricEffect(enemy.x, enemy.y);
						}

						// BOMB CHANCE
						if (this.bombChance > 0 && Phaser.Math.Between(0, 100) < this.bombChance) {
							this.triggerBombExplosion(enemy.x, enemy.y);
						}

						enemy.destroy();
						this.addMoney(reward);
						this.addScore(100); // 100 points per kill
						this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
						this.trackProgress();
						this.triggerHaptic('medium');

						this.vfxKill(enemy.x, enemy.y);
						this.impactEmitter.explode(10, bullet.x, bullet.y);
					} else {
						// Canı kaldıysa renk değiştir (Hasar aldığını belli et - Kırmızılaş)
						const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
						this.triggerHaptic('light');
						this.playSound('blockPop');

						// Tiered Impact Effect Sprite (removed for cleaner visuals)




						// Darkening Logic immediately after hit (if not dead)
						if (top) {
							const maxHP = enemy.getData('maxHP') || 1;
							const currentHP = hp; // Already updated above

							// Base Color for calculation
							let baseColorVal;
							if (enemy.getData('isDynamicColor')) {
								baseColorVal = this.currentDynamicColor;
								// If background is black, use white for damaged block calculation
								if (baseColorVal === 0x000000) baseColorVal = 0xffffff;
							} else {
								baseColorVal = enemy.getData('originalColor') || 0xffffff;
							}
							const colorObj = Phaser.Display.Color.ValueToColor(baseColorVal);

							// Brightness ratio: 0.5 (darkest) to 1.0 (full)
							// Map ratio 0..1 to 0.5..1.0 so blocks stay visible on black bg
							const ratio = currentHP / maxHP;
							const brightness = 0.5 + (0.5 * ratio);

							// Apply brightness
							const r = Math.floor(colorObj.red * brightness);
							const g = Math.floor(colorObj.green * brightness);
							const b = Math.floor(colorObj.blue * brightness);

							const newColor = Phaser.Display.Color.GetColor(r, g, b);
							top.setFillStyle(newColor);
							top.setStrokeStyle(2, 0x000000); // Re-apply border as fillStyle might clear it? Actually it doesn't but good to be safe/consistent if we used clear()

							// Flash Effect (Red tint over the darkened color)
							// Since we changed fillStyle, we can just tween a property or use a separate overlay. 
							// Simplest: Set to Red, then back to NEW darkened color after 50ms.

							top.setFillStyle(0xff0000);
							this.time.delayedCall(50, () => {
								if (enemy.active && top.active) {
									top.setFillStyle(newColor);
								}
							});
						}

					}

					// 2. MERMİ SEKME MANTIĞI
					// Infinite Bounce checks
					if (true) {
						// Calculate Bounce (User Style: Radial)
						let vx = bullet.getData('vx');
						let vy = bullet.getData('vy');
						const dx = bullet.x - enemy.x;
						const dy = bullet.y - enemy.y;

						let speed = Math.sqrt(vx * vx + vy * vy);

						// Apply Boost to Scalar Speed First
						const originalColor = enemy.getData('originalColor');
						if (originalColor === 0x4444ff) {
							// Blue Block: Boost 1.15x
							speed *= 1.15;
							bullet.setFillStyle(0x4444ff);
							this.triggerHaptic('success');
						} else {
							// Normal: Boost 1.05x
							speed *= 1.05;
							// Simple Green Tint on bounce
							bullet.setFillStyle(0x00ff00);
						}

						// Clamp Speed (Max 2.2x of Base Speed 25 = 55)
						if (speed > 55) speed = 55;

						let bounceAngle = Math.atan2(dy, dx);

						// Normal radial bounce with offset
						bounceAngle += Phaser.Math.FloatBetween(-0.5, 0.5);

						vx = Math.cos(bounceAngle) * speed;
						vy = Math.sin(bounceAngle) * speed;

						// Save Final Velocity to Data
						bullet.setData('vx', vx);
						bullet.setData('vy', vy);

						// DUPLICATE BALL LOGIC: Bounces check
						if (bullet.getData('isDuplicate')) {
							let b = bullet.getData('bounces');
							b--;
							bullet.setData('bounces', b);
							if (b <= 0) {
								console.log("Duplicate Ball Explode!");
								this.triggerExplosion(bullet.x, bullet.y);
								this.destroyBulletGlow(bullet);
								bullet.destroy();
								break; // Stop checking this bullet
							}
						}

						// Break enemy loop (one hit per frame per bullet)
						break;
					}
				}
			}
		}

	}

	private score: number = 0;

	private lastShopRefresh: number = 0;

	addMoney(amount: number) {
		this.money += amount;
		this.events.emit('update-money', Math.floor(this.money));

		// Throttle shop UI refresh to avoid performance issues on rapid kills
		const now = this.time.now;
		if (now - this.lastShopRefresh > 500) {
			this.lastShopRefresh = now;
			this.updateShopUI();
		}
	}

	addScore(amount: number) {
		this.score += amount;
		this.events.emit('update-score', this.score);
	}

	showFloatingText(x: number, y: number, message: string) {
		const text = this.add.text(x, y, message, {
			fontFamily: '"Press Start 2P"',
			fontSize: '16px',
			color: '#ffffff',
			stroke: '#000000',
			strokeThickness: 3,
		});
		text.setOrigin(0.5);
		text.setDepth(100);

		this.tweens.add({
			targets: text,
			y: y - 50,
			alpha: 0,
			duration: 800,
			onComplete: () => {
				text.destroy();
			}
		});
	}

	trackProgress() {
		this.enemiesDefeated++;

		// Kill-Based Leveling Logic
		// 12 waves * 50 enemies = 600 enemies per level
		const enemiesPerLevel = 600;

		if (this.enemiesDefeated % enemiesPerLevel === 0) {
			console.log("Kill Target Reached! Advancing Level...");
			this.levelUp();
		}
	}

	levelUp() {
		this.level++;
		this.events.emit('update-level', this.level);
		this.triggerHaptic('success');

		// Increase difficulty
		this.enemyHP += 1.5;

		// Speed acceleration stretched AND halved
		// And caps at Level 40
		if (this.level <= 40) {
			this.enemySpeed += 0.006;
			this.globalWorldSpeed += 0.015;
		}

		// Reset Level State
		this.wavesSpawned = 0;
		this.isLevelActive = true;
		this.lastSpawnedDistance = 0;
		this.spawnCircleWave(); // Start immediatelydback (optional)

		// Visual feedback (optional)
		console.log("Level Up! Level: " + this.level);
	}

	showDamageText(x: number, y: number, damage: number) {
		const val = Math.round(damage * 78);
		const text = this.add.text(x, y, val.toString(), {
			fontFamily: '"Press Start 2P"',
			fontSize: '20px',
			color: '#ff0000', // Red
			stroke: '#000000', // Black Border
			strokeThickness: 4,
		});
		text.setOrigin(0.5);
		text.setDepth(110);

		this.tweens.add({
			targets: text,
			y: y - 80,
			x: x + Phaser.Math.Between(-30, 30),
			alpha: 0,
			duration: 600,
			ease: 'Power2',
			onComplete: () => {
				text.destroy();
			}
		});
	}

	triggerGameOver() {
		if (this.gameOverTriggered) return;
		this.gameOverTriggered = true;

		console.log("GAME OVER");
		this.triggerHaptic('error');

		// Disable input BEFORE pause so it's guaranteed
		this.input.enabled = false;

		// Pause Game Loop
		this.scene.pause();

		// Submit Score
		if (typeof (window as any).submitScore === "function") {
			(window as any).submitScore(this.score);
		}

		// Show Game Over UI
		this.events.emit('game-over', this.score);
	}

	triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
		// Check Settings
		const settings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true,"haptics":true}');
		if (!settings.haptics) return;

		if (typeof (window as any).triggerHaptic === "function") {
			(window as any).triggerHaptic(type);
		}
	}

	triggerExplosion(x: number, y: number) {
		this.explosionEmitter.explode(30, x, y);
		this.vfxRedExplosion(x, y);

		// Haptics
		this.triggerHaptic('heavy');

		// Camera Shake (disabled)

		// AoE Damage
		const explosionRadius = 150;
		const enemies = this.enemies.getChildren();

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			// Check distance
			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

			if (dist <= explosionRadius) {
				// Kill nearby enemies instantly or deal massive damage
				// Let's create a chain reaction effect effectively

				// Show hit effect
				this.impactEmitter.explode(10, enemy.x, enemy.y);

				// Destroy logic reuse? 
				// For now, simpler destroy. 
				// Warning: destroying here might affect the outer loop if not careful?
				// Phaser groups handle removal gracefully usually, but let's be safe.
				// We won't trigger NEW explosions from these chained deaths to avoid infinite loops/crashes in 1 frame.
				// Or maybe we do want chain reactions? That would be fun but risky.
				// Let's just destroy them for now without triggering 'originalColor' check again.

				enemy.destroy();
				this.addScore(50);
				this.addMoney(5); // Less money for chain kills?
			}
		});
	}

	initAudio() {
		// Load Settings
		const savedSettings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true}');
		this.audioSettings = savedSettings;

		// Initialize BG Music
		if (!this.sound.get('bgMusic')) {
			this.bgMusic = this.sound.add('bgMusic', { loop: true, volume: 0.5 });
		} else {
			this.bgMusic = this.sound.get('bgMusic');
		}

		if (this.audioSettings.music) {
			if (!this.bgMusic.isPlaying) {
				this.bgMusic.play();
			}
		}

		// Listen for settings updates
		this.events.on('update-settings', (settings: { music: boolean, fx: boolean }) => {
			this.audioSettings = settings;

			if (this.audioSettings.music) {
				if (!this.bgMusic.isPlaying) {
					this.bgMusic.play();
				}
			} else {
				if (this.bgMusic.isPlaying) {
					this.bgMusic.stop();
				}
			}
		});
	}

	playSound(key: string, volume: number = 1.0, detune: number = 0) {
		if (!this.audioSettings.fx) return;

		// Throttle blockPop sound to avoid ear-blasting levels of overlapping sound
		if (key === 'blockPop') {
			const now = this.time.now;
			if (now - this.lastBlockPopPlayTime < 100) {
				return;
			}
			this.lastBlockPopPlayTime = now;
		}

		try {
			this.sound.play(key, { volume: volume, detune: detune });
		} catch (e) {
			console.warn(`Failed to play sound: ${key}`, e);
		}
	}

	updateBackgroundColor() {
		// Generate a very dark random color
		// Max value 30 out of 255 for each channel ensures it stays very dark
		const r = Phaser.Math.Between(5, 30);
		const g = Phaser.Math.Between(5, 30);
		const b = Phaser.Math.Between(5, 30);

		const color = Phaser.Display.Color.GetColor(r, g, b);

		// Set the background color
		this.cameras.main.setBackgroundColor(color);
	}

	startColorTransition() {
		// Darker/Premium tones, avoiding neon primary Red, Blue, Green. Black removed from loop.
		const colors = [
			0x706000, // Dark Gold
			0x006070, // Dark Teal
			0x600070, // Deep Purple
			0x703000, // Dark Bronze
			0x400030, // Deep Plum
			0x205070  // Deep Slate Blue
		];
		let nextColor = Phaser.Utils.Array.GetRandom(colors);

		if (this.currentDynamicColor && colors.includes(this.currentDynamicColor)) {
			nextColor = colors[(colors.indexOf(this.currentDynamicColor) + 1) % colors.length];
		}
		const oldColorObj = Phaser.Display.Color.ValueToColor(this.currentDynamicColor);
		const newColorObj = Phaser.Display.Color.ValueToColor(nextColor);
		this.tweens.addCounter({
			from: 0,
			to: 100,
			duration: 3000,
			onUpdate: (tween) => {
				const value = tween.getValue();
				const interColor = Phaser.Display.Color.Interpolate.ColorWithColor(oldColorObj, newColorObj, 100, value);
				this.currentDynamicColor = Phaser.Display.Color.GetColor(interColor.r, interColor.g, interColor.b);
				this.applyDynamicColor(this.currentDynamicColor);
			}
		});
	}

	applyDynamicColor(color: number) {
		this.cameras.main.setBackgroundColor(color);
		this.enemies.getChildren().forEach(child => {
			const enemy = child as Phaser.GameObjects.Container;
			if (enemy.getData('isDynamicColor')) {
				const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
				const side = enemy.getByName('side') as Phaser.GameObjects.Rectangle;
				if (top) {
					const maxHP = enemy.getData('maxHP') || 1;
					const currentHP = enemy.getData('hp');
					const ratio = currentHP / maxHP;
					const brightness = 0.5 + (0.5 * ratio);

					// If background is black, use white for blocks
					let baseColor = color;
					if (baseColor === 0x000000) baseColor = 0xffffff;

					const colorObj = Phaser.Display.Color.ValueToColor(baseColor);
					const r = Math.floor(colorObj.red * brightness);
					const g = Math.floor(colorObj.green * brightness);
					const b = Math.floor(colorObj.blue * brightness);
					const darkened = Phaser.Display.Color.GetColor(r, g, b);

					top.setFillStyle(darkened);
				}

				if (side) {
					let sideBase = color;
					if (sideBase === 0x000000) sideBase = 0xffffff;
					const darkBaseColor = Phaser.Display.Color.ValueToColor(sideBase).darken(30).color;
					side.setFillStyle(darkBaseColor);
				}
			}
		});
	}

	fireLaser(x: number, y: number, vx: number, vy: number) {
		// Calculate direction angle
		const angle = Math.atan2(vy, vx);
		const tier = this.getLaserTier();

		// Tier-based beam colors
		const beamColors = [
			{ outer: 0x4488ff, core: 0x88bbff }, // Tier 0: Blue
			{ outer: 0xff8800, core: 0xffcc66 }, // Tier 1: Orange
			{ outer: 0xff2222, core: 0xff8888 }, // Tier 2: Red
		];
		const colors = beamColors[tier] || beamColors[0];

		// Tier-based beam thickness
		const thicknessMult = 1 + tier * 0.3;

		// Beam Length (very long to cover screen)
		const length = 2000;
		const endX = x + Math.cos(angle) * length;
		const endY = y + Math.sin(angle) * length;

		this.vfxLaserActivation(x, y, tier);

		// Visuals: Laser Beam
		const graphics = this.add.graphics();
		graphics.lineStyle(Math.round(50 * thicknessMult), colors.outer, 1);
		graphics.lineBetween(x, y, endX, endY);
		graphics.setBlendMode(Phaser.BlendModes.ADD);
		graphics.setDepth(50);

		// Inner Core
		const core = this.add.graphics();
		core.lineStyle(Math.round(20 * thicknessMult), colors.core, 1);
		core.lineBetween(x, y, endX, endY);
		core.setBlendMode(Phaser.BlendModes.ADD);
		core.setDepth(51);

		// Fade Out
		this.tweens.add({
			targets: [graphics, core],
			alpha: 0,
			duration: 300,
			onComplete: () => {
				graphics.destroy();
				core.destroy();
			}
		});

		// Audio
		this.playSound('laser');

		// Collision Logic
		const laserLine = new Phaser.Geom.Line(x, y, endX, endY);
		const enemies = this.enemies.getChildren();
		const enemieshit: Phaser.GameObjects.Container[] = [];

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const enemyCircle = new Phaser.Geom.Circle(enemy.x, enemy.y, 30);
			if (Phaser.Geom.Intersects.LineToCircle(laserLine, enemyCircle)) {
				enemieshit.push(enemy);
			}
		});

		enemieshit.forEach(enemy => {
			if (!enemy.active) return;

			const reward = enemy.getData('moneyValue') || 10;

			if (enemy.getData('originalColor') === 0xff0000) {
				this.triggerExplosion(enemy.x, enemy.y);
				this.playSound('redBlockExplosion');
			}

			this.vfxLaserImpact(enemy.x, enemy.y, tier);
			this.impactEmitter.explode(8, enemy.x, enemy.y);

			enemy.destroy();
			this.addMoney(reward);
			this.addScore(100);
			this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
			this.trackProgress();
		});
	}

	getNearestEnemy(x: number, y: number): Phaser.GameObjects.Container | null {
		let nearest: Phaser.GameObjects.Container | null = null;
		let minDist = Infinity;

		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
			if (d < minDist) {
				minDist = d;
				nearest = enemy;
			}
		});

		return nearest;
	}

	getEnemyNearCenter(): Phaser.GameObjects.Container | null {
		const cx = this.getWorldCenterX();
		const cy = this.getWorldCenterY();

		let nearest: Phaser.GameObjects.Container | null = null;
		let minDist = Infinity;

		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const d = Phaser.Math.Distance.Between(cx, cy, enemy.x, enemy.y);
			if (d < minDist) {
				minDist = d;
				nearest = enemy;
			}
		});

		return nearest;
	}

	triggerElectricEffect(sourceX: number, sourceY: number) {
		const tier = this.getElectricTier();
		const nearbyEnemies: any[] = [];
		const maxTargets = 3 + Math.floor(this.electricLevel / 2);
		const radius = 200;

		const centerX = this.getWorldCenterX();
		const centerY = this.getWorldCenterY();
		const sourceDist = Phaser.Math.Distance.Between(centerX, centerY, sourceX, sourceY);

		this.enemies.getChildren().forEach((child: any) => {
			const target = child as Phaser.GameObjects.Container;
			if (!target.active) return;

			const dist = Phaser.Math.Distance.Between(sourceX, sourceY, target.x, target.y);
			if (dist > 0 && dist < radius) {
				const targetDist = Phaser.Math.Distance.Between(centerX, centerY, target.x, target.y);
				const isBehind = targetDist > sourceDist;
				nearbyEnemies.push({ target, dist, isBehind });
			}
		});

		nearbyEnemies.sort((a, b) => {
			if (a.isBehind && !b.isBehind) return -1;
			if (!a.isBehind && b.isBehind) return 1;
			return a.dist - b.dist;
		});
		const targets = nearbyEnemies.slice(0, maxTargets);

		const damage = this.bulletDamage / 2;

		this.vfxElectricStrike(sourceX, sourceY, tier);
		this.vfxElectricChain(sourceX, sourceY, tier);

		targets.forEach(t => {
			const enemy = t.target;

			this.drawLightning(sourceX, sourceY, enemy.x, enemy.y, tier);
			this.vfxElectricEndpoint(enemy.x, enemy.y, tier);

			// Deal Damage
			let hp = enemy.getData('hp');
			hp -= damage;
			enemy.setData('hp', hp);

			this.showDamageText(enemy.x, enemy.y, damage);

			if (hp <= 0) {
				const reward = enemy.getData('moneyValue') || 10;
				if (enemy.getData('originalColor') === 0xff0000) {
					this.triggerExplosion(enemy.x, enemy.y);
					this.playSound('redBlockExplosion');
				}
				enemy.destroy();
				this.addMoney(reward);
				this.addScore(100);
				this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
				this.trackProgress();
			} else {
				// Flash effect - tier-based color
				const flashColors = [0x00ffff, 0xaa44ff, 0xffff00];
				const flashColor = flashColors[tier] || 0x00ffff;

				const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
				if (top) {
					const originalFill = top.fillColor;
					top.setFillStyle(flashColor);
					this.time.delayedCall(100, () => {
						if (enemy.active && top.active) {
							top.setFillStyle(originalFill);
						}
					});
				}
			}
		});

		if (targets.length > 0) {
			this.playSound('electric');
		}
	}

	drawLightning(x1: number, y1: number, x2: number, y2: number, tier: number = 0) {
		// Tier-based lightning colors
		const lightningColors = [
			{ glow: 0x00ffff, flash: 0x00ffff }, // Tier 0: Cyan/Blue
			{ glow: 0xaa44ff, flash: 0xcc66ff }, // Tier 1: Purple/Violet
			{ glow: 0xffff00, flash: 0xffff88 }, // Tier 2: Yellow
		];
		const colorSet = lightningColors[tier] || lightningColors[0];

		// Draw multiple lightning bolts for more impact
		for (let bolt = 0; bolt < 3; bolt++) {
			const graphics = this.add.graphics();
			const delay = bolt * 50;

			// Outer glow (thicker, more transparent)
			if (bolt === 0) {
				graphics.lineStyle(12, colorSet.glow, 0.3);
				const segments = 5;
				const stepX = (x2 - x1) / segments;
				const stepY = (y2 - y1) / segments;

				graphics.beginPath();
				graphics.moveTo(x1, y1);

				for (let i = 1; i < segments; i++) {
					const jump = 20;
					const offX = Phaser.Math.Between(-jump, jump);
					const offY = Phaser.Math.Between(-jump, jump);
					graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
				}

				graphics.lineTo(x2, y2);
				graphics.strokePath();
			}

			// Main bright bolt
			graphics.lineStyle(6, 0xffffff, 1);
			const segments = 6;
			const stepX = (x2 - x1) / segments;
			const stepY = (y2 - y1) / segments;

			graphics.beginPath();
			graphics.moveTo(x1, y1);

			for (let i = 1; i < segments; i++) {
				const jump = 25;
				const offX = Phaser.Math.Between(-jump, jump);
				const offY = Phaser.Math.Between(-jump, jump);
				graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
			}

			graphics.lineTo(x2, y2);
			graphics.strokePath();

			// Secondary colored glow
			graphics.lineStyle(3, colorSet.glow, 0.8);
			graphics.beginPath();
			graphics.moveTo(x1, y1);

			for (let i = 1; i < segments; i++) {
				const jump = 20;
				const offX = Phaser.Math.Between(-jump, jump);
				const offY = Phaser.Math.Between(-jump, jump);
				graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
			}

			graphics.lineTo(x2, y2);
			graphics.strokePath();

			// Animate with flash effect
			this.time.delayedCall(delay, () => {
				this.tweens.add({
					targets: graphics,
					alpha: 0,
					duration: 300,
					ease: 'Power2',
					onComplete: () => graphics.destroy()
				});
			});
		}

		// Add impact particles
		this.impactEmitter.explode(8, x1, y1);
		this.impactEmitter.explode(6, x2, y2);

		// Flash circles at both ends with tier color
		const flashStart = this.add.circle(x1, y1, 20, colorSet.flash, 0.6);
		const flashEnd = this.add.circle(x2, y2, 15, colorSet.flash, 0.6);

		this.tweens.add({
			targets: [flashStart, flashEnd],
			alpha: 0,
			scale: 2,
			duration: 300,
			onComplete: () => {
				flashStart.destroy();
				flashEnd.destroy();
			}
		});
	}

	triggerBombExplosion(x: number, y: number) {
		const tier = this.getBombTier();

		this.vfxBombPreflash(x, y);
		this.vfxBombExplosion(x, y, tier);
		this.time.delayedCall(150, () => {
			this.vfxBombSmoke(x, y, tier);
		});

		this.explosionEmitter.explode(40, x, y);

		// Play explosion sound
		this.playSound('bombBlast', 0.7);

		// Haptics
		this.triggerHaptic('heavy');

		// AoE Damage - radius increases with tier
		const explosionRadius = 150 + tier * 25;
		const enemies = this.enemies.getChildren();

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

			if (dist <= explosionRadius) {
				this.impactEmitter.explode(10, enemy.x, enemy.y);
				enemy.destroy();
				this.addScore(50);
				this.addMoney(5);
			}
		});
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
