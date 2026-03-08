import { SHIP_SHIELD_RADII } from "../../geometry/ShipRenderAnchors.js";

interface ShipPoseLike {
  x: number;
  y: number;
  angle: number;
}

function worldToShipLocal(
  ship: ShipPoseLike,
  x: number,
  y: number,
): { x: number; y: number } {
  const dx = x - ship.x;
  const dy = y - ship.y;
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function resolveRadii(padding: number): { rx: number; ry: number } {
  return {
    rx: Math.max(0.0001, SHIP_SHIELD_RADII.x + Math.max(0, padding)),
    ry: Math.max(0.0001, SHIP_SHIELD_RADII.y + Math.max(0, padding)),
  };
}

export function pointIntersectsShipShield(
  ship: ShipPoseLike,
  x: number,
  y: number,
  pointRadius: number = 0,
): boolean {
  const local = worldToShipLocal(ship, x, y);
  const { rx, ry } = resolveRadii(pointRadius);
  const ellipse =
    (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry);
  return ellipse <= 1;
}

export function segmentIntersectsShipShield(
  ship: ShipPoseLike,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  padding: number = 0,
): boolean {
  const start = worldToShipLocal(ship, startX, startY);
  const end = worldToShipLocal(ship, endX, endY);
  const { rx, ry } = resolveRadii(padding);

  const invRx2 = 1 / (rx * rx);
  const invRy2 = 1 / (ry * ry);
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const c = start.x * start.x * invRx2 + start.y * start.y * invRy2 - 1;
  if (c <= 0) return true;

  const a = dx * dx * invRx2 + dy * dy * invRy2;
  const b = 2 * (start.x * dx * invRx2 + start.y * dy * invRy2);

  if (Math.abs(a) <= 1e-9) {
    return false;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const sqrtDisc = Math.sqrt(discriminant);
  const t0 = (-b - sqrtDisc) / (2 * a);
  const t1 = (-b + sqrtDisc) / (2 * a);
  return (t0 >= 0 && t0 <= 1) || (t1 >= 0 && t1 <= 1);
}
