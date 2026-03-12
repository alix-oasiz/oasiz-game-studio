import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";

export type LeaveModalContext =
  | "LOBBY_LEAVE"
  | "MATCH_LEAVE"
  | "END_MATCH"
  | "TUTORIAL_LEAVE";

interface LeaveModalHandlers {
  onConfirmTutorialLeave?: () => Promise<void> | void;
}

export interface LeaveModalUI {
  openLeaveModal: (context?: LeaveModalContext) => void;
  closeLeaveModal: () => void;
  isLeaveModalOpen: () => boolean;
}

export function createLeaveModal(
  game: Game,
  handlers: LeaveModalHandlers = {},
): LeaveModalUI {
  const feedback = createUIFeedback("modals");
  let activeContext: LeaveModalContext = "MATCH_LEAVE";

  const shouldEndEndlessMatchOnLeave = (): boolean => {
    if (activeContext === "END_MATCH") {
      return true;
    }
    return (
      activeContext === "MATCH_LEAVE" &&
      game.getRuleset() === "ENDLESS_RESPAWN" &&
      game.isLeader() &&
      game.getPhase() === "PLAYING"
    );
  };

  const applyModalContent = (context: LeaveModalContext): void => {
    elements.leaveCancelBtn.textContent = "No";
    elements.leaveConfirmBtn.textContent = "Yes";

    if (context === "LOBBY_LEAVE") {
      elements.leaveModalTitle.textContent = "Leave Lobby?";
      elements.leaveModalMessage.textContent =
        "Are you sure you want to leave this lobby?";
      return;
    }

    if (context === "TUTORIAL_LEAVE") {
      elements.leaveModalTitle.textContent = "Leave Tutorial?";
      elements.leaveModalMessage.textContent =
        "Are you sure you want to leave the tutorial?";
      return;
    }

    if (context === "END_MATCH" || shouldEndEndlessMatchOnLeave()) {
      elements.leaveModalTitle.textContent = "End Match?";
      elements.leaveModalMessage.textContent =
        "You are the leader. Leaving now will end the endless match for everyone.";
      return;
    }

    elements.leaveModalTitle.textContent = "Leave Match?";
    elements.leaveModalMessage.textContent =
      "Are you sure you want to leave the match?";
  };

  function openLeaveModal(context: LeaveModalContext = "MATCH_LEAVE"): void {
    activeContext = context;
    applyModalContent(context);
    feedback.subtle();
    elements.leaveModal.classList.add("active");
    elements.leaveBackdrop.classList.add("active");
  }

  function closeLeaveModal(): void {
    elements.leaveModal.classList.remove("active");
    elements.leaveBackdrop.classList.remove("active");
  }

  function isLeaveModalOpen(): boolean {
    return elements.leaveModal.classList.contains("active");
  }

  elements.leaveGameBtn.addEventListener("click", () => {
    openLeaveModal("MATCH_LEAVE");
  });

  elements.leaveCancelBtn.addEventListener("click", () => {
    feedback.subtle();
    closeLeaveModal();
  });

  elements.leaveBackdrop.addEventListener("click", () => {
    closeLeaveModal();
  });

  elements.leaveConfirmBtn.addEventListener("click", async () => {
    if (elements.leaveConfirmBtn.disabled) return;
    feedback.subtle();
    const previousLabel = elements.leaveConfirmBtn.textContent ?? "Yes";
    const shouldEndEndlessMatch = shouldEndEndlessMatchOnLeave();
    elements.leaveConfirmBtn.disabled = true;
    elements.leaveConfirmBtn.textContent = "Leaving...";
    closeLeaveModal();
    try {
      if (activeContext === "TUTORIAL_LEAVE") {
        if (handlers.onConfirmTutorialLeave) {
          await handlers.onConfirmTutorialLeave();
          return;
        }
      }
      if (shouldEndEndlessMatch) {
        game.endMatch();
      }
      await game.leaveGame();
    } finally {
      elements.leaveConfirmBtn.disabled = false;
      elements.leaveConfirmBtn.textContent = previousLabel;
    }
  });

  return { openLeaveModal, closeLeaveModal, isLeaveModalOpen };
}
