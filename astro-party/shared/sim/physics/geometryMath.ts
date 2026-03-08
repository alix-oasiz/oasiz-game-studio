export interface Vec2 {
  x: number;
  y: number;
}

export function getAsteroidWorldVertices(asteroid: {
  x: number;
  y: number;
  angle: number;
  vertices: ReadonlyArray<Vec2>;
}): Vec2[] {
  const cos = Math.cos(asteroid.angle);
  const sin = Math.sin(asteroid.angle);
  return asteroid.vertices.map((vertex) => ({
    x: asteroid.x + vertex.x * cos - vertex.y * sin,
    y: asteroid.y + vertex.x * sin + vertex.y * cos,
  }));
}

export function pointInPolygon(
  x: number,
  y: number,
  vertices: ReadonlyArray<Vec2>,
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const orient = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);

  const onSegment = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ): boolean =>
    Math.min(px, qx) <= rx &&
    rx <= Math.max(px, qx) &&
    Math.min(py, qy) <= ry &&
    ry <= Math.max(py, qy);

  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;

  const eps = 1e-9;
  if (Math.abs(o1) <= eps && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (Math.abs(o2) <= eps && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (Math.abs(o3) <= eps && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (Math.abs(o4) <= eps && onSegment(cx, cy, dx, dy, bx, by)) return true;

  return false;
}

export function distanceSqPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) {
    const vx = px - ax;
    const vy = py - ay;
    return vx * vx + vy * vy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const vx = px - cx;
  const vy = py - cy;
  return vx * vx + vy * vy;
}

function pointInRect(
  point: Vec2,
  left: number,
  right: number,
  top: number,
  bottom: number,
): boolean {
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

export function lineIntersectsRect(
  start: Vec2,
  end: Vec2,
  rectX: number,
  rectY: number,
  halfSize: number,
): boolean {
  const left = rectX - halfSize;
  const right = rectX + halfSize;
  const top = rectY - halfSize;
  const bottom = rectY + halfSize;

  if (
    pointInRect(start, left, right, top, bottom) ||
    pointInRect(end, left, right, top, bottom)
  ) {
    return true;
  }

  return (
    segmentsIntersect(start.x, start.y, end.x, end.y, left, top, right, top) ||
    segmentsIntersect(start.x, start.y, end.x, end.y, right, top, right, bottom) ||
    segmentsIntersect(start.x, start.y, end.x, end.y, right, bottom, left, bottom) ||
    segmentsIntersect(start.x, start.y, end.x, end.y, left, bottom, left, top)
  );
}

export function lineIntersectsPolygon(
  start: Vec2,
  end: Vec2,
  vertices: ReadonlyArray<Vec2>,
): boolean {
  if (vertices.length < 3) return false;

  if (
    pointInPolygon(start.x, start.y, vertices) ||
    pointInPolygon(end.x, end.y, vertices)
  ) {
    return true;
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (segmentsIntersect(start.x, start.y, end.x, end.y, a.x, a.y, b.x, b.y)) {
      return true;
    }
  }

  return false;
}

export function circleIntersectsPolygon(
  cx: number,
  cy: number,
  radius: number,
  vertices: ReadonlyArray<Vec2>,
): boolean {
  if (vertices.length < 3) return false;

  if (pointInPolygon(cx, cy, vertices)) {
    return true;
  }

  const radiusSq = radius * radius;
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    const dx = vertex.x - cx;
    const dy = vertex.y - cy;
    if (dx * dx + dy * dy <= radiusSq) {
      return true;
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (distanceSqPointToSegment(cx, cy, a.x, a.y, b.x, b.y) <= radiusSq) {
      return true;
    }
  }

  return false;
}

export function segmentIntersectsPolygonWithRadius(
  start: Vec2,
  end: Vec2,
  radius: number,
  vertices: ReadonlyArray<Vec2>,
): boolean {
  if (vertices.length < 3) return false;
  if (radius <= 1e-9) {
    return lineIntersectsPolygon(start, end, vertices);
  }

  if (
    lineIntersectsPolygon(start, end, vertices) ||
    circleIntersectsPolygon(start.x, start.y, radius, vertices) ||
    circleIntersectsPolygon(end.x, end.y, radius, vertices)
  ) {
    return true;
  }

  const radiusSq = radius * radius;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (
      distanceSqPointToSegment(a.x, a.y, start.x, start.y, end.x, end.y) <=
        radiusSq ||
      distanceSqPointToSegment(b.x, b.y, start.x, start.y, end.x, end.y) <=
        radiusSq ||
      distanceSqPointToSegment(start.x, start.y, a.x, a.y, b.x, b.y) <=
        radiusSq ||
      distanceSqPointToSegment(end.x, end.y, a.x, a.y, b.x, b.y) <= radiusSq
    ) {
      return true;
    }
  }

  return false;
}

export function projectRayToArenaWall(
  start: Vec2,
  angle: number,
  arenaWidth: number,
  arenaHeight: number,
): Vec2 {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const eps = 1e-9;
  let bestT = Infinity;

  const tryCandidate = (t: number): void => {
    if (!Number.isFinite(t) || t < 0 || t >= bestT) return;
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    const withinX = x >= -eps && x <= arenaWidth + eps;
    const withinY = y >= -eps && y <= arenaHeight + eps;
    if (!withinX || !withinY) return;
    bestT = t;
  };

  if (Math.abs(dx) > eps) {
    tryCandidate((0 - start.x) / dx);
    tryCandidate((arenaWidth - start.x) / dx);
  }
  if (Math.abs(dy) > eps) {
    tryCandidate((0 - start.y) / dy);
    tryCandidate((arenaHeight - start.y) / dy);
  }

  if (!Number.isFinite(bestT)) {
    return { x: start.x, y: start.y };
  }

  return {
    x: Math.max(0, Math.min(arenaWidth, start.x + dx * bestT)),
    y: Math.max(0, Math.min(arenaHeight, start.y + dy * bestT)),
  };
}
