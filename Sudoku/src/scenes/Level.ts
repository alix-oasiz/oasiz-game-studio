import Phaser from "phaser";
import {
    type GameMode,
    loadSettings as loadStoredSettings,
    saveSettings as persistStoredSettings,
    subscribeToSettingsChange,
    type SettingKey,
    type SettingState,
    type StoredCellSnapshot,
    type StoredMoveRecord
} from "../sudokuStorage";
import { syncBackgroundMusic, unlockBackgroundMusic } from "../utils/backgroundMusic";
import { getSharedAudioContext } from "../utils/sharedAudioContext";

const GAME_WIDTH = 620;
const GAME_HEIGHT = 860;
const PHONE_X = 0;
const PHONE_Y = 0;
const PHONE_WIDTH = GAME_WIDTH;
const PHONE_HEIGHT = GAME_HEIGHT;
const BOARD_SIZE = 600;
const BOARD_X = 10;
const BOARD_Y = 52;
const BOX_GAP = 12;
const BOX_SIZE = (BOARD_SIZE - BOX_GAP * 2) / 3;
const CELL_SIZE = BOX_SIZE / 3;
const MAX_MISTAKES = 3;
const HINT_COST = 75;
const MAX_HINTS = 2;
const SCORE_PER_CORRECT_ENTRY = 35;
const FONT_FAMILY = '"Avenir Next", "Trebuchet MS", sans-serif';
const NOTE_FONT_FAMILY = '"Menlo", "Courier New", monospace';

const COLORS = {
    backgroundTop: 0x2f3744,
    backgroundBottom: 0x394350,
    phoneShadow: 0x121821,
    phoneFill: 0xffffff,
    textDark: 0x323844,
    textMid: 0x6f7680,
    textMuted: 0xb6bcc5,
    blue: 0x4fc3f7,
    blueStrong: 0x22c4f1,
    blueSoft: 0xeef9ff,
    bluePill: 0xf3f8fb,
    blueBorder: 0xbfd8e6,
    gridThin: 0xc8cdd4,
    gridThick: 0x9aa3ae,
    cellStroke: 0xb8bfc8,
    peerFill: 0xebedf0,
    selectedFill: 0x717c8d,
    selectedShadow: 0x9ed9f4,
    wrong: 0xff7c4d,
    toolDisabled: 0xc7ccd3,
    shadow: 0x000000,
    overlay: 0x10161e
};

const BASE_SOLUTION = [
    [1, 5, 6, 7, 8, 2, 3, 4, 9],
    [7, 8, 2, 3, 4, 9, 1, 5, 6],
    [3, 4, 9, 1, 5, 6, 7, 8, 2],
    [5, 6, 7, 8, 2, 3, 4, 9, 1],
    [8, 2, 3, 4, 9, 1, 5, 6, 7],
    [4, 9, 1, 5, 6, 7, 8, 2, 3],
    [6, 7, 8, 2, 3, 4, 9, 1, 5],
    [2, 3, 4, 9, 1, 5, 6, 7, 8],
    [9, 1, 5, 6, 7, 8, 2, 3, 4]
] as const;

type ToolKey = "undo" | "clear" | "pencil" | "hint";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type WinOverlayAction = "main" | "new";

interface CellModel {
    row: number;
    col: number;
    solution: number;
    given: boolean;
    value: number | null;
    notes: Set<number>;
    wrong: boolean;
    scored: boolean;
}

interface CellView {
    selectionShadow: Phaser.GameObjects.Ellipse;
    background: Phaser.GameObjects.Rectangle;
    selectedTile: Phaser.GameObjects.Graphics;
    celebrationOverlay: Phaser.GameObjects.Rectangle;
    valueText: Phaser.GameObjects.Text;
    notesText: Phaser.GameObjects.Text;
}

interface ToolView {
    key: ToolKey;
    zone: Phaser.GameObjects.Zone;
    icon: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
}

interface NumberButtonView {
    value: number;
    circle: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
}

type CellSnapshot = StoredCellSnapshot;
type MoveRecord = StoredMoveRecord;

type TestWindow = Window & {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    triggerHaptic?: (type: HapticType) => void;
    submitScore?: (score: number) => void;
    webkitAudioContext?: typeof AudioContext;
};

interface SettingsToggleView {
    key: SettingKey;
    label: Phaser.GameObjects.Text;
    valueLabel: Phaser.GameObjects.Text;
    track: Phaser.GameObjects.Rectangle;
    knob: Phaser.GameObjects.Arc;
    hitArea: Phaser.GameObjects.Zone;
}

export default class Level extends Phaser.Scene {

    private backdropGraphics!: Phaser.GameObjects.Graphics;
    private uiRoot!: Phaser.GameObjects.Container;
    private peerHighlightGraphics!: Phaser.GameObjects.Graphics;
    private board: CellModel[][] = [];
    private cellViews: CellView[][] = [];
    private toolViews: ToolView[] = [];
    private numberButtons: NumberButtonView[] = [];
    private mistakes = 0;
    private elapsedMs = 0;
    private score = 0;
    private gems = 2500;
    private pencilMode = false;
    private selectedRow = 0;
    private selectedCol = 0;
    private selectedNumber: number | null = null;
    private mode: GameMode = "playing";
    private history: MoveRecord[] = [];
    private hintsUsed = 0;
    private manualTimeControl = false;
    private modalOpen = false;
    private hasSubmittedScore = false;
    private isMobileDevice = window.matchMedia("(pointer: coarse)").matches;
    private settings: SettingState = loadStoredSettings();
    private settingsButtonCircle!: Phaser.GameObjects.Arc;
    private settingsButtonHitArea!: Phaser.GameObjects.Zone;
    private settingsButtonIcon!: Phaser.GameObjects.Graphics;
    private settingsScrim!: Phaser.GameObjects.Rectangle;
    private settingsPanel!: Phaser.GameObjects.Rectangle;
    private settingsTitle!: Phaser.GameObjects.Text;
    private settingsCloseButtonBg!: Phaser.GameObjects.Graphics;
    private settingsCloseText!: Phaser.GameObjects.Text;
    private settingsCloseButtonHitArea!: Phaser.GameObjects.Zone;
    private settingsHintText!: Phaser.GameObjects.Text;
    private settingsRows: SettingsToggleView[] = [];
    private testWinButtonBg!: Phaser.GameObjects.Graphics;
    private testWinButtonLabel!: Phaser.GameObjects.Text;
    private testWinButtonHitArea!: Phaser.GameObjects.Zone;
    private audioContext?: AudioContext;
    private unsubscribeSettingsSync?: () => void;
    private autoSolveQueue: Array<{ row: number; col: number }> = [];
    private autoSolveActive = false;
    private autoSolveEvent?: Phaser.Time.TimerEvent;

    private headerMistakesText!: Phaser.GameObjects.Text;
    private headerTimerText!: Phaser.GameObjects.Text;
    private gemsText!: Phaser.GameObjects.Text;
    private overlayScrim!: Phaser.GameObjects.Rectangle;
    private overlayPanel!: Phaser.GameObjects.Rectangle;
    private overlayTitle!: Phaser.GameObjects.Text;
    private overlayBody!: Phaser.GameObjects.Text;
    private overlayButton!: Phaser.GameObjects.Container;
    private overlayButtonLabel!: Phaser.GameObjects.Text;
    private overlayButtonBg!: Phaser.GameObjects.Rectangle;
    private overlayButtonHitArea!: Phaser.GameObjects.Rectangle;
    private winOverlayRoot!: Phaser.GameObjects.Container;
    private winOverlayBackdrop!: Phaser.GameObjects.Graphics;
    private winOverlayTitle!: Phaser.GameObjects.Text;
    private winOverlayStats!: Phaser.GameObjects.Text;
    private winOverlayTrophy!: Phaser.GameObjects.Container;
    private winOverlayMainButtonBg!: Phaser.GameObjects.Graphics;
    private winOverlayMainButtonIconBadge!: Phaser.GameObjects.Arc;
    private winOverlayMainButtonLabel!: Phaser.GameObjects.Text;
    private winOverlayMainButtonSubLabel!: Phaser.GameObjects.Text;
    private winOverlayMainButtonHitArea!: Phaser.GameObjects.Zone;
    private winOverlayMainIcon!: Phaser.GameObjects.Graphics;
    private winOverlayNewButtonBg!: Phaser.GameObjects.Graphics;
    private winOverlayNewButtonIconBadge!: Phaser.GameObjects.Arc;
    private winOverlayNewButtonLabel!: Phaser.GameObjects.Text;
    private winOverlayNewButtonSubLabel!: Phaser.GameObjects.Text;
    private winOverlayNewButtonHitArea!: Phaser.GameObjects.Zone;
    private winOverlayNewIcon!: Phaser.GameObjects.Graphics;
    private winOverlayHomeIndicator!: Phaser.GameObjects.Rectangle;

    constructor() {

        super("Level");
    }

    create(): void {

        this.resetSessionState();
        this.settings = loadStoredSettings();
        this.unsubscribeSettingsSync = subscribeToSettingsChange((settings) => this.applySettingsSync(settings));
        this.createBoardState();
        this.drawBackdrop();
        this.drawPhoneShell();
        this.createHeader();
        this.createBoard();
        this.createControls();
        this.createOverlay();
        this.registerInput();
        this.bindAutomationHooks();
        this.collectUiIntoRoot();
        this.createTestWinUi();
        this.createSettingsUi();
        this.applyResponsiveLayout();
        this.refreshAll();
        this.syncMusicState();

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            const testWindow = window as TestWindow;
            this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
            this.stopAutoSolveSequence();
            this.unsubscribeSettingsSync?.();
            this.unsubscribeSettingsSync = undefined;
            delete testWindow.render_game_to_text;
            delete testWindow.advanceTime;
        });
    }

    private resetSessionState(): void {

        this.stopAutoSolveSequence();
        this.board = [];
        this.cellViews = [];
        this.toolViews = [];
        this.numberButtons = [];
        this.history = [];
        this.mistakes = 0;
        this.elapsedMs = 0;
        this.score = 0;
        this.gems = 2500;
        this.hintsUsed = 0;
        this.pencilMode = false;
        this.selectedRow = 0;
        this.selectedCol = 0;
        this.selectedNumber = null;
        this.mode = "playing";
        this.manualTimeControl = false;
        this.modalOpen = false;
        this.hasSubmittedScore = false;
        this.settingsRows = [];
        this.autoSolveQueue = [];
    }

    update(_time: number, delta: number): void {

        if (!this.manualTimeControl) {
            this.advanceClock(delta);
        }
    }

    private createBoardState(): void {

        const { solution, givens } = this.generatePuzzle();
        this.board = [];

        for (let row = 0; row < 9; row++) {
            const currentRow: CellModel[] = [];

            for (let col = 0; col < 9; col++) {
                const given = givens[row][col];

                currentRow.push({
                    row,
                    col,
                    solution: solution[row][col],
                    given,
                    value: given ? solution[row][col] : null,
                    notes: new Set<number>(),
                    wrong: false,
                    scored: false
                });
            }

            this.board.push(currentRow);
        }

        const starterCell = this.findPreferredEditableCell();
        this.selectedRow = starterCell.row;
        this.selectedCol = starterCell.col;
        this.selectedNumber = null;
        this.mode = "playing";
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
        graphics.fillGradientStyle(
            COLORS.backgroundTop,
            COLORS.backgroundTop,
            COLORS.backgroundBottom,
            COLORS.backgroundBottom,
            1
        );
        graphics.fillRect(0, 0, width, height);

        graphics.fillStyle(0xffffff, 0.045);
        graphics.fillCircle(width * 0.16, height * 0.18, Math.max(68, width * 0.1));
        graphics.fillCircle(width * 0.84, height * 0.16, Math.max(86, width * 0.12));
        graphics.fillCircle(width * 0.22, height * 0.82, Math.max(92, width * 0.12));
        graphics.fillCircle(width * 0.88, height * 0.88, Math.max(62, width * 0.08));

        graphics.lineStyle(4, 0xffffff, 0.08);
        graphics.strokeCircle(width * 0.18, height * 0.68, 28);
        graphics.strokeCircle(width * 0.84, height * 0.34, 18);

        graphics.fillStyle(0xffffff, 0.08);
        graphics.fillRect(width * 0.08, height * 0.38, 4, 24);
        graphics.fillRect(width * 0.08 - 10, height * 0.38 + 10, 24, 4);
        graphics.fillRect(width * 0.9, height * 0.62, 4, 22);
        graphics.fillRect(width * 0.9 - 9, height * 0.62 + 9, 22, 4);
    }

    private drawPhoneShell(): void {
    }

    private createHeader(): void {

        this.headerMistakesText = this.add.text(12, 14, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            color: "#f7f8fa",
            fontStyle: "bold"
        });

        this.headerTimerText = this.add.text(GAME_WIDTH - 12, 14, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            color: "#f7f8fa",
            fontStyle: "bold"
        }).setOrigin(1, 0);

        this.gemsText = this.add.text(-1000, -1000, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "1px",
            color: "#ffffff"
        });
        this.gemsText.setVisible(false);
    }

    private createBoard(): void {

        for (let boxRow = 0; boxRow < 3; boxRow++) {
            for (let boxCol = 0; boxCol < 3; boxCol++) {
                const left = this.getBoxLeft(boxCol);
                const top = this.getBoxTop(boxRow);
                const shadow = this.add.rectangle(
                    left + BOX_SIZE / 2,
                    top + BOX_SIZE / 2 + 8,
                    BOX_SIZE - 8,
                    BOX_SIZE - 8,
                    0x11161d,
                    0.16
                );
                shadow.setOrigin(0.5);

                const block = this.add.graphics();
                block.fillStyle(0xffffff, 1);
                block.lineStyle(2.5, 0x8a949f, 1);
                block.fillRoundedRect(left, top, BOX_SIZE, BOX_SIZE, 4);
                block.strokeRoundedRect(left, top, BOX_SIZE, BOX_SIZE, 4);
            }
        }

        this.peerHighlightGraphics = this.add.graphics();

        for (let boxRow = 0; boxRow < 3; boxRow++) {
            for (let boxCol = 0; boxCol < 3; boxCol++) {
                const left = this.getBoxLeft(boxCol);
                const top = this.getBoxTop(boxRow);

                for (let lineIndex = 1; lineIndex < 3; lineIndex++) {
                    this.add.rectangle(
                        left + lineIndex * CELL_SIZE,
                        top + BOX_SIZE / 2,
                        2,
                        BOX_SIZE - 2,
                        COLORS.cellStroke,
                        1
                    ).setOrigin(0.5);

                    this.add.rectangle(
                        left + BOX_SIZE / 2,
                        top + lineIndex * CELL_SIZE,
                        BOX_SIZE - 2,
                        2,
                        COLORS.cellStroke,
                        1
                    ).setOrigin(0.5);
                }
            }
        }

        this.cellViews = [];

        for (let row = 0; row < 9; row++) {
            const viewRow: CellView[] = [];

            for (let col = 0; col < 9; col++) {
                const x = this.getCellLeft(col);
                const y = this.getCellTop(row);
                const selectionShadow = this.add.ellipse(
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE * 0.95,
                    CELL_SIZE * 0.72,
                    10,
                    COLORS.selectedShadow,
                    0
                ).setOrigin(0.5);
                selectionShadow.setVisible(false);
                const background = this.add.rectangle(
                    x + 0.75,
                    y + 0.75,
                    CELL_SIZE - 1.5,
                    CELL_SIZE - 1.5,
                    0xffffff,
                    1
                ).setOrigin(0);

                const selectedTile = this.add.graphics({ x, y });
                selectedTile.fillStyle(COLORS.selectedFill, 1);
                selectedTile.fillRect(0.75, 0.75, CELL_SIZE - 1.5, CELL_SIZE - 1.5);
                selectedTile.setAlpha(0);

                const celebrationOverlay = this.add.rectangle(
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE / 2,
                    CELL_SIZE - 4,
                    CELL_SIZE - 4,
                    0x93ecff,
                    1
                ).setOrigin(0.5);
                celebrationOverlay.setAlpha(0);
                celebrationOverlay.setBlendMode(Phaser.BlendModes.ADD);

                background.setInteractive({ useHandCursor: true });
                background.on("pointerdown", () => {
                    if (this.modalOpen || this.autoSolveActive || this.mode !== "playing") {
                        return;
                    }

                    this.ensureAudioUnlocked();
                    this.playFx("tap");
                    this.triggerPlatformHaptic("light");
                    this.selectedRow = row;
                    this.selectedCol = col;
                    this.syncSelectedNumberFromCell();
                    this.refreshAll();
                });

                const valueText = this.add.text(x + CELL_SIZE / 2, y + CELL_SIZE / 2, "", {
                    fontFamily: FONT_FAMILY,
                    fontSize: "26px",
                    color: "#333333",
                    fontStyle: "normal"
                }).setOrigin(0.5);

                const notesText = this.add.text(x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1, "", {
                    fontFamily: NOTE_FONT_FAMILY,
                    fontSize: "9px",
                    color: "#7f93a3",
                    align: "center"
                }).setOrigin(0.5);

                viewRow.push({
                    selectionShadow,
                    background,
                    selectedTile,
                    celebrationOverlay,
                    valueText,
                    notesText
                });
            }

            this.cellViews.push(viewRow);
        }
    }

    private createControls(): void {

        const panelX = 10;
        const panelY = 690;
        const panelWidth = 600;
        const panelHeight = 112;
        const toolY = panelY + 34;
        const toolXs = [85, 235, 385, 535];
        const toolKeys: ToolKey[] = ["undo", "clear", "pencil", "hint"];
        const labels: Record<ToolKey, string> = {
            undo: "Undo",
            clear: "Clear",
            pencil: "Pencil",
            hint: "Hint"
        };

        const panel = this.add.rectangle(
            panelX + panelWidth / 2,
            panelY + panelHeight / 2 + 8,
            panelWidth - 12,
            panelHeight - 10,
            0x11161c,
            0.12
        );
        panel.setOrigin(0.5);

        const panelFrame = this.add.graphics();
        panelFrame.fillStyle(0xffffff, 1);
        panelFrame.lineStyle(1, 0xe1e5ea, 1);
        panelFrame.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 22);
        panelFrame.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 22);

        for (let index = 1; index < 4; index++) {
            this.add.rectangle(panelX + panelWidth * index / 4, panelY + panelHeight / 2, 2, 72, 0xe4e7ec, 1)
                .setOrigin(0.5);
        }

        for (let index = 0; index < toolKeys.length; index++) {
            const key = toolKeys[index];
            const icon = this.add.graphics({ x: toolXs[index], y: toolY });
            const label = this.add.text(toolXs[index], toolY + 34, labels[key], {
                fontFamily: FONT_FAMILY,
                fontSize: "16px",
                color: "#353b45",
                fontStyle: "600"
            }).setOrigin(0.5);

            const zone = this.add.zone(toolXs[index], toolY + 8, 128, 90);
            zone.setInteractive({ useHandCursor: true });
            zone.on("pointerdown", () => this.handleToolPress(key));

            this.toolViews.push({ key, zone, icon, label });
        }

        const numberPadTop = 836;
        const numberPadLeft = 40;
        const buttonSpacing = 67.5;

        for (let value = 1; value <= 9; value++) {
            const centerX = numberPadLeft + (value - 1) * buttonSpacing;
            const centerY = numberPadTop;
            const circle = this.add.circle(centerX, centerY + 1, 28, 0xffffff, 0);
            circle.setInteractive({ useHandCursor: true });
            circle.on("pointerdown", () => this.applyNumberInput(value));

            const label = this.add.text(centerX, centerY, String(value), {
                fontFamily: FONT_FAMILY,
                fontSize: "50px",
                color: "#f6f8fa",
                fontStyle: "400"
            }).setOrigin(0.5);
            label.setInteractive({ useHandCursor: true });
            label.on("pointerdown", () => this.applyNumberInput(value));

            this.numberButtons.push({ value, circle, label });
        }
    }

    private createOverlay(): void {

        this.overlayScrim = this.add.rectangle(
            PHONE_X + PHONE_WIDTH / 2,
            PHONE_Y + PHONE_HEIGHT / 2,
            PHONE_WIDTH,
            PHONE_HEIGHT,
            COLORS.overlay,
            0.28
        );
        this.overlayScrim.setVisible(false);
        this.overlayScrim.setDepth(100);

        this.overlayPanel = this.add.rectangle(
            PHONE_X + PHONE_WIDTH / 2,
            PHONE_Y + PHONE_HEIGHT / 2,
            344,
            234,
            0x202833,
            0.98
        );
        this.overlayPanel.setVisible(false);
        this.overlayPanel.setDepth(101);
        this.overlayPanel.setStrokeStyle(2, 0x495565, 1);

        this.overlayTitle = this.add.text(PHONE_X + PHONE_WIDTH / 2, PHONE_Y + PHONE_HEIGHT / 2 - 52, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "34px",
            color: "#f4f7fb",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.overlayTitle.setVisible(false);
        this.overlayTitle.setDepth(102);

        this.overlayBody = this.add.text(PHONE_X + PHONE_WIDTH / 2, PHONE_Y + PHONE_HEIGHT / 2 + 8, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            color: "#aeb7c1",
            align: "center",
            lineSpacing: 6
        }).setOrigin(0.5);
        this.overlayBody.setVisible(false);
        this.overlayBody.setDepth(102);

        this.overlayButtonBg = this.add.rectangle(
            PHONE_X + PHONE_WIDTH / 2,
            PHONE_Y + PHONE_HEIGHT / 2 + 82,
            204,
            54,
            0x11161d,
            1
        );
        this.overlayButtonBg.setStrokeStyle(2, 0x1f2832, 1);
        this.overlayButtonLabel = this.add.text(PHONE_X + PHONE_WIDTH / 2, PHONE_Y + PHONE_HEIGHT / 2 + 82, "Restart", {
            fontFamily: FONT_FAMILY,
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5);

        this.overlayButton = this.add.container(0, 0, [this.overlayButtonBg, this.overlayButtonLabel]);
        this.overlayButton.setVisible(false);
        this.overlayButton.setDepth(102);
        this.overlayButtonBg.setDepth(102);
        this.overlayButtonLabel.setDepth(103);

        this.overlayButtonHitArea = this.add.rectangle(
            PHONE_X + PHONE_WIDTH / 2,
            PHONE_Y + PHONE_HEIGHT / 2 + 82,
            204,
            54,
            0xffffff,
            0.001
        );
        this.overlayButtonHitArea.setDepth(104);
        this.overlayButtonHitArea.setInteractive({ useHandCursor: true });
        this.overlayButtonHitArea.on("pointerdown", () => this.restartGame());
        this.overlayButtonHitArea.on("pointerover", () => {
            if (this.mode === "playing" || this.modalOpen) {
                return;
            }
            this.overlayButtonBg.setFillStyle(0x1b222b, 1);
        });
        this.overlayButtonHitArea.on("pointerout", () => {
            this.overlayButtonBg.setFillStyle(0x11161d, 1);
        });
        this.overlayButtonHitArea.setVisible(false);

        this.createWinOverlay();
    }

    private createWinOverlay(): void {

        this.winOverlayBackdrop = this.add.graphics();
        this.drawWinOverlayBackground(this.winOverlayBackdrop);

        this.winOverlayTitle = this.add.text(PHONE_WIDTH / 2, 104, "YOU WIN", {
            fontFamily: FONT_FAMILY,
            fontSize: "48px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#596473",
            strokeThickness: 1.5
        }).setOrigin(0.5);

        this.winOverlayStats = this.add.text(PHONE_WIDTH / 2, 164, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "21px",
            color: "#dbe1e8",
            align: "center",
            lineSpacing: 8
        }).setOrigin(0.5);

        const trophyBody = this.add.ellipse(0, 0, 178, 160, 0xffffff, 0.98);
        trophyBody.setStrokeStyle(4, 0xd9dee5, 0.92);
        const trophyStar = this.add.text(0, -6, "★", {
            fontFamily: FONT_FAMILY,
            fontSize: "76px",
            color: "#3f4855",
            fontStyle: "bold"
        }).setOrigin(0.5);
        const leftHandle = this.add.ellipse(-96, -8, 40, 84, 0xffffff, 0);
        leftHandle.setStrokeStyle(12, 0xffffff, 0.92);
        leftHandle.angle = -12;
        const rightHandle = this.add.ellipse(96, -8, 40, 84, 0xffffff, 0);
        rightHandle.setStrokeStyle(12, 0xffffff, 0.92);
        rightHandle.angle = 12;
        const trophyNeck = this.add.rectangle(0, 90, 50, 20, 0xffffff, 1);
        const trophyBase = this.add.rectangle(0, 122, 126, 38, 0xffffff, 1);
        const trophyShadow = this.add.ellipse(0, 152, 160, 14, 0x05080d, 0.2);
        const buddyRing = this.add.circle(116, 52, 28, 0xffffff, 0.25);
        const buddyFace = this.add.circle(116, 52, 22, 0xffffff, 0.92);
        const buddyEyeLeft = this.add.circle(108, 48, 2.5, 0x3f4855, 1);
        const buddyEyeRight = this.add.circle(124, 48, 2.5, 0x3f4855, 1);
        const buddySmile = this.add.arc(116, 56, 7, 0, 180, false, 0x3f4855, 0);
        buddySmile.setStrokeStyle(2, 0x3f4855, 1);

        this.winOverlayTrophy = this.add.container(PHONE_WIDTH / 2, 326, [
            trophyShadow,
            leftHandle,
            rightHandle,
            trophyBody,
            trophyStar,
            trophyNeck,
            trophyBase,
            buddyRing,
            buddyFace,
            buddyEyeLeft,
            buddyEyeRight,
            buddySmile
        ]);

        this.tweens.add({
            targets: this.winOverlayTrophy,
            y: this.winOverlayTrophy.y - 12,
            duration: 1800,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1
        });

        this.winOverlayMainButtonBg = this.add.graphics({ x: PHONE_WIDTH / 2, y: 632 });
        this.drawWinActionButton(this.winOverlayMainButtonBg, "secondary");
        this.winOverlayMainButtonIconBadge = this.add.circle(PHONE_WIDTH / 2 - 150, 632, 22, 0xffffff, 0.16);
        this.winOverlayMainButtonIconBadge.setStrokeStyle(2, 0xffffff, 0.2);
        this.winOverlayMainIcon = this.add.graphics({ x: PHONE_WIDTH / 2 - 150, y: 632 });
        this.drawWinButtonIcon(this.winOverlayMainIcon, "main");
        this.winOverlayMainButtonLabel = this.add.text(PHONE_WIDTH / 2 - 112, 632, "Main Menu", {
            fontFamily: FONT_FAMILY,
            fontSize: "28px",
            color: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0, 0.5);
        this.winOverlayMainButtonSubLabel = this.add.text(PHONE_WIDTH / 2 - 112, 648, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            color: "#d6f4ff"
        }).setOrigin(0, 0.5);
        this.winOverlayMainButtonHitArea = this.add.zone(PHONE_WIDTH / 2, 632, 444, 82);
        this.winOverlayMainButtonHitArea.setInteractive({ useHandCursor: true });
        this.winOverlayMainButtonHitArea.on("pointerdown", () => this.handleWinOverlayAction("main"));
        this.winOverlayMainButtonHitArea.on("pointerover", () => this.setWinButtonHoverState("main", true));
        this.winOverlayMainButtonHitArea.on("pointerout", () => this.setWinButtonHoverState("main", false));

        this.winOverlayNewButtonBg = this.add.graphics({ x: PHONE_WIDTH / 2, y: 726 });
        this.drawWinActionButton(this.winOverlayNewButtonBg, "primary");
        this.winOverlayNewButtonIconBadge = this.add.circle(PHONE_WIDTH / 2 - 150, 726, 22, 0x414b58, 1);
        this.winOverlayNewButtonIconBadge.setStrokeStyle(2, 0x555f6b, 1);
        this.winOverlayNewIcon = this.add.graphics({ x: PHONE_WIDTH / 2 - 150, y: 726 });
        this.drawWinButtonIcon(this.winOverlayNewIcon, "new");
        this.winOverlayNewButtonLabel = this.add.text(PHONE_WIDTH / 2 - 112, 726, "Play Again", {
            fontFamily: FONT_FAMILY,
            fontSize: "28px",
            color: "#313844",
            fontStyle: "bold"
        }).setOrigin(0, 0.5);
        this.winOverlayNewButtonSubLabel = this.add.text(PHONE_WIDTH / 2 - 112, 742, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            color: "#5baacc"
        }).setOrigin(0, 0.5);
        this.winOverlayNewButtonHitArea = this.add.zone(PHONE_WIDTH / 2, 726, 444, 82);
        this.winOverlayNewButtonHitArea.setInteractive({ useHandCursor: true });
        this.winOverlayNewButtonHitArea.on("pointerdown", () => this.handleWinOverlayAction("new"));
        this.winOverlayNewButtonHitArea.on("pointerover", () => this.setWinButtonHoverState("new", true));
        this.winOverlayNewButtonHitArea.on("pointerout", () => this.setWinButtonHoverState("new", false));

        this.winOverlayHomeIndicator = this.add.rectangle(PHONE_WIDTH / 2, PHONE_HEIGHT - 16, 128, 6, 0xffffff, 0.36);

        this.winOverlayRoot = this.add.container(0, 0, [
            this.winOverlayBackdrop,
            this.winOverlayTitle,
            this.winOverlayStats,
            this.winOverlayTrophy,
            this.winOverlayMainButtonBg,
            this.winOverlayMainButtonIconBadge,
            this.winOverlayMainIcon,
            this.winOverlayMainButtonLabel,
            this.winOverlayMainButtonSubLabel,
            this.winOverlayMainButtonHitArea,
            this.winOverlayNewButtonBg,
            this.winOverlayNewButtonIconBadge,
            this.winOverlayNewIcon,
            this.winOverlayNewButtonLabel,
            this.winOverlayNewButtonSubLabel,
            this.winOverlayNewButtonHitArea,
            this.winOverlayHomeIndicator
        ]);
        this.winOverlayRoot.setDepth(130);
        this.winOverlayRoot.setVisible(false);
    }

    private drawWinOverlayBackground(graphics: Phaser.GameObjects.Graphics): void {

        graphics.clear();
        graphics.fillGradientStyle(COLORS.backgroundTop, COLORS.backgroundTop, COLORS.backgroundBottom, COLORS.backgroundBottom, 1);
        graphics.fillRect(PHONE_X, PHONE_Y, PHONE_WIDTH, PHONE_HEIGHT);

        graphics.lineStyle(4, 0xffffff, 0.24);
        graphics.strokeCircle(72, 84, 12);
        graphics.strokeCircle(90, 430, 16);
        graphics.strokeCircle(544, 132, 74);
        graphics.strokeCircle(510, 742, 22);
        graphics.strokeCircle(88, 756, 62);

        graphics.fillStyle(0xffffff, 0.34);
        graphics.fillRect(528, 94, 4, 22);
        graphics.fillRect(519, 103, 22, 4);
        graphics.fillRect(90, 642, 4, 22);
        graphics.fillRect(81, 651, 22, 4);
    }

    private drawWinButtonIcon(icon: Phaser.GameObjects.Graphics, action: WinOverlayAction): void {

        icon.clear();
        icon.lineStyle(2.4, 0xffffff, 1);

        if (action === "main") {
            icon.beginPath();
            icon.moveTo(-10, 4);
            icon.lineTo(0, -8);
            icon.lineTo(10, 4);
            icon.strokePath();
            icon.beginPath();
            icon.moveTo(-8, 4);
            icon.lineTo(-8, 12);
            icon.lineTo(8, 12);
            icon.lineTo(8, 4);
            icon.strokePath();
            return;
        }

        icon.strokeRect(-10, -10, 8, 8);
        icon.strokeRect(2, -10, 8, 8);
        icon.strokeRect(-10, 2, 8, 8);
        icon.strokeRect(2, 2, 8, 8);
    }

    private drawWinActionButton(
        graphics: Phaser.GameObjects.Graphics,
        variant: "primary" | "secondary",
        hovered = false
    ): void {

        const width = 444;
        const height = 82;
        const radius = 28;
        const isPrimary = variant === "primary";
        const fillColor = isPrimary ? 0xffffff : 0x657181;
        const fillAlpha = isPrimary ? 1 : hovered ? 0.94 : 0.88;
        const strokeColor = isPrimary ? 0xebeff4 : 0x8f9aa8;
        const strokeAlpha = isPrimary ? 0.96 : hovered ? 0.62 : 0.46;
        const shadowColor = isPrimary ? 0x0b1118 : 0x121821;
        const shadowAlpha = isPrimary ? 0.2 : hovered ? 0.26 : 0.18;

        graphics.clear();
        graphics.fillStyle(shadowColor, shadowAlpha);
        graphics.fillRoundedRect(-width / 2 + 6, -height / 2 + 8, width - 12, height - 6, radius);
        graphics.fillStyle(fillColor, fillAlpha);
        graphics.lineStyle(2, strokeColor, strokeAlpha);
        graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
        graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    }

    private setWinButtonHoverState(action: WinOverlayAction, hovered: boolean): void {

        if (action === "main") {
            this.drawWinActionButton(this.winOverlayMainButtonBg, "secondary", hovered);
            this.winOverlayMainButtonIconBadge.setAlpha(hovered ? 0.26 : 0.16);
            return;
        }

        this.drawWinActionButton(this.winOverlayNewButtonBg, "primary", hovered);
        this.winOverlayNewButtonIconBadge.setScale(hovered ? 1.04 : 1);
    }

    private handleWinOverlayAction(action: WinOverlayAction): void {

        this.playFx("tap");
        this.triggerPlatformHaptic("light");

        if (action === "main") {
            this.scene.start("MainMenu");
            return;
        }

        this.restartGame();
    }

    private createSettingsUi(): void {

        this.settingsButtonCircle = this.add.circle(0, 0, 24, 0xffffff, 0.14);
        this.settingsButtonCircle.setStrokeStyle(2, 0xffffff, 0.18);
        this.settingsButtonCircle.setDepth(220);

        this.settingsButtonIcon = this.add.graphics();
        this.settingsButtonIcon.setDepth(221);

        this.settingsButtonHitArea = this.add.zone(0, 0, 56, 56);
        this.settingsButtonHitArea.setInteractive({ useHandCursor: true });
        this.settingsButtonHitArea.setDepth(222);
        this.settingsButtonHitArea.on("pointerdown", () => {
            if (this.autoSolveActive) {
                return;
            }
            this.ensureAudioUnlocked();
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.setSettingsModalOpen(!this.modalOpen);
        });

        this.settingsScrim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x05080d, 0.74);
        this.settingsScrim.setOrigin(0);
        this.settingsScrim.setInteractive();
        this.settingsScrim.setDepth(240);
        this.settingsScrim.on("pointerdown", () => undefined);

        this.settingsPanel = this.add.rectangle(0, 0, 0, 0, 0x222a35, 0.98);
        this.settingsPanel.setStrokeStyle(2, 0x485565, 1);
        this.settingsPanel.setDepth(241);

        this.settingsTitle = this.add.text(0, 0, "Settings", {
            fontFamily: FONT_FAMILY,
            fontSize: "28px",
            color: "#f4f7fb",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.settingsTitle.setDepth(242);

        this.settingsCloseButtonBg = this.add.graphics();
        this.settingsCloseButtonBg.setDepth(242);

        this.settingsCloseText = this.add.text(0, 0, "Close", {
            fontFamily: FONT_FAMILY,
            fontSize: "18px",
            color: "#eef3f8",
            fontStyle: "bold"
        }).setOrigin(0.5);
        this.settingsCloseText.setDepth(243);

        this.settingsCloseButtonHitArea = this.add.zone(0, 0, 156, 46);
        this.settingsCloseButtonHitArea.setDepth(244);
        this.settingsCloseButtonHitArea.setInteractive({ useHandCursor: true });
        this.settingsCloseButtonHitArea.on("pointerdown", () => {
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.deferSettingsClose();
        });

        this.settingsHintText = this.add.text(0, 0, "", {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            color: "#8f9dab",
            align: "center"
        }).setOrigin(0.5);
        this.settingsHintText.setDepth(242);

        this.settingsRows = this.createSettingsRows();
        this.layoutSettingsUi();
        this.updateSettingsUi();
        this.setSettingsModalOpen(false, false);
    }

    private createTestWinUi(): void {

        this.testWinButtonBg = this.add.graphics();
        this.testWinButtonBg.setDepth(220);

        this.testWinButtonLabel = this.add.text(0, 0, "TEST\nWIN", {
            fontFamily: FONT_FAMILY,
            fontSize: "19px",
            color: "#ffffff",
            align: "center",
            fontStyle: "bold",
            lineSpacing: 8
        }).setOrigin(0.5);
        this.testWinButtonLabel.setDepth(221);

        this.testWinButtonHitArea = this.add.zone(0, 0, 62, 120);
        this.testWinButtonHitArea.setInteractive({ useHandCursor: true });
        this.testWinButtonHitArea.setDepth(222);
        this.testWinButtonHitArea.on("pointerdown", () => this.startTestWinSequence());

        this.refreshTestWinButton();
    }

    private createSettingsRows(): SettingsToggleView[] {

        const rows: SettingsToggleView[] = [];
        const config: Array<{ key: SettingKey; label: string }> = [
            { key: "music", label: "Music" },
            { key: "fx", label: "FX" },
            { key: "haptics", label: "Haptics" }
        ];

        for (const item of config) {
            const label = this.add.text(0, 0, item.label, {
                fontFamily: FONT_FAMILY,
                fontSize: "22px",
                color: "#eef3f8",
                fontStyle: "bold"
            }).setOrigin(0, 0.5);
            label.setDepth(242);

            const valueLabel = this.add.text(0, 0, "", {
                fontFamily: FONT_FAMILY,
                fontSize: "16px",
                color: "#7f8d9c"
            }).setOrigin(1, 0.5);
            valueLabel.setDepth(242);

            const track = this.add.rectangle(0, 0, 74, 34, 0x151b23, 1);
            track.setStrokeStyle(2, 0x394452, 1);
            track.setDepth(242);

            const knob = this.add.circle(0, 0, 13, 0xffffff, 1);
            knob.setDepth(243);

            const hitArea = this.add.zone(0, 0, 300, 54);
            hitArea.setInteractive({ useHandCursor: true });
            hitArea.setDepth(244);
            hitArea.on("pointerdown", () => this.toggleSetting(item.key));

            rows.push({ key: item.key, label, valueLabel, track, knob, hitArea });
        }

        return rows;
    }

    private collectUiIntoRoot(): void {

        this.uiRoot = this.add.container(0, 0);
        const children = this.children.list.filter((gameObject) =>
            gameObject !== this.backdropGraphics && gameObject !== this.uiRoot
        );
        this.uiRoot.add(children as Phaser.GameObjects.GameObject[]);
        this.uiRoot.setDepth(10);
    }

    private applyResponsiveLayout(): void {

        if (!this.uiRoot) {
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;
        const safeTop = this.isMobileDevice ? 122 : 0;
        const safeBottom = this.isMobileDevice ? 24 : 0;
        const padding = width >= 960 ? 20 : 12;
        const availableWidth = Math.max(260, width - padding * 2);
        const availableHeight = Math.max(420, height - padding * 2 - safeTop - safeBottom);
        const rawScale = Math.min(availableWidth / GAME_WIDTH, availableHeight / GAME_HEIGHT);
        const maxScale = width >= 960 ? 1.18 : 1;
        const scale = Phaser.Math.Clamp(rawScale, 0.52, maxScale);
        const scaledWidth = GAME_WIDTH * scale;
        const scaledHeight = GAME_HEIGHT * scale;
        const centeredY = Math.round((height - scaledHeight) / 2);
        const mobileYOffset = this.isMobileDevice ? 34 : 0;
        const maxY = Math.max(safeTop, height - scaledHeight - safeBottom);
        const layoutY = Phaser.Math.Clamp(centeredY + mobileYOffset, safeTop, maxY);

        this.uiRoot.setScale(scale);
        this.uiRoot.setPosition(
            Math.round((width - scaledWidth) / 2),
            Math.round(layoutY)
        );

        this.layoutSettingsUi();
    }

    private handleResize(_gameSize: Phaser.Structs.Size): void {

        this.redrawBackdrop();
        this.applyResponsiveLayout();
    }

    private layoutSettingsUi(): void {

        if (!this.settingsButtonCircle) {
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;
        const safeTop = this.isMobileDevice ? 120 : 45;
        const buttonX = width - 34;
        const buttonY = safeTop;

        this.settingsButtonCircle.setPosition(buttonX, buttonY);
        this.settingsButtonHitArea.setPosition(buttonX, buttonY);
        this.settingsButtonIcon.setPosition(buttonX, buttonY);
        this.drawSettingsIcon(this.settingsButtonIcon, 0xeafcff);

        this.settingsScrim.setPosition(0, 0);
        this.settingsScrim.setSize(width, height);

        const panelWidth = Math.min(width - 36, 360);
        const panelHeight = 336;
        const panelX = width / 2;
        const panelY = Phaser.Math.Clamp(
            height / 2,
            safeTop + panelHeight / 2 + 12,
            height - panelHeight / 2 - 18
        );

        this.settingsPanel.setPosition(panelX, panelY);
        this.settingsPanel.setSize(panelWidth, panelHeight);
        this.settingsTitle.setPosition(panelX, panelY - 112);
        this.settingsHintText.setPosition(panelX, panelY - 90);
        this.settingsCloseButtonBg.clear();
        this.settingsCloseButtonBg.fillStyle(0x5f6c7b, 1);
        this.settingsCloseButtonBg.lineStyle(2, 0x8f99a6, 1);
        this.settingsCloseButtonBg.fillRoundedRect(panelX - 78, panelY + 103, 156, 46, 18);
        this.settingsCloseButtonBg.strokeRoundedRect(panelX - 78, panelY + 103, 156, 46, 18);
        this.settingsCloseText.setPosition(panelX, panelY + 126);
        this.settingsCloseButtonHitArea.setPosition(panelX, panelY + 126);

        this.settingsRows.forEach((row, index) => {
            const y = panelY - 40 + index * 62;
            row.label.setPosition(panelX - panelWidth / 2 + 28, y);
            row.valueLabel.setPosition(panelX + 42, y);
            row.track.setPosition(panelX + panelWidth / 2 - 62, y);
            row.knob.setPosition(panelX + panelWidth / 2 - 85, y);
            row.hitArea.setPosition(panelX, y);
        });

        if (this.testWinButtonBg && this.testWinButtonLabel && this.testWinButtonHitArea) {
            const testButtonY = Phaser.Math.Clamp(
                buttonY + (this.isMobileDevice ? 98 : 108),
                safeTop + 72,
                height - 110
            );
            this.testWinButtonBg.setPosition(buttonX, testButtonY);
            this.testWinButtonLabel.setPosition(buttonX, testButtonY + 2);
            this.testWinButtonHitArea.setPosition(buttonX, testButtonY);
        }
    }

    private registerInput(): void {

        this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();

            if (key === "escape" && this.modalOpen) {
                this.playFx("tap");
                this.triggerPlatformHaptic("light");
                this.setSettingsModalOpen(false);
                return;
            }

            if (key === "f") {
                this.toggleFullscreen();
                return;
            }

            if (key === "escape" && this.scale.isFullscreen) {
                this.scale.stopFullscreen();
                return;
            }

            if (this.modalOpen || this.autoSolveActive) {
                return;
            }

            if (key >= "1" && key <= "9") {
                this.applyNumberInput(Number(key));
                return;
            }

            if (key === "backspace" || key === "delete" || key === "0") {
                this.clearSelectedCell();
                return;
            }

            if (key === "z") {
                this.undoMove();
                return;
            }

            if (key === "p") {
                this.togglePencilMode();
                return;
            }

            if (key === "h") {
                this.useHint();
                return;
            }

            if (key === "r" || key === "enter") {
                if (this.mode !== "playing") {
                    this.restartGame();
                }
                return;
            }

            if (key === "arrowup") {
                this.moveSelection(-1, 0);
                return;
            }

            if (key === "arrowdown") {
                this.moveSelection(1, 0);
                return;
            }

            if (key === "arrowleft") {
                this.moveSelection(0, -1);
                return;
            }

            if (key === "arrowright") {
                this.moveSelection(0, 1);
            }
        });
    }

    private bindAutomationHooks(): void {

        const testWindow = window as TestWindow;
        testWindow.render_game_to_text = () => this.renderGameToText();
        testWindow.advanceTime = (ms: number) => {
            this.manualTimeControl = true;
            this.advanceClock(ms);
        };
    }

    private saveSettings(): void {

        persistStoredSettings(this.settings);
    }

    private toggleSetting(key: SettingKey): void {

        this.ensureAudioUnlocked();
        this.settings[key] = !this.settings[key];
        this.saveSettings();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
    }

    private applySettingsSync(settings: SettingState): void {

        this.settings = {
            music: settings.music,
            fx: settings.fx,
            haptics: settings.haptics
        };

        if (!this.settingsButtonCircle || this.settingsRows.length === 0) {
            this.syncMusicState();
            return;
        }

        this.updateSettingsUi();
        this.syncMusicState();
    }

    private updateSettingsUi(): void {

        for (const row of this.settingsRows) {
            const enabled = this.settings[row.key];
            row.valueLabel.setText(enabled ? "On" : "Off");
            row.valueLabel.setColor(enabled ? "#eef3f8" : "#667280");
            row.track.setFillStyle(enabled ? 0x5f6c7b : 0x151b23, 1);
            row.track.setStrokeStyle(2, enabled ? 0x8f99a6 : 0x394452, 1);
            row.knob.setFillStyle(enabled ? 0xfafcff : 0xc4ccd4, 1);
            row.knob.x = row.track.x + (enabled ? 18 : -18);
        }
    }

    private refreshTestWinButton(): void {

        if (!this.testWinButtonBg || !this.testWinButtonLabel || !this.testWinButtonHitArea) {
            return;
        }

        this.testWinButtonBg.clear();
        this.testWinButtonBg.setVisible(false);
        this.testWinButtonLabel.setVisible(false);
        this.testWinButtonHitArea.setVisible(false);
        this.testWinButtonHitArea.disableInteractive();
    }

    private setSettingsModalOpen(open: boolean, animate: boolean = true): void {

        this.modalOpen = open;
        this.settingsButtonCircle.setFillStyle(0xffffff, open ? 0.34 : 0.22);
        this.settingsButtonCircle.setStrokeStyle(2, open ? 0xffffff : 0xe7fbff, 0.9);
        this.drawSettingsIcon(this.settingsButtonIcon, open ? 0xffffff : 0xeafcff);
        this.refreshTestWinButton();

        const allSettingsElements = [
            this.settingsPanel,
            this.settingsTitle,
            this.settingsCloseButtonBg,
            this.settingsCloseText,
        ] as Phaser.GameObjects.GameObject[];
        const allRowElements: Phaser.GameObjects.GameObject[] = [];
        this.settingsRows.forEach((row) => {
            allRowElements.push(row.label, row.valueLabel, row.track, row.knob);
        });

        // Skip animation: just set final state immediately
        if (!animate) {
            if (!open) {
                this.settingsScrim.setVisible(false);
                this.settingsPanel.setVisible(false);
                this.settingsTitle.setVisible(false);
                this.settingsCloseButtonBg.setVisible(false);
                this.settingsCloseText.setVisible(false);
                this.settingsCloseButtonHitArea.setVisible(false);
                this.settingsHintText.setVisible(false);
                this.settingsRows.forEach((row) => {
                    row.label.setVisible(false);
                    row.valueLabel.setVisible(false);
                    row.track.setVisible(false);
                    row.knob.setVisible(false);
                    row.hitArea.setVisible(false);
                });
                allSettingsElements.forEach((el: any) => { el.setAlpha(1); el.setScale(1); });
                allRowElements.forEach((el: any) => { el.setAlpha(1); });
                this.settingsScrim.setAlpha(0);
            }
            return;
        }

        const allElements = [...allSettingsElements, ...allRowElements];

        // Kill any running modal tweens
        this.tweens.killTweensOf(this.settingsScrim);
        allElements.forEach((el) => this.tweens.killTweensOf(el));

        // Center point for the pop origin
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        const S0 = 0.35;

        if (open) {
            // --- POP OPEN (whole menu pops from center as one unit) ---
            this.settingsScrim.setVisible(true).setAlpha(0);
            this.settingsPanel.setVisible(true);
            this.settingsTitle.setVisible(true);
            this.settingsCloseButtonBg.setVisible(true);
            this.settingsCloseText.setVisible(true);
            this.settingsCloseButtonHitArea.setVisible(true);
            this.settingsHintText.setVisible(false);
            this.settingsCloseButtonHitArea.setInteractive({ useHandCursor: true });

            this.settingsRows.forEach((row) => {
                row.label.setVisible(true);
                row.valueLabel.setVisible(true);
                row.track.setVisible(true);
                row.knob.setVisible(true);
                row.hitArea.setVisible(true);
                row.hitArea.setInteractive({ useHandCursor: true });
            });

            // Scrim fast fade
            this.tweens.add({
                targets: this.settingsScrim,
                alpha: 1,
                duration: 160,
                ease: "Sine.Out"
            });

            // Each element: save final pos, move to compressed pos, tween back
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

        } else {
            // --- POP CLOSE (shrink to center as one unit) ---
            this.settingsCloseButtonHitArea.disableInteractive();
            this.settingsRows.forEach((row) => { row.hitArea.disableInteractive(); });

            const S1 = 0.55;
            // Save original positions for restore
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

            // Scrim fade out
            this.tweens.add({
                targets: this.settingsScrim,
                alpha: 0,
                duration: 200,
                ease: "Sine.In",
                onComplete: () => {
                    this.settingsScrim.setVisible(false);
                    this.settingsPanel.setVisible(false);
                    this.settingsTitle.setVisible(false);
                    this.settingsCloseButtonBg.setVisible(false);
                    this.settingsCloseText.setVisible(false);
                    this.settingsCloseButtonHitArea.setVisible(false);
                    this.settingsHintText.setVisible(false);
                    this.settingsRows.forEach((row) => {
                        row.label.setVisible(false);
                        row.valueLabel.setVisible(false);
                        row.track.setVisible(false);
                        row.knob.setVisible(false);
                        row.hitArea.setVisible(false);
                    });
                    // Restore positions & scales
                    allElements.forEach((el: any, i: number) => {
                        el.setScale(1);
                        el.x = origPositions[i].x;
                        el.y = origPositions[i].y;
                    });
                }
            });
        }
    }

    private ensureAudioUnlocked(): void {

        unlockBackgroundMusic();
        const context = this.getAudioContext();
        if (!context) {
            return;
        }

        if (context.state === "suspended") {
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

    private playFx(kind: "tap" | "place" | "error" | "success"): void {

        const tones: Record<typeof kind, Array<{ frequency: number; duration: number; volume: number }>> = {
            tap: [{ frequency: 620, duration: 70, volume: 0.025 }],
            place: [{ frequency: 740, duration: 90, volume: 0.03 }, { frequency: 1040, duration: 110, volume: 0.02 }],
            error: [{ frequency: 250, duration: 120, volume: 0.05 }, { frequency: 180, duration: 160, volume: 0.04 }],
            success: [
                { frequency: 660, duration: 120, volume: 0.035 },
                { frequency: 880, duration: 150, volume: 0.028 },
                { frequency: 1180, duration: 190, volume: 0.024 }
            ]
        };

        for (const tone of tones[kind]) {
            this.playTone(tone.frequency, tone.duration, tone.volume, "fx");
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

    private submitFinalScore(): void {

        if (this.hasSubmittedScore) {
            return;
        }

        const seconds = Math.floor(this.elapsedMs / 1000);

        const testWindow = window as TestWindow;
        if (typeof testWindow.submitScore !== "function") {
            this.hasSubmittedScore = true;
            return;
        }

        const solvedBonus = this.mode === "won" ? 500 : 0;
        const score = Math.max(0, this.score + solvedBonus - this.mistakes * 90 - this.hintsUsed * 60 - seconds * 2);

        testWindow.submitScore(score);
        this.hasSubmittedScore = true;
    }

    private drawSettingsIcon(icon: Phaser.GameObjects.Graphics, color: number): void {

        icon.clear();
        icon.lineStyle(2.4, color, 1);
        icon.strokeCircle(0, 0, 8);
        icon.strokeCircle(0, 0, 2.6);

        for (let index = 0; index < 8; index++) {
            const angle = Phaser.Math.DegToRad(index * 45);
            const inner = 10;
            const outer = 14;
            icon.beginPath();
            icon.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            icon.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            icon.strokePath();
        }
    }

    private deferSettingsClose(): void {

        this.time.delayedCall(0, () => this.setSettingsModalOpen(false));
    }

    private handleToolPress(key: ToolKey): void {

        if (this.modalOpen || this.autoSolveActive) {
            return;
        }

        switch (key) {
            case "undo":
                this.undoMove();
                break;
            case "clear":
                this.clearSelectedCell();
                break;
            case "pencil":
                this.togglePencilMode();
                break;
            case "hint":
                this.useHint();
                break;
        }
    }

    private applyNumberInput(value: number): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        const cell = this.board[this.selectedRow][this.selectedCol];
        const beforeMode = this.mode;
        const beforeSelectedNumber = this.selectedNumber;
        const beforeScore = this.score;
        this.ensureAudioUnlocked();

        if (cell.given) {
            this.selectedNumber = cell.value;
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.refreshAll();
            return;
        }

        if (this.pencilMode) {
            const before = this.snapshotCell(cell);

            if (cell.notes.has(value)) {
                cell.notes.delete(value);
            } else {
                cell.notes.add(value);
            }

            if (cell.scored) {
                this.score = Math.max(0, this.score - SCORE_PER_CORRECT_ENTRY);
            }

            cell.value = null;
            cell.wrong = false;
            cell.scored = false;
            this.selectedNumber = value;

            this.pushHistory(
                cell.row,
                cell.col,
                before,
                this.snapshotCell(cell),
                this.mistakes,
                this.mistakes,
                this.gems,
                this.gems,
                beforeMode,
                this.mode,
                beforeSelectedNumber,
                this.selectedNumber,
                this.hintsUsed,
                this.hintsUsed,
                beforeScore,
                this.score
            );
            this.playFx("tap");
            this.triggerPlatformHaptic("light");
            this.refreshAll();
            return;
        }

        const before = this.snapshotCell(cell);
        const beforeMistakes = this.mistakes;
        if (cell.scored) {
            this.score = Math.max(0, this.score - SCORE_PER_CORRECT_ENTRY);
        }
        cell.notes.clear();
        cell.value = value;
        cell.wrong = value !== cell.solution;
        cell.scored = false;

        if (cell.wrong) {
            this.mistakes = Math.min(MAX_MISTAKES, this.mistakes + 1);
            if (this.mistakes >= MAX_MISTAKES) {
                this.mode = "lost";
            }
        } else {
            cell.scored = true;
            this.score += SCORE_PER_CORRECT_ENTRY;

            if (this.isSolved()) {
                this.mode = "won";
            }
        }

        this.selectedNumber = value;
        this.pushHistory(
            cell.row,
            cell.col,
            before,
            this.snapshotCell(cell),
            beforeMistakes,
            this.mistakes,
            this.gems,
            this.gems,
            beforeMode,
            this.mode,
            beforeSelectedNumber,
            this.selectedNumber,
            this.hintsUsed,
            this.hintsUsed,
            beforeScore,
            this.score
        );

        if (cell.wrong) {
            this.playFx("error");
            this.triggerPlatformHaptic("error");
        } else {
            this.playFx(this.mode === "won" ? "success" : "place");
            this.triggerPlatformHaptic(this.mode === "won" ? "success" : "medium");
        }
        this.refreshAll();
        if (cell.wrong) {
            this.animateWrongPlacement(cell.row, cell.col);
        } else {
            this.animateCorrectPlacement(cell.row, cell.col);
        }
    }

    private clearSelectedCell(): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        const cell = this.board[this.selectedRow][this.selectedCol];
        const beforeSelectedNumber = this.selectedNumber;
        const beforeScore = this.score;

        if (cell.given || (cell.value === null && cell.notes.size === 0)) {
            return;
        }

        const before = this.snapshotCell(cell);
        const beforeMode = this.mode;
        if (cell.scored) {
            this.score = Math.max(0, this.score - SCORE_PER_CORRECT_ENTRY);
        }
        cell.value = null;
        cell.notes.clear();
        cell.wrong = false;
        cell.scored = false;
        this.selectedNumber = null;

        this.pushHistory(
            cell.row,
            cell.col,
            before,
            this.snapshotCell(cell),
            this.mistakes,
            this.mistakes,
            this.gems,
            this.gems,
            beforeMode,
            this.mode,
            beforeSelectedNumber,
            this.selectedNumber,
            this.hintsUsed,
            this.hintsUsed,
            beforeScore,
            this.score
        );
        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.refreshAll();
    }

    private togglePencilMode(): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        this.ensureAudioUnlocked();
        this.pencilMode = !this.pencilMode;
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.refreshControls();
    }

    private useHint(): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive || this.gems < HINT_COST || this.hintsUsed >= MAX_HINTS) {
            return;
        }

        this.ensureAudioUnlocked();

        const preferred = this.board[this.selectedRow][this.selectedCol];
        const candidates: CellModel[] = [preferred];

        for (const row of this.board) {
            for (const cell of row) {
                if (cell !== preferred) {
                    candidates.push(cell);
                }
            }
        }

        const target = candidates.find((cell) => !cell.given && cell.value !== cell.solution);

        if (!target) {
            return;
        }

        const before = this.snapshotCell(target);
        const beforeGems = this.gems;
        const beforeHintsUsed = this.hintsUsed;
        const beforeMode = this.mode;
        const beforeSelectedNumber = this.selectedNumber;
        const beforeScore = this.score;

        target.value = target.solution;
        target.wrong = false;
        target.scored = false;
        target.notes.clear();
        this.gems -= HINT_COST;
        this.hintsUsed += 1;
        this.selectedRow = target.row;
        this.selectedCol = target.col;
        this.selectedNumber = target.solution;

        if (this.isSolved()) {
            this.mode = "won";
        }

        this.pushHistory(
            target.row,
            target.col,
            before,
            this.snapshotCell(target),
            this.mistakes,
            this.mistakes,
            beforeGems,
            this.gems,
            beforeMode,
            this.mode,
            beforeSelectedNumber,
            this.selectedNumber,
            beforeHintsUsed,
            this.hintsUsed,
            beforeScore,
            this.score
        );
        this.playFx(this.mode === "won" ? "success" : "place");
        this.triggerPlatformHaptic(this.mode === "won" ? "success" : "medium");
        this.refreshAll();
    }

    private undoMove(): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        const move = this.history.pop();

        if (!move) {
            return;
        }

        const cell = this.board[move.row][move.col];
        cell.value = move.before.value;
        cell.notes = new Set<number>(move.before.notes);
        cell.wrong = move.before.wrong;
        cell.scored = move.before.scored;
        this.mistakes = move.beforeMistakes;
        this.gems = move.beforeGems;
        this.score = move.beforeScore;
        this.hintsUsed = move.beforeHintsUsed;
        this.mode = move.beforeMode;
        this.selectedNumber = move.beforeSelectedNumber;
        this.selectedRow = move.row;
        this.selectedCol = move.col;
        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.refreshAll();
    }

    private moveSelection(rowDelta: number, colDelta: number): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        this.selectedRow = Phaser.Math.Wrap(this.selectedRow + rowDelta, 0, 9);
        this.selectedCol = Phaser.Math.Wrap(this.selectedCol + colDelta, 0, 9);
        this.syncSelectedNumberFromCell();
        this.refreshAll();
    }

    private toggleFullscreen(): void {

        if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
            return;
        }

        this.scale.startFullscreen();
    }

    private restartGame(): void {

        if (this.modalOpen) {
            this.setSettingsModalOpen(false);
        }

        this.stopAutoSolveSequence();
        this.ensureAudioUnlocked();
        this.history = [];
        this.mistakes = 0;
        this.elapsedMs = 0;
        this.score = 0;
        this.gems = 2500;
        this.hintsUsed = 0;
        this.pencilMode = false;
        this.mode = "playing";
        this.selectedRow = 0;
        this.selectedCol = 0;
        this.selectedNumber = null;
        this.manualTimeControl = false;
        this.hasSubmittedScore = false;
        this.createBoardState();
        this.playFx("tap");
        this.triggerPlatformHaptic("medium");
        this.refreshAll();
    }

    private startTestWinSequence(): void {

        if (this.mode !== "playing" || this.modalOpen || this.autoSolveActive) {
            return;
        }

        const queue: Array<{ row: number; col: number }> = [];

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = this.board[row][col];
                if (!cell.given && cell.value !== cell.solution) {
                    queue.push({ row, col });
                }
            }
        }

        if (queue.length === 0) {
            return;
        }

        this.ensureAudioUnlocked();
        this.playFx("tap");
        this.triggerPlatformHaptic("light");
        this.autoSolveQueue = queue;
        this.autoSolveActive = true;
        this.refreshAll();
        this.runAutoSolveStep();
    }

    private runAutoSolveStep(): void {

        this.autoSolveEvent?.remove(false);
        this.autoSolveEvent = undefined;

        if (!this.autoSolveActive) {
            return;
        }

        const next = this.autoSolveQueue.shift();

        if (!next) {
            this.finishTestWinSequence();
            return;
        }

        const cell = this.board[next.row][next.col];

        if (cell.given || cell.value === cell.solution) {
            this.runAutoSolveStep();
            return;
        }

        this.selectedRow = next.row;
        this.selectedCol = next.col;
        this.selectedNumber = cell.solution;
        cell.notes.clear();
        cell.value = cell.solution;
        cell.wrong = false;

        if (this.autoSolveQueue.length % 3 === 0) {
            this.playFx("place");
        }

        if (this.autoSolveQueue.length % 5 === 0) {
            this.triggerPlatformHaptic("light");
        }

        this.refreshAll();
        this.animateCorrectPlacement(next.row, next.col);

        this.autoSolveEvent = this.time.delayedCall(120, () => {
            if (this.autoSolveQueue.length === 0) {
                this.finishTestWinSequence();
                return;
            }

            this.runAutoSolveStep();
        });
    }

    private finishTestWinSequence(): void {

        this.autoSolveEvent?.remove(false);
        this.autoSolveEvent = undefined;

        if (!this.autoSolveActive) {
            return;
        }

        this.autoSolveQueue = [];
        this.autoSolveActive = false;

        if (this.isSolved()) {
            this.mode = "won";
            this.playFx("success");
            this.triggerPlatformHaptic("success");
        }

        this.refreshAll();
    }

    private stopAutoSolveSequence(): void {

        this.autoSolveEvent?.remove(false);
        this.autoSolveEvent = undefined;
        this.autoSolveQueue = [];
        this.autoSolveActive = false;
    }

    private advanceClock(deltaMs: number): void {

        if (this.mode !== "playing" || this.modalOpen) {
            return;
        }

        this.elapsedMs += deltaMs;
        this.headerTimerText.setText(this.formatTime(Math.floor(this.elapsedMs / 1000)));
    }

    private refreshAll(): void {

        this.headerMistakesText.setText(`Mistakes: ${this.mistakes}/${MAX_MISTAKES}`);
        this.headerTimerText.setText(this.formatTime(Math.floor(this.elapsedMs / 1000)));
        this.gemsText.setText(String(this.gems));
        this.refreshBoard();
        this.refreshControls();
        this.updateSettingsUi();
        this.refreshTestWinButton();
        this.refreshOverlay();
    }

    private refreshBoard(): void {

        const selectedCell = this.board[this.selectedRow][this.selectedCol];

        this.peerHighlightGraphics.clear();

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = this.board[row][col];
                const view = this.cellViews[row][col];
                const inPeerGroup = row === this.selectedRow || col === this.selectedCol;
                const isSelected = row === this.selectedRow && col === this.selectedCol;

                let textColor = "#3a414a";
                let fontWeight = "500";

                if (cell.given) {
                    textColor = "#353b43";
                }

                if (cell.wrong) {
                    textColor = "#ff7c4d";
                }

                if (isSelected) {
                    textColor = "#ffffff";
                    fontWeight = "bold";
                }

                view.background.setFillStyle(COLORS.peerFill, inPeerGroup && !isSelected ? 1 : 0.001);
                view.background.setStrokeStyle(0, COLORS.cellStroke, 0);
                view.selectedTile.setAlpha(isSelected ? 1 : 0);
                view.selectionShadow.setAlpha(isSelected ? 0.14 : 0);

                if (cell.value !== null) {
                    view.valueText.setText(String(cell.value));
                    view.valueText.setColor(textColor);
                    view.valueText.setFontStyle(fontWeight);
                    view.valueText.setVisible(true);
                    view.notesText.setVisible(false);
                } else if (cell.notes.size > 0) {
                    view.valueText.setVisible(false);
                    view.notesText.setText(this.formatNotes(cell.notes));
                    view.notesText.setColor(isSelected ? "#f0f4f8" : "#8e97a2");
                    view.notesText.setVisible(true);
                } else {
                    view.valueText.setVisible(false);
                    view.notesText.setVisible(false);
                }
            }
        }

        if (selectedCell.value !== null) {
            this.selectedNumber = selectedCell.value;
        }
    }

    private animateCorrectPlacement(row: number, col: number): void {

        const animatedCells = new Set<string>();
        const pulseCell = (targetRow: number, targetCol: number, delay: number, center = false) => {
            const key = `${targetRow}:${targetCol}`;
            if (animatedCells.has(key)) {
                return;
            }

            animatedCells.add(key);
            const view = this.cellViews[targetRow][targetCol];
            const overlay = view.celebrationOverlay;
            const text = view.valueText;

            this.tweens.killTweensOf(overlay);
            overlay.setBlendMode(Phaser.BlendModes.NORMAL);
            overlay.setFillStyle(center ? 0x12171e : 0x3a434f, 1);
            overlay.setScale(center ? 0.78 : 0.9);
            overlay.setAlpha(0);

            this.tweens.add({
                targets: overlay,
                alpha: center ? 0.34 : 0.18,
                scaleX: 1.03,
                scaleY: 1.03,
                duration: center ? 190 : 235,
                delay,
                ease: "Cubic.Out",
                yoyo: true,
                hold: center ? 40 : 24,
                onComplete: () => {
                    overlay.setAlpha(0);
                    overlay.setScale(1);
                }
            });

            if (!center || !text.visible) {
                return;
            }

            this.tweens.killTweensOf(text);
            this.tweens.add({
                targets: text,
                scaleX: 1.26,
                scaleY: 1.26,
                duration: 180,
                ease: "Back.Out",
                yoyo: true
            });
        };

        pulseCell(row, col, 0, true);

        for (let currentCol = 0; currentCol < 9; currentCol++) {
            pulseCell(row, currentCol, Math.abs(currentCol - col) * 36);
        }

        for (let currentRow = 0; currentRow < 9; currentRow++) {
            pulseCell(currentRow, col, Math.abs(currentRow - row) * 36);
        }
    }

    private animateWrongPlacement(row: number, col: number): void {

        const animatedCells = new Set<string>();
        const pulseCell = (targetRow: number, targetCol: number, delay: number, center = false) => {
            const key = `${targetRow}:${targetCol}`;
            if (animatedCells.has(key)) {
                return;
            }

            animatedCells.add(key);
            const view = this.cellViews[targetRow][targetCol];
            const overlay = view.celebrationOverlay;
            const text = view.valueText;

            this.tweens.killTweensOf(overlay);
            overlay.setBlendMode(Phaser.BlendModes.NORMAL);
            overlay.setFillStyle(center ? 0xff7d86 : 0xffb2b8, 1);
            overlay.setScale(center ? 0.8 : 0.92);
            overlay.setAlpha(0);

            this.tweens.add({
                targets: overlay,
                alpha: center ? 0.82 : 0.28,
                scaleX: 1.04,
                scaleY: 1.04,
                duration: center ? 145 : 170,
                delay,
                ease: "Cubic.Out",
                yoyo: true,
                hold: center ? 30 : 14,
                onComplete: () => {
                    overlay.setAlpha(0);
                    overlay.setScale(1);
                    overlay.setBlendMode(Phaser.BlendModes.ADD);
                }
            });

            if (!center || !text.visible) {
                return;
            }

            this.tweens.killTweensOf(text);
            const baseX = text.x;
            this.tweens.add({
                targets: text,
                x: baseX + 5,
                duration: 46,
                ease: "Sine.InOut",
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    text.x = baseX;
                }
            });
        };

        pulseCell(row, col, 0, true);

        for (let currentCol = 0; currentCol < 9; currentCol++) {
            pulseCell(row, currentCol, Math.abs(currentCol - col) * 24);
        }

        for (let currentRow = 0; currentRow < 9; currentRow++) {
            pulseCell(currentRow, col, Math.abs(currentRow - row) * 24);
        }
    }

    private refreshControls(): void {

        for (const toolView of this.toolViews) {
            const enabled = this.isToolEnabled(toolView.key);
            const active = toolView.key === "pencil" && this.pencilMode;
            const color = active ? 0x222b36 : enabled ? 0x343b46 : COLORS.toolDisabled;
            toolView.label.setText(toolView.key === "hint" ? "Hint" : toolView.label.text);
            toolView.label.setColor(active ? "#202833" : enabled ? "#363d46" : "#bcc2c9");
            this.drawToolIcon(toolView.icon, toolView.key, color);
            toolView.zone.disableInteractive();
            if (enabled || toolView.key === "pencil") {
                toolView.zone.setInteractive({ useHandCursor: true });
            }
        }

        for (const button of this.numberButtons) {
            const active = button.value === this.selectedNumber;
            button.circle.setFillStyle(0xffffff, active ? 0.14 : 0);
            button.label.setColor(this.autoSolveActive ? "#9ea6b1" : active ? "#ffffff" : "#f5f7f9");
            button.label.setFontStyle(active ? "bold" : "normal");
        }
    }

    private refreshOverlay(): void {

        const visible = this.mode !== "playing";
        const won = this.mode === "won";
        const lost = this.mode === "lost";
        const winOverlayWasVisible = this.winOverlayRoot.visible;

        this.overlayScrim.setVisible(lost);
        this.overlayPanel.setVisible(lost);
        this.overlayTitle.setVisible(lost);
        this.overlayBody.setVisible(lost);
        this.overlayButton.setVisible(lost);
        this.overlayButtonHitArea.setVisible(lost);
        this.winOverlayRoot.setVisible(won);

        if (lost) {
            this.overlayButtonHitArea.setInteractive({ useHandCursor: true });
        } else {
            this.overlayButtonHitArea.disableInteractive();
        }

        if (won) {
            this.winOverlayMainButtonHitArea.setInteractive({ useHandCursor: true });
            this.winOverlayNewButtonHitArea.setInteractive({ useHandCursor: true });
        } else {
            this.winOverlayMainButtonHitArea.disableInteractive();
            this.winOverlayNewButtonHitArea.disableInteractive();
        }

        const showSettingsButton = !visible && !this.autoSolveActive;
        this.settingsButtonCircle.setVisible(showSettingsButton);
        this.settingsButtonIcon.setVisible(showSettingsButton);
        this.settingsButtonHitArea.setVisible(showSettingsButton);
        if (showSettingsButton) {
            this.settingsButtonHitArea.setInteractive({ useHandCursor: true });
        } else {
            this.settingsButtonHitArea.disableInteractive();
        }

        if (!visible) {
            this.overlayButtonBg.setFillStyle(0x11161d, 1);
            this.winOverlayRoot.setAlpha(1);
            this.winOverlayTitle.setScale(1);
            this.winOverlayStats.setAlpha(1);
            this.winOverlayTrophy.setScale(1);
            this.winOverlayMainButtonBg.setAlpha(1);
            this.winOverlayMainButtonIconBadge.setAlpha(1);
            this.winOverlayMainButtonLabel.setAlpha(1);
            this.winOverlayMainButtonSubLabel.setAlpha(1);
            this.winOverlayMainIcon.setAlpha(1);
            this.winOverlayNewButtonBg.setAlpha(1);
            this.winOverlayNewButtonIconBadge.setAlpha(1);
            this.winOverlayNewButtonLabel.setAlpha(1);
            this.winOverlayNewButtonSubLabel.setAlpha(1);
            this.winOverlayNewIcon.setAlpha(1);
            return;
        }

        this.overlayTitle.setText("Three Mistakes");
        this.overlayBody.setText("You hit the mistake limit.\nTap restart to try again.");
        this.overlayButtonLabel.setText("Restart");

        if (won) {
            const totalSeconds = Math.floor(this.elapsedMs / 1000);
            const mistakeLine = this.mistakes === 0 ? "Clean solve" : `${this.mistakes} mistake${this.mistakes === 1 ? "" : "s"}`;
            const hintLine = this.hintsUsed === 0 ? "no hints" : `${this.hintsUsed} hint${this.hintsUsed === 1 ? "" : "s"} used`;
            this.winOverlayStats.setText(
                `Solved in ${this.formatTime(totalSeconds)}\n${mistakeLine}  •  ${hintLine}`
            );
            this.setWinButtonHoverState("main", false);
            this.setWinButtonHoverState("new", false);

            if (!winOverlayWasVisible) {
                this.winOverlayRoot.setAlpha(0);
                this.winOverlayTitle.setScale(0.92);
                this.winOverlayStats.setAlpha(0);
                this.winOverlayTrophy.setScale(0.84);
                this.winOverlayMainButtonBg.setAlpha(0);
                this.winOverlayMainButtonIconBadge.setAlpha(0);
                this.winOverlayMainButtonLabel.setAlpha(0);
                this.winOverlayMainButtonSubLabel.setAlpha(0);
                this.winOverlayMainIcon.setAlpha(0);
                this.winOverlayNewButtonBg.setAlpha(0);
                this.winOverlayNewButtonIconBadge.setAlpha(0);
                this.winOverlayNewButtonLabel.setAlpha(0);
                this.winOverlayNewButtonSubLabel.setAlpha(0);
                this.winOverlayNewIcon.setAlpha(0);

                this.tweens.add({
                    targets: this.winOverlayRoot,
                    alpha: 1,
                    duration: 220,
                    ease: "Quad.Out"
                });
                this.tweens.add({
                    targets: this.winOverlayTitle,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 340,
                    ease: "Back.Out"
                });
                this.tweens.add({
                    targets: this.winOverlayStats,
                    alpha: 1,
                    duration: 260,
                    delay: 60,
                    ease: "Quad.Out"
                });
                this.tweens.add({
                    targets: this.winOverlayTrophy,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 420,
                    ease: "Back.Out"
                });
                this.tweens.add({
                    targets: [
                        this.winOverlayMainButtonBg,
                        this.winOverlayMainButtonIconBadge,
                        this.winOverlayMainButtonLabel,
                        this.winOverlayMainButtonSubLabel,
                        this.winOverlayMainIcon,
                        this.winOverlayNewButtonBg,
                        this.winOverlayNewButtonIconBadge,
                        this.winOverlayNewButtonLabel,
                        this.winOverlayNewButtonSubLabel,
                        this.winOverlayNewIcon
                    ],
                    alpha: 1,
                    duration: 260,
                    delay: 140,
                    ease: "Quad.Out"
                });
            }
        }

        this.submitFinalScore();
    }

    private renderGameToText(): string {

        const payload = {
            scene: "level",
            mode: this.mode,
            timer: this.formatTime(Math.floor(this.elapsedMs / 1000)),
            score: this.score,
            mistakes: { used: this.mistakes, max: MAX_MISTAKES },
            gems: this.gems,
            hints: { used: this.hintsUsed, max: MAX_HINTS, remaining: MAX_HINTS - this.hintsUsed },
            pencilMode: this.pencilMode,
            settings: this.settings,
            modalOpen: this.modalOpen,
            autoSolve: {
                active: this.autoSolveActive,
                remaining: this.autoSolveQueue.length
            },
            selectedCell: {
                row: this.selectedRow + 1,
                col: this.selectedCol + 1
            },
            selectedNumber: this.selectedNumber,
            coordinateSystem: "Rows and columns are 1-based from the top-left; x grows right and y grows down.",
            rows: this.board.map((row) => row.map((cell) => ({
                value: cell.value,
                given: cell.given,
                wrong: cell.wrong,
                scored: cell.scored,
                notes: [...cell.notes].sort((a, b) => a - b)
            })))
        };

        return JSON.stringify(payload);
    }

    private formatTime(totalSeconds: number): string {

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")} : ${String(seconds).padStart(2, "0")}`;
    }

    private formatNotes(notes: Set<number>): string {

        const values = new Set(notes);
        const lines: string[] = [];

        for (let row = 0; row < 3; row++) {
            const digits: string[] = [];

            for (let col = 0; col < 3; col++) {
                const value = row * 3 + col + 1;
                digits.push(values.has(value) ? String(value) : " ");
            }

            lines.push(digits.join(" "));
        }

        return lines.join("\n");
    }

    private isSolved(): boolean {

        for (const row of this.board) {
            for (const cell of row) {
                if (cell.value !== cell.solution || cell.wrong) {
                    return false;
                }
            }
        }

        return true;
    }

    private isToolEnabled(key: ToolKey): boolean {

        const cell = this.board[this.selectedRow][this.selectedCol];

        if (this.autoSolveActive) {
            return false;
        }

        switch (key) {
            case "undo":
                return this.mode === "playing" && this.history.length > 0;
            case "clear":
                return !cell.given && (cell.value !== null || cell.notes.size > 0);
            case "pencil":
                return this.mode === "playing";
            case "hint":
                return this.mode === "playing" && this.gems >= HINT_COST && this.hintsUsed < MAX_HINTS;
        }
    }

    private snapshotCell(cell: CellModel): CellSnapshot {

        return {
            value: cell.value,
            notes: [...cell.notes].sort((a, b) => a - b),
            wrong: cell.wrong,
            scored: cell.scored
        };
    }

    private pushHistory(
        row: number,
        col: number,
        before: CellSnapshot,
        after: CellSnapshot,
        beforeMistakes: number,
        afterMistakes: number,
        beforeGems: number,
        afterGems: number,
        beforeMode: GameMode = this.mode,
        afterMode: GameMode = this.mode,
        beforeSelectedNumber: number | null = this.selectedNumber,
        afterSelectedNumber: number | null = this.selectedNumber,
        beforeHintsUsed: number = this.hintsUsed,
        afterHintsUsed: number = this.hintsUsed,
        beforeScore: number = this.score,
        afterScore: number = this.score
    ): void {

        const move: MoveRecord = {
            row,
            col,
            before,
            after,
            beforeMistakes,
            afterMistakes,
            beforeGems,
            afterGems,
            beforeScore,
            afterScore,
            beforeHintsUsed,
            afterHintsUsed,
            beforeMode,
            afterMode,
            beforeSelectedNumber,
            afterSelectedNumber
        };

        this.history.push(move);
    }

    private syncSelectedNumberFromCell(): void {

        const cell = this.board[this.selectedRow][this.selectedCol];

        if (cell.value !== null) {
            this.selectedNumber = cell.value;
            return;
        }

        this.selectedNumber = null;
    }

    private generatePuzzle(): { solution: number[][]; givens: boolean[][] } {

        const solution = this.generateSolutionGrid();
        const givens = Array.from({ length: 9 }, () => Array<boolean>(9).fill(false));
        const positions = this.shuffleArray(
            Array.from({ length: 81 }, (_, index) => ({
                row: Math.floor(index / 9),
                col: index % 9
            }))
        );
        const targetClues = Phaser.Math.Between(30, 36);

        for (let index = 0; index < targetClues; index++) {
            const cell = positions[index];
            givens[cell.row][cell.col] = true;
        }

        this.ensureMinimumClues(givens, 0, 2);
        this.ensureMinimumClues(givens, 1, 2);
        this.ensureMinimumClues(givens, 2, 2);

        return { solution, givens };
    }

    private generateSolutionGrid(): number[][] {

        const digits = this.shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const rowOrder = this.createSudokuUnitOrder();
        const colOrder = this.createSudokuUnitOrder();

        return rowOrder.map((sourceRow) =>
            colOrder.map((sourceCol) => digits[BASE_SOLUTION[sourceRow][sourceCol] - 1])
        );
    }

    private createSudokuUnitOrder(): number[] {

        const order: number[] = [];

        for (const band of this.shuffleArray([0, 1, 2])) {
            const offsets = this.shuffleArray([0, 1, 2]);
            for (const offset of offsets) {
                order.push(band * 3 + offset);
            }
        }

        return order;
    }

    private ensureMinimumClues(givens: boolean[][], groupType: 0 | 1 | 2, minimum: number): void {

        for (let group = 0; group < 9; group++) {
            while (this.countGroupClues(givens, groupType, group) < minimum) {
                const candidates = this.shuffleArray(this.getGroupCells(groupType, group))
                    .filter(({ row, col }) => !givens[row][col]);

                const cell = candidates[0];

                if (!cell) {
                    break;
                }

                givens[cell.row][cell.col] = true;
            }
        }
    }

    private countGroupClues(givens: boolean[][], groupType: 0 | 1 | 2, group: number): number {

        return this.getGroupCells(groupType, group)
            .reduce((count, { row, col }) => count + (givens[row][col] ? 1 : 0), 0);
    }

    private getGroupCells(groupType: 0 | 1 | 2, group: number): Array<{ row: number; col: number }> {

        const cells: Array<{ row: number; col: number }> = [];

        if (groupType === 0) {
            for (let col = 0; col < 9; col++) {
                cells.push({ row: group, col });
            }
            return cells;
        }

        if (groupType === 1) {
            for (let row = 0; row < 9; row++) {
                cells.push({ row, col: group });
            }
            return cells;
        }

        const startRow = Math.floor(group / 3) * 3;
        const startCol = (group % 3) * 3;

        for (let row = startRow; row < startRow + 3; row++) {
            for (let col = startCol; col < startCol + 3; col++) {
                cells.push({ row, col });
            }
        }

        return cells;
    }

    private findPreferredEditableCell(): { row: number; col: number } {

        const preferredOrder = [
            { row: 4, col: 4 },
            { row: 4, col: 3 },
            { row: 4, col: 5 },
            { row: 3, col: 4 },
            { row: 5, col: 4 }
        ];

        for (const cell of preferredOrder) {
            if (!this.board[cell.row]?.[cell.col]?.given) {
                return cell;
            }
        }

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (!this.board[row][col].given) {
                    return { row, col };
                }
            }
        }

        return { row: 0, col: 0 };
    }

    private shuffleArray<T>(values: T[]): T[] {

        const copy = [...values];

        for (let index = copy.length - 1; index > 0; index--) {
            const swapIndex = Phaser.Math.Between(0, index);
            [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
        }

        return copy;
    }

    private getBoxLeft(boxCol: number): number {

        return BOARD_X + boxCol * (BOX_SIZE + BOX_GAP);
    }

    private getBoxTop(boxRow: number): number {

        return BOARD_Y + boxRow * (BOX_SIZE + BOX_GAP);
    }

    private getCellLeft(col: number): number {

        return this.getBoxLeft(Math.floor(col / 3)) + (col % 3) * CELL_SIZE;
    }

    private getCellTop(row: number): number {

        return this.getBoxTop(Math.floor(row / 3)) + (row % 3) * CELL_SIZE;
    }

    private drawToolIcon(icon: Phaser.GameObjects.Graphics, key: ToolKey, color: number): void {

        icon.clear();
        icon.lineStyle(2.4, color, 1);

        switch (key) {
            case "undo":
                icon.beginPath();
                icon.moveTo(11, -5);
                icon.lineTo(-4, -5);
                icon.arc(-4, 4, 9, Phaser.Math.DegToRad(270), Phaser.Math.DegToRad(30), false);
                icon.strokePath();
                icon.beginPath();
                icon.moveTo(-5, -5);
                icon.lineTo(-11, 0);
                icon.lineTo(-5, 5);
                icon.strokePath();
                break;
            case "clear":
                icon.beginPath();
                icon.moveTo(-8, -7);
                icon.lineTo(8, -7);
                icon.lineTo(5, 9);
                icon.lineTo(-5, 9);
                icon.closePath();
                icon.strokePath();
                icon.beginPath();
                icon.moveTo(-4, -10);
                icon.lineTo(4, -10);
                icon.strokePath();
                break;
            case "pencil":
                icon.beginPath();
                icon.moveTo(-8, 8);
                icon.lineTo(8, -8);
                icon.lineTo(11, -5);
                icon.lineTo(-5, 11);
                icon.closePath();
                icon.strokePath();
                break;
            case "hint":
                icon.beginPath();
                icon.arc(0, -2, 8, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false);
                icon.strokePath();
                icon.beginPath();
                icon.moveTo(-4, 5);
                icon.lineTo(4, 5);
                icon.moveTo(-2, 10);
                icon.lineTo(2, 10);
                icon.strokePath();
                break;
        }
    }

}
