import { GAME_CONFIG, MapId } from "../types";
import { getMapOverlayUrl } from "./MapOverlayRegistry";

export class MapOverlayStore {
  private cache = new Map<MapId, HTMLImageElement>();

  hasOverlay(mapId: MapId): boolean {
    return getMapOverlayUrl(mapId) !== null;
  }

  drawMapOverlay(ctx: CanvasRenderingContext2D, mapId: MapId): void {
    const image = this.getOrCreate(mapId);
    if (!image || !image.complete || image.naturalWidth <= 0) {
      return;
    }

    ctx.drawImage(image, 0, 0, GAME_CONFIG.ARENA_WIDTH, GAME_CONFIG.ARENA_HEIGHT);
  }

  private getOrCreate(mapId: MapId): HTMLImageElement | null {
    const url = getMapOverlayUrl(mapId);
    if (!url) {
      return null;
    }

    const cached = this.cache.get(mapId);
    if (cached) {
      return cached;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = url;
    this.cache.set(mapId, image);
    return image;
  }
}
