import {
  AdvancedSettingsSync,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
  ExperienceContext,
  GamePhase,
  GameMode,
  GameStateSync,
  PlayerData,
  PlayerInput,
  PowerUpType,
  Ruleset,
  RoundResultPayload,
} from "../types";
import { createTransport } from "./transports/createTransport";
import type {
  NetworkCallbacks,
  NetworkPlayerState,
  NetworkTransport,
  PlayerMetaMap,
} from "./transports/NetworkTransport";
import type { TransportMode } from "./transports/createTransport";

export type { PlayerMetaMap } from "./transports/NetworkTransport";

export type PlayroomPlayerState = NetworkPlayerState;

export class NetworkManager {
  private transport: NetworkTransport;
  private transportMode: TransportMode = "online";
  private callbacks: NetworkCallbacks | null = null;

  constructor() {
    this.transport = createTransport(this.transportMode);
  }

  setTransportMode(mode: TransportMode): void {
    if (this.transportMode === mode) return;
    this.transportMode = mode;
    const nextTransport = createTransport(this.transportMode);
    if (this.callbacks) {
      nextTransport.setCallbacks(this.callbacks);
    }
    this.transport = nextTransport;
  }

  getTransportMode(): TransportMode {
    return this.transportMode;
  }

  async createRoom(): Promise<string> {
    return this.transport.createRoom();
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    return this.transport.joinRoom(roomCode);
  }

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
    this.transport.setCallbacks(callbacks);
  }

  startSync(): void {
    this.transport.startSync();
  }

  stopSync(): void {
    this.transport.stopSync();
  }

  sendInput(input: PlayerInput, controlledPlayerId?: string): void {
    this.transport.sendInput(input, controlledPlayerId);
  }

  pollHostInputs(): void {
    this.transport.pollHostInputs();
  }

  broadcastGameState(state: GameStateSync): void {
    this.transport.broadcastGameState(state);
  }

  startGame(): void {
    this.transport.startGame();
  }

  endMatch(): void {
    this.transport.endMatch?.();
  }

  continueMatchSequence(): void {
    this.transport.continueMatchSequence();
  }

  restartGame(): void {
    this.transport.restartGame();
  }

  setMode(mode: GameMode): void {
    this.transport.setMode(mode);
  }

  setRuleset(ruleset: Ruleset): void {
    this.transport.setRuleset?.(ruleset);
  }

  setExperienceContext(context: ExperienceContext): void {
    this.transport.setExperienceContext?.(context);
  }

  setMap(mapId: number): void {
    this.transport.setMap(mapId);
  }

  setAdvancedSettings(payload: AdvancedSettingsSync): void {
    this.transport.setAdvancedSettings(payload);
  }

  setDebugPhysicsTuning(payload: DebugPhysicsTuningPayload | null): void {
    this.transport.setDebugPhysicsTuning(payload);
  }

  getDebugPhysicsTuningSnapshot(): DebugPhysicsTuningSnapshot | null {
    return this.transport.getDebugPhysicsTuningSnapshot();
  }

  broadcastGamePhase(
    phase: GamePhase,
    winnerId?: string,
    winnerName?: string,
  ): void {
    this.transport.broadcastGamePhase(phase, winnerId, winnerName);
  }

  broadcastCountdown(count: number): void {
    this.transport.broadcastCountdown(count);
  }

  broadcastGameSound(type: string, playerId: string): void {
    this.transport.broadcastGameSound(type, playerId);
  }

  broadcastGameSoundToOthers(type: string, playerId: string): void {
    this.transport.broadcastGameSoundToOthers(type, playerId);
  }

  broadcastScreenShake(intensity: number, duration: number): void {
    this.transport.broadcastScreenShake(intensity, duration);
  }

  sendDashRequest(controlledPlayerId?: string): void {
    this.transport.sendDashRequest(controlledPlayerId);
  }

  broadcastDashParticles(
    playerId: string,
    x: number,
    y: number,
    angle: number,
    color: string,
  ): void {
    this.transport.broadcastDashParticles(playerId, x, y, angle, color);
  }

  broadcastRoundResult(payload: RoundResultPayload): void {
    this.transport.broadcastRoundResult(payload);
  }

  broadcastDevMode(enabled: boolean): void {
    this.transport.broadcastDevMode(enabled);
  }

  requestDevPowerUp(type: PowerUpType | "SPAWN_RANDOM"): void {
    this.transport.requestDevPowerUp(type);
  }

  requestDevEjectPilot(): void {
    this.transport.requestDevEjectPilot();
  }

  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void {
    this.transport.broadcastAdvancedSettings(payload);
  }

  broadcastRNGSeed(baseSeed: number): void {
    this.transport.broadcastRNGSeed(baseSeed);
  }

  broadcastPlayerList(): void {
    this.transport.broadcastPlayerList();
  }

  resyncPlayerListFromState(reason: string = "manual", force = false): boolean {
    return this.transport.resyncPlayerListFromState(reason, force);
  }

  async resetAllPlayerStates(): Promise<void> {
    await this.transport.resetAllPlayerStates();
  }

  updateKills(playerId: string, kills: number): void {
    this.transport.updateKills(playerId, kills);
  }

  updateRoundWins(playerId: string, wins: number): void {
    this.transport.updateRoundWins(playerId, wins);
  }

  updatePlayerState(playerId: string, state: PlayerData["state"]): void {
    this.transport.updatePlayerState(playerId, state);
  }

  getMyPlayerId(): string | null {
    return this.transport.getMyPlayerId();
  }

  isHost(): boolean {
    return this.transport.isHost();
  }

  isSimulationAuthority(): boolean {
    return this.transport.isSimulationAuthority();
  }

  isWebRtcConnected(): boolean {
    return this.transport.isWebRtcConnected();
  }

  getRoomCode(): string {
    return this.transport.getRoomCode();
  }

  getPlayerCount(): number {
    return this.transport.getPlayerCount();
  }

  getPlayerIds(): string[] {
    return this.transport.getPlayerIds();
  }

  getPlayerIndex(playerId: string): number {
    return this.transport.getPlayerIndex(playerId);
  }

  getPlayerColor(playerId: string): { primary: string; glow: string } {
    return this.transport.getPlayerColor(playerId);
  }

  getPlayerName(playerId: string): string {
    return this.transport.getPlayerName(playerId);
  }

  getHostId(): string | null {
    return this.transport.getHostId();
  }

  setCustomName(name: string): void {
    this.transport.setCustomName(name);
  }

  setShipSkin(skinId: string): void {
    this.transport.setShipSkin(skinId);
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async addAIBot(): Promise<unknown | null> {
    return this.transport.addAIBot();
  }

  async addLocalBot(keySlot: number): Promise<unknown | null> {
    return this.transport.addLocalBot(keySlot);
  }

  async removeBot(playerId: string): Promise<boolean> {
    return this.transport.removeBot(playerId);
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    return this.transport.kickPlayer(playerId);
  }

  setPlayerAI(sessionId: string, enabled: boolean): void {
    this.transport.setPlayerAI?.(sessionId, enabled);
  }

  skipCountdown(): void {
    this.transport.skipCountdown?.();
  }

  pauseSimulation(paused: boolean): void {
    this.transport.pauseSimulation?.(paused);
  }

  demoFreezeOthers(hostSessionId: string | null): void {
    this.transport.demoFreezeOthers?.(hostSessionId);
  }

  demoRespawnPlayer(playerId: string): void {
    this.transport.demoRespawnPlayer?.(playerId);
  }

  demoCleanupStalePilots(maxAgeMs: number): void {
    this.transport.demoCleanupStalePilots?.(maxAgeMs);
  }

  demoSetPlayerInvincible(playerId: string, durationMs: number): void {
    this.transport.demoSetPlayerInvincible?.(playerId, durationMs);
  }

  setDemoMode(active: boolean): void {
    this.transport.setDemoMode?.(active);
  }

  isPlayerBot(playerId: string): boolean {
    return this.transport.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.transport.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.transport.getPlayerKeySlot(playerId);
  }

  getPlayer(playerId: string): PlayroomPlayerState | undefined {
    return this.transport.getPlayer(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.transport.hasRemotePlayers();
  }

  getBotCount(): number {
    return this.transport.getBotCount();
  }

  supportsLocalPlayers(): boolean {
    return this.transport.supportsLocalPlayers();
  }
}
