import { Game } from "../Game";
import { elements } from "./elements";
import { createUIFeedback } from "../feedback/uiFeedback";

export interface LeaveModalUI {
  openLeaveModal: () => void;
}

export function createLeaveModal(game: Game): LeaveModalUI {
  const feedback = createUIFeedback("modals");

  function openLeaveModal(): void {
    feedback.subtle();
    elements.leaveModal.classList.add("active");
    elements.leaveBackdrop.classList.add("active");
  }

  function closeLeaveModal(): void {
    elements.leaveModal.classList.remove("active");
    elements.leaveBackdrop.classList.remove("active");
  }

  elements.leaveGameBtn.addEventListener("click", () => {
    openLeaveModal();
  });

  elements.leaveCancelBtn.addEventListener("click", () => {
    feedback.subtle();
    closeLeaveModal();
  });

  elements.leaveBackdrop.addEventListener("click", () => {
    closeLeaveModal();
  });

  elements.leaveConfirmBtn.addEventListener("click", async () => {
    feedback.subtle();
    closeLeaveModal();
    await game.leaveGame();
  });

  return { openLeaveModal };
}
