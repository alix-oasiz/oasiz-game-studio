import { type Vec2, START_RADIUS, START_TERRITORY_SEGMENTS, MAP_SIZE } from './constants.ts';
import { pointInPolygon, polygonArea, createCirclePolygon, segmentsIntersect } from './Collision.ts';

interface PolyBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MAX_POLYGONS = 30;

export class Territory {
  polygons: Vec2[][] = [];
  dirty = true;
  private cachedArea = 0;
  private areaDirty = true;
  private polyBounds: PolyBounds[] = [];

  initAtSpawn(cx: number, cz: number): void {
    this.polygons = [createCirclePolygon(cx, cz, START_RADIUS, START_TERRITORY_SEGMENTS)];
    this.recomputeBounds();
    this.areaDirty = true;
    this.dirty = true;
  }

  containsPoint(p: Vec2): boolean {
    for (let i = 0; i < this.polygons.length; i++) {
      const b = this.polyBounds[i];
      if (b && (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ)) continue;
      if (pointInPolygon(p, this.polygons[i])) return true;
    }
    return false;
  }

  captureFromTrail(trailPoints: Vec2[]): void {
    if (trailPoints.length < 3) return;

    const newPoly = [...trailPoints];
    this.polygons.push(newPoly);
    this.polyBounds.push(computeBounds(newPoly));

    if (this.polygons.length > MAX_POLYGONS) {
      this.consolidate();
    }

    this.areaDirty = true;
    this.dirty = true;
  }

  computeArea(): number {
    if (!this.areaDirty) return this.cachedArea;
    this.cachedArea = 0;
    for (const poly of this.polygons) {
      this.cachedArea += polygonArea(poly);
    }
    this.areaDirty = true;
    return this.cachedArea;
  }

  getPercentage(): number {
    return (this.computeArea() / (MAP_SIZE * MAP_SIZE)) * 100;
  }

  /**
   * Remove portions of this territory that overlap with a newly captured polygon
   * (the capturing player's trail). Only checks against the single trail polygon
   * so that old territory from the capturer doesn't cause false removals.
   */
  removeOverlap(capturedPoly: Vec2[]): void {
    if (capturedPoly.length < 3) return;

    const capBounds = computeBounds(capturedPoly);
    const newPolygons: Vec2[][] = [];
    let changed = false;

    for (const poly of this.polygons) {
      const pb = computeBounds(poly);

      // Fast bounding-box rejection
      if (pb.maxX < capBounds.minX || pb.minX > capBounds.maxX ||
          pb.maxZ < capBounds.minZ || pb.minZ > capBounds.maxZ) {
        newPolygons.push(poly);
        continue;
      }

      // Count vertices inside the captured trail polygon
      let insideCount = 0;
      for (const v of poly) {
        if (pointInPolygon(v, capturedPoly)) insideCount++;
      }

      if (insideCount > 0 && insideCount >= poly.length * 0.25) {
        changed = true;
        continue;
      }

      // Check if trail edges physically cross this polygon's edges
      let edgesCross = false;
      const capLen = capturedPoly.length;
      const polyLen = poly.length;
      if (insideCount === 0) {
        outer:
        for (let i = 0; i < capLen; i++) {
          const ca = capturedPoly[i];
          const cb = capturedPoly[(i + 1) % capLen];
          for (let j = 0; j < polyLen; j++) {
            if (segmentsIntersect(ca, cb, poly[j], poly[(j + 1) % polyLen])) {
              edgesCross = true;
              break outer;
            }
          }
        }
      }

      if (edgesCross) {
        // Trail cuts through this polygon — use grid sampling to measure
        // actual overlap fraction before deciding to remove
        const sampleRes = 6;
        const dx = (pb.maxX - pb.minX) / sampleRes;
        const dz = (pb.maxZ - pb.minZ) / sampleRes;
        let totalIn = 0;
        let overlapIn = 0;
        for (let si = 0; si <= sampleRes; si++) {
          for (let sj = 0; sj <= sampleRes; sj++) {
            const sp: Vec2 = { x: pb.minX + dx * si, z: pb.minZ + dz * sj };
            if (pointInPolygon(sp, poly)) {
              totalIn++;
              if (pointInPolygon(sp, capturedPoly)) overlapIn++;
            }
          }
        }

        if (totalIn > 0 && overlapIn / totalIn > 0.15) {
          changed = true;
          continue;
        }
        // Overlap is tiny (corner clip) — keep the polygon
        newPolygons.push(poly);
        continue;
      }

      if (insideCount > 0) {
        // Minor vertex overlap (< 25%) — rebuild from outside vertices + edge samples
        const outside: Vec2[] = [];
        for (const v of poly) {
          if (!pointInPolygon(v, capturedPoly)) outside.push(v);
        }
        for (let i = 0; i < polyLen; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % polyLen];
          const mid: Vec2 = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
          if (!pointInPolygon(mid, capturedPoly)) outside.push(mid);
        }
        if (outside.length >= 3) {
          newPolygons.push(convexHull(outside));
        }
        changed = true;
        continue;
      }

      newPolygons.push(poly);
    }

    if (changed) {
      this.polygons = newPolygons;
      this.recomputeBounds();
      this.areaDirty = true;
      this.dirty = true;
    }
  }

  getAllEdges(): Array<{ a: Vec2; b: Vec2 }> {
    const edges: Array<{ a: Vec2; b: Vec2 }> = [];
    for (const poly of this.polygons) {
      for (let i = 0; i < poly.length; i++) {
        edges.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
      }
    }
    return edges;
  }

  getNearestBoundaryPoint(p: Vec2): Vec2 {
    let bestDist = Infinity;
    let best: Vec2 = p;

    for (const poly of this.polygons) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const np = nearestPointOnSegment(p, a, b);
        const d = (p.x - np.x) ** 2 + (p.z - np.z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = np;
        }
      }
    }
    return best;
  }

  clear(): void {
    this.polygons = [];
    this.polyBounds = [];
    this.areaDirty = true;
    this.dirty = true;
  }

  private recomputeBounds(): void {
    this.polyBounds = this.polygons.map(computeBounds);
  }

  private consolidate(): void {
    if (this.polygons.length <= 1) return;

    const half = Math.floor(this.polygons.length / 2);
    const merged: Vec2[] = [];
    for (let i = 0; i < half; i++) {
      for (const v of this.polygons[i]) merged.push(v);
    }

    if (merged.length >= 3) {
      const hull = convexHull(merged);
      const newPolys = [hull, ...this.polygons.slice(half)];
      this.polygons = newPolys;
      this.recomputeBounds();
    }
  }
}

function computeBounds(poly: Vec2[]): PolyBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function convexHull(points: Vec2[]): Vec2[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length <= 2) return pts;

  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function nearestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-10) return a;
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * abx, z: a.z + t * abz };
}
