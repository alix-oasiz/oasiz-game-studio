import { GAME_CONFIG, MapId } from "../../types";
import { getMapOverlayUrl } from "./MapOverlayRegistry";
import { renderAssetStore } from "./RenderAssetStore";

export class MapOverlayStore {
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

    return renderAssetStore.getUrlImage(url);
  }
}
