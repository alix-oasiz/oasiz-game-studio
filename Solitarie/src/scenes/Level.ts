import Phaser from "phaser";
import { gameplayStart, gameplayStop, submitPlatformScore, triggerPlatformHaptic } from "../platform/oasiz";
import { syncBackgroundMusic } from "../audio/backgroundMusic";

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

export default class Level extends Phaser.Scene {
    private cardW = 92;
    private cardH = 132;
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

    private infoText?: Phaser.GameObjects.Text;
    private settingsOverlay!: Phaser.GameObjects.Container;
    private endOverlay!: Phaser.GameObjects.Container;
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

    constructor() {
        super("Level");
    }

    create() {
        this.settings = this.loadSettings();
        this.drawCount = this.settings.drawCount;
        this.scale.on("resize", () => {
            this.redrawTable();
            this.layoutAll();
            this.rebuildOverlays();
        });

        this.redrawTable();
        this.initInput();
        this.newGame();
        this.gameStarted = true;
        gameplayStart();
        syncBackgroundMusic(this, this.settings.music);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.hudTimer?.remove(false);
            this.hudTimer = undefined;
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

    private triggerHaptic(type: HapticType) {
        triggerPlatformHaptic(this.settings.haptics, type);
    }

    private submitScore() {
        let score = 0;
        this.foundations.forEach(pile => {
            pile.forEach(card => {
                score += (card.data.rank * 10);
            });
        });
        submitPlatformScore(score);
    }

    private redrawTable() {
        this.children.removeAll();

        const w = this.scale.width;
        const h = this.scale.height;
        const mobilePortrait = h > w;

        const bg = this.add.image(w * 0.5, h * 0.5, this.settings.background);
        bg.setDisplaySize(w, h).setDepth(-1000);

        const topSafe = this.isMobile() ? 120 : 45;
        const left = mobilePortrait ? 6 : Math.max(18, Math.floor(w * 0.025));
        const top = topSafe + (mobilePortrait ? 34 : 46);
        const tableauGap = mobilePortrait ? 2 : 8;
        const foundationGap = mobilePortrait ? 4 : 8;
        const centerGap = mobilePortrait ? 4 : 12;
        const availableWidth = w - left * 2;
        const cardWFromTableau = Math.floor((availableWidth - tableauGap * 6) / 7);
        const cardWFromTopRow = Math.floor((availableWidth - tableauGap - foundationGap * 3 - centerGap) / 6);
        const maxCardW = mobilePortrait ? 118 : 128;
        this.cardW = Phaser.Math.Clamp(Math.min(cardWFromTableau, cardWFromTopRow), 40, maxCardW);
        this.cardH = Math.floor(this.cardW * 1.42);

        this.tableauGapX = this.cardW + tableauGap;
        this.faceUpOffset = mobilePortrait ? Math.floor(this.cardH * 0.18) : 24;
        this.faceDownOffset = mobilePortrait ? Math.floor(this.cardH * 0.07) : 9;


        this.stockPos.set(left, top);
        this.wastePos.set(left + this.tableauGapX, top);

        this.foundationPos = [];
        const foundationStart = w - (this.cardW * 4 + foundationGap * 3) - left;
        for (let i = 0; i < 4; i++) this.foundationPos.push(new Phaser.Math.Vector2(foundationStart + i * (this.cardW + foundationGap), top));

        this.tableauPos = [];
        const tableauY = top + this.cardH + (mobilePortrait ? 10 : 20);
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
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "STOCK", this.uiText(slotLabelSize, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
            } else if (type === "waste") {
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "WASTE", this.uiText(slotLabelSize, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
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
        return {
            fontSize: `${size}px`,
            color,
            fontStyle: weight as any,
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            resolution: 2,
            stroke: stroke || undefined,
            strokeThickness: stroke ? 4 : 0
        };
    }

    private createHUD(topSafe: number) {
        const y = Math.max(24, topSafe - 15);

        const w = this.scale.width;
        const mobile = this.isMobile();
        const statsY = Math.max(20, y - (mobile ? 32 : 28));
        this.infoText = this.add.text(w * 0.5, statsY, "", {
            ...this.uiText(mobile ? 16 : 18, "#FFFFFF", "900"),
            align: "center"
        }).setOrigin(0.5).setDepth(2001);

        const newBtn = this.makeTopButton(this.scale.width - 334, y, 92, 38, "NEW GAME", () => {
            this.triggerHaptic("light");
            this.newGame();
        });

        const hintBtn = this.makeTopButton(this.scale.width - 234, y, 92, 38, "HINT", () => {
            this.triggerHaptic("light");
            this.provideHint();
        });

        const settingsBtn = this.makeTopButton(this.scale.width - 126, y, 100, 38, "SETTINGS", () => {
            this.triggerHaptic("light");
            this.openSettings();
        });

        newBtn.setDepth(2000);
        hintBtn.setDepth(2000);
        settingsBtn.setDepth(2000);
    }

    private makeTopButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
        const c = this.add.container(x, y);
        const radius = 10;

        const btnGraphics = this.add.graphics();
        const drawBtn = (isPressed: boolean, isHover: boolean) => {
            btnGraphics.clear();
            const yOff = isPressed ? 4 : 0;

            if (!isPressed) {
                btnGraphics.fillStyle(0x000000, 0.3);
                btnGraphics.fillRoundedRect(0, 6, w, h, radius);
            }

            // Bottom Rim
            btnGraphics.fillStyle(0x1B2631, 1);
            btnGraphics.fillRoundedRect(0, yOff + 4, w, h, radius);

            // Main fill
            btnGraphics.fillStyle(isHover ? 0x34495E : 0x2C3E50, 1);
            btnGraphics.fillRoundedRect(0, yOff, w, h, radius);

            // Highlight
            btnGraphics.fillStyle(0xFFFFFF, 0.15);
            btnGraphics.fillRoundedRect(5, yOff + 3, w - 10, h / 4, radius - 5);

            btnGraphics.lineStyle(2, 0xFFFFFF, 0.6);
            btnGraphics.strokeRoundedRect(0, yOff, w, h, radius);
        };
        drawBtn(false, false);

        const t = this.add.text(w / 2, h / 2 - 1, label, this.uiText(14, "#FFFFFF", "800")).setOrigin(0.5);
        const btnHitZone = this.add.zone(w / 2, h / 2, w, h + 8).setInteractive({ useHandCursor: true });
        c.add([btnGraphics, t, btnHitZone]);

        btnHitZone.on("pointerover", () => {
            drawBtn(false, true);
            document.body.style.cursor = "pointer";
        });
        btnHitZone.on("pointerout", () => {
            drawBtn(false, false);
            t.y = h / 2 - 2;
            document.body.style.cursor = "default";
        });
        btnHitZone.on("pointerdown", () => {
            drawBtn(true, true);
            t.y = h / 2 + 2;
        });
        btnHitZone.on("pointerup", () => {
            document.body.style.cursor = "default";
            drawBtn(false, true);
            t.y = h / 2 - 2;
            onClick();
        });
        return c;
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
        this.hudTimer?.remove(false);
        this.hudTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
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
        this.layoutAll();
        this.endOverlay?.setVisible(false);
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

    private layoutStockWaste() {
        this.stock.forEach((card, i) => {
            card.source = { type: "stock" };
            card.data.faceUp = false;
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            card.container.setScale(1, 1);
            card.container.setPosition(this.stockPos.x + Math.min(i, 3) * 0.7, this.stockPos.y + Math.min(i, 3) * 0.7).setDepth(80 + i);
        });
        this.waste.forEach((card, i) => {
            card.source = { type: "waste" };
            card.data.faceUp = true;
            this.refreshCardFace(card);
            this.resetCardTilt(card, true);
            card.container.setScale(1, 1);
            card.container.setPosition(this.wastePos.x + Math.min(i, this.drawCount - 1) * Math.floor(this.cardW * 0.22), this.wastePos.y).setDepth(230 + i);
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
        if (this.stock.length === 0) {
            while (this.waste.length) {
                const c = this.waste.pop()!;
                c.data.faceUp = false;
                this.stock.push(c);
            }
            this.layoutStockWaste();
            return;
        }

        const count = Math.min(this.drawCount, this.stock.length);
        const startWasteCount = this.waste.length;
        const drawnCards: CardGO[] = [];
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
        const wasteOffset = Math.floor(this.cardW * 0.22);
        const stepDelay = 130;
        const moveDuration = 260;
        const flipDuration = 130;

        cards.forEach((card, index) => {
            const finalIndex = startWasteCount + index;
            const targetX = this.wastePos.x + Math.min(finalIndex, this.drawCount - 1) * wasteOffset;
            const targetY = this.wastePos.y;

            card.container.setPosition(this.stockPos.x, this.stockPos.y);
            card.container.setDepth(1400 + index);
            card.container.setScale(1, 1);
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
            if (!this.removeFromSource(this.dragGroup, source)) return this.restoreDragGroup();
            this.foundations[foundationHit].push(first);
            this.afterMove(true, this.foundationPos[foundationHit]);
            return;
        }

        const tableauHit = this.tableauPos.findIndex((p) => x >= p.x && x <= p.x + this.cardW && y >= p.y && y <= this.scale.height - 10);
        if (tableauHit >= 0 && this.canMoveToTableau(first, tableauHit)) {
            const destCol = this.tableau[tableauHit];
            const burstTarget = destCol.length
                ? { x: destCol[destCol.length - 1].container.x, y: destCol[destCol.length - 1].container.y }
                : { x: this.tableauPos[tableauHit].x, y: this.tableauPos[tableauHit].y };
            if (!this.removeFromSource(this.dragGroup, source)) return this.restoreDragGroup();
            this.tableau[tableauHit].push(...this.dragGroup);
            this.afterMove(false, burstTarget);
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

    private afterMove(toFoundation: boolean, burstTarget: { x: number; y: number }) {
        this.tableau.forEach((col) => {
            if (col.length && !col[col.length - 1].data.faceUp) col[col.length - 1].data.faceUp = true;
        });
        this.moveCount += 1;
        this.dragGroup = [];
        this.dragStart = [];
        this.layoutAll();
        this.emitPlacementBurst(burstTarget, toFoundation);
        if (toFoundation) {
            this.playSuccessDrop();
            this.triggerHaptic("medium");
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
        const toCol = this.tableau[toColIndex];
        const idx = fromCol.indexOf(card);
        if (idx < 0) return false;

        const movingStack = fromCol.slice(idx);
        const revealsFaceDown = idx > 0 && !fromCol[idx - 1].data.faceUp;
        const emptiesSource = idx === 0;
        const movesStack = movingStack.length > 1;
        const fillsEmptyColumn = toCol.length === 0;
        const createsUsefulEmptyColumn = emptiesSource && this.hasKingMoveForEmptyColumn(fromColIndex, card);

        return revealsFaceDown || createsUsefulEmptyColumn || movesStack || fillsEmptyColumn;
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
        let score = 0;
        this.foundations.forEach(pile => {
            pile.forEach(card => {
                score += (card.data.rank * 10);
            });
        });
        this.infoText?.setText(`Score: ${score}    Moves: ${this.moveCount}    Time: ${this.formatElapsedTime(this.elapsedSeconds)}`);
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

    private checkGameState() {
        const total = this.foundations.reduce((sum, p) => sum + p.length, 0);
        if (total === 52) {
            this.triggerWinConfetti();
            this.openEnd("VICTORY", "Perfect run. All cards are in foundation.");
            this.submitScore();
            this.triggerHaptic("success");
            return;
        }

        const hasMove = this.hasAnyLegalMove();
        if (!hasMove && this.stock.length === 0) {
            this.openEnd("GAME OVER", "No legal moves left.");
            this.submitScore();
            this.triggerHaptic("error");
        }
    }

    private provideHint() {
        if (!this.gameStarted) return;

        // 1. Check Waste to Foundation
        const wasteTop = this.waste[this.waste.length - 1];
        if (wasteTop) {
            const fi = this.foundationPos.findIndex((_, i) => this.canMoveToFoundation(wasteTop, i));
            if (fi >= 0) return this.showHint(wasteTop, this.foundationPos[fi]);
        }

        // 2. Check Tableau to Foundation
        for (let i = 0; i < 7; i++) {
            const col = this.tableau[i];
            const top = col[col.length - 1];
            if (top && top.data.faceUp) {
                const fi = this.foundationPos.findIndex((_, fidx) => this.canMoveToFoundation(top, fidx));
                if (fi >= 0) return this.showHint(top, this.foundationPos[fi]);
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
                        return this.showHint(card, this.getTableauHintTarget(ti));
                    }
                }
            }
        }

        // 4. Check Waste to Tableau
        if (wasteTop) {
            const ti = this.tableauPos.findIndex((_, i) => this.canMoveToTableau(wasteTop, i));
            if (ti >= 0) return this.showHint(wasteTop, this.getTableauHintTarget(ti));
        }

        // 5. Check if Stock has cards
        if (this.stock.length > 0) {
            return this.showHint(null, this.stockPos, "DRAW FROM STOCK");
        }

        // 6. No moves left and stock empty
        this.openEnd("GAME OVER", "No legal moves left. Hint found nothing.");
        this.triggerHaptic("error");
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
        if (message) {
            const text = this.add.text(target.x + this.cardW / 2, target.y + this.cardH / 2, message, this.uiText(18, "#F1C40F", "900"))
                .setOrigin(0.5).setDepth(3000).setAlpha(0);
            this.tweens.add({
                targets: text,
                alpha: 1,
                y: text.y - 40,
                duration: 500,
                yoyo: true,
                onComplete: () => text.destroy()
            });
        }

        const highlight = this.add.graphics().setDepth(2000);
        highlight.lineStyle(6, 0xF1C40F, 1);
        highlight.strokeRoundedRect(target.x - 4, target.y - 4, this.cardW + 8, this.cardH + 8, 12);
        highlight.setAlpha(0);

        this.tweens.add({
            targets: highlight,
            alpha: 1,
            duration: 300,
            yoyo: true,
            repeat: 2,
            onComplete: () => highlight.destroy()
        });

        if (card) {
            this.tweens.add({
                targets: card.container,
                scale: 1.05,
                duration: 200,
                yoyo: true,
                repeat: 2
            });
        } else {
            // If it's the stock
            this.tweens.add({
                targets: this.stockSlot,
                alpha: 1,
                duration: 250,
                yoyo: true,
                repeat: 2
            });
        }
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

        return this.stock.length > 0;
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
    private playButton() {
        if (this.playLoadedFx("ui_button", { volume: 0.4 })) return;
        this.playTone(520, "sine", 0.05, 0.04);
    }

    private openSettings() {
        if (!this.settingsOverlay) this.createSettingsOverlay();
        gameplayStop();
        this.settingsOverlay.setVisible(true);
    }

    private createSettingsOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(5000);

        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0, 0);
        dark.setInteractive(); // Prevent clicks from going behind the overlay

        const panel = this.add.graphics();
        const pW = Math.min(480, w - 36);
        const pH = 450;
        panel.fillStyle(0x1E272E, 0.95);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);
        panel.lineStyle(2, 0x34495E, 0.8);
        panel.strokeRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.text(w * 0.5, h * 0.5 - 170, "SETTINGS", this.uiText(32, "#FFFFFF", "900", "#1A5276")).setOrigin(0.5);
        title.setShadow(0, 4, "#000000", 6, true);

        const mkToggle = (label: string, key: "music" | "fx" | "haptics", y: number) => {
            const row = this.add.container(w * 0.5 - 150, h * 0.5 + y);
            const txt = this.add.text(0, 0, label, this.uiText(22, "#ECF0F1", "800")).setOrigin(0, 0.5);

            const btnObj = this.add.graphics();
            const drawToggle = (isOn: boolean) => {
                btnObj.clear();
                // shadow
                btnObj.fillStyle(0x000000, 0.3);
                btnObj.fillRoundedRect(250, -16, 90, 40, 20);

                // bottom rim
                btnObj.fillStyle(isOn ? 0x1E8449 : 0x922B21, 1);
                btnObj.fillRoundedRect(250, -18, 90, 40, 20);

                // fill
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
                if (key === "music") {
                    syncBackgroundMusic(this, this.settings.music);
                }
                this.triggerHaptic("light");
            });
            return row;
        };

        const t1 = mkToggle("Music", "music", -82);
        const t2 = mkToggle("Sound Effects", "fx", -20);
        const t3 = mkToggle("Haptics", "haptics", 42);

        // --- DRAW 1 / DRAW 3 TOGGLE ---
        const drawRow = this.add.container(w * 0.5 - 150, h * 0.5 + 104);
        const drawTxt = this.add.text(0, 0, "Draw Count", this.uiText(22, "#ECF0F1", "800")).setOrigin(0, 0.5);

        const drawBtnObj = this.add.graphics();
        const drawToggleDraw = () => {
            drawBtnObj.clear();
            drawBtnObj.fillStyle(0x000000, 0.3);
            drawBtnObj.fillRoundedRect(250, -16, 90, 40, 20);
            drawBtnObj.fillStyle(0x2874A6, 1);
            drawBtnObj.fillRoundedRect(250, -18, 90, 40, 20);
            drawBtnObj.fillStyle(0x3498DB, 1);
            drawBtnObj.fillRoundedRect(250, -20, 90, 40, 20);
            drawBtnObj.lineStyle(3, 0xFFFFFF, 0.8);
            drawBtnObj.strokeRoundedRect(250, -20, 90, 40, 20);
        };
        drawToggleDraw();

        const drawVal = this.add.text(295, -2, `DRAW ${this.settings.drawCount}`, {
            ...this.uiText(15, "#FFFFFF", "900", "#154360")
        }).setOrigin(0.5);

        const drawHitZone = this.add.zone(275, 0, 90, 40).setInteractive({ useHandCursor: true });
        drawRow.add([drawTxt, drawBtnObj, drawVal, drawHitZone]);

        drawHitZone.on("pointerover", () => { document.body.style.cursor = "pointer"; });
        drawHitZone.on("pointerout", () => { document.body.style.cursor = "default"; });
        drawHitZone.on("pointerdown", () => {
            this.settings.drawCount = this.settings.drawCount === 1 ? 3 : 1;
            this.drawCount = this.settings.drawCount;
            drawToggleDraw();
            drawVal.setText(`DRAW ${this.settings.drawCount}`);
            this.saveSettings();
            this.triggerHaptic("light");
        });

        const close = this.makeCenterButton(w * 0.5, h * 0.5 + 180, "CLOSE", () => {
            this.settingsOverlay.setVisible(false);
            gameplayStart();
        });
        c.add([dark, panel, title, t1, t2, t3, drawRow, close]);
        c.setVisible(false);
        this.settingsOverlay = c;
    }

    private openEnd(title: string, subtitle: string) {
        if (!this.endOverlay) this.createEndOverlay();
        gameplayStop();
        this.hudTimer?.remove(false);
        this.hudTimer = undefined;
        const [titleObj, subObj] = this.endOverlay.list.filter(o => o.name === "title" || o.name === "subtitle") as Phaser.GameObjects.Text[];
        titleObj.setText(title);
        subObj.setText(subtitle);

        this.endOverlay.setVisible(true).setAlpha(0).setScale(0.85);
        this.tweens.add({
            targets: this.endOverlay,
            alpha: 1,
            scale: 1,
            duration: 400,
            ease: "Back.easeOut"
        });
    }

    private triggerWinConfetti() {
        const w = this.scale.width;
        const emitter = this.add.particles(0, 0, "confetti", {
            x: { min: 0, max: w },
            y: -20,
            lifespan: 3000,
            speedY: { min: 200, max: 400 },
            speedX: { min: -100, max: 100 },
            rotate: { min: 0, max: 360 },
            gravityY: 100,
            scale: { start: 1, end: 0.5 },
            quantity: 2,
            frequency: 50,
            tint: [0xF1C40F, 0xE74C3C, 0x3498DB, 0x2ECC71, 0x9B59B6, 0xE67E22]
        });
        emitter.setDepth(4000);

        // Stop after 2 seconds
        this.time.delayedCall(2500, () => {
            emitter.stop();
            this.time.delayedCall(3000, () => emitter.destroy());
        });
    }

    private createEndOverlay() {
        const w = this.scale.width;
        const h = this.scale.height;
        const c = this.add.container(0, 0).setDepth(4500).setVisible(false);
        const dark = this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0);

        const panel = this.add.graphics();
        const pW = Math.min(500, w - 40);
        const pH = 320;
        panel.fillStyle(0x17202A, 0.95);
        panel.fillRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);
        panel.lineStyle(2, 0xD4AC0D, 0.8);
        panel.strokeRoundedRect(w * 0.5 - pW / 2, h * 0.5 - pH / 2, pW, pH, 24);

        const title = this.add.text(w * 0.5, h * 0.5 - 80, "GAME OVER", this.uiText(40, "#F1C40F", "900", "#7E5109")).setOrigin(0.5);
        title.name = "title";
        title.setShadow(0, 4, "#000000", 6, true);

        const subtitle = this.add.text(w * 0.5, h * 0.5 - 20, "", this.uiText(20, "#BDC3C7", "800")).setOrigin(0.5);
        subtitle.name = "subtitle";

        const retry = this.makeCenterButton(w * 0.5, h * 0.5 + 50, "PLAY AGAIN", () => {
            this.endOverlay.setVisible(false);
            this.newGame();
            this.gameStarted = true;
            gameplayStart();
        });
        const menu = this.makeCenterButton(w * 0.5, h * 0.5 + 120, "MAIN MENU", () => {
            this.endOverlay.setVisible(false);
            gameplayStop();
            this.scene.start("MainMenu");
        });

        c.add([dark, panel, title, subtitle, retry, menu]);
        this.endOverlay = c;
    }

    private makeCenterButton(x: number, y: number, label: string, onClick: () => void) {
        const c = this.add.container(x, y);
        const w = 240, h = 56, radius = 28;

        const btnGraphics = this.add.graphics();
        const drawBtn = (isPressed: boolean, isHover: boolean) => {
            btnGraphics.clear();
            const yOff = isPressed ? 6 : 0;

            if (!isPressed) {
                btnGraphics.fillStyle(0x000000, 0.4);
                btnGraphics.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
            }

            // Bottom rim (dark yellow)
            btnGraphics.fillStyle(0xB9770E, 1);
            btnGraphics.fillRoundedRect(-w / 2, -h / 2 + yOff + 6, w, h, radius);

            // Main fill
            btnGraphics.fillStyle(isHover ? 0xF4D03F : 0xF1C40F, 1);
            btnGraphics.fillRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);

            // Highlight
            btnGraphics.fillStyle(0xFFFFFF, 0.2);
            btnGraphics.fillRoundedRect(-w / 2 + 15, -h / 2 + yOff + 5, w - 30, h / 3, radius - 15);

            btnGraphics.lineStyle(3, 0xFFFFFF, 0.9);
            btnGraphics.strokeRoundedRect(-w / 2, -h / 2 + yOff, w, h, radius);
        };
        drawBtn(false, false);

        const t = this.add.text(0, -2, label, this.uiText(22, "#FFFFFF", "900", "#9C5700")).setOrigin(0.5);
        t.setShadow(0, 2, "#9C5700", 2, true);

        const centerHitZone = this.add.zone(0, 0, w, h + 10).setInteractive({ useHandCursor: true });
        c.add([btnGraphics, t, centerHitZone]);

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
        this.settingsOverlay?.destroy();
        this.endOverlay?.destroy();
        this.createSettingsOverlay();
        this.createEndOverlay();
    }
}
