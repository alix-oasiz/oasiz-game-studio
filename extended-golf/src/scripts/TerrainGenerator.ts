
import {
	b2DefaultBodyDef, b2DefaultShapeDef, b2DefaultChainDef,
	b2CreateBody, b2CreateChain, b2CreatePolygonShape,
	b2BodyType, b2Vec2, b2MakeOffsetBox, b2Rot,
	b2Body_SetGravityScale,
} from 'phaser-box2d';

export interface RockBody {
	bodyId: any;
	visual: Phaser.GameObjects.Container;
}

export interface TerrainInstance {
	points: { x: number, y: number }[];
	graphics: Phaser.GameObjects.Graphics;
	groundBodyId: any;
	holeSensorShapeId: any;
	waterGraphics?: Phaser.GameObjects.Graphics;
	waterTimer?: Phaser.Time.TimerEvent;
	isWaterHazard?: boolean;
	rockBodies?: RockBody[];
}

export default class TerrainGenerator {
	private scene: Phaser.Scene;
	private worldId: any;
	private SCALE: number;
	private currentSeedOffset: number = 0;
	private terrainStyle: number = 0;

	constructor(scene: Phaser.Scene, worldId: any, scale: number = 30) {
		this.scene = scene;
		this.worldId = worldId;
		this.SCALE = scale;
	}

	private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
		return 0.5 * ((2 * p1) + (-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
	}

	private smoothPoints(pts: { x: number, y: number }[], subdivisions: number = 5): { x: number, y: number }[] {
		if (pts.length < 3) return pts;
		const result: { x: number, y: number }[] = [];
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[Math.max(i - 1, 0)];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = pts[Math.min(i + 2, pts.length - 1)];
			for (let s = 0; s < subdivisions; s++) {
				const t = s / subdivisions;
				result.push({
					x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, t),
					y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, t)
				});
			}
		}
		result.push(pts[pts.length - 1]);
		return result;
	}

	private drawSmoothSurface(
		graphics: Phaser.GameObjects.Graphics,
		smoothPts: { x: number, y: number }[],
		offsetY: number = 0
	): void {
		if (smoothPts.length < 2) return;
		for (let i = 0; i < smoothPts.length; i++) {
			graphics.lineTo(smoothPts[i].x, smoothPts[i].y + offsetY);
		}
	}

	public generateTerrain(startY?: number, offsetX: number = 0, difficulty: number = 1, theme: any = null, isPreview: boolean = false, score: number = 0): TerrainInstance {
		const width = this.scene.scale.width;
		const height = this.scene.scale.height;
		const totalPoints = 50;
		const gap = width / totalPoints;
		const points: { x: number, y: number }[] = [];

		if (!theme) {
			theme = {
				sky: 0x81D4FA,
				groundTop: 0x6D4C41,
				groundBottom: 0x4E342E,
				grass: 0x8ac926,
			};
		}

		const holeWidth = 45;
		const holeDepth = 100;

		const spawnX = offsetX + 250;
		const spawnFlatZone = 120;

		const targetBaseHeight = height * 0.65;
		let baseHeight = targetBaseHeight;
		const localSeedOffset = this.currentSeedOffset;

		const isHilly = this.terrainStyle % 2 === 1;
		this.terrainStyle++;

		const amp1 = isHilly ? 110 * difficulty : 90 * difficulty;
		const amp2 = isHilly ? 55 * difficulty : 40 * difficulty;
		const amp3 = isHilly ? 20 * difficulty : 0;
		const freq1 = isHilly ? 0.09 : 0.06;
		const freq2 = isHilly ? 0.24 : 0.18;
		const freq3 = isHilly ? 0.45 : 0;

		if (startY !== undefined) {
			const distToSpawn0 = Math.abs(offsetX - spawnX);
			const spawnFlat0 = Math.min(1, (distToSpawn0 / spawnFlatZone) ** 2);
			const initialWave1 = Math.sin(localSeedOffset * freq1) * amp1 * spawnFlat0;
			const initialWave2 = Math.sin(localSeedOffset * freq2) * amp2 * spawnFlat0;
			const initialWave3 = Math.sin(localSeedOffset * freq3) * amp3 * spawnFlat0;
			baseHeight = startY - (initialWave1 + initialWave2 + initialWave3);
		}

		const startBaseHeight = baseHeight;

		for (let i = 0; i <= totalPoints; i++) {
			const x = offsetX + (i * gap);
			const globalI = localSeedOffset + i;

			const progress = i / totalPoints;
			const currentBaseHeight = startY !== undefined
				? startBaseHeight * (1 - progress) + targetBaseHeight * progress
				: targetBaseHeight;

			const distanceToSpawn = Math.abs(x - spawnX);
			const spawnFlatMultiplier = Math.min(1, (distanceToSpawn / (spawnFlatZone / Math.sqrt(difficulty))) ** 2);

			const wave1 = Math.sin(globalI * freq1) * amp1 * spawnFlatMultiplier;
			const wave2 = Math.sin(globalI * freq2) * amp2 * spawnFlatMultiplier;
			const wave3 = Math.sin(globalI * freq3) * amp3 * spawnFlatMultiplier;

			const endZoneStart = totalPoints - 12;
			let endHillAdjustment = 0;
			let endWaveDampen = 1;
			if (i > endZoneStart) {
				const hillProgress = (i - endZoneStart) / 12;
				endHillAdjustment = -(hillProgress * hillProgress * 200);
				endWaveDampen = 1 - hillProgress * 0.8;
			}

			let y = currentBaseHeight + (wave1 + wave2 + wave3) * endWaveDampen + endHillAdjustment;
			if (i === 0 && startY !== undefined) y = startY;
			points.push({ x, y });
		}

		const searchStart = Math.floor(totalPoints * 0.55);
		const searchEnd = Math.floor(totalPoints * 0.88);
		let bestIdx = searchStart;
		let bestY = -Infinity;
		for (let i = searchStart; i <= searchEnd; i++) {
			if (points[i].y > bestY) {
				bestY = points[i].y;
				bestIdx = i;
			}
		}
		const holeX = points[bestIdx].x;

		this.currentSeedOffset += totalPoints;

		const holeY = points[bestIdx].y;
		const spawnPointIndex = points.findIndex(p => p.x >= spawnX);
		const spawnY = points[spawnPointIndex] ? points[spawnPointIndex].y : height / 2;

		this.scene.data.set('holeX', holeX);
		this.scene.data.set('holeY', holeY);
		this.scene.data.set('holeWidth', holeWidth);
		this.scene.data.set('holeDepth', holeDepth);
		this.scene.data.set('spawnX', spawnX);
		this.scene.data.set('spawnY', spawnY);

		// --- Visuals (unchanged) ---
		const graphics = this.scene.add.graphics();
		graphics.setDepth(5);

		const soilColors: number[] = [];
		const cTop = Phaser.Display.Color.IntegerToColor(theme.groundTop);
		const cBot = Phaser.Display.Color.IntegerToColor(theme.groundBottom);

		for (let k = 0; k < 5; k++) {
			const t = k / 4;
			const r = cTop.red + (cBot.red - cTop.red) * t;
			const g = cTop.green + (cBot.green - cTop.green) * t;
			const b = cTop.blue + (cBot.blue - cTop.blue) * t;
			soilColors.push(Phaser.Display.Color.GetColor(r, g, b));
		}

		const smoothPts = this.smoothPoints(points, 8);

		for (let j = soilColors.length - 1; j >= 0; j--) {
			const offset = (soilColors.length - 1 - j) * 40;
			graphics.fillStyle(soilColors[j], 1);
			graphics.beginPath();
			graphics.moveTo(offsetX - 2, height + 400);
			graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + offset);
			this.drawSmoothSurface(graphics, smoothPts, offset);
			graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + offset);
			graphics.lineTo(offsetX + width + 2, height + 400);
			graphics.closePath();
			graphics.fillPath();
		}

		const grassThickness = 35;
		graphics.fillStyle(theme.grass, 1);
		graphics.beginPath();
		graphics.moveTo(smoothPts[0].x - 2, smoothPts[0].y);
		this.drawSmoothSurface(graphics, smoothPts, 0);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + grassThickness);
		for (let i = smoothPts.length - 1; i >= 0; i--) graphics.lineTo(smoothPts[i].x, smoothPts[i].y + grassThickness);
		graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + grassThickness);
		graphics.closePath();
		graphics.fillPath();

		graphics.fillStyle(0x000000, 1);
		graphics.fillRect(holeX - holeWidth / 2, holeY, holeWidth, holeDepth);
		graphics.fillStyle(0x333333, 1);
		graphics.fillRoundedRect(holeX - holeWidth / 2 - 3, holeY - 1, holeWidth + 6, 4, 2);

		// --- Box2D Physics ---
		let groundBodyId: any = null;
		let holeSensorShapeId: any = null;

		if (!isPreview) {
			const S = this.SCALE;
			const wallThickness = 30;

			const bodyDef = b2DefaultBodyDef();
			bodyDef.type = b2BodyType.b2_staticBody;
			bodyDef.position = new b2Vec2(0, 0);
			groundBodyId = b2CreateBody(this.worldId, bodyDef);

			// Chain shapes for terrain surface (split at hole)
			const holeLeft = holeX - holeWidth / 2;
			const holeRight = holeX + holeWidth / 2;
			const physicsPts = this.smoothPoints(points, 4);
			const leftPts = physicsPts.filter(p => p.x <= holeLeft - 2);
			const rightPts = physicsPts.filter(p => p.x >= holeRight + 2);

			for (const pts of [leftPts, rightPts]) {
				if (pts.length < 2) continue;
				const chainDef = b2DefaultChainDef();
				chainDef.points = pts.map(p => new b2Vec2(p.x / S, p.y / S));
				chainDef.count = pts.length;
				chainDef.isLoop = false;
				chainDef.friction = 0.3;
				chainDef.restitution = 0;
				b2CreateChain(groundBodyId, chainDef);
			}

			// Solid ground fill: thick boxes under terrain surface to prevent tunneling
			// Process each side separately so the hole opening stays clear
			const groundFillDepth = 200;
			for (const segPts of [leftPts, rightPts]) {
				for (let i = 0; i < segPts.length - 1; i++) {
					const p0 = segPts[i];
					const p1 = segPts[i + 1];
					const midX = (p0.x + p1.x) / 2;
					const topY = Math.min(p0.y, p1.y) + 5;
					const halfW = Math.abs(p1.x - p0.x) / 2 / S;
					if (halfW < 0.01) continue;
					const halfH = (groundFillDepth / 2) / S;
					const centerY = (topY + groundFillDepth / 2) / S;
					const fillDef = b2DefaultShapeDef();
					fillDef.friction = 0.3;
					fillDef.restitution = 0;
					b2CreatePolygonShape(groundBodyId, fillDef,
						b2MakeOffsetBox(halfW, halfH, new b2Vec2(midX / S, centerY), 0));
				}
			}

			// Hole walls start below the surface so the mouth is open and the ball rolls in
			const mouthInset = 15;
			const wallHalfW = (wallThickness / 2) / S;
			const wallHeight = holeDepth - mouthInset;
			const wallHalfH = (wallHeight / 2) / S;
			const wallCenterY = (holeY + mouthInset + wallHeight / 2) / S;

			const lwDef = b2DefaultShapeDef();
			lwDef.friction = 0.1;
			lwDef.restitution = 0.1;
			lwDef.userData = { type: 'hole-wall' };
			b2CreatePolygonShape(groundBodyId, lwDef,
				b2MakeOffsetBox(wallHalfW, wallHalfH, new b2Vec2((holeLeft - wallThickness / 2) / S, wallCenterY), 0));

			// Hole right wall
			const rwDef = b2DefaultShapeDef();
			rwDef.friction = 0.1;
			rwDef.restitution = 0.1;
			rwDef.userData = { type: 'hole-wall' };
			b2CreatePolygonShape(groundBodyId, rwDef,
				b2MakeOffsetBox(wallHalfW, wallHalfH, new b2Vec2((holeRight + wallThickness / 2) / S, wallCenterY), 0));

			// Hole bottom
			const btmDef = b2DefaultShapeDef();
			btmDef.friction = 0.1;
			btmDef.restitution = 0.15;
			btmDef.userData = { type: 'hole-bottom' };
			const btmHalfW = ((holeWidth + wallThickness * 2) / 2) / S;
			b2CreatePolygonShape(groundBodyId, btmDef,
				b2MakeOffsetBox(btmHalfW, 20 / S, new b2Vec2(holeX / S, (holeY + holeDepth + 30) / S), 0));

			// Hole sensor (for win detection) - covers full hole depth
			const fullHoleHalfH = (holeDepth / 2) / S;
			const fullHoleCenterY = (holeY + holeDepth / 2) / S;
			const senDef = b2DefaultShapeDef();
			senDef.isSensor = true;
			senDef.enableSensorEvents = true;
			senDef.userData = { type: 'hole-sensor' };
			holeSensorShapeId = b2CreatePolygonShape(groundBodyId, senDef,
				b2MakeOffsetBox((holeWidth / 2) / S, fullHoleHalfH, new b2Vec2(holeX / S, fullHoleCenterY), 0));
		}

		// Place rock obstacles starting at hole 5
		let rockBodies: RockBody[] = [];
		if (!isPreview && groundBodyId && score >= 5) {
			rockBodies = this.placeRocks(points, difficulty, theme, spawnX, holeX, holeWidth);
		}

		return { points, graphics, groundBodyId, holeSensorShapeId, rockBodies };
	}

	private _generateWaterHazard(startY?: number, offsetX: number = 0, _difficulty: number = 1, theme: any = null, isPreview: boolean = false): TerrainInstance {
		const width = this.scene.scale.width;
		const height = this.scene.scale.height;
		const points: { x: number, y: number }[] = [];

		if (!theme) {
			theme = { sky: 0x81D4FA, groundTop: 0x6D4C41, groundBottom: 0x4E342E, grass: 0x8ac926 };
		}

		const holeWidth = 45;
		const holeDepth = 100;

		const platformY = startY !== undefined ? startY : height * 0.6;
		const leftPlatformEnd = offsetX + width * 0.3;
		const rightPlatformStart = offsetX + width * 0.7;
		const waterY = height * 0.85;

		const spawnX = offsetX + 250;
		const holeX = rightPlatformStart + (offsetX + width - rightPlatformStart) * 0.5;

		const totalPoints = 50;
		const gap = width / totalPoints;
		for (let i = 0; i <= totalPoints; i++) {
			const x = offsetX + i * gap;
			let y: number;

			if (x <= leftPlatformEnd - 60) {
				const wave = Math.sin(i * 0.15) * 15;
				y = platformY + wave;
			} else if (x <= leftPlatformEnd + 40) {
				const t = (x - (leftPlatformEnd - 60)) / 100;
				const smooth = t * t * (3 - 2 * t);
				y = platformY + smooth * (waterY - platformY);
			} else if (x >= rightPlatformStart + 60) {
				const wave = Math.sin(i * 0.15) * 15;
				y = platformY + wave;
			} else if (x >= rightPlatformStart - 40) {
				const t = (x - (rightPlatformStart - 40)) / 100;
				const smooth = t * t * (3 - 2 * t);
				y = waterY + smooth * (platformY - waterY);
			} else {
				y = waterY;
			}

			if (i === 0 && startY !== undefined) y = startY;
			points.push({ x, y });
		}

		const holeIdx = points.findIndex(p => p.x >= holeX);
		const holeYPos = holeIdx >= 0 ? points[holeIdx].y : platformY;
		const spawnIdx = points.findIndex(p => p.x >= spawnX);
		const spawnYPos = spawnIdx >= 0 ? points[spawnIdx].y : platformY;

		this.scene.data.set('holeX', holeX);
		this.scene.data.set('holeY', holeYPos);
		this.scene.data.set('holeWidth', holeWidth);
		this.scene.data.set('holeDepth', holeDepth);
		this.scene.data.set('spawnX', spawnX);
		this.scene.data.set('spawnY', spawnYPos);

		const graphics = this.scene.add.graphics();
		graphics.setDepth(5);

		const soilColors: number[] = [];
		const cTop = Phaser.Display.Color.IntegerToColor(theme.groundTop);
		const cBot = Phaser.Display.Color.IntegerToColor(theme.groundBottom);
		for (let k = 0; k < 5; k++) {
			const t = k / 4;
			const r = cTop.red + (cBot.red - cTop.red) * t;
			const g = cTop.green + (cBot.green - cTop.green) * t;
			const b = cTop.blue + (cBot.blue - cTop.blue) * t;
			soilColors.push(Phaser.Display.Color.GetColor(r, g, b));
		}

		const smoothPts = this.smoothPoints(points, 8);

		for (let j = soilColors.length - 1; j >= 0; j--) {
			const offset = (soilColors.length - 1 - j) * 40;
			graphics.fillStyle(soilColors[j], 1);
			graphics.beginPath();
			graphics.moveTo(offsetX - 2, height + 400);
			graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + offset);
			this.drawSmoothSurface(graphics, smoothPts, offset);
			graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + offset);
			graphics.lineTo(offsetX + width + 2, height + 400);
			graphics.closePath();
			graphics.fillPath();
		}

		const grassThickness = 35;
		graphics.fillStyle(theme.grass, 1);
		graphics.beginPath();
		graphics.moveTo(smoothPts[0].x - 2, smoothPts[0].y);
		this.drawSmoothSurface(graphics, smoothPts, 0);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + grassThickness);
		for (let i = smoothPts.length - 1; i >= 0; i--) graphics.lineTo(smoothPts[i].x, smoothPts[i].y + grassThickness);
		graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + grassThickness);
		graphics.closePath();
		graphics.fillPath();

		graphics.fillStyle(0x000000, 1);
		graphics.fillRect(holeX - holeWidth / 2, holeYPos, holeWidth, holeDepth);
		graphics.fillStyle(0x333333, 1);
		graphics.fillRoundedRect(holeX - holeWidth / 2 - 3, holeYPos - 1, holeWidth + 6, 4, 2);

		const waterGfx = this.scene.add.graphics();
		waterGfx.setDepth(4);
		const waterLeft = leftPlatformEnd - 20;
		const waterRight = rightPlatformStart + 20;
		const waterSurfaceY = waterY - 15;

		this.drawWater(waterGfx, waterLeft, waterRight, waterSurfaceY, height, 0);

		let waterPhase = 0;
		const waterTimer = this.scene.time.addEvent({
			delay: 80,
			loop: true,
			callback: () => {
				waterPhase += 0.15;
				this.drawWater(waterGfx, waterLeft, waterRight, waterSurfaceY, height, waterPhase);
			}
		});

		// --- Box2D Physics ---
		let groundBodyId: any = null;
		let holeSensorShapeId: any = null;

		if (!isPreview) {
			const S = this.SCALE;
			const wallThickness = 30;

			const bodyDef = b2DefaultBodyDef();
			bodyDef.type = b2BodyType.b2_staticBody;
			bodyDef.position = new b2Vec2(0, 0);
			groundBodyId = b2CreateBody(this.worldId, bodyDef);

			// Chain shapes for terrain (split at hole and water)
			const holeLeft = holeX - holeWidth / 2;
			const holeRight = holeX + holeWidth / 2;
			const physicsPts = this.smoothPoints(points, 4);

			const leftPts = physicsPts.filter(p => p.x <= holeLeft - 2 && p.x < waterLeft + 30);
			const rightPts = physicsPts.filter(p => p.x >= holeRight + 2 && p.x > waterRight - 30);
			const midLeftPts = physicsPts.filter(p => p.x > waterRight - 30 && p.x <= holeLeft - 2);

			for (const pts of [leftPts, midLeftPts, rightPts]) {
				if (pts.length < 2) continue;
				const chainDef = b2DefaultChainDef();
				chainDef.points = pts.map(p => new b2Vec2(p.x / S, p.y / S));
				chainDef.count = pts.length;
				chainDef.isLoop = false;
				chainDef.friction = 0.3;
				chainDef.restitution = 0;
				b2CreateChain(groundBodyId, chainDef);
			}

			// Solid ground fill: process each segment separately so hole/water gaps stay clear
			const groundFillDepth = 200;
			for (const segPts of [leftPts, midLeftPts, rightPts]) {
				for (let i = 0; i < segPts.length - 1; i++) {
					const p0 = segPts[i];
					const p1 = segPts[i + 1];
					const midX = (p0.x + p1.x) / 2;
					const topY = Math.min(p0.y, p1.y) + 5;
					const halfW = Math.abs(p1.x - p0.x) / 2 / S;
					if (halfW < 0.01) continue;
					const halfH = (groundFillDepth / 2) / S;
					const centerY = (topY + groundFillDepth / 2) / S;
					const fillDef = b2DefaultShapeDef();
					fillDef.friction = 0.3;
					fillDef.restitution = 0;
					b2CreatePolygonShape(groundBodyId, fillDef,
						b2MakeOffsetBox(halfW, halfH, new b2Vec2(midX / S, centerY), 0));
				}
			}

			// Hole walls start below the surface so the mouth is open
			const mouthInset = 15;
			const wallHalfW = (wallThickness / 2) / S;
			const wallHeight = holeDepth - mouthInset;
			const wallHalfH = (wallHeight / 2) / S;
			const wallCenterY = (holeYPos + mouthInset + wallHeight / 2) / S;

			const lwDef = b2DefaultShapeDef();
			lwDef.friction = 0.1;
			lwDef.restitution = 0.1;
			lwDef.userData = { type: 'hole-wall' };
			b2CreatePolygonShape(groundBodyId, lwDef,
				b2MakeOffsetBox(wallHalfW, wallHalfH, new b2Vec2((holeLeft - wallThickness / 2) / S, wallCenterY), 0));

			const rwDef = b2DefaultShapeDef();
			rwDef.friction = 0.1;
			rwDef.restitution = 0.1;
			rwDef.userData = { type: 'hole-wall' };
			b2CreatePolygonShape(groundBodyId, rwDef,
				b2MakeOffsetBox(wallHalfW, wallHalfH, new b2Vec2((holeRight + wallThickness / 2) / S, wallCenterY), 0));

			const btmDef = b2DefaultShapeDef();
			btmDef.friction = 0.1;
			btmDef.restitution = 0.15;
			btmDef.userData = { type: 'hole-bottom' };
			const btmHalfW = ((holeWidth + wallThickness * 2) / 2) / S;
			b2CreatePolygonShape(groundBodyId, btmDef,
				b2MakeOffsetBox(btmHalfW, 20 / S, new b2Vec2(holeX / S, (holeYPos + holeDepth + 30) / S), 0));

			// Hole sensor covers full depth
			const fullHoleHalfH = (holeDepth / 2) / S;
			const fullHoleCenterY = (holeYPos + holeDepth / 2) / S;
			const senDef = b2DefaultShapeDef();
			senDef.isSensor = true;
			senDef.enableSensorEvents = true;
			senDef.userData = { type: 'hole-sensor' };
			holeSensorShapeId = b2CreatePolygonShape(groundBodyId, senDef,
				b2MakeOffsetBox((holeWidth / 2) / S, fullHoleHalfH, new b2Vec2(holeX / S, fullHoleCenterY), 0));

			// Water hazard sensor
			const waterSenDef = b2DefaultShapeDef();
			waterSenDef.isSensor = true;
			waterSenDef.enableSensorEvents = true;
			waterSenDef.userData = { type: 'water-hazard' };
			const waterCenterX = ((waterLeft + waterRight) / 2) / S;
			const waterHalfW = ((waterRight - waterLeft) / 2) / S;
			b2CreatePolygonShape(groundBodyId, waterSenDef,
				b2MakeOffsetBox(waterHalfW, 30 / S, new b2Vec2(waterCenterX, (waterSurfaceY + 20) / S), 0));
		}

		return { points, graphics, groundBodyId, holeSensorShapeId, waterGraphics: waterGfx, waterTimer, isWaterHazard: true };
	}

	private drawWater(gfx: Phaser.GameObjects.Graphics, left: number, right: number, surfaceY: number, bottomY: number, phase: number): void {
		gfx.clear();

		gfx.fillStyle(0x1565C0, 0.7);
		gfx.fillRect(left, surfaceY + 8, right - left, bottomY - surfaceY);

		gfx.fillStyle(0x42A5F5, 0.6);
		gfx.beginPath();
		gfx.moveTo(left, surfaceY + 15);
		for (let x = left; x <= right; x += 4) {
			const wave = Math.sin((x * 0.03) + phase) * 5 + Math.sin((x * 0.06) + phase * 1.3) * 3;
			gfx.lineTo(x, surfaceY + wave);
		}
		gfx.lineTo(right, surfaceY + 15);
		gfx.closePath();
		gfx.fillPath();

		gfx.fillStyle(0x90CAF9, 0.4);
		gfx.beginPath();
		gfx.moveTo(left, surfaceY + 12);
		for (let x = left; x <= right; x += 4) {
			const wave = Math.sin((x * 0.04) + phase * 0.8) * 3 + Math.sin((x * 0.08) + phase * 1.5) * 2;
			gfx.lineTo(x, surfaceY + wave + 3);
		}
		gfx.lineTo(right, surfaceY + 12);
		gfx.closePath();
		gfx.fillPath();
	}

	// Rock type definitions for visual variety
	private static readonly ROCK_TYPES = [
		'boulder',       // Round, smooth large rock
		'standing',      // Tall narrow standing stone
		'flat',          // Wide flat slab
		'jagged',        // Angular sharp-edged rock
		'cluster',       // Group of small pebbles
	] as const;

	// Gray palette for rocks (dark to light)
	private static readonly GRAY_PALETTES = [
		{ dark: 0x4A4A4A, mid: 0x6B6B6B, light: 0x8E8E8E, highlight: 0xB0B0B0 },
		{ dark: 0x3D4548, mid: 0x5C6669, light: 0x7D8A8D, highlight: 0xA3AEB1 },
		{ dark: 0x52504E, mid: 0x74716E, light: 0x949290, highlight: 0xBAB7B4 },
		{ dark: 0x404855, mid: 0x606878, light: 0x808899, highlight: 0xA8ADB8 },
	];

	// Calculate terrain slope angle at a given x position
	private getTerrainSlope(smoothPts: { x: number, y: number }[], atX: number): number {
		let leftPt = smoothPts[0];
		let rightPt = smoothPts[smoothPts.length - 1];
		for (let i = 0; i < smoothPts.length - 1; i++) {
			if (smoothPts[i].x <= atX && smoothPts[i + 1].x >= atX) {
				leftPt = smoothPts[i];
				rightPt = smoothPts[i + 1];
				break;
			}
		}
		return Math.atan2(rightPt.y - leftPt.y, rightPt.x - leftPt.x);
	}

	private placeRocks(
		points: { x: number, y: number }[],
		difficulty: number,
		theme: any,
		spawnX: number,
		holeX: number,
		holeWidth: number
	): RockBody[] {
		const S = this.SCALE;
		const rockCount = Math.floor(Math.random() * Math.min(Math.floor(difficulty * 2), 3)) + 1;
		const safeZoneLeft = spawnX + 150;
		const safeZoneHoleLeft = holeX - holeWidth - 60;
		const safeZoneHoleRight = holeX + holeWidth + 60;

		const smoothPts = this.smoothPoints(points, 8);
		const minX = points[0].x + 50;
		const maxX = points[points.length - 1].x - 50;

		const results: RockBody[] = [];
		const placedXPositions: number[] = [];
		const minRockSpacing = 120;

		for (let r = 0; r < rockCount; r++) {
			let rockX = 0;
			let attempts = 0;
			let valid = false;
			while (!valid && attempts < 30) {
				rockX = Phaser.Math.Between(minX, maxX);
				valid = rockX > safeZoneLeft &&
					(rockX < safeZoneHoleLeft || rockX > safeZoneHoleRight);
				// Ensure no overlap with already-placed rocks
				if (valid) {
					for (const px of placedXPositions) {
						if (Math.abs(rockX - px) < minRockSpacing) {
							valid = false;
							break;
						}
					}
				}
				attempts++;
			}
			if (!valid) continue;
			placedXPositions.push(rockX);

			const closestPt = smoothPts.reduce((best, p) =>
				Math.abs(p.x - rockX) < Math.abs(best.x - rockX) ? p : best
			);
			const groundY = closestPt.y;
			const seed = rockX * 0.37 + r * 7.13;
			const slopeAngle = this.getTerrainSlope(smoothPts, rockX);

			// Pick random rock type and gray palette
			const typeIdx = Math.floor(Math.abs(Math.sin(seed * 3.7)) * TerrainGenerator.ROCK_TYPES.length);
			const rockType = TerrainGenerator.ROCK_TYPES[typeIdx];
			const paletteIdx = Math.floor(Math.abs(Math.cos(seed * 2.3)) * TerrainGenerator.GRAY_PALETTES.length);
			const palette = TerrainGenerator.GRAY_PALETTES[paletteIdx];

			const sizeScale = 1 + (difficulty - 1) * 0.6;
			const dims = this.getRockDimensions(rockType, sizeScale);

			// Create dynamic Box2D body aligned to terrain slope
			// Position center so the collision box bottom sits at ground level
			const bodyDef = b2DefaultBodyDef();
			bodyDef.type = b2BodyType.b2_dynamicBody;
			bodyDef.position = new b2Vec2(rockX / S, (groundY - dims.halfH) / S);
			bodyDef.rotation = new b2Rot(Math.cos(slopeAngle), Math.sin(slopeAngle));
			bodyDef.linearDamping = 4.0;
			bodyDef.angularDamping = 4.0;
			const bodyId = b2CreateBody(this.worldId, bodyDef);

			// Start with no gravity so rocks don't slide before ball is launched
			b2Body_SetGravityScale(bodyId, 0);

			const shapeDef = b2DefaultShapeDef();
			shapeDef.density = 10.0;
			shapeDef.friction = 0.8;
			shapeDef.restitution = rockType === 'jagged' ? 0.25 : 0.3;
			shapeDef.userData = { type: 'rock' };
			b2CreatePolygonShape(bodyId, shapeDef,
				b2MakeOffsetBox(dims.halfW / S, dims.halfH / S, new b2Vec2(0, 0), 0));

			// Build visual as a Container (drawn at origin) so physics can move it
			const outline = this.generateRockOutline(rockType, dims.halfW, dims.halfH, seed);
			const visual = this.createRockContainer(outline, dims.halfW, dims.halfH, seed, palette, theme, rockType);
			visual.x = rockX;
			visual.y = groundY - dims.halfH;
			visual.rotation = slopeAngle;

			results.push({ bodyId, visual });
		}

		return results;
	}

	private getRockDimensions(type: string, sizeScale: number): { halfW: number, halfH: number } {
		switch (type) {
			case 'standing': {
				const w = Phaser.Math.Between(12, 18) * sizeScale;
				return { halfW: Math.floor(w), halfH: Math.floor(w * Phaser.Math.FloatBetween(1.4, 1.9)) };
			}
			case 'flat': {
				const w = Phaser.Math.Between(28, 40) * sizeScale;
				return { halfW: Math.floor(w), halfH: Math.floor(w * Phaser.Math.FloatBetween(0.25, 0.4)) };
			}
			case 'jagged': {
				const w = Phaser.Math.Between(18, 26) * sizeScale;
				return { halfW: Math.floor(w), halfH: Math.floor(w * Phaser.Math.FloatBetween(0.7, 1.0)) };
			}
			case 'cluster': {
				const w = Phaser.Math.Between(22, 32) * sizeScale;
				return { halfW: Math.floor(w), halfH: Math.floor(w * Phaser.Math.FloatBetween(0.4, 0.6)) };
			}
			case 'boulder':
			default: {
				const w = Phaser.Math.Between(20, 28) * sizeScale;
				return { halfW: Math.floor(w), halfH: Math.floor(w * Phaser.Math.FloatBetween(0.6, 0.8)) };
			}
		}
	}

	// Generate outline centered at (0, 0) for use in a Container
	private generateRockOutline(
		type: string,
		halfW: number, halfH: number, seed: number
	): { x: number, y: number }[] {
		const outline: { x: number, y: number }[] = [];

		switch (type) {
			case 'standing': {
				const segs = 12;
				for (let i = 0; i <= segs; i++) {
					const t = i / segs;
					const angle = -Math.PI + t * Math.PI;
					const taperTop = Math.sin(angle) < 0 ? 0.75 : 1.0;
					const wobble = 1 + Math.sin(seed + i * 2.4) * 0.08;
					outline.push({
						x: Math.cos(angle) * halfW * wobble * taperTop,
						y: Math.sin(angle) * halfH * wobble
					});
				}
				break;
			}
			case 'flat': {
				const segs = 16;
				for (let i = 0; i <= segs; i++) {
					const t = i / segs;
					const angle = -Math.PI + t * Math.PI;
					const flatTop = Math.abs(Math.sin(angle)) < 0.4 ? 0.3 : 1.0;
					const wobble = 1 + Math.sin(seed + i * 1.7) * 0.06;
					outline.push({
						x: Math.cos(angle) * halfW * wobble,
						y: Math.sin(angle) * halfH * flatTop * wobble * 0.8
					});
				}
				break;
			}
			case 'jagged': {
				const segs = 10;
				for (let i = 0; i <= segs; i++) {
					const t = i / segs;
					const angle = -Math.PI + t * Math.PI;
					const spiky = 1 + (i % 2 === 0 ? 0.2 : -0.15) * Math.sin(seed + i * 3.3);
					outline.push({
						x: Math.cos(angle) * halfW * spiky,
						y: Math.sin(angle) * halfH * spiky
					});
				}
				break;
			}
			case 'cluster': {
				// Cluster: wider, blobby shape
				const segs = 14;
				for (let i = 0; i <= segs; i++) {
					const t = i / segs;
					const angle = -Math.PI + t * Math.PI;
					const blob = 1 + Math.sin(seed + i * 2.8) * 0.15 + Math.cos(seed + i * 4.1) * 0.1;
					outline.push({
						x: Math.cos(angle) * halfW * blob,
						y: Math.sin(angle) * halfH * blob
					});
				}
				break;
			}
			case 'boulder':
			default: {
				const segs = 14;
				for (let i = 0; i <= segs; i++) {
					const t = i / segs;
					const angle = -Math.PI + t * Math.PI;
					const wobble = 1 + Math.sin(seed + i * 1.9) * 0.1 + Math.cos(seed + i * 3.1) * 0.06;
					outline.push({
						x: Math.cos(angle) * halfW * wobble,
						y: Math.sin(angle) * halfH * wobble
					});
				}
				break;
			}
		}

		// Close bottom flat — match collision box bottom at +halfH
		outline.push({ x: halfW * 0.9, y: halfH });
		outline.unshift({ x: -halfW * 0.9, y: halfH });
		return outline;
	}

	// Create a Phaser Container with all rock visual layers drawn at origin
	private createRockContainer(
		outline: { x: number, y: number }[],
		halfW: number, halfH: number,
		seed: number,
		palette: { dark: number, mid: number, light: number, highlight: number },
		theme: any,
		rockType: string
	): Phaser.GameObjects.Container {
		const gfx = this.scene.add.graphics();

		// Shadow
		gfx.fillStyle(0x000000, 0.16);
		gfx.beginPath();
		for (let i = 0; i < outline.length; i++) {
			if (i === 0) gfx.moveTo(outline[i].x + 3, outline[i].y + 4);
			else gfx.lineTo(outline[i].x + 3, outline[i].y + 4);
		}
		gfx.closePath();
		gfx.fillPath();

		// Main body
		gfx.fillStyle(palette.mid, 1);
		gfx.beginPath();
		for (let i = 0; i < outline.length; i++) {
			if (i === 0) gfx.moveTo(outline[i].x, outline[i].y);
			else gfx.lineTo(outline[i].x, outline[i].y);
		}
		gfx.closePath();
		gfx.fillPath();

		// Dark shading on bottom-right
		gfx.fillStyle(palette.dark, 0.55);
		gfx.beginPath();
		const darkPts = outline.filter(p => p.x > -halfW * 0.1 && p.y > -halfH * 0.1);
		if (darkPts.length >= 3) {
			gfx.moveTo(darkPts[0].x, darkPts[0].y);
			for (let i = 1; i < darkPts.length; i++) gfx.lineTo(darkPts[i].x, darkPts[i].y);
			gfx.lineTo(halfW * 0.5, halfH);
			gfx.closePath();
			gfx.fillPath();
		}

		// Light face on upper-left
		gfx.fillStyle(palette.light, 0.6);
		gfx.beginPath();
		const lightPts = outline.filter(p => p.y < -halfH * 0.1 && p.x <= halfW * 0.1);
		if (lightPts.length >= 3) {
			gfx.moveTo(lightPts[0].x + 2, lightPts[0].y + 2);
			for (let i = 1; i < lightPts.length; i++) gfx.lineTo(lightPts[i].x + 2, lightPts[i].y + 2);
			gfx.lineTo(-halfW * 0.15, 0);
			gfx.closePath();
			gfx.fillPath();
		}

		// Cracks
		const crackCount = rockType === 'jagged' ? 4 : rockType === 'flat' ? 1 : 2 + Math.floor(Math.sin(seed * 2.1) + 1);
		gfx.lineStyle(1, 0x000000, 0.12);
		for (let c = 0; c < crackCount; c++) {
			const startT = 0.15 + (c / crackCount) * 0.65;
			const idx = Math.floor(startT * outline.length);
			if (idx >= outline.length) continue;
			const sp = outline[idx];
			const endX = sp.x + Math.sin(seed + c * 4.2) * halfW * 0.4;
			const endY = sp.y + halfH * (0.2 + Math.cos(seed + c * 3.7) * 0.12);
			const midX = (sp.x + endX) / 2 + Math.cos(seed + c) * 3;
			const midY = (sp.y + endY) / 2 + Math.sin(seed + c) * 2;
			gfx.beginPath();
			gfx.moveTo(sp.x, sp.y);
			gfx.lineTo(midX, midY);
			gfx.lineTo(endX, Math.min(endY, halfH));
			gfx.strokePath();
		}

		// Highlight rim
		gfx.lineStyle(1.5, palette.highlight, 0.3);
		gfx.beginPath();
		const topPts = outline.filter(p => p.y < -halfH * 0.3);
		if (topPts.length >= 2) {
			gfx.moveTo(topPts[0].x, topPts[0].y);
			for (let i = 1; i < topPts.length; i++) gfx.lineTo(topPts[i].x, topPts[i].y);
			gfx.strokePath();
		}

		// Specular dot
		gfx.fillStyle(0xffffff, 0.2);
		gfx.fillCircle(-halfW * 0.25, -halfH * 0.5, Math.max(2, halfW * 0.1));

		// Moss accent (skip jagged)
		if (rockType !== 'jagged') {
			gfx.fillStyle(theme.grass, 0.35);
			const mossPts = outline.filter(p => p.y < -halfH * 0.4);
			if (mossPts.length >= 2) {
				gfx.beginPath();
				gfx.moveTo(mossPts[0].x, mossPts[0].y + 3);
				for (let i = 0; i < mossPts.length; i++) {
					gfx.lineTo(mossPts[i].x, mossPts[i].y + 1 + Math.sin(seed + i * 1.4) * 2);
				}
				gfx.lineTo(mossPts[mossPts.length - 1].x, mossPts[mossPts.length - 1].y + 4);
				gfx.lineTo(mossPts[0].x, mossPts[0].y + 4);
				gfx.closePath();
				gfx.fillPath();
			}
		}

		const container = this.scene.add.container(0, 0, [gfx]);
		container.setDepth(7);
		return container;
	}

	public redraw(instance: TerrainInstance, theme: any) {
		if (!instance || !instance.graphics) return;

		const height = this.scene.scale.height;
		const points = instance.points;
		const graphics = instance.graphics;

		graphics.clear();
		graphics.setDepth(5);

		const smoothPts = this.smoothPoints(points, 8);

		const soilColors: number[] = [];
		const cTop = Phaser.Display.Color.IntegerToColor(theme.groundTop);
		const cBot = Phaser.Display.Color.IntegerToColor(theme.groundBottom);

		for (let k = 0; k < 5; k++) {
			const t = k / 4;
			const r = cTop.red + (cBot.red - cTop.red) * t;
			const g = cTop.green + (cBot.green - cTop.green) * t;
			const b = cTop.blue + (cBot.blue - cTop.blue) * t;
			soilColors.push(Phaser.Display.Color.GetColor(r, g, b));
		}

		for (let j = soilColors.length - 1; j >= 0; j--) {
			const offset = (soilColors.length - 1 - j) * 40;
			graphics.fillStyle(soilColors[j], 1);
			graphics.beginPath();
			graphics.moveTo(smoothPts[0].x - 2, height + 400);
			graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + offset);
			this.drawSmoothSurface(graphics, smoothPts, offset);
			graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + offset);
			graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, height + 400);
			graphics.closePath();
			graphics.fillPath();
		}

		const grassThickness = 35;
		graphics.fillStyle(theme.grass, 1);
		graphics.beginPath();
		graphics.moveTo(smoothPts[0].x - 2, smoothPts[0].y);
		this.drawSmoothSurface(graphics, smoothPts, 0);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y);
		graphics.lineTo(smoothPts[smoothPts.length - 1].x + 2, smoothPts[smoothPts.length - 1].y + grassThickness);
		for (let i = smoothPts.length - 1; i >= 0; i--) graphics.lineTo(smoothPts[i].x, smoothPts[i].y + grassThickness);
		graphics.lineTo(smoothPts[0].x - 2, smoothPts[0].y + grassThickness);
		graphics.closePath();
		graphics.fillPath();

		const holeX = this.scene.data.get('holeX');
		const holeY = this.scene.data.get('holeY');
		const holeWidth = this.scene.data.get('holeWidth');
		const holeDepth = this.scene.data.get('holeDepth');

		if (holeX !== undefined) {
			graphics.fillStyle(0x000000, 1);
			graphics.fillRect(holeX - holeWidth / 2, holeY, holeWidth, holeDepth);
			graphics.fillStyle(0x333333, 1);
			graphics.fillRoundedRect(holeX - holeWidth / 2 - 3, holeY - 1, holeWidth + 6, 4, 2);
		}
	}
}
