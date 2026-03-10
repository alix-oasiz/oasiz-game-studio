import { SettingsManager } from "../SettingsManager";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type InputFeedbackEvent = "press" | "dash";

const INPUT_HAPTIC_PRESETS: Record<InputFeedbackEvent, HapticType> = {
  press: "light",
  dash: "medium",
};

function triggerInputHaptic(event: InputFeedbackEvent): void {
  SettingsManager.triggerHaptic(INPUT_HAPTIC_PRESETS[event]);
}

export function triggerInputPressFeedback(): void {
  triggerInputHaptic("press");
}

export function triggerInputDashFeedback(): void {
  triggerInputHaptic("dash");
}
