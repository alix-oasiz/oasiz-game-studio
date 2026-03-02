import { type Vec2 } from './constants.ts';

export interface TrailCandidate {
  playerId: number;
  segIdx: number;
}

export class SpatialHash {
  private cellSize: number;
  private invCellSize: number;
  private cells: Map<number, TrailCandidate[]> = new Map();
  private w: number;
  private resultBuf: TrailCandidate[] = [];
  private seenSet = new Set<number>();

  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.w = 1000;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cz: number): number {
    return (cx + 500) * this.w + (cz + 500);
  }

  insertTrail(playerId: number, trail: Vec2[]): void {
    const inv = this.invCellSize;
    for (let i = 0, len = trail.length - 1; i < len; i++) {
      const a = trail[i];
      const b = trail[i + 1];
      const minCX = Math.floor(Math.min(a.x, b.x) * inv);
      const maxCX = Math.floor(Math.max(a.x, b.x) * inv);
      const minCZ = Math.floor(Math.min(a.z, b.z) * inv);
      const maxCZ = Math.floor(Math.max(a.z, b.z) * inv);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const k = this.key(cx, cz);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push({ playerId, segIdx: i });
        }
      }
    }
  }

  query(a: Vec2, b: Vec2): TrailCandidate[] {
    const inv = this.invCellSize;
    const minCX = Math.floor(Math.min(a.x, b.x) * inv);
    const maxCX = Math.floor(Math.max(a.x, b.x) * inv);
    const minCZ = Math.floor(Math.min(a.z, b.z) * inv);
    const maxCZ = Math.floor(Math.max(a.z, b.z) * inv);

    const results = this.resultBuf;
    results.length = 0;
    const seen = this.seenSet;
    seen.clear();

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = this.cells.get(this.key(cx, cz));
        if (!bucket) continue;
        for (let i = 0, len = bucket.length; i < len; i++) {
          const entry = bucket[i];
          const dedupKey = entry.playerId * 100000 + entry.segIdx;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            results.push(entry);
          }
        }
      }
    }

    return results;
  }
}
