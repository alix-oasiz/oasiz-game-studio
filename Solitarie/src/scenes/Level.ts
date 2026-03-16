import Phaser from "phaser";
import { clearBackButtonHandler, gameplayStart, gameplayStop, setBackButtonHandler, submitPlatformScore, triggerPlatformHaptic } from "../platform/oasiz";
import { syncBackgroundMusic } from "../audio/backgroundMusic";
import { BUTTON_FONT_FAMILY, UI_FONT_FAMILY, getUiTextResolution, normalizeUiFontWeight } from "../ui/fonts";
import { hideAllHtmlButtons, hideHtmlButton, showHtmlButton } from "../ui/htmlButton";
import { hideAllHtmlText, hideHtmlText, showHtmlText } from "../ui/htmlText";
import { HOW_TO_PLAY_PAGES } from "../ui/howToPlayPages";

type Suit = "♠" | "♥" | "♦" | "♣";
type PileType = "stock" | "waste" | "tableau" | "foundation";
type HapticType = "light" | "medium" | "heavy" | "success" | "error";

interface CardData {
    id: string;
    suit: Suit;
    rank: number;
    faceUp: boolean;
}

interface CardGO {
    data: CardData;
    container: Phaser.GameObjects.Container;
    shadow: Phaser.GameObjects.Rectangle;
    front: Phaser.GameObjects.Image;
    back: Phaser.GameObjects.Image;
    hitZone: Phaser.GameObjects.Zone;
    source: { type: PileType; index?: number };
}

interface SettingsState {
    music: boolean;
    fx: boolean;
    haptics: boolean;
    drawCount: number;
    background: string;
}

interface HintSuggestion {
    card: CardGO | null;
    target: { x: number; y: number };
    message?: string;
}

interface EndOverlayConfig {
    featuredCard?: CardData;
    featuredMessage?: string;
    baseScore?: number;
    timeBonus?: number;
    moveBonus?: number;
    finalScore?: number;
    showVictoryDetails?: boolean;
}

interface EndOverlayState {
    title: string;
    subtitle: string;
    config?: EndOverlayConfig;
}

interface TopButtonControl {
    setLabel: (label: string) => void;
    setEnabled: (enabled: boolean) => void;
}

interface UndoSnapshot {
    stockIds: string[];
    wasteIds: string[];
    foundationIds: string[][];
    tableauIds: string[][];
    faceUpById: Record<string, boolean>;
    moveCount: number;
    hintsRemaining: number;
    madeProgressThisStockCycle: boolean;
}

interface GameplayHtmlLayout {
    scoreX: number;
    movesX: number;
    timeX: number;
    statsY: number;
    buttonWidth: number;
    buttonHeight: number;
    undoButtonWidth: number;
    infoButtonSize: number;
    newButtonX: number;
    hintButtonX: number;
    undoButtonX: number;
    settingsButtonX: number;
    buttonCenterY: number;
    infoButtonX: number;
    infoButtonY: number;
}

export default class Level extends Phaser.Scene {
    private static readonly TARGET_CARD_W = 63;
    private static readonly TARGET_CARD_H = 89;
    private static readonly TOP_BUTTON_HEIGHT = 38;
    private static readonly TOP_BUTTON_GAP_BELOW = 16;
    private static readonly SCORE_CELEBRATION_MESSAGES = [
        "Congratulations",
        "Amazing",
        "Fantastic",
        "Brilliant",
        "Excellent",
        "Stunning",
        "Great move",
        "Superb",
        "Wonderful",
        "Outstanding"
    ];
    private static readonly SCORE_CELEBRATION_NUMBER_COLORS = [
        "#F1C40F",
        "#00A1E4",
        "#B3131B",
        "#FFFFFF",
        "#2ECC71",
        "#9B59B6",
        "#E67E22",
        "#FF4F87",
        "#16A085",
        "#34495E"
    ];
    private static readonly SCORE_CELEBRATION_MESSAGE_COLORS = [
        "#B3131B",
        "#111111",
        "#00A1E4",
        "#F1C40F",
        "#2ECC71",
        "#9B59B6",
        "#E67E22",
        "#FF4F87",
        "#16A085",
        "#FFFFFF"
    ];
    private cardW = 59;
    private cardH = 83;
    private tableauGapX = 112;
    private faceUpOffset = 30;
    private faceDownOffset = 12;
    private drawCount = 1;

    private stock: CardGO[] = [];
    private waste: CardGO[] = [];
    private foundations: CardGO[][] = [[], [], [], []];
    private tableau: CardGO[][] = [[], [], [], [], [], [], []];

    private stockPos = new Phaser.Math.Vector2();
    private wastePos = new Phaser.Math.Vector2();
    private foundationPos: Phaser.Math.Vector2[] = [];
    private tableauPos: Phaser.Math.Vector2[] = [];

    private stockSlot!: Phaser.GameObjects.Rectangle;
    private dragGroup: CardGO[] = [];
    private dragStart: { x: number; y: number }[] = [];

    private scoreText?: Phaser.GameObjects.Text;
    private movesText?: Phaser.GameObjects.Text;
    private timeText?: Phaser.GameObjects.Text;
    private settingsOverlay?: Phaser.GameObjects.Container;
    private endOverlay!: Phaser.GameObjects.Container;
    private endOverlayState?: EndOverlayState;
    private leaveOverlay?: Phaser.GameObjects.Container;
    private howToOverlay?: Phaser.GameObjects.Container;
    private activeHintText?: Phaser.GameObjects.Text;
    private activeHintHighlight?: Phaser.GameObjects.Graphics;
    private activeHintTimer?: Phaser.Time.TimerEvent;
    private hintButton?: TopButtonControl;
    private gameplayHtmlLayout?: GameplayHtmlLayout;
    private activeScoreCelebration?: Phaser.GameObjects.Container;
    private scoreCelebrationMessageIndex = 0;
    private scoreCelebrationColorIndex = 0;
    private hoveredCard?: CardGO;
    private hoverPointerPos = new Phaser.Math.Vector2();
    private dragPointerPos = new Phaser.Math.Vector2();
    private returningCards = new Set<CardGO>();
    private drawAnimating = false;

    private settings: SettingsState = { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
    private hudTimer?: Phaser.Time.TimerEvent;
    private gameStarted = false;
    private moveCount = 0;
    private elapsedSeconds = 0;
    private hintsRemaining = 5;
    private reversesRemaining = 3;
    private madeProgressThisStockCycle = false;
    private isShuttingDown = false;
    private howToPageIndex = 0;
    private lastHintRequestAt = 0;
    private lastUndoRequestAt = 0;
    private undoHistory: UndoSnapshot[] = [];
    private readonly handleResize = () => {
        this.redrawTable();
        this.layoutAll();
        this.rebuildOverlays();
    };

    constructor() {
        super("Level");
    }

    create() {
        hideAllHtmlText();
        hideAllHtmlButtons();
        this.isShuttingDown = false;
        this.settings = this.loadSettings();
        this.drawCount = this.settings.drawCount;
        this.scale.on("resize", this.handleResize);

        this.redrawTable();
        this.initInput();
        this.newGame();
        this.gameStarted = true;
        gameplayStart();
        syncBackgroundMusic(this, this.settings.music, true);
        const handleBackButton = () => {
            if (this.isBlockingOverlayVisible()) return;
            this.openLeaveOverlay();
        };
        setBackButtonHandler(handleBackButton);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.isShuttingDown = true;
            this.hudTimer?.remove(false);
            this.hudTimer = undefined;
            this.hideGameplayHtml();
            this.hideLeaveOverlayHtml();
            this.hideHowToOverlayHtml();
            this.destroySettingsOverlay(false);
            this.scale.off("resize", this.handleResize);
            if (this.leaveOverlay) {
                this.tweens.killTweensOf(this.leaveOverlay);
                this.leaveOverlay.destroy();
                this.leaveOverlay = undefined;
            }
            this.destroyHowToOverlay(false);
            hideAllHtmlText();
            hideAllHtmlButtons();
            clearBackButtonHandler(handleBackButton);
        });
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

    private isMobile() {
        return window.matchMedia("(pointer: coarse)").matches;
    }

    private isBlockingOverlayVisible(): boolean {
        return !!this.settingsOverlay?.visible || !!this.endOverlay?.visible || !!this.leaveOverlay?.visible || !!this.howToOverlay?.visible;
    }

    private triggerHaptic(type: HapticType) {
        triggerPlatformHaptic(this.settings.haptics, type);
    }

    private calculateBaseScore(): number {
        let score = 0;
        this.foundations.forEach((pile) => {
            pile.forEach((card) => {
                if (card.data.rank >= 1) {
                    score += 10;
                }
            });
        });
        return score;
    }

    private calculateTimeBonus(): number {
        if (this.elapsedSeconds <= 30) return 0;
        return Math.round(700000 / this.elapsedSeconds);
    }

    private calculateMoveBonus(): number {
        return Math.max(0, 1800 - this.moveCount * 12);
    }

    private calculateFinalScore(): number {
        return this.calculateBaseScore() + this.calculateTimeBonus() + this.calculateMoveBonus();
    }

    private formatVictoryBreakdown(baseScore: number, timeBonus: number, moveBonus: number): string {
        return [
            `Total score  ${baseScore}`,
            `Time bonus  +${timeBonus}   Time  ${this.formatElapsedTime(this.elapsedSeconds)}`,
            `Move bonus  +${moveBonus}   Moves  ${this.moveCount}`
        ].join("\n");
    }

    private animateVictoryScore(
        scoreBreakdown: Phaser.GameObjects.Text,
        finalScoreText: Phaser.GameObjects.Text,
        baseScore: number,
        timeBonus: number,
        moveBonus: number,
        finalScore: number
    ): void {
        const values = { baseScore: 0, timeBonus: 0, moveBonus: 0 };
        let lastTickAt = 0;
        const playCountTick = () => {
            const now = this.time.now;
            if (now - lastTickAt < 90) return;
            lastTickAt = now;
            this.playLoadedFx("score_count_tick", { volume: 0.22, rate: 1.04 });
        };
        scoreBreakdown.setText(this.formatVictoryBreakdown(0, 0, 0));
        finalScoreText.setScale(0.94);
        finalScoreText.setText("Final score 0");

        this.time.delayedCall(260, () => {
            showHtmlText("end-score-breakdown", {
                text: this.formatVictoryBreakdown(0, 0, 0),
                x: this.scale.width * 0.5,
                y: scoreBreakdown.y,
                fontSize: 17,
                maxWidth: 400,
                letterSpacing: 0.2,
                variant: "modal",
                multicolor: false,
                color: "#ECF0F1",
                strokeColor: "#111111",
                strokeWidth: 1.2
            });
        });

        this.tweens.addCounter({
            from: 0,
            to: baseScore,
            duration: 520,
            delay: 280,
            ease: "Cubic.out",
            onUpdate: (tween) => {
                const nextValue = Math.round(tween.getValue());
                if (nextValue !== values.baseScore) playCountTick();
                values.baseScore = nextValue;
                const text = this.formatVictoryBreakdown(values.baseScore, values.timeBonus, values.moveBonus);
                scoreBreakdown.setText(text);
                showHtmlText("end-score-breakdown", {
                    text,
                    x: this.scale.width * 0.5,
                    y: scoreBreakdown.y,
                    fontSize: 17,
                    maxWidth: 400,
                    letterSpacing: 0.2,
                    variant: "modal",
                    multicolor: false,
                    color: "#ECF0F1",
                    strokeColor: "#111111",
                    strokeWidth: 1.2
                });
            }
        });

        this.tweens.addCounter({
            from: 0,
            to: timeBonus,
            duration: 520,
            delay: 860,
            ease: "Cubic.out",
            onUpdate: (tween) => {
                const nextValue = Math.round(tween.getValue());
                if (nextValue !== values.timeBonus) playCountTick();
                values.timeBonus = nextValue;
                const text = this.formatVictoryBreakdown(values.baseScore, values.timeBonus, values.moveBonus);
                scoreBreakdown.setText(text);
                showHtmlText("end-score-breakdown", {
                    text,
                    x: this.scale.width * 0.5,
                    y: scoreBreakdown.y,
                    fontSize: 17,
                    maxWidth: 400,
                    letterSpacing: 0.2,
                    variant: "modal",
                    multicolor: false,
                    color: "#ECF0F1",
                    strokeColor: "#111111",
                    strokeWidth: 1.2
                });
            }
        });

        this.tweens.addCounter({
            from: 0,
            to: moveBonus,
            duration: 520,
            delay: 1440,
            ease: "Cubic.out",
            onUpdate: (tween) => {
                const nextValue = Math.round(tween.getValue());
                if (nextValue !== values.moveBonus) playCountTick();
                values.moveBonus = nextValue;
                const text = this.formatVictoryBreakdown(values.baseScore, values.timeBonus, values.moveBonus);
                scoreBreakdown.setText(text);
                showHtmlText("end-score-breakdown", {
                    text,
                    x: this.scale.width * 0.5,
                    y: scoreBreakdown.y,
                    fontSize: 17,
                    maxWidth: 400,
                    letterSpacing: 0.2,
                    variant: "modal",
                    multicolor: false,
                    color: "#ECF0F1",
                    strokeColor: "#111111",
                    strokeWidth: 1.2
                });
            }
        });

        this.time.delayedCall(2020, () => {
            this.tweens.addCounter({
                from: 0,
                to: finalScore,
                duration: 620,
                ease: "Cubic.out",
                onUpdate: (tween) => {
                    playCountTick();
                    const text = `Final score ${Math.round(tween.getValue())}`;
                    finalScoreText.setText(text);
                    showHtmlText("end-final-score", {
                        text,
                        x: this.scale.width * 0.5,
                        y: finalScoreText.y,
                        fontSize: 28,
                        letterSpacing: 0.4,
                        multicolor: false,
                        color: "#FFFFFF",
                        strokeColor: "#B3131B",
                        strokeWidth: 1.6
                    });
                },
                onComplete: () => {
                    this.playVictoryFinal();
                    this.tweens.add({
                        targets: finalScoreText,
                        scale: 1,
                        duration: 180,
                        ease: "Back.easeOut"
                    });
                }
            });
        });
    }

    private submitScore(score = this.calculateBaseScore()) {
        submitPlatformScore(score);
    }

    private redrawTable() {
        this.children.removeAll();

        const w = this.scale.width;
        const h = this.scale.height;
        const mobilePortrait = h > w;

        const bg = this.add.image(w * 0.5, h * 0.5, this.settings.background);
        bg.setDisplaySize(w, h).setDepth(-1000);

        const topSafe = this.isMobile() ? 180 : 45;
        const hudButtonY = Math.max(24, topSafe - 15);
        const hudBottom = hudButtonY + Level.TOP_BUTTON_HEIGHT + 10;
        const left = mobilePortrait ? 0 : Math.max(18, Math.floor(w * 0.025));
        const top = Math.max(topSafe + (mobilePortrait ? 8 : 46), hudBottom + Level.TOP_BUTTON_GAP_BELOW);
        let tableauGap = mobilePortrait ? -10 : 8;
        let foundationGap = mobilePortrait ? 0 : 8;
        const availableWidth = w - left * 2;

        if (mobilePortrait) {
            this.cardW = Level.TARGET_CARD_W;
            this.cardH = Level.TARGET_CARD_H;

            // Force a wider visual card on mobile and let columns overlap to fit 7 across.
            const tableauStep = Math.max(46, Math.floor((availableWidth - this.cardW) / 6));
            tableauGap = tableauStep - this.cardW;

            // The top row also needs overlap to fit six piles across the phone width.
            const topRowStep = Math.max(52, Math.floor((availableWidth - this.cardW) / 5));
            foundationGap = topRowStep - this.cardW;
        } else {
            this.cardW = Level.TARGET_CARD_W;
            this.cardH = Level.TARGET_CARD_H;
        }

        this.tableauGapX = this.cardW + tableauGap;
        this.faceUpOffset = mobilePortrait ? Math.floor(this.cardH * 0.15) : 24;
        this.faceDownOffset = mobilePortrait ? Math.floor(this.cardH * 0.05) : 9;

        const wasteVisibleOffset = this.getWasteVisibleOffset();
        const wasteVisibleWidth = this.cardW + wasteVisibleOffset * 2;
        const stockWasteGap = mobilePortrait ? 4 : 14;
        const stockWasteWidth = wasteVisibleWidth + stockWasteGap + this.cardW;
        const topGroupGap = mobilePortrait ? 8 : 20;
        const foundationStep = mobilePortrait
            ? Math.max(37, Math.floor((availableWidth - stockWasteWidth - topGroupGap - this.cardW) / 3))
            : this.cardW + foundationGap;
        this.foundationPos = [];
        const foundationStart = left;
        for (let i = 0; i < 4; i++) this.foundationPos.push(new Phaser.Math.Vector2(foundationStart + i * foundationStep, top));

        const stockWasteStart = w - left - stockWasteWidth;
        this.wastePos.set(stockWasteStart, top);
        this.stockPos.set(stockWasteStart + wasteVisibleWidth + stockWasteGap, top);

        this.tableauPos = [];
        const tableauY = top + this.cardH + (mobilePortrait ? 6 : 20);
        for (let i = 0; i < 7; i++) this.tableauPos.push(new Phaser.Math.Vector2(left + i * this.tableauGapX, tableauY));

        const slot = (x: number, y: number, type: "none" | "stock" | "waste" | "suit", suitIndex = 0) => {
            const r = this.add.rectangle(x, y, this.cardW, this.cardH, 0x07110d, 0.35).setOrigin(0, 0);
            r.setStrokeStyle(2, 0xffffff, 0.23);
            const suitFontSize = Math.max(24, Math.floor(this.cardW * 0.5));
            const slotLabelSize = Math.max(10, Math.floor(this.cardW * 0.15));

            if (type === "suit") {
                const s = ["♠", "♥", "♦", "♣"][suitIndex];
                const color = (suitIndex === 1 || suitIndex === 2) ? "#E74C3C" : "#BDC3C7";
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, s, this.uiText(suitFontSize, color, "800")).setOrigin(0.5).setAlpha(0.25);
            } else if (type === "stock") {
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "Stock", this.uiText(slotLabelSize, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
            } else if (type === "waste") {
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "Waste", this.uiText(slotLabelSize, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
            }
            return r;
        };

        this.stockSlot = slot(this.stockPos.x, this.stockPos.y, "stock");
        slot(this.wastePos.x, this.wastePos.y, "waste");
        this.foundationPos.forEach((p, i) => slot(p.x, p.y, "suit", i));
        this.tableauPos.forEach((p) => slot(p.x, p.y, "none"));

        this.stockSlot.setInteractive({ useHandCursor: true });
        this.stockSlot.on("pointerdown", () => this.drawFromStock());

        this.createHUD(topSafe);

        // Create confetti texture for win animation
        if (!this.textures.exists("confetti")) {
            const g = this.make.graphics();
            g.fillStyle(0xffffff);
            g.fillRect(0, 0, 8, 8);
            g.generateTexture("confetti", 8, 8);
        }
    }

    private uiText(size = 20, color = "#ffffff", weight: string = "700", stroke?: string): Phaser.Types.GameObjects.Text.TextStyle {
        const strokeThickness = !stroke ? 0 : size <= 18 ? 1 : size <= 24 ? 2 : 3;
        return {
            fontSize: `${size}px`,
            color: stroke ? "#111111" : color,
            fontStyle: normalizeUiFontWeight(weight),
            fontFamily: UI_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: stroke ? "#FFFFFF" : undefined,
            strokeThickness
        };
    }

    private createHUD(topSafe: number) {
        const y = Math.max(24, topSafe - 15);

        const w = this.scale.width;
        const mobile = this.isMobile();
        const statsY = Math.max(20, y - (mobile ? 32 : 28));
        const statsGap = mobile ? Math.min(112, w * 0.22) : Math.min(150, w * 0.16);
        const statsStyle = {
            ...this.uiText(mobile ? 17 : 19, "#FFFFFF", "900"),
            align: "center"
        };
        this.scoreText = this.add.text(w * 0.5 - statsGap, statsY, "", statsStyle).setOrigin(0.5).setDepth(2001).setAlpha(0);
        this.movesText = this.add.text(w * 0.5, statsY, "", statsStyle).setOrigin(0.5).setDepth(2001).setAlpha(0);
        this.timeText = this.add.text(w * 0.5 + statsGap, statsY, "", statsStyle).setOrigin(0.5).setDepth(2001).setAlpha(0);

        const buttonWidth = mobile ? 86 : 112;
        const buttonHeight = mobile ? 40 : 42;
        const undoButtonWidth = mobile ? 72 : 96;
        const buttonGap = mobile ? 4 : 10;
        const infoButtonSize = mobile ? 36 : 40;
        const rightInset = mobile ? 8 : 18;
        const settingsX = w - rightInset - buttonWidth;
        const undoX = settingsX - buttonGap - undoButtonWidth;
        const hintX = undoX - buttonGap - buttonWidth;
        const newX = hintX - buttonGap - buttonWidth;
        const infoX = newX - buttonGap - infoButtonSize;

        this.makeTopButton(newX, y, buttonWidth, buttonHeight, "New game", () => {
            this.triggerHaptic("light");
            this.newGame();
        }, "red", true);

        const hintBtn = this.makeTopButton(hintX, y, buttonWidth, buttonHeight, this.getHintButtonLabel(), () => {
            this.triggerHaptic("light");
            this.provideHint();
        }, "green", true);

        this.makeTopButton(settingsX, y, buttonWidth, buttonHeight, "Settings", () => {
            this.triggerHaptic("light");
            this.openSettings();
        }, "blue", true);

        this.hintButton = hintBtn;
        this.updateHintButton();

        this.gameplayHtmlLayout = {
            scoreX: w * 0.5 - statsGap,
            movesX: w * 0.5,
            timeX: w * 0.5 + statsGap,
            statsY,
            buttonWidth,
            buttonHeight,
            undoButtonWidth,
            infoButtonSize,
            newButtonX: newX + buttonWidth / 2,
            hintButtonX: hintX + buttonWidth / 2,
            undoButtonX: undoX + undoButtonWidth / 2,
            settingsButtonX: settingsX + buttonWidth / 2,
            buttonCenterY: y + buttonHeight / 2 - 1,
            infoButtonX: infoX + infoButtonSize / 2,
            infoButtonY: y + buttonHeight / 2 - 1
        };
        this.showGameplayHtml();
        this.updateHUD();
        this.updateUndoButton();
    }

    private makeTopButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        onClick: () => void,
        theme: "red" | "green" | "blue" = "red",
        useHtmlLabel = false
    ): TopButtonControl {
        const c = this.add.container(x, y);
        const radius = 10;
        let currentLabel = label;
        let enabled = true;
        let pressed = false;
        let activatedOnDown = false;

        const btnGraphics = this.add.graphics();
        const drawBtn = (isPressed: boolean, isHover: boolean) => {
            btnGraphics.clear();
            const yOff = isPressed ? 4 : 0;
            const palette = theme === "blue"
                ? {
                    main: isHover ? 0x355CAA : 0x1F3D7A,
                    rim: 0x10254A
                }
                : theme === "green"
                    ? {
                        main: isHover ? 0x35B96A : 0x1E8449,
                        rim: 0x0E4B28
                    }
                    : {
                        main: isHover ? 0xD72638 : 0xB3131B,
                        rim: 0x111111
                    };
            const mainFill = enabled
                ? palette.main
                : 0x444444;
            const rimFill = enabled ? palette.rim : 0x1f1f1f;
            const borderAlpha = enabled ? 0.6 : 0.32;

            if (!isPressed) {
                btnGraphics.fillStyle(0x000000, 0.3);
                btnGraphics.fillRoundedRect(0, 6, w, h, radius);
            }

            // Bottom Rim
            btnGraphics.fillStyle(rimFill, 1);
            btnGraphics.fillRoundedRect(0, yOff + 4, w, h, radius);

            // Main fill
            btnGraphics.fillStyle(mainFill, 1);
            btnGraphics.fillRoundedRect(0, yOff, w, h, radius);

            // Highlight
            btnGraphics.fillStyle(0xFFFFFF, 0.15);
            btnGraphics.fillRoundedRect(5, yOff + 3, w - 10, h / 4, radius - 5);

            btnGraphics.lineStyle(2, 0xFFFFFF, borderAlpha);
            btnGraphics.strokeRoundedRect(0, yOff, w, h, radius);
        };
        drawBtn(false, false);

        const t = this.add.text(w / 2, h / 2 - 1, currentLabel, {
            ...this.uiText(15, "#FFFFFF", "700"),
            fontFamily: BUTTON_FONT_FAMILY
        }).setOrigin(0.5).setAlpha(useHtmlLabel ? 0 : 1);
        const btnHitZone = this.add.zone(w / 2, h / 2, w, h + 8).setInteractive({ useHandCursor: true });
        c.add([btnGraphics, t, btnHitZone]);
        c.setDepth(2000);
        if (useHtmlLabel) {
            btnGraphics.setVisible(false);
            t.setVisible(false);
            btnHitZone.input!.enabled = false;
        }

        btnHitZone.on("pointerover", () => {
            if (!enabled) return;
            drawBtn(false, true);
            document.body.style.cursor = "pointer";
        });
        btnHitZone.on("pointerout", () => {
            if (!enabled) return;
            pressed = false;
            drawBtn(false, false);
            t.y = h / 2 - 2;
            document.body.style.cursor = "default";
        });
        btnHitZone.on("pointerdown", () => {
            if (!enabled) return;
            pressed = true;
            activatedOnDown = false;
            drawBtn(true, true);
            t.y = h / 2 + 2;
            if (this.isMobile()) {
                activatedOnDown = true;
                this.playButton();
                onClick();
            }
        });
        btnHitZone.on("pointerup", () => {
            if (!enabled) return;
            const shouldActivate = pressed && !activatedOnDown;
            pressed = false;
            activatedOnDown = false;
            document.body.style.cursor = "default";
            drawBtn(false, true);
            t.y = h / 2 - 2;
            if (shouldActivate) {
                this.playButton();
                onClick();
            }
        });
        btnHitZone.on("pointerupoutside", () => {
            pressed = false;
            activatedOnDown = false;
            drawBtn(false, false);
            t.y = h / 2 - 2;
            document.body.style.cursor = "default";
        });

        return {
            setLabel: (nextLabel: string) => {
                currentLabel = nextLabel;
                t.setText(nextLabel);
            },
            setEnabled: (nextEnabled: boolean) => {
                enabled = nextEnabled;
                btnHitZone.input!.enabled = nextEnabled;
                t.setAlpha(nextEnabled ? 1 : 0.62);
                drawBtn(false, false);
                if (!nextEnabled) {
                    document.body.style.cursor = "default";
                }
            }
        };
    }

    private initInput() {
        this.input.on("drag", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
            const container = go.parentContainer as Phaser.GameObjects.Container;
            if (!this.gameStarted || !this.dragGroup.length || !container || this.dragGroup[0].container !== container) return;
            const dx = pointer.x - pointer.downX;
            const dy = pointer.y - pointer.downY;
            const stepDx = pointer.x - this.dragPointerPos.x;
            const stepDy = pointer.y - this.dragPointerPos.y;
            this.dragPointerPos.set(pointer.x, pointer.y);
            this.dragGroup.forEach((c, i) => {
                c.container.x = this.dragStart[i].x + dx;
                c.container.y = this.dragStart[i].y + dy;
                this.applyCardTilt(c, Phaser.Math.Clamp(stepDx / 18, -1, 1), Phaser.Math.Clamp(stepDy / 18, -1, 1), true);
            });
        });

        this.input.on("dragstart", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
            if (!this.gameStarted || !go.parentContainer) return;
            const card = this.findCardByContainer(go.parentContainer as Phaser.GameObjects.Container);
            if (!card) return;
            this.dragPointerPos.set(pointer.x, pointer.y);
            this.tryBeginDrag(card);
        });

        this.input.on("dragend", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject, dropped: boolean) => {
            const container = go.parentContainer as Phaser.GameObjects.Container;
            if (!this.gameStarted || !this.dragGroup.length || !container || this.dragGroup[0].container !== container) return;
            this.dragGroup.forEach((card) => this.resetCardTilt(card, true));
            if (!dropped) this.tryDrop(pointer.worldX, pointer.worldY);
        });
    }

    private newGame() {
        [...this.stock, ...this.waste, ...this.foundations.flat(), ...this.tableau.flat()].forEach(c => c.container.destroy());
        this.stock = [];
        this.waste = [];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], []];
        this.dragGroup = [];
        this.dragStart = [];
        this.moveCount = 0;
        this.elapsedSeconds = 0;
        this.hintsRemaining = 5;
        this.reversesRemaining = 3;
        this.lastHintRequestAt = 0;
        this.lastUndoRequestAt = 0;
        this.undoHistory = [];
        this.madeProgressThisStockCycle = false;
        if (this.activeScoreCelebration) {
            this.tweens.killTweensOf(this.activeScoreCelebration.list);
            this.tweens.killTweensOf(this.activeScoreCelebration);
            this.activeScoreCelebration.destroy();
            this.activeScoreCelebration = undefined;
        }
        this.hudTimer?.remove(false);
        this.hudTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (this.isShuttingDown || document.hidden || this.isBlockingOverlayVisible() || !this.gameStarted) {
                    return;
                }
                this.elapsedSeconds += 1;
                this.updateHUD();
            }
        });

        const deck = this.buildDeck();
        for (let col = 0; col < 7; col++) {
            for (let row = 0; row <= col; row++) {
                const card = deck.pop()!;
                card.data.faceUp = row === col;
                card.source = { type: "tableau", index: col };
                this.tableau[col].push(card);
            }
        }
        while (deck.length) {
            const card = deck.pop()!;
            card.data.faceUp = false;
            card.source = { type: "stock" };
            this.stock.push(card);
        }
        this.endOverlayState = undefined;
        this.layoutAll();
        this.endOverlay?.setVisible(false);
        this.updateHintButton();
        this.updateUndoButton();
        this.updateHUD();
    }

    private buildDeck(): CardGO[] {
        const suits: Suit[] = ["♠", "♥", "♦", "♣"];
        const deck: CardGO[] = [];
        for (const suit of suits) for (let rank = 1; rank <= 13; rank++) deck.push(this.createCard({ id: `${suit}${rank}`, suit, rank, faceUp: false }));
        Phaser.Utils.Array.Shuffle(deck);
        return deck;
    }

    private getCardTextureKey(suit: Suit, rank: number): string {
        const suitMap: Record<Suit, string> = { "♠": "spade", "♥": "heart", "♦": "diamond", "♣": "clover" };
        return `card_${suitMap[suit]}_${rank}`;
    }

    private createCard(data: CardData): CardGO {
        const container = this.add.container(0, 0).setSize(this.cardW, this.cardH).setDepth(100);
        const shadow = this.add.rectangle(this.cardW / 2, this.cardH / 2 + 6, this.cardW * 0.88, this.cardH * 0.9, 0x03110b, 0.22);
        const front = this.add.image(0, 0, this.getCardTextureKey(data.suit, data.rank)).setOrigin(0, 0).setDisplaySize(this.cardW, this.cardH);
        const back = this.add.image(0, 0, "card_back").setOrigin(0, 0).setDisplaySize(this.cardW, this.cardH).setVisible(false);
        const cardHitZone = this.add.zone(this.cardW / 2, this.cardH / 2, this.cardW, this.cardH).setInteractive({ useHandCursor: true });
        container.add([shadow, front, back, cardHitZone]);

        this.input.setDraggable(cardHitZone);

        const cardGO: CardGO = {
            data,
            container,
            shadow,
            front,
            back,
            hitZone: cardHitZone,
            source: { type: "stock" }
        };
        this.refreshCardFace(cardGO);

        cardHitZone.on("pointerdown", () => {
            this.clearActiveHint();
            if (cardGO.source.type === "stock") {
                this.drawFromStock();
            }
        });

        cardHitZone.on("pointerover", (pointer: Phaser.Input.Pointer) => {
            if (this.drawAnimating) return;
            this.hoveredCard = cardGO;
            this.hoverPointerPos.set(pointer.worldX, pointer.worldY);
            this.resetCardTilt(cardGO, false);
        });

        cardHitZone.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!cardGO.data.faceUp || this.dragGroup.includes(cardGO) || this.returningCards.has(cardGO)) return;
            const stepDx = pointer.worldX - this.hoverPointerPos.x;
            const stepDy = pointer.worldY - this.hoverPointerPos.y;
            this.hoverPointerPos.set(pointer.worldX, pointer.worldY);
            const nx = Phaser.Math.Clamp(stepDx / 16, -1, 1);
            const ny = Phaser.Math.Clamp(stepDy / 16, -1, 1);
            this.applyCardTilt(cardGO, nx, ny, false);
        });

        cardHitZone.on("pointerout", () => {
            if (this.hoveredCard === cardGO) this.hoveredCard = undefined;
            if (!this.dragGroup.includes(cardGO) && !this.returningCards.has(cardGO)) this.resetCardTilt(cardGO, false);
        });

        return cardGO;
    }

    private refreshCardFace(card: CardGO) {
        card.front.setVisible(card.data.faceUp);
        card.back.setVisible(!card.data.faceUp);
        if (!card.data.faceUp) this.resetCardTilt(card, true);
    }

    private layoutAll() {
        this.layoutStockWaste();
        this.layoutFoundations();
        this.layoutTableau();
        this.updateHUD();
    }

    private getWasteVisibleOffset(): number {
        return this.isMobile() ? Math.max(20, Math.floor(this.cardW * 0.28)) : Math.floor(this.cardW * 0.24);
    }

    private layoutStockWaste() {
        this.stock.forEach((card, i) => {
            card.source = { type: "stock" };
            card.data.faceUp = false;
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            card.container.setScale(1, 1);
            card.container.setVisible(true);
            card.container.setPosition(this.stockPos.x + Math.min(i, 3) * 0.7, this.stockPos.y + Math.min(i, 3) * 0.7).setDepth(80 + i);
        });
        const visibleWasteCount = 3;
        const wasteOffset = this.getWasteVisibleOffset();
        const visibleStart = Math.max(0, this.waste.length - visibleWasteCount);
        this.waste.forEach((card, i) => {
            card.source = { type: "waste" };
            card.data.faceUp = true;
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            card.container.setScale(1, 1);
            const isVisible = i >= visibleStart;
            const visibleIndex = i - visibleStart;
            card.container.setVisible(isVisible);
            card.container.setPosition(this.wastePos.x + Math.max(0, visibleIndex) * wasteOffset, this.wastePos.y).setDepth(230 + visibleIndex);
            if (card.hitZone.input) {
                card.hitZone.input.enabled = isVisible && i === this.waste.length - 1 && !this.drawAnimating;
            }
        });
    }

    private layoutFoundations() {
        this.foundations.forEach((pile, fi) => pile.forEach((card, i) => {
            card.source = { type: "foundation", index: fi };
            card.data.faceUp = true;
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            card.container.setScale(1, 1);
            card.container.setPosition(this.foundationPos[fi].x, this.foundationPos[fi].y).setDepth(340 + fi * 20 + i);
        }));
    }

    private layoutTableau() {
        this.tableau.forEach((col, ci) => {
            let y = this.tableauPos[ci].y;
            col.forEach((card, i) => {
                card.source = { type: "tableau", index: ci };
                this.refreshCardFace(card);
                this.resetCardTilt(card, true);
                card.container.setScale(1, 1);
                card.container.setPosition(this.tableauPos[ci].x, y).setDepth(600 + ci * 40 + i);
                y += card.data.faceUp ? this.faceUpOffset : this.faceDownOffset;
            });
        });
    }

    private drawFromStock() {
        if (!this.gameStarted || this.drawAnimating) return;
        this.clearActiveHint();
        if (this.stock.length === 0) {
            if (!this.waste.length) return;
            if (!this.madeProgressThisStockCycle) {
                this.openEnd("Game over", "No new moves were made in the last pass through the stock.");
                this.submitScore();
                this.triggerHaptic("error");
                return;
            }
            this.pushUndoSnapshot();
            while (this.waste.length) {
                const c = this.waste.pop()!;
                c.data.faceUp = false;
                this.stock.push(c);
            }
            this.madeProgressThisStockCycle = false;
            this.layoutStockWaste();
            this.updateUndoButton();
            return;
        }

        const count = Math.min(this.drawCount, this.stock.length);
        const startWasteCount = this.waste.length;
        const drawnCards: CardGO[] = [];
        this.pushUndoSnapshot();
        this.moveCount += 1;

        for (let i = 0; i < count; i++) {
            const card = this.stock.pop()!;
            card.data.faceUp = false;
            card.source = { type: "waste" };
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            this.waste.push(card);
            drawnCards.push(card);
        }

        this.drawAnimating = true;
        this.updateUndoButton();
        this.layoutStockWaste();
        this.playShuffleDraw();
        this.triggerHaptic("light");
        this.animateDrawFromStock(drawnCards, startWasteCount);
    }

    private animateDrawFromStock(cards: CardGO[], startWasteCount: number) {
        if (this.stockSlot.input) {
            this.stockSlot.input.enabled = false;
        }
        cards.forEach((card) => {
            if (card.hitZone.input) {
                card.hitZone.input.enabled = false;
            }
        });
        const visibleWasteCount = 3;
        const wasteOffset = this.getWasteVisibleOffset();
        const stepDelay = 130;
        const moveDuration = 260;
        const flipDuration = 130;
        const totalWasteCount = startWasteCount + cards.length;
        const visibleStart = Math.max(0, totalWasteCount - visibleWasteCount);

        cards.forEach((card, index) => {
            const finalIndex = startWasteCount + index;
            const targetX = this.wastePos.x + Math.max(0, finalIndex - visibleStart) * wasteOffset;
            const targetY = this.wastePos.y;

            card.container.setPosition(this.stockPos.x, this.stockPos.y);
            card.container.setDepth(1400 + index);
            card.container.setScale(1, 1);
            card.container.setVisible(true);
            card.data.faceUp = false;
            this.refreshCardFace(card);

            this.time.delayedCall(index * stepDelay, () => {
                this.tweens.add({
                    targets: card.container,
                    x: targetX,
                    y: targetY,
                    duration: moveDuration,
                    ease: "Cubic.out"
                });

                this.tweens.add({
                    targets: card.container,
                    scaleX: 0.08,
                    duration: flipDuration,
                    ease: "Sine.in",
                    onComplete: () => {
                        card.data.faceUp = true;
                        this.refreshCardFace(card);
                        this.tweens.add({
                            targets: card.container,
                            scaleX: 1,
                            duration: flipDuration,
                            ease: "Sine.out"
                        });
                    }
                });
            });
        });

        const totalDuration = (cards.length - 1) * stepDelay + moveDuration + flipDuration * 2 + 30;
        this.time.delayedCall(totalDuration, () => {
            this.drawAnimating = false;
            this.layoutStockWaste();
            this.updateHUD();
            this.updateUndoButton();
            if (this.stockSlot.input) {
                this.stockSlot.input.enabled = true;
            }
            cards.forEach((card) => {
                if (card.hitZone.input) {
                    card.hitZone.input.enabled = true;
                }
            });
        });
    }

    private findCardByContainer(container: Phaser.GameObjects.Container): CardGO | undefined {
        return [...this.stock, ...this.waste, ...this.foundations.flat(), ...this.tableau.flat()].find(c => c.container === container);
    }

    private tryBeginDrag(card: CardGO) {
        if (this.drawAnimating) return;
        const movable = this.getMovableStack(card);
        if (!movable.length) return;
        this.playCardPick();
        this.dragGroup = movable;
        this.dragStart = movable.map(c => ({ x: c.container.x, y: c.container.y }));
        movable.forEach((c, i) => c.container.setDepth(1800 + i));
    }

    private getMovableStack(card: CardGO): CardGO[] {
        if (!card.data.faceUp) return [];
        if (card.source.type === "waste") {
            const top = this.waste[this.waste.length - 1];
            return top === card ? [card] : [];
        }
        if (card.source.type === "tableau") {
            const col = this.tableau[card.source.index!];
            const idx = col.indexOf(card);
            if (idx < 0 || idx !== col.length - 1 && !col.slice(idx).every(c => c.data.faceUp)) return [];
            const stack = col.slice(idx);
            for (let i = 0; i < stack.length - 1; i++) {
                const a = stack[i].data, b = stack[i + 1].data;
                if (!this.isOppositeColor(a, b) || a.rank !== b.rank + 1) return [];
            }
            return stack;
        }
        return [];
    }

    private tryDrop(x: number, y: number) {
        if (!this.dragGroup.length) return;
        const first = this.dragGroup[0];
        const source = { ...first.source };

        const foundationHit = this.foundationPos.findIndex(p => this.pointInCard(x, y, p.x, p.y));
        if (foundationHit >= 0 && this.dragGroup.length === 1 && this.canMoveToFoundation(first, foundationHit)) {
            this.pushUndoSnapshot();
            if (!this.removeFromSource(this.dragGroup, source)) return this.restoreDragGroup();
            this.foundations[foundationHit].push(first);
            const awardedPoints = 10;
            this.afterMove(true, this.foundationPos[foundationHit], awardedPoints);
            return;
        }

        const tableauHit = this.tableauPos.findIndex((p) => x >= p.x && x <= p.x + this.cardW && y >= p.y && y <= this.scale.height - 10);
        if (tableauHit >= 0 && this.canMoveToTableau(first, tableauHit)) {
            const destCol = this.tableau[tableauHit];
            const burstTarget = destCol.length
                ? { x: destCol[destCol.length - 1].container.x, y: destCol[destCol.length - 1].container.y }
                : { x: this.tableauPos[tableauHit].x, y: this.tableauPos[tableauHit].y };
            this.pushUndoSnapshot();
            if (!this.removeFromSource(this.dragGroup, source)) return this.restoreDragGroup();
            this.tableau[tableauHit].push(...this.dragGroup);
            this.afterMove(false, burstTarget, 0);
            return;
        }

        this.restoreDragGroup();
    }

    private removeFromSource(cards: CardGO[], source: { type: PileType; index?: number }): boolean {
        if (source.type === "waste") {
            const top = this.waste[this.waste.length - 1];
            if (top !== cards[0]) return false;
            this.waste.pop();
            return true;
        }
        if (source.type === "tableau") {
            const col = this.tableau[source.index!];
            const idx = col.indexOf(cards[0]);
            if (idx < 0 || idx + cards.length !== col.length) return false;
            col.splice(idx, cards.length);
            return true;
        }
        return false;
    }

    private afterMove(toFoundation: boolean, burstTarget: { x: number; y: number }, awardedPoints: number) {
        this.tableau.forEach((col) => {
            if (col.length && !col[col.length - 1].data.faceUp) col[col.length - 1].data.faceUp = true;
        });
        this.madeProgressThisStockCycle = true;
        this.moveCount += 1;
        this.dragGroup = [];
        this.dragStart = [];
        this.layoutAll();
        this.emitPlacementBurst(burstTarget, toFoundation);
        if (toFoundation) {
            this.playSuccessDrop();
            this.triggerHaptic("medium");
            if (awardedPoints > 0) {
                this.showScoreCelebration(awardedPoints);
            }
        } else {
            this.playCardDrop();
            this.triggerHaptic("light");
        }
        this.checkGameState();
    }

    private restoreDragGroup() {
        const cards = [...this.dragGroup];
        const starts = [...this.dragStart];
        cards.forEach((card) => this.returningCards.add(card));

        cards.forEach((c, i) => {
            this.tweens.killTweensOf(c.container);
            this.tweens.add({
                targets: c.container,
                x: starts[i].x,
                y: starts[i].y,
                duration: 160,
                ease: "Cubic.out",
                onComplete: () => {
                    this.returningCards.delete(c);
                }
            });
        });
        this.dragGroup = [];
        this.dragStart = [];
        this.time.delayedCall(170, () => {
            this.layoutAll();
        });
    }

    private emitPlacementBurst(target: { x: number; y: number }, bigBurst: boolean) {
        const emitter = this.add.particles(target.x + this.cardW / 2, target.y + this.cardH / 2, "confetti", {
            lifespan: bigBurst ? 520 : 320,
            speed: { min: bigBurst ? 55 : 35, max: bigBurst ? 180 : 95 },
            scale: { start: bigBurst ? 1.1 : 0.7, end: 0 },
            quantity: bigBurst ? 18 : 8,
            emitting: false,
            rotate: { min: 0, max: 360 },
            alpha: { start: 1, end: 0 },
            tint: bigBurst
                ? [0xF1C40F, 0xFFFFFF, 0x2ECC71, 0x3498DB]
                : [0xFFFFFF, 0xD5F5E3, 0xAED6F1]
        });
        emitter.setDepth(2600);
        emitter.explode(bigBurst ? 18 : 8);
        this.time.delayedCall(bigBurst ? 700 : 450, () => emitter.destroy());
    }

    private showScoreCelebration(points: number): void {
        if (this.activeScoreCelebration) {
            this.tweens.killTweensOf(this.activeScoreCelebration.list);
            this.tweens.killTweensOf(this.activeScoreCelebration);
            this.activeScoreCelebration.destroy();
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const topOfOpenSpace = this.tableauPos[0].y + this.cardH + this.faceUpOffset * 2;
        const centerY = topOfOpenSpace + Math.max(110, (h - topOfOpenSpace) * 0.44);
        const numberColor = Level.SCORE_CELEBRATION_NUMBER_COLORS[this.scoreCelebrationColorIndex % Level.SCORE_CELEBRATION_NUMBER_COLORS.length];
        const messageColor = Level.SCORE_CELEBRATION_MESSAGE_COLORS[this.scoreCelebrationMessageIndex % Level.SCORE_CELEBRATION_MESSAGE_COLORS.length];
        const message = Level.SCORE_CELEBRATION_MESSAGES[this.scoreCelebrationMessageIndex % Level.SCORE_CELEBRATION_MESSAGES.length];
        this.scoreCelebrationColorIndex += 1;
        this.scoreCelebrationMessageIndex += 1;

        const container = this.add.container(w * 0.5, centerY).setDepth(3100).setScale(0.84).setAlpha(0);
        const numberStrokeColor = numberColor === "#FFFFFF" ? "#111111" : "#FFFFFF";
        const messageStrokeColor = messageColor === "#FFFFFF" ? "#111111" : "#FFFFFF";
        const scoreText = this.add.text(0, -22, `+${points}`, {
            fontSize: `${this.isMobile() ? 58 : 50}px`,
            color: numberColor,
            fontStyle: normalizeUiFontWeight("900"),
            fontFamily: BUTTON_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: numberStrokeColor,
            strokeThickness: 3
        }).setOrigin(0.5);
        const messageText = this.add.text(0, 34, message, {
            fontSize: `${this.isMobile() ? 30 : 26}px`,
            color: messageColor,
            fontStyle: normalizeUiFontWeight("900"),
            fontFamily: BUTTON_FONT_FAMILY,
            resolution: getUiTextResolution(),
            stroke: messageStrokeColor,
            strokeThickness: this.isMobile() ? 2 : 2,
            align: "center"
        }).setOrigin(0.5);

        container.add([scoreText, messageText]);
        this.activeScoreCelebration = container;

        this.tweens.add({
            targets: container,
            alpha: 1,
            scale: 1,
            y: centerY - 18,
            duration: 220,
            ease: "Back.easeOut"
        });

        this.tweens.add({
            targets: scoreText,
            scale: 1.08,
            duration: 260,
            yoyo: true,
            repeat: 1,
            ease: "Sine.inOut"
        });

        this.tweens.add({
            targets: container,
            alpha: 0,
            y: centerY - 70,
            delay: 980,
            duration: 280,
            ease: "Sine.in",
            onComplete: () => {
                if (this.activeScoreCelebration === container) {
                    this.activeScoreCelebration = undefined;
                }
                container.destroy();
            }
        });
    }

    private applyCardTilt(card: CardGO, nx: number, ny: number, immediate: boolean) {
        if (!card.data.faceUp) return;
        const angle = nx * 7;
        const faceX = nx * 4;
        const faceY = ny * 3;
        const shadowX = this.cardW / 2 - nx * 6;
        const shadowY = this.cardH / 2 + 6 - ny * 4;

        if (immediate) {
            card.container.setAngle(angle);
            card.front.setPosition(faceX, faceY);
            card.back.setPosition(faceX, faceY);
            card.front.setDisplaySize(this.cardW, this.cardH);
            card.back.setDisplaySize(this.cardW, this.cardH);
            card.shadow.setPosition(shadowX, shadowY);
            card.shadow.setScale(1 + Math.abs(nx) * 0.03, 1 + Math.abs(ny) * 0.02);
            return;
        }

        this.tweens.killTweensOf([card.container, card.front, card.back, card.shadow]);
        this.tweens.add({
            targets: card.container,
            angle,
            duration: 110,
            ease: "Sine.out"
        });
        this.tweens.add({
            targets: [card.front, card.back],
            x: faceX,
            y: faceY,
            duration: 110,
            ease: "Sine.out"
        });
        this.tweens.add({
            targets: card.shadow,
            x: shadowX,
            y: shadowY,
            scaleX: 1 + Math.abs(nx) * 0.03,
            scaleY: 1 + Math.abs(ny) * 0.02,
            duration: 110,
            ease: "Sine.out"
        });
    }

    private resetCardTilt(card: CardGO, immediate: boolean) {
        if (immediate) {
            card.container.setScale(1, 1);
            card.container.setAngle(0);
            card.front.setPosition(0, 0);
            card.back.setPosition(0, 0);
            card.front.setDisplaySize(this.cardW, this.cardH);
            card.back.setDisplaySize(this.cardW, this.cardH);
            card.shadow.setPosition(this.cardW / 2, this.cardH / 2 + 6);
            card.shadow.setScale(1, 1);
            return;
        }

        this.applyCardTilt(card, 0, 0, false);
    }

    private canMoveToFoundation(card: CardGO, foundationIndex: number): boolean {
        const expectedSuit: Suit[] = ["♠", "♥", "♦", "♣"];
        const pile = this.foundations[foundationIndex];
        if (card.data.suit !== expectedSuit[foundationIndex]) return false;
        if (!pile.length) return card.data.rank === 1;
        const top = pile[pile.length - 1].data;
        return top.suit === card.data.suit && card.data.rank === top.rank + 1;
    }

    private canMoveToTableau(card: CardGO, colIndex: number): boolean {
        const col = this.tableau[colIndex];
        if (!col.length) return card.data.rank === 13;
        const top = col[col.length - 1].data;
        if (!top.faceUp) return false;
        return this.isOppositeColor(top, card.data) && top.rank === card.data.rank + 1;
    }

    private isMeaningfulTableauMove(card: CardGO, fromColIndex: number, toColIndex: number): boolean {
        const fromCol = this.tableau[fromColIndex];
        const idx = fromCol.indexOf(card);
        if (idx < 0) return false;

        const revealsFaceDown = idx > 0 && !fromCol[idx - 1].data.faceUp;
        const emptiesSource = idx === 0;
        const createsUsefulEmptyColumn = emptiesSource && this.hasKingMoveForEmptyColumn(fromColIndex, card);
        const exposesFoundationMove = idx > 0
            && fromCol[idx - 1].data.faceUp
            && this.foundationPos.some((_, foundationIndex) => this.canMoveToFoundation(fromCol[idx - 1], foundationIndex));

        return revealsFaceDown || createsUsefulEmptyColumn || exposesFoundationMove;
    }

    private hasKingMoveForEmptyColumn(sourceColIndex: number, movingCard: CardGO): boolean {
        const wasteTop = this.waste[this.waste.length - 1];
        if (wasteTop && wasteTop !== movingCard && wasteTop.data.rank === 13) {
            return true;
        }

        for (let i = 0; i < this.tableau.length; i++) {
            if (i === sourceColIndex) continue;

            const col = this.tableau[i];
            for (let j = 0; j < col.length; j++) {
                const card = col[j];
                if (!card.data.faceUp || card.data.rank !== 13 || card === movingCard) continue;

                const movable = this.getMovableStack(card);
                if (movable.length) {
                    return true;
                }
            }
        }

        return false;
    }

    private updateHUD() {
        const score = this.calculateBaseScore();
        this.scoreText?.setText(`Score: ${score}`);
        this.movesText?.setText(`Moves: ${this.moveCount}`);
        this.timeText?.setText(`Time: ${this.formatElapsedTime(this.elapsedSeconds)}`);
        if (!this.gameplayHtmlLayout) return;

        showHtmlText("hud-score", {
            text: `Score: ${score}`,
            x: this.gameplayHtmlLayout.scoreX,
            y: this.gameplayHtmlLayout.statsY,
            fontSize: this.isMobile() ? 17 : 19,
            letterSpacing: 0.5,
            multicolor: false,
            color: "#111111",
            strokeColor: "#FFFFFF",
            strokeWidth: 1
        });
        showHtmlText("hud-moves", {
            text: `Moves: ${this.moveCount}`,
            x: this.gameplayHtmlLayout.movesX,
            y: this.gameplayHtmlLayout.statsY,
            fontSize: this.isMobile() ? 17 : 19,
            letterSpacing: 0.5,
            multicolor: false,
            color: "#111111",
            strokeColor: "#FFFFFF",
            strokeWidth: 1
        });
        showHtmlText("hud-time", {
            text: `Time: ${this.formatElapsedTime(this.elapsedSeconds)}`,
            x: this.gameplayHtmlLayout.timeX,
            y: this.gameplayHtmlLayout.statsY,
            fontSize: this.isMobile() ? 17 : 19,
            letterSpacing: 0.5,
            multicolor: false,
            color: "#111111",
            strokeColor: "#FFFFFF",
            strokeWidth: 1
        });
    }

    private formatElapsedTime(totalSeconds: number): string {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    private pointInCard(px: number, py: number, x: number, y: number): boolean {
        return px >= x && px <= x + this.cardW && py >= y && py <= y + this.cardH;
    }

    private isOppositeColor(a: CardData, b: CardData): boolean {
        return this.isRed(a.suit) !== this.isRed(b.suit);
    }

    private isRed(s: Suit): boolean {
        return s === "♥" || s === "♦";
    }

    private getHintButtonLabel(): string {
        return `Hint ${this.hintsRemaining}`;
    }

    private getUndoButtonLabel(): string {
        return `Undo ${this.reversesRemaining}`;
    }

    private getAllCards(): CardGO[] {
        return [...this.stock, ...this.waste, ...this.foundations.flat(), ...this.tableau.flat()];
    }

    private createUndoSnapshot(): UndoSnapshot {
        const faceUpById: Record<string, boolean> = {};
        this.getAllCards().forEach((card) => {
            faceUpById[card.data.id] = card.data.faceUp;
        });
        return {
            stockIds: this.stock.map((card) => card.data.id),
            wasteIds: this.waste.map((card) => card.data.id),
            foundationIds: this.foundations.map((pile) => pile.map((card) => card.data.id)),
            tableauIds: this.tableau.map((col) => col.map((card) => card.data.id)),
            faceUpById,
            moveCount: this.moveCount,
            hintsRemaining: this.hintsRemaining,
            madeProgressThisStockCycle: this.madeProgressThisStockCycle
        };
    }

    private pushUndoSnapshot(): void {
        this.undoHistory.push(this.createUndoSnapshot());
        if (this.undoHistory.length > 3) {
            this.undoHistory.shift();
        }
        this.updateUndoButton();
    }

    private restoreUndoSnapshot(snapshot: UndoSnapshot): void {
        const cardById = new Map(this.getAllCards().map((card) => [card.data.id, card] as const));
        this.getAllCards().forEach((card) => {
            this.tweens.killTweensOf(card.container);
            card.container.setVisible(true);
            if (card.hitZone.input) {
                card.hitZone.input.enabled = true;
            }
        });
        this.clearActiveHint();
        this.dragGroup = [];
        this.dragStart = [];
        this.returningCards.clear();
        this.drawAnimating = false;
        this.stock = snapshot.stockIds.map((id) => cardById.get(id)!).filter(Boolean);
        this.waste = snapshot.wasteIds.map((id) => cardById.get(id)!).filter(Boolean);
        this.foundations = snapshot.foundationIds.map((pile) => pile.map((id) => cardById.get(id)!).filter(Boolean));
        this.tableau = snapshot.tableauIds.map((col) => col.map((id) => cardById.get(id)!).filter(Boolean));
        this.getAllCards().forEach((card) => {
            card.data.faceUp = snapshot.faceUpById[card.data.id] ?? false;
        });
        this.moveCount = snapshot.moveCount;
        this.hintsRemaining = snapshot.hintsRemaining;
        this.madeProgressThisStockCycle = snapshot.madeProgressThisStockCycle;
        this.layoutAll();
        this.updateHintButton();
        this.updateUndoButton();
    }

    private undoLastMove(): void {
        if (!this.gameStarted || this.drawAnimating) return;
        const now = Date.now();
        if (now - this.lastUndoRequestAt < 350) return;
        this.lastUndoRequestAt = now;
        if (this.reversesRemaining <= 0) {
            this.updateUndoButton();
            return;
        }
        const snapshot = this.undoHistory.pop();
        if (!snapshot) {
            this.updateUndoButton();
            return;
        }
        this.reversesRemaining -= 1;
        this.restoreUndoSnapshot(snapshot);
    }

    private showLevelSettingsHtml(panelTop: number, panelBottom: number, rowBaseY: number): void {
        const labelX = this.scale.width * 0.5 - 58;
        const valueX = this.scale.width * 0.5 + 124;
        const rows = [
            { id: "level-settings-label-music", text: "Music", y: rowBaseY },
            { id: "level-settings-label-fx", text: "Sound Effects", y: rowBaseY + 62 },
            { id: "level-settings-label-haptics", text: "Haptics", y: rowBaseY + 124 }
        ];
        rows.forEach((row) => {
            showHtmlText(row.id, {
                text: row.text,
                x: labelX,
                y: row.y,
                fontSize: 23,
                letterSpacing: 0.4,
                multicolor: false,
                color: "#ECF0F1",
                strokeColor: "#111111",
                strokeWidth: 1.5
            });
        });
        hideHtmlText("level-settings-value-music");
        hideHtmlText("level-settings-value-fx");
        hideHtmlText("level-settings-value-haptics");
        showHtmlButton("level-settings-toggle-music", {
            text: this.settings.music ? "On" : "Off",
            x: valueX,
            y: rowBaseY,
            width: 108,
            height: 42,
            radius: 20,
            fontSize: 18,
            theme: this.settings.music ? "green" : "red",
            onClick: () => {
                this.settings.music = !this.settings.music;
                this.saveSettings();
                this.playButton();
                syncBackgroundMusic(this, this.settings.music, this.settings.music);
                this.triggerHaptic("light");
                this.showLevelSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlButton("level-settings-toggle-fx", {
            text: this.settings.fx ? "On" : "Off",
            x: valueX,
            y: rowBaseY + 62,
            width: 108,
            height: 42,
            radius: 20,
            fontSize: 18,
            theme: this.settings.fx ? "green" : "red",
            onClick: () => {
                this.settings.fx = !this.settings.fx;
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("light");
                this.showLevelSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlButton("level-settings-toggle-haptics", {
            text: this.settings.haptics ? "On" : "Off",
            x: valueX,
            y: rowBaseY + 124,
            width: 108,
            height: 42,
            radius: 20,
            fontSize: 18,
            theme: this.settings.haptics ? "green" : "red",
            onClick: () => {
                this.settings.haptics = !this.settings.haptics;
                this.saveSettings();
                this.playButton();
                this.triggerHaptic("light");
                this.showLevelSettingsHtml(panelTop, panelBottom, rowBaseY);
            }
        });
        showHtmlText("level-settings-note", {
            text: "Draw mode can be changed from the home screen.",
            x: this.scale.width * 0.5,
            y: panelTop + 334,
            fontSize: 16,
            letterSpacing: 0.1,
            maxWidth: 312,
            variant: "modal",
            multicolor: false,
            color: "#B3131B",
            strokeColor: "#B3131B",
            strokeWidth: 0
        });
        hideHtmlText("level-settings-close");
        showHtmlButton("level-settings-close-button", {
            text: "Close",
            x: this.scale.width * 0.5,
            y: panelBottom - 44,
            width: 204,
            height: 50,
            radius: 25,
            fontSize: 23,
            theme: "red",
            onClick: () => {
                this.playButton();
                this.destroySettingsOverlay(true);
            }
        });
    }

    private hideLevelSettingsHtml(): void {
        [
            "level-settings-label-music",
            "level-settings-label-fx",
            "level-settings-label-haptics",
            "level-settings-value-music",
            "level-settings-value-fx",
            "level-settings-value-haptics",
            "level-settings-note",
            "level-settings-close"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("level-settings-toggle-music");
        hideHtmlButton("level-settings-toggle-fx");
        hideHtmlButton("level-settings-toggle-haptics");
        hideHtmlButton("level-settings-close-button");
    }

    private hideEndOverlayHtml(): void {
        [
            "end-subtitle",
            "end-featured-message",
            "end-score-breakdown",
            "end-final-score",
            "end-button-retry",
            "end-button-menu"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("end-button-retry-btn");
        hideHtmlButton("end-button-menu-btn");
    }

    private showLeaveOverlayHtml(panelTop: number, panelBottom: number): void {
        showHtmlText("leave-subtitle", {
            text: "Leave this run and go back to the main menu?",
            x: this.scale.width * 0.5,
            y: panelTop + 118,
            fontSize: 18,
            maxWidth: 332,
            letterSpacing: 0.15,
            variant: "modal",
            multicolor: false,
            color: "#ECF0F1",
            strokeColor: "#111111",
            strokeWidth: 1.2
        });
        hideHtmlText("leave-button-stay");
        hideHtmlText("leave-button-leave");
        showHtmlButton("leave-button-stay-btn", {
            text: "Stay",
            x: this.scale.width * 0.5,
            y: panelBottom - 108,
            width: 192,
            height: 46,
            radius: 23,
            fontSize: 23,
            theme: "green",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.closeLeaveOverlay();
            }
        });
        showHtmlButton("leave-button-leave-btn", {
            text: "Leave",
            x: this.scale.width * 0.5,
            y: panelBottom - 42,
            width: 192,
            height: 46,
            radius: 23,
            fontSize: 23,
            theme: "red",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.isShuttingDown = true;
                this.hideLeaveOverlayHtml();
                hideHtmlText("modal-title");
                this.scene.start("MainMenu");
            }
        });
    }

    private hideLeaveOverlayHtml(): void {
        [
            "leave-subtitle",
            "leave-button-stay",
            "leave-button-leave"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("leave-button-stay-btn");
        hideHtmlButton("leave-button-leave-btn");
    }

    private hideHowToOverlayHtml(): void {
        [
            "level-howto-step-title",
            "level-howto-step-body",
            "level-howto-page-indicator"
        ].forEach((id) => hideHtmlText(id));
        hideHtmlButton("level-howto-prev-button");
        hideHtmlButton("level-howto-next-button");
        hideHtmlButton("level-howto-close-button");
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
        showHtmlText("level-howto-step-title", {
            text: page.title,
            x: w * 0.5,
            y: panelTop + 116,
            fontSize: 26,
            variant: "modal",
            maxWidth: 360,
            multicolor: false,
            strokeWidth: 1.2
        });
        showHtmlText("level-howto-step-body", {
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
        showHtmlText("level-howto-page-indicator", {
            text: `${this.howToPageIndex + 1} / ${HOW_TO_PLAY_PAGES.length}`,
            x: w * 0.5,
            y: panelBottom - 148,
            fontSize: 18,
            variant: "modal",
            multicolor: false,
            strokeWidth: 1
        });
        showHtmlButton("level-howto-prev-button", {
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
        showHtmlButton("level-howto-next-button", {
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
        showHtmlButton("level-howto-close-button", {
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

    private createHowToOverlay(): void {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5200);
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

    private showGameplayHtml(): void {
        if (!this.gameplayHtmlLayout) return;
        hideHtmlText("game-btn-new");
        hideHtmlText("game-btn-settings");
        showHtmlButton("game-btn-new-button", {
            text: "New game",
            x: this.gameplayHtmlLayout.newButtonX,
            y: this.gameplayHtmlLayout.buttonCenterY + 1,
            width: this.gameplayHtmlLayout.buttonWidth,
            height: this.gameplayHtmlLayout.buttonHeight,
            radius: 10,
            fontSize: 15,
            theme: "red",
            onClick: () => {
                this.triggerHaptic("light");
                this.playButton();
                this.newGame();
            }
        });
        showHtmlButton("game-btn-settings-button", {
            text: "Settings",
            x: this.gameplayHtmlLayout.settingsButtonX,
            y: this.gameplayHtmlLayout.buttonCenterY + 1,
            width: this.gameplayHtmlLayout.buttonWidth,
            height: this.gameplayHtmlLayout.buttonHeight,
            radius: 10,
            fontSize: 15,
            theme: "blue",
            onClick: () => {
                this.triggerHaptic("light");
                this.playButton();
                this.openSettings();
            }
        });
        showHtmlButton("game-btn-info-button", {
            text: "I",
            x: this.gameplayHtmlLayout.infoButtonX,
            y: this.gameplayHtmlLayout.infoButtonY,
            width: this.gameplayHtmlLayout.infoButtonSize,
            height: this.gameplayHtmlLayout.infoButtonSize,
            radius: Math.floor(this.gameplayHtmlLayout.infoButtonSize / 2),
            fontSize: 22,
            theme: "orange",
            onClick: () => {
                this.triggerHaptic("light");
                this.playButton();
                this.openHowToOverlay();
            }
        });
        this.updateUndoButton();
    }

    private hideGameplayHtml(): void {
        hideHtmlText("hud-score");
        hideHtmlText("hud-moves");
        hideHtmlText("hud-time");
        hideHtmlText("game-btn-new");
        hideHtmlText("game-btn-hint");
        hideHtmlText("game-btn-settings");
        hideHtmlButton("game-btn-new-button");
        hideHtmlButton("game-btn-hint-button");
        hideHtmlButton("game-btn-undo-button");
        hideHtmlButton("game-btn-settings-button");
        hideHtmlButton("game-btn-info-button");
    }

    private updateHintButton() {
        this.hintButton?.setLabel(this.getHintButtonLabel());
        this.hintButton?.setEnabled(this.hintsRemaining > 0);
        if (!this.gameplayHtmlLayout) return;
        const enabled = this.hintsRemaining > 0;
        hideHtmlText("game-btn-hint");
        showHtmlButton("game-btn-hint-button", {
            text: this.getHintButtonLabel(),
            x: this.gameplayHtmlLayout.hintButtonX,
            y: this.gameplayHtmlLayout.buttonCenterY + 1,
            width: this.gameplayHtmlLayout.buttonWidth,
            height: this.gameplayHtmlLayout.buttonHeight,
            radius: 10,
            fontSize: 15,
            theme: "green",
            enabled,
            opacity: enabled ? 1 : 0.82,
            debounceMs: 300,
            onClick: () => {
                this.triggerHaptic("light");
                this.playButton();
                this.provideHint();
            }
        });
    }

    private updateUndoButton(): void {
        if (!this.gameplayHtmlLayout) return;
        const enabled = this.reversesRemaining > 0 && this.undoHistory.length > 0 && !this.drawAnimating;
        showHtmlButton("game-btn-undo-button", {
            text: this.getUndoButtonLabel(),
            x: this.gameplayHtmlLayout.undoButtonX,
            y: this.gameplayHtmlLayout.buttonCenterY + 1,
            width: this.gameplayHtmlLayout.undoButtonWidth,
            height: this.gameplayHtmlLayout.buttonHeight,
            radius: 10,
            fontSize: this.isMobile() ? 13 : 15,
            theme: "purple",
            enabled,
            opacity: enabled ? 1 : 0.82,
            debounceMs: 300,
            onClick: () => {
                this.triggerHaptic("light");
                this.playButton();
                this.undoLastMove();
            }
        });
    }

    private clearActiveHint(): void {
        this.activeHintTimer?.remove(false);
        this.activeHintTimer = undefined;

        if (this.activeHintText) {
            this.tweens.killTweensOf(this.activeHintText);
            this.activeHintText.destroy();
            this.activeHintText = undefined;
        }

        if (this.activeHintHighlight) {
            this.tweens.killTweensOf(this.activeHintHighlight);
            this.activeHintHighlight.destroy();
            this.activeHintHighlight = undefined;
        }
    }

    private checkGameState() {
        const total = this.foundations.reduce((sum, p) => sum + p.length, 0);
        if (total === 52) {
            this.showVictoryAnimation();
            return;
        }

        const hasMove = this.hasAnyLegalMove();
        if (!hasMove && this.stock.length === 0 && this.waste.length > 0) {
            this.showStatusMessage("Tap stock to recycle.");
        }
    }

    private provideHint() {
        if (!this.gameStarted) return;
        const now = Date.now();
        if (now - this.lastHintRequestAt < 350) return;
        this.lastHintRequestAt = now;
        if (this.hintsRemaining <= 0) {
            this.showStatusMessage("No hints left this round.");
            return;
        }

        const suggestion = this.getHintSuggestion();
        if (!suggestion) {
            this.showStatusMessage("No useful hints right now.");
            return;
        }

        this.hintsRemaining -= 1;
        this.updateHintButton();
        this.showHint(suggestion.card, suggestion.target, suggestion.message);
    }

    private getHintSuggestion(): HintSuggestion | null {
        // 1. Check Waste to Foundation
        const wasteTop = this.waste[this.waste.length - 1];
        if (wasteTop) {
            const fi = this.foundationPos.findIndex((_, i) => this.canMoveToFoundation(wasteTop, i));
            if (fi >= 0) return { card: wasteTop, target: this.foundationPos[fi] };
        }

        // 2. Check Tableau to Foundation
        for (let i = 0; i < 7; i++) {
            const col = this.tableau[i];
            const top = col[col.length - 1];
            if (top && top.data.faceUp) {
                const fi = this.foundationPos.findIndex((_, fidx) => this.canMoveToFoundation(top, fidx));
                if (fi >= 0) return { card: top, target: this.foundationPos[fi] };
            }
        }

        // 3. Check Tableau to Tableau
        for (let i = 0; i < 7; i++) {
            const col = this.tableau[i];
            for (let j = 0; j < col.length; j++) {
                const card = col[j];
                if (!card.data.faceUp) continue;
                const stack = this.getMovableStack(card);
                if (!stack.length) continue;

                // Try moving this stack to any other tableau
                for (let ti = 0; ti < 7; ti++) {
                    if (ti === i) continue;
                    if (this.canMoveToTableau(card, ti)) {
                        if (!this.isMeaningfulTableauMove(card, i, ti)) continue;
                        // Don't hint moving a King to an empty spot if it's already at the bottom of its column
                        if (card.data.rank === 13 && j === 0) continue;
                        return { card, target: this.getTableauHintTarget(ti) };
                    }
                }
            }
        }

        // 4. Check Waste to Tableau
        if (wasteTop) {
            const ti = this.tableauPos.findIndex((_, i) => this.canMoveToTableau(wasteTop, i));
            if (ti >= 0) return { card: wasteTop, target: this.getTableauHintTarget(ti) };
        }

        // 5. Check if Stock has cards
        if (this.stock.length > 0) {
            return { card: null, target: this.stockPos, message: "Draw from stock" };
        }

        return null;
    }

    private showStatusMessage(message: string) {
        const text = this.add.text(this.scale.width * 0.5, this.scale.height * 0.14, message, this.uiText(18, "#FFFFFF", "900", "#B3131B"))
            .setOrigin(0.5)
            .setDepth(3200)
            .setAlpha(0);
        this.tweens.add({
            targets: text,
            alpha: 1,
            y: text.y - 18,
            duration: 240,
            yoyo: true,
            hold: 700,
            onComplete: () => text.destroy()
        });
    }

    private getTableauHintTarget(colIndex: number): { x: number, y: number } {
        const col = this.tableau[colIndex];
        const topCard = col[col.length - 1];
        if (topCard) {
            return {
                x: topCard.container.x,
                y: topCard.container.y
            };
        }

        return this.tableauPos[colIndex];
    }

    private showHint(card: CardGO | null, target: { x: number, y: number }, message?: string) {
        this.clearActiveHint();

        if (message) {
            const text = this.add.text(target.x + this.cardW / 2, target.y + this.cardH / 2, message, this.uiText(20, "#FFFFFF", "900", "#B3131B"))
                .setOrigin(0.5).setDepth(3000).setAlpha(0);
            this.activeHintText = text;
            this.tweens.add({
                targets: text,
                alpha: 1,
                y: text.y - 22,
                duration: 260,
                ease: "Sine.out"
            });
        }

        const highlight = this.add.graphics().setDepth(2000);
        highlight.lineStyle(8, 0xB3131B, 1);
        highlight.strokeRoundedRect(target.x - 6, target.y - 6, this.cardW + 12, this.cardH + 12, 14);
        highlight.setAlpha(1);
        this.activeHintHighlight = highlight;

        if (card) {
            this.tweens.add({
                targets: card.container,
                scale: 1.05,
                duration: 240,
                yoyo: true,
                repeat: 5
            });
        } else {
            // If it's the stock
            this.tweens.add({
                targets: this.stockSlot,
                alpha: 1,
                duration: 260,
                yoyo: true,
                repeat: 5
            });
        }

        this.activeHintTimer = this.time.delayedCall(5000, () => {
            this.clearActiveHint();
        });
    }

    private hasAnyLegalMove(): boolean {
        // reuse the simplified logic from provideHint if possible, or just keep original
        const wasteTop = this.waste[this.waste.length - 1];
        if (wasteTop) {
            if (this.foundationPos.some((_, i) => this.canMoveToFoundation(wasteTop, i))) return true;
            if (this.tableau.some((_, i) => this.canMoveToTableau(wasteTop, i))) return true;
        }

        for (let i = 0; i < 7; i++) {
            const col = this.tableau[i];
            for (let j = 0; j < col.length; j++) {
                const card = col[j];
                if (!card.data.faceUp) continue;
                const stack = this.getMovableStack(card);
                if (!stack.length) continue;
                if (stack.length === 1 && this.foundationPos.some((_, fi) => this.canMoveToFoundation(card, fi))) return true;
                if (this.tableau.some((_, ti) => ti !== i && this.canMoveToTableau(card, ti) && this.isMeaningfulTableauMove(card, i, ti))) return true;
            }
        }

        return this.stock.length > 0 || this.waste.length > 0;
    }

    private showVictoryAnimation(preview = false): void {
        const featuredCard = this.getRandomCelebrationCard();
        const baseScore = preview ? Math.max(this.calculateBaseScore(), 3640) : this.calculateBaseScore();
        const timeBonus = preview ? Math.max(this.calculateTimeBonus(), 2200) : this.calculateTimeBonus();
        const moveBonus = preview ? Math.max(this.calculateMoveBonus(), 960) : this.calculateMoveBonus();
        const finalScore = preview ? baseScore + timeBonus + moveBonus : this.calculateFinalScore();

        this.triggerWinConfetti();
        this.openEnd("Victory", "", {
            featuredCard,
            featuredMessage: this.getCelebrationMessage(featuredCard),
            baseScore,
            timeBonus,
            moveBonus,
            finalScore,
            showVictoryDetails: true
        });

        if (!preview) {
            this.submitScore(finalScore);
            this.triggerHaptic("success");
        }
    }

    private getRandomCelebrationCard(): CardData {
        const suits: Suit[] = ["♠", "♥", "♦", "♣"];
        return {
            id: "celebration-card",
            suit: Phaser.Utils.Array.GetRandom(suits),
            rank: Phaser.Math.Between(1, 13),
            faceUp: true
        };
    }

    private getCelebrationMessage(card: CardData): string {
        const messagesBySuit: Record<Suit, string[]> = {
            "♠": [
                "Ace of Spades. You buried the chaos and planted a victory garden.",
                "Two of Spades. Double trouble for the deck, zero trouble for you.",
                "Three of Spades. You stabbed confusion three times and called it strategy.",
                "Four of Spades. The table folded faster than a cheap lawn chair.",
                "Five of Spades. Sharp moves, sharper finish, zero shovel-related incidents.",
                "Six of Spades. You dug six layers deep and still found style.",
                "Seven of Spades. Lucky? Maybe. Menacingly competent? Absolutely.",
                "Eight of Spades. The deck blinked once and lost custody of the board.",
                "Nine of Spades. You gave that layout a villain speech and then won anyway.",
                "Ten of Spades. Ten out of ten, no notes, only dramatic organ music.",
                "Jack of Spades. That was rogue behavior in a very flattering way.",
                "Queen of Spades. You ran this table like it owed you rent.",
                "King of Spades. The deck has accepted you as its slightly terrifying monarch."
            ],
            "♥": [
                "Ace of Hearts. You charmed the whole table into behaving.",
                "Two of Hearts. A sweet little win with suspiciously elite timing.",
                "Three of Hearts. The cards caught feelings and started helping you.",
                "Four of Hearts. Cozy, classy, and just rude enough to beat the odds.",
                "Five of Hearts. You turned patience into romance and chaos into decor.",
                "Six of Hearts. That run was smoother than an apology with flowers.",
                "Seven of Hearts. You flirted with danger and danger folded first.",
                "Eight of Hearts. Every move said, relax, I have this, and somehow you did.",
                "Nine of Hearts. The deck wanted drama, but you brought adorable efficiency.",
                "Ten of Hearts. Perfect score energy with a smile the cards could hear.",
                "Jack of Hearts. You won like a charming thief at a royal card party.",
                "Queen of Hearts. Graceful, deadly, and somehow still very cute.",
                "King of Hearts. The board loved you, and honestly who could blame it."
            ],
            "♦": [
                "Ace of Diamonds. You polished that win until it could see itself.",
                "Two of Diamonds. Twice the sparkle, half the panic.",
                "Three of Diamonds. You made the messy bits look aggressively expensive.",
                "Four of Diamonds. Clean lines, bright choices, and absolutely no financial advice.",
                "Five of Diamonds. The deck got dazzled and forgot how to resist.",
                "Six of Diamonds. You played like every move came with premium packaging.",
                "Seven of Diamonds. Lucky enough to shine, smart enough to cash it in.",
                "Eight of Diamonds. That victory had showroom-floor confidence.",
                "Nine of Diamonds. You turned cardboard into luxury behavior.",
                "Ten of Diamonds. Ten shiny decisions in a trench coat pretending to be destiny.",
                "Jack of Diamonds. Flashy, funny, and somehow still efficient.",
                "Queen of Diamonds. Rich aunt energy, but for winning solitaire.",
                "King of Diamonds. You ruled the table like it came with gold trim."
            ],
            "♣": [
                "Ace of Clubs. You bonked the problem once and it learned respect.",
                "Two of Clubs. A tidy little double-tap of competence.",
                "Three of Clubs. You solved this board like a cheerful wrecking ball.",
                "Four of Clubs. Solid, steady, and just the right amount of smug.",
                "Five of Clubs. The deck got clobbered by five-star decision making.",
                "Six of Clubs. You kept swinging until the nonsense packed its bags.",
                "Seven of Clubs. Pure gremlin discipline. Weirdly inspiring.",
                "Eight of Clubs. That was eight servings of focus with extra crunch.",
                "Nine of Clubs. You clubbed the chaos politely, which is somehow worse.",
                "Ten of Clubs. Ten big thumps of strategy and one very small mercy.",
                "Jack of Clubs. Mischief, muscle, and excellent table manners.",
                "Queen of Clubs. You carried a big stick and even bigger confidence.",
                "King of Clubs. The board got bonked into order by royalty."
            ]
        };
        return messagesBySuit[card.suit][card.rank - 1];
    }

    private renderModalTitle(container: Phaser.GameObjects.Container, label: string): void {
        const solidColor = label === "Settings" || label === "How to play"
            ? "#FFFFFF"
            : label === "Return home"
                ? "#B3131B"
                : undefined;
        const strokeColor = solidColor === "#FFFFFF" ? "#111111" : "#FFFFFF";
        if (document.getElementById("solitaire-modal-title")) {
            container.setVisible(false);
            showHtmlText("modal-title", {
                text: label,
                x: container.x,
                y: container.y,
                fontSize: 42,
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
            fontSize: "42px",
            color: colors[index % colors.length],
            fontFamily: UI_FONT_FAMILY,
            fontStyle: normalizeUiFontWeight("900"),
            resolution: getUiTextResolution(),
            stroke: solidColor ? strokeColor : "#FFFFFF",
            strokeThickness: 2
        }).setOrigin(0.5));
        const gap = 4;
        const totalWidth = letters.reduce((sum, letter, index) => sum + letter.width + (index === letters.length - 1 ? 0 : gap), 0);
        let cursor = -totalWidth / 2;
        letters.forEach((letter, index) => {
            letter.x = cursor + letter.width / 2;
            cursor += letter.width + (index === letters.length - 1 ? 0 : gap);
        });
        container.add(letters);
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
        // Attack
        gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
        // Release
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.05);
    }

    private playLoadedFx(key: string, config?: Phaser.Types.Sound.SoundConfig): boolean {
        if (!this.settings.fx || !this.cache.audio.exists(key)) return false;
        this.sound.play(key, config);
        return true;
    }

    private playCardPick() {
        if (this.playLoadedFx("card_pick", { volume: 0.45 })) return;
        this.playTone(320, "sine", 0.08, 0.06, 450);
    }
    private playCardDrop() {
        if (this.playLoadedFx("card_drop", { volume: 0.42 })) return;
        this.playTone(400, "triangle", 0.08, 0.06, 250);
    }
    private playShuffleDraw() {
        if (!this.settings.fx) return;
        if (this.cache.audio.exists("shuffle_draw")) {
            const rate = this.drawCount === 1 ? 1.6 : 1;
            this.sound.play("shuffle_draw", { volume: 0.5, rate });
            return;
        }
        this.playTone(400, "triangle", 0.08, 0.06, 250);
    }
    private playSuccessDrop() {
        if (this.playLoadedFx("foundation_success", { volume: 0.24 })) return;
        this.playTone(580, "sine", 0.12, 0.08, 800);
    }
    private playVictoryFinal() {
        if (this.playLoadedFx("victory_final", { volume: 0.82 })) return;
        this.playSuccessDrop();
    }
    private playButton() {
        if (this.playLoadedFx("ui_button", { volume: 0.4 })) return;
        this.playTone(520, "sine", 0.05, 0.04);
    }

    private openHowToOverlay(): void {
        if (this.howToOverlay?.visible) return;
        this.hideGameplayHtml();
        if (this.howToOverlay) {
            this.tweens.killTweensOf(this.howToOverlay);
            this.howToOverlay.destroy();
            this.howToOverlay = undefined;
            this.hideHowToOverlayHtml();
        }
        this.createHowToOverlay();
        this.howToPageIndex = 0;
        gameplayStop();
        const overlay = this.howToOverlay!;
        overlay.setVisible(true);
        this.updateHowToOverlay();
        overlay.setAlpha(0);
        this.tweens.add({
            targets: overlay,
            alpha: 1,
            duration: 180
        });
    }

    private closeHowToOverlay(): void {
        const overlay = this.howToOverlay;
        if (!overlay || !this.children.exists(overlay) || !overlay.visible) return;
        this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                overlay.destroy();
                this.howToOverlay = undefined;
                if (!this.settingsOverlay?.visible && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
                    this.hideHowToOverlayHtml();
                    hideHtmlText("modal-title");
                    this.showGameplayHtml();
                    this.updateHUD();
                    this.updateHintButton();
                    gameplayStart();
                }
            }
        });
    }

    private destroyHowToOverlay(resumeGameplay: boolean): void {
        if (!this.howToOverlay) {
            if (!this.isShuttingDown && !this.settingsOverlay?.visible && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
                this.hideHowToOverlayHtml();
                hideHtmlText("modal-title");
                this.showGameplayHtml();
                this.updateHUD();
                this.updateHintButton();
            }
            if (!this.isShuttingDown && resumeGameplay && !this.settingsOverlay?.visible && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
                gameplayStart();
            }
            return;
        }
        this.tweens.killTweensOf(this.howToOverlay);
        this.howToOverlay.destroy();
        this.howToOverlay = undefined;
        if (!this.isShuttingDown && !this.settingsOverlay?.visible && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
            this.hideHowToOverlayHtml();
            hideHtmlText("modal-title");
            this.showGameplayHtml();
            this.updateHUD();
            this.updateHintButton();
        }
        if (!this.isShuttingDown && resumeGameplay && !this.settingsOverlay?.visible && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
            gameplayStart();
        }
    }

    private openSettings() {
        if (this.settingsOverlay?.visible) return;
        this.hideGameplayHtml();
        this.destroySettingsOverlay(false);
        this.createSettingsOverlay();
        gameplayStop();
        const overlay = this.settingsOverlay!;
        overlay.setVisible(true);
        overlay.setAlpha(0);
        this.tweens.add({
            targets: overlay,
            alpha: 1,
            duration: 180
        });
    }

    private destroySettingsOverlay(resumeGameplay: boolean) {
        if (!this.settingsOverlay) {
            if (!this.isShuttingDown && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
                this.hideLevelSettingsHtml();
                hideHtmlText("modal-title");
                this.showGameplayHtml();
                this.updateHUD();
                this.updateHintButton();
            }
            if (!this.isShuttingDown && resumeGameplay && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
                gameplayStart();
            }
            return;
        }
        this.tweens.killTweensOf(this.settingsOverlay);
        this.settingsOverlay.destroy();
        this.settingsOverlay = undefined;
        if (!this.isShuttingDown && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
            this.hideLevelSettingsHtml();
            hideHtmlText("modal-title");
            this.showGameplayHtml();
            this.updateHUD();
            this.updateHintButton();
        }
        if (!this.isShuttingDown && resumeGameplay && !this.endOverlay?.visible && !this.leaveOverlay?.visible) {
            gameplayStart();
        }
    }

    private createSettingsOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);

        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0, 0);
        dark.setInteractive(); // Prevent clicks from going behind the overlay

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
            const txt = this.add.text(0, 0, label, this.uiText(23, "#ECF0F1", "800")).setOrigin(0, 0.5).setAlpha(0);

            const btnObj = this.add.graphics();
            const drawToggle = (isOn: boolean) => {
                btnObj.clear();
                btnObj.fillStyle(0x000000, 0.3);
                btnObj.fillRoundedRect(220, -14, 108, 42, 20);
                btnObj.fillStyle(isOn ? 0x145A32 : 0x5C0B12, 1);
                btnObj.fillRoundedRect(220, -18, 108, 42, 20);
                btnObj.fillStyle(isOn ? 0x2ECC71 : 0xB3131B, 1);
                btnObj.fillRoundedRect(220, -22, 108, 42, 20);
                btnObj.fillStyle(0xFFFFFF, 0.16);
                btnObj.fillRoundedRect(230, -18, 88, 12, 12);
                btnObj.lineStyle(3, 0xFFFFFF, 0.9);
                btnObj.strokeRoundedRect(220, -22, 108, 42, 20);
            };
            drawToggle(this.settings[key]);

            const val = this.add.text(274, -3, this.settings[key] ? "On" : "Off", {
                ...this.uiText(18, "#FFFFFF", "900", "#1A0003"),
                fontFamily: BUTTON_FONT_FAMILY
            }).setOrigin(0.5).setAlpha(0);

            const rowHitZone = this.add.zone(274, 0, 108, 42).setInteractive({ useHandCursor: true });
            row.add([txt, btnObj, val, rowHitZone]);
            btnObj.setVisible(false);
            val.setVisible(false);
            rowHitZone.input!.enabled = false;
            return row;
        };

        const t1 = mkToggle("Music", "music", rowBaseY - h * 0.5);
        const t2 = mkToggle("Sound Effects", "fx", rowBaseY + 62 - h * 0.5);
        const t3 = mkToggle("Haptics", "haptics", rowBaseY + 124 - h * 0.5);

        const note = this.add.text(w * 0.5, panelTop + 334, "Draw mode can be changed from the home screen.", {
            ...this.uiText(18, "#BDC3C7", "700"),
            wordWrap: { width: pW - 56 },
            align: "center"
        }).setOrigin(0.5).setAlpha(0);

        const close = this.makeCenterButton(w * 0.5, panelBottom - 40, "Close", () => {
            this.destroySettingsOverlay(true);
        }, "red", 188, 46, true);
        c.add([dark, panel, title, t1, t2, t3, note, close]);
        c.setVisible(false);
        this.settingsOverlay = c;
        this.showLevelSettingsHtml(panelTop, panelBottom, rowBaseY);
    }

    private openEnd(title: string, subtitle: string, config?: EndOverlayConfig) {
        if (!this.endOverlay) this.createEndOverlay();
        this.endOverlayState = { title, subtitle, config };
        gameplayStop();
        this.hideGameplayHtml();
        this.hideEndOverlayHtml();
        this.hudTimer?.remove(false);
        this.hudTimer = undefined;
        const titleObj = this.endOverlay.getByName("title") as Phaser.GameObjects.Container;
        const subObj = this.endOverlay.getByName("subtitle") as Phaser.GameObjects.Text;
        const featuredCard = this.endOverlay.getByName("featured-card") as Phaser.GameObjects.Image;
        const featuredMessage = this.endOverlay.getByName("featured-message") as Phaser.GameObjects.Text;
        const scoreBreakdown = this.endOverlay.getByName("score-breakdown") as Phaser.GameObjects.Text;
        const finalScore = this.endOverlay.getByName("final-score") as Phaser.GameObjects.Text;
        const retryButton = this.endOverlay.getByName("retry") as Phaser.GameObjects.Container;
        const menuButton = this.endOverlay.getByName("menu") as Phaser.GameObjects.Container;
        this.renderModalTitle(titleObj, title);
        const hasSubtitle = subtitle.trim().length > 0;
        subObj.setText(subtitle);
        subObj.setVisible(hasSubtitle);

        const showVictoryDetails = config?.showVictoryDetails === true;
        featuredCard.setVisible(showVictoryDetails);
        featuredMessage.setVisible(showVictoryDetails);
        scoreBreakdown.setVisible(showVictoryDetails);
        finalScore.setVisible(showVictoryDetails);
        const panelTop = this.scale.height * 0.5 - 310;
        const panelBottom = this.scale.height * 0.5 + 310;
        const detailOffset = showVictoryDetails && !hasSubtitle ? -24 : 0;
        subObj.y = showVictoryDetails ? panelTop + 122 : panelTop + 154;
        featuredMessage.y = panelTop + 190 + detailOffset;
        featuredCard.y = panelTop + 282 + detailOffset;
        scoreBreakdown.y = panelTop + 392 + detailOffset;
        finalScore.y = panelTop + 454 + detailOffset;
        retryButton.y = showVictoryDetails ? panelBottom - 122 : panelBottom - 136;
        menuButton.y = showVictoryDetails ? panelBottom - 52 : panelBottom - 66;

        if (hasSubtitle) {
            showHtmlText("end-subtitle", {
                text: subtitle,
                x: this.scale.width * 0.5,
                y: subObj.y,
                fontSize: 19,
                maxWidth: 388,
                letterSpacing: 0.15,
                variant: "modal",
                multicolor: false,
                color: "#BDC3C7",
                strokeColor: "#111111",
                strokeWidth: 1.2
            });
        } else {
            hideHtmlText("end-subtitle");
        }
        hideHtmlText("end-button-retry");
        hideHtmlText("end-button-menu");
        showHtmlButton("end-button-retry-btn", {
            text: "Play again",
            x: retryButton.x,
            y: retryButton.y,
            width: 206,
            height: 48,
            radius: 24,
            fontSize: 23,
            theme: "red",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.endOverlay.setVisible(false);
                this.hideEndOverlayHtml();
                hideHtmlText("modal-title");
                this.showGameplayHtml();
                this.newGame();
                this.gameStarted = true;
                gameplayStart();
            }
        });
        showHtmlButton("end-button-menu-btn", {
            text: "Main menu",
            x: menuButton.x,
            y: menuButton.y,
            width: 206,
            height: 48,
            radius: 24,
            fontSize: 23,
            theme: "blue",
            onClick: () => {
                this.playButton();
                this.triggerHaptic("light");
                this.endOverlay.setVisible(false);
                this.hideEndOverlayHtml();
                hideHtmlText("modal-title");
                gameplayStop();
                this.scene.start("MainMenu");
            }
        });
        if (showVictoryDetails && (config?.featuredMessage ?? "").trim().length > 0) {
            showHtmlText("end-featured-message", {
                text: config?.featuredMessage ?? "",
                x: this.scale.width * 0.5,
                y: featuredMessage.y,
                fontSize: 17,
                maxWidth: 388,
                letterSpacing: 0.1,
                variant: "modal",
                multicolor: false,
                color: "#FFFFFF",
                strokeColor: "#111111",
                strokeWidth: 1.2
            });
        } else {
            hideHtmlText("end-featured-message");
        }

        this.tweens.killTweensOf([featuredCard, featuredMessage, scoreBreakdown, finalScore]);
        if (
            showVictoryDetails
            && config?.featuredCard
            && config.baseScore !== undefined
            && config.timeBonus !== undefined
            && config.moveBonus !== undefined
            && config.finalScore !== undefined
        ) {
            featuredCard.setTexture(this.getCardTextureKey(config.featuredCard.suit, config.featuredCard.rank));
            featuredCard.setDisplaySize(this.cardW * 1.5, this.cardH * 1.5);
            featuredCard.setAlpha(0);
            featuredCard.setScale(0.82);
            featuredMessage.setText(config.featuredMessage ?? "");
            featuredMessage.setAlpha(0);
            scoreBreakdown.setText("");
            finalScore.setText("");
            this.tweens.add({
                targets: featuredCard,
                alpha: 1,
                scale: 1,
                duration: 420,
                ease: "Back.easeOut",
                delay: 120
            });
            this.animateVictoryScore(
                scoreBreakdown,
                finalScore,
                config.baseScore,
                config.timeBonus,
                config.moveBonus,
                config.finalScore
            );
        } else {
            featuredCard.setAlpha(1);
            featuredCard.setScale(1);
            featuredMessage.setAlpha(1);
            scoreBreakdown.setAlpha(1);
            finalScore.setAlpha(1);
            scoreBreakdown.setText("");
            finalScore.setText("");
            hideHtmlText("end-score-breakdown");
            hideHtmlText("end-final-score");
        }

        this.endOverlay.setVisible(true).setAlpha(0);
        this.tweens.add({
            targets: this.endOverlay,
            alpha: 1,
            duration: 280,
            ease: "Sine.out"
        });
    }

    private triggerWinConfetti() {
        const w = this.scale.width;
        const emitter = this.add.particles(0, 0, "confetti", {
            x: { min: 0, max: w },
            y: -20,
            lifespan: 3600,
            speedY: { min: 240, max: 520 },
            speedX: { min: -180, max: 180 },
            rotate: { min: 0, max: 360 },
            gravityY: 140,
            scale: { start: 1.15, end: 0.45 },
            quantity: 6,
            frequency: 22,
            tint: [0xF1C40F, 0xE74C3C, 0x3498DB, 0x2ECC71, 0x9B59B6, 0xE67E22]
        });
        // Keep the confetti above the victory modal so it falls across the panel.
        emitter.setDepth(4700);

        this.time.delayedCall(3200, () => {
            emitter.stop();
            this.time.delayedCall(3200, () => emitter.destroy());
        });
    }

    private createEndOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(4500).setVisible(false);
        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0);

        const panel = this.add.graphics();
        const pW = Math.min(500, w - 40);
        const pH = 620;
        const panelTop = h * 0.5 - pH / 2;
        const panelBottom = h * 0.5 + pH / 2;
        panel.fillStyle(0x17202A, 0.95);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.container(w * 0.5, panelTop + 56);
        title.name = "title";
        this.renderModalTitle(title, "Game over");

        const subtitle = this.add.text(w * 0.5, panelTop + 122, "", {
            ...this.uiText(21, "#BDC3C7", "800"),
            wordWrap: { width: pW - 60 }
        }).setOrigin(0.5).setAlpha(0);
        subtitle.name = "subtitle";

        const featuredCard = this.add.image(w * 0.5, panelTop + 282, "card_back")
            .setDisplaySize(this.cardW * 1.5, this.cardH * 1.5)
            .setVisible(false);
        featuredCard.name = "featured-card";

        const featuredMessage = this.add.text(w * 0.5, panelTop + 190, "", {
            ...this.uiText(19, "#FFFFFF", "800"),
            wordWrap: { width: pW - 70 },
            align: "center"
        }).setOrigin(0.5).setVisible(false).setAlpha(0);
        featuredMessage.name = "featured-message";

        const scoreBreakdown = this.add.text(w * 0.5, panelTop + 392, "", {
            ...this.uiText(18, "#ECF0F1", "800"),
            align: "center",
            lineSpacing: 10
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setAlpha(0);
        scoreBreakdown.name = "score-breakdown";

        const finalScore = this.add.text(w * 0.5, panelTop + 454, "", this.uiText(28, "#FFFFFF", "900", "#B3131B"))
            .setOrigin(0.5)
            .setVisible(false)
            .setAlpha(0);
        finalScore.name = "final-score";

        const retry = this.makeCenterButton(w * 0.5, panelBottom - 122, "Play again", () => {
            this.endOverlay.setVisible(false);
            this.hideEndOverlayHtml();
            hideHtmlText("modal-title");
            this.showGameplayHtml();
            this.newGame();
            this.gameStarted = true;
            gameplayStart();
        }, "red", 206, 48, true);
        retry.name = "retry";
        const menu = this.makeCenterButton(w * 0.5, panelBottom - 52, "Main menu", () => {
            this.endOverlay.setVisible(false);
            this.hideEndOverlayHtml();
            hideHtmlText("modal-title");
            gameplayStop();
            this.scene.start("MainMenu");
        }, "blue", 206, 48, true);
        menu.name = "menu";

        c.add([dark, panel, title, subtitle, featuredCard, featuredMessage, scoreBreakdown, finalScore, retry, menu]);
        this.endOverlay = c;
    }

    private openLeaveOverlay() {
        const overlayAttached = !!this.leaveOverlay && this.children.exists(this.leaveOverlay);
        if (overlayAttached && this.leaveOverlay?.visible) return;
        if (this.leaveOverlay) {
            this.tweens.killTweensOf(this.leaveOverlay);
            this.leaveOverlay.destroy();
            this.leaveOverlay = undefined;
        }
        this.createLeaveOverlay();
        gameplayStop();
        this.hideGameplayHtml();
        const overlay = this.leaveOverlay!;
        overlay.setVisible(true);
        overlay.setAlpha(0);
        this.tweens.add({
            targets: overlay,
            alpha: 1,
            duration: 200,
        });
    }

    private closeLeaveOverlay() {
        const overlay = this.leaveOverlay;
        if (!overlay || !this.children.exists(overlay) || !overlay.visible) return;
        this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                overlay.destroy();
                this.leaveOverlay = undefined;
                if (!this.settingsOverlay?.visible && !this.endOverlay?.visible) {
                    this.hideLeaveOverlayHtml();
                    hideHtmlText("modal-title");
                    this.showGameplayHtml();
                    this.updateHUD();
                    this.updateHintButton();
                    gameplayStart();
                }
            }
        });
    }

    private createLeaveOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5400).setVisible(false);

        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.78).setOrigin(0, 0);
        dark.setInteractive();

        const panel = this.add.graphics();
        const pW = Math.min(440, w - 40);
        const pH = 292;
        const panelTop = h * 0.5 - pH / 2;
        const panelBottom = h * 0.5 + pH / 2;
        panel.fillStyle(0x1E272E, 0.97);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.container(w * 0.5, panelTop + 54);
        this.renderModalTitle(title, "Return home");

        const subtitle = this.add.text(w * 0.5, panelTop + 118, "Leave this run and go back to the main menu?", {
            ...this.uiText(19, "#ECF0F1", "800"),
            wordWrap: { width: pW - 56 },
            align: "center"
        }).setOrigin(0.5).setAlpha(0);

        const stayBtn = this.makeCenterButton(w * 0.5, panelBottom - 108, "Stay", () => {
            this.closeLeaveOverlay();
        }, "green", 192, 46, true);
        const leaveBtn = this.makeCenterButton(w * 0.5, panelBottom - 42, "Leave", () => {
            this.isShuttingDown = true;
            this.hideLeaveOverlayHtml();
            hideHtmlText("modal-title");
            this.scene.start("MainMenu");
        }, "red", 192, 46, true);

        c.add([dark, panel, title, subtitle, stayBtn, leaveBtn]);
        this.leaveOverlay = c;
        this.showLeaveOverlayHtml(panelTop, panelBottom);
    }

    private makeCenterButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void,
        theme: "red" | "green" | "blue" = "red",
        w = 240,
        h = 56,
        useHtmlLabel = false
    ) {
        const c = this.add.container(x, y);
        const radius = Math.floor(h / 2);

        const btnGraphics = this.add.graphics();
        const drawBtn = (isPressed: boolean, isHover: boolean) => {
            btnGraphics.clear();
            const yOff = isPressed ? 6 : 0;

            if (!isPressed) {
                btnGraphics.fillStyle(0x000000, 0.4);
                btnGraphics.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
            }

            const rimFill = theme === "blue"
                ? 0x10254a
                : theme === "green"
                    ? 0x0e4b28
                    : 0x111111;
            const mainFill = theme === "blue"
                ? (isHover ? 0x355caa : 0x1f3d7a)
                : theme === "green"
                    ? (isHover ? 0x35b96a : 0x1e8449)
                    : (isHover ? 0xD72638 : 0xB3131B);

            btnGraphics.fillStyle(rimFill, 1);
            btnGraphics.fillRoundedRect(-w / 2, -h / 2 + yOff + 6, w, h, radius);

            btnGraphics.fillStyle(mainFill, 1);
            btnGraphics.fillRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);

            // Highlight
            btnGraphics.fillStyle(0xFFFFFF, 0.2);
            btnGraphics.fillRoundedRect(-w / 2 + 15, -h / 2 + yOff + 5, w - 30, h / 3, radius - 15);

            btnGraphics.lineStyle(3, 0xFFFFFF, 0.9);
            btnGraphics.strokeRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
        };
        drawBtn(false, false);

        const t = this.add.text(0, -2, label, this.uiText(23, "#FFFFFF", "900", "#1A0003")).setOrigin(0.5).setAlpha(useHtmlLabel ? 0 : 1);

        const centerHitZone = this.add.zone(0, 0, w, h + 10).setInteractive({ useHandCursor: true });
        c.add([btnGraphics, t, centerHitZone]);
        if (useHtmlLabel) {
            btnGraphics.setVisible(false);
            t.setVisible(false);
            centerHitZone.input!.enabled = false;
        }

        centerHitZone.on("pointerover", () => {
            document.body.style.cursor = "pointer";
            drawBtn(false, true);
        });
        centerHitZone.on("pointerout", () => {
            document.body.style.cursor = "default";
            drawBtn(false, false);
            t.y = -2;
        });
        centerHitZone.on("pointerdown", () => {
            drawBtn(true, true);
            t.y = 4;
        });
        centerHitZone.on("pointerup", () => {
            document.body.style.cursor = "default";
            drawBtn(false, true);
            t.y = -2;
            this.playButton();
            this.triggerHaptic("light");
            onClick();
        });
        return c;
    }

    private rebuildOverlays() {
        const endVisible = !!this.endOverlay?.visible;
        const endState = this.endOverlayState;
        const howToVisible = !!this.howToOverlay?.visible;
        this.settingsOverlay?.destroy();
        this.endOverlay?.destroy();
        this.leaveOverlay?.destroy();
        this.howToOverlay?.destroy();
        this.settingsOverlay = undefined;
        this.howToOverlay = undefined;
        this.createEndOverlay();
        this.createLeaveOverlay();
        if (howToVisible) {
            this.createHowToOverlay();
            this.howToOverlay!.setVisible(true);
            this.updateHowToOverlay();
        }
        hideHtmlText("modal-title");
        if (endVisible && endState) {
            this.openEnd(endState.title, endState.subtitle, endState.config);
        }
    }
}
