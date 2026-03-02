import { PlayerInput } from "../../types";
import {
  triggerInputDashFeedback,
  triggerInputPressFeedback,
} from "../../feedback/inputFeedback";

const DOUBLE_TAP_WINDOW = 300; // ms

export class InputManager {
  buttonA = false;
  buttonB = false;
  // Dev-only power-up keys (kept isolated for easy removal later)
  private devKeysEnabled = false;
  private devModeEnabled = false; // Toggle for dev visualization mode (key "0")
  private devPowerUpKeys = {
    laser: false,
    shield: false,
    scatter: false,
    mine: false,
    reverse: false,
    joust: false,
    homing: false,
    spawnPowerUp: false,
  };
  private wasButtonA = false;
  private lastButtonATime = 0;
  private onDashDetected: (() => void) | null = null;
  private onDevModeToggle: ((enabled: boolean) => void) | null = null;
  private isMobile: boolean;
  private keyboardEnabled = true;
  private allowAltKeys = true;
  private primaryAKeys = new Set<string>(["KeyA"]);
  private primaryBKeys = new Set<string>(["KeyD"]);
  private altAKeys = new Set<string>(["ArrowLeft"]);
  private altBKeys = new Set<string>(["ArrowRight", "Space"]);
  private isSetup = false;
  private leftZone: HTMLElement | null = null;
  private rightZone: HTMLElement | null = null;
  private readonly touchStartOptions: AddEventListenerOptions = {
    passive: false,
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
      return;
    }
    let handled = false;
    if (this.isButtonAKey(e.code)) {
      e.preventDefault();
      this.buttonA = true;
      handled = true;
    }
    if (this.isButtonBKey(e.code)) {
      e.preventDefault();
      this.buttonB = true;
      handled = true;
    }
    if (this.handleDevKeyDown(e.code)) {
      e.preventDefault();
      handled = true;
    }
    if (!handled) return;
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
      return;
    }
    if (this.isButtonAKey(e.code)) {
      this.buttonA = false;
    }
    if (this.isButtonBKey(e.code)) {
      this.buttonB = false;
    }
    this.handleDevKeyUp(e.code);
  };

  private readonly handleLeftTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.buttonA = true;
    this.leftZone?.classList.add("active");
    triggerInputPressFeedback();
  };

  private readonly handleLeftTouchEnd = (): void => {
    this.buttonA = false;
    this.leftZone?.classList.remove("active");
  };

  private readonly handleLeftTouchCancel = (): void => {
    this.buttonA = false;
    this.leftZone?.classList.remove("active");
  };

  private readonly handleRightTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.buttonB = true;
    this.rightZone?.classList.add("active");
    triggerInputPressFeedback();
  };

  private readonly handleRightTouchEnd = (): void => {
    this.buttonB = false;
    this.rightZone?.classList.remove("active");
  };

  private readonly handleRightTouchCancel = (): void => {
    this.buttonB = false;
    this.rightZone?.classList.remove("active");
  };

  constructor() {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
  }

  setup(): void {
    if (this.isSetup) return;
    this.isSetup = true;
    this.setupKeyboard();
    if (this.isMobile) {
      this.setupTouch();
    }
  }

  destroy(): void {
    if (!this.isSetup) return;
    this.isSetup = false;

    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);

    if (this.leftZone) {
      this.leftZone.removeEventListener(
        "touchstart",
        this.handleLeftTouchStart,
        this.touchStartOptions,
      );
      this.leftZone.removeEventListener("touchend", this.handleLeftTouchEnd);
      this.leftZone.removeEventListener(
        "touchcancel",
        this.handleLeftTouchCancel,
      );
      this.leftZone = null;
    }

    if (this.rightZone) {
      this.rightZone.removeEventListener(
        "touchstart",
        this.handleRightTouchStart,
        this.touchStartOptions,
      );
      this.rightZone.removeEventListener("touchend", this.handleRightTouchEnd);
      this.rightZone.removeEventListener(
        "touchcancel",
        this.handleRightTouchCancel,
      );
      this.rightZone = null;
    }

    this.reset();
  }

  private setupKeyboard(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  private setupTouch(): void {
    this.leftZone = document.getElementById("control-zone-left");
    this.rightZone = document.getElementById("control-zone-right");

    if (this.leftZone) {
      this.leftZone.addEventListener(
        "touchstart",
        this.handleLeftTouchStart,
        this.touchStartOptions,
      );
      this.leftZone.addEventListener("touchend", this.handleLeftTouchEnd);
      this.leftZone.addEventListener("touchcancel", this.handleLeftTouchCancel);
    }

    if (this.rightZone) {
      this.rightZone.addEventListener(
        "touchstart",
        this.handleRightTouchStart,
        this.touchStartOptions,
      );
      this.rightZone.addEventListener("touchend", this.handleRightTouchEnd);
      this.rightZone.addEventListener(
        "touchcancel",
        this.handleRightTouchCancel,
      );
    }
  }

  setDashCallback(callback: () => void): void {
    this.onDashDetected = callback;
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  setAllowAltKeys(allow: boolean): void {
    this.allowAltKeys = allow;
  }

  setDevKeysEnabled(enabled: boolean): void {
    this.devKeysEnabled = enabled;
    if (!enabled) {
      this.resetDevKeys();
    }
  }

  capture(): PlayerInput {
    const now = performance.now();

    // Detect double-tap on Button A for dash
    if (this.buttonA && !this.wasButtonA) {
      if (now - this.lastButtonATime < DOUBLE_TAP_WINDOW) {
        triggerInputDashFeedback();
        this.onDashDetected?.(); // Send RPC immediately
      }
      this.lastButtonATime = now;
    }
    this.wasButtonA = this.buttonA;

    return {
      buttonA: this.buttonA,
      buttonB: this.buttonB,
      timestamp: now,
      clientTimeMs: now,
      inputSequence: 0,
    };
  }

  getIsMobile(): boolean {
    return this.isMobile;
  }

  private isButtonAKey(code: string): boolean {
    if (this.primaryAKeys.has(code)) return true;
    return this.allowAltKeys && this.altAKeys.has(code);
  }

  private isButtonBKey(code: string): boolean {
    if (this.primaryBKeys.has(code)) return true;
    return this.allowAltKeys && this.altBKeys.has(code);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  // Set callback for dev mode toggle
  setDevModeCallback(callback: (enabled: boolean) => void): void {
    this.onDevModeToggle = callback;
  }

  // Toggle dev mode visualization (key "0")
  toggleDevMode(): boolean {
    this.devModeEnabled = !this.devModeEnabled;
    console.log(
      "[Dev] Dev mode visualizers:",
      this.devModeEnabled ? "ON" : "OFF",
    );
    // Notify Game class to update renderer
    this.onDevModeToggle?.(this.devModeEnabled);
    return this.devModeEnabled;
  }

  // Get current dev mode state
  isDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  // Dev keys for testing - returns which dev key was pressed
  consumeDevKeys(): {
    laser: boolean;
    shield: boolean;
    scatter: boolean;
    mine: boolean;
    reverse: boolean;
    joust: boolean;
    homing: boolean;
    spawnPowerUp: boolean;
  } {
    const result = {
      laser: this.devPowerUpKeys.laser,
      shield: this.devPowerUpKeys.shield,
      scatter: this.devPowerUpKeys.scatter,
      mine: this.devPowerUpKeys.mine,
      reverse: this.devPowerUpKeys.reverse,
      joust: this.devPowerUpKeys.joust,
      homing: this.devPowerUpKeys.homing,
      spawnPowerUp: this.devPowerUpKeys.spawnPowerUp,
    };
    this.resetDevKeys();
    return result;
  }

  // Clear all input state (call on round end)
  reset(): void {
    this.buttonA = false;
    this.buttonB = false;
    this.wasButtonA = false;
    this.lastButtonATime = 0;
    this.resetDevKeys();
  }

  private handleDevKeyDown(code: string): boolean {
    if (!this.devKeysEnabled) return false;

    // Dev mode toggle shares same gate as other debug controls
    if (code === "Digit0") {
      this.toggleDevMode();
      return true;
    }

    switch (code) {
      case "Digit1":
        this.devPowerUpKeys.laser = true;
        return true;
      case "Digit2":
        this.devPowerUpKeys.shield = true;
        return true;
      case "Digit3":
        this.devPowerUpKeys.scatter = true;
        return true;
      case "Digit4":
        this.devPowerUpKeys.mine = true;
        return true;
      case "Digit5":
        this.devPowerUpKeys.reverse = true;
        return true;
      case "Digit6":
        this.devPowerUpKeys.joust = true;
        return true;
      case "Digit7":
        this.devPowerUpKeys.homing = true;
        return true;
      case "Digit9":
        this.devPowerUpKeys.spawnPowerUp = true;
        return true;
      default:
        return false;
    }
  }

  private handleDevKeyUp(code: string): void {
    if (!this.devKeysEnabled) return;
    switch (code) {
      case "Digit0":
        // Toggle is handled on keydown
        break;
      case "Digit1":
        this.devPowerUpKeys.laser = false;
        break;
      case "Digit2":
        this.devPowerUpKeys.shield = false;
        break;
      case "Digit3":
        this.devPowerUpKeys.scatter = false;
        break;
      case "Digit4":
        this.devPowerUpKeys.mine = false;
        break;
      case "Digit5":
        this.devPowerUpKeys.reverse = false;
        break;
      case "Digit6":
        this.devPowerUpKeys.joust = false;
        break;
      case "Digit7":
        this.devPowerUpKeys.homing = false;
        break;
      case "Digit9":
        this.devPowerUpKeys.spawnPowerUp = false;
        break;
      default:
        break;
    }
  }

  private resetDevKeys(): void {
    this.devPowerUpKeys.laser = false;
    this.devPowerUpKeys.shield = false;
    this.devPowerUpKeys.scatter = false;
    this.devPowerUpKeys.mine = false;
    this.devPowerUpKeys.reverse = false;
    this.devPowerUpKeys.joust = false;
    this.devPowerUpKeys.homing = false;
    this.devPowerUpKeys.spawnPowerUp = false;
  }
}
