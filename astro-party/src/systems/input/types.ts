export type ButtonType = "A" | "B";
export type TouchLayout = "single" | "dual" | "corner";

export interface SlotState {
  buttonA: boolean;
  buttonB: boolean;
  wasButtonA: boolean;
  lastButtonATime: number;
  dashPending: boolean;
}
