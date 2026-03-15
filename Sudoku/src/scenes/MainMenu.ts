import Phaser from "phaser";
import {
    loadLevelBestScores,
    loadSettings,
    saveSettings,
    subscribeToSettingsChange,
    type SettingKey,
    type SettingState
} from "../sudokuStorage";
import {
    SUDOKU_LEVELS,
    clampLevelNumber,
    getSudokuLevel,
    type LevelSceneData
} from "../sudokuLevels";
import { syncBackgroundMusic, unlockBackgroundMusic } from "../utils/backgroundMusic";
import { getSharedAudioContext } from "../utils/sharedAudioContext";

const MENU_WIDTH = 620;
const MENU_HEIGHT = 980;
const MENU_LEVELS_HEIGHT = 1220;
const MOBILE_MENU_HEIGHT = 980;
const MOBILE_MENU_LEVELS_HEIGHT = 1320;
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
    width: number;
    height: number;
}

interface LevelCardView {
    levelNumber: number;
    background: Phaser.GameObjects.Graphics;
    levelLabel: Phaser.GameObjects.Text;
    titleLabel: Phaser.GameObjects.Text;
    bestLabel: Phaser.GameObjects.Text;
    hitArea: Phaser.GameObjects.Zone;
    hovered: boolean;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
}

interface MenuLayoutConfig {
    menuHeight: number;
    titleY: number;
    titleGlowY: number;
    heroCardTop: number;
    previewY: number;
    homeButtonsY: number;
    homeSettingsY: number;
    summaryY: number;
    selectorColumns: number;
    selectorCardWidth: number;
    selectorCardHeight: number;
    selectorGapX: number;
    selectorGapY: number;
    selectorStartY: number;
    playButtonY: number;
    playButtonWidth: number;
    playButtonHeight: number;
    settingsButtonY: number;
    settingsButtonWidth: number;
    settingsButtonHeight: number;
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
    private levelSelectionOpen = false;
    private levelSelectionProgress = 0;
    private levelSelectionAnimating = false;

    private titleGlow!: Phaser.GameObjects.Arc;
    private previewRoot!: Phaser.GameObjects.Container;
    private previewFrame!: Phaser.GameObjects.Graphics;
    private previewCursor!: Phaser.GameObjects.Graphics;
    private previewBotOrb!: Phaser.GameObjects.Arc;
    private levelSummaryText!: Phaser.GameObjects.Text;
    private previewCells: PreviewCellView[][] = [];
    private previewValues: Array<Array<number | null>> = [];
    private previewQueue: Array<{ row: number; col: number }> = [];
    private previewTimer?: Phaser.Time.TimerEvent;
    private previewSelectedRow = 0;
    private previewSelectedCol = 0;
    private selectedLevel = 1;
    private levelCards: LevelCardView[] = [];
    private levelBestScores = loadLevelBestScores();

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
    private levelSelectionTween?: Phaser.Tweens.Tween;

    constructor() {

        super("MainMenu");
    }

    init(data: LevelSceneData = {}): void {

        this.selectedLevel = typeof data.level === "number" && Number.isFinite(data.level)
            ? clampLevelNumber(data.level)
            : 1;
    }

    create(): void {

        this.transitionLocked = false;
        this.levelSelectionOpen = false;
        this.levelSelectionProgress = 0;
        this.levelSelectionAnimating = false;
        this.activeModal = null;
        this.previewCells = [];
        this.previewValues = [];
        this.previewQueue = [];
        this.levelCards = [];
        this.levelBestScores = loadLevelBestScores();
        this.settingsRows = [];

        this.cameras.main.fadeFrom(220, 0, 0, 0);
        this.settings = loadSettings();
        this.unsubscribeSettingsSync = subscribeToSettingsChange((settings) => this.applySettingsSync(settings));
        this.drawBackdrop();
        this.createHeroSection();
        this.createLevelSelector();
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
            this.levelSelectionTween?.stop();
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

    private getLayoutConfig(forceLevelSelection: boolean = this.levelSelectionOpen): MenuLayoutConfig {

        if (this.isMobileDevice) {
            return {
                menuHeight: forceLevelSelection ? MOBILE_MENU_LEVELS_HEIGHT : MOBILE_MENU_HEIGHT,
                titleY: 108,
                titleGlowY: 292,
                heroCardTop: 154,
                previewY: 320,
                homeButtonsY: 640,
                homeSettingsY: 726,
                summaryY: 534,
                selectorColumns: 3,
                selectorCardWidth: 172,
                selectorCardHeight: 58,
                selectorGapX: 16,
                selectorGapY: 18,
                selectorStartY: 590,
                playButtonY: 1162,
                playButtonWidth: 438,
                playButtonHeight: 72,
                settingsButtonY: 1242,
                settingsButtonWidth: 236,
                settingsButtonHeight: 56
            };
        }

        return {
            menuHeight: forceLevelSelection ? MENU_LEVELS_HEIGHT : MENU_HEIGHT,
            titleY: 110,
            titleGlowY: 284,
            heroCardTop: 150,
            previewY: 314,
            homeButtonsY: 560,
            homeSettingsY: 642,
            summaryY: 536,
            selectorColumns: 4,
            selectorCardWidth: 132,
            selectorCardHeight: 68,
            selectorGapX: 20,
            selectorGapY: 18,
            selectorStartY: 600,
            playButtonY: 1104,
            playButtonWidth: 438,
            playButtonHeight: 72,
            settingsButtonY: 1178,
            settingsButtonWidth: 224,
            settingsButtonHeight: 56
        };
    }

    private createHeroSection(): void {

        const layout = this.getLayoutConfig(true);

        this.titleGlow = this.add.circle(MENU_WIDTH / 2, layout.titleGlowY, 158, 0xffffff, 0.08);

        this.add.text(MENU_WIDTH / 2, layout.titleY, "SUDOKU", {
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
        heroCard.fillRoundedRect(160, layout.heroCardTop, 300, 326, 40);
        heroCard.strokeRoundedRect(160, layout.heroCardTop, 300, 326, 40);

        this.previewRoot = this.add.container(MENU_WIDTH / 2, layout.previewY);

        const previewShadow = this.add.ellipse(0, 138, 234, 24, 0x121821, 0.28);
        this.previewFrame = this.add.graphics();
        this.previewFrame.fillStyle(0xffffff, 1);
        this.previewFrame.lineStyle(2, 0xdde2e9, 1);
        this.previewFrame.fillRoundedRect(-152, -152, 304, 304, 30);
        this.previewFrame.strokeRoundedRect(-152, -152, 304, 304, 30);

        this.previewCursor = this.add.graphics();
        this.previewBotOrb = this.add.circle(134, -128, 13, 0xffffff, 0.96);
        this.previewBotOrb.setStrokeStyle(4, 0xc6d0da, 0.95);

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
            this.previewBotOrb
        ]);

        this.levelSummaryText = this.add.text(MENU_WIDTH / 2, layout.summaryY, "", {
            fontFamily: FONT_FAMILY,
            fontSize: this.isMobileDevice ? "16px" : "18px",
            color: "#e4e9ef",
            fontStyle: "600",
            align: "center",
            wordWrap: { width: this.isMobileDevice ? 440 : 560 }
        }).setOrigin(0.5);
        this.levelSummaryText.setLineSpacing(this.isMobileDevice ? 8 : 4);

        this.tweens.add({
            targets: [this.titleGlow, this.previewRoot],
            y: "-=10",
            duration: 2400,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1
        });
    }

    private createLevelSelector(): void {

        const layout = this.getLayoutConfig();
        const cardWidth = layout.selectorCardWidth;
        const cardHeight = layout.selectorCardHeight;
        const gapX = layout.selectorGapX;
        const gapY = layout.selectorGapY;
        const columns = layout.selectorColumns;
        const startY = layout.selectorStartY;
        const titleOffsetY = 0;
        const titleFontSize = this.isMobileDevice ? "17px" : "18px";
        const totalLevels = SUDOKU_LEVELS.length;

        for (const level of SUDOKU_LEVELS) {
            const index = level.number - 1;
            const col = index % columns;
            const row = Math.floor(index / columns);
            const rowStartIndex = row * columns;
            const itemsInRow = Math.min(columns, totalLevels - rowStartIndex);
            const rowWidth = itemsInRow * cardWidth + Math.max(0, itemsInRow - 1) * gapX;
            const rowStartX = MENU_WIDTH / 2 - rowWidth / 2 + cardWidth / 2;
            const centerX = rowStartX + col * (cardWidth + gapX);
            const centerY = startY + row * (cardHeight + gapY);

            const background = this.add.graphics({ x: centerX, y: centerY });
            const levelLabel = this.add.text(centerX, centerY, "", {
                fontFamily: FONT_FAMILY,
                fontSize: "1px",
                color: "#aeb7c2",
                fontStyle: "bold"
            }).setOrigin(0.5);
            const titleLabel = this.add.text(centerX, centerY + titleOffsetY, level.title, {
                fontFamily: FONT_FAMILY,
                fontSize: titleFontSize,
                color: "#ffffff",
                fontStyle: "bold"
            }).setOrigin(0.5);
            const bestLabel = this.add.text(centerX, centerY, "", {
                fontFamily: FONT_FAMILY,
                fontSize: "1px",
                color: "#dbe2ea"
            }).setOrigin(0.5);
            const hitArea = this.add.zone(centerX, centerY, cardWidth, cardHeight);
            hitArea.setInteractive({ useHandCursor: true });

            const cardView: LevelCardView = {
                levelNumber: level.number,
                background,
                levelLabel,
                titleLabel,
                bestLabel,
                hitArea,
                hovered: false,
                width: cardWidth,
                height: cardHeight,
                centerX,
                centerY
            };

            hitArea.on("pointerdown", () => this.selectLevel(level.number));
            hitArea.on("pointerover", () => {
                cardView.hovered = true;
                this.refreshLevelSelector();
            });
            hitArea.on("pointerout", () => {
                cardView.hovered = false;
                this.refreshLevelSelector();
            });

            this.levelCards.push(cardView);
        }
    }

    private createButtons(): void {

        const layout = this.getLayoutConfig();

        this.playButton = this.createActionButton({
            centerX: MENU_WIDTH / 2,
            centerY: layout.playButtonY,
            width: layout.playButtonWidth,
            height: layout.playButtonHeight,
            label: "Play",
            subtitle: ""
        });
        this.playButton.hitArea.on("pointerdown", () => this.handlePlayAction());
        this.playButton.hitArea.on("pointerover", () => this.tweenButton(this.playButton, true));
        this.playButton.hitArea.on("pointerout", () => this.tweenButton(this.playButton, false));

        this.settingsButton = this.createActionButton({
            centerX: MENU_WIDTH / 2,
            centerY: layout.settingsButtonY,
            width: layout.settingsButtonWidth,
            height: layout.settingsButtonHeight,
            label: "Settings"
        });
        this.settingsButton.hitArea.on("pointerdown", () => this.handleSecondaryAction());
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
            hitArea,
            width: config.width,
            height: config.height
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
        const closedLayout = this.getLayoutConfig(false);
        const openLayout = this.getLayoutConfig(true);
        const animatedMenuHeight = Phaser.Math.Linear(
            closedLayout.menuHeight,
            openLayout.menuHeight,
            this.levelSelectionProgress
        );
        const rawScale = Math.min(availableWidth / MENU_WIDTH, availableHeight / animatedMenuHeight);
        const scale = Phaser.Math.Clamp(rawScale, 0.54, width >= 960 ? 1.12 : 1);
        const scaledWidth = MENU_WIDTH * scale;
        const scaledHeight = animatedMenuHeight * scale;
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
        this.levelBestScores = loadLevelBestScores();
        this.refreshLevelSelector();
        this.refreshButtons();
        this.refreshLevelSelectionVisibility();
        this.refreshModal();
        this.applyResponsiveLayout();
    }

    private refreshLevelSelector(): void {

        const selectedLevel = getSudokuLevel(this.selectedLevel);
        const selectedBestScore = this.getLevelBestScore(selectedLevel.number);
        const selectedBestText = selectedBestScore === null
            ? "No best score yet"
            : `Best ${this.formatScore(selectedBestScore)}`;

        const summaryText = this.isMobileDevice
            ? `Level ${selectedLevel.number}  •  ${selectedLevel.title}\n${selectedLevel.clueCount} clues  •  ${selectedBestText}`
            : `Level ${selectedLevel.number}  •  ${selectedLevel.title}  •  ${selectedLevel.clueCount} clues  •  ${selectedBestText}`;

        this.levelSummaryText.setText(summaryText);

        for (const card of this.levelCards) {
            const level = getSudokuLevel(card.levelNumber);
            const selected = card.levelNumber === this.selectedLevel;

            card.background.clear();
            if (selected) {
                card.background.fillStyle(0xffffff, 0.98);
                card.background.lineStyle(2, 0xe5eaf0, 1);
            } else {
                const fillAlpha = card.hovered ? 0.28 : 0.16;
                const strokeAlpha = card.hovered ? 0.52 : 0.36;
                card.background.fillStyle(0xffffff, fillAlpha);
                card.background.lineStyle(2, 0xffffff, strokeAlpha);
            }
            card.background.fillRoundedRect(-card.width / 2, -card.height / 2, card.width, card.height, 22);
            card.background.strokeRoundedRect(-card.width / 2, -card.height / 2, card.width, card.height, 22);

            card.levelLabel.setText("");
            card.titleLabel.setText(`Level ${level.number}`);
            card.titleLabel.setColor(selected ? "#28313b" : "#ffffff");
            card.bestLabel.setText("");
        }
    }

    private refreshButtons(): void {

        const layout = this.getLayoutConfig();
        const buttonLocked = this.transitionLocked || this.activeModal !== null || this.levelSelectionAnimating;
        const selectedLevel = getSudokuLevel(this.selectedLevel);
        const selectedBestScore = this.getLevelBestScore(selectedLevel.number);
        const selectedBestText = selectedBestScore === null
            ? "Best --"
            : `Best ${this.formatScore(selectedBestScore)}`;
        const progress = this.levelSelectionProgress;

        this.playButton.background.clear();
        this.playButton.background.fillStyle(0xffffff, 0.98);
        this.playButton.background.lineStyle(2, 0xe1e5ea, 1);
        this.playButton.background.fillRoundedRect(
            -this.playButton.width / 2,
            -this.playButton.height / 2,
            this.playButton.width,
            this.playButton.height,
            26
        );
        this.playButton.background.strokeRoundedRect(
            -this.playButton.width / 2,
            -this.playButton.height / 2,
            this.playButton.width,
            this.playButton.height,
            26
        );
        const playButtonY = layout.playButtonY;
        const activePlayY = Phaser.Math.Linear(layout.homeButtonsY, playButtonY, progress);
        this.playButton.background.setY(activePlayY);
        this.playButton.hitArea.setY(activePlayY);
        this.playButton.label.setY(activePlayY - 10);
        this.playButton.subtitle?.setY(activePlayY + 18);
        this.playButton.label.setText(this.levelSelectionOpen ? `Play Level ${selectedLevel.number}` : "Play");
        this.playButton.label.setColor("#28313b");
        this.playButton.subtitle?.setText(
            this.levelSelectionOpen
                ? `${selectedLevel.title} • ${selectedLevel.clueCount} clues • ${selectedBestText}`
                : "Open level menu"
        );
        this.playButton.subtitle?.setColor("#7b8692");
        if (buttonLocked) {
            this.playButton.hitArea.disableInteractive();
        } else {
            this.playButton.hitArea.setInteractive({ useHandCursor: true });
        }

        this.settingsButton.background.clear();
        this.settingsButton.background.fillStyle(0xffffff, 0.2);
        this.settingsButton.background.lineStyle(2, 0xffffff, 0.36);
        this.settingsButton.background.fillRoundedRect(
            -this.settingsButton.width / 2,
            -this.settingsButton.height / 2,
            this.settingsButton.width,
            this.settingsButton.height,
            22
        );
        this.settingsButton.background.strokeRoundedRect(
            -this.settingsButton.width / 2,
            -this.settingsButton.height / 2,
            this.settingsButton.width,
            this.settingsButton.height,
            22
        );
        const settingsButtonY = layout.settingsButtonY;
        const activeSettingsY = Phaser.Math.Linear(layout.homeSettingsY, settingsButtonY, progress);
        this.settingsButton.background.setY(activeSettingsY);
        this.settingsButton.hitArea.setY(activeSettingsY);
        this.settingsButton.label.setY(activeSettingsY);
        this.settingsButton.label.setText(this.levelSelectionOpen ? "Back" : "Settings");
        this.settingsButton.label.setColor("#ffffff");
        this.drawSettingsIcon(this.settingsButton.icon, 0xffffff);
        this.settingsButton.icon?.setVisible(!this.levelSelectionOpen);
        if (this.settingsButton.icon) {
            this.settingsButton.icon.setY(activeSettingsY);
        }
        if (buttonLocked) {
            this.settingsButton.hitArea.disableInteractive();
        } else {
            this.settingsButton.hitArea.setInteractive({ useHandCursor: true });
        }
    }

    private refreshLevelSelectionVisibility(): void {

        const summaryProgress = Phaser.Math.Clamp((this.levelSelectionProgress - 0.06) / 0.94, 0, 1);
        const summaryVisible = summaryProgress > 0.01 || this.levelSelectionAnimating;
        const layout = this.getLayoutConfig(true);
        const totalRows = Math.ceil(this.levelCards.length / layout.selectorColumns);
        const maxRowDelay = Math.max(0, (totalRows - 1) * 0.08);
        const revealWindow = Math.max(0.18, 1 - maxRowDelay);
        this.levelSummaryText.setVisible(summaryVisible);
        this.levelSummaryText.setAlpha(summaryProgress);
        this.levelSummaryText.setY(layout.summaryY + (1 - summaryProgress) * 22);

        for (const card of this.levelCards) {
            const rowIndex = Math.floor((card.levelNumber - 1) / layout.selectorColumns);
            const rowDelay = rowIndex * 0.08;
            const revealProgress = Phaser.Math.Clamp((this.levelSelectionProgress - rowDelay) / revealWindow, 0, 1);
            const cardVisible = revealProgress > 0.01 || this.levelSelectionAnimating;
            const cardY = card.centerY + (1 - revealProgress) * 26;

            card.background.setVisible(cardVisible);
            card.levelLabel.setVisible(cardVisible);
            card.titleLabel.setVisible(cardVisible);
            card.bestLabel.setVisible(cardVisible);
            card.hitArea.setVisible(cardVisible);

            card.background.setAlpha(revealProgress);
            card.levelLabel.setAlpha(revealProgress);
            card.titleLabel.setAlpha(revealProgress);
            card.bestLabel.setAlpha(revealProgress);
            card.background.setScale(0.96 + revealProgress * 0.04);

            card.background.setPosition(card.centerX, cardY);
            card.levelLabel.setPosition(card.centerX, cardY);
            card.titleLabel.setPosition(card.centerX, cardY);
            card.bestLabel.setPosition(card.centerX, cardY);
            card.hitArea.setPosition(card.centerX, cardY);

            if (revealProgress > 0.99 && this.levelSelectionOpen && !this.transitionLocked && this.activeModal === null && !this.levelSelectionAnimating) {
                card.hitArea.setInteractive({ useHandCursor: true });
            } else {
                card.hitArea.disableInteractive();
            }
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

        if (this.transitionLocked || this.levelSelectionAnimating) {
            return;
        }

        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.setModal("settings");
    }

    private handleSecondaryAction(): void {

        if (this.levelSelectionOpen) {
            if (this.transitionLocked || this.activeModal !== null || this.levelSelectionAnimating) {
                return;
            }

            this.ensureAudioUnlocked();
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.animateLevelSelection(false);
            return;
        }

        this.openSettings();
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

        if (this.transitionLocked || this.activeModal !== null || this.levelSelectionAnimating) {
            return;
        }

        if (!this.levelSelectionOpen) {
            this.ensureAudioUnlocked();
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.animateLevelSelection(true);
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
            this.scene.start("Level", { level: this.selectedLevel });
        });
    }

    private selectLevel(levelNumber: number): void {

        if (this.transitionLocked || this.activeModal !== null || this.levelSelectionAnimating) {
            return;
        }

        const nextLevel = clampLevelNumber(levelNumber);
        if (nextLevel === this.selectedLevel) {
            return;
        }

        this.ensureAudioUnlocked();
        this.selectedLevel = nextLevel;
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.refreshAll();
    }

    private tweenButton(button: ActionButtonView, hovered: boolean): void {

        if (this.activeModal !== null || this.transitionLocked || this.levelSelectionAnimating) {
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

    private animateLevelSelection(open: boolean): void {

        const targetProgress = open ? 1 : 0;
        if (this.levelSelectionOpen === open && Math.abs(this.levelSelectionProgress - targetProgress) < 0.001) {
            return;
        }

        this.levelSelectionTween?.stop();
        this.levelSelectionOpen = open;
        this.levelSelectionAnimating = true;
        this.refreshAll();

        this.levelSelectionTween = this.tweens.addCounter({
            from: this.levelSelectionProgress,
            to: targetProgress,
            duration: open ? 420 : 320,
            ease: open ? "Cubic.Out" : "Cubic.InOut",
            onUpdate: (tween) => {
                this.levelSelectionProgress = tween.getValue();
                this.refreshAll();
            },
            onComplete: () => {
                this.levelSelectionProgress = targetProgress;
                this.levelSelectionAnimating = false;
                this.levelSelectionTween = undefined;
                this.refreshAll();
            }
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
            this.schedulePreviewStep(760);
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

    private getLevelBestScore(levelNumber: number): number | null {

        const key = String(levelNumber);
        const score = this.levelBestScores[key];
        return typeof score === "number" ? score : null;
    }

    private formatScore(score: number): string {

        return score.toLocaleString("en-US");
    }

    private renderGameToText(): string {

        return JSON.stringify({
            scene: "menu",
            levelSelectionOpen: this.levelSelectionOpen,
            modal: this.activeModal,
            selectedLevel: this.selectedLevel,
            settings: this.settings,
            levels: SUDOKU_LEVELS.map((level) => ({
                level: level.number,
                title: level.title,
                clueCount: level.clueCount,
                bestScore: this.getLevelBestScore(level.number)
            })),
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
