import Phaser from "phaser";
import { oasiz } from "@oasiz/sdk";
import Scene from "./scenes/Scene";
import Preload from "./scenes/Preload";
import { initUI } from "./ui";

class Boot extends Phaser.Scene {

	constructor() {
		super("Boot");
	}

	create() {
		this.scene.start("Preload");
	}
}

window.addEventListener('load', function () {
	// Initialize UI logic that handles SDK and DOM binding
	initUI();

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