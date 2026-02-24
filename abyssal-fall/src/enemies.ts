/**
 * DOWNWELL - Enemy Classes
 * 
 * Base enemy class and specific enemy type implementations.
 * Each enemy type has unique behavior and properties.
 * Supports sprite sheet rendering with per-enemy configurations.
 */

import { CONFIG } from "./config";
import { SeededRNG } from "./world";

// ============= TYPES =============
export type EnemyType = "STATIC" | "HORIZONTAL" | "EXPLODER";

export interface EnemyData {
  x: number;
  y: number;
  width: number;
  height: number;
  type: EnemyType;
  hp: number;
  speed: number;
  direction: number;
  chunkIndex: number;
  colorVariance: number;
  sizeVariance: number;
}

export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

/**
 * Configuration for sprite sheet rendering
 * Each enemy type can have different dimensions and offsets
 */
export interface SpriteConfig {
  /** Path to the sprite sheet image */
  src: string;
  /** Width of each frame in the sprite sheet */
  frameWidth: number;
  /** Height of each frame in the sprite sheet */
  frameHeight: number;
  /** Total number of animation frames */
  frameCount: number;
  /** Animation speed (frames per game tick, e.g., 0.1 = 10 ticks per frame) */
  animationSpeed: number;
  /** X offset from entity position (for centering sprites larger than hitbox) */
  offsetX: number;
  /** Y offset from entity position */
  offsetY: number;
  /** Optional scale factor for the sprite */
  scale?: number;
  /** Optional: row index if sprite sheet has multiple rows for different states */
  row?: number;
}

// ============= BASE ENEMY CLASS =============
export abstract class BaseEnemy implements EnemyData {
  x: number;
  y: number;
  width: number;
  height: number;
  abstract readonly type: EnemyType;
  hp: number;
  speed: number;
  direction: number;
  chunkIndex: number;
  colorVariance: number;
  sizeVariance: number;

  protected static readonly BASE_SIZE = 24;

  // Sprite properties
  protected sprite: HTMLImageElement | null = null;
  protected spriteLoaded: boolean = false;
  protected spriteConfig: SpriteConfig | null = null;
  protected currentFrame: number = 0;
  protected animationTimer: number = 0;

  constructor(x: number, y: number, rng: SeededRNG) {
    this.x = x;
    this.y = y;
    this.sizeVariance = rng.range(0.9, 1.1);
    this.colorVariance = rng.range(0.8, 1.2);
    this.direction = rng.chance(0.5) ? 1 : -1;
    this.chunkIndex = 0;
    
    // Default values - subclasses override these
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance;
    this.hp = CONFIG.ENEMY_BASE_HP;
    this.speed = 0;
  }

  /**
   * Setup sprite sheet for this enemy
   * Call this in subclass constructor to enable sprite rendering
   */
  protected setupSprite(config: SpriteConfig): void {
    this.spriteConfig = config;
    this.sprite = new Image();
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      console.log(`[${this.type}] Sprite loaded: ${config.src}`);
    };
    this.sprite.onerror = () => {
      console.warn(`[${this.type}] Failed to load sprite: ${config.src}`);
    };
    this.sprite.src = config.src;
  }

  /**
   * Update animation frame
   * Call this in the update() method if using sprites
   */
  protected updateAnimation(): void {
    if (!this.spriteConfig) return;
    
    this.animationTimer += this.spriteConfig.animationSpeed;
    if (this.animationTimer >= 1) {
      this.animationTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % this.spriteConfig.frameCount;
    }
  }

  /**
   * Draw the sprite if loaded, otherwise fall back to shape rendering
   */
  protected drawSprite(ctx: CanvasRenderingContext2D): boolean {
    if (!this.sprite || !this.spriteLoaded || !this.spriteConfig) {
      return false; // Sprite not ready, caller should use fallback
    }
    
    const cfg = this.spriteConfig;
    
    // Calculate source rectangle from sprite sheet
    const sx = this.currentFrame * cfg.frameWidth;
    const sy = (cfg.row ?? 0) * cfg.frameHeight;
    
    // Calculate destination size (with optional scale)
    const scale = cfg.scale ?? 1;
    const drawWidth = cfg.frameWidth * scale;
    const drawHeight = cfg.frameHeight * scale;
    
    // Apply offset (useful when sprite is larger than hitbox)
    const drawX = this.x + cfg.offsetX;
    const drawY = this.y + cfg.offsetY;
    
    // Handle horizontal flipping based on direction
    if (this.direction < 0) {
      ctx.save();
      ctx.translate(drawX + drawWidth, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.sprite,
        sx, sy, cfg.frameWidth, cfg.frameHeight,
        0, 0, drawWidth, drawHeight
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        this.sprite,
        sx, sy, cfg.frameWidth, cfg.frameHeight,
        drawX, drawY, drawWidth, drawHeight
      );
    }
    
    return true; // Sprite was drawn
  }

  /**
   * Check if sprite is ready for rendering
   */
  protected isSpriteReady(): boolean {
    return this.sprite !== null && this.spriteLoaded && this.spriteConfig !== null;
  }

  /**
   * Update enemy behavior each frame
   * @param playerX Player's x position
   * @param playerY Player's y position
   */
  abstract update(playerX: number, playerY: number): void;

  /**
   * Draw the enemy
   * @param ctx Canvas rendering context
   */
  abstract draw(ctx: CanvasRenderingContext2D): void;

  /**
   * Get the base color for this enemy type (used in fallback rendering)
   */
  abstract getBaseColor(): string;

  /**
   * Draw fallback shape when sprite is not available
   * Subclasses implement their specific shape drawing here
   */
  protected abstract drawFallback(ctx: CanvasRenderingContext2D): void;

  /**
   * Draw eyes common to all enemies (for fallback rendering)
   */
  protected drawEyes(ctx: CanvasRenderingContext2D): void {
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    
    ctx.fillStyle = "#fff";
    ctx.fillRect(centerX - 5, centerY - 3, 3, 4);
    ctx.fillRect(centerX + 2, centerY - 3, 3, 4);
  }

  /**
   * Check wall collision and reverse direction if needed
   */
  protected checkWallCollision(): void {
    if (this.x <= CONFIG.WALL_WIDTH + 5 || 
        this.x + this.width >= CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH - 5) {
      this.direction *= -1;
    }
  }

  /**
   * Take damage and return true if enemy is dead
   */
  takeDamage(amount: number = 1): boolean {
    this.hp -= amount;
    return this.hp <= 0;
  }

  /**
   * Check if enemy is dead
   */
  isDead(): boolean {
    return this.hp <= 0;
  }
}

// ============= STATIC ENEMY =============
export class StaticEnemy extends BaseEnemy {
  readonly type: EnemyType = "STATIC";
  
  // Shooting properties
  private shootTimer: number = 0;
  private readonly SHOOT_INTERVAL: number = 120; // 2 seconds at 60fps
  private readonly BULLET_SPEED: number = 3;
  private pendingBullet: EnemyBullet | null = null;
  private canShoot: boolean = false; // Only 30% of static enemies can shoot
  
  // Attack animation properties
  private attackSprite: HTMLImageElement | null = null;
  private attackSpriteLoaded: boolean = false;
  private isAttacking: boolean = false;
  private attackFrame: number = 0;
  private attackTimer: number = 0;
  private readonly ATTACK_FRAME_COUNT: number = 6;
  private readonly ATTACK_ANIM_SPEED: number = 0.25;
  private readonly spriteScale: number = 0.7;
  private readonly FOOT_ANCHOR_OFFSET: number = 2;

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.speed = CONFIG.ENEMY_SPEED_STATIC;
    
    // Crab-like creature - slightly wider than tall.
    // Bump hitbox to better match visible sprite body.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.8;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.35;
    
    // 30% chance this crab can shoot
    this.canShoot = rng.chance(0.3);
    
    // Randomize initial shoot timer so all crabs don't fire at once
    this.shootTimer = Math.floor(rng.range(0, this.SHOOT_INTERVAL));
    
    // Red crab sprite sheet: 4 frames, 96×96 per frame (384x96 total)
    this.setupSprite({
      src: "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Idle.png",
      frameWidth: 96,
      frameHeight: 96,
      frameCount: 4,
      animationSpeed: 0.1,
      offsetX: (this.width - 96 * this.spriteScale) / 2,
      // Anchor sprite near its feet so visuals match platform collisions.
      offsetY: this.height - 96 * this.spriteScale + this.FOOT_ANCHOR_OFFSET,
      row: 0,
      scale: this.spriteScale,
    });
    
    // Load attack animation sprite
    this.attackSprite = new Image();
    this.attackSprite.onload = () => {
      this.attackSpriteLoaded = true;
    };
    this.attackSprite.src = "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Attack3.png";
  }

  update(playerX: number, playerY: number): void {
    // Update attack animation if playing
    if (this.isAttacking) {
      this.attackTimer += this.ATTACK_ANIM_SPEED;
      if (this.attackTimer >= 1) {
        this.attackTimer = 0;
        this.attackFrame++;
        if (this.attackFrame >= this.ATTACK_FRAME_COUNT) {
          // Attack animation finished
          this.isAttacking = false;
          this.attackFrame = 0;
        }
      }
    } else {
      // Only animate idle when not attacking
      this.updateAnimation();
    }
    
    // Shooting logic (only 30% of crabs can shoot)
    if (this.canShoot) {
      this.shootTimer++;
      if (this.shootTimer >= this.SHOOT_INTERVAL) {
        this.shootTimer = 0;
        this.shootAtPlayer(playerX, playerY);
      }
    }
  }
  
  private shootAtPlayer(playerX: number, playerY: number): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    
    // Calculate direction to player
    const dx = playerX - cx;
    const dy = playerY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Only shoot if player is within reasonable range (not too far)
    if (dist > 400) return;
    
    // Start attack animation
    this.isAttacking = true;
    this.attackFrame = 0;
    this.attackTimer = 0;
    
    // Face the player
    this.direction = dx > 0 ? 1 : -1;
    
    // Normalize and apply speed
    const vx = (dx / dist) * this.BULLET_SPEED;
    const vy = (dy / dist) * this.BULLET_SPEED;
    
    this.pendingBullet = {
      x: cx,
      y: cy,
      vx,
      vy,
      size: 5,
    };
  }
  
  /**
   * Get and clear any pending bullet (called by game loop)
   */
  getPendingBullet(): EnemyBullet | null {
    const bullet = this.pendingBullet;
    this.pendingBullet = null;
    return bullet;
  }

  getBaseColor(): string {
    // Reddish crab color
    return `rgb(${Math.floor(200 * this.colorVariance)}, ${Math.floor(80 * this.colorVariance)}, ${Math.floor(80 * this.colorVariance)})`;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Draw attack animation if attacking and sprite is loaded
    if (this.isAttacking && this.attackSprite && this.attackSpriteLoaded) {
      this.drawAttackSprite(ctx);
    } else if (!this.drawSprite(ctx)) {
      this.drawFallback(ctx);
    }
  }
  
  private drawAttackSprite(ctx: CanvasRenderingContext2D): void {
    const frameWidth = 96;
    const frameHeight = 96;
    const scale = this.spriteScale;
    
    // Calculate source rectangle from sprite sheet
    const sx = this.attackFrame * frameWidth;
    const sy = 0;
    
    // Calculate destination size
    const drawWidth = frameWidth * scale;
    const drawHeight = frameHeight * scale;
    
    // Apply same grounding anchor as idle sprite.
    const drawX = this.x + (this.width - drawWidth) / 2;
    const drawY = this.y + this.height - drawHeight + this.FOOT_ANCHOR_OFFSET;
    
    // Handle horizontal flipping based on direction
    if (this.direction < 0) {
      ctx.save();
      ctx.translate(drawX + drawWidth, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.attackSprite!,
        sx, sy, frameWidth, frameHeight,
        0, 0, drawWidth, drawHeight
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        this.attackSprite!,
        sx, sy, frameWidth, frameHeight,
        drawX, drawY, drawWidth, drawHeight
      );
    }
  }

  protected drawFallback(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.getBaseColor();
    ctx.fillRect(this.x, this.y, this.width, this.height);
    this.drawEyes(ctx);
  }
}

// ============= HORIZONTAL ENEMY =============
export class HorizontalEnemy extends BaseEnemy {
  readonly type: EnemyType = "HORIZONTAL";

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.speed = CONFIG.ENEMY_SPEED_HORIZONTAL;
    
    // Shark has a wide visible body; enlarge hitbox so collisions match visuals.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 2.2;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.75;
    
    // Shark walk sprite sheet: 6 frames, 96×96 per frame
    // Scale to fit hitbox nicely
    const scale = 0.8;
    this.setupSprite({
      src: "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/1/Walk.png",
      frameWidth: 96,
      frameHeight: 96,
      frameCount: 6,
      animationSpeed: 0.18,
      offsetX: (this.width - 96 * scale) / 2,  // Center sprite on hitbox
      offsetY: (this.height - 96 * scale) / 2 - 4,
      row: 0,
      scale: scale,
    });
  }

  update(_playerX: number, _playerY: number): void {
    this.x += this.speed * this.direction;
    this.checkWallCollision();
    this.updateAnimation();
  }

  getBaseColor(): string {
    // Shark-like gray-brown color
    return `rgb(${Math.floor(140 * this.colorVariance)}, ${Math.floor(120 * this.colorVariance)}, ${Math.floor(100 * this.colorVariance)})`;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.drawSprite(ctx)) {
      this.drawFallback(ctx);
    }
  }

  protected drawFallback(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.getBaseColor();
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // Direction indicator arrow
    ctx.fillStyle = "#fff";
    const arrowX = this.direction > 0 ? this.x + this.width - 8 : this.x + 3;
    ctx.fillRect(arrowX, this.y + this.height / 2 - 2, 5, 4);
    
    this.drawEyes(ctx);
  }
}

// ============= EXPLODER ENEMY =============
export class ExploderEnemy extends BaseEnemy {
  readonly type: EnemyType = "EXPLODER";

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.speed = CONFIG.ENEMY_SPEED_EXPLODER;
    
    // Squid enemy - expand hitbox to better cover visible sprite body.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.9;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.9;
    
    // Squid walk sprite sheet: 6 frames, 96×96 per frame (576x96 total)
    const scale = 0.75;
    this.setupSprite({
      src: "assets/Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/2/Walk.png",
      frameWidth: 96,
      frameHeight: 96,
      frameCount: 6,
      animationSpeed: 0.15,
      offsetX: (this.width - 96 * scale) / 2,  // Center sprite on hitbox
      offsetY: (this.height - 96 * scale) / 2 - 2,
      row: 0,
      scale: scale,
    });
  }

  update(playerX: number, _playerY: number): void {
    // Slowly track player's horizontal position
    if (Math.abs(this.x - playerX) > 5) {
      // Update direction for sprite flipping
      this.direction = playerX > this.x ? 1 : -1;
      this.x += Math.sign(playerX - this.x) * this.speed;
    }
    // Slowly fall
    this.y += this.speed * 0.3;
    
    this.updateAnimation();
  }

  getBaseColor(): string {
    // Blueish squid color
    return `rgb(${Math.floor(80 * this.colorVariance)}, ${Math.floor(120 * this.colorVariance)}, ${Math.floor(180 * this.colorVariance)})`;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.drawSprite(ctx)) {
      this.drawFallback(ctx);
    }
  }

  protected drawFallback(ctx: CanvasRenderingContext2D): void {
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    
    ctx.fillStyle = this.getBaseColor();
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Warning indicator (inner circle)
    ctx.fillStyle = "#ff0";
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.width / 4, 0, Math.PI * 2);
    ctx.fill();
    
    this.drawEyes(ctx);
  }
}

// ============= ENEMY FACTORY =============
export class EnemyFactory {
  /**
   * Create an enemy of the specified type
   */
  static create(type: EnemyType, x: number, y: number, rng: SeededRNG): BaseEnemy {
    switch (type) {
      case "STATIC":
        return new StaticEnemy(x, y, rng);
      case "HORIZONTAL":
        return new HorizontalEnemy(x, y, rng);
      case "EXPLODER":
        return new ExploderEnemy(x, y, rng);
      default:
        console.warn("[EnemyFactory] Unknown enemy type:", type);
        return new StaticEnemy(x, y, rng);
    }
  }

  /**
   * Get available enemy types based on depth/chunk index
   */
  static getAvailableTypes(chunkIndex: number): EnemyType[] {
    const types: EnemyType[] = ["STATIC", "HORIZONTAL"];
    
    if (chunkIndex >= 5) types.push("EXPLODER");
    
    return types;
  }
}
