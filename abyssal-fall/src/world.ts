/**
 * DOWNWELL - World Generation and Handling
 * 
 * Handles deterministic level generation with infinite vertical world.
 * Includes seeded RNG, chunk-based spawning, and entity management.
 */

import { CONFIG } from "./config";
import { BaseEnemy, EnemyFactory, EnemyType } from "./enemies";

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
    
    // Downwell-style floor generation:
    // Each row spans the full playable width with 1-2 gaps for the player to fall through.
    // The player must navigate horizontally to find gaps or shoot through breakable blocks.
    
    const numRows = CONFIG.PLATFORMS_PER_CHUNK + rng.int(-1, 1);
    const sectionHeight = CONFIG.CHUNK_HEIGHT / (numRows + 1);
    
    // Track gap center from previous row to create navigable but shifting paths
    let lastGapCol = -1;
    
    for (let i = 0; i < numRows; i++) {
      // Snap Y to block grid
      const platformY = Math.round((chunk.y + sectionHeight * (i + 1)) / BLOCK_SIZE) * BLOCK_SIZE;
      
      // Get wall widths at this row's Y position
      const row = Math.min(
        Math.floor((platformY - chunk.y) / BLOCK_SIZE),
        wallProfile.leftWidths.length - 1
      );
      const leftWallWidth = this.getMaxWallWidth(wallProfile, Math.max(0, row), Math.min(row, wallProfile.leftWidths.length - 1), "left");
      const rightWallWidth = this.getMaxWallWidth(wallProfile, Math.max(0, row), Math.min(row, wallProfile.rightWidths.length - 1), "right");
      
      const playableLeft = leftWallWidth;
      const playableRight = CONFIG.INTERNAL_WIDTH - rightWallWidth;
      const playableWidth = playableRight - playableLeft;
      const numColumns = Math.floor(playableWidth / BLOCK_SIZE);
      
      // Need at least 5 columns for a meaningful floor row
      if (numColumns < 5) continue;
      
      // Decide if this is a "full floor" (no pre-made gap, must shoot through)
      const isFullFloor = rng.chance(CONFIG.FULL_FLOOR_CHANCE);
      
      // Build array of which columns have blocks (true = block, false = gap)
      const columns: boolean[] = new Array(numColumns).fill(true);
      
      if (!isFullFloor) {
        // Create 1-2 gaps in the floor
        const numGaps = numColumns >= 8 ? (rng.chance(0.45) ? 2 : 1) : 1;
        
        for (let g = 0; g < numGaps; g++) {
          const gapWidth = rng.int(CONFIG.GAP_MIN_BLOCKS, CONFIG.GAP_MAX_BLOCKS);
          
          let gapStart: number;
          
          if (g === 0 && lastGapCol >= 0) {
            // Shift gap from previous row's position by 2-5 columns for variety
            const shift = rng.int(2, Math.min(5, Math.floor(numColumns / 3)));
            const direction = rng.chance(0.5) ? 1 : -1;
            gapStart = lastGapCol + shift * direction;
            // Clamp to valid range (leave at least 1 block on each side)
            gapStart = Math.max(1, Math.min(numColumns - gapWidth - 1, gapStart));
          } else if (g === 0) {
            // First row or first gap: pick a position, avoid edges
            gapStart = rng.int(1, numColumns - gapWidth - 1);
          } else {
            // Second gap: place on opposite side from first gap
            const firstGapCenter = this.findFirstGap(columns, numColumns);
            if (firstGapCenter < numColumns / 2) {
              // First gap is on left, put second gap on right half
              gapStart = rng.int(Math.floor(numColumns / 2) + 1, numColumns - gapWidth - 1);
            } else {
              // First gap is on right, put second gap on left half
              gapStart = rng.int(1, Math.floor(numColumns / 2) - gapWidth);
            }
            gapStart = Math.max(1, Math.min(numColumns - gapWidth - 1, gapStart));
          }
          
          // Clear the gap columns
          for (let c = gapStart; c < gapStart + gapWidth && c < numColumns; c++) {
            columns[c] = false;
          }
          
          // Track the gap position for the next row
          if (g === 0) {
            lastGapCol = gapStart + Math.floor(gapWidth / 2);
          }
        }
      }
      
      // Create breakable block platforms for each filled column
      for (let col = 0; col < numColumns; col++) {
        if (!columns[col]) continue;
        
        chunk.platforms.push({
          x: playableLeft + col * BLOCK_SIZE,
          y: platformY,
          width: BLOCK_SIZE,
          height: BLOCK_SIZE,
          isWall: false,
          breakable: true,
          hp: 1,
          chunkIndex: chunk.index,
        });
      }
    }
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
      if (!p.breakable) continue;
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
    
    // Difficulty scaling based on depth
    const difficultyMultiplier = 1 + chunk.index * 0.1;
    const numEnemies = Math.floor(CONFIG.ENEMIES_PER_CHUNK * Math.min(difficultyMultiplier, 2));
    
    // Get available enemy types based on depth
    let enemyTypes = EnemyFactory.getAvailableTypes(chunk.index);
    
    // Don't spawn horizontal enemies in chunk 1 (ground level)
    if (chunk.index === 1) {
      enemyTypes = enemyTypes.filter(type => type !== "HORIZONTAL");
    }
    
    // Skip if no enemy types available
    if (enemyTypes.length === 0) return;
    
    // Weighted spawn chances for enemy types (STATIC is rarer since it shoots)
    const getWeightedEnemyType = (): EnemyType => {
      const roll = rng.range(0, 1);
      
      // If EXPLODER is available (chunk >= 5): 20% STATIC, 50% HORIZONTAL, 30% EXPLODER
      // Otherwise: 25% STATIC, 75% HORIZONTAL
      if (enemyTypes.includes("EXPLODER")) {
        if (roll < 0.20) return "STATIC";
        if (roll < 0.70) return "HORIZONTAL";
        return "EXPLODER";
      } else if (enemyTypes.includes("HORIZONTAL")) {
        if (roll < 0.25) return "STATIC";
        return "HORIZONTAL";
      }
      return "STATIC"; // Fallback if only STATIC is available
    };
    
    // Collect all breakable platforms in this chunk for overlap checking
    const breakablePlatforms = chunk.platforms.filter(p => p.breakable);
    
    // Collect standable surfaces for STATIC enemy placement
    const standableSurfaces = this.getStandableSurfaces(chunk, wallProfile);
    
    const sectionHeight = CONFIG.CHUNK_HEIGHT / (numEnemies + 1);
    const enemySize = 32; // Approximate enemy size for boundary checking
    const padding = 8; // Extra padding around platforms to keep enemies clear
    
    for (let i = 0; i < numEnemies; i++) {
      const type = getWeightedEnemyType();
      
      let enemyX = 0;
      let enemyY = 0;
      let placed = false;
      const maxAttempts = 15;
      
      // STATIC enemies must be placed on standable surfaces (platforms + wall ledges)
      if (type === "STATIC") {
        // Filter surfaces that are wide enough for the enemy
        const validSurfaces = standableSurfaces.filter(s => s.width >= enemySize + 4);
        if (validSurfaces.length === 0) continue;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const surface = rng.pick(validSurfaces);
          
          // Place enemy on top of the surface, with some random X offset
          const maxOffset = Math.max(0, surface.width - enemySize - 4);
          enemyX = surface.x + 2 + (maxOffset > 0 ? rng.range(0, maxOffset) : 0);
          enemyY = surface.y - enemySize; // Sit directly on top of the surface
          
          // Make sure it's not inside a wall
          const row = Math.min(
            Math.floor((enemyY - chunk.y) / BLOCK_SIZE),
            wallProfile.leftWidths.length - 1
          );
          if (row >= 0 && row < wallProfile.leftWidths.length) {
            const leftWall = wallProfile.leftWidths[row] * BLOCK_SIZE;
            const rightWall = CONFIG.INTERNAL_WIDTH - wallProfile.rightWidths[row] * BLOCK_SIZE;
            if (enemyX < leftWall || enemyX + enemySize > rightWall) continue;
          }
          
          // Check not too close to another enemy
          const tooCloseToOther = chunk.enemies.some(e => {
            return Math.abs(e.x - enemyX) < enemySize * 1.5 && Math.abs(e.y - enemyY) < enemySize;
          });
          
          if (!tooCloseToOther) {
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
          
          // Check overlap with all breakable platforms (with padding)
          const overlaps = breakablePlatforms.some(p => {
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
      enemy.chunkIndex = chunk.index;
      chunk.enemies.push(enemy);
    }
  }
  
  private generateGems(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK_SIZE = CONFIG.WALL_BLOCK_SIZE;
    
    const numGems = CONFIG.GEMS_PER_CHUNK + rng.int(-1, 1);
    
    for (let i = 0; i < numGems; i++) {
      const gemY = chunk.y + rng.range(50, CONFIG.CHUNK_HEIGHT - 50);
      
      // Get actual wall width at the gem's Y position
      const row = Math.min(
        Math.floor((gemY - chunk.y) / BLOCK_SIZE),
        wallProfile.leftWidths.length - 1
      );
      const leftWallWidth = wallProfile.leftWidths[Math.max(0, row)] * BLOCK_SIZE;
      const rightWallWidth = wallProfile.rightWidths[Math.max(0, row)] * BLOCK_SIZE;
      const playableLeft = leftWallWidth + 10;
      const playableRight = CONFIG.INTERNAL_WIDTH - rightWallWidth - 10;
      const playableWidth = playableRight - playableLeft;
      
      if (playableWidth < 30) continue;
      
      const gemX = playableLeft + rng.range(10, playableWidth - 10);
      
      chunk.gems.push({
        x: gemX,
        y: gemY,
        width: 12,
        height: 12,
        value: rng.int(1, 3) * CONFIG.SCORE_PER_GEM,
        collected: false,
        chunkIndex: chunk.index,
        bobOffset: rng.range(0, Math.PI * 2),
      });
    }
  }
  
  private generateWeeds(chunk: Chunk, rng: SeededRNG, wallProfile: WallProfile): void {
    const BLOCK = CONFIG.WALL_BLOCK_SIZE;
    const rows = wallProfile.leftWidths.length;
    
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
          chunk.weeds.push({
            x: ledgeX,
            y: ledgeY,
            spriteIndex: rng.int(0, 6),
            flipX: rng.chance(0.5),
            isLeft: true,
          });
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
          chunk.weeds.push({
            x: ledgeX,
            y: ledgeY,
            spriteIndex: rng.int(0, 6),
            flipX: rng.chance(0.5),
            isLeft: false,
          });
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
      gems.push(...chunk.gems.filter(g => !g.collected));
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
