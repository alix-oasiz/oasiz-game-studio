import { getEntityAsset, type EntityAssetDefinition } from "./EntityAssets.js";
import { SHIP_COLLIDER_VERTICES, type ShapePoint } from "./EntityShapes.js";

export interface ShipPoseLike {
  x: number;
  y: number;
  angle: number;
}

export interface LocalPoint {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

function computeBounds(vertices: ReadonlyArray<ShapePoint>): Bounds {
  const first = vertices[0];
  if (!first) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (let i = 1; i < vertices.length; i += 1) {
    const point = vertices[i];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

const SHIP_ASSET: EntityAssetDefinition = getEntityAsset("ship");
export const SHIP_COLLIDER_BOUNDS: Readonly<Bounds> = Object.freeze(
  computeBounds(SHIP_COLLIDER_VERTICES),
);

const TRAIL_ANCHOR_LOCAL: LocalPoint =
  SHIP_ASSET.renderMeta?.trail?.anchor ?? { x: SHIP_COLLIDER_BOUNDS.minX, y: 0 };

const SHIP_EFFECT_FORWARD_PADDING_FACTOR = 0.225;
const SHIP_EFFECT_REAR_PADDING_FACTOR = 0.38;
const SHIP_JOUST_REAR_PADDING_FACTOR = 0.35;
const SHIP_JOUST_WING_Y_FACTOR = 0.64;
const SHIP_VISUAL_REFERENCE_FACTOR = 1.07;

export const SHIP_VISUAL_REFERENCE_SIZE = Math.max(
  1,
  Math.max(
    Math.abs(SHIP_COLLIDER_BOUNDS.minY),
    Math.abs(SHIP_COLLIDER_BOUNDS.maxY),
  ) * SHIP_VISUAL_REFERENCE_FACTOR,
);

export const SHIP_SHIELD_RADII = Object.freeze({
  x: Math.max(1, SHIP_COLLIDER_BOUNDS.width * 1.08),
  y: Math.max(1, SHIP_COLLIDER_BOUNDS.height * 0.64),
});

export const SHIP_EFFECT_LOCAL_POINTS = Object.freeze({
  muzzle: Object.freeze({
    x:
      SHIP_COLLIDER_BOUNDS.maxX +
      SHIP_COLLIDER_BOUNDS.width * SHIP_EFFECT_FORWARD_PADDING_FACTOR,
    y: 0,
  }),
  trail: Object.freeze({
    x:
      TRAIL_ANCHOR_LOCAL.x -
      SHIP_COLLIDER_BOUNDS.width * SHIP_EFFECT_REAR_PADDING_FACTOR,
    y: TRAIL_ANCHOR_LOCAL.y,
  }),
});

const joustWingY =
  Math.max(
    Math.abs(SHIP_COLLIDER_BOUNDS.minY),
    Math.abs(SHIP_COLLIDER_BOUNDS.maxY),
  ) * SHIP_JOUST_WING_Y_FACTOR;
const joustStartX =
  SHIP_COLLIDER_BOUNDS.minX -
  SHIP_COLLIDER_BOUNDS.width * SHIP_JOUST_REAR_PADDING_FACTOR;

export const SHIP_JOUST_LOCAL_POINTS = Object.freeze({
  left: Object.freeze({
    x: joustStartX,
    y: -joustWingY,
  }),
  right: Object.freeze({
    x: joustStartX,
    y: joustWingY,
  }),
});

export function localPointToWorld(
  pose: ShipPoseLike,
  localPoint: LocalPoint,
): LocalPoint {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return {
    x: pose.x + localPoint.x * cos - localPoint.y * sin,
    y: pose.y + localPoint.x * sin + localPoint.y * cos,
  };
}

export function getShipMuzzleWorldPoint(pose: ShipPoseLike): LocalPoint {
  return localPointToWorld(pose, SHIP_EFFECT_LOCAL_POINTS.muzzle);
}

export function getShipTrailWorldPoint(pose: ShipPoseLike): LocalPoint {
  return localPointToWorld(pose, SHIP_EFFECT_LOCAL_POINTS.trail);
}
