import { SettingsManager } from "../SettingsManager";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type NetworkFeedbackEvent = "mineArming" | "mineExplode";

const NETWORK_HAPTIC_PRESETS: Record<NetworkFeedbackEvent, HapticType> = {
  mineArming: "medium",
  mineExplode: "heavy",
};

function triggerNetworkHaptic(event: NetworkFeedbackEvent): void {
  SettingsManager.triggerHaptic(NETWORK_HAPTIC_PRESETS[event]);
}

export function triggerMineArmingFeedback(): void {
  triggerNetworkHaptic("mineArming");
}

export function triggerMineExplodeFeedback(): void {
  triggerNetworkHaptic("mineExplode");
}
