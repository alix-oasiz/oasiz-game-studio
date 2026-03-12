import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/800.css";
import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import MainMenu from "./scenes/MainMenu";
import { initOasiz } from "./platform/oasiz";
import { ensureFontsReady } from "./ui/fonts";

class Boot extends Phaser.Scene {
    constructor() {
        super("Boot");
    }

    preload() {
        this.load.pack("pack", "assets/preload-asset-pack.json");
        const tableBgUrl = new URL("../public/assets-mobile-70x100/bg/table-bg.png", import.meta.url).href;
        this.load.image("table_bg", tableBgUrl);
    }

    create() {
        void this.startPreload();
    }

    private async startPreload() {
        await ensureFontsReady();
        this.scene.start("Preload");
    }
}

window.addEventListener("load", function () {
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const deviceResolution = window.devicePixelRatio || 1;
    const resolution = isMobile
        ? Math.min(deviceResolution, 1.5)
        : Math.min(deviceResolution, 2);
    const config = {
        type: Phaser.WEBGL,
        width: 720,
        height: 1280, // portrait-first for mobile
        backgroundColor: "#163d22",
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        resolution,
        powerPreference: "default",
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
            antialiasGL: true,
            mipmapFilter: "LINEAR_MIPMAP_LINEAR",
            powerPreference: "default"
        }
    } as Phaser.Types.Core.GameConfig;
    const game = new Phaser.Game(config);

    initOasiz(game);
    game.scene.start("Boot");
});
