import Phaser from "phaser";
import { getAudioManager } from "../audio";

export default class Menu extends Phaser.Scene {
    private score: number = 0;
    private isGameOver: boolean = false;
    private readonly audio = getAudioManager();
    private menuFxCleanup: (() => void) | null = null;

    constructor() {
        super("Menu");
    }

    create(data: { isGameOver?: boolean, score?: number }) {
        this.cleanupMenuFx();
        this.isGameOver = data.isGameOver || false;
        this.score = data.score || 0;
        this.audio.startMusic("menu");
        this.audio.stopEngine();

        if (this.isGameOver && typeof (window as any).submitScore === "function") {
            (window as any).submitScore(this.score);
        }

        // Clean dark background — UI is handled by DOM
        this.cameras.main.setBackgroundColor(0x0c0c14);

        // Update motorcycle hero image with selected skin
        const motoHero = document.querySelector('.moto-hero') as HTMLImageElement | null;
        if (motoHero) {
            const skin = localStorage.getItem('selectedSkin') || 'blue';
            motoHero.src = `/assets/Motorcycles/${skin}.png?t=${Date.now()}`;
        }

        // Show UI layer
        const uiLayer = document.getElementById("ui-layer");
        if (uiLayer) {
            uiLayer.style.display = "flex";
            // Giriş animasyonunu hazırla (elemanlar gizli başlar)
            uiLayer.classList.remove("menu-entering");
            void uiLayer.offsetWidth;
            uiLayer.classList.add("menu-entering");
            setTimeout(() => uiLayer.classList.remove("menu-entering"), 1200);
            this.enableMenuFx(uiLayer);
        }

        // DOM overlay'i kaldır — canvas + DOM birlikte belirir
        const fd = document.getElementById("scene-fade");
        if (fd) {
            fd.classList.remove("fade-in");
            // Küçük gecikme: Menu sahnesi render edilsin, sonra fade out başlasın
            setTimeout(() => fd.classList.add("fade-out"), 60);
        }

        // Score display
        const scoreDisplay = document.getElementById("score-display");
        if (scoreDisplay) scoreDisplay.classList.toggle("hidden", !this.isGameOver);

        const hudScore = document.getElementById("hud-score");
        if (hudScore) hudScore.innerText = this.score.toString();

        // Play button
        const playBtnText = document.getElementById("play-btn-text");
        if (playBtnText) playBtnText.innerText = this.isGameOver ? "REPLAY" : "PLAY";

        const playBtn = document.getElementById("play-btn");
        if (playBtn) {
            playBtn.onclick = () => {
                this.audio.unlockFromUserGesture();
                this.audio.playUIButton();
                if (typeof (window as any).triggerHaptic === "function") {
                    (window as any).triggerHaptic("medium");
                }
                if (uiLayer) uiLayer.style.display = "none";
                this.cleanupMenuFx();
                this.scene.start("Game");
            };
        }

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.cleanupMenuFx();
        });

        (window as any).render_game_to_text = () => JSON.stringify({
            mode: "menu",
            score: this.score,
            isGameOver: this.isGameOver
        });
    }

    private enableMenuFx(uiLayer: HTMLElement) {
        document.body.classList.add("menu-live");
        uiLayer.classList.add("menu-live");
        uiLayer.style.setProperty("--mx", "0");
        uiLayer.style.setProperty("--my", "0");

        const onPointerMove = (event: PointerEvent) => {
            const nx = Phaser.Math.Clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1);
            const ny = Phaser.Math.Clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1);
            uiLayer.style.setProperty("--mx", nx.toFixed(3));
            uiLayer.style.setProperty("--my", ny.toFixed(3));
        };

        const onPointerLeave = () => {
            uiLayer.style.setProperty("--mx", "0");
            uiLayer.style.setProperty("--my", "0");
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerleave", onPointerLeave);

        this.menuFxCleanup = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerleave", onPointerLeave);
            uiLayer.classList.remove("menu-live");
            uiLayer.style.setProperty("--mx", "0");
            uiLayer.style.setProperty("--my", "0");
            document.body.classList.remove("menu-live");
        };
    }

    private cleanupMenuFx() {
        if (!this.menuFxCleanup) return;
        this.menuFxCleanup();
        this.menuFxCleanup = null;
    }
}
