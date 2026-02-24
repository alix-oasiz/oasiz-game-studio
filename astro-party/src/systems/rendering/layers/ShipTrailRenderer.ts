import type { PlayerColor, ShipState } from "../../../types";
import { getShipTrailWorldPoint } from "../../../../shared/geometry/ShipRenderAnchors";

interface ShipTrailPoint {
  x: number;
  y: number;
  atMs: number;
}

interface ShipTrailState {
  color: string;
  points: ShipTrailPoint[];
}

export interface ShipTrailVisualTuning {
  outerWidth: number;
  midWidth: number;
  coreWidth: number;
  outerAlpha: number;
  midAlpha: number;
  coreAlpha: number;
}

const DEFAULT_SHIP_TRAIL_VISUAL_TUNING: Readonly<ShipTrailVisualTuning> =
  Object.freeze({
    outerWidth: 12,
    midWidth: 7,
    coreWidth: 3.3,
    outerAlpha: 0.048,
    midAlpha: 0.096,
    coreAlpha: 0.16,
  });

const SHIP_TRAIL_MAX_AGE_MS = 1400;
const SHIP_TRAIL_MIN_SPEED_SQ = 0.2;
const SHIP_TRAIL_SEGMENT_SPACING = 2.2;
const SHIP_TRAIL_MIN_APPEND_DISTANCE = 0.7;
const SHIP_TRAIL_MAX_INSERT_STEPS = 24;
const SHIP_TRAIL_MAX_POINTS = 32;
const DEFAULT_SHIP_TRAIL_CORE_COLOR = "#dffbff";

interface ShipTrailRenderLayer {
  width: number;
  alpha: number;
  color: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildShipTrailRenderLayers(
  color: string,
  tuning: ShipTrailVisualTuning,
): ReadonlyArray<ShipTrailRenderLayer> {
  return [
    { width: tuning.outerWidth, alpha: tuning.outerAlpha, color },
    { width: tuning.midWidth, alpha: tuning.midAlpha, color },
    {
      width: tuning.coreWidth,
      alpha: tuning.coreAlpha,
      color: DEFAULT_SHIP_TRAIL_CORE_COLOR,
    },
  ];
}

function clampShipTrailVisualTuning(
  current: ShipTrailVisualTuning,
  next: Partial<ShipTrailVisualTuning>,
): ShipTrailVisualTuning {
  const clamped: ShipTrailVisualTuning = { ...current };

  if (Number.isFinite(next.outerWidth)) {
    clamped.outerWidth = Math.max(0.1, Math.min(40, next.outerWidth as number));
  }
  if (Number.isFinite(next.midWidth)) {
    clamped.midWidth = Math.max(0.1, Math.min(40, next.midWidth as number));
  }
  if (Number.isFinite(next.coreWidth)) {
    clamped.coreWidth = Math.max(0.1, Math.min(40, next.coreWidth as number));
  }
  if (Number.isFinite(next.outerAlpha)) {
    clamped.outerAlpha = Math.max(0, Math.min(1, next.outerAlpha as number));
  }
  if (Number.isFinite(next.midAlpha)) {
    clamped.midAlpha = Math.max(0, Math.min(1, next.midAlpha as number));
  }
  if (Number.isFinite(next.coreAlpha)) {
    clamped.coreAlpha = Math.max(0, Math.min(1, next.coreAlpha as number));
  }

  return clamped;
}

function isShipTrailVisualTuningEqual(
  a: ShipTrailVisualTuning,
  b: ShipTrailVisualTuning,
): boolean {
  return (
    a.outerWidth === b.outerWidth &&
    a.midWidth === b.midWidth &&
    a.coreWidth === b.coreWidth &&
    a.outerAlpha === b.outerAlpha &&
    a.midAlpha === b.midAlpha &&
    a.coreAlpha === b.coreAlpha
  );
}

export class ShipTrailRenderer {
  private trails = new Map<string, ShipTrailState>();
  private tuning: ShipTrailVisualTuning = {
    ...DEFAULT_SHIP_TRAIL_VISUAL_TUNING,
  };

  clear(): void {
    this.trails.clear();
  }

  getVisualTuning(): ShipTrailVisualTuning {
    return { ...this.tuning };
  }

  resetVisualTuning(): void {
    this.tuning = { ...DEFAULT_SHIP_TRAIL_VISUAL_TUNING };
    this.trails.clear();
  }

  setVisualTuning(next: Partial<ShipTrailVisualTuning>): void {
    if (!next || typeof next !== "object") return;
    const nextClamped = clampShipTrailVisualTuning(this.tuning, next);
    if (!isShipTrailVisualTuningEqual(nextClamped, this.tuning)) {
      this.tuning = nextClamped;
    }
  }

  sample(state: ShipState, color: PlayerColor, nowMs: number): void {
    if (!state.alive) return;
    const speedSq = state.vx * state.vx + state.vy * state.vy;
    if (speedSq < SHIP_TRAIL_MIN_SPEED_SQ) return;

    const trailAnchor = getShipTrailWorldPoint(state);
    let trail = this.trails.get(state.playerId);
    if (!trail) {
      trail = { color: color.primary, points: [] };
      this.trails.set(state.playerId, trail);
    }
    trail.color = color.primary;
    this.pruneExpiredShipTrailPoints(trail, nowMs);

    const points = trail.points;
    const lastPoint = points[points.length - 1];
    if (!lastPoint) {
      points.push({ x: trailAnchor.x, y: trailAnchor.y, atMs: nowMs });
      return;
    }

    const dx = trailAnchor.x - lastPoint.x;
    const dy = trailAnchor.y - lastPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance < SHIP_TRAIL_MIN_APPEND_DISTANCE) {
      return;
    }

    const insertSteps = Math.min(
      SHIP_TRAIL_MAX_INSERT_STEPS,
      Math.floor(distance / SHIP_TRAIL_SEGMENT_SPACING),
    );
    for (let step = 1; step <= insertSteps; step += 1) {
      const t = step / (insertSteps + 1);
      points.push({
        x: lastPoint.x + dx * t,
        y: lastPoint.y + dy * t,
        atMs: nowMs,
      });
    }
    points.push({ x: trailAnchor.x, y: trailAnchor.y, atMs: nowMs });

    if (points.length > SHIP_TRAIL_MAX_POINTS) {
      points.splice(0, points.length - SHIP_TRAIL_MAX_POINTS);
    }
  }

  draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [playerId, trail] of this.trails) {
      this.pruneExpiredShipTrailPoints(trail, nowMs);
      if (trail.points.length < 2) {
        if (trail.points.length === 0) {
          this.trails.delete(playerId);
        }
        continue;
      }
      this.drawShipTrailLayered(ctx, trail, nowMs);
    }

    ctx.restore();
  }

  private pruneExpiredShipTrailPoints(trail: ShipTrailState, nowMs: number): void {
    const cutoff = nowMs - SHIP_TRAIL_MAX_AGE_MS;
    while (trail.points.length > 0 && trail.points[0].atMs < cutoff) {
      trail.points.shift();
    }
  }

  private drawShipTrailLayered(
    ctx: CanvasRenderingContext2D,
    trail: ShipTrailState,
    nowMs: number,
  ): void {
    const layers = buildShipTrailRenderLayers(trail.color, this.tuning);

    for (const layer of layers) {
      for (let i = 1; i < trail.points.length; i += 1) {
        const prev = trail.points[i - 1];
        const curr = trail.points[i];
        const age01 = clamp01((nowMs - curr.atMs) / SHIP_TRAIL_MAX_AGE_MS);
        const fade = 1 - age01;
        if (fade <= 0) continue;

        const segmentAlpha = layer.alpha * fade * fade;
        if (segmentAlpha <= 0.004) continue;

        ctx.globalAlpha = segmentAlpha;
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.width * (0.4 + fade * 0.6);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }
}
