import {
  AdvancedSettingsSync,
  AsteroidColliderSync,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
  GamePhase,
  GameMode,
  ExperienceContext,
  GameStateSync,
  PlayerInput,
  PowerUpType,
  Ruleset,
  RoundResultPayload,
} from "../../types";

export interface NetworkPlayerState {
  id: string;
  getState: (key: string) => unknown;
  getProfile: () => { name?: string } | null;
  isBot?: () => boolean;
  bot?: {
    decideAction: (visibleData: unknown) => {
      buttonA: boolean;
      buttonB: boolean;
      dash: boolean;
    };
  };
}

export interface PlayerMeta {
  id: string;
  customName?: string;
  profileName?: string;
  botType?: "ai" | "local";
  shipSkinId?: string;
  colorIndex?: number;
  keySlot?: number;
  kills?: number;
  roundWins?: number;
  score?: number;
  comboMultiplier?: number;
  comboExpiresAtMs?: number;
  playerState?: "ACTIVE" | "EJECTED" | "SPECTATING";
  isBot?: boolean;
}

export type PlayerMetaMap = Map<string, PlayerMeta>;
export type PlayerRemovalReason = "left" | "kicked";

export interface NetworkCallbacks {
  onPlayerJoined: (playerId: string, playerIndex: number) => void;
  onPlayerLeft: (playerId: string, reason: PlayerRemovalReason) => void;
  onGameStateReceived: (state: GameStateSync) => void;
  onInputReceived: (playerId: string, input: PlayerInput) => void;
  onRNGSeedReceived?: (baseSeed: number) => void;
  onHostChanged: () => void;
  onDisconnected: () => void;
  onGamePhaseReceived: (
    phase: GamePhase,
    winnerId?: string,
    winnerName?: string,
  ) => void;
  onCountdownReceived: (count: number) => void;
  onGameSoundReceived: (type: string, playerId: string) => void;
  onDashRequested: (playerId: string) => void;
  onPingReceived: (latencyMs: number) => void;
  onPlayerListReceived: (playerOrder: string[], meta?: PlayerMetaMap) => void;
  onRoundResultReceived: (payload: RoundResultPayload) => void;
  onDevModeReceived: (enabled: boolean) => void;
  onRulesetReceived?: (ruleset: Ruleset) => void;
  onExperienceContextReceived?: (context: ExperienceContext) => void;
  onDebugStateReceived?: (payload: {
    enabled: boolean;
    tainted: boolean;
  }) => void;
  onAdvancedSettingsReceived: (payload: AdvancedSettingsSync) => void;
  onMapIdReceived: (mapId: number) => void;
  onScreenShakeReceived: (intensity: number, duration: number) => void;
  onTransportError?: (code: string, message: string) => void;
  onDashParticlesReceived?: (payload: {
    playerId: string;
    x: number;
    y: number;
    angle: number;
    color: string;
    kind: "ship" | "pilot";
  }) => void;
  onAsteroidCollidersReceived?: (payload: AsteroidColliderSync[]) => void;
}

export interface NetworkTransport {
  setCallbacks(callbacks: NetworkCallbacks): void;
  createRoom(): Promise<string>;
  joinRoom(roomCode: string): Promise<boolean>;
  disconnect(): Promise<void>;

  startSync(): void;
  stopSync(): void;
  sendInput(input: PlayerInput, controlledPlayerId?: string): void;
  pollHostInputs(): void;
  broadcastGameState(state: GameStateSync): void;
  startGame(): void;
  endMatch?(): void;
  continueMatchSequence(): void;
  restartGame(): void;
  setMode(mode: GameMode): void;
  setRuleset?(ruleset: Ruleset): void;
  setExperienceContext?(context: ExperienceContext): void;
  setMap(mapId: number): void;
  setAdvancedSettings(payload: AdvancedSettingsSync): void;
  setDebugPhysicsTuning(payload: DebugPhysicsTuningPayload | null): void;
  getDebugPhysicsTuningSnapshot(): DebugPhysicsTuningSnapshot | null;

  sendDashRequest(controlledPlayerId?: string): void;
  broadcastDashParticles(
    playerId: string,
    x: number,
    y: number,
    angle: number,
    color: string,
  ): void;

  broadcastGamePhase(
    phase: GamePhase,
    winnerId?: string,
    winnerName?: string,
  ): void;
  broadcastCountdown(count: number): void;
  broadcastGameSound(type: string, playerId: string): void;
  broadcastGameSoundToOthers(type: string, playerId: string): void;
  broadcastScreenShake(intensity: number, duration: number): void;
  broadcastRoundResult(payload: RoundResultPayload): void;
  broadcastDevMode(enabled: boolean): void;
  requestDevPowerUp(type: PowerUpType | "SPAWN_RANDOM"): void;
  requestDevEjectPilot(): void;
  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void;
  broadcastRNGSeed(baseSeed: number): void;
  broadcastPlayerList(): void;
  resyncPlayerListFromState(reason?: string, force?: boolean): boolean;
  resetAllPlayerStates(): Promise<void>;
  updateKills(playerId: string, kills: number): void;
  updateRoundWins(playerId: string, wins: number): void;
  updatePlayerState(
    playerId: string,
    state: "ACTIVE" | "EJECTED" | "SPECTATING",
  ): void;

  setCustomName(name: string): void;
  setShipSkin(skinId: string): void;
  addAIBot(): Promise<unknown | null>;
  addLocalBot(keySlot: number): Promise<unknown | null>;
  removeBot(playerId: string): Promise<boolean>;
  kickPlayer(playerId: string): Promise<boolean>;
  setPlayerAI?(sessionId: string, enabled: boolean): void;
  skipCountdown?(): void;
  pauseSimulation?(paused: boolean): void;
  demoRespawnPlayer?(playerId: string): void;
  demoCleanupStalePilots?(maxAgeMs: number): void;
  demoFreezeOthers?(hostSessionId: string | null): void;
  demoSetPlayerInvincible?(playerId: string, durationMs: number): void;
  setDemoMode?(active: boolean): void;

  getMyPlayerId(): string | null;
  isHost(): boolean;
  isWebRtcConnected(): boolean;
  getRoomCode(): string;
  getPlayerCount(): number;
  getPlayerIds(): string[];
  getPlayerIndex(playerId: string): number;
  getPlayerColor(playerId: string): { primary: string; glow: string };
  getPlayerName(playerId: string): string;
  getHostId(): string | null;
  isPlayerBot(playerId: string): boolean;
  getPlayerBotType(playerId: string): "ai" | "local" | null;
  getPlayerKeySlot(playerId: string): number;
  getPlayer(playerId: string): NetworkPlayerState | undefined;
  hasRemotePlayers(): boolean;
  getBotCount(): number;
  isSimulationAuthority(): boolean;
  supportsLocalPlayers(): boolean;
}
