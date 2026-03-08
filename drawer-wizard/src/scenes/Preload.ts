export default class Preload extends Phaser.Scene {

	constructor() {
		super("Preload");
	}

	preload() {
		const W = this.scale.width;
		const H = this.scale.height;
		const cx = W / 2;
		const cy = H / 2;

		// ── Background ──────────────────────────────────────────────────────────
		this.cameras.main.setBackgroundColor('#000000');

		// ── Decorative corner marks ──────────────────────────────────────────────
		const corners = this.add.graphics();
		corners.lineStyle(2, 0xffffff, 0.35);
		const arm = 22;
		const margin = 28;
		[
			[margin, margin, 1, 1],
			[W - margin, margin, -1, 1],
			[margin, H - margin, 1, -1],
			[W - margin, H - margin, -1, -1],
		].forEach(([x, y, sx, sy]) => {
			corners.beginPath();
			corners.moveTo(x, y + sy * arm); corners.lineTo(x, y); corners.lineTo(x + sx * arm, y);
			corners.strokePath();
		});

		// ── Rune sigil (animated) ─────────────────────────────────────────────
		const sigilG = this.add.graphics();
		const sigilY = cy - H * 0.12;
		const sigilR = Math.min(W, H) * 0.13;

		const drawSigil = (alpha: number) => {
			sigilG.clear();
			sigilG.lineStyle(1.5, 0xffffff, alpha * 0.55);
			// Outer circle
			sigilG.strokeCircle(cx, sigilY, sigilR);
			// Inner circle
			sigilG.strokeCircle(cx, sigilY, sigilR * 0.55);
			// 6-pointed star lines
			sigilG.lineStyle(1.2, 0xffffff, alpha * 0.4);
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
				const a2 = ((i + 3) / 6) * Math.PI * 2 - Math.PI / 2;
				sigilG.beginPath();
				sigilG.moveTo(cx + Math.cos(a) * sigilR, sigilY + Math.sin(a) * sigilR);
				sigilG.lineTo(cx + Math.cos(a2) * sigilR, sigilY + Math.sin(a2) * sigilR);
				sigilG.strokePath();
			}
			// Tick marks on outer ring
			sigilG.lineStyle(1.5, 0xffffff, alpha * 0.6);
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2;
				const inner = i % 3 === 0 ? sigilR * 0.85 : sigilR * 0.92;
				sigilG.beginPath();
				sigilG.moveTo(cx + Math.cos(a) * inner, sigilY + Math.sin(a) * inner);
				sigilG.lineTo(cx + Math.cos(a) * sigilR, sigilY + Math.sin(a) * sigilR);
				sigilG.strokePath();
			}
		};
		drawSigil(1);

		// Slow rotation by updating angle each frame
		let angle = 0;
		this.events.on('preupdate', () => {
			angle += 0.004;
			sigilG.clear();
			sigilG.lineStyle(1.5, 0xffffff, 0.55);
			sigilG.strokeCircle(cx, sigilY, sigilR);
			sigilG.strokeCircle(cx, sigilY, sigilR * 0.55);
			sigilG.lineStyle(1.2, 0xffffff, 0.4);
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 + angle;
				const a2 = ((i + 3) / 6) * Math.PI * 2 + angle;
				sigilG.beginPath();
				sigilG.moveTo(cx + Math.cos(a) * sigilR, sigilY + Math.sin(a) * sigilR);
				sigilG.lineTo(cx + Math.cos(a2) * sigilR, sigilY + Math.sin(a2) * sigilR);
				sigilG.strokePath();
			}
			sigilG.lineStyle(1.5, 0xffffff, 0.6);
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2 - angle * 0.5;
				const inner = i % 3 === 0 ? sigilR * 0.85 : sigilR * 0.92;
				sigilG.beginPath();
				sigilG.moveTo(cx + Math.cos(a) * inner, sigilY + Math.sin(a) * inner);
				sigilG.lineTo(cx + Math.cos(a) * sigilR, sigilY + Math.sin(a) * sigilR);
				sigilG.strokePath();
			}
		});

		// ── Title ─────────────────────────────────────────────────────────────
		const titleSize = Math.max(22, Math.min(48, Math.floor(W * 0.07)));
		this.add.text(cx, cy + H * 0.06, 'RUNE BREAK', {
			fontFamily: "'Georgia', 'Times New Roman', serif",
			fontSize: `${titleSize}px`,
			color: '#ffffff',
			fontStyle: 'bold',
			letterSpacing: 4,
			stroke: '#000000',
			strokeThickness: 4,
		} as any).setOrigin(0.5, 0.5);

		// ── Loading label ────────────────────────────────────────────────────
		this.add.text(cx, cy + H * 0.14, 'CHANNELING POWER...', {
			fontFamily: "'Georgia', 'Times New Roman', serif",
			fontSize: `${Math.max(10, Math.floor(W * 0.028))}px`,
			color: '#ffffff',
			fontStyle: 'italic',
			letterSpacing: 3,
			alpha: 0.55,
		} as any).setOrigin(0.5, 0.5);

		// ── Progress bar ──────────────────────────────────────────────────────
		const barW = Math.min(W * 0.68, 340);
		const barH = 6;
		const barX = cx - barW / 2;
		const barY = cy + H * 0.19;

		// Background track
		const barBg = this.add.graphics();
		barBg.fillStyle(0xffffff, 0.12);
		barBg.fillRect(barX, barY, barW, barH);
		// Border
		barBg.lineStyle(1, 0xffffff, 0.35);
		barBg.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
		// Corner caps
		barBg.lineStyle(2, 0xffffff, 0.5);
		const capLen = 8;
		[[barX - 4, barY - 3], [barX + barW + 4, barY - 3]].forEach(([px, py], i) => {
			const dir = i === 0 ? 1 : -1;
			barBg.beginPath();
			barBg.moveTo(px + dir * capLen, py); barBg.lineTo(px, py); barBg.lineTo(px, py + barH + 6);
			barBg.moveTo(px, py + barH + 6); barBg.lineTo(px + dir * capLen, py + barH + 6);
			barBg.strokePath();
		});

		// Fill bar — driven by load progress
		const barFill = this.add.graphics();
		let fillProgress = 0;

		const redrawFill = (p: number) => {
			barFill.clear();
			if (p <= 0) return;
			const fw = barW * p;
			barFill.fillStyle(0xffffff, 0.9);
			barFill.fillRect(barX, barY, fw, barH);
			// Shimmer highlight strip
			barFill.fillStyle(0xffffff, 0.4);
			barFill.fillRect(barX, barY, fw, 2);
		};

		this.load.pack("asset-pack", "assets/asset-pack.json");

		this.load.on("progress", (value: number) => {
			fillProgress = value;
			redrawFill(fillProgress);
		});

		this.load.on("complete", () => {
			redrawFill(1);
		});
	}

	create() {
		if (process.env.NODE_ENV === "development") {
			const start = new URLSearchParams(location.search).get("start");
			if (start) {
				console.log(`[Preload] Development: jump to ${start}`);
				this.scene.start(start);
				return;
			}
		}

		// Wait for Cinzel Decorative before rendering the MainMenu title
		const goToMenu = () => this.scene.start("MainMenu");
		Promise.all([
			document.fonts.load('400 1em "Cinzel Decorative"'),
			document.fonts.load('700 1em "Cinzel Decorative"'),
		]).then(goToMenu).catch(goToMenu);
	}
}
