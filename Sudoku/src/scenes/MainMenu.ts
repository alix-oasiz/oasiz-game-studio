import Phaser from "phaser";
import {
    loadSettings,
    saveSettings,
    subscribeToSettingsChange,
    type SettingKey,
    type SettingState
} from "../sudokuStorage";
import { syncBackgroundMusic, unlockBackgroundMusic } from "../utils/backgroundMusic";
import { getSharedAudioContext } from "../utils/sharedAudioContext";

const MENU_WIDTH = 620;
const MENU_HEIGHT = 860;
const FONT_FAMILY = '"Avenir Next", "Trebuchet MS", sans-serif';
const PREVIEW_BOARD_SIZE = 272;
const PREVIEW_CELL_SIZE = PREVIEW_BOARD_SIZE / 9;

const PREVIEW_SOLUTION = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9]
] as const;

const PREVIEW_GIVENS = [
    [true, false, true, false, true, false, true, false, true],
    [false, true, false, true, false, true, false, true, false],
    [true, false, false, false, true, false, false, false, true],
    [false, true, true, false, false, true, false, true, false],
    [true, false, false, true, false, true, false, false, true],
    [false, true, false, true, false, false, true, true, false],
    [true, false, false, false, true, false, false, false, true],
    [false, true, false, true, false, true, false, true, false],
    [true, false, true, false, true, false, true, false, true]
] as const;

type MenuModalKey = "settings" | null;
type HapticType = "light" | "medium" | "heavy" | "success" | "error";

interface PreviewCellView {
    background: Phaser.GameObjects.Rectangle;
    flash: Phaser.GameObjects.Rectangle;
    valueText: Phaser.GameObjects.Text;
}

interface ActionButtonView {
    background: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    subtitle?: Phaser.GameObjects.Text;
    icon?: Phaser.GameObjects.Graphics;
    hitArea: Phaser.GameObjects.Zone;
}

interface MenuToggleView {
    key: SettingKey;
    label: Phaser.GameObjects.Text;
    valueLabel: Phaser.GameObjects.Text;
    track: Phaser.GameObjects.Rectangle;
    knob: Phaser.GameObjects.Arc;
    hitArea: Phaser.GameObjects.Zone;
}

type TestWindow = Window & {
    render_game_to_text?: () => string;
    triggerHaptic?: (type: HapticType) => void;
    webkitAudioContext?: typeof AudioContext;
};

export default class MainMenu extends Phaser.Scene {

    private backdropGraphics!: Phaser.GameObjects.Graphics;
    private uiRoot!: Phaser.GameObjects.Container;
    private isMobileDevice = window.matchMedia("(pointer: coarse)").matches;
    private settings: SettingState = loadSettings();
    private activeModal: MenuModalKey = null;
    private transitionLocked = false;

    private titleGlow!: Phaser.GameObjects.Arc;
    private previewRoot!: Phaser.GameObjects.Container;
    private previewFrame!: Phaser.GameObjects.Graphics;
    private previewCursor!: Phaser.GameObjects.Graphics;
    private previewBotOrb!: Phaser.GameObjects.Arc;
    private previewSolvedChip!: Phaser.GameObjects.Graphics;
    private previewSolvedLabel!: Phaser.GameObjects.Text;
    private previewCells: PreviewCellView[][] = [];
    private previewValues: Array<Array<number | null>> = [];
    private previewQueue: Array<{ row: number; col: number }> = [];
    private previewTimer?: Phaser.Time.TimerEvent;
    private previewSelectedRow = 0;
    private previewSelectedCol = 0;

    private playButton!: ActionButtonView;
    private settingsButton!: ActionButtonView;

    private modalScrim!: Phaser.GameObjects.Rectangle;
    private modalCard!: Phaser.GameObjects.Graphics;
    private modalTitle!: Phaser.GameObjects.Text;
    private modalCloseButtonBg!: Phaser.GameObjects.Graphics;
    private modalCloseText!: Phaser.GameObjects.Text;
    private modalCloseButtonHitArea!: Phaser.GameObjects.Zone;
    private settingsHintText!: Phaser.GameObjects.Text;
    private settingsRows: MenuToggleView[] = [];

    private audioContext?: AudioContext;
    private unsubscribeSettingsSync?: () => void;

    constructor() {

        super("MainMenu");
    }

    create(): void {

        this.transitionLocked = false;
        this.activeModal = null;
        this.previewCells = [];
        this.previewValues = [];
        this.previewQueue = [];
        this.settingsRows = [];

        this.cameras.main.fadeFrom(220, 0, 0, 0);
        this.settings = loadSettings();
        this.unsubscribeSettingsSync = subscribeToSettingsChange((settings) => this.applySettingsSync(settings));
        this.drawBackdrop();
        this.createHeroSection();
        this.createButtons();
        this.bindAutomationHooks();
        this.collectUiIntoRoot();
        this.createModal();
        this.applyResponsiveLayout();
        this.resetPreviewBoard();
        this.schedulePreviewStep(420);
        this.refreshAll();
        this.syncMusicState();

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            const testWindow = window as TestWindow;
            this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
            this.stopPreviewLoop();
            this.unsubscribeSettingsSync?.();
            this.unsubscribeSettingsSync = undefined;
            delete testWindow.render_game_to_text;
        });
    }

    private drawBackdrop(): void {

        this.backdropGraphics = this.add.graphics();
        this.redrawBackdrop();
    }

    private redrawBackdrop(): void {

        const width = this.scale.width;
        const height = this.scale.height;
        const graphics = this.backdropGraphics;
        graphics.clear();
        graphics.fillGradientStyle(0x2f3744, 0x2f3744, 0x394350, 0x394350, 1);
        graphics.fillRect(0, 0, width, height);

        graphics.fillStyle(0xffffff, 0.08);
        graphics.fillCircle(width * 0.14, height * 0.16, 76);
        graphics.fillCircle(width * 0.84, height * 0.14, 128);
        graphics.fillCircle(width * 0.22, height * 0.78, 116);
        graphics.fillCircle(width * 0.88, height * 0.88, 72);

        graphics.lineStyle(4, 0xffffff, 0.14);
        graphics.strokeCircle(width * 0.18, height * 0.66, 28);
        graphics.strokeCircle(width * 0.84, height * 0.3, 18);

        graphics.fillStyle(0xffffff, 0.18);
        graphics.fillRect(width * 0.08, height * 0.34, 4, 24);
        graphics.fillRect(width * 0.08 - 10, height * 0.34 + 10, 24, 4);
        graphics.fillRect(width * 0.9, height * 0.58, 4, 22);
        graphics.fillRect(width * 0.9 - 9, height * 0.58 + 9, 22, 4);
    }

    private createHeroSection(): void {

        this.titleGlow = this.add.circle(MENU_WIDTH / 2, 340, 158, 0xffffff, 0.08);

        this.add.text(MENU_WIDTH / 2, 134, "SUDOKU", {
            fontFamily: FONT_FAMILY,
            fontSize: "62px",
            color: "#ffffff",
            fontStyle: "900",
            stroke: "#202832",
            strokeThickness: 2
        }).setOrigin(0.5);

        const heroCard = this.add.graphics();
        heroCard.fillStyle(0xffffff, 0.14);
        heroCard.lineStyle(2, 0xffffff, 0.28);
        heroCard.fillRoundedRect(160, 216, 300, 326, 40);
        heroCard.strokeRoundedRect(160, 216, 300, 326, 40);

        this.previewRoot = this.add.container(MENU_WIDTH / 2, 380);

        const previewShadow = this.add.ellipse(0, 138, 234, 24, 0x121821, 0.28);
        this.previewFrame = this.add.graphics();
        this.previewFrame.fillStyle(0xffffff, 1);
        this.previewFrame.lineStyle(2, 0xdde2e9, 1);
        this.previewFrame.fillRoundedRect(-152, -152, 304, 304, 30);
        this.previewFrame.strokeRoundedRect(-152, -152, 304, 304, 30);

        this.previewCursor = this.add.graphics();
        this.previewBotOrb = this.add.circle(134, -128, 13, 0xffffff, 0.96);
        this.previewBotOrb.setStrokeStyle(4, 0xc6d0da, 0.95);

        this.previewSolvedChip = this.add.graphics();
        this.previewSolvedChip.fillStyle(0x697584, 0.96);
        this.previewSolvedChip.fillRoundedRect(-72, -198, 144, 36, 18);
        this.previewSolvedChip.setAlpha(0);
        this.previewSolvedLabel = this.add.text(0, -180, "GRID READY", {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            color: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.previewSolvedLabel.setAlpha(0);

        this.previewRoot.add([previewShadow, this.previewFrame]);

        for (let row = 0; row < 9; row++) {
            const viewRow: PreviewCellView[] = [];

            for (let col = 0; col < 9; col++) {
                const localX = -120 + col * PREVIEW_CELL_SIZE + PREVIEW_CELL_SIZE / 2;
                const localY = -120 + row * PREVIEW_CELL_SIZE + PREVIEW_CELL_SIZE / 2;
                const background = this.add.rectangle(
                    localX,
                    localY,
                    PREVIEW_CELL_SIZE - 1.5,
                    PREVIEW_CELL_SIZE - 1.5,
                    0xffffff,
                    1
                );
                background.setStrokeStyle(1, 0xd9dee5, 0.96);

                const flash = this.add.rectangle(
                    localX,
                    localY,
                    PREVIEW_CELL_SIZE - 6,
                    PREVIEW_CELL_SIZE - 6,
                    0xf1f5f8,
                    1
                );
                flash.setAlpha(0);

                const valueText = this.add.text(localX, localY, "", {
                    fontFamily: FONT_FAMILY,
                    fontSize: "20px",
                    color: "#2f4a5a",
                    fontStyle: "bold"
                }).setOrigin(0.5);

                this.previewRoot.add([background, flash, valueText]);
                viewRow.push({ background, flash, valueText });
            }

            this.previewCells.push(viewRow);
        }

        this.previewRoot.add([
            this.previewCursor,
            this.previewSolvedChip,
            this.previewSolvedLabel,
            this.previewBotOrb
        ]);

        this.tweens.add({
            targets: [this.titleGlow, this.previewRoot],
            y: "-=10",
            duration: 2400,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1
        });
    }

    private createButtons(): void {

        this.playButton = this.createActionButton({
            centerX: MENU_WIDTH / 2,
            centerY: 654,
            width: 438,
            height: 78,
            label: "Play"
        });
        this.playButton.hitArea.on("pointerdown", () => this.handlePlayAction());
        this.playButton.hitArea.on("pointerover", () => this.tweenButton(this.playButton, true));
        this.playButton.hitArea.on("pointerout", () => this.tweenButton(this.playButton, false));

        this.settingsButton = this.createActionButton({
            centerX: MENU_WIDTH / 2,
            centerY: 748,
            width: 252,
            height: 64,
            label: "Settings"
        });
        this.settingsButton.hitArea.on("pointerdown", () => this.openSettings());
        this.settingsButton.hitArea.on("pointerover", () => this.tweenButton(this.settingsButton, true));
        this.settingsButton.hitArea.on("pointerout", () => this.tweenButton(this.settingsButton, false));
    }

    private createActionButton(config: {
        centerX: number;
        centerY: number;
        width: number;
        height: number;
        label: string;
        subtitle?: string;
        icon?: boolean;
    }): ActionButtonView {

        const background = this.add.graphics({ x: config.centerX, y: config.centerY });
        const hasIcon = Boolean(config.icon);
        const labelSize = config.subtitle ? "30px" : config.width >= 400 ? "34px" : hasIcon ? "27px" : "24px";
        const labelX = config.centerX + (hasIcon ? 18 : 0);
        const label = this.add.text(labelX, config.centerY - (config.subtitle ? 10 : 0), config.label, {
            fontFamily: FONT_FAMILY,
            fontSize: labelSize,
            color: config.subtitle ? "#27313d" : "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5);

        const subtitle = config.subtitle
            ? this.add.text(config.centerX, config.centerY + 18, config.subtitle, {
                fontFamily: FONT_FAMILY,
                fontSize: "14px",
                color: "#7b8692"
            }).setOrigin(0.5)
            : undefined;

        const icon = config.icon ? this.add.graphics({ x: config.centerX - 62, y: config.centerY }) : undefined;
        if (config.icon) {
            this.drawSettingsIcon(icon, 0xffffff);
        }
        const hitArea = this.add.zone(config.centerX, config.centerY, config.width, config.height);
        hitArea.setInteractive({ useHandCursor: true });

        return {
            background,
            label,
            subtitle,
            icon,
            hitArea
        };
    }

    private createModal(): void {

        this.modalScrim = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x05080d, 0.74);
        this.modalScrim.setInteractive();
        this.modalScrim.setDepth(400);
        this.modalScrim.on("pointerdown", () => undefined);

        this.modalCard = this.add.graphics();
        this.modalCard.setDepth(401);
        this.modalTitle = this.add.text(this.scale.width / 2, this.scale.height / 2, "Settings", {
            fontFamily: FONT_FAMILY,
            fontSize: "28px",
            color: "#f4f7fb",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.modalTitle.setDepth(402);

        this.modalCloseButtonBg = this.add.graphics();
        this.modalCloseButtonBg.setDepth(402);

        this.modalCloseText = this.add.text(this.scale.width / 2, this.scale.height / 2, "Close", {
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            color: "#eef3f8",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.modalCloseText.setDepth(403);

        this.modalCloseButtonHitArea = this.add.zone(this.scale.width / 2, this.scale.height / 2, 156, 46);
        this.modalCloseButtonHitArea.setDepth(404);
        this.modalCloseButtonHitArea.setInteractive({ useHandCursor: true });
        this.modalCloseButtonHitArea.on("pointerdown", () => {
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.setModal(null);
        });

        this.settingsHintText = this.add.text(this.scale.width / 2, this.scale.height / 2, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            color: "#8f9dab",
            align: "center"
        }).setOrigin(0.5);
        this.settingsHintText.setDepth(402);

        const settingsConfig: Array<{ key: SettingKey; label: string }> = [
            { key: "music", label: "Music" },
            { key: "fx", label: "FX" },
            { key: "haptics", label: "Haptics" }
        ];

        for (const item of settingsConfig) {
            const label = this.add.text(0, 0, item.label, {
                fontFamily: FONT_FAMILY,
                fontSize: "22px",
                color: "#eef3f8",
                fontStyle: "bold"
            }).setOrigin(0, 0.5);

            const valueLabel = this.add.text(0, 0, "", {
                fontFamily: FONT_FAMILY,
                fontSize: "16px",
                color: "#7f8d9c"
            }).setOrigin(1, 0.5);

            label.setDepth(402);
            valueLabel.setDepth(402);

            const track = this.add.rectangle(0, 0, 74, 34, 0x151b23, 1);
            track.setStrokeStyle(2, 0x394452, 1);
            track.setDepth(402);
            const knob = this.add.circle(0, 0, 13, 0xffffff, 1);
            knob.setDepth(403);
            const hitArea = this.add.zone(0, 0, 300, 54);
            hitArea.setInteractive({ useHandCursor: true });
            hitArea.setDepth(404);
            hitArea.on("pointerdown", () => this.toggleSetting(item.key));

            this.settingsRows.push({
                key: item.key,
                label,
                valueLabel,
                track,
                knob,
                hitArea
            });
        }

        this.setModal(null, false);
    }

    private collectUiIntoRoot(): void {

        this.uiRoot = this.add.container(0, 0);
        const children = this.children.list.filter((gameObject) =>
            gameObject !== this.backdropGraphics && gameObject !== this.uiRoot
        );
        this.uiRoot.add(children as Phaser.GameObjects.GameObject[]);
    }

    private applyResponsiveLayout(): void {

        if (!this.uiRoot) {
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;
        const safeTop = this.isMobileDevice ? 120 : 40;
        const safeBottom = this.isMobileDevice ? 18 : 18;
        const padding = width >= 960 ? 22 : 12;
        const availableWidth = Math.max(260, width - padding * 2);
        const availableHeight = Math.max(420, height - padding * 2 - safeTop - safeBottom);
        const rawScale = Math.min(availableWidth / MENU_WIDTH, availableHeight / MENU_HEIGHT);
        const scale = Phaser.Math.Clamp(rawScale, 0.54, width >= 960 ? 1.12 : 1);
        const scaledWidth = MENU_WIDTH * scale;
        const scaledHeight = MENU_HEIGHT * scale;
        const centeredY = Math.round((height - scaledHeight) / 2);
        const mobileOffset = this.isMobileDevice ? 20 : 0;
        const maxY = Math.max(safeTop, height - scaledHeight - safeBottom);
        const layoutY = Phaser.Math.Clamp(centeredY + mobileOffset, safeTop, maxY);

        this.uiRoot.setScale(scale);
        this.uiRoot.setPosition(Math.round((width - scaledWidth) / 2), Math.round(layoutY));
    }

    private handleResize(): void {

        this.redrawBackdrop();
        this.applyResponsiveLayout();
        this.refreshModal();
    }

    private bindAutomationHooks(): void {

        const testWindow = window as TestWindow;
        testWindow.render_game_to_text = () => this.renderGameToText();
    }

    private refreshAll(): void {

        this.settings = loadSettings();
        this.refreshButtons();
        this.refreshModal();
    }

    private refreshButtons(): void {

        const buttonLocked = this.transitionLocked || this.activeModal !== null;

        this.playButton.background.clear();
        this.playButton.background.fillStyle(0xffffff, 0.98);
        this.playButton.background.lineStyle(2, 0xe1e5ea, 1);
        this.playButton.background.fillRoundedRect(-219, -39, 438, 78, 26);
        this.playButton.background.strokeRoundedRect(-219, -39, 438, 78, 26);
        this.playButton.label.setColor("#28313b");
        this.playButton.subtitle?.setColor("#7b8692");
        if (buttonLocked) {
            this.playButton.hitArea.disableInteractive();
        } else {
            this.playButton.hitArea.setInteractive({ useHandCursor: true });
        }

        this.settingsButton.background.clear();
        this.settingsButton.background.fillStyle(0xffffff, 0.2);
        this.settingsButton.background.lineStyle(2, 0xffffff, 0.36);
        this.settingsButton.background.fillRoundedRect(-126, -32, 252, 64, 24);
        this.settingsButton.background.strokeRoundedRect(-126, -32, 252, 64, 24);
        this.settingsButton.label.setColor("#ffffff");
        this.drawSettingsIcon(this.settingsButton.icon, 0xffffff);
        if (buttonLocked) {
            this.settingsButton.hitArea.disableInteractive();
        } else {
            this.settingsButton.hitArea.setInteractive({ useHandCursor: true });
        }
    }

    private refreshModal(): void {
        this.layoutModal();
    }

    private layoutModal(): void {

        const visible = this.activeModal === "settings";
        const centerX = Math.round(this.scale.width / 2);
        const centerY = Math.round(this.scale.height / 2);
        const cardWidth = Math.min(420, Math.max(320, this.scale.width - 52));
        const cardHeight = 336;
        const cardLeft = centerX - cardWidth / 2;
        const cardRight = centerX + cardWidth / 2;

        this.modalScrim.setPosition(centerX, centerY);
        this.modalScrim.setSize(this.scale.width, this.scale.height);
        this.modalTitle.setPosition(centerX, centerY - 112);
        this.modalCloseText.setPosition(centerX, centerY + 126);
        this.modalCloseButtonHitArea.setPosition(centerX, centerY + 126);

        this.modalCard.clear();
        this.modalCloseButtonBg.clear();
        if (visible) {
            this.modalCard.fillStyle(0x0d1218, 0.26);
            this.modalCard.fillRoundedRect(cardLeft + 10, centerY - cardHeight / 2 + 12, cardWidth - 20, cardHeight - 8, 28);
            this.modalCard.fillStyle(0x222a35, 0.98);
            this.modalCard.lineStyle(2, 0x485565, 1);
            this.modalCard.fillRoundedRect(cardLeft, centerY - cardHeight / 2, cardWidth, cardHeight, 28);
            this.modalCard.strokeRoundedRect(cardLeft, centerY - cardHeight / 2, cardWidth, cardHeight, 28);

            this.modalCloseButtonBg.fillStyle(0x5f6c7b, 1);
            this.modalCloseButtonBg.lineStyle(2, 0x8f99a6, 1);
            this.modalCloseButtonBg.fillRoundedRect(centerX - 78, centerY + 103, 156, 46, 18);
            this.modalCloseButtonBg.strokeRoundedRect(centerX - 78, centerY + 103, 156, 46, 18);
        }

        this.settingsRows.forEach((row, index) => {
            const y = centerY - 40 + index * 62;
            const trackX = cardRight - 62;
            row.label.setPosition(cardLeft + 28, y);
            row.valueLabel.setPosition(centerX + 42, y);
            row.track.setPosition(trackX, y);
            row.knob.setPosition(trackX + (this.settings[row.key] ? 18 : -18), y);
            row.hitArea.setPosition(centerX, y);
            row.hitArea.setSize(300, 54);

            if (visible) {
                row.valueLabel.setText(this.settings[row.key] ? "On" : "Off");
                row.valueLabel.setColor(this.settings[row.key] ? "#eef3f8" : "#667280");
                row.track.setFillStyle(this.settings[row.key] ? 0x5f6c7b : 0x151b23, 1);
                row.track.setStrokeStyle(2, this.settings[row.key] ? 0x8f99a6 : 0x394452, 1);
                row.knob.setFillStyle(this.settings[row.key] ? 0xfafcff : 0xc4ccd4, 1);
            }
        });
    }

    private setModal(modal: MenuModalKey, animate: boolean = true): void {

        const wasOpen = this.activeModal !== null;
        const willOpen = modal !== null;

        // For close animation: delay state change so layoutModal doesn't clear graphics
        const isAnimatedClose = animate && !willOpen && wasOpen;

        if (!isAnimatedClose) {
            this.activeModal = modal;
            this.refreshButtons();
            this.layoutModal();
        }

        if (!animate) {
            this.applyModalVisibility(willOpen);
            return;
        }

        const allElements = this.getModalElements();

        // Kill any running modal tweens
        this.tweens.killTweensOf(this.modalScrim);
        allElements.forEach((el) => this.tweens.killTweensOf(el));

        // Center point for the pop origin
        const cx = Math.round(this.scale.width / 2);
        const cy = Math.round(this.scale.height / 2);
        const S0 = 0.35;

        if (willOpen && !wasOpen) {
            // --- POP OPEN (whole menu pops from center as one unit) ---
            this.applyModalVisibility(true);
            this.modalScrim.setAlpha(0);

            this.tweens.add({
                targets: this.modalScrim,
                alpha: 1,
                duration: 160,
                ease: "Sine.Out"
            });

            allElements.forEach((el: any) => {
                const finalX = el.x;
                const finalY = el.y;
                el.setAlpha(0);
                el.setScale(S0);
                el.x = cx + (finalX - cx) * S0;
                el.y = cy + (finalY - cy) * S0;

                this.tweens.add({
                    targets: el,
                    alpha: 1,
                    scaleX: 1,
                    scaleY: 1,
                    x: finalX,
                    y: finalY,
                    duration: 380,
                    ease: "Back.Out",
                    easeParams: [1.8]
                });
            });
        } else if (isAnimatedClose) {
            // --- POP CLOSE (shrink to center as one unit) ---
            // Disable interactivity immediately but keep graphics intact
            this.modalCloseButtonHitArea.disableInteractive();
            this.settingsRows.forEach((row) => { row.hitArea.disableInteractive(); });

            const S1 = 0.55;
            const origPositions = allElements.map((el: any) => ({ x: el.x, y: el.y }));

            allElements.forEach((el: any) => {
                const targetX = cx + (el.x - cx) * S1;
                const targetY = cy + (el.y - cy) * S1;
                this.tweens.add({
                    targets: el,
                    alpha: 0,
                    scaleX: S1,
                    scaleY: S1,
                    x: targetX,
                    y: targetY,
                    duration: 200,
                    ease: "Back.In",
                    easeParams: [1.6]
                });
            });

            this.tweens.add({
                targets: this.modalScrim,
                alpha: 0,
                duration: 200,
                ease: "Sine.In",
                onComplete: () => {
                    // Now commit the state change and clear graphics
                    this.activeModal = modal;
                    this.refreshButtons();
                    this.layoutModal();
                    this.applyModalVisibility(false);
                    allElements.forEach((el: any, i: number) => {
                        el.setScale(1);
                        el.x = origPositions[i].x;
                        el.y = origPositions[i].y;
                    });
                }
            });
        } else {
            this.applyModalVisibility(willOpen);
        }
    }

    private getModalElements(): Phaser.GameObjects.GameObject[] {
        const elements: Phaser.GameObjects.GameObject[] = [
            this.modalCard, this.modalTitle,
            this.modalCloseButtonBg, this.modalCloseText,
        ];
        this.settingsRows.forEach((row) => {
            elements.push(row.label, row.valueLabel, row.track, row.knob);
        });
        return elements;
    }

    private applyModalVisibility(visible: boolean): void {
        this.modalScrim.setVisible(visible);
        this.modalCard.setVisible(visible);
        this.modalTitle.setVisible(visible);
        this.modalCloseButtonBg.setVisible(visible);
        this.modalCloseText.setVisible(visible);
        this.modalCloseButtonHitArea.setVisible(visible);
        this.settingsHintText.setVisible(false);

        this.settingsRows.forEach((row) => {
            row.label.setVisible(visible);
            row.valueLabel.setVisible(visible);
            row.track.setVisible(visible);
            row.knob.setVisible(visible);
            row.hitArea.setVisible(visible);

            if (visible) {
                row.hitArea.setInteractive({ useHandCursor: true });
            } else {
                row.hitArea.disableInteractive();
            }
        });

        if (visible) {
            this.modalCloseButtonHitArea.setInteractive({ useHandCursor: true });
        } else {
            this.modalCloseButtonHitArea.disableInteractive();
        }
    }

    private openSettings(): void {

        if (this.transitionLocked) {
            return;
        }

        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.setModal("settings");
    }

    private toggleSetting(key: SettingKey): void {

        this.ensureAudioUnlocked();
        this.settings[key] = !this.settings[key];
        saveSettings(this.settings);
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
    }

    private applySettingsSync(settings: SettingState): void {

        this.settings = {
            music: settings.music,
            fx: settings.fx,
            haptics: settings.haptics
        };

        if (!this.playButton || !this.settingsButton || !this.modalCard) {
            this.syncMusicState();
            return;
        }

        this.refreshAll();
        this.syncMusicState();
    }

    private handlePlayAction(): void {

        if (this.transitionLocked || this.activeModal !== null) {
            return;
        }

        this.transitionLocked = true;
        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("medium");

        this.tweens.add({
            targets: this.uiRoot,
            alpha: 0,
            scaleX: this.uiRoot.scaleX * 0.98,
            scaleY: this.uiRoot.scaleY * 0.98,
            duration: 180,
            ease: "Quad.Out"
        });

        this.time.delayedCall(170, () => {
            this.scene.start("Level");
        });
    }

    private tweenButton(button: ActionButtonView, hovered: boolean): void {

        if (this.activeModal !== null || this.transitionLocked) {
            return;
        }

        const targets: Phaser.GameObjects.GameObject[] = [button.background, button.label, button.hitArea];
        if (button.subtitle) {
            targets.push(button.subtitle);
        }
        if (button.icon) {
            targets.push(button.icon);
        }

        this.tweens.add({
            targets,
            scaleX: hovered ? 1.02 : 1,
            scaleY: hovered ? 1.02 : 1,
            duration: 120,
            ease: "Quad.Out"
        });
    }

    private drawSettingsIcon(icon: Phaser.GameObjects.Graphics | undefined, color: number): void {

        if (!icon) {
            return;
        }

        icon.clear();
        icon.lineStyle(2.4, color, 1);
        icon.strokeCircle(0, 0, 8);
        icon.strokeCircle(0, 0, 2.8);
        for (let index = 0; index < 8; index++) {
            const angle = Phaser.Math.DegToRad(index * 45);
            icon.beginPath();
            icon.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
            icon.lineTo(Math.cos(angle) * 14, Math.sin(angle) * 14);
            icon.strokePath();
        }
    }

    private resetPreviewBoard(): void {

        this.previewValues = PREVIEW_SOLUTION.map((row, rowIndex) => row.map((value, colIndex) =>
            PREVIEW_GIVENS[rowIndex][colIndex] ? value : null
        ));
        this.previewQueue = Phaser.Utils.Array.Shuffle(
            PREVIEW_SOLUTION.flatMap((row, rowIndex) => row.flatMap((_, colIndex) =>
                PREVIEW_GIVENS[rowIndex][colIndex] ? [] : [{ row: rowIndex, col: colIndex }]
            ))
        );
        this.previewSelectedRow = this.previewQueue[0]?.row ?? 0;
        this.previewSelectedCol = this.previewQueue[0]?.col ?? 0;
        this.previewSolvedChip.setAlpha(0);
        this.previewSolvedLabel.setAlpha(0);
        this.refreshPreviewBoard();
        this.movePreviewCursor(this.previewSelectedRow, this.previewSelectedCol, false);
    }

    private refreshPreviewBoard(): void {

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const given = PREVIEW_GIVENS[row][col];
                const selected = row === this.previewSelectedRow && col === this.previewSelectedCol;
                const currentValue = this.previewValues[row]?.[col] ?? null;
                const view = this.previewCells[row][col];
                const fill = selected
                    ? 0x717c8d
                    : given
                        ? 0xf4f6f8
                        : currentValue !== null
                            ? 0xebeff3
                            : 0xffffff;

                view.background.setFillStyle(fill, 1);
                view.valueText.setText(currentValue === null ? "" : String(currentValue));
                view.valueText.setColor(
                    selected
                        ? "#ffffff"
                        : given
                            ? "#2f3944"
                            : currentValue !== null
                                ? "#5f6a78"
                                : "#2f3944"
                );
                view.valueText.setVisible(currentValue !== null);
            }
        }
    }

    private schedulePreviewStep(delay: number): void {

        this.previewTimer?.remove(false);
        this.previewTimer = this.time.delayedCall(delay, () => this.runPreviewStep());
    }

    private runPreviewStep(): void {

        const next = this.previewQueue.shift();

        if (!next) {
            this.previewSolvedLabel.setText("GRID READY");
            this.previewSolvedChip.setAlpha(1);
            this.previewSolvedLabel.setAlpha(1);
            this.tweens.add({
                targets: [this.previewSolvedChip, this.previewSolvedLabel],
                scaleX: { from: 0.88, to: 1 },
                scaleY: { from: 0.88, to: 1 },
                alpha: { from: 0, to: 1 },
                duration: 260,
                ease: "Back.Out"
            });
            this.schedulePreviewStep(980);
            this.time.delayedCall(760, () => this.resetPreviewBoard());
            return;
        }

        this.previewSelectedRow = next.row;
        this.previewSelectedCol = next.col;
        this.refreshPreviewBoard();
        this.movePreviewCursor(next.row, next.col, true);

        this.time.delayedCall(120, () => {
            this.previewValues[next.row][next.col] = PREVIEW_SOLUTION[next.row][next.col];
            this.refreshPreviewBoard();
            this.animatePreviewCell(next.row, next.col);
            this.schedulePreviewStep(165);
        });
    }

    private animatePreviewCell(row: number, col: number): void {

        const view = this.previewCells[row][col];
        this.tweens.killTweensOf(view.flash);
        this.tweens.killTweensOf(view.valueText);
        view.flash.setAlpha(0.72);
        view.flash.setScale(0.72);

        this.tweens.add({
            targets: view.flash,
            alpha: 0,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: 240,
            ease: "Quad.Out"
        });

        this.tweens.add({
            targets: view.valueText,
            scaleX: 1.24,
            scaleY: 1.24,
            duration: 150,
            ease: "Back.Out",
            yoyo: true
        });
    }

    private movePreviewCursor(row: number, col: number, animated: boolean): void {

        const x = -120 + col * PREVIEW_CELL_SIZE + PREVIEW_CELL_SIZE / 2;
        const y = -120 + row * PREVIEW_CELL_SIZE + PREVIEW_CELL_SIZE / 2;
        this.previewCursor.clear();
        this.previewCursor.lineStyle(3, 0xcdd5dd, 1);
        this.previewCursor.strokeRoundedRect(-13, -13, 26, 26, 8);
        this.previewCursor.setPosition(animated ? this.previewCursor.x : x, animated ? this.previewCursor.y : y);

        if (!animated) {
            this.previewBotOrb.setPosition(x + 20, y - 18);
            return;
        }

        this.tweens.add({
            targets: this.previewCursor,
            x,
            y,
            duration: 150,
            ease: "Quad.Out"
        });
        this.tweens.add({
            targets: this.previewBotOrb,
            x: x + 20,
            y: y - 18,
            duration: 180,
            ease: "Sine.Out"
        });
    }

    private stopPreviewLoop(): void {

        this.previewTimer?.remove(false);
        this.previewTimer = undefined;
    }

    private ensureAudioUnlocked(): void {

        unlockBackgroundMusic();
        const context = this.getAudioContext();
        if (context && context.state === "suspended") {
            void context.resume();
        }
    }

    private getAudioContext(): AudioContext | undefined {

        this.audioContext ??= getSharedAudioContext();
        return this.audioContext;
    }

    private playTone(frequency: number, durationMs: number, volume: number, type: "fx" | "music" = "fx"): void {

        if (type === "fx" && !this.settings.fx) {
            return;
        }

        if (type === "music" && !this.settings.music) {
            return;
        }

        const context = this.getAudioContext();
        if (!context || context.state === "suspended") {
            return;
        }

        const start = context.currentTime;
        const gain = context.createGain();
        const oscillator = context.createOscillator();
        const durationSeconds = durationMs / 1000;
        const isMusic = type === "music";
        const attack = isMusic ? Math.min(0.42, durationSeconds * 0.35) : 0.02;
        const releaseStart = isMusic
            ? Math.max(start + attack + 0.12, start + durationSeconds * 0.62)
            : start + durationSeconds;

        oscillator.type = isMusic ? "triangle" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseStart);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(releaseStart + (isMusic ? 0.18 : 0.02));
    }

    private playFx(kind: "tap"): void {

        if (kind === "tap") {
            this.playTone(680, 80, 0.025, "fx");
        }
    }

    private syncMusicState(): void {

        if (this.settings.music) {
            this.startMusicLoop();
            return;
        }

        this.stopMusicLoop();
    }

    private startMusicLoop(): void {

        syncBackgroundMusic(true);
    }

    private stopMusicLoop(): void {

        syncBackgroundMusic(false);
    }

    private triggerPlatformHaptic(type: HapticType): void {

        if (!this.settings.haptics) {
            return;
        }

        const testWindow = window as TestWindow;
        if (typeof testWindow.triggerHaptic === "function") {
            testWindow.triggerHaptic(type);
        }
    }

    private renderGameToText(): string {

        return JSON.stringify({
            scene: "menu",
            modal: this.activeModal,
            settings: this.settings,
            preview: {
                selected: {
                    row: this.previewSelectedRow + 1,
                    col: this.previewSelectedCol + 1
                },
                remaining: this.previewQueue.length,
                filled: this.previewValues.flat().filter((value) => value !== null).length
            }
        });
    }
}
