import { GAME_CONFIG } from "../../types";
import {
  CAMERA_DEFAULT_ZOOM,
  CAMERA_EDGE_SLACK_RATIO,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
} from "../camera/cameraConstants";

export class RenderViewportController {
  private scale = 1;
  private cameraZoom = CAMERA_DEFAULT_ZOOM;
  private cameraFocusX = GAME_CONFIG.ARENA_WIDTH / 2;
  private cameraFocusY = GAME_CONFIG.ARENA_HEIGHT / 2;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private coarsePointer = false;

  resize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const rect = canvas.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const layoutWidth = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-width"),
    );
    const layoutHeight = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-height"),
    );
    const targetWidth =
      Number.isFinite(layoutWidth) && layoutWidth > 0
        ? layoutWidth
        : rect.width;
    const targetHeight =
      Number.isFinite(layoutHeight) && layoutHeight > 0
        ? layoutHeight
        : rect.height;

    const cssWidth = Math.max(1, Math.round(targetWidth));
    const cssHeight = Math.max(1, Math.round(targetHeight));
    this.viewportWidth = cssWidth;
    this.viewportHeight = cssHeight;
    this.coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const scaleX = cssWidth / GAME_CONFIG.ARENA_WIDTH;
    const scaleY = cssHeight / GAME_CONFIG.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);
  }

  setCamera(zoom: number, focusX: number, focusY: number): void {
    this.cameraZoom = this.clampCameraZoom(zoom);
    this.cameraFocusX = Number.isFinite(focusX)
      ? focusX
      : GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = Number.isFinite(focusY)
      ? focusY
      : GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  resetCamera(): void {
    this.cameraZoom = CAMERA_DEFAULT_ZOOM;
    this.cameraFocusX = GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  applyWorldTransform(ctx: CanvasRenderingContext2D): void {
    const zoom = this.getEffectiveCameraZoom();
    const focus = this.getClampedCameraFocus(zoom);
    const scaled = this.scale * zoom;
    ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
    ctx.scale(scaled, scaled);
    ctx.translate(-focus.x, -focus.y);
  }

  clear(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  getEffectBlurPx(
    baseBlurAtUnitScale: number,
    minBlur: number,
    maxBlur: number,
  ): number {
    const px = baseBlurAtUnitScale * this.scale * this.getEffectiveCameraZoom();
    return this.clamp(px, minBlur, maxBlur);
  }

  private clampCameraZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return CAMERA_DEFAULT_ZOOM;
    return Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, zoom));
  }

  private getViewportZoomCompensation(baseZoom: number): number {
    if (!this.coarsePointer) return 1;
    const shortEdge = Math.min(this.viewportWidth, this.viewportHeight);
    const t = this.clamp01((620 - shortEdge) / 280);
    const zoomInRange = Math.max(0.0001, CAMERA_MAX_ZOOM - CAMERA_DEFAULT_ZOOM);
    const zoomInT = this.clamp01((baseZoom - CAMERA_DEFAULT_ZOOM) / zoomInRange);
    return 1 + t * 0.16 * zoomInT;
  }

  private getEffectiveCameraZoom(): number {
    const baseZoom = this.clampCameraZoom(this.cameraZoom);
    return this.clampCameraZoom(baseZoom * this.getViewportZoomCompensation(baseZoom));
  }

  private getClampedCameraFocus(zoom: number): { x: number; y: number } {
    const viewHalfWidth = this.viewportWidth / (2 * this.scale * zoom);
    const viewHalfHeight = this.viewportHeight / (2 * this.scale * zoom);
    const edgeSlackX = viewHalfWidth * CAMERA_EDGE_SLACK_RATIO;
    const edgeSlackY = viewHalfHeight * CAMERA_EDGE_SLACK_RATIO;

    const minFocusX = viewHalfWidth - edgeSlackX;
    const maxFocusX = GAME_CONFIG.ARENA_WIDTH - viewHalfWidth + edgeSlackX;
    const minFocusY = viewHalfHeight - edgeSlackY;
    const maxFocusY = GAME_CONFIG.ARENA_HEIGHT - viewHalfHeight + edgeSlackY;

    const x =
      minFocusX > maxFocusX
        ? GAME_CONFIG.ARENA_WIDTH / 2
        : this.clamp(this.cameraFocusX, minFocusX, maxFocusX);
    const y =
      minFocusY > maxFocusY
        ? GAME_CONFIG.ARENA_HEIGHT / 2
        : this.clamp(this.cameraFocusY, minFocusY, maxFocusY);

    return { x, y };
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
