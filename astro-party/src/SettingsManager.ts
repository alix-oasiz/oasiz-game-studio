// ============= SETTINGS MANAGER =============
// Singleton class for managing game settings across all modules

import type { Settings } from "./types";

const STORAGE_KEY = "astro-party-settings";
const DEFAULT_SETTINGS: Settings = {
  music: true,
  fx: true,
  haptics: true,
  controlHints: true,
};

class SettingsManagerClass {
  private settings: Settings;
  private listeners: Set<(settings: Settings) => void> = new Set();

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.log("[SettingsManager] Could not load settings");
    }
    return { ...DEFAULT_SETTINGS };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.log("[SettingsManager] Could not save settings");
    }
  }

  get(): Settings {
    return { ...this.settings };
  }

  set(key: keyof Settings, value: boolean): void {
    this.settings[key] = value;
    this.save();
    this.notifyListeners();
  }

  toggle(key: keyof Settings): boolean {
    this.settings[key] = !this.settings[key];
    this.save();
    this.notifyListeners();
    return this.settings[key];
  }

  isEnabled(key: keyof Settings): boolean {
    return this.settings[key];
  }

  // Subscribe to settings changes
  subscribe(callback: (settings: Settings) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const current = this.get();
    this.listeners.forEach((cb) => cb(current));
  }

  // Helper for triggering haptics with settings check
  triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    if (
      this.settings.haptics &&
      typeof (window as unknown as { triggerHaptic?: (type: string) => void })
        .triggerHaptic === "function"
    ) {
      (
        window as unknown as { triggerHaptic: (type: string) => void }
      ).triggerHaptic(type);
    }
  }

  // Helper for playing sound effects with settings check
  shouldPlayFx(): boolean {
    return this.settings.fx;
  }

  // Helper for playing music with settings check
  shouldPlayMusic(): boolean {
    return this.settings.music;
  }
}

// Export singleton instance
export const SettingsManager = new SettingsManagerClass();
