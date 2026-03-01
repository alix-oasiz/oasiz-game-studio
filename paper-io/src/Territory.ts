import { type Vec2, START_RADIUS, START_TERRITORY_SEGMENTS, MAP_SIZE } from './constants.ts';
import { pointInPolygon, polygonArea, createCirclePolygon } from './Collision.ts';

export class Territory {
  polygons: Vec2[][] = [];
  private cachedArea = 0;
  private areaDirty = true;

  /** Create starting territory circle around spawn */
  initAtSpawn(cx: number, cz: number): void {
    this.polygons = [createCirclePolygon(cx, cz, START_RADIUS, START_TERRITORY_SEGMENTS)];
    this.areaDirty = true;
  }

  /** Check if a point is inside any territory polygon */
  containsPoint(p: Vec2): boolean {
    for (const poly of this.polygons) {
      if (pointInPolygon(p, poly)) return true;
    }
    return false;
  }

  /**
   * Capture territory from a closed trail loop.
   * trailPoints: the trail the player drew (starts and ends near territory boundary).
   * We form a closed polygon from the trail and add it to our territory.
   */
  captureFromTrail(trailPoints: Vec2[]): void {
    if (trailPoints.length < 3) return;

    // The trail forms a polygon when we close it (connect last point back to first)
    const newPoly = [...trailPoints];
    this.polygons.push(newPoly);
    this.areaDirty = true;
  }

  /** Compute total area of all territory polygons */
  computeArea(): number {
    if (!this.areaDirty) return this.cachedArea;
    this.cachedArea = 0;
    for (const poly of this.polygons) {
      this.cachedArea += polygonArea(poly);
    }
    this.areaDirty = true; // always recompute since overlaps make caching tricky
    return this.cachedArea;
  }

  /** Get territory percentage of total map */
  getPercentage(): number {
    return (this.computeArea() / (MAP_SIZE * MAP_SIZE)) * 100;
  }

  /** Remove territory that overlaps with another player's new capture.
   *  Only removes a polygon if the majority of its vertices are inside the captured area. */
  removeOverlap(capturedPoly: Vec2[]): void {
    this.polygons = this.polygons.filter(poly => {
      let insideCount = 0;
      for (const v of poly) {
        if (pointInPolygon(v, capturedPoly)) insideCount++;
      }
      // Keep the polygon unless more than half its vertices are captured
      return insideCount < poly.length * 0.6;
    });
    this.areaDirty = true;
  }

  /** Get all polygon edges for collision checking */
  getAllEdges(): Array<{ a: Vec2; b: Vec2 }> {
    const edges: Array<{ a: Vec2; b: Vec2 }> = [];
    for (const poly of this.polygons) {
      for (let i = 0; i < poly.length; i++) {
        edges.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
      }
    }
    return edges;
  }

  /** Find nearest boundary point */
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
    this.areaDirty = true;
  }
}

function getPolygonCentroid(poly: Vec2[]): Vec2 {
  let cx = 0, cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / poly.length, z: cz / poly.length };
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
