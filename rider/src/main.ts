import Phaser from "phaser";
import Boot from "./scenes/Boot";
import Menu from "./scenes/Menu";
import Game from "./scenes/Game";
import { initSettings } from "./settings";
import { getAudioManager } from "./audio";
import { BUILD_VERSION } from "./build-version";

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	width: window.innerWidth,
	height: window.innerHeight,
	backgroundColor: "#000000", // pure black for neon
	parent: "game-container",
	scale: {
		mode: Phaser.Scale.RESIZE,
	},
	physics: {
		default: 'matter',
		matter: {
			debug: false, // Turn off debug lines, we will draw neon graphics
			gravity: { y: 1, x: 0 },
		}
	},
	scene: [Boot, Menu, Game]
};

const game = new Phaser.Game(config);
(window as any).__phaserGame = game;

const isMobile = window.matchMedia("(pointer: coarse)").matches;
const buildVersionNode = document.getElementById("build-version");
if (buildVersionNode) {
	buildVersionNode.textContent = `Build ${BUILD_VERSION}`;
	buildVersionNode.style.display = isMobile ? "none" : "block";
}

getAudioManager();
initSettings();

export default game;
