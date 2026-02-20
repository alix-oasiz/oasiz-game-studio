import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface ManifestEntity {
  file: string;
  colliderPathId: string;
  renderScale?: number;
  physicsScale?: number;
  slotDefaults?: Record<string, string>;
}

type Manifest = Record<string, ManifestEntity>;

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface ShapePoint {
  x: number;
  y: number;
}

interface EntityTrailMeta {
  anchor: ShapePoint;
  maxAgeSec: number;
  startRadius: number;
  endRadius: number;
  alpha: number;
  blur: number;
  sampleIntervalSec: number;
  minSampleDistance: number;
}

interface EntityRenderMeta {
  trail?: EntityTrailMeta;
}

function deriveCenterOfGravity(vertices: ReadonlyArray<ShapePoint>): ShapePoint {
  // Use the collider path's first vertex as the nose reference. This lets SVG edits
  // move the pivot without touching simulation code.
  const noseVertex = vertices[0];
  if (!noseVertex) {
    throw new Error("[generate-entity-assets] Could not derive center of gravity");
  }
  return {
    x: noseVertex.x,
    y: noseVertex.y,
  };
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = regex.exec(tag);

  while (match) {
    attrs[match[1]] = match[3] ?? match[4] ?? "";
    match = regex.exec(tag);
  }

  return attrs;
}

function parseViewBox(svg: string, fileName: string): ViewBox {
  const svgTagMatch = svg.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    throw new Error(`[generate-entity-assets] Missing <svg> tag in ${fileName}`);
  }

  const attrs = parseAttributes(svgTagMatch[0]);
  const rawViewBox = attrs.viewBox;
  if (!rawViewBox) {
    throw new Error(`[generate-entity-assets] Missing viewBox in ${fileName}`);
  }

  const parts = rawViewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number.parseFloat(value));

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`[generate-entity-assets] Invalid viewBox in ${fileName}: ${rawViewBox}`);
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function extractPathById(svg: string, pathId: string, fileName: string): string {
  const pathRegex = /<path\b[^>]*>/gi;
  let match: RegExpExecArray | null = pathRegex.exec(svg);

  while (match) {
    const tag = match[0];
    const attrs = parseAttributes(tag);
    if (attrs.id === pathId) {
      if (!attrs.d || attrs.d.trim().length === 0) {
        throw new Error(
          `[generate-entity-assets] Path #${pathId} has no d attribute in ${fileName}`,
        );
      }
      return attrs.d.trim();
    }
    match = pathRegex.exec(svg);
  }

  throw new Error(`[generate-entity-assets] Missing path #${pathId} in ${fileName}`);
}

function parseSimplePathVertices(path: string, entityId: string): ShapePoint[] {
  const tokens = path
    .replace(/,/g, " ")
    .trim()
    .match(/[MLZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);

  if (!tokens || tokens.length === 0) {
    throw new Error(`[generate-entity-assets] ${entityId}: empty collider path`);
  }

  const vertices: ShapePoint[] = [];
  let command: string | null = null;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    const isCommand = /^[MLZ]$/i.test(token);

    if (isCommand) {
      command = token.toUpperCase();
      index += 1;
      if (command === "Z") {
        break;
      }
      continue;
    }

    if (!command || (command !== "M" && command !== "L")) {
      throw new Error(
        `[generate-entity-assets] ${entityId}: collider path must use M/L/Z commands`,
      );
    }

    const x = Number.parseFloat(tokens[index]);
    const y = Number.parseFloat(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`[generate-entity-assets] ${entityId}: malformed coordinate pair`);
    }

    vertices.push({ x, y });
    index += 2;

    if (command === "M") {
      command = "L";
    }
  }

  if (vertices.length < 3) {
    throw new Error(`[generate-entity-assets] ${entityId}: needs at least 3 collider vertices`);
  }

  return vertices;
}

function parseFiniteNumber(
  value: unknown,
  fieldPath: string,
  fileName: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `[generate-entity-assets] Invalid ${fieldPath} in ${fileName}: expected finite number`,
    );
  }
  return value;
}

function parseRenderMeta(svg: string, fileName: string): EntityRenderMeta | undefined {
  const metadataMatch = svg.match(
    /<metadata\b[^>]*\bid=(["'])render-meta\1[^>]*>([\s\S]*?)<\/metadata>/i,
  );
  if (!metadataMatch) return undefined;

  const rawJson = metadataMatch[2].trim();
  if (rawJson.length <= 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `[generate-entity-assets] Invalid render-meta JSON in ${fileName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`[generate-entity-assets] render-meta must be an object in ${fileName}`);
  }

  const parsedRecord = parsed as Record<string, unknown>;
  const trailRaw = parsedRecord.trail;
  if (!trailRaw || typeof trailRaw !== "object") {
    return undefined;
  }

  const trailRecord = trailRaw as Record<string, unknown>;
  const anchorRaw = trailRecord.anchor;
  if (!anchorRaw || typeof anchorRaw !== "object") {
    throw new Error(`[generate-entity-assets] trail.anchor missing in ${fileName}`);
  }

  const anchorRecord = anchorRaw as Record<string, unknown>;
  const trail: EntityTrailMeta = {
    anchor: {
      x: parseFiniteNumber(anchorRecord.x, "trail.anchor.x", fileName),
      y: parseFiniteNumber(anchorRecord.y, "trail.anchor.y", fileName),
    },
    maxAgeSec: parseFiniteNumber(trailRecord.maxAgeSec, "trail.maxAgeSec", fileName),
    startRadius: parseFiniteNumber(trailRecord.startRadius, "trail.startRadius", fileName),
    endRadius: parseFiniteNumber(trailRecord.endRadius, "trail.endRadius", fileName),
    alpha: parseFiniteNumber(trailRecord.alpha, "trail.alpha", fileName),
    blur: parseFiniteNumber(trailRecord.blur, "trail.blur", fileName),
    sampleIntervalSec: parseFiniteNumber(
      trailRecord.sampleIntervalSec,
      "trail.sampleIntervalSec",
      fileName,
    ),
    minSampleDistance: parseFiniteNumber(
      trailRecord.minSampleDistance,
      "trail.minSampleDistance",
      fileName,
    ),
  };

  if (trail.maxAgeSec <= 0) {
    throw new Error(`[generate-entity-assets] trail.maxAgeSec must be > 0 in ${fileName}`);
  }
  if (trail.startRadius <= 0 || trail.endRadius < 0) {
    throw new Error(
      `[generate-entity-assets] trail radii must be non-negative (start > 0) in ${fileName}`,
    );
  }
  if (trail.alpha < 0 || trail.alpha > 1) {
    throw new Error(`[generate-entity-assets] trail.alpha must be in [0, 1] in ${fileName}`);
  }
  if (trail.blur < 0) {
    throw new Error(`[generate-entity-assets] trail.blur must be >= 0 in ${fileName}`);
  }
  if (trail.sampleIntervalSec <= 0) {
    throw new Error(
      `[generate-entity-assets] trail.sampleIntervalSec must be > 0 in ${fileName}`,
    );
  }
  if (trail.minSampleDistance < 0) {
    throw new Error(
      `[generate-entity-assets] trail.minSampleDistance must be >= 0 in ${fileName}`,
    );
  }

  return { trail };
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const entitiesDir = join(projectRoot, "shared", "assets", "entities");
  const manifestPath = join(projectRoot, "shared", "geometry", "entityAssets.manifest.json");
  const outPath = join(projectRoot, "shared", "geometry", "generated", "EntitySvgData.ts");

  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as Manifest;

  const entityIds = Object.keys(manifest);
  if (entityIds.length === 0) {
    throw new Error("[generate-entity-assets] manifest has no entities");
  }

  const outEntries: Array<Record<string, unknown>> = [];
  for (const entityId of entityIds) {
    const entry = manifest[entityId];
    const filePath = join(entitiesDir, entry.file);
    const svg = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
    const viewBox = parseViewBox(svg, entry.file);
    const colliderPath = extractPathById(svg, entry.colliderPathId, entry.file);
    const colliderVertices = parseSimplePathVertices(colliderPath, entityId);
    const centerOfGravityLocal = deriveCenterOfGravity(colliderVertices);
    const renderMeta = parseRenderMeta(svg, entry.file);

    outEntries.push({
      id: entityId,
      svgTemplate: svg,
      viewBox,
      colliderPathId: entry.colliderPathId,
      colliderPath,
      colliderVertices,
      centerOfGravityLocal,
      renderMeta,
      renderScale: entry.renderScale ?? 1,
      physicsScale: entry.physicsScale ?? 1,
      slotDefaults: entry.slotDefaults ?? {},
    });
  }

  const header =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    "// Source: shared/assets/entities/*.svg + shared/geometry/entityAssets.manifest.json\n" +
    "// Run: bun run generate:entities\n\n";

  const body =
    "export interface ShapePoint {\n" +
    "  x: number;\n" +
    "  y: number;\n" +
    "}\n\n" +
    "export interface GeneratedEntityTrailMeta {\n" +
    "  anchor: ShapePoint;\n" +
    "  maxAgeSec: number;\n" +
    "  startRadius: number;\n" +
    "  endRadius: number;\n" +
    "  alpha: number;\n" +
    "  blur: number;\n" +
    "  sampleIntervalSec: number;\n" +
    "  minSampleDistance: number;\n" +
    "}\n\n" +
    "export interface GeneratedEntityRenderMeta {\n" +
    "  trail?: GeneratedEntityTrailMeta;\n" +
    "}\n\n" +
    "export interface GeneratedEntitySvgData {\n" +
    "  id: string;\n" +
    "  svgTemplate: string;\n" +
    "  viewBox: { minX: number; minY: number; width: number; height: number };\n" +
    "  colliderPathId: string;\n" +
    "  colliderPath: string;\n" +
    "  colliderVertices: ReadonlyArray<ShapePoint>;\n" +
    "  centerOfGravityLocal: ShapePoint;\n" +
    "  renderMeta?: GeneratedEntityRenderMeta;\n" +
    "  renderScale: number;\n" +
    "  physicsScale: number;\n" +
    "  slotDefaults: Readonly<Record<string, string>>;\n" +
    "}\n\n" +
    `export const GENERATED_ENTITY_SVG_DATA = ${JSON.stringify(outEntries, null, 2)} as const;\n`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, header + body, "utf8");
  console.log(`[generate-entity-assets] Wrote ${outPath}`);
}

main();
