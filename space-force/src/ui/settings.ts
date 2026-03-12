import { SettingsManager } from "../SettingsManager";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";
import type { LeaveModalContext } from "./modals";

export interface SettingsUI {
  updateSettingsUI: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  isSettingsModalOpen: () => boolean;
}

export function createSettingsUI(
  openLeaveModal: (context?: LeaveModalContext) => void,
): SettingsUI {
  const feedback = createUIFeedback("settings");

  function updateSettingsUI(): void {
    const settings = SettingsManager.get();
    elements.toggleMusic.classList.toggle("active", settings.music);
    elements.toggleFx.classList.toggle("active", settings.fx);
    elements.toggleHaptics.classList.toggle("active", settings.haptics);
    elements.toggleHints.classList.toggle("active", settings.controlHints);
  }

  function openSettingsModal(): void {
    feedback.button();
    elements.settingsModal.classList.add("active");
    elements.settingsBackdrop.classList.add("active");
  }

  function closeSettingsModal(): void {
    elements.settingsModal.classList.remove("active");
    elements.settingsBackdrop.classList.remove("active");
  }

  function isSettingsModalOpen(): boolean {
    return elements.settingsModal.classList.contains("active");
  }

  elements.settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsCenterHotspot.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsLeaveBtn.addEventListener("click", () => {
    closeSettingsModal();
    openLeaveModal("MATCH_LEAVE");
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
    feedback.button();
  });

  elements.toggleFx.addEventListener("click", () => {
    SettingsManager.toggle("fx");
    updateSettingsUI();
    feedback.button();
  });

  elements.toggleHaptics.addEventListener("click", () => {
    SettingsManager.toggle("haptics");
    updateSettingsUI();
    feedback.forceLight();
  });

  elements.toggleHints.addEventListener("click", () => {
    SettingsManager.toggle("controlHints");
    updateSettingsUI();
    feedback.button();
  });

  return {
    updateSettingsUI,
    openSettingsModal,
    closeSettingsModal,
    isSettingsModalOpen,
  };
}
