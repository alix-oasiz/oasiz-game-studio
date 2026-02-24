import type { GameState, HapticType } from "./config";
import { $ } from "./utils";

export interface InputState {
  left: boolean;
  right: boolean;
  touchLeftId: number | null;
  touchRightId: number | null;
}

type TapCallback = () => void;

/**
 * Sets up all input listeners (keyboard, touch, mobile buttons).
 * Returns the mutable input state object that the game reads each frame.
 */
export function initInput(
  getState: () => GameState,
  onTap: TapCallback,
  haptic: (type: HapticType) => void,
  isForcedLandscape: () => boolean,
): InputState {
  const input: InputState = {
    left: false,
    right: false,
    touchLeftId: null,
    touchRightId: null,
  };

  const isUI = (e: Event) =>
    !!(e.target as HTMLElement).closest(
      ".modal-card,.icon-btn,.setting-row,.settings-list,.ctrl-btn,.shop-btn,.shop-container,#shopModal,#rotateBtn,.rotate-btn",
    );

  const handleTap = (e: Event) => {
    if (isUI(e)) return;
    const state = getState();
    if (state === "START" || state === "GAME_OVER") {
      onTap();
    }
  };

  /* Mouse */
  window.addEventListener("mousedown", handleTap);

  const clearTouchSteering = (touchId: number): void => {
    if (input.touchLeftId === touchId) {
      input.touchLeftId = null;
      input.left = false;
    }
    if (input.touchRightId === touchId) {
      input.touchRightId = null;
      input.right = false;
    }
  };

  const isTouchOnLeft = (touch: Touch): boolean => {
    if (isForcedLandscape()) {
      return touch.clientY < window.innerHeight * 0.5;
    }
    return touch.clientX < window.innerWidth * 0.5;
  };

  const assignTouchSteering = (touch: Touch): void => {
    if (isTouchOnLeft(touch)) {
      if (input.touchLeftId === null) {
        input.touchLeftId = touch.identifier;
        input.left = true;
        haptic("light");
      }
      return;
    }

    if (input.touchRightId === null) {
      input.touchRightId = touch.identifier;
      input.right = true;
      haptic("light");
    }
  };

  const updateTouchSteeringSide = (touch: Touch): void => {
    const touchOnLeft = isTouchOnLeft(touch);

    if (touchOnLeft && input.touchRightId === touch.identifier) {
      input.touchRightId = null;
      input.right = false;
      if (input.touchLeftId === null) {
        input.touchLeftId = touch.identifier;
        input.left = true;
      }
      return;
    }

    if (!touchOnLeft && input.touchLeftId === touch.identifier) {
      input.touchLeftId = null;
      input.left = false;
      if (input.touchRightId === null) {
        input.touchRightId = touch.identifier;
        input.right = true;
      }
    }
  };

  /* Touch - taps for start/restart, screen halves for steering */
  window.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (isUI(e)) return;
      const state = getState();
      if (state !== "PLAYING") {
        handleTap(e);
        return;
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        assignTouchSteering(e.changedTouches[i]);
      }
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (getState() !== "PLAYING") return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === input.touchLeftId || t.identifier === input.touchRightId) {
          updateTouchSteeringSide(t);
        }
      }
    },
    { passive: true },
  );

  const touchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      clearTouchSteering(e.changedTouches[i].identifier);
    }
  };
  window.addEventListener("touchend", touchEnd);
  window.addEventListener("touchcancel", touchEnd);

  /* Keyboard */
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      handleTap(e);
      return;
    }
    if (getState() !== "PLAYING") return;
    if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.right = true;
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
  });

  /* Mobile buttons */
  const btnL = $("btnLeft");
  const btnR = $("btnRight");

  btnL.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.left = true;
    haptic("light");
  });
  btnL.addEventListener("touchend", (e) => {
    e.preventDefault();
    input.left = false;
  });
  btnR.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.right = true;
    haptic("light");
  });
  btnR.addEventListener("touchend", (e) => {
    e.preventDefault();
    input.right = false;
  });

  return input;
}

/** Resets input state for a new game. */
export function resetInput(input: InputState): void {
  input.left = false;
  input.right = false;
  input.touchLeftId = null;
  input.touchRightId = null;
}
