import Phaser from "phaser";

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
    front: Phaser.GameObjects.Image;
    back: Phaser.GameObjects.Image;
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

    private infoText!: Phaser.GameObjects.Text;
    private settingsOverlay!: Phaser.GameObjects.Container;
    private endOverlay!: Phaser.GameObjects.Container;

    private settings: SettingsState = { music: true, fx: true, haptics: true, drawCount: 1, background: "table_bg" };
    private musicTimer?: Phaser.Time.TimerEvent;
    private gameStarted = false;

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
        this.startMusicLoop();
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
        if (!this.settings.haptics) return;
        const fn = (window as any).triggerHaptic;
        if (typeof fn === "function") fn(type);
    }

    private submitScore() {
        let score = 0;
        this.foundations.forEach(pile => {
            pile.forEach(card => {
                score += (card.data.rank * 10);
            });
        });
        const fn = (window as any).submitScore;
        if (typeof fn === "function") fn(score);
    }

    private redrawTable() {
        this.children.removeAll();

        const w = this.scale.width;
        const h = this.scale.height;
        const mobilePortrait = h > w;

        const bg = this.add.image(w * 0.5, h * 0.5, this.settings.background);
        bg.setDisplaySize(w, h).setDepth(-1000);

        const topSafe = this.isMobile() ? 120 : 45;

        this.cardW = mobilePortrait ? Math.floor((w - 24 - 6 * 8) / 7) : 92;
        this.cardW = Phaser.Math.Clamp(this.cardW, 62, 102);
        this.cardH = Math.floor(this.cardW * 1.42);

        this.tableauGapX = this.cardW + (mobilePortrait ? 8 : 20);
        this.faceUpOffset = mobilePortrait ? Math.floor(this.cardH * 0.24) : 30;
        this.faceDownOffset = mobilePortrait ? Math.floor(this.cardH * 0.1) : 12;

        const left = mobilePortrait ? 12 : 70;
        const top = topSafe + 60; // Increased from +20 to +60


        this.stockPos.set(left, top);
        this.wastePos.set(left + this.tableauGapX, top);

        this.foundationPos = [];
        const foundationStart = w - (this.cardW * 4 + (mobilePortrait ? 8 : 14) * 3) - left;
        for (let i = 0; i < 4; i++) this.foundationPos.push(new Phaser.Math.Vector2(foundationStart + i * (this.cardW + (mobilePortrait ? 8 : 14)), top));

        this.tableauPos = [];
        const tableauY = top + this.cardH + (mobilePortrait ? 20 : 44);
        for (let i = 0; i < 7; i++) this.tableauPos.push(new Phaser.Math.Vector2(left + i * this.tableauGapX, tableauY));

        const slot = (x: number, y: number, type: "none" | "stock" | "waste" | "suit", suitIndex = 0) => {
            const r = this.add.rectangle(x, y, this.cardW, this.cardH, 0x07110d, 0.35).setOrigin(0, 0);
            r.setStrokeStyle(2, 0xffffff, 0.23);

            if (type === "suit") {
                const s = ["♠", "♥", "♦", "♣"][suitIndex];
                const color = (suitIndex === 1 || suitIndex === 2) ? "#E74C3C" : "#BDC3C7";
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, s, this.uiText(46, color, "800")).setOrigin(0.5).setAlpha(0.25);
            } else if (type === "stock") {
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "STOCK", this.uiText(14, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
            } else if (type === "waste") {
                this.add.text(x + this.cardW / 2, y + this.cardH / 2, "WASTE", this.uiText(14, "#d8e4dc", "800")).setOrigin(0.5).setAlpha(0.5);
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
            stroke: stroke || undefined,
            strokeThickness: stroke ? 4 : 0
        };
    }

    private createHUD(topSafe: number) {
        const y = Math.max(24, topSafe - 15);

        const h = this.scale.height;
        this.infoText = this.add.text(this.scale.width / 2, h - 45, "", {
            fontSize: "20px", color: "#ECF0F1", fontStyle: "800",
            fontFamily: "'Nunito', 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif",
            shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 4, fill: true }
        }).setOrigin(0.5).setDepth(2000);

        const newBtn = this.makeTopButton(this.scale.width - 390, y, 110, 44, "NEW GAME", () => {
            this.triggerHaptic("light");
            this.newGame();
        });

        const hintBtn = this.makeTopButton(this.scale.width - 270, y, 110, 44, "HINT", () => {
            this.triggerHaptic("light");
            this.provideHint();
        });

        const settingsBtn = this.makeTopButton(this.scale.width - 150, y, 130, 44, "SETTINGS", () => {
            this.triggerHaptic("light");
            this.openSettings();
        });

        newBtn.setDepth(2000);
        hintBtn.setDepth(2000);
        settingsBtn.setDepth(2000);
    }

    private makeTopButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
        const c = this.add.container(x, y);
        const radius = 12;

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

        const t = this.add.text(w / 2, h / 2 - 2, label, this.uiText(17, "#FFFFFF", "800")).setOrigin(0.5);
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
            this.dragGroup.forEach((c, i) => {
                c.container.x = this.dragStart[i].x + dx;
                c.container.y = this.dragStart[i].y + dy;
            });
        });

        this.input.on("dragstart", (_: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject) => {
            if (!this.gameStarted || !go.parentContainer) return;
            const card = this.findCardByContainer(go.parentContainer as Phaser.GameObjects.Container);
            if (!card) return;
            this.tryBeginDrag(card);
        });

        this.input.on("dragend", (pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject, dropped: boolean) => {
            const container = go.parentContainer as Phaser.GameObjects.Container;
            if (!this.gameStarted || !this.dragGroup.length || !container || this.dragGroup[0].container !== container) return;
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
        const front = this.add.image(0, 0, this.getCardTextureKey(data.suit, data.rank)).setOrigin(0, 0).setDisplaySize(this.cardW, this.cardH);
        const back = this.add.image(0, 0, "card_back").setOrigin(0, 0).setDisplaySize(this.cardW, this.cardH).setVisible(false);
        const cardHitZone = this.add.zone(this.cardW / 2, this.cardH / 2, this.cardW, this.cardH).setInteractive({ useHandCursor: true });
        container.add([front, back, cardHitZone]);

        this.input.setDraggable(cardHitZone);

        const cardGO: CardGO = { data, container, front, back, source: { type: "stock" } };

        cardHitZone.on("pointerdown", () => {
            if (cardGO.source.type === "stock") {
                this.drawFromStock();
            }
        });

        return cardGO;
    }

    private refreshCardFace(card: CardGO) {
        card.front.setVisible(card.data.faceUp);
        card.back.setVisible(!card.data.faceUp);
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
            card.container.setPosition(this.stockPos.x + Math.min(i, 3) * 0.7, this.stockPos.y + Math.min(i, 3) * 0.7).setDepth(80 + i);
        });
        this.waste.forEach((card, i) => {
            card.source = { type: "waste" };
            card.data.faceUp = true;
            this.refreshCardFace(card);
            card.container.setPosition(this.wastePos.x + Math.min(i, this.drawCount - 1) * Math.floor(this.cardW * 0.22), this.wastePos.y).setDepth(230 + i);
        });
    }

    private layoutFoundations() {
        this.foundations.forEach((pile, fi) => pile.forEach((card, i) => {
            card.source = { type: "foundation", index: fi };
            card.data.faceUp = true;
            this.refreshCardFace(card);
            card.container.setPosition(this.foundationPos[fi].x, this.foundationPos[fi].y).setDepth(340 + fi * 20 + i);
        }));
    }

    private layoutTableau() {
        this.tableau.forEach((col, ci) => {
            let y = this.tableauPos[ci].y;
            col.forEach((card, i) => {
                card.source = { type: "tableau", index: ci };
                this.refreshCardFace(card);
                card.container.setPosition(this.tableauPos[ci].x, y).setDepth(600 + ci * 40 + i);
                y += card.data.faceUp ? this.faceUpOffset : this.faceDownOffset;
            });
        });
    }

    private drawFromStock() {
        if (!this.gameStarted) return;
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
        for (let i = 0; i < count; i++) {
            const card = this.stock.pop()!;
            card.data.faceUp = true;
            this.waste.push(card);
        }
        this.playCardDrop();
        this.triggerHaptic("light");
        this.layoutStockWaste();
        this.updateHUD();
    }

    private findCardByContainer(container: Phaser.GameObjects.Container): CardGO | undefined {
        return [...this.stock, ...this.waste, ...this.foundations.flat(), ...this.tableau.flat()].find(c => c.container === container);
    }

    private tryBeginDrag(card: CardGO) {
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
            this.afterMove(true);
            return;
        }

        const tableauHit = this.tableauPos.findIndex((p) => x >= p.x && x <= p.x + this.cardW && y >= p.y && y <= this.scale.height - 10);
        if (tableauHit >= 0 && this.canMoveToTableau(first, tableauHit)) {
            if (!this.removeFromSource(this.dragGroup, source)) return this.restoreDragGroup();
            this.tableau[tableauHit].push(...this.dragGroup);
            this.afterMove(false);
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

    private afterMove(toFoundation: boolean) {
        this.tableau.forEach((col) => {
            if (col.length && !col[col.length - 1].data.faceUp) col[col.length - 1].data.faceUp = true;
        });
        this.dragGroup = [];
        this.dragStart = [];
        this.layoutAll();
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
        this.dragGroup.forEach((c, i) => c.container.setPosition(this.dragStart[i].x, this.dragStart[i].y));
        this.dragGroup = [];
        this.dragStart = [];
        this.layoutAll();
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

    private updateHUD() {
        let score = 0;
        let foundationCount = 0;
        this.foundations.forEach(pile => {
            foundationCount += pile.length;
            pile.forEach(card => {
                score += (card.data.rank * 10);
            });
        });
        this.infoText?.setText(`DRAW:${this.drawCount}  STOCK:${this.stock.length}  WASTE:${this.waste.length}  FOUNDATION:${foundationCount}/52  SCORE:${score}`);
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
                        // Don't hint moving a King to an empty spot if it's already at the bottom of its column
                        if (card.data.rank === 13 && j === 0) continue;
                        return this.showHint(card, this.tableauPos[ti]);
                    }
                }
            }
        }

        // 4. Check Waste to Tableau
        if (wasteTop) {
            const ti = this.tableauPos.findIndex((_, i) => this.canMoveToTableau(wasteTop, i));
            if (ti >= 0) return this.showHint(wasteTop, this.tableauPos[ti]);
        }

        // 5. Check if Stock has cards
        if (this.stock.length > 0) {
            return this.showHint(null, this.stockPos, "DRAW FROM STOCK");
        }

        // 6. No moves left and stock empty
        this.openEnd("GAME OVER", "No legal moves left. Hint found nothing.");
        this.triggerHaptic("error");
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
                if (this.tableau.some((_, ti) => ti !== i && this.canMoveToTableau(card, ti))) return true;
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

    private playCardPick() { this.playTone(320, "sine", 0.08, 0.06, 450); }
    private playCardDrop() { this.playTone(400, "triangle", 0.08, 0.06, 250); }
    private playSuccessDrop() { this.playTone(580, "sine", 0.12, 0.08, 800); }
    private playButton() { this.playTone(520, "sine", 0.05, 0.04); }

    private startMusicLoop() {
        this.musicTimer?.remove(false);
        const chords = [
            [261.63, 329.63, 392.00], // C
            [220.00, 261.63, 329.63], // Am
            [174.61, 220.00, 261.63], // F
            [196.00, 246.94, 293.66]  // G
        ];
        let chordIdx = 0;
        let cDelay = 0;

        this.musicTimer = this.time.addEvent({
            delay: 480,
            loop: true,
            callback: () => {
                if (!this.settings.music || !this.gameStarted) return;
                const c = chords[chordIdx];
                const note = c[cDelay % 3];
                // Soft background arpeggio
                if ((this.sound as any).context) {
                    const ctx = ((this.sound as any).context as AudioContext);
                    const now = ctx.currentTime;
                    const osc = ctx.createOscillator();
                    const filter = ctx.createBiquadFilter();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(note, now);
                    filter.type = "lowpass";
                    filter.frequency.setValueAtTime(800, now);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
                    osc.connect(filter).connect(gain).connect(ctx.destination);
                    osc.start(now);
                    osc.stop(now + 1.25);

                    if (cDelay % 6 === 0) {
                        // Soft bass note on chord shift
                        const oscB = ctx.createOscillator();
                        const gB = ctx.createGain();
                        oscB.frequency.setValueAtTime(c[0] / 2, now);
                        oscB.type = "triangle";
                        gB.gain.setValueAtTime(0.0001, now);
                        gB.gain.exponentialRampToValueAtTime(0.02, now + 0.1);
                        gB.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
                        oscB.connect(gB).connect(ctx.destination);
                        oscB.start(now);
                        oscB.stop(now + 2.05);
                    }
                }
                cDelay++;
                if (cDelay > 7) {
                    cDelay = 0;
                    chordIdx = (chordIdx + 1) % chords.length;
                }
            }
        });
    }



    private openSettings() {
        if (!this.settingsOverlay) this.createSettingsOverlay();
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

        const close = this.makeCenterButton(w * 0.5, h * 0.5 + 180, "CLOSE", () => this.settingsOverlay.setVisible(false));
        c.add([dark, panel, title, t1, t2, t3, drawRow, close]);
        c.setVisible(false);
        this.settingsOverlay = c;
    }

    private openEnd(title: string, subtitle: string) {
        if (!this.endOverlay) this.createEndOverlay();
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
        });
        const menu = this.makeCenterButton(w * 0.5, h * 0.5 + 120, "MAIN MENU", () => {
            this.endOverlay.setVisible(false);
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
