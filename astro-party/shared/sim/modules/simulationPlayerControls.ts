import type { Hooks, RuntimePlayer } from "../types.js";

export interface PlayerControlsContext {
  players: Map<string, RuntimePlayer>;
  humanBySession: Map<string, string>;
  leaderPlayerId: string | null;
  hooks: Pick<Hooks, "onError">;
}

export function sanitizePlayerName(raw?: string): string | null {
  if (!raw) return null;
  const out = raw.trim().slice(0, 20);
  return out.length > 0 ? out : null;
}

export function getHumanBySession(
  ctx: PlayerControlsContext,
  sessionId: string,
): RuntimePlayer | null {
  const playerId = ctx.humanBySession.get(sessionId);
  if (!playerId) return null;
  return ctx.players.get(playerId) ?? null;
}

export function ensureRoomLeader(
  ctx: PlayerControlsContext,
  sessionId: string,
): boolean {
  const player = getHumanBySession(ctx, sessionId);
  if (!player) return false;
  if (ctx.leaderPlayerId !== player.id) {
    ctx.hooks.onError(sessionId, "LEADER_ONLY", "Only room leader can do this");
    return false;
  }
  return true;
}

export function resolveControlledPlayerFromSession(
  ctx: PlayerControlsContext,
  sessionId: string,
  controlledPlayerId?: string,
): RuntimePlayer | null {
  const human = getHumanBySession(ctx, sessionId);
  if (!human) return null;

  if (!controlledPlayerId || controlledPlayerId === human.id) {
    return human;
  }

  const target = ctx.players.get(controlledPlayerId);
  if (!target) {
    ctx.hooks.onError(sessionId, "NOT_FOUND", "Controlled player not found");
    return null;
  }

  if (target.botType !== "local" || target.sessionId !== sessionId) {
    ctx.hooks.onError(
      sessionId,
      "LOCAL_PLAYER_UNSUPPORTED",
      "Controlled player is not available for this session",
    );
    return null;
  }

  return target;
}

export function resolveLocalKeySlotForSession(
  ctx: PlayerControlsContext,
  sessionId: string,
  keySlot?: number,
): number {
  const preferred = Number.isInteger(keySlot) && (keySlot as number) > 0
    ? (keySlot as number)
    : undefined;

  if (preferred !== undefined) {
    const inUse = [...ctx.players.values()].some(
      (player) =>
        player.botType === "local" &&
        player.sessionId === sessionId &&
        player.keySlot === preferred,
    );
    if (inUse) {
      ctx.hooks.onError(sessionId, "KEY_SLOT_IN_USE", "Key slot already in use");
      return -1;
    }
    return preferred;
  }

  for (let slot = 1; slot <= 6; slot += 1) {
    const inUse = [...ctx.players.values()].some(
      (player) =>
        player.botType === "local" &&
        player.sessionId === sessionId &&
        player.keySlot === slot,
    );
    if (!inUse) return slot;
  }

  ctx.hooks.onError(sessionId, "KEY_SLOT_IN_USE", "No local key slots available");
  return -1;
}
