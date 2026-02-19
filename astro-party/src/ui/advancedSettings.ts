import { Game } from "../Game";
import {
  AdvancedSettings,
  AsteroidDensity,
  DashPreset,
  GameMode,
  ModePreset,
  SpeedPreset,
} from "../types";
import { AudioManager } from "../AudioManager";
import { triggerHaptic } from "./haptics";
import { elements } from "./elements";

type SettingsTab = "elements" | "physics";

const ASTEROID_ORDER: AsteroidDensity[] = ["NONE", "SOME", "MANY", "SPAWN"];
const SPEED_ORDER: SpeedPreset[] = ["SLOW", "NORMAL", "FAST"];
const DASH_ORDER: DashPreset[] = ["LOW", "NORMAL", "HIGH"];
const MODE_PRESET_ORDER: ModePreset[] = ["STANDARD", "SANE", "CHAOTIC"];

function nextInCycle<T>(list: T[], current: T): T {
  const index = list.indexOf(current);
  if (index === -1) return list[0];
  return list[(index + 1) % list.length];
}

function labelAsteroids(value: AsteroidDensity): string {
  if (value === "NONE") return "None";
  if (value === "MANY") return "Many";
  if (value === "SPAWN") return "Spawn";
  return "Some";
}

function labelSpeed(value: SpeedPreset): string {
  if (value === "SLOW") return "Slow";
  if (value === "FAST") return "Fast";
  return "Normal";
}

function labelDash(value: DashPreset): string {
  if (value === "LOW") return "Low";
  if (value === "HIGH") return "High";
  return "Normal";
}

type PresetLabelKey =
  | "rotation"
  | "rotationBoost"
  | "recoil"
  | "shipRestitution"
  | "shipAir"
  | "wallRestitution"
  | "wallFriction"
  | "shipFriction"
  | "angularDamping";

const PRESET_LABELS: Record<PresetLabelKey, Record<ModePreset, string>> = {
  rotation: { STANDARD: "Standard", SANE: "Sane", CHAOTIC: "Chaotic" },
  rotationBoost: { STANDARD: "Off", SANE: "Sane", CHAOTIC: "Chaotic" },
  recoil: { STANDARD: "Off", SANE: "Sane", CHAOTIC: "Chaotic" },
  shipRestitution: { STANDARD: "None", SANE: "Sane", CHAOTIC: "Chaotic" },
  shipAir: { STANDARD: "None", SANE: "Sane", CHAOTIC: "Chaotic" },
  wallRestitution: { STANDARD: "None", SANE: "Sane", CHAOTIC: "Chaotic" },
  wallFriction: { STANDARD: "Low", SANE: "High", CHAOTIC: "None" },
  shipFriction: { STANDARD: "Low", SANE: "High", CHAOTIC: "None" },
  angularDamping: { STANDARD: "High", SANE: "Medium", CHAOTIC: "None" },
};

function labelPreset(key: PresetLabelKey, value: ModePreset): string {
  return PRESET_LABELS[key][value];
}

function labelGameMode(value: GameMode): string {
  if (value === "CUSTOM") return "Custom";
  return labelPreset("rotation", value);
}

export interface AdvancedSettingsUI {
  updateAdvancedSettingsUI: (settings?: AdvancedSettings) => void;
}

export function createAdvancedSettingsUI(game: Game): AdvancedSettingsUI {
  let activeTab: SettingsTab = "elements";

  function setActiveTab(tab: SettingsTab): void {
    activeTab = tab;
    elements.advancedTabElements.classList.toggle("active", tab === "elements");
    elements.advancedTabPhysics.classList.toggle("active", tab === "physics");
    elements.advancedPanelElements.classList.toggle(
      "active",
      tab === "elements",
    );
    elements.advancedPanelPhysics.classList.toggle("active", tab === "physics");
  }

  function openModal(): void {
    if (!game.isLeader()) return;
    triggerHaptic("light");
    elements.advancedSettingsModal.classList.add("active");
    elements.advancedSettingsBackdrop.classList.add("active");
  }

  function closeModal(): void {
    elements.advancedSettingsModal.classList.remove("active");
    elements.advancedSettingsBackdrop.classList.remove("active");
  }

  function updateAdvancedSettingsUI(settings?: AdvancedSettings): void {
    const current = settings ?? game.getAdvancedSettings();
    elements.asteroidsCycle.textContent = labelAsteroids(
      current.asteroidDensity,
    );
    elements.startPowerupsToggle.textContent = current.startPowerups
      ? "On"
      : "Off";
    elements.startPowerupsToggle.classList.toggle(
      "active",
      current.startPowerups,
    );
    elements.roundsCycle.textContent = String(current.roundsToWin);
    elements.shipSpeedCycle.textContent = labelSpeed(current.shipSpeed);
    elements.dashPowerCycle.textContent = labelDash(current.dashPower);
    elements.rotationPresetCycle.textContent = labelPreset(
      "rotation",
      current.rotationPreset,
    );
    elements.rotationBoostCycle.textContent = labelPreset(
      "rotationBoost",
      current.rotationBoostPreset,
    );
    elements.recoilPresetCycle.textContent = labelPreset(
      "recoil",
      current.recoilPreset,
    );
    elements.shipRestitutionCycle.textContent = labelPreset(
      "shipRestitution",
      current.shipRestitutionPreset,
    );
    elements.shipFrictionAirCycle.textContent = labelPreset(
      "shipAir",
      current.shipFrictionAirPreset,
    );
    elements.wallRestitutionCycle.textContent = labelPreset(
      "wallRestitution",
      current.wallRestitutionPreset,
    );
    elements.wallFrictionCycle.textContent = labelPreset(
      "wallFriction",
      current.wallFrictionPreset,
    );
    elements.shipFrictionCycle.textContent = labelPreset(
      "shipFriction",
      current.shipFrictionPreset,
    );
    elements.angularDampingCycle.textContent = labelPreset(
      "angularDamping",
      current.angularDampingPreset,
    );
  }

  function applySettings(update: Partial<AdvancedSettings>): void {
    const current = game.getAdvancedSettings();
    const next = { ...current, ...update };
    game.setAdvancedSettings(next, "local");
    updateAdvancedSettingsUI(next);
  }

  elements.advancedSettingsBtn.addEventListener("click", () => {
    if (!game.isLeader()) return;
    AudioManager.playUIClick();
    openModal();
  });

  elements.advancedSettingsBackdrop.addEventListener("click", () => {
    closeModal();
  });

  elements.advancedSettingsClose.addEventListener("click", () => {
    AudioManager.playUIClick();
    triggerHaptic("light");
    closeModal();
  });

  elements.advancedSettingsDone.addEventListener("click", () => {
    AudioManager.playUIClick();
    triggerHaptic("light");
    closeModal();
  });

  elements.advancedTabElements.addEventListener("click", () => {
    AudioManager.playUIClick();
    triggerHaptic("light");
    setActiveTab("elements");
  });

  elements.advancedTabPhysics.addEventListener("click", () => {
    AudioManager.playUIClick();
    triggerHaptic("light");
    setActiveTab("physics");
  });

  elements.asteroidsCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().asteroidDensity;
    applySettings({ asteroidDensity: nextInCycle(ASTEROID_ORDER, current) });
  });

  elements.startPowerupsToggle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().startPowerups;
    applySettings({ startPowerups: !current });
  });

  elements.roundsCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().roundsToWin;
    const next = current >= 6 ? 3 : current + 1;
    applySettings({ roundsToWin: next });
  });

  elements.shipSpeedCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().shipSpeed;
    applySettings({ shipSpeed: nextInCycle(SPEED_ORDER, current) });
  });

  elements.dashPowerCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().dashPower;
    applySettings({ dashPower: nextInCycle(DASH_ORDER, current) });
  });

  elements.rotationPresetCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().rotationPreset;
    applySettings({ rotationPreset: nextInCycle(MODE_PRESET_ORDER, current) });
  });

  elements.rotationBoostCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().rotationBoostPreset;
    applySettings({
      rotationBoostPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.recoilPresetCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().recoilPreset;
    applySettings({ recoilPreset: nextInCycle(MODE_PRESET_ORDER, current) });
  });

  elements.shipRestitutionCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().shipRestitutionPreset;
    applySettings({
      shipRestitutionPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.shipFrictionAirCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().shipFrictionAirPreset;
    applySettings({
      shipFrictionAirPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.wallRestitutionCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().wallRestitutionPreset;
    applySettings({
      wallRestitutionPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.wallFrictionCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().wallFrictionPreset;
    applySettings({
      wallFrictionPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.shipFrictionCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().shipFrictionPreset;
    applySettings({
      shipFrictionPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  elements.angularDampingCycle.addEventListener("click", () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    const current = game.getAdvancedSettings().angularDampingPreset;
    applySettings({
      angularDampingPreset: nextInCycle(MODE_PRESET_ORDER, current),
    });
  });

  setActiveTab(activeTab);
  updateAdvancedSettingsUI();

  return { updateAdvancedSettingsUI };
}
