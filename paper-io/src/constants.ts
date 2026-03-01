// ─── Map ───
export const MAP_SIZE = 60;
export const MAP_HALF = MAP_SIZE / 2;
export const PLAYER_SPEED = 10; // units per second
export const TRAIL_SAMPLE_DIST = 0.4;
export const START_RADIUS = 3;
export const START_TERRITORY_SEGMENTS = 16;

// ─── Directions ───
export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export const DIRECTION_VEC: Record<Direction, { dx: number; dz: number }> = {
  [Direction.UP]: { dx: 0, dz: -1 },
  [Direction.DOWN]: { dx: 0, dz: 1 },
  [Direction.LEFT]: { dx: -1, dz: 0 },
  [Direction.RIGHT]: { dx: 1, dz: 0 },
};

export const OPPOSITE_DIR: Record<Direction, Direction> = {
  [Direction.UP]: Direction.DOWN,
  [Direction.DOWN]: Direction.UP,
  [Direction.LEFT]: Direction.RIGHT,
  [Direction.RIGHT]: Direction.LEFT,
};

// ─── Bot AI ───
export enum BotBehavior {
  EXPAND = 'EXPAND',
  RETURN_HOME = 'RETURN_HOME',
  FLEE = 'FLEE',
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export const BOT_DIFFICULTY: Record<Difficulty, { maxTrailLen: number; aggression: number; loopSize: number }> = {
  easy: { maxTrailLen: 6, aggression: 0.1, loopSize: 5 },
  medium: { maxTrailLen: 12, aggression: 0.4, loopSize: 8 },
  hard: { maxTrailLen: 20, aggression: 0.8, loopSize: 12 },
};

// ─── Colors ───
export const PLAYER_COLORS = [
  0x00E5FF, 0xFF3D71, 0xFFAA00, 0x00E096, 0xA259FF, 0xFF6B35,
];

export const PLAYER_COLOR_STRINGS = [
  '#00E5FF', '#FF3D71', '#FFAA00', '#00E096', '#A259FF', '#FF6B35',
];

export const BOARD_COLOR = 0x0D0D12;
export const GRID_LINE_COLOR = 0x1A1A28;
export const BG_COLOR = 0x07070F;

export const TERRITORY_OPACITY = 0.55;
export const TRAIL_OPACITY = 0.85;

// ─── Spawn Points (world coordinates, centered on origin) ───
export const SPAWN_POINTS = [
  { x: -20, z: -20 },
  { x: 20, z: -20 },
  { x: -20, z: 20 },
  { x: 20, z: 20 },
  { x: 0, z: -20 },
  { x: 0, z: 20 },
];

export const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5'];

// ─── Vec2 helpers ───
export interface Vec2 {
  x: number;
  z: number;
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(dist2(a, b));
}
