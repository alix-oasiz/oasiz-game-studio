import { AudioManager } from "../AudioManager";
import { SettingsManager } from "../SettingsManager";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type MainFlowEvent = "countdownTick" | "countdownFight" | "gameEnd";

const MAIN_FLOW_HAPTIC_PRESETS: Record<MainFlowEvent, HapticType> = {
  countdownTick: "light",
  countdownFight: "medium",
  gameEnd: "success",
};

function triggerMainFlowHaptic(event: MainFlowEvent): void {
  SettingsManager.triggerHaptic(MAIN_FLOW_HAPTIC_PRESETS[event]);
}

export function playCountdownFeedback(count: number): void {
  if (count > 0) {
    triggerMainFlowHaptic("countdownTick");
    void AudioManager.playCountdown(count);
    return;
  }

  triggerMainFlowHaptic("countdownFight");
  void AudioManager.playFight();
}

export function playGameEndFeedback(): void {
  triggerMainFlowHaptic("gameEnd");
}
