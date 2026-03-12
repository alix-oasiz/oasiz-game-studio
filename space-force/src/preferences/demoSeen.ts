import {
  patchPlatformGameState,
  readPlatformGameState,
} from "../platform/platformGameState";

const DEMO_SEEN_STATE_KEY = "demo_seen";

export function isDemoSeen(): boolean {
  const state = readPlatformGameState();
  return state[DEMO_SEEN_STATE_KEY] === true;
}

export function markDemoSeen(): void {
  patchPlatformGameState({
    [DEMO_SEEN_STATE_KEY]: true,
  });
}
