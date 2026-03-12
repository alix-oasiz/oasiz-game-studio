import Phaser from "phaser";
import Scene from "./scenes/Scene";
import Preload from "./scenes/Preload";

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

	const game = new Phaser.Game({
		width: 1280,
		height: 720,
		backgroundColor: "#2f2f2f",
		parent: "game-container",
		pixelArt: false,
		roundPixels: false,
		scale: {
			mode: Phaser.Scale.ScaleModes.RESIZE,
			autoCenter: Phaser.Scale.Center.CENTER_BOTH
		},
		scene: [Boot, Preload, Scene]
	});

	game.scene.start("Boot");
});