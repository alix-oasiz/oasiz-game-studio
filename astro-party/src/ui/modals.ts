import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";
import {
  isPlatformRuntime,
  requestPlatformLeaveGame,
} from "../platform/oasizBridge";

export type LeaveModalContext = "LOBBY_LEAVE" | "MATCH_LEAVE";

export interface LeaveModalUI {
  openLeaveModal: (context?: LeaveModalContext) => void;
  closeLeaveModal: () => void;
  isLeaveModalOpen: () => boolean;
}

export function createLeaveModal(game: Game): LeaveModalUI {
  const feedback = createUIFeedback("modals");
  let activeContext: LeaveModalContext = "MATCH_LEAVE";

  const shouldEndEndlessMatchOnLeave = (): boolean => {
    return (
      activeContext === "MATCH_LEAVE" &&
      game.getRuleset() === "ENDLESS_RESPAWN" &&
      game.isLeader() &&
      game.getPhase() === "PLAYING"
    );
  };

  const applyModalContent = (context: LeaveModalContext): void => {
    if (context === "LOBBY_LEAVE") {
      elements.leaveModalTitle.textContent = "Leave Lobby?";
      elements.leaveModalMessage.textContent =
        "Are you sure you want to leave this lobby?";
      elements.leaveConfirmBtn.textContent = "Leave Lobby";
      return;
    }

    if (shouldEndEndlessMatchOnLeave()) {
      elements.leaveModalTitle.textContent = "End Match and Leave?";
      elements.leaveModalMessage.textContent =
        "You are the leader. Leaving now will end the endless match for everyone.";
      elements.leaveConfirmBtn.textContent = "End and Leave";
      return;
    }

    elements.leaveModalTitle.textContent = "Leave Match?";
    elements.leaveModalMessage.textContent =
      "Are you sure you want to leave the match?";
    elements.leaveConfirmBtn.textContent = "Leave";
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
    const previousLabel = elements.leaveConfirmBtn.textContent ?? "Leave";
    const shouldEndEndlessMatch = shouldEndEndlessMatchOnLeave();
    elements.leaveConfirmBtn.disabled = true;
    elements.leaveConfirmBtn.textContent = "Leaving...";
    closeLeaveModal();
    try {
      if (shouldEndEndlessMatch) {
        game.endMatch();
      }
      await game.leaveGame();
      // Signal the platform to close the game after confirming leave.
      // Matches SDK dev's required flow: onBackButton → modal → leaveGame().
      if (isPlatformRuntime()) {
        requestPlatformLeaveGame();
      }
    } finally {
      elements.leaveConfirmBtn.disabled = false;
      elements.leaveConfirmBtn.textContent = previousLabel;
    }
  });

  return { openLeaveModal, closeLeaveModal, isLeaveModalOpen };
}
