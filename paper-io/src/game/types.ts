export type Dir = 0 | 1 | 2 | 3;
export type Phase = "start" | "playing" | "over";
export type HapticType = "light" | "medium" | "heavy" | "success" | "error";
export type SfxName = "tap" | "start" | "claim" | "kill" | "death";

export interface Cell {
  x: number;
  y: number;
}

export interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export interface PersistentState {
  sessions?: number;
}

export interface Entity {
  cellX: number;
  cellY: number;
  dir: Dir;
  nextDir: Dir;
  moveProgress: number;
  trail: Cell[];
  alive: boolean;
  ownerIdx: number;
  name: string;
  isPlayer: boolean;
  homeX: number;
  homeY: number;
  aiState: "idle" | "venture" | "homing";
  aiTimer: number;
  ventureSteps: number;
  respawnTimer: number;
}

export interface ColorTheme {
  name: string;
  territory: string;
  trail: string;
  mesh: string;
  accent: string;
}

declare global {
  interface Window {
    submitScore?: (score: number) => void;
    triggerHaptic?: (type: HapticType) => void;
    loadGameState?: () => Record<string, unknown>;
    saveGameState?: (state: Record<string, unknown>) => void;
    flushGameState?: () => void;
  }
}
