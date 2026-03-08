
import Phaser from "phaser";
import ThemeManager, { SeasonType, TimeType } from "../scripts/ThemeManager";
import TerrainGenerator from "../scripts/TerrainGenerator";

export default class MapSelect extends Phaser.Scene {
    constructor() {
        super("MapSelect");
    }

    create() {
        const { width, height } = this.scale;

        // Initial defaults
        if (!this.registry.has('season')) this.registry.set('season', 'spring');
        if (!this.registry.has('time')) this.registry.set('time', 'day');

        let currentSeason = this.registry.get('season') as SeasonType;
        let currentTime = this.registry.get('time') as TimeType;

        // --- PREVIEW BACKGROUND ---
        const terrainGen = new TerrainGenerator(this, null);
        let currentTerrainPreview: any = null;

        // Background Graphics for sky and mountains (separate from terrain)
        const bgGraphics = this.add.graphics();
        bgGraphics.setDepth(-10); // Check depth

        const updateBackground = () => {
            const theme = ThemeManager.getColors(currentSeason, currentTime);

            // 1. Clear Old Preview
            if (currentTerrainPreview && currentTerrainPreview.graphics) {
                currentTerrainPreview.graphics.destroy();
            }
            bgGraphics.clear();

            // 2. Draw Sky and Mountains
            // Sky
            bgGraphics.fillStyle(theme.sky, 1);
            bgGraphics.fillRect(0, 0, width, height);

            // Mountains
            bgGraphics.fillStyle(theme.mountains, theme.mountainAlpha);
            bgGraphics.fillEllipse(width * 0.2, height * 0.65, 500, 300);
            bgGraphics.fillEllipse(width * 0.8, height * 0.7, 600, 350);
            bgGraphics.fillEllipse(width * 0.5, height * 0.75, 700, 250);

            // 3. Generate Terrain Preview
            currentTerrainPreview = terrainGen.generateTerrain(height * 0.6, 0, 1.2, theme, true);
            if (currentTerrainPreview && currentTerrainPreview.graphics) {
                currentTerrainPreview.graphics.setDepth(-5);
            }
        };
        updateBackground();


        // Title
        this.add.text(width / 2, 60, "SELECT MAP", {
            fontSize: '40px',
            fontFamily: '"Press Start 2P"',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // --- SEASONS ---
        this.add.text(width / 2, 200, "SEASON", { fontSize: '24px', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);

        const seasonOpts: SeasonType[] = ['spring', 'winter', 'desert', 'fall'];
        const seasonGroup = this.add.container(width / 2, 260);

        seasonOpts.forEach((s, i) => {
            const x = (i - 1.5) * 160;
            const btn = this.add.container(x, 0);

            // Highlight box
            const highlight = this.add.rectangle(0, 0, 140, 50, 0xffffff).setAlpha(0);

            const bg = this.add.rectangle(0, 0, 130, 40, 0x333333).setInteractive({ useHandCursor: true });
            const txt = this.add.text(0, 0, s.toUpperCase(), {
                fontFamily: '"Press Start 2P"', fontSize: '16px', color: '#ffffff'
            }).setOrigin(0.5);

            btn.add([highlight, bg, txt]);

            // Update highlight function
            const checkHighlight = () => {
                highlight.setAlpha(currentSeason === s ? 1 : 0);
            };
            // Hook for update
            (btn as any).updateState = checkHighlight;
            checkHighlight();

            bg.on('pointerdown', () => {
                this.sound.play('ButtonClick');
                currentSeason = s;
                this.registry.set('season', currentSeason);
                updateBackground();
                // Refresh all highlights
                seasonGroup.list.forEach(c => (c as any).updateState && (c as any).updateState());
            });

            seasonGroup.add(btn);
        });

        // --- TIME ---
        this.add.text(width / 2, 400, "TIME", { fontSize: '24px', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);

        const timeOpts: TimeType[] = ['day', 'sunset', 'night', 'morning'];
        const timeGroup = this.add.container(width / 2, 460);

        timeOpts.forEach((t, i) => {
            const x = (i - 1.5) * 160;
            const btn = this.add.container(x, 0);

            // Highlight box
            const highlight = this.add.rectangle(0, 0, 140, 50, 0xffffff).setAlpha(0);

            const bg = this.add.rectangle(0, 0, 130, 40, 0x333333).setInteractive({ useHandCursor: true });
            const txt = this.add.text(0, 0, t.toUpperCase(), {
                fontFamily: '"Press Start 2P"', fontSize: '16px', color: '#ffffff'
            }).setOrigin(0.5);

            btn.add([highlight, bg, txt]);

            const checkHighlight = () => {
                highlight.setAlpha(currentTime === t ? 1 : 0);
            };
            (btn as any).updateState = checkHighlight;
            checkHighlight();

            bg.on('pointerdown', () => {
                this.sound.play('ButtonClick');
                currentTime = t;
                // Map old logic: isNight registry is legacy, but Level might use it temporarily
                // We will update Level to use 'time' registry mostly.
                this.registry.set('time', currentTime);

                // Legacy support (optional, if Level relies on isNight bool)
                this.registry.set('isNight', currentTime === 'night');

                updateBackground();
                timeGroup.list.forEach(c => (c as any).updateState && (c as any).updateState());
            });

            timeGroup.add(btn);
        });

        // --- BACK BUTTON ---
        const isMobile = window.matchMedia('(pointer: coarse)').matches;
        const backBtn = this.add.text(40, isMobile ? 120 : 60, "< BACK", {
            fontSize: '20px', fontFamily: '"Press Start 2P"', color: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.sound.play('ButtonClick');
            this.scene.stop();
            this.scene.start('Menu'); // Go back to Main Menu
        });
    }
}
