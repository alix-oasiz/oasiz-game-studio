import type { PersistentState } from "../types";

export class RuntimeBridge {
  public loadPersistentState(): PersistentState {
    try {
      if (typeof window.loadGameState !== "function") {
        return {};
      }

      const state = window.loadGameState();
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        return {};
      }

      console.log("[RuntimeBridge.loadPersistentState]", "Loaded runtime game state");
      return state as PersistentState;
    } catch {
      console.log("[RuntimeBridge.loadPersistentState]", "Failed to load runtime game state");
      return {};
    }
  }

  public savePersistentState(state: PersistentState): void {
    try {
      if (typeof window.saveGameState === "function") {
        window.saveGameState(state as Record<string, unknown>);
      }
    } catch {
      console.log("[RuntimeBridge.savePersistentState]", "Failed to save runtime game state");
    }
  }

  public submitScore(score: number): void {
    if (typeof window.submitScore === "function") {
      window.submitScore(score);
    }
  }
}
