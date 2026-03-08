
import Phaser from "phaser";
import SkinManager, { SkinType } from "../scripts/SkinManager";

export default class BallSelect extends Phaser.Scene {
    constructor() {
        super("BallSelect");
    }

    create() {
        const { width, height } = this.scale;

        // Background
        this.add.rectangle(0, 0, width, height, 0x222222).setOrigin(0);

        // Title
        this.add.text(width / 2, 40, "SELECT BALL", {
            fontSize: '32px',
            fontFamily: '"Press Start 2P"',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Current selection
        const currentBallKey = this.registry.get('selectedBallKey') || 'solid_0xffffff';

        // Define all ball variations (skin + color combinations)
        const ballVariations: { skin: SkinType, color: number, label?: string }[] = [
            // Solid colors
            { skin: 'solid', color: 0xffffff },
            { skin: 'solid', color: 0xff595e },
            { skin: 'solid', color: 0x1982c4 },
            { skin: 'solid', color: 0x8ac926 },
            { skin: 'solid', color: 0xffca3a },
            { skin: 'solid', color: 0x6a4c93 },
            { skin: 'solid', color: 0xff924c },

            // Stripe colors
            { skin: 'stripe', color: 0xffffff },
            { skin: 'stripe', color: 0xff595e },
            { skin: 'stripe', color: 0x1982c4 },
            { skin: 'stripe', color: 0x8ac926 },
            { skin: 'stripe', color: 0xffca3a },
            { skin: 'stripe', color: 0x6a4c93 },
            { skin: 'stripe', color: 0xff924c },

            // Target colors
            { skin: 'target', color: 0xffffff },
            { skin: 'target', color: 0xff595e },
            { skin: 'target', color: 0x1982c4 },
            { skin: 'target', color: 0x8ac926 },
            { skin: 'target', color: 0xffca3a },
            { skin: 'target', color: 0x6a4c93 },
            { skin: 'target', color: 0xff924c },

            // Dot colors
            { skin: 'dot', color: 0xffffff },
            { skin: 'dot', color: 0xff595e },
            { skin: 'dot', color: 0x1982c4 },
            { skin: 'dot', color: 0x8ac926 },
            { skin: 'dot', color: 0xffca3a },
            { skin: 'dot', color: 0x6a4c93 },
            { skin: 'dot', color: 0xff924c },

            // Soccer colors
            { skin: 'soccer', color: 0xffffff },
            { skin: 'soccer', color: 0xff595e },
            { skin: 'soccer', color: 0x1982c4 },
            { skin: 'soccer', color: 0x8ac926 },
            { skin: 'soccer', color: 0xffca3a },

            // Tennis - fixed color
            { skin: 'tennis', color: 0xCCFF00, label: 'Tennis' },

            // Basketball - fixed color
            { skin: 'basketball', color: 0xff8800, label: 'Basketball' },

            // Bowling colors
            { skin: 'bowling', color: 0xE63946 },
            { skin: 'bowling', color: 0x1982c4 },
            { skin: 'bowling', color: 0x000000 },
            { skin: 'bowling', color: 0x8ac926 },
            { skin: 'bowling', color: 0x6a4c93 },

            // Billiard colors
            { skin: 'billiard', color: 0xffffff },
            { skin: 'billiard', color: 0xFFFF00 },
            { skin: 'billiard', color: 0x1982c4 },
            { skin: 'billiard', color: 0xff595e },
            { skin: 'billiard', color: 0x6a4c93 },
            { skin: 'billiard', color: 0xff924c },
            { skin: 'billiard', color: 0x8ac926 },
            { skin: 'billiard', color: 0x000000 },
        ];

        // Create scrollable container
        const scrollContainer = this.add.container(0, 100);
        const ballSize = 70;
        const padding = 20;
        const columns = 7;

        // Create grid of balls
        ballVariations.forEach((variation, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = width / 2 - (columns * (ballSize + padding)) / 2 + col * (ballSize + padding) + ballSize / 2;
            const y = row * (ballSize + padding) + ballSize / 2;

            // Background circle
            const bg = this.add.circle(x, y, ballSize / 2, 0x444444);
            bg.setInteractive({ useHandCursor: true });
            scrollContainer.add(bg);

            // Generate ball texture
            const key = `ball_${variation.skin}_${variation.color.toString(16)}`;
            SkinManager.createBallTexture(this, key, ballSize / 2, variation.color, variation.skin);

            // Ball sprite
            const ball = this.add.image(x, y, key);
            ball.setScale(0.8);
            scrollContainer.add(ball);

            // Selection indicator
            const ballKey = `${variation.skin}_${variation.color}`;
            if (ballKey === currentBallKey) {
                const indicator = this.add.circle(x, y, ballSize / 2 + 5);
                indicator.setStrokeStyle(4, 0xffca3a);
                scrollContainer.add(indicator);
                scrollContainer.bringToTop(bg);
                scrollContainer.bringToTop(ball);
            }

            // Click handler
            bg.on('pointerdown', () => {
                this.registry.set('ballSkin', variation.skin);
                this.registry.set('ballColor', variation.color);
                this.registry.set('selectedBallKey', ballKey);
                this.sound.play('ButtonClick');
                this.scene.restart();
            });
        });

        // Calculate total height for scrolling
        const totalRows = Math.ceil(ballVariations.length / columns);
        const totalHeight = totalRows * (ballSize + padding);

        // Enable camera scrolling if content is tall
        if (totalHeight > height - 200) {
            this.cameras.main.setBounds(0, 0, width, totalHeight + 200);
            this.cameras.main.setScroll(0, 0);

            // Mouse wheel scrolling
            this.input.on('wheel', (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
                const scrollSpeed = 30;
                const newScrollY = this.cameras.main.scrollY + deltaY * scrollSpeed / 100;
                const maxScroll = totalHeight - height + 200;
                this.cameras.main.setScroll(0, Phaser.Math.Clamp(newScrollY, 0, maxScroll));
            });

            // Touch scrolling
            let startY = 0;
            let isDragging = false;

            this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                startY = pointer.y + this.cameras.main.scrollY;
                isDragging = true;
            });

            this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
                if (isDragging) {
                    const newScrollY = startY - pointer.y;
                    const maxScroll = totalHeight - height + 200;
                    this.cameras.main.setScroll(0, Phaser.Math.Clamp(newScrollY, 0, maxScroll));
                }
            });

            this.input.on('pointerup', () => {
                isDragging = false;
            });
        }

        // --- BACK BUTTON ---
        const isMobile = window.matchMedia('(pointer: coarse)').matches;
        const backBtn = this.add.text(40, isMobile ? 120 : 60, "< BACK", {
            fontSize: '20px', fontFamily: '"Press Start 2P"', color: '#ffffff'
        }).setInteractive({ useHandCursor: true });
        backBtn.setScrollFactor(0); // Keep fixed on screen

        backBtn.on('pointerdown', () => {
            this.sound.play('ButtonClick');
            this.scene.stop();
            this.scene.start('Menu');
        });
    }
}
