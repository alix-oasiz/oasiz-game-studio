import { SettingsManager } from "../SettingsManager";
import { triggerHaptic as triggerPlatformHaptic } from "../platform/oasizBridge";

export type HapticType = "light" | "medium" | "heavy" | "success" | "error";

export function triggerHaptic(type: HapticType): void {
  SettingsManager.triggerHaptic(type);
}

export function forceLightHaptic(): void {
  if (typeof window.matchMedia !== "function") return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  triggerPlatformHaptic("light");
}
