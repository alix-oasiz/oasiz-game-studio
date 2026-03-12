import {
  DEFAULT_SHIP_SKIN_ID,
  type ShipSkinId,
  SHIP_SKIN_IDS,
  isShipSkinId,
} from "../../shared/geometry/ShipSkins.js";
import {
  patchPlatformGameState,
  readPlatformGameState,
} from "../platform/platformGameState";

const SHIP_SKIN_STATE_KEY = "preferred_ship_skin_id";
let cachedShipSkinId: ShipSkinId | null = null;

function randomShipSkinId(): ShipSkinId {
  if (SHIP_SKIN_IDS.length <= 0) {
    return DEFAULT_SHIP_SKIN_ID;
  }
  const index = Math.floor(Math.random() * SHIP_SKIN_IDS.length);
  return SHIP_SKIN_IDS[index];
}

function readSavedShipSkinId(): ShipSkinId | null {
  const state = readPlatformGameState();
  const value = state[SHIP_SKIN_STATE_KEY];
  return isShipSkinId(value) ? value : null;
}

export function getPreferredShipSkinId(): ShipSkinId | null {
  if (cachedShipSkinId) {
    return cachedShipSkinId;
  }
  cachedShipSkinId = readSavedShipSkinId();
  return cachedShipSkinId;
}

export function setPreferredShipSkinId(shipSkinId: ShipSkinId): void {
  cachedShipSkinId = shipSkinId;
  patchPlatformGameState({
    [SHIP_SKIN_STATE_KEY]: shipSkinId,
  });
}

export function getOrCreatePreferredShipSkinId(): ShipSkinId {
  const existing = getPreferredShipSkinId();
  if (existing) {
    return existing;
  }
  const generated = randomShipSkinId();
  setPreferredShipSkinId(generated);
  return generated;
}
