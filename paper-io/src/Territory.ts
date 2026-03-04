import { type Vec2, START_RADIUS, MAP_SIZE, MAP_HALF } from './constants.ts';
import { pointInPolygon } from './Collision.ts';

const GRID_CELL = 0.1;
const GRID_SIZE = Math.ceil(MAP_SIZE / GRID_CELL);

export class TerritoryGrid {
  readonly data: Int8Array;
  readonly size = GRID_SIZE;
  readonly cellSize = GRID_CELL;
  readonly halfMap = MAP_HALF;

  constructor() {
    this.data = new Int8Array(GRID_SIZE * GRID_SIZE).fill(-1);
  }

  toGrid(wx: number, wz: number): [number, number] {
    return [
      Math.max(0, Math.min(this.size - 1, Math.floor((wx + this.halfMap) / this.cellSize))),
      Math.max(0, Math.min(this.size - 1, Math.floor((wz + this.halfMap) / this.cellSize))),
    ];
  }

  toWorld(gc: number, gr: number): [number, number] {
    return [
      gc * this.cellSize - this.halfMap + this.cellSize * 0.5,
      gr * this.cellSize - this.halfMap + this.cellSize * 0.5,
    ];
  }

  isOwnedBy(wx: number, wz: number, pid: number): boolean {
    const [gc, gr] = this.toGrid(wx, wz);
    return this.data[gr * this.size + gc] === pid;
  }

  capture(playerId: number, trail: Vec2[]): Set<number> {
    if (trail.length < 3) return new Set();

    const affected = new Set<number>();

    // Rasterize every trail segment into the grid so there are no gaps
    for (let i = 0; i < trail.length - 1; i++) {
      this.rasterizeSegment(trail[i], trail[i + 1], playerId, affected);
    }
    // Close the loop: connect last point back to first
    this.rasterizeSegment(trail[trail.length - 1], trail[0], playerId, affected);

    // Also fill interior via point-in-polygon for the area enclosed by the trail
    let minC = this.size, maxC = 0, minR = this.size, maxR = 0;
    for (const v of trail) {
      const [gc, gr] = this.toGrid(v.x, v.z);
      if (gc < minC) minC = gc;
      if (gc > maxC) maxC = gc;
      if (gr < minR) minR = gr;
      if (gr > maxR) maxR = gr;
    }
    minC = Math.max(0, minC - 1);
    minR = Math.max(0, minR - 1);
    maxC = Math.min(this.size - 1, maxC + 1);
    maxR = Math.min(this.size - 1, maxR + 1);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const i = r * this.size + c;
        if (this.data[i] === playerId) continue;
        const [wx, wz] = this.toWorld(c, r);
        if (pointInPolygon({ x: wx, z: wz }, trail)) {
          const prev = this.data[i];
          if (prev !== playerId && prev >= 0) affected.add(prev);
          this.data[i] = playerId;
        }
      }
    }

    this.floodFillEnclosed(playerId, affected);
    return affected;
  }

  /** Bresenham-style rasterization of a world-space segment into the grid */
  private rasterizeSegment(a: Vec2, b: Vec2, playerId: number, affected: Set<number>): void {
    const [c0, r0] = this.toGrid(a.x, a.z);
    const [c1, r1] = this.toGrid(b.x, b.z);

    let c = c0, r = r0;
    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;

    for (;;) {
      const i = r * this.size + c;
      const prev = this.data[i];
      if (prev !== playerId) {
        if (prev >= 0) affected.add(prev);
        this.data[i] = playerId;
      }
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c += sc; }
      if (e2 < dc) { err += dc; r += sr; }
    }
  }

  initCircle(playerId: number, cx: number, cz: number, radius: number): void {
    const [minC, minR] = this.toGrid(cx - radius - this.cellSize, cz - radius - this.cellSize);
    const [maxC, maxR] = this.toGrid(cx + radius + this.cellSize, cz + radius + this.cellSize);
    const r2 = radius * radius;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const [wx, wz] = this.toWorld(c, r);
        const dx = wx - cx, dz = wz - cz;
        if (dx * dx + dz * dz <= r2) {
          this.data[r * this.size + c] = playerId;
        }
      }
    }
  }

  clearPlayer(playerId: number): void {
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === playerId) this.data[i] = -1;
    }
  }

  countCells(playerId: number): number {
    let count = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === playerId) count++;
    }
    return count;
  }

  hasAnyCells(playerId: number): boolean {
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === playerId) return true;
    }
    return false;
  }

  getBounds(playerId: number): { minC: number; maxC: number; minR: number; maxR: number } | null {
    let minC = this.size, maxC = -1, minR = this.size, maxR = -1;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.data[r * this.size + c] === playerId) {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
      }
    }
    return maxC >= 0 ? { minC, maxC, minR, maxR } : null;
  }

  private floodFillEnclosed(playerId: number, affected: Set<number>): void {
    const sz = this.size;
    const visited = new Uint8Array(sz * sz);
    const stack: number[] = [];

    for (let c = 0; c < sz; c++) {
      if (this.data[c] !== playerId && !visited[c]) { visited[c] = 1; stack.push(c); }
      const bi = (sz - 1) * sz + c;
      if (this.data[bi] !== playerId && !visited[bi]) { visited[bi] = 1; stack.push(bi); }
    }
    for (let r = 1; r < sz - 1; r++) {
      const li = r * sz;
      if (this.data[li] !== playerId && !visited[li]) { visited[li] = 1; stack.push(li); }
      const ri = r * sz + sz - 1;
      if (this.data[ri] !== playerId && !visited[ri]) { visited[ri] = 1; stack.push(ri); }
    }

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const r = (idx / sz) | 0;
      const c = idx - r * sz;
      if (r > 0)      { const ni = idx - sz;    if (!visited[ni] && this.data[ni] !== playerId) { visited[ni] = 1; stack.push(ni); } }
      if (r < sz - 1) { const ni = idx + sz;    if (!visited[ni] && this.data[ni] !== playerId) { visited[ni] = 1; stack.push(ni); } }
      if (c > 0)      { const ni = idx - 1;     if (!visited[ni] && this.data[ni] !== playerId) { visited[ni] = 1; stack.push(ni); } }
      if (c < sz - 1) { const ni = idx + 1;     if (!visited[ni] && this.data[ni] !== playerId) { visited[ni] = 1; stack.push(ni); } }
    }

    for (let i = 0; i < sz * sz; i++) {
      if (!visited[i] && this.data[i] !== playerId) {
        const prev = this.data[i];
        if (prev >= 0) affected.add(prev);
        this.data[i] = playerId;
      }
    }
  }
}

export class Territory {
  private grid: TerritoryGrid;
  private pid: number;
  dirty = true;
  private cachedArea = -1;

  constructor(grid: TerritoryGrid, playerId: number) {
    this.grid = grid;
    this.pid = playerId;
  }

  initAtSpawn(cx: number, cz: number): void {
    this.grid.initCircle(this.pid, cx, cz, START_RADIUS);
    this.dirty = true;
    this.cachedArea = -1;
  }

  containsPoint(p: Vec2): boolean {
    return this.grid.isOwnedBy(p.x, p.z, this.pid);
  }

  captureFromTrail(trailPoints: Vec2[]): Set<number> {
    const affected = this.grid.capture(this.pid, trailPoints);
    this.dirty = true;
    this.cachedArea = -1;
    // Invalidate cache for affected players too (handled externally)
    return affected;
  }

  computeArea(): number {
    if (this.cachedArea >= 0) return this.cachedArea;
    this.cachedArea = this.grid.countCells(this.pid) * this.grid.cellSize * this.grid.cellSize;
    return this.cachedArea;
  }

  getPercentage(): number {
    return (this.computeArea() / (MAP_SIZE * MAP_SIZE)) * 100;
  }

  getNearestBoundaryPoint(p: Vec2): Vec2 {
    const [startC, startR] = this.grid.toGrid(p.x, p.z);
    const sz = this.grid.size;
    const data = this.grid.data;
    const pid = this.pid;

    let bestDist = Infinity;
    let bestX = p.x, bestZ = p.z;

    for (let radius = 0; radius < 80; radius++) {
      let found = false;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) < radius && Math.abs(dc) < radius) continue;
          const r = startR + dr;
          const c = startC + dc;
          if (r < 0 || r >= sz || c < 0 || c >= sz) continue;
          if (data[r * sz + c] !== pid) continue;

          let boundary = false;
          if (r === 0 || r === sz - 1 || c === 0 || c === sz - 1) boundary = true;
          else if (data[(r - 1) * sz + c] !== pid || data[(r + 1) * sz + c] !== pid ||
                   data[r * sz + c - 1] !== pid || data[r * sz + c + 1] !== pid) boundary = true;

          if (!boundary) continue;

          const [wx, wz] = this.grid.toWorld(c, r);
          const d2 = (wx - p.x) ** 2 + (wz - p.z) ** 2;
          if (d2 < bestDist) {
            bestDist = d2;
            bestX = wx;
            bestZ = wz;
            found = true;
          }
        }
      }
      if (found) break;
    }

    return { x: bestX, z: bestZ };
  }

  hasTerritory(): boolean {
    return this.grid.hasAnyCells(this.pid);
  }

  getCentroid(): Vec2 {
    let sx = 0, sz = 0, n = 0;
    const gsz = this.grid.size;
    const data = this.grid.data;
    for (let r = 0; r < gsz; r++) {
      for (let c = 0; c < gsz; c++) {
        if (data[r * gsz + c] === this.pid) {
          const [wx, wz] = this.grid.toWorld(c, r);
          sx += wx;
          sz += wz;
          n++;
        }
      }
    }
    return n > 0 ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
  }

  clear(): void {
    this.grid.clearPlayer(this.pid);
    this.dirty = true;
    this.cachedArea = -1;
  }

  invalidateCache(): void {
    this.cachedArea = -1;
  }
}
