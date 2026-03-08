import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import TestTiles from "./scenes/TestTiles";

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

window.addEventListener('load', function () {

	const isMobileDevice = () =>
		window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

	const game = new Phaser.Game({
		width: 1280,
		height: 720,
		backgroundColor: "#141a26",
		parent: "game-container",
		pixelArt: true,
		render: {
			preserveDrawingBuffer: true
		},
		scale: {
			mode: Phaser.Scale.NONE,
			autoCenter: Phaser.Scale.NO_CENTER
		},
		physics: {
			default: 'arcade',
			arcade: {
				gravity: { x: 0, y: 0 },
				debug: false
			}
		},
		scene: [Boot, Preload, Level, TestTiles]
	});

	// Dynamic resize: match game resolution to screen aspect ratio (eliminates black bars).
	// CSS handles the force-landscape rotation of #app and #ui-layer.
	// JS handles resizing the Phaser game resolution + pointer coordinate mapping.
	const updateScale = () => {
		const isPortrait = window.innerHeight > window.innerWidth;
		const container = document.getElementById("game-container");
		const isMobile = isMobileDevice();
		const forceLandscape = isMobile && isPortrait;

		document.body.classList.toggle("force-landscape", forceLandscape);

		if (container) {
			// Viewport dimensions (what the game should display as)
			const viewW = forceLandscape ? window.innerHeight : window.innerWidth;
			const viewH = forceLandscape ? window.innerWidth : window.innerHeight;

			// Game resolution: fixed 720 height, width matches screen aspect ratio.
			// This eliminates letterboxing by matching the phone's exact aspect ratio.
			const BASE_H = 720;
			const aspect = viewW / viewH;
			const gameW = Math.round(BASE_H * aspect);
			const gameH = BASE_H;

			// Resize game to match aspect ratio — no letterboxing
			game.scale.resize(gameW, gameH);

			const canvas = container.querySelector("canvas");
			if (canvas) {
				(canvas as HTMLCanvasElement).style.width = "100%";
				(canvas as HTMLCanvasElement).style.height = "100%";
			}

			// Override Phaser's transformPointer for correct force-landscape coordinate mapping
			if (forceLandscape) {
				const inputManager = game.input as any;
				if (!inputManager._originalTransform) {
					inputManager._originalTransform = inputManager.transformPointer;
					inputManager.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
						const isPortraitNow = window.innerHeight > window.innerWidth;
						const isMobileNow = isMobileDevice();
						if (isPortraitNow && isMobileNow) {
							const winW = window.innerWidth;
							const winH = window.innerHeight;
							const curGameW = game.scale.width;
							const curGameH = game.scale.height;
							const curViewW = winH; // After CSS rotation
							const curViewH = winW;
							const scaleX = curGameW / curViewW;
							const scaleY = curGameH / curViewH;
							const centerX = winW / 2;
							const centerY = winH / 2;
							const dx = (pageX - window.scrollX) - centerX;
							const dy = (pageY - window.scrollY) - centerY;
							// Rotate -90 degrees to match CSS 90deg rotation
							const rotatedDx = dy;
							const rotatedDy = -dx;
							pointer.x = curGameW / 2 + rotatedDx * scaleX;
							pointer.y = curGameH / 2 + rotatedDy * scaleY;
							game.scene.getScenes(true).forEach((scene: Phaser.Scene) => {
								if (scene.cameras && scene.cameras.main) {
									const cam = scene.cameras.main;
									pointer.worldX = cam.scrollX + (pointer.x / cam.zoom);
									pointer.worldY = cam.scrollY + (pointer.y / cam.zoom);
								}
							});
						} else {
							this._originalTransform(pointer, pageX, pageY, wasMove);
						}
					};
				}
			}
		}

		game.scale.refresh();
	};

	if (isMobileDevice() && (screen.orientation as any)?.lock) {
		(screen.orientation as any).lock("landscape").catch(() => undefined);
	}

	window.addEventListener("resize", updateScale);
	window.addEventListener("orientationchange", () => setTimeout(updateScale, 500));
	window.addEventListener("touchstart", updateScale, { once: true });

	updateScale();
	game.scene.start("Boot");
});
