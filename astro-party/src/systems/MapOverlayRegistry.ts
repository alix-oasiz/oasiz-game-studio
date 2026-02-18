import { MapId } from "../types";
import bunkersOverlayUrl from "../../shared/assets/maps/bunkers-overlay.svg?url";

const MAP_OVERLAY_URLS: Partial<Record<MapId, string>> = Object.freeze({
  4: bunkersOverlayUrl,
});

export function getMapOverlayUrl(mapId: MapId): string | null {
  return MAP_OVERLAY_URLS[mapId] ?? null;
}
