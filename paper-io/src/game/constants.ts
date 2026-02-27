import type { ColorTheme, Dir } from "./types";

export const GRID_W = 72;
export const GRID_H = 72;
export const TOTAL_CELLS = GRID_W * GRID_H;
export const BOT_COUNT = 3;
export const MOVE_SPEED = 8.5;
export const PLAYER_INIT_SIZE = 5;
export const BOT_INIT_SIZE = 4;
export const BOT_IDLE_MIN = 0.8;
export const BOT_IDLE_MAX = 2.2;
export const BOT_VENTURE_MIN = 10;
export const BOT_VENTURE_MAX = 22;
export const BOT_MAX_TRAIL = 22;
export const BOT_RESPAWN_TIME = 1.6;
export const CAMERA_LERP = 7;
export const BOARD_CELL_PIXELS = 8;

export const DIR_DX: Record<Dir, number> = { 0: 0, 1: 1, 2: 0, 3: -1 };
export const DIR_DY: Record<Dir, number> = { 0: -1, 1: 0, 2: 1, 3: 0 };
export const OPPOSITE: Record<Dir, Dir> = { 0: 2, 1: 3, 2: 0, 3: 1 };
export const CW: Record<Dir, Dir> = { 0: 1, 1: 2, 2: 3, 3: 0 };
export const CCW: Record<Dir, Dir> = { 0: 3, 1: 0, 2: 1, 3: 2 };

export const COLORS: ColorTheme[] = [
  {
    name: "You",
    territory: "#3f7cff",
    trail: "#8ab0ff",
    mesh: "#4c86ff",
    accent: "#b9d0ff",
  },
  {
    name: "Razor",
    territory: "#ff5244",
    trail: "#ff9d95",
    mesh: "#ff5d4e",
    accent: "#ffc7c1",
  },
  {
    name: "Blitz",
    territory: "#35b970",
    trail: "#84dfac",
    mesh: "#46c57e",
    accent: "#c6f7da",
  },
  {
    name: "Nova",
    territory: "#bb5fff",
    trail: "#e0afff",
    mesh: "#c875ff",
    accent: "#efd1ff",
  },
];

export const BOT_NAMES = ["Razor", "Blitz", "Nova"];
