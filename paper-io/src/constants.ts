// ─── Map ───
export const MAP_SIZE = 60;
export const MAP_HALF = MAP_SIZE / 2;
export const MAP_RADIUS = MAP_HALF; // circular arena radius
export const PLAYER_SPEED = 10; // units per second
export const TRAIL_SAMPLE_DIST = 0.25;
export const START_RADIUS = 3;
export const START_TERRITORY_SEGMENTS = 32;

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

export const BOT_DIFFICULTY: Record<Difficulty, { maxTrailLen: number; aggression: number; loopSize: number; turnRate: number }> = {
  easy:   { maxTrailLen: 15, aggression: 0.1, loopSize: 8,  turnRate: 2.5 },
  medium: { maxTrailLen: 25, aggression: 0.4, loopSize: 12, turnRate: 3.5 },
  hard:   { maxTrailLen: 40, aggression: 0.8, loopSize: 16, turnRate: 4.5 },
};

// ─── Colors ───
export const PLAYER_COLORS = [
  0x00D4FF, 0xFF4080, 0xFFBB00, 0x44DD88, 0xCC44FF, 0xFF7744,
];

export const PLAYER_COLOR_STRINGS = [
  '#00D4FF', '#FF4080', '#FFBB00', '#44DD88', '#CC44FF', '#FF7744',
];

export const BOARD_COLOR = 0xF2FCF0;  // near-white with a hint of green
export const GRID_LINE_COLOR = 0xE0EEDc; // very faint green-grey grid
export const BG_COLOR = 0xFCFFF9;  // almost pure white

export const TERRITORY_OPACITY = 1.0;
export const TRAIL_OPACITY = 0.85;

// ─── Spawn Points (evenly spaced around circle at radius 20) ───
export const SPAWN_POINTS = (() => {
  const count = 6;
  const r = 20;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return { x: Math.round(Math.cos(angle) * r), z: Math.round(Math.sin(angle) * r) };
  });
})();

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
