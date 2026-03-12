import {
  GENERATED_SHIP_SKIN_SVG_DATA,
  type GeneratedShipSkinSvgData,
} from "./generated/ShipSkinSvgData.js";

export type ShipSkinId = (typeof GENERATED_SHIP_SKIN_SVG_DATA)[number]["id"];

export interface ShipSkinDefinition {
  id: ShipSkinId;
  svgTemplate: string;
  viewBox: Readonly<{
    minX: number;
    minY: number;
    width: number;
    height: number;
  }>;
  renderScale: number;
  renderSize: Readonly<{
    width: number;
    height: number;
  }>;
  slotDefaults: Readonly<Record<string, string>>;
}

function buildDefinition(raw: GeneratedShipSkinSvgData): ShipSkinDefinition {
  return {
    id: raw.id as ShipSkinId,
    svgTemplate: raw.svgTemplate,
    viewBox: Object.freeze({
      minX: raw.viewBox.minX,
      minY: raw.viewBox.minY,
      width: raw.viewBox.width,
      height: raw.viewBox.height,
    }),
    renderScale: raw.renderScale,
    renderSize: Object.freeze({
      width: raw.viewBox.width * raw.renderScale,
      height: raw.viewBox.height * raw.renderScale,
    }),
    slotDefaults: Object.freeze({ ...raw.slotDefaults }),
  };
}

const entries = GENERATED_SHIP_SKIN_SVG_DATA.map((raw) => [raw.id, buildDefinition(raw)] as const);

export const SHIP_SKINS: Readonly<Record<ShipSkinId, ShipSkinDefinition>> = Object.freeze(
  Object.fromEntries(entries),
) as Readonly<Record<ShipSkinId, ShipSkinDefinition>>;

export const SHIP_SKIN_IDS: ReadonlyArray<ShipSkinId> = Object.freeze(
  GENERATED_SHIP_SKIN_SVG_DATA.map((entry) => entry.id as ShipSkinId),
);

export const DEFAULT_SHIP_SKIN_ID: ShipSkinId = SHIP_SKIN_IDS[0];
const playerShipSkinOverrides = new Map<string, ShipSkinId>();

export function isShipSkinId(value: unknown): value is ShipSkinId {
  if (typeof value !== "string") return false;
  return SHIP_SKIN_IDS.includes(value as ShipSkinId);
}

export function getShipSkin(id: ShipSkinId): ShipSkinDefinition {
  const skin = SHIP_SKINS[id];
  if (!skin) {
    throw new Error("[ShipSkins] Unknown ship skin id: " + id);
  }
  return skin;
}

function hashPlayerId(playerId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i += 1) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function setShipSkinOverrideForPlayer(
  playerId: string,
  skinId: ShipSkinId | null,
): void {
  if (!playerId) return;
  if (skinId === null) {
    playerShipSkinOverrides.delete(playerId);
    return;
  }
  playerShipSkinOverrides.set(playerId, skinId);
}

export function getShipSkinOverrideForPlayer(playerId: string): ShipSkinId | null {
  return playerShipSkinOverrides.get(playerId) ?? null;
}

export function resolveShipSkinIdForPlayer(playerId: string): ShipSkinId {
  const override = playerShipSkinOverrides.get(playerId);
  if (override) {
    return override;
  }
  const ids = SHIP_SKIN_IDS;
  if (ids.length <= 0) {
    throw new Error("[ShipSkins] No ship skins configured");
  }
  const index = hashPlayerId(playerId) % ids.length;
  return ids[index];
}
