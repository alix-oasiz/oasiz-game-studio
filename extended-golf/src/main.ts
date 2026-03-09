import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import Menu from "./scenes/Menu";
import BallSelect from "./scenes/BallSelect";
import MapSelect from "./scenes/MapSelect";

class Boot extends Phaser.Scene {

	constructor() {
		super("Boot");
	}

	preload() {

		this.load.pack("pack", "assets/preload-asset-pack.json");
	}

	create() {

		this.scene.start("Preload");
	}
}

window.addEventListener('load', async function () {
	// Ensure fonts are loaded before starting the game to prevent blank text
	if ((document as any).fonts) {
		await (document as any).fonts.ready;
	}

	const game = new Phaser.Game({
		type: Phaser.AUTO,
		backgroundColor: "#2f2f2f",
		parent: "game-container",
		scale: {
			mode: Phaser.Scale.NONE,
			autoCenter: Phaser.Scale.NO_CENTER
		},
		scene: [Boot, Preload, Level, Menu, BallSelect, MapSelect],
		// Box2D is standalone (not a Phaser plugin) - no Phaser physics needed
		physics: false as any
	});

	let rotatedInputMode = false;
	let rotatedInputMetrics = {
		centerX: 0,
		centerY: 0,
		scaleX: 1,
		scaleY: 1
	};
	let rotatedInputCamera: Phaser.Cameras.Scene2D.Camera | null = null;

	const syncRotatedInputCamera = () => {
		const levelScene = game.scene.getScene("Level");
		if (levelScene?.sys?.settings?.active && levelScene.cameras?.main) {
			rotatedInputCamera = levelScene.cameras.main;
			return;
		}

		const activeScene = game.scene.getScenes(true)[0];
		rotatedInputCamera = activeScene?.cameras?.main ?? null;
	};

	// Handle window resize and orientation for better mobile experience
	const updateScale = () => {
		const isPortrait = window.innerHeight > window.innerWidth;
		const container = document.getElementById('game-container');
		const isMobile = window.matchMedia('(pointer: coarse)').matches;
		const forceLandscape = isMobile && isPortrait;
		rotatedInputMode = forceLandscape;

		if (container) {
			// Container pixel dimensions (what the container should display as)
			const viewW = forceLandscape ? window.innerHeight : window.innerWidth;
			const viewH = forceLandscape ? window.innerWidth : window.innerHeight;

			// Game resolution: use a fixed base height (720) and match aspect ratio.
			// This keeps game elements (ball, terrain, UI) the same size regardless of device,
			// while eliminating letterboxing by matching the phone's exact aspect ratio.
			const BASE_H = 720;
			const aspect = viewW / viewH;
			const gameW = Math.round(BASE_H * aspect);
			const gameH = BASE_H;
			rotatedInputMetrics = {
				centerX: window.innerWidth / 2,
				centerY: window.innerHeight / 2,
				scaleX: gameW / viewW,
				scaleY: gameH / viewH
			};

			if (forceLandscape) {
				// Rotate the entire game container in mobile-portrait so gameplay is landscape.
				container.classList.add('force-landscape');
				container.style.position = 'fixed';
				container.style.left = '50%';
				container.style.top = '50%';
				container.style.width = `${viewW}px`;
				container.style.height = `${viewH}px`;
				container.style.transform = 'translate(-50%, -50%) rotate(90deg)';
				container.style.transformOrigin = 'center center';

				// Fix coordinate mapping for CSS rotation by overriding transformPointer
				const inputManager = game.input as any;
				if (!inputManager._originalTransform) {
					inputManager._originalTransform = inputManager.transformPointer;
					inputManager.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
						if (rotatedInputMode) {
							// Relative to center in screen pixels
							const dx = (pageX - window.scrollX) - rotatedInputMetrics.centerX;
							const dy = (pageY - window.scrollY) - rotatedInputMetrics.centerY;

							// Rotate -90 degrees (CCW) to match game orientation
							const rotatedDx = dy;
							const rotatedDy = -dx;

							// Map to game coordinates using the CSS-to-game scale
							pointer.x = game.scale.width / 2 + rotatedDx * rotatedInputMetrics.scaleX;
							pointer.y = game.scale.height / 2 + rotatedDy * rotatedInputMetrics.scaleY;

							if (!rotatedInputCamera || !rotatedInputCamera.scene?.sys?.settings?.active) {
								syncRotatedInputCamera();
							}

							const cam = rotatedInputCamera;
							if (cam) {
								pointer.worldX = cam.scrollX + (pointer.x / cam.zoom);
								pointer.worldY = cam.scrollY + (pointer.y / cam.zoom);
							}
						} else {
							this._originalTransform(pointer, pageX, pageY, wasMove);
						}
					};
				}
			} else {
				// Normal mode - reset inline styles and use CSS defaults
				container.classList.remove('force-landscape');
				container.style.position = 'relative';
				container.style.left = '0';
				container.style.top = '0';
				container.style.width = '100%';
				container.style.height = '100%';
				container.style.transform = 'none';
				container.style.transformOrigin = 'center center';
			}

			// With NONE mode, we manually control canvas sizing.
			// Game resolution uses fixed 720 height with aspect-matched width.
			// Canvas CSS fills the container; Phaser renders at the game resolution.
			game.scale.resize(gameW, gameH);

			// Size the canvas element to fill its container
			const canvas = container.querySelector('canvas');
			if (canvas) {
				(canvas as HTMLCanvasElement).style.width = '100%';
				(canvas as HTMLCanvasElement).style.height = '100%';
			}
		}

		syncRotatedInputCamera();
		game.scale.refresh();
	};

	window.addEventListener('resize', updateScale);
	window.addEventListener('orientationchange', () => {
		setTimeout(updateScale, 500);
	});

	// Important for input sync on mobile
	window.addEventListener('touchstart', updateScale, { once: true });

	let lifecyclePausedSounds = false;
	let lifecycleSleeping = false;

	const setLifecycleSleep = (shouldSleep: boolean) => {
		if (shouldSleep === lifecycleSleeping) return;
		lifecycleSleeping = shouldSleep;

		if (shouldSleep) {
			if (!lifecyclePausedSounds) {
				game.sound.pauseAll();
				lifecyclePausedSounds = true;
			}
			game.loop.sleep();
			return;
		}

		game.loop.wake();
		updateScale();
		if (lifecyclePausedSounds) {
			game.sound.resumeAll();
			lifecyclePausedSounds = false;
		}
	};

	const syncLifecycleSleep = () => {
		setLifecycleSleep(document.hidden);
	};

	document.addEventListener('visibilitychange', syncLifecycleSleep);
	window.addEventListener('pagehide', () => setLifecycleSleep(true));
	window.addEventListener('pageshow', syncLifecycleSleep);
	window.addEventListener('blur', () => {
		if (document.hidden) setLifecycleSleep(true);
	});
	window.addEventListener('focus', () => {
		if (!document.hidden) setLifecycleSleep(false);
	});

	updateScale();
	game.scene.start("Boot");
});