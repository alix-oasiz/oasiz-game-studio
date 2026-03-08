
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

	editorCreate(): void {

		// guapen
		const guapen = this.add.image(505.0120544433594, 360, "guapen");
		guapen.scaleX = 0.32715486817515643;
		guapen.scaleY = 0.32715486817515643;

		// progressBar
		const progressBar = this.add.rectangle(553.0120849609375, 361, 256, 20);
		progressBar.setOrigin(0, 0);
		progressBar.isFilled = true;
		progressBar.fillColor = 14737632;

		// progressBarBg
		const progressBarBg = this.add.rectangle(553.0120849609375, 361, 256, 20);
		progressBarBg.setOrigin(0, 0);
		progressBarBg.fillColor = 14737632;
		progressBarBg.isStroked = true;

		// loadingText
		const loadingText = this.add.text(552.0120849609375, 329, "", {});
		loadingText.text = "Loading...";
		loadingText.setStyle({ "color": "#e0e0e0", "fontFamily": "arial", "fontSize": "20px" });

		this.progressBar = progressBar;

		this.events.emit("scene-awake");
	}

	private progressBar!: Phaser.GameObjects.Rectangle;

	/* START-USER-CODE */

	private preloadCardAssets() {
		// Use Vite's native bundler glob import to process all cards.
		// This forces Vite to include them in the bundle mapping with their hashed URLs.
		// The Oasiz CDN uploader reliably picks these up and rewrites them into CDN paths.
		const cardImages = import.meta.glob('/public/assets/cards/*.png', { eager: true, query: '?url', import: 'default' });

		for (const path in cardImages) {
			const url = cardImages[path] as string;
			// path looks like: "/public/assets/cards/Clover_10.png"
			const filename = path.split('/').pop(); // "Clover_10.png"
			if (filename) {
				const parts = filename.replace('.png', '').split('_');
				if (filename.startsWith('Back_')) {
					// Preload backs correctly
					if (filename === 'Back_01.png') {
						this.load.image("card_back", url);
					}
				} else if (parts.length === 2) {
					const suit = parts[0].toLowerCase();
					const rank = parts[1];
					this.load.image(`card_${suit}_${rank}`, url);
				}
			}
		}

		// Process background in the same way with new URL 
		const bgUrl = new URL('../../public/assets/bg/table-bg.png', import.meta.url).href;
		this.load.image("table_bg", bgUrl);

		const shuffleUrl = new URL('../../public/assets/audio/shuffle.mp3', import.meta.url).href;
		this.load.audio("shuffle_draw", shuffleUrl);
		const cardPickUrl = new URL('../../public/assets/audio/card-pick.mp3', import.meta.url).href;
		this.load.audio("card_pick", cardPickUrl);
		const cardDropUrl = new URL('../../public/assets/audio/card-drop.mp3', import.meta.url).href;
		this.load.audio("card_drop", cardDropUrl);
		const foundationSuccessUrl = new URL('../../public/assets/audio/foundation-success.mp3', import.meta.url).href;
		this.load.audio("foundation_success", foundationSuccessUrl);
		const uiButtonUrl = new URL('../../public/assets/audio/ui-button.mp3', import.meta.url).href;
		this.load.audio("ui_button", uiButtonUrl);
		const bgTrack1Url = new URL('../../public/assets/audio/bg-track-1.mp3', import.meta.url).href;
		this.load.audio("bg_track_1", bgTrack1Url);
		const bgTrack2Url = new URL('../../public/assets/audio/bg-track-2.mp3', import.meta.url).href;
		this.load.audio("bg_track_2", bgTrack2Url);

		// Load all backgrounds from the Background directory
		const backgroundImages = import.meta.glob('/public/assets/Background/*.png', { eager: true, query: '?url', import: 'default' });
		for (const path in backgroundImages) {
			const url = backgroundImages[path] as string;
			const filename = path.split('/').pop();
			if (filename) {
				const key = filename.replace('.png', '').toLowerCase();
				this.load.image(key, url);
			}
		}
	}

	preload() {

		this.editorCreate();

		this.load.pack("asset-pack", "assets/asset-pack.json");
		this.preloadCardAssets();

		const width = this.progressBar.width;

		this.load.on("progress", (value: number) => {

			this.progressBar.width = width * value;
		});
	}

	create() {

		if (process.env.NODE_ENV === "development") {

			const start = new URLSearchParams(location.search).get("start");

			if (start) {

				console.log(`Development: jump to ${start}`);
				this.scene.start(start);

				return;
			}
		}

		this.scene.start("MainMenu");
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
