import { DOUBLE_TAP_WINDOW } from "./constants";
import { ButtonType, SlotState } from "./types";
import {
  triggerInputDashFeedback,
  triggerInputPressFeedback,
} from "../../feedback/inputFeedback";

interface KeyPreset {
  name: string;
  primaryA: string[];
  primaryB: string[];
  altA: string[];
  altB: string[];
}

// Predefined key binding sets
// Slot 0 (WASD) is reserved for the host player (handled by InputManager)
// Slots 1-3 are for additional local players
const KEY_PRESETS: KeyPreset[] = [
  {
    name: "WASD",
    primaryA: ["KeyA"],
    primaryB: ["KeyD"],
    altA: ["KeyQ"],
    altB: ["KeyE", "KeyW"],
  },
  {
    name: "Arrows",
    primaryA: ["ArrowLeft"],
    primaryB: ["ArrowRight"],
    altA: [],
    altB: ["Space"],
  },
  {
    name: "IJKL",
    primaryA: ["KeyJ"],
    primaryB: ["KeyL"],
    altA: [],
    altB: ["KeyI"],
  },
  {
    name: "Numpad",
    primaryA: ["Numpad4"],
    primaryB: ["Numpad6"],
    altA: [],
    altB: ["Numpad8"],
  },
];

export function getPresetName(slot: number): string {
  return KEY_PRESETS[slot]?.name || `Keys ${slot}`;
}

export function getAllPresets(): { slot: number; name: string }[] {
  return KEY_PRESETS.map((preset, slot) => ({
    slot,
    name: preset.name,
  }));
}

export class KeyBindingsManager {
  private keyToSlot: Map<string, { slot: number; button: ButtonType }> =
    new Map();
  private listenersAttached = false;

  constructor(
    private slots: Map<number, SlotState>,
    private activeSlots: Set<number>,
    private isKeyboardEnabled: () => boolean,
    private isEditableTarget: (target: EventTarget | null) => boolean,
  ) {}

  rebuildKeyMap(allowAltKeys: boolean): void {
    this.keyToSlot.clear();

    for (const slot of this.activeSlots) {
      const preset = KEY_PRESETS[slot];
      if (!preset) continue;

      for (const key of preset.primaryA) {
        this.keyToSlot.set(key, { slot, button: "A" });
      }
      for (const key of preset.primaryB) {
        this.keyToSlot.set(key, { slot, button: "B" });
      }
      if (allowAltKeys) {
        for (const key of preset.altA) {
          this.keyToSlot.set(key, { slot, button: "A" });
        }
        for (const key of preset.altB) {
          this.keyToSlot.set(key, { slot, button: "B" });
        }
      }
    }
  }

  attachListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    window.addEventListener("keydown", (e) => {
      if (!this.isKeyboardEnabled() || this.isEditableTarget(e.target)) {
        return;
      }
      const mapping = this.keyToSlot.get(e.code);
      if (!mapping) return;

      e.preventDefault();
      const state = this.slots.get(mapping.slot);
      if (!state) return;

      if (mapping.button === "A") {
        // Check for double-tap dash
        if (!state.buttonA) {
          const now = performance.now();
          if (now - state.lastButtonATime < DOUBLE_TAP_WINDOW) {
            state.dashPending = true;
            triggerInputDashFeedback();
          }
          state.lastButtonATime = now;
        }
        state.buttonA = true;
      } else {
        state.buttonB = true;
      }

      triggerInputPressFeedback();
    });

    window.addEventListener("keyup", (e) => {
      if (!this.isKeyboardEnabled() || this.isEditableTarget(e.target)) {
        return;
      }
      const mapping = this.keyToSlot.get(e.code);
      if (!mapping) return;

      const state = this.slots.get(mapping.slot);
      if (!state) return;

      if (mapping.button === "A") {
        state.buttonA = false;
      } else {
        state.buttonB = false;
      }
    });
  }
}
