import { GRID_H, GRID_W } from "./constants";
import type { Dir } from "./types";

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

export function idx(x: number, y: number): number {
  return y * GRID_W + x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dirToYaw(dir: Dir): number {
  if (dir === 0) return Math.PI;
  if (dir === 1) return Math.PI / 2;
  if (dir === 2) return 0;
  return -Math.PI / 2;
}
