import { SettingsManager } from "../SettingsManager";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";

export interface SettingsUI {
  updateSettingsUI: () => void;
}

export function createSettingsUI(openLeaveModal: () => void): SettingsUI {
  const feedback = createUIFeedback("settings");

  function updateSettingsUI(): void {
    const settings = SettingsManager.get();
    elements.toggleMusic.classList.toggle("active", settings.music);
    elements.toggleFx.classList.toggle("active", settings.fx);
    elements.toggleHaptics.classList.toggle("active", settings.haptics);
    elements.toggleHints.classList.toggle("active", settings.controlHints);
  }

  function openSettingsModal(): void {
    feedback.subtle();
    elements.settingsModal.classList.add("active");
    elements.settingsBackdrop.classList.add("active");
  }

  function closeSettingsModal(): void {
    elements.settingsModal.classList.remove("active");
    elements.settingsBackdrop.classList.remove("active");
  }

  elements.settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsCenterHotspot.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsLeaveBtn.addEventListener("click", () => {
    closeSettingsModal();
    openLeaveModal();
  });

  elements.settingsBackdrop.addEventListener("click", () => {
    closeSettingsModal();
  });

  elements.settingsClose.addEventListener("click", () => {
    feedback.subtle();
    closeSettingsModal();
  });

  elements.toggleMusic.addEventListener("click", () => {
    SettingsManager.toggle("music");
    updateSettingsUI();
    feedback.subtle();
  });

  elements.toggleFx.addEventListener("click", () => {
    SettingsManager.toggle("fx");
    updateSettingsUI();
    feedback.subtle();
  });

  elements.toggleHaptics.addEventListener("click", () => {
    SettingsManager.toggle("haptics");
    updateSettingsUI();
    feedback.forceLight();
  });

  elements.toggleHints.addEventListener("click", () => {
    SettingsManager.toggle("controlHints");
    updateSettingsUI();
    feedback.subtle();
  });

  return { updateSettingsUI };
}
