import { Game } from "../Game";
import { MapId } from "../types";
import { getMapOverlayUrl } from "../systems/rendering/MapOverlayRegistry";
import { renderAssetStore } from "../systems/rendering/RenderAssetStore";
import { elements } from "./elements";
import { getMapDefinition, type MapDefinition } from "../../shared/sim/maps.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_COLORS,
} from "../../shared/sim/constants.js";

const MIN_PREVIEW_WIDTH = 73;
const MIN_PREVIEW_HEIGHT = 55;
const mapOverlayPreviewListenerAttached = new WeakSet<HTMLImageElement>();

const colors = {
  yellowBlock: "#fbbf24",
  centerHole: "#1f2937",
  centerHoleBorder: "#374151",
  repulsionZone: "rgba(59, 130, 246, 0.3)",
  repulsionZoneBorder: "rgba(59, 130, 246, 0.6)",
  turret: "#ef4444",
  grid: "rgba(255, 255, 255, 0.05)",
};

function getCanvasDimensions(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
} {
  const rect = canvas.getBoundingClientRect();
  const sourceWidth = rect.width > 0 ? rect.width : canvas.width;
  const sourceHeight = rect.height > 0 ? rect.height : canvas.height;
  const width = Math.max(Math.round(sourceWidth), MIN_PREVIEW_WIDTH);
  const height = Math.max(Math.round(sourceHeight), MIN_PREVIEW_HEIGHT);
  return { width, height };
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const { width, height } = getCanvasDimensions(canvas);
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

export function renderMapPreviewOnCanvas(
  canvas: HTMLCanvasElement,
  mapId: MapId,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  resizeCanvas(canvas);

  const context: CanvasRenderingContext2D = ctx;

  function getCanvasWidth(): number {
    return canvas.width;
  }

  function getCanvasHeight(): number {
    return canvas.height;
  }

  function scaleX(x: number): number {
    return (x / ARENA_WIDTH) * getCanvasWidth();
  }

  function scaleY(y: number): number {
    return (y / ARENA_HEIGHT) * getCanvasHeight();
  }

  function scaleSize(size: number): number {
    return (
      (size / Math.max(ARENA_WIDTH, ARENA_HEIGHT)) *
      Math.max(getCanvasWidth(), getCanvasHeight())
    );
  }

  function drawGrid(): void {
    context.strokeStyle = colors.grid;
    context.lineWidth = 0.5;
    const gridSize = 20;
    const width = getCanvasWidth();
    const height = getCanvasHeight();

    for (let x = 0; x <= width; x += gridSize) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y <= height; y += gridSize) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }

  function drawYellowBlocks(blocks: MapDefinition["yellowBlocks"]): void {
    context.fillStyle = colors.yellowBlock;
    for (const block of blocks) {
      const x = scaleX(block.x);
      const y = scaleY(block.y);
      const w = scaleX(block.x + block.width) - x;
      const h = scaleY(block.y + block.height) - y;
      context.fillRect(x, y, w, h);
    }
  }

  function drawCenterHoles(holes: MapDefinition["centerHoles"]): void {
    for (const hole of holes) {
      const cx = scaleX(hole.x);
      const cy = scaleY(hole.y);
      const r = scaleSize(hole.radius);
      context.fillStyle = colors.centerHole;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = colors.centerHoleBorder;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawRepulsionZones(zones: MapDefinition["repulsionZones"]): void {
    for (const zone of zones) {
      const cx = scaleX(zone.x);
      const cy = scaleY(zone.y);
      const r = scaleSize(zone.radius);
      context.fillStyle = colors.repulsionZone;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = colors.repulsionZoneBorder;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.stroke();

      context.strokeStyle = colors.repulsionZoneBorder;
      context.lineWidth = 2;
      const arrowSize = r * 0.3;
      context.beginPath();
      context.moveTo(cx - arrowSize, cy);
      context.lineTo(cx + arrowSize, cy);
      context.moveTo(cx + arrowSize * 0.7, cy - arrowSize * 0.3);
      context.lineTo(cx + arrowSize, cy);
      context.lineTo(cx + arrowSize * 0.7, cy + arrowSize * 0.3);
      context.stroke();
    }
  }

  function drawOverlayAsset(): boolean {
    const overlayUrl = getMapOverlayUrl(mapId);
    if (!overlayUrl) {
      return false;
    }

    const image = renderAssetStore.getUrlImage(overlayUrl);

    if (!image.complete || image.naturalWidth <= 0) {
      if (!mapOverlayPreviewListenerAttached.has(image)) {
        mapOverlayPreviewListenerAttached.add(image);
        image.addEventListener(
          "load",
          () => {
            mapOverlayPreviewListenerAttached.delete(image);
            renderMapPreviewOnCanvas(canvas, mapId);
          },
          { once: true },
        );
      }
      return false;
    }

    context.drawImage(image, 0, 0, getCanvasWidth(), getCanvasHeight());
    return true;
  }

  function drawAsteroidConfig(config: MapDefinition["asteroidConfig"]): void {
    if (!config.enabled) return;
    const count = config.minCount;
    const asteroidColors = ["#9ca3af", "#f97316"];
    const width = getCanvasWidth();
    const height = getCanvasHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    for (let i = 0; i < Math.min(count, 8); i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const r = scaleSize(25);
      context.fillStyle = asteroidColors[i % 2];
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawTurret(hasTurret: boolean): void {
    if (!hasTurret) return;
    const width = getCanvasWidth();
    const height = getCanvasHeight();
    const cx = width / 2;
    const cy = height / 2;
    const size = 8;

    context.fillStyle = colors.turret;
    context.beginPath();
    context.arc(cx, cy, size, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = colors.turret;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + size * 1.5, cy);
    context.stroke();
  }

  function drawSpawnPoints(): void {
    const padding = 20;
    const width = getCanvasWidth();
    const height = getCanvasHeight();
    const corners = [
      { x: padding, y: padding, label: "P1", colorIndex: 0 },
      { x: width - padding, y: padding, label: "P2", colorIndex: 1 },
      { x: width - padding, y: height - padding, label: "P3", colorIndex: 2 },
      { x: padding, y: height - padding, label: "P4", colorIndex: 3 },
    ];

    for (const corner of corners) {
      const playerColor = PLAYER_COLORS[corner.colorIndex].primary;
      context.fillStyle = playerColor;
      context.beginPath();
      context.arc(corner.x, corner.y, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#000000";
      context.font = "bold 10px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(corner.label, corner.x, corner.y);
    }
  }

  function drawClassicRotationPreview(): void {
    const width = getCanvasWidth();
    const height = getCanvasHeight();
    context.clearRect(0, 0, width, height);
    drawGrid();

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.34;

    context.strokeStyle = "rgba(0, 240, 255, 0.5)";
    context.lineWidth = Math.max(1.4, width * 0.008);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "rgba(255, 255, 255, 0.85)";
    context.font =
      "700 " +
      Math.max(22, Math.round(height * 0.34)).toString() +
      "px Orbitron, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("?", cx, cy);

    context.fillStyle = "rgba(0, 240, 255, 0.85)";
    context.font =
      "600 " +
      Math.max(8, Math.round(height * 0.09)).toString() +
      "px Orbitron, sans-serif";
    context.fillText("ROTATES", cx, cy + radius + Math.max(10, height * 0.08));
  }

  function drawMap(): void {
    if (mapId === 0) {
      drawClassicRotationPreview();
      return;
    }

    const map = getMapDefinition(mapId);
    context.clearRect(0, 0, getCanvasWidth(), getCanvasHeight());
    drawGrid();
    drawRepulsionZones(map.repulsionZones);
    drawCenterHoles(map.centerHoles);
    drawOverlayAsset();
    drawYellowBlocks(map.yellowBlocks);
    drawAsteroidConfig(map.asteroidConfig);
    drawTurret(map.hasTurret);
    drawSpawnPoints();
  }

  drawMap();
}

export interface MapPreviewUI {
  updateMapPreview: (mapId?: MapId) => void;
}

export function createMapPreviewUI(game: Game): MapPreviewUI {
  const canvas = elements.mapPreviewCanvas;

  function updateMapPreview(mapId?: MapId): void {
    const currentMapId = mapId ?? game.getMapId();
    renderMapPreviewOnCanvas(canvas, currentMapId);
  }

  window.addEventListener("resize", () => {
    updateMapPreview();
  });

  updateMapPreview();
  return { updateMapPreview };
}
