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

        const titleFont = "'Outfit', sans-serif";

        // Title - Left aligned, simple, black
        const titleSize = Math.max(50, Math.min(100, Math.floor(width * 0.12)));
        this.add.text(width * 0.08, height * 0.12, "DRAWER\nWIZARD.", {
            fontFamily: titleFont,
            fontSize: `${titleSize}px`,
            color: "#000000",
            fontStyle: "900",
            lineSpacing: -10,
            letterSpacing: -2,
        } as any).setOrigin(0, 0);

        // Minimalist Play Button
        const buttonWidth = Math.max(160, Math.min(240, width * 0.4));
        const buttonHeight = Math.max(50, Math.min(80, height * 0.1));
        const buttonX = width * 0.5;
        const buttonY = height - Math.max(100, height * 0.15);

        const startButton = this.add.container(buttonX, buttonY);

        const buttonFace = this.add.graphics();
        const buttonLabel = this.add.text(0, 0, "PLAY", {
            fontFamily: titleFont,
            fontSize: `${Math.floor(buttonHeight * 0.45)}px`,
            fontStyle: "900",
            color: "#ffffff",
            letterSpacing: 2,
        } as any).setOrigin(0.5);

        const drawButton = (isHover: boolean, isDown: boolean) => {
            buttonFace.clear();

            const scale = isDown ? 0.95 : 1;
            const bgColor = isHover ? 0x222222 : 0x000000;

            buttonFace.fillStyle(bgColor, 1);
            buttonFace.fillRoundedRect(-buttonWidth * 0.5 * scale, -buttonHeight * 0.5 * scale, buttonWidth * scale, buttonHeight * scale, 8);

            buttonLabel.setScale(scale);
        };

        drawButton(false, false);
        startButton.add([buttonFace, buttonLabel]);
        // Set interactive area
        startButton.setSize(buttonWidth, buttonHeight);
        const geom = new Phaser.Geom.Rectangle(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight);
        startButton.setInteractive(geom, Phaser.Geom.Rectangle.Contains);
        startButton.input!.cursor = 'pointer';

        const settingsBtn = document.getElementById("settings-btn") as HTMLElement | null;
        if (settingsBtn) {
            settingsBtn.style.display = "none";
        }

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
        });
        startButton.on("pointerup", () => {
            if (started) return;
            startGame();
        });

        const keyboard = this.input.keyboard;
        const keyHandler = (event: KeyboardEvent) => {
            if (event.code === "Enter" || event.code === "Space") {
                startGame();
            }
        };
        keyboard?.on("keydown", keyHandler);

        this.events.once("shutdown", () => {
            keyboard?.off("keydown", keyHandler);
            if (settingsBtn) {
                settingsBtn.style.display = "";
            }
        });
    }
}

