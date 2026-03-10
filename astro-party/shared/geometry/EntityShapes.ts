import {
  getEntityAsset,
  type EntityAssetId,
} from "./EntityAssets.js";
import type { ShapePoint as GeneratedShapePoint } from "./generated/EntitySvgData.js";

export type ShapePoint = GeneratedShapePoint;

/**
 * Shared collider vertices used by simulation/physics.
 *
 * Source of truth is SVG + manifest:
 * - shared/assets/entities/<entity>.svg
 * - shared/assets/entities/manifest.json
 *
 * When adding a new entity:
 * 1) Add/replace SVG with a <path id="collider" d="..."> path.
 * 2) Add entry in shared/assets/entities/manifest.json.
 * 3) Run `bun run generate:entities` (or `bun run build`, which runs prebuild).
 */
export const SHIP_COLLIDER_VERTICES: ReadonlyArray<ShapePoint> =
  getEntityAsset("ship").colliderVertices;

export const SHIP_CENTER_OF_GRAVITY_LOCAL: Readonly<ShapePoint> =
  getEntityAsset("ship").centerOfGravityLocal;

export const PILOT_COLLIDER_VERTICES: ReadonlyArray<ShapePoint> =
  getEntityAsset("pilot").colliderVertices;

export function getColliderVertices(
  entityId: EntityAssetId,
): ReadonlyArray<ShapePoint> {
  return getEntityAsset(entityId).colliderVertices;
}

export function cloneShapeVertices(
  vertices: ReadonlyArray<ShapePoint>,
): ShapePoint[] {
  return vertices.map((point) => ({ x: point.x, y: point.y }));
}

export function transformLocalVertices(
  vertices: ReadonlyArray<ShapePoint>,
  x: number,
  y: number,
  angle: number,
): Array<ShapePoint> {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return vertices.map((vertex) => ({
    x: x + vertex.x * cos - vertex.y * sin,
    y: y + vertex.x * sin + vertex.y * cos,
  }));
}
