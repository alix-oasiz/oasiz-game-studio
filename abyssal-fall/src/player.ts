/**
 * DOWNWELL - Player Movement and Shooting
 * 
 * Handles player physics, movement, shooting mechanics, and combat.
 */

import { CONFIG } from "./config";
import { Entity } from "./world";

// ============= TYPES =============
export interface Bullet extends Entity {
  vx: number;
  vy: number;
  isBlast?: boolean;
  isLightning?: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  grounded: boolean;
  combo: number;
  comboTimer: number;
  invulnerable: number;
  facingRight: boolean;
}

export interface InputState {
  left: boolean;
  right: boolean;
  shoot: boolean;
  jump: boolean;
}

// ============= PLAYER CONTROLLER =============
export class PlayerController {
  private player: Player;
  private bullets: Bullet[] = [];
  private shootCooldown: number = 0;
  private isShooting: boolean = false; // Track if currently shooting (for hover effect)
  private recoilHoverFrames: number = 0; // Frames of hover damping remaining after last shot
  private wasActionPressed: boolean = false;
  private autoFireActive: boolean = false;
  private baseWidth: number = 30;
  private baseHeight: number = 40;
  private horizontalWidth: number = 38;
  private horizontalHeight: number = 28;
  
  // Callback for haptic feedback
  private onHaptic: ((type: "light" | "medium" | "heavy" | "success" | "error") => void) | null = null;
  
  // Callback for screen shake
  private onScreenShake: ((intensity: number) => void) | null = null;
  
  // Callback when player shoots (for powerup integration)
  private onShoot: (() => void) | null = null;
  
  constructor() {
    this.player = this.createPlayer();
  }
  
  private createPlayer(): Player {
    return {
      x: CONFIG.INTERNAL_WIDTH / 2,
      y: 100,
      vx: 0,
      vy: 0,
      width: this.baseWidth,
      height: this.baseHeight,
      hp: CONFIG.PLAYER_MAX_HP,
      maxHp: CONFIG.PLAYER_MAX_HP,
      ammo: CONFIG.PLAYER_MAX_AMMO,
      maxAmmo: CONFIG.PLAYER_MAX_AMMO,
      grounded: false,
      combo: 0,
      comboTimer: 0,
      invulnerable: 0,
      facingRight: true,
    };
  }
  
  reset(): void {
    this.player = this.createPlayer();
    this.bullets = [];
    this.shootCooldown = 0;
    this.recoilHoverFrames = 0;
    this.wasActionPressed = false;
    this.autoFireActive = false;
    console.log("[PlayerController] Reset player state");
  }
  
  setHapticCallback(callback: (type: "light" | "medium" | "heavy" | "success" | "error") => void): void {
    this.onHaptic = callback;
  }
  
  setScreenShakeCallback(callback: (intensity: number) => void): void {
    this.onScreenShake = callback;
  }
  
  setShootCallback(callback: () => void): void {
    this.onShoot = callback;
  }
  
  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (this.onHaptic) {
      this.onHaptic(type);
    }
  }
  
  private triggerScreenShake(intensity: number): void {
    if (this.onScreenShake) {
      this.onScreenShake(intensity);
    }
  }
  
  getPlayer(): Player {
    return this.player;
  }
  
  getBullets(): Bullet[] {
    return this.bullets;
  }
  
  getShootCooldown(): number {
    return this.shootCooldown;
  }

  addMaxHp(amount: number): void {
    this.player.maxHp += amount;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
  }

  addMaxAmmo(amount: number): void {
    this.player.maxAmmo += amount;
    this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + amount);
  }

  addAmmo(amount: number): void {
    this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + amount);
  }

  setHitboxSizes(baseWidth: number, baseHeight: number, horizontalWidth: number, horizontalHeight: number): void {
    this.baseWidth = Math.max(8, Math.round(baseWidth));
    this.baseHeight = Math.max(8, Math.round(baseHeight));
    this.horizontalWidth = Math.max(8, Math.round(horizontalWidth));
    this.horizontalHeight = Math.max(8, Math.round(horizontalHeight));
    this.updateHitboxForPose();
  }
  
  // ============= INPUT HANDLING =============
  handleInput(input: InputState): void {
    // Unified tap action: jump when grounded, shoot when airborne
    const actionPressed = input.jump || input.shoot;
    const justPressed = actionPressed && !this.wasActionPressed;
    let firedShotThisFrame = false;
    
    if (justPressed) {
      if (this.player.grounded) {
        // Jump when grounded
        this.player.vy = CONFIG.PLAYER_JUMP_FORCE;
        this.player.grounded = false;
        this.triggerHaptic("light");
      } else {
        // Shoot when airborne
        firedShotThisFrame = this.shoot();
        if (firedShotThisFrame) {
          this.autoFireActive = true;
        }
      }
    } else if (actionPressed && !this.player.grounded && this.autoFireActive) {
      // Hold-to-fire after the player has started shooting in-air.
      firedShotThisFrame = this.shoot();
    }

    if (!actionPressed || this.player.grounded) {
      this.autoFireActive = false;
    }
    
    // Track shooting state for hover effect
    // Keep hover active during recoil frames even if ammo is 0
    this.isShooting = firedShotThisFrame || this.recoilHoverFrames > 0;
    
    // Tick down recoil hover
    if (this.recoilHoverFrames > 0) {
      this.recoilHoverFrames--;
    }
    
    // Update shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown--;
    }

    this.wasActionPressed = actionPressed;
  }
  
  // Check if player is currently shooting (for hover effect)
  isCurrentlyShooting(): boolean {
    return this.isShooting;
  }
  
  // ============= MOVEMENT =============
  updateMovement(input: InputState): void {
    // Horizontal movement
    this.player.vx = 0;
    if (input.left) {
      this.player.vx = -CONFIG.PLAYER_SPEED;
      this.player.facingRight = false;
    }
    if (input.right) {
      this.player.vx = CONFIG.PLAYER_SPEED;
      this.player.facingRight = true;
    }

    this.updateHitboxForPose();
    
    // Hover effect when shooting - player stays in place
    // Also hover during recoilHoverFrames so the last bullet doesn't catapult the player
    if (this.isShooting && (this.player.ammo > 0 || this.recoilHoverFrames > 0)) {
      // Slow down vertical velocity significantly (hover)
      this.player.vy *= 0.3;
      // Cap the fall speed while shooting
      if (this.player.vy > 1) {
        this.player.vy = 1;
      }
    } else {
      // Normal gravity
      this.player.vy += CONFIG.PLAYER_GRAVITY;
      if (this.player.vy > CONFIG.PLAYER_MAX_FALL_SPEED) {
        this.player.vy = CONFIG.PLAYER_MAX_FALL_SPEED;
      }
    }
    
    // Apply velocity
    this.player.x += this.player.vx;
    this.player.y += this.player.vy;
    
    // Invulnerability countdown
    if (this.player.invulnerable > 0) {
      this.player.invulnerable--;
    }
  }

  private updateHitboxForPose(): void {
    // Keep a stable hitbox across all animation frames/poses.
    const targetWidth = this.baseWidth;
    const targetHeight = this.baseHeight;
    if (this.player.width === targetWidth && this.player.height === targetHeight) return;

    const footY = this.player.y + this.player.height / 2;
    this.player.width = targetWidth;
    this.player.height = targetHeight;
    if (this.player.grounded) {
      // Keep feet planted when shape changes on/near platforms.
      this.player.y = footY - this.player.height / 2;
    }
  }
  
  // Check if player fell below kill plane
  checkKillPlane(cameraY: number): boolean {
    if (this.player.y > cameraY + CONFIG.INTERNAL_HEIGHT + 200) {
      this.player.hp = 0;
      return true;
    }
    return false;
  }
  
  // ============= SHOOTING =============
  private shoot(): boolean {
    if (this.shootCooldown > 0 || this.player.ammo <= 0) return false;
    if (this.player.grounded) return false; // Can only shoot while airborne
    
    this.shootCooldown = CONFIG.SHOOT_COOLDOWN;
    this.player.ammo--;
    
    // Apply upward recoil when shooting
    this.player.vy = CONFIG.PLAYER_RECOIL;
    
    // Keep hover damping active for a few frames after last shot so recoil doesn't catapult player
    this.recoilHoverFrames = CONFIG.SHOOT_COOLDOWN;
    
    // Create single bullet shooting straight down
    this.bullets.push({
      x: this.player.x,
      y: this.player.y + this.player.height / 2,
      width: CONFIG.BULLET_WIDTH,
      height: CONFIG.BULLET_HEIGHT,
      vx: 0,
      vy: CONFIG.BULLET_SPEED,
    });
    
    // Trigger screen shake
    this.triggerScreenShake(3);
    
    // Notify powerup system of shot
    if (this.onShoot) {
      this.onShoot();
    }
    
    return true;
  }
  
  // ============= BULLET MANAGEMENT =============
  updateBullets(cameraY: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      
      // Remove bullets that are off screen
      if (bullet.y > cameraY + CONFIG.INTERNAL_HEIGHT + 50 ||
          bullet.y < cameraY - 50 ||
          bullet.x < 0 || bullet.x > CONFIG.INTERNAL_WIDTH) {
        this.bullets.splice(i, 1);
      }
    }
  }
  
  removeBullet(index: number): void {
    if (index >= 0 && index < this.bullets.length) {
      this.bullets.splice(index, 1);
    }
  }
  
  /** Tag the most recently fired bullet with powerup flags */
  tagLastBullet(isBlast: boolean, isLightning: boolean): void {
    if (this.bullets.length > 0) {
      const last = this.bullets[this.bullets.length - 1];
      last.isBlast = isBlast;
      last.isLightning = isLightning;
    }
  }
  
  // ============= COMBAT =============
  bounce(restoreAmmo: boolean = true): void {
    this.player.vy = CONFIG.PLAYER_BOUNCE_FORCE;
    if (restoreAmmo) {
      this.restoreAmmo();
    }
  }
  
  restoreAmmo(): void {
    this.player.ammo = this.player.maxAmmo;
  }
  
  incrementCombo(): void {
    this.player.combo++;
    this.player.comboTimer = CONFIG.COMBO_TIMEOUT;
  }
  
  resetCombo(): void {
    this.player.combo = 0;
    this.player.comboTimer = 0;
  }
  
  updateCombo(): void {
    if (this.player.comboTimer > 0) {
      this.player.comboTimer--;
      
      if (this.player.comboTimer <= 0) {
        this.player.combo = 0;
      }
    }
  }
  
  getComboMultiplier(): number {
    return Math.min(this.player.combo + 1, CONFIG.COMBO_MULTIPLIER_MAX);
  }
  
  takeDamage(): void {
    this.player.hp--;
    this.player.invulnerable = CONFIG.PLAYER_INVULNERABLE_FRAMES;
    this.player.combo = 0;
    this.player.comboTimer = 0;
    
    // Knockback
    this.player.vy = -5;
    
    this.triggerHaptic("error");
  }
  
  isInvulnerable(): boolean {
    return this.player.invulnerable > 0;
  }
  
  isDead(): boolean {
    return this.player.hp <= 0;
  }
  
  // ============= COLLISION HELPERS =============
  setGrounded(grounded: boolean): void {
    this.player.grounded = grounded;
  }
  
  setPosition(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
  }
  
  setVelocity(vx: number, vy: number): void {
    this.player.vx = vx;
    this.player.vy = vy;
  }
  
  stopHorizontal(): void {
    this.player.vx = 0;
  }
  
  stopVertical(): void {
    this.player.vy = 0;
  }
  
  getRect(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.player.x - this.player.width / 2,
      y: this.player.y - this.player.height / 2,
      width: this.player.width,
      height: this.player.height,
    };
  }
  
  // Landing on platform - restore ammo and reset combo
  land(platformY: number): void {
    this.player.y = platformY - this.player.height / 2;
    this.player.vy = 0;
    this.player.grounded = true;
    
    // Restore ammo on landing
    this.restoreAmmo();
    
    // Reset combo on landing
    if (this.player.combo > 0) {
      this.resetCombo();
    }
  }
}
