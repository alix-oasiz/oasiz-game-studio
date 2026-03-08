import { MAP_SIZE, START_RADIUS, type Vec2 } from "./constants.ts";
import { nearestPointOnPolygon } from "./Collision.ts";
import {
  booleanGeomToTerritory,
  cloneLoop,
  cloneTerritory,
  createCircleTerritory,
  createPolylineStroke,
  differenceTerritories,
  loopArea,
  pointInTerritory,
  sanitizeTerritory,
  signedLoopArea,
  territoryArea,
  territoryBounds,
  territoryCentroid,
  territoryToBooleanGeom,
  type TerritoryMultiPolygon,
  type TerritoryPolygon,
  unionTerritories,
} from "./polygon-ops.ts";
import { TerritoryWorkerClient } from "./territory-worker-client.ts";

const TRAIL_CLAIM_WIDTH = 0.5;
const AREA_EPSILON = 0.0001;

function isLikelyIOSWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIOS && /AppleWebKit/i.test(ua);
}

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function pointsEqual(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
}

function normalizeLoop(loop: Vec2[]): Vec2[] {
  const deduped: Vec2[] = [];
  for (const point of loop) {
    if (
      deduped.length === 0 ||
      !pointsEqual(deduped[deduped.length - 1], point)
    ) {
      deduped.push({ x: point.x, z: point.z });
    }
  }
  if (
    deduped.length > 1 &&
    pointsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }
  return deduped;
}

function nearestLoopVertexIndex(point: Vec2, loop: Vec2[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < loop.length; i++) {
    const distance = distSq(point, loop[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function collectBoundaryArc(
  loop: Vec2[],
  fromIndex: number,
  toIndex: number,
  direction: 1 | -1,
  fromPoint: Vec2,
  toPoint: Vec2,
): Vec2[] {
  const result: Vec2[] = [{ x: fromPoint.x, z: fromPoint.z }];
  const count = loop.length;
  if (count === 0) return result;
  let index = fromIndex;
  let guard = 0;
  while (index !== toIndex && guard < count + 2) {
    index = (index + direction + count) % count;
    result.push({ x: loop[index].x, z: loop[index].z });
    guard++;
  }
  if (!pointsEqual(result[result.length - 1], toPoint)) {
    result.push({ x: toPoint.x, z: toPoint.z });
  }
  return normalizeLoop(result);
}

type BoundarySegment = {
  index: number;
  a: Vec2;
  b: Vec2;
  point: Vec2;
  distanceSq: number;
};

function nearestBoundarySegment(
  loop: Vec2[],
  point: Vec2,
): BoundarySegment | null {
  if (loop.length < 2) return null;
  let best: BoundarySegment | null = null;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const ab2 = abx * abx + abz * abz;
    if (ab2 < 1e-8) continue;
    const apx = point.x - a.x;
    const apz = point.z - a.z;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
    const projected = {
      x: a.x + abx * t,
      z: a.z + abz * t,
    };
    const distanceSq = distSq(projected, point);
    if (!best || distanceSq < best.distanceSq) {
      best = {
        index: i,
        a,
        b,
        point: projected,
        distanceSq,
      };
    }
  }
  return best;
}

function insertBoundaryPoint(
  loop: Vec2[],
  point: Vec2,
  segmentIndex: number,
): { loop: Vec2[]; index: number } {
  const count = loop.length;
  if (count === 0) return { loop: [], index: 0 };

  const startIndex = ((segmentIndex % count) + count) % count;
  const nextIndex = (startIndex + 1) % count;
  const start = loop[startIndex];
  const end = loop[nextIndex];

  if (pointsEqual(point, start))
    return { loop: cloneLoop(loop), index: startIndex };
  if (pointsEqual(point, end))
    return { loop: cloneLoop(loop), index: nextIndex };

  const nextLoop = cloneLoop(loop);
  nextLoop.splice(startIndex + 1, 0, { x: point.x, z: point.z });
  return { loop: nextLoop, index: startIndex + 1 };
}

export class TerritoryGrid {
  private readonly territories = new Map<number, Territory>();
  private readonly worker = new TerritoryWorkerClient();
  private readonly useWorker = !isLikelyIOSWebKit();

  registerTerritory(playerId: number, territory: Territory): void {
    this.territories.set(playerId, territory);
  }

  getTerritory(playerId: number): Territory | undefined {
    return this.territories.get(playerId);
  }

  getTerritories(): IterableIterator<Territory> {
    return this.territories.values();
  }

  getPolygons(playerId: number): TerritoryMultiPolygon | null {
    return this.territories.get(playerId)?.getPolygons() ?? null;
  }

  getBounds(playerId: number): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  } | null {
    const territory = this.territories.get(playerId);
    return territory ? territoryBounds(territory.getPolygons()) : null;
  }

  async difference(
    subject: TerritoryMultiPolygon,
    clip: TerritoryMultiPolygon,
  ): Promise<TerritoryMultiPolygon> {
    const sanitizedSubject = sanitizeTerritory(subject);
    const sanitizedClip = sanitizeTerritory(clip);
    if (sanitizedSubject.length === 0 || sanitizedClip.length === 0)
      return cloneTerritory(sanitizedSubject);
    if (!this.useWorker) {
      return differenceTerritories(sanitizedSubject, sanitizedClip);
    }
    try {
      const result = await this.worker.difference(
        territoryToBooleanGeom(sanitizedSubject),
        territoryToBooleanGeom(sanitizedClip),
      );
      return booleanGeomToTerritory(result);
    } catch (error) {
      try {
        return differenceTerritories(sanitizedSubject, sanitizedClip);
      } catch (fallbackError) {
        console.warn("[TerritoryGrid] Difference failed; keeping subject", {
          error,
          fallbackError,
        });
        return cloneTerritory(sanitizedSubject);
      }
    }
  }
}

export class Territory {
  readonly playerId: number;
  dirty = true;

  private readonly grid: TerritoryGrid;
  private polygons: TerritoryMultiPolygon = [];
  private cachedArea = -1;

  constructor(grid: TerritoryGrid, playerId: number) {
    this.grid = grid;
    this.playerId = playerId;
    this.grid.registerTerritory(playerId, this);
  }

  getPolygons(): TerritoryMultiPolygon {
    return cloneTerritory(this.polygons);
  }

  initAtSpawn(cx: number, cz: number): void {
    this.setPolygons(createCircleTerritory(cx, cz, START_RADIUS));
  }

  containsPoint(point: Vec2): boolean {
    return pointInTerritory(point, this.polygons);
  }

  async captureFromTrail(trailPoints: Vec2[]): Promise<Set<number>> {
    const capturedRegion = this.buildCaptureRegion(trailPoints);
    if (capturedRegion.length === 0) return new Set();

    const previousArea = this.computeArea();
    const nextPolygons = unionTerritories(this.polygons, capturedRegion);
    const nextArea = territoryArea(nextPolygons);
    if (nextArea <= previousArea + AREA_EPSILON) return new Set();

    this.setPolygons(nextPolygons);
    return this.cropRegionFromOthers(capturedRegion);
  }

  async claimTrailLine(trailPoints: Vec2[]): Promise<Set<number>> {
    if (trailPoints.length < 2) return new Set();
    const claimedRegion = createPolylineStroke(trailPoints, TRAIL_CLAIM_WIDTH);
    if (claimedRegion.length === 0) return new Set();
    this.setPolygons(unionTerritories(this.polygons, claimedRegion));
    return this.cropRegionFromOthers(claimedRegion);
  }

  computeArea(): number {
    if (this.cachedArea >= 0) return this.cachedArea;
    this.cachedArea = territoryArea(this.polygons);
    return this.cachedArea;
  }

  getPercentage(): number {
    return (this.computeArea() / (MAP_SIZE * MAP_SIZE)) * 100;
  }

  getNearestBoundaryPoint(point: Vec2): Vec2 {
    let bestPoint = { x: point.x, z: point.z };
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const polygon of this.polygons) {
      const outerPoint = nearestPointOnPolygon(point, polygon.outer);
      const outerDistance = distSq(point, outerPoint);
      if (outerDistance < bestDistance) {
        bestDistance = outerDistance;
        bestPoint = outerPoint;
      }
      for (const hole of polygon.holes) {
        const holePoint = nearestPointOnPolygon(point, hole);
        const holeDistance = distSq(point, holePoint);
        if (holeDistance < bestDistance) {
          bestDistance = holeDistance;
          bestPoint = holePoint;
        }
      }
    }

    return bestPoint;
  }

  projectExitPoint(inside: Vec2, outside: Vec2): Vec2 {
    let a = { x: inside.x, z: inside.z };
    let b = { x: outside.x, z: outside.z };

    for (let i = 0; i < 12; i++) {
      const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      if (this.containsPoint(mid)) a = mid;
      else b = mid;
    }

    return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  }

  getBoundaryTangent(point: Vec2, moveDir: Vec2): Vec2 {
    let bestSegment: BoundarySegment | null = null;

    for (const polygon of this.polygons) {
      const outer = nearestBoundarySegment(polygon.outer, point);
      if (
        outer &&
        (!bestSegment || outer.distanceSq < bestSegment.distanceSq)
      ) {
        bestSegment = outer;
      }
      for (const hole of polygon.holes) {
        const inner = nearestBoundarySegment(hole, point);
        if (
          inner &&
          (!bestSegment || inner.distanceSq < bestSegment.distanceSq)
        ) {
          bestSegment = inner;
        }
      }
    }

    if (!bestSegment) {
      const length =
        Math.sqrt(moveDir.x * moveDir.x + moveDir.z * moveDir.z) || 1;
      return { x: -moveDir.z / length, z: moveDir.x / length };
    }

    let tx = bestSegment.b.x - bestSegment.a.x;
    let tz = bestSegment.b.z - bestSegment.a.z;
    const length = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= length;
    tz /= length;

    const refTx = -moveDir.z;
    const refTz = moveDir.x;
    if (tx * refTx + tz * refTz < 0) {
      tx = -tx;
      tz = -tz;
    }

    return { x: tx, z: tz };
  }

  hasTerritory(): boolean {
    return this.polygons.length > 0 && this.computeArea() > AREA_EPSILON;
  }

  getCentroid(): Vec2 {
    return territoryCentroid(this.polygons);
  }

  clear(): void {
    this.setPolygons([]);
  }

  async transferTo(playerId: number): Promise<{ changed: boolean } | null> {
    if (this.polygons.length === 0) return null;
    const target = this.grid.getTerritory(playerId);
    if (!target) return null;
    target.unionRegion(this.polygons);
    this.clear();
    return { changed: true };
  }

  invalidateCache(): void {
    this.cachedArea = -1;
  }

  private setPolygons(polygons: TerritoryMultiPolygon): void {
    this.polygons = sanitizeTerritory(polygons);
    this.dirty = true;
    this.cachedArea = -1;
  }

  private unionRegion(region: TerritoryMultiPolygon): void {
    this.setPolygons(unionTerritories(this.polygons, region));
  }

  private async cropRegionFromOthers(
    region: TerritoryMultiPolygon,
  ): Promise<Set<number>> {
    const affected = new Set<number>();
    for (const territory of this.grid.getTerritories()) {
      if (territory.playerId === this.playerId || !territory.hasTerritory())
        continue;
      const changed = await territory.subtractRegion(region);
      if (changed) affected.add(territory.playerId);
    }
    return affected;
  }

  private async subtractRegion(
    region: TerritoryMultiPolygon,
  ): Promise<boolean> {
    const before = this.computeArea();
    const nextPolygons = await this.grid.difference(this.polygons, region);
    const nextArea = territoryArea(nextPolygons);
    if (Math.abs(nextArea - before) <= AREA_EPSILON) return false;
    this.setPolygons(nextPolygons);
    return true;
  }

  private buildCaptureRegion(trailPoints: Vec2[]): TerritoryMultiPolygon {
    const path = normalizeLoop(trailPoints);
    if (path.length < 3 || this.polygons.length === 0) return [];

    const start = path[0];
    const end = path[path.length - 1];

    let bestPolygon: TerritoryPolygon | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const polygon of this.polygons) {
      const score =
        distSq(nearestPointOnPolygon(start, polygon.outer), start) +
        distSq(nearestPointOnPolygon(end, polygon.outer), end);
      if (score < bestScore) {
        bestScore = score;
        bestPolygon = polygon;
      }
    }

    if (!bestPolygon) return [];

    const boundary = bestPolygon.outer;
    const startSegment = nearestBoundarySegment(boundary, start);
    if (!startSegment) return [];
    const withStart = insertBoundaryPoint(
      boundary,
      startSegment.point,
      startSegment.index,
    );

    const endSegment = nearestBoundarySegment(withStart.loop, end);
    if (!endSegment) return [];
    const withEnd = insertBoundaryPoint(
      withStart.loop,
      endSegment.point,
      endSegment.index,
    );

    const startBoundary = withStart.loop[withStart.index];
    const endBoundary = withEnd.loop[withEnd.index];
    const boundaryStartIndex = nearestLoopVertexIndex(
      startBoundary,
      withEnd.loop,
    );
    const boundaryEndIndex = nearestLoopVertexIndex(endBoundary, withEnd.loop);

    const resolvedPath = cloneLoop(path);
    resolvedPath[0] = startBoundary;
    resolvedPath[resolvedPath.length - 1] = endBoundary;

    const arcForward = collectBoundaryArc(
      withEnd.loop,
      boundaryEndIndex,
      boundaryStartIndex,
      1,
      endBoundary,
      startBoundary,
    );
    const arcBackward = collectBoundaryArc(
      withEnd.loop,
      boundaryEndIndex,
      boundaryStartIndex,
      -1,
      endBoundary,
      startBoundary,
    );

    const candidateA: TerritoryMultiPolygon = [
      {
        outer: normalizeLoop([...resolvedPath, ...arcForward.slice(1)]),
        holes: [],
      },
    ];
    const candidateB: TerritoryMultiPolygon = [
      {
        outer: normalizeLoop([...resolvedPath, ...arcBackward.slice(1)]),
        holes: [],
      },
    ];

    const gainA = this.captureGain(candidateA);
    const gainB = this.captureGain(candidateB);
    const validA = gainA > AREA_EPSILON;
    const validB = gainB > AREA_EPSILON;
    if (!validA && !validB) {
      return [];
    }

    let chosen: TerritoryMultiPolygon;
    if (validA && validB) {
      chosen = gainA <= gainB ? candidateA : candidateB;
    } else {
      chosen = validA ? candidateA : candidateB;
    }

    if (
      chosen[0].outer.length < 3 ||
      loopArea(chosen[0].outer) <= AREA_EPSILON
    ) {
      return [];
    }

    if (signedLoopArea(chosen[0].outer) > 0) {
      chosen[0].outer.reverse();
    }

    return chosen;
  }

  private captureGain(candidate: TerritoryMultiPolygon): number {
    return (
      territoryArea(unionTerritories(this.polygons, candidate)) -
      territoryArea(this.polygons)
    );
  }
}
