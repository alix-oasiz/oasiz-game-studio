/**
 * DOWNWELL - Configuration
 * 
 * Shared game configuration constants.
 */

export const CONFIG = {
  DOWNWELL_MODE: true,

  // Internal resolution (scaled to viewport)
  INTERNAL_WIDTH: 448,
  INTERNAL_HEIGHT: 640,
  
  // Well structure
  WALL_WIDTH: 32,           // Minimum wall thickness (1 block, always present)
  WALL_BLOCK_SIZE: 32,      // Size of wall blocks
  WALL_MIN_BLOCKS: 2,       // Minimum wall blocks from edge (always present)
  WALL_MAX_BLOCKS: 4,       // Maximum wall protrusion in blocks at cluster peaks
  WALL_CLUSTERS_MIN: 2,     // Min organic clusters per side per chunk
  WALL_CLUSTERS_MAX: 4,     // Max organic clusters per side per chunk
  PLATFORM_HEIGHT: 16,
  MIN_PLATFORM_WIDTH: 40,
  MAX_PLATFORM_WIDTH: 120,
  
  // Downwell-style floor generation
  GAP_MIN_BLOCKS: 2,        // Minimum gap width in blocks
  GAP_MAX_BLOCKS: 3,        // Maximum gap width in blocks
  FULL_FLOOR_CHANCE: 0.08,  // Chance of a floor with no pre-made gap (must shoot through)
  
  // Player
  PLAYER_WIDTH: 20,
  PLAYER_HEIGHT: 28,
  PLAYER_SPEED: 4,
  PLAYER_GRAVITY: 0.65,
  PLAYER_JUMP_FORCE: -10,
  PLAYER_MAX_FALL_SPEED: 14,
  PLAYER_RECOIL: -24,
  PLAYER_BOUNCE_FORCE: -8,
  PLAYER_MAX_HP: 4,
  PLAYER_MAX_AMMO: 8,
  PLAYER_INVULNERABLE_FRAMES: 24,

  // Wall slide & wall/rolling jump
  WALL_SLIDE_MAX_SPEED: 2,       // max downward speed while wall sliding
  WALL_JUMP_VY: -12,             // upward force for wall jump (stronger than normal -10)
  WALL_JUMP_VX: 5,               // horizontal kick away from wall on wall jump
  ROLLING_JUMP_VY: -13,          // upward force for rolling jump (higher than normal -10)
  ROLLING_JUMP_VX_BONUS: 2,      // extra forward speed during rolling jump arc
  ROLLING_JUMP_ANIM_FRAMES: 30,  // frames the rolling jump animation plays for
  
  // Shooting
  BULLET_SPEED: 12,
  BULLET_WIDTH: 6,
  BULLET_HEIGHT: 12,
  SHOOT_COOLDOWN: 8,
  BULLETS_PER_SHOT: 1,
  BULLET_SPREAD: 15,
  
  // Enemies
  ENEMY_BASE_HP: 1,
  ENEMY_SPEED_STATIC: 0,
  ENEMY_SPEED_HORIZONTAL: 2,
  ENEMY_SPEED_EXPLODER: 1,
  
  // Level generation
  CHUNK_HEIGHT: 640,
  PLATFORMS_PER_CHUNK: 4,
  BREAKABLE_CHUNKS_PER_CHUNK: 2,
  BREAKABLE_CHUNK_MIN_BLOCKS: 2,
  BREAKABLE_CHUNK_MAX_BLOCKS: 8,
  ONE_WAY_PLATFORMS_PER_CHUNK: 0,
  ONE_WAY_PLATFORM_THICKNESS: 8,
  ONE_WAY_PLATFORM_MAX_BLOCKS: 3,
  GUARANTEED_CLEAR_PATH_BLOCKS: 2,
  MID_BREAKABLE_ISLANDS_PER_CHUNK: 1,
  FALL_OBSTACLE_MAX_SECONDS: 3,
  CATCH_SHELF_SPACING_PX: 1400,
  ENEMIES_PER_CHUNK: 5,
  GEMS_PER_CHUNK: 3,
  SAFE_PATH_WIDTH: 80,
  SIDE_MASS_INTERVAL_METERS: 24,
  SIDE_MASS_INTERVAL_JITTER_METERS: 4,
  SIDE_MASS_SPAWN_CHANCE: 0.28,
  SIDE_MASS_MAX_WIDTH_BLOCKS: 3,
  SIDE_MASS_LONG_WIDTH_CHANCE: 0.3,
  
  // Combo system
  COMBO_TIMEOUT: 120, // frames (2 seconds at 60fps)
  COMBO_MULTIPLIER_MAX: 10,
  
  // Scoring
  SCORE_PER_ENEMY: 10,
  SCORE_PER_GEM: 5,
  SCORE_PER_DEPTH: 1,
  
  // Camera
  CAMERA_LOOKAHEAD: 100,
  CAMERA_SMOOTHING: 0.1,
  
  // Dithering
  DITHER_PIXEL_SIZE: 2,      // Size of dither pixels (1 = full res, 2 = chunky, 3+ = very chunky)
  DITHER_STRENGTH: 0,      // Strength of dither effect (0.0 = no dither, 1.0 = full dither)
  
  // Powerups
  POWERUP_SPAWN_DEPTH_INTERVAL: 100,  // Spawn powerup every N meters
  POWERUP_DURATION_FRAMES: 600,       // Powerup duration (frames, 600 = 10 seconds at 60fps)
};
