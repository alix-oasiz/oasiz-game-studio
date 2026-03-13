import Phaser from "phaser";
import Level from "./scenes/Level";
import MainMenu from "./scenes/MainMenu";

window.addEventListener("load", () => {

    const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: "#2f3744",
        parent: "game-container",
        scale: {
            mode: Phaser.Scale.ScaleModes.RESIZE,
            autoCenter: Phaser.Scale.Center.NO_CENTER
        },
        render: {
            antialias: true,
            pixelArt: false,
            roundPixels: false
        },
        scene: [MainMenu, Level]
    });

    (window as Window & { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game;
});
