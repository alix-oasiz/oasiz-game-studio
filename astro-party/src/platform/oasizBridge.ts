import { oasiz } from "@oasiz/sdk";

export type PlatformHapticType =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "error";

type GameplayBridge = typeof oasiz & {
  gameplayStart?: () => void;
  gameplayStop?: () => void;
};

const gameplayBridge = oasiz as GameplayBridge;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function getRoomCode(): string | null {
  const code = oasiz.roomCode;
  if (typeof code !== "string") return null;
  const normalized = code.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getPlayerName(): string | null {
  const name = oasiz.playerName;
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasInjectedString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

export function isPlatformRuntime(): boolean {
  if (hasInjectedString(oasiz.gameId)) {
    return true;
  }
  return (
    hasInjectedString(oasiz.roomCode) || hasInjectedString(oasiz.playerName)
  );
}

export function submitScore(score: number): void {
  oasiz.submitScore(score);
}

export function triggerHaptic(type: PlatformHapticType): void {
  oasiz.triggerHaptic(type);
}

export function loadGameState(): Record<string, unknown> {
  return asRecord(oasiz.loadGameState());
}

export function saveGameState(state: Record<string, unknown>): void {
  oasiz.saveGameState(state);
}

export function shareRoomCode(code: string | null): void {
  oasiz.shareRoomCode(code);
}

export function onPause(callback: () => void): () => void {
  return oasiz.onPause(callback);
}

export function onResume(callback: () => void): () => void {
  return oasiz.onResume(callback);
}

export function onBackButton(callback: () => void): () => void {
  return oasiz.onBackButton(callback);
}

export function onLeaveGame(callback: () => void): () => void {
  return oasiz.onLeaveGame(callback);
}

export function requestPlatformLeaveGame(): void {
  oasiz.leaveGame();
}

export function gameplayStart(): void {
  gameplayBridge.gameplayStart?.();
}

export function gameplayStop(): void {
  gameplayBridge.gameplayStop?.();
}
