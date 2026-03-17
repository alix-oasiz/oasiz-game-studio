import type { Vec2 } from "./constants.ts";
import {
  createPolylineStroke,
  type TerritoryMultiPolygon,
} from "./polygon-ops.ts";
import type { Territory } from "./Territory.ts";

const ENTRY_INSET_DISTANCE = 0.18;
const CONNECTOR_INSET_DISTANCE = 1.15;
const POINT_EPSILON_SQ = 0.0001;
const TRAIL_CAPTURE_WIDTH = 0.5;

export interface TrailInsideTerritorySegment {
  path: Vec2[];
  entryPoint: Vec2 | null;
  startTangent: Vec2 | null;
}

export interface TerritoryConnectorBridge {
  leftPath: Vec2[];
  rightPath: Vec2[];
  region: TerritoryMultiPolygon;
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

function normalize(vector: Vec2): Vec2 {
  const len = Math.sqrt(vector.x * vector.x + vector.z * vector.z) || 1;
  return { x: vector.x / len, z: vector.z / len };
}

function dot(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

function closestPointsBetweenSegments(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): { a: Vec2; b: Vec2; distanceSq: number } {
  const ux = a1.x - a0.x;
  const uz = a1.z - a0.z;
  const vx = b1.x - b0.x;
  const vz = b1.z - b0.z;
  const wx = a0.x - b0.x;
  const wz = a0.z - b0.z;

  const a = dot(ux, uz, ux, uz);
  const b = dot(ux, uz, vx, vz);
  const c = dot(vx, vz, vx, vz);
  const d = dot(ux, uz, wx, wz);
  const e = dot(vx, vz, wx, wz);
  const denom = a * c - b * b;
  const EPS = 1e-8;

  let sN = 0;
  let sD = denom;
  let tN = 0;
  let tD = denom;

  if (denom < EPS) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }

  if (tN < 0) {
    tN = 0;
    if (-d < 0) {
      sN = 0;
    } else if (-d > a) {
      sN = sD;
    } else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) {
      sN = 0;
    } else if (-d + b > a) {
      sN = sD;
    } else {
      sN = -d + b;
      sD = a;
    }
  }

  const sc = Math.abs(sN) < EPS ? 0 : sN / sD;
  const tc = Math.abs(tN) < EPS ? 0 : tN / tD;
  const pointA = {
    x: a0.x + sc * ux,
    z: a0.z + sc * uz,
  };
  const pointB = {
    x: b0.x + tc * vx,
    z: b0.z + tc * vz,
  };
  const dx = pointA.x - pointB.x;
  const dz = pointA.z - pointB.z;
  return {
    a: pointA,
    b: pointB,
    distanceSq: dx * dx + dz * dz,
  };
}

function getPolygonBoundaryLoops(polygons: TerritoryMultiPolygon): Vec2[][] {
  const loops: Vec2[][] = [];
  for (const polygon of polygons) {
    if (polygon.outer.length >= 2) {
      loops.push(polygon.outer);
    }
    for (const hole of polygon.holes) {
      if (hole.length >= 2) {
        loops.push(hole);
      }
    }
  }
  return loops;
}

function getTerritoryBoundaryLoops(territory: Territory): Vec2[][] {
  return getPolygonBoundaryLoops(territory.getPolygons());
}

function getClosestBoundaryPairForPolygons(
  fromPolygons: TerritoryMultiPolygon,
  toPolygons: TerritoryMultiPolygon,
): { fromPoint: Vec2; toPoint: Vec2 } | null {
  const fromLoops = getPolygonBoundaryLoops(fromPolygons);
  const toLoops = getPolygonBoundaryLoops(toPolygons);
  let best: {
    fromPoint: Vec2;
    toPoint: Vec2;
    distanceSq: number;
  } | null = null;

  for (const fromLoop of fromLoops) {
    for (let i = 0; i < fromLoop.length; i++) {
      const a0 = fromLoop[i];
      const a1 = fromLoop[(i + 1) % fromLoop.length];
      for (const toLoop of toLoops) {
        for (let j = 0; j < toLoop.length; j++) {
          const b0 = toLoop[j];
          const b1 = toLoop[(j + 1) % toLoop.length];
          const pair = closestPointsBetweenSegments(a0, a1, b0, b1);
          if (!best || pair.distanceSq < best.distanceSq) {
            best = {
              fromPoint: pair.a,
              toPoint: pair.b,
              distanceSq: pair.distanceSq,
            };
          }
        }
      }
    }
  }

  return best
    ? {
        fromPoint: best.fromPoint,
        toPoint: best.toPoint,
      }
    : null;
}

function getClosestBoundaryPair(
  fromTerritory: Territory,
  toTerritory: Territory,
): { fromPoint: Vec2; toPoint: Vec2 } | null {
  return getClosestBoundaryPairForPolygons(
    fromTerritory.getPolygons(),
    toTerritory.getPolygons(),
  );
}

function getClosestTrailPair(
  fromTrail: Vec2[],
  toTrail: Vec2[],
): { fromPoint: Vec2; toPoint: Vec2 } | null {
  if (fromTrail.length < 2 || toTrail.length < 2) {
    return null;
  }

  let best: {
    fromPoint: Vec2;
    toPoint: Vec2;
    distanceSq: number;
  } | null = null;

  for (let i = 0; i < fromTrail.length - 1; i++) {
    const a0 = fromTrail[i];
    const a1 = fromTrail[i + 1];
    for (let j = 0; j < toTrail.length - 1; j++) {
      const b0 = toTrail[j];
      const b1 = toTrail[j + 1];
      const pair = closestPointsBetweenSegments(a0, a1, b0, b1);
      if (!best || pair.distanceSq < best.distanceSq) {
        best = {
          fromPoint: pair.a,
          toPoint: pair.b,
          distanceSq: pair.distanceSq,
        };
      }
    }
  }

  return best
    ? {
        fromPoint: best.fromPoint,
        toPoint: best.toPoint,
      }
    : null;
}

function getClosestTrailToBoundaryPair(
  trail: Vec2[],
  territory: Territory,
): { trailPoint: Vec2; boundaryPoint: Vec2 } | null {
  if (trail.length < 2 || !territory.hasTerritory()) {
    return null;
  }

  const loops = getTerritoryBoundaryLoops(territory);
  let best: {
    trailPoint: Vec2;
    boundaryPoint: Vec2;
    distanceSq: number;
  } | null = null;

  for (let i = 0; i < trail.length - 1; i++) {
    const a0 = trail[i];
    const a1 = trail[i + 1];
    for (const loop of loops) {
      for (let j = 0; j < loop.length; j++) {
        const b0 = loop[j];
        const b1 = loop[(j + 1) % loop.length];
        const pair = closestPointsBetweenSegments(a0, a1, b0, b1);
        if (!best || pair.distanceSq < best.distanceSq) {
          best = {
            trailPoint: pair.a,
            boundaryPoint: pair.b,
            distanceSq: pair.distanceSq,
          };
        }
      }
    }
  }

  return best
    ? {
        trailPoint: best.trailPoint,
        boundaryPoint: best.boundaryPoint,
      }
    : null;
}

function buildParallelBridgeRegion(
  fromPoint: Vec2,
  toPoint: Vec2,
  width: number,
): TerritoryConnectorBridge | null {
  let bridgeDir = {
    x: toPoint.x - fromPoint.x,
    z: toPoint.z - fromPoint.z,
  };
  if (
    bridgeDir.x * bridgeDir.x + bridgeDir.z * bridgeDir.z <
    POINT_EPSILON_SQ
  ) {
    return null;
  }

  const dir = normalize(bridgeDir);
  const normal = { x: -dir.z, z: dir.x };
  const halfWidth = width * 0.5;
  const fromLeft = {
    x: fromPoint.x + normal.x * halfWidth,
    z: fromPoint.z + normal.z * halfWidth,
  };
  const fromRight = {
    x: fromPoint.x - normal.x * halfWidth,
    z: fromPoint.z - normal.z * halfWidth,
  };
  const toLeft = {
    x: toPoint.x + normal.x * halfWidth,
    z: toPoint.z + normal.z * halfWidth,
  };
  const toRight = {
    x: toPoint.x - normal.x * halfWidth,
    z: toPoint.z - normal.z * halfWidth,
  };

  return {
    leftPath: [fromLeft, toLeft],
    rightPath: [fromRight, toRight],
    region: [
      {
        outer: [fromLeft, toLeft, toRight, fromRight],
        holes: [],
      },
    ],
  };
}

function clampBridgeEdgePoint(
  territory: Territory,
  anchorPoint: Vec2,
  edgePoint: Vec2,
): Vec2 {
  if (territory.containsPoint(edgePoint)) return edgePoint;

  let inside = { x: anchorPoint.x, z: anchorPoint.z };
  let outside = { x: edgePoint.x, z: edgePoint.z };
  for (let i = 0; i < 16; i++) {
    const mid = {
      x: (inside.x + outside.x) * 0.5,
      z: (inside.z + outside.z) * 0.5,
    };
    if (territory.containsPoint(mid)) inside = mid;
    else outside = mid;
  }
  return inside;
}

export function buildParallelTerritoryConnectorBridge(
  fromTerritory: Territory,
  toTerritory: Territory,
  width = 2.5,
): TerritoryConnectorBridge | null {
  if (!fromTerritory.hasTerritory() || !toTerritory.hasTerritory()) {
    return null;
  }

  const fromCentroid = fromTerritory.getCentroid();
  const toCentroid = toTerritory.getCentroid();
  const closestPair = getClosestBoundaryPair(fromTerritory, toTerritory);
  if (!closestPair) {
    return null;
  }
  const fromBoundary = closestPair.fromPoint;
  const toBoundary = closestPair.toPoint;
  const fromInset = insetBoundaryIntoTerritory(
    fromBoundary,
    fromCentroid,
    fromTerritory,
    CONNECTOR_INSET_DISTANCE,
  );
  const toInset = insetBoundaryIntoTerritory(
    toBoundary,
    toCentroid,
    toTerritory,
    CONNECTOR_INSET_DISTANCE,
  );

  let bridgeDir = {
    x: toInset.x - fromInset.x,
    z: toInset.z - fromInset.z,
  };
  if (
    bridgeDir.x * bridgeDir.x + bridgeDir.z * bridgeDir.z <
    POINT_EPSILON_SQ
  ) {
    bridgeDir = {
      x: toCentroid.x - fromCentroid.x,
      z: toCentroid.z - fromCentroid.z,
    };
  }
  if (
    bridgeDir.x * bridgeDir.x + bridgeDir.z * bridgeDir.z <
    POINT_EPSILON_SQ
  ) {
    bridgeDir = { x: 1, z: 0 };
  }

  const dir = normalize(bridgeDir);
  const normal = { x: -dir.z, z: dir.x };
  const halfWidth = width * 0.5;

  const fromLeft = clampBridgeEdgePoint(fromTerritory, fromInset, {
    x: fromInset.x + normal.x * halfWidth,
    z: fromInset.z + normal.z * halfWidth,
  });
  const fromRight = clampBridgeEdgePoint(fromTerritory, fromInset, {
    x: fromInset.x - normal.x * halfWidth,
    z: fromInset.z - normal.z * halfWidth,
  });
  const toLeft = clampBridgeEdgePoint(toTerritory, toInset, {
    x: toInset.x + normal.x * halfWidth,
    z: toInset.z + normal.z * halfWidth,
  });
  const toRight = clampBridgeEdgePoint(toTerritory, toInset, {
    x: toInset.x - normal.x * halfWidth,
    z: toInset.z - normal.z * halfWidth,
  });

  return {
    leftPath: [fromLeft, toLeft],
    rightPath: [fromRight, toRight],
    region: [
      {
        outer: [fromLeft, toLeft, toRight, fromRight],
        holes: [],
      },
    ],
  };
}

export function buildParallelTrailConnectorBridge(
  fromTrail: Vec2[],
  toTrail: Vec2[],
  width = 2.5,
): TerritoryConnectorBridge | null {
  const fromStroke = createPolylineStroke(fromTrail, TRAIL_CAPTURE_WIDTH);
  const toStroke = createPolylineStroke(toTrail, TRAIL_CAPTURE_WIDTH);
  const closestPair =
    fromStroke.length > 0 && toStroke.length > 0
      ? getClosestBoundaryPairForPolygons(fromStroke, toStroke)
      : getClosestTrailPair(fromTrail, toTrail);
  if (!closestPair) {
    return null;
  }

  return buildParallelBridgeRegion(
    closestPair.fromPoint,
    closestPair.toPoint,
    width,
  );
}

export function buildParallelTrailToTerritoryConnectorBridge(
  fromTrail: Vec2[],
  toTerritory: Territory,
  width = 2.5,
): TerritoryConnectorBridge | null {
  const fromStroke = createPolylineStroke(fromTrail, TRAIL_CAPTURE_WIDTH);
  const closestPair =
    fromStroke.length > 0
      ? getClosestBoundaryPairForPolygons(fromStroke, toTerritory.getPolygons())
      : getClosestTrailToBoundaryPair(fromTrail, toTerritory);
  if (!closestPair) {
    return null;
  }

  const fromPoint =
    "fromPoint" in closestPair ? closestPair.fromPoint : closestPair.trailPoint;
  const boundaryPoint =
    "toPoint" in closestPair ? closestPair.toPoint : closestPair.boundaryPoint;

  const toInset = insetBoundaryIntoTerritory(
    boundaryPoint,
    toTerritory.getCentroid(),
    toTerritory,
    CONNECTOR_INSET_DISTANCE,
  );
  return buildParallelBridgeRegion(fromPoint, toInset, width);
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
