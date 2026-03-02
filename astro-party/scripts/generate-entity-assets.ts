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

interface EntityHardpointsMeta {
  muzzle?: ShapePoint;
  trail?: ShapePoint;
  joustLeft?: ShapePoint;
  joustRight?: ShapePoint;
  shieldRadii?: ShapePoint;
  pilotDash?: ShapePoint;
  pilotArmLeft?: ShapePoint;
  pilotArmRight?: ShapePoint;
}

interface EntityRenderMeta {
  trail?: EntityTrailMeta;
  hardpoints?: EntityHardpointsMeta;
}

const HARDPOINT_GUIDE_GROUP_ID = "editor-hardpoints";
const HARDPOINT_GUIDE_IDS = Object.freeze({
  muzzle: "hardpoint-muzzle",
  trail: "hardpoint-trail",
  joustLeft: "hardpoint-joust-left",
  joustRight: "hardpoint-joust-right",
  shield: "hardpoint-shield",
  pilotDash: "hardpoint-pilot-dash",
  pilotArmLeft: "hardpoint-pilot-arm-left",
  pilotArmRight: "hardpoint-pilot-arm-right",
});

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

function parsePointRecord(
  value: unknown,
  fieldPath: string,
  fileName: string,
): ShapePoint {
  if (!value || typeof value !== "object") {
    throw new Error(
      `[generate-entity-assets] Invalid ${fieldPath} in ${fileName}: expected object`,
    );
  }
  const record = value as Record<string, unknown>;
  return {
    x: parseFiniteNumber(record.x, `${fieldPath}.x`, fileName),
    y: parseFiniteNumber(record.y, `${fieldPath}.y`, fileName),
  };
}

function parseHardpointsRecord(
  value: unknown,
  fieldPath: string,
  fileName: string,
): EntityHardpointsMeta {
  if (!value || typeof value !== "object") {
    throw new Error(
      `[generate-entity-assets] Invalid ${fieldPath} in ${fileName}: expected object`,
    );
  }
  const record = value as Record<string, unknown>;
  const out: EntityHardpointsMeta = {};

  if (record.muzzle !== undefined) {
    out.muzzle = parsePointRecord(record.muzzle, `${fieldPath}.muzzle`, fileName);
  }
  if (record.trail !== undefined) {
    out.trail = parsePointRecord(record.trail, `${fieldPath}.trail`, fileName);
  }
  if (record.joustLeft !== undefined) {
    out.joustLeft = parsePointRecord(
      record.joustLeft,
      `${fieldPath}.joustLeft`,
      fileName,
    );
  }
  if (record.joustRight !== undefined) {
    out.joustRight = parsePointRecord(
      record.joustRight,
      `${fieldPath}.joustRight`,
      fileName,
    );
  }
  if (record.shieldRadii !== undefined) {
    out.shieldRadii = parsePointRecord(
      record.shieldRadii,
      `${fieldPath}.shieldRadii`,
      fileName,
    );
  }
  if (record.pilotDash !== undefined) {
    out.pilotDash = parsePointRecord(
      record.pilotDash,
      `${fieldPath}.pilotDash`,
      fileName,
    );
  }
  if (record.pilotArmLeft !== undefined) {
    out.pilotArmLeft = parsePointRecord(
      record.pilotArmLeft,
      `${fieldPath}.pilotArmLeft`,
      fileName,
    );
  }
  if (record.pilotArmRight !== undefined) {
    out.pilotArmRight = parsePointRecord(
      record.pilotArmRight,
      `${fieldPath}.pilotArmRight`,
      fileName,
    );
  }

  return out;
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
  const out: EntityRenderMeta = {};

  const trailRaw = parsedRecord.trail;
  if (trailRaw !== undefined) {
    if (!trailRaw || typeof trailRaw !== "object") {
      throw new Error(`[generate-entity-assets] trail must be an object in ${fileName}`);
    }
    const trailRecord = trailRaw as Record<string, unknown>;
    const anchor = parsePointRecord(trailRecord.anchor, "trail.anchor", fileName);
    const trail: EntityTrailMeta = {
      anchor,
      maxAgeSec: parseFiniteNumber(trailRecord.maxAgeSec, "trail.maxAgeSec", fileName),
      startRadius: parseFiniteNumber(
        trailRecord.startRadius,
        "trail.startRadius",
        fileName,
      ),
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
    out.trail = trail;
  }

  const hardpointsRaw = parsedRecord.hardpoints;
  if (hardpointsRaw !== undefined) {
    out.hardpoints = parseHardpointsRecord(hardpointsRaw, "hardpoints", fileName);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function parseFiniteAttributeNumber(
  attrs: Record<string, string>,
  attrName: string,
  fieldPath: string,
  fileName: string,
): number {
  const raw = attrs[attrName];
  if (typeof raw !== "string" || raw.trim().length <= 0) {
    throw new Error(
      `[generate-entity-assets] Missing ${fieldPath} in ${fileName}: expected ${attrName}`,
    );
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `[generate-entity-assets] Invalid ${fieldPath} in ${fileName}: expected finite number`,
    );
  }
  return value;
}

function extractHardpointsFromGuideGroup(
  groupMarkup: string,
  fileName: string,
): EntityHardpointsMeta | undefined {
  const out: EntityHardpointsMeta = {};
  const tagRegex = /<(circle|ellipse)\b[^>]*>/gi;
  let match: RegExpExecArray | null = tagRegex.exec(groupMarkup);

  while (match) {
    const attrs = parseAttributes(match[0]);
    const tagName = match[1].toLowerCase();
    const id = attrs.id;
    if (!id) {
      match = tagRegex.exec(groupMarkup);
      continue;
    }

    if (id === HARDPOINT_GUIDE_IDS.muzzle) {
      out.muzzle = {
        x: parseFiniteAttributeNumber(attrs, "cx", "hardpoint-muzzle.x", fileName),
        y: parseFiniteAttributeNumber(attrs, "cy", "hardpoint-muzzle.y", fileName),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.trail) {
      out.trail = {
        x: parseFiniteAttributeNumber(attrs, "cx", "hardpoint-trail.x", fileName),
        y: parseFiniteAttributeNumber(attrs, "cy", "hardpoint-trail.y", fileName),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.joustLeft) {
      out.joustLeft = {
        x: parseFiniteAttributeNumber(attrs, "cx", "hardpoint-joust-left.x", fileName),
        y: parseFiniteAttributeNumber(attrs, "cy", "hardpoint-joust-left.y", fileName),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.joustRight) {
      out.joustRight = {
        x: parseFiniteAttributeNumber(attrs, "cx", "hardpoint-joust-right.x", fileName),
        y: parseFiniteAttributeNumber(attrs, "cy", "hardpoint-joust-right.y", fileName),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.shield) {
      if (tagName !== "ellipse") {
        throw new Error(
          `[generate-entity-assets] hardpoint-shield must be an ellipse in ${fileName}`,
        );
      }
      out.shieldRadii = {
        x: parseFiniteAttributeNumber(attrs, "rx", "hardpoint-shield.rx", fileName),
        y: parseFiniteAttributeNumber(attrs, "ry", "hardpoint-shield.ry", fileName),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.pilotDash) {
      out.pilotDash = {
        x: parseFiniteAttributeNumber(
          attrs,
          "cx",
          "hardpoint-pilot-dash.x",
          fileName,
        ),
        y: parseFiniteAttributeNumber(
          attrs,
          "cy",
          "hardpoint-pilot-dash.y",
          fileName,
        ),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.pilotArmLeft) {
      out.pilotArmLeft = {
        x: parseFiniteAttributeNumber(
          attrs,
          "cx",
          "hardpoint-pilot-arm-left.x",
          fileName,
        ),
        y: parseFiniteAttributeNumber(
          attrs,
          "cy",
          "hardpoint-pilot-arm-left.y",
          fileName,
        ),
      };
    } else if (id === HARDPOINT_GUIDE_IDS.pilotArmRight) {
      out.pilotArmRight = {
        x: parseFiniteAttributeNumber(
          attrs,
          "cx",
          "hardpoint-pilot-arm-right.x",
          fileName,
        ),
        y: parseFiniteAttributeNumber(
          attrs,
          "cy",
          "hardpoint-pilot-arm-right.y",
          fileName,
        ),
      };
    }

    match = tagRegex.exec(groupMarkup);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function stripHardpointGuideLayer(
  svg: string,
  fileName: string,
): { cleanSvg: string; hardpoints?: EntityHardpointsMeta } {
  const groupRegex = new RegExp(
    `<g\\b[^>]*\\bid=(["'])${HARDPOINT_GUIDE_GROUP_ID}\\1[^>]*>[\\s\\S]*?<\\/g>`,
    "i",
  );
  const groupMatch = svg.match(groupRegex);
  if (!groupMatch) {
    return { cleanSvg: svg };
  }

  const hardpoints = extractHardpointsFromGuideGroup(groupMatch[0], fileName);
  const cleanSvg = svg
    .replace(groupMatch[0], "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanSvg, hardpoints };
}

function mergeRenderMetaHardpoints(
  renderMeta: EntityRenderMeta | undefined,
  hardpoints: EntityHardpointsMeta | undefined,
): EntityRenderMeta | undefined {
  if (!hardpoints) {
    return renderMeta;
  }

  const existing = renderMeta?.hardpoints;
  const mergedHardpoints: EntityHardpointsMeta = {
    ...(existing ?? {}),
    ...hardpoints,
  };

  return {
    ...(renderMeta ?? {}),
    hardpoints: mergedHardpoints,
  };
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const entitiesDir = join(projectRoot, "shared", "assets", "entities");
  const manifestPath = join(projectRoot, "shared", "assets", "entities", "manifest.json");
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
    const sourceSvg = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
    const { cleanSvg, hardpoints } = stripHardpointGuideLayer(sourceSvg, entry.file);
    const svg = cleanSvg;
    const viewBox = parseViewBox(svg, entry.file);
    const colliderPath = extractPathById(svg, entry.colliderPathId, entry.file);
    const colliderVertices = parseSimplePathVertices(colliderPath, entityId);
    const centerOfGravityLocal = deriveCenterOfGravity(colliderVertices);
    const renderMeta = mergeRenderMetaHardpoints(
      parseRenderMeta(svg, entry.file),
      hardpoints,
    );

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
    "// Source: shared/assets/entities/*.svg + shared/assets/entities/manifest.json\n" +
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
    "export interface GeneratedEntityHardpointsMeta {\n" +
    "  muzzle?: ShapePoint;\n" +
    "  trail?: ShapePoint;\n" +
    "  joustLeft?: ShapePoint;\n" +
    "  joustRight?: ShapePoint;\n" +
    "  shieldRadii?: ShapePoint;\n" +
    "  pilotDash?: ShapePoint;\n" +
    "  pilotArmLeft?: ShapePoint;\n" +
    "  pilotArmRight?: ShapePoint;\n" +
    "}\n\n" +
    "export interface GeneratedEntityRenderMeta {\n" +
    "  trail?: GeneratedEntityTrailMeta;\n" +
    "  hardpoints?: GeneratedEntityHardpointsMeta;\n" +
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
