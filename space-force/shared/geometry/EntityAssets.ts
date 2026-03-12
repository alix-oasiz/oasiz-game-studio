import {
  GENERATED_ENTITY_SVG_DATA,
  type GeneratedEntityHardpointsMeta,
  type GeneratedEntityRenderMeta,
  type GeneratedEntityTrailMeta,
  type GeneratedEntitySvgData,
  type ShapePoint,
} from "./generated/EntitySvgData.js";

export type EntityAssetId = (typeof GENERATED_ENTITY_SVG_DATA)[number]["id"];

export interface EntityAssetDefinition {
  id: EntityAssetId;
  svgTemplate: string;
  colliderPath: string;
  colliderVertices: ReadonlyArray<ShapePoint>;
  centerOfGravityLocal: Readonly<ShapePoint>;
  renderMeta?: Readonly<EntityRenderMeta>;
  viewBox: Readonly<{
    minX: number;
    minY: number;
    width: number;
    height: number;
  }>;
  renderSize: Readonly<{ width: number; height: number }>;
  renderScale: number;
  physicsScale: number;
  slotDefaults: Readonly<Record<string, string>>;
}

export interface EntityTrailMeta {
  anchor: Readonly<ShapePoint>;
  maxAgeSec: number;
  startRadius: number;
  endRadius: number;
  alpha: number;
  blur: number;
  sampleIntervalSec: number;
  minSampleDistance: number;
}

export interface EntityHardpointsMeta {
  muzzle?: Readonly<ShapePoint>;
  trail?: Readonly<ShapePoint>;
  joustLeft?: Readonly<ShapePoint>;
  joustRight?: Readonly<ShapePoint>;
  shieldRadii?: Readonly<ShapePoint>;
  pilotDash?: Readonly<ShapePoint>;
  pilotArmLeft?: Readonly<ShapePoint>;
  pilotArmRight?: Readonly<ShapePoint>;
}

export interface EntityRenderMeta {
  trail?: Readonly<EntityTrailMeta>;
  hardpoints?: Readonly<EntityHardpointsMeta>;
}

function scaleVertices(
  vertices: ReadonlyArray<ShapePoint>,
  scale: number,
): ReadonlyArray<ShapePoint> {
  if (scale === 1) {
    return Object.freeze(vertices.map((point) => ({ x: point.x, y: point.y })));
  }

  return Object.freeze(
    vertices.map((point) => ({
      x: point.x * scale,
      y: point.y * scale,
    })),
  );
}

function scalePoint(point: ShapePoint, scale: number): Readonly<ShapePoint> {
  if (scale === 1) {
    return Object.freeze({ x: point.x, y: point.y });
  }
  return Object.freeze({
    x: point.x * scale,
    y: point.y * scale,
  });
}

function scaleTrailMeta(
  trail: GeneratedEntityTrailMeta,
  renderScale: number,
): Readonly<EntityTrailMeta> {
  return Object.freeze({
    anchor: scalePoint(trail.anchor, renderScale),
    maxAgeSec: trail.maxAgeSec,
    startRadius: trail.startRadius * renderScale,
    endRadius: trail.endRadius * renderScale,
    alpha: trail.alpha,
    blur: trail.blur,
    sampleIntervalSec: trail.sampleIntervalSec,
    minSampleDistance: trail.minSampleDistance * renderScale,
  });
}

function scaleHardpointsMeta(
  hardpoints: GeneratedEntityHardpointsMeta,
  renderScale: number,
): Readonly<EntityHardpointsMeta> {
  const out: EntityHardpointsMeta = {};
  if (hardpoints.muzzle) {
    out.muzzle = scalePoint(hardpoints.muzzle, renderScale);
  }
  if (hardpoints.trail) {
    out.trail = scalePoint(hardpoints.trail, renderScale);
  }
  if (hardpoints.joustLeft) {
    out.joustLeft = scalePoint(hardpoints.joustLeft, renderScale);
  }
  if (hardpoints.joustRight) {
    out.joustRight = scalePoint(hardpoints.joustRight, renderScale);
  }
  if (hardpoints.shieldRadii) {
    out.shieldRadii = scalePoint(hardpoints.shieldRadii, renderScale);
  }
  if (hardpoints.pilotDash) {
    out.pilotDash = scalePoint(hardpoints.pilotDash, renderScale);
  }
  if (hardpoints.pilotArmLeft) {
    out.pilotArmLeft = scalePoint(hardpoints.pilotArmLeft, renderScale);
  }
  if (hardpoints.pilotArmRight) {
    out.pilotArmRight = scalePoint(hardpoints.pilotArmRight, renderScale);
  }
  return Object.freeze(out);
}

function scaleRenderMeta(
  renderMeta: GeneratedEntityRenderMeta | undefined,
  renderScale: number,
): Readonly<EntityRenderMeta> | undefined {
  if (!renderMeta) return undefined;
  const out: EntityRenderMeta = {};
  if (renderMeta.trail) {
    out.trail = scaleTrailMeta(renderMeta.trail, renderScale);
  }
  if (renderMeta.hardpoints) {
    out.hardpoints = scaleHardpointsMeta(renderMeta.hardpoints, renderScale);
  }
  return Object.freeze(out);
}

function buildDefinition(raw: GeneratedEntitySvgData): EntityAssetDefinition {
  const renderWidth = raw.viewBox.width * raw.renderScale;
  const renderHeight = raw.viewBox.height * raw.renderScale;

  return {
    id: raw.id as EntityAssetId,
    svgTemplate: raw.svgTemplate,
    colliderPath: raw.colliderPath,
    colliderVertices: scaleVertices(raw.colliderVertices, raw.physicsScale),
    centerOfGravityLocal: scalePoint(raw.centerOfGravityLocal, raw.physicsScale),
    renderMeta: scaleRenderMeta(raw.renderMeta, raw.renderScale),
    viewBox: Object.freeze({
      minX: raw.viewBox.minX,
      minY: raw.viewBox.minY,
      width: raw.viewBox.width,
      height: raw.viewBox.height,
    }),
    renderSize: Object.freeze({
      width: renderWidth,
      height: renderHeight,
    }),
    renderScale: raw.renderScale,
    physicsScale: raw.physicsScale,
    slotDefaults: Object.freeze({ ...raw.slotDefaults }),
  };
}

const entries = GENERATED_ENTITY_SVG_DATA.map((raw) => [raw.id, buildDefinition(raw)] as const);

export const ENTITY_ASSETS: Readonly<Record<EntityAssetId, EntityAssetDefinition>> =
  Object.freeze(Object.fromEntries(entries)) as Readonly<
    Record<EntityAssetId, EntityAssetDefinition>
  >;

export function getEntityAsset(id: EntityAssetId): EntityAssetDefinition {
  const entity = ENTITY_ASSETS[id];
  if (!entity) {
    throw new Error(`[EntityAssets] Unknown entity asset id: ${id}`);
  }
  return entity;
}

export function applySvgColorSlots(
  svgTemplate: string,
  slots: Readonly<Record<string, string>>,
): string {
  const styleVars = Object.entries(slots)
    .map(([key, value]) => `--${key}: ${value};`)
    .join(" ");

  return svgTemplate.replace(
    /<svg\b([^>]*)>/i,
    (fullMatch: string, attrs: string) => {
      const styleMatch = attrs.match(/style=(["'])(.*?)\1/i);
      if (!styleMatch) {
        return `<svg${attrs} style="${styleVars}">`;
      }
      const quote = styleMatch[1];
      const existing = styleMatch[2].trim();
      const mergedStyle =
        existing.length > 0 ? `${existing}; ${styleVars}` : styleVars;
      return fullMatch.replace(styleMatch[0], `style=${quote}${mergedStyle}${quote}`);
    },
  );
}
