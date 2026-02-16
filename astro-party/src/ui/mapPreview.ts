import { Game } from "../Game";
import { MapId } from "../types";
import { elements } from "./elements";
import {
  getMapDefinition,
  ALL_MAP_IDS,
  MapDefinition,
} from "../../shared/sim/maps.js";
import { ARENA_WIDTH, ARENA_HEIGHT } from "../../shared/sim/constants.js";

export interface MapPreviewUI {
  updateMapPreview: (mapId?: MapId) => void;
}

export function createMapPreviewUI(game: Game): MapPreviewUI {
  const canvas = elements.mapPreviewCanvas;
  const ctx = canvas.getContext("2d")!;

  // Canvas dimensions - mini-map size (must match CSS)
  const canvasWidth = 140;
  const canvasHeight = 105;

  // Colors for different map features
  const colors = {
    background: "rgba(0, 0, 0, 0.3)",
    yellowBlock: "#fbbf24",
    centerHole: "#1f2937",
    centerHoleBorder: "#374151",
    repulsionZone: "rgba(59, 130, 246, 0.3)",
    repulsionZoneBorder: "rgba(59, 130, 246, 0.6)",
    overlayBox: "rgba(75, 85, 99, 0.5)",
    overlayBoxBorder: "rgba(107, 114, 128, 0.8)",
    asteroid: "#9ca3af",
    turret: "#ef4444",
    spawnPoint: "rgba(34, 197, 94, 0.5)",
    grid: "rgba(255, 255, 255, 0.05)",
  };

  function scaleX(x: number): number {
    return (x / ARENA_WIDTH) * canvasWidth;
  }

  function scaleY(y: number): number {
    return (y / ARENA_HEIGHT) * canvasHeight;
  }

  function scaleSize(size: number): number {
    return (
      (size / Math.max(ARENA_WIDTH, ARENA_HEIGHT)) *
      Math.max(canvasWidth, canvasHeight)
    );
  }

  function drawGrid(): void {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    const gridSize = 20;

    for (let x = 0; x <= canvasWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    for (let y = 0; y <= canvasHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }

  function drawYellowBlocks(blocks: MapDefinition["yellowBlocks"]): void {
    ctx.fillStyle = colors.yellowBlock;
    for (const block of blocks) {
      const x = scaleX(block.x);
      const y = scaleY(block.y);
      const w = scaleX(block.x + block.width) - x;
      const h = scaleY(block.y + block.height) - y;
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawCenterHoles(holes: MapDefinition["centerHoles"]): void {
    for (const hole of holes) {
      const cx = scaleX(hole.x);
      const cy = scaleY(hole.y);
      const r = scaleSize(hole.radius);

      // Hole background
      ctx.fillStyle = colors.centerHole;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = colors.centerHoleBorder;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawRepulsionZones(zones: MapDefinition["repulsionZones"]): void {
    for (const zone of zones) {
      const cx = scaleX(zone.x);
      const cy = scaleY(zone.y);
      const r = scaleSize(zone.radius);

      // Zone fill
      ctx.fillStyle = colors.repulsionZone;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Zone border
      ctx.strokeStyle = colors.repulsionZoneBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Direction indicator (arrow pointing outward)
      ctx.strokeStyle = colors.repulsionZoneBorder;
      ctx.lineWidth = 2;
      const arrowSize = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - arrowSize, cy);
      ctx.lineTo(cx + arrowSize, cy);
      ctx.moveTo(cx + arrowSize * 0.7, cy - arrowSize * 0.3);
      ctx.lineTo(cx + arrowSize, cy);
      ctx.lineTo(cx + arrowSize * 0.7, cy + arrowSize * 0.3);
      ctx.stroke();
    }
  }

  function drawOverlayBoxes(boxes: MapDefinition["overlayBoxes"]): void {
    ctx.fillStyle = colors.overlayBox;
    ctx.strokeStyle = colors.overlayBoxBorder;
    ctx.lineWidth = 1;

    for (const box of boxes) {
      const x = scaleX(box.x);
      const y = scaleY(box.y);
      const w = scaleX(box.x + box.width) - x;
      const h = scaleY(box.y + box.height) - y;

      // Box fill
      ctx.fillRect(x, y, w, h);

      // Box border
      ctx.strokeRect(x, y, w, h);

      // Holes in the box
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      for (const hole of box.holes) {
        const hx = x + (hole.x / box.width) * w;
        const hy = y + (hole.y / box.height) * h;
        const hr = scaleSize(hole.radius);
        ctx.beginPath();
        ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = colors.overlayBox;
    }
  }

  function drawAsteroidConfig(config: MapDefinition["asteroidConfig"]): void {
    if (!config.enabled) return;

    const count = config.minCount;
    ctx.fillStyle = colors.asteroid;

    // Draw some representative asteroids in a circle or random positions
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const radius = Math.min(canvasWidth, canvasHeight) * 0.35;

    for (let i = 0; i < Math.min(count, 8); i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const r = scaleSize(25); // Approximate asteroid size

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTurret(hasTurret: boolean): void {
    if (!hasTurret) return;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const size = 8;

    // Turret base
    ctx.fillStyle = colors.turret;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    // Turret barrel
    ctx.strokeStyle = colors.turret;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + size * 1.5, cy);
    ctx.stroke();
  }

  function drawSpawnPoints(): void {
    const padding = 15;
    const corners = [
      { x: padding, y: padding },
      { x: canvasWidth - padding, y: padding },
      { x: canvasWidth - padding, y: canvasHeight - padding },
      { x: padding, y: canvasHeight - padding },
    ];

    ctx.fillStyle = colors.spawnPoint;
    for (const corner of corners) {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMap(mapId: MapId): void {
    const map = getMapDefinition(mapId);

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw background grid
    drawGrid();

    // Draw features in order (back to front)
    drawRepulsionZones(map.repulsionZones);
    drawCenterHoles(map.centerHoles);
    drawOverlayBoxes(map.overlayBoxes);
    drawYellowBlocks(map.yellowBlocks);
    drawAsteroidConfig(map.asteroidConfig);
    drawTurret(map.hasTurret);
    drawSpawnPoints();
  }

  function updateMapPreview(mapId?: MapId): void {
    const currentMapId = mapId ?? game.getMapId();
    drawMap(currentMapId);
  }

  // Initial draw
  updateMapPreview();

  return { updateMapPreview };
}
