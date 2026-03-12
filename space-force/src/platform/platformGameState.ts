import {
  loadGameState as loadPlatformGameState,
  saveGameState as savePlatformGameState,
} from "./oasizBridge";

export function readPlatformGameState(): Record<string, unknown> {
  try {
    return loadPlatformGameState();
  } catch {
    return {};
  }
}

export function patchPlatformGameState(
  patch: Record<string, unknown>,
): void {
  try {
    const current = loadPlatformGameState();
    savePlatformGameState({
      ...current,
      ...patch,
    });
  } catch {
    // Ignore persistence errors in non-platform contexts.
  }
}
