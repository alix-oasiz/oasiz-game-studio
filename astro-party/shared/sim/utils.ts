import type { ActiveConfig, BaseGameMode, AdvancedSettings } from "./types.js";
import { STANDARD_CONFIG, SANE_CONFIG, CHAOTIC_CONFIG } from "./constants.js";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle: number): number {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export function getModeBaseConfig(baseMode: BaseGameMode): ActiveConfig {
  if (baseMode === "SANE") return { ...SANE_CONFIG };
  if (baseMode === "CHAOTIC") return { ...CHAOTIC_CONFIG };
  return { ...STANDARD_CONFIG };
}

export function resolveConfigValue(
  preset: AdvancedSettings["rotationPreset"],
  standardValue: number,
  saneValue: number,
  chaoticValue: number,
): number {
  if (preset === "STANDARD") return standardValue;
  if (preset === "SANE") return saneValue;
  return chaoticValue;
}
