// ============= MULTI INPUT MANAGER =============
// Handles multiple keyboard input sets for local multiplayer
// Also manages mobile touch zones for local multiplayer on a single device

import { PlayerInput } from "../../types";
import {
  getAllPresets,
  getPresetName,
  KeyBindingsManager,
} from "./keyBindings";
import { TouchZoneManager } from "./touchZones";
import { SlotState, TouchLayout } from "./types";

export type { TouchLayout } from "./types";

export class MultiInputManager {
  private slots: Map<number, SlotState> = new Map();
  private activeSlots: Set<number> = new Set();
  private keyboardEnabled = true;
  private allowAltKeys = true;
  private isMobile: boolean;

  private keyBindings: KeyBindingsManager;
  private touchZones: TouchZoneManager;

  constructor() {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Initialize state for all 4 slots
    for (let i = 0; i < 4; i++) {
      this.slots.set(i, {
        buttonA: false,
        buttonB: false,
        wasButtonA: false,
        lastButtonATime: 0,
        dashPending: false,
      });
    }

    this.keyBindings = new KeyBindingsManager(
      this.slots,
      this.activeSlots,
      () => this.keyboardEnabled,
      (target) => this.isEditableTarget(target),
    );
    this.touchZones = new TouchZoneManager(this.slots, this.isMobile);
  }

  // Activate a slot for a local player
  activateSlot(slot: number): void {
    if (slot < 0 || slot >= 4) return;
    this.activeSlots.add(slot);
    this.keyBindings.rebuildKeyMap(this.allowAltKeys);

    if (!this.isMobile) {
      this.keyBindings.attachListeners();
    }
  }

  // Deactivate a slot when player is removed
  deactivateSlot(slot: number): void {
    this.activeSlots.delete(slot);
    this.keyBindings.rebuildKeyMap(this.allowAltKeys);

    // Reset slot state
    const state = this.slots.get(slot);
    if (state) {
      state.buttonA = false;
      state.buttonB = false;
      state.dashPending = false;
    }
  }

  // ============= TOUCH ZONE MANAGEMENT =============

  setupTouchZones(
    layout: TouchLayout,
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
    slotToCornerIndex?: Map<number, number>,
  ): void {
    this.touchZones.setupTouchZones(layout, localSlotOrder, slotToColor, slotToCornerIndex);
  }

  destroyTouchZones(): void {
    this.touchZones.destroyTouchZones();
  }

  getCurrentLayout(): TouchLayout | null {
    return this.touchZones.getCurrentLayout();
  }

  updateSingleLayoutIcons(playerState: import("../../../shared/sim/types").PlayerState): void {
    this.touchZones.updateSingleLayoutIcons(playerState);
  }

  // ============= INPUT CAPTURE =============

  // Capture input for a specific slot
  capture(slot: number): PlayerInput {
    const state = this.slots.get(slot);
    if (!state || !this.activeSlots.has(slot)) {
      return {
        buttonA: false,
        buttonB: false,
        timestamp: 0,
        clientTimeMs: 0,
        inputSequence: 0,
      };
    }

    // Track wasButtonA for dash detection
    state.wasButtonA = state.buttonA;

    return {
      buttonA: state.buttonA,
      buttonB: state.buttonB,
      timestamp: performance.now(),
      clientTimeMs: performance.now(),
      inputSequence: 0,
    };
  }

  // Consume pending dash for a slot (returns true once then resets)
  consumeDash(slot: number): boolean {
    const state = this.slots.get(slot);
    if (!state) return false;

    const dash = state.dashPending;
    state.dashPending = false;
    return dash;
  }

  // Get the display name for a key preset
  static getPresetName(slot: number): string {
    return getPresetName(slot);
  }

  // Get all preset names
  static getAllPresets(): { slot: number; name: string }[] {
    return getAllPresets();
  }

  // Reset all input state
  reset(): void {
    for (const state of this.slots.values()) {
      state.buttonA = false;
      state.buttonB = false;
      state.wasButtonA = false;
      state.dashPending = false;
    }
    this.touchZones.reset();
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  setAllowAltKeys(allow: boolean): void {
    this.allowAltKeys = allow;
    this.keyBindings.rebuildKeyMap(this.allowAltKeys);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }
}
