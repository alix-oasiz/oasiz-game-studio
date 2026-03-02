import { MultiInputManager } from "../systems/input/MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { GamePhase, PlayerData } from "../types";

export class BotManager {
  readonly localPlayerSlots: Map<string, number> = new Map();
  useTouchForHost = false;
  private reservedLocalSlots: Set<number> = new Set();

  constructor(
    private network: NetworkManager,
    private multiInput: MultiInputManager | null,
  ) {}

  isPlayerBot(playerId: string): boolean {
    return this.network.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.network.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.network.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.network.hasRemotePlayers();
  }

  async addAIBot(phase: GamePhase): Promise<boolean> {
    if (phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    const bot = await this.network.addAIBot();
    return bot !== null;
  }

  async addLocalBot(
    keySlot: number,
    phase: GamePhase,
    players: Map<string, PlayerData>,
  ): Promise<boolean> {
    if (!this.network.supportsLocalPlayers()) {
      console.log("[Game] Local players are deferred in this version");
      return false;
    }
    if (phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    if (
      this.getUsedKeySlots(players).includes(keySlot) ||
      this.reservedLocalSlots.has(keySlot)
    ) {
      console.log("[Game] Key slot already in use:", keySlot);
      return false;
    }
    this.reservedLocalSlots.add(keySlot);
    const bot = await this.network.addLocalBot(keySlot);
    if (bot) {
      this.multiInput?.activateSlot(keySlot);
      this.syncLocalPlayerSlots(players);

      return true;
    }
    this.reservedLocalSlots.delete(keySlot);
    return false;
  }

  async removeBot(playerId: string): Promise<boolean> {
    const slot = this.localPlayerSlots.get(playerId);
    if (slot !== undefined) {
      this.multiInput?.deactivateSlot(slot);
      this.localPlayerSlots.delete(playerId);
      this.reservedLocalSlots.delete(slot);
    }

    return this.network.removeBot(playerId);
  }

  getUsedKeySlots(players: Map<string, PlayerData>): number[] {
    this.syncLocalPlayerSlots(players);
    const slots: number[] = [];
    slots.push(0); // Slot 0 (WASD) is always used by the local player

    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        if (slot >= 0) slots.push(slot);
      }
    }
    for (const slot of this.reservedLocalSlots) {
      if (!slots.includes(slot)) {
        slots.push(slot);
      }
    }
    return slots;
  }

  getLocalPlayersInfo(
    players: Map<string, PlayerData>,
  ): Array<{
    id: string;
    name: string;
    color: string;
    keyPreset: string;
    comboMultiplier: number;
    comboExpiresAtMs: number;
  }> {
    this.syncLocalPlayerSlots(players);
    const localPlayers: Array<{
      id: string;
      name: string;
      color: string;
      keyPreset: string;
      comboMultiplier: number;
      comboExpiresAtMs: number;
    }> = [];

    const myId = this.network.getMyPlayerId();
    const myPlayer = myId ? players.get(myId) : null;
    if (myPlayer) {
      localPlayers.push({
        id: myPlayer.id,
        name: myPlayer.name,
        color: myPlayer.color.primary,
        keyPreset: "A rotate | D fire",
        comboMultiplier: myPlayer.comboMultiplier,
        comboExpiresAtMs: myPlayer.comboExpiresAtMs,
      });
    }

    for (const [playerId, player] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        const keyHints = this.getKeyHintForSlot(slot);
        localPlayers.push({
          id: player.id,
          name: player.name,
          color: player.color.primary,
          keyPreset: keyHints,
          comboMultiplier: player.comboMultiplier,
          comboExpiresAtMs: player.comboExpiresAtMs,
        });
      }
    }

    return localPlayers;
  }

  getKeyHintForSlot(slot: number): string {
    switch (slot) {
      case 1:
        return "<- rotate | -> fire";
      case 2:
        return "J rotate | L fire";
      case 3:
        return "Num4 rotate | Num6 fire";
      default:
        return "A rotate | D fire";
    }
  }

  getLocalPlayerCount(players: Map<string, PlayerData>): number {
    this.syncLocalPlayerSlots(players);
    let count = 0;
    const myId = this.network.getMyPlayerId();
    if (myId && players.has(myId)) {
      count += 1;
    }
    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        count += 1;
      }
    }
    return count;
  }

  hasLocalPlayers(players: Map<string, PlayerData>): boolean {
    this.syncLocalPlayerSlots(players);
    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        return true;
      }
    }
    return false;
  }

  private syncLocalPlayerSlots(players: Map<string, PlayerData>): void {
    const activeLocalIds = new Set<string>();
    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType !== "local") continue;
      const slot = this.network.getPlayerKeySlot(playerId);
      if (slot < 0) continue;
      this.localPlayerSlots.set(playerId, slot);
      activeLocalIds.add(playerId);
      this.reservedLocalSlots.delete(slot);
    }

    for (const playerId of this.localPlayerSlots.keys()) {
      if (!activeLocalIds.has(playerId)) {
        this.localPlayerSlots.delete(playerId);
      }
    }
  }

  // ============= TOUCH LAYOUT =============

  updateTouchLayout(orderedPlayers: PlayerData[]): void {
    if (!this.multiInput) return;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    if (!isMobile) {
      this.useTouchForHost = false;
      this.multiInput.destroyTouchZones();
      return;
    }

    const slotToColor = new Map<number, string>();
    const localSlotOrder: number[] = [];
    const myId = this.network.getMyPlayerId();

    for (const player of orderedPlayers) {
      const isHostPlayer = myId !== null && player.id === myId;
      const botType = this.network.getPlayerBotType(player.id);
      const isLocal = isHostPlayer || botType === "local";
      if (!isLocal) continue;

      const slot = isHostPlayer ? 0 : this.network.getPlayerKeySlot(player.id);
      if (slot < 0) continue;

      if (!localSlotOrder.includes(slot)) {
        localSlotOrder.push(slot);
      }
      slotToColor.set(slot, player.color.primary);
    }

    const localCount = localSlotOrder.length;
    if (localCount === 0) {
      this.multiInput.destroyTouchZones();
      this.useTouchForHost = false;
      return;
    }
    let layout: "single" | "dual" | "corner";
    if (localCount <= 1) {
      layout = "single";
    } else if (localCount === 2) {
      layout = "dual";
    } else {
      layout = "corner";
    }

    for (const slot of localSlotOrder) {
      this.multiInput.activateSlot(slot);
    }

    this.multiInput.setupTouchZones(layout, localSlotOrder, slotToColor);
    this.useTouchForHost = localSlotOrder.includes(0);
  }

  clearTouchLayout(): void {
    this.useTouchForHost = false;
    this.multiInput?.destroyTouchZones();
  }
}
