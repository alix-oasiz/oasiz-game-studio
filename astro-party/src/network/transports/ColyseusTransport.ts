import { Client, Room, getStateCallbacks } from "colyseus.js";
import {
  AdvancedSettingsSync,
  AsteroidColliderSync,
  GamePhase,
  GameMode,
  GameStateSync,
  PlayerInput,
  PowerUpType,
  PLAYER_COLORS,
  RoundResultPayload,
} from "../../types";
import type {
  NetworkCallbacks,
  NetworkPlayerState,
  NetworkTransport,
  PlayerMeta,
  PlayerMetaMap,
} from "./NetworkTransport";

interface MatchCreateResponse {
  roomCode: string;
  roomId: string;
  seatReservation: unknown;
}

interface MatchJoinErrorResponse {
  ok: false;
  error: string;
  message: string;
}

type MatchJoinResponse = MatchCreateResponse | MatchJoinErrorResponse;

class HttpRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

interface RoomStatePlayerMeta {
  id?: string;
  customName?: string;
  profileName?: string;
  botType?: "ai" | "local" | "";
  colorIndex?: number;
  keySlot?: number;
  kills?: number;
  roundWins?: number;
  score?: number;
  playerState?: "ACTIVE" | "EJECTED" | "SPECTATING";
  isBot?: boolean;
}

interface RoomStateView {
  playerOrder?: unknown;
  players?: unknown;
  roomCode?: string;
  leaderPlayerId?: string;
  hostId?: string;
  phase?: GamePhase;
  mode?: string;
  baseMode?: string;
  mapId?: number;
  settingsJson?: string;
  roundResultJson?: string;
  roundResultRevision?: number;
  countdown?: number;
  devModeEnabled?: boolean;
  debugToolsEnabled?: boolean;
  debugSessionTainted?: boolean;
}

interface PlayerListPayload {
  order: string[];
  meta: Array<PlayerMeta>;
  hostId: string | null;
  revision: number;
}

class ColyseusPlayerState implements NetworkPlayerState {
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

export class ColyseusTransport implements NetworkTransport {
  private callbacks: NetworkCallbacks | null = null;
  private client: Client | null = null;
  private room: Room | null = null;
  private connected = false;
  private roomCode = "";
  private hostId: string | null = null;
  private myPlayerId: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private playerOrder: string[] = [];
  private playerMetaById: PlayerMetaMap = new Map();
  private playerRefs = new Map<string, ColyseusPlayerState>();
  private playerListRevision = 0;
  private lastPlayerListSignature: string | null = null;
  private lastAdvancedSettingsSignature: string | null = null;
  private lastDevModeEnabled: boolean | null = null;
  private lastDebugToolsEnabled: boolean | null = null;
  private lastDebugSessionTainted: boolean | null = null;
  private lastMapId: number | null = null;
  private lastPhase: GamePhase | null = null;
  private lastCountdown: number | null = null;
  private lastRoundResultSignature: string | null = null;
  private lastRoundResult: RoundResultPayload | null = null;
  private lastMeasuredRttMs = 0;
  private stateUnsubscribers: Array<() => void> = [];
  private playerMetaDetachById = new Map<string, () => void>();
  private schemaRosterCallbacksActive = false;
  private static readonly FETCH_TIMEOUT_MS = 15_000;

  private readonly wsUrl: string;
  private readonly httpUrl: string;

  constructor() {
    this.wsUrl = this.resolveWsUrl();
    this.httpUrl = this.resolveHttpUrl();
  }

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
  }

  async createRoom(): Promise<string> {
    await this.cleanupConnection();
    const playerName = this.readInjectedPlayerName();
    const response = await this.fetchJson<MatchCreateResponse>(
      this.httpUrl + "/match/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      },
    );
    await this.connectSeat(response.seatReservation, response.roomCode);
    this.shareRoomCode(response.roomCode);
    return response.roomCode;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    await this.cleanupConnection();
    const playerName = this.readInjectedPlayerName();
    try {
      const response = await this.fetchJson<MatchJoinResponse>(
        this.httpUrl + "/match/join",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, playerName }),
        },
      );
      if (this.isMatchJoinErrorResponse(response)) {
        this.callbacks?.onTransportError?.(response.error, response.message);
        console.log(
          "[ColyseusTransport] Join rejected",
          response.error,
          response.message,
        );
        return false;
      }
      await this.connectSeat(response.seatReservation, response.roomCode);
      this.shareRoomCode(response.roomCode);
      return true;
    } catch (error) {
      const normalizedError = this.normalizeJoinError(error);
      this.callbacks?.onTransportError?.(
        normalizedError.code,
        normalizedError.message,
      );
      console.log(
        "[ColyseusTransport] Join failed",
        normalizedError.code,
        normalizedError.message,
      );
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSync();
    this.shareRoomCode(null);
    await this.cleanupConnection();
  }

  startSync(): void {
    if (!this.room || this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (!this.room) return;
      this.room.send("cmd:ping", { sentAt: performance.now() });
    }, 1000);
  }

  stopSync(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  sendInput(input: PlayerInput, controlledPlayerId?: string): void {
    if (!this.room) return;
    this.room.send("cmd:input", {
      controlledPlayerId: controlledPlayerId ?? this.myPlayerId ?? undefined,
      buttonA: input.buttonA,
      buttonB: input.buttonB,
      clientTimeMs: input.clientTimeMs,
      inputSequence: input.inputSequence,
      rttMs: this.lastMeasuredRttMs,
    });
  }

  pollHostInputs(): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameState(_state: GameStateSync): void {
    // Server-authoritative in Colyseus mode.
  }

  startGame(): void {
    if (!this.room) return;
    this.room.send("cmd:start_match", {});
  }

  restartGame(): void {
    if (!this.room) return;
    this.room.send("cmd:restart_match", {});
  }

  setMode(mode: GameMode): void {
    if (!this.room || mode === "CUSTOM") return;
    this.room.send("cmd:set_mode", { mode });
  }

  setMap(mapId: number): void {
    if (!this.room) return;
    this.room.send("cmd:set_map", { mapId });
  }

  setAdvancedSettings(payload: AdvancedSettingsSync): void {
    if (!this.room) return;
    this.room.send("cmd:set_advanced_settings", payload);
  }

  sendDashRequest(controlledPlayerId?: string): void {
    if (!this.room) return;
    this.room.send("cmd:dash", {
      controlledPlayerId: controlledPlayerId ?? this.myPlayerId ?? undefined,
    });
  }

  broadcastDashParticles(
    _playerId: string,
    _x: number,
    _y: number,
    _angle: number,
    _color: string,
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGamePhase(
    _phase: GamePhase,
    _winnerId?: string,
    _winnerName?: string,
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastCountdown(_count: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameSound(_type: string, _playerId: string): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameSoundToOthers(_type: string, _playerId: string): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastScreenShake(_intensity: number, _duration: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastRoundResult(_payload: RoundResultPayload): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastDevMode(enabled: boolean): void {
    if (!this.room) return;
    this.room.send("cmd:dev_mode", { enabled });
  }

  requestDevPowerUp(type: PowerUpType | "SPAWN_RANDOM"): void {
    if (!this.room) return;
    this.room.send("cmd:dev_grant_powerup", { type });
  }

  requestDevEjectPilot(): void {
    if (!this.room) return;
    this.room.send("cmd:dev_eject_pilot", {});
  }

  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void {
    this.setAdvancedSettings(payload);
  }

  broadcastRNGSeed(_baseSeed: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastPlayerList(): void {
    // Server-authoritative in Colyseus mode.
  }

  resyncPlayerListFromState(_reason = "manual", _force = false): boolean {
    if (!this.callbacks) return false;
    this.callbacks.onPlayerListReceived(this.playerOrder, this.playerMetaById);
    return true;
  }

  async resetAllPlayerStates(): Promise<void> {
    if (!this.room) return;
    this.room.send("cmd:restart_match", {});
  }

  updateKills(_playerId: string, _kills: number): void {
    // Server-authoritative in Colyseus mode.
  }

  updateRoundWins(_playerId: string, _wins: number): void {
    // Server-authoritative in Colyseus mode.
  }

  updatePlayerState(
    _playerId: string,
    _state: "ACTIVE" | "EJECTED" | "SPECTATING",
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  setCustomName(name: string): void {
    if (!this.room) return;
    this.room.send("cmd:set_name", { name });
  }

  async addAIBot(): Promise<unknown | null> {
    if (!this.room) return null;
    this.room.send("cmd:add_ai_bot", {});
    return {};
  }

  async addLocalBot(keySlot: number): Promise<unknown | null> {
    if (!this.room) return null;
    this.room.send("cmd:add_local_player", { keySlot });
    return null;
  }

  async removeBot(playerId: string): Promise<boolean> {
    if (!this.room) return false;
    this.room.send("cmd:remove_bot", { playerId });
    return true;
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!this.room) return false;
    this.room.send("cmd:kick_player", { playerId });
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
    for (const id of this.playerOrder) {
      if (id === this.myPlayerId) continue;
      if (!this.isPlayerBot(id)) return true;
    }
    return false;
  }

  getBotCount(): number {
    let count = 0;
    for (const id of this.playerOrder) {
      if (this.isPlayerBot(id)) count += 1;
    }
    return count;
  }

  isSimulationAuthority(): boolean {
    return false;
  }

  supportsLocalPlayers(): boolean {
    return false;
  }

  private async connectSeat(
    seatReservation: unknown,
    roomCode: string,
  ): Promise<void> {
    this.client = new Client(this.wsUrl);
    this.room = await this.client.consumeSeatReservation(
      seatReservation as Parameters<Client["consumeSeatReservation"]>[0],
    );
    this.myPlayerId = this.room.sessionId;
    this.connected = true;
    this.roomCode = roomCode;
    this.bindRoomListeners(this.room);
  }

  private bindRoomListeners(room: Room): void {
    this.bindStateListeners(room);

    room.onLeave(() => {
      this.connected = false;
      this.stopSync();
      this.callbacks?.onDisconnected();
    });

    room.onMessage("evt:snapshot", (payload: GameStateSync) => {
      this.callbacks?.onGameStateReceived(payload);
    });

    room.onMessage(
      "evt:asteroid_colliders",
      (payload: AsteroidColliderSync[]) => {
        this.callbacks?.onAsteroidCollidersReceived?.(payload);
      },
    );

    room.onMessage(
      "evt:sound",
      (payload: { type: string; playerId: string }) => {
        this.callbacks?.onGameSoundReceived(payload.type, payload.playerId);
      },
    );

    room.onMessage(
      "evt:screen_shake",
      (payload: { intensity: number; duration: number }) => {
        this.callbacks?.onScreenShakeReceived(
          payload.intensity,
          payload.duration,
        );
      },
    );

    room.onMessage(
      "evt:dash_particles",
      (payload: {
        playerId: string;
        x: number;
        y: number;
        angle: number;
        color: string;
      }) => {
        this.callbacks?.onDashParticlesReceived?.(payload);
      },
    );

    room.onMessage(
      "evt:pong",
      (payload: { sentAt: number; serverAt: number }) => {
        const rtt = Math.max(0, performance.now() - payload.sentAt);
        this.lastMeasuredRttMs = rtt;
        this.callbacks?.onPingReceived(rtt);
      },
    );

    room.onMessage(
      "evt:error",
      (payload: { code?: string; message?: string }) => {
        const code = payload.code ?? "ERROR";
        const message = payload.message ?? "Network error";
        console.log("[ColyseusTransport]", code, message);
        this.callbacks?.onTransportError?.(code, message);
      },
    );

    room.onMessage("evt:rng_seed", (payload: { seed: number }) => {
      this.callbacks?.onRNGSeedReceived?.(payload.seed);
    });
  }

  private bindStateListeners(room: Room): void {
    this.teardownStateBindings();
    this.schemaRosterCallbacksActive = false;
    if (this.bindSchemaStateListeners(room)) {
      this.schemaRosterCallbacksActive = true;
      return;
    }

    const detach = room.onStateChange((state) => {
      this.handleRoomState(state as unknown as RoomStateView);
    });
    if (typeof detach === "function") {
      this.stateUnsubscribers.push(detach);
    }
    if (room.state) {
      this.handleRoomState(room.state as unknown as RoomStateView);
    }
  }

  private bindSchemaStateListeners(room: Room): boolean {
    if (!room.state) return false;

    const getCallbacks = getStateCallbacks<RoomStateView>(
      room as unknown as Room<RoomStateView>,
    );
    if (!getCallbacks) return false;

    const state = room.state as unknown as RoomStateView;
    const $ = getCallbacks as unknown as (instance: unknown) => {
      listen?: (
        prop: string,
        callback: (value: unknown, previousValue: unknown) => void,
        immediate?: boolean,
      ) => (() => void) | void;
      onChange?: (callback: () => void) => (() => void) | void;
      playerOrder?: {
        onAdd?: (
          callback: (item: unknown, index: unknown) => void,
        ) => (() => void) | void;
        onRemove?: (
          callback: (item: unknown, index: unknown) => void,
        ) => (() => void) | void;
        onChange?: (
          callback: (item: unknown, index: unknown) => void,
        ) => (() => void) | void;
      };
      players?: {
        onAdd?: (
          callback: (item: unknown, key: unknown) => void,
        ) => (() => void) | void;
        onRemove?: (
          callback: (item: unknown, key: unknown) => void,
        ) => (() => void) | void;
        onChange?: (
          callback: (item: unknown, key: unknown) => void,
        ) => (() => void) | void;
      };
    };
    const root = $(state);
    if (!root) return false;

    this.clearPlayerMetaListeners();
    const triggerStateRefresh = (): void => {
      this.handleRoomState(state);
    };
    const trackUnsubscriber = (unbind: unknown): void => {
      if (typeof unbind === "function") {
        this.stateUnsubscribers.push(unbind as () => void);
      }
    };

    const attachPlayerMetaListener = (entry: unknown, key: unknown): void => {
      const playerId = String(key);
      const existing = this.playerMetaDetachById.get(playerId);
      if (existing) {
        existing();
        this.playerMetaDetachById.delete(playerId);
      }
      const entryProxy = $(entry);
      if (entryProxy && typeof entryProxy.onChange === "function") {
        const unbind = entryProxy.onChange(() => {
          triggerStateRefresh();
        });
        if (typeof unbind === "function") {
          this.playerMetaDetachById.set(playerId, unbind);
        }
      }
    };

    if (typeof root.listen === "function") {
      trackUnsubscriber(
        root.listen("leaderPlayerId", () => triggerStateRefresh()),
      );
      trackUnsubscriber(root.listen("hostId", () => triggerStateRefresh()));
      trackUnsubscriber(root.listen("phase", () => triggerStateRefresh()));
      trackUnsubscriber(root.listen("mode", () => triggerStateRefresh()));
      trackUnsubscriber(root.listen("baseMode", () => triggerStateRefresh()));
      trackUnsubscriber(root.listen("mapId", () => triggerStateRefresh()));
      trackUnsubscriber(
        root.listen("settingsJson", () => triggerStateRefresh()),
      );
      trackUnsubscriber(
        root.listen("roundResultJson", () => triggerStateRefresh()),
      );
      trackUnsubscriber(
        root.listen("roundResultRevision", () => triggerStateRefresh()),
      );
      trackUnsubscriber(root.listen("countdown", () => triggerStateRefresh()));
      trackUnsubscriber(
        root.listen("devModeEnabled", () => triggerStateRefresh()),
      );
      trackUnsubscriber(
        root.listen("debugToolsEnabled", () => triggerStateRefresh()),
      );
      trackUnsubscriber(
        root.listen("debugSessionTainted", () => triggerStateRefresh()),
      );
    }

    if (root.playerOrder) {
      trackUnsubscriber(
        root.playerOrder.onAdd?.((item, index) => {
          const playerId = typeof item === "string" ? item : "";
          triggerStateRefresh();
          if (!playerId) return;
          const joinedIndex = Number.isFinite(index as number)
            ? (index as number)
            : this.playerOrder.indexOf(playerId);
          this.callbacks?.onPlayerJoined(playerId, joinedIndex);
        }),
      );
      trackUnsubscriber(
        root.playerOrder.onChange?.(() => triggerStateRefresh()),
      );
      trackUnsubscriber(
        root.playerOrder.onRemove?.((item) => {
          const playerId = typeof item === "string" ? item : "";
          triggerStateRefresh();
          if (!playerId) return;
          this.callbacks?.onPlayerLeft(playerId);
        }),
      );
    }

    if (root.players) {
      trackUnsubscriber(
        root.players.onAdd?.((entry, key) => {
          attachPlayerMetaListener(entry, key);
          triggerStateRefresh();
        }),
      );
      trackUnsubscriber(
        root.players.onChange?.((entry, key) => {
          attachPlayerMetaListener(entry, key);
          triggerStateRefresh();
        }),
      );
      trackUnsubscriber(
        root.players.onRemove?.((_entry, key) => {
          const playerId = String(key);
          const existing = this.playerMetaDetachById.get(playerId);
          if (existing) {
            existing();
            this.playerMetaDetachById.delete(playerId);
          }
          triggerStateRefresh();
        }),
      );
    }

    const playersState = state.players as {
      forEach?: (cb: (value: unknown, key: string) => void) => void;
    };
    if (typeof playersState?.forEach === "function") {
      playersState.forEach((entry, key) => {
        attachPlayerMetaListener(entry, key);
      });
    }

    triggerStateRefresh();
    return true;
  }

  private teardownStateBindings(): void {
    for (const detach of this.stateUnsubscribers) {
      try {
        detach();
      } catch {
        // no-op
      }
    }
    this.stateUnsubscribers = [];
    this.clearPlayerMetaListeners();
  }

  private clearPlayerMetaListeners(): void {
    for (const detach of this.playerMetaDetachById.values()) {
      try {
        detach();
      } catch {
        // no-op
      }
    }
    this.playerMetaDetachById.clear();
  }

  private handleRoomState(state: RoomStateView): void {
    const leaderFromState = this.normalizeStateString(state.leaderPlayerId);
    const hostFromState = this.normalizeStateString(state.hostId);
    const nextHost = leaderFromState ?? hostFromState;
    const previousHost = this.hostId;
    this.hostId = nextHost;
    if (previousHost && previousHost !== this.hostId && this.callbacks) {
      this.callbacks.onHostChanged();
    }

    this.applyRoundResultFromState(state);
    this.applyPhaseFromState(state);
    this.applyCountdownFromState(state);
    this.applyAdvancedSettingsFromState(state);
    this.applyMapFromState(state);
    this.applyDevModeFromState(state);
    this.applyDebugStateFromState(state);

    const order = this.toStringArray(state.playerOrder);
    const meta = this.extractPlayerMetaList(state.players);
    if (order.length === 0 && meta.length > 0) {
      for (const entry of meta) order.push(entry.id);
    }

    const payload: PlayerListPayload = {
      order,
      meta,
      hostId: this.hostId,
      revision: ++this.playerListRevision,
    };
    this.handlePlayerList(payload, !this.schemaRosterCallbacksActive);
  }

  private applyAdvancedSettingsFromState(state: RoomStateView): void {
    const mode = this.normalizeStateString(state.mode);
    const baseMode = this.normalizeStateString(state.baseMode);
    const settingsJson = this.normalizeStateString(state.settingsJson);
    if (!mode || !baseMode || !settingsJson) return;

    const signature = mode + "|" + baseMode + "|" + settingsJson;
    if (this.lastAdvancedSettingsSignature === signature) return;

    let settings: AdvancedSettingsSync["settings"];
    try {
      settings = JSON.parse(settingsJson) as AdvancedSettingsSync["settings"];
    } catch {
      return;
    }

    const payload: AdvancedSettingsSync = {
      mode: mode as AdvancedSettingsSync["mode"],
      baseMode: baseMode as AdvancedSettingsSync["baseMode"],
      settings,
    };
    this.lastAdvancedSettingsSignature = signature;
    this.callbacks?.onAdvancedSettingsReceived(payload);
  }

  private applyDevModeFromState(state: RoomStateView): void {
    if (typeof state.devModeEnabled !== "boolean") return;
    if (this.lastDevModeEnabled === state.devModeEnabled) return;
    this.lastDevModeEnabled = state.devModeEnabled;
    this.callbacks?.onDevModeReceived(state.devModeEnabled);
  }

  private applyDebugStateFromState(state: RoomStateView): void {
    const enabled =
      typeof state.debugToolsEnabled === "boolean"
        ? state.debugToolsEnabled
        : false;
    const tainted =
      typeof state.debugSessionTainted === "boolean"
        ? state.debugSessionTainted
        : false;
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

  private applyMapFromState(state: RoomStateView): void {
    if (!Number.isInteger(state.mapId)) return;
    const mapId = state.mapId as number;
    if (this.lastMapId === mapId) return;
    this.lastMapId = mapId;
    this.callbacks?.onMapIdReceived(mapId);
  }

  private applyRoundResultFromState(state: RoomStateView): void {
    const roundResultJson =
      this.normalizeStateString(state.roundResultJson) ?? "";
    const roundResultRevision = Number.isFinite(state.roundResultRevision)
      ? (state.roundResultRevision as number)
      : 0;
    const signature = roundResultRevision.toString() + "|" + roundResultJson;
    if (this.lastRoundResultSignature === signature) return;
    this.lastRoundResultSignature = signature;

    if (!roundResultJson) {
      this.lastRoundResult = null;
      return;
    }

    try {
      const payload = JSON.parse(roundResultJson) as RoundResultPayload;
      this.lastRoundResult = payload;
      this.callbacks?.onRoundResultReceived(payload);
    } catch {
      this.lastRoundResult = null;
    }
  }

  private applyCountdownFromState(state: RoomStateView): void {
    if (!Number.isFinite(state.countdown)) return;
    const countdown = Math.max(0, Math.floor(state.countdown as number));
    if (this.lastCountdown === countdown) return;
    this.lastCountdown = countdown;
    this.callbacks?.onCountdownReceived(countdown);
  }

  private applyPhaseFromState(state: RoomStateView): void {
    const phase = state.phase;
    if (!phase) return;
    if (this.lastPhase === phase) return;
    this.lastPhase = phase;

    const winnerId =
      phase === "GAME_END" ? this.lastRoundResult?.winnerId : undefined;
    const winnerName =
      phase === "GAME_END" ? this.lastRoundResult?.winnerName : undefined;
    this.callbacks?.onGamePhaseReceived(phase, winnerId, winnerName);
  }

  private extractPlayerMetaList(playersState: unknown): PlayerMeta[] {
    const out: PlayerMeta[] = [];
    if (!playersState) return out;

    const collection = playersState as {
      forEach?: (cb: (value: unknown, key: string) => void) => void;
    };
    if (typeof collection.forEach === "function") {
      collection.forEach((value, key) => {
        out.push(this.normalizePlayerMeta(key, value as RoomStatePlayerMeta));
      });
      return out;
    }

    if (playersState instanceof Map) {
      playersState.forEach((value, key) => {
        out.push(
          this.normalizePlayerMeta(String(key), value as RoomStatePlayerMeta),
        );
      });
      return out;
    }

    if (typeof playersState === "object") {
      for (const [key, value] of Object.entries(
        playersState as Record<string, unknown>,
      )) {
        out.push(this.normalizePlayerMeta(key, value as RoomStatePlayerMeta));
      }
    }
    return out;
  }

  private normalizePlayerMeta(
    id: string,
    value: RoomStatePlayerMeta,
  ): PlayerMeta {
    const playerId = this.normalizeStateString(value?.id) ?? id;
    const keySlotValue = value?.keySlot;
    const keySlot =
      Number.isFinite(keySlotValue) && (keySlotValue as number) >= 0
        ? (keySlotValue as number)
        : undefined;

    return {
      id: playerId,
      customName: this.normalizeStateString(value?.customName) ?? "Player",
      profileName: this.normalizeStateString(value?.profileName) ?? undefined,
      botType:
        value?.botType === "ai" || value?.botType === "local"
          ? value.botType
          : undefined,
      colorIndex: Number.isFinite(value?.colorIndex)
        ? (value.colorIndex as number)
        : 0,
      keySlot,
      kills: Number.isFinite(value?.kills) ? (value.kills as number) : 0,
      roundWins: Number.isFinite(value?.roundWins)
        ? (value.roundWins as number)
        : 0,
      score: Number.isFinite(value?.score) ? (value.score as number) : 0,
      playerState:
        value?.playerState === "ACTIVE" ||
        value?.playerState === "EJECTED" ||
        value?.playerState === "SPECTATING"
          ? value.playerState
          : "ACTIVE",
      isBot: Boolean(value?.isBot),
    };
  }

  private toStringArray(value: unknown): string[] {
    const out: string[] = [];
    if (!value) return out;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.length > 0) out.push(entry);
      }
      return out;
    }

    const collection = value as {
      forEach?: (cb: (entry: unknown) => void) => void;
      [Symbol.iterator]?: () => Iterator<unknown>;
    };
    if (typeof collection.forEach === "function") {
      collection.forEach((entry) => {
        if (typeof entry === "string" && entry.length > 0) out.push(entry);
      });
      return out;
    }

    if (typeof collection[Symbol.iterator] === "function") {
      for (const entry of collection as Iterable<unknown>) {
        if (typeof entry === "string" && entry.length > 0) out.push(entry);
      }
    }
    return out;
  }

  private normalizeStateString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private handlePlayerList(
    payload: PlayerListPayload,
    emitJoinLeaveEvents: boolean,
  ): void {
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
        this.playerRefs.set(meta.id, new ColyseusPlayerState(meta.id, meta));
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

    this.hostId = payload.hostId ?? this.hostId;

    const signature = this.buildPlayerListSignature(payload);
    if (this.lastPlayerListSignature === signature) {
      return;
    }
    this.lastPlayerListSignature = signature;
    this.callbacks?.onPlayerListReceived(this.playerOrder, this.playerMetaById);
  }

  private buildPlayerListSignature(payload: PlayerListPayload): string {
    const orderPart = payload.order.join(",");
    const metaPart = payload.meta
      .map((meta) =>
        [
          meta.id,
          meta.customName ?? "",
          meta.profileName ?? "",
          meta.botType ?? "",
          (meta.colorIndex ?? 0).toString(),
          (meta.keySlot ?? -1).toString(),
          (meta.kills ?? 0).toString(),
          (meta.roundWins ?? 0).toString(),
          (meta.score ?? 0).toString(),
          meta.playerState ?? "ACTIVE",
          meta.isBot ? "1" : "0",
        ].join("~"),
      )
      .join("|");
    return orderPart + "||" + metaPart;
  }

  private async cleanupConnection(): Promise<void> {
    this.teardownStateBindings();
    try {
      if (this.room) {
        await this.room.leave(true);
      }
    } catch (error) {
      console.log("[ColyseusTransport] leave failed", error);
    }
    this.connected = false;
    this.room = null;
    this.client = null;
    this.roomCode = "";
    this.hostId = null;
    this.myPlayerId = null;
    this.playerListRevision = 0;
    this.lastPlayerListSignature = null;
    this.lastAdvancedSettingsSignature = null;
    this.lastDevModeEnabled = null;
    this.lastDebugToolsEnabled = null;
    this.lastDebugSessionTainted = null;
    this.lastMapId = null;
    this.lastPhase = null;
    this.lastCountdown = null;
    this.lastRoundResultSignature = null;
    this.lastRoundResult = null;
    this.lastMeasuredRttMs = 0;
    this.playerOrder = [];
    this.playerMetaById.clear();
    this.playerRefs.clear();
  }

  private resolveWsUrl(): string {
    const fromWindow = (window as unknown as { __COLYSEUS_WS_URL__?: string })
      .__COLYSEUS_WS_URL__;
    const fromEnv = (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env?.VITE_COLYSEUS_WS_URL;
    if (fromWindow && fromWindow.trim().length > 0) return fromWindow;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
    const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
    return proto + window.location.hostname + ":2567";
  }

  private resolveHttpUrl(): string {
    const fromWindow = (window as unknown as { __MATCH_HTTP_URL__?: string })
      .__MATCH_HTTP_URL__;
    const fromEnv = (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env?.VITE_MATCH_HTTP_URL;
    if (fromWindow && fromWindow.trim().length > 0) return fromWindow;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
    const proto =
      window.location.protocol === "https:" ? "https://" : "http://";
    return proto + window.location.hostname + ":2567";
  }

  private isMatchJoinErrorResponse(
    payload: MatchJoinResponse,
  ): payload is MatchJoinErrorResponse {
    return (
      typeof payload === "object" &&
      payload !== null &&
      "ok" in payload &&
      (payload as { ok?: unknown }).ok === false &&
      typeof (payload as { error?: unknown }).error === "string"
    );
  }

  private normalizeJoinError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof HttpRequestError) {
      return {
        code: error.code,
        message: error.message || "Could not join room",
      };
    }
    if (error instanceof Error) {
      return {
        code: "JOIN_FAILED",
        message: error.message || "Could not join room",
      };
    }
    return {
      code: "JOIN_FAILED",
      message: "Could not join room",
    };
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const timeoutController = new AbortController();
    let didTimeout = false;
    const timeoutHandle = window.setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, ColyseusTransport.FETCH_TIMEOUT_MS);

    const externalSignal = init.signal;
    const abortFromExternalSignal = (): void => {
      timeoutController.abort();
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        timeoutController.abort();
      } else {
        externalSignal.addEventListener("abort", abortFromExternalSignal, {
          once: true,
        });
      }
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: timeoutController.signal,
      });
      const bodyText = await response.text();
      let parsedBody: unknown = null;
      if (bodyText.length > 0) {
        try {
          parsedBody = JSON.parse(bodyText) as unknown;
        } catch {
          parsedBody = null;
        }
      }

      if (!response.ok) {
        const payload =
          typeof parsedBody === "object" && parsedBody !== null
            ? (parsedBody as Record<string, unknown>)
            : null;
        const code =
          typeof payload?.error === "string"
            ? payload.error
            : "HTTP_" + response.status.toString();
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : response.statusText || "Request failed";
        throw new HttpRequestError(response.status, code, message);
      }

      if (parsedBody === null) {
        throw new Error("Invalid JSON response");
      }

      return parsedBody as T;
    } catch (error) {
      if (didTimeout) {
        throw new HttpRequestError(
          408,
          "REQUEST_TIMEOUT",
          "Request timed out",
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  private readInjectedPlayerName(): string | null {
    const name = (window as unknown as { __PLAYER_NAME__?: string })
      .__PLAYER_NAME__;
    if (typeof name !== "string") return null;
    const normalized = name.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private shareRoomCode(code: string | null): void {
    const win = window as unknown as {
      shareRoomCode?: (code: string | null) => void;
    };
    if (typeof win.shareRoomCode === "function") {
      win.shareRoomCode(code);
    }
  }
}
