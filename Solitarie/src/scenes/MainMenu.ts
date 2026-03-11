import Phaser from "phaser";
import { clearBackButtonHandler, gameplayStop, leavePlatformGame, setBackButtonHandler, triggerPlatformHaptic } from "../platform/oasiz";
import { syncBackgroundMusic } from "../audio/backgroundMusic";
import { UI_FONT_FAMILY, getUiTextResolution, normalizeUiFontWeight } from "../ui/fonts";
import { hideAllHtmlButtons, hideHtmlButton, showHtmlButton } from "../ui/htmlButton";
import { hideAllHtmlText, hideHtmlText, showHtmlText } from "../ui/htmlText";
import { HOW_TO_PLAY_PAGES } from "../ui/howToPlayPages";

interface SettingsState {
    music: boolean;
    fx: boolean;
    haptics: boolean;
    drawCount: number;
    background: string;
}

export default class MainMenu extends Phaser.Scene {
    private settingsOverlay?: Phaser.GameObjects.Container;
    private bgOverlay?: Phaser.GameObjects.Container;
    private howToOverlay?: Phaser.GameObjects.Container;
    private settings: SettingsState = { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
    private mainBg!: Phaser.GameObjects.Image;
    private bgShade!: Phaser.GameObjects.Rectangle;
    private decorationCards: Phaser.GameObjects.Image[] = [];
    private howToPageIndex = 0;

    constructor() {
        super("MainMenu");
    }

    create() {
        gameplayStop();
        hideAllHtmlText();
        hideAllHtmlButtons();
        this.settings = this.loadSettings();
        syncBackgroundMusic(this, this.settings.music, true);
        const handleBackButton = () => {
            if (this.settingsOverlay?.visible || this.bgOverlay?.visible || this.howToOverlay?.visible) return;
            leavePlatformGame();
        };
        setBackButtonHandler(handleBackButton);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.destroySettingsOverlay();
            this.destroyBgOverlay();
            this.destroyHowToOverlay();
            hideAllHtmlText();
            hideAllHtmlButtons();
            clearBackButtonHandler(handleBackButton);
        });

        const w = this.scale.width;
        const h = this.scale.height;

        // Background
        this.mainBg = this.add.image(w * 0.5, h * 0.5, this.settings.background);
        this.mainBg.setDisplaySize(w, h);

        // Decorate with some card assets sprinkled around as background
        this.decorationCards = this.addDecorations(w, h);

        this.bgShade = this.add.rectangle(0, 0, w, h, 0x000000, 0.4).setOrigin(0, 0);

        this.showMainTitle();

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
            btnGraphics.fillStyle(0x8c4a08, 1);
            btnGraphics.fillRoundedRect(-btnW / 2, -btnH / 2 + yOff + 8, btnW, btnH, radius);

            // Main fill
            btnGraphics.fillStyle(isHover ? 0xffb347 : 0xf08c24, 1);
            btnGraphics.fillRoundedRect(-btnW / 2, -btnH / 2 + yOff, btnW, btnH, radius);

            // Top highlight (semi-transparent white)
            btnGraphics.fillStyle(0xFFFFFF, 0.2);
            btnGraphics.fillRoundedRect(-btnW / 2 + 15, -btnH / 2 + yOff + 5, btnW - 30, btnH / 3, radius - 15);

            // Border stroke
            btnGraphics.lineStyle(4, 0xFFFFFF, 0.9);
            btnGraphics.strokeRoundedRect(-btnW / 2, -btnH / 2 + yOff, btnW, btnH, radius);
        };
        drawChunkyBtn(false, false);

        const playTxt = this.add.text(0, -2, "Play", {
            fontSize: "38px", color: "#FFFFFF", fontStyle: normalizeUiFontWeight("900"),
            fontFamily: UI_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: "#1A0003", strokeThickness: 3
        }).setOrigin(0.5).setAlpha(0);

        const playHitZone = this.add.zone(0, 0, btnW, btnH + 12).setInteractive({ useHandCursor: true });
        playBtn.add([btnGraphics, playTxt, playHitZone]);
        btnGraphics.setVisible(false);
        playHitZone.input!.enabled = false;

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
            this.playButton();
            hideAllHtmlText();
            this.scene.start("Level");
        });

        // --- Background Button ---
        this.makeStandardButton(w * 0.5, h * 0.57, 240, 60, "How to play", () => {
            this.openHowToOverlay();
        }, "blue", true);

        // --- Background Button ---
        this.makeStandardButton(w * 0.5, h * 0.67, 240, 60, "Backgrounds", () => {
            this.openBgSelector();
        }, "blue", true);

        // --- Settings Button ---
        this.makeStandardButton(w * 0.5, h * 0.77, 240, 60, "Settings", () => {
            this.openSettings();
        }, "blue", true);

        this.showMenuButtonLabels();

    }

    private makeStandardButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        onClick: () => void,
        theme: "blue" | "red" = "blue",
        useHtmlLabel = false
    ) {
        const c = this.add.container(x, y);
        const radius = 30;

        const gfx = this.add.graphics();
        const draw = (isPressed: boolean, isHover: boolean) => {
            gfx.clear();
            const yOff = isPressed ? 6 : 0;
            const rimFill = theme === "blue" ? 0x0f2147 : 0x111111;
            const mainFill = theme === "blue"
                ? (isHover ? 0x355caa : 0x1f3d7a)
                : (isHover ? 0xD72638 : 0xB3131B);
            if (!isPressed) {
                gfx.fillStyle(0x000000, 0.4);
                gfx.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
            }
            gfx.fillStyle(rimFill, 1);
            gfx.fillRoundedRect(-w / 2, -h / 2 + yOff + 6, w, h, radius);
            gfx.fillStyle(mainFill, 1);
            gfx.fillRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
            gfx.fillStyle(0xFFFFFF, 0.15);
            gfx.fillRoundedRect(-w / 2 + 15, -h / 2 + yOff + 5, w - 30, h / 3, radius - 15);
            gfx.lineStyle(3, 0xFFFFFF, 0.8);
            gfx.strokeRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
        };
        draw(false, false);

        const txt = this.add.text(0, -2, label, {
            fontSize: "25px", color: "#FFFFFF", fontStyle: normalizeUiFontWeight("900"),
            fontFamily: UI_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: "#1A0003",
            strokeThickness: 2
        }).setOrigin(0.5).setAlpha(useHtmlLabel ? 0 : 1);

        const hit = this.add.zone(0, 0, w, h + 10).setInteractive({ useHandCursor: true });
        c.add([gfx, txt, hit]);
        if (useHtmlLabel) {
            gfx.setVisible(false);
            txt.setVisible(false);
            hit.input!.enabled = false;
        }

        hit.on("pointerover", () => { document.body.style.cursor = "pointer"; draw(false, true); });
        hit.on("pointerout", () => { document.body.style.cursor = "default"; draw(false, false); txt.y = -2; });
        hit.on("pointerdown", () => { draw(true, true); txt.y = 4; this.triggerHaptic("light"); });
        hit.on("pointerup", () => {
            document.body.style.cursor = "default";
            draw(false, true);
            txt.y = -2;
            this.playButton();
            onClick();
        });
        return c;
    }

    private uiText(size = 20, color = "#ffffff", weight: string = "700", stroke?: string): Phaser.Types.GameObjects.Text.TextStyle {
        const strokeThickness = !stroke ? 0 : size <= 18 ? 1 : size <= 24 ? 2 : 3;
        return {
            fontSize: `${size}px`, color: stroke ? "#111111" : color,
            fontStyle: normalizeUiFontWeight(weight),
            fontFamily: UI_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: stroke ? "#FFFFFF" : undefined,
            strokeThickness
        };
    }

    private renderModalTitle(container: Phaser.GameObjects.Container, label: string): void {
        const solidColor = label === "Select theme"
            ? "#00A1E4"
            : label === "Settings" || label === "How to play"
                ? "#FFFFFF"
                : undefined;
        const strokeColor = solidColor === "#FFFFFF" ? "#111111" : "#FFFFFF";
        if (document.getElementById("solitaire-modal-title")) {
            container.setVisible(false);
            showHtmlText("modal-title", {
                text: label,
                x: container.x,
                y: container.y,
                fontSize: 32,
                letterSpacing: 2,
                variant: "modal",
                multicolor: !solidColor,
                color: solidColor,
                strokeColor: solidColor ? strokeColor : undefined
            });
            return;
        }

        container.setVisible(true);
        container.removeAll(true);
        const colors = solidColor ? [solidColor] : ["#FFFFFF", "#111111", "#B3131B"];
        const letters = [...label].map((char, index) => this.add.text(0, 0, char, {
            fontSize: "32px",
            color: colors[index % colors.length],
            fontFamily: UI_FONT_FAMILY,
            fontStyle: normalizeUiFontWeight("900"),
            resolution: getUiTextResolution(),
            stroke: solidColor ? strokeColor : "#FFFFFF",
            strokeThickness: 2
        }).setOrigin(0.5));
        const gap = 3;
        const totalWidth = letters.reduce((sum, letter, index) => sum + letter.width + (index === letters.length - 1 ? 0 : gap), 0);
        let cursor = -totalWidth / 2;
        letters.forEach((letter, index) => {
            letter.x = cursor + letter.width / 2;
            cursor += letter.width + (index === letters.length - 1 ? 0 : gap);
        });
        container.add(letters);
    }

    private showMainTitle(): void {
        showHtmlText("main-title", {
            text: "Solitaire",
            x: this.scale.width * 0.5,
            y: this.scale.height * 0.23,
            fontSize: this.scale.height > this.scale.width ? 62 : 58,
            letterSpacing: 5,
            maxWidth: this.scale.width - 48,
            variant: "menu"
        });
    }

    private showMenuButtonLabels(): void {
        const w = this.scale.width;
        const h = this.scale.height;
        hideHtmlText("menu-play-label");
        hideHtmlText("menu-howto-label");
        hideHtmlText("menu-backgrounds-label");
        hideHtmlText("menu-settings-label");
        showHtmlButton("menu-play-button", {
            text: "Play",
            x: w * 0.5,
            y: h * 0.45,
            width: 280,
            height: 80,
            radius: 40,
            fontSize: 38,
            theme: "orange",
            onClick: () => {
                this.playButton();
                hideAllHtmlText();
                hideAllHtmlButtons();
                this.scene.start("Level");
            }
        });
        showHtmlButton("menu-howto-button", {
            text: "How to play",
            x: w * 0.5,
            y: h * 0.57,
            width: 240,
            height: 60,
            radius: 30,
            fontSize: 25,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.openHowToOverlay();
            }
        });
        showHtmlButton("menu-backgrounds-button", {
            text: "Backgrounds",
            x: w * 0.5,
            y: h * 0.67,
            width: 240,
            height: 60,
            radius: 30,
            fontSize: 25,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.openBgSelector();
            }
        });
        showHtmlButton("menu-settings-button", {
            text: "Settings",
            x: w * 0.5,
            y: h * 0.77,
            width: 240,
            height: 60,
            radius: 30,
            fontSize: 25,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.openSettings();
            }
        });
    }

    private hideMenuButtonLabels(): void {
        hideHtmlText("menu-play-label");
        hideHtmlText("menu-howto-label");
        hideHtmlText("menu-backgrounds-label");
        hideHtmlText("menu-settings-label");
        hideHtmlButton("menu-play-button");
        hideHtmlButton("menu-howto-button");
        hideHtmlButton("menu-backgrounds-button");
        hideHtmlButton("menu-settings-button");
    }

    private syncMainTitleVisibility(): void {
        const overlayVisible = !!this.settingsOverlay?.visible || !!this.bgOverlay?.visible || !!this.howToOverlay?.visible;
        if (overlayVisible) {
            hideHtmlText("main-title");
            this.hideMenuButtonLabels();
            return;
        }
        hideHtmlText("modal-title");
        this.showMainTitle();
        this.showMenuButtonLabels();
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
        triggerPlatformHaptic(this.settings.haptics, type);
    }

    private playTone(freq: number, type: OscillatorType, dur: number, vol: number, slideFreq?: number) {
        if (!this.settings.fx) return;
        const ctx = (this.sound as any).context as AudioContext;
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, now + dur);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.05);
    }

    private playButton() {
        if (this.settings.fx && this.cache.audio.exists("ui_button")) {
            this.sound.play("ui_button", { volume: 0.4 });
            return;
        }
        this.playTone(520, "sine", 0.05, 0.04);
    }

    private openSettings() {
        if (this.settingsOverlay?.visible) return;
        hideHtmlText("main-title");
        this.hideMenuButtonLabels();
        this.destroySettingsOverlay(true);
        this.createSettingsOverlay();
        const overlay = this.settingsOverlay!;
        overlay.setVisible(true);
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 250 });
    }

    private openBgSelector() {
        if (this.bgOverlay?.visible) return;
        hideHtmlText("main-title");
        this.hideMenuButtonLabels();
        this.destroyBgOverlay(true);
        this.createBgOverlay();
        this.setStartScreenBlur(true);
        const overlay = this.bgOverlay!;
        const topInset = this.scale.height > this.scale.width ? 132 : 54;
        const bottomInset = this.scale.height > this.scale.width ? 70 : 40;
        const panelHeight = Math.min(500, this.scale.height - topInset - bottomInset);
        overlay.setVisible(true);
        overlay.setAlpha(0);
        showHtmlButton("menu-background-close-button", {
            text: "Close",
            x: this.scale.width * 0.5,
            y: topInset + panelHeight - 44,
            width: 204,
            height: 50,
            radius: 25,
            fontSize: 23,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.closeBgSelector();
            }
        });
        this.tweens.add({ targets: overlay, alpha: 1, duration: 250 });
    }

    private closeBgSelector() {
        const overlay = this.bgOverlay;
        if (!overlay) return;
        this.tweens.killTweensOf(overlay);
        this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                if (this.bgOverlay === overlay) {
                    this.destroyBgOverlay();
                }
                this.setStartScreenBlur(false);
                this.syncMainTitleVisibility();
            }
        });
    }

    private closeSettingsOverlay() {
        const overlay = this.settingsOverlay;
        if (!overlay) return;
        this.tweens.killTweensOf(overlay);
        this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                if (this.settingsOverlay === overlay) {
                    this.destroySettingsOverlay();
                }
                this.syncMainTitleVisibility();
            }
        });
    }

    private openHowToOverlay() {
        if (this.howToOverlay?.visible) return;
        hideHtmlText("main-title");
        this.hideMenuButtonLabels();
        this.destroyHowToOverlay(true);
        this.setStartScreenBlur(true);
        this.createHowToOverlay();
        this.howToPageIndex = 0;
        const overlay = this.howToOverlay!;
        overlay.setVisible(true);
        this.updateHowToOverlay();
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 220 });
    }

    private closeHowToOverlay() {
        const overlay = this.howToOverlay;
        if (!overlay) return;
        this.tweens.killTweensOf(overlay);
        this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                if (this.howToOverlay === overlay) {
                    this.destroyHowToOverlay();
                }
                this.setStartScreenBlur(false);
                this.syncMainTitleVisibility();
            }
        });
    }

    private destroySettingsOverlay(suppressTitleSync = false) {
        if (!this.settingsOverlay) {
            if (!suppressTitleSync) {
                this.syncMainTitleVisibility();
            }
            return;
        }
        this.tweens.killTweensOf(this.settingsOverlay);
        this.settingsOverlay.destroy();
        this.settingsOverlay = undefined;
        this.hideMainMenuSettingsHtml();
        hideHtmlButton("menu-settings-close-button");
        hideHtmlText("modal-title");
        if (!suppressTitleSync) {
            this.syncMainTitleVisibility();
        }
    }

    private destroyHowToOverlay(suppressTitleSync = false) {
        if (!this.howToOverlay) {
            if (!suppressTitleSync) {
                this.syncMainTitleVisibility();
            }
            return;
        }
        this.tweens.killTweensOf(this.howToOverlay);
        this.howToOverlay.destroy();
        this.howToOverlay = undefined;
        this.setStartScreenBlur(false);
        [
            "howto-step-title",
            "howto-step-body",
            "howto-page-indicator"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("howto-prev-button");
        hideHtmlButton("howto-next-button");
        hideHtmlButton("howto-close-button");
        hideHtmlText("modal-title");
        if (!suppressTitleSync) {
            this.syncMainTitleVisibility();
        }
    }

    private destroyBgOverlay(suppressTitleSync = false) {
        if (!this.bgOverlay) {
            if (!suppressTitleSync) {
                this.syncMainTitleVisibility();
            }
            return;
        }
        this.tweens.killTweensOf(this.bgOverlay);
        this.bgOverlay.destroy();
        this.bgOverlay = undefined;
        hideHtmlButton("menu-background-close-button");
        hideHtmlText("modal-title");
        if (!suppressTitleSync) {
            this.syncMainTitleVisibility();
        }
    }

    private setStartScreenBlur(enabled: boolean) {
        const isMobile = window.matchMedia("(pointer: coarse)").matches;
        const targets = [this.mainBg, this.bgShade, ...this.decorationCards];
        targets.forEach((target) => {
            if (!target.postFX) return;
            target.postFX.clear();
            if (enabled && !isMobile) {
                target.postFX.addBlur(2, 3, 3, 1.2, 0xffffff, 4);
            }
        });
    }

    private changeHowToPage(direction: -1 | 1): void {
        const nextIndex = Phaser.Math.Clamp(this.howToPageIndex + direction, 0, HOW_TO_PLAY_PAGES.length - 1);
        if (nextIndex === this.howToPageIndex) return;
        this.howToPageIndex = nextIndex;
        this.playButton();
        this.triggerHaptic("light");
        this.updateHowToOverlay();
    }

    private updateHowToOverlay(): void {
        if (!this.howToOverlay?.visible) return;
        const page = HOW_TO_PLAY_PAGES[this.howToPageIndex];
        const w = this.scale.width;
        const h = this.scale.height;
        const pH = 560;
        const panelTop = h * 0.5 - pH / 2;
        const panelBottom = h * 0.5 + pH / 2;
        const navButtonY = panelBottom - 88;
        const closeButtonY = panelBottom - 38;
        const hasPrev = this.howToPageIndex > 0;
        const hasNext = this.howToPageIndex < HOW_TO_PLAY_PAGES.length - 1;
        this.renderModalTitle(this.howToOverlay.getByName("title") as Phaser.GameObjects.Container, "How to play");
        showHtmlText("howto-step-title", {
            text: page.title,
            x: w * 0.5,
            y: panelTop + 116,
            fontSize: 26,
            variant: "modal",
            maxWidth: 360,
            multicolor: false,
            strokeWidth: 1.2
        });
        showHtmlText("howto-step-body", {
            text: page.body,
            x: w * 0.5,
            y: panelTop + 202,
            fontSize: 20,
            variant: "modal",
            maxWidth: 390,
            letterSpacing: 0.1,
            multicolor: false,
            color: "#FFFFFF",
            strokeColor: "#FFFFFF",
            strokeWidth: 0
        });
        showHtmlText("howto-page-indicator", {
            text: `${this.howToPageIndex + 1} / ${HOW_TO_PLAY_PAGES.length}`,
            x: w * 0.5,
            y: panelBottom - 148,
            fontSize: 18,
            variant: "modal",
            multicolor: false,
            strokeWidth: 1
        });
        showHtmlButton("howto-prev-button", {
            text: "Prev",
            x: w * 0.5 - 118,
            y: navButtonY,
            width: 120,
            height: 46,
            radius: 23,
            fontSize: 20,
            theme: "blue",
            enabled: hasPrev,
            opacity: hasPrev ? 1 : 0.72,
            onClick: () => this.changeHowToPage(-1)
        });
        showHtmlButton("howto-next-button", {
            text: hasNext ? "Next" : "Done",
            x: w * 0.5 + 118,
            y: navButtonY,
            width: 120,
            height: 46,
            radius: 23,
            fontSize: 20,
            theme: hasNext ? "blue" : "green",
            onClick: () => {
                if (hasNext) {
                    this.changeHowToPage(1);
                    return;
                }
                this.playButton();
                this.closeHowToOverlay();
            }
        });
        showHtmlButton("howto-close-button", {
            text: "Close",
            x: w * 0.5,
            y: closeButtonY,
            width: 164,
            height: 46,
            radius: 23,
            fontSize: 20,
            theme: "red",
            onClick: () => {
                this.playButton();
                this.closeHowToOverlay();
            }
        });
    }

    private createHowToOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);
        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.74).setOrigin(0, 0);
        dark.setInteractive();
        const pW = Math.min(500, w - 36);
        const pH = 560;
        const panelTop = h * 0.5 - pH / 2;
        const panelLeft = w * 0.5 - pW / 2;
        const panel = this.add.graphics();
        panel.fillStyle(0x1E272E, 0.96);
        panel.fillRoundedRect(panelLeft, panelTop, pW, pH, 24);
        const title = this.add.container(w * 0.5, panelTop + 54);
        title.name = "title";
        this.renderModalTitle(title, "How to play");
        const swipeZone = this.add.zone(w * 0.5, h * 0.5 - 6, pW - 36, pH - 170).setInteractive({ useHandCursor: true });
        let swipeStartX = 0;
        swipeZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            swipeStartX = pointer.x;
        });
        swipeZone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            const deltaX = pointer.x - swipeStartX;
            if (Math.abs(deltaX) < 42) return;
            if (deltaX < 0) {
                this.changeHowToPage(1);
            } else {
                this.changeHowToPage(-1);
            }
        });
        c.add([dark, panel, title, swipeZone]);
        c.setVisible(false);
        this.howToOverlay = c;
    }

    private createBgOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);

        const blocker = this.add.rectangle(0, 0, w, h, 0x000000, 0.76).setOrigin(0, 0);
        blocker.setInteractive();

        const topInset = this.scale.height > this.scale.width ? 132 : 54;
        const bottomInset = this.scale.height > this.scale.width ? 70 : 40;
        const pW = Math.min(650, w - 28);
        const pH = Math.min(500, h - topInset - bottomInset);
        const panelX = w * 0.5 - pW / 2;
        const panelY = topInset;

        const panel = this.add.graphics();
        panel.fillStyle(0x000000, 0.94);
        panel.fillRoundedRect(panelX, panelY, pW, pH, 28);

        const title = this.add.container(w * 0.5, panelY + 42);
        this.renderModalTitle(title, "Select theme");

        const viewportPaddingX = 24;
        const viewportTop = panelY + 92;
        const viewportBottom = panelY + pH - 82;
        const viewportW = pW - viewportPaddingX * 2;
        const viewportH = Math.max(160, viewportBottom - viewportTop);
        const viewportX = w * 0.5 - viewportW / 2;
        const grid = this.add.container(viewportX, viewportTop);
        const refreshThumbs: Array<() => void> = [];

        const backgrounds = [
            "table_bg",
            "game_bg_modern_01", "game_bg_modern_02", "game_bg_modern_03",
            "game_bg_modern_04", "game_bg_modern_05", "game_bg_modern_06"
        ];

        const gap = 0;
        const cols = 1;
        const thumbW = Math.min(152, Math.floor(viewportW - 16));
        const thumbH = Math.floor(thumbW * 0.75);
        const rowGap = 14;
        const contentHeight = Math.ceil(backgrounds.length / cols) * thumbH + Math.max(0, Math.ceil(backgrounds.length / cols) - 1) * rowGap;
        const contentWidth = thumbW;
        const gridOffsetX = Math.floor((viewportW - contentWidth) / 2);
        const minScrollY = Math.min(0, viewportH - contentHeight);
        let scrollY = 0;
        let dragStartY = 0;
        let dragScrollY = 0;
        let dragging = false;
        let scrollGestureMoved = false;
        let activePointerId: number | null = null;
        const scrollThreshold = 12;

        const viewportMaskGraphics = this.make.graphics({});
        viewportMaskGraphics.fillStyle(0xffffff);
        viewportMaskGraphics.fillRoundedRect(viewportX, viewportTop, viewportW, viewportH, 18);
        grid.setMask(viewportMaskGraphics.createGeometryMask());

        const pointerInViewport = (pointer: Phaser.Input.Pointer) =>
            pointer.x >= viewportX
            && pointer.x <= viewportX + viewportW
            && pointer.y >= viewportTop
            && pointer.y <= viewportTop + viewportH;

        const clampScroll = (nextScrollY: number) => {
            scrollY = Phaser.Math.Clamp(nextScrollY, minScrollY, 0);
            grid.y = viewportTop + scrollY;
        };

        backgrounds.forEach((bgKey, i) => {
            const ix = i % cols;
            const iy = Math.floor(i / cols);
            const x = gridOffsetX + ix * (thumbW + gap) + thumbW / 2;
            const y = iy * (thumbH + rowGap) + thumbH / 2;

            const item = this.add.container(x, y);
            const cardBg = this.add.graphics();
            cardBg.fillStyle(0x0b161c, 0.96);
            cardBg.fillRoundedRect(-thumbW / 2, -thumbH / 2, thumbW, thumbH, 12);

            const previewKey = bgKey.startsWith("game") ? bgKey.replace("game_bg", "s_bg") : bgKey;
            const img = this.add.image(0, 0, this.textures.exists(previewKey) ? previewKey : bgKey);
            img.setDisplaySize(thumbW - 8, thumbH - 8);

            const frame = this.add.graphics();

            const drawFrame = (hover: boolean, pressed: boolean) => {
                const isSelected = this.settings.background === bgKey;
                frame.clear();
                const scale = pressed ? 0.95 : (hover ? 1.05 : 1.0);
                item.setScale(scale);

                if (isSelected) {
                    frame.lineStyle(4, 0xFFFFFF, 1);
                    frame.strokeRoundedRect(-thumbW / 2 - 4, -thumbH / 2 - 4, thumbW + 8, thumbH + 8, 14);
                } else if (hover) {
                    frame.lineStyle(3, 0xFFFFFF, 0.85);
                    frame.strokeRoundedRect(-thumbW / 2 - 2, -thumbH / 2 - 2, thumbW + 4, thumbH + 4, 14);
                } else {
                    frame.lineStyle(2, 0xFFFFFF, 0.2);
                    frame.strokeRoundedRect(-thumbW / 2, -thumbH / 2, thumbW, thumbH, 12);
                }
            };
            refreshThumbs.push(() => drawFrame(false, false));
            drawFrame(false, false);

            const hit = this.add.zone(0, 0, thumbW, thumbH).setInteractive({ useHandCursor: true });

            hit.on("pointerover", () => { drawFrame(true, false); });
            hit.on("pointerout", () => { drawFrame(false, false); });
            hit.on("pointerdown", () => { drawFrame(true, true); });
            hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
                const movedDistance = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y);
                if (scrollGestureMoved || movedDistance > scrollThreshold) {
                    drawFrame(false, false);
                    return;
                }
                this.settings.background = bgKey;
                this.mainBg.setTexture(bgKey);
                this.mainBg.setDisplaySize(w, h);
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("medium");
                refreshThumbs.forEach((refresh) => refresh());
                this.closeBgSelector();
            });

            item.add([cardBg, img, frame, hit]);
            grid.add(item);
        });

        const onPointerDown = (pointer: Phaser.Input.Pointer) => {
            if (!this.bgOverlay?.visible || minScrollY === 0 || !pointerInViewport(pointer)) return;
            dragging = true;
            scrollGestureMoved = false;
            activePointerId = pointer.id;
            dragStartY = pointer.y;
            dragScrollY = scrollY;
        };

        const onPointerMove = (pointer: Phaser.Input.Pointer) => {
            if (!dragging || !pointer.isDown || activePointerId !== pointer.id) return;
            if (Math.abs(pointer.y - dragStartY) > scrollThreshold) {
                scrollGestureMoved = true;
            }
            clampScroll(dragScrollY + (pointer.y - dragStartY));
        };

        const onPointerUp = (pointer: Phaser.Input.Pointer) => {
            if (activePointerId !== pointer.id) return;
            dragging = false;
            activePointerId = null;
            this.time.delayedCall(0, () => {
                scrollGestureMoved = false;
            });
        };

        const onWheel = (_pointer: Phaser.Input.Pointer, _gos: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
            if (!this.bgOverlay?.visible || minScrollY === 0 || !pointerInViewport(_pointer)) return;
            clampScroll(scrollY - dy * 0.6);
        };

        this.input.on("pointerdown", onPointerDown);
        this.input.on("pointermove", onPointerMove);
        this.input.on("pointerup", onPointerUp);
        this.input.on("wheel", onWheel);

        // Close button
        const closeBtn = this.makeStandardButton(w * 0.5, panelY + pH - 42, 180, 46, "Close", () => {
            this.closeBgSelector();
        }, "blue", true);

        c.add([blocker, panel, title, grid, closeBtn]);
        c.setVisible(false);
        c.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.input.off("pointerdown", onPointerDown);
            this.input.off("pointermove", onPointerMove);
            this.input.off("pointerup", onPointerUp);
            this.input.off("wheel", onWheel);
            viewportMaskGraphics.destroy();
        });
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
        const pH = 520;
        const panelTop = h * 0.5 - pH / 2;
        const panelBottom = h * 0.5 + pH / 2;
        const rowBaseY = panelTop + 126;
        panel.fillStyle(0x1E272E, 0.95);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.container(w * 0.5, panelTop + 54);
        this.renderModalTitle(title, "Settings");

        const mkToggle = (label: string, key: "music" | "fx" | "haptics", y: number) => {
            const row = this.add.container(w * 0.5 - 150, h * 0.5 + y);
            const txt = this.add.text(0, 0, label, this.uiText(22, "#ECF0F1", "800")).setOrigin(0, 0.5).setAlpha(0);

            const btnObj = this.add.graphics();
            const drawToggle = (isOn: boolean) => {
                btnObj.clear();
                btnObj.fillStyle(0x000000, 0.3);
                btnObj.fillRoundedRect(226, -16, 90, 40, 20);
                btnObj.fillStyle(isOn ? 0x1E8449 : 0x922B21, 1);
                btnObj.fillRoundedRect(226, -18, 90, 40, 20);
                btnObj.fillStyle(isOn ? 0x2ECC71 : 0xE74C3C, 1);
                btnObj.fillRoundedRect(226, -20, 90, 40, 20);
                btnObj.lineStyle(3, 0xFFFFFF, 0.8);
                btnObj.strokeRoundedRect(226, -20, 90, 40, 20);
            };
            drawToggle(this.settings[key]);

            const val = this.add.text(271, -2, this.settings[key] ? "On" : "Off", {
                ...this.uiText(18, "#FFFFFF", "900", this.settings[key] ? "#196F3D" : "#943126")
            }).setOrigin(0.5).setAlpha(0);

            const rowHitZone = this.add.zone(251, 0, 90, 40).setInteractive({ useHandCursor: true });
            row.add([txt, btnObj, val, rowHitZone]);
            btnObj.setVisible(false);
            val.setVisible(false);
            rowHitZone.input!.enabled = false;

            return row;
        };

        const t1 = mkToggle("Music", "music", rowBaseY - h * 0.5);
        const t2 = mkToggle("Sound Effects", "fx", rowBaseY + 62 - h * 0.5);
        const t3 = mkToggle("Haptics", "haptics", rowBaseY + 124 - h * 0.5);

        const drawRow = this.add.container(w * 0.5 - 150, panelTop + 312);
        const drawTxt = this.add.text(0, 0, "Draw mode", this.uiText(22, "#ECF0F1", "800")).setOrigin(0, 0.5).setAlpha(0);
        const drawBtnObj = this.add.graphics();
        const drawToggle = () => {
            drawBtnObj.clear();
            drawBtnObj.fillStyle(0x000000, 0.3);
            drawBtnObj.fillRoundedRect(226, -16, 90, 40, 20);
            drawBtnObj.fillStyle(0x5C0B12, 1);
            drawBtnObj.fillRoundedRect(226, -18, 90, 40, 20);
            drawBtnObj.fillStyle(0xB3131B, 1);
            drawBtnObj.fillRoundedRect(226, -20, 90, 40, 20);
            drawBtnObj.lineStyle(3, 0xFFFFFF, 0.8);
            drawBtnObj.strokeRoundedRect(226, -20, 90, 40, 20);
        };
        drawToggle();

        const drawVal = this.add.text(271, -2, `Draw ${this.settings.drawCount}`, {
            ...this.uiText(18, "#FFFFFF", "900", "#1A0003")
        }).setOrigin(0.5).setAlpha(0);

        const drawHitZone = this.add.zone(251, 0, 90, 40).setInteractive({ useHandCursor: true });
        drawRow.add([drawTxt, drawBtnObj, drawVal, drawHitZone]);
        drawBtnObj.setVisible(false);
        drawVal.setVisible(false);
        drawHitZone.input!.enabled = false;

        // Close button
        const closeBtn = this.makeStandardButton(w * 0.5, panelBottom - 42, 180, 46, "Close", () => {
            this.closeSettingsOverlay();
        }, "blue", true);

        c.add([dark, panel, title, t1, t2, t3, drawRow, closeBtn]);
        c.setVisible(false);
        this.settingsOverlay = c;
        this.showMainMenuSettingsHtml(panelTop, panelBottom, rowBaseY);
    }

    private showMainMenuSettingsHtml(panelTop: number, panelBottom: number, rowBaseY: number): void {
        const labelX = this.scale.width * 0.5 - 66;
        const valueX = this.scale.width * 0.5 + 121;
        const settingsRows = [
            { id: "menu-settings-label-music", text: "Music", y: rowBaseY, color: "#ECF0F1", size: 22 },
            { id: "menu-settings-label-fx", text: "Sound Effects", y: rowBaseY + 62, color: "#ECF0F1", size: 22 },
            { id: "menu-settings-label-haptics", text: "Haptics", y: rowBaseY + 124, color: "#ECF0F1", size: 22 },
            { id: "menu-settings-label-draw", text: "Draw mode", y: panelTop + 312, color: "#ECF0F1", size: 22 }
        ];

        settingsRows.forEach((row) => {
            showHtmlText(row.id, {
                text: row.text,
                x: labelX,
                y: row.y,
                fontSize: row.size,
                letterSpacing: 0.4,
                multicolor: false,
                color: row.color,
                strokeColor: "#111111",
                strokeWidth: 1.5
            });
        });

        hideHtmlText("menu-settings-value-music");
        hideHtmlText("menu-settings-value-fx");
        hideHtmlText("menu-settings-value-haptics");
        showHtmlButton("menu-settings-toggle-music", {
            text: this.settings.music ? "On" : "Off",
            x: valueX,
            y: rowBaseY,
            width: 90,
            height: 40,
            radius: 20,
            fontSize: 18,
            theme: this.settings.music ? "green" : "red",
            onClick: () => {
                this.settings.music = !this.settings.music;
                this.saveSettings();
                this.playButton();
                syncBackgroundMusic(this, this.settings.music, this.settings.music);
                this.triggerHaptic("light");
                this.showMainMenuSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlButton("menu-settings-toggle-fx", {
            text: this.settings.fx ? "On" : "Off",
            x: valueX,
            y: rowBaseY + 62,
            width: 90,
            height: 40,
            radius: 20,
            fontSize: 18,
            theme: this.settings.fx ? "green" : "red",
            onClick: () => {
                this.settings.fx = !this.settings.fx;
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("light");
                this.showMainMenuSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlButton("menu-settings-toggle-haptics", {
            text: this.settings.haptics ? "On" : "Off",
            x: valueX,
            y: rowBaseY + 124,
            width: 90,
            height: 40,
            radius: 20,
            fontSize: 18,
            theme: this.settings.haptics ? "green" : "red",
            onClick: () => {
                this.settings.haptics = !this.settings.haptics;
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("light");
                this.showMainMenuSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        hideHtmlText("menu-settings-value-draw");
        showHtmlButton("menu-settings-toggle-draw", {
            text: `Draw ${this.settings.drawCount}`,
            x: valueX,
            y: panelTop + 312,
            width: 90,
            height: 40,
            radius: 20,
            fontSize: 18,
            theme: "red",
            onClick: () => {
                this.settings.drawCount = this.settings.drawCount === 1 ? 3 : 1;
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("light");
                this.showMainMenuSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlText("menu-settings-close", {
            text: "Close",
            x: this.scale.width * 0.5,
            y: panelBottom - 44,
            fontSize: 23,
            letterSpacing: 0.4,
            multicolor: false,
            color: "#FFFFFF",
            strokeColor: "#1A0003",
            strokeWidth: 1.5
        });
        hideHtmlText("menu-settings-close");
        showHtmlButton("menu-settings-close-button", {
            text: "Close",
            x: this.scale.width * 0.5,
            y: panelBottom - 44,
            width: 204,
            height: 50,
            radius: 25,
            fontSize: 23,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.closeSettingsOverlay();
            }
        });
    }

    private hideMainMenuSettingsHtml(): void {
        [
            "menu-settings-label-music",
            "menu-settings-label-fx",
            "menu-settings-label-haptics",
            "menu-settings-label-draw",
            "menu-settings-value-music",
            "menu-settings-value-fx",
            "menu-settings-value-haptics",
            "menu-settings-value-draw",
            "menu-settings-close"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("menu-settings-toggle-music");
        hideHtmlButton("menu-settings-toggle-fx");
        hideHtmlButton("menu-settings-toggle-haptics");
        hideHtmlButton("menu-settings-toggle-draw");
        hideHtmlButton("menu-settings-close-button");
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

        return cards;
    }
}
