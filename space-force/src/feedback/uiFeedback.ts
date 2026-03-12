import { AudioManager } from "../AudioManager";
import type { HapticType } from "../ui/haptics";
import { forceLightHaptic, triggerHaptic } from "../ui/haptics";

export type UIFeedbackScope =
  | "startScreen"
  | "lobby"
  | "settings"
  | "advancedSettings"
  | "modals"
  | "endScreen";

export type UIFeedbackPreset =
  | "button"
  | "subtle"
  | "negative"
  | "confirm"
  | "error"
  | "forceLight";

interface UIFeedbackConfig {
  haptic?: HapticType;
  sound?: "uiClickPositive" | "uiClickNegative";
  forceLightHaptic?: boolean;
}

const UI_FEEDBACK_PRESETS: Record<UIFeedbackPreset, UIFeedbackConfig> = {
  button: { haptic: "light", sound: "uiClickPositive" },
  subtle: { haptic: "light", sound: "uiClickNegative" },
  negative: { haptic: "light", sound: "uiClickNegative" },
  confirm: { haptic: "medium", sound: "uiClickPositive" },
  error: { haptic: "error", sound: "uiClickNegative" },
  forceLight: { forceLightHaptic: true, sound: "uiClickPositive" },
};

const UI_FEEDBACK_OVERRIDES: Partial<
  Record<UIFeedbackScope, Partial<Record<UIFeedbackPreset, UIFeedbackConfig>>>
> = {};

function getFeedbackConfig(
  scope: UIFeedbackScope,
  preset: UIFeedbackPreset,
): UIFeedbackConfig {
  const presetConfig = UI_FEEDBACK_PRESETS[preset];
  const scopedOverride = UI_FEEDBACK_OVERRIDES[scope]?.[preset];
  if (!scopedOverride) {
    return presetConfig;
  }
  return { ...presetConfig, ...scopedOverride };
}

export function playUIFeedback(
  scope: UIFeedbackScope,
  preset: UIFeedbackPreset,
): void {
  const config = getFeedbackConfig(scope, preset);
  if (config.forceLightHaptic) {
    forceLightHaptic();
  } else if (config.haptic) {
    triggerHaptic(config.haptic);
  }

  if (config.sound === "uiClickPositive") {
    void AudioManager.playUIClickPositive();
  } else if (config.sound === "uiClickNegative") {
    void AudioManager.playUIClickNegative();
  }
}

export interface ScopedUIFeedback {
  button: () => void;
  subtle: () => void;
  negative: () => void;
  confirm: () => void;
  error: () => void;
  forceLight: () => void;
}

export function createUIFeedback(scope: UIFeedbackScope): ScopedUIFeedback {
  return {
    button: () => playUIFeedback(scope, "button"),
    subtle: () => playUIFeedback(scope, "subtle"),
    negative: () => playUIFeedback(scope, "negative"),
    confirm: () => playUIFeedback(scope, "confirm"),
    error: () => playUIFeedback(scope, "error"),
    forceLight: () => playUIFeedback(scope, "forceLight"),
  };
}
