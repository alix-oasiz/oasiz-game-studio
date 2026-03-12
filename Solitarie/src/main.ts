import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import MainMenu from "./scenes/MainMenu";

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

window.addEventListener("load", function () {
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: 720,
        height: 1280, // portrait-first for mobile
        backgroundColor: "#163d22",
        parent: "game-container",
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: window.innerWidth,
            height: window.innerHeight
        },
        scene: [Boot, Preload, MainMenu, Level],
        loader: {
            maxParallelDownloads: 4
        },
        render: {
            antialias: true,
            pixelArt: false
        }
    });

    game.scene.start("Boot");
});
