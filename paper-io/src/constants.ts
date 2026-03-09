// ─── Map ───
export const MAP_SIZE = 120;
export const MAP_HALF = MAP_SIZE / 2;
export const MAP_RADIUS = MAP_HALF; // circular arena radius
export const PLAYER_SPEED = 8; // units per second
export const TRAIL_SAMPLE_DIST = 0.12;
export const TRAIL_HIT_RADIUS = 0.3;
export const START_RADIUS = 3;
export const START_TERRITORY_SEGMENTS = 64;

// ─── Directions ───
export enum Direction {
  UP = "UP",
  DOWN = "DOWN",
  LEFT = "LEFT",
  RIGHT = "RIGHT",
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
  EXPAND = "EXPAND",
  RETURN_HOME = "RETURN_HOME",
  FLEE = "FLEE",
  ATTACK_TRAIL = "ATTACK_TRAIL",
  DEFEND_BORDER = "DEFEND_BORDER",
  HUNT_WEAK_PLAYER = "HUNT_WEAK_PLAYER",
}

export type Difficulty = "easy" | "medium" | "hard";

export const BOT_DIFFICULTY: Record<
  Difficulty,
  {
    maxTrailLen: number;
    aggression: number;
    loopSize: number;
    turnRate: number;
  }
> = {
  easy: { maxTrailLen: 15, aggression: 0.1, loopSize: 8, turnRate: 3.4 },
  medium: { maxTrailLen: 25, aggression: 0.4, loopSize: 12, turnRate: 4.6 },
  hard: { maxTrailLen: 40, aggression: 0.8, loopSize: 16, turnRate: 5.8 },
};

// ─── Colors ───
export const PLAYER_COLORS = [
  0x00d4ff, 0xff4080, 0xffbb00, 0x44dd88, 0xcc44ff, 0xff7744,
];

export const PLAYER_COLOR_STRINGS = [
  "#00D4FF",
  "#FF4080",
  "#FFBB00",
  "#44DD88",
  "#CC44FF",
  "#FF7744",
];

export const BOARD_COLOR = 0xf2fcf0; // near-white with a hint of green
export const GRID_LINE_COLOR = 0xe0eedc; // very faint green-grey grid
export const BG_COLOR = 0xfcfff9; // almost pure white

export const TERRITORY_OPACITY = 1.0;
export const TRAIL_OPACITY = 0.85;

// ─── Spawn Points (evenly spaced around circle at radius 20) ───
export const SPAWN_POINTS = (() => {
  const count = 6;
  const r = 20;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return {
      x: Math.round(Math.cos(angle) * r),
      z: Math.round(Math.sin(angle) * r),
    };
  });
})();

export const PLAYER_NAMES = [
  "You",
  "Bot 1",
  "Bot 2",
  "Bot 3",
  "Bot 4",
  "Bot 5",
];

export const BOT_NAMES = [
  "Ace",
  "Blaze",
  "Cleo",
  "Dash",
  "Echo",
  "Finn",
  "Glow",
  "Hawk",
  "Iris",
  "Jade",
  "Knox",
  "Luna",
  "Milo",
  "Nova",
  "Onyx",
  "Pike",
  "Quinn",
  "Raze",
  "Sage",
  "Trix",
  "Ursa",
  "Vex",
  "Wren",
  "Xeno",
  "Yuki",
  "Zara",
  "Bolt",
  "Chip",
  "Dex",
  "Eve",
  "Flux",
  "Grit",
  "Hex",
  "Ivy",
  "Jett",
  "Koda",
  "Lynx",
  "Mars",
  "Nyx",
  "Opal",
  "Pixel",
  "Rook",
  "Sky",
  "Thor",
  "Uma",
  "Volt",
  "Wolf",
  "Zed",
  "Rex",
  "Kai",
];

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
