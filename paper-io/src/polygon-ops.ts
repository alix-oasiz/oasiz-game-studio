import polygonClipping from "polygon-clipping";
import { type Vec2, START_TERRITORY_SEGMENTS } from "./constants.ts";
import { createCirclePolygon, pointInPolygon } from "./Collision.ts";

export interface TerritoryPolygon {
  outer: Vec2[];
  holes: Vec2[][];
}

export type TerritoryMultiPolygon = TerritoryPolygon[];
export type PolygonBooleanGeom = polygonClipping.MultiPolygon;

const MIN_LOOP_POINTS = 3;
const MIN_POLYGON_AREA = 0.0001;
const MIN_RENDERABLE_HOLE_AREA = 1.5;
const MIN_RENDERABLE_HOLE_SPAN = 1.5;
const MIN_RENDERABLE_FRAGMENT_AREA = 1.5;
const MIN_RENDERABLE_FRAGMENT_SPAN = 1.5;
const POINT_EPSILON = 1e-5;
const COLLINEAR_EPSILON = 1e-7;

function clonePoint(point: Vec2): Vec2 {
  return { x: point.x, z: point.z };
}

function quantize(value: number): number {
  return Math.round(value / POINT_EPSILON) * POINT_EPSILON;
}

function sanitizePoint(point: Vec2): Vec2 | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return {
    x: quantize(point.x),
    z: quantize(point.z),
  };
}

export function cloneLoop(loop: Vec2[]): Vec2[] {
  return loop.map(clonePoint);
}

export function cloneTerritory(
  polygons: TerritoryMultiPolygon,
): TerritoryMultiPolygon {
  return polygons.map((polygon) => ({
    outer: cloneLoop(polygon.outer),
    holes: polygon.holes.map(cloneLoop),
  }));
}

function pointsEqual(a: Vec2, b: Vec2): boolean {
  return (
    Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.z - b.z) <= POINT_EPSILON
  );
}

function segmentLengthSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function isCollinear(prev: Vec2, current: Vec2, next: Vec2): boolean {
  const ax = current.x - prev.x;
  const az = current.z - prev.z;
  const bx = next.x - current.x;
  const bz = next.z - current.z;
  const cross = ax * bz - az * bx;
  if (Math.abs(cross) > COLLINEAR_EPSILON) return false;
  const dot = ax * bx + az * bz;
  return dot >= -COLLINEAR_EPSILON;
}

function cleanupLoop(loop: Vec2[]): Vec2[] {
  const deduped: Vec2[] = [];
  for (const point of loop) {
    const sanitized = sanitizePoint(point);
    if (!sanitized) continue;
    if (
      deduped.length === 0 ||
      !pointsEqual(deduped[deduped.length - 1], sanitized)
    ) {
      deduped.push(sanitized);
    }
  }
  if (
    deduped.length > 1 &&
    pointsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }

  if (deduped.length < MIN_LOOP_POINTS) return deduped;

  let cleaned = deduped;
  let changed = true;
  while (changed && cleaned.length >= MIN_LOOP_POINTS) {
    changed = false;
    const nextLoop: Vec2[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      const prev = cleaned[(i - 1 + cleaned.length) % cleaned.length];
      const current = cleaned[i];
      const next = cleaned[(i + 1) % cleaned.length];
      if (
        pointsEqual(prev, current) ||
        pointsEqual(current, next) ||
        pointsEqual(prev, next) ||
        segmentLengthSq(prev, current) <= POINT_EPSILON * POINT_EPSILON ||
        segmentLengthSq(current, next) <= POINT_EPSILON * POINT_EPSILON ||
        isCollinear(prev, current, next)
      ) {
        changed = true;
        continue;
      }
      nextLoop.push(current);
    }
    cleaned = nextLoop;
  }

  return cleaned;
}

export function signedLoopArea(loop: Vec2[]): number {
  if (loop.length < MIN_LOOP_POINTS) return 0;
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const current = loop[i];
    const next = loop[(i + 1) % loop.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area * 0.5;
}

export function loopArea(loop: Vec2[]): number {
  return Math.abs(signedLoopArea(loop));
}

function loopBounds(loop: Vec2[]): { width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of loop) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return {
    width: maxX - minX,
    height: maxZ - minZ,
  };
}

function isRenderableHole(loop: Vec2[]): boolean {
  if (loop.length < MIN_LOOP_POINTS) return false;
  if (loopArea(loop) < MIN_RENDERABLE_HOLE_AREA) return false;
  const bounds = loopBounds(loop);
  return (
    bounds.width >= MIN_RENDERABLE_HOLE_SPAN &&
    bounds.height >= MIN_RENDERABLE_HOLE_SPAN
  );
}

function isTinyFragment(loop: Vec2[]): boolean {
  if (loop.length < MIN_LOOP_POINTS) return true;
  const area = loopArea(loop);
  if (area < MIN_RENDERABLE_FRAGMENT_AREA) return true;
  const bounds = loopBounds(loop);
  return (
    bounds.width < MIN_RENDERABLE_FRAGMENT_SPAN &&
    bounds.height < MIN_RENDERABLE_FRAGMENT_SPAN
  );
}

export function sanitizeTerritory(
  polygons: TerritoryMultiPolygon,
): TerritoryMultiPolygon {
  return polygons
    .map((polygon) => ({
      outer: cleanupLoop(polygon.outer),
      holes: polygon.holes
        .map((hole) => cleanupLoop(hole))
        .filter(isRenderableHole),
    }))
    .filter(
      (polygon) =>
        polygon.outer.length >= MIN_LOOP_POINTS &&
        loopArea(polygon.outer) >= MIN_POLYGON_AREA &&
        !isTinyFragment(polygon.outer),
    );
}

function ensureOrientation(loop: Vec2[], clockwise: boolean): Vec2[] {
  const cleaned = cleanupLoop(loop);
  if (cleaned.length < MIN_LOOP_POINTS) return [];
  const isClockwise = signedLoopArea(cleaned) < 0;
  if (isClockwise === clockwise) return cleaned;
  return cleaned.reverse();
}

function closeRing(loop: Vec2[], clockwise: boolean): polygonClipping.Ring {
  const oriented = ensureOrientation(loop, clockwise);
  if (oriented.length < MIN_LOOP_POINTS) return [];
  const ring = oriented.map(
    (point) => [point.x, point.z] as polygonClipping.Pair,
  );
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

export function territoryToBooleanGeom(
  polygons: TerritoryMultiPolygon,
): PolygonBooleanGeom {
  const result: PolygonBooleanGeom = [];
  for (const polygon of sanitizeTerritory(polygons)) {
    const outer = closeRing(polygon.outer, false);
    if (outer.length < MIN_LOOP_POINTS + 1) continue;
    const rings: polygonClipping.Polygon = [outer];
    for (const hole of polygon.holes) {
      const ring = closeRing(hole, true);
      if (ring.length >= MIN_LOOP_POINTS + 1) rings.push(ring);
    }
    result.push(rings);
  }
  return result;
}

export function booleanGeomToTerritory(
  geom: PolygonBooleanGeom,
): TerritoryMultiPolygon {
  const polygons: TerritoryMultiPolygon = [];
  for (const polygon of geom) {
    if (polygon.length === 0) continue;
    const [outerRing, ...holeRings] = polygon;
    const outer = cleanupLoop(
      outerRing.map(([x, z]) => ({
        x,
        z,
      })),
    );
    if (loopArea(outer) < MIN_POLYGON_AREA) continue;
    const holes = holeRings
      .map((ring) =>
        cleanupLoop(
          ring.map(([x, z]) => ({
            x,
            z,
          })),
        ),
      )
      .filter((ring) => loopArea(ring) >= MIN_POLYGON_AREA);
    polygons.push({
      outer,
      holes,
    });
  }
  return sanitizeTerritory(polygons);
}

export function unionTerritories(
  a: TerritoryMultiPolygon,
  b: TerritoryMultiPolygon,
): TerritoryMultiPolygon {
  const subject = sanitizeTerritory(a);
  const clip = sanitizeTerritory(b);
  if (subject.length === 0) return cloneTerritory(clip);
  if (clip.length === 0) return cloneTerritory(subject);
  return booleanGeomToTerritory(
    polygonClipping.union(
      territoryToBooleanGeom(subject),
      territoryToBooleanGeom(clip),
    ),
  );
}

export function differenceTerritories(
  subject: TerritoryMultiPolygon,
  clip: TerritoryMultiPolygon,
): TerritoryMultiPolygon {
  const sanitizedSubject = sanitizeTerritory(subject);
  const sanitizedClip = sanitizeTerritory(clip);
  if (sanitizedSubject.length === 0) return [];
  if (sanitizedClip.length === 0) return cloneTerritory(sanitizedSubject);
  return booleanGeomToTerritory(
    polygonClipping.difference(
      territoryToBooleanGeom(sanitizedSubject),
      territoryToBooleanGeom(sanitizedClip),
    ),
  );
}

export function createCircleTerritory(
  cx: number,
  cz: number,
  radius: number,
  segments = START_TERRITORY_SEGMENTS,
): TerritoryMultiPolygon {
  return [
    {
      outer: createCirclePolygon(cx, cz, radius, segments),
      holes: [],
    },
  ];
}

export function territoryArea(polygons: TerritoryMultiPolygon): number {
  let total = 0;
  for (const polygon of polygons) {
    total += loopArea(polygon.outer);
    for (const hole of polygon.holes) total -= loopArea(hole);
  }
  return total;
}

export function pointInTerritory(
  point: Vec2,
  polygons: TerritoryMultiPolygon,
): boolean {
  for (const polygon of polygons) {
    if (!pointInPolygon(point, polygon.outer)) continue;
    let insideHole = false;
    for (const hole of polygon.holes) {
      if (pointInPolygon(point, hole)) {
        insideHole = true;
        break;
      }
    }
    if (!insideHole) return true;
  }
  return false;
}

export function territoryBounds(polygons: TerritoryMultiPolygon): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const polygon of polygons) {
    for (const point of polygon.outer) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    }
    for (const hole of polygon.holes) {
      for (const point of hole) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.z < minZ) minZ = point.z;
        if (point.z > maxZ) maxZ = point.z;
      }
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ };
}

function ringCentroid(loop: Vec2[]): { x: number; z: number; area: number } {
  let twiceArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < loop.length; i++) {
    const current = loop[i];
    const next = loop[(i + 1) % loop.length];
    const cross = current.x * next.z - next.x * current.z;
    twiceArea += cross;
    cx += (current.x + next.x) * cross;
    cz += (current.z + next.z) * cross;
  }
  const area = twiceArea * 0.5;
  if (Math.abs(area) < MIN_POLYGON_AREA) {
    return { x: loop[0]?.x ?? 0, z: loop[0]?.z ?? 0, area: 0 };
  }
  return {
    x: cx / (6 * area),
    z: cz / (6 * area),
    area,
  };
}

export function territoryCentroid(polygons: TerritoryMultiPolygon): Vec2 {
  let sumX = 0;
  let sumZ = 0;
  let totalArea = 0;
  for (const polygon of polygons) {
    const outer = ringCentroid(polygon.outer);
    sumX += outer.x * Math.abs(outer.area);
    sumZ += outer.z * Math.abs(outer.area);
    totalArea += Math.abs(outer.area);
    for (const hole of polygon.holes) {
      const inner = ringCentroid(hole);
      sumX -= inner.x * Math.abs(inner.area);
      sumZ -= inner.z * Math.abs(inner.area);
      totalArea -= Math.abs(inner.area);
    }
  }
  if (totalArea <= MIN_POLYGON_AREA) return { x: 0, z: 0 };
  return { x: sumX / totalArea, z: sumZ / totalArea };
}

function createSegmentPolygon(
  a: Vec2,
  b: Vec2,
  halfWidth: number,
): TerritoryPolygon[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-5) return [];
  const nx = -dz / length;
  const nz = dx / length;
  return [
    {
      outer: [
        { x: a.x + nx * halfWidth, z: a.z + nz * halfWidth },
        { x: b.x + nx * halfWidth, z: b.z + nz * halfWidth },
        { x: b.x - nx * halfWidth, z: b.z - nz * halfWidth },
        { x: a.x - nx * halfWidth, z: a.z - nz * halfWidth },
      ],
      holes: [],
    },
  ];
}

export function createPolylineStroke(
  trail: Vec2[],
  width: number,
): TerritoryMultiPolygon {
  if (trail.length === 0) return [];
  const halfWidth = width * 0.5;
  let stroke: TerritoryMultiPolygon = [];

  for (let i = 0; i < trail.length; i++) {
    stroke = unionTerritories(
      stroke,
      createCircleTerritory(trail[i].x, trail[i].z, halfWidth, 10),
    );
    if (i < trail.length - 1) {
      stroke = unionTerritories(
        stroke,
        createSegmentPolygon(trail[i], trail[i + 1], halfWidth),
      );
    }
  }

  return stroke;
}
