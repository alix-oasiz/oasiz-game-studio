import { ARENA_AREA, START_RADIUS, type Vec2 } from "./constants.ts";
import { nearestPointOnPolygon, pointInPolygon } from "./Collision.ts";
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

export interface CaptureResult {
  affected: Set<number>;
  capturedRegion: TerritoryMultiPolygon;
  netAreaGained: number;
}

export interface TransferResult {
  changed: boolean;
  affected: Set<number>;
  transferredArea: number;
}

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

function triangleCentroid(a: Vec2, b: Vec2, c: Vec2): Vec2 {
  return {
    x: (a.x + b.x + c.x) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
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

function normalizeVec2(vector: Vec2): Vec2 {
  const length = Math.sqrt(vector.x * vector.x + vector.z * vector.z) || 1;
  return { x: vector.x / length, z: vector.z / length };
}

function createTrailRibbonRegion(
  trailPoints: Vec2[],
  width: number,
  startTangent: Vec2 | null = null,
): TerritoryMultiPolygon {
  if (trailPoints.length < 2) return [];

  const halfWidth = width * 0.5;
  const blendPoints = 4;
  const normalizedStartTangent =
    startTangent && (startTangent.x !== 0 || startTangent.z !== 0)
      ? normalizeVec2(startTangent)
      : null;
  const leftPath: Vec2[] = [];
  const rightPath: Vec2[] = [];

  for (let i = 0; i < trailPoints.length; i++) {
    let dx: number;
    let dz: number;
    if (i === 0) {
      dx = trailPoints[1].x - trailPoints[0].x;
      dz = trailPoints[1].z - trailPoints[0].z;
    } else if (i === trailPoints.length - 1) {
      dx = trailPoints[i].x - trailPoints[i - 1].x;
      dz = trailPoints[i].z - trailPoints[i - 1].z;
    } else {
      dx = trailPoints[i + 1].x - trailPoints[i - 1].x;
      dz = trailPoints[i + 1].z - trailPoints[i - 1].z;
    }

    const alongDir = normalizeVec2({ x: dx, z: dz });
    const trailSide = { x: -alongDir.z, z: alongDir.x };
    let widthDir = trailSide;

    if (normalizedStartTangent && i < blendPoints) {
      let tangent = normalizedStartTangent;
      if (tangent.x * trailSide.x + tangent.z * trailSide.z < 0) {
        tangent = { x: -tangent.x, z: -tangent.z };
      }
      const t = i / Math.max(1, blendPoints - 1);
      widthDir = normalizeVec2({
        x: tangent.x * (1 - t) + trailSide.x * t,
        z: tangent.z * (1 - t) + trailSide.z * t,
      });
    }

    leftPath.push({
      x: trailPoints[i].x + widthDir.x * halfWidth,
      z: trailPoints[i].z + widthDir.z * halfWidth,
    });
    rightPath.push({
      x: trailPoints[i].x - widthDir.x * halfWidth,
      z: trailPoints[i].z - widthDir.z * halfWidth,
    });
  }

  const outer = normalizeLoop([...leftPath, ...rightPath.reverse()]);
  if (outer.length < 3) {
    return createPolylineStroke(trailPoints, width);
  }

  const ribbonRegion = sanitizeTerritory([{ outer, holes: [] }]);
  return ribbonRegion.length > 0
    ? ribbonRegion
    : createPolylineStroke(trailPoints, width);
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

function topologySignature(polygons: TerritoryMultiPolygon): string {
  let holes = 0;
  let outerPoints = 0;
  let holePoints = 0;
  for (const polygon of polygons) {
    holes += polygon.holes.length;
    outerPoints += polygon.outer.length;
    for (const hole of polygon.holes) {
      holePoints += hole.length;
    }
  }
  return polygons.length + ":" + holes + ":" + outerPoints + ":" + holePoints;
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

  getPolygonsView(): TerritoryMultiPolygon {
    return this.polygons;
  }

  initAtSpawn(cx: number, cz: number): void {
    this.setPolygons(createCircleTerritory(cx, cz, START_RADIUS), "spawn");
  }

  containsPoint(point: Vec2): boolean {
    return pointInTerritory(point, this.polygons);
  }

  async resolveTrailReturn(
    trailPoints: Vec2[],
    trailStartTangent: Vec2 | null = null,
  ): Promise<CaptureResult> {
    const path = normalizeLoop(trailPoints);
    if (path.length < 2) {
      return {
        affected: new Set(),
        capturedRegion: [],
        netAreaGained: 0,
      };
    }
    const reconnectClaim = this.getReconnectTrailClaim(path, trailStartTangent);
    if (reconnectClaim) {
      return this.connectDisconnectedTerritoriesWithTrail(reconnectClaim);
    }
    return this.captureFromTrail(path);
  }

  async captureFromTrail(trailPoints: Vec2[]): Promise<CaptureResult> {
    const capturedRegion = this.buildCaptureRegion(trailPoints);
    if (capturedRegion.length === 0) {
      return {
        affected: new Set(),
        capturedRegion: [],
        netAreaGained: 0,
      };
    }

    const previousArea = this.computeArea();
    const nextPolygons = unionTerritories(this.polygons, capturedRegion);
    const nextArea = territoryArea(nextPolygons);
    if (nextArea <= previousArea + AREA_EPSILON) {
      return {
        affected: new Set(),
        capturedRegion: [],
        netAreaGained: 0,
      };
    }

    this.setPolygons(nextPolygons, "capture");
    const affected = await this.cropRegionFromOthers(capturedRegion);
    const fillRegion = this.fillEnclosedVoids();
    const finalCapturedRegion =
      fillRegion.length > 0
        ? unionTerritories(capturedRegion, fillRegion)
        : capturedRegion;
    const finalArea = this.computeArea();
    return {
      affected,
      capturedRegion: finalCapturedRegion,
      netAreaGained: Math.max(0, finalArea - previousArea),
    };
  }

  async claimTrailLine(trailPoints: Vec2[]): Promise<Set<number>> {
    if (trailPoints.length < 2) return new Set();
    const claimedRegion = createPolylineStroke(trailPoints, TRAIL_CLAIM_WIDTH);
    if (claimedRegion.length === 0) return new Set();
    const beforeArea = this.computeArea();
    this.setPolygons(
      unionTerritories(this.polygons, claimedRegion),
      "claimTrailLine",
    );
    const affected = await this.cropRegionFromOthers(claimedRegion);
    this.fillEnclosedVoids();
    return affected;
  }

  computeArea(): number {
    if (this.cachedArea >= 0) return this.cachedArea;
    this.cachedArea = territoryArea(this.polygons);
    return this.cachedArea;
  }

  getPercentage(): number {
    return (this.computeArea() / ARENA_AREA) * 100;
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

    const approxBoundary = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
    return this.getNearestBoundaryPoint(approxBoundary);
  }

  getTrailReturnContact(fromPoint: Vec2, toPoint: Vec2): Vec2 | null {
    if (!this.hasTerritory()) return null;
    if (this.containsPoint(toPoint)) {
      return this.projectExitPoint(toPoint, fromPoint);
    }

    const STEPS = 10;
    let previousSample = { x: fromPoint.x, z: fromPoint.z };
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const sample = {
        x: fromPoint.x + (toPoint.x - fromPoint.x) * t,
        z: fromPoint.z + (toPoint.z - fromPoint.z) * t,
      };
      if (this.containsPoint(sample)) {
        return this.projectExitPoint(sample, previousSample);
      }
      previousSample = sample;
    }

    return null;
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

  async transferTo(
    playerId: number,
    extraClaimPaths: Vec2[][] = [],
    extraClaimRegions: TerritoryMultiPolygon[] = [],
  ): Promise<TransferResult | null> {
    if (this.polygons.length === 0) return null;
    const target = this.grid.getTerritory(playerId);
    if (!target) return null;
    let claimedRegion = cloneTerritory(this.polygons);
    for (const path of extraClaimPaths) {
      if (path.length < 2) continue;
      claimedRegion = unionTerritories(
        claimedRegion,
        createPolylineStroke(path, TRAIL_CLAIM_WIDTH),
      );
    }
    for (const region of extraClaimRegions) {
      if (region.length === 0) continue;
      claimedRegion = unionTerritories(claimedRegion, region);
    }

    const killerBeforeArea = target.computeArea();
    const affected = await target.cropRegionFromOthers(
      claimedRegion,
      new Set([this.playerId, playerId]),
    );
    target.unionRegion(claimedRegion);
    target.fillEnclosedVoids();
    const killerAfterArea = target.computeArea();
    this.clear();
    return {
      changed: killerAfterArea > killerBeforeArea + AREA_EPSILON,
      affected,
      transferredArea: Math.max(0, killerAfterArea - killerBeforeArea),
    };
  }

  invalidateCache(): void {
    this.cachedArea = -1;
  }

  private setPolygons(
    polygons: TerritoryMultiPolygon,
    _reason = "unknown",
  ): void {
    this.polygons = sanitizeTerritory(polygons);
    this.dirty = true;
    this.cachedArea = -1;
  }

  private unionRegion(region: TerritoryMultiPolygon): void {
    this.setPolygons(unionTerritories(this.polygons, region), "unionRegion");
  }

  private getReconnectTrailClaim(
    trailPoints: Vec2[],
    trailStartTangent: Vec2 | null = null,
  ): TerritoryMultiPolygon | null {
    if (this.polygons.length < 2 || trailPoints.length < 2) return null;
    const claimedRegion = createTrailRibbonRegion(
      trailPoints,
      TRAIL_CLAIM_WIDTH,
      trailStartTangent,
    );
    if (claimedRegion.length === 0) return null;
    const previousArea = this.computeArea();
    const nextPolygons = unionTerritories(this.polygons, claimedRegion);
    const nextArea = territoryArea(nextPolygons);
    if (nextArea <= previousArea + AREA_EPSILON) return null;
    if (nextPolygons.length >= this.polygons.length) return null;
    return claimedRegion;
  }

  private async connectDisconnectedTerritoriesWithTrail(
    claimedRegion: TerritoryMultiPolygon,
  ): Promise<CaptureResult> {
    const previousArea = this.computeArea();
    const nextPolygons = unionTerritories(this.polygons, claimedRegion);
    this.setPolygons(nextPolygons, "reconnectTrail");
    const affected = await this.cropRegionFromOthers(claimedRegion);
    const fillRegion = this.fillEnclosedVoids();
    const finalCapturedRegion =
      fillRegion.length > 0
        ? unionTerritories(claimedRegion, fillRegion)
        : claimedRegion;
    const finalArea = this.computeArea();
    return {
      affected,
      capturedRegion: finalCapturedRegion,
      netAreaGained: Math.max(0, finalArea - previousArea),
    };
  }

  private findInteriorPoint(loop: Vec2[]): Vec2 | null {
    if (loop.length < 3) return null;

    const centroid = territoryCentroid([{ outer: loop, holes: [] }]);
    if (pointInPolygon(centroid, loop)) {
      return centroid;
    }

    for (let i = 1; i < loop.length - 1; i++) {
      const candidate = triangleCentroid(loop[0], loop[i], loop[i + 1]);
      if (pointInPolygon(candidate, loop)) {
        return candidate;
      }
    }

    return null;
  }

  private fillEnclosedVoids(): TerritoryMultiPolygon {
    let fillRegion: TerritoryMultiPolygon = [];

    for (const polygon of this.polygons) {
      for (const hole of polygon.holes) {
        if (loopArea(hole) <= AREA_EPSILON) continue;

        const samplePoint = this.findInteriorPoint(hole);
        if (!samplePoint) continue;

        let occupiedByOther = false;
        for (const territory of this.grid.getTerritories()) {
          if (
            territory.playerId === this.playerId ||
            !territory.hasTerritory()
          ) {
            continue;
          }
          if (territory.containsPoint(samplePoint)) {
            occupiedByOther = true;
            break;
          }
        }

        if (!occupiedByOther) {
          fillRegion = unionTerritories(fillRegion, [
            {
              outer: cloneLoop(hole),
              holes: [],
            },
          ]);
        }
      }
    }

    if (fillRegion.length > 0) {
      this.setPolygons(
        unionTerritories(this.polygons, fillRegion),
        "fillEnclosedVoids",
      );
    }

    return fillRegion;
  }

  private async cropRegionFromOthers(
    region: TerritoryMultiPolygon,
    excludedPlayerIds: Set<number> = new Set(),
  ): Promise<Set<number>> {
    const affected = new Set<number>();
    for (const territory of this.grid.getTerritories()) {
      if (
        territory.playerId === this.playerId ||
        excludedPlayerIds.has(territory.playerId) ||
        !territory.hasTerritory()
      ) {
        continue;
      }
      const changed = await territory.subtractRegion(region);
      if (changed) affected.add(territory.playerId);
    }
    return affected;
  }

  private async subtractRegion(
    region: TerritoryMultiPolygon,
  ): Promise<boolean> {
    const before = this.computeArea();
    const beforeSignature = topologySignature(this.polygons);
    const nextPolygons = await this.grid.difference(this.polygons, region);
    const nextArea = territoryArea(nextPolygons);
    const nextSignature = topologySignature(nextPolygons);
    if (Math.abs(nextArea - before) <= AREA_EPSILON) {
      if (beforeSignature !== nextSignature) {
        this.setPolygons(nextPolygons, "subtractRegion-topology");
        return true;
      }
      return false;
    }
    this.setPolygons(nextPolygons, "subtractRegion");
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
