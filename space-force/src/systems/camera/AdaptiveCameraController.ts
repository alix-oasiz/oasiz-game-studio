import { GAME_CONFIG, GamePhase } from "../../types";
import {
  CAMERA_DEFAULT_ZOOM,
  CAMERA_FOCUS_SMOOTH_TIME,
  CAMERA_MAX_CLOSE_ZOOM,
  CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM,
  CAMERA_MIN_SPREAD_FOR_MAX_ZOOM,
  CAMERA_SPREAD_SMOOTH_TIME,
  CAMERA_ZOOM_DEADBAND,
  CAMERA_ZOOM_SMOOTH_TIME,
} from "./cameraConstants";

export interface CameraAnchor {
  x: number;
  y: number;
}

export interface AdaptiveCameraUpdateInput {
  dt: number;
  nowMs: number;
  phase: GamePhase;
  anchors: readonly CameraAnchor[];
}

export interface AdaptiveCameraState {
  zoom: number;
  focusX: number;
  focusY: number;
}

const DEFAULT_FOCUS_X = GAME_CONFIG.ARENA_WIDTH / 2;
const DEFAULT_FOCUS_Y = GAME_CONFIG.ARENA_HEIGHT / 2;

export class AdaptiveCameraController {
  private zoom = CAMERA_DEFAULT_ZOOM;
  private focusX = DEFAULT_FOCUS_X;
  private focusY = DEFAULT_FOCUS_Y;
  private spread = CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM;
  private zoomVelocity = 0;
  private spreadVelocity = 0;
  private focusVelocityX = 0;
  private focusVelocityY = 0;
  private lastPhase: GamePhase | null = null;
  private roundEndCinematicTimeSec = 0;

  reset(): void {
    this.zoom = CAMERA_DEFAULT_ZOOM;
    this.focusX = DEFAULT_FOCUS_X;
    this.focusY = DEFAULT_FOCUS_Y;
    this.spread = CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM;
    this.zoomVelocity = 0;
    this.spreadVelocity = 0;
    this.focusVelocityX = 0;
    this.focusVelocityY = 0;
    this.lastPhase = null;
    this.roundEndCinematicTimeSec = 0;
  }

  update(input: AdaptiveCameraUpdateInput): AdaptiveCameraState {
    void input.nowMs;
    const dt = Math.max(0, Math.min(0.25, input.dt));
    if (input.phase !== this.lastPhase) {
      if (input.phase === "ROUND_END") {
        this.roundEndCinematicTimeSec = 0;
      }
      this.lastPhase = input.phase;
    }
    if (input.phase === "ROUND_END") {
      this.roundEndCinematicTimeSec += dt;
    }

    const isAdaptivePhase =
      input.phase === "PLAYING" ||
      input.phase === "ROUND_END" ||
      input.phase === "GAME_END";
    const hasAnchors = input.anchors.length > 0;
    const allowSingleAnchorFocus =
      input.phase === "ROUND_END" || input.phase === "GAME_END";
    const hasAdaptiveAnchors =
      input.anchors.length >= 2 || (allowSingleAnchorFocus && hasAnchors);

    let targetFocusX = DEFAULT_FOCUS_X;
    let targetFocusY = DEFAULT_FOCUS_Y;
    let targetSpread = CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM;

    if (isAdaptivePhase && hasAdaptiveAnchors) {
      if (input.anchors.length >= 2) {
        const bounds = this.computeBounds(input.anchors);
        targetFocusX = (bounds.minX + bounds.maxX) * 0.5;
        targetFocusY = (bounds.minY + bounds.maxY) * 0.5;
        targetSpread = Math.sqrt(this.computeMaxDistanceSq(input.anchors));
      } else {
        const anchor = input.anchors[0];
        targetFocusX = anchor.x;
        targetFocusY = anchor.y;
        targetSpread = CAMERA_MIN_SPREAD_FOR_MAX_ZOOM * 0.72;
      }
    }

    if (input.phase === "ROUND_END") {
      const t = this.roundEndCinematicTimeSec;
      const radius = hasAnchors ? 18 : 12;
      targetFocusX += Math.cos(t * 1.05) * radius;
      targetFocusY += Math.sin(t * 0.9) * radius * 0.62;
      targetSpread *= 1 + Math.sin(t * 1.6) * 0.04;
    }

    // Smooth spread first, then derive zoom from the filtered spread.
    // This removes high-frequency jitter from player micro-movements.
    this.spread = this.smoothDamp(
      this.spread,
      targetSpread,
      "spreadVelocity",
      CAMERA_SPREAD_SMOOTH_TIME,
      dt,
    );

    let targetZoom = this.computeTargetZoomFromSpread(this.spread);
    // Continuous hysteresis: ignore tiny oscillations around the current zoom.
    if (Math.abs(targetZoom - this.zoom) < CAMERA_ZOOM_DEADBAND) {
      targetZoom = this.zoom;
    }

    this.zoom = this.smoothDamp(
      this.zoom,
      targetZoom,
      "zoomVelocity",
      CAMERA_ZOOM_SMOOTH_TIME,
      dt,
    );
    this.focusX = this.smoothDamp(
      this.focusX,
      targetFocusX,
      "focusVelocityX",
      CAMERA_FOCUS_SMOOTH_TIME,
      dt,
    );
    this.focusY = this.smoothDamp(
      this.focusY,
      targetFocusY,
      "focusVelocityY",
      CAMERA_FOCUS_SMOOTH_TIME,
      dt,
    );

    return {
      zoom: this.zoom,
      focusX: this.focusX,
      focusY: this.focusY,
    };
  }

  private computeTargetZoomFromSpread(spread: number): number {
    const range = Math.max(
      1,
      CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM - CAMERA_MIN_SPREAD_FOR_MAX_ZOOM,
    );
    const normalized = this.clamp01(
      (spread - CAMERA_MIN_SPREAD_FOR_MAX_ZOOM) / range,
    );
    const eased = this.smootherStep(normalized);
    return this.lerp(CAMERA_MAX_CLOSE_ZOOM, CAMERA_DEFAULT_ZOOM, eased);
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private smootherStep(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // Critically damped smoothing (Unity-style SmoothDamp).
  private smoothDamp(
    current: number,
    target: number,
    velocityKey:
      | "zoomVelocity"
      | "spreadVelocity"
      | "focusVelocityX"
      | "focusVelocityY",
    smoothTime: number,
    dt: number,
  ): number {
    const safeSmoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / safeSmoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const change = current - target;
    const temp = (this[velocityKey] + omega * change) * dt;
    this[velocityKey] = (this[velocityKey] - omega * temp) * exp;
    return target + (change + temp) * exp;
  }

  private computeBounds(anchors: readonly CameraAnchor[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    if (anchors.length <= 0) {
      return {
        minX: DEFAULT_FOCUS_X,
        maxX: DEFAULT_FOCUS_X,
        minY: DEFAULT_FOCUS_Y,
        maxY: DEFAULT_FOCUS_Y,
      };
    }
    let minX = anchors[0].x;
    let maxX = anchors[0].x;
    let minY = anchors[0].y;
    let maxY = anchors[0].y;
    for (let i = 1; i < anchors.length; i += 1) {
      const anchor = anchors[i];
      if (anchor.x < minX) minX = anchor.x;
      if (anchor.x > maxX) maxX = anchor.x;
      if (anchor.y < minY) minY = anchor.y;
      if (anchor.y > maxY) maxY = anchor.y;
    }
    return { minX, maxX, minY, maxY };
  }

  private computeMaxDistanceSq(anchors: readonly CameraAnchor[]): number {
    let maxDistanceSq = 0;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      for (let j = i + 1; j < anchors.length; j++) {
        const b = anchors[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > maxDistanceSq) {
          maxDistanceSq = distanceSq;
        }
      }
    }
    return maxDistanceSq;
  }

}
