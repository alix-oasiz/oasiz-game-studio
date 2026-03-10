import type { Vec2 } from "./constants.ts";
import type { Territory } from "./Territory.ts";

const ENTRY_INSET_DISTANCE = 0.18;
const POINT_EPSILON_SQ = 0.0001;

export interface TrailInsideTerritorySegment {
  path: Vec2[];
  entryPoint: Vec2 | null;
  startTangent: Vec2 | null;
}

function boundaryPointBetweenTerritories(
  outsidePoint: Vec2,
  insidePoint: Vec2,
  territory: Territory,
): Vec2 {
  let outside = { x: outsidePoint.x, z: outsidePoint.z };
  let inside = { x: insidePoint.x, z: insidePoint.z };
  for (let i = 0; i < 12; i++) {
    const mid = {
      x: (outside.x + inside.x) * 0.5,
      z: (outside.z + inside.z) * 0.5,
    };
    if (territory.containsPoint(mid)) inside = mid;
    else outside = mid;
  }
  return {
    x: (outside.x + inside.x) * 0.5,
    z: (outside.z + inside.z) * 0.5,
  };
}

export function insetBoundaryIntoTerritory(
  boundaryPoint: Vec2,
  insidePoint: Vec2,
  territory: Territory,
  insetDistance = ENTRY_INSET_DISTANCE,
): Vec2 {
  const dx = insidePoint.x - boundaryPoint.x;
  const dz = insidePoint.z - boundaryPoint.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const candidate = {
    x: boundaryPoint.x + (dx / len) * insetDistance,
    z: boundaryPoint.z + (dz / len) * insetDistance,
  };
  return territory.containsPoint(candidate) ? candidate : insidePoint;
}

function pointsEqual(a: Vec2, b: Vec2): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= POINT_EPSILON_SQ;
}

export function getTrailInsideTerritorySegment(
  trail: Vec2[],
  territory: Territory | null,
): TrailInsideTerritorySegment {
  if (!territory || trail.length < 2) {
    return { path: [], entryPoint: null, startTangent: null };
  }
  const lastPoint = trail[trail.length - 1];
  if (!territory.containsPoint(lastPoint)) {
    return { path: [], entryPoint: null, startTangent: null };
  }

  const carveTail: Vec2[] = [{ x: lastPoint.x, z: lastPoint.z }];
  let entryPoint: Vec2 | null = null;
  let startTangent: Vec2 | null = null;

  for (let i = trail.length - 2; i >= 0; i--) {
    const current = trail[i];
    const next = trail[i + 1];
    if (territory.containsPoint(current)) {
      carveTail.push({ x: current.x, z: current.z });
      continue;
    }

    const boundaryPoint = boundaryPointBetweenTerritories(
      current,
      next,
      territory,
    );
    const insetPoint = insetBoundaryIntoTerritory(
      boundaryPoint,
      next,
      territory,
    );
    const moveDx = next.x - current.x;
    const moveDz = next.z - current.z;
    const moveLen = Math.sqrt(moveDx * moveDx + moveDz * moveDz) || 1;
    const moveDir = { x: moveDx / moveLen, z: moveDz / moveLen };

    entryPoint = boundaryPoint;
    startTangent = territory.getBoundaryTangent(boundaryPoint, moveDir);

    if (!pointsEqual(insetPoint, carveTail[carveTail.length - 1])) {
      carveTail.push(insetPoint);
    }
    if (!pointsEqual(boundaryPoint, carveTail[carveTail.length - 1])) {
      carveTail.push(boundaryPoint);
    }
    break;
  }

  return {
    path: carveTail.reverse(),
    entryPoint,
    startTangent,
  };
}
