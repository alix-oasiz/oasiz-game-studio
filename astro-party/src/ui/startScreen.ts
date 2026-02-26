import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";
import { AudioManager } from "../AudioManager";

export interface StartScreenUI {
  resetStartButtons: (replayTitleIntro?: boolean) => void;
  playTitleIntro: () => void;
  cancelTitleIntroAudioSync: () => void;
  setBeforeAction: (fn: (() => Promise<void>) | null) => void;
}

interface StartScreenAudioCallbacks {
  onIntroAudioComplete?: () => void;
}

export function createStartScreenUI(
  game: Game,
  callbacks: StartScreenAudioCallbacks = {},
): StartScreenUI {
  const feedback = createUIFeedback("startScreen");
  const titleWrap = document.getElementById("gameTitleWrap");
  const startShell = document.querySelector<HTMLElement>("#startScreen .start-shell");
  const FORCE_TITLE_ANIMATION_DELAY_SEC = 0.465;
  let forceTitleTriggerRafId = 0;
  let titleIntroRunToken = 0;

  function cancelTitleAudioSync(): void {
    if (forceTitleTriggerRafId !== 0) {
      cancelAnimationFrame(forceTitleTriggerRafId);
      forceTitleTriggerRafId = 0;
    }
  }

  function playTitleIntro(): void {
    if (!titleWrap && !startShell) {
      return;
    }

    titleIntroRunToken += 1;
    const introRunToken = titleIntroRunToken;
    cancelTitleAudioSync();

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
    elements.createRoomBtn.disabled = false;
    elements.createRoomBtn.textContent = "Create Room";
    elements.localMatchBtn.disabled = false;
    elements.localMatchBtn.textContent = "Local Match";
    hideJoinSection();
    if (replayTitleIntro) {
      playTitleIntro();
    }
  }

  elements.createRoomBtn.addEventListener("click", async () => {
    feedback.button();
    if (beforeAction) await beforeAction();
    game.setSessionMode("online");
    elements.createRoomBtn.disabled = true;
    elements.createRoomBtn.textContent = "Creating...";

    try {
      const code = await game.createRoom();
      console.log("[Main] Room created:", code);
      if (window.__PLAYER_NAME__) {
        game.setPlayerName(window.__PLAYER_NAME__);
      }
    } catch (e) {
      console.error("[Main] Failed to create room:", e);
      elements.createRoomBtn.disabled = false;
      elements.createRoomBtn.textContent = "Create Room";
    }
  });

  elements.joinRoomBtn.addEventListener("click", async () => {
    feedback.subtle();
    if (beforeAction) await beforeAction();
    game.setSessionMode("online");
    showJoinSection();
  });

  elements.localMatchBtn.addEventListener("click", async () => {
    feedback.button();
    if (beforeAction) await beforeAction();
    game.setSessionMode("local");
    elements.localMatchBtn.disabled = true;
    elements.localMatchBtn.textContent = "Starting...";

    try {
      const code = await game.createRoom();
      console.log("[Main] Local room created:", code);
      if (window.__PLAYER_NAME__) {
        game.setPlayerName(window.__PLAYER_NAME__);
      }
    } catch (e) {
      console.error("[Main] Failed to start local match:", e);
      elements.localMatchBtn.disabled = false;
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
    game.setSessionMode("online");
    const code = elements.roomCodeInput.value.trim().toUpperCase();

    if (code.length < 4) {
      elements.joinError.textContent = "Code must be 4 characters";
      elements.joinError.classList.add("active");
      feedback.error();
      return;
    }

    feedback.button();
    elements.submitJoinBtn.disabled = true;
    elements.submitJoinBtn.textContent = "Joining...";

    try {
      const success = await game.joinRoom(code);
      if (success) {
        if (window.__PLAYER_NAME__) {
          game.setPlayerName(window.__PLAYER_NAME__);
        }
      } else {
        elements.joinError.textContent =
          game.consumeLastTransportErrorMessage() ?? "Could not join room";
        elements.joinError.classList.add("active");
        feedback.error();
      }
    } catch (e) {
      console.error("[Main] Failed to join room:", e);
      elements.joinError.textContent = "Connection failed";
      elements.joinError.classList.add("active");
      feedback.error();
    }

    elements.submitJoinBtn.disabled = false;
    elements.submitJoinBtn.textContent = "Join";
  });

  function setBeforeAction(fn: (() => Promise<void>) | null): void {
    beforeAction = fn;
  }

  return {
    resetStartButtons,
    playTitleIntro,
    cancelTitleIntroAudioSync,
    setBeforeAction,
  };
}
