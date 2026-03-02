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
  | "confirm"
  | "error"
  | "forceLight";

interface UIFeedbackConfig {
  haptic?: HapticType;
  sound?: "uiClick";
  forceLightHaptic?: boolean;
}

const UI_FEEDBACK_PRESETS: Record<UIFeedbackPreset, UIFeedbackConfig> = {
  button: { haptic: "light", sound: "uiClick" },
  subtle: { haptic: "light" },
  confirm: { haptic: "medium" },
  error: { haptic: "error" },
  forceLight: { forceLightHaptic: true },
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

  if (config.sound === "uiClick") {
    void AudioManager.playUIClick();
  }
}

export interface ScopedUIFeedback {
  button: () => void;
  subtle: () => void;
  confirm: () => void;
  error: () => void;
  forceLight: () => void;
}

export function createUIFeedback(scope: UIFeedbackScope): ScopedUIFeedback {
  return {
    button: () => playUIFeedback(scope, "button"),
    subtle: () => playUIFeedback(scope, "subtle"),
    confirm: () => playUIFeedback(scope, "confirm"),
    error: () => playUIFeedback(scope, "error"),
    forceLight: () => playUIFeedback(scope, "forceLight"),
  };
}
