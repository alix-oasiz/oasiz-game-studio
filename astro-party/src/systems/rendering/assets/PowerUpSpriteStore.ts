import type { PowerUpType } from "../../../types";
import { POWERUP_SVG_ASSETS } from "./PowerUpSvgAssets";
import { renderAssetStore } from "./RenderAssetStore";

export class PowerUpSpriteStore {
  drawPowerUp(
    ctx: CanvasRenderingContext2D,
    type: PowerUpType,
    size: number,
  ): boolean {
    const asset = POWERUP_SVG_ASSETS[type];
    const key = this.buildKey(type);
    const image = renderAssetStore.getRawSvgImage(key, asset.svgTemplate);
    if (!image.complete || image.naturalWidth === 0) {
      return false;
    }

    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    return true;
  }

  getGlowColor(type: PowerUpType): string {
    return POWERUP_SVG_ASSETS[type].glowColor;
  }

  private buildKey(type: PowerUpType): string {
    return `powerup::${type}`;
  }
}
