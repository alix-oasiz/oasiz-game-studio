import { SHIP_CENTER_OF_GRAVITY_LOCAL } from "../../geometry/EntityShapes.js";

const SHIP_COG_LOCAL_X = SHIP_CENTER_OF_GRAVITY_LOCAL.x;
const SHIP_COG_LOCAL_Y = SHIP_CENTER_OF_GRAVITY_LOCAL.y;

function rotateShipCogOffset(angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: SHIP_COG_LOCAL_X * cos - SHIP_COG_LOCAL_Y * sin,
    y: SHIP_COG_LOCAL_X * sin + SHIP_COG_LOCAL_Y * cos,
  };
}

export function shipBodyPositionFromCenter(
  centerX: number,
  centerY: number,
  angle: number,
): { x: number; y: number } {
  const offset = rotateShipCogOffset(angle);
  return {
    x: centerX + offset.x,
    y: centerY + offset.y,
  };
}

export function shipCenterFromBodyPosition(
  bodyX: number,
  bodyY: number,
  angle: number,
): { x: number; y: number } {
  const offset = rotateShipCogOffset(angle);
  return {
    x: bodyX - offset.x,
    y: bodyY - offset.y,
  };
}

export function shipBodyVelocityFromCenterVelocity(
  centerVx: number,
  centerVy: number,
  angle: number,
  angularVelocity: number,
): { x: number; y: number } {
  const offset = rotateShipCogOffset(angle);
  return {
    x: centerVx - angularVelocity * offset.y,
    y: centerVy + angularVelocity * offset.x,
  };
}

export function shipCenterVelocityFromBodyVelocity(
  bodyVx: number,
  bodyVy: number,
  angle: number,
  angularVelocity: number,
): { x: number; y: number } {
  const offset = rotateShipCogOffset(angle);
  return {
    x: bodyVx + angularVelocity * offset.y,
    y: bodyVy - angularVelocity * offset.x,
  };
}
