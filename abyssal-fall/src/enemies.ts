/**
 * DOWNWELL - Enemy Classes
 * 
 * Base enemy class and specific enemy type implementations.
 * Each enemy type has unique behavior and properties.
 * Supports sprite sheet rendering with per-enemy configurations.
 */

import { CONFIG } from "./config";

function getAssetUrl(relativePath: string): string {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}assets/${relativePath}`;
}
import { SeededRNG } from "./world";

// ============= TYPES =============
export type EnemyType = "STATIC" | "HORIZONTAL" | "EXPLODER" | "PUFFER";

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

  getSpriteDrawRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.spriteConfig) return null;
    const scale = this.spriteConfig.scale ?? 1;
    return {
      x: this.x + this.spriteConfig.offsetX,
      y: this.y + this.spriteConfig.offsetY,
      width: this.spriteConfig.frameWidth * scale,
      height: this.spriteConfig.frameHeight * scale,
    };
  }

  getSpriteFrameSize(): { width: number; height: number } | null {
    if (!this.spriteConfig) return null;
    return { width: this.spriteConfig.frameWidth, height: this.spriteConfig.frameHeight };
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

  getAnimationFrameIndex(): number {
    return this.currentFrame;
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
  private canShoot: boolean = true;
  
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
  private moveMinX: number = Number.NEGATIVE_INFINITY;
  private moveMaxX: number = Number.POSITIVE_INFINITY;
  private moveTargetX: number | null = null;
  private readonly MOVE_SPEED: number = 0.9;
  private readonly MOVE_EDGE_PADDING: number = 1;
  private readonly MOVE_MIN_DISTANCE: number = 8;
  private readonly MOVE_MAX_DISTANCE: number = 42;
  private readonly moveRng: SeededRNG;

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.moveRng = rng;
    this.speed = CONFIG.ENEMY_SPEED_STATIC;
    
    // Crab-like creature - slightly wider than tall.
    // Bump hitbox to better match visible sprite body.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.8;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 1.35;
    
    this.canShoot = true;
    
    // Randomize initial shoot timer so all crabs don't fire at once
    this.shootTimer = Math.floor(rng.range(0, this.SHOOT_INTERVAL));
    
    // Red crab sprite sheet: 4 frames, 96×96 per frame (384x96 total)
    this.setupSprite({
      src: getAssetUrl("Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Idle.png"),
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
    this.attackSprite.src = getAssetUrl("Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/3/Attack3.png");
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

    this.updatePostShotMovement();
  }

  setMovementBounds(minX: number, maxX: number): void {
    this.moveMinX = minX;
    this.moveMaxX = maxX;
    this.x = Math.max(this.moveMinX, Math.min(this.moveMaxX, this.x));
  }

  private updatePostShotMovement(): void {
    if (this.moveTargetX === null) return;
    const dx = this.moveTargetX - this.x;
    if (Math.abs(dx) <= this.MOVE_SPEED) {
      this.x = this.moveTargetX;
      this.moveTargetX = null;
      return;
    }
    this.direction = dx >= 0 ? 1 : -1;
    this.x += Math.sign(dx) * this.MOVE_SPEED;
    if (this.x < this.moveMinX) this.x = this.moveMinX;
    if (this.x > this.moveMaxX) this.x = this.moveMaxX;
  }

  private queueRandomLedgeMove(): void {
    const leftRoom = this.x - this.moveMinX;
    const rightRoom = this.moveMaxX - this.x;
    const canMoveLeft = leftRoom >= this.MOVE_MIN_DISTANCE;
    const canMoveRight = rightRoom >= this.MOVE_MIN_DISTANCE;
    if (!canMoveLeft && !canMoveRight) {
      this.moveTargetX = null;
      return;
    }

    let moveDir = 1;
    if (canMoveLeft && canMoveRight) {
      moveDir = this.moveRng.chance(0.5) ? -1 : 1;
    } else if (canMoveLeft) {
      moveDir = -1;
    }

    const room = moveDir < 0 ? leftRoom : rightRoom;
    const distMax = Math.min(this.MOVE_MAX_DISTANCE, room);
    const dist = this.moveRng.range(this.MOVE_MIN_DISTANCE, distMax);
    const target = this.x + moveDir * dist;
    this.moveTargetX = Math.max(this.moveMinX, Math.min(this.moveMaxX, target));
  }
  
  private shootAtPlayer(playerX: number, playerY: number): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    
    // Calculate direction to player
    const dx = playerX - cx;
    const dy = playerY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) return;
    
    // Only shoot if player is within reasonable range (not too far)
    if (dist > 720) return;
    
    // Start attack animation
    this.isAttacking = true;
    this.attackFrame = 0;
    this.attackTimer = 0;
    
    // Face the player
    this.direction = dx > 0 ? 1 : -1;
    
    // Normalize and apply speed
    const vx = (dx / dist) * this.BULLET_SPEED;
    const vy = (dy / dist) * this.BULLET_SPEED;
    const muzzleOffset = Math.max(this.width, this.height) * 0.45 + 6;
    const spawnX = cx + (dx / dist) * muzzleOffset;
    const spawnY = cy + (dy / dist) * muzzleOffset;
    
    this.pendingBullet = {
      x: spawnX,
      y: spawnY,
      vx,
      vy,
      size: 5,
    };

    // After each shot, sidestep along the current ledge without stepping off.
    this.queueRandomLedgeMove();
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
      src: getAssetUrl("Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/1/Walk.png"),
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
  private vx: number = 0;
  private vy: number = 0;
  private pulseFrame: number = 0;
  private readonly PULSE_CYCLE_FRAMES: number = 24;
  private readonly CHARGE_FRAMES: number = 9;
  private readonly THRUST_FRAMES: number = 6;
  private readonly CHARGE_PULL: number = 0.09;
  private readonly THRUST_FORCE: number = 0.62;
  private readonly SEEK_FORCE: number = 0.11;
  private readonly DRAG: number = 0.92;
  private readonly MAX_SPEED: number = 4.2;

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.speed = CONFIG.ENEMY_SPEED_EXPLODER;
    
    // Squid enemy - use a larger box so collisions better match the wide body sprite.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 2.4;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 2.2;
    
    // Squid walk sprite sheet: 6 frames, 96×96 per frame (576x96 total)
    const scale = 0.75;
    this.setupSprite({
      src: getAssetUrl("Water-Monsters-Pixel-Art-Sprite-Sheet-Pack/2/Walk.png"),
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

  update(playerX: number, playerY: number): void {
    const cx = this.x + this.width * 0.5;
    const cy = this.y + this.height * 0.5;
    const dx = playerX - cx;
    const dy = playerY - cy;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Squid-like motion: pull back, then burst toward the player.
    this.pulseFrame = (this.pulseFrame + 1) % this.PULSE_CYCLE_FRAMES;
    const inCharge = this.pulseFrame < this.CHARGE_FRAMES;
    const inThrust = this.pulseFrame >= this.CHARGE_FRAMES && this.pulseFrame < this.CHARGE_FRAMES + this.THRUST_FRAMES;

    if (inCharge) {
      this.vx += -dirX * this.CHARGE_PULL;
      this.vy += -dirY * this.CHARGE_PULL * 0.8;
    } else if (inThrust) {
      this.vx += dirX * this.THRUST_FORCE;
      this.vy += dirY * this.THRUST_FORCE;
    } else {
      this.vx += dirX * this.SEEK_FORCE;
      this.vy += dirY * this.SEEK_FORCE;
    }

    this.vx *= this.DRAG;
    this.vy *= this.DRAG;

    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.MAX_SPEED) {
      const s = this.MAX_SPEED / speed;
      this.vx *= s;
      this.vy *= s;
    }

    this.x += this.vx;
    this.y += this.vy;
    // Squid sprite faces opposite of travel in this sheet (tentacles trail behind).
    this.direction = this.vx >= 0 ? -1 : 1;

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

// ============= PUFFER ENEMY =============
export class PufferEnemy extends BaseEnemy {
  readonly type: EnemyType = "PUFFER";
  private static spriteSheet: HTMLImageElement | null = null;
  private static spriteLoaded: boolean = false;
  private static spriteLoadAttempted: boolean = false;

  private vx: number = 0;
  private vy: number = 0;
  private wanderTimer: number = 0;
  private stretchPhase: number = 0;
  private puffTimer: number = 0;
  private puffCooldown: number = 0;
  private puffStartedThisFrame: boolean = false;
  private puffVisualScale: number = 1;
  private readonly rng: SeededRNG;
  private readonly WANDER_DRAG: number = 0.95;
  private readonly WANDER_MIN_SPEED: number = 0.35;
  private readonly WANDER_MAX_SPEED: number = 0.9;
  private readonly SEEK_RADIUS: number = 72;
  private readonly PUFF_DURATION_FRAMES: number = 60; // 1 second at 60fps
  private readonly PUFF_COOLDOWN_FRAMES: number = 70;
  private readonly PUFF_TARGET_SCALE: number = 1.7;
  private readonly PUFF_LERP_FRAMES: number = 18; // 0.3 seconds at 60fps
  private readonly KNOCKBACK_SPEED: number = 7.5;

  constructor(x: number, y: number, rng: SeededRNG) {
    super(x, y, rng);
    this.rng = rng;
    this.speed = 0.8;
    // 30% smaller than previous enlarged size.
    this.width = BaseEnemy.BASE_SIZE * this.sizeVariance * 2.625;
    this.height = BaseEnemy.BASE_SIZE * this.sizeVariance * 2.625;
    this.pickNewWanderDirection();
    this.ensureSpriteLoaded();
  }

  private ensureSpriteLoaded(): void {
    if (PufferEnemy.spriteLoadAttempted) return;
    PufferEnemy.spriteLoadAttempted = true;
    PufferEnemy.spriteSheet = new Image();
    PufferEnemy.spriteSheet.onload = () => {
      PufferEnemy.spriteLoaded = true;
      console.log("[PufferEnemy]", "Puffer sprite sheet loaded");
    };
    PufferEnemy.spriteSheet.onerror = () => {
      console.warn("[PufferEnemy]", "Failed to load puffer sprite sheet");
    };
    PufferEnemy.spriteSheet.src = getAssetUrl("weeds.png");
  }

  update(playerX: number, playerY: number): void {
    this.puffStartedThisFrame = false;
    const cx = this.x + this.width * 0.5;
    const cy = this.y + this.height * 0.5;
    const dx = playerX - cx;
    const dy = playerY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.puffTimer > 0) {
      this.puffTimer--;
      this.vx *= 0.88;
      this.vy *= 0.88;
      if (this.puffTimer <= 0) {
        this.puffCooldown = this.PUFF_COOLDOWN_FRAMES;
      }
    } else {
      if (this.puffCooldown > 0) {
        this.puffCooldown--;
      } else if (dist <= this.SEEK_RADIUS) {
        this.puffTimer = this.PUFF_DURATION_FRAMES;
        this.puffStartedThisFrame = true;
      }

      this.wanderTimer--;
      if (this.wanderTimer <= 0) {
        this.pickNewWanderDirection();
      }
    }

    // Smoothly transition to/from puffed scale over ~0.3s.
    const targetScale = this.isPuffed() ? this.PUFF_TARGET_SCALE : 1;
    const maxStep = (this.PUFF_TARGET_SCALE - 1) / this.PUFF_LERP_FRAMES;
    const scaleDelta = targetScale - this.puffVisualScale;
    if (Math.abs(scaleDelta) <= maxStep) {
      this.puffVisualScale = targetScale;
    } else {
      this.puffVisualScale += Math.sign(scaleDelta) * maxStep;
    }

    this.vx *= this.WANDER_DRAG;
    this.vy *= this.WANDER_DRAG;
    this.x += this.vx;
    this.y += this.vy;

    if (Math.abs(this.vx) > 0.02) {
      this.direction = this.vx > 0 ? 1 : -1;
    }

    const moveSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.stretchPhase += 0.2 + moveSpeed * 0.16;
  }

  private pickNewWanderDirection(): void {
    this.wanderTimer = this.rng.int(28, 88);
    const angle = this.rng.range(0, Math.PI * 2);
    const speed = this.rng.range(this.WANDER_MIN_SPEED, this.WANDER_MAX_SPEED);
    this.vx += Math.cos(angle) * speed;
    this.vy += Math.sin(angle) * speed;
  }

  isPuffed(): boolean {
    return this.puffTimer > 0;
  }

  consumePuffStart(): boolean {
    if (!this.puffStartedThisFrame) return false;
    this.puffStartedThisFrame = false;
    return true;
  }

  getVisualScale(): number {
    return this.puffVisualScale;
  }

  getVisualRadius(): number {
    return this.width * this.puffVisualScale * 0.5;
  }

  getCollisionKnockback(playerX: number, playerY: number): { vx: number; vy: number } {
    const cx = this.x + this.width * 0.5;
    const cy = this.y + this.height * 0.5;
    let dx = playerX - cx;
    let dy = playerY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) {
      dx = this.direction >= 0 ? 1 : -1;
      dy = -0.2;
    } else {
      dx /= dist;
      dy /= dist;
    }
    return {
      vx: dx * this.KNOCKBACK_SPEED,
      vy: dy * this.KNOCKBACK_SPEED,
    };
  }

  getBaseColor(): string {
    return `rgb(${Math.floor(210 * this.colorVariance)}, ${Math.floor(170 * this.colorVariance)}, ${Math.floor(90 * this.colorVariance)})`;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const sheet = PufferEnemy.spriteSheet;
    if (!sheet || !PufferEnemy.spriteLoaded) {
      this.drawFallback(ctx);
      return;
    }

    // weeds.png layout: 4 columns x 2 rows, puffer is at row 1, col 1
    const cols = 4;
    const rows = 2;
    const srcW = Math.floor(sheet.naturalWidth / cols);
    const srcH = Math.floor(sheet.naturalHeight / rows);
    const sx = srcW * 1;
    const sy = srcH * 1;

    const stretch = Math.sin(this.stretchPhase) * 0.1;
    const puffScale = this.puffVisualScale;
    const drawW = this.width * puffScale * (1 + stretch * 0.6);
    const drawH = this.height * puffScale * (1 - stretch * 0.45);
    const drawX = this.x + this.width * 0.5 - drawW * 0.5;
    const drawY = this.y + this.height * 0.5 - drawH * 0.5;

    ctx.save();
    const flashing = this.isPuffed() && Math.floor(this.puffTimer / 4) % 2 === 0;
    if (flashing) {
      // Tint only the sprite pixels; avoid rectangular overlays.
      ctx.filter = "brightness(0.72) sepia(1) saturate(8) hue-rotate(-35deg)";
    }
    if (this.direction < 0) {
      ctx.translate(drawX + drawW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, sx, sy, srcW, srcH, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(sheet, sx, sy, srcW, srcH, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  }

  protected drawFallback(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + this.width * 0.5;
    const cy = this.y + this.height * 0.5;
    const radius = this.isPuffed() ? this.width * 1.4 : this.width * 0.5;
    ctx.fillStyle = this.isPuffed() && Math.floor(this.puffTimer / 4) % 2 === 0
      ? "rgb(255, 110, 110)"
      : this.getBaseColor();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
      case "PUFFER":
        return new PufferEnemy(x, y, rng);
      default:
        console.warn("[EnemyFactory] Unknown enemy type:", type);
        return new StaticEnemy(x, y, rng);
    }
  }

  /**
   * Get available enemy types based on depth/chunk index
   */
  static getAvailableTypes(chunkIndex: number): EnemyType[] {
    const depthMeters = Math.floor((chunkIndex * CONFIG.CHUNK_HEIGHT) / 10);
    const types: EnemyType[] = ["HORIZONTAL"];

    if (depthMeters >= 100) types.push("PUFFER");
    if (depthMeters >= 200) types.push("STATIC");
    if (depthMeters >= 300) types.push("EXPLODER");

    return types;
  }
}
