import { PLAYER_COLORS } from "../../types";
import { DOUBLE_TAP_WINDOW } from "./constants";
import { ButtonType, SlotState, TouchLayout } from "./types";
import {
  triggerInputDashFeedback,
  triggerInputPressFeedback,
} from "../../feedback/inputFeedback";

// Corner assignments for 3-4 player layout.
// Keep this in the same order as shared/sim getSpawnPoints():
// top-left, top-right, bottom-right, bottom-left.
const CORNER_POSITIONS = [
  { corner: "top-left", label: "P1" },
  { corner: "top-right", label: "P2" },
  { corner: "bottom-right", label: "P3" },
  { corner: "bottom-left", label: "P4" },
];

export class TouchZoneManager {
  private touchZoneContainer: HTMLElement | null = null;
  private touchZoneElements: HTMLElement[] = [];
  private managedSlotButtons: Array<{ slot: number; button: ButtonType }> = [];
  private currentLayout: TouchLayout | null = null;
  private lastSetupSignature: string | null = null;
  private activeTouches: Map<number, { slot: number; button: ButtonType }> =
    new Map();
  private readonly handleWindowBlur = (): void => {
    this.forceReleaseAllTouches();
  };
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.forceReleaseAllTouches();
    }
  };
  private readonly handleGlobalTouchRelease = (e: TouchEvent): void => {
    this.reconcileTouches(e.touches);
  };

  constructor(
    private slots: Map<number, SlotState>,
    private isMobile: boolean,
  ) {
    this.touchZoneContainer = document.getElementById("touchZones");
    if (this.isMobile) {
      window.addEventListener("blur", this.handleWindowBlur);
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
      window.addEventListener("touchend", this.handleGlobalTouchRelease, {
        passive: true,
        capture: true,
      });
      window.addEventListener("touchcancel", this.handleGlobalTouchRelease, {
        passive: true,
        capture: true,
      });
    }
  }

  /**
   * Set up touch zones for the given layout and player count.
   * Dynamically creates DOM elements positioned based on layout type.
   *
   * @param layout - 'single' (1 player, bottom buttons), 'dual' (2 players, left/right edges), 'corner' (3-4 players)
   * @param localSlotOrder - Slots in local player order (spawn order)
   * @param slotToColor - Map of slot number to player primary color
   */
  setupTouchZones(
    layout: TouchLayout,
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    if (!this.isMobile || !this.touchZoneContainer) return;
    const bounds = this.getTouchZoneBounds();
    const setupSignature = this.buildSetupSignature(
      layout,
      localSlotOrder,
      slotToColor,
      bounds,
    );
    if (
      setupSignature === this.lastSetupSignature &&
      this.touchZoneElements.length > 0
    ) {
      return;
    }

    // Clear existing zones
    this.destroyTouchZones();
    this.currentLayout = layout;
    this.touchZoneContainer.classList.add("active");

    switch (layout) {
      case "single":
        this.createSingleLayout(localSlotOrder, slotToColor);
        break;
      case "dual":
        this.createDualLayout(localSlotOrder, slotToColor);
        break;
      case "corner":
        this.createCornerLayout(localSlotOrder, slotToColor);
        break;
    }
    this.lastSetupSignature = setupSignature;
  }

  destroyTouchZones(): void {
    this.forceReleaseAllTouches();
    for (const el of this.touchZoneElements) {
      el.remove();
    }
    this.touchZoneElements = [];
    this.managedSlotButtons = [];
    this.activeTouches.clear();
    this.currentLayout = null;
    this.lastSetupSignature = null;

    if (this.touchZoneContainer) {
      this.touchZoneContainer.classList.remove("active");
    }
  }

  getCurrentLayout(): TouchLayout | null {
    return this.currentLayout;
  }

  reset(): void {
    this.forceReleaseAllTouches();
  }

  /**
   * Layout A: Single player - two buttons at bottom of screen
   */
  private createSingleLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const slot = localSlotOrder[0] ?? 0;
    const fallbackColor = PLAYER_COLORS[0].primary;
    const color = slotToColor.get(slot) ?? fallbackColor;

    // Left button (rotate) - bottom left
    this.createTouchZone({
      slot,
      button: "A",
      label: "ROTATE",
      sublabel: "double-tap: dodge",
      color,
      style: {
        left: "20px",
        bottom: "20px",
        width: "38%",
        height: "120px",
        borderRadius: "12px",
      },
    });

    // Right button (fire) - bottom right
    this.createTouchZone({
      slot,
      button: "B",
      label: "FIRE",
      sublabel: "recoil pushes back",
      color,
      style: {
        right: "20px",
        bottom: "20px",
        width: "38%",
        height: "120px",
        borderRadius: "12px",
      },
    });
  }

  /**
   * Layout B: 2 players - controls on left/right edges, stacked vertically
   * Player 1 (slot 0) = left edge (both buttons), Player 2 (slot 1+) = right edge (both buttons)
   */
  private createDualLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const bounds = this.getTouchZoneBounds();
    const width = bounds.width;
    const height = bounds.height;
    const inset = 8;
    const shortSide = Math.min(width, height);
    const availableHeight = height - inset * 2;
    const desiredHeightPx = Math.round(shortSide * 0.4);
    const zoneHeightPx = Math.min(
      desiredHeightPx,
      Math.floor(availableHeight / 2),
    );
    const desiredWidthPx = Math.round(width * 0.25);
    const maxWidthPx = Math.max(0, Math.floor((width - inset * 2) / 2));
    const zoneWidthPx = Math.max(120, Math.min(desiredWidthPx, maxWidthPx));
    const blockHeightPx = zoneHeightPx * 2;
    const blockTopPx =
      inset + Math.max(0, Math.floor((availableHeight - blockHeightPx) / 2));
    const leftSlot = localSlotOrder[0] ?? 0;
    const rightSlot = localSlotOrder[1] ?? 1;

    const leftColor = slotToColor.get(leftSlot) ?? PLAYER_COLORS[0].primary;
    const rightColor = slotToColor.get(rightSlot) ?? PLAYER_COLORS[1].primary;

    // Left player - both buttons on the left edge
    this.createTouchZone({
      slot: leftSlot,
      button: "A",
      label: "ROT",
      sublabel: "2x: dodge",
      color: leftColor,
      style: {
        left: `${inset}px`,
        top: `${blockTopPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
        borderRadius: "12px",
      },
    });
    this.createTouchZone({
      slot: leftSlot,
      button: "B",
      label: "FIRE",
      sublabel: "",
      color: leftColor,
      style: {
        left: `${inset}px`,
        top: `${blockTopPx + zoneHeightPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
        borderRadius: "12px",
      },
    });

    // Right player - both buttons on the right edge (clockwise: FIRE then ROT)
    this.createTouchZone({
      slot: rightSlot,
      button: "B",
      label: "FIRE",
      sublabel: "",
      color: rightColor,
      style: {
        right: `${inset}px`,
        top: `${blockTopPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
        borderRadius: "12px",
      },
    });
    this.createTouchZone({
      slot: rightSlot,
      button: "A",
      label: "ROT",
      sublabel: "2x: dodge",
      color: rightColor,
      style: {
        right: `${inset}px`,
        top: `${blockTopPx + zoneHeightPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
        borderRadius: "12px",
      },
    });
  }

  /**
   * Layout C: 3-4 players - corner controls matching original Astro Party
   * Each corner has 2 buttons on adjacent edges of the arena border
   */
  private createCornerLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const count = Math.min(localSlotOrder.length, 4);
    const bounds = this.getTouchZoneBounds();
    const width = bounds.width;
    const height = bounds.height;
    const inset = 8;
    const gap = 0;

    // Zone sizing: diagonal corner edges (L-shape)
    const shortSide = Math.min(width, height);
    const desiredThicknessPx = Math.round(shortSide * 0.14);
    let edgeThicknessPx = Math.max(24, desiredThicknessPx);
    const desiredEdgeLengthPx = Math.round(shortSide * 0.4);
    const initialAvailableWidth = width - inset * 2 - edgeThicknessPx * 2;
    const initialAvailableHeight = height - inset * 2 - edgeThicknessPx * 2;
    const initialMaxEdgeLengthPx = Math.max(
      0,
      Math.min(
        Math.floor(initialAvailableWidth / 2),
        Math.floor(initialAvailableHeight / 2),
      ),
    );
    let edgeLengthPx = Math.max(
      0,
      Math.min(desiredEdgeLengthPx, initialMaxEdgeLengthPx),
    );
    edgeThicknessPx = Math.max(24, Math.min(edgeThicknessPx, edgeLengthPx));
    const availableWidth = width - inset * 2 - edgeThicknessPx * 2;
    const availableHeight = height - inset * 2 - edgeThicknessPx * 2;
    const maxEdgeLengthPx = Math.max(
      0,
      Math.min(Math.floor(availableWidth / 2), Math.floor(availableHeight / 2)),
    );
    edgeLengthPx = Math.max(0, Math.min(desiredEdgeLengthPx, maxEdgeLengthPx));

    for (let i = 0; i < count; i++) {
      const slot = localSlotOrder[i] ?? i;
      const corner = CORNER_POSITIONS[i];
      const fallbackColor = PLAYER_COLORS[i % PLAYER_COLORS.length].primary;
      const color = slotToColor.get(slot) ?? fallbackColor;

      const isTop = corner.corner.includes("top");
      const isLeft = corner.corner.includes("left");

      const verticalX = isLeft ? inset : width - inset - edgeThicknessPx;
      const verticalY = isTop ? inset : height - inset - edgeLengthPx;
      const horizontalX = isLeft
        ? inset + edgeThicknessPx
        : width - inset - edgeThicknessPx - edgeLengthPx;
      const horizontalY = isTop ? inset : height - inset - edgeThicknessPx;

      const clockwiseEdge: "horizontal" | "vertical" =
        isTop && isLeft
          ? "horizontal"
          : isTop && !isLeft
            ? "vertical"
            : !isTop && isLeft
              ? "vertical"
              : "horizontal";

      const horizontalButton: ButtonType =
        clockwiseEdge === "horizontal" ? "B" : "A";
      const verticalButton: ButtonType =
        clockwiseEdge === "horizontal" ? "A" : "B";

      this.createTouchZone({
        slot,
        button: verticalButton,
        label: verticalButton === "B" ? "FIRE" : "ROT",
        sublabel: "",
        color,
        style: {
          left: `${verticalX}px`,
          top: `${verticalY}px`,
          width: `${edgeThicknessPx}px`,
          height: `${edgeLengthPx}px`,
          borderRadius: "8px",
        },
      });

      this.createTouchZone({
        slot,
        button: horizontalButton,
        label: horizontalButton === "B" ? "FIRE" : "ROT",
        sublabel: "",
        color,
        style: {
          left: `${horizontalX}px`,
          top: `${horizontalY}px`,
          width: `${edgeLengthPx}px`,
          height: `${edgeThicknessPx}px`,
          borderRadius: "8px",
        },
      });
    }
  }

  /**
   * Create a single touch zone DOM element and attach touch listeners
   */
  private createTouchZone(config: {
    slot: number;
    button: ButtonType;
    label: string;
    sublabel: string;
    color: string;
    style: Record<string, string>;
  }): void {
    if (!this.touchZoneContainer) return;

    const zone = document.createElement("div");
    zone.className = "touch-zone";
    zone.dataset.slot = String(config.slot);
    zone.dataset.button = config.button;

    // Apply positioning
    Object.assign(zone.style, config.style);

    // Apply color tint
    zone.style.borderColor = config.color;
    zone.style.color = config.color;
    zone.style.background = config.color + "10";

    // Label
    const label = document.createElement("div");
    label.className = "touch-zone-label";
    label.textContent = config.label;
    zone.appendChild(label);

    if (config.sublabel) {
      const sub = document.createElement("div");
      sub.className = "touch-zone-sublabel";
      sub.textContent = config.sublabel;
      zone.appendChild(sub);
    }
    this.managedSlotButtons.push({ slot: config.slot, button: config.button });

    // Touch event handlers
    zone.addEventListener(
      "touchstart",
      (e) => {
        if (e.cancelable) e.preventDefault();
        // Track each touch individually
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          this.activeTouches.set(touch.identifier, {
            slot: config.slot,
            button: config.button,
          });
        }
        this.updateSlotFromTouch(config.slot, config.button, true);
        zone.classList.add("pressed");
        triggerInputPressFeedback();
      },
      { passive: false },
    );

    zone.addEventListener("touchend", (e) => {
      if (e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.activeTouches.delete(e.changedTouches[i].identifier);
      }
      this.syncSlotButtonsFromActiveTouches();
    });

    zone.addEventListener("touchcancel", (e) => {
      if (e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.activeTouches.delete(e.changedTouches[i].identifier);
      }
      this.syncSlotButtonsFromActiveTouches();
    });

    this.touchZoneContainer.appendChild(zone);
    this.touchZoneElements.push(zone);
  }

  /**
   * Check if any active touch is still targeting this slot+button combination
   */
  private isSlotButtonStillTouched(slot: number, button: ButtonType): boolean {
    for (const mapping of this.activeTouches.values()) {
      if (mapping.slot === slot && mapping.button === button) return true;
    }
    return false;
  }

  /**
   * Update a slot's button state from touch input, including dash detection
   */
  private updateSlotFromTouch(
    slot: number,
    button: ButtonType,
    pressed: boolean,
  ): void {
    const state = this.slots.get(slot);
    if (!state) return;

    if (button === "A") {
      // Dash detection on press (not release)
      if (pressed && !state.buttonA) {
        const now = performance.now();
        if (now - state.lastButtonATime < DOUBLE_TAP_WINDOW) {
          state.dashPending = true;
          triggerInputDashFeedback();
        }
        state.lastButtonATime = now;
      }
      state.buttonA = pressed;
    } else {
      state.buttonB = pressed;
    }
  }

  private buildSetupSignature(
    layout: TouchLayout,
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
    bounds: { width: number; height: number },
  ): string {
    const slotParts = localSlotOrder
      .map((slot) => {
        return slot.toString() + ":" + (slotToColor.get(slot) ?? "");
      })
      .join(",");
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    return layout + "|" + slotParts + "|" + width.toString() + "x" + height.toString();
  }

  private reconcileTouches(touches: TouchList): void {
    if (!this.isMobile || this.activeTouches.size <= 0) {
      return;
    }
    const stillActive = new Set<number>();
    for (let i = 0; i < touches.length; i++) {
      stillActive.add(touches[i].identifier);
    }
    let changed = false;
    for (const identifier of [...this.activeTouches.keys()]) {
      if (!stillActive.has(identifier)) {
        this.activeTouches.delete(identifier);
        changed = true;
      }
    }
    if (changed) {
      this.syncSlotButtonsFromActiveTouches();
    }
  }

  private forceReleaseAllTouches(): void {
    if (this.activeTouches.size <= 0 && this.managedSlotButtons.length <= 0) {
      return;
    }
    this.activeTouches.clear();
    this.syncSlotButtonsFromActiveTouches();
  }

  private syncSlotButtonsFromActiveTouches(): void {
    const seen = new Set<string>();
    for (const mapping of this.managedSlotButtons) {
      const key = mapping.slot.toString() + ":" + mapping.button;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const pressed = this.isSlotButtonStillTouched(mapping.slot, mapping.button);
      this.updateSlotFromTouch(mapping.slot, mapping.button, pressed);
      this.setZonePressedVisual(mapping.slot, mapping.button, pressed);
    }
  }

  private setZonePressedVisual(
    slot: number,
    button: ButtonType,
    pressed: boolean,
  ): void {
    for (const zone of this.touchZoneElements) {
      const zoneSlot = Number(zone.dataset.slot);
      const zoneButton = zone.dataset.button;
      if (zoneSlot !== slot || zoneButton !== button) {
        continue;
      }
      zone.classList.toggle("pressed", pressed);
    }
  }

  private getTouchZoneBounds(): { width: number; height: number } {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const parsePx = (value: string): number => {
      const num = Number.parseFloat(value);
      return Number.isFinite(num) ? num : 0;
    };

    const width = parsePx(styles.getPropertyValue("--box-width"));
    const height = parsePx(styles.getPropertyValue("--box-height"));
    if (width > 0 && height > 0) {
      return { width, height };
    }

    const rect = this.touchZoneContainer?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height };
    }

    return { width: window.innerWidth, height: window.innerHeight };
  }
}
