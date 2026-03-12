
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { hideHtmlText, showHtmlText } from "../ui/htmlText";
/* END-USER-IMPORTS */

export default class Preload extends Phaser.Scene {

	constructor() {
		super("Preload");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {
		const w = this.scale.width;
		const h = this.scale.height;
		const accentColor = Phaser.Display.Color.HexStringToColor("#B3131B").color;

		const bg = this.add.image(w * 0.5, h * 0.5, "table_bg");
		bg.setDisplaySize(w, h);

		this.add.rectangle(0, 0, w, h, 0x03110b, 0.56).setOrigin(0, 0);

		const panelY = h * 0.54;
		this.loadingPanelY = panelY;
		this.updateLoadingHtml(0);

		const dots = [w * 0.5 - 24, w * 0.5, w * 0.5 + 24].map((x) => {
			return this.add.circle(x, panelY + 78, 5, accentColor, 0.35);
		});

		dots.forEach((dot, index) => {
			this.tweens.add({
				targets: dot,
				alpha: 1,
				scale: 1.3,
				duration: 520,
				yoyo: true,
				repeat: -1,
				ease: "Sine.inOut",
				delay: index * 140
			});
		});
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			hideHtmlText("loading-status");
			hideHtmlText("loading-percent");
		});

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	private loadingPanelY = 0;

	private updateLoadingHtml(progressPercent: number): void {
		const w = this.scale.width;
		const panelY = this.loadingPanelY || this.scale.height * 0.54;
		showHtmlText("loading-status", {
			text: "Shuffling the deck",
			x: w * 0.5,
			y: panelY - 18,
			fontSize: 19,
			letterSpacing: 0.4,
			maxWidth: Math.max(240, w - 80),
			multicolor: false,
			strokeWidth: 2
		});
		showHtmlText("loading-percent", {
			text: `${progressPercent}%`,
			x: w * 0.5,
			y: panelY + 26,
			fontSize: 34,
			letterSpacing: 0.6,
			multicolor: false,
			strokeWidth: 3
		});
	}

	private preloadCardAssets() {
		// Use Vite's native bundler glob import to process all cards.
		// This forces Vite to include them in the bundle mapping with their hashed URLs.
		// The Oasiz CDN uploader reliably picks these up and rewrites them into CDN paths.
		const cardImages = import.meta.glob('/public/assets-mobile-70x100/cards/*.png', { eager: true, query: '?url', import: 'default' });

		for (const path in cardImages) {
			const url = cardImages[path] as string;
			// path looks like: "/public/assets-mobile-70x100/cards/Clover_10.png"
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
		const bgUrl = new URL('../../public/assets-mobile-70x100/bg/table-bg.png', import.meta.url).href;
		this.load.image("table_bg", bgUrl);

		const shuffleUrl = new URL('../../assets/audio/shuffle.mp3', import.meta.url).href;
		this.load.audio("shuffle_draw", shuffleUrl);
		const cardPickUrl = new URL('../../assets/audio/card-pick.mp3', import.meta.url).href;
		this.load.audio("card_pick", cardPickUrl);
		const cardDropUrl = new URL('../../assets/audio/card-drop.mp3', import.meta.url).href;
		this.load.audio("card_drop", cardDropUrl);
		const foundationSuccessUrl = new URL('../../assets/audio/foundation-success.mp3', import.meta.url).href;
		this.load.audio("foundation_success", foundationSuccessUrl);
		const uiButtonUrl = new URL('../../assets/audio/ui-button.mp3', import.meta.url).href;
		this.load.audio("ui_button", uiButtonUrl);
		const scoreCountTickUrl = new URL('../../assets/audio/score-count-tick.mp3', import.meta.url).href;
		this.load.audio("score_count_tick", scoreCountTickUrl);
		const victoryFinalUrl = new URL('../../assets/audio/victory-final.mp3', import.meta.url).href;
		this.load.audio("victory_final", victoryFinalUrl);
		const bgTrack1Url = new URL('../../assets/audio/bg-track-1.mp3', import.meta.url).href;
		this.load.audio("bg_track_1", bgTrack1Url);
		const bgTrack2Url = new URL('../../assets/audio/bg-track-2.mp3', import.meta.url).href;
		this.load.audio("bg_track_2", bgTrack2Url);

		// Load all backgrounds from the Background directory
		const backgroundImages = import.meta.glob('/public/assets-mobile-70x100/Background/*.png', { eager: true, query: '?url', import: 'default' });
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

		this.load.on("progress", (value: number) => {
			this.updateLoadingHtml(Math.round(value * 100));
		});
	}

	create() {
		hideHtmlText("loading-status");
		hideHtmlText("loading-percent");

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
