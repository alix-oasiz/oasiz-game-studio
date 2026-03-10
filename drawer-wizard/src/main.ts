import Phaser from "phaser";
import Level from "./scenes/Level";
import MainMenu from "./scenes/MainMenu";
import Preload from "./scenes/Preload";
import { initUI } from "./ui";

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
	initUI();
	const game = new Phaser.Game({
		width: window.innerWidth,
		height: window.innerHeight,
		backgroundColor: "#000000",
		antialias: true,
		pixelArt: false,
		roundPixels: false,
		// @ts-ignore
		resolution: window.devicePixelRatio || 1,
		parent: "game-container",
		scale: {
			mode: Phaser.Scale.RESIZE,
			autoCenter: Phaser.Scale.Center.CENTER_BOTH
		},
		scene: [Boot, Preload, MainMenu, Level]
	});

	game.scene.start("Boot");
});
