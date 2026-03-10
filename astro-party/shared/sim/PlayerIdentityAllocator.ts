type BotType = "ai" | "local";

interface AllocationResult {
  colorIndex: number;
  displayName: string;
}

export class PlayerIdentityAllocator {
  private readonly maxColorCount: number;

  private colorUsed = new Set<number>();
  private colorByPlayerId = new Map<string, number>();

  private humanIndexUsed = new Set<number>();
  private humanIndexByPlayerId = new Map<string, number>();

  private aiIndexUsed = new Set<number>();
  private localIndexUsed = new Set<number>();
  private botIndexByPlayerId = new Map<string, { type: BotType; index: number }>();

  constructor(maxColorCount: number) {
    this.maxColorCount = Math.max(1, Math.floor(maxColorCount));
  }

  allocateHuman(playerId: string, customName: string | null): AllocationResult {
    const preferredIndex = this.extractIndexedName(customName, "Player");
    const humanIndex = this.reserveHumanIndex(playerId, preferredIndex);
    const colorIndex = this.reserveColorIndex(playerId);
    return {
      colorIndex,
      displayName: customName ?? "Player " + humanIndex.toString(),
    };
  }

  allocateBot(
    playerId: string,
    type: BotType,
    customName: string | null = null,
  ): AllocationResult {
    const prefix = type === "local" ? "Player" : "Bot";
    const preferredIndex = this.extractIndexedName(customName, prefix);
    const botIndex = this.reserveBotIndex(playerId, type, preferredIndex);
    const colorIndex = this.reserveColorIndex(playerId);
    return {
      colorIndex,
      displayName: customName ?? prefix + " " + botIndex.toString(),
    };
  }

  releasePlayer(playerId: string): void {
    this.releaseColorIndex(playerId);
    this.releaseHumanIndex(playerId);
    this.releaseBotIndex(playerId);
  }

  private reserveColorIndex(playerId: string): number {
    const existing = this.colorByPlayerId.get(playerId);
    if (existing !== undefined) return existing;

    let selected = -1;
    for (let i = 0; i < this.maxColorCount; i += 1) {
      if (!this.colorUsed.has(i)) {
        selected = i;
        break;
      }
    }
    if (selected < 0) selected = 0;

    this.colorUsed.add(selected);
    this.colorByPlayerId.set(playerId, selected);
    return selected;
  }

  private releaseColorIndex(playerId: string): void {
    const index = this.colorByPlayerId.get(playerId);
    if (index === undefined) return;
    this.colorByPlayerId.delete(playerId);
    this.colorUsed.delete(index);
  }

  private reserveHumanIndex(playerId: string, preferred?: number): number {
    const existing = this.humanIndexByPlayerId.get(playerId);
    if (existing !== undefined) return existing;

    const next = this.pickReusableIndex(this.humanIndexUsed, preferred);
    this.humanIndexUsed.add(next);
    this.humanIndexByPlayerId.set(playerId, next);
    return next;
  }

  private releaseHumanIndex(playerId: string): void {
    const index = this.humanIndexByPlayerId.get(playerId);
    if (index === undefined) return;
    this.humanIndexByPlayerId.delete(playerId);
    this.humanIndexUsed.delete(index);
  }

  private reserveBotIndex(
    playerId: string,
    type: BotType,
    preferred?: number,
  ): number {
    const existing = this.botIndexByPlayerId.get(playerId);
    if (existing) return existing.index;

    const used = type === "local" ? this.localIndexUsed : this.aiIndexUsed;
    const next = this.pickReusableIndex(used, preferred);
    used.add(next);
    this.botIndexByPlayerId.set(playerId, { type, index: next });
    return next;
  }

  private releaseBotIndex(playerId: string): void {
    const entry = this.botIndexByPlayerId.get(playerId);
    if (!entry) return;
    this.botIndexByPlayerId.delete(playerId);
    const used = entry.type === "local" ? this.localIndexUsed : this.aiIndexUsed;
    used.delete(entry.index);
  }

  private pickReusableIndex(used: Set<number>, preferred?: number): number {
    if (
      Number.isFinite(preferred) &&
      (preferred as number) > 0 &&
      !used.has(preferred as number)
    ) {
      return preferred as number;
    }
    let next = 1;
    while (used.has(next)) next += 1;
    return next;
  }

  private extractIndexedName(value: string | null, prefix: string): number | undefined {
    if (!value) return undefined;
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = value.match(new RegExp("^" + escapedPrefix + "\\s+(\\d+)$", "i"));
    if (!match) return undefined;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
