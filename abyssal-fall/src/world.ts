/**
 * DOWNWELL - World Generation and Handling
 * 
 * Handles deterministic level generation with infinite vertical world.
 * Includes seeded RNG, chunk-based spawning, and entity management.
 */

import { CONFIG } from "./config";
import { BaseEnemy, EnemyFactory, EnemyType, StaticEnemy } from "./enemies";

// ============= SEEDED RNG =============
export class SeededRNG {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  // Mulberry32 algorithm
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  
  chance(probability: number): boolean {
    return this.next() < probability;
  }
  
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }
}

// Re-export enemy types
export type { EnemyType } from "./enemies";
export { BaseEnemy } from "./enemies";

// ============= TYPES =============
export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Platform extends Entity {
  isWall: boolean;
  breakable: boolean;
  oneWay?: boolean; // Thin top-only platform (pass through from below)
  hp: number; // HP for breakable blocks (1 = one shot to break)
  chunkIndex: number; // Track which chunk this platform belongs to
}

export interface Gem extends Entity {
  value: number;
  collected: boolean;
  chunkIndex: number;
  bobOffset: number; // Pre-calculated for visual bob
  // Runtime-only fields for enemy drops (optional for generated/static gems)
  dropped?: boolean;
  vx?: number;
  vy?: number;
  life?: number;
  settled?: boolean;
  settleFrames?: number;
  fadeTimer?: number;
  collectDelay?: number;
  isLarge?: boolean;
}

export interface Weed {
  x: number;
  y: number;
  spriteIndex: number; // Which sprite from the sheet (0-6)
  flipX: boolean;      // Mirror for variety
  isLeft: boolean;     // On left or right wall
}

export interface WallProfile {
  leftWidths: number[];   // Wall width in blocks per row
  rightWidths: number[];  // Wall width in blocks per row
}

export interface Chunk {
  index: number;
  y: number; // Top of chunk (world coordinates)
  platforms: Platform[];
  enemies: BaseEnemy[];
  gems: Gem[];
  weeds: Weed[];
  generated: boolean;
}

// ============= LEVEL SPAWNER SYSTEM =============
export class LevelSpawner {
  private rng: SeededRNG;
  private chunks: Map<number, Chunk> = new Map();
  private seed: number;
  private wellWidth: number;
  
  constructor(seed: number = Date.now()) {
    console.log("[LevelSpawner] Initializing with seed:", seed);
    this.seed = seed;
    this.rng = new SeededRNG(seed);
    this.wellWidth = CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH * 2;
  }
  
  reset(newSeed?: number): void {
    this.seed = newSeed ?? Date.now();
    this.rng = new SeededRNG(this.seed);
    this.chunks.clear();
    console.log("[LevelSpawner] Reset with seed:", this.seed);
  }
  
  getChunk(index: number): Chunk {
    if (!this.chunks.has(index)) {
      this.generateChunk(index);
    }
    return this.chunks.get(index)!;
  }
  
  private generateChunk(index: number): void {
    // Create chunk-specific RNG for deterministic generation
    const chunkRng = new SeededRNG(this.seed + index * 12345);
    
    const chunk: Chunk = {
      index,
      y: index * CONFIG.CHUNK_HEIGHT,
      platforms: [],
      enemies: [],
      gems: [],
      weeds: [],
      generated: true,
    };
    
    // Generate organic walls and get profile for platform placement
    let wallProfile: WallProfile;
    if (index === 0) {
      // Spawn area: simple minimum-width walls
      wallProfile = this.generateSimpleWalls(chunk);
    } else {
      wallProfile = this.generateOrganicWalls(chunk, chunkRng);
    }
    
    if (index > 0) {
      // Generate regular chunk with platforms and enemies
      this.generatePlatforms(chunk, chunkRng, wallProfile);
      this.generateEnemies(chunk, chunkRng, wallProfile);
      this.generateGems(chunk, chunkRng, wallProfile);
      this.generateWeeds(chunk, chunkRng, wallProfile);
    }
    
    this.chunks.set(index, chunk);
    console.log("[LevelSpawner] Generated chunk", index);
  }
  
  // Simple flat walls for the spawn chunk
  private generateSimpleWalls(chunk: Chunk): WallProfile {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = Math.ceil(CONFIG.CHUNK_HEIGHT / BLOCK);
    const leftWidths = new Array(rows).fill(CONFIG.WALL_MIN_BLOCKS);
    const rightWidths = new Array(rows).fill(CONFIG.WALL_MIN_BLOCKS);
    
    const width = CONFIG.WALL_MIN_BLOCKS * BLOCK;
    
    // Left wall - single tall platform
    chunk.platforms.push({
      x: 0,
      y: chunk.y,
      width: width,
      height: CONFIG.CHUNK_HEIGHT,
      isWall: true,
      breakable: false,
      hp: 0,
      chunkIndex: chunk.index,
    });
    
    // Right wall - single tall platform
    chunk.platforms.push({
      x: CONFIG.INTERNAL_WIDTH - width,
      y: chunk.y,
      width: width,
      height: CONFIG.CHUNK_HEIGHT,
      isWall: true,
      breakable: false,
      hp: 0,
      chunkIndex: chunk.index,
    });
    
    return { leftWidths, rightWidths };
  }
  
  // Organic cave-like wall generation inspired by Descent (Downwell demake)
  // Uses smooth noise for base shape + random clusters for stalactite/stalagmite protrusions
  private generateOrganicWalls(chunk: Chunk, rng: SeededRNG): WallProfile {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = Math.ceil(CONFIG.CHUNK_HEIGHT / BLOCK);
    
    // Depth-based narrowing (passage gets tighter with depth, like Descent)
    const depthNarrow = Math.min(chunk.index * 0.015, 0.5);
    
    // 1. Generate base wall widths using smooth noise (seamless across chunk boundaries)
    const leftWidths: number[] = [];
    const rightWidths: number[] = [];
    
    for (let r = 0; r < rows; r++) {
      const worldY = chunk.y + r * BLOCK;
      leftWidths.push(this.getBaseWallWidth(worldY, 0, depthNarrow));
      rightWidths.push(this.getBaseWallWidth(worldY, 1, depthNarrow));
    }
    
    // 2. Add organic cluster protrusions (stalactites/stalagmites)
    const numClusters = rng.int(CONFIG.WALL_CLUSTERS_MIN, CONFIG.WALL_CLUSTERS_MAX);
    for (let c = 0; c < numClusters; c++) {
      this.addWallCluster(leftWidths, rows, rng);
    }
    const numClustersRight = rng.int(CONFIG.WALL_CLUSTERS_MIN, CONFIG.WALL_CLUSTERS_MAX);
    for (let c = 0; c < numClustersRight; c++) {
      this.addWallCluster(rightWidths, rows, rng);
    }
    
    // 3. Clamp all widths to valid range
    for (let r = 0; r < rows; r++) {
      leftWidths[r] = Math.max(CONFIG.WALL_MIN_BLOCKS, Math.min(leftWidths[r], CONFIG.WALL_MAX_BLOCKS));
      rightWidths[r] = Math.max(CONFIG.WALL_MIN_BLOCKS, Math.min(rightWidths[r], CONFIG.WALL_MAX_BLOCKS));
    }
    
    // 4. Create merged wall platforms from the profile
    this.createWallPlatformsFromProfile(chunk, leftWidths, true, BLOCK);
    this.createWallPlatformsFromProfile(chunk, rightWidths, false, BLOCK);
    
    return { leftWidths, rightWidths };
  }
  
  // Smooth, deterministic base wall width using layered sine waves
  // Uses world-Y coordinates so wall shapes are seamless across chunk boundaries
  private getBaseWallWidth(worldY: number, side: number, depthNarrow: number): number {
    const s = this.seed;
    const offset = side * 5.7; // Different pattern for left vs right
    
    // Layer multiple sine waves at different frequencies for organic feel
    const v1 = Math.sin(worldY * 0.005 + s * 0.1 + offset) * 0.5 + 0.5;
    const v2 = Math.sin(worldY * 0.013 + s * 0.23 + offset + 2.1) * 0.3 + 0.5;
    const v3 = Math.sin(worldY * 0.031 + s * 0.47 + offset + 4.3) * 0.2 + 0.5;
    const combined = v1 * 0.5 + v2 * 0.3 + v3 * 0.2; // Range ~0 to ~1
    
    // Base width: min blocks + modest noise variation + depth narrowing
    // With MIN_BLOCKS=2 and combined*0.8, base is mostly 2 blocks, occasionally 3
    return Math.max(
      CONFIG.WALL_MIN_BLOCKS,
      Math.round(CONFIG.WALL_MIN_BLOCKS + combined * 0.8 + depthNarrow)
    );
  }
  
  // Add a tapered cluster protrusion (stalactite/stalagmite shape)
  private addWallCluster(widths: number[], rows: number, rng: SeededRNG): void {
    const centerRow = rng.int(2, rows - 3);
    const halfHeight = rng.int(2, 5);
    const peakWidth = rng.int(CONFIG.WALL_MIN_BLOCKS + 1, CONFIG.WALL_MAX_BLOCKS);
    
    for (let r = centerRow - halfHeight; r <= centerRow + halfHeight; r++) {
      if (r < 0 || r >= rows) continue;
      
      const dist = Math.abs(r - centerRow);
      const falloff = 1 - dist / (halfHeight + 0.5);
      // Quadratic falloff for natural tapering
      const clusterWidth = Math.max(1, Math.round(peakWidth * falloff * falloff));
      
      // Fade near chunk edges for smoother transitions
      const edgeDist = Math.min(r, rows - 1 - r);
      const edgeFade = Math.min(1, edgeDist / 3);
      const fadedWidth = Math.max(1, Math.round(clusterWidth * edgeFade));
      
      widths[r] = Math.max(widths[r], fadedWidth);
    }
  }
  
  // Convert a wall width profile into merged Platform objects
  // Merges consecutive rows with the same width for performance
  private createWallPlatformsFromProfile(
    chunk: Chunk,
    widths: number[],
    isLeft: boolean,
    blockSize: number
  ): void {
    let startRow = 0;
    
    while (startRow < widths.length) {
      const currentWidth = widths[startRow];
      let endRow = startRow;
      
      // Find consecutive rows with same width to merge
      while (endRow + 1 < widths.length && widths[endRow + 1] === currentWidth) {
        endRow++;
      }
      
      const height = (endRow - startRow + 1) * blockSize;
      const width = currentWidth * blockSize;
      
      chunk.platforms.push({
        x: isLeft ? 0 : CONFIG.INTERNAL_WIDTH - width,
        y: chunk.y + startRow * blockSize,
        width: width,
        height: height,
        isWall: true,
        breakable: false,
        hp: 0,
        chunkIndex: chunk.index,
      });
      
      startRow = endRow + 1;
    }
  }
  
  // Helper: get the maximum wall width (in pixels) across a range of rows for a given side
  private getMaxWallWidth(
    wallProfile: WallProfile,
    startRow: number,
    endRow: number,
    side: "left" | "right"
  ): number {
    const widths = side === "left" ? wallProfile.leftWidths : wallProfile.rightWidths;
    let maxBlocks = 0;
    for (let r = Math.max(0, startRow); r <= Math.min(endRow, widths.length - 1); r++) {
      maxBlocks = Math.max(maxBlocks, widths[r]);
    }
    return maxBlocks * CONFIG.WALL_BLOCK_SIZE;
  }
  
  private generatePlatforms(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK_SIZE = CONFIG.WALL_BLOCK_SIZE;
    const rows = wallProfile.leftWidths.length;
    const occupied = new Set<string>();
    const targetChunks = Math.max(1, CONFIG.BREAKABLE_CHUNKS_PER_CHUNK + rng.int(-1, 1));
    const minChunk = Math.max(1, CONFIG.BREAKABLE_CHUNK_MIN_BLOCKS);
    const maxChunk = Math.max(minChunk, CONFIG.BREAKABLE_CHUNK_MAX_BLOCKS);

    const getLaneCols = (row: number): { minCol: number; maxCol: number } => {
      const clampedRow = Math.max(0, Math.min(rows - 1, row));
      const leftCol = wallProfile.leftWidths[clampedRow];
      const rightColExclusive = Math.floor((CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[clampedRow] * BLOCK_SIZE) / BLOCK_SIZE);
      return { minCol: leftCol, maxCol: rightColExclusive - 1 };
    };

    const keyOf = (row: number, col: number): string => `${row}:${col}`;
    const directions = [
      { r: -1, c: 0 },
      { r: 1, c: 0 },
      { r: 0, c: -1 },
      { r: 0, c: 1 },
    ];

    for (let chunkIdx = 0; chunkIdx < targetChunks; chunkIdx++) {
      let placed = false;

      for (let attempt = 0; attempt < 20 && !placed; attempt++) {
        const seedRow = rng.int(1, Math.max(1, rows - 2));
        const lane = getLaneCols(seedRow);
        if (lane.maxCol - lane.minCol < 2) continue;

        const seedCol = rng.int(lane.minCol, lane.maxCol);
        const seedKey = keyOf(seedRow, seedCol);
        if (occupied.has(seedKey)) continue;

        const targetSize = rng.int(minChunk, maxChunk);
        const cells: { row: number; col: number }[] = [{ row: seedRow, col: seedCol }];
        const local = new Set<string>([seedKey]);
        let growAttempts = targetSize * 20;

        while (cells.length < targetSize && growAttempts > 0) {
          growAttempts--;
          const base = cells[rng.int(0, cells.length - 1)];
          const dir = directions[rng.int(0, directions.length - 1)];
          const nr = base.row + dir.r;
          const nc = base.col + dir.c;
          if (nr < 0 || nr >= rows) continue;

          const rowLane = getLaneCols(nr);
          if (nc < rowLane.minCol || nc > rowLane.maxCol) continue;

          const k = keyOf(nr, nc);
          if (local.has(k) || occupied.has(k)) continue;

          // Avoid turning into a giant slab by occasionally rejecting dense growth.
          let neighborCount = 0;
          for (const d of directions) {
            const nk = keyOf(nr + d.r, nc + d.c);
            if (local.has(nk)) neighborCount++;
          }
          if (neighborCount >= 3 && rng.chance(0.6)) continue;

          local.add(k);
          cells.push({ row: nr, col: nc });
        }

        if (cells.length < minChunk) continue;

        // Commit chunk cells.
        for (const cell of cells) {
          const k = keyOf(cell.row, cell.col);
          occupied.add(k);
          chunk.platforms.push({
            x: cell.col * BLOCK_SIZE,
            y: chunk.y + cell.row * BLOCK_SIZE,
            width: BLOCK_SIZE,
            height: BLOCK_SIZE,
            isWall: false,
            breakable: true,
            hp: 1,
            chunkIndex: chunk.index,
          });
        }
        placed = true;
      }
    }

    // Add side-grown, stacked wall masses that push toward the center.
    // This prevents a permanent free-fall center lane and creates natural cave pressure.
    this.generateSideCenterMasses(chunk, rng, wallProfile);
    if (!CONFIG.DOWNWELL_MODE) {
      this.generateOneWayPlatforms(chunk, rng, wallProfile);
    }
    // Keep these core safety/flow passes in all modes.
    const clearLane = this.ensureGuaranteedClearPath(chunk, wallProfile);
    this.generateMidBreakableIslands(chunk, rng, wallProfile, clearLane);
    this.generateCatchShelves(chunk, wallProfile, clearLane);
    this.normalizeBreakablesUnderUnbreakables(chunk);
    this.enforceBreakableStructureCap(chunk);
    this.enforceBreakableRunCap(chunk);
    this.ensureNoPocketSoftlocks(chunk);
  }

  // Guarantee at least a 2-block-wide no-break route through each chunk.
  // We carve a vertical lane by cutting overlapping platforms into left/right pieces.
  private ensureGuaranteedClearPath(
    chunk: Chunk,
    wallProfile: WallProfile
  ): { x: number; y: number; width: number; height: number } | null {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const pathWidth = Math.max(BLOCK, CONFIG.GUARANTEED_CLEAR_PATH_BLOCKS * BLOCK);

    // Conservative lane bounds valid across the entire chunk.
    let laneLeft = 0;
    let laneRight = CONFIG.INTERNAL_WIDTH;
    for (let r = 0; r < wallProfile.leftWidths.length; r++) {
      laneLeft = Math.max(laneLeft, wallProfile.leftWidths[r] * BLOCK);
      laneRight = Math.min(laneRight, CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[r] * BLOCK);
    }

    const usable = laneRight - laneLeft;
    if (usable <= pathWidth + 4) return null;

    // Deterministic center-biased lane placement per chunk.
    const laneRng = new SeededRNG(this.seed + chunk.index * 15731 + 901);
    const minX = laneLeft + 2;
    const maxX = laneRight - pathWidth - 2;
    const centerX = (laneLeft + laneRight - pathWidth) * 0.5;
    const sway = (laneRng.next() - 0.5) * Math.max(0, usable - pathWidth) * 0.25;
    const unclampedPathX = Math.max(minX, Math.min(maxX, centerX + sway));
    const pathX = Math.max(minX, Math.min(maxX, Math.round(unclampedPathX / BLOCK) * BLOCK));
    const pathY = chunk.y;
    const pathH = CONFIG.CHUNK_HEIGHT;
    const pathRight = pathX + pathWidth;
    const minPieceWidth = 10;

    const carved: Platform[] = [];
    for (const p of chunk.platforms) {
      if (p.oneWay) {
        carved.push(p);
        continue;
      }
      if (p.isWall) {
        carved.push(p);
        continue;
      }

      const overlapsPath = this.overlapsRect(pathX, pathY, pathWidth, pathH, p.x, p.y, p.width, p.height);
      if (!overlapsPath) {
        carved.push(p);
        continue;
      }

      const pRight = p.x + p.width;
      const leftWidth = Math.max(0, pathX - p.x);
      const rightWidth = Math.max(0, pRight - pathRight);

      if (leftWidth >= minPieceWidth) {
        carved.push({
          ...p,
          x: p.x,
          width: leftWidth,
        });
      }
      if (rightWidth >= minPieceWidth) {
        carved.push({
          ...p,
          x: pathRight,
          width: rightWidth,
        });
      }
    }

    chunk.platforms = carved;
    return { x: pathX, y: pathY, width: pathWidth, height: pathH };
  }

  private generateMidBreakableIslands(
    chunk: Chunk,
    rng: SeededRNG,
    wallProfile: WallProfile,
    clearLane: { x: number; y: number; width: number; height: number } | null
  ): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = wallProfile.leftWidths.length;
    const target = Math.max(0, CONFIG.MID_BREAKABLE_ISLANDS_PER_CHUNK + rng.int(-1, 1));
    if (target <= 0) return;

    const canPlaceTile = (row: number, col: number): boolean => {
      if (row < 0 || row >= rows) return false;
      const leftCol = wallProfile.leftWidths[row];
      const rightColExclusive = Math.floor((CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[row] * BLOCK) / BLOCK);
      if (col < leftCol || col >= rightColExclusive) return false;

      const x = col * BLOCK;
      const y = chunk.y + row * BLOCK;
      if (clearLane && this.overlapsRect(x, y, BLOCK, BLOCK, clearLane.x, clearLane.y, clearLane.width, clearLane.height)) {
        return false;
      }
      return !this.overlapsAnyPlatform(chunk.platforms, x, y, BLOCK, BLOCK, 0);
    };

    let placed = 0;
    for (let i = 0; i < target; i++) {
      let madeIsland = false;
      for (let attempt = 0; attempt < 28 && !madeIsland; attempt++) {
        const widthBlocks = rng.chance(0.45) ? 2 : rng.int(2, 3);
        let heightBlocks = rng.chance(0.45) ? 4 : rng.int(2, 4);
        while (widthBlocks * heightBlocks > 8 && heightBlocks > 2) {
          heightBlocks--;
        }

        const minRow = 2;
        const maxRow = Math.max(minRow, rows - heightBlocks - 2);
        const baseRow = rng.int(minRow, maxRow);
        const centerBias = rng.int(-2, 2);

        let laneLeft = 0;
        let laneRight = CONFIG.INTERNAL_WIDTH;
        for (let r = baseRow; r < baseRow + heightBlocks; r++) {
          laneLeft = Math.max(laneLeft, wallProfile.leftWidths[r] * BLOCK);
          laneRight = Math.min(laneRight, CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[r] * BLOCK);
        }
        const laneWidth = laneRight - laneLeft;
        if (laneWidth < (widthBlocks + 1) * BLOCK) continue;

        const centerCol = Math.floor(((laneLeft + laneRight) * 0.5) / BLOCK) + centerBias;
        const minCol = Math.floor(laneLeft / BLOCK);
        const maxCol = Math.floor((laneRight - widthBlocks * BLOCK) / BLOCK);
        let startCol = Math.max(minCol, Math.min(maxCol, centerCol - Math.floor(widthBlocks / 2)));

        const sideChoice = rng.int(0, 2); // 0 center, 1 leftish, 2 rightish
        if (sideChoice === 1) startCol = Math.max(minCol, startCol - 1);
        if (sideChoice === 2) startCol = Math.min(maxCol, startCol + 1);

        const cells: Array<{ row: number; col: number }> = [];
        for (let dy = 0; dy < heightBlocks; dy++) {
          for (let dx = 0; dx < widthBlocks; dx++) {
            cells.push({ row: baseRow + dy, col: startCol + dx });
          }
        }

      }
      if (madeIsland) placed++;
    }
  }

  // Add deterministic one-way "catch shelves" so the player cannot free-fall
  // for more than the configured time window from any fixed x position.
  // Shelves leave a 2-block gap that shifts across left/center/right lanes.
  private generateCatchShelves(
    chunk: Chunk,
    wallProfile: WallProfile,
    clearLane: { x: number; y: number; width: number; height: number } | null
  ): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const thickness = CONFIG.ONE_WAY_PLATFORM_THICKNESS;
    const frames = Math.max(1, Math.floor(CONFIG.FALL_OBSTACLE_MAX_SECONDS * 60));
    let vy = 0;
    let maxFallDistancePx = 0;
    for (let i = 0; i < frames; i++) {
      vy = Math.min(CONFIG.PLAYER_MAX_FALL_SPEED, vy + CONFIG.PLAYER_GRAVITY);
      maxFallDistancePx += vy;
    }
    const spacingCap = Math.max(BLOCK * 4, Math.floor(maxFallDistancePx) - BLOCK);
    const spacing = Math.max(BLOCK * 4, Math.min(CONFIG.CATCH_SHELF_SPACING_PX, spacingCap));
    const gapWidth = Math.max(BLOCK * 2, CONFIG.GUARANTEED_CLEAR_PATH_BLOCKS * BLOCK);
    const rowCount = wallProfile.leftWidths.length;
    const chunkTop = chunk.y;
    const chunkBottom = chunk.y + CONFIG.CHUNK_HEIGHT;

    const firstShelf = Math.ceil(chunkTop / spacing) * spacing;
    const phase = Math.abs(this.seed) % 3;

    for (let shelfY = firstShelf; shelfY < chunkBottom; shelfY += spacing) {
      const row = Math.min(rowCount - 1, Math.max(0, Math.floor((shelfY - chunk.y) / BLOCK)));
      const laneLeft = wallProfile.leftWidths[row] * BLOCK;
      const laneRight = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[row] * BLOCK;
      const laneWidth = laneRight - laneLeft;
      if (laneWidth <= gapWidth + BLOCK) continue;

      const maxGapX = laneRight - gapWidth;
      const shelfIndex = Math.floor(shelfY / spacing);
      let gapX: number;
      if (clearLane) {
        // Do not keep one fixed vertical opening forever.
        // Cycle the gap across left/center/right so passive center fall is interrupted.
        const slots = [
          laneLeft,
          Math.round((laneLeft + (laneWidth - gapWidth) * 0.5) / BLOCK) * BLOCK,
          maxGapX,
        ];
        const clearClamped = Math.max(laneLeft, Math.min(maxGapX, Math.round(clearLane.x / BLOCK) * BLOCK));
        let startSlot = 1;
        let bestDist = Infinity;
        for (let i = 0; i < slots.length; i++) {
          const dist = Math.abs(slots[i] - clearClamped);
          if (dist < bestDist) {
            bestDist = dist;
            startSlot = i;
          }
        }
        const slot = (startSlot + shelfIndex + phase) % 3;
        gapX = Math.max(laneLeft, Math.min(maxGapX, slots[slot]));
      } else {
        const slot = (shelfIndex + phase) % 3; // 0=left,1=center,2=right
        const rawGapX = laneLeft + ((laneWidth - gapWidth) * slot) / 2;
        gapX = Math.max(laneLeft, Math.min(maxGapX, Math.round(rawGapX / BLOCK) * BLOCK));
      }
      const gapRight = gapX + gapWidth;
      const minSeg = 10;

      const leftWidth = gapX - laneLeft;
      if (leftWidth >= minSeg) {
        this.placeChunkedShelfSegments(chunk, laneLeft, shelfY, leftWidth, thickness, "left");
      }

      const rightWidth = laneRight - gapRight;
      if (rightWidth >= minSeg) {
        this.placeChunkedShelfSegments(chunk, gapRight, shelfY, rightWidth, thickness, "right");
      }
    }
  }

  private placeChunkedShelfSegments(
    chunk: Chunk,
    startX: number,
    y: number,
    totalWidth: number,
    thickness: number,
    side: "left" | "right"
  ): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const maxSegWidth = Math.max(BLOCK, CONFIG.ONE_WAY_PLATFORM_MAX_BLOCKS * BLOCK);
    const gapWidth = BLOCK;

    if (side === "left") {
      let x = startX;
      const endX = startX + totalWidth;
      while (x < endX) {
        const remaining = endX - x;
        const segWidth = Math.min(maxSegWidth, remaining);
        if (segWidth >= 10 && this.canPlaceOneWayWithGap(chunk.platforms, x, y, segWidth, thickness)) {
          chunk.platforms.push({
            x,
            y,
            width: segWidth,
            height: thickness,
            isWall: false,
            breakable: false,
            oneWay: true,
            hp: 0,
            chunkIndex: chunk.index,
          });
        }
        x += segWidth + gapWidth;
      }
      return;
    }

    let x = startX + totalWidth;
    while (x > startX) {
      const remaining = x - startX;
      const segWidth = Math.min(maxSegWidth, remaining);
      const segX = x - segWidth;
      if (segWidth >= 10 && this.canPlaceOneWayWithGap(chunk.platforms, segX, y, segWidth, thickness)) {
        chunk.platforms.push({
          x: segX,
          y,
          width: segWidth,
          height: thickness,
          isWall: false,
          breakable: false,
          oneWay: true,
          hp: 0,
          chunkIndex: chunk.index,
        });
      }
      x -= segWidth + gapWidth;
    }
  }

  // One-way platforms should keep breathing room:
  // - same row: at least one full block gap between segments
  // - stacked rows: no direct overlap when vertically adjacent
  private canPlaceOneWayWithGap(
    platforms: Platform[],
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const sameRowGap = BLOCK;
    const verticalGap = BLOCK;
    const left = x;
    const right = x + width;

    for (const p of platforms) {
      if (!p.oneWay) continue;
      const pLeft = p.x;
      const pRight = p.x + p.width;

      const sameRow = Math.abs(p.y - y) <= height + 2;
      if (sameRow) {
        const gap = Math.max(left, pLeft) - Math.min(right, pRight);
        if (gap < sameRowGap) return false;
      }

      const nearVertical = Math.abs(p.y - y) < verticalGap + height;
      const overlapsX = right > pLeft && left < pRight;
      if (nearVertical && overlapsX) return false;
    }

    return true;
  }

  // Breakable tiles directly under an unbreakable solid become unbreakable.
  // This prevents traps where the player expects to clear a block but cannot.
  private normalizeBreakablesUnderUnbreakables(chunk: Chunk): void {
    const tolerance = 2;
    const unbreakables = chunk.platforms.filter((p) => !p.breakable && !p.oneWay);

    for (const p of chunk.platforms) {
      if (!p.breakable) continue;

      const pTop = p.y;
      const pLeft = p.x;
      const pRight = p.x + p.width;
      let blockedFromAbove = false;

      for (const u of unbreakables) {
        const uBottom = u.y + u.height;
        if (Math.abs(uBottom - pTop) > tolerance) continue;

        const uLeft = u.x;
        const uRight = u.x + u.width;
        const overlapsX = pRight > uLeft && pLeft < uRight;
        if (!overlapsX) continue;

        blockedFromAbove = true;
        break;
      }

      if (blockedFromAbove) {
        p.breakable = false;
        p.hp = 0;
      }
    }
  }

  // Hard post-pass: connected breakable runs on a row can never exceed the cap.
  // If a run is longer, overflow tiles become non-breakable.
  private enforceBreakableRunCap(chunk: Chunk): void {
    const capBlocks = Math.max(1, CONFIG.BREAKABLE_CHUNK_MAX_BLOCKS);
    const maxRunWidth = capBlocks * CONFIG.WALL_BLOCK_SIZE;
    const rowMap = new Map<number, Platform[]>();

    for (const p of chunk.platforms) {
      if (!p.breakable) continue;
      if (!rowMap.has(p.y)) rowMap.set(p.y, []);
      rowMap.get(p.y)!.push(p);
    }

    for (const [, rowPlatforms] of rowMap) {
      rowPlatforms.sort((a, b) => a.x - b.x);
      let runStart = 0;

      while (runStart < rowPlatforms.length) {
        let runEnd = runStart;
        let runLeft = rowPlatforms[runStart].x;
        let runRight = rowPlatforms[runStart].x + rowPlatforms[runStart].width;

        // Build contiguous run by horizontal touching/overlap.
        while (runEnd + 1 < rowPlatforms.length) {
          const next = rowPlatforms[runEnd + 1];
          if (next.x > runRight + 1) break;
          runEnd++;
          runRight = Math.max(runRight, next.x + next.width);
        }

        const runWidth = runRight - runLeft;
        if (runWidth > maxRunWidth) {
          const keepRight = runLeft + maxRunWidth;
          for (let i = runStart; i <= runEnd; i++) {
            const p = rowPlatforms[i];
            if (p.x >= keepRight) {
              p.breakable = false;
              p.hp = 0;
            } else if (p.x + p.width > keepRight) {
              // Split edge tile: keep breakable part up to keepRight.
              const overflow = p.x + p.width - keepRight;
              p.width -= overflow;
              if (overflow > 0) {
                chunk.platforms.push({
                  x: keepRight,
                  y: p.y,
                  width: overflow,
                  height: p.height,
                  isWall: false,
                  breakable: false,
                  hp: 0,
                  chunkIndex: p.chunkIndex,
                });
              }
            }
          }
        }

        runStart = runEnd + 1;
      }
    }
  }

  // Final safety post-pass:
  // detect 1-cell pockets that can trap the player against a wall/floor combo
  // and carve a nearby breakable cell to guarantee an escape route.
  private ensureNoPocketSoftlocks(chunk: Chunk): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = Math.max(1, Math.floor(CONFIG.CHUNK_HEIGHT / BLOCK));
    const cols = Math.max(1, Math.floor(CONFIG.INTERNAL_WIDTH / BLOCK));
    const maxEscapeScanRows = 4;
    const maxFixes = 24;

    const toKey = (row: number, col: number): string => `${row}:${col}`;

    for (let fixes = 0; fixes < maxFixes; fixes++) {
      const blocked = new Set<string>();
      const breakable = new Set<string>();

      for (const p of chunk.platforms) {
        if (p.oneWay) continue;
        const startCol = Math.max(0, Math.floor(p.x / BLOCK));
        const endCol = Math.min(cols - 1, Math.floor((p.x + p.width - 1) / BLOCK));
        const startRow = Math.max(0, Math.floor((p.y - chunk.y) / BLOCK));
        const endRow = Math.min(rows - 1, Math.floor((p.y + p.height - 1 - chunk.y) / BLOCK));
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const key = toKey(row, col);
            blocked.add(key);
            if (p.breakable) breakable.add(key);
          }
        }

      }

      const isBlocked = (row: number, col: number): boolean => {
        if (col < 0 || col >= cols) return true;
        if (row < 0) return false;
        if (row >= rows) return true;
        return blocked.has(toKey(row, col));
      };
      const isBreakable = (row: number, col: number): boolean => {
        if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
        return breakable.has(toKey(row, col));
      };

      let carved = false;

      for (let row = 1; row < rows - 1 && !carved; row++) {
        for (let col = 1; col < cols - 1 && !carved; col++) {
          const here = toKey(row, col);
          if (blocked.has(here)) continue;
          if (!isBlocked(row + 1, col)) continue; // no floor support
          if (!isBlocked(row, col - 1) || !isBlocked(row, col + 1)) continue; // not enclosed laterally

          // If there is already a reachable side opening within jump range, this isn't a softlock.
          let hasReachableExit = false;
          for (let up = 0; up <= maxEscapeScanRows; up++) {
            const rr = row - up;
            if (rr < 0) {
              hasReachableExit = true;
              break;
            }
            if (isBlocked(rr, col)) break;
            if (!isBlocked(rr, col - 1) || !isBlocked(rr, col + 1)) {
              hasReachableExit = true;
              break;
            }
          }
          if (hasReachableExit) continue;

          // Carve a nearby breakable side cell (prefer immediate height, then above).
          for (let up = 0; up <= maxEscapeScanRows && !carved; up++) {
            const rr = row - up;
            if (rr < 0) break;
            if (isBreakable(rr, col - 1) && this.carveBreakableCell(chunk, rr, col - 1)) {
              carved = true;
              break;
            }
            if (isBreakable(rr, col + 1) && this.carveBreakableCell(chunk, rr, col + 1)) {
              carved = true;
              break;
            }
          }

          // Fallback: open ceiling above pocket if side breakables weren't available.
          if (!carved) {
            for (let up = 1; up <= maxEscapeScanRows; up++) {
              const rr = row - up;
              if (rr < 0) break;
              if (isBreakable(rr, col) && this.carveBreakableCell(chunk, rr, col)) {
                carved = true;
                break;
              }
            }
          }
        }
      }

      if (!carved) break;
    }
  }

  private carveBreakableCell(chunk: Chunk, row: number, col: number): boolean {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const cellX = col * BLOCK;
    const cellY = chunk.y + row * BLOCK;
    const cellRight = cellX + BLOCK;
    const cellBottom = cellY + BLOCK;

    for (let i = chunk.platforms.length - 1; i >= 0; i--) {
      const p = chunk.platforms[i];
      if (!p.breakable) continue;
      if (cellX >= p.x + p.width || cellRight <= p.x || cellY >= p.y + p.height || cellBottom <= p.y) continue;

      chunk.platforms.splice(i, 1);

      const leftW = Math.max(0, cellX - p.x);
      const rightW = Math.max(0, p.x + p.width - cellRight);
      const topH = Math.max(0, cellY - p.y);
      const bottomH = Math.max(0, p.y + p.height - cellBottom);

      if (leftW > 0) {
        chunk.platforms.push({
          x: p.x,
          y: p.y,
          width: leftW,
          height: p.height,
          isWall: p.isWall,
          breakable: true,
          hp: 1,
          chunkIndex: p.chunkIndex,
        });
      }
      if (rightW > 0) {
        chunk.platforms.push({
          x: cellRight,
          y: p.y,
          width: rightW,
          height: p.height,
          isWall: p.isWall,
          breakable: true,
          hp: 1,
          chunkIndex: p.chunkIndex,
        });
      }
      if (topH > 0) {
        chunk.platforms.push({
          x: Math.max(p.x, cellX),
          y: p.y,
          width: Math.min(p.x + p.width, cellRight) - Math.max(p.x, cellX),
          height: topH,
          isWall: p.isWall,
          breakable: true,
          hp: 1,
          chunkIndex: p.chunkIndex,
        });
      }
      if (bottomH > 0) {
        chunk.platforms.push({
          x: Math.max(p.x, cellX),
          y: cellBottom,
          width: Math.min(p.x + p.width, cellRight) - Math.max(p.x, cellX),
          height: bottomH,
          isWall: p.isWall,
          breakable: true,
          hp: 1,
          chunkIndex: p.chunkIndex,
        });
      }
      return true;
    }

    return false;
  }

  // Hard post-pass: any connected breakable structure (4-neighbor adjacency)
  // can never exceed BREAKABLE_CHUNK_MAX_BLOCKS tiles.
  private enforceBreakableStructureCap(chunk: Chunk): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const cap = Math.max(1, CONFIG.BREAKABLE_CHUNK_MAX_BLOCKS);

    // Map each breakable block cell to its platform object.
    const cellToPlatforms = new Map<string, Platform[]>();
    for (const p of chunk.platforms) {
      if (!p.breakable) continue;
      const cols = Math.max(1, Math.round(p.width / BLOCK));
      const rows = Math.max(1, Math.round(p.height / BLOCK));
      for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          const cellX = Math.round((p.x + cx * BLOCK) / BLOCK);
          const cellY = Math.round((p.y + ry * BLOCK) / BLOCK);
          const key = `${cellX}:${cellY}`;
          if (!cellToPlatforms.has(key)) cellToPlatforms.set(key, []);
          cellToPlatforms.get(key)!.push(p);
        }
      }
    }

    const visited = new Set<string>();
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const startKey of cellToPlatforms.keys()) {
      if (visited.has(startKey)) continue;

      const queue: string[] = [startKey];
      const component: string[] = [];
      visited.add(startKey);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        component.push(cur);
        const [sx, sy] = cur.split(":").map(Number);

        for (const [dx, dy] of neighbors) {
          const nk = `${sx + dx}:${sy + dy}`;
          if (!cellToPlatforms.has(nk) || visited.has(nk)) continue;
          visited.add(nk);
          queue.push(nk);
        }
      }

      if (component.length <= cap) continue;

      // Keep the first cap tiles in BFS order; convert overflow to unbreakable.
      for (let i = cap; i < component.length; i++) {
        const key = component[i];
        const platforms = cellToPlatforms.get(key);
        if (!platforms) continue;
        for (const p of platforms) {
          p.breakable = false;
          p.hp = 0;
        }
      }
    }
  }

  // Generate thin one-way platforms (Mario-style): standable from above,
  // pass-through from below.
  private generateOneWayPlatforms(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const thickness = CONFIG.ONE_WAY_PLATFORM_THICKNESS;
    const targetCount = Math.max(0, CONFIG.ONE_WAY_PLATFORMS_PER_CHUNK + rng.int(-1, 1));
    const maxAttempts = targetCount * 8;
    let spawned = 0;

    for (let attempt = 0; attempt < maxAttempts && spawned < targetCount; attempt++) {
      const y = Math.round((chunk.y + rng.range(90, CONFIG.CHUNK_HEIGHT - 90)) / BLOCK) * BLOCK;
      const row = Math.min(
        wallProfile.leftWidths.length - 1,
        Math.max(0, Math.floor((y - chunk.y) / BLOCK))
      );

      const leftWallWidth = wallProfile.leftWidths[row] * BLOCK;
      const rightWallWidth = wallProfile.rightWidths[row] * BLOCK;
      const playableLeft = leftWallWidth + 8;
      const playableRight = CONFIG.INTERNAL_WIDTH - rightWallWidth - 8;
      const playableWidth = playableRight - playableLeft;
      if (playableWidth < BLOCK * 3) continue;

      const widthBlocks = rng.int(2, 4);
      const width = widthBlocks * BLOCK;
      if (width + 12 > playableWidth) continue;

      const x = playableLeft + rng.range(0, playableWidth - width);
      const overlaps = this.overlapsAnyPlatform(chunk.platforms, x, y - 2, width, thickness + 4, 6);
      if (overlaps) continue;
      if (!this.canPlaceOneWayWithGap(chunk.platforms, x, y, width, thickness)) continue;

      chunk.platforms.push({
        x,
        y,
        width,
        height: thickness,
        isWall: false,
        breakable: false,
        oneWay: true,
        hp: 0,
        chunkIndex: chunk.index,
      });
      spawned++;
    }
  }

  // Generate impenetrable stepped formations that grow from side walls toward center.
  // Each layer is 1 block tall, with top shortest and lower layers longer.
  // Total height is capped at 3 blocks so silhouettes stay natural and readable.
  private generateSideCenterMasses(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK_SIZE = CONFIG.WALL_BLOCK_SIZE;
    const rows = wallProfile.leftWidths.length;
    const intervalMeters = Math.max(10, CONFIG.SIDE_MASS_INTERVAL_METERS);
    const intervalPx = intervalMeters * 10; // depth UI uses y/10 => meters to world px
    const jitterPx = Math.max(0, CONFIG.SIDE_MASS_INTERVAL_JITTER_METERS) * 10;
    const chunkTop = chunk.y;
    const chunkBottom = chunk.y + CONFIG.CHUNK_HEIGHT - 1;
    const firstEvent = Math.max(0, Math.floor(chunkTop / intervalPx) - 1);
    const lastEvent = Math.floor(chunkBottom / intervalPx) + 1;

    for (let eventIndex = firstEvent; eventIndex <= lastEvent; eventIndex++) {
      // Shared interval stream for both sides: each interval can spawn at most one side mass.
      const eventRng = new SeededRNG(this.seed + eventIndex * 92821 + 77);
      if (!eventRng.chance(CONFIG.SIDE_MASS_SPAWN_CHANCE)) continue;

      const eventCenterY = eventIndex * intervalPx + intervalPx * 0.5 + eventRng.range(-jitterPx, jitterPx);
      if (eventCenterY < chunkTop || eventCenterY > chunkBottom) continue;

      const fromLeft = eventRng.chance(0.5);
      const layers = eventRng.int(2, 3); // Max 3 tall
      const topRunBlocks = eventRng.int(1, 2);
      const growthPerLayer = 1;
      const maxSideMassWidthBlocks = Math.max(2, CONFIG.SIDE_MASS_MAX_WIDTH_BLOCKS);

      let baseRow = Math.round((eventCenterY - chunk.y) / BLOCK_SIZE);
      baseRow = Math.max(layers + 2, Math.min(rows - 3, baseRow));

      for (let layer = 0; layer < layers; layer++) {
        const row = baseRow - (layers - 1 - layer);
        if (row < 0 || row >= rows) continue;

        const leftWallBlocks = wallProfile.leftWidths[row];
        const rightWallBlocks = wallProfile.rightWidths[row];
        const y = chunk.y + row * BLOCK_SIZE;
        const laneLeft = leftWallBlocks * BLOCK_SIZE;
        const laneRight = CONFIG.INTERNAL_WIDTH - rightWallBlocks * BLOCK_SIZE;
        const playableBlocks = Math.floor((laneRight - laneLeft) / BLOCK_SIZE);
        const requiredGapBlocks = Math.ceil(CONFIG.SAFE_PATH_WIDTH / BLOCK_SIZE);

        // Account for side masses already placed on this same row so opposite sides
        // can never combine and close the lane.
        let existingLeftBlocks = 0;
        let existingRightBlocks = 0;
        for (const p of chunk.platforms) {
          if (p.isWall || p.breakable || p.y !== y || p.height !== BLOCK_SIZE) continue;
          if (p.x <= laneLeft + 1) {
            existingLeftBlocks = Math.max(existingLeftBlocks, Math.ceil((p.x + p.width - laneLeft) / BLOCK_SIZE));
          } else if (p.x + p.width >= laneRight - 1) {
            existingRightBlocks = Math.max(existingRightBlocks, Math.ceil((laneRight - p.x) / BLOCK_SIZE));
          }
        }

        const existingSideBlocks = existingLeftBlocks + existingRightBlocks;
        const remainingForNewMass = Math.max(0, playableBlocks - requiredGapBlocks - existingSideBlocks);
        if (remainingForNewMass < 2) continue;

        // Keep side masses narrow: never wider than 3 blocks.
        const runBlocks = Math.min(topRunBlocks + layer * growthPerLayer, remainingForNewMass, maxSideMassWidthBlocks);
        if (runBlocks < 1) continue;
        if (runBlocks >= maxSideMassWidthBlocks && !eventRng.chance(CONFIG.SIDE_MASS_LONG_WIDTH_CHANCE)) continue;
        const width = runBlocks * BLOCK_SIZE;
        const x = fromLeft
          ? leftWallBlocks * BLOCK_SIZE
          : CONFIG.INTERNAL_WIDTH - rightWallBlocks * BLOCK_SIZE - width;

        // Never allow two side masses to occupy the same row from opposite sides.
        const hasExistingRowMass = chunk.platforms.some((p) => {
          return !p.isWall && !p.breakable && p.height === BLOCK_SIZE && p.y === y;
        });
        if (hasExistingRowMass) continue;

        chunk.platforms.push({
          x,
          y,
          width,
          height: BLOCK_SIZE,
          isWall: false,
          breakable: false,
          hp: 0,
          chunkIndex: chunk.index,
        });
      }
    }
  }

  private getMaxWallBlocksForRows(
    wallProfile: WallProfile,
    startRow: number,
    endRow: number,
    side: "left" | "right"
  ): number {
    const widths = side === "left" ? wallProfile.leftWidths : wallProfile.rightWidths;
    let maxBlocks = 0;
    for (let r = Math.max(0, startRow); r <= Math.min(endRow, widths.length - 1); r++) {
      maxBlocks = Math.max(maxBlocks, widths[r]);
    }
    return maxBlocks;
  }

  private overlapsRect(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Validate that a rect is inside the playable lane for all rows it spans.
  private isRectInsideLane(
    chunk: Chunk,
    wallProfile: WallProfile,
    x: number,
    y: number,
    width: number,
    height: number,
    margin: number = 0
  ): boolean {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const startRow = Math.floor((y - chunk.y) / BLOCK);
    const endRow = Math.floor((y + height - 1 - chunk.y) / BLOCK);

    for (let row = startRow; row <= endRow; row++) {
      if (row < 0 || row >= wallProfile.leftWidths.length) continue;
      const leftBound = wallProfile.leftWidths[row] * BLOCK + margin;
      const rightBound = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[row] * BLOCK - margin;
      if (x < leftBound || x + width > rightBound) {
        return false;
      }
    }
    return true;
  }

  // Validate against non-wall solids (floors, masses, etc.) to prevent inside-block spawns.
  private overlapsSolidPlatforms(
    platforms: Platform[],
    x: number,
    y: number,
    width: number,
    height: number,
    padding: number = 0
  ): boolean {
    for (const p of platforms) {
      if (p.isWall) continue;
      if (this.overlapsRect(x, y, width, height, p.x - padding, p.y - padding, p.width + padding * 2, p.height + padding * 2)) {
        return true;
      }
    }
    return false;
  }

  private overlapsAnyPlatform(
    platforms: Platform[],
    x: number,
    y: number,
    width: number,
    height: number,
    padding: number = 0
  ): boolean {
    for (const p of platforms) {
      if (this.overlapsRect(x, y, width, height, p.x - padding, p.y - padding, p.width + padding * 2, p.height + padding * 2)) {
        return true;
      }
    }
    return false;
  }

  // Avoid spawning collectibles inside small cavities formed by breakable blocks.
  private isInsideBreakablePocket(
    platforms: Platform[],
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const maxSideGap = BLOCK * 1.1;
    const maxFloorGap = BLOCK * 1.4;
    const rectLeft = x;
    const rectTop = y;
    const rectRight = x + width;
    const rectBottom = y + height;

    let hasLeftBreakable = false;
    let hasRightBreakable = false;
    let hasFloorBreakable = false;

    for (const p of platforms) {
      if (!p.breakable) continue;

      const verticalOverlap = rectTop < p.y + p.height && rectBottom > p.y;
      if (verticalOverlap) {
        const rightEdgeGap = rectLeft - (p.x + p.width);
        if (rightEdgeGap >= -2 && rightEdgeGap <= maxSideGap) {
          hasLeftBreakable = true;
        }

        const leftEdgeGap = p.x - rectRight;
        if (leftEdgeGap >= -2 && leftEdgeGap <= maxSideGap) {
          hasRightBreakable = true;
        }
      }

      const horizontalOverlap = rectRight > p.x && rectLeft < p.x + p.width;
      if (horizontalOverlap) {
        const floorGap = p.y - rectBottom;
        if (floorGap >= -2 && floorGap <= maxFloorGap) {
          hasFloorBreakable = true;
        }
      }

      if (hasLeftBreakable && hasRightBreakable && hasFloorBreakable) {
        return true;
      }
    }

    return false;
  }

  // Require at least one clear block above the entity's central body area.
  // This avoids spawns inside 1-block-high tunnels while still allowing
  // natural cave overhangs near edges.
  private hasSpawnHeadroom(
    platforms: Platform[],
    x: number,
    y: number,
    width: number,
    blockSize: number
  ): boolean {
    const clearanceWidth = Math.max(10, Math.floor(width * 0.45));
    const clearanceX = x + (width - clearanceWidth) / 2;
    const clearanceY = y - blockSize;
    return !this.overlapsSolidPlatforms(platforms, clearanceX, clearanceY, clearanceWidth, blockSize, 0);
  }
  
  // Helper: find the center column of the first gap in a column array
  private findFirstGap(columns: boolean[], numColumns: number): number {
    let gapStart = -1;
    for (let c = 0; c < numColumns; c++) {
      if (!columns[c]) {
        if (gapStart === -1) gapStart = c;
      } else if (gapStart !== -1) {
        return Math.floor((gapStart + c - 1) / 2);
      }
    }
    if (gapStart !== -1) return Math.floor((gapStart + numColumns - 1) / 2);
    return Math.floor(numColumns / 2);
  }
  
  /**
   * Find all standable surfaces in a chunk (top edges of breakable platforms
   * and wall ledges where the wall gets narrower = a step the player can land on).
   * Returns an array of { x, y, width } representing the top of each surface.
   */
  private getStandableSurfaces(chunk: Chunk, wallProfile: WallProfile): { x: number; y: number; width: number }[] {
    const BLOCK_SIZE = CONFIG.WALL_BLOCK_SIZE;
    const surfaces: { x: number; y: number; width: number }[] = [];
    
    // 1. Group breakable platforms by Y to find contiguous floor rows
    const platformsByY = new Map<number, { x: number; width: number }[]>();
    for (const p of chunk.platforms) {
      if (p.isWall) continue;
      const key = p.y;
      if (!platformsByY.has(key)) platformsByY.set(key, []);
      platformsByY.get(key)!.push({ x: p.x, width: p.width });
    }
    
    // Merge adjacent blocks on the same row into contiguous surfaces
    for (const [y, blocks] of platformsByY) {
      blocks.sort((a, b) => a.x - b.x);
      let startX = blocks[0].x;
      let endX = blocks[0].x + blocks[0].width;
      
      for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].x <= endX + 1) {
          // Adjacent or overlapping, extend
          endX = Math.max(endX, blocks[i].x + blocks[i].width);
        } else {
          // Gap found, push current surface
          surfaces.push({ x: startX, y: y, width: endX - startX });
          startX = blocks[i].x;
          endX = blocks[i].x + blocks[i].width;
        }
      }
      surfaces.push({ x: startX, y: y, width: endX - startX });
    }
    
    // 2. Find wall ledges (where wall gets wider below = step on top)
    const rows = wallProfile.leftWidths.length;
    for (let r = 1; r < rows; r++) {
      // Left wall: if this row is wider than the row above, there's a ledge
      if (wallProfile.leftWidths[r] > wallProfile.leftWidths[r - 1]) {
        const ledgeY = chunk.y + r * BLOCK_SIZE;
        const prevWidth = wallProfile.leftWidths[r - 1] * BLOCK_SIZE;
        const currWidth = wallProfile.leftWidths[r] * BLOCK_SIZE;
        // The ledge spans from previous wall edge to current wall edge
        surfaces.push({ x: prevWidth, y: ledgeY, width: currWidth - prevWidth });
      }
      
      // Right wall: if this row is wider than the row above, there's a ledge
      if (wallProfile.rightWidths[r] > wallProfile.rightWidths[r - 1]) {
        const ledgeY = chunk.y + r * BLOCK_SIZE;
        const prevWidth = wallProfile.rightWidths[r - 1] * BLOCK_SIZE;
        const currWidth = wallProfile.rightWidths[r] * BLOCK_SIZE;
        const ledgeX = CONFIG.INTERNAL_WIDTH - currWidth;
        surfaces.push({ x: ledgeX, y: ledgeY, width: currWidth - prevWidth });
      }
    }
    
    return surfaces;
  }
  
  private generateEnemies(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK_SIZE = CONFIG.WALL_BLOCK_SIZE;
    
    // Enemy count: starts sparse (2) at chunk 1, scales up to the 2× cap over ~18 chunks
    const maxEnemies = CONFIG.ENEMIES_PER_CHUNK * 2;
    const numEnemies = Math.floor(Math.min(2 + chunk.index * 0.45, maxEnemies));
    
    // Get available enemy types based on depth
    let enemyTypes = EnemyFactory.getAvailableTypes(chunk.index);
    
    // Skip if no enemy types available
    if (enemyTypes.length === 0) return;
    
    // Weighted spawn chances only among currently unlocked enemy types.
    const getWeightedEnemyType = (): EnemyType => {
      const weights: Partial<Record<EnemyType, number>> = {};
      if (enemyTypes.includes("HORIZONTAL")) weights.HORIZONTAL = 1.0;
      if (enemyTypes.includes("PUFFER")) weights.PUFFER = 0.45;
      if (enemyTypes.includes("STATIC")) weights.STATIC = 0.4;
      if (enemyTypes.includes("EXPLODER")) weights.EXPLODER = 0.35;

      const entries = Object.entries(weights) as [EnemyType, number][];
      if (entries.length === 0) return "HORIZONTAL";
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = rng.range(0, total);
      for (const [type, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return type;
      }
      return entries[entries.length - 1][0];
    };
    
    // Collect all non-wall platforms in this chunk for overlap checking
    // (includes breakable floors and impenetrable side-center masses).
    const solidPlatforms = chunk.platforms.filter(p => !p.isWall);
    
    // Collect standable surfaces for STATIC enemy placement
    const standableSurfaces = this.getStandableSurfaces(chunk, wallProfile);
    
    const sectionHeight = CONFIG.CHUNK_HEIGHT / (numEnemies + 1);
    const staticEnemySize = 34; // STATIC crab proxy height for surface placement.
    const enemySize = 44; // Non-STATIC proxy for placement checks.
    const padding = 8; // Extra padding around platforms to keep enemies clear
    
    for (let i = 0; i < numEnemies; i++) {
      const type = getWeightedEnemyType();
      
      let enemyX = 0;
      let enemyY = 0;
      let placed = false;
      let selectedStaticSurface: { x: number; y: number; width: number } | null = null;
      const maxAttempts = 15;
      
      // STATIC enemies must be placed on standable surfaces (platforms + wall ledges)
      if (type === "STATIC") {
        // Filter surfaces that are wide enough for the enemy
        const validSurfaces = standableSurfaces.filter(s => s.width >= staticEnemySize);
        if (validSurfaces.length === 0) continue;
        
        const staticAttempts = 24;
        for (let attempt = 0; attempt < staticAttempts; attempt++) {
          const surface = rng.pick(validSurfaces);
          
          // Place enemy on top of the surface, with some random X offset
          const maxOffset = Math.max(0, surface.width - staticEnemySize - 4);
          enemyX = surface.x + 2 + (maxOffset > 0 ? rng.range(0, maxOffset) : 0);
          enemyY = surface.y - staticEnemySize; // Sit directly on top of the surface
          
          // Make sure it's not inside a wall
          const row = Math.min(
            Math.floor((enemyY - chunk.y) / BLOCK_SIZE),
            wallProfile.leftWidths.length - 1
          );
          if (row >= 0 && row < wallProfile.leftWidths.length) {
            const leftWall = wallProfile.leftWidths[row] * BLOCK_SIZE;
            const rightWall = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[row] * BLOCK_SIZE;
            if (enemyX < leftWall || enemyX + staticEnemySize > rightWall) continue;
          }
          
          // Check not too close to another enemy
          const tooCloseToOther = chunk.enemies.some(e => {
            return Math.abs(e.x - enemyX) < staticEnemySize * 1.5 && Math.abs(e.y - enemyY) < staticEnemySize;
          });

          const hasHeadroom = this.hasSpawnHeadroom(
            chunk.platforms,
            enemyX,
            enemyY,
            staticEnemySize,
            BLOCK_SIZE
          );

          if (!tooCloseToOther && hasHeadroom) {
            selectedStaticSurface = {
              x: surface.x,
              y: surface.y,
              width: surface.width,
            };
            placed = true;
            break;
          }
        }
      } else {
        // Non-STATIC enemies: original placement logic (floating in air)
        enemyY = chunk.y + sectionHeight * (i + 0.5) + rng.range(-30, 30);
        
        // Get actual wall width at the enemy's Y position
        const row = Math.min(
          Math.floor((enemyY - chunk.y) / BLOCK_SIZE),
          wallProfile.leftWidths.length - 1
        );
        const leftWallWidth = this.getMaxWallWidth(wallProfile, Math.max(0, row - 1), Math.min(row + 1, wallProfile.leftWidths.length - 1), "left");
        const rightWallWidth = this.getMaxWallWidth(wallProfile, Math.max(0, row - 1), Math.min(row + 1, wallProfile.rightWidths.length - 1), "right");
        
        const playableLeft = leftWallWidth + 10; // Extra padding from wall
        const playableRight = CONFIG.INTERNAL_WIDTH - rightWallWidth - 10;
        const playableWidth = playableRight - playableLeft;
        
        // Skip if not enough space
        if (playableWidth < enemySize + 20) continue;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          enemyX = playableLeft + rng.range(10, playableWidth - enemySize - 10);
          
          // Check overlap with all non-wall solid platforms (with padding)
          const overlaps = solidPlatforms.some(p => {
            return (
              enemyX < p.x + p.width + padding &&
              enemyX + enemySize > p.x - padding &&
              enemyY < p.y + p.height + padding &&
              enemyY + enemySize > p.y - padding
            );
          });
          
          if (!overlaps) {
            placed = true;
            break;
          }
        }
      }
      
      // Only spawn if we found a valid position
      if (!placed) continue;
      
      const enemy = EnemyFactory.create(type, enemyX, enemyY, rng);

      // Final safety validation with the ACTUAL enemy dimensions.
      const validLane = this.isRectInsideLane(
        chunk,
        wallProfile,
        enemy.x,
        enemy.y,
        enemy.width,
        enemy.height,
        4
      );
      const insideSolid = this.overlapsSolidPlatforms(chunk.platforms, enemy.x, enemy.y, enemy.width, enemy.height, 2);
      if (!validLane || insideSolid) continue;

      // Reuse crab headroom rule for all enemy spawns:
      // no enemy should spawn in a 1-block-high tunnel.
      const hasHeadroom = this.hasSpawnHeadroom(
        chunk.platforms,
        enemy.x,
        enemy.y,
        enemy.width,
        BLOCK_SIZE
      );
      if (!hasHeadroom) continue;

      if (type === "STATIC" && enemy instanceof StaticEnemy && selectedStaticSurface) {
        const margin = 2;
        const minX = selectedStaticSurface.x + margin;
        const maxX = selectedStaticSurface.x + selectedStaticSurface.width - enemy.width - margin;
        enemy.setMovementBounds(minX, maxX);
      }

      enemy.chunkIndex = chunk.index;
      chunk.enemies.push(enemy);
    }
  }
  
  private generateGems(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    // World gems are intentionally disabled.
    // Gems now come only from enemies and weeds (dropped gems at runtime).
    void chunk;
    void rng;
    void wallProfile;
  }

  // Runtime helper for systems that need a safe X at a specific world Y (e.g., powerup orbs).
  getSafeSpawnX(worldY: number, entityWidth: number, preferredX: number): number {
    const chunkIndex = Math.max(0, Math.floor(worldY / CONFIG.CHUNK_HEIGHT));
    const chunk = this.getChunk(chunkIndex);
    const half = entityWidth / 2;
    let leftBound = CONFIG.WALL_WIDTH + half;
    let rightBound = CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH - half;

    // Infer wall bounds from wall platforms at this Y.
    for (const p of chunk.platforms) {
      if (!p.isWall) continue;
      if (worldY < p.y || worldY > p.y + p.height) continue;
      if (p.x === 0) {
        leftBound = Math.max(leftBound, p.x + p.width + half);
      } else {
        rightBound = Math.min(rightBound, p.x - half);
      }
    }

    if (rightBound <= leftBound) {
      return CONFIG.INTERNAL_WIDTH / 2;
    }

    const clampX = (x: number): number => Math.max(leftBound, Math.min(rightBound, x));
    const candidates: number[] = [
      clampX(preferredX),
      clampX(CONFIG.INTERNAL_WIDTH / 2),
      clampX(leftBound + (rightBound - leftBound) * 0.3),
      clampX(leftBound + (rightBound - leftBound) * 0.7),
    ];

    const rectY = worldY - entityWidth / 2;
    for (const x of candidates) {
      const rectX = x - half;
      if (
        !this.overlapsSolidPlatforms(chunk.platforms, rectX, rectY, entityWidth, entityWidth, 2) &&
        this.hasSpawnHeadroom(chunk.platforms, rectX, rectY, entityWidth, CONFIG.WALL_BLOCK_SIZE)
      ) {
        return x;
      }
    }

    // Fallback sweep across lane, pick first non-overlapping point.
    const step = Math.max(8, Math.floor(CONFIG.WALL_BLOCK_SIZE / 2));
    for (let x = leftBound; x <= rightBound; x += step) {
      const rectX = x - half;
      if (
        !this.overlapsSolidPlatforms(chunk.platforms, rectX, rectY, entityWidth, entityWidth, 2) &&
        this.hasSpawnHeadroom(chunk.platforms, rectX, rectY, entityWidth, CONFIG.WALL_BLOCK_SIZE)
      ) {
        return x;
      }
    }

    return clampX(preferredX);
  }
  
  private generateWeeds(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = wallProfile.leftWidths.length;
    const depthMeters = Math.floor(chunk.y / 10);
    const pufferUnlocked = depthMeters >= 100;
    const weedBodyWidth = 20;
    const weedBodyHeight = 20;
    const trySpawnLedgeEntity = (
      ledgeX: number,
      ledgeY: number,
      isLeft: boolean,
    ): void => {
      const bodyX = ledgeX - weedBodyWidth / 2;
      const bodyY = ledgeY - weedBodyHeight;
      const insideLane = this.isRectInsideLane(chunk, wallProfile, bodyX, bodyY, weedBodyWidth, weedBodyHeight, 1);
      const overlapsSolid = this.overlapsAnyPlatform(chunk.platforms, bodyX, bodyY, weedBodyWidth, weedBodyHeight, 0);
      const hasHeadroom = this.hasSpawnHeadroom(chunk.platforms, bodyX, bodyY, weedBodyWidth, BLOCK);
      if (!insideLane || overlapsSolid || !hasHeadroom) return;

      // Promote pufferfish from decorative weeds to an active enemy.
      if (pufferUnlocked && rng.chance(0.26)) {
        const puffer = EnemyFactory.create("PUFFER", bodyX, bodyY, rng);
        const pufferInsideLane = this.isRectInsideLane(chunk, wallProfile, puffer.x, puffer.y, puffer.width, puffer.height, 2);
        const pufferOverlapsSolid = this.overlapsSolidPlatforms(chunk.platforms, puffer.x, puffer.y, puffer.width, puffer.height, 1);
        const pufferHasHeadroom = this.hasSpawnHeadroom(chunk.platforms, puffer.x, puffer.y, puffer.width, BLOCK);
        const tooCloseToOtherEnemy = chunk.enemies.some((e) => {
          const dx = (e.x + e.width / 2) - (puffer.x + puffer.width / 2);
          const dy = (e.y + e.height / 2) - (puffer.y + puffer.height / 2);
          return dx * dx + dy * dy < 42 * 42;
        });
        if (pufferInsideLane && !pufferOverlapsSolid && pufferHasHeadroom && !tooCloseToOtherEnemy) {
          puffer.chunkIndex = chunk.index;
          chunk.enemies.push(puffer);
          return;
        }
      }

      // Non-puffer decorative weeds only.
      // Keep only the two coral/plant variants and exclude fish-like entries.
      const weedSpriteChoices = [0, 1];
      chunk.weeds.push({
        x: ledgeX,
        y: ledgeY,
        spriteIndex: rng.pick(weedSpriteChoices),
        flipX: rng.chance(0.5),
        isLeft,
      });
    };
    
    // A ledge forms when the row BELOW is wider than the row above.
    // The wider lower row protrudes further into the well, creating a shelf.
    // The shelf surface is the exposed top of the wider row, between the
    // narrower row's edge and the wider row's edge.
    // The weed sits on the midpoint of that shelf, anchored to its top surface.
    
    // Check left wall for ledges
    for (let r = 0; r < rows - 1; r++) {
      if (wallProfile.leftWidths[r + 1] > wallProfile.leftWidths[r]) {
        if (rng.chance(0.5)) {
          // Shelf runs from narrower row's edge to wider row's edge
          const narrowEdge = wallProfile.leftWidths[r] * BLOCK;
          const wideEdge = wallProfile.leftWidths[r + 1] * BLOCK;
          // Center the weed on the shelf
          const ledgeX = (narrowEdge + wideEdge) / 2;
          // Top of the wider row = shelf surface
          const ledgeY = chunk.y + (r + 1) * BLOCK;
          trySpawnLedgeEntity(ledgeX, ledgeY, true);
        }
      }
    }
    
    // Check right wall for ledges
    for (let r = 0; r < rows - 1; r++) {
      if (wallProfile.rightWidths[r + 1] > wallProfile.rightWidths[r]) {
        if (rng.chance(0.5)) {
          const narrowEdge = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[r] * BLOCK;
          const wideEdge = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[r + 1] * BLOCK;
          const ledgeX = (narrowEdge + wideEdge) / 2;
          const ledgeY = chunk.y + (r + 1) * BLOCK;
          trySpawnLedgeEntity(ledgeX, ledgeY, false);
        }
      }
    }
  }
  
  // Get all entities in visible range
  getVisibleEntities(cameraY: number, viewportHeight: number): {
    platforms: Platform[];
    enemies: BaseEnemy[];
    gems: Gem[];
    weeds: Weed[];
  } {
    const buffer = viewportHeight; // Extra buffer for smooth transitions
    const topY = cameraY - buffer;
    const bottomY = cameraY + viewportHeight + buffer;
    
    const startChunk = Math.floor(topY / CONFIG.CHUNK_HEIGHT);
    const endChunk = Math.ceil(bottomY / CONFIG.CHUNK_HEIGHT);
    
    const platforms: Platform[] = [];
    const enemies: BaseEnemy[] = [];
    const gems: Gem[] = [];
    const weeds: Weed[] = [];
    
    for (let i = startChunk; i <= endChunk; i++) {
      if (i < 0) continue;
      
      const chunk = this.getChunk(i);
      platforms.push(...chunk.platforms);
      enemies.push(...chunk.enemies);
      for (const gem of chunk.gems) {
        if (!gem.collected) {
          gems.push(gem);
        }
      }
      weeds.push(...chunk.weeds);
    }
    
    return { platforms, enemies, gems, weeds };
  }
  
  // Clean up chunks that are far above the camera
  cleanupChunks(cameraY: number): void {
    const currentChunk = Math.floor(cameraY / CONFIG.CHUNK_HEIGHT);
    const minChunk = currentChunk - 3;
    
    for (const [index, _] of this.chunks) {
      if (index < minChunk) {
        this.chunks.delete(index);
      }
    }
  }
}
