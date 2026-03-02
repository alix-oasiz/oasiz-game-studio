import {
  getEntityAsset,
  type EntityAssetId,
} from "../../../shared/geometry/EntityAssets";
import { renderAssetStore } from "./RenderAssetStore";

/**
 * Client-only sprite cache for SVG-backed entities.
 *
 * To add a new entity:
 * 1) Add the SVG in shared/assets/entities/.
 * 2) Add the manifest entry in shared/assets/entities/manifest.json.
 * 3) Run `bun run build` (prebuild regenerates shared geometry metadata).
 * 4) Draw with drawEntity(...) and pass any slot overrides.
 *
 * renderSize is derived from SVG viewBox + renderScale.
 * collider vertices are derived from SVG collider path + physicsScale.
 */
export class EntitySpriteStore {
  drawEntity(
    ctx: CanvasRenderingContext2D,
    entityId: EntityAssetId,
    slotOverrides?: Readonly<Record<string, string>>,
  ): boolean {
    const asset = getEntityAsset(entityId);
    const slots = {
      ...asset.slotDefaults,
      ...(slotOverrides ?? {}),
    };

    const key = this.buildKey(entityId, slots);
    const image = this.getOrCreateImage(key, asset.svgTemplate, slots);

    if (!image.complete || image.naturalWidth === 0) {
      return false;
    }

    ctx.drawImage(
      image,
      -asset.renderSize.width / 2,
      -asset.renderSize.height / 2,
      asset.renderSize.width,
      asset.renderSize.height,
    );

    return true;
  }

  private buildKey(entityId: string, slots: Readonly<Record<string, string>>): string {
    const orderedKeys = Object.keys(slots).sort();
    const slotKey = orderedKeys.map((key) => `${key}:${slots[key]}`).join("|");
    return `${entityId}::${slotKey}`;
  }

  private getOrCreateImage(
    key: string,
    svgTemplate: string,
    slots: Readonly<Record<string, string>>,
  ): HTMLImageElement {
    return renderAssetStore.getSvgImage(key, svgTemplate, slots);
  }
}
