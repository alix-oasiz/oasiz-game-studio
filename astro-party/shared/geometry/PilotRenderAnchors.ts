import { getEntityAsset, type EntityAssetDefinition } from "./EntityAssets.js";
import { PILOT_COLLIDER_VERTICES, type ShapePoint } from "./EntityShapes.js";

export interface PilotPoseLike {
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

const PILOT_ASSET: EntityAssetDefinition = getEntityAsset("pilot");
const PILOT_HARDPOINTS = PILOT_ASSET.renderMeta?.hardpoints;
const PILOT_COLLIDER_BOUNDS: Readonly<Bounds> = Object.freeze(
  computeBounds(PILOT_COLLIDER_VERTICES),
);

const fallbackDashPoint = {
  x: PILOT_COLLIDER_BOUNDS.minX - PILOT_COLLIDER_BOUNDS.width * 0.08,
  y: 0,
};
const fallbackArmLeftPoint = {
  x: -0.8,
  y: -5.8,
};
const fallbackArmRightPoint = {
  x: -0.8,
  y: 5.8,
};

export const PILOT_EFFECT_LOCAL_POINTS = Object.freeze({
  dash: Object.freeze({
    x: PILOT_HARDPOINTS?.pilotDash?.x ?? fallbackDashPoint.x,
    y: PILOT_HARDPOINTS?.pilotDash?.y ?? fallbackDashPoint.y,
  }),
  armLeft: Object.freeze({
    x: PILOT_HARDPOINTS?.pilotArmLeft?.x ?? fallbackArmLeftPoint.x,
    y: PILOT_HARDPOINTS?.pilotArmLeft?.y ?? fallbackArmLeftPoint.y,
  }),
  armRight: Object.freeze({
    x: PILOT_HARDPOINTS?.pilotArmRight?.x ?? fallbackArmRightPoint.x,
    y: PILOT_HARDPOINTS?.pilotArmRight?.y ?? fallbackArmRightPoint.y,
  }),
});

export function localPointToWorld(
  pose: PilotPoseLike,
  localPoint: LocalPoint,
): LocalPoint {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return {
    x: pose.x + localPoint.x * cos - localPoint.y * sin,
    y: pose.y + localPoint.x * sin + localPoint.y * cos,
  };
}

export function getPilotDashWorldPoint(pose: PilotPoseLike): LocalPoint {
  return localPointToWorld(pose, PILOT_EFFECT_LOCAL_POINTS.dash);
}
