import Phaser from "phaser";

interface SettingsState {
    music: boolean;
    fx: boolean;
    haptics: boolean;
    drawCount: number;
    background: string;
}

export default class MainMenu extends Phaser.Scene {
    private settingsOverlay!: Phaser.GameObjects.Container;
    private bgOverlay!: Phaser.GameObjects.Container;
    private settings: SettingsState = { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
    private mainBg!: Phaser.GameObjects.Image;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.settings = this.loadSettings();

        const w = this.scale.width;
        const h = this.scale.height;

        // Background
        this.mainBg = this.add.image(w * 0.5, h * 0.5, this.settings.background);
        this.mainBg.setDisplaySize(w, h);

        // Decorate with some card assets sprinkled around as background
        this.addDecorations(w, h);

        this.add.rectangle(0, 0, w, h, 0x000000, 0.4).setOrigin(0, 0);

        // Title
        const titleText = this.add.text(w * 0.5, h * 0.25, "SOLITAIRE", {
            fontSize: "76px",
            color: "#FFFFFF",
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            fontStyle: "900",
            stroke: "#1D8348",
            strokeThickness: 10,
            shadow: { offsetX: 0, offsetY: 8, color: "#000000", blur: 12, fill: true }
        }).setOrigin(0.5);

        // A gentle floating animation for the title
        this.tweens.add({
            targets: titleText,
            y: titleText.y - 15,
            duration: 2500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut"
        });

        // Play Button (Chunky Mobile Style)
        const playBtn = this.add.container(w * 0.5, h * 0.45);
        const btnW = 280;
        const btnH = 80;
        const radius = 40;

        const btnGraphics = this.add.graphics();

        const drawChunkyBtn = (isPressed: boolean, isHover: boolean) => {
            btnGraphics.clear();
            const yOff = isPressed ? 8 : 0;

            // Outer shadow
            if (!isPressed) {
                btnGraphics.fillStyle(0x000000, 0.4);
                btnGraphics.fillRoundedRect(-btnW / 2, -btnH / 2 + 12, btnW, btnH, radius);
            }

            // Bottom rim (dark orange)
            btnGraphics.fillStyle(0xD35400, 1);
            btnGraphics.fillRoundedRect(-btnW / 2, -btnH / 2 + yOff + 8, btnW, btnH, radius);

            // Main fill (orange/yellow)
            btnGraphics.fillStyle(isHover ? 0xFFC300 : 0xF39C12, 1);
            btnGraphics.fillRoundedRect(-btnW / 2, -btnH / 2 + yOff, btnW, btnH, radius);

            // Top highlight (semi-transparent white)
            btnGraphics.fillStyle(0xFFFFFF, 0.2);
            btnGraphics.fillRoundedRect(-btnW / 2 + 15, -btnH / 2 + yOff + 5, btnW - 30, btnH / 3, radius - 15);

            // Border stroke
            btnGraphics.lineStyle(4, 0xFFFFFF, 0.9);
            btnGraphics.strokeRoundedRect(-btnW / 2, -btnH / 2 + yOff, btnW, btnH, radius);
        };
        drawChunkyBtn(false, false);

        const playTxt = this.add.text(0, -2, "PLAY", {
            fontSize: "36px", color: "#FFFFFF", fontStyle: "900",
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            stroke: "#D35400", strokeThickness: 6,
            shadow: { offsetX: 0, offsetY: 3, color: "#8E44AD", blur: 0, fill: true }
        }).setOrigin(0.5);

        const playHitZone = this.add.zone(0, 0, btnW, btnH + 12).setInteractive({ useHandCursor: true });
        playBtn.add([btnGraphics, playTxt, playHitZone]);

        // Breathing animation for button to make it feel alive
        const breathe = this.tweens.add({
            targets: playBtn,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        playHitZone.on("pointerover", () => {
            document.body.style.cursor = "pointer";
            drawChunkyBtn(false, true);
        });

        playHitZone.on("pointerout", () => {
            document.body.style.cursor = "default";
            drawChunkyBtn(false, false);
            playTxt.y = -2;
        });

        playHitZone.on("pointerdown", () => {
            breathe.pause();
            playBtn.setScale(0.95);
            drawChunkyBtn(true, true);
            playTxt.y = 6;

            // Haptic on press
            this.triggerHaptic("medium");
        });

        playHitZone.on("pointerup", () => {
            document.body.style.cursor = "default";
            this.scene.start("Level");
        });

        // --- Background Button ---
        this.makeStandardButton(w * 0.5, h * 0.58, 240, 60, "BACKGROUNDS", () => {
            this.openBgSelector();
        });

        // --- Settings Button ---
        this.makeStandardButton(w * 0.5, h * 0.68, 240, 60, "SETTINGS", () => {
            this.openSettings();
        });

        // --- Draw Count Buttons (Main Menu) ---
        const drawY = h * 0.78;
        const bW = 110, bH = 55, bRad = 15;

        const d1Cont = this.add.container(w * 0.5 - 65, drawY);
        const d3Cont = this.add.container(w * 0.5 + 65, drawY);

        const d1Bg = this.add.graphics();
        const d3Bg = this.add.graphics();

        const d1Txt = this.add.text(0, -2, "DRAW 1", this.uiText(18, "#FFFFFF", "800")).setOrigin(0.5);
        const d3Txt = this.add.text(0, -2, "DRAW 3", this.uiText(18, "#FFFFFF", "800")).setOrigin(0.5);

        const drawCountBtn = (gfx: Phaser.GameObjects.Graphics, txtObj: Phaser.GameObjects.Text, val: number, isPressed: boolean, isHover: boolean) => {
            const isActive = this.settings.drawCount === val;
            gfx.clear();
            const yOff = isPressed ? 4 : 0;

            if (!isPressed) {
                gfx.fillStyle(0x000000, 0.4);
                gfx.fillRoundedRect(-bW / 2, -bH / 2 + 6, bW, bH, bRad);
            }

            if (isActive) {
                gfx.fillStyle(0x1B4F72, 1);
                gfx.fillRoundedRect(-bW / 2, -bH / 2 + yOff + 4, bW, bH, bRad);
                gfx.fillStyle(isHover ? 0x2E86C1 : 0x2874A6, 1);
                gfx.fillRoundedRect(-bW / 2, -bH / 2 + yOff, bW, bH, bRad);
                gfx.lineStyle(3, 0xFFFFFF, 0.9);
                txtObj.setColor("#FFFFFF");
                txtObj.setShadow(0, 2, "#000", 2, true);
            } else {
                gfx.fillStyle(0x424949, 1);
                gfx.fillRoundedRect(-bW / 2, -bH / 2 + yOff + 4, bW, bH, bRad);
                gfx.fillStyle(isHover ? 0x7F8C8D : 0x707B7C, 1);
                gfx.fillRoundedRect(-bW / 2, -bH / 2 + yOff, bW, bH, bRad);
                gfx.lineStyle(2, 0xBDC3C7, 0.5);
                txtObj.setColor("#D5D8DC");
                txtObj.setShadow();
            }
            gfx.strokeRoundedRect(-bW / 2, -bH / 2 + yOff, bW, bH, bRad);
        };

        const renderDrawBtns = (p1 = false, h1 = false, p3 = false, h3 = false) => {
            drawCountBtn(d1Bg, d1Txt, 1, p1, h1);
            drawCountBtn(d3Bg, d3Txt, 3, p3, h3);
        };
        renderDrawBtns();

        const d1Hit = this.add.zone(0, 0, bW, bH + 8).setInteractive({ useHandCursor: true });
        const d3Hit = this.add.zone(0, 0, bW, bH + 8).setInteractive({ useHandCursor: true });

        d1Cont.add([d1Bg, d1Txt, d1Hit]);
        d3Cont.add([d3Bg, d3Txt, d3Hit]);

        const updateDrawCount = (val: number, h1: boolean, h3: boolean) => {
            if (this.settings.drawCount !== val) {
                this.settings.drawCount = val;
                this.saveSettings();
                this.triggerHaptic("light");
            }
            renderDrawBtns(false, h1, false, h3);
        };

        d1Hit.on("pointerover", () => { document.body.style.cursor = "pointer"; renderDrawBtns(false, true, false, false); });
        d1Hit.on("pointerout", () => { document.body.style.cursor = "default"; renderDrawBtns(); d1Txt.y = -2; });
        d1Hit.on("pointerdown", () => { renderDrawBtns(true, true, false, false); d1Txt.y = 2; });
        d1Hit.on("pointerup", () => {
            document.body.style.cursor = "default";
            d1Txt.y = -2;
            updateDrawCount(1, true, false);
        });

        d3Hit.on("pointerover", () => { document.body.style.cursor = "pointer"; renderDrawBtns(false, false, false, true); });
        d3Hit.on("pointerout", () => { document.body.style.cursor = "default"; renderDrawBtns(); d3Txt.y = -2; });
        d3Hit.on("pointerdown", () => { renderDrawBtns(false, false, true, true); d3Txt.y = 2; });
        d3Hit.on("pointerup", () => {
            document.body.style.cursor = "default";
            d3Txt.y = -2;
            updateDrawCount(3, false, true);
        });
    }

    private makeStandardButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
        const c = this.add.container(x, y);
        const radius = 30;

        const gfx = this.add.graphics();
        const draw = (isPressed: boolean, isHover: boolean) => {
            gfx.clear();
            const yOff = isPressed ? 6 : 0;
            if (!isPressed) {
                gfx.fillStyle(0x000000, 0.4);
                gfx.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
            }
            gfx.fillStyle(0x1B2631, 1);
            gfx.fillRoundedRect(-w / 2, -h / 2 + yOff + 6, w, h, radius);
            gfx.fillStyle(isHover ? 0x5D6D7E : 0x34495E, 1);
            gfx.fillRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
            gfx.fillStyle(0xFFFFFF, 0.15);
            gfx.fillRoundedRect(-w / 2 + 15, -h / 2 + yOff + 5, w - 30, h / 3, radius - 15);
            gfx.lineStyle(3, 0xFFFFFF, 0.8);
            gfx.strokeRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
        };
        draw(false, false);

        const txt = this.add.text(0, -2, label, {
            fontSize: "24px", color: "#FFFFFF", fontStyle: "900",
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 0, fill: true }
        }).setOrigin(0.5);

        const hit = this.add.zone(0, 0, w, h + 10).setInteractive({ useHandCursor: true });
        c.add([gfx, txt, hit]);

        hit.on("pointerover", () => { document.body.style.cursor = "pointer"; draw(false, true); });
        hit.on("pointerout", () => { document.body.style.cursor = "default"; draw(false, false); txt.y = -2; });
        hit.on("pointerdown", () => { draw(true, true); txt.y = 4; this.triggerHaptic("light"); });
        hit.on("pointerup", () => {
            document.body.style.cursor = "default";
            draw(false, true);
            txt.y = -2;
            onClick();
        });
        return c;
    }

    private uiText(size = 20, color = "#ffffff", weight: string = "700", stroke?: string): Phaser.Types.GameObjects.Text.TextStyle {
        return {
            fontSize: `${size}px`, color, fontStyle: weight as any,
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            stroke: stroke || undefined,
            strokeThickness: stroke ? 4 : 0
        };
    }

    private loadSettings(): SettingsState {
        const raw = localStorage.getItem("solitaire_settings_v1");
        if (!raw) return { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
        try {
            const p = JSON.parse(raw);
            return {
                music: p.music !== false,
                fx: p.fx !== false,
                haptics: p.haptics !== false,
                drawCount: p.drawCount === 3 ? 3 : 1,
                background: p.background || "table_bg"
            };
        } catch {
            return { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
        }
    }

    private saveSettings() {
        localStorage.setItem("solitaire_settings_v1", JSON.stringify(this.settings));
    }

    private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error") {
        if (!this.settings.haptics) return;
        const fn = (window as any).triggerHaptic;
        if (typeof fn === "function") fn(type);
    }

    private openSettings() {
        if (!this.settingsOverlay) this.createSettingsOverlay();
        this.settingsOverlay.setVisible(true);
        this.settingsOverlay.setAlpha(0);
        this.tweens.add({ targets: this.settingsOverlay, alpha: 1, duration: 250 });
    }

    private openBgSelector() {
        if (!this.bgOverlay) this.createBgOverlay();
        this.bgOverlay.setVisible(true);
        this.bgOverlay.setAlpha(0);
        this.tweens.add({ targets: this.bgOverlay, alpha: 1, duration: 250 });
    }

    private createBgOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);

        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.85).setOrigin(0, 0);
        dark.setInteractive();

        const pW = Math.min(650, w - 40);
        const pH = 580;

        // Glow effect
        const glow = this.add.graphics();
        glow.fillStyle(0x3498DB, 0.15);
        glow.fillRoundedRect(w * 0.5 - pW / 2 - 10, h * 0.5 - pH / 2 - 10, pW + 20, pH + 20, 30);

        const panel = this.add.graphics();
        panel.fillStyle(0x1B1F23, 0.98);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 28);
        panel.lineStyle(2, 0x2C3E50, 1);
        panel.strokeRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 28);

        const title = this.add.text(w * 0.5, h * 0.5 - pH / 2 + 55, "SELECT THEME", {
            ...this.uiText(36, "#FFFFFF", "900", "#2980B9")
        }).setOrigin(0.5);

        const grid = this.add.container(w * 0.5, h * 0.5 + 20);

        const backgrounds = [
            "table_bg",
            "game_bg_modern_01", "game_bg_modern_02", "game_bg_modern_03",
            "game_bg_modern_04", "game_bg_modern_05", "game_bg_modern_06"
        ];

        const thumbW = 180, thumbH = 135;
        const spacingX = 200, spacingY = 155;
        const cols = 3;

        backgrounds.forEach((bgKey, i) => {
            const ix = i % cols;
            const iy = Math.floor(i / cols);
            const x = (ix - (cols - 1) / 2) * spacingX;
            const y = (iy - 0.8) * spacingY;

            const item = this.add.container(x, y);

            // Mask for rounded corners
            const maskGraphics = this.make.graphics({});
            maskGraphics.fillStyle(0xffffff);
            maskGraphics.fillRoundedRect(x - thumbW / 2 + w * 0.5, y - thumbH / 2 + h * 0.5 + 20, thumbW, thumbH, 12);
            const mask = maskGraphics.createGeometryMask();

            const img = this.add.image(0, 0, bgKey.startsWith("game") ? bgKey.replace("game_bg", "s_bg") : bgKey);
            img.setDisplaySize(thumbW, thumbH);
            img.setMask(mask);

            const frame = this.add.graphics();
            const isSelected = this.settings.background === bgKey;

            const drawFrame = (hover: boolean, pressed: boolean) => {
                frame.clear();
                const scale = pressed ? 0.95 : (hover ? 1.05 : 1.0);
                item.setScale(scale);

                if (isSelected) {
                    frame.lineStyle(6, 0x2ECC71, 1);
                    frame.strokeRoundedRect(-thumbW / 2 - 4, -thumbH / 2 - 4, thumbW + 8, thumbH + 8, 14);
                } else if (hover) {
                    frame.lineStyle(4, 0x3498DB, 0.8);
                    frame.strokeRoundedRect(-thumbW / 2 - 2, -thumbH / 2 - 2, thumbW + 4, thumbH + 4, 14);
                } else {
                    frame.lineStyle(2, 0xFFFFFF, 0.2);
                    frame.strokeRoundedRect(-thumbW / 2, -thumbH / 2, thumbW, thumbH, 12);
                }
            };
            drawFrame(false, false);

            const hit = this.add.zone(0, 0, thumbW, thumbH).setInteractive({ useHandCursor: true });

            hit.on("pointerover", () => { drawFrame(true, false); });
            hit.on("pointerout", () => { drawFrame(false, false); });
            hit.on("pointerdown", () => { drawFrame(true, true); });
            hit.on("pointerup", () => {
                this.settings.background = bgKey;
                this.mainBg.setTexture(bgKey);
                this.mainBg.setDisplaySize(w, h);
                this.saveSettings();
                this.triggerHaptic("medium");

                // Refresh all frames in grid
                grid.iterate((child: any) => {
                    if (child.list && child.list[1]) {
                        // This is a bit hacky but works for updating selection status
                        // In a real app we'd have a refresh grid function
                    }
                });

                // Smooth close
                this.tweens.add({
                    targets: this.bgOverlay,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => { this.bgOverlay.setVisible(false); }
                });
            });

            item.add([img, frame, hit]);
            grid.add(item);
        });

        // Close button
        const closeBtn = this.makeStandardButton(w * 0.5, h * 0.5 + pH / 2 - 50, 180, 46, "CLOSE", () => {
            this.tweens.add({
                targets: this.bgOverlay,
                alpha: 0,
                duration: 200,
                onComplete: () => { this.bgOverlay.setVisible(false); }
            });
        });

        c.add([dark, glow, panel, title, grid, closeBtn]);
        c.setVisible(false);
        this.bgOverlay = c;
    }

    private createSettingsOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);

        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0, 0);
        dark.setInteractive(); // Block clicks

        const panel = this.add.graphics();
        const pW = Math.min(480, w - 36);
        const pH = 430;
        panel.fillStyle(0x1E272E, 0.95);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);
        panel.lineStyle(2, 0x34495E, 0.8);
        panel.strokeRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.text(w * 0.5, h * 0.5 - 160, "SETTINGS", this.uiText(32, "#FFFFFF", "900", "#1A5276")).setOrigin(0.5);
        title.setShadow(0, 4, "#000000", 6, true);

        const mkToggle = (label: string, key: "music" | "fx" | "haptics", y: number) => {
            const row = this.add.container(w * 0.5 - 150, h * 0.5 + y);
            const txt = this.add.text(0, 0, label, this.uiText(22, "#ECF0F1", "800")).setOrigin(0, 0.5);

            const btnObj = this.add.graphics();
            const drawToggle = (isOn: boolean) => {
                btnObj.clear();
                btnObj.fillStyle(0x000000, 0.3);
                btnObj.fillRoundedRect(250, -16, 90, 40, 20);
                btnObj.fillStyle(isOn ? 0x1E8449 : 0x922B21, 1);
                btnObj.fillRoundedRect(250, -18, 90, 40, 20);
                btnObj.fillStyle(isOn ? 0x2ECC71 : 0xE74C3C, 1);
                btnObj.fillRoundedRect(250, -20, 90, 40, 20);
                btnObj.lineStyle(3, 0xFFFFFF, 0.8);
                btnObj.strokeRoundedRect(250, -20, 90, 40, 20);
            };
            drawToggle(this.settings[key]);

            const val = this.add.text(295, -2, this.settings[key] ? "ON" : "OFF", {
                ...this.uiText(18, "#FFFFFF", "900", this.settings[key] ? "#196F3D" : "#943126")
            }).setOrigin(0.5);

            const rowHitZone = this.add.zone(275, 0, 90, 40).setInteractive({ useHandCursor: true });
            row.add([txt, btnObj, val, rowHitZone]);

            rowHitZone.on("pointerover", () => { document.body.style.cursor = "pointer"; });
            rowHitZone.on("pointerout", () => { document.body.style.cursor = "default"; });
            rowHitZone.on("pointerdown", () => {
                this.settings[key] = !this.settings[key];
                drawToggle(this.settings[key]);
                val.setText(this.settings[key] ? "ON" : "OFF");
                val.setStroke(this.settings[key] ? "#196F3D" : "#943126", 4);
                this.saveSettings();
                this.triggerHaptic("light");
            });
            return row;
        };

        const t1 = mkToggle("Music", "music", -80);
        const t2 = mkToggle("Sound Effects", "fx", -24);
        const t3 = mkToggle("Haptics", "haptics", 32);

        // Close button
        const closeBtn = this.makeStandardButton(w * 0.5, h * 0.5 + 150, 180, 46, "CLOSE", () => {
            this.tweens.add({
                targets: this.settingsOverlay,
                alpha: 0,
                duration: 200,
                onComplete: () => { this.settingsOverlay.setVisible(false); }
            });
        });

        c.add([dark, panel, title, t1, t2, t3, closeBtn]);
        c.setVisible(false);
        this.settingsOverlay = c;
    }

    private addDecorations(w: number, h: number) {
        const cards = [
            this.add.image(w * 0.2, h * 0.2, "card_spade_1").setAngle(-15).setAlpha(0.6).setScale(1.2),
            this.add.image(w * 0.8, h * 0.7, "card_heart_13").setAngle(20).setAlpha(0.6).setScale(1.2),
            this.add.image(w * 0.15, h * 0.8, "card_diamond_7").setAngle(-25).setAlpha(0.4).setScale(0.9),
            this.add.image(w * 0.85, h * 0.25, "card_clover_11").setAngle(30).setAlpha(0.4).setScale(0.9)
        ];

        cards.forEach((card, i) => {
            this.tweens.add({
                targets: card,
                y: card.y - 15 - Math.random() * 10,
                angle: card.angle + 3,
                duration: 3000 + Math.random() * 1500,
                yoyo: true,
                repeat: -1,
                ease: "Sine.inOut",
                delay: i * 400
            });
        });
    }
}
