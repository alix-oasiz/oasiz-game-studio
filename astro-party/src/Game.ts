import { Renderer } from "./systems/rendering/Renderer";
import { InputManager } from "./systems/input/Input";
import { MultiInputManager } from "./systems/input/MultiInputManager";
import { NetworkManager, type PlayerMetaMap } from "./network/NetworkManager";
import { PlayerManager } from "./managers/PlayerManager";
import { GameFlowManager } from "./managers/GameFlowManager";
import { BotManager } from "./managers/BotManager";
import { GameRenderer } from "./systems/rendering/GameRenderer";
import { NetworkSyncSystem } from "./network/NetworkSyncSystem";
import type {
  RenderNetworkState,
  NetworkPredictionDebugTelemetry,
} from "./network/NetworkSyncSystem";
import { PlayerInputResolver } from "./systems/input/PlayerInputResolver";
import { DeterministicRNGManager } from "./systems/DeterministicRNGManager";
import { AdaptiveCameraController } from "./systems/camera/AdaptiveCameraController";
import { AudioManager } from "./AudioManager";
import { SettingsManager } from "./SettingsManager";
import { NETWORK_GAME_FEEL_TUNING } from "./network/gameFeel/NetworkGameFeelTuning";
import {
  GamePhase,
  GameMode,
  BaseGameMode,
  MapId,
  PlayerData,
  PlayerInput,
  PlayerPowerUp,
  PowerUpType,
  RoundResultPayload,
  AdvancedSettings,
  AdvancedSettingsSync,
  DEFAULT_ADVANCED_SETTINGS,
} from "./types";
import {
  applyModeTemplate,
  isCustomComparedToTemplate,
  sanitizeAdvancedSettings,
} from "./advancedSettings";
import {
  isScoreSubmissionEligibleBotType,
  shouldSubmitScoreToPlatform,
} from "../shared/sim/scoring.js";
import { isClientDebugToolsRequested } from "./debug/debugTools";

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private network: NetworkManager;
  private multiInput: MultiInputManager | null = null;
  private rngManager: DeterministicRNGManager;
  private rngSeed: number | null = null;
  private pendingRngSeed: number | null = null;

  private playerMgr: PlayerManager;
  private flowMgr: GameFlowManager;
  private botMgr: BotManager;
  private gameRenderer: GameRenderer;
  private networkSync: NetworkSyncSystem;
  private inputResolver: PlayerInputResolver;
  private adaptiveCamera = new AdaptiveCameraController();

  private playerPowerUps: Map<string, PlayerPowerUp | null> = new Map();
  private nitroColorIndex: number = 0;

  private lastTime: number = 0;
  private latencyMs: number = 0;
  private wasLocalFireHeld = false;
  private lastPredictedFireAtMs = 0;
  private lastPredictedDashAtMs = 0;
  private resizeListenerAttached = false;
  private readonly resizeHandler = (): void => {
    this.renderer.resize();
  };
  private controlledInputSequenceByPlayer = new Map<string, number>();
  private isIntentionalDisconnect = false;

  private _originalHostLeft = false;

  private roundResult: RoundResultPayload | null = null;
  private finalScoreSubmittedForMatch = false;
  private lobbyHasEligibleScoreBot = false;
  private readonly debugToolsRequested = isClientDebugToolsRequested();
  private debugToolsEnabledForRoom = false;
  private debugSessionTainted = false;
  private devKeyInputRequestedByUI = false;
  private advancedSettings: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
  };
  private currentMode: GameMode = "STANDARD";
  private baseMode: BaseGameMode = "STANDARD";
  private selectedMapId: MapId = 0;
  private showMapElements = false;

  static SHOW_PING = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.multiInput = new MultiInputManager();
    this.rngManager = new DeterministicRNGManager();
    this.renderer.setVisualRng(this.rngManager.getVisualRng());

    this.playerMgr = new PlayerManager(this.network);
    this.flowMgr = new GameFlowManager(this.network);
    this.botMgr = new BotManager(this.network, this.multiInput);

    this.gameRenderer = new GameRenderer(this.renderer);
    this.networkSync = new NetworkSyncSystem(
      this.network,
      this.renderer,
      this.playerMgr,
      this.playerPowerUps,
      () => this.emitPlayersUpdate(),
    );
    this.inputResolver = new PlayerInputResolver(
      this.network,
      this.input,
      this.multiInput,
    );

    this.flowMgr.onPlayersUpdate = () => this.emitPlayersUpdate();
    this.flowMgr.onBeginMatch = () => {
      if (this.network.isSimulationAuthority()) {
        this.seedRngForRound();
      }
    };
    this.flowMgr.onRoundResult = (payload) => {
      this.applyRoundResult(payload);
    };
    this.flowMgr.onResetRound = () => {
      this.resetForNextRound();
    };

    this.input.setup();

    this.input.setDevModeCallback((enabled) => {
      this.renderer.setDevMode(enabled);
      if (this.isLeader()) {
        this.network.broadcastDevMode(enabled);
      }
    });
  }

  setUICallbacks(callbacks: {
    onPhaseChange: (phase: GamePhase) => void;
    onPlayersUpdate: (players: PlayerData[]) => void;
    onCountdownUpdate: (count: number) => void;
    onGameModeChange?: (mode: GameMode) => void;
    onRoundResult?: (payload: RoundResultPayload) => void;
    onAdvancedSettingsChange?: (settings: AdvancedSettings) => void;
    onSystemMessage?: (message: string, durationMs?: number) => void;
    onMapChange?: (mapId: MapId) => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
    this._onAdvancedSettingsChange = callbacks.onAdvancedSettingsChange ?? null;
    this._onSystemMessage = callbacks.onSystemMessage ?? null;
    this._onMapChange = callbacks.onMapChange ?? null;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private _onGameModeChange: ((mode: GameMode) => void) | null = null;
  private _onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  private _onAdvancedSettingsChange:
    | ((settings: AdvancedSettings) => void)
    | null = null;
  private _onSystemMessage:
    | ((message: string, durationMs?: number) => void)
    | null = null;
  private _onMapChange: ((mapId: MapId) => void) | null = null;
  private lastTransportErrorCode: string | null = null;
  private lastTransportErrorMessage: string | null = null;

  private emitPlayersUpdate(): void {
    this._onPlayersUpdate?.(this.getPlayers());
  }

  async createRoom(): Promise<string> {
    this.registerNetworkCallbacks();
    const code = await this.network.createRoom();
    this.initializeNetworkSession();
    return code;
  }

  async joinRoom(code: string): Promise<boolean> {
    this.registerNetworkCallbacks();
    this.lastTransportErrorCode = null;
    this.lastTransportErrorMessage = null;
    const success = await this.network.joinRoom(code);
    if (success) {
      this.initializeNetworkSession();
    }
    return success;
  }

  private registerNetworkCallbacks(): void {
    this.network.setCallbacks({
      onPlayerJoined: (playerId, playerIndex) => {
        this.playerMgr.addPlayer(
          playerId,
          playerIndex,
          this.flowMgr.phase,
          () => this.emitPlayersUpdate(),
          () => this.flowMgr.startCountdown(),
        );
        if (this.isLeader()) {
          this.broadcastModeState();
        }
      },

      onPlayerLeft: (playerId) => {
        this.playerPowerUps.delete(playerId);
        this.controlledInputSequenceByPlayer.delete(playerId);
        this.playerMgr.removePlayer(playerId, () => this.emitPlayersUpdate());

        if (
          this.network.isSimulationAuthority() &&
          this.flowMgr.phase === "COUNTDOWN" &&
          this.playerMgr.players.size < 2
        ) {
          console.log(
            "[Game] Not enough players during countdown, returning to lobby",
          );
          if (this.flowMgr.countdownInterval) {
            clearInterval(this.flowMgr.countdownInterval);
            this.flowMgr.countdownInterval = null;
          }
          this.flowMgr.setPhase("LOBBY");
        }
      },

      onGameStateReceived: (state) => {
        if (!this.network.isSimulationAuthority()) {
          if (this.flowMgr.phase !== "PLAYING") {
            return;
          }
          this.networkSync.applyNetworkState(state);
        }
      },

      onInputReceived: () => {
        // No client-side gameplay simulation in this runtime path.
      },

      onRNGSeedReceived: (baseSeed) => {
        this.applyRngSeed(baseSeed);
      },

      onHostChanged: () => {
        console.log("[Game] Room leader changed");
        this._onSystemMessage?.("Room leader updated", 2500);
        this.emitPlayersUpdate();
      },

      onDisconnected: () => {
        if (this.isIntentionalDisconnect) {
          return;
        }
        console.log("[Game] Disconnected from room");
        this.handleDisconnected();
      },

      onGamePhaseReceived: (phase, winnerId, winnerName) => {
        console.log("[Game] Phase received:", phase);
        if (!this.network.isSimulationAuthority()) {
          const oldPhase = this.flowMgr.phase;
          if (oldPhase === phase) {
            return;
          }
          const shouldForceRosterSync =
            phase === "COUNTDOWN" || phase === "PLAYING";
          this.network.resyncPlayerListFromState(
            "state-phase-" + phase.toLowerCase(),
            shouldForceRosterSync,
          );
          this.flowMgr.phase = phase;

          if (phase === "GAME_END") {
            const resolvedWinnerId = winnerId ?? this.roundResult?.winnerId;
            const resolvedWinnerName =
              winnerName ?? this.roundResult?.winnerName;
            if (resolvedWinnerId && resolvedWinnerName) {
              this.flowMgr.winnerId = resolvedWinnerId;
              this.flowMgr.winnerName = resolvedWinnerName;
              this.emitPlayersUpdate();
            }
            this.submitFinalScoreFromAuthoritativeState();
          }

          if (phase === "LOBBY" && oldPhase !== "LOBBY") {
            this.flowMgr.winnerId = null;
            this.flowMgr.winnerName = null;
            this.lobbyHasEligibleScoreBot = false;
            this.clearAllGameState();
          }

          if (
            phase === "COUNTDOWN" &&
            (oldPhase === "ROUND_END" || oldPhase === "LOBBY")
          ) {
            console.log(
              "[Game] Non-host: new round starting, clearing old state",
            );
            this.finalScoreSubmittedForMatch = false;
            this.resetForNextRound();
            this.networkSync.clearNetworkEntities();
            this.roundResult = null;
          }

          this.refreshLobbyScoreEligibilityFromRoster();

          this.flowMgr.onPhaseChange?.(phase);
        }
      },

      onCountdownReceived: (count) => {
        if (!this.network.isSimulationAuthority()) {
          this.flowMgr.countdown = count;
          this.flowMgr.onCountdownUpdate?.(count);
        }
      },

      onGameSoundReceived: (type, playerId) => {
        if (this.shouldSuppressAuthoritativeSound(type, playerId)) {
          return;
        }
        this.playGameSoundLocal(type);
      },

      onDashRequested: () => {
        // No client-side gameplay simulation in this runtime path.
      },

      onPingReceived: (latencyMs) => {
        this.latencyMs = latencyMs;
      },

      onPlayerListReceived: (playerOrder, meta) => {
        if (!this.network.isSimulationAuthority()) {
          this.playerMgr.rebuildPlayersFromOrder(playerOrder, () =>
            this.emitPlayersUpdate(),
          );
          this.syncPlayersFromMeta(meta);
          this.refreshLobbyScoreEligibilityFromRoster();
          if (this.flowMgr.phase === "GAME_END") {
            this.submitFinalScoreFromAuthoritativeState();
          }
        }
      },

      onRoundResultReceived: (payload) => {
        if (!this.network.isSimulationAuthority()) {
          this.applyRoundResult(payload);
          if (this.flowMgr.phase === "GAME_END") {
            this.submitFinalScoreFromAuthoritativeState();
          }
        }
      },

      onDevModeReceived: (enabled) => {
        this.setDevModeFromNetwork(enabled);
      },

      onDebugStateReceived: ({ enabled, tainted }) => {
        this.applyDebugStateFromNetwork(enabled, tainted);
      },

      onAdvancedSettingsReceived: (payload) => {
        this.applyModeStateFromNetwork(payload);
      },

      onMapIdReceived: (mapId) => {
        const nextMapId = mapId as MapId;
        if (nextMapId === this.selectedMapId) return;
        console.log(
          "[Game] Received map update from network. prev=" +
            this.selectedMapId.toString() +
            ", next=" +
            nextMapId.toString(),
        );
        this.selectedMapId = nextMapId;
        this._onMapChange?.(nextMapId);
      },

      onScreenShakeReceived: (intensity, duration) => {
        if (this.network.isSimulationAuthority()) return;
        this.triggerScreenShake(intensity, duration);
      },

      onDashParticlesReceived: (payload) => {
        if (this.shouldSuppressLocalDashParticles(payload.playerId)) {
          return;
        }
        this.renderer.spawnDashParticles(
          payload.x,
          payload.y,
          payload.angle,
          payload.color,
        );
      },

      onAsteroidCollidersReceived: (payload) => {
        if (this.network.isSimulationAuthority()) return;
        this.networkSync.applyAsteroidColliders(payload);
      },

      onTransportError: (code, message) => {
        this.lastTransportErrorCode = code;
        this.lastTransportErrorMessage = message;
        if (code === "LOCAL_PLAYER_UNSUPPORTED") {
          this._onSystemMessage?.(
            "Local players are deferred in this version",
            3500,
          );
          return;
        }
        if (code === "LOCAL_JOIN_UNSUPPORTED") {
          this._onSystemMessage?.(
            "Join is only available for online rooms",
            3000,
          );
          return;
        }
        if (code === "DEBUG_TOOLS_DISABLED") {
          this._onSystemMessage?.(
            "Debug tools are disabled for this room",
            3500,
          );
          return;
        }
        if (code === "INVALID_CODE") {
          this._onSystemMessage?.("Enter a valid room code", 3000);
          return;
        }
        if (code === "NOT_FOUND") {
          this._onSystemMessage?.("Room not found", 3000);
          return;
        }
        if (code === "ROOM_FULL") {
          this._onSystemMessage?.("Room is full", 3000);
          return;
        }
        if (code === "MATCH_IN_PROGRESS") {
          this._onSystemMessage?.("Match already in progress", 3000);
          return;
        }
        if (code === "LEADER_ONLY") {
          this._onSystemMessage?.("Only the room leader can do that", 2500);
          return;
        }
        this._onSystemMessage?.(message || "Network error", 3500);
      },
    });
  }

  private applyModeStateFromNetwork(payload: AdvancedSettingsSync): void {
    const sanitized = sanitizeAdvancedSettings(payload.settings);
    this.baseMode = payload.baseMode;
    this.currentMode = payload.mode;
    this.advancedSettings = sanitized;
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(sanitized);
  }

  private initializeNetworkSession(): void {
    this.network.startSync();
    this.finalScoreSubmittedForMatch = false;
    this.lobbyHasEligibleScoreBot = false;
    this.debugToolsEnabledForRoom =
      this.network.getTransportMode() === "local"
        ? this.debugToolsRequested
        : false;
    this.debugSessionTainted = false;
    this.applyDevKeyInputGate();
    if (!this.network.isSimulationAuthority()) {
      this.network.resyncPlayerListFromState("session-init", true);
    }

    this.input.setDashCallback(() => {
      this.handleLocalDash();
    });
    this.wasLocalFireHeld = false;
    this.lastPredictedFireAtMs = 0;
    this.lastPredictedDashAtMs = 0;
    this.controlledInputSequenceByPlayer.clear();

    this.flowMgr.setPhase("LOBBY");
  }

  private handleLocalDash(): void {
    if (this.network.isSimulationAuthority()) {
      return;
    }

    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    if (!this.canRunLocalShipAction(myPlayerId)) return;

    if (this.network.getTransportMode() !== "online") {
      this.network.sendDashRequest();
      return;
    }

    if (NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.dash) {
      this.networkSync.triggerLocalDashPrediction(myPlayerId);
      AudioManager.playDash();
      SettingsManager.triggerHaptic("medium");
      this.lastPredictedDashAtMs = performance.now();
    }
    this.network.sendDashRequest();
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.renderer.addScreenShake(intensity, duration);
    if (this.network.isSimulationAuthority()) {
      this.network.broadcastScreenShake(intensity, duration);
    }
  }

  private handleDisconnected(): void {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.finalScoreSubmittedForMatch = false;
    this.lobbyHasEligibleScoreBot = false;
    this.debugToolsEnabledForRoom = false;
    this.debugSessionTainted = false;
    this.applyDevKeyInputGate();
    this.resetAdvancedSettings();
    this.selectedMapId = 0;
    this.flowMgr.setPhase("START");
  }

  private clearEntities(): void {
    this.renderer.clearEffects();
    this.playerPowerUps.clear();
    this.roundResult = null;
  }

  private clearAllGameState(): void {
    this.clearEntities();
    this.networkSync.clear();
    this.adaptiveCamera.reset();
    this.renderer.resetCamera();
    this.wasLocalFireHeld = false;
    this.lastPredictedFireAtMs = 0;
    this.lastPredictedDashAtMs = 0;
    this.controlledInputSequenceByPlayer.clear();
  }

  private seedRngForRound(): void {
    if (!this.network.isSimulationAuthority()) return;
    const seed = this.pendingRngSeed ?? this.generateSeed();
    this.pendingRngSeed = null;
    this.network.broadcastRNGSeed(seed);
    this.applyRngSeed(seed);
  }

  private applyRngSeed(baseSeed: number): void {
    this.rngSeed = baseSeed;
    this.rngManager.initializeFromSeed(baseSeed);
    console.log(
      "[Game.applyRngSeed]",
      "Seeded RNG with " + baseSeed.toString(),
    );
  }

  private generateSeed(): number {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] >>> 0;
    }
    return Date.now() >>> 0;
  }

  getRngSeed(): number | null {
    return this.rngSeed;
  }

  setNextRngSeed(seed: number | null): void {
    if (!this.network.isSimulationAuthority()) {
      console.log(
        "[Game.setNextRngSeed] Only simulation authority can set seed",
      );
      return;
    }

    if (seed === null || !Number.isFinite(seed)) {
      this.pendingRngSeed = null;
      console.log("[Game.setNextRngSeed] Cleared pending seed");
      return;
    }

    const normalized = Math.floor(seed) >>> 0;
    this.pendingRngSeed = normalized;
    console.log("[Game.setNextRngSeed] Next seed set to " + normalized);
  }

  private resetAdvancedSettings(): void {
    this.baseMode = "STANDARD";
    this.currentMode = "STANDARD";
    this.advancedSettings = applyModeTemplate(this.baseMode);
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(this.advancedSettings);
  }

  private resetForNextRound(): void {
    this.clearEntities();
    this.networkSync.clearClientTracking();
    this.adaptiveCamera.reset();
    this.renderer.resetCamera();
    this.wasLocalFireHeld = false;
    this.lastPredictedFireAtMs = 0;
    this.lastPredictedDashAtMs = 0;
  }

  start(): void {
    this.resizeHandler();
    this.renderer.initStars();

    if (!this.resizeListenerAttached) {
      window.addEventListener("resize", this.resizeHandler);
      this.resizeListenerAttached = true;
    }

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  handleResize(): void {
    this.resizeHandler();
  }

  private loop(timestamp: number): void {
    const frameDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    const now = performance.now();
    const localInput = this.inputResolver.captureLocalInput(
      now,
      this.botMgr.useTouchForHost,
    );
    this.networkSync.captureLocalInput(localInput);
    const sentInput = this.inputResolver.sendLocalInputIfNeeded(
      now,
      this.flowMgr.phase,
    );
    if (sentInput) {
      this.networkSync.recordSentInput(sentInput);
    }
    this.consumeHostTouchDash();
    this.maybeRunPredictedLocalFire(localInput, now);
    this.sendLocalControlledInputs(now);

    const frameRenderState = this.networkSync.getRenderState(
      this.network.getMyPlayerId(),
      this.latencyMs,
    );

    if (this.flowMgr.phase === "PLAYING") {
      this.processDevPowerUpRequests();
      this.updateVisualEffects(frameRenderState);
    }

    this.renderer.updateParticles(frameDt);
    this.renderer.updateScreenShake(frameDt);
    this.render(frameDt, frameRenderState);

    requestAnimationFrame((t) => this.loop(t));
  }

  private processDevPowerUpRequests(): void {
    if (!this.canUseDebugToolsInCurrentSession()) return;
    const devKeys = this.input.consumeDevKeys();
    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;

    if (devKeys.laser) this.network.requestDevPowerUp("LASER");
    if (devKeys.shield) this.network.requestDevPowerUp("SHIELD");
    if (devKeys.scatter) this.network.requestDevPowerUp("SCATTER");
    if (devKeys.mine) this.network.requestDevPowerUp("MINE");
    if (devKeys.joust) this.network.requestDevPowerUp("JOUST");
    if (devKeys.homing) this.network.requestDevPowerUp("HOMING_MISSILE");
    if (devKeys.reverse) this.network.requestDevPowerUp("REVERSE");
    if (devKeys.spawnPowerUp) this.network.requestDevPowerUp("SPAWN_RANDOM");
  }

  private consumeHostTouchDash(): void {
    if (!this.botMgr.useTouchForHost) return;
    if (!this.multiInput?.consumeDash(0)) return;

    if (
      this.flowMgr.phase !== "COUNTDOWN" &&
      this.flowMgr.phase !== "PLAYING"
    ) {
      return;
    }

    this.handleLocalDash();
  }

  private sendLocalControlledInputs(nowMs: number): void {
    if (!this.supportsLocalPlayers()) return;
    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;

    for (const [playerId] of this.playerMgr.players) {
      if (playerId === myPlayerId) continue;
      if (this.network.getPlayerBotType(playerId) !== "local") continue;

      const keySlot = this.network.getPlayerKeySlot(playerId);
      if (keySlot < 0) continue;

      const input: PlayerInput = this.multiInput?.capture(keySlot) ?? {
        buttonA: false,
        buttonB: false,
        timestamp: nowMs,
        clientTimeMs: nowMs,
        inputSequence: 0,
      };
      const nextInputSequence =
        (this.controlledInputSequenceByPlayer.get(playerId) ?? 0) + 1;
      this.controlledInputSequenceByPlayer.set(playerId, nextInputSequence);

      this.network.sendInput(
        {
          ...input,
          timestamp: nowMs,
          clientTimeMs: nowMs,
          inputSequence: nextInputSequence,
        },
        playerId,
      );

      if (this.multiInput?.consumeDash(keySlot)) {
        this.network.sendDashRequest(playerId);
      }
    }
  }

  private maybeRunPredictedLocalFire(input: PlayerInput, nowMs: number): void {
    if (this.network.isSimulationAuthority()) {
      this.wasLocalFireHeld = input.buttonB;
      return;
    }
    if (this.network.getTransportMode() !== "online") {
      this.wasLocalFireHeld = input.buttonB;
      return;
    }
    if (this.flowMgr.phase !== "PLAYING") {
      this.wasLocalFireHeld = input.buttonB;
      return;
    }

    const firePressed = input.buttonB && !this.wasLocalFireHeld;
    this.wasLocalFireHeld = input.buttonB;
    if (!firePressed) return;

    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    if (!this.canRunLocalShipAction(myPlayerId)) return;
    if (!NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.fire) return;

    this.networkSync.triggerLocalFirePrediction(myPlayerId);
    AudioManager.playFire();
    SettingsManager.triggerHaptic("light");
    this.lastPredictedFireAtMs = nowMs;
  }

  private shouldSuppressAuthoritativeSound(
    type: string,
    playerId: string,
  ): boolean {
    if (this.network.isSimulationAuthority()) return false;
    if (this.network.getTransportMode() !== "online") return false;
    if (
      !NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.fire &&
      !NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.dash
    ) {
      return false;
    }
    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId || playerId !== myPlayerId) return false;

    const nowMs = performance.now();
    const suppression =
      NETWORK_GAME_FEEL_TUNING.localAuthoritativeSoundSuppressionMs;
    if (
      type === "fire" &&
      nowMs - this.lastPredictedFireAtMs <= suppression.fire
    ) {
      return true;
    }
    if (
      type === "dash" &&
      nowMs - this.lastPredictedDashAtMs <= suppression.dash
    ) {
      return true;
    }
    return false;
  }

  private canRunLocalShipAction(playerId: string): boolean {
    const localPlayer = this.playerMgr.players.get(playerId);
    if (!localPlayer) return false;
    if (localPlayer.state !== "ACTIVE") return false;
    if (!this.networkSync.isShipAlive(playerId)) return false;
    return true;
  }

  private shouldSuppressLocalDashParticles(playerId: string): boolean {
    if (!NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.dash)
      return false;
    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId || playerId !== myPlayerId) return false;
    return performance.now() - this.lastPredictedDashAtMs <= 300;
  }

  private playGameSoundLocal(type: string): void {
    switch (type) {
      case "fire":
        AudioManager.playFire();
        break;
      case "dash":
        AudioManager.playDash();
        break;
      case "explosion":
        AudioManager.playExplosion();
        AudioManager.playPilotEject();
        break;
      case "kill":
        AudioManager.playKill();
        AudioManager.playPilotDeath();
        break;
      case "respawn":
        AudioManager.playRespawn();
        break;
      case "win":
        AudioManager.playWin();
        break;
      default:
        break;
    }
  }

  private applyRoundResult(payload: RoundResultPayload): void {
    this.roundResult = payload;
    if (payload.winnerId && payload.winnerName) {
      this.flowMgr.winnerId = payload.winnerId;
      this.flowMgr.winnerName = payload.winnerName;
    }
    Object.entries(payload.roundWinsById).forEach(([playerId, wins]) => {
      const player = this.playerMgr.players.get(playerId);
      if (player) {
        player.roundWins = wins;
      }
    });
    Object.entries(payload.scoresById ?? {}).forEach(([playerId, score]) => {
      const player = this.playerMgr.players.get(playerId);
      if (player && Number.isFinite(score)) {
        player.score = score;
      }
    });
    this.emitPlayersUpdate();
    this._onRoundResult?.(payload);
  }

  private syncPlayersFromMeta(meta?: PlayerMetaMap): void {
    if (!meta) return;
    let changed = false;
    for (const [playerId, player] of this.playerMgr.players) {
      const networkMeta = meta.get(playerId);
      if (!networkMeta) continue;

      if (
        Number.isFinite(networkMeta.kills) &&
        networkMeta.kills !== player.kills
      ) {
        player.kills = networkMeta.kills as number;
        changed = true;
      }
      if (
        Number.isFinite(networkMeta.roundWins) &&
        networkMeta.roundWins !== player.roundWins
      ) {
        player.roundWins = networkMeta.roundWins as number;
        changed = true;
      }
      if (
        Number.isFinite(networkMeta.score) &&
        networkMeta.score !== player.score
      ) {
        player.score = networkMeta.score as number;
        changed = true;
      }
      if (networkMeta.playerState && networkMeta.playerState !== player.state) {
        player.state = networkMeta.playerState;
        changed = true;
      }
    }
    if (changed) {
      this.emitPlayersUpdate();
    }
  }

  private refreshLobbyScoreEligibilityFromRoster(): void {
    if (this.flowMgr.phase !== "LOBBY" && this.flowMgr.phase !== "COUNTDOWN") {
      return;
    }

    if (this.hasEligibleScoreBotInCurrentRoster()) {
      this.lobbyHasEligibleScoreBot = true;
    }
  }

  private hasEligibleScoreBotInCurrentRoster(): boolean {
    const playerIds = this.network.getPlayerIds();
    return playerIds.some((playerId) => {
      if (!this.network.isPlayerBot(playerId)) return false;
      return isScoreSubmissionEligibleBotType(
        this.network.getPlayerBotType(playerId),
      );
    });
  }

  private updateVisualEffects(renderState: RenderNetworkState): void {
    renderState.networkShips.forEach((shipState) => {
      const joustPowerUp = this.playerPowerUps.get(shipState.playerId);
      if (joustPowerUp?.type === "JOUST") {
        const shipAngle = shipState.angle;
        const tailX = shipState.x - Math.cos(shipAngle) * 18;
        const tailY = shipState.y - Math.sin(shipAngle) * 18;
        const color = this.nitroColorIndex++ % 5 < 3 ? "#ff6600" : "#ffee00";
        this.renderer.spawnNitroParticle(tailX, tailY, color);
      }
    });
  }

  private collectAdaptiveCameraAnchors(
    renderState: RenderNetworkState,
  ): Array<{ x: number; y: number }> {
    const aliveShips = new Map<string, { x: number; y: number }>();
    for (const ship of renderState.networkShips) {
      if (!ship.alive) continue;
      aliveShips.set(ship.playerId, { x: ship.x, y: ship.y });
    }

    const alivePilots = new Map<string, { x: number; y: number }>();
    for (const pilot of renderState.networkPilots) {
      if (!pilot.alive) continue;
      alivePilots.set(pilot.playerId, { x: pilot.x, y: pilot.y });
    }

    const anchors: Array<{ x: number; y: number }> = [];
    for (const [playerId] of this.playerMgr.players) {
      const ship = aliveShips.get(playerId);
      if (ship) {
        anchors.push(ship);
        continue;
      }
      const pilot = alivePilots.get(playerId);
      if (pilot) {
        anchors.push(pilot);
      }
    }

    if (anchors.length > 0) {
      return anchors;
    }

    for (const ship of renderState.networkShips) {
      if (ship.alive) {
        anchors.push({ x: ship.x, y: ship.y });
      }
    }
    if (anchors.length > 0) {
      return anchors;
    }

    for (const pilot of renderState.networkPilots) {
      if (pilot.alive) {
        anchors.push({ x: pilot.x, y: pilot.y });
      }
    }
    return anchors;
  }

  private render(dt: number, renderState: RenderNetworkState): void {
    if (
      !this.network.isSimulationAuthority() &&
      this.flowMgr.phase === "PLAYING" &&
      this.selectedMapId !== renderState.networkMapId
    ) {
      console.log(
        "[Game] Syncing map from gameplay snapshot. prev=" +
          this.selectedMapId.toString() +
          ", snapshot=" +
          renderState.networkMapId.toString(),
      );
      this.selectedMapId = renderState.networkMapId;
      this._onMapChange?.(this.selectedMapId);
    }

    const adaptiveCameraState = this.adaptiveCamera.update({
      dt,
      nowMs: this.networkSync.hostSimTimeMs,
      phase: this.flowMgr.phase,
      anchors: this.collectAdaptiveCameraAnchors(renderState),
    });
    this.renderer.setCamera(
      adaptiveCameraState.zoom,
      adaptiveCameraState.focusX,
      adaptiveCameraState.focusY,
    );

    this.gameRenderer.render({
      dt,
      nowMs: this.networkSync.hostSimTimeMs,
      phase: this.flowMgr.phase,
      countdown: this.flowMgr.countdown,
      showMapElements: this.showMapElements,
      isDevModeEnabled: this.isDevModeEnabled(),
      playerPowerUps: this.playerPowerUps,
      players: this.playerMgr.players,
      networkShips: renderState.networkShips,
      networkPilots: renderState.networkPilots,
      networkProjectiles: renderState.networkProjectiles,
      networkAsteroids: renderState.networkAsteroids,
      networkPowerUps: renderState.networkPowerUps,
      networkLaserBeams: renderState.networkLaserBeams,
      networkMines: renderState.networkMines,
      networkHomingMissiles: renderState.networkHomingMissiles,
      networkTurret: renderState.networkTurret,
      networkTurretBullets: renderState.networkTurretBullets,
      mapId: this.selectedMapId,
      yellowBlockHp: renderState.networkYellowBlockHp,
    });
  }

  getPhase(): GamePhase {
    return this.flowMgr.phase;
  }

  getPlayers(): PlayerData[] {
    return this.playerMgr.getPlayers();
  }

  getWinnerId(): string | null {
    return this.flowMgr.winnerId;
  }

  getWinnerName(): string | null {
    return this.flowMgr.winnerName;
  }

  getRoomCode(): string {
    return this.network.getRoomCode();
  }

  isLeader(): boolean {
    return this.network.isHost();
  }

  isHost(): boolean {
    return this.isLeader();
  }

  didHostLeave(): boolean {
    return this._originalHostLeft;
  }

  getMyPlayerId(): string | null {
    return this.network.getMyPlayerId();
  }

  getPlayerCount(): number {
    return this.network.getPlayerCount();
  }

  canStartGame(): boolean {
    return this.isLeader() && this.network.getPlayerCount() >= 2;
  }

  getLatencyMs(): number {
    return this.latencyMs;
  }

  getNetworkTelemetry(): {
    latencyMs: number;
    jitterMs: number;
    snapshotAgeMs: number;
    snapshotIntervalMs: number;
    webrtcConnected: boolean;
  } {
    const telemetry = this.networkSync.getSnapshotTelemetry();
    return {
      latencyMs: this.latencyMs,
      jitterMs: telemetry.jitterMs,
      snapshotAgeMs: telemetry.snapshotAgeMs,
      snapshotIntervalMs: telemetry.snapshotIntervalMs,
      webrtcConnected: this.network.isWebRtcConnected(),
    };
  }

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    return this.networkSync.getPredictionDebugTelemetry();
  }

  getHostId(): string | null {
    return this.network.getHostId();
  }

  getLeaderId(): string | null {
    return this.network.getHostId();
  }

  shouldShowPing(): boolean {
    return Game.SHOW_PING;
  }

  getRoundResult(): RoundResultPayload | null {
    return this.roundResult;
  }

  private broadcastModeState(): void {
    if (!this.isLeader()) return;
    const payload: AdvancedSettingsSync = {
      mode: this.currentMode,
      baseMode: this.baseMode,
      settings: this.advancedSettings,
    };
    this.network.setAdvancedSettings(payload);
  }

  getAdvancedSettings(): AdvancedSettings {
    return { ...this.advancedSettings };
  }

  setAdvancedSettings(
    settings: AdvancedSettings,
    source: "local" | "remote" = "local",
  ): void {
    if (source === "local" && !this.isLeader()) return;
    const sanitized = sanitizeAdvancedSettings(settings);
    this.advancedSettings = sanitized;
    const baseTemplate = applyModeTemplate(this.baseMode);
    const isCustom = isCustomComparedToTemplate(sanitized, baseTemplate);
    const nextMode: GameMode = isCustom ? "CUSTOM" : this.baseMode;
    const modeChanged = nextMode !== this.currentMode;
    this.currentMode = nextMode;
    if (source === "local" && this.isLeader()) {
      this.broadcastModeState();
    }
    if (modeChanged) {
      this._onGameModeChange?.(this.currentMode);
    }
    this._onAdvancedSettingsChange?.(sanitized);
  }

  setGameMode(mode: GameMode, source: "local" | "remote" = "local"): void {
    if (source === "local" && !this.isLeader()) return;
    if (mode === "CUSTOM") {
      this.currentMode = "CUSTOM";
      this._onGameModeChange?.(this.currentMode);
      if (source === "local" && this.isLeader()) {
        this.broadcastModeState();
      }
      return;
    }

    this.baseMode = mode;
    this.currentMode = mode;
    const template = applyModeTemplate(mode);
    template.roundsToWin = this.advancedSettings.roundsToWin;
    this.advancedSettings = sanitizeAdvancedSettings(template);
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(this.advancedSettings);
    if (source === "local" && this.isLeader()) {
      this.network.setMode(mode);
      this.broadcastModeState();
    }
  }

  getGameMode(): GameMode {
    return this.currentMode;
  }

  getBaseMode(): BaseGameMode {
    return this.baseMode;
  }

  setMap(mapId: MapId, source: "local" | "remote" = "local"): void {
    console.log(
      "[Game] setMap requested. source=" +
        source +
        ", mapId=" +
        mapId.toString() +
        ", current=" +
        this.selectedMapId.toString() +
        ", phase=" +
        this.flowMgr.phase +
        ", isLeader=" +
        this.isLeader().toString(),
    );
    if (source === "local" && !this.isLeader()) {
      console.log("[Game] setMap ignored: local player is not leader");
      return;
    }
    if (this.flowMgr.phase !== "LOBBY") {
      console.log("[Game] setMap ignored: phase is not LOBBY");
      return;
    }
    if (this.selectedMapId === mapId) {
      console.log("[Game] setMap ignored: map already selected");
      return;
    }
    this.selectedMapId = mapId;
    if (source === "local" && this.isLeader()) {
      console.log("[Game] setMap sending to network: " + mapId.toString());
      this.network.setMap(mapId);
    }
    console.log("[Game] setMap applied locally: " + mapId.toString());
    this._onMapChange?.(mapId);
  }

  getMapId(): MapId {
    return this.selectedMapId;
  }

  startGame(): void {
    if (!this.isLeader()) {
      console.log("[Game] Non-leader cannot start game");
      return;
    }
    this.refreshLobbyScoreEligibilityFromRoster();
    this.broadcastModeState();
    this.network.setMap(this.selectedMapId);
    this.roundResult = null;
    this.finalScoreSubmittedForMatch = false;
    this.network.startGame();
  }

  async leaveGame(): Promise<void> {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }

    this.isIntentionalDisconnect = true;
    try {
      await this.network.disconnect();
    } finally {
      this.isIntentionalDisconnect = false;
    }

    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.finalScoreSubmittedForMatch = false;
    this.lobbyHasEligibleScoreBot = false;
    this.resetAdvancedSettings();

    this.flowMgr.setPhase("START");
  }

  destroy(): void {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    if (this.resizeListenerAttached) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeListenerAttached = false;
    }
    this.input.destroy();
  }

  async restartGame(): Promise<void> {
    if (!this.isLeader()) {
      console.log("[Game] Non-leader cannot restart game, waiting for leader");
      return;
    }
    this.finalScoreSubmittedForMatch = false;
    this.network.restartGame();
  }

  setPlayerName(name: string): void {
    this.network.setCustomName(name);
  }

  setMapElementsVisible(visible: boolean): void {
    this.showMapElements = visible;
  }

  setSessionMode(mode: "online" | "local"): void {
    this.network.setTransportMode(mode);
    this.debugToolsEnabledForRoom = false;
    this.debugSessionTainted = false;
    this.applyDevKeyInputGate();
  }

  getSessionMode(): "online" | "local" {
    return this.network.getTransportMode();
  }

  isPlayerBot(playerId: string): boolean {
    return this.botMgr.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.botMgr.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.botMgr.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.botMgr.hasRemotePlayers();
  }

  async addAIBot(): Promise<boolean> {
    return this.botMgr.addAIBot(this.flowMgr.phase);
  }

  async addLocalBot(keySlot: number): Promise<boolean> {
    if (!this.supportsLocalPlayers()) {
      this._onSystemMessage?.(
        "Local players are deferred in this version",
        3500,
      );
      return false;
    }
    return this.botMgr.addLocalBot(
      keySlot,
      this.flowMgr.phase,
      this.playerMgr.players,
    );
  }

  async removeBot(playerId: string): Promise<boolean> {
    return this.botMgr.removeBot(playerId);
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!this.isLeader()) {
      console.log("[Game] Only leader can kick players");
      return false;
    }

    const myId = this.network.getMyPlayerId();
    if (myId && playerId === myId) {
      console.log("[Game] Leader cannot kick themselves");
      return false;
    }

    if (this.botMgr.isPlayerBot(playerId)) {
      return this.botMgr.removeBot(playerId);
    }

    return this.network.kickPlayer(playerId);
  }

  getUsedKeySlots(): number[] {
    return this.botMgr.getUsedKeySlots(this.playerMgr.players);
  }

  getLocalPlayerCount(): number {
    if (!this.supportsLocalPlayers()) {
      return 1;
    }
    return this.botMgr.getLocalPlayerCount(this.playerMgr.players);
  }

  getLocalPlayersInfo(): Array<{
    name: string;
    color: string;
    keyPreset: string;
  }> {
    return this.botMgr.getLocalPlayersInfo(this.playerMgr.players);
  }

  hasLocalPlayers(): boolean {
    if (!this.supportsLocalPlayers()) return false;
    return this.botMgr.hasLocalPlayers(this.playerMgr.players);
  }

  supportsLocalPlayers(): boolean {
    return this.network.supportsLocalPlayers();
  }

  setKeyboardInputEnabled(enabled: boolean): void {
    this.input.setKeyboardEnabled(enabled);
    this.multiInput?.setKeyboardEnabled(enabled);
  }

  setAllowAltKeyBindings(allow: boolean): void {
    this.input.setAllowAltKeys(allow);
    this.multiInput?.setAllowAltKeys(allow);
  }

  setDevKeysEnabled(enabled: boolean): void {
    this.devKeyInputRequestedByUI = enabled;
    this.applyDevKeyInputGate();
  }

  toggleDevMode(): boolean {
    const blockedMessage = this.getDebugToolsBlockedMessage();
    if (blockedMessage) {
      this._onSystemMessage?.(blockedMessage, 2500);
      return this.input.isDevModeEnabled();
    }
    const newState = this.input.toggleDevMode();
    this.renderer.setDevMode(newState);

    if (this.isLeader()) {
      this.network.broadcastDevMode(newState);
    }

    return newState;
  }

  isDevModeEnabled(): boolean {
    return this.input.isDevModeEnabled();
  }

  setDevModeFromNetwork(enabled: boolean): void {
    this.renderer.setDevMode(enabled);
    console.log("[Game] Dev mode synced from network:", enabled ? "ON" : "OFF");
  }

  requestDebugPowerUp(type: PowerUpType | "SPAWN_RANDOM"): boolean {
    const blockedMessage = this.getDebugToolsBlockedMessage();
    if (blockedMessage) {
      this._onSystemMessage?.(blockedMessage, 2500);
      return false;
    }
    this.network.requestDevPowerUp(type);
    return true;
  }

  requestDebugEjectPilot(): boolean {
    const blockedMessage = this.getDebugToolsBlockedMessage();
    if (blockedMessage) {
      this._onSystemMessage?.(blockedMessage, 2500);
      return false;
    }
    this.network.requestDevEjectPilot();
    return true;
  }

  getDebugStatus(): {
    buildEnabled: boolean;
    roomEnabled: boolean;
    sessionTainted: boolean;
  } {
    return {
      buildEnabled: this.debugToolsRequested,
      roomEnabled: this.debugToolsEnabledForRoom,
      sessionTainted: this.debugSessionTainted,
    };
  }

  private submitFinalScoreFromAuthoritativeState(): void {
    if (this.network.isSimulationAuthority()) return;
    if (this.finalScoreSubmittedForMatch) return;

    const myId = this.network.getMyPlayerId();
    if (!myId) return;

    const hasEligibleLobbyBot =
      this.lobbyHasEligibleScoreBot ||
      this.hasEligibleScoreBotInCurrentRoster();
    if (
      !shouldSubmitScoreToPlatform(
        hasEligibleLobbyBot,
        this.debugSessionTainted,
      )
    ) {
      if (
        !this.lobbyHasEligibleScoreBot &&
        this.network.getPlayerCount() <= 0
      ) {
        return;
      }
      if (this.debugSessionTainted) {
        console.log("[Game] Score submission skipped: debug-tainted session");
      } else {
        console.log("[Game] Score submission skipped by policy");
      }
      this.finalScoreSubmittedForMatch = true;
      return;
    }

    const resultScore = this.roundResult?.scoresById?.[myId];
    const fallbackScore = this.playerMgr.players.get(myId)?.score;
    const rawScore = Number.isFinite(resultScore) ? resultScore : fallbackScore;

    if (!Number.isFinite(rawScore)) return;
    const score = Math.max(0, Math.floor(rawScore as number));

    if (
      typeof (window as unknown as { submitScore?: (value: number) => void })
        .submitScore === "function"
    ) {
      (
        window as unknown as { submitScore: (value: number) => void }
      ).submitScore(score);
      console.log("[Game] Submitted authoritative final score:", score);
      this.finalScoreSubmittedForMatch = true;
      return;
    }

    this.finalScoreSubmittedForMatch = true;
  }

  updateTouchLayout(): void {
    this.botMgr.updateTouchLayout(this.getPlayers());
  }

  clearTouchLayout(): void {
    this.botMgr.clearTouchLayout();
  }

  consumeLastTransportErrorMessage(): string | null {
    const message = this.lastTransportErrorMessage;
    this.lastTransportErrorCode = null;
    this.lastTransportErrorMessage = null;
    return message;
  }

  private canUseDebugToolsInCurrentSession(): boolean {
    return this.debugToolsRequested && this.debugToolsEnabledForRoom;
  }

  private getDebugToolsBlockedMessage(): string | null {
    if (!this.debugToolsRequested) {
      return "Debug tools are disabled";
    }
    if (!this.debugToolsEnabledForRoom) {
      return "Debug commands are disabled for this room";
    }
    return null;
  }

  private applyDevKeyInputGate(): void {
    this.input.setDevKeysEnabled(
      this.devKeyInputRequestedByUI && this.canUseDebugToolsInCurrentSession(),
    );
  }

  private applyDebugStateFromNetwork(enabled: boolean, tainted: boolean): void {
    this.debugToolsEnabledForRoom = enabled;
    const wasTainted = this.debugSessionTainted;
    this.debugSessionTainted = tainted;
    this.applyDevKeyInputGate();
    if (this.debugSessionTainted && !wasTainted) {
      console.log("[Game] Score submission disabled for debug-tainted session");
    }
  }
}
