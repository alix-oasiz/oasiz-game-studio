import { AstroPartySimulation } from "../../../shared/sim/AstroPartySimulation";
import type {
  AdvancedSettingsSync,
  GamePhase,
  GameMode,
  GameStateSync,
  PlayerInput,
  PowerUpType,
  RoundResultPayload,
} from "../../types";
import { PLAYER_COLORS } from "../../types";
import type {
  PlayerListMeta,
  PlayerListPayload,
  RoomMetaPayload,
} from "../../../shared/sim/types";
import type {
  NetworkCallbacks,
  NetworkPlayerState,
  NetworkTransport,
  PlayerMeta,
  PlayerMetaMap,
} from "./NetworkTransport";
import { isClientDebugToolsRequested } from "../../debug/debugTools";

class LocalPlayerState implements NetworkPlayerState {
  constructor(
    public readonly id: string,
    private meta: PlayerMeta,
  ) {}

  setMeta(meta: PlayerMeta): void {
    this.meta = meta;
  }

  getState(key: string): unknown {
    if (key === "customName") return this.meta.customName;
    if (key === "colorIndex") return this.meta.colorIndex;
    if (key === "botType") return this.meta.botType;
    if (key === "keySlot") return this.meta.keySlot;
    if (key === "kills") return this.meta.kills ?? 0;
    if (key === "roundWins") return this.meta.roundWins ?? 0;
    if (key === "score") return this.meta.score ?? 0;
    if (key === "playerState") return this.meta.playerState ?? "ACTIVE";
    return undefined;
  }

  getProfile(): { name?: string } | null {
    return {
      name: this.meta.profileName ?? this.meta.customName,
    };
  }

  isBot(): boolean {
    return Boolean(this.meta.isBot);
  }
}

export class LocalSharedSimTransport implements NetworkTransport {
  private static readonly MAX_PLAYERS = 4;
  private static readonly SIM_TICK_HZ = 60;
  private static readonly TICK_DURATION_MS =
    1000 / LocalSharedSimTransport.SIM_TICK_HZ;

  private callbacks: NetworkCallbacks | null = null;
  private simulation: AstroPartySimulation | null = null;
  private roomCode = "";
  private hostId: string | null = null;
  private mySessionId: string | null = null;
  private myPlayerId: string | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private playerOrder: string[] = [];
  private playerMetaById: PlayerMetaMap = new Map();
  private playerRefs = new Map<string, LocalPlayerState>();
  private lastAdvancedSettingsSignature: string | null = null;
  private lastDevModeEnabled: boolean | null = null;
  private lastDebugToolsEnabled: boolean | null = null;
  private lastDebugSessionTainted: boolean | null = null;
  private lastMapId: number | null = null;

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
  }

  async createRoom(): Promise<string> {
    await this.cleanupSession();

    this.roomCode = this.generateRoomCode();
    this.mySessionId = "local-host-" + Date.now().toString(36);

    this.simulation = new AstroPartySimulation(
      this.roomCode,
      LocalSharedSimTransport.MAX_PLAYERS,
      LocalSharedSimTransport.TICK_DURATION_MS,
      {
        onPlayers: (payload) => this.handlePlayerPayload(payload),
        onRoomMeta: (payload) => this.handleRoomMeta(payload),
        onPhase: (phase, winnerId, winnerName) => {
          this.callbacks?.onGamePhaseReceived(phase, winnerId, winnerName);
        },
        onCountdown: (count) => {
          this.callbacks?.onCountdownReceived(count);
        },
        onRoundResult: (payload) => {
          this.callbacks?.onRoundResultReceived(payload);
        },
        onSnapshot: (payload) => {
          this.callbacks?.onGameStateReceived(payload);
        },
        onSound: (type, playerId) => {
          this.callbacks?.onGameSoundReceived(type, playerId);
        },
        onScreenShake: (intensity, duration) => {
          this.callbacks?.onScreenShakeReceived(intensity, duration);
        },
        onDashParticles: (payload) => {
          this.callbacks?.onDashParticlesReceived?.(payload);
        },
        onDevMode: (enabled) => {
          if (this.lastDevModeEnabled === enabled) return;
          this.lastDevModeEnabled = enabled;
          this.callbacks?.onDevModeReceived(enabled);
        },
        onError: (sessionId, code, message) => {
          if (sessionId !== this.mySessionId) return;
          this.callbacks?.onTransportError?.(code, message);
        },
        onReseed: (seed) => {
          this.callbacks?.onRNGSeedReceived?.(seed);
        },
      },
      { debugToolsEnabled: isClientDebugToolsRequested() },
    );

    this.simulation.addHuman(
      this.mySessionId,
      this.readInjectedPlayerName() ?? undefined,
    );
    this.emitDebugStateFromSimulation();

    this.tickInterval = setInterval(() => {
      if (!this.simulation) return;
      this.simulation.update(LocalSharedSimTransport.TICK_DURATION_MS);
    }, LocalSharedSimTransport.TICK_DURATION_MS);

    return this.roomCode;
  }

  async joinRoom(_roomCode: string): Promise<boolean> {
    this.callbacks?.onTransportError?.(
      "LOCAL_JOIN_UNSUPPORTED",
      "Join room is unavailable in local mode",
    );
    return false;
  }

  async disconnect(): Promise<void> {
    this.stopSync();
    await this.cleanupSession();
  }

  startSync(): void {
    if (this.pingInterval) return;
    this.callbacks?.onPingReceived(0);
    this.pingInterval = setInterval(() => {
      this.callbacks?.onPingReceived(0);
    }, 1000);
  }

  stopSync(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  sendInput(input: PlayerInput, controlledPlayerId?: string): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.sendInput(this.mySessionId, {
      controlledPlayerId,
      buttonA: input.buttonA,
      buttonB: input.buttonB,
      clientTimeMs: input.clientTimeMs,
      inputSequence: input.inputSequence,
      rttMs: 0,
    });
  }

  pollHostInputs(): void {
    // In-process local simulation; no host polling channel.
  }

  broadcastGameState(_state: GameStateSync): void {
    // Simulation emits snapshots through hooks.
  }

  startGame(): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.startMatch(this.mySessionId);
  }

  restartGame(): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.restartToLobby(this.mySessionId);
  }

  setMode(mode: GameMode): void {
    if (!this.simulation || !this.mySessionId || mode === "CUSTOM") return;
    this.simulation.setMode(this.mySessionId, mode);
  }

  setMap(mapId: number): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.setMap(this.mySessionId, mapId);
  }

  setAdvancedSettings(payload: AdvancedSettingsSync): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.setAdvancedSettings(this.mySessionId, payload);
  }

  sendDashRequest(controlledPlayerId?: string): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.queueDash(this.mySessionId, {
      controlledPlayerId,
    });
  }

  broadcastDashParticles(
    _playerId: string,
    _x: number,
    _y: number,
    _angle: number,
    _color: string,
  ): void {
    // Simulation emits dash particles through hooks.
  }

  broadcastGamePhase(
    _phase: GamePhase,
    _winnerId?: string,
    _winnerName?: string,
  ): void {
    // Simulation-authoritative in local mode.
  }

  broadcastCountdown(_count: number): void {
    // Simulation-authoritative in local mode.
  }

  broadcastGameSound(_type: string, _playerId: string): void {
    // Simulation-authoritative in local mode.
  }

  broadcastGameSoundToOthers(_type: string, _playerId: string): void {
    // Simulation-authoritative in local mode.
  }

  broadcastScreenShake(_intensity: number, _duration: number): void {
    // Simulation-authoritative in local mode.
  }

  broadcastRoundResult(_payload: RoundResultPayload): void {
    // Simulation-authoritative in local mode.
  }

  broadcastDevMode(enabled: boolean): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.setDevMode(this.mySessionId, enabled);
    this.emitDebugStateFromSimulation();
  }

  requestDevPowerUp(type: PowerUpType | "SPAWN_RANDOM"): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.devGrantPowerUp(this.mySessionId, type);
    this.emitDebugStateFromSimulation();
  }

  requestDevEjectPilot(): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.devEjectPilot(this.mySessionId);
    this.emitDebugStateFromSimulation();
  }

  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void {
    this.setAdvancedSettings(payload);
  }

  broadcastRNGSeed(_baseSeed: number): void {
    // Simulation seeds internally per round.
  }

  broadcastPlayerList(): void {
    this.callbacks?.onPlayerListReceived(this.playerOrder, this.playerMetaById);
  }

  resyncPlayerListFromState(_reason = "manual", _force = false): boolean {
    if (!this.callbacks) return false;
    this.callbacks.onPlayerListReceived(this.playerOrder, this.playerMetaById);
    return true;
  }

  async resetAllPlayerStates(): Promise<void> {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.restartToLobby(this.mySessionId);
  }

  updateKills(_playerId: string, _kills: number): void {
    // Simulation-authoritative in local mode.
  }

  updateRoundWins(_playerId: string, _wins: number): void {
    // Simulation-authoritative in local mode.
  }

  updatePlayerState(
    _playerId: string,
    _state: "ACTIVE" | "EJECTED" | "SPECTATING",
  ): void {
    // Simulation-authoritative in local mode.
  }

  setCustomName(name: string): void {
    if (!this.simulation || !this.mySessionId) return;
    this.simulation.setName(this.mySessionId, name);
  }

  async addAIBot(): Promise<unknown | null> {
    if (!this.simulation || !this.mySessionId) return null;
    this.simulation.addAIBot(this.mySessionId);
    return {};
  }

  async addLocalBot(keySlot: number): Promise<unknown | null> {
    if (!this.simulation || !this.mySessionId) return null;
    this.simulation.addLocalPlayer(this.mySessionId, keySlot);
    return {};
  }

  async removeBot(playerId: string): Promise<boolean> {
    if (!this.simulation || !this.mySessionId) return false;
    this.simulation.removeBot(this.mySessionId, playerId);
    return true;
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!this.simulation || !this.mySessionId) return false;
    this.simulation.kickPlayer(this.mySessionId, playerId);
    return true;
  }

  getMyPlayerId(): string | null {
    return this.myPlayerId;
  }

  isHost(): boolean {
    return this.myPlayerId !== null && this.hostId === this.myPlayerId;
  }

  isWebRtcConnected(): boolean {
    return false;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getPlayerCount(): number {
    return this.playerOrder.length;
  }

  getPlayerIds(): string[] {
    return [...this.playerOrder];
  }

  getPlayerIndex(playerId: string): number {
    return this.playerOrder.indexOf(playerId);
  }

  getPlayerColor(playerId: string): { primary: string; glow: string } {
    const meta = this.playerMetaById.get(playerId);
    const index = Number.isFinite(meta?.colorIndex)
      ? (meta?.colorIndex as number)
      : 0;
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  getPlayerName(playerId: string): string {
    const meta = this.playerMetaById.get(playerId);
    if (!meta) return "Player";
    return meta.customName ?? meta.profileName ?? "Player";
  }

  getHostId(): string | null {
    return this.hostId;
  }

  isPlayerBot(playerId: string): boolean {
    const meta = this.playerMetaById.get(playerId);
    return Boolean(meta?.isBot);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    const meta = this.playerMetaById.get(playerId);
    return meta?.botType ?? null;
  }

  getPlayerKeySlot(playerId: string): number {
    const meta = this.playerMetaById.get(playerId);
    if (!Number.isFinite(meta?.keySlot)) return -1;
    return meta?.keySlot as number;
  }

  getPlayer(playerId: string): NetworkPlayerState | undefined {
    return this.playerRefs.get(playerId);
  }

  hasRemotePlayers(): boolean {
    return false;
  }

  getBotCount(): number {
    let count = 0;
    for (const playerId of this.playerOrder) {
      if (this.isPlayerBot(playerId)) count += 1;
    }
    return count;
  }

  isSimulationAuthority(): boolean {
    return false;
  }

  supportsLocalPlayers(): boolean {
    return true;
  }

  private handlePlayerPayload(payload: PlayerListPayload): void {
    const meta = payload.meta.map((entry) => this.normalizePlayerMeta(entry));
    this.handlePlayerList(
      {
        order: payload.order,
        meta,
        hostId: payload.hostId,
        revision: payload.revision,
      },
      true,
    );
  }

  private handleRoomMeta(payload: RoomMetaPayload): void {
    const previousHost = this.hostId;
    this.hostId = payload.leaderPlayerId;
    if (previousHost && previousHost !== this.hostId) {
      this.callbacks?.onHostChanged();
    }

    const signature =
      payload.mode +
      "|" +
      payload.baseMode +
      "|" +
      JSON.stringify(payload.settings);
    if (this.lastAdvancedSettingsSignature !== signature) {
      this.lastAdvancedSettingsSignature = signature;
      this.callbacks?.onAdvancedSettingsReceived({
        mode: payload.mode,
        baseMode: payload.baseMode,
        settings: payload.settings,
      });
    }

    if (this.lastMapId !== payload.mapId) {
      this.lastMapId = payload.mapId;
      this.callbacks?.onMapIdReceived(payload.mapId);
    }

    if (
      this.lastDebugToolsEnabled !== payload.debugToolsEnabled ||
      this.lastDebugSessionTainted !== payload.debugSessionTainted
    ) {
      this.lastDebugToolsEnabled = payload.debugToolsEnabled;
      this.lastDebugSessionTainted = payload.debugSessionTainted;
      this.callbacks?.onDebugStateReceived?.({
        enabled: payload.debugToolsEnabled,
        tainted: payload.debugSessionTainted,
      });
    }
  }

  private emitDebugStateFromSimulation(): void {
    if (!this.simulation) return;
    const enabled = this.simulation.getDebugToolsEnabled();
    const tainted = this.simulation.getDebugSessionTainted();
    if (
      this.lastDebugToolsEnabled === enabled &&
      this.lastDebugSessionTainted === tainted
    ) {
      return;
    }
    this.lastDebugToolsEnabled = enabled;
    this.lastDebugSessionTainted = tainted;
    this.callbacks?.onDebugStateReceived?.({ enabled, tainted });
  }

  private normalizePlayerMeta(meta: PlayerListMeta): PlayerMeta {
    return {
      id: meta.id,
      customName: meta.customName,
      profileName: meta.profileName,
      botType: meta.botType,
      colorIndex: meta.colorIndex,
      keySlot: Number.isFinite(meta.keySlot) ? meta.keySlot : undefined,
      kills: meta.kills,
      roundWins: meta.roundWins,
      score: meta.score,
      playerState: meta.playerState,
      isBot: meta.isBot,
    };
  }

  private handlePlayerList(
    payload: {
      order: string[];
      meta: PlayerMeta[];
      hostId: string | null;
      revision: number;
    },
    emitJoinLeaveEvents: boolean,
  ): void {
    void payload.revision;
    const previousOrder = [...this.playerOrder];
    const previousSet = new Set(previousOrder);
    const nextSet = new Set(payload.order);

    this.playerOrder = [...payload.order];
    this.playerMetaById.clear();

    for (const meta of payload.meta) {
      this.playerMetaById.set(meta.id, meta);
      const existing = this.playerRefs.get(meta.id);
      if (existing) {
        existing.setMeta(meta);
      } else {
        this.playerRefs.set(meta.id, new LocalPlayerState(meta.id, meta));
      }
    }

    for (const previousId of previousSet) {
      if (!nextSet.has(previousId)) {
        this.playerRefs.delete(previousId);
        if (emitJoinLeaveEvents) {
          this.callbacks?.onPlayerLeft(previousId);
        }
      }
    }

    if (emitJoinLeaveEvents) {
      payload.order.forEach((playerId, index) => {
        if (!previousSet.has(playerId)) {
          this.callbacks?.onPlayerJoined(playerId, index);
        }
      });
    }

    const nextHostId = payload.hostId ?? this.hostId;
    if (this.hostId && this.hostId !== nextHostId) {
      this.callbacks?.onHostChanged();
    }
    this.hostId = nextHostId;

    const myId = this.myPlayerId;
    if (myId && !this.playerOrder.includes(myId)) {
      this.myPlayerId = null;
    }
    if (!this.myPlayerId && this.mySessionId) {
      for (const playerId of this.playerOrder) {
        const meta = this.playerMetaById.get(playerId);
        if (!meta || meta.isBot) continue;
        this.myPlayerId = playerId;
        break;
      }
    }

    this.callbacks?.onPlayerListReceived(this.playerOrder, this.playerMetaById);
  }

  private async cleanupSession(): Promise<void> {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.simulation = null;
    this.roomCode = "";
    this.hostId = null;
    this.mySessionId = null;
    this.myPlayerId = null;
    this.playerOrder = [];
    this.playerMetaById.clear();
    this.playerRefs.clear();
    this.lastAdvancedSettingsSignature = null;
    this.lastDevModeEnabled = null;
    this.lastDebugToolsEnabled = null;
    this.lastDebugSessionTainted = null;
    this.lastMapId = null;
  }

  private generateRoomCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i += 1) {
      const idx = Math.floor(Math.random() * alphabet.length);
      out += alphabet[idx];
    }
    return out;
  }

  private readInjectedPlayerName(): string | null {
    const name = (window as unknown as { __PLAYER_NAME__?: string })
      .__PLAYER_NAME__;
    if (typeof name !== "string") return null;
    const normalized = name.trim();
    return normalized.length > 0 ? normalized : null;
  }

}
