export type DoorwaySide = "left" | "right";
export type DoorwayRoomType = "shop" | "chest" | "powerup";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldDoorway {
  index: number;
  side: DoorwaySide;
  roomType: DoorwayRoomType;
  openingRect: Rect;
  floorLipRect: Rect;
  roofLipRect: Rect;
  enterTriggerRect: Rect;
  returnSpawn: { x: number; y: number; vx: number; vy: number };
}

export interface DoorwayConfig {
  worldWidth: number;
  wallBlockSize: number;
  intervalMeters: number;
  firstDoorwayMeters: number;
  openingWidth: number;
  openingHeightBlocksMin: number;
  openingHeightBlocksMax: number;
  tunnelStripHeight: number;
  triggerDepthPx: number;
  antiDroughtIntervals: number;
  roomWeights: { shop: number; chest: number; powerup: number };
}

export class WorldDoorwaySystem {
  private readonly cfg: DoorwayConfig;
  private readonly doorways: Map<number, WorldDoorway> = new Map();
  private readonly firstDoorwayWorldY: number;

  constructor(cfg: DoorwayConfig) {
    this.cfg = cfg;
    this.firstDoorwayWorldY = Math.max(0, Math.floor(cfg.firstDoorwayMeters * 10));
  }

  reset(): void {
    this.doorways.clear();
  }

  preloadForDepth(playerWorldY: number): void {
    const intervalHeight = this.cfg.intervalMeters * 10;
    const current = Math.max(1, this.worldYToIntervalIndex(playerWorldY, intervalHeight));
    for (let offset = 0; offset <= 3; offset++) {
      this.getOrCreateDoorway(current + offset);
    }
  }

  getVisibleDoorways(worldTop: number, worldBottom: number): WorldDoorway[] {
    const intervalHeight = this.cfg.intervalMeters * 10;
    const start = Math.max(1, this.worldYToIntervalIndex(worldTop, intervalHeight) - 1);
    const end = Math.max(start, this.worldYToIntervalIndex(worldBottom, intervalHeight) + 1);
    const result: WorldDoorway[] = [];

    for (let index = start; index <= end; index++) {
      result.push(this.getOrCreateDoorway(index));
    }

    return result;
  }

  tryEnter(playerRect: Rect, playerVx: number): WorldDoorway | null {
    const intervalHeight = this.cfg.intervalMeters * 10;
    const playerCenterY = playerRect.y + playerRect.height * 0.5;
    const index = this.worldYToIntervalIndex(playerCenterY, intervalHeight);

    for (let candidate = Math.max(1, index - 1); candidate <= index + 1; candidate++) {
      const doorway = this.getOrCreateDoorway(candidate);
      const movingTowardWall = doorway.side === "left" ? playerVx < -0.35 : playerVx > 0.35;
      if (!movingTowardWall) continue;
      if (this.overlaps(playerRect, doorway.enterTriggerRect)) {
        return doorway;
      }
    }

    return null;
  }

  private getOrCreateDoorway(index: number): WorldDoorway {
    const cached = this.doorways.get(index);
    if (cached) return cached;

    const intervalHeight = this.cfg.intervalMeters * 10;
    const jitterBlocks = Math.floor(this.rand01(index, 13) * 5) - 2;
    const openingYBase = this.firstDoorwayWorldY + (index - 1) * intervalHeight;
    const openingY = this.snapToBlock(openingYBase + jitterBlocks * this.cfg.wallBlockSize);

    const minHeightBlocks = this.cfg.openingHeightBlocksMin;
    const maxHeightBlocks = Math.max(minHeightBlocks, this.cfg.openingHeightBlocksMax);
    const heightBlocks = minHeightBlocks + Math.floor(this.rand01(index, 17) * (maxHeightBlocks - minHeightBlocks + 1));
    const openingHeight = Math.max(this.cfg.wallBlockSize * 2, heightBlocks * this.cfg.wallBlockSize);

    const side = this.pickSide(index);
    const roomType = this.pickRoomType(index);

    const openingRect: Rect = {
      x: side === "left" ? 0 : this.cfg.worldWidth - this.cfg.openingWidth,
      y: openingY,
      width: this.cfg.openingWidth,
      height: openingHeight,
    };

    const floorLipRect: Rect = {
      x: openingRect.x,
      y: openingRect.y + openingRect.height - this.cfg.tunnelStripHeight,
      width: openingRect.width,
      height: this.cfg.tunnelStripHeight,
    };

    const roofLipRect: Rect = {
      x: openingRect.x,
      y: openingRect.y - this.cfg.tunnelStripHeight,
      width: openingRect.width,
      height: this.cfg.tunnelStripHeight,
    };

    const triggerInset = Math.max(6, Math.min(this.cfg.triggerDepthPx, openingRect.width));
    const enterTriggerRect: Rect = side === "left"
      ? {
          x: openingRect.x,
          y: openingRect.y,
          width: triggerInset,
          height: openingRect.height,
        }
      : {
          x: openingRect.x + openingRect.width - triggerInset,
          y: openingRect.y,
          width: triggerInset,
          height: openingRect.height,
        };

    const returnSpawn = {
      x: side === "left"
        ? openingRect.x + openingRect.width + 22
        : openingRect.x - 22,
      y: floorLipRect.y,
      vx: side === "left" ? 1.6 : -1.6,
      vy: 0,
    };

    const doorway: WorldDoorway = {
      index,
      side,
      roomType,
      openingRect,
      floorLipRect,
      roofLipRect,
      enterTriggerRect,
      returnSpawn,
    };

    this.doorways.set(index, doorway);
    return doorway;
  }

  private pickSide(index: number): DoorwaySide {
    const prev = this.doorways.get(index - 1);
    const prevPrev = this.doorways.get(index - 2);
    const prevPrevPrev = this.doorways.get(index - 3);
    const roll = this.rand01(index, 3);

    if (prev && prevPrev && prevPrevPrev && prev.side === prevPrev.side && prev.side === prevPrevPrev.side) {
      return prev.side === "left" ? "right" : "left";
    }

    return roll < 0.5 ? "left" : "right";
  }

  private pickRoomType(index: number): DoorwayRoomType {
    const w = this.cfg.roomWeights;
    const total = Math.max(0.0001, w.shop + w.chest + w.powerup);
    const roll = this.rand01(index, 7) * total;

    let pick: DoorwayRoomType;
    if (roll < w.shop) {
      pick = "shop";
    } else if (roll < w.shop + w.chest) {
      pick = "chest";
    } else {
      pick = "powerup";
    }

    const prev = this.doorways.get(index - 1);
    const prevPrev = this.doorways.get(index - 2);
    const prevPrevPrev = this.doorways.get(index - 3);
    if (prev && prevPrev && prevPrevPrev && prev.roomType === prevPrev.roomType && prev.roomType === prevPrevPrev.roomType) {
      if (pick === prev.roomType) {
        return pick === "shop" ? "chest" : "shop";
      }
    }

    return pick;
  }

  private worldYToIntervalIndex(worldY: number, intervalHeight: number): number {
    return Math.floor((worldY - this.firstDoorwayWorldY) / intervalHeight) + 1;
  }

  private snapToBlock(value: number): number {
    const b = this.cfg.wallBlockSize;
    return Math.floor(value / b) * b;
  }

  private rand01(index: number, salt: number): number {
    const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  private overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }
}
