import Phaser from "phaser";
import Boot from "./scenes/Boot";
import Menu from "./scenes/Menu";
import Game from "./scenes/Game";
import { initSettings } from "./settings";
import { getAudioManager } from "./audio";

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
			gravity: { y: 1.3333, x: 0 },
		}
	},
	scene: [Boot, Menu, Game]
};

const game = new Phaser.Game(config);
(window as any).__phaserGame = game;

getAudioManager();
initSettings();

export default game;
