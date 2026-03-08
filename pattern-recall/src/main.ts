import Phaser from "phaser";

declare global {
  interface Window {
    platform: { musicEnabled: boolean; fxEnabled: boolean; hapticsEnabled: boolean };
    startGame: () => void;
    restartGame: () => void;
    pauseGame: () => void;
    resumeGame: () => void;
    toggleMusic: (enabled: boolean) => void;
    showGameOver: (score: number, round: number) => void;
    showMainMenu: () => void;
    submitScore: (score: number) => void;
    triggerHaptic: (type: string) => void;
  }
}

const TILE_COLORS: { base: number; lit: number; name: string }[] = [
  { base: 0x1a3a5c, lit: 0x00f0ff, name: "cyan" },
  { base: 0x3a1a5c, lit: 0x7b2fff, name: "purple" },
  { base: 0x5c1a3a, lit: 0xff2d95, name: "pink" },
  { base: 0x1a5c3a, lit: 0x00ff88, name: "green" },
  { base: 0x5c4a1a, lit: 0xffaa00, name: "orange" },
  { base: 0x1a4a5c, lit: 0x00aaff, name: "blue" },
  { base: 0x5c1a1a, lit: 0xff4444, name: "red" },
  { base: 0x4a5c1a, lit: 0xccff00, name: "lime" },
  { base: 0x5c2a1a, lit: 0xff6b35, name: "amber" },
];

const GRID_SIZE = 3;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const SEQUENCE_DISPLAY_MS = 500;
const SEQUENCE_GAP_MS = 200;
const FLASH_DURATION_MS = 350;
const ROUND_BANNER_MS = 1200;
const SPEED_DECREASE_PER_ROUND = 15;
const MIN_DISPLAY_MS = 180;

interface TileData {
  row: number;
  col: number;
  colorIndex: number;
  graphics: Phaser.GameObjects.Graphics;
  glowGraphics: Phaser.GameObjects.Graphics;
  container: Phaser.GameObjects.Container;
  hitArea: Phaser.GameObjects.Rectangle;
}

type GamePhase = "IDLE" | "SHOWING" | "INPUT" | "FEEDBACK" | "GAME_OVER";

class GameScene extends Phaser.Scene {
  private tiles: TileData[] = [];
  private sequence: number[] = [];
  private playerIndex = 0;
  private round = 1;
  private score = 0;
  private phase: GamePhase = "IDLE";
  private gridContainer!: Phaser.GameObjects.Container;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private particleTexture!: string;
  private tileSize = 0;
  private tileGap = 0;
  private gridOffsetX = 0;
  private gridOffsetY = 0;
  private currentDisplaySpeed = SEQUENCE_DISPLAY_MS;
  private showingTimers: Phaser.Time.TimerEvent[] = [];
  private feedbackTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0a0a1a);
    this.createParticleTexture();
    this.calculateLayout();
    this.createGrid();
    this.createParticleEmitter();

    this.scale.on("resize", () => {
      this.calculateLayout();
      this.repositionGrid();
    });

    window.startGame = () => this.startNewGame();
    window.restartGame = () => this.startNewGame();
    window.pauseGame = () => this.scene.pause();
    window.resumeGame = () => this.scene.resume();
  }

  private createParticleTexture(): void {
    const key = "particle";
    if (this.textures.exists(key)) {
      this.particleTexture = key;
      return;
    }
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture(key, 8, 8);
    g.destroy();
    this.particleTexture = key;
  }

  private calculateLayout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const isMobile = window.matchMedia("(pointer: coarse)").matches;

    const maxGridDim = isMobile
      ? Math.min(w * 0.88, h * 0.45)
      : Math.min(w * 0.5, h * 0.55, 420);

    this.tileGap = Math.round(maxGridDim * 0.04);
    this.tileSize = Math.floor(
      (maxGridDim - this.tileGap * (GRID_SIZE - 1)) / GRID_SIZE,
    );

    const totalGridW =
      this.tileSize * GRID_SIZE + this.tileGap * (GRID_SIZE - 1);
    this.gridOffsetX = (w - totalGridW) / 2;

    const topOffset = isMobile ? 180 : 100;
    const availableH = h - topOffset;
    this.gridOffsetY = topOffset + (availableH - totalGridW) / 2;
  }

  private createGrid(): void {
    this.gridContainer = this.add.container(0, 0);
    this.tiles = [];

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const index = row * GRID_SIZE + col;
        const colorIndex = index % TILE_COLORS.length;

        const x =
          this.gridOffsetX + col * (this.tileSize + this.tileGap) + this.tileSize / 2;
        const y =
          this.gridOffsetY + row * (this.tileSize + this.tileGap) + this.tileSize / 2;

        const container = this.add.container(x, y);

        const graphics = this.add.graphics();
        this.drawTile(graphics, this.tileSize, TILE_COLORS[colorIndex].base, 0.9);
        container.add(graphics);

        const glowGraphics = this.add.graphics();
        glowGraphics.setAlpha(0);
        container.add(glowGraphics);

        const hitArea = this.add
          .rectangle(0, 0, this.tileSize, this.tileSize, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        container.add(hitArea);

        hitArea.on("pointerdown", () => this.onTilePressed(index));

        this.gridContainer.add(container);

        this.tiles.push({
          row,
          col,
          colorIndex,
          graphics,
          glowGraphics,
          container,
          hitArea,
        });
      }
    }
  }

  private drawTile(
    g: Phaser.GameObjects.Graphics,
    size: number,
    color: number,
    alpha: number,
  ): void {
    g.clear();
    const half = size / 2;
    const r = Math.round(size * 0.12);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(-half, -half, size, size, r);
    g.lineStyle(2, Phaser.Display.Color.IntegerToColor(color).brighten(30).color, 0.4);
    g.strokeRoundedRect(-half, -half, size, size, r);
  }

  private drawLitTile(
    g: Phaser.GameObjects.Graphics,
    size: number,
    litColor: number,
  ): void {
    g.clear();
    const half = size / 2;
    const r = Math.round(size * 0.12);
    g.fillStyle(litColor, 0.85);
    g.fillRoundedRect(-half, -half, size, size, r);

    const glowSize = size + 16;
    const glowHalf = glowSize / 2;
    g.fillStyle(litColor, 0.12);
    g.fillRoundedRect(-glowHalf, -glowHalf, glowSize, glowSize, r + 4);

    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeRoundedRect(-half, -half, size, size, r);
  }

  private repositionGrid(): void {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const index = row * GRID_SIZE + col;
        const tile = this.tiles[index];
        const x =
          this.gridOffsetX + col * (this.tileSize + this.tileGap) + this.tileSize / 2;
        const y =
          this.gridOffsetY + row * (this.tileSize + this.tileGap) + this.tileSize / 2;
        tile.container.setPosition(x, y);

        this.drawTile(
          tile.graphics,
          this.tileSize,
          TILE_COLORS[tile.colorIndex].base,
          0.9,
        );
        tile.glowGraphics.clear();
        tile.glowGraphics.setAlpha(0);
        tile.hitArea.setSize(this.tileSize, this.tileSize);
      }
    }
  }

  private createParticleEmitter(): void {
    this.particles = this.add.particles(0, 0, this.particleTexture, {
      speed: { min: 60, max: 200 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 500,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.particles.setDepth(100);
  }

  private startNewGame(): void {
    this.round = 1;
    this.score = 0;
    this.sequence = [];
    this.playerIndex = 0;
    this.phase = "IDLE";
    this.currentDisplaySpeed = SEQUENCE_DISPLAY_MS;

    this.updateHUD();
    this.resetAllTiles();

    this.time.delayedCall(400, () => this.startRound());
  }

  private startRound(): void {
    this.playerIndex = 0;
    this.addToSequence();
    this.showRoundBanner(() => {
      this.showSequence();
    });
  }

  private addToSequence(): void {
    let next: number;
    do {
      next = Phaser.Math.Between(0, TOTAL_TILES - 1);
    } while (this.sequence.length > 0 && next === this.sequence[this.sequence.length - 1]);
    this.sequence.push(next);
  }

  private showRoundBanner(onComplete: () => void): void {
    const banner = document.getElementById("round-banner");
    if (!banner) {
      onComplete();
      return;
    }
    banner.textContent = `ROUND ${this.round}`;
    banner.style.opacity = "0";
    banner.style.transform = "translate(-50%, -50%) scale(0.5)";
    banner.style.transition = "none";

    requestAnimationFrame(() => {
      banner.style.transition = "opacity 300ms ease, transform 300ms ease";
      banner.style.opacity = "1";
      banner.style.transform = "translate(-50%, -50%) scale(1)";
    });

    this.time.delayedCall(ROUND_BANNER_MS, () => {
      banner.style.opacity = "0";
      banner.style.transform = "translate(-50%, -50%) scale(1.2)";
      this.time.delayedCall(300, onComplete);
    });
  }

  private showSequence(): void {
    this.phase = "SHOWING";
    this.setTilesInteractive(false);
    this.clearShowingTimers();

    const speed = Math.max(
      MIN_DISPLAY_MS,
      this.currentDisplaySpeed - (this.round - 1) * SPEED_DECREASE_PER_ROUND,
    );

    for (let i = 0; i < this.sequence.length; i++) {
      const delay = i * (speed + SEQUENCE_GAP_MS);
      const timer = this.time.delayedCall(delay, () => {
        this.flashTile(this.sequence[i], speed);
      });
      this.showingTimers.push(timer);
    }

    const totalTime =
      this.sequence.length * (speed + SEQUENCE_GAP_MS) + speed;
    const endTimer = this.time.delayedCall(totalTime, () => {
      this.phase = "INPUT";
      this.setTilesInteractive(true);
    });
    this.showingTimers.push(endTimer);
  }

  private flashTile(index: number, duration: number): void {
    const tile = this.tiles[index];
    const color = TILE_COLORS[tile.colorIndex];

    this.drawLitTile(tile.glowGraphics, this.tileSize, color.lit);
    tile.glowGraphics.setAlpha(1);

    this.tweens.add({
      targets: tile.container,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: duration * 0.3,
      yoyo: true,
      ease: "Quad.easeOut",
    });

    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: tile.glowGraphics,
        alpha: 0,
        duration: 150,
        ease: "Quad.easeOut",
      });
    });

    if (window.platform.fxEnabled) {
      this.playTone(tile.colorIndex);
    }
  }

  private onTilePressed(index: number): void {
    if (this.phase !== "INPUT") return;

    const tile = this.tiles[index];
    const color = TILE_COLORS[tile.colorIndex];
    const expected = this.sequence[this.playerIndex];

    this.drawLitTile(tile.glowGraphics, this.tileSize, color.lit);
    tile.glowGraphics.setAlpha(1);

    this.tweens.add({
      targets: tile.container,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
    });

    if (window.platform.fxEnabled) {
      this.playTone(tile.colorIndex);
    }

    if (index === expected) {
      this.onCorrectTile(tile);
    } else {
      this.onWrongTile(tile, index);
    }
  }

  private onCorrectTile(tile: TileData): void {
    if (typeof window.triggerHaptic === "function" && window.platform.hapticsEnabled) {
      window.triggerHaptic("light");
    }

    this.emitParticles(
      tile.container.x,
      tile.container.y,
      TILE_COLORS[tile.colorIndex].lit,
    );

    this.time.delayedCall(FLASH_DURATION_MS, () => {
      this.tweens.add({
        targets: tile.glowGraphics,
        alpha: 0,
        duration: 150,
      });
    });

    this.playerIndex++;
    this.score += 10 + this.round * 5;
    this.updateHUD();

    if (this.playerIndex >= this.sequence.length) {
      this.phase = "FEEDBACK";
      this.setTilesInteractive(false);

      if (typeof window.triggerHaptic === "function" && window.platform.hapticsEnabled) {
        window.triggerHaptic("success");
      }

      this.celebrateRoundComplete();

      this.round++;
      this.currentDisplaySpeed = Math.max(
        MIN_DISPLAY_MS,
        SEQUENCE_DISPLAY_MS - (this.round - 1) * SPEED_DECREASE_PER_ROUND,
      );

      this.feedbackTimer = this.time.delayedCall(1200, () => {
        this.updateHUD();
        this.startRound();
      });
    }
  }

  private onWrongTile(tile: TileData, _pressedIndex: number): void {
    this.phase = "GAME_OVER";
    this.setTilesInteractive(false);

    if (typeof window.triggerHaptic === "function" && window.platform.hapticsEnabled) {
      window.triggerHaptic("error");
    }

    this.drawLitTile(tile.glowGraphics, this.tileSize, 0xff0000);
    tile.glowGraphics.setAlpha(1);

    this.cameras.main.shake(300, 0.015);

    this.tweens.add({
      targets: tile.container,
      scaleX: 0.9,
      scaleY: 0.9,
      duration: 100,
      yoyo: true,
      repeat: 2,
      ease: "Quad.easeInOut",
    });

    this.highlightCorrectTile();

    this.time.delayedCall(1500, () => {
      if (typeof window.submitScore === "function") {
        window.submitScore(this.score);
      }
      window.showGameOver(this.score, this.round);
      this.resetAllTiles();
    });
  }

  private highlightCorrectTile(): void {
    const correctIndex = this.sequence[this.playerIndex];
    const correctTile = this.tiles[correctIndex];
    const correctColor = TILE_COLORS[correctTile.colorIndex];

    this.time.delayedCall(500, () => {
      this.drawLitTile(correctTile.glowGraphics, this.tileSize, correctColor.lit);
      correctTile.glowGraphics.setAlpha(0);

      this.tweens.add({
        targets: correctTile.glowGraphics,
        alpha: 1,
        duration: 300,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
    });
  }

  private celebrateRoundComplete(): void {
    for (const tile of this.tiles) {
      const color = TILE_COLORS[tile.colorIndex];
      this.drawLitTile(tile.glowGraphics, this.tileSize, color.lit);

      this.tweens.add({
        targets: tile.glowGraphics,
        alpha: { from: 0, to: 0.7 },
        duration: 200,
        delay: Phaser.Math.Between(0, 200),
        yoyo: true,
        ease: "Quad.easeOut",
      });

      this.emitParticles(tile.container.x, tile.container.y, color.lit, 3);
    }
  }

  private emitParticles(x: number, y: number, color: number, count = 8): void {
    this.particles.setPosition(x, y);
    this.particles.setParticleTint(color);
    this.particles.explode(count);
  }

  private setTilesInteractive(enabled: boolean): void {
    for (const tile of this.tiles) {
      if (enabled) {
        tile.hitArea.setInteractive({ useHandCursor: true });
      } else {
        tile.hitArea.disableInteractive();
      }
    }
  }

  private resetAllTiles(): void {
    for (const tile of this.tiles) {
      tile.glowGraphics.setAlpha(0);
      tile.container.setScale(1);
    }
  }

  private clearShowingTimers(): void {
    for (const t of this.showingTimers) {
      t.remove(false);
    }
    this.showingTimers = [];
    if (this.feedbackTimer) {
      this.feedbackTimer.remove(false);
      this.feedbackTimer = null;
    }
  }

  private updateHUD(): void {
    const scoreEl = document.getElementById("hud-score");
    const roundEl = document.getElementById("hud-round");
    if (scoreEl) scoreEl.textContent = String(this.score);
    if (roundEl) roundEl.textContent = String(this.round);
  }

  private playTone(colorIndex: number): void {
    try {
      const audioCtx = this.getAudioContext();
      if (!audioCtx) return;

      const frequencies = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3, 587.3];
      const freq = frequencies[colorIndex % frequencies.length];

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {
      // Audio not available
    }
  }

  private audioCtx: AudioContext | null = null;
  private getAudioContext(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }
}

class BackgroundScene extends Phaser.Scene {
  private gridLines: Phaser.GameObjects.Graphics | null = null;
  private floatingOrbs: { x: number; y: number; vx: number; vy: number; r: number; color: number; alpha: number }[] = [];

  constructor() {
    super("BackgroundScene");
  }

  create(): void {
    this.gridLines = this.add.graphics();
    this.drawBackground();
    this.createOrbs();

    this.scale.on("resize", () => {
      this.drawBackground();
    });
  }

  private drawBackground(): void {
    if (!this.gridLines) return;
    this.gridLines.clear();

    const w = this.scale.width;
    const h = this.scale.height;
    const spacing = 60;

    this.gridLines.lineStyle(1, 0x0d1b2a, 0.3);
    for (let x = 0; x < w; x += spacing) {
      this.gridLines.moveTo(x, 0);
      this.gridLines.lineTo(x, h);
    }
    for (let y = 0; y < h; y += spacing) {
      this.gridLines.moveTo(0, y);
      this.gridLines.lineTo(w, y);
    }
    this.gridLines.strokePath();
  }

  private createOrbs(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const orbColors = [0x00f0ff, 0x7b2fff, 0xff2d95, 0x00ff88];

    for (let i = 0; i < 12; i++) {
      this.floatingOrbs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 3 + 1,
        color: orbColors[i % orbColors.length],
        alpha: Math.random() * 0.3 + 0.05,
      });
    }
  }

  update(_time: number, delta: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const dt = delta / 16.67;

    for (const orb of this.floatingOrbs) {
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (orb.x < 0) orb.x = w;
      if (orb.x > w) orb.x = 0;
      if (orb.y < 0) orb.y = h;
      if (orb.y > h) orb.y = 0;
    }
  }
}

window.addEventListener("load", () => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game-container",
    backgroundColor: "#0a0a1a",
    transparent: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BackgroundScene, GameScene],
  });

  game.scene.start("BackgroundScene");
  game.scene.start("GameScene");
});
