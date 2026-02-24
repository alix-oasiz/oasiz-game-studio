
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

export default class MainMenu extends Phaser.Scene {

    constructor() {
        super("MainMenu");

        /* START-USER-CTR-CODE */
        // Write your code here.
        /* END-USER-CTR-CODE */
    }

    editorCreate(): void {
        this.events.emit("scene-awake");
    }

    /* START-USER-CODE */

    private bgBlocks!: Phaser.GameObjects.Group;

    create() {

        this.editorCreate();

        // Background Color (Dark Grey/Black to match game vibe)
        this.cameras.main.setBackgroundColor('#242424');

        // 1. Background Floating Blocks
        this.bgBlocks = this.add.group();
        this.createFloatingBlocks();

        // 2. Title "BLOCK BUSTER"
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Shadow Text for 3D Pixel Effect (Extrusion)
        const titleShadow = this.add.text(centerX + 6, centerY - 144, "BLOCK\nBUSTER", {
            fontFamily: '"Press Start 2P"',
            fontSize: '60px',
            color: '#000000',
            align: 'center'
        });
        titleShadow.setOrigin(0.5);
        titleShadow.setAlpha(1); // Solid shadow for pixel art look

        // Main Text
        const title = this.add.text(centerX, centerY - 150, "BLOCK\nBUSTER", {
            fontFamily: '"Press Start 2P"',
            fontSize: '60px',
            color: '#ffffff',
            align: 'center'
        });
        title.setOrigin(0.5);

        // Add a simple bobbing animation to the title (and shadow)
        this.tweens.add({
            targets: [title, titleShadow],
            y: (target: any) => target.y - 10,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 3. Play Button
        const btnCoords = { x: centerX, y: centerY + 100 };

        const playBtnContainer = this.add.container(btnCoords.x, btnCoords.y);

        // Create White Button
        const btnWidth = 200;
        const btnHeight = 80;
        const btnColor = 0xffffff; // White
        const btnDarkColor = 0xcccccc; // Shadow grey

        // 3D Shadow/Side
        const btnSide = this.add.rectangle(0, 10, btnWidth, btnHeight, btnDarkColor);
        btnSide.setStrokeStyle(4, 0x000000);

        // Top Face
        const btnTop = this.add.rectangle(0, 0, btnWidth, btnHeight, btnColor);
        btnTop.setStrokeStyle(4, 0x000000);

        // Text
        const btnText = this.add.text(0, 0, "PLAY", {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '40px',
            color: '#000000', // Black Text
            stroke: '#000000',
            strokeThickness: 0,
            fontStyle: 'bold'
        });
        btnText.setOrigin(0.5);

        playBtnContainer.add([btnSide, btnTop, btnText]);
        playBtnContainer.setSize(btnWidth, btnHeight);

        // Interactive
        btnTop.setInteractive({ useHandCursor: true });

        btnTop.on('pointerover', () => {
            btnTop.setFillStyle(0xe0e0e0); // Slightly dark white
            this.tweens.add({
                targets: playBtnContainer,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: 100
            });
        });

        btnTop.on('pointerout', () => {
            btnTop.setFillStyle(btnColor);
            this.tweens.add({
                targets: playBtnContainer,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });
        });

        btnTop.on('pointerdown', () => {
            this.tweens.add({
                targets: playBtnContainer,
                y: btnCoords.y + 10,
                duration: 50,
                yoyo: true,
                onComplete: () => {
                    this.startGame();
                }
            });
            this.sound.play('blockPop');
        });




        // Audio Handling
        const music = this.sound.get('bgMusic');
        if (!music) {
            this.sound.play('bgMusic', { loop: true, volume: 0.5 });
        } else if (!music.isPlaying) {
            music.play({ loop: true, volume: 0.5 });
        }

    }

    createFloatingBlocks() {
        // Spawn some random blocks in the background that fall down or float up
        for (let i = 0; i < 20; i++) {
            this.spawnBackgroundBlock(true);
        }

        // Continually spawn new ones
        this.time.addEvent({
            delay: 500,
            callback: () => this.spawnBackgroundBlock(false),
            loop: true
        });
    }

    spawnBackgroundBlock(randomY: boolean) {
        const x = Phaser.Math.Between(0, this.scale.width);
        const y = randomY ? Phaser.Math.Between(0, this.scale.height) : this.scale.height + 50;
        const size = Phaser.Math.Between(30, 80);
        const color = Phaser.Utils.Array.GetRandom([0xffffff, 0xff0000, 0x4444ff]);
        const darkColor = Phaser.Display.Color.ValueToColor(color).darken(30).color;

        const container = this.add.container(x, y);

        // Shape mimic the game blocks
        const side = this.add.rectangle(size / 10, size / 10, size, size, darkColor);
        side.setStrokeStyle(2, 0x000000);

        const top = this.add.rectangle(0, 0, size, size, color);
        top.setStrokeStyle(2, 0x000000);

        container.add([side, top]);

        // Random Rotation
        container.rotation = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const rotSpeed = Phaser.Math.FloatBetween(-0.02, 0.02);

        // Movement Speed (Float Upwards)
        const speed = Phaser.Math.Between(20, 100);

        this.bgBlocks.add(container);

        container.setData('speed', speed);
        container.setData('rotSpeed', rotSpeed);
        container.setAlpha(0.6); // Slightly transparent background
        container.setScale(0.8);
    }

    update(_time: number, delta: number) {
        this.bgBlocks.getChildren().forEach((child: any) => {
            const block = child as Phaser.GameObjects.Container;
            const speed = block.getData('speed');
            const rotSpeed = block.getData('rotSpeed');

            block.y -= speed * (delta / 1000); // Move Up
            block.rotation += rotSpeed;

            // Reset if goes off top
            if (block.y < -100) {
                block.destroy();
            }
        });
    }

    startGame(isTestMode: boolean = false) {
        // Transition
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start("Scene", { isTestMode });
        });
    }

    /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
