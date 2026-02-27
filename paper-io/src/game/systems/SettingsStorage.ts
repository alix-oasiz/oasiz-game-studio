import type { Settings } from "../types";

const SETTINGS_KEY = "paperio_settings_3d";

const DEFAULT_SETTINGS: Settings = {
  music: true,
  fx: true,
  haptics: true,
};

export function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved) as Partial<Settings>;
    return {
      music: parsed.music !== false,
      fx: parsed.fx !== false,
      haptics: parsed.haptics !== false,
    };
  } catch {
    console.log("[SettingsStorage.loadSettings]", "Using default settings");
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
