import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";
import { AudioManager } from "../AudioManager";
import {
  getPlayerName as getPlatformPlayerName,
  isPlatformRuntime,
} from "../platform/oasizBridge";

export interface StartScreenUI {
  resetStartButtons: (replayTitleIntro?: boolean) => void;
  playTitleIntro: () => void;
  playTitleOutro: () => Promise<void>;
  cancelTitleIntroAudioSync: () => void;
  closeJoinSection: () => void;
  isJoinSectionOpen: () => boolean;
  setBeforeAction: (fn: (() => Promise<void>) | null) => void;
  setOnActionCommit: (fn: (() => void) | null) => void;
  setOnHowToPlay: (fn: (() => Promise<void> | void) | null) => void;
  setOnOpenSettings: (fn: (() => void) | null) => void;
  showTapHint: () => Promise<"tapped" | "timeout">;
}

interface StartScreenAudioCallbacks {
  onIntroAudioComplete?: () => void;
  onIntroVisualComplete?: () => void;
}

export function createStartScreenUI(
  game: Game,
  callbacks: StartScreenAudioCallbacks = {},
): StartScreenUI {
  const feedback = createUIFeedback("startScreen");
  const titleWrap = document.getElementById("gameTitleWrap");
  const startShell = document.querySelector<HTMLElement>("#startScreen .start-shell");
  const FORCE_TITLE_ANIMATION_DELAY_SEC = 0.465;
  // Matches CSS intro timings in index.html:
  // mainButtons reveal (1280ms delay + 560ms animation) + deliberate hold beat.
  const TITLE_INTRO_VISUAL_SETTLE_MS = 2160;
  // Matches CSS title+shell outro timings in index.html.
  const TITLE_OUTRO_SETTLE_MS = 760;
  let forceTitleTriggerRafId = 0;
  let introVisualTimer: ReturnType<typeof setTimeout> | null = null;
  let titleIntroRunToken = 0;
  let beforeAction: (() => Promise<void>) | null = null;
  let onActionCommit: (() => void) | null = null;
  let onHowToPlay: (() => Promise<void> | void) | null = null;
  let onOpenSettings: (() => void) | null = null;
  let startActionInFlight = false;
  let secondaryActionInFlight = false;
  let lastSecondaryActionAtMs = 0;
  const isPlatform = isPlatformRuntime();
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const SECONDARY_ACTION_TAP_GUARD_MS = 320;

  const setStartActionLock = (locked: boolean): void => {
    startActionInFlight = locked;
    elements.createRoomBtn.disabled = locked;
    elements.joinRoomBtn.disabled = locked;
    elements.localMatchBtn.disabled = locked;
    elements.startHowToPlayBtn.disabled = locked || secondaryActionInFlight;
    elements.startSettingsBtn.disabled = locked || secondaryActionInFlight;
    elements.submitJoinBtn.disabled = locked;
    elements.backToStartBtn.disabled = locked;
  };

  const setSecondaryActionLock = (locked: boolean): void => {
    secondaryActionInFlight = locked;
    elements.startHowToPlayBtn.disabled = locked || startActionInFlight;
    elements.startSettingsBtn.disabled = locked || startActionInFlight;
  };

  const isSecondaryTapGuardBlocked = (event: Event): boolean => {
    if (!isCoarsePointer) return false;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - lastSecondaryActionAtMs < SECONDARY_ACTION_TAP_GUARD_MS) {
      return true;
    }
    lastSecondaryActionAtMs = now;
    return false;
  };

  const getInjectedPlayerName = (): string | null => {
    return getPlatformPlayerName();
  };

  elements.joinRoomBtn.style.display = isPlatform ? "none" : "inline-flex";

  function cancelTitleAudioSync(): void {
    if (forceTitleTriggerRafId !== 0) {
      cancelAnimationFrame(forceTitleTriggerRafId);
      forceTitleTriggerRafId = 0;
    }
  }

  function cancelTitleVisualSync(): void {
    if (introVisualTimer === null) {
      return;
    }
    clearTimeout(introVisualTimer);
    introVisualTimer = null;
  }

  function playTitleIntro(): void {
    if (!titleWrap && !startShell) {
      return;
    }

    titleIntroRunToken += 1;
    const introRunToken = titleIntroRunToken;
    cancelTitleAudioSync();
    cancelTitleVisualSync();

    if (titleWrap) {
      titleWrap.classList.remove("intro-active");
      titleWrap.classList.remove("force-active");
      titleWrap.classList.remove("outro-active");
    }
    if (startShell) {
      startShell.classList.remove("ui-intro-active");
      startShell.classList.remove("ui-outro-active");
    }

    void (titleWrap?.clientWidth ?? startShell?.clientWidth ?? 0);

    if (titleWrap) {
      titleWrap.classList.add("intro-active");
    }
    if (startShell) {
      startShell.classList.add("ui-intro-active");
    }

    introVisualTimer = setTimeout(() => {
      introVisualTimer = null;
      if (introRunToken !== titleIntroRunToken) {
        return;
      }
      callbacks.onIntroVisualComplete?.();
    }, TITLE_INTRO_VISUAL_SETTLE_MS);

    void AudioManager.playLogoRevealCue();
    const introStartMs = performance.now();
    let forceCueTriggered = false;
    const tickForceTitleTrigger = (): void => {
      if (introRunToken !== titleIntroRunToken || forceCueTriggered) {
        forceTitleTriggerRafId = 0;
        return;
      }

      const logoCueElapsedSec = AudioManager.getCuePlaybackTime("LOGO_STING");
      const elapsedSec =
        logoCueElapsedSec !== null
          ? logoCueElapsedSec
          : (performance.now() - introStartMs) / 1000;
      if (elapsedSec >= FORCE_TITLE_ANIMATION_DELAY_SEC) {
        forceCueTriggered = true;
        if (titleWrap) {
          titleWrap.classList.add("force-active");
        }
        void AudioManager.playLogoRevealCue();
        void AudioManager.waitForCueEnd("LOGO_STING").finally(() => {
          if (introRunToken !== titleIntroRunToken) {
            return;
          }
          callbacks.onIntroAudioComplete?.();
        });
        forceTitleTriggerRafId = 0;
        return;
      }

      forceTitleTriggerRafId = requestAnimationFrame(tickForceTitleTrigger);
    };

    forceTitleTriggerRafId = requestAnimationFrame(tickForceTitleTrigger);
  }

  function cancelTitleIntroAudioSync(): void {
    titleIntroRunToken += 1;
    cancelTitleAudioSync();
    cancelTitleVisualSync();
  }

  function playTitleOutro(): Promise<void> {
    if (!titleWrap && !startShell) {
      return Promise.resolve();
    }

    titleIntroRunToken += 1;
    cancelTitleAudioSync();
    cancelTitleVisualSync();

    if (titleWrap) {
      titleWrap.classList.remove("intro-active", "force-active");
      titleWrap.classList.add("outro-active");
    }
    if (startShell) {
      startShell.classList.remove("ui-intro-active");
      startShell.classList.add("ui-outro-active");
    }

    return new Promise((resolve) => {
      setTimeout(resolve, TITLE_OUTRO_SETTLE_MS);
    });
  }

  function showJoinSection(): void {
    if (isPlatform) return;
    elements.mainButtons.style.display = "none";
    elements.startSecondaryActions.style.display = "none";
    elements.joinSection.classList.add("active");
    elements.roomCodeInput.value = "";
    elements.joinError.classList.remove("active");
    elements.roomCodeInput.focus();
  }

  function hideJoinSection(): void {
    elements.mainButtons.style.display = "flex";
    elements.startSecondaryActions.style.display = "flex";
    elements.joinSection.classList.remove("active");
  }

  function resetStartButtons(replayTitleIntro = true): void {
    setStartActionLock(false);
    elements.createRoomBtn.textContent = "Play Online";
    elements.localMatchBtn.textContent = "Play Local";
    elements.submitJoinBtn.textContent = "Join";
    elements.joinRoomBtn.style.display = isPlatform ? "none" : "inline-flex";
    hideJoinSection();
    if (replayTitleIntro) {
      playTitleIntro();
    }
  }

  elements.createRoomBtn.addEventListener("click", async () => {
    if (startActionInFlight) return;
    feedback.button();
    setStartActionLock(true);
    onActionCommit?.();
    elements.createRoomBtn.textContent = "Creating...";

    try {
      if (beforeAction) await beforeAction();
      game.setSessionMode("online");
      const code = await game.createRoom();
      console.log("[Main] Room created:", code);
      const playerName = getInjectedPlayerName();
      if (playerName !== null) {
        game.setPlayerName(playerName);
      }
    } catch (e) {
      console.error("[Main] Failed to create room:", e);
      setStartActionLock(false);
      elements.createRoomBtn.textContent = "Play Online";
    }
  });

  elements.joinRoomBtn.addEventListener("click", () => {
    feedback.button();
    // Don't call beforeAction here — just showing the join form doesn't commit
    // to any action; the demo should keep running until the user actually submits.
    showJoinSection();
  });

  elements.localMatchBtn.addEventListener("click", async () => {
    if (startActionInFlight) return;
    feedback.button();
    setStartActionLock(true);
    onActionCommit?.();
    elements.localMatchBtn.textContent = "Starting...";

    try {
      if (beforeAction) await beforeAction();
      game.setSessionMode("local");
      const code = await game.createRoom();
      console.log("[Main] Local room created:", code);
      const playerName = getInjectedPlayerName();
      if (playerName !== null) {
        game.setPlayerName(playerName);
      }
    } catch (e) {
      console.error("[Main] Failed to start local match:", e);
      setStartActionLock(false);
      elements.localMatchBtn.textContent = "Play Local";
    }
  });

  elements.backToStartBtn.addEventListener("click", () => {
    feedback.subtle();
    hideJoinSection();
  });

  elements.startHowToPlayBtn.addEventListener("click", async (event) => {
    if (startActionInFlight || secondaryActionInFlight) return;
    if (isSecondaryTapGuardBlocked(event)) return;
    feedback.button();
    setSecondaryActionLock(true);
    try {
      await onHowToPlay?.();
    } catch (error) {
      console.error("[StartScreen] Failed to launch how-to-play:", error);
    } finally {
      setSecondaryActionLock(false);
    }
  });

  elements.startSettingsBtn.addEventListener("click", (event) => {
    if (startActionInFlight || secondaryActionInFlight) return;
    if (isSecondaryTapGuardBlocked(event)) return;
    feedback.button();
    onOpenSettings?.();
  });

  elements.roomCodeInput.addEventListener("input", () => {
    elements.roomCodeInput.value = elements.roomCodeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    elements.joinError.classList.remove("active");
  });

  elements.roomCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      elements.submitJoinBtn.click();
    }
  });

  elements.submitJoinBtn.addEventListener("click", async () => {
    if (startActionInFlight) return;
    const code = elements.roomCodeInput.value.trim().toUpperCase();

    if (code.length < 4) {
      elements.joinError.textContent = "Code must be 4 characters";
      elements.joinError.classList.add("active");
      feedback.error();
      return;
    }

    feedback.button();
    setStartActionLock(true);
    onActionCommit?.();
    elements.submitJoinBtn.textContent = "Joining...";

    try {
      // Commit: tear down demo and set session mode now that the user is actually joining
      if (beforeAction) await beforeAction();
      game.setSessionMode("online");
      const success = await game.joinRoom(code);
      if (success) {
        const playerName = getInjectedPlayerName();
        if (playerName !== null) {
          game.setPlayerName(playerName);
        }
      } else {
        elements.joinError.textContent =
          game.consumeLastTransportErrorMessage() ?? "Could not join room";
        elements.joinError.classList.add("active");
        feedback.error();
        setStartActionLock(false);
      }
    } catch (e) {
      console.error("[Main] Failed to join room:", e);
      elements.joinError.textContent = "Connection failed";
      elements.joinError.classList.add("active");
      feedback.error();
      setStartActionLock(false);
    }

    if (!startActionInFlight) {
      elements.submitJoinBtn.textContent = "Join";
    }
  });

  function setBeforeAction(fn: (() => Promise<void>) | null): void {
    beforeAction = fn;
  }

  function setOnActionCommit(fn: (() => void) | null): void {
    onActionCommit = fn;
  }

  function setOnHowToPlay(fn: (() => Promise<void> | void) | null): void {
    onHowToPlay = fn;
  }

  function setOnOpenSettings(fn: (() => void) | null): void {
    onOpenSettings = fn;
  }

  function showTapHint(): Promise<"tapped" | "timeout"> {
    const hint = document.getElementById("startTapHint");
    if (!hint) return Promise.resolve("timeout");

    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    hint.textContent = isCoarse ? "Tap to Start" : "Press Any Key";

    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;

      const settle = (result: "tapped" | "timeout"): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        hint.classList.remove("visible");
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("pointerdown", onPointer);
        resolve(result);
      };

      const onPointer = (): void => settle("tapped");
      const onKey = (e: KeyboardEvent): void => {
        if (
          e.key === "Shift" ||
          e.key === "Control" ||
          e.key === "Alt" ||
          e.key === "Meta"
        )
          return;
        settle("tapped");
      };

      hint.classList.add("visible");
      document.addEventListener("pointerdown", onPointer);
      document.addEventListener("keydown", onKey);
      timer = setTimeout(() => settle("timeout"), 5000);
    });
  }

  return {
    resetStartButtons,
    playTitleIntro,
    playTitleOutro,
    cancelTitleIntroAudioSync,
    closeJoinSection: hideJoinSection,
    isJoinSectionOpen: () => elements.joinSection.classList.contains("active"),
    setBeforeAction,
    setOnActionCommit,
    setOnHowToPlay,
    setOnOpenSettings,
    showTapHint,
  };
}
