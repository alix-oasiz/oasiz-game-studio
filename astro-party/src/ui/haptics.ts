import { SettingsManager } from "../SettingsManager";

export type HapticType = "light" | "medium" | "heavy" | "success" | "error";

export function triggerHaptic(type: HapticType): void {
  SettingsManager.triggerHaptic(type);
}

export function forceLightHaptic(): void {
  if (
    typeof (window as unknown as { triggerHaptic?: (type: string) => void })
      .triggerHaptic === "function"
  ) {
    (
      window as unknown as { triggerHaptic: (type: string) => void }
    ).triggerHaptic("light");
  }
}
