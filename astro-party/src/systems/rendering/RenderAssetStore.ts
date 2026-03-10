import { applySvgColorSlots } from "../../../shared/geometry/EntityAssets";

export class RenderAssetStore {
  private svgCache = new Map<string, HTMLImageElement>();
  private urlCache = new Map<string, HTMLImageElement>();

  getRawSvgImage(key: string, svgTemplate: string): HTMLImageElement {
    const existing = this.svgCache.get(key);
    if (existing) {
      return existing;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgTemplate)}`;
    this.svgCache.set(key, image);
    return image;
  }

  getSvgImage(
    key: string,
    svgTemplate: string,
    slots: Readonly<Record<string, string>>,
  ): HTMLImageElement {
    const existing = this.svgCache.get(key);
    if (existing) {
      return existing;
    }

    const image = new Image();
    image.decoding = "async";
    const coloredSvg = applySvgColorSlots(svgTemplate, slots);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloredSvg)}`;
    this.svgCache.set(key, image);
    return image;
  }

  getUrlImage(url: string): HTMLImageElement {
    const existing = this.urlCache.get(url);
    if (existing) {
      return existing;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = url;
    this.urlCache.set(url, image);
    return image;
  }
}

export const renderAssetStore = new RenderAssetStore();
