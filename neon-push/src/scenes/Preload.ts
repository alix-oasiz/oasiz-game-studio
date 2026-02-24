// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

export default class Preload extends Phaser.Scene {

	constructor() {
		super("Preload");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	/* START-USER-CODE */

	preload() {
		this.load.audio("bgMusic", "assets/Audio/bgMusic.mp3");
		this.load.audio("chargedbuff", "assets/Audio/chargedBuff.wav");
		this.load.audio("chargedjump", "assets/Audio/chargedJump.wav");
		this.load.audio("jump", "assets/Audio/jump.wav");
		this.load.audio("dead", "assets/Audio/dead.wav");
	}

	create() {
		this.scene.start("Level");
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
