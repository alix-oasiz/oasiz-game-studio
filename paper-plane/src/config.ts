// ============= CONFIGURATION =============
export const CONFIG = {
  // Player
  PLAYER_Y_RATIO: 0.85,
  PLAYER_WIDTH: 50,
  PLAYER_HEIGHT: 60,
  PLAYER_SPEED: 8,
  PLAYER_FIRE_RATE: 333,

  // Bullets
  BULLET_SPEED: 12,
  BULLET_WIDTH: 6,
  BULLET_HEIGHT: 20,
  BULLET_POOL_SIZE: 200,

  // Asteroids
  ASTEROID_POOL_SIZE: 100,
  ASTEROID_SIZES: {
    large: { radius: 58, health: 4, speed: 2.0, coins: 15 },
    medium: { radius: 42, health: 2, speed: 2.8, coins: 8 },
    small: { radius: 28, health: 1, speed: 3.5, coins: 3 },
  },
  SPAWN_INTERVAL_START: 1800,
  SPAWN_INTERVAL_MIN: 350,

  // Boss
  BOSS_HEALTH: 400,
  BOSS_RADIUS: 120,
  BOSS_THROW_INTERVAL: 3000,
  BOSS_ASTEROID_HEALTH: 10,
  BOSS_MAX_THROWS: 5,
  BOSS_Y_POSITION: 180,

  // Drones
  DRONE_ORBIT_RADIUS: 60,
  DRONE_SIZE: 20,

  // Particles
  PARTICLE_POOL_SIZE: 500,

  // Difficulty
  ASTEROIDS_PER_UPGRADE: 6,
  SPEED_INCREASE_INTERVAL: 60000,
  HEALTH_INCREASE_INTERVAL: 60000,

  // Visual
  BACKGROUND_SCROLL_SPEED: 50,
  GRID_SIZE: 40,

  // Colors
  PAPER_BG: "#f5f5dc",
  GRID_LINE: "#d4d4c4",
  PENCIL_DARK: "#2d2d2d",
  PENCIL_MEDIUM: "#4a4a4a",
  PENCIL_LIGHT: "#6d6d6d",
  COIN_GOLD: "#ffd700",
  FONT_FAMILY: "Caveat, cursive",
} as const;
