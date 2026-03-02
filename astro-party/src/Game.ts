import {
  Renderer,
  type ShipTrailVisualTuning,
} from "./systems/rendering/Renderer";
import { RenderEffectsSystem } from "./systems/rendering/RenderEffectsSystem";
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
import { NETWORK_GAME_FEEL_TUNING } from "./network/gameFeel/NetworkGameFeelTuning";
import {
  playAuthoritativeGameSound,
  playPredictedDashFeedback,
  playPredictedFireFeedback,
} from "./feedback/gameplayFeedback";
import {
  GamePhase,
  GameMode,
  BaseGameMode,
  Ruleset,
  ExperienceContext,
  MapId,
  PlayerData,
  PlayerInput,
  PlayerPowerUp,
  PowerUpType,
  RoundResultPayload,
  AdvancedSettings,
  AdvancedSettingsSync,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
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
import { getShipTrailWorldPoint } from "../shared/geometry/ShipRenderAnchors";
import { isMapAllowedForContext } from "../shared/sim/maps.js";
import { isClientDebugToolsRequested } from "./debug/debugTools";
import {
  onPause as onPlatformPause,
  onResume as onPlatformResume,
  submitScore as submitPlatformScore,
} from "./platform/oasizBridge";

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
  private effects!: RenderEffectsSystem;
  private inputResolver: PlayerInputResolver;
  private adaptiveCamera = new AdaptiveCameraController();

  private playerPowerUps: Map<string, PlayerPowerUp | null> = new Map();
  private nitroColorIndex: number = 0;

  private lastTime: number = 0;
  private latencyMs: number = 0;
  private wasLocalFireHeld = false;
  private lastPredictedFireAtMs = 0;
  private lastPredictedDashAtMs = 0;
  private rafId = 0;
  private resizeListenerAttached = false;
  private lifecycleHandlersAttached = false;
  private readonly resizeHandler = (): void => {
    this.renderer.resize();
  };
  private readonly visibilityChangeHandler = (): void => {
    if (document.hidden) {
      this.network.pauseSimulation(true);
      this.stopLoop();
      return;
    }
    this.network.pauseSimulation(this.simulationPaused);
    this.startLoop();
  };
  private readonly loopFrame = (timestamp: number): void => {
    this.loop(timestamp);
  };
  private offPlatformPause: (() => void) | null = null;
  private offPlatformResume: (() => void) | null = null;
  private controlledInputSequenceByPlayer = new Map<string, number>();
  private isIntentionalDisconnect = false;

  private _originalHostLeft = false;

  private roundResult: RoundResultPayload | null = null;
  private finalScoreSubmittedForMatch = false;
  private lobbyHasEligibleScoreBot = false;
  private readonly debugToolsRequested = isClientDebugToolsRequested();
  private debugToolsEnabledForRoom = false;
  private debugSessionTainted = false;
  private isDemoSession = false;
  private simulationPaused = false;
  private devKeyInputRequestedByUI = false;
  private advancedSettings: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
  };
  private currentMode: GameMode = "STANDARD";
  private baseMode: BaseGameMode = "STANDARD";
  private currentRuleset: Ruleset = "ROUND_ELIMINATION";
  private currentExperienceContext: ExperienceContext = "LIVE_MATCH";
  private selectedMapId: MapId = 0;
  private showMapElements = true;
  private hideBorder = false;
  private demoZoomBoost: number | null = null;
  private cachedLocalShipWorldPos: { x: number; y: number } | null = null;

  static SHOW_PING = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, {
      onEffectsReady: (effects) => {
        this.effects = effects;
      },
    });
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.multiInput = new MultiInputManager();
    this.rngManager = new DeterministicRNGManager();
    this.renderer.setVisualRng(this.rngManager.getVisualRng());

    this.playerMgr = new PlayerManager(this.network);
    this.flowMgr = new GameFlowManager(this.network);
    this.botMgr = new BotManager(this.network, this.multiInput);

    this.gameRenderer = new GameRenderer(this.renderer, this.effects);
    this.networkSync = new NetworkSyncSystem(
      this.network,
      this.renderer,
      this.effects,
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
    onRulesetChange?: (ruleset: Ruleset) => void;
    onRoundResult?: (payload: RoundResultPayload) => void;
    onAdvancedSettingsChange?: (settings: AdvancedSettings) => void;
    onSystemMessage?: (message: string, durationMs?: number) => void;
    onMapChange?: (mapId: MapId) => void;
    onLocalInputAction?: (action: "rotate" | "fire" | "dash") => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRulesetChange = callbacks.onRulesetChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
    this._onAdvancedSettingsChange = callbacks.onAdvancedSettingsChange ?? null;
    this._onSystemMessage = callbacks.onSystemMessage ?? null;
    this._onMapChange = callbacks.onMapChange ?? null;
    this._onLocalInputAction = callbacks.onLocalInputAction ?? null;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private _onGameModeChange: ((mode: GameMode) => void) | null = null;
  private _onRulesetChange: ((ruleset: Ruleset) => void) | null = null;
  private _onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  private _onAdvancedSettingsChange:
    | ((settings: AdvancedSettings) => void)
    | null = null;
  private _onSystemMessage:
    | ((message: string, durationMs?: number) => void)
    | null = null;
  private _onMapChange: ((mapId: MapId) => void) | null = null;
  private _onLocalInputAction: ((action: "rotate" | "fire" | "dash") => void) | null =
    null;
  private previousLocalInputButtons = { buttonA: false, buttonB: false };
  // Demo-only input gates — only active when isDemoSession is true
  private demoTutorialBlockDash = false;
  private demoTutorialBlockFire = false;
  private lastTransportErrorCode: string | null = null;
  private lastTransportErrorMessage: string | null = null;
  private stickyMatchPlayerOrder: string[] = [];
  private stickyDepartedPlayers = new Map<string, PlayerData>();
  private lastCombatSnapshotByPlayerId = new Map<
    string,
    {
      kills: number;
      state: "ACTIVE" | "EJECTED" | "SPECTATING";
      name: string;
    }
  >();

  private isStickyRosterPhase(phase: GamePhase = this.flowMgr.phase): boolean {
    return (
      phase === "MATCH_INTRO" ||
      phase === "COUNTDOWN" ||
      phase === "PLAYING" ||
      phase === "ROUND_END" ||
      phase === "GAME_END"
    );
  }

  private trackStickyConnectedPlayer(playerId: string): void {
    if (!this.stickyMatchPlayerOrder.includes(playerId)) {
      this.stickyMatchPlayerOrder.push(playerId);
    }
    this.stickyDepartedPlayers.delete(playerId);
  }

  private captureStickyDepartedPlayer(
    playerId: string,
    reason: "left" | "kicked",
  ): void {
    const current = this.playerMgr.players.get(playerId);
    if (!current) return;
    this.trackStickyConnectedPlayer(playerId);
    this.stickyDepartedPlayers.set(playerId, {
      ...current,
      presence: reason === "kicked" ? "KICKED" : "LEFT",
    });
  }

  private syncStickyRosterFromLivePlayers(): void {
    for (const player of this.playerMgr.getPlayers()) {
      this.trackStickyConnectedPlayer(player.id);
    }
  }

  private clearStickyRoster(): void {
    this.stickyMatchPlayerOrder = [];
    this.stickyDepartedPlayers.clear();
  }

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
        const myPlayerId = this.network.getMyPlayerId();
        const shouldToastJoin =
          this.flowMgr.phase !== "START" && playerId !== myPlayerId;
        this.playerMgr.addPlayer(
          playerId,
          playerIndex,
          this.flowMgr.phase,
          () => this.emitPlayersUpdate(),
          () => this.flowMgr.startCountdown(),
        );
        if (this.isStickyRosterPhase()) {
          this.trackStickyConnectedPlayer(playerId);
        }
        if (shouldToastJoin) {
          const joinedName =
            this.playerMgr.players.get(playerId)?.name ??
            this.network.getPlayerName(playerId) ??
            "Player";
          this._onSystemMessage?.(joinedName + " joined the room", 2200);
        }
        if (this.isLeader()) {
          this.broadcastModeState();
        }
      },

      onPlayerLeft: (playerId, reason) => {
        const myPlayerId = this.network.getMyPlayerId();
        const isSelfLeaving = myPlayerId !== null && playerId === myPlayerId;
        const shouldToastLeave =
          this.flowMgr.phase !== "START" && playerId !== myPlayerId;
        const leftName =
          this.playerMgr.players.get(playerId)?.name ??
          this.network.getPlayerName(playerId) ??
          "Player";
        if (isSelfLeaving && !this.isIntentionalDisconnect) {
          this.submitCurrentScoreOnSessionExit();
        }
        if (this.isStickyRosterPhase()) {
          this.captureStickyDepartedPlayer(playerId, reason);
        }
        this.playerPowerUps.delete(playerId);
        this.controlledInputSequenceByPlayer.delete(playerId);
        this.lastCombatSnapshotByPlayerId.delete(playerId);
        this.playerMgr.removePlayer(playerId, () => this.emitPlayersUpdate());
        if (shouldToastLeave) {
          this._onSystemMessage?.(
            reason === "kicked"
              ? leftName + " was kicked"
              : leftName + " left the room",
            2200,
          );
        }

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
          if (
            this.flowMgr.phase !== "MATCH_INTRO" &&
            this.flowMgr.phase !== "COUNTDOWN" &&
            this.flowMgr.phase !== "PLAYING" &&
            this.flowMgr.phase !== "ROUND_END"
          ) {
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
        const kickedByLeader = this.lastTransportErrorCode === "KICKED_BY_LEADER";
        const kickedMessage =
          this.lastTransportErrorMessage || "You were removed by the room leader";
        this.submitCurrentScoreOnSessionExit();
        if (!kickedByLeader) {
          this._onSystemMessage?.("Disconnected from room", 2500);
        }
        this.handleDisconnected();
        if (kickedByLeader) {
          this._onSystemMessage?.(kickedMessage, 3500);
        }
      },

      onGamePhaseReceived: (phase, winnerId, winnerName) => {
        console.log("[Game] Phase received:", phase);
        if (!this.network.isSimulationAuthority()) {
          const oldPhase = this.flowMgr.phase;
          if (oldPhase === phase) {
            return;
          }
          const shouldForceRosterSync =
            phase === "MATCH_INTRO" ||
            phase === "COUNTDOWN" ||
            phase === "PLAYING";
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
            phase === "MATCH_INTRO" &&
            (oldPhase === "LOBBY" || oldPhase === "GAME_END")
          ) {
            console.log("[Game] Non-host: match intro starting, clearing old state");
            this.finalScoreSubmittedForMatch = false;
            if (oldPhase === "GAME_END") {
              this.flowMgr.winnerId = null;
              this.flowMgr.winnerName = null;
              this.resetPlayersForNewSequence();
              this.clearStickyRoster();
            }
            this.resetForNextRound();
            this.networkSync.clearNetworkEntities();
          }

          if (
            phase === "COUNTDOWN" &&
            (oldPhase === "ROUND_END" ||
              oldPhase === "LOBBY" ||
              oldPhase === "GAME_END")
          ) {
            console.log(
              "[Game] Non-host: new round starting, clearing old state",
            );
            this.finalScoreSubmittedForMatch = false;
            if (oldPhase === "GAME_END") {
              this.flowMgr.winnerId = null;
              this.flowMgr.winnerName = null;
              this.resetPlayersForNewSequence();
              this.clearStickyRoster();
            }
            this.resetForNextRound();
            this.networkSync.clearNetworkEntities();
          }
          if (phase === "MATCH_INTRO" || phase === "COUNTDOWN") {
            this.syncStickyRosterFromLivePlayers();
          }
          if (phase === "LOBBY" && oldPhase !== "LOBBY") {
            this.clearStickyRoster();
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
          if (this.isStickyRosterPhase()) {
            this.syncStickyRosterFromLivePlayers();
          }
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

      onRulesetReceived: (ruleset) => {
        if (this.currentRuleset === ruleset) return;
        this.currentRuleset = ruleset;
        if (
          !isMapAllowedForContext(
            this.selectedMapId,
            this.currentRuleset,
            this.currentExperienceContext,
          )
        ) {
          this.selectedMapId = 0;
          this._onMapChange?.(this.selectedMapId);
        }
        this._onRulesetChange?.(ruleset);
      },

      onExperienceContextReceived: (context) => {
        this.currentExperienceContext = context;
        if (
          !isMapAllowedForContext(
            this.selectedMapId,
            this.currentRuleset,
            this.currentExperienceContext,
          )
        ) {
          this.selectedMapId = 0;
          this._onMapChange?.(this.selectedMapId);
        }
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
        if (
          payload.kind === "ship" &&
          this.shouldSuppressLocalDashParticles(payload.playerId)
        ) {
          return;
        }
        if (payload.kind === "pilot") {
          this.effects.spawnPilotDashBurstParticles(
            payload.x,
            payload.y,
            payload.angle,
            payload.color,
          );
        } else {
          this.effects.spawnDashParticles(
            payload.x,
            payload.y,
            payload.angle,
            payload.color,
          );
        }
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
        if (code === "KICKED_BY_LEADER") {
          // Show kicked toast after disconnect transition so START screen change
          // does not immediately clear the message.
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
    this.clearStickyRoster();

    this.flowMgr.setPhase("LOBBY");
  }

  private handleLocalDash(): void {
    if (this.network.isSimulationAuthority()) {
      // In local/demo mode the host IS the simulation authority. Still track
      // the dash for tutorial counting (but don't send any network request).
      if (this.isDemoSession && !this.demoTutorialBlockDash) {
        this._onLocalInputAction?.("dash");
      }
      return;
    }

    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    if (!this.canRunLocalShipAction(myPlayerId)) return;

    // Demo tutorial gate — block dash during steps that restrict it
    if (this.isDemoSession && this.demoTutorialBlockDash) return;

    // Emit dash action for tutorial tracking
    this._onLocalInputAction?.("dash");

    if (this.network.getTransportMode() !== "online") {
      this.network.sendDashRequest();
      return;
    }

    if (NETWORK_GAME_FEEL_TUNING.predictedLocalActionCosmetics.dash) {
      this.networkSync.triggerLocalDashPrediction(myPlayerId);
      playPredictedDashFeedback();
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
    this.clearStickyRoster();
    this.lastCombatSnapshotByPlayerId.clear();
    this.previousLocalInputButtons.buttonA = false;
    this.previousLocalInputButtons.buttonB = false;
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
    this.currentRuleset = "ROUND_ELIMINATION";
    this.currentExperienceContext = "LIVE_MATCH";
    this.advancedSettings = applyModeTemplate(this.baseMode);
    this._onGameModeChange?.(this.currentMode);
    this._onRulesetChange?.(this.currentRuleset);
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

  private resetPlayersForNewSequence(): void {
    let changed = false;
    for (const player of this.playerMgr.players.values()) {
      if (player.roundWins !== 0) {
        player.roundWins = 0;
        changed = true;
      }
      if (player.state !== "ACTIVE") {
        player.state = "ACTIVE";
        changed = true;
      }
    }
    if (changed) {
      this.emitPlayersUpdate();
    }
  }

  start(): void {
    this.resizeHandler();

    if (!this.resizeListenerAttached) {
      window.addEventListener("resize", this.resizeHandler);
      this.resizeListenerAttached = true;
    }

    this.ensureLoopLifecycleHooks();
    this.startLoop();
  }

  handleResize(): void {
    this.resizeHandler();
  }

  private ensureLoopLifecycleHooks(): void {
    if (this.lifecycleHandlersAttached) {
      return;
    }
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    this.offPlatformPause = onPlatformPause(() => {
      this.network.pauseSimulation(true);
      this.stopLoop();
    });
    this.offPlatformResume = onPlatformResume(() => {
      this.network.pauseSimulation(this.simulationPaused);
      this.startLoop();
    });
    this.lifecycleHandlersAttached = true;
  }

  private startLoop(): void {
    if (this.rafId !== 0) {
      return;
    }
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this.loopFrame);
  }

  private stopLoop(): void {
    if (this.rafId === 0) {
      return;
    }
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private loop(timestamp: number): void {
    const frameDt =
      this.lastTime > 0 ? Math.min((timestamp - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = timestamp;

    const now = performance.now();
    let localInput: PlayerInput = {
      buttonA: false,
      buttonB: false,
      timestamp: now,
      clientTimeMs: now,
      inputSequence: 0,
    };
    if (!this.simulationPaused) {
      localInput = this.inputResolver.captureLocalInput(
        now,
        this.botMgr.useTouchForHost,
      );
      // Demo tutorial gate — mask fire button if restricted during this step
      if (this.isDemoSession && this.demoTutorialBlockFire && localInput.buttonB) {
        localInput.buttonB = false;
        this.inputResolver.maskButtonB();
      }
      this.emitLocalInputActions(localInput);
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
    } else {
      this.previousLocalInputButtons.buttonA = false;
      this.previousLocalInputButtons.buttonB = false;
      this.wasLocalFireHeld = false;
    }

    const frameRenderState = this.networkSync.getRenderState(
      this.network.getMyPlayerId(),
      this.latencyMs,
      {
        disableExtrapolation: this.network.getTransportMode() === "local",
      },
    );

    if (this.flowMgr.phase === "PLAYING") {
      this.processDevPowerUpRequests();
      this.updateVisualEffects(frameRenderState);
    }

    this.effects.updateParticles(frameDt);
    this.renderer.updateScreenShake(frameDt);
    this.render(frameDt, frameRenderState);

    this.rafId = requestAnimationFrame(this.loopFrame);
  }

  private emitLocalInputActions(input: PlayerInput): void {
    if (input.buttonA && !this.previousLocalInputButtons.buttonA) {
      this._onLocalInputAction?.("rotate");
    }
    if (input.buttonB && !this.previousLocalInputButtons.buttonB) {
      this._onLocalInputAction?.("fire");
    }
    this.previousLocalInputButtons.buttonA = input.buttonA;
    this.previousLocalInputButtons.buttonB = input.buttonB;
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
    playPredictedFireFeedback();
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
    playAuthoritativeGameSound(type);
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
    this.processCombatToastsFromMeta(meta);
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

  private processCombatToastsFromMeta(meta: PlayerMetaMap): void {
    const isCombatPhase =
      this.flowMgr.phase === "PLAYING" || this.flowMgr.phase === "ROUND_END";
    const killerBudgetById = new Map<string, number>();
    const spectatingVictimIds: string[] = [];
    const nextKnownIds = new Set<string>();

    for (const [playerId, networkMeta] of meta) {
      nextKnownIds.add(playerId);
      const nextKills = Number.isFinite(networkMeta.kills)
        ? Math.floor(networkMeta.kills as number)
        : 0;
      const nextState =
        networkMeta.playerState === "ACTIVE" ||
        networkMeta.playerState === "EJECTED" ||
        networkMeta.playerState === "SPECTATING"
          ? networkMeta.playerState
          : "ACTIVE";
      const nextName =
        networkMeta.customName ??
        networkMeta.profileName ??
        this.playerMgr.players.get(playerId)?.name ??
        this.network.getPlayerName(playerId) ??
        "Player";

      const prev = this.lastCombatSnapshotByPlayerId.get(playerId);
      if (isCombatPhase && prev) {
        const killsDelta = nextKills - prev.kills;
        if (killsDelta > 0) {
          killerBudgetById.set(
            playerId,
            (killerBudgetById.get(playerId) ?? 0) + killsDelta,
          );
        }
        if (prev.state !== "SPECTATING" && nextState === "SPECTATING") {
          spectatingVictimIds.push(playerId);
        }
      }

      this.lastCombatSnapshotByPlayerId.set(playerId, {
        kills: nextKills,
        state: nextState,
        name: nextName,
      });
    }

    for (const playerId of [...this.lastCombatSnapshotByPlayerId.keys()]) {
      if (!nextKnownIds.has(playerId)) {
        this.lastCombatSnapshotByPlayerId.delete(playerId);
      }
    }

    if (!isCombatPhase || spectatingVictimIds.length <= 0) {
      return;
    }

    for (const victimId of spectatingVictimIds) {
      const victimName =
        this.lastCombatSnapshotByPlayerId.get(victimId)?.name ?? "Player";
      let killerId: string | null = null;
      for (const [candidateId, budget] of killerBudgetById) {
        if (budget <= 0) continue;
        if (candidateId === victimId) continue;
        killerId = candidateId;
        killerBudgetById.set(candidateId, budget - 1);
        break;
      }

      if (killerId) {
        const killerName =
          this.lastCombatSnapshotByPlayerId.get(killerId)?.name ?? "Player";
        this._onSystemMessage?.(killerName + " > " + victimName, 1800);
      } else {
        this._onSystemMessage?.(victimName + " was eliminated", 1800);
      }
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

  private getLocalHumanParticipantCountForScorePolicy(): number {
    let humanCount = 0;
    const playerIds = this.network.getPlayerIds();
    for (const playerId of playerIds) {
      const botType = this.network.getPlayerBotType(playerId);
      const isHumanParticipant =
        !this.network.isPlayerBot(playerId) || botType === "local";
      if (isHumanParticipant) {
        humanCount += 1;
      }
    }
    return humanCount;
  }

  private isLocalSingleHumanSessionForScorePolicy(): boolean {
    return this.getLocalHumanParticipantCountForScorePolicy() === 1;
  }

  private updateVisualEffects(renderState: RenderNetworkState): void {
    renderState.networkShips.forEach((shipState) => {
      const joustPowerUp = this.playerPowerUps.get(shipState.playerId);
      if (joustPowerUp?.type === "JOUST") {
        const tailPoint = getShipTrailWorldPoint(shipState);
        const tailX = tailPoint.x;
        const tailY = tailPoint.y;
        const color = this.nitroColorIndex++ % 5 < 3 ? "#ff6600" : "#ffee00";
        this.effects.spawnNitroParticle(tailX, tailY, color);
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
    const adaptiveCameraState = this.adaptiveCamera.update({
      dt,
      nowMs: this.networkSync.hostSimTimeMs,
      phase: this.flowMgr.phase,
      anchors: this.collectAdaptiveCameraAnchors(renderState),
    });

    // Cache local player's ship world position for overlay positioning
    const myId = this.network.getMyPlayerId();
    const myShip = myId
      ? renderState.networkShips.find((s) => s.playerId === myId)
      : undefined;
    if (myShip) {
      this.cachedLocalShipWorldPos = { x: myShip.x, y: myShip.y };
    }

    // Apply demo zoom boost and smoothly blend focus from local ship back
    // to adaptive camera as the boost returns to 1.
    const zoomMultiplier = this.demoZoomBoost ?? 1;
    const introFocusCurve = Math.max(0, Math.min(1, (zoomMultiplier - 1) / 0.34));
    const introFocusBlend =
      introFocusCurve * introFocusCurve * (3 - 2 * introFocusCurve);
    const focusX = myShip
      ? adaptiveCameraState.focusX +
        (myShip.x - adaptiveCameraState.focusX) *
          (this.demoZoomBoost !== null ? introFocusBlend : 0)
      : adaptiveCameraState.focusX;
    const focusY = myShip
      ? adaptiveCameraState.focusY +
        (myShip.y - adaptiveCameraState.focusY) *
          (this.demoZoomBoost !== null ? introFocusBlend : 0)
      : adaptiveCameraState.focusY;
    this.renderer.setCamera(
      adaptiveCameraState.zoom * zoomMultiplier,
      focusX,
      focusY,
    );

    this.gameRenderer.render({
      dt,
      nowMs: this.networkSync.hostSimTimeMs,
      phase: this.flowMgr.phase,
      countdown: this.flowMgr.countdown,
      showMapElements: this.showMapElements,
      hideBorder: this.hideBorder,
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
      rotationDirection: renderState.networkRotationDirection,
      yellowBlockHp: renderState.networkYellowBlockHp,
      networkLaserBeamWidth: renderState.networkLaserBeamWidth,
    });
  }

  getPhase(): GamePhase {
    return this.flowMgr.phase;
  }

  getPlayers(): PlayerData[] {
    const livePlayers = this.playerMgr.getPlayers().map((player) => ({
      ...player,
      presence: "CONNECTED" as const,
    }));
    if (!this.isStickyRosterPhase()) {
      return livePlayers;
    }

    if (this.stickyMatchPlayerOrder.length <= 0) {
      return livePlayers;
    }

    const liveById = new Map<string, PlayerData>();
    for (const player of livePlayers) {
      liveById.set(player.id, player);
    }

    const merged: PlayerData[] = [];
    for (const playerId of this.stickyMatchPlayerOrder) {
      const live = liveById.get(playerId);
      if (live) {
        merged.push(live);
        continue;
      }
      const departed = this.stickyDepartedPlayers.get(playerId);
      if (departed) {
        merged.push({ ...departed });
      }
    }
    return merged;
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

  showSystemMessage(message: string, durationMs: number = 2500): void {
    this._onSystemMessage?.(message, durationMs);
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

  setRuleset(
    ruleset: Ruleset,
    source: "local" | "remote" = "local",
  ): void {
    if (source === "local" && !this.isLeader()) return;
    if (this.flowMgr.phase !== "LOBBY") return;
    if (this.currentRuleset === ruleset) return;

    this.currentRuleset = ruleset;
    if (
      !isMapAllowedForContext(
        this.selectedMapId,
        this.currentRuleset,
        this.currentExperienceContext,
      )
    ) {
      this.selectedMapId = 0;
      this._onMapChange?.(this.selectedMapId);
    }

    if (source === "local" && this.isLeader()) {
      this.network.setRuleset(ruleset);
      this.network.setMap(this.selectedMapId);
    }
    this._onRulesetChange?.(ruleset);
  }

  getRuleset(): Ruleset {
    return this.currentRuleset;
  }

  getExperienceContext(): ExperienceContext {
    return this.currentExperienceContext;
  }

  setExperienceContext(context: ExperienceContext): void {
    this.currentExperienceContext = context;
    this.network.setExperienceContext(context);
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
    if (
      !isMapAllowedForContext(
        mapId,
        this.currentRuleset,
        this.currentExperienceContext,
      )
    ) {
      console.log("[Game] setMap ignored: map not allowed for ruleset");
      this._onSystemMessage?.("Map not available for selected ruleset", 2500);
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
    if (
      !isMapAllowedForContext(
        this.selectedMapId,
        this.currentRuleset,
        this.currentExperienceContext,
      )
    ) {
      this.selectedMapId = 0;
      this._onMapChange?.(this.selectedMapId);
    }
    this.network.setRuleset(this.currentRuleset);
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
      this.submitCurrentScoreOnSessionExit();
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
    this.stopLoop();
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    if (this.resizeListenerAttached) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeListenerAttached = false;
    }
    if (this.lifecycleHandlersAttached) {
      document.removeEventListener(
        "visibilitychange",
        this.visibilityChangeHandler,
      );
      this.offPlatformPause?.();
      this.offPlatformPause = null;
      this.offPlatformResume?.();
      this.offPlatformResume = null;
      this.lifecycleHandlersAttached = false;
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

  async continueMatchSequence(): Promise<void> {
    if (!this.isLeader()) {
      console.log(
        "[Game] Non-leader cannot continue sequence, waiting for leader",
      );
      return;
    }
    this.network.continueMatchSequence();
  }

  endMatch(): void {
    if (!this.isLeader()) {
      this._onSystemMessage?.("Only the room leader can do that", 2500);
      return;
    }
    if (this.currentRuleset !== "ENDLESS_RESPAWN") {
      return;
    }
    if (this.flowMgr.phase !== "PLAYING") {
      return;
    }
    this.network.endMatch();
  }

  setPlayerName(name: string): void {
    this.network.setCustomName(name);
  }

  setMapElementsVisible(visible: boolean): void {
    this.showMapElements = visible;
  }

  setHideBorder(hidden: boolean): void {
    this.hideBorder = hidden;
  }

  /** Multiplies the adaptive camera zoom by `boost` (e.g. 2.0) or clears with null. */
  setDemoZoomBoost(boost: number | null): void {
    this.demoZoomBoost = boost;
  }

  /** Returns the CSS viewport position of the local player's ship, or null if unknown. */
  getLocalShipViewportPos(): { x: number; y: number } | null {
    if (!this.cachedLocalShipWorldPos) return null;
    return this.renderer.worldToViewportCSS(
      this.cachedLocalShipWorldPos.x,
      this.cachedLocalShipWorldPos.y,
    );
  }

  setDemoSession(active: boolean): void {
    this.isDemoSession = active;
    this.network.setDemoMode(active);
    this.setExperienceContext(active ? "ATTRACT_BACKGROUND" : "LIVE_MATCH");
    if (active) {
      this.currentRuleset = "ENDLESS_RESPAWN";
      this._onRulesetChange?.(this.currentRuleset);
    }
    if (!active) {
      // Always clear tutorial gates when leaving demo
      this.demoTutorialBlockDash = false;
      this.demoTutorialBlockFire = false;
      this.simulationPaused = false;
    }
  }

  /**
   * Demo-only: block specific actions from registering in-game during tutorial steps.
   * Has no effect when isDemoSession is false.
   */
  setDemoInputBlock(blocked: { dash: boolean; fire: boolean }): void {
    if (!this.isDemoSession) return;
    this.demoTutorialBlockDash = blocked.dash;
    this.demoTutorialBlockFire = blocked.fire;
  }

  isDemoMode(): boolean {
    return this.isDemoSession;
  }

  setHostAI(enabled: boolean): void {
    const myId = this.network.getMyPlayerId();
    if (myId) this.network.setPlayerAI(myId, enabled);
  }

  skipDemoCountdown(): void {
    this.network.skipCountdown();
  }

  setSimPaused(paused: boolean): void {
    this.simulationPaused = paused;
    this.network.pauseSimulation(document.hidden ? true : paused);
  }

  /** Freeze all non-host ships during tutorial action steps. Pass null to unfreeze. */
  setDemoBotFreeze(hostId: string | null): void {
    this.network.demoFreezeOthers(hostId);
  }

  demoRespawnPlayer(playerId: string): void {
    this.network.demoRespawnPlayer(playerId);
  }

  /** Demo-only: grant the local player's ship 5 s of invulnerability. */
  demoSetPlayerInvincible(durationMs: number): void {
    const myId = this.getMyPlayerId();
    if (!myId) return;
    this.network.demoSetPlayerInvincible(myId, durationMs);
  }

  demoCleanupStalePilots(maxAgeMs: number): void {
    this.network.demoCleanupStalePilots(maxAgeMs);
  }

  setSessionMode(mode: "online" | "local"): void {
    this.network.setTransportMode(mode);
    this.network.setDemoMode(this.isDemoSession);
    this.setExperienceContext(
      this.isDemoSession ? "ATTRACT_BACKGROUND" : "LIVE_MATCH",
    );
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

  setDebugPhysicsTuning(payload: DebugPhysicsTuningPayload | null): boolean {
    const blockedMessage = this.getDebugToolsBlockedMessage();
    if (blockedMessage) {
      this._onSystemMessage?.(blockedMessage, 2500);
      return false;
    }
    if (this.network.getTransportMode() !== "local") {
      this._onSystemMessage?.(
        "Physics lab is available in local mode only",
        3000,
      );
      return false;
    }
    this.network.setDebugPhysicsTuning(payload);
    return true;
  }

  getDebugPhysicsTuningSnapshot(): DebugPhysicsTuningSnapshot | null {
    return this.network.getDebugPhysicsTuningSnapshot();
  }

  getShipTrailVisualTuning(): ShipTrailVisualTuning {
    return this.renderer.getShipTrailVisualTuning();
  }

  setShipTrailVisualTuning(payload: Partial<ShipTrailVisualTuning>): void {
    this.renderer.setShipTrailVisualTuning(payload);
  }

  resetShipTrailVisualTuning(): void {
    this.renderer.resetShipTrailVisualTuning();
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
    if (!this.shouldSubmitScoreNow(hasEligibleLobbyBot)) {
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

    const score = this.resolveScoreForSubmission(myId);

    submitPlatformScore(score);
    console.log("[Game] Submitted authoritative final score:", score);
    this.finalScoreSubmittedForMatch = true;
  }

  private submitCurrentScoreOnSessionExit(): void {
    if (this.network.isSimulationAuthority()) return;
    if (this.finalScoreSubmittedForMatch) return;
    if (!this.isStickyRosterPhase()) return;

    const myId = this.network.getMyPlayerId();
    if (!myId) return;

    const hasEligibleLobbyBot =
      this.lobbyHasEligibleScoreBot ||
      this.hasEligibleScoreBotInCurrentRoster();
    if (!this.shouldSubmitScoreNow(hasEligibleLobbyBot)) {
      return;
    }

    const score = this.resolveScoreForSubmission(myId);

    submitPlatformScore(score);
    this.finalScoreSubmittedForMatch = true;
    console.log("[Game] Submitted exit score:", score);
  }

  private shouldSubmitScoreNow(hasEligibleLobbyBot: boolean): boolean {
    if (this.isDemoSession) return false;
    if (this.currentExperienceContext !== "LIVE_MATCH") return false;
    if (
      this.network.getTransportMode() === "local" &&
      !this.isLocalSingleHumanSessionForScorePolicy()
    ) {
      return false;
    }
    return shouldSubmitScoreToPlatform(
      hasEligibleLobbyBot,
      this.debugSessionTainted,
      this.network.getTransportMode(),
    );
  }

  private resolveScoreForSubmission(playerId: string): number {
    const candidates: unknown[] = [
      this.roundResult?.scoresById?.[playerId],
      this.playerMgr.players.get(playerId)?.score,
      this.stickyDepartedPlayers.get(playerId)?.score,
      this.network.getPlayer(playerId)?.getState("score"),
    ];
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate as number)) continue;
      return Math.max(0, Math.floor(candidate as number));
    }
    return 0;
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

