import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";
import { AudioManager } from "../AudioManager";
import { getPlayerName as getPlatformPlayerName } from "../platform/oasizBridge";

export interface StartScreenUI {
  resetStartButtons: (replayTitleIntro?: boolean) => void;
  playTitleIntro: () => void;
  cancelTitleIntroAudioSync: () => void;
  setBeforeAction: (fn: (() => Promise<void>) | null) => void;
  setOnActionCommit: (fn: (() => void) | null) => void;
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
  let forceTitleTriggerRafId = 0;
  let introVisualTimer: ReturnType<typeof setTimeout> | null = null;
  let titleIntroRunToken = 0;

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
    }
    if (startShell) {
      startShell.classList.remove("ui-intro-active");
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

  function showJoinSection(): void {
    elements.mainButtons.style.display = "none";
    elements.joinSection.classList.add("active");
    elements.roomCodeInput.value = "";
    elements.joinError.classList.remove("active");
    elements.roomCodeInput.focus();
  }

  function hideJoinSection(): void {
    elements.mainButtons.style.display = "flex";
    elements.joinSection.classList.remove("active");
  }

  function resetStartButtons(replayTitleIntro = true): void {
    setStartActionLock(false);
    elements.createRoomBtn.textContent = "Create Room";
    elements.localMatchBtn.textContent = "Local Match";
    elements.submitJoinBtn.textContent = "Join";
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
      elements.createRoomBtn.textContent = "Create Room";
    }
  });

  elements.joinRoomBtn.addEventListener("click", () => {
    feedback.subtle();
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
      elements.localMatchBtn.textContent = "Local Match";
    }
  });

  elements.backToStartBtn.addEventListener("click", () => {
    feedback.subtle();
    hideJoinSection();
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

  return {
    resetStartButtons,
    playTitleIntro,
    cancelTitleIntroAudioSync,
    setBeforeAction,
    setOnActionCommit,
  };
}
