import { type Vec2 } from "./constants.ts";

/**
 * Test if two line segments (p1→p2) and (p3→p4) intersect.
 * Returns true if they cross (not just touch at endpoints).
 */
export function segmentsIntersect(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
  epsilon = 1e-8,
): boolean {
  const d1x = p2.x - p1.x;
  const d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x;
  const d2z = p4.z - p3.z;

  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < epsilon) return false; // parallel

  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denom;

  return t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon;
}

function dot(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

export function segmentDistanceSq(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): number {
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
  const dx = wx + sc * ux - tc * vx;
  const dz = wz + sc * uz - tc * vz;
  return dx * dx + dz * dz;
}

export function segmentsHitWithRadius(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
  radius: number,
): boolean {
  return (
    segmentsIntersect(p1, p2, p3, p4) ||
    segmentDistanceSq(p1, p2, p3, p4) <= radius * radius
  );
}

/**
 * Point-in-polygon test using ray casting algorithm.
 */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  const safePolygon = polygon.filter((vertex): vertex is Vec2 =>
    Boolean(vertex && Number.isFinite(vertex.x) && Number.isFinite(vertex.z)),
  );
  const n = safePolygon.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = safePolygon[i];
    const pj = safePolygon[j];

    if (
      pi.z > point.z !== pj.z > point.z &&
      point.x < ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute polygon area using the shoelace formula.
 */
export function polygonArea(polygon: Vec2[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += polygon[j].x * polygon[i].z;
    area -= polygon[i].x * polygon[j].z;
  }
  return Math.abs(area) / 2;
}

/**
 * Check if segment (a→b) intersects any segment of a polyline.
 * skipFirst/skipLast: number of segments to skip from the start/end of the polyline.
 */
export function segmentIntersectsPolyline(
  a: Vec2,
  b: Vec2,
  polyline: Vec2[],
  skipFirst = 0,
  skipLast = 0,
): boolean {
  const end = polyline.length - 1 - skipLast;
  for (let i = skipFirst; i < end; i++) {
    if (segmentsIntersect(a, b, polyline[i], polyline[i + 1])) {
      return true;
    }
  }
  return false;
}

/**
 * Find nearest point on a polygon boundary to a given point.
 */
export function nearestPointOnPolygon(point: Vec2, polygon: Vec2[]): Vec2 {
  const safePolygon = polygon.filter((vertex): vertex is Vec2 =>
    Boolean(vertex && Number.isFinite(vertex.x) && Number.isFinite(vertex.z)),
  );
  if (safePolygon.length === 0) {
    return { x: point.x, z: point.z };
  }

  let bestDist = Infinity;
  let best: Vec2 = safePolygon[0];

  for (let i = 0; i < safePolygon.length; i++) {
    const a = safePolygon[i];
    const b = safePolygon[(i + 1) % safePolygon.length];

    // Project point onto segment
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = point.x - a.x;
    const apz = point.z - a.z;
    const ab2 = abx * abx + abz * abz;

    if (ab2 < 1e-10) continue;

    let t = (apx * abx + apz * abz) / ab2;
    t = Math.max(0, Math.min(1, t));

    const px = a.x + t * abx;
    const pz = a.z + t * abz;
    const d = (point.x - px) ** 2 + (point.z - pz) ** 2;

    if (d < bestDist) {
      bestDist = d;
      best = { x: px, z: pz };
    }
  }

  return best;
}

/**
 * Create a circle polygon approximation.
 */
export function createCirclePolygon(
  cx: number,
  cz: number,
  radius: number,
  segments: number,
): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push({
      x: cx + Math.cos(angle) * radius,
      z: cz + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * Simple polygon union: merge a trail-formed polygon into existing territory.
 * This uses a simplified approach:
 * - The trail + connection back through territory boundary forms the new region
 * - We add the new polygon and compute a merged boundary
 *
 * For simplicity, we use a convex-hull-like approach on the combined points
 * when the exact polygon boolean is too complex.
 *
 * In practice, we'll use a simpler approach:
 * The new territory = convex hull of (old territory points + trail points)
 * OR keep as separate polygons and union them.
 */
export function mergePolygons(existing: Vec2[], addition: Vec2[]): Vec2[] {
  // Simple approach: take all points from both polygons that are inside either polygon,
  // plus intersection points, then compute the outer boundary.
  // For a game, we'll use a practical simplification.

  // Combine and compute convex hull as fallback
  // But for colorsplash, territory can be concave, so we'll keep both polygons
  // and use the union of areas.

  // Actually, the simplest robust approach: keep territory as multiple polygons
  // and check containment against all of them.
  // This is handled at the Territory class level.
  return addition; // placeholder — Territory class manages the multi-polygon case
}

/**
 * Clip polygon B from polygon A (A minus B).
 * Returns points of A that are not inside B.
 * Simplified: returns A with reduced area estimate.
 */
export function subtractPolygonArea(a: Vec2[], b: Vec2[]): number {
  // Approximate: compute area of A, subtract overlap
  const areaA = polygonArea(a);
  let overlapCount = 0;
  const sampleCount = 20;

  // Sample points inside A and check if they're in B
  const bounds = getPolygonBounds(a);
  let totalSamples = 0;

  for (let i = 0; i < sampleCount; i++) {
    for (let j = 0; j < sampleCount; j++) {
      const px =
        bounds.minX + ((bounds.maxX - bounds.minX) * (i + 0.5)) / sampleCount;
      const pz =
        bounds.minZ + ((bounds.maxZ - bounds.minZ) * (j + 0.5)) / sampleCount;
      const p = { x: px, z: pz };
      if (pointInPolygon(p, a)) {
        totalSamples++;
        if (pointInPolygon(p, b)) {
          overlapCount++;
        }
      }
    }
  }

  if (totalSamples === 0) return areaA;
  const overlapRatio = overlapCount / totalSamples;
  return areaA * (1 - overlapRatio);
}

function getPolygonBounds(poly: Vec2[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}
