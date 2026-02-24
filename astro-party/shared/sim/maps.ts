import type { MapId, PowerUpType } from "./types.js";
import { ARENA_HEIGHT, ARENA_WIDTH } from "./constants.js";

export interface YellowBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CenterHole {
  x: number;
  y: number;
  radius: number;
  hasRotatingArrow: boolean;
}

export interface RepulsionZone {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export interface OverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
  holes: { x: number; y: number; radius: number }[];
}

export interface AsteroidSpawnConfig {
  enabled: boolean;
  minCount: number;
  maxCount: number;
  greyRatio: number;
  spawnAroundCenter?: boolean;
}

export interface MapPowerUpConfig {
  enabled: boolean;
  x: number;
  y: number;
  types: PowerUpType[];
  respawnPerRound: boolean;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  yellowBlocks: YellowBlock[];
  centerHoles: CenterHole[];
  repulsionZones: RepulsionZone[];
  overlayBoxes: OverlayBox[];
  asteroidConfig: AsteroidSpawnConfig;
  hasTurret: boolean;
  powerUpConfig?: MapPowerUpConfig;
}

const W = ARENA_WIDTH;
const H = ARENA_HEIGHT;

const MAP_0_CLASSIC_ROTATION: MapDefinition = {
  id: 0,
  name: "Classic Rotation",
  description: "Random map each round",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: false, minCount: 0, maxCount: 0, greyRatio: 0 },
  hasTurret: false,
};

const MAP_1_CACHE: MapDefinition = {
  id: 1,
  name: "The Cache",
  description: "Yellow blocks and a powerup in the center",
  yellowBlocks: generateCacheBlocks(),
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: false, minCount: 0, maxCount: 0, greyRatio: 0 },
  hasTurret: false,
  powerUpConfig: {
    enabled: true,
    x: 0.5,
    y: 0.5,
    types: ["LASER", "SHIELD", "SCATTER", "MINE", "HOMING_MISSILE", "JOUST"],
    respawnPerRound: true,
  },
};

const MAP_2_VORTEX: MapDefinition = {
  id: 2,
  name: "The Vortex",
  description: "A void in the center pulls everything around it",
  yellowBlocks: [],
  centerHoles: [
    {
      x: W / 2,
      y: H / 2,
      radius: 140,
      hasRotatingArrow: false,
    },
  ],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: {
    enabled: true,
    minCount: 7,
    maxCount: 7,
    greyRatio: 0.43,
    spawnAroundCenter: true,
  },
  hasTurret: false,
};

const MAP_3_REPULSE: MapDefinition = {
  id: 3,
  name: "Repulse",
  description: "Two magnetic fields push ships away",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [
    {
      x: W * 0.3,
      y: H / 2,
      radius: 84,
      strength: 0.035,
    },
    {
      x: W * 0.7,
      y: H / 2,
      radius: 84,
      strength: 0.035,
    },
  ],
  overlayBoxes: [],
  asteroidConfig: { enabled: true, minCount: 6, maxCount: 6, greyRatio: 0.5 },
  hasTurret: false,
};

const MAP_4_BUNKERS: MapDefinition = {
  id: 4,
  name: "Bunkers",
  description: "Solid cover with peek holes",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: true, minCount: 5, maxCount: 5, greyRatio: 0.4 },
  hasTurret: false,
};

const MAP_5_TURRET: MapDefinition = {
  id: 5,
  name: "Turret",
  description: "The original arena with a center turret",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: true, minCount: 5, maxCount: 5, greyRatio: 0 },
  hasTurret: true,
};

function generateCacheBlocks(): YellowBlock[] {
  const blocks: YellowBlock[] = [];
  const blockSize = 28;
  const gap = 0;
  const step = blockSize + gap;
  const columns = Math.max(1, Math.floor((W + gap) / step));
  const rows = Math.max(1, Math.floor((H + gap) / step));
  const layoutWidth = columns * blockSize + (columns - 1) * gap;
  const layoutHeight = rows * blockSize + (rows - 1) * gap;
  const rowStartX = Math.max(0, Math.round((W - layoutWidth) / 2));
  const colStartY = Math.max(0, Math.round((H - layoutHeight) / 2));

  const xPositions: number[] = [];
  for (let i = 0; i < columns; i += 1) {
    xPositions.push(rowStartX + i * step);
  }
  const yPositions: number[] = [];
  for (let i = 0; i < rows; i += 1) {
    yPositions.push(colStartY + i * step);
  }

  const rowIndices = [
    Math.floor(yPositions.length * 0.35),
    Math.floor(yPositions.length * 0.65),
  ];
  const colIndices = [
    Math.floor(xPositions.length * 0.35),
    Math.floor(xPositions.length * 0.65),
  ];

  const rowYs = rowIndices.map(
    (idx) => yPositions[Math.min(idx, yPositions.length - 1)],
  );
  const colXs = colIndices.map(
    (idx) => xPositions[Math.min(idx, xPositions.length - 1)],
  );

  const used = new Set<string>();
  const addBlock = (x: number, y: number): void => {
    const key = Math.round(x).toString() + "|" + Math.round(y).toString();
    if (used.has(key)) return;
    used.add(key);
    blocks.push({ x, y, width: blockSize, height: blockSize });
  };

  for (const y of rowYs) {
    for (const x of xPositions) {
      addBlock(x, y);
    }
  }
  for (const x of colXs) {
    for (const y of yPositions) {
      addBlock(x, y);
    }
  }

  return blocks;
}

export const MAP_DEFINITIONS: Record<MapId, MapDefinition> = {
  0: MAP_0_CLASSIC_ROTATION,
  1: MAP_1_CACHE,
  2: MAP_2_VORTEX,
  3: MAP_3_REPULSE,
  4: MAP_4_BUNKERS,
  5: MAP_5_TURRET,
};

export const ALL_MAP_IDS: MapId[] = [0, 1, 2, 3, 4, 5];
export const CLASSIC_ROTATION_MAP_IDS: MapId[] = [1, 2, 3, 4, 5];

export function getMapDefinition(id: MapId): MapDefinition {
  return MAP_DEFINITIONS[id];
}
