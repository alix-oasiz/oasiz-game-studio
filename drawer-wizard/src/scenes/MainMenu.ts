export default class MainMenu extends Phaser.Scene {

    constructor() {
        super("MainMenu");
    }

    create(): void {
        const width = this.scale.width;
        const height = this.scale.height;

        // Launch Level in attract mode in the background
        this.scene.launch("Level", { attractMode: true });
        this.scene.bringToTop();

        // Add a light translucent overlay so the background gameplay is visible but doesn't overpower the UI
        const overlay = this.add.rectangle(0, 0, width, height, 0xffffff, 0.35).setOrigin(0, 0);

        const titleFont = "'Cinzel Decorative', serif";
        const uiFont = "'Outfit', sans-serif";

        // Show the HTML title overlay (browser rendering avoids canvas letter-spacing clipping)
        const titleEl = document.getElementById("game-title");
        titleEl?.classList.remove("hidden");

        // Minimalist Play Button
        const buttonWidth = Math.max(160, Math.min(240, width * 0.4));
        const buttonHeight = Math.max(50, Math.min(80, height * 0.1));
        const buttonX = width * 0.5;
        const buttonY = height - Math.max(100, height * 0.15);

        const startButton = this.add.container(buttonX, buttonY);

        const buttonFace = this.add.graphics();
        const buttonLabel = this.add.text(0, 0, "PLAY", {
            fontFamily: titleFont,
            fontSize: `${Math.floor(buttonHeight * 0.42)}px`,
            fontStyle: "700",
            color: "#ffffff",
            letterSpacing: 3,
            stroke: "#000000",
            strokeThickness: 5,
        } as any).setOrigin(0.5);

        const drawButton = (isHover: boolean, isDown: boolean) => {
            buttonFace.clear();

            const scale = isDown ? 0.95 : 1;
            const bgColor = isHover ? 0x141414 : 0x000000;
            const borderColor = 0xffffff;
            const bw = buttonWidth * scale;
            const bh = buttonHeight * scale;
            const left = -bw * 0.5;
            const top = -bh * 0.5;

            // Arcane panel style to match combo/title theme
            buttonFace.fillStyle(bgColor, 1);
            buttonFace.fillRoundedRect(left, top, bw, bh, 10);
            buttonFace.lineStyle(2, borderColor, 1);
            buttonFace.strokeRoundedRect(left, top, bw, bh, 10);
            buttonFace.lineStyle(1.5, borderColor, 0.65);
            buttonFace.beginPath();
            buttonFace.moveTo(left + 14, top + 8);
            buttonFace.lineTo(left + 30, top + 8);
            buttonFace.moveTo(left + 8, top + 14);
            buttonFace.lineTo(left + 8, top + 30);
            buttonFace.moveTo(left + bw - 14, top + 8);
            buttonFace.lineTo(left + bw - 30, top + 8);
            buttonFace.moveTo(left + bw - 8, top + 14);
            buttonFace.lineTo(left + bw - 8, top + 30);
            buttonFace.moveTo(left + 14, top + bh - 8);
            buttonFace.lineTo(left + 30, top + bh - 8);
            buttonFace.moveTo(left + 8, top + bh - 14);
            buttonFace.lineTo(left + 8, top + bh - 30);
            buttonFace.moveTo(left + bw - 14, top + bh - 8);
            buttonFace.lineTo(left + bw - 30, top + bh - 8);
            buttonFace.moveTo(left + bw - 8, top + bh - 14);
            buttonFace.lineTo(left + bw - 8, top + bh - 30);
            buttonFace.strokePath();

            buttonLabel.setScale(scale);
        };

        drawButton(false, false);
        startButton.add([buttonFace, buttonLabel]);
        // Set interactive area
        startButton.setSize(buttonWidth, buttonHeight);
        const geom = new Phaser.Geom.Rectangle(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight);
        startButton.setInteractive(geom, Phaser.Geom.Rectangle.Contains);
        startButton.input!.cursor = 'pointer';

        let started = false;
        const startGame = () => {
            if (started) return;
            started = true;

            const fxEnabled = localStorage.getItem("setting_fx") !== "false";
            if (fxEnabled) {
                this.sound.play("btnClick");
            }

            startButton.disableInteractive();
            drawButton(true, true);
            titleEl?.classList.add("hidden");

            // Simple fade out transition
            this.tweens.add({
                targets: startButton,
                alpha: 0,
                duration: 200,
                ease: "Power3",
            });
            this.tweens.add({
                targets: overlay,
                alpha: 0,
                duration: 400,
                ease: "Linear",
            });

            this.cameras.main.fadeOut(400, 0, 0, 0); // Fade to black for a stark contrast going into the level

            this.time.delayedCall(400, () => {
                this.scene.stop("Level");
            });
            this.time.delayedCall(450, () => {
                this.scene.start("Level", { attractMode: false });
            });
        };

        startButton.on("pointerover", () => {
            if (started) return;
            drawButton(true, false);
        });
        startButton.on("pointerout", () => {
            if (started) return;
            drawButton(false, false);
        });
        startButton.on("pointerdown", () => {
            if (started) return;
            drawButton(true, true);
            startGame();
        });

        const onAnyTapStart = () => {
            if (started) return;
            startGame();
        };
        this.input.on("pointerdown", onAnyTapStart);

        const keyboard = this.input.keyboard;
        const keyHandler = (event: KeyboardEvent) => {
            if (event.code === "Enter" || event.code === "Space") {
                startGame();
            }
        };
        keyboard?.on("keydown", keyHandler);

        this.events.once("shutdown", () => {
            keyboard?.off("keydown", keyHandler);
            this.input.off("pointerdown", onAnyTapStart);
            titleEl?.classList.add("hidden");
        });
    }
}
