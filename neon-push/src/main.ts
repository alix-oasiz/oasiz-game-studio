import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";

class Boot extends Phaser.Scene {

    constructor() {
        super("Boot");
    }

    preload() {

        // Keep asset-pack boot loading if needed by generated project structure.
        this.load.pack("pack", "assets/preload-asset-pack.json");
    }

    create() {

       this.scene.start("Preload");
    }
}

window.addEventListener("load", function () {

    const game = new Phaser.Game({
        width: 720,
        height: 1280,
        backgroundColor: "#f4f4f4",
        parent: "game-container",
        scale: {
            mode: Phaser.Scale.ScaleModes.FIT,
            autoCenter: Phaser.Scale.Center.CENTER_BOTH
        },
        scene: [Boot, Preload, Level]
    });

    game.scene.start("Boot");
});
